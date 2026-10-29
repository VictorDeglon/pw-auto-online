// The shared world online: the same people and cars for everyone standing near each other, and the same explosions,
// collapsed buildings and felled trees for the whole server.
//
// Crowds. Each game runs its own town. When players are near each other, the one with the lowest player id runs the
// crowd for that spot ("leader") and publishes it twice a second (crowd/<uid>); everyone else near them stops
// spawning their own people and traffic and shows the leader's as puppets: Peds and Vehicles that follow the
// snapshots. Hitting a puppet, damaging a puppet car or driving off in one sends an event to the leader, whose game
// applies it; the next snapshot shows the result to everyone. Walk 320 m away and your own town comes back.
//
// Cops. A wanted player's own game runs the police after them (src/police.js); its deputies and cruisers go out with
// that player's crowd (K and Q entries; a message with nothing else in it starts with O, and nobody follows it), and
// every other game shows them as puppets: everyone sees the same chase, sirens and all. Patrols on no call stay each
// game's own, like its traffic.
//
// Destruction. Explosions, collapses and felled trees are events (events/<push>) every game replays; collapsed
// buildings are also kept in ruins/<index> for 2 minutes (until they rebuild) so someone joining later sees the same rubble.
//   initWorld(hooks)  updateWorld(dt)  WORLD.following (uid | null)  puppetHurt(p, dmg, by)  puppetCarDamage(v, d, blast)
import { NET, on, sendEvent, sendCrowd, clearCrowd } from './net.js';

export const WORLD = { following: null, leading: false, peds: new Map(), cars: new Map(), crowds: new Map(), cops: new Map(), copsOut: false, stats: { pub: 0, recv: 0, bytes: 0 } };
const NEAR = 200, FAR = 320, PUB_R = 260, PUB_EVERY = 0.5, FRESH = 3500;
const ST = ['walk', 'idle', 'roam', 'group', 'flee', 'dead', 'fly', 'down', 'call', 'fight', 'tocar', 'ai'];
const POSE = ['', 'talk', 'talk2', 'listen', 'laugh', 'phone', 'fists', 'wave', 'look'];
let H = null, nid = 0, pubT = 0, leadT = 0;
const claimed = new Set(); // shared cars we got into: the leader's next snapshots may still list them
const q10 = v => Math.round(v * 10), q100 = v => Math.round(v * 100);
const hexOf = t => typeof t === 'number' ? t.toString(16).padStart(6, '0') : String(t || '').replace('#', '').slice(0, 6) || 'ffffff'; // tints are numbers; strings tolerated
const nidOf = o => o.nid || (o.nid = (NET.uid || 'x').slice(0, 3) + (++nid).toString(36));

export function initWorld(hooks) {
  H = hooks;
  on('crowd', c => { applyCops(c.id, c.e || ''); WORLD.stats.recv++; WORLD.stats.bytes += (c.e || '').length; if ((c.e || '').startsWith('O;')) return; // only their cops: nobody to follow
    WORLD.crowds.set(c.id, { t: c.t, e: c.e, at: performance.now() }); if (c.id === WORLD.following) applyCrowd(c.e); });
  on('crowd:remove', id => { WORLD.crowds.delete(id); dropCops(id); if (id === WORLD.following) stopFollowing(); });
  on('event', onEvent);
  on('ruin', r => H.ruin(r.i, r.old, r.age));
}
export function resetWorld() { stopFollowing(); WORLD.crowds.clear(); WORLD.leading = false; claimed.clear(); for (const id of [...new Set([...WORLD.cops.keys()].map(k => k.split('|')[0]))]) dropCops(id); WORLD.copsOut = false; }

