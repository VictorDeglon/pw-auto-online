// Real road widths, curb to curb in metres. The map data's widths are OpenStreetMap estimates, about half of what
// Poway's streets measure: Poway Road is three lanes each way with a turn lane and bike lanes (~28-30 m), a
// residential street 36 ft (11 m). Divided roads are two one-way carriageways in the data, each sized as one.
// A road only widens as far as the buildings along it allow (with its sidewalk), so nothing ends up in the street.
// t: 0 motorway, 1 primary, 2 secondary, 3 collector, 4 residential, 5 narrow/unclassified, 6 service
//   const fit = roadFitter(D.buildings)   fit(t, w, ow, pts) -> width
const TWO = [24, 27, 21, 13.5, 10.5, 7.5], ONE = [16, 12.5, 10.5, 8, 6, 5];
export function roadWidth(t, w, ow) {
  const want = (ow ? ONE : TWO)[t]; if (want === undefined) return w; // service drives and alleys keep the data's width
  return Math.max(w, t === 1 && !ow && w >= 18 ? 30 : want);
}
function pip(x, z, p) { let ins = false; const n = p.length / 2; for (let i = 0, j = n - 1; i < n; j = i++) { const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; }
export function roadFitter(buildings, G = 24) {
  const bins = new Map(), key = (i, j) => i * 100003 + j;
  for (const b of buildings) { const p = b[2]; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
    for (let i = Math.floor(x0 / G); i <= Math.floor(x1 / G); i++) for (let j = Math.floor(z0 / G); j <= Math.floor(z1 / G); j++) { const k = key(i, j); let c = bins.get(k); if (!c) bins.set(k, c = []); c.push(p); } }
  const inside = (x, z) => { const c = bins.get(key(Math.floor(x / G), Math.floor(z / G))); if (c) for (const p of c) if (pip(x, z, p)) return true; return false; };
  const fit = (t, w, ow, pts) => {
    const want = roadWidth(t, w, ow); if (want <= w) return w;
    const walk = t >= 1 && t <= 5 ? 2.6 : 0.6; let half = want / 2;
    for (let k = 0; k < pts.length - 2 && half > w / 2; k += 2) {
      const ax = pts[k], az = pts[k + 1], bx = pts[k + 2], bz = pts[k + 3], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let s = 0; s <= L; s += 4) { const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L;
        while (half > w / 2 && (inside(x + nx * (half + walk), z + nz * (half + walk)) || inside(x - nx * (half + walk), z - nz * (half + walk)))) half -= 0.5; }
    }
    return Math.max(w, half * 2);
  };
  fit.inside = inside; // is (x, z) inside any building (the yard planner uses it too)
  return fit;
}
