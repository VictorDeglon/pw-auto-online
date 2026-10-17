// Poway Automobile Online: the Nakama server module (Nakama 3.x JavaScript runtime, ES2015).
//
// What lives here, and why it lives on the server: anything competitive has to be decided where a modified browser
// can't touch it.
//   rooms        one authoritative match per server (silverwood, elysium, ...). Players send their state; the match
//                relays positions 10 times a second, checks every hit (range, weapon damage, a damage-per-second cap)
//                and owns everyone's health, so kills and deaths are real.
//   progress     level, XP, skill points and skills, lifetime kills and deaths, daily challenges. Stored per player
//                (storage: progress/stats), readable by its owner, writable only from here.
//   leaderboards all-time K/D (kd_alltime), weekly kills (kills_weekly), level (level_alltime), written only here.
//   saves        the game's own save (money, garage, achievements, settings) is the player's: they write it
//                (storage: save/game) from the client; see src/online/cloud.js.
// Nakama runs this file with goja: registered functions must be top-level function declarations (no inline
// functions passed to register*), and match state must stay plain data.

var SERVERS = ['silverwood', 'elysium', 'asgard', 'avalon', 'vaeloria']; // must match src/online/config.js
var MAX_PLAYERS = 20, TICK_RATE = 10, EMPTY_TICKS = TICK_RATE * 600; // a room with nobody in it closes after 10 minutes
var OP = {
  STATE: 1, HIT: 2, HP: 3, RESPAWN: 4, CHAT: 5, FEED: 6, EVENT: 7, RUIN: 8, CROWD: 9, CROWD_CLEAR: 10, SKIN: 11,
  SNAP: 20, ROSTER: 21, JOIN: 22, LEAVE: 23, HPSET: 24, CHAT_OUT: 25, FEED_OUT: 26, EVENT_OUT: 27, RUIN_OUT: 28, CROWD_OUT: 29,
  CROWD_GONE: 30, STATS: 31, SNAPTO: 32, WELCOME: 33, ANNOUNCE: 34, PLAYER: 35,
};

// ---------------------------------------------------------------- the rules of a fair fight (from server/server.js)
// per hit: the most a weapon can do with every shop upgrade (+45%), and how far it reaches (m, with slack for lag)
var WEAPON_RULES = {
  fists: [26, 8], pistol: [70, 200], 'micro smg': [40, 160], 'pump shotgun': [45, 70], 'assault rifle': [60, 260], 'sniper rifle': [420, 760],
  minigun: [45, 220], 'rocket launcher': [260, 900], 'grenade launcher': [260, 500], grenades: [260, 120], 'sticky bombs': [260, 400],
  'airstrike flare': [300, 600], car: [260, 40],
};
var DPS_CAP = 1300, HEAL_EVERY = 20e3, REGEN_PER_S = 4, TP_EVERY = 15e3, MAX_SPEED = 220, ASSIST_MS = 10e3, RUIN_MS = 120e3;

// ---------------------------------------------------------------- progression
var SKILLS = [ // per rank; rank n costs n skill points; req = [skill, rank] needed first
  { tree: 'drive', id: 'engine', name: 'Tuned Engine', desc: '+4% top speed and acceleration per rank', max: 5 },
  { tree: 'drive', id: 'grip', name: 'Track Tires', desc: '+6% steering per rank', max: 3 },
  { tree: 'drive', id: 'plating', name: 'Reinforced Frame', desc: 'Cars you drive take 8% less damage per rank', max: 5 },
  { tree: 'drive', id: 'nitro', name: 'Nitrous', desc: 'Hold Shift while driving for a boost: 1 s of nitro per rank, refills over time', max: 3, req: ['engine', 2] },
  { tree: 'drive', id: 'mechanic', name: 'Road Mechanic', desc: 'The car you drive slowly repairs itself', max: 3, req: ['plating', 2] },
  { tree: 'combat', id: 'damage', name: 'Marksman', desc: '+4% weapon damage per rank', max: 5 },
  { tree: 'combat', id: 'steady', name: 'Steady Hands', desc: '-10% bullet spread per rank', max: 3 },
  { tree: 'combat', id: 'trigger', name: 'Quick Trigger', desc: '+5% fire rate per rank', max: 3, req: ['steady', 1] },
  { tree: 'combat', id: 'mags', name: 'Deep Pockets', desc: '+15% ammo you can carry per rank', max: 3 },
  { tree: 'combat', id: 'hunter', name: 'Bounty Hunter', desc: '+20% XP for player kills per rank', max: 3, req: ['damage', 3] },
  { tree: 'survival', id: 'tough', name: 'Thick Skin', desc: 'Take 5% less damage per rank', max: 5 },
  { tree: 'survival', id: 'regen', name: 'Second Wind', desc: 'Out of a fight you heal faster and further: +15 health and +50% speed per rank', max: 3 },
  { tree: 'survival', id: 'runner', name: 'Cardio', desc: '+5% running speed per rank', max: 3 },
  { tree: 'survival', id: 'lowkey', name: 'Low Profile', desc: 'Your wanted level cools down 15% faster per rank', max: 3, req: ['runner', 1] },
  { tree: 'survival', id: 'comeback', name: 'Comeback', desc: 'Respawn with a damage shield: 1.5 s per rank', max: 3, req: ['tough', 2] },
];
var TITLES = [[1, 'Rookie'], [5, 'Joyrider'], [10, 'Street Racer'], [15, 'Wheelman'], [20, 'Enforcer'], [30, 'Hitman'], [40, 'Kingpin'],
  [50, 'Legend of Poway'], [75, 'Untouchable'], [100, 'Poway Immortal']];
