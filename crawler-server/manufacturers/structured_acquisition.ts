// Ported from the Supabase Edge Function `industrialpedia-structured-acquisition-v1` (v20,
// "structured-acquisition-v18-deterministic-pdf-html-guard-partial-publish"): generic
// deterministic HTML/PDF extractor used as the Mouser routing fallback for manufacturers
// without a dedicated extractor. Unlike the manufacturer-specific workers, this one only
// extracts and verifies identity — it does NOT publish; the caller (mouser_dispatch.ts)
// does, exactly like the original (industrialpedia-mouser-enrichment-worker-v1) did.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { getDocumentProxy, extractText } from "npm:unpdf";

const VERSION = "structured-acquisition-v18-vps-port";
const clean = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim();
const norm = (x: unknown) =>
  clean(x).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9²³µμΩω°%/]+/g, " ").replace(/\s+/g, " ").trim();
const nid = (x: unknown) => clean(x).toUpperCase().replace(/[\s._/-]+/g, "");
const num = (x: string) => { const m = clean(x).match(/[+-]?\d+(?:[.,]\d+)?/); return m ? String(Number(m[0].replace(",", "."))) : null; };
const unit = (x: string) => clean(x).match(/\d+(?:[.,]\d+)?\s*([A-Za-zµμΩω°%/²³]+)\b/)?.[1]?.toLowerCase() || null;

function linePairs(t: string, page: number) {
  const a: any[] = [];
  for (const z of t.split(/\r?\n/)) {
    const l = z.trim();
    if (!l || l.length > 260) continue;
    const m = l.match(/^(.{2,120}?)\s*[:：]\s*(.{1,150})$/) || l.match(/^([A-Za-z][A-Za-z0-9À-ÿ()/,.\-\s]{2,110}?)\s{2,}(.{1,150})$/);
    if (m) a.push({ label: clean(m[1]), value: clean(m[2]), page: String(page) });
  }
  return a;
}
function htmlText(h: string): string {
  return h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/tr>/gi, "\n").replace(/<\/t[dh]>/gi, " | ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#x2F;/gi, "/").replace(/&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/[ \t]+/g, " ").replace(/\s*\|\s*/g, " | ").split(/\r?\n/).map(clean).filter(Boolean).join("\n");
}
function htmlPairs(h: string) {
  const out: any[] = [];
  for (const rm of h.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = [];
    for (const cm of rm[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) cells.push(clean(htmlText(cm[1]).replace(/\n/g, " ")));
    if (cells.length >= 2) {
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const label = clean(cells[i]), value = clean(cells[i + 1]);
        if (label && value && label.length <= 120 && value.length <= 150) out.push({ label, value, page: "1" });
      }
    }
  }
  return out;
}
async function pdfPairs(buf: ArrayBuffer) {
  const d = await getDocumentProxy(new Uint8Array(buf));
  const z: any = await extractText(d, { mergePages: false });
  const pages = Array.isArray(z.text) ? z.text.map(String) : [String(z.text || "")];
  const out: any[] = [];
  for (let i = 0; i < pages.length; i++) out.push(...linePairs(pages[i], i + 1));
  return { plain: pages.join("\n"), pages, pairs: out, totalPages: pages.length };
}

export type StructuredAcquisitionInput = { queueId: string; familyCode?: string; sourceUrl?: string };

