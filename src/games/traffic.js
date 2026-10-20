// Downtown traffic for Hide & Seek, the same for every player: each car's place is a function of the server clock,
// so nobody has to send it. Four lanes on every street, cars every D metres (some slots empty), all moving at the
// same speed; crossing streets are timed half a slot apart, so at every junction north-south and east-west cars take
// turns without ever touching (defs.js has the numbers). At the edge of the grid the streets run into tunnels in the
// wall of towers, and the cars come back out the far side.
//
// Drawing: one InstancedMesh per part of each car model (the game's own car models and paint materials, from
// ctx.buildCar), so 300+ cars cost a few dozen draw calls, and a player's car drawn through the same path is
// indistinguishable from traffic. Matrices are written straight into the instance buffers.
import { ctx } from '../ctx.js';
import { DEFS } from './defs.js';

export const LOOKS = [['sedan', 'q-sedan'], ['sedan', 'q-compact'], ['sedan', 'q-taxi'], ['suv', 'q-suv'], ['pickup', 'truck'], ['van', 'van'], ['sedan', 'q-sedan'], ['suv', 'q-suv']];
export const TINTS = [0xf2f2f0, 0xf2f2f0, 0xe8e4da, 0xb8bcc0, 0xb8bcc0, 0x8a8e93, 0x5d6166, 0x1b1c1e, 0x1b1c1e, 0x1f3354, 0x2f5f9e, 0x9e1b1b, 0x5a1a20, 0xc9b48f, 0x2c4a36, 0x7a8a99];
const H = DEFS.HS, OCC = 0.8, CAP = 700;
const hash = (a, b, c = 0) => { let h = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };

// ---- the lanes: [axis (0 = along z, 1 = along x), cross position, direction, phase]
export const LANES = [];
for (let i = 0; i < H.n; i++) {
  const s = DEFS.hsStreet(i);
  for (const off of [2.5, 7.5]) {
    LANES.push([0, s - off, 1, 0], [0, s + off, -1, 0]);        // northbound/southbound (heading +z keeps to -x)
    LANES.push([1, s + off, 1, H.D / 2], [1, s - off, -1, H.D / 2]); // east/west (heading +x keeps to +z)
  }
}
const SLOTS = Math.round(H.loop * 2 / H.D);
// every car on the road at server time t (s): calls fn(lane, k, x, z, rot, s, look, tint) for the ones in the open
export function eachCar(t, fn, cull) {
  const L = H.loop * 2, base = (H.v * t) % L;
  for (let li = 0; li < LANES.length; li++) {
    const [ax, c, dir, ph] = LANES[li];
    if (cull && !cull(ax, c)) continue;
    for (let k = 0; k < SLOTS; k++) {
      if (hash(li, k) > OCC) continue;
      const s = ((base + k * H.D + ph) % L) - H.loop; // -loop..loop along the lane
      if (Math.abs(s) > H.wall + 6) continue; // in the tunnels
      const p = dir * s, x = ax ? p : c, z = ax ? c : p, rot = ax ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      fn(li, k, x, z, rot, s, (hash(li, k, 1) * LOOKS.length) | 0, TINTS[(hash(li, k, 2) * TINTS.length) | 0]);
    }
  }
}
// cars within r of a local point (for bumps and rockets)
export function carsNear(t, x, z, r, fn) {
  eachCar(t, (li, k, cx, cz, rot, s, look, tint) => { if (Math.abs(cx - x) < r && Math.abs(cz - z) < r) fn(li, k, cx, cz, rot, look, tint); }, (ax, c) => Math.abs((ax ? z : x) - c) < r);
}

// ---- drawing
export function createCarKit(parent) {
  const { THREE } = ctx, models = [];
  for (const [type, model] of LOOKS) {
    if (models.some(m => m.model === model)) { models.push(models.find(m => m.model === model)); continue; }
    const c = ctx.buildCar(type, 0xffffff, model); ctx.scene.remove(c.g); c.g.position.set(0, 0, 0); c.g.rotation.set(0, 0, 0); c.g.updateMatrixWorld(true);
    const parts = [], inv = new THREE.Matrix4(), wheelOf = new Map();
    c.wheels.forEach((w, i) => w.w.traverse(o => wheelOf.set(o, i)));
    c.g.traverse(o => {
      if (!o.isMesh || !o.visible || (c.beam && (o === c.beam || o.parent === c.beam))) return;
      const wi = wheelOf.has(o) ? wheelOf.get(o) : -1, tint = !!(o.material.userData && o.material.userData.base);
      let mat = o.material; if (tint) { mat = o.material.clone(); mat.color.copy(o.material.userData.base); }
      const im = new THREE.InstancedMesh(o.geometry, mat, CAP); im.count = 0; im.frustumCulled = false; im.castShadow = wi < 0; im.receiveShadow = true;
      if (tint) { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3); }
      parent.add(im);
      const part = { im, wi, tint, L: o.matrixWorld.clone() };
      if (wi >= 0) { const W = c.wheels[wi]; part.piv = W.piv.matrixWorld.clone(); part.inner = inv.copy(W.w.matrixWorld).invert().multiply(o.matrixWorld).clone(); part.wobj = W.w; }
      parts.push(part);
    });
    models.push({ model, type, parts, L: c.L, W: c.W, H: c.H, wr: c.wr || 0.35 });
  }
  const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _c = new THREE.Color();
  let spin = 0;
  const kit = {
    models,
    begin(dist) { // a frame starts: wheel angle for everyone at traffic speed
      spin = dist;
      for (const M of models) {
        if (M._f === kit._frame) continue; M._f = kit._frame;
        for (const p of M.parts) {
          p.im.count = 0;
          if (p.wi >= 0) { const w = p.wobj; w.rotation.x = spin / M.wr; w.updateMatrix(); p.L = _w.copy(p.piv).multiply(w.matrix).multiply(p.inner).clone(); }
        }
      }
    },
    // one car: model index, tint, local x, y, z, yaw
    add(mi, tint, x, y, z, rot) {
      const M = models[mi], c = Math.cos(rot), s = Math.sin(rot);
      for (const p of M.parts) {
        const im = p.im; if (im.count >= CAP) continue;
        const e = p.L.elements, o = im.instanceMatrix.array, k = im.count * 16;
        // Ry(rot) * L, then + (x, y, z)
        for (let col = 0; col < 4; col++) { const a = e[col * 4], b = e[col * 4 + 1], d = e[col * 4 + 2]; o[k + col * 4] = c * a + s * d; o[k + col * 4 + 1] = b; o[k + col * 4 + 2] = -s * a + c * d; o[k + col * 4 + 3] = e[col * 4 + 3]; }
        o[k + 12] += x; o[k + 13] += y; o[k + 14] += z;
        if (p.tint) { _c.set(tint); im.instanceColor.array[im.count * 3] = _c.r; im.instanceColor.array[im.count * 3 + 1] = _c.g; im.instanceColor.array[im.count * 3 + 2] = _c.b; }
        im.count++;
      }
    },
    end() { for (const M of models) for (const p of M.parts) { p.im.instanceMatrix.needsUpdate = true; if (p.tint) p.im.instanceColor.needsUpdate = true; } kit._frame = (kit._frame || 0) + 1; },
    indexOf(model) { return models.findIndex(m => m.model === model); },
  };
  kit._frame = 1;
  return kit;
}
