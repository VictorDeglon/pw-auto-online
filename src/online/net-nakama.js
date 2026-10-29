// Online play over a Nakama game server (server/nakama/index.js has the rooms, the fair-fight checks, progression and
// leaderboards). Same interface as net-firebase.js, so the game, remote.js, world.js and the menus don't care which
// one is running; src/online/net.js picks. On top of that interface:
//   ACCOUNT  a guest account per browser (device id), upgradable to a username + password that works anywhere;
//            the session is kept in localStorage
//   PRO      the competitive calls: profile (level, XP, skills, daily challenges), skills, claims, leaderboards
//   saves    readSave / writeSave: the player's own cloud save (src/online/cloud.js decides when)
// In a room the server owns health: HOME.open is true and index.html sends its health and respawns through HOME.send,
// exactly as it did for the old home server.
import { Client, Session } from '../../vendor/nakama-js.mjs';
import { SERVERS, NAME_RE } from './config.js';

export const NET = {
  available: false, ready: false, uid: null, server: null, name: null, skin: null, joinedAt: 0, offset: 0, connected: false,
  players: new Map(), // uid -> { n, s, p, t, lvl, title, sk, sd, streak, bounty } for everyone else in the room
  session: { sk: 0, sd: 0, streak: 0 }, // your kills, deaths and streak since you joined
  backend: 'nakama',
  world: '', // '' = Poway, else the crew-garage world you're in (src/games): you only see the players in the same one
};
const L = new Map();
export function on(ev, cb) { if (!L.has(ev)) L.set(ev, new Set()); L.get(ev).add(cb); return () => L.get(ev).delete(cb); }
function emit(ev, data) { for (const cb of L.get(ev) || []) { try { cb(data); } catch (e) { console.error('[net]', ev, e); } } }

const OP = {
  STATE: 1, HIT: 2, HP: 3, RESPAWN: 4, CHAT: 5, FEED: 6, EVENT: 7, RUIN: 8, CROWD: 9, CROWD_CLEAR: 10, NPC_KILL: 12, TCAR_HIT: 13, TCAR_TAKE: 14, PED_HIT: 15,
  SNAP: 20, ROSTER: 21, JOIN: 22, LEAVE: 23, HPSET: 24, CHAT_OUT: 25, FEED_OUT: 26, EVENT_OUT: 27, RUIN_OUT: 28, CROWD_OUT: 29,
  CROWD_GONE: 30, STATS: 31, SNAPTO: 32, WELCOME: 33, ANNOUNCE: 34, PLAYER: 35, TRAFFIC: 36, PEDS: 37,
  GAME_JOIN: 41, GAME_LEAVE: 42, GAME_ACT: 43, GAME_IN: 50, GAME_OUT: 51, GAME_STATE: 52, GAME_EVENT: 53, GAME_BOARD: 54, // crew garages (13, 14 and 36 are the street traffic)
};
const DEVICE_KEY = 'pw-auto-online-device', SESSION_KEY = 'pw-auto-online-session';
const MAIL = n => `${String(n).toLowerCase()}@players.pw-auto-online.invalid`; // Nakama logs in by email; the username is the login
const dec = new TextDecoder();
let client = null, cfg = null, session = null, socket = null, matchId = null, joinedSid = null, wantSid = null;

export function configure(c) { cfg = c; client = new Client(c.key, c.host, String(c.port || (c.ssl ? 443 : 7350)), !!c.ssl, 9000); NET.available = true; }
export function serverNow() { return Date.now() + NET.offset; }
function withTimeout(p, ms, msg) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(msg), { code: 'timeout' })), ms))]); }
async function errText(e) { // nakama-js rejects with a fetch Response for API errors
  if (e && typeof e.json === 'function') { try { const j = await e.json(); return j.message || j.error || ('HTTP ' + e.status); } catch (x) { return 'HTTP ' + e.status; } }
  return String((e && (e.message || e.code)) || e);
}
export function explain(e) {
  const c = typeof e === 'string' ? e : String((e && (e.message || e.code || e.status)) || e);
  if (/timeout|Failed to fetch|NetworkError|ECONNREFUSED|socket/i.test(c)) return 'Can\'t reach the game server right now. Check your connection and try again.';
  return c.length < 160 ? c : 'Could not reach the game server.';
}

