// Closes the last manual gap in the SMC simple_datasheet pipeline: scan ->
// classify -> extract (all automatic, see smc_catalog_pipeline.ts) -> publish.
// Publishing stayed manual because it needs two decisions a document alone
// can't answer safely -- which technical_families family_code this document
// belongs to, and what the Modelo table's option columns semantically mean
// (a thread size? a diameter?). Both are recorded ONCE per family/document on
// smc_document_ingestion_queue (family_code, option_column_property_code) by
// a human, via a normal UPDATE -- not guessed here. Once both are set, every
// SKU in that document publishes automatically on every future cron tick,
// and any still-unmapped spec label is skipped rather than blocking
// publication (see resolveLabel), so a new document from an already-known
// family with one new label still gets its identity + known specs live
// immediately, instead of waiting on a human for the whole batch.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { fetchAliasMap, clean, normLabel } from "../manufacturer_worker.ts";

const EXTRACTOR_VERSION = "smc-simple-datasheet-auto-publish-v1";
const SMC_MANUFACTURER_ID = "27b30ebd-c5f3-4316-a1b4-fbf7904912d6";

// is_technical_specification_v1 (shared publish gate) accepts a value with an
// explicit unit in any language, but a bare categorical value (e.g. "Rc3/8")
// only passes via its English qualitative-attribute keyword list. Decided
// once per property_code here, not per document, matching the same override
// already used for the ZP3C batch ("Tamaño de conexión" -> "Connection").
const GATE_ATTRIBUTE_NAME_OVERRIDE: Record<string, string> = {
  thread: "Connection",
};

function val(s: string) {
  const m = clean(s).match(/([<>≤≥+\-]?\s*\d+(?:[.,]\d+)?)(?:\s*(?:\.\.|-|to)\s*\d+(?:[.,]\d+)?)?\s*([a-zA-ZµμΩω°%/²³][a-zA-Z0-9µμΩω°%/²³]*)/);
  return m ? { numeric_value: String(Number(m[1].replace(/\s+/g, "").replace(",", "."))), unit: m[2].toLowerCase() } : null;
}

// Same fuzzy alias scoring already proven in schneider.ts/siemens.ts: exact
// match beats "label contains alias" beats "alias contains label" (guarded by
// a minimum length so short aliases don't swallow unrelated longer labels).
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

