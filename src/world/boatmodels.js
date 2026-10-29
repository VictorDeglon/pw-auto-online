// Boats, built to look like the ones on San Diego's water: a planing hull lofted from stations (a deep V at the
// transom flattening into a fine entry, a chine, flared topsides rising to the bow), a cockpit with its liner, sole and
// gunwale cap, and the gear that makes each type read from across the water.
//   jon       Lake Poway's rental boats: riveted aluminium, bench seats, a small tiller outboard
//   rowboat   an aluminium rowboat with oars in their locks
//   pedal     the lake's pedal boats: twin white pontoon hulls, two seats, a sun canopy
//   kayak     a sit-on-top kayak with its paddle
//   runabout  a bowrider: bow seats, a split windscreen, helm and passenger buckets, a sterndrive
//   speedboat a deep-V sport boat: long foredeck, low screen, twin big outboards
//   center    a center-console fishing boat: T-top with canvas and rod holders, leaning post, twin outboards
//   pontoon   three aluminium tubes, a carpeted deck, fence panels, lounges, a bimini
//   sailboat  a 30 ft sloop: cabin trunk with ports, keel, mast and boom with the main under its cover, furled jib,
//             standing rigging, lifelines, a wheel
//   yacht     a 50 ft motor yacht: high flared bow, superstructure with tinted glass, flybridge, radar arch, swim platform
// Everything is merged by material, a handful of draws a boat. The hull stands with its waterline at y = 0, the bow
// toward +z. userData: { L, W, draft, helm: [x, y, z] where the skipper sits }
//   const g = boatModel(THREE, 'center', { hull: 0xffffff, trim: 0x1f3a66, seed: 7 })

function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const MATS = new Map(); // shared across boats: one program each, compiled once
function mats(THREE) {
  if (MATS.size) return MATS;
  const S = (o) => new THREE.MeshStandardMaterial(o), P = (o) => new THREE.MeshPhysicalMaterial(o);
  MATS.set('gel', P({ color: 0xffffff, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, vertexColors: true })); // gelcoat, tinted per boat by vertex colour
  MATS.set('alu', S({ color: 0xb9bec2, roughness: 0.42, metalness: 0.85, vertexColors: true }));
  MATS.set('steel', S({ color: 0xe6e8ea, roughness: 0.16, metalness: 1 }));            // stainless rails and fittings
  MATS.set('vinyl', S({ color: 0xffffff, roughness: 0.48, metalness: 0, vertexColors: true }));
  MATS.set('canvas', S({ color: 0xffffff, roughness: 0.9, metalness: 0, vertexColors: true, side: THREE.DoubleSide }));
  MATS.set('teak', S({ color: 0x9a6a3f, roughness: 0.7, metalness: 0 }));
  MATS.set('black', S({ color: 0x111214, roughness: 0.35, metalness: 0.1, vertexColors: true }));
  MATS.set('engine', P({ color: 0xffffff, roughness: 0.25, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.1, vertexColors: true }));
  MATS.set('glass', P({ color: 0x1d2a30, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false }));
  MATS.set('tint', P({ color: 0x0b1014, roughness: 0.05, metalness: 0.4, clearcoat: 1 }));       // a yacht's dark glazing
  MATS.set('carpet', S({ color: 0x6b6f70, roughness: 1, metalness: 0, vertexColors: true }));
  MATS.set('bottom', S({ color: 0x23324a, roughness: 0.75, metalness: 0, vertexColors: true }));  // antifouling below the waterline
  MATS.set('lamp', S({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, vertexColors: true }));
  for (const [k, m] of MATS) if (k !== 'glass') m.side = THREE.DoubleSide; // hull shells are seen from inside the cockpit too
  return MATS;
}

// ---------------------------------------------------------------- geometry collector: one merged geometry per material
class B {
  constructor(THREE) { this.T = THREE; this.parts = new Map(); this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.n3 = new THREE.Matrix3(); }
  put(mat, geo, m, col = [1, 1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo; if (m) { g.applyMatrix4(m); }
    let L = this.parts.get(mat); if (!L) this.parts.set(mat, L = { p: [], n: [], c: [] });
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) { L.p.push(P.getX(i), P.getY(i), P.getZ(i)); L.n.push(N.getX(i), N.getY(i), N.getZ(i)); L.c.push(col[0], col[1], col[2]); }
    if (g !== geo) g.dispose(); geo.dispose();
  }
  at(x, y, z, ry = 0, rx = 0, rz = 0) { const T = this.T; return new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, 'YXZ')), new T.Vector3(1, 1, 1)); }
  box(mat, c, s, col, ry = 0, rx = 0, rz = 0) { this.put(mat, new this.T.BoxGeometry(s[0], s[1], s[2]), this.at(c[0], c[1], c[2], ry, rx, rz), col); }
  rbox(mat, c, s, col, r = 0.04) { // a box with rounded edges (cushions, consoles)
    const T = this.T, g = new T.BoxGeometry(s[0], s[1], s[2], 3, 3, 3), P = g.attributes.position, h = [s[0] / 2, s[1] / 2, s[2] / 2];
    for (let i = 0; i < P.count; i++) { const v = [P.getX(i), P.getY(i), P.getZ(i)], k = v.map((x, a) => Math.max(0, Math.abs(x) - (h[a] - r)) * Math.sign(x)); const inner = v.map((x, a) => x - k[a]), L = Math.hypot(...k); if (L > 1e-6) for (let a = 0; a < 3; a++) v[a] = inner[a] + k[a] / L * Math.min(L, r); P.setXYZ(i, v[0], v[1], v[2]); }
    g.computeVertexNormals(); this.put(mat, g, this.at(c[0], c[1], c[2]), col);
  }
  tube(mat, a, b, r, col, sides = 8) {
    const T = this.T, d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(); if (L < 1e-4) return;
    const g = new T.CylinderGeometry(r, r, L, sides, 1, true); this.q.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    this.put(mat, g, new T.Matrix4().compose(new T.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), this.q, new T.Vector3(1, 1, 1)), col);
  }
  cyl(mat, a, b, r0, r1, col, sides = 12) {
    const T = this.T, d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(); if (L < 1e-4) return;
    const g = new T.CylinderGeometry(r1, r0, L, sides); this.q.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    this.put(mat, g, new T.Matrix4().compose(new T.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), this.q, new T.Vector3(1, 1, 1)), col);
  }
  // a bent tube through points (rails, frames)
  path(mat, pts, r, col, sides = 8) { for (let i = 0; i + 1 < pts.length; i++) { this.tube(mat, pts[i], pts[i + 1], r, col, sides); if (i) this.put(mat, new this.T.SphereGeometry(r, sides, 4), this.at(...pts[i]), col); } }
  // a side profile [[z, y], ...] extruded across the beam (deck houses, flybridges)
  side(mat, pts, width, col, cx = 0, bevel = 0.04) {
    const T = this.T, sh = new T.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    const g = new T.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 }); g.rotateY(-Math.PI / 2); g.translate(cx + width / 2 - bevel, 0, 0); g.computeVertexNormals(); this.put(mat, g, null, col);
  }
  // raw triangles (x, y, z per vertex), normals from the faces
  tris(mat, P, col) { const T = this.T, g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); this.put(mat, g, null, col); }
  group(MS) {
    const T = this.T, g = new T.Group();
    for (const [k, L] of this.parts) {
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(L.p, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(L.n, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(L.c, 3));
      geo.computeBoundingSphere(); const m = new T.Mesh(geo, MS.get(k)); m.castShadow = k !== 'glass'; m.receiveShadow = true; m.name = 'boat:' + k; g.add(m);
    }
    return g;
  }
}
const rgb = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255].map(c => Math.pow(c, 2.2)); // to linear for vertex colours

