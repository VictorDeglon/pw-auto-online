// Surf: the boards and the places that rent and sell them.
//  - surfboardGeometry(kind): a real board, lofted: the outline (a pulled-in pin or squash tail, the widest point a
//    little forward of centre, a pointed or round nose), a domed deck and soft rails over a flatter bottom, nose and
//    tail rocker, a thruster fin set under the tail (a single fin on the longboard). Lies along +z (nose), deck up,
//    tail at z = 0. Vertex colours carry the board's pattern (a band and coloured rails), multiplied by its colour.
//      short 6'0"  fish 5'8"  long 9'0"  soft 8'0" (the foam rental boards)
//  - surfShack(): a beach rental stand: a plank hut, a striped awning, the counter, its sign, an A-frame rack of soft
//    tops, wetsuits on a rail, a feather flag
//  - roofBoards(car): a roof rack and a board or two strapped on it
//   import { surfboardGeometry, surfShack, roofBoards, boardMaterial } from './surf.js'

export function surfboardGeometry(THREE, kind = 'short') {
  const P = { short: [1.85, 0.255, 0.062, 0.17, 0.11, 0.035, 3], fish: [1.73, 0.27, 0.065, 0.24, 0.07, 0.03, 2], long: [2.75, 0.29, 0.075, 0.2, 0.14, 0.03, 1], soft: [2.44, 0.3, 0.085, 0.24, 0.09, 0.03, 3] }[kind] || [1.85, 0.255, 0.062, 0.17, 0.11, 0.035, 3];
  const [L, Wm, T, tailW, noseR, tailR, fins] = P, NS = 28, NA = 14, pos = [], col = [], idx = [];
  const width = t => { const w = t < 0.55 ? tailW / 2 + (Wm - tailW / 2) * Math.sin(Math.min(1, t / 0.55) * Math.PI / 2) : Wm * Math.pow(Math.cos((t - 0.55) / 0.45 * Math.PI / 2), kind === 'long' || kind === 'soft' ? 0.5 : 0.8); return Math.max(0.012, w); };
  const thick = t => T * Math.pow(Math.max(0.02, Math.sin(Math.PI * Math.min(0.98, Math.max(0.02, t)))), 0.55);
  const rock = t => t > 0.6 ? noseR * ((t - 0.6) / 0.4) ** 2 : t < 0.3 ? tailR * ((0.3 - t) / 0.3) ** 2 : 0;
  for (let s = 0; s <= NS; s++) {
    const t = s / NS, w = width(t), h = thick(t), y0 = rock(t), band = kind === 'soft' ? 1 : (t > 0.42 && t < 0.47 ? 0.55 : 1);
    for (let a = 0; a < NA; a++) {
      const th = a / NA * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      const x = w * Math.sign(c) * Math.pow(Math.abs(c), 0.45), y = y0 + h * 0.5 * (sn > 0 ? Math.pow(sn, 0.9) : -Math.pow(-sn, 1.6) * 0.7); // a domed deck, a flatter bottom
      pos.push(x, y, t * L); const rail = Math.abs(c) > 0.85 ? (kind === 'soft' ? 0.85 : 0.9) : 1; col.push(band * rail, band * rail, band * rail);
    }
  }
  for (let s = 0; s < NS; s++) for (let a = 0; a < NA; a++) { const i0 = s * NA + a, i1 = s * NA + (a + 1) % NA, j0 = i0 + NA, j1 = i1 + NA; idx.push(i0, j0, i1, i1, j0, j1); }
  // caps at the nose and tail
  const capT = pos.length / 3; pos.push(0, rock(0), 0); col.push(1, 1, 1); for (let a = 0; a < NA; a++) idx.push(capT, a, (a + 1) % NA);
  const capN = pos.length / 3, last = NS * NA; pos.push(0, rock(1), L); col.push(1, 1, 1); for (let a = 0; a < NA; a++) idx.push(capN, last + (a + 1) % NA, last + a);
  // fins: thin swept triangles under the tail
  const fin = (x, z, h, len, toe) => { const b = pos.length / 3, y = rock(z / L) - thick(z / L) * 0.35; pos.push(x - 0.004, y, z, x + toe, y - h, z - len * 0.55, x - 0.004, y, z - len, x + 0.004, y, z, x + toe + 0.004, y - h, z - len * 0.55, x + 0.004, y, z - len); for (let k = 0; k < 6; k++) col.push(0.35, 0.37, 0.4);
    idx.push(b, b + 1, b + 2, b + 3, b + 5, b + 4); };
  if (fins === 1) fin(0, 0.32, 0.2, 0.2, 0); else { fin(0, 0.12, 0.11, 0.11, 0); if (fins >= 2) for (const s of [-1, 1]) fin(s * (fins === 2 ? 0.1 : 0.12), fins === 2 ? 0.2 : 0.3, 0.115, 0.11, s * 0.004); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
let BOARD_MAT = null;
export function boardMaterial(THREE) { return BOARD_MAT || (BOARD_MAT = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide })); }
export const BOARD_COLORS = [0xf6f6f2, 0xf6f6f2, 0xf3e2b8, 0x5ec6e8, 0xf2c94c, 0xef6b5b, 0x7fd1ae, 0x2c3e66, 0xf28fb0, 0xffffff];

