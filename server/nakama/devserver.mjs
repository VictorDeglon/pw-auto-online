// A stand-in for Nakama, for testing on a computer that can't spare the memory for the real one (Docker): it runs
// this folder's index.js (the real module, unchanged) behind the parts of Nakama's HTTP API and realtime socket
// that the game uses (device sign-in, account, RPCs, storage, authoritative matches), with everything kept in memory.
// It is not a server for players: no security, no persistence, no Postgres.
//   node server/nakama/devserver.mjs [port]   (MODULE=<file> loads a built module instead of index.js)   then nakama.local.json: { "host": "127.0.0.1", "port": <port>, "ssl": false, "key": "dev" }
//   and open the game with ?nk=local
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = +(process.argv[2] || 7357), DIR = dirname(fileURLToPath(import.meta.url));
const log = (lvl, f, ...a) => { let i = 0; const s = String(f).replace(/%[sdvf]|%\.\df/g, m => { const v = a[i++]; return /f/.test(m) && typeof v === 'number' ? v.toFixed(1) : String(v); }); if (lvl !== 'debug') console.log(new Date().toISOString().slice(11, 23), lvl.toUpperCase().padEnd(5), s); };
const logger = { info: (...a) => log('info', ...a), warn: (...a) => log('warn', ...a), error: (...a) => log('error', ...a), debug: (...a) => log('debug', ...a) };

// ---------------------------------------------------------------- the runtime the module sees (nk)
const users = new Map(), byDevice = new Map(), byName = new Map(), storage = new Map(), boards = new Map(), cache = new Map(), matches = new Map();
const skey = (c, k, u) => `${c}\u0000${k}\u0000${u}`;
const nk = {
  storageRead(ids) { return ids.map(o => storage.get(skey(o.collection, o.key, o.userId))).filter(Boolean).map(r => ({ ...r, value: JSON.parse(JSON.stringify(r.value)) })); },
  storageWrite(objs) {
    for (const o of objs) { const k = skey(o.collection, o.key, o.userId), cur = storage.get(k);
      if (o.version === '*' && cur) throw new Error('storage write rejected - version check failed');
      if (o.version && o.version !== '*' && (!cur || cur.version !== o.version)) throw new Error('storage write rejected - version check failed'); }
    return objs.map(o => { const r = { collection: o.collection, key: o.key, userId: o.userId, value: JSON.parse(JSON.stringify(o.value)), version: randomUUID() }; storage.set(skey(o.collection, o.key, o.userId), r); return { collection: r.collection, key: r.key, userId: r.userId, version: r.version }; });
  },
  leaderboardCreate(id, auth, sort, operator, reset) { if (boards.has(id)) throw new Error('exists'); boards.set(id, { id, sort: sort === 'ascending' ? 'asc' : 'desc', operator, recs: new Map() }); },
  leaderboardRecordWrite(id, owner, username, score, subscore = 0, metadata = {}) {
    const B = boards.get(id); if (!B) throw new Error('no board ' + id);
    const cur = B.recs.get(owner), better = (a, b) => B.sort === 'asc' ? a < b : a > b;
    let r = cur ? { ...cur } : { leaderboardId: id, ownerId: owner, username, score: 0, subscore: 0, metadata: {}, numScore: 0 };
    if (B.operator === 'increment') { r.score += score; r.subscore += subscore; r.metadata = metadata; }
    else if (B.operator === 'set' || !cur || better(score, cur.score) || (score === cur.score && better(subscore, cur.subscore))) { r.score = score; r.subscore = subscore; r.metadata = metadata; }
    r.username = username; r.numScore++; B.recs.set(owner, r);
    return { ...r, rank: rankOf(B, owner) };
  },
  leaderboardRecordsList(id, owners = [], limit = 10) {
    const B = boards.get(id); if (!B) throw new Error('no board ' + id);
    const all = sorted(B), records = all.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
    return { records, ownerRecords: (owners || []).map(o => all.findIndex(r => r.ownerId === o)).filter(i => i >= 0).map(i => ({ ...all[i], rank: i + 1 })) };
  },
  localcacheGet(k) { const e = cache.get(k); if (!e) return null; if (e.until < Date.now()) { cache.delete(k); return null; } return e.v; },
  localcachePut(k, v, ttl) { cache.set(k, { v, until: Date.now() + (ttl || 3600) * 1000 }); },
  localcacheDelete(k) { cache.delete(k); },
  accountGetId(uid) { const u = users.get(uid); if (!u) throw new Error('no user'); return { user: { id: uid, username: u.username } }; },
  binaryToString(b) { return typeof b === 'string' ? b : Buffer.from(b).toString('utf8'); },
  matchCreate(name, params) { return createMatch(name, params || {}); },
  matchGet(id) { const M = matches.get(id); return M ? { matchId: id, size: Object.keys(M.presences).length, label: M.label } : null; },
};
function sorted(B) { return [...B.recs.values()].sort((a, b) => B.sort === 'asc' ? a.score - b.score || a.subscore - b.subscore : b.score - a.score || b.subscore - a.subscore); }
function rankOf(B, owner) { return sorted(B).findIndex(r => r.ownerId === owner) + 1; }

