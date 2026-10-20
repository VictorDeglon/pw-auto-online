// The room's traffic online (server/nakama/traffic.js): the server runs the cars and every player draws the same ones.
// Snapshots arrive five times a second; each car is shown a little in the past (DELAY), smoothed between the two
// snapshots around that moment, and set on the ground here. While it's on, this game spawns no traffic of its own
// (index.html updatePopulation). A hit on one of these cars, or taking one, tells the room; a car the room wrecks blows
// up here as an ordinary wreck.
//   initNetTraffic()  updateNetTraffic()  NETTRAFFIC.on  netCarHit(v, damage)  netCarTake(v)  clearNetTraffic()
import { on, trafficHit, trafficTake } from './net.js';
import { ctx } from '../ctx.js';

const TYPES = ['sedan', 'sedan', 'sedan', 'suv', 'suv', 'pickup', 'van', 'sports', 'bus']; // server/nakama/traffic.js TR_TYPES
const DELAY = 220; // ms behind the newest snapshot: a snapshot every 200 ms, plus a little for the network
export const NETTRAFFIC = { on: false, cars: new Map() };

export function initNetTraffic() {
  on('traffic:on', v => { NETTRAFFIC.on = !!v; if (!v) clearNetTraffic(); });
  on('traffic', onSnap);
}

function make(id, ty, ti, md, x, z, r) {
  const type = TYPES[ty] || 'sedan', spec = ctx.CAR[type]; if (!spec) return null;
  const model = spec.model[(md | 0) % spec.model.length], tint = ctx.CAR_TINTS[(ti | 0) % ctx.CAR_TINTS.length];
  const v = new ctx.Vehicle(type, x, z, r, tint, model);
  v.net = id; v.mode = 'net'; v.driver = 'ai'; v.keep = true; v.snaps = []; ctx.settleCar(v);
  return v;
}

export function onSnap(d) { // exported for tests; normally fed by the room (on traffic)
  if (!NETTRAFFIC.on) return;
  const now = performance.now(), desc = new Map();
  for (const n of d.n || []) desc.set(n[0], n);
  for (const [id, x10, z10, r100, v10] of d.c || []) {
    let v = NETTRAFFIC.cars.get(id);
    if (v && (v.removed || !v.net)) { NETTRAFFIC.cars.delete(id); continue; } // gone, or someone's driving it now
    if (!v) { const n = desc.get(id) || [id, 0, 0, 0]; v = make(id, n[1], n[2], n[3], x10 / 10, z10 / 10, r100 / 100); if (!v) continue; NETTRAFFIC.cars.set(id, v); }
    v.snaps.push({ t: now, x: x10 / 10, z: z10 / 10, r: r100 / 100, v: v10 / 10 }); if (v.snaps.length > 6) v.snaps.shift();
  }
  for (const id of d.g || []) { const v = NETTRAFFIC.cars.get(id); NETTRAFFIC.cars.delete(id); if (v && v.net && !v.removed && v !== ctx.player.inCar) v.remove(); }
  for (const b of d.x || []) { // the room wrecked it: from here on it's an ordinary wreck in this game
    const v = NETTRAFFIC.cars.get(b[0]); NETTRAFFIC.cars.delete(b[0]);
    if (v && !v.removed) { v.net = null; v.mode = 'free'; v.driver = null; v.snaps = null; ctx.damageCar(v, 999, null, true); }
  }
}

// every frame, before the vehicles are drawn
export function updateNetTraffic() {
  if (!NETTRAFFIC.on || !NETTRAFFIC.cars.size) return;
  const t = performance.now() - DELAY;
  for (const v of NETTRAFFIC.cars.values()) {
    const S = v.snaps; if (!S || !S.length || v.removed || !v.net) continue;
    let a = S[0], b = S[S.length - 1];
    for (let i = 0; i < S.length - 1; i++) if (S[i].t <= t && S[i + 1].t >= t) { a = S[i]; b = S[i + 1]; break; }
    const k = b.t > a.t ? Math.max(0, Math.min(1.25, (t - a.t) / (b.t - a.t))) : 1; // a little past the newest if the next one is late
    let dr = b.r - a.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    const r = a.r + dr * k, sp = a.v + (b.v - a.v) * k;
    v.pos.x = a.x + (b.x - a.x) * k; v.pos.z = a.z + (b.z - a.z) * k; v.rotY = r; v.speed = sp; v.vel.set(Math.sin(r) * sp, Math.cos(r) * sp);
    v.braking = b.v < a.v - 0.3;
    ctx.settleCar(v); // height and tilt from the ground under it
  }
}

export function netCarHit(v, d) { if (v && v.net && NETTRAFFIC.on && d > 0) trafficHit(v.net, d); }
// you got in: it's yours now (a normal car in your game), and it leaves the room's traffic for everyone
export function netCarTake(v) { if (!v || !v.net) return; trafficTake(v.net); NETTRAFFIC.cars.delete(v.net); v.net = null; v.mode = 'free'; v.snaps = null; v.keep = false; }
export function clearNetTraffic() { for (const v of NETTRAFFIC.cars.values()) if (!v.removed && v !== ctx.player.inCar) v.remove(); NETTRAFFIC.cars.clear(); }
