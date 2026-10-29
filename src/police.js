// San Diego County Sheriff (Poway Station) AI.
//
// Deputies only know what they can see or what dispatch tells them:
// - Every unit has a vision cone and needs line of sight. Night, fog and rain shorten it.
// - Crimes need a witness: a deputy who sees or hears it, a security camera, or a civilian who saw it and calls 911.
//   A civilian has to be in range (shorter in the dark and the fog, shortest for sleight of hand), looking roughly the
//   right way and in line of sight. Witnesses get clear first, then dial; the stars come when the call goes through,
//   so a witness you stop in time (or scare quiet, once you can) never reports anything. Nobody saw it, no stars.
// - While a unit has eyes on you the stars are solid and the last known position (LKP) follows you.
//   Once every unit loses you the stars flash, a search area is drawn around the LKP and units
//   search it. Stay unseen long enough (faster outside the area, faster again in a different car)
//   and the level clears. Being spotted again fills a detection meter first, unless you're close.
// - Escalation of force: at 1-2 stars deputies arrest (taser for runners, "drop it" warnings for an
//   armed suspect). Lethal force comes at 3+ stars, or once you threaten them. Holster your gun and
//   stand still (or sit still in a stopped car) and they cuff you instead of shooting, up to 4 stars.
// - 0 stars: patrols pull you over for speeding, red lights and reckless driving. Stop and take the
//   ticket, or run. Stolen cars get reported and their plates go hot.
// - 3+: ASTREA helicopter (tracks a footprint that lags a fast car), roadblocks, PIT maneuvers.
//   4+: spike strips and passenger fire. 5: SED tactical unit and a marksman in the helicopter.
import { ctx } from './ctx.js';
import { emit, on } from './events.js';
import { skill } from './progress.js';
import { steerTo, driveTo } from './drive.js';

export const police = {
  wanted: 0, heat: 0, lastSeen: -99, heli: null, spawnT: 0,
  lkp: null, detect: 0, cool: 0, suspect: null, visible: 0,
  threatT: -99, rammedT: -99, recklessT: -99, tipT: 0, radioT: 0, recruitT: 0,
  roadblock: null, roadblockT: 20, stop: null, sed: false, stunT: 0, lastTheft: null, redNode: -1,
};
export const NEED = [0, 10, 16, 24, 32, 42];         // seconds unseen (outside the search area) to clear each level
export const SEARCH_R = [0, 80, 110, 150, 190, 230];  // search-area radius around the last known position
const QUOTA = [0, 2, 3, 4, 6, 8];                    // dispatched cruisers per level
const COS_CAR = Math.cos(80 * Math.PI / 180), COS_PED = Math.cos(70 * Math.PI / 180);
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hyp = Math.hypot;
const wrapA = a => { if (a <= Math.PI && a >= -Math.PI) return a; if (!isFinite(a)) { if (!self.__wrapBad) self.__wrapBad = new Error('wrapA ' + a).stack; return 0; } a = (a + Math.PI) % (TAU); if (a < 0) a += TAU; return a - Math.PI; }; // O(1): a runaway angle used to spin a while-loop for seconds
const now = () => ctx.simTime;
const lostFor = () => now() - police.lastSeen;
const isSolid = () => police.wanted > 0 && lostFor() < 2.5;
const street = (x, z) => ctx.streetAt(x, z) || 'a side street';
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------------ radio + descriptions
function radio(text, force) {
  if (!force && now() < police.radioT) return;
  police.radioT = now() + 6;
  ctx.notify('<b>SHERIFF RADIO</b> · ' + text, 'blue', 5500);
}
// Every NPC gun aimed at the player goes through here. Deputies need time to aim, open with a miss,
// get more accurate the longer a fight lasts, and a shared budget caps how many rounds can land per
// second, so a crowd of shooters can't erase you in a blink.
const fireLog = [];
const HITS_PER_SEC = [1, 1, 1, 1, 2, 2];
export function npcFire(x, y, z, acc, dmg) {
  const t = now(); while (fireLog.length && t - fireLog[0] > 1) fireLog.shift();
  if (fireLog.length >= HITS_PER_SEC[police.wanted]) acc = 0;
  if (ctx.copShot(x, y, z, acc, dmg)) fireLog.push(t);
}
function aimed(p, t) { // seconds of steady aim before a deputy may fire; first round of a fight is a warning miss
  if (!p.aimT) { p.aimT = t + rand(0.9, 1.6); p.engageT = t; p.firstShot = true; }
  return t >= p.aimT;
}
const TYPE_NAME = { sedan: 'sedan', suv: 'SUV', pickup: 'pickup', sports: 'sports car', van: 'van', police: 'stolen Sheriff cruiser' };
function describe() {
  const P = ctx.player;
  if (!P.inCar) return P.weapon === 1 ? 'on foot, armed' : 'on foot';
  const v = P.inCar, col = v.tint === 0xf0b23a ? 'gold ' : (v.tint === 0x666666 || v.tint === 0x888888) ? 'gray ' : '';
  return 'in a ' + col + (v.sed ? 'black SUV' : TYPE_NAME[v.type] || 'car');
}
const WHAT = {
  assault: 'an assault', murder: 'a homicide', carjack: 'a carjacking', theft: 'a vehicle theft', gunfire: 'shots fired',
  copkill: 'a deputy down', explosion: 'an explosion', hitrun: 'a hit-and-run', hitped: 'a pedestrian struck', evade: 'a driver evading',
  sighting: 'a suspect sighting', mugging: 'a mugging', robbery: 'an armed robbery', burglary: 'a burglary', shoplift: 'a shoplifter',
  pickpocket: 'a pickpocket', skimming: 'ATM tampering', parts: 'a car being stripped', heist: 'an armored car robbery', racket: 'extortion',
};
const NEWS = {
  assault: s => `Brawl breaks out on ${s}. Witnesses describe a "very rude" suspect.`,
  murder: s => `Sheriff's deputies investigate a death on ${s}.`,
  carjack: s => `Driver dragged from car on ${s}. Neighborhood app is furious.`,
  theft: s => `Car stolen in broad daylight on ${s}.`,
  gunfire: s => `Reports of shots fired near ${s}. Residents urged to stay inside.`,
  copkill: s => `Deputy down on ${s}. County-wide manhunt underway.`,
  explosion: s => `Vehicle explodes on ${s}. "Not very City in the Country," says one local.`,
  hitrun: s => `Hit-and-run on ${s}. The other driver says they'll "never forget that face."`,
  hitped: s => `Pedestrian struck on ${s}. Driver did not stop.`,
  mugging: s => `Resident robbed at gunpoint on ${s}. "He was very calm about it," says victim.`,
  robbery: s => `Armed robbery at a store on ${s}. Clerk unharmed, register empty.`,
  burglary: s => `Break-in on ${s}. Neighborhood app recommends "better locks and fewer posts about vacations."`,
  shoplift: s => `Shoplifter flees store on ${s}. Loss estimated at "a lot of beef jerky."`,
  pickpocket: s => `Wallets going missing on ${s}. Sheriff urges residents to use front pockets.`,
  skimming: s => `Card skimmer found on an ATM near ${s}. Check your statements, Poway.`,
  parts: s => `Catalytic converter thieves strike again on ${s}. "It sounded like a dentist," says neighbor.`,
  heist: s => `Armored car hit on ${s}. Guards shaken. Cash gone.`,
};
let newsT = 0;

