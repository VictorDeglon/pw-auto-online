// Bank heists you plan and pull, and robbers who aren't you. Single player only, like the rest of src/story/crimes.js
// (which calls initHeists / updateHeists / heistMarks).
//
// Heists, at any bank (docs/skill-tree.md has the skills that change them):
//   1. Case it: unarmed at the door, hold E. You learn the guards and the cameras, and the bank is cased for the day.
//   2. Pull it, one of two ways:
//      Loud  (gun out, any time): guards fight, the staff put their hands up, thermite on the vault. The alarm reaches
//            the Sheriff after ALARM s (twice that with Mastermind): three stars.
//      Quiet (after 10 PM, gun away): guards walk a beat with eyes; the drill is slower. Seen = the alarm goes off now.
//            No alarm at all pays 40% more.
//   3. Grab the bags (hold E at each), then get clear: the take is paid once you've lost the Sheriff, or once you're
//      200 m away if nobody raised the alarm. Die or get busted and it's gone.
// Robbers: now and then a crew hits a store near you. Stop them (they'll shoot back) for a reward and the cash they
// took, or leave them to the deputies, who chase them down. Fighting them doesn't count as a crime.
import { ctx } from '../ctx.js';
import { on, emit } from '../events.js';
import { addInteract, removeInteract } from '../interact.js';
import { police, crime, setWanted, npcFire } from '../police.js';
import { skill } from '../progress.js';
import { driveTo } from '../drive.js';
import { COMPANIONS } from '../social.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const hyp = Math.hypot;
const money = n => '$' + Math.round(n).toLocaleString();
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const off = () => ctx.online || !ctx.running || ctx.player.dead;
const today = () => (ctx.clock && ctx.clock.date) || 'd';
const night = () => { const h = ctx.hour; return h >= 22 || h < 5; };
const armed = () => ctx.player.weapon > 0 && !ctx.player.inCar;
const onFoot = () => !ctx.player.inCar;
const ALARM = 40, BAGS = 4, LOOK_GUARD = { kind: 'plain', skin: '#c99a76', shirt: '#2d3a4f', sleeve: '#2d3a4f', pants: '#1c2230', hair: '#2a1d14', hat: '#2d3a4f', gun: true };
const LOOK_ROBBER = () => ({ kind: 'plain', skin: pick(['#8d5a3b', '#c99a76', '#e2b48f', '#5b3a26']), shirt: '#1b1c1f', sleeve: '#1b1c1f', pants: pick(['#22252b', '#3a3226']), hair: '#111', hat: '#111', gun: true });

let SPOTS = null, S = null; // the bank and store spots, and save.crime (both from src/story/crimes.js)
export function initHeists(spots, state) { SPOTS = spots; S = state; ctx.vigilante = vigilante; }
const H = () => { const s = S(); s.heist ||= { cased: {}, done: {} }; return s.heist; };