// ---------------------------------------------------------------- account
// One browser, one guest account (its device id lives in localStorage). But a second tab or window of the same browser
// going online would be the same player: the server swapped one for the other on every reconnect, and each saw nobody
// else. So the first tab online holds a lock, and a tab that finds it taken plays as its own guest (kept in
// sessionStorage, so it survives reloading that tab) and leaves the main account's save, career and name alone.
let tabGuest = false;
try { tabGuest = !!(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pw-auto-online-tab-guest')); } catch (e) { }
let lockRelease = null;
const store = () => (tabGuest ? sessionStorage : localStorage);
function claimOnline() { // true: this tab may go online as the browser's account
  if (lockRelease || tabGuest || !(navigator.locks && navigator.locks.request)) return Promise.resolve(true);
  return new Promise(res => {
    navigator.locks.request('pw-auto-online:online', { ifAvailable: true }, lock => {
      if (!lock) { res(false); return; }
      res(true); return new Promise(r => { lockRelease = r; }); // held while this tab is online
    }).catch(() => res(true));
  });
}
async function becomeTabGuest() {
  tabGuest = true; NET.tabGuest = true; session = null;
  try { sessionStorage.setItem('pw-auto-online-tab-guest', '1'); } catch (e) { }
  dropSocket();
  await ensureSession(); await loadAccount().catch(() => { });
  emit('announce', { m: 'This browser is already online in another tab, so this tab plays as a separate guest.' });
}
function deviceId() {
  let id = null; try { id = store().getItem(DEVICE_KEY); } catch (e) { }
  if (!id || id.length < 10) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()) + (tabGuest ? '-tab' : '-pao'); try { store().setItem(DEVICE_KEY, id); } catch (e) { } }
  return id;
}
function keep(s) { session = s; NET.uid = s.user_id; try { store().setItem(SESSION_KEY, JSON.stringify({ token: s.token, refresh: s.refresh_token })); } catch (e) { } }
async function ensureSession() {
  const now = Date.now() / 1000;
  if (session && !session.isexpired(now + 60)) return session;
  if (!session) { try { const k = JSON.parse(store().getItem(SESSION_KEY) || 'null'); if (k && k.token) session = Session.restore(k.token, k.refresh); } catch (e) { session = null; } }
  if (session && !session.isexpired(now + 60)) { keep(session); return session; }
  if (session && session.refresh_token && !session.isrefreshexpired(now + 60)) { try { keep(await client.sessionRefresh(session)); return session; } catch (e) { session = null; } }
  // a guest account for this browser, named after the name you last played under here (or Guest_1234)
  let name = ''; try { const p = JSON.parse(localStorage.getItem('pw-auto-online-profile') || '{}'); if (!tabGuest && NAME_RE.test(p.name || '')) name = p.name; } catch (e) { }
  const guest = 'Guest_' + Math.floor(1000 + Math.random() * 90000);
  // a new account needs a free name: yours, else a couple of random guest names. A failure here (offline, the sign-in
  // limit) is thrown to the caller; the device id is never replaced over it, which would orphan this browser's account
  let err = null;
  for (const n of [name || guest, guest, 'Guest_' + Math.floor(1000 + Math.random() * 90000)]) {
    try { keep(await client.authenticateDevice(deviceId(), true, n)); return session; } catch (e) { err = e; if (!(e && e.status === 409)) break; } // 409: that name is taken
  }
  throw err;
  return session;
}
const acct = { username: '', guest: true, loaded: false };
async function loadAccount() {
  const a = await client.getAccount(await ensureSession());
  acct.username = a.user.username; acct.guest = !a.email; acct.loaded = true; acct.email = a.email || '';
  emit('account', ACCOUNT.info()); return acct;
}
export const ACCOUNT = {
  info() { return { signedIn: !!session, username: acct.username, guest: acct.guest, loaded: acct.loaded }; },
  async load() { await loadAccount(); return this.info(); },
  // pick the name other players see (unique across the game)
  async setName(name) {
    if (!NAME_RE.test(name || '')) throw new Error('Names are 3 to 16 letters, numbers or underscores.');
    if (!acct.loaded) await loadAccount();
    if (name === acct.username) return;
    if (!acct.guest && name.toLowerCase() !== acct.username.toLowerCase()) throw new Error(`You're signed in as ${acct.username}. Sign out to play under another name.`);
    try { await client.updateAccount(await ensureSession(), { username: name }); }
    catch (e) { const t = await errText(e); throw new Error(/exists|taken|in use/i.test(t) ? `"${name}" is taken. Try another name.` : t); }
    keep(await client.sessionRefresh(session)); acct.username = name; emit('account', this.info());
  },
  // guest -> username + password: the same account, now usable from any device
  async register(name, password) {
    if (String(password || '').length < 8) throw new Error('Use at least 8 characters for the password.');
    await this.setName(name);
    try { await client.linkEmail(await ensureSession(), { email: MAIL(name), password }); }
    catch (e) { const t = await errText(e); throw new Error(/exists|in use/i.test(t) ? 'That name already has a password. Sign in instead.' : t); }
    acct.guest = false; emit('account', this.info());
  },
  // sign in to an account made elsewhere (this browser's guest account stays where it is)
  async signIn(name, password) {
    let s; try { s = await client.authenticateEmail(MAIL(name), password, false); }
    catch (e) { const t = await errText(e); throw new Error(/not found|invalid|credentials|password/i.test(t) ? 'Wrong name or password.' : t); }
    await leave(); dropSocket();
    keep(s); await loadAccount(); return this.info();
  },
  async signOut() {
    await leave(); dropSocket();
    try { if (session) await client.sessionLogout(session, session.token, session.refresh_token); } catch (e) { }
    session = null; acct.loaded = false; acct.username = ''; acct.guest = true;
    try { store().removeItem(SESSION_KEY); store().removeItem(DEVICE_KEY); } catch (e) { } // next time: a fresh guest
    await loadAccount(); return this.info();
  },
  async readSave() {
    const s = await ensureSession(), r = await client.readStorageObjects(s, { object_ids: [{ collection: 'save', key: 'game', user_id: s.user_id }] });
    return r.objects && r.objects[0] ? r.objects[0].value : null;
  },
  async writeSave(value) {
    await client.writeStorageObjects(await ensureSession(), [{ collection: 'save', key: 'game', value, permission_read: 1, permission_write: 1 }]);
  },
};