var DAILY_POOL = [
  { id: 'kills5', name: 'Five Down', desc: 'Get 5 player kills online', stat: 'kills', goal: 5, xp: 300 },
  { id: 'kills10', name: 'Double Digits', desc: 'Get 10 player kills online', stat: 'kills', goal: 10, xp: 600 },
  { id: 'streak3', name: 'On a Roll', desc: 'Get a 3-kill streak', stat: 'streak', goal: 3, xp: 400 },
  { id: 'bounty1', name: 'Collector', desc: 'Take down a player who has a bounty', stat: 'bounty', goal: 1, xp: 500 },
  { id: 'online20', name: 'Regular', desc: 'Play 20 minutes online', stat: 'mins', goal: 20, xp: 250 },
  { id: 'alive10', name: 'Hard to Kill', desc: 'Stay alive 10 minutes in a row online', stat: 'alive', goal: 10, xp: 400 },
];
var MAX_LEVEL = 100, KD_MIN_FIGHTS = 10, KILL_XP = 100, BOUNTY_STREAK = 5;
var BOARD = { kd: 'kd_alltime', kills_week: 'kills_weekly', level: 'level_alltime' };

function needFor(lvl) { return 200 + 80 * lvl; } // XP from this level to the next
function titleFor(lvl) { var t = TITLES[0][1]; for (var i = 0; i < TITLES.length; i++) if (lvl >= TITLES[i][0]) t = TITLES[i][1]; return t; }
function today() { return new Date().toISOString().slice(0, 10); }
function dayNumber() { return Math.floor(Date.now() / 86400000); }
function dailyFor(day) { // the same three challenges for everyone, a new set every UTC day
  var ids = DAILY_POOL.map(function (c) { return c.id; }), s = day * 2654435761 % 4294967296;
  for (var i = ids.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) % 2147483648; var j = s % (i + 1), t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
  return ids.slice(0, 3);
}
function blankProgress() { return { v: 1, lvl: 1, xp: 0, total: 0, sp: 0, skills: {}, kills: 0, deaths: 0, best: 0, mins: 0, ach: {}, missions: {}, daily: null, respec: '' }; }
function normalize(p) {
  var b = blankProgress(); for (var k in b) if (p[k] === undefined || p[k] === null) p[k] = b[k];
  var d = today(); if (!p.daily || p.daily.day !== d) p.daily = { day: d, prog: {}, done: {} };
  return p;
}
function rank(p, id) { return (p && p.skills && p.skills[id]) | 0; }
function addXp(p, n, ev) {
  n = Math.max(0, Math.round(n)); if (!n) return;
  p.xp += n; p.total += n; ev.push({ k: 'xp', n: n });
  while (p.lvl < MAX_LEVEL && p.xp >= needFor(p.lvl)) {
    p.xp -= needFor(p.lvl); p.lvl++; var pts = p.lvl % 10 === 0 ? 2 : 1; p.sp += pts;
    ev.push({ k: 'level', lvl: p.lvl, sp: pts, title: titleFor(p.lvl), cash: 250 * p.lvl });
  }
  if (p.lvl >= MAX_LEVEL) p.xp = 0;
}
function dailyBump(p, stat, value, isMax, ev) { // count toward today's challenges; a finished one pays its XP once
  var d = p.daily, ids = dailyFor(dayNumber());
  d.prog[stat] = isMax ? Math.max(d.prog[stat] || 0, value) : (d.prog[stat] || 0) + value;
  for (var i = 0; i < ids.length; i++) {
    var c = DAILY_POOL.filter(function (x) { return x.id === ids[i]; })[0];
    if (!c || c.stat !== stat || d.done[c.id] || d.prog[stat] < c.goal) continue;
    d.done[c.id] = true; ev.push({ k: 'challenge', id: c.id, name: c.name, xp: c.xp }); addXp(p, c.xp, ev);
  }
}

