// Power lines: the grid you see from the street.
//  - Transmission and sub-transmission lines where SDG&E really runs them (OpenStreetMap, assets/world/power.json from
//    tools/world/power.py): lattice towers for the 138-500 kV lines, tubular steel poles, tall wood poles for 69 kV
//    (with a 12 kV circuit underbuilt and the phone and cable lines lower down), substation gantries.
//  - Distribution: wooden poles along the rural and estate roads (laid by rule: the dense tracts are fed underground,
//    as Poway's are), joint-use with the phone and cable TV lines; transformers on every few poles with service drops
//    to the houses, guyed dead-ends and angles, a cobra-head streetlight here and there, and some streets with only the
//    telephone poles left.
// Every structure is real geometry built to the hardware: tapered poles with checked, weathered wood, crossarms with
// their braces and through-bolts, pin and post insulators with their skirts, cap-and-pin disc strings, transformers with
// bushings, cutouts and jumpers, step bolts, ground wire and molding, guy wires with their yellow guards, lattice
// members with X-bracing. All of it shares one material (a texture atlas tinted by vertex colour), drawn as instances:
// the detailed models near the camera, cheap stand-ins out to the end of the view. Wires are catenaries drawn as
// camera-facing ribbons never thinner than a pixel, faded by how much of that pixel the wire really covers, so a
// 15 mm conductor stays a clean line at 400 m instead of shimmering or vanishing.
//   const PW = createPower(THREE, scene, { data, heightAt, roads, sidewalks, buildings, onAsphalt, U })
//   PW.supports: [{ id, x, z, kind, foot: [[dx, dz, r]...], str }]  (collision; str: speed in m/s that snaps it, 0 never)
//   PW.update(camera, renderer, night)   PW.breakPole(id) -> a standalone copy of the pole to fall over
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- the atlas: one material for every structure
const AT = 1024;
const RECT = { wood: [0, 0, 256, 1024], arm: [256, 0, 128, 1024], galv: [384, 0, 128, 512], rust: [384, 512, 128, 512], conc: [512, 512, 256, 256] };
const CELL = { glaze: [544, 32], polymer: [608, 32], hard: [672, 32], rubber: [736, 32], paint: [800, 32], lens: [864, 32], conc: [928, 32] };
const MRV = { wood: [0.88, 0], arm: [0.82, 0], galv: [0.42, 0.85], rust: [0.72, 0.35], conc: [0.94, 0], glaze: [0.16, 0], polymer: [0.55, 0], hard: [0.36, 0.9], rubber: [0.7, 0], paint: [0.42, 0.45], lens: [0.12, 0] };

// work in slices of a few milliseconds, yielding to the game's frames between them: nothing here may freeze a frame
const idle = () => new Promise(r => setTimeout(r, 0));
function slicer(ms = 6) { let t = performance.now(); return async () => { if (performance.now() - t > ms) { await idle(); t = performance.now(); } }; }

function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

