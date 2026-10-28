// The crew garages without the game server (the Firebase backup, or a copy with no nakama.json): the browser runs the
// server's own module (src/games/room-module.js, generated from server/nakama/index.js) as a room with only you in it,
// so the doors still open and Long Jump and the races work, solo, judged by the same rules, with your best times kept
// on this computer. Hide & Seek needs other players to start. Same interface as net-nakama.js's GAMENET, made by
// src/online/net.js when the transport has none:
//   const L = createLocalNet(NET, emit)   L.ready()  L.join(g)  L.leave()  L.act(a, o)  L.state(st, skin)  L.stop()  L.inWorld
const OP = { STATE: 1, GAME_JOIN: 41, GAME_LEAVE: 42, GAME_ACT: 43 };
const EVENTS = { 50: 'game:in', 51: 'game:out', 52: 'game:state', 53: 'game:event', 54: 'game:board' };
const BOARDS = 'pw-auto-online-local-boards'; // the crew boards' records on this computer
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

// the player's state as the room reads it (src/online/net-nakama.js pack)
function pack(st) {
  if (!st) return { x: 0, z: 0 };
  const q = v => (typeof v === 'number' && isFinite(v)) ? Math.round(v * 100) / 100 : 0;
  const o = { x: q(st.x), y: q(st.y), z: q(st.z), r: q(st.r), v: q(st.spd || 0), h: Math.round(st.hp ?? 100), w: st.w || '', d: st.dead || 0 };
  if (st.car) { o.c = st.car.type; o.ct = st.car.tint; o.cm = st.car.model || ''; o.cp = q(st.car.p || 0); o.cl = q(st.car.rl || 0); o.cd = st.car.dead ? 1 : 0; }
  if (st.air) { o.ak = String(st.air.k).slice(0, 16); o.aq = st.air.q.map(v => Math.round(v * 1000) / 1000); }
  return o;
}

// what the module needs of Nakama's runtime, in memory (as server/nakama/devserver.mjs does it), boards saved locally
function runtime() {
  const storage = new Map(), cache = new Map(), boards = new Map(), skey = (c, k, u) => `${c}\u0000${k}\u0000${u}`;
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(BOARDS) || '{}'); } catch (e) { }
  const save = () => { const o = {}; for (const [id, B] of boards) o[id] = [...B.recs.values()]; try { localStorage.setItem(BOARDS, JSON.stringify(o)); } catch (e) { } };
  const sorted = B => [...B.recs.values()].sort((a, b) => B.sort === 'asc' ? a.score - b.score || a.subscore - b.subscore : b.score - a.score || b.subscore - a.subscore);
  return {
    storageRead: ids => ids.map(o => storage.get(skey(o.collection, o.key, o.userId))).filter(Boolean).map(r => ({ ...r, value: JSON.parse(JSON.stringify(r.value)) })),
    storageWrite: objs => objs.map(o => { const r = { collection: o.collection, key: o.key, userId: o.userId, value: JSON.parse(JSON.stringify(o.value)), version: String(Date.now() + Math.random()) }; storage.set(skey(o.collection, o.key, o.userId), r); return { collection: r.collection, key: r.key, userId: r.userId, version: r.version }; }),
    leaderboardCreate(id, auth, sort, operator) { if (boards.has(id)) return; const B = { id, sort: sort === 'ascending' ? 'asc' : 'desc', operator, recs: new Map() }; for (const r of saved[id] || []) B.recs.set(r.ownerId, r); boards.set(id, B); },
    leaderboardRecordWrite(id, owner, username, score, subscore = 0, metadata = {}) {
      const B = boards.get(id); if (!B) throw new Error('no board ' + id);
      const cur = B.recs.get(owner), better = (a, b) => B.sort === 'asc' ? a < b : a > b;
      const r = cur ? { ...cur } : { leaderboardId: id, ownerId: owner, username, score: 0, subscore: 0, metadata: {}, numScore: 0 };
      if (B.operator === 'increment') { r.score += score; r.subscore += subscore; r.metadata = metadata; }
      else if (B.operator === 'set' || !cur || better(score, cur.score) || (score === cur.score && better(subscore, cur.subscore))) { r.score = score; r.subscore = subscore; r.metadata = metadata; }
      r.username = username; r.numScore++; B.recs.set(owner, r); save();
      return { ...r, rank: sorted(B).findIndex(x => x.ownerId === owner) + 1 };
    },
    leaderboardRecordsList(id, owners = [], limit = 10) {
      const B = boards.get(id); if (!B) throw new Error('no board ' + id);
      const all = sorted(B);
      return { records: all.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 })), ownerRecords: (owners || []).map(o => all.findIndex(r => r.ownerId === o)).filter(i => i >= 0).map(i => ({ ...all[i], rank: i + 1 })) };
    },
    localcacheGet(k) { const e = cache.get(k); return e && e.until > Date.now() ? e.v : null; },
    localcachePut(k, v, ttl) { cache.set(k, { v, until: Date.now() + (ttl || 3600) * 1000 }); },
    localcacheDelete(k) { cache.delete(k); },
    accountGetId: uid => ({ user: { id: uid, username: 'Player' } }),
    binaryToString: b => typeof b === 'string' ? b : new TextDecoder().decode(b),
    matchCreate: () => 'local', matchGet: () => null,
  };
}

