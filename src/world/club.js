// The Velvet Javelina: a cabaret lounge on open ground by the Carmel Mountain Plaza club strip, and the one building
// you can walk into. Dark stucco, a neon sign over a canopy, a doorman by the velvet rope. Inside: a stage with dancers
// in their show outfits, a DJ, a bar with its bartender and regulars, booths and high-tops, stage lights cutting through
// the haze. Everyone keeps their clothes on (the dancers are in party outfits, dancing).
// It's lit by what glows (neon, strips, the bar's shelf, beams): no real lights, which would recompile every shader in
// the game. Inside, the roof stops drawing (it still shades the room) so the camera can see. The people load only when
// you come near.
//   const CLUB = buildClub(H)   CLUB.update(dt, focus, night)   CLUB.at -> { x, z }
// H: { THREE, scene, heightAt, addPoly, ensureAvatar, makeHuman, animHuman, notify }
export const CLUB_AT = { x: -4339, z: -2437.7, rot: -1.866 }; // found clear of buildings, roads and parks, facing its street
const W = 24, DP = 18, HT = 6, DOOR = 2.6;
const CAST = [ // who's in, where (local metres: +z is the front door), doing what
  { a: 'Female_Party_01', x: -2.6, z: -6.6, y: 0.8, ry: 0, m: 'dance', t: 0 },
  { a: 'Female_Party_02', x: 0.2, z: -6.9, y: 0.8, ry: 0, m: 'dance', t: 1.7 },
  { a: 'Female_Adult_12', x: 2.9, z: -6.6, y: 0.8, ry: 0, m: 'dance', t: 3.1 },
  { a: 'Male_Adult_05~a0000200032', x: 6.4, z: -5.6, y: 0, ry: 0.5, m: 'dance', t: 0.6, dj: true }, // headphones round his neck (src/wardrobe.js)
  { a: 'Business_Male_03', x: -10.9, z: -1.5, y: 0, ry: Math.PI / 2, m: 'talk2', t: 0 },
  { a: 'Business_Male_04~a0010000034', x: 3.0, z: 10.6, y: 0, ry: 0, m: 'idle', t: 0, door: true }, // the doorman: shades, broad (no reserved skins: src/reserved.js)
  { a: 'Male_Adult_02', x: -2.0, z: -2.2, y: 0, ry: Math.PI, m: 'cheer', t: 0.4 },
  { a: 'Female_Adult_08', x: -0.6, z: -2.6, y: 0, ry: Math.PI, m: 'cheer', t: 1.2 },
  { a: 'Male_Adult_09', x: 1.4, z: -2.4, y: 0, ry: Math.PI + 0.2, m: 'laugh', t: 0.2 },
  { a: 'Business_Female_02', x: -8.6, z: -0.3, y: 0, ry: -Math.PI / 2, m: 'talk', t: 0.9 },
  { a: 'Male_Adult_14', x: -8.6, z: 1.6, y: 0, ry: -Math.PI / 2, m: 'listen', t: 0.3 },
  { a: 'Female_Adult_14', x: 4.6, z: 1.8, y: 0, ry: -2.4, m: 'talk', t: 2.2 },
  { a: 'Male_Adult_11', x: 5.6, z: 0.9, y: 0, ry: 0.8, m: 'laugh', t: 1.4 },
];

