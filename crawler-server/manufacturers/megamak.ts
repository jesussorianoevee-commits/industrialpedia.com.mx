// Megamak (shop.megamak.com.mx) -- heavy-truck/engine parts distributor,
// real Shopify catalog, thousands of products across many brands (Cummins,
// Meritor, Rockwell Meritor, etc.), confirmed via 6 hand-checked samples
// before writing any of this. Unlike every other pipeline in this project,
// Megamak parts almost never share a measurable dimensional property (a
// bushing and a cylinder head aren't comparable by specs) -- the real value
// here is identity + engine/vehicle application + cross-brand equivalence
// numbers the distributor itself declares (e.g. "AUTOMANN 112.1162, SPICER
// 11008, EATON 820183, DANA 201233" -- all the same physical part). That
// equivalence is captured in its own table (`part_cross_references`),
// decoupled from the spec-comparison engine, per the `heavy_truck_component`
// family design agreed with the user (see project_discovery_source_landscape
// memory for the full investigation).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { clean } from "../manufacturer_worker.ts";

const EXTRACTOR_VERSION = "megamak-heavy-truck-auto-publish-v1";
const SOURCE_KEY = "megamak_heavy_truck_v1";
const FAMILY_CODE = "heavy_truck_component";
const UA = "IndustrialpediaBot/1.1 (+https://industrialpedia.app/bot-info)";
const SITEMAPS = [
  "https://shop.megamak.com.mx/sitemap_products_1.xml?from=9439517311215&to=9439840633071",
  "https://shop.megamak.com.mx/sitemap_products_2.xml?from=9439840927983&to=9447197212911",
  "https://shop.megamak.com.mx/sitemap_products_3.xml?from=9447197442287&to=9447379173615",
  "https://shop.megamak.com.mx/sitemap_products_4.xml?from=9447379304687&to=9562274431215",
];

const manufacturerIdCache = new Map<string, string>();
async function resolveOrCreateManufacturerId(sb: SupabaseClient, brandName: string): Promise<string> {
  const normalized = clean(brandName).toLowerCase();
  const cached = manufacturerIdCache.get(normalized);
  if (cached) return cached;

  const { data: existing } = await sb.from("manufacturers").select("id").eq("normalized_name", normalized).maybeSingle();
  if (existing?.id) { manufacturerIdCache.set(normalized, existing.id); return existing.id; }

  const { data: created, error } = await sb
    .from("manufacturers")
    .insert({ name: clean(brandName), normalized_name: normalized })
    .select("id")
    .single();
  if (error) {
    // Race with another worker tick inserting the same brand concurrently -- re-select instead of failing.
    const { data: retry } = await sb.from("manufacturers").select("id").eq("normalized_name", normalized).maybeSingle();
    if (retry?.id) { manufacturerIdCache.set(normalized, retry.id); return retry.id; }
    throw error;
  }
  manufacturerIdCache.set(normalized, created.id);
  return created.id;
}

