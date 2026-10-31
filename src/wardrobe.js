// The wardrobe: what you wear over your person (a Rocketbox avatar, src/humans.js), what you've unlocked, and the code
// that carries your look to other players.
//  - Your look travels inside the skin string everyone already shares: "Male_Adult_18~a2104…" (the server and the
//    database rules cap it at 40 characters; the longest avatar name is 22). splitSkin() takes it apart.
//  - Accessories are built here in code (hats, glasses, chains, bags) and pinned to the skeleton: each avatar's head
//    top, eye line, neck and back are measured once from its own mesh, so a cap sits on that head and moves with it.
//  - Height and build scale the body a few percent either way.
//  - Unlocks: some things cost money (save.money), some come with an achievement or a career level (online), and the
//    people in uniform come with the work they stand for. What you own is in save.wardrobe.owned, which the cloud
//    save carries to your other computers (src/online/cloud.js).
//   splitSkin(s) -> { avatar, look }   decodeLook(code) / encodeLook(L)   dress(THREE, rig, protoRoot, code)
//   ITEMS, SLOTS, PALETTES, lockOf(item | avatarEntry, C) -> null | { price } | { need: 'text' }
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const VERSION = 'a';
export const SLOTS = [['hat', 'Hats'], ['glasses', 'Glasses'], ['neck', 'Neck'], ['back', 'Back']];
export const PALETTES = {
  fabric: [['Navy', '#1f2a44'], ['Red', '#b8372f'], ['Charcoal', '#2f2f33'], ['Bone', '#e5e0d2'], ['Blue', '#3a6ea5'], ['Olive', '#5f7a3e'], ['Mustard', '#d9a441'], ['Plum', '#6d4479'], ['Coral', '#e07a5f'], ['Teal', '#1d6f7a'], ['Dusty rose', '#b5838d'], ['White', '#f2f2ee']],
  felt: [['Tan', '#c9a46b'], ['Saddle', '#8c6a3c'], ['Chocolate', '#4b3020'], ['Black', '#1c1a18'], ['Cream', '#e8dcc0'], ['Grey', '#7d7a74'], ['Sand', '#b9a789'], ['Rust', '#8f4a2a']],
  metal: [['Gold', '#d4af37'], ['Silver', '#c4c6cc'], ['Rose gold', '#c28a7c'], ['Gunmetal', '#3a3c40']],
  lens: [['Black', '#141618'], ['Blue mirror', '#2f6fb0'], ['Gold mirror', '#c99a2e'], ['Green', '#2f4a36'], ['Brown', '#5a3b22'], ['Red mirror', '#b4382c']],
  safety: [['Yellow', '#f2c230'], ['White', '#efefe9'], ['Orange', '#e8702a'], ['Blue', '#2c5fa8']],
  bright: [['Hibiscus', '#e04a6a'], ['Plumeria', '#f6e7c8'], ['Orchid', '#9a5fc0'], ['Sunflower', '#f2c230']],
};
// unlocks: price (dollars), ach (an achievement id, src/ui/achievements.js), lvl (career level, online). None: free.
export const ITEMS = {
  hat: [
    { id: 'none', name: 'No hat' },
    { id: 'cap', name: 'Ball cap', pal: 'fabric' },
    { id: 'capback', name: 'Cap, backwards', pal: 'fabric' },
    { id: 'beanie', name: 'Beanie', pal: 'fabric', price: 300 },
    { id: 'visor', name: 'Sun visor', pal: 'fabric', price: 250 },
    { id: 'bucket', name: 'Bucket hat', pal: 'fabric', price: 400 },
    { id: 'fedora', name: 'Fedora', pal: 'felt', price: 1200 },
    { id: 'cowboy', name: 'Cowboy hat', pal: 'felt', price: 2500 },
    { id: 'hardhat', name: 'Hard hat', pal: 'safety', ach: 'urban-renewal' },
    { id: 'helmet', name: 'Open-face helmet', pal: 'fabric', ach: 'ludicrous' },
    { id: 'crown', name: 'Crown', pal: 'metal', ach: 'five-stars' },
  ],
  glasses: [
    { id: 'none', name: 'No glasses' },
    { id: 'shades', name: 'Shades', pal: 'lens' },
    { id: 'round', name: 'Round specs', pal: 'metal', price: 500 },
    { id: 'aviators', name: 'Aviators', pal: 'lens', price: 800 },
    { id: 'wrap', name: 'Sport wraps', pal: 'lens', ach: 'joyride' },
    { id: 'goldav', name: 'Gold aviators', pal: 'lens', lvl: 10 },
  ],
  neck: [
    { id: 'none', name: 'Nothing' },
    { id: 'bandana', name: 'Bandana', pal: 'fabric', price: 200 },
    { id: 'headphones', name: 'Headphones', pal: 'fabric', price: 900 },
    { id: 'chain', name: 'Chain', pal: 'metal', price: 1500 },
    { id: 'medallion', name: 'Chain and medallion', pal: 'metal', price: 5000 },
    { id: 'lei', name: 'Lei', pal: 'bright', ach: 'tourist' },
  ],
  back: [
    { id: 'none', name: 'Nothing' },
    { id: 'backpack', name: 'Backpack', pal: 'fabric', price: 600 },
    { id: 'sling', name: 'Sling bag', pal: 'fabric', price: 400 },
    { id: 'chute', name: 'Parachute pack', pal: 'fabric', ach: 'frequent-flyer' },
    { id: 'duffel', name: 'Cash duffel', pal: 'fabric', ach: 'autobiography' },
  ],
};
// the people in uniform come with the work: everyday clothes are free
export const AVATAR_UNLOCK = {
  construction: { ach: 'urban-renewal' }, fire: { ach: 'chain-reaction' }, medical: { ach: 'wasted' }, pilot: { ach: 'frequent-flyer' },
  security: { ach: 'shopper' }, delivery: { ach: 'courier' }, gardener: { ach: 'lumberjack' }, wood: { ach: 'lumberjack' }, chef: { price: 1500 },
  sports: { price: 2000 }, police: { lvl: 10 }, military: { lvl: 15 },
};
// people who already wear something on their head (a hood, a cap, a keffiyeh, a hijab, a helmet) or over their eyes
// (glasses, a mask, a visor): a hat or glasses would go through it, so they keep their own
const HEADWEAR = /^(Construction|Fire|Military|Pilot|Security)_|^(Female_Adult_(06|10|16)|Male_Adult_(15|17|18|19|21)|Police_Female_01|Police_Male_0[1-5]|Medical_Male_0[45]|Chef_Female_01|Delivery_Male_01|Wood_Male_01)$/;
const FACEWEAR = /^Fire_|^(Female_Adult_16|Business_Female_02|Construction_Male_01|Military_Male_0[34]|Police_Female_01|Police_Male_02)$/;
export function fits(avatar, slot) { return slot === 'hat' ? !HEADWEAR.test(avatar) : slot === 'glasses' ? !FACEWEAR.test(avatar) : true; }
export const HEIGHTS = [0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06], BUILDS = [0.94, 0.97, 1, 1.03, 1.06, 1.09];
export const DEFAULT = { hat: [0, 0], glasses: [0, 0], neck: [0, 0], back: [0, 0], h: 3, b: 2 };

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
export function splitSkin(s) { s = s || ''; const i = s.indexOf('~'); return i < 0 ? { avatar: s, look: '' } : { avatar: s.slice(0, i), look: s.slice(i + 1) }; }
export function decodeLook(code) {
  const L = JSON.parse(JSON.stringify(DEFAULT)); if (!code || code[0] !== VERSION) return L;
  const at = i => Math.max(0, B36.indexOf(code[i] || '0'));
  SLOTS.forEach(([k], n) => { L[k] = [Math.min(at(1 + n * 2), ITEMS[k].length - 1), at(2 + n * 2)]; });
  L.h = Math.min(at(9), HEIGHTS.length - 1); L.b = Math.min(at(10), BUILDS.length - 1);
  return L;
}
export function encodeLook(L) {
  const plain = SLOTS.every(([k]) => !L[k][0]) && L.h === DEFAULT.h && L.b === DEFAULT.b; if (plain) return '';
  return VERSION + SLOTS.map(([k]) => B36[L[k][0]] + B36[L[k][1] % 36]).join('') + B36[L.h] + B36[L.b];
}
export const joinSkin = (avatar, L) => { const c = encodeLook(L); return c ? `${avatar}~${c}` : avatar; };
export function colorOf(item, ci) { const P = PALETTES[item.pal] || PALETTES.fabric; return P[ci % P.length][1]; }

