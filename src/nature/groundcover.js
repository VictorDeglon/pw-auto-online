// Grass and brush over the whole map, so the ground reads as covered rather than as a stretched aerial photo.
//
// Two pieces:
//  - A cover map (one texel per 4 m over the play area) built at load from the aerial photo: the same colour
//    classes the terrain shader uses (lawn, dry grass, chaparral/leaf litter, bare soil, paving), with roads,
//    buildings, houses, pools, water and parking lots masked out. R = short (lawn) grass, G = brush, B = dryness,
//    A = tall wild grass. A second map (landTex) holds the land use the ground shader also reads: R yards round
//    houses, G parks and fields, B urban density, A 1 where the yard is a lawn (else a dry garden).
//  - Two instanced layers that follow the camera, drawn with one draw call each: grass clumps out to ~55 m and
//    brush clumps out to ~200 m. Every instance is anchored to a world grid cell (position and size come from a
//    hash of the cell), so nothing swims as you move. The vertex shader reads the cover map for density and colour
//    and a small height texture (re-centred as the camera travels) for the ground height. Lambert material, so
//    grass picks up the scene's sun, sky, shadows and fog for free. Cars and the player push it aside.
//  - Shaded the way Unreal shades landscape grass: crossed cards textured with drawn blades / leaves (no assets),
//    normals that follow the ground so the grass lights like the ground it grows from, darker at the root, an
//    anti-aliased alpha cut that keeps thin blades from vanishing with distance, and a fade that shrinks the clumps
//    into the ground at the edge of the ring instead of dithering them away.
// Beyond the brush radius, scatterShrubs() adds impostor shrubs (src/nature/vegetation.js) on wild land map-wide.
import { HOLE_U, HOLE_GLSL } from './ground.js';
import { BG } from '../budget.js';

