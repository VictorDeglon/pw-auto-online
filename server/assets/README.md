# Asset host

`serve.mjs` sends the asset packs (`tools/packs/README.md`) to players' browsers, so their downloads don't go through
Firebase Hosting. Plain Node (18 or later), no packages, no root.

- One flat folder of packs (`<name>-<hash>.zip`) and manifests; nothing else is served (no sub-paths, no dotfiles).
- Single-range requests (`Range: bytes=a-b`, answered 206), `HEAD`, CORS for any site (`*`, no credentials) with the
  `Range` preflight cached a day, `Cache-Control: public, max-age=31536000, immutable` for hashed pack names and
  `no-cache` for anything else, ETags.
- `--rate <MB/s>` caps all downloads together, to leave the uplink room for the game server. At most 96 downloads
  at once; more get a 503 and the game takes those files from the site instead.
- `GET /health` answers `ok`. Every 10 minutes the log gets one line: requests, ranges, MB sent. No addresses.

## Running it

On the box, in its own folder (for example `~/pw-assets`), copy `serve.mjs` and `start.sh` there, then:

```bash
./start.sh                                   # starts it in a screen named pw-assets, if it isn't running
crontab -e                                   # keep it up:
# @reboot sleep 50 && ~/pw-assets/start.sh # pw-assets
# */2 * * * * ~/pw-assets/start.sh # pw-assets
```

`start.sh` reads `PORT` (7360) and `RATE` (0, no cap) from an `env` file next to it. The server listens on
127.0.0.1 only; publish it through whatever already fronts the game server. With Tailscale Funnel, on the same name
and port as the game server, under a path:

```bash
tailscale funnel --bg --set-path=/packs http://127.0.0.1:7360
```

The server accepts requests with or without the `/packs` prefix, whichever way the proxy passes them. To take just this
path down again: `tailscale funnel --https=443 --set-path=/packs off` (`--https=443 off` alone also drops whatever
else is published on that port, such as the game server).

**Funnel is slow for this.** Measured on 2026-10-31: 0.3-0.5 MB/s per connection and about 1.5-2 MB/s in total with
2-8 connections, while Firebase Hosting gave 5.8-7.7 MB/s on the same line and the box's Tailscale used ~13 % of a
core, so the limit is Funnel's relay, not the box or its uplink. At that rate the loading screen's pack takes ~40 s on
a first visit (repeat visits read from disk either way). A tunnel without that cap (and with an edge cache for the
immutable packs) is the way to make first visits fast.

## Players

Packs reach the folder with `tools/packs/publish.sh <ssh target>` (from the repo). Players use the host once the
site's `nakama.json` (written at deploy time, never committed) has `"assets": "https://<public name>/packs/"`.
Without that key, or when the host doesn't answer, the game loads from Firebase Hosting as before.
