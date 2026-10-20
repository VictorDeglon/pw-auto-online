// What every crew-garage world has: the two tunnels (the way in comes up a ramp into the light, the way out goes down
// one into the dark), each under a concrete portal building; the ground (one mesh with holes where the tunnels go
// under it); hills on the horizon; fences. All in the world's own frame (the group sits at the world's origin).
import { ctx } from '../ctx.js';
import { DEFS } from './defs.js';
import { canvasTex, concreteTex, rng, wallPoly, textSign, speckle, FONT_D } from './kit.js';

const T = DEFS.TUN, SHELL = 42, SHELL_H = 7.6, CEIL = 6.6;
let M = null;
function mats() {
  if (M) return M;
  const { THREE } = ctx;
  const stripe = canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#5b5a57'; g.fillRect(0, 0, w, h); g.fillStyle = '#f0b23a'; for (let y = 0; y < h; y += 64) { g.save(); g.translate(0, y); g.fillRect(0, 0, w, 10); g.restore(); } }, [1, 1]);
  M = {
    wall: new THREE.MeshStandardMaterial({ map: concreteTex([6, 1], '#8f8b84'), roughness: 0.95 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.9 }),
    shell: new THREE.MeshStandardMaterial({ map: concreteTex([4, 1], '#b7b1a6'), roughness: 0.9 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }),
    dark: new THREE.MeshBasicMaterial({ color: 0x050507 }),
    stripe: new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.8 }),
  };
  return M;
}
// u: along the tunnel away from the portal (into the ground); w: across. Returns [lx, lz] in the world frame.
function frame(p, sign) { const dx = Math.sin(p[2]) * sign, dz = Math.cos(p[2]) * sign; return (u, w) => [p[0] + dx * u + dz * w, p[1] + dz * u - dx * w]; }