// ---------------------------------------------------------------- the cover map
// opts: { bounds: [x0, z0, x1, z1], drawAerial(ctx), roads, buildings, houses, pools, areas, mpp }
// long jobs work in slices of a few milliseconds and yield to the game's frames between them (one big block froze the
// game for seconds right after it started)
const idle = () => new Promise(r => setTimeout(r, 0));
function slicer(ms) { let t = performance.now(); return async () => { if (performance.now() - t > (ms ?? BG.slice)) { await idle(); t = performance.now(); } }; } // BG.slice: what the frames leave (src/budget.js)
export async function buildCoverMap(THREE, opts) {
  const slice = slicer();
  const pad = 300, x0 = opts.bounds[0] - pad, z0 = opts.bounds[1] - pad, x1 = opts.bounds[2] + pad, z1 = opts.bounds[3] + pad;
  let mpp = opts.mpp || 4; while ((x1 - x0) / mpp > 4096 || (z1 - z0) / mpp > 4096) mpp *= 1.25;
  const W = Math.ceil((x1 - x0) / mpp), H = Math.ceil((z1 - z0) / mpp);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.setTransform(1 / mpp, 0, 0, 1 / mpp, -x0 / mpp, -z0 / mpp); return g; };
  // photo (transparent where there is none)
  const ph = mk(); ph.imageSmoothingQuality = 'high'; opts.drawAerial(ph);
  // mask: white = plants allowed
  const mk2 = mk(); mk2.fillStyle = '#fff'; mk2.fillRect(x0, z0, x1 - x0, z1 - z0); mk2.fillStyle = '#000'; mk2.strokeStyle = '#000';
  mk2.lineCap = 'round'; mk2.lineJoin = 'round';
  for (const r of opts.roads) {
    const [, t, w, p] = r; mk2.lineWidth = w + (t >= 1 && t <= 5 ? 10 : 5); // the road, its sidewalk or shoulder, and a clear strip beside it
    mk2.beginPath(); mk2.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) mk2.lineTo(p[i], p[i + 1]); mk2.stroke();
  }
  const poly = p => { mk2.beginPath(); mk2.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) mk2.lineTo(p[i], p[i + 1]); mk2.closePath(); mk2.fill(); };
  for (const b of opts.buildings) poly(b[2]);
  for (const a of opts.areas) if (a[0] === 0 || a[0] === 2) poly(a[1]); // water, parking lots
  for (const p of opts.exclude || []) poly(p);              // places with their own ground (the Poway High campus: turf, track, courts)
  const rect = (x, z, w, d, ang, grow) => { mk2.save(); mk2.translate(x, z); mk2.rotate(ang); mk2.fillRect(-w / 2 - grow, -d / 2 - grow, w + grow * 2, d + grow * 2); mk2.restore(); };
  for (const h of opts.houses) rect(h[0], h[1], h[2], h[3], h[4], 1);
  for (const p of opts.pools) rect(p[0], p[1], p[2], p[3], p[4], 1.2);
  await slice(); const A = ph.getImageData(0, 0, W, H).data; await slice(); const M = mk2.getImageData(0, 0, W, H).data; await slice();
  // land use: the yard round every house (R: 255 a lawn, 110 a dry garden, each house its own pick), parks, fields and
  // golf (G); urban density (B) and the lawn flag (A) are filled in below. The ground shader reads it (setGroundLand).
  const hsh = v => { const t = Math.sin(v * 12.9898) * 43758.5453; return t - Math.floor(t); };
  const ly = mk(); ly.fillStyle = '#000'; ly.fillRect(x0, z0, x1 - x0, z1 - z0); ly.lineJoin = 'round'; ly.lineWidth = 22;
  for (const b of opts.buildings) if (b[1] === 0 && b[0] < 8.5) {
    const p = b[2]; let cx = 0, cz = 0; for (let i = 0; i < p.length; i += 2) { cx += p[i]; cz += p[i + 1]; } cx /= p.length / 2; cz /= p.length / 2;
    ly.fillStyle = ly.strokeStyle = hsh(Math.round(cx) * 0.137 + Math.round(cz) * 0.311) < 0.6 ? 'rgb(255,0,0)' : 'rgb(110,0,0)'; // ~6 in 10 yards are lawn
    ly.beginPath(); ly.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ly.lineTo(p[i], p[i + 1]); ly.closePath(); ly.stroke(); ly.fill();
  }
  ly.globalCompositeOperation = 'lighter'; ly.fillStyle = 'rgb(0,255,0)';
  for (const a of opts.areas) if (a[0] === 1 || a[0] === 3) { const p = a[1]; ly.beginPath(); ly.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ly.lineTo(p[i], p[i + 1]); ly.closePath(); ly.fill(); }
  await slice(); const Y = ly.getImageData(0, 0, W, H).data; await slice();
  const BG = 50, bgrid = new Map();
  for (const b of opts.buildings) { const p = b[2], n = p.length / 2; let x = 0, z = 0; for (let i = 0; i < n; i++) { x += p[i * 2]; z += p[i * 2 + 1]; } const k = Math.floor(x / n / BG) * 100000 + Math.floor(z / n / BG); bgrid.set(k, (bgrid.get(k) || 0) + 1); }
  const builtAt = (x, z) => { const gx = Math.floor(x / BG), gz = Math.floor(z / BG); let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += bgrid.get((gx + a) * 100000 + gz + b) || 0; return s; };
  const land = new Uint8Array(W * H * 4);
  const out = new Uint8Array(W * H * 4);
  const lin = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hash = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0, n = W * H; i < n; i++) {
    if ((i & 8191) === 0) await slice();
    const k = i * 4; let grass, brush, dry, tall;
    const px = x0 + (i % W + 0.5) * mpp, pz = z0 + (Math.floor(i / W) + 0.5) * mpp;
    const yard = Math.min(1, Y[k] / 110), park = Y[k + 1] / 255, urban = ss(2, 9, builtAt(px, pz)), lawnLot = Y[k] > 180 ? 1 : 0;
    land[k] = Math.round(yard * 255); land[k + 1] = Y[k + 1]; land[k + 2] = Math.round(urban * 255); land[k + 3] = lawnLot * 255;
    if (A[k + 3] < 128) { // no photo: the outer hills are dry grass with chaparral patches
      const v = hash(i); grass = 0; brush = 0.45 + 0.35 * v; dry = 0.8; tall = 0.9;
    } else {
      // same thresholds as the terrain shader (src/nature/ground.js), on linear colour
      const r = lin[A[k]], g = lin[A[k + 1]], b = lin[A[k + 2]];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const green = (g - Math.max(r, b)) / (lum + 0.02), yellow = ((r + g) * 0.5 - b) / (lum + 0.02);
      const wLawn = ss(0.10, 0.20, green) * ss(0.065, 0.095, lum);
      const wLit = Math.max(1 - ss(0.03, 0.055, lum), ss(0.03, 0.12, green) * (1 - ss(0.06, 0.085, lum))) * (1 - wLawn);
      const wDry = ss(0.14, 0.24, yellow) * ss(0.05, 0.075, lum) * (1 - ss(0.14, 0.19, lum)) * (1 - ss(0.04, 0.1, green)) * (1 - wLawn) * (1 - wLit);
      const wSoil = Math.max(0, 1 - wLawn - wLit - wDry);
      const mx = Math.max(r, g, b), chroma = (mx - Math.min(r, g, b)) / (mx + 0.01);
      const paved = Math.max(ss(0.17, 0.26, lum) * (1 - ss(0.06, 0.14, yellow)), // concrete, driveways
        (1 - ss(0.10, 0.20, chroma)) * ss(0.02, 0.04, lum) * (1 - ss(0.05, 0.10, green))); // asphalt lots: grey, neither green nor gold
      grass = wLawn * (1 - paved);                                               // the photo's own green lawns
      brush = (wLit * 0.95 + wDry * 0.3 + wSoil * 0.1) * (1 - paved);
      dry = Math.min(1, wDry + wSoil * 0.85 + wLit * 0.35);
      tall = (wDry * 0.95 + wSoil * 0.4 + wLit * 0.35) * (1 - paved);
    }
    // town: yards are lawns or dry gardens, parks and fields are mown turf; wild brush and tall grass only out of town
    const tended = Math.min(1, yard + park), wild = (1 - tended) * (1 - urban * 0.85);
    grass = Math.max(grass * (1 - yard * (1 - lawnLot)), park, yard * lawnLot);
    brush = brush * wild + yard * (1 - lawnLot) * 0.1;
    tall = tall * (1 - tended) * (1 - urban * 0.6);
    const m = M[k] / 255;
    out[k] = Math.round(Math.min(1, grass) * m * 255); out[k + 1] = Math.round(Math.min(1, brush) * m * 255);
    out[k + 2] = Math.round(dry * 255); out[k + 3] = Math.round(Math.min(1, tall) * m * 255);
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.flipY = false; tex.needsUpdate = true;
  const landTex = new THREE.DataTexture(land, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  landTex.magFilter = THREE.LinearFilter; landTex.minFilter = THREE.LinearFilter; landTex.flipY = false; landTex.needsUpdate = true;
  const at = (x, z) => { const i = Math.floor((x - x0) / mpp), j = Math.floor((z - z0) / mpp); if (i < 0 || j < 0 || i >= W || j >= H) return null; return out.subarray((j * W + i) * 4, (j * W + i) * 4 + 4); };
  return { tex, landTex, x0, z0, sx: W * mpp, sz: H * mpp, at };
}

// ---------------------------------------------------------------- geometry: one grass tuft, one brush clump
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function grassTuft(THREE) { // three crossed cards; the texture holds the blades
  const P = [], N = [], U = [], I = [];
  for (let k = 0; k < 3; k++) {
    const ang = k * Math.PI / 3 + 0.2, c = Math.cos(ang), sn = Math.sin(ang), b = P.length / 3, w = 0.62;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const x = (u - 0.5) * w; P.push(c * x, v, sn * x); N.push(-sn, 0, c); U.push(u, v); }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); return g;
}
function brushClump(THREE) { // three crossed cards and a cap; the fragment shader cuts leafy clusters out of them
  const P = [], N = [], U = [], I = [];
  const card = (ang, y0, y1, w, tilt) => {
    const c = Math.cos(ang), s = Math.sin(ang), b = P.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const x = (u - 0.5) * w, y = y0 + (y1 - y0) * v, k = tilt * (v - 0.5);
      P.push(c * x - s * k, y, s * x + c * k); N.push(-s, 0.5, c); U.push(u, v);
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  // four vertical cards, no flat cap (a cap reads as a paper cut-out from the chase camera)
  card(0, -0.05, 1, 1.5, 0.25); card(Math.PI / 4, -0.05, 0.9, 1.35, -0.25); card(Math.PI / 2, -0.05, 1, 1.5, 0.25); card(3 * Math.PI / 4, -0.05, 0.9, 1.35, -0.25);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); return g;
}

