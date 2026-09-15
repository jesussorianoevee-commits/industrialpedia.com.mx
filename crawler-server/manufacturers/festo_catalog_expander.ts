// Ported from the Supabase Edge Function `industrialpedia-festo-autodiscovery-v1` (v15,
// "festo-catalog-expander-v14"): the missing link between raw Festo catalog PDFs (whole
// product-family documents, discovered by crawler_discover.ts) and festo.ts's extractor
// (which needs one specific part's exact single-part datasheet URL). Finds a queued
// candidate whose PDF filename matches a known Festo product-family prefix, downloads it,
// reads its ordering table (part_number followed by a TYPE_CODE-prefix-matching row within
// a few text items), and queues one new candidate per part with the exact single-part
// datasheet URL festo.ts expects.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { getDocumentProxy } from "npm:unpdf";

const VERSION = "festo-catalog-expander-v14-vps-port";
const clean = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim();
const norm = (x: unknown) => clean(x).toUpperCase().replace(/[\s._/]+/g, "");
export const PREFIXES = ["ADN", "ADVC", "ADVUL", "DSNU", "DSBC", "DNC", "DSBF", "DSBG", "DGST", "DGSL", "DSNA", "DSNB", "DGC", "DGS", "DN", "ESNU", "DFSP", "DRVS", "DSW"];
export const familyFor = (t: string) => /^(DGST|DGSL)/i.test(t) ? "pneumatic_mini_slide" : "pneumatic_cylinder";
const prefixFromFile = (u: string): string | null => {
  try { const f = new URL(u).pathname.split("/").pop() || ""; const n = f.toUpperCase(); return PREFIXES.find((p) => n.startsWith(p)) || null; } catch { return null; }
};

function extractCatalogPairsFromItems(items: string[], prefix: string) {
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const outRows: { part_number: string; type_code: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const partNumber = clean(items[i]);
    if (!/^\d{4,10}$/.test(partNumber)) continue;
    for (let j = i + 1; j <= Math.min(i + 4, items.length - 1); j++) {
      const candidate = clean(items[j]);
      if (/^\d{4,10}$/.test(candidate)) break;
      if (new RegExp(`^${esc}-`, "i").test(candidate)) {
        const typeCode = candidate.toUpperCase();
        const key = `${partNumber}|${norm(typeCode)}`;
        if (!seen.has(key)) { seen.add(key); outRows.push({ part_number: partNumber, type_code: typeCode }); }
        break;
      }
    }
    if (outRows.length >= 250) break;
  }
  return outRows;
}

