// Street crime around Poway, and the witnesses who can turn it into stars (the rule itself is crime() in
// src/police.js: no witness, no stars). Single-player only: none of this runs in an online room.
//
// Each kind of crime opens up through the story (the `learn` step, src/story/unlocks.js), never all at once:
//   shoplifting · pickpocketing · mugging · car theft off driveways (Dee's repo list) · the chop shop · the fence ·
//   catalytic converters · burglary (at night) · ATM skimming · store stick-ups · cooler runs · armored trucks ·
//   protection money · insurance fraud. Murder, assault and carjacking are there from the start.
// And three abilities: lockpicking (quiet car theft, faster break-ins), intimidation (aim at a witness and they put
// the phone away) and Walt's police scanner (you hear the 911 calls coming).
//
// How it plays: a crime is a spot (a store door, an ATM, a dark house, a parked car, the person in front of you) and
// "hold E" to do it. Doing it calls crime(), which finds the witnesses. Witnesses get an eye over their head and a
// count in the corner; they run, then dial; stop them (or scare them quiet) before the call goes through.
//   initCrimes()       once the world is up (the story calls it)
//   updateCrimes(dt)   every frame
//   crimeMarks()       blips for both maps (the story adds them to its own)
//   nearestCrimeSpot(kind)   where a mission's "do this crime once" step points you
//   crimeJournal()     the pause menu's crime page
import { ctx } from '../ctx.js';
import { on, emit } from '../events.js';
import { addInteract, removeInteract } from '../interact.js';
import { police, crime, setWanted, witness, silence, addWatcher, sawIt } from '../police.js';
import { isUnlocked } from './unlocks.js';
import { driveTo } from '../drive.js';
import { skill } from '../progress.js';
import { initHeists, updateHeists, heistMarks } from './heists.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hyp = Math.hypot;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const money = n => '$' + Math.round(n).toLocaleString();
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; }

// ------------------------------------------------------------------ the list (also the journal's crime page)
export const CRIMES = [
  { key: 'core', name: 'Assault, murder, carjacking', how: 'From the start. Only a witness, a deputy or a camera turns them into stars.' },
  { key: 'crime:shoplift', name: 'Shoplifting', how: 'Hold E at a store or gas station door. Goods go to the fence.', from: 'Homecoming (Rosa)' },
  { key: 'crime:repo', name: 'Car theft off driveways', how: 'Dee\'s repo list: the cars she wants, parked at houses around town. Bring them to her garage.', from: 'Tommy\'s Friend (Dee)' },
  { key: 'ability:lockpick', name: 'Lockpicking (ability)', how: 'Hold E by a parked car to open it quietly: no alarm, no angry owner. Break-ins go twice as fast.', from: 'Tommy\'s Friend (Dee)' },
  { key: 'crime:pickpocket', name: 'Pickpocketing', how: 'Walk up behind someone, hold E. If they turn around, they shout.', from: 'Lucky Break (Lucky)' },
  { key: 'crime:fence', name: 'The fence', how: 'Lucky buys what you steal, at whatever she\'s paying today.', from: 'Lucky Break (Lucky)' },
  { key: 'crime:chop', name: 'The chop shop', how: 'Drive any stolen car into Kirkham Auto Salvage. Torque pays by the car.', from: 'Night Shift (Dee)' },
  { key: 'crime:parts', name: 'Catalytic converters', how: 'Crouch (C) by a parked car, hold E. Loud: anyone close hears the saw.', from: 'Cat Scratch (Lucky)' },
  { key: 'crime:mugging', name: 'Mugging', how: 'Aim a gun at someone up close. They hand it over, then they call.', from: 'Personal Effects (Rosa)' },
  { key: 'crime:burglary', name: 'Burglary', how: 'After 9 PM, dark houses can be broken into. Some of them aren\'t empty.', from: 'Open House (Lucky)' },
  { key: 'ability:scanner', name: 'Police scanner (ability)', how: 'You hear witnesses dialing 911, and where.', from: 'The Sergeant (Walt)' },
  { key: 'crime:runs', name: 'Cooler runs', how: 'Nina\'s coolers across town against the clock. A deputy who sees you with one: two stars.', from: 'Feed Store (Nina)' },
  { key: 'crime:skim', name: 'ATM skimming', how: 'Plant a skimmer on a bank\'s ATM, come back in a few hours for the card numbers. Mind the camera.', from: 'Card Tricks (Nina)' },
  { key: 'ability:intimidate', name: 'Intimidation (ability)', how: 'Aim at a witness and they put the phone away.', from: 'Second Opinion (Nina)' },
  { key: 'crime:stickup', name: 'Store stick-ups', how: 'Gun out at a store door, hold E. The silent alarm gives you about half a minute.', from: 'Register (Nina)' },
  { key: 'crime:heist', name: 'Armored trucks', how: 'Now and then a cash truck runs between the banks. Stop it, the bags are in the back.', from: 'Armored (Nina)' },
  { key: 'crime:racket', name: 'Protection money', how: 'Lean on businesses along Poway Road. They pay every day.', from: 'Family Dinner (Nina)' },
  { key: 'crime:fraud', name: 'Insurance fraud', how: 'Brake hard in front of traffic and let them rear-end you. The claim pays out a minute later.', from: 'Insurance (Lang)' },
];

// ------------------------------------------------------------------ state (save.crime)
function S() {
  const s = ctx.save.crime || (ctx.save.crime = {});
  s.loot ||= []; s.skims ||= {}; s.robbed ||= {}; s.burgled ||= {}; s.racket ||= []; s.repo ||= { list: [], day: '' }; s.stats ||= {};
  return s;
}
const today = () => (ctx.clock && ctx.clock.date) || 'd';
const night = () => { const h = ctx.hour; return h >= 21 || h < 5; };
const off = () => ctx.online || !ctx.running || ctx.player.dead;
function stat(k, n = 1) { const st = S().stats; st[k] = (st[k] || 0) + n; }
function done(kind, extra) { stat(kind); emit('crime:done', Object.assign({ kind }, extra)); }
function cash(n, why) { ctx.save.money += n; ctx.sfx.cash(); ctx.notify(`${why} <b>+${money(n)}</b>`, 'green', 3000); }

// loot you carry until you sell it
const LOOT = {
  store: [['a carton of cigarettes', 70], ['two bottles of tequila', 55], ['a box of razor cartridges', 45], ['baby formula', 60], ['a case of energy drinks', 30], ['a bag of steaks', 50]],
  pocket: [['a phone', 90], ['a watch', 140], ['wireless earbuds', 70], ['a gold chain', 160]],
  house: [['a laptop', 320], ['a jewelry box', 480], ['a game console', 240], ['a camera bag', 260], ['a coin collection', 560], ['prescription pills', 150], ['a designer handbag', 300], ['a tool chest', 220]],
};
const BAG = 14;
function take(item, value) {
  const L = S().loot; if (L.length >= BAG) { ctx.notify('Your bag is full. Sell some of it to the fence.', 'red', 3000); return false; }
  L.push({ n: item, v: value }); ctx.notify(`Took <b>${esc(item)}</b> · bag ${L.length}/${BAG}`, '', 2600); ctx.sfx.cash(); return true;
}

// ------------------------------------------------------------------ hold E
let H = null; // { label, t, need, at, r, onDone, cancel }
function hold(o) { if (H) return; H = Object.assign({ t: 0 }, o); }
function updateHold(dt) {
  if (!H) return;
  const P = ctx.player, f = ctx.focusPos(), away = H.at && hyp(f.x - H.at.x, f.z - H.at.z) > (H.r || 3);
  const why = !ctx.keys.has('KeyE') ? 'let go' : away ? 'moved away' : H.cancel ? H.cancel() : null;
  if (why || P.dead) { if (H.onStop) H.onStop(why); H = null; hud(); return; }
  H.t += dt; if (H.tick) H.tick(dt, H.t); if (!H) return; // the tick can end it (they noticed you)
  if (H.t >= H.need) { const h = H; H = null; hud(); h.onDone(); return; }
  hud(`<b>${esc(H.label)}</b><div class="meter"><i style="width:${(H.t / H.need * 100).toFixed(1)}%"></i></div>`);
}
let hudHtml = '';
function hud(html = '') { if (html === hudHtml) return; hudHtml = html; const el = $('crimehud'); if (!el) return; el.innerHTML = html; el.hidden = !html; }

