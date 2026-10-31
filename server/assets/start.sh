#!/bin/bash
# Starts the asset host (serve.mjs) in a screen named pw-assets if it isn't running. Safe to run every couple of
# minutes from cron. Lives next to serve.mjs on the host, with the packs in ./packs and the log in ./logs.
#   PORT (7360), RATE (MB/s for all downloads together, 0 = no cap) can be set in ./env
set -e; cd "$(dirname "$0")"; mkdir -p packs logs
PORT=7360; RATE=0; [ -f env ] && . ./env
screen -ls | grep -q "\.pw-assets\b" && exit 0
screen -dmS pw-assets bash -c "exec node serve.mjs --dir packs --port $PORT --host 127.0.0.1 --prefix /packs --rate $RATE >> logs/serve.log 2>&1"
