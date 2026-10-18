// The shared world online: the same people and cars for everyone standing near each other, and the same explosions,
// collapsed buildings and felled trees for the whole server.
//
// Crowds. Each game runs its own town. When players are near each other, the one with the lowest player id runs the
// crowd for that spot ("leader") and publishes it twice a second (crowd/<uid>); everyone else near them stops
// spawning their own people and traffic and shows the leader's as puppets: Peds and Vehicles that follow the
// snapshots. Hitting a puppet, damaging a puppet car or driving off in one sends an event to the leader, whose game
// applies it; the next snapshot shows the result to everyone. Walk 320 m away and your own town comes back.
//
// Destruction. Explosions, collapses and felled trees are events (events/<push>) every game replays; collapsed
// buildings are also kept in ruins/<index> for 2 minutes (until they rebuild) so someone joining later sees the same rubble.
//   initWorld(hooks)  updateWorld(dt)  WORLD.following (uid | null)  puppetHurt(p, dmg, by)  puppetCarDamage(v, d, blast)
import { NET, on, sendEvent, sendCrowd, clearCrowd } from './net.js';

export const WORLD = { following: null, leading: false, peds: new Map(), cars: new Map(), crowds: new Map(), stats: { pub: 0, recv: 0, bytes: 0 } };
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
  on('crowd', c => { WORLD.crowds.set(c.id, { t: c.t, e: c.e, at: performance.now() }); WORLD.stats.recv++; WORLD.stats.bytes += (c.e || '').length; if (c.id === WORLD.following) applyCrowd(c.e); });
  on('crowd:remove', id => { WORLD.crowds.delete(id); if (id === WORLD.following) stopFollowing(); });
  on('event', onEvent);
  on('ruin', r => H.ruin(r.i, r.old, r.age));
}
export function resetWorld() { stopFollowing(); WORLD.crowds.clear(); WORLD.leading = false; claimed.clear(); }

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
  if (WORLD.leading && (pubT -= dt) <= 0) { pubT = PUB_EVERY; publish(me); }
  if (WORLD.following) stepPuppets(dt);
}

// ---------------------------------------------------------------- leader: publish
function publish(me) {
  const out = [], r2 = PUB_R * PUB_R;
  for (const p of H.peds()) {
    if (p.removed || p.remote || p.puppet || p.isCop || p.story || (p.ai && p.state !== 'dead')) continue;
    const dx = p.pos.x - me.x, dz = p.pos.z - me.z; if (dx * dx + dz * dz > r2) continue;
    const s = Math.max(0, ST.indexOf(p.state)), po = Math.max(0, POSE.indexOf(p.state === 'group' ? p.pose || '' : p.state === 'call' ? 'phone' : p.state === 'fight' ? 'fists' : ''));
    out.push(`P${nidOf(p)}:${H.avatarIndex(p.rig.avatar)}:${q10(p.pos.x)}:${q10(p.pos.z)}:${q100(p.rotY)}:${s}:${po}`);
  }
  for (const v of H.vehicles()) {
    if (v.removed || v.puppet || v.isCop || v.mine || v.ownedId || v === H.playerCar() || v.driver === 'player' || v.story) continue;
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
function stepPuppets(dt) {
  for (const v of WORLD.cars.values()) {
    const P = v.puppet; if (!P || v.removed || P.tx === undefined) continue;
    const ahead = Math.min(0.5, (performance.now() - P.at) / 1000), fx = Math.sin(P.tr), fz = Math.cos(P.tr);
    const tx = P.tx + fx * P.sp * ahead, tz = P.tz + fz * P.sp * ahead, dx = tx - v.pos.x, dz = tz - v.pos.z;
    if (dx * dx + dz * dz > 900) { v.pos.x = P.tx; v.pos.z = P.tz; } else { const k = 1 - Math.exp(-dt * 7); v.pos.x += dx * k; v.pos.z += dz * k; }
    let dr = P.tr - v.rotY; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); v.rotY += dr * Math.min(1, dt * 7);
    v.speed = P.sp; v.vel.set(fx * P.sp, fz * P.sp); v.braking = !!(P.fl & 8); v.parked = !!(P.fl & 2); v.ind = P.fl & 16 ? 1 : 0;
    H.settle(v, dt);
  }
}
// damage dealt to puppets goes to the leader
export function puppetHurt(p, dmg, by) { if (WORLD.following && p.puppet) sendEvent('ph', { id: p.puppet.id, d: Math.min(300, Math.max(1, dmg)), to: WORLD.following }); }
export function puppetCarDamage(v, d, blast) { if (WORLD.following && v.puppet) sendEvent('cd', { id: v.puppet.id, d: Math.min(300, Math.max(1, d)), to: WORLD.following, b: blast }); }
// you got in: the car is yours now, the leader drops theirs
export function claimPuppetCar(v) { if (!v.puppet) return; const id = v.puppet.id; claimed.add(id); v.puppet = null; v.mode = 'free'; v.keep = false; for (const [k, c] of WORLD.cars) if (c === v) WORLD.cars.delete(k); sendEvent('claim', { id, to: WORLD.following || '' }); }

// ---------------------------------------------------------------- events from everyone
function findByNid(list, id) { for (const o of list) if (o.nid === id && !o.removed) return o; return null; }
function onEvent(ev) {
  switch (ev.k) {
    case 'boom': if (typeof ev.x === 'number') H.boom(ev.x, ev.y || 0, ev.z, ev.R || 7); break;
    case 'nuke': if (typeof ev.x === 'number' && H.nuke) H.nuke(ev.x, ev.z); break;
    case 'col': if (typeof ev.i === 'number') H.collapse(ev.i, ev.dx || 0, ev.dz || 0); break;
    case 'fell': if (typeof ev.x === 'number') H.fell(ev.x, ev.z, ev.dx || 0, ev.dz || 1); break;
    case 'ph': if (ev.to === NET.uid) { const p = findByNid(H.peds(), ev.id); if (p) H.hurtPed(p, ev.d || 10); } break;
    case 'cd': if (ev.to === NET.uid) { const v = findByNid(H.vehicles(), ev.id); if (v) H.damageCar(v, ev.d || 10, !!ev.b); } break;
    case 'claim': { const v = findByNid(H.vehicles(), ev.id); if (v && v !== H.playerCar() && !v.puppet) v.remove(); break; }
  }
}
