// Turns the aerial canopy detections (D.trees: x, z, sizeKind, radius) into plants of real Poway species.
//
// Ecology (what you actually see around Poway):
//  - Wild hillsides are chaparral (laurel sumac, chamise, scrub oak, toyon) and coastal sage scrub (buckwheat,
//    sagebrush, black sage) on decomposed granite, with prickly pear and chaparral yucca. Not woodland.
//  - Native trees only where there is water: coast live oaks along creek bottoms and canyons.
//  - Eucalyptus groves are planted (old windbreaks); the OSM "wood" polygons around town are mostly those.
//  - In town almost every tree is planted: olives, jacarandas, pepper trees, fan palms, gums, street oaks,
//    plus foundation shrubs and hedges.
// Species missing from the asset manifest fall back to the closest one that exists.

import { pointInPoly } from '../world/treeFilter.js';

export const TREE_SPECIES = new Set(['oak', 'olive', 'scruboak', 'slender', 'cypress', 'jacaranda', 'eucalyptus', 'palm_fan', 'palm_date', 'palm_queen', 'pepper']);
const FALLBACK = { cypress: 'slender', eucalyptus: 'slender', palm_fan: 'slender', palm_date: 'olive', palm_queen: 'palm_fan', opuntia: 'sage', yucca: 'sage', agave: 'sage', scruboak: 'chapbig', chapbig: 'chap', chap: 'sage', sage: 'scruboak' }; // the scrub oak scan stands in for chaparral and sage until those are baked
// albedo tints: the scans are a touch greener than Poway in the dry season; chaparral reads dark olive, sage grey
const TINT = {
  oak: [0.74, 0.80, 0.66], olive: [0.96, 0.98, 0.92], scruboak: [0.72, 0.76, 0.62], slender: [0.9, 0.92, 0.82], cypress: [0.86, 0.90, 0.80],
  jacaranda: [1, 1, 1], eucalyptus: [1, 1, 1], palm_fan: [1, 1, 1], palm_date: [1, 1, 1], palm_queen: [1, 1, 1], pepper: [1, 1, 1],
  chapbig: [0.95, 1.0, 0.82], chap: [0.66, 0.71, 0.56], // the laurel sumac scan is dark already; the lemonade berry one bright sage: [0.98, 0.95, 0.86], opuntia: [1, 1, 1], yucca: [1, 1, 1], agave: [1, 1, 1],
};
// max height (m) a species is allowed to reach when scaled to fit the photo canopy
const MAXH = { oak: 16, olive: 9, scruboak: 6, slender: 12, cypress: 16, jacaranda: 14, eucalyptus: 36, palm_fan: 26, palm_date: 14, palm_queen: 14, pepper: 13, chapbig: 4.2, chap: 3, sage: 1.6, opuntia: 1.6, yucca: 4, agave: 2 };
const MINS = { sage: 1.3, chap: 1.0 }; // the scans of these are small; never shrink them further
// mature heights (m): a street tree here is usually full grown; the photo's canopy can understate it
const MINH = { eucalyptus: 18, oak: 9, olive: 5.5, jacaranda: 9, pepper: 8, slender: 7, cypress: 9, scruboak: 3 };

function pickW(rnd, table) { // [[name, weight], ...]
  let t = 0; for (const e of table) t += e[1];
  let r = rnd() * t; for (const e of table) { r -= e[1]; if (r <= 0) return e[0]; }
  return table[table.length - 1][0];
}

const CONTEXTS = new WeakMap(); // one per world description: the valley map and the building grid take a second to build
export function makeContext(D, w) {
  let c = CONTEXTS.get(w); if (!c) CONTEXTS.set(w, c = buildContext(D, w)); return c;
}
function buildContext(D, w) {
  // built-up density: building centroids on a 50 m grid, summed over 150 m boxes
  const BG = 50, bg = new Map();
  for (const b of D.buildings) { const p = b[2]; let x = 0, z = 0; const n = p.length / 2; for (let i = 0; i < n; i++) { x += p[i * 2]; z += p[i * 2 + 1]; } const k = Math.floor(x / n / BG) * 100000 + Math.floor(z / n / BG); bg.set(k, (bg.get(k) || 0) + 1); }
  const built = (x, z) => { const gx = Math.floor(x / BG), gz = Math.floor(z / BG); let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += bg.get((gx + a) * 100000 + gz + b) || 0; return s; };
  // valley depth: height minus the mean over ~220 m, on a 40 m grid (negative = creek bottom / canyon floor)
  const VG = 40; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let i = 0; i < D.trees.length; i += 4) { x0 = Math.min(x0, D.trees[i]); x1 = Math.max(x1, D.trees[i]); z0 = Math.min(z0, D.trees[i + 1]); z1 = Math.max(z1, D.trees[i + 1]); }
  x0 -= 200; z0 -= 200; x1 += 200; z1 += 200;
  const nx = Math.ceil((x1 - x0) / VG) + 1, nz = Math.ceil((z1 - z0) / VG) + 1;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = w.heightAt(x0 + i * VG, z0 + j * VG);
  const blur = (src, r) => { // separable box blur
    const a = new Float32Array(src.length), b = new Float32Array(src.length);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const ii = i + k; if (ii < 0 || ii >= nx) continue; s += src[j * nx + ii]; c++; } a[j * nx + i] = s / c; }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const jj = j + k; if (jj < 0 || jj >= nz) continue; s += a[jj * nx + i]; c++; } b[j * nx + i] = s / c; }
    return b;
  };
  const M = blur(H, 3);
  const valley = (x, z) => { const i = Math.round((x - x0) / VG), j = Math.round((z - z0) / VG); if (i < 0 || j < 0 || i >= nx || j >= nz) return 0; return H[j * nx + i] - M[j * nx + i]; };
  const areaKind = (x, z) => {
    const c = w.areaBins.get(w.ckey(Math.floor(x / w.AB), Math.floor(z / w.AB))); if (!c) return -1;
    for (const ai of c.a) { const A = w.areas[ai]; if (A.k !== 0 && pointInPoly(x, z, A.p)) return A.k; }
    return -1;
  };
  return { built, valley, areaKind, heightAt: w.groundAt || w.heightAt, slopeAt: w.slopeAt, reject: w.reject };
}