function decodeEntities(s: string): string {
  return s.replace(/&#8230;/g, "...").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}

function extractTitle(html: string): string | null {
  const m = html.match(/data-product-title-id="\d+">\s*([^<]+?)\s*<\/h1>/);
  return m ? decodeEntities(m[1]) : null;
}

// Anchors on the URL slug (the known, unambiguous part number) rather than
// guessing from the last word of the title -- confirmed necessary by one
// real sample ("Sensor de presión ... arnés 4384743 CUMMINS 5698567") where
// an unrelated part number appears mid-description before the real
// brand+part-number pair at the very end.
function extractIdentity(title: string, urlSlug: string): { brand: string; partNumber: string } | null {
  const partNumber = urlSlug.toUpperCase();
  const escaped = partNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = title.match(new RegExp(`([A-ZÀ-Ú]{2,}(?:\\s+[A-ZÀ-Ú]{2,})*)\\s+${escaped}\\s*$`));
  return m ? { brand: clean(m[1]), partNumber } : null;
}

type Row = { label: string; value: string };
function extractLabelValueRows(html: string): Row[] {
  const rows: Row[] = [];
  const re = /<th[^>]*>\s*<p>\s*<strong>\s*([^<]+?)\s*<\/strong>\s*<\/p>\s*<\/th>\s*<td[^>]*>\s*(?:<p>\s*([^<]*?)\s*<\/p>)?\s*<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const label = decodeEntities(m[1]).replace(/:\s*$/, "");
    const value = m[2] ? decodeEntities(m[2]) : "";
    if (value) rows.push({ label, value });
  }
  return rows;
}

function parseCrossRefList(raw: string): Array<{ brand: string; partNumber: string }> {
  return raw.split(",").map((seg) => clean(seg)).filter(Boolean).map((seg) => {
    const parts = seg.split(/\s+/);
    const partNumber = parts.pop() || "";
    return { brand: parts.join(" "), partNumber };
  }).filter((p) => p.brand && p.partNumber);
}

export async function syncMegamakHeavyTruckPages(sb: SupabaseClient) {
  const urls = new Set<string>();
  for (const sitemapUrl of SITEMAPS) {
    let xml: string;
    try {
      const r = await fetch(sitemapUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      xml = await r.text();
    } catch { continue; }
    const re = /<loc>\s*(https:\/\/shop\.megamak\.com\.mx\/products\/[^<\s]+)\s*<\/loc>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) urls.add(m[1]);
    await new Promise((res) => setTimeout(res, 300));
  }
  if (!urls.size) return { status: "completed", synced: 0, found: 0 };

  const { data: known } = await sb.from("manufacturer_page_ingestion_queue").select("url").eq("source_key", SOURCE_KEY);
  const knownSet = new Set((known || []).map((r: any) => r.url));
  const toInsert = [...urls].filter((u) => !knownSet.has(u)).map((u) => ({ source_key: SOURCE_KEY, url: u, status: "discovered", family_code: FAMILY_CODE }));
  if (!toInsert.length) return { status: "completed", synced: 0, found: urls.size };

  const CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const { error } = await sb.from("manufacturer_page_ingestion_queue").insert(toInsert.slice(i, i + CHUNK));
    if (error) return { error: error.message, synced: i, found: urls.size };
  }
  return { status: "completed", synced: toInsert.length, found: urls.size };
}

