// Light in the air (Medium and up): a thin mist lying over the land, lit by the sun only where the sun's shadow map
// says it reaches, so beams stream between trunks, under branches, past roofs and off ridges, from any angle (the
// composite's screen-space rays only work with the sun in the frame). Each pixel of a reduced-resolution target
// marches its view ray through the mist, to what it hits or at most uMed.w metres, testing the shadow map at each step
// (steps packed close to the camera, where shafts are big on screen), and integrates the light scattered toward the
// eye and what the mist lets through (Hillaire's energy-conserving step: S += T * L * (1 - e^-σΔt), all extinction
// is scattering). The sun's part has a forward lobe (Henyey-Greenstein), so looking toward a low sun the mist glows;
// the sky's part (uAmb, the haze colour src/atmos.js uses) keeps the mist pale in the shade. Its density pools low
// (an exponential in height over uMed.z) and is broken up by slow noise drifting with the wind.
// index.html (updateAtmos) sets how much there is by the hour and the weather: thick and pale on a dawn with the
// marine layer, gold at golden hour, hardly any at a clear noon, heavy in fog, the sun's part going as clouds cover it.
// The shadow test is one tap per step, jittered by a texel or so, and a depth-aware 3 x 3 blur at the low resolution
// turns the steps' noise and the leaves' hard little shadows into soft beams. The composite (src/post.js) brings it up
// to full resolution along depth edges and lays it over the scene: colour * alpha + rgb.
//   const VOL = createVolumetrics(THREE, renderer, { steps, div })
//   VOL.render(depthTexture, camera, size, light) -> the target (rgb: light scattered toward the eye, a: transmittance)
//   VOL.U.*: uMed (density at uMed.z, 1 / height scale, reference height, max distance), uSunCol, uAmb, uG, uNoise
export function createVolumetrics(THREE, renderer, { steps = 16, div = 2 } = {}) {
  const U = {
    tDep: { value: null }, tSh: { value: null }, uIPV: { value: new THREE.Matrix4() }, uShM: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(0, 0, 0) }, uAmb: { value: new THREE.Color(0, 0, 0) },
    uMed: { value: new THREE.Vector4(0.001, 1 / 40, 0, 150) }, uNoise: { value: new THREE.Vector4(0.018, 0.55, 0, 0) }, uG: { value: 0.65 }, uFrame: { value: 0 },
    uShTx: { value: 1 / 1024 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false, defines: { STEPS: steps },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: /* glsl */`
      precision highp float;
      #include <packing>
      uniform sampler2D tDep, tSh; uniform mat4 uIPV, uShM; uniform vec3 uCam, uSunDir, uSunCol, uAmb; uniform vec4 uMed, uNoise; uniform float uG, uFrame, uShTx;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
      void main() {
        float dz = texture2D(tDep, vUv).x;
        vec4 wp = uIPV * vec4(vUv * 2. - 1., dz * 2. - 1., 1.); vec3 rd = wp.xyz / wp.w - uCam; float D = length(rd); rd /= max(D, 1e-4);
        if (dz >= 1.) D = 1e6; // sky: the whole march
        float L = min(D, uMed.w);
        // interleaved gradient noise, rolled each frame: the steps' banding turns to fine grain the upsample and the
        // composite's grain hide
        float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uFrame * 5.588238, vec2(.06711056, .00583715))));
        float cs = dot(rd, uSunDir), g = uG, g2 = g * g;
        float ph = mix((1. - g2) / (12.566371 * pow(max(1. + g2 - 2. * g * cs, 1e-4), 1.5)), .0795775, .25); // HG, a quarter isotropic
        vec3 Ls = uSunCol * ph, S = vec3(0.); float T = 1.;
        for (int i = 0; i < STEPS; i++) {
          float a = float(i) / float(STEPS), b = float(i + 1) / float(STEPS), f = (float(i) + j) / float(STEPS);
          float dt = L * (b * b - a * a), t = L * f * f;
          vec3 p = uCam + rd * t;
          vec2 q = p.xz * uNoise.x + uNoise.zw + p.y * uNoise.x * .7;
          float n = vnoise(q) * .65 + vnoise(q * 2.7 + 5.2) * .35;
          float dens = uMed.x * exp(-max(p.y - uMed.z, 0.) * uMed.y) * max(1. - uNoise.y + uNoise.y * 2. * n, 0.);
          vec4 sc = uShM * vec4(p, 1.); float vis = 1.;
          sc.xy += (vec2(fract(j * 7.31 + float(i) * .618), fract(j * 3.17 + float(i) * .382)) - .5) * uShTx * 2.5;
          if (sc.x > 0. && sc.x < 1. && sc.y > 0. && sc.y < 1. && sc.z < 1.) vis = step(sc.z - .0015, unpackRGBAToDepth(texture2D(tSh, sc.xy)));
          float tr = exp(-dens * dt);
          S += T * (Ls * vis + uAmb) * (1. - tr); T *= tr;
        }
        gl_FragColor = vec4(min(S, vec3(60.)), T);
      }`,
  });
  const BU = { tVol: { value: null }, tDep: { value: null }, uTx: { value: new THREE.Vector2() }, uZ: { value: new THREE.Vector2() } };
  const blur = new THREE.ShaderMaterial({
    uniforms: BU, depthTest: false, depthWrite: false, vertexShader: mat.vertexShader,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tVol, tDep; uniform vec2 uTx, uZ; varying vec2 vUv;
      float lz(float d) { float z = d * 2. - 1.; return 2. * uZ.x * uZ.y / (uZ.y + uZ.x - z * (uZ.y - uZ.x)); }
      void main() { // 3 x 3, each tap counted as much as its depth matches this one's (a beam doesn't smear onto the trunk in front)
        float z0 = lz(texture2D(tDep, vUv).x); vec4 s = vec4(0.); float w = 0.;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 tc = vUv + vec2(float(x), float(y)) * uTx;
          float k = (x == 0 && y == 0 ? 1. : x == 0 || y == 0 ? .7 : .5) * max(.02, 1. - abs(lz(texture2D(tDep, tc).x) - z0) / (z0 * .12));
          s += texture2D(tVol, tc) * k; w += k;
        }
        gl_FragColor = s / w;
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const qs = new THREE.Scene(); qs.add(quad); const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let rt = null, rt2 = null;
  return {
    U, div,
    get target() { return rt2; },
    render(depth, cam, size, light) {
      const w = Math.max(1, Math.round(size.x / div)), h = Math.max(1, Math.round(size.y / div));
      if (!rt || rt.width !== w || rt.height !== h) {
        if (rt) { rt.dispose(); rt2.dispose(); }
        rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }); rt2 = rt.clone();
      }
      U.tDep.value = depth; U.tSh.value = light.shadow.map.texture; U.uShM.value.copy(light.shadow.matrix); U.uShTx.value = 1 / light.shadow.mapSize.x;
      U.uIPV.value.copy(cam.matrixWorld).multiply(cam.projectionMatrixInverse); U.uCam.value.setFromMatrixPosition(cam.matrixWorld);
      U.uFrame.value = (U.uFrame.value + 1) % 64;
      quad.material = mat; renderer.setRenderTarget(rt); renderer.render(qs, qc);
      BU.tVol.value = rt.texture; BU.tDep.value = depth; BU.uTx.value.set(1 / w, 1 / h); BU.uZ.value.set(cam.near, cam.far);
      quad.material = blur; renderer.setRenderTarget(rt2); renderer.render(qs, qc);
      return rt2;
    },
    dispose() { if (rt) { rt.dispose(); rt2.dispose(); } rt = rt2 = null; mat.dispose(); blur.dispose(); },
  };
}
