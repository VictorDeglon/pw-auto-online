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
  STATE: 1, HIT: 2, HP: 3, RESPAWN: 4, CHAT: 5, FEED: 6, EVENT: 7, RUIN: 8, CROWD: 9, CROWD_CLEAR: 10, SKIN: 11, NPC_KILL: 12, TCAR_HIT: 13, TCAR_TAKE: 14,
  SNAP: 20, ROSTER: 21, JOIN: 22, LEAVE: 23, HPSET: 24, CHAT_OUT: 25, FEED_OUT: 26, EVENT_OUT: 27, RUIN_OUT: 28, CROWD_OUT: 29,
  CROWD_GONE: 30, STATS: 31, SNAPTO: 32, WELCOME: 33, ANNOUNCE: 34, PLAYER: 35, TRAFFIC: 36,
  GAME_JOIN: 41, GAME_LEAVE: 42, GAME_ACT: 43, GAME_IN: 50, GAME_OUT: 51, GAME_STATE: 52, GAME_EVENT: 53, GAME_BOARD: 54, // crew garages (13, 14 and 36 belong to the street traffic)
};

// ---------------------------------------------------------------- the rules of a fair fight (from server/server.js)
// per hit: the most a weapon can do with every shop upgrade (+45%), and how far it reaches (m, with slack for lag)
var WEAPON_RULES = {
  fists: [26, 8], pistol: [70, 200], 'micro smg': [40, 160], 'pump shotgun': [45, 70], 'assault rifle': [60, 260], 'sniper rifle': [420, 760],
  minigun: [45, 220], 'rocket launcher': [260, 900], 'grenade launcher': [260, 500], grenades: [260, 120], 'sticky bombs': [260, 400],
  'airstrike flare': [300, 600], car: [50, 40], // a car hit on a player: capped low, so being run over isn't instant death
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
// NPC kills count as kills too (people 20 XP, cops 40), but only in a room and at a human pace: the browser reports
// them, so the room takes at most one every 1.5 s and 20 a minute, and banks them for a few seconds before saving
var NPC_XP = 20, COP_XP = 40, NPC_GAP_MS = 1500, NPC_PER_MIN = 20, NPC_FLUSH_TICKS = TICK_RATE * 3;
var BOARD = { kd: 'kd_alltime', kills_week: 'kills_weekly', level: 'level_alltime', flight: 'flight_dist', race0: 'race_race0', race1: 'race_race1', race2: 'race_race2' };

function needFor(lvl) { return 200 + 80 * lvl; } // XP from this level to the next
function titleFor(lvl) { var t = TITLES[0][1]; for (var i = 0; i < TITLES.length; i++) if (lvl >= TITLES[i][0]) t = TITLES[i][1]; return t; }
function today() { return new Date().toISOString().slice(0, 10); }
function dayNumber() { return Math.floor(Date.now() / 86400000); }
function dailyFor(day) { // the same three challenges for everyone, a new set every UTC day
  var ids = DAILY_POOL.map(function (c) { return c.id; }), s = day * 2654435761 % 4294967296;
  for (var i = ids.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) % 2147483648; var j = s % (i + 1), t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
  return ids.slice(0, 3);
}
function blankProgress() { return { v: 1, lvl: 1, xp: 0, total: 0, sp: 0, skills: {}, kills: 0, npc: 0, deaths: 0, best: 0, mins: 0, ach: {}, missions: {}, daily: null, respec: '' }; }
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
    kills: p.kills, npc: p.npc | 0, deaths: p.deaths, kd: Math.round(p.kills / Math.max(1, p.deaths) * 100) / 100, best: p.best, mins: p.mins, respecToday: p.respec === today(),
    daily: ids.map(function (id) { var c = DAILY_POOL.filter(function (x) { return x.id === id; })[0]; return { id: c.id, name: c.name, desc: c.desc, goal: c.goal, xp: c.xp, prog: Math.min(c.goal, p.daily.prog[c.stat] || 0), done: !!p.daily.done[c.id] }; }),
  };
}

// ---------------------------------------------------------------- RPCs
function parse(payload) { try { return payload ? JSON.parse(payload) : {}; } catch (e) { throw Error('bad payload'); } }
function userName(nk, uid) { try { var a = nk.accountGetId(uid); return a.user.username; } catch (e) { return ''; } }
// who is in a room right now (this node's cache; refreshed every minute while they're there)
function markRoom(nk, uid, sid) { try { nk.localcachePut('room:' + uid, sid, 180); } catch (e) { } }
function leftRoom(nk, uid) { try { nk.localcacheDelete('room:' + uid); } catch (e) { } }
function inRoom(nk, uid) { try { return !!nk.localcacheGet('room:' + uid); } catch (e) { return false; } }
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
  if (!inRoom(nk, ctx.userId)) return JSON.stringify({ ok: false, offline: true, ev: [] }); // XP and levels come from online play only
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
    var cur = roomIds(nk), m = liveRoom(nk, cur.v[sid]); if (m) return { matchId: m.matchId || m.match_id || cur.v[sid], size: m.size || 0 };
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
  return JSON.stringify({ match: m.matchId || m.match_id, t: Date.now() });
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
function rosterEntry(P) { return { id: P.uid, n: P.name, s: P.skin, lvl: P.lvl, title: P.title, sk: P.sk, sd: P.sd, streak: P.streak, bounty: P.streak >= BOUNTY_STREAK ? 1 : 0, p: P.p, g: P.g || '' }; }
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
      npcAt: 0, npcWin: [], npcBank: 0, npcXp: 0,
    };
    var md = state.pending[pr.userId] || {}; delete state.pending[pr.userId];
    if (typeof md.s === 'string') P.skin = md.s.slice(0, 40);
    try { var p0 = md.p ? JSON.parse(md.p) : null; if (p0 && isFinite(p0.x) && isFinite(p0.z)) { p0.h = 100; p0.d = 0; P.p = p0; P.at = Date.now(); P.dirty = true; } } catch (e) { }
    if (!P.p) { P.p = { x: 0, y: 0, z: 0, r: 0, h: 100, d: 0 }; P.at = Date.now(); P.dirty = true; }
    state.players[pr.userId] = P; markRoom(nk, P.uid, state.sid);
    var roster = []; for (var k in state.players) if (k !== P.uid) roster.push(rosterEntry(state.players[k]));
    var ruins = []; for (var ri in state.ruins) ruins.push(state.ruins[ri]);
    var crowds = []; for (var ci in state.crowds) if (ci !== P.uid) crowds.push({ id: ci, e: state.crowds[ci].e, t: state.crowds[ci].t });
    send(dispatcher, OP.WELCOME, { t: Date.now(), sid: state.sid, you: rosterEntry(P), roster: roster, ruins: ruins, crowds: crowds, traffic: typeof ROADS !== 'undefined' }, [pr]); // traffic: the room runs the cars
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
    if (P.g) leaveGame(nk, logger, dispatcher, state, P);
    flushNpc(nk, logger, null, state, P); flushMinutes(nk, logger, null, state, P, true); leftRoom(nk, P.uid);
    delete state.players[P.uid]; delete state.crowds[P.uid];
    send(dispatcher, OP.LEAVE, { id: P.uid }); send(dispatcher, OP.CROWD_GONE, { id: P.uid });
    feedOut(dispatcher, state, 'leave', { u: P.uid, a: P.name });
    logger.info('- %s from %s', P.name, state.sid);
  }
  return { state: state };
}