// ---------------------------------------------------------------- competitive calls
async function rpc(id, body) { const r = await client.rpc(await ensureSession(), id, body || {}); return r.payload; }
async function rpcSafe(id, body) { try { return await rpc(id, body); } catch (e) { throw new Error(await errText(e)); } }
export const PRO = {
  profile: () => rpcSafe('profile'),
  buySkill: id => rpcSafe('skill_buy', { id }),
  resetSkills: () => rpcSafe('skill_reset'),
  claim: (kind, id) => rpcSafe('claim', { kind, id }),
  leaderboard: (board, limit) => rpcSafe('leaderboard', { board, limit }),
  online: () => !!(NET.server && matchId && NET.connected), // in a room: the only place kills, XP and levels count
  npcKill: cop => sendOp(OP.NPC_KILL, { cop: cop ? 1 : 0 }), // the room checks the pace and pays the XP
};

// ---------------------------------------------------------------- the menus
export async function initNet() {
  if (NET.ready) return true;
  if (!client) return false;
  await withTimeout(ensureSession(), 10000, 'sign-in timed out');
  loadAccount().catch(e => console.warn('[net] account', e));
  rpc('time').then(r => { NET.offset = r.t - Date.now(); }).catch(() => { });
  NET.ready = true;
  return true;
}
export function watchServers(cb) {
  let stop = false;
  const tick = async () => { if (stop) return; try { const r = await rpc('rooms'); cb(r.counts); } catch (e) { } if (!stop) setTimeout(tick, 4000); };
  tick(); return () => { stop = true; };
}
export async function ping(sid) {
  const t0 = performance.now();
  try { const r = await rpc('time'); NET.offset = r.t - Date.now(); } catch (e) { return null; }
  return Math.round(performance.now() - t0);
}
export function validName(n) { return NAME_RE.test(n || ''); }
export function serverName(id) { const s = SERVERS.find(s => s.id === id); return s ? s.name : id; }

