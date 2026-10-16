// Online play over the Firebase Realtime Database (see config.js for the layout and database.rules.json for who may
// write what). This module only talks to the database; src/online/remote.js puts other players into the world and
// src/ui/shell.js draws the menus, chat and feed.
//
// Database layout, per server (servers/<id>/):
//   names/<lowercase name> = uid     claimed in a transaction, so two players can never hold the same name
//   players/<uid> = { n, s, t, p }   name, skin, server time, state (position, car, health, weapon...)
//   chat/<push>   = { u, n, m, t }   last hour kept; anyone may delete older messages
//   feed/<push>   = { u, k, a, b, w, t }  join / leave / kill / death / busted / wreck
//   hits/<victim uid>/<push> = { u, n, d, w, t }  damage another player dealt you; you apply it and delete it
//   events/<push> = { u, k, t, ... } shared world events (explosions, collapses, felled trees, hits on shared NPCs)
//   ruins/<building index> = { u, t, x, z }  buildings that came down (kept 30 minutes, so late joiners see them)
//   crowd/<uid> = { t, e }           the people and cars a player is running for everyone near them (src/online/world.js)
// Everything a player holds (name, presence) is removed by the server when their connection drops (onDisconnect).
import * as FB from '../../vendor/firebase.mjs';
import { FIREBASE_CONFIG, EMULATOR_PROJECT, SERVERS, MAX_PLAYERS, NAME_RE, HOME_SERVER_URL } from './config.js';

export const NET = {
  available: false, // a Firebase project is configured (or the emulator is in use)
  ready: false, uid: null, server: null, name: null, skin: null, joinedAt: 0, offset: 0, connected: false,
  players: new Map(), // uid -> { n, s, p, t } for everyone else on the server
};
const L = new Map(); // event -> Set(callback)
export function on(ev, cb) { if (!L.has(ev)) L.set(ev, new Set()); L.get(ev).add(cb); return () => L.get(ev).delete(cb); }
function emit(ev, data) { for (const cb of L.get(ev) || []) { try { cb(data); } catch (e) { console.error('[net]', ev, e); } } }

let app = null, auth = null, db = null, subs = [], leaveFeedRef = null;
const params = new URLSearchParams(location.search);
const EMU = params.get('emu');

export function serverNow() { return Date.now() + NET.offset; }

export async function initNet() {
  if (NET.ready) return true;
  const cfg = EMU ? { apiKey: 'demo-key', projectId: EMULATOR_PROJECT, databaseURL: `http://${EMU === '1' ? '127.0.0.1' : EMU}:9000?ns=${EMULATOR_PROJECT}`, authDomain: `${EMULATOR_PROJECT}.firebaseapp.com` } : FIREBASE_CONFIG;
  if (!cfg) return false;
  NET.available = true;
  app = FB.initializeApp(cfg, 'pao');
  auth = FB.getAuth(app); db = FB.getDatabase(app);
  if (EMU) { const host = EMU === '1' ? '127.0.0.1' : EMU; FB.connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true }); FB.connectDatabaseEmulator(db, host, 9000); }
  const cred = await FB.signInAnonymously(auth);
  NET.uid = cred.user.uid;
  FB.onValue(FB.ref(db, '.info/serverTimeOffset'), s => { NET.offset = s.val() || 0; });
  let dropped = false;
  FB.onValue(FB.ref(db, '.info/connected'), s => {
    const c = !!s.val(); if (c === NET.connected) return;
    NET.connected = c; if (!c && NET.server) dropped = true;
    if (c && dropped && NET.server) { dropped = false; reclaim(); } // the server dropped us (and our name) while we were away
    emit('connection', c);
  });
  NET.ready = true;
  return true;
}

// live player counts for the server browser: cb({ id: count }) on every change; returns an unsubscribe function
export function watchServers(cb) {
  const counts = {}, offs = [];
  for (const s of SERVERS) {
    counts[s.id] = 0;
    offs.push(FB.onValue(FB.ref(db, `servers/${s.id}/names`), snap => { counts[s.id] = snap.size; cb({ ...counts }); }, () => cb({ ...counts })));
  }
  return () => offs.forEach(f => f());
}

