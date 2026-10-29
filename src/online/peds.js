// The room's people online (server/nakama/peds.js): the server walks them along the sidewalks and everyone draws the
// same ones, wherever the players are, near each other or not. Snapshots arrive five times a second; each person is
// a puppet Ped (so bullets, punches, cars and explosions find them like anyone) that glides to where the room says
// (src/online/world.js puppetAI). While it's on, this game spawns no people of its own (index.html updatePopulation).
// A hit on one is shown here at once and told to the room, which decides when they're dead; a death the room reports
// (someone else's shot) drops them here too.
//   initNetPeds(hooks)  updateNetPeds()  NETPEDS.on  netPedHit(p, damage)  clearNetPeds()
//   hooks: { make(x, z, look) -> Ped, kill(p) }
import { on, pedHit } from './net.js';

const ST = ['walk', 'flee', 'dead', 'idle']; // server/nakama/peds.js p.st
export const NETPEDS = { on: false, peds: new Map() };
let H = null;

export function initNetPeds(hooks) {
  H = hooks;
  on('peds:on', v => { NETPEDS.on = !!v; if (!v) clearNetPeds(); else if (H.onStart) H.onStart(); });
  on('peds', onSnap);
}

function onSnap(d) {
  if (!NETPEDS.on || !H) return;
  const now = performance.now(), looks = new Map();
  for (const n of d.n || []) looks.set(n[0], n[1]);
  for (const [id, x10, z10, r100, st, v10] of d.c || []) {
    let p = NETPEDS.peds.get(id);
    if (p && p.removed) { NETPEDS.peds.delete(id); p = null; }
    const x = x10 / 10, z = z10 / 10, r = r100 / 100, state = ST[st] || 'walk';
    if (!p) {
      if (state === 'dead') continue; // a body we never saw alive: not worth a new person
      p = H.make(x, z, looks.get(id) ?? (id % 64)); if (!p) continue;
      p.netPed = id; p.puppet = { id: 'n' + id, net: true }; p.rotY = r; NETPEDS.peds.set(id, p);
    }
    const P = p.puppet; if (!P) continue;
    if (P.tx !== undefined) { const dtS = Math.max(0.15, (now - P.at) / 1000); P.vx = (x - P.tx) / dtS; P.vz = (z - P.tz) / dtS; }
    if (state === 'idle' || state === 'dead') P.vx = P.vz = 0;
    P.tx = x; P.tz = z; P.tr = r; P.st = state; P.at = now;
    if (state === 'dead' && p.state !== 'dead' && H.kill) H.kill(p); // the room says so: someone else's shot
  }
  for (const id of d.g || []) { const p = NETPEDS.peds.get(id); NETPEDS.peds.delete(id); if (p && !p.removed) p.remove(); }
}

// once a frame (the puppets move in their own AI: world.js puppetAI)
export function updateNetPeds() { if (!NETPEDS.on) return; for (const [id, p] of NETPEDS.peds) if (p.removed) NETPEDS.peds.delete(id); }
export function netPedHit(p, d) { if (p && p.netPed && NETPEDS.on && d > 0) pedHit(p.netPed, d); }
export function clearNetPeds() { for (const p of NETPEDS.peds.values()) if (!p.removed) p.remove(); NETPEDS.peds.clear(); } // ids start over in each room