// ---------------------------------------------------------------- joining a room
let welcomed = null;
function dropSocket() { // close ours on purpose: no "connection lost", no rejoin
  if (!socket) return;
  const old = socket; socket = null; NET.connected = false; old.ondisconnect = () => { };
  try { old.disconnect(false); } catch (e) { }
}
async function openSocket() {
  if (socket && NET.connected) return socket;
  const s = await ensureSession();
  const sk = socket = client.createSocket(!!cfg.ssl, false);
  sk.onmatchdata = onData;
  sk.ondisconnect = () => { // a socket we replaced closes late: it mustn't take the new one down with it
    if (socket !== sk) return;
    const was = NET.connected; NET.connected = false; socket = null; if (was) { emit('connection', false); if (joinedSid) rejoin(joinedSid); }
  };
  await withTimeout(sk.connect(s, true), 10000, 'connection timed out');
  if (socket !== sk) throw new Error('connection replaced');
  NET.connected = true;
  return sk;
}
async function enterRoom(sid, skin, state) {
  const r = await rpcSafe('room_join', { sid });
  NET.offset = r.t - Date.now();
  welcomed = null;
  matchId = r.match;
  const got = new Promise(res => { welcomed = res; });
  const m = await socket.joinMatch(r.match, undefined, { s: skin || NET.skin || '', p: JSON.stringify(pack(state || lastState)) }); // others get your look and place with the join
  matchId = (m && m.match_id) || r.match;
  await withTimeout(got, 8000, 'the room did not answer');
}
// claim the name and go live; resolves { ok } or { ok: false, err }
export async function join(sid, name, skin, state) {
  try {
    if (!SERVERS.some(s => s.id === sid)) return { ok: false, err: 'Unknown server.' };
    if (NET.server) await leave();
    if (!(await claimOnline())) await becomeTabGuest(); // another tab of this browser is online as this account
    try {
      await ACCOUNT.setName(name);
    } catch (e) {
      // If the primary account name is taken, auto-assign a unique variation so the player can always join
      const alt = `${name.slice(0, 11)}_${Math.floor(100 + Math.random() * 900)}`;
      try {
        await ACCOUNT.setName(alt);
        name = alt;
      } catch (e2) {
        const info = await loadAccount().catch(() => null);
        if (info && info.username) name = info.username;
        else throw e;
      }
    }
    dropSocket(); // the socket carries the name: reconnect with it
    await openSocket();
    NET.players.clear(); NET.session = { sk: 0, sd: 0, streak: 0 };
    wantSid = sid; NET.skin = skin || ''; await enterRoom(sid, skin, state);
    NET.server = sid; NET.name = name; NET.skin = skin || ''; NET.joinedAt = serverNow(); joinedSid = sid;
    HOME.open = true;
    lastSent = ''; sendState(state, skin);
    return { ok: true };
  } catch (e) {
    console.warn('[net] join', e); wantSid = null;
    return { ok: false, err: explain(e instanceof Error ? e : await errText(e)) };
  }
}
export async function leave() {
  if (!NET.server && !matchId) return;
  const mid = matchId; matchId = null; joinedSid = null; wantSid = null;
  if (mid && socket) { try { await socket.leaveMatch(mid); } catch (e) { } }
  HOME.open = false;
  for (const id of NET.players.keys()) emit('player:remove', id);
  NET.players.clear(); NET.server = null; NET.name = null; shown.clear(); emit('traffic:on', false); emit('peds:on', false);
  if (lockRelease) { lockRelease(); lockRelease = null; } // other tabs may go online as this account now
  if (NET.world) { NET.world = ''; emit('game:out', { g: '', lost: true }); }
}
let rejoining = false;
async function rejoin(sid) { // the connection dropped: reconnect and go back into the same server
  if (rejoining) return; rejoining = true;
  for (let i = 0; i < 8 && joinedSid === sid; i++) {
    await new Promise(r => setTimeout(r, 1500 + 1500 * i));
    try { await openSocket(); await enterRoom(sid, NET.skin, null); emit('connection', true); rejoining = false; return; } catch (e) { console.warn('[net] rejoin', e); }
  }
  rejoining = false;
  if (joinedSid === sid) { await leave(); emit('kicked', 'Lost the connection to the game server.'); }
}

