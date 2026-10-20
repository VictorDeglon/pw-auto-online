// The crew garages and their worlds: the data both sides need. The game builds the worlds from it; the server
// (server/nakama/index.js) judges the games with it: where the garage doors are, the jump ramp's lip, the race
// courses and their checkpoints, the hide-and-seek spawns.
//
// Everything between BEGIN SHARED and END SHARED is copied into server/nakama/index.js by
// `node tools/sync-game-defs.mjs` (run it after any change here; `--check` fails if the copies differ), so it is plain
// ES5: var and function, no modules, nothing from the browser.
//
// The worlds sit far east of town, 10 km apart, from x = 80 km: past the core map (to 7.5 km) and past the outer world's
// terrain tiles (they stop at 57.5 km east), so nothing of the real map is ever drawn or streamed in around one, and the
// game's own systems (heightAt, collisions, rays) work there unchanged.
// Nakama freezes every object a module builds at load and runs it in strict mode, so nothing below may be written to
// after load: caches are made on first use (see courseOf).
// Each world has its own local frame: world x = o[0] + local x, world z = o[1] + local z. Yaw as in the game:
// 0 faces +z, PI/2 faces +x.
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
export const DEFS = GAME_DEFS;
