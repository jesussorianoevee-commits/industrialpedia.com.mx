// Shared scaffold for per-manufacturer extractors. Ported from the common contract
// already proven in industrialpedia-festo-extractor-v3 and
// industrialpedia-schneider-structured-extractor-v1: claim queue item -> fetch
// (manufacturer-specific) -> verify identity (manufacturer-specific) -> map to specs
// (manufacturer-specific) -> publish_part_v1 -> update queue/ingestion_records status.
// Only the truly shared steps (claim, alias lookup, publish+finalize) live here.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

export type SpecEntry = {
  property_code: string;
  attribute_name: string;
  original_value: string;
  numeric_value: string | null;
  unit: string | null;
  evidence_text: string;
  page: string;
};

export const clean = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim();
export const normLabel = (x: unknown) =>
  clean(x).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

export async function claimQueueItem(sb: SupabaseClient, queueId: string, requiredSourceKey?: string) {
  const { data: item, error } = await sb
    .from("candidate_enrichment_queue")
    .select("id,ingestion_record_id,family_code,evidence,ingestion_records!inner(payload,source_id,ingestion_sources!inner(config,source_key))")
    .eq("id", queueId)
    .eq("status", "queued")
    .eq("stage", "deterministic")
    .maybeSingle();
  if (error) return { error: error.message } as const;
  if (!item) return { idle: true } as const;

  const src = (item as any).ingestion_records.ingestion_sources;
  if (requiredSourceKey && src.source_key !== requiredSourceKey) {
    return { error: `queue_item_not_for_source:${requiredSourceKey}` } as const;
  }

  const claim = await sb
    .from("candidate_enrichment_queue")
    .update({ status: "processing", claimed_at: new Date().toISOString() })
    .eq("id", queueId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (!claim.data) return { busy: true } as const;

  return { item } as const;
}

export async function fetchAliasMap(sb: SupabaseClient, familyCode: string) {
  const { data: aliases, error: ae } = await sb
    .from("spec_attribute_aliases")
    .select("alias_normalized,property_code")
    .eq("family_code", familyCode)
    .eq("active", true);
  if (ae) throw ae;
  const { data: defs, error: de } = await sb.from("spec_property_definitions").select("property_code").eq("active", true);
  if (de) throw de;

  const defMap = new Map<string, string>((defs || []).map((z: any) => [normLabel(z.property_code), z.property_code]));
  const aliasRows = (aliases || [])
    .map((z: any) => ({ norm: normLabel(z.alias_normalized), code: z.property_code }))
    .filter((z: any) => z.norm)
    .sort((a: any, b: any) => b.norm.length - a.norm.length);
  return { defMap, aliasRows };
}

export async function markNeedsReview(sb: SupabaseClient, queueId: string, ingestionRecordId: string, reason: string, extraEvidence: Record<string, unknown> = {}) {
  await sb.from("candidate_enrichment_queue").update({ status: "needs_review", stage: "decision", last_error: reason, evidence: extraEvidence }).eq("id", queueId);
  await sb.from("ingestion_records").update({ status: "rejected", rejection_reason: reason, lifecycle_updated_at: new Date().toISOString() }).eq("id", ingestionRecordId);
}

export async function publishAndFinalize(sb: SupabaseClient, params: {
  queueId: string;
  ingestionRecordId: string;
  manufacturerId: string;
  partNumber: string;
  familyCode: string;
  sourceUrl: string;
  specs: SpecEntry[];
  partNumberEvidence: { evidence_text: string; page: string };
  dryRun: boolean;
  extractorVersion: string;
  priorEvidence?: Record<string, unknown>;
}) {
  const { queueId, ingestionRecordId, manufacturerId, partNumber, familyCode, sourceUrl, specs, partNumberEvidence, dryRun, extractorVersion, priorEvidence } = params;

  if (!specs.length) {
    await markNeedsReview(sb, queueId, ingestionRecordId, "no_verified_aliased_technical_specs", { ...priorEvidence, extractor: extractorVersion });
    return { status: "needs_review", reason: "no_verified_aliased_technical_specs" };
  }

  const { data: token, error: te } = await sb.rpc("get_secret_v1", { p_name: "industrialpedia_publish_pipeline_v1" });
  if (te || !token) {
    await markNeedsReview(sb, queueId, ingestionRecordId, "publish_pipeline_token_unavailable", { ...priorEvidence, extractor: extractorVersion });
    return { status: "needs_review", reason: "publish_pipeline_token_unavailable" };
  }

  const { data: pub, error: pe } = await sb.rpc("publish_part_v1", {
    p_manufacturer_id: manufacturerId,
    p_part_number: partNumber,
    p_family_code: familyCode,
    p_source_url: sourceUrl,
    p_part_number_evidence: partNumberEvidence,
    p_specs: specs,
    p_images: null,
    p_dry_run: dryRun,
    p_pipeline_token: token,
  });
  if (pe) throw pe;

  const resolved = ["published", "already_exists_evidence_added", "already_exists", "would_publish"].includes(pub?.status);
  const evidence = { ...priorEvidence, extractor: extractorVersion, spec_source: sourceUrl, specs_found: specs.length, publish_result: pub, dry_run: dryRun, verified_at: new Date().toISOString() };

  if (dryRun) {
    await sb.from("candidate_enrichment_queue").update({ status: "queued", stage: "deterministic", claimed_at: null, evidence, last_error: resolved ? null : (pub?.reason || "publication_rejected") }).eq("id", queueId);
    await sb.from("ingestion_records").update({ status: "candidate", rejection_reason: null, lifecycle_updated_at: new Date().toISOString() }).eq("id", ingestionRecordId);
  } else {
    const qs = resolved ? "resolved" : pub?.status === "review_required" ? "needs_review" : "rejected";
    await sb.from("candidate_enrichment_queue").update({ status: qs, stage: "decision", resolved_part_id: pub?.part_id || null, last_error: resolved ? null : (pub?.reason || "publication_rejected"), evidence }).eq("id", queueId);
    await sb.from("ingestion_records").update({ status: resolved ? "resolved" : "rejected", lifecycle_updated_at: new Date().toISOString() }).eq("id", ingestionRecordId);
  }

  return { status: resolved ? (dryRun ? "would_publish" : "resolved") : "needs_review", publish_status: pub?.status, specs_found: specs.length, part_number: partNumber, family_code: familyCode, source_url: sourceUrl, dry_run: dryRun };
}
