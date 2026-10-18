// Grass and brush over the whole map, so the ground reads as covered rather than as a stretched aerial photo.
//
// Two pieces:
//  - A cover map (one texel per 4 m over the play area) built at load from the aerial photo: the same colour
//    classes the terrain shader uses (lawn, dry grass, chaparral/leaf litter, bare soil, paving), with roads,
//    buildings, houses, pools and water masked out. R = grass density, G = brush density, B = dryness (green lawn
//    to golden hillside), A = grass height.
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

// ---------------------------------------------------------------- the cover map
// opts: { bounds: [x0, z0, x1, z1], drawAerial(ctx), roads, buildings, houses, pools, areas, mpp }
export function buildCoverMap(THREE, opts) {
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
  for (const a of opts.areas) if (a[0] === 0) poly(a[1]); // water
  for (const p of opts.exclude || []) poly(p);              // places with their own ground (the Poway High campus: turf, track, courts)
  const rect = (x, z, w, d, ang, grow) => { mk2.save(); mk2.translate(x, z); mk2.rotate(ang); mk2.fillRect(-w / 2 - grow, -d / 2 - grow, w + grow * 2, d + grow * 2); mk2.restore(); };
  for (const h of opts.houses) rect(h[0], h[1], h[2], h[3], h[4], 1);
  for (const p of opts.pools) rect(p[0], p[1], p[2], p[3], p[4], 1.2);
  const A = ph.getImageData(0, 0, W, H).data, M = mk2.getImageData(0, 0, W, H).data;
  const out = new Uint8Array(W * H * 4);
  const lin = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hash = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0, n = W * H; i < n; i++) {
    const k = i * 4; let grass, brush, dry, tall;
    if (A[k + 3] < 128) { // no photo: the outer hills are dry grass with chaparral patches
      const v = hash(i); grass = 0.85; brush = 0.45 + 0.35 * v; dry = 0.8; tall = 1;
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
      grass = (wLawn + wDry + wLit * 0.6 + wSoil * 0.35) * (1 - paved);
      brush = (wLit * 0.95 + wDry * 0.35 + wSoil * 0.12) * (1 - paved);
      dry = Math.min(1, wDry + wSoil * 0.85 + wLit * 0.35);
      tall = Math.min(1, wDry + wLit * 0.7 + wSoil * 0.5);
    }
    const m = M[k] / 255;
    out[k] = Math.round(Math.min(1, grass) * m * 255); out[k + 1] = Math.round(Math.min(1, brush) * m * 255);
    out[k + 2] = Math.round(dry * 255); out[k + 3] = Math.round(tall * 255);
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.flipY = false; tex.needsUpdate = true;
  const at = (x, z) => { const i = Math.floor((x - x0) / mpp), j = Math.floor((z - z0) / mpp); if (i < 0 || j < 0 || i >= W || j >= H) return null; return out.subarray((j * W + i) * 4, (j * W + i) * 4 + 4); };
  return { tex, x0, z0, sx: W * mpp, sz: H * mpp, at };
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
uniform vec2 uBase; uniform float uS, uR, uKind, uTime, uWind;
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
  float dens = uKind < 0.5 ? min(1.0, cv.r * 1.6) : min(1.0, cv.g * 1.3); // generous: the point is to hide the ground
  dens *= step(cm.x, cuv.x) * step(cuv.x, 1.0 - cm.x) * step(cm.y, cuv.y) * step(cuv.y, 1.0 - cm.y);
  // thin out with distance so the far ring is cheaper to look at, then fade out at the edge
  float thin = uKind < 0.5 ? mix(1.0, 0.35, smoothstep(uR * 0.3, uR, dist)) : 1.0;
  vFade = 1.0 - smoothstep(uR * 0.6, uR, dist);
  float keep = step(h3, dens * thin) * step(0.001, vFade);
  float ang = h1 * 6.2831853, cs = cos(ang), sn = sin(ang);
  vec3 p = position;
  float sc;
  // the edge of the ring: clumps sink into the ground instead of dithering away
  float sink = smoothstep(0.0, 1.0, vFade);
  if (uKind < 0.5) { sc = mix(0.16, 0.62, cv.a) * (0.7 + 0.6 * h4) * mix(0.75, 1.0, dens) * sink; p.xz *= (0.75 + 0.5 * cv.a) * (0.8 + 0.4 * h2); p.y *= sc; }
  else { sc = (0.55 + 0.9 * h4) * (0.6 + 0.5 * dens) * sink; p *= sc; }
  p = vec3(cs * p.x + sn * p.z, p.y, -sn * p.x + cs * p.z);
  // wind: grows with height above the ground
  float hy = max(p.y, 0.0), ph = dot(wp, vec2(0.21, 0.17));
  float sw = uWind * (uKind < 0.5 ? 0.18 : 0.04) * hy * hy;
  p.x += sin(uTime * 1.9 + ph) * sw; p.z += cos(uTime * 1.5 + ph * 1.3) * sw * 0.7;
  // pushed aside by the player and cars
  for (int k = 0; k < 3; k++) {
    vec2 d = wp + p.xz - uPush[k].xy; float l = length(d);
    if (uPush[k].z > 0.0 && l < uPush[k].z) { float w = 1.0 - l / uPush[k].z; p.xz += d / max(l, 0.05) * w * hy * 1.4; p.y *= 1.0 - w * 0.6; }
  }
  if (keep < 0.5) p = vec3(0.0, -1e4, 0.0);
  vec3 transformed = vec3(wp.x + p.x, hgtAt(wp) - 0.04 + p.y, wp.y + p.z);
  // colour: lawn green to golden dry grass; brush from dark chaparral to grey-green sage
  float t = clamp(position.y, 0.0, 1.0);
  if (uKind < 0.5) {
    vec3 lawn = vec3(0.045, 0.10, 0.018), gold = vec3(0.28, 0.20, 0.075), olive = vec3(0.10, 0.10, 0.04);
    vec3 c = mix(mix(lawn, olive, smoothstep(0.2, 0.6, cv.b)), gold, smoothstep(0.5, 0.95, cv.b + (h2 - 0.5) * 0.3));
    vGC = c * (0.85 + 0.3 * h3);
  } else {
    vec3 chap = vec3(0.065, 0.08, 0.04), sage = vec3(0.16, 0.17, 0.115), dryb = vec3(0.2, 0.16, 0.085);
    vec3 c = mix(chap, sage, h2 * 0.8); c = mix(c, dryb, smoothstep(0.75, 1.0, cv.b) * h4 * 0.6);
    vGC = c * (0.85 + 0.3 * h3);
  }
  vLeaf = uv; vSeed = h4;
`;
function patch(mat, U, kind) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U); sh.uniforms.uKind = { value: kind };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VS_HEAD)
      .replace('#include <beginnormal_vertex>', kind < 0.5
        ? 'vec3 objectNormal = normalize(vec3(0.0, 1.0, 0.0) + 0.18 * normal);' // lit like the ground it grows from
        : 'vec3 objectNormal = normalize(vec3(position.x, position.y - 0.35, position.z) + vec3(0.0, 0.4, 0.0));')
      .replace('#include <begin_vertex>', VS_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGC; varying float vFade; varying vec2 vLeaf; varying float vSeed; uniform sampler2D uCard;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        vec4 card = texture2D(uCard, vLeaf);
        { // an alpha cut that keeps its coverage as the texture's mips blur the thin blades (and stays sharp up close)
          vec2 dx = dFdx(vLeaf * 256.0), dy = dFdy(vLeaf * 256.0);
          float mip = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
          if (card.a * (1.0 + mip * 0.3) < 0.5) discard;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= vGC * card.rgb * 2.0 * mix(${kind > 0.5 ? '0.6, 1.1' : '0.5, 1.15'}, smoothstep(0.0, 0.8, vLeaf.y)); // darker at the root`);
  };
  mat.customProgramCacheKey = () => 'groundcover' + kind;
}

