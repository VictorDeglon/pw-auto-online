// The crew garages in Poway: a steel shed by the road per garage, one roll-up door per game, lit signs, chevrons on
// the driveway. Online the doors are up and the inside is a ramp down into the dark; drive in and games.js takes it
// from there. Offline the shutters are down (and solid).
//   buildGarages()            once, after the world is built
//   updateGarages(dt, open)   every frame: open = the crew garages can be used (online: the game server, or this browser)
//   shutDoorNear()            in front of a shut door (the games say why)
//   garageTrigger()           -> { g, G, bay } when the player's car is rolling in through a door, else null
//   garageMarks()             markers for both maps
import { ctx } from '../ctx.js';
import { DEFS } from './defs.js';
import { canvasTex, concreteTex, FONT_D, FONT_U } from './kit.js';

export const GAME_COLORS = { flight: '#ffb020', hide: '#ff4fd8', race0: '#3df2ff', race1: '#7dff6a', race2: '#ff5d3d' };
const LABEL = { flight: 'LONG JUMP', hide: 'HIDE & SEEK', race0: 'CIRCUIT', race1: 'CANYON SPRINT', race2: 'SPEEDWAY' };
const D = 22, H = 9, DOOR_H = 5.4;
const built = [];
let mats = null;

function materials() {
  if (mats) return mats;
  const { THREE } = ctx;
  const clad = canvasTex(256, 256, (g, w, h) => { // ribbed steel cladding
    g.fillStyle = '#7a8088'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#5f656d'); gr.addColorStop(0.5, '#9aa0a8'); gr.addColorStop(1, '#5f656d'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); }
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 6 + Math.random() * 30);
  }, [4, 2]);
  const shutter = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#8d939b'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 12) { g.fillStyle = '#6d737b'; g.fillRect(0, y, w, 3); g.fillStyle = '#a7adb5'; g.fillRect(0, y + 4, w, 2); } }, [1, 2]);
  const tunnel = canvasTex(512, 512, (g, w, h) => { // the way down, painted on the back wall: a ramp into a lit tunnel
    g.fillStyle = '#07080b'; g.fillRect(0, 0, w, h);
    const vx = w / 2, vy = h * 0.42;
    for (let i = 0; i < 18; i++) { const k = i / 18, a = 1 - k; g.fillStyle = `rgba(255,190,90,${0.85 * a})`; const y = vy + (h - vy) * Math.pow(a, 1.6) * 0.98, s = 14 * a + 1;
      g.fillRect(vx - (w * 0.42) * Math.pow(a, 1.6) - s / 2, y - s * 0.3, s, s * 0.35); g.fillRect(vx + (w * 0.42) * Math.pow(a, 1.6) - s / 2, y - s * 0.3, s, s * 0.35); }
    const gr = g.createRadialGradient(vx, vy, 4, vx, vy, w * 0.5); gr.addColorStop(0, 'rgba(255,170,70,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, h); g.lineTo(vx - 6, vy + 4); g.lineTo(vx + 6, vy + 4); g.lineTo(w, h); g.stroke();
    g.fillStyle = '#f0b23a'; for (let i = 0; i < 6; i++) { const a = 1 - i / 6, y = vy + (h - vy) * Math.pow(a, 1.6); g.fillRect(vx - 3 * a - 1, y - 8 * a, 6 * a + 2, 12 * a + 1); } // centre line
  });
  // chevrons pointing in (the top of the canvas is the far end of a draped plane: deeper inside)
  const chevs = (g, w, h, n, fade) => { g.fillStyle = 'rgba(240,178,58,.9)'; for (let i = 0; i < n; i++) { const y = h - 70 - i * (h - 60) / n; g.globalAlpha = fade ? 0.95 - i * 0.2 : 0.9; g.beginPath(); g.moveTo(w * 0.18, y + 60); g.lineTo(w * 0.5, y); g.lineTo(w * 0.82, y + 60); g.lineTo(w * 0.82, y + 86); g.lineTo(w * 0.5, y + 26); g.lineTo(w * 0.18, y + 86); g.closePath(); g.fill(); } g.globalAlpha = 1; };
  const floor = canvasTex(256, 512, (g, w, h) => { // concrete going dark toward the back
    const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#5a5a58'); gr.addColorStop(1, '#0a0a0c'); g.fillStyle = gr; g.fillRect(0, 0, w, h); chevs(g, w, h, 4, true);
  });
  const chevron = canvasTex(256, 512, (g, w, h) => { g.clearRect(0, 0, w, h); chevs(g, w, h, 3, false); });
  mats = {
    clad: new THREE.MeshStandardMaterial({ map: clad, roughness: 0.5, metalness: 0.35 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xff7a2f, roughness: 0.5, metalness: 0.3 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8, metalness: 0.4 }),
    base: new THREE.MeshStandardMaterial({ map: concreteTex([3, 1]), roughness: 0.95 }),
    inside: new THREE.MeshBasicMaterial({ color: 0x050608 }),
    tunnel: new THREE.MeshBasicMaterial({ map: tunnel, toneMapped: false }),
    floor: new THREE.MeshBasicMaterial({ map: floor, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    shutter: new THREE.MeshStandardMaterial({ map: shutter, roughness: 0.45, metalness: 0.7 }),
    chevron: new THREE.MeshBasicMaterial({ map: chevron, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  };
  return mats;
}
function signTex(text, sub, color, w = 1024, h = 256) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = '#0b0e15'; g.fillRect(0, 0, w, h); g.strokeStyle = color; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = color;
    let fs = h * 0.5; g.font = `400 ${fs}px ${FONT_D}`; while (g.measureText(text).width > w * 0.9) { fs *= 0.92; g.font = `400 ${fs}px ${FONT_D}`; }
    g.fillText(text, w / 2, sub ? h * 0.42 : h * 0.54);
    if (sub) { g.shadowBlur = 0; g.fillStyle = '#f3ede1'; g.font = `600 ${h * 0.16}px ${FONT_U}`; g.fillText(sub, w / 2, h * 0.78); }
  });
}
// a mesh that follows the ground (the inside floor, the driveway chevrons): n x n quads over w x d around the
// building's local frame, lifted a little
function drape(G, cx, cz, w, d, n, mat, lift = 0.06) {
  const { THREE } = ctx, geo = new THREE.PlaneGeometry(w, d, n, n).rotateX(-Math.PI / 2), P = geo.attributes.position, c = Math.cos(G.face), s = Math.sin(G.face);
  for (let i = 0; i < P.count; i++) { // local: x across the front, z out toward the street
    const lx = P.getX(i) + cx, lz = P.getZ(i) + cz, wx = G.x + lx * c + lz * s, wz = G.z - lx * s + lz * c;
    P.setXYZ(i, wx, ctx.heightAt(wx, wz) + lift, wz);
  }
  geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; return m;
}

export function buildGarages() {
  if (built.length) return;
  const { THREE, scene } = ctx, M = materials();
  for (const G of DEFS.GARAGES) {
    const n = G.bays.length, W = Math.max(26, n * 9.5 + 8), grp = new THREE.Group(), fx = Math.sin(G.face), fz = Math.cos(G.face);
    // the frame: x across the front (+x is the building's right as you look at it from the street... the group's own x),
    // z out of the front toward the street, origin at the middle of the front wall on the ground
    let y0 = Infinity, y1 = -Infinity;
    for (const [a, b] of [[-W / 2, 0], [W / 2, 0], [-W / 2, -D], [W / 2, -D], [0, -D / 2]]) { const h = ctx.heightAt(G.x + a * fz + b * fx, G.z - a * fx + b * fz); y0 = Math.min(y0, h); y1 = Math.max(y1, h); }
    const yd = ctx.heightAt(G.x, G.z); grp.position.set(G.x, yd, G.z); grp.rotation.y = G.face;
    const lo = y0 - yd - 3, top = y1 - yd + H + (n > 1 ? 2 : 0), box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); o.castShadow = o.receiveShadow = true; grp.add(o); return o; };
    box(0.6, top - lo, D, -W / 2, lo, -D / 2, M.clad); box(0.6, top - lo, D, W / 2, lo, -D / 2, M.clad); box(W, top - lo, 0.6, 0, lo, -D, M.clad); // sides, back
    box(W + 1.4, 0.7, D + 1.4, 0, top, -D / 2, M.roof); box(W + 1.6, 0.35, 0.5, 0, top - 0.1, 0.45, M.trim);
    // the front: pillars between the doors, a lintel over them
    const doors = [], xs = G.bays.map((_, i) => (i - (n - 1) / 2) * 9.5);
    const edges = [-W / 2, ...xs.flatMap(x => [x - DEFS.BAY_W / 2, x + DEFS.BAY_W / 2]), W / 2];
    for (let i = 0; i < edges.length; i += 2) { const a = edges[i], b = edges[i + 1]; if (b - a > 0.05) box(b - a, DOOR_H - lo, 0.7, (a + b) / 2, lo, 0, M.clad); }
    box(W, top - DOOR_H, 0.7, 0, DOOR_H, 0, M.clad); box(W, 0.3, 0.8, 0, DOOR_H - 0.15, 0.05, M.trim);
    // inside: black, the painted way down on the back wall, a floor that follows the ground
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.2, top - lo), M.inside); back.position.set(0, (top + lo) / 2, -D + 0.32); grp.add(back);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.2, D - 1).rotateX(Math.PI / 2), M.inside); ceil.position.set(0, top - 0.05, -D / 2); grp.add(ceil);
    for (const s of [-1, 1]) { const sd = new THREE.Mesh(new THREE.PlaneGeometry(D - 1, top - lo).rotateY(s * Math.PI / 2), M.inside); sd.position.set(-s * (W / 2 - 0.32), (top + lo) / 2, -D / 2); grp.add(sd); }
    scene.add(grp); grp.updateMatrixWorld(true);
    G.bays.forEach((g, i) => {
      const x = xs[i], color = GAME_COLORS[g];
      const tun = new THREE.Mesh(new THREE.PlaneGeometry(DEFS.BAY_W + 1, DOOR_H + 1), M.tunnel); tun.position.set(x, DOOR_H / 2 + 0.2, -D + 0.4); grp.add(tun);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(DEFS.BAY_W + 0.6, 1.5), new THREE.MeshBasicMaterial({ map: signTex(LABEL[g], DEFS.ARENAS[g].name.toUpperCase(), color, 512, 128), toneMapped: false }));
      sign.position.set(x, DOOR_H + 1.15, 0.4); grp.add(sign);
      const sh = new THREE.Mesh(new THREE.BoxGeometry(DEFS.BAY_W, DOOR_H, 0.2), M.shutter); sh.position.set(x, DOOR_H / 2, -0.1); sh.castShadow = true; grp.add(sh);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(DEFS.BAY_W, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), toneMapped: false })); lamp.position.set(x, DOOR_H - 0.4, 0.42); grp.add(lamp);
      const door = DEFS.bayDoor(G, i);
      doors.push({ g, i, x, sh, lamp, door, open: 0 });
      // the floor inside and the chevrons outside, draped on the ground in world space
      scene.add(drape(G, x, -D / 2 + 0.4, DEFS.BAY_W - 0.2, D - 1.4, 8, M.floor, 0.05));
      const chev = drape(G, x, 5.5, DEFS.BAY_W - 1.2, 9, 6, M.chevron, 0.07); chev.rotation.set(0, 0, 0); scene.add(chev);
    });
    // the name over the whole front
    const big = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(W - 2, 22), 2.6), new THREE.MeshBasicMaterial({ map: signTex(G.name.toUpperCase(), n > 1 ? 'CREW GARAGE · THREE COURSES' : 'CREW GARAGE', '#ff7a2f'), toneMapped: false }));
    big.position.set(0, top - 1.8 > DOOR_H + 2.6 ? top - 1.6 : top + 1.7, 0.45); grp.add(big);
    if (big.position.y > top) { const post = new THREE.Mesh(new THREE.BoxGeometry(Math.min(W - 2, 22) + 0.4, 2.9, 0.3), M.roof); post.position.set(0, big.position.y, 0.25); grp.add(post); }
    // collision: the walls (the doorways stay open; a closed shutter is its own wall)
    const toW = (lx, lz) => [G.x + lx * fz + lz * fx, G.z - lx * fx + lz * fz], poly = (pts, base, topY) => ctx.addPoly(pts.flatMap(p => toW(p[0], p[1])), yd + base, yd + topY);
    const t = 0.35;
    poly([[-W / 2 - t, 0.35], [-W / 2 + t, 0.35], [-W / 2 + t, -D - t], [-W / 2 - t, -D - t]], lo, top); poly([[W / 2 - t, 0.35], [W / 2 + t, 0.35], [W / 2 + t, -D - t], [W / 2 - t, -D - t]], lo, top);
    poly([[-W / 2, -D + t], [W / 2, -D + t], [W / 2, -D - t], [-W / 2, -D - t]], lo, top);
    for (let i = 0; i < edges.length; i += 2) { const a = edges[i], b = edges[i + 1]; if (b - a > 0.05) poly([[a, 0.35], [b, 0.35], [b, -0.35], [a, -0.35]], lo, top); }
    for (const d of doors) { const ps = ctx.polys, k = ps ? ps.length : -1; poly([[d.x - DEFS.BAY_W / 2, 0.1], [d.x + DEFS.BAY_W / 2, 0.1], [d.x + DEFS.BAY_W / 2, -0.3], [d.x - DEFS.BAY_W / 2, -0.3]], lo, DOOR_H); d.poly = ps ? ps[k] : null; }
    built.push({ G, grp, doors, W });
  }
}