// players in another world (Poway or a crew garage) stay in NET.players (the player list) but out of sight:
// remote.js only ever hears about the ones in yours
const shown = new Set();
function show(id, v) {
  if ((v.g || '') !== NET.world) { if (shown.delete(id)) emit('player:remove', id); return; }
  if (!v.p) return;
  emit(shown.has(id) ? 'player:update' : 'player:add', { id, ...v }); shown.add(id);
}
function setWorld(g) { // you moved between worlds: whoever is there now comes into view, everyone else goes
  NET.world = g || '';
  for (const [id, v] of NET.players) show(id, v);
}
function upsert(d) {
  if (!d || d.id === NET.uid) return;
  const v = Object.assign(NET.players.get(d.id) || {}, { n: d.n, s: d.s || '', lvl: d.lvl, title: d.title, sk: d.sk, sd: d.sd, streak: d.streak, bounty: d.bounty, g: d.g || '' });
  if (d.p) { v.p = d.p; v.t = serverNow(); }
  NET.players.set(d.id, v); show(d.id, v);
}
function onData(m) {
  if (m.match_id && matchId && m.match_id !== matchId) return;
  let d; try { d = JSON.parse(dec.decode(m.data)); } catch (e) { return; }
  switch (m.op_code) {
    case OP.WELCOME: {
      NET.offset = d.t - Date.now();
      for (const r of d.roster || []) upsert(r);
      for (const r of d.ruins || []) emit('ruin', { ...r, old: true, age: Math.max(0, (d.t - r.t) / 1000) });
      for (const c of d.crowds || []) emit('crowd', c);
      emit('traffic:on', !!d.traffic); // the room runs the cars (src/online/traffic.js draws them)
      emit('peds:on', !!d.peds); // ... and the people (src/online/peds.js)
      if (welcomed) { welcomed(); welcomed = null; }
      break;
    }
    case OP.SNAP: {
      NET.offset = NET.offset * 0.9 + (d.t - Date.now()) * 0.1;
      for (const [id, p] of d.a || []) { if (id === NET.uid) continue; const v = NET.players.get(id); if (!v) continue; v.p = p; v.t = d.t; show(id, v); }
      break;
    }
    case OP.JOIN: case OP.PLAYER: upsert(d); break;
    case OP.LEAVE: if (NET.players.delete(d.id) && shown.delete(d.id)) emit('player:remove', d.id); break;
    case OP.HPSET: emit('hp', d); break;
    case OP.SNAPTO: emit('snap', d); break;
    case OP.TRAFFIC: emit('traffic', d); break;
    case OP.PEDS: emit('peds', d); break;
    case OP.CHAT_OUT: emit('chat', { id: d.t + d.u, ...d, mine: d.u === NET.uid }); break;
    case OP.FEED_OUT: emit('feed', { id: d.t + d.u + d.k, ...d, mine: d.u === NET.uid }); break;
    case OP.EVENT_OUT: emit('event', d); break;
    case OP.RUIN_OUT: emit('ruin', { ...d, old: false, age: 0 }); break;
    case OP.CROWD_OUT: emit('crowd', d); break;
    case OP.CROWD_GONE: emit('crowd:remove', d.id); break;
    case OP.STATS: NET.session = { sk: d.sk, sd: d.sd, streak: d.streak }; emit('stats', d); break;
    case OP.ANNOUNCE: emit('announce', d); break;
    case OP.GAME_IN: setWorld(d.g); emit('game:in', d); break;
    case OP.GAME_OUT: if (d.door) setWorld(''); emit('game:out', d); break;
    case OP.GAME_STATE: if (d.g === NET.world) emit('game:state', d); break;
    case OP.GAME_EVENT: emit('game:event', d); break;
    case OP.GAME_BOARD: emit('game:board', d); break;
  }
}
function sendOp(op, o) { if (!socket || !matchId || !NET.connected) return; socket.sendMatchState(matchId, op, JSON.stringify(o)).catch(() => { }); }