// one detection i (radius r) to a plant: picks the species, size and tint and adds it to veg. rnd: random numbers for this
// tree. Returns [species, instance index, is a tree] or null.
export function plantOne(D, i, r, ctx, veg, rnd) {
  const T = D.trees, x = T[i * 4], z = T[i * 4 + 1], kind = T[i * 4 + 2], sl = [0, 0];
  if (ctx.reject && ctx.reject(x, z)) return null; // on a road, sidewalk or shoulder
  const has = n => veg.lib.species.has(n);
  const resolve = n => { let k = n, guard = 0; while (!has(k) && FALLBACK[k] && guard++ < 4) k = FALLBACK[k]; return has(k) ? k : null; };
  const urban = ctx.built(x, z) >= 3, area = ctx.areaKind(x, z);
  let sp;
  if (area === 6) sp = pickW(rnd, [['eucalyptus', 6], ['oak', 3], ['scruboak', 1]]);              // groves (kind 2 is parking: nothing grows there)
  else if (urban || area === 1 || area === 3) {                                                     // planted
    if (kind === 3) sp = pickW(rnd, [['chap', 5], ['olive', 2], ['slender', 1], ['agave', 1]]);
    else if (kind === 0) sp = pickW(rnd, [['olive', 18], ['jacaranda', 14], ['slender', 8], ['palm_fan', 18], ['pepper', 12], ['oak', 10], ['scruboak', 6], ['eucalyptus', 6], ['palm_date', 6], ['palm_queen', 7]]);
    else sp = pickW(rnd, [['oak', 24], ['jacaranda', 16], ['eucalyptus', 26], ['pepper', 14], ['scruboak', 6], ['olive', 6], ['palm_fan', 8]]);
  } else {                                                                                          // wild
    const v = ctx.valley(x, z); ctx.slopeAt(x, z, sl); const steep = Math.hypot(sl[0], sl[1]);
    if (v < -6 && steep < 0.35 && kind !== 3) sp = pickW(rnd, [['oak', 7], ['scruboak', 2], ['chapbig', 1]]);   // creek bottoms
    else if (kind === 3) sp = pickW(rnd, [['chap', 40], ['sage', 34], ['chapbig', 14], ['opuntia', 8], ['yucca', 4]]);
    else if (kind === 0) sp = pickW(rnd, [['chapbig', 55], ['chap', 30], ['scruboak', 12], ['oak', 3]]);
    else sp = pickW(rnd, [['chapbig', 55], ['scruboak', 30], ['oak', 15]]);
  }
  const want = sp; sp = resolve(sp); if (!sp) return null; // shrubs drawn with a stand-in scan stay drive-through
  const lib = veg.lib.species.get(sp), vi = Math.floor(rnd() * lib.variants.length), V = lib.variants[vi];
  let scale = TREE_SPECIES.has(sp) && sp.startsWith('palm') ? 0.8 + rnd() * 0.35 : (2 * r) / Math.max(0.3, V.width);
  scale = Math.min(scale, (MAXH[want] || MAXH[sp] || 12) / Math.max(0.3, V.height));
  if (MINH[want] && TREE_SPECIES.has(want)) scale = Math.max(scale, (MINH[want] * (0.85 + rnd() * 0.5)) / Math.max(0.3, V.height));
  scale = Math.max(scale, MINS[sp] || 0.5) * (0.92 + rnd() * 0.16);
  const tint = TINT[want] || TINT[sp] || [1, 1, 1], b = 0.88 + rnd() * 0.24, h = rnd() * 0.08 - 0.04;
  const y = ctx.heightAt(x, z) - 0.08 * scale;
  const instIdx = veg.inst.get(sp) ? veg.inst.get(sp).x.length : 0;
  veg.add(sp, x, y, z, rnd() * Math.PI * 2, scale, vi, [tint[0] * b * (1 + h), tint[1] * b, tint[2] * b * (1 - h)]);
  return [sp, instIdx, TREE_SPECIES.has(want)];
}
// random numbers of one tree, the same whatever order the trees are planted in
export function treeRandom(i, seed = 1234) { let s = (i * 2654435761 + seed) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// returns { trees: [x, z, ...] for collision, counts }
const idle = () => new Promise(r => setTimeout(r, 0));
export async function assignPlants(D, filt, ctx, veg, seed = 1234) { // async: it yields to the game every few ms
  let tY = performance.now(); const counts = {}, trees = [], refs = [], n = D.trees.length / 4;
  for (let i = 0; i < n; i++) {
    if ((i & 511) === 0 && performance.now() - tY > 6) { await idle(); tY = performance.now(); }
    if (filt.action[i]) continue;
    const got = plantOne(D, i, filt.radius[i], ctx, veg, treeRandom(i, seed)); if (!got) continue;
    counts[got[0]] = (counts[got[0]] || 0) + 1;
    if (got[2]) { trees.push(D.trees[i * 4], D.trees[i * 4 + 1]); refs.push([got[0], got[1]]); }
  }
  return { trees, refs, counts };
}