// ---------------------------------------------------------------- scanned cards (assets/pbr/atlas, ambientCG CC0)
// colour + opacity pairs merged into one RGBA canvas; crop: [x, y, w, h] in the atlas
// (an ImageData kept apart from any canvas: a canvas premultiplies, which blackens the colour under transparent
// pixels, and then the mipmaps of thin blades average to black)
async function atlasImage(base, name, crop) {
  const load = async n => createImageBitmap(await (await fetch(base + n)).blob());
  const [c, a] = await Promise.all([load(name + '_c.png'), load(name + '_a.png')]);
  const [cx, cy, W, H] = crop || [0, 0, c.width, c.height];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(c, -cx, -cy); const cd = g.getImageData(0, 0, W, H); g.clearRect(0, 0, W, H); g.drawImage(a, -cx, -cy); const ad = g.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i++) cd.data[i * 4 + 3] = ad[i * 4];
  return cd;
}
function imageCanvas(im) { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').putImageData(im, 0, 0); return c; }
// RGBA texture, rows flipped so v runs up the card; transparent texels take the mean opaque colour so the mips stay true
function cardTex(THREE, im) {
  const W = im.width, H = im.height, d = im.data, out = new Uint8Array(W * H * 4); let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 128) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; n++; }
  if (n) { r /= n; g /= n; b /= n; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (y * W + x) * 4, o = ((H - 1 - y) * W + x) * 4, a = d[s + 3];
    if (a < 24) { out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a; } else { out[o] = d[s]; out[o + 1] = d[s + 1]; out[o + 2] = d[s + 2]; out[o + 3] = a; }
  }
  const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