// ------------------------------------------------------------------ vision
function visMul() {
  const w = ctx.weather, dark = ctx.nightAmount * (ctx.player.inCar ? 0.25 : 0.5); // headlights give a car away at night
  return (1 - dark) * (1 - 0.5 * w.fog) * (1 - 0.2 * w.rain);
}
// How well a unit at (ox,oy,oz) facing rotY sees the player: 0 = not at all, up to 1 = point blank.
function sight(ox, oy, oz, rotY, range, cosFov, close) {
  const f = ctx.focusPos(), dx = f.x - ox, dz = f.z - oz, d = Math.hypot(dx, dz);
  range = Math.max(range * visMul(), close + 1); if (d > range) return 0;
  if (d > close && (dx * Math.sin(rotY) + dz * Math.cos(rotY)) / d < cosFov) return 0;
  if (!ctx.los(ox, oy, oz, f.x, f.y + 1.2, f.z)) return 0;
  return d <= close ? 1 : clamp(1 - (d - close) / (range - close), 0.05, 0.97);
}
// Can a unit see a crime happening at (x,y,z)?
function witnesses(ox, oy, oz, rotY, cosFov, close, x, y, z, d) {
  if (d > close && ((x - ox) * Math.sin(rotY) + (z - oz) * Math.cos(rotY)) / d < cosFov) return false;
  return ctx.los(ox, oy, oz, x, y + 1.2, z);
}
const freshly = (u, t) => u.sees > 0 && t - (u.seesT || -9) < 0.6;
function scanUnits() {
  const t = now(), w = police.wanted, f = ctx.focusPos(); let best = 0;
  for (const v of ctx.vehicles) {
    if (!v.isCop || v.dead || v.driver !== 'cop') continue;
    if (t >= (v.seeNext || 0)) {
      v.seeNext = t + rand(0.2, 0.32);
      v.sees = (w || v.ai) ? sight(v.pos.x, v.pos.y + 1.5, v.pos.z, v.rotY, 90, COS_CAR, 14) : 0;
      v.seesT = t;
      if (w && v.sees > 0 && !v.ai && !v.roadblock) engage(v, 'chase'); // a patrol spots the suspect: joins in
    }
    if (freshly(v, t)) best = Math.max(best, v.sees);
  }
  for (const p of ctx.peds) {
    if (!p.isCop || p.state === 'dead' || p.state === 'down' || p.state === 'fly') continue;
    if (t >= (p.seeNext || 0)) {
      p.seeNext = t + rand(0.2, 0.32); p.sees = sight(p.pos.x, p.pos.y + 1.6, p.pos.z, p.rotY, 60, COS_PED, 10); p.seesT = t;
      if (w && p.sees > 0 && (p.state === 'walk' || p.state === 'idle')) p.state = 'cop'; // off-duty-looking deputy (car gone) re-engages
    }
    if (freshly(p, t)) best = Math.max(best, p.sees);
  }
  const h = police.heli; if (h && freshly(h, t)) best = Math.max(best, h.sees);
  police.visible = best;
}
function markSeen() {
  const f = ctx.focusPos(), P = ctx.player, wasLost = police.wanted > 0 && lostFor() > 2.5;
  police.lastSeen = now(); police.lkp = { x: f.x, z: f.z }; police.detect = 0; police.cool = 0;
  police.suspect = P.inCar || 'foot';
  if (wasLost) radio(`Eyes on the suspect, ${street(f.x, f.z)}. ${cap(describe())}.`, true);
}

// ------------------------------------------------------------------ wanted level
export function setWanted(n, why, o = {}) {
  n = clamp(n, 0, 5); const prev = police.wanted, seen = o.seen !== false;
  if (n > prev) {
    police.wanted = n; police.heat = 0;
    if (why) ctx.notify(why, 'blue');
    ctx.sfx.phone(0.6);
    if (prev === 0) { police.spawnT = seen ? 1.5 : 4; police.cool = 0; police.roadblockT = rand(15, 25); police.sed = false; endStop(); }
    emit('wanted', { level: n, prev });
  }
  if (seen) markSeen();
  else if (prev === 0 || lostFor() > 2.5) {
    const f = ctx.focusPos();
    police.lkp = { x: o.x ?? f.x, z: o.z ?? f.z };
    if (prev === 0) police.lastSeen = now() - 3; // dispatch knows roughly where, nobody has eyes on you yet
    police.cool = Math.max(0, police.cool - 6);
  }
  if (prev === 0 && n > 0) {
    const c = police.lkp || ctx.focusPos();
    radio(`Units respond to ${WHAT[o.what] || 'a disturbance'} on ${street(c.x, c.z)}. Suspect ${seen ? describe() : 'description pending'}.`, true);
  }
}
function bumpHeat(sev) {
  if (police.wanted >= 2 && !police.violent) { police.heat = 0; return; } // vehicular trouble alone stops at two stars
  police.heat += sev;
  if (police.heat >= 5 && police.wanted < 5) { police.wanted++; police.heat = 0; ctx.notify('The Sheriff is sending more units.', 'blue'); emit('wanted', { level: police.wanted, prev: police.wanted - 1 }); }
}
function loseWanted() {
  const prev = police.wanted;
  police.wanted = 0; police.heat = 0; police.cool = 0; police.lkp = null; police.detect = 0; police.sed = false; police.violent = false;
  ctx.notify('You lost the Sheriff.', 'green'); radio('All units, suspect lost. Resume patrol.', true);
  clearCops(false); ctx.save.rep += 1; ctx.save.stats.evaded = (ctx.save.stats.evaded || 0) + 1; if (prev >= 3) ctx.save.stats.evaded3 = (ctx.save.stats.evaded3 || 0) + 1;
  emit('wanted', { level: 0, prev });
}

export function crime(kind, x, z, sev, victim) {
  const { save, peds, vehicles, player } = ctx;
  // Dragging a driver out of their car is between you and the owner (they come after you themselves, see revenge()
  // in index.html); the Sheriff only cares when it's one of theirs. A car stolen off a driveway goes through the
  // witnesses like anything else.
  if (kind === 'carjack' && !(victim && victim.isCop) && sev < 2) { emit('crime', { kind, x, z, sev, victim }); return; }
  // Running people over gets the Sheriff called, but on its own it never goes past two stars.
  if (kind === 'hitped') { sev = Math.min(sev, 2); if (police.wanted >= 2 && !police.violent) { emit('crime', { kind, x, z, sev, victim }); return; } }
  if (kind === 'gunfire' || kind === 'assault' || kind === 'murder' || kind === 'copkill' || kind === 'explosion') police.violent = true;
  save.rep -= sev * 4 + (kind === 'murder' || kind === 'copkill' ? 8 : 0);
  if (now() > newsT && NEWS[kind]) { newsT = now() + 40; const s = street(x, z); setTimeout(() => ctx.notify('<b>POWAY NEWS</b> · ' + NEWS[kind](s), 'news', 8000), 9000); }
  emit('crime', { kind, x, z, sev, victim });
  if (kind === 'carjack' || kind === 'theft') police.lastTheft = { t: now(), sev };
  const y = ctx.heightAt(x, z), loud = kind === 'gunfire' ? 110 : kind === 'explosion' ? 220 : 0;
  let seen = false, heard = false;
  for (const p of peds) {
    if (!p.isCop || p.state === 'dead' || p.state === 'down' || p.state === 'fly') continue;
    const d = hyp(p.pos.x - x, p.pos.z - z);
    if (d < 60 && witnesses(p.pos.x, p.pos.y + 1.6, p.pos.z, p.rotY, COS_PED, 12, x, y, z, d)) { seen = true; p.state = 'cop'; }
    else if (d < loud) heard = true;
  }
  for (const v of vehicles) {
    if (!v.isCop || v.dead || v.driver !== 'cop') continue;
    const d = hyp(v.pos.x - x, v.pos.z - z);
    if (d < 75 && witnesses(v.pos.x, v.pos.y + 1.5, v.pos.z, v.rotY, COS_CAR, 16, x, y, z, d)) { seen = true; if (!v.roadblock && v.task !== 'stop') engage(v, 'chase'); }
    else if (d < loud) heard = true;
  }
  const h = police.heli; if (h && h.look && hyp(h.look.x - x, h.look.z - z) < 50) seen = true;
  const violent = kind === 'gunfire' || kind === 'assault' || kind === 'murder' || kind === 'copkill' || kind === 'explosion';
  if ((victim && victim.isCop) || kind === 'copkill' || (seen && violent)) police.threatT = now();
  if (seen) {
    if (police.wanted >= sev && sev > 0) bumpHeat(sev);
    setWanted(Math.max(sev, 1, police.wanted), police.wanted ? null : 'Deputies saw that.', { seen: true, what: kind });
  } else if (heard) {
    if (police.wanted) { if (lostFor() > 2.5) { police.lkp = { x, z }; police.cool = Math.max(0, police.cool - 5); radio(`${kind === 'gunfire' ? 'Shots fired' : 'Explosion'} near ${street(x, z)}.`); } }
    else setWanted(Math.max(1, sev), kind === 'gunfire' ? 'Deputies heard the shots.' : 'Deputies heard the blast.', { seen: false, x, z, what: kind });
  } else if (police.wanted > 0 && sev >= 2) bumpHeat(sev);
  // civilians: the ones who saw it scatter and some of them call it in; with a gun or a blast, everyone near enough
  // to hear runs, and a few call about the noise (that's 'shots fired', not what you did)
  const radius = loud ? 70 : 45, range = eyeRange(SEE_R[kind] || 40), callP = CALL_P[kind] ?? 0.35;
  let saw = 0, callers = 0, firstSaw = null;
  for (const p of peds) {
    if (p === victim || p.isCop || p.ai || p.remote || p.state === 'dead' || p.state === 'fly') continue;
    const d = hyp(p.pos.x - x, p.pos.z - z); if (d > Math.max(radius, range)) continue;
    const sees = sawIt(p, x, y, z, range);
    if (!sees && !(loud && d < radius)) continue;
    if (sees) { saw++; if (!firstSaw) firstSaw = p; }
    if (p.state === 'fight') continue;
    const brave = sees && p.personality === 'tough' && kind === 'assault' && d < 15 && !player.inCar && Math.random() < 0.35;
    const quiet = QUIET.has(kind); // people notice, they don't run for their lives
    if (brave) { p.anger = 100; p.state = 'fight'; p.timer = 20; p.talk('fight'); }
    else if (quiet) { if (sees && Math.random() < 0.5) p.talk('theft'); if (sees && !p.callT) p.flee(x, z, rand(4, 7)); }
    else p.scare(x, z, kind === 'gunfire' ? 'gun' : kind);
    if (p.callT || p.reported) continue;
    const why = sees ? kind : kind === 'explosion' ? 'explosion' : 'gunfire', pc = sees ? callP : 0.2;
    if (p.personality === 'karen' && pc > 0 || Math.random() < pc) { witness(p, why, sees ? sev : 1, x, z); callers++; }
  }
  // a murder somebody saw always gets reported by someone
  if (firstSaw && !callers && callP >= 0.9 && !firstSaw.reported) { witness(firstSaw, kind, sev, x, z); callers++; }
  let cams = 0; for (const w of watchers) if (w(kind, x, y, z, sev)) cams++;
  if (victim && !victim.isCop && victim.state !== 'dead') { victim.pendingSev = sev; victim.pendingWhy = kind; victim.pendingX = x; victim.pendingZ = z; }
  // tell the player how it went, now and then
  if (REPORTABLE.has(kind) && now() > tellT) {
    if (!seen && !heard && !saw && !cams && !(victim && victim.state !== 'dead' && !victim.isCop)) { tellT = now() + 6; ctx.notify('<b>No witnesses.</b> Nobody saw that.', 'green', 3000); }
    else if (!seen && callers) { tellT = now() + 6; ctx.notify(`<b>${callers === 1 ? 'A witness' : callers + ' witnesses'}</b> saw that. Stop them before they reach a phone.`, 'red', 4000); }
  }
}

