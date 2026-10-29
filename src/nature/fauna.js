// Wildlife around you, the way inland San Diego County has it: red-tailed hawks soaring over the hills, ravens and crows
// over town, desert cottontails at the brush edges (they freeze, then bolt when you come close), California ground
// squirrels in colonies of burrow mounds out in the grassland (they sit up by their holes and dive in when you come),
// and coyotes trotting the wild land at dusk and through the night (they keep their distance).
// Everything lives in a ring round you (spawned out of sight, dropped far away), placed by the land itself: brush,
// grass, town (src/nature/groundcover.js cover map), never on a road.
//   const F = createFauna(H)   F.update(dt)   H: { THREE, scene, groundAt(x, z), cover(x, z) -> [lawn, brush, dry, tall] 0-1 | null,
//                                               onRoad(x, z), built(x, z) (0 open .. 1 town), focus() -> {x, z}, hour() }
export function createFauna(H) {
  const { THREE } = H, TAU = Math.PI * 2;
  const rnd = Math.random, lam = c => new THREE.MeshLambertMaterial({ color: c });
  const M = { fur: lam(0x8a7a66), furDark: lam(0x5e5244), belly: lam(0xd8cfc0), white: lam(0xf2efe8), coyote: lam(0x9c8466), coyoteDark: lam(0x6b5a46),
    raven: lam(0x16171a), hawk: lam(0x7a5636), hawkLight: lam(0xd9cdb6), dirt: lam(0x9a8466), hole: new THREE.MeshBasicMaterial({ color: 0x1a140e }) };
  const part = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; return m; };
  const S = new THREE.SphereGeometry(1, 10, 7), C = new THREE.CylinderGeometry(1, 1, 1, 6);
  // ---- models (metres, facing +z)
  function rabbit() {
    const g = new THREE.Group(), b = new THREE.Group(); g.add(b);
    const body = part(S, M.fur, 0, 0.14, 0); body.scale.set(0.11, 0.1, 0.16); b.add(body);
    const head = part(S, M.fur, 0, 0.22, 0.13); head.scale.set(0.065, 0.065, 0.075); b.add(head);
    for (const s of [-1, 1]) { const ear = part(S, M.furDark, s * 0.025, 0.33, 0.11, -0.25, 0, s * 0.15); ear.scale.set(0.018, 0.075, 0.01); b.add(ear); }
    const tail = part(S, M.white, 0, 0.17, -0.16); tail.scale.setScalar(0.035); b.add(tail);
    g.userData.body = b; return g;
  }
  function squirrel() {
    const g = new THREE.Group(), b = new THREE.Group(); g.add(b);
    const body = part(S, M.fur, 0, 0.09, 0); body.scale.set(0.06, 0.06, 0.12); b.add(body);
    const head = part(S, M.fur, 0, 0.13, 0.11); head.scale.set(0.045, 0.045, 0.05); b.add(head);
    const tail = part(S, M.furDark, 0, 0.13, -0.15, 0.6); tail.scale.set(0.035, 0.035, 0.11); b.add(tail);
    g.userData.body = b; return g;
  }
  function coyote() {
    const g = new THREE.Group(), b = new THREE.Group(); g.add(b);
    const body = part(S, M.coyote, 0, 0.55, 0); body.scale.set(0.17, 0.2, 0.48); b.add(body);
    const neck = part(S, M.coyote, 0, 0.68, 0.38, -0.5); neck.scale.set(0.1, 0.12, 0.16); b.add(neck);
    const head = part(S, M.coyote, 0, 0.74, 0.52); head.scale.set(0.09, 0.09, 0.13); b.add(head);
    const snout = part(S, M.coyoteDark, 0, 0.71, 0.64); snout.scale.set(0.045, 0.04, 0.08); b.add(snout);
    for (const s of [-1, 1]) { const ear = part(S, M.coyoteDark, s * 0.05, 0.86, 0.5); ear.scale.set(0.03, 0.06, 0.02); b.add(ear); }
    const tail = part(S, M.coyoteDark, 0, 0.5, -0.55, 0.9); tail.scale.set(0.06, 0.06, 0.24); b.add(tail);
    const legs = [];
    for (const [x, z] of [[-0.09, 0.3], [0.09, 0.3], [-0.09, -0.3], [0.09, -0.3]]) { const pivot = new THREE.Group(); pivot.position.set(x, 0.5, z); const leg = part(C, M.coyote, 0, -0.25, 0); leg.scale.set(0.03, 0.5, 0.03); pivot.add(leg); b.add(pivot); legs.push(pivot); }
    g.userData.body = b; g.userData.legs = legs; return g;
  }
  function bird(hawk) { // a body and two wings; the wings flap (or hold, soaring)
    const g = new THREE.Group(), s = hawk ? 1.25 : 0.55, mat = hawk ? M.hawk : M.raven;
    const body = part(S, mat, 0, 0, 0); body.scale.set(0.09 * s, 0.08 * s, 0.32 * s); g.add(body);
    const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0.62, 0, -0.02, 0, 0, -0.14, 0.62, 0, -0.02, 0.5, 0, -0.16, 0, 0, -0.14], 3)); wing.computeVertexNormals();
    const wm = new THREE.MeshLambertMaterial({ color: hawk ? 0x6b4a2e : 0x141518, side: THREE.DoubleSide });
    const L = new THREE.Mesh(wing, wm), R = new THREE.Mesh(wing, wm); L.scale.set(-s, s, s); R.scale.set(s, s, s); g.add(L, R);
    if (hawk) { const tail = part(S, M.hawkLight, 0, 0, -0.32 * s); tail.scale.set(0.08 * s, 0.02 * s, 0.1 * s); g.add(tail); }
    g.userData.wings = [L, R]; return g;
  }
  function mound() { // a burrow: a low fan of dug-out earth with the hole at one side
    const g = new THREE.Group(), m = part(S, M.dirt, 0, -0.02, 0); m.scale.set(0.45, 0.1, 0.38); m.castShadow = false; m.receiveShadow = true; g.add(m);
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10).rotateX(-Math.PI / 2), M.hole); h.position.set(0, 0.075, 0.1); g.add(h); return g;
  }
  // ---- the ring round you
  const live = { rabbit: [], squirrel: [], coyote: [], bird: [], burrow: [] };
  const CAP = { rabbit: 10, coyote: 3, bird: 14 }, R0 = 40, R1 = 160;
  const cell = (x, z, s) => { const h = Math.sin(Math.floor(x / s) * 127.1 + Math.floor(z / s) * 311.7) * 43758.5453; return h - Math.floor(h); };
  function spot(want) { // somewhere out of sight in the ring whose land suits `want`
    const f = H.focus();
    for (let k = 0; k < 12; k++) {
      const a = rnd() * TAU, d = R0 + rnd() * (R1 - R0), x = f.x + Math.sin(a) * d, z = f.z + Math.cos(a) * d;
      if (H.onRoad(x, z)) continue; const c = H.cover(x, z); if (!c) continue; const built = H.built(x, z);
      if (want(c, built)) return { x, z };
    }
    return null;
  }
  function add(kind, obj, x, z, extra = {}) { obj.position.set(x, H.groundAt(x, z), z); obj.rotation.y = rnd() * TAU; H.scene.add(obj); const a = { kind, obj, x, z, h: obj.rotation.y, t: 0, state: 'idle', timer: 1 + rnd() * 3, ...extra }; live[kind].push(a); return a; }
  function drop(kind, a) { H.scene.remove(a.obj); const L = live[kind], i = L.indexOf(a); if (i >= 0) L.splice(i, 1); }
  // burrow colonies: fixed per 60 m cell of open grassland (the same every visit)
  const colonies = new Map();
  function colonyAt(cx, cz) {
    const k = cx + ',' + cz; if (colonies.has(k)) return colonies.get(k);
    const x0 = cx * 60, z0 = cz * 60, c = H.cover(x0 + 30, z0 + 30); let col = null;
    if (c && c[3] > 0.45 && c[1] < 0.5 && H.built(x0 + 30, z0 + 30) < 0.2 && cell(x0, z0, 60) < 0.18) {
      col = { holes: [], squirrels: [] };
      for (let i = 0; i < 6 + Math.floor(cell(x0 + 7, z0, 60) * 8); i++) { const x = x0 + 12 + cell(x0 + i * 3.1, z0, 1) * 36, z = z0 + 12 + cell(x0, z0 + i * 5.3, 1) * 36; if (!H.onRoad(x, z)) col.holes.push([x, z]); }
    }
    colonies.set(k, col); return col;
  }
  function wildland(c, b) { return b < 0.25 && (c[1] > 0.25 || c[3] > 0.35); }
  // ---- per frame
  let clock = 0, spawnT = 0;
  function update(dt) {
    clock += dt; const f = H.focus(), hr = H.hour(), dusk = hr < 7 || hr > 18.5;
    // spawning (a few times a second)
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 0.4;
      if (live.rabbit.length < CAP.rabbit && (hr < 10 || hr > 16)) { const p = spot((c, b) => c[1] > 0.15 && c[1] < 0.8 && b < 0.5); if (p) add('rabbit', rabbit(), p.x, p.z); }
      if (live.coyote.length < CAP.coyote && dusk) { const p = spot(wildland); if (p) add('coyote', coyote(), p.x, p.z, { state: 'trot', timer: 8 + rnd() * 10 }); }
      if (live.bird.length < CAP.bird) {
        const hawk = rnd() < 0.3, p = spot((c, b) => hawk ? b < 0.3 : true);
        if (p) { const n = hawk ? 1 : 3 + Math.floor(rnd() * 5), cx = p.x, cz = p.z, alt = hawk ? 45 + rnd() * 50 : 18 + rnd() * 25, r = hawk ? 30 + rnd() * 40 : 15 + rnd() * 20, w = (hawk ? 0.12 : 0.35) * (rnd() < 0.5 ? 1 : -1);
          for (let i = 0; i < n && live.bird.length < CAP.bird; i++) add('bird', bird(hawk), cx, cz, { hawk, cx, cz, alt: alt + rnd() * 4, r: r + rnd() * 6, w, a: rnd() * TAU, ph: rnd() * TAU }); }
      }
      // burrow colonies in the cells round you
      const cx0 = Math.floor(f.x / 60), cz0 = Math.floor(f.z / 60);
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const col = colonyAt(cx0 + i, cz0 + j); if (!col || col.built) continue; col.built = true;
        col.mounds = col.holes.map(([x, z]) => { const m = mound(); m.position.set(x, H.groundAt(x, z), z); m.rotation.y = cell(x, z, 1) * TAU; H.scene.add(m); return m; });
        col.squirrels = col.holes.filter((_, k) => k % 2 === 0).map(([x, z]) => add('squirrel', squirrel(), x + 0.4, z + 0.4, { home: [x, z], state: 'sit', timer: 2 + rnd() * 6 }));
        col.cx = cx0 + i; col.cz = cz0 + j; live.burrow.push(col); }
    }
    // drop what's far
    for (const kind of ['rabbit', 'coyote', 'bird']) for (const a of [...live[kind]]) if (Math.hypot(a.x - f.x, a.z - f.z) > R1 + 80) drop(kind, a);
    for (const col of [...live.burrow]) if (Math.abs(col.cx - Math.floor(f.x / 60)) > 3 || Math.abs(col.cz - Math.floor(f.z / 60)) > 3) {
      for (const m of col.mounds) H.scene.remove(m); for (const s of col.squirrels) drop('squirrel', s); col.built = false; col.mounds = []; col.squirrels = []; live.burrow.splice(live.burrow.indexOf(col), 1);
    }
    const near = a => Math.hypot(a.x - f.x, a.z - f.z);
    // rabbits: nibble, freeze when you're near, bolt away in hops
    for (const a of live.rabbit) {
      const d = near(a); a.timer -= dt;
      if (d < 9 && a.state !== 'bolt') { a.state = 'bolt'; a.timer = 2.5; a.h = Math.atan2(a.x - f.x, a.z - f.z) + (rnd() - 0.5) * 0.8; }
      else if (d < 16 && a.state === 'idle') { a.state = 'freeze'; a.timer = 1.5; }
      if (a.state === 'bolt' || a.state === 'hop') { const sp = a.state === 'bolt' ? 7 : 1.6; a.x += Math.sin(a.h) * sp * dt; a.z += Math.cos(a.h) * sp * dt; a.t += dt * (a.state === 'bolt' ? 9 : 5); a.obj.userData.body.position.y = Math.abs(Math.sin(a.t)) * (a.state === 'bolt' ? 0.22 : 0.08); }
      else a.obj.userData.body.position.y = 0;
      if (a.timer <= 0) { a.state = a.state === 'idle' ? 'hop' : 'idle'; a.timer = a.state === 'hop' ? 0.6 + rnd() : 2 + rnd() * 4; a.h += (rnd() - 0.5) * 2; }
      if (H.onRoad(a.x, a.z) && a.state !== 'bolt') a.h += Math.PI;
      a.obj.position.set(a.x, H.groundAt(a.x, a.z), a.z); a.obj.rotation.y = a.h;
    }
    // squirrels: sit up by the hole, potter about, dive in when you come
    for (const a of live.squirrel) {
      const d = near(a); a.timer -= dt; const [hx, hz] = a.home;
      if (d < 14) { a.state = 'hide'; a.timer = 6 + rnd() * 6; }
      if (a.state === 'hide') { a.obj.visible = false; a.x = hx; a.z = hz; if (a.timer <= 0 && d > 18) { a.state = 'sit'; a.obj.visible = true; a.timer = 2 + rnd() * 5; } continue; }
      if (a.state === 'sit') { a.obj.userData.body.rotation.x = -0.9; a.obj.userData.body.position.y = 0.05; if (a.timer <= 0) { a.state = 'run'; a.timer = 1 + rnd() * 2; a.h = rnd() * TAU; } }
      else { a.obj.userData.body.rotation.x = 0; a.obj.userData.body.position.y = 0; a.x += Math.sin(a.h) * 2.2 * dt; a.z += Math.cos(a.h) * 2.2 * dt; if (Math.hypot(a.x - hx, a.z - hz) > 6) a.h = Math.atan2(hx - a.x, hz - a.z); if (a.timer <= 0) { a.state = 'sit'; a.timer = 2 + rnd() * 6; } }
      a.obj.position.set(a.x, H.groundAt(a.x, a.z), a.z); a.obj.rotation.y = a.h;
    }
    // coyotes: trot, pause and look, keep well away from you
    for (const a of live.coyote) {
      const d = near(a); a.timer -= dt;
      if (d < 35) { a.state = 'flee'; a.h = Math.atan2(a.x - f.x, a.z - f.z); }
      const sp = a.state === 'flee' ? 9 : a.state === 'trot' ? 2.8 : 0;
      if (sp) { const nx = a.x + Math.sin(a.h) * sp * dt, nz = a.z + Math.cos(a.h) * sp * dt, c = H.cover(nx, nz); if (H.onRoad(nx, nz) && a.state !== 'flee' || (c && H.built(nx, nz) > 0.5)) a.h += 1.2 * dt * 3; else { a.x = nx; a.z = nz; } }
      if (a.timer <= 0) { a.state = a.state === 'trot' ? 'look' : 'trot'; a.timer = a.state === 'trot' ? 6 + rnd() * 10 : 2 + rnd() * 3; a.h += (rnd() - 0.5) * 1.2; }
      a.t += dt * sp * 2.4; const legs = a.obj.userData.legs; legs.forEach((l, k) => { l.rotation.x = sp ? Math.sin(a.t + (k === 0 || k === 3 ? 0 : Math.PI)) * 0.55 : 0; });
      a.obj.userData.body.position.y = sp ? Math.abs(Math.sin(a.t)) * 0.03 : 0;
      a.obj.position.set(a.x, H.groundAt(a.x, a.z), a.z); a.obj.rotation.y = a.h;
    }
    // birds: circle and flap (hawks hold their wings and soar)
    for (const a of live.bird) {
      a.a += a.w * dt; a.cx += Math.sin(clock * 0.05 + a.ph) * dt * 1.5; a.cz += Math.cos(clock * 0.04 + a.ph) * dt * 1.5;
      a.x = a.cx + Math.cos(a.a) * a.r; a.z = a.cz + Math.sin(a.a) * a.r;
      const y = H.groundAt(a.x, a.z) + a.alt + Math.sin(clock * 0.3 + a.ph) * 3; a.obj.position.set(a.x, y, a.z);
      a.obj.rotation.set(0, -a.a + (a.w > 0 ? Math.PI : 0), (a.w > 0 ? 1 : -1) * (a.hawk ? 0.25 : 0.4));
      const flap = a.hawk ? Math.sin(clock * 0.8 + a.ph) * 0.06 + 0.12 : Math.sin(clock * 11 + a.ph) * 0.6; const [L, R] = a.obj.userData.wings; L.rotation.z = -flap; R.rotation.z = flap;
    }
  }
  return { update, live };
}
