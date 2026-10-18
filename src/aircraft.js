// Aircraft over Poway: airliners and business jets on the San Diego approaches, small planes and helicopters lower
// down, now and then a pair of fighters out of Miramar; a medevac helicopter parked on a pad at the hospital; and the
// model for the cheat fighter jet. Every flight carries real navigation lights (red left, green right, white strobes,
// red beacon), so at night you see them blink across the sky.
//
// Models: assets/aircraft/*.glb, Poly Pizza, CC BY 3.0 (credits in assets/aircraft/LICENSE.md). About 0.7 MB, fetched
// after the loading screen (index.html loadLater), so nothing here delays "Ready".
//   const AIR = await loadAircraft(THREE, gltfLoader)             // null if nothing loaded
//   makeAircraft(AIR, 'fighter', { center: true })                // Group: nose +z, real size, origin at the middle
//   const sky = createAirTraffic(THREE, scene, AIR, { heightAt, gfx, onFlyby })   sky.update(dt, night, focus)
//   parkAircraft(THREE, scene, AIR, 'heli', x, y, z, rot)          // standing on the ground at (x, y, z)

// len: real length nose to tail (m). yaw turns the file's nose to +z. prop / rotor: how to find the spinning part.
export const AIRCRAFT = {
  airliner: { file: 'airliner.glb', len: 37.6, yaw: 0 },                       // A320-class twinjet
  regional: { file: 'regional.glb', len: 29.9, yaw: 0 },                       // E-Jet-class regional
  bizjet: { file: 'bizjet.glb', len: 20.5, yaw: 0 },                           // mid-size business jet
  cessna: { file: 'cessna.glb', len: 8.3, yaw: Math.PI, prop: 'Propeller' },  // Cessna 172-like high wing
  trainer: { file: 'trainer.glb', len: 8.8, yaw: 0, disc: 1.3 },               // T-6-like trainer (prop baked in: blur disc)
  fighter: { file: 'fighter.glb', len: 15.6, yaw: 0 },                         // F-35-like
  heli: { file: 'heli.glb', len: 12.0, yaw: -Math.PI / 2, rotor: 0.88 },       // Bell 206-like; rotor = flat parts of the top 12%
};

export async function loadAircraft(THREE, loader, base = 'assets/aircraft/') {
  const protos = new Map();
  await Promise.all(Object.entries(AIRCRAFT).map(async ([name, spec]) => {
    try { protos.set(name, normalize(THREE, (await loader.loadAsync(base + spec.file)).scene, spec)); }
    catch (e) { console.warn('[aircraft]', name, e && e.message || e); }
  }));
  return protos.size ? { THREE, protos } : null;
}

// nose +z, real length, centred on x/z, lowest point at y = 0; spinning parts split out; light positions measured
function normalize(THREE, scene, spec) {
  const inner = new THREE.Group(); inner.add(scene); inner.rotation.y = spec.yaw;
  const out = new THREE.Group(); out.add(inner); out.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(out); const k = spec.len / Math.max(1e-6, box.max.z - box.min.z);
  inner.scale.setScalar(k); out.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(out);
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2); out.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(out);
  const parts = [];
  scene.traverse(o => {
    if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { m.side = THREE.DoubleSide; if (m.metalness !== undefined) { m.metalness = Math.max(m.metalness, 0.15); m.roughness = Math.min(m.roughness, 0.55); } }
  });
  // the propeller of the Cessna is its own node: spin it about the nose axis
  if (spec.prop) scene.traverse(o => { if (o.isMesh && o.name.includes(spec.prop)) parts.push({ obj: o, axis: 'z' }); });
  // helicopter: the main rotor is baked into the one mesh. Cut the triangles in its top slice into their own mesh.
  if (spec.rotor) { const ms = []; scene.traverse(o => { if (o.isMesh) ms.push(o); }); const r = splitRotor(THREE, ms, spec.rotor); if (r) parts.push({ obj: r, axis: 'y' }); }
  out.updateMatrixWorld(true);
  // where the lights go: wingtips (outermost vertices), the top of the fin, the tail
  const pts = []; const v = new THREE.Vector3();
  scene.traverse(o => { if (!o.isMesh || o.parent.name === 'rotor') return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 2) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).clone()); });
  let L = pts[0], R = pts[0], top = pts[0], tail = pts[0];
  for (const p of pts) { if (p.x > L.x) L = p; if (p.x < R.x) R = p; if (p.z < tail.z) tail = p; if (p.y > top.y && (!spec.rotor || Math.abs(p.z - box.min.z) < spec.len * 0.3)) top = p; }
  out.userData = { spec, box, parts, lights: { left: L.clone(), right: R.clone(), top: top.clone(), tail: tail.clone() }, disc: spec.disc ? box.max.z : 0 };
  return out;
}