// ------------------------------------------------------------------ witnesses
// How far a civilian notices a crime (metres, in daylight), and how likely they are to call it in once they have.
const SEE_R = { murder: 45, copkill: 45, assault: 40, mugging: 30, robbery: 35, carjack: 40, explosion: 120, gunfire: 60, hitped: 45, hitrun: 40,
  theft: 30, burglary: 25, parts: 30, skimming: 18, shoplift: 12, pickpocket: 7, heist: 60, racket: 20 };
const CALL_P = { murder: 0.95, copkill: 1, assault: 0.6, mugging: 0.9, robbery: 0.95, carjack: 0.7, explosion: 0.6, gunfire: 0.45, hitped: 0.6, hitrun: 0.5,
  theft: 0.35, burglary: 0.9, parts: 0.6, skimming: 0.7, shoplift: 0.6, pickpocket: 0.7, heist: 1, racket: 0.5 };
const QUIET = new Set(['theft', 'hitrun', 'evade', 'shoplift', 'pickpocket', 'skimming', 'parts', 'burglary']);
const REPORTABLE = new Set(['murder', 'assault', 'mugging', 'robbery', 'burglary', 'shoplift', 'pickpocket', 'skimming', 'parts', 'theft', 'carjack']);
let tellT = 0;
const watchers = []; // security cameras and the like: (kind, x, y, z, sev) -> true when it saw that
export function addWatcher(fn) { watchers.push(fn); }
// in the dark, in fog or rain, you see less far (headlights and street lights aside, which this doesn't try to count)
function eyeRange(r) { const w = ctx.weather; return r * (1 - 0.55 * ctx.nightAmount) * (1 - 0.5 * w.fog) * (1 - 0.15 * w.rain); }
// Did civilian p see something happen at (x, y, z)? Close enough, facing roughly that way (or right next to it), and
// nothing in between.
export function sawIt(p, x, y, z, range) {
  const d = hyp(p.pos.x - x, p.pos.z - z); if (d > range) return false;
  if (d > 6 && ((x - p.pos.x) * Math.sin(p.rotY) + (z - p.pos.z) * Math.cos(p.rotY)) / d < -0.3) return false; // looking the other way
  return ctx.los(p.pos.x, p.pos.y + 1.6, p.pos.z, x, y + 1.2, z);
}
// p will call the Sheriff about `why` once they're clear (a couple of seconds running, then a few on the phone)
export function witness(p, why, sev, x, z) {
  if (p.reported || p.isCop || p.state === 'dead') return;
  p.callT = (why === 'murder' || why === 'robbery' || why === 'heist' ? rand(2.5, 4.5) : rand(3, 7)) * (p.personality === 'coward' ? 1.4 : 1);
  p.pendingSev = Math.max(p.pendingSev || 0, sev); p.pendingWhy = why; p.pendingX = x; p.pendingZ = z; p.witness = true;
}
// a witness who won't be calling anyone after all (intimidated, bribed, or the call is moot)
export function silence(p) { p.callT = 0; p.reported = true; p.witness = false; p.pendingSev = 0; if (p.state === 'call') { p.state = 'flee'; p.fleeFrom = [p.pos.x, p.pos.z]; p.timer = 6; } p.setMarker && p.setMarker(null); }

// A civilian finished a 911 call. They describe where the suspect is now if they can still see them,
// otherwise where it happened.
export function reportCall(p) {
  p.reported = true; p.callT = 0; p.witness = false;
  const sev = Math.max(1, p.pendingSev || 1), P = ctx.player;
  if (P.dead || (p.pendingWhy === 'sighting' && !police.wanted)) return;
  const f = ctx.focusPos(), d = hyp(p.pos.x - f.x, p.pos.z - f.z);
  if (d > 600) return;
  const canSee = d < 60 && ctx.los(p.pos.x, p.pos.y + 1.6, p.pos.z, f.x, f.y + 1.2, f.z);
  const x = canSee ? f.x + rand(-15, 15) : (p.pendingX ?? p.pos.x), z = canSee ? f.z + rand(-15, 15) : (p.pendingZ ?? p.pos.z);
  const why = { assault: 'an assault', murder: 'a murder they saw', carjack: 'a carjacking', theft: 'a stolen car', gunfire: 'shots fired', copkill: 'a deputy down', explosion: 'an explosion', hitrun: 'a hit-and-run', hitped: 'a hit-and-run', bump: 'a lunatic', sighting: 'you',
    mugging: 'a mugging', robbery: 'an armed robbery', burglary: 'a break-in', shoplift: 'a shoplifter', pickpocket: 'a pickpocket', skimming: 'someone messing with an ATM', parts: 'someone under a car with a saw', heist: 'an armored car robbery', racket: 'a shakedown' }[p.pendingWhy] || 'you';
  const lost = police.wanted > 0 && lostFor() > 2.5;
  if (police.wanted >= sev && p.pendingWhy !== 'sighting') bumpHeat(1);
  setWanted(Math.max(sev, police.wanted), `A witness called the Sheriff about ${why}.`, { seen: false, x, z, what: p.pendingWhy });
  if (lost && canSee) radio(`Caller reports the suspect near ${street(x, z)}.`, true);
  ctx.save.rep -= p.pendingWhy === 'sighting' ? 0 : 2;
}

// The player rammed a cruiser.
export function rammedCop(o, imp) {
  if (police.stop && police.stop.cop === o && imp < 4) return;
  if (imp > 4) crime('assault', o.pos.x, o.pos.z, 1);
  police.rammedT = now();
  if (!o.roadblock && (!o.ai || o.task === 'stop')) { if (police.stop && police.stop.cop === o) endStop(); engage(o, 'chase'); }
  setWanted(Math.max(1, police.wanted), 'You rammed a Sheriff cruiser.', { seen: true, what: 'assault' });
}
// The player is pointing a gun at a deputy.
export function aimedAtCop() {
  police.threatT = now();
  if (police.wanted < 2) setWanted(2, 'You pointed a gun at a deputy.', { seen: true, what: 'assault' });
}