function signTex(THREE, lines, bg, fg, w = 512, h = 160) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([t, size, font], i) => { g.font = `${font || '900'} ${size}px "Arial Black", Impact, sans-serif`; g.fillText(t, w / 2, h * (i + 0.5) / lines.length); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const SHACK_NAMES = [['SWELL SHACK', 'SURF RENTALS · LESSONS'], ['LOW TIDE SURF', 'BOARDS · WETSUITS · BOOGIES'], ['PACIFIC DRIFT', 'SURF RENTALS'], ['SALT & WAX', 'RENTALS · DING REPAIR']];
// a rental stand on the sand: x across the front (the counter faces +z, toward the water)
export function surfShack(THREE, i = 0) {
  const g = new THREE.Group(), M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const plank = M(0x9c7a55), trim = M(0xf2efe6), dark = M(0x222428), canvasA = M([0x1f7fb5, 0xd94c3a, 0x2c9a6a, 0xe0a92e][i % 4], { side: THREE.DoubleSide }), canvasB = M(0xf5f3ec, { side: THREE.DoubleSide });
  add(new THREE.BoxGeometry(3.2, 0.12, 2.6), M(0x8a6e52), 0, 0.06, 0);                          // the deck on the sand
  for (const [x, z, w, d] of [[0, -1.2, 3.2, 0.1], [-1.55, 0, 0.1, 2.5], [1.55, 0, 0.1, 2.5]]) add(new THREE.BoxGeometry(w, 2.4, d), plank, x, 1.32, z); // plank walls
  for (let k = 0; k < 14; k++) add(new THREE.BoxGeometry(0.012, 2.4, 0.02), dark, -1.5 + k * 0.23, 1.32, -1.14); // board-and-batten
  add(new THREE.BoxGeometry(3.3, 1.0, 0.12), plank, 0, 0.62, 1.2); add(new THREE.BoxGeometry(3.4, 0.06, 0.45), trim, 0, 1.15, 1.25); // the counter
  add(new THREE.BoxGeometry(3.5, 0.1, 2.9), trim, 0, 2.58, 0);                                    // the roof
  for (let k = 0; k < 7; k++) add(new THREE.BoxGeometry(3.6 / 7, 0.03, 1.4), k % 2 ? canvasB : canvasA, -1.8 + 3.6 / 14 + k * 3.6 / 7, 2.35, 1.95, 0.32); // the awning, striped
  const [name, sub] = SHACK_NAMES[i % SHACK_NAMES.length];
  add(new THREE.PlaneGeometry(2.9, 0.62), new THREE.MeshStandardMaterial({ map: signTex(THREE, [[name, 64], [sub, 34, '700']], '#f4efe2', '#1b3550'), roughness: 0.6 }), 0, 2.95, 1.45 + 0.01);
  add(new THREE.BoxGeometry(3.0, 0.7, 0.06), trim, 0, 2.95, 1.42);
  // the rack of soft tops, the wetsuits on their rail
  const geo = surfboardGeometry(THREE, 'soft'), bm = boardMaterial(THREE), cols = [0x5ec6e8, 0xf2c94c, 0xef6b5b, 0x7fd1ae, 0xf6f6f2, 0x2c7fd1];
  add(new THREE.BoxGeometry(0.06, 1.1, 0.06), plank, 2.2, 0.55, 0.3); add(new THREE.BoxGeometry(0.06, 1.1, 0.06), plank, 4.4, 0.55, 0.3); add(new THREE.BoxGeometry(2.3, 0.06, 0.06), plank, 3.3, 1.05, 0.3);
  for (let k = 0; k < 7; k++) { const b = new THREE.Mesh(geo, bm.clone()); b.material.color.setHex(cols[k % cols.length]); b.rotation.set(-Math.PI / 2 + 0.22, Math.PI, 0, 'YXZ'); b.position.set(2.35 + k * 0.3, 0.05, 0.62); /* nose up, deck out, leaning back on the bar */ b.castShadow = true; g.add(b); }
  add(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 6), M(0xc0c0c0, { metalness: 0.8, roughness: 0.3 }), -2.6, 1.9, 0.6, 0, 0, Math.PI / 2);
  for (let k = 0; k < 5; k++) { const s = add(new THREE.CapsuleGeometry(0.17, 0.95, 4, 8), dark, -3.5 + k * 0.42, 1.2, 0.6); s.scale.set(1, 1, 0.25); }
  // the feather flag
  add(new THREE.CylinderGeometry(0.02, 0.025, 4.2, 6), M(0x999999, { metalness: 0.7 }), -2.2, 2.1, 2.4);
  const fl = new THREE.PlaneGeometry(0.75, 3.0, 1, 8), P = fl.attributes.position; for (let k = 0; k < P.count; k++) { const y = P.getY(k); P.setX(k, P.getX(k) + 0.375 + Math.sin((y + 1.5) * 0.9) * 0.08 * (P.getX(k) + 0.375)); } fl.computeVertexNormals();
  add(fl, new THREE.MeshStandardMaterial({ map: signTex(THREE, [['S', 120], ['U', 120], ['R', 120], ['F', 120]], '#d94c3a', '#ffffff', 128, 512), side: THREE.DoubleSide, roughness: 0.8 }), -2.2, 2.6, 2.4);
  return g;
}
// a roof rack with a board or two strapped down, for a car whose roof is at y = H (its length L, width W)
export function roofBoards(THREE, car, rnd = Math.random) {
  const g = new THREE.Group(), y = car.H + 0.04, black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 });
  for (const z of [-car.L * 0.12, car.L * 0.16]) { const b = new THREE.Mesh(new THREE.BoxGeometry(car.W * 0.82, 0.05, 0.07), black); b.position.set(0, y, z); g.add(b); for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.1), black); f.position.set(s * car.W * 0.4, y - 0.04, z); g.add(f); } }
  const n = rnd() < 0.4 ? 2 : 1, long = rnd() < 0.35;
  for (let k = 0; k < n; k++) {
    const geo = surfboardGeometry(THREE, long ? 'long' : k ? 'fish' : 'short'), bL = long ? 2.75 : 1.8, m = boardMaterial(THREE).clone(); m.color.setHex(BOARD_COLORS[Math.floor(rnd() * BOARD_COLORS.length)]);
    const b = new THREE.Mesh(geo, m); b.rotation.z = Math.PI; b.position.set((n === 2 ? (k ? 0.3 : -0.3) : 0), y + 0.07 + k * 0.02, -bL / 2 + car.L * 0.02); b.castShadow = true; g.add(b); // deck down, fins up, nose forward
  }
  for (const z of [-car.L * 0.12, car.L * 0.16]) { const st = new THREE.Mesh(new THREE.BoxGeometry(car.W * 0.84, 0.012, 0.035), new THREE.MeshStandardMaterial({ color: 0x2c4f8a, roughness: 0.7 })); st.position.set(0, y + 0.16, z); g.add(st); } // the straps
  return g;
}
