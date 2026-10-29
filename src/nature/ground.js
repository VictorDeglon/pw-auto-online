// Natural ground surface for the terrain meshes.
//
// The aerial photo (NAIP, ~2.4 m/texel) is the truth for what covers the
// ground, but up close it is a blurry smear. Near the camera this shader keeps the photo's large-scale colour and
// replaces its detail with tiled, height-blended PBR layers chosen per pixel from the photo itself:
//   soil   decomposed granite (Poly Haven gravelly_sand)        bare tan / grey ground, trails, firebreaks
//   dry    dry annual grass (ambientCG Grass003, tinted by photo) golden hillsides and vacant lots
//   lawn   irrigated turf (ambientCG Grass004)                     bright green yards, parks, fairways
//   litter leaf litter in shade (ambientCG Ground023)              under oaks and chaparral (photo shows canopy)
//   rock   weathered granite (Poly Haven rock_boulder_dry)         steep slopes and bright outcrops, triplanar
// Beyond ~250 m the plain photo is used. Outside the photo coverage ("outer hills") the same layers are driven by
// procedural chaparral / grassland patches instead of the photo.

export const GROUND_LAYERS = ['soil', 'dry', 'lawn', 'litter', 'rock', 'sand'];
// linear mean colour of each layer (tools/nature/pack_ground.py), used to turn a layer into a photo-tinted detail
const MEANS = { soil: [0.2968, 0.1629, 0.0735], dry: [0.0525, 0.0676, 0.0102], lawn: [0.1268, 0.1625, 0.0306], litter: [0.1539, 0.1129, 0.0738], rock: [0.4071, 0.3452, 0.2771], sand: [0.2993, 0.2221, 0.1269] };
const TILE = [2.6, 1.6, 1.4, 1.8, 3.4, 2.4]; // metres per texture repeat

async function loadArray(THREE, renderer, url, layers, srgb) {
  const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
  const w = img.width, h = img.height / layers;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const data = new Uint8Array(g.getImageData(0, 0, img.width, img.height).data.buffer);
  const t = new THREE.DataArrayTexture(data, w, h, layers);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true; return t;
}

export async function loadGround(THREE, renderer, base = 'assets/nature/') {
  const [alb, nrm] = await Promise.all([
    loadArray(THREE, renderer, base + 'ground_alb.webp', GROUND_LAYERS.length, true),
    loadArray(THREE, renderer, base + 'ground_nrm.webp', GROUND_LAYERS.length, false),
  ]);
  return { alb, nrm };
}