// ------------------------------------------------------------------ dispatch
function engage(v, task) {
  v.ai = copCarAI; v.task = task; v.dispatched = true; v.mode = 'free'; v.agent = null; v.siren = true;
  v.path = null; v.searchPt = null; v.leaving = false; v.deployed = false; v.recall = false;
}
function release(v) {
  v.ai = null; v.task = null; v.mode = 'free'; v.siren = false; v.dispatched = false; v.leaving = true; v.searchPt = null; v.path = null; v.roadblock = false;
}
function spawnUnit(sed) {
  const c = police.lkp || ctx.focusPos(), f = ctx.focusPos();
  for (let k = 0; k < 6; k++) {
    const ne = ctx.randomEdgeNear(c.x, c.z, 200, 330, e => e.t <= 5); if (!ne) continue;
    if (hyp(ne.x - f.x, ne.z - f.z) < 150) continue; // don't pop in right next to the suspect
    const a = ctx.agentFromNearest(ne, c.x - ne.x, c.z - ne.z, true);
    const q = ctx.laneSample(a, 0, ctx.laneOff, { x: 0, z: 0, tx: 0, tz: 0 }), rot = Math.atan2(q.tx, q.tz);
    const v = sed ? new ctx.Vehicle('suv', q.x, q.z, rot, 0x2a2f2c) : new ctx.Vehicle('police', q.x, q.z, rot);
    if (sed) { v.isCop = true; v.sed = true; v.spec.vmax = 52; v.spec.acc = 14; v.health = 220; radio('SED tactical unit is rolling.', true); }
    v.driver = 'cop'; engage(v, 'respond'); v.vel.set(v.fx * 12, v.fz * 12); ctx.settleCar(v);
    return v;
  }
  return null;
}
function dispatch(dt) {
  const w = police.wanted, c = police.lkp || ctx.focusPos();
  police.spawnT -= dt; police.recruitT -= dt; police.roadblockT -= dt;
  let active = 0;
  for (const v of ctx.vehicles) if (v.isCop && !v.dead && v.dispatched && !v.roadblock) active++;
  const quota = Math.max(1, Math.round(QUOTA[w] * (ctx.policeMul ? ctx.policeMul(c.x, c.z) : 1))); // La Jolla and downtown send more (src/world/zones.js)
  if (police.recruitT <= 0) { // patrols within radio range of the LKP respond
    police.recruitT = 1;
    for (const v of ctx.vehicles) {
      if (active >= quota) break;
      if (v.isCop && v.driver === 'cop' && !v.dead && !v.ai && hyp(v.pos.x - c.x, v.pos.z - c.z) < 320) { engage(v, 'respond'); active++; }
    }
  }
  if (police.spawnT <= 0 && active < quota) { spawnUnit(false); police.spawnT = (w >= 3 ? 2.5 : 4.5) / Math.max(0.6, quota / QUOTA[w]); }
  if (w >= 5 && !police.sed && spawnUnit(true)) police.sed = true;
  if (w >= 3 && police.roadblockT <= 0 && isSolid()) police.roadblockT = trySpawnRoadblock() ? rand(30, 45) : 3;
}
function deploy(v, n) {
  v.deployed = true; if (v.sed) n = 4;
  for (let i = 0; i < n; i++) {
    const sx = (i % 2 ? 1 : -1) * (v.spec.W / 2 + 0.7), back = Math.floor(i / 2) * 1.6;
    const p = new ctx.Ped(v.pos.x + v.fz * sx - v.fx * back, v.pos.z - v.fx * sx - v.fz * back, { cop: true, car: v });
    p.state = 'cop'; p.rotY = v.rotY;
    if (v.sed) { p.sed = true; p.health = 220; }
  }
  v.crewOut = n; ctx.peds[ctx.peds.length - 1].talk('cop', 'cop');
}

// ------------------------------------------------------------------ cruiser AI (v.ai)
function copCarAI(v, dt) {
  const P = ctx.player, f = ctx.focusPos();
  if (v.crewOut > 0) { // deputies are out of the car: wait for them
    ctx.drivePhysics(v, 0, 0, true, false, dt); ctx.carHitWorld(v); ctx.settleCar(v, dt);
    if (v.task !== 'stop' && v.task !== 'roadblock') {
      const d = hyp(f.x - v.pos.x, f.z - v.pos.z);
      if ((P.inCar && d > 35 && P.inCar.vel.length() > 5) || (!P.inCar && d > 70)) v.recall = true;
      if (v.recall && !ctx.peds.some(p => p.homeCar === v && p.state !== 'dead')) { v.crewOut = 0; v.recall = false; v.deployed = false; }
    }
    return;
  }
  if (v.task === 'stop') return stopDrive(v, dt);
  if (v.task === 'roadblock') { v.siren = true; ctx.drivePhysics(v, 0, 0, true, false, dt); ctx.settleCar(v, dt); if (!police.wanted) release(v); return; }
  if (police.wanted === 0 || P.dead) { release(v); return; }
  if ((v.crewLost || 0) >= 2) { v.driver = null; v.ai = null; v.mode = 'free'; v.siren = false; v.dispatched = false; return; }
  v.siren = true;
  const c = police.lkp || f, dl = hyp(c.x - v.pos.x, c.z - v.pos.z);
  if (isSolid() && dl < 90) chaseDrive(v, dt);
  else if (isSolid() || (dl > SEARCH_R[police.wanted] * 0.7 && !v.searchPt)) driveTo(v, c.x, c.z, dt); // respond to the LKP
  else searchDrive(v, dt);
  if (police.wanted >= 4 && isSolid() && freshly(v, now()) && hyp(f.x - v.pos.x, f.z - v.pos.z) < 35 && Math.random() < dt * 0.7)
    npcFire(v.pos.x, v.pos.y + 1.5, v.pos.z, 0.18 + 0.03 * police.wanted, 6); // passenger fire
}
function searchDrive(v, dt) {
  const c = police.lkp || ctx.focusPos(), t = now();
  if (!v.searchPt || hyp(v.searchPt.x - v.pos.x, v.searchPt.z - v.pos.z) < 18 || t > v.searchUntil) {
    const ne = ctx.randomEdgeNear(c.x, c.z, 10, SEARCH_R[police.wanted] || 80, e => e.t <= 5);
    v.searchPt = ne ? { x: ne.x, z: ne.z } : { x: c.x, z: c.z }; v.searchUntil = t + 20;
  }
  driveTo(v, v.searchPt.x, v.searchPt.z, dt, { maxSpeed: 15 });
}
function chaseDrive(v, dt) {
  const P = ctx.player, f = ctx.focusPos(), d = hyp(f.x - v.pos.x, f.z - v.pos.z), w = police.wanted;
  if (!P.inCar) { // suspect on foot: pull up close and bail out
    steerTo(v, f.x, f.z, dt, { maxSpeed: d < 40 ? 9 : v.spec.vmax, stop: d < 18 });
    if (d < 24 && v.vel.length() < 3 && !v.deployed) deploy(v, 2);
    return;
  }
  const car = P.inCar, cs = car.vel.length();
  v.pinT = cs < 1.5 ? (v.pinT || 0) + dt : 0;
  if (v.pinT > 1 && d < 24) { // suspect stopped: box them in and get out
    steerTo(v, car.pos.x, car.pos.z, dt, { stop: d < 9, maxSpeed: 6 });
    if (v.vel.length() < 2 && !v.deployed) deploy(v, w >= 3 ? 2 : 1);
    return;
  }
  if (cs > 6) v.deployed = false;
  const hx = cs > 2 ? car.vel.x / cs : car.fx, hz = cs > 2 ? car.vel.y / cs : car.fz;
  const rx = v.pos.x - car.pos.x, rz = v.pos.z - car.pos.z, along = rx * hx + rz * hz, side = rx * hz - rz * hx;
  let tx, tz, maxSpeed = v.spec.vmax;
  if (w <= 2) { // shadow: sit ~10 m back with lights on, no ramming
    tx = car.pos.x - hx * 10; tz = car.pos.z - hz * 10;
    maxSpeed = Math.max(6, cs + hyp(tx - v.pos.x, tz - v.pos.z) * 0.6);
    if (d < 9) maxSpeed = Math.min(maxSpeed, cs);
  } else { // 3+: line up on the rear quarter, then turn in (PIT)
    const lead = clamp(d / 30, 0.2, 1), px = car.pos.x + car.vel.x * lead, pz = car.pos.z + car.vel.y * lead, sg = side >= 0 ? 1 : -1;
    if (along < -8 || Math.abs(side) > 6) { tx = px - hx * 4 + hz * sg * 2.2; tz = pz - hz * 4 - hx * sg * 2.2; }
    else { tx = px - hx * 1.5; tz = pz - hz * 1.5; }
  }
  if (d > 70) driveTo(v, tx, tz, dt, { maxSpeed }); else steerTo(v, tx, tz, dt, { maxSpeed });
}

