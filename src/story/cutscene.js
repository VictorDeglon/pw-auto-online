// Cutscenes: the camera, the letterbox, the fades, and scripted cars that drive exactly where a scene wants them.
// A scene is a list of beats; each beat has a camera (a function of time), optional dialogue (it waits for the
// lines), and hooks that move the actors. Cars in a scene are kinematic: they follow a road path at a scripted speed
// (v.ai = the scene's driver for that car), so a chase plays the same way every time. Input is held while one plays;
// E skips a line, Space skips the scene (to the same end state).
//   CINE.camera(camera, dt)   index.html's updateCamera asks this first; true = a cutscene placed the camera
//   playCutscene(id, m, H)    from the 'cutscene' mission step; resolves when it's over
//   updateCutscene(dt)        every frame (story update)
//   SCENES[id].stage(m, H)    put the actors in place before the scene starts (the 'stage' step)
import { ctx } from '../ctx.js';
import { routeEdges } from '../drive.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrapA = a => { a = ((a + Math.PI) % TAU + TAU) % TAU; return a - Math.PI; };

const CSS = `
body.cine .hud:not(#subs):not(#big), body.cine #beacons, body.cine #prompt{visibility:hidden !important}
#cinebars{position:fixed;inset:0;pointer-events:none;z-index:6}
#cinebars::before,#cinebars::after{content:'';position:absolute;left:0;right:0;height:0;background:#000;transition:height .7s ease}
#cinebars::before{top:0} #cinebars::after{bottom:0}
body.cine #cinebars::before,body.cine #cinebars::after{height:10.5vh}
#cinefade{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:7;transition:opacity .55s ease}
#cinecard{position:fixed;left:6vw;bottom:calc(10.5vh + 22px);z-index:7;pointer-events:none;color:#f3ede1;opacity:0;transition:opacity .9s ease;
  font:400 clamp(22px,2.6vw,34px)/1.05 var(--display,Anton,Impact,sans-serif);letter-spacing:.08em;text-shadow:0 2px 10px rgba(0,0,0,.8)}
#cinecard small{display:block;font:600 15px/1.3 var(--ui,Arial);letter-spacing:.24em;color:rgba(243,237,225,.7)}
#cineskip{position:fixed;right:24px;bottom:calc(10.5vh + 14px);z-index:7;pointer-events:none;color:rgba(243,237,225,.55);font:600 13px/1 var(--ui,Arial);letter-spacing:.14em;opacity:0;transition:opacity .6s}
body.cine #cineskip{opacity:1}
#cineskip kbd{font:inherit;border:1px solid rgba(243,237,225,.45);border-radius:4px;padding:2px 6px;margin:0 2px}
#cinetitle{position:fixed;inset:0;z-index:8;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;opacity:0;transition:opacity .6s ease;color:#f3ede1;text-align:center}
#cinetitle b{font:400 clamp(40px,7vw,92px)/1 var(--display,Anton,Impact,sans-serif);letter-spacing:.06em}
#cinetitle span{font:600 16px/1.2 var(--ui,Arial);letter-spacing:.3em;color:rgba(243,237,225,.65);text-transform:uppercase}`;

const C = { active: false, scene: null, beats: null, i: -1, t: 0, s: null, m: null, H: null, cam: null, resolve: null, skip: false, fov: 50, el: null };
let ui = null;
function ensureUI() {
  if (ui) return ui;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const bars = document.createElement('div'); bars.id = 'cinebars';
  const fade = document.createElement('div'); fade.id = 'cinefade';
  const card = document.createElement('div'); card.id = 'cinecard';
  const skip = document.createElement('div'); skip.id = 'cineskip'; skip.innerHTML = '<kbd>E</kbd> next line · <kbd>SPACE</kbd> skip';
  const title = document.createElement('div'); title.id = 'cinetitle';
  document.body.append(bars, fade, card, skip, title);
  // while a scene plays the game doesn't get the keys or the mouse (Esc still pauses)
  const block = e => {
    if (!C.active || e.metaKey || e.ctrlKey) return; // browser shortcuts still work
    if (e.type === 'keydown') {
      if (e.code === 'Escape') return;
      if (e.code === 'Space' || e.code === 'Enter') C.skip = true;
      else if (e.code === 'KeyE' && C.H) C.H.skipLine();
    }
    if (e.type === 'keyup' && e.code === 'Escape') return;
    e.stopImmediatePropagation(); if (e.type !== 'keyup') e.preventDefault();
  };
  for (const t of ['keydown', 'keyup', 'mousedown', 'mouseup', 'wheel', 'contextmenu']) addEventListener(t, block, { capture: true, passive: false });
  ui = { fade, card, title };
  return ui;
}
// a title over black ("FOUR DAYS LATER"); null fades back to the game
export function titleCard(title, sub) {
  const u = ensureUI();
  if (title) { u.title.innerHTML = `<b></b>${sub ? '<span></span>' : ''}`; u.title.firstChild.textContent = title; if (sub) u.title.lastChild.textContent = sub; fadeTo(1); u.title.style.opacity = '1'; }
  else { u.title.style.opacity = '0'; fadeTo(0); }
}
export function fadeTo(k) { ensureUI().fade.style.opacity = String(k); }
function card(html) { const c = ensureUI().card; if (html) { c.innerHTML = html; c.style.opacity = '1'; } else c.style.opacity = '0'; }