// one tunnel: p = [x, z, rot] of the portal, sign = -1 for 'in' (the tunnel lies behind the way out), +1 for 'out'
function tunnel(group, A, p, sign, len, label, color) {
  const { THREE } = ctx, m = mats(), at = frame(p, sign), floorY = u => u <= 0 ? 0 : -T.depth * Math.min(1, u / T.ramp);
  const pos = [], nor = [], uv = [], fpos = [], lamps = [];
  const quad = (arr, a, b, c, d, n, uvs) => { for (const q of [a, b, c, a, c, d]) arr.push(...q); if (n) for (let i = 0; i < 6; i++) nor.push(...n); if (uvs) uv.push(...uvs); };
  const STEP = 5;
  for (let u = -0.5; u < len; u += STEP) {
    const u1 = Math.min(len, u + STEP), y0 = floorY(u), y1 = floorY(u1), [ax, az] = at(u, -T.hw), [bx, bz] = at(u, T.hw), [cx, cz] = at(u1, T.hw), [dx, dz] = at(u1, -T.hw);
    // floor (its own mesh), walls and ceiling (inward faces)
    fpos.push(ax, y0, az, dx, y1, dz, cx, y1, cz, ax, y0, az, cx, y1, cz, bx, y0, bz);
    const L = [ax, y0, az], Lt = [ax, y0 + CEIL, az], L1 = [dx, y1, dz], L1t = [dx, y1 + CEIL, dz], R = [bx, y0, bz], Rt = [bx, y0 + CEIL, bz], R1 = [cx, y1, cz], R1t = [cx, y1 + CEIL, cz];
    const uvw = [u / 8, 0, u1 / 8, 0, u1 / 8, 1, u / 8, 0, u1 / 8, 1, u / 8, 1];
    quad(pos, L, L1, L1t, Lt, null, uvw); quad(pos, R1, R, Rt, R1t, null, uvw); quad(pos, Lt, L1t, R1t, Rt, null, uvw);
    if (Math.round(u / STEP) % 2 === 0) lamps.push((u + u1) / 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  const walls = new THREE.Mesh(g, m.wall); walls.material.side = THREE.DoubleSide; walls.receiveShadow = true; group.add(walls);
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3)); fg.computeVertexNormals();
  const fl = new THREE.Mesh(fg, m.floor); fl.material.side = THREE.DoubleSide; fl.receiveShadow = true; group.add(fl);
  // lights down the middle of the ceiling, and a glow strip low on each wall
  const lg = new THREE.BoxGeometry(0.5, 0.12, 3.2), lm = new THREE.InstancedMesh(lg, m.lamp, lamps.length * 3), Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let k = 0; for (const u of lamps) { const y = floorY(u); q.setFromAxisAngle(up, p[2]);
    for (const [w, h, sc] of [[0, CEIL - 0.1, 1], [-T.hw + 0.05, 0.9, 0.5], [T.hw - 0.05, 0.9, 0.5]]) { const [x, z] = at(u, w); s.set(sc, 1, 1); lm.setMatrixAt(k++, Mx.compose(v.set(x, y + h, z), q, s)); } }
  lm.count = k; group.add(lm);
  // the end wall, dark
  { const [ex, ez] = at(len, 0), e = new THREE.Mesh(new THREE.PlaneGeometry(T.hw * 2, CEIL), m.dark); e.position.set(ex, floorY(len) + CEIL / 2, ez); e.rotation.y = p[2] + (sign < 0 ? 0 : Math.PI); group.add(e); }
  // the building over the whole tunnel: nothing on the surface can drive over the part that's underground (the
  // ground is one height per spot, so the tunnel floor is the ground there)
  const SL = len + 1.2, shell = new THREE.Group(), [sx, sz] = at(SL / 2 - 0.6, 0); shell.position.set(sx, 0, sz); shell.rotation.y = p[2] + (sign > 0 ? 0 : Math.PI);
  const box = (w, h, d, x, y, z, mm) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mm); o.position.set(x, y + h / 2, z); o.castShadow = o.receiveShadow = true; shell.add(o); return o; };
  const SW = T.hw * 2 + 3;
  box(1.5, SHELL_H + 12, SL, -(T.hw + 0.75), -12, 0, m.shell); box(1.5, SHELL_H + 12, SL, T.hw + 0.75, -12, 0, m.shell); box(SW, 1, SL, 0, SHELL_H - 1, 0, m.shell);
  box(SW, SHELL_H + 12, 1.2, 0, -12, SL / 2 - 0.6, m.shell); // the far end
  box(SW, SHELL_H - CEIL, 1.5, 0, CEIL, -SL / 2 + 0.75, m.shell); // the lintel over the mouth
  box(SW + 0.4, 0.6, 1.2, 0, SHELL_H - 0.1, -SL / 2 + 0.5, m.stripe);
  group.add(shell);
  const sign2 = textSign(label, { w: 9, h: 1.5, bg: '#0b0e15', fg: color, px: 512, border: color }); sign2.material.toneMapped = false;
  const [gx, gz] = at(-0.9, 0); sign2.position.set(gx, CEIL + 0.5, gz); sign2.rotation.y = p[2] + (sign > 0 ? Math.PI : 0); group.add(sign2);
  // collision: thick side walls (the portal building's sides, then the tunnel's own walls below ground), the end
  const o = A.o, W = (u0, u1, w0, w1, base, top) => { const a = at(u0, (w0 + w1) / 2), b = at(u1, (w0 + w1) / 2); wallPoly(o[0] + a[0], o[1] + a[1], o[0] + b[0], o[1] + b[1], Math.abs(w1 - w0), base, top); };
  for (const sd of [-1, 1]) W(-0.6, len + 1.2, sd * T.hw, sd * (T.hw + 1.5), -30, SHELL_H + 1);
  W(len, len + 1.2, -T.hw - 1.5, T.hw + 1.5, -30, SHELL_H + 1);
  // the hole the ground needs over the portal building
  const h = [at(-0.2, -T.hw - 0.6), at(-0.2, T.hw + 0.6), at(SHELL - 0.6, T.hw + 0.6), at(SHELL - 0.6, -T.hw - 0.6)];
  return { hole: h };
}
export function buildTunnels(group, A, color = '#f0b23a') {
  const a = tunnel(group, A, A.in, -1, T.inLen, 'CREW GARAGE', color), b = tunnel(group, A, A.out, 1, T.outLen, 'EXIT · POWAY', '#f3ede1');
  return [a.hole, b.hole];
}
// where you arrive: in the tunnel, 14 m from its end, facing out
export function arrival(A) { const at = frame(A.in, -1), [x, z] = at(T.inLen - 14, 0); return [x, z, A.in[2]]; }
// in the exit tunnel deep enough to go: u > 26 m past the mouth
export function inExit(A, lx, lz) { const p = A.out, dx = Math.sin(p[2]), dz = Math.cos(p[2]), u = (lx - p[0]) * dx + (lz - p[1]) * dz, w = (lx - p[0]) * dz - (lz - p[1]) * dx; return u > 26 && u < T.outLen && Math.abs(w) < T.hw + 1; }