// ------------------------------------------------------------------ spots: stores, banks, houses
const SPOTS = { store: [], bank: [], racket: [] };
let houseGrid = null; const HG = 200;
function genericKind(p) {
  if (p.type === 'fuel') return 'gas station';
  if (p.type === 'bank') return 'bank';
  const n = p.name || '';
  if (/7-Eleven|Circle K|AM ?PM|Mart\b|Liquor|Market|Express/i.test(n)) return 'convenience store';
  if (/Albertsons|Ralphs|Vons|Trader|Sprouts|Smart & Final|Grocery|Foods?\b|Stater/i.test(n)) return 'grocery store';
  if (/CVS|Walgreens|Rite Aid|Pharmacy|Drug/i.test(n)) return 'pharmacy';
  if (/Target|Walmart|Dollar|Goodwill|TJ|Marshalls|Ross|Kohl|Petco|Staples|Michaels|Lowe|Home Depot|Barnes/i.test(n)) return 'store';
  return null;
}
// the sidewalk in front of a place, on its side of the street, and which way is "in"
function frontOf(x, z) {
  const ne = ctx.nearestEdge(x, z, 140, e => e.t >= 1 && e.t <= 5); if (!ne) return null;
  const e = ctx.edges[ne.e], nx = -ne.tz, nz = ne.tx, side = (x - ne.x) * nx + (z - ne.z) * nz >= 0 ? 1 : -1, o = e.w / 2 + 2.6;
  return { x: ne.x + nx * o * side, z: ne.z + nz * o * side, ix: nx * side, iz: nz * side, street: e.name || '' };
}
function buildSpots() {
  for (const p of ctx.POIS) {
    const kind = genericKind(p);
    if (kind && kind !== 'bank') { const d = frontOf(p.x, p.z); if (d) SPOTS.store.push(Object.assign(d, { id: 's' + Math.round(p.x) + ':' + Math.round(p.z), kind, cam: kind === 'gas station' || hash(p.name + p.x) < 0.6 })); }
    if (p.type === 'bank') { const d = frontOf(p.x, p.z); if (d) SPOTS.bank.push(Object.assign(d, { id: 'b' + Math.round(p.x) + ':' + Math.round(p.z), kind: 'ATM', cam: true })); }
    if (/shop|restaurant|cafe|fast_food/.test(p.type)) { const d = frontOf(p.x, p.z); if (d && d.street === 'Poway Road' && hyp(d.x - p.x, d.z - p.z) < 90) SPOTS.racket.push(Object.assign(d, { id: 'r' + Math.round(p.x) + ':' + Math.round(p.z), kind: /restaurant|cafe|fast_food/.test(p.type) ? 'restaurant' : 'shop' })); }
  }
  // houses, for burglary and the cars in their driveways: a grid of indices into D.buildings
  houseGrid = new Map(); const B = ctx.D.buildings;
  for (let i = 0; i < B.length; i++) { const b = B[i]; if (b[1] !== 0) continue; const f = b[2]; const k = Math.floor(f[0] / HG) * 100000 + Math.floor(f[1] / HG); let c = houseGrid.get(k); if (!c) houseGrid.set(k, c = []); c.push(i); }
}
const houseCache = new Map();
function house(i) { // centroid, front door and driveway of house i (or null when it doesn't face a street)
  if (houseCache.has(i)) return houseCache.get(i);
  const f = ctx.D.buildings[i][2], n = f.length / 2; let cx = 0, cz = 0; for (let k = 0; k < n; k++) { cx += f[k * 2]; cz += f[k * 2 + 1]; } cx /= n; cz /= n;
  let r = null; const ne = ctx.nearestEdge(cx, cz, 45, e => e.t >= 3 && e.t <= 5);
  if (ne) {
    let dx = ne.x - cx, dz = ne.z - cz; const l = hyp(dx, dz) || 1; dx /= l; dz /= l;
    let hd = 0; for (let k = 0; k < n; k++) hd = Math.max(hd, (f[k * 2] - cx) * dx + (f[k * 2 + 1] - cz) * dz);
    const door = { x: cx + dx * (hd + 0.9), z: cz + dz * (hd + 0.9) }, sx = -dz, sz = dx;
    const drive = { x: cx + dx * (hd + 4.2) + sx * 3, z: cz + dz * (hd + 4.2) + sz * 3, rot: Math.atan2(-dx, -dz) };
    if (l > hd + 7) r = { i, cx, cz, door, drive, id: 'h' + i };
  }
  houseCache.set(i, r); return r;
}
function housesNear(x, z, R) {
  const out = []; if (!houseGrid) return out;
  for (let gx = Math.floor((x - R) / HG); gx <= Math.floor((x + R) / HG); gx++) for (let gz = Math.floor((z - R) / HG); gz <= Math.floor((z + R) / HG); gz++) for (const i of houseGrid.get(gx * 100000 + gz) || []) { const f = ctx.D.buildings[i][2]; if (hyp(f[0] - x, f[1] - z) < R) out.push(i); }
  return out;
}

// ------------------------------------------------------------------ security cameras
// Over every ATM and gas station and most stores. They see what happens in front of them; whatever they record
// reaches the Sheriff about 20 seconds later, unless the camera is gone by then (shoot it).
const CAMS = new Map(); // spot id -> { x, y, z, fx, fz, mesh, led, dead, pending }
let camMat = null;
function camFor(sp) {
  let c = CAMS.get(sp.id); if (c) return c;
  const x = sp.x + sp.ix * 2.2, z = sp.z + sp.iz * 2.2;
  c = { x, z, y: ctx.heightAt(x, z) + 3.1, fx: -sp.ix, fz: -sp.iz, spot: sp, mesh: null, dead: 0, pending: null }; CAMS.set(sp.id, c); return c;
}
function camMesh(c) {
  if (c.mesh) return; const THREE = ctx.THREE;
  if (!camMat) camMat = { body: ctx.lam('#d9dde3'), pole: ctx.lam('#3a3d42'), led: new THREE.MeshBasicMaterial({ color: 0xff2020 }), off: new THREE.MeshBasicMaterial({ color: 0x220808 }) };
  const g = new THREE.Group(), pole = new THREE.Mesh(ctx.boxG(0.1, 3.2, 0.1), camMat.pole); pole.position.y = 1.6; g.add(pole);
  const arm = new THREE.Mesh(ctx.boxG(0.08, 0.08, 0.5), camMat.pole); arm.position.set(0, 3.15, 0.22); g.add(arm);
  const body = new THREE.Mesh(ctx.boxG(0.22, 0.2, 0.42), camMat.body); body.position.set(0, 3.05, 0.5); body.rotation.x = 0.35; g.add(body);
  const led = new THREE.Mesh(ctx.boxG(0.05, 0.05, 0.05), camMat.led); led.position.set(0.07, 3.13, 0.72); g.add(led);
  g.position.set(c.x, ctx.heightAt(c.x, c.z), c.z); g.rotation.y = Math.atan2(c.fx, c.fz); ctx.scene.add(g); c.mesh = g; c.led = led; c.body = body;
}
function camGone(c) { if (c.mesh) { ctx.scene.remove(c.mesh); c.mesh = null; } }
function camSees(c, x, y, z) {
  if (c.dead > ctx.simTime) return false;
  const dx = x - c.x, dz = z - c.z, d = hyp(dx, dz); if (d > 26) return false;
  if (d > 2 && (dx * c.fx + dz * c.fz) / d < -0.1) return false;
  return ctx.los(c.x, c.y, c.z, x, y + 1.2, z);
}
function breakCam(c) {
  if (c.dead > ctx.simTime) return; c.dead = ctx.simTime + 600; ctx.sparks && ctx.sparks(c.x, c.y, c.z, 10); ctx.sfx.hit(0.6);
  if (c.led) c.led.material = camMat.off; if (c.body) c.body.rotation.x = 1.1;
  if (c.pending) { c.pending = null; ctx.notify('Camera down. <b>The footage is gone.</b>', 'green', 2500); }
}
addWatcher((kind, x, y, z, sev) => { // police.js asks every camera after every crime
  if (off() || kind === 'gunfire' || kind === 'explosion') return false; let any = false;
  for (const c of CAMS.values()) if (camSees(c, x, y, z)) { any = true; if (!c.pending) { c.pending = { t: ctx.simTime + 20, sev: Math.max(1, Math.min(sev, 3)), kind, x, z }; ctx.notify('<b>A security camera saw that.</b> Shoot it before the footage gets out (about 20 s).', 'red', 4500); } }
  return any;
});
function updateCams(dt) {
  const f = ctx.focusPos(), blink = Math.floor(ctx.simTime * 1.5) % 2;
  for (const c of CAMS.values()) {
    const d = hyp(c.x - f.x, c.z - f.z);
    if (d < 220) { camMesh(c); if (c.led && c.dead < ctx.simTime) c.led.visible = !!blink; } else camGone(c);
    if (c.pending && ctx.simTime >= c.pending.t) { const p = c.pending; c.pending = null; setWanted(Math.max(p.sev, police.wanted), 'Security footage: <b>the Sheriff has your face.</b>', { seen: false, x: p.x, z: p.z, what: p.kind }); }
  }
}
// shooting at a camera: the shot goes where the camera (the view) points
on('shot:fired', e => {
  if (e.from !== 'player' || off() || !CAMS.size) return;
  const cam = ctx.camera, o = cam.position, d = cam.getWorldDirection(new ctx.THREE.Vector3()), maxT = e.hit && e.hit.t || 300;
  for (const c of CAMS.values()) {
    if (!c.mesh || c.dead > ctx.simTime) continue;
    const ox = c.x + c.fx * 0.5 - o.x, oy = c.y - o.y, oz = c.z + c.fz * 0.5 - o.z, t = ox * d.x + oy * d.y + oz * d.z;
    if (t < 0 || t > maxT + 1) continue;
    if (hyp(ox - d.x * t, oy - d.y * t, oz - d.z * t) < 0.55) breakCam(c);
  }
});
on('explosion', e => { for (const c of CAMS.values()) if (hyp(c.x - e.x, c.z - e.z) < (e.R || 6) * 1.4) breakCam(c); });

