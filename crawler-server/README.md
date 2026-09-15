# crawler-server

Persistent Deno HTTP server that runs crawler/extraction execution off a dedicated VPS
instead of Supabase Edge Functions (which have per-invocation time/resource limits).
Supabase remains the database only.

Currently running on Hostinger VPS `2.25.219.229` (id `1980862`), port `8787` (localhost
only), as `systemd` service `industrialpedia-crawler` under an unprivileged `crawler`
user, fronted by Caddy at `https://crawler.industrialpedia.com.mx` (auto TLS via Let's
Encrypt). **Supabase's `pg_net` (used by `cron.job`) can only reach HTTPS endpoints** —
a plain `http://<ip>:8787` URL just sits forever in `net.http_request_queue` with no
response, no timeout, nothing (discovered the hard way during the bearing cutover on
2026-09-15). Any cron job or DB function calling this server MUST use the `https://`
domain, never the bare IP/port.

## Endpoints

- `GET /health` — no auth.
- `POST /extract` — ported from `industrialpedia-structural-extractor-v1`. Body:
  `{ config: {...}, mode?: "records"|"dump" }`.
- `POST /pipeline/smc-vqz` — ported from `industrialpedia-smc-vqz-pipeline-v1`. Body:
  `{ dry_run?: boolean }` (default `true`; `GET` is always a dry run).
- `POST /manufacturer/festo` — ported from `industrialpedia-festo-extractor-v3`. Body:
  `{ queue_id: string, publish_real?: boolean }` (default dry-run). X/Y geometry PDF
  extraction, same technique as VQZ.
- `POST /manufacturer/schneider` — ported from
  `industrialpedia-schneider-structured-extractor-v1`. Same body shape. Fetches HTML via
  the local Firecrawl instance (`FIRECRAWL_URL`, default `http://127.0.0.1:3002`)
  instead of a raw `fetch()` — se.com is a Svelte SPA that needs real rendering.
- `POST /bearings/enrich` — ported from `industrialpedia-bearing-enrichment-worker-v3`.
  Body: `{ batch_size?: number (max 3), dry_run?: boolean }` (default dry-run). Batch-claims
  `deep_groove_ball_bearing` candidates (serves both NSK and NTN) and resolves them via
  `structured_reader.ts`, called in-process instead of over HTTP like the original.
- `POST /discovery/ntn` — ported from `industrialpedia-bearing-ntn-html-discovery-v6`.
  Body: `{ target?: number (max 5) }`. Paginates NTN's bearing catalog.
- `POST /discovery/crawl` — ported from `industrialpedia-crawler-discover-v1`. Body:
  `{ url?, source_key?, limit?, max_depth?, persist?, include_subdomains?, include_paths?,
  exclude_paths? }`. Generic deterministic crawler (robots.txt, sitemap, link extraction) —
  today only Festo uses it, but it's source-agnostic.
- `POST /images/bearing-backfill` — ported from `industrialpedia-bearing-image-backfill-v6`.
  No body. Finds and verifies one official product-page image per bearing part per call.
- `POST /mouser/dispatch` — ported from `industrialpedia-mouser-enrichment-worker-v1`.
  Body: `{ batch_size?: number (max 50), publish_real?: boolean }`. Batch-claims Mouser
  candidates (`claim_deterministic_queue_row_v1`, requires `family_code` non-null) and
  routes each to Schneider / Siemens (`manufacturers/siemens.ts`, new) / generic
  structured-acquisition (`manufacturers/structured_acquisition.ts`, new — extracts only,
  this endpoint publishes) with a linear PDF fallback (`manufacturers/mouser_linear.ts`,
  new — Mouser-hosted PDFs go through the existing Cloudflare Worker proxy).
- `POST /manufacturer/festo/expand` — ported from `industrialpedia-festo-autodiscovery-v1`.
  Body: `{ pdf_url?: string }` (omit to pull the next matching item from the queue).
  Reads a whole-family Festo catalog PDF's ordering table and queues one candidate per
  individual part, with the exact single-part datasheet URL `/manufacturer/festo` needs.
- `POST /manufacturer/festo/batch` — new (not a port). Body:
  `{ batch_size?: number (max 20), publish_real?: boolean }`. Most of the raw Festo
  backlog turned out to already be single-part datasheets named by part number
  (`DataSheet/EN_US/{number}.pdf`) rather than whole catalogs — this reads the identity
  (type code, family) straight off the datasheet's own first page, fills in the queue
  row, then calls `/manufacturer/festo` on it (`manufacturers/festo_identity_resolver.ts`).

All of the above require header `X-Crawler-Token: <CRAWLER_SHARED_TOKEN>`.

**Automated feeding runs from this VPS, not Supabase pg_cron**: a systemd timer
(`industrialpedia-ingestion-tick.timer`, every 2 min) calls `/mouser/dispatch`,
`/manufacturer/festo/batch`, and `/manufacturer/festo/expand` over localhost
(`deploy/ingestion-tick.sh`) — no dependency on the pg_net/HTTPS constraint at all since
nothing calls out from Supabase to trigger it.

Both manufacturer workers share `manufacturer_worker.ts` (queue claim, alias lookup,
`publish_part_v1` + status finalize) and `robots.ts` (real `Disallow`/`User-agent`
parsing via `npm:robots-parser`, not just "is robots.txt reachable" like the original
`industrialpedia-acquisition-engine-v1`). Adding a new manufacturer means one file in
`manufacturers/` reusing that scaffold — see `manufacturers/festo.ts` for the shortest
example. `structured_reader.ts` (deterministic HTML/PDF spec extraction with alias
matching) is shared between `bearings.ts` and, potentially, future non-bearing
structured-source workers.