// ------------------------------------------------------------------ camera
const V3 = () => new ctx.THREE.Vector3();
export const CINE = {
  get active() { return C.active; }, get beat() { return C.active ? C.i : -1; },
  camera(camera, dt) {
    if (!C.active || !C.cam) return false;
    const c = C.cam;
    if (c.blend && C.prev) { const k = ease(c.blend); camera.position.set(lerp(C.prev.pos[0], c.pos[0], k), lerp(C.prev.pos[1], c.pos[1], k), lerp(C.prev.pos[2], c.pos[2], k)); camera.lookAt(lerp(C.prev.look[0], c.look[0], k), lerp(C.prev.look[1], c.look[1], k), lerp(C.prev.look[2], c.look[2], k)); }
    else { camera.position.set(c.pos[0], c.pos[1], c.pos[2]); camera.lookAt(c.look[0], c.look[1], c.look[2]); }
    const fov = c.fov || 50; if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    return true;
  },
};
// keep a camera spot out of the ground
function above(p, h = 1.2) { const g = ctx.heightAt(p[0], p[2]); if (p[1] < g + h) p[1] = g + h; return p; }

// ------------------------------------------------------------------ paths and kinematic cars
// A road path: arclength along a polyline, with the name of the street at each point.
function makePath(pts, names) {
  const n = pts.length / 2, cum = new Float32Array(n);
  for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]);
  const len = cum[n - 1];
  const raw = (s, o) => {
    s = clamp(s, 0, len); let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const L = cum[hi] - cum[lo] || 1, t = (s - cum[lo]) / L; o.x = lerp(pts[lo * 2], pts[hi * 2], t); o.z = lerp(pts[lo * 2 + 1], pts[hi * 2 + 1], t); o.k = lo; return o;
  };
  const A = { x: 0, z: 0 }, B = { x: 0, z: 0 }, P = { x: 0, z: 0 };
  return {
    len, cum, names,
    // where you are s metres along, `lat` metres to the right of the centre line, and which way the road runs
    at(s, lat = 0) {
      raw(s - 4, A); raw(s + 4, B); raw(s, P);
      let tx = B.x - A.x, tz = B.z - A.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      return { x: P.x - tz * lat, z: P.z + tx * lat, tx, tz, rot: Math.atan2(tx, tz), name: names ? names[P.k] : '' };
    },
  };
}
// the road from a to b along the named streets (falling back to any road), as a path
function roadPath(a, b, streets) {
  const r = (streets && routeEdges(a.x, a.z, b.x, b.z, e => streets.includes(e.name))) || routeEdges(a.x, a.z, b.x, b.z);
  if (!r) return makePath([a.x, a.z, b.x, b.z], ['', '']);
  const E = ctx.edges, pts = [], names = [], tmp = { x: 0, z: 0, tx: 0, tz: 0 }, se = E[r.start.e];
  ctx.edgePos(se, r.start.dir > 0 ? r.start.s : se.len - r.start.s, tmp); pts.push(tmp.x, tmp.z); names.push(se.name || '');
  const add = (e, dir, from = 0) => {
    const p = e.pts, n = p.length / 2;
    if (dir > 0) { for (let k = 0; k < n; k++) if (e.cum[k] >= from) { pts.push(p[k * 2], p[k * 2 + 1]); names.push(e.name || ''); } }
    else { for (let k = n - 1; k >= 0; k--) if (e.len - e.cum[k] >= from) { pts.push(p[k * 2], p[k * 2 + 1]); names.push(e.name || ''); } }
  };
  add(se, r.start.dir, r.start.s); for (const { e, dir } of r.edges) add(E[e], dir);
  // drop doubled points (they'd make a zero-length step)
  const P2 = [pts[0], pts[1]], N2 = [names[0]];
  for (let k = 2; k < pts.length; k += 2) if (Math.hypot(pts[k] - P2[P2.length - 2], pts[k + 1] - P2[P2.length - 1]) > 0.5) { P2.push(pts[k], pts[k + 1]); N2.push(names[k / 2]); }
  return makePath(P2, N2);
}
// put a car on the path: s along, lat to the right, facing along it (or back down it)
function place(v, q, back) {
  v.pos.x = q.x; v.pos.z = q.z; v.rotY = back ? wrapA(q.rot + Math.PI) : q.rot; ctx.settleCar(v);
}
function setSpeed(v, sp) { v.vel.set(Math.sin(v.rotY) * sp, Math.cos(v.rotY) * sp); v.speed = sp; }
function lightsOff(v) { // a car running dark: no headlights, no tail lights, no pool on the road
  if (!v || !v.m) return;
  for (const mt of v.m.allMats) if (mt.userData.lamp) mt.emissiveIntensity = mt.userData.lamp === 'head' ? 0.02 : 0.05;
  if (v.m.beam) v.m.beam.visible = false;
}
function scriptCar(v, fn) { v.cineFn = fn; v.ai = cineDrive; v.driver = v.driver || 'cine'; v.parked = false; v.mode = 'free'; v.agent = null; v.keep = true; v.mission = true; v.react = -1000; }
function cineDrive(v, dt) { if (v.cineFn) v.cineFn(v, dt); }
function releaseCar(v) { v.cineFn = null; if (v.ai === cineDrive) v.ai = null; if (v.driver === 'cine') v.driver = null; v.vel.set(0, 0); v.speed = 0; }
// clear the road: traffic and passers-by near any of these points go away so nothing drives through the shot
function clearAround(pts, r) {
  for (const v of ctx.vehicles.slice()) { if (v.keep || v.mine || v.mission || v === ctx.player.inCar || v.isCop && v.ai) continue; if (pts.some(p => Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < r)) v.remove(); }
  for (const p of ctx.peds.slice()) { if (p.keep || p.ai || p.isCop) continue; if (pts.some(q => Math.hypot(p.pos.x - q.x, p.pos.z - q.z) < r * 0.5)) p.remove(); }
}