// ------------------------------------------------------------------ deputy AI (p.ai)
export function copPedAI(p, dt) {
  switch (p.state) {
    case 'cop': return engaged(p, dt);
    case 'search': return searching(p, dt);
    case 'ticket': return ticketing(p, dt);
    case 'return': case 'leave': return backToCar(p, dt);
    default: return null; // walk / idle / flee: civilian state machine
  }
}
function move(p, speed, dt) {
  p.pos.x += Math.sin(p.rotY) * speed * dt; p.pos.z += Math.cos(p.rotY) * speed * dt;
  return ctx.collideCircle(p.pos, 0.35);
}
function face(p, x, z, dt, rate = 8) { p.rotY += wrapA(Math.atan2(x - p.pos.x, z - p.pos.z) - p.rotY) * Math.min(1, dt * rate); }
function engaged(p, dt) {
  const P = ctx.player, f = ctx.focusPos(), w = police.wanted, t = now();
  if (w === 0 || P.dead) { p.state = 'leave'; return { speed: 0 }; }
  if (p.homeCar && p.homeCar.recall) { p.state = 'return'; return { speed: 0 }; }
  const d = hyp(f.x - p.pos.x, f.z - p.pos.z), iSee = freshly(p, t);
  if (!iSee && lostFor() > 3) { p.state = 'search'; p.searchPt = null; return { speed: 0 }; }
  face(p, f.x, f.z, dt);
  p.taserCd = (p.taserCd || 0) - dt; p.shootCd -= dt;
  const armed = P.weapon === 1 && !P.inCar;
  let lethal = p.sed || w >= 3 || t - police.threatT < 10 || (P.inCar && w >= 2 && t - police.rammedT < 8);
  if (armed && !lethal && iSee) { // gun out at 1-2 stars: warn first, then fire
    if (!p.warnT) { p.warnT = t + 2.6; ctx.say(p, pick(['Drop the weapon!', 'Drop it! Now!', 'Put the gun down!']), 'cop'); }
    else if (t > p.warnT) { police.threatT = t; lethal = true; if (w < 2) setWanted(2, 'You kept your gun out. Deputies are authorized to fire.', { seen: true, what: 'assault' }); }
  } else if (!armed) p.warnT = 0;
  const surrender = !p.sed && w <= 4 && t - police.threatT > 6 &&
    (P.inCar ? P.inCar.vel.length() < 1 : (P.weapon === 0 && P.speed < 0.5));
  if (!lethal || surrender) { p.aimT = 0; return arrest(p, dt, d, armed); }
  let speed = 0; const want = P.inCar ? 14 : (p.sed ? 8 : 11);
  if (d > want + 4 || !iSee) { speed = 5.2; move(p, speed, dt); }
  if (!iSee) p.aimT = 0;
  else if (p.shootCd <= 0 && d < 45 && aimed(p, t)) {
    p.shootCd = rand(0.8, 1.4) * (p.sed ? 0.7 : 1);
    const ramp = clamp((t - p.engageT) / 6, 0.3, 1), acc = p.firstShot ? 0 : (0.28 + 0.035 * w + (p.sed ? 0.12 : 0)) * ramp;
    p.firstShot = false;
    npcFire(p.pos.x + Math.sin(p.rotY) * 0.6, p.pos.y + 1.45, p.pos.z + Math.cos(p.rotY) * 0.6, acc, p.sed ? 10 : 8);
  }
  if (Math.random() < dt * 0.2) p.talk('cop', 'cop');
  return { speed, mode: 'aim' };
}
function arrest(p, dt, d, armed) {
  const P = ctx.player; let speed = 0;
  if (P.inCar) {
    const car = P.inCar, cs = car.vel.length(), o = car.spec.W / 2 + 0.6;
    const dx = car.pos.x + car.fz * o, dz = car.pos.z - car.fx * o, dd = hyp(dx - p.pos.x, dz - p.pos.z); // driver's door
    if (cs < 2.5) {
      face(p, dx, dz, dt);
      if (dd > 1.4) { speed = 5.4; move(p, speed, dt); p.bustT = Math.max(0, p.bustT - dt); }
      else {
        face(p, car.pos.x, car.pos.z, dt); p.bustT += dt;
        if (p.bustT > 0.3 && !p.saidOut) { ctx.say(p, pick(['Out of the car!', 'Hands on the wheel!', 'Step out of the vehicle!']), 'cop'); p.saidOut = true; }
        if (p.bustT > 1.6) ctx.die('busted');
      }
    } else { p.bustT = 0; p.saidOut = false; if (d > 12) { speed = 5; move(p, speed, dt); } }
    return { speed, mode: 'aim' };
  }
  if (armed) { if (d > 9) { speed = 4.5; move(p, speed, dt); } return { speed, mode: 'aim' }; } // standoff, barking orders
  if (d > 1.3) {
    speed = 5.6; move(p, speed, dt);
    if (d < 9 && d > 2 && P.speed > 3 && p.taserCd <= 0 && freshly(p, now())) { // runner within taser range
      p.taserCd = 5; ctx.say(p, 'Taser! Taser!', 'cop');
      const hit = Math.random() < 0.65, f = ctx.focusPos();
      ctx.tracer(p.pos.x, p.pos.y + 1.3, p.pos.z, f.x + (hit ? 0 : rand(-1.5, 1.5)), f.y + 1.1, f.z + (hit ? 0 : rand(-1.5, 1.5)));
      ctx.noise(0.6, 'highpass', 3200, 0.35); ctx.tone(1800, 0.5, 'square', 0.06, 900);
      if (hit) stunPlayer(2.4);
    }
    p.bustT = Math.max(0, p.bustT - dt * 0.5);
  } else {
    p.bustT += dt * (P.knock > 0 ? 2 : 1);
    if (p.bustT > 1.2) ctx.die('busted');
  }
  if (Math.random() < dt * 0.3) p.talk('cop', 'cop');
  return { speed, mode: null };
}
function stunPlayer(t) {
  const P = ctx.player; P.knock = Math.max(P.knock, t); police.stunT = now() + t;
  const vg = document.getElementById('vignette'); if (vg) { vg.style.boxShadow = 'inset 0 0 160px 40px rgba(60,120,255,.6)'; setTimeout(() => vg.style.boxShadow = '', 300); }
  ctx.notify('Tased!', 'blue', 1500);
}
function searching(p, dt) {
  const t = now();
  if (police.wanted === 0 || ctx.player.dead) { p.state = 'leave'; return { speed: 0 }; }
  if (isSolid()) { p.state = 'cop'; return { speed: 0 }; }
  const c = police.lkp || p.pos;
  if (p.homeCar && !p.homeCar.removed && hyp(p.homeCar.pos.x - c.x, p.homeCar.pos.z - c.z) > 160) { p.state = 'return'; return { speed: 0 }; }
  if (!p.searchPt || hyp(p.searchPt.x - p.pos.x, p.searchPt.z - p.pos.z) < 2 || t > p.searchUntil) {
    const a = rand(0, TAU), r = rand(5, 30); p.searchPt = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }; p.searchUntil = t + 12;
  }
  face(p, p.searchPt.x, p.searchPt.z, dt, 4);
  if (move(p, 2.4, dt)) p.searchPt = null;
  return { speed: 2.4, mode: null };
}
function backToCar(p, dt) {
  const car = p.homeCar, P = ctx.player;
  if (!car || car.removed || car.dead || car === P.inCar || car.mine) { p.state = 'walk'; p.agent = null; return null; }
  const d = hyp(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
  face(p, car.pos.x, car.pos.z, dt, 6);
  const speed = p.state === 'return' ? 5 : 1.6; move(p, speed, dt);
  if (d < 2.6) {
    car.crewOut = Math.max(0, (car.crewOut || 1) - 1);
    if (car.crewOut === 0) { car.recall = false; car.deployed = p.state === 'leave'; if (p.state === 'leave') { car.driver = 'cop'; release(car); } }
    p.remove(); return { speed: 0 };
  }
  if (p.state === 'return' && !P.inCar && police.wanted && isSolid()) p.state = 'cop';
  return { speed, mode: null };
}

// ------------------------------------------------------------------ traffic stops (0 stars)
let trafT = 0;
function watchTraffic(dt) {
  const P = ctx.player;
  if (police.wanted || police.stop || !P.inCar || P.dead) return;
  trafT -= dt; if (trafT > 0) return; trafT = 0.25;
  const car = P.inCar, sp = car.vel.length();
  let off = null; const red = ranRedLight(car, sp); // always runs: it tracks which intersection we're in
  const ne = ctx.nearestEdge(car.pos.x, car.pos.z, 18, e => e.t <= 5);
  if (ne) {
    const e = ctx.edges[ne.e], limit = e.mph ? e.mph * 0.447 : ctx.SPEED_T[e.t];
    if (sp > limit + 9) { const over = Math.round((sp - limit) * 2.237); off = { reason: `doing ${Math.round(sp * 2.237)} in a ${Math.round(limit * 2.237 / 5) * 5}`, fine: Math.min(500, 100 + over * 8) }; }
  }
  if (red) off = { reason: 'running a red light', fine: 150 };
  if (!off && now() - police.recklessT < 2.5) off = { reason: 'reckless driving', fine: 250 };
  const hot = car.hotT && now() > car.hotT;
  if (!off && !hot) return;
  for (const c of ctx.vehicles) {
    if (!c.isCop || c.dead || c.driver !== 'cop' || c.ai) continue;
    const d = hyp(c.pos.x - car.pos.x, c.pos.z - car.pos.z); if (d > (off ? 70 : 40)) continue;
    if (sight(c.pos.x, c.pos.y + 1.5, c.pos.z, c.rotY, 70, COS_CAR, 12) <= 0) continue;
    if (!off) { engage(c, 'chase'); setWanted(1, 'A deputy ran your plate: <b>stolen vehicle</b>.', { seen: true, what: 'theft' }); return; }
    startStop(c, off.reason, off.fine); return;
  }
}
// Entered a signalized intersection while the light facing you was red.
function ranRedLight(car, sp) {
  const { lightNodes, NX } = ctx; let inside = -1;
  for (const [n, L] of lightNodes) {
    const r = L.maxW / 2 + 1.5, dx = NX[n * 2] - car.pos.x, dz = NX[n * 2 + 1] - car.pos.z;
    if (dx * dx + dz * dz < r * r) { inside = n; break; }
  }
  const entered = inside >= 0 && inside !== police.redNode; police.redNode = inside;
  if (!entered || sp < 5) return false;
  const axis = Math.abs(car.vel.x) > Math.abs(car.vel.y) ? 0 : 1;
  return ctx.lightState(inside, axis) === 'r';
}
function startStop(cop, reason, fine) {
  const car = ctx.player.inCar;
  police.stop = { cop, car, reason, fine, t: 0, phase: 'lights', stillT: 0, deputy: null, wait: 0, said: false, hot: !!(car.hotT && now() > car.hotT) };
  cop.ai = copCarAI; cop.task = 'stop'; cop.mode = 'free'; cop.agent = null; cop.siren = true; cop.dispatched = false; cop.path = null;
  ctx.notify(`<b>Deputy lighting you up</b> for ${reason}. Stop the car and take the ticket, or run for it.`, 'blue', 7000);
  ctx.sfx.phone(0.5);
  emit('police:stop', { reason, fine });
}
function stopDrive(v, dt) {
  const s = police.stop;
  if (!s || s.cop !== v) { release(v); return; }
  if (s.phase !== 'lights') { steerTo(v, v.pos.x, v.pos.z, dt, { stop: true }); return; }
  const car = s.car, cs = car.vel.length(), d = hyp(car.pos.x - v.pos.x, car.pos.z - v.pos.z);
  const hx = cs > 2 ? car.vel.x / cs : car.fx, hz = cs > 2 ? car.vel.y / cs : car.fz;
  const tx = car.pos.x - hx * 11, tz = car.pos.z - hz * 11, dt2 = hyp(tx - v.pos.x, tz - v.pos.z);
  if (d > 70) driveTo(v, tx, tz, dt);
  else steerTo(v, tx, tz, dt, { maxSpeed: Math.max(4, cs + dt2 * 0.5), stop: cs < 0.8 && dt2 < 4 });
}
function updateStop(dt) {
  const s = police.stop; if (!s) return;
  const P = ctx.player, v = s.cop;
  if (!v || v.removed || v.dead || v.driver !== 'cop' || P.dead) { endStop(); return; }
  s.t += dt;
  const car = s.car, d = hyp(car.pos.x - v.pos.x, car.pos.z - v.pos.z);
  if (s.phase === 'lights') {
    s.stillT = P.inCar === car && car.vel.length() < 0.8 ? s.stillT + dt : 0;
    if (s.stillT > 1.5 && d < 30 && v.vel.length() < 1.5) { // pulled over: deputy walks up
      s.phase = 'ticket'; s.stopPos = { x: car.pos.x, z: car.pos.z };
      const sx = -(v.spec.W / 2 + 0.7), p = new ctx.Ped(v.pos.x + v.fz * sx, v.pos.z - v.fx * sx, { cop: true, car: v });
      p.state = 'ticket'; p.rotY = v.rotY; v.crewOut = 1; s.deputy = p;
    } else if (s.t > 20 || d > 110 || (P.inCar !== car && hyp(P.pos.x - car.pos.x, P.pos.z - car.pos.z) > 25)) evade(s);
  } else if (s.phase === 'ticket') {
    const fled = P.inCar ? (car.vel.length() > 4 && hyp(car.pos.x - s.stopPos.x, car.pos.z - s.stopPos.z) > 8) : hyp(P.pos.x - car.pos.x, P.pos.z - car.pos.z) > 15;
    if (fled) evade(s);
  }
}
function ticketing(p, dt) {
  const s = police.stop, P = ctx.player;
  if (!s || s.deputy !== p) { p.state = 'return'; return { speed: 0 }; }
  const car = s.car, o = car.spec.W / 2 + 0.9;
  const dx = car.pos.x + car.fz * o, dz = car.pos.z - car.fx * o, dd = hyp(dx - p.pos.x, dz - p.pos.z);
  if (dd > 1.4) { face(p, dx, dz, dt, 6); move(p, 1.9, dt); return { speed: 1.9, mode: null }; }
  face(p, car.pos.x, car.pos.z, dt, 6); s.wait += dt;
  if (s.wait > 0.4 && !s.said) {
    s.said = true;
    ctx.say(p, s.hot ? 'This car was reported stolen. Step out!' : pick(['License and registration, please.', 'Know how fast you were going?', 'You know why I stopped you?']), 'cop');
  }
  if (s.wait > 4.5) issueCitation(s);
  return { speed: 0, mode: s.hot ? 'aim' : null };
}
function issueCitation(s) {
  const { save } = ctx; police.stop = null;
  if (s.hot) { // felony stop
    s.deputy.state = 'cop'; s.cop.task = 'chase'; s.cop.dispatched = true;
    setWanted(2, 'The plate came back stolen. Felony stop!', { seen: true, what: 'theft' });
    return;
  }
  const paid = Math.min(save.money, s.fine); save.money -= paid; save.rep -= 1; save.stats.tickets = (save.stats.tickets || 0) + 1;
  ctx.notify(`<b>Citation</b> · ${s.reason}. $${s.fine}${paid < s.fine ? ` (you only had $${paid})` : ''}. "Slow it down out here."`, 'blue', 6500);
  s.deputy.state = 'leave'; s.cop.task = 'stop-done';
  emit('police:ticket', { reason: s.reason, fine: s.fine });
}
function evade(s) {
  police.stop = null;
  if (s.deputy && !s.deputy.removed && s.deputy.state !== 'dead') s.deputy.state = 'return';
  engage(s.cop, 'chase');
  setWanted(1, 'You ran from a traffic stop.', { seen: true, what: 'evade' });
}
function endStop() {
  const s = police.stop; police.stop = null; if (!s) return;
  if (s.deputy && !s.deputy.removed && s.deputy.state === 'ticket') s.deputy.state = police.wanted ? 'cop' : 'leave';
  const c = s.cop; if (!c || c.removed || c.task !== 'stop') return;
  if (police.wanted) engage(c, 'chase'); else if (c.crewOut > 0) c.task = 'stop-done'; else release(c);
}

// ------------------------------------------------------------------ roadblocks + spike strips
function trySpawnRoadblock() {
  const P = ctx.player, car = P.inCar; if (!car || police.roadblock) return false;
  const sp = car.vel.length(); if (sp < 12) return false;
  const { edges, nodeEdges, edgePos } = ctx;
  const ne = ctx.nearestEdge(car.pos.x, car.pos.z, 25, e => e.t <= 4); if (!ne) return false;
  let e = edges[ne.e], dir = (car.vel.x * ne.tx + car.vel.y * ne.tz) >= 0 ? 1 : -1, s = dir > 0 ? ne.d : e.len - ne.d;
  let need = clamp(sp * 9, 200, 320); const tmp = { x: 0, z: 0, tx: 0, tz: 0 };
  for (let guard = 0; guard < 40; guard++) { // walk ahead along the straightest continuation
    if (e.len - s >= need) { s += need; need = 0; break; }
    need -= e.len - s;
    const node = dir > 0 ? e.b : e.a;
    edgePos(e, dir > 0 ? e.len : 0, tmp); const ox = tmp.tx * dir, oz = tmp.tz * dir;
    let best = null, bd = 0.6;
    for (const ei of nodeEdges[node]) {
      if (ei === e.i) continue; const e2 = edges[ei]; if (e2.t > 4) continue;
      const d2 = e2.a === node ? 1 : -1; edgePos(e2, d2 > 0 ? 0 : e2.len, tmp);
      const dot = tmp.tx * d2 * ox + tmp.tz * d2 * oz; if (dot > bd) { bd = dot; best = [e2, d2]; }
    }
    if (!best) return false;
    [e, dir] = best; s = 0;
  }
  if (need > 0) return false;
  const q = edgePos(e, dir > 0 ? s : e.len - s, { x: 0, z: 0, tx: 0, tz: 0 }), tx = q.tx * dir, tz = q.tz * dir;
  if (hyp(q.x - car.pos.x, q.z - car.pos.z) < 150) return false;
  const lx = -tz, lz = tx, half = e.w / 2, cars = [];
  for (const k of [-1, 1]) {
    const v = new ctx.Vehicle('police', q.x + lx * k * half * 0.45, q.z + lz * k * half * 0.45, Math.atan2(tx, tz) + k * 1.25);
    v.driver = 'cop'; v.ai = copCarAI; v.task = 'roadblock'; v.roadblock = true; v.siren = true; ctx.settleCar(v); cars.push(v);
    const p = new ctx.Ped(q.x + tx * 4 + lx * k * 2.5, q.z + tz * 4 + lz * k * 2.5, { cop: true, car: v });
    p.state = 'cop'; p.rotY = Math.atan2(-tx, -tz); v.crewOut = 1;
  }
  let spike = null;
  if (police.wanted >= 4) {
    const sx = q.x - tx * 16, sz = q.z - tz * 16, THREE = ctx.THREE;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(e.w * 0.9, 0.07, 0.45), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6, metalness: 0.4 }));
    mesh.position.set(sx, ctx.heightAt(sx, sz) + 0.05, sz); mesh.rotation.y = Math.atan2(tx, tz); ctx.scene.add(mesh);
    spike = { x: sx, z: sz, tx, tz, half: e.w * 0.45, mesh };
  }
  police.roadblock = { cars, x: q.x, z: q.z, tx, tz, spike };
  radio(`Roadblock up on ${street(q.x, q.z)}${spike ? ', spike strip out' : ''}.`, true);
  return true;
}
function updateRoadblock() {
  const rb = police.roadblock; if (!rb) return;
  const f = ctx.focusPos(), d = hyp(f.x - rb.x, f.z - rb.z), past = (f.x - rb.x) * rb.tx + (f.z - rb.z) * rb.tz > 60;
  if (!police.wanted || d > 450 || (past && d > 220)) { clearRoadblock(!police.wanted && d < 200); return; }
  const s = rb.spike, car = ctx.player.inCar;
  if (s && car && !car.tiresBlown) {
    const rx = car.pos.x - s.x, rz = car.pos.z - s.z, along = rx * s.tx + rz * s.tz, lat = Math.abs(rx * -s.tz + rz * s.tx);
    if (Math.abs(along) < 1.6 && lat < s.half + 0.6) blowTires(car);
  }
}
function clearRoadblock(gentle) {
  const rb = police.roadblock; police.roadblock = null; if (!rb) return;
  const P = ctx.player;
  for (const v of rb.cars) {
    if (v.removed || v === P.inCar) continue;
    if (gentle) { for (const p of ctx.peds) if (p.homeCar === v && p.state !== 'dead') p.state = 'leave'; } // walk back, then drive off
    else { for (const p of ctx.peds.slice()) if (p.homeCar === v && p.state !== 'dead') p.remove(); v.remove(); }
  }
  if (rb.spike) { ctx.scene.remove(rb.spike.mesh); rb.spike.mesh.geometry.dispose(); }
}
function blowTires(v) {
  v.tiresBlown = true; v.gripMul = 0.4; v.spec.vmax *= 0.5; v.spec.acc *= 0.7; v.spec.turn *= 0.8;
  ctx.noise(0.15, 'highpass', 1800, 0.9); ctx.noise(0.15, 'highpass', 1800, 0.9, 0.09);
  ctx.sparks(v.pos.x, v.pos.y + 0.3, v.pos.z, 16);
  ctx.notify('Spike strip! Your tires are shredded.', 'red', 3000);
}