export async function runMegamakHeavyTruckAutoPublish(sb: SupabaseClient, batchSizeRaw: unknown, publishReal: boolean) {
  const batchSize = Math.max(1, Math.min(25, Number(batchSizeRaw) || 10));
  const { data: rows, error } = await sb
    .from("manufacturer_page_ingestion_queue")
    .select("id, url, status")
    .eq("source_key", SOURCE_KEY)
    .in("status", ["discovered", "needs_review"])
    .limit(batchSize);
  if (error) return { error: error.message };
  if (!rows?.length) return { status: "completed", processed: 0, results: [] };

  let token: string | null = null;
  if (publishReal) {
    const { data: t, error: te } = await sb.rpc("get_secret_v1", { p_name: "industrialpedia_publish_pipeline_v1" });
    if (te || !t) return { error: "publish_pipeline_token_unavailable" };
    token = t as string;
  }

  const results: any[] = [];
  let first = true;
  for (const row of rows as any[]) {
    const url = row.url as string;
    if (!first) await new Promise((res) => setTimeout(res, 350));
    first = false;

    const slug = url.replace(/\/+$/, "").split("/").pop() || "";
    let html: string;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`http_${r.status}`);
      html = await r.text();
    } catch (e) {
      const reason = `fetch_failed: ${e instanceof Error ? e.message : String(e)}`;
      await sb.from("manufacturer_page_ingestion_queue").update({ status: "needs_review", notes: reason, updated_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ url, status: "needs_review", reason });
      continue;
    }

    const title = extractTitle(html);
    if (!title) {
      await sb.from("manufacturer_page_ingestion_queue").update({ status: "needs_review", notes: "no_title_found", updated_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ url, status: "needs_review", reason: "no_title_found" });
      continue;
    }
    const identity = extractIdentity(title, slug);
    if (!identity) {
      await sb.from("manufacturer_page_ingestion_queue").update({ status: "needs_review", notes: "identity_pattern_not_matched", extraction_result: { title }, updated_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ url, status: "needs_review", reason: "identity_pattern_not_matched", title });
      continue;
    }

    const dataRows = extractLabelValueRows(html);
    const byLabel = new Map(dataRows.map((r) => [r.label.toLowerCase(), r.value]));
    const aplicacion = byLabel.get("aplicación") || byLabel.get("aplicacion") || "";
    const modelo = byLabel.get("modelo") || "";
    const crossRef = byLabel.get("referencia cruzada") || "";

    const specs: any[] = [];
    if (aplicacion || modelo) {
      const value = [aplicacion, modelo].filter(Boolean).join(" — ");
      specs.push({
        property_code: "engine_application", attribute_name: "aplicación / modelo", original_value: value,
        numeric_value: null, unit: null,
        evidence_text: `Aplicación: ${aplicacion || "(no especificada)"} | Modelo: ${modelo || "(no especificado)"} | fuente=distribuidor autorizado Megamak (${url})`,
        page: "1",
      });
    }
    if (crossRef) {
      specs.push({
        property_code: "oem_cross_reference", attribute_name: "referencia cruzada", original_value: crossRef,
        numeric_value: null, unit: null,
        evidence_text: `Referencia Cruzada: ${crossRef} | fuente=distribuidor autorizado Megamak (${url})`,
        page: "1",
      });
    }
    if (!specs.length) {
      await sb.from("manufacturer_page_ingestion_queue").update({
        status: "needs_review", notes: "no_application_or_cross_reference_data", extraction_result: { title, rows: dataRows }, updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ url, part_number: identity.partNumber, status: "needs_review", reason: "no_application_or_cross_reference_data" });
      continue;
    }

    const manufacturerId = await resolveOrCreateManufacturerId(sb, identity.brand);
    const partNumberEvidence = { evidence_text: `${title} | ficha de producto en distribuidor autorizado Megamak | fuente=${url}`, page: "1" };

    const dry = await sb.rpc("publish_part_v1", {
      p_manufacturer_id: manufacturerId, p_part_number: identity.partNumber, p_family_code: FAMILY_CODE,
      p_source_url: url, p_part_number_evidence: partNumberEvidence, p_specs: specs, p_images: null,
      p_dry_run: true, p_pipeline_token: null,
    });
    if (dry.error) {
      await sb.from("manufacturer_page_ingestion_queue").update({ status: "needs_review", notes: dry.error.message, updated_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ url, part_number: identity.partNumber, status: "error", reason: dry.error.message });
      continue;
    }
    if (!["would_publish", "already_exists"].includes(dry.data?.status)) {
      await sb.from("manufacturer_page_ingestion_queue").update({
        status: "needs_review", notes: JSON.stringify(dry.data).slice(0, 2000), extraction_result: { title, rows: dataRows, dry_run_result: dry.data }, updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ url, part_number: identity.partNumber, status: "needs_review", dry_run_result: dry.data });
      continue;
    }
    if (!publishReal) { results.push({ url, part_number: identity.partNumber, brand: identity.brand, status: "would_publish", specs_found: specs.length }); continue; }

    const real = await sb.rpc("publish_part_v1", {
      p_manufacturer_id: manufacturerId, p_part_number: identity.partNumber, p_family_code: FAMILY_CODE,
      p_source_url: url, p_part_number_evidence: partNumberEvidence, p_specs: specs, p_images: null,
      p_dry_run: false, p_pipeline_token: token,
    });
    if (real.error) {
      await sb.from("manufacturer_page_ingestion_queue").update({ status: "needs_review", notes: real.error.message, updated_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ url, part_number: identity.partNumber, status: "error", reason: real.error.message });
      continue;
    }
    const resolved = ["published", "already_exists_evidence_added"].includes(real.data?.status);
    let crossRefsWritten = 0;
    if (resolved && real.data?.part_id && crossRef) {
      const pairs = parseCrossRefList(crossRef);
      if (pairs.length) {
        const crossRows = pairs.map((p) => ({
          part_id: real.data.part_id, relation_type: "cross_reference", cross_brand_name: p.brand, cross_part_number: p.partNumber,
          evidence_text: `Referencia Cruzada declarada por Megamak: "${crossRef}" | fuente=${url}`, source_url: url,
        }));
        const { error: xe, count } = await sb.from("part_cross_references").upsert(crossRows, { onConflict: "part_id,relation_type,cross_brand_name,cross_part_number", ignoreDuplicates: true, count: "exact" });
        if (!xe) crossRefsWritten = count ?? pairs.length;
      }
    }
    await sb.from("manufacturer_page_ingestion_queue").update({
      status: resolved ? "published" : "needs_review",
      notes: JSON.stringify({ extractor: EXTRACTOR_VERSION, publish_result: real.data, cross_refs_written: crossRefsWritten }).slice(0, 2000),
      processed_at: resolved ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    results.push({ url, part_number: identity.partNumber, brand: identity.brand, status: real.data?.status, part_id: real.data?.part_id, specs_found: specs.length, cross_refs_written: crossRefsWritten });
  }

  return { status: "completed", processed: results.length, results };
}
