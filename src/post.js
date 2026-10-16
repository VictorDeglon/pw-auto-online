// The look: half photo-real, half cartoon. One full-screen pass after the scene renders into an HDR target:
//   ink      dark outlines where depth jumps (cars, people, buildings, poles) within ~150 m, fading with distance
//   grade    ACES, a little extra saturation, teal shadows / warm highlights, a hint of cel banding
//   finish   light sharpening, vignette, film grain, a touch of chromatic fringe at the screen edge
// level 0: off (render straight to the screen), 1: grade + finish, 2: everything.
//   const post = createPost(THREE, renderer, camera, level)   post.render(scene, camera)   post.setLevel(n)
export function createPost(THREE, renderer, camera, level = 2) {
  const size = new THREE.Vector2();
  let rt = null;
  // ink reads the depth texture, and a multisampled target's depth isn't reliably resolved into one: no MSAA then
  // (the outlines hide most of the jaggies anyway); clean mode keeps 4x MSAA
  function makeTarget() {
    renderer.getDrawingBufferSize(size);
    const t = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: renderer.capabilities.isWebGL2 && level < 2 ? 4 : 0 });
    t.depthTexture = new THREE.DepthTexture(size.x, size.y); t.depthTexture.type = THREE.UnsignedIntType;
    return t;
  }
  const U = {
    tCol: { value: null }, tDep: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 },
    uNear: { value: camera.near }, uFar: { value: camera.far }, uExp: { value: 1 }, uInk: { value: 1 }, uFx: { value: 1 }, uNight: { value: 0 }, uDbg: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tCol, tDep; uniform vec2 uRes; uniform float uTime, uNear, uFar, uExp, uInk, uFx, uNight, uDbg; varying vec2 vUv;
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
        t = clamp((t - .5) * (1. + .04 * uFx) + .5, 0., 1.);
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
  function setLevel(n) { const msaa = (level < 2) !== (n < 2); level = n; U.uInk.value = n >= 2 ? 1 : 0; U.uFx.value = n >= 1 ? 1 : 0; if ((!n || msaa) && rt) { rt.dispose(); rt = null; } }
  setLevel(level);
  return {
    get level() { return level; }, setLevel, U,
    render(scene, cam, night = 0) {
      if (!level) { renderer.render(scene, cam); return; }
      renderer.getDrawingBufferSize(size);
      if (!rt || rt.width !== size.x || rt.height !== size.y) { if (rt) rt.dispose(); rt = makeTarget(); }
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
      U.tCol.value = rt.texture; U.tDep.value = rt.depthTexture; U.uRes.value.set(size.x, size.y); U.uTime.value = (U.uTime.value + 0.016) % 100;
      U.uNear.value = cam.near; U.uFar.value = cam.far; U.uExp.value = renderer.toneMappingExposure; U.uNight.value = night;
      renderer.render(pscene, pcam);
    },
  };
}
