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
//
// The terrain function may answer null where the ground isn't known yet (the outer world's tiles stream in: a road
// reaching into a tile whose data hasn't arrived). A profile built then fills the gap from the nearest known ground
// and is provisional: it's built again once more ground has arrived (opts.epoch() changes), as is any profile pinned
// to it. Before this, such a profile kept whatever the fallback guessed (80 m off in places) for good, and every side
// street pinned to it rose to meet it: ramps that threw cars into the air.

const CELL = 4;      // raster cell (m); the raster only decides WHICH road a point belongs to, distances are exact
export const CROWN = 0.02, CURB_H = 0.15, LIFT = 0.0, FLAT = 14, BENCH = 0; // a 2% crown sheds water to the gutters; a real 15 cm curb where the road has one; the walk and the bench behind it sit up at curb height
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
    this.score = new Float32Array(this.nx * this.nz).fill(1e9); // metres past the owner's asphalt edge (< 0: on it)
    // per road: sidewalk width (0 = dirt shoulder), curb flag
    // how built-up a place is: building footprint area within ~150 m, in houses (250 m2 each). A count of buildings made
    // downtown and the business parks (a few huge buildings a block) country roads, with dirt shoulders and trails.
    const BG = 50, bg = new Map();
    for (const b of buildings) {
      const p = b[2], n = p.length / 2; let x = 0, z = 0, A = 0; for (let i = 0, j = n - 1; i < n; j = i++) { x += p[i * 2]; z += p[i * 2 + 1]; A += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1]; }
      const k = Math.floor(x / n / BG) * 100000 + Math.floor(z / n / BG); bg.set(k, (bg.get(k) || 0) + Math.max(0.3, Math.abs(A) / 2 / 250));
    }
    const built = (x, z) => { const gx = Math.floor(x / BG), gz = Math.floor(z / BG); let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += bg.get((gx + a) * 100000 + gz + b) || 0; return s; };
    const n = roads.length; this.sw = new Float32Array(n); this.curb = new Uint8Array(n); this.len = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [, t, w, p] = roads[i]; let L = 0;
      for (let k = 0; k < p.length - 2; k += 2) L += Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]);
      this.len[i] = L;
      const m = p.length >> 1, mid = m >> 1, dens = Math.max(built(p[mid * 2], p[mid * 2 + 1]), built(p[0], p[1]), built(p[m * 2 - 2], p[m * 2 - 1])); // the busiest of its ends and middle
      if (t === 6) { this.sw[i] = 0.6; this.curb[i] = 0; }                                  // driveways / service: a hair of shoulder
      else if (t === 0) { this.sw[i] = 3.0; this.curb[i] = 0; }                             // highway: paved shoulder, no curb
      else if (dens >= 2.5 || (t <= 2 && dens >= 1.2)) { this.sw[i] = t <= 2 ? 3.0 : t === 3 ? 2.4 : 2.0; this.curb[i] = 1; } // town: curb, gutter, sidewalk
      else { this.sw[i] = t <= 3 ? 2.0 : 1.2; this.curb[i] = 0; }                           // rural: dirt shoulder
    }
    // paint corridors, narrow roads first so wider ones win the overlaps
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => roads[a][2] - roads[b][2] || this.len[b] - this.len[a]);
    if (opts.defer) this.order = order; // the caller paints them (a few at a time: src/world/outer.js)
    else for (const i of order) this.paint(i);
    this.epoch = opts.epoch || null; this.prov = []; this.hadProv = false; // provisional profiles: the epoch they were built in
    this._q = { road: -1, d: 0, cx: 0, cz: 0, tx: 0, tz: 0, s: 0 }; this._c = { x: 0, z: 0, t: 0 };
  }
  // ---------------------------------------------------------------- junctions
  // Where streets meet (they share a point: OpenStreetMap ways end on each other's middles as often as at each other's
  // ends), each corner between two neighbouring legs gets a curb return: a quarter circle of radius R tangent to both
  // curb lines, centred in the block. Each street's walk, curb and gutter stop where the return starts (cuts[ri][+1|-1]:
  // arclength intervals, sides as ribbon offsets count), its lines a crosswalk short of the junction (cuts[ri][0]), and
  // the fillet between the old square corner and the return is asphalt (surfaceAt, onAsphalt). corners: what to draw.
  planJunctions() {
    const roads = this.roads, at = new Map(), key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2), cum = [];
    roads.forEach((r, i) => {
      const t = r[1]; if (t < 1 || t > 5 || !r[3]) return; const p = r[3], n = p.length / 2, c = cum[i] = new Float32Array(n);
      for (let k = 0; k < n; k++) { if (k) c[k] = c[k - 1] + Math.hypot(p[k * 2] - p[k * 2 - 2], p[k * 2 + 1] - p[k * 2 - 1]); const kk = key(p[k * 2], p[k * 2 + 1]); let l = at.get(kk); if (!l) at.set(kk, l = []); l.push([i, k]); }
    });
    const posAt = (i, s, o) => { const p = roads[i][3], c = cum[i], n = c.length; s = Math.max(0, Math.min(c[n - 1], s)); let k = 0; while (k < n - 2 && c[k + 1] < s) k++; const L = c[k + 1] - c[k] || 1e-3, f = (s - c[k]) / L; o[0] = p[k * 2] + (p[k * 2 + 2] - p[k * 2]) * f; o[1] = p[k * 2 + 1] + (p[k * 2 + 3] - p[k * 2 + 1]) * f; return o; };
    const cuts = this.cuts = [], corners = this.corners = [], o = [0, 0];
    const cut = (i, side, a, b) => { const c = cuts[i] || (cuts[i] = { '1': [], '-1': [], '0': [] }); c[side].push([a, b]); };
    for (const inc of at.values()) {
      if (inc.length < 2 || inc.every(q => q[0] === inc[0][0])) continue;
      const [i0, k0] = inc[0], x = roads[i0][3][k0 * 2], z = roads[i0][3][k0 * 2 + 1], legs = [];
      for (const [i, k] of inc) {
        const s = cum[i][k], L = cum[i][cum[i].length - 1];
        for (const sg of [-1, 1]) { // the way along the road from here: its direction over the first 6 m
          if ((sg < 0 && s < 0.5) || (sg > 0 && s > L - 0.5)) continue;
          posAt(i, s + sg * Math.min(6, sg < 0 ? s : L - s), o); const dx = o[0] - x, dz = o[1] - z, l = Math.hypot(dx, dz); if (l < 0.3) continue;
          legs.push({ i, s, sg, dx: dx / l, dz: dz / l, w: roads[i][2], a: Math.atan2(dz, dx), L });
        }
      }
      if (legs.length < 3) continue;
      legs.sort((p, q) => p.a - q.a);
      for (const A of legs) { // lines stop a crosswalk short of the other streets
        let ow = 0; for (const B of legs) if (B.i !== A.i) ow = Math.max(ow, B.w); if (!ow) continue;
        const d = ow / 2 + 4.6; cut(A.i, 0, A.sg > 0 ? A.s : A.s - d, A.sg > 0 ? A.s + d : A.s);
      }
      for (let a = 0; a < legs.length; a++) {
        const A = legs[a], B = legs[(a + 1) % legs.length];
        let th = B.a - A.a; if (th <= 0) th += Math.PI * 2; if (th > Math.PI * 0.92 || th < 0.25) continue; // a straight side of a through street, or a sliver
        if (A.i === B.i && th > Math.PI * 0.75) continue; // one street bending a little through the junction
        const town = this.curb[A.i] || this.curb[B.i], t = Math.min(roads[A.i][1], roads[B.i][1]);
        const R = town ? (t <= 2 ? 7 : t === 3 ? 6 : 4.5) : 3, sn = Math.sin(th), dA = A.w / 2 + R, dB = B.w / 2 + R;
        const cx = x + (dB * A.dx + dA * B.dx) / sn, cz = z + (dB * A.dz + dA * B.dz) / sn;
        const sA = (cx - x) * A.dx + (cz - z) * A.dz, sB = (cx - x) * B.dx + (cz - z) * B.dz;
        if (sA > 45 || sB > 45 || sA > A.L * 0.9 || sB > B.L * 0.9) continue; // too sharp an angle, or a stub
        for (const [P, sP] of [[A, sA], [B, sB]]) { // the side of P's road (as ribbon offsets count) the corner is on
          const tx = P.dx * P.sg, tz = P.dz * P.sg, side = (cx - x) * -tz + (cz - z) * tx > 0 ? '1' : '-1';
          cut(P.i, side, P.sg > 0 ? P.s : P.s - sP, P.sg > 0 ? P.s + sP : P.s);
        }
        const q = 1 / sn, qx = x + (B.w / 2 * A.dx + A.w / 2 * B.dx) * q, qz = z + (B.w / 2 * A.dz + A.w / 2 * B.dz) * q; // where the two curb lines met
        const ta = [x + A.dx * sA + (cx - x - A.dx * sA) * (A.w / 2) / dA, z + A.dz * sA + (cz - z - A.dz * sA) * (A.w / 2) / dA];
        const tb = [x + B.dx * sB + (cx - x - B.dx * sB) * (B.w / 2) / dB, z + B.dz * sB + (cz - z - B.dz * sB) * (B.w / 2) / dB];
        corners.push({ x, z, cx, cz, R, qx, qz, ta, tb, town: !!(this.curb[A.i] && this.curb[B.i]), sw: Math.min(this.sw[A.i], this.sw[B.i]), ra: A.i, rb: B.i });
      }
    }
    this.planMedians(); // (its cuts are merged with the junctions')
    for (const c of cuts) if (c) for (const k in c) { // merge each side's intervals
      const l = c[k].sort((p, q) => p[0] - q[0]), out = []; for (const iv of l) { const last = out[out.length - 1]; if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else out.push(iv.slice()); } c[k] = out;
    }
    const grid = this._cg = new Map(); // the corners by 16 m cell, for the height and asphalt queries
    corners.forEach((c, n) => { const xs = [c.qx, c.ta[0], c.tb[0]], zs = [c.qz, c.ta[1], c.tb[1]];
      for (let gx = Math.floor(Math.min(...xs) / 16); gx <= Math.floor(Math.max(...xs) / 16); gx++) for (let gz = Math.floor(Math.min(...zs) / 16); gz <= Math.floor(Math.max(...zs) / 16); gz++) { const k = gx * 100003 + gz; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(n); } });
    return corners.length;
  }
  // ---------------------------------------------------------------- medians
  // A divided road is two carriageways in the data (and a frontage road runs beside the main one). Where two big roads
  // run side by side 0.6-18 m apart, the strip between them is a median: raised behind curbs in town (concrete when it's
  // narrow, planted when it's wide), a concrete barrier down the middle of a freeway's. Each road's walk on that side is
  // cut along it (cuts); medians: { L, R: edge chains [x, z, ...] along each carriageway's asphalt edge, gap: widths,
  // t: the smaller road type, town }.
  planMedians() {
    const roads = this.roads, out = this.medians = [], cuts = this.cuts || (this.cuts = []), q = {};
    const cut = (i, side, a, b) => { const c = cuts[i] || (cuts[i] = { '1': [], '-1': [], '0': [] }); c[side].push([Math.min(a, b), Math.max(a, b)]); };
    const owner = (x, z) => { const gx = Math.floor((x - this.x0) / CELL), gz = Math.floor((z - this.z0) / CELL); return gx < 0 || gz < 0 || gx >= this.nx || gz >= this.nz ? -1 : this.cells[gz * this.nx + gx] - 1; };
    for (let i = 0; i < roads.length; i++) {
      const t = roads[i][1]; if (t < 0 || t > 3 || !roads[i][3]) continue;
      const p = roads[i][3], w = roads[i][2], runs = new Map(); let acc = 0;
      for (let k = 0; k + 3 < p.length; k += 2) {
        const ax = p[k], az = p[k + 1], L = Math.hypot(p[k + 2] - ax, p[k + 3] - az); if (L < 0.01) continue; const tx = (p[k + 2] - ax) / L, tz = (p[k + 3] - az) / L, nx = -tz, nz = tx;
        for (let s = (6 - acc % 6) % 6; s < L; s += 6) {
          const x = ax + tx * s, z = az + tz * s;
          for (const sg of [1, -1]) {
            for (let d = 0.5; d <= 20; d += 1) {
              const j = owner(x + nx * sg * (w / 2 + d), z + nz * sg * (w / 2 + d)); if (j < 0 || j === i) continue;
              if (j < i || !roads[j] || roads[j][1] < 0 || roads[j][1] > 3) break; // (each pair once, from the lower index)
              if (!this._query(x + nx * sg * (w / 2 + d), z + nz * sg * (w / 2 + d), q) || q.road !== j || Math.abs(q.tx * tx + q.tz * tz) < 0.9) break;
              const gap = Math.hypot(q.cx - x, q.cz - z) - w / 2 - roads[j][2] / 2; if (gap < 0.6 || gap > 18) break;
              const sj = (x - q.cx) * -q.tz + (z - q.cz) * q.tx > 0 ? 1 : -1, wj = roads[j][2] / 2; // the median's side of road j
              const key = j * 2 + (sg > 0 ? 1 : 0); let r = runs.get(key); const at = acc + s;
              if (!r || at - r.s1 > 7) { if (r) this._median(r, out, cut); runs.set(key, r = { i, j, sg, sj, s0: at, s1: at, j0: q.s, j1: q.s, L: [], R: [], gap: [] }); }
              r.s1 = at; r.j1 = q.s; r.L.push(x + nx * sg * w / 2, z + nz * sg * w / 2); r.R.push(q.cx - q.tz * sj * wj, q.cz + q.tx * sj * wj); r.gap.push(gap);
              break;
            }
          }
        }
        acc += L;
      }
      for (const r of runs.values()) this._median(r, out, cut);
    }
    return out.length;
  }
  _median(r, out, cut) {
    if (r.s1 - r.s0 < 11) return; // a couple of samples: where two roads brush past each other
    const t = Math.min(this.roads[r.i][1], this.roads[r.j][1]);
    cut(r.i, r.sg > 0 ? '1' : '-1', r.s0 - 3, r.s1 + 3); cut(r.j, r.sj > 0 ? '1' : '-1', r.j0 - 3, r.j1 + 3); // no walks along it
    out.push({ L: r.L, R: r.R, gap: r.gap, t, town: !!(this.curb[r.i] || this.curb[r.j]), i: r.i, j: r.j });
  }
  // in a corner's fillet: between where the curb lines used to meet and the curb return (asphalt now)
  inFillet(x, z) {
    const g = this._cg; if (!g) return false; const l = g.get(Math.floor(x / 16) * 100003 + Math.floor(z / 16)); if (!l) return false;
    for (const n of l) {
      const c = this.corners[n]; if ((x - c.cx) ** 2 + (z - c.cz) ** 2 <= c.R * c.R) continue;
      const s1 = (c.ta[0] - c.qx) * (z - c.qz) - (c.ta[1] - c.qz) * (x - c.qx), s2 = (c.tb[0] - c.ta[0]) * (z - c.ta[1]) - (c.tb[1] - c.ta[1]) * (x - c.ta[0]), s3 = (c.qx - c.tb[0]) * (z - c.tb[1]) - (c.qz - c.tb[1]) * (x - c.tb[0]);
      if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) return true;
    }
    return false;
  }
  // a cell belongs to the road whose asphalt it is on (the wider one at a crossing), else the one whose asphalt edge is
  // nearest, so a long bench never swallows a parallel street and a wide walk never takes the asphalt of the carriageway
  // beside it (score: metres past this road's asphalt edge, negative on it)
  paint(i) {
    const p = this.roads[i][3], w2 = this.roads[i][2] / 2, edge = w2 + this.sw[i], r = edge + FLAT + this.band + CELL;
    for (let k = 0; k < p.length - 2; k += 2) {
      const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3];
      const gx0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - this.x0) / CELL)), gx1 = Math.min(this.nx - 1, Math.floor((Math.max(ax, bx) + r - this.x0) / CELL));
      const gz0 = Math.max(0, Math.floor((Math.min(az, bz) - r - this.z0) / CELL)), gz1 = Math.min(this.nz - 1, Math.floor((Math.max(az, bz) + r - this.z0) / CELL));
      const c = this._c || (this._c = { x: 0, z: 0, t: 0 });
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
        const x = this.x0 + (gx + 0.5) * CELL, z = this.z0 + (gz + 0.5) * CELL;
        segClosest(x, z, ax, az, bx, bz, c);
        const d = Math.hypot(c.x - x, c.z - z); if (d > r) continue;
        const sc = d - w2, o = gz * this.nx + gx;
        if (sc < this.score[o] || (sc < 0 && this.score[o] < 0)) { this.score[o] = sc; this.cells[o] = i + 1; }
      }
    }
  }
  // nearest road at (x, z) within its corridor: fills and returns this._q, or null
  query(x, z, out) {
    if (!out && x === this._lx && z === this._lz) return this._lr; // heightAt asks onRoad, then surfaceAt, at the same spot
    const r = this._query(x, z, out);
    if (!out) { this._lx = x; this._lz = z; this._lr = r; }
    return r;
  }
  _query(x, z, out) {
    const gx = Math.floor((x - this.x0) / CELL), gz = Math.floor((z - this.z0) / CELL);
    if (gx < 0 || gz < 0 || gx >= this.nx || gz >= this.nz) return null;
    const ri = this.cells[gz * this.nx + gx] - 1; if (ri < 0 || !this.roads[ri]) return null; // (an outer tile's road list can change under its raster)
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
    const q = this.query(x, z); return !!q && (q.d <= this.roads[q.road][2] / 2 + margin || this.inFillet(x, z));
  }
  // on asphalt, sidewalk or shoulder
  onRoad(x, z, margin = 0) {
    const q = this.query(x, z); return !!q && q.d <= this.roads[q.road][2] / 2 + this.sw[q.road] + margin;
  }
  // behind a curbed sidewalk: the graded ground (the bench at walk height, then the slope back to the hills), which the
  // coarse terrain mesh can't follow (it's held under the asphalt); null elsewhere
  benchAt(x, z, terrainAt) {
    const q = this.query(x, z); if (!q || !this.curb[q.road]) return null;
    if (q.d <= this.roads[q.road][2] / 2 + this.sw[q.road]) return null;
    return this.surfaceAt(x, z, terrainAt);
  }
  // Poway's multi-use trails: decomposed granite with a post-and-rail fence along one side of most country roads.
  // +1: on the road's positive side (as ribbon offsets count), -1 the other, 0 none
  trailSide(ri) {
    const t = this.roads[ri][1]; if (this.curb[ri] || t < 1 || t > 4 || this.len[ri] < 60) return 0;
    const h = Math.sin(ri * 12.9898 + 0.7) * 43758.5453, f = h - Math.floor(h); return f < 0.6 ? (f < 0.3 ? 1 : -1) : 0;
  }
  // what a person may walk on at (x, z) by a road: { kind: 'walk' | 'trail', off (from the centre line) } or null
  walkAt(x, z) {
    const q = this.query(x, z, {}); if (!q) return null; const ri = q.road, w2 = this.roads[ri][2] / 2, sw = this.sw[ri];
    if (this.curb[ri]) return q.d > w2 - 0.5 && q.d <= w2 + sw + 0.5 ? { kind: 'walk', off: w2 + sw / 2 } : null;
    const ts = this.trailSide(ri); if (!ts) return null;
    const side = Math.sign((x - q.cx) * -q.tz + (z - q.cz) * q.tx); if (side !== ts) return null;
    return q.d > w2 && q.d <= w2 + sw + 2.8 ? { kind: 'trail', off: w2 + sw + 1.4 } : null;
  }
  // height of the built surface at (x, z) given the natural terrain function; null when off any corridor
  surfaceAt(x, z, terrainAt) {
    const q = this.query(x, z); if (!q) return null;
    const w2 = this.roads[q.road][2] / 2, sw = this.sw[q.road];
    const hc = this.profileAt(q.road, q.s, terrainAt) + LIFT; if (!(hc === hc)) return null; // a road whose ground hasn't arrived
    if (q.d <= w2) return hc - CROWN * q.d;
    if (q.d <= w2 + sw + 8 && this.inFillet(x, z)) return hc - CROWN * w2; // a corner rounded off: asphalt to the curb return
    const walk = hc - CROWN * w2 + (this.curb[q.road] ? CURB_H : 0);
    if (q.d <= w2 + sw) return walk;
    const bed = walk - BENCH;
    if (q.d <= w2 + sw + FLAT) return bed;
    const t = Math.min(1, (q.d - w2 - sw - FLAT) / this.band), s = t * t * (3 - 2 * t), n = terrainAt(x, z);
    return n === null || n === undefined ? bed : bed + (n - bed) * s;
  }
  // smoothed centre-line height at distance s along road ri (built on first use from the natural terrain)
  profileAt(ri, s, terrainAt) {
    let P = (this.prof || (this.prof = []))[ri];
    if (P && this.prov[ri] !== undefined && this.prov[ri] !== this.epoch()) P = null; // built short of ground that may be here now
    if (!P) {
      const p = this.roads[ri][3], n = Math.max(2, Math.ceil(this.len[ri] / PSTEP) + 1), raw = new Float32Array(n);
      let miss = 0;
      let k = 0, cum = 0, segL = Math.hypot(p[2] - p[0], p[3] - p[1]);
      for (let i = 0; i < n; i++) {
        const t = Math.min(i * PSTEP, this.len[ri]);
        while (t > cum + segL && k < p.length - 4) { cum += segL; k += 2; segL = Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]); }
        const f = segL ? (t - cum) / segL : 0;
        const h = terrainAt(p[k] + (p[k + 2] - p[k]) * f, p[k + 1] + (p[k + 3] - p[k + 1]) * f);
        if (h === null || h === undefined) { raw[i] = NaN; miss++; } else raw[i] = h;
      }
      const unk = this.unk || (this.unk = []); unk[ri] = undefined;
      if (miss === n) { // none of its ground is here: no height at all (surfaceAt answers null, nothing pins to it)
        this.prof[ri] = new Float32Array(n).fill(NaN); this.prov[ri] = this.epoch ? this.epoch() : undefined; this.hadProv = true; return NaN;
      }
      if (miss) { // some of it isn't here yet: carry the nearest known height across the gap (both ways)
        const U = unk[ri] = new Uint8Array(n); for (let i = 0; i < n; i++) U[i] = raw[i] === raw[i] ? 0 : 1;
        let last = NaN; for (let i = 0; i < n; i++) if (raw[i] === raw[i]) last = raw[i]; else raw[i] = last;
        last = NaN; for (let i = n - 1; i >= 0; i--) if (raw[i] === raw[i]) last = raw[i]; else raw[i] = last;
      }
      P = new Float32Array(n); const R = Math.ceil(PSIGMA * 2 / PSTEP);
      for (let i = 0; i < n; i++) { let a = 0, w = 0; for (let j = -R; j <= R; j++) { const ii = Math.min(n - 1, Math.max(0, i + j)), g = Math.exp(-0.5 * (j * PSTEP / PSIGMA) ** 2); a += raw[ii] * g; w += g; } P[i] = a / w; }
      this.prof[ri] = P; this.prov[ri] = miss && this.epoch ? this.epoch() : undefined; if (miss) this.hadProv = true;
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
        if (this.prov[oj] !== undefined) { this.prov[ri] = this.prov[oj]; this.hadProv = true; } // pinned to a guess: build again with it
        const U = this.unk[oj]; if (!(target === target) || (U && U[Math.min(U.length - 1, Math.round(sj / PSTEP))])) continue; // its ground there isn't here yet
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
