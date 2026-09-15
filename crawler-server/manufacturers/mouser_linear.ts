// Ported from the Supabase Edge Function `industrialpedia-mouser-linear-extractor-v1` (v10,
// "mouser-linear-extractor-v8-official-route-fetcher"): PDF line-based extraction with exact
// MPN-line identity matching, used as the last-resort fallback in the Mouser routing chain
// (after the manufacturer-specific extractor and the generic structured-acquisition attempt
// both fail with a recognized reason). Mouser-hosted PDFs go through the existing Cloudflare
// Worker proxy (unchanged — same secret, same URL) since Mouser blocks direct server fetches.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { getDocumentProxy } from "npm:unpdf";

const VERSION = "mouser-linear-extractor-v8-vps-port";
const MOUSER_PDF_PROXY_URL = "https://industrialpedia-mouser-pdf-proxy.jesussorianoevee.workers.dev";
const clean = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim();
const norm = (x: unknown) =>
  clean(x).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9²³µμΩω°%/]+/g, " ").replace(/\s+/g, " ").trim();
const TECH = /(voltage|current|frequency|power|resistance|capacitance|inductance|temperature|pressure|flow|force|torque|speed|stroke|bore|diameter|length|width|height|weight|dimension|accuracy|resolution|response|load|range|supply|input|output|operating|storage|lifetime|impedance|gain|bandwidth|package|size|rating|thread|port|material|connection|connector|interface|protection|insulation|seal|travel|capacity|volume|measurement|sensitivity|cutoff|threshold|timing|delay|rise|fall|leakage|noise|mode|function|type|designation|standard|approval|class)/i;
const ENG = /^[<>≤≥+\-±]?\s*\d+(?:[.,]\d+)?(?:\s*(?:\.\.|-|to)\s*\d+(?:[.,]\d+)?)?\s*(?:v|a|ma|ka|w|kw|mw|hz|khz|mhz|ohm|kohm|mohm|f|uf|nf|pf|h|mh|uh|c|°c|k|bar|mbar|pa|kpa|mpa|psi|mm|cm|m|um|nm|kg|g|mg|n|kn|rpm|mm\/s|m\/s|ms|us|ns|s|%|db|dbm|bit|bits|bits\/s|mbit\/s|gbit\/s|°|deg|l|ml|ml\/min|l\/min)\b/i;
const NON = /^(stock|inventory|availability|price|cost|lead time|shipping|sku|catalog|part number|manufacturer part number)$/i;