// ---------------------------------------------------------------- the layers
export class GroundCover {
  // cover: buildCoverMap(); terrainAt(x, z) height of the rendered ground; U: shared nature uniforms (uTime, uWind)
  constructor(THREE, scene, cover, terrainAt, U, opts = {}) {
    this.THREE = THREE; this.cover = cover; this.terrainAt = terrainAt; this.U = U;
    const q = opts.quality ?? 1;
    this.layers = [
      { kind: 0, s: 0.55 / Math.sqrt(q), R: 50, geo: grassTuft(THREE) },
      { kind: 1, s: 3.2 / Math.sqrt(q), R: 200, geo: brushClump(THREE) },
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
      uTime: U.uTime, uWind: U.uWind,
      uPush: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    };
    const cards = [cardTexture(THREE, grassBlades), cardTexture(THREE, brushLeaves)];
    for (const L of this.layers) {
      const N = Math.ceil(2 * L.R / L.s), cells = new Float32Array(N * N * 2);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { cells[(j * N + i) * 2] = i - N / 2; cells[(j * N + i) * 2 + 1] = j - N / 2; }
      L.geo.setAttribute('iCell', new THREE.InstancedBufferAttribute(cells, 2)); L.geo.instanceCount = N * N;
      const U2 = Object.assign({}, this.shared, { uBase: { value: new THREE.Vector2() }, uS: { value: L.s }, uR: { value: L.R }, uCard: { value: cards[L.kind] } });
      L.U = U2;
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      patch(mat, U2, L.kind);
      const mesh = new THREE.Mesh(L.geo, mat); mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
      mesh.name = L.kind ? 'groundcover:brush' : 'groundcover:grass'; scene.add(mesh); L.mesh = mesh;
    }
    this.instances = this.layers.reduce((n, L) => n + L.geo.instanceCount, 0);
  }
  refreshHeights(cx, cz) {
    const N = this.HN, M = this.HM, x0 = cx - N * M / 2, z0 = cz - N * M / 2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) this.hData[j * N + i] = this.terrainAt(x0 + i * M, z0 + j * M);
    this.hTex.needsUpdate = true; this.shared.uHg.value.set(x0, z0, M, N); this.hCenter.x = cx; this.hCenter.z = cz;
  }
  // push: up to three [x, z, radius] (player, the car you're in, ...)
  update(camera, pushes = []) {
    const p = camera.position;
    if (Math.hypot(p.x - this.hCenter.x, p.z - this.hCenter.z) > 40) this.refreshHeights(Math.round(p.x / this.HM) * this.HM, Math.round(p.z / this.HM) * this.HM);
    for (const L of this.layers) L.U.uBase.value.set(Math.floor(p.x / L.s), Math.floor(p.z / L.s));
    for (let k = 0; k < 3; k++) { const q = pushes[k]; this.shared.uPush.value[k].set(q ? q[0] : 0, q ? q[1] : 0, q ? q[2] : 0, 0); }
  }
  setVisible(on) { for (const L of this.layers) L.mesh.visible = on; }
}

