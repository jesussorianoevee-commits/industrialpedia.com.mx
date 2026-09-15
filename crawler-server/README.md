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
confirms the port behaves identically to the original Edge Function.

## Known follow-up (not done yet)

`smc_vqz_pipeline.ts` still calls the OLD Supabase-hosted extractor
(`industrialpedia-vqz-structural-extractor-v2`) via `LEGACY_EXTRACTOR_URL`, not the
`/extract` route in this same server — the VQZ-specific config for the generic extractor
was never captured in this repo, and guessing it would risk changing what gets published.
Recover/rebuild that config before wiring it to call `/extract` locally instead.
