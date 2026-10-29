// Water, by kind (STYLE.md "Water"):
//  - pools: clear as glass. A white plaster shell with a band of blue mosaic tile at the waterline, sloped from a 1 m
//    shallow end to the deep end, with steps; the water takes the light by depth (turquoise in the deep end) and the
//    sun's caustics dance on the floor. Some are lit at night. The surface is a Fresnel mirror: you see straight down
//    into it, and the sky off it at a low angle.
//  - lakes and reservoirs: dark, cold, choppy. Opaque green-black water whose chop follows the wind, whitecaps in a
//    blow.
//  - the sea: a grid that follows you near the coast, with the Pacific swell coming in. Within a few hundred metres of
//    the shore the crests line up with the beach (they read their distance to land from a field worked out round you),
//    build as they shoal, break, and run up the sand as whitewater. heightAt() gives the same surface to swimmers,
//    boards and boats.
//  - fountains: tiered cast-stone fountains with water sheeting off each bowl, a jet, spray and ripples where it lands.
//
//   const W = createWater(THREE, scene, { normals, seaLevel, groundAt })
//   W.pool.water / W.pool.shell     materials for the pools' meshes (vertex colour codes the shell, see addPool)
//   W.lake / W.sea                  materials for lakes and the far sea
//   W.fountain(x, y, z, size)       a working fountain
//   W.update(dt, camera, { sunDir, sunCol, night, day, wind })
//   W.ocean.heightAt(x, z)          the sea surface (null where there's no sea near)
import { surfboardGeometry, boardMaterial, surfShack, BOARD_COLORS } from './surf.js';
const NOISE = /* glsl */`
float wH21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 wH22(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float wVn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wH21(i), wH21(i + vec2(1.0, 0.0)), f.x), mix(wH21(i + vec2(0.0, 1.0)), wH21(i + vec2(1.0, 1.0)), f.x), f.y); }
float wFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * wVn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// caustics: the bright net where the rippled surface focuses the sun. Each layer is the distance to the nearest edge of
// a drifting Voronoi pattern; two layers at different scales and speeds, the dimmer of the two, read as one net.
float wVorEdge(vec2 p, float t) {
  vec2 g = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y)), h = wH22(g + o); h = 0.5 + 0.45 * sin(t * (0.6 + 0.5 * h) + 6.2831 * h);
    vec2 r = o + h - f; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
float wCaustic(vec2 p, float t) {
  float a = 1.0 - smoothstep(0.0, 0.2, wVorEdge(p * 1.6, t * 1.1)), b = 1.0 - smoothstep(0.0, 0.26, wVorEdge(p * 1.15 + 7.3, -t * 0.8));
  return pow(min(a, b) * 0.7 + max(a, b) * 0.3, 2.2);
}
`;