// ground: a flat mesh over rect [x0, z0, x1, z1] with holes (polygons of [x, z]); uv in metres / tile
export function flatGround(group, rect, holes, mat, tile = 8) {
  const { THREE } = ctx, sh = new THREE.Shape();
  sh.moveTo(rect[0], -rect[1]); sh.lineTo(rect[2], -rect[1]); sh.lineTo(rect[2], -rect[3]); sh.lineTo(rect[0], -rect[3]); sh.closePath();
  for (const h of holes) { const p = new THREE.Path(); h.forEach(([x, z], i) => i ? p.lineTo(x, -z) : p.moveTo(x, -z)); p.closePath(); sh.holes.push(p); }
  const g = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), P = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < P.count; i++) uv.setXY(i, P.getX(i) / tile, -P.getZ(i) / tile);
  g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m); return m;
}
// ground that follows a height function: a grid over rect at `cell` m, triangles inside the holes dropped
export function gridGround(group, rect, cell, hfn, holes, mat, tile = 8) {
  const { THREE } = ctx, nx = Math.ceil((rect[2] - rect[0]) / cell), nz = Math.ceil((rect[3] - rect[1]) / cell), pos = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = rect[0] + i * cell, z = rect[1] + j * cell; pos.push(x, hfn(x, z), z); uv.push(x / tile, z / tile); }
  const inHole = (x, z) => holes.some(h => { let c = false; for (let i = 0, j = h.length - 1; i < h.length; j = i++) if ((h[i][1] > z) !== (h[j][1] > z) && x < (h[j][0] - h[i][0]) * (z - h[i][1]) / (h[j][1] - h[i][1]) + h[i][0]) c = !c; return c; });
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1, x = rect[0] + (i + 0.5) * cell, z = rect[1] + (j + 0.5) * cell;
    if (inHole(x, z)) continue; idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m); return m;
}
export function groundMat(base, cols, tile = 8, seed = 5) {
  const { THREE } = ctx;
  return new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (g, w, h) => speckle(g, w, h, base, cols, 9000, 0.6, 3, seed), [1, 1]), roughness: 1 });
}
// hills all round the horizon (no fog on them, so they read through the haze): a ring of ridges that stays centred on
// the camera just inside its far plane (which is shorter on the low graphics presets), like a backdrop
export function horizon(group, cx, cz, r = 1750, { lo = '#8f9fb0', hi = '#5d6b5a', seed = 9, h0 = 60, h1 = 260 } = {}) {
  const { THREE } = ctx, R = rng(seed), N = 220, pos = [], col = [], c0 = new THREE.Color(lo), c1 = new THREE.Color(hi), idx = [];
  const ridge = []; for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; ridge.push(h0 + (h1 - h0) * (0.5 + 0.3 * Math.sin(a * 3 + seed) + 0.2 * Math.sin(a * 7.3 + 1) + 0.12 * (R() - 0.5))); }
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2, x = Math.cos(a), z = Math.sin(a), h = ridge[i % N];
    pos.push(x, -40, z, x, h, z); col.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide })); m.frustumCulled = false; m.renderOrder = -1;
  m.onBeforeRender = (rd, sc, cam) => { const k = Math.min(r, cam.far * 0.9); m.matrixWorld.makeScale(k, 1, k).setPosition(cam.position.x, 0, cam.position.z); m.modelViewMatrix.multiplyMatrices(cam.matrixWorldInverse, m.matrixWorld); m.normalMatrix.getNormalMatrix(m.modelViewMatrix); };
  group.add(m); return m;
}
// a post-and-rail fence along a closed or open polyline (local), with collision
export function fence(group, A, pts, closed = true, { post = 0x6b5034, rail = 0x8a6b45, h = 1.3, every = 4 } = {}) {
  const { THREE } = ctx, items = [], rails = [], n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n], L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    for (let s = 0; s < L; s += every) items.push([ax + (bx - ax) * s / L, az + (bz - az) * s / L]);
    rails.push({ x: (ax + bx) / 2, z: (az + bz) / 2, ry, L });
    wallPoly(A.o[0] + ax, A.o[1] + az, A.o[0] + bx, A.o[1] + bz, 0.5, -20, h + 1);
  }
  const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, h, 0.16).translate(0, h / 2, 0), new THREE.MeshStandardMaterial({ color: post, roughness: 0.9 }), items.length), Mx = new THREE.Matrix4();
  items.forEach(([x, z], i) => pm.setMatrixAt(i, Mx.makeTranslation(x, 0, z))); pm.castShadow = true; group.add(pm);
  const rg = new THREE.BoxGeometry(0.06, 0.12, 1), rm = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: rail, roughness: 0.85 }), rails.length * 2), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
  rails.forEach((r, i) => { q.setFromAxisAngle(up, r.ry); for (let k = 0; k < 2; k++) rm.setMatrixAt(i * 2 + k, Mx.compose(v.set(r.x, h * (k ? 0.92 : 0.5), r.z), q, s.set(1, 1, r.L))); });
  rm.castShadow = true; group.add(rm);
}
export { FONT_D };