export async function runSmcAutoPublish(sb: SupabaseClient, batchSizeRaw: unknown, publishReal: boolean) {
  const batchSize = Math.max(1, Math.min(10, Number(batchSizeRaw) || 3));
  const { data: rows, error } = await sb
    .from("smc_document_ingestion_queue")
    .select("id, filename, family_code, option_column_property_code, extraction_result, status")
    .eq("classification", "simple_datasheet")
    .not("extraction_result", "is", null)
    .neq("status", "published")
    .limit(batchSize);
  if (error) return { error: error.message };
  if (!rows?.length) return { status: "completed", processed: 0, results: [] };

  let token: string | null = null;
  if (publishReal) {
    const { data: t, error: te } = await sb.rpc("get_secret_v1", { p_name: "industrialpedia_publish_pipeline_v1" });
    if (te || !t) return { error: "publish_pipeline_token_unavailable" };
    token = t as string;
  }

  const results: any[] = [];
  for (const row of rows as any[]) {
    const filename = row.filename as string;
    const ext = row.extraction_result as any;

    if (!row.family_code || !row.option_column_property_code) {
      await sb.from("smc_document_ingestion_queue").update({
        status: "needs_review",
        notes: "family_code / option_column_property_code not set -- a human decides these once per family, see module doc",
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ filename, status: "needs_review", reason: "family_or_option_property_not_set" });
      continue;
    }
    if (!ext?.ok || !Array.isArray(ext.skus) || !ext.skus.length) {
      results.push({ filename, status: "skipped", reason: "no_usable_extraction" });
      continue;
    }

    const family = row.family_code as string;
    const optionProp = row.option_column_property_code as string;
    const sourceUrl = `https://smcworld.com/catalog/${encodeURIComponent(filename)}`;
    const { defMap, aliasRows } = await fetchAliasMap(sb, family);

    const sharedSpecEntries: any[] = [];
    for (const s of ext.sharedSpecs || []) {
      const code = resolveLabel(s.label, defMap, aliasRows);
      if (!code) continue; // unmapped label: skip it, don't block SKUs whose other specs DO map
      const numeric = val(s.value);
      sharedSpecEntries.push({
        property_code: code,
        attribute_name: GATE_ATTRIBUTE_NAME_OVERRIDE[code] || s.label,
        original_value: s.value,
        numeric_value: numeric?.numeric_value ?? null,
        unit: numeric?.unit ?? null,
        evidence_text: `${s.label}: ${s.value} | fuente=PDF SMC (${filename}), pagina ${ext.especPage || ext.modeloPage}`,
        page: String(ext.especPage || ext.modeloPage),
      });
    }

    const skuResults: any[] = [];
    for (const sku of ext.skus) {
      const specs = [...sharedSpecEntries];
      for (const optionLabel of Object.keys(sku.selections || {})) {
        specs.push({
          property_code: optionProp,
          attribute_name: GATE_ATTRIBUTE_NAME_OVERRIDE[optionProp] || optionProp,
          original_value: optionLabel,
          numeric_value: null,
          unit: null,
          evidence_text: `Modelo ${sku.part_number}: columna "${optionLabel}" marcada como seleccionada en la tabla Modelo | fuente=PDF SMC (${filename}), pagina ${ext.modeloPage}`,
          page: String(ext.modeloPage),
        });
      }

      const partNumberEvidence = {
        evidence_text: `${sku.part_number} listado en la tabla Modelo | fuente=PDF SMC (${filename}), pagina ${ext.modeloPage}`,
        page: String(ext.modeloPage),
      };

      const dry = await sb.rpc("publish_part_v1", {
        p_manufacturer_id: SMC_MANUFACTURER_ID,
        p_part_number: sku.part_number,
        p_family_code: family,
        p_source_url: sourceUrl,
        p_part_number_evidence: partNumberEvidence,
        p_specs: specs,
        p_images: null,
        p_dry_run: true,
        p_pipeline_token: null,
      });
      if (dry.error) { skuResults.push({ part_number: sku.part_number, status: "error", reason: dry.error.message }); continue; }
      const dryStatus = dry.data?.status;
      if (!["would_publish", "already_exists"].includes(dryStatus)) {
        skuResults.push({ part_number: sku.part_number, status: "needs_review", dry_run_result: dry.data });
        continue;
      }
      if (!publishReal) { skuResults.push({ part_number: sku.part_number, status: "would_publish", dry_run_result: dry.data }); continue; }

      const real = await sb.rpc("publish_part_v1", {
        p_manufacturer_id: SMC_MANUFACTURER_ID,
        p_part_number: sku.part_number,
        p_family_code: family,
        p_source_url: sourceUrl,
        p_part_number_evidence: partNumberEvidence,
        p_specs: specs,
        p_images: null,
        p_dry_run: false,
        p_pipeline_token: token,
      });
      if (real.error) { skuResults.push({ part_number: sku.part_number, status: "error", reason: real.error.message }); continue; }
      skuResults.push({ part_number: sku.part_number, status: real.data?.status, part_id: real.data?.part_id });
    }

    const allResolved = skuResults.every((r) => ["published", "already_exists_evidence_added", "already_exists", "would_publish"].includes(r.status));
    await sb.from("smc_document_ingestion_queue").update({
      status: !publishReal ? row.status : (allResolved ? "published" : "needs_review"),
      notes: JSON.stringify({ extractor: EXTRACTOR_VERSION, sku_results: skuResults }).slice(0, 4000),
      processed_at: allResolved && publishReal ? new Date().toISOString() : row.processed_at,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);

    results.push({ filename, family_code: family, skus: skuResults, dry_run: !publishReal });
  }

  return { status: "completed", processed: results.length, results };
}