// what stands between you and a thing: null (yours), { price } (buy it), or { need } (earn it first)
// C: { owned(id) -> bool, ach(id) -> bool, level() -> number }
export function lockOf(u, id, C) {
  if (!u || C.owned(id)) return null;
  if (u.ach && C.ach(u.ach)) return null;
  if (u.lvl && C.level() >= u.lvl) return null;
  if (u.price) return { price: u.price };
  if (u.ach) return { need: 'ach', id: u.ach };
  if (u.lvl) return { need: 'lvl', lvl: u.lvl };
  return null;
}

// ---------------------------------------------------------------- where things go on a body
// Measured once per avatar, on the first of its rigs to be dressed, standing in its idle pose (the rest pose holds
// the head differently, and a cap would tilt): the top of the head (hair included), the eye line and the face's
// front, the base of the neck, the middle of the back. Points are taken in the character's own frame (its rig.g), and
// each anchor is kept relative to the bone it moves with, so it follows the animation.
const anchorCache = new WeakMap();
export function anchorsFor(THREE, key, frame, root) {
  if (anchorCache.has(key)) return anchorCache.get(key);
  frame.updateMatrixWorld(true);
  const v = new THREE.Vector3(), toFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  const meshPoints = (test, keep) => { // world points of the skinned meshes whose material passes test
    const out = [];
    root.traverse(o => {
      if (!o.isSkinnedMesh || !test(o.material && o.material.name || '')) return;
      const n = o.geometry.attributes.position.count, step = Math.max(1, Math.floor(n / 6000));
      for (let i = 0; i < n; i += step) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld).applyMatrix4(toFrame); if (!keep || keep(v)) out.push(v.clone()); }
    });
    return out;
  };
  const surface = (test, keep) => { // points over the meshes' triangles, about 1.5 cm apart: a low-poly torso has few vertices
    const out = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3();
    root.traverse(o => {
      if (!o.isSkinnedMesh || !test(o.material && o.material.name || '')) return;
      const n = o.geometry.attributes.position.count, P = new Float32Array(n * 3), ix = o.geometry.index ? o.geometry.index.array : null;
      for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld).applyMatrix4(toFrame); v.toArray(P, i * 3); }
      for (let t = 0, nt = ix ? ix.length / 3 : n / 3; t < nt; t++) {
        a.fromArray(P, (ix ? ix[t * 3] : t * 3) * 3); b.fromArray(P, (ix ? ix[t * 3 + 1] : t * 3 + 1) * 3); c.fromArray(P, (ix ? ix[t * 3 + 2] : t * 3 + 2) * 3);
        if (keep && !keep(a) && !keep(b) && !keep(c)) continue;
        const k = Math.min(10, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.015));
        for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) { q.copy(a).multiplyScalar(1 - (i + j) / k).addScaledVector(b, i / k).addScaledVector(c, j / k); if (!keep || keep(q)) out.push(q.clone()); }
      }
    });
    return out;
  };
  const bone = n => root.getObjectByName(n);
  const headB = bone('Bip01_Head'), neckB = bone('Bip01_Neck') || headB, spineB = bone('Bip01_Spine2') || bone('Bip01_Spine1') || neckB;
  const hb = headB ? headB.getWorldPosition(new THREE.Vector3()).applyMatrix4(toFrame) : null;
  // the head mesh can carry long hair down the back or over a shoulder: the middle is the head bone's, and only what's
  // above that joint counts
  let head = meshPoints(n => /_head$/i.test(n)); const mid = hb ? hb.x : head.reduce((s, p) => s + p.x, 0) / Math.max(1, head.length);
  head = head.filter(p => Math.abs(p.x - mid) < 0.13 && (!hb || p.y > hb.y));
  const box = new THREE.Box3().setFromPoints(head.length ? head : [new THREE.Vector3(0, 1.62, 0), new THREE.Vector3(0, 1.75, 0.1)]);
  const cx = hb ? hb.x : (box.min.x + box.max.x) / 2;
  // landmarks, not the bounding box (the head mesh can carry a neck, a hood's rim, long hair): the nose tip is the
  // face's front and sits 3-4 cm under the eye line; the forehead band, above the ears, gives the width a hat fits
  let nose = null; for (const p of head) if (Math.abs(p.x - cx) < 0.025 && p.y < box.max.y - 0.115 && (!hb || p.y > hb.y + 0.02) && (!nose || p.z > nose.z)) nose = p; // under a fringe
  nose = nose || new THREE.Vector3(cx, box.max.y - 0.16, box.max.z);
  const eyeY = nose.y + 0.036;
  // the lenses stand just clear of whatever is furthest forward behind them (brows, cheekbones), not of the nose
  let lens = nose.z - 0.016; for (const p of head) if (Math.abs(p.y - eyeY) < 0.022 && Math.abs(p.x - cx) > 0.012 && Math.abs(p.x - cx) < 0.06) lens = Math.max(lens, p.z);
  let w0 = 1e9, w1 = -1e9; for (const p of head) if (p.y > eyeY + 0.025 && p.y < eyeY + 0.06) { w0 = Math.min(w0, p.x); w1 = Math.max(w1, p.x); }
  const width = w1 > w0 ? w1 - w0 : 0.145;
  // hair cards (the see-through layer) can sit above the scalp: the hat goes over them
  const hair = meshPoints(n => /_opacity$/i.test(n), p => p.y > box.max.y - 0.08 && Math.abs(p.x - cx) < 0.12 && p.z > nose.z - 0.26);
  const over = p => Math.abs(p.x - cx) < 0.07 && Math.abs(p.z - nose.z + 0.1) < 0.075; // over the skull, not a bun or a ponytail behind it
  let top = -1e9; for (const p of head.concat(hair)) if (over(p)) top = Math.max(top, p.y); if (top < -1e8) top = box.max.y;
  let cz = 0, nz = 0; for (const p of head.concat(hair)) if (p.y > top - 0.05 && over(p)) { cz += p.z; nz++; } // the crown's middle
  cz = Math.max(nose.z - 0.12, Math.min(nose.z - 0.08, nz ? cz / nz : nose.z - 0.1));
  const neckP = neckB ? neckB.getWorldPosition(new THREE.Vector3()).applyMatrix4(toFrame) : new THREE.Vector3(cx, box.min.y - 0.05, cz);
  const spineP = spineB ? spineB.getWorldPosition(new THREE.Vector3()).applyMatrix4(toFrame) : new THREE.Vector3(cx, neckP.y - 0.25, cz);
  const torso = surface(n => /_body$/i.test(n), p => Math.abs(p.x - spineP.x) < 0.15 && p.y > spineP.y - 0.37 && p.y < neckP.y + 0.08);
  let back = spineP.z - 0.12; for (const p of torso) if (Math.abs(p.y - spineP.y) < 0.06 && Math.abs(p.x - spineP.x) < 0.1) back = Math.min(back, p.z);
  const rel = (b, p) => { // a point in the character's frame as a transform in bone b's space (upright, facing the way they do)
    if (!b) return null; const m = new THREE.Matrix4().copy(frame.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
    return { bone: b.name, m: new THREE.Matrix4().copy(b.matrixWorld).invert().multiply(m) };
  };
  // the torso's front and back surface, for straps over the shoulders and across the chest, a pack against the back
  // and a chain clear of a thick collar; in the back anchor's terms
  const tor = torsoMap(torso, surface(n => /_head$/i.test(n), p => Math.abs(p.x - spineP.x) < 0.15 && p.y > neckP.y - 0.06 && p.y < neckP.y + 0.06), spineP.x, spineP.y, back, neckP.y - spineP.y + 0.02);
  const A = {
    width: Math.max(0.12, Math.min(0.18, width)), torso: tor,
    neckAt: [neckP.x - spineP.x, neckP.y - 0.01 - spineP.y, neckP.z + 0.015 - back], // the neck anchor in the torso map's terms
    hat: rel(headB, new THREE.Vector3(cx, top, cz)),
    glasses: rel(headB, new THREE.Vector3(cx, eyeY, Math.min(nose.z, lens + 0.007))),
    neck: rel(neckB, new THREE.Vector3(neckP.x, neckP.y - 0.01, neckP.z + 0.015)),
    back: rel(spineB, new THREE.Vector3(spineP.x, spineP.y, back)),
  };
  anchorCache.set(key, A); return A;
}

