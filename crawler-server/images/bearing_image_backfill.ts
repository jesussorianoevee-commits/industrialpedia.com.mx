// Ported from the Supabase Edge Function `industrialpedia-bearing-image-backfill-v6` (v5):
// picks one bearing part without a verified image, finds an image candidate on its official
// product page (og:image/twitter:image/<img>), validates it's a real image over HTTP, and
// records it in part_images.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

const UA = "IndustrialpediaBearingImageBackfill/6.2";
const PAGE_TIMEOUT = 8000;
const IMAGE_TIMEOUT = 6000;
const MAX_CANDIDATES = 8;

const abs = (raw: string, base: string) => {
  try { return new URL(raw.replace(/&amp;/g, "&"), base).toString(); } catch { return null; }
};

function candidates(html: string, base: string): string[] {
  const a: string[] = [];
  const add = (v?: string) => { if (!v) return; const u = abs(v, base); if (u && !a.includes(u)) a.push(u); };
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)\s*=\s*["'](?:og:image|twitter:image|twitter:image:src)["'][^>]+content\s*=\s*["']([^"']+)["'][^>]*>/gi)) add(m[1]);
  for (const m of html.matchAll(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+(?:property|name)\s*=\s*["'](?:og:image|twitter:image|twitter:image:src)["'][^>]*>/gi)) add(m[1]);
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) { const x = m[0].match(/(?:src|data-src|data-original)\s*=\s*["']([^"']+)["']/i); if (x) add(x[1]); }
  return a.filter((u) => !/(logo|icon|sprite|flag|facebook|twitter|youtube|linkedin)/i.test(u)).slice(0, MAX_CANDIDATES);
}

async function isValidImage(u: string, ref: string): Promise<boolean> {
  const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8", Referer: ref, Range: "bytes=0-1023" }, redirect: "follow", signal: AbortSignal.timeout(IMAGE_TIMEOUT) });
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  const b = await r.arrayBuffer();
  return r.ok && ct.startsWith("image/") && b.byteLength > 0;
}

export async function runBearingImageBackfill(sb: SupabaseClient) {
  const start = Date.now();

  const { data: locked, error: lockError } = await sb.rpc("claim_bearing_image_backfill_lock_v1");
  if (lockError) return { error: "lock_error", detail: lockError.message };
  if (!locked) return { status: "skipped", reason: "locked_or_stopped" };

  try {
    const { data: rows, error } = await sb.rpc("select_bearing_parts_without_verified_image_v2", { p_limit: 1 });
    if (error) return { error: "selector_error", detail: error.message };
    const p = (rows || [])[0];
    if (!p) {
      const { data: autoStop, error: stopErr } = await sb.rpc("stop_bearing_image_backfill_if_complete_v3");
      if (stopErr) return { error: "auto_stop_error", detail: stopErr.message };
      return { status: "completed", auto_stop: autoStop === true };
    }

    let status = "error", terminal = false;
    const detail: any = { part_number: p.part_number };
    try {
      const page = await fetch(p.source_url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(PAGE_TIMEOUT) });
      if (!page.ok) {
        status = "page_failed";
        detail.http = page.status;
      } else {
        const finalUrl = page.url;
        const list = candidates(await page.text(), finalUrl);
        let chosen: string | null = null;
        for (const u of list) { if (await isValidImage(u, finalUrl)) { chosen = u; break; } }
        if (!chosen) {
          status = "no_valid_image";
          terminal = true;
          detail.candidates = list.length;
        } else {
          const now = new Date().toISOString();
          const { error: ie } = await sb.from("part_images").upsert({
            part_id: p.id, image_url: chosen, source_url: finalUrl, source_type: "official_product_page_image",
            verification_status: "verified", is_primary: true,
            provenance_note: "Deterministic extraction from official manufacturer page; HTTP image validation.",
            discovered_at: now, verified_at: now, source_provider: p.manufacturer_name, source_product_id: p.part_number,
            source_retrieved_at: now, updated_at: now,
          }, { onConflict: "part_id,image_url" });
          if (ie) throw new Error("image_upsert:" + ie.message);
          const { error: primaryError } = await sb.from("part_images").update({ is_primary: false }).eq("part_id", p.id).neq("image_url", chosen);
          if (primaryError) throw new Error("primary_update:" + primaryError.message);
          status = "verified";
          terminal = true;
          detail.image_url = chosen;
        }
      }
    } catch (e) {
      status = "error";
      detail.error = e instanceof Error ? e.message : String(e);
    }

    const { data: attempts, error: attemptsError } = await sb.rpc("get_bearing_image_backfill_attempts_v1", { p_part_id: p.id });
    if (attemptsError) return { error: "attempt_read_error", detail: attemptsError.message };
    if (!terminal && (Number(attempts) || 0) + 1 >= 3) terminal = true;

    const { error: re } = await sb.rpc("record_bearing_image_backfill_outcome_v1", { p_part_id: p.id, p_status: status, p_terminal: terminal });
    if (re) return { error: "record_error", status, detail };

    const { data: autoStop, error: stopErr } = await sb.rpc("stop_bearing_image_backfill_if_complete_v3");
    if (stopErr) return { error: "auto_stop_error", status, detail };

    return { status, detail, terminal, auto_stop: autoStop === true, duration_ms: Date.now() - start };
  } finally {
    await sb.rpc("release_bearing_image_backfill_lock_v1");
  }
}