// the leaves on a leaf sheet: bounding boxes of the opaque blobs
function blobs(cv) {
  const N = 96, t = document.createElement('canvas'); t.width = t.height = N; const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data, seen = new Uint8Array(N * N), out = [];
  for (let s = 0; s < N * N; s++) {
    if (seen[s] || d[s * 4 + 3] < 128) continue;
    let x0 = N, y0 = N, x1 = 0, y1 = 0, cnt = 0; const st = [s]; seen[s] = 1;
    while (st.length) { const q = st.pop(), x = q % N, y = (q / N) | 0; cnt++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const k = ny * N + nx; if (!seen[k] && d[k * 4 + 3] >= 128) { seen[k] = 1; st.push(k); } } }
    if (cnt > 6) out.push([x0 / N * cv.width, y0 / N * cv.height, (x1 - x0 + 1) / N * cv.width, (y1 - y0 + 1) / N * cv.height]);
  }
  return out;
}
// a shrub card: scanned leaves stamped round a crown, darker inside, with a few twigs
function leafCard(sheet, r) {
  const L = blobs(sheet), c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d', { willReadFrequently: true });
  g.strokeStyle = 'rgba(70,55,40,1)'; g.lineWidth = 3; for (let i = 0; i < 9; i++) { const x = 100 + r() * 56; g.beginPath(); g.moveTo(128 + (x - 128) * 0.25, 256); g.quadraticCurveTo(x, 200, 64 + r() * 128, 60 + r() * 120); g.stroke(); }
  // the sheet at eight brightnesses, each filtered once (a filter per leaf took seconds and froze the game)
  const B0 = 0.47, B1 = 1.27, tones = Array.from({ length: 8 }, (_, k) => { const c2 = document.createElement('canvas'); c2.width = Math.ceil(sheet.width / 2); c2.height = Math.ceil(sheet.height / 2);
    const g2 = c2.getContext('2d'); g2.filter = `brightness(${B0 + (B1 - B0) * k / 7})`; g2.drawImage(sheet, 0, 0, c2.width, c2.height); return c2; });
  for (let i = 0; i < 420 && L.length; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()), x = 128 + Math.cos(a) * d * 108, y = 128 + Math.sin(a) * d * 100 - (1 - d) * 12; if (y > 236) continue;
    const b = L[Math.floor(r() * L.length)], s = (26 + r() * 22) / Math.max(b[2], b[3]);
    const br = (0.55 + 0.5 * d) * (0.85 + r() * 0.3), tk = tones[Math.max(0, Math.min(7, Math.round((br - B0) / (B1 - B0) * 7)))];
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI * 2); g.globalAlpha = 1;
    g.drawImage(tk, b[0] / 2, b[1] / 2, b[2] / 2, b[3] / 2, -b[2] * s / 2, -b[3] * s / 2, b[2] * s, b[3] * s); g.restore();
  }
  return g.getImageData(0, 0, 256, 256);
}
export async function loadCards(THREE, base = 'assets/pbr/atlas/', scanned = {}) { // scanned.tall: a scanned grass clump card (src/nature/phplants.js grassCard)
  const lum = im => { const d = im.data; let s = 0, n = 0; const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; for (let i = 0; i < d.length; i += 4 * 7) if (d[i + 3] > 128) { s += 0.299 * lin(d[i]) + 0.587 * lin(d[i + 1]) + 0.114 * lin(d[i + 2]); n++; } return n ? s / n : 0.2; };
  const [lawn, oats, sheet] = await Promise.all([atlasImage(base, 'foliage001'), atlasImage(base, 'foliage004'), atlasImage(base, 'leafset013')]);
  const oatsTop = new ImageData(new Uint8ClampedArray(oats.data.buffer.slice(0, oats.width * (oats.height >> 1) * 4)), oats.width, oats.height >> 1); // the top row of seed heads
  // wild grass: a clump of blades with oat heads standing out of it (the oats alone read as bare sticks)
  const tall = (() => { const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
    const bl = imageCanvas(lawn), oc = imageCanvas(oatsTop); g.filter = 'saturate(0.55) sepia(0.35) brightness(0.95)'; g.drawImage(bl, 0, H * 0.18, W, H * 0.82); g.drawImage(bl, W * 0.12, H * 0.3, W * 0.8, H * 0.7); g.filter = 'none'; g.drawImage(oc, 0, 0, W, H);
    return g.getImageData(0, 0, W, H); })();
  const brush = leafCard(imageCanvas(sheet), rng(23)), tall2 = scanned.tall || tall;
  return { lawn: cardTex(THREE, lawn), oats: cardTex(THREE, tall2), brush: cardTex(THREE, brush), lum: [lum(lawn), lum(brush), lum(tall2)] };
}