function lines(items: any[]) {
  const a: any[] = [];
  for (const it of items || []) {
    const s = clean(it.str);
    if (!s) continue;
    const t = Array.isArray(it.transform) ? it.transform : [];
    const b = { x: Number(t[4] || 0), y: Number(t[5] || 0), h: Math.abs(Number(it.height || t[3] || 0)) };
    let l = a.find((q) => Math.abs(q.y - b.y) <= Math.max(2, b.h * 0.5));
    if (!l) { l = { y: b.y, items: [] }; a.push(l); }
    l.items.push({ s, b });
  }
  return a.sort((x, y) => y.y - x.y).map((l) => ({ text: clean(l.items.sort((x: any, y: any) => x.b.x - y.b.x).map((x: any) => x.s).join(" ")), items: l.items }));
}
function num(s: string) {
  const m = clean(s).match(/^[=:;\-–—]?\s*([<>≤≥+\-±]?\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?)(?:\s*([a-zA-ZµμΩω°%/²³][a-zA-Z0-9µμΩω°%/²³]*))?/);
  if (!m) return null;
  const n = Number(m[1].replace(/\s+/g, "").split(/[x×]/i)[0].replace(",", "."));
  return Number.isFinite(n) ? { numeric_value: String(n), unit: clean(m[2] || "").toLowerCase() || null } : null;
}
async function fetchPdf(sb: SupabaseClient, url: string): Promise<ArrayBuffer> {
  if (/mouser\.com/i.test(url)) {
    const { data: t } = await sb.rpc("get_secret_v1", { p_name: "mouser_pdf_proxy_token" });
    if (!t) throw new Error("mouser_proxy_secret_unavailable");
    const r = await fetch(MOUSER_PDF_PROXY_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(12000) });
    const b = await r.arrayBuffer();
    if (r.ok && new TextDecoder().decode(b.slice(0, 5)) === "%PDF-") return b;
    throw new Error(`mouser_proxy_not_pdf_http_${r.status}`);
  }
  const r = await fetch(url, { redirect: "follow", headers: { Accept: "application/pdf,*/*", "User-Agent": "IndustrialpediaAcquisitionEngine/1.2" }, signal: AbortSignal.timeout(20000) });
  const b = await r.arrayBuffer();
  if (!r.ok || new TextDecoder().decode(b.slice(0, 5)) !== "%PDF-") throw new Error(`official_source_not_pdf_http_${r.status}`);
  return b;
}
async function extract(buf: ArrayBuffer) {
  const d = await getDocumentProxy(new Uint8Array(buf));
  const pages: any[] = [];
  for (let p = 1; p <= d.numPages; p++) {
    const pg = await d.getPage(p);
    const c = await pg.getTextContent({ includeMarkedContent: false } as any);
    const ls = lines(c.items || []);
    pages.push({ page: p, text: ls.map((x: any) => x.text).join(" "), lines: ls });
  }
  return { pages };
}
function exactMpnLine(text: string, mpn: string) {
  const e = mpn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9])${e}(?:$|[^A-Za-z0-9])`, "i").test(text);
}
function technicalUnknown(line: string) {
  const m = clean(line).match(/^(.{2,100}?)\s*[:=]\s*(.{1,120})$/);
  if (!m) return null;
  const label = clean(m[1]), value = clean(m[2]);
  if (NON.test(label) || !label || !value) return null;
  if (TECH.test(label) && (/\d/.test(value) || /^(yes|no)$/i.test(value))) return { label, value };
  if (ENG.test(value)) return { label, value };
  return null;
}

export async function runMouserLinearWorker(sb: SupabaseClient, queueId: string, publishReal: boolean) {
  const { data: item, error: qe } = await sb
    .from("candidate_enrichment_queue")
    .select("id,status,ingestion_record_id,evidence,family_code,ingestion_records!inner(payload,source_id)")
    .eq("id", queueId)
    .maybeSingle();
  if (qe || !item) return { error: "queue_not_found" };

  const { data: src } = await sb.from("ingestion_sources").select("source_key").eq("id", (item as any).ingestion_records.source_id).single();
  if (src?.source_key !== "mouser_search_api_v1") return { error: "wrong_source" };

  const p: any = (item as any).ingestion_records.payload || {};
  const family = clean(p.family_code || (item as any).family_code);
  if (!family) return { error: "family_missing" };

  const { data: aliases, error: ae } = await sb.from("spec_attribute_aliases").select("alias_normalized,property_code").eq("family_code", family).eq("active", true).order("alias_normalized", { ascending: false });
  if (ae) throw ae;
  if (!aliases?.length) return { error: "family_has_no_active_spec_aliases", family_code: family };

  const man = clean(p.manufacturer), mpn = clean(p.manufacturer_part_number);
  const { data: routes, error: re } = await sb.rpc("resolve_acquisition_routes_v1", { p_manufacturer: man, p_part_number: mpn });
  if (re) throw re;

  const candidates: { url: string; via: string; source_key: string }[] = [];
  for (const r of Array.isArray(routes) ? routes : []) if (r?.method === "official_pdf" && r?.url) candidates.push({ url: String(r.url), via: "registry_official_pdf", source_key: r.source_key });
  if (p.datasheet_url) candidates.push({ url: p.datasheet_url, via: "mouser_datasheet_pdf", source_key: "mouser_search_api_v1" });
  if (!candidates.length) return { error: "no_verified_technical_source_available" };

  let last = "";
  for (const source of candidates) {
    try {
      const ex = await extract(await fetchPdf(sb, source.url));
      const identityLine = ex.pages.flatMap((pg: any) => pg.lines.map((l: any) => ({ page: pg.page, text: l.text }))).find((l: any) => exactMpnLine(l.text, mpn));
      if (!identityLine) throw new Error("datasheet_identity_mismatch_exact_token_not_found");

      const specs: any[] = [], unknown: any[] = [];
      for (const pg of ex.pages) {
        for (const l of pg.lines) {
          const t = l.text, nt = norm(t);
          let matched = false;
          for (const a of aliases) {
            const an = norm(a.alias_normalized);
            if (!an || !nt.startsWith(an)) continue;
            const idx = t.toLowerCase().indexOf(clean(a.alias_normalized).toLowerCase());
            const rest = t.slice(idx + a.alias_normalized.length).trim().replace(/^[:=\-–—]+/, "").trim();
            const n = num(rest);
            if (n || a.property_code === "display_resolution") {
              specs.push({ property_code: a.property_code, attribute_name: a.alias_normalized, original_value: rest, numeric_value: n?.numeric_value || null, unit: n?.unit || null, evidence_text: `${a.alias_normalized}: ${rest} | source=${source.via} | page=${pg.page}`, page: String(pg.page) });
              matched = true;
            }
            break;
          }
          if (!matched) {
            const u = technicalUnknown(t);
            if (u && !unknown.some((x) => norm(x.label) === norm(u.label) && x.value === u.value)) unknown.push(u);
          }
        }
      }

      for (const u of unknown) await sb.rpc("record_unknown_spec_property_v1", { p_family_code: family, p_raw_label: u.label, p_value: u.value, p_source_url: source.url });

      if (unknown.length) {
        await sb.from("candidate_enrichment_queue").update({
          status: "needs_review", stage: "decision", last_error: "unknown_technical_properties", worker_version: VERSION,
          evidence: { ...((item as any).evidence || {}), extractor: VERSION, spec_source: source.via, identity_evidence: { context: "pdf_line_exact_mpn", page: identityLine.page, value: identityLine.text }, mapped_specs: specs.length, unknown_specs: unknown, source_url: source.url },
        }).eq("id", queueId);
        return { status: "needs_review", reason: "unknown_technical_properties", mapped_specs: specs.length, unknown_specs: unknown.length, identity_gate: "exact", family_code: family };
      }

      const unique = specs.filter((x, i, a) => i === a.findIndex((y) => y.property_code === x.property_code && y.original_value === x.original_value && y.page === x.page));
      if (!unique.length) { last = "no_specs_mapped_to_known_properties"; continue; }

      const { data: token, error: te } = await sb.rpc("get_secret_v1", { p_name: "industrialpedia_publish_pipeline_v1" });
      if (te || !token) throw new Error("publication_provenance_secret_unavailable");
      const { data: pub, error: pe } = await sb.rpc("publish_part_v1", {
        p_manufacturer_id: p.manufacturer_id, p_part_number: mpn, p_family_code: family, p_source_url: source.url,
        p_part_number_evidence: { evidence_text: `${man} ${mpn} | exact identity | source=${source.via}`, page: String(identityLine.page) },
        p_specs: unique, p_images: null, p_dry_run: publishReal !== true, p_pipeline_token: token,
      });
      if (pe) throw pe;

      const st = ["published", "already_exists_evidence_added", "already_exists", "would_publish"].includes(pub?.status) ? "resolved" : pub?.status === "review_required" ? "needs_review" : "rejected";
      await sb.from("candidate_enrichment_queue").update({
        status: st, stage: "decision", last_error: null, worker_version: VERSION,
        evidence: { ...((item as any).evidence || {}), extractor: VERSION, spec_source: source.via, spec_source_key: source.source_key, specs_found: unique.length, identity_evidence: { context: "pdf_line_exact_mpn", page: identityLine.page, value: identityLine.text }, publish_result: pub },
      }).eq("id", queueId);
      await sb.from("ingestion_records").update({ status: st === "resolved" ? "resolved" : "rejected", lifecycle_updated_at: new Date().toISOString() }).eq("id", (item as any).ingestion_record_id);

      return { status: st, publish_status: pub?.status, specs_found: unique.length, part_number: mpn, family_code: family, spec_source: source.via, spec_source_key: source.source_key, identity_gate: "exact" };
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      if (source.via === "mouser_datasheet_pdf" && /mouser_proxy_|datasheet_not_pdf_http_(403|429|5\d\d)/i.test(last)) break;
    }
  }

  await sb.from("candidate_enrichment_queue").update({ status: "needs_review", stage: "decision", last_error: last || "no_verified_technical_source_available", worker_version: VERSION }).eq("id", queueId);
  return { error: "extractor_failed", message: last || "no_verified_technical_source_available" };
}
