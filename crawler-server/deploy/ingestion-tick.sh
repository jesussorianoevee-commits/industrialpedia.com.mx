#!/usr/bin/env bash
# Runs one round of the automated-feeding endpoints, scheduled entirely from this VPS
# (systemd timer, not Supabase pg_cron) — no dependency on the pg_net/HTTPS constraint at
# all since it talks to the Deno server over localhost.
set -uo pipefail
set -a; source /opt/industrialpedia/crawler-server/.env; set +a
BASE="http://127.0.0.1:8787"

call() {
  local path="$1" body="$2" label="$3" timeout="$4"
  printf 'header = "X-Crawler-Token: %s"\nheader = "Content-Type: application/json"\n' "$CRAWLER_SHARED_TOKEN" \
    | curl -s -m "$timeout" -K - -X POST "$BASE$path" -d "$body" -o /dev/null -w "$label: HTTP %{http_code} in %{time_total}s\n"
}

# batch sizes tuned so each call reliably finishes inside its timeout, well under the
# timer's 5-minute interval (deploy/industrialpedia-ingestion-tick.timer).
call "/mouser/dispatch" '{"batch_size":8,"publish_real":true}' "mouser/dispatch" 200
call "/manufacturer/festo/batch" '{"batch_size":8,"publish_real":true}' "festo/batch" 120
call "/manufacturer/festo/expand" '{}' "festo/expand" 60