// round trip to the database in ms (a tiny read)
export async function ping(sid) {
  const t0 = performance.now();
  try { await FB.get(FB.ref(db, `servers/${sid}/names/__ping__`)); } catch (e) { return null; }
  return Math.round(performance.now() - t0);
}

export function validName(n) { return NAME_RE.test(n || ''); }

// claim the name on the server and go live; resolves { ok } or { ok: false, err }
export async function join(sid, name, skin, state) {
  if (!NET.ready) return { ok: false, err: 'Not connected.' };
  if (!SERVERS.some(s => s.id === sid)) return { ok: false, err: 'Unknown server.' };
  if (!validName(name)) return { ok: false, err: 'Names are 3 to 16 letters, numbers or underscores.' };
  if (NET.server) await leave();
  const base = `servers/${sid}`, key = name.toLowerCase(), uid = NET.uid;
  const names = await FB.get(FB.ref(db, `${base}/names`));
  const taken = names.val() || {};
  if (Object.keys(taken).length >= MAX_PLAYERS && taken[key] !== uid) return { ok: false, err: 'That server is full.' };
  // free any other name this browser still holds on the server (a crash before onDisconnect fired)
  for (const [k, v] of Object.entries(taken)) if (v === uid && k !== key) await FB.remove(FB.ref(db, `${base}/names/${k}`));
  let res;
  try { res = await FB.runTransaction(FB.ref(db, `${base}/names/${key}`), cur => (cur === null || cur === uid) ? uid : undefined); }
  catch (e) { return { ok: false, err: 'Could not reach the server.' }; }
  if (!res.committed) return { ok: false, err: `Someone on ${serverName(sid)} is already called "${name}".` };
  const nameRef = FB.ref(db, `${base}/names/${key}`), meRef = FB.ref(db, `${base}/players/${uid}`);
  await FB.onDisconnect(nameRef).remove();
  await FB.onDisconnect(meRef).remove();
  await FB.remove(FB.ref(db, `${base}/hits/${uid}`)); // damage left over from an earlier session
  lastState = pack(state);
  await FB.set(meRef, { n: name, s: skin || '', t: FB.serverTimestamp(), p: lastState });
  NET.server = sid; NET.name = name; NET.skin = skin; NET.joinedAt = serverNow(); NET.players.clear();
  leaveFeedRef = FB.push(FB.ref(db, `${base}/feed`));
  await FB.onDisconnect(leaveFeedRef).set({ u: uid, k: 'leave', a: name, t: FB.serverTimestamp() });
  feed('join', { a: name });
  subscribe(base);
  prune(base);
  return { ok: true };
}

export async function leave() {
  if (!NET.server) return;
  const base = `servers/${NET.server}`, uid = NET.uid;
  for (const f of subs) f(); subs = [];
  try {
    if (leaveFeedRef) { await FB.onDisconnect(leaveFeedRef).cancel(); await FB.set(leaveFeedRef, { u: uid, k: 'leave', a: NET.name, t: FB.serverTimestamp() }); }
    await FB.remove(FB.ref(db, `${base}/players/${uid}`));
    await FB.remove(FB.ref(db, `${base}/crowd/${uid}`)); crowdArmed = false;
    await FB.remove(FB.ref(db, `${base}/names/${NET.name.toLowerCase()}`));
  } catch (e) { console.warn('[net] leave', e); }
  disconnectHome();
  for (const id of NET.players.keys()) emit('player:remove', id);
  NET.players.clear(); NET.server = null; NET.name = null; leaveFeedRef = null;
}

