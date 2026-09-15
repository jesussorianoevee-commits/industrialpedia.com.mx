#!/usr/bin/env bash
# Run on the VPS (as root) to (re)deploy crawler-server. First run also does one-time setup.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jesussorianoevee-commits/industrialpedia.com.mx.git}"
APP_DIR=/opt/industrialpedia
SRV_DIR="$APP_DIR/crawler-server"

id -u crawler &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin crawler

# One-time host setup: unzip (deno installer needs it), ufw, deno itself in a
# world-executable location (NOT /root — the unprivileged `crawler` user can't traverse it).
command -v unzip >/dev/null || { apt-get update -qq && apt-get install -y -qq unzip ufw; }
if ! command -v /usr/local/bin/deno >/dev/null; then
  curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/root/.deno sh -s v2.1.4
  cp /root/.deno/bin/deno /usr/local/bin/deno
  chmod 755 /usr/local/bin/deno
fi
mkdir -p "$APP_DIR/.deno-cache"

mkdir -p "$APP_DIR"
git config --global --add safe.directory "$APP_DIR"
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

# Firewall: only SSH and the crawler port, if not already configured.
ufw status | grep -q "^22" || { ufw allow 22/tcp comment SSH; ufw allow 8787/tcp comment crawler-server; ufw --force enable; }

cp "$SRV_DIR/deploy/industrialpedia-crawler.service" /etc/systemd/system/industrialpedia-crawler.service
systemctl daemon-reload
systemctl enable industrialpedia-crawler
systemctl restart industrialpedia-crawler
systemctl --no-pager status industrialpedia-crawler
