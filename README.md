# Poway Automobile Online

Free-roam driving and mayhem in a real-scale Poway, California, in the browser. Steal cars, outrun the Sheriff,
tune your ride at the garage, and play with friends on one of five online servers: **Silverwood, Emberfall,
Stormhaven, Moonhollow and Frostvale**.

The town is built from real data: OpenStreetMap streets and buildings, USGS elevation and aerial imagery.

## Playing

- **Play online:** pick a server, then pick a username. The game asks for your name every time you join. Names must be
  unique on that server (case doesn't count), 3–16 letters, numbers or `_`. Don't use your real name.
- **Free roam:** offline single player with jobs and story missions.
- **Character:** choose your look from the Microsoft Rocketbox cast. Other players see it.
- **Settings:** graphics presets from *Potato* to *Ultra*, picked for your computer automatically, plus dynamic
  resolution that lowers the render scale when the frame rate drops. From *Medium* up the sky lights and reflects in
  the scene and haze gathers in the valley; *High* adds ambient occlusion and sharper shadows near you. The *Look* is
  *Realistic* (bloom, eye adaptation, a film tone curve) by default, or the half-cartoon *Stylized* look.

Online you can see other players on the minimap and the big map (M), chat (Enter), check who's on (hold L), and
fight. Kills, deaths and busts show in the feed at the top of the screen.

Everything you own (money, cars in your garage, weapons, your look, your last usernames) is saved in your browser on
this computer. Nothing is stored on a server except what other players need to see while you're online: your name,
your look, where you are, and chat from the last hour.

## Running it locally

It must be served over HTTP (opening the file directly won't load the scripts):

```bash
python3 -m http.server 8642
```

Open http://localhost:8642/. Free roam works without anything else. URL options: `?gfx=potato|low|medium|high|ultra`,
`?grass=0..2`.

### Online play against local emulators

```bash
npx firebase emulators:start --only auth,database --project demo-pw-auto-online
```

Then open http://localhost:8642/?emu=1 in two browser profiles (or one normal and one private window).

## Setting up the online servers (Firebase)

The servers are one Firebase Realtime Database, split into five areas. There's no server program to run: the
browser talks to the database, and `database.rules.json` decides what each player may write (only their own state,
names claimed one at a time, chat length limits, and so on).

1. Create a project at https://console.firebase.google.com (the free Spark plan is enough to start).
2. **Build → Realtime Database → Create database.** Start in locked mode; the rules file replaces that.
3. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.** Players get an anonymous ID; no
   email or password.
4. **Project settings → General → Your apps → Web app (`</>`).** Copy the config object into `FIREBASE_CONFIG` in
   [`src/online/config.js`](src/online/config.js). These values are public by design; the rules are what protect the
   database.
5. Deploy the rules (and optionally the site):

   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add               # pick your project
   firebase deploy --only database
   firebase deploy --only hosting   # optional: serve the game from <project>.web.app
   ```

The game also runs on GitHub Pages; only the database has to be on Firebase.

### Launching on Firebase (automatic deploys)

Once steps 1 to 4 are done, every push to `main` can deploy the site and the rules by itself
([`.github/workflows/firebase.yml`](.github/workflows/firebase.yml)):

1. In the Firebase console, **Project settings → Service accounts → Generate new private key**. That downloads a JSON
   key. It is a secret: never commit it.
2. On GitHub, **Settings → Secrets and variables → Actions**:
   - **Secrets → New repository secret**: name `FIREBASE_SERVICE_ACCOUNT`, value: paste the whole JSON file.
   - **Variables → New repository variable**: name `FIREBASE_PROJECT`, value: your project id (shown under Project
     settings → General).
3. **Actions → Deploy to Firebase → Run workflow** (or push to `main`). When it finishes, the game is live at
   `https://<project id>.web.app`.

Until the secret and variable exist, the workflow runs and does nothing.

**Hosting bandwidth:** a first visit downloads roughly 100 to 150 MB (people, ground, terrain, music, Poway High). The
free Spark plan allows 360 MB of hosting downloads a day, about three new players. GitHub Pages (100 GB a month)
is the better host on a free budget; keep Firebase for the database only, or move to Blaze for hosting.

**Limits on the free plan:** 100 simultaneous connections (20 per server here) and 10 GB of downloads a month. Each
player sends about 6 small updates a second while moving and nothing while standing still. A few friends playing in
the evenings fits easily; a busy public server would need the pay-as-you-go Blaze plan (set a budget alert).

**Trust model:** each game applies the damage it receives and reports its own position, so a modified client could
cheat. That's fine for playing with friends; it isn't an anti-cheat system.

## Layout

- `index.html`: the game (HTML, CSS, main script)
- `src/`: modules. `src/online/` (Firebase, remote players), `src/ui/shell.js` (menus, chat, feed), `src/gfx.js`
  (graphics presets), `src/post.js` (the looks), `src/skyenv.js` (sky light and reflections), `src/atmos.js` (height
  fog and aerial perspective), `src/cascades.js` (shadow cascades)
- `poway-data.js`: map data (roads, buildings, terrain) as `window.POWAY_DATA`
- `assets/`: models, textures, imagery, people, music
- `vendor/firebase.mjs`: the Firebase JS SDK (Apache-2.0), bundled by `tools/vendor/build_firebase.sh`
- `database.rules.json`, `firebase.json`: Firebase rules and hosting config

## Credits

Map data © OpenStreetMap contributors (ODbL). Building footprints also from Microsoft (ODbL). Aerial imagery: USGS
NAIP (public domain). Terrain: Mapzen / AWS Terrain Tiles, USGS 3DEP. Textures and trees: Poly Haven (CC0). Vehicles:
Kenney and Quaternius (CC0). Aircraft: Poly by Google, Vojtěch Balák, Gilang Romadhan and jeremy via Poly Pizza (CC BY
3.0, see `assets/aircraft/LICENSE.md`). People: Microsoft Rocketbox Avatar Library (MIT, see `assets/humans/LICENSE-Rocketbox.md`). Music: Kevin
MacLeod, incompetech.com (CC BY 4.0). Firebase JS SDK (Apache-2.0).

A fan-made game. Not affiliated with or endorsed by the City of Poway, Poway Unified School District or any business
shown.