// ---------------------------------------------------------------- pools
function poolMaterials(THREE, WU, normals) {
  // the shell: vertex colour r = depth below the coping / 4 m, g = 1 on the floor and step treads, b = 1 if its light
  // is on at night (+0.5 on a lane line); uv = metres (along the wall, down; or across the floor)
  const shell = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, vertexColors: true });
  shell.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, WU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec2 vPU;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz; vPU = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec2 vPU; uniform float uTime, uNight, uDay; uniform vec3 uSunCol;\n' + NOISE)
      .replace('#include <color_fragment>', `
        float d = vColor.r * 4.0, isFloor = vColor.g, lane = step(0.5, fract(vColor.b)) , lightOn = step(0.9, vColor.b);
        vec3 c = vec3(0.86, 0.92, 0.95) * (0.92 + 0.1 * wFbm(vWP.xz * 1.7 + vWP.y * 2.0));          // white plaster, faintly blue
        if (isFloor < 0.5 && d < 0.2) {                                                           // waterline mosaic: 5 cm blue tiles
          vec2 t = vec2(vPU.x, d) / 0.05, f = fract(t), id = floor(t); float h = wH21(id);
          vec3 tile = mix(vec3(0.05, 0.2, 0.42), vec3(0.16, 0.42, 0.6), h) * (0.88 + 0.24 * wH21(id + 3.1));
          c = mix(vec3(0.72, 0.74, 0.72), tile, step(0.09, f.x) * step(0.09, f.y));
        }
        if (lane > 0.5) c = vec3(0.05, 0.08, 0.18);                                                // lane lines on a public pool's floor
        float uw = max(0.0, d - 0.12);                                                            // under the water
        vec3 absorb = exp(-uw * 2.4 * vec3(0.46, 0.12, 0.065));                                   // red goes first: aqua, turquoise in the deep end
        c = mix(c, c * absorb + vec3(0.0, 0.05, 0.08) * (1.0 - absorb.g), step(0.12, d));          // and the water's own blue scatter
        diffuseColor.rgb *= c;
        float caus = d > 0.14 ? wCaustic(vWP.xz * (0.9 + 0.1 * isFloor) + vec2(vWP.y * 0.3), uTime) * exp(-uw * 0.35) : 0.0;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * caus * uSunCol * 0.42 * uDay * (0.4 + 0.6 * isFloor);
        totalEmissiveRadiance += vec3(0.02, 0.2, 0.3) * uNight * lightOn * step(0.12, d) * (0.45 + 0.55 * smoothstep(1.6, 0.4, d));`);
  };
  shell.customProgramCacheKey = () => 'poolshell1';
  // the water: no colour of its own, a Fresnel mirror over the shell (premultiplied: the reflection adds, the shell shows
  // through by 1 - F)
  const water = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x0a2a30, emissiveIntensity: 0.25, roughness: 0.03, metalness: 0,
    transparent: true, premultipliedAlpha: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 });
  water.userData.normals = normals;
  water.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, WU, { uWN: { value: normals } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform sampler2D uWN; uniform float uTime, uWind;')
      .replace('#include <normal_fragment_maps>', `
        { vec2 p = vWP.xz; vec3 a = texture2D(uWN, p * 0.21 + uTime * vec2(0.021, 0.013)).xyz * 2.0 - 1.0, b = texture2D(uWN, p * 0.53 - uTime * vec2(0.017, -0.024)).xyz * 2.0 - 1.0;
          vec2 s = (a.xy * 0.6 + b.xy * 0.4) * (0.07 + 0.05 * uWind);
          normal = normalize((viewMatrix * vec4(normalize(vec3(-s.x, 1.0, -s.y)), 0.0)).xyz); }`)
      .replace('#include <opaque_fragment>', `
        { float cv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), F = 0.02 + 0.98 * pow(1.0 - cv, 5.0);
          diffuseColor.a = clamp(0.06 + F, 0.0, 1.0); }
        #include <opaque_fragment>`)
      .replace('#include <premultiplied_alpha_fragment>', '');
  };
  water.customProgramCacheKey = () => 'poolwater1';
  return { shell, water };
}

