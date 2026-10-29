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

const idle = () => new Promise(r => setTimeout(r, 0)); // growing and baking yield to the game's frames between pieces

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
// the leaf sheet in a handful of tones, each filtered once at half size: stamping thousands of leaves each with its own
// canvas filter took seconds and froze the game
function toneSheets(sheet, dark = 1) {
  const W = Math.ceil(sheet.width / 2), H = Math.ceil(sheet.height / 2), out = [];
  for (let k = 0; k < 8; k++) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.filter = `brightness(${(0.68 + (k / 7) * 0.5) * dark}) saturate(${0.6 + ((k * 5) % 8) / 7 * 0.35}) hue-rotate(${-6 - ((k * 3) % 8) / 7 * 8}deg)`; // SoCal leaves: olive, dusty, not lime; some catching the light
    g.drawImage(sheet, 0, 0, W, H); out.push(c);
  }
  return out;
}
// a twig card: thin twigs and scanned leaves stamped along them (droop: leaves hang)
function twigCard(sheet, blobs, r, o = {}) {
  const tones = toneSheets(sheet, o.dark || 1);
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
      g.drawImage(tones[Math.floor(r() * tones.length)], b[0] / 2, b[1] / 2, b[2] / 2, b[3] / 2, -b[2] * s / 2, 0, b[2] * s, b[3] * s); g.restore(); // each leaf its own tone
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
    g.fillStyle = `rgb(${Math.round(100 * tone * light)},${Math.round(126 * tone * light)},${Math.round(60 * tone * light)})`; // glossy yellow-green
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - Math.cos(a) * cut, cy - Math.sin(a) * cut); g.lineTo(cx - Math.cos((a + a2) / 2) * R, cy - Math.sin((a + a2) / 2) * R); g.lineTo(cx - Math.cos(a2) * cut, cy - Math.sin(a2) * cut); g.closePath(); g.fill();
    if (r() < 0.35) { g.fillStyle = `rgba(150,120,70,${0.4 + r() * 0.4})`; g.beginPath(); g.moveTo(cx - Math.cos(a) * cut * 0.9, cy - Math.sin(a) * cut * 0.9); g.lineTo(cx - Math.cos((a + a2) / 2) * R, cy - Math.sin((a + a2) / 2) * R); g.lineTo(cx - Math.cos(a2) * cut * 0.9, cy - Math.sin(a2) * cut * 0.9); g.fill(); }
  }
  return c;
}
function palmPinnaLeaf(r, dead = false, queen = false) { // a date-palm frond seen flat: rachis up the middle, narrow leaflets angled forward
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024; const g = c.getContext('2d', { willReadFrequently: true });
  g.strokeStyle = dead ? 'rgb(120,96,60)' : 'rgb(110,120,60)'; g.lineWidth = 10; g.beginPath(); g.moveTo(128, 1024); g.lineTo(128, 0); g.stroke();
  for (let y = 1000; y > 10; y -= 9) {
    const t = y / 1024, len = (t > 0.85 ? 0 : 118) * Math.sin(Math.min(1, (1 - t) * 1.25) * Math.PI * 0.95) + 6, tone = 0.75 + r() * 0.35;
    if (t > 0.86 && r() < 0.7) { g.strokeStyle = 'rgb(90,90,50)'; g.lineWidth = 3; } // spines near the base
    else g.strokeStyle = dead ? `rgb(${Math.round(150 * tone)},${Math.round(120 * tone)},${Math.round(75 * tone)})` : queen ? `rgb(${Math.round(64 * tone)},${Math.round(104 * tone)},${Math.round(46 * tone)})` : `rgb(${Math.round(98 * tone)},${Math.round(118 * tone)},${Math.round(58 * tone)})`; // Canary palm green, a little yellow; queen palms darker
    g.lineWidth = t > 0.86 ? 3 : queen ? 5 : 7; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128, y); if (queen) g.quadraticCurveTo(128 + s * len * 0.6, y - len * 0.1, 128 + s * len * 0.95, y + len * 0.25 + (r() - 0.5) * 14); else g.quadraticCurveTo(128 + s * len * 0.5, y - len * 0.35, 128 + s * len, y - len * 0.75 + (r() - 0.5) * 10); g.stroke(); } // queen leaflets hang soft
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
    const R = this.crownR || 3, U = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    const C = q.map(v => { const d = Math.hypot(v[0] - cc[0], (v[1] - cc[1]) * 1.3, v[2] - cc[2]) / R, top = Math.max(0, Math.min(1, (v[1] - cc[1]) / R * 0.5 + 0.5));
      const k = ao * (0.42 + 0.58 * Math.min(1, Math.max(0, (d - 0.25) / 0.75))) * (0.85 + 0.25 * top); return [k, k, k]; }); // deep in the crown it's dark; the sunny top and rim are bright
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
    if (depth >= P.depth - 2 && depth > 0) for (const f of [0.3, 0.62, 0.85]) tips.push([add(p, dir, len * f), dir, 0.55]); // leaves all along the outer limbs: a crown, not pom-poms on sticks
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
  { let m = 0; for (const [q] of tips) m = Math.max(m, Math.hypot(q[0] - cc[0], q[1] - cc[1], q[2] - cc[2])); B.crownR = m + P.card * 0.5; }
  for (const [q, d, wgt] of tips) for (let k = 0, nk = Math.max(2, Math.round(P.cards * (wgt || 0.75))); k < nk; k++) {
    const p = add(q, [(r() - 0.5) * P.card * 1.6, (r() - 0.5) * P.card * 1.1 - P.hang * P.card * 0.5, (r() - 0.5) * P.card * 1.6]); // loose sprays, gaps between them
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
// palms: a trunk that leans and curves back toward the sky, a crown of fronds. fan: Washingtonia robusta (tall, thin, a
// flared foot, often leaning; trimmed ones keep a 'boot' of cut leaf bases under the crown, untrimmed ones a skirt of dead
// fronds); date: Phoenix canariensis (thick, diamond-patterned, a huge ball of arching fronds); queen: Syagrus (a slender
// ringed grey trunk, soft feathery fronds that arch and hang)
//   o: { kind, height (trunk length), r0, r1 (radius at foot, at top), fronds, lean (radians from vertical at the foot),
//        curve (0: a straight lean .. 1: upright again at the top), skirt (m of dead fronds), boot (m of leaf bases), frond (size) }
function palm(B, r, o) {
  const H = o.height, az = r() * Math.PI * 2, lean = o.lean || 0, curve = o.curve || 0, segs = Math.max(6, Math.ceil(H / 1.1));
  const wob = [(r() - 0.5) * 0.05, (r() - 0.5) * 0.05, r() * 6]; // trunks are never quite true
  let p = [0, 0, 0], v = 0, d = [0, 1, 0];
  const flare = o.kind === 'date' ? 1.25 : o.kind === 'queen' ? 1.3 : 1.7; // the swollen foot (Washingtonia's is wide)
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs, t1 = (s + 1) / segs, tm = (t0 + t1) / 2, a = lean * (1 - curve * Math.pow(tm, 1.3));
    d = norm([Math.sin(a) * Math.cos(az) + wob[0] * Math.sin(tm * 6 + wob[2]), Math.cos(a), Math.sin(a) * Math.sin(az) + wob[1] * Math.cos(tm * 5 + wob[2])]);
    const L = s === 0 ? Math.min(0.7, H / segs) : (H - Math.min(0.7, H / segs)) / (segs - 1), q = add(p, d, L);
    const rad = t => { const base = o.r0 + (o.r1 - o.r0) * t; return base * (1 + (flare - 1) * Math.exp(-t * H / 0.55)); };
    const boot = o.boot && (H - (s + 1) * (H / segs)) < o.boot; // the top stretch: leaf bases left by trimming
    v = B.limb(p, q, rad(t0) * (boot ? 1.35 : 1), rad(t1) * (boot ? 1.4 : 1), o.kind === 'fan' ? 9 : 10, v, s === 0 ? 0.5 : boot ? 0.62 : 0.82, boot ? 0.66 : 0.9);
    if (boot) for (let k = 0; k < 7; k++) { const ang = k / 7 * Math.PI * 2 + s * 0.9, out = [Math.cos(ang), 0.55, Math.sin(ang)], b0 = add(p, out, rad(t1) * 1.1); B.limb(b0, add(b0, norm(out), 0.28 + r() * 0.12), 0.07, 0.04, 3, 0, 0.55, 0.65); } // cut petiole stubs
    p = q;
  }
  const top = p, up = norm(add(d, [0, 1, 0])), e1 = perp(up), e2 = cross(up, e1), cc = add(top, up, 0.3);
  const dirAt = (az2, el) => norm(add(add(e1.map(x => x * Math.cos(az2) * Math.cos(el)), e2.map(x => x * Math.sin(az2) * Math.cos(el))), up.map(x => x * Math.sin(el))));
  if (o.kind === 'date') B.limb(add(top, up, -0.7), add(top, up, 0.5), o.r1 * 1.2, o.r1 * 0.5, 10, v, 0.8, 0.9); // the 'pineapple' of leaf bases
  if (o.kind === 'queen') B.limb(add(top, up, -1.2), add(top, up, 0.4), o.r1 * 0.95, o.r1 * 0.55, 8, v, 0.85, 0.95); // the smooth green crownshaft
  const n = o.fronds, F0 = o.frond || 1;
  for (let k = 0; k < n; k++) {
    const age = k / n, azk = k * 2.39996 + r() * 0.3; // golden-angle spiral; young fronds point up, old ones droop
    const el = o.kind === 'fan' ? 1.2 - age * 1.75 + (r() - 0.5) * 0.25 : o.kind === 'queen' ? 0.95 - age * 1.2 + (r() - 0.5) * 0.25 : 1.0 - age * 1.45 + (r() - 0.5) * 0.2;
    const dir = dirAt(azk, el), aoF = 0.98 - age * 0.18; // inner and old fronds are a little darker
    if (o.kind === 'fan') {
      const pet = (1.5 + r() * 0.6) * F0, base = add(top, dir, 0.2), hb = add(base, dir, pet); B.limb(base, hb, 0.06, 0.035, 3, 0, 0.75, 0.85);
      // the fan, folded a little along its middle: two quads spanning the leaf canvas, tipped down as it ages
      const rt = norm(cross([0, 1, 0], dir).some(Math.abs) ? cross([0, 1, 0], dir) : [1, 0, 0]), upv = norm(cross(dir, rt)), F = (1.55 + r() * 0.4) * F0;
      const fd = norm(add(dir, [0, -0.25 - age * 0.5, 0]));
      const fold = (side, uv) => { const w = norm(add(rt, upv, 0.35 * side)).map(x => x * F * 0.25); B.card(add(add(hb, fd, F * 0.5), w, side), w, fd.map(x => x * F * 0.5), cc, aoF, uv, 0.5); };
      fold(-1, [0, 0, 0.5, 1]); fold(1, [0.5, 0, 1, 1]);
    } else {
      // an arching frond: a strip that rises then droops, leaflets on the texture. Queen palm leaflets stand in several
      // planes (plumose): two pairs of wings, one up, one down
      const queen = o.kind === 'queen', L = (queen ? 3.6 + r() * 0.9 : 4.6 + r() * 1.0) * F0, segN = queen ? 7 : 6, droop = queen ? 0.75 : 0.42;
      const hd = [dir[0], 0, dir[2]], rt = norm(cross([0, 1, 0], hd).some(Math.abs) ? cross([0, 1, 0], hd) : [1, 0, 0]); let q = add(top, dir, 0.3), dd = dir;
      for (let s = 0; s < segN; s++) {
        const nd = norm(add(dd, [0, -droop * (s + 1) / segN * (0.7 + age * 0.6), 0])), q2 = add(q, nd, L / segN), w = (queen ? 0.5 : 0.42) * Math.sin(Math.min(1, (s + 0.5) / segN * 1.15) * Math.PI * 0.9) + 0.06, mid = add(q, nd, L / segN * 0.5);
        const v0 = s / segN, v1 = (s + 1) / segN, upn = norm(cross(nd, rt));
        for (const tilt of queen ? [0.45, -0.55] : [0.35]) for (const side of [-1, 1]) {
          const wing = norm(add(rt.map(x => x * side), upn, tilt)), a = q, b = q2, c = add(q2, wing, w), dq = add(q, wing, w);
          const u0 = 0.5, u1 = side < 0 ? 0 : 1, nn = norm(add(upn, norm([mid[0] - cc[0], mid[1] - cc[1], mid[2] - cc[2]]), 0.8)), k0 = 0.9 * aoF, k1 = 0.95 * aoF;
          B.tri(1, a, b, c, nn, nn, nn, [u0, v0], [u0, v1], [u1, v1], [k0, k0, k0], [k1, k1, k1], [k1, k1, k1]);
          B.tri(1, a, c, dq, nn, nn, nn, [u0, v0], [u1, v1], [u1, v0], [k0, k0, k0], [k1, k1, k1], [k0, k0, k0]);
        }
        q = q2; dd = nd;
      }
    }
  }
  if (o.skirt) { // a skirt of dead fronds hanging down the trunk under the crown, thatched in two rows
    for (let row = 0; row < 2; row++) for (let k = 0; k < 20; k++) {
      const az2 = k / 20 * Math.PI * 2 + row * 0.16 + r() * 0.2, out = add(e1.map(x => x * Math.cos(az2)), e2.map(x => x * Math.sin(az2))), L = o.skirt * (0.6 + r() * 0.5) * (row ? 0.75 : 1);
      const y0 = -0.25 - r() * 0.35 - row * o.skirt * 0.35, p0 = add(add(top, up, y0), out, o.r1 * 1.1 + 0.2 + row * 0.08), rt = norm(cross(up, out));
      B.card(add(p0, up, -L * 0.5), rt.map(x => x * (0.5 + r() * 0.15)), add(up.map(x => x * L * 0.5), out, 0.12 + row * 0.05), add(top, up, -L * 0.6), 0.7 - row * 0.08, [0, 0, 1, 1], 0.4);
    }
  }
}

