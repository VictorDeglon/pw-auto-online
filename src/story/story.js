// Quest engine: mission givers on the map, a step runner for the scripts in missions.js, NPC
// behaviours (idle cast, hostile crews, runners, rammers, passengers), subtitles, objective text,
// 3D markers, map blips and the pause-menu journal. Progress lives in save.story (save v3).
//
// Step types (fields in brackets are optional):
//   talk {lines | pickLines, [lethalLines]}      subtitles; E skips a line
//   phone {from, lines} · voicemail {id, lines}  same, styled as a call / a voicemail
//   goto {to, r, [car], [time], text}           reach a place ('@handle' = live entity position)
//   spawnCar {as, type, [model], [tint], at, [parked], [ahead], [protect]}
//   spawnNpc {as, who, at} · release {as}       place a cast member / let them walk off
//   ensureTommysCar {as}                         the gold car from the spawn, respawned if lost
//   enterCar {car, text} · deliver {car, to, [noHeat], [minHealth], text}
//   race {from, to, [names], pace, [limit], step, [countdown], parLabel, text, failText}
//   tail {car, to, min, max, text}              follow a routed car without being made
//   thugs {as, at, n, [spread], [aggro], text}  armed crew; done when all are dead or down
//   takedown {as, at|near, n, looks, …, text}   catch runners without killing them
//   pickup {at, [dx], [dz], label, text} · loseCops {text} · wait {t, [text]}
//   passenger {as} · comfort {npc, to, stories, failText} · dropoff {as}
//   pursuers {as, n, crew, armed, shake, shakeT, text} · act {n, title}
// A step with `if: 'wanted'` only runs while you have a wanted level.
import { ctx } from '../ctx.js';
import { on, emit } from '../events.js';
import { addInteract, removeInteract } from '../interact.js';
import { police, npcFire, setWanted } from '../police.js';
import { CAST_SKINS } from '../reserved.js';
import { steerTo, driveTo, routeEdges, routePolyline, samplePolyline } from '../drive.js';
import { CAST, LOOKS } from './cast.js';
import { PLACES } from './places.js';
import { MISSIONS, LINES } from './missions.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hyp = Math.hypot;
const wrapA = a => { if (a <= Math.PI && a >= -Math.PI) return a; if (!isFinite(a)) { if (!self.__wrapBad) self.__wrapBad = new Error('wrapA ' + a).stack; return 0; } a = (a + Math.PI) % (TAU); if (a < 0) a += TAU; return a - Math.PI; }; // O(1): a runaway angle used to spin a while-loop for seconds
const $ = id => document.getElementById(id);
const fmtT = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
const gold = 0xf0b23a;

const S = { m: null, later: [], givers: new Map(), pool: new Map(), giverT: 0, failPending: null, started: false, letterMats: new Map(), beam: null, arrow: null };

export function ensureSave() {
  const st = ctx.save.story || (ctx.save.story = {});
  st.act ??= 1; st.done ||= []; st.flags ||= {}; st.best ||= {}; st.last ||= {}; st.voicemails ||= [];
  st.trust ||= { rosa: 20, dee: 0, walt: 10 }; st.met ||= ['marco', 'rosa', 'tommy']; st.unlocks ||= []; st.props ||= [];
  return st;
}
export function storyUnlocked(key) { return ensureSave().unlocks.includes(key); }

// ------------------------------------------------------------------ places
const placeCache = new Map();
function place(key, m) {
  if (!key) return null;
  if (typeof key === 'object') return key;
  if (key[0] === '@') { const h = m && m.h[key.slice(1)], e = Array.isArray(h) ? h[0] : h; return e ? { x: e.pos.x, z: e.pos.z } : null; }
  if (placeCache.has(key)) return placeCache.get(key);
  const P = PLACES[key]; if (!P) return null; let pt;
  if (P.special === 'home') pt = homeSpot();
  else if (P.special === 'sheriff') pt = { x: ctx.SHERIFF.x, z: ctx.SHERIFF.z };
  else if (P.special === 'hospital') { const s = ctx.sidewalkNear(ctx.HOSPITAL.x, ctx.HOSPITAL.z); pt = { x: s.x, z: s.z }; }
  else if (P.special === 'plaza') { const s = ctx.sidewalkNear(ctx.PLAZA_CENTER.x + (P.dx || 0), ctx.PLAZA_CENTER.z + (P.dz || 0)); pt = { x: s.x, z: s.z }; }
  else if (P.special === 'summit') pt = summit(P.below || 0);
  else {
    const x = (P.lon - ctx.LON0) * ctx.KX, z = -(P.lat - ctx.LAT0) * ctx.KZ;
    if (P.snap === 'road') {
      const ne = ctx.nearestEdge(x, z, 300, P.names ? (e => P.names.includes(e.name)) : (e => e.t <= 5)) || ctx.nearestEdge(x, z, 300, e => e.t <= 5);
      pt = ne ? { x: ne.x, z: ne.z } : { x, z };
    } else { const s = ctx.sidewalkNear(x, z); pt = { x: s.x, z: s.z }; }
  }
  placeCache.set(key, pt); return pt;
}
// Mt Woodson: the highest ground in the play area (the same search the fast-travel summit uses); `below` metres
// down its gentlest road-ward side, for the ramp
let _summit = null;
function summit(below) {
  if (!_summit) { const b = ctx.D.bounds; let top = null; for (let z = b[1] + 200; z < b[3] - 200; z += 60) for (let x = b[0] + 200; x < b[2] - 200; x += 60) { const h = ctx.terrainAt(x, z); if (!top || h > top.h) top = { x, z, h }; } _summit = top; }
  if (!below) return { x: _summit.x, z: _summit.z };
  const ne = ctx.nearestEdge(_summit.x, _summit.z, 900, () => true); return ne ? { x: ne.x, z: ne.z } : { x: _summit.x, z: _summit.z };
}
// The Reyes house (fictional): it uses the spawn point.
function homeSpot() {
  const Z = ctx.ZONE; if (!Z || Z.cx == null) return { x: ctx.spawnPt.x, z: ctx.spawnPt.z };
  let best = null, bd = 1e9;
  for (const b of ctx.D.buildings) { const f = b[2], d = hyp(f[0] - Z.cx, f[1] - Z.cz); if (d < bd) { bd = d; best = f; } }
  let hx = Z.cx, hz = Z.cz;
  if (best) { hx = 0; hz = 0; for (let i = 0; i < best.length; i += 2) { hx += best[i]; hz += best[i + 1]; } hx /= best.length / 2; hz /= best.length / 2; }
  const s = ctx.sidewalkNear(hx, hz); return { x: s.x, z: s.z };
}
function curbAt(pt, names) {
  const ne = ctx.nearestEdge(pt.x, pt.z, 150, names ? (e => names.includes(e.name)) : (e => e.t >= 2 && e.t <= 5)) || ctx.nearestEdge(pt.x, pt.z, 150, e => e.t <= 5);
  if (!ne) return { x: pt.x, z: pt.z, rot: 0 };
  const o = ctx.edges[ne.e].w / 2 - 1.2;
  return { x: ne.x - ne.tz * o, z: ne.z + ne.tx * o, rot: Math.atan2(ne.tx, ne.tz) };
}
function laneAt(pt, ahead, awayFrom) {
  const ne = ctx.nearestEdge(pt.x, pt.z, 150, e => e.t <= 5); if (!ne) return { x: pt.x, z: pt.z, rot: 0 };
  const hx = awayFrom ? pt.x - awayFrom.x : 1, hz = awayFrom ? pt.z - awayFrom.z : 0;
  const a = ctx.agentFromNearest(ne, hx, hz, false); if (ahead) ctx.advance(a, ahead);
  const q = ctx.laneSample(a, 0, ctx.laneOff, { x: 0, z: 0, tx: 0, tz: 0 });
  return { x: q.x, z: q.z, rot: Math.atan2(q.tx, q.tz) };
}

// ------------------------------------------------------------------ spawning helpers
function spawnVehicle(type, model, x, z, rot, tint) {
  const spec = ctx.CAR[type], saved = spec.model; if (model) spec.model = [model];
  let v; try { v = new ctx.Vehicle(type, x, z, rot, tint); } finally { spec.model = saved; }
  v.keep = true; v.react = -1000; v.mission = true; ctx.settleCar(v); return v;
}
function makePed(look, x, z, o = {}) {
  const p = new ctx.Ped(x, z, {});
  ctx.scene.remove(p.rig.g); p.rig = ctx.buildRig(look); ctx.scene.add(p.rig.g); p.rig.gun.visible = !!look.gun;
  Object.assign(p, { keep: true, money: o.money ?? 0, state: 'ai', agent: null, ai: o.ai || npcIdle, invuln: !!o.invuln, who: o.who || null, voice: o.voice || 1, personality: 'normal', reported: true });
  if (o.hp) p.health = o.hp;
  p.maxHp = p.health; if (o.rot !== undefined) p.rotY = o.rot;
  return p;
}
function castPed(who, pt) { // every cast member wears their own avatar (src/reserved.js); nobody else ever does
  const c = CAST[who], p = makePed({ ...(c.look || {}), kind: 'civ', avatar: CAST_SKINS[who] }, pt.x, pt.z, { invuln: true, who, voice: c.voice });
  if (c.home && PLACES[c.home] && hyp(place(c.home).x - pt.x, place(c.home).z - pt.z) < 30) S.pool.set(who, p);
  return p;
}
function letterMat(who) {
  if (S.letterMats.has(who)) return S.letterMats.get(who);
  const c = CAST[who], cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.beginPath(); g.arc(32, 32, 30, 0, TAU); g.fill(); g.fillStyle = c ? c.color : '#f3ede1'; g.beginPath(); g.arc(32, 32, 25, 0, TAU); g.fill();
  g.fillStyle = '#0e1013'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(c ? c.letter : 'T', 32, 34);
  const t = new ctx.THREE.CanvasTexture(cv); t.colorSpace = ctx.THREE.SRGBColorSpace;
  const mat = new ctx.THREE.SpriteMaterial({ map: t, depthTest: false }); S.letterMats.set(who, mat); return mat;
}