// ---------------------------------------------------------------- card textures, drawn once (no downloads)
// RGB is a grey around 1 the shader tints (per-blade variation, warmer tips); A is the cut-out
function cardTexture(THREE, draw) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); draw(g, rng(11));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.premultiplyAlpha = false; return t;
}
function grassBlades(g, r) {
  for (let i = 0; i < 46; i++) { // tapered, curved blades, longest in the middle of the clump
    const x0 = 128 + (r() - 0.5) * 190, len = (0.45 + 0.55 * r()) * 250 * (1 - Math.abs(x0 - 128) / 260), lean = (r() - 0.5) * 70 + (x0 - 128) * 0.35, w = 3 + r() * 4;
    const tone = 0.78 + r() * 0.35, warm = r() * 0.12;
    const grd = g.createLinearGradient(0, 256, 0, 256 - len);
    grd.addColorStop(0, `rgba(${Math.round(150 * tone)},${Math.round(165 * tone)},${Math.round(140 * tone)},1)`);
    grd.addColorStop(1, `rgba(${Math.round((215 + warm * 300) * tone)},${Math.round(225 * tone)},${Math.round((170 - warm * 200) * tone)},1)`);
    g.fillStyle = grd; g.beginPath(); g.moveTo(x0 - w, 256); g.quadraticCurveTo(x0 + lean * 0.3 - w * 0.6, 256 - len * 0.55, x0 + lean, 256 - len);
    g.quadraticCurveTo(x0 + lean * 0.3 + w * 0.6, 256 - len * 0.55, x0 + w, 256); g.closePath(); g.fill();
  }
}
function brushLeaves(g, r) {
  for (let i = 0; i < 520; i++) { // small leaves in a rounded crown, denser and darker inside, lighter at the rim
    const a = r() * Math.PI * 2, d = Math.sqrt(r()), x = 128 + Math.cos(a) * d * 112, y = 132 + Math.sin(a) * d * 104 - (1 - d) * 10;
    if (y > 250) continue;
    const tone = (0.62 + 0.45 * d) * (0.8 + r() * 0.4), s = 5 + r() * 7;
    g.fillStyle = `rgba(${Math.round(185 * tone)},${Math.round(200 * tone)},${Math.round(165 * tone)},1)`;
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI); g.beginPath(); g.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  g.strokeStyle = 'rgba(95,80,60,1)'; g.lineWidth = 3; // a few stems showing at the bottom
  for (let i = 0; i < 7; i++) { const x = 100 + r() * 56; g.beginPath(); g.moveTo(128 + (x - 128) * 0.3, 256); g.lineTo(x, 200 - r() * 30); g.stroke(); }
}

