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

# HTTPS front door: Supabase's pg_net (used by cron jobs) can only reach HTTPS endpoints,
# not plain http://ip:port — Caddy terminates TLS (auto Let's Encrypt) and proxies to the
# Deno server on localhost:8787. Requires crawler.industrialpedia.com.mx's DNS A record to
# point at this VPS (set up separately, not by this script).
if ! command -v caddy >/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

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

# Firewall: SSH, HTTP/HTTPS (Caddy), if not already configured. 8787 is intentionally NOT
# opened here — Caddy is the only public entry point; it reaches the Deno server over
# localhost, which ufw's default-allow-outgoing/loopback policy doesn't restrict.
ufw status | grep -q "^22" || { ufw allow 22/tcp comment SSH; ufw allow 80/tcp comment "HTTP (ACME + redirect)"; ufw allow 443/tcp comment "HTTPS crawler-server"; ufw --force enable; }

cp "$SRV_DIR/deploy/industrialpedia-crawler.service" /etc/systemd/system/industrialpedia-crawler.service
cp "$SRV_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
chmod +x "$SRV_DIR/deploy/ingestion-tick.sh"

# Automated feeding (Mouser + Festo) scheduled locally on this VPS via a systemd timer --
# deliberately not a Supabase pg_cron job, so it never depends on pg_net's HTTPS-only egress.
cp "$SRV_DIR/deploy/industrialpedia-ingestion-tick.service" /etc/systemd/system/industrialpedia-ingestion-tick.service
cp "$SRV_DIR/deploy/industrialpedia-ingestion-tick.timer" /etc/systemd/system/industrialpedia-ingestion-tick.timer

systemctl daemon-reload
systemctl enable industrialpedia-crawler
systemctl restart industrialpedia-crawler
systemctl enable --now industrialpedia-ingestion-tick.timer
systemctl reload caddy || systemctl restart caddy
systemctl --no-pager status industrialpedia-crawler
systemctl --no-pager status caddy
systemctl --no-pager status industrialpedia-ingestion-tick.timer