// ------------------------------------------------------------------ HUD: objective, meter, subtitles
let objHtml = '';
function setObjective(html) { if (html === objHtml) return; objHtml = html; const el = $('objective'); if (!el) return; el.innerHTML = html || ''; el.hidden = !html; }
let meterHtml = '';
function setMeter(html) { if (html === meterHtml) return; meterHtml = html; const el = $('mstat'); if (!el) return; el.innerHTML = html || ''; el.hidden = !html; }
const bar = (k, label) => `<div class="meter"><i style="width:${clamp(k, 0, 1) * 100}%;${k < 0.3 ? 'background:var(--blood)' : ''}"></i></div>${label || ''}`;

const sub = {
  q: [], cur: null, t: 0, n: 0, done: 0,
  push(lines, style) { for (const [who, text] of lines) this.q.push({ id: ++this.n, who, text, style, dur: 1.5 + text.length * 0.055 }); return this.n; },
  idle() { return !this.cur && !this.q.length; },
  update(dt) {
    if (this.cur) { this.t -= dt; if (this.t <= 0) { this.done = this.cur.id; this.cur = null; } }
    if (!this.cur && this.q.length) { this.cur = this.q.shift(); this.t = this.cur.dur; this.show(this.cur); }
    if (!this.cur) { const el = $('subs'); if (el && !el.hidden) el.hidden = true; }
  },
  show(l) {
    const c = CAST[l.who] || { name: l.who, color: '#f3ede1', voice: 1 }, el = $('subs'); if (!el) return;
    const tag = l.style === 'phone' ? '<small>PHONE</small> ' : l.style === 'vm' ? '<small>VOICEMAIL</small> ' : '';
    el.className = 'hud' + (l.style === 'vm' ? ' vm' : ''); el.innerHTML = `${tag}<b style="color:${c.color}">${c.name}</b>${l.text}`; el.hidden = false;
    const f = ctx.focusPos(), ent = l.style || l.who === 'marco' ? null : speakerEntity(l.who);
    ctx.speak(l.text, ent ? ent.pos.x : f.x, ent ? ent.pos.z : f.z, c.voice || 1);
  },
  skip() { if (!this.cur) return false; this.t = 0; return true; },
  clear() { this.q = []; this.cur = null; this.done = this.n; const el = $('subs'); if (el) el.hidden = true; },
};
function speakerEntity(who) {
  const m = S.m; if (m) for (const h of Object.values(m.h)) for (const e of [].concat(h)) if (e && e.who === who && !e.removed) return e;
  return S.pool.get(who) || null;
}
function text(who, msg) { ctx.notify(`<b>TEXT · ${(CAST[who] ? CAST[who].name : who).toUpperCase()}</b> ${msg}`, '', 9000); ctx.sfx.phone(0.8); }
function later(t, fn) { S.later.push({ t: ctx.simTime + t, fn }); }

// ------------------------------------------------------------------ 3D markers
function beamMesh(r, color, opacity) {
  const THREE = ctx.THREE;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 90, 24, 1, true).translate(0, 45, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  m.visible = false; ctx.scene.add(m); return m;
}
function arrowMesh() {
  const THREE = ctx.THREE, m = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: gold }));
  m.visible = false; ctx.scene.add(m); return m;
}
function updateMarkers() {
  const m = S.m; if (!S.beam) { S.beam = beamMesh(2.4, gold, 0.32); S.arrow = arrowMesh(); }
  const t = m && m.target, kind = m && m.targetKind;
  S.beam.visible = !!t && kind === 'beam'; S.arrow.visible = !!t && kind === 'arrow';
  if (S.beam.visible) S.beam.position.set(t.x, ctx.heightAt(t.x, t.z), t.z);
  if (S.arrow.visible) { const y = (t.y ?? ctx.heightAt(t.x, t.z)) + (m.arrowH || 3.2) + Math.sin(ctx.simTime * 4) * 0.25; S.arrow.position.set(t.x, y, t.z); S.arrow.rotation.y += 0.05; }
}
function aimAt(m, pt, kind = 'beam') { m.target = pt; m.targetKind = kind; }

