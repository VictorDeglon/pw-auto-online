// Crew garages: the community games online. Drive into a crew garage in Poway (src/games/entrances.js), the screen
// goes dark as you roll down the ramp, and you come up a tunnel into a world of its own: the Long Jump (flight.js),
// Hide & Seek downtown (hide.js) or one of three race courses (race.js). The exit tunnel in each world takes you back
// up to the garage door. The worlds sit 80-120 km east of town (src/games/defs.js), so nothing of the city is in view
// (and the city's traffic and people thin out on their own with nobody near them); the game server
// (server/nakama/index.js) knows who is in which world and judges the games.
//
// index.html calls: GAMES.init() once the world is built; GAMES.update(rdt) last thing every frame in play; and a few
// one-line hooks: arenaGround / arenaOnRoad (ground and asphalt out there), GAMES.noShoot(), GAMES.respawn(),
// GAMES.inside (no cheats, no glide), GAMES.drawMinimap(), GAMES.mapMarks().
import { ctx } from '../ctx.js';
import { NET, on as onNet, GAMENET, serverNow } from '../online/net.js';
import { REMOTES } from '../online/remote.js';
import { police, resetPolice } from '../police.js';
import * as SHELL from '../ui/shell.js';
import * as MAPKIT from '../ui/mapkit.js';
import { DEFS } from './defs.js';
import { buildGarages, updateGarages, garageTrigger, garageMarks, shutDoorNear, GAME_COLORS } from './entrances.js';
import { arrival, inExit } from './base.js';
import { HUD } from './hud.js';
import { CHEER } from './crowd.js';
import { createFlight } from './flight.js';
import { createHide } from './hide.js';
import { createRace } from './race.js';

export const ARENA_X0 = DEFS.X0;
export function arenaGround(x, z) { const id = DEFS.arenaAt(x); if (!id) return 0; const A = DEFS.ARENAS[id]; return DEFS.groundLocal(id, x - A.o[0], z - A.o[1]); }
export function arenaOnRoad(x, z) { const id = DEFS.arenaAt(x), W = id && worlds[id]; return !!(W && W.onRoad(x - W.A.o[0], z - W.A.o[1])); }

const worlds = {}; // built on first visit, kept
const MAKERS = { flight: createFlight, hide: createHide, race0: createRace, race1: createRace, race2: createRace };
const ST = { cool: 0, phase: 'out', g: '', pending: '', t: 0, door: null, origCar: null, crew: null, sky: null, leaveAsk: 0, joinT: 0, failMsg: '' };
const TINTS = [0xff7a2f, 0x2f5f9e, 0x9e1b1b, 0xd4a017, 0x1b1c1e, 0xf2f2f0, 0x2c4a36, 0x6a4c93];

export const GAMES = {
  get inside() { return ST.phase === 'in' ? ST.g : ''; },
  get busy() { return ST.phase !== 'out' && ST.phase !== 'in'; },
  world() { return ST.phase === 'in' ? worlds[ST.g] : null; },
  init, update, respawn, noShoot, drawMinimap, mapMarks,
};
if (typeof window !== 'undefined') window.__games = { GAMES, ST, worlds, DEFS, ctx, enter: g => enter(g), leave: () => leave(), placeCar: (g, at, sp, fresh, look) => placeCar(g, at, sp, fresh, look) }; // tests

