// The race courses: Kirkham Circuit (3 laps), Canyon Sprint (point to point, over rolling hills) and Poway Speedway
// (4 laps), all from src/games/defs.js. Two ways to race:
//   T  time trial: you, on the grid, lights out in 4 s, any time
//   C  competition: join the queue; with two or more in it, 15 s later everyone in it lines up on the grid and the
//      lights go out together. Up to eight cars.
// The server times both: the green light, every checkpoint in order, each lap, the finish (to the hundredth, from
// where your car crossed the line). The boards keep each driver's best time per course.
import { ctx } from '../ctx.js';
import { DEFS } from './defs.js';
import { canvasTex, concreteTex, instanced, baseBox, rectPoly, wallPoly, createScreen, screenStand, textSign, speckle, rng, FONT_D } from './kit.js';
import { buildTunnels, flatGround, gridGround, groundMat, horizon, fence, arrival } from './base.js';
import { createCrowd, standSeats, CHEER } from './crowd.js';
import { HUD, lapTime } from './hud.js';

const BAR_OFF = 4.5; // barrier distance outside the asphalt edge

export function createRace(api) {
  const { THREE } = ctx, id = api.id, A = DEFS.ARENAS[id], S = DEFS.courseOf(id), o = A.o, hw = S.hw, n = S.n;
  const group = new THREE.Group(); group.position.set(o[0], 0, o[1]);
  const gnd = (x, z) => DEFS.groundLocal(id, x, z);
  const pad = [(A.in[0] + A.out[0]) / 2 + 60, (A.in[1] + A.out[1]) / 2]; // the paddock: in front of the tunnels
  const P = i => [S.s[i * 2], S.s[i * 2 + 1]], Tn = i => DEFS.tangent(S, i, S.closed);

  // ---- ground and backdrop
  const holes = buildTunnels(group, A, id === 'race0' ? '#3df2ff' : id === 'race1' ? '#7dff6a' : '#ff5d3d');
  const b = A.bounds, gm = groundMat(id === 'race1' ? '#8a7f55' : '#6f8a4a', id === 'race1' ? ['#7a6f48', '#9c9062', '#6b6440', '#a89a6a'] : ['#5f7a3e', '#7f9a55', '#56703a', '#8aa560'], 10, id.charCodeAt(4));
  if (A.ground === 'hills') gridGround(group, [b[0] - 300, b[1] - 300, b[2] + 300, b[3] + 300], 12, gnd, holes, gm, 10);
  else flatGround(group, [b[0] - 500, b[1] - 500, b[2] + 500, b[3] + 500], holes, gm, 10);
  horizon(group, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, 1900, id === 'race1' ? { lo: '#b7a99a', hi: '#7a5d4a', seed: 7, h0: 90, h1: 330 } : { lo: '#a3b4c4', hi: '#5f7258', seed: 11, h0: 50, h1: 220 });
  { const pa = new THREE.Mesh(new THREE.PlaneGeometry(220, 130).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: concreteTex([16, 10], '#a29d93'), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 })); pa.position.set(pad[0] - 40, 0.02, pad[1]); pa.receiveShadow = true; group.add(pa); }

  // ---- the track: asphalt with white edge lines, red-and-white kerbs, concrete barriers
  const asphalt = canvasTex(256, 512, (g, w, h) => {
    speckle(g, w, h, '#3b3d40', ['#2c2e31', '#4a4c50', '#333539', '#56585c'], 9000, 0.4, 1.4, 12);
    g.fillStyle = '#e9e6dd'; g.fillRect(6, 0, 8, h); g.fillRect(w - 14, 0, 8, h);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(w * 0.28, 0, w * 0.1, h); g.fillRect(w * 0.62, 0, w * 0.1, h); // the racing line, darker
  }, null);
  asphalt.wrapT = THREE.RepeatWrapping;
  const kerbT = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#d4302f'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f2efe8'; g.fillRect(0, h / 2, w, h / 2); }, null); kerbT.wrapT = THREE.RepeatWrapping;
  const N = S.closed ? n + 1 : n, side = (i, off) => { const k = i % n, [x, z] = P(k), t = Tn(k); return [x + t[1] * off, z - t[0] * off]; }; // +off: left of the direction of travel
  function ribbon(off0, off1, lift, mat, vScale, sel) {
    const pos = [], uv = [], idx = []; let run = 0, prev = null;
    for (let i = 0; i < N; i++) {
      const a = side(i, off0), c = side(i, off1); if (prev) run += Math.hypot(a[0] - prev[0], a[1] - prev[1]); prev = a;
      pos.push(a[0], gnd(a[0], a[1]) + lift, a[1], c[0], gnd(c[0], c[1]) + lift, c[1]); uv.push(0, run / vScale, 1, run / vScale);
      if (i && (!sel || sel(i))) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m); return m;
  }
  const curv = i => { const a = Tn((i - 3 + n) % n), c = Tn((i + 3) % n); return Math.abs(a[0] * c[1] - a[1] * c[0]); };
  ribbon(-hw, hw, 0.06, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 32);
  const kmat = new THREE.MeshStandardMaterial({ map: kerbT, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  ribbon(-hw - 1.3, -hw, 0.09, kmat, 3, i => curv(i) > 0.06); ribbon(hw, hw + 1.3, 0.09, kmat, 3, i => curv(i) > 0.06);
  // barriers, open toward the paddock near it, so you can drive on from there
  const towardPad = (i, s) => { const [x, z] = P(i % n), t = Tn(i % n), nx = t[1] * s, nz = -t[0] * s; return Math.hypot(pad[0] - x, pad[1] - z) < 190 && (pad[0] - x) * nx + (pad[1] - z) * nz > 0; };
  const wallMat = new THREE.MeshStandardMaterial({ map: concreteTex([1, 1], '#d9d4c9'), roughness: 0.9 });
  for (const s of [-1, 1]) {
    const pos = [], idx = []; let k = 0;
    for (let i = 1; i < N; i++) {
      if (towardPad(i, s) || towardPad(i - 1, s)) continue;
      const a = side(i - 1, s * (hw + BAR_OFF)), c = side(i, s * (hw + BAR_OFF)), ya = gnd(a[0], a[1]), yc = gnd(c[0], c[1]);
      pos.push(a[0], ya, a[1], a[0], ya + 1.1, a[1], c[0], yc + 1.1, c[1], c[0], yc, c[1]); idx.push(k, k + 1, k + 2, k, k + 2, k + 3); k += 4;
      if (i % 2 === 0) { const a2 = side(i - 2, s * (hw + BAR_OFF)); wallPoly(o[0] + a2[0], o[1] + a2[1], o[0] + c[0], o[1] + c[1], 0.7, -20, (ya + yc) / 2 + 1.1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, wallMat); m.material.side = THREE.DoubleSide; m.castShadow = m.receiveShadow = true; group.add(m);
  }
  // tyre stacks on the outside of the tight corners
  { const ty = [], R = rng(3); for (let i = 0; i < n; i += 3) if (curv(i) > 0.12) { const t0 = Tn(i), t1 = Tn((i + 4) % n), turn = Math.sign(t0[0] * t1[1] - t0[1] * t1[0]) || 1, [x, z] = side(i, -turn * (hw + BAR_OFF - 1.2)); for (let k = 0; k < 2; k++) ty.push({ x: x + (R() - 0.5) * 0.4, y: gnd(x, z) + k * 0.32, z: z + (R() - 0.5) * 0.4 }); }
    group.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 12).translate(0, 0.16, 0), new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.9 }), ty)); }

  // ---- start/finish: a chequered line, a gantry with five lights, the grid boxes
  const g0 = S.gates[0], ry0 = Math.atan2(g0[2], g0[3]), y0 = gnd(g0[0], g0[1]);
  const chk = canvasTex(256, 32, (g, w, h) => { for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) { g.fillStyle = ((x + y) / 16) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x, y, 16, 16); } });
  { const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); line.position.set(g0[0], y0 + 0.08, g0[1]); line.rotation.y = ry0; group.add(line); // across the track
    // the finish line of a point-to-point course is its own
    if (!S.closed) { const gl = S.gates[S.gates.length - 1], l2 = line.clone(); l2.position.set(gl[0], gnd(gl[0], gl[1]) + 0.08, gl[1]); l2.rotation.y = Math.atan2(gl[2], gl[3]); group.add(l2); } }
  const gantry = new THREE.Group(); gantry.position.set(g0[0], y0, g0[1]); gantry.rotation.y = ry0; group.add(gantry);
  const steel = new THREE.MeshStandardMaterial({ color: 0x2c3138, metalness: 0.7, roughness: 0.4 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), steel); p.position.set(s * (hw + 2), 4, 0); p.castShadow = true; gantry.add(p); rectPoly(o[0] + g0[0] + g0[3] * s * (hw + 2), o[1] + g0[1] - g0[2] * s * (hw + 2), 0.5, 0.5, ry0, -5, 20); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 4.6, 1.4, 0.8), steel); beam.position.y = 7.8; gantry.add(beam);
  const banner = textSign(A.name.toUpperCase(), { w: hw * 2 + 2, h: 1.6, bg: '#0b0e15', fg: '#ff7a2f', px: 1024 }); banner.position.set(0, 9.3, 0); banner.rotation.y = Math.PI; gantry.add(banner);
  const lights = []; for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18), new THREE.MeshBasicMaterial({ color: 0x220000, toneMapped: false })); l.position.set((i - 2) * 1.2, 7.8, -0.41); l.rotation.y = Math.PI; gantry.add(l); lights.push(l); }
  { const marks = []; for (let i = 0; i < 8; i++) { const s = DEFS.gridSlot(id, i); marks.push({ x: s[0] + Math.sin(s[2]) * 2.6, y: gnd(s[0], s[1]) + 0.08, z: s[1] + Math.cos(s[2]) * 2.6, ry: s[2], sx: 2.6, sy: 1, sz: 0.25 }); }
    group.add(instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2efe8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), marks, { cast: false })); }
  // the next checkpoint: an arch over the track
  const arch = new THREE.Group(), archMat = new THREE.MeshBasicMaterial({ color: 0x3df2ff, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), archMat); p.position.set(s * (hw + 1), 3, 0); arch.add(p); }
  { const t = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2.5, 0.5, 0.5), archMat); t.position.y = 6; arch.add(t); }
  arch.visible = false; group.add(arch);

  // ---- grandstands with people: along the start straight (and the finish of the sprint), and on a couple of corners
  const stands = [], seats = [], roofs = [], conc = new THREE.MeshStandardMaterial({ map: concreteTex([8, 1]), roughness: 0.95 });
  function stand(i, s, len, rows = 7) { // at sample i, on side s (+1 right of travel), facing the track
    const [x, z] = side(i, s * (hw + BAR_OFF + 6)), t = Tn(i % n), face = Math.atan2(-t[1] * s, t[0] * s), fx = Math.sin(face), fz = Math.cos(face), y = gnd(x, z);
    for (let r = 0; r < rows; r++) stands.push({ x: x - fx * (r * 0.85 + 0.42), y: y - 0.3, z: z - fz * (r * 0.85 + 0.42), ry: face, sx: len, sy: 0.8 + r * 0.45, sz: 0.85 });
    roofs.push({ x: x - fx * rows * 0.43, y: y + 5.6 + rows * 0.45, z: z - fz * rows * 0.43, ry: face, sx: len + 1, sy: 0.3, sz: rows * 0.85 + 2 });
    seats.push(...standSeats(x, z, len - 2, face, rows, { y0: y + 0.5, seed: i * 13 + s }).map(q => Object.assign(q, {})));
    rectPoly(o[0] + x - fx * rows * 0.43, o[1] + z - fz * rows * 0.43, len / 2 + 0.5, rows * 0.43 + 0.6, face, -10, 12);
    return [x, z];
  }
  const standAt = [], sideAway = i => (towardPad(i, 1) ? -1 : 1);
  const plan = id === 'race0' ? [[8, 70], [100, 40], [300, 40], [470, 40]] : id === 'race1' ? [[6, 60], [Math.floor(n * 0.45), 40], [n - 10, 60]] : [[10, 90], [Math.floor(n * 0.5), 90], [Math.floor(n * 0.27), 40]];
  for (const [i, len] of plan) standAt.push(stand(Math.min(n - 1, i), sideAway(i), len));
  group.add(instanced(baseBox(1, 1, 1), conc, stands)); group.add(instanced(baseBox(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2c3340, roughness: 0.6, metalness: 0.4 }), roofs));
  const crowd = createCrowd(seats, { seed: 41 + id.charCodeAt(4), parent: group });
  // the board, by the paddock, facing the grid; banners
  const screen = createScreen({ w: 16, h: 9, title: 'FASTEST TIMES', sub: `${A.name.toUpperCase()} · ${S.laps ? S.laps + ' LAPS' : 'POINT TO POINT'} · ALL-TIME`, accent: '#3df2ff' });
  { const st = screenStand(screen, 3); const [x, z] = side(4, sideAway(4) * -1 * (hw + BAR_OFF + 10)); st.position.set(x, gnd(x, z), z); st.rotation.set(0, Math.atan2(-Tn(4)[0], -Tn(4)[1]), 0); /* faces back down the grid */ group.add(st); rectPoly(o[0] + x, o[1] + z, 6, 1.5, st.rotation.y, -5, 20); }
  const b2 = createScreen({ w: 12, h: 6.75, title: 'FASTEST TIMES', sub: A.name.toUpperCase(), accent: '#3df2ff' });
  { const st = screenStand(b2, 2.5); st.position.set(pad[0] - 10, 0, pad[1] + 45); st.rotation.y = Math.PI * 0.85; group.add(st); }
  fence(group, A, [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(([x, z]) => [x, z]), true);

  // ---- asphalt lookup for the car physics (grid of samples)
  const cells = new Map(), CELL = 24, ck = (x, z) => Math.floor(x / CELL) * 100000 + Math.floor(z / CELL);
  for (let i = 0; i < n; i++) { const [x, z] = P(i), k = ck(x, z); (cells.get(k) || cells.set(k, []).get(k)).push(i); }
  function onRoad(x, z) {
    if (Math.abs(x - (pad[0] - 40)) < 110 && Math.abs(z - pad[1]) < 65) return true; // the paddock's concrete
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (const i of cells.get((gx + a) * 100000 + gz + c) || []) { const [px, pz] = P(i); if ((px - x) ** 2 + (pz - z) ** 2 < (hw + 1.2) ** 2) return true; }
    return false;
  }

  ctx.scene.add(group);
  // ---- the race, as this game sees it
  let st = null, rows = null, run = null, t = 0, lastBeep = 0, finishedT = 0;
  const me = () => api.myId();
  const fmt = r => (r || []).map(x => ({ rank: x.rank, name: x.name, val: lapTime(x.score), sub: x.sub && S.laps ? 'lap ' + lapTime(x.sub) : '' }));
  function board(r) { rows = r; screen.draw(fmt(rows), '', api.myName()); b2.draw(fmt(rows), '', api.myName()); }
  function setLights(k, green) { lights.forEach((l, i) => l.material.color.set(green ? 0x22ff55 : i < k ? 0xff1a1a : 0x220000)); }
  function hud() {
    const now = api.now(), inQ = st && st.q && st.q.includes(me());
    if (run && !run.done) {
      const el = now - run.t0, pos = st && st.race && run.mode === 'race' ? st.race.n.findIndex(r => r[0] === me()) + 1 : 0;
      HUD.bar(A.name, run.mode === 'tt' ? 'Time trial' : `Race · P${pos || '-'} of ${st && st.race ? st.race.n.length : '-'}`, el < 0 ? '' : lapTime(el), '', S.laps ? `Lap <b>${Math.min(S.laps, run.lap + 1)}/${S.laps}</b>${run.last ? ' · last ' + lapTime(run.last) : ''}` : `Checkpoint <b>${run.gate}/${S.gates.length - 1}</b>`);
      if (st && st.race && run.mode === 'race') HUD.side('Positions', st.race.n.map((r, i) => ({ n: `${i + 1}. ${r[1]}`, v: r[4] ? lapTime(r[5]) : r[7] ? 'out' : S.laps ? `lap ${Math.min(S.laps, r[2] + 1)}` : '', me: r[0] === me(), out: !!r[7] })));
      else HUD.side('Fastest times', (rows || []).slice(0, 8).map(r => ({ n: `${r.rank}. ${r.name}`, v: lapTime(r.score), me: r.name === api.myName() })));
      return;
    }
    const cd = st && st.cd ? Math.max(0, st.cd - now) : 0, waiting = st && st.q ? st.q.length : 0, racing = st && st.race;
    HUD.bar(A.name, S.laps ? `${S.laps} laps · ${(S.len / 1000).toFixed(1)} km a lap` : `${(S.len / 1000).toFixed(1)} km point to point`, cd ? HUD.esc(Math.ceil(cd / 1000) + 's') : '', cd ? 'warn' : '',
      racing ? `Race on: <b>${racing.n.length}</b> cars` : inQ ? `In the queue (${waiting})${cd ? ': lining up soon' : ': waiting for another driver'}` : waiting ? `<b>${waiting}</b> waiting to race: <b>C</b> to join` : 'Nobody racing yet');
    if (racing) HUD.side('Positions', racing.n.map((r, i) => ({ n: `${i + 1}. ${r[1]}`, v: r[4] ? lapTime(r[5]) : r[7] ? 'out' : '', out: !!r[7] })));
    else HUD.side('Fastest times', (rows || []).slice(0, 8).map(r => ({ n: `${r.rank}. ${r.name}`, v: lapTime(r.score), me: r.name === api.myName() })));
  }
  function hints() {
    if (run && !run.done) HUD.hint('<kbd>R</kbd> back to the last checkpoint · <kbd>T</kbd> restart (time trial) · <kbd>Backspace</kbd> give up · <kbd>K</kbd> leave');
    else HUD.hint(`<kbd>T</kbd> time trial · <kbd>C</kbd> ${st && st.q && st.q.includes(me()) ? 'leave the queue' : 'race other players'} · <kbd>K</kbd> leave (or drive into the exit tunnel)`);
  }
  return {
    id, A, group, crowd, start: [pad[0] - 30, pad[1], -Math.PI / 2 + Math.PI], mapBg: id === 'race1' ? '#7f7650' : '#5c7440',
    spawn: () => arrival(A),
    onRoad,
    enter() { run = null; hints(); hud(); },
    leave() { run = null; arch.visible = false; CHEER.stop(); if (st && st.q && st.q.includes(me())) api.act('quit'); },
    onState(s) { st = s; if (run && run.mode === 'race' && !(s.race)) { /* the room closed the race: results come as an event */ } hud(); hints(); },
    onBoard(r) { board(r); hud(); },
    onPlace(e) {
      const at = [e.x - o[0], e.z - o[1], e.rot];
      if (e.start) { run = { mode: e.start, t0: e.t0, gate: 0, lap: 0, last: 0, done: false }; api.placeCar(at, 0, true); api.hold(Math.max(0.2, (e.t0 - api.now()) / 1000)); HUD.clearBig(); hints(); }
      else if (e.hold) { api.placeCar(at, 0, false); }
      else api.placeCar(at, 0, !ctx.player.inCar || ctx.player.inCar.dead);
    },
    onEvent(e) {
      const mine = e.u === me();
      if (e.k === 'gate' && mine && run) { run.gate = e.gate; run.lap = e.lap; ctx.tone && ctx.tone(1320, 0.05, 'square', 0.08); }
      else if (e.k === 'lap' && mine && run) { run.last = e.t; HUD.big(lapTime(e.t), `lap ${e.lap} of ${S.laps}`, 'small', 2); }
      else if (e.k === 'dq' && mine) { run = null; arch.visible = false; HUD.big('OUT', e.why === 'jump start' ? 'Jump start' : e.why === 'too fast' ? 'That was faster than any car goes' : e.why, 'red small', 3); hints(); }
      else if (e.k === 'finish') {
        crowd.cheer(e.place === 1 || e.pb ? 1 : 0.6, 4.5); CHEER.burst(e.place === 1 ? 1 : 0.6, api.near(S.gates[S.closed ? 0 : S.gates.length - 1][0], S.gates[S.closed ? 0 : S.gates.length - 1][1], 500));
        if (mine) {
          if (run) run.done = true; finishedT = 6; arch.visible = false;
          HUD.big(lapTime(e.time), `${e.mode === 'race' ? `P${e.place} · ` : ''}${e.rank === 1 && e.pb ? 'NEW COURSE RECORD!' : e.pb ? 'personal best' : 'best ' + lapTime(e.best)}`, e.rank === 1 && e.pb ? 'gold' : 'go', 5);
          if (e.laps && e.laps.length > 1) HUD.results('Your laps', A.name, e.laps.map((l, i) => ({ n: `Lap ${i + 1}`, v: lapTime(l) })).concat([{ n: 'Total', v: lapTime(e.time) }]), 7);
          if (e.mode === 'tt') setTimeout(() => { run = null; hints(); hud(); }, 3000);
        } else api.notify(`<b>${HUD.who(e.n)}</b> finished${e.place ? ' P' + e.place : ''} in ${lapTime(e.time)}${e.rank === 1 && e.pb ? ': a new record!' : ''}`);
      } else if (e.k === 'race') api.notify(`Race on ${A.name}: ${e.n.map(HUD.who).join(', ')}. Lights out in a few seconds.`, 'green', 4000);
      else if (e.k === 'results') {
        HUD.results('Race results', A.name, e.rows.map((r, i) => ({ n: `${r[4] ? r[6] : '-'}. ${r[1]}`, v: r[4] ? lapTime(r[5]) : r[7] === 'left' ? 'left' : 'did not finish' })), 9);
        if (run && run.mode === 'race') { run = null; hints(); }
      }
      hud();
    },
    key(code) {
      const v = ctx.player.inCar;
      if (code === 'KeyT') { api.act('tt'); return true; }
      if (code === 'KeyC' && (v || !run)) { api.act(st && st.q && st.q.includes(me()) ? 'quit' : 'join'); return true; }
      if (code === 'KeyR') { if (run && !run.done) api.act('reset'); else api.placeCar(this.start, 0, true); return true; }
      if (code === 'Backspace' && run) { api.act('quit'); run = null; arch.visible = false; hints(); hud(); return true; }
      return false;
    },
    respawn() { if (run && !run.done) api.act('reset'); else api.placeCar(this.start, 0, true); },
    update(dt) {
      t += dt; crowd.update(dt); HUD.update(dt);
      const now = api.now();
      if (run && !run.done) {
        const left = run.t0 - now;
        if (left > 0) { // five red lights come on over the last 3 s, then all out: go
          setLights(left < 3000 ? Math.min(5, Math.ceil((3000 - left) / 600)) : 0, false);
          const sec = Math.ceil(left / 1000); if (sec <= 3 && sec !== lastBeep) { lastBeep = sec; HUD.big(String(sec), run.mode === 'tt' ? 'Time trial' : 'Race', 'red', 1); ctx.tone && ctx.tone(660, 0.18, 'sine', 0.2); }
        }
        else if (lastBeep) { lastBeep = 0; setLights(0, true); HUD.big('GO!', '', 'go', 1.2); ctx.tone && ctx.tone(1320, 0.4, 'sine', 0.25); crowd.cheer(0.7, 2.5); }
        const gi = run.gate % S.gates.length, G = S.gates[gi]; arch.visible = true; arch.position.set(G[0], gnd(G[0], G[1]), G[1]); arch.rotation.y = Math.atan2(G[2], G[3]);
        archMat.opacity = 0.4 + 0.2 * Math.sin(t * 6);
      } else { if (!lastBeep) setLights(0, false); arch.visible = false; }
      if (finishedT > 0) finishedT -= dt;
      if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) hud();
      let nd = 1e9; const f = ctx.focusPos(); for (const [x, z] of standAt) nd = Math.min(nd, Math.hypot(f.x - o[0] - x, f.z - o[1] - z)); CHEER.near(nd, 1); CHEER.update(dt);
    },
    drawMap(g, mpp) {
      g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#d9d4c9'; g.lineWidth = (hw + 3) * 2; g.beginPath();
      for (let i = 0; i < N; i++) { const [x, z] = P(i % n); i ? g.lineTo(x, z) : g.moveTo(x, z); } g.stroke();
      g.strokeStyle = '#3b3d40'; g.lineWidth = hw * 2; g.stroke();
      g.fillStyle = '#a29d93'; g.fillRect(pad[0] - 150, pad[1] - 65, 220, 130);
      if (run && !run.done) { const G = S.gates[run.gate % S.gates.length]; g.fillStyle = '#3df2ff'; g.beginPath(); g.arc(G[0], G[1], 8 * mpp, 0, Math.PI * 2); g.fill(); }
      const G0 = S.gates[0]; g.fillStyle = '#f4f4f4'; g.beginPath(); g.arc(G0[0], G0[1], 5 * mpp, 0, Math.PI * 2); g.fill();
    },
  };
}