// ------------------------------------------------------------------ NPC behaviours (ped.ai)
function move(p, speed, dt) { p.pos.x += Math.sin(p.rotY) * speed * dt; p.pos.z += Math.cos(p.rotY) * speed * dt; return ctx.collideCircle(p.pos, 0.35); }
function face(p, x, z, dt, rate = 8) { p.rotY += wrapA(Math.atan2(x - p.pos.x, z - p.pos.z) - p.rotY) * Math.min(1, dt * rate); }
function npcIdle(p, dt) {
  if (p.state !== 'ai') return null;
  const f = ctx.focusPos();
  if (p.walkTo) { const w = p.walkTo; if (hyp(w.x - p.pos.x, w.z - p.pos.z) > 1.4) { face(p, w.x, w.z, dt); move(p, 1.7, dt); return { speed: 1.7 }; } p.walkTo = null; }
  if (hyp(f.x - p.pos.x, f.z - p.pos.z) < 14) face(p, f.x, f.z, dt, 4);
  return { speed: 0, mode: p.pose || null };
}
const TAUNT = ['Who invited you?', 'Wrong barn, homie!', 'Light him up!', 'Vance said no witnesses!', 'You picked the wrong ranch!'];
function hostileAI(p, dt) {
  if (p.out) { if (p.state === 'ai') { p.state = 'down'; p.timer = 9999; } return { speed: 0 }; }
  if (p.state !== 'ai') return null;
  const P = ctx.player, f = ctx.focusPos(), d = hyp(f.x - p.pos.x, f.z - p.pos.z), t = ctx.simTime;
  if (!p.aggro) {
    if (d < (p.aggroR || 40) || p.health < p.maxHp) { p.aggro = true; if (Math.random() < 0.6) ctx.say(p, pick(TAUNT), 'mad'); }
    else { if (d < 70) face(p, f.x, f.z, dt, 2); return { speed: 0, mode: null }; }
  }
  if (P.dead) return { speed: 0 };
  face(p, f.x, f.z, dt, 7);
  if (t >= (p.losNext || 0)) { p.losNext = t + 0.3; p.see = d < 60 && ctx.los(p.pos.x, p.pos.y + 1.6, p.pos.z, f.x, f.y + 1.2, f.z); }
  let speed = 0;
  if (!p.see || d > 18) { speed = 4.4; move(p, speed, dt); }
  else if (d < 6) { speed = 2; move(p, -speed, dt); }
  p.shootCd -= dt;
  if (!p.see) p.aimT = 0; else if (!p.aimT) p.aimT = t + rand(0.8, 1.4);
  if (p.see && p.shootCd <= 0 && d < 50 && t >= p.aimT) { p.shootCd = rand(1, 1.8); npcFire(p.pos.x + Math.sin(p.rotY) * 0.6, p.pos.y + 1.45, p.pos.z + Math.cos(p.rotY) * 0.6, 0.24, 7); }
  return { speed, mode: 'aim' };
}
function hostileHurt(amt, by, flying) {
  this.aggro = true;
  if (this.health < 35) { this.out = true; if (!flying) { this.state = 'down'; this.timer = 9999; } }
  else if (!flying && amt >= 25 && Math.random() < 0.35) { this.state = 'down'; this.timer = rand(1.2, 2.5); }
}
const RUN_LINES = ['Nope!', 'Five-oh! Wait, no...', 'Not today!', 'Can\'t catch me!', 'Oh no oh no oh no'];
function fleerAI(p, dt) {
  if (p.state !== 'ai') return null;
  const f = ctx.focusPos(), d = hyp(f.x - p.pos.x, f.z - p.pos.z);
  if (p.caught) { face(p, f.x, f.z, dt, 3); return { speed: 0, mode: 'hands' }; }
  if (!p.spooked) {
    if (d < (p.spookR || 20) || p.health < p.maxHp) { p.spooked = true; p.stam = rand(14, 22); ctx.say(p, pick(RUN_LINES), 'mad'); }
    else { if (d < 40) face(p, f.x, f.z, dt, 1); return { speed: 0, mode: p.pose || null }; }
  }
  p.stam -= dt; const speed = p.stam > 0 ? p.runSpeed : 3.6; // they tire out
  const want = Math.atan2(p.pos.x - f.x, p.pos.z - f.z) + Math.sin(ctx.simTime * 1.7 + p.seedA) * 0.5 + (p.dodge || 0);
  p.rotY += wrapA(want - p.rotY) * Math.min(1, dt * 5);
  if (move(p, speed, dt)) p.dodge = clamp((p.dodge || 0) + (Math.random() < 0.5 ? 1 : -1), -2, 2); else p.dodge = (p.dodge || 0) * (1 - dt * 0.7);
  return { speed, mode: null };
}
function fleerHurt(amt, by, flying) {
  if (this.health < (this.giveUp || 55) && !this.caught) { this.caught = true; if (!flying) { this.state = 'down'; this.timer = rand(1.5, 2.5); } ctx.say(this, 'Okay! Okay! I give up!', 'mad'); }
  this.spooked = true;
}
function rammerAI(v, dt) {
  const P = ctx.player, f = ctx.focusPos(), d = hyp(f.x - v.pos.x, f.z - v.pos.z);
  if (P.dead || v.crewOut) { steerTo(v, v.pos.x, v.pos.z, dt, { stop: true }); return; }
  const slow = !P.inCar || P.inCar.vel.length() < 2;
  if (slow && d < 28) { steerTo(v, f.x, f.z, dt, { stop: d < 14, maxSpeed: 8 }); if (v.vel.length() < 2 && v.crew > 0) bailOut(v); return; }
  const lead = P.inCar ? clamp(d / 25, 0, 1.2) : 0;
  driveTo(v, f.x + (P.inCar ? P.inCar.vel.x * lead : 0), f.z + (P.inCar ? P.inCar.vel.y * lead : 0), dt);
  if (v.armed && d < 32 && Math.random() < dt * 0.8 && ctx.los(v.pos.x, v.pos.y + 1.5, v.pos.z, f.x, f.y + 1.2, f.z)) npcFire(v.pos.x, v.pos.y + 1.5, v.pos.z, 0.18, 6);
}
function bailOut(v) {
  v.thugs = v.thugs || [];
  for (let i = 0; i < v.crew; i++) {
    const sx = (i % 2 ? 1 : -1) * (v.spec.W / 2 + 0.7);
    const p = makePed(pick(LOOKS.thug), v.pos.x + v.fz * sx, v.pos.z - v.fx * sx, { ai: hostileAI });
    p.onHurt = hostileHurt; p.aggro = true; p.rotY = v.rotY; v.thugs.push(p);
  }
  v.crewOut = v.crew; v.crew = 0; v.driver = null; v.ai = null;
}
// a hit target: idles until spooked, then makes for their car (and drives off) or runs; armed ones shoot back
const SPOOK = ['Somebody stop him!', 'Not like this!', 'Get away from me!', 'You don\'t know who I work for!', 'Help! HELP!'];
function targetAI(p, dt) {
  if (p.state !== 'ai') return null;
  const f = ctx.focusPos(), d = hyp(f.x - p.pos.x, f.z - p.pos.z);
  if (!p.spooked) { if (d < (p.spookR || 35) || p.health < p.maxHp) { p.spooked = true; ctx.say(p, pick(SPOOK), 'mad'); } else { if (d < 30) face(p, f.x, f.z, dt, 2); return { speed: 0, mode: p.pose || null }; } }
  const car = p.car;
  if (car && !car.dead && !car.removed) {
    const dc = hyp(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
    if (dc < 2.6) { board(p, car); const away = p.fleeTo || { x: car.pos.x + (car.pos.x - f.x) * 6, z: car.pos.z + (car.pos.z - f.z) * 6 }; Object.assign(car, { driver: 'thug', ai: fleeAI, storyAI: true, dest: away, parked: false, mode: 'free', agent: null }); car.spec.vmax = 44; return { speed: 0 }; }
    face(p, car.pos.x, car.pos.z, dt, 10); move(p, 5.4, dt); return { speed: 5.4 };
  }
  if (p.rig.gun.visible && d < 30 && Math.random() < dt * 0.9 && ctx.los(p.pos.x, p.pos.y + 1.5, p.pos.z, f.x, f.y + 1.2, f.z)) { face(p, f.x, f.z, dt, 20); npcFire(p.pos.x, p.pos.y + 1.45, p.pos.z, 0.25, 6); }
  const want = Math.atan2(p.pos.x - f.x, p.pos.z - f.z) + Math.sin(ctx.simTime * 1.3 + p.seedA) * 0.45 + (p.dodge || 0);
  p.rotY += wrapA(want - p.rotY) * Math.min(1, dt * 5);
  if (move(p, p.runSpeed || 6, dt)) p.dodge = clamp((p.dodge || 0) + (Math.random() < 0.5 ? 1 : -1), -2, 2); else p.dodge = (p.dodge || 0) * (1 - dt * 0.7);
  return { speed: p.runSpeed || 6 };
}
function fleeAI(v, dt) { // flat out for v.dest along the roads
  if (!v.dest) return; const d = hyp(v.dest.x - v.pos.x, v.dest.z - v.pos.z);
  if (d < 20) { steerTo(v, v.pos.x, v.pos.z, dt, { stop: true }); return; }
  driveTo(v, v.dest.x, v.dest.z, dt, { near: 30 });
}
function guardAI(p, dt) { // a sentry: stands, looks around, turns toward noises (gunfire makes them hostile)
  if (p.state !== 'ai') return null;
  p.lookT = (p.lookT || 0) - dt; if (p.lookT <= 0) { p.lookT = rand(2, 5); p.lookTo = p.rotY + rand(-1.6, 1.6); }
  p.rotY += wrapA(p.lookTo - p.rotY) * Math.min(1, dt * 1.5);
  if (p.health < p.maxHp) { p.ai = hostileAI; p.aggro = true; }
  return { speed: 0, mode: null };
}
function board(p, car) { const i = ctx.peds.indexOf(p); if (i >= 0) ctx.peds.splice(i, 1); p.riding = car; p.rig.g.visible = false; }
function unboard(p) {
  const car = p.riding; p.riding = null; if (!ctx.peds.includes(p)) ctx.peds.push(p);
  const o = car ? -(car.spec.W / 2 + 0.8) : 0; if (car) p.pos.set(car.pos.x + car.fz * o, 0, car.pos.z - car.fx * o);
  ctx.collideCircle(p.pos, 0.35); p.pos.y = ctx.heightAt(p.pos.x, p.pos.z); p.rig.g.visible = true; p.state = 'ai'; p.ai = npcIdle;
}

// ------------------------------------------------------------------ steps
const COND = { wanted: () => police.wanted > 0 };
const STEPS = {
  talk: {
    start(s, d, m) { const lines = m.flags.lethal && d.lethalLines ? d.lethalLines : d.pickLines ? pick(d.pickLines) : d.lines; s.id = sub.push(lines); },
    update(s) { return sub.done >= s.id; },
  },
  phone: {
    start(s, d) { s.wait = 1.6; ctx.sfx.phone(1); ctx.notify(`<b>INCOMING CALL</b> · ${CAST[d.from].name}`, '', 2500); },
    update(s, d, m, dt) { if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) s.id = sub.push(d.lines, 'phone'); return false; } return sub.done >= s.id; },
  },
  voicemail: {
    start(s, d) { s.wait = 1.2; ctx.tone(880, 0.25, 'sine', 0.2); const st = ensureSave(); if (!st.voicemails.includes(d.id)) st.voicemails.push(d.id); st.vmText ||= {}; st.vmText[d.id] = d.lines.map(l => l[1]); },
    update(s, d, m, dt) { if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) s.id = sub.push(d.lines, 'vm'); return false; } return sub.done >= s.id; },
  },
  goto: {
    start(s, d, m) { setObjective(d.text); s.left = d.time || 0; },
    update(s, d, m, dt) {
      const pt = place(d.to, m); if (!pt) return 'Something went wrong with this mission.';
      aimAt(m, pt, String(d.to)[0] === '@' ? 'arrow' : 'beam'); m.arrowH = 2.6;
      if (d.time) { s.left -= dt; setMeter(`<b>${fmtT(s.left)}</b>left`); if (s.left <= 0) return 'You ran out of time.'; }
      const P = ctx.player, f = ctx.focusPos();
      if (d.car && !P.inCar) { setObjective('Get in a <em>car</em>.'); return false; }
      setObjective(d.text);
      return hyp(f.x - pt.x, f.z - pt.z) < (d.r || 10) && (!P.inCar || P.inCar.vel.length() < 8);
    },
  },
  wait: { start(s, d) { s.t = d.t; if (d.text) setObjective(d.text); }, update(s, d, m, dt) { return (s.t -= dt) <= 0; } },
  loseCops: { start(s, d) { setObjective(d.text); }, update() { return police.wanted === 0; } },
  spawnCar: {
    start(s, d, m) {
      const p0 = place(d.at, m), pt = { x: p0.x + (d.dx || 0), z: p0.z + (d.dz || 0) }, names = PLACES[d.at] && PLACES[d.at].names;
      const q = d.parked ? (d.dx || d.dz ? { x: pt.x, z: pt.z, rot: d.rot || 0 } : curbAt(pt, names)) : laneAt(pt, d.ahead || 0, ctx.focusPos());
      const v = spawnVehicle(d.type, d.model, q.x, q.z, q.rot, d.tint); if (d.hp) v.health = d.hp;
      if (d.parked) v.parked = true; else { v.driver = 'ai'; v.mode = 'free'; }
      m.h[d.as] = v; if (d.protect) m.watch.push(() => (v.dead || v.removed) ? d.protect : null);
    },
  },
  ensureTommysCar: {
    start(s, d, m) {
      const home = place('home');
      let v = ctx.vehicles.find(c => c.tommy && !c.dead) || ctx.vehicles.find(c => c.mine && c.type === 'sports' && c.tint === gold && !c.dead);
      if (!v || hyp(v.pos.x - home.x, v.pos.z - home.z) > 700) {
        const q = curbAt({ x: home.x, z: home.z }); v = spawnVehicle('sports', null, q.x, q.z, q.rot, gold); v.mine = true;
        ctx.notify('Tommy\'s car is parked out front.', '', 3000);
      }
      v.tommy = true; m.h[d.as] = v;
    },
  },
  spawnNpc: {
    start(s, d, m) {
      const pt = place(d.at, m), pooled = S.pool.get(d.who);
      const p = pooled && !pooled.removed && hyp(pooled.pos.x - pt.x, pooled.pos.z - pt.z) < 40 ? pooled : castPed(d.who, pt);
      m.h[d.as] = p; const st = ensureSave(); if (!st.met.includes(d.who)) st.met.push(d.who);
    },
  },
  release: {
    start(s, d, m) { const p = m.h[d.as]; if (!p) return; if (S.pool.get(p.who) === p) S.pool.delete(p.who); Object.assign(p, { ai: null, invuln: false, keep: false, state: 'walk', agent: null }); delete m.h[d.as]; },
  },
  enterCar: {
    start(s, d) { setObjective(d.text); },
    update(s, d, m) { const v = m.h[d.car]; if (!v || v.dead || v.removed) return 'The car is gone.'; aimAt(m, v.pos, 'arrow'); m.arrowH = 2.8; return ctx.player.inCar === v; },
  },
  deliver: {
    start(s, d, m) { s.pt = place(d.to, m); },
    update(s, d, m) {
      const v = m.h[d.car], P = ctx.player;
      if (!v || v.dead || v.removed) return 'The car was destroyed.';
      if (d.minHealth && v.health < d.minHealth) return d.wreckText || 'The car is wrecked.';
      if (d.minHealth) setMeter(bar((v.health - d.minHealth) / (100 - d.minHealth), `${d.carName || 'Car'} condition`));
      if (P.inCar !== v) { setObjective(`Get back in the <em>${d.carName || 'car'}</em>.`); aimAt(m, v.pos, 'arrow'); return false; }
      if (d.noHeat && police.wanted > 0) { setObjective('Lose the <em>Sheriff</em> first. No heat at the garage.'); aimAt(m, null); return false; }
      setObjective(d.text); aimAt(m, s.pt);
      return hyp(v.pos.x - s.pt.x, v.pos.z - s.pt.z) < (d.r || 10) && v.vel.length() < 6;
    },
  },
  race: {
    start(s, d, m) {
      const a = place(d.from, m), b = place(d.to, m);
      const r = (d.names && routeEdges(a.x, a.z, b.x, b.z, e => d.names.includes(e.name))) || routeEdges(a.x, a.z, b.x, b.z);
      const pts = r ? routePolyline(r) : [a.x, a.z, b.x, b.z];
      let len = 0; for (let k = 2; k < pts.length; k += 2) len += hyp(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]);
      s.len = len; s.cps = samplePolyline(pts, d.step || 300); s.i = 0; s.t = 0;
      s.par = Math.round(len / (d.pace || 23)); s.limit = Math.round(s.par * (d.limit || 1)); s.count = d.countdown ? 3.6 : 0; s.shown = -1;
      s.next = beamMesh(6, gold, 0.38); s.after = beamMesh(4, 0xf3ede1, 0.16);
      setObjective(d.text); m.race = s;
    },
    update(s, d, m, dt) {
      const P = ctx.player, car = P.inCar;
      if (s.count > 0) {
        if (car) car.vel.set(0, 0);
        s.count -= dt; const n = Math.ceil(s.count - 0.6);
        if (n !== s.shown) { s.shown = n; if (n > 0) { ctx.big(String(n), d.parLabel ? `${d.parLabel} ${fmtT(s.par)}` : '', 'mission', 0.9); ctx.tone(660, 0.15, 'square', 0.18); } else { ctx.big('GO!', '', 'pass', 0.8); ctx.tone(1320, 0.3, 'square', 0.2); } }
        this.place(s); return false;
      }
      if (!car) setObjective('Get back in a <em>car</em>. The clock is running.'); else setObjective(d.text);
      s.t += dt;
      const cp = s.cps[s.i]; aimAt(m, cp, 'none');
      if (car && hyp(car.pos.x - cp.x, car.pos.z - cp.z) < (d.cpR || 15)) {
        s.i++; ctx.tone(1046, 0.12, 'triangle', 0.2);
        if (s.i >= s.cps.length) { s.final = s.t; return true; }
        this.place(s);
      }
      const left = s.limit - s.t;
      setMeter(`<b>${fmtT(s.t)}</b>${d.parLabel || 'Par'} ${fmtT(s.par)} · checkpoint ${s.i + 1}/${s.cps.length}`);
      return left <= 0 ? (d.failText || 'Out of time.') : false;
    },
    place(s) {
      const a = s.cps[s.i], b = s.cps[s.i + 1];
      s.next.visible = !!a; if (a) s.next.position.set(a.x, ctx.heightAt(a.x, a.z), a.z);
      s.after.visible = !!b; if (b) s.after.position.set(b.x, ctx.heightAt(b.x, b.z), b.z);
    },
    end(s) { for (const k of ['next', 'after']) { ctx.scene.remove(s[k]); s[k].geometry.dispose(); } },
  },
  tail: {
    start(s, d, m) { s.dest = place(d.to, m); s.closeT = 0; s.farT = 0; s.grace = 5; route(m.h[d.car], s.dest); setObjective(d.text); },
    update(s, d, m, dt) {
      const v = m.h[d.car]; if (!v || v.dead || v.removed) return 'The van is gone.';
      if (v.driver === 'ai' && v.mode === 'rail' && !v.agent.route) route(v, s.dest); // bumped off its route
      if (v.angerAt === 'player') return d.spotText;
      const f = ctx.focusPos(), dist = hyp(f.x - v.pos.x, f.z - v.pos.z); aimAt(m, v.pos, 'arrow'); m.arrowH = 3.6;
      s.grace -= dt;
      if (dist < d.min && s.grace <= 0) s.closeT += dt; else s.closeT = Math.max(0, s.closeT - dt * 0.5);
      s.farT = dist > d.max ? s.farT + dt : 0;
      setMeter(`<b>${Math.round(dist)} m</b>${dist < d.min ? '<span style="color:var(--blood)">Too close!</span>' : dist > d.max ? '<span style="color:var(--blood)">Losing them…</span>' : 'Good distance'}`);
      if (s.closeT > 3) return d.spotText;
      if (s.farT > 10) return d.lostText;
      if (hyp(v.pos.x - s.dest.x, v.pos.z - s.dest.z) < 30) { v.mode = 'free'; v.agent = null; v.parked = true; v.driver = null; v.vel.multiplyScalar(0.3); return true; }
      return false;
    },
  },
  thugs: {
    start(s, d, m) {
      const c = place(d.at, m); s.list = [];
      for (let i = 0; i < d.n; i++) {
        const a = rand(0, TAU), r = rand(4, d.spread || 12), p = makePed(pick(LOOKS.thug), c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, { ai: hostileAI, money: Math.round(rand(20, 80)) });
        ctx.collideCircle(p.pos, 0.35); p.onHurt = hostileHurt; p.aggroR = d.aggro || 40; s.list.push(p);
      }
      m.h[d.as] = s.list; setObjective(d.text);
    },
    update(s, d, m) {
      const alive = s.list.filter(p => !p.removed && p.state !== 'dead' && !p.out);
      m.targets = alive.map(p => p.pos); setMeter(`<b>${alive.length}</b>left`);
      return alive.length === 0;
    },
  },
  takedown: {
    start(s, d, m) {
      s.list = []; s.left = d.time || 0;
      for (let i = 0; i < d.n; i++) {
        let pt;
        if (d.near) { const c = place(d.near, m), a = rand(0, TAU), r = rand(d.min, d.max); pt = ctx.sidewalkNear(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r); }
        else { const c = place(d.at, m), a = rand(0, TAU), r = rand(6, d.spread || 20); pt = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }; }
        const p = makePed(pick(LOOKS[d.looks]), pt.x, pt.z, { ai: fleerAI, money: 0 });
        ctx.collideCircle(p.pos, 0.35);
        Object.assign(p, { onHurt: fleerHurt, spookR: d.spookR || 20, runSpeed: (d.speed || 5.8) * rand(0.95, 1.05), seedA: rand(0, 10), pose: d.pose || null });
        if (d.carrying) { const box = new ctx.THREE.Mesh(ctx.boxG(0.38, 0.26, 0.3), ctx.lam('#b08850')); box.position.set(0, -0.62, 0.18); p.rig.armR.add(box); }
        s.list.push(p);
      }
      m.h[d.as] = s.list; setObjective(d.text);
    },
    update(s, d, m, dt) {
      for (const p of s.list) if (p.state === 'dead' && !p.counted) { p.counted = true; if (d.lethalFail) return d.lethalFail; m.flags.lethal = true; }
      const left = s.list.filter(p => !p.caught && p.state !== 'dead' && !p.removed), f = ctx.focusPos();
      m.targets = left.map(p => p.pos); if (left.length === 1) aimAt(m, left[0].pos, 'arrow'); else aimAt(m, null);
      if (d.time) { s.left -= dt; if (s.left <= 0) return 'They got away.'; }
      setMeter(`<b>${left.length}</b>${left.length === 1 ? 'to catch' : 'still running'}${d.time ? ' · ' + fmtT(s.left) : ''}`);
      for (const p of left) if (hyp(p.pos.x - f.x, p.pos.z - f.z) > 260) return d.escapeText || 'One of them got away.';
      return left.length === 0;
    },
  },
  pickup: {
    start(s, d, m) {
      const c = place(d.at, m); s.pt = { x: c.x + (d.dx || 0), z: c.z + (d.dz || 0) }; ctx.collideCircle(s.pt, 0.4);
      s.mesh = new ctx.THREE.Mesh(ctx.boxG(0.5, 0.35, 0.4), new ctx.THREE.MeshStandardMaterial({ color: gold, emissive: 0x6a4a10, emissiveIntensity: 0.8 })); ctx.scene.add(s.mesh);
      setObjective(d.text);
    },
    update(s, d, m) {
      const f = ctx.focusPos(), P = ctx.player; aimAt(m, s.pt, 'beam');
      s.mesh.position.set(s.pt.x, ctx.heightAt(s.pt.x, s.pt.z) + 0.6 + Math.sin(ctx.simTime * 3) * 0.1, s.pt.z); s.mesh.rotation.y += 0.04;
      if (hyp(f.x - s.pt.x, f.z - s.pt.z) < (P.inCar ? 3 : 1.6)) { ctx.notify(`Picked up <b>${d.label}</b>.`, 'green', 2500); ctx.sfx.cash(); return true; }
      return false;
    },
    end(s) { ctx.scene.remove(s.mesh); s.mesh.geometry.dispose(); },
  },
  passenger: {
    start(s, d, m) { s.p = m.h[d.as] || S.pool.get(d.who); m.h[d.as] = s.p; },
    update(s, d, m) {
      const P = ctx.player, p = s.p, name = CAST[p.who] ? CAST[p.who].name : 'them';
      if (!p || p.removed || p.state === 'dead') return `${name} got hurt.`;
      if (!P.inCar) { setObjective(`Get in a <em>car</em> to pick up ${name}.`); aimAt(m, null); p.walkTo = null; return false; }
      const car = P.inCar, dd = hyp(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
      setObjective(`Pull up next to <em>${name}</em>.`); aimAt(m, p.pos, 'arrow');
      if (dd < 25) p.walkTo = car.pos;
      if (dd < 7 && car.vel.length() < 2) { board(p, car); ctx.say(car === P.inCar ? { pos: car.pos, rig: car.m, voice: 0.8 } : p, 'Alright, let\'s go.', '', false); return true; }
      return false;
    },
  },
  comfort: {
    start(s, d, m) {
      s.pt = place(d.to, m); s.c = 100; s.storyT = 5; s.si = 0; s.calmT = 0; s.gripeT = 0;
      const gripe = (amt, lines) => { s.c -= amt; s.calmT = 3; if (ctx.simTime > s.gripeT && sub.idle()) { s.gripeT = ctx.simTime + 5; sub.push([['walt', pick(lines)]]); } };
      s.off = [
        on('car:crash', e => { const car = m.h[d.npc].riding; if (car && (e.a === car || e.b === car)) gripe(e.impact * 2.6, ['My coffee!', 'EASY!', 'That\'s a mailbox, son, not a suggestion!', 'Lord, take me now.']); }),
        on('crime', e => { if (m.h[d.npc].riding) gripe(e.kind === 'gunfire' ? 25 : 15, ['I did not sign up for this!', 'I\'m too old for felonies!']); }),
      ];
      setObjective(d.text);
    },
    update(s, d, m, dt) {
      const P = ctx.player, p = m.h[d.npc], car = p.riding;
      if (!car || car.dead || car.removed) return `${CAST[p.who].name} got hurt.`;
      if (P.inCar !== car) { setObjective('Get back in the <em>car</em>. Walt is waiting.'); aimAt(m, car.pos, 'arrow'); s.c -= dt * 2; }
      else {
        setObjective(d.text); aimAt(m, s.pt);
        const sp = car.vel.length(), slip = Math.abs(car.vel.x * car.fz - car.vel.y * car.fx);
        if (sp > 27) { s.c -= dt * 6; s.calmT = 2; if (ctx.simTime > s.gripeT && sub.idle()) { s.gripeT = ctx.simTime + 6; sub.push([['walt', pick(['This isn\'t Daytona!', 'Speed limit\'s a number, not a dare!', 'Slow DOWN.'])]]); } }
        if (slip > 4) { s.c -= dt * 5; s.calmT = 2; }
        if (police.wanted) { s.c -= dt * 8; s.calmT = 2; }
        s.calmT -= dt; if (s.calmT <= 0) s.c = Math.min(100, s.c + dt * 1.5);
        s.storyT -= dt;
        if (s.storyT <= 0 && sub.idle() && s.si < d.stories.length) { sub.push(d.stories[s.si++]); s.storyT = 8; }
        if (hyp(car.pos.x - s.pt.x, car.pos.z - s.pt.z) < (d.r || 14) && sp < 3) return true;
      }
      setMeter(bar(s.c / 100, 'Walt\'s comfort'));
      return s.c <= 0 ? d.failText : false;
    },
    end(s) { s.off.forEach(f => f()); },
  },
  dropoff: { start(s, d, m) { const p = m.h[d.as]; if (p && p.riding) unboard(p); } },
  pursuers: {
    start(s, d, m) {
      const f = ctx.focusPos(), P = ctx.player, car = P.inCar;
      const hx = car && car.vel.length() > 2 ? car.vel.x / car.vel.length() : Math.sin(P.rotY), hz = car && car.vel.length() > 2 ? car.vel.y / car.vel.length() : Math.cos(P.rotY);
      s.list = [];
      for (let i = 0; i < (d.n || 1); i++) {
        const ne = ctx.nearestEdge(f.x - hx * (120 + i * 25), f.z - hz * (120 + i * 25), 120, e => e.t <= 5) || ctx.randomEdgeNear(f.x, f.z, 90, 160, e => e.t <= 5);
        if (!ne) continue;
        const v = spawnVehicle('suv', 'suv', ne.x, ne.z, Math.atan2(f.x - ne.x, f.z - ne.z), 0x1c1c1e);
        Object.assign(v, { driver: 'thug', ai: rammerAI, storyAI: true, armed: !!d.armed, crew: d.crew || 2, health: 140 });
        v.spec.vmax = 50; v.spec.acc = 14; s.list.push(v);
      }
      m.h[d.as] = s.list; s.farT = 0; setObjective(d.text);
      ctx.notify('Black SUV behind you!', 'red', 2500);
    },
    update(s, d, m, dt) {
      const f = ctx.focusPos(), threats = [];
      for (const v of s.list) {
        if (!v.dead && !v.removed && v.health > 25 && v.ai) threats.push(v.pos);
        for (const p of v.thugs || []) if (!p.removed && p.state !== 'dead' && !p.out) threats.push(p.pos);
      }
      m.targets = threats; aimAt(m, null);
      if (!threats.length) return true;
      const near = Math.min(...threats.map(t => hyp(t.x - f.x, t.z - f.z)));
      s.farT = near > (d.shake || 250) ? s.farT + dt : 0;
      setMeter(s.farT > 0 ? `<b>${fmtT((d.shakeT || 8) - s.farT)}</b>Shaking them…` : `<b>${Math.round(near)} m</b>Lose them or wreck them`);
      return s.farT > (d.shakeT || 8);
    },
    end(s) { for (const v of s.list) { if (v.ai === rammerAI) { v.ai = null; v.driver = null; } for (const p of v.thugs || []) if (p.state !== 'dead') { p.ai = null; p.state = 'walk'; p.agent = null; p.keep = false; } } },
  },
  // ---------------------------------------------------------------- the darker steps (storylines II-IV and Espola Road's back half)
  heat: { start(s, d) { setWanted(d.n, 'story', { seen: true }); if (d.text) setObjective(d.text); } },
  give: { start(s, d) { const P = ctx.player, w = ctx.WEAPONS.find(x => x.id === d.weapon); if (!w) return; P.arsenal[w.id] = Math.max(P.arsenal[w.id] | 0, d.ammo || w.give || 10); ctx.notify(`Got: <b>${w.name}</b>`, 'green', 3000); ctx.sfx.cash(); } },
  unlock: { start(s, d) { const st = ensureSave(); if (!st.unlocks.includes(d.key)) { st.unlocks.push(d.key); ctx.unlockTravel && ctx.unlockTravel(d.key); } } },
  prop: { // quest-only objects: ramps. keep: stays in the world for good once the mission passes
    start(s, d, m) {
      const pt = place(d.at, m); let x = pt.x + (d.dx || 0), z = pt.z + (d.dz || 0), rot = d.rot || 0;
      if (d.road) { const ne = ctx.nearestEdge(x, z, 400, () => true); if (ne) { x = ne.x; z = ne.z; rot = Math.atan2(ne.tx, ne.tz); const a = ctx.heightAt(x + ne.tx * 20, z + ne.tz * 20), b = ctx.heightAt(x - ne.tx * 20, z - ne.tz * 20); if (a > b) rot += Math.PI; } } // face downhill
      const r = ctx.addRamp(x, z, rot, d); m.props.push({ r, d }); m.h[d.as] = { pos: { x: x + Math.sin(rot) * (d.len || 16), z: z + Math.cos(rot) * (d.len || 16) }, ramp: r };
    },
  },
  jump: { // launch off a ramp and stay airborne
    start(s, d) { setObjective(d.text); s.air = 0; s.best = 0; },
    update(s, d, m, dt) {
      const P = ctx.player, car = P.inCar, R = m.h[d.ramp]; if (!R) return true;
      aimAt(m, R.pos, 'beam');
      if (!car) { setObjective('Get in a <em>car</em>.'); s.air = 0; return false; }
      setObjective(d.text);
      const near = hyp(car.pos.x - R.pos.x, car.pos.z - R.pos.z) < 60;
      if (car.air && (near || s.air > 0)) { s.air += dt; s.best = Math.max(s.best, s.air); setMeter(`<b>${s.air.toFixed(1)} s</b>airborne`); }
      else if (s.air > 0) { const ok = s.air >= (d.air || 1.4); s.air = 0; if (ok) { ctx.big('AIRBORNE', `${s.best.toFixed(1)} seconds`, 'pass', 2); return true; } }
      if (car.dead) return 'You wrecked the car.';
      return false;
    },
  },
  kill: { // a target (with guards); spooked, they run, on foot or for their car. Dead = done.
    start(s, d, m) {
      const c = place(d.at, m), look = d.who ? { ...(CAST[d.who].look || {}), avatar: CAST_SKINS[d.who], kind: 'civ', gun: !!d.armed } : { ...pick(LOOKS.thug), gun: !!d.armed };
      const p = makePed(look, c.x, c.z, { ai: null, hp: d.hp || 160, who: d.who || null, voice: d.who ? CAST[d.who].voice : 1 }); ctx.collideCircle(p.pos, 0.35);
      Object.assign(p, { ai: targetAI, runSpeed: d.speed || 6.2, seedA: rand(0, 10), spookR: d.spook || 35, invuln: false, onHurt: function () { this.spooked = true; } });
      if (d.flee === 'car') { const q = curbAt(c, PLACES[d.at] && PLACES[d.at].names); const v = spawnVehicle(d.car || 'sports', d.model, q.x, q.z, q.rot, d.tint); v.parked = true; p.car = v; m.h[d.as + 'Car'] = v; }
      p.fleeTo = d.to ? place(d.to, m) : null;
      s.guards = []; for (let i = 0; i < (d.guards || 0); i++) { const a = rand(0, TAU), r = rand(3, 9), g = makePed(pick(LOOKS.thug), c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, { ai: hostileAI, money: 40 }); ctx.collideCircle(g.pos, 0.35); g.onHurt = hostileHurt; g.aggroR = d.aggro || 32; s.guards.push(g); }
      s.p = p; s.farT = 0; m.h[d.as] = p; m.h[d.as + 'Guards'] = s.guards; setObjective(d.text);
    },
    update(s, d, m, dt) {
      const p = s.p, f = ctx.focusPos();
      if (p.riding && p.riding.dead) { ctx.killPed ? ctx.killPed(p, 'player') : (p.state = 'dead'); }
      if (p.riding && !p.riding.dead && p.riding.health < 30) { const car = p.riding; unboard(p); p.ai = targetAI; p.spooked = true; p.car = null; car.ai = null; car.driver = null; }
      if (p.state === 'dead' || p.health <= 0) return true;
      const pos = p.riding ? p.riding.pos : p.pos; aimAt(m, pos, 'arrow'); m.arrowH = p.riding ? 3.6 : 2.6;
      m.targets = s.guards.filter(g => !g.removed && g.state !== 'dead' && !g.out).map(g => g.pos);
      const dd = hyp(pos.x - f.x, pos.z - f.z); s.farT = dd > (d.escape || 420) ? s.farT + dt : 0;
      setMeter(p.riding ? `<b>${Math.round(dd)} m</b>They're driving. Wreck the car.` : p.spooked ? `<b>${Math.round(dd)} m</b>Don't let them get away` : '');
      if (s.farT > 6) return d.escapeText || 'The target got away.';
      return false;
    },
  },
  carjack: { // a particular car, driving in traffic: take it
    start(s, d, m) {
      const pt = place(d.near || d.at, m), q = laneAt(pt, d.ahead || 0, ctx.focusPos()), v = spawnVehicle(d.type || 'sedan', d.model, q.x, q.z, q.rot, d.tint);
      v.driver = 'ai'; const far = place(d.to || 'home', m); route(v, far); v.carjackTarget = true; m.h[d.as] = v; setObjective(d.text);
      if (d.protect) m.watch.push(() => (v.dead || v.removed) ? d.protect : null);
    },
    update(s, d, m) { const v = m.h[d.as]; if (!v || v.dead) return 'The car was destroyed.'; aimAt(m, v.pos, 'arrow'); m.arrowH = 3.4; if (v.driver === 'ai' && v.mode === 'rail' && !v.agent.route) route(v, place(d.to || 'home', m)); return ctx.player.inCar === v; },
  },
  bomb: { // walk up to a car (or a spot) and plant a charge: stand still next to it for a moment
    start(s, d, m) { s.t = 0; s.i = 0; s.list = d.site ? [{ site: place(d.site, m) }] : d.cars ? d.cars.map(k => m.h[k]).filter(Boolean) : [].concat(m.h[d.car]); setObjective(d.text); },
    update(s, d, m, dt) {
      const P = ctx.player, tgt = s.list[s.i]; if (!tgt) return true;
      const pos = tgt.site || tgt.pos; if (!tgt.site && (tgt.dead || tgt.removed)) { s.i++; return false; }
      aimAt(m, pos, tgt.site ? 'beam' : 'arrow'); m.arrowH = 2.6;
      const dd = hyp(P.pos.x - pos.x, P.pos.z - pos.z), close = !P.inCar && dd < (tgt.site ? 2.5 : (tgt.spec ? tgt.spec.L / 2 + 1.2 : 2.5));
      if (P.inCar) setObjective('Get out to plant it.'); else setObjective(d.text + (s.list.length > 1 ? ` (${s.i + 1}/${s.list.length})` : ''));
      s.t = close ? s.t + dt : Math.max(0, s.t - dt * 2); setMeter(close ? bar(s.t / 1.6, 'Planting…') : '');
      if (s.t >= 1.6) {
        const THREE = ctx.THREE, b = new THREE.Mesh(ctx.boxG(0.22, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2020, emissiveIntensity: 0.9 }));
        if (tgt.site) { b.position.set(pos.x, ctx.heightAt(pos.x, pos.z) + 0.1, pos.z); ctx.scene.add(b); m.charges.push({ mesh: b, x: pos.x, z: pos.z, site: true }); }
        else { b.position.set(0, -0.35, 0); tgt.m.add(b); m.charges.push({ mesh: b, car: tgt }); }
        ctx.tone(1400, 0.08, 'square', 0.12); s.i++; s.t = 0;
      }
      return s.i >= s.list.length;
    },
  },
  detonate: { // G sets them all off, once you're clear (and, for a hit, once the mark is in the car)
    start(s, d) { setObjective(d.text); },
    update(s, d, m) {
      const f = ctx.focusPos(), w = d.mark ? m.h[d.mark] : null, ch = m.charges;
      if (!ch.length) return true;
      const near = Math.min(...ch.map(c => { const p = c.car ? c.car.pos : c; return hyp(p.x - f.x, p.z - f.z); }));
      aimAt(m, ch[0].car ? ch[0].car.pos : ch[0], 'arrow');
      if (w && !w.riding) { setObjective(d.waitText || 'Wait for the mark to get in the car.'); return false; }
      if (near < (d.clear || 25)) { setObjective(`Get clear: <em>${Math.round((d.clear || 25) - near)} m</em> more, then press <em>G</em>.`); return false; }
      setObjective(d.text);
      if (!ctx.keys.has('KeyG')) return false;
      for (const c of ch) { const p = c.car ? c.car.pos : c; ctx.explosionAt(p.x, (p.y ?? ctx.heightAt(p.x, p.z)) + 0.8, p.z, c.site ? (d.R || 14) : 9, 'player'); if (c.car) ctx.damageCar(c.car, 999, 'player', true); c.mesh.parent && c.mesh.parent.remove(c.mesh); }
      if (w && w.riding) ctx.killPed ? ctx.killPed(w, 'player') : (w.state = 'dead');
      m.charges.length = 0; return true;
    },
  },
  chase: { // the car runs for it; stop it (wreck it or shoot it to bits) before it gets where it's going
    start(s, d, m) { const v = m.h[d.car]; s.dest = place(d.to, m); s.farT = 0; Object.assign(v, { driver: 'thug', ai: fleeAI, storyAI: true, dest: s.dest, parked: false, mode: 'free', agent: null }); v.spec.vmax = d.vmax || 46; setObjective(d.text); },
    update(s, d, m, dt) {
      const v = m.h[d.car], f = ctx.focusPos(); if (!v || v.removed) return true;
      if (v.dead || v.health < (d.stopAt || 25)) { v.ai = null; v.driver = null; return true; }
      aimAt(m, v.pos, 'arrow'); m.arrowH = 3.6; const dd = hyp(v.pos.x - f.x, v.pos.z - f.z);
      s.farT = dd > (d.lose || 380) ? s.farT + dt : 0; setMeter(`<b>${Math.round(dd)} m</b>${bar(v.health / 140, '')}`);
      if (hyp(v.pos.x - s.dest.x, v.pos.z - s.dest.z) < 30) return d.failText || 'They made it.';
      return s.farT > 7 ? (d.lostText || 'You lost them.') : false;
    },
  },
  destroy: { // every vehicle under a handle wrecked
    start(s, d) { setObjective(d.text); },
    update(s, d, m) { const list = [].concat(m.h[d.as]).filter(Boolean), left = list.filter(v => !v.dead && !v.removed); m.targets = left.map(v => v.pos); setMeter(`<b>${left.length}</b>left`); if (left.length === 1) aimAt(m, left[0].pos, 'arrow'); return !left.length; },
  },
  convoy: { // n cars driving a route; `as` holds them (for destroy / chase)
    start(s, d, m) {
      const a = place(d.from, m), b = place(d.to, m), list = [];
      for (let i = 0; i < d.n; i++) { const q = laneAt(a, i * 14, b), v = spawnVehicle(d.type || 'suv', d.model, q.x, q.z, q.rot, d.tint ?? 0x1c1c1e); v.health = d.hp || 160; route(v, b); v.armed = !!d.armed; list.push(v); }
      m.h[d.as] = list;
    },
  },
  defend: { // hold a spot for t seconds while waves come at you
    start(s, d, m) { s.c = place(d.at, m); s.left = d.t; s.wave = 0; s.next = 1; s.out = 0; s.list = []; setObjective(d.text); },
    update(s, d, m, dt) {
      const f = ctx.focusPos(), dd = hyp(f.x - s.c.x, f.z - s.c.z); s.left -= dt; s.next -= dt;
      if (s.next <= 0 && s.left > 6) {
        s.next = d.every || 20; s.wave++;
        for (let i = 0; i < (d.n || 4) + s.wave; i++) { const a = rand(0, TAU), r = rand(40, 60), p = makePed(pick(LOOKS.thug), s.c.x + Math.cos(a) * r, s.c.z + Math.sin(a) * r, { ai: hostileAI, money: 30 }); ctx.collideCircle(p.pos, 0.35); p.onHurt = hostileHurt; p.aggro = true; p.aggroR = 90; s.list.push(p); }
        ctx.notify(`<b>Wave ${s.wave}</b>`, 'red', 1500);
      }
      const alive = s.list.filter(p => !p.removed && p.state !== 'dead' && !p.out); m.targets = alive.map(p => p.pos); aimAt(m, s.c, 'beam');
      s.out = dd > (d.r || 35) ? s.out + dt : 0; if (s.out > 8) return 'You abandoned your post.';
      setMeter(`<b>${fmtT(Math.max(0, s.left))}</b>${s.out ? '<span style="color:var(--blood)">Get back!</span>' : `hold · ${alive.length} hostiles`}`);
      return s.left <= 0;
    },
    end(s) { for (const p of s.list) if (!p.removed && p.state !== 'dead') { p.ai = null; p.state = 'walk'; p.agent = null; p.keep = false; } },
  },
  sneak: { // get to a spot past guards without being seen for long
    start(s, d, m) {
      const c = place(d.at, m); s.goal = { x: c.x + (d.dx || 0), z: c.z + (d.dz || 0) }; s.list = []; s.seen = 0;
      for (let i = 0; i < (d.guards || 3); i++) { const a = rand(0, TAU), r = rand(8, 20), p = makePed({ ...pick(LOOKS.thug), gun: true }, s.goal.x + Math.cos(a) * r, s.goal.z + Math.sin(a) * r, { ai: guardAI, money: 30 }); ctx.collideCircle(p.pos, 0.35); p.rotY = rand(0, TAU); p.onHurt = hostileHurt; s.list.push(p); }
      m.h[d.as || 'guards'] = s.list; setObjective(d.text);
    },
    update(s, d, m, dt) {
      const f = ctx.focusPos(), P = ctx.player; let spot = false;
      for (const g of s.list) {
        if (g.removed || g.state === 'dead' || g.out) continue;
        const dx = f.x - g.pos.x, dz = f.z - g.pos.z, dd = Math.hypot(dx, dz), cone = (dx * Math.sin(g.rotY) + dz * Math.cos(g.rotY)) / (dd || 1);
        const range = P.crouch ? 13 : P.inCar ? 40 : 24;
        if (g.aggro || (dd < range && cone > 0.55 && ctx.los(g.pos.x, g.pos.y + 1.6, g.pos.z, f.x, f.y + 1.2, f.z)) || dd < 3.5) spot = true;
      }
      s.seen = spot ? s.seen + dt : Math.max(0, s.seen - dt * 0.5);
      setMeter(s.seen > 0 ? bar(1 - s.seen / 1.2, 'Spotted…') : 'Unseen · crouch (C) to stay low');
      if (s.seen > 1.2) { if (d.alarm) { for (const g of s.list) { g.ai = hostileAI; g.aggro = true; } ctx.notify('<b>They saw you.</b>', 'red', 2000); s.list.length = 0; return d.alarm === 'fight' ? false : true; } return d.failText || 'You were spotted.'; }
      aimAt(m, s.goal, 'beam'); return hyp(f.x - s.goal.x, f.z - s.goal.z) < (d.r || 3);
    },
  },
  hold: { // stay at a spot for t seconds (a photo, a download, a lock to pick)
    start(s, d, m) { s.c = place(d.at, m); s.t = 0; setObjective(d.text); },
    update(s, d, m, dt) { const f = ctx.focusPos(), ok = hyp(f.x - s.c.x, f.z - s.c.z) < (d.r || 6) && (!d.foot || !ctx.player.inCar); s.t = ok ? s.t + dt : Math.max(0, s.t - dt); aimAt(m, s.c, 'beam'); setMeter(bar(s.t / d.t, d.label || 'Hold position')); return s.t >= d.t; },
  },
  timebomb: { // reach it and defuse it (stand on it 3 s) before the clock runs out
    start(s, d, m) { s.c = place(d.at, m); s.left = d.t; s.k = 0; setObjective(d.text); },
    update(s, d, m, dt) {
      s.left -= dt; const f = ctx.focusPos(), on = hyp(f.x - s.c.x, f.z - s.c.z) < 3 && !ctx.player.inCar; s.k = on ? s.k + dt : 0; aimAt(m, s.c, 'beam');
      if (s.left <= 0) { ctx.explosionAt(s.c.x, ctx.heightAt(s.c.x, s.c.z) + 1, s.c.z, 16, 'chain'); return 'It went off.'; }
      if (Math.floor(s.left) !== s.beep) { s.beep = Math.floor(s.left); ctx.tone(s.left < 10 ? 1500 : 1100, 0.06, 'square', 0.1); }
      setMeter(on ? bar(s.k / 3, 'Defusing…') : `<b>${fmtT(s.left)}</b>until it blows`); return s.k >= 3;
    },
  },
  turn: { // somebody you trusted pulls a gun
    start(s, d, m) { for (const p of [].concat(m.h[d.as])) { if (!p) continue; if (S.pool.get(p.who) === p) S.pool.delete(p.who); Object.assign(p, { ai: hostileAI, invuln: false, aggro: true, aggroR: 90, onHurt: hostileHurt }); p.rig.gun.visible = true; if (ctx.equipGuns && p.rig.human) { ctx.equipGuns(p.rig); ctx.showGun(p.rig, 'pistol'); } } },
  },
  board: { start(s, d, m) { const p = m.h[d.as], v = m.h[d.car]; if (p && v) { board(p, v); v.parked = false; } } }, // put a story NPC into a car
  act: {
    start(s, d) { const st = ensureSave(); if (d.n) st.act = Math.max(st.act, d.n + 1); s.t = 5.5; ctx.big(d.big || `ACT ${['I', 'II', 'III', 'IV'][d.n - 1]} COMPLETE`, d.title, 'mission', 5); },
    update(s, d, m, dt) { return (s.t -= dt) <= 0; },
  },
};
function route(v, dest) {
  const r = v && routeEdges(v.pos.x, v.pos.z, dest.x, dest.z); if (!r) return false;
  v.mode = 'rail'; v.driver = 'ai'; v.parked = false; v.speed = v.vel.length();
  v.agent = { e: r.start.e, dir: r.start.dir, s: r.start.s, next: null, route: r.edges, ri: 0 };
  return true;
}