// ---------------------------------------------------------------- the services a world gets
function api(id) {
  const A = DEFS.ARENAS[id], o = A.o;
  return {
    A, id,
    myId: () => NET.uid, myName: () => NET.name || '',
    notify: (h, cls, ms) => ctx.notify(h, cls || '', ms || 3500),
    act: (a, x) => GAMENET && GAMENET.act(a, x),
    now: () => serverNow(),
    // volume 0..1 from how far you are from a spot in this world
    near: (lx, lz, range = 400) => { const f = ctx.focusPos(); return Math.max(0, 1 - Math.hypot(f.x - o[0] - lx, f.z - o[1] - lz) / range); },
    // every car in this world right now: yours and the other players' ({ id, x, y, z, rot, air, speed, W, L, mine, rem })
    cars() {
      const out = [], v = ctx.player.inCar;
      if (v) out.push({ id: 'me', x: v.pos.x, y: v.pos.y, z: v.pos.z, rot: v.rotY, air: v.air, speed: Math.hypot(v.vel.x, v.vel.y), W: v.spec.W, L: v.spec.L, mine: true, v });
      for (const r of REMOTES.values()) {
        if (!r.car || !r.st || !r.st.car) continue; const g = r.car.g;
        out.push({ id: r.id, x: g.position.x, y: g.position.y, z: g.position.z, rot: g.rotation.y, air: g.position.y - arenaGround(g.position.x, g.position.z) > 0.6, speed: r.st.spd || 0, W: r.car.W || 1.9, L: r.car.L || 4.5, rem: r });
      }
      return out;
    },
    // put you (in a car) at a local spot: fresh = a new car; type/tint/model: which one (default: the crew's sports car)
    placeCar: (at, speed = 0, fresh = false, look = null) => placeCar(id, at, speed, fresh, look),
    onFoot: at => { // out of any car, standing at a local spot
      const p = ctx.player; if (p.inCar) dropCar();
      p.pos.set(o[0] + at[0], arenaGround(o[0] + at[0], o[1] + at[1]), o[1] + at[1]); p.rotY = at[2] || 0; ctx.cam.yaw = p.rotY + Math.PI; p.air = 0; p.vy = 0; p.fling = null;
    },
    hold: secs => { ST.holdT = secs; }, // keep the car still (a countdown, the seeker's eyes shut)
    leave: () => leave(),
  };
}
function crewTint() { let h = 0; for (const c of String(NET.uid || 'x')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TINTS[h % TINTS.length]; }
function dropCar() { // get out of whatever you're in, the crew car goes away
  const p = ctx.player, v = p.inCar; if (!v) return;
  v.driver = null; p.inCar = null; p.rig.g.visible = true; ctx.cam.dist = 6.5;
  if (v === ST.crew) { v.remove(); ST.crew = null; }
}
function placeCar(id, at, speed, fresh, look) {
  const A = DEFS.ARENAS[id], p = ctx.player, x = A.o[0] + at[0], z = A.o[1] + at[1], rot = at[2] || 0;
  let v = p.inCar;
  if (fresh || !v || v.dead || look) {
    if (v) dropCar(); else if (ST.crew) { ST.crew.remove(); ST.crew = null; }
    const L = look || {}; v = new ctx.Vehicle(L.type || 'sports', x, z, rot, L.tint ?? crewTint(), L.model);
    v.mine = true; v.keep = true; v.crew = true; ST.crew = v;
    p.inCar = v; v.driver = 'player'; v.mode = 'free'; v.parked = false; p.rig.g.visible = false; ctx.cam.dist = 9;
    ctx.bus && ctx.bus.emit('car:enter', { vehicle: v, stolen: false });
  }
  v.pos.set(x, arenaGround(x, z), z); v.rotY = rot; v.vel.set(Math.sin(rot) * speed, Math.cos(rot) * speed); v.speed = speed; v.steer = 0; v.spinV = 0;
  v.air = false; v.vy = 0; v.flipped = false; v.pitchV = v.rollV = 0; v.roadPull = null; ctx.settleCar(v);
  v.m.g.position.copy(v.pos); p.pos.copy(v.pos); p.rotY = rot; ctx.cam.yaw = rot + Math.PI;
  p.ride = null;
}

// ---------------------------------------------------------------- the city, out of sight
// The worlds are 80+ km from town, so three culls the town's meshes for us, except the ones that are never frustum-culled:
// the tree impostors (about 660k triangles a frame) and pedestrians or cars still standing out there. They're hidden while
// you're in a world and shown again when you come back. (Particle systems and anything at the origin are left alone: the
// explosions in Hide & Seek draw through them.)
const cloaked = []; let cloakT = 0;
function cloak() {
  const cam = ctx.camera.position, keep = ST.g && worlds[ST.g] && worlds[ST.g].group;
  for (const o of ctx.scene.children) {
    if (o === keep || !o.visible) continue;
    const far = o.isMesh && /^impostors:/.test(o.name) || o.isGroup && (o.position.x || o.position.z) && Math.hypot(o.position.x - cam.x, o.position.z - cam.z) > 3000;
    if (far) { o.visible = false; cloaked.push(o); }
  }
}
function uncloak() { for (const o of cloaked) o.visible = true; cloaked.length = 0; }

// ---------------------------------------------------------------- in and out
async function enter(g) {
  if (ST.phase !== 'out' || !GAMENET || !GAMENET.ready()) return;
  ST.phase = 'joining'; ST.pending = g; ST.joinT = performance.now(); ST.failMsg = '';
  GAMENET.join(g);
  await HUD.fade(true, `Down to ${DEFS.ARENAS[g].name}…`);
  ST.faded = true; if (ST.inMsg) arrive(ST.inMsg);
}
function arrive(d) {
  if (ST.phase !== 'joining' || d.g !== ST.pending) return;
  if (!ST.faded) { ST.inMsg = d; return; } // still going dark
  ST.inMsg = null; ST.faded = false;
  const g = d.g, A = DEFS.ARENAS[g], p = ctx.player;
  let W = worlds[g];
  if (!W) { try { W = worlds[g] = MAKERS[g](api(g)); } catch (e) { console.error('[games] building', g, e); GAMENET.leave(); ST.phase = 'out'; HUD.fade(false); ctx.notify('That world failed to load.', 'red', 4000); return; } }
  W.group.visible = true;
  // your own car waits out of the way until you come back; you drive the crew's
  if (p.inCar && p.inCar !== ST.crew) { const v = p.inCar; ST.origCar = v; v.driver = null; v.keep = true; v.parked = true; v.vel.set(0, 0); v.pos.set(DEFS.X0 + 2000, 0, 0); v.m.g.position.copy(v.pos); p.inCar = null; }
  if (ctx.player.ride) ctx.player.ride = null;
  ST.phase = 'in'; ST.g = g; cloak();
  placeCar(g, W.spawn ? W.spawn() : arrival(A), 10, true);
  const S = ctx.SKY; if (S && !ST.sky) { ST.sky = { lock: S.lock, hour: S.hour, weather: S.weather }; S.lock = true; S.hour = A.sky[0]; S.weather = A.sky[1]; }
  resetPolice();
  if (ctx.NATURE && ctx.NATURE.gc) ctx.NATURE.gc.setVisible(false);
  HUD.on(true); W.enter && W.enter(d);
  if (d.st) W.onState && W.onState(d.st);
  if (d.board) W.onBoard && W.onBoard(d.board);
  HUD.fade(false);
  ctx.notify(`<b>${A.name}</b>. The exit tunnel takes you back to Poway (or press <kbd>K</kbd> twice).`, 'green', 5000);
}
async function leave(force) {
  if (ST.phase !== 'in' && !force) return;
  ST.phase = 'leaving'; ST.leaveT = performance.now();
  if (GAMENET && GAMENET.ready()) GAMENET.leave();
  await HUD.fade(true, 'Back up to Poway…');
  ST.faded = true; if (ST.outMsg || force || !(GAMENET && GAMENET.ready())) backHome(ST.outMsg || {});
}
function backHome(d) {
  if (ST.phase !== 'leaving' && ST.phase !== 'in') return;
  ST.outMsg = null; ST.faded = false;
  const g = ST.g, W = worlds[g], p = ctx.player;
  uncloak(); if (W) { W.leave && W.leave(); W.group.visible = false; }
  const gi = DEFS.garageOf(g), door = d.door || (gi && DEFS.bayDoor(gi.G, gi.bay));
  dropCar(); p.dead = false;
  let v = ST.origCar; ST.origCar = null;
  if (!v || v.removed || v.dead) v = new ctx.Vehicle('sedan', door.x, door.z, 0);
  v.keep = false; v.parked = false; v.mine = true;
  const out = door.rot + Math.PI, dx = Math.sin(door.rot), dz = Math.cos(door.rot), x = door.x + dx * 6, z = door.z + dz * 6;
  v.pos.set(x, ctx.heightAt(x, z), z); v.rotY = out; v.vel.set(Math.sin(out) * 7, Math.cos(out) * 7); v.speed = 7; v.air = false; v.vy = 0; v.flipped = false; ctx.settleCar(v); v.m.g.position.copy(v.pos);
  p.inCar = v; v.driver = 'player'; v.mode = 'free'; p.rig.g.visible = false; ctx.cam.dist = 9; ctx.cam.yaw = out + Math.PI; p.pos.copy(v.pos);
  const S = ctx.SKY; if (S && ST.sky) { Object.assign(S, ST.sky); ST.sky = null; }
  if (ctx.NATURE && ctx.NATURE.gc) ctx.NATURE.gc.setVisible(true);
  if (ST.armed) { ST.armed(); ST.armed = null; }
  HUD.on(false); CHEER.stop(); ST.phase = 'out'; ST.g = ''; ST.leaveAsk = 0; ST.cool = 4;
  HUD.fade(false);
}

// ---------------------------------------------------------------- dying in there: back at the start, no hospital bill
function respawn() {
  if (ST.phase !== 'in') return false;
  const p = ctx.player, W = worlds[ST.g];
  p.dead = false; p.health = 100; p.knock = 0; p.rig.g.visible = true; p.rig.body.rotation.set(0, 0, 0); p.rig.body.position.y = 0; p.air = 0;
  if (W && W.respawn) W.respawn(); else placeCar(ST.g, W ? W.start : arrival(DEFS.ARENAS[ST.g]), 0, true);
  ctx.bus && ctx.bus.emit('player:respawn', { kind: 'arena', fee: 0 });
  return true;
}
function noShoot() { if (ST.phase === 'out') return false; const W = worlds[ST.g]; return !(ST.phase === 'in' && W && W.canShoot && W.canShoot()); }

// ---------------------------------------------------------------- keys (before the game's own handler sees them)
function onKey(e) {
  if (ST.phase === 'out' || e.repeat) return;
  if (!ctx.running || ctx.paused || SHELL.isChatOpen() || !document.getElementById('menu').hidden) return;
  const swallow = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (ST.phase !== 'in') { if (['KeyF', 'KeyK', 'KeyN', 'KeyM', 'KeyE'].includes(e.code)) swallow(); return; }
  const W = worlds[ST.g];
  if (W && W.key && W.key(e.code, e)) { swallow(); return; }
  switch (e.code) {
    case 'KeyK': swallow(); if (performance.now() - ST.leaveAsk < 3000) leave(); else { ST.leaveAsk = performance.now(); ctx.notify('Press <kbd>K</kbd> again to go back to Poway.', '', 2800); } return;
    case 'KeyN': case 'KeyJ': case 'KeyY': case 'KeyT': case 'KeyR': swallow(); return;
    case 'KeyM': swallow(); ctx.notify('The map is of Poway. In here, the minimap has it.', '', 2200); return;
  }
}

// ---------------------------------------------------------------- every frame
let t = 0, shutT = 0;
function update(rdt) {
  t += rdt;
  const F = typeof window !== 'undefined' && window.__freeze; if (F) { ctx.camera.position.set(...F.p); ctx.camera.lookAt(...F.t); ctx.camera.updateMatrixWorld(); if (ctx.sky) ctx.sky.position.copy(ctx.camera.position); } // tests: a fixed view for screenshots
  const open = !!(GAMENET && GAMENET.ready() && ctx.online);
  updateGarages(rdt, open);
  if (!open && (shutT -= rdt) <= 0 && ST.phase === 'out' && shutDoorNear()) { // a shut door is never a mystery
    shutT = 10; ctx.notify(ctx.online ? 'Crew garages are closed: the game server isn\'t reachable right now. Reload to try again.' : 'Crew garages are online only: join a server.', '', 4000);
  }
  if (ST.phase === 'out') {
    if ((ST.cool -= rdt) > 0) return; // just came out, or the door said no: a moment before it can take you again
    const hit = garageTrigger(); if (hit) enter(hit.g);
    return;
  }
  if (ST.phase === 'joining') {
    const v = ctx.player.inCar; if (v) { v.vel.multiplyScalar(Math.exp(-rdt * 2)); } // rolling to a stop in the dark
    if (performance.now() - ST.joinT > 7000) { ST.phase = 'out'; ST.inMsg = null; HUD.fade(false); ctx.notify(ST.failMsg || 'The crew garage didn\'t answer. Try again in a moment.', 'red', 4000); backOut(); }
    return;
  }
  if (ST.phase === 'leaving') { if (performance.now() - ST.leaveT > 6000 && ST.faded) backHome({}); return; }
  // inside
  const W = worlds[ST.g], A = W.A, f = ctx.focusPos(), lx = f.x - A.o[0], lz = f.z - A.o[1];
  if (police.wanted) resetPolice();
  if (ST.holdT > 0) { ST.holdT -= rdt; const v = ctx.player.inCar; if (v) { v.vel.set(0, 0); v.speed = 0; } }
  W.update(rdt, t); if (t - cloakT > 2) { cloakT = t; cloak(); }
  const pv = ctx.player.inCar; // a wrecked car (a hard crash, a rocket) is replaced after 3 s: nobody is stuck in a world
  if (pv && pv.dead) { if ((ST.wreckT = (ST.wreckT || 0) + rdt) > 3) { ST.wreckT = 0; respawn(); } } else ST.wreckT = 0;
  if (inExit(A, lx, lz)) { leave(); return; }
  if (Math.abs(lx) > 3000 || Math.abs(lz) > 3000) { ctx.notify('Lost? Back to the start.', '', 2500); placeCar(ST.g, W.start, 0, true); }
}
function backOut() { // the join failed: back out of the garage the way you came
  ST.cool = 5; const v = ctx.player.inCar; if (!v) return;
  v.vel.set(-Math.sin(v.rotY) * 4, -Math.cos(v.rotY) * 4);
}

// ---------------------------------------------------------------- the minimap in there: the world's own map, north up like the game's
function drawMinimap(g, Wpx) {
  const W = worlds[ST.g]; if (!W) return;
  const R = Wpx / 2, f = ctx.focusPos(), A = W.A, MMD = Math.min(devicePixelRatio, 2), v = ctx.player.inCar, sp = v ? v.vel.length() : 0, mpp = (1.8 + sp * 0.05) / MMD, yaw = ctx.cam.yaw;
  g.save(); g.clearRect(0, 0, Wpx, Wpx); g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = W.mapBg || '#2c3529'; g.fillRect(0, 0, Wpx, Wpx);
  g.save(); g.translate(R, R); g.rotate(yaw); g.scale(1 / mpp, 1 / mpp); g.translate(-(f.x - A.o[0]), -(f.z - A.o[1]));
  W.drawMap(g, mpp); g.restore();
  const c = Math.cos(yaw), s = Math.sin(yaw), toMap = (x, z) => { const dx = (x - f.x) / mpp, dz = (z - f.z) / mpp; return [R + dx * c - dz * s, R + dx * s + dz * c]; };
  for (const r of REMOTES.values()) {
    if (!r.ped || (W.showPlayer && !W.showPlayer(r))) continue;
    const [x, y] = toMap(r.ped.pos.x, r.ped.pos.z); if (Math.hypot(x - R, y - R) > R - 6) continue;
    g.fillStyle = r.color; g.strokeStyle = 'rgba(10,12,16,.9)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 5 * MMD, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  if (W.mapMarks) for (const m of W.mapMarks()) { const [x, y] = toMap(A.o[0] + m.x, A.o[1] + m.z); if (Math.hypot(x - R, y - R) > R - 6) continue; g.fillStyle = m.color; g.beginPath(); g.arc(x, y, (m.r || 4) * MMD, 0, Math.PI * 2); g.fill(); }
  const facing = v ? v.rotY : ctx.player.rotY;
  MAPKIT.drawSelf(g, R, R, Math.PI - facing + yaw, MMD * 0.85, performance.now() / 1000);
  g.restore();
}
function mapMarks() { return ST.phase === 'out' ? garageMarks() : []; }

// ---------------------------------------------------------------- the server's side
function init() {
  buildGarages();
  addEventListener('keydown', onKey, true);
  onNet('game:in', d => { if (ST.phase === 'joining') arrive(d); else if (ST.phase === 'in' && d.g === ST.g) { const W = worlds[ST.g]; if (d.st && W.onState) W.onState(d.st); if (d.board && W.onBoard) W.onBoard(d.board); } });
  onNet('game:out', d => {
    if (d.err) { ST.failMsg = d.err; if (ST.phase === 'joining') { ST.phase = 'out'; HUD.fade(false); ctx.notify(d.err, 'red', 3500); backOut(); } return; }
    if (ST.phase === 'leaving') { ST.outMsg = d; if (ST.faded) backHome(d); }
    else if (ST.phase === 'in' && d.lost) leave(true); // left the server: home
  });
  onNet('game:state', d => { const W = ST.phase === 'in' && worlds[ST.g]; if (W && d.g === ST.g && W.onState) W.onState(d); });
  onNet('game:board', d => { const W = worlds[d.g]; if (W && W.onBoard) W.onBoard(d.rows); });
  onNet('game:event', e => {
    const W = ST.phase === 'in' && worlds[ST.g]; if (!W) return;
    if (e.k === 'place' && e.g === ST.g) { // the room moves you (grid slot, a reset, a new round)
      if (W.onPlace) W.onPlace(e); else placeCar(ST.g, [e.x - W.A.o[0], e.z - W.A.o[1], e.rot], 0, false);
    }
    if (W.onEvent) W.onEvent(e);
  });
  onNet('connection', up => { if (up && ST.phase === 'in' && GAMENET) GAMENET.join(ST.g); }); // back after a drop: tell the room where we are
}
export { GAME_COLORS };
