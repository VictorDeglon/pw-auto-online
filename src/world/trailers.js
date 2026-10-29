// Trailers in the driveways, the way Poway parks them: a boat backed in on its trailer, a travel trailer waiting for
// the summer, a utility trailer with mesh sides, and out in the rural parts a horse trailer.
//  - boat: a galvanised frame with a V tongue, carpeted bunks, winch post with its winch and strap, coupler and jack
//    wheel, fenders over the tyres, tail lights; the boat on the bunks (src/world/boatmodels.js)
//  - travel: a 23 ft fibreglass trailer, rounded front cap, windows, entry door and step, a rolled awning, the roof air
//    conditioner, propane tanks and battery box on the tongue, tandem axles, its maker's swoosh along the side
//  - utility: a 6 x 12 open trailer: angle-iron frame, treated deck boards, mesh side rails, the fold-up ramp gate
//  - horse: a two-horse bumper-pull in aluminium, slats and windows, a rounded nose, the rear doors
// Local frame: x across, z along with the tongue toward +z, y up from the ground. Built through the boats' kit (merged
// by material), drawn as instances near the camera.
//   const TR = createTrailers(THREE, scene, spots, { boatModel })   spots: [{ x, y, z, rot, kind }]   TR.update(camera)
import { BoatKit, boatMats } from './boatmodels.js';

function wheels(K, zs, track, r = 0.34) { // tyres, rims and hubs on a straight axle, fenders over them
  for (const z of zs) for (const s of [1, -1]) {
    const x = s * track / 2, T = K.T;
    K.put('black', new T.CylinderGeometry(r, r, 0.2, 18).rotateZ(Math.PI / 2), K.at(x, r, z), [1, 1, 1]);
    K.put('steel', new T.CylinderGeometry(r * 0.62, r * 0.62, 0.21, 14).rotateZ(Math.PI / 2), K.at(x + s * 0.005, r, z), [0.85, 0.86, 0.88]);
    K.put('steel', new T.CylinderGeometry(0.06, 0.06, 0.24, 8).rotateZ(Math.PI / 2), K.at(x + s * 0.01, r, z), [0.6, 0.6, 0.62]);
  }
  for (const z of zs) K.tube('alu', [-track / 2 + 0.12, 0.36, z], [track / 2 - 0.12, 0.36, z], 0.035, [0.8, 0.82, 0.84]);
}
function fender(K, x, z0, z1, y, col) { const T = K.T, g = new T.CylinderGeometry(0.42, 0.42, 0.24, 14, 1, true, 0, Math.PI); g.rotateZ(Math.PI / 2).rotateX(Math.PI / 2); g.scale(1, 1, (z1 - z0) / 0.84); K.put('alu', g, K.at(x, y, (z0 + z1) / 2, 0, -Math.PI / 2), col); }
function coupler(K, z, y) { K.box('alu', [0, y, z], [0.12, 0.1, 0.32], [0.75, 0.77, 0.8]); K.put('steel', new K.T.SphereGeometry(0.06, 10, 6), K.at(0, y - 0.03, z + 0.12), [0.8, 0.8, 0.82]); }
function jack(K, x, z, y) { K.tube('alu', [x, y + 0.25, z], [x, 0.18, z], 0.04, [0.85, 0.85, 0.87]); K.put('black', new K.T.CylinderGeometry(0.1, 0.1, 0.07, 12).rotateZ(Math.PI / 2), K.at(x, 0.1, z), [1, 1, 1]); K.box('alu', [x + 0.1, y + 0.28, z], [0.18, 0.03, 0.03], [0.8, 0.8, 0.82]); }
function tails(K, z, w, y) { for (const s of [1, -1]) { K.box('lamp', [s * w / 2, y, z], [0.12, 0.08, 0.03], [1, 0.05, 0.03]); K.box('black', [s * w / 2, y, z + 0.02], [0.14, 0.1, 0.02], [1, 1, 1]); } }

