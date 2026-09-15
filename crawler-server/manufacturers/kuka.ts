// KUKA industrial robot product-page extraction + publish pipeline. Same
// two-stage shape as fanuc.ts, different page structure -- confirmed by hand
// against a real page (KR AGILUS family) before writing any of this, not
// guessed: KUKA's family pages (e.g. /industrial-robots/kr-agilus) list
// EACH variant (17 on the KR AGILUS page alone: KR 6 R700-2, KR 10 R1100 EX,
// etc.) as its own block anchored by `data-name="<variant>"`, followed by a
// small technical-data table for that variant with exactly three real
// fields: "Total load" (payload), "Maximum reach" (reach), and
// "Version environment" (a category, not extracted -- no property_code fits
// it and it's not critical/required for this family). Axes is NOT per
// variant -- it's stated once in the page heading text ("KR AGILUS (6 axes)
// - technical data"), shared across every variant on that page. No
// repeatability value exists anywhere on these pages as a real number (only
// as marketing prose, "achieves maximum repeatability") -- not extracted,
// never guessed from prose.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { fetchAliasMap, clean, normLabel } from "../manufacturer_worker.ts";

const EXTRACTOR_VERSION = "kuka-robot-page-auto-publish-v1";
const SOURCE_KEY = "kuka_official_catalog_v1";
const FAMILY_CODE = "industrial_robot";
const UA = "IndustrialpediaBot/1.1 (+https://industrialpedia.app/bot-info)";
let kukaManufacturerId: string | null = null;

async function resolveManufacturerId(sb: SupabaseClient): Promise<string | null> {
  if (kukaManufacturerId) return kukaManufacturerId;
  const { data } = await sb.from("manufacturers").select("id").eq("normalized_name", "kuka").maybeSingle();
  kukaManufacturerId = data?.id || null;
  return kukaManufacturerId;
}

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

function extractFamilyAxes(html: string): string | null {
  const m = html.match(/\((\d+)\s*axes?\)/i);
  return m ? m[1] : null;
}

function decodeEntities(s: string): string {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}

type Variant = { name: string; pairs: Array<{ label: string; value: string }> };

function extractVariants(html: string): Variant[] {
  const out: Variant[] = [];
  const seen = new Set<string>();
  const anchorRe = /data-name="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const name = decodeEntities(m[1]);
    if (seen.has(name)) continue; // KUKA's markup repeats each variant block (list view + table view)
    seen.add(name);
    const windowText = html.slice(m.index, m.index + 1400);
    const pairs: Array<{ label: string; value: string }> = [];
    const pairRe = /trigger__col__label">\s*([^<]+?)\s*<\/div>\s*<div[^>]*trigger__col__value"[^>]*>\s*([^<]+?)\s*<\/div>/g;
    let pm: RegExpExecArray | null;
    while ((pm = pairRe.exec(windowText)) !== null) {
      pairs.push({ label: decodeEntities(pm[1]), value: decodeEntities(pm[2]) });
    }
    if (pairs.length) out.push({ name, pairs });
  }
  return out;
}

export async function syncKukaRobotPages(sb: SupabaseClient) {
  const { data: rows, error } = await sb
    .from("crawler_discovered_urls_v1")
    .select("url")
    .eq("domain", "www.kuka.com")
    .like("url", "%/industrial-robots/%");
  if (error) return { error: error.message };
  const urls = [...new Set((rows || []).map((r: any) => r.url as string))].filter((u) => !u.includes("[["));
  if (!urls.length) return { status: "completed", synced: 0 };

  const { data: known } = await sb.from("manufacturer_page_ingestion_queue").select("url").eq("source_key", SOURCE_KEY);
  const knownSet = new Set((known || []).map((r: any) => r.url));
  const toInsert = urls.filter((u) => !knownSet.has(u)).map((u) => ({ source_key: SOURCE_KEY, url: u, status: "discovered", family_code: FAMILY_CODE }));
  if (!toInsert.length) return { status: "completed", synced: 0 };

  const { error: ie } = await sb.from("manufacturer_page_ingestion_queue").insert(toInsert);
  if (ie) return { error: ie.message };
  return { status: "completed", synced: toInsert.length };
}

