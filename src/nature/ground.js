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

export const GROUND_LAYERS = ['soil', 'dry', 'lawn', 'litter', 'rock'];
// linear mean colour of each layer (tools/nature/pack_ground.py), used to turn a layer into a photo-tinted detail
const MEANS = { soil: [0.2968, 0.1629, 0.0735], dry: [0.0525, 0.0676, 0.0102], lawn: [0.1268, 0.1625, 0.0306], litter: [0.1539, 0.1129, 0.0738], rock: [0.4071, 0.3452, 0.2771] };
const TILE = [2.6, 1.6, 1.4, 1.8, 3.4]; // metres per texture repeat

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
uniform vec3 gMean[5]; uniform float gTile[5]; uniform float gPhotoBias; uniform float gNear; uniform float gFar; uniform float gProcedural; uniform float gDetail;
uniform float gEdgeOn; uniform vec4 gEdge; uniform float gEdgeW; uniform sampler2D gTint; uniform float gTintOn;
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

// onBeforeCompile patch for MeshStandardMaterial terrain. opts: { photoBias, procedural, edge: [x0, z0, x1, z1], edgeW }
// edge: the photo's rectangle in world x/z, for the photo terrain (see setGroundTint)
export function groundPatch(ground, opts = {}) {
  const uniforms = {
    gAlb: { value: ground.alb }, gNrm: { value: ground.nrm },
    gMean: { value: GROUND_LAYERS.flatMap(k => MEANS[k]) },
    gTile: { value: TILE }, gPhotoBias: { value: opts.photoBias ?? 1.5 }, gNear: { value: opts.near ?? 70 }, gFar: { value: opts.far ?? 260 },
    gProcedural: { value: opts.procedural ? 1 : 0 }, gDetail: { value: opts.detail ?? 1 },
    gEdgeOn: { value: opts.edge ? 1 : 0 }, gEdge: { value: opts.edge || [0, 0, 0, 0] }, gEdgeW: { value: opts.edgeW ?? 300 }, gTint: { value: null }, gTintOn: { value: 0 },
  };
  (ground.users || (ground.users = [])).push(uniforms); // so setGround can swap the layers in later
  return sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON + '\nvec3 gNormalW; float gF;')
      .replace('#include <map_fragment>', /* glsl */`
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
        vec4 w = vec4(wSoil, wDry, wLawn, wLit) * (1.0 - wRock);
        vec3 col = photo; gNormalW = Nw;
        if (gF > 0.002) {
          vec3 n0, n1, n2, n3, nR; vec4 L0 = vec4(0), L1 = vec4(0), L2 = vec4(0), L3 = vec4(0), LR = vec4(0);
          n0 = n1 = n2 = n3 = vec3(0, 0, 1); nR = Nw;
          if (w.x > 0.01) L0 = gLayer(0, vWp.xz, n0);
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
          vec3 dS = L0.rgb / gMean[0], dD = L1.rgb / gMean[1], dL = L2.rgb / gMean[2], dR = LR.rgb / gMean[4];
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
      }`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(gNormalW, 0.0)).xyz);');
  };
}
