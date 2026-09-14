// Ported verbatim from the Supabase Edge Function `industrialpedia-smc-vqz-pipeline-v1`
// (project stwwywzuzbkyoecjujeh, version 8). Same publish logic and RPC calls, unchanged.
//
// One deliberate adaptation: the live Supabase version still calls the OLD hardcoded
// extractor (`industrialpedia-vqz-structural-extractor-v2`, still deployed, untouched by
// this migration) via HTTPS. We preserve that exact remote call here (LEGACY_EXTRACTOR_URL)
// rather than guessing the VQZ-specific config for the generic extractor now ported into
// this same server (extractor.ts) — that config was never captured in this repo, and
// inventing one would risk silently changing what gets published. Swap
// LEGACY_EXTRACTOR_URL for a local call to runExtractor() once the real VQZ config is
// recovered/confirmed.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const MID = "27b30ebd-c5f3-4316-a1b4-fbf7904912d6";
const PDF = "https://www.smcworld.com/catalog/BEST-5-1-en/pdf/1-p1253-1328-vqz1000_en.pdf";
const FAMILY = "VQZ1000/2000/3000";
const PAGE = 8;
const SOURCE = "smc_catalog_v1";

function buildSpecs(rec: any) {
  const specs: any[] = [];
  const cv = rec?.flow?.cv_1_4_2;
  if (cv) specs.push({ property_code: "flow_coefficient_cv", attribute_name: "Flow characteristics Cv", original_value: String(cv), numeric_value: String(cv), unit: null, evidence_text: `${rec.part_number} | ${cv} | Flow characteristics Cv (1→4/2 (P→A/B))`, page: PAGE });
  if (rec?.weight?.geometry_verified) {
    const models = rec.weight.models || [];
    specs.push({ property_code: "basic_weight", attribute_name: "Weight", original_value: String(rec.weight.value), numeric_value: String(rec.weight.value), unit: rec.weight.unit || "g", evidence_text: `${models[0]}..${models[models.length - 1]} logical block | ${rec.weight.value} | Weight (g), shared cell geometrically inside the contiguous block`, page: PAGE });
  }
  return specs;
}

export async function runSmcVqzPipeline(dry: boolean) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const extractorUrl = Deno.env.get("LEGACY_EXTRACTOR_URL") || (supabaseUrl + "/functions/v1/industrialpedia-vqz-structural-extractor-v2");

  const gate = await fetch(extractorUrl);
  const g = gate.ok ? await gate.json() : null;
  if (!g || g.result !== "PASS" || g.passed !== 11 || g.total !== 11) {
    return { status: "blocked", stage: "extractor_contract", result: g };
  }

  const recRes = await fetch(extractorUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "records", url: PDF, page: PAGE }) });
  if (!recRes.ok) return { status: "blocked", stage: "records_fetch", http_status: recRes.status };
  const recData = await recRes.json();
  const records: any[] = Array.isArray(recData?.records) ? recData.records : [];
  if (!records.length) return { status: "blocked", stage: "no_records" };

  let token: any = null;
  if (!dry) {
    const x = await sb.rpc("get_secret_v1", { p_name: "industrialpedia_publish_pipeline_v1" });
    if (x.error || !x.data) return { status: "blocked", stage: "provenance_token" };
    token = x.data;
  }

  const results: any[] = [];
  for (const rec of records) {
    const partNumber = rec.part_number, specs = buildSpecs(rec);
    if (!specs.length) { results.push({ part_number: partNumber, status: "skipped", reason: "no_publishable_specs" }); continue }
    const { data, error } = await sb.rpc("publish_part_v1", {
      p_manufacturer_id: MID, p_part_number: partNumber, p_family_code: FAMILY, p_source_url: PDF,
      p_part_number_evidence: { evidence_text: partNumber, page: PAGE }, p_specs: specs, p_images: null,
      p_dry_run: dry, p_pipeline_token: token,
    });
    results.push({ part_number: partNumber, status: error ? "error" : (data?.status || "unknown"), specs_sent: specs.length, detail: data, error: error?.message || null });
  }
  return { status: "ok", mode: dry ? "dry_run" : "publish", source_key: SOURCE, family: FAMILY, total_records: records.length, results };
}