function onState(nk, logger, dispatcher, state, P, q) {
  var p = q.p; if (!p || typeof p.x !== 'number' || typeof p.z !== 'number' || !isFinite(p.x) || !isFinite(p.z)) return;
  var now = Date.now();
  if (P.p) {
    var d = Math.hypot(p.x - P.p.x, p.z - P.p.z), dt = Math.max(0.05, (now - P.at) / 1000);
    // aircraft are fast (the jet's afterburner): allowed once they've been flying a moment, so claiming to fly isn't a teleport
    if (p.ak) { if (!P.airSince) P.airSince = now; } else P.airSince = 0;
    var maxSpd = p.ak && now - P.airSince > 1500 ? 1000 : (p.c ? 450 : MAX_SPEED);
    if (d / dt > maxSpd && d > 30) { // a teleport: one every 15 s (fast travel, respawn), otherwise you go back
      if (now - P.lastTp < TP_EVERY && !P.dead && now > (P.tpFree || 0)) { send(dispatcher, OP.SNAPTO, { x: P.p.x, y: P.p.y, z: P.p.z }, [P.presence]); return; }
      P.lastTp = now;
    }
  }
  p.h = P.hp; p.d = P.dead ? (p.d || 1) : 0; // health in the relayed state is the room's, not the browser's
  var prev = P.p, tPrev = P.at;
  P.p = p; P.at = now; P.dirty = true;
  if (P.g) arenaState(nk, logger, dispatcher, state, P, prev, p, tPrev, now);
  if (q.s !== undefined && typeof q.s === 'string' && q.s !== P.skin) { P.skin = q.s.slice(0, 40); playerChanged(dispatcher, state, P); }
}
function onHit(nk, logger, dispatcher, state, P, q) {
  var V = state.players[String(q.v || '')]; if (!V || V === P || V.dead || P.dead || !V.p || !P.p) return;
  if (P.g || V.g) { if (P.g === 'hide' && V.g === 'hide') hideHit(nk, logger, dispatcher, state, P, V, q); return; } // crew garages: no fighting
  var now = Date.now(); if (now < V.shieldUntil) return;
  var w = String(q.w || 'fists').toLowerCase(), rule = WEAPON_RULES[w] || [60, 200];
  var cap = rule[0] * (1 + 0.04 * rank(P, 'damage')), dmg = Math.max(0, Math.min(cap, +q.d || 0)); if (!dmg) return;
  if (Math.hypot(V.p.x - P.p.x, V.p.z - P.p.z) > rule[1]) return;
  if (w === 'car') { var ch = P.carHits || (P.carHits = {}); if (now - (ch[V.uid] || 0) < 1000) return; ch[V.uid] = now; } // one run-over hit a second
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
  if (P.dead || P.g) return; // in a crew-garage world your health is your game's own business
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
function onNpcKill(dispatcher, state, P, q) {
  var now = Date.now(); if (P.g || P.dead || !P.p || now - P.npcAt < NPC_GAP_MS) return;
  P.npcWin = P.npcWin.filter(function (t) { return now - t < 60000; }); if (P.npcWin.length >= NPC_PER_MIN) return;
  P.npcAt = now; P.npcWin.push(now);
  P.sk++; P.npcBank++; P.npcXp += q.cop ? COP_XP : NPC_XP;
}
function flushNpc(nk, logger, dispatcher, state, P) { // bank -> lifetime kills, XP, the daily kill challenges and the boards
  if (!P.npcBank) return;
  var n = P.npcBank, xp = P.npcXp; P.npcBank = 0; P.npcXp = 0;
  try {
    var was = P.lvl;
    var r = updateProgress(nk, logger, P.uid, function (p, ev) { p.kills += n; p.npc = (p.npc | 0) + n; addXp(p, xp * (1 + 0.2 * rank(p, 'hunter')), ev); dailyBump(p, 'kills', n, false, ev); });
    P.lvl = r.p.lvl; P.title = titleFor(P.lvl); P.skills = r.p.skills || {}; postBoards(nk, logger, P.uid, P.name, r.p, n);
    if (dispatcher) { statsTo(dispatcher, P, r); if (P.lvl !== was) playerChanged(dispatcher, state, P); }
  } catch (e) { logger.warn('npc kills for %s: %s', P.uid, e.message || e); }
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
      case OP.STATE: onState(nk, logger, dispatcher, state, P, q); break;
      case OP.HIT: onHit(nk, logger, dispatcher, state, P, q); break;
      case OP.HP: onOwnHealth(nk, logger, dispatcher, state, P, q); break;
      case OP.RESPAWN: onRespawn(dispatcher, state, P); break;
      case OP.NPC_KILL: onNpcKill(dispatcher, state, P, q); break;
      case OP.TCAR_HIT: if (typeof ROADS !== 'undefined') onCarHit(state, P, q); break;
      case OP.TCAR_TAKE: if (typeof ROADS !== 'undefined') onCarTake(state, P, q); break;
      case OP.CHAT: {
        var text = String(q.m || '').replace(/\s+/g, ' ').trim().slice(0, 160); if (!text || now - P.chatAt < 700) break;
        P.chatAt = now; send(dispatcher, OP.CHAT_OUT, { u: P.uid, n: P.name, m: text, t: now }); break;
      }
      case OP.FEED: if (q.k === 'busted' || q.k === 'wreck') feedOut(dispatcher, state, q.k, { u: P.uid, a: P.name, b: String(q.b || '').slice(0, 16) }); break;
      case OP.EVENT: { q.u = P.uid; q.t = now; var o = othersIn(state, P); if (o.length) send(dispatcher, OP.EVENT_OUT, q, o); break; }
      case OP.RUIN: {
        var idx = q.i | 0; if (idx < 0 || P.g) break; var ru = { i: idx, x: +q.x || 0, z: +q.z || 0, t: now, u: P.uid };
        state.ruins[idx] = ru; var o2 = others(state, P); if (o2.length) send(dispatcher, OP.RUIN_OUT, ru, o2); break;
      }
      case OP.CROWD: { var e = String(q.e || '').slice(0, 12000); state.crowds[P.uid] = { e: e, t: now }; var o3 = othersIn(state, P); if (o3.length) send(dispatcher, OP.CROWD_OUT, { id: P.uid, e: e, t: now }, o3); break; }
      case OP.CROWD_CLEAR: delete state.crowds[P.uid]; send(dispatcher, OP.CROWD_GONE, { id: P.uid }); break;
      case OP.GAME_JOIN: onGameJoin(nk, logger, dispatcher, state, P, q); break;
      case OP.GAME_LEAVE: onGameLeave(nk, logger, dispatcher, state, P); break;
      case OP.GAME_ACT: onGameAct(nk, logger, dispatcher, state, P, q); break;
      default: break;
    }
  }
  // 10 times a second: everyone's latest state to everyone in the same world (the client skips its own)
  var W = {}, n = 0;
  for (var k in state.players) {
    var Q = state.players[k], w = W[Q.g || ''] || (W[Q.g || ''] = { a: [], pr: [] }); n++; w.pr.push(Q.presence);
    if (Q.dirty && Q.p) { w.a.push([Q.uid, Q.p]); Q.dirty = false; }
  }
  for (var wk in W) if (W[wk].a.length && W[wk].pr.length > 1) send(dispatcher, OP.SNAP, { t: now, a: W[wk].a }, W[wk].pr);
  gamesTick(nk, logger, dispatcher, state, now);
  if (typeof ROADS !== 'undefined' && n) { // the room's cars (traffic.js): only players out in Poway, not those inside a crew-garage world
    var allPl = state.players, inTown = {}, away = false; for (var tk in allPl) { if (allPl[tk].g) away = true; else inTown[tk] = allPl[tk]; }
    if (away) state.players = inTown;
    try { trafficTick(state, dispatcher, 1 / TICK_RATE, tick); } catch (e) { logger.warn('traffic: %s', e.message || e); }
    state.players = allPl;
  }
  if (tick % NPC_FLUSH_TICKS === 0) for (var k3 in state.players) flushNpc(nk, logger, dispatcher, state, state.players[k3]);
  if (tick % (TICK_RATE * 60) === 0) for (var k2 in state.players) { flushMinutes(nk, logger, dispatcher, state, state.players[k2], false); markRoom(nk, k2, state.sid); }
  for (var ri in state.ruins) if (now - state.ruins[ri].t > RUIN_MS) delete state.ruins[ri];
  if (!n) { if (++state.empty > EMPTY_TICKS) { logger.info('closing empty room %s', state.sid); return null; } } else state.empty = 0;
  return { state: state };
}
function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  for (var k in state.players) { flushNpc(nk, logger, null, state, state.players[k]); flushMinutes(nk, logger, null, state, state.players[k], true); leftRoom(nk, k); }
  return { state: state };
}
function matchSignal(ctx, logger, nk, dispatcher, tick, state, data) { return { state: state, data: '' }; }

