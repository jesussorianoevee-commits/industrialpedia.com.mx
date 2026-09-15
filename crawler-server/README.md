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

`/extract` and `/pipeline/smc-vqz` require header `X-Crawler-Token: <CRAWLER_SHARED_TOKEN>`.

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

## Known follow-up (not done yet)

The original Supabase Edge Functions (`industrialpedia-structural-extractor-v1`,
`industrialpedia-smc-vqz-pipeline-v1`, `industrialpedia-vqz-structural-extractor-v2`) are
still deployed and untouched — left running in parallel on purpose during validation.
Retire them via `docs/REGISTRO-ENDPOINTS.md`'s protocol once confidence is established.
