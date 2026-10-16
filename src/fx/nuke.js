// The nuke, as a picture (drawn even past the camera's far plane, like the sky, so it towers over the horizon from anywhere in town): a white flash and a light that lights up the whole town, a fireball that swells and climbs,
// a shockwave you can watch go out (a bright ring racing along the ground, a dust wall behind it, and the edge of a
// pressure dome in the air), and a mushroom cloud: a churning stem and a rolling toroidal cap that cools from fire to
// smoke over a minute and a half. All of it is a few meshes and one instanced set of billboard puffs; positions are
// worked out on the CPU each frame (a few hundred puffs).
//   const N = createNukeFX(THREE, scene)   N.spawn(x, y, z)   N.update(dt, camera)   N.active
// Physics (who gets thrown, what burns) lives with the caller; WAVE_SPEED is how fast the ring travels.
export const WAVE_SPEED = 340; // m/s, the visible ring; the blast follows it

export function createNukeFX(THREE, scene, quality = 1) {
  const live = [];
  // ---- puffs: one instanced quad, billboarded in the vertex shader (fewer on slower presets: big soft quads cost fill rate)
  const MAXP = Math.round(420 * Math.min(1, Math.max(0.35, quality)));
  const quad = new THREE.InstancedBufferGeometry(); quad.copy(new THREE.PlaneGeometry(1, 1)); quad.instanceCount = 0;
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 4), 4), iCol = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 4), 4);
  iPos.setUsage(THREE.DynamicDrawUsage); iCol.setUsage(THREE.DynamicDrawUsage); quad.setAttribute('iPos', iPos); quad.setAttribute('iCol', iCol);
  const puffMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0.3, 0.8, 0.2) }, uSky: { value: new THREE.Color(0.75, 0.72, 0.7) } },
    vertexShader: `attribute vec4 iPos; attribute vec4 iCol; varying vec2 vUv; varying vec4 vCol; varying float vH;
      void main(){ vUv = uv; vCol = iCol; vH = iPos.y;
        vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0); float a = iCol.z * 6.2831; mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
        mv.xy += R * position.xy * iPos.w; gl_Position = projectionMatrix * mv; gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99995); }`,
    fragmentShader: `varying vec2 vUv; varying vec4 vCol; varying float vH; uniform vec3 uSky;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 c = vUv - .5; float r = length(c) * 2.;
        float nz = n(vUv * 5. + vCol.z * 40.) * .6 + n(vUv * 11. + vCol.z * 17.) * .4;
        float a = smoothstep(1., .35, r + (nz - .5) * .55) * vCol.y; if (a < .01) discard;
        float heat = vCol.x;
        vec3 fire = mix(vec3(1.0, .32, .05), vec3(1.0, .93, .7), clamp(heat * 1.4 - .3 - r * .5, 0., 1.)) * (1.5 + heat * 3.);
        float lit = .55 + .45 * smoothstep(-.4, .5, -c.y) ; // the top of each puff catches the sky
        vec3 smoke = mix(vec3(.23, .2, .18), uSky * .95, .35) * lit * (.75 + nz * .4);
        vec3 col = mix(smoke, fire, clamp(heat, 0., 1.) * smoothstep(1., .2, r));
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const puffs = new THREE.Mesh(quad, puffMat); puffs.frustumCulled = false; puffs.renderOrder = 3; scene.add(puffs);

  // ---- fireball: a sphere with a boiling emissive surface
  const fireMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uHeat: { value: 1 }, uA: { value: 1 } },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = -mv.xyz; gl_Position = projectionMatrix * mv; gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99995); }`,
    fragmentShader: `uniform float uT, uHeat, uA; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y), mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 p = vP * 3.0 + vec3(0., -uT * 1.4, 0.);
        float b = n(p) * .5 + n(p * 2.1 + 7.) * .3 + n(p * 4.3 - 3.) * .2;
        float rim = pow(1. - abs(dot(normalize(vN), normalize(vV))), 1.5);
        float k = clamp(uHeat * (1.05 - rim * .8) + (b - .5) * 1.3, 0., 1.4);
        vec3 col = mix(vec3(.3, .05, .01), vec3(1., .3, .04), smoothstep(0., .45, k)); col = mix(col, vec3(1., .85, .55), smoothstep(.65, 1.25, k));
        col *= .9 + 1.4 * uHeat; // bright, but not so bright the boiling surface burns out to a flat disc
        col = mix(vec3(.2, .18, .16) * (.6 + b * .5), col, smoothstep(.05, .35, uHeat)); // cools into smoke
        gl_FragColor = vec4(col, uA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  // ---- shockwave pieces
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99995); }`,
    fragmentShader: `uniform float uA; varying vec2 vUv; void main(){ float e = 1. - abs(vUv.y * 2. - 1.); gl_FragColor = vec4(vec3(1., .86, .62) * 2.5 * pow(e, 2.), pow(e, 1.5) * uA);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const domeMat = new THREE.ShaderMaterial({ // the pressure front: only its edge shows (fresnel), like heat shimmer catching the light
    uniforms: { uA: { value: 0.5 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = -mv.xyz; gl_Position = projectionMatrix * mv; gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99995); }`,
    fragmentShader: `uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 4.); gl_FragColor = vec4(vec3(1., .95, .88) * 1.6, f * uA);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const dustMat = new THREE.ShaderMaterial({ // the dust wall the wave kicks up
    uniforms: { uA: { value: 1 }, uT: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99995); }`,
    fragmentShader: `uniform float uA, uT; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){ float b = n(vec2(vUv.x * 90., vUv.y * 3. - uT * 2.)) * .6 + n(vec2(vUv.x * 230., vUv.y * 7.)) * .4;
        float a = smoothstep(1., .1, vUv.y + (b - .5) * .6) * smoothstep(0., .08, vUv.y) * uA; gl_FragColor = vec4(vec3(.62, .55, .46) * (.7 + b * .4), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const ringGeo = new THREE.RingGeometry(0.93, 1, 128, 1).rotateX(-Math.PI / 2), domeGeo = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), dustGeo = new THREE.CylinderGeometry(1, 1.04, 1, 96, 1, true).translate(0, 0.5, 0), ballGeo = new THREE.SphereGeometry(1, 40, 24);

  // one light, in the scene from the start: adding a light later would make every material recompile (a long stall)
  const light = new THREE.PointLight(0xfff1d8, 0, 5000, 1.2); light.position.set(0, -1e5, 0); scene.add(light);
  const rnd = (a, b) => a + Math.random() * (b - a);
  function spawn(x, y, z) {
    const N = {
      x, y, z, t: 0,
      ball: new THREE.Mesh(ballGeo, fireMat.clone()), ring: new THREE.Mesh(ringGeo, ringMat.clone()), ring2: new THREE.Mesh(ringGeo, ringMat.clone()),
      dome: new THREE.Mesh(domeGeo, domeMat.clone()), dust: new THREE.Mesh(dustGeo, dustMat.clone()),
      p: [], // puffs: { kind 0 stem / 1 cap / 2 base surge, phase, a, r, seed, size }
    };
    light.position.set(x, y + 80, z);
    for (const o of [N.ball, N.ring, N.ring2, N.dome, N.dust]) scene.add(o);
    for (const m of [N.ball, N.ring, N.ring2, N.dome, N.dust]) { m.frustumCulled = false; m.renderOrder = 4; }
    const Q = MAXP / 420;
    for (let i = 0; i < 90 * Q; i++) N.p.push({ k: 0, f: Math.random(), a: rnd(0, 6.283), r: rnd(0, 1), s: Math.random(), z: rnd(0.8, 1.3) });
    for (let i = 0; i < 230 * Q; i++) N.p.push({ k: 1, f: Math.random(), a: rnd(0, 6.283), r: rnd(0.3, 1), s: Math.random(), z: rnd(0.8, 1.4) });
    for (let i = 0; i < 90 * Q; i++) N.p.push({ k: 2, f: Math.random(), a: rnd(0, 6.283), r: rnd(0.85, 1.1), s: Math.random(), z: rnd(0.8, 1.3) });
    live.push(N); return N;
  }
  function kill(N) { for (const o of [N.ball, N.ring, N.ring2, N.dome, N.dust]) { scene.remove(o); o.material.dispose(); } if (!live.length || live.every(q => q === N)) light.intensity = 0; }

  const ease = (t, k) => 1 - Math.exp(-t * k);
  function update(dt, sky) {
    if (sky) puffMat.uniforms.uSky.value.copy(sky);
    let n = 0; const P = iPos.array, C = iCol.array;
    for (let i = live.length - 1; i >= 0; i--) {
      const N = live[i]; N.t += dt; const T = N.t, { x, y, z } = N;
      if (T > 95) { kill(N); live.splice(i, 1); continue; }
      // flash + light
      if (N === live[live.length - 1]) { light.intensity = 6e5 * Math.exp(-T * 2.5) + 2e4 * Math.exp(-T * 0.15); light.position.y = y + Math.min(300, 60 + T * 20); light.color.setRGB(1, 0.95 - Math.min(0.5, T * 0.08), 0.85 - Math.min(0.7, T * 0.12)); }
      // fireball: swells to ~75 m in a couple of seconds, climbs into the cap and cools
      const capH = 90 + 560 * ease(T, 0.085), heat = Math.max(0, 1 - T / 14), br = 14 + 95 * ease(T, 2.2) + T * 1.5;
      N.ball.position.set(x, y + Math.max(br * 0.6, Math.min(capH, 40 + T * 26)), z); N.ball.scale.set(br, br * (0.9 + Math.min(0.25, T * 0.02)), br);
      N.ball.material.uniforms.uT.value = T; N.ball.material.uniforms.uHeat.value = heat; N.ball.material.uniforms.uA.value = T < 4.5 ? 1 : Math.max(0, 1 - (T - 4.5) / 4.5); // hands over to the cloud: never a hard ball hanging in the sky
      N.ball.visible = N.ball.material.uniforms.uA.value > 0.01;
      // the shockwave you can see go out: ground ring, a second softer ring behind it, the dust wall and the dome edge
      const R = WAVE_SPEED * T;
      N.ring.position.set(x, y + 1.5, z); N.ring.scale.setScalar(Math.max(1, R)); N.ring.material.uniforms.uA.value = Math.max(0, 1 - T / 4.5);
      N.ring2.position.set(x, y + 1, z); N.ring2.scale.setScalar(Math.max(1, R * 0.82)); N.ring2.material.uniforms.uA.value = Math.max(0, 0.6 - T / 5);
      N.dome.position.set(x, y, z); N.dome.scale.set(Math.max(1, R * 1.02), Math.max(1, R * 0.7), Math.max(1, R * 1.02)); N.dome.material.uniforms.uA.value = Math.max(0, 0.75 - T / 3.2);
      const dR = Math.max(1, R * 0.9), dH = 18 + 30 * ease(T, 1.5);
      N.dust.position.set(x, y - 1, z); N.dust.scale.set(dR, dH, dR); N.dust.material.uniforms.uA.value = T < 2 ? 0.85 : Math.max(0, 0.85 - (T - 2) / 6); N.dust.material.uniforms.uT.value = T;
      for (const m of [N.ring, N.ring2, N.dome, N.dust]) m.visible = m.material.uniforms.uA.value > 0.01;
      // the mushroom: stem from the ground to the cap, a rolling torus on top, a base surge of dust going out
      const capR = 50 + 270 * ease(T, 0.075), tube = capR * 0.55, stemR = 26 + 48 * ease(T, 0.12), fade = T < 60 ? 1 : Math.max(0, 1 - (T - 60) / 35);
      for (const q of N.p) {
        if (n >= MAXP) break; let px, py, pz, s, h, a;
        if (q.k === 0) { // stem: puffs climbing and swirling
          if (T < 1.2) continue;
          const u = (q.f + T * 0.05) % 1, ang = q.a + T * 0.35 + u * 4, rr = stemR * (0.25 + q.r * 0.75) * (1 - u * 0.35);
          px = x + Math.cos(ang) * rr; pz = z + Math.sin(ang) * rr; py = y + 15 + u * (capH - tube * 0.3); s = stemR * 2.3 * q.z; h = Math.max(0, heat * 1.3 - u * 0.4) * (1 - u * 0.5); a = 0.95 * fade * Math.min(1, (T - 1.2) * 0.8);
        } else if (q.k === 1) { // cap: a vortex ring, puffs rolling over the top and tucking under
          if (T < 0.6) continue;
          const phi = q.f * 6.283 + T * 0.55, rr = capR + Math.cos(phi) * tube * q.r, ang = q.a + T * 0.04;
          px = x + Math.cos(ang) * rr; pz = z + Math.sin(ang) * rr; py = y + capH + Math.sin(phi) * tube * 0.75 * q.r + tube * 0.25; s = tube * 1.9 * q.z; h = heat * (1.15 - q.r * 0.5) * (0.6 + 0.4 * Math.max(0, -Math.sin(phi))); a = 0.9 * fade * Math.min(1, (T - 0.6) * 0.7);
        } else { // base surge: a low dust doughnut rolling outward
          if (T < 0.8) continue;
          const rr = Math.min(R * 0.75, 120 + 380 * ease(T, 0.22)) * q.r, ang = q.a + T * 0.02;
          px = x + Math.cos(ang) * rr; pz = z + Math.sin(ang) * rr; py = y + 6 + q.s * 14 + T * 0.4; s = 50 * q.z + T * 1.4; h = 0; a = 0.55 * fade * Math.min(1, (T - 0.8)) * Math.max(0.25, 1 - T / 70);
        }
        P[n * 4] = px; P[n * 4 + 1] = py; P[n * 4 + 2] = pz; P[n * 4 + 3] = s;
        C[n * 4] = Math.max(0, h); C[n * 4 + 1] = a; C[n * 4 + 2] = q.s + T * 0.003 * (q.s - 0.5); C[n * 4 + 3] = 0; n++;
      }
    }
    quad.instanceCount = n; iPos.needsUpdate = true; iCol.needsUpdate = true; puffs.visible = n > 0;
  }
  // compile every shader up front (the loading screen calls this), so the first nuke doesn't stall the game
  async function warm(renderer, camera) {
    const g = new THREE.Group(), mats = [fireMat, ringMat, domeMat, dustMat]; mats.forEach((m, i) => { const o = new THREE.Mesh(i ? ringGeo : ballGeo, m); o.position.set(0, -500, 0); o.frustumCulled = false; g.add(o); });
    quad.instanceCount = 1; g.add(puffs); scene.add(g);
    try { if (renderer.compileAsync) await renderer.compileAsync(g, camera, scene); else renderer.compile(g, camera, scene); } catch (e) { }
    scene.remove(g); g.remove(puffs); scene.add(puffs); quad.instanceCount = 0; puffs.visible = false;
  }
  return { spawn, update, warm, get active() { return live.length; } };
}