export function buildClub(H) {
  const { THREE } = H, A = CLUB_AT, c = Math.cos(A.rot), s = Math.sin(A.rot);
  const world = (lx, lz) => [A.x + lx * c + lz * s, A.z - lx * s + lz * c]; // local metres -> world, as rotation.y = rot does it
  // a flat pad at the footprint's highest point; walls run down past the lowest so a slope never shows a gap
  let hi = -1e9, lo = 1e9; for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) { const [x, z] = world(u * W / 2, v * DP / 2), h = H.heightAt(x, z); hi = Math.max(hi, h); lo = Math.min(lo, h); }
  const y0 = hi + 0.12, sink = y0 - lo + 0.6;
  const g = new THREE.Group(); g.position.set(A.x, y0, A.z); g.rotation.y = A.rot; H.scene.add(g);
  const M = (o) => new THREE.MeshStandardMaterial(o);
  const glow = (hex, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });
  const stucco = M({ color: 0x3a2b33, roughness: 0.92 }), trim = M({ color: 0x1a1517, roughness: 0.6, metalness: 0.2 });
  const velvet = M({ color: 0x3a0f1c, roughness: 0.95, emissive: 0x16050b, emissiveIntensity: 1, envMapIntensity: 0.2 }), floorM = M({ color: 0x120e14, roughness: 0.55, metalness: 0, emissive: 0x0b0610, envMapIntensity: 0.15 });
  const box = (w, h, d, m, x, y, z, parent = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const polys = [];
  const solid = (lx0, lz0, lx1, lz1, top) => { // an axis-aligned local box that blocks people and cars
    const P = []; for (const [u, v] of [[lx0, lz0], [lx1, lz0], [lx1, lz1], [lx0, lz1]]) P.push(...world(u, v)); polys.push(H.addPoly(P, y0 - sink, y0 + top));
  };
  // ---- the shell: stucco outside, velvet inside, a door in the middle of the front
  const T = 0.3, side = (W - DOOR) / 2;
  for (const [w, d, x, z] of [[W, T, 0, -DP / 2], [T, DP, -W / 2, 0], [T, DP, W / 2, 0], [side, T, -(DOOR + side) / 2, DP / 2], [side, T, (DOOR + side) / 2, DP / 2]]) {
    box(w, HT + sink, d, stucco, x, (HT - sink) / 2, z);
    solid(x - w / 2, z - d / 2, x + w / 2, z + d / 2, HT);
  }
  box(DOOR, HT - 3.2, T, stucco, 0, 3.2 + (HT - 3.2) / 2, DP / 2); // over the door
  for (const [w, d, x, z] of [[W - 0.7, 0.04, 0, -DP / 2 + 0.17], [0.04, DP - 0.7, -W / 2 + 0.17, 0], [0.04, DP - 0.7, W / 2 - 0.17, 0], [side - 0.3, 0.04, -(DOOR + side) / 2, DP / 2 - 0.17], [side - 0.3, 0.04, (DOOR + side) / 2, DP / 2 - 0.17]])
    box(w, HT - 0.1, d, velvet, x, HT / 2, z);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.6, DP - 0.6), floorM); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; floor.receiveShadow = true; g.add(floor);
  const roofM = trim.clone(), roof = box(W + 0.4, 0.35, DP + 0.4, roofM, 0, HT + 0.17, 0); // inside, it stops drawing but still shades the room
  // a paved apron out front, a slab deep enough to meet the ground where it falls away
  box(W + 6, 1.6, 10, M({ color: 0x3b3a39, roughness: 0.95 }), 0, -0.79, DP / 2 + 5);
  box(W + 0.5, 0.5, 0.5, trim, 0, HT + 0.1, DP / 2 + 0.05); // parapet cap along the front
  // ---- out front: a canopy over the door, the sign, the rope
  box(5.4, 0.22, 2.6, trim, 0, 3.55, DP / 2 + 1.3);
  box(5.4, 0.04, 0.04, glow('#ff3fa4', 2.2), 0, 3.44, DP / 2 + 2.6); // a neon tube along the canopy's edge
  for (const x of [-2.5, 2.5]) box(0.12, 3.5, 0.12, trim, x, 1.75, DP / 2 + 2.5);
  const sign = signTex(THREE), signMat = new THREE.MeshBasicMaterial({ map: sign, transparent: true, toneMapped: false, depthWrite: false });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), signMat); signMesh.position.set(0, 4.75, DP / 2 + 0.2); g.add(signMesh);
  const brass = M({ color: 0xc9a14a, roughness: 0.3, metalness: 1 }), rope = M({ color: 0x8a0f24, roughness: 0.7 });
  for (const x of [1.9, 4.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, 1.0, 12), brass); p.position.set(x, 0.5, DP / 2 + 1.6); g.add(p); const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), brass); b.position.set(x, 1.03, DP / 2 + 1.6); g.add(b); }
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(1.9, 0.95, DP / 2 + 1.6), new THREE.Vector3(3.05, 0.62, DP / 2 + 1.6), new THREE.Vector3(4.2, 0.95, DP / 2 + 1.6)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.025, 6), rope));
  // ---- the stage: black gloss, a light strip along its lip, a pleated curtain, a truss of cans and their beams
  box(10, 0.8, 4, M({ color: 0x0c0a0d, roughness: 0.15, metalness: 0.3 }), 0, 0.4, -DP / 2 + 2.15); solid(-5, -DP / 2, 5, -DP / 2 + 4.15, 0.8);
  box(10, 0.05, 0.05, glow('#ff4fd8', 2), 0, 0.8, -DP / 2 + 4.17);
  box(10, 0.04, 0.04, glow('#5ad8ff', 1.6), 0, 0.06, -DP / 2 + 4.2);
  const cur = new THREE.PlaneGeometry(11, 5.3, 64, 1), cp = cur.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 9) * 0.07); cur.computeVertexNormals();
  const curtain = new THREE.Mesh(cur, M({ color: 0x6a0c1e, roughness: 0.9, emissive: 0x2a0410, side: THREE.DoubleSide })); curtain.position.set(0, 0.8 + 2.65, -DP / 2 + 0.4); g.add(curtain);
  box(11, 0.18, 0.18, trim, 0, 5.3, -DP / 2 + 4.6); // the truss
  const BEAM = ['#ff4fd8', '#8a5cff', '#ffb347', '#5ad8ff'], beams = [];
  BEAM.forEach((col, i) => {
    const x = -4.2 + i * 2.8, can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.36, 12), trim); can.position.set(x, 5.05, -DP / 2 + 4.6); can.rotation.x = 0.55; g.add(can);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.4, 20, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    cone.position.set(x, 3.0, -DP / 2 + 3.4); cone.rotation.x = -0.55; g.add(cone); beams.push(cone);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); spot.rotation.x = -Math.PI / 2; spot.position.set(x, 0.82, -DP / 2 + 2.2); g.add(spot); beams.push(spot);
  });
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 2), M({ color: 0xdfe4ea, roughness: 0.05, metalness: 1, flatShading: true })); ball.position.set(0, 5.1, 0); g.add(ball);
  // ---- the DJ's booth, stage right
  box(2.4, 1.15, 1.0, trim, 6.4, 0.575, -4.6); solid(5.2, -5.1, 7.6, -4.1, 1.15);
  box(2.3, 0.5, 0.02, new THREE.MeshBasicMaterial({ map: eqTex(THREE), toneMapped: false }), 6.4, 0.6, -4.09);
  for (const x of [5.9, 6.9]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20), trim); d.position.set(x, 1.18, -4.6); g.add(d); }
  // ---- the bar along the left wall: counter, a back shelf glowing behind the bottles, stools
  const wood = M({ color: 0x2b1810, roughness: 0.4 });
  box(1.0, 1.1, 9, wood, -W / 2 + 3.2, 0.55, -1); box(1.2, 0.06, 9.2, M({ color: 0x0f0f12, roughness: 0.08, metalness: 0.4 }), -W / 2 + 3.2, 1.13, -1); solid(-W / 2 + 2.7, -5.5, -W / 2 + 3.7, 3.5, 1.1);
  box(0.4, 2.2, 9, trim, -W / 2 + 0.55, 1.9, -1); box(0.05, 2.0, 8.8, glow('#ffb35a', 0.9), -W / 2 + 0.77, 1.9, -1);
  const bottle = new THREE.CylinderGeometry(0.04, 0.045, 0.3, 8), bm = new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 });
  const bottles = new THREE.InstancedMesh(bottle, bm, 66), mm = new THREE.Matrix4(), BC = ['#7a4a12', '#2e5a2a', '#c8d6d8', '#5a1018', '#b5832b'];
  for (let i = 0; i < 66; i++) { const row = i % 3, k = Math.floor(i / 3); mm.makeTranslation(-W / 2 + 0.95, 1.2 + row * 0.62, -5.2 + k * 0.4); bottles.setMatrixAt(i, mm); bottles.setColorAt(i, new THREE.Color(BC[(i * 7) % BC.length])); }
  g.add(bottles);
  for (let i = 0; i < 6; i++) { const z = -4.6 + i * 1.45, st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.2, 0.75, 10), trim); st.position.set(-W / 2 + 4.2, 0.375, z); g.add(st); const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16), rope); seat.position.set(-W / 2 + 4.2, 0.79, z); g.add(seat); }
  // ---- booths on the right, high-tops in the middle
  const sofa = M({ color: 0x4a0d1d, roughness: 0.75 });
  for (const z of [-0.5, 3.5]) { box(1.0, 1.0, 3.2, sofa, W / 2 - 0.85, 0.5, z); box(2.4, 0.5, 0.8, sofa, W / 2 - 2.0, 0.25, z - 1.4); box(2.4, 0.5, 0.8, sofa, W / 2 - 2.0, 0.25, z + 1.4); box(1.0, 0.72, 1.4, wood, W / 2 - 2.2, 0.36, z); solid(W / 2 - 2.8, z - 1.8, W / 2 - 0.3, z + 1.8, 1.0); }
  for (const [x, z] of [[-2.2, 2.2], [0.8, 4.6], [3.6, 2.6], [-4.8, 5.4]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.25, 1.05, 10), trim); p.position.set(x, 0.52, z); g.add(p); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), wood); t.position.set(x, 1.06, z); g.add(t); }
  // a pink glow strip round the room at knee height, the house lights of a place like this
  box(W - 0.8, 0.03, 0.03, glow('#ff4fd8', 1.2), 0, 0.35, DP / 2 - 0.4); box(0.03, 0.03, DP - 1, glow('#ff4fd8', 1.2), W / 2 - 0.36, 0.35, 0);

  // ---- the people: loaded when you come near, animated while you're close
  const people = []; let asked = false, greeted = false;
  async function cast() {
    asked = true;
    for (const p of CAST) {
      if (!(await H.ensureAvatar(p.a))) continue;
      const r = H.makeHuman(p.a); if (!r) continue;
      r.g.position.set(p.x, p.y, p.z); r.g.rotation.y = p.ry; g.add(r.g); r.mixer.setTime(p.t); people.push({ r, m: p.m });
    }
  }
  let t = 0;
  return {
    at: { x: A.x, z: A.z }, polys,
    update(dt, focus, night = 0) {
      const dx = focus.x - A.x, dz = focus.z - A.z, d = Math.hypot(dx, dz);
      if (d < 260 && !asked) cast();
      const lx = dx * c - dz * s, lz = dx * s + dz * c, inside = Math.abs(lx) < W / 2 && Math.abs(lz) < DP / 2;
      g.visible = d < 900; if (!g.visible) return; // far off: nothing to draw
      roofM.colorWrite = roofM.depthWrite = !inside;
      if (inside && !greeted) { greeted = true; H.notify && H.notify('<b>The Velvet Javelina</b>. Cabaret every night.', '', 3500); }
      signMat.color.setScalar(0.55 + 0.6 * night);
      t += dt; ball.rotation.y += dt * 0.6;
      for (let i = 0; i < beams.length; i += 2) { const k = i / 2, sw = Math.sin(t * 0.9 + k * 1.7) * 0.35; beams[i].rotation.z = sw; beams[i + 1].position.x = -4.2 + k * 2.8 - Math.sin(sw) * 2.6; }
      if (d < 90) for (const p of people) H.animHuman(p.r, 0, dt, p.m);
    },
  };
}

// the neon over the door: the name in script, a line under it
function signTex(THREE) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; const x = cv.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const [blur, a] of [[28, 0.9], [10, 1], [0, 1]]) { x.shadowColor = '#ff2fa0'; x.shadowBlur = blur; x.fillStyle = blur ? `rgba(255,80,190,${a})` : '#ffe3f4'; x.font = '120px Yellowtail, cursive'; x.fillText('Velvet Javelina', 512, 108); }
  x.shadowColor = '#3fe0ff'; x.shadowBlur = 16; x.fillStyle = '#bff6ff'; x.font = '600 40px "Barlow Condensed", sans-serif'; x.fillText('CABARET  ·  LOUNGE  ·  21+', 512, 210);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// the booth's front: an equalizer frozen mid-beat
function eqTex(THREE) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d'); x.fillStyle = '#07060a'; x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 24; i++) { const h = 8 + Math.abs(Math.sin(i * 1.7) * 44); const gr = x.createLinearGradient(0, 64, 0, 0); gr.addColorStop(0, '#5ad8ff'); gr.addColorStop(1, '#ff4fd8'); x.fillStyle = gr; x.fillRect(6 + i * 10.4, 60 - h, 7, h); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
