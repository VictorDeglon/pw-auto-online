// Tree cleanup (docs/roadmap/01-world-cleanup-trees.md): a deterministic pass over D.trees that drops canopies the
// aerial detector put on roads, sidewalks, roofs, water, parking lots, pools and playing fields, caps canopies that overhang
// roads, and thins near-duplicate detections. It never moves a tree, so the plants keep matching the photo.
//
// filterTrees(trees, w) -> { action: Uint8Array (0 keep, 1 drop), radius: Float32Array (possibly capped), stats }
//   trees: flat [x, z, kind, r] * n
//   w: { roads (D.roads), roadSegGrid, RSG, ckey, cgrid, CELL, polys, pools (D.pools), areas: [{k, p}],
//        areaBins, AB, exclude: [flat polygon] }

const KEEP = 0, DROP = 1;

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  let t = L ? ((px - ax) * dx + (pz - az) * dz) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}
export function pointInPoly(x, z, p) {
  let inside = false; const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function polyEdgeDist(x, z, p) {
  let d = 1e9; const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) d = Math.min(d, segDist(x, z, p[j * 2], p[j * 2 + 1], p[i * 2], p[i * 2 + 1]));
  return d;
}
function bbox(p) {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (let i = 0; i < p.length; i += 2) { a = Math.min(a, p[i]); b = Math.min(b, p[i + 1]); c = Math.max(c, p[i]); d = Math.max(d, p[i + 1]); }
  return [a, b, c, d];
}

// distance from (x, z) to the nearest road *edge* (negative = on the asphalt), with the road type of that road
export function roadEdgeDist(w, x, z, out) {
  const cell = w.roadSegGrid.get(w.ckey(Math.floor(x / w.RSG), Math.floor(z / w.RSG)));
  let best = 1e9, bt = -1;
  if (cell) for (let i = 0; i < cell.length; i += 2) {
    const r = w.roads[cell[i]], k = cell[i + 1], p = r[3];
    const d = segDist(x, z, p[k * 2], p[k * 2 + 1], p[k * 2 + 2], p[k * 2 + 3]) - r[2] / 2;
    if (d < best) { best = d; bt = r[1]; }
  }
  out[0] = best; out[1] = bt; return out;
}

export function filterTrees(trees, w) {
  const n = trees.length / 4;
  const action = new Uint8Array(n), radius = new Float32Array(n);
  const stats = { total: n, sidewalk: 0, road: 0, building: 0, water: 0, parking: 0, pool: 0, field: 0, excluded: 0, duplicate: 0, capped: 0 };
  // pools: rectangles [x, z, w, d, rot] binned on a 40 m grid
  const poolBins = new Map(), PB = 40;
  (w.pools || []).forEach((p, i) => {
    const r = Math.hypot(p[2], p[3]) / 2 + 1;
    for (let gx = Math.floor((p[0] - r) / PB); gx <= Math.floor((p[0] + r) / PB); gx++)
      for (let gz = Math.floor((p[1] - r) / PB); gz <= Math.floor((p[1] + r) / PB); gz++) { const k = gx * 100000 + gz; (poolBins.get(k) || poolBins.set(k, []).get(k)).push(i); }
  });
  const ex = (w.exclude || []).map(p => ({ p, bb: bbox(p) }));
  const rd = [0, 0];
  for (let i = 0; i < n; i++) {
    const x = trees[i * 4], z = trees[i * 4 + 1]; let r = trees[i * 4 + 3] || 3; radius[i] = r;
    // roads and sidewalks: types 1-5 have a 2.2 m sidewalk ribbon starting 0.1 m off the asphalt
    roadEdgeDist(w, x, z, rd);
    const margin = rd[1] >= 1 && rd[1] <= 5 ? 3.5 : 2; // nothing growing in or over the road
    if (rd[0] < margin) { action[i] = DROP; if (rd[0] < 0) stats.road++; else stats.sidewalk++; continue; }
    if (r > rd[0] + 2) { radius[i] = Math.max(1.2, rd[0] + 2); stats.capped++; }
    // buildings (collision polygons)
    const c = w.cgrid.get(w.ckey(Math.floor(x / w.CELL), Math.floor(z / w.CELL)));
    let hit = false;
    if (c) for (const bi of c.b) {
      const P = w.polys[bi];
      if (x < P.minx - 1 || x > P.maxx + 1 || z < P.minz - 1 || z > P.maxz + 1) continue;
      if (pointInPoly(x, z, P.p) || polyEdgeDist(x, z, P.p) < 0.8) { hit = true; break; }
    }
    if (hit) { action[i] = DROP; stats.building++; continue; }
    // pools (+0.7 m coping)
    const pb = poolBins.get(Math.floor(x / PB) * 100000 + Math.floor(z / PB));
    if (pb) for (const pi of pb) {
      const p = w.pools[pi], cs = Math.cos(-p[4]), sn = Math.sin(-p[4]), dx = x - p[0], dz = z - p[1];
      const u = dx * cs - dz * sn, v = dx * sn + dz * cs;
      if (Math.abs(u) < p[2] / 2 + 0.7 && Math.abs(v) < p[3] / 2 + 0.7) { hit = true; break; }
    }
    if (hit) { action[i] = DROP; stats.pool++; continue; }
    // water, and the interior of playing fields / golf (edge rows within 4 m are real)
    const ab = w.areaBins.get(w.ckey(Math.floor(x / w.AB), Math.floor(z / w.AB)));
    if (ab) for (const ai of ab.a) {
      const A = w.areas[ai]; if (A.k !== 0 && A.k !== 2 && A.k !== 3) continue;
      if (!pointInPoly(x, z, A.p)) continue;
      if (A.k === 0) { hit = true; stats.water++; break; }
      if (A.k === 2) { hit = true; stats.parking++; break; } // nothing grows in a parking lot
      if (polyEdgeDist(x, z, A.p) > 4) { hit = true; stats.field++; break; }
    }
    if (hit) { action[i] = DROP; continue; }
    for (const e of ex) if (x >= e.bb[0] && x <= e.bb[2] && z >= e.bb[1] && z <= e.bb[3] && pointInPoly(x, z, e.p)) { hit = true; break; }
    if (hit) { action[i] = DROP; stats.excluded++; continue; }
  }
  // spacing: two trunks closer than 0.6 * (r1 + r2) -> keep the larger canopy
  const G = 8, grid = new Map();
  for (let i = 0; i < n; i++) if (action[i] === KEEP) { const k = Math.floor(trees[i * 4] / G) * 100000 + Math.floor(trees[i * 4 + 1] / G); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  for (let i = 0; i < n; i++) {
    if (action[i] !== KEEP) continue;
    const x = trees[i * 4], z = trees[i * 4 + 1], gx = Math.floor(x / G), gz = Math.floor(z / G);
    for (let a = -1; a <= 1 && action[i] === KEEP; a++) for (let b = -1; b <= 1; b++) {
      const cell = grid.get((gx + a) * 100000 + gz + b); if (!cell) continue;
      for (const j of cell) {
        if (j === i || action[j] !== KEEP) continue;
        const d = Math.hypot(trees[j * 4] - x, trees[j * 4 + 1] - z);
        if (d < 0.6 * (radius[i] + radius[j]) && (radius[j] > radius[i] || (radius[j] === radius[i] && j < i))) { action[i] = DROP; stats.duplicate++; break; }
      }
      if (action[i] !== KEEP) break;
    }
  }
  stats.kept = action.reduce((s, a) => s + (a === KEEP), 0);
  return { action, radius, stats };
}
