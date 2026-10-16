// The look: half photo-real, half cartoon. One full-screen pass after the scene renders into an HDR target:
//   ink      dark outlines where depth jumps (cars, people, buildings, poles) within ~150 m, fading with distance
//   grade    ACES, a little extra saturation, teal shadows / warm highlights, a hint of cel banding
//   finish   light sharpening, vignette, film grain, a touch of chromatic fringe at the screen edge
// level 0: off (render straight to the screen), 1: grade + finish, 2: everything.
//   const post = createPost(THREE, renderer, camera, level)   post.render(scene, camera)   post.setLevel(n)
export function createPost(THREE, renderer, camera, level = 2) {
  const size = new THREE.Vector2();
  let rt = null;
  function makeTarget() {
    renderer.getDrawingBufferSize(size);
    const t = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
    t.depthTexture = new THREE.DepthTexture(size.x, size.y); t.depthTexture.type = THREE.UnsignedIntType;
    return t;
  }
  const U = {
    tCol: { value: null }, tDep: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 },
    uNear: { value: camera.near }, uFar: { value: camera.far }, uExp: { value: 1 }, uInk: { value: 1 }, uFx: { value: 1 }, uNight: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tCol, tDep; uniform vec2 uRes; uniform float uTime, uNear, uFar, uExp, uInk, uFx, uNight; varying vec2 vUv;
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
            float e = max(max(abs(dl - d0), abs(dr - d0)), max(abs(dd - d0), abs(du - d0))) / max(d0, 1.);
            ink = smoothstep(.04, .14, e) * (1. - smoothstep(60., 160., d0)) * uInk;
          }
        }
        vec3 t = aces(col);
        // grade: saturation, split tone, gentle cel banding, contrast
        float l = dot(t, vec3(.2126, .7152, .0722));
        t = mix(vec3(l), t, 1.14);
        t += mix(vec3(-.012, .006, .03), vec3(.035, .016, -.02), smoothstep(.15, .75, l)) * (1. - uNight * .5);
        vec3 band = floor(t * 7. + .5) / 7.; t = mix(t, band, .1 * uFx);
        t = clamp((t - .5) * 1.05 + .5, 0., 1.);
        t *= 1. - ink * .75;
        t *= 1. - uFx * .32 * smoothstep(.08, .55, r2 * 1.6); // vignette
        t = srgb(t);
        t += (h(vUv * uRes) - .5) * .035 * uFx; // grain, after the curve so it reads in the darks too
        gl_FragColor = vec4(t, 1.);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const pscene = new THREE.Scene(); pscene.add(quad); const pcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  function setLevel(n) { level = n; U.uInk.value = n >= 2 ? 1 : 0; U.uFx.value = n >= 1 ? 1 : 0; if (!n && rt) { rt.dispose(); rt = null; } }
  setLevel(level);
  return {
    get level() { return level; }, setLevel,
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