export async function runKukaRobotAutoPublish(sb: SupabaseClient, batchSizeRaw: unknown, publishReal: boolean) {
  const batchSize = Math.max(1, Math.min(10, Number(batchSizeRaw) || 3));
  const { data: rows, error } = await sb
    .from("manufacturer_page_ingestion_queue")
    .select("id, url, status")
    .eq("source_key", SOURCE_KEY)
    .in("status", ["discovered", "needs_review"])
    .limit(batchSize);
  if (error) return { error: error.message };
  if (!rows?.length) return { status: "completed", processed: 0, results: [] };

  const manufacturerId = await resolveManufacturerId(sb);
  if (!manufacturerId) return { error: "kuka_manufacturer_not_found" };

  let token: string | null = null;
  if (publishReal) {
    const { data: t, error: te } = await sb.rpc("get_secret_v1", { p_name: "industrialpedia_publish_pipeline_v1" });
    if (te || !t) return { error: "publish_pipeline_token_unavailable" };
    token = t as string;
  }

  const { defMap, aliasRows } = await fetchAliasMap(sb, FAMILY_CODE);
  const results: any[] = [];

  for (const row of rows as any[]) {
    const url = row.url as string;
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

    const axes = extractFamilyAxes(html);
    const variants = extractVariants(html);
    if (!variants.length) {
      await sb.from("manufacturer_page_ingestion_queue").update({
        status: "needs_review", notes: "no_variant_blocks_found", updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ url, status: "needs_review", reason: "no_variant_blocks_found" });
      continue;
    }

    const variantResults: any[] = [];
    let first = true;
    for (const variant of variants) {
      if (!first) await new Promise((res) => setTimeout(res, 300));
      first = false;

      const specs: any[] = [];
      for (const { label, value } of variant.pairs) {
        const code = resolveLabel(label, defMap, aliasRows);
        if (!code) continue;
        const numeric = val(value);
        specs.push({
          property_code: code,
          attribute_name: label,
          original_value: value,
          numeric_value: numeric?.numeric_value ?? null,
          unit: numeric?.unit ?? null,
          evidence_text: `${label}: ${value} | fuente=página oficial KUKA (${url})`,
          page: "1",
        });
      }
      if (axes) {
        specs.push({
          property_code: "axes",
          attribute_name: "axes",
          original_value: axes,
          numeric_value: axes,
          unit: null,
          evidence_text: `"(${axes} axes)" en encabezado de la página | fuente=página oficial KUKA (${url})`,
          page: "1",
        });
      }
      if (!specs.length) { variantResults.push({ part_number: variant.name, status: "skipped", reason: "no_mappable_specs" }); continue; }

      const partNumberEvidence = { evidence_text: `${variant.name} | tabla de variantes de página oficial KUKA | fuente=${url}`, page: "1" };
      const dry = await sb.rpc("publish_part_v1", {
        p_manufacturer_id: manufacturerId, p_part_number: variant.name, p_family_code: FAMILY_CODE,
        p_source_url: url, p_part_number_evidence: partNumberEvidence, p_specs: specs, p_images: null,
        p_dry_run: true, p_pipeline_token: null,
      });
      if (dry.error) { variantResults.push({ part_number: variant.name, status: "error", reason: dry.error.message }); continue; }
      if (!["would_publish", "already_exists"].includes(dry.data?.status)) {
        variantResults.push({ part_number: variant.name, status: "needs_review", dry_run_result: dry.data });
        continue;
      }
      if (!publishReal) { variantResults.push({ part_number: variant.name, status: "would_publish", specs_found: specs.length }); continue; }

      const real = await sb.rpc("publish_part_v1", {
        p_manufacturer_id: manufacturerId, p_part_number: variant.name, p_family_code: FAMILY_CODE,
        p_source_url: url, p_part_number_evidence: partNumberEvidence, p_specs: specs, p_images: null,
        p_dry_run: false, p_pipeline_token: token,
      });
      if (real.error) { variantResults.push({ part_number: variant.name, status: "error", reason: real.error.message }); continue; }
      variantResults.push({ part_number: variant.name, status: real.data?.status, part_id: real.data?.part_id, specs_found: specs.length });
    }

    const allResolved = variantResults.every((r) => ["published", "already_exists_evidence_added", "already_exists", "would_publish"].includes(r.status));
    await sb.from("manufacturer_page_ingestion_queue").update({
      status: !publishReal ? row.status : (allResolved ? "published" : "needs_review"),
      notes: JSON.stringify({ extractor: EXTRACTOR_VERSION, variant_results: variantResults }).slice(0, 4000),
      processed_at: allResolved && publishReal ? new Date().toISOString() : row.processed_at,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);

    results.push({ url, variants: variantResults, dry_run: !publishReal });
  }

  return { status: "completed", processed: results.length, results };
}