// ---------------------------------------------------------------- who runs the crowd here
function leaderNear(me) {
  let best = null, bd = 1e9; const now = performance.now();
  for (const [id, pl] of NET.players) {
    if (!pl.p || !(id < NET.uid)) continue; const c = WORLD.crowds.get(id); if (!c || now - c.at > FRESH) continue;
    const d = Math.hypot(pl.p.x - me.x, pl.p.z - me.z); if (d < (WORLD.following === id ? FAR : NEAR) && d < bd) { bd = d; best = id; }
  }
  return best;
}
function anyoneNear(me) { for (const pl of NET.players.values()) if (pl.p && Math.hypot(pl.p.x - me.x, pl.p.z - me.z) < FAR) return true; return false; }

export function updateWorld(dt) {
  if (!H || !NET.server) return;
  const me = H.focus();
  leadT -= dt;
  if (leadT <= 0) {
    leadT = 0.5; const L = leaderNear(me);
    if (L !== WORLD.following) { if (WORLD.following) stopFollowing(); if (L) startFollowing(L); }
    const lead = !WORLD.following && anyoneNear(me);
    if (WORLD.leading && !lead) clearCrowd(); WORLD.leading = lead;
  }
  if ((pubT -= dt) <= 0) {
    pubT = PUB_EVERY; const cops = copTokens(me);
    if (WORLD.leading) publish(me, cops);
    else if (cops.length) { sendCrowd('O;' + cops.join(';')); WORLD.copsOut = true; } // our cops, for everyone
    else if (WORLD.copsOut) { clearCrowd(); WORLD.copsOut = false; }
  }
  if (WORLD.following) stepPuppets(dt);
  stepCars(WORLD.cops.values(), dt);
}

// ---------------------------------------------------------------- leader: publish
function publish(me, cops = []) {
  const out = [...cops], r2 = PUB_R * PUB_R;
  for (const p of H.peds()) {
    if (p.removed || p.remote || p.puppet || p.isCop || p.story || (p.ai && p.state !== 'dead')) continue;
    const dx = p.pos.x - me.x, dz = p.pos.z - me.z; if (dx * dx + dz * dz > r2) continue;
    const s = Math.max(0, ST.indexOf(p.state)), po = Math.max(0, POSE.indexOf(p.state === 'group' ? p.pose || '' : p.state === 'call' ? 'phone' : p.state === 'fight' ? 'fists' : ''));
    out.push(`P${nidOf(p)}:${H.avatarIndex(p.rig.avatar)}:${q10(p.pos.x)}:${q10(p.pos.z)}:${q100(p.rotY)}:${s}:${po}`);
  }
  for (const v of H.vehicles()) {
    if (v.removed || v.puppet || v.net || v.isCop || v.mine || v.ownedId || v === H.playerCar() || v.driver === 'player' || v.story) continue; // v.net: the room's traffic, everyone has it already
    const dx = v.pos.x - me.x, dz = v.pos.z - me.z; if (dx * dx + dz * dz > r2) continue;
    const fl = (v.dead ? 1 : 0) | (v.parked ? 2 : 0) | (v.driver ? 4 : 0) | (v.braking ? 8 : 0) | (v.ind ? 16 : 0);
    out.push(`C${nidOf(v)}:${H.carTypeIndex(v.type)}:${hexOf(v.tint)}:${H.modelIndex(v.type, v.m.model)}:${q10(v.pos.x)}:${q10(v.pos.z)}:${q100(v.rotY)}:${q10(v.mode === 'rail' ? v.speed : Math.hypot(v.vel.x, v.vel.y))}:${fl}`);
    if (out.length > 160) break;
  }
  const e = out.join(';'); WORLD.stats.pub++; WORLD.stats.bytes += e.length; sendCrowd(e);
}

