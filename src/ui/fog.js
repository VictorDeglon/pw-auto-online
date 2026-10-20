// Map discovery. The big map and the minimap only show the ground you have seen: everything else sits under a cloud
// that thins out toward the places you've been, with a soft, ragged edge (never squares). Markers for places,
// shops and other players stay hidden under it; missions, your job and your waypoint always show, and so do the
// deputies on the minimap (they're radar, not geography).
//   initFog(save)        once the world is up; reads / creates save.fog
//   updateFog(dt)        every frame (from the story update): reveals around you as you move
//   fogSeen(x, z, k)     has (x, z) been discovered? k = how much (0..1, default 0.5)
//   drawFog(g, q)        paints the cloud, in g's current world transform (game metres); q = imageSmoothingQuality
//                        ('high' by default, for the big map; the minimap, redrawn every frame, can pass 'low')
//   fogStats()           { pct } explored, for the journal
// Saved as the spots you stood at ({ v, p: [x, z, r, ...] }, whole metres): small, and it re-renders at any
// resolution. A spot that opens nothing new isn't kept, and one within NEAR x its radius of a saved spot at least as
// wide only stands in as the newest (the tail) until you're past it, so going over known ground doesn't grow the save.
// The cloud itself is two little canvases drawn scaled up so they blur: one pixel per 24 m over Poway (the hand-built
// core), one per 128 m over the rest of the county (the outer world, src/world/outer.js), both opened by the same spots.
import { ctx } from '../ctx.js';

const CELL = 24, PAD = 600;      // Poway's cloud: cell size, margin past the core's bounds
const WCELL = 128, RING = 50000; // the county's: the outer world reaches 50 km past the core (tools/world/config.py)
const R_FOOT = 650, R_CAR = 950, R_PLANE = 1600, STEP = 25; // discovery bubble matching minimap sight range and wider
const NEAR = 0.15; // saved spots closer than this x radius (to one at least as wide) add next to nothing (0.4 lost ~5% of what you'd seen on reload)
const F = { ready: false, fine: null, wide: null, ver: 0, pts: null, tail: false, lx: 1e9, lz: 1e9, t: 0, seen: 0 };
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
function paint(G, k) {
  const a = G.a[k], b = G.base[k] / 255, d = G.img.data, o = k * 4;
  const rim = a > 0 && a < 255 ? Math.sin(a / 255 * Math.PI) * 0.55 : 0;
  for (let c = 0; c < 3; c++) d[o + c] = (C0[c] + (C1[c] - C0[c]) * b) * (1 - rim) + RIM[c] * rim;
  d[o + 3] = 255 - a;
}
// one cloud: cell size, where it starts, alpha (255 = seen), the mottle, the stamps' edge wander, and its canvas
function grid(x0, z0, x1, z1, cell) {
  const G = { cell, x0, z0, nx: Math.ceil((x1 - x0) / cell), nz: Math.ceil((z1 - z0) / cell), dirty: null };
  const N = G.nx * G.nz; G.a = new Uint8Array(N); G.base = new Uint8Array(N);
  G.rn = new Float32Array(N).fill(-1); // per cell 0.85..1.2 x a stamp's radius, worked out the first time a stamp reaches it
  G.cv = document.createElement('canvas'); G.cv.width = G.nx; G.cv.height = G.nz; G.g = G.cv.getContext('2d');
  G.img = G.g.createImageData(G.nx, G.nz);
  // the mottle in world metres, so the two clouds carry on into each other where they meet
  for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) { const k = j * G.nx + i; G.base[k] = 255 * fbm((x0 + i * cell) / 420, (z0 + j * cell) / 420); paint(G, k); }
  return G;
}
function grow(G, i0, j0, i1, j1) { const r = G.dirty; if (!r) G.dirty = [i0, j0, i1, j1]; else { r[0] = Math.min(r[0], i0); r[1] = Math.min(r[1], j0); r[2] = Math.max(r[2], i1); r[3] = Math.max(r[3], j1); } }
// reveal a disc around (x, z): soft fall-off whose edge wanders with noise and feathers smoothly. True if it opened
// anything. Cells already wide open, and those past the farthest the edge can wander (1.2 r), are skipped early.
function stampIn(G, x, z, r) {
  const C = G.cell, a = G.a, rn = G.rn, nx = G.nx, far = r * r * 1.44;
  const i0 = Math.max(0, Math.floor((x - r * 1.3 - G.x0) / C)), i1 = Math.min(G.nx - 1, Math.ceil((x + r * 1.3 - G.x0) / C));
  const j0 = Math.max(0, Math.floor((z - r * 1.3 - G.z0) / C)), j1 = Math.min(G.nz - 1, Math.ceil((z + r * 1.3 - G.z0) / C));
  if (i0 > i1 || j0 > j1) return false;
  let up = false;
  for (let j = j0; j <= j1; j++) {
    const cz = G.z0 + (j + 0.5) * C, dz = cz - z;
    for (let i = i0; i <= i1; i++) {
      const k = j * nx + i; if (a[k] === 255) continue;
      const cx = G.x0 + (i + 0.5) * C, dx = cx - x, d2 = dx * dx + dz * dz; if (d2 > far) continue;
      let n = rn[k]; if (n < 0) n = rn[k] = 0.85 + 0.35 * fbm(cx / 110, cz / 110);
      const rr = r * n, d = Math.sqrt(d2); if (d > rr) continue;
      const v = Math.round(255 * sstep(rr, rr * 0.15, d));
      if (v > a[k]) { if (G === F.fine && a[k] < 128 && v >= 128) F.seen++; a[k] = v; paint(G, k); up = true; }
    }
  }
  if (up) grow(G, i0, j0, i1, j1);
  return up;
}
function stamp(x, z, r) { const a = stampIn(F.fine, x, z, r), b = stampIn(F.wide, x, z, r + WCELL * 0.75); return a || b; } // a little wider in the coarse cloud, or its blur eats most of the disc
function flush() {
  for (const G of [F.fine, F.wide]) {
    const r = G.dirty; if (!r) continue; G.dirty = null;
    G.g.putImageData(G.img, 0, 0, r[0], r[1], r[2] - r[0] + 1, r[3] - r[1] + 1); F.ver++;
  }
}
// open up a spot and remember it (see the top: a spot near a saved one replaces the tail instead of adding to the save)
function addPoint(x, z, r) {
  if (!stamp(x, z, r)) return; // opened nothing: nothing to remember
  const P = F.pts, end = P.length - (F.tail ? 3 : 0); x = Math.round(x); z = Math.round(z); r = Math.round(r);
  let near = false;
  for (let k = end - 3; k >= 0 && !near; k -= 3) near = P[k + 2] >= r && Math.hypot(P[k] - x, P[k + 1] - z) < NEAR * r;
  // the old tail goes if this one covers it; otherwise it's kept for good
  if (F.tail && r >= P[end + 2] && Math.hypot(P[end] - x, P[end + 1] - z) < NEAR * P[end + 2]) P.length = end;
  P.push(x, z, r); F.tail = near;
}
const all = G => { G.dirty = [0, 0, G.nx - 1, G.nz - 1]; };