// ------------------------------------------------------------------ witnesses: markers, the corner count, intimidation, the scanner
let eyeMat = null, witT = 0, scanT = 0, intim = { p: null, t: 0 };
function eye() {
  if (eyeMat) return eyeMat;
  const t = ctx.canvasTex(64, 64, g => { g.fillStyle = '#ffb020'; g.beginPath(); g.arc(32, 32, 28, 0, TAU); g.fill(); g.fillStyle = '#16120a'; g.beginPath(); g.ellipse(32, 33, 19, 11, 0, 0, TAU); g.fill(); g.fillStyle = '#ffb020'; g.beginPath(); g.arc(32, 33, 7, 0, TAU); g.fill(); g.fillStyle = '#16120a'; g.beginPath(); g.arc(32, 33, 3.4, 0, TAU); g.fill(); });
  return (eyeMat = new ctx.THREE.SpriteMaterial({ map: t, depthTest: false }));
}
function updateWitnesses(dt) {
  const f = ctx.focusPos(), list = [];
  for (const p of ctx.peds) {
    if (p.isCop || p.remote || p.state === 'dead' || p.reported) continue;
    const pending = p.callT > 0 && (p.pendingSev || 0) > 0 && p.pendingWhy !== 'sighting', calling = p.state === 'call';
    if (!pending && !calling) { if (p.witness && p.marker && p.marker.material === eyeMat) p.setMarker(null); continue; }
    p.witness = true; if (pending && p.state !== 'down') { p.setMarker(eye()); if (p.marker && p.marker.scale.x < 0.8) { p.marker.scale.set(0.85, 0.85, 1); p.marker.position.y = 2.55; } }
    list.push({ p, t: calling ? p.timer : p.callT + 4, calling, d: hyp(p.pos.x - f.x, p.pos.z - f.z) });
  }
  // the corner: how many, and how long until the first call goes through
  const el = $('witnesses');
  if (el) {
    if (!list.length) { if (!el.hidden) el.hidden = true; }
    else {
      list.sort((a, b) => a.t - b.t); const n = list.length, first = list[0];
      el.hidden = false; el.innerHTML = `<b>${n} WITNESS${n > 1 ? 'ES' : ''}</b>${first.calling ? '<span class="hot">on the phone</span>' : 'about to call'} · ${Math.max(0, first.t).toFixed(1)} s`;
    }
  }
  // the scanner: you hear a call starting, and where
  if (isUnlocked('ability:scanner')) for (const w of list) if (w.calling && !w.p.scanned) { w.p.scanned = true; if (ctx.simTime > scanT) { scanT = ctx.simTime + 4; ctx.notify(`<b>SCANNER</b> · 911 call in progress, ${Math.round(w.d)} m ${dirWord(w.p.pos.x - f.x, w.p.pos.z - f.z)}. Stop them.`, 'blue', 4000); } }
  // intimidation: aim at a witness for a moment and they decide they didn't see anything
  const P = ctx.player;
  if (isUnlocked('ability:intimidate') && P.aiming && P.weapon > 0 && list.length) {
    const cam = ctx.camera, d = cam.getWorldDirection(new ctx.THREE.Vector3()); let best = null, bd = 0.2;
    for (const w of list) { if (w.d > 35) continue; const ox = w.p.pos.x - cam.position.x, oy = w.p.pos.y + 1.2 - cam.position.y, oz = w.p.pos.z - cam.position.z, l = hyp(ox, oy, oz), a = Math.acos(clamp((ox * d.x + oy * d.y + oz * d.z) / l, -1, 1)); if (a < bd) { bd = a; best = w.p; } }
    if (best && ctx.los(P.pos.x, P.pos.y + 1.5, P.pos.z, best.pos.x, best.pos.y + 1.5, best.pos.z)) { if (intim.p !== best) { intim.p = best; intim.t = 0; } intim.t += dt; if (intim.t > 0.5) { silence(best); best.anger = 0; ctx.say(best, pick(['Okay! Okay! I didn\'t see anything!', 'I\'m putting it away! See? Gone!', 'I was never here, man.', 'Nobody\'s calling anybody!']), 'mad'); stat('intimidated'); intim.p = null; } }
    else intim.p = null;
  } else intim.p = null;
}
const dirWord = (dx, dz) => ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(((Math.atan2(dx, -dz) + TAU) % TAU) / (TAU / 8)) % 8];

// ------------------------------------------------------------------ interactions near you
const ITS = new Map(); // key -> interact item
function want(key, make) { let it = ITS.get(key); if (!it) { it = addInteract(make()); it._k = key; ITS.set(key, it); } it._seen = true; return it; }
function sweep() { for (const [k, it] of ITS) { if (!it._seen) { removeInteract(it); ITS.delete(k); } it._seen = false; } }
const armed = () => { const P = ctx.player, w = ctx.WEAPONS[P.weapon]; return !!(w && w.id && w.id !== 'fists' && !w.proj); };
const onFoot = () => !ctx.player.inCar && !ctx.player.dead;
const busy = () => !!(ctx.storyBusy && ctx.storyBusy() && !ctx.crimeStep);

