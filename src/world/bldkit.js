// Small things buildings repeat, instanced and drawn only near the camera: rooftop package units (a louvred casing on
// rails, its fan shroud and grille on top), satellite dishes on house fascias, turbine vents on house ridges; and the
// trim round the openings (src/world/bldgen.js facadeKit): painted boxes (window surrounds, casings, jambs, gutters,
// downspouts), dark metal ones (storefront mullions, thin modern frames), louvred shutters, iron rejas, balcony rails,
// the trim out to two thirds of the reach. Far away
// the chunk meshes carry a plain box for each rooftop unit (index.html genBuilding); up close the instanced unit sits
// over it, a little bigger, so the box disappears inside it.
// Buildings register their items the first time they're drawn; a 128 m grid holds them; twice a second, once the camera
// has moved or something fell or was rebuilt, the cells within reach fill one InstancedMesh per kind (three draw calls
// in all). A building that is down (B.dead), dropped with its tile (B.gone) or not drawn (B.drawn false) is left out.
//   const KIT = createBldKit(scene, { reach: () => metres })
//   KIT.add(B, items)   items: [{ k: 'hvac' | 'dish' | 'turbine' | 'box' | 'metal' | 'shutter' | 'reja' | 'rail', x, y (bottom), z, ry,
//                       sx, sy, sz, c (0xrrggbb) }]
//   KIT.dirty()         something fell or rose again: refill on the next update
//   KIT.update(x, z, dt)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CELL = 128;
const tint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const part = (g, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { g = g.toNonIndexed(); if (g.attributes.uv) g.deleteAttribute('uv'); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return tint(g, c); };
// unit space: 1 x 1 x 1 casing standing on y = 0, scaled per instance to the unit's size
function hvacGeo() {
  const P = [part(new THREE.BoxGeometry(1.03, 0.96, 1.03), [1, 1, 1], 0, 0.52, 0)];
  for (const s of [-1, 1]) P.push(part(new THREE.BoxGeometry(1.08, 0.06, 0.08), [0.42, 0.42, 0.4], 0, 0.03, s * 0.38)); // the rails
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) P.push(part(new THREE.BoxGeometry(0.9, 0.025, 0.02), [0.62, 0.62, 0.6], 0, 0.22 + k * 0.1, s * 0.522)); // louvres on two faces
  P.push(part(new THREE.CylinderGeometry(0.27, 0.3, 0.12, 16), [0.55, 0.55, 0.53], 0, 1.06, 0)); // the fan shroud
  P.push(part(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 16), [0.08, 0.08, 0.08], 0, 1.125, 0)); // its grille, dark
  P.push(part(new THREE.BoxGeometry(0.3, 0.12, 0.2), [0.85, 0.85, 0.82], 0.25, 1.06, -0.3)); // a service box
  return mergeGeometries(P);
}
function dishGeo() { // a 0.75 m offset dish on an arm, facing +z
  const g = [part(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), [0.3, 0.3, 0.3], 0, 0.25, 0)];
  g.push(part(new THREE.CylinderGeometry(0.37, 0.05, 0.13, 16, 1, true), [0.93, 0.93, 0.92], 0, 0.55, 0.05, Math.PI / 2 - 0.35));
  g.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), [0.93, 0.93, 0.92], 0, 0.55, -0.01, Math.PI / 2 - 0.35));
  g.push(part(new THREE.BoxGeometry(0.02, 0.02, 0.42), [0.3, 0.3, 0.3], 0, 0.42, 0.24, -0.5));
  g.push(part(new THREE.BoxGeometry(0.06, 0.06, 0.1), [0.2, 0.2, 0.2], 0, 0.32, 0.42));
  return mergeGeometries(g);
}
function turbineGeo() { // a whirlybird on its throat
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 10), [0.72, 0.72, 0.7], 0, 0.11, 0),
    part(new THREE.CylinderGeometry(0.15, 0.2, 0.3, 14), [0.8, 0.8, 0.78], 0, 0.37, 0),
    part(new THREE.SphereGeometry(0.155, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0.82, 0.82, 0.8], 0, 0.52, 0),
  ]);
}