const BUILD = {
  boat(K, o) {
    const L = (o.boatL || 6) * 0.95, W = 1.9, y = 0.62;
    for (const s of [1, -1]) K.box('alu', [s * 0.62, y, -0.4], [0.08, 0.12, L], [0.78, 0.8, 0.83]); // the rails
    K.box('alu', [0, y, -L / 2 + 0.05], [1.4, 0.1, 0.08], [0.78, 0.8, 0.83]); for (let z = -L / 2 + 1.2; z < L / 2 - 1; z += 1.4) K.box('alu', [0, y, z], [1.3, 0.08, 0.06], [0.78, 0.8, 0.83]);
    for (const s of [1, -1]) K.tube('alu', [s * 0.62, y, L / 2 - 1.2], [0, y, L / 2 + 0.9], 0.05, [0.78, 0.8, 0.83]); // the V tongue
    K.box('alu', [0, y, L / 2 + 0.4], [0.1, 0.12, 1.4], [0.78, 0.8, 0.83]); coupler(K, L / 2 + 1.05, y); jack(K, 0.18, L / 2 + 0.5, y);
    for (const s of [1, -1]) K.box('carpet', [s * 0.45, y + 0.2, -0.6], [0.14, 0.1, L * 0.7], [0.32, 0.33, 0.36]); // bunks
    K.tube('alu', [0, y, L / 2 - 0.4], [0, y + 0.95, L / 2 - 0.55], 0.05, [0.78, 0.8, 0.83]); K.box('alu', [0, y + 0.85, L / 2 - 0.5], [0.22, 0.2, 0.18], [0.4, 0.42, 0.45]); K.put('black', new K.T.CylinderGeometry(0.06, 0.06, 0.14, 10).rotateZ(Math.PI / 2), K.at(0, y + 0.95, L / 2 - 0.42), [1, 1, 1]);
    K.box('black', [0, y + 0.85, L / 2 - 1.2], [0.05, 0.02, 1.4], [0.1, 0.12, 0.35], 0, 0.18); // the winch strap to the bow eye
    wheels(K, [-0.5], W, 0.36); for (const s of [1, -1]) fender(K, s * W / 2, -0.95, -0.05, 0.36, [0.85, 0.86, 0.88]);
    tails(K, -L / 2 - 0.05, 1.6, y);
    return { L: L + 2, W, boat: { y: y + 0.25, z: -0.4 } }; // y: the bunks' top, where the keel sits
  },
  travel(K, o) {
    const L = 7.0, W = 2.42, H = 2.4, y0 = 0.62, body = o.body || [0.96, 0.96, 0.94], sw = o.stripe || [0.25, 0.3, 0.38];
    K.side('gel', [[-L / 2, y0], [L / 2 - 0.25, y0], [L / 2, y0 + 0.3], [L / 2 + 0.05, y0 + H - 0.75], [L / 2 - 0.45, y0 + H], [-L / 2 + 0.1, y0 + H], [-L / 2, y0 + H - 0.1]], W, body, 0, 0.08); // the body, its raked front cap
    for (const s of [1, -1]) { K.box('gel', [s * (W / 2 + 0.006), y0 + 0.75, 0], [0.01, 0.16, L * 0.92], sw); K.box('gel', [s * (W / 2 + 0.006), y0 + 0.98, -0.8], [0.01, 0.06, L * 0.6], sw, 0, 0.06); } // swoosh
    for (const [x, z, w2] of [[1, 1.6, 1.1], [1, -1.2, 1.4], [-1, 0.6, 1.6], [-1, -2.4, 0.9]]) K.rbox('tint', [x * (W / 2 + 0.01), y0 + 1.55, z], [0.03, 0.62, w2], [1, 1, 1], 0.06);
    K.box('tint', [0, y0 + H - 0.5, L / 2 - 0.2], [1.4, 0.4, 0.04], [1, 1, 1], 0, -0.6); K.rbox('tint', [0, y0 + 1.55, -L / 2 - 0.01], [1.0, 0.5, 0.04], [1, 1, 1], 0.05);
    K.rbox('gel', [W / 2 + 0.012, y0 + 1.0, 0.1], [0.03, 1.85, 0.68], [0.9, 0.9, 0.88], 0.04); K.box('steel', [W / 2 + 0.03, y0 + 1.0, 0.36], [0.02, 0.05, 0.12], [1, 1, 1]); // door, handle
    K.box('alu', [W / 2 + 0.25, y0 - 0.2, 0.1], [0.45, 0.04, 0.6], [0.6, 0.62, 0.64]); // entry step
    K.cyl('gel', [W / 2 + 0.12, y0 + H - 0.15, -L / 2 + 0.6], [W / 2 + 0.12, y0 + H - 0.15, L / 2 - 1.2], 0.1, 0.1, o.awning || [0.55, 0.62, 0.66], 12); // the rolled awning
    K.rbox('gel', [0, y0 + H + 0.14, -0.4], [0.75, 0.28, 0.95], [0.92, 0.92, 0.9], 0.08); K.rbox('gel', [0, y0 + H + 0.06, 1.8], [0.5, 0.12, 0.5], [0.85, 0.85, 0.83], 0.05); // AC, vent
    K.box('alu', [0, y0 - 0.05, 0], [1.9, 0.14, L - 0.2], [0.3, 0.31, 0.33]); for (const s of [1, -1]) K.tube('alu', [s * 0.8, y0 - 0.05, L / 2 - 0.2], [0, y0 - 0.05, L / 2 + 1.2], 0.05, [0.3, 0.31, 0.33]);
    coupler(K, L / 2 + 1.3, y0 - 0.05); jack(K, 0.2, L / 2 + 0.8, y0 - 0.05);
    for (const x of [-0.25, 0.25]) K.cyl('gel', [x, y0 + 0.05, L / 2 + 0.75], [x, y0 + 0.62, L / 2 + 0.75], 0.17, 0.15, [0.95, 0.95, 0.95], 14); K.rbox('black', [0, y0 + 0.15, L / 2 + 1.05], [0.32, 0.22, 0.22], [1, 1, 1], 0.03);
    wheels(K, [-0.9, -0.05], W - 0.25, 0.36); tails(K, -L / 2 - 0.02, W - 0.2, y0 + 0.3);
    return { L: L + 1.6, W };
  },
  utility(K, o) {
    const L = 3.7, W = 2.0, y = 0.58;
    for (const s of [1, -1]) K.box('alu', [s * W / 2, y, 0], [0.06, 0.1, L], [0.3, 0.31, 0.33]); K.box('alu', [0, y, -L / 2], [W, 0.1, 0.06], [0.3, 0.31, 0.33]); K.box('alu', [0, y, L / 2], [W, 0.1, 0.06], [0.3, 0.31, 0.33]);
    for (let x = -W / 2 + 0.07; x < W / 2; x += 0.14) K.box('teak', [x, y + 0.07, 0], [0.13, 0.035, L - 0.04], [0.85, 0.75, 0.6]); // treated deck boards
    for (const s of [1, -1]) { K.box('alu', [s * W / 2, y + 0.55, 0], [0.04, 0.04, L], [0.3, 0.31, 0.33]); for (let z = -L / 2; z <= L / 2 + 0.01; z += L / 4) K.box('alu', [s * W / 2, y + 0.3, z], [0.04, 0.5, 0.04], [0.3, 0.31, 0.33]);
      for (let z = -L / 2 + 0.1; z < L / 2; z += 0.1) K.box('alu', [s * W / 2, y + 0.3, z], [0.006, 0.48, 0.006], [0.25, 0.26, 0.28]); } // mesh
    { const z = -L / 2 - 0.05, c = [0.3, 0.31, 0.33]; for (const yy of [y + 0.1, y + 1.4]) K.box('alu', [0, yy, z], [W, 0.05, 0.05], c); for (const s of [1, -1]) K.box('alu', [s * (W / 2 - 0.03), y + 0.75, z], [0.05, 1.3, 0.05], c);
      for (let x = -W / 2 + 0.12; x < W / 2 - 0.05; x += 0.12) K.box('alu', [x, y + 0.75, z], [0.008, 1.26, 0.008], [0.25, 0.26, 0.28]); for (let yy = y + 0.25; yy < y + 1.35; yy += 0.15) K.box('alu', [0, yy, z], [W - 0.06, 0.008, 0.008], [0.25, 0.26, 0.28]); } // the ramp gate, up: a frame and its mesh
    for (const s of [1, -1]) K.tube('alu', [s * W / 2, y, L / 2], [0, y, L / 2 + 1.1], 0.04, [0.3, 0.31, 0.33]); coupler(K, L / 2 + 1.2, y); jack(K, 0.18, L / 2 + 0.6, y);
    wheels(K, [-0.2], W + 0.2, 0.3); for (const s of [1, -1]) fender(K, s * (W / 2 + 0.1), -0.62, 0.22, y + 0.02, [0.3, 0.31, 0.33]); tails(K, -L / 2 - 0.03, W - 0.2, y);
    return { L: L + 1.3, W: W + 0.2 };
  },
  horse(K, o) {
    const L = 4.9, W = 2.0, H = 2.25, y0 = 0.55, al = [0.86, 0.88, 0.9];
    K.side('alu', [[-L / 2 + 0.3, y0], [L / 2 - 0.7, y0], [L / 2 - 0.2, y0 + 0.5], [L / 2 - 0.1, y0 + H - 0.6], [L / 2 - 0.55, y0 + H], [-L / 2 + 0.3, y0 + H]], W, al, 0, 0.08); // body and the rounded nose
    for (const s of [1, -1]) { for (let z = -2.3; z < 1.4; z += 0.24) K.box('black', [s * (W / 2 + 0.004), y0 + 1.6, z], [0.01, 0.42, 0.13], [0.08, 0.08, 0.09]); // slats
      K.rbox('tint', [s * (W / 2 + 0.01), y0 + 1.55, 1.55], [0.02, 0.4, 0.55], [1, 1, 1], 0.05); K.box('alu', [s * (W / 2 + 0.006), y0 + 0.3, -0.3], [0.01, 0.12, L - 0.7], o.stripe || [0.12, 0.25, 0.45]); }
    K.box('alu', [0, y0 + H / 2, -L / 2 + 0.29], [0.02, H - 0.1, 0.02], [0.6, 0.62, 0.65]); for (const s of [1, -1]) K.box('steel', [s * 0.45, y0 + 1.1, -L / 2 + 0.28], [0.14, 0.04, 0.03], [1, 1, 1]); // rear doors
    for (const s of [1, -1]) K.tube('alu', [s * 0.7, y0 - 0.05, L / 2 - 0.8], [0, y0 - 0.05, L / 2 + 0.6], 0.05, [0.4, 0.42, 0.45]); coupler(K, L / 2 + 0.7, y0 - 0.05); jack(K, 0.2, L / 2 + 0.2, y0 - 0.05);
    wheels(K, [-0.85, -0.05], W - 0.2, 0.34); tails(K, -L / 2 + 0.27, W - 0.15, y0 + 0.25);
    return { L: L + 0.9, W };
  },
};