// cut a helicopter's main rotor out of its mesh (glTF primitives become sibling meshes sharing one frame, y up), as
// one group pivoted on the mast. The blades are the flat, long triangles in the top slice (`frac` of the height and
// up), plus the small ones round the hub; the tail fin can stand taller than the rotor, but its triangles are upright
// or short, so they stay behind.
function splitRotor(THREE, meshes, frac) {
  let ylo = 1e9, yhi = -1e9;
  for (const m of meshes) { m.geometry.computeBoundingBox(); ylo = Math.min(ylo, m.geometry.boundingBox.min.y); yhi = Math.max(yhi, m.geometry.boundingBox.max.y); }
  const H = yhi - ylo, yCut = ylo + H * frac;
  let hx = 0, hz = 0, hn = 0; // the mast: vertices just under the cut
  for (const m of meshes) { const P = m.geometry.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y > yCut - H * 0.08 && y < yCut) { hx += P.getX(i); hz += P.getZ(i); hn++; } } }
  if (!hn) return null; hx /= hn; hz /= hn;
  const pivot = new THREE.Group(); pivot.name = 'rotor'; pivot.position.set(hx, yCut, hz);
  for (const m of meshes) {
    const g = m.geometry, P = g.attributes.position, idx = g.index ? g.index.array : null, n = idx ? idx.length : P.count, keep = [], move = [];
    for (let t = 0; t < n; t += 3) {
      const v = [idx ? idx[t] : t, idx ? idx[t + 1] : t + 1, idx ? idx[t + 2] : t + 2];
      let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, near = 1e9;
      for (const i of v) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); near = Math.min(near, Math.hypot(x - hx, z - hz)); }
      (y0 > yCut && y1 - y0 < H * 0.03 && (Math.max(x1 - x0, z1 - z0) > H * 0.25 || near < H * 0.15) ? move : keep).push(v[0], v[1], v[2]);
    }
    if (!move.length) continue;
    const kg = g.clone(); kg.setIndex(keep); m.geometry = kg;
    const rg = g.clone(); rg.setIndex(move); rg.translate(-hx, -yCut, -hz);
    const r = new THREE.Mesh(rg, m.material); r.castShadow = true; pivot.add(r);
  }
  if (!pivot.children.length) return null;
  meshes[0].parent.add(pivot); return pivot;
}