// The torso as a coarse depth map: on a 4 cm grid across (x) and up (y) from the back anchor, how far forward the front
// is and how far back the back (z, from the anchor), and how high the shoulders come (top). Low-poly torsos leave cells
// empty: those take the nearest filled one in their column. The head mesh's neck (neck) counts for the depth, not the
// shoulders' top (long hair can be part of it).
const CELL = 0.04, NX = 7, NY = 18, X0 = -0.12, Y0 = -0.34;
function torsoMap(pts, neck, x0, y0, z0, yTop) {
  const F = new Array(NX * NY).fill(null), B = new Array(NX * NY).fill(null), top = new Array(NX).fill(null), n0 = pts.length;
  const all = pts.concat(neck); for (let k = 0; k < all.length; k++) { const p = all[k];
    const x = p.x - x0, y = p.y - y0, z = p.z - z0, i = Math.round((x - X0) / CELL), j = Math.round((y - Y0) / CELL);
    if (i < 0 || i >= NX) continue;
    if (j >= 0 && j < NY) { const k = j * NX + i; if (F[k] === null || z > F[k]) F[k] = z; if (B[k] === null || z < B[k]) B[k] = z; }
    if (k < n0 && y <= yTop && (top[i] === null || y > top[i])) top[i] = y;
  }
  for (const G of [F, B]) for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
    if (G[j * NX + i] !== null) continue;
    for (let d = 1; d < NY; d++) { const a = G[(j - d) * NX + i], b = G[(j + d) * NX + i]; const v = j - d >= 0 && a != null ? a : j + d < NY && b != null ? b : null; if (v !== null) { G[j * NX + i] = v; break; } }
    if (G[j * NX + i] === null) G[j * NX + i] = G === F ? 0.22 : 0;
  }
  for (let i = 0; i < NX; i++) if (top[i] === null) top[i] = yTop - 0.06;
  const at = (G, x, y) => {
    const u = Math.max(0, Math.min(NX - 1.001, (x - X0) / CELL)), v = Math.max(0, Math.min(NY - 1.001, (y - Y0) / CELL)), i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j;
    const g = (ii, jj) => G[jj * NX + ii]; return (g(i, j) * (1 - a) + g(i + 1, j) * a) * (1 - b) + (g(i, j + 1) * (1 - a) + g(i + 1, j + 1) * a) * b;
  };
  const tp = x => { const u = Math.max(0, Math.min(NX - 1.001, (x - X0) / CELL)), i = Math.floor(u), a = u - i; return top[i] * (1 - a) + top[i + 1] * a; };
  return { f: (x, y) => at(F, x, y), b: (x, y) => at(B, x, y), top: tp };
}
// a torso for things built on their own (a shop icon): front 22 cm ahead of the back, shoulders 20 cm up
const PLAIN_TORSO = { f: () => 0.22, b: () => 0, top: x => 0.2 - 0.6 * x * x };

