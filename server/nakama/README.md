# Game server (Nakama)

The online game runs on a [Nakama](https://heroiclabs.com/nakama/) server (Apache-2.0). Firebase still hosts the
site, and it's the fallback: if the game can't reach Nakama, online play runs on the Firebase Realtime Database as
before (`src/online/net.js` picks at load).

What the server decides, so a modified browser can't fake it (all in `index.js`):

- **Rooms:** one authoritative match per server (Silverwood, Elysium, Asgard, Avalon, Vaeloria), 20 players each.
  Positions are relayed 10 times a second. Every hit is checked: the shooter must be in range, the damage within the
  weapon's maximum (shop upgrades and the Marksman skill included), and under a damage-per-second cap. The room owns
  everyone's health, so kills and deaths are real. Leaving mid-fight counts as a death.
- **Progression:** XP, levels (to 100), titles, skill points, the three skill trees, lifetime kills and deaths, best
  streak, time online, and three daily challenges. Stored per player in `progress/stats`, which the player can read but
  only the server can write.
- **Leaderboards:** `kd_alltime` (needs 10 kills plus deaths), `kills_weekly` (resets Mondays, UTC) and
  `level_alltime`. Only the server writes them.
- **Streaks and bounties:** announced at 3, 5 and every 5 after; at 5 the player has a bounty worth 1.5x XP.
- **Saves:** the player's own cloud save (`save/game`) is written by the game (`src/online/cloud.js`). Only its owner
  can read or write it.

Accounts: every browser gets a guest account (Nakama device sign-in). In Career, *Save my progress* adds a password.
The login is the username; Nakama stores it as an email address on the reserved `.invalid` domain. Signing in on
another computer loads that account's save.

## Running it

Any Linux or macOS box with about 1 GB of RAM will do. It runs as an ordinary user with no root needed:

- Nakama 3.41: the official release binary (checksum-verified)
- PostgreSQL 16: from conda-forge via `micromamba`
- both bound to `127.0.0.1` only (game 7350, gRPC 7349, admin console 7351, database 5433), under `~/nakama/`

`~/nakama/start.sh` starts whatever isn't running, and a crontab runs it at boot and every 2 minutes. Secrets
(database password, server key, session and console keys) are generated once into `~/nakama/secrets.env`
(mode 600) and never leave the box. The admin console is only reachable through an SSH tunnel:
`ssh -L 7351:127.0.0.1:7351 <host>`, then open http://127.0.0.1:7351.

Deploy a new version of the module (copies `index.js`, restarts Nakama, checks the log):

```bash
server/nakama/deploy.sh <ssh-host>
```

## Pointing the game at it

The game reads `nakama.json` next to `index.html`: `{ "host": "...", "port": 443, "ssl": true, "key": "<server key>" }`.
It isn't in git (it names the server), so write it before `firebase deploy`. For testing against a local or tunnelled
server, put the same shape in `nakama.local.json` (for example host `127.0.0.1`, port 7350, ssl false) and open the
game with `?nk=local`. Hosting never publishes that file.

Browsers on the HTTPS site need `wss://`, so the server must be reachable over TLS. Do that with a tunnel or a reverse
proxy in front of `127.0.0.1:7350`, never by binding Nakama to a public interface.