// a ready-to-place copy: { g, spin(dt, rate) }. center: origin at the middle of the bounding box instead of the wheels
export function makeAircraft(AIR, name, o = {}) {
  const P = AIR && AIR.protos.get(name); if (!P) return null;
  const THREE = AIR.THREE, g = new THREE.Group(), body = P.clone(true); g.add(body);
  const box = P.userData.box; if (o.center) body.position.y = -(box.min.y + box.max.y) / 2;
  // the clone's spinning parts, matched by path from the prototype
  const spinners = P.userData.parts.map(pt => ({ obj: findClone(P, body, pt.obj), axis: pt.axis })).filter(s => s.obj);
  let disc = null;
  if (P.userData.disc) { // baked-in propeller: a faint blur disc in front of it when it turns
    disc = new THREE.Mesh(new THREE.CircleGeometry(P.userData.spec.disc, 24), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    disc.position.set(0, (box.min.y + box.max.y) / 2 + 0.15, box.max.z + 0.05); disc.visible = false; body.add(disc);
  }
  g.userData = { name, box, lights: P.userData.lights, body };
  return { g, body, box, spin(dt, rate) { for (const s of spinners) s.obj.rotation[s.axis] += dt * rate; if (disc) disc.visible = rate > 0; } };
}
function findClone(src, dst, obj) {
  const path = []; for (let o = obj; o && o !== src; o = o.parent) path.unshift(o.parent.children.indexOf(o));
  let d = dst; for (const i of path) { d = d && d.children[i]; } return d || null;
}

// ---------------------------------------------------------------- navigation lights
function glowTexture(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.85)'); r.addColorStop(0.45, 'rgba(255,255,255,0.18)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function navLights(THREE, tex, craft) {
  const L = craft.g.userData.lights, mk = (col, p) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false }));
    s.position.copy(p); craft.body.add(s); return s;
  };
  return { left: mk(0xff2a1a, L.left), right: mk(0x2aff5a, L.right), strobeL: mk(0xffffff, L.left), strobeR: mk(0xffffff, L.right), beacon: mk(0xff3010, L.top), tail: mk(0xffffff, L.tail) };
}
function setLights(nl, t, night, phase) {
  const k = 0.25 + night * 0.75, sz = 0.0045 + night * 0.006;
  for (const s of [nl.left, nl.right, nl.tail]) { s.material.opacity = k * 0.9; s.scale.setScalar(sz); }
  const st = (t + phase) % 1.2, flash = st < 0.06 || (st > 0.16 && st < 0.22) ? 1 : 0; // double flash
  for (const s of [nl.strobeL, nl.strobeR]) { s.material.opacity = flash; s.scale.setScalar(sz * 1.6); }
  const bc = 0.5 + 0.5 * Math.sin((t + phase) * Math.PI * 2); nl.beacon.material.opacity = k * bc * bc; nl.beacon.scale.setScalar(sz * 1.2);
}