// ---------------------------------------------------------------- lakes and the far sea
function darkWater(THREE, WU, normals, o) {
  const m = new THREE.MeshStandardMaterial({ color: o.color, roughness: o.rough ?? 0.07, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, WU, { uWN: { value: normals } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform sampler2D uWN; uniform float uTime, uWind; uniform vec4 uHole;\n' + NOISE)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        ${o.hole ? 'if (uHole.w > 0.5 && max(abs(vWP.x - uHole.x), abs(vWP.z - uHole.y)) < uHole.z) discard; // the near sea grid is drawn here' : ''}`)
      .replace('#include <normal_fragment_maps>', `
        float chop = 0.0;
        { vec2 p = vWP.xz; float w = clamp(uWind, 0.2, 2.0);
          vec3 a = texture2D(uWN, p * ${o.s1} + uTime * vec2(0.031, 0.019) * w).xyz * 2.0 - 1.0;
          vec3 b = texture2D(uWN, p * ${o.s2} + uTime * vec2(-0.043, 0.027) * w).xyz * 2.0 - 1.0;
          vec3 c = texture2D(uWN, p * ${o.s3} - uTime * vec2(0.012, 0.035)).xyz * 2.0 - 1.0;
          vec2 s = (a.xy * 0.45 + b.xy * 0.35 + c.xy * 0.2) * (${o.k} * (0.55 + 0.6 * w));
          chop = length(s);
          normal = normalize((viewMatrix * vec4(normalize(vec3(-s.x, 1.0, -s.y)), 0.0)).xyz); }
        { float cap = smoothstep(0.5, 0.75, wFbm(vWP.xz * 0.35 + uTime * 0.25) + chop * 0.8) * smoothstep(0.9, 1.6, uWind); // whitecaps in a blow
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.8, 0.8), cap * 0.7); roughnessFactor = mix(roughnessFactor, 0.8, cap); }`);
  };
  m.customProgramCacheKey = () => 'darkwater1' + (o.hole ? 'h' : '');
  return m;
}

// ---------------------------------------------------------------- the sea near you
// the sea surface as a function of the signed distance to land s (metres, + over water) and the direction to open
// water g; the same formula in GLSL (OCEAN_WAVE) and JS (waveAt) so floating things ride what you see
const SWELL = { lambda: 46, period: 11, H: 0.85, breakAt: 70 };
const OCEAN_WAVE = /* glsl */`
uniform sampler2D uField; uniform vec2 uFC; uniform float uFS, uSea, uSwellH;
float fieldAt(vec2 p) { vec2 uv = (p - uFC) / uFS + 0.5; return texture2D(uField, uv).r; }
// returns height above sea level; br: 0 offshore .. 1 at the break; ww: whitewater; cr: 0..1 crest phase
float oceanWave(vec2 p, float t, out float br, out float ww, out float cr) {
  float s = fieldAt(p);
  float k = 6.2831853 / ${SWELL.lambda.toFixed(1)}, w = 6.2831853 / ${SWELL.period.toFixed(1)};
  float ph = k * s + w * t + 0.9 * sin(dot(p, vec2(0.0031, 0.0083))) + 0.5 * sin(dot(p, vec2(-0.0057, 0.0024)) + 1.7); // crests aren't ruler-straight
  br = smoothstep(420.0, ${SWELL.breakAt.toFixed(1)}, s);
  ww = smoothstep(${(SWELL.breakAt + 5).toFixed(1)}, 25.0, s);
  float H = uSwellH * mix(1.0 + 0.7 * br, 0.32, ww) * smoothstep(-14.0, 4.0, s);
  float c = 0.5 + 0.5 * cos(ph); cr = c;
  float sharp = mix(1.0, 3.2, br * (1.0 - ww * 0.6));
  float y = H * (pow(c, sharp) - 0.3);
  // offshore: a cross swell and wind chop on top
  float off = smoothstep(300.0, 900.0, s);
  y += off * (0.35 * uSwellH * sin(dot(p, vec2(0.071, 0.033)) - t * 0.77) + 0.12 * sin(dot(p, vec2(-0.21, 0.29)) - t * 1.6));
  return y;
}`;

function createOcean(THREE, scene, WU, normals, seaLevel, groundAt, free) {
  const N = 160, CELL = 16, FS = N * CELL; // the field: 2.56 km round you
  const F = new Float32Array(N * N), H16 = new Uint16Array(N * N);
  const tex = new THREE.DataTexture(H16, N, N, THREE.RedFormat, THREE.HalfFloatType); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const U = { uField: { value: tex }, uFC: { value: new THREE.Vector2() }, uFS: { value: FS }, uSea: { value: 0 }, uSwellH: { value: SWELL.H } };
  // the mesh: a grid packed tight round you and loose at the edge (quadratic-ish spacing), 1.25 km each way
  const G = 200, R = 1240, pos = new Float32Array((G + 1) * (G + 1) * 3), idx = [];
  for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) { const tx = i / G * 2 - 1, tz = j / G * 2 - 1, k = (j * (G + 1) + i) * 3;
    pos[k] = Math.sign(tx) * Math.pow(Math.abs(tx), 1.6) * R; pos[k + 1] = 0; pos[k + 2] = Math.sign(tz) * Math.pow(Math.abs(tz), 1.6) * R; }
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const a = j * (G + 1) + i, b = a + 1, c = a + G + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, WU, U, { uWN: { value: normals } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vWP; varying vec3 vSurf;\n' + OCEAN_WAVE)
      .replace('#include <beginnormal_vertex>', `
        vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz; float br, ww, cr, b2, w2, c2;
        float h0 = oceanWave(wp0.xz, uTime, br, ww, cr), hx = oceanWave(wp0.xz + vec2(0.6, 0.0), uTime, b2, w2, c2), hz = oceanWave(wp0.xz + vec2(0.0, 0.6), uTime, b2, w2, c2);
        vec3 objectNormal = normalize(vec3(-(hx - h0) / 0.6, 1.0, -(hz - h0) / 0.6));`)
      .replace('#include <begin_vertex>', `vec3 transformed = position; transformed.y = h0; vWP = vec3(wp0.x, uSea + h0, wp0.z); vSurf = vec3(br, ww, cr);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vSurf; uniform sampler2D uWN, uField; uniform vec2 uFC; uniform float uFS, uTime, uWind; uniform vec3 uSunDir;\n' + NOISE)
      .replace('#include <color_fragment>', `
        float s = texture2D(uField, (vWP.xz - uFC) / uFS + 0.5).r, br = vSurf.x, ww = vSurf.y, cr = vSurf.z;
        vec3 deep = vec3(0.012, 0.05, 0.07), shallow = vec3(0.06, 0.17, 0.16);                  // Pacific blue-black; green over the sand bar
        vec3 col = mix(deep, shallow, smoothstep(260.0, 15.0, s));
        // foam: on the breaking crest, in the whitewater behind it, and the lace at the edge of the sand
        vec2 fp = vWP.xz * 0.45 + vec2(uTime * 0.1, 0.0);
        float n = wFbm(fp) * 0.6 + wFbm(fp * 3.1 + 5.0) * 0.4;
        float crest = smoothstep(0.82, 0.97, cr) * smoothstep(${(SWELL.breakAt + 60).toFixed(1)}, ${SWELL.breakAt.toFixed(1)}, s) * (1.0 - ww * 0.4); // only where they break
        float white = ww * smoothstep(0.25, 0.65, n + cr * 0.45);
        float lace = smoothstep(12.0, 0.0, s) * smoothstep(0.35, 0.6, n);
        float foam = clamp(max(crest * smoothstep(0.3, 0.55, n + 0.2), max(white, lace)), 0.0, 1.0);
        diffuseColor.rgb = mix(col, vec3(0.86, 0.88, 0.87), foam);`)
      .replace('#include <normal_fragment_maps>', `
        { vec2 p = vWP.xz; vec3 a = texture2D(uWN, p * 0.05 + uTime * vec2(0.02, 0.012)).xyz * 2.0 - 1.0, b = texture2D(uWN, p * 0.17 - uTime * vec2(0.03, -0.021)).xyz * 2.0 - 1.0;
          vec2 sl = (a.xy * 0.55 + b.xy * 0.45) * 0.18 * (0.6 + 0.4 * clamp(uWind, 0.3, 1.8)) * (1.0 - foam * 0.7);
          normal = normalize(normal + (viewMatrix * vec4(-sl.x, 0.0, -sl.y, 0.0)).xyz); }`) // the small chop on top of the swell
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.85, foam);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { // light through the face of a wave as it stands up (the green glow in a backlit wave)
          vec3 V = normalize(cameraPosition - vWP); float face = smoothstep(0.35, 0.8, cr) * br * (1.0 - foam);
          totalEmissiveRadiance += vec3(0.05, 0.2, 0.16) * face * pow(max(dot(-V, uSunDir), 0.0), 2.0) * 0.6; }`);
  };
  mat.customProgramCacheKey = () => 'ocean1';
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.receiveShadow = true; mesh.name = 'ocean:near'; scene.add(mesh);
  const O = { mesh, U, active: false, cx: 1e9, cz: 1e9, wet: false, retry: 0 };
  // signed distance to land over the field (metres): 8-neighbour chamfer, both ways
  function build(cx, cz) {
    const sea = seaLevel(), land = new Uint8Array(N * N); let wet = 0, dry = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = cx + (i + 0.5 - N / 2) * CELL, z = cz + (j + 0.5 - N / 2) * CELL, h = groundAt(x, z); const L = h === null || h === undefined || h > sea + 0.3; land[j * N + i] = L ? 1 : 0; if (L) dry++; else wet++; } // (0.3: the DEM is noisy round sea level)
    O.wet = wet > 0; if (!O.wet) return;
    const dist = (target) => { // distance from every cell to the nearest cell whose land flag is `target`
      const D = new Float32Array(N * N); for (let k = 0; k < N * N; k++) D[k] = land[k] === target ? 0 : 1e9;
      const a = CELL, b = CELL * 1.4142;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; let v = D[k];
        if (i > 0) v = Math.min(v, D[k - 1] + a); if (j > 0) { v = Math.min(v, D[k - N] + a); if (i > 0) v = Math.min(v, D[k - N - 1] + b); if (i < N - 1) v = Math.min(v, D[k - N + 1] + b); } D[k] = v; }
      for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { const k = j * N + i; let v = D[k];
        if (i < N - 1) v = Math.min(v, D[k + 1] + a); if (j < N - 1) { v = Math.min(v, D[k + N] + a); if (i < N - 1) v = Math.min(v, D[k + N + 1] + b); if (i > 0) v = Math.min(v, D[k + N - 1] + b); } D[k] = v; }
      return D;
    };
    const toLand = dry ? dist(1) : null, toSea = dist(0);
    for (let k = 0; k < N * N; k++) { const v = land[k] ? -Math.min(toSea[k], 900) + CELL * 0.5 : (toLand ? Math.min(toLand[k], 2000) : 2000) - CELL * 0.5; F[k] = v; H16[k] = THREE.DataUtils.toHalfFloat(v); }
    tex.needsUpdate = true; O.cx = cx; O.cz = cz; U.uFC.value.set(cx, cz);
    beach.place(cx, cz, N, CELL, F, sea);
  }
  const beach = createBeach(THREE, scene, groundAt, free || (() => true));
  const fieldAt = (x, z) => { // bilinear, as the GPU samples it
    const fx = (x - O.cx) / CELL + N / 2 - 0.5, fz = (z - O.cz) / CELL + N / 2 - 0.5; if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return 2000;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * N + i;
    return (F[k] * (1 - u) + F[k + 1] * u) * (1 - v) + (F[k + N] * (1 - u) + F[k + N + 1] * u) * v;
  };
  const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  O.waveAt = (x, z, t) => { // the GLSL oceanWave, for things that float
    const s = fieldAt(x, z), k = 2 * Math.PI / SWELL.lambda, w = 2 * Math.PI / SWELL.period;
    const ph = k * s + w * t + 0.9 * Math.sin(x * 0.0031 + z * 0.0083) + 0.5 * Math.sin(-x * 0.0057 + z * 0.0024 + 1.7);
    const br = sst(420, SWELL.breakAt, s), ww = sst(SWELL.breakAt + 5, 25, s), H = U.uSwellH.value * ((1 + 0.7 * br) * (1 - ww) + 0.32 * ww) * sst(-14, 4, s);
    const c = 0.5 + 0.5 * Math.cos(ph), sharp = 1 + 2.2 * br * (1 - ww * 0.6); let y = H * (Math.pow(c, sharp) - 0.3);
    const off = sst(300, 900, s); y += off * (0.35 * U.uSwellH.value * Math.sin(x * 0.071 + z * 0.033 - t * 0.77) + 0.12 * Math.sin(-x * 0.21 + z * 0.29 - t * 1.6));
    return { y, s, br, ww, crest: c };
  };
  O.update = (cam, t) => {
    const sea = seaLevel(); U.uSea.value = sea;
    const far = Math.hypot(cam.position.x - O.cx, cam.position.z - O.cz) > 380;
    O.retry -= 1;
    if (far || (!O.wet && O.retry <= 0)) { build(Math.round(cam.position.x / CELL) * CELL, Math.round(cam.position.z / CELL) * CELL); O.retry = 300; }
    O.active = O.wet && cam.position.y - sea < 900;
    mesh.visible = O.active;
    if (O.active) { const sx = Math.round(cam.position.x / 8) * 8, sz = Math.round(cam.position.z / 8) * 8; mesh.position.set(sx, sea, sz); mesh.updateMatrixWorld(); }
  };
  O.heightAt = (x, z, t) => O.active ? seaLevel() + O.waveAt(x, z, t).y : null;
  O.shoreDist = (x, z) => O.wet ? fieldAt(x, z) : 2000; // + over the sea, - on land (metres to the waterline)
  O.beach = beach;
  O.hole = () => O.active ? [mesh.position.x, mesh.position.z, R - 60, 1] : [0, 0, 0, 0];
  return O;
}

