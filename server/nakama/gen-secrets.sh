#!/bin/sh
# Prints a fresh .env for docker-compose.yml with random secrets:  ./gen-secrets.sh > .env  (then keep .env private).
# SERVER_KEY is the one the browser needs: it goes into the site's nakama.json. Everything else stays on the server.
set -eu
r() { LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$1"; }
cat <<EOF
# Poway Automobile Online game server secrets. Never commit this file.
PG_PASSWORD=$(r 32)
SERVER_KEY=$(r 24)
SESSION_KEY=$(r 40)
REFRESH_KEY=$(r 40)
HTTP_KEY=$(r 32)
CONSOLE_USER=ops_$(r 6)
CONSOLE_PASSWORD=$(r 24)
CONSOLE_SIGNING_KEY=$(r 40)
EOF