// ------------------------------------------------------------------ shared bits
function walk(p, x, z, speed, dt) { // turn toward (x, z) and step; true once there
  const d = hyp(x - p.pos.x, z - p.pos.z); if (d < 0.8) return true;
  p.rotY += wrapA(Math.atan2(x - p.pos.x, z - p.pos.z) - p.rotY) * Math.min(1, dt * 8);
  p.pos.x += Math.sin(p.rotY) * speed * dt; p.pos.z += Math.cos(p.rotY) * speed * dt; ctx.collideCircle(p.pos, 0.35);
  return false;
}
function faceP(p, dt) { const f = ctx.focusPos(); p.rotY += wrapA(Math.atan2(f.x - p.pos.x, f.z - p.pos.z) - p.rotY) * Math.min(1, dt * 8); }
function seesPlayer(p, range) {
  const f = ctx.focusPos(), d = hyp(f.x - p.pos.x, f.z - p.pos.z); if (d > range) return false;
  if (d > 4 && ((f.x - p.pos.x) * Math.sin(p.rotY) + (f.z - p.pos.z) * Math.cos(p.rotY)) / d < 0.45) return false; // a 125-degree cone
  return ctx.los(p.pos.x, p.pos.y + 1.6, p.pos.z, f.x, f.y + 1.2, f.z);
}
// an armed NPC in a firefight with you: aims first, opens with a miss, then shoots now and then (police.js caps the total)
function shootAt(p, dt, acc, dmg) {
  faceP(p, dt); p.shootCd = (p.shootCd || 0) - dt;
  if (!p.aimT) { p.aimT = ctx.simTime + rand(0.8, 1.4); p.firstShot = true; }
  if (ctx.simTime < p.aimT || p.shootCd > 0 || !seesPlayer(p, 45)) return;
  p.shootCd = rand(1, 1.7); npcFire(p.pos.x + Math.sin(p.rotY) * 0.6, p.pos.y + 1.45, p.pos.z + Math.cos(p.rotY) * 0.6, p.firstShot ? 0 : acc, dmg); p.firstShot = false;
  ctx.tone && ctx.tone(180, 0.05, 'square', 0.05, 90);
}
function handsUp(p, dt) { if (p.state !== 'ai') return null; faceP(p, dt); return { speed: 0, mode: 'hands' }; }
function letGo(p) { if (!p || p.removed || p.state === 'dead') return; p.ai = null; p.state = 'idle'; p.timer = 0.2; p.flee(p.pos.x, p.pos.z, rand(8, 12)); }
function cleanup(list) { for (const p of list) if (p && !p.removed && p.state !== 'dead') { if (p.homeGuard) p.remove(); else letGo(p); } }

// ------------------------------------------------------------------ heists
let JOB = null; // the heist in progress
let ITEMS = [];
function clearItems() { for (const it of ITEMS) removeInteract(it); ITEMS = []; }
function item(o) { const it = addInteract(o); ITEMS.push(it); return it; }
const doorOf = b => ({ x: b.x + b.ix * 0.5, z: b.z + b.iz * 0.5 });
const sideOf = (b, k, out = 2) => ({ x: b.x - b.iz * k - b.ix * out, z: b.z + b.ix * k - b.iz * out }); // along the frontage, k m sideways, `out` m out front