// progress lives in storage (progress/stats): read-modify-write with the object version, retried on a conflict
function readProgress(nk, uid) {
  var r = nk.storageRead([{ collection: 'progress', key: 'stats', userId: uid }]);
  return r && r.length ? { value: normalize(r[0].value), version: r[0].version } : { value: normalize(blankProgress()), version: '*' };
}
function updateProgress(nk, logger, uid, fn) {
  for (var i = 0; i < 4; i++) {
    var cur = readProgress(nk, uid), ev = [], out = fn(cur.value, ev);
    try {
      nk.storageWrite([{ collection: 'progress', key: 'stats', userId: uid, value: cur.value, version: cur.version, permissionRead: 1, permissionWrite: 0 }]);
      return { p: cur.value, ev: ev, out: out };
    } catch (e) { if (i === 3) { logger.error('progress write for %s failed: %s', uid, e.message || e); throw e; } }
  }
}
function postBoards(nk, logger, uid, name, p, killsAdded) {
  try {
    var fights = p.kills + p.deaths;
    if (fights >= KD_MIN_FIGHTS) nk.leaderboardRecordWrite(BOARD.kd, uid, name, Math.round(p.kills / Math.max(1, p.deaths) * 1000), p.kills, { k: p.kills, d: p.deaths, lvl: p.lvl, title: titleFor(p.lvl) });
    nk.leaderboardRecordWrite(BOARD.level, uid, name, p.total, p.lvl, { lvl: p.lvl, title: titleFor(p.lvl) });
    if (killsAdded) nk.leaderboardRecordWrite(BOARD.kills_week, uid, name, killsAdded, 0, { lvl: p.lvl });
  } catch (e) { logger.warn('leaderboard write for %s: %s', uid, e.message || e); }
}
function publicProgress(p, name) {
  var ids = dailyFor(dayNumber());
  return {
    name: name, lvl: p.lvl, xp: p.xp, need: p.lvl >= MAX_LEVEL ? 0 : needFor(p.lvl), total: p.total, sp: p.sp, skills: p.skills, title: titleFor(p.lvl),
    kills: p.kills, deaths: p.deaths, kd: Math.round(p.kills / Math.max(1, p.deaths) * 100) / 100, best: p.best, mins: p.mins, respecToday: p.respec === today(),
    daily: ids.map(function (id) { var c = DAILY_POOL.filter(function (x) { return x.id === id; })[0]; return { id: c.id, name: c.name, desc: c.desc, goal: c.goal, xp: c.xp, prog: Math.min(c.goal, p.daily.prog[c.stat] || 0), done: !!p.daily.done[c.id] }; }),
  };
}

// ---------------------------------------------------------------- RPCs
function parse(payload) { try { return payload ? JSON.parse(payload) : {}; } catch (e) { throw Error('bad payload'); } }
function userName(nk, uid) { try { var a = nk.accountGetId(uid); return a.user.username; } catch (e) { return ''; } }
function needUser(ctx) { if (!ctx.userId) throw Error('sign in first'); } // server-to-server calls (http key) have no player

function rpcProfile(ctx, logger, nk, payload) {
  needUser(ctx);
  var cur = readProgress(nk, ctx.userId);
  return JSON.stringify({ me: publicProgress(cur.value, ctx.username), skills: SKILLS, titles: TITLES });
}
function rpcSkillBuy(ctx, logger, nk, payload) {
  needUser(ctx);
  var id = String(parse(payload).id || ''), s = SKILLS.filter(function (x) { return x.id === id; })[0];
  if (!s) throw Error('unknown skill');
  var r = updateProgress(nk, logger, ctx.userId, function (p) {
    var have = rank(p, id); if (have >= s.max) throw Error('already maxed');
    if (s.req && rank(p, s.req[0]) < s.req[1]) throw Error('needs ' + s.req[0] + ' ' + s.req[1]);
    var cost = have + 1; if (p.sp < cost) throw Error('not enough skill points');
    p.sp -= cost; p.skills[id] = have + 1;
  });
  return JSON.stringify({ me: publicProgress(r.p, ctx.username) });
}
function rpcSkillReset(ctx, logger, nk, payload) { // one free respec a day: every point comes back
  needUser(ctx);
  var r = updateProgress(nk, logger, ctx.userId, function (p) {
    if (p.respec === today()) throw Error('one reset a day');
    var back = 0; for (var k in p.skills) for (var n = 1; n <= p.skills[k]; n++) back += n;
    p.sp += back; p.skills = {}; p.respec = today();
  });
  return JSON.stringify({ me: publicProgress(r.p, ctx.username) });
}
// the game's 30 achievements (src/ui/achievements.js): only these pay XP, once each
var ACH_IDS = ['first-wheels', 'autobiography', 'joyride', 'ludicrous', 'air-time', 'frequent-flyer', 'fender-bender', 'demolition-derby',
  'chain-reaction', 'urban-renewal', 'wrecking-crew', 'lumberjack', 'lights-out', 'five-stars', 'slippery', 'busted', 'wasted', 'shopper',
  'fully-loaded', 'arsenal', 'courier', 'tourist', 'collector', 'pimp', 'sharpshooter', 'social', 'hopper', 'rival', 'night-owl', 'dancer'];