// ---------------------------------------------------------------- shader patch
const IGN = 'fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))';
const VS_HEAD = /* glsl */`
attribute vec2 iCell;
uniform vec2 uBase; uniform float uS, uR, uKind, uTime, uWind, uGust;
uniform sampler2D uCover; uniform vec4 uCov;
uniform highp sampler2D uHgt; uniform vec4 uHg; // x0, z0, metres per texel, texels
uniform vec4 uPush[3];
varying vec3 vGC; varying float vFade; varying vec2 vLeaf; varying float vSeed;
float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hgtAt(vec2 xz) {
  vec2 t = (xz - uHg.xy) / uHg.z; vec2 i = floor(t), f = t - i; int n = int(uHg.w) - 1;
  ivec2 a = clamp(ivec2(i), ivec2(0), ivec2(n)), b = clamp(ivec2(i) + 1, ivec2(0), ivec2(n));
  float h00 = texelFetch(uHgt, ivec2(a.x, a.y), 0).r, h10 = texelFetch(uHgt, ivec2(b.x, a.y), 0).r;
  float h01 = texelFetch(uHgt, ivec2(a.x, b.y), 0).r, h11 = texelFetch(uHgt, ivec2(b.x, b.y), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}
`;
const VS_BODY = /* glsl */`
  vec2 cell = uBase + iCell;
  float h1 = gh(cell), h2 = gh(cell + 17.31), h3 = gh(cell + 41.77), h4 = gh(cell + 73.13);
  vec2 wp = (cell + vec2(h1, h2)) * uS;
  float dist = distance(wp, cameraPosition.xz);
  vec2 cuv = (wp - uCov.xy) / uCov.zw, cm = 300.0 / uCov.zw; // the cover map's 300 m pad: no data out there (the outer world)
  vec4 cv = texture2D(uCover, cuv);
  float dens = uKind < 0.5 ? min(1.0, cv.r * 1.8) : uKind < 1.5 ? min(1.0, cv.g * 1.3) : min(1.0, cv.a * 1.7 + cv.b * 0.55 * (1.0 - cv.r) * step(0.02, cv.g + cv.a + cv.b)); // 0 lawn, 1 brush, 2 wild grass (sparser dry grass on the dry ground too)
  dens *= step(cm.x, cuv.x) * step(cuv.x, 1.0 - cm.x) * step(cm.y, cuv.y) * step(cuv.y, 1.0 - cm.y);
  // thin out with distance so the far ring is cheaper to look at, then fade out at the edge
  float thin = uKind < 0.5 || uKind > 1.5 ? mix(1.0, 0.35, smoothstep(uR * 0.3, uR, dist)) : 1.0;
  vFade = 1.0 - smoothstep(uR * 0.6, uR, dist);
  float keep = step(h3, dens * thin) * step(0.001, vFade) * (1.0 - poolHole(wp, 1.6)); // nothing grows in a pool or on its deck
  float ang = h1 * 6.2831853, cs = cos(ang), sn = sin(ang);
  vec3 p = position;
  float sc;
  // the edge of the ring: clumps sink into the ground instead of dithering away
  float sink = smoothstep(0.0, 1.0, vFade);
  if (uKind < 0.5) { sc = (0.07 + 0.07 * h4) * sink; p.xz *= 0.42 * (0.8 + 0.4 * h2); p.y *= sc; }                     // mown lawn
  else if (uKind > 1.5) { sc = (0.35 + 0.6 * h4) * mix(0.6, 1.0, dens) * sink; p.xz *= 0.55 * (0.8 + 0.4 * h2); p.y *= sc; } // wild oats and brome
  else { sc = (0.55 + 0.9 * h4) * (0.6 + 0.5 * dens) * sink; p *= sc; }
  p = vec3(cs * p.x + sn * p.z, p.y, -sn * p.x + cs * p.z);
  // wind: gusts roll across the field as waves (a travelling noise), the blades bend with height
  float hy = max(p.y, 0.0), ph = dot(wp, vec2(0.21, 0.17));
  float wave = 0.5 + 0.5 * sin(dot(wp, vec2(0.13, 0.07)) - uTime * 1.7 + 2.0 * gh(floor(wp * 0.05)));
  float sw = uWind * (uKind < 0.5 ? 0.25 : uKind > 1.5 ? 0.22 : 0.04) * hy * (uKind > 1.5 ? 1.0 : hy) * (0.6 + uGust * wave);
  p.x += (sin(uTime * 1.9 + ph) * 0.4 + wave * uGust) * sw; p.z += (cos(uTime * 1.5 + ph * 1.3) * 0.4 + wave * uGust * 0.6) * sw;
  // pushed aside by the player and cars
  for (int k = 0; k < 3; k++) {
    vec2 d = wp + p.xz - uPush[k].xy; float l = length(d);
    if (uPush[k].z > 0.0 && l < uPush[k].z) { float w = 1.0 - l / uPush[k].z; p.xz += d / max(l, 0.05) * w * hy * 1.4; p.y *= 1.0 - w * 0.6; }
  }
  if (keep < 0.5) p = vec3(0.0, -1e4, 0.0);
  vec3 transformed = vec3(wp.x + p.x, hgtAt(wp) - 0.04 + p.y, wp.y + p.z);
  // colour: lawn green to golden dry grass; brush from dark chaparral to grey-green sage
  float t = clamp(position.y, 0.0, 1.0);
  if (uKind < 0.5) { // irrigated lawn: green, a little patchy
    vec3 lawn = vec3(0.075, 0.145, 0.032), tired = vec3(0.13, 0.14, 0.055); // as light as the turf under it: blades, not dark tufts
    vGC = mix(lawn, tired, smoothstep(0.5, 0.9, gh(floor(wp * 0.25))) * 0.5) * (0.85 + 0.3 * h3);
  } else if (uKind > 1.5) { // wild grass: green in spring, gold through summer and fall
    vec3 gold = vec3(0.36, 0.27, 0.12), straw = vec3(0.45, 0.38, 0.22), olive = vec3(0.13, 0.14, 0.05);
    vec3 c = mix(olive, mix(gold, straw, h2), smoothstep(0.25, 0.7, cv.b + (h2 - 0.5) * 0.3));
    vGC = c * (0.8 + 0.35 * h3);
  } else { // chaparral and sage: dark olive to grey-green, dry brown in places
    vec3 chap = vec3(0.075, 0.09, 0.045), sage = vec3(0.17, 0.18, 0.125), dryb = vec3(0.21, 0.17, 0.09);
    vec3 c = mix(chap, sage, h2 * 0.8); c = mix(c, dryb, smoothstep(0.75, 1.0, cv.b) * h4 * 0.6);
    vGC = c * (0.85 + 0.3 * h3);
  }
  vLeaf = uv; vSeed = h4;
`;
function patch(mat, U, kind) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, HOLE_U); sh.uniforms.uKind = { value: kind };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + HOLE_GLSL + VS_HEAD)
      .replace('#include <beginnormal_vertex>', kind !== 1
        ? 'vec3 objectNormal = normalize(vec3(0.0, 1.0, 0.0) + 0.18 * normal);' // lit like the ground it grows from
        : 'vec3 objectNormal = normalize(vec3(position.x, position.y - 0.35, position.z) + vec3(0.0, 0.4, 0.0));')
      .replace('#include <begin_vertex>', VS_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize(vNormal); // both faces of a card take the light the way the ground does (a flipped back face faced the dirt and went black)`)
      .replace('#include <common>', `#include <common>\nvarying vec3 vGC; varying float vFade; varying vec2 vLeaf; varying float vSeed; uniform sampler2D uCard; uniform float uCardLum;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        vec4 card = texture2D(uCard, vLeaf);
        { // an alpha cut that keeps its coverage as the texture's mips blur the thin blades (and stays sharp up close)
          vec2 dx = dFdx(vLeaf * 256.0), dy = dFdy(vLeaf * 256.0);
          float mip = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
          if (card.a * (1.0 + mip * 0.3) < 0.5) discard;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= vGC * (uCardLum > 0.0 ? vec3(dot(card.rgb, vec3(0.299, 0.587, 0.114)) / uCardLum) : card.rgb * 2.0) * mix(${kind === 0 ? '0.86, 1.08' : kind > 0.5 && kind < 1.5 ? '0.6, 1.1' : '0.55, 1.12'}, smoothstep(0.0, 0.8, vLeaf.y)); // the scan's light and shade, darker at the root (a mown lawn hardly: its roots are in the thatch)`);
  };
  mat.customProgramCacheKey = () => 'groundcover3' + kind;
}