export function createLocalNet(NET, emit) {
  let R = null, starting = null, last = null, skin = '', inWorld = false;
  const me = () => ({ userId: 'local-' + (NET.uid || 'me'), sessionId: 'local', username: NAME_RE.test(NET.name || '') ? NET.name : 'Player', node: 'local' });
  const logger = { info() { }, debug() { }, warn: (...a) => console.warn('[local room]', ...a), error: (...a) => console.error('[local room]', ...a) };
  async function start() {
    if (R) return R; if (starting) return starting;
    starting = (async () => {
      const load = (await import('./room-module.js')).default, nk = runtime(), reg = {};
      const initializer = new Proxy({}, { get: (_, n) => (a, b) => { if (n === 'registerMatch') reg[a] = b; } });
      load()({ env: {} }, logger, nk, initializer);
      const H = reg.pw_room, init = H.matchInit({}, logger, nk, { sid: NET.server || 'local' }), P = me();
      const M = { H, nk, state: init.state, tick: 0, queue: [] };
      M.dispatcher = {
        broadcastMessage(op, data, to) {
          if (to && to.length && !to.some(p => p.sessionId === 'local')) return;
          const ev = EVENTS[op]; if (!ev) return; let d; try { d = JSON.parse(data); } catch (e) { return; }
          if (op === 50) inWorld = true; else if (op === 51 && d.door) inWorld = false;
          emit(ev, d);
        },
        matchKick() { }, matchLabelUpdate() { },
      };
      const a = H.matchJoinAttempt({}, logger, nk, M.dispatcher, 0, M.state, P, { s: skin, p: JSON.stringify(pack(last)) });
      if (!a.accept) throw new Error(a.rejectMessage || 'the local room said no');
      M.state = H.matchJoin({}, logger, nk, M.dispatcher, 0, a.state, [P]).state;
      M.timer = setInterval(() => {
        M.tick++; const msgs = M.queue.splice(0);
        try { const out = H.matchLoop({}, logger, nk, M.dispatcher, M.tick, M.state, msgs); if (out) M.state = out.state; } catch (e) { logger.error(e); }
      }, 1000 / (init.tickRate || 10));
      return (R = M);
    })();
    try { return await starting; } finally { starting = null; }
  }
  const send = (op, o) => { if (R) R.queue.push({ sender: me(), opCode: op, data: JSON.stringify(o), reliable: true }); };
  return {
    ready: () => !!NET.server,
    async join(g) { try { await start(); send(OP.STATE, { p: pack(last), s: skin }); send(OP.GAME_JOIN, { g: String(g) }); } catch (e) { logger.error(e); emit('game:out', { g: String(g), err: 'That garage couldn\'t open here. Try again.' }); } },
    leave() { send(OP.GAME_LEAVE, {}); },
    act(a, o = {}) { send(OP.GAME_ACT, { ...o, a: String(a) }); },
    state(st, sk) { last = st; if (sk) skin = sk; if (R) send(OP.STATE, sk ? { p: pack(st), s: sk } : { p: pack(st) }); },
    stop() { if (R) { clearInterval(R.timer); R = null; } inWorld = false; },
    get inWorld() { return inWorld; },
  };
}