function storeIt(sp) {
  return want(sp.id, () => ({ x: sp.x, z: sp.z, r: 3.2,
    when: () => onFoot() && !H && !off() && (isUnlocked('crime:shoplift') || isUnlocked('crime:stickup') && armed()),
    label: () => {
      if (isUnlocked('crime:stickup') && armed()) return S().robbed[sp.id] === today() ? `The ${sp.kind}'s register is empty today` : `<b>Rob the ${sp.kind}</b> (hold E)`;
      return `<b>Shoplift</b> at the ${sp.kind} (hold E)`;
    },
    onUse: () => (isUnlocked('crime:stickup') && armed()) ? stickup(sp) : shoplift(sp),
  }));
}
function shoplift(sp) {
  hold({ label: `Filling your jacket at the ${sp.kind}…`, need: 2.4, at: sp, r: 3.4, onDone: () => {
    const [n, v] = pick(LOOT.store); if (!take(n, Math.round(v * rand(0.8, 1.25)))) return;
    // the clerk saw you about a third of the time; if they did, they're the witness
    if (Math.random() < 0.35) { const c = clerk(sp); if (c) { ctx.say(c, pick(['Hey! You have to pay for that!', 'I saw that!', 'Put it back!']), 'mad'); witness(c, 'shoplift', 1, sp.x, sp.z); c.flee(sp.x, sp.z, 6); } }
    crime('shoplift', sp.x, sp.z, 1); done('shoplift');
  } });
}
function clerk(sp) { // somebody from the store, at the door
  const x = sp.x + sp.ix * 1.4, z = sp.z + sp.iz * 1.4, p = new ctx.Ped(x, z, {}); p.rotY = Math.atan2(-sp.ix, -sp.iz); p.money = randi(10, 40); p.personality = 'normal'; return p;
}
function stickup(sp) {
  const s = S(); if (s.robbed[sp.id] === today()) { ctx.notify('Already hit today. The register\'s empty.', '', 2500); return; }
  const c = clerk(sp); c.ai = handsUp; c.state = 'ai'; c.handsT = 6;
  ctx.say(c, pick(['Okay, okay! Take it!', 'Please, I have kids!', 'Don\'t shoot! It\'s all yours!']), 'mad');
  hold({ label: `The clerk is emptying the register…`, need: 3.6, at: sp, r: 4, cancel: () => !armed() ? 'put the gun away' : null,
    onStop: () => { release(c); }, onDone: () => {
      s.robbed[sp.id] = today(); const n = Math.round(randi(220, 680) * (1 + 0.1 * skill('bigscore'))); cash(n, 'The register.'); // Big Score
      release(c); witness(c, 'robbery', 2, sp.x, sp.z); c.callT = 25; // the silent alarm: about half a minute
      crime('robbery', sp.x, sp.z, 2); done('stickup');
      ctx.notify('<b>Silent alarm.</b> About 30 seconds before the Sheriff knows. Or stop the clerk.', 'red', 5000);
    } });
}
function handsUp(p, dt) { if (p.state !== 'ai') return null; p.handsT -= dt; const f = ctx.focusPos(); p.rotY = Math.atan2(f.x - p.pos.x, f.z - p.pos.z); if (p.handsT <= 0) { release(p); return null; } return { speed: 0, mode: 'hands' }; }
function release(p) { if (!p || p.state === 'dead') return; p.ai = null; p.state = 'idle'; p.timer = 0.2; p.flee(ctx.player.pos.x, ctx.player.pos.z, rand(8, 12)); }

function atmIt(sp) {
  return want(sp.id, () => ({ x: sp.x, z: sp.z, r: 3,
    when: () => onFoot() && !H && !off() && isUnlocked('crime:skim'),
    label: () => { const t = S().skims[sp.id]; if (!t) return '<b>Plant a card skimmer</b> on the ATM (hold E)'; const left = t + 180 - ctx.simTime; return left > 0 && t <= ctx.simTime ? `Skimmer collecting card numbers… ${Math.ceil(left / 60)} min` : '<b>Collect the skimmer</b> (hold E)'; },
    onUse: () => {
      const s = S(), t = s.skims[sp.id];
      if (!t) hold({ label: 'Fitting the skimmer over the card slot…', need: 4, at: sp, r: 3.2, onDone: () => { s.skims[sp.id] = ctx.simTime; crime('skimming', sp.x, sp.z, 1); done('skim:plant'); ctx.notify('Skimmer in. Come back in about three hours (3 minutes).', '', 4000); } });
      else if (t > ctx.simTime || ctx.simTime - t >= 180) hold({ label: 'Pulling the skimmer…', need: 2, at: sp, r: 3.2, onDone: () => { delete s.skims[sp.id]; const n = randi(380, 950); cash(n, 'Card numbers, sold by the dozen.'); crime('skimming', sp.x, sp.z, 1); done('skim'); } });
      else ctx.notify('Not yet. It needs a few more customers.', '', 2000);
    },
  }));
}
function racketIt(sp) {
  return want(sp.id, () => ({ x: sp.x, z: sp.z, r: 3,
    when: () => onFoot() && !H && !off() && isUnlocked('crime:racket') && !S().racket.includes(sp.id),
    label: () => S().racket.length >= 10 ? 'You can\'t collect from more than ten places' : `<b>Lean on the ${sp.kind}</b> for protection money (hold E)`,
    onUse: () => {
      const s = S(); if (s.racket.length >= 10) return;
      hold({ label: 'Explaining how fires start…', need: 3, at: sp, r: 3.4, onDone: () => { s.racket.push(sp.id); crime('racket', sp.x, sp.z, 1); done('racket'); ctx.notify(`The ${sp.kind} on Poway Road pays now. <b>${s.racket.length}</b> businesses, collected every day.`, 'green', 4500); } });
    },
  }));
}

// houses at night
function houseIt(h) {
  return want(h.id, () => ({ x: h.door.x, z: h.door.z, r: 2.6,
    when: () => onFoot() && !H && !off() && isUnlocked('crime:burglary') && night() && S().burgled[h.id] !== today() && dark(h),
    label: () => '<b>Break in</b> (hold E) · no car in the driveway tonight',
    onUse: () => burgle(h),
  }));
}
const dark = h => hash(h.id + today()) < 0.45; // not every house is empty tonight
function burgle(h) {
  const pickT = isUnlocked('ability:lockpick') ? 2 : 4.5;
  hold({ label: isUnlocked('ability:lockpick') ? 'Picking the lock…' : 'Working the door with a screwdriver…', need: pickT, at: h.door, r: 2.8, onDone: () => {
    const home = hash(h.id + 'home' + today()) < 0.3; let owner = null, ownerT = rand(2, 5);
    hold({ label: 'Searching the house…', need: 5.5, at: h.door, r: 3.2,
      tick: (dt, t) => { if (home && !owner && t > ownerT) { owner = new ctx.Ped(h.door.x, h.door.z, {}); owner.rotY = Math.atan2(h.door.x - h.cx, h.door.z - h.cz); ctx.say(owner, pick(['Who\'s there?!', 'I\'ve got a bat! I\'m calling the Sheriff!', 'Honey, wake up! Somebody\'s in the house!']), 'mad'); witness(owner, 'burglary', 2, h.door.x, h.door.z); owner.callT = rand(5, 8); owner.flee(h.door.x, h.door.z, 10); } },
      onDone: () => {
        S().burgled[h.id] = today(); const n = randi(1, 3); let got = 0;
        for (let i = 0; i < n; i++) { const [it, v] = pick(LOOT.house); if (take(it, Math.round(v * rand(0.8, 1.2)))) got++; }
        crime('burglary', h.door.x, h.door.z, 2); done('burglary');
        if (got) ctx.notify(`Out the side gate with ${got} thing${got > 1 ? 's' : ''}. Lucky will want to see them.`, '', 3500);
      } });
  } });
}