// ---------------------------------------------------------------- the beach
// What's on a San Diego beach, placed along the real shoreline round you each time the shore field is worked out:
// lifeguard towers every few hundred metres (a pastel hut on stilts, glass all round, a ramp down the back), and round
// them the day's umbrellas, towels and boards stuck in the sand.
function createBeach(THREE, scene, groundAt, free) {
  const grp = new THREE.Group(); grp.name = 'beach'; scene.add(grp);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75 }, o));
  const white = M(0xf2f2ee), glass = M(0x26333d, { roughness: 0.15, metalness: 0.3 }), post = M(0xd9d4c8);
  const HUTS = [M(0x9fd2ee), M(0xf5d25a), M(0xa9e1d4)];
  function tower(hut) {
    const g = new THREE.Group(), add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    for (const a of [-1.15, 1.15]) for (const b of [-1.15, 1.15]) add(new THREE.CylinderGeometry(0.09, 0.11, 2.5, 8), post, a, 1.25, b);
    for (const [a, b] of [[-1.15, 0], [1.15, 0]]) { const x = add(new THREE.BoxGeometry(0.06, 0.06, 3.2), post, a, 1.0, b); x.rotation.x = 0.62; } // cross braces
    add(new THREE.BoxGeometry(3.3, 0.14, 3.3), white, 0, 2.5, 0);
    add(new THREE.BoxGeometry(2.5, 2.0, 2.3), hut, 0, 3.55, 0.15);
    add(new THREE.BoxGeometry(2.54, 0.62, 2.34), glass, 0, 3.75, 0.15);                         // the window band, all round
    add(new THREE.BoxGeometry(2.6, 0.1, 2.4), white, 0, 3.4, 0.15); add(new THREE.BoxGeometry(2.6, 0.1, 2.4), white, 0, 4.1, 0.15);
    const roof = add(new THREE.ConeGeometry(2.05, 0.75, 4, 1), white, 0, 4.92, 0.15, Math.PI / 4);
    for (const [x, z, w, d] of [[0, -1.6, 3.3, 0.05], [-1.6, 0, 0.05, 3.3], [1.6, 0, 0.05, 3.3]]) add(new THREE.BoxGeometry(w, 0.05, d), white, x, 3.5, z); // railing
    for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6], [0, -1.6]]) add(new THREE.BoxGeometry(0.06, 1.0, 0.06), white, x, 3.0, z);
    const ramp = add(new THREE.BoxGeometry(1.1, 0.08, 4.9), white, 0, 1.25, 3.85); ramp.rotation.x = -0.54;                  // down the back
    const sign = add(new THREE.BoxGeometry(1.6, 0.34, 0.04), M(0xc8102e), 0, 4.36, -1.0); // the red board under the eave
    return g;
  }
  // umbrellas, towels, boards: instanced
  const U = 60, um = new THREE.InstancedMesh(new THREE.ConeGeometry(1.15, 0.38, 10, 1, true).translate(0, 2.1, 0), M(0xffffff, { side: THREE.DoubleSide, roughness: 0.9 }), U);
  const up = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 2.3, 6).translate(0, 1.0, 0), post, U);
  const tw = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.85, 1.8).rotateX(-Math.PI / 2).translate(0, 0.02, 0), M(0xffffff, { roughness: 1 }), U * 2);
  const sb = new THREE.InstancedMesh(surfboardGeometry(THREE, 'short').rotateX(-Math.PI / 2), boardMaterial(THREE), U); // boards stuck tail-down in the sand (src/world/surf.js)
  for (const m of [um, up, tw, sb]) { m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; grp.add(m); }
  const CANOPY = [0xe8473c, 0x2f7fd1, 0xf4c430, 0x3aa876, 0xf28c28, 0xffffff, 0x7b3fa0], TOWEL = [0xe94f64, 0x2ba3c7, 0xf7d046, 0xff8c42, 0x5b4fd1, 0x2ecc71, 0xf0f0f0], BOARD = BOARD_COLORS;
  const shacks = [0, 1, 2, 3].map(i => { const s = surfShack(THREE, i); s.visible = false; grp.add(s); return s; }); // surf rental stands, near some of the towers
  const towers = []; let rr = 1; const rnd = () => (rr = (rr * 16807) % 2147483647) / 2147483647;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), yA = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  return {
    group: grp,
    place(cx, cz, N, CELL, F, sea) {
      for (const t of towers) grp.remove(t); towers.length = 0; um.count = up.count = tw.count = sb.count = 0; for (const s of shacks) s.visible = false; rr = Math.floor(Math.abs(cx * 7 + cz * 13)) % 2147483646 + 1;
      const at = (i, j) => F[j * N + i], spots = [];
      for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) { const s = at(i, j); if (s > -46 && s < -14) spots.push([i, j, s]); }
      if (!spots.length) return;
      const xz = (i, j) => [cx + (i + 0.5 - N / 2) * CELL, cz + (j + 0.5 - N / 2) * CELL];
      const seaDir = (i, j) => { const gx = at(i + 1, j) - at(i - 1, j), gz = at(i, j + 1) - at(i, j - 1), l = Math.hypot(gx, gz) || 1; return [gx / l, gz / l]; }; // toward the water
      // towers: on the upper beach, 280 m apart or more
      const placed = [];
      for (const [i, j, s] of spots.filter(p => p[2] < -26).sort(() => rnd() - 0.5)) {
        const [x, z] = xz(i, j), h = groundAt(x, z); if (h === null || h === undefined || h > sea + 6 || !free(x, z, 4)) continue;
        if (placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 280)) continue;
        const [dx, dz] = seaDir(i, j), t = tower(HUTS[towers.length % HUTS.length]); t.position.set(x, h - 0.05, z); t.rotation.y = Math.atan2(-dx, -dz); grp.add(t); towers.push(t); placed.push([x, z]);
        if (towers.length >= 10) break;
      }
      // a rental stand up the beach from every other tower, along the sand to one side
      let si = 0;
      for (let k = 0; k < placed.length && si < shacks.length; k += 2) {
        const t = towers[k], a = t.rotation.y, dx = -Math.sin(a), dz = -Math.cos(a); // toward the water
        for (const along of [26, -26, 40]) { const x = placed[k][0] - dx * 14 + dz * along, z = placed[k][1] - dz * 14 - dx * along, h = groundAt(x, z);
          if (h === null || h === undefined || h > sea + 6 || !free(x, z, 5)) continue; const sh = shacks[si++]; sh.position.set(x, h - 0.05, z); sh.rotation.y = a + Math.PI; sh.visible = true; break; } // the counter to the water
      }
      // the day's camp: umbrellas with towels and boards, in loose groups, thicker near the towers
      for (const [i, j, s] of spots.sort(() => rnd() - 0.5)) {
        if (um.count >= U) break; const [x0, z0] = xz(i, j); const near = placed.some(p => Math.hypot(p[0] - x0, p[1] - z0) < 160); if (rnd() > (near ? 0.5 : 0.12)) continue;
        const x = x0 + (rnd() - 0.5) * CELL, z = z0 + (rnd() - 0.5) * CELL, h = groundAt(x, z); if (h === null || h === undefined || h > sea + 5 || !free(x, z, 2)) continue;
        const k = um.count, a = rnd() * Math.PI * 2, tilt = (rnd() - 0.5) * 0.25;
        q.setFromEuler(new THREE.Euler(tilt, a, tilt * 0.6)); m4.compose(v.set(x, h - 0.25, z), q, sc); um.setMatrixAt(k, m4); up.setMatrixAt(k, m4); um.setColorAt(k, col.setHex(CANOPY[Math.floor(rnd() * CANOPY.length)])); um.count++; up.count++;
        for (let n = 0; n < 2; n++) { const tx = x + Math.cos(a + n * 1.6) * 1.3, tz = z + Math.sin(a + n * 1.6) * 1.3, th = groundAt(tx, tz) ?? h; q.setFromAxisAngle(yA, a + n * 0.3 + rnd() * 0.4); m4.compose(v.set(tx, th, tz), q, sc); tw.setMatrixAt(tw.count, m4); tw.setColorAt(tw.count, col.setHex(TOWEL[Math.floor(rnd() * TOWEL.length)])); tw.count++; }
        if (rnd() < 0.45) { const bx = x + Math.cos(a - 1.2) * 1.9, bz = z + Math.sin(a - 1.2) * 1.9, bh = groundAt(bx, bz) ?? h; q.setFromEuler(new THREE.Euler(0.12, a, 0)); m4.compose(v.set(bx, bh - 0.35, bz), q, sc); sb.setMatrixAt(sb.count, m4); sb.setColorAt(sb.count, col.setHex(BOARD[Math.floor(rnd() * BOARD.length)])); sb.count++; }
      }
      for (const m of [um, up, tw, sb]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    },
    get towers() { return towers; },
  };
}

