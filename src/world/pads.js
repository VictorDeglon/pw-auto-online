// Graded lots: a house on a slope stands on a level pad, the way hillside lots here are graded. The lot behind the side
// gates (the house, its side yards and its back yard, out to the lot lines: half way to a neighbour's wall, short of a
// street) is cut into the hill on its high side and filled out over it on its low side. The house's terrace is level
// with the ground where the driveway meets the garage (or the walk meets the door), so the front yard keeps its grade;
// where the hill keeps falling (or rising) behind the house the back yard steps down (or up) in terraces, up to three,
// each a level of its own, joined by stairs through the retaining wall between them. A pool is always on one terrace,
// whole. Along the lot lines a wall, stepped down the slope, holds the ground where a terrace and the land beyond part,
// with a fence above the higher side: stuccoed block, block with pilasters, stone pillars, wood, white vinyl or a split
// rail by the neighbourhood, wrought iron on the side with the view. Some lots round their corners in a curved wall.
// The side yards' front walls have a gate by the house, with steps where the ground beyond is higher or lower. Shrubs
// line the walls and a tree stands in a back corner. Where a wall would hold more than CAP of ground (CAP_POOL to keep
// a pool) the lot pulls in; where even a small one can't, the house keeps its stepped foundation.
// The terrain mesh's 4 and 12.8 m cells can't follow a terrace's edge: the ground shader skips its fragments inside a
// pad that aren't at the pad's level (setPadCuts, src/nature/ground.js) and each pad's top is added to the terrain tile
// under it (index.html finishPads); the walls, drawn with the house's yard, close its edges. Feet, wheels and plants
// take their height from at(x, z), stairs included.
//   const PADS = createPads([x0, z0, x1, z1])
//   PADS.plan(flat, Y, H) -> lot | null   Y: the house's yard (src/world/yards.js); H: { nat(x, z): the ground mesh
//     without pads, natB(x, z): the same with a street's graded bench, inside(x, z): in any building, mine(x, z): in this
//     one, onRoad(x, z), pools(x, z, r): [[x, z, w, d, angle]] near, rnd(): this house's random stream, look, rural }
//   PADS.add(lot, ok) -> false when it can't be (ok(pad) false for a terrace, a grid cell full)
//   PADS.at(x, z, g) -> the ground on a pad there (a stair over g, the ground beneath, never under it), or null
//   PADS.cuts() -> { grid (RGBA8, SLOTS / 2 texels a cell), nx, nz, slots, rect: [x0, z0, cell], table (8 floats a terrace) }
//   lot: { y (the house's level), pads (terraces), stairs (sloped pads, for heights only), walls, flights, plants }
//   pad: { cx, cz, tx, tz, hu, hv (centre, along, half sizes along and across), y, r, rm (corner radius, which
//          corners), g (a stair's slope along), corners: [[x, z] x 4], outline: [[x, z]] }
//   wall: { ax, az, tx, tz, nx, nz (into the yard), len, kind, top, gate, gw (its width), gy (its sill), step,
//          pieces: Float32Array [s0, s1, lo, mid] per piece } (mid: the higher ground there; the fence stands top over it)
//   flight: { x, z, tx, tz (the top's centre, down the run), w, n, tread, y0, y1, side (the one cheek wall's side, or 0
//          for both), landing: [x, z, tx, tz, y] | undefined }
//   plants: [[species, x, z, scale (0: a tree's own size)]]
const CELL = 16, SLOTS = 8, CAP = 3.0, CAP_POOL = 4.5, STEP = 1.5, DROP = 2.4, DECK = 1.8, SIDE = 8, BACK = 14, FLAT = 0.35, FRONT = -1.5;
const WALL_H = 1.75, GUARD_H = 1.1, OPEN_H = 1.25, RISE = 0.18, TREAD = 0.3, STAIR_W = 1.3;
const OPEN = new Set(['iron', 'stoneIron', 'rail']);

