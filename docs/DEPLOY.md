# Going live

The game is static files on Firebase Hosting plus a Realtime Database for online play. No server of our own: the
home-server code in `server/` is optional and currently unused.

## What has to be true for online play to work

| Piece | Where | Status to check |
|---|---|---|
| Web config (`FIREBASE_CONFIG`) | `src/online/config.js` | Filled in (public by design). If it's `null`, the game reads Firebase Hosting's own `/__/firebase/init.json`, so the deployed site still goes online; served anywhere else it's offline-only. |
| Anonymous sign-in | Firebase console → Authentication → Sign-in method → Anonymous → **Enable** | The game says "Online sign-in is switched off" until this is on. |
| Database rules | `database.rules.json`, deployed | Must list the current server ids (`silverwood`, `elysium`, `asgard`, `avalon`, `vaeloria`) and event kinds (`boom`, `nuke`, `col`, `fell`, `ph`, `cd`, `claim`). Old rules → "The database refused us." |
| API key restrictions | Google Cloud console → Credentials | Must allow `pw-auto-online.web.app`, `pw-auto-online.firebaseapp.com` and `localhost:8642`. |

## Deploying

From a machine with the Firebase CLI, signed in as the project owner, in the repo folder:

```bash
git checkout main && git pull
firebase deploy --only hosting,database --project pw-auto-online
```

Or let GitHub do it: `.github/workflows/firebase.yml` deploys on every push to `main` once the repo has the variable
`FIREBASE_PROJECT` and the secret `FIREBASE_SERVICE_ACCOUNT` (Settings → Secrets and variables → Actions).

Deploy the rules together with the site (`--only hosting,database`): a build whose server ids aren't in the deployed
rules can't join ("The database refused us").

## Free plan headroom

Spark (free) allows 100 simultaneous database connections, 1 GB stored and 10 GB/month downloaded from the database,
and 10 GB/month of hosting transfer. A handful of players a day uses a sliver of that. The biggest cost is hosting:
each new visitor downloads the game once (tens of MB: map data, terrain, the 3D people they meet), so a few hundred
first-time visits a month fit in the free hosting allowance; returning players load from their browser cache.