// ---------------------------------------------------------------- the hull
// o: L, W (beam), D (transom depth keel to sheer), dead (deadrise at the transom, rad), rise (sheer rise to the bow),
//    draft (waterline above the keel at the transom), flare, entry (0..1 how fine the bow), keel (a fin keel: depth),
//    round (a displacement hull: round bilge instead of a hard chine), stripe colour, bottom paint
function hull(K, o, col, trim) {
  const L = o.L, W = o.W, NS = 30, NP = 9, st = [];
  const beamAt = t => { const k = Math.max(0, (t - 0.38) / 0.62); return W / 2 * (t < 0.06 ? 0.93 + t : 1) * (1 - Math.pow(k, o.entry || 1.7)) + (t >= 1 ? 0 : 0); };
  const sheerAt = t => o.D + (o.rise || 0.35) * Math.pow(t, 1.8);
  const keelAt = t => (o.D * 0.55 + (o.rise || 0.35)) * Math.pow(Math.max(0, (t - 0.62) / 0.38), 2.2) * 0.95;
  for (let s = 0; s <= NS; s++) {
    const t = s / NS, z = -L / 2 + t * L, b = Math.max(0.002, beamAt(t)), ky = keelAt(t), sy = sheerAt(t), dr = Math.min(1.2, (o.dead || 0.38) + (1.15 - (o.dead || 0.38)) * Math.pow(t, 2.2));
    const pts = [];
    if (o.round) { // round bilge: a half-ellipse from keel to sheer
      for (let i = 0; i <= NP; i++) { const a = i / NP * Math.PI / 2, x = Math.sin(a) * b, y = ky + (1 - Math.cos(a)) * (sy - ky) * 0.55 + (i / NP) * (sy - ky) * 0.45; pts.push([x * (1 + (o.flare || 0) * (i / NP) ** 2), y, z]); }
    } else {
      const cx = b * 0.86, cy = Math.min(sy - 0.1, ky + Math.tan(dr) * cx * 0.92), np2 = 4;
      for (let i = 0; i <= np2; i++) { const f = i / np2; pts.push([cx * f, ky + (cy - ky) * (f + 0.12 * f * (1 - f)), z]); } // the V bottom, a little convex
      pts.push([cx + 0.02 * W, cy - 0.015, z]); // the chine flat
      for (let i = 1; i <= NP - np2 - 1; i++) { const f = i / (NP - np2 - 1); pts.push([cx + (b - cx) * Math.pow(f, 0.6) * (1 + (o.flare || 0.06) * f), cy + (sy - cy) * f, z]); } // topsides, flared
    }
    st.push(pts);
  }
  // the stem: the last station collapses to the centreline
  const tri = [], low = [], P = (a, b2, c) => tri.push(...a, ...b2, ...c), Q = (out, a, b2, c, d) => out.push(...a, ...b2, ...c, ...a, ...c, ...d);
  const wl = o.draft ?? o.D * 0.35, M = s => s.map(p => [-p[0], p[1], p[2]]);
  for (let s = 0; s < NS; s++) for (const side of [1, -1]) {
    const A = side > 0 ? st[s] : M(st[s]), C = side > 0 ? st[s + 1] : M(st[s + 1]);
    for (let i = 0; i + 1 < A.length; i++) {
      const a = A[i], b2 = A[i + 1], c = C[i + 1], d = C[i], under = (a[1] + b2[1] + c[1] + d[1]) / 4 < wl;
      const out = under && o.bottom !== false ? low : tri; if (side > 0) Q(out, a, d, c, b2); else Q(out, a, b2, c, d);
    }
  }
  // transom
  { const A = st[0], R = M(st[0]); for (let i = 0; i + 1 < A.length; i++) Q((A[i][1] + A[i + 1][1]) / 2 < wl && o.bottom !== false ? low : tri, A[i], A[i + 1], R[i + 1], R[i]); }
  K.tris('gel', tri, col); if (low.length) K.tris('bottom', low, o.bottomCol || [1, 1, 1]);
  // the boot stripe and a sheer stripe in the trim colour, the rub rail
  const strip = (h0, h1, mat, c) => { const out = []; for (let s = 0; s < NS; s++) for (const side of [1, -1]) {
      const y = t => [h0(t), h1(t)], t0 = s / NS, t1 = (s + 1) / NS, z0 = -L / 2 + t0 * L, z1 = -L / 2 + t1 * L, b0 = beamAt(t0) * (1 + (o.flare || 0.06)) + 0.004, b1 = beamAt(t1) * (1 + (o.flare || 0.06)) + 0.004, [ya, yb] = y(t0), [yc, yd] = y(t1);
      const a = [side * b0, ya, z0], b2 = [side * b0, yb, z0], c2 = [side * b1, yd, z1], d = [side * b1, yc, z1]; if (side > 0) Q(out, a, d, c2, b2); else Q(out, a, b2, c2, d); }
    K.tris(mat, out, c); };
  if (trim) strip(t => sheerAt(t) - 0.2 - 0.05 * t, t => sheerAt(t) - 0.06, 'gel', trim);
  // rub rail along the sheer
  const rail = []; for (let s = 0; s <= NS; s++) { const t = s / NS; rail.push([beamAt(t) * (1 + (o.flare || 0.06)) + 0.015, sheerAt(t), -L / 2 + t * L]); }
  for (const side of [1, -1]) K.path('black', rail.map(p => [p[0] * side, p[1], p[2]]), 0.025, [1, 1, 1], 6);
  return { beamAt, sheerAt, keelAt, st, wl };
}
// the cockpit: a sole (floor), liner sides inside the hull, a gunwale cap; z0..z1 the open part
function cockpit(K, H, o, z0, z1, floorY, col, solMat = 'gel') {
  const L = o.L, tz = z => (z + L / 2) / L, inset = 0.07, N = 12, sole = [], liner = [], cap = [];
  for (let i = 0; i < N; i++) {
    const za = z0 + (z1 - z0) * i / N, zb = z0 + (z1 - z0) * (i + 1) / N, ba = H.beamAt(tz(za)) - inset, bb = H.beamAt(tz(zb)) - inset, sa = H.sheerAt(tz(za)), sb = H.sheerAt(tz(zb));
    const fa = Math.min(ba, ba * 0.92), fb = Math.min(bb, bb * 0.92);
    sole.push(-fa, floorY, za, fa, floorY, za, fb, floorY, zb, -fa, floorY, za, fb, floorY, zb, -fb, floorY, zb);
    for (const s of [1, -1]) { const a = [s * fa, floorY, za], b2 = [s * fb, floorY, zb], c = [s * bb, sb - 0.03, zb], d = [s * ba, sa - 0.03, za];
      if (s > 0) liner.push(...a, ...d, ...c, ...a, ...c, ...b2); else liner.push(...a, ...b2, ...c, ...a, ...c, ...d);
      const e = [s * (ba + inset + 0.03), sa + 0.03, za], f = [s * (bb + inset + 0.03), sb + 0.03, zb], g2 = [s * (bb - 0.03), sb + 0.03, zb], h = [s * (ba - 0.03), sa + 0.03, za];
      if (s > 0) cap.push(...h, ...g2, ...f, ...h, ...f, ...e); else cap.push(...h, ...e, ...f, ...h, ...f, ...g2); }
  }
  K.tris(solMat, sole, solMat === 'gel' ? [0.86, 0.86, 0.84] : [1, 1, 1]); K.tris('gel', liner, [0.93, 0.93, 0.9]); K.tris('gel', cap, col);
  // the transom's inside face and the deck forward of the cockpit
  { const b = H.beamAt(tz(z0)) - inset, s = H.sheerAt(tz(z0)); K.tris('gel', [-b, floorY, z0, b, floorY, z0, b, s, z0, -b, floorY, z0, b, s, z0, -b, s, z0], [0.93, 0.93, 0.9]); }
  if (z1 < L / 2 - 0.05) { const fd = []; const N2 = 10; for (let i = 0; i < N2; i++) { const za = z1 + (L / 2 - z1) * i / N2, zb = z1 + (L / 2 - z1) * (i + 1) / N2, ba = H.beamAt(tz(za)) + 0.03, bb = H.beamAt(tz(zb)) + 0.03, sa = H.sheerAt(tz(za)) + 0.03, sb = H.sheerAt(tz(zb)) + 0.03, cr = 0.06;
      fd.push(-ba, sa, za, 0, sb + cr, zb, 0, sa + cr, za, -ba, sa, za, -bb, sb, zb, 0, sb + cr, zb, ba, sa, za, 0, sa + cr, za, 0, sb + cr, zb, ba, sa, za, 0, sb + cr, zb, bb, sb, zb); }
    K.tris('gel', fd, col); K.box('gel', [0, H.sheerAt(tz(z1)) - (H.sheerAt(tz(z1)) - floorY) / 2, z1], [H.beamAt(tz(z1)) * 2 - 0.2, H.sheerAt(tz(z1)) - floorY, 0.05], [0.93, 0.93, 0.9]); }
}

