// Image-based light from the real sky: the sky dome of src/sky.js (same material, same uniforms, so same clouds, sun
// colour and sunset bands) plus a ground hemisphere, rendered into a small cube map and filtered into a PMREM. That's
// scene.environment: car paint, glass, water and wet roads reflect the sky that's actually overhead, and every
// standard material gets its diffuse sky light from it.
// It refreshes only when the sky has changed noticeably (the sun moved, the weather turned), one cube face per frame
// and the filtering on the seventh, into the same texture, so materials never recompile and no frame takes the whole
// cost. The sun's disc is left out: the sun is the directional light, and a tiny hot spot only adds sparkle noise.
// The sky dome's colours are made to look right as a background, not measured against the sun, so as light the map
// would rival the sun. Its diffuse part has its own intensity (ENV.diffuse, like Unreal's sky light intensity) while
// reflections keep the sky as bright as it looks: three's IBL irradiance is patched to multiply by it.
//   const ENV = createSkyEnv(THREE, renderer, SKYFX, 128)   scene.environment = ENV.texture
//   ENV.update(dt)   every frame (cheap unless it's refreshing)   ENV.diffuse = k
export function createSkyEnv(THREE, renderer, SKYFX, size = 128) {
  const U = SKYFX.U;
  // Rough surfaces also lose most of their reflection to their own micro-shadowing (Unreal takes it from AO as
  // "specular occlusion"); without that a dry road or hillside seen at a low angle turns sky-coloured.
  const DIFF = { value: 0.4 }, ROUGH = { value: 0.4 };
  const C = THREE.ShaderChunk;
  C.envmap_physical_pars_fragment = C.envmap_physical_pars_fragment
    .replace('#ifdef USE_ENVMAP', '#ifdef USE_ENVMAP\n\tuniform float envDiffuse, envRough;')
    .replace('return PI * envMapColor.rgb * envMapIntensity;', 'return PI * envMapColor.rgb * envMapIntensity * envDiffuse;')
    .replace('return envMapColor.rgb * envMapIntensity;', 'return envMapColor.rgb * envMapIntensity * mix( 1.0, envRough, roughness * roughness );');
  if (!C.envmap_physical_pars_fragment.includes('* envDiffuse;') || !C.envmap_physical_pars_fragment.includes('envRough, roughness')) console.warn('[skyenv] IBL patch did not apply');
  const base = THREE.Material.prototype.onBuild;
  THREE.Material.prototype.onBuild = function (object, parameters, r) {
    if (parameters.uniforms) { parameters.uniforms.envDiffuse = DIFF; parameters.uniforms.envRough = ROUGH; }
    return base.call(this, object, parameters, r);
  };
  const cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCam = new THREE.CubeCamera(1, 1000, cubeRT);
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(SKYFX.mesh.geometry, SKYFX.mesh.material); sky.frustumCulled = false; sky.renderOrder = -10;
  // the ground: the lit land near the horizon fading into the haze; darker and browner straight down
  const GU = { gNear: { value: new THREE.Color(0.1, 0.09, 0.07) }, gFar: { value: new THREE.Color(0.3, 0.3, 0.3) }, gHaze: { value: new THREE.Color(0.5, 0.6, 0.7) } };
  const ground = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: GU, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform vec3 gNear, gFar, gHaze; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float y = clamp(-d.y, 0., 1.);
        vec3 c = mix(gFar, gNear, smoothstep(0., .5, y)); c = mix(c, gHaze, exp(-y * 18.) * .85);
        gl_FragColor = vec4(c, 1.); }`,
  }));
  ground.frustumCulled = false; ground.renderOrder = -9;
  scene.add(sky, ground, cubeCam);
  cubeCam.coordinateSystem = renderer.coordinateSystem; cubeCam.updateCoordinateSystem();
  scene.updateMatrixWorld(true);
  const faces = cubeCam.children;
  const pmrem = new THREE.PMREMGenerator(renderer);

  function face(i) {
    const prevT = renderer.getRenderTarget(), prevF = renderer.getActiveCubeFace(), prevM = renderer.getActiveMipmapLevel(), xr = renderer.xr.enabled;
    renderer.xr.enabled = false; U.env.value = 1;
    renderer.setRenderTarget(cubeRT, i); renderer.render(scene, faces[i]);
    U.env.value = 0; renderer.setRenderTarget(prevT, prevF, prevM); renderer.xr.enabled = xr;
  }
  // first one in full, now: scene.environment exists before anything compiles
  for (let i = 0; i < 6; i++) face(i);
  const target = pmrem.fromCubemap(cubeRT.texture);
  const texture = target.texture;

  // what the sky looked like when it was last captured
  const sig = new Float32Array(16), cur = new Float32Array(16);
  function read(a) {
    const s = U.sunDir.value, t = U.top.value, h = U.horizon.value;
    a[0] = s.x * 2; a[1] = s.y * 2; a[2] = s.z * 2; a[3] = t.r; a[4] = t.g; a[5] = t.b; a[6] = h.r; a[7] = h.g; a[8] = h.b;
    a[9] = U.cloud.value; a[10] = U.night.value; a[11] = U.dusk.value; a[12] = U.fog.value; a[13] = U.rain.value; a[14] = U.moonLit.value * 0.5; a[15] = GU.gFar.value.r;
  }
  read(sig);
  let step = -1, since = 0;
  return {
    texture, target,
    get diffuse() { return DIFF.value; }, set diffuse(k) { DIFF.value = k; }, U: { envDiffuse: DIFF, envRough: ROUGH },
    // ground: { near, far, haze } as THREE.Color (radiance of the ground below and toward the horizon, and the haze)
    setGround(near, far, haze) { GU.gNear.value.copy(near); GU.gFar.value.copy(far); GU.gHaze.value.copy(haze); },
    update(dt, force = false) {
      since += dt;
      if (step < 0) {
        read(cur); let d = 0; for (let i = 0; i < 16; i++) d = Math.max(d, Math.abs(cur[i] - sig[i]));
        if (force || (d > 0.025 && since > 1.2) || (d > 0.004 && since > 12)) { step = 0; sig.set(cur); since = 0; }
        else return false;
      }
      if (step < 6) face(step++);
      else { pmrem.fromCubemap(cubeRT.texture, target); step = -1; }
      return true;
    },
    // all at once (tests, and after a jump in time or weather)
    refresh() { read(sig); for (let i = 0; i < 6; i++) face(i); pmrem.fromCubemap(cubeRT.texture, target); step = -1; since = 0; },
  };
}