// ------------------------------------------------------------------ mission flow
function available(def) {
  const st = ensureSave();
  if (def.needs && !def.needs.every(id => st.done.includes(id))) return false;
  if (st.done.includes(def.id) && !def.repeat) return false;
  if (def.repeat && st.last[def.id] && (Date.now() - st.last[def.id]) / 1000 < def.repeat) return false;
  return true;
}
function promptFor(def) {
  const c = CAST[def.giver];
  if (police.wanted) return 'Lose the Sheriff first';
  if (def.when && !def.when(ctx)) return def.whenText;
  if (def.type === 'trial') { const b = ensureSave().best[def.id]; return `Start <b>${def.title}</b>${b ? ` · best ${fmtT(b)}` : ''}`; }
  return `Talk to <b>${c.name}</b> · ${def.title}`;
}
function tryStart(def) {
  const P = ctx.player;
  if (S.m || P.dead) return;
  if (police.wanted) { ctx.notify('Lose the Sheriff first.', 'blue', 2500); return; }
  if (ctx.job) { ctx.notify('Finish your courier job first (J cancels it).', '', 3000); return; }
  if (def.when && !def.when(ctx)) { ctx.notify(def.whenText, '', 3000); return; }
  if (def.type === 'trial' && !P.inCar) { ctx.notify('You need a car for a time trial.', '', 2500); return; }
  startMission(def);
}
function startMission(def) {
  const st = ensureSave();
  S.m = { def, si: 0, st: null, h: {}, flags: {}, watch: [], target: null, targetKind: 'beam', targets: [], t: 0, props: [], charges: [] };
  const g = CAST[def.giver] ? S.pool.get(def.giver) : null; if (g && !g.removed) S.m.h[def.giver] = g;
  if (CAST[def.giver] && !st.met.includes(def.giver)) st.met.push(def.giver);
  ctx.clearWaypoint(true);
  const who = CAST[def.giver] ? CAST[def.giver].full : 'Time trial', L = LINES[def.line || 'reyes'], line = MISSIONS.filter(d => (d.line || 'reyes') === (def.line || 'reyes') && d.type === 'main');
  ctx.big(def.title.toUpperCase(), def.type === 'main' ? `${L.name} · ${line.indexOf(def) + 1} of ${line.length} · ${who}` : def.type === 'trial' ? 'Time trial' : `Side job · ${who}`, 'mission', 3.5);
  emit('mission:start', { id: def.id });
  for (const [, gv] of S.givers) removeInteract(gv.it); S.givers.clear();
}
function trialReward(m, def) {
  const s = m.race, st = ensureSave(), prev = st.best[def.id], newBest = s && s.final && (!prev || s.final < prev);
  if (newBest) st.best[def.id] = s.final;
  const beat = s && s.final <= s.par;
  return { money: beat ? def.reward.money + (newBest && prev ? 100 : 0) : 50, rep: 0, note: `${fmtT(s.final)} · par ${fmtT(s.par)}${newBest ? ' · new best' : ''}` };
}
function pass() {
  const m = S.m, def = m.def, st = ensureSave(), save = ctx.save;
  let rw = def.type === 'trial' ? trialReward(m, def) : (m.flags.lethal && def.lethalReward) || def.reward;
  if (m.race && def.type !== 'trial') { const prev = st.best[def.id]; if (!prev || m.race.final < prev) st.best[def.id] = m.race.final; }
  save.money += rw.money || 0; save.rep += rw.rep || 0;
  for (const [k, v] of Object.entries(rw.trust || {})) st.trust[k] = clamp((st.trust[k] || 0) + v, -100, 100);
  if (!st.done.includes(def.id)) st.done.push(def.id);
  st.last[def.id] = Date.now();
  const title = def.type === 'trial' ? 'TIME TRIAL COMPLETE' : 'MISSION PASSED';
  if (def.steps[def.steps.length - 1].do !== 'act') ctx.big(title, `+$${rw.money}${rw.note ? ' · ' + rw.note : ''}`, 'pass', 4);
  else ctx.notify(`<b>${title}</b> · +$${rw.money}`, 'green', 6000);
  ctx.sfx.job();
  for (const a of def.after || []) later(a.t, () => text(a.text[0], a.text[1]));
  emit('mission:pass', { id: def.id });
  m.passed = true; endMission(); ctx.persist();
}
function fail(reason, quiet) {
  const def = S.m.def;
  if (!quiet) { ctx.big('MISSION FAILED', reason, 'wasted', 4); ctx.tone(220, 0.6, 'sawtooth', 0.15, 110); }
  emit('mission:fail', { id: def.id, reason });
  endMission();
}
function endMission() {
  const m = S.m; if (!m) return;
  for (const c of m.charges) if (c.mesh.parent) c.mesh.parent.remove(c.mesh);
  for (const { r, d } of m.props) { if (m.passed && d.keep) { const st = ensureSave(); if (!st.props.some(q => q.id === d.keep)) st.props.push({ id: d.keep, x: r.x, z: r.z, rot: r.rot, len: r.len, wid: r.wid, h: r.h }); } else r.remove(); }
  const d = m.def.steps[m.si]; if (m.st && d && STEPS[d.do].end) STEPS[d.do].end(m.st, d, m);
  const P = ctx.player, f = ctx.focusPos();
  for (const h of Object.values(m.h)) for (const e of [].concat(h)) {
    if (!e || e.removed) continue;
    const far = hyp(e.pos.x - f.x, e.pos.z - f.z) > 100;
    if (e instanceof ctx.Vehicle) {
      e.keep = false; e.mission = false; if (e.storyAI) { e.ai = null; if (e.driver === 'thug') e.driver = null; }
      if (e !== P.inCar && far && !e.tommy) e.remove();
    } else {
      if (e.riding) unboard(e);
      if (S.pool.get(e.who) === e) { e.ai = npcIdle; e.state = e.state === 'dead' ? 'dead' : 'ai'; continue; }
      if (e.state === 'dead') { e.keep = false; continue; }
      if (far) e.remove(); else Object.assign(e, { ai: null, invuln: false, keep: false, state: 'walk', agent: null });
    }
  }
  S.m = null; sub.clear(); setObjective(''); setMeter(''); updateMarkers(); S.giverT = 0;
}
export function abandonMission() { if (S.m) fail('Abandoned.', false); }
export function storyBusy() { return !!S.m; }
export function storySkip() { return !!S.m && sub.skip(); }
export function storyTarget() { const m = S.m; return m && m.target && m.targetKind !== 'none' ? m.target : m && m.target || null; }

