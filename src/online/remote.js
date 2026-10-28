// Other players in the world. Each one is a Ped (so bullets, punches, explosions and car hits already find them)
// driven by network state instead of AI, plus, while they drive, a car body that follows them. A player riding as a
// passenger (state.ride) is hidden inside the driver's car. Damage you deal to
// them is not applied here: it is sent to them (net.sendHit) and their own game applies it, so everyone agrees on
// who is alive. Their shots arrive as a counter in their state and are replayed as tracers and sound.
import { RESERVED } from '../reserved.js';
import { ctx } from '../ctx.js';
import { NET, on, unpack } from './net.js';
import { HUMANS, ensureAvatar } from '../humans.js';
import { makeAircraft } from '../aircraft.js';
import { shownName } from './shown.js';

const R = new Map(); // uid -> remote
export const REMOTES = R;
const LERP = 12, DRAW = 650, TAG = 140, AIR_DRAW = 6000; // smoothing rate; draw distance (m); name tag distance (m); aircraft are seen from far

// name tag with a health bar under the name; redrawn when their health changes
function drawTag(s, text, color, hp) {
  const { c, g, t } = s.userData; g.clearRect(0, 0, 256, 64);
  g.font = '700 32px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(250, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(10,14,22,.78)'; g.beginPath(); g.roundRect((256 - w) / 2, 6, w, 48, 10); g.fill();
  g.fillStyle = '#fff'; g.fillText(text, 128, 26);
  const bw = w - 20, k = Math.max(0, Math.min(1, hp / 100)); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(128 - bw / 2, 44, bw, 6);
  g.fillStyle = k > 0.5 ? '#7cd36b' : k > 0.25 ? '#ffd23f' : '#ff5d5d'; g.fillRect(128 - bw / 2, 44, bw * k, 6);
  g.fillStyle = color; g.fillRect((256 - w) / 2, 54, w, 3);
  t.needsUpdate = true; s.userData.hp = hp; s.userData.nm = text;
}
function tagSprite(THREE, text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.userData = { c, g, t, hp: -1 }; drawTag(s, text, color, 100);
  s.scale.set(1.6, 0.4, 1); s.renderOrder = 5; return s;
}
const COLORS = ['#ff4fd8', '#3df2ff', '#ffd43d', '#7dff6a', '#ff8a3d', '#a98bff', '#ff5d5d', '#4dffb8'];
function colorFor(id) { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }

async function add(d) {
  if (R.has(d.id)) return update(d);
  const st = unpack(d.p) || { x: 0, y: 0, z: 0, r: 0, spd: 0, hp: 100 };
  const rem = { id: d.id, name: d.n || 'Player', skin: d.s || '', color: colorFor(d.id), st, ped: null, car: null, carKey: '', shots: st.shots || 0, building: true, lastT: performance.now() };
  R.set(d.id, rem);
  await spawnPed(rem);
  rem.building = false;
  if (R.get(d.id) !== rem) { despawn(rem); return; } // left (or was re-added) while loading
  ctx.notify(`<b style="color:${rem.color}">${esc(shownName(rem.name, rem.id, rem.skin))}</b> is in town.`, '', 3500);
}
async function spawnPed(rem) { // keeps the old body (if any) on screen until the new one is ready
  const { THREE } = ctx;
  let avatar = rem.skin && HUMANS.ready && !RESERVED.has(rem.skin) ? rem.skin : null; // nobody online can wear a story character's skin
  if (avatar && !(await ensureAvatar(avatar))) avatar = null;
  const p = new ctx.Ped(rem.st.x, rem.st.z, { remote: true, look: { kind: 'civ', avatar, gun: false } });
  if (ctx.renderer && ctx.renderer.compileAsync) { // compile the new body's shaders off the frame before it shows (a skin swap used to hitch)
    p.rig.g.visible = false; await ctx.renderer.compileAsync(p.rig.g, ctx.camera, ctx.scene).catch(() => { }); p.rig.g.visible = true;
  }
  p.remote = rem; p.keep = true; p.isCop = false; p.personality = 'normal'; p.money = 0; p.health = 100;
  p.pos.y = rem.st.y; p.rotY = rem.st.r;
  p.ai = remoteAI;
  if (p.rig.human && ctx.equipGuns) ctx.equipGuns(p.rig);
  const tag = tagSprite(THREE, shownName(rem.name, rem.id, rem.skin), rem.color); tag.position.y = 2.25; p.rig.g.add(tag); rem.tag = tag;
  rem.ped = p;
}
function update(d) {
  const rem = R.get(d.id); if (!rem) return add(d);
  const st = unpack(d.p); if (!st) return;
  const was = rem.st && rem.st.ride; // someone getting in or out of your car
  if (st.ride === NET.uid && was !== NET.uid) ctx.notify(`<b style="color:${rem.color}">${esc(shownName(d.n || rem.name, rem.id, rem.skin))}</b> hopped in.`, '', 2500);
  else if (was === NET.uid && st.ride !== NET.uid) ctx.notify(`<b style="color:${rem.color}">${esc(shownName(d.n || rem.name, rem.id, rem.skin))}</b> got out.`, '', 2000);
  rem.st = st; rem.lastT = performance.now(); rem.name = d.n;
  if (d.s && d.s !== rem.skin && !rem.building) { // they changed skin: rebuild the body
    rem.skin = d.s; rem.building = true; const old = rem.ped;
    spawnPed(rem).then(() => { rem.building = false; if (old) { old.remote = null; old.remove(); } if (R.get(rem.id) !== rem) despawn(rem); });
  }
}
function despawn(rem) {
  if (rem.ped) { rem.ped.remote = null; rem.ped.remove(); rem.ped = null; }
  if (rem.car) { ctx.scene.remove(rem.car.g); rem.car = null; }
  if (rem.air) { ctx.scene.remove(rem.air.g); rem.air = null; }
}
function removeRemote(id) { const rem = R.get(id); if (!rem) return; R.delete(id); if (!rem.building) despawn(rem); }

