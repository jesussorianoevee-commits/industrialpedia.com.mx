// Persistent Deno HTTP server for crawler/extraction execution — replaces per-invocation
// Supabase Edge Functions (which have time/resource limits unsuited to crawling large
// catalogs). Supabase remains the database only; this process does the compute.
import { runExtractor } from "./extractor.ts";
import { runSmcVqzPipeline } from "./smc_vqz_pipeline.ts";

const PORT = Number(Deno.env.get("PORT") || 8787);
const SHARED_TOKEN = Deno.env.get("CRAWLER_SHARED_TOKEN") || "";
const H = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function authorized(req: Request): boolean {
  if (!SHARED_TOKEN) return true; // no token configured: open (dev only, not recommended)
  return req.headers.get("X-Crawler-Token") === SHARED_TOKEN;
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return Response.json({ status: "ok", uptime_s: Math.round(performance.now() / 1000) }, { headers: H });
  }

  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: H });
  }

  try {
    if (url.pathname === "/extract" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { status, json } = await runExtractor(body);
      return Response.json(json, { status, headers: H });
    }

    if (url.pathname === "/pipeline/smc-vqz" && (req.method === "POST" || req.method === "GET")) {
      let body: any = {};
      if (req.method === "POST") body = await req.json().catch(() => ({}));
      const dry = req.method === "GET" ? true : body.dry_run !== false;
      const out = await runSmcVqzPipeline(dry);
      return Response.json(out, { status: out.status === "ok" ? 200 : 503, headers: H });
    }

    return Response.json({ error: "not_found" }, { status: 404, headers: H });
  } catch (e) {
    return Response.json({ status: "error", error: String(e) }, { status: 500, headers: H });
  }
});

console.log(`crawler-server listening on :${PORT}`);