// ---------------------------------------------------------------- follower: puppets
function startFollowing(id) {
  WORLD.following = id; H.clearAmbient(); // our own people and traffic go; theirs arrive with the next snapshot
  const c = WORLD.crowds.get(id); if (c) applyCrowd(c.e);
  H.notify('You\'re sharing this part of town with another player: same people, same traffic.', '', 3500);
}
function stopFollowing() {
  WORLD.following = null;
  for (const p of WORLD.peds.values()) if (!p.removed) p.remove();
  for (const v of WORLD.cars.values()) if (!v.removed && v !== H.playerCar()) v.remove();
  WORLD.peds.clear(); WORLD.cars.clear();
}
function applyCrowd(e) {
  if (!e) return; const seenP = new Set(), seenC = new Set(), now = performance.now();
  for (const tok of e.split(';')) {
    const f = tok.slice(1).split(':'); if (f.length < 7) continue;
    if (tok[0] === 'P') {
      const [id, av, x, z, r, s, po] = [f[0], f[1], +f[2] / 10, +f[3] / 10, +f[4] / 100, ST[+f[5]] || 'walk', POSE[+f[6]] || '']; // av: the avatar's name, as text
      seenP.add(id); let p = WORLD.peds.get(id);
      if (p && !p.removed && av && p.puppet.av !== av) { p.remove(); p = null; } // the leader's person got their real body: rebuild ours to match
      if (!p || p.removed) { p = H.makePuppetPed(x, z, H.avatarName(av)); p.puppet = { id, av }; p.rotY = r; WORLD.peds.set(id, p); }
      const P = p.puppet; if (P.tx !== undefined) { const dtS = Math.max(0.2, (now - P.at) / 1000); P.vx = (x - P.tx) / dtS; P.vz = (z - P.tz) / dtS; }
      P.tx = x; P.tz = z; P.tr = r; P.st = s; P.pose = po; P.at = now;
    } else if (tok[0] === 'C' && f.length >= 9) {
      const [id, ti, tint, mi, x, z, r, sp, fl] = [f[0], +f[1], parseInt(f[2], 16) || 0xffffff, +f[3], +f[4] / 10, +f[5] / 10, +f[6] / 100, +f[7] / 10, +f[8]];
      if (claimed.has(id)) continue;
      seenC.add(id); let v = WORLD.cars.get(id);
      if (v && v.removed) { WORLD.cars.delete(id); v = null; }
      if (!v) { const type = H.carTypeName(ti); if (!type) continue; v = H.makePuppetCar(type, x, z, r, tint, H.modelName(type, mi)); v.puppet = { id }; WORLD.cars.set(id, v); }
      if (!v.puppet) continue; // we took it: it's ours now
      const P = v.puppet; P.tx = x; P.tz = z; P.tr = r; P.sp = sp; P.fl = fl; P.at = now;
      if (fl & 1 && !v.dead) H.wreck(v);
    }
  }
  for (const [id, p] of WORLD.peds) if (!seenP.has(id)) { if (!p.removed) p.remove(); WORLD.peds.delete(id); }
  for (const [id, v] of WORLD.cars) if (!seenC.has(id)) { if (v.puppet && !v.removed && v !== H.playerCar()) v.remove(); WORLD.cars.delete(id); }
}
// the Ped AI hook for puppets: glide to where the leader says, a little ahead along their motion
export function puppetAI(p, dt) {
  const P = p.puppet; if (!P || P.tx === undefined) return { speed: 0 };
  const ahead = Math.min(0.5, (performance.now() - P.at) / 1000), tx = P.tx + (P.vx || 0) * ahead, tz = P.tz + (P.vz || 0) * ahead;
  const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
  if (d > 25) { p.pos.x = P.tx; p.pos.z = P.tz; } else { const k = 1 - Math.exp(-dt * 6); p.pos.x += dx * k; p.pos.z += dz * k; }
  let dr = P.tr - p.rotY; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); p.rotY += dr * Math.min(1, dt * 6);
  if (P.st === 'dead' && p.state !== 'dead') { p.state = 'dead'; p.health = 0; }
  const speed = Math.min(7, Math.hypot(P.vx || 0, P.vz || 0));
  return { speed: speed > 0.25 ? speed : 0, mode: P.pose || null };
}
function stepPuppets(dt) { stepCars(WORLD.cars.values(), dt); }
function stepCars(list, dt) {
  for (const v of list) {
    if (v.rig) continue; // the cops' map holds deputies too: they walk in their own AI (puppetAI)
    const P = v.puppet; if (!P || v.removed || P.tx === undefined) continue;
    const ahead = Math.min(0.5, (performance.now() - P.at) / 1000), fx = Math.sin(P.tr), fz = Math.cos(P.tr);
    const tx = P.tx + fx * P.sp * ahead, tz = P.tz + fz * P.sp * ahead, dx = tx - v.pos.x, dz = tz - v.pos.z;
    if (dx * dx + dz * dz > 900) { v.pos.x = P.tx; v.pos.z = P.tz; } else { const k = 1 - Math.exp(-dt * 7); v.pos.x += dx * k; v.pos.z += dz * k; }
    let dr = P.tr - v.rotY; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); v.rotY += dr * Math.min(1, dt * 7);
    v.speed = P.sp; v.vel.set(fx * P.sp, fz * P.sp); v.braking = !!(P.fl & 8); v.parked = !!(P.fl & 2); v.ind = P.fl & 16 ? 1 : 0;
    H.settle(v, dt);
  }
}
// ---------------------------------------------------------------- cops: ours out, everyone else's in
function copTokens(me) {
  const out = [], r2 = PUB_R * PUB_R * 4;
  for (const p of H.peds()) {
    if (!p.isCop || p.removed || p.remote || p.puppet) continue; const dx = p.pos.x - me.x, dz = p.pos.z - me.z; if (dx * dx + dz * dz > r2) continue;
    out.push(`K${nidOf(p)}:${H.avatarIndex(p.rig.avatar)}:${q10(p.pos.x)}:${q10(p.pos.z)}:${q100(p.rotY)}:${Math.max(0, ST.indexOf(p.state))}`);
  }
  for (const v of H.vehicles()) {
    if (!v.isCop || v.removed || v.puppet || v.net || !(v.siren || v.dispatched || v.ai || v.dead)) continue; const dx = v.pos.x - me.x, dz = v.pos.z - me.z; if (dx * dx + dz * dz > r2) continue;
    out.push(`Q${nidOf(v)}:${H.carTypeIndex(v.type)}:${H.modelIndex(v.type, v.m.model)}:${q10(v.pos.x)}:${q10(v.pos.z)}:${q100(v.rotY)}:${q10(v.mode === 'rail' ? v.speed : Math.hypot(v.vel.x, v.vel.y))}:${(v.siren ? 1 : 0) | (v.dead ? 2 : 0)}`);
    if (out.length > 60) break;
  }
  return out;
}
function applyCops(owner, e) {
  const seen = new Set(), now = performance.now(), me = H.focus();
  for (const tok of e.split(';')) {
    const k = tok[0]; if (k !== 'K' && k !== 'Q') continue; const f = tok.slice(1).split(':'), key = owner + '|' + f[0];
    if (k === 'K' && f.length >= 6) {
      const x = +f[2] / 10, z = +f[3] / 10; if (Math.hypot(x - me.x, z - me.z) > 700) continue; seen.add(key);
      let p = WORLD.cops.get(key); if (p && p.removed) { WORLD.cops.delete(key); p = null; }
      if (!p) { p = H.makePuppetPed(x, z, H.avatarName(f[1]), true); p.puppet = { id: key }; p.rotY = +f[4] / 100; WORLD.cops.set(key, p); }
      const P = p.puppet; if (P.tx !== undefined) { const dtS = Math.max(0.2, (now - P.at) / 1000); P.vx = (x - P.tx) / dtS; P.vz = (z - P.tz) / dtS; }
      P.tx = x; P.tz = z; P.tr = +f[4] / 100; P.st = ST[+f[5]] || 'walk'; P.at = now;
    } else if (k === 'Q' && f.length >= 8) {
      const x = +f[3] / 10, z = +f[4] / 10; if (Math.hypot(x - me.x, z - me.z) > 900) continue; seen.add(key);
      if (claimed.has(key)) continue; let v = WORLD.cops.get(key); if (v && v.removed) { WORLD.cops.delete(key); v = null; }
      if (!v) { const type = H.carTypeName(+f[1]) || 'police'; v = H.makePuppetCar(type, x, z, +f[5] / 100, 0xffffff, H.modelName(type, +f[2])); v.puppet = { id: key }; WORLD.cops.set(key, v); }
      const P = v.puppet; if (!P) continue; P.tx = x; P.tz = z; P.tr = +f[5] / 100; P.sp = +f[6] / 10; P.fl = 0; P.at = now;
      v.siren = !!(+f[7] & 1); if (+f[7] & 2 && !v.dead) H.wreck(v);
    }
  }
  for (const [key, o] of WORLD.cops) if (key.startsWith(owner + '|') && !seen.has(key)) { if (!o.removed) o.remove(); WORLD.cops.delete(key); }
}
function dropCops(owner) { for (const [key, o] of WORLD.cops) if (key.startsWith(owner + '|')) { if (!o.removed) o.remove(); WORLD.cops.delete(key); } }
// damage dealt to puppets goes to the game that runs them: the leader, or for a cop the player they're after
const ownerOf = P => { const i = P.id.indexOf('|'); return i > 0 ? [P.id.slice(0, i), P.id.slice(i + 1)] : WORLD.following ? [WORLD.following, P.id] : null; };
export function puppetHurt(p, dmg, by) { const o = p.puppet && ownerOf(p.puppet); if (o) sendEvent('ph', { id: o[1], d: Math.min(300, Math.max(1, dmg)), to: o[0] }); }
export function puppetCarDamage(v, d, blast) { const o = v.puppet && ownerOf(v.puppet); if (o) sendEvent('cd', { id: o[1], d: Math.min(300, Math.max(1, d)), to: o[0], b: blast }); }
// you got in: the car is yours now, the leader drops theirs
export function claimPuppetCar(v) { if (!v.puppet) return; const o = ownerOf(v.puppet) || [WORLD.following || '', v.puppet.id]; claimed.add(v.puppet.id); v.puppet = null; v.mode = 'free'; v.keep = false; for (const [k, c] of WORLD.cars) if (c === v) WORLD.cars.delete(k); for (const [k, c] of WORLD.cops) if (c === v) WORLD.cops.delete(k); sendEvent('claim', { id: o[1], to: o[0] }); }