// ---------------------------------------------------------------- fountains
function createFountains(THREE, scene, WU, poolWater) {
  const stone = new THREE.MeshStandardMaterial({ color: 0xd9ccb3, roughness: 0.85, side: THREE.DoubleSide }); // cast stone (lathed shells: both faces)
  const list = [];
  // falling sheets: an open cylinder with streaks running down it
  const sheetMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: WU.uTime, uSunCol: WU.uSunCol, uDay: WU.uDay, uNight: WU.uNight },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime, uDay, uNight; uniform vec3 uSunCol; varying vec2 vUv; varying vec3 vN;
      ${NOISE}
      void main() { float u = vUv.x * 90.0, v = vUv.y;
        float streak = wVn(vec2(u, v * 4.0 + uTime * 5.0)) * 0.6 + wVn(vec2(u * 2.3, v * 9.0 + uTime * 8.0)) * 0.4;
        float a = smoothstep(0.35, 0.8, streak) * (0.25 + 0.5 * (1.0 - v)) * smoothstep(0.0, 0.08, v) * smoothstep(1.0, 0.9, v);
        vec3 c = vec3(0.82, 0.9, 0.95) * (0.35 + 0.65 * uDay) + uSunCol * 0.05;
        gl_FragColor = vec4(c, a * 0.85);
        #include <colorspace_fragment>
      }` });
  // drops: spray from the jet and splashes where the sheets land; each drop's arc is worked out on the GPU from time
  const dropMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: WU.uTime, uDay: WU.uDay, uScale: { value: 600 } },
    vertexShader: `attribute vec4 drop; uniform float uTime, uScale; varying float vA;
      void main() { // drop: (life s, start phase, upward speed, outward speed); position: (start x, start y, start z) with its outward direction in normal
        float t = mod(uTime + drop.y * drop.x, drop.x); vec3 p = position + normal * drop.w * t + vec3(0.0, drop.z * t - 4.9 * t * t, 0.0);
        vA = smoothstep(0.0, 0.05, t) * (1.0 - t / drop.x);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(0.035 * uScale / -mv.z, 1.0, 5.0); }`,
    fragmentShader: `uniform float uDay; varying float vA; void main() { vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard; gl_FragColor = vec4(vec3(0.85, 0.92, 0.96) * (0.4 + 0.6 * uDay), vA * 0.7); }` });
  function lathe(pts, seg = 40) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
  function drops(n, fn) {
    const p = new Float32Array(n * 3), nn = new Float32Array(n * 3), d = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const o = fn(i); p.set(o.p, i * 3); nn.set(o.n, i * 3); d.set(o.d, i * 4); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); g.setAttribute('drop', new THREE.BufferAttribute(d, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 6); return new THREE.Points(g, dropMat);
  }
  return function fountain(x, y, z, size = 1) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(size);
    const R0 = 2.6, wall = [[R0 - 0.3, 0], [R0 - 0.3, 0.52], [R0 - 0.26, 0.6], [R0 + 0.02, 0.62], [R0 + 0.06, 0.55], [R0 + 0.06, 0.08], [R0 + 0.14, 0.0]];
    const parts = [
      lathe(wall), // the basin's rim
      lathe([[0.001, 0.05], [R0 - 0.3, 0.05]]), // its floor
      lathe([[0.32, 0], [0.26, 0.12], [0.2, 0.25], [0.17, 1.1], [0.22, 1.2]], 24), // pedestal
      lathe([[0.001, 1.2], [0.3, 1.18], [0.75, 1.3], [1.05, 1.45], [1.12, 1.52], [1.1, 1.56], [1.0, 1.5], [0.4, 1.38], [0.001, 1.38]]), // lower bowl
      lathe([[0.14, 1.38], [0.11, 1.55], [0.1, 1.95], [0.15, 2.05]], 20), // upper stem
      lathe([[0.001, 2.05], [0.2, 2.04], [0.45, 2.15], [0.56, 2.25], [0.55, 2.29], [0.48, 2.24], [0.2, 2.16], [0.001, 2.16]]), // upper bowl
      lathe([[0.07, 2.2], [0.05, 2.35], [0.09, 2.42], [0.001, 2.52]], 16), // finial
    ];
    for (const geo of parts) { const m = new THREE.Mesh(geo, stone); m.castShadow = m.receiveShadow = true; g.add(m); }
    // standing water in the basin and both bowls (the pool water material: clear, with the stone showing through)
    for (const [r, h] of [[R0 - 0.3, 0.46], [1.03, 1.49], [0.5, 2.25]]) { const w = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2).translate(0, h, 0), poolWater); g.add(w); }
    // the sheets falling off each bowl's lip, and the jet's spray
    for (const [r0, r1, top, bot] of [[1.12, 1.24, 1.53, 0.47], [0.56, 0.66, 2.27, 1.5]]) {
      const geo = new THREE.CylinderGeometry(r0, r1, top - bot, 48, 1, true).translate(0, (top + bot) / 2, 0);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); // v runs down
      const m = new THREE.Mesh(geo, sheetMat); m.renderOrder = 2; g.add(m);
    }
    g.add(drops(260, () => { const a = Math.random() * Math.PI * 2, o = 0.15 + Math.random() * 0.25; return { p: [0, 2.5, 0], n: [Math.cos(a) * o, 0, Math.sin(a) * o], d: [0.9 + Math.random() * 0.3, Math.random(), 3.6 + Math.random() * 0.8, 1] }; }));
    g.add(drops(420, i => { const big = i % 3 !== 0, r = big ? 1.24 : 0.66, h = big ? 0.47 : 1.5, a = Math.random() * Math.PI * 2;
      return { p: [Math.cos(a) * r, h, Math.sin(a) * r], n: [Math.cos(a), 0, Math.sin(a)], d: [0.25 + Math.random() * 0.25, Math.random(), 0.9 + Math.random() * 1.1, 0.25 + Math.random() * 0.5] }; }));
    scene.add(g); list.push(g);
    return { group: g, radius: (R0 + 0.15) * size };
  };
}

export function createWater(THREE, scene, o) {
  const WU = { uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uNight: { value: 0 }, uDay: { value: 1 }, uWind: { value: 1 }, uHole: { value: new THREE.Vector4() } };
  const pool = poolMaterials(THREE, WU, o.normals);
  const lake = darkWater(THREE, WU, o.normals, { color: new THREE.Color(0.012, 0.035, 0.036), rough: 0.1, s1: '0.045', s2: '0.13', s3: '0.31', k: '0.24' });
  const sea = darkWater(THREE, WU, o.normals, { color: new THREE.Color(0.012, 0.045, 0.065), s1: '0.012', s2: '0.05', s3: '0.15', k: '0.14', hole: true });
  const ocean = createOcean(THREE, scene, WU, o.normals, o.seaLevel, o.groundAt, o.free);
  const fountain = createFountains(THREE, scene, WU, pool.water);
  return {
    WU, pool, lake, sea, ocean, fountain,
    update(dt, cam, e) {
      WU.uTime.value += dt; WU.uSunDir.value.copy(e.sunDir); WU.uSunCol.value.copy(e.sunCol); WU.uNight.value = e.night; WU.uDay.value = e.day; WU.uWind.value = e.wind;
      ocean.update(cam, WU.uTime.value); const h = ocean.hole(); WU.uHole.value.set(h[0], h[1], h[2], h[3]);
    },
  };
}
