#!/bin/sh
# Starts Nakama with the secrets from the environment (./gen-secrets.sh makes a .env for docker-compose.yml).
# Refuses to start on a missing, short or default secret. The secrets go into a config file on a private tmpfs, not onto
# a command line, so they don't show up in `ps`.
set -eu

fail() { echo "pw-nakama: $*" >&2; exit 1; }
need() { # name, minimum length
  eval "v=\${$1:-}"
  [ -n "$v" ] || fail "$1 is not set (./gen-secrets.sh > .env)"
  [ "${#v}" -ge "$2" ] || fail "$1 is shorter than $2 characters"
  case "$v" in *default*|admin|password|change*|CHANGE*) fail "$1 is a default or placeholder value";; esac
  case "$v" in *[!A-Za-z0-9_-]*) fail "$1 may only use letters, digits, _ and -";; esac
}
need PG_PASSWORD 16; need SERVER_KEY 16; need SESSION_KEY 32; need REFRESH_KEY 32; need HTTP_KEY 24
need CONSOLE_USER 3; need CONSOLE_PASSWORD 16; need CONSOLE_SIGNING_KEY 32
DB_HOST="${DB_HOST:-postgres:5432}"; DB_NAME="${DB_NAME:-nakama}"; DB_USER="${DB_USER:-nakama}"
case "$DB_HOST$DB_NAME$DB_USER" in *[!A-Za-z0-9_.:-]*) fail "DB_HOST, DB_NAME and DB_USER may only use letters, digits and _.:-";; esac

umask 077
CFG="$(mktemp /tmp/pw-nakama.XXXXXX)"
cat > "$CFG" <<EOF
name: pw-auto-online
data_dir: /nakama/data
logger: { level: info, stdout: true }
database: { address: ["${DB_USER}:${PG_PASSWORD}@${DB_HOST}/${DB_NAME}"] }
socket: { server_key: "${SERVER_KEY}", port: 7350, max_message_size_bytes: 8192, max_request_size_bytes: 262144 }
session: { encryption_key: "${SESSION_KEY}", refresh_encryption_key: "${REFRESH_KEY}", token_expiry_sec: 7200, refresh_token_expiry_sec: 2592000 }
runtime: { http_key: "${HTTP_KEY}", path: /nakama/data/modules, js_entrypoint: index.js }
console: { port: 7351, username: "${CONSOLE_USER}", password: "${CONSOLE_PASSWORD}", signing_key: "${CONSOLE_SIGNING_KEY}" }
EOF
unset PG_PASSWORD SERVER_KEY SESSION_KEY REFRESH_KEY HTTP_KEY CONSOLE_PASSWORD CONSOLE_SIGNING_KEY

/nakama/nakama migrate up --config "$CFG"
exec /nakama/nakama --config "$CFG"
