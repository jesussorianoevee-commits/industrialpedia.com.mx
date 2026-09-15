// Ported verbatim from the Supabase Edge Function `industrialpedia-siemens-structured-extractor-v1`
// (v16, "siemens-structured-extractor-v14-queue-family-fallback"): scrapes Siemens Mall's
// structured catalog page (mall.industry.siemens.com), classifies technical vs. non-technical
// table rows via label/value heuristics, maps to spec_attribute_aliases, publishes.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

const VERSION = "siemens-structured-extractor-v14-vps-port";
const clean = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim();
const norm = (x: unknown) =>
  clean(x).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9²³µμΩω°%/]+/g, " ").replace(/\s+/g, " ").trim();
const nid = (x: unknown) => clean(x).toUpperCase().replace(/[\s._/-]+/g, "");

function htmlText(x: string): string {
  return clean(x.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'"));
}
function rows(x: string) {
  const rs: any[] = [];
  let section = "";
  for (const tr of x.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => htmlText(m[1])).filter(Boolean);
    if (cells.length === 1) { section = cells[0]; continue; }
    if (cells.length >= 2) rs.push({ section, label: cells[0], value: cells[cells.length - 1] });
  }
  return rs;
}
function numberValue(v: string): string | null {
  const m = clean(v).match(/([<>≤≥+\-±]?\s*\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const nn = Number(m[1].replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(nn) ? String(nn) : null;
}
function unitValue(v: string): string | null {
  return clean(v).match(/[0-9.,\s]+([a-zA-ZµμΩω°%/²³]+)\b/)?.[1]?.toLowerCase() || null;
}

const NON_TECH = /^(?:stock|inventory|availability|available|in stock|out of stock|quantity|qty|price|cost|msrp|list price|sale price|lead time|delivery|shipping|order status|cart|sku|product folder links?|catalog(?: number| no| #)?|military|typical characteristics?|scale|revision(?: history)?|document (?:number|no|#)|literature (?:number|no|#))$/i;
const TECH_LABEL = /(voltage|current|frequency|power|resistance|capacitance|inductance|temperature|pressure|flow|force|torque|speed|stroke|bore|diameter|length|width|height|weight|dimension|accuracy|repeatability|resolution|response|switching|load|range|supply|input|output|operating|storage|lifetime|duty|cycle|impedance|gain|bandwidth|delay|rise|fall|leakage|threshold|sensitivity|material|mounting|connection|connector|interface|communication|protection|insulation|ingress|thread|port|housing|package|size|rating|class|degree|seal|travel|displacement|hardness|viscosity|density|capacity|volume|area|altitude|address|memory|jitter|execution|activation|isolation|cable|product type designation|hw functional status|firmware version|fw update possible|usable baseunits?|color code|product function|i&m data|isochronous mode|engineering with|step 7|pcs 7|profibus|profinet|operating mode|automatic encoding|mechanical coding element|type of mechanical coding element|submodules?|selection of baseunit|type of digital output|current-sinking|current-sourcing|parameterizable|short-circuit protection|open-circuit detection|controlling a digital input|parallel switching|diagnostics|substitute values|diagnostic alarm|diagnoses|led|potential separation|isolation tested|suitable for safety|highest safety class|performance level|category|sil acc|remark on safety|atex|certificate|approval|hazardous environment)/i;
const TECH_VALUE = /^(?:yes|no)(?:[;,.].*)?$/i;
const ENGINEERING_VALUE = /^[<>≤≥+\-±]?\s*\d+(?:[.,]\d+)?(?:\s*(?:\.\.|-|to)\s*[<>≤≥+\-±]?\s*\d+(?:[.,]\d+)?)?\s*(?:v|a|ma|ka|w|kw|mw|hz|khz|mhz|ohm|kohm|mohm|f|uf|nf|pf|h|mh|uh|c|°c|k|bar|mbar|pa|kpa|mpa|psi|mm|cm|m|um|nm|kg|g|mg|n|nm|kn|rpm|mm\/s|m\/s|ms|us|ns|s|%|db|dbm|mbit\/s|gbit\/s|mb\/s|gb\/s|bit|byte|bytes|mb|gb|°|deg|l|ml|ml\/min|l\/min|l\/h|ml\/h)\b/i;

function technicalRow(label: string, value: string): boolean {
  const a = clean(label), v = clean(value);
  if (!a || !v || NON_TECH.test(a) || /(?:page|figure|table)\s*(?:number|no|#)?/i.test(a)) return false;
  if (v.length > 500 || (/(?:https?:\/\/|www\.|@)/i.test(v) && !/remark|reference|source/i.test(a))) return false;
  if (TECH_VALUE.test(v) || ENGINEERING_VALUE.test(v)) return true;
  if (TECH_LABEL.test(a) && (numberValue(v) !== null || /(?:type|version|designation|baseunit|color|function|mode|connection|output|input|coding|diagnos|isolation|safety|performance|category|sil|material|standard|engineering|communication|status|led|approval|certificate|atex|hazardous)/i.test(a))) return true;
  return false;
}
function sectionAllows(propertyCode: string, section: string): boolean {
  const s = norm(section);
  if (propertyCode !== "supply_voltage") return true;
  const output = /(^| )(output voltage|load voltage|output)( |$)/.test(s);
  const input = /(supply voltage|input voltage|power supply|load voltage l\+|load voltage 2l\+)/.test(s);
  if (output && !input) return false;
  return true;
}

export async function runSiemensWorker(sb: SupabaseClient, queueId: string, publishReal: boolean) {
  const { data: item, error: qe } = await sb
    .from("candidate_enrichment_queue")
    .select("id,status,ingestion_record_id,evidence,family_code,ingestion_records!inner(payload,source_id)")
    .eq("id", queueId)
    .maybeSingle();
  if (qe || !item) return { error: "queue_not_found" };

  const { data: src } = await sb.from("ingestion_sources").select("source_key").eq("id", (item as any).ingestion_records.source_id).single();
  if (src?.source_key !== "mouser_search_api_v1") return { error: "wrong_source" };

  const p: any = (item as any).ingestion_records.payload || {};
  const mpn = clean(p.manufacturer_part_number || p.part_number || p.mpn);
  const family = clean((item as any).family_code || p.family_code);
  const manufacturerId = clean(p.manufacturer_id);
  if (!mpn) return { error: "mpn_missing" };

  let isSiemens = /^siemens$/i.test(clean(p.manufacturer));
  if (!isSiemens && manufacturerId) {
    const { data: m } = await sb.from("manufacturers").select("name").eq("id", manufacturerId).maybeSingle();
    isSiemens = /^siemens$/i.test(clean(m?.name));
  }
  if (!isSiemens) return { error: "not_siemens" };
  if (!family) return { error: "family_missing" };

  const { data: aliases, error: ae } = await sb.from("spec_attribute_aliases").select("alias_normalized,property_code").eq("family_code", family).eq("active", true);
  if (ae) throw ae;
  const aliasList = aliases || [];
  const url = `https://mall.industry.siemens.com/goos/catalog/Pages/mmpdata.ashx?MLFB1=${encodeURIComponent(mpn)}&lang=en`;

  try {
    const r = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36", Referer: "https://mall.industry.siemens.com/" },
      signal: AbortSignal.timeout(20000),
    });
    const html = await r.text();
    if (!r.ok) throw new Error(`siemens_catalog_http_${r.status}`);
    if (!nid(html).includes(nid(mpn))) throw new Error("catalog_identity_mismatch");

    const extracted: any[] = [], unknown: any[] = [], seen = new Set<string>();
    for (const row of rows(html)) {
      const label = clean(row.label), value = clean(row.value), section = clean(row.section);
      if (!technicalRow(label, value)) continue;
      const alias = aliasList.find((a: any) => { const an = norm(a.alias_normalized), nl = norm(label); return an && (nl === an || nl.startsWith(an + " ")); });
      if (!alias) {
        const ukey = `${norm(label)}|${value}`;
        if (!unknown.some((u: any) => u.key === ukey)) unknown.push({ key: ukey, section, label, value });
        continue;
      }
      if (!sectionAllows(alias.property_code, section)) continue;
      const propertyCode = alias.property_code, key = `${propertyCode}|${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      extracted.push({ property_code: propertyCode, attribute_name: label, original_value: value, numeric_value: numberValue(value), unit: unitValue(value), evidence_text: `${section ? section + " | " : ""}${label}: ${value} | source=siemens_mall_structured_catalog | url=${url}`, page: "1" });
    }

    for (const u of unknown) await sb.rpc("record_unknown_spec_property_v1", { p_family_code: family, p_raw_label: u.label, p_value: u.value, p_source_url: url });

    if (!extracted.length) {
      await sb.from("candidate_enrichment_queue").update({ status: "needs_review", stage: "decision", last_error: "no_verified_aliased_technical_specs", worker_version: VERSION, evidence: { ...((item as any).evidence || {}), extractor: VERSION, spec_source: "siemens_mall_structured_catalog", specs_found: 0, unknown_specs: unknown } }).eq("id", queueId);
      return { status: "needs_review", reason: "no_verified_aliased_technical_specs", unknown_specs: unknown, part_number: mpn, family_code: family, spec_source: "siemens_mall_structured_catalog" };
    }

    const { data: token, error: te } = await sb.rpc("get_secret_v1", { p_name: "industrialpedia_publish_pipeline_v1" });
    if (te || !token) throw new Error("publication_provenance_secret_unavailable");
    const { data: pub, error: pe } = await sb.rpc("publish_part_v1", {
      p_manufacturer_id: p.manufacturer_id, p_part_number: mpn, p_family_code: family, p_source_url: url,
      p_part_number_evidence: { evidence_text: `Article number: ${mpn} | source=siemens_mall_structured_catalog`, page: "1" },
      p_specs: extracted, p_images: null, p_dry_run: publishReal !== true, p_pipeline_token: token,
    });
    if (pe) throw pe;

    let enrichment: any = null;
    const existingPartId = pub?.part_id;
    if (publishReal === true && existingPartId && ["already_exists_evidence_added", "already_exists"].includes(pub?.status)) {
      const er = await sb.rpc("enrich_existing_part_missing_specs_v1", { p_part_id: existingPartId, p_specs: extracted, p_source_url: url, p_pipeline_token: token });
      if (er.error) throw er.error;
      enrichment = er.data;
    }

    const st = ["published", "already_exists_evidence_added", "already_exists", "would_publish"].includes(pub?.status) ? "resolved" : pub?.status === "review_required" ? "needs_review" : "rejected";
    await sb.from("candidate_enrichment_queue").update({
      status: st, stage: "decision", last_error: unknown.length ? "partial_publish_unknown_specs" : null, worker_version: VERSION, resolved_part_id: existingPartId || null,
      evidence: { ...((item as any).evidence || {}), extractor: VERSION, spec_source: "siemens_mall_structured_catalog", specs_found: extracted.length, unknown_specs: unknown, partial_publish: unknown.length > 0, publish_result: pub, enrichment_result: enrichment },
    }).eq("id", queueId);
    await sb.from("ingestion_records").update({ status: st === "resolved" ? "resolved" : "rejected", rejection_reason: unknown.length ? "partial_publish_unknown_specs" : null, lifecycle_updated_at: new Date().toISOString() }).eq("id", (item as any).ingestion_record_id);

    return { status: st, publish_status: pub?.status, specs_found: extracted.length, unknown_specs: unknown, partial_publish: unknown.length > 0, enrichment, part_number: mpn, family_code: family, spec_source: "siemens_mall_structured_catalog" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : (typeof e === "string" ? e : JSON.stringify(e));
    await sb.from("candidate_enrichment_queue").update({ status: "needs_review", stage: "decision", last_error: msg, worker_version: VERSION }).eq("id", queueId);
    return { error: "siemens_extractor_failed", message: msg };
  }
}
