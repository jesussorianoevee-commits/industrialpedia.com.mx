// Ported from the Supabase Edge Function `industrialpedia-schneider-structured-extractor-v1`
// (v5, "schneider-structured-extractor-v3-deterministic-label-compat"): same fuzzy
// label:value line matching against spec_attribute_aliases. One deliberate change vs
// the original: the fetch step goes through the local Firecrawl instance instead of a
// raw fetch() — validated against a real route (LC1D25JD, se.com, a Svelte SPA) that a
// plain fetch() would very likely not render correctly.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { claimQueueItem, fetchAliasMap, publishAndFinalize, markNeedsReview, clean, normLabel } from "../manufacturer_worker.ts";

const EXTRACTOR_VERSION = "schneider-structured-extractor-v1-vps-port";
const FIRECRAWL_URL = Deno.env.get("FIRECRAWL_URL") || "http://127.0.0.1:3002";

function textLines(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);
}

function val(s: string) {
  const m = clean(s).match(/([<>≤≥+\-]?\s*\d+(?:[.,]\d+)?)(?:\s*(?:\.\.|-|to)\s*\d+(?:[.,]\d+)?)?\s*([a-zA-ZµμΩω°%/²³][a-zA-Z0-9µμΩω°%/²³]*)/);
  return m ? { numeric_value: String(Number(m[1].replace(/\s+/g, "").replace(",", "."))), unit: m[2].toLowerCase() } : null;
}

async function fetchHtmlViaFirecrawl(url: string): Promise<{ ok: boolean; html: string; status: number }> {
  const r = await fetch(`${FIRECRAWL_URL}/v1/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["html"] }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) return { ok: false, html: "", status: r.status };
  const data = await r.json().catch(() => null);
  const html = data?.data?.html || "";
  const statusCode = data?.data?.metadata?.statusCode ?? (data?.success ? 200 : 502);
  return { ok: !!data?.success && !!html, html, status: statusCode };
}

export async function runSchneiderWorker(sb: SupabaseClient, queueId: string, publishReal: boolean) {
  const claimed = await claimQueueItem(sb, queueId);
  if ("idle" in claimed) return { status: "idle" };
  if ("busy" in claimed) return { status: "busy" };
  if ("error" in claimed) return { status: "error", reason: claimed.error };

  const item = claimed.item as any;
  const payload = item.ingestion_records.payload || {};
  const mpn = clean(payload.manufacturer_part_number || payload.part_number || payload.mpn);
  const family = clean(item.family_code || payload.family_code);
  const mfr = clean(payload.manufacturer);
  const ev = item.evidence || {};

  try {
    const { data: routes } = await sb.rpc("resolve_acquisition_routes_v1", { p_manufacturer: mfr, p_part_number: mpn });
    const route = (routes || []).find((x: any) => x.method === "structured" && x.url && x.authority === "manufacturer");
    if (!route) throw new Error("no_official_structured_route");

    const fr = await fetchHtmlViaFirecrawl(route.url);
    if (!fr.ok) throw new Error(`official_structured_fetch_failed_http_${fr.status}`);

    const lines = textLines(fr.html);
    const all = lines.join(" | ");
    const esc = mpn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`(?:^|[^A-Za-z0-9])${esc}(?:$|[^A-Za-z0-9])`, "i").test(all)) throw new Error("official_identity_not_found");

    const { defMap, aliasRows } = await fetchAliasMap(sb, family);

    const specs: any[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const line = clean(lines[i]);
      const nl = normLabel(line);
      let bestCode: string | null = defMap.get(nl) || null;
      let bestScore = bestCode ? 10000 : 0;
      for (const a of aliasRows) {
        let score = 0;
        if (nl === a.norm) score = 10000 + a.norm.length;
        else if (nl.includes(a.norm)) score = 5000 + a.norm.length;
        else if (a.norm.includes(nl) && nl.length >= 8) score = 4000 + nl.length;
        if (score > bestScore) { bestScore = score; bestCode = a.code; }
      }
      if (!bestCode) continue;

      let rest = "";
      const aliasLabel = aliasRows.find((a) => a.code === bestCode)?.norm || normLabel(bestCode);
      if (nl === aliasLabel) rest = lines[i + 1] || "";
      else {
        const firstWord = aliasLabel.split(" ")[0];
        const idx = line.toLowerCase().indexOf(firstWord);
        rest = clean(line.slice(idx >= 0 ? idx + firstWord.length : 0).replace(/^[:=\-–—]+/, ""));
      }
      if (!rest || normLabel(rest) === nl) rest = lines[i + 1] || "";

      const z = val(rest);
      if (!z) continue;
      const key = bestCode + "|" + rest;
      if (seen.has(key)) continue;
      seen.add(key);
      specs.push({ property_code: bestCode, attribute_name: line, original_value: rest, numeric_value: z.numeric_value, unit: z.unit, evidence_text: `${line}: ${rest} | source=manufacturer_official_structured | url=${route.url}`, page: "1" });
    }

    return await publishAndFinalize(sb, {
      queueId,
      ingestionRecordId: item.ingestion_record_id,
      manufacturerId: payload.manufacturer_id,
      partNumber: mpn,
      familyCode: family,
      sourceUrl: route.url,
      specs,
      partNumberEvidence: { evidence_text: `${mpn} | exact identity | source=manufacturer_official_structured | url=${route.url}`, page: "1" },
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