// ------------------------------------------------------------------ ASTREA helicopter
function buildHeli() {
  const THREE = ctx.THREE, g = new THREE.Group(), boxG = ctx.boxG, lam = ctx.lam;
  const body = new THREE.Mesh(boxG(1.8, 1.6, 4), lam('#1f4a2c')); body.castShadow = true; g.add(body);
  const glass = new THREE.Mesh(boxG(1.6, 1.0, 1.2), new THREE.MeshStandardMaterial({ color: 0x1b2633, roughness: 0.1, metalness: 0.3 })); glass.position.set(0, 0.15, 2.2); g.add(glass);
  const tail = new THREE.Mesh(boxG(0.35, 0.35, 4.2), lam('#e8e4d6')); tail.position.set(0, 0.3, -3.8); g.add(tail);
  const rotor = new THREE.Mesh(boxG(10, 0.06, 0.35), lam('#222')); rotor.position.y = 1.05; g.add(rotor);
  const rotor2 = new THREE.Mesh(boxG(0.35, 0.06, 10), lam('#222')); rotor.add(rotor2);
  ctx.scene.add(g);
  return { g, rotor, pos: new THREE.Vector3(), vel: new THREE.Vector3(), health: 260, shootCd: 2, rotY: 0, angle: Math.random() * TAU, look: null, sees: 0, seesT: -9, sweep: 0 };
}
function removeHeli() { const h = police.heli; if (!h) return; ctx.scene.remove(h.g); police.heli = null; ctx.heliLight.intensity = 0; }
function updateHeli(dt) {
  const f = ctx.focusPos(), t = now(); let h = police.heli;
  if (!h && police.wanted >= 3 && !ctx.player.dead) {
    const c = police.lkp || f; h = police.heli = buildHeli();
    h.pos.set(c.x + 260, ctx.heightAt(c.x, c.z) + 70, c.z + 260); h.look = { x: c.x, z: c.z };
    ctx.notify('Sheriff ASTREA helicopter inbound.', 'blue');
  }
  if (!h) return;
  if (police.wanted < 3 || ctx.player.dead) {
    h.pos.y += dt * 12; h.pos.x += dt * 30; h.sees = 0;
    if (h.pos.y > f.y + 160) { removeHeli(); return; }
  } else {
    if (isSolid()) { const k = 1 - Math.exp(-dt * 1.2); h.look.x += (f.x - h.look.x) * k; h.look.z += (f.z - h.look.z) * k; } // footprint trails the suspect
    else {
      const c = police.lkp || f, R = SEARCH_R[police.wanted] * 0.7; h.sweep += dt;
      const k = 1 - Math.exp(-dt * 0.5); h.look.x += (c.x + Math.cos(h.sweep * 0.35) * R - h.look.x) * k; h.look.z += (c.z + Math.sin(h.sweep * 0.23) * R - h.look.z) * k;
    }
    h.angle += dt * 0.3;
    const gx = h.look.x + Math.cos(h.angle) * 28, gz = h.look.z + Math.sin(h.angle) * 28, gy = ctx.heightAt(h.look.x, h.look.z) + 48;
    const dx = gx - h.pos.x, dz = gz - h.pos.z, dl = Math.hypot(dx, dz) || 1, want = Math.min(30, dl * 0.8); // 30 m/s top speed: a fast car can outrun it
    h.vel.x += (dx / dl * want - h.vel.x) * Math.min(1, dt * 1.5); h.vel.z += (dz / dl * want - h.vel.z) * Math.min(1, dt * 1.5);
    h.pos.x += h.vel.x * dt; h.pos.z += h.vel.z * dt; h.pos.y += (gy - h.pos.y) * Math.min(1, dt);
    h.rotY = Math.atan2(h.look.x - h.pos.x, h.look.z - h.pos.z);
    if (t >= (h.seeNext || 0)) { // camera/spotlight footprint around the look point; buildings block it
      h.seeNext = t + 0.3; const spotR = 40 - 12 * ctx.nightAmount, dd = hyp(f.x - h.look.x, f.z - h.look.z);
      h.sees = dd < spotR && ctx.los(h.pos.x, h.pos.y - 1.2, h.pos.z, f.x, f.y + 1.2, f.z) ? clamp(1 - dd / spotR, 0.3, 0.95) : 0; h.seesT = t;
    }
    if (police.wanted >= 5 && freshly(h, t)) { h.shootCd -= dt; if (h.shootCd <= 0) { h.shootCd = rand(2, 3.2); npcFire(h.pos.x, h.pos.y - 1, h.pos.z, 0.3, 10); } }
    if (h.health <= 0) {
      const { x, y, z } = h.pos; removeHeli(); ctx.sfx.boom(1);
      for (let i = 0; i < 60; i++) ctx.fire.emit(x, y, z, rand(-8, 8), rand(-4, 8), rand(-8, 8), rand(2, 4), rand(0.5, 1.2), 1, 0.5, 0.1, 2, 6);
      ctx.notify('You shot down the Sheriff helicopter.', 'red'); crime('copkill', f.x, f.z, 5); setWanted(5, null, { seen: true });
      return;
    }
  }
  h.g.position.copy(h.pos); h.g.rotation.y = h.rotY; h.rotor.rotation.y += dt * 25;
  const L = ctx.heliLight; L.position.copy(h.pos); L.target.position.set(h.look.x, ctx.heightAt(h.look.x, h.look.z), h.look.z); L.intensity = ctx.nightAmount > 0.3 ? 600 : 0;
  if (Math.random() < dt * 8) ctx.noise(0.08, 'lowpass', 120, ctx.volAt(h.pos.x, h.pos.z, 150) * 0.5);
}

