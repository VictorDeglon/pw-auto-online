#!/usr/bin/env bash
# Copies the server module to the Nakama box and restarts Nakama so it loads it.
# Usage: server/nakama/deploy.sh <ssh-host>   (the box set up as in server/nakama/README.md)
set -euo pipefail
HOST="${1:?usage: deploy.sh <ssh-host>}"
DIR="$(cd "$(dirname "$0")" && pwd)"
scp -q "$DIR/index.js" "$HOST:nakama/data/modules/index.js.new"
ssh "$HOST" 'set -e; cd ~/nakama; mv data/modules/index.js.new data/modules/index.js; chmod 600 data/modules/index.js
  screen -S pw-nakama -X quit 2>/dev/null || true; for i in $(seq 1 20); do screen -ls | grep -q "\.pw-nakama\b" || break; sleep 0.5; done
  ./start.sh; sleep 5
  if grep -q "\"msg\":\"Startup done\"" <(tail -n 40 logs/nakama.log); then echo "Nakama restarted with the new module."; else tail -n 15 logs/nakama.log; exit 1; fi'
