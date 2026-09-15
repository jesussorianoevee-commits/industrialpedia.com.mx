// FANUC robot product-page extraction + publish pipeline. FANUC's official
// site (fanucamerica.com) serves each robot model's full spec block as a
// clean <dt>Label</dt><dd>Value</dd> definition list on its own product page
// (e.g. /products/robot/arc-mate-100id) -- confirmed by hand against two
// different models (ARC Mate 100iD, CRX 10iA) before writing this, same
// 24-field shape both times. This is a MUCH safer extraction target than the
// linked datasheet PDF, which packs the same data into a dense per-axis
// (J1-J6) engineering table with no simple label:value structure.
//
// Two-stage pipeline, same shape as the SMC PDF pipeline:
//   1. syncFanucRobotPages -- registers newly-discovered /products/robot/*
//      URLs (from crawler_discovered_urls_v1, populated by discovery/crawl)
//      into manufacturer_page_ingestion_queue. Pure bookkeeping, no fetch.
//   2. runFanucRobotAutoPublish -- fetches each queued page, extracts the
//      dt/dd spec block + a part identifier from <title>, maps labels to
//      property_code via spec_attribute_aliases (family_code
//      'industrial_robot' -- generic/multi-manufacturer, not FANUC-specific,
//      so KUKA/ABB/Yaskawa can compare here later), and publishes via
//      publish_part_v1.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { fetchAliasMap, clean, normLabel } from "../manufacturer_worker.ts";

const EXTRACTOR_VERSION = "fanuc-robot-page-auto-publish-v1";
const SOURCE_KEY = "fanuc_official_catalog_v1";
const FAMILY_CODE = "industrial_robot";
const FANUC_MANUFACTURER_ID = "d5e2c86b-26ac-412b-97f3-5c166624b9b0";
const UA = "IndustrialpediaBot/1.1 (+https://industrialpedia.app/bot-info)";

function val(s: string) {
  const m = clean(s).match(/([<>≤≥+\-]?\s*\d+(?:[.,]\d+)?)(?:\s*(?:\.\.|-|to)\s*\d+(?:[.,]\d+)?)?\s*([a-zA-ZµμΩω°%/²³][a-zA-Z0-9µμΩω°%/²³]*)/);
  return m ? { numeric_value: String(Number(m[1].replace(/\s+/g, "").replace(",", "."))), unit: m[2].toLowerCase() } : null;
}

function resolveLabel(label: string, defMap: Map<string, string>, aliasRows: { norm: string; code: string }[]): string | null {
  const nl = normLabel(label);
  let bestCode: string | null = defMap.get(nl) || null;
  let bestScore = bestCode ? 10000 : 0;
  for (const a of aliasRows) {
    let score = 0;
    if (nl === a.norm) score = 10000 + a.norm.length;
    else if (nl.includes(a.norm)) score = 5000 + a.norm.length;
    else if (a.norm.includes(nl) && nl.length >= 8) score = 4000 + nl.length;
    if (score > bestScore) { bestScore = score; bestCode = a.code; }
  }
  return bestCode;
}

function extractDtDdPairs(html: string): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const re = /<dt[^>]*>\s*([^<]*?)\s*<\/dt>\s*<dd[^>]*>\s*([^<]*?)\s*<\/dd>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const label = clean(m[1]).replace(/&amp;/g, "&").replace(/&#39;/g, "'");
    const value = clean(m[2]).replace(/&amp;/g, "&");
    if (label && value) out.push({ label, value });
  }
  return out;
}

function extractPartNumber(html: string): string | null {
  const m = html.match(/<title>\s*([^<]*?)\s*<\/title>/i);
  if (!m) return null;
  let t = clean(m[1]);
  // Only split on a whitespace-padded separator ( - or | with a space on
  // BOTH sides): real title titled "CR-35iA | FANUC America" has its model
  // number's own bare hyphen with no surrounding space -- splitting on any
  // hyphen truncated it to just "CR" until this was caught against a real
  // page and fixed.
  t = t.split(/\s+[-|]\s+/)[0].trim();
  t = t.replace(/^FANUC\s+/i, "").trim();
  return t || null;
}

export async function syncFanucRobotPages(sb: SupabaseClient) {
  const { data: rows, error } = await sb
    .from("crawler_discovered_urls_v1")
    .select("url")
    .eq("domain", "www.fanucamerica.com")
    .like("url", "%/products/robot/%");
  if (error) return { error: error.message };
  const urls = [...new Set((rows || []).map((r: any) => r.url as string))];
  if (!urls.length) return { status: "completed", synced: 0 };

  const { data: known } = await sb.from("manufacturer_page_ingestion_queue").select("url").eq("source_key", SOURCE_KEY);
  const knownSet = new Set((known || []).map((r: any) => r.url));
  const toInsert = urls.filter((u) => !knownSet.has(u)).map((u) => ({ source_key: SOURCE_KEY, url: u, status: "discovered", family_code: FAMILY_CODE }));
  if (!toInsert.length) return { status: "completed", synced: 0 };

  const { error: ie } = await sb.from("manufacturer_page_ingestion_queue").insert(toInsert);
  if (ie) return { error: ie.message };
  return { status: "completed", synced: toInsert.length };
}