// after a dropped connection the server has already run our onDisconnect: take the name back and re-arm everything
let lastState = null;
async function reclaim() {
  const sid = NET.server, base = `servers/${sid}`, uid = NET.uid, key = NET.name.toLowerCase();
  try {
    const res = await FB.runTransaction(FB.ref(db, `${base}/names/${key}`), cur => (cur === null || cur === uid) ? uid : undefined);
    if (!res.committed) { emit('kicked', `Someone took the name "${NET.name}" while you were disconnected.`); return; }
    const meRef = FB.ref(db, `${base}/players/${uid}`);
    await FB.onDisconnect(FB.ref(db, `${base}/names/${key}`)).remove();
    await FB.onDisconnect(meRef).remove();
    await FB.set(meRef, { n: NET.name, s: NET.skin || '', t: FB.serverTimestamp(), p: lastState || { x: 0, z: 0 } });
    leaveFeedRef = FB.push(FB.ref(db, `${base}/feed`));
    await FB.onDisconnect(leaveFeedRef).set({ u: uid, k: 'leave', a: NET.name, t: FB.serverTimestamp() });
    lastSent = '';
  } catch (e) { console.warn('[net] reclaim', e); }
}
function subscribe(base) {
  const uid = NET.uid, players = FB.ref(db, `${base}/players`);
  const upd = s => { if (s.key === uid) return; const v = s.val(); if (!v || !v.n) return; const had = NET.players.has(s.key);
    if (had && performance.now() - (relaySeen.get(s.key) || -1e9) < 2500) v.p = NET.players.get(s.key).p; // the home server's 15 Hz position wins over Firebase's
    NET.players.set(s.key, v); emit(had ? 'player:update' : 'player:add', { id: s.key, ...v }); };
  subs.push(FB.onChildAdded(players, upd), FB.onChildChanged(players, upd),
    FB.onChildRemoved(players, s => { if (s.key === uid) return; NET.players.delete(s.key); emit('player:remove', s.key); })); // our own record: see reclaim()
  const since = NET.joinedAt - 5 * 60e3; // join with the last few minutes of chat
  subs.push(FB.onChildAdded(FB.query(FB.ref(db, `${base}/chat`), FB.limitToLast(40)), s => { const v = s.val(); if (v && v.t >= since) emit('chat', { id: s.key, ...v, mine: v.u === uid }); }));
  subs.push(FB.onChildAdded(FB.query(FB.ref(db, `${base}/feed`), FB.limitToLast(20)), s => { const v = s.val(); if (v && v.t >= NET.joinedAt - 2000) emit('feed', { id: s.key, ...v, mine: v.u === uid }); }));
  subs.push(FB.onChildAdded(FB.ref(db, `${base}/hits/${uid}`), s => { const v = s.val(); FB.remove(s.ref); if (v) emit('hit', v); }));
  // the shared world
  subs.push(FB.onChildAdded(FB.query(FB.ref(db, `${base}/events`), FB.limitToLast(30)), s => { const v = s.val(); if (v && v.u !== uid && v.t >= NET.joinedAt - 1500) emit('event', v); }));
  subs.push(FB.onChildAdded(FB.ref(db, `${base}/ruins`), s => { const v = s.val(); if (v && v.t > serverNow() - RUIN_MS) emit('ruin', { i: +s.key, ...v, old: v.t < NET.joinedAt }); }));
  const cr = FB.ref(db, `${base}/crowd`), cu = s => { if (s.key !== uid) emit('crowd', { id: s.key, ...s.val() }); };
  subs.push(FB.onChildAdded(cr, cu), FB.onChildChanged(cr, cu), FB.onChildRemoved(cr, s => emit('crowd:remove', s.key)));
}
const RUIN_MS = 30 * 60e3;

// delete chat and feed entries older than an hour (the rules allow anyone to, so the lists don't grow forever)
async function prune(base) {
  const cut = serverNow() - 3600e3 - 60e3;
  for (const [k, age] of [['events', 600e3], ['ruins', RUIN_MS]]) {
    try { const old = await FB.get(FB.query(FB.ref(db, `${base}/${k}`), FB.orderByChild('t'), FB.endAt(serverNow() - age - 60e3))); const ids = []; old.forEach(c => { ids.push(c.key); }); for (const id of ids) await FB.remove(FB.ref(db, `${base}/${k}/${id}`)); } catch (e) { }
  }
  for (const k of ['chat', 'feed']) {
    try {
      const old = await FB.get(FB.query(FB.ref(db, `${base}/${k}`), FB.orderByChild('t'), FB.endAt(cut)));
      const del = {}; old.forEach(c => { del[c.key] = null; });
      for (const id of Object.keys(del)) await FB.remove(FB.ref(db, `${base}/${k}/${id}`));
    } catch (e) { /* someone else got there first */ }
  }
}