function rpcClaim(ctx, logger, nk, payload) { // achievements once each, missions once per mission per day
  needUser(ctx);
  var q = parse(payload), kind = q.kind === 'mission' ? 'mission' : 'ach', id = String(q.id || '');
  if (kind === 'ach' ? ACH_IDS.indexOf(id) < 0 : !/^(story|job):[a-zA-Z0-9_-]{1,30}$/.test(id)) throw Error('bad id');
  var r = updateProgress(nk, logger, ctx.userId, function (p, ev) {
    if (kind === 'ach') { if (p.ach[id]) return false; p.ach[id] = 1; addXp(p, 150, ev); return true; }
    var key = today() + ':' + id; if (p.missions[key]) return false;
    var n = 0; for (var k in p.missions) if (k.slice(0, 10) === today()) n++; if (n >= 25) return false;
    for (var k2 in p.missions) if (k2.slice(0, 10) !== today()) delete p.missions[k2];
    p.missions[key] = 1; addXp(p, 250, ev); return true;
  });
  if (r.out) postBoards(nk, logger, ctx.userId, ctx.username, r.p, 0);
  return JSON.stringify({ ok: !!r.out, ev: r.ev, me: publicProgress(r.p, ctx.username) });
}
function rpcLeaderboard(ctx, logger, nk, payload) {
  var q = parse(payload), id = BOARD[q.board] || BOARD.kd, limit = Math.max(1, Math.min(50, q.limit | 0 || 10));
  var res = nk.leaderboardRecordsList(id, ctx.userId ? [ctx.userId] : [], limit, '', 0);
  function row(r) { var m = r.metadata || {}; return { rank: r.rank, name: r.username, score: r.score, sub: r.subscore, k: m.k, d: m.d, lvl: m.lvl, title: m.title }; }
  return JSON.stringify({ board: q.board || 'kd', rows: (res.records || []).map(row), mine: (res.ownerRecords || []).map(row)[0] || null, t: Date.now() });
}
// each server's room id lives in storage (rooms/ids, server-only), claimed with a version check, so two players picking
// the same empty server at the same moment land in one room. (The match listing lags about a second behind.)
var SYSTEM_USER = '00000000-0000-0000-0000-000000000000';
function roomIds(nk) {
  var r = nk.storageRead([{ collection: 'rooms', key: 'ids', userId: SYSTEM_USER }]);
  return r && r.length ? { v: r[0].value, version: r[0].version } : { v: {}, version: '*' };
}
function liveRoom(nk, id) { if (!id) return null; try { return nk.matchGet(id) || null; } catch (e) { return null; } }
function roomFor(nk, logger, sid) {
  for (var i = 0; i < 4; i++) {
    var cur = roomIds(nk), m = liveRoom(nk, cur.v[sid]); if (m) return m;
    var id = nk.matchCreate('pw_room', { sid: sid }); cur.v[sid] = id;
    try {
      nk.storageWrite([{ collection: 'rooms', key: 'ids', userId: SYSTEM_USER, value: cur.v, version: cur.version, permissionRead: 0, permissionWrite: 0 }]);
      logger.info('opened room %s (%s)', sid, id); return { matchId: id, size: 0 };
    } catch (e) { /* another player registered a room for this server at the same moment: use theirs; ours closes empty */ }
  }
  throw Error('Could not open that server. Try again.');
}
function rpcRooms(ctx, logger, nk, payload) {
  var ids = roomIds(nk).v, counts = {};
  SERVERS.forEach(function (s) { var m = liveRoom(nk, ids[s]); counts[s] = m ? m.size : 0; });
  return JSON.stringify({ counts: counts, t: Date.now(), max: MAX_PLAYERS });
}
function rpcRoomJoin(ctx, logger, nk, payload) {
  needUser(ctx);
  var sid = String(parse(payload).sid || ''); if (SERVERS.indexOf(sid) < 0) throw Error('unknown server');
  var m = roomFor(nk, logger, sid);
  if (m.size >= MAX_PLAYERS) throw Error('That server is full.');
  return JSON.stringify({ match: m.matchId, t: Date.now() });
}
function rpcTime(ctx, logger, nk, payload) { return JSON.stringify({ t: Date.now() }); }

// ---------------------------------------------------------------- what the public API allows
// Nakama's API can do much more than this game uses. These hooks keep it to what the client actually calls.
// usernames are names in the world: 3 to 16 letters, numbers or underscores (on sign-up as well as on a rename)
var NAME_RE = /^[A-Za-z0-9_]{3,16}$/, NAME_MSG = 'Names are 3 to 16 letters, numbers or underscores.';
var MAIL_DOMAIN = '@players.pw-auto-online.invalid'; // src/online/net-nakama.js: the login email is <name>@this
var AUTH_PER_IP = 60, AUTH_WINDOW_S = 600; // sign-ins from one address per 10 minutes (a school's whole lab still fits)
var SAVE_MAX = 240000; // characters in one cloud save
function checkName(name) { if (name !== undefined && name !== null && name !== '' && !NAME_RE.test(name)) throw Error(NAME_MSG); }
function throttleAuth(ctx, nk) { // keyed by the player's address (the TLS front passes it on in X-Forwarded-For)
  var ip = ctx.clientIp || '';
  if (!ip || ip === '127.0.0.1' || ip === '::1') return; // a front that hides addresses would make everyone one address: don't lock them all out
  var key = 'auth:' + ip + ':' + Math.floor(Date.now() / (AUTH_WINDOW_S * 1000));
  var n = (nk.localcacheGet(key) || 0) + 1; nk.localcachePut(key, n, AUTH_WINDOW_S);
  if (n > AUTH_PER_IP) throw Error('Too many sign-ins from this network. Try again in a few minutes.');
}
function beforeUpdateAccount(ctx, logger, nk, data) { checkName(data.username); return data; }
function beforeAuthenticateDevice(ctx, logger, nk, data) { throttleAuth(ctx, nk); checkName(data.username); return data; }
function beforeAuthenticateEmail(ctx, logger, nk, data) { // signing in only: accounts start as guests and add a password later
  throttleAuth(ctx, nk);
  if (data.create !== false) throw Error('Sign in with an existing name and password.');
  return data;
}
function beforeLinkEmail(ctx, logger, nk, data) { // the login email has to be this account's own name, so nobody squats another name's login
  var name = userName(nk, ctx.userId), email = String((data && data.email) || '').toLowerCase();
  if (!name || email !== name.toLowerCase() + MAIL_DOMAIN) throw Error('Pick your name first, then save it with a password.');
  return data;
}
function beforeWriteStorage(ctx, logger, nk, data) { // players write one thing: their own save (save/game), of a sane size
  var objs = (data && data.objects) || [];
  for (var i = 0; i < objs.length; i++) {
    var o = objs[i];
    if (o.collection !== 'save' || o.key !== 'game') throw Error('not writable');
    if (String(o.value || '').length > SAVE_MAX) throw Error('That save is too big.');
  }
  return objs.length <= 1 ? data : null;
}
function beforeDeleteStorage(ctx, logger, nk, data) {
  var ids = (data && data.objectIds) || [];
  for (var i = 0; i < ids.length; i++) if (ids[i].collection !== 'save' || ids[i].key !== 'game') throw Error('not deletable');
  return data;
}
function refuse(ctx, logger, nk, data) { return null; } // features the game doesn't use: custom auth, groups, friends, chat channels, relayed matches, parties, matchmaker

