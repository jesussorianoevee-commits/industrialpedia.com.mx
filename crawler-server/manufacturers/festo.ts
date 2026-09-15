// Ported verbatim from the Supabase Edge Function `industrialpedia-festo-extractor-v3`
// (v9, "festo-extractor-v3-family-aware-v6"): X/Y geometry-based PDF extraction, same
// technique as the VQZ/SMC extractor. Only the queue-claim/publish plumbing moved to
// manufacturer_worker.ts (shared scaffold); the extraction algorithm is unchanged.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { getDocumentProxy } from "npm:unpdf";
import { claimQueueItem, fetchAliasMap, publishAndFinalize, markNeedsReview, clean, normLabel } from "../manufacturer_worker.ts";

const EXTRACTOR_VERSION = "festo-extractor-v3-vps-port";
const SOURCE_KEY = "festo_catalog_v1";
const ALLOWED_FAMILIES = new Set(["pneumatic_cylinder", "pneumatic_mini_slide"]);

const normId = (v: unknown) => clean(v).toUpperCase().replace(/[“”]/g, '"').replace(/\s+/g, "");

type LineItem = { str: string; bbox: { x0: number; y1: number; x1: number } };
type Line = { text: string; items: LineItem[]; y: number };

function clusterLines(items: any[]): Line[] {
  const bands: Line[] = [];
  for (const i of items || []) {
    const t = clean(i.str);
    if (!t) continue;
    const tr = Array.isArray(i?.transform) ? i.transform : [];
    const b = { x0: Number(tr[4] || 0), y1: Number(tr[5] || 0), x1: Number(tr[4] || 0) + Number(i?.width || 0) };
    let l = bands.find((x) => Math.abs(x.y - b.y1) <= 3);
    if (!l) { l = { y: b.y1, items: [], text: "" }; bands.push(l); }
    l.items.push({ str: t, bbox: b });
  }
  return bands
    .sort((a, b) => b.y - a.y)
    .map((l) => ({ ...l, text: clean(l.items.sort((a, b) => a.bbox.x0 - b.bbox.x0).map((i) => i.str).join(" ")) }))
    .filter((x) => x.text);
}

async function extractFull(buf: ArrayBuffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const pages: { page: number; lines: Line[] }[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pg = await pdf.getPage(p);
    const c = await pg.getTextContent();
    pages.push({ page: p, lines: clusterLines(c.items || []) });
  }
  return { pages, totalPages: pdf.numPages };
}

function featureSpecs(pages: { page: number; lines: Line[] }[], aliases: Map<string, string>) {
  const pairs = [...aliases.entries()].sort((a, b) => b[0].length - a[0].length);
  const out: any[] = [];
  for (const pg of pages) {
    let cur: any = null;
    const flush = () => { if (cur?.original_value) out.push(cur); cur = null; };
    for (const l of pg.lines) {
      let txt = clean(l.text);
      if (!txt || /subject to change|festo se & co/i.test(txt)) continue;
      txt = txt.replace(/^feature\s+value\s+/i, "").replace(/^feature\s+/i, "");
      const hit = pairs.find(([a]) => {
        const n = normLabel(txt);
        return n === a || n.startsWith(a + " ") || n.startsWith(a + " |");
      });
      if (hit) {
        flush();
        const rest = clean(txt.slice(hit[0].length).replace(/^\s*\|?\s*/, "").replace(/^value\s+/i, ""));
        cur = { property_code: hit[1], attribute_name: txt.slice(0, hit[0].length).trim(), original_value: rest, page: String(pg.page), evidence_text: l.text };
      } else if (cur) {
        cur.original_value = clean(cur.original_value + " " + txt);
        cur.evidence_text = clean(cur.evidence_text + " " + txt);
      }
    }
    flush();
  }
  const m = new Map<string, any>();
  for (const s of out) if (!m.has(s.property_code) || s.original_value.length > m.get(s.property_code).original_value.length) m.set(s.property_code, s);
  return [...m.values()];
}

