# Self-hosting: the home game server

Answers for the session setting up the home server. Host details (machine name, user, paths) are left out on
purpose: the repo is public. Fill them in locally.

## 1. What the box does: option (c), an authoritative game server

The box runs `server/server.js`, a small Node server in this repo. It is **not** the Firebase emulators and it does
**not** serve the game files.

| Piece | Where it runs |
|---|---|
| Game files (HTML/JS/assets) | GitHub Pages, branch `big-update`: https://victordeglon.github.io/pw-auto-online/ |
| Sign-in (Anonymous), names, chat, kill feed, shared crowd, world events | A real Firebase project (Realtime Database), free Spark plan |
| Health, hit checks, 15 Hz position relay | The home box (`server/`) |

Reach from players: through a **Cloudflare tunnel** (outbound only). No inbound ports, no firewall or router changes.
The server binds to `127.0.0.1:8787` only. The tunnel gives it a `wss://` address, so the HTTPS game page can
connect (no mixed-content problem). If the box is off, the game falls back to Firebase alone.

Full behaviour and commands: [`server/README.md`](../server/README.md).

## 2. The Firebase project

- Victor is creating it now (Firebase console: project, Realtime Database in us-central1 in locked mode, Anonymous
  sign-in, a Web app). Plan: **Spark (free)**. Owner: Victor's Google account.
- The web config goes into `FIREBASE_CONFIG` in `src/online/config.js`. Victor pastes it to the cloud session,
  which commits it. It's public by design. The database URL and project id come from the same config.
- Rules: publish `database.rules.json` (Firebase console → Realtime Database → Rules → paste → Publish, or
  `firebase deploy --only database`). It includes `config/` (readable by signed-in players, writable only by admin).

### Service-account key: needed only for the free quick tunnel

A free quick tunnel (`*.trycloudflare.com`) gets a **new address on every restart**. The server publishes the
current one to `config/home` in the database, and clients read it there. Writing to `config/` takes the admin SDK,
so it needs a service-account key: `server/sa.json`, `chmod 600`, git-ignored, kept on the box only.

To avoid the key, use a **fixed address** instead:

1. Victor buys a domain (Cloudflare, about $10/yr) and creates a named tunnel to `http://127.0.0.1:8787`.
2. Set `HOME_SERVER_URL = 'wss://<that hostname>'` in `src/online/config.js` (committed; public is fine).
3. Run the server with `TUNNEL=none` and `PUBLIC_URL=wss://<that hostname>`, and no `SERVICE_ACCOUNT`.

Without the key, the server still verifies players' Firebase ID tokens (public Google keys, project id only). It
just skips the name-ownership check and the address publishing.

**Default plan:** quick tunnel plus the key, since there's no domain yet.

## 3. Runtime

- Node **18+** (18 works; 20+ is fine). Dependencies: `ws`, `jose`, `firebase-admin` (`npm install --omit=dev` in
  `server/`).
- `cloudflared`, a single binary. `install.sh` downloads it to `~/.local/bin` when there's no sudo.
- **No root needed.** `install.sh` without sudo installs a **systemd user service**. One thing needs an admin, once:
  `sudo loginctl enable-linger <user>`. That makes the service survive logout and start at boot. Until then it runs
  while the user is logged in.
- Ports: 8787 on loopback only. Nothing listens publicly.
- Install: `./install.sh <project-id> <database-url>` from the `server/` folder (with `sa.json` beside it). For a
  fixed address: `TUNNEL=none PUBLIC_URL=wss://… ./install.sh <project-id> <database-url>`.
- Health check: `curl http://127.0.0.1:8787/` → `{"ok":true,"players":{...}}`. A log line `published wss://…` means
  clients can find it.

## 4. Scheduled jobs: none needed

- Chat, feed (older than 1 h), events (10 min) and ruins (30 min) are pruned by the game clients themselves.
- Players, names and crowd records are removed by Firebase `onDisconnect` when a player drops. The server removes
  `config/home` when it shuts down cleanly.
- Health state lives in memory on the server. Nothing to back up: a restart just resets everyone online to 100 HP.

## Checklist

1. Firebase project exists, rules published, Anonymous sign-in on. (Victor)
2. `FIREBASE_CONFIG` committed. (cloud session, once Victor pastes the config)
3. On the box: copy `server/`, put `sa.json` beside it, run `./install.sh <project-id> <database-url>`.
4. Ask an admin for `loginctl enable-linger` if installing without sudo.
5. In the game: Play online → join a server → "Connected to the game server" appears.