// ---------------------------------------------------------------- the room (authoritative match)
function str(nk, data) { try { return typeof data === 'string' ? data : nk.binaryToString(data); } catch (e) { return ''; } }
function send(dispatcher, op, obj, to) { if (dispatcher) dispatcher.broadcastMessage(op, JSON.stringify(obj), to || null, null, true); }
function rosterEntry(P) { return { id: P.uid, n: P.name, s: P.skin, lvl: P.lvl, title: P.title, sk: P.sk, sd: P.sd, streak: P.streak, bounty: P.streak >= BOUNTY_STREAK ? 1 : 0, p: P.p }; }
function others(state, P) { var a = []; for (var k in state.players) if (k !== P.uid) a.push(state.players[k].presence); return a; }
function allPresences(state) { var a = []; for (var k in state.players) a.push(state.players[k].presence); return a; }
function feedOut(dispatcher, state, k, o) { o.k = k; o.t = Date.now(); send(dispatcher, OP.FEED_OUT, o); }
function statsTo(dispatcher, P, r) {
  var me = r ? publicProgress(r.p, P.name) : null;
  send(dispatcher, OP.STATS, { sk: P.sk, sd: P.sd, streak: P.streak, ev: r ? r.ev : [], me: me }, [P.presence]);
}
function playerChanged(dispatcher, state, P) { send(dispatcher, OP.PLAYER, rosterEntry(P)); }

function matchInit(ctx, logger, nk, params) {
  var sid = String(params.sid || 'silverwood');
  return { state: { sid: sid, players: {}, ruins: {}, crowds: {}, pending: {}, empty: 0 }, tickRate: TICK_RATE, label: JSON.stringify({ sid: sid }) };
}
function matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  var n = 0; for (var k in state.players) if (k !== presence.userId) n++;
  if (n >= MAX_PLAYERS) return { state: state, accept: false, rejectMessage: 'That server is full.' };
  if (!/^[A-Za-z0-9_]{3,16}$/.test(presence.username)) return { state: state, accept: false, rejectMessage: 'Pick a name first.' };
  state.pending[presence.userId] = metadata || {}; // skin and starting position, so everyone gets them with the join
  return { state: state, accept: true };
}
function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
  for (var i = 0; i < presences.length; i++) {
    var pr = presences[i], old = state.players[pr.userId];
    if (old && old.presence.sessionId !== pr.sessionId) dispatcher.matchKick([old.presence]); // joined again from somewhere else
    var prog = readProgress(nk, pr.userId).value;
    var P = {
      uid: pr.userId, name: pr.username, presence: pr, skin: '', p: null, at: 0, hp: 100, dead: false, lastTp: 0, lastHeal: 0, hpAt: Date.now(),
      dmgWin: [], lastHitBy: null, lastHitAt: 0, sk: 0, sd: 0, streak: 0, lvl: prog.lvl, title: titleFor(prog.lvl), skills: prog.skills || {},
      shieldUntil: 0, aliveSince: Date.now(), minsBank: 0, msgN: 0, msgWin: 0, chatAt: 0, joinedAt: Date.now(),
    };
    var md = state.pending[pr.userId] || {}; delete state.pending[pr.userId];
    if (typeof md.s === 'string') P.skin = md.s.slice(0, 40);
    try { var p0 = md.p ? JSON.parse(md.p) : null; if (p0 && isFinite(p0.x) && isFinite(p0.z)) { p0.h = 100; p0.d = 0; P.p = p0; P.at = Date.now(); P.dirty = true; } } catch (e) { }
    state.players[pr.userId] = P;
    var roster = []; for (var k in state.players) if (k !== P.uid) roster.push(rosterEntry(state.players[k]));
    var ruins = []; for (var ri in state.ruins) ruins.push(state.ruins[ri]);
    var crowds = []; for (var ci in state.crowds) if (ci !== P.uid) crowds.push({ id: ci, e: state.crowds[ci].e, t: state.crowds[ci].t });
    send(dispatcher, OP.WELCOME, { t: Date.now(), sid: state.sid, you: rosterEntry(P), roster: roster, ruins: ruins, crowds: crowds }, [pr]);
    var o = others(state, P); if (o.length) send(dispatcher, OP.JOIN, rosterEntry(P), o);
    feedOut(dispatcher, state, 'join', { u: P.uid, a: P.name });
    logger.info('+ %s on %s', P.name, state.sid);
  }
  state.empty = 0;
  return { state: state };
}
function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
  for (var i = 0; i < presences.length; i++) {
    var P = state.players[presences[i].userId]; if (!P || P.presence.sessionId !== presences[i].sessionId) continue;
    // leaving in the middle of a fight counts as a death, and the kill goes to whoever was shooting
    if (!P.dead && P.lastHitBy && Date.now() - P.lastHitAt < ASSIST_MS && state.players[P.lastHitBy]) killed(nk, logger, dispatcher, state, P, state.players[P.lastHitBy], 'rage quit');
    flushMinutes(nk, logger, null, state, P, true);
    delete state.players[P.uid]; delete state.crowds[P.uid];
    send(dispatcher, OP.LEAVE, { id: P.uid }); send(dispatcher, OP.CROWD_GONE, { id: P.uid });
    feedOut(dispatcher, state, 'leave', { u: P.uid, a: P.name });
    logger.info('- %s from %s', P.name, state.sid);
  }
  return { state: state };
}

