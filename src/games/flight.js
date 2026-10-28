// Long Jump: a dirt lane 880 m long, a big wooden kicker at the end of it, and a landing strip with distance boards
// every 25 m, between two grandstands. The lane and the strip are clear: no buildings, no props on them, just dirt
// that takes tyre tracks (they fade after 15 s).
//
// The board ranks by DISTANCE: metres from the lip to where the car first touches down, measured by the server from
// the car's own positions (src/games/defs.js has the ramp; server/nakama/index.js judges the flight). Air time rides
// along as the second number. Distance, because it's what everyone can see from the stands and the tracks in the
// dirt show it; air time on a fixed ramp follows from the same launch speed anyway, but a car that tumbles or is
// pitched up can hang a little longer without going any further, and the measured time carries the network's jitter
// (a few hundredths), where a touchdown point doesn't.
import { ctx } from '../ctx.js';
import { DEFS } from './defs.js';
import { canvasTex, woodTex, concreteTex, instanced, baseBox, rectPoly, wallPoly, createScreen, screenStand, textSign, createTracks, speckle, rng } from './kit.js';
import { buildTunnels, flatGround, groundMat, horizon, fence, arrival } from './base.js';
import { createCrowd, standSeats, CHEER } from './crowd.js';
import { HUD } from './hud.js';

const RAMP = DEFS.RAMP, LIP = DEFS.RAMP_LEN, LIP_H = DEFS.RAMP_H;