// ---- state: compact numbers, sent a few times a second by the caller
// st: { x, y, z, r (heading), spd, car: { type, tint, model, p, rl, dead } | null, hp, w (weapon id), aim, shots (a counter), dead (0 / 1 wasted / 2 busted) }
function pack(st) {
  if (!st) return { x: 0, z: 0 };
  const q = v => Math.round(v * 100) / 100, o = { x: q(st.x), y: q(st.y), z: q(st.z), r: q(st.r), v: q(st.spd || 0), h: Math.round(st.hp ?? 100), w: st.w || '', d: st.dead || 0 };
  if (st.aim) o.a = 1;
  if (st.shots) o.sh = st.shots % 1000;
  if (st.car) { o.c = st.car.type; o.ct = st.car.tint; o.cm = st.car.model || ''; o.cp = q(st.car.p || 0); o.cl = q(st.car.rl || 0); o.cd = st.car.dead ? 1 : 0; }
  return o;
}
let lastSent = '';
let fbT = 0;
export function sendState(st, skin) {
  if (!NET.server) return;
  const p = pack(st);
  if (HOME.open) { HOME.send({ t: 's', p }); if (!skin && performance.now() - fbT < 1000) { lastState = p; return; } fbT = performance.now(); }
  const js = JSON.stringify(p) + (skin || ''); lastState = p;
  if (js === lastSent) return; lastSent = js; // standing still costs nothing
  const u = { p, t: FB.serverTimestamp() }; if (skin && skin !== NET.skin) { u.s = skin; NET.skin = skin; }
  FB.update(FB.ref(db, `servers/${NET.server}/players/${NET.uid}`), u).catch(e => console.warn('[net] state', e.message));
}
export function unpack(p) {
  if (!p) return null;
  return { x: p.x, y: p.y ?? 0, z: p.z, r: p.r || 0, spd: p.v || 0, hp: p.h ?? 100, w: p.w || '', aim: !!p.a, dead: p.d || 0, shots: p.sh || 0,
    car: p.c ? { type: p.c, tint: p.ct, model: p.cm || null, p: p.cp || 0, rl: p.cl || 0, dead: !!p.cd } : null };
}

export function sendChat(text) {
  if (!NET.server) return false;
  const m = String(text).replace(/\s+/g, ' ').trim().slice(0, 160); if (!m) return false;
  FB.push(FB.ref(db, `servers/${NET.server}/chat`), { u: NET.uid, n: NET.name, m, t: FB.serverTimestamp() }).catch(e => emit('chat:error', e.message));
  return true;
}
// k: kill (a killed b with w) / death (a died: b = cause) / busted (a) / wreck (a wrecked b's car)
export function feed(k, data = {}) {
  if (!NET.server) return;
  const o = { u: NET.uid, k, t: FB.serverTimestamp() };
  for (const f of ['a', 'b', 'w']) if (data[f]) o[f] = String(data[f]).slice(0, f === 'w' ? 24 : 16);
  FB.push(FB.ref(db, `servers/${NET.server}/feed`), o).catch(e => console.warn('[net] feed', e.message));
}
export function sendHit(victim, dmg, weapon) {
  if (!NET.server || !NET.players.has(victim)) return;
  const d = Math.max(1, Math.min(250, Math.round(dmg)));
  if (HOME.open) { HOME.send({ t: 'hit', v: victim, d, w: String(weapon || '').slice(0, 24) }); return; } // the home server checks it and applies it
  FB.push(FB.ref(db, `servers/${NET.server}/hits/${victim}`), { u: NET.uid, n: NET.name, d, w: String(weapon || '').slice(0, 24), t: FB.serverTimestamp() }).catch(e => console.warn('[net] hit', e.message));
}