// ------------------------------------------------------------------ givers
function updateGivers() {
  const f = ctx.focusPos(), want = new Map();
  if (!S.m) for (const def of MISSIONS) if (available(def)) { const key = def.giver + '@' + def.at; if (!want.has(key)) want.set(key, def); }
  for (const [key, def] of want) {
    let g = S.givers.get(key);
    const pt = place(def.at);
    if (!g) { g = { key, def, pt }; g.it = addInteract({ x: pt.x, z: pt.z, r: def.type === 'trial' ? 10 : 4.5, label: () => promptFor(g.def), onUse: () => tryStart(g.def) }); S.givers.set(key, g); }
    g.def = def;
    if (CAST[def.giver]) {
      let p = S.pool.get(def.giver);
      if ((!p || p.removed || p.state === 'dead') && hyp(f.x - pt.x, f.z - pt.z) < 150) p = castPed(def.giver, pt);
      if (p && !p.removed) { g.it.x = p.pos.x; g.it.z = p.pos.z; p.setMarker(letterMat(def.giver)); }
    }
  }
  for (const [key, g] of S.givers) if (!want.has(key)) { removeInteract(g.it); S.givers.delete(key); }
  for (const [who, p] of S.pool) {
    const busy = S.m && Object.values(S.m.h).includes(p);
    if (p.removed || p.state === 'dead') { S.pool.delete(who); continue; }
    if (!busy && hyp(p.pos.x - f.x, p.pos.z - f.z) > 230) { p.remove(); S.pool.delete(who); continue; }
    if (busy || ![...want.values()].some(d => d.giver === who)) p.setMarker(null);
  }
}

