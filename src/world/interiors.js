// Walk-in shops: the storefront you come up to on foot opens. Its painted room on the glass gives way to clear glass and
// the real one behind it: a room the width of the store's bay and as deep as its building, a stockroom behind a
// partition, furnished the way its trade furnishes a room (src/world/shops.js says the trade): a pizza place's counter,
// oven, menus and booths; a café's espresso bar and pastry case; a barber's chairs and mirrors; a nail salon's pedicure
// thrones and polish wall; a bank's teller line; a market's stocked aisles and checkouts; a liquor store's coolers; a
// gym's racks; an office's desks. Its walls stop you, its floor is level, and the camera keeps inside it. A room is only
// built when you're on foot at its door (OPEN_M), two stores at most are open at once, and one closes again (its meshes
// and collision freed) once you've walked CLOSE_M off.
//   const INT = createInteriors({ THREE, scene, SHOPS, heightAt, addPoly, polys, poly(B) })
//   INT.update(px, pz, onFoot)   INT.floorAt(x, z) -> the floor's height in an open store, or null
//   INT.roomAt(x, z) -> the open store you're in, or null   INT.clampCam(room, v3)   INT.isOpen(store)
const GLASS_BACK = 0.3; // the room starts just behind the storefront's glass (the wall's thickness)
const OPEN_M = 7, CLOSE_M = 15; // a room is built when you come within OPEN_M of its storefront, and goes past CLOSE_M

function rng(seed) { let s = seed >>> 0 || 1; return () => (s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), ((s ^= s >>> 16) >>> 0) / 4294967296); }

