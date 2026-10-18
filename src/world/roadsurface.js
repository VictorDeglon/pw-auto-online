// Road-aware ground height.
//
// The terrain is a 12.8 m height grid; roads were draped on it as ribbons whose two edges sat at different terrain
// heights, so a road along a swale became a tilted plane bridging the dip while its centre line (and the wheels of
// every car) sampled the lower terrain under it: markings vanished into the asphalt and cars sank through it. Here
// the road surface is defined once, from the centre-line terrain profile, and `surfaceAt` is folded into the game's
// `heightAt`, so physics, the asphalt ribbon, markings, curbs and the carved terrain all agree.
//
// Cross-section (d = lateral distance from the centre line, w = asphalt width):
//   |d| <= w/2                 asphalt, flat across (CROWN = 0: a crown read as a tilt at 12.8 m mesh resolution)
//   w/2 < |d| <= w/2 + sw      sidewalk / shoulder: flat; +0.15 m curb if the road has a curb, level otherwise
//   ... + FLAT                 road bed: a level bench 0.1 m under the walk. The coarse terrain mesh has 12.8 m
//                              triangles, so any vertex near a road that kept its natural height tilted a triangle
//                              up through the asphalt (markings fading up close, grass and slopes poking through).
//   ... + band                 cut / fill slope back to the natural terrain
// Which roads get a curb and sidewalk is decided from building density (rural north Poway has dirt shoulders).

const CELL = 4;      // raster cell (m); the raster only decides WHICH road a point belongs to, distances are exact
export const CROWN = 0, CURB_H = 0, LIFT = 0.0, FLAT = 14, BENCH = 0; // level with the ground: the terrain mesh is the road bed, roads sit a few cm on it
const PSTEP = 4, PSIGMA = 20; // long-profile sample spacing and smoothing (m): roads ride over the 12.8 m terrain facets

function segClosest(px, pz, ax, az, bx, bz, out) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  let t = L ? ((px - ax) * dx + (pz - az) * dz) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.x = ax + dx * t; out.z = az + dz * t; out.t = t; return out;
}

