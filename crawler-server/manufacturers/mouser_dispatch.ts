// Ported from the Supabase Edge Function `industrialpedia-mouser-enrichment-worker-v1` (v44,
// "mouser-enrichment-worker-v41-nonretriable-known-blocks"): routes each claimed Mouser
// candidate to Schneider/Siemens/generic-structured-acquisition (falling back to the linear
// PDF extractor on specific recoverable reasons), exactly mirroring the original's routing
// decisions. Unlike the original (which processes one row per HTTP call, driven by a Supabase
// cron every 10 minutes), this loops over a batch in one call so the VPS's own scheduler can
// drain the backlog at a real rate instead of one row at a time.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { runSchneiderWorker } from "./schneider.ts";
import { runSiemensWorker } from "./siemens.ts";
import { runStructuredAcquisition } from "./structured_acquisition.ts";
import { runMouserLinearWorker } from "./mouser_linear.ts";

const VERSION = "mouser-enrichment-worker-v41-vps-port";
const MAX_ATTEMPTS = 3;
const KNOWN_PERMANENT = /mouser_proxy_not_pdf|no_verified_technical_source_available/i;
const LINEAR_FALLBACK_REASONS = new Set(["no_verified_aliased_technical_specs", "official_identity_not_found", "no_verified_technical_specs", "structured_identity_not_found", "source_url_mpn_or_family_missing", "unmapped_technical_properties"]);

async function linkProvenance(sb: SupabaseClient, ingestionRecordId: string, partId: any) {
  if (partId && ingestionRecordId) await sb.from("parts").update({ source_record_id: ingestionRecordId }).eq("id", partId).is("source_record_id", null);
}

