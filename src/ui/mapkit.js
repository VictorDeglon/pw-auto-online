// Map drawing shared by the minimap and the big map (M).
//  - Photo edge: the aerial photo, and the streets on it, fade out along a natural line (a few hundred metres past
//    the last streets and buildings, plus a ragged feather inside the photo's own rectangle) instead of ending in a
//    hard rectangle. buildPhotoMask() once, drawMasked() wherever the photo is drawn.
//  - Markers: one list for both maps (mapMarks() in index.html), laid out by layoutMarks(): markers of the same group
//    that sit close together on screen merge into a badge with a count (it splits as you zoom in), labels never
//    overlap (the less important one is dropped), and a fixed priority decides what sits on top:
//    0 you, 1 other players, 2 missions / job / waypoint, 3 shops / garage / services, 4 everything else.
//  - Other players come from REMOTES (src/online/remote.js), which the net.js 'player:*' events fill whatever the
//    transport is.
import { REMOTES } from '../online/remote.js';
import { shownName } from '../online/shown.js';

const TAU = Math.PI * 2, INK = 'rgba(10,12,16,.92)', PAPER = '#f3ede1', FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const fmtDist = d => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';

// ------------------------------------------------------------------ photo edge
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let s = 0, a = 0.5; for (let k = 0; k < 4; k++) { s += a * vnoise(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 5.3; a *= 0.5; } return s / 0.9375; }
// distance (in cells) from every cell to the nearest set cell: two-pass chamfer, close enough to Euclidean here
function chamfer(set, nx, nz) {
  const D = new Float32Array(nx * nz), S2 = Math.SQRT2;
  for (let k = 0; k < D.length; k++) D[k] = set[k] ? 0 : 1e9;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; let d = D[k]; if (!d) continue;
    if (i > 0) d = Math.min(d, D[k - 1] + 1);
    if (j > 0) { d = Math.min(d, D[k - nx] + 1); if (i > 0) d = Math.min(d, D[k - nx - 1] + S2); if (i < nx - 1) d = Math.min(d, D[k - nx + 1] + S2); }
    D[k] = d;
  }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; let d = D[k]; if (!d) continue;
    if (i < nx - 1) d = Math.min(d, D[k + 1] + 1);
    if (j < nz - 1) { d = Math.min(d, D[k + nx] + 1); if (i < nx - 1) d = Math.min(d, D[k + nx + 1] + S2); if (i > 0) d = Math.min(d, D[k + nx - 1] + S2); }
    D[k] = d;
  }
  return D;
}
function boxBlur(a, nx, nz, r) {
  const t = new Float32Array(a.length);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const ii = i + k; if (ii >= 0 && ii < nx) { s += a[j * nx + ii]; n++; } } t[j * nx + i] = s / n; }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const jj = j + k; if (jj >= 0 && jj < nz) { s += t[jj * nx + i]; n++; } } a[j * nx + i] = s / n; }
}
// rect: the photo's [x0, z0, x1, z1] in game metres; roads / buildings: D.roads / D.buildings; keep: [{ x, z, r }]
// places that stay on the photo however few streets they have (the named regions out in the hills).
// Returns { canvas, x0, z0, x1, z1 }: an alpha mask in game coordinates, drawn scaled up (so it blurs) over the photo.
export function buildPhotoMask(rect, roads, buildings, keep = [], C = 40) { // C: metres per cell
  const PAD = Math.max(600, C * 4); // margin around everything a map draws
  const x0 = rect[0] - PAD, z0 = rect[1] - PAD, nx = Math.ceil((rect[2] - rect[0] + PAD * 2) / C), nz = Math.ceil((rect[3] - rect[1] + PAD * 2) / C), N = nx * nz;
  const occ = new Uint8Array(N);
  const put = (x, z) => { const i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C); if (i >= 0 && j >= 0 && i < nx && j < nz) occ[j * nx + i] = 1; };
  for (const r of roads) {
    if (r[1] === 6) continue; // footpaths and trails wander into the hills; streets mark where the town is
    const p = r[3]; put(p[0], p[1]);
    for (let k = 2; k + 1 < p.length; k += 2) { const ax = p[k - 2], az = p[k - 1], n = Math.ceil(Math.hypot(p[k] - ax, p[k + 1] - az) / C); for (let s = 1; s <= n; s++) put(ax + (p[k] - ax) * s / n, az + (p[k + 1] - az) * s / n); }
  }
  for (const b of buildings) { const p = b[2]; if (p && p.length > 1) put(p[0], p[1]); }
  for (const k of keep) for (let dz = -k.r; dz <= k.r; dz += C) for (let dx = -k.r; dx <= k.r; dx += C) if (dx * dx + dz * dz <= k.r * k.r) put(k.x + dx, k.z + dz);
  // land = everything within REACH of a street or building, plus whatever that encloses (lakes, reserves, the hills
  // inside town): flood the far-from-everything cells in from the border; what the flood can't reach is land
  const REACH = 650 / C, near = chamfer(occ, nx, nz), out = new Uint8Array(N), q = [];
  const seed = k => { if (!out[k] && near[k] > REACH) { out[k] = 1; q.push(k); } };
  for (let i = 0; i < nx; i++) { seed(i); seed((nz - 1) * nx + i); }
  for (let j = 0; j < nz; j++) { seed(j * nx); seed(j * nx + nx - 1); }
  while (q.length) { const k = q.pop(), i = k % nx; if (i > 0) seed(k - 1); if (i < nx - 1) seed(k + 1); if (k >= nx) seed(k - nx); if (k < N - nx) seed(k + nx); }
  const inward = chamfer(out, nx, nz), a = new Float32Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + (i + 0.5) * C, z = z0 + (j + 0.5) * C, n = fbm(x / (1500 * C / 40), z / (1500 * C / 40));
    const f = C / 40, land = sstep(100 * f, 750 * f, inward[k] * C - n * 300 * f); // fades out a few hundred metres past the last streets
    const ed = Math.min(x - rect[0], rect[2] - x, z - rect[1], rect[3] - z) - n * 420 * f; // ragged, never a straight line
    a[k] = land * sstep(0, 420 * f, ed);
  }
  boxBlur(a, nx, nz, 2); boxBlur(a, nx, nz, 2);
  const canvas = document.createElement('canvas'); canvas.width = nx; canvas.height = nz;
  const c = canvas.getContext('2d'), img = c.createImageData(nx, nz);
  for (let k = 0; k < N; k++) { img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = 255; img.data[k * 4 + 3] = Math.round(a[k] * 255); }
  c.putImageData(img, 0, 0);
  return { canvas, x0, z0, x1: x0 + nx * C, z1: z0 + nz * C };
}
// Draws draw(L) (in g's current transform) into layer, cuts it to the mask, and puts the result on g.
export function drawMasked(g, layer, mask, draw) {
  const W = g.canvas.width, H = g.canvas.height;
  if (layer.width !== W || layer.height !== H) { layer.width = W; layer.height = H; }
  const L = layer.getContext('2d');
  L.setTransform(1, 0, 0, 1, 0, 0); L.globalCompositeOperation = 'source-over'; L.globalAlpha = 1; L.clearRect(0, 0, W, H);
  L.save(); L.setTransform(g.getTransform()); draw(L); L.restore();
  if (mask) {
    L.save(); L.setTransform(g.getTransform()); L.globalAlpha = 1; L.globalCompositeOperation = 'destination-in'; L.imageSmoothingEnabled = true;
    L.drawImage(mask.canvas, mask.x0, mask.z0, mask.x1 - mask.x0, mask.z1 - mask.z0); L.restore();
  }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.drawImage(layer, 0, 0); g.restore();
}