// ---------------------------------------------------------------- the layers
export class GroundCover {
  // cover: buildCoverMap(); terrainAt(x, z) height of the rendered ground; U: shared nature uniforms (uTime, uWind)
  constructor(THREE, scene, cover, terrainAt, U, opts = {}) {
    this.THREE = THREE; this.cover = cover; this.terrainAt = terrainAt; this.U = U;
    const q = opts.quality ?? 1, C = opts.cards;
    this.layers = [
      { kind: 0, s: 0.26 / Math.sqrt(q), R: 30, geo: grassTuft(THREE) },  // mown lawn, dense and short
      { kind: 1, s: 3.2 / Math.sqrt(q), R: 200, geo: brushClump(THREE) }, // shrubs
      { kind: 2, s: 0.5 / Math.sqrt(q), R: 90, geo: grassTuft(THREE) },   // tall wild grass: thick enough that the dirt only shows through
    ];
    // height texture around the camera
    this.HN = 192; this.HM = 2.6; // texels, metres per texel (~500 m square)
    this.hData = new Float32Array(this.HN * this.HN);
    this.hTex = new THREE.DataTexture(this.hData, this.HN, this.HN, THREE.RedFormat, THREE.FloatType);
    this.hTex.magFilter = this.hTex.minFilter = THREE.NearestFilter; this.hTex.needsUpdate = true;
    this.hCenter = { x: 1e9, z: 1e9 };
    this.shared = {
      uCover: { value: cover.tex }, uCov: { value: new THREE.Vector4(cover.x0, cover.z0, cover.sx, cover.sz) },
      uHgt: { value: this.hTex }, uHg: { value: new THREE.Vector4(0, 0, this.HM, this.HN) },
      uTime: U.uTime, uWind: U.uWind, uGust: U.uGust || { value: 0.6 },
      uPush: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    };
    const cards = C ? [C.lawn, C.brush, C.oats] : [cardTexture(THREE, grassBlades), cardTexture(THREE, brushLeaves), cardTexture(THREE, grassBlades)];
    for (const L of this.layers) {
      const N = Math.ceil(2 * L.R / L.s), cells = new Float32Array(N * N * 2);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { cells[(j * N + i) * 2] = i - N / 2; cells[(j * N + i) * 2 + 1] = j - N / 2; }
      L.geo.setAttribute('iCell', new THREE.InstancedBufferAttribute(cells, 2)); L.geo.instanceCount = N * N;
      const U2 = Object.assign({}, this.shared, { uBase: { value: new THREE.Vector2() }, uS: { value: L.s }, uR: { value: L.R }, uCard: { value: cards[L.kind] }, uCardLum: { value: C ? C.lum[L.kind] : 0 } });
      L.U = U2;
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      patch(mat, U2, L.kind);
      const mesh = new THREE.Mesh(L.geo, mat); mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
      mesh.name = ['groundcover:lawn', 'groundcover:brush', 'groundcover:tall'][L.kind]; scene.add(mesh); L.mesh = mesh;
    }
    this.instances = this.layers.reduce((n, L) => n + L.geo.instanceCount, 0);
  }
  refreshHeights(cx, cz) {
    const N = this.HN, M = this.HM, x0 = cx - N * M / 2, z0 = cz - N * M / 2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) this.hData[j * N + i] = this.terrainAt(x0 + i * M, z0 + j * M);
    this.hTex.needsUpdate = true; this.shared.uHg.value.set(x0, z0, M, N); this.hCenter.x = cx; this.hCenter.z = cz; this.hJob = null;
  }
  // the same, a few rows a frame into a second buffer, swapped in when it's done (the whole grid in one frame, every
  // 40 m you moved, hitched the drive)
  stepHeights(cx, cz, ms) {
    const N = this.HN, M = this.HM;
    let J = this.hJob; if (!J || J.cx !== cx || J.cz !== cz) J = this.hJob = { cx, cz, x0: cx - N * M / 2, z0: cz - N * M / 2, j: 0, buf: (this.hJob && this.hJob.buf) || new Float32Array(N * N) };
    const t0 = performance.now();
    while (J.j < N && performance.now() - t0 < ms) { const j = J.j++; for (let i = 0; i < N; i++) J.buf[j * N + i] = this.terrainAt(J.x0 + i * M, J.z0 + j * M); }
    if (J.j < N) return;
    this.hData.set(J.buf); this.hTex.needsUpdate = true; this.shared.uHg.value.set(J.x0, J.z0, M, N); this.hCenter.x = cx; this.hCenter.z = cz; this.hJob = null;
  }
  // push: up to three [x, z, radius] (player, the car you're in, ...)
  update(camera, pushes = []) {
    const p = camera.position, d = Math.hypot(p.x - this.hCenter.x, p.z - this.hCenter.z);
    if (d > 150) this.refreshHeights(Math.round(p.x / this.HM) * this.HM, Math.round(p.z / this.HM) * this.HM); // a jump (teleport, fast travel): now
    else if (d > 30 || this.hJob) { const J = this.hJob, c = J && Math.hypot(p.x - J.cx, p.z - J.cz) < 60 ? J : { cx: Math.round(p.x / this.HM) * this.HM, cz: Math.round(p.z / this.HM) * this.HM }; this.stepHeights(c.cx, c.cz, 1.5); }
    for (const L of this.layers) L.U.uBase.value.set(Math.floor(p.x / L.s), Math.floor(p.z / L.s));
    for (let k = 0; k < 3; k++) { const q = pushes[k]; this.shared.uPush.value[k].set(q ? q[0] : 0, q ? q[1] : 0, q ? q[2] : 0, 0); }
  }
  setVisible(on) { for (const L of this.layers) L.mesh.visible = on; }
}

