// Tyre marks: dark rubber laid on the road where a tyre slides (a drift, a locked-up stop, a burnout), for every car on
// screen, other players' too, so a drift leaves the same marks for everyone watching. One mesh, a ring of quads that
// overwrites its oldest, each fading out over LIFE seconds; drawn a hair over the asphalt.
//   const SK = createSkids(THREE, scene, { max, life })
//   SK.mark(key, x, y, z, width, k)   tyre `key` (a car and wheel) is sliding here: a quad from where it last was
//   SK.lift(key)                       that tyre is rolling again: the next mark starts fresh
//   SK.update(t)                       t: seconds (any steady clock)
export function createSkids(THREE, scene, o = {}) {
  const MAX = o.max || 3000, LIFE = o.life || 45, LIFT = 0.025;
  const pos = new Float32Array(MAX * 4 * 3), born = new Float32Array(MAX * 4 * 2), idx = new Uint32Array(MAX * 6);
  for (let i = 0; i < MAX; i++) { const v = i * 4; idx.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], i * 6); } // facing up
  born.fill(-1e6);
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), ba = new THREE.BufferAttribute(born, 2).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa); geo.setAttribute('aBorn', ba); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7); // the marks are all over town: never culled
  const U = { uT: { value: 0 }, uLife: { value: LIFE } };
  const mat = new THREE.MeshBasicMaterial({ color: 0x0b0b0b, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -16 }); // over the asphalt and the campus paving and paint (-4, -8)
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec2 aBorn; uniform float uT; uniform float uLife; varying float vA;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vA = aBorn.y * clamp(1.0 - (uT - aBorn.x) / uLife, 0.0, 1.0);');
    sh.fragmentShader = 'varying float vA;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.a *= vA;');
  };
  mat.customProgramCacheKey = () => 'skids';
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.name = 'Tyre marks';
  scene.add(mesh);
  const last = new Map(); let head = 0, lo = MAX, hi = -1;
  function mark(key, x, y, z, w, k) {
    const p = last.get(key);
    if (!p) { last.set(key, { x, y, z }); return; }
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.3) return; // a quad every 30 cm or so
    if (d > 4) { p.x = x; p.y = y; p.z = z; return; } // a jump (a teleport, a long frame): no streak across it
    const sx = -dz / d * w / 2, sz = dx / d * w / 2, i = head, v = i * 4 * 3;
    pos.set([p.x + sx, p.y + LIFT, p.z + sz, p.x - sx, p.y + LIFT, p.z - sz, x + sx, y + LIFT, z + sz, x - sx, y + LIFT, z - sz], v);
    const a = Math.max(0.15, Math.min(0.85, k)); born.set([U.uT.value, a, U.uT.value, a, U.uT.value, a, U.uT.value, a], i * 8);
    lo = Math.min(lo, i); hi = Math.max(hi, i); head = (head + 1) % MAX;
    p.x = x; p.y = y; p.z = z;
  }
  function lift(key) { last.delete(key); }
  function update(t) {
    U.uT.value = t;
    if (hi < 0) return;
    pa.clearUpdateRanges ? pa.clearUpdateRanges() : 0; ba.clearUpdateRanges ? ba.clearUpdateRanges() : 0;
    if (pa.addUpdateRange) { pa.addUpdateRange(lo * 12, (hi - lo + 1) * 12); ba.addUpdateRange(lo * 8, (hi - lo + 1) * 8); }
    else { pa.updateRange = { offset: lo * 12, count: (hi - lo + 1) * 12 }; ba.updateRange = { offset: lo * 8, count: (hi - lo + 1) * 8 }; }
    pa.needsUpdate = true; ba.needsUpdate = true; lo = MAX; hi = -1;
  }
  return { mark, lift, update, mesh };
}
