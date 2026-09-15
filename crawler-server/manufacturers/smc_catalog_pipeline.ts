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

async function classifyDocument(path: string) {
  const bytes = await Deno.readFile(path);
  const doc = await getDocumentProxy(bytes);
  const pageCount = doc.numPages;
  const capPages = Math.min(pageCount, MAX_PAGES_SCANNED);
  let hasOrderingPage = false;
  let hasExactModeloCell = false;
  let hasExactEspecCell = false;
  let modeloPage = -1;

  for (let p = 1; p <= capPages; p++) {
    const fs = await fragsForPage(doc, p);
    const fullText = fs.map((f) => f.text).join(" ");
    if (/Forma de pedido|C[oó]mo realizar el pedido|C[oó]digo de pedido/i.test(fullText)) hasOrderingPage = true;
    for (const band of grid(fs)) {
      const bandText = band.map((f) => f.text).join("").trim();
      if (bandText === "Modelo") { hasExactModeloCell = true; if (modeloPage < 0) modeloPage = p; }
      if (bandText === "Especificaciones") hasExactEspecCell = true;
    }
  }

  let classification = "unclassified_review";
  if (hasOrderingPage) classification = "configurator";
  else if (pageCount <= 6 && hasExactModeloCell && hasExactEspecCell) classification = "simple_datasheet";

  return { pageCount, classification, modeloPage: modeloPage >= 0 ? modeloPage : null };
}

// Registers any PDF present in the local folder but not yet in the queue,
// classifying it as it's registered. Idempotent: re-running only picks up
// genuinely new filenames (the sync script never overwrites/renames existing
// ones, so filename is a stable dedupe key).
export async function scanAndClassifySmcCatalogs(sb: SupabaseClient) {
  let entries: Deno.DirEntry[];
  try {
    entries = [...Deno.readDirSync(SMC_CATALOG_DIR)];
  } catch (e) {
    return { error: "catalog_dir_unreadable", detail: e instanceof Error ? e.message : String(e) };
  }
  const pdfNames = entries.filter((e) => e.isFile && e.name.toLowerCase().endsWith(".pdf")).map((e) => e.name);
  if (pdfNames.length === 0) return { status: "completed", scanned: 0, newly_classified: 0, results: [] };

  const { data: known, error: knownErr } = await sb.from("smc_document_ingestion_queue").select("filename").in("filename", pdfNames);
  if (knownErr) return { error: "queue_read_failed", detail: knownErr.message };
  const knownSet = new Set((known || []).map((r: any) => r.filename));
  const newFiles = pdfNames.filter((n) => !knownSet.has(n));

  const results: any[] = [];
  for (const name of newFiles) {
    const now = new Date().toISOString();
    try {
      const { pageCount, classification, modeloPage } = await classifyDocument(`${SMC_CATALOG_DIR}/${name}`);
      const { error: upsertErr } = await sb.from("smc_document_ingestion_queue").upsert({
        filename: name,
        status: classification === "unclassified_review" ? "unclassified_review" : "classified",
        classification,
        page_count: pageCount,
        notes: modeloPage ? `Modelo/Especificaciones table found on page ${modeloPage}` : null,
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
