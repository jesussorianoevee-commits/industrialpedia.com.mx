// Baumer force-sensor extraction + publish pipeline, sourced from nor-mex.com.mx
// (a Mexican distributor -- robots.txt fully open, no bot-detection, unlike
// baumer.com itself which was never even tried here). Deliberately scoped to
// ONLY the "force-sensors" category (4 real products: L003, DLM40, DLM30,
// DLM20) rather than all ~300 Baumer products nor-mex carries: confirmed by
// hand against all 4 pages before writing any extraction code that their
// spec block is free-form marketing prose, NOT a consistent label:value
// structure like FANUC/KUKA -- e.g. "155 mm de diámetro externo Rango de
// fuerza de 0 … 100 kN Hilo M30 Conector M12 de 5 polos ... IP 67" as one
// run-on paragraph. Other Baumer categories (proximity switches, rotary
// encoders, vision sensors) use DIFFERENT prose templates per category and
// are NOT covered by these patterns -- extending this to them would need
// its own investigation + its own regex set per category, not a blind
// expansion of what's here.
//
// Because there's no stable label:value structure, extraction here is a
// small set of hand-validated regexes for known technical phrase patterns
// (diameter, force range, thread, connector, IP rating, accuracy) applied
// to the one paragraph -- each regex either finds a real match or finds
// nothing; nothing is ever guessed or defaulted.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { clean } from "../manufacturer_worker.ts";

const EXTRACTOR_VERSION = "baumer-force-sensor-nor-mex-auto-publish-v1";
const SOURCE_KEY = "baumer_norMex_force_sensors_v1";
const FAMILY_CODE = "force_sensor";
const UA = "IndustrialpediaBot/1.1 (+https://industrialpedia.app/bot-info)";
const PRODUCT_URLS = [
  "https://nor-mex.com.mx/producto/baumer/07force-sensors-strain-sensors/force-sensors/force-sensors-l003-up-to-100kn/",
  "https://nor-mex.com.mx/producto/baumer/07force-sensors-strain-sensors/force-sensors/force-sensors-dlm40-up-to-20kn/",
  "https://nor-mex.com.mx/producto/baumer/07force-sensors-strain-sensors/force-sensors/force-sensors-dlm30-up-to-5kn/",
  "https://nor-mex.com.mx/producto/baumer/07force-sensors-strain-sensors/force-sensors/force-sensors-dlm20-up-to-1kn/",
];

let baumerManufacturerId: string | null = null;
async function resolveManufacturerId(sb: SupabaseClient): Promise<string | null> {
  if (baumerManufacturerId) return baumerManufacturerId;
  const { data } = await sb.from("manufacturers").select("id").eq("normalized_name", "baumer").maybeSingle();
  baumerManufacturerId = data?.id || null;
  return baumerManufacturerId;
}