// ---- state: compact numbers, sent ~15 times a second by the caller (see net-firebase.js for the fields)
function pack(st) {
  if (!st) return { x: 0, z: 0 };
  const q = v => (typeof v === 'number' && isFinite(v)) ? Math.round(v * 100) / 100 : 0;
  const o = { x: q(st.x), y: q(st.y), z: q(st.z), r: q(st.r), v: q(st.spd || 0), h: Math.round(st.hp ?? 100), w: st.w || '', d: st.dead || 0 };
  if (st.aim) o.a = 1;
  if (st.shots) o.sh = st.shots % 1000;
  if (st.car) { o.c = st.car.type; o.ct = st.car.tint; o.cm = st.car.model || ''; o.cp = q(st.car.p || 0); o.cl = q(st.car.rl || 0); o.cd = st.car.dead ? 1 : 0; }
  if (st.ride) o.rd = String(st.ride).slice(0, 40); // riding as a passenger in that player's car
  if (st.car && st.car.pt) o.cx = String(st.car.pt).slice(0, 240); // body-shop parts
  if (st.air) { o.ak = String(st.air.k).slice(0, 16); o.aq = st.air.q.map(v => Math.round(v * 1000) / 1000); } // flying: which aircraft, and its attitude
  return o;
}
let lastSent = '', lastState = null;
export function sendState(st, skin) {
  if (!NET.server) return;
  const p = pack(st), js = JSON.stringify(p) + (skin || ''); lastState = st;
  if (js === lastSent) return; lastSent = js; // standing still costs nothing
  const o = { p }; if (skin && skin !== NET.skin) { o.s = skin; NET.skin = skin; } else if (skin) o.s = skin;
  sendOp(OP.STATE, o);
}
export function unpack(p) {
  if (!p) return null;
  return { x: p.x, y: p.y ?? 0, z: p.z, r: p.r || 0, spd: p.v || 0, hp: p.h ?? 100, w: p.w || '', aim: !!p.a, dead: p.d || 0, shots: p.sh || 0,
    car: p.c ? { type: p.c, tint: p.ct, model: p.cm || null, p: p.cp || 0, rl: p.cl || 0, dead: !!p.cd, pt: typeof p.cx === 'string' ? p.cx : '' } : null, ride: typeof p.rd === 'string' ? p.rd : null,
    air: typeof p.ak === 'string' && Array.isArray(p.aq) && p.aq.length === 4 ? { k: p.ak, q: p.aq } : null };
}
export function sendChat(text) {
  if (!NET.server) return false;
  const m = String(text).replace(/\s+/g, ' ').trim().slice(0, 160); if (!m) return false;
  sendOp(OP.CHAT, { m }); return true;
}
// kills and deaths are the server's to announce; the game only reports busts and wrecks
export function feed(k, data = {}) { if (k === 'busted' || k === 'wreck') sendOp(OP.FEED, { k, b: String(data.b || '').slice(0, 16) }); }
export function sendHit(victim, dmg, weapon) {
  if (!NET.server || !NET.players.has(victim)) return;
  sendOp(OP.HIT, { v: victim, d: Math.max(1, Math.min(500, Math.round(dmg))), w: String(weapon || '').slice(0, 24) });
}
const EV_NUM = ['x', 'y', 'z', 'R', 'dx', 'dz', 'd', 'i'];
export function sendEvent(k, data = {}) {
  if (!NET.server) return;
  const o = { k };
  for (const f of EV_NUM) if (typeof data[f] === 'number' && isFinite(data[f])) o[f] = Math.round(data[f] * 100) / 100;
  if (data.id) o.id = String(data.id).slice(0, 12); if (data.to) o.to = String(data.to).slice(0, 40); if (data.b) o.b = 1;
  sendOp(OP.EVENT, o);
}
export function setRuin(i, x, z) { sendOp(OP.RUIN, { i: i | 0, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 }); }
// the room's traffic: a hit on one of its cars, or taking one for yourself
export function trafficHit(id, d) { sendOp(OP.TCAR_HIT, { id, d: Math.max(0, Math.min(150, Math.round(d))) }); }
export function trafficTake(id) { sendOp(OP.TCAR_TAKE, { id }); }
// the room's people: a hit on one of them (the room decides when it's dead)
export function pedHit(id, d) { sendOp(OP.PED_HIT, { id, d: Math.max(0, Math.min(300, Math.round(d))) }); }
export function sendCrowd(e) { sendOp(OP.CROWD, { e: String(e).slice(0, 12000) }); }
export function clearCrowd() { sendOp(OP.CROWD_CLEAR, {}); }

// crew garages (src/games): go into a garage's world, come out, and the games' own moves (time trial, join a race,
// reset). The room answers with game:in / game:out / game:state / game:event / game:board.
export const GAMENET = {
  join: g => sendOp(OP.GAME_JOIN, { g: String(g) }),
  leave: () => sendOp(OP.GAME_LEAVE, {}),
  act: (a, o = {}) => sendOp(OP.GAME_ACT, { ...o, a: String(a) }),
  ready: () => !!(NET.server && matchId && NET.connected),
};
// the room owns health: index.html reports its own health changes and respawns here
export const HOME = {
  open: false, ws: null, url: '', sid: null, retry: 0,
  send(o) { if (!this.open) return; if (o.t === 'hp') sendOp(OP.HP, { h: o.h, cause: o.cause || '' }); else if (o.t === 'respawn') sendOp(OP.RESPAWN, {}); },
};
export async function connectHome() { return HOME.open; }
export function disconnectHome() { }