export async function runFanucRobotAutoPublish(sb: SupabaseClient, batchSizeRaw: unknown, publishReal: boolean) {
  const batchSize = Math.max(1, Math.min(10, Number(batchSizeRaw) || 3));
  const { data: rows, error } = await sb
    .from("manufacturer_page_ingestion_queue")
    .select("id, url, status")
    .eq("source_key", SOURCE_KEY)
    .in("status", ["discovered", "needs_review"])
    .limit(batchSize);
  if (error) return { error: error.message };
  if (!rows?.length) return { status: "completed", processed: 0, results: [] };

  let token: string | null = null;
  if (publishReal) {
    const { data: t, error: te } = await sb.rpc("get_secret_v1", { p_name: "industrialpedia_publish_pipeline_v1" });
    if (te || !t) return { error: "publish_pipeline_token_unavailable" };
    token = t as string;
  }

  const { defMap, aliasRows } = await fetchAliasMap(sb, FAMILY_CODE);
  const results: any[] = [];
  let firstFetch = true;

  for (const row of rows as any[]) {
    const url = row.url as string;
    // Real incident (2026-09-15, this same session): fetching FANUC pages
    // back-to-back with no delay got a batch of 10 rate-limited (HTTP 429)
    // partway through -- same lesson as the sitemap discovery fix above.
    if (!firstFetch) await new Promise((r) => setTimeout(r, 500));
    firstFetch = false;
    let html: string;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`http_${r.status}`);
      html = await r.text();
    } catch (e) {
      const reason = `fetch_failed: ${e instanceof Error ? e.message : String(e)}`;
      await sb.from("manufacturer_page_ingestion_queue").update({ status: "needs_review", notes: reason, updated_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ url, status: "needs_review", reason });
      continue;
    }

    const partNumber = extractPartNumber(html);
    const pairs = extractDtDdPairs(html);
    if (!partNumber || !pairs.length) {
      const reason = !partNumber ? "no_title_identity_found" : "no_dt_dd_spec_block_found";
      await sb.from("manufacturer_page_ingestion_queue").update({
        status: "needs_review", notes: reason, extraction_result: { pairs_found: pairs.length }, updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ url, status: "needs_review", reason });
      continue;
    }

    const specs: any[] = [];
    for (const { label, value } of pairs) {
      const code = resolveLabel(label, defMap, aliasRows);
      if (!code) continue;
      const numeric = val(value);
      specs.push({
        property_code: code,
        attribute_name: label,
        original_value: value,
        numeric_value: numeric?.numeric_value ?? null,
        unit: numeric?.unit ?? null,
        evidence_text: `${label}: ${value} | fuente=página oficial FANUC (${url})`,
        page: "1",
      });
    }

    const partNumberEvidence = { evidence_text: `${partNumber} | título de página oficial FANUC | fuente=${url}`, page: "1" };

    const dry = await sb.rpc("publish_part_v1", {
      p_manufacturer_id: FANUC_MANUFACTURER_ID, p_part_number: partNumber, p_family_code: FAMILY_CODE,
      p_source_url: url, p_part_number_evidence: partNumberEvidence, p_specs: specs, p_images: null,
      p_dry_run: true, p_pipeline_token: null,
    });
    if (dry.error) {
      await sb.from("manufacturer_page_ingestion_queue").update({ status: "needs_review", notes: dry.error.message, updated_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ url, part_number: partNumber, status: "error", reason: dry.error.message });
      continue;
    }
    const dryStatus = dry.data?.status;
    if (!["would_publish", "already_exists"].includes(dryStatus)) {
      await sb.from("manufacturer_page_ingestion_queue").update({
        status: "needs_review", notes: JSON.stringify(dry.data).slice(0, 2000), extraction_result: { part_number: partNumber, specs, dry_run_result: dry.data }, updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ url, part_number: partNumber, status: "needs_review", dry_run_result: dry.data });
      continue;
    }
    if (!publishReal) {
      results.push({ url, part_number: partNumber, status: "would_publish", specs_found: specs.length });
      continue;
    }

    const real = await sb.rpc("publish_part_v1", {
      p_manufacturer_id: FANUC_MANUFACTURER_ID, p_part_number: partNumber, p_family_code: FAMILY_CODE,
      p_source_url: url, p_part_number_evidence: partNumberEvidence, p_specs: specs, p_images: null,
      p_dry_run: false, p_pipeline_token: token,
    });
    if (real.error) {
      await sb.from("manufacturer_page_ingestion_queue").update({ status: "needs_review", notes: real.error.message, updated_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ url, part_number: partNumber, status: "error", reason: real.error.message });
      continue;
    }
    const resolved = ["published", "already_exists_evidence_added"].includes(real.data?.status);
    await sb.from("manufacturer_page_ingestion_queue").update({
      status: resolved ? "published" : "needs_review",
      notes: JSON.stringify({ extractor: EXTRACTOR_VERSION, publish_result: real.data }).slice(0, 2000),
      processed_at: resolved ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    results.push({ url, part_number: partNumber, status: real.data?.status, part_id: real.data?.part_id, specs_found: specs.length });
  }

  return { status: "completed", processed: results.length, results };
}
