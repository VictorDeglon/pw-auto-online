#!/bin/sh
# Uploads the packs assets-manifest.json names to the asset host, with a copy of the manifest, then deletes packs that
# none of the host's newest KEEP manifests name (players still on an older page keep working for a few deploys).
#   tools/packs/publish.sh <ssh target> [folder on the host, default pw-assets/packs]
# Build first (node tools/packs/build.mjs). rsync --fuzzy starts a changed pack from the old one, so an update
# sends little more than what changed.
set -eu
T=${1:?usage: tools/packs/publish.sh <ssh target> [folder on the host]}; D=${2:-pw-assets/packs}; KEEP=${KEEP:-3}
cd "$(dirname "$0")/../.."
node tools/packs/check.mjs --no-host
ID=$(node -p "require('./assets-manifest.json').id")
FILES=$(node -p "require('./assets-manifest.json').packs.map(p => 'build/packs/' + p.f).join(' ')")
for f in $FILES; do [ -f "$f" ] || { echo "$f is missing: run node tools/packs/build.mjs" >&2; exit 1; }; done
ssh "$T" "mkdir -p '$D'"
# shellcheck disable=SC2086
rsync -a --partial --fuzzy --progress $FILES "$T:$D/"
rsync -a assets-manifest.json "$T:$D/manifest-$ID.json"
ssh "$T" "cd '$D' && touch 'manifest-$ID.json' && node -e '
  const fs = require(\"fs\"), keep = +process.argv[1];
  const ms = fs.readdirSync(\".\").filter(f => /^manifest-[0-9a-f]+\\.json$/.test(f)).map(f => [fs.statSync(f).mtimeMs, f]).sort((a, b) => b[0] - a[0]);
  const want = new Set(); for (const [, f] of ms.slice(0, keep)) for (const p of JSON.parse(fs.readFileSync(f)).packs) want.add(p.f);
  for (const [, f] of ms.slice(keep)) fs.unlinkSync(f);
  for (const f of fs.readdirSync(\".\")) if (/-[0-9a-f]{12}\\.zip$/.test(f) && !want.has(f)) { fs.unlinkSync(f); console.log(\"removed\", f); }
  console.log(want.size, \"packs kept for\", Math.min(keep, ms.length), \"manifests\");
' $KEEP"
echo "published manifest $ID"
