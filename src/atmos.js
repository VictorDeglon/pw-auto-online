// Atmosphere for every material: exponential height fog plus aerial perspective, in place of three's linear fog.
// Patches three's fog shader chunks, so the built-in materials, the patched ones (ground, water, plants) and any
// ShaderMaterial that includes the fog chunks all get it, with no per-material work.
//   - haze: thick near the valley floor, thinning with height (an exponential in y), so it pools low in town and
//     the view down from a hill looks into it. Lit by the sky, and toward the sun by the sun (Mie forward
//     scattering): at golden hour the haze glows warm on the sun's side.
//   - air: thin and even, blue-grey (Rayleigh); it is what turns the far hills blue.
//   - the end of the view still fades into the horizon colour (scene.fog.near/far), so the world's edge never shows.
// The extra uniforms are shared arrays, added to each material's uniforms when three builds its program
// (Material.onBuild), so nothing recompiles when they change.
//   const ATM = createAtmosphere(THREE)   ATM.update({ ... })   (index.html, updateWeather)
export function createAtmosphere(THREE) {
  // haze: density at y = 0, 1 / height scale, max opacity; air: density, sun-lobe strength, end-fade softness
  const P = new Float32Array([0.0006, 1 / 140, 1, 0]);
  const Q = new Float32Array([0.00022, 1, 0.7, 0]);
  const SUN = new Float32Array([0, 1, 0, 0.72]);   // direction to the sun, Mie g
  const SCOL = new Float32Array([1, 0.9, 0.7]);    // sunlight on the haze
  const HCOL = new Float32Array([0.6, 0.66, 0.72]); // the haze lit by the sky
  const ACOL = new Float32Array([0.45, 0.55, 0.7]); // the air
  const UNI = { fogP: { value: P }, fogQ: { value: Q }, fogSun: { value: SUN }, fogSunCol: { value: SCOL }, fogHaze: { value: HCOL }, fogAir: { value: ACOL } };

  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogRay;
#endif`;
  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogRay = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz; // camera to vertex, in world space
#endif`;
  C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogRay;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform vec4 fogP, fogQ, fogSun; uniform vec3 fogSunCol, fogHaze, fogAir;
  vec3 atmosphere(vec3 col) {
    float d = length(vFogRay); vec3 dir = vFogRay / max(d, 1e-3);
    // haze: the optical depth of an exponential layer along the ray, closed form
    float yc = cameraPosition.y, dy = vFogRay.y * fogP.y;
    float k = abs(dy) < 1e-3 ? 1. - dy * .5 : (1. - exp(-dy)) / dy;
    float tH = fogP.x * exp(-yc * fogP.y) * d * k;
    float tA = fogQ.x * d;
    float T = exp(-(tH + tA));
    // light scattered toward the eye: haze (sky + forward-scattered sun) and air (blue-grey, a little sun)
    float g = fogSun.w, cs = dot(dir, fogSun.xyz), g2 = g * g;
    float mie = (1. - g2) / pow(1. + g2 - 2. * g * cs, 1.5) * .25;
    vec3 inH = fogHaze + fogSunCol * mie * fogQ.y;
    vec3 inA = fogAir + fogSunCol * (.08 + .5 * mie * fogQ.y * .15);
    vec3 ins = (inH * tH + inA * tA) / max(tH + tA, 1e-6);
    col = col * T + ins * (1. - T) * fogP.z;
    // the end of the view: into the horizon colour (with the sun's glow on that side)
    #ifndef FOG_EXP2
      float e = smoothstep(fogNear, fogFar, vFogDepth); e = e * e * (3. - 2. * e); // a long, soft S: the land thins into the horizon, no white wall
      vec3 edge = mix(fogColor * vec3(.86, .9, .97), fogAir, .25) + fogSunCol * mie * fogQ.y * .35; // the far ridges go blue-grey, a shade under the sky's horizon
      col = mix(col, edge, e);
    #endif
    return col;
  }
#endif`;
  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
  gl_FragColor.rgb = atmosphere(gl_FragColor.rgb);
#endif`;

  // hand the shared uniforms to every material that uses fog, as three builds its program
  const base = THREE.Material.prototype.onBuild;
  THREE.Material.prototype.onBuild = function (object, parameters, renderer) {
    if (this.fog && parameters.uniforms) Object.assign(parameters.uniforms, UNI);
    return base.call(this, object, parameters, renderer);
  };

  const _c = new THREE.Color();
  return {
    U: UNI,
    // sunDir: toward the sun. sunCol: the sun's colour x intensity (as lit). haze, air: THREE.Color. density: haze at
    // the valley floor (1 / m). scale: haze height scale (m). air: air density (1 / m). glow: sun lobe strength.
    update({ sunDir, sunCol, haze, air, hazeDensity, hazeScale, airDensity, glow = 1, mieG = 0.72, opacity = 1 }) {
      SUN[0] = sunDir.x; SUN[1] = sunDir.y; SUN[2] = sunDir.z; SUN[3] = mieG;
      SCOL[0] = sunCol.r; SCOL[1] = sunCol.g; SCOL[2] = sunCol.b;
      HCOL[0] = haze.r; HCOL[1] = haze.g; HCOL[2] = haze.b;
      ACOL[0] = air.r; ACOL[1] = air.g; ACOL[2] = air.b;
      P[0] = hazeDensity; P[1] = 1 / hazeScale; P[2] = opacity;
      Q[0] = airDensity; Q[1] = glow;
    },
    color: _c,
  };
}