// ---------------------------------------------------------------- events from everyone
function findByNid(list, id) { for (const o of list) if (o.nid === id && !o.removed) return o; return null; }
function onEvent(ev) {
  switch (ev.k) {
    case 'boom': if (typeof ev.x === 'number') H.boom(ev.x, ev.y || 0, ev.z, ev.R || 7); break;
    case 'nuke': if (typeof ev.x === 'number' && H.nuke) H.nuke(ev.x, ev.z); break;
    case 'col': if (typeof ev.i === 'number') H.collapse(ev.i, ev.dx || 0, ev.dz || 0); break;
    case 'fell': if (typeof ev.x === 'number') H.fell(ev.x, ev.z, ev.dx || 0, ev.dz || 1); break;
    case 'place_build': if (H.placeBuild) H.placeBuild(ev); break;
    case 'destroy_build': if (H.destroyBuild) H.destroyBuild(ev); break;
    case 'dmg_build': if (H.damageBuild) H.damageBuild(ev); break;
    case 'ph': if (ev.to === NET.uid) { const p = findByNid(H.peds(), ev.id); if (p) H.hurtPed(p, ev.d || 10); } break;
    case 'cd': if (ev.to === NET.uid) { const v = findByNid(H.vehicles(), ev.id); if (v) H.damageCar(v, ev.d || 10, !!ev.b); } break;
    case 'claim': { const v = findByNid(H.vehicles(), ev.id); if (v && v !== H.playerCar() && !v.puppet) v.remove(); break; }
  }
}