function onState(dispatcher, state, P, q) {
  var p = q.p; if (!p || typeof p.x !== 'number' || typeof p.z !== 'number' || !isFinite(p.x) || !isFinite(p.z)) return;
  var now = Date.now();
  if (P.p) {
    var d = Math.hypot(p.x - P.p.x, p.z - P.p.z), dt = Math.max(0.05, (now - P.at) / 1000);
    if (d / dt > MAX_SPEED && d > 30) { // a teleport: one every 15 s (fast travel, respawn), otherwise you go back
      if (now - P.lastTp < TP_EVERY && !P.dead) { send(dispatcher, OP.SNAPTO, { x: P.p.x, y: P.p.y, z: P.p.z }, [P.presence]); return; }
      P.lastTp = now;
    }
  }
  p.h = P.hp; p.d = P.dead ? (p.d || 1) : 0; // health in the relayed state is the room's, not the browser's
  P.p = p; P.at = now; P.dirty = true;
  if (q.s !== undefined && typeof q.s === 'string' && q.s !== P.skin) { P.skin = q.s.slice(0, 40); playerChanged(dispatcher, state, P); }
}
function onHit(nk, logger, dispatcher, state, P, q) {
  var V = state.players[String(q.v || '')]; if (!V || V === P || V.dead || P.dead || !V.p || !P.p) return;
  var now = Date.now(); if (now < V.shieldUntil) return;
  var w = String(q.w || 'fists').toLowerCase(), rule = WEAPON_RULES[w] || [60, 200];
  var cap = rule[0] * (1 + 0.04 * rank(P, 'damage')), dmg = Math.max(0, Math.min(cap, +q.d || 0)); if (!dmg) return;
  if (Math.hypot(V.p.x - P.p.x, V.p.z - P.p.z) > rule[1]) return;
  P.dmgWin = P.dmgWin.filter(function (e) { return now - e[0] < 1000; });
  var recent = 0; for (var i = 0; i < P.dmgWin.length; i++) recent += P.dmgWin[i][1];
  if (recent + dmg > DPS_CAP) return; P.dmgWin.push([now, dmg]);
  dmg *= 1 - 0.05 * rank(V, 'tough');
  V.hp = Math.max(0, V.hp - dmg); V.hpAt = now; V.lastHitBy = P.uid; V.lastHitAt = now;
  send(dispatcher, OP.HPSET, { h: Math.round(V.hp), by: P.name, w: q.w || '', d: Math.round(dmg) }, [V.presence]);
  if (V.hp <= 0) killed(nk, logger, dispatcher, state, V, P, q.w || '');
}
function onOwnHealth(nk, logger, dispatcher, state, P, q) { // cops, falls, their own explosions: down is fine; up is rate limited
  var h = Math.max(0, Math.min(100, +q.h || 0)), now = Date.now();
  if (P.dead) return;
  if (h < P.hp) {
    P.hp = h; P.hpAt = now;
    if (h <= 0) { var K = P.lastHitBy && now - P.lastHitAt < ASSIST_MS ? state.players[P.lastHitBy] : null; killed(nk, logger, dispatcher, state, P, K || null, K ? '' : String(q.cause || '').slice(0, 16)); }
    return;
  }
  var allowed = P.hp + (now - P.hpAt) / 1000 * REGEN_PER_S * (1 + 0.5 * rank(P, 'regen'));
  if (h <= allowed) { P.hp = h; P.hpAt = now; return; }
  if (now - P.lastHeal > HEAL_EVERY) { P.hp = h; P.hpAt = now; P.lastHeal = now; return; } // a health pickup
  send(dispatcher, OP.HPSET, { h: Math.round(P.hp) }, [P.presence]); // refused: here's what you really have
}
function killed(nk, logger, dispatcher, state, V, K, weapon) {
  var now = Date.now(), wasBounty = V.streak >= BOUNTY_STREAK, aliveMin = (now - V.aliveSince) / 60000;
  V.dead = true; V.hp = 0; V.sd++; V.streak = 0; V.lastHitBy = null;
  var rv = updateProgress(nk, logger, V.uid, function (p, ev) { p.deaths++; dailyBump(p, 'alive', Math.floor(aliveMin), true, ev); });
  postBoards(nk, logger, V.uid, V.name, rv.p, 0);
  statsTo(dispatcher, V, rv); playerChanged(dispatcher, state, V);
  if (!K || K === V) { feedOut(dispatcher, state, 'death', { u: V.uid, a: V.name, b: weapon || '' }); return; }
  K.sk++; K.streak++;
  var streak = K.streak;
  var rk = updateProgress(nk, logger, K.uid, function (p, ev) {
    p.kills++; p.best = Math.max(p.best, streak);
    var xp = KILL_XP * (1 + 0.2 * rank(p, 'hunter')) * (wasBounty ? 1.5 : 1) + (streak === 3 ? 50 : streak === 5 ? 150 : streak === 10 ? 400 : streak > 10 && streak % 5 === 0 ? 300 : 0);
    addXp(p, xp, ev);
    dailyBump(p, 'kills', 1, false, ev); dailyBump(p, 'streak', streak, true, ev); if (wasBounty) dailyBump(p, 'bounty', 1, false, ev);
  });
  K.lvl = rk.p.lvl; K.title = titleFor(K.lvl); K.skills = rk.p.skills || {};
  postBoards(nk, logger, K.uid, K.name, rk.p, 1);
  statsTo(dispatcher, K, rk); playerChanged(dispatcher, state, K);
  feedOut(dispatcher, state, 'kill', { u: K.uid, a: K.name, b: V.name, w: String(weapon || '').slice(0, 24) });
  if (wasBounty) send(dispatcher, OP.ANNOUNCE, { m: K.name + ' collected the bounty on ' + V.name + '.' });
  if (streak === BOUNTY_STREAK) send(dispatcher, OP.ANNOUNCE, { m: K.name + ' is on a ' + streak + '-kill streak. Bounty on their head.', bounty: K.uid });
  else if (streak === 3 || (streak > BOUNTY_STREAK && streak % 5 === 0)) send(dispatcher, OP.ANNOUNCE, { m: K.name + ' is on a ' + streak + '-kill streak.' });
}
function onRespawn(dispatcher, state, P) {
  if (!P.dead) return; var now = Date.now();
  P.dead = false; P.hp = 100; P.hpAt = now; P.lastHeal = now; P.lastTp = 0; P.aliveSince = now;
  P.shieldUntil = now + 1500 * rank(P, 'comeback');
  send(dispatcher, OP.HPSET, { h: 100 }, [P.presence]);
}
function flushMinutes(nk, logger, dispatcher, state, P, force) { // time online: daily challenge minutes, and 25 XP per 5 minutes
  var mins = Math.floor((Date.now() - P.joinedAt) / 60000) - P.minsBank; if (mins < (force ? 1 : 5)) return;
  P.minsBank += mins;
  try {
    var alive = P.dead ? 0 : Math.floor((Date.now() - P.aliveSince) / 60000), was = P.lvl;
    var r = updateProgress(nk, logger, P.uid, function (p, ev) { p.mins += mins; dailyBump(p, 'mins', mins, false, ev); if (alive) dailyBump(p, 'alive', alive, true, ev); addXp(p, 5 * mins, ev); });
    P.lvl = r.p.lvl; P.title = titleFor(P.lvl); P.skills = r.p.skills || {}; postBoards(nk, logger, P.uid, P.name, r.p, 0);
    if (!force) { statsTo(dispatcher, P, r); if (P.lvl !== was) playerChanged(dispatcher, state, P); }
  } catch (e) { logger.warn('minutes for %s: %s', P.uid, e.message || e); }
}

