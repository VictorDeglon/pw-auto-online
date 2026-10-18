// The look. The scene renders into an HDR target, then full-screen passes finish the picture. Four levels:
//   0 off        render straight to the screen (three's own ACES), fastest
//   1 clean      ACES, a little extra saturation, teal shadows / warm highlights, light sharpening, vignette, grain
//   2 stylized   clean + ink outlines where depth jumps (within ~150 m) and a hint of cel banding: half cartoon
//   3 realistic  no ink, no banding. Bloom from a mip chain at half resolution (lamps, headlights, sun glints glow),
//                eye adaptation (the exposure follows the average brightness of the frame, smoothly, worked out on
//                the GPU so nothing is read back), Unreal's filmic curve, a light grade, vignette and grain.
//                Optional half-resolution ambient occlusion from the depth buffer (High and Ultra).
//   const post = createPost(THREE, renderer, camera, level, { msaa, ao })   post.render(scene, camera, night)
//   post.setLevel(n)   post.U.* (uniforms index.html sets: uDusk)   post.debug() -> what the eye adaptation sees
export function createPost(THREE, renderer, camera, level = 2, opts = {}) {
  const O = { msaa: true, ao: false, ...opts };
  const size = new THREE.Vector2();
  const webgl2 = renderer.capabilities.isWebGL2;
  let rt = null, rtKind = '';
  // ink and ambient occlusion read the depth texture. Ink has always run without MSAA (the outlines hide most of the
  // jaggies); the realistic look keeps 4x MSAA and three resolves the depth into the depth texture with the colour.
  function wantKind() { return level === 3 ? (O.msaa && webgl2 ? 'm' : 's') + (O.ao ? 'd' : '') : level === 2 ? 'sd' : 'm'; }
  function makeTarget(kind) {
    renderer.getDrawingBufferSize(size);
    const t = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: kind[0] === 'm' && webgl2 ? 4 : 0 });
    if (kind.includes('d') || level !== 3) { t.depthTexture = new THREE.DepthTexture(size.x, size.y); t.depthTexture.type = THREE.UnsignedIntType; }
    return t;
  }
  const U = {
    tCol: { value: null }, tDep: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 },
    uNear: { value: camera.near }, uFar: { value: camera.far }, uExp: { value: 1 }, uInk: { value: 1 }, uFx: { value: 1 }, uNight: { value: 0 }, uDusk: { value: 0 }, uDbg: { value: 0 },
  };
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  const mat = new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: VS,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tCol, tDep; uniform vec2 uRes; uniform float uTime, uNear, uFar, uExp, uInk, uFx, uNight, uDusk, uDbg; varying vec2 vUv;
      float lin(vec2 uv){ float d = texture2D(tDep, uv).x; float z = d * 2. - 1.; return 2. * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
      vec3 aces(vec3 x){ // three.js ACESFilmicToneMapping
        const mat3 I = mat3(.59719, .07600, .02840, .35458, .90834, .13383, .04823, .01566, .83777);
        const mat3 O = mat3(1.60475, -.10208, -.00327, -.53108, 1.10813, -.07276, -.07367, -.00605, 1.07602);
        x *= uExp / .6; x = I * x; vec3 a = x * (x + .0245786) - .000090537, b = x * (.983729 * x + .4329510) + .238081; x = O * (a / b); return clamp(x, 0., 1.); }
      vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 7.31) * 43758.5453); }
      void main(){
        vec2 px = 1. / uRes, c = vUv - .5; float r2 = dot(c, c);
        // chromatic fringe toward the edges
        float ca = uFx * .0018 * r2 * 4.;
        vec3 col = vec3(texture2D(tCol, vUv + c * ca).r, texture2D(tCol, vUv).g, texture2D(tCol, vUv - c * ca).b);
        // sharpen (4 taps)
        vec3 nb = texture2D(tCol, vUv + vec2(px.x, 0.)).rgb + texture2D(tCol, vUv - vec2(px.x, 0.)).rgb + texture2D(tCol, vUv + vec2(0., px.y)).rgb + texture2D(tCol, vUv - vec2(0., px.y)).rgb;
        col = max(col + (col - nb * .25) * .35 * uFx, 0.);
        // ink: depth discontinuities, relative to distance, near the camera only
        float ink = 0.;
        if (uInk > 0.) {
          float d0 = lin(vUv);
          if (d0 < 160.) {
            float dl = lin(vUv - vec2(px.x, 0.)), dr = lin(vUv + vec2(px.x, 0.)), dd = lin(vUv - vec2(0., px.y)), du = lin(vUv + vec2(0., px.y));
            // the depth Laplacian: ~0 on any flat or tilted surface (ground seen at a grazing angle, a wall, a curved
            // torso), large only where depth jumps. Outline the nearer side only, so lines are one pixel and sit on
            // the object in front.
            float lap = (dl + dr + dd + du - 4. * d0) / max(d0, 1.);
            ink = smoothstep(.06, .2, lap) * (1. - smoothstep(60., 160., d0)) * uInk;
          }
        }
        vec3 t = srgb(aces(col));
        // grade, in display space where small offsets look the same in the darks as in the lights
        float l = dot(t, vec3(.2126, .7152, .0722));
        t = mix(vec3(l), t, 1. + .1 * uFx);                                                        // a little more colour
        t += mix(vec3(-.006, .002, .014), vec3(.02, .01, -.012), smoothstep(.2, .8, l)) * uFx * (1. - uNight * .5); // cool shadows, warm lights
        // golden hour: amber highlights, violet shadows, a touch more contrast and bloom-ish lift in the brights
        t += mix(vec3(-.012, -.02, .03), vec3(.07, .025, -.04), smoothstep(.15, .85, l)) * uDusk * (.6 + .4 * uFx);
        t += smoothstep(.7, 1., l) * vec3(.05, .02, -.01) * uDusk;
        t = clamp((t - .5) * (1. + .04 * uFx + .06 * uDusk) + .5, 0., 1.);
        vec3 band = floor(t * 8. + .5) / 8.; t = mix(t, band, .08 * uFx);                          // a hint of cel shading
        t *= 1. - ink * .6;
        t *= 1. - uFx * .18 * smoothstep(.12, .6, r2 * 1.6); // vignette
        t += (h(vUv * uRes) - .5) * .035 * uFx; // grain, after the curve so it reads in the darks too
        gl_FragColor = vec4(t, 1.);
        if (uDbg > 0.) { float d0 = lin(vUv), dr = lin(vUv + vec2(px.x, 0.)); gl_FragColor = vec4(d0 / 50., abs(dr - d0) / max(d0, 1.) * 10., texture2D(tDep, vUv).x, 1.); }
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const pscene = new THREE.Scene(); pscene.add(quad); const pcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const R = realistic(THREE, renderer, U, O, VS);
  function setLevel(n) { level = n; U.uInk.value = n === 2 ? 1 : 0; U.uFx.value = n >= 1 ? 1 : 0; if (rt && (!n || rtKind !== wantKind())) { rt.dispose(); rt = null; } if (n === 3) R.reset(); }
  setLevel(level);
  return {
    get level() { return level; }, setLevel, U, opts: O, R, debug: () => R.debug(), get target() { return rt; },
    render(scene, cam, night = 0) {
      if (!level) { renderer.render(scene, cam); return; }
      renderer.getDrawingBufferSize(size);
      if (!rt || rt.width !== size.x || rt.height !== size.y) { if (rt) rt.dispose(); rtKind = wantKind(); rt = makeTarget(rtKind); }
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
      U.tCol.value = rt.texture; U.tDep.value = rt.depthTexture; U.uRes.value.set(size.x, size.y); U.uTime.value = (U.uTime.value + 0.016) % 100;
      U.uNear.value = cam.near; U.uFar.value = cam.far; U.uExp.value = renderer.toneMappingExposure; U.uNight.value = night;
      if (level === 3) { R.render(rt, cam, size, night); return; }
      quad.material = mat; renderer.render(pscene, pcam);
    },
  };
}