export async function runStructuredAcquisition(sb: SupabaseClient, input: StructuredAcquisitionInput) {
  const { data: q, error: qe } = await sb
    .from("candidate_enrichment_queue")
    .select("id,ingestion_record_id,evidence,ingestion_records!inner(payload)")
    .eq("id", input.queueId)
    .maybeSingle();
  if (qe || !q) return { error: "queue_not_found" };

  const p: any = (q as any).ingestion_records.payload || {};
  const mpn = clean(p.manufacturer_part_number || p.part_number || p.mpn);
  const family = clean(input.familyCode || p.family_code);
  const url = clean(input.sourceUrl || p.source_url || p.datasheet_url || p.pdf_url);

  const review = async (reason: string, extra: Record<string, unknown> = {}) => {
    await sb.from("candidate_enrichment_queue").update({ status: "needs_review", stage: "decision", last_error: reason, worker_version: VERSION, evidence: { ...((q as any).evidence || {}), extractor: VERSION, decision_reason: reason, ...extra } }).eq("id", input.queueId);
    await sb.from("ingestion_records").update({ status: "rejected", rejection_reason: reason, lifecycle_updated_at: new Date().toISOString() }).eq("id", (q as any).ingestion_record_id);
  };

  const { data: als, error: ae } = await sb.from("spec_attribute_aliases").select("alias_normalized,property_code").eq("family_code", family).eq("active", true);
  if (ae) throw ae;
  const { data: defs, error: de } = await sb.from("spec_property_definitions").select("property_code").eq("active", true);
  if (de) throw de;

  if (!mpn || !family || !url) {
    await review("source_url_mpn_or_family_missing", { body_family_code: input.familyCode || null, payload_family_code: p.family_code || null, source_url: url || null });
    return { status: "needs_review", reason: "source_url_mpn_or_family_missing" };
  }

  let r: Response;
  try {
    r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "IndustrialpediaDeterministicFetcher/18.0", Accept: "text/html,application/xhtml+xml,application/pdf,application/json;q=0.9,*/*;q=0.5" }, signal: AbortSignal.timeout(25000) });
  } catch (e) {
    await review("structured_fetch_failed", { final_url: url, error: e instanceof Error ? e.message : String(e) });
    return { status: "needs_review", reason: "structured_fetch_failed" };
  }
  const finalUrl = r.url || url;
  if (!r.ok) {
    await review(`structured_http_${r.status}`, { http_status: r.status, final_url: finalUrl });
    return { status: "needs_review", reason: `structured_http_${r.status}` };
  }

  let ab: ArrayBuffer;
  try {
    ab = await r.arrayBuffer();
  } catch (e) {
    await review("structured_body_read_failed", { final_url: finalUrl, error: e instanceof Error ? e.message : String(e) });
    return { status: "needs_review", reason: "structured_body_read_failed" };
  }

  const ct = r.headers.get("content-type") || "";
  const prefix = new TextDecoder().decode(ab.slice(0, 8));
  const isMouser = /mouser\.com/i.test(finalUrl) || /mouser\.com/i.test(url);
  const pdf = /pdf/i.test(ct) || prefix.startsWith("%PDF-");
  let pairs: any[] = [], plain = "", totalPages = 0, pdfPages: string[] = [];

  if (pdf) {
    try {
      const z = await pdfPairs(ab);
      pairs = z.pairs; plain = z.plain; totalPages = z.totalPages; pdfPages = z.pages;
    } catch (e) {
      const reason = isMouser ? "mouser_pdf_parse_failed" : "structured_pdf_parse_failed";
      await review(reason, { http_status: r.status, content_type: ct, final_url: finalUrl, error: e instanceof Error ? e.message : String(e) });
      return { error: "extractor_failed", message: reason };
    }
  } else {
    plain = new TextDecoder().decode(ab);
    const hp = htmlPairs(plain);
    pairs = hp.length ? hp : linePairs(htmlText(plain), 1);
  }

  const identity = nid(plain).includes(nid(mpn));
  if (!identity) {
    await review("structured_identity_not_found", { final_url: finalUrl, total_pages: totalPages });
    return { status: "needs_review", reason: "structured_identity_not_found" };
  }
  const identityPage = pdf ? Math.max(1, pdfPages.findIndex((pg) => nid(pg).includes(nid(mpn))) + 1) : 1;
  const identityEvidence = { evidence_text: `${mpn} | exact identity | source=official_datasheet | url=${finalUrl}`, page: String(identityPage) };

  const ex: any[] = [], unknown: any[] = [], seen = new Set<string>();
  const defMap = new Map((defs || []).map((z: any) => [norm(z.property_code), z.property_code]));
  for (const x of pairs) {
    const label = clean(x.label), value = clean(x.value);
    if (!value) continue;
    const nl = norm(label);
    const direct = defMap.get(nl);
    const a = (als || []).find((z: any) => norm(z.alias_normalized) === nl);
    const propertyCode = direct || a?.property_code;
    if (!propertyCode) {
      const k = `${nl}|${value}`;
      if (!unknown.some((u: any) => u.key === k)) unknown.push({ key: k, label, value, page: x.page });
      continue;
    }
    const k = propertyCode + "|" + value;
    if (seen.has(k)) continue;
    seen.add(k);
    ex.push({ property_code: propertyCode, attribute_name: label, original_value: value, numeric_value: num(value), unit: unit(value), evidence_text: `${label}: ${value} | source=official_datasheet | url=${finalUrl}`, page: x.page });
  }

  if (unknown.length) for (const u of unknown) await sb.rpc("record_unknown_spec_property_v1", { p_family_code: family, p_raw_label: u.label, p_value: u.value, p_source_url: finalUrl });

  if (!ex.length) {
    const reason = unknown.length ? "unmapped_technical_properties" : "no_verified_aliased_technical_specs";
    await review(reason, { final_url: finalUrl, total_pages: totalPages, pdf_layout_pairs: pairs.length, specs_found: 0, unknown_specs: unknown, identity_evidence: identityEvidence });
    return { status: "needs_review", reason, pdf_layout_pairs: pairs.length, specs_found: 0, unknown_specs: unknown };
  }

  return {
    status: "extraction_verified", specs_found: ex.length, unknown_specs_count: unknown.length, unknown_specs: unknown,
    part_number: mpn, source_url: finalUrl, part_number_evidence: identityEvidence, specs: ex, extractor: VERSION,
    extraction_mode: unknown.length ? "partial_publish_known_specs_capture_unknown" : "complete_known_specs",
  };
}
