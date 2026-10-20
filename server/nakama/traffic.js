// ---------------------------------------------------------------- traffic: the room runs the cars, players only draw them
// The road graph comes from roads.js (built by tools/traffic/build-roads.mjs). Cars live near players: spawned 140-520 m
// out, dropped once they're 700 m from everyone. They keep to their lane at the road's speed, keep their distance, slow
// through junctions and pick a turn at random. Five times a second each player gets the cars within 560 m: new ones with
// their look, moving ones as numbers, gone ones by id. A player's hit stops a car (and can wreck it); a player who takes a
// car gets it for their own game and it leaves the traffic. deploy.sh joins roads.js + traffic.js + index.js into one module.
var TR = { PER: 14, MAX: 110, NEAR: 140, FAR: 520, DROP: 700, SEND: 560, EVERY: 2, HITS_PER_S: 12 };
var TR_SPEED = [29, 20, 17, 14, 11, 7]; // m/s by road type (index.html SPEED_T)
var TR_TYPES = ['sedan', 'sedan', 'sedan', 'suv', 'suv', 'pickup', 'van', 'sports', 'bus']; // the client gets the index
var TRG = null;
function trGraph() {
  if (TRG) return TRG;
  var E = ROADS.e, edges = [], adj = {}, grid = {}, C = 150;
  for (var i = 0; i < E.length; i++) {
    var r = E[i], p = r[6], n = p.length / 2, cum = [0];
    for (var k = 1; k < n; k++) cum.push(cum[k - 1] + Math.hypot((p[k * 2] - p[k * 2 - 2]) / 10, (p[k * 2 + 1] - p[k * 2 - 1]) / 10));
    var e = { i: i, a: r[0], b: r[1], t: r[2], w: r[3], ow: r[4], v: r[5] ? r[5] * 0.447 : (TR_SPEED[r[2]] || 12), p: p, cum: cum, len: Math.max(cum[n - 1], 0.1) };
    edges.push(e); (adj[e.a] || (adj[e.a] = [])).push(i); (adj[e.b] || (adj[e.b] = [])).push(i);
    for (var k2 = 0; k2 < n; k2++) { var key = Math.floor(p[k2 * 2] / 10 / C) + ',' + Math.floor(p[k2 * 2 + 1] / 10 / C), c = grid[key] || (grid[key] = []); if (c[c.length - 1] !== i) c.push(i); }
  }
  TRG = { edges: edges, adj: adj, grid: grid, C: C }; return TRG;
}
function trAt(e, d, o) {
  d = Math.max(0, Math.min(e.len, d)); var c = e.cum, lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { var m = (lo + hi) >> 1; if (c[m] <= d) lo = m; else hi = m; }
  var p = e.p, L = (c[hi] - c[lo]) || 0.001, t = (d - c[lo]) / L, ax = p[lo * 2] / 10, az = p[lo * 2 + 1] / 10, bx = p[hi * 2] / 10, bz = p[hi * 2 + 1] / 10, l = Math.hypot(bx - ax, bz - az) || 1;
  o.x = ax + (bx - ax) * t; o.z = az + (bz - az) * t; o.tx = (bx - ax) / l; o.tz = (bz - az) / l; return o;
}
function trLane(e) { return e.ow ? (e.w > 10 ? 2 : 0) : Math.max(1.6, Math.min(3.6, e.w * 0.22)); } // index.html laneOff
var _tro = { x: 0, z: 0, tx: 0, tz: 0 };
function trPose(car) {
  var e = TRG.edges[car.e], o = trAt(e, car.d > 0 ? car.s : e.len - car.s, _tro), tx = car.d > 0 ? o.tx : -o.tx, tz = car.d > 0 ? o.tz : -o.tz, off = trLane(e);
  car.x = o.x - tz * off; car.z = o.z + tx * off; car.r = Math.atan2(tx, tz);
}
function trNext(car) { // a turn at the junction ahead, main roads more likely; a dead end turns round (unless one-way)
  var e = TRG.edges[car.e], node = car.d > 0 ? e.b : e.a, opts = TRG.adj[node] || [], ch = [], tw = 0;
  for (var i = 0; i < opts.length; i++) {
    var ei = opts[i]; if (ei === car.e) continue; var n = TRG.edges[ei], dir = n.a === node ? 1 : -1; if (n.ow && dir < 0) continue;
    var w = n.t <= 3 ? 2.2 : 1; ch.push([ei, dir, w]); tw += w;
  }
  if (!ch.length) return e.ow ? null : [car.e, -car.d];
  var r = Math.random() * tw; for (var j = 0; j < ch.length; j++) { r -= ch[j][2]; if (r <= 0) return ch[j]; } return ch[0];
}
function trSpawn(tr, px, pz, players) {
  for (var tries = 0; tries < 6; tries++) {
    var a = Math.random() * Math.PI * 2, d = TR.NEAR + Math.random() * (TR.FAR - TR.NEAR), x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
    var cell = TRG.grid[Math.floor(x / TRG.C) + ',' + Math.floor(z / TRG.C)]; if (!cell || !cell.length) continue;
    var ei = cell[Math.floor(Math.random() * cell.length)], e = TRG.edges[ei];
    var car = { id: ++tr.seq, e: ei, d: e.ow || Math.random() < 0.5 ? 1 : -1, s: Math.random() * e.len, v: 0, vmax: e.v * (0.85 + Math.random() * 0.25),
      ty: Math.floor(Math.random() * TR_TYPES.length), ti: Math.floor(Math.random() * 16), md: Math.floor(Math.random() * 8), hp: 100, stop: 0, x: 0, z: 0, r: 0 };
    if (TR_TYPES[car.ty] === 'bus' && e.t > 3) car.ty = 0; // buses keep to the bigger roads
    trPose(car);
    var close = false; for (var k in players) { var P = players[k]; if (P.p && Math.hypot(P.p.x - car.x, P.p.z - car.z) < TR.NEAR * 0.8) { close = true; break; } }
    if (close) continue;
    car.v = car.vmax * 0.7; tr.cars[car.id] = car; tr.n++; return car;
  }
  return null;
}
function trafficTick(state, dispatcher, dt, tick) {
  trGraph();
  var tr = state.tr || (state.tr = { cars: {}, n: 0, seq: 0, booms: [] }), players = state.players, id, car, k, P;
  // drive: cars on the same road and direction keep their distance from the one ahead
  var lanes = {};
  for (id in tr.cars) { car = tr.cars[id]; var key = car.e + ':' + car.d; (lanes[key] || (lanes[key] = [])).push(car); }
  for (var lk in lanes) {
    var list = lanes[lk]; list.sort(trBySpot);
    for (var i = 0; i < list.length; i++) {
      car = list[i]; var e = TRG.edges[car.e], want = car.vmax;
      if (car.stop > 0) { car.stop -= dt; want = 0; }
      var ahead = list[i + 1]; if (ahead) want = Math.min(want, Math.max(0, (ahead.s - car.s - 7) * 0.9));
      var left = e.len - car.s; if (left < 16 && (TRG.adj[car.d > 0 ? e.b : e.a] || []).length > 2) want = Math.min(want, 6 + left * 0.45); // ease through junctions
      car.v += Math.max(-7 * dt, Math.min(3 * dt, want - car.v)); if (car.v < 0) car.v = 0;
      car.s += car.v * dt;
      while (car.s > TRG.edges[car.e].len) {
        var ov = car.s - TRG.edges[car.e].len, nx = trNext(car);
        if (!nx) { car.s = TRG.edges[car.e].len; car.v = 0; break; }
        car.e = nx[0]; car.d = nx[1]; car.s = ov;
      }
      trPose(car);
    }
  }
  // population: drop cars nobody is near, top up around each player
  for (id in tr.cars) {
    car = tr.cars[id]; var near = false;
    for (k in players) { P = players[k]; if (P.p && Math.hypot(P.p.x - car.x, P.p.z - car.z) < TR.DROP) { near = true; break; } }
    if (!near) { delete tr.cars[id]; tr.n--; }
  }
  if (tick % 5 === 0) for (k in players) {
    P = players[k]; if (!P.p) continue; var cnt = 0;
    for (id in tr.cars) { car = tr.cars[id]; if (Math.hypot(P.p.x - car.x, P.p.z - car.z) < TR.FAR) cnt++; }
    if (cnt < TR.PER && tr.n < TR.MAX) trSpawn(tr, P.p.x, P.p.z, players);
  }
  // send: each player the cars around them
  if (tick % TR.EVERY !== 0) return;
  var booms = tr.booms; tr.booms = [];
  for (k in players) {
    P = players[k]; if (!P.p) continue; var known = P.tk || (P.tk = {}), mov = [], neu = [], gone = [], seen = {};
    for (id in tr.cars) {
      car = tr.cars[id]; if (Math.hypot(P.p.x - car.x, P.p.z - car.z) > TR.SEND) continue; seen[id] = 1;
      if (!known[id]) { known[id] = 1; neu.push([car.id, car.ty, car.ti, car.md]); }
      mov.push([car.id, Math.round(car.x * 10), Math.round(car.z * 10), Math.round(car.r * 100), Math.round(car.v * 10)]);
    }
    for (id in known) if (!seen[id]) { gone.push(+id); delete known[id]; }
    var bm = []; for (var b = 0; b < booms.length; b++) if (Math.hypot(P.p.x - booms[b][1], P.p.z - booms[b][2]) < TR.SEND) bm.push(booms[b]);
    if (mov.length || gone.length || bm.length) send(dispatcher, OP.TRAFFIC, { t: Date.now(), n: neu, c: mov, g: gone, x: bm }, [P.presence]);
  }
}
function trBySpot(a, b) { return a.s - b.s; }
function onCarHit(state, P, q) { // a player's car or gun hit a traffic car: it stops, and enough damage wrecks it
  var tr = state.tr, car = tr && tr.cars[q.id | 0], now = Date.now(); if (!car || !P.p || P.dead) return;
  P.thWin = (P.thWin || []).filter(function (t) { return now - t < 1000; }); if (P.thWin.length >= TR.HITS_PER_S) return; P.thWin.push(now);
  if (Math.hypot(P.p.x - car.x, P.p.z - car.z) > 60) return;
  var dmg = Math.max(0, Math.min(150, +q.d || 0)); car.hp -= dmg; car.stop = Math.max(car.stop, 2 + Math.min(5, dmg / 15)); car.v = Math.min(car.v * 0.2, 1.5); // a hit stops it
  if (car.hp <= 0) { tr.booms.push([car.id, car.x, car.z, car.r, car.ty, car.ti, car.md]); delete tr.cars[car.id]; tr.n--; }
}
function onCarTake(state, P, q) { // a player took this car: it's theirs now, out of the traffic for everyone
  var tr = state.tr, car = tr && tr.cars[q.id | 0]; if (!car || !P.p || P.dead) return;
  if (Math.hypot(P.p.x - car.x, P.p.z - car.z) > 12) return;
  delete tr.cars[car.id]; tr.n--;
}
