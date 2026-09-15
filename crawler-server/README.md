# crawler-server

Persistent Deno HTTP server that runs crawler/extraction execution off a dedicated VPS
instead of Supabase Edge Functions (which have per-invocation time/resource limits).
Supabase remains the database only.

Currently running on Hostinger VPS `2.25.219.229` (id `1980862`), port `8787`, as
`systemd` service `industrialpedia-crawler` under an unprivileged `crawler` user.

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

All of the above require header `X-Crawler-Token: <CRAWLER_SHARED_TOKEN>`.

Both manufacturer workers share `manufacturer_worker.ts` (queue claim, alias lookup,
`publish_part_v1` + status finalize) and `robots.ts` (real `Disallow`/`User-agent`
parsing via `npm:robots-parser`, not just "is robots.txt reachable" like the original
`industrialpedia-acquisition-engine-v1`). Adding a new manufacturer means one file in
`manufacturers/` reusing that scaffold — see `manufacturers/festo.ts` for the shortest
example.

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

## Known follow-up (not done yet)

The original Supabase Edge Functions (`industrialpedia-structural-extractor-v1`,
`industrialpedia-smc-vqz-pipeline-v1`, `industrialpedia-vqz-structural-extractor-v2`,
`industrialpedia-festo-extractor-v3`, `industrialpedia-schneider-structured-extractor-v1`)
are still deployed and untouched — left running in parallel on purpose during
validation. Retire them via `docs/REGISTRO-ENDPOINTS.md`'s protocol once confidence is
established.

Siemens and Mouser extractors were found (same per-manufacturer pattern) but not yet
ported — add `manufacturers/siemens.ts` / `manufacturers/mouser.ts` reusing
`manufacturer_worker.ts` when needed. No new catalog routes were added for any
manufacturer in this pass (data curation, separate from this infra work).