// ---------------------------------------------------------------- load the module
const reg = { rpc: {}, match: {}, before: {} };
const initializer = new Proxy({}, { get: (_, name) => (a, b) => {
  if (name === 'registerRpc') reg.rpc[a] = b; else if (name === 'registerMatch') reg.match[a] = b; else reg.before[name + (typeof a === 'string' ? ':' + a : '')] = typeof a === 'function' ? a : b;
} });
// the module as deploy.sh builds it: roads.js + traffic.js + index.js in one file (MODULE=<file> tests a built file instead)
const src = process.env.MODULE ? readFileSync(process.env.MODULE, 'utf8') : ['roads.js', 'traffic.js', 'index.js'].filter(f => existsSync(join(DIR, f))).map(f => readFileSync(join(DIR, f), 'utf8')).join('');
globalThis.__DEVLOG = (k, o) => log('info', '%s %s', k, JSON.stringify(o)); // the module's optional dev logging
// Nakama's JS runtime freezes the objects a module creates at load, and runs it in strict mode: writing to one later
// throws there although plain Node allows it. FREEZE=1 does the same here (strict mode, every top-level value deep-frozen).
function deepFreeze(root) { const seen = new Set(), stack = [root]; while (stack.length) { const o = stack.pop(); if (!o || (typeof o !== 'object' && typeof o !== 'function') || seen.has(o)) continue; seen.add(o); if (typeof o === 'object') for (const k of Object.getOwnPropertyNames(o)) { const d = Object.getOwnPropertyDescriptor(o, k); if (d && 'value' in d) stack.push(d.value); } Object.freeze(o); } }
let InitModule;
if (process.env.FREEZE) {
  const cx = vm.createContext({ __DEVLOG: globalThis.__DEVLOG }); vm.runInContext("'use strict';\n" + src, cx);
  for (const k of Object.getOwnPropertyNames(cx)) if (k !== '__DEVLOG') deepFreeze(cx[k]);
  InitModule = cx.InitModule; console.log('module run in strict mode with its load-time objects frozen');
} else InitModule = new Function(src + '\nreturn InitModule;')();
InitModule({ env: {} }, logger, nk, initializer);

// ---------------------------------------------------------------- matches
function createMatch(name, params) {
  const H = reg.match[name], id = randomUUID() + '.dev', r = H.matchInit({}, logger, nk, params);
  const M = { id, H, state: r.state, label: r.label, tick: 0, presences: {}, queue: [], rate: r.tickRate || 10 };
  M.dispatcher = {
    broadcastMessage(op, data, to, sender) { const list = to && to.length ? to : Object.values(M.presences); for (const p of list) { const s = sockets.get(p.sessionId); if (s) s.send({ match_data: { match_id: id, op_code: String(op), data: Buffer.from(String(data)).toString('base64'), reliable: true } }); } },
    matchKick(list) { for (const p of list) { const s = sockets.get(p.sessionId); if (s) leaveMatch(M, s, true); } },
    matchLabelUpdate(l) { M.label = l; },
  };
  M.timer = setInterval(() => {
    M.tick++; const msgs = M.queue.splice(0);
    let out; try { out = H.matchLoop({}, logger, nk, M.dispatcher, M.tick, M.state, msgs); } catch (e) { logger.error('matchLoop: %s', e.stack || e); return; }
    if (!out) { clearInterval(M.timer); matches.delete(id); logger.info('match %s closed', id); } else M.state = out.state;
  }, 1000 / M.rate);
  matches.set(id, M); return id;
}
function leaveMatch(M, sock, kicked) {
  const p = M.presences[sock.sid]; if (!p) return; delete M.presences[sock.sid];
  try { M.state = M.H.matchLeave({}, logger, nk, M.dispatcher, M.tick, M.state, [p]).state; } catch (e) { logger.error('matchLeave: %s', e.stack || e); }
  sock.match = null;
}

