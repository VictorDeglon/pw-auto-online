// Two wheels: what people ride along Mission Beach and through downtown.
//  - bike: a beach cruiser: a swooping steel frame, balloon tyres on spoked wheels, wide swept-back bars, a sprung
//    saddle, chain ring, cranks and pedals that turn as you ride, a coaster hub, fenders, a basket now and then
//  - scooter: a 50 cc step-through scooter: the pressed-steel body with its leg shield and floorboard, the seat over
//    the engine, small wheels, a round headlight on the bars, mirrors, a top case
//  - escooter: a dockless rental kick scooter: a low deck, the stem and its folding collar, a thumb throttle, the
//    rental company's colour (parody ones), a kickstand
// Built to match buildCar() in index.html: { g, body, wheels: [{ piv, w, front }], mats, allMats, L, W, H, wr, two:
// { seat, bars, pegs, stand, crank } } with the front wheel's pivot carrying the fork and the bars (it steers).
//   const m = buildTwoWheeler(THREE, 'bike', tint)

const lin = h => new Array(3).fill(0).map((_, i) => ((h >> (16 - i * 8)) & 255) / 255);

function tube(THREE, a, b, r, mat, sides = 8) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(), g = new THREE.CylinderGeometry(r, r, L, sides);
  const m = new THREE.Mesh(g, mat); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; return m;
}
function curve(THREE, pts, r, mat, sides = 8) { const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), m = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(8, pts.length * 6), r, sides), mat); m.castShadow = true; return m; }
// a wheel standing in the y-z plane, spinning about x: tyre, rim, hub, spokes
function wheel(THREE, R, tyreR, M, spokes = 28) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - tyreR, tyreR, 10, 36), M.rubber); tyre.rotation.y = Math.PI / 2; g.add(tyre);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R - tyreR * 1.9, tyreR * 0.35, 6, 36), M.chrome); rim.rotation.y = Math.PI / 2; g.add(rim);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10).rotateZ(Math.PI / 2), M.chrome));
  if (spokes) { const pos = []; for (let k = 0; k < spokes; k++) { const a = k / spokes * Math.PI * 2, s = (k % 2 ? 1 : -1) * 0.04, ra = R - tyreR * 1.9; pos.push(s, Math.cos(a + 0.2) * 0.03, Math.sin(a + 0.2) * 0.03, 0, Math.cos(a) * ra, Math.sin(a) * ra); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.add(new THREE.LineSegments(geo, M.spoke)); }
  else { const disc = new THREE.Mesh(new THREE.CylinderGeometry(R - tyreR * 1.9, R - tyreR * 1.9, 0.05, 20).rotateZ(Math.PI / 2), M.dark); g.add(disc); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
}

export function buildTwoWheeler(THREE, type, tint = 0x5ec6e8) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.3, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }); paint.userData.base = new THREE.Color(1, 1, 1);
  const M = { paint, chrome: new THREE.MeshStandardMaterial({ color: 0xe2e4e6, roughness: 0.15, metalness: 1 }), rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.5, metalness: 0.3 }), leather: new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.6 }), spoke: new THREE.LineBasicMaterial({ color: 0xc9cbce }),
    cream: new THREE.MeshStandardMaterial({ color: 0xefe8d8, roughness: 0.5 }), glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.6 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xffe6b0, emissiveIntensity: 0.3 }), tail: new THREE.MeshStandardMaterial({ color: 0xa01010, emissive: 0x600000, emissiveIntensity: 0.4 }) };
  const wheels = []; let info;
  const addWheel = (z, R, tr, front, spokes) => { const piv = new THREE.Group(); piv.position.set(0, R, z); g.add(piv); const w = wheel(THREE, R, tr, M, spokes); piv.add(w); wheels.push({ piv, w, front }); return piv; };
  if (type === 'bike') { // ---- a beach cruiser
    const R = 0.34, rz = -0.55, fz = 0.6, bb = [0, 0.3, -0.05], seatT = [0, 0.92, -0.32], head = [0, 0.86, 0.42];
    addWheel(rz, R, 0.05, false, 36); const fp = addWheel(fz, R, 0.05, true, 36);
    body.add(curve(THREE, [[0, head[1] + 0.02, head[2]], [0, 0.82, 0.15], [0, 0.6, -0.05], [0, bb[1], bb[2]]], 0.022, paint)); // the swooping down tube
    body.add(curve(THREE, [[0, head[1] - 0.08, head[2] - 0.02], [0, 0.66, 0.2], [0, 0.48, 0.0], [0, 0.42, -0.18], [0, seatT[1] - 0.12, seatT[2] + 0.05]], 0.018, paint)); // the twin top tube
    body.add(tube(THREE, bb, [0, seatT[1] - 0.1, seatT[2] + 0.04], 0.02, paint)); // seat tube
    for (const s of [-1, 1]) { body.add(tube(THREE, [s * 0.05, bb[1], bb[2]], [s * 0.06, R, rz], 0.012, paint)); body.add(tube(THREE, [s * 0.06, R, rz], [s * 0.04, seatT[1] - 0.12, seatT[2] + 0.03], 0.011, paint)); } // stays
    body.add(tube(THREE, [0, seatT[1] - 0.12, seatT[2] + 0.04], [0, seatT[1] - 0.02, seatT[2] + 0.06], 0.012, M.chrome)); // seat post
    const sad = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8).scale(0.13, 0.05, 0.16), M.leather); sad.position.set(0, seatT[1] + 0.02, seatT[2]); body.add(sad);
    for (const s of [-1, 1]) { const sp = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 4, 10), M.chrome); sp.position.set(s * 0.05, seatT[1] - 0.04, seatT[2] - 0.08); body.add(sp); } // saddle springs
    const crank = new THREE.Group(); crank.position.set(0, bb[1], bb[2]); body.add(crank);
    crank.add(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.008, 24).rotateZ(Math.PI / 2).translate(0.05, 0, 0), M.chrome)); // chain ring
    for (const s of [-1, 1]) { const arm = tube(THREE, [s * 0.07, 0, 0], [s * 0.08, s * 0.16, 0], 0.012, M.chrome); crank.add(arm); const ped = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.06), M.dark); ped.position.set(s * 0.13, s * 0.16, 0); ped.name = s > 0 ? 'pedalR' : 'pedalL'; crank.add(ped); }
    { const pos = [0.05, bb[1] + 0.095, bb[2], 0.06, R + 0.04, rz, 0.05, bb[1] - 0.095, bb[2], 0.06, R - 0.04, rz], geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); body.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x333333 }))); } // the chain
    for (const [z0, z1] of [[rz - 0.35, rz + 0.2], [fz - 0.25, fz + 0.3]]) { const fe = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.1, 18, 1, true, Math.PI * 1.15, Math.PI * 0.7).rotateZ(Math.PI / 2), paint); fe.position.set(0, R, (z0 + z1) / 2 + (z0 < 0 ? 0.08 : -0.03)); body.add(fe); }
    // the fork and the bars ride on the front pivot (they steer); positions there are relative to the wheel's hub
    const fork = new THREE.Group(); fp.add(fork); const hy = head[1] - R, hz = head[2] - fz;
    for (const s of [-1, 1]) fork.add(tube(THREE, [s * 0.05, 0, 0], [s * 0.035, hy, hz], 0.012, M.chrome));
    fork.add(tube(THREE, [0, hy, hz], [0, hy + 0.2, hz - 0.03], 0.014, M.chrome));
    fork.add(curve(THREE, [[-0.34, hy + 0.2, hz - 0.28], [-0.25, hy + 0.24, hz - 0.12], [0, hy + 0.22, hz - 0.02], [0.25, hy + 0.24, hz - 0.12], [0.34, hy + 0.2, hz - 0.28]], 0.012, M.chrome)); // swept bars
    for (const s of [-1, 1]) fork.add(tube(THREE, [s * 0.3, hy + 0.205, hz - 0.24], [s * 0.36, hy + 0.2, hz - 0.33], 0.017, M.cream));
    if (Math.random() < 0.4) { const bk = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.25), new THREE.MeshStandardMaterial({ color: 0x8a6a3f, roughness: 0.9 })); bk.position.set(0, hy + 0.06, hz + 0.18); fork.add(bk); }
    info = { L: 1.85, W: 0.7, H: 1.1, wr: R, two: { seat: [0, seatT[1] + 0.06, seatT[2] - 0.02], bars: [0, head[1] + 0.2, head[2] - 0.3], pegs: [0, bb[1], bb[2]], crank, stand: false, kind: 'bike' } };
  } else if (type === 'scooter') { // ---- a 50 cc step-through
    const R = 0.23, rz = -0.58, fz = 0.66;
    addWheel(rz, R, 0.07, false, 0); const fp = addWheel(fz, R, 0.07, true, 0);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12).scale(0.3, 0.26, 0.46), paint); shell.position.set(0, 0.55, -0.42); body.add(shell); // the rear bodywork over the engine
    for (const s of [-1, 1]) { const cheek = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10).scale(0.12, 0.2, 0.36), paint); cheek.position.set(s * 0.2, 0.45, -0.4); body.add(cheek); }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.6), M.dark); floor.position.set(0, 0.3, 0.12); body.add(floor);
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.75, 16, 1, true, -Math.PI / 2 - 0.9, 1.8), paint); shield.position.set(0, 0.68, 0.32); shield.rotation.x = -0.18; body.add(shield); // the leg shield
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.62, 2, 1, 2), M.dark); seat.position.set(0, 0.85, -0.4); body.add(seat);
    const tc = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.32), M.dark); tc.position.set(0, 0.98, -0.82); body.add(tc); // top case
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.04), M.tail); tl.position.set(0, 0.68, -0.89); body.add(tl);
    const eng = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.4), M.chrome); eng.position.set(0.12, 0.25, -0.5); body.add(eng); body.add(tube(THREE, [0.14, 0.22, -0.4], [0.16, 0.3, -0.85], 0.03, M.chrome)); // engine, exhaust
    const fork = new THREE.Group(); fp.add(fork); const hy = 0.72, hz = -0.2;
    fork.add(tube(THREE, [0, 0, 0], [0, hy, hz], 0.03, M.dark)); const mud = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.16, 16, 1, true, Math.PI * 1.2, Math.PI * 0.6).rotateZ(Math.PI / 2), paint); fork.add(mud);
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.12), paint); hb.position.set(0, hy + 0.05, hz - 0.02); fork.add(hb);
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.06, 16).rotateX(Math.PI / 2), M.lamp); hl.position.set(0, hy + 0.05, hz + 0.08); fork.add(hl);
    for (const s of [-1, 1]) { fork.add(tube(THREE, [s * 0.3, hy + 0.05, hz - 0.02], [s * 0.38, hy + 0.05, hz - 0.04], 0.018, M.dark)); fork.add(tube(THREE, [s * 0.22, hy + 0.08, hz], [s * 0.3, hy + 0.32, hz + 0.02], 0.007, M.chrome)); const mr = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 12).rotateX(Math.PI / 2), M.chrome); mr.position.set(s * 0.3, hy + 0.34, hz + 0.02); fork.add(mr); }
    info = { L: 1.75, W: 0.72, H: 1.15, wr: R, two: { seat: [0, 0.92, -0.38], bars: [0, hy + R + 0.05, fz + hz - 0.02], pegs: [0, 0.34, 0.12], stand: false, kind: 'scooter' } };
  } else { // ---- escooter: a rental kick scooter
    const R = 0.11, rz = -0.48, fz = 0.42;
    addWheel(rz, R, 0.03, false, 0); const fp = addWheel(fz, R, 0.03, true, 0);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.06, 0.78), M.dark); deck.position.set(0, 0.13, -0.05); body.add(deck);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.005, 0.6), M.rubber); grip.position.set(0, 0.163, -0.05); body.add(grip);
    body.add(tube(THREE, [0, 0.13, -0.42], [0, R + 0.04, rz], 0.02, paint)); const fe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.3), paint); fe.position.set(0, R * 2 + 0.03, rz - 0.04); fe.rotation.x = -0.15; body.add(fe);
    const fork = new THREE.Group(); fp.add(fork); const hy = 1.0, hz = -0.12;
    fork.add(tube(THREE, [0, 0, 0], [0, hy, hz], 0.022, paint)); fork.add(tube(THREE, [-0.24, hy, hz], [0.24, hy, hz], 0.015, M.dark));
    for (const s of [-1, 1]) fork.add(tube(THREE, [s * 0.18, hy, hz], [s * 0.26, hy, hz], 0.02, M.rubber));
    const disp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.06), M.dark); disp.position.set(0, hy + 0.02, hz + 0.01); fork.add(disp);
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10).rotateX(Math.PI / 2), M.lamp); hl.position.set(0, hy - 0.12, hz + 0.04); fork.add(hl);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10), M.dark); collar.position.set(0, 0.25, -0.03); fork.add(collar);
    info = { L: 1.1, W: 0.5, H: 1.15, wr: R, two: { seat: null, bars: [0, hy + R, fz + hz], pegs: [0, 0.17, -0.05], stand: true, kind: 'escooter' } };
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const allMats = new Set(); g.traverse(o => { if (o.material) allMats.add(o.material); });
  return { g, body, wheels, bars: null, beam: null, mats: [paint], allMats: [...allMats], ...info, model: type };
}
export const TWO_COLORS = { bike: [0x5ec6e8, 0xf28fb0, 0x7fd1ae, 0xf2c94c, 0xef6b5b, 0x2c3e66, 0xf6f6f2, 0x1b1c1e], scooter: [0xb8352e, 0xefe8d8, 0x5ec6e8, 0x7a9a7a, 0x1b1c1e, 0xf2c94c], escooter: [0x111111, 0x5bbf3a, 0xf2c230, 0xe94f64] }; // the rentals: parody colours
