#!/usr/bin/env bash
# Sets up the home game server on a Raspberry Pi (Raspberry Pi OS / Debian, arm64) or any Debian/Ubuntu box.
#   1. copy your Firebase service-account JSON next to this script as sa.json
#   2. ./install.sh <firebase-project-id> <database-url>
# It installs Node.js and cloudflared, installs the server's packages, and starts it as a service that comes back on
# its own after a crash or a reboot. Run it again any time to update.
set -euo pipefail
PROJECT="${1:?usage: ./install.sh <firebase-project-id> <database-url>}"
DBURL="${2:?usage: ./install.sh <firebase-project-id> <database-url>}"
DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "$DIR/sa.json" ] || { echo "Put the service-account JSON at $DIR/sa.json first."; exit 1; }
chmod 600 "$DIR/sa.json"

echo "== Node.js"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  sudo apt-get update && sudo apt-get install -y nodejs npm
fi
node -v

echo "== cloudflared"
if ! command -v cloudflared >/dev/null; then
  ARCH="$(dpkg --print-architecture)"   # arm64 on a Pi 5
  curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  sudo dpkg -i /tmp/cloudflared.deb && rm /tmp/cloudflared.deb
fi
cloudflared --version

echo "== packages"
cd "$DIR" && npm install --omit=dev --no-audit --no-fund

echo "== service"
sudo tee /etc/systemd/system/pw-auto-online.service >/dev/null <<UNIT
[Unit]
Description=Poway Automobile Online game server
After=network-online.target
Wants=network-online.target

[Service]
User=$(id -un)
WorkingDirectory=$DIR
Environment=FIREBASE_PROJECT=$PROJECT
Environment=FIREBASE_DB_URL=$DBURL
Environment=SERVICE_ACCOUNT=$DIR/sa.json
ExecStart=$(command -v node) $DIR/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now pw-auto-online
sudo systemctl restart pw-auto-online
sleep 8
sudo journalctl -u pw-auto-online -n 15 --no-pager
echo
echo "Done. Look for a 'published wss://...trycloudflare.com' line above."
echo "Logs:    journalctl -u pw-auto-online -f"
echo "Stop:    sudo systemctl stop pw-auto-online      Start: sudo systemctl start pw-auto-online"
