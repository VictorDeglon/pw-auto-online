// Explosions, debris and gun effects.
//
// Debris is a small rigid-body simulation: every chunk (car panels, wheels, building blocks, rubble) is a mesh with
// velocity and spin that falls, bounces on the terrain, slides to a stop and sleeps. Fireballs are shaded spheres
// (procedural noise, white-hot core to sooty edge), the shockwave is a ground ring, and the flash is one of two point
// lights that live in the scene all the time (adding lights at runtime would recompile every material: a hitch).
//   const FX = createFX({ THREE, scene, camera, heightAt, smoke, fire, quality })
//   FX.explosion(x, y, z, R)  FX.body(mesh, vel, spin, opts)  FX.chips(x, y, z, n, color, speed, size)
//   FX.muzzle(pos, dir, big)  FX.impact(x, y, z, kind)  FX.plume(x, y, z, seconds, size)  FX.update(dt)
export function createFX(o) {
  const { THREE, scene, camera, heightAt, smoke, fire } = o, Q = o.quality || 1;
  const rand = (a, b) => a + Math.random() * (b - a);
  const bodies = [], MAXB = Math.round(260 * Q + 60);
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

  // ---------------------------------------------------------------- rigid debris
  // mesh: already in the scene at its start pose. opts: { r (radius), life (s), bounce, friction, sleepFade }
  function body(mesh, vel, spin, opt = {}) {
    if (!mesh.parent) scene.add(mesh);
    const b = { m: mesh, v: vel.clone ? vel.clone() : new THREE.Vector3(vel[0], vel[1], vel[2]), w: spin.clone ? spin.clone() : new THREE.Vector3(spin[0], spin[1], spin[2]),
      r: opt.r ?? 0.4, life: opt.life ?? 40, bounce: opt.bounce ?? 0.25, fr: opt.friction ?? 0.55, still: 0, asleep: false, own: !!opt.own };
    bodies.push(b);
    while (bodies.length > MAXB) kill(bodies.shift());
    return b;
  }
  function kill(b) { if (b.m.parent) b.m.parent.remove(b.m); if (b.own) { b.m.geometry && b.m.geometry.dispose(); } }
  function stepBodies(dt) {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i]; b.life -= dt;
      if (b.life <= 0) { // sink into the ground, then go
        b.m.position.y -= dt * 0.6; if (b.life < -2) { kill(b); bodies.splice(i, 1); } continue;
      }
      if (b.asleep) continue;
      b.v.y -= 21 * dt; // the game's gravity (2 g reads right at this camera distance)
      b.m.position.addScaledVector(b.v, dt);
      const wl = b.w.length(); if (wl > 1e-4) { _q.setFromAxisAngle(_v.copy(b.w).divideScalar(wl), wl * dt); b.m.quaternion.premultiply(_q); }
      const gy = heightAt(b.m.position.x, b.m.position.z) + b.r * 0.55;
      if (b.m.position.y < gy) {
        b.m.position.y = gy;
        if (b.v.y < 0) { b.v.y = -b.v.y * b.bounce; if (b.v.y < 1.2) b.v.y = 0; }
        b.v.x *= Math.pow(1 - b.fr, dt * 8); b.v.z *= Math.pow(1 - b.fr, dt * 8); b.w.multiplyScalar(Math.pow(0.35, dt * 6));
        // tip toward lying flat: damp spin, let it settle
        if (b.v.lengthSq() < 0.15 && b.w.lengthSq() < 0.2) { if ((b.still += dt) > 0.6) b.asleep = true; } else b.still = 0;
      }
    }
  }

  // shared chip geometry / materials, keyed by colour
  const chipG = new THREE.BoxGeometry(1, 1, 1), chipMats = new Map();
  const chipMat = c => { let m = chipMats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.1 }); chipMats.set(c, m); } return m; };
  function chips(x, y, z, n, color, speed = 8, size = 0.25, life = 25) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(chipG, chipMat(color)); const s = size * rand(0.5, 1.4);
      m.scale.set(s * rand(0.6, 1.6), s * rand(0.3, 1), s * rand(0.6, 1.6)); m.position.set(x + rand(-0.4, 0.4), y + rand(0, 0.6), z + rand(-0.4, 0.4));
      m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6)); m.castShadow = Q >= 1;
      const a = rand(0, Math.PI * 2), up = rand(0.35, 1);
      body(m, new THREE.Vector3(Math.cos(a) * speed * rand(0.3, 1), speed * up, Math.sin(a) * speed * rand(0.3, 1)), new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), { r: s, life: life * rand(0.6, 1) });
    }
  }

  // ---------------------------------------------------------------- fireballs
  const fbG = new THREE.IcosahedronGeometry(1, 3);
  const fbMat = () => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uSeed: { value: Math.random() * 50 }, uHeat: { value: 1 } },
    vertexShader: /* glsl */`uniform float uT, uSeed; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){ vec3 p = position; float d = n3(p * 2.2 + uSeed + vec3(0., -uT * 3., 0.)) * .5 + n3(p * 4.5 + uSeed * 2.) * .25;
        p *= .8 + d * .55; vP = p; vec4 mv = modelViewMatrix * vec4(p, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform float uT, uHeat; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ float rim = clamp(dot(vN, vV), 0., 1.); float core = pow(rim, 1.5) * uHeat;
        vec3 c = mix(vec3(.35, .06, .01), vec3(1., .55, .12), core); c = mix(c, vec3(1., .95, .75), smoothstep(.75, 1., core));
        float a = (.25 + .75 * rim) * uHeat; gl_FragColor = vec4(c * (1.4 + core), a); }`,
  });
  const balls = [];
  function fireball(x, y, z, R, delay = 0) {
    const m = new THREE.Mesh(fbG, fbMat()); m.position.set(x, y, z); m.scale.setScalar(0.01); m.renderOrder = 3; m.frustumCulled = false; scene.add(m);
    balls.push({ m, R, t: -delay, life: 0.9 + R * 0.06, rise: rand(2, 5), dx: rand(-1, 1), dz: rand(-1, 1) });
  }
  function stepBalls(dt) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i]; b.t += dt; if (b.t < 0) continue;
      const k = b.t / b.life, grow = 1 - Math.pow(1 - Math.min(1, b.t / 0.18), 3);
      b.m.scale.setScalar(Math.max(0.01, b.R * (0.35 + 0.65 * grow) * (1 + k * 0.35)));
      b.m.position.y += b.rise * dt; b.m.position.x += b.dx * dt; b.m.position.z += b.dz * dt;
      b.m.material.uniforms.uT.value = b.t; b.m.material.uniforms.uHeat.value = Math.max(0, 1 - k * k);
      if (k >= 1) { scene.remove(b.m); b.m.material.dispose(); balls.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- shockwave (a fast rim-lit bubble) + light flashes
  const swMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float r = 1. - abs(dot(vN, vV)); gl_FragColor = vec4(vec3(1., .93, .8) * pow(r, 4.) * uA, 1.); }' });
  const rings = [];
  function ring(x, y, z, R) { const m = new THREE.Mesh(fbG, swMat()); m.position.set(x, y + 0.5, z); m.scale.setScalar(0.5); m.frustumCulled = false; scene.add(m); rings.push({ m, t: 0, R }); }
  const lights = [new THREE.PointLight(0xffa040, 0, 60, 2), new THREE.PointLight(0xffd080, 0, 40, 2)];
  for (const l of lights) { l.castShadow = false; scene.add(l); }
  const flashes = [];
  function flash(x, y, z, power, dur, i = 0) {
    const L = lights[i]; L.position.set(x, y, z); L.distance = power > 40 ? 120 : 40;
    flashes[i] = { L, p: power, t: 0, dur };
  }
  function stepFlash(dt) {
    for (const r of rings.slice()) { r.t += dt; const k = r.t / 0.32; r.m.scale.setScalar(0.5 + r.R * 2 * Math.sqrt(Math.min(1, k))); r.m.material.uniforms.uA.value = 1.6 * (1 - k); if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(rings.indexOf(r), 1); } }
    for (let i = 0; i < flashes.length; i++) { const f = flashes[i]; if (!f) continue; f.t += dt; const k = f.t / f.dur; f.L.intensity = k >= 1 ? 0 : f.p * (1 - k) * (1 - k); if (k >= 1) flashes[i] = null; }
  }

  // ---------------------------------------------------------------- smoke plumes (keep billowing for a while)
  const plumes = [];
  function plume(x, y, z, dur = 6, size = 1) { plumes.push({ x, y, z, t: dur, size, acc: 0 }); }
  function stepPlumes(dt) {
    for (let i = plumes.length - 1; i >= 0; i--) {
      const p = plumes[i]; p.t -= dt; p.acc += dt * (8 * Q + 2) * p.size;
      while (p.acc > 1) { p.acc -= 1; const g = rand(0.08, 0.2); smoke.emit(p.x + rand(-1, 1) * p.size, p.y + rand(0, 1), p.z + rand(-1, 1) * p.size, rand(-0.6, 0.6), rand(2.5, 5), rand(-0.6, 0.6), rand(1.5, 3) * p.size, rand(3, 6), g, g, g, 1.4 * p.size, -0.3); }
      if (p.t <= 0) plumes.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- the explosion
  function explosion(x, y, z, R = 6) {
    const big = R >= 7;
    fireball(x, y + R * 0.15, z, R * 0.75);
    for (let i = 0; i < (big ? 4 : 2); i++) fireball(x + rand(-R, R) * 0.4, y + rand(0, R * 0.4), z + rand(-R, R) * 0.4, R * rand(0.35, 0.55), rand(0.03, 0.18));
    ring(x, y, z, R);
    flash(x, y + 2, z, big ? 90 : 50, big ? 0.6 : 0.4, 0);
    for (let i = 0; i < 60 * Q + 20; i++) fire.emit(x, y + 0.5, z, rand(-1, 1) * R * 2.2, rand(3, 16), rand(-1, 1) * R * 2.2, rand(0.12, 0.3), rand(0.6, 1.6), 1, rand(0.55, 0.85), 0.25, 0, 14); // embers
    for (let i = 0; i < 26 * Q + 8; i++) { const g = rand(0.12, 0.25); smoke.emit(x + rand(-R, R) * 0.5, y + rand(0.5, 2), z + rand(-R, R) * 0.5, rand(-3, 3), rand(3, 9), rand(-3, 3), rand(2.5, 5) * R / 6, rand(3, 6), g, g, g, 2.2, -0.4); }
    chips(x, heightAt(x, z) + 0.3, z, Math.round(10 * Q + 4), 0x4a4038, R * 2.2, 0.22, 12); // dirt and asphalt
    plume(x, y, z, big ? 9 : 5, R / 6);
  }

  // ---------------------------------------------------------------- guns
  const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? 12 : 32; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const mflashes = [];
  function muzzle(pos, dir, big) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(pos).addScaledVector(dir, 0.15); s.scale.setScalar(big ? rand(0.9, 1.3) : rand(0.45, 0.7)); s.material.rotation = rand(0, 6); scene.add(s);
    mflashes.push({ s, t: 0.05 });
    flash(pos.x, pos.y, pos.z, big ? 12 : 6, 0.07, 1);
  }
  function stepMuzzle(dt) { for (let i = mflashes.length - 1; i >= 0; i--) { const f = mflashes[i]; f.t -= dt; if (f.t <= 0) { scene.remove(f.s); f.s.material.dispose(); mflashes.splice(i, 1); } } }
  // a bullet hitting something: kind 'wall' | 'ground' | 'car' | 'flesh'
  function impact(x, y, z, kind) {
    if (kind === 'flesh') return;
    const g = kind === 'ground' ? 0.42 : 0.6;
    for (let i = 0; i < 5; i++) smoke.emit(x, y, z, rand(-1, 1), rand(0.5, 2), rand(-1, 1), rand(0.2, 0.45), rand(0.4, 0.9), g, g * 0.95, g * 0.9, 0.8, 0);
    if (kind !== 'ground') for (let i = 0; i < 6; i++) fire.emit(x, y, z, rand(-5, 5), rand(0, 5), rand(-5, 5), rand(0.05, 0.12), rand(0.1, 0.25), 1, 0.8, 0.4, 0, 18);
    if (kind === 'wall' && Math.random() < 0.35 * Q) chips(x, y, z, 1, 0x9c9488, 3, 0.08, 6);
  }

  function update(dt) { stepBodies(dt); stepBalls(dt); stepFlash(dt); stepPlumes(dt); stepMuzzle(dt); }
  return { explosion, body, chips, muzzle, impact, plume, flash, fireball, ring, update, bodies, get count() { return bodies.length; } };
}