// ------------------------------------------------------------------ the engine
export function playCutscene(id, m, H) {
  const sc = SCENES[id]; if (!sc) return Promise.resolve();
  ensureUI();
  return new Promise(resolve => {
    Object.assign(C, { active: true, scene: sc, m, H, s: {}, i: -1, t: 0, cam: null, prev: null, resolve, skip: false });
    C.beats = sc.beats(C.s, m, H);
    ctx.keys && ctx.keys.clear(); document.body.classList.add('cine');
    next();
  });
}
function next() {
  const b0 = C.beats[C.i]; if (b0 && b0.exit) b0.exit(C.s);
  C.i++; C.t = 0; C.prev = C.cam ? { pos: C.cam.pos.slice(), look: C.cam.look.slice() } : null;
  const b = C.beats[C.i]; if (!b) { end(); return; }
  if (b.enter) b.enter(C.s);
  if (b.lines) C.lineId = C.H.say(b.lines); else C.lineId = 0;
  if (b.card !== undefined) card(typeof b.card === 'function' ? b.card(C.s) : b.card);
}
function end() {
  const sc = C.scene, s = C.s;
  if (sc.finish) sc.finish(s, C.m, C.H);
  card(null); document.body.classList.remove('cine'); C.H.clear();
  ctx.keys && ctx.keys.clear();
  C.active = false; C.cam = null; const r = C.resolve; C.resolve = null; C.scene = null;
  if (ctx.camera) { ctx.camera.fov = 65; ctx.camera.updateProjectionMatrix(); }
  r && r();
}
// a wreck that keeps burning a while (Tommy's, after the scene too)
const burners = [];
function burn(v, t) { if (!burners.some(b => b.v === v)) burners.push({ v, t }); }
function updateBurners(dt) {
  const f = ctx.focusPos ? ctx.focusPos() : null; if (!ctx.fire) return;
  for (let i = burners.length - 1; i >= 0; i--) {
    const b = burners[i]; b.t -= dt; if (b.t <= 0 || b.v.removed) { burners.splice(i, 1); continue; }
    if (f && Math.hypot(b.v.pos.x - f.x, b.v.pos.z - f.z) > 260) continue;
    const k = Math.min(1, b.t / 20), n = Math.random() < k ? 3 : 1;
    for (let j = 0; j < n; j++) ctx.fire.emit(b.v.pos.x + (Math.random() - 0.5) * 2.2, b.v.pos.y + 0.4 + Math.random() * 0.8, b.v.pos.z + (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 0.6, 1.8 + Math.random() * 2, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.7 * k, 0.5 + Math.random() * 0.4, 1, 0.45 + Math.random() * 0.25, 0.1, -0.3, -1.5);
  }
}
export function updateCutscene(dt) {
  updateBurners(dt);
  if (!C.active) return;
  if (C.skip && !C.skipping) { // fade, jump to the end state, fade back
    C.skipping = true; fadeTo(1); C.H.clear();
    setTimeout(() => { C.skipping = false; C.skip = false; const b = C.beats[C.i]; if (b && b.exit) b.exit(C.s); C.i = C.beats.length; end(); fadeTo(0); }, 600);
    return;
  }
  if (C.skipping) return;
  const b = C.beats[C.i]; if (!b) return;
  C.t += dt;
  if (b.tick) b.tick(C.s, dt, C.t);
  const cam = b.cam ? b.cam(C.s, C.t) : C.cam;
  if (cam) { cam.blend = b.blend ? clamp(C.t / b.blend, 0, 1) : 0; C.cam = cam; }
  for (const v of C.s.dark || []) lightsOff(v);
  const linesDone = !C.lineId || C.H.said(C.lineId);
  if ((b.dur == null || C.t >= b.dur) && linesDone && C.t >= (b.min || 0)) next();
}

// ================================================================== scenes
// Lake Poway, the gate at the top of Lake Poway Road, two in the morning. Tommy is waiting by a borrowed sedan. A
// black car with its lights off comes up the road; Tommy leads it away down Lake Poway Road, and at the curve onto
// Espola it puts him through the rail: a PIT, the move deputies are trained to do. Marco gets there as it burns.
export const SCENES = {
  tommy: {
    // before the player arrives: Tommy and the car he came in, at the gate, on the shoulder
    stage(m, H) {
      const G = H.place('lakeGate'), S = H.place('espolaStart');
      const path = roadPath(G, S, ['Lake Poway Road', 'Espola Road']);
      const q = path.at(14, 4.6), v = H.spawnVehicle('sedan', 'q-sedan', q.x, q.z, q.rot, 0xb8bcc0);
      v.parked = true; v.loaner = true; m.h.loaner = v;
      const t = path.at(10, 6.6), p = H.castPed('tommy', { x: t.x, z: t.z });
      p.rotY = wrapA(q.rot + Math.PI / 2); m.h.tommy = p;
      m.tommyPath = path;
    },
    beats(s, m, H) {
      const P = ctx.player, path = m.tommyPath || roadPath(H.place('lakeGate'), H.place('espolaStart'), ['Lake Poway Road', 'Espola Road']);
      s.path = path;
      // where Lake Poway Road meets Espola, and the curve just past it where it happens
      let sj = path.len * 0.8; for (let k = 0; k < path.cum.length; k++) if (path.names[k] === 'Espola Road') { sj = path.cum[k]; break; }
      s.sj = sj; s.sc = clamp(sj + 140, 60, path.len - 40);
      const at = (sv, lat) => path.at(sv, lat);
      const meet = at(10, 6.6), car0 = at(14, 4.6);
      // which side of the road is the drop at the crash: the car goes off that way
      { const c = at(s.sc, 0), hL = ctx.heightAt(c.x + c.tz * 14, c.z - c.tx * 14), hR = ctx.heightAt(c.x - c.tz * 14, c.z + c.tx * 14); s.exit = hR <= hL ? 1 : -1; }
      const hy = (x, z, h) => ctx.heightAt(x, z) + h;
      // from behind the brothers, down the road at the dark car (closer on Tommy once he's talking)
      const watchDark = (s, tight) => { const T = m.h.tommy, D = s.D, base = T || P, dx = D.pos.x - base.pos.x, dz = D.pos.z - base.pos.z, l = Math.hypot(dx, dz) || 1, back = tight ? 2.4 : 4.2;
        return { pos: above([base.pos.x - dx / l * back + dz / l * 1.2, base.pos.y + 1.75, base.pos.z - dz / l * back - dx / l * 1.2], 1.3), look: [D.pos.x, D.pos.y + 1, D.pos.z], fov: tight ? 30 : 36 }; };
      const eye = (e, h = 1.62) => [e.pos.x, e.pos.y + h, e.pos.z];
      s.dark = [];
      return [
        { // fade to black: it's later, everything goes where it needs to be
          dur: 0.7, enter: s => { fadeTo(1); ctx.notify && 0; },
          exit: s => {
            if (!ctx.online && ctx.hour != null) ctx.hour = 1.95;
            clearAround([at(0), at(s.sj), at(s.sc)], 380);
            const T = m.h.tommy, L = m.h.loaner;
            if (P.inCar) { const v = P.inCar; v.driver = null; P.inCar = null; P.rig.g.visible = true; }
            const mp = at(10, 9.6); P.pos.set(mp.x, ctx.heightAt(mp.x, mp.z), mp.z); P.rotY = Math.atan2(meet.x - mp.x, meet.z - mp.z); P.speed = 0;
            if (T) { T.pos.set(meet.x, ctx.heightAt(meet.x, meet.z), meet.z); T.rotY = Math.atan2(mp.x - meet.x, mp.z - meet.z); }
            if (L) { place(L, car0); L.parked = true; }
            // Marco's own car: the one he came in, or a stand-in if he walked up
            let mine = ctx.vehicles.find(v => v.marco && !v.dead && !v.removed) || ctx.vehicles.find(v => v.mine && !v.dead && !v.removed && Math.hypot(v.pos.x - mp.x, v.pos.z - mp.z) < 200 && v !== L);
            if (!mine) { const q = at(30, 4.6); mine = H.spawnVehicle('sedan', 'q-sedan', q.x, q.z, q.rot, 0x5d6f86); mine.mine = true; mine.marco = true; }
            s.mine = mine;
            // the black car, out of sight down the road for now; a push bar on the front
            const dq = at(210, -1.9), D = H.spawnVehicle('sedan', 'q-sedan', dq.x, dq.z, wrapA(dq.rot + Math.PI), 0x121315);
            const bar = new ctx.THREE.Mesh(ctx.boxG(1.5, 0.42, 0.12), ctx.lam('#0c0c0d')); bar.position.set(0, 0.55, D.spec.L / 2 + 0.08); D.m.g.add(bar);
            D.dark = true; s.D = D; s.dark.push(D); scriptCar(D, () => { }); s.ds = 210;
          },
        },
        { // establishing: the gate, the lake past it, two brothers by a borrowed car
          dur: 6, enter: () => fadeTo(0), card: () => { const h = ctx.hour ?? 2, hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `<small>LAKE POWAY</small>${(hh % 12) || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; },
          cam: (s, t) => { const c = { x: (meet.x + P.pos.x) / 2, z: (meet.z + P.pos.z) / 2 }, a = car0.rot + 2.2 + t * 0.06, r = 22 - t * 1.2; return { pos: above([c.x + Math.sin(a) * r, hy(c.x, c.z, 7.5 - t * 0.6), c.z + Math.cos(a) * r], 2), look: [c.x, hy(c.x, c.z, 1.2), c.z], fov: 42 }; },
          exit: () => card(null),
        },
        { // they talk; the camera sits over the listener's shoulder
          lines: [
            ['tommy', 'You came. Six years, and you still drive like Ma\'s in the passenger seat.'],
            ['marco', 'You said life or death, Tommy. Six years of nothing, and that\'s your opener?'],
            ['tommy', 'It is. I\'ve been moving cars at night for a man in this town. Other people\'s cars. Nice people.'],
            ['tommy', 'He keeps a book. Leather, fountain pen, every car and every payment. Some of the payments go to people with badges.'],
            ['tommy', 'Tomorrow night I take that book and drive it to the DA in San Diego. Not the Sheriff. Not anybody in Poway.'],
            ['marco', 'Then why am I here?'],
            ['tommy', 'Because if I don\'t make it to tomorrow night, somebody has to know where to look.'],
          ],
          min: 1, cam: (s) => {
            const T = m.h.tommy, w = H.speaker(), a = w === 'marco' ? T : P, b = w === 'marco' ? P : T; if (!a || !b) return C.cam;
            const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, l = Math.hypot(dx, dz) || 1, nx = dx / l, nz = dz / l;
            const pos = [a.pos.x - nx * 1.6 + nz * 0.75, a.pos.y + 1.75, a.pos.z - nz * 1.6 - nx * 0.75];
            return { pos: above(pos, 1.4), look: eye(b, 1.5), fov: 38 };
          },
        },
        { // a car comes up the road with its lights off; nobody says anything
          dur: 5.2,
          enter: s => { ctx.noise && ctx.noise(3, 'lowpass', 90, 0.22); },
          tick: (s, dt) => { const D = s.D; s.ds = Math.max(36, s.ds - dt * 19); place(D, at(s.ds, -1.9), true); setSpeed(D, s.ds > 36 ? 19 : 0); },
          cam: (s) => watchDark(s),
        },
        { // and stops
          lines: [
            ['tommy', '...No. No, no, no. I lost them on Espola. I watched my mirrors the whole way.'],
            ['tommy', 'Marco. Listen to me. Get in the trees. Whatever happens, you were never here.'],
            ['marco', 'Tommy, wait—'],
            ['tommy', 'Go see Ma. Tell her I\'m sorry about the porch light.'],
          ],
          tick: (s, dt) => { const D = s.D; const was = s.ds; s.ds = Math.max(36, s.ds - dt * 7); place(D, at(s.ds, -1.9), true); setSpeed(D, s.ds < was ? 7 : 0); },
          cam: (s) => watchDark(s, true),
        },
        { // Tommy goes; it follows him
          dur: 6.5, lines: [['marco', 'TOMMY!']],
          enter: s => {
            const T = m.h.tommy; if (T) { T.remove(); m.h.tommy = null; }
            const L = m.h.loaner; s.ls = 14; s.lv = 0; s.dturn = 0;
            scriptCar(L, (v, dt) => { s.lv = Math.min(27, s.lv + dt * 9); s.ls += s.lv * dt; place(v, at(s.ls, 1.9)); setSpeed(v, s.lv); });
            ctx.tone && ctx.tone(70, 1.4, 'sawtooth', 0.05, 120);
          },
          tick: (s, dt, t) => { // the black car swings round once Tommy's past it, and goes after him
            const D = s.D; if (t < 2.2) return;
            s.dturn = Math.min(1, s.dturn + dt / 1.4); const q = at(s.ds + s.dturn * 6, lerp(-1.9, 1.9, ease(s.dturn)));
            if (s.dturn < 1) { D.pos.x = q.x; D.pos.z = q.z; D.rotY = wrapA(q.rot + Math.PI * (1 - ease(s.dturn))); ctx.settleCar(D); setSpeed(D, 5); }
            else { s.dv = Math.min(28, (s.dv || 5) + dt * 10); s.ds += s.dv * dt; place(D, at(s.ds + 6, 1.9)); setSpeed(D, s.dv); }
          },
          cam: (s, t) => { const L = m.h.loaner, f = [P.pos.x, P.pos.y, P.pos.z], d = Math.atan2(L.pos.x - f[0], L.pos.z - f[2]);
            return { pos: above([f[0] - Math.sin(d) * 2.4 + Math.cos(d) * 0.6, f[1] + 1.8, f[2] - Math.cos(d) * 2.4 - Math.sin(d) * 0.6], 1.4), look: [L.pos.x, L.pos.y + 0.8, L.pos.z], fov: 46 }; },
        },
        { // down Lake Poway Road: the chase
          dur: 6.8,
          enter: s => {
            clearAround([at(s.sj - 260), at(s.sj), at(s.sc)], 260);
            s.ls = s.sj - 250; s.lv = 27; s.ds = s.ls - 26; s.dv = 28;
            m.h.loaner.cineFn = (v, dt) => { s.ls += s.lv * dt; place(v, at(s.ls, 1.9)); setSpeed(v, s.lv); };
            s.D.cineFn = (v, dt) => { s.dv = s.ls - s.ds > 12 ? 30 : 27; s.ds += s.dv * dt; place(v, at(s.ds, 1.9)); setSpeed(v, s.dv); };
            s.D.ai = cineDrive;
          },
          cam: (s, t) => { // out in front of Tommy, looking back: his headlights, and the black shape filling his mirror
            const L = m.h.loaner, q = at(s.ls + 13 - t * 0.6, 1.9), side = -s.exit || 1, D = s.D;
            const pos = [q.x - q.tz * 2.6 * side, 0, q.z + q.tx * 2.6 * side]; pos[1] = ctx.heightAt(pos[0], pos[2]) + 1.25;
            return { pos: above(pos, 1.1), look: [L.pos.x * 0.6 + D.pos.x * 0.4, L.pos.y + 0.9, L.pos.z * 0.6 + D.pos.z * 0.4], fov: 38 }; },
        },
        { // the curve: a tap on the back corner, and he's gone through the rail
          dur: 6.4, min: 6.4,
          enter: s => {
            s.ls = s.sc - 88; s.lv = 26; s.ds = s.ls - 11; s.dv = 26; s.hit = false; s.crashT = 0;
            const L = m.h.loaner;
            L.cineFn = (v, dt) => {
              if (!s.hit) { s.ls += s.lv * dt; place(v, at(s.ls, 1.9)); setSpeed(v, s.lv); if (s.ls >= s.sc) { s.hit = true; s.p0 = at(s.sc, 1.9); s.rot0 = v.rotY; ctx.sfx && ctx.sfx.clank(1); ctx.noise && ctx.noise(0.9, 'bandpass', 1800, 0.25); } return; }
              // off the road toward the drop: sliding, spinning, then over and over
              s.crashT += dt; const t = s.crashT, T = 1.9, k = clamp(t / T, 0, 1), p0 = s.p0, e = s.exit;
              const fwd = 26 * (t - 0.5 * (t * t) / T * (t < T ? 1 : 0)), side = 9 * ease(k) * e, run = Math.min(fwd, 26 * T * 0.5);
              v.pos.x = p0.x + p0.tx * run - p0.tz * side; v.pos.z = p0.z + p0.tz * run + p0.tx * side;
              v.rotY = wrapA(s.rot0 + e * (2.6 * ease(k * 1.2))); const g = ctx.heightAt(v.pos.x, v.pos.z);
              const rk = clamp((t - 0.45) / 1.1, 0, 1); v.roll = wrapA(e * rk * Math.PI * 3); v.pitch = Math.sin(rk * Math.PI) * 0.25;
              v.pos.y = g + 0.1 + Math.sin(rk * Math.PI) * 1.4; setSpeed(v, 26 * (1 - k));
              if (t >= T && !s.wrecked) { s.wrecked = true; v.vel.set(0, 0); v.flipped = true; v.pitch = 0; ctx.settleCar(v); releaseCar(v); v.parked = true; v.keep = true; ctx.damageCar(v, 999, null, true); ctx.sfx && ctx.sfx.crash(1); burn(v, 70); }
            };
            s.D.cineFn = (v, dt) => {
              if (!s.hit) { s.dv = 27.5; s.ds += s.dv * dt; place(v, at(s.ds, s.ls - s.ds < 8 ? 1.9 - (8 - (s.ls - s.ds)) * 0.08 * -s.exit : 1.9)); setSpeed(v, s.dv); return; }
              s.dv = Math.max(0, s.dv - dt * 11); s.ds += s.dv * dt; place(v, at(s.ds, 1.9)); setSpeed(v, s.dv);
            };
          },
          cam: (s, t) => { const c = at(s.sc + 4, 0), e = -s.exit; // the inside of the curve, back a bit, a little up
            const pos = [c.x - c.tz * 16 * e - c.tx * 26, 0, c.z + c.tx * 16 * e - c.tz * 26]; pos[1] = ctx.heightAt(pos[0], pos[2]) + 4.5;
            return { pos: above(pos, 2), look: [c.x - c.tz * 4 * s.exit + c.tx * 4, ctx.heightAt(c.x, c.z) + 1, c.z + c.tx * 4 * s.exit + c.tz * 4], fov: 44 }; },
        },
        { // it stops. Somebody looks. Then it goes, still dark
          dur: 5.5,
          enter: s => { s.wait = 0; s.D.cineFn = (v, dt) => { s.wait += dt; if (s.wait < 2.2) { setSpeed(v, 0); return; } s.dv = Math.min(30, (s.dv || 0) + dt * 9); s.ds += s.dv * dt; place(v, at(s.ds, 1.9)); setSpeed(v, s.dv); }; },
          cam: (s, t) => { const L = m.h.loaner, D = s.D, dx = D.pos.x - L.pos.x, dz = D.pos.z - L.pos.z, l = Math.hypot(dx, dz) || 1; // past the burning wreck, at the car that did it
            return { pos: above([L.pos.x - dx / l * 13 + dz / l * 5, L.pos.y + 2.6, L.pos.z - dz / l * 13 - dx / l * 5], 1.6), look: [D.pos.x, D.pos.y + 0.9, D.pos.z], fov: 38 }; },
        },
        { // Marco gets there
          dur: 4.2, lines: [['marco', 'Tommy... TOMMY!']],
          enter: s => {
            const v = s.mine, q = at(s.sc - 6, 4.4); releaseCar(v); place(v, q); v.parked = true; v.driver = null; v.mine = true;
            const L = m.h.loaner, w = { x: q.x + q.tx * 4 - q.tz * 1.6, z: q.z + q.tz * 4 + q.tx * 1.6 };
            P.pos.set(w.x, ctx.heightAt(w.x, w.z), w.z); P.rotY = Math.atan2(L.pos.x - w.x, L.pos.z - w.z); P.speed = 0;
            if (s.D) { s.D.remove(); s.D = null; s.dark.length = 0; }
          },
          cam: (s, t) => { const L = m.h.loaner, dx = L.pos.x - P.pos.x, dz = L.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1;
            return { pos: above([P.pos.x - dx / l * 2.6 + dz / l * 0.8, P.pos.y + 1.7, P.pos.z - dz / l * 2.6 - dx / l * 0.8], 1.3), look: [L.pos.x, L.pos.y + 1, L.pos.z], fov: 44 + t * 1.5 }; },
        },
      ];
    },
    // the state the game picks up from (also where Space jumps to)
    finish(s, m, H) {
      const path = s.path; if (!path) return;
      const P = ctx.player, at = (sv, lat) => path.at(sv, lat);
      if (ctx.hour != null && !ctx.online && (ctx.hour > 3 || ctx.hour < 1.5)) ctx.hour = 2.1;
      const T = m.h.tommy; if (T && !T.removed) T.remove(); m.h.tommy = null;
      if (s.D && !s.D.removed) s.D.remove(); s.D = null; if (s.dark) s.dark.length = 0;
      const L = m.h.loaner;
      if (L && !L.dead) { // skipped before the crash: it ends the same way
        releaseCar(L); const c = at(s.sc, 1.9), e = s.exit || 1, x = c.x + c.tx * 18 - c.tz * 8 * e, z = c.z + c.tz * 18 + c.tx * 8 * e;
        L.pos.set(x, 0, z); L.rotY = wrapA(c.rot + e * 2.4); L.flipped = true; ctx.settleCar(L); L.parked = true; L.keep = true; ctx.damageCar(L, 999, null, true); burn(L, 70);
      }
      if (L) { L.keep = true; L.mission = true; L.tommyWreck = true; }
      let v = s.mine; if (!v || v.removed || v.dead) { const q = at(s.sc - 6, 4.4); v = H.spawnVehicle('sedan', 'q-sedan', q.x, q.z, q.rot, 0x5d6f86); v.mine = true; v.marco = true; v.keep = false; v.mission = false; }
      { const q = at(s.sc - 6, 4.4); if (v.cineFn) releaseCar(v); if (Math.hypot(v.pos.x - q.x, v.pos.z - q.z) > 30) { v.vel.set(0, 0); place(v, q); } } // Marco followed them down: his car is here
      v.keep = false; v.mission = false;
      v.parked = true; v.driver = null; s.mine = v;
      if (L && Math.hypot(P.pos.x - L.pos.x, P.pos.z - L.pos.z) > 40) { const q = at(s.sc - 6, 4.4), w = { x: q.x + q.tx * 4 - q.tz * 1.6, z: q.z + q.tz * 4 + q.tx * 1.6 }; P.pos.set(w.x, ctx.heightAt(w.x, w.z), w.z); P.rotY = Math.atan2(L.pos.x - w.x, L.pos.z - w.z); }
      if (ctx.cam) ctx.cam.yaw = P.rotY + Math.PI;
    },
  },
};
