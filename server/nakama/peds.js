// ---------------------------------------------------------------- people: the room walks them, players only draw them
// Like the traffic (traffic.js, whose road graph this shares): people live near players, on the sidewalks of the
// streets (types 1-5) and along the trails (6). Spawned 40-170 m out, dropped once they're 240 m from everyone. They
// stroll at their own pace, stop now and then, and at a corner pick a way at random. A gunshot (a player's shot counter
// going up) or an explosion near them sends everyone within reach running away from it for a few seconds. A player's hit
// can kill one: the room keeps the body a while and every game sees it fall. Five times a second each player gets the
// people within 200 m: new ones with their look, moving ones as numbers, gone ones by id.
// deploy.sh joins roads.js + traffic.js + peds.js + index.js into one module.
var PD = { PER: 32, MAX: 240, NEAR: 40, FAR: 170, DROP: 240, SEND: 200, EVERY: 2, LOOKS: 64, HITS_PER_S: 15, BODY_S: 30 };
function pdWalkable(e) { return e.t >= 1 && e.t <= 6; }
function pdOff(e) { return e.t === 6 ? 0.6 : e.w / 2 + 1.3; } // the middle of the sidewalk (index.html: a 2.2 m ribbon 0.1 m off the asphalt)
function pdPose(p) {
  var e = TRG.edges[p.e], o = trAt(e, p.d > 0 ? p.s : e.len - p.s, TRG.o), tx = p.d > 0 ? o.tx : -o.tx, tz = p.d > 0 ? o.tz : -o.tz, off = pdOff(e) * p.side;
  p.x = o.x - tz * off; p.z = o.z + tx * off; p.r = Math.atan2(tx, tz);
}
function pdNext(p, away) { // the way on at the corner ahead; running from something, the way that leads furthest from it
  var e = TRG.edges[p.e], node = p.d > 0 ? e.b : e.a, opts = TRG.adj[node] || [], ch = [];
  for (var i = 0; i < opts.length; i++) {
    var ei = opts[i]; if (ei === p.e) continue; var n = TRG.edges[ei]; if (!pdWalkable(n)) continue;
    ch.push([ei, n.a === node ? 1 : -1]);
  }
  if (!ch.length) return [p.e, -p.d];
  if (away) { var best = ch[0], bd = -1e9; for (var j = 0; j < ch.length; j++) { var m = TRG.edges[ch[j][0]], far = trAt(m, ch[j][1] > 0 ? m.len : 0, TRG.o), d = Math.hypot(far.x - away[0], far.z - away[1]); if (d > bd) { bd = d; best = ch[j]; } } return best; }
  return ch[Math.floor(Math.random() * ch.length)];
}
function pdSpawn(pd, px, pz, players) {
  for (var tries = 0; tries < 6; tries++) {
    var a = Math.random() * Math.PI * 2, dd = PD.NEAR + Math.random() * (PD.FAR - PD.NEAR), x = px + Math.cos(a) * dd, z = pz + Math.sin(a) * dd;
    var cell = TRG.grid[Math.floor(x / TRG.C) + ',' + Math.floor(z / TRG.C)]; if (!cell || !cell.length) continue;
    var ei = cell[Math.floor(Math.random() * cell.length)], e = TRG.edges[ei]; if (!pdWalkable(e)) continue;
    var p = { id: ++pd.seq, e: ei, d: Math.random() < 0.5 ? 1 : -1, s: Math.random() * e.len, side: Math.random() < 0.5 ? 1 : -1, look: Math.floor(Math.random() * PD.LOOKS),
      vw: 1.15 + Math.random() * 0.5, v: 0, st: 0, t: 0, hp: 100, x: 0, z: 0, r: 0 };
    p.v = p.vw; pdPose(p);
    var close = false; for (var k in players) { var P = players[k]; if (P.p && Math.hypot(P.p.x - p.x, P.p.z - p.z) < PD.NEAR * 0.75) { close = true; break; } }
    if (close) continue;
    pd.list[p.id] = p; pd.n++; return p;
  }
  return null;
}
function pdScare(pd, x, z, R) { // run from (x, z): the way that takes them away from it, for a few seconds
  for (var id in pd.list) {
    var p = pd.list[id]; if (p.st === 2) continue; var d = Math.hypot(p.x - x, p.z - z); if (d > R) continue;
    var e = TRG.edges[p.e], o = trAt(e, p.d > 0 ? p.s : e.len - p.s, TRG.o), tx = p.d > 0 ? o.tx : -o.tx, tz = p.d > 0 ? o.tz : -o.tz;
    if (tx * (p.x - x) + tz * (p.z - z) < 0) { p.d = -p.d; p.s = e.len - p.s; } // turn round: away from it
    p.st = 1; p.t = 6 + Math.random() * 5; p.v = 4.2 + Math.random() * 1.4; p.from = [x, z];
  }
}
function pedsTick(state, dispatcher, dt, tick) {
  trGraph();
  var pd = state.pd || (state.pd = { list: {}, n: 0, seq: 0 }), players = state.players, id, p, k, P;
  // what frightens them: a player's shot counter going up, the explosions the players report (index.js OP.EVENT)
  for (k in players) { P = players[k]; if (!P.p) continue; var sh = P.p.shots | 0; if (P.pdShots !== undefined && sh !== P.pdShots) pdScare(pd, P.p.x, P.p.z, 45); P.pdShots = sh; }
  if (state.pdBooms) { for (var b = 0; b < state.pdBooms.length; b++) pdScare(pd, state.pdBooms[b][0], state.pdBooms[b][1], state.pdBooms[b][2]); state.pdBooms = null; }
  for (id in pd.list) {
    p = pd.list[id];
    if (p.st === 2) { p.t -= dt; if (p.t <= 0) { delete pd.list[id]; pd.n--; } continue; } // a body, for a while
    if (p.st === 3) { p.t -= dt; if (p.t <= 0) { p.st = 0; p.v = p.vw; } continue; }      // stood still a moment
    if (p.st === 1) { p.t -= dt; if (p.t <= 0) { p.st = 0; p.v = p.vw; p.from = null; } }
    else if (Math.random() < dt / 40) { p.st = 3; p.t = 2 + Math.random() * 5; p.v = 0; continue; } // now and then a pause
    p.s += p.v * dt;
    var guard = 0;
    while (p.s > TRG.edges[p.e].len && guard++ < 4) { var ov = p.s - TRG.edges[p.e].len, nx = pdNext(p, p.st === 1 ? p.from : null); p.e = nx[0]; p.d = nx[1]; p.s = ov; }
    pdPose(p);
  }
  // population: drop the ones nobody is near, top up round each player
  for (id in pd.list) {
    p = pd.list[id]; var near = false;
    for (k in players) { P = players[k]; if (P.p && Math.hypot(P.p.x - p.x, P.p.z - p.z) < PD.DROP) { near = true; break; } }
    if (!near) { delete pd.list[id]; pd.n--; }
  }
  if (tick % 3 === 0) for (k in players) {
    P = players[k]; if (!P.p || P.p.ak) continue; var cnt = 0; // ak: flying: nobody to walk past up there
    for (id in pd.list) { p = pd.list[id]; if (Math.hypot(P.p.x - p.x, P.p.z - p.z) < PD.FAR) cnt++; }
    if (cnt < PD.PER && pd.n < PD.MAX) pdSpawn(pd, P.p.x, P.p.z, players);
  }
  // send: each player the people round them
  if (tick % PD.EVERY !== 0) return;
  for (k in players) {
    P = players[k]; if (!P.p) continue; var known = P.pk || (P.pk = {}), mov = [], neu = [], gone = [], seen = {};
    for (id in pd.list) {
      p = pd.list[id]; if (Math.hypot(P.p.x - p.x, P.p.z - p.z) > PD.SEND) continue; seen[id] = 1;
      if (!known[id]) { known[id] = 1; neu.push([p.id, p.look]); }
      mov.push([p.id, Math.round(p.x * 10), Math.round(p.z * 10), Math.round(p.r * 100), p.st, Math.round(p.v * 10)]);
    }
    for (id in known) if (!seen[id]) { gone.push(+id); delete known[id]; }
    if (mov.length || gone.length) send(dispatcher, OP.PEDS, { t: Date.now(), n: neu, c: mov, g: gone }, [P.presence]);
  }
}
function onPedHit(state, P, q) { // a player hurt one of the room's people: enough kills them, and everyone near runs
  var pd = state.pd, p = pd && pd.list[q.id | 0], now = Date.now(); if (!p || p.st === 2 || !P.p || P.dead) return;
  P.phWin = (P.phWin || []).filter(function (t) { return now - t < 1000; }); if (P.phWin.length >= PD.HITS_PER_S) return; P.phWin.push(now);
  if (Math.hypot(P.p.x - p.x, P.p.z - p.z) > 260) return; // the longest gun's reach, with some slack
  p.hp -= Math.max(0, Math.min(300, +q.d || 0));
  if (p.hp <= 0) { p.st = 2; p.t = PD.BODY_S; p.v = 0; pdScare(pd, p.x, p.z, 35); }
  else if (p.st !== 1) pdScare(pd, p.x, p.z, 20);
}