// ---------------------------------------------------------------- outboards and parts
function outboard(K, x, y, z, hp, cowl) { // y: the transom top; the motor hangs off the back (-z)
  const s = 0.7 + hp / 300 * 0.6;
  K.box('black', [x, y - 0.12 * s, z - 0.08], [0.22 * s, 0.32 * s, 0.14], [1, 1, 1]); // bracket
  K.rbox('engine', [x, y + 0.32 * s, z - 0.36 * s], [0.5 * s, 0.62 * s, 0.72 * s], cowl, 0.14 * s); // cowling
  K.box('black', [x, y + 0.03 * s, z - 0.34 * s], [0.42 * s, 0.06, 0.66 * s], [1, 1, 1]); // the split line / lower cowl
  K.rbox('engine', [x, y - 0.38 * s, z - 0.36 * s], [0.3 * s, 0.72 * s, 0.42 * s], [0.13, 0.13, 0.14], 0.08 * s); // midsection
  K.rbox('engine', [x, y - 0.92 * s, z - 0.33 * s], [0.12 * s, 0.5 * s, 0.34 * s], [0.13, 0.13, 0.14], 0.05 * s); // lower unit
  K.box('engine', [x, y - 0.66 * s, z - 0.36 * s], [0.38 * s, 0.03, 0.5 * s], [0.13, 0.13, 0.14]); // cavitation plate
  K.cyl('engine', [x, y - 1.1 * s, z - 0.15 * s], [x, y - 1.1 * s, z - 0.55 * s], 0.075 * s, 0.05 * s, [0.13, 0.13, 0.14], 10); // the torpedo
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; K.box('steel', [x + Math.cos(a) * 0.1 * s, y - 1.1 * s + Math.sin(a) * 0.1 * s, z - 0.6 * s], [0.06 * s, 0.17 * s, 0.015], [1, 1, 1], 0, 0, a + 0.4); } // the prop
  K.box('engine', [x, y - 1.27 * s, z - 0.36 * s], [0.03, 0.15 * s, 0.22 * s], [0.13, 0.13, 0.14]); // skeg
}
function seat(K, x, y, z, w, d, col, back = 0.45, ry = 0) { // a cushioned seat with its back
  const c = Math.cos(ry), sn = Math.sin(ry), at = (dx, dz) => [x + dx * c + dz * sn, z - dx * sn + dz * c];
  K.rbox('gel', [x, y - 0.14, z], [w * 0.92, 0.28, d * 0.9], [0.93, 0.93, 0.9], 0.04); // the box under it
  { const p = at(0, 0); K.rbox('vinyl', [p[0], y + 0.06, p[1]], [w, 0.13, d], col, 0.05); }
  if (back) { const p = at(0, -d / 2 + 0.06); K.rbox('vinyl', [p[0], y + 0.13 + back / 2, p[1]], [w, back, 0.12], col, 0.05); }
}
function wheel(K, x, y, z, tilt) { // a destroyer-style helm wheel
  const T = K.T, g = new T.TorusGeometry(0.18, 0.018, 6, 20); K.put('black', g, K.at(x, y, z, 0, tilt), [1, 1, 1]);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; K.box('steel', [x + Math.cos(a) * 0.09, y + Math.sin(a) * 0.09 * Math.cos(tilt), z + Math.sin(a) * 0.09 * Math.sin(tilt)], [0.18, 0.012, 0.012], [1, 1, 1], 0, tilt, a); }
  K.cyl('steel', [x, y, z], [x, y - 0.06 * Math.cos(tilt), z - 0.12], 0.025, 0.03, [1, 1, 1], 8);
}
function cleat(K, x, y, z, ry = 0) { K.box('steel', [x, y + 0.03, z], [0.16, 0.025, 0.03], [1, 1, 1], ry); K.box('steel', [x, y + 0.01, z], [0.05, 0.04, 0.03], [1, 1, 1], ry); }
function navLights(K, H, o) { const zf = o.L / 2 - 0.35, yf = H.sheerAt(1 - 0.35 / o.L) + 0.05; K.box('lamp', [-0.06, yf, zf], [0.06, 0.04, 0.08], [1, 0.05, 0.05]); K.box('lamp', [0.06, yf, zf], [0.06, 0.04, 0.08], [0.05, 1, 0.1]); }
function regNumbers(K, H, o, text, side) { void K; void H; void o; void text; void side; } // drawn as decals by the caller when it has a canvas helper