// ---------------------------------------------------------------- crew garages: the mini-game worlds
// Drive into a crew garage in Poway and a tunnel takes you to a world of its own, far east of town: the Long Jump,
// Hide & Seek downtown, and three race courses. The room decides everything that has to be fair:
//   who's in which world  P.g ('' = Poway). Positions, events and crowds only go to players in the same world; you go
//                         in only from that garage's door (or from inside the world, after a dropped connection)
//   Long Jump             takeoff from the ramp's lip and touchdown, from the positions the car reports; the flight has
//                         to be a believable parabola (launch angle, gravity, top speed), then the board takes it
//   Hide & Seek           rounds, the seeker (picked at random), the clock, and knock-outs: one rocket hit from the
//                         seeker on a hider during the seek phase
//   races                 time trials and competitions: the start (standing, on the grid), every checkpoint in order,
//                         lap and finish times, places, the boards
// Inside a world nobody takes damage from other players and nothing counts toward kills, deaths or streaks.
// The worlds' layout (GAME_DEFS) is src/games/defs.js, copied in here by tools/sync-game-defs.mjs:
// BEGIN SHARED
var GAME_DEFS = (function () {
  var X0 = 70000, GAP = 10000;
  // ---- Poway: the garages. x, z: the middle of the front wall (where the doors are), on the ground; face: the way the
  // front looks (toward the street). Bays left to right as seen from the street, one game behind each door.
  var GARAGES = [
    { id: 'race', name: 'Kirkham Raceway', x: 143, z: 2779, face: -0.037, bays: ['race0', 'race1', 'race2'] },
    { id: 'hide', name: 'Midtown Crew', x: -767, z: 417, face: 3.128, bays: ['hide'] },
    { id: 'flight', name: 'Lakeside Jump Club', x: -508, z: -4004, face: 3.138, bays: ['flight'] },
  ];
  var BAY_W = 7, BAY_GAP = 9.5; // door width, door spacing (m)
  function bayDoor(G, i) { // where bay i's doorway is: { x, z, rot (the way in) }
    var n = G.bays.length, off = (i - (n - 1) / 2) * BAY_GAP, fx = Math.sin(G.face), fz = Math.cos(G.face);
    return { x: G.x + fz * off, z: G.z - fx * off, rot: G.face + Math.PI }; // off runs left to right as seen from the street
  }
  function garageOf(g) { for (var i = 0; i < GARAGES.length; i++) { var k = GARAGES[i].bays.indexOf(g); if (k >= 0) return { G: GARAGES[i], bay: k }; } return null; }

  // ---- the jump ramp (Long Jump): a curved kicker of 4 m wedges, steeper toward the lip
  function rampProfile() {
    var knots = [[0, 0]], h = 0, N = 12;
    for (var i = 0; i < N; i++) { var a = (3 + 23 * Math.pow((i + 0.5) / N, 1.5)) * Math.PI / 180; h += Math.tan(a) * 4; knots.push([(i + 1) * 4, Math.round(h * 100) / 100]); }
    return knots;
  }
  var RAMP = rampProfile(), RAMP_LEN = RAMP[RAMP.length - 1][0], RAMP_H = RAMP[RAMP.length - 1][1];

  // ---- race courses: control points (closed loops start on the start line), half width, laps (0: point to point)
  function stadium(len, r, step) { // a speedway: two straights joined by half circles, starting mid-way down the front straight
    var p = [], h = len / 2, i, a;
    for (i = 0; i < h; i += step) p.push([i, r]);
    for (a = 0; a < Math.PI - 1e-6; a += step / r) p.push([h + Math.sin(a) * r, Math.cos(a) * r]);
    for (i = h; i > -h; i -= step) p.push([i, -r]);
    for (a = 0; a < Math.PI - 1e-6; a += step / r) p.push([-h - Math.sin(a) * r, -Math.cos(a) * r]);
    for (i = -h; i < 0; i += step) p.push([i, r]);
    return p;
  }
  var COURSES = {
    race0: { hw: 9, laps: 3, closed: true, pts: [[-120, 0], [120, 0], [330, 0], [450, -40], [500, -160], [450, -290], [330, -330], [220, -270], [160, -160], [50, -120], [-70, -200], [-110, -330], [-230, -410], [-380, -380], [-470, -260], [-480, -120], [-380, -20]] },
    race1: { hw: 8, laps: 0, closed: false, pts: [[0, 0], [250, 0], [450, 60], [600, 200], [620, 380], [520, 520], [380, 600], [330, 760], [420, 900], [620, 940], [820, 880], [980, 960], [1060, 1140], [1000, 1320], [860, 1420], [880, 1600], [1000, 1720]] },
    race2: { hw: 12, laps: 4, closed: true, pts: stadium(640, 170, 40) },
  };
  function cr(p0, p1, p2, p3, t) { var t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3); }
  // centre line every `step` m along a Catmull-Rom spline through the points: [x0, z0, x1, z1, ...]
  function sampleCourse(c, step) {
    var P = c.pts, n = P.length, segs = c.closed ? n : n - 1, dense = [], i, j;
    for (i = 0; i < segs; i++) {
      var a = P[c.closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[i], d1 = P[(i + 1) % n], d2 = P[c.closed ? (i + 2) % n : Math.min(n - 1, i + 2)];
      var k = Math.max(4, Math.ceil(Math.hypot(d1[0] - b[0], d1[1] - b[1]) / 2));
      for (j = 0; j < k; j++) dense.push(cr(a[0], b[0], d1[0], d2[0], j / k), cr(a[1], b[1], d1[1], d2[1], j / k));
    }
    dense.push(c.closed ? dense[0] : P[n - 1][0], c.closed ? dense[1] : P[n - 1][1]);
    var out = [dense[0], dense[1]], acc = 0, want = step;
    for (i = 2; i < dense.length; i += 2) {
      var x0 = dense[i - 2], z0 = dense[i - 1], x1 = dense[i], z1 = dense[i + 1], l = Math.hypot(x1 - x0, z1 - z0);
      while (l > 0 && acc + l >= want) { var f = (want - acc) / l; out.push(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f); want += step; }
      acc += l;
    }
    if (c.closed && Math.hypot(out[out.length - 2] - out[0], out[out.length - 1] - out[1]) < step * 0.5) out.length -= 2;
    return { s: out, n: out.length / 2, len: acc, step: step };
  }
  var GATE_EVERY = 100, STEP = 4;
  function tangent(S, i, closed) { // unit direction of travel at sample i
    var n = S.n, a = closed ? (i - 1 + n) % n : Math.max(0, i - 1), b = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    var dx = S.s[b * 2] - S.s[a * 2], dz = S.s[b * 2 + 1] - S.s[a * 2 + 1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l];
  }
  // checkpoints: [x, z, tx, tz, half width]. Closed: gate 0 is the start/finish line, a lap is 1..n-1 then 0 again.
  // Point to point: gate 0 is the start, the last gate the finish.
  var courseCache = null; // built on first use, not at load
  function courseOf(id) {
    var c = COURSES[id]; if (!c) return null; if (!courseCache) courseCache = {}; if (courseCache[id]) return courseCache[id];
    var S = sampleCourse(c, STEP), every = Math.round(GATE_EVERY / STEP), gates = [], i;
    var last = c.closed ? S.n - Math.round(every / 2) : S.n - 1;
    for (i = 0; i < last; i += every) { var t = tangent(S, i, c.closed); gates.push([S.s[i * 2], S.s[i * 2 + 1], t[0], t[1], c.hw + 5]); }
    if (!c.closed) { var te = tangent(S, S.n - 1, false); gates.push([S.s[S.n * 2 - 2], S.s[S.n * 2 - 1], te[0], te[1], c.hw + 5]); }
    S.gates = gates; S.hw = c.hw; S.laps = c.laps; S.closed = c.closed; courseCache[id] = S;
    return S;
  }
  // grid slot i (0..7): two staggered columns behind the start line; [x, z, rot] in the course's frame
  function gridSlot(id, i) {
    var S = courseOf(id), row = Math.floor(i / 2), side = i % 2 ? -1 : 1, back = 9 + row * 10 + (i % 2) * 5, lat = side * S.hw * 0.42;
    var t = tangent(S, 0, S.closed), x, z;
    if (S.closed) { var k = (S.n - Math.round(back / STEP)) % S.n, tk = tangent(S, k, true); x = S.s[k * 2] - tk[1] * lat; z = S.s[k * 2 + 1] + tk[0] * lat; t = tk; }
    else { x = S.s[0] - t[0] * back - t[1] * lat; z = S.s[1] - t[1] * back + t[0] * lat; }
    return [x, z, Math.atan2(t[0], t[1])];
  }

  // ---- hide and seek: a downtown grid. Streets every PITCH m (7 each way), four traffic lanes and a parking lane on
  // each side; traffic loops through tunnels in the wall of towers around the edge
  var HS = { n: 7, pitch: 140, hw: 13, wall: 437, loop: 560, v: 12, D: 70, roof: [350, -350, 49, 30] }; // roof: x, z, half size, height (the spectator terrace)
  function hsStreet(i) { return -HS.wall + 17 + i * HS.pitch; } // centre line of street i (both axes)
  function hsSpots() { // where hiders start: parking lanes, mid-block, both sides of every street
    var out = [], i, j;
    for (i = 0; i < HS.n; i++) for (j = 0; j < HS.n - 1; j++) {
      var s = hsStreet(i), m = hsStreet(j) + HS.pitch / 2 + ((i * 7 + j * 3) % 5 - 2) * 9;
      if (i === 0 || i === HS.n - 1) continue; // not on the ring road
      out.push([s - 11.5, m, 0], [s + 11.5, m, Math.PI], [m, s + 11.5, Math.PI / 2], [m, s - 11.5, -Math.PI / 2]);
    }
    return out;
  }

  // ---- the worlds. in: where you come up out of the tunnel (x, z, rot: the way you drive out); out: the mouth of the
  // tunnel back to Poway (rot: the way in). sky: [hour, weather] for as long as you're inside.
  var ARENAS = {
    flight: { kind: 'flight', name: 'Long Jump', o: [X0 + GAP, 0], sky: [16.6, 'clear'], ground: 'flat',
      in: [-900, 0, Math.PI / 2], out: [-900, -60, -Math.PI / 2], bounds: [-1040, -130, 760, 130],
      lane: [-880, 0, 15], land: [RAMP_LEN, 640, 48], rampHw: 6 },
    hide: { kind: 'hide', name: 'Hide & Seek', o: [X0 + GAP * 2, 0], sky: [13.2, 'cloudy'], ground: 'flat',
      in: [-70, HS.wall, Math.PI], out: [70, HS.wall, 0], bounds: [-HS.wall, -HS.wall, HS.wall, HS.wall + 120],
      plaza: [-70, -70], counts: { wait: 12, hide: 30, seek: 180, end: 10 } },
    race0: { kind: 'race', name: 'Kirkham Circuit', o: [X0 + GAP * 3, 0], sky: [15.2, 'sunny'], ground: 'flat',
      in: [-260, 120, Math.PI / 2], out: [-260, 165, -Math.PI / 2], bounds: [-700, -620, 700, 380] },
    race1: { kind: 'race', name: 'Canyon Sprint', o: [X0 + GAP * 4, 0], sky: [17.8, 'clear'], ground: 'hills',
      in: [-150, 95, Math.PI / 2], out: [-150, 140, -Math.PI / 2], bounds: [-400, -300, 1400, 1950] },
    race2: { kind: 'race', name: 'Poway Speedway', o: [X0 + GAP * 5, 0], sky: [12.4, 'sunny'], ground: 'flat',
      in: [-120, 300, Math.PI / 2], out: [-120, 345, -Math.PI / 2], bounds: [-700, -420, 700, 520] },
  };
  var IDS = ['flight', 'hide', 'race0', 'race1', 'race2'];
  function arenaAt(x) { if (x < X0 + GAP / 2) return null; var k = Math.round((x - X0) / GAP) - 1; return IDS[k] || null; }

  // ---- tunnels: from each 'in' portal back 110 m (a 50 m ramp up from -9 m, then level), from each 'out' portal on
  // 80 m (down to -9 m). Half width 6 m. tunnelAt -> floor height, or null outside both.
  var TUN = { hw: 6, ramp: 50, depth: 9, inLen: 110, outLen: 80 };
  function tunnelFloor(A, lx, lz) {
    var t = A.in, dx = Math.sin(t[2]), dz = Math.cos(t[2]), u = -((lx - t[0]) * dx + (lz - t[1]) * dz), w = (lx - t[0]) * dz - (lz - t[1]) * dx;
    if (u > -2 && u < TUN.inLen && Math.abs(w) < TUN.hw + 0.9) return u <= 0 ? 0 : -TUN.depth * Math.min(1, u / TUN.ramp);
    t = A.out; dx = Math.sin(t[2]); dz = Math.cos(t[2]); u = (lx - t[0]) * dx + (lz - t[1]) * dz; w = (lx - t[0]) * dz - (lz - t[1]) * dx;
    if (u > -2 && u < TUN.outLen && Math.abs(w) < TUN.hw + 0.9) return u <= 0 ? 0 : -TUN.depth * Math.min(1, u / TUN.ramp);
    return null;
  }
  function hills(lx, lz) { // Canyon Sprint's rolling ground, flat around the paddock
    var h = 14 * Math.sin(lx * 0.0061 + 1.3) * Math.cos(lz * 0.0047 - 0.4) + 7 * Math.sin((lx + lz) * 0.0093) + 4 * Math.cos(lx * 0.017 - lz * 0.011);
    var d = Math.hypot(lx + 150, lz - 60); return h * Math.min(1, Math.max(0, (d - 160) / 220));
  }
  // the ground of a world at a local point
  function groundLocal(id, lx, lz) {
    var A = ARENAS[id]; if (!A) return 0;
    var t = tunnelFloor(A, lx, lz); if (t !== null) return t;
    if (A.kind === 'hide') { var r = HS.roof; if (Math.abs(lx - r[0]) < r[2] && Math.abs(lz - r[1]) < r[2]) return r[3]; return 0; }
    if (A.ground === 'hills') return hills(lx, lz);
    return 0;
  }
  return { X0: X0, GAP: GAP, GARAGES: GARAGES, BAY_W: BAY_W, bayDoor: bayDoor, garageOf: garageOf, ARENAS: ARENAS, IDS: IDS, arenaAt: arenaAt,
    RAMP: RAMP, RAMP_LEN: RAMP_LEN, RAMP_H: RAMP_H, COURSES: COURSES, courseOf: courseOf, gridSlot: gridSlot, tangent: tangent,
    HS: HS, hsStreet: hsStreet, hsSpots: hsSpots, TUN: TUN, tunnelFloor: tunnelFloor, groundLocal: groundLocal, hills: hills };
})();
// END SHARED
var GD = GAME_DEFS, ARENA_BOARD = { flight: 'flight_dist', race0: 'race_race0', race1: 'race_race1', race2: 'race_race2' };
var DOOR_R = 45, TP_GRACE = 6000;             // how near a garage door you must be to go in (m); free teleport after a move (ms)
var FLIGHT_VMAX = 100, FLIGHT_G = 21, FLIGHT_TAN = 0.7; // the fastest car with nitro (95 m/s) plus slack; the game's gravity; ~35 degrees
var RACE_VMAX = 105, TT_GO = 4000, RACE_GO = 7000, COMP_WAIT = 15000, COMP_MAX = 8, RACE_DNF = 60000, RACE_LIMIT = 600000;
var HS_KO_RANGE = 460, HS_PEN_R = 45;         // a rocket flies 450 m; the seeker waits within 45 m of the plaza while hiders hide
var RACE_XP = [300, 180, 120], RACE_XP_FINISH = 60, HS_XP = { seekerWin: 120, perKo: 40, survive: 150, out: 25 };