function unitBox() { return part(new THREE.BoxGeometry(1, 1, 1), [1, 1, 1], 0, 0.5, 0); } // 1 m, standing on y = 0, scaled per instance
function shutterGeo() { // a louvred shutter 1 x 1 m, 3.5 cm thick: stiles, rails, slats
  const P = [part(new THREE.BoxGeometry(1, 1, 0.015), [0.8, 0.8, 0.8], 0, 0.5, -0.008)];
  for (const x of [-0.45, 0.45]) P.push(part(new THREE.BoxGeometry(0.1, 1, 0.035), [1, 1, 1], x, 0.5, 0));
  for (const y of [0.04, 0.5, 0.96]) P.push(part(new THREE.BoxGeometry(0.8, 0.08, 0.035), [1, 1, 1], 0, y, 0));
  for (let k = 0; k < 16; k++) { const y = 0.1 + k * 0.052 + (k >= 8 ? 0.06 : 0); if (y > 0.92) break; P.push(part(new THREE.BoxGeometry(0.8, 0.045, 0.006), [0.92, 0.92, 0.92], 0, y, 0.004, -0.6)); }
  return mergeGeometries(P);
}
function rejaGeo() { // a wrought-iron window grille 1 x 1 m: bars, two flat rails, a crown of curls
  const P = [];
  for (let k = 0; k < 7; k++) P.push(part(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), [1, 1, 1], -0.45 + k * 0.15, 0.5, 0));
  for (const y of [0.04, 0.55, 0.97]) P.push(part(new THREE.BoxGeometry(1, 0.03, 0.012), [1, 1, 1], 0, y, 0));
  for (let k = 0; k < 6; k++) P.push(part(new THREE.TorusGeometry(0.05, 0.008, 4, 10), [1, 1, 1], -0.375 + k * 0.15, 0.9, 0));
  return mergeGeometries(P);
}
function railGeo() { // a balcony railing 1 m long, 1 m tall: top and bottom rails, pickets
  const P = [part(new THREE.BoxGeometry(1, 0.05, 0.05), [1, 1, 1], 0, 0.975, 0), part(new THREE.BoxGeometry(1, 0.035, 0.03), [1, 1, 1], 0, 0.08, 0)];
  for (let k = 0; k < 9; k++) P.push(part(new THREE.BoxGeometry(0.018, 0.88, 0.018), [1, 1, 1], -0.444 + k * 0.111, 0.52, 0));
  return mergeGeometries(P);
}
export function createBldKit(scene, o = {}) {
  const reach = o.reach || (() => 260), cells = new Map(), key = (i, j) => i * 100003 + j;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 });
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }), iron = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.45 });
  const kinds = { hvac: { geo: hvacGeo(), shadow: true, near: 1 }, dish: { geo: dishGeo(), shadow: false, near: 1 }, turbine: { geo: turbineGeo(), shadow: false, near: 1 },
    box: { geo: unitBox(), shadow: false, near: 0.66, mat: paint }, metal: { geo: unitBox(), shadow: false, near: 0.66, mat: iron }, shutter: { geo: shutterGeo(), shadow: false, near: 0.66, mat: paint },
    reja: { geo: rejaGeo(), shadow: false, near: 0.66, mat: iron }, rail: { geo: railGeo(), shadow: false, near: 0.66, mat: iron } };
  for (const K of Object.values(kinds)) { K.cap = 0; K.mesh = null; }
  const root = new THREE.Group(); root.name = 'BuildingKit'; root.matrixAutoUpdate = false; scene.add(root);
  let dirty = true, lastX = 1e9, lastZ = 1e9, t = 0;
  const K = { stats: { items: 0, shown: 0 }, root };
  K.add = (B, items) => {
    if (!items || !items.length) return; const k = key(Math.floor(B.cx / CELL), Math.floor(B.cz / CELL));
    for (const it of items) { // each item's matrix and colour, worked out once: a refill only copies them
      p.set(it.x, it.y, it.z); q.setFromAxisAngle(up, it.ry || 0); s.set(it.sx || 1, it.sy || 1, it.sz || 1);
      it.m = new Float32Array(m4.compose(p, q, s).elements); col.setHex(it.c ?? 0xd0d0cc); it.r = col.r; it.g = col.g; it.b = col.b;
    }
    let c = cells.get(k); if (!c) cells.set(k, c = []); c.push([B, items]); K.stats.items += items.length; dirty = true;
  };
  K.dirty = () => { dirty = true; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  function fill(x, z) {
    const R = reach(), lists = {}; for (const k in kinds) lists[k] = [];
    for (let i = Math.floor((x - R) / CELL); i <= Math.floor((x + R) / CELL); i++) for (let j = Math.floor((z - R) / CELL); j <= Math.floor((z + R) / CELL); j++) {
      const c = cells.get(key(i, j)); if (!c) continue;
      for (let n = c.length - 1; n >= 0; n--) { // a dropped tile's buildings leave the grid for good
        const [B, items] = c[n]; if (B.gone) { c.splice(n, 1); K.stats.items -= items.length; continue; }
        const d = Math.hypot(B.cx - x, B.cz - z); if (B.dead || !B.drawn || d > R) continue;
        for (const it of items) if (d <= R * kinds[it.k].near) lists[it.k].push(it);
      }
    }
    let shown = 0;
    for (const [k, L] of Object.entries(lists)) {
      const Kd = kinds[k];
      if (L.length > Kd.cap) { // grow: a new mesh twice the size
        if (Kd.mesh) { root.remove(Kd.mesh); Kd.mesh.dispose(); }
        Kd.cap = Math.max(64, 1 << Math.ceil(Math.log2(L.length)));
        Kd.mesh = new THREE.InstancedMesh(Kd.geo, Kd.mat || mat, Kd.cap); Kd.mesh.castShadow = Kd.shadow; Kd.mesh.receiveShadow = true; Kd.mesh.matrixAutoUpdate = false;
        Kd.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Kd.cap * 3), 3); root.add(Kd.mesh);
      }
      if (!Kd.mesh) continue;
      const MA = Kd.mesh.instanceMatrix.array, CA = Kd.mesh.instanceColor.array;
      L.forEach((it, i) => { MA.set(it.m, i * 16); CA[i * 3] = it.r; CA[i * 3 + 1] = it.g; CA[i * 3 + 2] = it.b; });
      Kd.mesh.count = L.length; Kd.mesh.visible = L.length > 0; shown += L.length;
      Kd.mesh.instanceMatrix.needsUpdate = true; Kd.mesh.instanceColor.needsUpdate = true;
      if (L.length) Kd.mesh.computeBoundingSphere();
    }
    root.updateMatrixWorld(true); K.stats.shown = shown;
  }
  K.update = (x, z, dt) => {
    if ((t -= dt) > 0) return; t = 0.5;
    if (!dirty && Math.hypot(x - lastX, z - lastZ) < 24) return;
    dirty = false; lastX = x; lastZ = z; fill(x, z);
  };
  return K;
}
