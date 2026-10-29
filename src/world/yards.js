// What's round a Poway house besides the house: a concrete driveway from the garage door to the street, a front walk
// from the door, block walls with gates closing the side yards, an AC unit on a side wall, the three bins (trash,
// recycling, green waste) by the garage, foundation shrubs along the front and often a tree in the front yard.
// Planned once when the building registers (so the driveway and walk clear their ground before plants are placed);
// drawn with the building's chunk.
//   const Y = planYard(flat, roles, H, rnd)   H: { onRoad(x, z), inside(x, z) }   -> null or
//     { fi, len, gar: { gx0, gw, side } | null, door, drive, walk (4-corner polys, metres-uv ready), fences: [[x0, z0, x1, z1]],
//       ac: [x, z, rot], bins: [[x, z, rot, colour]], shrubs: [[x, z, scale]], tree: [x, z, species] | null }
export const BIN_COLORS = [0x1c1d1f, 0x1f4f9e, 0x2f6b34]; // trash, recycling, green waste

export function planYard(flat, roles, H, rnd) {
  const n = flat.length / 2; let fi = -1, fl = 0;
  let S = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; S += flat[i * 2] * flat[j * 2 + 1] - flat[j * 2] * flat[i * 2 + 1]; }
  for (let i = 0; i < n; i++) { if (roles[i] !== 1) continue; const j = (i + 1) % n, L = Math.hypot(flat[j * 2] - flat[i * 2], flat[j * 2 + 1] - flat[i * 2 + 1]); if (L > fl) { fl = L; fi = i; } }
  if (fi < 0 || fl < 5) return null;
  const j = (fi + 1) % n, ax = flat[fi * 2], az = flat[fi * 2 + 1], tx = (flat[j * 2] - ax) / fl, tz = (flat[j * 2 + 1] - az) / fl;
  const ox = S > 0 ? tz : -tz, oz = S > 0 ? -tx : tx; // out of the house
  const pt = (u, d) => [ax + tx * u + ox * d, az + tz * u + oz * d];
  const clear = p => !H.inside(p[0], p[1]) && !H.onRoad(p[0], p[1]);
  const Y = { fi, len: fl, gar: null, fences: [], bins: [], shrubs: [], tree: null };
  if (fl > 8.5 && rnd() < 0.93) { const gw = fl > 16 ? 4.9 : 2.75, side = rnd() < 0.5 ? 1 : 0; Y.gar = { gw, side, gx0: side ? 0.9 : fl - 0.9 - gw }; }
  const G = Y.gar; Y.door = G ? (G.gx0 < 1 ? Math.min(G.gx0 + G.gw + 1.7, fl - 1.6) : Math.max(G.gx0 - 2.7, 0.6)) : fl * 0.5 - 0.48;
  // how far straight out from the wall at u the street is (0: none within reach, or something's in the way)
  const reach = (u, max = 30) => { for (let d = 0.5; d < max; d += 0.5) { const p = pt(u, d); if (H.onRoad(p[0], p[1])) return d; if (H.inside(p[0], p[1])) return 0; } return 0; };
  if (G) { const d = reach(G.gx0 + G.gw / 2); if (d > 1.5) Y.drive = [pt(G.gx0 - 0.35, 0.02), pt(G.gx0 + G.gw + 0.35, 0.02), pt(G.gx0 + G.gw + 0.35, d), pt(G.gx0 - 0.35, d)]; }
  { const uc = Y.door + 0.48, d = reach(uc); // the walk: straight to the street, or across to the driveway if that's nearer
    const toDrive = Y.drive && Math.abs(uc - (G.gx0 + G.gw / 2)) < 7;
    if (toDrive) { const de = G.gx0 < 1 ? G.gx0 + G.gw + 0.35 : G.gx0 - 0.35, a = Math.min(uc, de), b = Math.max(uc, de); Y.walk = [pt(uc - 0.6, 0.02), pt(uc + 0.6, 0.02), pt(uc + 0.6, 2.2), pt(uc - 0.6, 2.2)]; Y.walk2 = [pt(a, 1.6), pt(b, 1.6), pt(b, 2.8), pt(a, 2.8)]; }
    else if (d > 1) Y.walk = [pt(uc - 0.6, 0.02), pt(uc + 0.6, 0.02), pt(uc + 0.6, d), pt(uc - 0.6, d)];
  }
  // side yards: a block wall with a gate from each front corner (set back 1.5 m) out to the neighbour, then back along
  // the property line
  for (const [u, dir] of [[0, -1], [fl, 1]]) {
    const s = pt(u, -1.5); let e = s, k = 0;
    for (k = 1; k <= 12; k++) { const q = [s[0] + tx * dir * k * 0.5, s[1] + tz * dir * k * 0.5]; if (!clear(q)) break; e = q; }
    if (k < 3) continue;
    Y.fences.push([s[0], s[1], e[0], e[1]]);
    let b = e; for (k = 1; k <= 30; k++) { const q = [e[0] - ox * k * 0.5, e[1] - oz * k * 0.5]; if (!clear(q)) break; b = q; }
    if (k > 4) Y.fences.push([e[0], e[1], b[0], b[1]]);
  }
  // the AC unit beside the house away from the garage, the bins round the garage-side corner
  { const u = G && G.side ? fl + 0.7 : -0.7, p = pt(u, -3.2); if (clear(p)) Y.ac = [p[0], p[1], Math.atan2(tx, tz)]; }
  { const u = G && !G.side ? fl + 0.55 : -0.55; for (let k = 0; k < 3; k++) { const p = pt(u, -0.4 - k * 0.72); if (clear(p)) Y.bins.push([p[0], p[1], Math.atan2(ox, oz), k]); } }
  // shrubs along the front, clear of the garage, the door and the walk
  for (let u = 0.8; u < fl - 0.5; u += 1.5 + rnd() * 0.6) {
    if (G && u > G.gx0 - 0.6 && u < G.gx0 + G.gw + 0.6) continue;
    if (u > Y.door - 0.7 && u < Y.door + 1.7) continue;
    const p = pt(u, 0.85 + rnd() * 0.3); if (clear(p)) Y.shrubs.push([p[0], p[1], 0.32 + rnd() * 0.18]);
  }
  // a front-yard tree, halfway out, off the drive and the walk
  if (rnd() < 0.6) {
    const d = reach(Y.door > fl / 2 ? fl * 0.2 : fl * 0.8, 40); const u = Y.door > fl / 2 ? fl * 0.2 : fl * 0.8;
    if (d > 6) { const p = pt(u, d * 0.5); const sp = ['jacaranda', 'jacaranda', 'pepper', 'pepper', 'palm_fan', 'palm_fan', 'olive', 'olive', 'palm_date', 'slender'][Math.floor(rnd() * 10)]; if (clear(p)) Y.tree = [p[0], p[1], sp]; }
  }
  return Y;
}
// a yard's paving and walls as polygons for clearing the ground (driveway, walks)
export function yardPaving(Y) { return [Y.drive, Y.walk, Y.walk2].filter(Boolean).map(q => q.flat()); }