// ---------------------------------------------------------------- far shrubs (impostors), map-wide
// Scatters shrubs on a jittered grid wherever the cover map says brush. veg: Vegetation; species: a shrub-like
// species that exists in the asset manifest. Returns the count.
export function scatterShrubs(cover, veg, heightAt, species, bounds, opts = {}) {
  const lib = veg.lib.species.get(species); if (!lib) return 0;
  const step = opts.step ?? 13, cap = opts.cap ?? 220000; const r = rng(4242); let n = 0;
  const V = lib.variants[0], baseH = Math.max(0.3, V.height);
  for (let z = bounds[1]; z < bounds[3] && n < cap; z += step) for (let x = bounds[0]; x < bounds[2] && n < cap; x += step) {
    const px = x + r() * step, pz = z + r() * step, c = cover.at(px, pz); if (!c) continue;
    const b = c[1] / 255; if (b < 0.25 || r() > b * 0.55) continue;
    if (opts.reject && opts.reject(px, pz)) continue;
    const hgt = 0.9 + r() * 1.6 + b * 0.8, s = hgt / baseH, br = 0.55 + r() * 0.25, dry = c[2] / 255;
    const tint = [0.62 * br * (1 + dry * 0.25), 0.68 * br, 0.52 * br * (1 - dry * 0.15)];
    veg.add(species, px, heightAt(px, pz) - 0.15 * s, pz, r() * Math.PI * 2, s, Math.floor(r() * lib.variants.length), tint);
    n++;
  }
  return n;
}