function inWorld(state, g) { var a = []; for (var k in state.players) if ((state.players[k].g || '') === g) a.push(state.players[k]); return a; }
function presencesIn(state, g) { return inWorld(state, g).map(function (Q) { return Q.presence; }); }
function othersIn(state, P) { var a = [], g = P.g || ''; for (var k in state.players) { var Q = state.players[k]; if (k !== P.uid && (Q.g || '') === g) a.push(Q.presence); } return a; }
function gameSend(dispatcher, state, g, op, obj) { var pr = presencesIn(state, g); if (pr.length) send(dispatcher, op, obj, pr); }
function gameOf(state, g) {
  if (!state.games) state.games = {};
  var G = state.games[g]; if (G) return G;
  var A = GD.ARENAS[g];
  G = A.kind === 'hide' ? { kind: 'hide', ph: 'wait', until: 0, seeker: '', hiders: {}, names: {}, kos: 0, round: 0, last: '', res: null, dirty: true, sentAt: 0 }
    : A.kind === 'race' ? { kind: 'race', q: [], cd: 0, race: null, dirty: true, sentAt: 0 }
    : { kind: 'flight', dirty: true, sentAt: 0 };
  state.games[g] = G; return G;
}
function names(state, uids) { return uids.map(function (u) { var Q = state.players[u]; return Q ? Q.name : '?'; }); }
function gamePublic(state, g) {
  var G = gameOf(state, g), o = { g: g, k: G.kind };
  if (G.kind === 'hide') {
    o.ph = G.ph; o.until = G.until; o.seeker = G.seeker; o.round = G.round; o.res = G.res;
    o.sn = G.seeker && state.players[G.seeker] ? state.players[G.seeker].name : (G.sname || '');
    o.hiders = []; for (var u in G.hiders) o.hiders.push([u, G.names[u] || '?', G.hiders[u]]);
  } else if (G.kind === 'race') {
    o.q = G.q.slice(); o.qn = names(state, G.q); o.cd = G.cd;
    if (G.race) { o.race = { t0: G.race.t0, end: G.race.end || 0, n: standings(state, G.race) }; }
    o.tt = []; inWorld(state, g).forEach(function (Q) { if (Q.run && Q.run.mode === 'tt' && !Q.run.done && !Q.run.dq) o.tt.push([Q.uid, Q.name, Q.run.t0]); });
  }
  return o;
}
function gameDirty(state, g) { if (state.games && state.games[g]) state.games[g].dirty = true; }
function boardRows(nk, logger, g) {
  var id = ARENA_BOARD[g]; if (!id) return null;
  try {
    var res = nk.leaderboardRecordsList(id, [], 10, '', 0);
    return (res.records || []).map(function (r) { var m = r.metadata || {}; return { rank: r.rank, name: r.username, score: r.score, sub: r.subscore, m: m }; });
  } catch (e) { logger.warn('board %s: %s', id, e.message || e); return []; }
}
function sendBoard(nk, logger, dispatcher, state, g) { gameSend(dispatcher, state, g, OP.GAME_BOARD, { g: g, rows: boardRows(nk, logger, g) }); }
function awardXp(nk, logger, dispatcher, state, P, xp, why) {
  if (!xp || !P) return;
  try {
    var was = P.lvl, r = updateProgress(nk, logger, P.uid, function (p, ev) { addXp(p, xp, ev); ev.push({ k: 'arena', why: why, xp: xp }); });
    P.lvl = r.p.lvl; P.title = titleFor(P.lvl); P.skills = r.p.skills || {}; postBoards(nk, logger, P.uid, P.name, r.p, 0);
    statsTo(dispatcher, P, r); if (P.lvl !== was) playerChanged(dispatcher, state, P);
  } catch (e) { logger.warn('arena xp for %s: %s', P.uid, e.message || e); }
}
function placeTo(dispatcher, P, g, at, extra) { // move a player inside a world (grid slot, reset, round start): x, z local, rot
  var A = GD.ARENAS[g], o = { k: 'place', g: g, x: A.o[0] + at[0], z: A.o[1] + at[1], rot: at[2] };
  if (extra) for (var k in extra) o[k] = extra[k];
  P.tpFree = Date.now() + TP_GRACE; send(dispatcher, OP.GAME_EVENT, o, [P.presence]);
}

