// Boats, planes and helicopters you can take. Every boat on the lakes, the medevac helicopter at the hospital, and the
// light planes parked on open ground: F next to one takes it, F again gets out (on land or near a shore; out of a flying
// aircraft you bail and fall). One at a time: deps.FLY.craft is the one you're in, null on foot.
//   boats       W / S throttle, A / D steer. They stay on the water: the shore stops them.
//   planes      on the ground W / S throttle, A / D steer to taxi; past take-off speed they fly where you look
//               (A / D bank). Touch down gently and level to land; anything harder is a crash.
//   helicopter  W / S forward and back, A / D slide sideways, Space climb, C descend; it turns where you look.
//   const P = createPilot(deps)
//   P.addAircraft(kind, x, y, z, rot)   a parked plane ('cessna', 'trainer') or helicopter ('heli')
//   P.addBoat(b)                        a lake boat from index.html ({ m, lake, x, z, h, kind })
//   P.near(x, z, maxD) -> { craft, d } | null      P.board(craft)      P.leave()
//   P.update(dt)   every frame: the craft you're in, plus aircraft left in the air coming down
// deps: THREE, scene, AIR (getter), makeAircraft, keys, cam, player, FLY, heightAt, collideCircle, boundsClamp,
//       explosionAt, hurtPlayer, notify, sfx2 (getter), pip, edgeDist2

const PLANES = { // stall (m/s), top speed, thrust, how fast it turns toward where you look
  cessna: { stall: 24, top: 62, acc: 7, turn: 1.0, taxi: 12 },
  trainer: { stall: 28, top: 85, acc: 9, turn: 1.3, taxi: 14 },
};
const BOATS = { rowboat: { top: 4, acc: 2, turn: 1.0, motor: false }, runabout: { top: 19, acc: 6, turn: 0.9, motor: true }, pontoon: { top: 9, acc: 3, turn: 0.6, motor: true } };