export function createPads(rect) {
  const [X0, Z0, X1, Z1] = rect, NX = Math.max(1, Math.ceil((X1 - X0) / CELL)), NZ = Math.max(1, Math.ceil((Z1 - Z0) / CELL));
  const grid = new Uint16Array(NX * NZ * SLOTS), list = [], steps = new Map(); // up to SLOTS terraces a cell, numbered from 1; the stairs by cell
  const within = (q, lx, ly) => { // in the pad's own frame: inside its rectangle, and inside a rounded corner
    const ax = Math.abs(lx), ay = Math.abs(ly); if (ax >= q.hu || ay >= q.hv) return false;
    if (q.r) { const ex = ax - (q.hu - q.r), ey = ay - (q.hv - q.r); if (ex > 0 && ey > 0 && (q.rm >> ((lx > 0 ? 1 : 0) + (ly > 0 ? 2 : 0)) & 1) && ex * ex + ey * ey > q.r * q.r) return false; }
    return true;
  };
  const cellsOf = q => { // the cells a pad's rectangle reaches into
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of q.corners) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    const out = [], r = CELL / 2 * (Math.abs(q.tx) + Math.abs(q.tz));
    for (let gz = Math.max(0, Math.floor((z0 - Z0) / CELL)); gz <= Math.min(NZ - 1, Math.floor((z1 - Z0) / CELL)); gz++) for (let gx = Math.max(0, Math.floor((x0 - X0) / CELL)); gx <= Math.min(NX - 1, Math.floor((x1 - X0) / CELL)); gx++) {
      const dx = X0 + (gx + 0.5) * CELL - q.cx, dz = Z0 + (gz + 0.5) * CELL - q.cz;
      if (Math.abs(dx * q.tx + dz * q.tz) < q.hu + r && Math.abs(dx * q.tz - dz * q.tx) < q.hv + r) out.push(gz * NX + gx);
    }
    return out;
  };
  const overlap = (a, b) => { // two pads' rectangles (separating axes)
    const dx = b.cx - a.cx, dz = b.cz - a.cz;
    for (const [ux, uz] of [[a.tx, a.tz], [a.tz, -a.tx], [b.tx, b.tz], [b.tz, -b.tx]]) {
      const ra = a.hu * Math.abs(ux * a.tx + uz * a.tz) + a.hv * Math.abs(ux * a.tz - uz * a.tx), rb = b.hu * Math.abs(ux * b.tx + uz * b.tz) + b.hv * Math.abs(ux * b.tz - uz * b.tx);
      if (Math.abs(dx * ux + dz * uz) >= ra + rb) return false;
    }
    return true;
  };
  const near = q => { const s = new Set(); for (const c of cellsOf(q)) for (let k = c * SLOTS; k < c * SLOTS + SLOTS && grid[k]; k++) s.add(list[grid[k] - 1]); return s; };
  function at(x, z, g = -1e9) {
    if (!list.length) return null;
    const gx = Math.floor((x - X0) / CELL), gz = Math.floor((z - Z0) / CELL); if (gx < 0 || gz < 0 || gx >= NX || gz >= NZ) return null;
    let h = null, level = false; const c = gz * NX + gx, S2 = steps.get(c);
    for (let k = c * SLOTS, e = k + SLOTS; k < e; k++) {
      const id = grid[k]; if (!id) break; const q = list[id - 1], dx = x - q.cx, dz = z - q.cz;
      if (within(q, dx * q.tx + dz * q.tz, dx * q.tz - dz * q.tx) && (h === null || q.y > h)) { h = q.y; level = true; }
    }
    if (S2) for (const q of S2) { const dx = x - q.cx, dz = z - q.cz, lx = dx * q.tx + dz * q.tz; if (!within(q, lx, dx * q.tz - dz * q.tx)) continue; const v = q.y + q.g * lx; if (h === null || v > h) h = v; }
    return h === null || level ? h : Math.max(h, g); // a stair outside the terraces stands on the ground, never under it
  }
  function plan(flat, Y, H) {
    const F = Y.f, n = flat.length / 2, pt = (u, d) => [F.ax + F.tx * u + F.ox * d, F.az + F.tz * u + F.oz * d], nat = (u, d) => H.nat(...pt(u, d));
    const S = F.ox * F.tz - F.oz * F.tx > 0 ? 1 : -1; // which way a pad's across axis runs: toward the front, or the back
    let uA = 1e9, uB = -1e9, dB = 1e9; // the house in the frame of its front wall: u along it, d out of it
    for (let i = 0; i < n; i++) { const x = flat[i * 2] - F.ax, z = flat[i * 2 + 1] - F.az, u = x * F.tx + z * F.tz, d = x * F.ox + z * F.oz; uA = Math.min(uA, u); uB = Math.max(uB, u); dB = Math.min(dB, d); }
    if (dB > FRONT - 2) return null;
    const G = Y.gar, y = H.natB(...pt(G ? G.gx0 + G.gw / 2 : Y.door + 0.48, 0.6)); // the level: where the drive (or the walk) meets the house
    { let m = 0; for (const [u, d] of [[uA - 3, FRONT], [uB + 3, FRONT], [uA - 3, dB - 6], [uB + 3, dB - 6], [(uA + uB) / 2, dB - 6], [uA - 3, (FRONT + dB) / 2], [uB + 3, (FRONT + dB) / 2], [(uA + uB) / 2, (FRONT + dB) / 2], [uA, dB], [uB, dB]]) m = Math.max(m, Math.abs(nat(u, d) - y));
      if (m < FLAT) return null; } // about level already: no pad
    for (let i = 0; i < n; i++) if (Math.abs(H.nat(flat[i * 2], flat[i * 2 + 1]) - y) > CAP + 0.8) return null; // the house itself spans a cliff
    const away = (x, z) => H.onRoad(x, z) ? 2 : H.inside(x, z) && !H.mine(x, z) ? 1 : 0;
    // how far the lot runs from (u, d) along (du, dd): half way to a neighbour's wall, short of a street, else max
    const probe = (u, d, du, dd, max) => { for (let w = 1; w <= max; w += 1) { const k = away(...pt(u + du * w, d + dd * w)); if (k) return k === 2 ? w - 1.7 : w / 2 - 0.25; } return max; };
    const E = { L: SIDE, R: SIDE, B: BACK }, floor = { L: 0, R: 0, B: 0 };
    for (const d of [FRONT - 0.3, (FRONT + dB) / 2, dB + 0.3]) { E.L = Math.min(E.L, probe(uA, d, -1, 0, SIDE)); E.R = Math.min(E.R, probe(uB, d, 1, 0, SIDE)); }
    for (const u of [uA + 0.4, (uA + uB) / 2, uB - 0.4]) E.B = Math.min(E.B, probe(u, dB, 0, -1, BACK));
    for (const k of 'LRB') E[k] = Math.max(0.3, E[k]);
    // a pool behind the house is the yard's level ground: the lot takes it in with its deck, past the half-way line if need be
    const PL = [];
    for (const [x, z, w, d, a] of H.pools(...pt((uA + uB) / 2, (FRONT + dB) / 2), 40)) {
      const c = Math.cos(a), sn = Math.sin(a), hw = w / 2 + DECK, hd = d / 2 + DECK, deck = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [x + c * i * hw - sn * j * hd, z + sn * i * hw + c * j * hd]);
      const U = deck.map(([px, pz]) => (px - F.ax) * F.tx + (pz - F.az) * F.tz), D = deck.map(([px, pz]) => (px - F.ax) * F.ox + (pz - F.az) * F.oz);
      const P = { u0: Math.min(...U), u1: Math.max(...U), d0: Math.min(...D), d1: Math.max(...D) }, cu = (P.u0 + P.u1) / 2, cd = (P.d0 + P.d1) / 2;
      if (cd > FRONT || cu < uA - E.L - 1 || cu > uB + E.R + 1 || cd < dB - E.B - 1) continue; // in the front yard, or in the next lot
      if (P.u0 < uA) floor.L = Math.max(floor.L, Math.min(SIDE + 4, uA - P.u0)); if (P.u1 > uB) floor.R = Math.max(floor.R, Math.min(SIDE + 4, P.u1 - uB)); if (P.d0 < dB) floor.B = Math.max(floor.B, Math.min(BACK + 4, dB - P.d0));
      PL.push(P);
    }
    for (const k of 'LRB') E[k] = Math.max(E[k], floor[k]);
    // anything else inside (a shed, a casita, a street's edge): the side it's on pulls in, whichever loses less yard
    for (let u = uA - E.L + 0.5; u < uB + E.R; u += 3) for (let d = dB - E.B + 0.5; d < FRONT; d += 3) {
      if (u > uA && u < uB && d > dB) continue; if (!away(...pt(u, d))) continue;
      const cand = []; if (u < uA) cand.push(['L', uA - u - 0.8, FRONT - dB + E.B]); if (u > uB) cand.push(['R', u - uB - 0.8, FRONT - dB + E.B]); if (d < dB) cand.push(['B', dB - d - 0.8, uB - uA + E.L + E.R]);
      let best = null; for (const [k, to, span] of cand) { if (to >= E[k]) { best = null; break; } const loss = (E[k] - to) * span; if (!best || loss < best[2]) best = [k, to, loss]; }
      if (best) { E[best[0]] = Math.max(0.3, best[1]); floor[best[0]] = Math.min(floor[best[0]], E[best[0]]); }
    }
    // the ground over the whole candidate, every 2 m: what the terraces and the walls along the lot lines are cut from
    const gu = uA - E.L, gd = dB - E.B, GU = Math.ceil((uB + E.R - gu) / 2) + 2, GD = Math.ceil((FRONT - gd) / 2) + 2, hg = new Float32Array(GU * GD);
    for (let j = 0; j < GD; j++) for (let i = 0; i < GU; i++) hg[j * GU + i] = nat(gu + i * 2, gd + j * 2);
    const hAt = (u, d) => { const fu = Math.min(GU - 1.001, Math.max(0, (u - gu) / 2)), fd = Math.min(GD - 1.001, Math.max(0, (d - gd) / 2)), i = fu | 0, j = fd | 0, a = fu - i, b = fd - j, k = j * GU + i;
      return (hg[k] * (1 - a) + hg[k + 1] * a) * (1 - b) + (hg[k + GU] * (1 - a) + hg[k + GU + 1] * a) * b; };
    const row = (d, u0, u1) => { const H2 = []; for (let u = u0; u <= u1 + 0.01; u += Math.max(1, (u1 - u0) / 8)) H2.push(hAt(u, d)); return H2; };
    const off = (d, u0, u1, ty) => Math.max(...row(d, u0, u1).map(h => Math.abs(h - ty))), mean = (d, u0, u1) => { const H2 = row(d, u0, u1); return H2.reduce((a, b) => a + b, 0) / H2.length; };
    // the lot behind the house, terraced: walking back, a new terrace where the ground has left this one's level by STEP
    const terraces = (u0, u1, dL) => {
      const T = [{ y, f: FRONT, b: dL }];
      for (let d = dB - 1; d > dL + 3.5 && T.length < 3; d -= 0.5) {
        const L = T[T.length - 1]; if (d > L.f - 3.5 || off(d, u0, u1, L.y) <= STEP) continue;
        const span = Math.min(4, d - dL), ny = Math.max(L.y - DROP, Math.min(L.y + DROP, mean(d - span / 2, u0, u1))); if (Math.abs(ny - L.y) < 0.4) continue; // no wall between terraces over DROP: a steeper lot takes more of them
        L.b = d; T.push({ y: ny, f: d, b: dL });
      }
      for (const P of PL) for (let k = 0; k < T.length - 1; k++) { // a pool on one terrace, whole: the step moves to the deck's near or far edge
        const b = T[k].b; if (!(P.d0 < b && P.d1 > b)) continue;
        const toBack = P.d0 - 0.2, toFront = P.d1 + 0.2, okB = toBack - T[k + 1].b >= 3 || k + 1 === T.length - 1 && toBack - T[k + 1].b >= 2, okF = T[k].f - toFront >= 3 && (k > 0 || toFront <= dB - 0.5);
        const nb = okB && (!okF || b - toBack <= toFront - b) ? toBack : okF ? toFront : null;
        if (nb === null) { T[k].b = T[k + 1].b; T.splice(k + 1, 1); k--; continue; } // no room either way: one terrace for both
        T[k].b = T[k + 1].f = nb; if (nb === toFront) T[k + 1].y = mean((P.d0 + P.d1) / 2, P.u0, P.u1); // the pool's terrace takes the pool's own ground, however far down
      }
      for (const P of PL) { const k = T.findIndex(t => P.d0 >= t.b - 0.01 && P.d1 <= t.f + 0.01); if (k > 0) T[k].y = mean((P.d0 + P.d1) / 2, P.u0, P.u1); } // a pool's terrace: the pool's own ground
      return T;
    };
    let T = null, u0, u1, dL;
    for (let it = 0; it < 48 && !T; it++) {
      u0 = uA - E.L; u1 = uB + E.R; dL = dB - E.B; const c = terraces(u0, u1, dL); let fix = null;
      const box = { ...rectOf(pt, u0, u1, dL, FRONT, F) };
      for (const p of near(box)) if (!p.stair && overlap(p, box)) { const x = p.cx - F.ax, z = p.cz - F.az, u = x * F.tx + z * F.tz; fix = u < uA ? 'L' : u > uB ? 'R' : 'B'; floor[fix] = 0; break; } // a neighbour's lot: pull in toward it
      if (!fix) { // the walls: no more than CAP over the ground below them along the lot lines (more round a pool)
        const runs = []; for (const t of c) runs.push(['L', u0, t.f, u0, t.b, t.y], ['R', u1, t.b, u1, t.f, t.y]);
        runs.push(['B', u0, dL, u1, dL, c[c.length - 1].y], ['L', uA, FRONT, u0, FRONT, y], ['R', uB, FRONT, u1, FRONT, y]);
        for (const [k, ua, da, ub, db, ty] of runs) { const L = Math.hypot(ub - ua, db - da), m = Math.max(1, Math.ceil(L / 1.5));
          for (let i = 0; i <= m && !fix; i++) { const u = ua + (ub - ua) * i / m, d = da + (db - da) * i / m, h = Math.abs(hAt(u, d) - ty); if (h <= CAP) continue;
            const f = k !== 'B' && d < dB - 0.5 ? 'B' : k; if (E[f] - 0.5 < floor[f] && h <= CAP_POOL) continue; fix = f; if (E[f] - 0.5 < floor[f]) floor[f] = 0; }
          if (fix) break; }
      }
      if (!fix) { T = c; break; }
      if (E[fix] <= 0.31) return null; E[fix] = Math.max(0.3, floor[fix], E[fix] - (fix === 'B' ? 1 : 0.5));
    }
    if (!T) return null;
    return finish();
    function finish() {
      const r = H.rnd, look = H.look || 'tract', lot = { y, pads: [], stairs: [], walls: [], flights: [], plants: [] };
      // the fence: privacy along the neighbours, open (iron, a rail) on the side with the view
      const priv = look === 'estate' ? (r() < 0.6 ? 'stone' : 'pilaster') : look === 'spanish' ? (r() < 0.7 ? 'pilaster' : 'block') : look === 'ranch' ? (H.rural ? (r() < 0.6 ? 'rail' : 'wood') : r() < 0.55 ? 'wood' : 'block')
        : look === 'cottage' || look === 'bungalow' ? (r() < 0.6 ? 'wood' : 'vinyl') : look === 'modern' ? 'block' : r() < 0.2 ? 'vinyl' : r() < 0.55 ? 'pilaster' : 'block';
      const open = priv === 'stone' ? 'stoneIron' : priv === 'rail' || priv === 'wood' ? 'rail' : 'iron';
      // some lots round their corners in a curved wall (more of them on estates and Spanish houses)
      const rad = r() < (look === 'estate' || look === 'spanish' ? 0.55 : 0.3) ? 1.8 + r() * 2.2 : 0;
      const last = T.length - 1, rf = (k, side) => k === 0 && rad && (side < 0 ? E.L : E.R) >= rad + 1.5 && T[0].f - T[0].b >= 2 * rad + 1 ? rad : 0;
      const rb = (k, side) => k === last && rad && T[k].f - T[k].b >= 2 * rad + 0.5 && (k > 0 || T[k].b < dB - rad - 0.3) && (u1 - u0) >= 2 * rad + 2 ? rad : 0;
      const bit = (sx, front) => (sx > 0 ? 1 : 0) + ((front ? S : -S) > 0 ? 2 : 0);
      const arc = (cu, cd, a0, a1, rr) => { const P = []; for (let i = 0; i <= 6; i++) { const a = a0 + (a1 - a0) * i / 6; P.push([cu + Math.cos(a) * rr, cd + Math.sin(a) * rr]); } return P; };
      T.forEach((t, k) => { // a pad for each terrace
        const fl = rf(k, -1), fr = rf(k, 1), bl = rb(k, -1), br = rb(k, 1), rr = Math.max(fl, fr, bl, br);
        const q = { ...rectOf(pt, u0, u1, t.b, t.f, F), y: t.y, r: rr, rm: (fl ? 1 << bit(-1, true) : 0) | (fr ? 1 << bit(1, true) : 0) | (bl ? 1 << bit(-1, false) : 0) | (br ? 1 << bit(1, false) : 0), u0, u1, f: t.f, b: t.b, k };
        const O = []; // its outline (u, d), round the rounded corners
        if (fl) O.push(...arc(u0 + fl, t.f - fl, Math.PI, Math.PI / 2, fl)); else O.push([u0, t.f]);
        if (fr) O.push(...arc(u1 - fr, t.f - fr, Math.PI / 2, 0, fr)); else O.push([u1, t.f]);
        if (br) O.push(...arc(u1 - br, t.b + br, 0, -Math.PI / 2, br)); else O.push([u1, t.b]);
        if (bl) O.push(...arc(u0 + bl, t.b + bl, -Math.PI / 2, -Math.PI, bl)); else O.push([u0, t.b]);
        q.outlineUD = O; q.outline = O.map(([u, d]) => pt(u, d)); lot.pads.push(q);
      });
      // the walls along the lot lines: each piece level, stepped down the slope; a fence above the higher ground
      const [lcx, lcz] = pt((u0 + u1) / 2, (T[0].f + T[last].b) / 2);
      const wall = (pts, ty, gate = 0) => { // a run of straight walls through (u, d) points, 9 cm inside the lot
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, az] = pt(...pts[i]), [bx, bz] = pt(...pts[i + 1]), len = Math.hypot(bx - ax, bz - az); if (len < 0.2) continue;
          const tx = (bx - ax) / len, tz = (bz - az) / len, s = (-tz * (lcx - (ax + bx) / 2) + tx * (lcz - (az + bz) / 2)) > 0 ? 1 : -1, nx = -tz * s, nz = tx * s;
          const m = Math.max(1, Math.round(len / 3)), pieces = new Float32Array(m * 4); let step = 0, fall = 0;
          for (let j = 0; j < m; j++) { const s0 = len * j / m, s1 = len * (j + 1) / m; let a = ty, b = ty;
            for (const tt of [s0, (s0 + s1) / 2, s1]) { const h = H.nat(ax + tx * tt, az + tz * tt); a = Math.min(a, h); b = Math.max(b, h); step = Math.max(step, Math.abs(h - ty)); fall = Math.max(fall, ty - h); }
            pieces.set([s0, s1, a - 0.25, b], j * 4); }
          const g = i === 0 && gate && len >= 0.9, kind = fall > 1 && !gate ? open : priv, top = OPEN.has(kind) ? OPEN_H : step < 0.6 ? WALL_H : GUARD_H;
          lot.walls.push({ ax: ax + nx * 0.09, az: az + nz * 0.09, tx, tz, nx, nz, len, kind, stone: priv === 'stone', top, gate: g ? 1 : 0, gw: g ? Math.min(1, len - 0.2) : 0, gy: ty, step, pieces });
        }
      };
      T.forEach((t, k) => {
        const fl = rf(k, -1), fr = rf(k, 1), bl = rb(k, -1), br = rb(k, 1);
        wall([...(fl ? arc(u0 + fl, t.f - fl, Math.PI / 2, Math.PI, fl) : [[u0, t.f]]), ...(bl ? arc(u0 + bl, t.b + bl, Math.PI, Math.PI * 1.5, bl) : [[u0, t.b]])], t.y);
        wall([...(fr ? arc(u1 - fr, t.f - fr, Math.PI / 2, 0, fr) : [[u1, t.f]]), ...(br ? arc(u1 - br, t.b + br, 0, -Math.PI / 2, br) : [[u1, t.b]])], t.y);
        if (k === last) wall([[u0 + bl, t.b], [u1 - br, t.b]], t.y);
        if (k === 0) { wall([[uA, FRONT], [u0 + fl, FRONT]], y, 1); wall([[uB, FRONT], [u1 - fr, FRONT]], y, 1); } // the side yards' front walls, a gate next to the house
      });
      // between terraces: the retaining wall, and stairs down (or up) through it, clear of a pool's deck
      for (let k = 0; k < last; k++) {
        const a = T[k], b = T[k + 1], hi = Math.max(a.y, b.y), lo = Math.min(a.y, b.y), drop = a.y - b.y, low = drop > 0 ? b : a, dir = drop > 0 ? -1 : 1, bd = a.b;
        const nR = Math.max(1, Math.round(Math.abs(drop) / RISE)), depth = low.f - low.b, perp = depth - 1 >= nR * TREAD, run = nR * TREAD;
        const clear = (ua, ub, da, db) => !PL.some(P => P.u1 > ua && P.u0 < ub && P.d1 > Math.min(da, db) && P.d0 < Math.max(da, db)) && (ub < uA - 0.2 || ua > uB + 0.2 || Math.max(da, db) < dB - 0.2) && ua > u0 + 0.4 && ub < u1 - 0.4;
        let us = null, along = 0;
        for (const c of [(uA + uB) / 2, uA + 2, uB - 2, (uA + u0) / 2, (uB + u1) / 2, uA + (uB - uA) * 0.3, uA + (uB - uA) * 0.7]) {
          if (perp && clear(c - STAIR_W / 2, c + STAIR_W / 2, bd, bd + dir * run)) { us = c; break; }
          for (const sg of [1, -1]) if (us === null && clear(Math.min(c - STAIR_W / 2, c + sg * (STAIR_W / 2 + run)), Math.max(c + STAIR_W / 2, c + sg * (STAIR_W / 2 + run)), bd, bd + dir * 1.3)) { us = c; along = sg; }
          if (us !== null) break;
        }
        const gap = us === null ? null : [us - STAIR_W / 2 - 0.05, us + STAIR_W / 2 + 0.05];
        const inner = (ua, ub) => { if (ub - ua < 0.2) return; const [ax, az] = pt(ua, bd), [bx, bz] = pt(ub, bd), len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
          lot.walls.push({ ax, az, tx, tz, nx: F.ox * dir, nz: F.oz * dir, len, kind: 'inner', stone: priv === 'stone', top: Math.abs(drop) < 0.6 ? 0.12 : 0.9, gate: 0, gw: 0, gy: hi, step: Math.abs(drop), pieces: Float32Array.from([0, len, lo - 0.25, hi]) }); };
        if (gap) { inner(u0, gap[0]); inner(gap[1], u1); } else inner(u0, u1);
        if (us === null) continue;
        const top = pt(us, bd), dn = [F.ox * dir, F.oz * dir], tread = TREAD;
        if (!along) { // straight down the slope from the gap
          const [cx, cz] = pt(us, bd + dir * run / 2);
          lot.stairs.push({ cx, cz, tx: dn[0], tz: dn[1], hu: run / 2, hv: STAIR_W / 2, y: (hi + lo) / 2, g: -(hi - lo) / run, stair: true, corners: rectCorners(cx, cz, dn[0], dn[1], run / 2, STAIR_W / 2) });
          lot.flights.push({ x: top[0], z: top[1], tx: dn[0], tz: dn[1], w: STAIR_W, n: nR, tread, y0: hi, y1: lo, side: 0 });
        } else { // a landing below the gap, then the flight along the wall
          const lc = pt(us, bd + dir * 0.65), ft = [F.tx * along, F.tz * along], fs = pt(us + along * STAIR_W / 2, bd + dir * 0.65), [cx, cz] = pt(us + along * (STAIR_W / 2 + run / 2), bd + dir * 0.65);
          lot.stairs.push({ cx: lc[0], cz: lc[1], tx: F.tx, tz: F.tz, hu: STAIR_W / 2, hv: 0.65, y: hi, g: 0, stair: true, corners: rectCorners(lc[0], lc[1], F.tx, F.tz, STAIR_W / 2, 0.65) });
          lot.stairs.push({ cx, cz, tx: ft[0], tz: ft[1], hu: run / 2, hv: 0.65, y: (hi + lo) / 2, g: -(hi - lo) / run, stair: true, corners: rectCorners(cx, cz, ft[0], ft[1], run / 2, 0.65) });
          const side = (-ft[1] * F.ox * dir + ft[0] * F.oz * dir) > 0 ? 1 : -1; // the cheek wall on the open side, away from the retaining wall
          lot.flights.push({ x: fs[0], z: fs[1], tx: ft[0], tz: ft[1], w: 1.3, n: nR, tread, y0: hi, y1: lo, side, landing: [lc[0], lc[1], F.tx, F.tz, hi] });
        }
      }
      // the gates in the side yards' front walls: steps down outside where the yard stands over the ground beyond, down
      // inside where the ground beyond stands over the yard
      for (const w of lot.walls) if (w.gate) {
        const gc = 0.1 + w.gw / 2, gx = w.ax + w.tx * gc, gz = w.az + w.tz * gc, out = H.nat(gx + F.ox * 0.4, gz + F.oz * 0.4), dy = y - out; if (Math.abs(dy) < 0.22) continue;
        const nR = Math.max(1, Math.round(Math.abs(dy) / RISE)), run = nR * TREAD, sg = dy > 0 ? 1 : -1, dn = [F.ox * sg, F.oz * sg], hi = Math.max(y, out), lo = Math.min(y, out);
        const tx0 = gx + F.ox * (sg > 0 ? 0.11 : -0.11), tz0 = gz + F.oz * (sg > 0 ? 0.11 : -0.11), cx = tx0 + dn[0] * run / 2, cz = tz0 + dn[1] * run / 2;
        w.gy = hi; lot.stairs.push({ cx, cz, tx: dn[0], tz: dn[1], hu: run / 2, hv: 0.55, y: (hi + lo) / 2, g: -(hi - lo) / run, stair: true, corners: rectCorners(cx, cz, dn[0], dn[1], run / 2, 0.55) });
        lot.flights.push({ x: tx0, z: tz0, tx: dn[0], tz: dn[1], w: Math.max(0.8, w.gw + 0.1), n: nR, tread: TREAD, y0: hi, y1: lo, side: 0 });
      }
      // planting: shrubs along the walls inside, a tree in a back corner
      const busy = (x, z) => H.mine(x, z) || lot.stairs.some(q => Math.abs((x - q.cx) * q.tx + (z - q.cz) * q.tz) < q.hu + 0.8 && Math.abs((x - q.cx) * q.tz - (z - q.cz) * q.tx) < q.hv + 0.8)
        || PL.some(P => { const xx = x - F.ax, zz = z - F.az, u = xx * F.tx + zz * F.tz, d = xx * F.ox + zz * F.oz; return u > P.u0 - 0.5 && u < P.u1 + 0.5 && d > P.d0 - 0.5 && d < P.d1 + 0.5; });
      const dens = H.rural ? 4.6 : look === 'modern' ? 4.2 : 3.4;
      for (const w of lot.walls) { if (w.kind === 'inner' && w.step < 0.6) continue;
        for (let t = (w.gate ? 1.8 : 0.9) + r() * 0.6; t < w.len - 0.6; t += dens + r() * 0.8) { const x = w.ax + w.tx * t + w.nx * 0.75, z = w.az + w.tz * t + w.nz * 0.75; if (!busy(x, z) && r() < 0.75) lot.plants.push(['scruboak', x, z, 0.36 + r() * 0.24]); }
      }
      const trees = look === 'spanish' || look === 'modern' ? ['palm_queen', 'palm_fan', 'olive'] : look === 'estate' ? ['olive', 'pepper', 'jacaranda', 'palm_queen'] : look === 'ranch' ? ['pepper', 'oak', 'olive'] : ['jacaranda', 'olive', 'palm_queen', 'pepper'];
      T.forEach(t => { if (t.f - t.b < 4.5 || u1 - u0 < 8 || r() > 0.7) return;
        for (const [u, d] of [[u0 + 2.2, t.b + 2.2], [u1 - 2.2, t.b + 2.2]].sort(() => r() - 0.5)) { if (d > dB && u > uA - 1.5 && u < uB + 1.5) continue; const [x, z] = pt(u, d); if (busy(x, z)) continue; lot.plants.push([trees[Math.floor(r() * trees.length)], x, z, 0]); break; } });
      return lot;
    }
  }
  function fits(pads) { // room in the grid's cells for all of a lot's terraces
    const want = new Map(); for (const q of pads) for (const c of cellsOf(q)) want.set(c, (want.get(c) || 0) + 1);
    for (const [c, k] of want) { let used = 0; while (used < SLOTS && grid[c * SLOTS + used]) used++; if (used + k > SLOTS) return false; }
    return true;
  }
  function add(lot, ok = () => true) {
    if (list.length + lot.pads.length >= 65534 || !lot.pads.every(ok) || !fits(lot.pads)) return false;
    for (const q of lot.pads) { list.push(q); const id = list.length; for (const c of cellsOf(q)) for (let k = c * SLOTS; k < c * SLOTS + SLOTS; k++) if (!grid[k]) { grid[k] = id; break; } }
    for (const q of lot.stairs) for (const c of cellsOf(q)) { let a = steps.get(c); if (!a) steps.set(c, a = []); a.push(q); }
    return true;
  }
  function cuts() { // for the ground shader: SLOTS / 2 RGBA8 texels a cell (two terrace numbers each, 16 bits), a table of terraces
    const W = SLOTS / 2, G = new Uint8Array(NX * NZ * W * 4), T = new Float32Array(1024 * Math.max(1, Math.ceil(list.length * 2 / 1024)) * 4);
    for (let c = 0; c < NX * NZ; c++) for (let k = 0; k < SLOTS; k++) { const id = grid[c * SLOTS + k]; if (!id) break; const gz = Math.floor(c / NX), gx = c % NX, o = (gz * NX * W + gx * W + (k >> 1)) * 4 + (k & 1) * 2; G[o] = id >> 8; G[o + 1] = id & 255; }
    list.forEach((q, i) => T.set([q.cx, q.cz, q.hu, q.hv, q.tx, q.tz, q.y, q.r ? q.rm * 16 + Math.min(15.9, q.r) : 0], i * 8));
    return { grid: G, nx: NX, nz: NZ, slots: SLOTS, rect: [X0, Z0, CELL], table: T };
  }
  return { plan, add, at, cuts, list, get n() { return list.length; } };
}

