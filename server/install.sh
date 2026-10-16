#!/usr/bin/env bash
# Sets up the home game server on a Linux box (Raspberry Pi OS, Debian, Ubuntu; arm64 or amd64).
#   ./install.sh <firebase-project-id> <database-url>
# With sudo: installs Node.js / cloudflared system-wide and a system service (survives reboots).
# Without sudo: everything goes in your home folder and runs as a user service (see the note at the end).
# Optional: sa.json next to this script (a Firebase service-account key) lets the server publish its own address,
# which a free quick tunnel needs because its address changes on every restart. With a fixed address (named tunnel
# or your own domain), skip the key and run with TUNNEL=none PUBLIC_URL=wss://... (see README.md).
# Run it again any time to update.
set -euo pipefail
PROJECT="${1:?usage: ./install.sh <firebase-project-id> <database-url>}"
DBURL="${2:?usage: ./install.sh <firebase-project-id> <database-url>}"
DIR="$(cd "$(dirname "$0")" && pwd)"
TUNNEL="${TUNNEL:-quick}"; PUBLIC_URL="${PUBLIC_URL:-}"
SUDO=""; if sudo -n true 2>/dev/null; then SUDO="sudo"; fi
if [ -f "$DIR/sa.json" ]; then chmod 600 "$DIR/sa.json"; elif [ "$TUNNEL" = "quick" ]; then
  echo "No sa.json: a quick tunnel's address can't be published without it. Add the key, or use a fixed address:"
  echo "  TUNNEL=none PUBLIC_URL=wss://game.yourdomain.com ./install.sh $PROJECT $DBURL"; exit 1; fi
ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"; case "$ARCH" in aarch64) ARCH=arm64;; x86_64) ARCH=amd64;; esac
mkdir -p "$HOME/.local/bin"; export PATH="$HOME/.local/bin:$PATH"

echo "== Node.js (18 or newer)"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  if [ -n "$SUDO" ]; then $SUDO apt-get update && $SUDO apt-get install -y nodejs npm
  else echo "Node 18+ is needed. Install it in your home folder (e.g. https://nodejs.org tarball into ~/.local) and rerun."; exit 1; fi
fi
node -v

echo "== cloudflared"
if [ "$TUNNEL" = "quick" ] && ! command -v cloudflared >/dev/null; then
  if [ -n "$SUDO" ]; then
    curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
    $SUDO dpkg -i /tmp/cloudflared.deb && rm /tmp/cloudflared.deb
  else
    curl -fsSL -o "$HOME/.local/bin/cloudflared" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}"
    chmod +x "$HOME/.local/bin/cloudflared"
  fi
fi
[ "$TUNNEL" = "quick" ] && cloudflared --version

echo "== packages"
cd "$DIR" && npm install --omit=dev --no-audit --no-fund

ENVS="Environment=FIREBASE_PROJECT=$PROJECT
Environment=FIREBASE_DB_URL=$DBURL
Environment=TUNNEL=$TUNNEL
Environment=PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
[ -f "$DIR/sa.json" ] && ENVS="$ENVS
Environment=SERVICE_ACCOUNT=$DIR/sa.json"
[ -n "$PUBLIC_URL" ] && ENVS="$ENVS
Environment=PUBLIC_URL=$PUBLIC_URL"
UNIT="[Unit]
Description=Poway Automobile Online game server
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$DIR
$ENVS
ExecStart=$(command -v node) $DIR/server.js
Restart=always
RestartSec=5
"
echo "== service"
if [ -n "$SUDO" ]; then
  printf '%s\nUser=%s\n\n[Install]\nWantedBy=multi-user.target\n' "$UNIT" "$(id -un)" | $SUDO tee /etc/systemd/system/pw-auto-online.service >/dev/null
  $SUDO systemctl daemon-reload && $SUDO systemctl enable --now pw-auto-online && $SUDO systemctl restart pw-auto-online
  sleep 8; $SUDO journalctl -u pw-auto-online -n 15 --no-pager
  echo "Logs: journalctl -u pw-auto-online -f    Restart: sudo systemctl restart pw-auto-online"
else
  mkdir -p "$HOME/.config/systemd/user"
  printf '%s\n[Install]\nWantedBy=default.target\n' "$UNIT" > "$HOME/.config/systemd/user/pw-auto-online.service"
  systemctl --user daemon-reload && systemctl --user enable --now pw-auto-online && systemctl --user restart pw-auto-online
  sleep 8; journalctl --user -u pw-auto-online -n 15 --no-pager || true
  echo "Logs: journalctl --user -u pw-auto-online -f    Restart: systemctl --user restart pw-auto-online"
  if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)" != "yes" ]; then
    echo "NOTE: user services stop when you log out and don't start at boot until an admin runs once:"
    echo "  sudo loginctl enable-linger $(id -un)"
  fi
fi
echo "Look for a 'published wss://...' line above."
