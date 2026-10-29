// Trees grown in code for the species Poway is full of that the scanned set (oak, olive, scrub oak) doesn't cover:
// Mexican fan palms (tall, thin, with a skirt of dead fronds), Canary Island date palms (thick, diamond-patterned
// trunks under a ball of arching fronds), blue gums (tall pale eucalyptus with drooping leaves), jacarandas (wide
// umbrella crowns, in leaf), California pepper trees (weeping) and Italian cypress (columns).
// Each variant is real geometry: tapered bark limbs, leaf cards built from scanned leaves (assets/pbr/atlas, ambientCG
// CC0), palm fronds; leaf normals bend outward from the crown so a crown shades like a volume. At load every variant is
// baked into the octahedral impostor atlas format of the scanned species (src/nature/vegetation.js: 8 x 8 views of
// the upper hemisphere, albedo + normals), all species sharing one atlas, so they join the same instanced draws.
//   const lib2 = await growTrees(THREE, renderer, base)   -> Map(name -> species) to merge into the vegetation lib

const G = 8; // views per side, as the scanned species

function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- textures
async function sheetImage(base, name) {
  const load = async n => createImageBitmap(await (await fetch(base + n)).blob());
  const [c, a] = await Promise.all([load(name + '_c.png'), load(name + '_a.png')]);
  const cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height; const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(c, 0, 0); const cd = g.getImageData(0, 0, c.width, c.height); g.clearRect(0, 0, c.width, c.height); g.drawImage(a, 0, 0);
  const ad = g.getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < c.width * c.height; i++) cd.data[i * 4 + 3] = ad[i * 4];
  g.putImageData(cd, 0, 0); return cv;
}
function leafBlobs(cv) {
  const N = 96, t = document.createElement('canvas'); t.width = t.height = N; const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data, seen = new Uint8Array(N * N), out = [];
  for (let s = 0; s < N * N; s++) {
    if (seen[s] || d[s * 4 + 3] < 128) continue;
    let x0 = N, y0 = N, x1 = 0, y1 = 0, cnt = 0; const st = [s]; seen[s] = 1;
    while (st.length) { const q = st.pop(), x = q % N, y = (q / N) | 0; cnt++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const k = ny * N + nx; if (!seen[k] && d[k * 4 + 3] >= 128) { seen[k] = 1; st.push(k); } } }
    if (cnt > 6 && cnt < N * N * 0.25) out.push([x0 / N * cv.width, y0 / N * cv.height, (x1 - x0 + 1) / N * cv.width, (y1 - y0 + 1) / N * cv.height]); // (a sheet whose background reads as opaque is one huge blob: not a leaf)
  }
  return out;
}
// an RGBA texture from a canvas, transparent texels filled with the mean colour so mipmaps don't darken the edges
function texFrom(THREE, cv, srgb = true, repeat = false) {
  const g = cv.getContext('2d', { willReadFrequently: true }), im = g.getImageData(0, 0, cv.width, cv.height), d = im.data, W = cv.width, H = cv.height;
  let r = 0, gg = 0, b = 0, n = 0; for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 128) { r += d[i * 4]; gg += d[i * 4 + 1]; b += d[i * 4 + 2]; n++; }
  if (n) { r /= n; gg /= n; b /= n; }
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (y * W + x) * 4, o = ((H - 1 - y) * W + x) * 4, a = d[s + 3];
    if (a < 24) { out[o] = r; out[o + 1] = gg; out[o + 2] = b; out[o + 3] = a; } else { out[o] = d[s]; out[o + 1] = d[s + 1]; out[o + 2] = d[s + 2]; out[o + 3] = a; } }
  const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
  t.userData.mean = [r / 255, gg / 255, b / 255]; return t;
}
// a twig card: thin twigs and scanned leaves stamped along them (droop: leaves hang)
function twigCard(sheet, blobs, r, o = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d', { willReadFrequently: true });
  const twigs = o.twigs ?? 5, leaves = o.leaves ?? 160, size = o.size ?? 60, hang = o.hang ?? 0;
  g.lineCap = 'round';
  for (let t = 0; t < twigs; t++) {
    let x = 256 + (r() - 0.5) * 60, y = 500, a = -Math.PI / 2 + (r() - 0.5) * 1.3; const pts = [];
    g.strokeStyle = 'rgb(84,66,48)'; g.lineWidth = 7; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 14; s++) { a += (r() - 0.5) * 0.35 + hang * 0.05 * Math.sign(Math.cos(a)); x += Math.cos(a) * 30; y += Math.sin(a) * 30; g.lineTo(x, y); pts.push([x, y, a]); g.lineWidth = Math.max(1.5, 7 - s * 0.45); }
    g.stroke();
    for (let k = 0; k < leaves / twigs; k++) {
      const [px, py, pa] = pts[Math.floor(r() * pts.length)], b = blobs[Math.floor(r() * blobs.length)], s = size * (0.75 + r() * 0.5) / Math.max(b[2], b[3]);
      g.save(); g.translate(px + (r() - 0.5) * 22, py + (r() - 0.5) * 22); g.rotate(pa + (r() - 0.5) * 2.2 + Math.PI / 2 + hang * 1.2);
      g.filter = `brightness(${(0.5 + r() * 0.35) * (o.dark || 1)}) saturate(${0.55 + r() * 0.3}) hue-rotate(${-6 - r() * 8}deg)`; // SoCal leaves: olive, dusty, not lime
      g.drawImage(sheet, b[0], b[1], b[2], b[3], -b[2] * s / 2, 0, b[2] * s, b[3] * s); g.restore();
      if (o.flowers && r() < o.flowers) { g.fillStyle = `hsl(${268 + r() * 16},${55 + r() * 20}%,${55 + r() * 15}%)`; for (let f = 0; f < 6; f++) { g.beginPath(); g.arc(px + (r() - 0.5) * 40, py + (r() - 0.5) * 40, 6 + r() * 6, 0, Math.PI * 2); g.fill(); } }
    }
  }
  return c;
}
function palmFanLeaf(r) { // a Washingtonia fan: pleated segments radiating from the hastula, tips split and drooping
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d', { willReadFrequently: true });
  const cx = 256, cy = 500, n = 54;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.06 + 0.88 * i / (n - 1)), a2 = Math.PI * (0.06 + 0.88 * (i + 1) / (n - 1)), R = 330 + r() * 120, cut = R * (0.62 + r() * 0.08);
    const tone = 0.75 + r() * 0.35, light = i % 2 ? 1 : 0.82;
    g.fillStyle = `rgb(${Math.round(78 * tone * light)},${Math.round(110 * tone * light)},${Math.round(52 * tone * light)})`;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - Math.cos(a) * cut, cy - Math.sin(a) * cut); g.lineTo(cx - Math.cos((a + a2) / 2) * R, cy - Math.sin((a + a2) / 2) * R); g.lineTo(cx - Math.cos(a2) * cut, cy - Math.sin(a2) * cut); g.closePath(); g.fill();
    if (r() < 0.35) { g.fillStyle = `rgba(150,120,70,${0.4 + r() * 0.4})`; g.beginPath(); g.moveTo(cx - Math.cos(a) * cut * 0.9, cy - Math.sin(a) * cut * 0.9); g.lineTo(cx - Math.cos((a + a2) / 2) * R, cy - Math.sin((a + a2) / 2) * R); g.lineTo(cx - Math.cos(a2) * cut * 0.9, cy - Math.sin(a2) * cut * 0.9); g.fill(); }
  }
  return c;
}
function palmPinnaLeaf(r, dead = false) { // a date-palm frond seen flat: rachis up the middle, narrow leaflets angled forward
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024; const g = c.getContext('2d', { willReadFrequently: true });
  g.strokeStyle = dead ? 'rgb(120,96,60)' : 'rgb(110,120,60)'; g.lineWidth = 10; g.beginPath(); g.moveTo(128, 1024); g.lineTo(128, 0); g.stroke();
  for (let y = 1000; y > 10; y -= 9) {
    const t = y / 1024, len = (t > 0.85 ? 0 : 118) * Math.sin(Math.min(1, (1 - t) * 1.25) * Math.PI * 0.95) + 6, tone = 0.75 + r() * 0.35;
    if (t > 0.86 && r() < 0.7) { g.strokeStyle = 'rgb(90,90,50)'; g.lineWidth = 3; } // spines near the base
    else g.strokeStyle = dead ? `rgb(${Math.round(150 * tone)},${Math.round(120 * tone)},${Math.round(75 * tone)})` : `rgb(${Math.round(70 * tone)},${Math.round(100 * tone)},${Math.round(45 * tone)})`;
    g.lineWidth = t > 0.86 ? 3 : 7; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128, y); g.quadraticCurveTo(128 + s * len * 0.5, y - len * 0.35, 128 + s * len, y - len * 0.75 + (r() - 0.5) * 10); g.stroke(); }
  }
  return c;
}
function barkCanvas(kind, r) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d', { willReadFrequently: true });
  if (kind === 'fan') { // grey with leaf-scar rings
    g.fillStyle = '#7d756a'; g.fillRect(0, 0, 256, 512);
    for (let y = 0; y < 512; y += 6 + r() * 6) { g.fillStyle = `rgba(${40 + r() * 30},${36 + r() * 25},${30 + r() * 20},${0.25 + r() * 0.35})`; g.fillRect(0, y, 256, 2 + r() * 3); }
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.07})`; g.fillRect(r() * 256, r() * 512, 2 + r() * 6, 1 + r() * 2); }
  } else if (kind === 'date') { // diamond leaf bases
    g.fillStyle = '#6b4f34'; g.fillRect(0, 0, 256, 512);
    for (let y = -32; y < 544; y += 32) for (let x = -32; x < 288; x += 32) { const ox = (Math.floor(y / 32) % 2) * 16; g.fillStyle = `rgb(${120 + r() * 40},${86 + r() * 30},${52 + r() * 20})`; g.beginPath(); g.moveTo(x + ox, y); g.lineTo(x + ox + 15, y + 16); g.lineTo(x + ox, y + 32); g.lineTo(x + ox - 15, y + 16); g.closePath(); g.fill(); g.strokeStyle = 'rgba(40,28,18,0.8)'; g.lineWidth = 2; g.stroke(); }
  } else { // smooth pale gum with peeling patches, or plain brown bark
    const gum = kind === 'gum'; g.fillStyle = gum ? '#cfc7b8' : '#5d4c3d'; g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < (gum ? 140 : 900); i++) { const w = gum ? 20 + r() * 60 : 3 + r() * 6, h = gum ? 40 + r() * 140 : 20 + r() * 60;
      g.fillStyle = gum ? `rgba(${120 + r() * 80},${105 + r() * 70},${85 + r() * 50},${0.35 + r() * 0.4})` : `rgba(${20 + r() * 40},${15 + r() * 30},${10 + r() * 20},${0.3 + r() * 0.4})`;
      g.beginPath(); g.ellipse(r() * 256, r() * 512, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill(); }
  }
  return c;
}

// ---------------------------------------------------------------- geometry
class Builder {
  constructor() { this.g = [{ p: [], n: [], u: [], c: [] }, { p: [], n: [], u: [], c: [] }]; } // 0 bark, 1 leaves
  tri(k, a, b, c, na, nb, nc, ua, ub, uc, ca, cb, cc) { const G = this.g[k]; G.p.push(...a, ...b, ...c); G.n.push(...na, ...nb, ...nc); G.u.push(...ua, ...ub, ...uc); G.c.push(...ca, ...cb, ...cc); }
  // a tapered limb from p0 to p1 (radii r0, r1), n sides; bark uv: u round in metres, v along (texture 0.6 x 1.2 m)
  limb(p0, p1, r0, r1, n, v0 = 0, ao0 = 0.55, ao1 = 0.85) {
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(...d) || 1e-3, t = d.map(v => v / L);
    let a = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; let s = cross(t, a); s = norm(s); const b = cross(s, t);
    const ring = (p, r) => Array.from({ length: n + 1 }, (_, i) => { const ang = i / n * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang); const nn = [s[0] * cs + b[0] * sn, s[1] * cs + b[1] * sn, s[2] * cs + b[2] * sn]; return [[p[0] + nn[0] * r, p[1] + nn[1] * r, p[2] + nn[2] * r], nn, ang * r / 0.6]; });
    const A = ring(p0, r0), B = ring(p1, r1), c0 = [ao0, ao0, ao0], c1 = [ao1, ao1, ao1], va = v0 / 1.2, vb = (v0 + L) / 1.2;
    for (let i = 0; i < n; i++) {
      this.tri(0, A[i][0], A[i + 1][0], B[i + 1][0], A[i][1], A[i + 1][1], B[i + 1][1], [A[i][2], va], [A[i + 1][2], va], [B[i + 1][2], vb], c0, c0, c1);
      this.tri(0, A[i][0], B[i + 1][0], B[i][0], A[i][1], B[i + 1][1], B[i][1], [A[i][2], va], [B[i + 1][2], vb], [B[i][2], vb], c0, c1, c1);
    }
    return v0 + L;
  }
  // a leaf card centred on p: right axis r, up axis u (both scaled to the card's half size), crown centre cc for normals
  card(p, r, u, cc, ao, uv = [0, 0, 1, 1], bend = 0.65) {
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [p[0] + r[0] * a + u[0] * b, p[1] + r[1] * a + u[1] * b, p[2] + r[2] * a + u[2] * b]);
    const fn = norm(cross(r, u)), nrm = v => { const o = norm([v[0] - cc[0], v[1] - cc[1], v[2] - cc[2]]); return norm([o[0] * bend + fn[0] * (1 - bend), o[1] * bend + fn[1] * (1 - bend) + 0.15, o[2] * bend + fn[2] * (1 - bend)]); };
    const U = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]], C = q.map(v => { const k = ao * (0.75 + 0.25 * Math.min(1, Math.hypot(v[0] - cc[0], v[2] - cc[2]) / 3)); return [k, k, k]; });
    this.tri(1, q[0], q[1], q[2], nrm(q[0]), nrm(q[1]), nrm(q[2]), U[0], U[1], U[2], C[0], C[1], C[2]);
    this.tri(1, q[0], q[2], q[3], nrm(q[0]), nrm(q[2]), nrm(q[3]), U[0], U[2], U[3], C[0], C[2], C[3]);
  }
  geometry(THREE) {
    const geo = new THREE.BufferGeometry(); let n = 0; for (const G of this.g) n += G.p.length / 3;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), C = new Float32Array(n * 3); let o = 0;
    this.g.forEach((G, i) => { const c = G.p.length / 3; P.set(G.p, o * 3); N.set(G.n, o * 3); U.set(G.u, o * 2); C.set(G.c, o * 3); geo.addGroup(o, c, i); o += c; });
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.computeBoundingBox(); geo.computeBoundingSphere(); return geo;
  }
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
function rotAround(v, axis, ang) { const c = Math.cos(ang), s = Math.sin(ang), d = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2], x = cross(axis, v); return [v[0] * c + x[0] * s + axis[0] * d * (1 - c), v[1] * c + x[1] * s + axis[1] * d * (1 - c), v[2] * c + x[2] * s + axis[2] * d * (1 - c)]; }
function perp(d) { const a = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; return norm(cross(d, a)); }

// ---- broadleaf trees: a trunk that forks into limbs, limbs into branches, twig cards at the ends
function broadleaf(B, r, P) {
  const tips = [];
  const branch = (p, d, len, rad, depth, v) => {
    const segs = depth === 0 ? 4 : 3; let q = p, dir = d;
    for (let s = 0; s < segs; s++) {
      dir = norm(add(dir, [(r() - 0.5) * P.wiggle, P.up * (depth ? 1 : 0.4) - P.droop * (depth / P.depth) * 0.5, (r() - 0.5) * P.wiggle]));
      const L = len / segs, q2 = add(q, dir, L), r0 = rad * (1 - s / segs * 0.35), r1 = rad * (1 - (s + 1) / segs * 0.35);
      v = B.limb(q, q2, r0, r1, depth === 0 ? 7 : depth === 1 ? 5 : 4, v, depth ? 0.7 : 0.5, 0.9); q = q2;
    }
    if (depth >= P.depth) { tips.push([q, dir]); return; }
    if (depth >= P.depth - 1) tips.push([add(p, dir, len * 0.55), dir]); // leaves along the outer limbs too: a full crown, not pom-poms
    const kids = P.kids[depth] + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const ang = P.spread[depth] * (0.75 + r() * 0.5), az = (k / kids) * Math.PI * 2 + r() * 1.2;
      let nd = rotAround(dir, perp(dir), ang); nd = rotAround(nd, dir, az);
      branch(q, nd, len * P.ratio[depth] * (0.8 + r() * 0.4), rad * 0.62, depth + 1, 0);
    }
    if (depth > 0) tips.push([q, dir]);
  };
  branch([0, 0, 0], [0, 1, 0], P.trunk, P.radius, 0, 0);
  // leaf cards round each tip, facing out of the crown
  let cx = 0, cy = 0, cz = 0; for (const [q] of tips) { cx += q[0]; cy += q[1]; cz += q[2]; } const cc = [cx / tips.length, cy / tips.length - P.card * 0.2, cz / tips.length];
  for (const [q, d] of tips) for (let k = 0; k < P.cards; k++) {
    const p = add(q, [(r() - 0.5) * P.card, (r() - 0.5) * P.card * 0.8 - P.hang * P.card * 0.5, (r() - 0.5) * P.card]);
    const out = norm([p[0] - cc[0] + (r() - 0.5), (p[1] - cc[1]) * 0.6, p[2] - cc[2] + (r() - 0.5)]);
    let up = norm(add([0, 1 - P.hang * 2, 0], d, 0.4)); if (Math.abs(up[0] * out[0] + up[1] * out[1] + up[2] * out[2]) > 0.95) up = [1, 0, 0];
    const rt = norm(cross(up, out)), u2 = norm(cross(out, rt)), s = P.card * (0.75 + r() * 0.5);
    B.card(p, rt.map(v => v * s * 0.5), u2.map(v => v * s * 0.5 * (P.tall || 1)), cc, 0.9 + r() * 0.1);
  }
}
function cypress(B, r, H) {
  B.limb([0, 0, 0], [0, H * 0.95, 0], 0.18, 0.04, 5, 0, 0.5, 0.7);
  const cc = [0, H * 0.5, 0];
  for (let y = 0.6; y < H; y += 0.35) {
    const t = y / H, R = 0.95 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - Math.pow(t, 3)) + 0.12;
    for (let k = 0; k < 5; k++) { const a = r() * Math.PI * 2, out = [Math.cos(a), 0, Math.sin(a)], p = [out[0] * R * 0.7, y, out[2] * R * 0.7], rt = norm(cross([0, 1, 0], out)), s = 0.75 + r() * 0.3;
      B.card(p, rt.map(v => v * s * 0.5), [0, s * 0.7, 0], cc, 0.85 + r() * 0.15, [0, 0, 1, 1], 0.8); }
  }
}
// palms: a trunk up a gentle curve, a crown of fronds. fan: Washingtonia; date: Phoenix canariensis
function palm(B, r, o) {
  const H = o.height, lean = [(r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12], segs = Math.ceil(H / 1.4); let p = [0, 0, 0], v = 0;
  for (let s = 0; s < segs; s++) { const t = s / segs, d = norm([lean[0] * (1 + t), 1, lean[2] * (1 + t)]), q = add(p, d, H / segs);
    v = B.limb(p, q, o.r0 + (o.r1 - o.r0) * t + (s === 0 ? 0.12 : 0), o.r0 + (o.r1 - o.r0) * (t + 1 / segs), 8, v, s === 0 ? 0.55 : 0.8, 0.9); p = q; }
  const top = p, cc = add(top, [0, 0.3, 0]);
  if (o.kind === 'date') B.limb(add(top, [0, -0.6, 0]), add(top, [0, 0.5, 0]), o.r1 * 1.15, o.r1 * 0.5, 8, v, 0.85, 0.9); // the 'pineapple' of leaf bases
  const n = o.fronds;
  for (let k = 0; k < n; k++) {
    const az = k * 2.39996 + r() * 0.3, el = o.kind === 'fan' ? 1.15 - (k / n) * 1.6 + (r() - 0.5) * 0.25 : 1.0 - (k / n) * 1.45 + (r() - 0.5) * 0.2; // golden-angle spiral, young fronds up
    const dir = norm([Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)]);
    if (o.kind === 'fan') {
      const pet = 1.8 + r() * 0.5, base = add(top, dir, 0.2), hb = add(base, dir, pet); B.limb(base, hb, 0.06, 0.035, 3, 0, 0.75, 0.85);
      // the fan, folded a little along its middle: two quads spanning the leaf canvas
      const rt = norm(cross([0, 1, 0], dir).some(Math.abs) ? cross([0, 1, 0], dir) : [1, 0, 0]), up = norm(cross(dir, rt)), F = 1.7 + r() * 0.35;
      const fold = (side, uv) => { const tilt = norm(add(up, rt, side * 0.35)); B.card(add(add(hb, dir, F * 0.5), rt, side * F * 0.25), rt.map(x => x * F * 0.25), dir.map(x => x * F * 0.5), cc, 0.95, uv, 0.5); };
      fold(-1, [0, 0, 0.5, 1]); fold(1, [0.5, 0, 1, 1]);
    } else {
      // an arching frond: a strip that rises then droops, leaflets on the texture
      const L = 4.8 + r() * 0.9, segN = 6, rt = norm(cross([0, 1, 0], [dir[0], 0, dir[2]]).some(Math.abs) ? cross([0, 1, 0], [dir[0], 0, dir[2]]) : [1, 0, 0]); let q = add(top, dir, 0.3), dd = dir;
      for (let s = 0; s < segN; s++) {
        const nd = norm(add(dd, [0, -0.32 * (s + 1) / segN, 0])), q2 = add(q, nd, L / segN), w = 0.55 * Math.sin(Math.min(1, (s + 0.5) / segN * 1.15) * Math.PI * 0.9) + 0.08, mid = add(q, nd, L / segN * 0.5);
        const v0 = s / segN, v1 = (s + 1) / segN, upn = norm(cross(nd, rt));
        for (const side of [-1, 1]) { // a shallow V along the rachis
          const wing = norm(add(rt.map(x => x * side), upn, 0.35)), a = q, b = q2, c = add(q2, wing, w), d = add(q, wing, w);
          const u0 = side < 0 ? 0.5 : 0.5, u1 = side < 0 ? 0 : 1, nn = norm(add(upn, norm([mid[0] - cc[0], mid[1] - cc[1], mid[2] - cc[2]]), 0.8));
          B.tri(1, a, b, c, nn, nn, nn, [u0, v0], [u0, v1], [u1, v1], [0.9, 0.9, 0.9], [0.95, 0.95, 0.95], [0.95, 0.95, 0.95]);
          B.tri(1, a, c, d, nn, nn, nn, [u0, v0], [u1, v1], [u1, v0], [0.9, 0.9, 0.9], [0.95, 0.95, 0.95], [0.9, 0.9, 0.9]);
        }
        q = q2; dd = nd;
      }
    }
  }
  if (o.skirt) { // a skirt of dead fronds hanging down the trunk under the crown
    for (let k = 0; k < 22; k++) { const az = k / 22 * Math.PI * 2 + r() * 0.2, out = [Math.cos(az), 0, Math.sin(az)], y = top[1] - 0.3 - r() * 0.4, L = o.skirt * (0.7 + r() * 0.5);
      const p = [top[0] + out[0] * (o.r1 + 0.25), y - L * 0.5, top[2] + out[2] * (o.r1 + 0.25)], rt = norm(cross([0, 1, 0], out));
      B.card(p, rt.map(x => x * 0.55), [out[0] * 0.15, L * 0.5, out[2] * 0.15], add(top, [0, -L * 0.5, 0]), 0.75, [0, 0, 1, 1], 0.4); }
  }
}

// ---------------------------------------------------------------- the species
async function makeVariants(THREE, base) {
  const r0 = rng(77);
  const [gum, pepper, jac] = await Promise.all(['leafset022', 'leafset013', 'leafset002'].map(n => sheetImage(base, n))), cyp = pepper; // cypress: the narrow leaves, small and dark
  const card = (sheet, o, seed) => texFrom(THREE, twigCard(sheet, leafBlobs(sheet), rng(seed), o));
  const T = {
    gum: card(gum, { twigs: 7, leaves: 460, size: 42, hang: 0.6 }, 11), pepper: card(pepper, { twigs: 8, leaves: 700, size: 26, hang: 0.9 }, 12),
    jac: card(jac, { twigs: 7, leaves: 650, size: 22 }, 13), // in leaf: they only flower (purple) for a few weeks in late spring
    cyp: card(cyp, { twigs: 12, leaves: 1100, size: 16, dark: 0.88 }, 14),
    fan: texFrom(THREE, palmFanLeaf(rng(15))), date: texFrom(THREE, palmPinnaLeaf(rng(16))), dead: texFrom(THREE, palmPinnaLeaf(rng(17), true)),
    barkGum: texFrom(THREE, barkCanvas('gum', rng(18)), true, true), bark: texFrom(THREE, barkCanvas('brown', rng(19)), true, true),
    barkFan: texFrom(THREE, barkCanvas('fan', rng(20)), true, true), barkDate: texFrom(THREE, barkCanvas('date', rng(21)), true, true),
  };
  const mats = (bark, leaf) => [new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 }), new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.5, roughness: 0.75, side: THREE.DoubleSide })];
  const S = {
    palm_fan: { trans: 0.25, sway: 0.006, list: [] }, palm_date: { trans: 0.25, sway: 0.008, list: [] }, eucalyptus: { trans: 0.2, sway: 0.01, list: [] },
    jacaranda: { trans: 0.2, sway: 0.012, list: [] }, pepper: { trans: 0.25, sway: 0.016, list: [] }, slender: { trans: 0.15, sway: 0.008, list: [] },
  };
  const grow = (name, fn, bark, leaf) => { const B = new Builder(); fn(B); S[name].list.push({ geo: B.geometry(THREE), mats: mats(bark, leaf) }); };
  for (let i = 0; i < 3; i++) { const r = rng(100 + i); grow('palm_fan', B => palm(B, r, { kind: 'fan', height: [17, 12, 21][i], r0: 0.42, r1: 0.26, fronds: 34, skirt: i === 1 ? 0 : 2.8 + i }), T.barkFan, T.fan); }
  for (let i = 0; i < 2; i++) { const r = rng(200 + i); grow('palm_date', B => palm(B, r, { kind: 'date', height: [7, 10.5][i], r0: 0.62, r1: 0.52, fronds: 46 }), T.barkDate, T.date); }
  for (let i = 0; i < 3; i++) { const r = rng(300 + i); grow('eucalyptus', B => broadleaf(B, r, { trunk: [9, 12, 7][i], radius: 0.42, depth: 3, kids: [3, 2, 2], spread: [0.45, 0.55, 0.6], ratio: [0.75, 0.62, 0.55], wiggle: 0.35, up: 0.25, droop: 0.3, cards: 8, card: 1.9, hang: 0.35, tall: 1.3 }), T.barkGum, T.gum); }
  for (let i = 0; i < 2; i++) { const r = rng(400 + i); grow('jacaranda', B => broadleaf(B, r, { trunk: 2.6, radius: 0.3, depth: 3, kids: [4, 3, 2], spread: [0.85, 0.6, 0.55], ratio: [1.3, 0.62, 0.55], wiggle: 0.3, up: 0.06, droop: 0.15, cards: 7, card: 1.7, hang: 0.05 }), T.bark, T.jac); }
  for (let i = 0; i < 2; i++) { const r = rng(500 + i); grow('pepper', B => broadleaf(B, r, { trunk: 2.2, radius: 0.36, depth: 3, kids: [4, 3, 2], spread: [0.8, 0.7, 0.6], ratio: [1.1, 0.6, 0.55], wiggle: 0.45, up: 0.05, droop: 0.6, cards: 8, card: 1.8, hang: 0.85, tall: 1.6 }), T.bark, T.pepper); }
  for (let i = 0; i < 2; i++) { const r = rng(600 + i); grow('slender', B => cypress(B, r, [11, 14][i]), T.bark, T.cyp); }
  return S;
}

// ---------------------------------------------------------------- impostor baking
const BAKE_NRM_VS = /* glsl */`
varying vec3 vN; varying vec2 vUv2;
void main() { vUv2 = uv; vN = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
const BAKE_NRM_FS = /* glsl */`
uniform sampler2D map; uniform float useMap; varying vec3 vN; varying vec2 vUv2;
void main() { if (useMap > 0.5 && texture2D(map, vUv2).a < 0.5) discard; vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); n.z = max(n.z, 0.05); gl_FragColor = vec4(normalize(n) * 0.5 + 0.5, 1.0); }`;

function decodeDir(fx, fy) { const ax = (fx + 0.5) / G * 2 - 1, ay = (fy + 0.5) / G * 2 - 1; const d = [(ax + ay) * 0.5, 0, (ax - ay) * 0.5]; d[1] = 1 - Math.abs(d[0]) - Math.abs(d[2]); return norm(d); }

export async function growTrees(THREE, renderer, base = 'assets/pbr/atlas/', opts = {}) {
  const S = await makeVariants(THREE, base);
  return speciesFrom(THREE, renderer, S, opts);
}
// species records (vegetation library format) from { name: { trans, sway, list: [{ geo, mats }] } }, all baked into one
// impostor atlas (src/nature/rocks.js uses it too)
export function speciesFrom(THREE, renderer, S, opts = {}) {
  const all = []; for (const [name, sp] of Object.entries(S)) sp.list.forEach((v, i) => all.push({ name, i, ...v }));
  const cell = opts.cell || 112, cols = 4, rows = Math.ceil(all.length / cols), W = cols * G * cell, H = rows * G * cell;
  const rtA = new THREE.WebGLRenderTarget(W, H, { samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  rtA.texture.colorSpace = THREE.SRGBColorSpace;
  const rtN = new THREE.WebGLRenderTarget(W / 2, H / 2, { samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(0, cols * G, rows * G, 0, -10, 10); cam.position.set(0, 0, 5); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const meshesA = [], meshesN = [];
  all.forEach((v, k) => {
    const bx = k % cols, by = Math.floor(k / cols), bb = v.geo.boundingBox, c = [(bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2];
    let R = 0; const P = v.geo.attributes.position; for (let i = 0; i < P.count; i++) R = Math.max(R, Math.hypot(P.getX(i) - c[0], P.getY(i) - c[1], P.getZ(i) - c[2]));
    R *= 1.02; v.block = [bx, by]; v.center = c; v.radius = R; v.height = bb.max.y; v.width = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    const matsA = v.mats.map(m => new THREE.MeshBasicMaterial({ map: m.map, vertexColors: true, alphaTest: m.alphaTest || 0, side: THREE.DoubleSide }));
    const matsN = v.mats.map(m => new THREE.ShaderMaterial({ vertexShader: BAKE_NRM_VS, fragmentShader: BAKE_NRM_FS, side: THREE.DoubleSide, uniforms: { map: { value: m.map }, useMap: { value: m.alphaTest ? 1 : 0 } } }));
    const iA = new THREE.InstancedMesh(v.geo, matsA, G * G), iN = new THREE.InstancedMesh(v.geo, matsN, G * G);
    const m4 = new THREE.Matrix4(), rot = new THREE.Matrix4(), sc = new THREE.Matrix4(), tr = new THREE.Matrix4(), tc = new THREE.Matrix4().makeTranslation(-c[0], -c[1], -c[2]);
    for (let fy = 0; fy < G; fy++) for (let fx = 0; fx < G; fx++) {
      const d = decodeDir(fx, fy), u = norm([0 - d[0] * d[1], 1 - d[1] * d[1], 0 - d[2] * d[1]]), rr = cross(u, d);
      rot.makeBasis(new THREE.Vector3(...rr), new THREE.Vector3(...u), new THREE.Vector3(...d)).transpose();
      sc.makeScale(0.5 / R, 0.5 / R, 0.5 / R); tr.makeTranslation(bx * G + fx + 0.5, by * G + fy + 0.5, 0);
      m4.copy(tr).multiply(sc).multiply(rot).multiply(tc); iA.setMatrixAt(fy * G + fx, m4); iN.setMatrixAt(fy * G + fx, m4);
    }
    iA.frustumCulled = iN.frustumCulled = false; meshesA.push(iA); meshesN.push(iN);
  });
  const prev = { rt: renderer.getRenderTarget(), auto: renderer.autoClear, col: renderer.getClearColor(new THREE.Color()), a: renderer.getClearAlpha(), tm: renderer.toneMapping, sh: renderer.shadowMap.enabled };
  renderer.autoClear = true; renderer.shadowMap.enabled = false;
  for (const m of meshesA) scene.add(m);
  renderer.setRenderTarget(rtA); renderer.setClearColor(new THREE.Color(...(opts.clear || [0.16, 0.2, 0.1])), 0); renderer.clear(); renderer.render(scene, cam);
  for (const m of meshesA) scene.remove(m); for (const m of meshesN) scene.add(m);
  renderer.setRenderTarget(rtN); renderer.setClearColor(new THREE.Color(0.5, 0.5, 1), 0); renderer.clear(); renderer.render(scene, cam);
  renderer.setRenderTarget(prev.rt); renderer.autoClear = prev.auto; renderer.setClearColor(prev.col, prev.a); renderer.shadowMap.enabled = prev.sh;
  for (const m of [...meshesA, ...meshesN]) { scene.remove(m); for (const mt of [].concat(m.material)) mt.dispose(); m.dispose(); }
  // species records in the vegetation library's format (veg.json + loaded textures)
  const out = new Map();
  for (const [name, sp] of Object.entries(S)) {
    const vs = all.filter(v => v.name === name);
    out.set(name, { name, G, cell, blocks: [cols, rows], trans: sp.trans, sway: sp.sway, alb: rtA.texture, nrm: rtN.texture, procedural: true,
      variants: vs.map(v => ({ name: name + v.i, block: v.block, center: v.center, radius: v.radius, height: v.height, width: v.width, lod: true })),
      lods: vs.map(v => ({ geo: v.geo, mats: v.mats })) });
  }
  out.targets = [rtA, rtN];
  return out;
}