// parked cars: lockpicking, catalytic converters; cars in driveways
let lockIt = null, catIt = null, pocketIt = null, carT = 0, nearCar = null;
function parkedNear() {
  const P = ctx.player; let best = null, bd = 2.9;
  for (const v of ctx.vehicles) { if (!v.parked || v.mine || v.dead || v.isCop || v.driver || v.mission) continue; const d = hyp(v.pos.x - P.pos.x, v.pos.z - P.pos.z) - v.spec.W / 2; if (d < bd) { bd = d; best = v; } }
  return best;
}
function carIts() {
  if (!lockIt) {
    lockIt = addInteract({ x: 0, z: 0, r: 3.6, when: () => !!nearCar && onFoot() && !H && !off() && isUnlocked('ability:lockpick') && !ctx.player.crouch && !nearCar.picked,
      label: () => '<b>Pick the lock</b> (hold E): no alarm',
      onUse: () => { const v = nearCar; if (!v) return; hold({ label: 'Picking the lock…', need: 1.8, at: v.pos, r: 4.2, onDone: () => { v.picked = true; v.mine = true; v.stolen = true; ctx.sfx.hit(0.3); ctx.notify('Unlocked. <b>F</b> to get in.', '', 2000); if (v.driveway) { crime('theft', v.pos.x, v.pos.z, 1); } done('lockpick'); } }); } });
    catIt = addInteract({ x: 0, z: 0, r: 3.6, when: () => !!nearCar && onFoot() && !H && !off() && isUnlocked('crime:parts') && ctx.player.crouch && !nearCar.catGone,
      label: () => '<b>Saw off the catalytic converter</b> (hold E) · loud',
      onUse: () => { const v = nearCar; if (!v) return; let saw = 0; crime('parts', v.pos.x, v.pos.z, 1);
        hold({ label: 'Sawing… (it is LOUD)', need: 5, at: v.pos, r: 4.2, cancel: () => !ctx.player.crouch ? 'stood up' : null,
          tick: dt => { saw -= dt; if (saw <= 0) { saw = 0.25; ctx.noise(0.25, 'bandpass', rand(2600, 3400), ctx.volAt(v.pos.x, v.pos.z, 60) * 0.35); } },
          onDone: () => { v.catGone = true; if (take('a catalytic converter', randi(200, 320))) { crime('parts', v.pos.x, v.pos.z, 1); done('parts'); } } }); } });
  }
  nearCar = onFoot() && !off() && (isUnlocked('ability:lockpick') || isUnlocked('crime:parts')) ? parkedNear() : null;
  if (nearCar) { lockIt.x = catIt.x = nearCar.pos.x; lockIt.z = catIt.z = nearCar.pos.z; }
}
// a few cars in driveways near you (stealing one is a crime the house might see)
const DRIVE = new Map(); // house id -> vehicle
function updateDriveways(f) {
  for (const [id, v] of DRIVE) if (v.removed || (hyp(v.pos.x - f.x, v.pos.z - f.z) > 260 && v !== ctx.player.inCar && !v.repo)) { if (!v.removed && !v.stolen) v.remove(); DRIVE.delete(id); }
  if (DRIVE.size >= 5) return;
  for (const i of housesNear(f.x, f.z, 150)) {
    if (DRIVE.size >= 5) break; const h = house(i); if (!h || DRIVE.has(h.id) || hash(h.id + 'car') > 0.22) continue;
    const d = hyp(h.drive.x - f.x, h.drive.z - f.z); if (d < 45 || d > 150) continue;
    const q = { x: h.drive.x, z: h.drive.z }; if (ctx.collideCircle(q, 1.3, false)) continue;
    const v = new ctx.Vehicle(pick(['sedan', 'sedan', 'suv', 'suv', 'pickup', 'sports']), h.drive.x, h.drive.z, h.drive.rot); v.parked = true; v.mode = 'free'; v.driveway = h.id; ctx.settleCar(v); DRIVE.set(h.id, v);
  }
}

// people: pickpocketing, mugging
let mark = null, pocketT = 0;
function pocketIts(dt) {
  if (!pocketIt) pocketIt = addInteract({ x: 0, z: 0, r: 2.4, when: () => !!mark && onFoot() && !H && !off() && isUnlocked('crime:pickpocket'),
    label: () => '<b>Pick their pocket</b> (hold E)',
    onUse: () => { const p = mark; if (!p) return; let noticed = false;
      hold({ label: 'Two fingers, slowly…', need: 1.4, at: p.pos, r: 2.6, cancel: () => p.state === 'dead' || p.state === 'flee' ? 'they moved' : null,
        tick: dt => { const behind = behindOf(p); if (!noticed && Math.random() < dt * (behind ? 0.18 : 1.6) * (ctx.player.crouch ? 0.6 : 1)) noticed = true; if (noticed) { H = null; hud(); caught(p); } },
        onDone: () => { p.picked = true; const n = randi(15, 120); cash(n, 'A wallet.'); if (Math.random() < 0.35) { const [it, v] = pick(LOOT.pocket); take(it, v); } crime('pickpocket', p.pos.x, p.pos.z, 1, p); done('pickpocket'); } }); } });
  const P = ctx.player; mark = null;
  if (!onFoot() || !isUnlocked('crime:pickpocket') || off()) return;
  let bd = 1.9;
  for (const p of ctx.peds) { if (p.isCop || p.ai || p.remote || p.keep || p.picked || (p.state !== 'walk' && p.state !== 'idle' && p.state !== 'roam' && p.state !== 'group')) continue; const d = hyp(p.pos.x - P.pos.x, p.pos.z - P.pos.z); if (d < bd && behindOf(p)) { bd = d; mark = p; } }
  if (mark) { pocketIt.x = mark.pos.x; pocketIt.z = mark.pos.z; }
}
function behindOf(p) { const P = ctx.player, dx = P.pos.x - p.pos.x, dz = P.pos.z - p.pos.z, d = hyp(dx, dz) || 1; return (dx * Math.sin(p.rotY) + dz * Math.cos(p.rotY)) / d < -0.35; }
function caught(p) {
  p.picked = true; ctx.say(p, pick(['Hey! HEY! My wallet!', 'Thief! Somebody stop him!', 'Get your hand out of my pocket!']), 'mad');
  p.flee(ctx.player.pos.x, ctx.player.pos.z, 8); witness(p, 'pickpocket', 1, p.pos.x, p.pos.z);
  crime('pickpocket', p.pos.x, p.pos.z, 1, p); stat('pickpocket:caught');
}
// mugging: aim at someone up close; they freeze, hand it over, and later they call
function updateMugging(dt) {
  const P = ctx.player; if (!isUnlocked('crime:mugging') || off() || !onFoot() || !P.aiming || !armed()) return;
  const cam = ctx.camera, d = cam.getWorldDirection(new ctx.THREE.Vector3());
  for (const p of ctx.peds) {
    if (p.isCop || p.remote || p.keep || p.mugged || p.state === 'dead' || p.state === 'down' || p.state === 'fly' || (p.ai && p.ai !== muggedAI)) continue;
    const dd = hyp(p.pos.x - P.pos.x, p.pos.z - P.pos.z); if (dd > 11) continue;
    const ox = p.pos.x - cam.position.x, oy = p.pos.y + 1.2 - cam.position.y, oz = p.pos.z - cam.position.z, l = hyp(ox, oy, oz);
    if ((ox * d.x + oy * d.y + oz * d.z) / l < Math.cos(Math.atan2(0.7, l))) continue;
    p.mugged = true; p.callT = 0; p.ai = muggedAI; p.state = 'ai'; p.mugT = 0; p.agent = null;
    ctx.say(p, pick(['Okay! Okay! Take it!', 'Here, my wallet, just take it!', 'Please don\'t, I\'ll give you everything!']), 'mad');
    break;
  }
}
function muggedAI(p, dt) {
  if (p.state !== 'ai') return null; p.mugT += dt; const f = ctx.focusPos(); p.rotY = Math.atan2(f.x - p.pos.x, f.z - p.pos.z);
  if (p.mugT > 1.6 && !p.paid) {
    p.paid = true; const n = randi(40, 260); ctx.spawnPickup('cash', p.pos.x + Math.sin(p.rotY) * 0.8, p.pos.z + Math.cos(p.rotY) * 0.8, n);
    if (Math.random() < 0.3) { const [it, v] = pick(LOOT.pocket); take(it, v); }
    crime('mugging', p.pos.x, p.pos.z, 1, p); done('mugging');
  }
  if (p.mugT > 3.2) { p.ai = null; p.state = 'idle'; p.timer = 0.1; p.flee(f.x, f.z, rand(9, 14)); witness(p, 'mugging', 1, p.pos.x, p.pos.z); p.callT = rand(5, 8); return null; }
  return { speed: 0, mode: 'hands' };
}

