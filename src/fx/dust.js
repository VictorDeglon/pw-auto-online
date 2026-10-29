// Dust in the air: fine motes drifting round the camera on the wind, lit by the sun. They scatter light forward, so
// they show most when you look into the sun (golden hour on a dirt lot), hardly at all with the sun behind you or in
// shade, and fade with rain and darkness. One draw call.
//   const dust = createDust(THREE, scene)   dust.update(dt, camera, sunDir, sunColor, amount 0..1, wind)
export function createDust(THREE, scene, n = 900, R = 22) {
  const P = new Float32Array(n * 3), S = new Float32Array(n);
  for (let i = 0; i < n; i++) { P[i * 3] = (Math.random() - 0.5) * 2 * R; P[i * 3 + 1] = Math.random() * R * 0.6; P[i * 3 + 2] = (Math.random() - 0.5) * 2 * R; S[i] = Math.random(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('seed', new THREE.BufferAttribute(S, 1));
  const U = { uCam: { value: new THREE.Vector3() }, uOff: { value: new THREE.Vector3() }, uR: { value: R }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uCol: { value: new THREE.Color(1, 0.9, 0.7) },
    uAmt: { value: 0 }, uTime: { value: 0 }, uScale: { value: 400 } };
  const m = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float seed; uniform vec3 uCam, uOff, uSun; uniform float uR, uTime, uScale; varying float vA;
      void main() {
        vec3 q = position + uOff + vec3(sin(uTime * .3 + seed * 40.) * .6, sin(uTime * .21 + seed * 17.) * .35, cos(uTime * .27 + seed * 23.) * .6);
        vec3 p; p.xz = mod(q.xz - uCam.xz + uR, 2. * uR) - uR; p.y = mod(q.y, uR * .6) - uR * .15; // a box that travels with you
        vec3 w = uCam + p; vec4 mv = viewMatrix * vec4(w, 1.); gl_Position = projectionMatrix * mv;
        float d = -mv.z; vec3 v = normalize(w - cameraPosition);
        float ph = pow(max(dot(v, uSun), 0.), 6.) * 2.2 + .12;                       // forward scattering toward the sun
        vA = ph * smoothstep(uR, uR * .55, length(p.xz)) * smoothstep(.3, 1.5, d) * (.4 + .6 * fract(seed * 7.13));
        gl_PointSize = clamp((.018 + .03 * seed) * uScale / max(d, .1), 1., 6.);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform float uAmt; varying float vA;
      void main() { vec2 c = gl_PointCoord - .5; float r = dot(c, c); if (r > .25) discard; gl_FragColor = vec4(uCol * vA * uAmt * (1. - r * 4.), 1.); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 10; scene.add(pts);
  const off = new THREE.Vector3();
  return {
    update(dt, cam, sunDir, sunCol, amount, wind = [0.6, 0.2]) {
      U.uTime.value += dt; off.x += wind[0] * dt; off.z += wind[1] * dt; off.y += 0.05 * dt;
      U.uCam.value.copy(cam.position); U.uOff.value.copy(off); U.uSun.value.copy(sunDir); U.uCol.value.copy(sunCol).multiplyScalar(0.06);
      U.uAmt.value = amount; U.uScale.value = window.innerHeight * 0.9; pts.visible = amount > 0.01;
    },
  };
}