// ---- going in and coming out
function onGameJoin(nk, logger, dispatcher, state, P, q) {
  var g = String(q.g || ''), A = GD.ARENAS[g], now = Date.now();
  if (!A || !P.p) return;
  if (P.g === g) { send(dispatcher, OP.GAME_IN, { g: g, t: now, st: gamePublic(state, g), board: boardRows(nk, logger, g) }, [P.presence]); return; }
  var gi = GD.garageOf(g), door = GD.bayDoor(gi.G, gi.bay);
  var near = Math.hypot(P.p.x - door.x, P.p.z - door.z) < DOOR_R, back = GD.arenaAt(P.p.x) === g;
  if (P.dead || (!near && !back)) { send(dispatcher, OP.GAME_OUT, { g: g, err: P.dead ? 'Not while you\'re down.' : 'Drive in through the garage door.' }, [P.presence]); return; }
  if (P.g) leaveGame(nk, logger, dispatcher, state, P);
  P.g = g; P.tpFree = now + TP_GRACE; P.lastTp = 0; P.flight = null; P.run = null; P.lastHitBy = null;
  gameOf(state, g); gameDirty(state, g);
  send(dispatcher, OP.GAME_IN, { g: g, t: now, st: gamePublic(state, g), board: boardRows(nk, logger, g) }, [P.presence]);
  var a = []; inWorld(state, g).forEach(function (Q) { if (Q !== P && Q.p) a.push([Q.uid, Q.p]); });
  if (a.length) send(dispatcher, OP.SNAP, { t: now, a: a }, [P.presence]);
  playerChanged(dispatcher, state, P);
  logger.info('%s went into %s', P.name, g);
}
function onGameLeave(nk, logger, dispatcher, state, P) {
  if (!P.g) return;
  var g = P.g, gi = GD.garageOf(g), door = GD.bayDoor(gi.G, gi.bay);
  leaveGame(nk, logger, dispatcher, state, P);
  send(dispatcher, OP.GAME_OUT, { g: g, door: door }, [P.presence]);
  var a = []; inWorld(state, '').forEach(function (Q) { if (Q !== P && Q.p) a.push([Q.uid, Q.p]); });
  if (a.length) send(dispatcher, OP.SNAP, { t: Date.now(), a: a }, [P.presence]);
  playerChanged(dispatcher, state, P);
}
function leaveGame(nk, logger, dispatcher, state, P) { // out of whatever they were in: a hider is out, a racer doesn't finish
  var g = P.g; if (!g) return;
  P.g = ''; P.tpFree = Date.now() + TP_GRACE; P.lastTp = 0; P.flight = null;
  var G = state.games && state.games[g];
  if (G && G.kind === 'hide') { if (G.hiders[P.uid] === 0) G.hiders[P.uid] = 2; if (G.seeker === P.uid) G.seekerLeft = true; }
  if (G && G.kind === 'race') { var i = G.q.indexOf(P.uid); if (i >= 0) G.q.splice(i, 1); if (P.run && !P.run.done) P.run.dq = 'left'; }
  P.run = null; gameDirty(state, g);
}
function onGameAct(nk, logger, dispatcher, state, P, q) {
  var g = P.g, G = g && gameOf(state, g), a = String(q.a || ''), now = Date.now(); if (!G) return;
  if (G.kind === 'race') {
    if (a === 'tt') { // a time trial: on the grid now, the lights go green in 4 s
      if (P.run && P.run.mode === 'race' && !P.run.done && !P.run.dq) return;
      var i0 = G.q.indexOf(P.uid); if (i0 >= 0) G.q.splice(i0, 1);
      var used = {}; inWorld(state, g).forEach(function (Q) { if (Q !== P && Q.run && !Q.run.done && !Q.run.dq && now < Q.run.t0 + 3000) used[Q.run.si] = 1; });
      var si = 0; while (used[si] && si < 7) si++;
      P.run = newRun('tt', now + TT_GO, g, si, P.name);
      placeTo(dispatcher, P, g, P.run.slot, { start: 'tt', t0: P.run.t0 }); P.tpFree = P.run.t0 + 1500;
    } else if (a === 'join') { if (G.q.indexOf(P.uid) < 0 && !(P.run && P.run.mode === 'race' && !P.run.done && !P.run.dq)) G.q.push(P.uid); }
    else if (a === 'quit') { var i1 = G.q.indexOf(P.uid); if (i1 >= 0) G.q.splice(i1, 1); if (P.run && !P.run.done) { P.run.dq = 'quit'; P.run = null; } }
    else if (a === 'reset') { // back to the last checkpoint passed (or your grid slot), facing the way the course goes
      var R = P.run; if (!R || R.done || R.dq || now < R.t0) return;
      var S = GD.courseOf(g), k = R.gate - 1; if (k < 0 && R.lap > 0) k = S.gates.length - 1;
      var at = k < 0 ? R.slot : [S.gates[k][0], S.gates[k][1], Math.atan2(S.gates[k][2], S.gates[k][3])];
      placeTo(dispatcher, P, g, at, { reset: 1 });
    }
    gameDirty(state, g); return;
  }
  if (G.kind === 'flight' && a === 'reset') { P.flight = null; P.tpFree = now + TP_GRACE; } // back to the top of the runway (the game moves itself)
  if (G.kind === 'hide' && a === 'reset' && G.ph !== 'hide' && G.ph !== 'seek') P.tpFree = now + TP_GRACE;
}