export function initFog(save) {
  const b = ctx.D.bounds;
  F.fine = grid(b[0] - PAD, b[1] - PAD, b[2] + PAD, b[3] + PAD, CELL);
  F.wide = grid(b[0] - RING, b[1] - RING, b[2] + RING, b[3] + RING, WCELL);
  F.seen = 0;
  const s = save.fog;
  F.pts = []; F.tail = false;
  // replay the saved spots, leaving out any that opened nothing the ones before it hadn't (the cloud comes out the same)
  if (s && Array.isArray(s.p) && s.p.length % 3 === 0) { const p = s.p; for (let k = 0; k < p.length; k += 3) if (stamp(p[k], p[k + 1], p[k + 2])) F.pts.push(p[k], p[k + 1], p[k + 2]); }
  else for (const q of seedSpots(save)) addPoint(q.x, q.z, q.r);
  save.fog = { v: 1, p: F.pts }; // the same array: every save writes what you've found so far
  all(F.fine); all(F.wide); flush(); F.ready = true;
}
// a save from before discovery existed: you've clearly been where you are, where you started, and wherever the story
// took you (the givers of the missions you've done, and the places you can fast travel to)
function seedSpots(save) {
  const out = [], f = ctx.focusPos(), sp = ctx.spawnPt;
  out.push({ x: f.x, z: f.z, r: 520 }); if (sp) out.push({ x: sp.x, z: sp.z, r: 520 });
  const st = save.story, done = st && st.done || [];
  if (done.length && ctx.storyPlaces) for (const p of ctx.storyPlaces(done)) out.push({ x: p.x, z: p.z, r: 640 });
  return out;
}