// ---------------------------------------------------------------- the things themselves (metres; +y up, +z forward)
const geoCache = new Map(), matCache = new Map();
const cachedGeo = (k, f) => { if (!geoCache.has(k)) geoCache.set(k, f()); return geoCache.get(k); };
function mat(THREE, kind, hex) {
  const k = kind + hex; if (matCache.has(k)) return matCache.get(k);
  const o = { color: hex }, base = kind.replace(/2$/, ''); // 'felt2': felt, seen from both sides
  if (base === 'cloth') Object.assign(o, { roughness: 0.92, metalness: 0 });
  else if (base === 'felt') Object.assign(o, { roughness: 0.85, metalness: 0 });
  else if (base === 'plastic') Object.assign(o, { roughness: 0.35, metalness: 0 });
  else if (base === 'metal') Object.assign(o, { roughness: 0.3, metalness: 0.75 });
  else if (base === 'lens') Object.assign(o, { roughness: 0.08, metalness: 0.35 }); // tinted, and mirrored where there's a sky to mirror
  else if (base === 'clear') Object.assign(o, { roughness: 0.05, metalness: 0, transparent: true, opacity: 0.25 });
  if (kind.endsWith('2')) o.side = THREE.DoubleSide; // thin shells (brims, lenses) seen from both sides
  const m = new THREE.MeshStandardMaterial(o); m.name = 'wardrobe'; matCache.set(k, m); return m;
}
const lathe = (THREE, pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
function oval(geo, sz = 1.12) { geo.scale(1, 1, sz); return geo; } // heads are longer than they are wide
function brimShape(THREE, w, d) { const s = new THREE.Shape(); s.moveTo(-w, 0); s.quadraticCurveTo(-w * 0.9, d, 0, d * 1.05); s.quadraticCurveTo(w * 0.9, d, w, 0); s.lineTo(-w, 0); return s; }
// a peak lying flat (+z forward from its back edge), its sides curved down like a worn-in cap's
function peak(T, w, d, curve = 1) {
  const e = new T.ExtrudeGeometry(brimShape(T, w, d), { depth: 0.005, bevelEnabled: false, curveSegments: 10 }); e.rotateX(Math.PI / 2);
  const p = e.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - curve * 1.1 * p.getX(i) ** 2);
  e.computeVertexNormals(); return e;
}
const brimGeo = T => cachedGeo('cap.brim', () => peak(T, 0.088, 0.078));
const templeGeo = T => cachedGeo('glasses.temple', () => new T.BoxGeometry(0.004, 0.006, 0.11));
// a strap lying on the torso (tor: torsoMap), through points [x, dy, side]: dy below the shoulders' top at x, side 'f'
// on the front, 'b' on the back, 's' under the arm, 't' over the shoulder; or a point of its own [x, y, z, 'p'] (where it
// meets a bag). Built for the one body it's on, a flat band w wide.
function onBody(T, tor, pts, closed = false, n = closed ? 64 : 48, off = 0.006) {
  const mid = (x, y) => (tor.f(x, y) + tor.b(x, y)) / 2, V = (x, y, z) => new T.Vector3(x, y, z);
  const P = pts.map(([x, dy, sd, z]) => { if (sd === 'p') return V(x, dy, z); const t = tor.top(x), y = t + dy;
    return sd === 't' ? V(x, t + off, mid(x, t - 0.03)) : V(x, y, sd === 'f' ? tor.f(x, y) + off : sd === 'b' ? tor.b(x, y) - off : mid(x, y)); });
  const c = new T.CatmullRomCurve3(P, closed, 'centripetal'), pt = [];
  for (let i = 0; i <= n; i++) { // follow the curve, kept on the body's surface where it would dip in
    const q = c.getPoint(i / n), t = tor.top(q.x), f = tor.f(q.x, q.y), b = tor.b(q.x, q.y);
    if (q.y < t - 0.02) { if (q.z > (f + b) / 2) q.z = Math.max(q.z, f + off); else q.z = Math.min(q.z, b - off); }
    else if (q.z < f && q.z > b) q.y = Math.max(q.y, t + off);
    pt.push(q);
  }
  return pt;
}
function strap(T, tor, pts, w = 0.034, closed = false) {
  const pt = onBody(T, tor, pts, closed), n = pt.length - 1, pos = [], nor = [], idx = [], tn = new T.Vector3(), out = new T.Vector3(), side = new T.Vector3();
  for (let i = 0; i <= n; i++) {
    const q = pt[i]; tn.subVectors(pt[Math.min(n, i + 1)], pt[Math.max(0, i - 1)]).normalize();
    out.set(q.x * 0.4, Math.max(0, q.y - tor.top(q.x) + 0.07) * 1.5, q.z - (tor.f(q.x, q.y) + tor.b(q.x, q.y)) / 2).normalize();
    side.crossVectors(tn, out).normalize().multiplyScalar(w / 2);
    pos.push(q.x - side.x, q.y - side.y, q.z - side.z, q.x + side.x, q.y + side.y, q.z + side.z); nor.push(out.x, out.y, out.z, out.x, out.y, out.z);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  g.userData.own = true; return g; // this body's alone: thrown away with it (dress)
}
// a necklace's line on this body, in the neck anchor's terms: down on the chest in front (drop), over the shoulders,
// up the back of the neck. -> the points, made from n + 1 along it
function neckLine(T, A, drop, n = 64) {
  const tor = A && A.torso || PLAIN_TORSO, [kx, ky, kz] = A && A.neckAt || [0, 0.18, 0.11], off = 0.004;
  const F = (x, y) => [x, y, 'p', tor.f(x, y) + off], Bk = (x, y) => [x, y, 'p', tor.b(x, y) - off];
  const pts = [F(kx, ky - drop), F(kx + 0.045, ky - drop * 0.6), [kx + 0.072, 0, 't'], Bk(kx + 0.045, ky + 0.015), Bk(kx, ky + 0.025), Bk(kx - 0.045, ky + 0.015), [kx - 0.072, 0, 't'], F(kx - 0.045, ky - drop * 0.6)];
  return onBody(T, tor, pts, true, n, off).slice(0, n).map(p => p.set(p.x - kx, p.y - ky, p.z - kz)); // n: the last is the first
}
// where a pack of depth d, its middle at height yc and h tall, goes so its front sits on the back (leaning in with it):
// { z, tilt } for its middle
function packOn(tor, w, h, d, yc) {
  const lo = yc - h / 2 + 0.03, hi = yc + h / 2 - 0.03, tilt = Math.max(0, Math.min(0.25, Math.atan2(tor.b(0, hi) - tor.b(0, lo), hi - lo)));
  let z = 1; for (const x of [-w / 3, 0, w / 3]) for (let y = lo; y <= hi + 1e-6; y += (hi - lo) / 4) z = Math.min(z, tor.b(x, y) - 0.004 - d / 2 - (y - yc) * Math.tan(tilt));
  return { z, tilt };
}
// shoulder straps from a pack's top corners over the shoulders and down the chest to under the arms
function harness(T, g, tor, m, packTop, packZ) {
  for (const s of [-1, 1]) add(g, strap(T, tor, [[s * 0.07, packTop, 'p', packZ], [s * 0.075, -0.035, 'b'], [s * 0.08, 0, 't'], [s * 0.085, -0.05, 'f'], [s * 0.095, -0.15, 'f'], [s * 0.11, -0.23, 'f'], [s * 0.125, -0.27, 's']]), m);
}
// one strap across the body: from a bag on the back over shoulder s, across the chest and under the other arm
const crossbody = (T, tor, from, to, s) => strap(T, tor, [[...from.slice(0, 2), 'p', from[2]], [s * 0.07, -0.04, 'b'], [s * 0.08, 0, 't'], [s * 0.06, -0.07, 'f'], [-s * 0.02, -0.19, 'f'], [-s * 0.1, -0.31, 'f'], [-s * 0.125, -0.35, 's'], [...to.slice(0, 2), 'p', to[2]]], 0.03);
function add(g, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const o = new THREE_.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; }
let THREE_ = null;

const BUILD = {
  hat: {
    cap(T, hex) {
      const g = new T.Group(), m = mat(T, 'cloth', hex);
      add(g, cachedGeo('cap.crown', () => { const s = new T.SphereGeometry(0.1, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.53); s.scale(0.95, 1.08, 1.1); return s; }), m, 0, -0.1, 0); // down to the brows, a little past where the peak joins
      add(g, brimGeo(T), m, 0, -0.097, 0.092, 0.25);
      add(g, cachedGeo('cap.button', () => new T.SphereGeometry(0.009, 8, 6)), m, 0, 0.006, 0);
      return g;
    },
    capback(T, hex) { const g = BUILD.hat.cap(T, hex); g.rotation.y = Math.PI; return g; },
    beanie(T, hex) {
      const g = new T.Group(), m = mat(T, 'cloth', hex);
      add(g, cachedGeo('beanie.dome', () => { const s = new T.SphereGeometry(0.1, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.56); s.scale(1, 1.06, 1.1); return s; }), m, 0, -0.088, 0);
      add(g, cachedGeo('beanie.cuff', () => { const t = new T.TorusGeometry(0.099, 0.015, 8, 36); t.rotateX(Math.PI / 2); t.scale(1, 1.4, 1.1); return t; }), m, 0, -0.092, 0);
      return g;
    },
    visor(T, hex) {
      const g = new T.Group(), m = mat(T, 'cloth', hex);
      add(g, cachedGeo('visor.band', () => oval(new T.CylinderGeometry(0.093, 0.095, 0.03, 32, 1, true, -0.72 * Math.PI, 1.44 * Math.PI), 1.08)), mat(T, 'cloth2', hex), 0, -0.088, 0); // a headband, open at the back
      add(g, brimGeo(T), m, 0, -0.088, 0.088, 0.25);
      return g;
    },
    bucket(T, hex) {
      const g = new T.Group(), m = mat(T, 'cloth2', hex);
      add(g, cachedGeo('bucket', () => oval(lathe(T, [[0, 0.012], [0.06, 0.011], [0.088, -0.004], [0.1, -0.084], [0.136, -0.108], [0.139, -0.115], [0.1, -0.09]]))), m);
      return g;
    },
    fedora(T, hex) {
      const g = new T.Group(), m = mat(T, 'felt2', hex);
      add(g, cachedGeo('fedora', () => {
        const l = oval(lathe(T, [[0, 0.05], [0.04, 0.058], [0.074, 0.044], [0.09, -0.064], [0.094, -0.068], [0.15, -0.072], [0.156, -0.064], [0.094, -0.072]], 36));
        const p = l.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y > 0.03) p.setY(i, y - 0.03 * Math.max(0, 1 - Math.abs(x) / 0.03)); if (Math.hypot(x, z / 1.12) > 0.1) p.setY(i, y + 0.012 * Math.max(0, -z / 0.17)); } // the crease, the brim turned up at the back
        l.computeVertexNormals(); return l;
      }), m, 0, -0.016, 0);
      add(g, cachedGeo('fedora.band', () => oval(new T.CylinderGeometry(0.0905, 0.0905, 0.022, 36, 1, true))), mat(T, 'cloth', '#1c1a18'), 0, -0.066, 0);
      return g;
    },
    cowboy(T, hex) {
      const g = new T.Group(), m = mat(T, 'felt2', hex);
      add(g, cachedGeo('cowboy', () => {
        const l = oval(lathe(T, [[0, 0.062], [0.045, 0.07], [0.074, 0.056], [0.092, -0.064], [0.096, -0.068], [0.18, -0.072], [0.19, -0.062], [0.096, -0.074]], 40), 1.1);
        const p = l.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z / 1.1); if (r > 0.099) p.setY(i, y + 1.4 * ((x / r) ** 2) * (r - 0.099) ** 1.4); else if (y > 0.04) p.setY(i, y - 0.026 * Math.max(0, 1 - Math.abs(x) / 0.035)); } // the brim rolls up at the sides; the crown is pinched
        l.computeVertexNormals(); return l;
      }), m, 0, -0.016, 0);
      add(g, cachedGeo('cowboy.band', () => oval(new T.CylinderGeometry(0.0935, 0.0935, 0.016, 36, 1, true), 1.1)), mat(T, 'felt', '#2a1d14'), 0, -0.068, 0);
      return g;
    },
    hardhat(T, hex) {
      const g = new T.Group(), m = mat(T, 'plastic2', hex);
      add(g, cachedGeo('hardhat', () => oval(lathe(T, [[0, 0.056], [0.07, 0.05], [0.1, 0.004], [0.106, -0.056], [0.122, -0.066], [0.124, -0.06], [0.104, -0.05]]), 1.14)), m, 0, -0.034, 0);
      add(g, cachedGeo('hardhat.ridge', () => new T.BoxGeometry(0.022, 0.012, 0.13)), m, 0, 0.019, 0);
      add(g, cachedGeo('hardhat.peak', () => { const e = new T.ExtrudeGeometry(brimShape(T, 0.07, 0.04), { depth: 0.004, bevelEnabled: false }); e.rotateX(Math.PI / 2); return e; }), m, 0, -0.096, 0.112, 0.2);
      return g;
    },
    helmet(T, hex) {
      const g = new T.Group(), dark = mat(T, 'plastic', '#1c1d20');
      // the shell's profile (radius, height) turned round an oval; cutAt(a): where it ends at angle a from the front
      const prof = [[0, 0.026], [0.035, 0.022], [0.064, 0.01], [0.086, -0.01], [0.101, -0.035], [0.11, -0.062], [0.112, -0.09], [0.109, -0.125], [0.102, -0.16], [0.092, -0.195]], oz = 1.14;
      const cutAt = a => { const f = Math.min(1, Math.max(0, (Math.abs(a) - 0.7) / 0.75)), k = f * f * (3 - 2 * f); return -0.09 + (-0.18 + 0.09) * k; };
      const rAt = y => { for (let i = 1; i < prof.length; i++) if (y >= prof[i][1]) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return prof[prof.length - 1][0]; };
      add(g, cachedGeo('helmet', () => {
        const l = oval(lathe(T, prof, 48), oz), p = l.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), c = cutAt(Math.atan2(x, z / oz)); if (p.getY(i) < c) { const r = rAt(c), h = Math.hypot(x, z / oz) || 1; p.setXYZ(i, x / h * r, c, z / h * r); } }
        l.computeVertexNormals(); return l;
      }), mat(T, 'plastic2', hex));
      add(g, cachedGeo('helmet.rim', () => {
        const pts = []; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2 - Math.PI, y = cutAt(a), r = rAt(y) + 0.002; pts.push(new T.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * oz)); }
        return new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), 96, 0.006, 6, true);
      }), dark);
      add(g, cachedGeo('helmet.peak', () => peak(T, 0.075, 0.05, 2)), dark, 0, -0.078, 0.114, 0.22);
      g.position.z = -0.008; return g; // heads are longer behind the crown
    },
    crown(T, hex) {
      const g = new T.Group(), m = mat(T, 'metal2', hex);
      add(g, cachedGeo('crown.band', () => oval(new T.CylinderGeometry(0.084, 0.08, 0.045, 32, 1, true), 1.08)), m, 0, -0.03, 0);
      const pt = cachedGeo('crown.point', () => new T.ConeGeometry(0.014, 0.04, 6)), gem = cachedGeo('crown.gem', () => new T.SphereGeometry(0.008, 8, 6));
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, x = Math.sin(a) * 0.082, z = Math.cos(a) * 0.088; add(g, pt, m, x, 0.008, z); add(g, gem, mat(T, 'lens', i % 2 ? '#a3122a' : '#1f4fa8'), x * 1.02, -0.02, z * 1.02); }
      return g;
    },
  },
  glasses: {
    shades(T, hex, frame = '#141414') {
      const g = new T.Group(), lens = mat(T, 'lens', hex), fr = mat(T, 'plastic', frame);
      const lg = cachedGeo('shades.lens', () => { const s = new T.Shape(), w = 0.026, h = 0.019, r = 0.008; s.moveTo(-w + r, h); s.lineTo(w - r, h); s.quadraticCurveTo(w, h, w, h - r); s.lineTo(w * 0.85, -h + r); s.quadraticCurveTo(w * 0.8, -h, w * 0.8 - r, -h); s.lineTo(-w * 0.8 + r, -h); s.quadraticCurveTo(-w * 0.85, -h, -w * 0.9, -h + r); s.lineTo(-w, h - r); s.quadraticCurveTo(-w, h, -w + r, h); return new T.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 }); });
      add(g, lg, lens, -0.033, 0, 0, 0, 0.12); add(g, lg, lens, 0.033, 0, 0, 0, -0.12);
      add(g, cachedGeo('shades.top', () => new T.BoxGeometry(0.135, 0.008, 0.008)), fr, 0, 0.018, 0.001);
      const tg = templeGeo(T);
      add(g, tg, fr, -0.068, 0.012, -0.055, 0, 0.06); add(g, tg, fr, 0.068, 0.012, -0.055, 0, -0.06);
      return g;
    },
    round(T, hex) {
      const g = new T.Group(), fr = mat(T, 'metal', hex), lens = mat(T, 'clear', '#dfe8ee');
      const rim = cachedGeo('round.rim', () => new T.TorusGeometry(0.021, 0.0022, 6, 28)), lg = cachedGeo('round.lens', () => new T.CircleGeometry(0.0205, 24));
      for (const s of [-1, 1]) { add(g, rim, fr, s * 0.032, 0, 0); add(g, lg, lens, s * 0.032, 0, -0.001); }
      add(g, cachedGeo('round.bridge', () => new T.TorusGeometry(0.008, 0.0016, 4, 10, Math.PI)), fr, 0, 0.004, 0);
      const tg = templeGeo(T); add(g, tg, fr, -0.06, 0.004, -0.055, 0, 0.08); add(g, tg, fr, 0.06, 0.004, -0.055, 0, -0.08);
      return g;
    },
    aviators(T, hex, frame = '#c4c6cc') {
      const g = new T.Group(), fr = mat(T, 'metal', frame), lens = mat(T, 'lens2', hex);
      const lg = cachedGeo('av.lens', () => { const s = new T.Shape(); s.moveTo(-0.026, 0.017); s.quadraticCurveTo(0, 0.022, 0.026, 0.015); s.quadraticCurveTo(0.03, -0.012, 0.012, -0.024); s.quadraticCurveTo(-0.01, -0.03, -0.024, -0.012); s.quadraticCurveTo(-0.03, 0.006, -0.026, 0.017); return new T.ExtrudeGeometry(s, { depth: 0.002, bevelEnabled: false }); });
      add(g, lg, lens, -0.034, 0, 0, 0, 0.12); const r = add(g, lg, lens, 0.034, 0, 0, 0, -0.12); r.scale.x = -1;
      add(g, cachedGeo('av.bar', () => new T.BoxGeometry(0.03, 0.002, 0.002)), fr, 0, 0.016, 0.001);
      add(g, cachedGeo('av.bridge', () => new T.TorusGeometry(0.008, 0.0015, 4, 10, Math.PI)), fr, 0, 0.006, 0);
      const tg = templeGeo(T); add(g, tg, fr, -0.064, 0.012, -0.055, 0, 0.06); add(g, tg, fr, 0.064, 0.012, -0.055, 0, -0.06);
      return g;
    },
    goldav(T, hex) { return BUILD.glasses.aviators(T, hex, '#d4af37'); },
    wrap(T, hex) {
      const g = new T.Group(), lens = mat(T, 'lens2', hex), fr = mat(T, 'plastic', '#1e2226');
      add(g, cachedGeo('wrap.lens', () => { const c = new T.CylinderGeometry(0.1, 0.1, 0.036, 28, 1, true, -0.62, 1.24); c.scale(0.8, 1, 0.55); c.translate(0, 0, -0.055); return c; }), lens, 0, 0, 0);
      const tg = templeGeo(T); add(g, tg, fr, -0.068, 0.008, -0.06, 0, 0.05); add(g, tg, fr, 0.068, 0.008, -0.06, 0, -0.05);
      return g;
    },
  },
  neck: { // the chain and the lei follow this body's collar line (A: its measurements; none: a plain one)
    chain(T, hex, A, pendant = false) {
      const g = new T.Group(), m = mat(T, 'metal', hex), line = neckLine(T, A, pendant ? 0.085 : 0.05);
      const geo = new T.TubeGeometry(new T.CatmullRomCurve3(line, true), 96, 0.0032, 5, true); geo.userData.own = true; add(g, geo, m);
      if (pendant) { const p = line[0]; add(g, cachedGeo('medallion', () => new T.CylinderGeometry(0.02, 0.02, 0.004, 20).rotateX(Math.PI / 2)), m, p.x, p.y - 0.022, p.z + 0.002, 0.15); }
      return g;
    },
    medallion(T, hex, A) { return BUILD.neck.chain(T, hex, A, true); },
    bandana(T, hex) {
      const g = new T.Group(), m = mat(T, 'cloth2', hex);
      add(g, cachedGeo('bandana.ring', () => { const c = new T.CylinderGeometry(0.068, 0.082, 0.05, 24, 1, true); c.scale(1.05, 1, 1.1); return c; }), m, 0, 0.012, 0.006);
      add(g, cachedGeo('bandana.flap', () => { const s = new T.Shape(); s.moveTo(-0.06, 0); s.lineTo(0.06, 0); s.lineTo(0, -0.075); s.lineTo(-0.06, 0); return new T.ShapeGeometry(s); }), m, 0, 0, 0.086, -0.25);
      return g;
    },
    headphones(T, hex) {
      const g = new T.Group(), m = mat(T, 'plastic', hex), pad = mat(T, 'cloth', '#1a1a1a');
      add(g, cachedGeo('hp.band', () => { const t = new T.TorusGeometry(0.088, 0.007, 8, 30, Math.PI); t.rotateX(Math.PI / 2); return t; }), m, 0, 0.02, -0.01, 0.45, Math.PI);
      const cup = cachedGeo('hp.cup', () => new T.CylinderGeometry(0.036, 0.036, 0.026, 20).rotateZ(Math.PI / 2));
      add(g, cup, m, -0.09, -0.004, 0.035, 0, 0.5); add(g, cup, m, 0.09, -0.004, 0.035, 0, -0.5);
      const pd = cachedGeo('hp.pad', () => new T.CylinderGeometry(0.03, 0.03, 0.012, 16).rotateZ(Math.PI / 2));
      add(g, pd, pad, -0.075, -0.004, 0.04, 0, 0.5); add(g, pd, pad, 0.075, -0.004, 0.04, 0, -0.5);
      return g;
    },
    lei(T, hex, A) {
      const g = new T.Group(), a = mat(T, 'cloth', hex), b = mat(T, 'cloth', '#f6e7c8'), leaf = mat(T, 'cloth', '#3f6b35');
      const f = cachedGeo('lei.flower', () => new T.IcosahedronGeometry(0.016, 0)), line = neckLine(T, A, 0.075, 28);
      for (let i = 0; i < 28; i++) { const p = line[i], t = i / 28 * Math.PI * 2; add(g, f, i % 3 === 2 ? leaf : i % 2 ? b : a, p.x, p.y + 0.008, p.z, t, t * 2, 0); }
      return g;
    },
  },
  back: { // built for the body they go on (A: its measurements, src/wardrobe.js anchorsFor; none: a plain torso)
    backpack(T, hex, A) {
      const g = new T.Group(), m = mat(T, 'cloth', hex), dark = mat(T, 'cloth2', '#1c1d20'), tor = A && A.torso || PLAIN_TORSO;
      const yc = tor.top(0.08) - 0.25, P = packOn(tor, 0.28, 0.38, 0.13, yc), pack = new T.Group(); pack.position.set(0, yc, P.z); pack.rotation.x = P.tilt; g.add(pack);
      add(pack, cachedGeo('bp.body', () => new RoundedBoxGeometry(0.28, 0.38, 0.13, 3, 0.04)), m);
      add(pack, cachedGeo('bp.pocket', () => new RoundedBoxGeometry(0.2, 0.14, 0.05, 2, 0.02)), m, 0, -0.09, -0.075);
      add(pack, cachedGeo('bp.handle', () => new T.TorusGeometry(0.025, 0.006, 6, 12, Math.PI)), dark, 0, 0.19, 0.02);
      harness(T, g, tor, dark, yc + 0.17, P.z + 0.05);
      return g;
    },
    sling(T, hex, A) {
      const g = new T.Group(), m = mat(T, 'cloth', hex), dark = mat(T, 'cloth2', '#1c1d20'), tor = A && A.torso || PLAIN_TORSO, s = 1;
      const x0 = -s * 0.1, y0 = tor.top(x0) - 0.33, x1 = s * 0.02, y1 = tor.top(x1) - 0.18, xc = (x0 + x1) / 2, yc = (y0 + y1) / 2; // along the strap on the back
      const bag = add(g, cachedGeo('sling.bag', () => new RoundedBoxGeometry(0.26, 0.12, 0.07, 2, 0.03)), m, xc, yc, tor.b(xc, yc) - 0.04, 0, 0, Math.atan2(y1 - y0, x1 - x0));
      const zb = bag.position.z;
      add(g, crossbody(T, tor, [x1 + s * 0.08, y1 + 0.06, zb], [x0 - s * 0.08, y0 - 0.06, zb], s), dark);
      return g;
    },
    chute(T, hex, A) {
      const g = new T.Group(), m = mat(T, 'cloth', hex), web = mat(T, 'cloth2', '#1c1d20'), metal = mat(T, 'metal', '#c4c6cc'), tor = A && A.torso || PLAIN_TORSO;
      const yc = tor.top(0.08) - 0.27, P = packOn(tor, 0.32, 0.44, 0.15, yc), pack = new T.Group(); pack.position.set(0, yc, P.z); pack.rotation.x = P.tilt; g.add(pack);
      add(pack, cachedGeo('chute.pack', () => new RoundedBoxGeometry(0.32, 0.44, 0.15, 3, 0.035)), m);
      add(pack, cachedGeo('chute.flap', () => new RoundedBoxGeometry(0.28, 0.12, 0.02, 2, 0.008)), web, 0, -0.14, -0.078);
      harness(T, g, tor, web, yc + 0.2, P.z + 0.06);
      const cy = tor.top(0) - 0.17; add(g, strap(T, tor, [[-0.11, -0.17, 'f'], [0, -0.17, 'f'], [0.11, -0.17, 'f']]), web); // chest strap
      add(g, cachedGeo('chute.handle', () => new T.TorusGeometry(0.016, 0.004, 6, 14)), metal, 0.1, cy - 0.06, tor.f(0.1, cy - 0.06) + 0.012); // the ripcord
      return g;
    },
    duffel(T, hex, A) {
      const g = new T.Group(), m = mat(T, 'cloth', hex), dark = mat(T, 'cloth2', '#1c1d20'), tor = A && A.torso || PLAIN_TORSO, s = 1;
      const yc = tor.top(0.08) - 0.25; let zb = 1; for (const x of [-0.12, 0, 0.12]) zb = Math.min(zb, tor.b(x, yc)); zb -= 0.105;
      add(g, cachedGeo('duffel.bag', () => { const c = new T.CapsuleGeometry(0.11, 0.3, 6, 18); c.rotateZ(Math.PI / 2); c.scale(1, 1, 0.9); return c; }), m, 0, yc, zb, 0, 0, 0.12);
      add(g, cachedGeo('duffel.cash', () => new T.BoxGeometry(0.07, 0.025, 0.04)), mat(T, 'cloth', '#6e8f4e'), 0.06, yc + 0.1, zb - 0.02, 0.4, 0.3, 0.2);
      add(g, crossbody(T, tor, [s * 0.22, yc + 0.06, zb + 0.03], [-s * 0.24, yc - 0.03, zb + 0.03], s), dark);
      return g;
    },
  },
};