function numeric(value: string) {
  const m = clean(value).match(/^([<>≤≥+\-]?\s*\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { n: null as string | null, u: null as string | null };
  const n = Number(m[1].replace(",", "."));
  const u = clean(m[2]);
  return Number.isFinite(n) && u ? { n: String(n), u: u.toLowerCase() } : { n: null, u: null };
}

function safe(s: any) {
  return !!s.attribute_name && !!s.original_value && s.attribute_name.length <= 100 && s.original_value.length <= 500 &&
    !/(https?:\/\/|www\.|@)/i.test(s.original_value) &&
    !/^(stock|inventory|availability|price|cost|lead time|delivery|shipping|order status|revision|document number|page|figure|table)$/i.test(s.attribute_name);
}

export async function runFestoWorker(sb: SupabaseClient, queueId: string, publishReal: boolean) {
  const claimed = await claimQueueItem(sb, queueId, SOURCE_KEY);
  if ("idle" in claimed) return { status: "idle" };
  if ("busy" in claimed) return { status: "busy" };
  if ("error" in claimed) return { status: "error", reason: claimed.error };

  const item = claimed.item as any;
  const src = item.ingestion_records.ingestion_sources;
  const payload = item.ingestion_records.payload || {};
  const ev = item.evidence || {};

  try {
    const pn = clean(ev.part_number || payload.manufacturer_part_number).replace(/\s+/g, "");
    const typeCode = clean(ev.type_code || payload.type_code || payload.product_name?.match(/\b(DGST|DGSL)-[A-Z0-9./-]+\b/i)?.[0]);
    const pdfUrl = clean(ev.source_url || payload.source_url || payload.pdf_url);
    const family = clean(item.family_code || payload.family_code);

    if (!/^\d{4,10}$/.test(pn) || !typeCode || !pdfUrl || !family) throw new Error("exact_identity_family_missing");
    if (!ALLOWED_FAMILIES.has(family)) throw new Error(`unsupported_festo_family:${family}`);

    const fr = await fetch(pdfUrl, { headers: { "User-Agent": "IndustrialpediaBot/1.0 (+https://industrialpedia.com.mx/bot-info)" } });
    if (!fr.ok) throw new Error(`exact_datasheet_fetch_failed:${fr.status}`);
    const ex = await extractFull(await fr.arrayBuffer());
    const all = ex.pages.flatMap((p) => p.lines.map((l) => l.text)).join(" ");
    if (!normId(all).includes(normId(pn)) || !normId(all).includes(normId(typeCode))) throw new Error("exact_datasheet_identity_mismatch");

    const { aliasRows } = await fetchAliasMap(sb, family);
    if (!aliasRows.length) throw new Error(`family_has_no_active_aliases:${family}`);
    const amap = new Map(aliasRows.map((x) => [x.norm, x.code]));

    const rawSpecs = featureSpecs(ex.pages, amap).filter(safe);
    const specs = rawSpecs.map((s) => {
      const x = numeric(s.original_value);
      return { property_code: s.property_code, attribute_name: s.attribute_name, original_value: s.original_value, numeric_value: x.n, unit: x.u, evidence_text: s.evidence_text, page: s.page };
    });
    if (specs.length < 8) throw new Error(`insufficient_exact_technical_specs:${specs.length}`);

    return await publishAndFinalize(sb, {
      queueId,
      ingestionRecordId: item.ingestion_record_id,
      manufacturerId: src.config.manufacturer_id,
      partNumber: typeCode,
      familyCode: family,
      sourceUrl: pdfUrl,
      specs,
      partNumberEvidence: { evidence_text: `FESTO exact datasheet: ${typeCode} / ${pn}`, page: "1" },
      dryRun: !publishReal,
      extractorVersion: EXTRACTOR_VERSION,
      priorEvidence: ev,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markNeedsReview(sb, queueId, item.ingestion_record_id, msg, { ...ev, extractor: EXTRACTOR_VERSION });
    return { status: "needs_review", reason: msg, extractor: EXTRACTOR_VERSION };
  }
}