function heistMul() {
  const crew = COMPANIONS.filter(c => c.state !== 'dead' && hyp(c.pos.x - ctx.player.pos.x, c.pos.z - ctx.player.pos.z) < 40).length;
  return (1 + 0.1 * skill('bigscore')) * (skill('kingpin') ? 1.3 : 1) * (1 + 0.1 * crew * skill('crewcut')) * (skill('crewheist') ? 1.15 : 1);
}
let bankItems = new Map(); // bank id -> interact item (case / start)
function bankPrompt(b) {
  if (bankItems.has(b.id)) return;
  const d = doorOf(b);
  bankItems.set(b.id, addInteract({ x: d.x, z: d.z, r: 3.4,
    when: () => onFoot() && !off() && !JOB && !(ctx.storyBusy && ctx.storyBusy()) && H().done[b.id] !== today(),
    label: () => {
      if (H().cased[b.id] !== today()) return armed() ? 'Put the gun away to <b>case the bank</b>' : '<b>Case the bank</b> for a heist (hold E)';
      if (armed()) return '<b>Start the heist: loud</b> (hold E)';
      return night() ? '<b>Start the heist: quiet</b> (hold E)' : 'Cased. Come back after 10 PM to go in quiet, or with a gun out to go in loud';
    },
    onUse: () => {
      if (H().cased[b.id] !== today()) { if (!armed()) caseBank(b); return; }
      if (armed()) startHeist(b, 'loud'); else if (night()) startHeist(b, 'quiet');
    },
  }));
}
function caseBank(b) {
  ctx.holdE({ label: 'Casing the bank: guards, cameras, the vault door…', need: 5, at: doorOf(b), r: 3.6, cancel: () => armed() ? 'gun out' : null, onDone: () => {
    H().cased[b.id] = today(); b.guards = randi(2, 3);
    ctx.notify(`<b>Cased.</b> ${b.guards} guards, a camera over the door, the vault in the back. Gun out to go in <b>loud</b>; after 10 PM, gun away, to go in <b>quiet</b>. Today only.`, 'green', 9000);
    emit('crime:done', { kind: 'heist:case' });
  } });
}
function startHeist(b, mode) {
  const d = doorOf(b), guards = [], staff = [];
  for (let i = 0; i < (b.guards || 2); i++) {
    const s = sideOf(b, (i ? 1 : -1) * rand(3, 6), rand(1.5, 4)), g = new ctx.Ped(s.x, s.z, { look: LOOK_GUARD });
    Object.assign(g, { homeGuard: true, keep: true, health: 140, money: randi(40, 120), heist: true, beat: [s, sideOf(b, (i ? 1 : -1) * rand(10, 16), rand(2, 6))], beatI: 0 });
    g.state = 'ai'; g.ai = guardAI; g.onHurt = () => raise('a guard was shot'); guards.push(g);
  }
  if (mode === 'loud') for (let i = 0; i < 3; i++) {
    const s = sideOf(b, rand(-4, 4), rand(0.5, 2.5)), p = new ctx.Ped(s.x, s.z, {}); p.state = 'ai'; p.ai = handsUp; p.keep = true; staff.push(p);
    if (i === 0) ctx.say(p, pick(['Don\'t shoot! The vault\'s in the back!', 'Please, we\'ll do whatever you say!', 'Okay! Okay!']), 'mad');
  }
  JOB = { b, mode, guards, staff, t: 0, alarm: mode === 'loud' ? ALARM * (skill('mastermind') ? 2 : 1) : null, raised: false, vault: false, bags: 0, take: 0, phase: 'vault' };
  ctx.notify(mode === 'loud'
    ? `<b>Heist: loud.</b> The staff are down. Guards are armed. The alarm reaches the Sheriff in about ${Math.round(JOB.alarm)} s: <b>thermite the vault</b> (hold E at the door).`
    : '<b>Heist: quiet.</b> Two guards walk the front. Don\'t let them see you. <b>Drill the vault</b> (hold E at the door).', 'red', 8000);
  if (mode === 'loud') crime('robbery', d.x, d.z, 2);
  const need = (mode === 'loud' ? 14 : 24) * (1 - 0.15 * skill('getawayteam'));
  item({ x: d.x, z: d.z, r: 3.2, when: () => JOB && JOB.phase === 'vault' && onFoot(),
    label: () => `<b>${mode === 'loud' ? 'Burn the vault door' : 'Drill the vault'}</b> (hold E)`,
    onUse: () => ctx.holdE({ label: mode === 'loud' ? 'Thermite eating through the vault door…' : 'Drilling the lock, slow and quiet…', need, at: d, r: 3.6,
      tick: () => { if (mode === 'quiet' && Math.random() < 0.004) ctx.notify('The drill whines. Keep an eye on the guards.', '', 1500); },
      onDone: openVault }) });
}
function openVault() {
  const J = JOB; if (!J) return; J.phase = 'bags'; J.vault = true; clearItems();
  ctx.notify(`<b>The vault is open.</b> ${BAGS} bags of cash. Each one slows you a little.`, 'green', 5000);
  for (let i = 0; i < BAGS; i++) {
    const s = sideOf(J.b, (i - 1.5) * 1.3, -0.2);
    const it = item({ x: s.x, z: s.z, r: 1.8, when: () => JOB === J && onFoot() && !it.taken, label: () => '<b>Grab a bag</b> (hold E)',
      onUse: () => ctx.holdE({ label: 'Stuffing a bag…', need: 1.6, at: s, r: 2.4, onDone: () => {
        it.taken = true; J.bags++; const n = Math.round(rand(1600, 2600) * (J.mode === 'quiet' ? 1.15 : 1)); J.take += n;
        ctx.sfx.cash(); ctx.notify(`Bag ${J.bags}/${BAGS} · <b>${money(J.take)}</b> so far`, 'green', 2200);
        if (J.bags >= 1 && J.phase === 'bags') { J.phase = 'escape'; ctx.notify(J.raised || J.mode === 'loud' ? '<b>Get clear.</b> The take is yours once you lose the Sheriff.' : '<b>Get clear.</b> Nobody\'s raised the alarm: get 200 m away.', 'red', 6000); }
      } }) });
  }
}
function raise(why) {
  const J = JOB; if (!J || J.raised) return;
  if (J.mode === 'quiet') { J.raised = true; const d = doorOf(J.b); ctx.notify(`<b>Alarm!</b> ${why}. The Sheriff is on the way.`, 'red', 5000); crime('heist', d.x, d.z, 3); setWanted(Math.max(3, police.wanted), null, { seen: false, x: d.x, z: d.z, what: 'heist' }); }
}
function guardAI(p, dt) {
  const J = JOB; if (!J || p.state !== 'ai') return null;
  const fight = J.mode === 'loud' || J.raised;
  if (fight) { shootAt(p, dt, 0.22, 6); const f = ctx.focusPos(), d = hyp(f.x - p.pos.x, f.z - p.pos.z); if (d > 18 && seesPlayer(p, 60)) { walk(p, f.x, f.z, 3.6, dt); return { speed: 3.6, mode: 'aim' }; } return { speed: 0, mode: 'aim' }; }
  const tgt = p.beat[p.beatI]; if (walk(p, tgt.x, tgt.z, 1.4, dt)) p.beatI = 1 - p.beatI; // walking the beat
  if (seesPlayer(p, ctx.player.crouch ? 9 : 16 * (1 - 0.5 * ctx.nightAmount) + 6)) { ctx.say(p, pick(['Hey! Who\'s there?', 'Freeze!', 'Bank\'s closed, pal!']), 'cop'); raise('A guard saw you'); }
  return { speed: 1.4, mode: null };
}
function updateHeist(dt) {
  const J = JOB; if (!J) return;
  const f = ctx.focusPos(), d = hyp(f.x - J.b.x, f.z - J.b.z);
  if (ctx.player.dead) { endHeist(false, 'You went down. The take is gone.'); return; }
  J.t += dt;
  if (J.mode === 'loud' && !J.raised) { J.alarm -= dt; if (J.alarm <= 0) { J.raised = true; const p = doorOf(J.b); setWanted(Math.max(3, police.wanted), 'The alarm went through. <b>Three stars.</b>', { seen: d < 60, x: p.x, z: p.z, what: 'heist' }); } }
  if (J.phase === 'vault' && d > 90) { endHeist(false, 'You walked away from the heist.'); return; }
  if (J.phase !== 'escape') return;
  ctx.player.burden = Math.max(0.6, 1 - 0.08 * J.bags); // bags are heavy
  if ((J.raised || J.mode === 'loud') ? police.wanted === 0 && d > 150 : d > 200) endHeist(true);
}
function endHeist(paid, why) {
  const J = JOB; if (!J) return; JOB = null; clearItems(); ctx.player.burden = 1;
  cleanup(J.guards); cleanup(J.staff); H().done[J.b.id] = today(); H().cased[J.b.id] = '';
  if (!paid) { if (why) ctx.notify(why, 'red', 4000); return; }
  const clean = J.mode === 'quiet' && !J.raised, n = Math.round(J.take * heistMul() * (clean ? 1.4 : 1));
  ctx.save.money += n; ctx.sfx.cash(); ctx.save.rep -= 3;
  ctx.big ? ctx.big('HEIST', `${money(n)}${clean ? ' · nobody ever knew' : ''}`, 'pass', 4) : ctx.notify(`<b>Heist done.</b> ${money(n)}`, 'green', 6000);
  emit('crime:done', { kind: 'heist:bank', take: n, quiet: clean });
}