// ---------------------------------------------------------------- far shrubs (impostors), map-wide
// Scatters shrubs on a jittered grid wherever the cover map says brush. veg: Vegetation; species: a shrub-like
// species that exists in the asset manifest. Returns the count.
// stands and openings: chaparral grows in thick patches with bare or grassy gaps, not evenly spaced
function vnoise(x, z) { const h = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); }; const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - w) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * w; }
export function clump(x, z) { const n = vnoise(x / 38, z / 38) * 0.6 + vnoise(x / 13 + 7, z / 13 + 3) * 0.4; return Math.min(1, Math.max(0, (n - 0.32) / 0.3)); }
export async function scatterShrubs(cover, veg, heightAt, species, bounds, opts = {}) {
  const slice = slicer(); let it = 0;
  const lib = veg.lib.species.get(species); if (!lib) return 0;
  const step = opts.step ?? 13, cap = opts.cap ?? 220000; const r = rng(opts.seed ?? 4242); let n = 0; // seed: one per tile when planting a tile at a time
  const V = lib.variants[0], baseH = Math.max(0.3, V.height);
  for (let z = bounds[1]; z < bounds[3] && n < cap; z += step) for (let x = bounds[0]; x < bounds[2] && n < cap; x += step) {
    if ((++it & 1023) === 0) await slice();
    const px = x + r() * step, pz = z + r() * step, c = cover.at(px, pz); if (!c) continue;
    const b = c[1] / 255, k = clump(px, pz); if (b < 0.25 || r() > b * 0.55 * (0.25 + 1.1 * k)) continue;
    if (opts.reject && opts.reject(px, pz)) continue;
    const hgt = (0.7 + r() * 1.4 + b * 0.8) * (0.7 + 0.6 * k), s = hgt / baseH, br = 0.55 + r() * 0.25, dry = c[2] / 255; // bigger and closer in a stand
    const tint = [0.8 * br * (1 + dry * 0.25), 0.86 * br, 0.66 * br * (1 - dry * 0.15)]; // dark olive from afar, not black
    veg.add(species, px, heightAt(px, pz) - 0.15 * s, pz, r() * Math.PI * 2, s, Math.floor(r() * lib.variants.length), tint);
    n++;
  }
  return n;
}
// a general scatter over the cover map: want(c) gives the chance at a spot (c: the cover texel RGBA), size [min, max]
// in metres of height (or of width with byWidth), sink: how far into the ground (fraction of height)
export async function scatterOnCover(cover, veg, heightAt, species, bounds, o = {}) {
  const slice = slicer(); let it = 0;
  const lib = veg.lib.species.get(species); if (!lib) return 0;
  const step = o.step ?? 10, cap = o.cap ?? 50000, r = rng(o.seed ?? 99), size = o.size || [0.6, 1.2]; let n = 0;
  for (let z = bounds[1]; z < bounds[3] && n < cap; z += step) for (let x = bounds[0]; x < bounds[2] && n < cap; x += step) {
    if ((++it & 1023) === 0) await slice();
    const px = x + r() * step, pz = z + r() * step, c = cover.at(px, pz); if (!c) continue;
    const kc = o.clumped ? clump(px + 91, pz - 37) : 1; if (r() > o.want(c, px, pz) * (o.clumped ? 0.2 + 1.2 * kc : 1)) continue;
    if (o.reject && o.reject(px, pz)) continue;
    const vi = Math.floor(r() * lib.variants.length), V = lib.variants[vi], d = (size[0] + r() * (size[1] - size[0])) * (o.clumped ? 0.65 + 0.7 * kc : 1);
    const s = d / Math.max(0.05, o.byWidth ? V.width : V.height), br = (o.bright ?? 0.85) + r() * 0.25, dry = c[2] / 255;
    const tint = o.tint ? o.tint(br, dry) : [br, br, br];
    veg.add(species, px, heightAt(px, pz) - (o.sink ?? 0.1) * V.height * s, pz, r() * Math.PI * 2, s, vi, tint);
    n++;
  }
  return n;
}