async function processOne(sb: SupabaseClient, row: any, publishReal: boolean) {
  const p: any = row.ingestion_records.payload || {};
  const m = clean(p.manufacturer).toLowerCase();
  const family = clean(row.family_code || p.family_code);

  const fail = async (status: string, reason: string, stage = "decision") => {
    await sb.from("candidate_enrichment_queue").update({ status, stage, last_error: reason, worker_version: VERSION, claimed_at: status === "queued" ? null : new Date().toISOString() }).eq("id", row.id);
    return { id: row.id, status, reason, worker_version: VERSION };
  };

  if (!m) return fail("needs_review", "manufacturer_missing_at_enrichment_routing");
  if (!family) return fail("needs_review", "family_missing_at_enrichment_routing");

  const route = await sb.rpc("validate_manufacturer_routing_v1", { p_queue_id: row.id });
  if (route.error || !route.data?.allowed) return fail("needs_review", route.data?.reason || "manufacturer_routing_not_registered");
  if ((row.attempts || 0) > MAX_ATTEMPTS) return fail("needs_review", `max_attempts_exceeded_permanent_failure_after_${row.attempts}_tries`);

  const linear = async (reason: string) => {
    const l = await runMouserLinearWorker(sb, row.id, publishReal);
    if ((l as any).error) return fail((l as any).message && KNOWN_PERMANENT.test((l as any).message) ? "needs_review" : "queued", `mouser_linear_extractor:${(l as any).error}:${(l as any).message || ""}`.slice(0, 900), "decision");
    if ((l as any).status === "resolved" && (route.data as any)?.part_id) await linkProvenance(sb, row.ingestion_record_id, (route.data as any).part_id);
    return { id: row.id, status: (l as any).status || "processed", extractor: "mouser-linear-extractor-v1", fallback_reason: reason, detail: l, manufacturer: p.manufacturer, family_code: family, worker_version: VERSION };
  };

  try {
    if (m.includes("schneider electric")) {
      const x = await runSchneiderWorker(sb, row.id, publishReal);
      if ((x as any).status) {
        if ((x as any).status === "needs_review" && LINEAR_FALLBACK_REASONS.has(String((x as any).reason || ""))) return await linear(String((x as any).reason));
        return { id: row.id, status: (x as any).status, extractor: "industrialpedia-schneider-structured-extractor-v1", detail: x, manufacturer: p.manufacturer, family_code: family, worker_version: VERSION };
      }
      return await linear(`schneider_extractor_error:${(x as any).error || ""}`);
    }

    if (m.includes("siemens") || family.toLowerCase().startsWith("siemens_") || String(p.source_url || p.datasheet_url || "").toLowerCase().includes("siemens.com")) {
      const x = await runSiemensWorker(sb, row.id, publishReal);
      if ((x as any).error) return await fail("needs_review", `siemens_extractor:${(x as any).error}:${(x as any).message || ""}`.slice(0, 900));
      return { id: row.id, status: (x as any).status || "processed", extractor: "industrialpedia-siemens-structured-extractor-v1", detail: x, manufacturer: p.manufacturer, family_code: family, worker_version: VERSION };
    }

    const s = await runStructuredAcquisition(sb, { queueId: row.id, familyCode: row.family_code, sourceUrl: p.source_url || p.datasheet_url || p.pdf_url });
    if ((s as any).status === "extraction_verified") {
      const specs = Array.isArray((s as any).specs) ? (s as any).specs : [];
      const { data: token, error: te } = await sb.rpc("get_secret_v1", { p_name: "industrialpedia_publish_pipeline_v1" });
      if (te || !token) throw new Error("publish_pipeline_token_unavailable");
      const { data: pub, error: pe } = await sb.rpc("publish_part_v1", {
        p_manufacturer_id: p.manufacturer_id, p_part_number: (s as any).part_number, p_family_code: family, p_source_url: (s as any).source_url,
        p_part_number_evidence: (s as any).part_number_evidence, p_specs: specs, p_images: null, p_dry_run: !publishReal, p_pipeline_token: token,
      });
      if (pe) throw pe;
      const qst = ["published", "already_exists_evidence_added", "already_exists", "would_publish"].includes(pub?.status) ? "resolved" : pub?.status === "review_required" ? "needs_review" : "rejected";
      await sb.from("candidate_enrichment_queue").update({ status: qst, stage: "decision", last_error: qst === "resolved" ? null : (pub?.reason || "publication_rejected"), worker_version: VERSION, evidence: pub, resolved_part_id: pub?.part_id || null }).eq("id", row.id);
      if (pub?.part_id) await linkProvenance(sb, row.ingestion_record_id, pub.part_id);
      return { id: row.id, status: qst, publish_status: pub?.status, specs_found: specs.length, manufacturer: p.manufacturer, family_code: family, worker_version: VERSION };
    }
    if ((s as any).status === "needs_review") {
      const reason = String((s as any).reason || "");
      if (LINEAR_FALLBACK_REASONS.has(reason)) return await linear(reason);
      return { id: row.id, status: "needs_review", reason: reason || "structured_needs_review", manufacturer: p.manufacturer, family_code: family, worker_version: VERSION };
    }
    return await fail("needs_review", `structured_acquisition:${(s as any).error || ""}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const permanent = KNOWN_PERMANENT.test(msg);
    const retriable = !permanent && /timeout|fetch failed|connection|network|temporarily/i.test(msg);
    const willRetry = retriable && (row.attempts || 0) < MAX_ATTEMPTS;
    return await fail(willRetry ? "queued" : "needs_review", msg, willRetry ? "deterministic" : "decision");
  }
}

const clean = (x: unknown) => String(x ?? "").trim();

export async function runMouserDispatch(sb: SupabaseClient, batchSizeRaw: number, publishReal: boolean) {
  const batchSize = Math.max(1, Math.min(Number(batchSizeRaw) || 1, 50));
  const results: any[] = [];

  for (let i = 0; i < batchSize; i++) {
    const { data: claimed, error: claimErr } = await sb.rpc("claim_deterministic_queue_row_v1", { p_worker_version: VERSION });
    if (claimErr) return { error: "queue_claim_failed", detail: claimErr.message, processed: results.length, results };
    if (!claimed?.length) break;

    const c = claimed[0];
    const { data: full, error: fullErr } = await sb
      .from("candidate_enrichment_queue")
      .select("id,priority,ingestion_record_id,attempts,family_code,ingestion_records!inner(id,payload,source_id,ingestion_sources!inner(source_key,ingestion_mode,config))")
      .eq("id", c.id)
      .maybeSingle();
    if (fullErr || !full) continue;

    results.push(await processOne(sb, full, publishReal));
  }

  return { status: results.length ? "completed" : "idle", worker: VERSION, publish_real: publishReal, processed: results.length, results };
}