// ------------------------------------------------------------------ places: the fence, the chop shop, Dee's repo list, Nina's coolers
const PLACES = {}; let placeIts = false;
// a story place, moved `along` metres down the sidewalk (so a counter doesn't sit on top of the person who gives the missions there)
function placeSpot(key, along = 0) {
  const p = ctx.storyPlace && ctx.storyPlace(key); if (!p) return null; if (!along) return { x: p.x, z: p.z };
  const ne = ctx.nearestEdge(p.x, p.z, 60, e => e.t >= 1 && e.t <= 5); return ne ? { x: p.x + ne.tx * along, z: p.z + ne.tz * along } : { x: p.x, z: p.z };
}
const fenceRate = () => 0.8 + hash('fence' + today()) * 0.45;
const CHOP = { sedan: 380, suv: 560, pickup: 480, sports: 950, van: 320, police: 1300 };
const REPO = { sedan: 650, suv: 950, pickup: 780, sports: 1500 };
function setupPlaces() {
  PLACES.fence = placeSpot('lucky', 5); PLACES.chop = placeSpot('kirkhamBack'); PLACES.dee = placeSpot('deeGarage'); PLACES.runs = placeSpot('canyonMouth', -8);
  if (PLACES.fence) addInteract({ x: PLACES.fence.x, z: PLACES.fence.z, r: 3.4, when: () => onFoot() && !off() && isUnlocked('crime:fence') && !busy(),
    label: () => { const L = S().loot; if (!L.length) return 'Lucky\'s Swap & Loan · <b>nothing to sell</b>'; const v = L.reduce((a, b) => a + b.v, 0) * fenceRate(); return `Sell ${L.length} thing${L.length > 1 ? 's' : ''} to <b>Lucky</b> · ${money(v)} (today ${Math.round(fenceRate() * 100)}%)`; },
    onUse: () => { const s = S(); if (!s.loot.length) { ctx.notify('Lucky: "Bring me something, sweetheart. I don\'t buy conversation."', '', 3000); return; } const v = Math.round(s.loot.reduce((a, b) => a + b.v, 0) * fenceRate()); const n = s.loot.length; s.loot.length = 0; cash(v, `Lucky took ${n} thing${n > 1 ? 's' : ''}.`); done('fence', { value: v }); ctx.persist(); } });
  if (PLACES.chop) addInteract({ x: PLACES.chop.x, z: PLACES.chop.z, r: 8, when: () => !off() && isUnlocked('crime:chop') && !!ctx.player.inCar && !busy(),
    label: () => { const v = ctx.player.inCar; if (!v.stolen || v.ownedId || v.tommy || v.marco) return 'Torque: "That one\'s yours. I don\'t buy family."'; return `Sell this car to <b>Torque</b> · ${money(chopPrice(v))}`; },
    onUse: () => { const v = ctx.player.inCar; if (!v || !v.stolen || v.ownedId || v.tommy || v.marco) return; if (police.wanted) { ctx.notify('Torque: "Not with the Sheriff on you. Come back clean."', 'red', 3000); return; } const n = chopPrice(v); leaveCar(v); v.remove(); cash(n, 'Torque doesn\'t ask.'); done('chop', { value: n }); ctx.persist(); } });
  if (PLACES.dee) addInteract({ x: PLACES.dee.x, z: PLACES.dee.z, r: 9, when: () => !off() && isUnlocked('crime:repo') && !!ctx.player.inCar && !!ctx.player.inCar.repo && !busy(),
    label: () => `Hand the repo to <b>Dee</b> · ${money(repoPrice(ctx.player.inCar))}`,
    onUse: () => { const v = ctx.player.inCar; if (!v || !v.repo) return; if (police.wanted) { ctx.notify('Dee: "Not with the Sheriff on you. I mean it."', 'red', 3000); return; } const n = repoPrice(v), r = S().repo; r.list = r.list.filter(t => t.id !== v.repo); leaveCar(v); v.remove(); cash(n, 'Dee: "Collateral."'); done('repo', { value: n }); ctx.persist(); } });
  if (PLACES.runs) addInteract({ x: PLACES.runs.x, z: PLACES.runs.z, r: 4, when: () => !off() && isUnlocked('crime:runs') && !RUN && !busy(),
    label: () => '<b>Take a cooler run</b> for Nina',
    onUse: startRun });
}
function chopPrice(v) { return Math.round((CHOP[v.type] || 350) * clamp(v.health / 100, 0.35, 1) * (v.neon || v.ownedId ? 1.2 : 1)); }
function repoPrice(v) { return Math.round((REPO[v.type] || 600) * clamp(0.4 + v.health / 160, 0.5, 1)); }
function leaveCar(v) { const P = ctx.player; if (P.inCar !== v) return; P.inCar = null; v.driver = null; P.pos.set(v.pos.x + v.fz * (v.spec.W / 2 + 1), 0, v.pos.z - v.fx * (v.spec.W / 2 + 1)); ctx.collideCircle(P.pos, 0.35); P.pos.y = ctx.heightAt(P.pos.x, P.pos.z); P.rig.g.visible = true; emit('car:exit', { vehicle: v }); }

// Dee's list: three cars, parked at houses around town, whose owners stopped paying her (or so she says)
const TINTS = [[0xf2f2f0, 'white'], [0x1b1c1e, 'black'], [0xb8bcc0, 'silver'], [0x8a1c1c, 'red'], [0x23406e, 'blue'], [0x3b4a3a, 'green']];
function repoList() {
  const r = S().repo;
  if (r.day !== today() || !r.list.length) {
    r.day = today(); r.list = []; const c = PLACES.dee || ctx.focusPos();
    for (let k = 0; k < 40 && r.list.length < 3; k++) {
      const a = rand(0, TAU), d = rand(700, 2600), hs = housesNear(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 120); if (!hs.length) continue;
      const h = house(pick(hs)); if (!h) continue; const q = { x: h.drive.x, z: h.drive.z }; if (ctx.collideCircle(q, 1.3, false)) continue;
      const type = pick(['sedan', 'suv', 'suv', 'pickup', 'sports']), [tint, tn] = pick(TINTS);
      r.list.push({ id: 'r' + h.i + ':' + today(), type, tint, tn, x: h.drive.x, z: h.drive.z, rot: h.drive.rot, area: ctx.areaAt ? ctx.areaAt(h.drive.x, h.drive.z) : '' });
    }
  }
  return r.list;
}
const REPOCARS = new Map();
function updateRepo(f) {
  if (!isUnlocked('crime:repo')) return;
  for (const t of repoList()) {
    let v = REPOCARS.get(t.id); const d = hyp(t.x - f.x, t.z - f.z);
    if (v && (v.removed || v.dead)) { if (v.dead) { ctx.notify('Dee: "You wrecked my collateral. That one\'s off the list."', 'red', 3500); S().repo.list = S().repo.list.filter(q => q.id !== t.id); } REPOCARS.delete(t.id); continue; }
    if (!v && d < 260) { v = new ctx.Vehicle(t.type, t.x, t.z, t.rot, t.tint); v.parked = true; v.mode = 'free'; v.driveway = t.id; v.repo = t.id; v.keep = true; ctx.settleCar(v); REPOCARS.set(t.id, v); }
    else if (v && d > 420 && v !== ctx.player.inCar && !v.stolen) { v.remove(); REPOCARS.delete(t.id); }
  }
}