function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
  var now = Date.now();
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i], P = state.players[m.sender.userId]; if (!P || P.presence.sessionId !== m.sender.sessionId) continue;
    if (now - P.msgWin > 1000) { P.msgWin = now; P.msgN = 0; } if (++P.msgN > 60) continue; // flood guard
    var raw = str(nk, m.data); if (raw.length > 14000) continue;
    var q; try { q = JSON.parse(raw || '{}'); } catch (e) { continue; }
    switch (m.opCode) {
      case OP.STATE: onState(dispatcher, state, P, q); break;
      case OP.HIT: onHit(nk, logger, dispatcher, state, P, q); break;
      case OP.HP: onOwnHealth(nk, logger, dispatcher, state, P, q); break;
      case OP.RESPAWN: onRespawn(dispatcher, state, P); break;
      case OP.CHAT: {
        var text = String(q.m || '').replace(/\s+/g, ' ').trim().slice(0, 160); if (!text || now - P.chatAt < 700) break;
        P.chatAt = now; send(dispatcher, OP.CHAT_OUT, { u: P.uid, n: P.name, m: text, t: now }); break;
      }
      case OP.FEED: if (q.k === 'busted' || q.k === 'wreck') feedOut(dispatcher, state, q.k, { u: P.uid, a: P.name, b: String(q.b || '').slice(0, 16) }); break;
      case OP.EVENT: { q.u = P.uid; q.t = now; var o = others(state, P); if (o.length) send(dispatcher, OP.EVENT_OUT, q, o); break; }
      case OP.RUIN: {
        var idx = q.i | 0; if (idx < 0) break; var ru = { i: idx, x: +q.x || 0, z: +q.z || 0, t: now, u: P.uid };
        state.ruins[idx] = ru; var o2 = others(state, P); if (o2.length) send(dispatcher, OP.RUIN_OUT, ru, o2); break;
      }
      case OP.CROWD: { var e = String(q.e || '').slice(0, 12000); state.crowds[P.uid] = { e: e, t: now }; var o3 = others(state, P); if (o3.length) send(dispatcher, OP.CROWD_OUT, { id: P.uid, e: e, t: now }, o3); break; }
      case OP.CROWD_CLEAR: delete state.crowds[P.uid]; send(dispatcher, OP.CROWD_GONE, { id: P.uid }); break;
      default: break;
    }
  }
  // 10 times a second: everyone's latest state to everyone (the client skips its own)
  var a = [], n = 0;
  for (var k in state.players) { var Q = state.players[k]; n++; if (Q.dirty && Q.p) { a.push([Q.uid, Q.p]); Q.dirty = false; } }
  if (a.length && n > 1) send(dispatcher, OP.SNAP, { t: now, a: a });
  if (tick % (TICK_RATE * 60) === 0) for (var k2 in state.players) flushMinutes(nk, logger, dispatcher, state, state.players[k2], false);
  for (var ri in state.ruins) if (now - state.ruins[ri].t > RUIN_MS) delete state.ruins[ri];
  if (!n) { if (++state.empty > EMPTY_TICKS) { logger.info('closing empty room %s', state.sid); return null; } } else state.empty = 0;
  return { state: state };
}
function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  for (var k in state.players) flushMinutes(nk, logger, null, state, state.players[k], true);
  return { state: state };
}
function matchSignal(ctx, logger, nk, dispatcher, tick, state, data) { return { state: state, data: '' }; }