export function trailerModel(THREE, kind, o = {}) {
  const K = new BoatKit(THREE), info = (BUILD[kind] || BUILD.utility)(K, o), g = K.group(boatMats(THREE));
  if (kind === 'boat' && o.boatModel) { const b = o.boatModel(o.boatKind || 'runabout'); b.position.set(0, info.boat.y + (b.userData.wl ?? 0.3), info.boat.z); g.add(b); } // the keel on the bunks
  g.userData = { kind, ...info }; return g;
}

// instanced: each distinct model once, its meshes as InstancedMeshes, refilled with the spots near the camera
export function createTrailers(THREE, scene, spots, o = {}) {
  const groups = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const variant = s => s.kind === 'boat' ? 'boat/' + s.boat : s.kind === 'travel' ? 'travel/' + (s.v % 3) : s.kind === 'horse' ? 'horse/' + (s.v % 2) : 'utility';
  const LOOK = { travel: [{ stripe: [0.25, 0.3, 0.38] }, { stripe: [0.45, 0.18, 0.12], awning: [0.5, 0.35, 0.25] }, { stripe: [0.1, 0.32, 0.36] }], horse: [{ stripe: [0.12, 0.25, 0.45] }, { stripe: [0.5, 0.1, 0.1] }] };
  for (const s of spots) {
    const k = variant(s); let g = groups.get(k);
    if (!g) {
      const [kind, sub] = k.split('/'), model = trailerModel(THREE, kind, { ...(LOOK[kind] ? LOOK[kind][+sub] : {}), boatKind: sub, boatL: sub === 'jon' ? 4.3 : sub === 'center' ? 7.4 : sub === 'speedboat' ? 8.2 : 6.2, boatModel: o.boatModel });
      model.updateMatrixWorld(true); const meshes = []; model.traverse(m => { if (m.isMesh) meshes.push(m); });
      g = { list: [], ims: meshes.map(m => { const geo = m.geometry.clone(); if (m.parent !== model) geo.applyMatrix4(m.matrixWorld); const im = new THREE.InstancedMesh(geo, m.material, 1); im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; im.name = 'trailer:' + k; scene.add(im); return im; }), info: model.userData };
      groups.set(k, g);
    }
    q.setFromAxisAngle(up, s.rot); g.list.push({ x: s.x, z: s.z, m: new THREE.Matrix4().compose(v.set(s.x, s.y, s.z), q, one) });
  }
  for (const g of groups.values()) for (let i = 0; i < g.ims.length; i++) { const im = g.ims[i], n = g.list.length, big = new THREE.InstancedMesh(im.geometry, im.material, n); big.count = 0; big.frustumCulled = false; big.castShadow = true; big.receiveShadow = true; big.name = im.name; scene.remove(im); scene.add(big); g.ims[i] = big; }
  const last = { x: 1e9, z: 1e9, t: 0 }, R = 450;
  return {
    count: spots.length,
    update(camera) {
      const cx = camera.position.x, cz = camera.position.z; if ((cx - last.x) ** 2 + (cz - last.z) ** 2 < 20 * 20 && ++last.t < 90) return; last.x = cx; last.z = cz; last.t = 0;
      for (const g of groups.values()) { let n = 0; for (const s of g.list) if ((s.x - cx) ** 2 + (s.z - cz) ** 2 < R * R) { for (const im of g.ims) im.setMatrixAt(n, s.m); n++; } for (const im of g.ims) { im.count = n; im.instanceMatrix.needsUpdate = true; } }
    },
  };
}
