// Hide & Seek: a downtown grid 870 m across (seven streets each way, towers, an alley here and there, parks, parking
// lots, a plaza), walled in by a ring of towers the streets tunnel through, and heavy traffic (traffic.js). No cops.
// Each round the server picks one seeker at random. Hiders start parked at a kerb in an ordinary car and have 30 s to
// vanish: blend into traffic, sit among the parked cars, tuck into an alley. The seeker waits on the plaza with eyes
// shut, then gets a rocket launcher and an aim assist that boxes the cars in view and locks onto the one nearest the
// crosshair (a locked rocket homes in). One hit and that hider is out (the server decides). Hiders win if anyone is
// still hidden when the clock (3 minutes) runs out. Name tags and markers are off for the seeker, and players' cars are
// drawn exactly as the traffic is.
import { ctx } from '../ctx.js';
import { DEFS } from './defs.js';
import { REMOTES } from '../online/remote.js';
import { canvasTex, concreteTex, instanced, baseBox, rectPoly, wallPoly, createScreen, screenStand, textSign, rng, FONT_D, FONT_U } from './kit.js';
import { buildTunnels, horizon, arrival } from './base.js';
import { createCrowd, standSeats, CHEER } from './crowd.js';
import { HUD, clock } from './hud.js';
import { eachCar, carsNear, createCarKit, LOOKS, TINTS } from './traffic.js';

const H = DEFS.HS, ST = H.hw, PITCH = H.pitch, WALL = H.wall, SPAN = 700;
const blockCenter = b => DEFS.hsStreet(b) + PITCH / 2;
const RPG = 7; // WEAPONS index of the rocket launcher

// building facades, drawn in the shader from where each pixel is on the wall (no textures, any size of box)
const FACADE = `
  vec3 fp = vWp; float side = abs(vWn.x) > 0.5 ? fp.z : fp.x;
  float roof = step(0.5, vWn.y);
  vec2 cell = vec2(side / uWin.x, fp.y / uWin.y), f = fract(cell), id = floor(cell);
  float h = fract(sin(dot(id + vSeed, vec2(12.9898, 78.233))) * 43758.5453);
  float win = step(uWin.z, f.x) * step(f.x, 1.0 - uWin.z) * step(uWin.w, f.y) * step(f.y, 0.86);
  float shop = 1.0 - step(4.6, fp.y);
  win = mix(win, step(0.06, f.x) * step(0.12, fract(fp.y / 4.6)) * step(fract(fp.y / 4.6), 0.82), shop);
  vec3 glass = mix(vec3(0.12, 0.16, 0.21), vec3(0.42, 0.52, 0.62), smoothstep(0.0, 1.0, f.y) * 0.6 + h * 0.25);
  glass = mix(glass, vec3(0.75, 0.62, 0.42), step(0.93, h) * 0.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * (1.0 - roof));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.21, 0.23), roof);
`;
function facadeMat(color, win, rough = 0.8, metal = 0.1) {
  const { THREE } = ctx, m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }), U = { uWin: { value: new THREE.Vector4(...win) } };
  m.onBeforeCompile = sh => {
    sh.uniforms.uWin = U.uWin;
    sh.vertexShader = 'varying vec3 vWp; varying vec3 vWn; varying vec2 vSeed;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vec4 wp4 = instanceMatrix * vec4(transformed, 1.0); vWp = wp4.xyz; vWn = normalize(mat3(instanceMatrix) * objectNormal); vSeed = instanceMatrix[3].xz * 0.01;');
    sh.fragmentShader = 'uniform vec4 uWin; varying vec3 vWp; varying vec3 vWn; varying vec2 vSeed;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + FACADE);
  };
  m.customProgramCacheKey = () => 'pao-facade-' + win.join(',');
  return m;
}

