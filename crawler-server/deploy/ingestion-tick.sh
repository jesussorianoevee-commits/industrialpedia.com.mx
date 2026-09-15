#!/usr/bin/env bash
# Runs one round of the automated-feeding endpoints, scheduled entirely from this VPS
# (systemd timer, not Supabase pg_cron) — no dependency on the pg_net/HTTPS constraint at
# all since it talks to the Deno server over localhost.
set -uo pipefail
set -a; source /opt/industrialpedia/crawler-server/.env; set +a
BASE="http://127.0.0.1:8787"

call() {
  local path="$1" body="$2" label="$3"
  printf 'header = "X-Crawler-Token: %s"\nheader = "Content-Type: application/json"\n' "$CRAWLER_SHARED_TOKEN" \
    | curl -s -m 90 -K - -X POST "$BASE$path" -d "$body" -o /dev/null -w "$label: HTTP %{http_code} in %{time_total}s\n"
}

call "/mouser/dispatch" '{"batch_size":20,"publish_real":true}' "mouser/dispatch"
call "/manufacturer/festo/batch" '{"batch_size":10,"publish_real":true}' "festo/batch"
call "/manufacturer/festo/expand" '{}' "festo/expand"