// ---- Long Jump: from the lip to the first touch of the ground
function flightState(nk, logger, dispatcher, state, P, prev, p, tPrev, now) {
  var A = GD.ARENAS.flight, L = GD.RAMP_LEN, H = GD.RAMP_H, lx = p.x - A.o[0], lz = p.z - A.o[1], F = P.flight;
  if (!p.c || p.d || now < (P.tpFree || 0)) { P.flight = null; return; }
  if (!F || !F.air) {
    if (!prev) return;
    var plx = prev.x - A.o[0], plz = prev.z - A.o[1];
    if (!(plx < L && lx >= L)) return;
    var f = (L - plx) / (lx - plx), cz = plz + (lz - plz) * f, cy = prev.y + (p.y - prev.y) * f;
    if (Math.abs(cz) > A.rampHw + 1 || cy < H - 2.5) return; // off the side, or not on the ramp
    P.flight = { air: true, t0: tPrev + (now - tPrev) * f, lz: cz, pts: [[Math.hypot(lx - L, lz - cz), p.y - H, now, lowestCorner(p)]] };
    return;
  }
  var d = Math.hypot(lx - L, lz - F.lz), low = lowestCorner(p);
  if (lx < L - 1 || Math.abs(lz) > 400 || now - F.t0 > 15000) { P.flight = null; return; }
  if (low > 0.3) { if (F.pts.length < 400) F.pts.push([d, p.y - H, now, low]); return; }
  // touchdown: the first time any corner of the car reaches the dirt, between the last sample in the air and this one
  var last = F.pts[F.pts.length - 1], y1 = last[3], k = y1 > low ? Math.min(1, Math.max(0, (y1 - 0.3) / (y1 - low))) : 1;
  var dist = last[0] + (d - last[0]) * k, T = (last[2] + (now - last[2]) * k - F.t0) / 1000;
  P.flight = null;
  var v = judgeFlight(F.pts, dist, T, H); if (v.ok) T = v.T;
  if (typeof __DEVLOG !== 'undefined') __DEVLOG('flight', { dist: dist, T: T, v: v, pts: F.pts.map(function (q) { return [Math.round(q[0] * 10) / 10, Math.round(q[1] * 100) / 100, q[2] - F.t0]; }) });
  if (!v.ok) { logger.info('flight by %s not counted (%s): %.1f m', P.name, v.why, dist); send(dispatcher, OP.GAME_EVENT, { k: 'jump', u: P.uid, n: P.name, d: dist, t: T, bad: v.why }, [P.presence]); return; }
  if (dist < 5) return;
  var best = dist, rank = 0;
  try {
    var rec = nk.leaderboardRecordWrite(ARENA_BOARD.flight, P.uid, P.name, Math.round(dist * 100), Math.round(T * 1000), { t: Math.round(T * 100) / 100, v: Math.round(v.vh * 3.6), c: String(p.c || '').slice(0, 12) });
    best = rec.score / 100; rank = rec.rank || 0;
  } catch (e) { logger.warn('flight board: %s', e.message || e); }
  gameSend(dispatcher, state, 'flight', OP.GAME_EVENT, { k: 'jump', u: P.uid, n: P.name, d: Math.round(dist * 100) / 100, t: Math.round(T * 100) / 100, v: Math.round(v.vh * 3.6), pb: Math.abs(best - dist) < 0.005, best: best, rank: rank });
  sendBoard(nk, logger, dispatcher, state, 'flight');
}
// how high the lowest corner of the car is (the crew's sports car: half its length, width and height), from the
// reported pitch and roll: a car coming down nose first touches the dirt while its middle is still 2 m up
function lowestCorner(p) {
  var pit = +p.cp || 0, rol = +p.cl || 0, HL = 2.59, HW = 1.1, HH = 0.71;
  return p.y + HH - (HW * Math.abs(Math.sin(rol) * Math.cos(pit)) + HH * Math.abs(Math.cos(rol) * Math.cos(pit)) + HL * Math.abs(Math.sin(pit)));
}
// does this look like a car thrown off the lip under the game's gravity? Least squares through the lip:
// h = a d - b d^2 - c d^3 (d: metres from the lip, h: height relative to it). b is gravity over the horizontal speed
// squared; c takes up the game's light air drag (a pure parabola misses a 200 m flight by metres).
function judgeFlight(pts, dist, T, H) {
  if (dist <= 30) return { ok: true, vh: dist / Math.max(0.2, T), T: T };
  if (pts.length < 5) return { ok: false, why: 'too few samples' };
  var S = [0, 0, 0, 0, 0, 0, 0], R = [0, 0, 0], i, k; // in hundreds of metres, for well-sized numbers
  for (i = 0; i < pts.length; i++) { var u = pts[i][0] / 100, h = pts[i][1], p = u; for (k = 1; k <= 6; k++) { S[k] += p; p *= u; } R[0] += h * u; R[1] += h * u * u; R[2] += h * u * u * u; }
  var M = [[S[2], S[3], S[4]], [S[3], S[4], S[5]], [S[4], S[5], S[6]]], det3 = function (m) { return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]); };
  var D = det3(M); if (Math.abs(D) < 1e-12) return { ok: false, why: 'degenerate' };
  var col = function (j) { return M.map(function (row, r) { var q = row.slice(); q[j] = R[r]; return q; }); };
  var A1 = det3(col(0)) / D, B1 = det3(col(1)) / D, C1 = det3(col(2)) / D;
  var a = A1 / 100, b = -B1 / 1e4, c = -C1 / 1e6, f = function (d) { return a * d - b * d * d - c * d * d * d; };
  if (!(b > 0)) return { ok: false, why: 'no gravity' };
  var res = 0; for (i = 0; i < pts.length; i++) { var e = pts[i][1] - f(pts[i][0]); res += e * e; }
  res = Math.sqrt(res / pts.length);
  var vh = Math.sqrt(FLIGHT_G / (2 * b));
  if (a > FLIGHT_TAN) return { ok: false, why: 'too steep', vh: vh };
  if (vh > FLIGHT_VMAX) return { ok: false, why: 'too fast', vh: vh };
  if (res > 1.5) return { ok: false, why: 'not a throw', vh: vh };
  if (Math.abs(f(dist) + H) > Math.max(5, dist * 0.04)) return { ok: false, why: 'landing', vh: vh };
  return { ok: true, vh: vh, T: dist / vh }; // air time from the throw itself: a slow computer's game runs slower than the clock
}