export function createHide(api) {
  const { THREE } = ctx, A = DEFS.ARENAS.hide, o = A.o, group = new THREE.Group(); group.position.set(o[0], 0, o[1]);
  const R = rng(1977), streets = []; for (let i = 0; i < H.n; i++) streets.push(DEFS.hsStreet(i));
  // ---- the ground: one painted canvas over the whole district (asphalt, kerbs, pavements, parks, lots)
  const kinds = {}; // 'bx,bz' -> block kind
  const special = { '2,2': 'plaza', '5,0': 'tower', '0,3': 'park', '4,4': 'park', '1,0': 'park', '3,5': 'lot', '5,2': 'lot', '1,4': 'lot', '3,1': 'lot' };
  for (let bx = 0; bx < H.n - 1; bx++) for (let bz = 0; bz < H.n - 1; bz++) kinds[bx + ',' + bz] = special[bx + ',' + bz] || 'city';
  const PX = 2048, toPx = v => (v + SPAN) / (SPAN * 2) * PX;
  const groundTex = canvasTex(PX, PX, (g) => {
    g.fillStyle = '#a7a39a'; g.fillRect(0, 0, PX, PX);
    const R2 = rng(3); for (let i = 0; i < 30000; i++) { g.fillStyle = `rgba(${R2() < 0.5 ? '60,58,55' : '210,206,198'},${0.05 + R2() * 0.08})`; g.fillRect(R2() * PX, R2() * PX, 1 + R2() * 2, 1 + R2() * 2); }
    const rect = (x0, z0, x1, z1, c) => { g.fillStyle = c; g.fillRect(toPx(x0), toPx(z0), toPx(x1) - toPx(x0), toPx(z1) - toPx(z0)); };
    for (let bx = 0; bx < H.n - 1; bx++) for (let bz = 0; bz < H.n - 1; bz++) {
      const k = kinds[bx + ',' + bz], cx = blockCenter(bx), cz = blockCenter(bz), hb = PITCH / 2 - ST - 4;
      if (k === 'park') { rect(cx - hb, cz - hb, cx + hb, cz + hb, '#5f8a42'); rect(cx - 3, cz - hb, cx + 3, cz + hb, '#c2b49a'); rect(cx - hb, cz - 3, cx + hb, cz + 3, '#c2b49a'); }
      if (k === 'lot') rect(cx - hb, cz - hb, cx + hb, cz + hb, '#4a4b4e');
      if (k === 'plaza') { rect(cx - hb, cz - hb, cx + hb, cz + hb, '#c9b99b'); g.strokeStyle = 'rgba(120,100,80,.35)'; g.lineWidth = 1; for (let u = -hb; u < hb; u += 3) { g.beginPath(); g.moveTo(toPx(cx + u), toPx(cz - hb)); g.lineTo(toPx(cx + u), toPx(cz + hb)); g.stroke(); g.beginPath(); g.moveTo(toPx(cx - hb), toPx(cz + u)); g.lineTo(toPx(cx + hb), toPx(cz + u)); g.stroke(); } }
    }
    for (const s of streets) { rect(-SPAN, s - ST - 0.4, SPAN, s + ST + 0.4, '#8b8780'); rect(s - ST - 0.4, -SPAN, s + ST + 0.4, SPAN, '#8b8780'); } // kerbs
    for (const s of streets) { rect(-SPAN, s - ST, SPAN, s + ST, '#3c3e41'); rect(s - ST, -SPAN, s + ST, SPAN, '#3c3e41'); }
  }, null);
  { const sh = new THREE.Shape(); sh.moveTo(-SPAN, SPAN); sh.lineTo(SPAN, SPAN); sh.lineTo(SPAN, -SPAN); sh.lineTo(-SPAN, -SPAN); sh.closePath();
    const holes = buildTunnels(group, A, '#ff4fd8'); for (const h of holes) { const p = new THREE.Path(); h.forEach(([x, z], i) => i ? p.lineTo(x, -z) : p.moveTo(x, -z)); p.closePath(); sh.holes.push(p); }
    const geo = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), P = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < P.count; i++) uv.setXY(i, (P.getX(i) + SPAN) / (SPAN * 2), 1 - (P.getZ(i) + SPAN) / (SPAN * 2));
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.92 })); m.receiveShadow = true; group.add(m); }
  // ---- road markings: centre lines, lane dashes, parking lines, crosswalks (one instanced mesh)
  const marks = [], yel = [], seg = (a, b) => { // the open stretches of a street, between the junctions
    const out = []; for (let i = 0; i < streets.length - 1; i++) out.push([streets[i] + ST + 3, streets[i + 1] - ST - 3]); out.push([-SPAN, streets[0] - ST - 3], [streets[streets.length - 1] + ST + 3, WALL + 4]); return out; };
  for (const s of streets) for (const ax of [0, 1]) for (const [u0, u1] of seg()) {
    for (let u = u0; u < u1; u += 12) for (const off of [-5, 5]) { const L = Math.min(5, u1 - u); marks.push(ax ? { x: u + L / 2, z: s + off, sx: L, sz: 0.18 } : { x: s + off, z: u + L / 2, sx: 0.18, sz: L }); }
    for (const off of [-0.25, 0.25]) yel.push(ax ? { x: (u0 + u1) / 2, z: s + off, sx: u1 - u0, sz: 0.14 } : { x: s + off, z: (u0 + u1) / 2, sx: 0.14, sz: u1 - u0 });
    for (const off of [-10, 10]) marks.push(ax ? { x: (u0 + u1) / 2, z: s + off, sx: u1 - u0, sz: 0.14 } : { x: s + off, z: (u0 + u1) / 2, sx: 0.14, sz: u1 - u0 });
  }
  for (const a of streets) for (const b2 of streets) for (const [dx, dz, along] of [[0, -ST - 2, 1], [0, ST + 2, 1], [-ST - 2, 0, 0], [ST + 2, 0, 0]]) // zebra crossings on all four sides
    for (let k = -ST + 1.5; k < ST - 1; k += 1.6) marks.push(along ? { x: a + k, z: b2 + dz, sx: 0.8, sz: 3.6 } : { x: a + dx, z: b2 + k, sx: 3.6, sz: 0.8 });
  const markMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  group.add(instanced(plane, markMat(0xf0ede4), marks.map(m => ({ ...m, y: 0.03, sy: 1 })), { cast: false, receive: false }));
  group.add(instanced(plane, markMat(0xe8b830), yel.map(m => ({ ...m, y: 0.03, sy: 1 })), { cast: false, receive: false }));

  // ---- buildings: the blocks, then the wall of towers round the edge with the street tunnels through it
  const styles = [facadeMat(0x8c96a0, [3.2, 3.6, 0.08, 0.12], 0.35, 0.55), facadeMat(0xb6a58f, [3.6, 3.6, 0.18, 0.22]), facadeMat(0x9a6a52, [3.0, 3.4, 0.22, 0.25]), facadeMat(0xd6d0c4, [4.0, 3.8, 0.12, 0.18])];
  const bld = styles.map(() => []), boxes = []; // boxes: [x, z, hx, hz, h] for collision and the minimap
  const building = (x, z, hx, hz, h, st, hollow) => {
    bld[st].push({ x, y: 0, z, sx: hx * 2, sy: h, sz: hz * 2 }); boxes.push([x, z, hx, hz, h]);
    if (!hollow) { rectPoly(o[0] + x, o[1] + z, hx, hz, 0, -5, h - 0.5); return; }
    // the terrace tower: only its walls are solid, so people can stand on its roof (a solid footprint pushes you off)
    const X = o[0] + x, Z = o[1] + z; for (const [ax, az, bx, bz] of [[-hx, -hz, hx, -hz], [hx, -hz, hx, hz], [hx, hz, -hx, hz], [-hx, hz, -hx, -hz]]) wallPoly(X + ax, Z + az, X + bx, Z + bz, 0.6, -5, h - 1.5);
  };
  const parked = [], trees = [], lamps = [];
  for (let bx = 0; bx < H.n - 1; bx++) for (let bz = 0; bz < H.n - 1; bz++) {
    const k = kinds[bx + ',' + bz], cx = blockCenter(bx), cz = blockCenter(bz), hb = PITCH / 2 - ST - 4, centre = 1 - Math.hypot(cx, cz) / 600;
    if (k === 'tower') { building(cx, cz, hb, hb, H.roof[3], 3, true); continue; }
    if (k === 'park') { for (let i = 0; i < 26; i++) { const x = cx + (R() - 0.5) * hb * 1.8, z = cz + (R() - 0.5) * hb * 1.8; if (Math.abs(x - cx) < 5 || Math.abs(z - cz) < 5) continue; trees.push({ x, z, s: 0.8 + R() * 0.6 }); } continue; }
    if (k === 'plaza') { continue; }
    if (k === 'lot') { // rows of parked cars, nose in, with room to drive between them
      for (let row = -1; row <= 1; row += 2) for (let u = -hb + 4; u < hb - 3; u += 3.4) if (R() < 0.62) parked.push({ x: cx + u, z: cz + row * (hb - 9), rot: row > 0 ? Math.PI : 0, look: (R() * LOOKS.length) | 0, tint: TINTS[(R() * TINTS.length) | 0] });
      for (let u = -hb + 4; u < hb - 3; u += 3.4) if (R() < 0.5) parked.push({ x: cx + u, z: cz + (R() < 0.5 ? -4 : 4), rot: R() < 0.5 ? 0 : Math.PI, look: (R() * LOOKS.length) | 0, tint: TINTS[(R() * TINTS.length) | 0] });
      continue;
    }
    // a city block: two to four buildings, sometimes an alley through the middle
    const alley = R() < 0.4, alongX = R() < 0.5, gap = alley ? 6 : 0.5;
    const split = (a0, a1, b0, b1, n) => { const out = []; let a = a0; for (let i = 0; i < n; i++) { const w = i === n - 1 ? a1 - a : (a1 - a) * (0.3 + R() * 0.4); out.push([a, a + w, b0, b1]); a += w; } return out; };
    const halves = alongX ? [[cx - hb, cx + hb, cz - hb, cz - gap], [cx - hb, cx + hb, cz + gap, cz + hb]] : [[cx - hb, cx - gap, cz - hb, cz + hb], [cx + gap, cx + hb, cz - hb, cz + hb]];
    for (const [x0, x1, z0, z1] of halves) {
      const n = 1 + ((R() * 2.4) | 0), parts = alongX ? split(x0, x1, z0, z1, n) : split(z0, z1, x0, x1, n).map(([a, b, c, d]) => [c, d, a, b]);
      for (const [a, b, c, d] of parts) { const sb = 0.4 + R() * 1.6, h = Math.round(14 + R() * 30 + Math.max(0, centre) * (40 + R() * 90)); building((a + b) / 2, (c + d) / 2, (b - a) / 2 - sb, (d - c) / 2 - sb, h, (R() * styles.length) | 0); }
    }
  }
  // the wall: towers round the edge, gaps where the streets go into their tunnels (and the two crew tunnels)
  for (const side of [0, 1, 2, 3]) {
    const gaps = [...streets.map(s => [s - ST - 1, s + ST + 1]), ...(side === 1 ? [[A.in[0] - 9, A.in[0] + 9], [A.out[0] - 9, A.out[0] + 9]] : [])].sort((a, b) => a[0] - b[0]); // the crew tunnels are in the south wall
    let u = -WALL - 60; const runs = [];
    for (const [g0, g1] of gaps) { if (g0 > u) runs.push([u, g0]); u = Math.max(u, g1); }
    runs.push([u, WALL + 60]);
    for (const [u0, u1] of runs) for (let a = u0; a < u1 - 1; ) {
      const w = Math.min(u1 - a, 30 + R() * 30), m = a + w / 2, h = 60 + R() * 80, st = (R() * styles.length) | 0, D2 = 30;
      if (side < 2) building(m, (side ? 1 : -1) * (WALL + D2), w / 2 - 0.3, D2, h, st); else building((side === 3 ? 1 : -1) * (WALL + D2), m, D2, w / 2 - 0.3, h, st);
      a += w;
    }
  }
  // tunnel mouths where the streets leave: dark boxes set into the wall, and a barrier across (the traffic passes it)
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x030304 }), mouthMat = new THREE.MeshStandardMaterial({ map: concreteTex([4, 1], '#8f8b84'), roughness: 0.9 });
  for (const s of streets) for (const [sx, sz, ry] of [[s, WALL, 0], [s, -WALL, Math.PI], [WALL, s, Math.PI / 2], [-WALL, s, -Math.PI / 2]]) {
    const g = new THREE.Group(); g.position.set(sx, 0, sz); g.rotation.y = ry; group.add(g);
    const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); g.add(b); };
    box(ST * 2 + 2, 9, 40, 0, -0.5, 22, darkMat); box(ST * 2 + 4, 3, 1.5, 0, 7.5, 0.8, mouthMat);
    const fx = Math.sin(ry), fz = Math.cos(ry); wallPoly(o[0] + sx + fx * 5 - fz * (ST + 1), o[1] + sz + fz * 5 + fx * (ST + 1), o[0] + sx + fx * 5 + fz * (ST + 1), o[1] + sz + fz * 5 - fx * (ST + 1), 1, -5, 12);
  }
  bld.forEach((items, i) => { const m = instanced(baseBox(1, 1, 1), styles[i], items); group.add(m); });
  // rooftop plant, street lamps, trees, the plaza fountain
  { const roofs = []; for (const [x, z, hx, hz, h] of boxes) if (h < 150 && R() < 0.8 && !(x > 300 && z < -300)) for (let i = 0; i < 2; i++) roofs.push({ x: x + (R() - 0.5) * hx, y: h, z: z + (R() - 0.5) * hz, sx: 3 + R() * 4, sy: 1.5 + R() * 2.5, sz: 3 + R() * 4 });
    group.add(instanced(baseBox(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x8a8d91, roughness: 0.7, metalness: 0.3 }), roofs)); }
  for (const s of streets) for (const ax of [0, 1]) for (let u = -WALL + 20; u < WALL - 10; u += 36) for (const side of [-1, 1]) {
    if (streets.some(t => Math.abs(t - u) < ST + 6)) continue; const p = s + side * (ST + 1.6); lamps.push(ax ? { x: u, z: p } : { x: p, z: u });
  }
  group.add(instanced(baseBox(0.18, 7, 0.18), new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.6, roughness: 0.4 }), lamps.map(l => ({ x: l.x, y: 0, z: l.z }))));
  { const trunks = instanced(new THREE.CylinderGeometry(0.18, 0.26, 3, 7).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.9 }), trees.map(t => ({ x: t.x, z: t.z, sx: t.s, sy: t.s, sz: t.s })));
    const crowns = instanced(new THREE.IcosahedronGeometry(2.4, 1).translate(0, 4.6, 0), new THREE.MeshStandardMaterial({ color: 0x4f7a34, roughness: 0.85, flatShading: true }), trees.map(t => ({ x: t.x, z: t.z, sx: t.s, sy: t.s * 1.1, sz: t.s })));
    group.add(trunks, crowns); for (const t of trees) rectPoly(o[0] + t.x, o[1] + t.z, 0.35, 0.35, 0, -5, 4); }
  { const pz = A.plaza, f = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 0.9, 32), new THREE.MeshStandardMaterial({ map: concreteTex([3, 1]), roughness: 0.9 })); f.position.set(pz[0], 0.45, pz[1]); group.add(f);
    const w = new THREE.Mesh(new THREE.CircleGeometry(6.4, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f6f86, roughness: 0.1, metalness: 0.2 })); w.position.set(pz[0], 0.85, pz[1]); group.add(w);
    rectPoly(o[0] + pz[0], o[1] + pz[1], 6.5, 6.5, 0, -5, 1); }
  // the spectator terrace on the tower: a low parapet, people, a big screen with the round on it
  const roof = H.roof, rx = roof[0], rz = roof[1], rh = roof[3], rw = roof[2];
  { const par = []; for (const [x, z, sx, sz] of [[rx, rz - rw, rw * 2, 0.4], [rx, rz + rw, rw * 2, 0.4], [rx - rw, rz, 0.4, rw * 2], [rx + rw, rz, 0.4, rw * 2]]) { par.push({ x, y: rh, z, sx, sy: 1.1, sz }); wallPoly(o[0] + x - (sx > 1 ? sx / 2 : 0), o[1] + z - (sz > 1 ? sz / 2 : 0), o[0] + x + (sx > 1 ? sx / 2 : 0), o[1] + z + (sz > 1 ? sz / 2 : 0), 0.6, rh - 2, rh + 1.2); }
    group.add(instanced(baseBox(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xc9c3b8, roughness: 0.9 }), par)); }
  const terrace = []; for (const s of [[rx - rw + 3, rz, Math.PI / 2, 'w'], [rx, rz + rw - 3, Math.PI, 's']]) terrace.push(...standSeats(s[0], s[1], rw * 1.7, s[2] + Math.PI, 3, { rise: 0, depth: 1.1, y0: rh, gap: 0.8, fill: 0.7, seed: s[3].charCodeAt(0) }));
  const crowd = createCrowd(terrace, { seed: 77, parent: group });
  const plazaFolk = []; { const pz = A.plaza, R3 = rng(9); for (let i = 0; i < 70; i++) { const a = R3() * Math.PI * 2, d = 12 + R3() * 18; plazaFolk.push({ x: pz[0] + Math.cos(a) * d, y: 0, z: pz[1] + Math.sin(a) * d, ry: Math.atan2(-Math.cos(a), -Math.sin(a)) + (R3() - 0.5) }); } }
  const crowd2 = createCrowd(plazaFolk, { seed: 78, parent: group });
  const screen = createScreen({ w: 30, h: 16.9, title: 'HIDE & SEEK', sub: 'ROUND STATUS', accent: '#ff4fd8', px: 1024 });
  { const s = screenStand(screen, 2, false); s.position.set(rx - rw + 4, rh, rz + rw - 4); s.rotation.y = Math.atan2(-rx, -rz); group.add(s); }
  horizon(group, 0, 0, 1800, { lo: '#a7b2bd', hi: '#7d8794', seed: 5, h0: 40, h1: 140 });

  // ---- cars: traffic, the parked ones, and other players' cars (drawn the same way)
  ctx.scene.add(group);
  const kit = createCarKit(group);
  for (const p of parked) rectPoly(o[0] + p.x, o[1] + p.z, 1.0, 2.6, p.rot, -5, 1.5);
  const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere(new THREE.Vector3(), 4.5);
  const wrecks = new Map(); // 'lane:k' -> seconds hidden (a car you blew up stays gone until it loops round)
  let tNow = 0;
  function drawCars(dt) {
    const cam = ctx.camera; _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
    const cx = cam.position.x - o[0], cz = cam.position.z - o[1], vis = (x, z) => { const d2 = (x - cx) ** 2 + (z - cz) ** 2; if (d2 > 560 * 560) return false; _sp.center.set(o[0] + x, 1.2, o[1] + z); return d2 < 400 || _fr.intersectsSphere(_sp); };
    tNow = api.now() / 1000; kit.begin(H.v * tNow);
    seen.length = 0;
    eachCar(tNow, (li, k, x, z, rot, s, look, tint) => {
      const key = li * 64 + k, w = wrecks.get(key); if (w !== undefined) { if (Math.abs(s) > WALL + 4 && w < 0) wrecks.delete(key); else return; }
      if (!vis(x, z)) return; kit.add(look, tint, x, 0, z, rot); seen.push([x, z, rot, look, key, 0, tint]);
    });
    parked.forEach((p, i) => { if (vis(p.x, p.z)) { kit.add(p.look, p.tint, p.x, 0, p.z, p.rot); seen.push([p.x, p.z, p.rot, p.look, 'q' + i, 0, p.tint]); } });
    for (const r of REMOTES.values()) { // players' cars, through the same instancing as the traffic
      if (!r.car || !r.st || !r.st.car) continue; const mi = kit.indexOf(r.car.model);
      if (mi < 0) { r.car.g.visible = true; continue; }
      r.car.g.visible = false; const g = r.car.g, x = g.position.x - o[0], z = g.position.z - o[1];
      if (vis(x, z)) kit.add(mi, r.st.car.tint, x, g.position.y, z, g.rotation.y);
      seen.push([x, z, g.rotation.y, mi, 'p:' + r.id, g.position.y, r.st.car.tint]);
    }
    kit.end();
    for (const [key, t] of wrecks) wrecks.set(key, t - dt);
  }
  const seen = []; // cars drawn this frame (x, z, rot, look, key[, y]): aim assist and rockets read it

  // traffic shoves your car: kinematic, it doesn't stop
  function bump() {
    const v = ctx.player.inCar; if (!v) return;
    const px = v.pos.x - o[0], pz = v.pos.z - o[1];
    carsNear(tNow, px, pz, 9, (li, k, x, z, rot) => {
      if (wrecks.has(li * 64 + k)) return;
      const fx = Math.sin(rot), fz = Math.cos(rot), dx = px - x, dz = pz - z, along = dx * fx + dz * fz, lat = dx * fz - dz * fx;
      const hl = 2.7 + v.spec.L / 2 * 0.7, hwid = 1.0 + v.spec.W / 2 * 0.8; if (Math.abs(along) > hl || Math.abs(lat) > hwid) return;
      const pushLat = (hwid - Math.abs(lat)) * Math.sign(lat || 1), pushAl = (hl - Math.abs(along)) * Math.sign(along || 1);
      if (Math.abs(pushLat) < Math.abs(pushAl)) { v.pos.x += fz * pushLat; v.pos.z -= fx * pushLat; } else { v.pos.x += fx * pushAl; v.pos.z += fz * pushAl; }
      const rel = (v.vel.x - fx * H.v) * fx + (v.vel.y - fz * H.v) * fz, side = v.vel.x * fz - v.vel.y * fx;
      const hit = Math.abs(rel) + Math.abs(side) * 0.6; v.vel.x = fx * H.v * 0.9 + fz * side * 0.3; v.vel.y = fz * H.v * 0.9 - fx * side * 0.3;
      if (hit > 6) { ctx.damageCar(v, (hit - 5) * 1.5, null); ctx.sfx && ctx.sfx.crash && ctx.sfx.crash(Math.min(1, hit / 15)); if (ctx.sparks) ctx.sparks(v.pos.x, v.pos.y + 0.6, v.pos.z, 6); }
    });
  }

  // ---- the game, as this player sees it
  let st = null, role = '', myRound = 0, blind = false, lock = null, lockT = 0, saved = null, t = 0, lastPh = '';
  const me = () => api.myId();
  const roofSpot = () => { const a = R() * Math.PI * 2; return [rx + Math.cos(a) * 18, rz + Math.sin(a) * 18, R() * 6]; };
  function arm(on) { // the seeker's rocket launcher, given back how it was afterwards
    const p = ctx.player;
    if (on && !saved) { saved = { had: p.arsenal.rpg, w: p.weapon }; p.arsenal.rpg = 99; ctx.selectWeapon(RPG); }
    if (!on && saved) { if (saved.had === undefined) delete p.arsenal.rpg; else p.arsenal.rpg = saved.had; const w = saved.w, W = ctx.WEAPONS[w]; ctx.selectWeapon(w > 0 && W && p.arsenal[W.id] !== undefined ? w : 0); saved = null; }
  }
  const traffic = () => ({ type: LOOKS[(Math.random() * LOOKS.length) | 0], tint: TINTS[(Math.random() * TINTS.length) | 0] });
  function hud() {
    const now = api.now(), left = st && st.until ? st.until - now : 0, alive = st && st.hiders ? st.hiders.filter(h => h[2] === 0).length : 0;
    const P = st ? st.ph : 'wait', inRound = role === 'seeker' || role === 'hider';
    const sub = P === 'wait' ? 'Waiting for one more player' : P === 'count' ? 'Next round' : P === 'hide' ? (role === 'seeker' ? 'Eyes shut' : 'Hide!') : P === 'seek' ? (role === 'seeker' ? 'Find them' : role === 'hider' ? 'Stay hidden' : 'Watching') : 'Round over';
    HUD.bar('Hide & Seek', sub, P === 'wait' ? '' : clock(left), left < 20000 && P === 'seek' ? 'hot' : P === 'hide' ? 'warn' : '',
      P === 'hide' || P === 'seek' ? `Seeker <b>${HUD.esc(st.sn || '?')}</b> · <b>${alive}</b> hiding` : P === 'end' && st.res ? (st.res.w === 'seeker' ? `<b>${HUD.esc(st.res.sn)}</b> found everyone` : 'The hiders win') : inRound ? '' : 'Rounds start with 2 or more players');
    if (st && (P === 'hide' || P === 'seek' || P === 'end')) HUD.side('Hiders', st.hiders.map(h => ({ n: h[1], v: h[2] === 0 ? (P === 'end' ? 'safe' : 'hiding') : h[2] === 1 ? 'found' : 'left', me: h[0] === me(), out: h[2] !== 0 })));
    else HUD.side('', null);
    HUD.hint(role === 'seeker' && P === 'seek' ? '<b>Click</b> fire (a <b>locked</b> rocket homes in) · <kbd>F</kbd> car · <kbd>K</kbd> leave'
      : role === 'hider' ? 'Blend into the traffic, park among parked cars, hide in an alley · <kbd>F</kbd> get out · <kbd>K</kbd> leave'
      : 'Drive around while you wait · <kbd>R</kbd> back to the start · <kbd>K</kbd> leave (or the exit tunnel)');
    if (blind) HUD.fade(true, `You're the seeker. Eyes shut… ${clock(left)}`);
    drawScreen();
  }
  function drawScreen() {
    if (!st) return;
    const P = st.ph, rows = (st.hiders || []).map(h => ({ rank: h[2] === 0 ? '•' : 'x', name: h[1], val: h[2] === 0 ? 'HIDING' : h[2] === 1 ? 'FOUND' : 'LEFT', sub: '' }));
    screen.draw(rows.length ? rows : [], P === 'wait' ? 'WAITING FOR PLAYERS' : P === 'count' ? 'NEXT ROUND SOON' : P === 'end' ? (st.res && st.res.w === 'seeker' ? 'SEEKER WINS' : 'HIDERS WIN') : `SEEKER: ${String(st.sn || '').toUpperCase()}`, api.myName());
  }
  function setRole(r) {
    role = r;
    if (r !== 'seeker') { arm(false); lock = null; HUD.boxes([]); }
    if (blind && r !== 'seeker') { blind = false; HUD.fade(false); }
  }
  return {
    id: 'hide', A, group, crowd, start: arrival(A), mapBg: '#9c988f',
    spawn: () => arrival(A),
    onRoad: (x, z) => { const a = Math.abs; for (const s of streets) if (a(x - s) < ST + 0.5 || a(z - s) < ST + 0.5) return true; return false; },
    canShoot: () => role === 'seeker' && st && st.ph === 'seek',
    showPlayer: r => role !== 'seeker' || !(st && (st.ph === 'seek' || st.ph === 'hide')),
    enter() { role = ''; myRound = 0; hud(); },
    leave() { setRole(''); if (blind) { blind = false; HUD.fade(false); } HUD.boxes([]); for (const r of REMOTES.values()) if (r.car) r.car.g.visible = true; showTags(true); CHEER.stop(); },
    onState(s) {
      const was = st; st = s;
      if (s.ph !== lastPh) { lastPh = s.ph;
        if (s.ph === 'seek' && role === 'seeker') { blind = false; HUD.fade(false); arm(true); HUD.big('GO FIND THEM', `${s.hiders.filter(h => h[2] === 0).length} hiding`, 'red', 2.5); }
        if (s.ph === 'seek' && role === 'hider') HUD.big('THE SEEKER IS OUT', 'Keep your head down', 'small', 2.5);
        if (s.ph === 'count') HUD.big('NEXT ROUND', `in ${Math.ceil((s.until - api.now()) / 1000)} s`, 'small', 2);
        if (s.ph === 'wait' || s.ph === 'count') setRole('');
      }
      // a round is on and you're not in it (you came late): watch from the terrace
      if ((s.ph === 'hide' || s.ph === 'seek') && s.round !== myRound && s.seeker !== me() && !s.hiders.some(h => h[0] === me())) { myRound = s.round; role = 'watch'; api.onFoot(roofSpot()); api.notify('A round is on: watch from the terrace. You\'re in the next one.', '', 4000); }
      void was; hud();
    },
    onPlace(e) {
      const at = [e.x - o[0], e.z - o[1], e.rot];
      if (e.round) {
        myRound = e.round; setRole(e.role);
        if (e.role === 'hider') { const L = traffic(); api.placeCar(at, 0, true, { type: L.type[0], model: L.type[1], tint: L.tint }); HUD.big('HIDE!', '30 seconds. Blend in.', 'gold', 2.5); }
        else { api.placeCar(at, 0, true, { type: 'sports' }); api.hold(DEFS.ARENAS.hide.counts.hide); blind = true; HUD.fade(true, 'You\'re the seeker. Eyes shut…'); }
      } else if (e.hold) api.placeCar(at, 0, false);
      else api.placeCar(at, 0, false);
    },
    onEvent(e) {
      if (e.k === 'ko') {
        crowd.cheer(1, 4); crowd2.cheer(1, 4); CHEER.burst(0.8, Math.max(0.35, api.near(rx, rz, 900)));
        if (e.u === me()) { role = 'out'; HUD.big('FOUND', `${e.by} got you`, 'red', 3); setTimeout(() => { if (role === 'out') api.onFoot(roofSpot()); }, 1800); }
        else api.notify(`<b>${HUD.esc(e.by)}</b> found <b>${HUD.esc(e.n)}</b>`, 'red', 3000);
      }
      if (e.k === 'end') {
        const r = e.res; arm(false); if (blind) { blind = false; HUD.fade(false); }
        crowd.cheer(0.9, 5); crowd2.cheer(0.9, 5); CHEER.burst(0.7, 0.5);
        HUD.results(r.w === 'seeker' ? `${r.sn} wins` : 'Hiders win', r.why, [{ n: 'Found', v: String(r.kos) }, ...(r.surv || []).map(n => ({ n, v: 'never found' }))], 8);
        role = '';
      }
      if (e.k === 'round') api.notify(e.seeker === me() ? 'You\'re the <b>seeker</b>.' : `<b>${HUD.esc(e.sn)}</b> is the seeker. Hide!`, 'green', 3500);
      hud();
    },
    key(code) {
      if (code === 'KeyR') { if (role === 'hider' || role === 'seeker') return true; api.placeCar(arrival(A), 0, true); return true; }
      if (code === 'KeyF' && (blind || role === 'watch' || role === 'out')) return true; // no car for you on the terrace
      return false;
    },
    respawn() {
      if (role === 'seeker') api.placeCar([A.plaza[0], A.plaza[1] + 20, Math.PI], 0, true, { type: 'sports' });
      else if (role === 'hider') { const sp = DEFS.hsSpots(), s = sp[(Math.random() * sp.length) | 0], L = traffic(); api.placeCar(s, 0, true, { type: L.type[0], model: L.type[1], tint: L.tint }); }
      else if (role === 'out' || role === 'watch') api.onFoot(roofSpot());
      else api.placeCar(arrival(A), 0, true);
    },
    update(dt) {
      t += dt; HUD.update(dt); crowd.update(dt); crowd2.update(dt);
      drawCars(dt); bump();
      // the seeker: tags and markers off, aim assist on
      const hunting = role === 'seeker' && st && (st.ph === 'seek' || st.ph === 'hide');
      showTags(!hunting);
      if (role === 'seeker' && st && st.ph === 'seek') aim(dt); else if (lock) { lock = null; HUD.boxes([]); }
      rockets(dt);
      if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) hud();
      CHEER.near(Math.hypot(ctx.focusPos().x - o[0] - A.plaza[0], ctx.focusPos().z - o[1] - A.plaza[1]) - 20, 0.6); CHEER.update(dt);
    },
    drawMap(g) {
      g.fillStyle = '#3c3e41'; for (const s of streets) { g.fillRect(-WALL - 60, s - ST, (WALL + 60) * 2, ST * 2); g.fillRect(s - ST, -WALL - 60, ST * 2, (WALL + 60) * 2); }
      for (const [x, z, hx, hz] of boxes) { g.fillStyle = '#6d6a66'; g.fillRect(x - hx, z - hz, hx * 2, hz * 2); }
      for (let bx = 0; bx < H.n - 1; bx++) for (let bz = 0; bz < H.n - 1; bz++) { const k = kinds[bx + ',' + bz], hb = PITCH / 2 - ST - 4; if (k === 'park' || k === 'plaza' || k === 'lot') { g.fillStyle = k === 'park' ? '#5f8a42' : k === 'plaza' ? '#c9b99b' : '#4a4b4e'; g.fillRect(blockCenter(bx) - hb, blockCenter(bz) - hb, hb * 2, hb * 2); } }
    },
  };

  function showTags(on) { // the seeker sees cars, not names
    for (const r of REMOTES.values()) if (r.tag) { if (!on) r.tag.visible = false; }
    const b = document.getElementById('beacons'); if (b) b.style.display = on ? '' : 'none';
  }
  // ---- aim assist: box the cars in view near the crosshair, lock the closest to its line (with a clear view)
  function aim(dt) {
    const cam = ctx.camera, W = innerWidth, Hh = innerHeight, f = new THREE.Vector3(); cam.getWorldDirection(f);
    const cands = [], v3 = new THREE.Vector3(), cpos = cam.position;
    for (const c of seen) {
      const x = o[0] + c[0], z = o[1] + c[1], y = (c[5] || 0) + 0.9, dx = x - cpos.x, dy = y - cpos.y, dz = z - cpos.z, d = Math.hypot(dx, dy, dz);
      if (d > 330 || d < 4) continue; const cos = (dx * f.x + dy * f.y + dz * f.z) / d; if (cos < 0.94) continue;
      cands.push({ c, x, y, z, d, ang: Math.acos(Math.min(1, cos)) });
    }
    cands.sort((a, b) => a.ang - b.ang);
    let best = null; for (const k of cands.slice(0, 4)) { if (k.ang > 0.09 + 2.5 / k.d) break; if (ctx.los(cpos.x, cpos.y, cpos.z, k.x, k.y + 0.5, k.z)) { best = k; break; } }
    if (best) { lock = { key: best.c[4], x: best.x, y: best.y, z: best.z }; lockT = 0.4; } else if ((lockT -= dt) <= 0) lock = null;
    const boxes = [];
    for (const k of cands.slice(0, 10)) {
      v3.set(k.x, k.y, k.z).project(cam); if (v3.z > 1) continue;
      const sx = (v3.x + 1) / 2 * W, sy = (1 - v3.y) / 2 * Hh, size = Math.max(18, Math.min(220, 2600 / k.d));
      boxes.push({ x: sx, y: sy, w: size * 1.5, h: size * 0.8, lock: lock && lock.key === k.c[4] });
    }
    HUD.boxes(boxes);
  }
  // rockets: home in on the locked car; burst on traffic and on players' cars (the game's own rockets only know its
  // own vehicles)
  function rockets(dt) {
    const P = ctx.projs; if (!P) return;
    for (let i = P.length - 1; i >= 0; i--) {
      const r = P[i]; if (r.kind !== 'rocket') continue; const m = r.m, x = m.position.x - o[0], z = m.position.z - o[1];
      if (Math.abs(x) > 2000) continue;
      if (r.homing === undefined) r.homing = lock && role === 'seeker' ? lock.key : null; // a rocket fired with a lock homes in
      if (r.homing !== undefined && r.homing !== null) {
        const c = seen.find(s => s[4] === r.homing);
        if (c) { const tx = o[0] + c[0] - m.position.x, ty = (c[5] || 0) + 0.8 - m.position.y, tz = o[1] + c[1] - m.position.z, L = Math.hypot(tx, ty, tz) || 1, sp = r.vel.length(), k = Math.min(1, dt * 3.2);
          r.vel.x += (tx / L * sp - r.vel.x) * k; r.vel.y += (ty / L * sp - r.vel.y) * k; r.vel.z += (tz / L * sp - r.vel.z) * k; r.vel.setLength(sp); m.lookAt(m.position.x + r.vel.x, m.position.y + r.vel.y, m.position.z + r.vel.z); }
      }
      if (r.t < 0.12) continue;
      let hit = null;
      for (const c of seen) { const dx = x - c[0], dz = z - c[1]; if (dx * dx + dz * dz > 9) continue; const fx = Math.sin(c[2]), fz = Math.cos(c[2]); if (Math.abs(dx * fx + dz * fz) < 2.9 && Math.abs(dx * fz - dz * fx) < 1.2 && m.position.y < (c[5] || 0) + 2) { hit = c; break; } }
      if (!hit) continue;
      ctx.scene.remove(m); P.splice(i, 1);
      if (typeof hit[4] === 'number') { // a traffic car: it's a wreck now (for you; it rolls back out of the tunnel later)
        const L = LOOKS[hit[3]], v = new ctx.Vehicle(L[0], o[0] + hit[0], o[1] + hit[1], hit[2], hit[6], L[1]); ctx.settleCar(v); ctx.damageCar(v, 999, 'player', true); v.keep = false;
        wrecks.set(hit[4], 25); setTimeout(() => { if (!v.removed) v.remove(); }, 30000);
      }
      ctx.explosionAt(m.position.x, m.position.y, m.position.z, 9, 'player');
    }
  }
}