// cooler runs
let RUN = null, runBeam = null;
function startRun() {
  if (ctx.storyBusy && ctx.storyBusy()) { ctx.notify('Finish what you\'re doing first.', '', 2000); return; }
  const f = ctx.focusPos(), c = ctx.POIS.filter(p => { const d = hyp(p.x - f.x, p.z - f.z); return d > 1200 && d < 3200; }); if (!c.length) return;
  const p = pick(c), dest = ctx.sidewalkNear(p.x, p.z), d = hyp(dest.x - f.x, dest.z - f.z);
  RUN = { x: dest.x, z: dest.z, t: Math.round(d / 13 + 35), pay: Math.round(450 + d * 0.22), area: ctx.areaAt ? ctx.areaAt(dest.x, dest.z) : 'town' };
  if (!runBeam) { runBeam = new ctx.THREE.Mesh(new ctx.THREE.CylinderGeometry(2.5, 2.5, 120, 20, 1, true).translate(0, 60, 0), new ctx.THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.32, depthWrite: false })); ctx.scene.add(runBeam); }
  runBeam.position.set(RUN.x, ctx.heightAt(RUN.x, RUN.z), RUN.z); runBeam.visible = true;
  ctx.notify(`Nina: "Cooler to the drop in <b>${esc(RUN.area)}</b>. ${RUN.t} seconds. If a deputy sees it, you never met me."`, 'green', 6000); ctx.sfx.phone(0.7);
}
function updateRun(dt) {
  if (!RUN) return; if (off()) { endRun(); return; }
  RUN.t -= dt; const f = ctx.focusPos(), d = hyp(RUN.x - f.x, RUN.z - f.z);
  if (police.visible > 0.35 && !RUN.seen) { RUN.seen = true; setWanted(Math.max(2, police.wanted), 'A deputy saw the cooler. <b>Two stars.</b>', { seen: true, what: 'runs' }); }
  hud2(`<b>${Math.max(0, Math.ceil(RUN.t))}s</b>Cooler run · ${Math.round(d)} m${police.wanted ? ' · <span class="hot">lose the Sheriff</span>' : ''}`);
  if (d < 12 && !police.wanted) { cash(RUN.pay, 'Nina\'s cooler, delivered.'); done('run', { value: RUN.pay }); endRun(); ctx.persist(); }
  else if (RUN.t <= 0) { ctx.notify('Too slow. The buyer left. Nina is not happy.', 'red', 3500); endRun(); }
}
function endRun() { RUN = null; if (runBeam) runBeam.visible = false; hud2(''); }
let hud2Html = '';
function hud2(html) { if (html === hud2Html) return; hud2Html = html; const el = $('crimejob'); if (el) { el.innerHTML = html; el.hidden = !html; } }

// ------------------------------------------------------------------ armored trucks
let TRUCK = null, truckT = 120;
function updateTruck(dt, f) {
  if (!isUnlocked('crime:heist') || off()) { if (TRUCK && !TRUCK.v.removed && !TRUCK.hit) TRUCK.v.remove(); TRUCK = null; return; }
  if (!TRUCK) {
    truckT -= dt; if (truckT > 0 || (ctx.storyBusy && ctx.storyBusy())) return; truckT = rand(300, 480);
    const banks = SPOTS.bank.filter(b => { const d = hyp(b.x - f.x, b.z - f.z); return d > 200 && d < 2800; }); if (banks.length < 1) return;
    const from = pick(banks), to = pick(SPOTS.bank.filter(b => b !== from && hyp(b.x - from.x, b.z - from.z) > 600)) || null; if (!to) return;
    const ne = ctx.nearestEdge(from.x, from.z, 120, e => e.t <= 5); if (!ne) return;
    const v = new ctx.Vehicle('van', ne.x, ne.z, Math.atan2(to.x - ne.x, to.z - ne.z), 0x6b7468, 'delivery'); ctx.settleCar(v);
    Object.assign(v, { keep: true, mission: true, health: 260, armored: true, driver: 'ai', ai: truckAI, dest: to, react: -1000 }); v.spec.vmax = 30;
    TRUCK = { v, to, hit: false };
    ctx.notify(`<b>Armored truck</b> leaving the bank in ${esc(ctx.areaAt ? ctx.areaAt(v.pos.x, v.pos.z) : 'town')}. Stop it before it gets where it's going.`, 'green', 6000);
    return;
  }
  const v = TRUCK.v;
  if (v.removed) { TRUCK = null; return; }
  if (!TRUCK.hit && (v.dead || v.health < 90)) { // stopped: the guards get out, the back opens
    TRUCK.hit = true; v.ai = null; v.driver = null; v.vel.multiplyScalar(0.2);
    crime('heist', v.pos.x, v.pos.z, 3); setWanted(Math.max(3, police.wanted), 'The guards radioed it in. <b>Three stars.</b>', { seen: true, what: 'heist' });
    for (let i = 0; i < 2; i++) { const s = i ? 1 : -1, p = new ctx.Ped(v.pos.x + v.fz * s * 2, v.pos.z - v.fx * s * 2, { look: { kind: 'civ', skin: pick(['#e0ac85', '#8d5a3b', '#c68863']), shirt: '#4a5568', pants: '#2b3a55', hair: '#1a1a1a', hat: '#2b3a55' } }); p.anger = 100; p.state = 'fight'; p.timer = 30; p.personality = 'tough'; }
    for (let i = 0; i < 3; i++) ctx.spawnPickup('cash', v.pos.x - v.fx * (v.spec.L / 2 + 1 + i * 0.8) + rand(-0.6, 0.6), v.pos.z - v.fz * (v.spec.L / 2 + 1 + i * 0.8) + rand(-0.6, 0.6), Math.round(randi(700, 1300) * (1 + 0.1 * skill('bigscore'))));
    ctx.notify('The back doors are open. <b>Grab the bags</b> and go.', 'green', 4000); done('heist');
    setTimeout(() => { if (TRUCK && TRUCK.v === v) TRUCK = null; v.keep = false; v.mission = false; }, 60000);
    return;
  }
  if (!TRUCK.hit && hyp(v.pos.x - TRUCK.to.x, v.pos.z - TRUCK.to.z) < 25) { v.remove(); TRUCK = null; }
  else if (!TRUCK.hit && hyp(v.pos.x - f.x, v.pos.z - f.z) > 3400) { v.remove(); TRUCK = null; }
}
function truckAI(v, dt) { if (v.dest) driveTo(v, v.dest.x, v.dest.z, dt, { near: 30, maxSpeed: 22 }); }

// ------------------------------------------------------------------ insurance fraud: get rear-ended on purpose
let claimT = 0;
on('car:crash', ({ a, b, impact }) => {
  const P = ctx.player, v = P.inCar; if (!v || off() || !isUnlocked('crime:fraud') || !b || (a !== v && b !== v)) return;
  const o = a === v ? b : a; if (!o || o.driver !== 'ai' || o.isCop || ctx.simTime < claimT) return;
  const fwd = v.vel.x * v.fx + v.vel.y * v.fz, behind = (o.pos.x - v.pos.x) * v.fx + (o.pos.z - v.pos.z) * v.fz;
  if (fwd > 5 || behind > -1.5 || impact < 1.5) return; // you have to be nearly stopped, and they have to hit you from behind
  claimT = ctx.simTime + 75; const n = Math.round(clamp(impact, 2, 14) * 45 + 150);
  if (police.visible > 0.3) { ctx.notify('A deputy watched you brake-check them. <b>Claim denied.</b>', 'red', 3500); return; }
  ctx.notify('Rear-ended. <b>Whiplash</b>, says your new lawyer. The claim is filed.', 'green', 3500);
  setTimeout(() => { if (!ctx.player.dead) { cash(n, 'Insurance claim approved.'); done('fraud', { value: n }); } }, 30000);
});

// ------------------------------------------------------------------ protection money, every game day
on('clock:day', () => {
  if (!ctx.save || off()) return; const s = S(); if (!s.racket.length || !isUnlocked('crime:racket')) return;
  const n = s.racket.length * randi(70, 140); cash(n, `Protection money from ${s.racket.length} business${s.racket.length > 1 ? 'es' : ''} on Poway Road.`);
});
// a car you take without the keys is stolen (for the chop shop); off a driveway, the house might see
on('car:enter', ({ vehicle: v, stolen }) => {
  if (!v || off()) return; if (stolen) v.stolen = true;
  if (stolen && v.driveway && !v.picked) { crime('theft', v.pos.x, v.pos.z, 1); done('theft'); } else if (v.driveway && v.picked) done('theft');
});