// ---- races
function newRun(mode, t0, g, si, name) { return { mode: mode, t0: t0, si: si, slot: GD.gridSlot(g, si), gate: 0, lap: 0, lapT: t0, laps: [], done: false, dq: '', time: 0, place: 0, name: name }; }
function crossGate(px, pz, x, z, G) { // fraction along the move where it crosses gate G going forward, or -1
  var s0 = (px - G[0]) * G[2] + (pz - G[1]) * G[3], s1 = (x - G[0]) * G[2] + (z - G[1]) * G[3];
  if (!(s0 < 0 && s1 >= 0)) return -1;
  var f = -s0 / (s1 - s0), qx = px + (x - px) * f, qz = pz + (z - pz) * f, lat = Math.abs((qx - G[0]) * -G[3] + (qz - G[1]) * G[2]);
  return lat <= G[4] ? f : -1;
}
function raceState(nk, logger, dispatcher, state, P, prev, p, tPrev, now) {
  var R = P.run, g = P.g; if (!R || R.done || R.dq || !prev) return;
  var A = GD.ARENAS[g], S = GD.courseOf(g), x = p.x - A.o[0], z = p.z - A.o[1], px = prev.x - A.o[0], pz = prev.z - A.o[1];
  if (now < (P.tpFree || 0) && Math.hypot(x - px, z - pz) > 15) return; // the move onto the grid or a reset: not driving
  if (now < R.t0) return; // the lights are still red: the game holds the car on its spot
  if (!R.checked) { // the last place reported before the green light has to be the grid spot
    R.checked = true;
    if (Math.hypot(px - R.slot[0], pz - R.slot[1]) > 10) { R.dq = 'jump start'; send(dispatcher, OP.GAME_EVENT, { k: 'dq', u: P.uid, why: 'jump start' }, [P.presence]); if (R.mode === 'tt') P.run = null; finishCheck(nk, logger, dispatcher, state, g); gameDirty(state, g); return; }
  }
  var dt = Math.max(0.05, (now - tPrev) / 1000), d = Math.hypot(x - px, z - pz);
  if (d / dt > RACE_VMAX && d > 20 && now > (P.tpFree || 0)) { R.dq = 'speed'; send(dispatcher, OP.GAME_EVENT, { k: 'dq', u: P.uid, why: 'too fast' }, [P.presence]); finishCheck(nk, logger, dispatcher, state, g); gameDirty(state, g); return; }
  for (var guard = 0; guard < 3; guard++) { // at most a few gates per step
    var f = crossGate(px, pz, x, z, S.gates[R.gate]); if (f < 0) break;
    var tc = tPrev + (now - tPrev) * f, n = S.gates.length;
    if (S.closed) {
      if (R.gate === 0) {
        if (R.started) { // a lap
          R.laps.push(tc - R.lapT); R.lapT = tc; R.lap++;
          if (R.lap >= S.laps) { raceFinish(nk, logger, dispatcher, state, P, R, tc - R.t0); return; }
          send(dispatcher, OP.GAME_EVENT, { k: 'lap', u: P.uid, lap: R.lap, t: Math.round(R.laps[R.laps.length - 1]) }, [P.presence]);
        }
        R.started = true; R.gate = 1;
      } else R.gate = (R.gate + 1) % n;
    } else {
      if (R.gate === n - 1) { raceFinish(nk, logger, dispatcher, state, P, R, tc - R.t0); return; }
      R.gate++;
    }
    send(dispatcher, OP.GAME_EVENT, { k: 'gate', u: P.uid, gate: R.gate, lap: R.lap }, [P.presence]);
    gameDirty(state, g);
    px = px + (x - px) * f; pz = pz + (z - pz) * f; // keep checking from the crossing point
  }
}
function raceFinish(nk, logger, dispatcher, state, P, R, ms) {
  var g = P.g, G = gameOf(state, g); ms = Math.round(ms);
  R.done = true; R.time = ms; if (R.mode === 'race' && G.race) { G.race.order.push(P.uid); R.place = G.race.order.length; if (!G.race.first) G.race.first = Date.now(); }
  var best = ms, rank = 0, bestLap = R.laps.length ? Math.round(Math.min.apply(null, R.laps)) : ms;
  try { var rec = nk.leaderboardRecordWrite(ARENA_BOARD[g], P.uid, P.name, ms, bestLap, { laps: R.laps.map(Math.round), mode: R.mode }); best = rec.score; rank = rec.rank || 0; }
  catch (e) { logger.warn('race board: %s', e.message || e); }
  gameSend(dispatcher, state, g, OP.GAME_EVENT, { k: 'finish', u: P.uid, n: P.name, mode: R.mode, time: ms, laps: R.laps.map(Math.round), place: R.place, pb: best === ms, best: best, rank: rank });
  sendBoard(nk, logger, dispatcher, state, g);
  if (R.mode === 'race' && G.race && G.race.n >= 2) awardXp(nk, logger, dispatcher, state, P, RACE_XP[R.place - 1] || RACE_XP_FINISH, 'race');
  if (R.mode === 'tt') P.run = null;
  finishCheck(nk, logger, dispatcher, state, g); gameDirty(state, g);
}
function progressOf(S, R) { var n = S.gates.length; return S.closed ? R.lap * n + (R.gate === 0 ? (R.started ? n : 0) : R.gate) : R.gate; } // gates passed, laps included
function standings(state, race) { // [uid, name, lap, next gate, done, time, place, out, progress], leader first
  var S = GD.courseOf(race.g), rows = [];
  for (var u in race.racers) { var R = race.racers[u]; rows.push([u, R.name, R.lap, R.gate, R.done ? 1 : 0, R.time, R.place, R.dq || '', progressOf(S, R)]); }
  rows.sort(function (a, b) { if (a[4] !== b[4]) return b[4] - a[4]; if (a[4]) return a[6] - b[6]; if (!!a[7] !== !!b[7]) return a[7] ? 1 : -1; return b[8] - a[8]; });
  return rows;
}
function finishCheck(nk, logger, dispatcher, state, g) { // the competition ends when everyone is done or out, or on the clock
  var G = gameOf(state, g), race = G.race; if (!race) return;
  var now = Date.now(), live = 0;
  for (var u in race.racers) { var R = race.racers[u]; if (!R.done && !R.dq) live++; }
  if (live && !(race.first && now - race.first > RACE_DNF) && now - race.t0 < RACE_LIMIT) return;
  var rows = standings(state, race);
  for (var v in race.racers) { var Q2 = state.players[v]; if (Q2 && Q2.run && Q2.run.t0 === race.t0) { if (!Q2.run.done) Q2.run.dq = Q2.run.dq || 'dnf'; Q2.run = null; } }
  gameSend(dispatcher, state, g, OP.GAME_EVENT, { k: 'results', rows: rows });
  G.race = null; G.dirty = true;
}
function raceTick(nk, logger, dispatcher, state, g, G, now) {
  G.q = G.q.filter(function (u) { var Q = state.players[u]; return Q && Q.g === g && !(Q.run && Q.run.mode === 'race'); });
  if (G.race) finishCheck(nk, logger, dispatcher, state, g);
  if (!G.race && G.q.length >= 2) {
    if (!G.cd) { G.cd = now + COMP_WAIT; G.dirty = true; }
    else if (now >= G.cd) { // lights out in 7 s: everyone in the queue onto the grid
      var t0 = now + RACE_GO, ids = G.q.splice(0, COMP_MAX), race = { g: g, t0: t0, racers: {}, order: [], n: ids.length, first: 0 };
      ids.forEach(function (u, i) { var Q = state.players[u]; Q.run = newRun('race', t0, g, i, Q.name); race.racers[u] = Q.run; placeTo(dispatcher, Q, g, Q.run.slot, { start: 'race', t0: t0 }); Q.tpFree = t0 + 1500; });
      G.race = race; G.cd = 0; G.dirty = true;
      gameSend(dispatcher, state, g, OP.GAME_EVENT, { k: 'race', t0: t0, ids: ids, n: names(state, ids) });
    }
  } else if (G.cd && G.q.length < 2) { G.cd = 0; G.dirty = true; }
  inWorld(state, g).forEach(function (Q) { if (Q.run && Q.run.mode === 'tt' && now - Q.run.t0 > RACE_LIMIT) { Q.run = null; G.dirty = true; } });
}