// ---------------------------------------------------------------- sessions (unsigned tokens: this is a test server)
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function tokens(uid) { const u = users.get(uid), exp = Math.floor(Date.now() / 1000) + 7200; return { token: `${b64u({ alg: 'none' })}.${b64u({ uid, usn: u.username, exp, vrs: {} })}.x`, refresh_token: `${b64u({ alg: 'none' })}.${b64u({ uid, usn: u.username, exp: exp + 86400, rf: 1 })}.x` }; }
function who(req) { const h = req.headers.authorization || ''; const m = /^Bearer (.+)$/.exec(h); if (!m) return null; try { const p = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url')); return users.has(p.uid) ? p.uid : null; } catch (e) { return null; } }
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

// ---------------------------------------------------------------- HTTP
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'OPTIONS') return send(204, {});
  let body = ''; for await (const c of req) body += c; let J = {}; try { J = body ? JSON.parse(body) : {}; } catch (e) { }
  try {
    const p = url.pathname;
    if (p === '/healthcheck') return send(200, {});
    if (p === '/v2/account/authenticate/device') {
      let uid = byDevice.get(J.id); const want = url.searchParams.get('username') || '';
      if (!uid) { const name = want && NAME_RE.test(want) && !byName.has(want.toLowerCase()) ? want : 'Guest_' + Math.floor(1000 + Math.random() * 90000);
        if (want && byName.has(want.toLowerCase())) return send(409, { message: 'Username is already in use.' });
        uid = randomUUID(); users.set(uid, { username: name, device: J.id }); byDevice.set(J.id, uid); byName.set(name.toLowerCase(), uid); logger.info('new account %s', name); }
      return send(200, { ...tokens(uid), created: true });
    }
    if (p === '/v2/account/session/refresh') { const q = JSON.parse(Buffer.from(String(J.token).split('.')[1], 'base64url')); return users.has(q.uid) ? send(200, tokens(q.uid)) : send(401, { message: 'bad' }); }
    if (p === '/v2/session/logout') return send(200, {});
    const uid = who(req); if (!uid) return send(401, { message: 'Auth token invalid' });
    const U = users.get(uid);
    if (p === '/v2/account' && req.method === 'GET') return send(200, { user: { id: uid, username: U.username }, email: U.email || '' });
    if (p === '/v2/account' && req.method === 'PUT') {
      const n = J.username; if (n && n !== U.username) { if (!NAME_RE.test(n)) return send(400, { message: 'Names are 3 to 16 letters, numbers or underscores.' }); if (byName.has(n.toLowerCase()) && byName.get(n.toLowerCase()) !== uid) return send(409, { message: 'Username is already in use.' }); byName.delete(U.username.toLowerCase()); U.username = n; byName.set(n.toLowerCase(), uid); }
      return send(200, {});
    }
    if (p.startsWith('/v2/rpc/')) {
      const id = decodeURIComponent(p.slice(8)), fn = reg.rpc[id]; if (!fn) return send(404, { message: 'RPC function not found' });
      const payload = typeof J === 'string' ? J : body;
      try { return send(200, { id, payload: fn({ userId: uid, username: U.username, env: {} }, logger, nk, payload) }); } catch (e) { return send(400, { message: String(e.message || e) }); }
    }
    if (p === '/v2/storage' && req.method === 'POST') return send(200, { objects: nk.storageRead((J.object_ids || []).map(o => ({ collection: o.collection, key: o.key, userId: o.user_id }))).map(r => ({ collection: r.collection, key: r.key, user_id: r.userId, value: JSON.stringify(r.value), version: r.version })) });
    if (p === '/v2/storage' && req.method === 'PUT') { const acks = nk.storageWrite((J.objects || []).map(o => ({ collection: o.collection, key: o.key, userId: uid, value: typeof o.value === 'string' ? JSON.parse(o.value) : o.value }))); return send(200, { acks }); }
    return send(404, { message: 'not in the dev server: ' + p });
  } catch (e) { logger.error('%s %s: %s', req.method, url.pathname, e.stack || e); send(500, { message: String(e.message || e) }); }
});