export function createPilot(D) {
  const { THREE } = D, crafts = [];
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), up = new THREE.Vector3(0, 1, 0);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const half = c => (c.box ? (c.box.max.y - c.box.min.y) / 2 : 1);

  function addAircraft(kind, x, y, z, rot) {
    const c = D.makeAircraft(D.AIR(), kind, { center: true }); if (!c) return null;
    c.g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    c.g.position.set(x, y + half(c), z); c.g.rotation.set(0, rot, 0, 'YXZ'); D.scene.add(c.g);
    const cr = { type: kind === 'heli' ? 'heli' : 'plane', kind, c, g: c.g, vel: new THREE.Vector3(), thr: 0, grounded: true, falling: 0 };
    crafts.push(cr); return cr;
  }
  function addBoat(b) { const cr = { type: 'boat', kind: b.kind || 'rowboat', b, g: b.m, sp: 0 }; crafts.push(cr); return cr; }

  function near(x, z, maxD) {
    let best = null, bd = maxD;
    for (const cr of crafts) {
      if (cr.falling > 0 || cr === D.FLY.craft) continue;
      const p = cr.g.position, reach = cr.type === 'boat' ? 4 : cr.type === 'heli' ? 7 : 6; // boats from the shore, aircraft from beside them
      const d = Math.hypot(p.x - x, p.z - z) - reach; if (d < bd) { bd = d; best = cr; }
    }
    return best ? { craft: best, d: Math.max(0, bd) } : null;
  }

  function board(cr) {
    const P = D.player; D.FLY.craft = cr; P.rig.g.visible = false; D.keys.clear();
    if (cr.type === 'boat') { cr.b.piloted = true; cr.sp = 0; D.cam.dist = 9; }
    else { cr.thr = cr.type === 'heli' ? 0 : 0.2; cr.vel.set(0, 0, 0); D.cam.dist = cr.type === 'heli' ? 15 : 17; }
    const what = cr.type === 'boat' ? `the ${cr.kind}` : cr.type === 'heli' ? 'the helicopter' : `the ${cr.kind === 'cessna' ? 'Cessna' : 'trainer'}`;
    const how = cr.type === 'boat' ? 'W/S throttle, A/D steer' : cr.type === 'heli' ? 'W/S forward/back, A/D slide, Space up, C down, mouse to turn' : 'W/S throttle, A/D steer; past take-off speed, look up to lift off';
    D.notify(`You take ${what}. ${how}. <kbd>F</kbd> to get out.`, '', 4500);
  }

  function leave() {
    const cr = D.FLY.craft; if (!cr) return; const P = D.player, g = cr.g.position;
    if (cr.type === 'boat') { // step off onto the nearest shore
      const L = cr.b.lake; let spot = null;
      for (let r = 3; r <= 30 && !spot; r += 2) for (let a = 0; a < Math.PI * 2 && !spot; a += Math.PI / 12) {
        const x = g.x + Math.sin(a) * r, z = g.z + Math.cos(a) * r; if (D.pip(x, z, L.p) || D.edgeDist2(x, z, L.p) < 1.5) continue;
        const p = { x, z }; if (D.collideCircle(p, 0.4)) continue; spot = p;
      }
      if (!spot) { D.notify('Too far from the shore: get closer to land to step off.', '', 2200); return; }
      cr.b.piloted = false; cr.b.sp = cr.kind === 'runabout' ? 1.5 : 0.3; cr.b.turn = 0;
      P.pos.set(spot.x, D.heightAt(spot.x, spot.z), spot.z); P.air = 0;
    } else {
      const gy = D.heightAt(g.x, g.z), alt = g.y - half(cr.c) - gy, yaw = cr.g.rotation.y, sx = Math.cos(yaw), sz = -Math.sin(yaw), side = cr.type === 'heli' ? 3.2 : 6.5;
      P.pos.set(g.x + sx * side, 0, g.z + sz * side);
      if (alt > 3) { P.pos.y = g.y; P.air = Math.max(0, g.y - D.heightAt(P.pos.x, P.pos.z)); P.vy = Math.min(cr.vel.y, 4); P.fling = [cr.vel.x * 0.8, cr.vel.z * 0.8]; cr.falling = 12; cr.grounded = false; } // bail out
      else { D.collideCircle(P.pos, 0.4); P.pos.y = D.heightAt(P.pos.x, P.pos.z); P.air = 0; P.fling = null; cr.vel.set(0, 0, 0); cr.thr = 0; }
    }
    P.rotY = cr.g.rotation.y; P.rig.g.visible = true; D.cam.dist = 6.5; D.FLY.craft = null;
    const S = D.sfx2(); if (S) S.engine(0, 0, false);
  }

  // ---- boats
  function sail(cr, dt) {
    const b = cr.b, S = BOATS[cr.kind] || BOATS.rowboat, k = D.keys, L = b.lake;
    const thr = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0), st = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
    cr.sp += (thr > 0 ? S.acc : thr < 0 ? -S.acc * 0.6 : 0) * dt; cr.sp -= cr.sp * (thr ? 0.12 : 0.45) * dt; cr.sp = clamp(cr.sp, -S.top * 0.35, S.top);
    b.h += st * S.turn * clamp(Math.abs(cr.sp) / 3, 0.2, 1) * Math.sign(cr.sp || 1) * dt;
    const nx = b.x + Math.sin(b.h) * cr.sp * dt, nz = b.z + Math.cos(b.h) * cr.sp * dt;
    if (D.pip(nx, nz, L.p) && D.edgeDist2(nx, nz, L.p) > 4) { b.x = nx; b.z = nz; } else cr.sp *= -0.25; // the shore stops it
    const t = performance.now() / 1000, lift = clamp(cr.sp / S.top, 0, 1) * 0.12;
    b.m.position.set(b.x, L.y + Math.sin(t * 1.3 + b.ph) * 0.05 - 0.12 + lift * 0.5, b.z);
    b.m.rotation.set(-lift + Math.sin(t * 0.9 + b.ph) * 0.02, b.h, -st * clamp(cr.sp / S.top, 0, 1) * 0.12, 'YXZ');
    const P = D.player; P.pos.set(b.x, L.y, b.z); P.rotY = b.h; P.air = 0; P.vy = 0; P.fling = null;
    const s = D.sfx2(); if (s) s.engine(S.motor ? Math.abs(cr.sp) * 1.4 : 0, S.motor ? Math.abs(thr) : 0, S.motor);
  }

  // ---- planes: taxi, take off, fly where you look, land or crash
  function fly(cr, dt) {
    const S = PLANES[cr.kind] || PLANES.cessna, k = D.keys, g = cr.g, P = D.player, h = half(cr.c);
    const up_ = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0, dn = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0, rl = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    cr.thr = clamp(cr.thr + (up_ - dn) * dt * 0.6, 0, 1);
    const gy = D.heightAt(g.position.x, g.position.z);
    if (cr.grounded) {
      const sp0 = Math.hypot(cr.vel.x, cr.vel.z);
      let sp = sp0 + (cr.thr * S.acc - (dn ? 6 : 0.6) - sp0 * 0.02) * dt; sp = Math.max(0, sp);
      _e.setFromQuaternion(g.quaternion, 'YXZ'); _e.y -= rl * dt * clamp(sp / 6, 0, 1) * (sp < S.taxi ? 0.9 : 0.25); _e.x = 0; _e.z = 0; g.quaternion.setFromEuler(_e);
      _v.set(0, 0, 1).applyQuaternion(g.quaternion); cr.vel.set(_v.x * sp, 0, _v.z * sp);
      g.position.x += cr.vel.x * dt; g.position.z += cr.vel.z * dt; g.position.y = D.heightAt(g.position.x, g.position.z) + h;
      const look = -Math.sin(D.cam.pitch - 0.25);
      if (sp > S.stall && look > 0.06) { cr.grounded = false; cr.vel.y = 3; D.notify('Airborne.', '', 1200); } // rotate and lift off
      const p = { x: g.position.x, z: g.position.z };
      if (D.collideCircle(p, 3, false, g.position.y)) { if (sp > 22) return crash(cr); g.position.x = p.x; g.position.z = p.z; cr.vel.set(0, 0, 0); } // a bump on the ground stops it; only a real impact is a crash
    } else {
      const want = _w.set(-Math.sin(D.cam.yaw) * Math.cos(D.cam.pitch - 0.25), -Math.sin(D.cam.pitch - 0.25), -Math.cos(D.cam.yaw) * Math.cos(D.cam.pitch - 0.25)).normalize();
      const fwd = _v.set(0, 0, 1).applyQuaternion(g.quaternion);
      g.quaternion.premultiply(_q.setFromUnitVectors(fwd, want).slerp(new THREE.Quaternion(), 1 - Math.min(1, dt * S.turn)));
      _e.setFromQuaternion(g.quaternion, 'YXZ'); const bank = clamp(-wrap(Math.atan2(want.x, want.z) - _e.y) * 2, -1, 1) + rl * 0.8; _e.z += (bank - _e.z) * Math.min(1, dt * 2.5); g.quaternion.setFromEuler(_e);
      const sp = S.stall * 0.85 + cr.thr * (S.top - S.stall * 0.85); fwd.set(0, 0, 1).applyQuaternion(g.quaternion);
      cr.vel.lerp(_w.copy(fwd).multiplyScalar(sp), 1 - Math.exp(-dt * 0.9));
      if (sp < S.stall) cr.vel.y -= (S.stall - sp) * 0.5 * dt; // too slow: it sinks
      g.position.addScaledVector(cr.vel, dt); D.boundsClamp(g.position);
      const p = { x: g.position.x, z: g.position.z };
      if (D.collideCircle(p, 3, false, g.position.y)) return crash(cr);
      const ground = D.heightAt(g.position.x, g.position.z) + h;
      if (g.position.y <= ground) { // touchdown: gentle and level lands, the rest is a crash
        _w.set(0, 1, 0).applyQuaternion(g.quaternion);
        if (cr.vel.y > -4.5 && _w.y > 0.85 && Math.abs(_e.x) < 0.35) { cr.grounded = true; g.position.y = ground; cr.vel.y = 0; D.notify('Landed.', '', 1200); }
        else return crash(cr);
      }
    }
    cr.c.spin(dt, 20 + cr.thr * 60);
    P.pos.copy(g.position); _e.setFromQuaternion(g.quaternion, 'YXZ'); P.rotY = _e.y; P.air = 0; P.vy = 0; P.fling = null;
    const s = D.sfx2(); if (s) { s.engine(18 + cr.thr * 60, cr.thr, true); s.wind(clamp(cr.vel.length() / 80, 0, 1)); }
  }

  // ---- helicopter: hover, slide, climb, turn where you look
  function hover(cr, dt) {
    const k = D.keys, g = cr.g, P = D.player, h = half(cr.c);
    const fb = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0), lr = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ud = (k.has('Space') ? 1 : 0) - (k.has('KeyC') || k.has('ControlLeft') ? 1 : 0);
    cr.thr = clamp(cr.thr + dt * (cr.grounded && !ud ? -0.5 : 0.8), 0, 1); // rotor spins up when you lift, winds down on the ground
    _e.setFromQuaternion(g.quaternion, 'YXZ');
    const yawWant = D.cam.yaw + Math.PI; let yaw = _e.y + wrap(yawWant - _e.y) * Math.min(1, dt * (cr.grounded ? 0.6 : 1.6));
    const fx = Math.sin(yaw), fz = Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw);
    if (!cr.grounded || ud > 0) {
      cr.vel.x += (fx * fb * 11 + sx * lr * 8) * dt * cr.thr; cr.vel.z += (fz * fb * 11 + sz * lr * 8) * dt * cr.thr;
      cr.vel.y += ud * 7 * dt * cr.thr; cr.vel.multiplyScalar(Math.exp(-0.7 * dt));
      const hs = Math.hypot(cr.vel.x, cr.vel.z); if (hs > 55) { cr.vel.x *= 55 / hs; cr.vel.z *= 55 / hs; }
      g.position.addScaledVector(cr.vel, dt); D.boundsClamp(g.position); cr.grounded = false;
    } else { cr.vel.set(0, 0, 0); yaw = _e.y; }
    const ground = D.heightAt(g.position.x, g.position.z) + h;
    if (g.position.y <= ground) {
      if (cr.vel.y < -9 || Math.hypot(cr.vel.x, cr.vel.z) > 18) return crash(cr);
      g.position.y = ground; cr.vel.y = Math.max(0, cr.vel.y); if (ud <= 0 && Math.hypot(cr.vel.x, cr.vel.z) < 3) cr.grounded = true;
    }
    const p = { x: g.position.x, z: g.position.z }, hit = D.collideCircle(p, 4, false, g.position.y);
    if (hit) { if (Math.hypot(cr.vel.x, cr.vel.z) > 14) return crash(cr); g.position.x = p.x; g.position.z = p.z; cr.vel.x *= -0.3; cr.vel.z *= -0.3; }
    // nose dips into the direction of travel, rolls into a slide
    const vf = cr.vel.x * fx + cr.vel.z * fz, vs = cr.vel.x * sx + cr.vel.z * sz;
    _e.set(clamp(vf * 0.012 + fb * 0.08, -0.35, 0.35), yaw, clamp(-vs * 0.012 - lr * 0.08, -0.35, 0.35)); g.quaternion.slerp(_q.setFromEuler(_e), Math.min(1, dt * 4));
    cr.c.spin(dt, 26 * cr.thr);
    P.pos.copy(g.position); P.rotY = yaw; P.air = 0; P.vy = 0; P.fling = null;
    const s = D.sfx2(); if (s) { s.engine(cr.thr * 40, cr.thr, cr.thr > 0.05); s.wind(clamp(Math.hypot(cr.vel.x, cr.vel.z) / 55, 0, 1)); }
  }

  function crash(cr) {
    const g = cr.g.position; D.explosionAt(g.x, g.y, g.z, 12, 'player');
    const was = D.FLY.craft === cr; if (was) { D.FLY.craft = null; D.player.rig.g.visible = true; D.cam.dist = 6.5; D.hurtPlayer(999, 'explosion'); }
    cr.g.visible = false; crafts.splice(crafts.indexOf(cr), 1); D.scene.remove(cr.g);
    const s = D.sfx2(); if (s && was) s.engine(0, 0, false);
  }

  function update(dt) {
    const cr = D.FLY.craft;
    if (cr) { if (cr.type === 'boat') sail(cr, dt); else if (cr.type === 'plane') fly(cr, dt); else hover(cr, dt); }
    for (const a of crafts) { // aircraft left in the air: nose down and in
      if (!(a.falling > 0) || a === cr) continue;
      a.falling -= dt; a.vel.y -= 12 * dt; a.g.position.addScaledVector(a.vel, dt); a.c.spin(dt, 10);
      _w.copy(a.vel).normalize(); a.g.quaternion.slerp(_q.setFromUnitVectors(_v.set(0, 0, 1), _w), Math.min(1, dt));
      if (a.g.position.y < D.heightAt(a.g.position.x, a.g.position.z) + 1 || a.falling <= 0) crash(a);
    }
  }
  return { crafts, addAircraft, addBoat, near, board, leave, update };
}