// ------------------------------------------------------------------ main
let ready = false, t2 = 0;
export function initCrimes() {
  if (ready) return; ready = true; S();
  const st = document.createElement('style'); st.textContent = `
#crimehud{left:50%;bottom:calc(196px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);font:600 17px/1.2 var(--ui);color:var(--paper);text-align:center}
#crimehud b{display:block;margin-bottom:5px} #crimehud .meter{width:240px;height:9px;background:rgba(0,0,0,.6);border:1px solid rgba(0,0,0,.8);margin:0 auto}
#crimehud .meter i{display:block;height:100%;background:var(--gold)}
#witnesses{top:calc(206px + env(safe-area-inset-top,0px));right:18px;text-align:right;font:600 16px/1.25 var(--ui);color:#ffcf7a;background:rgba(20,14,6,.72);padding:6px 10px 6px 12px;border-right:4px solid #ffb020;border-radius:3px}
#witnesses b{display:block;font:400 22px/1 var(--display);letter-spacing:.04em;color:#ffb020} #witnesses .hot{color:#ff5a4a}
#crimejob{top:calc(150px + env(safe-area-inset-top,0px));right:18px;text-align:right;font:600 18px/1.3 var(--ui)}
#crimejob b{color:#ff9f43;font:400 26px/1 var(--display);display:block} #crimejob .hot{color:var(--blood)}`;
  document.head.appendChild(st);
  for (const id of ['crimehud', 'witnesses', 'crimejob']) { const el = document.createElement('div'); el.id = id; el.className = 'hud'; el.hidden = true; document.body.appendChild(el); }
  buildSpots(); setupPlaces();
  ctx.holdE = hold; initHeists(SPOTS, S); // bank heists and robber crews (src/story/heists.js)
}
export function updateCrimes(dt) {
  if (!ready) return;
  updateHold(dt); updateWitnesses(dt); updateCams(dt); updateRun(dt); updateHeists(dt);
  if (off()) { if (H) { H = null; hud(); } return; }
  updateMugging(dt); pocketIts(dt); carIts();
  t2 -= dt; if (t2 > 0) return; t2 = 0.5;
  const f = ctx.focusPos();
  // stores, ATMs and Poway Road businesses near you: their prompts and their cameras
  for (const sp of SPOTS.store) if (hyp(sp.x - f.x, sp.z - f.z) < 120) { storeIt(sp); if (sp.cam) camFor(sp); }
  for (const sp of SPOTS.bank) if (hyp(sp.x - f.x, sp.z - f.z) < 160) { atmIt(sp); camFor(sp); atmMesh(sp); }
  for (const sp of SPOTS.racket) if (hyp(sp.x - f.x, sp.z - f.z) < 90) racketIt(sp);
  if (isUnlocked('crime:burglary') && night()) for (const i of housesNear(f.x, f.z, 70)) { const h = house(i); if (h) houseIt(h); }
  sweep();
  updateDriveways(f); updateRepo(f); updateTruck(0.5, f);
}
// an ATM: a box by the door, so there's something to put a skimmer on
const ATMS = new Map();
function atmMesh(sp) {
  if (ATMS.has(sp.id)) return; const THREE = ctx.THREE, g = new THREE.Group(), x = sp.x + sp.ix * 1.6, z = sp.z + sp.iz * 1.6;
  const body = new THREE.Mesh(ctx.boxG(0.85, 1.7, 0.6), ctx.lam('#3b4350')); body.position.y = 0.85; g.add(body);
  const scr = new THREE.Mesh(ctx.boxG(0.5, 0.34, 0.04), new THREE.MeshBasicMaterial({ color: 0x4aa8ff })); scr.position.set(0, 1.25, -0.31); g.add(scr);
  g.position.set(x, ctx.heightAt(x, z), z); g.rotation.y = Math.atan2(sp.ix, sp.iz); ctx.scene.add(g); ATMS.set(sp.id, g);
}

// ------------------------------------------------------------------ for the story and the maps
export function crimeMarks() {
  const out = []; if (!ready || ctx.online) return out;
  if (isUnlocked('crime:fence') && PLACES.fence) out.push({ x: PLACES.fence.x, z: PLACES.fence.z, color: '#c792ea', letter: 'F', size: 6, edge: false, label: 'Lucky (fence)' + (S().loot.length ? ` · ${S().loot.length} to sell` : '') });
  if (isUnlocked('crime:chop') && PLACES.chop) out.push({ x: PLACES.chop.x, z: PLACES.chop.z, color: '#ff7849', letter: 'C', size: 6, edge: false, label: 'Chop shop' });
  if (isUnlocked('crime:runs') && PLACES.runs && !RUN) out.push({ x: PLACES.runs.x, z: PLACES.runs.z, color: '#ff9f43', letter: 'N', size: 6, edge: false, label: 'Cooler run' });
  if (isUnlocked('crime:repo')) for (const t of S().repo.list) { const v = REPOCARS.get(t.id); out.push({ x: v ? v.pos.x : t.x, z: v ? v.pos.z : t.z, color: '#7cc0ff', letter: 'D', size: 6, edge: false, label: `Repo: ${t.tn} ${t.type}` }); }
  if (RUN) out.push({ x: RUN.x, z: RUN.z, color: '#ff9f43', size: 7, edge: true, label: 'Cooler drop' });
  if (TRUCK && !TRUCK.v.removed) out.push({ x: TRUCK.v.pos.x, z: TRUCK.v.pos.z, color: '#9aa5b1', size: 6, edge: true, label: 'Armored truck' });
  return out.concat(heistMarks());
}
export function nearestCrimeSpot(kind) {
  const f = ctx.focusPos(); let best = null, bd = Infinity;
  const consider = (x, z) => { const d = hyp(x - f.x, z - f.z); if (d < bd) { bd = d; best = { x, z }; } };
  if (kind === 'shoplift' || kind === 'stickup') for (const s of SPOTS.store) consider(s.x, s.z);
  else if (kind === 'skim' || kind === 'skim:plant') for (const s of SPOTS.bank) consider(s.x, s.z);
  else if (kind === 'racket') for (const s of SPOTS.racket) consider(s.x, s.z);
  else if (kind === 'fence' && PLACES.fence) return PLACES.fence;
  else if (kind === 'chop' && PLACES.chop) return PLACES.chop;
  else if (kind === 'repo' && PLACES.dee) return PLACES.dee;
  return best;
}
export function crimeLootCount() { return ctx.save && ctx.save.crime ? (ctx.save.crime.loot || []).length : 0; }
export function crimeJournal() {
  const s = S();
  let h = '<h3>Crime</h3><p style="opacity:.75">No witness, no stars: a crime only counts if a deputy, a camera or somebody who saw it gets through to the Sheriff. Witnesses show an eye; stop them before they reach a phone.</p>';
  for (const c of CRIMES) { const open = c.key === 'core' || isUnlocked(c.key); h += open ? `<p><b>${esc(c.name)}</b> · ${esc(c.how)}</p>` : `<p style="opacity:.5">🔒 <b>${esc(c.name)}</b> · opens in ${esc(c.from)}</p>`; }
  if (s.loot.length) h += `<p>In your bag: ${s.loot.map(l => esc(l.n)).join(', ')} (worth about ${money(s.loot.reduce((a, b) => a + b.v, 0))} to the fence).</p>`;
  if (s.racket.length) h += `<p>${s.racket.length} businesses on Poway Road pay you every day.</p>`;
  return h;
}
export const crimeDebug = { get S() { return S(); }, SPOTS, CAMS, PLACES, get RUN() { return RUN; }, get TRUCK() { return TRUCK; }, truckNow: () => { truckT = 0; }, get hold() { return H; }, startRun, repoList, house, housesNear, take, REPOCARS, DRIVE };