// ---- the shared world. k: boom | col | fell | ph (hit a shared ped) | cd (damage a shared car) | claim (took a shared car)
const EV_NUM = ['x', 'y', 'z', 'R', 'dx', 'dz', 'd', 'i'];
export function sendEvent(k, data = {}) {
  if (!NET.server) return;
  const o = { u: NET.uid, k, t: FB.serverTimestamp() };
  for (const f of EV_NUM) if (typeof data[f] === 'number' && isFinite(data[f])) o[f] = Math.round(data[f] * 100) / 100;
  if (data.id) o.id = String(data.id).slice(0, 12); if (data.to) o.to = String(data.to).slice(0, 40); if (data.b) o.b = 1;
  FB.push(FB.ref(db, `servers/${NET.server}/events`), o).catch(e => console.warn('[net] event', e.message));
}
export function setRuin(i, x, z) {
  if (!NET.server) return;
  FB.set(FB.ref(db, `servers/${NET.server}/ruins/${i | 0}`), { u: NET.uid, t: FB.serverTimestamp(), x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 }).catch(() => { });
}
let crowdArmed = false;
export function sendCrowd(e) {
  if (!NET.server) return;
  const ref = FB.ref(db, `servers/${NET.server}/crowd/${NET.uid}`);
  if (!crowdArmed) { crowdArmed = true; FB.onDisconnect(ref).remove().catch(() => { crowdArmed = false; }); }
  FB.set(ref, { t: FB.serverTimestamp(), e: String(e).slice(0, 12000) }).catch(e => console.warn('[net] crowd', e.message));
}
export function clearCrowd() { if (!NET.server) return; FB.remove(FB.ref(db, `servers/${NET.server}/crowd/${NET.uid}`)).catch(() => { }); }

// ---- the home game server (server/ in this repo; optional). Its address is published at config/home by the server
// itself. When connected: positions go through it at 15 Hz, hits go to it, and it owns everyone's health.
export const HOME = { open: false, ws: null, url: '', sid: null, retry: 0, send(o) { if (this.open && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); } };
const relaySeen = new Map();
export async function connectHome(sid, name) {
  disconnectHome(); HOME.sid = sid;
  let cfg = null; try { cfg = (await FB.get(FB.ref(db, 'config/home'))).val(); } catch (e) { }
  if ((!cfg || !cfg.url) && HOME_SERVER_URL) cfg = { url: HOME_SERVER_URL };
  if (!cfg || !cfg.url || HOME.sid !== sid) return false;
  let token; try { token = await auth.currentUser.getIdToken(); } catch (e) { return false; }
  const ws = new WebSocket(cfg.url); HOME.ws = ws; HOME.url = cfg.url;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token, sid, name }));
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'welcome') { HOME.open = true; HOME.retry = 0; emit('home', true); }
    else if (m.t === 'S') { const now = performance.now(); for (const [id, p] of m.a || []) { const v = NET.players.get(id); if (!v) continue; relaySeen.set(id, now); v.p = p; emit('player:update', { id, ...v }); } }
    else if (m.t === 'hp') emit('hp', m);
    else if (m.t === 'snap') emit('snap', m);
    else if (m.t === 'error') console.warn('[home]', m.m);
  };
  ws.onclose = () => { const was = HOME.open; HOME.open = false; if (HOME.ws === ws) HOME.ws = null; if (was) emit('home', false);
    if (NET.server === sid && HOME.sid === sid && HOME.retry < 6) setTimeout(() => { if (NET.server === sid && !HOME.ws) connectHome(sid, name); }, 5000 * ++HOME.retry); };
  return true;
}
export function disconnectHome() { HOME.sid = null; HOME.open = false; if (HOME.ws) { try { HOME.ws.close(); } catch (e) { } HOME.ws = null; } relaySeen.clear(); }

export function serverName(id) { const s = SERVERS.find(s => s.id === id); return s ? s.name : id; }
