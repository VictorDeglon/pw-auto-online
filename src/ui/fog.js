// Map discovery. The big map and the minimap only show the Poway you have seen: everything else sits under a cloud
// that thins out toward the places you've been, with a soft, ragged edge (never squares). Markers for places,
// shops and other players stay hidden under it; missions, your job and your waypoint always show, and so do the
// deputies on the minimap (they're radar, not geography).
//   initFog(save)        once the world is up; reads / creates save.fog
//   updateFog(dt)        every frame (from the story update): reveals around you as you move
//   fogSeen(x, z, k)     has (x, z) been discovered? k = how much (0..1, default 0.5)
//   drawFog(g)           paints the cloud, in g's current world transform (game metres)
//   fogStats()           { pct } explored, for the journal
// Saved as the spots you stood at ({ v, p: [x, z, r, ...] }, whole metres): small, and it re-renders at any
// resolution. The cloud itself is a little canvas, one pixel per 24 m cell, drawn scaled up so it blurs.
import { ctx } from '../ctx.js';

const CELL = 24, PAD = 600;
const R_FOOT = 170, R_CAR = 230, STEP = 30; // reveal radius on foot / driving; metres moved between checks
const F = { ready: false, x0: 0, z0: 0, nx: 0, nz: 0, a: null, base: null, cv: null, g: null, img: null, dirty: null, ver: 0, pts: null, lx: 1e9, lz: 1e9, t: 0, seen: 0 };
export const FOG = F;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let s = 0, a = 0.5; for (let k = 0; k < 4; k++) { s += a * vnoise(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 5.3; a *= 0.5; } return s / 0.9375; }

// the cloud: deep blue-grey, mottled at a few hundred metres, lighter where it thins out at the edge of what you know
const C0 = [24, 31, 42], C1 = [44, 54, 70], RIM = [120, 132, 150];
function paint(k) {
  const a = F.a[k], b = F.base[k], d = F.img.data, o = k * 4;
  const rim = a > 0 && a < 255 ? Math.sin(a / 255 * Math.PI) * 0.55 : 0;
  for (let c = 0; c < 3; c++) d[o + c] = (C0[c] + (C1[c] - C0[c]) * b) * (1 - rim) + RIM[c] * rim;
  d[o + 3] = 255 - a;
}
function grow(i0, j0, i1, j1) { const r = F.dirty; if (!r) F.dirty = [i0, j0, i1, j1]; else { r[0] = Math.min(r[0], i0); r[1] = Math.min(r[1], j0); r[2] = Math.max(r[2], i1); r[3] = Math.max(r[3], j1); } }
// reveal a disc around (x, z): solid out to about half the radius, then a soft fall-off whose edge wanders with noise
function stamp(x, z, r) {
  const i0 = Math.max(0, Math.floor((x - r * 1.2 - F.x0) / CELL)), i1 = Math.min(F.nx - 1, Math.ceil((x + r * 1.2 - F.x0) / CELL));
  const j0 = Math.max(0, Math.floor((z - r * 1.2 - F.z0) / CELL)), j1 = Math.min(F.nz - 1, Math.ceil((z + r * 1.2 - F.z0) / CELL));
  if (i0 > i1 || j0 > j1) return;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = F.x0 + (i + 0.5) * CELL, cz = F.z0 + (j + 0.5) * CELL, d = Math.hypot(cx - x, cz - z);
    const rr = r * (0.8 + 0.4 * fbm(cx / 110, cz / 110)); if (d > rr) continue;
    const v = Math.round(255 * sstep(rr, rr * 0.5, d)), k = j * F.nx + i;
    if (v > F.a[k]) { if (F.a[k] < 128 && v >= 128) F.seen++; F.a[k] = v; paint(k); }
  }
  grow(i0, j0, i1, j1);
}
function flush() {
  const r = F.dirty; if (!r) return; F.dirty = null;
  F.g.putImageData(F.img, 0, 0, r[0], r[1], r[2] - r[0] + 1, r[3] - r[1] + 1); F.ver++;
}
function addPoint(x, z, r) { F.pts.push(Math.round(x), Math.round(z), Math.round(r)); stamp(x, z, r); }