// ------------------------------------------------------------------ markers
// mark: { x, z, pri, kind: 'icon' | 'dot' | 'player' | 'pin', color, glyph, label, group (merges with its kind),
//         plural (a merged badge's label), edge (wait at the map's edge when off it), nodist, r (dots), dead, car, heading }
// Other players, for both maps. live: their latest reported position (the big map, which stays open while the
// world is frozen) instead of where their body is drawn.
export function playerMarks(live) {
  const out = [];
  for (const r of REMOTES.values()) {
    const st = r.st, p = r.ped; if (!st && !p) continue;
    const x = live || !p ? st.x : p.pos.x, z = live || !p ? st.z : p.pos.z;
    out.push({ kind: 'player', pri: 1, x, z, color: r.color, label: shownName(r.name, r.id, r.skin), group: 'player', edge: true, dead: !!(st && st.dead), car: !!(st && st.car), heading: p ? p.rotY : st.r });
  }
  return out;
}
// opt: { toScreen(x, z) -> [sx, sy], onMap(sx, sy) -> bool, toEdge(sx, sy) -> [ex, ey, ang] or null when no clamping
// is needed, cluster: merge distance (px) }. Returns items { m, x, y, n, members, edge, ang, hd }, most important first.
export function layoutMarks(marks, opt) {
  const items = [], sorted = marks.slice().sort((a, b) => a.pri - b.pri), c2 = opt.cluster * opt.cluster;
  for (const m of sorted) {
    let [x, y] = opt.toScreen(m.x, m.z), edge = false, ang = 0;
    const e = m.edge ? opt.toEdge(x, y) : null;
    if (e) { [x, y, ang] = e; edge = true; } else if (!opt.onMap(x, y)) continue;
    if (m.group && m.kind !== 'dot') {
      let best = null, bd = c2;
      for (const it of items) if (it.m.group === m.group && it.edge === edge) { const d = (it.x - x) ** 2 + (it.y - y) ** 2; if (d < bd) { bd = d; best = it; } }
      if (best) { best.members.push(m); best.n++; if (!edge) { best.sx += x; best.sy += y; best.x = best.sx / best.n; best.y = best.sy / best.n; } continue; }
    }
    let hd = null;
    if (m.heading != null && !m.dead) { const [ax, ay] = opt.toScreen(m.x + Math.sin(m.heading) * 50, m.z + Math.cos(m.heading) * 50), [bx, by] = opt.toScreen(m.x, m.z); hd = Math.atan2(ay - by, ax - bx); }
    items.push({ m, x, y, n: 1, members: [m], sx: x, sy: y, edge, ang, hd });
  }
  return items;
}
// spread markers sitting on a round map's rim so they don't stack (angles around cx, cy at radius rad)
export function spreadRim(items, cx, cy, rad, gap) {
  const rim = items.filter(it => it.edge).sort((a, b) => a.ang - b.ang); if (rim.length < 2) return;
  const minA = gap / rad;
  for (let pass = 0; pass < 6; pass++) for (let i = 0; i < rim.length; i++) {
    const a = rim[i], b = rim[(i + 1) % rim.length]; let d = b.ang - a.ang; if (i === rim.length - 1) d += TAU;
    if (d < minA) { const push = (minA - d) / 2; a.ang -= push; b.ang += push; }
  }
  for (const it of rim) { it.x = cx + Math.cos(it.ang) * rad; it.y = cy + Math.sin(it.ang) * rad; }
}

