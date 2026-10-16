# Home game server

A small Node server that owns every player's health and relays positions 15 times a second. Firebase keeps
sign-in, names, chat, the kill feed and the shared crowd. If this server is off, the game quietly falls back to
Firebase alone, so it is optional.

What it checks:

- **Hits:** the shooter has to be within that weapon's range of the victim, the damage can't exceed what that weapon
  can do with every upgrade, and each shooter is capped at 1,300 damage a second. Refused hits are logged.
- **Health:** taking damage from cops or falls is always accepted. Healing is accepted once every 20 seconds.
  Respawning resets you to 100.
- **Movement:** anything faster than 220 m/s is refused, except one fast-travel teleport every 15 seconds.

## Setup on a Raspberry Pi 5 (or any Debian / Ubuntu machine)

You need the Firebase project already set up (see the main README): Realtime Database created, Anonymous sign-in on,
and `database.rules.json` published.

1. From your Mac, copy this folder and your service-account key to the Pi (replace `pi` and `skywalker.local`
   with your Pi's user and hostname):

   ```bash
   scp -r server pi@skywalker.local:~/pw-auto-online-server
   scp ~/Downloads/<your-project>-firebase-adminsdk-*.json pi@skywalker.local:~/pw-auto-online-server/sa.json
   ```

2. On the Pi:

   ```bash
   ssh pi@skywalker.local
   cd ~/pw-auto-online-server
   ./install.sh <project-id> <database-url>
   ```

   The project id is in Firebase under Project settings → General. The database URL is at the top of the Realtime
   Database page, e.g. `https://pw-auto-online-default-rtdb.firebaseio.com`.

3. The installer ends by printing the log. Look for `published wss://….trycloudflare.com`. That's it: the game
   finds the address in Firebase by itself. Join a server in the game and you'll see "Connected to the game
   server".

## Everyday use

| | |
|---|---|
| Live log | `journalctl -u pw-auto-online -f` |
| Stop / start / restart | `sudo systemctl stop pw-auto-online` (or `start`, `restart`) |
| Status page | `curl http://127.0.0.1:8787/` on the Pi (players per server) |
| Update | copy the new `server/` folder over, run `./install.sh …` again |

It starts by itself after a reboot or a crash.

**The address changes on every restart.** That's how free Cloudflare quick tunnels work. It doesn't matter for
players, because the server republishes the new address to Firebase and the game reads it at join time. For a
permanent address, buy a domain on Cloudflare (about $10 a year) and switch to a named tunnel: run with
`TUNNEL=none PUBLIC_URL=wss://game.yourdomain.com`.

**Your home IP stays private.** The tunnel connects outward to Cloudflare, so there's no port forwarding and
nothing on your router to open.

## Security

- `sa.json` is an admin key for your Firebase project. Keep it only on the Pi (`chmod 600`, which the installer
  does), never in git (it's in `.gitignore`), never in chat.
- The server only listens on `127.0.0.1`; the only way in from outside is the tunnel.

## Testing locally against the emulators

```bash
FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 ALLOW_EMULATOR=1 TUNNEL=none PUBLIC_URL=ws://127.0.0.1:8787 \
FIREBASE_DB_URL="http://127.0.0.1:9000?ns=demo-pw-auto-online" node server.js
```

then open the game with `?emu=1`.
