// Ported from the Supabase Edge Function `industrialpedia-crawler-discover-v1` (v27,
// "industrialpedia-map-v1-relative-depth-bulk"): generic deterministic web crawler — robots.txt
// (own simple prefix-based parser, kept as-is rather than swapped for robots.ts's
// npm:robots-parser to preserve exact production behavior), sitemap traversal, link
// extraction, scope/depth/path filtering. Today only Festo uses it (via
// festo_firecrawl_discovery_tick_v1 on a 12h cron), but it's source-agnostic.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

const VERSION = "industrialpedia-map-v1-relative-depth-bulk-vps-port";
const UA = "IndustrialpediaBot/1.1 (+https://industrialpedia.app/bot-info)";
const clean = (x: unknown) => String(x ?? "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function norm(raw: string, base?: string): string | null {
  try {
    const u = new URL(raw, base);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    u.hash = ""; u.username = ""; u.password = "";
    if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) u.port = "";
    return u.toString();
  } catch { return null; }
}
function skip(u: string): boolean {
  try { return /\.(?:jpg|jpeg|png|gif|webp|svg|ico|mp4|webm|mov|avi|zip|rar|7z|tar|gz|css|js|mjs|woff2?|ttf|otf|eot)$/i.test(new URL(u).pathname); }
  catch { return true; }
}
function isPdf(u: string): boolean {
  try { return /\.pdf(?:$|\?)/i.test(new URL(u).pathname); } catch { return false; }
}
function scope(u: string, root: string, sub: boolean): boolean {
  try {
    const a = new URL(u), b = new URL(root), ah = a.hostname.toLowerCase(), bh = b.hostname.toLowerCase();
    return ah === bh || (sub && ah.endsWith(`.${bh}`));
  } catch { return false; }
}
function relativeDepth(u: string, root: string): number {
  try {
    const p = new URL(u).pathname.split("/").filter(Boolean), r = new URL(root).pathname.split("/").filter(Boolean);
    for (let i = 0; i < r.length; i++) if (p[i] !== r[i]) return -1;
    return Math.max(0, p.length - r.length);
  } catch { return -1; }
}
function pathOk(u: string, inc: string[], exc: string[]): boolean {
  try {
    const p = new URL(u).pathname;
    for (const x of exc) try { if (new RegExp(x).test(p)) return false; } catch { /* ignore bad regex */ }
    return !inc.length || inc.some((x) => { try { return new RegExp(x).test(p); } catch { return false; } });
  } catch { return false; }
}
function links(html: string, base: string): string[] {
  const r: string[] = [];
  const re = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) { const u = norm(m[2], base); if (u) r.push(u); }
  return [...new Set(r)];
}
function sitemapRefs(xml: string): { urls: string[]; maps: string[] } {
  const urls: string[] = [], maps: string[] = [];
  const re = /<loc[^>]*>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const u = clean(m[1]).trim();
    if (!u) continue;
    if (/\.xml(?:\.gz)?(?:$|\?)/i.test(u)) maps.push(u); else urls.push(u);
  }
  return { urls: [...new Set(urls)], maps: [...new Set(maps)] };
}
function robotsParse(t: string): { disallow: string[]; allow: string[]; crawlDelayMs: number | null } {
  let star = false, dis: string[] = [], allow: string[] = [], delay: number | null = null;
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "user-agent") star = v === "*" || v.toLowerCase().includes("industrialpedia");
    else if (star && k === "disallow" && v) dis.push(v);
    else if (star && k === "allow" && v) allow.push(v);
    else if (star && k === "crawl-delay" && /^\d+(?:\.\d+)?$/.test(v)) delay = Math.round(Number(v) * 1000);
  }
  return { disallow: dis, allow, crawlDelayMs: delay };
}
function robotsOk(u: string, r: { disallow: string[]; allow: string[] }): boolean {
  try {
    const p = new URL(u).pathname || "/";
    const a = r.allow.filter((x) => p.startsWith(x)).sort((x, y) => y.length - x.length)[0] || "";
    const d = r.disallow.filter((x) => p.startsWith(x)).sort((x, y) => y.length - x.length)[0] || "";
    return !d || a.length >= d.length;
  } catch { return false; }
}
async function fetchText(u: string, timeout = 15000) {
  try {
    const host = new URL(u).hostname.toLowerCase();
    const init: RequestInit = { redirect: "follow", signal: AbortSignal.timeout(timeout) };
    if (host !== "ftp.festo.com") init.headers = { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.5" };
    const r = await fetch(u, init);
    return { ok: r.ok, status: r.status, url: r.url || u, contentType: r.headers.get("content-type") || "", text: await r.text(), error: null as string | null };
  } catch (e) {
    return { ok: false, status: null, url: u, contentType: "", text: "", error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}
async function getRobots(root: string) {
  const u = new URL(root);
  const r = await fetchText(`${u.protocol}//${u.host}/robots.txt`, 7000);
  if (r.status !== null && r.status >= 400) return { status: "not_present", ...robotsParse(""), httpStatus: r.status, error: r.error };
  if (r.error) return { status: "unavailable", disallow: [], allow: [], crawlDelayMs: null, httpStatus: null, error: r.error };
  return { status: "fetched", ...robotsParse(r.text), httpStatus: r.status, error: null };
}
async function getSitemaps(root: string, limit: number, rr: { disallow: string[]; allow: string[] }) {
  const queue = [`${new URL(root).origin}/sitemap.xml`], seen = new Set<string>(), urls: string[] = [], hits: string[] = [], errors: any[] = [];
  while (queue.length && seen.size < 25 && urls.length < limit) {
    const s = queue.shift()!;
    if (seen.has(s)) continue;
    seen.add(s);
    hits.push(s);
    const r = await fetchText(s, 12000);
    if (r.error) { errors.push({ url: s, error: r.error }); continue; }
    if (!r.ok) continue;
    const p = sitemapRefs(r.text);
    for (const raw of p.urls) {
      const u = norm(raw);
      if (u && scope(u, root, true) && !skip(u) && robotsOk(u, rr)) urls.push(u);
      if (urls.length >= limit) break;
    }
    for (const raw of p.maps) { const u = norm(raw, s); if (u && !seen.has(u)) queue.push(u); }
  }
  return { urls: [...new Set(urls)].slice(0, limit), hits, errors };
}

export type CrawlerDiscoverInput = {
  url?: string; source_key?: string; limit?: number; max_depth?: number;
  include_subdomains?: boolean; persist?: boolean; include_paths?: string[]; exclude_paths?: string[];
};

export async function runCrawlerDiscover(sb: SupabaseClient, b: CrawlerDiscoverInput) {
  const sourceKey = clean(b.source_key).trim();
  let src: any = null, seed = clean(b.url).trim();
  if (sourceKey) {
    const { data, error } = await sb.from("ingestion_sources").select("id,source_key,source_name,enabled,fetch_url,config").eq("source_key", sourceKey).maybeSingle();
    if (error || !data) return { error: "source_not_found" };
    if (!data.enabled) return { error: "source_disabled" };
    src = data;
    seed = seed || clean(data.config?.start_urls?.[0]).trim() || clean(data.fetch_url).trim();
  }
  seed = norm(seed) || "";
  if (!seed) return { error: "url_or_source_key_required" };

  const limit = Math.max(1, Math.min(Number.isInteger(b.limit) ? b.limit! : 250, 1000));
  const maxDepth = Math.max(0, Math.min(Number.isInteger(b.max_depth) ? b.max_depth! : 5, 20));
  const sub = b.include_subdomains === true;
  const persist = b.persist === true;
  const cfg = src?.config || {};
  const inc = Array.isArray(b.include_paths) ? b.include_paths.map(clean).filter(Boolean) : Array.isArray(cfg.map_include_paths) ? cfg.map_include_paths : [];
  const exc = Array.isArray(b.exclude_paths) ? b.exclude_paths.map(clean).filter(Boolean) : Array.isArray(cfg.map_exclude_paths) ? cfg.map_exclude_paths : [];

  const ins = await sb.from("crawler_runs_v1").insert({ domain: new URL(seed).hostname, status: "running", robots_txt_fetched: false, robots_disallow_rules: [], crawl_delay_ms: null, pdfs_discovered: 0 }).select("id").single();
  if (ins.error || !ins.data) return { error: "crawler_run_create_failed", detail: ins.error?.message };
  const runId = ins.data.id;

  try {
    const rr = await getRobots(seed);
    await sb.from("crawler_runs_v1").update({
      robots_txt_fetched: rr.status === "fetched",
      robots_disallow_rules: { disallow: rr.disallow, allow: rr.allow, http_status: rr.httpStatus, status: rr.status, error: rr.error || null },
      crawl_delay_ms: rr.crawlDelayMs,
    }).eq("id", runId);
    if (rr.status === "unavailable") {
      await sb.from("crawler_runs_v1").update({ status: "error", error_message: `robots:${rr.error}`, finished_at: new Date().toISOString() }).eq("id", runId);
      return { status: "error", run_id: runId, stage: "robots", error: rr.error };
    }

    const map = new Map<string, { url: string; source_page_url: string; origin: string; depth: number }>();
    const frontier: { url: string; source_page_url: string; origin: string; depth: number }[] = [];
    const queued = new Set<string>();
    const add = (raw: string, page: string, origin: string) => {
      const u = norm(raw, page), d = u ? relativeDepth(u, seed) : -1;
      if (!u || skip(u) || !scope(u, seed, sub) || !pathOk(u, inc, exc) || !robotsOk(u, rr) || d < 0 || d > maxDepth || map.has(u)) return false;
      const item = { url: u, source_page_url: page, origin, depth: d };
      map.set(u, item);
      frontier.push(item);
      queued.add(u);
      return true;
    };
    add(seed, seed, "seed");

    const sitemapUsed = await getSitemaps(seed, limit, rr);
    for (const u of sitemapUsed.urls) { if (map.size >= limit) break; add(u, seed, "sitemap"); }

    let requests = 0;
    const fetchErrors: any[] = [];
    const consume = (text: string, base: string) => {
      for (const l of links(text, base)) { if (map.size >= limit) break; if (!queued.has(l)) add(l, base, "internal_link"); }
    };
    if (!isPdf(seed)) {
      const r = await fetchText(seed);
      if (r.error) fetchErrors.push({ url: seed, error: r.error }); else { requests++; consume(r.text, r.url); }
    }
    for (let i = 1; i < frontier.length && map.size < limit; i++) {
      const item = frontier[i];
      if (isPdf(item.url)) continue;
      if (sitemapUsed.hits.length > 0 && item.origin === "sitemap") continue;
      if (rr.crawlDelayMs) await sleep(rr.crawlDelayMs);
      const r = await fetchText(item.url);
      if (r.error) { fetchErrors.push({ url: item.url, error: r.error }); continue; }
      requests++;
      consume(r.text, r.url);
    }

    const rows = [...map.values()].slice(0, limit);
    const pdfRows = rows.filter((x) => isPdf(x.url));
    let persistedRows = 0, mat: any = null;
    if (persist && src) {
      const { data: pr, error: pe } = await sb.rpc("industrialpedia_persist_map_urls_v1", { p_run_id: runId, p_rows: rows });
      if (pe) throw new Error(JSON.stringify(pe));
      persistedRows = Number(pr?.persisted || 0);
      const { data: mr, error: me } = await sb.rpc("industrialpedia_materialize_map_pdfs_v1", { p_source_id: src.id, p_run_id: runId, p_rows: rows });
      if (me) throw new Error(JSON.stringify(me));
      mat = mr;
    }

    await sb.from("crawler_runs_v1").update({
      status: "completed", pdfs_discovered: pdfRows.length, finished_at: new Date().toISOString(),
      error_message: fetchErrors.length ? JSON.stringify(fetchErrors.slice(0, 5)) : null,
    }).eq("id", runId);

    return {
      status: "completed", provider: "industrialpedia", operation: "map", version: VERSION, run_id: runId,
      source_key: sourceKey || null, seed, limit, max_depth: maxDepth, discovered_count: rows.length,
      persisted_discovered_rows: persistedRows, sitemap_hits: sitemapUsed.hits.length, sitemap_errors: sitemapUsed.errors,
      fetch_errors: fetchErrors.slice(0, 20), pdfs_discovered: pdfRows.length, persisted: persist,
      persisted_records: mat?.ingestion_records || 0, queued_records: mat?.queued || 0, ingestion_job_id: mat?.job_id || null,
      requests_made: requests, deterministic: true, ai_used: false, external_discovery_provider: false, urls: rows,
    };
  } catch (e) {
    await sb.from("crawler_runs_v1").update({ status: "error", error_message: e instanceof Error ? e.message : JSON.stringify(e), finished_at: new Date().toISOString() }).eq("id", runId);
    return { status: "error", version: VERSION, run_id: runId, error: e instanceof Error ? e.message : JSON.stringify(e), deterministic: true, ai_used: false };
  }
}
