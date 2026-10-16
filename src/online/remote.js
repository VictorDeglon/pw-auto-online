// Other players in the world. Each one is a Ped (so bullets, punches, explosions and car hits already find them)
// driven by network state instead of AI, plus, while they drive, a car body that follows them. Damage you deal to
// them is not applied here: it is sent to them (net.sendHit) and their own game applies it, so everyone agrees on
// who is alive. Their shots arrive as a counter in their state and are replayed as tracers and sound.
import { ctx } from '../ctx.js';
import { NET, on, unpack } from './net.js';
import { HUMANS, ensureAvatar } from '../humans.js';

const R = new Map(); // uid -> remote
export const REMOTES = R;
const LERP = 12, DRAW = 650, TAG = 140; // smoothing rate; draw distance (m); name tag distance (m)

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
  t.needsUpdate = true; s.userData.hp = hp;
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
  const st = unpack(d.p); if (!st) return;
  const rem = { id: d.id, name: d.n, skin: d.s, color: colorFor(d.id), st, ped: null, car: null, carKey: '', shots: st.shots || 0, building: true, lastT: performance.now() };
  R.set(d.id, rem);
  await spawnPed(rem);
  rem.building = false;
  if (!R.has(d.id)) { despawn(rem); return; } // left while loading
  ctx.notify(`<b style="color:${rem.color}">${esc(rem.name)}</b> is in town.`, '', 3500);
}
async function spawnPed(rem) {
  const { THREE } = ctx;
  let avatar = rem.skin && HUMANS.ready ? rem.skin : null;
  if (avatar && !(await ensureAvatar(avatar))) avatar = null;
  const p = new ctx.Ped(rem.st.x, rem.st.z, { remote: true, look: { kind: 'civ', avatar, gun: false } });
  p.remote = rem; p.keep = true; p.isCop = false; p.personality = 'normal'; p.money = 0; p.health = 100;
  p.pos.y = rem.st.y; p.rotY = rem.st.r;
  p.ai = remoteAI;
  if (p.rig.human && ctx.equipGuns) ctx.equipGuns(p.rig);
  const tag = tagSprite(THREE, rem.name, rem.color); tag.position.y = 2.25; p.rig.g.add(tag); rem.tag = tag;
  rem.ped = p;
}
function update(d) {
  const rem = R.get(d.id); if (!rem) return add(d);
  const st = unpack(d.p); if (!st) return;
  rem.st = st; rem.lastT = performance.now(); rem.name = d.n;
  if (d.s && d.s !== rem.skin && !rem.building) { // they changed skin: rebuild the body
    rem.skin = d.s; rem.building = true; const old = rem.ped;
    spawnPed(rem).then(() => { rem.building = false; if (old) { old.remote = null; old.remove(); } if (!R.has(rem.id)) despawn(rem); });
  }
}
function despawn(rem) {
  if (rem.ped) { rem.ped.remote = null; rem.ped.remove(); rem.ped = null; }
  if (rem.car) { ctx.scene.remove(rem.car.g); rem.car = null; }
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
export function updateRemotes(dt) {
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
    const key = st.car ? `${st.car.type}|${st.car.tint}|${st.car.model || ''}` : '';
    if (key !== rem.carKey) {
      if (rem.car) { ctx.scene.remove(rem.car.g); rem.car = null; }
      if (st.car && ctx.CAR[st.car.type]) { rem.car = ctx.buildCar(st.car.type, st.car.tint, st.car.model || undefined); ctx.scene.add(rem.car.g); rem.car.g.position.copy(p.pos); }
      rem.carKey = key;
    }
    p.netCar = rem.car;
    const show = d < DRAW;
    p.rig.g.visible = show && !rem.car;
    if (rem.tag) { rem.tag.visible = d < TAG; rem.tag.position.y = rem.car ? 2.4 : 2.25; const hp = st.dead ? 0 : Math.round(st.hp ?? 100); if (hp !== rem.tag.userData.hp) drawTag(rem.tag, rem.name, rem.color, hp); }
    if (rem.car) {
      const g = rem.car.g; g.visible = show;
      if (rem.tag && rem.tag.parent !== g) { g.add(rem.tag); }
      g.position.lerp(p.pos, 1 - Math.exp(-dt * LERP)); if (p.pos.distanceToSquared(g.position) > 1600) g.position.copy(p.pos);
      g.rotation.set(st.car.p, p.rotY, st.car.rl, 'YXZ');
      rem.wheel = (rem.wheel || 0) + (st.spd * dt) / (rem.car.wr || 0.35);
      for (const w of rem.car.wheels) w.w.rotation.x = rem.wheel;
    } else if (rem.tag && rem.tag.parent !== p.rig.g) p.rig.g.add(rem.tag);
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
  for (const rem of R.values()) if (rem.ped) out.push({ x: rem.ped.pos.x, z: rem.ped.pos.z, name: rem.name, color: rem.color, car: !!rem.car, dead: !!rem.st.dead });
  return out;
}
export function remoteList() { return [...R.values()].map(r => ({ id: r.id, name: r.name, color: r.color, hp: r.st.hp, dead: r.st.dead, car: !!r.st.car })); }
export function colorOf(id) { return R.has(id) ? R.get(id).color : colorFor(id || ''); }

export function clearRemotes() { for (const id of [...R.keys()]) removeRemote(id); }
export function initRemotes() {
  on('player:add', d => { add(d); });
  on('player:update', d => { update(d); });
  on('player:remove', id => removeRemote(id));
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