export async function runFestoCatalogExpander(sb: SupabaseClient, testPdfUrl?: string) {
  const { data: src, error: se } = await sb.from("ingestion_sources").select("id,config").eq("source_key", "festo_catalog_v1").single();
  if (se || !src) return { error: "festo_source_missing" };

  const { data: job, error: je } = await sb.from("ingestion_jobs").insert({ source_id: src.id, status: "running", batch_size: 1, metadata: { worker: "festo_catalog_expander", version: VERSION, mode: testPdfUrl ? "direct_test" : "queued_catalog" } }).select("id").single();
  if (je || !job) return { error: "job_create_failed", detail: je?.message || "unknown" };
  const jobId = job.id;

  let docs: any[] = [];
  if (testPdfUrl) {
    docs = [{ id: null, ingestion_record_id: null, evidence: {}, ingestion_records: { source_id: src.id, payload: { pdf_url: clean(testPdfUrl), source_page_url: clean(testPdfUrl) } } }];
  } else {
    let offset = 0;
    const pageSize = 500;
    while (offset < 10000 && !docs.length) {
      const { data, error } = await sb
        .from("candidate_enrichment_queue")
        .select("id,ingestion_record_id,evidence,created_at,ingestion_records!inner(source_id,payload)")
        .eq("status", "queued").eq("stage", "deterministic").eq("ingestion_records.source_id", src.id)
        .order("created_at", { ascending: true }).range(offset, offset + pageSize - 1);
      if (error) {
        await sb.from("ingestion_jobs").update({ status: "failed", error_count: 1, last_error: error.message, completed_at: new Date().toISOString() }).eq("id", jobId);
        return { error: error.message };
      }
      const batch = data || [];
      docs = batch.filter((q: any) => {
        const p = q.ingestion_records.payload || {}, u = clean(p.pdf_url || p.source_url);
        return /\/Documentation\//i.test(u) && !!p.source_page_url && !!prefixFromFile(u);
      }).slice(0, 1);
      if (docs.length || batch.length < pageSize) break;
      offset += pageSize;
    }
  }

  if (!docs.length) {
    await sb.from("ingestion_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", jobId);
    return { status: "idle", version: VERSION, reason: "no_recognized_family_catalog_documents", job_id: jobId };
  }

  const results: any[] = [];
  let totalQueued = 0, totalRejected = 0, totalProcessed = 0, totalErrors = 0;

  for (const q of docs) {
    const p = q.ingestion_records.payload || {};
    const pdfUrl = clean(p.pdf_url || p.source_url);
    const prefix = prefixFromFile(pdfUrl)!;
    try {
      const rr = await fetch(pdfUrl, { redirect: "follow", headers: { "User-Agent": "IndustrialpediaBot/1.0" }, signal: AbortSignal.timeout(45000) });
      if (!rr.ok) throw new Error(`family_pdf_http_${rr.status}`);
      const pdf = await getDocumentProxy(new Uint8Array(await rr.arrayBuffer()));
      const found: any[] = [];
      for (let pageNo = 1; pageNo <= pdf.numPages && found.length < 250; pageNo++) {
        const page = await pdf.getPage(pageNo);
        const content = await page.getTextContent();
        const items = (content.items || []).map((i: any) => clean(i.str)).filter(Boolean);
        for (const pair of extractCatalogPairsFromItems(items, prefix)) {
          if (!found.some((x) => x.part_number === pair.part_number && x.type_code === pair.type_code)) found.push({ ...pair, family_code: familyFor(pair.type_code), source_page: pageNo });
          if (found.length >= 250) break;
        }
      }

      let queued = 0, skipped = 0;
      for (const x of found) {
        const now = new Date().toISOString();
        const exactPdf = `https://ftp.festo.com/Public/PNEUMATIC/SOFTWARE_SERVICE/DataSheet/EN_US/${x.part_number}.pdf`;
        const ext = `festo-catalog:${pdfUrl}:${x.part_number}:${norm(x.type_code)}`;
        const payload = {
          manufacturer: "Festo", manufacturer_id: "04b49665-3413-48b9-8056-ce6c509c4abd", source_url: exactPdf, pdf_url: exactPdf, original_url: exactPdf,
          title: `Festo ${x.type_code}`, description: "Product identity deterministically extracted from official Festo family catalog",
          discovery_provider: "festo", discovery_method: "deterministic_catalog_ordering_table", catalog_source_url: pdfUrl, catalog_source_page_url: p.source_page_url,
          manufacturer_part_number: x.part_number, part_number: x.part_number, type_code: x.type_code, family_code: x.family_code, identity_page: String(x.source_page), discovered_at: now,
        };
        const ir = await sb.from("ingestion_records").upsert({ job_id: jobId, source_id: src.id, external_key: ext, payload, status: "candidate", first_seen_at: now, last_seen_at: now, lifecycle_updated_at: now }, { onConflict: "source_id,external_key" }).select("id").single();
        if (ir.error || !ir.data) { skipped++; continue; }
        const cq = await sb.from("candidate_enrichment_queue").upsert({
          ingestion_record_id: ir.data.id, status: "queued", stage: "deterministic", priority: 80, family_code: x.family_code,
          evidence: { source: "festo_family_catalog", catalog_source_url: pdfUrl, catalog_source_page_url: p.source_page_url, source_url: exactPdf, part_number: x.part_number, type_code: x.type_code, family_code: x.family_code, identity_page: String(x.source_page), discovery_method: "deterministic_catalog_ordering_table", expander_version: VERSION },
        }, { onConflict: "ingestion_record_id" });
        if (cq.error) skipped++; else queued++;
      }

      totalQueued += queued; totalRejected += skipped; totalProcessed++;

      if (q.id) {
        if (skipped > 0) {
          await sb.from("candidate_enrichment_queue").update({ status: "needs_review", stage: "decision", worker_version: VERSION, last_error: `catalog_persist_partial:${skipped}/${found.length}`, evidence: { ...(q.evidence || {}), expander: VERSION, catalog_pdf: pdfUrl, products_found: found.length, products_queued: queued, products_skipped: skipped, expanded_at: new Date().toISOString() } }).eq("id", q.id);
        } else {
          await sb.from("candidate_enrichment_queue").update({ status: "resolved", stage: "decision", worker_version: VERSION, last_error: null, evidence: { ...(q.evidence || {}), expander: VERSION, catalog_pdf: pdfUrl, products_found: found.length, products_queued: queued, products_skipped: skipped, expanded_at: new Date().toISOString() } }).eq("id", q.id);
          await sb.from("ingestion_records").update({ status: "resolved", lifecycle_updated_at: new Date().toISOString() }).eq("id", q.ingestion_record_id);
        }
      }
      results.push({ queue_id: q.id, catalog_pdf: pdfUrl, prefix, pages: pdf.numPages, pairs_found: found.length, products_queued: queued, products_skipped: skipped, products: found.slice(0, 50) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      totalErrors++;
      if (q.id) await sb.from("candidate_enrichment_queue").update({ status: "needs_review", stage: "decision", last_error: msg, worker_version: VERSION }).eq("id", q.id);
      results.push({ queue_id: q.id, status: "needs_review", reason: msg });
    }
  }

  await sb.from("ingestion_jobs").update({ status: totalErrors > 0 ? "failed" : "completed", processed_count: totalProcessed, accepted_count: totalQueued, rejected_count: totalRejected, error_count: totalErrors, last_error: totalErrors ? "catalog_expander_errors" : null, completed_at: new Date().toISOString() }).eq("id", jobId);
  return { status: totalErrors > 0 ? "completed_with_errors" : "completed", version: VERSION, job_id: jobId, processed: docs.length, results };
}