// ---------------------------------------------------------------- the species
async function makeVariants(THREE, base) {
  const r0 = rng(77);
  const [gum, pepper, jac, oak] = await Promise.all(['leafset022', 'leafset013', 'leafset002', 'leafset024'].map(n => sheetImage(base, n))), cyp = pepper; // cypress: the narrow leaves, small and dark
  const card = async (sheet, o, seed) => { await idle(); return texFrom(THREE, twigCard(sheet, leafBlobs(sheet), rng(seed), o)); };
  const T = {
    gum: await card(gum, { twigs: 7, leaves: 460, size: 42, hang: 0.6 }, 11), pepper: await card(pepper, { twigs: 8, leaves: 700, size: 26, hang: 0.9 }, 12),
    jac: await card(jac, { twigs: 7, leaves: 650, size: 22 }, 13), // in leaf: they only flower (purple) for a few weeks in late spring
    cyp: await card(cyp, { twigs: 12, leaves: 1100, size: 16, dark: 0.88 }, 14),
    oak: await card(oak, { twigs: 9, leaves: 900, size: 17, dark: 0.82, hang: 0.15 }, 31), // coast live oak: small, glossy, dark leaves
    fan: texFrom(THREE, palmFanLeaf(rng(15))), date: texFrom(THREE, palmPinnaLeaf(rng(16))), dead: texFrom(THREE, palmPinnaLeaf(rng(17), true)), queen: texFrom(THREE, palmPinnaLeaf(rng(22), false, true)),
    barkGum: texFrom(THREE, barkCanvas('gum', rng(18)), true, true), bark: texFrom(THREE, barkCanvas('brown', rng(19)), true, true),
    barkFan: texFrom(THREE, barkCanvas('fan', rng(20)), true, true), barkDate: texFrom(THREE, barkCanvas('date', rng(21)), true, true),
  };
  const mats = (bark, leaf) => [new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 }), new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.5, roughness: 0.75, side: THREE.DoubleSide })];
  const S = {
    palm_fan: { trans: 0.25, sway: 0.006, list: [] }, palm_date: { trans: 0.25, sway: 0.008, list: [] }, palm_queen: { trans: 0.3, sway: 0.012, list: [] }, eucalyptus: { trans: 0.2, sway: 0.01, list: [] },
    jacaranda: { trans: 0.2, sway: 0.012, list: [] }, pepper: { trans: 0.25, sway: 0.016, list: [] }, slender: { trans: 0.15, sway: 0.008, list: [] },
    oak: { trans: 0.15, sway: 0.008, list: [] },
  };
  const jobs = [], grow = (name, fn, bark, leaf) => jobs.push(() => { const B = new Builder(); fn(B); S[name].list.push({ geo: B.geometry(THREE), mats: mats(bark, leaf) }); });
  // palms, each its own: tall leaners curving back up, trimmed ones with a boot, young bushy ones still in their skirts
  const FAN = [{ height: 22, lean: 0.12, curve: 0.3, fronds: 30, boot: 1.6 }, { height: 14, lean: 0.05, fronds: 38, skirt: 3.6 }, { height: 26, lean: 0.32, curve: 0.65, fronds: 26, boot: 1.2 },
    { height: 9, lean: 0.2, curve: 0.25, fronds: 42, skirt: 2.4, frond: 1.1 }, { height: 18, lean: 0.24, fronds: 28, skirt: 1.3 }, { height: 24, lean: 0.08, curve: 0.5, fronds: 21, boot: 0.8, frond: 0.9 }];
  FAN.forEach((f, i) => { const r = rng(100 + i); grow('palm_fan', B => palm(B, r, { kind: 'fan', r0: 0.36, r1: 0.24, ...f }), T.barkFan, T.fan); });
  const DATE = [{ height: 7, lean: 0.04, fronds: 50 }, { height: 11, lean: 0.12, curve: 0.4, fronds: 40 }, { height: 4.5, lean: 0.06, fronds: 58, frond: 1.08 }];
  DATE.forEach((f, i) => { const r = rng(200 + i); grow('palm_date', B => palm(B, r, { kind: 'date', r0: 0.62, r1: 0.52, ...f }), T.barkDate, T.date); });
  const QUEEN = [{ height: 9, lean: 0.06, fronds: 16 }, { height: 12, lean: 0.16, curve: 0.5, fronds: 13, frond: 1.1 }];
  QUEEN.forEach((f, i) => { const r = rng(250 + i); grow('palm_queen', B => palm(B, r, { kind: 'queen', r0: 0.2, r1: 0.17, ...f }), T.barkFan, T.queen); });
  for (let i = 0; i < 3; i++) { const r = rng(300 + i); grow('eucalyptus', B => broadleaf(B, r, { trunk: [6, 8, 5][i], radius: 0.42, depth: 3, kids: [3, 3, 2], spread: [0.55, 0.65, 0.7], ratio: [0.9, 0.7, 0.6], wiggle: 0.4, up: 0.22, droop: 0.35, cards: 11, card: 2.3, hang: 0.45, tall: 1.4 }), T.barkGum, T.gum); }
  for (let i = 0; i < 2; i++) { const r = rng(400 + i); grow('jacaranda', B => broadleaf(B, r, { trunk: 2.6, radius: 0.3, depth: 3, kids: [4, 3, 2], spread: [0.85, 0.6, 0.55], ratio: [1.3, 0.62, 0.55], wiggle: 0.3, up: 0.06, droop: 0.15, cards: 7, card: 1.7, hang: 0.05 }), T.bark, T.jac); }
  for (let i = 0; i < 2; i++) { const r = rng(500 + i); grow('pepper', B => broadleaf(B, r, { trunk: 2.2, radius: 0.36, depth: 3, kids: [4, 3, 2], spread: [0.8, 0.7, 0.6], ratio: [1.1, 0.6, 0.55], wiggle: 0.45, up: 0.05, droop: 0.6, cards: 8, card: 1.8, hang: 0.85, tall: 1.6 }), T.bark, T.pepper); }
  for (let i = 0; i < 2; i++) { const r = rng(600 + i); grow('slender', B => cypress(B, r, [11, 14][i]), T.bark, T.cyp); }
  // coast live oak: a short, thick trunk splitting low into big sinuous limbs; a dense, rounded crown wider than it is tall
  for (let i = 0; i < 3; i++) { const r = rng(700 + i); grow('oak', B => broadleaf(B, r, { trunk: [1.8, 2.3, 1.5][i], radius: 0.55, depth: 3, kids: [4, 3, 3], spread: [1.0, 0.75, 0.65], ratio: [2.4, 0.62, 0.55], wiggle: 0.5, up: 0.04, droop: 0.25, cards: 11, card: 1.7, hang: 0.1, tall: 0.9 }), T.bark, T.oak); }
  for (const j of jobs) { await idle(); j(); } // one tree at a time between frames
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
export async function speciesFrom(THREE, renderer, S, opts = {}) {
  const all = []; for (const [name, sp] of Object.entries(S)) sp.list.forEach((v, i) => all.push({ name, i, ...v }));
  const cell = opts.cell || 112, cols = 4, rows = Math.ceil(all.length / cols), W = cols * G * cell, H = rows * G * cell;
  const rtA = new THREE.WebGLRenderTarget(W, H, { samples: 4, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  rtA.texture.colorSpace = THREE.SRGBColorSpace;
  const rtN = new THREE.WebGLRenderTarget(W / 2, H / 2, { samples: 4, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
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
  // one variant per pass with a frame between passes (the whole atlas in one go held the GPU for a long moment). The
  // game renders in between, so the renderer's state is borrowed only for each pass and handed straight back.
  const borrow = () => ({ rt: renderer.getRenderTarget(), auto: renderer.autoClear, col: renderer.getClearColor(new THREE.Color()), a: renderer.getClearAlpha(), sh: renderer.shadowMap.enabled });
  const giveBack = k => { renderer.setRenderTarget(k.rt); renderer.autoClear = k.auto; renderer.setClearColor(k.col, k.a); renderer.shadowMap.enabled = k.sh; };
  const pass = async (rt, list, col) => {
    for (let i = 0; i < list.length; i++) {
      const k = borrow(); renderer.shadowMap.enabled = false; renderer.setRenderTarget(rt);
      if (i === 0) { renderer.setClearColor(col, 0); renderer.clear(); }
      renderer.autoClear = false; scene.add(list[i]); renderer.render(scene, cam); scene.remove(list[i]); giveBack(k);
      await idle();
    }
  };
  await pass(rtA, meshesA, new THREE.Color(0, 0, 0)); // onto transparent black: premultiplied, so edges and mips carry no background colour
  await pass(rtN, meshesN, new THREE.Color(0.5, 0.5, 1));
  for (const m of [...meshesA, ...meshesN]) { scene.remove(m); for (const mt of [].concat(m.material)) mt.dispose(); m.dispose(); }
  // the bake is antialiased (4 samples); keeping a multisampled target alive holds 4 more copies of the atlas in GPU
  // memory for nothing, so copy each into a plain one with mipmaps and let the multisampled one go
  const plain = (src, srgb) => {
    const dst = new THREE.WebGLRenderTarget(src.width, src.height, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    if (srgb) dst.texture.colorSpace = THREE.SRGBColorSpace;
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { map: { value: src.texture } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }' }));
    q.frustumCulled = false; const sc2 = new THREE.Scene(); sc2.add(q);
    renderer.setRenderTarget(dst); renderer.render(sc2, cam); q.geometry.dispose(); q.material.dispose(); src.dispose(); return dst;
  };
  const k = borrow(); renderer.autoClear = true; renderer.shadowMap.enabled = false;
  const tA = plain(rtA, true), tN = plain(rtN, false);
  giveBack(k);
  // species records in the vegetation library's format (veg.json + loaded textures)
  const out = new Map();
  for (const [name, sp] of Object.entries(S)) {
    const vs = all.filter(v => v.name === name);
    out.set(name, { name, G, cell, blocks: [cols, rows], trans: sp.trans, sway: sp.sway, alb: tA.texture, nrm: tN.texture, procedural: true, premul: true,
      variants: vs.map(v => ({ name: name + v.i, block: v.block, center: v.center, radius: v.radius, height: v.height, width: v.width, lod: true })),
      lods: vs.map(v => ({ geo: v.geo, mats: v.mats })) });
  }
  out.targets = [tA, tN];
  return out;
}
