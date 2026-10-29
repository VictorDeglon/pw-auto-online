// The waterfront (assets/world/harbor.json from tools/world/harbor.py, OpenStreetMap): marina docks and the boats in
// their slips, the fixed piers, the breakwaters.
//  - floating docks: concrete-capped walkways on their floats, steel pilings with caps every few metres, cleats, power
//    pedestals and dock boxes; fingers where they're mapped, laid along the walkway where only it is (a slip every
//    5 m or so, both sides)
//  - the boats in the slips (src/world/boatmodels.js): the bigger the slip, the bigger the boat (center consoles and
//    bowriders in the short ones, sloops in the middle, motor yachts on the long fingers), white hulls mostly, canvas
//    covers in navy and green. Instanced by type and paint, a few draws for a whole marina, bobbing and rolling on
//    their lines in the vertex shader; the near ones in full, the rest as their hulls out to the end of the view
//  - fixed piers (the ocean piers and the marina's fixed walkways): a timber deck on pile bents, railings, lamp posts
//  - breakwaters and jetties: rip-rap, granite boulders heaped along the line
// Built in 400 m cells around the camera.
//   const HB = await createHarbor(THREE, scene, { data, boatModel, waterY(elevation, x, z) -> the surface's y, U })   HB.update(camera)
import { boatModel as buildBoat } from './boatmodels.js';

const idle = () => new Promise(r => setTimeout(r, 0));
function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lin = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255].map(c => Math.pow(c, 2.2));