// 1x1 stand-in layers (each layer's mean colour, flat normals) so the terrain can be drawn before loadGround finishes:
// with the mean as the layer colour the detail term is 1 and the ground shows the plain photo colour
export function groundStandIn(THREE) {
  const n = GROUND_LAYERS.length, a = new Uint8Array(n * 4), b = new Uint8Array(n * 4);
  const srgb = v => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  GROUND_LAYERS.forEach((k, i) => { a.set([...MEANS[k].map(srgb), 128], i * 4); b.set([128, 128, 255, 255], i * 4); });
  const tex = (data, srgbSpace) => {
    const t = new THREE.DataArrayTexture(data, 1, 1, n); t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    if (srgbSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; return t;
  };
  return { alb: tex(a, true), nrm: tex(b, false), users: [] };
}
// swap the real layers in for the stand-ins on every material already using this ground (no shader rebuild)
export function setGround(ground, real) {
  const old = [ground.alb, ground.nrm];
  ground.alb = real.alb; ground.nrm = real.nrm;
  for (const u of ground.users || []) { u.gAlb.value = real.alb; u.gNrm.value = real.nrm; }
  for (const t of old) if (t && t !== real.alb && t !== real.nrm) t.dispose();
}

// shared GLSL: noise + the layer sampler
const COMMON = /* glsl */`
uniform highp sampler2DArray gAlb; uniform highp sampler2DArray gNrm;
uniform vec3 gMean[6]; uniform float gTile[6]; uniform float gPhotoBias; uniform float gNear; uniform float gFar; uniform float gProcedural; uniform float gDetail;
uniform float gEdgeOn; uniform vec4 gEdge; uniform float gEdgeW; uniform sampler2D gTint; uniform float gTintOn;
uniform sampler2D gLand; uniform float gLandOn; uniform vec4 gLandR;
uniform sampler2D gShore; uniform vec4 gShoreR; uniform float gSea;
varying vec3 vWp; varying vec3 vWn;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y); }
float gFbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * gNoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
// planar sample on the ground plane; a second, rotated sample at 3.7x scale hides tiling
vec4 gLayer(int k, vec2 xz, out vec3 nTS) {
  vec2 uv = vec2(xz.x, -xz.y) / gTile[k];
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.27 + 0.31;
  vec4 a = texture(gAlb, vec3(uv, float(k))), b = texture(gAlb, vec3(uv2, float(k)));
  float m = smoothstep(0.35, 0.65, gNoise(xz * 0.11 + float(k) * 7.3));
  vec3 na = texture(gNrm, vec3(uv, float(k))).xyz * 2.0 - 1.0, nb = texture(gNrm, vec3(uv2, float(k))).xyz * 2.0 - 1.0;
  nTS = normalize(mix(na, nb, m));
  return mix(a, b, m);
}
// triplanar granite for slopes; returns colour+height, world-space normal in nW
vec4 gRock(vec3 p, vec3 N, out vec3 nW) {
  vec3 w = pow(abs(N), vec3(4.0)); w /= (w.x + w.y + w.z);
  float s = 1.0 / gTile[4];
  vec4 cx = texture(gAlb, vec3(vec2(p.z, p.y) * s, 4.0)), cy = texture(gAlb, vec3(vec2(p.x, -p.z) * s, 4.0)), cz = texture(gAlb, vec3(vec2(p.x, p.y) * s, 4.0));
  vec3 tx = texture(gNrm, vec3(vec2(p.z, p.y) * s, 4.0)).xyz * 2.0 - 1.0, ty = texture(gNrm, vec3(vec2(p.x, -p.z) * s, 4.0)).xyz * 2.0 - 1.0, tz = texture(gNrm, vec3(vec2(p.x, p.y) * s, 4.0)).xyz * 2.0 - 1.0;
  // whiteout-style: swizzle tangent normals into world axes
  vec3 nx = vec3(tx.z * sign(N.x), tx.y, tx.x) , ny = vec3(ty.x, ty.z * sign(N.y), ty.y), nz = vec3(tz.x, tz.y, tz.z * sign(N.z));
  nW = normalize(nx * w.x + ny * w.y + nz * w.z + N * 0.5);
  return cx * w.x + cy * w.y + cz * w.z;
}
`;

// The photo's edge: the photo terrain fades into the procedural ground along a ragged line within about
// edgeW..2*edgeW of its rectangle, and (after setGroundTint) the procedural ground near the photo takes the photo's
// own colours, fading back to its stock palette a few km out, so there is no seam where the two meet.
export function setGroundTint(ground, tex, rect) {
  for (const u of ground.users || []) { u.gTint.value = tex; u.gTintOn.value = 1; u.gEdge.value = rect; }
}
// land use (src/nature/groundcover.js buildCoverMap: landTex): yards are a lawn or a dry garden of decomposed granite
// and mulch beds, parks and fields are turf, whatever grey the photo shows there. rect: [x0, z0, width, depth]
export function setGroundLand(ground, tex, rect) {
  for (const u of ground.users || []) { u.gLand.value = tex; u.gLandOn.value = 1; u.gLandR.value = rect; }
}

// Holes in the ground where the pools are: the terrain mesh's 4 m cells can't be cut round a 7 m pool, so the ground
// (and the grass on it) skips its fragments inside each pool, looked up from a grid texture (RGBA8: two pool numbers
// per 16 m cell) and a table of the pools' rectangles. The pool's coping and deck cover the cut's edge.
//   setPoolHoles(pools, cell)   pools: [[x, z, w, d, angle]]
export const HOLE_U = { gHoles: { value: null }, gHoleP: { value: null }, gHoleR: { value: [0, 0, 16, 0] }, gHoleOn: { value: 0 } };
// tracks pressed into soft sand (src/world/tracks.js): a texture following the player, R the dent, G the sand pushed up
// beside it; the ground darkens in the dents and takes their slopes
// the beaches (src/world/water.js keeps them current): the ocean's field of signed distance to the waterline round
// you (+ over the sea, - on land), its centre and size (x, z, size, on), and the sea level; sand lies where it says
export const SHORE_U = { gShore: { value: null }, gShoreR: { value: [0, 0, 1, 0] }, gSea: { value: 0 } };
export const TRACK_U = { gTrk: { value: null }, gTrkWin: { value: [0, 0, 1, 0] } };
const TRACK_GLSL = /* glsl */`
uniform sampler2D gTrk; uniform vec4 gTrkWin;
vec2 trkAt(vec2 p) { vec2 uv = (p - gTrkWin.xy) / gTrkWin.z; if (gTrkWin.w < 0.5 || uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(0.0); return texture2D(gTrk, uv).rg; }
float trkH(vec2 p) { vec2 t = trkAt(p); return (t.g * 0.7 - t.r) * 0.1; } // metres: down in the rut, up on its berm`;
export const HOLE_GLSL = /* glsl */`
uniform sampler2D gHoles, gHoleP; uniform vec4 gHoleR; uniform float gHoleOn;
float poolHole(vec2 p, float m) { // m: extra margin (the grass also keeps off the deck)
  if (gHoleOn < 0.5) return 0.0;
  vec2 g = (p - gHoleR.xy) / gHoleR.z; if (g.x < 0.0 || g.y < 0.0 || g.x >= gHoleR.w || g.y >= gHoleR.w) return 0.0;
  vec4 c = floor(texture2D(gHoles, (floor(g) + 0.5) / gHoleR.w) * 255.0 + 0.5);
  for (int k = 0; k < 2; k++) {
    float id = (k == 0 ? c.r * 256.0 + c.g : c.b * 256.0 + c.a) - 1.0; if (id < 0.0) continue;
    int t = int(id) * 2; vec4 a = texelFetch(gHoleP, ivec2(t % 1024, t / 1024), 0), b = texelFetch(gHoleP, ivec2((t + 1) % 1024, (t + 1) / 1024), 0);
    vec2 d = p - a.xy, l = vec2(d.x * b.x + d.y * b.y, -d.x * b.y + d.y * b.x);
    if (abs(l.x) < a.z + m && abs(l.y) < a.w + m) return 1.0;
  }
  return 0.0;
}`;
export function setPoolHoles(THREE, pools, cell = 16, margin = 0.3) {
  if (!pools.length) return;
  let x0 = 1e9, z0 = 1e9; for (const p of pools) { x0 = Math.min(x0, p[0] - 40); z0 = Math.min(z0, p[1] - 40); }
  const N = 1024, G = new Uint8Array(N * N * 4), P = new Float32Array(1024 * Math.ceil(pools.length * 2 / 1024) * 4);
  pools.forEach(([x, z, w, d, a], i) => {
    const c = Math.cos(a), s = Math.sin(a), hw = w / 2 + margin, hd = d / 2 + margin;
    P.set([x, z, hw, hd, c, s, 0, 0], i * 8);
    const ex = Math.abs(c) * hw + Math.abs(s) * hd + 1.8, ez = Math.abs(s) * hw + Math.abs(c) * hd + 1.8, id = i + 1; // + the deck, for the grass
    for (let gz = Math.floor((z - ez - z0) / cell); gz <= Math.floor((z + ez - z0) / cell); gz++) for (let gx = Math.floor((x - ex - x0) / cell); gx <= Math.floor((x + ex - x0) / cell); gx++) {
      if (gx < 0 || gz < 0 || gx >= N || gz >= N) continue; const o = (gz * N + gx) * 4;
      if (!G[o] && !G[o + 1]) { G[o] = id >> 8; G[o + 1] = id & 255; } else if (!G[o + 2] && !G[o + 3]) { G[o + 2] = id >> 8; G[o + 3] = id & 255; }
    }
  });
  const gt = new THREE.DataTexture(G, N, N, THREE.RGBAFormat, THREE.UnsignedByteType); gt.magFilter = gt.minFilter = THREE.NearestFilter; gt.generateMipmaps = false; gt.needsUpdate = true;
  const pt = new THREE.DataTexture(P, 1024, P.length / 4096, THREE.RGBAFormat, THREE.FloatType); pt.magFilter = pt.minFilter = THREE.NearestFilter; pt.generateMipmaps = false; pt.needsUpdate = true;
  HOLE_U.gHoles.value = gt; HOLE_U.gHoleP.value = pt; HOLE_U.gHoleR.value = [x0, z0, cell, N]; HOLE_U.gHoleOn.value = 1;
}

// onBeforeCompile patch for MeshStandardMaterial terrain. opts: { photoBias, procedural, edge: [x0, z0, x1, z1], edgeW }
// edge: the photo's rectangle in world x/z, for the photo terrain (see setGroundTint)
export function groundPatch(ground, opts = {}) {
  const uniforms = {
    gAlb: { value: ground.alb }, gNrm: { value: ground.nrm },
    gMean: { value: GROUND_LAYERS.flatMap(k => MEANS[k]) },
    gTile: { value: TILE }, gPhotoBias: { value: opts.photoBias ?? 1.5 }, gNear: { value: opts.near ?? 70 }, gFar: { value: opts.far ?? 260 },
    gProcedural: { value: opts.procedural ? 1 : 0 }, gDetail: { value: opts.detail ?? 1 },
    gEdgeOn: { value: opts.edge ? 1 : 0 }, gEdge: { value: opts.edge || [0, 0, 0, 0] }, gEdgeW: { value: opts.edgeW ?? 300 }, gTint: { value: null }, gTintOn: { value: 0 },
    gLand: { value: null }, gLandOn: { value: 0 }, gLandR: { value: [0, 0, 1, 1] }, ...HOLE_U, ...TRACK_U, ...SHORE_U,
  };
  (ground.users || (ground.users = [])).push(uniforms); // so setGround can swap the layers in later
  return sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON + '\nvec3 gNormalW; float gF; float gSandWet;\n' + HOLE_GLSL + TRACK_GLSL)
      .replace('#include <map_fragment>', /* glsl */`
      if (poolHole(vWp.xz, 0.0) > 0.5) discard; // a pool here (setPoolHoles)
      #include <map_fragment>
      {
        vec3 Nw = normalize(vWn); float dd = length(vWp - cameraPosition);
        gF = (1.0 - smoothstep(gNear, gFar, dd)) * gDetail;     // 1 near the camera, 0 far away
        vec3 photo = diffuseColor.rgb;
        vec3 soft = photo;
        #ifdef USE_MAP
          soft = texture2D(map, vMapUv, gPhotoBias).rgb;          // photo with its pixel smear blurred out
        #endif
        float macro = gFbm(vWp.xz * 0.013);
        float pW = gProcedural;                                   // 1: no photo here
        if (gEdgeOn > 0.5) {                                      // near the photo's edge: fade into the procedural ground
          vec2 q = vWp.xz; float ed = min(min(q.x - gEdge.x, gEdge.z - q.x), min(q.y - gEdge.y, gEdge.w - q.y));
          if (ed < 2.2 * gEdgeW) { ed -= gFbm(q * 0.0011) * gEdgeW; pW = 1.0 - smoothstep(0.1 * gEdgeW, gEdgeW, ed); } // the noise only pushes inward: fully procedural at the seam
        }
        if (pW > 0.001) {                                         // chaparral / grassland mosaic
          // north-facing and steeper slopes carry denser chaparral, like the real hills around Poway
          float shrub = smoothstep(0.40, 0.60, gFbm(vWp.xz * 0.02) + 0.18 * smoothstep(0.05, 0.35, 1.0 - Nw.y) + 0.12 * (-Nw.z));
          vec3 chap = vec3(0.034, 0.040, 0.024), grass = vec3(0.150, 0.112, 0.060);
          vec3 proc = mix(grass, chap, shrub) * (0.75 + 0.5 * gFbm(vWp.xz * 0.11));
          if (gTintOn > 0.5) {                                    // near the photo: its colours, with the mosaic's light and shade
            vec2 q = vWp.xz, uv = clamp((q - gEdge.xy) / (gEdge.zw - gEdge.xy), 0.0, 1.0);
            vec3 tc = texture2D(gTint, vec2(uv.x, 1.0 - uv.y)).rgb;
            float outside = length(max(max(gEdge.xy - q, q - gEdge.zw), 0.0));
            float pl = dot(proc, vec3(0.2126, 0.7152, 0.0722)) / dot(mix(grass, chap, 0.45), vec3(0.2126, 0.7152, 0.0722));
            proc = mix(proc, tc * mix(1.0, pl, 0.5), 1.0 - smoothstep(500.0, 4500.0, outside));
          }
          soft = mix(soft, proc, pW); photo = mix(photo, proc, pW);
        }
        { // the photo's odd hues (teal, violet: pool covers, tarps, processing) become earth: blue never beats the red-green mean
          float rg = (soft.r + soft.g) * 0.5; if (soft.b > rg * 0.92) { float k = clamp((soft.b - rg * 0.92) / max(soft.b, 1e-4) * 2.0, 0.0, 1.0); vec3 earth = vec3(rg * 1.08, rg, rg * 0.82); soft = mix(soft, earth, k); photo = mix(photo, earth * (dot(photo, vec3(0.333)) / max(dot(earth, vec3(0.333)), 1e-4)), k); }
        }
        float lum = dot(soft, vec3(0.2126, 0.7152, 0.0722));
        float green = (soft.g - max(soft.r, soft.b)) / (lum + 0.02);
        float yellow = ((soft.r + soft.g) * 0.5 - soft.b) / (lum + 0.02);
        float steep = smoothstep(0.28, 0.6, 1.0 - Nw.y);
        // layer weights from the photo (thresholds calibrated on the NAIP tiles, tools/nature/README.md):
        // lawn = bright saturated green; litter = dark or olive (chaparral, oak canopy, shade);
        // dry grass = golden mid-tones; soil = bright or grey (trails, graded lots, DG yards);
        // rock = steep, or bright neutral spots on slopes (granite outcrops)
        float wLawn = smoothstep(0.10, 0.20, green) * smoothstep(0.065, 0.095, lum);
        float wLit = max(1.0 - smoothstep(0.03, 0.055, lum), smoothstep(0.03, 0.12, green) * (1.0 - smoothstep(0.06, 0.085, lum))) * (1.0 - wLawn);
        float wDry = smoothstep(0.14, 0.24, yellow + 0.1 * (macro - 0.5)) * smoothstep(0.05, 0.075, lum) * (1.0 - smoothstep(0.14, 0.19, lum))
                   * (1.0 - smoothstep(0.04, 0.1, green)) * (1.0 - wLawn) * (1.0 - wLit);
        float wSoil = max(0.0, 1.0 - wLawn - wLit - wDry);
        float wRock = max(steep, smoothstep(0.24, 0.36, lum) * (1.0 - smoothstep(0.08, 0.2, yellow)) * smoothstep(0.06, 0.2, 1.0 - Nw.y) * (1.0 - wLawn));
        float wSand = 0.0, sdShore = 1e4; gSandWet = 0.0;
        if (gShoreR.w > 0.5) { // the beach: low ground within ~60 m of the waterline, bright in the photo, not a rock face
          vec2 suv = (vWp.xz - gShoreR.xy) / gShoreR.z + 0.5;
          if (suv.x > 0.0 && suv.y > 0.0 && suv.x < 1.0 && suv.y < 1.0) {
            float sd = texture2D(gShore, suv).r, above = vWp.y - gSea; sdShore = sd;
            wSand = smoothstep(-95.0, -50.0, sd) * (1.0 - smoothstep(8.0, 15.0, above)) * smoothstep(0.035, 0.07, lum) * (1.0 - steep);
          }
        }
        wRock *= 1.0 - wSand;
        vec4 w = vec4(wSoil, wDry, wLawn, wLit) * (1.0 - wRock);
        w = mix(w, vec4(1.0, 0.0, 0.0, 0.0), wSand); // on the beach the soil layer is sand
        float lawnZ = 0.0, xeri = 0.0, mulch = 0.0;
        if (gLandOn > 0.5) { // tended ground: lawn yards, parks and fields; dry gardens of granite and mulch
          vec2 warp = vec2(gFbm(vWp.xz * 0.33) - 0.5, gFbm(vWp.xz * 0.33 + 7.3) - 0.5) * 2.4; // ragged, not ruled: lawns and gardens fray at their edges
          vec4 land = texture2D(gLand, (vWp.xz + warp - gLandR.xy) / gLandR.zw);
          float lawnLot = step(0.5, land.a);
          lawnZ = max(land.g, land.r * lawnLot); xeri = land.r * (1.0 - lawnLot) * (1.0 - land.g);
          float wear = smoothstep(0.6, 0.78, gFbm(vWp.xz * 0.21 + 3.7)) * (1.0 - land.g * 0.6); // worn and dried-out patches in the lawns
          xeri = max(xeri, lawnZ * wear * 0.7); lawnZ *= 1.0 - wear * 0.7;
          mulch = smoothstep(0.42, 0.62, gFbm(vWp.xz * 0.28 + land.a * 31.0));
          w = mix(w, vec4(1.0 - mulch, 0.0, 0.0, mulch), xeri * (1.0 - wRock));
          w = mix(w, vec4(0.0, 0.0, 1.0, 0.0), lawnZ * (1.0 - wRock));
        }
        vec3 col = photo; gNormalW = Nw;
        if (gF > 0.002) {
          vec3 n0, n1, n2, n3, nR; vec4 L0 = vec4(0), L1 = vec4(0), L2 = vec4(0), L3 = vec4(0), LR = vec4(0);
          n0 = n1 = n2 = n3 = vec3(0, 0, 1); nR = Nw;
          if (w.x > 0.01) { L0 = wSand < 0.99 ? gLayer(0, vWp.xz, n0) : vec4(0); if (wSand > 0.01) { vec3 nS; vec4 S = gLayer(5, vWp.xz, nS); L0 = mix(L0, S, wSand); n0 = normalize(mix(n0, nS, wSand)); } }
          if (w.y > 0.01) L1 = gLayer(1, vWp.xz, n1);
          if (w.z > 0.01) L2 = gLayer(2, vWp.xz, n2);
          if (w.w > 0.01) L3 = gLayer(3, vWp.xz, n3);
          if (wRock > 0.01) LR = gRock(vWp, Nw, nR);
          // height blend: the layer whose texture stands higher wins at the transition
          vec4 h4 = vec4(L0.a, L1.a, L2.a, L3.a) * 0.6 + w * 1.0; float hr = LR.a * 0.6 + wRock;
          float top = max(max(max(h4.x, h4.y), max(h4.z, h4.w)), hr) - 0.25;
          vec4 b = max(h4 - top, 0.0) * step(0.01, w); float br = max(hr - top, 0.0) * step(0.01, wRock);
          float bs = b.x + b.y + b.z + b.w + br + 1e-4; b /= bs; br /= bs;
          // photo-tinted detail: layer texture divided by its mean colour keeps the photo's hue and adds structure
          vec3 tint = soft * (0.88 + 0.24 * macro);
          tint *= mix(vec3(1.0), vec3(1.1, 1.02, 0.8), (1.0 - lawnZ) * (1.0 - xeri) * (1.0 - wRock)); // the wild: sun-baked, brown-green, never blue-grey
          float tired = smoothstep(0.45, 0.75, gFbm(vWp.xz * 0.09 + 11.0));
          tint = mix(tint, mix(vec3(0.062, 0.115, 0.026), vec3(0.11, 0.12, 0.045), tired * 0.6) * (0.85 + 0.3 * macro), lawnZ * 0.8); // a watered lawn, patchy in the heat
          tint = mix(tint, vec3(0.30, 0.22, 0.13) * (0.85 + 0.3 * macro), xeri * (1.0 - mulch) * 0.8); // decomposed granite
          tint = mix(tint, vec3(0.46, 0.36, 0.24) * (0.88 + 0.24 * macro), wSand * 0.55); // beach sand: warm tan whatever grey the far photo shows
          vec3 dS = L0.rgb / mix(gMean[0], gMean[5], wSand), dD = L1.rgb / gMean[1], dL = L2.rgb / gMean[2], dR = LR.rgb / gMean[4];
          float lumD = dot(dD, vec3(0.2126, 0.7152, 0.0722)), lumL = dot(dL, vec3(0.2126, 0.7152, 0.0722));
          vec3 near = tint * (b.x * dS + b.y * mix(vec3(lumD), dD, 0.25) + b.z * mix(vec3(lumL), dL, 0.5) + br * mix(vec3(dot(dR, vec3(0.333))), dR, 0.4));
          // under canopy the photo shows treetops, not ground: use the litter's own colour, shaded by the photo
          near += b.w * L3.rgb * clamp(lum / 0.05, 0.35, 1.0) * 0.9;
          col = mix(photo, near, gF);
          vec3 nT = normalize(n0 * b.x + n1 * b.y + n2 * b.z + n3 * b.w + vec3(0, 0, 1) * br);
          vec3 T = normalize(vec3(Nw.y, -Nw.x, 0.0)), B = normalize(vec3(0.0, -Nw.z, Nw.y));
          vec3 nGround = normalize(T * nT.x + B * nT.y + Nw * nT.z);
          gNormalW = normalize(mix(Nw, normalize(nGround * (1.0 - br) + nR * br), gF));
        }
        diffuseColor.rgb = col;
        if (wSand > 0.01 && gF > 0.002) { // the beach up close: lumps and wind ripples in the dry sand; dark, damp, glossy sand where the waves reach
          vec2 p = vWp.xz; float wet = smoothstep(-14.0, -3.0, sdShore), e = 0.35;
          #define SANDH(q) (gFbm((q) * 0.55) * 0.5 + gFbm((q) * 2.3) * 0.12 + 0.03 * sin(dot(q, vec2(5.1, 2.3)) + 3.0 * gNoise((q) * 0.7)) * (1.0 - wet))
          float h0 = SANDH(p), hx = SANDH(p + vec2(e, 0.0)), hz = SANDH(p + vec2(0.0, e));
          gNormalW = normalize(gNormalW + vec3(h0 - hx, 0.0, h0 - hz) / e * wSand * gF * (1.0 - wet * 0.7));
          diffuseColor.rgb *= mix(1.0, 0.62, wet * wSand); gSandWet = wet * wSand;
        }
        if (gTrkWin.w > 0.5) { // tracks in the sand: darker, damper sand in the dents, the slopes of ruts and berms in the normal
          vec2 tk = trkAt(vWp.xz); diffuseColor.rgb *= 1.0 - tk.r * 0.45 + tk.g * 0.1;
          float e = gTrkWin.z / 1024.0, h0 = trkH(vWp.xz), hx = trkH(vWp.xz + vec2(e, 0.0)), hz = trkH(vWp.xz + vec2(0.0, e));
          gNormalW = normalize(gNormalW + vec3(h0 - hx, 0.0, h0 - hz) / e);
        }
      }`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(gNormalW, 0.0)).xyz);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, gSandWet); // wet sand shines');
  };
}