export function createFlight(api) {
  const { THREE } = ctx, A = DEFS.ARENAS.flight, o = A.o, group = new THREE.Group(); group.position.set(o[0], 0, o[1]);
  const lane = A.lane, land = A.land, HW = A.rampHw;
  // ---- ground: grassland, a packed-dirt lane and landing strip
  const holes = buildTunnels(group, A, '#ffb020');
  flatGround(group, [-1200, -800, 1200, 800], holes, groundMat('#7c7a52', ['#6a6a3e', '#8f8659', '#5d5f3a', '#9c8f62'], 10, 4), 10);
  const dirt = canvasTex(512, 512, (g, w, h) => speckle(g, w, h, '#9a7b55', ['#82664a', '#ad8d63', '#735a40', '#b89a70'], 12000, 0.5, 2.5, 8), [1, 1]);
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirt, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const strip = (x0, x1, hw) => { const g = new THREE.PlaneGeometry(x1 - x0, hw * 2).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.015, 0), uv = g.attributes.uv, P = g.attributes.position; for (let i = 0; i < P.count; i++) uv.setXY(i, P.getX(i) / 9, P.getZ(i) / 9); const m = new THREE.Mesh(g, dirtMat); m.receiveShadow = true; group.add(m); };
  strip(lane[0] - 30, LIP + 2, lane[2]); strip(LIP, land[1] + 30, land[2]);
  // lines across the landing strip every 25 m (bold every 50), a start line on the lane
  const lines = [];
  for (let d = 25; LIP + d < land[1]; d += 25) lines.push({ x: LIP + d, y: 0.02, z: 0, sx: d % 50 ? 0.25 : 0.5, sy: 1, sz: land[2] * 2 - 4 });
  lines.push({ x: lane[0] + 10, y: 0.02, z: 0, sx: 1.2, sy: 1, sz: lane[2] * 2 - 2 });
  group.add(instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf3ede1, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), lines, { cast: false }));
  // distance boards both sides, facing the lane
  for (let d = 50; LIP + d < land[1]; d += 50) for (const s of [-1, 1]) {
    const b = textSign(`${d} M`, { w: 5, h: 2, bg: '#f3ede1', fg: '#13161c', border: '#ff7a2f' }); b.position.set(LIP + d, 2.2, s * (land[2] + 3)); b.rotation.y = s > 0 ? Math.PI : 0; group.add(b);
  }
  // ---- the kicker: deck boards over a timber frame, steel lip; the car physics rides 12 chained wedges
  const wood = woodTex([1, 1]), deckMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.75 }), timber = new THREE.MeshStandardMaterial({ color: 0x7a5534, roughness: 0.85 });
  {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < RAMP.length; i++) { const [u, h] = RAMP[i]; pos.push(u, h, -HW, u, h, HW); uv.push(u / 3, 0, u / 3, HW * 2 / 3); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping; const deck = new THREE.Mesh(g, deckMat); deck.castShadow = deck.receiveShadow = true; group.add(deck);
    // side skirts (plywood) down to the ground
    for (const s of [-1, 1]) { const sp = [], si = []; for (let i = 0; i < RAMP.length; i++) { const [u, h] = RAMP[i]; sp.push(u, 0, s * HW, u, h, s * HW); if (i) { const k = i * 2; si.push(...(s > 0 ? [k - 2, k, k - 1, k - 1, k, k + 1] : [k - 2, k - 1, k, k - 1, k + 1, k])); } }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setIndex(si); sg.computeVertexNormals(); const sk = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x8f6a42, roughness: 0.8, side: THREE.DoubleSide })); sk.castShadow = true; group.add(sk); }
    // the frame: posts every 4 m along both sides and the middle, braces, a steel lip
    const posts = [];
    for (let i = 1; i < RAMP.length; i++) { const [u, h] = RAMP[i]; for (const w of [-HW + 0.3, 0, HW - 0.3]) posts.push({ x: u - 0.2, y: 0, z: w, sx: 0.35, sy: h, sz: 0.35 }); if (i % 2 === 0) posts.push({ x: u - 2, y: h * 0.45, z: 0, sx: 4.2, sy: 0.25, sz: HW * 2 - 0.4, rz: Math.atan2(h, 4) * 0.3 }); }
    group.add(instanced(baseBox(1, 1, 1), timber, posts));
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, HW * 2 + 0.2), new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.8, roughness: 0.35 })); lip.position.set(LIP - 0.2, LIP_H - 0.1, 0); group.add(lip);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.6, HW * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a2f, polygonOffset: true, polygonOffsetFactor: -2 })); stripe.position.set(LIP - 0.8, LIP_H - 0.08 + 0.02, 0); stripe.rotation.z = Math.atan2(LIP_H - RAMP[RAMP.length - 2][1], 4); group.add(stripe);
    // physics
    for (let i = 1; i < RAMP.length; i++) {
      const [u0, h0] = RAMP[i - 1], [u1, h1] = RAMP[i], r = ctx.addRamp(o[0] + u0, o[1], Math.PI / 2, { len: u1 - u0 + 0.05, wid: HW * 2, h: h1 - h0 });
      r.y = h0; if (r.m) r.m.visible = false;
    }
    rectPoly(o[0] + LIP / 2, o[1] + HW + 0.4, LIP / 2, 0.4, 0, -10, 1.2); rectPoly(o[0] + LIP / 2, o[1] - HW - 0.4, LIP / 2, 0.4, 0, -10, 1.2); // you can't drive in under it from the side
  }
  // ---- grandstands along the landing strip, both sides, facing it, with people
  const steps = [], roofs = [], seats = [], concrete = new THREE.MeshStandardMaterial({ map: concreteTex([8, 1]), roughness: 0.95 });
  const SECT = [[110, 46], [175, 46], [240, 46], [305, 46], [370, 46]], ROWS = 8, Z0 = land[2] + 12;
  for (const [cx, len] of SECT) for (const s of [-1, 1]) {
    const ry = s > 0 ? Math.PI : 0; // the people face the strip (+z faces -z side's strip...)
    for (let r = 0; r < ROWS; r++) steps.push({ x: cx, y: 0, z: s * (Z0 + r * 0.85 + 0.42), sx: len, sy: 0.5 + r * 0.45, sz: 0.85 });
    roofs.push({ x: cx, y: 5.6 + ROWS * 0.45, z: s * (Z0 + ROWS * 0.85 / 2), sx: len + 1, sy: 0.3, sz: ROWS * 0.85 + 2 });
    for (const px of [-len / 2 + 1, 0, len / 2 - 1]) roofs.push({ x: cx + px, y: 0, z: s * (Z0 + ROWS * 0.85 + 0.3), sx: 0.3, sy: 5.8 + ROWS * 0.45, sz: 0.3 });
    seats.push(...standSeats(cx, s * Z0, len - 2, s > 0 ? Math.PI : 0, ROWS, { rise: 0.45, depth: 0.85, y0: 0.5, gap: 0.7, fill: 0.62, seed: cx * 7 + s })); // ~2,600 people over ten stands
    rectPoly(o[0] + cx, o[1] + s * (Z0 + ROWS * 0.85 / 2), len / 2 + 0.5, ROWS * 0.85 / 2 + 0.6, 0, -10, 9);
  }
  group.add(instanced(baseBox(1, 1, 1), concrete, steps)); group.add(instanced(baseBox(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2c3340, roughness: 0.6, metalness: 0.4 }), roofs));
  const crowd = createCrowd(seats, { seed: 21, parent: group });
  // people along the lane by the ramp, standing behind the rope
  const ropeFolk = []; const R = rng(5);
  for (let x = -260; x < -20; x += 1.3) for (const s of [-1, 1]) if (R() < 0.55) ropeFolk.push({ x: x + R() * 0.6, y: 0, z: s * (lane[2] + 6 + R() * 2.5), ry: s > 0 ? Math.PI + (R() - 0.5) * 1.2 : (R() - 0.5) * 1.2 });
  const crowd2 = createCrowd(ropeFolk, { seed: 33, parent: group });
  { const rp = []; for (const s of [-1, 1]) rp.push([[-262, s * (lane[2] + 4.5)], [-18, s * (lane[2] + 4.5)]]); for (const r of rp) fence(group, A, r, false, { post: 0xd8d2c4, rail: 0xd4302f, h: 1.05, every: 3 }); }
  // ---- flags down the lane, a catch net and tyre wall at the end, the fence round it all
  const flagPoles = [], flags = [], FC = [0xff7a2f, 0x3df2ff, 0xffd23f, 0xff4fd8, 0x7dff6a];
  for (let x = lane[0] + 40; x < -10; x += 40) for (const s of [-1, 1]) { flagPoles.push({ x, y: 0, z: s * (lane[2] + 2.5), sx: 0.12, sy: 7, sz: 0.12 }); flags.push({ x: x + 0.8, y: 6.2, z: s * (lane[2] + 2.5), sx: 1.6, sy: 1, sz: 1, color: FC[(x / 40 + (s > 0 ? 2 : 0)) % FC.length | 0] }); }
  group.add(instanced(baseBox(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 0.6, roughness: 0.4 }), flagPoles));
  const flagMesh = instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 }), flags, { cast: false }); group.add(flagMesh);
  { const tyres = []; for (let z = -land[2]; z <= land[2]; z += 1.1) for (let k = 0; k < 3; k++) tyres.push({ x: land[1] + 6, y: k * 0.32, z: z + (k % 2) * 0.5, sx: 1, sy: 1, sz: 1 });
    group.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 14).translate(0, 0.16, 0), new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.9 }), tyres));
    wallPoly(o[0] + land[1] + 6, o[1] - land[2] - 2, o[0] + land[1] + 6, o[1] + land[2] + 2, 1.4, -10, 1.5);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(land[2] * 2 + 20, 9), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(30,30,30,.9)'; g.lineWidth = 2; for (let i = 0; i <= w; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }, [24, 4]), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    net.position.set(land[1] + 12, 4.5, 0); net.rotation.y = Math.PI / 2; group.add(net); wallPoly(o[0] + land[1] + 12, o[1] - land[2] - 12, o[0] + land[1] + 12, o[1] + land[2] + 12, 0.6, -10, 9);
  }
  const b = A.bounds; fence(group, A, [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], true);
  horizon(group, -100, 0, 1900, { lo: '#9eaab5', hi: '#6e6a52', seed: 3, h0: 70, h1: 300 });
  // ---- the boards: a huge one at the end of the strip, one at the start of the lane, one by the ramp
  const screens = [createScreen({ w: 34, h: 19, title: 'LONGEST JUMPS', sub: 'DISTANCE FROM THE LIP · AIR TIME · ALL-TIME', px: 1280 }), createScreen({ w: 15, h: 8.4, title: 'LONGEST JUMPS', sub: 'DISTANCE · AIR TIME' }), createScreen({ w: 15, h: 8.4, title: 'LONGEST JUMPS', sub: 'DISTANCE · AIR TIME' })];
  const s0 = screenStand(screens[0], 6); s0.position.set(land[1] + 40, 0, 0); s0.rotation.y = -Math.PI / 2; group.add(s0);
  const s1 = screenStand(screens[1], 3.5); s1.position.set(lane[0] + 70, 0, lane[2] + 20); s1.rotation.y = -Math.PI * 0.62; group.add(s1); rectPoly(o[0] + lane[0] + 70, o[1] + lane[2] + 20, 6, 1.5, -Math.PI * 0.62, -5, 20);
  const s2 = screenStand(screens[2], 3.5); s2.position.set(-30, 0, -(lane[2] + 22)); s2.rotation.y = -Math.PI * 0.25; group.add(s2); rectPoly(o[0] - 30, o[1] - lane[2] - 22, 6, 1.5, -Math.PI * 0.25, -5, 20);
  // the landing spot of the last jump: a flag that stays a while; the record: a tall gold one
  const mark = new THREE.Group(), markSign = { m: null }; { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 8).translate(0, 2, 0), new THREE.MeshStandardMaterial({ color: 0xf3ede1 })); mark.add(p); } mark.visible = false; group.add(mark);
  const rec = new THREE.Group(); { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 8).translate(0, 4.5, 0), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.6, roughness: 0.3 })); rec.add(p); const f = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide, toneMapped: false })); f.position.set(1.2, 8.2, 0); rec.add(f); } rec.visible = false; group.add(rec);
  const tracks = createTracks(group, { max: 7000, life: 15 });

  ctx.scene.add(group);
  let rows = null, live = null, markT = 0, t = 0, lastAir = false, est = null;
  const start = [lane[0] + 16, 0, Math.PI / 2];
  const onDirt = (x, z) => (x > lane[0] - 30 && x < LIP + 2 && Math.abs(z) < lane[2]) || (x > LIP && x < land[1] + 30 && Math.abs(z) < land[2]);
  const fmtRows = r => (r || []).map(x => ({ rank: x.rank, name: x.name, val: (x.score / 100).toFixed(1) + ' m', sub: (x.sub / 1000).toFixed(2) + ' s' }));
  function board(r) {
    rows = r; const me = api.myName();
    for (const s of screens) s.draw(fmtRows(rows), live, me);
    const top = rows && rows[0]; rec.visible = !!top; if (top) rec.position.set(LIP + top.score / 100, 0, land[2] - 6);
  }
  return {
    id: 'flight', A, group, start, crowd,
    spawn: () => arrival(A),
    onRoad: () => false,
    enter() { tracks.clear(); HUD.hint('<kbd>W</kbd> floor it down the lane · <kbd>Shift</kbd> nitro · <kbd>W</kbd>/<kbd>S</kbd>/<kbd>A</kbd>/<kbd>D</kbd> in the air to land it · <kbd>R</kbd> back to the start · <kbd>K</kbd> leave'); this.hud(); },
    leave() { CHEER.stop(); },
    hud() {
      const top = rows && rows[0];
      HUD.bar('Long Jump', 'Lakeside Jump Club', '', '', top ? `Record <b>${(top.score / 100).toFixed(1)} m</b> · ${HUD.who(top.name)}` : 'No record yet: <b>set one</b>');
      HUD.side('Longest jumps', (rows || []).slice(0, 8).map(r => ({ n: `${r.rank}. ${r.name}`, v: `${(r.score / 100).toFixed(1)} m`, me: r.name === api.myName() })));
    },
    onBoard(r) { board(r); this.hud(); },
    onEvent(e) {
      if (e.k !== 'jump') return;
      const mine = e.u === api.myId();
      if (e.bad) { if (mine) HUD.big('NO JUMP', e.bad === 'too fast' || e.bad === 'no gravity' ? 'That flight didn\'t add up.' : 'That one didn\'t count.', 'red small', 2.5); return; }
      live = `LAST: ${String(e.n).toUpperCase()} ${e.d.toFixed(1)} M · ${e.t.toFixed(2)} S`;
      const wr = e.rank === 1 && e.pb, pw = Math.min(1, e.d / 260);
      for (const c of [crowd, crowd2]) c.cheer(wr ? 1 : 0.35 + pw * 0.6, wr ? 6 : 3.5);
      CHEER.burst(wr ? 1 : 0.3 + pw * 0.6, api.near(LIP + e.d, 0, 600));
      if (mine) HUD.big(`${e.d.toFixed(1)} M`, `${e.t.toFixed(2)} s in the air · ${e.v} km/h off the lip${wr ? ' · NEW RECORD!' : e.pb ? ' · personal best' : ''}`, wr ? 'gold' : 'go', 4);
      else api.notify(`<b>${HUD.who(e.n)}</b> jumped ${e.d.toFixed(1)} m${wr ? ': a new record!' : ''}`);
      for (const s of screens) s.draw(fmtRows(rows), live, api.myName());
    },
    key(code) { if (code === 'KeyR') { api.act('reset'); api.placeCar(start, 0, true); tracks.clear(); return true; } return false; },
    update(dt) {
      t += dt; tracks.update(t); crowd.update(dt); crowd2.update(dt); HUD.update(dt);
      // tyre tracks: every car on the dirt here (yours and the others')
      for (const c of api.cars()) if (!c.air && c.speed > 1.5 && onDirt(c.x - o[0], c.z - o[1])) tracks.car(c.id, c.x - o[0], c.y, c.z - o[1], c.rot, c.W, c.L); // grass doesn't take tracks
      // your flight, live: how far past the lip and how long up
      const v = ctx.player.inCar, lx = v ? v.pos.x - o[0] : -1e9;
      if (v && v.air && lx > LIP - 2 && !lastAir) est = { t0: t, z: v.pos.z - o[1] };
      if (v && v.air && est) { const d = Math.max(0, Math.hypot(lx - LIP, v.pos.z - o[1] - est.z)); HUD.bar('Long Jump', 'in the air', `${d.toFixed(0)} M`, 'warn', `${(t - est.t0).toFixed(1)} s`); }
      if (v && !v.air && lastAir && est) { mark.visible = true; mark.position.set(lx, 0, (v.pos.z - o[1] > 0 ? 1 : -1) * (land[2] - 2)); markT = 25; est = null; this.hud(); } // a flag at the edge of the strip, level with where you came down
      lastAir = !!(v && v.air && lx > LIP - 2);
      if (markT > 0 && (markT -= dt) <= 0) mark.visible = false;
      // the stands' murmur
      const f = ctx.focusPos(); const dz = Math.max(0, Math.abs(f.z - o[1]) - Z0), dx = Math.max(0, Math.abs(f.x - o[0] - 240) - 180);
      CHEER.near(Math.hypot(dx, dz), 1); CHEER.update(dt);
    },
    mapBg: '#6f6d49',
    drawMap(g) { // in the world's own metres (games.js sets the transform)
      const rect = (x0, z0, x1, z1, c) => { g.fillStyle = c; g.fillRect(x0, z0, x1 - x0, z1 - z0); };
      rect(lane[0], -lane[2], LIP, lane[2], '#a3835c'); rect(LIP, -land[2], land[1], land[2], '#a3835c'); rect(0, -HW, LIP, HW, '#c0874a');
      for (const [cx, len] of SECT) for (const s of [-1, 1]) rect(cx - len / 2, s > 0 ? Z0 : -Z0 - 7, cx + len / 2, s > 0 ? Z0 + 7 : -Z0, '#9aa0a8');
      if (rows && rows[0]) rect(LIP + rows[0].score / 100 - 1.5, -land[2], LIP + rows[0].score / 100 + 1.5, land[2], '#ffd23f');
    },
  };
}