// ---------------------------------------------------------------- the types
const BUILD = {
  jon(K, o, r) { // riveted aluminium, square-ish bow, benches
    const L = 4.3, H = hull(K, { L, W: 1.55, D: 0.55, dead: 0.12, rise: 0.12, entry: 2.6, flare: 0.04, draft: 0.12, bottom: false }, [0.72, 0.74, 0.76], null);
    K.parts.get('gel') && (K.parts.set('alu', K.parts.get('gel')), K.parts.delete('gel'));
    cockpit(K, H, { L }, -L / 2 + 0.05, L / 2 - 0.4, 0.12, [0.7, 0.72, 0.74], 'alu'); if (K.parts.get('gel')) { const g = K.parts.get('gel'), a = K.parts.get('alu'); a.p.push(...g.p); a.n.push(...g.n); a.c.push(...g.c); K.parts.delete('gel'); }
    for (const z of [-1.5, -0.2, 1.0]) K.box('alu', [0, 0.38, z], [H.beamAt((z + L / 2) / L) * 2 - 0.1, 0.03, 0.26], [0.8, 0.82, 0.84]);
    for (let z = -2; z < 1.6; z += 0.3) for (const s of [1, -1]) K.box('steel', [s * (H.beamAt((z + L / 2) / L) + 0.01), 0.42, z], [0.01, 0.015, 0.015], [0.5, 0.5, 0.5]); // rivets
    outboard(K, 0, 0.55, -L / 2, 15, o.engine || [0.08, 0.08, 0.09]); K.cyl('black', [0, 0.95, -L / 2 - 0.25], [0, 0.85, -L / 2 + 0.4], 0.02, 0.02, [1, 1, 1], 6); // tiller
    return { L, W: 1.55, draft: 0.12, helm: [0.2, 0.42, -1.6] };
  },
  rowboat(K, o, r) {
    const L = 3.7, H = hull(K, { L, W: 1.4, D: 0.5, dead: 0.2, rise: 0.22, entry: 1.5, flare: 0.08, draft: 0.12, bottom: false }, [0.74, 0.76, 0.78], o.trim || null);
    const g = K.parts.get('gel'); K.parts.set('alu', g); K.parts.delete('gel');
    cockpit(K, H, { L }, -L / 2 + 0.04, L / 2 - 0.35, 0.1, [0.72, 0.74, 0.76], 'alu'); { const g2 = K.parts.get('gel'), a = K.parts.get('alu'); if (g2) { a.p.push(...g2.p); a.n.push(...g2.n); a.c.push(...g2.c); K.parts.delete('gel'); } }
    for (const z of [-1.3, -0.1, 0.9]) K.box('alu', [0, 0.36, z], [H.beamAt((z + L / 2) / L) * 2 - 0.08, 0.03, 0.25], [0.82, 0.84, 0.86]);
    for (const s of [1, -1]) { const y = H.sheerAt(0.5) + 0.04; K.cyl('steel', [s * 0.66, y, 0.05], [s * 0.66, y + 0.07, 0.05], 0.015, 0.015, [1, 1, 1], 6); // oarlocks and the oars shipped
      K.tube('teak', [s * 0.6, y + 0.1, 0.05 - 1.0], [s * 0.72, y + 0.06, 0.05 + 1.1], 0.022); K.box('teak', [s * 0.74, y + 0.05, 1.25], [0.02, 0.12, 0.42], [1, 1, 1], 0.1); }
    return { L, W: 1.4, draft: 0.12, helm: [0, 0.4, -0.1] };
  },
  pedal(K, o, r) { // twin moulded hulls, a deck, two seats, a canopy
    for (const s of [-0.6, 0.6]) { K.rbox('gel', [s, 0.08, 0], [0.42, 0.4, 2.6], [0.95, 0.95, 0.94], 0.18); K.rbox('gel', [s, 0.06, 1.2], [0.36, 0.3, 0.5], o.trim || [0.1, 0.35, 0.75], 0.14); }
    K.rbox('gel', [0, 0.32, -0.1], [1.75, 0.14, 2.0], [0.94, 0.94, 0.92], 0.06);
    for (const x of [-0.38, 0.38]) seat(K, x, 0.52, -0.3, 0.55, 0.5, o.trim || [0.1, 0.35, 0.75], 0.45);
    for (const x of [-0.38, 0.38]) { K.box('black', [x, 0.42, 0.5], [0.3, 0.06, 0.3], [1, 1, 1]); }
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.5], [0.8, 0.5]]) K.tube('steel', [x, 0.38, z], [x, 1.55, z], 0.018, [1, 1, 1]);
    K.box('canvas', [0, 1.57, -0.15], [1.75, 0.03, 1.5], o.canvas || [0.85, 0.2, 0.15]);
    return { L: 2.6, W: 1.75, draft: 0.12, wl: 0, helm: [-0.38, 0.55, -0.3] };
  },
  kayak(K, o, r) {
    const H = hull(K, { L: 3.6, W: 0.78, D: 0.32, dead: 0.3, rise: 0.12, entry: 1.2, flare: 0, draft: 0.1, round: true, bottom: false }, o.trim || [0.95, 0.55, 0.05], null);
    for (let i = 0; i < 2; i++) { // deck: a rounded top
      const T = K.T, g = new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(0.38, 0.12, 1.75); K.put('gel', g, K.at(0, 0.3, 0), o.trim || [0.95, 0.55, 0.05]); break; }
    K.rbox('black', [0, 0.36, -0.15], [0.42, 0.06, 0.6], [1, 1, 1], 0.05); K.tube('black', [-1.1, 0.42, 0.25], [1.1, 0.42, 0.25], 0.016); for (const s of [-1, 1]) K.box('black', [s * 1.15, 0.42, 0.25], [0.18, 0.01, 0.08], [1, 1, 1]);
    void H; return { L: 3.6, W: 0.78, draft: 0.1, helm: [0, 0.38, -0.15] };
  },
  runabout(K, o, r) { // a 20 ft bowrider
    const L = 6.2, W = 2.4, col = o.hull || [0.97, 0.97, 0.96], tr = o.trim || [0.1, 0.18, 0.38];
    const H = hull(K, { L, W, D: 0.95, dead: 0.36, rise: 0.32, entry: 1.6, flare: 0.07, draft: 0.38 }, col, tr);
    cockpit(K, H, { L }, -L / 2 + 0.25, L / 2 - 0.55, 0.35, col);
    const sc = o.seat || [0.92, 0.9, 0.84];
    seat(K, 0, 0.62, -L / 2 + 0.75, W - 0.45, 0.6, sc, 0.42); // the stern bench
    for (const x of [-0.5, 0.5]) seat(K, x, 0.66, -0.15, 0.55, 0.55, sc, 0.55); // buckets
    { const hw = z => H.beamAt((z + L / 2) / L) - 0.12; for (const s of [-1, 1]) seat(K, s * (hw(1.3) - 0.22), 0.62, 1.3, 0.42, 0.7, sc, 0.0); seat(K, 0, 0.62, 2.0, hw(2.0) * 2 - 0.1, 0.45, sc, 0.0); } // the bow lounge, inside the flare
    K.rbox('gel', [-0.55, 0.75, 0.55], [0.7, 0.75, 0.55], col, 0.08); K.rbox('gel', [0.55, 0.75, 0.55], [0.7, 0.75, 0.55], col, 0.08); // helm and passenger consoles
    K.box('black', [-0.55, 1.13, 0.6], [0.6, 0.02, 0.42], [1, 1, 1], 0, 0.3); wheel(K, -0.55, 1.12, 0.38, 0.5); K.cyl('black', [-0.32, 1.12, 0.42], [-0.32, 1.32, 0.4], 0.015, 0.012, [1, 1, 1], 6);
    for (const x of [-0.7, -0.55, -0.4]) K.cyl('black', [x, 1.15, 0.72], [x, 1.16, 0.7], 0.035, 0.035, [1, 1, 1], 10);
    // the split windscreen in its frame
    const ws = []; for (let i = 0; i <= 10; i++) { const a = -1 + i / 5, x = a * (W / 2 - 0.12), z = 0.95 + (1 - a * a) * 0.35; ws.push([x, z]); }
    const g = []; for (let i = 0; i < 10; i++) { if (i === 4 || i === 5) continue; const [x0, z0] = ws[i], [x1, z1] = ws[i + 1], y0 = H.sheerAt(0.65) + 0.03, y1 = y0 + 0.42;
      g.push(x0, y0, z0, x1, y0, z1, x1, y1, z1 - 0.18, x0, y0, z0, x1, y1, z1 - 0.18, x0, y1, z0 - 0.18); }
    K.tris('glass', g); K.path('alu', ws.map(([x, z]) => [x, H.sheerAt(0.65) + 0.45, z - 0.18]), 0.012, [0.9, 0.9, 0.92]);
    // bow rail, cleats, nav lights, the sterndrive (an engine hatch, a leg)
    const yr = t => H.sheerAt(t) + 0.32; const pr = []; for (let k = 0; k <= 8; k++) { const t = 0.72 + k * 0.025; pr.push([H.beamAt(t) - 0.05, yr(t), -L / 2 + t * L]); }
    for (const s of [1, -1]) { K.path('steel', pr.map(p => [p[0] * s, p[1], p[2]]), 0.014); for (const p of pr.filter((_, i) => i % 3 === 0)) K.tube('steel', [p[0] * s, H.sheerAt((p[2] + L / 2) / L) + 0.03, p[2]], [p[0] * s, p[1], p[2]], 0.012); }
    for (const z of [-L / 2 + 0.3, 0.2, L / 2 - 0.6]) for (const s of [1, -1]) cleat(K, s * (H.beamAt((z + L / 2) / L) - 0.06), H.sheerAt((z + L / 2) / L) + 0.03, z);
    navLights(K, H, { L }); K.tube('steel', [0, H.sheerAt(0) + 0.03, -L / 2 + 0.12], [0, H.sheerAt(0) + 1.0, -L / 2 + 0.12], 0.012); K.box('lamp', [0, H.sheerAt(0) + 1.03, -L / 2 + 0.12], [0.05, 0.05, 0.05], [1, 1, 1]);
    K.rbox('gel', [0, 0.78, -L / 2 + 0.55], [1.3, 0.12, 0.6], [0.9, 0.9, 0.88], 0.05);
    K.rbox('engine', [0, -0.15, -L / 2 - 0.18], [0.2, 0.62, 0.3], [0.15, 0.15, 0.16], 0.06); K.cyl('engine', [0, -0.42, -L / 2 - 0.1], [0, -0.42, -L / 2 - 0.42], 0.07, 0.05, [0.15, 0.15, 0.16]);
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; K.box('steel', [Math.cos(a) * 0.11, -0.42 + Math.sin(a) * 0.11, -L / 2 - 0.46], [0.07, 0.19, 0.015], [1, 1, 1], 0, 0, a + 0.4); }
    K.box('teak', [0, 0.32, -L / 2 - 0.25], [W * 0.75, 0.05, 0.42], [1, 1, 1]); // swim platform
    return { L, W, draft: 0.38, helm: [-0.5, 0.75, -0.15] };
  },
  speedboat(K, o, r) { // a deep-V sport boat
    const L = 8.2, W = 2.5, col = o.hull || [0.98, 0.98, 0.97], tr = o.trim || [0.62, 0.05, 0.06];
    const H = hull(K, { L, W, D: 1.0, dead: 0.42, rise: 0.25, entry: 1.35, flare: 0.05, draft: 0.4 }, col, tr);
    cockpit(K, H, { L }, -L / 2 + 0.3, 0.6, 0.42, col);
    const sc = o.seat || [0.95, 0.94, 0.9]; seat(K, 0, 0.7, -L / 2 + 0.8, W - 0.5, 0.65, sc, 0.42); for (const x of [-0.5, 0.5]) seat(K, x, 0.74, -0.6, 0.55, 0.55, sc, 0.55);
    K.rbox('gel', [-0.55, 0.85, 0.15], [0.7, 0.7, 0.45], col, 0.08); wheel(K, -0.55, 1.18, -0.02, 0.6);
    const ws = []; for (let i = 0; i <= 10; i++) { const a = -1 + i / 5; ws.push([a * (W / 2 - 0.1), 0.5 + (1 - a * a) * 0.2]); }
    const g = []; for (let i = 0; i < 10; i++) { const [x0, z0] = ws[i], [x1, z1] = ws[i + 1], y0 = H.sheerAt(0.55) + 0.05, y1 = y0 + 0.25; g.push(x0, y0, z0, x1, y0, z1, x1, y1, z1 - 0.3, x0, y0, z0, x1, y1, z1 - 0.3, x0, y1, z0 - 0.3); }
    K.tris('glass', g);
    for (const x of [-0.42, 0.42]) outboard(K, x, H.sheerAt(0) - 0.1, -L / 2, 300, o.engine || [0.08, 0.08, 0.09]);
    for (const z of [-L / 2 + 0.3, 0.3, L / 2 - 0.8]) for (const s of [1, -1]) cleat(K, s * (H.beamAt((z + L / 2) / L) - 0.06), H.sheerAt((z + L / 2) / L) + 0.03, z);
    navLights(K, H, { L });
    return { L, W, draft: 0.4, helm: [-0.5, 0.82, -0.6] };
  },
  center(K, o, r) { // a 24 ft center console
    const L = 7.4, W = 2.6, col = o.hull || [0.97, 0.97, 0.96], tr = o.trim || [0.55, 0.7, 0.8];
    const H = hull(K, { L, W, D: 1.05, dead: 0.4, rise: 0.42, entry: 1.5, flare: 0.08, draft: 0.4 }, col, tr);
    cockpit(K, H, { L }, -L / 2 + 0.2, L / 2 - 0.45, 0.4, col);
    K.rbox('gel', [0, 0.95, 0.35], [0.95, 1.1, 0.9], col, 0.1); // the console
    const gl = []; { const y0 = 1.5, y1 = 1.85, z0 = 0.82, z1 = 0.62; gl.push(-0.47, y0, z0, 0.47, y0, z0, 0.47, y1, z1, -0.47, y0, z0, 0.47, y1, z1, -0.47, y1, z1); } K.tris('glass', gl);
    K.box('black', [0, 1.46, 0.62], [0.8, 0.02, 0.38], [1, 1, 1], 0, 0.35); for (const x of [-0.25, 0, 0.25]) K.box('black', [x, 1.5, 0.66], [0.2, 0.14, 0.02], [0.05, 0.08, 0.1], 0, 0.35); // screens
    wheel(K, 0, 1.38, -0.12, 0.45); K.rbox('vinyl', [0, 0.75, -0.75], [0.95, 0.85, 0.5], [0.92, 0.9, 0.85], 0.06); K.rbox('vinyl', [0, 1.3, -0.75], [0.95, 0.22, 0.45], o.seat || [0.92, 0.9, 0.85], 0.05); // leaning post
    // the T-top: four tubes, a frame, the canvas, rod holders
    const yt = 2.35; for (const [x, z] of [[-0.5, 0.75], [0.5, 0.75], [-0.5, -0.95], [0.5, -0.95]]) K.path('alu', [[x, 0.42, z], [x, yt - 0.25, z], [x * 1.25, yt, z * 1.05]], 0.025, [0.92, 0.92, 0.94]);
    K.path('alu', [[-0.65, yt, 1.1], [0.65, yt, 1.1], [0.65, yt, -1.4], [-0.65, yt, -1.4], [-0.65, yt, 1.1]], 0.022, [0.92, 0.92, 0.94]);
    K.box('canvas', [0, yt + 0.06, -0.15], [1.5, 0.06, 2.6], o.canvas || [0.12, 0.2, 0.35]);
    for (let k = 0; k < 5; k++) K.tube('alu', [-0.4 + k * 0.2, yt, -1.4], [-0.4 + k * 0.2 + 0.02, yt + 0.25, -1.62], 0.02, [0.9, 0.9, 0.92]);
    for (const s of [1, -1]) for (let k = 0; k < 3; k++) K.cyl('steel', [s * (H.beamAt(0.12 + k * 0.05) - 0.12), H.sheerAt(0.12) + 0.04, -L / 2 + 0.9 + k * 0.35], [s * (H.beamAt(0.12 + k * 0.05) - 0.12), H.sheerAt(0.12) - 0.18, -L / 2 + 0.85 + k * 0.35], 0.03, 0.03, [1, 1, 1], 8);
    { const z = L / 2 - 1.35, hw = H.beamAt((z + L / 2) / L) - 0.14; K.rbox('gel', [0, 0.65, z], [hw * 2, 0.45, 0.8], col, 0.08); K.rbox('vinyl', [0, 0.92, z], [hw * 2 - 0.05, 0.1, 0.75], o.seat || [0.92, 0.9, 0.85], 0.04); } // the forward seat box and its cushion
    const pr = []; for (let k = 0; k <= 10; k++) { const t = 0.68 + k * 0.03; pr.push([H.beamAt(t) - 0.05, H.sheerAt(t) + 0.55, -L / 2 + t * L]); }
    for (const s of [1, -1]) { K.path('steel', pr.map(p => [p[0] * s, p[1], p[2]]), 0.014); for (const p of pr.filter((_, i) => i % 3 === 0)) K.tube('steel', [p[0] * s, H.sheerAt((p[2] + L / 2) / L) + 0.03, p[2]], [p[0] * s, p[1], p[2]], 0.012); }
    for (const x of [-0.45, 0.45]) outboard(K, x, H.sheerAt(0) - 0.12, -L / 2 - 0.35, 250, o.engine || [0.95, 0.95, 0.96]);
    K.box('gel', [0, H.sheerAt(0) - 0.25, -L / 2 - 0.15], [W * 0.7, 0.06, 0.4], col); // the motor bracket's platform
    for (const z of [-L / 2 + 0.3, 0.6, L / 2 - 0.6]) for (const s of [1, -1]) cleat(K, s * (H.beamAt((z + L / 2) / L) - 0.06), H.sheerAt((z + L / 2) / L) + 0.03, z);
    navLights(K, H, { L });
    return { L, W, draft: 0.4, helm: [0, 0.95, -0.55] };
  },
  pontoon(K, o, r) { // a 22 ft tritoon
    const L = 7, W = 2.55, fence = o.trim || [0.15, 0.25, 0.42];
    for (const x of [-0.95, 0, 0.95]) { K.cyl('alu', [x, 0.05, -L / 2 + 0.2], [x, 0.05, L / 2 - 0.9], 0.33, 0.33, [0.86, 0.88, 0.9], 18); K.put('alu', new K.T.SphereGeometry(0.33, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.9, 1), K.at(x, 0.05, L / 2 - 0.9, 0, Math.PI / 2), [0.86, 0.88, 0.9]); K.cyl('alu', [x, 0.05, -L / 2 + 0.2], [x, 0.05, -L / 2 + 0.17], 0.33, 0.2, [0.8, 0.82, 0.84], 18); }
    for (const x of [-0.95, 0, 0.95]) for (let z = -L / 2 + 0.6; z < L / 2 - 0.8; z += 0.6) K.box('alu', [0, 0.42, z], [W - 0.1, 0.06, 0.05], [0.75, 0.77, 0.8]); // cross members
    K.box('carpet', [0, 0.49, -0.1], [W, 0.06, L - 0.5], o.carpet || [1, 1, 1]); K.box('alu', [0, 0.47, -0.1], [W + 0.04, 0.12, L - 0.46], [0.9, 0.9, 0.92]);
    // fence panels with their top rail, gates fore and aft
    const fz0 = -L / 2 + 0.6, fz1 = L / 2 - 0.85, fy = 0.52, fh = 0.78;
    for (const s of [1, -1]) { K.box('gel', [s * (W / 2 - 0.02), fy + fh / 2, (fz0 + fz1) / 2], [0.03, fh, fz1 - fz0], fence); K.tube('alu', [s * (W / 2 - 0.02), fy + fh, fz0], [s * (W / 2 - 0.02), fy + fh, fz1], 0.022, [0.92, 0.92, 0.94]); }
    for (const z of [fz1, fz0]) for (const s of [1, -1]) { K.box('gel', [s * (W / 2 - 0.45), fy + fh / 2, z], [0.86, fh, 0.03], fence); K.tube('alu', [s * (W / 2 - 0.02), fy + fh, z], [s * (W / 2 - 0.88), fy + fh, z], 0.022, [0.92, 0.92, 0.94]); }
    const sc = o.seat || [0.9, 0.88, 0.82];
    seat(K, 0, fy + 0.35, fz0 + 0.45, W - 0.4, 0.6, sc, 0.5); for (const s of [1, -1]) seat(K, s * (W / 2 - 0.4), fy + 0.35, 0.6, 0.6, 2.2, sc, 0.5, -s * Math.PI / 2);
    seat(K, 0, fy + 0.35, fz1 - 0.5, W - 1.2, 0.55, sc, 0.45, Math.PI);
    K.rbox('gel', [0.75, fy + 0.5, -0.9], [0.65, 1.0, 0.6], [0.95, 0.95, 0.94], 0.06); wheel(K, 0.75, fy + 1.05, -1.25, 0.5); seat(K, 0.75, fy + 0.4, -1.75, 0.55, 0.55, sc, 0.55);
    // the bimini: bows and canvas
    const by = 2.15; for (const z of [-1.7, 0.3]) K.path('alu', [[-W / 2 + 0.05, fy + fh, z], [-W / 2 + 0.15, by, z + 0.2], [W / 2 - 0.15, by, z + 0.2], [W / 2 - 0.05, fy + fh, z]], 0.016, [0.9, 0.9, 0.92]);
    K.box('canvas', [0, by + 0.04, -0.6], [W - 0.25, 0.03, 2.3], o.canvas || [0.12, 0.2, 0.35]);
    outboard(K, 0, 0.62, -L / 2 + 0.05, 115, o.engine || [0.08, 0.08, 0.09]);
    return { L, W, draft: 0.3, wl: 0, helm: [0.75, 0.95, -1.75] };
  },
  sailboat(K, o, r) { // a 30 ft sloop
    const L = 9.2, W = 3.0, col = o.hull || [0.97, 0.97, 0.95];
    const H = hull(K, { L, W, D: 1.25, dead: 0.5, rise: 0.38, entry: 1.25, flare: 0.04, draft: 0.45, round: true }, col, o.trim || [0.08, 0.16, 0.35]);
    K.box('bottom', [0, -0.9, 0.3], [0.16, 1.4, 1.5], [1, 1, 1]); K.box('bottom', [0, -1.55, 0.25], [0.32, 0.22, 1.6], [1, 1, 1]); // fin keel and bulb
    K.box('bottom', [0, -0.55, -L / 2 + 0.6], [0.08, 1.0, 0.55], [1, 1, 1]); // rudder
    // the deck, the cabin trunk with ports, the cockpit aft
    const tz = z => (z + L / 2) / L, dk = []; for (let i = 0; i < 16; i++) { const za = -L / 2 + 0.2 + (L - 0.2) * i / 16, zb = -L / 2 + 0.2 + (L - 0.2) * (i + 1) / 16, ba = H.beamAt(tz(za)), bb = H.beamAt(tz(zb)), sa = H.sheerAt(tz(za)), sb = H.sheerAt(tz(zb));
      dk.push(-ba, sa, za, ba, sa, za, bb, sb, zb, -ba, sa, za, bb, sb, zb, -bb, sb, zb); }
    K.tris('gel', dk, [0.92, 0.92, 0.88]);
    K.rbox('gel', [0, H.sheerAt(0.55) + 0.3, 0.6], [1.9, 0.62, 3.4], col, 0.12); for (const s of [1, -1]) for (const z of [-0.2, 0.6, 1.4]) K.rbox('tint', [s * 0.955, H.sheerAt(0.55) + 0.38, z], [0.02, 0.12, 0.4], [1, 1, 1], 0.04);
    K.box('teak', [0, H.sheerAt(0.3) + 0.02, -2.2], [1.6, 0.04, 2.0], [1, 1, 1]); for (const s of [1, -1]) K.rbox('gel', [s * 0.95, H.sheerAt(0.3) + 0.22, -2.2], [0.3, 0.4, 2.0], col, 0.06);
    wheel(K, 0, H.sheerAt(0.2) + 0.65, -3.1, 0.15);
    // mast, boom, the main under its cover, the furled jib, standing rigging, lifelines
    const mz = 1.35, mt = 12.5, mb = H.sheerAt(0.6) + 0.6; K.cyl('alu', [0, mb, mz], [0, mt, mz], 0.085, 0.06, [0.85, 0.86, 0.88], 10); K.box('alu', [0, 7.3, mz], [1.3, 0.05, 0.08], [0.85, 0.86, 0.88]); // spreaders
    K.cyl('alu', [0, mb + 0.9, mz], [0, mb + 1.0, -2.6], 0.06, 0.05, [0.85, 0.86, 0.88], 8);
    K.rbox('canvas', [0, mb + 1.12, -0.6], [0.32, 0.36, 3.6], o.canvas || [0.05, 0.22, 0.5], 0.14);
    K.cyl('canvas', [0, H.sheerAt(1) + 0.4, L / 2 - 0.1], [0, mt - 1.2, mz + 0.05], 0.09, 0.045, [0.92, 0.92, 0.9], 8); // the rolled jib on the forestay
    const wire = (a, b) => K.tube('steel', a, b, 0.005, [0.75, 0.76, 0.78], 4);
    wire([0, H.sheerAt(1) + 0.1, L / 2 - 0.05], [0, mt, mz]); wire([0, mt, mz], [0, H.sheerAt(0) + 0.1, -L / 2 + 0.05]);
    for (const s of [1, -1]) { wire([s * (H.beamAt(0.6) - 0.05), H.sheerAt(0.6), mz], [s * 0.65, 7.3, mz]); wire([s * 0.65, 7.3, mz], [0, mt - 0.2, mz]); wire([s * (H.beamAt(0.6) - 0.05), H.sheerAt(0.6), mz - 0.3], [0, 7.3, mz]);
      const ll = []; for (let k = 0; k <= 10; k++) { const t = 0.08 + k * 0.08; ll.push([s * (H.beamAt(t) - 0.04), H.sheerAt(t) + 0.62, -L / 2 + t * L]); } K.path('steel', ll, 0.006, [0.8, 0.8, 0.82], 4);
      for (const p of ll.filter((_, i) => i % 3 === 0)) K.tube('steel', [p[0], p[1] - 0.6, p[2]], p, 0.012, [1, 1, 1]); }
    navLights(K, H, { L });
    return { L, W, draft: 1.7, wl: 0.45, helm: [0, H.sheerAt(0.2) + 0.45, -3.4] };
  },
  yacht(K, o, r) { // a 50 ft flybridge motor yacht
    const L = 15.5, W = 4.6, col = o.hull || [0.98, 0.98, 0.97];
    const H = hull(K, { L, W, D: 2.3, dead: 0.3, rise: 0.75, entry: 1.45, flare: 0.1, draft: 0.95 }, col, o.trim || [0.07, 0.08, 0.1]);
    const tz = z => (z + L / 2) / L, s0 = H.sheerAt(0.4);
    // main deck superstructure with its band of dark glass, the flybridge above, the radar arch
    const hw = W - 0.8; // the deck house: a raked windscreen forward, the saloon, an open aft deck under the flybridge overhang
    K.side('gel', [[-4.6, s0], [3.4, s0], [3.4, s0 + 0.55], [1.7, s0 + 2.05], [-4.6, s0 + 2.05]], hw, col);
    K.side('tint', [[-4.3, s0 + 0.85], [2.9, s0 + 0.85], [1.85, s0 + 1.8], [-4.3, s0 + 1.8]], hw + 0.04, [1, 1, 1], 0, 0.01); // the band of glass
    K.side('gel', [[-6.2, s0 + 2.05], [1.9, s0 + 2.05], [1.2, s0 + 2.75], [-3.4, s0 + 2.75], [-3.4, s0 + 2.3], [-6.2, s0 + 2.3]], W - 1.1, col, 0, 0.05); // flybridge deck and its screen
    K.side('tint', [[1.0, s0 + 2.5], [1.75, s0 + 2.1], [1.85, s0 + 2.15], [1.1, s0 + 2.6]], W - 1.12, [1, 1, 1], 0, 0.01);
    for (const x of [-0.9, 0.9]) K.rbox('vinyl', [x * 0.6, s0 + 2.95, -0.6], [0.55, 0.4, 0.6], o.seat || [0.93, 0.92, 0.88], 0.06); wheel(K, 0.6, s0 + 3.05, 0.1, 0.4);
    K.path('steel', [[-hw / 2 + 0.1, s0 + 2.3, -6.1], [-hw / 2 + 0.1, s0 + 3.1, -6.1], [hw / 2 - 0.1, s0 + 3.1, -6.1], [hw / 2 - 0.1, s0 + 2.3, -6.1]], 0.025);
    K.path('gel', [[-1.4, s0 + 2.8, -2.8], [-1.0, s0 + 3.9, -3.2], [1.0, s0 + 3.9, -3.2], [1.4, s0 + 2.8, -2.8]], 0.12, col); K.cyl('black', [0, s0 + 4.0, -3.2], [0, s0 + 4.12, -3.2], 0.45, 0.45, [1, 1, 1], 18); // arch, radome
    K.box('canvas', [0, s0 + 3.6, -2.1], [W - 1.4, 0.05, 2.6], o.canvas || [0.85, 0.83, 0.78]);
    // foredeck, side decks, the swim platform, the bow rail
    const dk = []; for (let i = 0; i < 16; i++) { const za = -L / 2 + 0.1 + (L - 0.1) * i / 16, zb = -L / 2 + 0.1 + (L - 0.1) * (i + 1) / 16, ba = H.beamAt(tz(za)), bb = H.beamAt(tz(zb)), sa = H.sheerAt(tz(za)), sb = H.sheerAt(tz(zb));
      dk.push(-ba, sa, za, ba, sa, za, bb, sb, zb, -ba, sa, za, bb, sb, zb, -bb, sb, zb); }
    K.tris('teak', dk);
    K.box('teak', [0, 0.35, -L / 2 - 0.7], [W - 0.5, 0.12, 1.4], [1, 1, 1]);
    const pr = []; for (let k = 0; k <= 14; k++) { const t = 0.45 + k * 0.038; pr.push([H.beamAt(t) - 0.08, H.sheerAt(t) + 0.8, -L / 2 + t * L]); }
    for (const s of [1, -1]) { K.path('steel', pr.map(p => [p[0] * s, p[1], p[2]]), 0.02); for (const p of pr.filter((_, i) => i % 3 === 0)) K.tube('steel', [p[0] * s, H.sheerAt((p[2] + L / 2) / L), p[2]], [p[0] * s, p[1], p[2]], 0.015); }
    for (let k = 0; k < 4; k++) for (const s of [1, -1]) K.cyl('tint', [s * (H.beamAt(0.62) + 0.06), H.sheerAt(0.62) - 0.55, 1.5 + k * 0.9], [s * (H.beamAt(0.62) + 0.02), H.sheerAt(0.62) - 0.55, 1.5 + k * 0.9], 0.12, 0.12, [1, 1, 1], 12); // hull ports
    navLights(K, H, { L });
    return { L, W, draft: 0.95, helm: [0.6, s0 + 2.95, -0.6] };
  },
};
export const BOAT_KINDS = Object.keys(BUILD);

export function boatModel(THREE, kind, o = {}) {
  const f = BUILD[kind] || BUILD.runabout, K = new B(THREE), r = rng(o.seed ?? 1);
  const toCol = c => c == null ? undefined : Array.isArray(c) ? c : rgb(c);
  const opt = { hull: toCol(o.hull), trim: toCol(o.trim), seat: toCol(o.seat), canvas: toCol(o.canvas), engine: toCol(o.engine), carpet: toCol(o.carpet) };
  const info = f(K, opt, r), wl = info.wl ?? info.draft ?? 0;
  const g = K.group(mats(THREE)); for (const m of g.children) { m.geometry.translate(0, -wl, 0); m.geometry.computeBoundingSphere(); } // the waterline to y = 0
  g.userData = { kind, ...info, wl, helm: [info.helm[0], info.helm[1] - wl, info.helm[2]] };
  return g;
}
// the kit and the shared materials, for the things built like boats (src/world/trailers.js)
export { B as BoatKit, mats as boatMats };