// ------------------------------------------------------------------ robbers
let CREW = null, crewT = 150;
function vigilante() { // fighting robbers isn't a crime: shooting near them, at them, or taking them down
  if (!CREW) return false; const f = ctx.focusPos();
  return CREW.robbers.some(r => !r.removed && r.state !== 'dead' && hyp(r.pos.x - f.x, r.pos.z - f.z) < 60) || (CREW.car && !CREW.car.removed && hyp(CREW.car.pos.x - f.x, CREW.car.pos.z - f.z) < 60);
}
function startRobbery() {
  const f = ctx.focusPos(), list = SPOTS.store.filter(s => { const d = hyp(s.x - f.x, s.z - f.z); return d > 60 && d < 240 && S().robbed[s.id] !== today(); });
  if (!list.length) return false;
  const sp = pick(list), robbers = [];
  for (let i = 0; i < 2; i++) {
    const s = sideOf(sp, (i ? 1 : -1) * rand(8, 14), 3), r = new ctx.Ped(s.x, s.z, { look: LOOK_ROBBER() });
    Object.assign(r, { robber: true, keep: true, health: 110, money: 0 }); r.state = 'ai'; r.ai = robberAI; r.onHurt = () => { r.fight = true; }; robbers.push(r);
  }
  const ne = ctx.nearestEdge(sp.x - sp.ix * 10, sp.z - sp.iz * 10, 40, e => e.t <= 5); let car = null;
  if (ne) { car = new ctx.Vehicle(pick(['sedan', 'suv', 'van']), ne.x, ne.z, Math.atan2(ne.tx, ne.tz), pick([0x1b1c1e, 0x5a5f66, 0x8a1c1c])); car.keep = true; car.mission = true; car.parked = true; ctx.settleCar(car); }
  CREW = { sp, robbers, car, phase: 'in', t: 0, take: randi(400, 900), cops: null, copT: rand(22, 32), done: false };
  ctx.notify(`<b>Robbery in progress</b> at the ${sp.kind} on ${ctx.streetAt(sp.x, sp.z) || 'a side street'}. Stop them for a reward, or leave it to the Sheriff.`, 'red', 7000);
  ctx.sfx.phone(0.4); return true;
}
function robberAI(p, dt) {
  const C = CREW; if (!C || p.state !== 'ai') return null;
  p.invuln = !!p.inGetaway; if (p.inGetaway) return { speed: 0, mode: null }; // riding in the car (hidden)
  const f = ctx.focusPos(), dP = hyp(f.x - p.pos.x, f.z - p.pos.z), P = ctx.player;
  if (!p.fight && dP < 14 && P.weapon > 0 && P.aiming) p.fight = true; // a gun on them: they shoot back
  if (p.fight && dP < 50) { shootAt(p, dt, 0.2, 6); return { speed: 0, mode: 'aim' }; }
  if (C.phase === 'in') { const d = doorOf(C.sp); walk(p, d.x - C.sp.iz * (p === C.robbers[0] ? -1 : 1), d.z + C.sp.ix * (p === C.robbers[0] ? -1 : 1), 4.5, dt); return { speed: 4.5, mode: 'aim' }; }
  if (C.phase === 'out' && C.car && !C.car.removed && !C.car.dead) { // to the getaway car
    if (walk(p, C.car.pos.x, C.car.pos.z, 5.6, dt) || hyp(C.car.pos.x - p.pos.x, C.car.pos.z - p.pos.z) < 2.6) { p.inGetaway = true; p.rig.g.visible = false; p.pos.set(C.car.pos.x, C.car.pos.y, C.car.pos.z); }
    return { speed: 5.6, mode: null };
  }
  if (C.phase === 'out' || C.phase === 'foot') { const away = { x: p.pos.x + (p.pos.x - C.sp.x), z: p.pos.z + (p.pos.z - C.sp.z) }; walk(p, away.x, away.z, 5.4, dt); return { speed: 5.4, mode: null }; } // on foot: run for it
  return { speed: 0, mode: null };
}
function getawayAI(v, dt) { const C = CREW; if (!C || !C.flee) return; driveTo(v, C.flee.x, C.flee.z, dt, { near: 30, maxSpeed: 24 }); }
function copsAfter(C) { // a cruiser for the robbers: it never looks at you unless you give it a reason (src/police.js)
  const tgt = C.car && C.phase === 'drive' ? C.car.pos : (C.robbers.find(r => r.state !== 'dead' && !r.removed) || {}).pos; if (!tgt) return;
  const ne = ctx.randomEdgeNear(tgt.x, tgt.z, 140, 240, e => e.t <= 5); if (!ne) return;
  const a = ctx.agentFromNearest(ne, tgt.x - ne.x, tgt.z - ne.z, true), q = ctx.laneSample(a, 0, ctx.laneOff, { x: 0, z: 0, tx: 0, tz: 0 });
  const v = new ctx.Vehicle('police', q.x, q.z, Math.atan2(q.tx, q.tz)); v.driver = 'cop'; v.siren = true; v.keep = true; v.ai = copForRobbers; v.vel.set(v.fx * 10, v.fz * 10); ctx.settleCar(v);
  C.cops = v; ctx.notify('<b>SHERIFF RADIO</b> · Units responding to the robbery.', 'blue', 4000);
}
function copForRobbers(v, dt) {
  const C = CREW; if (!C || C.done) { v.ai = null; v.siren = false; v.keep = false; v.leaving = true; return; }
  const live = C.robbers.filter(r => !r.removed && r.state !== 'dead'); const car = C.car && C.phase === 'drive' && !C.car.removed ? C.car : null;
  const tgt = car ? car.pos : live[0] ? live[0].pos : null; if (!tgt) { C.done = true; return; }
  const d = hyp(tgt.x - v.pos.x, tgt.z - v.pos.z), cs = car ? car.vel.length() : 0;
  // tail the getaway car ~10 m back at its speed (like a deputy shadowing you, src/police.js); close in once it stops
  const hx = cs > 2 ? car.vel.x / cs : 0, hz = cs > 2 ? car.vel.y / cs : 0, tx = tgt.x - hx * 10, tz = tgt.z - hz * 10;
  driveTo(v, tx, tz, dt, { near: 4, maxSpeed: d < 40 ? Math.max(5, cs + Math.min(6, hyp(tx - v.pos.x, tz - v.pos.z) * 0.4)) : v.spec.vmax });
  v.tailT = car && d < 28 ? (v.tailT || 0) + dt : 0;
  if (v.tailT > 12) { v.tailT = 0; car.rotY += (Math.random() < 0.5 ? -1 : 1) * 0.9; car.vel.multiplyScalar(0.3); car.health = Math.min(car.health, 40); ctx.notify('<b>SHERIFF RADIO</b> · PIT on the getaway car, suspects bailing out.', 'blue', 4000); } // the getaway ends in a PIT
  v.closeT = d < (car ? 12 : 9) && (!car || car.vel.length() < 4 || car.dead) ? (v.closeT || 0) + dt : 0;
  if (v.closeT > 2.2) arrestCrew(C, 'Deputies arrested the robbers.');
}
function arrestCrew(C, msg) {
  if (C.done) return; C.done = true;
  for (const r of C.robbers) if (!r.removed && r.state !== 'dead') r.remove();
  if (C.car && !C.car.removed && C.car.driver === 'ai') { C.car.ai = null; C.car.driver = null; C.car.keep = false; C.car.mission = false; }
  ctx.notify(msg, 'blue', 4000);
}
function updateRobbery(dt) {
  if (!CREW) {
    crewT -= dt; if (crewT > 0 || police.wanted || JOB || (ctx.storyBusy && ctx.storyBusy())) return;
    crewT = startRobbery() ? rand(220, 380) : 20; return;
  }
  const C = CREW, f = ctx.focusPos(); C.t += dt;
  const live = C.robbers.filter(r => !r.removed && r.state !== 'dead');
  if (C.phase === 'in' && C.t > 6) { // they've been at the register: out to the car
    C.phase = 'out'; S().robbed[C.sp.id] = today(); live.forEach(r => { r.money = Math.round(C.take / live.length); });
    const clerk = new ctx.Ped(C.sp.x + C.sp.ix * 1.4, C.sp.z + C.sp.iz * 1.4, {}); clerk.keep = false; ctx.say(clerk, pick(['Somebody stop them!', 'They took everything!', 'Call the Sheriff!']), 'mad'); clerk.flee(C.sp.x, C.sp.z, 8);
  }
  if (C.phase === 'out' && C.car && !C.car.removed && live.length && live.every(r => r.inGetaway)) { // everyone's in: drive
    C.phase = 'drive'; const far = ctx.randomEdgeNear(C.car.pos.x, C.car.pos.z, 900, 1400, e => e.t <= 4); C.flee = far ? { x: far.x, z: far.z } : { x: C.car.pos.x + 1000, z: C.car.pos.z };
    Object.assign(C.car, { parked: false, driver: 'ai', ai: getawayAI, react: -1000 });
  }
  if (C.phase === 'out' && (!C.car || C.car.removed || C.car.dead)) C.phase = 'foot';
  if (C.phase === 'drive' && C.car && (C.car.dead || C.car.health < 45)) { // the car's had it: they bail out and run
    C.phase = 'foot'; C.car.ai = null; C.car.driver = null; let k = 0;
    for (const r of live) { const s = (k++ ? 1 : -1) * (C.car.spec.W / 2 + 0.8); r.pos.set(C.car.pos.x + C.car.fz * s, C.car.pos.y, C.car.pos.z - C.car.fx * s); r.rig.g.visible = true; r.inGetaway = false; r.fight = hyp(f.x - r.pos.x, f.z - r.pos.z) < 30; }
  }
  if (C.cops && (C.cops.dead || C.cops.removed || C.cops.ai !== copForRobbers)) { C.cops = null; C.copT = rand(6, 10); } // wrecked, or busy with you: another unit
  C.copT -= dt; if (C.copT <= 0 && !C.cops && !C.done) copsAfter(C);
  if (!C.done && !live.length) { C.done = true; ctx.notify('<b>The robbers are down.</b> Pick up what they took.', 'green', 4000); }
  if (C.phase === 'drive' && C.flee && C.car && hyp(C.car.pos.x - C.flee.x, C.car.pos.z - C.flee.z) < 40) { arrestCrew(C, 'The robbers got away.'); }
  const fd = hyp((C.car && C.phase === 'drive' ? C.car.pos.x : C.sp.x) - f.x, (C.car && C.phase === 'drive' ? C.car.pos.z : C.sp.z) - f.z);
  if (C.done || fd > 1500) {
    if (!C.done) arrestCrew(C, '');
    if (C.cops && !C.cops.removed) { C.cops.ai = null; C.cops.siren = false; C.cops.keep = false; C.cops.leaving = true; if (C.cops.driver === 'cop') C.cops.driver = null; }
    if (C.car && !C.car.removed) { C.car.keep = false; C.car.mission = false; }
    CREW = null;
  }
}
on('ped:killed', ({ ped, by }) => {
  if (!ped || !ped.robber || by !== 'player' || !CREW) return;
  const n = Math.round(randi(200, 350) * (1 + 0.1 * skill('bigscore'))); ctx.save.money += n; ctx.save.rep += 2; ctx.sfx.cash();
  ctx.notify(`<b>Robber stopped.</b> The store's reward: +${money(n)}`, 'green', 3500); emit('crime:done', { kind: 'vigilante' });
});