function lum(hex) { const n = parseInt(hex.slice(1, 7), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; }
function star(g, x, y, r1, r2) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r2 : r1; i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); }
// one symbol per kind of place, drawn (not a font glyph) so it looks the same everywhere; r = the icon's radius
function glyph(g, k, x, y, r, col) {
  const u = r / 10; g.save(); g.translate(x, y); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.8 * u; g.lineCap = g.lineJoin = 'round';
  switch (k) {
    case 'hospital': g.fillRect(-1.9 * u, -5.6 * u, 3.8 * u, 11.2 * u); g.fillRect(-5.6 * u, -1.9 * u, 11.2 * u, 3.8 * u); break;
    case 'police': case 'star': star(g, 0, 0.6 * u, 6.4 * u, 2.7 * u); g.fill(); break;
    case 'garage': g.beginPath(); g.moveTo(-6 * u, -0.6 * u); g.lineTo(0, -6 * u); g.lineTo(6 * u, -0.6 * u); g.lineTo(6 * u, 5.4 * u); g.lineTo(-6 * u, 5.4 * u); g.closePath(); g.fill(); break;
    case 'park': g.beginPath(); g.arc(0, -1.6 * u, 4.6 * u, 0, TAU); g.fill(); g.fillRect(-1.1 * u, 1.5 * u, 2.2 * u, 4.6 * u); break;
    case 'water': for (const dy of [-2.4, 2.6]) { g.beginPath(); g.moveTo(-6 * u, dy * u); g.bezierCurveTo(-3 * u, (dy - 3) * u, -1 * u, (dy + 3) * u, 1.5 * u, dy * u); g.bezierCurveTo(3.5 * u, (dy - 3) * u, 5 * u, (dy + 1.5) * u, 6 * u, (dy - 0.5) * u); g.stroke(); } break;
    case 'school': g.beginPath(); g.moveTo(-6.8 * u, -1.2 * u); g.lineTo(0, -4.8 * u); g.lineTo(6.8 * u, -1.2 * u); g.lineTo(0, 2.4 * u); g.closePath(); g.fill(); g.fillRect(-3.8 * u, 0, 7.6 * u, 4.4 * u); g.fillRect(5.1 * u, -1.4 * u, 1.2 * u, 5.6 * u); break;
    case 'library': g.beginPath(); g.moveTo(0, -3.4 * u); g.lineTo(-6 * u, -5 * u); g.lineTo(-6 * u, 4 * u); g.lineTo(0, 5.4 * u); g.lineTo(6 * u, 4 * u); g.lineTo(6 * u, -5 * u); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1 * u; g.beginPath(); g.moveTo(0, -3.4 * u); g.lineTo(0, 5.4 * u); g.stroke(); break;
    case 'fire_station': g.beginPath(); g.moveTo(0, -6.4 * u); g.bezierCurveTo(4.6 * u, -1.8 * u, 6 * u, 1.2 * u, 4.4 * u, 4 * u); g.bezierCurveTo(2.6 * u, 6.6 * u, -2.6 * u, 6.6 * u, -4.4 * u, 4 * u); g.bezierCurveTo(-5.8 * u, 1.2 * u, -3.2 * u, -1 * u, 0, -6.4 * u); g.fill(); break;
    case 'university': g.beginPath(); g.moveTo(-6.8 * u, -1.2 * u); g.lineTo(0, -4.8 * u); g.lineTo(6.8 * u, -1.2 * u); g.lineTo(0, 2.4 * u); g.closePath(); g.fill(); g.fillRect(-3.8 * u, 0, 7.6 * u, 4.4 * u); break;
    case 'beach': g.beginPath(); g.arc(0, -1.2 * u, 3.6 * u, Math.PI, 0); g.fill(); g.beginPath(); g.moveTo(-6 * u, 3.6 * u); g.bezierCurveTo(-3 * u, 0.8 * u, -1 * u, 6.4 * u, 1.5 * u, 3.6 * u); g.bezierCurveTo(3.5 * u, 1 * u, 5 * u, 5 * u, 6 * u, 3 * u); g.stroke(); break;
    case 'airport': g.beginPath(); g.moveTo(0, -6.5 * u); g.lineTo(1.2 * u, -1.5 * u); g.lineTo(6.5 * u, 1.5 * u); g.lineTo(6.5 * u, 2.8 * u); g.lineTo(1.2 * u, 1.5 * u); g.lineTo(0.9 * u, 4.5 * u); g.lineTo(2.6 * u, 5.8 * u); g.lineTo(2.6 * u, 6.6 * u); g.lineTo(0, 5.8 * u); g.lineTo(-2.6 * u, 6.6 * u); g.lineTo(-2.6 * u, 5.8 * u); g.lineTo(-0.9 * u, 4.5 * u); g.lineTo(-1.2 * u, 1.5 * u); g.lineTo(-6.5 * u, 2.8 * u); g.lineTo(-6.5 * u, 1.5 * u); g.lineTo(-1.2 * u, -1.5 * u); g.closePath(); g.fill(); break;
    case 'stadium': g.lineWidth = 2.2 * u; g.beginPath(); g.ellipse(0, 0, 6 * u, 4 * u, 0, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(0, 0, 2.6 * u, 1.4 * u, 0, 0, TAU); g.fill(); break;
    case 'attraction': case 'military': star(g, 0, 0.6 * u, 6.4 * u, 2.7 * u); if (k === 'military') { g.lineWidth = 1.2 * u; g.stroke(); } else g.fill(); break;
    case 'mall': g.fillRect(-4.6 * u, -2 * u, 9.2 * u, 7.6 * u); g.lineWidth = 1.6 * u; g.beginPath(); g.arc(0, -2 * u, 2.6 * u, Math.PI, 0); g.stroke(); break;
    case 'pier': g.fillRect(-1.2 * u, -6 * u, 2.4 * u, 12 * u); for (const yy of [-4, 0, 4]) g.fillRect(-4 * u, (yy - 0.6) * u, 8 * u, 1.2 * u); break;
    case 'peak': g.beginPath(); g.moveTo(-6.4 * u, 5 * u); g.lineTo(-1 * u, -5.4 * u); g.lineTo(1.6 * u, -0.6 * u); g.lineTo(3 * u, -2.6 * u); g.lineTo(6.4 * u, 5 * u); g.closePath(); g.fill(); break;
    case 'fuel': g.fillRect(-4.2 * u, -4.8 * u, 5.8 * u, 9.6 * u); g.beginPath(); g.moveTo(2 * u, -2 * u); g.lineTo(4.6 * u, -2 * u); g.lineTo(4.6 * u, 2.8 * u); g.stroke(); break;
    case 'cafe': g.fillRect(-4.2 * u, -2.8 * u, 6.4 * u, 6.8 * u); g.lineWidth = 1.4 * u; g.beginPath(); g.arc(2.8 * u, 0, 1.9 * u, -Math.PI * 0.5, Math.PI * 0.5); g.stroke(); break;
    case 'fast_food': g.beginPath(); g.arc(0, -1.8 * u, 5.2 * u, Math.PI, 0); g.fill(); g.fillRect(-5.2 * u, -0.4 * u, 10.4 * u, 2.4 * u); g.fillRect(-4.6 * u, 2.8 * u, 9.2 * u, 2.2 * u); break;
    case 'restaurant': g.fillRect(-3.6 * u, -5.2 * u, 1.8 * u, 10.4 * u); g.fillRect(1.8 * u, -5.2 * u, 1.8 * u, 10.4 * u); g.fillRect(-4.8 * u, -5.2 * u, 4.2 * u, 3.2 * u); break;
    case 'bank': g.beginPath(); g.moveTo(0, -5.5 * u); g.lineTo(-5.5 * u, -2.2 * u); g.lineTo(5.5 * u, -2.2 * u); g.closePath(); g.fill(); g.fillRect(-4.2 * u, -1.6 * u, 1.6 * u, 5.2 * u); g.fillRect(-0.8 * u, -1.6 * u, 1.6 * u, 5.2 * u); g.fillRect(2.6 * u, -1.6 * u, 1.6 * u, 5.2 * u); g.fillRect(-5.5 * u, 4.2 * u, 11 * u, 1.6 * u); break;
    case 'shop': g.fillRect(-4.5 * u, -2 * u, 9 * u, 7.5 * u); g.lineWidth = 1.5 * u; g.beginPath(); g.arc(0, -2 * u, 2.4 * u, Math.PI, 0); g.stroke(); break;
    case 'dead': g.lineWidth = 2.4 * u; g.beginPath(); g.moveTo(-4 * u, -4 * u); g.lineTo(4 * u, 4 * u); g.moveTo(4 * u, -4 * u); g.lineTo(-4 * u, 4 * u); g.stroke(); break;
    case 'crew': // a crew garage: a shed with an arrow going down into it (src/games/entrances.js)
      g.beginPath(); g.moveTo(-6.4 * u, -1 * u); g.lineTo(0, -6 * u); g.lineTo(6.4 * u, -1 * u); g.lineTo(6.4 * u, 5.6 * u); g.lineTo(-6.4 * u, 5.6 * u); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(10,12,16,.9)'; g.lineWidth = 1.7 * u; g.beginPath(); g.moveTo(0, -2.2 * u); g.lineTo(0, 3.6 * u); g.moveTo(-2.4 * u, 1.3 * u); g.lineTo(0, 3.8 * u); g.lineTo(2.4 * u, 1.3 * u); g.stroke(); break;
    default: g.font = `700 ${(k.length > 1 ? 9.5 : 12.5) * u}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(k, 0, 0.8 * u);
  }
  g.restore();
}
function badge(g, x, y, r, n, s) { // the count on a cluster
  const t = String(n), f = 9.5 * s; g.font = `700 ${f}px ${FONT}`; const w = Math.max(f * 1.25, g.measureText(t).width + 6 * s), h = f * 1.25, bx = x + r * 0.62, by = y - r * 0.95;
  g.fillStyle = '#0e1013'; g.strokeStyle = PAPER; g.lineWidth = 1.3 * s; g.beginPath(); g.roundRect(bx - w / 2, by - h / 2, w, h, h / 2); g.fill(); g.stroke();
  g.fillStyle = PAPER; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, bx, by + 0.6 * s);
}
function arrow(g, x, y, ang, r, s, col) { // points from the marker toward where the thing really is
  const c = Math.cos(ang), sn = Math.sin(ang), tip = r + 7.5 * s, base = r + 1.2 * s, w = 5 * s;
  g.beginPath(); g.moveTo(x + c * tip, y + sn * tip); g.lineTo(x + c * base - sn * w, y + sn * base + c * w); g.lineTo(x + c * base + sn * w, y + sn * base - c * w); g.closePath();
  g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = 1.4 * s; g.fill(); g.stroke();
}
// You: a white arrow with a pulsing halo. ang: screen angle the arrow points to (0 = up). s: pixels per unit.
export function drawSelf(g, x, y, ang, s, t) {
  const k = (t % 1.6) / 1.6;
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(255,214,90,.30)'; g.beginPath(); g.arc(0, 0, 13 * s, 0, TAU); g.fill();
  g.strokeStyle = `rgba(255,236,170,${(0.85 * (1 - k)).toFixed(3)})`; g.lineWidth = 2.2 * s; g.beginPath(); g.arc(0, 0, (12 + 11 * k) * s, 0, TAU); g.stroke();
  g.rotate(ang); g.beginPath(); g.moveTo(0, -11 * s); g.lineTo(7.6 * s, 8.6 * s); g.lineTo(0, 4.2 * s); g.lineTo(-7.6 * s, 8.6 * s); g.closePath();
  g.lineJoin = 'round'; g.fillStyle = '#fff'; g.strokeStyle = '#0e1013'; g.lineWidth = 2.4 * s; g.stroke(); g.fill();
  g.restore();
}
// o: { s: px per unit, r: icon radius (units), labels: 'all' | 'players' | 'none', busy: [[x0, y0, x1, y1]] taken already,
//      from: { x, z } for distances on edge markers, clip: [x0, y0, x1, y1] and / or inside(box) -> bool: where labels
//      must stay, short: longest label (characters), inward: edge markers' labels go toward the middle first }
// Returns the boxes it drew, for hit tests.
export function drawItems(g, items, o) {
  const s = o.s, R = o.r * s, busy = (o.busy || []).slice(), drawn = [];
  const sizeOf = it => it.m.kind === 'dot' ? (it.m.r || 3) * s : it.m.kind === 'player' ? R * 1.12 : R;
  // icons, least important first so the important ones sit on top
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i], m = it.m, x = it.x, y = it.y, r = sizeOf(it);
    if (m.kind === 'dot') { g.fillStyle = m.color; g.strokeStyle = INK; g.lineWidth = 1.3 * s; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.stroke(); if (it.edge) arrow(g, x, y, it.ang, r - 2 * s, s * 0.7, m.color); continue; }
    if (it.edge) arrow(g, x, y, it.ang, r, s, m.color);
    if (m.kind === 'pin') { // teardrop pin, the point on the spot (or on the edge marker)
      const py = it.edge ? y + r * 0.9 : y;
      g.beginPath(); g.moveTo(x, py); g.bezierCurveTo(x - r * 0.25, py - r * 0.9, x - r * 1.05, py - r * 1.25, x - r * 1.05, py - r * 2.05);
      g.arc(x, py - r * 2.05, r * 1.05, Math.PI, 0); g.bezierCurveTo(x + r * 1.05, py - r * 1.25, x + r * 0.25, py - r * 0.9, x, py); g.closePath();
      g.fillStyle = m.color; g.strokeStyle = INK; g.lineWidth = 1.8 * s; g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, py - r * 2.05, r * 0.4, 0, TAU); g.fill();
      drawn.push({ it, box: [x - r * 1.1, py - r * 3.2, x + r * 1.1, py] }); busy.push([x - r * 1.1, py - r * 3.2, x + r * 1.1, py]); continue;
    }
    const col = m.kind === 'player' && m.dead && it.n === 1 ? '#8a8f99' : m.color;
    if (m.kind === 'player' && it.hd != null && it.n === 1) { // which way they face
      const c = Math.cos(it.hd), sn = Math.sin(it.hd); g.beginPath(); g.moveTo(x + c * (r + 6 * s), y + sn * (r + 6 * s)); g.lineTo(x + c * r * 0.7 - sn * r * 0.62, y + sn * r * 0.7 + c * r * 0.62); g.lineTo(x + c * r * 0.7 + sn * r * 0.62, y + sn * r * 0.7 - c * r * 0.62); g.closePath();
      g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = 1.4 * s; g.fill(); g.stroke();
    }
    g.beginPath();
    if (m.kind === 'player' && m.car && it.n === 1) g.roundRect(x - r, y - r, r * 2, r * 2, r * 0.45); else g.arc(x, y, r, 0, TAU);
    g.fillStyle = col; g.fill();
    if (m.kind === 'player') { g.strokeStyle = '#fff'; g.lineWidth = 2.2 * s; g.stroke(); g.beginPath(); if (m.car && it.n === 1) g.roundRect(x - r - 1.6 * s, y - r - 1.6 * s, r * 2 + 3.2 * s, r * 2 + 3.2 * s, r * 0.55); else g.arc(x, y, r + 1.6 * s, 0, TAU); }
    g.strokeStyle = INK; g.lineWidth = 1.5 * s; g.stroke();
    const gc = lum(col) > 0.5 ? '#0e1013' : '#fff';
    if (m.kind === 'player') glyph(g, it.n > 1 ? String(it.n) : m.dead ? 'dead' : (m.label || '?').trim().charAt(0).toUpperCase(), x, y, r, gc);
    else { glyph(g, m.glyph || '', x, y, r, gc); if (it.n > 1) badge(g, x, y, r, it.n, s); }
    const box = [x - r - 2 * s, y - r - 2 * s, x + r + 2 * s, y + r + 2 * s]; drawn.push({ it, box }); busy.push(box);
  }
  if (o.labels === 'none') return drawn;
  // labels, most important first; each tries the spots around its marker and is dropped if all of them are taken
  const fs = (o.font || 13) * s; g.font = `600 ${fs}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
  const clip = o.clip, out = b => clip && (b[0] < clip[0] || b[1] < clip[1] || b[2] > clip[2] || b[3] > clip[3]) || o.inside && !o.inside(b);
  const hits = (b) => { if (out(b)) return true; for (const q of busy) if (b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]) return true; return false; };
  for (let i = drawn.length - 1; i >= 0; i--) {
    const d = drawn[i], it = d.it, m = it.m; if (m.kind === 'dot') continue;
    if (o.labels === 'players' && m.kind !== 'player') continue;
    let text = it.n > 1 ? (m.kind === 'player' ? it.members.slice(0, 3).map(q => q.label).join(', ') + (it.n > 3 ? ` +${it.n - 3}` : '') : `${it.n} ${m.plural || 'places'}`) : m.label;
    if (!text) continue;
    if (o.short) text = text.length > o.short ? text.slice(0, o.short - 1) + '…' : text;
    if (it.edge && o.from && it.n === 1 && !m.nodist) text += ' · ' + fmtDist(Math.hypot(m.x - o.from.x, m.z - o.from.z));
    if (m.kind === 'player' && m.dead && it.n === 1) text += ' (down)';
    const w = g.measureText(text).width + 12 * s, h = fs + 7 * s, [b0, b1, b2, b3] = d.box, cx = (b0 + b2) / 2, cy = (b1 + b3) / 2, gap = 3 * s;
    const cand = it.edge && o.inward ? [[cx - Math.cos(it.ang) * ((b2 - b0) / 2 + w / 2 + gap) , cy - Math.sin(it.ang) * ((b3 - b1) / 2 + h / 2 + gap)]] : [];
    cand.push([cx, b1 - gap - h / 2], [b2 + gap + w / 2, cy], [b0 - gap - w / 2, cy], [cx, b3 + gap + h / 2],
      [b2 + gap + w / 2, b1 - h / 2], [b0 - gap - w / 2, b1 - h / 2], [b2 + gap + w / 2, b3 + h / 2], [b0 - gap - w / 2, b3 + h / 2], [cx, b1 - gap * 2 - h * 1.5]);
    let at = null, least = null, lo = Infinity;
    for (const [lx, ly] of cand) {
      const b = [lx - w / 2, ly - h / 2, lx + w / 2, ly + h / 2]; if (!hits(b)) { at = b; break; }
      if (m.pri <= 1) { let ov = out(b) ? 1e9 : 0; for (const q of busy) ov += Math.max(0, Math.min(b[2], q[2]) - Math.max(b[0], q[0])) * Math.max(0, Math.min(b[3], q[3]) - Math.max(b[1], q[1])); if (ov < lo) { lo = ov; least = b; } }
    }
    if (!at) { if (m.pri > 1) continue; at = least; } // other players always get theirs: the least crowded spot
    busy.push(at);
    const player = m.kind === 'player';
    g.fillStyle = player ? (m.dead && it.n === 1 ? '#8a8f99' : m.color) : 'rgba(12,15,20,.86)';
    g.beginPath(); g.roundRect(at[0], at[1], at[2] - at[0], at[3] - at[1], h / 2); g.fill();
    if (player) { g.strokeStyle = INK; g.lineWidth = 1.2 * s; g.stroke(); }
    else if (m.pri <= 3) { g.fillStyle = m.color; g.fillRect(at[0] + h / 2, at[3] - 2 * s, at[2] - at[0] - h, 2 * s); }
    g.fillStyle = player ? (lum(m.color) > 0.5 ? '#0e1013' : '#fff') : PAPER;
    g.font = `${player ? 700 : 600} ${fs}px ${FONT}`; g.fillText(text, (at[0] + at[2]) / 2, (at[1] + at[3]) / 2 + 0.5 * s);
  }
  return drawn;
}
// the marker under (x, y), if any (boxes from drawItems)
export function hitItem(drawn, x, y) {
  let best = null, bp = 99; for (const d of drawn) { const b = d.box; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && d.it.m.pri < bp) { bp = d.it.m.pri; best = d.it; } }
  return best;
}