export function createInteriors(o) {
  const { THREE, scene, SHOPS, heightAt } = o;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05, emissive: 0x262626, side: THREE.DoubleSide });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const clear = new THREE.MeshStandardMaterial({ color: 0xcfe3ea, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const open = []; // { store, b, group, polys, cut, floor, frame }

  function build(store) {
    const b = store.bay, w = b.w, r = rng(b.h || 7);
    const W = b.width - 0.12, u0 = b.c - W / 2;
    // the floor: level with the walk at the door. Where the building is cut into a slope the room ends at the hill (its
    // back wall a retaining wall), never a floor raised to the ground behind it.
    let D = Math.max(6, Math.min(b.depth - 0.4, 28)); const ground = v => Math.max(...[0.05, 0.5, 0.95].map(fu => heightAt(w.ax + w.ux * (u0 + W * fu) - w.nx * (GLASS_BACK + v), w.az + w.uz * (u0 + W * fu) - w.nz * (GLASS_BACK + v))));
    let gmax = -1e9; for (let v = 0.5; v < D; v += 0.5) gmax = Math.max(gmax, ground(v));
    const fy = Math.min(b.base + 0.35, Math.max(b.base, gmax + 0.03)); // over the ground inside, up a step at the door at most
    for (let v = 1; v < D; v += 0.5) if (ground(v) > fy - 0.02) { D = v - 0.3; break; }
    if (D < 4) return null; // too shallow to walk into: the painted room stays
    const H = Math.max(3.0, Math.min(4.2, b.top - fy - 0.5)), back = D * (b.cat === 'market' || b.cat === 'pharmacy' ? 0.86 : 0.74); // the stockroom behind
    // room space: x along the storefront from its left end, z inward from the glass, y up from the floor
    const P = (x, z, y) => [w.ax + w.ux * (u0 + x) - w.nx * (GLASS_BACK + z), fy + y, w.az + w.uz * (u0 + x) - w.nz * (GLASS_BACK + z)];
    const N = (x, z) => [w.ux * x - w.nx * z, 0, w.uz * x - w.nz * z]; // a direction in room space
    const G = { p: [], n: [], c: [] }, L = { p: [], n: [], c: [] }, col = new THREE.Color();
    const rgb = c => typeof c === 'number' ? (col.setHex(c), [col.r, col.g, col.b]) : c;
    const quad = (T, a, bb, cc, d, n, c) => { const cc3 = rgb(c); for (const v of [a, bb, cc, a, cc, d]) { T.p.push(...v); T.n.push(...n); T.c.push(...cc3); } };
    // an axis-aligned box in room space, x0..x1, y0..y1, z0..z1 (no bottom)
    const box = (x0, x1, y0, y1, z0, z1, c, T = G) => { const cc = rgb(c), top = cc.map(v => Math.min(1, v * 1.08)), side = cc.map(v => v * 0.88);
      quad(T, P(x0, z0, y1), P(x1, z0, y1), P(x1, z1, y1), P(x0, z1, y1), [0, 1, 0], top);
      quad(T, P(x0, z0, y0), P(x1, z0, y0), P(x1, z0, y1), P(x0, z0, y1), N(0, -1), cc); quad(T, P(x1, z1, y0), P(x0, z1, y0), P(x0, z1, y1), P(x1, z1, y1), N(0, 1), cc);
      quad(T, P(x0, z1, y0), P(x0, z0, y0), P(x0, z0, y1), P(x0, z1, y1), N(-1, 0), side); quad(T, P(x1, z0, y0), P(x1, z1, y0), P(x1, z1, y1), P(x1, z0, y1), N(1, 0), side); };
    const cyl = (x, z, y0, y1, rad, c, seg = 8, T = G) => { const cc = rgb(c); for (let k = 0; k < seg; k++) { const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2, ca = Math.cos(a0), sa = Math.sin(a0), cb = Math.cos(a1), sb = Math.sin(a1);
      quad(T, P(x + ca * rad, z + sa * rad, y0), P(x + cb * rad, z + sb * rad, y0), P(x + cb * rad, z + sb * rad, y1), P(x + ca * rad, z + sa * rad, y1), N((ca + cb) / 2, (sa + sb) / 2), cc);
      const t = P(x, z, y1); for (const v of [P(x + cb * rad, z + sb * rad, y1), P(x + ca * rad, z + sa * rad, y1), t]) { T.p.push(...v); T.n.push(0, 1, 0); T.c.push(...cc.map(q => Math.min(1, q * 1.08))); } } };
    const solids = []; const solid = (x0, x1, z0, z1, y1 = 2.6) => solids.push([x0, x1, z0, z1, y1]); // collision, room space
    const hue = (hh, s, l) => { col.setHSL(hh, s, l); return [col.r, col.g, col.b]; };

    // ---- the shell: floor, walls with a base and a chair rail, a ceiling of tiles with light panels, the stockroom wall
    const pal = b.cat === 'fitness' && STUDIO.test(b.name) ? ROOM_LOOK.studio : ROOM_LOOK[b.cat] || ROOM_LOOK.retail, wallC = pal.wall[(b.h >>> 4) % pal.wall.length];
    const T = pal.tile; // the floor: a grid of tiles in two tones
    for (let x = 0; x < W - 0.01; x += T) for (let z = 0; z < D - 0.01; z += T) { const k = (Math.floor(x / T) + Math.floor(z / T)) & 1; quad(G, P(x, z, 0), P(x, Math.min(D, z + T), 0), P(Math.min(W, x + T), Math.min(D, z + T), 0), P(Math.min(W, x + T), z, 0), [0, 1, 0], k ? pal.floor[0] : pal.floor[1]); }
    const wall = (x0, z0, x1, z1, nx, nz) => { quad(G, P(x0, z0, 0), P(x1, z1, 0), P(x1, z1, H), P(x0, z0, H), N(nx, nz), wallC); quad(G, P(x0, z0, 0.01), P(x1, z1, 0.01), P(x1, z1, 0.14), P(x0, z0, 0.14), N(nx, nz), 0x3a3632); };
    wall(0, D, 0, 0, 1, 0); wall(W, 0, W, D, -1, 0); wall(W, D, 0, D, 0, -1);
    quad(G, P(0, D, H), P(W, D, H), P(W, 0, H), P(0, 0, H), [0, -1, 0], 0xeceae4); // the ceiling
    for (let x = 0.6; x < W; x += 0.6) box(x - 0.012, x + 0.012, H - 0.02, H - 0.005, 0, D, 0xb8b6b0); for (let z = 0.6; z < D; z += 0.6) box(0, W, H - 0.02, H - 0.005, z - 0.012, z + 0.012, 0xb8b6b0);
    for (let x = 1.2; x < W - 0.5; x += 2.4) for (let z = 1.2; z < D - 0.5; z += 2.4) box(x - 0.58, x + 0.58, H - 0.03, H - 0.012, z - 0.28, z + 0.28, [1, 0.98, 0.93], L); // light panels
    // the stockroom: a partition with a door, boxes on racks behind it
    box(0, W, 0, H, back, back + 0.12, wallC); const sd = W > 4 ? W - 1.4 : W / 2; box(sd - 0.5, sd + 0.5, 0, 2.1, back - 0.02, back + 0.14, 0x6b5848); box(sd - 0.06, sd + 0.06, 2.12, 2.3, back - 0.04, back - 0.02, 0xc8102e, L); // its door, an EXIT light
    for (let x = 0.3; x < W - 0.8; x += 1.4) { box(x, x + 1.1, 0, 2.2, D - 0.7, D - 0.1, 0x5a6470); for (const y of [0.1, 0.8, 1.5]) for (let q = 0; q < 3; q++) box(x + 0.05 + q * 0.35, x + 0.37 + q * 0.35, y, y + 0.32 + r() * 0.2, D - 0.65, D - 0.2, [0.62 + r() * 0.1, 0.5 + r() * 0.08, 0.36]); }
    solid(0, W, back - 0.02, back + 0.14); // (the stockroom's door is staff only)
    // ---- the trade's room
    const F = FURNISH[pal.kind] || FURNISH.shop; F({ box, cyl, quad, P, N, G, L, W, D: back, H, r, hue, rgb, solid, b, pal });
    // the inside of the storefront: the glass (clear now), its mullions from behind, the door standing open
    const gl = b.gw, gx0 = W / 2 - gl / 2, dx = b.dc - u0, yb = b.base - fy; // (the storefront stands on the ground at its door)
    // ---- meshes
    const group = new THREE.Group(); group.name = 'shop:' + store.name;
    for (const [T2, m] of [[G, mat], [L, glow]]) { if (!T2.p.length) continue; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(T2.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(T2.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(T2.c, 3)); g.computeBoundingSphere(); const me = new THREE.Mesh(g, m); me.matrixAutoUpdate = false; group.add(me); }
    { const g = new THREE.BufferGeometry(), V = []; for (const [a0, a1] of [[gx0, dx - b.dw / 2], [dx + b.dw / 2, gx0 + gl]]) if (a1 - a0 > 0.05) { const p = [P(a0, -0.22, yb + 0.4), P(a1, -0.22, yb + 0.4), P(a1, -0.22, yb + b.gh), P(a0, -0.22, yb + 0.4), P(a1, -0.22, yb + b.gh), P(a0, -0.22, yb + b.gh)]; for (const v of p) V.push(...v); }
      if (V.length) { g.setAttribute('position', new THREE.Float32BufferAttribute(V, 3)); g.computeVertexNormals(); const me = new THREE.Mesh(g, clear); me.renderOrder = 2; group.add(me); } }
    scene.add(group);
    // ---- collision: the room's walls (the glass front with its doorway), and the building's own mass let go inside it
    const ids = [], toW = (x, z) => { const p = P(x, z, 0); return [p[0], p[2]]; };
    const addBox = (x0, x1, z0, z1, y1) => { const q = [...toW(x0, z0), ...toW(x1, z0), ...toW(x1, z1), ...toW(x0, z1)]; o.addPoly(q, fy - 0.3, fy + y1); ids.push(o.polys.length - 1); };
    addBox(-0.15, 0.05, 0, D, H); addBox(W - 0.05, W + 0.15, 0, D, H); addBox(0, W, D - 0.05, D + 0.15, H);
    addBox(-0.15, dx - b.dw / 2, -0.32, -0.12, H); addBox(dx + b.dw / 2, W + 0.15, -0.32, -0.12, H); // the glass, either side of the door
    for (const [x0, x1, z0, z1, y1] of solids) addBox(x0, x1, z0, z1, y1);
    const BP = o.poly(b.B), cc = P(W / 2, (D - 1.1) / 2, 0), cut = { cx: cc[0], cz: cc[2], ux: w.ux, uz: w.uz, hu: W / 2 + 0.2, hv: (D + 1.1) / 2 }; // from a metre out in front of the glass (you'd stop short of the door) to the back
    if (BP) (BP.cut || (BP.cut = [])).push(cut);
    SHOPS.paintedGlass(b, false);
    const rc = P(W / 2, D / 2, 0);
    return { store, b, group, ids, cut, BP, fy, H, W, D, u0, P, w, rc, aside: null };
  }
  function close(R) {
    scene.remove(R.group); R.group.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    for (const i of R.ids) { const p = o.polys[i]; if (p) { p.dead = true; p.gone = true; } }
    if (R.BP && R.BP.cut) R.BP.cut = R.BP.cut.filter(c => c !== R.cut); if (R.aside) R.aside();
    SHOPS.paintedGlass(R.b, true);
  }
  const local = (R, x, z) => { const dx = x - R.w.ax, dz = z - R.w.az, u = dx * R.w.ux + dz * R.w.uz - R.u0, v = -(dx * R.w.nx + dz * R.w.nz) - GLASS_BACK; return [u, v]; };
  const inRoom = (R, x, z, m = 0) => { const [u, v] = local(R, x, z); return u > -m && u < R.W + m && v > -0.2 - m && v < R.D + m; };
  let t = 0; const shallow = new Set(); // stores whose building is cut into the hill too close behind the glass
  return {
    update(px, pz, onFoot) {
      for (const R of open) { const ins = inRoom(R, px, pz, 0.3); // while you're inside, the trees whose crowns reach through its walls step aside
        if (ins && !R.aside) R.aside = o.plantsAside ? o.plantsAside(R.rc[0], R.rc[2], R.w.ux, R.w.uz, R.W / 2, R.D / 2) : () => {}; else if (!ins && R.aside) { R.aside(); R.aside = null; } }
      if ((t -= 1) > 0) return; t = 8;
      for (let i = open.length - 1; i >= 0; i--) { const R = open[i]; if (Math.hypot(px - R.store.x, pz - R.store.z) > CLOSE_M && !inRoom(R, px, pz, 1)) { close(R); open.splice(i, 1); } }
      if (!onFoot) return;
      let best = null, bd = OPEN_M; for (const s of SHOPS.stores) { if (!s.bay || s.B.dead || !s.bay.C || !s.bay.C.built || shallow.has(s)) continue; const d = Math.hypot(px - s.x, pz - s.z); if (d < bd && !open.some(R => R.store === s)) { bd = d; best = s; } }
      if (!best) return; if (open.length >= 2) { const far = open.slice().sort((a, b) => Math.hypot(px - b.store.x, pz - b.store.z) - Math.hypot(px - a.store.x, pz - a.store.z))[0]; if (inRoom(far, px, pz, 1)) return; close(far); open.splice(open.indexOf(far), 1); }
      try { const R = build(best); if (R) open.push(R); else shallow.add(best); } catch (e) { shallow.add(best); console.warn('[interiors]', best.name, e); }
    },
    floorAt(x, z) { for (const R of open) if (inRoom(R, x, z)) return R.fy; return null; },
    roomAt(x, z) { for (const R of open) if (inRoom(R, x, z)) return R; return null; },
    clampCam(R, v) { const [u, w2] = local(R, v.x, v.z), cu = Math.max(0.35, Math.min(R.W - 0.35, u)), cv = Math.max(0.1, Math.min(R.D - 0.35, w2)); if (cu !== u || cv !== w2) { const p = R.P(cu, cv, 0); v.x = p[0]; v.z = p[2]; } v.y = Math.max(R.fy + 0.6, Math.min(R.fy + R.H - 0.3, v.y)); },
    isOpen(s) { return open.some(R => R.store === s); },
    get open() { return open; },
  };
}

// ---- how each trade's room looks: walls, floor tiles (two tones, size), and what furnishes it
const ROOM_LOOK = {
  pizza: { kind: 'diner', wall: [0xe9dcc0, 0xd7c3a1], floor: [0xb5121b, 0xf1ede4], tile: 0.4 }, burger: { kind: 'diner', wall: [0xf0e6d2, 0x2b2b2b], floor: [0x2b2b2b, 0xe9e5dc], tile: 0.5 },
  mexican: { kind: 'diner', wall: [0xe8b44a, 0xd8673a, 0x3f8f6b], floor: [0x9a5a3a, 0xb06a48], tile: 0.45 }, wings: { kind: 'diner', wall: [0x1f3b2b, 0xe9e2d0], floor: [0x6b4a32, 0x7a5a3a], tile: 0.6 },
  sandwich: { kind: 'counter', wall: [0xe7efe1, 0xf1ead8], floor: [0x8a8478, 0x9a948a], tile: 0.6 }, sweets: { kind: 'counter', wall: [0xf7d7e4, 0xfff1d6], floor: [0xf0f0f0, 0xe3a6c3], tile: 0.3 },
  asian: { kind: 'restaurant', wall: [0x5a2a22, 0x2b2b2b, 0xd9c7a8], floor: [0x3a2a20, 0x4a3628], tile: 0.9 }, indian: { kind: 'restaurant', wall: [0x7a2a2a, 0xd8a24a], floor: [0x4a3628, 0x5a4232], tile: 0.9 },
  cafe: { kind: 'cafe', wall: [0x4a3424, 0xe7ddd0, 0x2f4a3a], floor: [0x6b4a32, 0x7a563a], tile: 0.2 },
  barber: { kind: 'barber', wall: [0xe9e4da, 0x1b365d], floor: [0x111111, 0xeeeeee], tile: 0.3 }, salon: { kind: 'salon', wall: [0xefe6e6, 0xd8cfc4, 0x2b2b2b], floor: [0xd8d4ce, 0xcac5be], tile: 0.6 },
  nails: { kind: 'nails', wall: [0xf6e9ee, 0xe9e1f3], floor: [0xf2f0ee, 0xe4e0dc], tile: 0.6 }, spa: { kind: 'spa', wall: [0xd9d0c0, 0x8a7a66], floor: [0x6b5848, 0x75614f], tile: 0.9 },
  bank: { kind: 'bank', wall: [0xe5e2dc, 0x1b365d], floor: [0x3a4450, 0x404a56], tile: 0.6 }, pharmacy: { kind: 'market', wall: [0xf3f1ec], floor: [0xe9e7e2, 0xdedbd5], tile: 0.6 },
  market: { kind: 'market', wall: [0xf3f1ec, 0xe8f0e2], floor: [0xd9d4ca, 0xcfc9be], tile: 0.6 }, liquor: { kind: 'liquor', wall: [0x2c2a28, 0x3a3532], floor: [0x6a645c, 0x5f5952], tile: 0.6 },
  cleaners: { kind: 'cleaners', wall: [0xe7e9ec, 0xdde3ea], floor: [0xbfc3c7, 0xb3b7bb], tile: 0.6 }, pets: { kind: 'shop', wall: [0xe7f0f6, 0xf6efe0], floor: [0xcfc9be, 0xd9d4ca], tile: 0.6 },
  studio: { kind: 'studio', wall: [0xf1ece3, 0xe3e9e4, 0xd9e2ea], floor: [0xb38c5f, 0xa98257], tile: 0.22 },
  fitness: { kind: 'gym', wall: [0x3b3f44, 0x2b2b2b], floor: [0x1b1b1b, 0x222222], tile: 1.0 }, phone: { kind: 'shop', wall: [0xf2f2f2, 0xe8e8e8], floor: [0xd8d8d8, 0xcccccc], tile: 0.6 },
  office: { kind: 'office', wall: [0xe9e7e1, 0xd6dde3], floor: [0x5a6068, 0x606670], tile: 0.6 }, retail: { kind: 'shop', wall: [0xf2f0ec, 0xe9ecef], floor: [0xd8d4ce, 0xcdc8c1], tile: 0.6 },
  vacant: { kind: 'vacant', wall: [0xbdb8ae], floor: [0x8f8a82, 0x96918a], tile: 1.2 },
};

// ---- furnishing a room, in room space: x along the glass (0..W), z inward from it (0..D, the stockroom wall), y up
// helpers in K: box(x0,x1, y0,y1, z0,z1, colour, [L for lit]), cyl(x, z, y0, y1, r, colour), solid(x0,x1, z0,z1) for
// collision, r() random, hue(h, s, l)
const STUDIO = /yoga|pilates|barre|dance|ballet|karate|martial|taekwondo|jiu|judo|kung fu|kickbox|boxing|mma|cycle|spin/i; // a fitness tenant that teaches classes: a studio, not a weight room
const DARK = 0x1c1b1a, STEEL = 0xa9adb2, WOOD = 0x7a5a3a, WHITE = 0xf2f0ea;
function chair(K, x, z, rot, c) { const { box } = K, s = rot ? -1 : 1; box(x - 0.21, x + 0.21, 0.44, 0.48, z - 0.21, z + 0.21, c); box(x - 0.21, x + 0.21, 0.48, 0.92, z + s * 0.17, z + s * 0.21, c); for (const [a, b2] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) box(x + a - 0.015, x + a + 0.015, 0, 0.44, z + b2 - 0.015, z + b2 + 0.015, DARK); }
function table(K, x, z, w, d, top, h = 0.76) { const { box } = K; box(x - w / 2, x + w / 2, h - 0.04, h, z - d / 2, z + d / 2, top); box(x - 0.04, x + 0.04, 0, h - 0.04, z - 0.04, z + 0.04, DARK); box(x - 0.25, x + 0.25, 0, 0.03, z - 0.25, z + 0.25, DARK); }
function menuBoards(K, x0, x1, y0, c, z) { const { box } = K, n = Math.max(1, Math.floor((x1 - x0) / 1.3)), w = (x1 - x0) / n; for (let k = 0; k < n; k++) { const a = x0 + k * w + 0.05, bb = a + w - 0.1; box(a, bb, y0, y0 + 0.75, z - 0.04, z, c, K.L); for (let r = 0; r < 6; r++) box(a + 0.08, a + 0.08 + (bb - a) * (0.4 + K.r() * 0.4), y0 + 0.1 + r * 0.1, y0 + 0.13 + r * 0.1, z - 0.045, z - 0.04, 0xffffff, K.L); } }
function register(K, x, y, z) { const { box } = K; box(x - 0.2, x + 0.2, y, y + 0.08, z - 0.15, z + 0.15, 0x2a2a2a); box(x - 0.17, x + 0.17, y + 0.08, y + 0.36, z + 0.02, z + 0.05, 0x111111); box(x - 0.15, x + 0.15, y + 0.1, y + 0.34, z + 0.0, z + 0.02, 0x3a7ab8, K.L); }
function plant(K, x, z, h = 1.2) { const { box, cyl, hue } = K; cyl(x, z, 0, 0.4, 0.2, 0x8a6a4a); for (let k = 0; k < 5; k++) box(x - 0.2 + K.r() * 0.2, x + K.r() * 0.25, 0.4 + k * h * 0.12, 0.6 + k * h * 0.14, z - 0.2 + K.r() * 0.15, z + K.r() * 0.2, hue(0.3 + K.r() * 0.05, 0.5, 0.25 + K.r() * 0.1)); }
function products(K, x0, x1, y, z0, z1, h, n, sat = 0.6) { const { box, hue } = K, w = (x1 - x0) / n; for (let k = 0; k < n; k++) { const hh = h * (0.6 + K.r() * 0.4); box(x0 + k * w + 0.01, x0 + (k + 1) * w - 0.01, y, y + hh, z0, z0 + (z1 - z0) * (0.7 + K.r() * 0.3), hue(K.r(), sat * (0.5 + K.r() * 0.5), 0.35 + K.r() * 0.3)); } }
function gondola(K, x, z0, z1, h = 1.6) { // a shelf run, both faces stocked, its long axis along z
  const { box, solid } = K; box(x - 0.45, x + 0.45, 0, 0.12, z0, z1, 0x3a3a3a); box(x - 0.03, x + 0.03, 0.12, h, z0, z1, 0xd8d4cc); box(x - 0.45, x + 0.45, h - 0.04, h, z0, z1, 0xd8d4cc);
  for (const y of [0.15, 0.55, 0.95, 1.3]) { if (y > h - 0.25) continue; for (const s of [-1, 1]) { box(s < 0 ? x - 0.45 : x + 0.03, s < 0 ? x - 0.03 : x + 0.45, y, y + 0.025, z0, z1, 0xbdb8ae); const L = z1 - z0, n = Math.max(2, Math.floor(L / 0.16)); for (let k = 0; k < n; k++) { const hh = 0.18 + K.r() * 0.16; box(s < 0 ? x - 0.42 : x + 0.06, s < 0 ? x - 0.06 : x + 0.42, y + 0.025, y + 0.025 + hh, z0 + k * L / n + 0.01, z0 + (k + 1) * L / n - 0.01, K.hue(K.r(), 0.4 + K.r() * 0.5, 0.3 + K.r() * 0.35)); } } }
  solid(x - 0.45, x + 0.45, z0, z1, h); }
function counterRun(K, x0, x1, z, d, h, c, top) { const { box, solid } = K; box(x0, x1, 0, h - 0.04, z, z + d, c); box(x0 - 0.03, x1 + 0.03, h - 0.04, h, z - 0.04, z + d + 0.02, top); box(x0, x1, 0, 0.1, z + 0.03, z + d, 0x1c1b1a); solid(x0, x1, z, z + d, h); }

const FURNISH = {
  diner(K) { const { W, D, box, r, b, pal } = K, cz = Math.max(3.4, D - 3.0), red = pal.floor[0]; // the counter toward the back, the kitchen behind it, the dining room filling the front
    counterRun(K, 0.6, W - 0.6, cz, 0.7, 1.05, red, 0x2a2a2a); register(K, W * 0.35, 1.05, cz + 0.2); register(K, W * 0.65, 1.05, cz + 0.2);
    box(W * 0.45, W * 0.45 + 0.5, 1.05, 1.5, cz + 0.05, cz + 0.45, 0xd8d0c0); // a tip jar and a napkin stack
    menuBoards(K, 0.8, W - 0.8, 2.3, 0x1b1b1b, D - 0.06);
    // the kitchen line behind: an oven (pizza: a deck oven), a prep table, a drink cooler
    if (b.cat === 'pizza') { box(0.6, 2.4, 0, 1.6, D - 1.1, D - 0.1, 0x8a8f96); box(0.7, 2.3, 0.75, 0.95, D - 1.15, D - 1.1, 0x2a2a2a); box(0.7, 2.3, 1.15, 1.35, D - 1.15, D - 1.1, 0x2a2a2a); box(0.6, 2.4, 1.6, 1.9, D - 1.0, D - 0.2, 0xb5121b); }
    else { box(0.6, 2.2, 0, 0.9, D - 0.9, D - 0.1, STEEL); box(0.6, 2.2, 0.9, 0.95, D - 0.9, D - 0.1, 0x2a2a2a); for (let k = 0; k < 4; k++) cyl2(K, 0.9 + k * 0.4, D - 0.5, 0.95, 1.05, 0.14, 0x1a1a1a); }
    box(W - 1.6, W - 0.6, 0, 2.0, D - 0.75, D - 0.1, 0x2a2a2a); box(W - 1.55, W - 0.65, 0.1, 1.9, D - 0.78, D - 0.75, 0xcfe7f0, K.L); for (let y = 0.25; y < 1.8; y += 0.38) K.box && products(K, W - 1.5, W - 0.7, y, D - 0.7, D - 0.3, 0.26, 6, 0.9);
    box(W - 2.6, W - 1.8, 0, 1.2, cz - 0.7, cz - 0.1, 0xb5121b); for (let k = 0; k < 3; k++) box(W - 2.5 + k * 0.25, W - 2.32 + k * 0.25, 1.0, 1.15, cz - 0.6, cz - 0.4, 0x2a2a2a); // the soda fountain
    // the dining room: tables of two and four, booths along a wall
    const rows = Math.floor((cz - 1.2) / 1.6), cols = Math.max(1, Math.floor((W - 2.2) / 2.2));
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const x = 1.6 + j * 2.2, z = 1.2 + i * 1.6; if (x > W - 1.2) continue; table(K, x, z, 0.8, 0.8, i % 2 ? 0xe9e5dc : 0x2b2b2b); chair(K, x - 0.6, z, 0, pal.wall[0] === 0x2b2b2b ? 0xb5121b : 0x2b2b2b); chair(K, x + 0.6, z, 1, 0x2b2b2b); }
    if (W > 5) for (let i = 0; i < rows; i++) booth(K, W - 0.55, 1.2 + i * 1.6, red);
    box(0.05, 0.12, 1.2, 2.2, 1, 1 + Math.min(4, cz - 1.5), 0xd8c49a); // a long picture on the wall
  },
  counter(K) { const { W, D, box, b, pal } = K, cz = Math.max(2.8, D - 2.8);
    counterRun(K, 0.6, W - 0.6, cz, 0.75, 1.0, b.cat === 'sweets' ? 0xf7d7e4 : 0x2f6b34, 0xeeeeee); register(K, W - 1.2, 1.0, cz + 0.2);
    // the display case on the counter (donuts, the sandwich line's toppings)
    box(0.8, W - 1.8, 1.0, 1.42, cz - 0.02, cz + 0.6, 0xcfe7f0); for (let x = 0.9; x < W - 1.9; x += 0.22) for (const y of [1.05, 1.24]) box(x, x + 0.16, y, y + 0.07, cz + 0.08, cz + 0.4, K.hue(b.cat === 'sweets' ? 0.08 + K.r() * 0.9 : 0.25 + K.r() * 0.1, 0.6, 0.55));
    menuBoards(K, 0.8, W - 0.8, 2.3, b.cat === 'sweets' ? 0xe4007c : 0x1f3a2b, D - 0.06);
    box(0.6, 2.0, 0, 1.8, D - 0.7, D - 0.1, STEEL); box(W - 1.6, W - 0.6, 0, 2.0, D - 0.7, D - 0.1, 0x2a2a2a); products(K, W - 1.5, W - 0.7, 0.3, D - 0.68, D - 0.4, 0.3, 5, 0.9); products(K, W - 1.5, W - 0.7, 0.8, D - 0.68, D - 0.4, 0.3, 5, 0.9); products(K, W - 1.5, W - 0.7, 1.3, D - 0.68, D - 0.4, 0.3, 5, 0.9);
    for (let z = 1.1; z < cz - 1.2; z += 1.6) for (let j = 0; j < Math.max(1, Math.floor((W - 1.6) / 1.8)); j++) { const x = 1.2 + j * 1.8; table(K, x, z, 0.7, 0.7, 0xeeeeee); chair(K, x - 0.55, z, 0, pal.wall[0] === 0xf7d7e4 ? 0xe4007c : 0x2f6b34); chair(K, x + 0.55, z, 1, 0x2b2b2b); }
  },
  restaurant(K) { const { W, D, box, b, pal } = K, host = Math.min(1.6, W * 0.25);
    box(W - host - 0.6, W - 0.6, 0, 1.1, 0.8, 1.3, 0x3a2a20); box(W - host - 0.6, W - 0.6, 1.1, 1.14, 0.78, 1.32, 0x2a2a2a); // the host stand
    const bz = D - 1.4; counterRun(K, 0.5, W - 0.5, bz, 0.6, 1.08, 0x3a2a20, 0x1b1b1b); // the bar (a sushi bar, a pass to the kitchen)
    for (let x = 0.9; x < W - 0.8; x += 0.65) { cyl2(K, x, bz - 0.35, 0, 0.72, 0.03, DARK); cyl2(K, x, bz - 0.35, 0.72, 0.78, 0.18, 0x7a1f2b); } // stools
    for (let x = 0.7; x < W - 0.7; x += 0.25) box(x, x + 0.12, 1.4, 1.6, D - 0.35, D - 0.2, K.hue(K.r(), 0.4, 0.45)); // bottles, dishes on the back shelf
    box(0.5, W - 0.5, 1.75, 1.8, D - 0.45, D - 0.1, 0x3a2a20);
    for (let x = 0.9; x < W - 0.5; x += 1.6) { box(x - 0.15, x + 0.15, 2.3, 2.6, 1.2, 1.5, 0xffc880, K.L); box(x - 0.01, x + 0.01, 2.6, K.H, 1.34, 1.36, DARK); } // pendant lamps
    const rows = Math.floor((bz - 2.6) / 1.7), cols = Math.max(1, Math.floor((W - 1.6) / 2.1));
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const x = 1.2 + j * 2.1, z = 2.2 + i * 1.7; table(K, x, z, 0.9, 0.9, 0xf2ede2); for (const [dx, rot] of [[-0.65, 0], [0.65, 1]]) chair(K, x + dx, z, rot, 0x3a2a20); box(x - 0.05, x + 0.05, 0.76, 0.9, z - 0.05, z + 0.05, 0xffffff); }
    if (W > 4) booth(K, 0.55, 2.2, pal.wall[0]); plant(K, 0.5, 0.6);
  },
  cafe(K) { const { W, D, box, b, pal } = K, cz = Math.max(3.0, D - 3.0);
    counterRun(K, 0.6, W - 0.6, cz, 0.7, 1.0, 0x4a3020, 0xd8d0c0); register(K, W - 1.1, 1.0, cz + 0.2);
    box(1.0, 1.7, 1.0, 1.5, cz + 0.1, cz + 0.55, STEEL); for (const k of [0, 1]) box(1.1 + k * 0.32, 1.3 + k * 0.32, 1.12, 1.25, cz + 0.0, cz + 0.08, 0x111111); // the espresso machine, its group heads
    box(1.95, 2.35, 1.0, 1.5, cz + 0.2, cz + 0.6, 0x111111); box(2.4, W - 1.6, 1.0, 1.4, cz - 0.02, cz + 0.6, 0xcfe7f0); for (let x = 2.5; x < W - 1.7; x += 0.2) box(x, x + 0.15, 1.05, 1.13, cz + 0.1, cz + 0.4, K.hue(0.07 + K.r() * 0.05, 0.6, 0.45 + K.r() * 0.2)); // the grinder, the pastry case
    for (let x = 0.8; x < W - 0.8; x += 0.12) box(x, x + 0.08, 1.9, 2.0, D - 0.3, D - 0.2, 0xffffff); box(0.6, W - 0.6, 1.88, 1.9, D - 0.35, D - 0.1, 0x4a3020); // cups on the back shelf
    menuBoards(K, 0.8, W - 0.8, 2.25, 0x1b1b1b, D - 0.06);
    box(0.1, 0.6, 0, 1.0, 0.8, 2.0, 0x4a3020); box(0.1, 0.6, 1.0, 1.04, 0.8, 2.0, 0xd8d0c0); for (let k = 0; k < 4; k++) cyl2(K, 0.35, 0.95 + k * 0.28, 1.04, 1.25, 0.05, k % 2 ? STEEL : 0x6b4a32); K.solid(0.1, 0.6, 0.8, 2.0, 1.0); // the condiment bar
    const n = Math.max(1, Math.floor((W - 1.4) / 1.5)); for (let j = 0; j < n; j++) for (let i = 0; i < Math.floor((cz - 1.4) / 1.4); i++) { const x = 1.4 + j * 1.5, z = 1.0 + i * 1.4; table(K, x, z, 0.6, 0.6, 0x2b2b2b, 0.74); chair(K, x - 0.5, z, 0, 0x1b1b1b); chair(K, x + 0.5, z, 1, 0x1b1b1b); }
    if (W > 4.5) { box(W - 1.4, W - 0.2, 0, 0.45, 0.8, 2.6, 0x6b4a32); box(W - 1.4, W - 0.2, 0.45, 0.5, 0.8, 2.6, 0x8a6a4a); K.solid(W - 1.4, W - 0.2, 0.8, 2.6, 0.5); } // a lounge bench
    plant(K, 0.5, 0.5);
  },
  barber(K) { stations(K, 0x7a1f1f, true); },
  salon(K) { stations(K, 0x1b1b1b, false); const { W, D, box } = K; for (let k = 0; k < Math.min(3, Math.floor((W - 1) / 1.1)); k++) { const x = 1 + k * 1.1; box(x - 0.35, x + 0.35, 0, 0.85, D - 0.7, D - 0.1, 0xf2f2f2); cyl2(K, x, D - 0.4, 0.85, 0.95, 0.25, 0x1b1b1b); box(x - 0.3, x + 0.3, 0.45, 0.5, D - 1.3, D - 0.8, 0x1b1b1b); } }, // shampoo bowls at the back
  nails(K) { const { W, D, box, hue, r } = K;
    for (let y = 0.9; y < 2.3; y += 0.12) for (let x = 0.6; x < W - 0.6; x += 0.05) box(x, x + 0.03, y, y + 0.08, D - 0.12, D - 0.06, hue(r(), 0.7, 0.5)); box(0.5, W - 0.5, 0.85, 2.35, D - 0.06, D - 0.02, 0xffffff); // the polish wall
    for (let z = 1.4; z < D - 1.2; z += 1.25) { const x = 0.1; // pedicure thrones down the left wall, facing in, each over its basin
      box(x, x + 0.8, 0, 0.5, z - 0.45, z + 0.45, 0x5a3a5a); box(x, x + 0.65, 0.5, 0.92, z - 0.42, z + 0.42, 0x4a2a4a); box(x, x + 0.18, 0.92, 1.45, z - 0.42, z + 0.42, 0x4a2a4a); box(x + 0.05, x + 0.75, 0.92, 0.98, z - 0.5, z - 0.42, 0x3a1a3a); box(x + 0.05, x + 0.75, 0.92, 0.98, z + 0.42, z + 0.5, 0x3a1a3a);
      box(x + 0.85, x + 1.35, 0, 0.32, z - 0.3, z + 0.3, 0xf2f2f2); box(x + 0.9, x + 1.3, 0.28, 0.32, z - 0.25, z + 0.25, 0x8fc6e0); cyl2(K, x + 1.6, z, 0, 0.42, 0.2, 0x2a2a2a); K.solid(x, x + 1.35, z - 0.5, z + 0.5, 1.45); }
    const mx0 = Math.min(W - 1.0, 2.6); if (W > 3.6) for (let z = 1.6; z < D - 1.4; z += 1.5) for (let x = mx0 + 0.6; x < W - 0.6; x += 2.0) { table(K, x, z, 1.1, 0.5, 0xffffff); box(x + 0.35, x + 0.38, 0.76, 1.2, z - 0.05, z - 0.02, STEEL); box(x + 0.2, x + 0.4, 1.18, 1.22, z - 0.12, z + 0.02, 0xffffff, K.L); for (let q = 0; q < 6; q++) cyl2(K, x - 0.45 + q * 0.07, z + 0.12, 0.76, 0.84, 0.02, hue(r(), 0.7, 0.5), 5); chair(K, x, z - 0.55, 0, 0x1b1b1b); chair(K, x, z + 0.55, 1, 0x4a2a4a); K.solid(x - 0.55, x + 0.55, z - 0.25, z + 0.25, 0.8); } // manicure tables: a lamp, polish, a chair each side
    box(W - 1.4, W - 0.3, 0, 1.05, 0.5, 1.0, 0xe9e1f3); register(K, W - 0.8, 1.05, 0.7); plant(K, W - 0.5, 1.6);
  },
  spa(K) { const { W, D, box } = K; const n = Math.max(1, Math.floor((W - 0.6) / 2.6)); for (let k = 0; k < n; k++) { const x = 0.3 + k * 2.6; box(x, x + 0.08, 0, 2.4, 0.6, D - 0.6, 0xd9d0c0); const cx = x + 1.3; box(cx - 0.35, cx + 0.35, 0, 0.7, 1.4, 3.3, 0xf2ede2); box(cx - 0.35, cx + 0.35, 0.7, 0.8, 1.4, 3.3, 0xffffff); box(cx - 0.1, cx + 0.1, 0.8, 0.86, 3.1, 3.3, 0xffffff); K.solid(cx - 0.35, cx + 0.35, 1.4, 3.3, 0.8); box(cx - 0.6, cx - 0.4, 0, 0.9, 0.7, 0.9, 0x6b5848); }
    box(W - 1.6, W - 0.4, 0, 1.0, 0.6, 1.0, 0x6b5848); register(K, W - 1.0, 1.0, 0.75); plant(K, 0.5, 0.5, 1.5); },
  bank(K) { const { W, D, box, pal, r, hue } = K, tz = D - 1.6, navy = pal.wall[1];
    counterRun(K, 0.4, W - 0.4, tz, 0.75, 1.1, 0x5a4a3a, 0xd8d0c0); for (let x = 0.9; x < W - 0.6; x += 1.5) { box(x - 0.02, x + 0.02, 1.1, 2.1, tz - 0.02, tz + 0.7, 0xcfe7f0); register(K, x + 0.7, 1.1, tz + 0.45); box(x + 0.4, x + 1.0, 1.11, 1.13, tz - 0.02, tz + 0.15, 0xffffff); box(x + 0.62, x + 0.78, 1.5, 1.66, tz - 0.03, tz - 0.01, 0xffffff, K.L); } // the tellers' windows, each with its number
    box(0.5, W - 0.5, 2.3, 2.7, D - 0.08, D - 0.02, navy, K.L); // the bank's colour band
    const ow = W > 7 ? 2.8 : 0, lx = W - ow; // bankers' offices down the right wall, behind glass, each a desk and two chairs
    if (ow) for (let z = 1.6; z + 2.6 < tz - 1.8; z += 2.8) { box(lx - 0.05, lx, 0, 2.4, z, z + 1.6, 0xcfe7f0); for (const e of [z - 0.04, z + 1.56]) box(lx - 0.06, lx + 0.01, 0, 2.4, e, e + 0.08, STEEL); box(lx - 0.06, lx + 0.01, 2.4, 2.5, z, z + 2.6, STEEL); box(lx, W, 0, 2.4, z + 2.58, z + 2.66, pal.wall[0]); box(lx - 0.06, lx + 0.01, 1.0, 1.15, z, z + 1.6, 0xeeeeee); // the glass front with a frosted band and its open door, the partition
      const dx = lx + 1.45; table(K, dx, z + 1.55, 1.5, 0.75, 0x4a3a2a); register(K, dx + 0.3, 0.76, z + 1.7); chair(K, dx, z + 2.2, 1, 0x1b1b1b); chair(K, dx - 0.4, z + 0.85, 0, navy); chair(K, dx + 0.4, z + 0.85, 0, navy); box(W - 0.06, W - 0.02, 1.2, 1.8, z + 0.8, z + 1.8, hue(r() * 0.15 + 0.5, 0.3, 0.5)); // the desk faces its door
      K.solid(lx - 0.06, lx + 0.01, z, z + 1.6, 2.4); K.solid(dx - 0.75, dx + 0.75, z + 1.15, z + 1.95, 0.8); }
    for (let x = 1.0; x < lx - 0.6; x += 1.1) { cyl2(K, x, tz - 1.6, 0, 1.0, 0.03, STEEL); cyl2(K, x, tz - 1.6, 0, 0.04, 0.15, STEEL); } box(1.0, lx - 0.6, 0.85, 0.9, tz - 1.62, tz - 1.58, navy); // the queue rope
    const ix = Math.min(lx - 1.4, W * 0.4), iz = Math.max(2.4, (tz - 1.6) * 0.55); box(ix - 0.6, ix + 0.6, 0, 1.05, iz - 0.35, iz + 0.35, 0x5a4a3a); box(ix - 0.65, ix + 0.65, 1.05, 1.08, iz - 0.4, iz + 0.4, 0xd8d0c0); for (const s of [-1, 1]) box(ix + s * 0.3 - 0.1, ix + s * 0.3 + 0.1, 1.08, 1.09, iz - 0.2, iz + 0.05, 0xffffff); K.solid(ix - 0.65, ix + 0.65, iz - 0.4, iz + 0.4, 1.1); // the check-writing island and its slips
    for (const zz of [1.2, 2.1]) { box(0.15, 0.85, 0.42, 0.48, zz - 0.35, zz + 0.35, navy); box(0.1, 0.2, 0.48, 1.0, zz - 0.35, zz + 0.35, navy); } box(0.9, 1.4, 0, 0.45, 1.3, 2.0, 0x4a3a2a); K.solid(0.1, 1.4, 0.85, 2.45, 0.6); // the lobby's two armchairs and table
    box(0.02, 0.06, 1.6, 2.3, 2.9, 4.1, 0x111111); box(0.06, 0.07, 1.65, 2.25, 2.95, 4.05, 0x2a5a8a, K.L); // the rates screen
    box(0.05, 0.6, 0, 1.6, 0.25, 0.85, 0x3a3a3a); box(0.6, 0.62, 1.0, 1.35, 0.35, 0.75, 0x3a7ab8, K.L); K.solid(0.05, 0.6, 0.25, 0.85, 1.6); // the ATM by the door
    plant(K, lx - 0.5, 0.5, 1.4); plant(K, 0.5, tz - 0.6); },
  market(K) { const { W, D, box, b } = K; const n = Math.max(1, Math.floor((W - 1.4) / 2.1));
    for (let k = 0; k < n; k++) gondola(K, 1.4 + k * 2.1, 3.2, D - 1.0, 1.7);
    for (let x = 0.6; x < W - 0.6; x += 1.2) { box(x, x + 1.1, 0, 1.9, D - 0.75, D - 0.1, 0x2a2a2a); box(x + 0.05, x + 1.05, 0.1, 1.8, D - 0.78, D - 0.75, 0xcfe7f0, K.L); for (let y = 0.2; y < 1.7; y += 0.32) products(K, x + 0.08, x + 1.0, y, D - 0.7, D - 0.3, 0.24, 7, 0.9); } // coolers along the back
    const lanes = Math.max(1, Math.floor((W - 1) / 2.4)); for (let k = 0; k < lanes; k++) { const x = 0.8 + k * 2.4; box(x, x + 1.6, 0, 0.9, 1.4, 1.9, 0x5a5a5a); box(x + 0.05, x + 1.55, 0.9, 0.92, 1.45, 1.85, 0x1b1b1b); register(K, x + 1.3, 0.92, 1.65); box(x + 1.6, x + 1.75, 0, 1.4, 1.5, 1.8, 0x3a3a3a); box(x + 1.62, x + 1.73, 1.4, 1.8, 1.55, 1.75, 0xc8102e, K.L); K.solid(x, x + 1.6, 1.4, 1.9, 0.92); } // checkouts with their lane lights
    if (b.cat === 'market') for (let k = 0; k < 2; k++) { const x = 1.5 + k * 2.5; if (x > W - 1.5) break; box(x - 0.9, x + 0.9, 0, 0.75, 2.4, 3.0, 0x7a5a3a); for (let q = 0; q < 12; q++) box(x - 0.85 + (q % 6) * 0.29, x - 0.6 + (q % 6) * 0.29, 0.75, 0.88, 2.45 + Math.floor(q / 6) * 0.28, 2.7 + Math.floor(q / 6) * 0.28, [[0.85, 0.15, 0.1], [0.95, 0.65, 0.1], [0.35, 0.6, 0.15], [0.9, 0.85, 0.2]][q % 4]); K.solid(x - 0.9, x + 0.9, 2.4, 3.0, 0.9); } // the produce tables
    if (b.cat === 'pharmacy') { box(W - 3.2, W - 0.4, 0, 1.1, D - 2.0, D - 1.3, 0xffffff); box(W - 3.0, W - 0.6, 2.2, 2.6, D - 0.08, D - 0.02, 0xcc0000, K.L); }
  },
  liquor(K) { const { W, D, box, hue, r } = K;
    for (let x = 0.5; x < W - 0.5; x += 1.15) { box(x, x + 1.1, 0, 2.1, D - 0.8, D - 0.1, 0x1b1b1b); box(x + 0.05, x + 1.05, 0.1, 2.0, D - 0.83, D - 0.8, 0xbfe0f0, K.L); for (let y = 0.2; y < 1.9; y += 0.35) for (let q = 0; q < 8; q++) cyl2(K, x + 0.12 + q * 0.12, D - 0.5, y, y + 0.24 + r() * 0.08, 0.04, hue(r() < 0.5 ? 0.08 : r(), 0.6, 0.3 + r() * 0.3), 6); }
    const n = Math.max(1, Math.floor((W - 1.6) / 2.0)); for (let k = 0; k < n; k++) { const x = 1.5 + k * 2.0, z0 = 2.6, z1 = D - 1.4; gondola(K, x, z0, z1, 1.5); for (let z = z0 + 0.1; z < z1 - 0.1; z += 0.12) for (const s of [-1, 1]) cyl2(K, x + s * 0.3, z, 1.5, 1.82, 0.045, hue(r(), 0.5, 0.35), 6); } // wine bottles up top
    counterRun(K, 0.5, 2.6, 0.9, 0.7, 1.0, 0x3a3532, 0x1b1b1b); register(K, 1.2, 1.0, 1.1); for (let x = 0.6; x < 2.5; x += 0.12) box(x, x + 0.1, 1.8, 2.3, 1.55, 1.6, hue(r(), 0.6, 0.45)); // the cigarettes behind the till
    box(0.5, 2.6, 1.0, 1.1, 0.8, 0.88, 0xe4002b, K.L); // the lottery sign
  },
  cleaners(K) { const { W, D, box, hue, r } = K; counterRun(K, 0.5, W - 0.5, 2.0, 0.7, 1.05, 0x6a6a6a, 0xd8d8d8); register(K, W - 1.2, 1.05, 2.2);
    const cz = 3.4; box(0.4, W - 0.4, 2.1, 2.14, cz, cz + 0.04, STEEL); for (let x = 0.5; x < W - 0.5; x += 0.09) { box(x, x + 0.06, 1.15, 2.08, cz - 0.25, cz + 0.29, hue(r(), 0.25, 0.4 + r() * 0.35)); box(x + 0.025, x + 0.035, 2.08, 2.14, cz, cz + 0.04, STEEL); } // the garment conveyor
    for (let x = 0.6; x < W - 1.2; x += 1.3) { box(x, x + 1.0, 0, 1.1, D - 1.0, D - 0.1, WHITE); box(x + 0.1, x + 0.9, 0.3, 0.9, D - 1.02, D - 1.0, 0x2a2a2a); } }, // the machines
  shop(K) { const { W, D, box, hue, r, b } = K;
    counterRun(K, W - 2.6, W - 0.5, 1.0, 0.7, 1.0, 0x3a3a3a, 0xeeeeee); register(K, W - 1.2, 1.0, 1.2);
    for (let z = 1.0; z < D - 0.4; z += 0.9) { box(0.05, 0.45, 0, 2.2, z, z + 0.85, 0xd8d4cc); for (let y = 0.2; y < 2.1; y += 0.4) products(K, 0.08, 0.42, y, z, z + 0.85, 0.3, 4); } // wall shelves
    if (b.cat === 'phone') for (let k = 0; k < Math.floor((W - 3) / 1.6); k++) { const x = 1.5 + k * 1.6; table(K, x, 3.0, 1.2, 0.6, 0xffffff, 0.95); for (let q = 0; q < 4; q++) box(x - 0.45 + q * 0.28, x - 0.3 + q * 0.28, 0.95, 1.12, 2.95, 2.98, 0x111111); }
    else { const n = Math.max(1, Math.floor((W - 1.4) / 2.2)); for (let k = 0; k < n; k++) { const x = 1.2 + k * 2.2; if (x > W - 3) break; gondola(K, x, 2.4, D - 1.0, 1.5); } }
    for (let k = 0; k < 2; k++) { const x = 1.5 + k * 1.6; if (x > W - 2.8) break; cyl2(K, x, 1.4, 0, 1.4, 0.03, STEEL); box(x - 0.5, x + 0.5, 1.35, 1.38, 1.39, 1.41, STEEL); for (let q = 0; q < 8; q++) box(x - 0.45 + q * 0.12, x - 0.38 + q * 0.12, 0.6, 1.35, 1.3, 1.5, hue(r(), 0.5, 0.45)); } // a garment rack or two
  },
  gym(K) { const { W, D, box } = K; box(0.03, 0.06, 0.3, 2.4, 0.5, D - 0.5, 0x9ab0bf); // the mirror wall
    const n = Math.max(1, Math.floor((W - 1) / 1.1)); for (let k = 0; k < n; k++) { const x = 0.8 + k * 1.1; box(x - 0.35, x + 0.35, 0, 0.25, 1.0, 2.8, 0x111111); box(x - 0.3, x + 0.3, 0.25, 0.28, 1.1, 2.6, 0x2a2a2a); box(x - 0.05, x + 0.05, 0.25, 1.3, 2.6, 2.7, 0x1b1b1b); box(x - 0.3, x + 0.3, 1.25, 1.45, 2.55, 2.75, 0x111111); box(x - 0.2, x + 0.2, 1.3, 1.42, 2.54, 2.55, 0x3a7ab8, K.L); K.solid(x - 0.35, x + 0.35, 1.0, 2.8, 1.4); } // treadmills
    if (D > 6) { box(0.5, W - 0.5, 0, 0.9, D - 1.0, D - 0.6, 0x1b1b1b); for (let x = 0.7; x < W - 0.7; x += 0.3) cyl2(K, x, D - 0.8, 0.9, 1.05, 0.06, 0x2a2a2a); K.solid(0.5, W - 0.5, D - 1.0, D - 0.6, 0.9); } // the dumbbell rack
    for (let z = 3.6; z < D - 1.8; z += 2.0) for (let k = 0; k < Math.floor((W - 1) / 1.6); k++) { const x = 1.0 + k * 1.6; if (((z * 7 + k) | 0) % 2) { box(x - 0.3, x + 0.3, 0, 0.45, z - 0.6, z + 0.6, 0x111111); box(x - 0.32, x + 0.32, 0.45, 0.5, z - 0.62, z + 0.62, 0xc8102e); for (const s of [-1, 1]) box(x + s * 0.55 - 0.02, x + s * 0.55 + 0.02, 0, 1.4, z + 0.3, z + 0.34, STEEL); box(x - 0.75, x + 0.75, 1.3, 1.34, z + 0.3, z + 0.34, STEEL); } // a bench under a barbell
      else { box(x - 0.35, x + 0.35, 0, 1.5, z - 0.35, z - 0.2, 0x1b1b1b); box(x - 0.25, x + 0.25, 0.45, 0.55, z - 0.2, z + 0.4, 0x2a2a2a); box(x - 0.08, x + 0.08, 1.5, 2.1, z - 0.32, z - 0.22, STEEL); } // a cable machine
      K.solid(x - 0.4, x + 0.4, z - 0.65, z + 0.65, 1.4); } }, // the weights
  studio(K) { const { W, D, box, b, r, hue } = K, fight = /karate|martial|taekwondo|jiu|judo|kung fu|kickbox|boxing|mma/i.test(b.name);
    box(W - 0.06, W - 0.02, 0.15, 2.5, 0.8, D - 0.3, 0x9ab0bf); for (let z = 1.2; z < D - 0.5; z += 1.6) box(W - 0.07, W - 0.05, 0.15, 2.5, z - 0.02, z + 0.02, 0x333333); // the mirror wall
    if (!fight) { box(W - 0.3, W - 0.25, 0.98, 1.03, 0.9, D - 0.4, 0x8a6a4a); for (let z = 1.2; z < D - 0.4; z += 1.8) box(W - 0.24, W - 0.06, 0.98, 1.0, z - 0.02, z + 0.02, STEEL); // the barre
      for (let z = 2.6; z < D - 1.4; z += 2.1) for (let x = 0.8; x < W - 1.0; x += 1.0) { box(x, x + 0.62, 0, 0.012, z, z + 1.8, hue(r() < 0.5 ? 0.78 : 0.48 + r() * 0.1, 0.35, 0.45)); if (r() < 0.6) box(x + 0.05, x + 0.28, 0.012, 0.11, z + 0.1, z + 0.25, 0x6b4f8a); } } // the mats, a block on some
    else { for (let x = 0.4; x < W - 0.4; x += 1.0) for (let z = 2.4; z < D - 0.6; z += 1.0) box(x, Math.min(W - 0.4, x + 1.0), 0, 0.04, z, Math.min(D - 0.6, z + 1.0), ((x + z) | 0) % 2 ? 0x1b4f9c : 0xb5121b); // the puzzle mat
      for (let k = 0; k < Math.min(3, Math.floor(W / 2.4)); k++) { const x = 1.2 + k * 2.4, z = D - 1.2; cyl2(K, x, z, 0.6, 1.8, 0.18, 0x1b1b1b, 10); box(x - 0.01, x + 0.01, 1.8, K.H, z - 0.01, z + 0.01, STEEL); K.solid(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 1.8); } // heavy bags
      for (let k = 0; k < 7; k++) box(0.03, 0.05, 1.5, 1.55, 3 + k * 0.35, 3.25 + k * 0.35, [0xffffff, 0xf2d21b, 0xe87722, 0x2f8f3a, 0x1b4f9c, 0x6b3a1b, 0x111111][k]); } // the belt rack
    box(0.05, 0.45, 0, 1.6, 0.6, 2.2, 0xd9c9a8); for (let y = 0.05; y < 1.6; y += 0.4) box(0.05, 0.46, y, y + 0.03, 0.6, 2.2, 0xb59a6e); for (let z = 0.7; z < 2.1; z += 0.27) box(0.1, 0.38, 0.08, 0.2, z, z + 0.2, hue(r(), 0.4, 0.4)); K.solid(0.05, 0.45, 0.6, 2.2, 1.6); // cubbies by the door, shoes in them
    counterRun(K, W - 2.4, W - 0.6, 1.2, 0.6, 1.05, 0xd9c9a8, 0xeeeeee); register(K, W - 1.3, 1.05, 1.4); plant(K, W - 0.5, 0.5, 1.6);
    box(W / 2 - 0.25, W / 2 + 0.25, 0, 0.9, D - 0.4, D - 0.1, 0x111111); box(W / 2 - 0.15, W / 2 + 0.15, 0.95, 1.0, D - 0.3, D - 0.2, 0x111111); }, // the speaker at the front of the class
  office(K) { const { W, D, box } = K; counterRun(K, 0.8, Math.min(W - 0.8, 3.4), 2.4, 0.7, 1.05, 0xc9c2b4, 0x6b5848); register(K, 1.6, 1.05, 2.7); // the reception desk
    for (let k = 0; k < Math.floor((W - 0.6) / 0.6); k++) chair(K, 0.6 + k * 0.6, 0.9, 1, 0x2a3a4a); // the waiting chairs
    for (let z = 4.6; z < D - 1.0; z += 2.2) for (let k = 0; k < Math.floor((W - 1) / 2.4); k++) { const x = 1.4 + k * 2.4; table(K, x, z, 1.5, 0.75, 0xd8d0c0); register(K, x, 0.76, z + 0.2); chair(K, x, z - 0.65, 0, 0x1b1b1b); box(x - 0.75, x + 0.75, 0.76, 1.3, z + 0.36, z + 0.4, 0x8a9aa8); K.solid(x - 0.75, x + 0.75, z - 0.38, z + 0.4, 0.8); } // desks with their low screens
    plant(K, W - 0.5, 0.6, 1.6); box(W / 2 - 0.6, W / 2 + 0.6, 1.5, 2.3, D - 0.06, D - 0.02, 0x7a8a6a); },
  vacant(K) { const { W, D, box, cyl } = K; box(W * 0.3, W * 0.3 + 0.6, 0, 1.8, D * 0.5, D * 0.5 + 0.08, 0xc8a24a); box(W * 0.3 - 0.05, W * 0.3 + 0.65, 1.8, 1.85, D * 0.5 - 0.2, D * 0.5 + 0.3, 0xc8a24a); // a ladder
    for (let k = 0; k < 3; k++) cyl2(K, W * 0.6 + k * 0.4, D * 0.4, 0, 0.4, 0.15, k ? 0xe4e4e0 : 0xe87722); box(0.2, 1.4, 0, 0.02, 1.0, 2.2, 0x6b6b6b); box(W - 1.4, W - 0.2, 0, 1.2, D - 1.2, D - 0.2, 0xd8d4cc); }, // paint buckets, a drop cloth, drywall
};
function cyl2(K, x, z, y0, y1, r, c, seg = 8) { K.cyl(x, z, y0, y1, r, c, seg); }
function booth(K, x, z, c) { const { box, solid } = K, s = x > 1 ? -1 : 1; box(x - 0.3, x + 0.3, 0.42, 0.5, z - 0.6, z + 0.6, c); box(x - s * 0.25 - 0.06, x - s * 0.25 + 0.06, 0.5, 1.15, z - 0.6, z + 0.6, c); table(K, x + s * 0.75, z, 0.7, 1.1, 0xe9e5dc); solid(x - 0.3, x + 0.3, z - 0.6, z + 0.6, 0.5); }
function stations(K, chairC, barber) { const { W, D, box } = K, sides = W > 4.2 ? [0, 1] : [0];
  for (const side of sides) for (let z = 2.2; z < D - 0.9; z += 1.6) { const x = side ? W - 0.05 : 0.05, s = side ? -1 : 1; // a mirror on the wall, its counter and bottles, the chair facing it
    box(Math.min(x, x + s * 0.04), Math.max(x, x + s * 0.04), 0.85, 1.95, z - 0.45, z + 0.45, 0x9ab0bf); box(Math.min(x, x + s * 0.08), Math.max(x, x + s * 0.08), 1.95, 2.05, z - 0.5, z + 0.5, 0x1b1b1b); box(Math.min(x, x + s * 0.45), Math.max(x, x + s * 0.45), 0, 0.85, z - 0.5, z + 0.5, 0xe9e4da);
    for (let q = 0; q < 5; q++) cyl2(K, x + s * 0.25, z - 0.35 + q * 0.17, 0.85, 1.0 + K.r() * 0.1, 0.03, K.hue(K.r(), 0.5, 0.5), 6);
    const cx = x + s * 1.25; cyl2(K, cx, z, 0, 0.05, 0.28, STEEL, 12); cyl2(K, cx, z, 0.05, 0.45, 0.06, STEEL); box(cx - 0.28, cx + 0.28, 0.45, 0.6, z - 0.28, z + 0.28, chairC); box(Math.min(cx + s * 0.2, cx + s * 0.3), Math.max(cx + s * 0.2, cx + s * 0.3), 0.6, 1.25, z - 0.28, z + 0.28, chairC); box(cx - 0.25, cx + 0.25, 0.6, 0.75, z - 0.32, z - 0.26, chairC); box(cx - 0.25, cx + 0.25, 0.6, 0.75, z + 0.26, z + 0.32, chairC); if (barber) box(Math.min(cx + s * 0.22, cx + s * 0.32), Math.max(cx + s * 0.22, cx + s * 0.32), 1.25, 1.4, z - 0.1, z + 0.1, chairC);
    K.solid(cx - 0.3, cx + 0.3, z - 0.3, z + 0.3, 1.2); }
  for (let k = 0; k < Math.floor((W - 1.8) / 0.6); k++) chair(K, 0.6 + k * 0.6, 0.8, 1, 0x2a2a2a); // the waiting row by the window
  box(W - 1.6, W - 0.3, 0, 1.05, 1.0, 1.5, 0xe9e4da); register(K, W - 0.9, 1.05, 1.15); if (barber) box(W / 2 - 0.6, W / 2 + 0.6, 1.6, 2.2, D - 0.08, D - 0.02, 0xc8102e); // the counter; the price list
}