// ------------------------------------------------------------------ every half second / every frame, and the maps
let t2 = 0;
export function updateHeists(dt) {
  if (!SPOTS) return;
  if (off()) { if (JOB && ctx.player.dead) endHeist(false, 'You went down. The take is gone.'); return; }
  updateHeist(dt); updateRobbery(dt);
  t2 -= dt; if (t2 > 0) return; t2 = 0.5;
  const f = ctx.focusPos();
  for (const b of SPOTS.bank) if (hyp(b.x - f.x, b.z - f.z) < 140) bankPrompt(b);
  for (const [id, it] of bankItems) { const b = SPOTS.bank.find(x => x.id === id); if (!b || hyp(b.x - f.x, b.z - f.z) > 180) { removeInteract(it); bankItems.delete(id); } }
}
export function heistMarks() {
  const out = [];
  if (JOB) { const d = doorOf(JOB.b); out.push({ x: d.x, z: d.z, color: '#ffd23f', letter: '$', size: 7, edge: true, label: 'Heist' }); }
  if (CREW && !CREW.done) {
    const r = CREW.phase === 'drive' && CREW.car ? CREW.car.pos : (CREW.robbers.find(x => !x.removed && x.state !== 'dead') || {}).pos;
    if (r) out.push({ x: r.x, z: r.z, color: '#ff4d4d', size: 6, edge: true, label: 'Robbers' });
  }
  return out;
}
export const heistDebug = { get JOB() { return JOB; }, get CREW() { return CREW; }, robNow: () => { crewT = 0; }, startHeist, caseBank, endHeist, H };
