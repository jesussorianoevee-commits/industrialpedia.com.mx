// Ported from the Supabase Edge Function `industrialpedia-bearing-enrichment-worker-v3`
// (v3): batch-claims deep_groove_ball_bearing candidates (NSK and NTN both use this family
// code) and resolves them via structured_reader.ts (in-process instead of the original's
// HTTP call to a sibling function). Kept its own claim/dry-run logic rather than routing
// through manufacturer_worker.ts's publishAndFinalize — that helper's dry-run semantics
// (re-queue for retry) differ from this worker's original behavior (dry-run leaves the row
// in needs_review as a preview), and changing that would change production behavior.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { clean } from "./manufacturer_worker.ts";
import { runStructuredReader } from "./structured_reader.ts";

const VERSION = "bearing-enrichment-worker-v3-vps-port";
const FAMILY_CODE = "deep_groove_ball_bearing";

export async function runBearingEnrichment(sb: SupabaseClient, batchSizeRaw: number, dryRun: boolean) {
  const batchSize = Math.max(1, Math.min(Number(batchSizeRaw) || 1, 3));

  const { data: rows, error: selErr } = await sb
    .from("candidate_enrichment_queue")
    .select("id, ingestion_record_id, attempts, family_code, normalized_mpn, normalized_brand, ingestion_records!inner(id, payload, source_id)")
    .eq("family_code", FAMILY_CODE)
    .eq("stage", "deterministic")
    .eq("status", "queued")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (selErr) return { error: "select_failed", detail: selErr.message };
  if (!rows?.length) return { status: "idle", dry_run: dryRun, worker: VERSION };

  const results: any[] = [];

  const { data: tokenData, error: tokenErr } = await sb.rpc("get_secret_v1", { p_name: "industrialpedia_publish_pipeline_v1" });
  if (!dryRun && (tokenErr || !clean(tokenData))) return { error: "publish_pipeline_token_unavailable" };
  const pipelineToken = dryRun ? null : clean(tokenData);

  for (const row of rows as any[]) {
    const claim = await sb
      .from("candidate_enrichment_queue")
      .update({ status: "processing", claimed_at: new Date().toISOString(), worker_version: VERSION, attempts: Number(row.attempts || 0) + 1 })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (claim.error || !claim.data) {
      results.push({ queue_id: row.id, status: "skipped_race" });
      continue;
    }

    const payload = row.ingestion_records?.payload || {};
    const partNumber = clean(payload.part_number || payload.manufacturer_part_number || row.normalized_mpn);
    const sourceUrl = clean(payload.source_url || payload.datasheet_url || payload.pdf_url || payload.url);
    const manufacturerId = clean(payload.manufacturer_id);
    const familyCode = FAMILY_CODE;

    const fail = async (reason: string, extra: Record<string, unknown> = {}) => {
      await sb.from("candidate_enrichment_queue").update({ status: "needs_review", stage: "decision", last_error: reason, evidence: { worker: VERSION, ...extra } }).eq("id", row.id);
      results.push({ queue_id: row.id, status: "needs_review", reason, ...extra });
    };

    if (!partNumber || !sourceUrl || !manufacturerId) {
      await fail("bearing_candidate_missing_required_payload", { has_part_number: !!partNumber, has_source_url: !!sourceUrl, has_manufacturer_id: !!manufacturerId });
      continue;
    }

    let reader: any;
    try {
      reader = await runStructuredReader(sb, { part_number: partNumber, family_code: familyCode, source_url: sourceUrl, diagnostic: false });
    } catch (e) {
      await fail("structured_reader_call_failed", { message: e instanceof Error ? e.message : String(e) });
      continue;
    }

    if (reader?.status !== "extraction_verified" || !Array.isArray(reader?.specs) || reader.specs.length === 0) {
      await fail("bearing_structured_reader_did_not_verify", { reader_status: reader?.status || null, reader_reason: reader?.reason || null, specs_found: reader?.specs_found || 0, reader });
      continue;
    }

    const identityPage = clean(reader.specs[0]?.page) || "1";
    const { data: pub, error: pubErr } = await sb.rpc("publish_part_v1", {
      p_manufacturer_id: manufacturerId,
      p_part_number: partNumber,
      p_family_code: familyCode,
      p_source_url: sourceUrl,
      p_part_number_evidence: { evidence_text: partNumber, source: "deterministic_structured_reader", url: sourceUrl, page: identityPage },
      p_specs: reader.specs,
      p_images: null,
      p_dry_run: dryRun,
      p_pipeline_token: pipelineToken,
    });
    if (pubErr) {
      await fail("publish_part_v1_error", { error: pubErr.message, reader_specs: reader.specs });
      continue;
    }

    if (dryRun) {
      await sb.from("candidate_enrichment_queue").update({
        status: "needs_review", stage: "decision",
        evidence: { worker: VERSION, dry_run: true, reader: { extractor: reader.extractor, specs_found: reader.specs_found }, publication_preview: pub },
      }).eq("id", row.id);
    } else {
      const published = ["published", "would_publish", "already_exists_evidence_added", "already_exists"].includes(pub?.status);
      await sb.from("candidate_enrichment_queue").update({
        status: published ? "resolved" : (pub?.status === "review_required" || pub?.status === "needs_review" ? "needs_review" : "rejected"),
        stage: "decision", evidence: pub,
        confidence: pub?.specs_accepted && pub?.specs_total ? Number(pub.specs_accepted) / Number(pub.specs_total) : null,
      }).eq("id", row.id);
      await sb.from("ingestion_records").update({ status: published ? "resolved" : "rejected", lifecycle_updated_at: new Date().toISOString() }).eq("id", row.ingestion_record_id);
    }

    results.push({
      queue_id: row.id, part_number: partNumber, family_code: familyCode, source_url: sourceUrl,
      reader_extractor: reader.extractor, specs_found: reader.specs_found, specs: reader.specs,
      publication_status: pub?.status || null, dry_run: dryRun,
    });
  }

  return { status: "completed", worker: VERSION, dry_run: dryRun, processed: results.length, results };
}
