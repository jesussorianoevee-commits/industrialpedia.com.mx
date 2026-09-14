#!/usr/bin/env bash
# Run on the VPS (as root) to (re)deploy crawler-server. First run also does one-time setup.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jesussorianoevee-commits/industrialpedia.com.mx.git}"
APP_DIR=/opt/industrialpedia
SRV_DIR="$APP_DIR/crawler-server"

id -u crawler &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin crawler

mkdir -p "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

if [ ! -f "$SRV_DIR/.env" ]; then
  echo "Missing $SRV_DIR/.env — copy from .env.example and fill in real values before continuing." >&2
  exit 1
fi

chown -R crawler:crawler "$APP_DIR"
chmod 600 "$SRV_DIR/.env"

cp "$SRV_DIR/deploy/industrialpedia-crawler.service" /etc/systemd/system/industrialpedia-crawler.service
systemctl daemon-reload
systemctl enable industrialpedia-crawler
systemctl restart industrialpedia-crawler
systemctl --no-pager status industrialpedia-crawler