// ---------------------------------------------------------------- the layout
function layout(data, waterY) {
  const docks = [], slips = [], piers = [], breaks = [];
  const inMarina = (x, z) => data.marinas.some(m => pip(x, z, m, 1));
  // walkways and fingers: a short dock with an end on another dock is a finger
  const lines = data.docks.map(([w, fl, e, ...p]) => { let L = 0; for (let i = 0; i + 3 < p.length; i += 2) L += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); return { w, fl, e, p, L }; });
  const G = new Map(), GS = 40, key = (x, z) => Math.floor(x / GS) * 100003 + Math.floor(z / GS);
  lines.forEach((d, i) => { for (let k = 0; k < d.p.length; k += 2) { const kk = key(d.p[k], d.p[k + 1]); let c = G.get(kk); if (!c) G.set(kk, c = new Set()); c.add(i); } });
  const touches = (x, z, self) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of G.get(key(x + a * GS, z + b * GS)) || []) { if (j === self) continue; const q = lines[j].p; for (let k = 0; k + 3 < q.length; k += 2) if (segD(x, z, q[k], q[k + 1], q[k + 2], q[k + 3]) < 2.5) return j; } return -1; };
  const fingersOn = new Map();
  lines.forEach((d, i) => {
    const n = d.p.length, mx = (d.p[0] + d.p[n - 2]) / 2, mz = (d.p[1] + d.p[n - 1]) / 2, water = waterY(d.e, mx, mz); if (water === null) return;
    const marina = d.fl || inMarina(mx, mz); d.marina = marina; d.y = water;
    if (marina && d.L < 24) { const j = touches(d.p[0], d.p[1], i) >= 0 ? touches(d.p[0], d.p[1], i) : touches(d.p[n - 2], d.p[n - 1], i); if (j >= 0) { d.finger = true; fingersOn.set(j, (fingersOn.get(j) || 0) + 1); } }
  });
  const R = rng(9137);
  lines.forEach((d, i) => {
    if (d.y === undefined) return;
    if (!d.marina) { piers.push({ p: d.p, w: d.w || 5, y: d.y }); return; }
    const w = d.w || (d.finger ? 1.0 : 2.4); docks.push({ p: d.p, w, y: d.y, finger: !!d.finger });
    if (d.finger) { // a boat along one side of the finger, bow in toward the walkway
      const n = d.p.length, a0 = touches(d.p[0], d.p[1], i) >= 0, [ax, az, bx, bz] = a0 ? [d.p[0], d.p[1], d.p[n - 2], d.p[n - 1]] : [d.p[n - 2], d.p[n - 1], d.p[0], d.p[1]];
      const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
      for (const side of [1, -1]) { if (R() > 0.78) continue; const off = side * (w / 2 + 1.6 + L * 0.06), bl = L * (0.8 + R() * 0.25), c = 0.5 * bl + 0.6;
        slips.push({ x: ax + tx * c - tz * off, z: az + tz * c + tx * off, y: d.y, yaw: Math.atan2(-tx, -tz), L: bl }); }
    } else if ((fingersOn.get(i) || 0) < 3 && d.L > 30) { // only the walkway is mapped: lay fingers off both sides
      for (let k = 0; k + 3 < d.p.length; k += 2) {
        const ax = d.p[k], az = d.p[k + 1], bx = d.p[k + 2], bz = d.p[k + 3], L = Math.hypot(bx - ax, bz - az); if (L < 8) continue;
        const tx = (bx - ax) / L, tz = (bz - az) / L, fl = 9 + R() * 4, sp = 5.2 + R() * 1.2;
        for (let s = 4; s < L - 4; s += sp) for (const side of [1, -1]) {
          const x0 = ax + tx * s - tz * side * w / 2, z0 = az + tz * s + tx * side * w / 2, x1 = x0 - tz * side * fl, z1 = z0 + tx * side * fl;
          docks.push({ p: [x0, z0, x1, z1], w: 0.9, y: d.y, finger: true });
          if (R() < 0.8) { const bl = fl * (0.8 + R() * 0.3), o = sp / 2, c = bl / 2 + 0.6; slips.push({ x: x0 - tz * side * c + tx * o, z: z0 + tx * side * c + tz * o, y: d.y, yaw: Math.atan2(tz * side, -tx * side), L: bl }); }
        }
      }
    }
  });
  for (const [w, e, ...p] of data.breaks) { const y = waterY(e, p[0], p[1]); if (y !== null) breaks.push({ p, w: w || 8, y }); }
  for (const [e, ...p] of data.decks) { const y = waterY(e, p[0], p[1]); if (y !== null) piers.push({ poly: p, y }); }
  return { docks, slips, piers, breaks };
}
function pip(x, z, m, off) { let ins = false; const n = (m.length - off) / 2; for (let i = 0, j = n - 1; i < n; j = i++) { const xi = m[off + i * 2], zi = m[off + i * 2 + 1], xj = m[off + j * 2], zj = m[off + j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; }
function segD(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz; let t = L ? ((px - ax) * dx + (pz - az) * dz) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(ax + dx * t - px, az + dz * t - pz); }

// ---------------------------------------------------------------- geometry per cell
class Sink {
  constructor(T) { this.T = T; this.L = new Map(); }
  add(mat, geo, m, col) { const g = geo.index ? geo.toNonIndexed() : geo; if (m) g.applyMatrix4(m); let L = this.L.get(mat); if (!L) this.L.set(mat, L = { p: [], n: [], c: [] });
    const P = g.attributes.position, N = g.attributes.normal; for (let i = 0; i < P.count; i++) { L.p.push(P.getX(i), P.getY(i), P.getZ(i)); L.n.push(N.getX(i), N.getY(i), N.getZ(i)); L.c.push(col[0], col[1], col[2]); } if (g !== geo) g.dispose(); geo.dispose(); }
  box(mat, cx, cy, cz, sx, sy, sz, yaw, col) { const T = this.T; this.add(mat, new T.BoxGeometry(sx, sy, sz), new T.Matrix4().makeRotationY(yaw).setPosition(cx, cy, cz), col); }
  cyl(mat, x, y0, y1, z, r, col, sides = 8) { const T = this.T; this.add(mat, new T.CylinderGeometry(r, r, y1 - y0, sides), new T.Matrix4().makeTranslation(x, (y0 + y1) / 2, z), col); }
  meshes(mats, scene) { const out = []; for (const [k, L] of this.L) { const T = this.T, g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(L.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(L.n, 3)); g.setAttribute('color', new T.Float32BufferAttribute(L.c, 3)); g.computeBoundingSphere();
    const m = new T.Mesh(g, mats[k]); m.castShadow = k !== 'rock'; m.receiveShadow = true; m.matrixAutoUpdate = false; m.name = 'harbor:' + k; scene.add(m); out.push(m); } return out; }
}
function buildCell(T, items, mats, scene, r) {
  const S = new Sink(T), Y = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);
  for (const d of items.docks) { // floating: the deck 45 cm over the water on its floats, pilings through it
    const top = d.y + 0.45;
    for (let k = 0; k + 3 < d.p.length; k += 2) {
      const ax = d.p[k], az = d.p[k + 1], bx = d.p[k + 2], bz = d.p[k + 3], L = Math.hypot(bx - ax, bz - az); if (L < 0.3) continue;
      const yaw = Math.atan2(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L, cx = (ax + bx) / 2, cz = (az + bz) / 2;
      S.box('deck', cx, top - 0.06, cz, d.w, 0.12, L + (d.finger ? 0 : d.w * 0.5), yaw, [0.78, 0.77, 0.74]);                 // the concrete cap
      S.box('float', cx, d.y + 0.12, cz, d.w * 0.96, 0.5, L, yaw, [0.85, 0.84, 0.8]);                                    // floats under it
      S.box('wood', cx + tz * d.w / 2, top - 0.11, cz - tx * d.w / 2, 0.08, 0.2, L, yaw, [1, 1, 1]); S.box('wood', cx - tz * d.w / 2, top - 0.11, cz + tx * d.w / 2, 0.08, 0.2, L, yaw, [1, 1, 1]); // rub boards
      for (let s = (d.finger ? L - 0.4 : 3); s < L; s += d.finger ? 1e9 : 9) for (const side of d.finger ? [1] : [1, -1]) { // pilings with caps
        const x = ax + tx * s + tz * side * (d.w / 2 + 0.25), z = az + tz * s - tx * side * (d.w / 2 + 0.25); S.cyl('pile', x, d.y - 3, top + 1.6, z, 0.17, [0.8, 0.8, 0.78], 10); S.cyl('pile', x, top + 1.6, top + 1.7, z, 0.19, [0.25, 0.25, 0.26], 10); }
      for (let s = 1.5; s < L - 0.5; s += d.finger ? 3.5 : 6) for (const side of [1, -1]) { // cleats, and on the walkways the power pedestals and dock boxes
        const x = ax + tx * s + tz * side * (d.w / 2 - 0.15), z = az + tz * s - tx * side * (d.w / 2 - 0.15); S.box('steel', x, top + 0.03, z, 0.05, 0.05, 0.22, yaw, [1, 1, 1]);
        if (!d.finger && r() < 0.18) { S.box('paint', x - tz * side * 0.25, top + 0.55, z + tx * side * 0.25, 0.3, 1.1, 0.25, yaw, [0.9, 0.9, 0.88]); S.box('lamp', x - tz * side * 0.25, top + 1.12, z + tx * side * 0.25, 0.22, 0.08, 0.2, yaw, [1, 0.9, 0.7]); }
        if (!d.finger && r() < 0.08) S.box('paint', x - tz * side * 0.5, top + 0.35, z + tx * side * 0.5, 0.6, 0.7, 1.2, yaw, [0.92, 0.92, 0.9]); }
    }
  }
  for (const pr of items.piers) { // fixed: timber deck on pile bents, a rail, lamps
    if (pr.poly) { const p = pr.poly, n = p.length / 2, top = pr.y + 2.2, sh = new T.Shape(); sh.moveTo(p[0], -p[1]); for (let i = 1; i < n; i++) sh.lineTo(p[i * 2], -p[i * 2 + 1]);
      const g = new T.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, top - 0.35, 0); S.add('wood', g, null, [0.85, 0.8, 0.72]);
      for (let i = 0; i < n; i++) S.cyl('pile', p[i * 2], pr.y - 3, top - 0.3, p[i * 2 + 1], 0.22, [0.62, 0.55, 0.45]); continue; }
    const ocean = pr.w >= 4, top = pr.y + (ocean ? 6.5 : 1.6);
    for (let k = 0; k + 3 < pr.p.length; k += 2) {
      const ax = pr.p[k], az = pr.p[k + 1], bx = pr.p[k + 2], bz = pr.p[k + 3], L = Math.hypot(bx - ax, bz - az); if (L < 0.3) continue;
      const yaw = Math.atan2(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
      S.box('wood', (ax + bx) / 2, top - 0.15, (az + bz) / 2, pr.w, 0.3, L, yaw, [0.82, 0.77, 0.68]);
      for (let s = 0; s < L; s += 6) { const x = ax + tx * s, z = az + tz * s; // a bent: piles across, a cap beam, cross bracing
        for (const o of [-0.42, -0.14, 0.14, 0.42]) S.cyl('pile', x + tz * o * pr.w, pr.y - 3, top - 0.3, z - tx * o * pr.w, ocean ? 0.24 : 0.16, [0.62, 0.55, 0.45], 10);
        S.box('wood', x, top - 0.42, z, pr.w + 0.4, 0.26, 0.3, yaw, [0.7, 0.64, 0.55]);
        if (ocean) S.box('wood', x, (pr.y + top) / 2, z, pr.w * 0.9, 0.12, 0.12, yaw, [0.6, 0.55, 0.46]); }
      for (const side of [1, -1]) { const ox = tz * side * (pr.w / 2 - 0.05), oz = -tx * side * (pr.w / 2 - 0.05);
        S.box('wood', (ax + bx) / 2 + ox, top + 1.0, (az + bz) / 2 + oz, 0.1, 0.1, L, yaw, [0.9, 0.86, 0.78]); S.box('wood', (ax + bx) / 2 + ox, top + 0.5, (az + bz) / 2 + oz, 0.06, 0.06, L, yaw, [0.9, 0.86, 0.78]);
        for (let s = 0; s < L; s += 2.4) S.box('wood', ax + tx * s + ox, top + 0.5, az + tz * s + oz, 0.1, 1.0, 0.1, yaw, [0.9, 0.86, 0.78]);
        if (ocean) for (let s = 10; s < L; s += 30) { const x = ax + tx * s + ox * 0.95, z = az + tz * s + oz * 0.95; S.cyl('steel', x, top, top + 4.2, z, 0.06, [0.25, 0.27, 0.28]); S.box('lamp', x - ox * 0.08, top + 4.25, z - oz * 0.08, 0.35, 0.18, 0.35, yaw, [1, 0.9, 0.7]); } }
    }
  }
  for (const b of items.breaks) { // rip-rap: boulders heaped along the line, the biggest on the crest
    for (let k = 0; k + 3 < b.p.length; k += 2) {
      const ax = b.p[k], az = b.p[k + 1], bx = b.p[k + 2], bz = b.p[k + 3], L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
      for (let s = 0; s < L; s += 2.6) for (let j = -2; j <= 2; j++) {
        const o = j * b.w / 5 + (r() - 0.5) * 1.2, x = ax + tx * s - tz * o, z = az + tz * s + tx * o, h = (1 - Math.abs(j) / 3) * 2.6 + r() * 0.6, sz = 1.4 + r() * 1.3 - Math.abs(j) * 0.15;
        const g = new T.IcosahedronGeometry(sz * 0.55, 0); g.scale(1 + r() * 0.5, 0.6 + r() * 0.4, 1 + r() * 0.4);
        const c = 0.55 + r() * 0.25; S.add('rock', g, new T.Matrix4().makeRotationFromEuler(new T.Euler(r() * 3, r() * 3, r() * 3)).setPosition(x, b.y - 0.8 + h, z), [c, c * 0.96, c * 0.9]);
      }
    }
  }
  return S.meshes(mats, scene);
}

// ---------------------------------------------------------------- moored boats, instanced and bobbing
const SLIP_KINDS = [[7, ['runabout', 'center', 'center']], [9.5, ['center', 'speedboat', 'sailboat', 'sailboat']], [13, ['sailboat', 'sailboat', 'center', 'yacht']], [99, ['yacht', 'yacht', 'sailboat']]];
const PAINTS = [{ hull: 0xf7f7f3, trim: 0x0c2340, canvas: 0x0f2238 }, { hull: 0xf7f7f3, trim: 0x2d6e8a, canvas: 0x2f4d3a }, { hull: 0xeef1f2, trim: 0x111111, canvas: 0x6b6257 }];
function bob(mat, U) { // heave, roll and pitch from the instance's position: no two boats in step
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ipb = vec3(instanceMatrix[3]); float phb = dot(ipb.xz, vec2(0.37, 0.23));
        float rl = sin(uTime * 0.71 + phb * 1.7) * 0.025, pt = sin(uTime * 0.93 + phb) * 0.012, hv = sin(uTime * 1.13 + phb * 0.6) * 0.05;
        transformed.y += transformed.x * rl + transformed.z * pt + hv; transformed.x -= transformed.y * rl; transformed.z -= transformed.y * pt;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'harbor-bob'; return mat;
}

export async function createHarbor(THREE, scene, o) {
  const data = o.data; if (!data) return null;
  const U = o.U || { uTime: { value: 0 } }, R = rng(5150);
  const L = layout(data, o.waterY); await idle();
  // materials
  const S = THREE.MeshStandardMaterial, mats = {
    deck: new S({ color: 0xffffff, roughness: 0.92, vertexColors: true }), float: new S({ color: 0xffffff, roughness: 0.85, vertexColors: true }), wood: new S({ color: 0x8a6e52, roughness: 0.85, vertexColors: true }),
    pile: new S({ color: 0xffffff, roughness: 0.8, vertexColors: true }), steel: new S({ color: 0xd8dadc, roughness: 0.25, metalness: 0.9, vertexColors: true }), paint: new S({ color: 0xffffff, roughness: 0.5, vertexColors: true }),
    lamp: new S({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 0, vertexColors: true }), rock: new S({ color: 0x9a948a, roughness: 0.95, vertexColors: true, flatShading: true }),
  };
  // cells
  const C = 400, cells = new Map(), key = (x, z) => Math.floor(x / C) * 100003 + Math.floor(z / C), put = (x, z) => { const k = key(x, z); let c = cells.get(k); if (!c) cells.set(k, c = { docks: [], piers: [], breaks: [], meshes: null, cx: (Math.floor(x / C) + 0.5) * C, cz: (Math.floor(z / C) + 0.5) * C }); return c; };
  for (const d of L.docks) put(d.p[0], d.p[1]).docks.push(d);
  for (const p of L.piers) put(p.p ? p.p[0] : p.poly[0], p.p ? p.p[1] : p.poly[1]).piers.push(p);
  for (const b of L.breaks) put(b.p[0], b.p[1]).breaks.push(b);
  // boats: one model per kind and paint, its materials patched to bob; the slips' instance matrices
  const groups = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  for (const s of L.slips) {
    const kinds = SLIP_KINDS.find(k => s.L <= k[0])[1], kind = kinds[Math.floor(R() * kinds.length)], pi = Math.floor(R() * PAINTS.length), id = kind + '/' + pi;
    let g = groups.get(id); if (!g) groups.set(id, g = { kind, pi, list: [] });
    q.setFromAxisAngle(up, s.yaw); const mm = new THREE.Matrix4().compose(v.set(s.x, s.y, s.z), q, sc); g.list.push({ x: s.x, z: s.z, m: mm });
  }
  for (const g of groups.values()) {
    await idle();
    const model = (o.boatModel || ((k, p) => buildBoat(THREE, k, p)))(g.kind, { ...PAINTS[g.pi], seed: 11 + g.pi }), det = [], lowParts = [];
    model.updateMatrixWorld(true); const meshes = []; model.traverse(m => { if (m.isMesh) meshes.push(m); });
    for (const mesh of meshes) {
      const mat = bob(mesh.material.clone(), U), im = new THREE.InstancedMesh(mesh.geometry, mat, g.list.length); im.count = 0; im.frustumCulled = false; im.castShadow = mesh.castShadow; im.receiveShadow = true; im.name = 'moored:' + g.kind; scene.add(im); det.push(im);
      if (/gel|tint|canvas|bottom/.test(mesh.name)) lowParts.push(mesh);
    }
    // the stand-in: the hull, cabin and canvas only
    const geos = lowParts.map(m => m.geometry); let low = null;
    if (geos.length) { const P = [], N = [], Cc = []; for (const ge of geos) { P.push(...ge.attributes.position.array); N.push(...ge.attributes.normal.array); Cc.push(...ge.attributes.color.array); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); lg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
      low = new THREE.InstancedMesh(lg, bob(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, vertexColors: true }), U), g.list.length); low.count = 0; low.frustumCulled = false; low.name = 'moored-far:' + g.kind; scene.add(low); }
    g.det = det; g.low = low;
  }
  const last = { x: 1e9, z: 1e9, t: 0 }, NEAR = 700, FAR = 3500, BUILD = 1300;
  const H = {
    slips: L.slips.length, docks: L.docks.length, piers: L.piers.length, breaks: L.breaks.length,
    update(camera, night = 0) {
      const cx = camera.position.x, cz = camera.position.z;
      mats.lamp.emissiveIntensity = night * 2;
      if ((cx - last.x) ** 2 + (cz - last.z) ** 2 < 25 * 25 && ++last.t < 120) return; last.x = cx; last.z = cz; last.t = 0;
      for (const g of groups.values()) { let nd = 0, nl = 0;
        for (const b of g.list) { const d2 = (b.x - cx) ** 2 + (b.z - cz) ** 2; if (d2 < NEAR * NEAR) { for (const im of g.det) im.setMatrixAt(nd, b.m); nd++; } else if (d2 < FAR * FAR && g.low) g.low.setMatrixAt(nl++, b.m); }
        for (const im of g.det) { im.count = nd; im.instanceMatrix.needsUpdate = true; } if (g.low) { g.low.count = nl; g.low.instanceMatrix.needsUpdate = true; } }
      let built = 0;
      for (const [k, c] of cells) { const d = Math.hypot(c.cx - cx, c.cz - cz);
        if (d < BUILD && !c.meshes && built < 2) { c.meshes = buildCell(THREE, c, mats, scene, rng(k)); built++; }
        else if (d > BUILD + 600 && c.meshes) { for (const m of c.meshes) { scene.remove(m); m.geometry.dispose(); } c.meshes = null; } }
      if (built) last.t = 999; // more to build: next frame
    },
  };
  return H;
}