// ------------------------------------------------------------------ witnesses while you hide
let tipScanT = 0;
function witnessTips(dt) {
  if (!police.wanted || lostFor() < 2.5 || now() < police.tipT) return;
  tipScanT -= dt; if (tipScanT > 0) return; tipScanT = 1;
  const P = ctx.player, f = ctx.focusPos();
  const conspicuous = P.inCar ? (P.inCar === police.suspect || P.inCar.isCop) : (P.weapon === 1 || P.speed > 5 || police.suspect === 'foot');
  if (!conspicuous) return;
  let checks = 0;
  for (const p of ctx.peds) {
    if (p.isCop || p.ai || p.reported || p.callT || (p.state !== 'walk' && p.state !== 'idle')) continue;
    if (hyp(p.pos.x - f.x, p.pos.z - f.z) > 25 || ++checks > 4) continue;
    if (Math.random() > 0.3 || !ctx.los(p.pos.x, p.pos.y + 1.6, p.pos.z, f.x, f.y + 1.2, f.z)) continue;
    p.callT = rand(1.5, 3); p.pendingSev = 1; p.pendingWhy = 'sighting'; police.tipT = now() + 15;
    return;
  }
}

// ------------------------------------------------------------------ main update
export function updatePolice(dt) {
  const P = ctx.player, f = ctx.focusPos();
  scanUnits();
  if (police.wanted > 0 && !P.dead) {
    if (police.visible > 0) {
      if (lostFor() < 2.5) markSeen();
      else { // they lost you: a sighting has to register before the chase is back on
        let mul = 1;
        if (P.inCar && P.inCar === police.suspect) mul *= 2;
        if ((P.inCar ? P.inCar.vel.length() : P.speed) > 6) mul *= 1.5;
        if (P.weapon === 1 && !P.inCar) mul *= 1.3;
        police.detect += dt * (0.5 + 2.5 * police.visible) * mul;
        if (police.detect >= 1 || police.visible >= 0.97) markSeen();
      }
    } else police.detect = Math.max(0, police.detect - dt * 0.35);
    if (lostFor() > 2.5) {
      const c = police.lkp, R = SEARCH_R[police.wanted];
      let rate = !c || hyp(f.x - c.x, f.z - c.z) > R ? 1 : 0.4;
      if (police.suspect && (P.inCar || 'foot') !== police.suspect) rate *= 1.6; // different car than the one they're looking for
      police.cool += dt * rate * (1 + 0.15 * skill('lowkey')); // Low Profile (src/progress.js)
      if (police.cool >= NEED[police.wanted]) loseWanted();
    }
    if (police.wanted > 0) dispatch(dt);
  }
  updateHeli(dt); updateRoadblock(); updateStop(dt); watchTraffic(dt); witnessTips(dt);
  // HUD: flashing stars + evade meter
  const blink = police.wanted > 0 && lostFor() > 2.5;
  const stars = document.getElementById('stars'); if (stars) stars.classList.toggle('blink', blink);
  const ev = document.getElementById('evade');
  if (ev) { ev.hidden = !blink; if (blink) ev.firstElementChild.style.width = clamp(police.cool / NEED[police.wanted], 0, 1) * 100 + '%'; }
  // taser stun pose
  if (police.stunT) {
    if (now() < police.stunT && !P.dead) { P.rig.body.rotation.x = -1.35; P.rig.body.position.y = 0.25; }
    else { police.stunT = 0; if (!P.dead) { P.rig.body.rotation.x = 0; P.rig.body.position.y = 0; } }
  }
  // driving on rims
  const car = P.inCar; if (car && car.tiresBlown && car.vel.length() > 6 && Math.random() < 0.4) ctx.sparks(car.pos.x - car.fx * 1.4, car.pos.y + 0.2, car.pos.z - car.fz * 1.4, 2);
  const siren = ctx.siren;
  if (siren) {
    let nd = 1e9; for (const v of ctx.vehicles) if (v.siren) nd = Math.min(nd, hyp(v.pos.x - f.x, v.pos.z - f.z));
    siren.g.gain.value = ctx.paused ? 0 : clamp(1 - nd / 180, 0, 1) * 0.07;
    siren.o.frequency.value = 760 + 380 * (Math.sin(now() * 5) > 0 ? 1 : 0) * 0.5 + 200 * Math.sin(now() * 2.5);
  }
}

