// Ported from the Supabase Edge Function `industrialpedia-bearing-ntn-html-discovery-v6`
// (v3): paginates the NTN "deep groove ball bearings" catalog, validates each product page
// is really a single-row radial ball bearing with technical specs present, and queues it.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

const DOMAIN = "bearingfinder.ntnamericas.com";
const CATALOG_BASE = "https://bearingfinder.ntnamericas.com/viewitems/deep-groove-ball-bearings/single-row-radial-ball-bearings";
const FAMILY_CODE = "deep_groove_ball_bearing";
const DISCOVERY_METHOD = "verified_ntn_category_pagination_v6";

function extractItemLinks(html: string, base: string) {
  const out: { u: string; p: string }[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      const p = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "").toUpperCase();
      if (u.hostname === DOMAIN && u.pathname.includes("/item/deep-groove-ball-bearings/") && /\d/.test(p) && !seen.has(u.toString())) {
        seen.add(u.toString());
        out.push({ u: u.toString(), p });
      }
    } catch { /* skip malformed href */ }
  }
  return out;
}

async function getPage(u: string) {
  const r = await fetch(u, { headers: { "User-Agent": "IndustrialpediaNTNDiscovery/2.4" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("http_" + r.status);
  return { u: r.url, h: await r.text() };
}

export async function runNtnDiscovery(sb: SupabaseClient, targetRaw: number) {
  const target = Math.max(1, Math.min(5, Number(targetRaw) || 3));

  const { data: src, error: se } = await sb.from("ingestion_sources").select("id,config,last_cursor").eq("source_key", "ntn_catalog_v1").single();
  if (se || !src) return { error: "source_lookup_failed", detail: se?.message };

  let page = 1;
  try {
    const c = src.last_cursor ? JSON.parse(src.last_cursor) : null;
    page = Math.max(1, Math.min(40, Number(c?.page) || 1));
  } catch { /* keep page=1 */ }

  const catalogUrl = `${CATALOG_BASE}?pagenum=${page}&pagesize=25`;

  const { data: j } = await sb.from("ingestion_jobs").insert({
    source_id: src.id, status: "running", batch_size: target, processed_count: 0, accepted_count: 0, rejected_count: 0, error_count: 0,
    started_at: new Date().toISOString(), metadata: { manufacturer: "NTN", discovery: DISCOVERY_METHOD, page },
  }).select("id").single();
  if (!j) return { error: "job_create_failed" };
  const jobId = j.id;

  let g;
  try {
    g = await getPage(catalogUrl);
  } catch (e) {
    await sb.from("ingestion_jobs").update({ status: "completed", completed_at: new Date().toISOString(), error_count: 1, last_error: String(e) }).eq("id", jobId);
    return { error: "catalog_fetch_failed", page, job_id: jobId, detail: String(e) };
  }

  const items = extractItemLinks(g.h, g.u);
  const found: any[] = [], samples: any[] = [];
  const counts = { seen: items.length, new: 0, known: 0, rejected: 0, error: 0, budget: 0 };

  for (let i = 0; i < items.length; i++) {
    const x = items[i];
    if (found.length >= target) { counts.budget = items.length - i; break; }

    const key = "html:" + DOMAIN + ":" + x.u;
    const { data: e, error: ke } = await sb.from("ingestion_records").select("id").eq("source_id", src.id).eq("external_key", key).maybeSingle();
    if (ke) { counts.error++; if (samples.length < 3) samples.push({ part_number: x.p, stage: "known_lookup", error: ke.message }); continue; }
    if (e) { counts.known++; continue; }

    let pg;
    try {
      pg = await getPage(x.u);
    } catch (er) {
      counts.error++;
      if (samples.length < 3) samples.push({ part_number: x.p, stage: "product_fetch", error: String(er) });
      continue;
    }

    const t = pg.h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
    if (!/deep groove ball bearing/.test(t) || !/technical specifications/.test(t)) {
      counts.rejected++;
      if (samples.length < 3) samples.push({ part_number: x.p, stage: "family_validation", error: "family_markers_missing" });
      continue;
    }

    const { data: r, error } = await sb.from("ingestion_records").insert({
      job_id: jobId, source_id: src.id, external_key: key,
      payload: {
        part_number: x.p, manufacturer_part_number: x.p, manufacturer_id: src.config.manufacturer_id,
        source_url: pg.u, source_page_url: pg.u, domain: DOMAIN, discovery_method: DISCOVERY_METHOD,
        content_type: "text/html", family_code: FAMILY_CODE, catalog_url: g.u, catalog_page: page,
      },
      status: "candidate",
    }).select("id").single();
    if (error) { counts.error++; if (samples.length < 3) samples.push({ part_number: x.p, stage: "record_insert", error: error.message }); continue; }

    const { data: q, error: qe } = await sb.from("candidate_enrichment_queue").insert({
      ingestion_record_id: r.id, status: "queued", priority: 90, stage: "deterministic",
      normalized_mpn: x.p, normalized_brand: "NTN", family_code: FAMILY_CODE, family_classification_state: "verified",
      external_lookup_required: false, evidence: { discovery_method: DISCOVERY_METHOD, catalog_page: page, catalog_url: g.u, url: pg.u },
    }).select("id").single();
    if (qe) { counts.error++; if (samples.length < 3) samples.push({ part_number: x.p, stage: "queue_insert", error: qe.message }); continue; }

    counts.new++;
    found.push({ part_number: x.p, url: pg.u, queue_id: q.id });
  }

  const next = page === 40 ? 1 : page + 1;
  const total = counts.new + counts.known + counts.rejected + counts.error + counts.budget;
  const balanced = total === counts.seen;

  await sb.from("ingestion_jobs").update({
    status: "completed", processed_count: counts.seen - counts.budget, accepted_count: counts.new, rejected_count: counts.rejected,
    error_count: counts.error, completed_at: new Date().toISOString(),
    metadata: { manufacturer: "NTN", discovery: DISCOVERY_METHOD, page, next_page: next, accounting: counts, balanced },
  }).eq("id", jobId);

  if (balanced) {
    await sb.from("ingestion_sources").update({
      last_cursor: JSON.stringify({ version: 1, page: next, updated_at: new Date().toISOString() }),
      last_success_at: new Date().toISOString(),
    }).eq("id", src.id);
  }

  return {
    status: "ok", job_id: jobId, page, next_page: next, catalog_url: catalogUrl, items_seen: counts.seen,
    accounting: counts, accounting_total: total, balanced, discovered: found, error_samples: samples,
  };
}
