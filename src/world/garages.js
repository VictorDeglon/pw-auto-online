// Your garages. The first one, by Poway High, is index.html's (setupGarage); the story opens more of them as people
// start trusting you with a parking spot: a bay at Dee's, the Salas barn, the boat lot at the lake.
// Each is an auto shop by the road with the same menu (save, repair, tune, take a car out). Whichever garage is
// nearest is the one a car you take out comes out of. All of them are on both maps (garageMarks).
//   initGarages()      once, after initStory     updateGarages(dt)   every frame
//   garageMarks(home)  map markers: home = index.html's GARAGE
import { ctx } from '../ctx.js';
import { isUnlocked as storyUnlocked } from '../story/unlocks.js';

export const GARAGES = [
  { key: 'garage:dee', name: 'Dee\'s Garage', at: 'deeGarage', why: 'Tommy\'s Friend' },
  { key: 'garage:canyon', name: 'Salas barn', at: 'canyonMouth', why: 'Sycamore Smoke' },
  { key: 'garage:lake', name: 'Lake Poway boat lot', at: 'lakeGate', why: 'The Lake' },
];
let home = null, t = 0;

// the same auto shop as the home garage (index.html garageAt), on the nearest site where all of it fits (garageSite)
function build(G) {
  const pt = ctx.storyPlace && ctx.storyPlace(G.at); if (!pt || !ctx.garageAt) return;
  const s = ctx.garageSite(pt.x, pt.z, e => e.t >= 1 && e.t <= 5); if (!s) return;
  const S = ctx.garageAt(s.x, s.z, s.rot, 'GARAGE', G.name);
  G.spot = S; G.mesh = S.group;
}
export function initGarages() { home = ctx.garage || null; for (const G of GARAGES) if (storyUnlocked(G.key)) build(G); }
export function updateGarages(dt) {
  t -= dt; if (t > 0) return; t = 0.5;
  for (const G of GARAGES) if (!G.mesh && storyUnlocked(G.key)) { build(G); if (G.spot) ctx.notify(`New garage: <b>${G.name}</b>. Save and repair cars there (on your map).`, 'green', 6000); }
  // a car you take out comes out of the garage you're at
  if (!home) home = ctx.garage || null; if (!home || ctx.garageOpen) return;
  const f = ctx.focusPos(); let best = home, bd = Math.hypot(home.x - f.x, home.z - f.z);
  for (const G of GARAGES) if (G.spot) { const d = Math.hypot(G.spot.x - f.x, G.spot.z - f.z); if (d < bd) { bd = d; best = G.spot; } }
  if (ctx.garage !== best) ctx.garage = best;
}
export function garageMarks(h) {
  const out = []; if (home || h) { const g = home || h; out.push({ kind: 'icon', pri: 3, x: g.x, z: g.z, glyph: 'garage', color: '#d9dde3', label: 'Your garage', group: 'garage', plural: 'garages', always: true }); }
  for (const G of GARAGES) if (G.spot) out.push({ kind: 'icon', pri: 3, x: G.spot.x, z: G.spot.z, glyph: 'garage', color: '#d9dde3', label: G.name, group: 'garage', plural: 'garages', always: true });
  return out;
}