async function makeAtlas(THREE) {
  const slice = slicer();
  const r = rng(4242), mk = () => { const c = document.createElement('canvas'); c.width = c.height = AT; return [c, c.getContext('2d', { willReadFrequently: true })]; };
  const [cc, g] = mk(), [hc, h] = mk(), [mc, m] = mk(), [ec, e] = mk();
  h.fillStyle = 'rgb(128,128,128)'; h.fillRect(0, 0, AT, AT); e.fillStyle = '#000'; e.fillRect(0, 0, AT, AT);
  // pole wood: Douglas fir gone grey-brown in the sun, darker where the preservative still bleeds, vertical grain, long
  // drying checks, a few knots, old staples from a hundred lost-dog flyers at eye height, a soaked black butt
  { const [x0, y0, W, H] = RECT.wood, grd = g.createLinearGradient(0, y0, 0, y0 + H);
    grd.addColorStop(0, '#8a7a68'); grd.addColorStop(0.55, '#76624f'); grd.addColorStop(0.93, '#5d4a39'); grd.addColorStop(0.965, '#3b2d22'); grd.addColorStop(1, '#241a13');
    g.fillStyle = grd; g.fillRect(x0, y0, W, H);
    for (let x = 0; x < W; x++) { const k = r(); g.fillStyle = k < 0.5 ? `rgba(30,22,15,${0.04 + r() * 0.1})` : `rgba(200,190,175,${0.03 + r() * 0.07})`; g.fillRect(x0 + x, y0, 1, H);
      h.fillStyle = `rgba(${k < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.1})`; h.fillRect(x0 + x, y0, 1, H); }
    for (let i = 0; i < 26; i++) { let x = x0 + r() * W, y = y0 + r() * H * 0.9; const L = 80 + r() * 420, w = 1 + r() * 1.6;
      g.strokeStyle = `rgba(24,17,11,${0.6 + r() * 0.3})`; h.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = h.lineWidth = w; g.beginPath(); h.beginPath(); g.moveTo(x, y); h.moveTo(x, y);
      for (let s = 0; s < L; s += 12) { x += (r() - 0.5) * 2.2; y += 12; g.lineTo(x, y); h.lineTo(x, y); } g.stroke(); h.stroke(); }
    for (let i = 0; i < 7; i++) { const x = x0 + r() * W, y = y0 + 80 + r() * H * 0.8; g.fillStyle = 'rgba(40,28,18,0.75)'; g.beginPath(); g.ellipse(x, y, 4 + r() * 5, 8 + r() * 10, 0, 0, TAU); g.fill(); h.fillStyle = 'rgba(255,255,255,0.5)'; h.beginPath(); h.ellipse(x, y, 5, 10, 0, 0, TAU); h.fill(); }
    for (let i = 0; i < 70; i++) { const x = x0 + r() * W, y = y0 + H * (0.8 + r() * 0.08); g.fillStyle = `rgba(${170 + r() * 50},${170 + r() * 50},${170 + r() * 50},0.9)`; g.fillRect(x, y, 3 + r() * 3, 1); h.fillStyle = 'rgba(255,255,255,0.8)'; h.fillRect(x, y, 3, 1); }
    for (let i = 0; i < 12; i++) { const x = x0 + r() * W, y = y0 + H * (0.79 + r() * 0.1); g.fillStyle = `rgba(${200 + r() * 55},${200 + r() * 55},${180 + r() * 60},${0.15 + r() * 0.2})`; g.fillRect(x, y, 6 + r() * 14, 8 + r() * 18); } // paper scraps
  }
  // crossarm wood: rough-sawn fir, lighter, grain along the arm (the arm's length runs down the atlas)
  { const [x0, y0, W, H] = RECT.arm; g.fillStyle = '#93826c'; g.fillRect(x0, y0, W, H);
    for (let x = 0; x < W; x++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,30,20' : '220,210,190'},${0.04 + r() * 0.1})`; g.fillRect(x0 + x, y0, 1, H); }
    for (let i = 0; i < 16; i++) { const x = x0 + r() * W, y = y0 + r() * H; g.fillStyle = 'rgba(30,22,15,0.7)'; g.fillRect(x, y, 1.2, 60 + r() * 220); h.fillStyle = 'rgba(0,0,0,0.8)'; h.fillRect(x, y, 1.2, 120); } }
  // galvanised steel: a dull spangle; weathering steel: the brown rust SDG&E's newer poles wear; concrete
  const mottle = (rc, base, n, a, sz) => { const [x0, y0, W, H] = rc; g.fillStyle = base; g.fillRect(x0, y0, W, H);
    for (let i = 0; i < n; i++) { const t = r(); g.fillStyle = t < 0.5 ? `rgba(0,0,0,${a * r()})` : `rgba(255,255,255,${a * r()})`; g.fillRect(x0 + r() * W, y0 + r() * H, 2 + r() * sz, 2 + r() * sz); } };
  mottle(RECT.galv, '#a3a8aa', 2600, 0.12, 9); mottle(RECT.rust, '#6f4a33', 3000, 0.16, 12); mottle(RECT.conc, '#b3aea4', 3000, 0.1, 6);
  { const [x0, y0, W, H] = RECT.rust; for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${90 + r() * 40},${40 + r() * 20},${20},${0.2 + r() * 0.3})`; g.fillRect(x0 + r() * W, y0 + r() * H, 2, 20 + r() * 80); } } // rust runs
  // flat cells the vertex colour tints
  g.fillStyle = '#fff'; g.fillRect(512, 0, 512, 64); g.fillStyle = '#c9c4ba'; g.fillRect(896, 0, 64, 64);
  e.fillStyle = '#fff'; e.fillRect(CELL.lens[0] - 30, 2, 60, 60);
  // roughness (G) and metalness (B) by region
  m.fillStyle = 'rgb(255,200,0)'; m.fillRect(0, 0, AT, AT);
  for (const [k, [ro, me]] of Object.entries(MRV)) { m.fillStyle = `rgb(255,${Math.round(ro * 255)},${Math.round(me * 255)})`; if (RECT[k]) m.fillRect(...RECT[k]); if (CELL[k]) m.fillRect(CELL[k][0] - 32, 0, 64, 64); }
  // normals from the height canvas (Sobel)
  const hd = h.getImageData(0, 0, AT, AT).data, nd = new ImageData(AT, AT), H = (x, y) => hd[(((y + AT) % AT) * AT + ((x + AT) % AT)) * 4] / 255;
  for (let y = 0; y < AT; y++) { if ((y & 31) === 0) await slice(); for (let x = 0; x < AT; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1), o = (y * AT + x) * 4;
    nd.data[o] = (-dx / l * 0.5 + 0.5) * 255; nd.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; nd.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[o + 3] = 255;
  } }
  const nc = document.createElement('canvas'); nc.width = nc.height = AT; nc.getContext('2d').putImageData(nd, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
  return { map: tex(cc, true), normal: tex(nc, false), mr: tex(mc, false), em: tex(ec, true) };
}

// ---------------------------------------------------------------- geometry kit
class Kit {
  constructor(THREE) { this.T = THREE; this.p = []; this.n = []; this.u = []; this.c = []; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.nm = new THREE.Matrix3(); }
  // append a geometry under matrix m; uv: a CELL name (one texel tinted by col) or [rect, su, sv] (its uv scaled into the rect); dark(y) darkens by height
  put(geo, m, uv, col, dark) {
    const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, v = this.v;
    this.nm.getNormalMatrix(m);
    if (typeof uv === 'string' && RECT[uv]) uv = [uv, 0.25, 0.25]; // a region named alone: a patch of it
    let cu = 0, cv = 0, rc = null, su = 1, sv = 1; if (typeof uv === 'string') { const c = CELL[uv]; cu = c[0] / AT; cv = 1 - c[1] / AT; } else { rc = RECT[uv[0]]; su = uv[1] ?? 1; sv = uv[2] ?? 1; }
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); this.p.push(v.x, v.y, v.z); const k = dark ? dark(v.y) : 1;
      v.fromBufferAttribute(N, i).applyMatrix3(this.nm).normalize(); this.n.push(v.x, v.y, v.z);
      if (rc) { const a = Math.min(1, Math.max(0, (U ? U.getX(i) : 0) * su)), b = Math.min(1, Math.max(0, (U ? U.getY(i) : 0) * sv));
        this.u.push((rc[0] + 2 + a * (rc[2] - 4)) / AT, 1 - (rc[1] + 2 + (1 - b) * (rc[3] - 4)) / AT); }
      else this.u.push(cu, cv);
      this.c.push(col[0] * k, col[1] * k, col[2] * k);
    }
    g.dispose(); if (g !== geo) geo.dispose();
  }
  // a tapered cylinder from p0 (radius r0) to p1 (radius r1)
  cyl(p0, p1, r0, r1, sides, uv, col, dark, open = false) {
    const T = this.T, d = new T.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), L = d.length(); if (L < 1e-5) return;
    const geo = new T.CylinderGeometry(r1, r0, L, sides, 1, open); this.q.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    this.m.compose(new T.Vector3((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2), this.q, new T.Vector3(1, 1, 1)); this.put(geo, this.m, uv, col, dark);
  }
  // a box member from p0 to p1, w x d in section (d along `side`, default horizontal)
  bar(p0, p1, w, d, uv, col, side) {
    const T = this.T, a = new T.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), L = a.length(); if (L < 1e-5) return; a.normalize();
    let s = side ? new T.Vector3(...side) : new T.Vector3(0, 1, 0); if (Math.abs(s.dot(a)) > 0.95) s = new T.Vector3(1, 0, 0); if (Math.abs(s.dot(a)) > 0.95) s = new T.Vector3(0, 0, 1);
    const x = new T.Vector3().crossVectors(a, s).normalize(), z = new T.Vector3().crossVectors(x, a).normalize();
    this.m.makeBasis(x, a, z).setPosition((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
    this.put(new T.BoxGeometry(w, L, d), this.m, uv, col);
  }
  box(c, size, uv, col, rotY = 0) { const T = this.T; this.m.makeRotationY(rotY).setPosition(c[0], c[1], c[2]); this.put(new T.BoxGeometry(size[0], size[1], size[2]), this.m, uv, col); }
  geometry() {
    const T = this.T, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); return g;
  }
}
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const WOOD = [1, 1, 1], ARMC = [1, 1, 1], GALV = [1, 1, 1], GLAZE_G = [0.8, 0.8, 0.77], GLAZE_B = [0.42, 0.27, 0.17], POLY = [0.5, 0.52, 0.52], BLACK = [0.05, 0.05, 0.055], HARD = [0.7, 0.71, 0.72], CAN = [0.6, 0.62, 0.6], YELLOW = [0.95, 0.75, 0.08];

// a porcelain pin insulator (15 kV) standing on its steel pin at p: three skirts and a crown with the tie groove
function pinInsulator(K, p, col) {
  K.cyl(p, add(p, [0, 0.11, 0]), 0.013, 0.012, 6, 'hard', HARD);
  const s = [[0.055, 0.088, 0.025], [0.09, 0.075, 0.035], [0.125, 0.056, 0.05], [0.175, 0.046, 0.03]];
  for (const [y, rr, hh] of s) K.cyl(add(p, [0, y, 0]), add(p, [0, y + hh, 0]), rr, rr * 0.8, 12, 'glaze', col);
  K.cyl(add(p, [0, 0.205, 0]), add(p, [0, 0.235, 0]), 0.04, 0.025, 10, 'glaze', col);
  return add(p, [0, 0.215, 0]);
}
// a polymer rod with sheds from p0 to p1 (line posts, dead-ends, long-rod strings)
function polyRod(K, p0, p1, n, rs, col = POLY) {
  K.cyl(p0, p1, 0.02, 0.02, 6, 'polymer', col);
  for (let i = 1; i < n; i++) { const t = i / n, c = lerp3(p0, p1, t), d = [(p1[0] - p0[0]) * 0.008, (p1[1] - p0[1]) * 0.008, (p1[2] - p0[2]) * 0.008], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), k = 0.012 / L;
    K.cyl(add(c, [(p1[0] - p0[0]) * -k, (p1[1] - p0[1]) * -k, (p1[2] - p0[2]) * -k]), add(c, [(p1[0] - p0[0]) * k, (p1[1] - p0[1]) * k, (p1[2] - p0[2]) * k]), i % 2 ? rs : rs * 0.78, i % 2 ? rs * 0.9 : rs * 0.7, 10, 'polymer', col); void d; }
  K.cyl(p0, lerp3(p0, p1, 0.04), 0.035, 0.03, 8, 'hard', HARD); K.cyl(lerp3(p0, p1, 0.96), p1, 0.03, 0.035, 8, 'hard', HARD); // end fittings
}
// a string of cap-and-pin discs hanging from p for len metres
function discString(K, p, n, len, col) {
  const step = len / (n + 1); K.cyl(p, add(p, [0, -step, 0]), 0.012, 0.012, 6, 'hard', HARD);
  for (let i = 0; i < n; i++) { const y = -step * (i + 1); K.cyl(add(p, [0, y - 0.012, 0]), add(p, [0, y + 0.018, 0]), 0.128, 0.04, 14, 'glaze', col); K.cyl(add(p, [0, y - 0.035, 0]), add(p, [0, y - 0.012, 0]), 0.03, 0.12, 12, 'glaze', col); }
  K.cyl(add(p, [0, -len + 0.06, 0]), add(p, [0, -len, 0]), 0.03, 0.03, 8, 'hard', HARD);
  return add(p, [0, -len, 0]);
}

// ---------------------------------------------------------------- distribution poles (12 kV), joint-use
// local frame: x across the line (+x toward the road), z along the line, y up from the ground line
//   kind: 'T' tangent, 'X' transformer, 'L' streetlight, 'D' dead-end (line arrives from -z, guy to +z), 'A' angle (guy to +x), 'C' telephone only
function distPole(K, kind) {
  const C = kind === 'C', H = C ? 9.4 : 11.9, r0 = C ? 0.13 : 0.155, r1 = C ? 0.095 : 0.105, rAt = y => r0 + (r1 - r0) * y / H;
  const dark = y => y < 0.75 ? 0.45 + 0.55 * y / 0.75 : 1, S = { P: [], N: [], T: [], C: [], D: [] };
  K.cyl([0, -0.05, 0], [0, H, 0], r0 + 0.004, r1, 14, ['wood', 1, 1], WOOD, dark);
  K.cyl([0, H, 0], [0, H + 0.03, 0], r1, r1 * 0.6, 14, ['wood', 1, 0.02], [0.7, 0.66, 0.6]); // the sawn top, weathered round
  // ground wire in its wood molding, step bolts, the pole tags
  K.bar([0, 0, rAt(0) + 0.012], [0, 2.45, rAt(2.45) + 0.012], 0.05, 0.026, ['arm', 0.05, 0.25], [0.8, 0.76, 0.7], [0, 0, 1]);
  const yN = C ? 0 : H - 1.5;
  if (!C) K.cyl([0, 2.45, rAt(2.45) + 0.006], [0, yN, rAt(yN) + 0.006], 0.0035, 0.0035, 4, 'hard', [0.62, 0.42, 0.27]);
  for (let y = 2.75, s = 1; y < H - 1.1; y += 0.43, s = -s) { const rr = rAt(y); K.cyl([s * rr * 0.7, y, -rr * 0.7], [s * (rr + 0.13) * 0.7, y + 0.03, -(rr + 0.13) * 0.7], 0.0095, 0.0095, 6, 'hard', HARD); }
  K.box([rAt(1.9) + 0.003, 1.9, 0], [0.004, 0.06, 0.09], 'hard', [0.85, 0.86, 0.88]); K.box([rAt(2.08) + 0.003, 2.08, 0], [0.004, 0.035, 0.07], 'paint', [0.08, 0.08, 0.08]);
  // phone and cable TV: bolted suspension clamps on the road face, the strand and its lashed cables run along z
  for (const y of [5.25, 5.7]) { const rr = rAt(y); if (kind === 'D') { K.bar([0, y, -rr], [0, y, -rr - 0.16], 0.05, 0.05, 'hard', HARD); S.C.push([0.0, y, -rr - 0.18]); }
    else { K.box([rr + 0.03, y, 0], [0.06, 0.05, 0.09], 'hard', HARD); K.cyl([-rr - 0.03, y, 0], [rr + 0.07, y, 0], 0.009, 0.009, 6, 'hard', HARD); S.C.push([rr + 0.065, y - 0.04, 0]); } }
  if (C) { K.box([-rAt(4.4) - 0.09, 4.4, 0], [0.16, 0.42, 0.13], 'paint', [0.52, 0.55, 0.5]); return S; } // the phone company's terminal box
  // the crossarm(s), braces and through-bolts
  const ya = H - 0.35, zA = -(rAt(ya) + 0.046), arms = kind === 'D' || kind === 'A' ? [zA, -zA] : [zA];
  for (const z of arms) {
    K.bar([-1.22, ya, z], [1.22, ya, z], 0.115, 0.09, ['arm', 0.12, 0.6], ARMC, [0, 1, 0]);
    for (const s of [-1, 1]) K.bar([s * 0.62, ya - 0.06, z + Math.sign(z) * 0.002], [s * 0.035, ya - 0.76, z * 0.98], 0.036, 0.008, 'galv', GALV, [0, 0, 1]);
    K.cyl([0, ya, z * 1.9], [0, ya, -z * 0.95], 0.009, 0.009, 6, 'hard', HARD); K.box([0, ya, z * 1.98], [0.06, 0.06, 0.006], 'hard', HARD);
    K.cyl([0, ya - 0.76, z * 0.95], [0, ya - 0.76, -z * 0.95], 0.008, 0.008, 6, 'hard', HARD);
  }
  const glaze = kind === 'A' ? GLAZE_B : GLAZE_G;
  if (kind === 'D') { // dead-end: polymer strain insulators on the line side, a strain clamp on each
    for (const x of [-1.08, 0.0, 1.08]) { const z0 = x === 0 ? zA - 0.02 : zA - 0.05, p0 = [x, ya + (x === 0 ? 0.12 : 0.02), z0], p1 = [x, p0[1], z0 - 0.48]; polyRod(K, p0, p1, 7, 0.05); K.bar(p1, add(p1, [0, 0, -0.12]), 0.03, 0.05, 'hard', HARD); S.P.push(add(p1, [0, 0, -0.14])); }
  } else {
    for (const x of [-1.08, 1.08]) S.P.push(pinInsulator(K, [x, ya + 0.0575, zA], glaze));
    // the middle phase on a pole-top pin
    K.bar([0, H - 0.22, -r1 - 0.02], [0, H + 0.12, -r1 - 0.02], 0.05, 0.05, 'galv', GALV); S.P.push(pinInsulator(K, [0, H + 0.12, -r1 - 0.02], glaze));
    if (kind === 'A') for (const x of [-1.08, 1.08]) pinInsulator(K, [x, ya + 0.0575, -zA], glaze);
  }
  // neutral on a spool, the secondary on its rack
  { const rr = rAt(yN); K.box([-rr - 0.035, yN, 0], [0.07, 0.11, 0.08], 'galv', GALV); K.cyl([-rr - 0.075, yN - 0.045, 0], [-rr - 0.075, yN + 0.045, 0], 0.043, 0.043, 12, 'glaze', [0.9, 0.9, 0.88]);
    S.N.push(kind === 'D' ? [-rr - 0.075, yN, -0.25] : [-rr - 0.075, yN, 0]);
    const yT = H - 2.6, r2 = rAt(yT); K.bar([-r2 - 0.012, yT - 0.2, 0], [-r2 - 0.012, yT + 0.2, 0], 0.03, 0.012, 'galv', GALV, [1, 0, 0]);
    K.cyl([-r2 - 0.08, yT - 0.04, 0], [-r2 - 0.08, yT + 0.04, 0], 0.04, 0.04, 12, 'glaze', [0.88, 0.88, 0.86]); K.bar([-r2, yT + 0.05, 0], [-r2 - 0.12, yT + 0.05, 0], 0.03, 0.06, 'galv', GALV);
    S.T.push([-r2 - 0.08, yT, 0]); }
  if (kind === 'X') { // a pole-top transformer: the can on its hanger, bushings, the arrester, a fused cutout, jumpers
    const y0 = H - 3.15, y1 = H - 2.2, rr = rAt((y0 + y1) / 2), cx = rr + 0.3;
    K.cyl([cx, y0, 0], [cx, y1, 0], 0.27, 0.27, 20, 'paint', CAN); K.cyl([cx, y1, 0], [cx, y1 + 0.035, 0], 0.285, 0.285, 20, 'paint', CAN); K.cyl([cx, y1 + 0.035, 0], [cx, y1 + 0.08, 0], 0.285, 0.17, 20, 'paint', CAN);
    K.cyl([cx, y0 - 0.03, 0], [cx, y0, 0], 0.2, 0.27, 20, 'paint', [0.5, 0.52, 0.5]);
    for (const y of [y0 + 0.2, y1 - 0.15]) K.bar([rAt(y), y, 0], [cx - 0.26, y, 0], 0.05, 0.14, 'galv', GALV);
    for (let i = 0; i < 4; i++) K.cyl([cx, y1 + 0.08 + i * 0.04, 0], [cx, y1 + 0.1 + i * 0.04, 0], 0.05 - i * 0.004, 0.045 - i * 0.004, 10, 'glaze', GLAZE_B);
    polyRod(K, [cx + 0.17, y1 + 0.05, 0.1], [cx + 0.17, y1 + 0.3, 0.1], 5, 0.04);
    for (const z of [-0.12, 0, 0.12]) K.cyl([cx + 0.26, y1 - 0.25, z], [cx + 0.34, y1 - 0.25, z], 0.022, 0.018, 8, 'rubber', [0.15, 0.13, 0.12]);
    const yc = H - 1.15; K.bar([rAt(yc), yc, 0], [0.62, yc, 0], 0.05, 0.05, 'galv', GALV);
    const c0 = [0.56, yc + 0.18, 0.03], c1 = [0.5, yc - 0.17, 0.03]; K.cyl(c1, c0, 0.034, 0.03, 10, 'glaze', GLAZE_G); K.cyl(add(c1, [0.06, 0, 0]), add(c0, [0.06, -0.02, 0]), 0.017, 0.016, 8, 'paint', [0.55, 0.5, 0.38]);
    K.cyl(add(S.P[1], [0, -0.02, 0]), add(c0, [0.06, 0.02, 0]), 0.0045, 0.0045, 4, 'hard', [0.62, 0.62, 0.6]);
    K.cyl(add(c1, [0.06, 0, 0]), [cx, y1 + 0.25, 0], 0.0045, 0.0045, 4, 'hard', [0.62, 0.62, 0.6]);
    K.cyl([cx, y1 + 0.25, 0], [cx + 0.17, y1 + 0.3, 0.1], 0.004, 0.004, 4, 'hard', [0.62, 0.62, 0.6]);
    S.D.push([cx + 0.36, y1 - 0.25, 0]); S.T = [[cx + 0.36, y1 - 0.25, 0]];
  }
  if (kind === 'L') { // a cobra-head streetlight on its arm over the road
    const y = 8.3, rr = rAt(y); K.box([rr + 0.02, y, 0], [0.04, 0.35, 0.12], 'galv', GALV);
    K.cyl([rr, y, 0], [1.15, y + 0.2, 0], 0.033, 0.03, 8, 'galv', GALV); K.cyl([1.15, y + 0.2, 0], [2.2, y + 0.3, 0], 0.03, 0.028, 8, 'galv', GALV);
    K.cyl([rr, y - 0.4, 0], [0.9, y + 0.15, 0], 0.012, 0.012, 6, 'galv', GALV);
    K.box([2.5, y + 0.3, 0], [0.66, 0.13, 0.3], 'paint', [0.56, 0.58, 0.59]); K.box([2.62, y + 0.225, 0], [0.42, 0.02, 0.22], 'lens', [1, 0.97, 0.9]);
    K.cyl([2.3, y + 0.365, 0], [2.3, y + 0.42, 0], 0.035, 0.03, 10, 'polymer', [0.15, 0.15, 0.16]);
  }
  if (kind === 'D' || kind === 'A') { // the down guy: strand, fibreglass guy strain insulator, yellow guard, anchor rod
    const top = kind === 'D' ? [0, ya - 0.5, rAt(ya) + 0.02] : [rAt(ya) + 0.02, ya - 0.5, 0], anc = kind === 'D' ? [0, 0.15, 7.2] : [7.2, 0.15, 0];
    const gi = lerp3(top, anc, 0.12); K.cyl(top, gi, 0.0055, 0.0055, 5, 'hard', [0.45, 0.46, 0.47]); K.cyl(gi, lerp3(top, anc, 0.2), 0.013, 0.013, 6, 'polymer', [0.62, 0.55, 0.4]); K.cyl(lerp3(top, anc, 0.2), anc, 0.0055, 0.0055, 5, 'hard', [0.45, 0.46, 0.47]);
    const L = Math.hypot(anc[0] - top[0], anc[1] - top[1], anc[2] - top[2]); K.cyl(anc, lerp3(anc, top, 2.4 / L), 0.034, 0.03, 10, 'polymer', YELLOW, null);
    K.cyl(add(anc, [0, -0.6, 0], 1), lerp3(anc, top, 0.02), 0.014, 0.014, 6, 'hard', [0.4, 0.38, 0.35]);
  }
  return S;
}
function distLow(K, kind) { // the stand-in: a pole and its arm
  const C = kind === 'C', H = C ? 9.4 : 11.9;
  K.cyl([0, 0, 0], [0, H, 0], C ? 0.13 : 0.16, 0.1, 6, ['wood', 1, 1], WOOD);
  if (!C) K.bar([-1.22, H - 0.35, -0.16], [1.22, H - 0.35, -0.16], 0.12, 0.1, ['arm', 0.1, 0.5], ARMC);
  if (kind === 'X') K.cyl([0.45, H - 3.15, 0], [0.45, H - 2.2, 0], 0.27, 0.27, 8, 'paint', CAN);
  if (kind === 'L') K.bar([0.15, 8.3, 0], [2.8, 8.55, 0], 0.15, 0.15, 'paint', [0.56, 0.58, 0.59]);
}

// ---------------------------------------------------------------- 69 kV: a tall wood pole, post insulators in a vertical delta, 12 kV underbuilt
function subPole(K) {
  const H = 20.5, r0 = 0.24, r1 = 0.14, rAt = y => r0 + (r1 - r0) * y / H, dark = y => y < 0.8 ? 0.45 + 0.55 * y / 0.8 : 1, S = { H: [], S: [], U: [], C: [] };
  K.cyl([0, -0.05, 0], [0, H, 0], r0, r1, 16, ['wood', 1, 1], WOOD, dark);
  // the shield wire on a pole-top bracket
  K.bar([0, H - 0.3, -r1 - 0.02], [0, H + 0.35, -r1 - 0.02], 0.06, 0.06, 'galv', GALV); K.cyl([0, H + 0.35, -r1 - 0.02], [0, H + 0.42, -r1 - 0.02], 0.04, 0.04, 8, 'hard', HARD); S.S.push([0, H + 0.44, -r1 - 0.02]);
  // three horizontal line posts, alternating sides
  for (const [y, s] of [[H - 1.0, 1], [H - 2.5, -1], [H - 4.0, 1]]) { const rr = rAt(y);
    K.box([s * (rr + 0.04), y, 0], [0.08, 0.3, 0.16], 'galv', GALV); const p0 = [s * (rr + 0.08), y, 0], p1 = [s * (rr + 1.15), y + 0.06, 0]; polyRod(K, p0, p1, 14, 0.07);
    K.cyl(p1, add(p1, [0, 0.07, 0]), 0.03, 0.03, 8, 'hard', HARD); S.H.push(add(p1, [0, 0.09, 0])); }
  // the 12 kV underbuild: a crossarm, three pin insulators, braces
  const ya = 13.2, zA = -(rAt(ya) + 0.046); K.bar([-1.22, ya, zA], [1.22, ya, zA], 0.115, 0.09, ['arm', 0.12, 0.6], ARMC, [0, 1, 0]);
  for (const s of [-1, 1]) K.bar([s * 0.62, ya - 0.06, zA], [s * 0.035, ya - 0.76, zA * 0.98], 0.036, 0.008, 'galv', GALV, [0, 0, 1]);
  for (const x of [-1.08, -0.4, 1.08]) S.U.push(pinInsulator(K, [x, ya + 0.0575, zA], GLAZE_G));
  for (const y of [6.0, 6.45]) { const rr = rAt(y); K.box([rr + 0.03, y, 0], [0.06, 0.05, 0.09], 'hard', HARD); S.C.push([rr + 0.065, y - 0.04, 0]); }
  for (let y = 2.75, s = 1; y < H - 1; y += 0.43, s = -s) { const rr = rAt(y); K.cyl([s * rr * 0.7, y, -rr * 0.7], [s * (rr + 0.13) * 0.7, y + 0.03, -(rr + 0.13) * 0.7], 0.0095, 0.0095, 6, 'hard', HARD); }
  K.box([rAt(2) + 0.003, 2, 0], [0.004, 0.08, 0.11], 'hard', [0.85, 0.86, 0.88]); K.box([rAt(2.5) + 0.003, 2.5, 0], [0.004, 0.25, 0.35], 'paint', [0.9, 0.88, 0.8]); // tag, high-voltage sign
  return S;
}
function subLow(K) { K.cyl([0, 0, 0], [0, 20.5, 0], 0.24, 0.14, 6, ['wood', 1, 1], WOOD); for (const [y, s] of [[19.5, 1], [18, -1], [16.5, 1]]) K.bar([0, y, 0], [s * 1.3, y, 0], 0.1, 0.1, 'polymer', POLY); K.bar([-1.2, 13.2, -0.2], [1.2, 13.2, -0.2], 0.12, 0.1, ['arm', 0.1, 0.5], ARMC); }

// ---------------------------------------------------------------- 138-230 kV tubular steel pole, double circuit, davit arms and polymer I-strings
function steelPole(K) {
  const H = 34, r0 = 0.62, r1 = 0.26, rAt = y => r0 + (r1 - r0) * y / H, S = { H: [], S: [] };
  K.cyl([0, 0.55, 0], [0, H, 0], r0, r1, 12, ['rust', 1, 1], [1, 1, 1]);
  K.cyl([0, -0.3, 0], [0, 0.45, 0], 0.95, 0.95, 20, ['conc', 1, 0.3], [1, 1, 1]); K.cyl([0, 0.45, 0], [0, 0.55, 0], 0.82, 0.82, 12, 'paint', [0.33, 0.24, 0.18]);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; K.cyl([Math.cos(a) * 0.74, 0.45, Math.sin(a) * 0.74], [Math.cos(a) * 0.74, 0.62, Math.sin(a) * 0.74], 0.03, 0.03, 6, 'hard', HARD); }
  for (const y of [22.5, 26.5, 30.5]) for (const s of [-1, 1]) {
    const rr = rAt(y), L = y > 29 ? 4.0 : 4.6, p0 = [s * rr, y, 0], pm = [s * (rr + L * 0.55), y + 0.25, 0], p1 = [s * (rr + L), y + 0.35, 0];
    K.cyl(p0, pm, 0.2, 0.15, 10, ['rust', 1, 0.1], [1, 1, 1]); K.cyl(pm, p1, 0.15, 0.1, 10, ['rust', 1, 0.1], [1, 1, 1]); K.box(add(p1, [0, -0.12, 0]), [0.03, 0.2, 0.12], 'hard', HARD);
    const b = add(p1, [0, -0.22, 0]), e = add(b, [0, -2.3, 0]); polyRod(K, b, e, 24, 0.075);
    K.cyl(add(e, [0, 0.02, 0]), add(e, [0, -0.02, 0]), 0.21, 0.21, 16, 'hard', [0.8, 0.8, 0.82], null, true); // corona ring
    K.box(add(e, [0, -0.08, 0]), [0.07, 0.14, 0.22], 'hard', HARD); S.H.push(add(e, [0, -0.14, 0]));
  }
  K.cyl([0, H, 0], [0, H + 1.6, 0], r1, 0.14, 10, ['rust', 1, 0.05], [1, 1, 1]); K.box([0, H + 1.6, 0], [0.12, 0.1, 0.2], 'hard', HARD); S.S.push([0, H + 1.68, 0]);
  K.box([rAt(3) + 0.005, 3, 0], [0.01, 0.3, 0.45], 'paint', [0.88, 0.86, 0.8]);
  return S;
}
function steelLow(K) { K.cyl([0, 0, 0], [0, 35.6, 0], 0.62, 0.15, 6, ['rust', 1, 1], [1, 1, 1]); for (const y of [22.5, 26.5, 30.5]) K.bar([-4.8, y, 0], [4.8, y, 0], 0.25, 0.25, ['rust', 1, 0.05], [1, 1, 1]); }

// ---------------------------------------------------------------- lattice towers
// double circuit, vertical: legs splay from an 8.4 m base to a 2.2 m waist, a cage carries three crossarms a side,
// earth-wire peaks on top; X-braced panels on every face, triangular-truss arms, cap-and-pin disc strings
function latticeTower(K, o = {}) {
  const b0 = o.b0 ?? 4.2, b1 = o.b1 ?? 1.1, wy = o.wy ?? 24, H = o.H ?? 38, arms = o.arms ?? [[25.5, 5.6], [30.5, 6.4], [35.5, 5.6]], discs = o.discs ?? 15, sl = o.sl ?? 2.5;
  const S = { H: [], S: [] }, hw = y => y < wy ? b0 + (b1 - b0) * Math.pow(y / wy, 0.85) : b1, C = (sx, sz, y) => [sx * hw(y), y, sz * hw(y)];
  const lv = []; { let y = 0, ph = 4.6; while (y < wy - 0.5) { lv.push(y); y += ph; ph *= 0.86; } lv.push(wy); for (let y = wy + 2.5; y < H; y += 2.5) lv.push(y); lv.push(H); }
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (let i = 0; i < lv.length - 1; i++) {
    const y0 = lv[i], y1 = lv[i + 1], wl = i < 4 ? 0.2 : 0.14, wb = i < 4 ? 0.09 : 0.065;
    for (let c = 0; c < 4; c++) { const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
      K.bar(C(ax, az, y0), C(ax, az, y1), wl, wl, ['galv', 0.2, 0.3], GALV);
      K.bar(C(ax, az, y0), C(bx, bz, y1), wb, wb * 0.5, ['galv', 0.2, 0.3], GALV); K.bar(C(bx, bz, y0), C(ax, az, y1), wb, wb * 0.5, ['galv', 0.2, 0.3], GALV);
      if (i % 2 === 0 || y0 >= wy) K.bar(C(ax, az, y1), C(bx, bz, y1), wb * 0.9, wb * 0.5, ['galv', 0.2, 0.3], GALV); }
    if (i === 0 || Math.abs(y1 - wy) < 0.01) { K.bar(C(1, 1, y1), C(-1, -1, y1), 0.07, 0.04, 'galv', GALV); K.bar(C(1, -1, y1), C(-1, 1, y1), 0.07, 0.04, 'galv', GALV); }
  }
  for (const [ax, az] of corners) { K.cyl([ax * b0, -0.3, az * b0], [ax * b0, 0.45, az * b0], 0.48, 0.42, 14, ['conc', 1, 0.3], [1, 1, 1]); K.box([ax * b0, 0.5, az * b0], [0.5, 0.1, 0.5], 'galv', GALV); }
  // step bolts up one leg, the anti-climb barbed wire band, warning and number plates
  for (let y = 3.2; y < H - 1; y += 0.42) { const p = C(1, 1, y); K.cyl(p, add(p, [0.12, 0, 0.0]), 0.009, 0.009, 5, 'hard', HARD); }
  for (const [ax, az] of corners) { const p = C(ax, az, 3.0); K.bar(add(p, [0, 0, 0]), add(p, [-ax * 0.5, 0.35, 0]), 0.04, 0.04, 'galv', GALV); K.bar(add(p, [0, 0, 0]), add(p, [0, 0.35, -az * 0.5]), 0.04, 0.04, 'galv', GALV); }
  { const p = C(1, 1, 3.6); K.box(add(p, [0.12, 0, 0.12]), [0.32, 0.24, 0.006], 'paint', [0.88, 0.85, 0.78], Math.PI / 4); }
  // crossarms (triangular trusses) with disc strings
  for (const [y, L] of arms) for (const s of [-1, 1]) {
    const tip = [s * (b1 + L), y, 0], ut = [s * b1, y + 2.2, 0];
    K.bar([s * b1, y + 2.2, b1], tip, 0.12, 0.07, ['galv', 0.2, 0.3], GALV); K.bar([s * b1, y + 2.2, -b1], tip, 0.12, 0.07, ['galv', 0.2, 0.3], GALV);
    K.bar([s * b1, y, b1], tip, 0.14, 0.08, ['galv', 0.2, 0.3], GALV); K.bar([s * b1, y, -b1], tip, 0.14, 0.08, ['galv', 0.2, 0.3], GALV); void ut;
    for (let k = 1; k < 5; k++) { const t0 = (k - 1) / 5, t1 = k / 5, lo = lerp3([s * b1, y, 0], tip, t1), hi = lerp3([s * b1, y + 2.2, 0], tip, t0), hz = 1 - t0, lz = 1 - t1;
      for (const z of [1, -1]) { K.bar([hi[0], hi[1], z * b1 * hz], [lo[0], lo[1], z * b1 * lz], 0.06, 0.035, 'galv', GALV); K.bar([lo[0], lo[1], z * b1 * lz], [lo[0], lo[1], -z * b1 * lz], 0.06, 0.035, 'galv', GALV); } }
    K.box(add(tip, [0, -0.1, 0]), [0.12, 0.2, 0.12], 'galv', GALV);
    const e = discString(K, add(tip, [0, -0.2, 0]), discs, sl, o.glass ? [0.45, 0.58, 0.55] : GLAZE_G); K.box(add(e, [0, -0.06, 0]), [0.08, 0.12, 0.26], 'hard', HARD); S.H.push(add(e, [0, -0.12, 0]));
  }
  // the peak and earth-wire arms
  const pk = H + 3.4; for (const [ax, az] of corners) K.bar(C(ax, az, H), [ax * 0.25, pk, az * 0.25], 0.1, 0.06, ['galv', 0.2, 0.3], GALV);
  for (const s of [-1, 1]) { K.bar([s * 0.25, pk, 0.25], [s * 3.2, pk + 0.6, 0], 0.08, 0.05, 'galv', GALV); K.bar([s * 0.25, pk, -0.25], [s * 3.2, pk + 0.6, 0], 0.08, 0.05, 'galv', GALV); K.bar([s * b1, H, 0], [s * 3.2, pk + 0.6, 0], 0.07, 0.04, 'galv', GALV);
    K.box([s * 3.2, pk + 0.5, 0], [0.1, 0.12, 0.2], 'hard', HARD); S.S.push([s * 3.2, pk + 0.42, 0]); }
  return S;
}
function latticeLow(K, o = {}) {
  const b0 = o.b0 ?? 4.2, b1 = o.b1 ?? 1.1, wy = o.wy ?? 24, H = o.H ?? 38, arms = o.arms ?? [[25.5, 5.6], [30.5, 6.4], [35.5, 5.6]];
  for (const [ax, az] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) { K.bar([ax * b0, 0, az * b0], [ax * b1, wy, az * b1], 0.35, 0.35, ['galv', 0.2, 0.3], GALV); K.bar([ax * b1, wy, az * b1], [ax * b1 * 0.3, H + 3, az * b1 * 0.3], 0.3, 0.3, ['galv', 0.2, 0.3], GALV); }
  for (let y = 4; y < wy; y += 5) { const w = b0 + (b1 - b0) * Math.pow(y / wy, 0.85); K.bar([-w, y, w], [w, y + 4, w], 0.12, 0.12, 'galv', GALV); K.bar([w, y, -w], [-w, y + 4, -w], 0.12, 0.12, 'galv', GALV); }
  for (const [y, L] of arms) K.bar([-(b1 + L), y + 0.5, 0], [b1 + L, y + 0.5, 0], 0.5, 0.9, ['galv', 0.2, 0.3], GALV);
}
// 500 kV: single circuit, the three phases side by side on a long bridge, earth-wire peaks
function tower500(K) {
  const b0 = 5.6, b1 = 2.0, wy = 27, H = 33, S = { H: [], S: [] }, hw = y => y < wy ? b0 + (b1 - b0) * Math.pow(y / wy, 0.9) : b1, C = (sx, sz, y) => [sx * hw(y), y, sz * hw(y)];
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]], lv = []; { let y = 0, ph = 5; while (y < wy - 0.5) { lv.push(y); y += ph; ph *= 0.86; } lv.push(wy); lv.push(H); }
  for (let i = 0; i < lv.length - 1; i++) { const y0 = lv[i], y1 = lv[i + 1];
    for (let c = 0; c < 4; c++) { const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4]; K.bar(C(ax, az, y0), C(ax, az, y1), 0.24, 0.24, ['galv', 0.2, 0.3], GALV);
      K.bar(C(ax, az, y0), C(bx, bz, y1), 0.1, 0.05, ['galv', 0.2, 0.3], GALV); K.bar(C(bx, bz, y0), C(ax, az, y1), 0.1, 0.05, ['galv', 0.2, 0.3], GALV); K.bar(C(ax, az, y1), C(bx, bz, y1), 0.09, 0.05, 'galv', GALV); } }
  for (const [ax, az] of corners) K.cyl([ax * b0, -0.3, az * b0], [ax * b0, 0.5, az * b0], 0.55, 0.5, 14, ['conc', 1, 0.3], [1, 1, 1]);
  const W = 13.5; // the bridge: a box truss across the top of the body
  for (const z of [1.4, -1.4]) for (const y of [H, H + 2.6]) K.bar([-W, y, z], [W, y, z], 0.16, 0.12, ['galv', 0.2, 0.3], GALV);
  for (let x = -W; x < W - 0.1; x += 2.25) { for (const z of [1.4, -1.4]) { K.bar([x, H, z], [x + 2.25, H + 2.6, z], 0.07, 0.05, 'galv', GALV); K.bar([x, H, z], [x, H + 2.6, z], 0.07, 0.05, 'galv', GALV); } K.bar([x, H, 1.4], [x, H, -1.4], 0.06, 0.04, 'galv', GALV); }
  for (const x of [-11.2, 0, 11.2]) { // V-strings: two disc strings meeting at the yoke
    const yk = H - 4.6; for (const z of [1.1, -1.1]) { const top = [x, H - 0.05, z], d = [0, yk - top[1], -z], L = Math.hypot(d[1], d[2]); const n = 20;
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, c = add(top, d, t), a = add(c, d, -0.012 / L), b = add(c, d, 0.012 / L); K.cyl(a, b, 0.13, 0.04, 12, 'glaze', GLAZE_G); } K.cyl(top, add(top, d, 1), 0.012, 0.012, 5, 'hard', HARD); }
    K.box([x, yk - 0.1, 0], [0.5, 0.2, 0.2], 'hard', HARD); for (const dx of [-0.23, 0.23]) S.H.push([x + dx, yk - 0.3, 0]); }
  for (const s of [-1, 1]) { K.bar([s * 7.5, H + 2.6, 1.4], [s * 8.2, H + 7, 0], 0.12, 0.08, ['galv', 0.2, 0.3], GALV); K.bar([s * 7.5, H + 2.6, -1.4], [s * 8.2, H + 7, 0], 0.12, 0.08, ['galv', 0.2, 0.3], GALV); K.bar([s * 9.5, H + 2.6, 0], [s * 8.2, H + 7, 0], 0.1, 0.07, 'galv', GALV); S.S.push([s * 8.2, H + 7.05, 0]); }
  return S;
}
function tower500Low(K) { for (const [ax, az] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) K.bar([ax * 5.6, 0, az * 5.6], [ax * 2, 33, az * 2], 0.45, 0.45, ['galv', 0.2, 0.3], GALV); K.bar([-13.5, 34.3, 0], [13.5, 34.3, 0], 2.6, 2.8, ['galv', 0.2, 0.3], GALV); for (const s of [-1, 1]) K.bar([s * 7.5, 35.6, 0], [s * 8.2, 40, 0], 0.4, 0.4, 'galv', GALV); }
// a substation gantry the lines terminate on: two lattice columns and a beam, strain strings to six phases
function portal(K) {
  const S = { H: [], S: [] }, Hc = 16, X = 8;
  for (const s of [-1, 1]) { const b = 0.45; for (const [ax, az] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) K.bar([s * X + ax * b, 0, az * b], [s * X + ax * b * 0.7, Hc, az * b * 0.7], 0.12, 0.12, ['galv', 0.2, 0.3], GALV);
    for (let y = 0; y < Hc; y += 1.6) for (const z of [1, -1]) { K.bar([s * X - b, y, z * b], [s * X + b, y + 1.6, z * b], 0.05, 0.03, 'galv', GALV); K.bar([s * X + z * b, y, -b], [s * X + z * b, y + 1.6, b], 0.05, 0.03, 'galv', GALV); }
    K.cyl([s * X, -0.3, 0], [s * X, 0.4, 0], 0.8, 0.8, 12, ['conc', 1, 0.3], [1, 1, 1]); }
  for (const z of [0.5, -0.5]) for (const y of [Hc - 1.2, Hc]) K.bar([-X, y, z], [X, y, z], 0.12, 0.1, ['galv', 0.2, 0.3], GALV);
  for (let x = -X; x < X - 0.1; x += 1.6) for (const z of [0.5, -0.5]) K.bar([x, Hc - 1.2, z], [x + 1.6, Hc, z], 0.05, 0.03, 'galv', GALV);
  for (const x of [-6, -3.6, -1.2, 1.2, 3.6, 6]) { const p0 = [x, Hc - 1.25, -0.5], p1 = [x, Hc - 1.6, -2.6]; polyRod(K, p0, p1, 16, 0.07); S.H.push(add(p1, [0, -0.05, -0.1])); }
  for (const s of [-1, 1]) { K.bar([s * X, Hc, 0], [s * X, Hc + 3, 0], 0.15, 0.15, 'galv', GALV); S.S.push([s * X, Hc + 3.05, -0.1]); }
  return S;
}
function portalLow(K) { for (const s of [-1, 1]) K.bar([s * 8, 0, 0], [s * 8, 19, 0], 0.8, 0.8, ['galv', 0.2, 0.3], GALV); K.bar([-8, 15.4, 0], [8, 15.4, 0], 1.2, 1, ['galv', 0.2, 0.3], GALV); }

const TYPES = {
  T: { build: K => distPole(K, 'T'), low: K => distLow(K, 'T'), near: 520, far: 1700, foot: [[0, 0, 0.18]], str: 19 },
  X: { build: K => distPole(K, 'X'), low: K => distLow(K, 'X'), near: 520, far: 1700, foot: [[0, 0, 0.18]], str: 19 },
  L: { build: K => distPole(K, 'L'), low: K => distLow(K, 'L'), near: 520, far: 1700, foot: [[0, 0, 0.18]], str: 19 },
  D: { build: K => distPole(K, 'D'), low: K => distLow(K, 'D'), near: 520, far: 1700, foot: [[0, 0, 0.18]], str: 21 },
  A: { build: K => distPole(K, 'A'), low: K => distLow(K, 'A'), near: 520, far: 1700, foot: [[0, 0, 0.18]], str: 21 },
  C: { build: K => distPole(K, 'C'), low: K => distLow(K, 'C'), near: 420, far: 1300, foot: [[0, 0, 0.15]], str: 17 },
  S: { build: subPole, low: subLow, near: 800, far: 3500, foot: [[0, 0, 0.26]], str: 27 },
  P: { build: steelPole, low: steelLow, near: 1300, far: 7000, foot: [[0, 0, 0.75]], str: 0 },
  W: { build: K => latticeTower(K), low: K => latticeLow(K), near: 1500, far: 9000, foot: [[4.2, 4.2, 0.5], [4.2, -4.2, 0.5], [-4.2, -4.2, 0.5], [-4.2, 4.2, 0.5]], str: 0 },
  V: { build: tower500, low: tower500Low, near: 1700, far: 10000, foot: [[5.6, 5.6, 0.6], [5.6, -5.6, 0.6], [-5.6, -5.6, 0.6], [-5.6, 5.6, 0.6]], str: 0 },
  G: { build: portal, low: portalLow, near: 1200, far: 4500, foot: [[8, 0, 0.85], [-8, 0, 0.85]], str: 0 },
};
// wire classes: radius (m), colour (linear), sag (m per m^2 of span)
const WIRE = {
  P: { r: 0.0075, col: [0.5, 0.5, 0.48], k: 3.2e-4 }, N: { r: 0.0062, col: [0.46, 0.46, 0.44], k: 3.4e-4 }, U: { r: 0.0075, col: [0.5, 0.5, 0.48], k: 3.2e-4 },
  T: { r: 0.013, col: [0.035, 0.035, 0.04], k: 4.2e-4 }, C: { r: 0.021, col: [0.03, 0.03, 0.035], k: 4.6e-4 }, D: { r: 0.0085, col: [0.035, 0.035, 0.04], k: 1.3e-3 },
  H: { r: 0.0145, col: [0.56, 0.57, 0.56], k: 9e-5 }, S: { r: 0.0068, col: [0.3, 0.31, 0.32], k: 7.2e-5 },
};

// ---------------------------------------------------------------- the street lines, laid by rule
// Overhead along roads (secondary down to unclassified, primary only out in the country) wherever the houses are
// spread out: the rural lanes and the estate streets. Dense tracts are fed underground (pad-mounted transformers) and
// get no poles; a few of the older streets keep only their telephone poles. One side of the road per street, a pole
// every 40-55 m set back behind the curb, dead-ends guyed at the ends of a run, angle poles guyed at the bends, a
// transformer every few poles where there are houses to feed (with their service drops), a streetlight now and then.
async function layStreets(o) {
  const slice = slicer();
  const { roads, sidewalks, heightAt, onAsphalt, blocked, density } = o, out = [], spans = [], taken = new Map(), TK = 12;
  const near = (x, z, r) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of taken.get((Math.floor(x / TK) + a) * 100003 + Math.floor(z / TK) + b) || []) if ((q[0] - x) ** 2 + (q[1] - z) ** 2 < r * r) return true; return false; };
  const take = (x, z) => { const k = Math.floor(x / TK) * 100003 + Math.floor(z / TK); let c = taken.get(k); if (!c) taken.set(k, c = []); c.push([x, z]); };
  for (let ri = 0; ri < roads.length; ri++) {
    await slice(); const r = roads[ri], t = r[1], w = r[2], p = r[3]; if (t < 1 || t > 5 || p.length < 4) continue;
    const h = (ri * 2654435761) >>> 0, side = h & 1 ? 1 : -1, off = w / 2 + (sidewalks ? sidewalks[ri] || 0 : 0) + ((sidewalks && sidewalks[ri]) ? 0.65 : 1.3);
    // arc-length samples along the road
    const cum = [0]; for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
    const L = cum[cum.length - 1]; if (L < 120) continue;
    const at = s => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const a = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), ax = p[(i - 1) * 2], az = p[(i - 1) * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1], dl = Math.hypot(bx - ax, bz - az) || 1;
      return [ax + (bx - ax) * a, az + (bz - az) * a, (bx - ax) / dl, (bz - az) / dl]; };
    // which stretches are overhead
    const run = []; let cur = null;
    for (let s = 0; s <= L; s += 25) { const [x, z] = at(s), d = density(x, z), ok = d < (t === 1 ? 8 : 30); if (ok && !cur) cur = [s, s, d]; else if (ok) { cur[1] = s; cur[2] = Math.max(cur[2], d); } else if (cur) { run.push(cur); cur = null; } }
    if (cur) run.push(cur);
    for (const [s0, s1, dmax] of run) {
      if (s1 - s0 < 140) continue;
      const comm = dmax >= 16 && ((h >>> 3) % 10) < 2, sec = dmax >= 6, poles = [];
      const n = Math.max(2, Math.round((s1 - s0) / (44 + (h >>> 5) % 9)));
      for (let k = 0; k <= n; k++) {
        let s = s0 + (s1 - s0) * k / n, put = null;
        for (const ds of [0, 3, -3, 6, -6, 9, -9]) { const ss = Math.min(s1, Math.max(s0, s + ds)), [x, z, tx, tz] = at(ss), px = x - tz * side * off, pz = z + tx * side * off;
          if (onAsphalt(px, pz, 0.4) || blocked(px, pz, 0.7) || near(px, pz, 14)) continue; put = [px, pz, tx, tz, ss]; break; }
        if (put) poles.push(put);
      }
      if (poles.length < 3) continue;
      const base = out.length;
      poles.forEach(([x, z, tx, tz], i) => {
        take(x, z);
        const prev = poles[i - 1], next = poles[i + 1], end = !prev || !next;
        let dx = tx, dz = tz, turn = 0;
        if (prev && next) { const ax = x - prev[0], az = z - prev[1], bx = next[0] - x, bz = next[1] - z, la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; dx = ax / la + bx / lb; dz = az / la + bz / lb; turn = Math.asin(Math.max(-1, Math.min(1, (ax / la) * (bz / lb) - (az / la) * (bx / lb)))); }
        else if (next) { dx = next[0] - x; dz = next[1] - z; } else { dx = x - prev[0]; dz = z - prev[1]; }
        const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        let kind = comm ? 'C' : end ? 'D' : Math.abs(turn) > 0.38 ? 'A' : sec && i % 4 === 2 ? 'X' : ((h >>> 9) + i) % 7 === 3 ? 'L' : 'T';
        // yaw: local +z along the line; dead-ends turn their insulators to the line, angles guy outward, the rest face the road with +x
        let yaw = Math.atan2(dx, dz);
        if (kind === 'D') { if (!prev) yaw += Math.PI; }
        else if (kind === 'A') { if (turn > 0) yaw += Math.PI; }
        else if (kind !== 'C' || true) { const rx = Math.cos(yaw), rz = -Math.sin(yaw), roadX = -(-tz * side), roadZ = -(tx * side); if (rx * roadX + rz * roadZ < 0) yaw += Math.PI; }
        out.push({ x, z, yaw, type: kind, dist: true, sec, kv: 12 });
      });
      for (let i = 0; i + 1 < poles.length; i++) spans.push([base + i, base + i + 1, sec ? 'PNTC' : comm ? 'C' : 'PNC']);
    }
  }
  void heightAt;
  return { supports: out, spans };
}

// ---------------------------------------------------------------- the mapped lines
function layMapped(data, inside) {
  const sup = [], spans = [], key = new Map(), kvOf = [];
  const id = (x, z, s, kv) => { const k = Math.round(x) + ',' + Math.round(z); let i = key.get(k); if (i === undefined) { i = sup.length; key.set(k, i); sup.push({ x, z, s, kv, links: [] }); } else { sup[i].kv = Math.max(sup[i].kv, kv); if (s && !sup[i].s) sup[i].s = s; } return i; };
  const spanKey = new Set();
  for (const [kv, circ, minor, p] of data.lines) {
    const pts = []; for (let i = 0; i < p.length; i += 3) pts.push([p[i], p[i + 1], p[i + 2]]);
    let marks = pts.filter(q => q[2]);
    if (marks.length < 2) { // supports not mapped: put them at the ends, the bends and every so often between
      const step = kv >= 200 ? 300 : kv >= 100 ? 220 : kv >= 50 ? 95 : 50; marks = [];
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i]; if (i === 0) { marks.push([q[0], q[1], 0]); continue; }
        const a = pts[i - 1], L = Math.hypot(q[0] - a[0], q[1] - a[1]), n = Math.floor(L / step);
        for (let k = 1; k <= n; k++) marks.push([a[0] + (q[0] - a[0]) * k / (n + 1), a[1] + (q[1] - a[1]) * k / (n + 1), 0]);
        marks.push([q[0], q[1], 0]);
      }
    }
    let last = -1;
    for (const q of marks) {
      if (!inside(q[0], q[1])) { last = -1; continue; }
      const s = q[2] || (kv >= 100 ? 1 : 2), i = id(q[0], q[1], s, minor ? Math.min(kv, 25) : kv);
      if (last >= 0 && last !== i) { const k = Math.min(last, i) + ':' + Math.max(last, i); if (!spanKey.has(k)) { spanKey.add(k); spans.push([last, i, null]); sup[last].links.push(i); sup[i].links.push(last); } }
      last = i;
    }
    void circ; void kvOf;
  }
  const out = sup.map(q => {
    let dx = 0, dz = 0, first = null;
    for (const j of q.links) { let ax = sup[j].x - q.x, az = sup[j].z - q.z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; if (!first) first = [ax, az]; if (ax * first[0] + az * first[1] < 0) { ax = -ax; az = -az; } dx += ax; dz += az; }
    if (!first) { dx = 0; dz = 1; }
    const type = q.s === 3 ? 'G' : q.s === 1 ? (q.kv >= 400 ? 'V' : 'W') : q.kv >= 100 ? 'P' : q.kv >= 30 ? 'S' : q.links.length === 1 ? 'D' : 'T';
    return { x: q.x, z: q.z, yaw: Math.atan2(dx, dz), type, kv: q.kv, scale: type === 'W' ? (q.kv >= 200 ? 1 : q.kv >= 100 ? 0.86 : 0.74) : 1 };
  });
  for (const sp of spans) { const a = out[sp[0]], b = out[sp[1]]; sp[2] = a.kv >= 30 || b.kv >= 30 ? 'HSUC' : 'PNC'; }
  return { supports: out, spans };
}

// ---------------------------------------------------------------- wires
const WIRE_VS = /* glsl */`
attribute vec3 tangent; attribute vec2 wire; attribute vec3 wcol; attribute float sway;
uniform float uPx, uTime, uWind;
varying vec3 vCol; varying float vA; varying float vSide;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 p = position; float sw = sway * (0.35 + uWind * 0.65);
  p.x += sin(uTime * 0.85 + position.x * 0.03 + position.z * 0.02) * sw; p.z += cos(uTime * 0.7 + position.z * 0.03) * sw * 0.6;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vec3 t = normalize(mat3(modelViewMatrix) * tangent);
  vec3 sd = cross(t, normalize(-mvPosition.xyz)); float sl = length(sd); sd = sl > 1e-5 ? sd / sl : vec3(1.0, 0.0, 0.0);
  float dist = max(-mvPosition.z, 0.05);
  float px = 2.0 * wire.y * uPx / dist;           // the wire's true width in pixels
  float w = max(px, 1.1);                          // drawn at least about a pixel wide...
  vA = clamp(px / w, 0.0, 1.0);                    // ...and as faint as the part of it the wire covers
  mvPosition.xyz += sd * wire.x * 0.5 * w * dist / uPx;
  vSide = wire.x; vCol = wcol;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WIRE_FS = /* glsl */`
uniform vec3 uSunDir, uSunCol, uSky; uniform float uDim;
varying vec3 vCol; varying float vA; varying float vSide;
#include <common>
#include <fog_pars_fragment>
void main() {
  float edge = clamp((1.0 - abs(vSide)) / max(fwidth(vSide), 1e-3), 0.0, 1.0); // soft edges where the wire is wide
  float a = vA * edge; if (a < 0.004) discard;
  float round = sqrt(max(0.0, 1.0 - vSide * vSide));                           // a cylinder across the ribbon
  vec3 light = uSky * (0.3 + 0.22 * round) + uSunCol * max(uSunDir.y, 0.0) * (0.18 + 0.3 * round); // weathered aluminium reads grey against the sky, never white
  gl_FragColor = vec4(vCol * light * uDim, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export async function createPower(THREE, scene, o) {
  const slice = slicer();
  const { heightAt } = o, U = o.U || {};
  const inside = o.inside || (() => true);
  // the network: mapped lines, then the street lines laid where nothing is mapped
  const mapped = o.data ? layMapped(o.data, inside) : { supports: [], spans: [] };
  const mg = new Map(), MG = 60; for (const s of mapped.supports) { const k = Math.floor(s.x / MG) * 100003 + Math.floor(s.z / MG); let c = mg.get(k); if (!c) mg.set(k, c = []); c.push(s); }
  const mappedNear = (x, z, r) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const s of mg.get((Math.floor(x / MG) + a) * 100003 + Math.floor(z / MG) + b) || []) if ((s.x - x) ** 2 + (s.z - z) ** 2 < r * r) return true; return false; };
  const streets = o.roads ? await layStreets({ ...o, blocked: (x, z, r) => (o.blocked && o.blocked(x, z, r)) || mappedNear(x, z, 25) }) : { supports: [], spans: [] };
  const S = [...mapped.supports, ...streets.supports], off = mapped.supports.length;
  const SP = [...mapped.spans, ...streets.spans.map(([a, b, g]) => [a + off, b + off, g])];
  for (let i = 0; i < S.length; i++) { const s = S[i]; s.id = i; s.y = null; s.m = null; s.scale = s.scale || (s.dist ? 0.96 + ((i * 7919) % 100) / 1000 : 1); s.lean = s.dist || s.type === 'S' ? [((i * 104729) % 200 - 100) / 100 * 0.012, ((i * 1299709) % 200 - 100) / 100 * 0.012] : [0, 0]; }
  // service drops from the transformer poles to the nearest houses
  const drops = [];
  if (o.houseNear) for (const s of streets.supports) if (s.type === 'X') for (const hp of o.houseNear(s.x, s.z, 42, 3)) drops.push([s.id, hp]);

  // ---- models
  const A = await makeAtlas(THREE);
  const mat = new THREE.MeshStandardMaterial({ map: A.map, normalMap: A.normal, roughnessMap: A.mr, metalnessMap: A.mr, emissiveMap: A.em, emissive: new THREE.Color(1, 0.86, 0.62), emissiveIntensity: 0, vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: 0.8 });
  const models = {}; for (const [k, T] of Object.entries(TYPES)) {
    await idle(); const K = new Kit(THREE), slots = T.build(K), KL = new Kit(THREE); T.low(KL);
    models[k] = { geo: K.geometry(), low: KL.geometry(), slots, T };
  }
  // instance matrices
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3();
  const matOf = (s, out) => { e.set(s.lean[0], s.yaw, s.lean[1], 'YXZ'); q.setFromEuler(e); one.setScalar(s.scale); return out.compose(v3.set(s.x, s.y, s.z), q, one); };
  // heights and matrices when the ground under a support is known (an outer tile streams in before its towers stand)
  const ready = o.heightReady || (() => true);
  const ensure = s => { if (s.m) return true; if (!ready(s.x, s.z)) return false; s.y = heightAt(s.x, s.z); s.m = matOf(s, new THREE.Matrix4()); return true; };
  const slotW = (s, g) => { const sl = models[s.type].slots[g]; if (!sl) return []; return sl.map(p => new THREE.Vector3(...p).applyMatrix4(s.m)); };
  // per type: a detailed and a stand-in InstancedMesh, refilled from what is near the camera
  const meshes = {};
  for (const [k, M] of Object.entries(models)) {
    const n = S.filter(s => s.type === k).length; if (!n) continue;
    const det = new THREE.InstancedMesh(M.geo, mat, Math.min(n, k === 'W' || k === 'V' || k === 'P' ? 400 : 1500)), low = new THREE.InstancedMesh(M.low, mat, n);
    det.count = low.count = 0; det.castShadow = true; det.receiveShadow = true; low.castShadow = false; det.frustumCulled = low.frustumCulled = false; det.name = 'power:' + k; low.name = 'power-far:' + k;
    scene.add(det, low); meshes[k] = { det, low, list: S.filter(s => s.type === k) };
  }
  // ---- wires: built per 400 m cell near the camera
  const wmat = new THREE.ShaderMaterial({ vertexShader: WIRE_VS, fragmentShader: WIRE_FS, transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uPx: { value: 800 }, uDim: { value: 1 } }]) });
  for (const k of ['uTime', 'uWind', 'uSunDir', 'uSunCol', 'uSky']) wmat.uniforms[k] = U[k] || { value: k === 'uSunDir' ? new THREE.Vector3(0, 1, 0) : k.startsWith('uSun') || k === 'uSky' ? new THREE.Color(1, 1, 1) : 0 };
  const WC = 400, wcells = new Map(), spansBy = new Map(), BROKEN = new Set();
  SP.forEach((sp, i) => { const a = S[sp[0]], k = Math.floor(a.x / WC) * 100003 + Math.floor(a.z / WC); let c = spansBy.get(k); if (!c) spansBy.set(k, c = []); c.push(i); });
  drops.forEach(([sid, hp], i) => { const a = S[sid], k = Math.floor(a.x / WC) * 100003 + Math.floor(a.z / WC); let c = spansBy.get(k); if (!c) spansBy.set(k, c = []); c.push(-1 - i); });
  // the lateral order of a group's slots across the span: pairs the wires up whichever way round each pole stands
  const pair = (A0, B0, dx, dz) => {
    const lat = p => p.x * -dz + p.z * dx, a = [...A0].sort((p, q2) => lat(p) - lat(q2)), b = [...B0].sort((p, q2) => lat(p) - lat(q2)); if (!a.length || !b.length) return [];
    if (a.length === b.length) return a.map((p, i) => [p, b[i]]);
    const [sm, lg, flip] = a.length < b.length ? [a, b, false] : [b, a, true]; let best = 0, be = 1e18;
    for (let o2 = 0; o2 + sm.length <= lg.length; o2++) { let err = 0; for (let i = 0; i < sm.length; i++) err += Math.abs((lat(sm[i]) - lat(sm[0])) - (lat(lg[o2 + i]) - lat(lg[o2]))); err += Math.abs(lat(sm[0]) - lat(lg[o2])) * 0.01; if (err < be) { be = err; best = o2; } }
    return sm.map((p, i) => flip ? [lg[best + i], p] : [p, lg[best + i]]);
  };
  function buildCell(k) {
    const list = spansBy.get(k); if (!list) return null;
    const P = [], Tn = [], Wv = [], Cv = [], Sw = [], I = []; let incomplete = false;
    const curve = (a, b, cls, kv, droop) => {
      const W = WIRE[cls], L = Math.hypot(b.x - a.x, b.z - a.z), k2 = cls === 'H' ? (kv <= 69 ? 1.9e-4 : kv <= 138 ? 1.15e-4 : W.k) : W.k;
      const sag = droop ? Math.max(0.5, Math.min(a.y, b.y) - droop) : k2 * L * L, n = Math.max(4, Math.min(28, Math.ceil(L / 5)));
      const base = P.length / 3;
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t - 4 * sag * t * (1 - t);
        const t2 = Math.min(1, t + 0.5 / n), t1 = Math.max(0, t - 0.5 / n), y2 = a.y + (b.y - a.y) * t2 - 4 * sag * t2 * (1 - t2), y1 = a.y + (b.y - a.y) * t1 - 4 * sag * t1 * (1 - t1);
        const tx = (b.x - a.x) * (t2 - t1), ty = y2 - y1, tz = (b.z - a.z) * (t2 - t1), sw = 4 * t * (1 - t) * Math.min(1.2, 0.08 + L * 0.0025);
        for (const s of [-1, 1]) { P.push(x, y, z); Tn.push(tx, ty, tz); Wv.push(s, W.r); Cv.push(...W.col); Sw.push(sw); }
        if (i) { const v = base + i * 2; I.push(v - 2, v - 1, v, v - 1, v + 1, v); }
      }
    };
    for (const si of list) {
      if (si < 0) { const [sid, hp] = drops[-1 - si]; if (BROKEN.has(sid) || !ensure(S[sid])) continue; const s = S[sid], a = slotW(s, 'D')[0]; if (!a) continue; curve(a, new THREE.Vector3(hp[0], hp[1], hp[2]), 'D', 0); continue; }
      const [ia, ib, groups] = SP[si], A0 = S[ia], B0 = S[ib]; if (!ensure(A0) || !ensure(B0)) { incomplete = true; continue; }
      const dx = B0.x - A0.x, dz = B0.z - A0.z, dl = Math.hypot(dx, dz) || 1;
      const ba = BROKEN.has(ia), bb = BROKEN.has(ib);
      for (const g of groups) {
        const pr = pair(slotW(A0, g), slotW(B0, g), dx / dl, dz / dl);
        for (const [a, b] of pr) {
          if (ba && bb) continue;
          if (ba || bb) { // a pole is down: the wires hang from the one still standing to the ground at the broken one
            const up = ba ? b : a, dn = (ba ? A0 : B0), g2 = new THREE.Vector3(dn.x + (up.x - dn.x) * 0.08, heightAt(dn.x, dn.z) + 0.05, dn.z + (up.z - dn.z) * 0.08);
            curve(up, g2, g, Math.max(A0.kv, B0.kv), heightAt(dn.x, dn.z) + 0.05); continue; }
          curve(a, b, g, Math.max(A0.kv, B0.kv), 0);
        }
      }
    }
    if (!I.length) return incomplete ? undefined : null;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('tangent', new THREE.Float32BufferAttribute(Tn, 3));
    geo.setAttribute('wire', new THREE.Float32BufferAttribute(Wv, 2)); geo.setAttribute('wcol', new THREE.Float32BufferAttribute(Cv, 3)); geo.setAttribute('sway', new THREE.Float32BufferAttribute(Sw, 1));
    geo.setIndex(I); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, wmat); mesh.frustumCulled = true; mesh.renderOrder = 2; mesh.name = 'wires'; mesh.userData.incomplete = incomplete; scene.add(mesh); return mesh;
  }
  // ---- per frame
  const last = { x: 1e9, z: 1e9, t: -1 }, WR = 1500;
  function refill(cx, cz) {
    for (const [k, M] of Object.entries(meshes)) {
      const T = TYPES[k], n2 = T.near * T.near, f2 = T.far * T.far; let nd = 0, nl = 0;
      for (const s of M.list) {
        if (BROKEN.has(s.id)) continue; const d2 = (s.x - cx) ** 2 + (s.z - cz) ** 2; if (d2 >= f2 || !ensure(s)) continue;
        if (d2 < n2 && nd < M.det.instanceMatrix.count) M.det.setMatrixAt(nd++, s.m); else if (d2 < f2) M.low.setMatrixAt(nl++, s.m);
      }
      M.det.count = nd; M.low.count = nl; M.det.instanceMatrix.needsUpdate = M.low.instanceMatrix.needsUpdate = true;
    }
    const gx = Math.floor(cx / WC), gz = Math.floor(cz / WC), R = Math.ceil(WR / WC);
    const want = new Set();
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { const k = (gx + a) * 100003 + gz + b; if (spansBy.has(k)) want.add(k); }
    for (const [k, mesh] of wcells) if (!want.has(k) || mesh === undefined || (mesh && mesh.userData.incomplete)) { if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); } wcells.delete(k); } // gone out of range, or waiting on ground
    let built = 0; for (const k of want) if (!wcells.has(k) && built < 6) { wcells.set(k, buildCell(k)); built++; }
    if (built >= 6) last.t = -1; // more to build: come back next frame
  }
  const P = {
    supports: S.map(s => ({ id: s.id, x: s.x, z: s.z, type: s.type, yaw: s.yaw, scale: s.scale, foot: TYPES[s.type].foot, str: TYPES[s.type].str })),
    count: S.length, spans: SP.length,
    update(camera, renderer, night = 0) {
      const cx = camera.position.x, cz = camera.position.z;
      last.age = (last.age || 0) + 1;
      if (last.t < 0 || (cx - last.x) ** 2 + (cz - last.z) ** 2 > 30 * 30 || last.age > 240) { last.x = cx; last.z = cz; last.t = 1; last.age = 0; refill(cx, cz); }
      const h = renderer.getDrawingBufferSize(v3).y; wmat.uniforms.uPx.value = h / (2 * Math.tan(camera.fov * Math.PI / 360));
      mat.emissiveIntensity = night * 2.2;
    },
    // knock a pole down: hidden in the instances, its wires drop, and a copy of it to fall over
    breakPole(id) {
      const s = S[id]; if (!s || BROKEN.has(id)) return null; BROKEN.add(id); last.t = -1;
      for (const [k, mesh] of wcells) { const list = spansBy.get(k) || []; if (list.some(si => si < 0 ? drops[-1 - si][0] === id : SP[si][0] === id || SP[si][1] === id)) { if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); } wcells.delete(k); } }
      const g = new THREE.Mesh(models[s.type].geo, mat); g.castShadow = true; e.set(0, s.yaw, 0); g.quaternion.setFromEuler(e); g.scale.setScalar(s.scale); g.name = 'fallen-pole';
      return { obj: g, transformer: s.type === 'X', top: new THREE.Vector3(s.x, s.y + 11 * s.scale, s.z) };
    },
    isBroken: id => BROKEN.has(id),
    dispose() { for (const M of Object.values(meshes)) { scene.remove(M.det, M.low); } for (const m of wcells.values()) if (m) { scene.remove(m); m.geometry.dispose(); } },
  };
  return P;
}