## Deploy / update

On the VPS, as root:

```bash
bash /opt/industrialpedia/crawler-server/deploy/deploy.sh
```

First run needs `/opt/industrialpedia/crawler-server/.env` in place (copy
`.env.example`, fill in `SUPABASE_SERVICE_ROLE_KEY` and `CRAWLER_SHARED_TOKEN` — the
deploy script refuses to run without it, and never generates or commits it).

## Validated (2026-09-14)

`POST /pipeline/smc-vqz` with `dry_run:true` against the live VPS returned all 29 VQZ
parts as `already_exists` with `part_id`s matching exactly what's already published —
confirms the port behaves identically to the original Edge Function. Re-validated after
wiring `smc_vqz_pipeline.ts` to call `runExtractor()` in-process (`VQZ_CONFIG`,
reconstructed from `industrialpedia-vqz-structural-extractor-v2`'s own hardcoded values,
PASS 8/8, all 29 cv_1_4_2/weight values matching `part_evidence` exactly) — same 29/29
match, now with zero calls out to Supabase during extraction. Supabase is database-only
for this pipeline.

**Festo/Schneider (2026-09-15):** both endpoints verified against real Supabase data —
`/manufacturer/festo` against a real queued item correctly returned
`needs_review: exact_identity_family_missing` (the row's `evidence` is genuinely `{}`,
same outcome the original Edge Function would give — no queued item currently has the
identity fields populated, a consequence of the disabled discovery/dispatch cron jobs,
not a bug in this port), and the queue row was left in the correct final state
(`status:'needs_review'`, `stage:'decision'`). `/manufacturer/schneider` had no queued
item to test against (none currently queued for that source); routing/auth verified
with a nonexistent `queue_id` (`{status:"idle"}`), and the Firecrawl-fetch path was
already validated directly against the real configured route (`LC1D25JD`, se.com)
earlier in the same session.

**Bearings + generic discovery (2026-09-15):** before porting anything, audited which of
the *active* Supabase cron jobs actually produce results (real `parts`/`part_images`
writes, not just "the cron ran without error") — `bearing-enrichment-worker-v3` (NSK:
9,295 touches/7d, NTN: 894/7d), `bearing-ntn-html-discovery-v6`, `crawler-discover-v1`
(via Festo, 44 new candidates/24h), and `bearing-image-backfill-v6` (772 images/7d) were
all genuinely working and got ported. `mouser-enrichment-worker-v1` (0 real output in 7d
despite "successful" cron dispatch) and Schneider's automatic discovery (never ran even
once, `last_success_at: null`) were confirmed non-functional and left untouched — not
worth porting dead automation.

Validated against real data: `/bearings/enrich` (dry-run) against a real re-queued NSK
row correctly fetched the live NSK page and extracted 3 real specs (bore/outside
diameter, width) — row restored to its exact original state after the test.
`/discovery/ntn` ran 6 real paginated calls against the live NTN catalog with correct
known/new dedup accounting. `/discovery/crawl` ran against the real Festo FTP directory
(`persist:false` then `persist:true`) with no duplicate rows created. `/images/bearing-
backfill` correctly reached the same lock/auto-stop state as the live system.

**Cron cutover (2026-09-15):** all 5 corresponding cron jobs/functions
(`bearing-nsk-enrichment`, `bearing-ntn-enrichment`, `bearing-ntn-html-discovery`,
`bearing-image-backfill-v6`, `festo_firecrawl_discovery_tick_v1`) now point at
`https://crawler.industrialpedia.com.mx`. First attempt used the bare
`http://<ip>:8787` URL and silently never worked (see the pg_net/HTTPS note above) —
rolled back immediately, added the Caddy HTTPS front door, then re-cut. Verified
post-cutover: real 200 responses with VPS-port response bodies, catalog count unchanged
(9,414), live search unchanged.

## Known follow-up (not done yet)

The original Supabase Edge Functions (`industrialpedia-structural-extractor-v1`,
`industrialpedia-smc-vqz-pipeline-v1`, `industrialpedia-vqz-structural-extractor-v2`,
`industrialpedia-festo-extractor-v3`, `industrialpedia-schneider-structured-extractor-v1`,
`industrialpedia-bearing-enrichment-worker-v3`, `industrialpedia-deterministic-structured-
reader-v1`, `industrialpedia-bearing-ntn-html-discovery-v6`, `industrialpedia-crawler-
discover-v1`, `industrialpedia-bearing-image-backfill-v6`) are still deployed and
untouched — left running in parallel on purpose during validation. Retire them via
`docs/REGISTRO-ENDPOINTS.md`'s protocol once confidence is established.

Siemens and Mouser extractors were found (same per-manufacturer pattern) but not yet
ported — add `manufacturers/siemens.ts` / `manufacturers/mouser.ts` reusing
`manufacturer_worker.ts` when needed. No new catalog routes were added for any
manufacturer in this pass (data curation, separate from this infra work). Migrating
`search-v17`/`catalog-stats`/`structured-acquisition-v1` (the frontend-facing API) is a
separate, higher-risk sub-project, identified but not started.