// ------------------------------------------------------------------ public API
export function initStory() {
  const st = ensureSave();
  for (const q of st.props) ctx.addRamp(q.x, q.z, q.rot, q); // ramps you built along the way stay where they are
  if (ctx.ensureAvatar) for (const n of Object.values(CAST_SKINS)) ctx.ensureAvatar(n); // load the cast's own skins in the background
  on('player:died', ({ kind }) => { if (S.m) { S.failPending = kind === 'busted' ? 'You got busted.' : 'You got wasted.'; fail(S.failPending, true); } });
  on('player:respawn', () => { if (S.failPending) { const r = S.failPending; S.failPending = null; later(0.6, () => { ctx.big('MISSION FAILED', r, 'wasted', 3.5); }); } });
}
export function updateStory(dt) {
  if (!S.started) {
    S.started = true;
    if (!ensureSave().done.includes('a1-homecoming')) later(9, () => text('rosa', 'Mijo, I\'m out front. Come say hello to your mother. (Look for <b>R</b> on your map.)'));
  }
  for (let i = S.later.length - 1; i >= 0; i--) if (ctx.simTime >= S.later[i].t) { const l = S.later.splice(i, 1)[0]; l.fn(); }
  S.giverT -= dt; if (S.giverT <= 0) { S.giverT = 0.5; updateGivers(); }
  sub.update(dt);
  const m = S.m;
  if (m && !ctx.player.dead) {
    m.t += dt;
    for (const w of m.watch) { const r = w(); if (r) { fail(r); return; } }
    for (let guard = 0; guard < 10 && S.m === m; guard++) { // instant steps chain within one frame
      const d = m.def.steps[m.si];
      if (!d) { pass(); break; }
      const H = STEPS[d.do];
      if (!m.st) {
        if (d.if && !COND[d.if]()) { m.si++; continue; }
        m.st = {}; m.target = null; m.targets = []; setObjective(''); setMeter('');
        if (H.start) H.start(m.st, d, m);
      }
      const r = H.update ? H.update.call(H, m.st, d, m, dt) : true;
      if (r === true) { if (H.end) H.end(m.st, d, m); m.st = null; m.si++; dt = 0; continue; }
      if (typeof r === 'string') { if (H.end) H.end(m.st, d, m); m.st = null; fail(r); }
      break;
    }
  }
  for (const p of S.pool.values()) if (p.riding) p.pos.copy(p.riding.pos);
  updateMarkers();
}
// Blips for the minimap / big map.
export function storyMapMarks() {
  const out = [], m = S.m;
  if (m) {
    if (m.target) out.push({ x: m.target.x, z: m.target.z, color: '#f0b23a', size: 6, edge: true, label: m.def.title });
    for (const t of m.targets) out.push({ x: t.x, z: t.z, color: '#d4302f', size: 4, edge: false });
    return out;
  }
  const seen = new Set();
  for (const def of MISSIONS) {
    if (!available(def)) continue; const key = def.giver + '@' + def.at; if (seen.has(key)) continue; seen.add(key);
    const pt = place(def.at), c = CAST[def.giver];
    out.push({ x: pt.x, z: pt.z, color: c ? c.color : '#f3ede1', letter: c ? c.letter : 'T', size: 7, edge: def.type === 'main', label: (c ? c.name + ': ' : 'Time trial: ') + def.title });
  }
  return out;
}
// HTML for the pause menu.
export function storyJournal() {
  const st = ensureSave(), main = MISSIONS.filter(d => d.type === 'main'), esc = s => s.replace(/</g, '&lt;');
  let h = '<h3>Storylines</h3>';
  for (const [id, L] of Object.entries(LINES)) { // each thread: progress, or a locked teaser until its first job opens
    const list = main.filter(d => (d.line || 'reyes') === id), done = list.filter(d => st.done.includes(d.id)).length, open = done || list.some(available);
    h += open ? `<p><span class="who" style="background:${L.color}"></span><b>${L.name}</b> · ${done}/${list.length}${done === list.length ? ' · complete' : ''}. ${esc(L.blurb)}</p>` : `<p style="opacity:.55">🔒 <b>${L.name}</b> · ${esc(L.blurb)}</p>`;
  }
  h += `<p>${st.done.filter(id => !main.some(d => d.id === id)).length} side jobs and trials done</p>`;
  if (S.m) h += `<p>On a job: <b>${S.m.def.title}</b>${objHtml ? ' · ' + objHtml : ''}</p>`;
  const avail = S.m ? [] : MISSIONS.filter(available);
  if (avail.length) h += '<h3>Open jobs</h3>' + avail.map(d => { const c = CAST[d.giver]; return `<p><span class="who" style="background:${c ? c.color : '#f3ede1'}"></span><b>${d.title}</b> · ${c ? c.name : 'time trial'} · ${esc(PLACES[d.at].note)}. ${esc(d.pitch)}</p>`; }).join('');
  const best = Object.entries(st.best); if (best.length) h += '<h3>Best times</h3>' + best.map(([id, t]) => `<p>${(MISSIONS.find(d => d.id === id) || { title: id }).title}: <b>${fmtT(t)}</b></p>`).join('');
  h += '<h3>People</h3>' + st.met.filter(w => CAST[w]).map(w => `<p><span class="who" style="background:${CAST[w].color}"></span><b>${CAST[w].full}</b> · ${esc(CAST[w].bio)}${st.trust[w] !== undefined ? ` <i>Trust ${st.trust[w]}</i>` : ''}</p>`).join('');
  if (st.voicemails.length) h += '<h3>Tommy\'s voicemails</h3>' + st.voicemails.map(id => `<p><b>${id}</b> · "${(st.vmText && st.vmText[id] || []).join(' ')}"</p>`).join('');
  return h;
}
// Debug: jump the story (window.__gtp.story).
export const storyDebug = {
  get state() { return S; }, missions: MISSIONS, place, start: id => { const d = MISSIONS.find(x => x.id === id); if (d && !S.m) startMission(d); return !!d; },
  complete: id => { const st = ensureSave(); if (!st.done.includes(id)) st.done.push(id); }, abandon: () => abandonMission(),
  step: () => S.m && { mission: S.m.def.id, step: S.m.si, do: (S.m.def.steps[S.m.si] || {}).do },
  skipStep: () => { const m = S.m; if (!m) return; const d = m.def.steps[m.si]; if (m.st && STEPS[d.do].end) STEPS[d.do].end(m.st, d, m); m.st = null; m.si++; },
};
