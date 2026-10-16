#!/bin/sh
# Rebuilds vendor/firebase.mjs: the Firebase JS SDK (Apache-2.0), only the app / anonymous auth / Realtime Database
# parts the game uses, bundled into one ES module so the game has no build step and no CDN dependency.
#   sh tools/vendor/build_firebase.sh
set -e
dir=$(mktemp -d)
cp "$(dirname "$0")/firebase-entry.js" "$dir/entry.js"
(cd "$dir" && npm init -y >/dev/null && npm i --silent firebase@13.0.0 esbuild >/dev/null &&
  npx esbuild entry.js --bundle --format=esm --minify --target=es2020 --legal-comments=eof --outfile=out.mjs)
cp "$dir/out.mjs" "$(dirname "$0")/../../vendor/firebase.mjs"
echo "vendor/firebase.mjs rebuilt"