function decodeEntities(s: string): string {
  return s.replace(/&#8230;/g, "...").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}

function extractDescription(html: string): string | null {
  const m = html.match(/woocommerce-product-short-description[^>]*>([\s\S]{0,800}?)<\/div>/);
  if (!m) return null;
  const text = decodeEntities(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  return text || null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title>\s*([^<]*?)\s*<\/title>/i);
  if (!m) return null;
  return decodeEntities(m[1]).split(/\s*-\s*NOR-MEX/i)[0].trim() || null;
}

type Spec = { property_code: string; attribute_name: string; original_value: string; numeric_value: string | null; unit: string | null };

// Each rule is validated against all 4 real product pages before being
// written here -- a rule that doesn't match on a given product simply
// contributes nothing for it, rather than guessing a value.
function extractSpecs(desc: string): Spec[] {
  const specs: Spec[] = [];

  const diam = desc.match(/([\d.,]+(?:\s*\.\.\.\s*[\d.,]+)?)\s*mm\s+de\s+di[aá]metro\s+exter(?:no|ior)/i);
  if (diam) {
    const raw = diam[1].replace(/\s*\.\.\.\s*/g, " ... ");
    // A range ("42 ... 60 mm") describes the family's mounting variants, not
    // one measurable value -- keep it as text evidence only, no numeric_value
    // (never collapse a range to a single guessed number).
    const single = raw.match(/^[\d.,]+$/);
    specs.push({ property_code: "diameter", attribute_name: "diámetro externo", original_value: `${raw} mm`, numeric_value: single ? String(Number(raw.replace(",", "."))) : null, unit: "mm" });
  }

  const force = desc.match(/[Rr]ango de fuerza de\s*([\d.,]+)\s*\.\.\.\s*([\d.,]+)\s*(kN|N)\b/);
  if (force) {
    // force_range_min/_max are registered as their own property_codes (canonical
    // unit N) -- publish_part_v1's public wrapper validates property_code against
    // spec_property_definitions BEFORE its "X ... Y unit" auto-split runs, so a
    // bare "force_range" code is rejected as unmapped. Emit both bounds directly.
    const toN = (v: string) => {
      const n = Number(v.replace(",", "."));
      return force[3] === "kN" ? n * 1000 : n;
    };
    const minN = toN(force[1]);
    const maxN = toN(force[2]);
    specs.push({ property_code: "force_range_min", attribute_name: "rango de fuerza mínimo", original_value: `${force[1]} ${force[3]}`, numeric_value: String(minN), unit: "N" });
    specs.push({ property_code: "force_range_max", attribute_name: "rango de fuerza máximo", original_value: `${force[2]} ${force[3]}`, numeric_value: String(maxN), unit: "N" });
  }

  const thread = desc.match(/\bHilo\s+(M\d+(?:[.,]\d+)?)\b/);
  if (thread) specs.push({ property_code: "thread", attribute_name: "hilo", original_value: thread[1], numeric_value: null, unit: null });

  const conn = desc.match(/\bConector\s+(M\d+)\s+de\s+(\d+)\s+polos\b/);
  if (conn) specs.push({ property_code: "connector_type", attribute_name: "conector", original_value: `${conn[1]}, ${conn[2]} pines`, numeric_value: null, unit: null });

  const ip = desc.match(/\bIP\s*(\d{2})\b/);
  if (ip) specs.push({ property_code: "ip_rating", attribute_name: "clase de protección", original_value: `IP${ip[1]}`, numeric_value: null, unit: null });

  const acc = desc.match(/[Pp]recisi[oó]n(?:\s+de\s+medici[oó]n)?\s+([\d.,]+)\s*%/);
  if (acc) specs.push({ property_code: "measurement_accuracy", attribute_name: "precisión de medición", original_value: `${acc[1]}%`, numeric_value: String(Number(acc[1].replace(",", "."))), unit: "%" });

  return specs;
}

export async function syncBaumerForceSensorPages(sb: SupabaseClient) {
  const { data: known } = await sb.from("manufacturer_page_ingestion_queue").select("url").eq("source_key", SOURCE_KEY);
  const knownSet = new Set((known || []).map((r: any) => r.url));
  const toInsert = PRODUCT_URLS.filter((u) => !knownSet.has(u)).map((u) => ({ source_key: SOURCE_KEY, url: u, status: "discovered", family_code: FAMILY_CODE }));
  if (!toInsert.length) return { status: "completed", synced: 0 };
  const { error } = await sb.from("manufacturer_page_ingestion_queue").insert(toInsert);
  if (error) return { error: error.message };
  return { status: "completed", synced: toInsert.length };
}

export async function runBaumerForceSensorAutoPublish(sb: SupabaseClient, batchSizeRaw: unknown, publishReal: boolean) {
  const batchSize = Math.max(1, Math.min(10, Number(batchSizeRaw) || 4));
  const { data: rows, error } = await sb
    .from("manufacturer_page_ingestion_queue")
    .select("id, url, status")
    .eq("source_key", SOURCE_KEY)
    .in("status", ["discovered", "needs_review"])
    .limit(batchSize);
  if (error) return { error: error.message };
  if (!rows?.length) return { status: "completed", processed: 0, results: [] };

  const manufacturerId = await resolveManufacturerId(sb);
  if (!manufacturerId) return { error: "baumer_manufacturer_not_found" };

  let token: string | null = null;
  if (publishReal) {
    const { data: t, error: te } = await sb.rpc("get_secret_v1", { p_name: "industrialpedia_publish_pipeline_v1" });
    if (te || !t) return { error: "publish_pipeline_token_unavailable" };
    token = t as string;
  }

  const results: any[] = [];
  let first = true;
  for (const row of rows as any[]) {
    const url = row.url as string;
    if (!first) await new Promise((res) => setTimeout(res, 400));
    first = false;

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

    const title = extractTitle(html);
    const desc = extractDescription(html);
    if (!title || !desc) {
      const reason = !title ? "no_title_found" : "no_description_block_found";
      await sb.from("manufacturer_page_ingestion_queue").update({ status: "needs_review", notes: reason, updated_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ url, status: "needs_review", reason });
      continue;
    }

    const matched = extractSpecs(desc);
    if (!matched.length) {
      await sb.from("manufacturer_page_ingestion_queue").update({
        status: "needs_review", notes: "no_pattern_matched_in_description", extraction_result: { description: desc }, updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ url, part_number: title, status: "needs_review", reason: "no_pattern_matched" });
      continue;
    }

    const specs = matched.map((s) => ({
      property_code: s.property_code,
      attribute_name: s.attribute_name,
      original_value: s.original_value,
      numeric_value: s.numeric_value,
      unit: s.unit,
      evidence_text: `${clean(desc)} | fuente=distribuidor autorizado NOR-MEX (${url})`,
      page: "1",
    }));

    const partNumberEvidence = { evidence_text: `${title} | ficha de producto en distribuidor NOR-MEX | fuente=${url}`, page: "1" };
    const dry = await sb.rpc("publish_part_v1", {
      p_manufacturer_id: manufacturerId, p_part_number: title, p_family_code: FAMILY_CODE,
      p_source_url: url, p_part_number_evidence: partNumberEvidence, p_specs: specs, p_images: null,
      p_dry_run: true, p_pipeline_token: null,
    });
    if (dry.error) {
      await sb.from("manufacturer_page_ingestion_queue").update({ status: "needs_review", notes: dry.error.message, updated_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ url, part_number: title, status: "error", reason: dry.error.message });
      continue;
    }
    if (!["would_publish", "already_exists"].includes(dry.data?.status)) {
      await sb.from("manufacturer_page_ingestion_queue").update({
        status: "needs_review", notes: JSON.stringify(dry.data).slice(0, 2000), extraction_result: { description: desc, specs, dry_run_result: dry.data }, updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ url, part_number: title, status: "needs_review", dry_run_result: dry.data });
      continue;
    }
    if (!publishReal) { results.push({ url, part_number: title, status: "would_publish", specs_found: specs.length, specs }); continue; }

    const real = await sb.rpc("publish_part_v1", {
      p_manufacturer_id: manufacturerId, p_part_number: title, p_family_code: FAMILY_CODE,
      p_source_url: url, p_part_number_evidence: partNumberEvidence, p_specs: specs, p_images: null,
      p_dry_run: false, p_pipeline_token: token,
    });
    if (real.error) {
      await sb.from("manufacturer_page_ingestion_queue").update({ status: "needs_review", notes: real.error.message, updated_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ url, part_number: title, status: "error", reason: real.error.message });
      continue;
    }
    const resolved = ["published", "already_exists_evidence_added"].includes(real.data?.status);
    await sb.from("manufacturer_page_ingestion_queue").update({
      status: resolved ? "published" : "needs_review",
      notes: JSON.stringify({ extractor: EXTRACTOR_VERSION, publish_result: real.data }).slice(0, 2000),
      processed_at: resolved ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    results.push({ url, part_number: title, status: real.data?.status, part_id: real.data?.part_id, specs_found: specs.length });
  }

  return { status: "completed", processed: results.length, results };
}
