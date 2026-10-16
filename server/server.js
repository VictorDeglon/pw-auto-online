// Poway Automobile Online: the home game server (runs on a Raspberry Pi or any small Linux box).
//
// Firebase still does sign-in, names, chat, the kill feed and the shared crowd. This server does the two things a
// browser can't be trusted with:
//   health   every player's health lives here. A hit is checked (shooter in range of the victim, damage within what
//            that weapon can do, a damage-per-second cap per shooter), applied here, and the victim's game is told
//            its new health. Healing is rate limited.
//   motion   positions are relayed 15 times a second (Firebase alone manages ~6) and impossible jumps are refused
//            (one fast-travel teleport per 15 s is allowed).
// The game finds the server through Firebase: on start this writes its public address to config/home, and the game
// connects there when someone joins. If the server is off, the game falls back to Firebase alone.
//
// Environment (see install.sh):
//   PORT                 local port (default 8787)
//   FIREBASE_PROJECT     project id (token checks)
//   FIREBASE_DB_URL      https://<project>-default-rtdb.firebaseio.com (or the region URL the console shows)
//   SERVICE_ACCOUNT      path to the service-account JSON (secret: stays on this machine)
//   TUNNEL               "quick" (default): start a Cloudflare quick tunnel and publish its address
//                        "none": publish PUBLIC_URL as is (a named tunnel, a VPS with TLS, or local testing)
//   PUBLIC_URL           wss://... when TUNNEL=none
//   ALLOW_EMULATOR=1     accept unsigned emulator tokens and talk to the database emulator (local testing only)
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { WebSocketServer } from 'ws';
import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import admin from 'firebase-admin';

const PORT = +(process.env.PORT || 8787), PROJECT = process.env.FIREBASE_PROJECT || '', EMU = process.env.ALLOW_EMULATOR === '1';
const SERVERS = ['silverwood', 'emberfall', 'stormhaven', 'moonhollow', 'frostvale'];
const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace('T', ' '), ...a);

// ---------------------------------------------------------------- Firebase (admin: bypasses the rules)
let db = null;
try {
  if (EMU) admin.initializeApp({ projectId: PROJECT || 'demo-pw-auto-online', databaseURL: process.env.FIREBASE_DB_URL });
  else admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(process.env.SERVICE_ACCOUNT, 'utf8'))), databaseURL: process.env.FIREBASE_DB_URL });
  db = admin.database();
} catch (e) { log('Firebase admin not available:', e.message, '(the address will not be published)'); }
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
async function verify(token) {
  if (EMU) { const c = decodeJwt(token); return c.sub || c.user_id; }
  const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT });
  return payload.sub;
}
async function ownsName(sid, uid, name) { // the name they joined with really is theirs on that server
  if (!db) return true;
  const v = (await db.ref(`servers/${sid}/names/${String(name).toLowerCase()}`).get()).val(); return v === uid;
}

// ---------------------------------------------------------------- the rules of a fair fight
// per hit, the most a weapon can do with every damage upgrade (+45%); how far it reaches (m, with slack for lag)
const W = {
  fists: [26, 8], pistol: [70, 200], 'micro smg': [40, 160], 'pump shotgun': [45, 70], 'assault rifle': [60, 260], 'sniper rifle': [420, 760],
  minigun: [45, 220], 'rocket launcher': [260, 900], 'grenade launcher': [260, 500], grenades: [260, 120], 'sticky bombs': [260, 400], 'airstrike flare': [300, 600], car: [260, 40],
};
const DPS_CAP = 1300, HEAL_EVERY = 20e3, TP_EVERY = 15e3, MAX_SPEED = 220; // m/s: a glider with rocket boosters tops out near 200

const rooms = new Map(SERVERS.map(s => [s, new Map()])); // sid -> uid -> player
function send(ws, o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }

