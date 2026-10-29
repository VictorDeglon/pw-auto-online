// What the sea leaves on a beach, placed with the beach props round you (src/world/water.js createBeach): tangles of
// kelp (giant kelp's dark olive-brown blades and air bladders), cobbles and chips of rock, shells and bleached
// driftwood, heaped in drifts along the high-tide line and scattered thinner up the beach. In the swash zone they move
// with the waves: each run-up nudges them up the sand and the backwash drags them back down.
//   const W = createWrack(THREE, parent)
//   W.place(fieldAt, groundAt, sea, cells, cell, seed)    fieldAt(x, z): metres to the waterline (+ sea, - land);
//                                                         cells: [x, z, ...] corners of the field cells along the tide
//   W.update(t, waveAt)                                    waveAt(x, z, t) -> { crest } (src/world/water.js)
const TAU = Math.PI * 2;

function rng(seed) { let s = seed % 2147483646 + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// a few blades of kelp lying on the sand, wandering, with the round air bladders on their stipes
function kelpGeometry(THREE, r) {
  const P = [], C = [], I = [];
  const blades = 5 + Math.floor(r() * 5);
  for (let b = 0; b < blades; b++) {
    let x = (r() - 0.5) * 0.3, z = (r() - 0.5) * 0.3, a = r() * TAU;
    const L = 0.5 + r() * 1.1, n = 10, w = 0.05 + r() * 0.06, tone = 0.75 + r() * 0.5, base = P.length / 3;
    for (let k = 0; k <= n; k++) {
      const u = k / n, wd = w * (0.35 + Math.sin(Math.PI * Math.min(1, u * 1.2)) * 0.65), y = 0.012 + 0.03 * Math.sin(u * 7 + b) * Math.sin(u * Math.PI);
      const nx = -Math.sin(a), nz = Math.cos(a);
      P.push(x + nx * wd, y, z + nz * wd, x - nx * wd, y + 0.004, z - nz * wd);
      const c = [0.19 * tone, 0.13 * tone, 0.05 * tone]; C.push(...c, ...c.map(v => v * 0.85)); // giant kelp: dark olive-brown
      if (k < n) I.push(base + k * 2, base + k * 2 + 1, base + k * 2 + 2, base + k * 2 + 1, base + k * 2 + 3, base + k * 2 + 2);
      a += (r() - 0.5) * 0.7; x += Math.cos(a) * L / n; z += Math.sin(a) * L / n;
    }
    if (r() < 0.6) { // a bladder near the base of the blade
      const s = new THREE.IcosahedronGeometry(0.018 + r() * 0.016, 0), p = s.attributes.position, o = P.length / 3;
      const bx = P[base * 3], bz = P[base * 3 + 2];
      for (let k = 0; k < p.count; k++) { P.push(p.getX(k) + bx, p.getY(k) + 0.025, p.getZ(k) + bz); C.push(0.3, 0.26, 0.1); }
      const ix = s.index ? s.index.array : [...Array(p.count).keys()]; for (const v of ix) I.push(o + v);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}
// a stone: an icosahedron pushed about and flattened (cobbles round and smooth, chips flat and sharp)
function stoneGeometry(THREE, r, detail, flat) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
  for (let k = 0; k < p.count; k++) { const f = 0.8 + r() * 0.35; p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * flat, p.getZ(k) * f * (0.7 + r() * 0.3)); }
  g.translate(0, flat * 0.55, 0); g.computeVertexNormals(); return g;
}
// a scallop-like shell: a ribbed fan, cupped
function shellGeometry(THREE) {
  const P = [0, 0.004, 0], I = [], n = 9;
  for (let k = 0; k <= n; k++) { const a = -0.95 + 1.9 * k / n, rib = 1 + 0.06 * (k % 2); P.push(Math.sin(a) * rib, 0.004 + 0.18 * Math.cos(a * 1.4) * 0.5, Math.cos(a) * rib); if (k) I.push(0, k, k + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}
// bleached driftwood: a crooked, tapering log with a broken branch
function driftGeometry(THREE) {
  const g = new THREE.CylinderGeometry(0.045, 0.075, 1, 7, 6).rotateZ(Math.PI / 2), p = g.attributes.position;
  for (let k = 0; k < p.count; k++) { const x = p.getX(k); p.setY(k, p.getY(k) + 0.06 * Math.sin(x * 5.0) + 0.06); p.setZ(k, p.getZ(k) + 0.08 * Math.sin(x * 3.1 + 1)); }
  const br = new THREE.CylinderGeometry(0.018, 0.03, 0.35, 5).rotateZ(0.9).translate(0.18, 0.14, 0.04);
  const m = new THREE.BufferGeometry(), a = g.toNonIndexed(), b = br.toNonIndexed();
  const pos = new Float32Array(a.attributes.position.count * 3 + b.attributes.position.count * 3); pos.set(a.attributes.position.array); pos.set(b.attributes.position.array, a.attributes.position.array.length);
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.computeVertexNormals(); return m;
}

export function createWrack(THREE, parent) {
  const grp = new THREE.Group(); grp.name = 'wrack'; parent.add(grp);
  const r0 = rng(4141);
  const KINDS = [ // geometry, material, how many at most, size range (m)
    { geo: kelpGeometry(THREE, r0), mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, side: THREE.DoubleSide }), max: 220, size: [0.8, 1.5] },
    { geo: kelpGeometry(THREE, r0), mat: null, max: 220, size: [0.8, 1.5] },
    { geo: stoneGeometry(THREE, r0, 1, 0.6), mat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), max: 700, size: [0.05, 0.2] }, // cobbles
    { geo: stoneGeometry(THREE, r0, 0, 0.28), mat: null, max: 900, size: [0.018, 0.06] },                                                // chips
    { geo: shellGeometry(THREE), mat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide }), max: 400, size: [0.02, 0.045] },
    { geo: driftGeometry(THREE), mat: new THREE.MeshStandardMaterial({ color: 0x9d968a, roughness: 0.95 }), max: 60, size: [0.7, 2.4] },
  ];
  KINDS[1].mat = KINDS[0].mat; KINDS[3].mat = KINDS[2].mat;
  for (const K of KINDS) {
    K.mesh = new THREE.InstancedMesh(K.geo, K.mat, K.max); K.mesh.count = 0; K.mesh.castShadow = K.max < 300; K.mesh.receiveShadow = true; K.mesh.frustumCulled = false;
    K.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(K.max * 3).fill(1), 3); grp.add(K.mesh);
  }
  const moving = []; // [kind, index, x, y, z, rot, scale, sea dir x, z, reach]
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler(), col = new THREE.Color();
  const put = (K, i, x, y, z, rot, s, tilt) => { e.set(tilt, rot, tilt * 0.6); q.setFromEuler(e); m4.compose(v.set(x, y, z), q, sc.setScalar(s)); K.mesh.setMatrixAt(i, m4); };
  return {
    group: grp,
    place(fieldAt, groundAt, sea, cells, cell, seed) {
      const r = rng(seed); moving.length = 0; for (const K of KINDS) K.mesh.count = 0;
      const clump = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.043 + Math.sin(z * 0.031) * 2.1) * Math.sin(z * 0.037 + Math.cos(x * 0.029) * 1.7);
      const dirAt = (x, z) => { const gx = fieldAt(x + 2, z) - fieldAt(x - 2, z), gz = fieldAt(x, z + 2) - fieldAt(x, z - 2), l = Math.hypot(gx, gz) || 1; return [gx / l, gz / l]; }; // toward the sea
      const per = 36, total = cells.length / 2 * per;
      for (let n = 0; n < total; n++) {
        const c = Math.floor(n / per) * 2, x = cells[c] + r() * cell, z = cells[c + 1] + r() * cell, s = fieldAt(x, z);
        if (s < -30 || s > 1.5) continue;
        const h = groundAt(x, z); if (h === null || h === undefined || h > sea + 5) continue;
        // the drift line: thickest a dozen metres up from the water, a second thinner one higher up; the swash zone
        const line = Math.exp(-(((s + 13) / 4) ** 2)) + 0.45 * Math.exp(-(((s + 22) / 3) ** 2)), swash = s > -6 ? 0.55 : 0, k = clump(x, z);
        const want = (line + swash) * (0.25 + 1.2 * k * k); if (r() > want * 0.5) continue;
        const pick = r(), ki = pick < 0.3 ? (r() < 0.5 ? 0 : 1) : pick < 0.55 ? 3 : pick < 0.72 ? 2 : pick < 0.95 ? 4 : 5;
        const K = KINDS[ki]; if (K.mesh.count >= K.max) continue;
        const i = K.mesh.count++, sz = K.size[0] + r() * (K.size[1] - K.size[0]), rot = r() * TAU, y = h - (ki === 2 ? sz * 0.25 : ki === 5 ? 0.04 : 0.005);
        put(K, i, x, y, z, rot, sz, ki >= 2 && ki <= 4 ? (r() - 0.5) * 0.5 : 0);
        if (ki === 0 || ki === 1) col.setRGB(0.8 + r() * 0.5, 0.8 + r() * 0.4, 0.7 + r() * 0.5);                  // kelp: fresh dark brown to sun-dried olive
        else if (ki === 2 || ki === 3) { const g = 0.45 + r() * 0.4; col.setRGB(g * (1 + r() * 0.15), g * 0.95, g * (0.82 + r() * 0.12)); } // granite and sandstone
        else if (ki === 4) { const w = 0.85 + r() * 0.15; col.setRGB(w, w * (0.88 + r() * 0.1), w * (0.78 + r() * 0.15)); }              // cream to pink shells
        else col.setRGB(1, 1, 1);
        K.mesh.setColorAt(i, col);
        if (s > -7 && ki !== 5) { const [dx, dz] = dirAt(x, z); moving.push([ki, i, x, y, z, rot, sz, dx, dz, 0.4 + 0.9 * Math.min(1, (s + 7) / 6)]); }
      }
      for (const K of KINDS) { K.mesh.instanceMatrix.needsUpdate = true; K.mesh.instanceColor.needsUpdate = true; }
    },
    update(t, waveAt) {
      if (!moving.length) return;
      const dirty = new Set();
      for (const M of moving) { // run-up pushes it up the beach, the backwash drags it down; a small turn as it slides
        const [ki, i, x, y, z, rot, sz, dx, dz, reach] = M, c = waveAt(x, z, t).crest, o = (0.5 - c) * reach;
        put(KINDS[ki], i, x + dx * o, y, z + dz * o, rot + o * 0.25, sz, 0); dirty.add(ki);
      }
      for (const ki of dirty) KINDS[ki].mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