// ---------------------------------------------------------------- start up
function InitModule(ctx, logger, nk, initializer) {
  function board(id, operator, reset) {
    try { nk.leaderboardCreate(id, true, 'descending', operator, reset, null, true); } catch (e) { logger.debug('leaderboard %s: %s', id, e.message || e); }
  }
  board(BOARD.kd, 'set', null);
  board(BOARD.level, 'set', null);
  board(BOARD.kills_week, 'increment', '0 0 * * 1'); // every Monday 00:00 UTC
  initializer.registerMatch('pw_room', { matchInit: matchInit, matchJoinAttempt: matchJoinAttempt, matchJoin: matchJoin, matchLeave: matchLeave, matchLoop: matchLoop, matchTerminate: matchTerminate, matchSignal: matchSignal });
  initializer.registerRpc('profile', rpcProfile);
  initializer.registerRpc('skill_buy', rpcSkillBuy);
  initializer.registerRpc('skill_reset', rpcSkillReset);
  initializer.registerRpc('claim', rpcClaim);
  initializer.registerRpc('leaderboard', rpcLeaderboard);
  initializer.registerRpc('rooms', rpcRooms);
  initializer.registerRpc('room_join', rpcRoomJoin);
  initializer.registerRpc('time', rpcTime);
  initializer.registerBeforeUpdateAccount(beforeUpdateAccount);
  initializer.registerBeforeAuthenticateDevice(beforeAuthenticateDevice);
  initializer.registerBeforeAuthenticateEmail(beforeAuthenticateEmail);
  initializer.registerBeforeLinkEmail(beforeLinkEmail);
  initializer.registerBeforeWriteStorageObjects(beforeWriteStorage);
  initializer.registerBeforeDeleteStorageObjects(beforeDeleteStorage);
  initializer.registerBeforeAuthenticateCustom(refuse);
  initializer.registerBeforeLinkCustom(refuse);
  initializer.registerBeforeCreateGroup(refuse);
  initializer.registerBeforeJoinGroup(refuse);
  initializer.registerBeforeAddFriends(refuse);
  initializer.registerRtBefore('ChannelJoin', refuse);
  initializer.registerRtBefore('MatchCreate', refuse);
  initializer.registerRtBefore('PartyCreate', refuse);
  initializer.registerRtBefore('MatchmakerAdd', refuse);
  logger.info('pw-auto-online module loaded: %d skills, %d rooms', SKILLS.length, SERVERS.length);
}
