// Carmel Mountain Plaza and the AMC: storefronts on the plaza's real buildings (OSM footprints), named after the shops
// OpenStreetMap puts there. Each store gets a glass front, a double door, an awning and a sign that lights up at night.
// No interiors: the doors are props you can knock on. Everything is merged into a handful of meshes (one draw call per
// material), and a building that collapses takes its storefronts with it.
//   const PLAZA = buildPlaza({ THREE, scene, BLD, POIS, heightAt, addInteract, notify, sfx })
//   PLAZA.update(focus, night)   PLAZA.onCollapse(B)   PLAZA.center / PLAZA.R / PLAZA.stores
import { parodyName } from './plazas/brands.js';
export const PLAZA_CENTER = { x: -4300, z: -2350 }, PLAZA_R = 560;
const AMC_AT = { x: -4110, z: -2763 }; // the tall 6,600 m2 box at the south end of the plaza
const SHOP_TYPES = new Set(['shop', 'fast_food', 'restaurant', 'cafe', 'bank']);
const PALETTE = { shop: ['#c8102e', '#0057b8', '#1f7a3a', '#5b2c83', '#e35205', '#00787a', '#232f3e'], fast_food: ['#d62300', '#ffb81c', '#00704a', '#e4002b'], restaurant: ['#7a1f2b', '#2e4a3a', '#8a5a2b', '#1b365d'], cafe: ['#00704a', '#5c3a21', '#7a4b2a'], bank: ['#003b70', '#0a4c8a'] };
const MOVIES = ['NIGHT SHIFT ON MIDLAND', 'TITANS RISING', 'LAKE POWAY 3', 'THE LAST TROLLEY', 'IRON MOUNTAIN', 'GRADE 67', 'POTATO CHIP ROCK', 'SUMMER AT THE SPORTSPARK'];

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function pip(x, z, f) { let ins = false; const n = f.length / 2; for (let i = 0, j = n - 1; i < n; j = i++) { const xi = f[i * 2], zi = f[i * 2 + 1], xj = f[j * 2], zj = f[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; }
function area(f) { let s = 0; const n = f.length / 2; for (let i = 0, j = n - 1; i < n; j = i++) s += (f[j * 2] + f[i * 2]) * (f[j * 2 + 1] - f[i * 2 + 1]); return Math.abs(s) / 2; }
// the wall edges of a footprint with outward normals
function walls(B) {
  const f = B.flat, n = f.length / 2, out = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = f[i * 2], az = f[i * 2 + 1], bx = f[j * 2], bz = f[j * 2 + 1], L = Math.hypot(bx - ax, bz - az); if (L < 5) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L; let nx = uz, nz = -ux;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (pip(mx + nx * 0.5, mz + nz * 0.5, f)) { nx = -nx; nz = -nz; }
    out.push({ ax, az, bx, bz, L, ux, uz, nx, nz, used: [] });
  }
  return out;
}
// nearest wall to a point, and where along it
function nearestWall(W, x, z) {
  let best = null, bd = 1e9;
  for (const w of W) { const t = Math.max(0, Math.min(w.L, (x - w.ax) * w.ux + (z - w.az) * w.uz)), px = w.ax + w.ux * t, pz = w.az + w.uz * t, d = Math.hypot(x - px, z - pz); if (d < bd) { bd = d; best = { w, t, d }; } }
  return best;
}
function place(w, t, width) { // slide a storefront along its wall until it doesn't overlap a neighbour
  const half = width / 2 + 0.6; let c = Math.max(half, Math.min(w.L - half, t));
  for (let k = 0; k < 12; k++) { const hit = w.used.find(([a, b]) => c + half > a && c - half < b); if (!hit) break; c = c < (hit[0] + hit[1]) / 2 ? hit[0] - half : hit[1] + half; if (c < half || c > w.L - half) return null; }
  w.used.push([c - half, c + half]); return c;
}

export function buildPlaza(o) {
  const { THREE, scene, BLD, POIS, heightAt } = o;
  const C = PLAZA_CENTER, inR = (x, z, r = PLAZA_R) => Math.hypot(x - C.x, z - C.z) < r;
  const blds = BLD.filter(B => inR(B.cx, B.cz) && area(B.flat) > 350 && B.top - B.base < 16);
  const pois = POIS.filter(p => SHOP_TYPES.has(p.type) && inR(p.x, p.z, PLAZA_R + 40));
  const wallsOf = new Map(blds.map(B => [B, walls(B)]));

  // ---- the sign atlas: 4 x 16 slots of 512 x 128
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 2048; const g = cv.getContext('2d');
  let slot = 0; const SW = 512, SH = 128;
  function sign(text, bg, fg = '#fff', sub = '') {
    if (slot >= 64) return null; const sx = (slot % 4) * SW, sy = Math.floor(slot / 4) * SH; slot++;
    g.fillStyle = bg; g.fillRect(sx, sy, SW, SH);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(sx, sy, SW, 10); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(sx, sy + SH - 10, SW, 10);
    let fs = sub ? 64 : 76; g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", Arial`; while (g.measureText(text).width > SW - 40 && fs > 26) { fs -= 4; g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", Arial`; }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, sx + SW / 2, sy + (sub ? SH * 0.4 : SH / 2) + 2);
    if (sub) { g.font = `700 26px "Barlow Condensed", Arial`; g.fillStyle = fg; g.globalAlpha = 0.85; g.fillText(sub, sx + SW / 2, sy + SH * 0.78); g.globalAlpha = 1; }
    return [sx / 2048, 1 - (sy + SH) / 2048, (sx + SW) / 2048, 1 - sy / 2048];
  }
  function poster(title, i) { // a lit movie poster, 2 slots wide is too much: one slot, drawn portrait-ish inside
    if (slot >= 64) return null; const sx = (slot % 4) * SW, sy = Math.floor(slot / 4) * SH; slot++;
    const h = hash(title), c1 = `hsl(${h % 360},70%,45%)`, c2 = `hsl(${(h >> 8) % 360},60%,15%)`;
    const gr = g.createLinearGradient(sx, sy, sx + SW, sy + SH); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(sx, sy, SW, SH);
    g.fillStyle = 'rgba(255,255,255,.08)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(sx + ((h >> k) % SW), sy + ((h >> (k + 3)) % SH), 20 + k * 6, 0, 6.3); g.fill(); }
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; let fs = 44; g.font = `400 ${fs}px Anton, Impact, sans-serif`; while (g.measureText(title).width > SW - 30 && fs > 20) { fs -= 3; g.font = `400 ${fs}px Anton, Impact, sans-serif`; }
    g.fillText(title, sx + SW / 2, sy + SH * 0.45); g.font = '700 20px "Barlow Condensed", Arial'; g.globalAlpha = 0.7; g.fillText('NOW SHOWING', sx + SW / 2, sy + SH * 0.8); g.globalAlpha = 1;
    return [sx / 2048, 1 - (sy + SH) / 2048, (sx + SW) / 2048, 1 - sy / 2048];
  }

  // ---- merged geometry, one buffer per material; each building remembers its ranges (for collapse)
  const bufs = { glass: [], frame: [], awning: [], sign: [], light: [] }, ranges = new Map();
  const col = new THREE.Color();
  function quad(buf, p0, p1, p2, p3, n, uv, c) { // two triangles; uv [u0,v0,u1,v1]; c colour (awning) or null
    const U = uv || [0, 0, 1, 1], cc = c || [1, 1, 1];
    const vs = [[p0, U[0], U[1]], [p1, U[2], U[1]], [p2, U[2], U[3]], [p0, U[0], U[1]], [p2, U[2], U[3]], [p3, U[0], U[3]]];
    for (const [p, u, v] of vs) buf.push(p[0], p[1], p[2], n[0], n[1], n[2], u, v, cc[0], cc[1], cc[2]);
  }
  // a box in wall space: centre (along u at t, out along n at d, up at y), size (w along u, h, depth along n)
  function box(buf, w, t, d, y, bw, bh, bd, c) {
    const P = (a, b, e) => [w.ax + w.ux * a + w.nx * b, e, w.az + w.uz * a + w.nz * b];
    const a0 = t - bw / 2, a1 = t + bw / 2, b0 = d - bd / 2, b1 = d + bd / 2, y0 = y - bh / 2, y1 = y + bh / 2;
    const N = [w.nx, 0, w.nz], S = [-w.nx, 0, -w.nz], E = [w.ux, 0, w.uz], Wv = [-w.ux, 0, -w.uz];
    quad(buf, P(a0, b1, y0), P(a1, b1, y0), P(a1, b1, y1), P(a0, b1, y1), N, null, c); // front
    quad(buf, P(a1, b0, y0), P(a0, b0, y0), P(a0, b0, y1), P(a1, b0, y1), S, null, c);
    quad(buf, P(a0, b0, y1), P(a0, b1, y1), P(a1, b1, y1), P(a1, b0, y1), [0, 1, 0], null, c); // top
    quad(buf, P(a0, b1, y0), P(a0, b0, y0), P(a1, b0, y0), P(a1, b1, y0), [0, -1, 0], null, c);
    quad(buf, P(a1, b1, y0), P(a1, b0, y0), P(a1, b0, y1), P(a1, b1, y1), E, null, c);
    quad(buf, P(a0, b0, y0), P(a0, b1, y0), P(a0, b1, y1), P(a0, b0, y1), Wv, null, c);
  }
  function panel(buf, w, t, d, y, pw, ph, uv, c) { const P = (a, e) => [w.ax + w.ux * a + w.nx * d, e, w.az + w.uz * a + w.nz * d]; quad(buf, P(t - pw / 2, y - ph / 2), P(t + pw / 2, y - ph / 2), P(t + pw / 2, y + ph / 2), P(t - pw / 2, y + ph / 2), [w.nx, 0, w.nz], uv, c); }
  function under(buf, w, t, d0, d1, y, pw) { const P = (a, b) => [w.ax + w.ux * a + w.nx * b, y, w.az + w.uz * a + w.nz * b]; quad(buf, P(t - pw / 2, d1), P(t + pw / 2, d1), P(t + pw / 2, d0), P(t - pw / 2, d0), [0, -1, 0], null); }
  // each storefront records [start, end) per buffer; a building can have several, so they're lists
  const mark = () => { const m = {}; for (const k in bufs) m[k] = bufs[k].length / 11; return m; };
  const close = (B, m) => { const r = ranges.get(B) || {}; for (const k in bufs) (r[k] || (r[k] = [])).push([m[k], bufs[k].length / 11]); ranges.set(B, r); };

  const stores = [], doors = [];
  function storefront(B, w, t, name, type, opts = {}) {
    const width = opts.width || (type === 'shop' ? 9 : 7), H = B.top - B.base, base = B.base;
    const c = place(w, t, width); if (c === null) return null;
    const r = mark();
    const gh = Math.max(2.4, Math.min(3.2, H - 1.7)), sb = gh + 0.5, signH = Math.min(1.05, H - 0.08 - sb), signY = sb + signH / 2;
    const pal = PALETTE[type] || PALETTE.shop, bg = opts.bg || pal[hash(name) % pal.length];
    panel(bufs.glass, w, c, 0.07, base + gh / 2 + 0.05, width - 0.6, gh, null);                              // the glass front
    for (const k of [-1, 0, 1]) box(bufs.frame, w, c + k * (width - 0.6) / 2, 0.12, base + gh / 2 + 0.05, 0.14, gh, 0.12);   // mullions
    box(bufs.frame, w, c, 0.12, base + gh + 0.1, width - 0.4, 0.16, 0.14); box(bufs.frame, w, c, 0.12, base + 0.08, width - 0.4, 0.16, 0.14);
    const dw = 2.2, dh = Math.min(2.4, gh - 0.2); // the double door: darker glass, a frame and two push bars
    panel(bufs.frame, w, c, 0.09, base + dh / 2, dw + 0.2, dh + 0.12, null, [0.42, 0.44, 0.47]);
    panel(bufs.glass, w, c, 0.11, base + dh / 2, dw - 0.1, dh - 0.1, null);
    box(bufs.frame, w, c - 0.5, 0.2, base + 1.05, 0.7, 0.05, 0.06); box(bufs.frame, w, c + 0.5, 0.2, base + 1.05, 0.7, 0.05, 0.06);
    box(bufs.frame, w, c, 0.14, base + dh / 2, 0.06, dh, 0.08);
    col.set(bg); const cc = [col.r, col.g, col.b];
    if (!opts.noAwning) { box(bufs.awning, w, c, 0.75, base + gh + 0.32, width + 0.4, 0.22, 1.5, cc); box(bufs.awning, w, c, 1.48, base + gh + 0.15, width + 0.4, 0.34, 0.06, cc.map(v => v * 0.8)); }
    const uv = sign(opts.sign || name.toUpperCase(), bg, '#fff', opts.sub || ''); if (uv && signH > 0.4) panel(bufs.sign, w, c, 0.16, base + signY, Math.min(width * 0.82, signH * 4 * 0.98), signH, uv);
    if (!opts.noAwning) under(bufs.light, w, c, 0.25, 1.3, base + gh + 0.2, width - 0.4); // the light strip under the awning
    close(B, r);
    const dx = w.ax + w.ux * c + w.nx * 1.4, dz = w.az + w.uz * c + w.nz * 1.4;
    const s = { name, type, x: dx, z: dz, B }; stores.push(s); doors.push(s); return s;
  }

  // ---- 1. the AMC
  const amc = blds.slice().sort((a, b) => Math.hypot(a.cx - AMC_AT.x, a.cz - AMC_AT.z) - Math.hypot(b.cx - AMC_AT.x, b.cz - AMC_AT.z))[0];
  if (amc && Math.hypot(amc.cx - AMC_AT.x, amc.cz - AMC_AT.z) < 60) {
    const W = wallsOf.get(amc).filter(w => w.L > 22); // the long wall facing the parking field (toward the plaza centre)
    W.sort((a, b) => ((C.x - (b.ax + b.bx) / 2) * b.nx + (C.z - (b.az + b.bz) / 2) * b.nz) / Math.hypot(C.x - (b.ax + b.bx) / 2, C.z - (b.az + b.bz) / 2) - ((C.x - (a.ax + a.bx) / 2) * a.nx + (C.z - (a.az + a.bz) / 2) * a.nz) / Math.hypot(C.x - (a.ax + a.bx) / 2, C.z - (a.az + a.bz) / 2));
    const w = W[0];
    if (w) {
      const H = amc.top - amc.base, base = amc.base, mid = w.L / 2, r = mark();
      w.used.push([mid - 11, mid + 11]);
      panel(bufs.glass, w, mid, 0.07, base + 2.3, 16, 4.4, null);
      for (let k = -4; k <= 4; k++) box(bufs.frame, w, mid + k * 2, 0.12, base + 2.3, 0.16, 4.4, 0.14);
      box(bufs.frame, w, mid, 0.12, base + 4.55, 16.4, 0.2, 0.16);
      col.set('#1a1a1a'); box(bufs.awning, w, mid, 2.2, base + 5.1, 20, 0.5, 4.4, [0.08, 0.08, 0.09]); // the entrance canopy
      for (const k of [-9, 9]) box(bufs.frame, w, mid + k, 4.1, base + 2.4, 0.3, 4.8, 0.3); // its posts
      panel(bufs.light, w, mid, 4.42, base + 5.1, 19.6, 0.36, null); under(bufs.light, w, mid, 0.6, 4, base + 4.84, 18); // lit canopy edge and underside
      const big = sign('AMC', '#c8102e', '#fff'), sub = sign('CARMEL MOUNTAIN 12', '#111418', '#fff', 'TICKETS · IMAX · DOLBY');
      if (big) panel(bufs.sign, w, mid, 0.18, base + Math.min(H - 1.2, 8.4), 8, 2, big);
      if (sub) panel(bufs.sign, w, mid, 0.18, base + 6.15, 6, 1.5, sub);
      MOVIES.forEach((m, i) => { const uv = poster(m, i), t = mid + (i < 4 ? -13 - i * 3.1 : 13 + (i - 4) * 3.1); if (!uv || t < 2 || t > w.L - 2) return; box(bufs.frame, w, t, 0.1, base + 2.2, 2.6, 1.0, 0.12); panel(bufs.sign, w, t, 0.17, base + 2.2, 2.4, 0.8, uv); });
      close(amc, r);
      const s = { name: 'AMC Carmel Mountain 12', type: 'cinema', x: w.ax + w.ux * mid + w.nx * 3, z: w.az + w.uz * mid + w.nz * 3, B: amc }; stores.push(s); doors.push(s);
    }
  }
  // ---- 2. every named shop, on the wall of its building nearest to where OSM put it
  for (const p of pois) {
    let best = null, bd = 32;
    for (const B of blds) { if (B === amc) continue; const nw = nearestWall(wallsOf.get(B), p.x, p.z); if (!nw) continue; const d = pip(p.x, p.z, B.flat) ? 0 : nw.d; if (d < bd) { bd = d; best = { B, nw }; } }
    if (best) storefront(best.B, best.nw.w, best.nw.t, parodyName(p.name), p.type); // chains as their parodies (./plazas/brands.js)
  }
  // ---- 3. buildings with no shop on the map still get a door and a "for lease" sign, so the plaza reads as shops
  for (const B of blds) {
    if (ranges.has(B) || B === amc) continue;
    const W = wallsOf.get(B).filter(w => w.L > 10).sort((a, b) => b.L - a.L); const w = W[0]; if (!w) continue;
    storefront(B, w, w.L / 2, 'For Lease', 'shop', { bg: '#3a3f47', sign: 'FOR LEASE', sub: 'RETAIL · 2,400 SQ FT', noAwning: true });
  }

  // ---- meshes
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mats = {
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2a35, roughness: 0.08, metalness: 0.7, emissive: 0xffd9a0, emissiveIntensity: 0 }),
    frame: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.8, vertexColors: true }),
    awning: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: true }),
    sign: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff1d0 }),
  };
  const group = new THREE.Group(), meshes = {};
  for (const k in bufs) {
    const a = bufs[k]; if (!a.length) continue; const n = a.length / 11, P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2), CO = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const o = i * 11; P.set(a.slice(o, o + 3), i * 3); N.set(a.slice(o + 3, o + 6), i * 3); UV.set(a.slice(o + 6, o + 8), i * 2); CO.set(a.slice(o + 8, o + 11), i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); geo.setAttribute('color', new THREE.BufferAttribute(CO, 3));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mats[k]); m.receiveShadow = true; m.castShadow = k === 'awning'; group.add(m); meshes[k] = m;
  }
  scene.add(group);

  // ---- doors you can knock on
  const isOpen = (s, hour) => s.type === 'cinema' ? hour >= 10 || hour < 0.5 : s.type === 'bank' ? hour >= 9 && hour < 17 : s.type === 'fast_food' ? hour >= 6 && hour < 23 : hour >= 9 && hour < 21;
  if (o.addInteract) for (const s of doors) o.addInteract({ x: s.x, z: s.z, r: s.type === 'cinema' ? 5 : 2.6, when: () => !s.B.dead && !(o.inCar && o.inCar()),
    label: () => s.name === 'For Lease' ? 'Vacant storefront' : `<b>${s.name}</b> · ${isOpen(s, o.hour()) ? 'open' : 'closed'}`,
    onUse: () => { if (o.sfx) o.sfx.punch(0.25); const open = isOpen(s, o.hour());
      o.notify(s.name === 'For Lease' ? 'Nobody\'s home. The sign says to call a leasing agent.' : s.type === 'cinema' ? (open ? 'Every showing is sold out tonight. Try the late show.' : 'The AMC is closed. The last show let out a while ago.') : open ? `${s.name}: "Sorry, we're doing inventory. Come back in a bit."` : `${s.name} is closed. Hours are on the door.`, '', 2600); } });

  return {
    center: C, R: PLAZA_R, stores, group,
    update(f, night) {
      group.visible = Math.hypot(f.x - C.x, f.z - C.z) < 1500;
      mats.sign.emissiveIntensity = 0.12 + night * 1.1; mats.glass.emissiveIntensity = night * 0.35; mats.light.color.setScalar(0.55 + night * 0.45);
    },
    onCollapse(B) { // its storefronts go with it (kept aside, so they come back when the building is rebuilt)
      const r = ranges.get(B); if (!r || r.saved) return; r.saved = {};
      for (const k in r) { if (k === 'saved') continue; const m = meshes[k]; if (!m) continue; const pos = m.geometry.attributes.position; r.saved[k] = r[k].map(([a, e]) => pos.array.slice(a * 3, e * 3)); for (const [a, e] of r[k]) { for (let i = a; i < e; i++) pos.setXYZ(i, 0, -1000, 0); if (pos.addUpdateRange) pos.addUpdateRange(a * 3, (e - a) * 3); } pos.needsUpdate = true; }
    },
    onRepair(B) {
      const r = ranges.get(B); if (!r || !r.saved) return;
      for (const k in r.saved) { const m = meshes[k]; if (!m) continue; const pos = m.geometry.attributes.position; r[k].forEach(([a, e], j) => { pos.array.set(r.saved[k][j], a * 3); if (pos.addUpdateRange) pos.addUpdateRange(a * 3, (e - a) * 3); }); pos.needsUpdate = true; }
      r.saved = null;
    },
  };
}