function onHello(ws, P, m) {
  if (!rooms.has(m.sid)) return send(ws, { t: 'error', m: 'unknown server' });
  return verify(String(m.token || '')).then(async uid => {
    if (!uid) throw new Error('no uid');
    if (!(await ownsName(m.sid, uid, m.name))) throw new Error('name not yours');
    const room = rooms.get(m.sid), old = room.get(uid); if (old && old.ws !== ws) { send(old.ws, { t: 'error', m: 'joined elsewhere' }); old.ws.close(); }
    Object.assign(P, { uid, sid: m.sid, name: String(m.name).slice(0, 16), hp: 100, dead: false, p: null, at: 0, lastTp: 0, lastHeal: 0, dmgWin: [] });
    room.set(uid, P); send(ws, { t: 'welcome', uid, hp: P.hp });
    log(`+ ${P.name} on ${P.sid} (${room.size})`);
  }).catch(e => { send(ws, { t: 'error', m: 'sign-in rejected: ' + e.message }); ws.close(); });
}
function onState(P, p) {
  if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') return;
  const now = Date.now();
  if (P.p) {
    const d = Math.hypot(p.x - P.p.x, p.z - P.p.z), dt = Math.max(0.05, (now - P.at) / 1000);
    if (d / dt > MAX_SPEED && d > 30) { if (now - P.lastTp < TP_EVERY) { send(P.ws, { t: 'snap', x: P.p.x, y: P.p.y, z: P.p.z }); return; } P.lastTp = now; } // a teleport: one every 15 s (fast travel)
  }
  P.p = p; P.at = now; P.p.h = P.hp; P.p.d = P.dead ? (p.d || 1) : 0; // health in the relayed state is ours, not theirs
}
function onHit(P, m) {
  const room = rooms.get(P.sid), V = room && room.get(String(m.v || '')); if (!V || V === P || V.dead || P.dead || !V.p || !P.p) return;
  const w = String(m.w || 'fists').toLowerCase(), rule = W[w] || [60, 200], dmg = Math.max(0, Math.min(rule[0], +m.d || 0)); if (!dmg) return;
  const dist = Math.hypot(V.p.x - P.p.x, V.p.z - P.p.z); if (dist > rule[1]) return log(`refused hit ${P.name} -> ${V.name}: ${Math.round(dist)} m with ${w}`);
  const now = Date.now(); P.dmgWin = P.dmgWin.filter(e => now - e[0] < 1000); const recent = P.dmgWin.reduce((s, e) => s + e[1], 0);
  if (recent + dmg > DPS_CAP) return; P.dmgWin.push([now, dmg]);
  V.hp = Math.max(0, V.hp - dmg); if (V.hp === 0) V.dead = true;
  send(V.ws, { t: 'hp', h: V.hp, by: P.name, w: m.w || '', d: dmg });
}
function onOwnHealth(P, m) { // damage from cops, falls, their own explosions: accepted downward; healing rate limited
  const h = Math.max(0, Math.min(100, +m.h || 0)), now = Date.now();
  if (h < P.hp) { P.hp = h; if (h === 0) P.dead = true; return; }
  if (h > P.hp && !P.dead && now - P.lastHeal > HEAL_EVERY) { P.hp = h; P.lastHeal = now; return; }
  if (h !== P.hp) send(P.ws, { t: 'hp', h: P.hp }); // refused: here's what you really have
}
function onRespawn(P) { if (!P.dead) return; P.dead = false; P.hp = 100; P.lastHeal = Date.now(); P.lastTp = 0; send(P.ws, { t: 'hp', h: 100 }); }

// ---------------------------------------------------------------- relay: 15 Hz snapshots of everyone else in the room
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.size < 2) continue;
    const all = [...room.values()].filter(P => P.p);
    for (const P of room.values()) { const a = all.filter(Q => Q !== P).map(Q => [Q.uid, Q.p]); if (a.length) send(P.ws, { t: 'S', a }); }
  }
}, 1000 / 15);

// ---------------------------------------------------------------- sockets
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ ok: true, players: Object.fromEntries([...rooms].map(([k, r]) => [k, r.size])) }));
});
const wss = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });
wss.on('connection', ws => {
  const P = { ws, uid: null }; let n = 0, win = Date.now();
  ws.on('message', raw => {
    if (++n > 60) { if (Date.now() - win < 1000) return; n = 0; win = Date.now(); } // flood guard: 60 messages a second
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'hello') return onHello(ws, P, m);
    if (!P.uid) return;
    if (m.t === 's') onState(P, m.p); else if (m.t === 'hit') onHit(P, m); else if (m.t === 'hp') onOwnHealth(P, m); else if (m.t === 'respawn') onRespawn(P);
  });
  ws.on('close', () => { if (!P.uid) return; const room = rooms.get(P.sid); if (room && room.get(P.uid) === P) { room.delete(P.uid); for (const Q of room.values()) send(Q.ws, { t: 'gone', id: P.uid }); log(`- ${P.name} (${room.size})`); } });
});
httpServer.listen(PORT, '127.0.0.1', () => { log(`listening on 127.0.0.1:${PORT}`); publishAddress(); });

// ---------------------------------------------------------------- the public address
async function setHome(url) {
  if (!db) return log('no database: address not published:', url);
  await db.ref('config/home').set({ url, t: admin.database.ServerValue.TIMESTAMP }); log('published', url);
}
function publishAddress() {
  if ((process.env.TUNNEL || 'quick') === 'none') return setHome(process.env.PUBLIC_URL || `ws://127.0.0.1:${PORT}`).catch(e => log('publish failed', e.message));
  const cf = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const scan = b => { const m = String(b).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m) setHome(m[0].replace('https://', 'wss://')).catch(e => log('publish failed', e.message)); };
  cf.stdout.on('data', scan); cf.stderr.on('data', scan);
  cf.on('exit', c => { log('cloudflared exited', c, '- restarting in 10 s'); setTimeout(publishAddress, 10e3); });
  process.on('exit', () => cf.kill());
}
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, async () => { try { if (db) await db.ref('config/home').remove(); } catch (e) { } process.exit(0); });