function rectCorners(cx, cz, tx, tz, hu, hv) { return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [cx + tx * i * hu + tz * j * hv, cz + tz * i * hu - tx * j * hv]); }
// the rectangle u0..u1 by d0..d1 in a front wall's frame, as a pad: centre, along, half sizes, corners
function rectOf(pt, u0, u1, d0, d1, F) {
  const [cx, cz] = pt((u0 + u1) / 2, (d0 + d1) / 2);
  return { cx, cz, tx: F.tx, tz: F.tz, hu: (u1 - u0) / 2, hv: (d1 - d0) / 2, corners: [pt(u0, d1), pt(u0, d0), pt(u1, d0), pt(u1, d1)] };
}

// a convex polygon [[x, z]] clipped to x0..x1, z0..z1
export function clipRect(poly, x0, z0, x1, z1) {
  let P = poly;
  for (const [ax, lim, keepLess] of [[0, x0, false], [0, x1, true], [1, z0, false], [1, z1, true]]) {
    const out = [], inn = p => keepLess ? p[ax] <= lim : p[ax] >= lim;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], ia = inn(a), ib = inn(b);
      if (ia) out.push(a);
      if (ia !== ib) { const t = (lim - a[ax]) / (b[ax] - a[ax]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    P = out; if (P.length < 3) return [];
  }
  return P;
}