// ---------------------------------------------------------------- the realtime socket (text frames)
const sockets = new Map();
server.on('upgrade', (req, sock) => {
  const url = new URL(req.url, 'http://x'); let uid = null;
  try { const q = JSON.parse(Buffer.from(String(url.searchParams.get('token')).split('.')[1], 'base64url')); uid = users.has(q.uid) ? q.uid : null; } catch (e) { }
  if (!uid) { sock.destroy(); return; }
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const S = { sid: randomUUID(), uid, match: null, sock,
    send(o) { const d = Buffer.from(JSON.stringify(o)), n = d.length, h = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), Buffer.from([(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255])]); if (!sock.destroyed) sock.write(Buffer.concat([h, d])); } };
  sockets.set(S.sid, S);
  let buf = Buffer.alloc(0), frag = [];
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return; const fin = buf[0] & 0x80, op = buf[0] & 15, masked = buf[1] & 0x80; let n = buf[1] & 127, off = 2;
      if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); off = 4; } else if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); off = 10; }
      const mk = masked ? buf.subarray(off, off + 4) : null; if (masked) off += 4; if (buf.length < off + n) return;
      const data = Buffer.from(buf.subarray(off, off + n)); if (mk) for (let i = 0; i < n; i++) data[i] ^= mk[i & 3]; buf = buf.subarray(off + n);
      if (op === 8) { sock.end(); return; } if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); continue; } if (op === 10) continue;
      frag.push(data); if (!fin) continue; const msg = Buffer.concat(frag).toString('utf8'); frag = [];
      try { onMsg(S, JSON.parse(msg)); } catch (e) { logger.error('socket message: %s', e.stack || e); }
    }
  });
  const gone = () => { if (!sockets.has(S.sid)) return; sockets.delete(S.sid); if (S.match) leaveMatch(S.match, S); };
  sock.on('close', gone); sock.on('error', gone);
});
function onMsg(S, m) {
  const U = users.get(S.uid), presence = () => ({ userId: S.uid, sessionId: S.sid, username: U.username, node: 'dev' });
  if (m.ping) return S.send({ cid: m.cid, pong: {} });
  if (m.match_join) {
    const M = matches.get(m.match_join.match_id); if (!M) return S.send({ cid: m.cid, error: { code: 4, message: 'Match not found' } });
    const pr = presence(), r = M.H.matchJoinAttempt({}, logger, nk, M.dispatcher, M.tick, M.state, pr, m.match_join.metadata || {});
    M.state = r.state; if (!r.accept) return S.send({ cid: m.cid, error: { code: 6, message: r.rejectMessage || 'rejected' } });
    if (S.match && S.match !== M) leaveMatch(S.match, S);
    M.presences[S.sid] = pr; S.match = M;
    S.send({ cid: m.cid, match: { match_id: M.id, authoritative: true, label: M.label, size: Object.keys(M.presences).length, presences: [], self: pr } });
    try { M.state = M.H.matchJoin({}, logger, nk, M.dispatcher, M.tick, M.state, [pr]).state; } catch (e) { logger.error('matchJoin: %s', e.stack || e); }
    return;
  }
  if (m.match_leave) { const M = matches.get(m.match_leave.match_id); if (M) leaveMatch(M, S); return S.send({ cid: m.cid }); }
  if (m.match_data_send) {
    const d = m.match_data_send, M = matches.get(d.match_id); if (!M || !M.presences[S.sid]) return;
    M.queue.push({ sender: M.presences[S.sid], opCode: +d.op_code, data: Buffer.from(d.data || '', 'base64').toString('utf8'), reliable: true });
    return;
  }
  if (m.cid) S.send({ cid: m.cid });
}
server.listen(PORT, '127.0.0.1', () => logger.info('dev Nakama on http://127.0.0.1:%s (module: %s RPCs, matches: %s)', PORT, Object.keys(reg.rpc).length, Object.keys(reg.match).join(',')));
export { nk, matches, users, boards };
