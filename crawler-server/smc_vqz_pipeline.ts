// Ported verbatim from the Supabase Edge Function `industrialpedia-smc-vqz-pipeline-v1`
// (project stwwywzuzbkyoecjujeh, version 8) — same publish logic and RPC calls, unchanged.
//
// The extraction step now calls runExtractor() in-process (extractor.ts, the generic
// ported extractor) instead of the old Supabase-hosted `industrialpedia-vqz-structural-
// extractor-v2`. VQZ_CONFIG below was reconstructed from that function's own hardcoded
// values (read via get_edge_function, not guessed) and validated: PASS 8/8 on the
// generic extractor's acceptance test, and all 29 record's cv_1_4_2/weight values match
// exactly what's already published in Supabase (verified against part_evidence).
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { runExtractor } from "./extractor.ts";

const MID = "27b30ebd-c5f3-4316-a1b4-fbf7904912d6";
const PDF = "https://www.smcworld.com/catalog/BEST-5-1-en/pdf/1-p1253-1328-vqz1000_en.pdf";
const FAMILY = "VQZ1000/2000/3000";
const PAGE = 8;
const SOURCE = "smc_catalog_v1";

const VQZ_CONFIG = {
  family_code: FAMILY,
  document_url: PDF,
  page: PAGE,
  printed_page: "1260",
  first_row: "VQZ1120",
  last_row: "VQZ3521",
  model_pattern: "^VQZ\\d{4}$",
  model_x_min: 140,
  model_x_max: 170,
  anchors: [
    { rowLabel: "VQZ1120", expectedValue: "17" },
    { rowLabel: "VQZ2120", expectedValue: "18" },
    { rowLabel: "VQZ3120", expectedValue: "21" },
  ],
  known_rows: [
    { row_label: "VQZ3521", expected_cells: ["3.2", "0.38", "0.82", "2.4", "0.33", "0.62", "35", "30", "—", "59"] },
  ],
  dash_check: { with_dash: "VQZ3521", without_dash: "VQZ3520" },
  column_fields: [
    { name: "c_1_4_2", x_min: 180, x_max: 190 },
    { name: "b_1_4_2", x_min: 202, x_max: 212 },
    { name: "cv_1_4_2", x_min: 223, x_max: 232 },
    { name: "c_4_2_5_3", x_min: 242, x_max: 252 },
    { name: "b_4_2_5_3", x_min: 264, x_max: 274 },
    { name: "cv_4_2_5_3", x_min: 285, x_max: 295 },
    { name: "response_standard", x_min: 300, x_max: 310 },
    { name: "response_high_speed", x_min: 320, x_max: 330 },
    { name: "response_high_pressure", x_min: 338, x_max: 350 },
    { name: "response_ac", x_min: 355, x_max: 365 },
  ],
  weight_field: { x_min: 370, x_max: 390 },
  weight_unit: "g",
  weight_groups: [
    { models: ["VQZ1320", "VQZ1321", "VQZ1420", "VQZ1421", "VQZ1521"], weight_value: "65" },
    { models: ["VQZ2320", "VQZ2321", "VQZ2420", "VQZ2421", "VQZ2520", "VQZ2521"], weight_value: "91" },
    { models: ["VQZ3120", "VQZ3121"], weight_value: "108" },
    { models: ["VQZ3220", "VQZ3221"], weight_value: "125" },
    { models: ["VQZ3320", "VQZ3321", "VQZ3420", "VQZ3421", "VQZ3520", "VQZ3521"], weight_value: "136" },
  ],
  seal_field: { x_min: 115, x_max: 140, pattern: "(Metal|Rubber) seal" },
};

function buildSpecs(rec: any) {
  const specs: any[] = [];
  const cv = rec?.fields?.cv_1_4_2;
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

  const gate = await runExtractor({ config: VQZ_CONFIG });
  const g = gate.json;
  if (!g || g.result !== "PASS" || g.passed !== 8 || g.total !== 8) {
    return { status: "blocked", stage: "extractor_contract", result: g };
  }

  const recResult = await runExtractor({ config: VQZ_CONFIG, mode: "records" });
  const records: any[] = Array.isArray(recResult.json?.records) ? recResult.json.records : [];
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