let hintT = 0;
export function updateGarages(dt, open) {
  for (const B of built) for (const d of B.doors) {
    const want = open ? 1 : 0; d.open += Math.sign(want - d.open) * Math.min(Math.abs(want - d.open), dt * 0.5);
    d.sh.scale.y = 1 - d.open * 0.85; d.sh.position.y = DOOR_H * (1 - d.sh.scale.y / 2); // rolls up into the lintel
    if (d.poly) d.poly.dead = d.open > 0.9;
  }
  hintT = Math.max(0, hintT - dt);
}
// in front of a shut door (within 14 m, on the street side): the games say why it's shut
export function shutDoorNear() {
  const p = ctx.player, pos = p.inCar ? p.inCar.pos : p.pos;
  for (const B of built) for (const d of B.doors) {
    if (d.open > 0.5) continue;
    const dx = Math.sin(d.door.rot), dz = Math.cos(d.door.rot), u = (pos.x - d.door.x) * dx + (pos.z - d.door.z) * dz, w = (pos.x - d.door.x) * dz - (pos.z - d.door.z) * dx;
    if (u > -14 && u < 1 && Math.abs(w) < DEFS.BAY_W) return true;
  }
  return false;
}
// the player's car rolling in through an open door, at least 2.5 m inside
export function garageTrigger() {
  const p = ctx.player, v = p.inCar;
  for (const B of built) for (const d of B.doors) {
    if (d.open < 0.9) continue;
    const pos = v ? v.pos : p.pos, dx = Math.sin(d.door.rot), dz = Math.cos(d.door.rot);
    const u = (pos.x - d.door.x) * dx + (pos.z - d.door.z) * dz, w = (pos.x - d.door.x) * dz - (pos.z - d.door.z) * dx;
    if (u < 2.5 || u > D - 3 || Math.abs(w) > DEFS.BAY_W / 2 + 0.5) continue;
    if (!v) { if (!hintT) { ctx.notify('Crew garages are drive-in: bring a car.', '', 2500); hintT = 6; } return null; }
    if (v.vel.x * dx + v.vel.y * dz < 1) continue; // rolling in, not backing out (or being put out after a game)
    return { g: d.g, G: B.G, bay: d.i, door: d.door };
  }
  return null;
}
export function garageMarks() {
  return DEFS.GARAGES.map(G => ({ kind: 'icon', pri: 3, x: G.x, z: G.z, glyph: 'crew', color: '#ffb020', label: `${G.name} · ${G.bays.map(g => DEFS.ARENAS[g].name).join(', ')}`, group: 'crew', plural: 'crew garages', always: true }));
}