export function clearCops(hard) {
  const f = ctx.focusPos(), P = ctx.player;
  if (police.roadblock) clearRoadblock(!hard);
  for (const v of ctx.vehicles.slice()) {
    if (!v.isCop || v === P.inCar || !(v.dispatched || v.ai)) continue;
    if (hard || hyp(v.pos.x - f.x, v.pos.z - f.z) > 80) v.remove(); else if (v.task !== 'stop' && !(v.crewOut > 0)) release(v);
  }
  for (const p of ctx.peds.slice()) if (p.isCop && p.state !== 'dead' && (p.homeCar || hard)) { if (hard) p.remove(); else if (p.state !== 'ticket') p.state = 'leave'; }
  if (hard) { removeHeli(); police.stop = null; }
}
export function resetPolice() {
  police.violent = false;
  Object.assign(police, { wanted: 0, heat: 0, lkp: null, cool: 0, detect: 0, suspect: null, stop: null, sed: false, stunT: 0, threatT: -99, rammedT: -99 });
  clearCops(true);
}

// Minimap overlay (called inside the minimap's world transform): search area, vision cones,
// helicopter footprint. Shown while the stars flash, like GTA V's radar.
export function drawPoliceMap(g, mpp) {
  const w = police.wanted; if (!w || lostFor() <= 2.5) return;
  const t = now(), c = police.lkp;
  if (c) {
    g.beginPath(); g.arc(c.x, c.z, SEARCH_R[w], 0, TAU); g.fillStyle = 'rgba(59,123,255,0.13)'; g.fill();
    g.lineWidth = 3 * mpp; g.strokeStyle = Math.floor(t * 3) % 2 ? 'rgba(212,48,47,.85)' : 'rgba(59,123,255,.85)';
    g.setLineDash([10 * mpp, 7 * mpp]); g.stroke(); g.setLineDash([]);
  }
  const m = visMul(); g.fillStyle = 'rgba(255,255,255,0.17)';
  const cone = (x, z, rotY, r, half) => { const a0 = Math.PI / 2 - rotY; g.beginPath(); g.moveTo(x, z); g.arc(x, z, r, a0 - half, a0 + half); g.closePath(); g.fill(); };
  for (const v of ctx.vehicles) if (v.isCop && v.driver === 'cop' && !v.dead) cone(v.pos.x, v.pos.z, v.rotY, Math.max(90 * m, 15), Math.acos(COS_CAR));
  for (const p of ctx.peds) if (p.isCop && (p.state === 'cop' || p.state === 'search')) cone(p.pos.x, p.pos.z, p.rotY, Math.max(60 * m, 11), Math.acos(COS_PED));
  const h = police.heli; if (h && h.look) { g.beginPath(); g.arc(h.look.x, h.look.z, 40 - 12 * ctx.nightAmount, 0, TAU); g.fillStyle = 'rgba(255,236,190,0.22)'; g.fill(); }
}

// ------------------------------------------------------------------ event wiring
export function initPolice() {
  on('car:enter', ({ vehicle, stolen }) => { // stolen cars get reported: sooner if someone saw it
    if (vehicle.ai) { if (police.stop && police.stop.cop === vehicle) police.stop = null; vehicle.ai = null; vehicle.task = null; vehicle.dispatched = false; vehicle.roadblock = false; vehicle.siren = false; }
    if (!stolen || vehicle.hotT) return;
    const seen = police.lastTheft && now() - police.lastTheft.t < 0.5 && police.lastTheft.sev > 0;
    vehicle.hotT = now() + (seen ? rand(15, 30) : rand(120, 240));
  });
  on('car:crash', ({ a, b, impact }) => {
    const pc = ctx.player.inCar; if (!pc || (a !== pc && b !== pc)) return;
    const o = a === pc ? b : a; if (!o) return;
    if (o.isCop && o.ai && police.wanted >= 3 && impact > 3) { // contact behind the suspect's centre spins them out (PIT)
      const rx = o.pos.x - pc.pos.x, rz = o.pos.z - pc.pos.z, along = rx * pc.fx + rz * pc.fz, side = rx * pc.fz - rz * pc.fx;
      if (along < 0.5) { pc.rotY += Math.sign(side || 1) * clamp(impact * 0.05, 0.12, 0.45); pc.vel.multiplyScalar(0.85); }
    } else if (!o.isCop && (o.driver === 'ai' || o.parked) && impact > 4) police.recklessT = now();
  });
}
