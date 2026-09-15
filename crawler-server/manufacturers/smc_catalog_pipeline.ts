// SMC catalog PDF triage: scans the auto-synced local folder
// (/opt/industrialpedia/smc-catalogs, filled by the user's Windows scheduled
// task) and classifies each PDF deterministically so processing new drops no
// longer requires manually opening and reading every file:
//
//   - "configurator": has a "Forma de pedido" style ordering page (a
//     combinatorial build-your-own part-number catalog, e.g. ZP3C). These
//     need per-series identity/spec mapping worked out by hand (same as the
//     ZP3C proof-of-concept) -- queued for manual handling, never guessed.
//   - "simple_datasheet": short document (<=6 pages) with real table cells
//     reading exactly "Modelo" and "Especificaciones" (verified via the
//     same X/Y grid reconstruction used elsewhere, not a substring match on
//     flattened text -- a flattened-text check produced a false positive on
//     a services brochure that merely used both words in prose).
//   - "unclassified_review": neither signal found -- most of these are
//     genuinely not per-part catalogs (training guides, safety brochures,
//     vertical-industry flyers) and are expected to stay here permanently,
//     not a classifier failure to chase down for every file.
//
// This only classifies; it does not publish anything. See
// extractSimpleDatasheet for the (dry-run-only) extraction step.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { getDocumentProxy } from "npm:unpdf";

const SMC_CATALOG_DIR = "/opt/industrialpedia/smc-catalogs";
const MAX_PAGES_SCANNED = 15;

type Frag = { text: string; x: number; y: number };

function grid(fs: Frag[]): Frag[][] {
  const bands: Frag[][] = [];
  let last: number | null = null;
  for (const f of [...fs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    if (last === null || Math.abs(last - f.y) > 1) { bands.push([f]); last = f.y; } else bands[bands.length - 1].push(f);
  }
  return bands;
}

async function fragsForPage(doc: any, pageNum: number): Promise<Frag[]> {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  const out: Frag[] = [];
  for (const item of content.items as any[]) {
    if (!(item.str ?? "").trim()) continue;
    const t = item.transform ?? [1, 0, 0, 1, 0, 0];
    out.push({ text: String(item.str), x: +t[4], y: +t[5] });
  }
  return out;
}

// A broken/missing ToUnicode CMap makes pdf.js emit control-range or
// private-use characters instead of real text -- confirmed on real SMC
// files (IBV-A-MX.pdf, JSB-A-MX.pdf: fully unreadable garbage; SGH-B-MX.pdf:
// ~11% garbled). A classifier that only looks for keyword matches silently
// misreads these as "no product data" when the true problem is "can't read
// this file's text at all" -- a different failure needing OCR, not more
// keyword tuning.
function garbledRatio(text: string): number {
  if (!text.length) return 0;
  let bad = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    if (code < 32 || (code > 126 && code < 160)) bad++;
  }
  return bad / text.length;
}

async function classifyDocument(path: string) {
  const bytes = await Deno.readFile(path);
  const doc = await getDocumentProxy(bytes);
  const pageCount = doc.numPages;
  const capPages = Math.min(pageCount, MAX_PAGES_SCANNED);
  let hasOrderingPage = false;
  let hasExactModeloCell = false;
  let hasExactEspecCell = false;
  let modeloPage = -1;
  let totalChars = 0;
  let totalGarbled = 0;

  for (let p = 1; p <= capPages; p++) {
    const fs = await fragsForPage(doc, p);
    const fullText = fs.map((f) => f.text).join(" ");
    totalChars += fullText.length;
    totalGarbled += garbledRatio(fullText) * fullText.length;
    if (/Forma de pedido|C[oó]mo realizar el pedido|C[oó]digo de pedido/i.test(fullText)) hasOrderingPage = true;
    for (const band of grid(fs)) {
      const bandText = band.map((f) => f.text).join("").trim();
      if (bandText === "Modelo") { hasExactModeloCell = true; if (modeloPage < 0) modeloPage = p; }
      if (bandText === "Especificaciones") hasExactEspecCell = true;
    }
  }

  const ratio = totalChars > 0 ? totalGarbled / totalChars : 0;
  let classification: string;
  if (totalChars === 0) classification = "text_extraction_failed";
  else if (ratio > 0.03) classification = "text_extraction_failed";
  else if (hasOrderingPage) classification = "configurator";
  else if (pageCount <= 6 && hasExactModeloCell && hasExactEspecCell) classification = "simple_datasheet";
  else classification = "unclassified_review";

  return { pageCount, classification, modeloPage: modeloPage >= 0 ? modeloPage : null, totalChars, garbledRatio: Number(ratio.toFixed(3)) };
}