// ---------------------------------------------------------------- the realistic look
// Unreal's filmic tone curve (FilmToneMap, default Slope .88 Toe .55 Shoulder .26 BlackClip 0 WhiteClip .04), applied in
// ACES AP1 like Unreal does; the constants that only depend on those five numbers are worked out here.
const FILM = (() => {
  const slope = 0.88, toe = 0.55, shoulder = 0.26, black = 0, white = 0.04;
  const toeScale = 1 + black - toe, shoulderScale = 1 + white - shoulder, inMatch = 0.18, outMatch = 0.18;
  const bt = (outMatch + black) / toeScale - 1;
  const toeMatch = Math.log10(inMatch) - 0.5 * Math.log((1 + bt) / (1 - bt)) * (toeScale / slope);
  const straightMatch = (1 - toe) / slope - toeMatch, shoulderMatch = shoulder / slope - straightMatch;
  const f = x => x.toFixed(6);
  return /* glsl */`
    vec3 filmic(vec3 lin) { // linear sRGB in, display-linear sRGB out
      const mat3 toAP1 = mat3(.6131178, .0699341, .0204630, .3411820, .9181030, .1067687, .0457873, .0119328, .8727159);
      const mat3 fromAP1 = mat3(1.7048873, -.1295209, -.0241271, -.6241573, 1.1383993, -.1246206, -.0808868, -.0087792, 1.1488221);
      vec3 c = max(toAP1 * lin, 1e-6), L = log(c) / log(10.);
      vec3 straight = ${f(slope)} * (L + ${f(straightMatch)});
      vec3 toeC = ${f(-black)} + ${f(2 * toeScale)} / (1. + exp(${f(-2 * slope / toeScale)} * (L - ${f(toeMatch)})));
      vec3 shC = ${f(1 + white)} - ${f(2 * shoulderScale)} / (1. + exp(${f(2 * slope / shoulderScale)} * (L - ${f(shoulderMatch)})));
      toeC = mix(straight, toeC, step(L, vec3(${f(toeMatch)})));
      shC = mix(straight, shC, step(vec3(${f(shoulderMatch)}), L));
      vec3 t = clamp((L - ${f(toeMatch)}) / ${f(shoulderMatch - toeMatch)}, 0., 1.);
      ${shoulderMatch < toeMatch ? 't = 1. - t;' : ''}
      t = (3. - 2. * t) * t * t;
      vec3 tone = mix(toeC, shC, t);
      tone = mix(vec3(dot(tone, vec3(.2722287, .6740818, .0536895))), tone, .93); // Unreal's post desaturate
      return max(fromAP1 * max(tone, 0.), 0.);
    }`;
})();