export function updateFog(dt) {
  if (!F.ready) return;
  F.t -= dt; if (F.t > 0) return; F.t = 0.25;
  const f = ctx.focusPos(); if (!f || !isFinite(f.x)) return;
  if (Math.hypot(f.x - F.lx, f.z - F.lz) < STEP) return;
  F.lx = f.x; F.lz = f.z;
  const isPlane = (ctx.player && ctx.player.inPlane) || (ctx.JET && ctx.JET.on);
  const r = isPlane ? R_PLANE : (ctx.player && ctx.player.inCar ? R_CAR : R_FOOT);
  // nothing new to see here (all of the disc is already open): don't store another spot
  const probe = (x, z) => fogSeen(x, z, 0.99);
  if (probe(f.x, f.z) && probe(f.x + r * 0.7, f.z) && probe(f.x - r * 0.7, f.z) && probe(f.x, f.z + r * 0.7) && probe(f.x, f.z - r * 0.7)) return;
  addPoint(f.x, f.z, r); flush();
}
const cellOf = (G, x, z) => { const i = Math.floor((x - G.x0) / G.cell), j = Math.floor((z - G.z0) / G.cell); return i < 0 || j < 0 || i >= G.nx || j >= G.nz ? -1 : j * G.nx + i; };
export function fogSeen(x, z, k = 0.5) {
  if (!F.ready) return true;
  let c = cellOf(F.fine, x, z); if (c >= 0) return F.fine.a[c] >= k * 255;
  c = cellOf(F.wide, x, z); return c >= 0 && F.wide.a[c] >= k * 255;
}
// the canvas's extent in world metres (through the inverse of g's transform), or null if that can't be worked out
function viewOf(g) {
  const m = g.getTransform ? g.getTransform().inverse() : null, w = g.canvas.width, h = g.canvas.height; if (!m) return null;
  const xs = [m.e, m.a * w + m.e, m.c * h + m.e, m.a * w + m.c * h + m.e], zs = [m.f, m.b * w + m.f, m.d * h + m.f, m.b * w + m.d * h + m.f];
  const v = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  return v.every(isFinite) ? v : null;
}
// the cells of G under the view, with a 3-cell margin so the smoothing at the cut is off screen: [i0, j0, i1, j1) or null
function cellsIn(G, v) {
  if (!v) return [0, 0, G.nx, G.nz];
  const i0 = Math.max(0, Math.floor((v[0] - G.x0) / G.cell) - 3), i1 = Math.min(G.nx, Math.ceil((v[2] - G.x0) / G.cell) + 3);
  const j0 = Math.max(0, Math.floor((v[1] - G.z0) / G.cell) - 3), j1 = Math.min(G.nz, Math.ceil((v[3] - G.z0) / G.cell) + 3);
  return i0 < i1 && j0 < j1 ? [i0, j0, i1, j1] : null;
}
function blit(g, G, c, quality) {
  const C = G.cell, w = c[2] - c[0], h = c[3] - c[1];
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = quality; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.drawImage(G.cv, c[0], c[1], w, h, G.x0 + c[0] * C, G.z0 + c[1] * C, w * C, h * C);
}
// only the part of each cloud that's on the canvas is drawn; the county's is skipped when the view is all Poway, and
// needs its hole clipped only when Poway is in view
export function drawFog(g, quality = 'high') {
  if (!F.ready) return;
  const W = F.wide, P = F.fine, v = viewOf(g), pc = cellsIn(P, v);
  const inP = v && v[0] >= P.x0 && v[1] >= P.z0 && v[2] <= P.x0 + P.nx * P.cell && v[3] <= P.z0 + P.nz * P.cell, wc = inP ? null : cellsIn(W, v);
  // the county's coarse cloud everywhere but Poway, then Poway's fine one in the hole
  if (wc) {
    g.save();
    if (pc) { g.beginPath(); g.rect(W.x0, W.z0, W.nx * W.cell, W.nz * W.cell); g.rect(P.x0, P.z0, P.nx * P.cell, P.nz * P.cell); g.clip('evenodd'); }
    blit(g, W, wc, quality); g.restore();
  }
  if (pc) { g.save(); blit(g, P, pc, quality); g.restore(); }
}
// share of Poway you've seen (the county is far too big to count)
export function fogStats() { const P = F.fine, inner = P ? (P.nx - 2 * PAD / CELL) * (P.nz - 2 * PAD / CELL) : 1; return { pct: F.ready ? Math.min(100, Math.round(F.seen / inner * 100)) : 0 }; }
// debug: open everything / reset (window.__gtp.fog)
export const fogDebug = {
  visit(x, z, r = R_CAR) { addPoint(x, z, r); flush(); },
  reveal() {
    for (const G of [F.fine, F.wide]) { G.a.fill(255); for (let k = 0; k < G.a.length; k++) paint(G, k); all(G); }
    const W = F.wide; F.pts.length = 0; F.tail = false; F.pts.push(Math.round(W.x0 + W.nx * W.cell / 2), Math.round(W.z0 + W.nz * W.cell / 2), 200000); flush();
  },
  reset() { for (const G of [F.fine, F.wide]) { G.a.fill(0); for (let k = 0; k < G.a.length; k++) paint(G, k); all(G); } F.seen = 0; F.pts.length = 0; F.tail = false; F.lx = F.lz = 1e9; flush(); },
};
