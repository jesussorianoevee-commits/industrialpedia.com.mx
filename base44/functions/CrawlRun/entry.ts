import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { normalizeUrl, isAllowedDomain, isPathAllowed, matchesPatterns, detectType, isDocumentType, parseRobots, isRobotsAllowed, extractLinks, sha256 } from '../../shared/crawlerRules.js';

// Crawler responsable, determinístico, reanudable. Sin IA.
// Se identifica como crawler, respeta robots.txt, rate limit, backoff,
// deduplica por URL normalizada y hash de contenido, y se detiene ante bloqueos.
const UA = 'INDUSTRIALPEDIA-Crawler/1.0 (+responsible crawler; respects robots.txt; no AI)';
const BLOCK_THRESHOLD = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loadCP = (j) => { try { return JSON.parse(j.checkpoint || '{}'); } catch { return {}; } };

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const sourceId = body.source_id;
    if (!sourceId) return Response.json({ error: 'source_id required' }, { status: 400 });
    const dryRun = !!body.dry_run;
    const batchSize = Math.min(Math.max(parseInt(body.batch_size, 10) || 25, 1), 50);

    const source = await base44.asServiceRole.entities.CrawlSource.get(sourceId);
    if (!['approved', 'crawling', 'paused', 'completed'].includes(source.state)) {
      return Response.json({ error: `source not approved (state=${source.state}). Approve via CrawlSourceManage first.` }, { status: 400 });
    }

    // Job reanudable
    let job;
    const jobs = await base44.asServiceRole.entities.CrawlJob.filter({ source_id: sourceId }, '-updated_date', 1);
    if (jobs.length) job = jobs[0];
    if (!job) {
      job = await base44.asServiceRole.entities.CrawlJob.create({ source_id: sourceId, state: 'crawling', discovered: 0, accepted: 0, rejected: 0, documents: 0, errors: 0, http_403: 0, http_429: 0, limits_reached: false, duration_ms: 0, robots_checked: false, last_request_at: '' });
    }
    const cp = loadCP(job);

    // Dedup sets
    const existingUrls = new Set();
    const exUrls = await base44.asServiceRole.entities.CrawlURL.filter({ source_id: sourceId }, '-updated_date', 1000);
    exUrls.forEach((u) => existingUrls.add(u.url_normalized));
    const existingDocs = new Set();
    const exDocs = await base44.asServiceRole.entities.CrawlDocument.filter({ source_id: sourceId }, '-updated_date', 500);
    exDocs.forEach((d) => { if (d.content_hash) existingDocs.add(d.content_hash); });

    // robots.txt (una vez)
    let robots = null;
    if (!job.robots_checked) {
      try {
        const r = await fetch(`https://${source.domain}/robots.txt`, { headers: { 'User-Agent': UA } });
        if (r.ok) robots = parseRobots(await r.text());
      } catch {}
      if (!dryRun) await base44.asServiceRole.entities.CrawlJob.update(job.id, { robots_checked: true });
    }

    const stats = { discovered: job.discovered || 0, accepted: job.accepted || 0, rejected: job.rejected || 0, documents: job.documents || 0, errors: job.errors || 0, http_403: job.http_403 || 0, http_429: job.http_429 || 0 };
    let blockCount = cp.blockCount || 0;
    let lastRequestAt = job.last_request_at ? new Date(job.last_request_at).getTime() : 0;
    const start = Date.now();

    // Sembrar cola: seeds + sitemap (solo la primera vez)
    const memQueue = [];
    const pending0 = exUrls.filter((u) => u.state === 'pending');
    if (pending0.length === 0 && !cp.seeded) {
      const sitemapUrls = [];
      try {
        const sr = await fetch(`https://${source.domain}/sitemap.xml`, { headers: { 'User-Agent': UA } });
        if (sr.ok) {
          const xml = await sr.text();
          const re = /<loc>([^<]+)<\/loc>/gi; let m;
          while ((m = re.exec(xml))) sitemapUrls.push(m[1].trim());
        }
      } catch {}
      const toEnq = [...(source.seed_urls || []).map((u) => ({ url: u, origin: 'seed', depth: 0 })), ...sitemapUrls.map((u) => ({ url: u, origin: 'sitemap', depth: 0 }))];
      for (const e of toEnq) {
        const nu = normalizeUrl(e.url);
        if (existingUrls.has(nu)) continue;
        existingUrls.add(nu);
        memQueue.push({ id: null, url: e.url, url_normalized: nu, origin: e.origin, depth: e.depth, discovered_date: new Date().toISOString() });
        if (!dryRun) await base44.asServiceRole.entities.CrawlURL.create({ source_id: sourceId, url: e.url, url_normalized: nu, origin: e.origin, type_detected: detectType(e.url), depth: e.depth, state: 'pending', discovered_date: new Date().toISOString() });
      }
      stats.discovered += toEnq.length;
      cp.seeded = true;
    }

    const pending = dryRun ? memQueue.slice(0, batchSize) : (pending0.length ? pending0 : (await base44.asServiceRole.entities.CrawlURL.filter({ source_id: sourceId, state: 'pending' }, 'created_date', batchSize)).slice(0, batchSize));
    let processed = 0;

    for (const cu of pending) {
      // Reglas configuradas (dominio/path/patrones/profundidad/robots)
      const reasons = [];
      if (!isAllowedDomain(cu.url, source)) reasons.push('domain_not_allowed');
      if (!isPathAllowed(cu.url, source)) reasons.push('path_denied');
      if (!matchesPatterns(cu.url, source)) reasons.push('pattern_mismatch');
      if (robots && !isRobotsAllowed(cu.url, robots)) reasons.push('robots_disallowed');
      if (cu.depth > (source.max_depth ?? 2)) reasons.push('depth_exceeded');
      if (reasons.length) {
        stats.rejected++;
        if (!dryRun) await base44.asServiceRole.entities.CrawlURL.update(cu.id, { state: 'rejected', reject_reason: reasons.join(',') });
        continue;
      }

      // Rate limit conservador
      const now = Date.now();
      const wait = (source.rate_limit_ms || 1000) - (now - lastRequestAt);
      if (wait > 0) await sleep(wait);

      let resp;
      try {
        resp = await fetch(cu.url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/pdf,*/*' }, redirect: 'follow' });
      } catch (e) {
        stats.errors++;
        if (!dryRun) await base44.asServiceRole.entities.CrawlURL.update(cu.id, { state: 'failed', reject_reason: 'fetch_error' });
        continue;
      }
      lastRequestAt = Date.now();
      const status = resp.status;

      if (status === 403 || status === 429) {
        if (status === 403) stats.http_403++; else stats.http_429++;
        stats.errors++; blockCount++;
        if (!dryRun) await base44.asServiceRole.entities.CrawlURL.update(cu.id, { state: 'failed', reject_reason: 'http_' + status });
        await sleep((source.rate_limit_ms || 1000) * 3); // backoff
        if (blockCount >= BLOCK_THRESHOLD) {
          if (!dryRun) {
            await base44.asServiceRole.entities.CrawlSource.update(sourceId, { state: 'blocked' });
            await base44.asServiceRole.entities.CrawlJob.update(job.id, { state: 'blocked', ...stats, last_request_at: new Date(lastRequestAt).toISOString(), last_checkpoint: new Date().toISOString(), checkpoint: JSON.stringify({ ...cp, blockCount }) });
          }
          return Response.json({ blocked: true, reason: `repeated ${status} — source blocked, requiere revisión humana`, stats, dry_run: dryRun });
        }
        continue;
      }
      if (status >= 400) { stats.errors++; if (!dryRun) await base44.asServiceRole.entities.CrawlURL.update(cu.id, { state: 'failed', reject_reason: 'http_' + status }); continue; }

      stats.accepted++;
      const ct = resp.headers.get('content-type') || '';
      const type = detectType(cu.url, ct);
      const isDoc = isDocumentType(type, source) || type === 'pdf';

      if (isDoc) {
        const buf = await resp.arrayBuffer();
        const hash = await sha256(buf);
        if (existingDocs.has(hash)) {
          if (!dryRun) await base44.asServiceRole.entities.CrawlURL.update(cu.id, { state: 'downloaded', content_hash: hash, reject_reason: 'duplicate_hash' });
        } else {
          existingDocs.add(hash);
          stats.documents++;
          if (!dryRun) {
            await base44.asServiceRole.entities.CrawlDocument.create({ source_id: sourceId, url: cu.url, url_normalized: cu.url_normalized, type, title: (cu.url.split('/').pop() || cu.url).slice(0, 200), content_hash: hash, size: buf.byteLength, state: 'downloaded', origin: cu.origin, discovered_date: cu.discovered_date, download_date: new Date().toISOString(), ingested: false });
            await base44.asServiceRole.entities.CrawlURL.update(cu.id, { state: 'downloaded', content_hash: hash });
          }
        }
      } else if (ct.includes('text/html')) {
        const html = await resp.text();
        if (!dryRun) await base44.asServiceRole.entities.CrawlURL.update(cu.id, { state: 'fetched', type_detected: 'page' });
        if (cu.depth < (source.max_depth ?? 2)) {
          const links = extractLinks(cu.url, html);
          let added = 0;
          for (const l of links) {
            if (!isAllowedDomain(l, source) || !isPathAllowed(l, source)) continue;
            if (robots && !isRobotsAllowed(l, robots)) continue;
            const nu = normalizeUrl(l);
            if (existingUrls.has(nu)) continue;
            existingUrls.add(nu); added++;
            if (!dryRun) await base44.asServiceRole.entities.CrawlURL.create({ source_id: sourceId, url: l, url_normalized: nu, origin: 'internal_link', type_detected: detectType(l), depth: cu.depth + 1, state: 'pending', discovered_date: new Date().toISOString() });
          }
          stats.discovered += added;
        }
      } else if (!dryRun) {
        await base44.asServiceRole.entities.CrawlURL.update(cu.id, { state: 'fetched' });
      }
      processed++;

      if (stats.documents >= (source.max_documents || 5000)) { cp.limits_reached = true; break; }
      if (stats.accepted >= (source.max_pages || 10000)) { cp.limits_reached = true; break; }
    }

    const drained = pending.length < batchSize;
    let jobState = 'crawling', sourceState = 'crawling';
    if (cp.limits_reached) { jobState = 'paused'; sourceState = 'paused'; }
    else if (drained) { jobState = 'completed'; sourceState = 'downloaded'; }

    cp.blockCount = blockCount;
    const duration = (job.duration_ms || 0) + (Date.now() - start);
    if (!dryRun) {
      await base44.asServiceRole.entities.CrawlJob.update(job.id, { state: jobState, discovered: stats.discovered, accepted: stats.accepted, rejected: stats.rejected, documents: stats.documents, errors: stats.errors, http_403: stats.http_403, http_429: stats.http_429, limits_reached: !!cp.limits_reached, duration_ms: duration, checkpoint: JSON.stringify(cp), last_checkpoint: new Date().toISOString(), last_request_at: new Date(lastRequestAt).toISOString() });
      await base44.asServiceRole.entities.CrawlSource.update(sourceId, { state: sourceState });
    }

    return Response.json({
      source_id: sourceId, job_state: jobState, source_state: sourceState, dry_run: dryRun,
      batch_processed: processed, stats, resume: jobState === 'crawling',
      note: dryRun ? 'dry-run: nada persistido (verificación estructural)' : (jobState === 'completed' ? 'descubrimiento completado; documentos listos para Ingerir' : 'lote procesado; invoca de nuevo para continuar (reanudable)')
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}