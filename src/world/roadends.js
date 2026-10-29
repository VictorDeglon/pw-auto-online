// How Poway's streets end. Almost never in a square edge of asphalt:
//  - a residential street that stops among houses ends in a cul-de-sac: a round bulb 20-26 m across, curbed, with its
//    sidewalk carried round, and a yellow NO OUTLET sign where you turn in;
//  - anything else (a road stopping at open land, a construction edge, a hillside) is closed with a Type III barricade
//    (red and white striped rails) and red END markers on both edges, with a DEAD END sign at its start when it's long.
// Found once from the road data: an end is dead when no other road touches it.
//   const ends = findRoadEnds(D.roads, D.buildings, bounds)
//     -> [{ ri, end (0 first point, 1 last), x, z (the end), tx, tz (pointing out past the end), w, t, kind: 'bulb' |
//          'bar', R, cx, cz (bulb centre), entry: [x, z, tx, tz] | null (where the street starts, for its sign) }]
//   bulbRoads(ends, roads) -> extra road records ([name, t, 2R, [cx, cz, cx + tx * 0.2, cz + tz * 0.2], mph]) for the
//     road surface (src/world/roadsurface.js), so the bulb is driven on, graded and kept clear like any road
const CELL = 40;

export function findRoadEnds(roads, buildings, bounds) {
  const grid = new Map(), key = (gx, gz) => gx * 100003 + gz;
  roads.forEach((r, j) => { const p = r[3], m = r[2] / 2 + 3;
    for (let k = 0; k < p.length - 2; k += 2) {
      const x0 = Math.min(p[k], p[k + 2]) - m, x1 = Math.max(p[k], p[k + 2]) + m, z0 = Math.min(p[k + 1], p[k + 3]) - m, z1 = Math.max(p[k + 1], p[k + 3]) + m;
      for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) { const c = grid.get(key(gx, gz)); if (c) c.push(j, k); else grid.set(key(gx, gz), [j, k]); }
    } });
  const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz; let t = L ? ((px - ax) * dx + (pz - az) * dz) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(ax + dx * t - px, az + dz * t - pz); };
  // buildings by cell, for room round a bulb and how built-up an end is
  const bgrid = new Map();
  buildings.forEach((b, i) => { const p = b[2], n = p.length / 2; let x = 0, z = 0; for (let k = 0; k < n; k++) { x += p[k * 2]; z += p[k * 2 + 1]; } x /= n; z /= n;
    const c = key(Math.floor(x / CELL), Math.floor(z / CELL)); const a = bgrid.get(c); if (a) a.push(i); else bgrid.set(c, [i]); });
  const near = (x, z, R) => { const out = []; for (let gx = Math.floor((x - R) / CELL); gx <= Math.floor((x + R) / CELL); gx++) for (let gz = Math.floor((z - R) / CELL); gz <= Math.floor((z + R) / CELL); gz++) { const c = bgrid.get(key(gx, gz)); if (c) out.push(...c); } return out; };
  const polyD = (x, z, p) => { let d = 1e9, ins = false; const n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) { d = Math.min(d, segD(x, z, p[j * 2], p[j * 2 + 1], p[i * 2], p[i * 2 + 1])); const zi = p[i * 2 + 1], zj = p[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (p[j * 2] - p[i * 2]) * (z - zi) / (zj - zi) + p[i * 2]) ins = !ins; }
    return ins ? 0 : d; };
  const out = [];
  roads.forEach((r, i) => {
    const [, t, w, p] = r; if (t < 1 || t > 5 || p.length < 4) return;
    let L = 0; for (let k = 0; k < p.length - 2; k += 2) L += Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]); if (L < 25) return;
    for (const end of [0, 1]) {
      const n = p.length / 2, a = end ? n - 1 : 0, b = end ? n - 2 : 1, x = p[a * 2], z = p[a * 2 + 1];
      if (bounds && (x < bounds[0] + 80 || z < bounds[1] + 80 || x > bounds[2] - 80 || z > bounds[3] - 80)) continue; // cut off by the map's edge, not a real end
      let tx = x - p[b * 2], tz = z - p[b * 2 + 1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      let joined = false; const c = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
      for (let q = 0; q < c.length && !joined; q += 2) { const j = c[q], k = c[q + 1]; if (j === i) continue; const pj = roads[j][3]; if (segD(x, z, pj[k], pj[k + 1], pj[k + 2], pj[k + 3]) < roads[j][2] / 2 + 2.5) joined = true; }
      if (joined) continue;
      // a cul-de-sac if it's a street among houses with room for the bulb
      const bs = near(x, z, 70); let houses = 0, room = 1e9;
      for (const bi of bs) { const bp = buildings[bi][2]; const d = polyD(x + tx * 6, z + tz * 6, bp); room = Math.min(room, d + 6); if (d < 60) houses++; }
      const e = { ri: i, end, x, z, tx, tz, w, t, kind: 'bar', R: 0, cx: x, cz: z, entry: null };
      if (t >= 4 && houses >= 3) {
        const want = Math.min(13, Math.max(9.5, w / 2 + 5)), R = Math.min(want, room - 1.7 - 2.5);
        if (R >= w / 2 + 2.5) { e.kind = 'bulb'; e.R = R; e.cx = x + tx * R * 0.55; e.cz = z + tz * R * 0.55; }
      }
      if (e.kind === 'bar' && t < 3) continue; // a main road that seems to stop is a gap in the map data, not a dead end
      // the street's other end, for its NO OUTLET / DEAD END sign, if it starts at a junction
      if (L > 60) { const o = end ? 0 : n - 1, o2 = end ? 1 : n - 2; let sx = p[o2 * 2] - p[o * 2], sz = p[o2 * 2 + 1] - p[o * 2 + 1]; const sl = Math.hypot(sx, sz) || 1; e.entry = [p[o * 2], p[o * 2 + 1], sx / sl, sz / sl]; }
      out.push(e);
    }
  });
  return out;
}
export function bulbRoads(ends, roads) {
  return ends.filter(e => e.kind === 'bulb').map(e => { const r = roads[e.ri]; return [r[0], r[1], e.R * 2, [e.cx, e.cz, e.cx + e.tx * 0.2, e.cz + e.tz * 0.2], r[4]]; });
}