export function initFog(save) {
  const b = ctx.D.bounds;
  F.x0 = b[0] - PAD; F.z0 = b[1] - PAD; F.nx = Math.ceil((b[2] - b[0] + PAD * 2) / CELL); F.nz = Math.ceil((b[3] - b[1] + PAD * 2) / CELL);
  const N = F.nx * F.nz; F.a = new Uint8Array(N); F.base = new Float32Array(N); F.seen = 0;
  F.cv = document.createElement('canvas'); F.cv.width = F.nx; F.cv.height = F.nz; F.g = F.cv.getContext('2d');
  F.img = F.g.createImageData(F.nx, F.nz);
  for (let j = 0; j < F.nz; j++) for (let i = 0; i < F.nx; i++) { const k = j * F.nx + i; F.base[k] = fbm(i * CELL / 420, j * CELL / 420); paint(k); }
  const s = save.fog;
  if (s && Array.isArray(s.p) && s.p.length % 3 === 0) { F.pts = s.p; for (let k = 0; k < F.pts.length; k += 3) stamp(F.pts[k], F.pts[k + 1], F.pts[k + 2]); }
  else { F.pts = []; for (const q of seedSpots(save)) addPoint(q.x, q.z, q.r); }
  save.fog = { v: 1, p: F.pts }; // the same array: every save writes what you've found so far
  F.dirty = [0, 0, F.nx - 1, F.nz - 1]; flush(); F.ready = true;
}
// a save from before discovery existed: you've clearly been where you are, where you started, and wherever the story
// took you (the givers of the missions you've done, and the places you can fast travel to)
function seedSpots(save) {
  const out = [], f = ctx.focusPos(), sp = ctx.spawnPt;
  out.push({ x: f.x, z: f.z, r: 260 }); if (sp) out.push({ x: sp.x, z: sp.z, r: 260 });
  const st = save.story, done = st && st.done || [];
  if (done.length && ctx.storyPlaces) for (const p of ctx.storyPlaces(done)) out.push({ x: p.x, z: p.z, r: 320 });
  return out;
}

export function updateFog(dt) {
  if (!F.ready) return;
  F.t -= dt; if (F.t > 0) return; F.t = 0.25;
  const f = ctx.focusPos(); if (!f || !isFinite(f.x)) return;
  if (Math.hypot(f.x - F.lx, f.z - F.lz) < STEP) return;
  F.lx = f.x; F.lz = f.z;
  const r = ctx.player && ctx.player.inCar ? R_CAR : R_FOOT;
  // nothing new to see here (all of the disc is already open): don't store another spot
  const probe = (x, z) => fogSeen(x, z, 0.99);
  if (probe(f.x, f.z) && probe(f.x + r * 0.7, f.z) && probe(f.x - r * 0.7, f.z) && probe(f.x, f.z + r * 0.7) && probe(f.x, f.z - r * 0.7)) return;
  addPoint(f.x, f.z, r); flush();
}
export function fogSeen(x, z, k = 0.5) {
  if (!F.ready) return true;
  const i = Math.floor((x - F.x0) / CELL), j = Math.floor((z - F.z0) / CELL);
  if (i < 0 || j < 0 || i >= F.nx || j >= F.nz) return false;
  return F.a[j * F.nx + i] >= k * 255;
}
export function drawFog(g) {
  if (!F.ready) return;
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.drawImage(F.cv, F.x0, F.z0, F.nx * CELL, F.nz * CELL); g.restore();
}
// share of the play area you've seen
export function fogStats() { const inner = (F.nx - 2 * PAD / CELL) * (F.nz - 2 * PAD / CELL); return { pct: F.ready ? Math.min(100, Math.round(F.seen / inner * 100)) : 0 }; }
// debug: open everything / reset (window.__gtp.fog)
export const fogDebug = {
  visit(x, z, r = R_CAR) { addPoint(x, z, r); flush(); },
  reveal() { for (let k = 0; k < F.a.length; k++) { F.a[k] = 255; paint(k); } F.pts.length = 0; F.pts.push(Math.round((F.x0 + F.nx * CELL / 2)), Math.round(F.z0 + F.nz * CELL / 2), 99999); F.dirty = [0, 0, F.nx - 1, F.nz - 1]; flush(); },
  reset() { F.a.fill(0); F.seen = 0; for (let k = 0; k < F.a.length; k++) paint(k); F.pts.length = 0; F.lx = F.lz = 1e9; F.dirty = [0, 0, F.nx - 1, F.nz - 1]; flush(); },
};
