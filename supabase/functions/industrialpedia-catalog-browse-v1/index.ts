import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function getKeys() {
  let publishable: string | undefined;
  let secret: string | undefined;
  try {
    const parsed = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    publishable = parsed.default;
  } catch {}
  try {
    const parsed = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    secret = parsed.default;
  } catch {}
  return {
    publishable: publishable || Deno.env.get("SUPABASE_ANON_KEY") || "",
    secret: secret || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  };
}

function authorized(req: Request) {
  const presented = req.headers.get("apikey") || "";
  const { publishable } = getKeys();
  return Boolean(presented && publishable && presented === publishable);
}

const parsePositiveInt = (raw: string | null, fallback: number, max: number) => {
  const value = Number(raw ?? fallback);
  return Number.isInteger(value) && value >= 0 ? Math.min(value, max) : fallback;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const area = (url.searchParams.get("family") ?? "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 20));
  const offset = parsePositiveInt(url.searchParams.get("offset"), 0, 1000000);

  if (!area) return json({ error: "missing_family" }, 400);

  const { secret } = getKeys();
  if (!secret) return json({ error: "server_secret_not_configured" }, 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secret);

  const { data: rows, error } = await supabase
    .from("parts")
    .select("id,part_number,category,description,name,status,specifications,source_url,manufacturers(name)")
    .eq("category", area)
    .is("archived_at", null)
    .in("status", ["candidate", "verified"])
    .order("part_number", { ascending: true })
    .range(offset, offset + limit);

  if (error) {
    console.error("catalog_browse_parts_failed", error);
    return json({ error: "catalog_browse_failed" }, 500);
  }

  const sourceRows = Array.isArray(rows) ? rows : [];
  const pageRows = sourceRows.slice(0, limit);
  const hasMore = sourceRows.length > limit;
  const ids = pageRows.map((row: any) => row.id).filter(Boolean);

  let evidenceRows: any[] = [];
  let imageRows: any[] = [];

  if (ids.length) {
    const [evidenceResult, imageResult] = await Promise.all([
      supabase
        .from("part_evidence")
        .select("part_id,source_id")
        .in("part_id", ids),
      supabase
        .from("part_images")
        .select("part_id,image_url,verification_status,source_provider,is_primary,verified_at,created_at")
        .in("part_id", ids)
        .eq("verification_status", "verified")
        .not("image_url", "is", null)
        .order("is_primary", { ascending: false })
        .order("verified_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
    ]);

    if (evidenceResult.error) console.error("catalog_browse_evidence_failed", evidenceResult.error);
    else evidenceRows = evidenceResult.data ?? [];

    if (imageResult.error) console.error("catalog_browse_images_failed", imageResult.error);
    else imageRows = imageResult.data ?? [];
  }

  const evidenceByPart = new Map<string, { count: number; sourceIds: string[] }>();
  for (const row of evidenceRows) {
    const current = evidenceByPart.get(row.part_id) ?? { count: 0, sourceIds: [] };
    current.count += 1;
    if (row.source_id && !current.sourceIds.includes(row.source_id)) current.sourceIds.push(row.source_id);
    evidenceByPart.set(row.part_id, current);
  }

  const imageByPart = new Map<string, any>();
  for (const row of imageRows) {
    if (!imageByPart.has(row.part_id)) imageByPart.set(row.part_id, row);
  }

  const results = pageRows.map((row: any) => {
    const evidence = evidenceByPart.get(row.id) ?? { count: 0, sourceIds: [] };
    const image = imageByPart.get(row.id) ?? null;
    return {
      part_id: row.id,
      part_number: row.part_number || "",
      manufacturer: row.manufacturers?.name || "",
      name: row.name || "",
      category: row.category || area,
      description: row.description || row.name || "",
      specifications: row.specifications && typeof row.specifications === "object" ? row.specifications : {},
      status: row.status,
      source_url: row.source_url || null,
      evidence_count: evidence.count,
      source_count: evidence.sourceIds.length,
      source_ids: evidence.sourceIds,
      image_url: image?.image_url || null,
      image_verification_status: image?.verification_status || null,
      image_source: image?.source_provider || null,
      image_is_primary: image?.is_primary === true,
    };
  });

  return json({
    api_version: "v1",
    operation: "catalog_browse",
    area,
    results,
    has_more: hasMore,
    page_size: limit,
    offset,
  });
});