// drives the Ped: glide toward the latest reported position; returns { speed, mode } like any ped AI
function remoteAI(p, dt) {
  const rem = p.remote; if (!rem) return { speed: 0 };
  const st = rem.st, k = 1 - Math.exp(-dt * LERP), age = Math.min(0.4, (performance.now() - rem.lastT) / 1000);
  const ex = st.x + Math.sin(st.r) * st.spd * age, ez = st.z + Math.cos(st.r) * st.spd * age; // where they are by now
  const dx = ex - p.pos.x, dz = ez - p.pos.z, far = dx * dx + dz * dz > 40 * 40;
  if (far) { p.pos.set(st.x, st.y, st.z); } // teleported / fast travel: snap
  else { p.pos.x += dx * k; p.pos.z += dz * k; p.pos.y += (st.y - p.pos.y) * k; }
  let dr = st.r - p.rotY; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); p.rotY += dr * k;
  if (p.rig.human && ctx.showGun) ctx.showGun(p.rig, st.w && st.w !== 'fists' ? st.w : null);
  else if (p.rig.gun) p.rig.gun.visible = !!st.w && st.w !== 'fists';
  return { speed: st.car ? 0 : st.spd, mode: st.aim ? 'aim' : null };
}

// every frame: dead / alive, cars, visibility, shots
let _ap = null, _aq = null;
export function updateRemotes(dt) {
  if (!_ap) { _ap = new ctx.THREE.Vector3(); _aq = new ctx.THREE.Quaternion(); }
  const { THREE, camera } = ctx, cam = camera.position;
  for (const rem of R.values()) {
    const p = rem.ped; if (!p || rem.building) continue;
    const st = rem.st, d = Math.hypot(p.pos.x - cam.x, p.pos.z - cam.z);
    // dead (wasted / busted) or alive again
    if (st.dead && p.state !== 'dead') { p.state = 'dead'; p.health = 0; }
    else if (!st.dead && p.state === 'dead') { p.state = 'walk'; p.health = 100; p.pos.set(st.x, st.y, st.z); }
    if (p.state === 'dead') p.timer = 0; // never cleaned up as a corpse
    if (p.state === 'fly' || p.state === 'down' || p.state === 'flee' || p.state === 'fight' || p.state === 'idle') p.state = 'walk';
    // driving: a car body at their position; the person hidden inside
    const key = st.car ? `${st.car.type}|${st.car.tint}|${st.car.model || ''}|${st.car.pt || ''}` : '';
    if (key !== rem.carKey) {
      if (rem.car) { ctx.scene.remove(rem.car.g); rem.car = null; }
      if (st.car && ctx.CAR[st.car.type]) {
        rem.car = ctx.buildCar(st.car.type, st.car.tint, st.car.model || undefined); ctx.scene.add(rem.car.g); rem.car.g.position.copy(p.pos);
        if (st.car.pt && ctx.applyLook) try { ctx.applyLook({ m: rem.car, spec: { L: rem.car.L, W: rem.car.W, H: rem.car.H }, tint: st.car.tint }, ctx.lookOf(st.car.pt)); } catch (e) { console.warn('[remote] look', e); } // their paint, lights and parts (src/carmods.js)
      }
      rem.carKey = key;
    }
    p.netCar = rem.car;
    // flying: their aircraft (the cheat jet, a plane, a helicopter), at their height and attitude, seen from far away
    const akey = st.air ? st.air.k : '';
    if (akey !== rem.airKey) {
      if (rem.air) { ctx.scene.remove(rem.air.g); rem.air = null; }
      if (!st.air) rem.airKey = '';
      else if (st.air.k.startsWith('boat:')) { if (ctx.boatModel) { const g = ctx.boatModel(st.air.k.slice(5)); rem.air = { g }; g.position.set(st.x, st.y, st.z); ctx.scene.add(g); } rem.airKey = akey; } // a boat
      else if (ctx.AIR) { const a = makeAircraft(ctx.AIR, st.air.k, { center: true }); if (a) { rem.air = a; a.g.position.set(st.x, st.y, st.z); ctx.scene.add(a.g); } rem.airKey = akey; }
    }
    if (rem.air) {
      const g = rem.air.g, age = Math.min(0.4, (performance.now() - rem.lastT) / 1000), k = 1 - Math.exp(-dt * LERP);
      _ap.set(st.x + Math.sin(st.r) * st.spd * age, st.y, st.z + Math.cos(st.r) * st.spd * age);
      if (g.position.distanceToSquared(_ap) > 250000) g.position.copy(_ap); else g.position.lerp(_ap, k);
      g.quaternion.slerp(_aq.fromArray(st.air.q), k); g.visible = Math.hypot(st.x - cam.x, st.z - cam.z) < AIR_DRAW;
      if (rem.air.spin) rem.air.spin(dt, 30); // props and rotors turn
      if (rem.tag && rem.tag.parent !== g) { g.add(rem.tag); rem.tag.position.set(0, 3.2, 0); }
    }
    const show = d < DRAW;
    p.rig.g.visible = show && !rem.car && !st.ride && !rem.air; // driving, flying, or riding in someone's car: the person is inside
    if (rem.tag) { rem.tag.visible = d < (rem.air ? 900 : TAG); rem.tag.position.y = rem.air ? 3.2 : rem.car ? 2.4 : 2.25; const hp = st.dead ? 0 : Math.round(st.hp ?? 100), nm = shownName(rem.name, rem.id, rem.skin); if (hp !== rem.tag.userData.hp || nm !== rem.tag.userData.nm) drawTag(rem.tag, nm, rem.color, hp); }
    if (rem.car) {
      const g = rem.car.g; g.visible = show;
      if (rem.tag && rem.tag.parent !== g) { g.add(rem.tag); }
      const ox = g.position.x, oz = g.position.z;
      g.position.lerp(p.pos, 1 - Math.exp(-dt * LERP)); if (p.pos.distanceToSquared(g.position) > 1600) { g.position.copy(p.pos); rem.car.vx = rem.car.vz = 0; }
      else if (dt > 0) { const k2 = 1 - Math.exp(-dt * 8); rem.car.vx = (rem.car.vx || 0) + ((g.position.x - ox) / dt - (rem.car.vx || 0)) * k2; rem.car.vz = (rem.car.vz || 0) + ((g.position.z - oz) / dt - (rem.car.vz || 0)) * k2; } // how the car moves as drawn: crashes go by this
      g.rotation.set(st.car.p, p.rotY, st.car.rl, 'YXZ');
      rem.wheel = (rem.wheel || 0) + (st.spd * dt) / (rem.car.wr || 0.35);
      for (const w of rem.car.wheels) w.w.rotation.x = rem.wheel;
    } else if (!rem.air && rem.tag && rem.tag.parent !== p.rig.g) p.rig.g.add(rem.tag);
    // their shots: tracer from the gun along their heading
    if ((st.shots || 0) !== rem.shots) {
      const n = Math.min(3, ((st.shots || 0) - rem.shots + 1000) % 1000); rem.shots = st.shots || 0;
      if (show && n > 0) {
        const fx = Math.sin(p.rotY), fz = Math.cos(p.rotY), y = p.pos.y + 1.45;
        for (let i = 0; i < n; i++) ctx.tracer(p.pos.x + fx * 0.6, y, p.pos.z + fz * 0.6, p.pos.x + fx * 60 + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 2, p.pos.z + fz * 60 + (Math.random() - 0.5) * 3);
        if (ctx.sfx2) ctx.sfx2.gun(st.w || 'pistol', 1, d); else ctx.sfx.gun(ctx.volAt(p.pos.x, p.pos.z, 160));
      }
    }
  }
}

// map blips: [{ x, z, name, color, car }]
export function remoteBlips() {
  const out = [];
  for (const rem of R.values()) if (rem.ped) out.push({ x: rem.ped.pos.x, z: rem.ped.pos.z, name: shownName(rem.name, rem.id, rem.skin), raw: rem.name, color: rem.color, car: !!rem.car, dead: !!rem.st.dead });
  return out;
}
export function remoteList() { return [...R.values()].map(r => ({ id: r.id, name: r.name, color: r.color, hp: r.st.hp, dead: r.st.dead, car: !!r.st.car })); }
export function colorOf(id) { return R.has(id) ? R.get(id).color : colorFor(id || ''); }

export function clearRemotes() { for (const id of [...R.keys()]) removeRemote(id); }
export function syncRemotes() {
  for (const [id, v] of NET.players) {
    if (!R.has(id)) add({ id, ...v });
  }
}
export function initRemotes() {
  on('player:add', d => { add(d); });
  on('player:update', d => { update(d); });
  on('player:remove', id => removeRemote(id));
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
