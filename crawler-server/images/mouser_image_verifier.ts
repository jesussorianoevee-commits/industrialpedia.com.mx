// Re-verifies part_images rows sourced from Mouser's Search API
// (source_provider='mouser_search_api_v1', verification_status='candidate').
//
// Context: Mouser product pages are a client-rendered SPA -- a plain fetch()
// returns an empty app shell (verified directly: no part number, no image
// filename anywhere in the fetched HTML), so the HTML-text-matching approach
// used for Siemens/Festo/SMC/etc (structured_reader.ts style) cannot work
// here. Instead this re-queries Mouser's own Search API (the same
// authoritative source that produced these images originally) for the exact
// part number and compares the ImagePath it returns today against what was
// stored. Real-world case that motivated this: two distinct Schneider part
// numbers (XB5KSB, XB5KSG) were found sharing the exact same stored
// image_url -- a pairing this re-check can catch and reject.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

const MOUSER_ENDPOINT = "https://api.mouser.com/api/v2/search/partnumber";
const REQUEST_TIMEOUT = 10000;
const DELAY_BETWEEN_CALLS_MS = 350; // stay well under Mouser's per-second rate limit

const norm = (v: unknown) => String(v ?? "").toUpperCase().replace(/[\s._/-]+/g, "");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mouserExactLookup(apiKey: string, partNumber: string): Promise<{ ok: true; imagePath: string } | { ok: false; reason: string }> {
  let response: Response;
  try {
    response = await fetch(`${MOUSER_ENDPOINT}?apiKey=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ SearchByPartRequest: { mouserPartNumber: partNumber, partSearchOptions: "Exact" } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "fetch_error" };
  }
  const text = await response.text();
  let json: any;
  try { json = JSON.parse(text); } catch { return { ok: false, reason: "non_json_response" }; }
  if (!response.ok || (json?.Errors || []).length) return { ok: false, reason: "mouser_api_error" };
  const parts = Array.isArray(json?.SearchResults?.Parts) ? json.SearchResults.Parts : [];
  const exact = parts.filter((p: any) => norm(p?.ManufacturerPartNumber) === norm(partNumber));
  if (exact.length === 0) return { ok: false, reason: "part_not_found_in_mouser_today" };
  if (exact.length > 1) return { ok: false, reason: "ambiguous_match" };
  return { ok: true, imagePath: String(exact[0]?.ImagePath || "").trim() };
}

export async function runMouserImageVerification(sb: SupabaseClient, batchSizeRaw: unknown) {
  const batchSize = Math.min(Math.max(Number(batchSizeRaw) || 5, 1), 20);

  const { data: apiKey, error: keyError } = await sb.rpc("get_secret_v1", { p_name: "mouser_search_api_key" });
  if (keyError || !apiKey) return { error: "mouser_api_key_unavailable", detail: keyError?.message };

  const { data: rows, error } = await sb
    .from("part_images")
    .select("id, part_id, image_url, parts!inner(part_number)")
    .eq("source_provider", "mouser_search_api_v1")
    .eq("verification_status", "candidate")
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (error) return { error: "selector_error", detail: error.message };

  const results: Array<{ id: string; part_number: string; outcome: string; reason?: string }> = [];
  for (const row of rows || []) {
    const partNumber = String((row as any).parts?.part_number || "").trim();
    const now = new Date().toISOString();
    if (!partNumber) {
      results.push({ id: row.id, part_number: "", outcome: "skipped", reason: "part_number_missing" });
      continue;
    }

    const lookup = await mouserExactLookup(apiKey, partNumber);
    if (!lookup.ok) {
      await sb.from("part_images").update({
        verification_status: "rejected",
        provenance_note: `Mouser API re-verification failed: ${lookup.reason}. Original candidate image could not be independently confirmed.`,
        updated_at: now,
      }).eq("id", row.id);
      results.push({ id: row.id, part_number: partNumber, outcome: "rejected", reason: lookup.reason });
      await sleep(DELAY_BETWEEN_CALLS_MS);
      continue;
    }

    const matches = Boolean(lookup.imagePath) && lookup.imagePath === row.image_url;
    if (matches) {
      await sb.from("part_images").update({
        verification_status: "verified",
        verified_at: now,
        updated_at: now,
        provenance_note: "Re-verified against Mouser Search API v2 (exact part number match; image_url re-confirmed against current API response).",
      }).eq("id", row.id);
      results.push({ id: row.id, part_number: partNumber, outcome: "verified" });
    } else {
      await sb.from("part_images").update({
        verification_status: "rejected",
        provenance_note: `Mouser API re-verification mismatch: stored image_url does not match Mouser's current ImagePath for this exact part number (stored=${row.image_url || "(empty)"}, current=${lookup.imagePath || "(none)"}).`,
        updated_at: now,
      }).eq("id", row.id);
      results.push({ id: row.id, part_number: partNumber, outcome: "rejected", reason: "image_mismatch" });
    }
    await sleep(DELAY_BETWEEN_CALLS_MS);
  }

  return {
    status: "completed",
    processed: results.length,
    verified: results.filter((r) => r.outcome === "verified").length,
    rejected: results.filter((r) => r.outcome === "rejected").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    results,
  };
}