function realistic(THREE, renderer, U, O, VS) {
  const HF = THREE.HalfFloatType;
  const fsq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); fsq.frustumCulled = false;
  const qs = new THREE.Scene(); qs.add(fsq); const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pass = (m, target, clear = true) => { fsq.material = m; renderer.setRenderTarget(target); const ac = renderer.autoClear; renderer.autoClear = clear; renderer.render(qs, qc); renderer.autoClear = ac; };
  const sm = (fs, uniforms, extra = {}) => new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: 'precision highp float;\nvarying vec2 vUv;\n' + fs, depthTest: false, depthWrite: false, ...extra });

  // ---- bloom mip chain: mip 0 is half resolution. Its alpha carries log2 luminance down the chain for the exposure.
  const MIPS = 6;
  const mips = [];
  const down0U = { tSrc: { value: null }, uTx: { value: new THREE.Vector2() } };
  // the 13-tap filter from Call of Duty: Advanced Warfare (Jimenez 2014). On the first step each 2x2 group is weighted by
  // 1 / (1 + luma) (Karis) so a single hot pixel (a sun glint) can't flicker into a big blob.
  const TAPS = /* glsl */`
    vec3 A = texture2D(tSrc, vUv + uTx * vec2(-2., 2.)).rgb, B = texture2D(tSrc, vUv + uTx * vec2(0., 2.)).rgb, C = texture2D(tSrc, vUv + uTx * vec2(2., 2.)).rgb;
    vec3 D = texture2D(tSrc, vUv + uTx * vec2(-2., 0.)).rgb, E = texture2D(tSrc, vUv).rgb, F = texture2D(tSrc, vUv + uTx * vec2(2., 0.)).rgb;
    vec3 G = texture2D(tSrc, vUv + uTx * vec2(-2., -2.)).rgb, H = texture2D(tSrc, vUv + uTx * vec2(0., -2.)).rgb, I = texture2D(tSrc, vUv + uTx * vec2(2., -2.)).rgb;
    vec3 J = texture2D(tSrc, vUv + uTx * vec2(-1., 1.)).rgb, K = texture2D(tSrc, vUv + uTx * vec2(1., 1.)).rgb;
    vec3 L = texture2D(tSrc, vUv + uTx * vec2(-1., -1.)).rgb, M = texture2D(tSrc, vUv + uTx * vec2(1., -1.)).rgb;`;
  const down0 = sm(/* glsl */`
    uniform sampler2D tSrc; uniform vec2 uTx;
    float lu(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
    vec3 kw(vec3 a, vec3 b, vec3 c, vec3 d) { vec3 s = (a + b + c + d) * .25; return s / (1. + lu(s)); }
    void main() {
      ${TAPS}
      vec3 s = kw(J, K, L, M) * .5 + (kw(A, B, D, E) + kw(B, C, E, F) + kw(D, E, G, H) + kw(E, F, H, I)) * .125;
      s = s / max(1. - lu(s), 1e-3);                                                  // undo the Karis weight on the result
      s = min(s, vec3(60.));                                                          // half floats: keep the sun finite
      float ll = (log2(lu(E) + 1e-4) + log2(lu(J) + 1e-4) + log2(lu(K) + 1e-4) + log2(lu(L) + 1e-4) + log2(lu(M) + 1e-4)) * .2;
      gl_FragColor = vec4(s, ll);
    }`, down0U);
  const downU = { tSrc: { value: null }, uTx: { value: new THREE.Vector2() } };
  const down = sm(/* glsl */`
    uniform sampler2D tSrc; uniform vec2 uTx;
    void main() {
      ${TAPS}
      float aE = texture2D(tSrc, vUv).a, aJ = texture2D(tSrc, vUv + uTx * vec2(-1., 1.)).a, aK = texture2D(tSrc, vUv + uTx * vec2(1., 1.)).a;
      float aL = texture2D(tSrc, vUv + uTx * vec2(-1., -1.)).a, aM = texture2D(tSrc, vUv + uTx * vec2(1., -1.)).a;
      vec3 s = E * .125 + (A + C + G + I) * .03125 + (B + D + F + H) * .0625 + (J + K + L + M) * .125;
      gl_FragColor = vec4(s, (aJ + aK + aL + aM) * .2 + aE * .2);
    }`, downU);
  // upsample: a 3x3 tent of the smaller mip added onto the bigger one (alpha left alone: it's the luminance)
  const upU = { tSrc: { value: null }, uTx: { value: new THREE.Vector2() } };
  const up = sm(/* glsl */`
    uniform sampler2D tSrc; uniform vec2 uTx;
    void main() {
      vec3 s = texture2D(tSrc, vUv).rgb * 4.;
      s += (texture2D(tSrc, vUv + vec2(uTx.x, 0.)).rgb + texture2D(tSrc, vUv - vec2(uTx.x, 0.)).rgb + texture2D(tSrc, vUv + vec2(0., uTx.y)).rgb + texture2D(tSrc, vUv - vec2(0., uTx.y)).rgb) * 2.;
      s += texture2D(tSrc, vUv + uTx).rgb + texture2D(tSrc, vUv - uTx).rgb + texture2D(tSrc, vUv + vec2(uTx.x, -uTx.y)).rgb + texture2D(tSrc, vUv + vec2(-uTx.x, uTx.y)).rgb;
      gl_FragColor = vec4(s / 16., 0.);
    }`, upU, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });

  // ---- eye adaptation: the mean log luminance of a small mip (centre-weighted), and an exposure that eases toward it.
  // Partial (the base exposure the game sets for day and night still counts) and limited, so night stays night.
  const FT = renderer.extensions.has('EXT_color_buffer_float') ? THREE.FloatType : HF;
  const expT = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: FT, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }));
  let expI = 0, reset = true, lastT = 0;
  const adaptU = { tLum: { value: null }, tPrev: { value: null }, uDt: { value: 0 }, uReset: { value: 1 }, uBase: { value: 0 }, uKey: { value: Math.log2(0.16) }, uAdapt: { value: 0.65 }, uLo: { value: -1.4 }, uHi: { value: 1.6 } };
  const adapt = sm(/* glsl */`
    uniform sampler2D tLum, tPrev; uniform float uDt, uReset, uBase, uKey, uAdapt, uLo, uHi;
    void main() {
      float s = 0., w = 0.;
      for (int y = 0; y < 6; y++) for (int x = 0; x < 8; x++) {
        vec2 uv = (vec2(float(x), float(y)) + .5) / vec2(8., 6.), d = uv - vec2(.5, .45);
        float k = exp(-dot(d, d) * 6.); s += texture2D(tLum, uv).a * k; w += k;
      }
      float L = s / w, full = uKey - L;
      float tgt = clamp(mix(uBase, full, uAdapt), uBase + uLo, uBase + uHi);
      float prev = texture2D(tPrev, vec2(.5)).r;
      // into the dark slowly, back into the light quickly (the eye does the same)
      float ev = uReset > .5 ? tgt : prev + (tgt - prev) * (1. - exp(-uDt * (tgt > prev ? 1.1 : 2.6)));
      gl_FragColor = vec4(ev, L, tgt, 1.);
    }`, adaptU);

  // ---- ambient occlusion (optional): half resolution, from the depth buffer only, then a depth-aware blur
  let aoT = null;
  const aoU = { tDep: { value: null }, uFull: { value: new THREE.Vector2() }, uP: { value: new THREE.Vector4() }, uRadius: { value: 1.6 }, uFrame: { value: 0 } };
  // every lookup snaps to the centre of a full-resolution depth texel, and the position is rebuilt at that same centre.
  // A half-resolution pixel's centre sits exactly on the corner of four depth texels: left to rounding, the texel picked
  // flips in bands across the screen and the rebuilt normals tilt, which shades flat walls. Each AO pixel takes the
  // top-left texel of its 2x2 instead.
  const LINZ = /* glsl */`
    uniform sampler2D tDep; uniform vec4 uP; uniform vec2 uFull; // P[0][0], P[1][1], near, far; depth texture size
    vec3 vpos(vec2 uv) {
      uv = (floor(uv * uFull) + .5) / uFull;
      float z = texture2D(tDep, uv).x * 2. - 1.; z = 2. * uP.z * uP.w / (uP.w + uP.z - z * (uP.w - uP.z));
      vec2 n = uv * 2. - 1.; return vec3(n.x * z / uP.x, n.y * z / uP.y, -z);
    }`;
  const aoM = sm(/* glsl */`
    ${LINZ}
    uniform float uRadius, uFrame;
    void main() {
      vec2 uv = (floor(gl_FragCoord.xy) * 2. + .5) / uFull; // this pixel's own depth texel (top-left of its 2x2)
      vec3 P = vpos(uv); float z = -P.z;
      if (z > 160.) { gl_FragColor = vec4(1., z, 0., 1.); return; }
      vec2 px = 1. / uFull;
      vec3 pr = vpos(uv + vec2(px.x, 0.)), pl = vpos(uv - vec2(px.x, 0.)), pu = vpos(uv + vec2(0., px.y)), pd = vpos(uv - vec2(0., px.y));
      vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl, dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
      vec3 N = normalize(cross(dx, dy));
      float rad = min(uRadius * (1. + z * .012), 4.), r2 = rad * rad;
      float rs = rad * uP.x / z * .5;                               // the radius in uv units
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
      float occ = 0.;
      for (int i = 0; i < 10; i++) {
        float a = (float(i) + ign) / 10., th = a * 22.0 + ign * 6.2832;
        vec2 o = vec2(cos(th), sin(th) * uFull.x / uFull.y) * rs * (a * .9 + .1);
        vec3 v = vpos(uv + o) - P; float vv = dot(v, v);
        // Scalable AO (McGuire 2012): the bias grows with distance, so a flat wall at a glancing angle (where depth
        // precision runs out first) doesn't occlude itself
        occ += max(dot(v, N) - .02 - z * .0025, 0.) / (sqrt(vv) + .1) * max(1. - vv / r2, 0.);
      }
      float ao = clamp(1. - occ / 10. * 2.2, 0., 1.);
      ao = mix(ao, 1., smoothstep(90., 160., z));
      gl_FragColor = vec4(ao, z, 0., 1.);
    }`, aoU);
  const blurU = { tAO: { value: null }, uTx: { value: new THREE.Vector2() } };
  const blurM = sm(/* glsl */`
    uniform sampler2D tAO; uniform vec2 uTx;
    void main() { // 4x4 taps around the pixel, each weighted by how close its depth is
      vec2 c = texture2D(tAO, vUv).rg; float s = 0., w = 0.;
      for (int y = -2; y < 2; y++) for (int x = -2; x < 2; x++) {
        vec2 q = texture2D(tAO, vUv + (vec2(float(x), float(y)) + .5) * uTx).rg;
        float k = max(0., 1. - abs(q.y - c.y) / (c.y * .06 + .15)); s += q.x * k; w += k;
      }
      gl_FragColor = vec4(w > 0. ? s / w : c.x, c.y, 0., 1.);
    }`, blurU);

  // ---- composite
  const CU = {
    tCol: U.tCol, uRes: U.uRes, uTime: U.uTime, uNight: U.uNight, uDusk: U.uDusk, tBloom: { value: null }, tExp: { value: null }, tAO: { value: null },
    uBloom: { value: 0.05 }, uBloomN: { value: 1 / MIPS }, uExpK: { value: 1 }, uAO: { value: 0 }, uDbg: { value: 0 },
  };
  const comp = sm(/* glsl */`
    uniform sampler2D tCol, tBloom, tExp, tAO; uniform vec2 uRes; uniform float uTime, uNight, uDusk, uBloom, uBloomN, uExpK, uAO, uDbg;
    vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 7.31) * 43758.5453); }
    ${FILM}
    void main() {
      vec2 px = 1. / uRes, c = vUv - .5; float r2 = dot(c, c);
      vec3 col = texture2D(tCol, vUv).rgb;
      vec3 nb = texture2D(tCol, vUv + vec2(px.x, 0.)).rgb + texture2D(tCol, vUv - vec2(px.x, 0.)).rgb + texture2D(tCol, vUv + vec2(0., px.y)).rgb + texture2D(tCol, vUv - vec2(0., px.y)).rgb;
      col = max(col + (col - nb * .25) * .18, 0.);                                      // light sharpening
      if (uAO > 0.) col *= mix(1., texture2D(tAO, vUv).r, uAO);
      col = mix(col, texture2D(tBloom, vUv).rgb * uBloomN, uBloom);                     // energy-preserving bloom
      col *= exp2(texture2D(tExp, vec2(.5)).r) * uExpK;
      col *= mix(vec3(1.), vec3(1.1, 1., .86), uDusk);                                   // golden-hour white balance
      vec3 t = filmic(col);
      float l = dot(t, vec3(.2126, .7152, .0722));
      t = max(mix(vec3(l), t, 1.12 + .06 * uDusk), 0.);                                 // a little more colour
      // after dark the eye sees less colour and shifts blue (Purkinje); at golden hour the highlights warm a touch
      t = mix(t, vec3(l) * vec3(.86, .96, 1.18), uNight * .3 * (1. - smoothstep(.04, .35, l)));
      t *= mix(vec3(1.), vec3(1.05, 1., .93), uDusk * smoothstep(.15, .8, l));
      t = srgb(clamp(t, 0., 1.));
      t *= 1. - .14 * smoothstep(.1, .62, r2 * 1.6);                                     // vignette
      t += (h(vUv * uRes) - .5) * .022;                                                  // grain (and no banding)
      gl_FragColor = vec4(t, 1.);
      if (uDbg > 0.) gl_FragColor = vec4(vec3(uAO > 0. ? texture2D(tAO, vUv).r : 1.), 1.); // the occlusion alone
    }`, CU);

  const _v4 = new THREE.Vector4();
  let aoK = 0.85;
  function ensure(size) {
    const w = Math.max(1, size.x >> 1), h = Math.max(1, size.y >> 1);
    if (mips.length && mips[0].width === w && mips[0].height === h && !O.ao === !aoT) return;
    for (const m of mips) m.dispose(); mips.length = 0;
    for (let i = 0; i < MIPS; i++) mips.push(new THREE.WebGLRenderTarget(Math.max(1, w >> i), Math.max(1, h >> i), { type: HF, depthBuffer: false }));
    if (aoT) for (const t of aoT) t.dispose(); aoT = null;
    if (O.ao) aoT = [0, 1].map(() => new THREE.WebGLRenderTarget(w, h, { type: HF, depthBuffer: false }));
  }
  return {
    reset() { reset = true; },
    set ao(k) { aoK = k; }, get ao() { return aoK; },
    render(rt, cam, size, night) {
      ensure(size);
      const now = performance.now(), dt = lastT ? Math.min(0.25, (now - lastT) / 1000) : 0; lastT = now;
      // bloom chain down
      down0U.tSrc.value = rt.texture; down0U.uTx.value.set(1 / size.x, 1 / size.y); pass(down0, mips[0]);
      for (let i = 1; i < MIPS; i++) { downU.tSrc.value = mips[i - 1].texture; downU.uTx.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height); pass(down, mips[i]); }
      // exposure, from the second smallest mip (about 20 x 10)
      adaptU.tLum.value = mips[MIPS - 2].texture; adaptU.tPrev.value = expT[expI].texture; adaptU.uDt.value = dt; adaptU.uReset.value = reset ? 1 : 0;
      adaptU.uBase.value = Math.log2(renderer.toneMappingExposure * 1.05); adaptU.uHi.value = 1.6 - 1.25 * night; // night stays night
      expI ^= 1; pass(adapt, expT[expI]); reset = false;
      // bloom chain up
      for (let i = MIPS - 2; i >= 0; i--) { upU.tSrc.value = mips[i + 1].texture; upU.uTx.value.set(1 / mips[i + 1].width, 1 / mips[i + 1].height); pass(up, mips[i], false); }
      // ambient occlusion
      if (aoT && rt.depthTexture) {
        const e = cam.projectionMatrix.elements;
        aoU.tDep.value = rt.depthTexture; aoU.uFull.value.set(size.x, size.y); aoU.uP.value.copy(_v4.set(e[0], e[5], cam.near, cam.far)); pass(aoM, aoT[0]);
        blurU.tAO.value = aoT[0].texture; blurU.uTx.value.set(1 / aoT[0].width, 1 / aoT[0].height); pass(blurM, aoT[1]);
        CU.tAO.value = aoT[1].texture; CU.uAO.value = aoK;
      } else CU.uAO.value = 0;
      CU.tBloom.value = mips[0].texture; CU.tExp.value = expT[expI].texture;
      CU.uBloom.value = 0.045 + night * 0.035;
      pass(comp, null);
    },
    // what the eye adaptation sees (reads back two 1x1 pixels; for tests, not for every frame)
    debug() {
      const half = FT !== THREE.FloatType, b = half ? new Uint16Array(4) : new Float32Array(4); renderer.readRenderTargetPixels(expT[expI], 0, 0, 1, 1, b);
      const f = half ? THREE.DataUtils.fromHalfFloat : x => x;
      return { ev: +f(b[0]).toFixed(3), meanLog2Lum: +f(b[1]).toFixed(3), target: +f(b[2]).toFixed(3), base: +adaptU.uBase.value.toFixed(3) };
    },
    U: { CU, adaptU, aoU },
  };
}