// ---- hide and seek
function hideTick(nk, logger, dispatcher, state, g, G, now) {
  var C = GD.ARENAS.hide.counts, here = inWorld(state, g);
  if (G.ph === 'wait') { if (here.length >= 2) { G.ph = 'count'; G.until = now + C.wait * 1000; G.dirty = true; } return; }
  if (G.ph === 'count') {
    if (here.length < 2) { G.ph = 'wait'; G.until = 0; G.dirty = true; return; }
    if (now < G.until) return;
    // a new round: one seeker (not last round's, if anyone else can), everyone else hides
    var pool = here.filter(function (Q) { return Q.uid !== G.last; }); if (!pool.length) pool = here;
    var S = pool[Math.floor(Math.random() * pool.length)], spots = GD.hsSpots(), at = {};
    for (var i = spots.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
    G.round++; G.seeker = S.uid; G.sname = S.name; G.last = S.uid; G.hiders = {}; G.names = {}; G.kos = 0; G.res = null; G.seekerLeft = false;
    var pz = GD.ARENAS.hide.plaza;
    here.forEach(function (Q, k) {
      if (Q === S) { at[Q.uid] = [pz[0], pz[1] + 20, Math.PI]; }
      else { G.hiders[Q.uid] = 0; G.names[Q.uid] = Q.name; at[Q.uid] = spots[k % spots.length]; }
      placeTo(dispatcher, Q, g, at[Q.uid], { round: G.round, role: Q === S ? 'seeker' : 'hider' });
    });
    G.ph = 'hide'; G.until = now + C.hide * 1000; G.dirty = true;
    gameSend(dispatcher, state, g, OP.GAME_EVENT, { k: 'round', round: G.round, seeker: S.uid, sn: S.name });
    return;
  }
  var alive = 0; for (var u in G.hiders) if (G.hiders[u] === 0) alive++;
  if (G.ph === 'hide' || G.ph === 'seek') {
    if (G.seekerLeft || !state.players[G.seeker] || state.players[G.seeker].g !== g) return hideEnd(nk, logger, dispatcher, state, g, G, 'hiders', 'The seeker left.');
    if (!alive) return hideEnd(nk, logger, dispatcher, state, g, G, 'seeker', 'Everyone found.');
    if (G.ph === 'hide') {
      var SP = state.players[G.seeker], A = GD.ARENAS.hide, pz2 = A.plaza; // the seeker waits on the plaza with eyes shut
      if (SP.p && now > (SP.tpFree || 0) && Math.hypot(SP.p.x - A.o[0] - pz2[0], SP.p.z - A.o[1] - pz2[1]) > HS_PEN_R) placeTo(dispatcher, SP, g, [pz2[0], pz2[1] + 20, Math.PI], { hold: 1 });
      if (now >= G.until) { G.ph = 'seek'; G.until = now + C.seek * 1000; G.dirty = true; gameSend(dispatcher, state, g, OP.GAME_EVENT, { k: 'seek' }); }
      return;
    }
    if (now >= G.until) return hideEnd(nk, logger, dispatcher, state, g, G, 'hiders', 'Time\'s up.');
    return;
  }
  if (G.ph === 'end' && now >= G.until) { G.ph = here.length >= 2 ? 'count' : 'wait'; G.until = G.ph === 'count' ? now + C.wait * 1000 : 0; G.dirty = true; }
}
function hideEnd(nk, logger, dispatcher, state, g, G, winner, why) {
  var now = Date.now(), surv = [];
  for (var u in G.hiders) if (G.hiders[u] === 0) surv.push(G.names[u]);
  G.res = { w: winner, why: why, kos: G.kos, surv: surv, sn: G.sname };
  G.ph = 'end'; G.until = now + GD.ARENAS.hide.counts.end * 1000; G.dirty = true;
  gameSend(dispatcher, state, g, OP.GAME_EVENT, { k: 'end', res: G.res });
  var S = state.players[G.seeker];
  if (S && S.g === g) awardXp(nk, logger, dispatcher, state, S, (winner === 'seeker' ? HS_XP.seekerWin : 0) + HS_XP.perKo * G.kos, 'seeker');
  for (var v in G.hiders) { var Q = state.players[v]; if (Q && Q.g === g && G.hiders[v] !== 2) awardXp(nk, logger, dispatcher, state, Q, G.hiders[v] === 0 ? HS_XP.survive : HS_XP.out, 'hider'); }
}
function hideHit(nk, logger, dispatcher, state, P, V, q) { // the seeker's rocket: one hit and that hider is out
  var G = gameOf(state, 'hide'), now = Date.now();
  if (G.ph !== 'seek' || P.uid !== G.seeker || G.hiders[V.uid] !== 0) return;
  if (String(q.w || '').toLowerCase() !== 'rocket launcher' || !(+q.d > 0)) return;
  if (Math.hypot(V.p.x - P.p.x, V.p.z - P.p.z) > HS_KO_RANGE) return;
  P.koWin = (P.koWin || []).filter(function (t) { return now - t < 2000; }); if (P.koWin.length >= 3) return; P.koWin.push(now); // one rocket can catch two hiders parked together, not a whole street a second
  G.hiders[V.uid] = 1; G.kos++; G.dirty = true;
  gameSend(dispatcher, state, 'hide', OP.GAME_EVENT, { k: 'ko', u: V.uid, n: V.name, by: P.name });
}

// ---- every tick: phases and clocks; the public state to everyone in that world when it changed (and twice a second
// while a clock is running, so a late joiner catches up)
function gamesTick(nk, logger, dispatcher, state, now) {
  if (!state.games) return;
  for (var g in state.games) {
    var G = state.games[g];
    try { if (G.kind === 'race') raceTick(nk, logger, dispatcher, state, g, G, now); else if (G.kind === 'hide') hideTick(nk, logger, dispatcher, state, g, G, now); }
    catch (e) { logger.error('game %s: %s', g, e.message || e); }
    var live = G.kind === 'race' ? !!(G.race || G.cd) : G.kind === 'hide' ? G.ph !== 'wait' : false;
    if (G.dirty || (live && now - G.sentAt > 2000)) { G.dirty = false; G.sentAt = now; gameSend(dispatcher, state, g, OP.GAME_STATE, gamePublic(state, g)); }
  }
}
function arenaState(nk, logger, dispatcher, state, P, prev, p, tPrev, now) {
  var A = GD.ARENAS[P.g]; if (!A) return;
  try {
    if (A.kind === 'flight') flightState(nk, logger, dispatcher, state, P, prev, p, tPrev, now);
    else if (A.kind === 'race') raceState(nk, logger, dispatcher, state, P, prev, p, tPrev, now);
  } catch (e) { logger.error('arena state %s: %s', P.g, e.message || e); }
}

// ---------------------------------------------------------------- start up
function InitModule(ctx, logger, nk, initializer) {
  // Plain calls only: Nakama reads InitModule's statements to find the registered functions, and a loop or an array
  // literal here (a forEach over the race boards) made it exit at start-up without a word.
  function board(id, operator, reset, order) {
    try { nk.leaderboardCreate(id, true, order || 'descending', operator, reset, null, true); } catch (e) { logger.debug('leaderboard %s: %s', id, e.message || e); }
  }
  board(BOARD.kd, 'set', null);
  board(BOARD.level, 'set', null);
  board(BOARD.kills_week, 'increment', '0 0 * * 1'); // every Monday 00:00 UTC
  board(BOARD.flight, 'best', null); // the longest jump (cm), air time as the subscore
  board(BOARD.race0, 'best', null, 'ascending'); // the fastest time (ms) on each course
  board(BOARD.race1, 'best', null, 'ascending');
  board(BOARD.race2, 'best', null, 'ascending');
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