// Registers any PDF present in the local folder but not yet in the queue,
// classifying it as it's registered. Idempotent: re-running only picks up
// genuinely new filenames (the sync script never overwrites/renames existing
// ones, so filename is a stable dedupe key).
export async function scanAndClassifySmcCatalogs(sb: SupabaseClient, reclassifyStatuses?: string[]) {
  let entries: Deno.DirEntry[];
  try {
    entries = [...Deno.readDirSync(SMC_CATALOG_DIR)];
  } catch (e) {
    return { error: "catalog_dir_unreadable", detail: e instanceof Error ? e.message : String(e) };
  }
  const pdfNames = entries.filter((e) => e.isFile && e.name.toLowerCase().endsWith(".pdf")).map((e) => e.name);
  if (pdfNames.length === 0) return { status: "completed", scanned: 0, newly_classified: 0, results: [] };

  const { data: known, error: knownErr } = await sb.from("smc_document_ingestion_queue").select("filename, status").in("filename", pdfNames);
  if (knownErr) return { error: "queue_read_failed", detail: knownErr.message };
  const knownMap = new Map((known || []).map((r: any) => [r.filename, r.status]));
  // Normally only classify filenames the queue has never seen. Pass
  // reclassifyStatuses (e.g. ["unclassified_review"]) to re-run the
  // classifier on rows already sitting in one of those statuses too --
  // used when the classifier itself improves, not on every routine tick.
  const targets = pdfNames.filter((n) => {
    const existingStatus = knownMap.get(n);
    if (existingStatus === undefined) return true;
    return Boolean(reclassifyStatuses?.includes(existingStatus));
  });

  const results: any[] = [];
  for (const name of targets) {
    const now = new Date().toISOString();
    try {
      const { pageCount, classification, modeloPage, totalChars, garbledRatio: ratio } = await classifyDocument(`${SMC_CATALOG_DIR}/${name}`);
      const statusForClass: Record<string, string> = {
        unclassified_review: "unclassified_review",
        text_extraction_failed: "text_extraction_failed",
      };
      const notesParts = [
        modeloPage ? `Modelo/Especificaciones table found on page ${modeloPage}` : null,
        classification === "text_extraction_failed" ? `chars=${totalChars} garbled_ratio=${ratio} -- likely broken font encoding or scanned/image-only PDF; needs OCR, not text extraction` : null,
      ].filter(Boolean);
      const { error: upsertErr } = await sb.from("smc_document_ingestion_queue").upsert({
        filename: name,
        status: statusForClass[classification] || "classified",
        classification,
        page_count: pageCount,
        notes: notesParts.length ? notesParts.join(" | ") : null,
        updated_at: now,
      }, { onConflict: "filename" });
      if (upsertErr) { results.push({ filename: name, error: upsertErr.message }); continue; }
      results.push({ filename: name, classification, pageCount });
    } catch (e) {
      await sb.from("smc_document_ingestion_queue").upsert({
        filename: name, status: "failed", notes: e instanceof Error ? e.message : String(e), updated_at: now,
      }, { onConflict: "filename" });
      results.push({ filename: name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    status: "completed",
    scanned: pdfNames.length,
    newly_classified: results.length,
    results,
  };
}