export class RoadSurface {
  // roads: D.roads ([nameIdx, type, width, pts, mph]); buildings: D.buildings
  constructor(roads, buildings, opts = {}) {
    this.roads = roads; this.band = opts.band ?? 16;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const r of roads) { const p = r[3]; for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); z0 = Math.min(z0, p[k + 1]); z1 = Math.max(z1, p[k + 1]); } }
    this.x0 = x0 - 40; this.z0 = z0 - 40;
    this.nx = Math.ceil((x1 + 40 - this.x0) / CELL); this.nz = Math.ceil((z1 + 40 - this.z0) / CELL);
    this.cells = new Uint16Array(this.nx * this.nz); // road index + 1, 0 = none
    this.score = new Float32Array(this.nx * this.nz).fill(1e9); // distance past the owner's walk edge (<= 0: inside it)
    // per road: sidewalk width (0 = dirt shoulder), curb flag
    const BG = 50, bg = new Map();
    for (const b of buildings) {
      const p = b[2], n = p.length / 2; let x = 0, z = 0; for (let i = 0; i < n; i++) { x += p[i * 2]; z += p[i * 2 + 1]; }
      const k = Math.floor(x / n / BG) * 100000 + Math.floor(z / n / BG); bg.set(k, (bg.get(k) || 0) + 1);
    }
    const built = (x, z) => { const gx = Math.floor(x / BG), gz = Math.floor(z / BG); let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += bg.get((gx + a) * 100000 + gz + b) || 0; return s; };
    const n = roads.length; this.sw = new Float32Array(n); this.curb = new Uint8Array(n); this.len = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [, t, w, p] = roads[i]; let L = 0;
      for (let k = 0; k < p.length - 2; k += 2) L += Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]);
      this.len[i] = L;
      const mid = p.length >> 2; const dens = built(p[mid * 2], p[mid * 2 + 1]);
      if (t === 6) { this.sw[i] = 0.6; this.curb[i] = 0; }                                  // driveways / service: a hair of shoulder
      else if (t === 0) { this.sw[i] = 3.0; this.curb[i] = 0; }                             // highway: paved shoulder, no curb
      else if (dens >= 4 || (t <= 2 && dens >= 2)) { this.sw[i] = t <= 2 ? 2.4 : 1.7; this.curb[i] = 1; } // town: curb + sidewalk
      else { this.sw[i] = t <= 3 ? 2.0 : 1.2; this.curb[i] = 0; }                           // rural: dirt shoulder
    }
    // paint corridors, narrow roads first so wider ones win the overlaps
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => roads[a][2] - roads[b][2] || this.len[b] - this.len[a]);
    if (opts.defer) this.order = order; // the caller paints them (a few at a time: src/world/outer.js)
    else for (const i of order) this.paint(i);
    this._q = { road: -1, d: 0, cx: 0, cz: 0, tx: 0, tz: 0, s: 0 }; this._c = { x: 0, z: 0, t: 0 };
  }
  // a cell belongs to the road whose asphalt/walk it is on (the wider one at a crossing), else the nearest walk edge,
  // so a long bench never swallows a parallel street
  paint(i) {
    const p = this.roads[i][3], edge = this.roads[i][2] / 2 + this.sw[i], r = edge + FLAT + this.band + CELL;
    for (let k = 0; k < p.length - 2; k += 2) {
      const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3];
      const gx0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - this.x0) / CELL)), gx1 = Math.min(this.nx - 1, Math.floor((Math.max(ax, bx) + r - this.x0) / CELL));
      const gz0 = Math.max(0, Math.floor((Math.min(az, bz) - r - this.z0) / CELL)), gz1 = Math.min(this.nz - 1, Math.floor((Math.max(az, bz) + r - this.z0) / CELL));
      const c = this._c || (this._c = { x: 0, z: 0, t: 0 });
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
        const x = this.x0 + (gx + 0.5) * CELL, z = this.z0 + (gz + 0.5) * CELL;
        segClosest(x, z, ax, az, bx, bz, c);
        const d = Math.hypot(c.x - x, c.z - z); if (d > r) continue;
        const sc = Math.max(0, d - edge), o = gz * this.nx + gx;
        if (sc < this.score[o] || (sc === 0 && this.score[o] === 0)) { this.score[o] = sc; this.cells[o] = i + 1; }
      }
    }
  }
  // nearest road at (x, z) within its corridor: fills and returns this._q, or null
  query(x, z, out) {
    const gx = Math.floor((x - this.x0) / CELL), gz = Math.floor((z - this.z0) / CELL);
    if (gx < 0 || gz < 0 || gx >= this.nx || gz >= this.nz) return null;
    const ri = this.cells[gz * this.nx + gx] - 1; if (ri < 0) return null;
    const p = this.roads[ri][3], q = out || this._q, c = this._c; let best = 1e9, along = 0, cum = 0;
    for (let k = 0; k < p.length - 2; k += 2) {
      segClosest(x, z, p[k], p[k + 1], p[k + 2], p[k + 3], c);
      const d = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
      const L = Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]);
      if (d < best) { best = d; q.cx = c.x; q.cz = c.z; q.tx = (p[k + 2] - p[k]) / (L || 1); q.tz = (p[k + 3] - p[k + 1]) / (L || 1); along = cum + c.t * L; }
      cum += L;
    }
    q.road = ri; q.d = Math.sqrt(best); q.s = along;
    const r = this.roads[ri][2] / 2 + this.sw[ri] + FLAT + this.band;
    return q.d <= r ? q : null;
  }
  // on (or within margin m of) driveable asphalt
  onAsphalt(x, z, margin = 0) {
    const q = this.query(x, z); return !!q && q.d <= this.roads[q.road][2] / 2 + margin;
  }
  // on asphalt, sidewalk or shoulder
  onRoad(x, z, margin = 0) {
    const q = this.query(x, z); return !!q && q.d <= this.roads[q.road][2] / 2 + this.sw[q.road] + margin;
  }
  // height of the built surface at (x, z) given the natural terrain function; null when off any corridor
  surfaceAt(x, z, terrainAt) {
    const q = this.query(x, z); if (!q) return null;
    const w2 = this.roads[q.road][2] / 2, sw = this.sw[q.road];
    const hc = this.profileAt(q.road, q.s, terrainAt) + LIFT;
    if (q.d <= w2) return hc - CROWN * q.d;
    const walk = hc - CROWN * w2 + (this.curb[q.road] ? CURB_H : 0);
    if (q.d <= w2 + sw) return walk;
    const bed = walk - BENCH;
    if (q.d <= w2 + sw + FLAT) return bed;
    const t = Math.min(1, (q.d - w2 - sw - FLAT) / this.band), s = t * t * (3 - 2 * t);
    return bed + (terrainAt(x, z) - bed) * s;
  }
  // smoothed centre-line height at distance s along road ri (built on first use from the natural terrain)
  profileAt(ri, s, terrainAt) {
    let P = (this.prof || (this.prof = []))[ri];
    if (!P) {
      const p = this.roads[ri][3], n = Math.max(2, Math.ceil(this.len[ri] / PSTEP) + 1), raw = new Float32Array(n);
      let k = 0, cum = 0, segL = Math.hypot(p[2] - p[0], p[3] - p[1]);
      for (let i = 0; i < n; i++) {
        const t = Math.min(i * PSTEP, this.len[ri]);
        while (t > cum + segL && k < p.length - 4) { cum += segL; k += 2; segL = Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]); }
        const f = segL ? (t - cum) / segL : 0;
        raw[i] = terrainAt(p[k] + (p[k + 2] - p[k]) * f, p[k + 1] + (p[k + 3] - p[k + 1]) * f);
      }
      P = new Float32Array(n); const R = Math.ceil(PSIGMA * 2 / PSTEP);
      for (let i = 0; i < n; i++) { let a = 0, w = 0; for (let j = -R; j <= R; j++) { const ii = Math.min(n - 1, Math.max(0, i + j)), g = Math.exp(-0.5 * (j * PSTEP / PSIGMA) ** 2); a += raw[ii] * g; w += g; } P[i] = a / w; }
      this.prof[ri] = P;
      // junctions: each road was smoothed on its own, so where a side street meets a bigger road their heights
      // disagreed and the surface stepped (metres, on hills) where ownership switched. Pin each end to the height of
      // the road it runs into and taper the correction back along the street.
      const pinL = Math.min(40, this.len[ri] * 0.45);
      for (const end of [0, 1]) {
        const ex = end ? p[p.length - 2] : p[0], ez = end ? p[p.length - 1] : p[1];
        const q = this.query(ex, ez, {}); if (!q || q.road === ri) continue; // own object: the caller is still holding this._q
        const oj = q.road, dom = this.roads[oj][2] > this.roads[ri][2] || (this.roads[oj][2] === this.roads[ri][2] && oj < ri);
        if (!dom || q.d > this.roads[oj][2] / 2 + this.sw[oj] + 2) continue;
        const sj = q.s, target = this.profileAt(oj, sj, terrainAt), cur = end ? P[n - 1] : P[0], dh = target - cur;
        if (Math.abs(dh) < 0.01) continue;
        for (let i = 0; i < n; i++) { const dist = end ? (n - 1 - i) * PSTEP : i * PSTEP; if (dist > pinL) continue; const t = dist / pinL, w = 1 - t * t * (3 - 2 * t); P[i] += dh * w; }
      }
    }
    const x = Math.min(P.length - 1.001, Math.max(0, s / PSTEP)), i = Math.floor(x);
    return P[i] + (P[i + 1] - P[i]) * (x - i);
  }
  // how far to push the terrain mesh down under the built surface so nothing pokes through it
  // (only under the asphalt and walk: the bench beyond is the visible ground, so the mesh matches heightAt there)
  carveAt(x, z, depth = 0.35) {
    const q = this.query(x, z); if (!q) return 0;
    const edge = this.roads[q.road][2] / 2 + this.sw[q.road];
    if (q.d <= edge) return depth;
    return Math.max(0, depth * (1 - (q.d - edge) / 1.5));
  }
}