// put a look on a rig made by makeHuman (src/humans.js): accessories on the bones, height and build on the body.
// protoRoot (the avatar's prototype) only keys the measurements.
export function dress(THREE, r, protoRoot, code) {
  THREE_ = THREE; const L = decodeLook(code);
  if (r.worn) for (const o of r.worn) { o.parent && o.parent.remove(o); o.traverse(m => { if (m.geometry && m.geometry.userData.own) m.geometry.dispose(); }); }
  r.worn = []; r.look = code || '';
  let A = anchorCache.get(protoRoot);
  if (!A) { // measure them at their own size, at one moment of the idle (it sways), then put the clock back
    const t = r.mixer.time; r.inst.scale.set(1, 1, 1); r.mixer.setTime(0.3);
    A = anchorsFor(THREE, protoRoot, r.g, r.inst); r.mixer.setTime(t);
  }
  const h = HEIGHTS[L.h] || 1, b = BUILDS[L.b] || 1; r.inst.scale.set(b, h, b);
  for (const [slot] of SLOTS) {
    const item = ITEMS[slot][L[slot][0]], an = A[slot]; if (!item || item.id === 'none' || !an || !fits(r.name || '', slot)) continue;
    const make = BUILD[slot][item.id]; if (!make) continue;
    const bone = r.inst.getObjectByName(an.bone); if (!bone) continue;
    const pivot = new THREE.Group(); an.m.decompose(pivot.position, pivot.quaternion, pivot.scale);
    const thing = make(THREE, colorOf(item, L[slot][1]), A); if (slot === 'hat') thing.scale.setScalar(Math.max(0.92, Math.min(1.06, A.width / 0.16)));
    if (slot === 'neck' && (item.id === 'bandana' || item.id === 'headphones')) { // round a thick collar
      const [kx, ky, kz] = A.neckAt, reach = Math.max(A.torso.f(kx, ky) - kz, kz - A.torso.b(kx, ky + 0.02)), k = Math.max(0.92, Math.min(1.4, (reach + 0.012) / 0.075));
      thing.scale.set((1 + k) / 2, 1, k);
    }
    pivot.add(thing); bone.add(pivot); r.worn.push(pivot);
  }
  return r;
}
// one thing on its own (a shop icon, a test render)
export function buildItem(THREE, slot, id, hex) { THREE_ = THREE; const f = BUILD[slot] && BUILD[slot][id]; return f ? f(THREE, hex) : null; }
