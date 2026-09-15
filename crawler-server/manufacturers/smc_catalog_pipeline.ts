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
//   - "text_extraction_failed": pdf.js could not produce usable text for
//     this document at all -- either zero characters extracted (scanned/
//     image-only PDF, no text layer) or the extracted text fails a common-
//     word readability check (see isReadableText). Confirmed on real SMC
//     files with a broken/missing ToUnicode CMap: the glyph-to-character
//     mapping is scrambled, so pdf.js emits *normal printable ASCII* --
//     just the wrong letters (e.g. "!"#$%&'%'(')*+" instead of real words)
//     -- which a naive control-character ratio check does not catch. These
//     need OCR or a different extraction path, not more keyword tuning.
//   - "possible_product_catalog": readable text, no exact ordering-page or
//     Modelo+Especificaciones table match, but a meaningfully high density
//     of engineering tokens (numeric values with units, SMC-style product
//     codes) -- a real product catalog whose table shape the strict
//     patterns above don't recognize (found on real files this way:
//     ProductoStandar_SMC.pdf, actuadores-y-Controladores.pdf,
//     VacioSMC_.pdf). Lower confidence than the two exact-match classes
//     above by design -- always queued for a human to characterize the
//     actual table shape before any extraction is attempted, same as a new
//     configurator series would be.
//   - "unclassified_review": none of the above signals. Most of these are
//     genuinely not per-part catalogs (training guides, safety brochures,
//     vertical-industry flyers) -- but this is a "not yet matched by any
//     current pattern" bucket, not a verified-empty one; a low-confidence
//     bucket by construction, worth an occasional manual spot-check as new
//     documents accumulate rather than being treated as a closed case.
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

// Catches the other, harder-to-spot corruption: a scrambled glyph map that
// still emits *normal printable ASCII* (so garbledRatio sees nothing wrong)
// but the wrong letters entirely -- real content reads as gibberish like
// "!"#$%&'%'(')*+$,-(,.(/". Real Spanish/English catalog prose, even dense
// technical prose, reliably contains a meaningful fraction of very common
// short function words; scrambled text does not, because the substitution
// is essentially random relative to word boundaries.
const COMMON_WORDS = new Set([
  "de", "la", "el", "en", "que", "y", "a", "los", "las", "para", "con",
  "un", "una", "por", "su", "se", "es", "no", "más", "como", "o", "del",
  "al", "the", "and", "for", "with", "of", "is", "are", "to", "in", "on",
]);
// Whole-document check, not per-page: a scrambled glyph map found in
// practice (IBV-A-MX.pdf, JSB-A-MX.pdf) mangles letters into *symbol*
// codepoints, not just other letters -- so a naive "need >=N letter tokens
// before judging" gate silently skips exactly the pages most corrupted
// (they produce almost no a-z runs at all, not "too few to be sure", but
// zero because there's nothing left that reads as a letter). Judging the
// full extracted text at once, and treating a low letter-token share of
// total characters as corruption evidence in its own right (not just a low
// common-word ratio among whatever few tokens exist), catches both.
function readabilitySignals(text: string) {
  const totalChars = text.length;
  const tokens = text.toLowerCase().match(/[a-záéíóúñ]{2,12}/g) || [];
  const letterCharCoverage = tokens.reduce((sum, t) => sum + t.length, 0);
  const letterDensity = totalChars > 0 ? letterCharCoverage / totalChars : 1;
  const commonHits = tokens.filter((t) => COMMON_WORDS.has(t)).length;
  const commonRatio = tokens.length > 0 ? commonHits / tokens.length : 1;
  return { totalChars, tokenCount: tokens.length, letterDensity, commonRatio };
}
function looksUnreadableText(text: string): boolean {
  const { totalChars, tokenCount, letterDensity, commonRatio } = readabilitySignals(text);
  if (totalChars < 300) return false; // not enough text to judge either way
  if (letterDensity < 0.35) return true; // real prose/labels run well above this even with lots of numbers/units
  if (tokenCount >= 30 && commonRatio < 0.02) return true; // letters present but scrambled word-for-word
  return false;
}

// Weaker, precision-traded-for-recall signal for "this is probably a real
// product catalog" when neither exact pattern (ordering page, Modelo+
// Especificaciones table) matched: density of engineering-value tokens
// (number+unit, e.g. "20 mm", "15 MPa") and SMC-style product codes
// (uppercase, letters+digits, e.g. "AWD-A", "LEFS", "ZP3C"). A pure
// marketing/services brochure runs far lower on both than an actual spec
// table or product index, even one my strict patterns don't recognize the
// shape of -- confirmed against ProductoStandar_SMC.pdf (a series index),
// actuadores-y-Controladores.pdf and VacioSMC_.pdf (real product content),
// none of which happened to contain "Forma de pedido" or an exact
// "Modelo"/"Especificaciones" table pair.
const UNIT_VALUE_RE = /\b\d+([.,]\d+)?\s*(mm|cm|m|kg|g|mg|n|kn|bar|kpa|mpa|psi|v|a|w|hz|°c|%|l|ml)\b/gi;
const PRODUCT_CODE_RE = /\b[A-Z]{2,6}[0-9][A-Z0-9-]{0,8}\b/g;
function productSignalDensity(text: string): number {
  const words = (text.match(/\S+/g) || []).length;
  if (words < 30) return 0;
  const unitHits = (text.match(UNIT_VALUE_RE) || []).length;
  const codeHits = (text.match(PRODUCT_CODE_RE) || []).length;
  return (unitHits + codeHits) / words;
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
  let allText = "";

  for (let p = 1; p <= capPages; p++) {
    const fs = await fragsForPage(doc, p);
    const fullText = fs.map((f) => f.text).join(" ");
    totalChars += fullText.length;
    totalGarbled += garbledRatio(fullText) * fullText.length;
    allText += " " + fullText;
    if (/Forma de pedido|C[oó]mo realizar el pedido|C[oó]digo de pedido/i.test(fullText)) hasOrderingPage = true;
    for (const band of grid(fs)) {
      const bandText = band.map((f) => f.text).join("").trim();
      if (bandText === "Modelo") { hasExactModeloCell = true; if (modeloPage < 0) modeloPage = p; }
      if (bandText === "Especificaciones") hasExactEspecCell = true;
    }
  }

  const ratio = totalChars > 0 ? totalGarbled / totalChars : 0;
  const looksUnreadable = looksUnreadableText(allText);
  const density = productSignalDensity(allText);

  let classification: string;
  if (totalChars === 0) classification = "text_extraction_failed";
  else if (ratio > 0.03 || looksUnreadable) classification = "text_extraction_failed";
  else if (hasOrderingPage) classification = "configurator";
  else if (pageCount <= 6 && hasExactModeloCell && hasExactEspecCell) classification = "simple_datasheet";
  else if (density >= 0.015) classification = "possible_product_catalog";
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
        possible_product_catalog: "needs_manual_review",
      };
      const notesParts = [
        modeloPage ? `Modelo/Especificaciones table found on page ${modeloPage}` : null,
        classification === "text_extraction_failed" ? `chars=${totalChars} garbled_ratio=${ratio} -- likely broken font encoding or scanned/image-only PDF; needs OCR, not text extraction` : null,
        classification === "possible_product_catalog" ? "engineering-token density above threshold but no exact ordering-page or Modelo/Especificaciones table match -- likely real product content in an unrecognized table shape, needs a human look before extraction" : null,
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
