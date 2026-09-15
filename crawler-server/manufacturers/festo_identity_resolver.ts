// New (not a straight port): the bulk of the raw Festo backlog turned out to already be
// single-part datasheets named by part number (e.g. DataSheet/EN_US/536209.pdf), not whole
// catalogs — but the queue row never got a type_code/family_code, which festo.ts requires
// before it will even attempt extraction. The datasheet's own first page already states
// both (e.g. "Compact cylinder\nADN-12-30-A-P-A\nPart number: 536209"), using the exact
// same text layer festo.ts already parses for specs — this just reads the identity lines
// first, fills in the queue row, then hands off to the existing extractor.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { getDocumentProxy, extractText } from "npm:unpdf";
import { runFestoWorker } from "./festo.ts";
import { PREFIXES, familyFor } from "./festo_catalog_expander.ts";

const clean = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim();
const DATASHEET_RE = /\/DataSheet\/EN_US\/(\d{4,10})\.pdf$/i;
const TYPE_CODE_RE = /^([A-Z]{2,6})-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

async function resolveIdentity(pdfUrl: string): Promise<{ part_number: string; type_code: string; family_code: string } | null> {
  const m = pdfUrl.match(DATASHEET_RE);
  if (!m) return null;
  const partNumber = m[1];

  const r = await fetch(pdfUrl, { headers: { "User-Agent": "IndustrialpediaBot/1.0 (+https://industrialpedia.com.mx/bot-info)" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  const pdf = await getDocumentProxy(new Uint8Array(await r.arrayBuffer()));
  const z: any = await extractText(pdf, { mergePages: false });
  const firstPage = String(Array.isArray(z.text) ? z.text[0] : z.text || "");
  const lines = firstPage.split(/\r?\n/).map(clean).filter(Boolean).slice(0, 8);

  for (const line of lines) {
    const candidate = line.toUpperCase();
    const tm = candidate.match(TYPE_CODE_RE);
    if (tm && PREFIXES.includes(tm[1])) {
      return { part_number: partNumber, type_code: candidate, family_code: familyFor(candidate) };
    }
  }
  return null;
}

export async function runFestoIdentityResolverAndExtract(sb: SupabaseClient, queueId: string, publishReal: boolean) {
  const { data: item, error: qe } = await sb
    .from("candidate_enrichment_queue")
    .select("id,status,stage,evidence,family_code,ingestion_records!inner(payload)")
    .eq("id", queueId)
    .eq("status", "queued").eq("stage", "deterministic")
    .maybeSingle();
  if (qe || !item) return { status: "idle" };

  const p: any = (item as any).ingestion_records.payload || {};
  const ev: any = (item as any).evidence || {};
  const hasIdentity = clean(ev.part_number || p.part_number) && clean(ev.type_code || p.type_code) && clean((item as any).family_code || ev.family_code || p.family_code);
  if (hasIdentity) return await runFestoWorker(sb, queueId, publishReal);

  const pdfUrl = clean(ev.source_url || p.source_url || p.pdf_url);
  let identity: { part_number: string; type_code: string; family_code: string } | null = null;
  try {
    identity = await resolveIdentity(pdfUrl);
  } catch {
    identity = null;
  }
  if (!identity) {
    await sb.from("candidate_enrichment_queue").update({ status: "needs_review", stage: "decision", last_error: "identity_not_derivable_from_datasheet", worker_version: "festo-identity-resolver-v1" }).eq("id", queueId);
    return { status: "needs_review", reason: "identity_not_derivable_from_datasheet" };
  }

  await sb.from("candidate_enrichment_queue").update({
    family_code: identity.family_code,
    evidence: { ...ev, part_number: identity.part_number, type_code: identity.type_code, family_code: identity.family_code, source_url: pdfUrl, identity_resolved_by: "festo-identity-resolver-v1" },
  }).eq("id", queueId);

  return await runFestoWorker(sb, queueId, publishReal);
}

export async function runFestoIdentityBatch(sb: SupabaseClient, batchSizeRaw: number, publishReal: boolean) {
  const batchSize = Math.max(1, Math.min(Number(batchSizeRaw) || 1, 20));

  const { data: src } = await sb.from("ingestion_sources").select("id").eq("source_key", "festo_catalog_v1").single();
  if (!src) return { error: "festo_source_missing" };

  // Scan in pages for rows whose payload is a numeric single-part datasheet (the shape
  // resolveIdentity() can actually work with) rather than always hitting the oldest rows,
  // which are mostly non-cylinder accessory catalogs the resolver correctly can't handle.
  const matched: string[] = [];
  let offset = 0;
  const pageSize = 300;
  while (matched.length < batchSize && offset < 6000) {
    const { data: page, error } = await sb
      .from("candidate_enrichment_queue")
      .select("id, ingestion_records!inner(source_id, payload)")
      .eq("status", "queued").eq("stage", "deterministic")
      .eq("ingestion_records.source_id", src.id)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) return { error: "select_failed", detail: error.message };
    const batch = page || [];
    for (const row of batch as any[]) {
      const u = String(row.ingestion_records?.payload?.pdf_url || "");
      if (DATASHEET_RE.test(u)) matched.push(row.id);
      if (matched.length >= batchSize) break;
    }
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  if (!matched.length) return { status: "idle", processed: 0, results: [] };

  const results: any[] = [];
  for (const queueId of matched) {
    results.push(await runFestoIdentityResolverAndExtract(sb, queueId, publishReal));
  }
  return { status: "completed", processed: results.length, results };
}
