# Asset packs

The game's files (everything under `assets/` and `data/`, plus `poway-data.js`) go to players as a few zip files,
**packs**, from an asset host of our own instead of from Firebase Hosting, and stay on the player's computer once
downloaded. Firebase Hosting serves the page and its code, and still holds every asset as before, as the fallback.

## How it works

- `node tools/packs/build.mjs` writes `build/packs/<name>-<hash>.zip` (git-ignored) and `assets-manifest.json`
  (committed, deployed with the site). The manifest lists every file with its content hash and where its bytes are
  in its pack (offset, packed size, size, stored or deflated). Packs are deterministic: the same files give the same
  pack name.
- `sw.js`, the service worker, answers every request for a packed file. It keeps files in Cache Storage by content
  hash, so a second visit loads from disk, and after an update only the files whose hash changed download again
  (renames and moves cost nothing). Files the current manifest no longer lists are deleted after the downloads.
- The page (`PACKS`, at the top of `index.html`) starts the worker, tells it the manifest and the host, and has it
  stream the packs: `boot` while the loading screen is up (the map data first, so the game module waits on
  `window.PAO_DATA`), then `later` (what `loadLater` fetches after the loading screen). Each request is a range of up
  to 6 MB, two at a time, every file checked against its hash and kept as soon as its bytes are in, so a download cut
  off part way carries on where it stopped next time. A file the game asks for before its pack has streamed in is
  fetched by itself (one range request); the other packs (`world`, `humans`, `sf`, `misc`) only ever download that
  way, file by file, as the game needs them.
- **Fallback:** when the host doesn't answer (or a pack's bytes don't match the manifest), the worker takes the file
  from the site itself (Firebase Hosting) for the next minute and keeps it all the same. Without service workers
  (or `DecompressionStream`), the game loads everything from the site as before.

## Which pack a file is in

`tools/packs/packs.json`: `boot` and `later` take the files listed in `order.json`, in that order (what the game
fetched before the loading screen ended, and before `[later] everything in`); every other file goes in the first
pack whose prefix matches. A new directory of assets needs no change (it lands in `misc`, or add a pack for it).
`order.json` is recorded from a real load: see "Recording the load order" below. A file missing from it still loads,
from its own pack, one request per file.

## Shipping an update

1. `node tools/packs/build.mjs` (it says which packs changed; unchanged packs keep their names) and commit
   `assets-manifest.json` with the assets.
2. `tools/packs/publish.sh <ssh target>` uploads the packs the manifest names, plus the manifest, to `pw-assets/packs`
   on the host (rsync `--fuzzy`: a changed pack starts from the old one) and deletes packs none of the newest three
   manifests use.
3. Deploy the site as usual (`assets-manifest.json` goes with it).

The deploy runs `node tools/packs/check.mjs` first (firebase.json `predeploy`) and stops if the manifest doesn't match
the files being deployed (a stale manifest would have players served the old bytes of a changed file from the packs),
or if `nakama.json` names a host that lacks one of the manifest's packs (every first visit would fall back to
Firebase). `PACKS_SKIP_HOST=1` deploys anyway.

**Turning it off:** without `"assets"` in `nakama.json`, players get files from the site and keep them.
`"packs": false` in `nakama.json` removes the worker: pages load everything from the site as before (the page still
open keeps its worker until it's reloaded).

## Where the host is

The page reads the host from `nakama.json` (git-ignored, written at deploy time, the same file that points players at
the game server): `"assets": "https://<host>/packs/"`. No `assets` key, no host: files come from the site and are kept.
On a copy served from this computer (localhost) packs are off unless asked: `?packs=1` (from the site, kept),
`?packs=<url>` (that host), `?packs=prod` (nakama.json's). `?packs=0` removes the worker (from the next load).

The host is `server/assets/serve.mjs` (see `server/assets/README.md`).

## Recording the load order

Load the game with an empty cache and packs off (a local copy, or the live site with `?packs=0` in a fresh profile),
wait for `[later] everything in` in the console, then paste `tools/packs/order.js` into the console and save what it
prints as `order.json`. It lists the packed files fetched before the loading screen ended (`pao:ready`) and before
the after-loading steps were done (`pao:later`), in the order they started.