// ---------------------------------------------------------------- ambient traffic
// alt: metres above the ground under the player; spd: m/s; head: preferred heading (radians, 0 = +z = south in game
// coordinates) or null for any. San Diego and Miramar are to the south-west, so the jets mostly fly that way.
const KINDS = [
  { models: ['airliner', 'regional'], w: 0.36, alt: [650, 950], spd: [72, 92], head: -2.4, spread: 0.5, gear: false },
  { models: ['bizjet'], w: 0.1, alt: [550, 800], spd: [80, 100], head: -2.4, spread: 0.9 },
  { models: ['cessna', 'trainer'], w: 0.26, alt: [230, 420], spd: [45, 62], wander: 0.05, prop: 60 },
  { models: ['heli'], w: 0.16, alt: [110, 220], spd: [32, 52], wander: 0.08, rotor: 38 },
  { models: ['fighter'], w: 0.12, alt: [280, 480], spd: [170, 230], pair: true, head: -2.0, spread: 1.2, loud: true },
];
export function createAirTraffic(THREE, scene, AIR, o = {}) {
  const tex = glowTexture(THREE), flights = [];
  const cap = { potato: 1, low: 2, medium: 3, high: 4, ultra: 5 }[o.gfx] || 3;
  let wait = 6, t = 0; // the first one shows up soon after you start playing
  const rand = (a, b) => a + Math.random() * (b - a);
  function pick() {
    let r = Math.random() * KINDS.reduce((a, k) => a + k.w, 0);
    for (const k of KINDS) { r -= k.w; if (r <= 0) return k; } return KINDS[0];
  }
  function spawn(f) {
    const K = pick(), avail = K.models.filter(m => AIR.protos.has(m)); if (!avail.length) return;
    const head = K.head == null ? rand(-Math.PI, Math.PI) : K.head + rand(-1, 1) * K.spread;
    const dx = Math.sin(head), dz = Math.cos(head), off = rand(-550, 550), L = 2700;
    const sx = f.x - dx * L - dz * off, sz = f.z - dz * L + dx * off;
    let gmax = 0; for (let s = 0; s <= 1; s += 0.1) gmax = Math.max(gmax, o.heightAt(sx + dx * L * 2 * s, sz + dz * L * 2 * s));
    const y = Math.max(o.heightAt(f.x, f.z) + rand(K.alt[0], K.alt[1]), gmax + K.alt[0] * 0.6), spd = rand(K.spd[0], K.spd[1]);
    const n = K.pair ? 2 : 1, name = avail[Math.floor(Math.random() * avail.length)];
    for (let i = 0; i < n; i++) {
      const c = makeAircraft(AIR, name, { center: true }); if (!c) return;
      c.g.traverse(m => { if (m.isMesh) m.castShadow = false; }); // too high to shadow anything worth the cost
      const nl = navLights(THREE, tex, c);
      // the wingman flies 60 m back and 40 m out
      const px = sx - dx * 60 * i + dz * 40 * i, pz = sz - dz * 60 * i - dx * 40 * i;
      const fl = { K, c, nl, x: px, y: y + i * 8, z: pz, head, spd, turn: 0, age: 0, phase: Math.random(), bank: 0, near: false };
      c.g.position.set(px, fl.y, pz); scene.add(c.g); flights.push(fl);
    }
  }
  function remove(i) { const fl = flights[i]; scene.remove(fl.c.g); fl.c.g.traverse(m => { if (m.isSprite) m.material.dispose(); }); flights.splice(i, 1); }
  return {
    flights,
    update(dt, night, f) {
      t += dt; wait -= dt;
      if (wait <= 0 && f) { wait = rand(22, 48); if (flights.length < cap) spawn(f); }
      for (let i = flights.length - 1; i >= 0; i--) {
        const fl = flights[i]; fl.age += dt;
        if (fl.K.wander) { // small planes and helicopters drift into gentle turns
          if (Math.random() < dt * 0.15) fl.turnT = rand(-1, 1) * fl.K.wander;
          fl.turn += ((fl.turnT || 0) - fl.turn) * Math.min(1, dt * 0.5); fl.head += fl.turn * dt;
        }
        const dx = Math.sin(fl.head), dz = Math.cos(fl.head);
        fl.x += dx * fl.spd * dt; fl.z += dz * fl.spd * dt;
        const gy = o.heightAt(fl.x + dx * 300, fl.z + dz * 300); if (fl.y < gy + fl.K.alt[0] * 0.5) fl.y += Math.min(8 * dt, gy + fl.K.alt[0] * 0.5 - fl.y); // climb over hills
        fl.bank += (Math.max(-0.45, Math.min(0.45, -fl.turn * fl.spd / 9.8)) - fl.bank) * Math.min(1, dt * 1.5);
        const g = fl.c.g; g.position.set(fl.x, fl.y, fl.z); g.rotation.set(fl.K.rotor ? 0.08 : 0, fl.head, fl.bank, 'YXZ');
        fl.c.spin(dt, fl.K.rotor || fl.K.prop || 0);
        setLights(fl.nl, t, night, fl.phase);
        if (f) {
          const d = Math.hypot(fl.x - f.x, fl.z - f.z), dd = Math.hypot(d, fl.y - (f.y || 0));
          if (fl.K.loud && !fl.near && dd < 600 && o.onFlyby) { fl.near = true; o.onFlyby(fl, dd); }
          if ((d > 3200 && fl.age > 20) || fl.age > 240) remove(i);
        }
      }
    },
    clear() { for (let i = flights.length - 1; i >= 0; i--) remove(i); },
  };
}

// ---------------------------------------------------------------- parked
// standing on its wheels or skids at (x, y, z), facing `rot`. Returns the aircraft ({ g, ... }).
export function parkAircraft(THREE, scene, AIR, name, x, y, z, rot) {
  const c = makeAircraft(AIR, name); if (!c) return null;
  c.g.position.set(x, y, z); c.g.rotation.y = rot; c.g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  scene.add(c.g); return c;
}
// a painted helipad: a 20 m concrete circle with a white ring and an H
export function helipad(THREE, scene, x, y, z, rot) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#9a9a96'; g.beginPath(); g.arc(128, 128, 127, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f2f2ee'; g.lineWidth = 9; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#c8102e'; g.beginPath(); g.arc(128, 128, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f2f2ee'; g.fillRect(92, 76, 18, 104); g.fillRect(146, 76, 18, 104); g.fillRect(92, 119, 72, 18);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.CircleGeometry(10, 40), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
  m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, y + 0.04, z); m.receiveShadow = true; scene.add(m); return m;
}
