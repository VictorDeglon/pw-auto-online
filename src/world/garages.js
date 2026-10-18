// Your garages. The first one, by Poway High, is index.html's (setupGarage); the story opens more of them as people
// start trusting you with a parking spot: a bay at Dee's, the Salas barn, the boat lot at the lake.
// Each is a carport by the road with the same menu (save, repair, mechanic, take a car out). Whichever garage is
// nearest is the one a car you take out comes out of. All of them are on both maps (garageMarks).
//   initGarages()      once, after initStory     updateGarages(dt)   every frame
//   garageMarks(home)  map markers: home = index.html's GARAGE
import { ctx } from '../ctx.js';
import { addInteract } from '../interact.js';
import { isUnlocked as storyUnlocked } from '../story/unlocks.js';

export const GARAGES = [
  { key: 'garage:dee', name: 'Dee\'s Garage', at: 'deeGarage', why: 'Tommy\'s Friend' },
  { key: 'garage:canyon', name: 'Salas barn', at: 'canyonMouth', why: 'Sycamore Smoke' },
  { key: 'garage:lake', name: 'Lake Poway boat lot', at: 'lakeGate', why: 'The Lake' },
];
let home = null, t = 0;

// a bay just off the road, on the side the place is on, clear of buildings
function siteFor(pt) {
  const ne = ctx.nearestEdge(pt.x, pt.z, 200, e => e.t >= 1 && e.t <= 5); if (!ne) return null;
  const e = ctx.edges[ne.e], nx = -ne.tz, nz = ne.tx, side = (pt.x - ne.x) * nx + (pt.z - ne.z) * nz >= 0 ? 1 : -1;
  for (const off of [e.w / 2 + 6, e.w / 2 + 9, e.w / 2 + 12]) for (const along of [0, 10, -10, 20, -20]) {
    const x = ne.x + nx * off * side + ne.tx * along, z = ne.z + nz * off * side + ne.tz * along, q = { x, z };
    if (ctx.collideCircle(q, 3.2, false)) continue; // a building (or a wall) there
    return { x, z, rot: Math.atan2(-nx * side, -nz * side) }; // the open side faces the road
  }
  return null;
}
function build(G) {
  const pt = ctx.storyPlace && ctx.storyPlace(G.at); if (!pt) return;
  const s = siteFor(pt); if (!s) return;
  const THREE = ctx.THREE, g = new THREE.Group(), y = ctx.heightAt(s.x, s.z);
  g.position.set(s.x, y, s.z); g.rotation.y = s.rot;
  const post = ctx.lam('#2a2d31'), roof = ctx.lam('#5a3a2a');
  for (const [px, pz] of [[-1.9, -3.2], [1.9, -3.2], [-1.9, 3.2], [1.9, 3.2]]) { const m = new THREE.Mesh(ctx.boxG(0.14, 2.7, 0.14), post); m.position.set(px, 1.35, pz); m.castShadow = true; g.add(m); }
  const top = new THREE.Mesh(ctx.boxG(4.4, 0.18, 7.2), roof); top.position.set(0, 2.78, 0); top.castShadow = top.receiveShadow = true; g.add(top);
  const pad = new THREE.Mesh(ctx.boxG(4, 0.04, 6.8), ctx.lam('#3b3e43')); pad.position.y = 0.03; pad.receiveShadow = true; g.add(pad);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.62), new THREE.MeshBasicMaterial({ map: ctx.canvasTex(512, 100, c => { c.fillStyle = '#1b1e22'; c.fillRect(0, 0, 512, 100); c.fillStyle = '#f0b23a'; c.font = 'bold 54px Arial'; c.textAlign = 'center'; c.fillText('GARAGE', 256, 70); }) }));
  sign.position.set(0, 2.5, -3.62); sign.rotation.y = Math.PI; g.add(sign);
  ctx.scene.add(g);
  G.spot = { x: s.x, z: s.z, rot: s.rot + Math.PI, door: { x: s.x, z: s.z } }; G.mesh = g;
  G.it = addInteract({ x: s.x, z: s.z, r: 6.5, when: () => !ctx.online, label: () => ctx.player.inCar ? `${G.name}: save / repair / mechanic` : `${G.name}: your cars`, onUse: () => { ctx.garage = G.spot; ctx.openGarage && ctx.openGarage(); } });
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
