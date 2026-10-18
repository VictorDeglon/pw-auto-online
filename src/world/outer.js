// The outer world: everything within 50 km of Poway's hand-built core (beaches, downtown San Diego, Miramar,
// Escondido, the back country), streamed from assets/world (built by tools/world) in 2 km tiles as you move.
//
// A tile arrives as data first: its terrain posts, its roads (graph edges, plus copies of the neighbours' roads that
// reach into it) and a RoadSurface over them (src/world/roadsurface.js, the same road, curb and junction rules as the
// core). Height questions anywhere outside the core photo go to the tile under that point, so the terrain mesh, the
// roads draped on it, wheels, feet and bullets all use one surface. A tile is built (meshes, collision, the road graph
// for traffic and the GPS) once it and its eight neighbours have their data; buildings come from the same footprints
// as their collision polygons, through the core's addBuilding, so what you see is what you hit.
//
//   createOuter(E) -> OUTER   E: engine hooks from index.html (see the bottom of index.html's world setup)
//   OUTER.init()              fetch the tile index (no-op without assets/world)
//   OUTER.update(dt)          stream around the player; builds run a few milliseconds a frame
//   OUTER.terrainAt / meshAt / surfaceAt / onRoad / onAsphalt / carveAt   height and road queries (null / false
//                             when no outer tile answers for that point)
import { RoadSurface } from './roadsurface.js';

// what's built and kept follows the graphics preset's view distance (Potato 750 m .. Ultra 2600 m), measured from you
// to the nearest edge of a tile: built within view + 300 m, data a tile further out (so roads crossing in have heights)
const BUILD_PAD = 300, UNBUILD_PAD = 1500, DATA_PAD = 2300, DROP_PAD = 4500;
const SUB = 4;                   // a tile's meshes are split 4 x 4 (500 m): drawn, detailed and shadowed by distance
const BUDGET = 7;                // ms of tile building per frame
const URGENT = 14, HURRY = 100;  // ... when the ground under you isn't built yet; behind the fast-travel hold
const STEP = 3;                  // a builder yields after this many ms (one step can't hold up a frame)
let stepT0 = 0;
const due = () => performance.now() - stepT0 > STEP;

export function createOuter(E) {
  const { THREE } = E;
  const O = { ready: false, idx: null, tiles: new Map(), building: null, preps: [], stats: { built: 0, data: 0, edges: 0, buildings: 0 }, onBuilt: null };
  let T = 2000, HN = 65, HC = 31.25, I0 = 0, J0 = 0, I1 = -1, J1 = -1;
  const key = (i, j) => i + '_' + j;

  O.init = async () => {
    try {
      const r = await fetch('assets/world/index.json'); if (!r.ok) return false;
      const idx = await r.json(); O.idx = idx;
      T = idx.tile; HN = idx.hn; HC = idx.hcell; I0 = idx.i0; J0 = idx.j0; I1 = idx.i1; J1 = idx.j1;
      O.ready = true; return true;
    } catch (e) { console.warn('[outer] no outer world', e); return false; }
  };
  O.has = (i, j) => !!(O.idx && O.idx.tiles[key(i, j)]);
  O.bounds = () => O.idx && O.idx.bounds;

  // ---------------------------------------------------------------- per-tile height and road queries
  let lastT = null; // height queries come in runs from the same place: check the last tile first
  const tileOf = (x, z) => {
    const L = lastT; if (L && x >= L.x0 && x < L.x0 + T && z >= L.z0 && z < L.z0 + T && O.tiles.get(L.k) === L) return L;
    const t = O.tiles.get(key(Math.floor(x / T), Math.floor(z / T))); if (t) lastT = t; return t;
  };
  function gridAt(t, g, x, z) { // the tile mesh's triangulation: same split as the core terrain (tri3)
    const gx = (x - t.x0) / HC, gz = (z - t.z0) / HC;
    const i = Math.min(HN - 2, Math.max(0, Math.floor(gx))), j = Math.min(HN - 2, Math.max(0, Math.floor(gz)));
    const fx = Math.min(1, Math.max(0, gx - i)), fy = Math.min(1, Math.max(0, gz - j)), k = j * HN + i;
    const h00 = g[k], h10 = g[k + 1], h01 = g[k + HN], h11 = g[k + HN + 1];
    return fx > fy ? h00 + (h10 - h00) * fx + (h11 - h10) * fy : h00 + (h11 - h01) * fx + (h01 - h00) * fy;
  }
  O.terrainAt = (x, z) => { const t = tileOf(x, z); return t && t.hN ? gridAt(t, t.hN, x, z) : null; };
  O.meshAt = (x, z) => { const t = tileOf(x, z); return t && t.hM ? gridAt(t, t.hM, x, z) : null; };
  const natural = (x, z) => { const h = O.terrainAt(x, z); return h !== null ? h : E.coreTerrainAt(x, z); };
  O.surfaceAt = (x, z) => { const t = tileOf(x, z); return t && t.rs ? t.rs.surfaceAt(x, z, natural) : null; };
  O.onRoad = (x, z, m = 0) => { const t = tileOf(x, z); return !!(t && t.rs && t.rs.onRoad(x, z, m)); };
  O.onAsphalt = (x, z, m = 0) => { const t = tileOf(x, z); return !!(t && t.rs && t.rs.onAsphalt(x, z, m)); };
  O.carveAt = (x, z, d) => { const t = tileOf(x, z); return t && t.rs ? t.rs.carveAt(x, z, d) : 0; };
  O.loadedAt = (x, z) => { const t = tileOf(x, z); return !!(t && t.ready); };
  O.streetAt = (x, z) => { // the named road you're on or next to, from the tile's road surface
    const t = tileOf(x, z); if (!t || !t.rs) return '';
    const q = t.rs.query(x, z, {}); if (!q || q.d - t.roads[q.road][2] / 2 > 25) return '';
    const n = t.roads[q.road][0]; return n >= 0 && t.d ? t.d.names[n] || '' : '';
  };
  O.builtAt = (x, z) => { const t = tileOf(x, z); return !!(t && t.built) || !O.has(Math.floor(x / T), Math.floor(z / T)); };

  // ---------------------------------------------------------------- streaming
  let scanT = 0, cullT = 0;
  const rectDist = (t, f) => Math.hypot(Math.max(t.x0 - f.x, 0, f.x - t.x0 - T), Math.max(t.z0 - f.z, 0, f.z - t.z0 - T));
  O.update = dt => {
    if (!O.ready) return;
    const f = E.focus(), view = E.view();
    if ((scanT -= dt) <= 0) {
      scanT = 0.5;
      const R = view + DATA_PAD, i0 = Math.floor((f.x - R) / T), i1 = Math.floor((f.x + R) / T), j0 = Math.floor((f.z - R) / T), j1 = Math.floor((f.z + R) / T);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (O.has(i, j) && !O.tiles.has(key(i, j)) && rectDist({ x0: i * T, z0: j * T }, f) < R) fetchTile(i, j);
      for (const t of O.tiles.values()) { // drop what's well out of range
        const d = rectDist(t, f);
        if (d > view + DROP_PAD) unload(t); else if (d > view + UNBUILD_PAD && t.built) unbuild(t);
      }
    }
    // build the nearest tile that's ready (its neighbours' data in, so roads reaching across have their heights)
    if (!O.building) {
      let best = null, bd = 1e9;
      for (const t of O.tiles.values()) {
        if (t.built || !t.ready || t.broken) continue;
        const d = rectDist(t, f); if (d > view + BUILD_PAD) continue;
        let ok = true;
        for (let b = -1; b <= 1 && ok; b++) for (let a = -1; a <= 1; a++) {
          const n = O.tiles.get(key(t.i + a, t.j + b));
          if (O.has(t.i + a, t.j + b) && !(n && (n.ready || n.failed))) { ok = false; if (!n) fetchTile(t.i + a, t.j + b); break; } // a corner neighbour can be past the data range: ask for it
        }
        if (ok && d < bd) { bd = d; best = t; }
      }
      if (best) { best.job = buildTile(best); O.building = best; best.b0 = performance.now(); best.work = 0; }
    }
    // waiting behind "Loading the area" (fast travel): nearly the whole frame; standing where nothing's built yet: a bit more
    const t0 = performance.now(), budget = E.hurry && E.hurry() ? HURRY : O.builtAt(f.x, f.z) ? BUDGET : URGENT;
    if (O.preps.length) { // tile data: terrain, road surface, carving (nearest tiles first)
      O.preps.sort((a, b) => rectDist(a, f) - rectDist(b, f));
      while (O.preps.length && performance.now() - t0 < budget * 0.6) { const t = O.preps[0], s0 = stepT0 = performance.now(); const done = !O.tiles.has(t.k) || t.prep.next().done; slow('prep:' + (t.phase || ''), performance.now() - s0, t); if (done) { O.preps.shift(); t.prep = null; } }
    }
    if (O.building) { // run the builder for a few milliseconds
      const b = O.building;
      while (performance.now() - t0 < budget) {
        let r; const s0 = stepT0 = performance.now();
        try { r = b.job.next(); } catch (e) { console.error('[outer] tile', b.k, e); E.setSink(null); E.holdPolys(null); unbuild(b); b.broken = true; break; } // one bad tile mustn't stop the frame
        slow('build:' + (b.phase || ''), performance.now() - s0, b); if (r.done) { b.job = null; O.building = null; O.stats.lastBuild = { tile: b.k, wallS: +((performance.now() - b.b0) / 1000).toFixed(1), workMs: Math.round(b.work + performance.now() - t0) }; break; } }
      if (O.building === b) b.work += performance.now() - t0;
    }
    // culling, twice a second: each 500 m piece drawn within view, its small stuff within the detail range, shadows near
    if ((cullT -= dt) <= 0) {
      cullT = 0.5; const lodNear = E.lodNear(), shNear = E.shadowNear(); let shown = 0;
      for (const t of O.tiles.values()) if (t.subs) for (const sb of t.subs) {
        const d = Math.max(0, Math.hypot(sb.cx - f.x, sb.cz - f.z) - T / SUB * 0.71), vis = d < view + 150;
        sb.group.visible = vis; if (!vis) continue; shown++;
        const near = d < lodNear, sh = d < shNear; if (sb.near === near && sb.sh === sh) continue; sb.near = near; sb.sh = sh;
        for (const m of sb.group.children) { if (m.userData.lod) m.visible = near; if (m.userData.cast === undefined) m.userData.cast = m.castShadow; m.castShadow = m.userData.cast && sh; }
      }
      O.stats.shown = shown;
    }
  };
  // a tile's data, ready before anything is drawn: terrain, roads, the road surface
  async function fetchTile(i, j) {
    const t = { i, j, k: key(i, j), x0: i * T, z0: j * T, hN: null, hM: null, rs: null, built: false, group: null, subs: null, polys: [], bld: [0, 0], edges: 0 };
    O.tiles.set(t.k, t);
    try {
      const r = await fetch(`assets/world/t/${t.k}.json.gz`); if (!r.ok) throw new Error(r.status);
      const d = await gunzipJSON(r); if (!O.tiles.has(t.k)) return;
      t.d = d; t.prep = prepare(t); O.preps.push(t); // run a few milliseconds a frame in update()
    } catch (e) { console.warn('[outer] tile', t.k, e); t.failed = true; }
  }
  function* prepare(t) {
    const d = t.d, x0 = t.x0, z0 = t.z0, s = 0.1; t.phase = 'parse';
    const abs = a => { const out = new Float32Array(a.length); let x = 0, z = 0; for (let k = 0; k < a.length; k += 2) { x += a[k]; z += a[k + 1]; out[k] = x0 + x * s; out[k + 1] = z0 + z * s; } return out; }; // delta-coded decimetres
    for (let j = 0, h = d.h; j < HN; j++) for (let i = 1; i < HN; i++) h[j * HN + i] += h[j * HN + i - 1]; // the posts: steps along each row
    // terrain: raw metres -> the game's exaggerated relief; inside the core photo, the core's own ground
    const hN = new Float32Array(HN * HN);
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
      const x = x0 + i * HC, z = z0 + j * HC, k = j * HN + i;
      hN[k] = E.inCorePhoto(x, z, 2) ? E.coreTerrainAt(x, z) : E.exag(d.h[k] * 0.1) - E.HBASE();
    }
    t.hN = hN;
    // roads: own edges then context copies, in the core's road format [name, type, width, pts, mph]
    const roads = [];
    t.edges = (d.e || []).map(e => { const p = abs(e[6]); roads.push([e[5], e[2], e[3] * E.ROAD_SCALE, Array.from(p), e[7]]); return { a: e[0], b: e[1], t: e[2], w: e[3] * E.ROAD_SCALE, ow: e[4], name: e[5] >= 0 ? d.names[e[5]] : '', p, mph: e[7], fl: e[8] }; });
    t.ownN = roads.length;
    for (const x of d.x || []) roads.push([-1, x[0], x[1] * E.ROAD_SCALE, Array.from(abs(x[2])), 0]);
    t.roads = roads;
    t.blds = []; for (const b of d.b || []) { t.blds.push([b[0], b[1], Array.from(abs(b[2])), b[3] * 0.1]); if (due()) yield; }
    yield;
    t.phase = 'paint';
    if (roads.length) { // the road surface, painted a few dozen roads at a time
      const rs = new RoadSurface(roads, t.blds.map(b => [b[0], b[1], b[2]]), { defer: true });
      for (let k = 0; k < rs.order.length; k++) { rs.paint(rs.order[k]); if (due()) yield; }
      t.rs = rs;
    }
    yield;
    // the ground mesh: natural terrain, pushed under the asphalt and walks (as the core's clampUnderRoads does)
    t.phase = 'carve'; const hM = hN.slice();
    if (t.rs) {
      for (let j = 0; j < HN; j++) {
        if (due()) yield;
        for (let i = 0; i < HN; i++) {
        const x = x0 + i * HC, z = z0 + j * HC;
        if (!t.rs.onRoad(x, z, HC)) continue; // nothing to carve
        let m = Infinity;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { // lowest built surface around this post
          const px = x + a * HC * 0.5, pz = z + b * HC * 0.5; if (!t.rs.onRoad(px, pz, 0.6)) continue;
          const h = t.rs.surfaceAt(px, pz, natural); if (h !== null && h < m) m = h;
        }
        const k = j * HN + i; if (m < Infinity && hM[k] > m - 0.3) hM[k] = m - 0.3;
        }
      }
    }
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) { const x = x0 + i * HC, z = z0 + j * HC; if (E.inCorePhoto(x, z, -1)) { const c = E.coreMeshAt(x, z); hM[j * HN + i] = (c !== null ? c : hM[j * HN + i]) - 0.3; } }
    t.hM = hM; t.ready = true; O.stats.data++;
  }

  // ---------------------------------------------------------------- building a tile (a generator: a few ms a frame)
  function* buildTile(t) {
    const d = t.d, g = new THREE.Group(), C = T / SUB; t.group = g; t.phase = 'terrain'; g.matrixAutoUpdate = false; // static: matrices once, not every frame
    const subs = []; for (let b = 0; b < SUB; b++) for (let a = 0; a < SUB; a++) { const cx = t.x0 + (a + 0.5) * C, cz = t.z0 + (b + 0.5) * C, sg = new THREE.Group(); sg.matrixAutoUpdate = false; g.add(sg); subs.push({ cx, cz, ch: E.newChunk(cx, cz), group: sg, near: null, sh: null }); }
    const ch = (x, z) => subs[Math.min(SUB - 1, Math.max(0, Math.floor((z - t.z0) / C))) * SUB + Math.min(SUB - 1, Math.max(0, Math.floor((x - t.x0) / C)))].ch; // the chunk sink: the piece under (x, z)
    // while this tile's builders run: meshes go to its pieces, and anything solid waits (t.pend) until it's drawn
    t.pend = []; const on = () => { E.setSink(ch); E.holdPolys(t.pend); }, off = () => { E.setSink(null); E.holdPolys(null); };
    // terrain with the tile's photo, one mesh per piece (so pieces out of view or range aren't drawn)
    {
      const mat = E.terrainMaterial(); t.mat = mat; const per = (HN - 1) / SUB; t.terrains = [];
      for (let b = 0; b < SUB; b++) for (let a = 0; a < SUB; a++) {
        const n = per + 1, pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), idx = [];
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const I = a * per + i, J = b * per + j, k = j * n + i, h = t.hM[J * HN + I]; pos[k * 3] = t.x0 + I * HC; pos[k * 3 + 1] = h; pos[k * 3 + 2] = t.z0 + J * HC; uv[k * 2] = I / (HN - 1); uv[k * 2 + 1] = 1 - J / (HN - 1); }
        for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
          const x = t.x0 + (a * per + i + 0.5) * HC, z = t.z0 + (b * per + j + 0.5) * HC; if (E.inCorePhoto(x, z, HC)) continue; // the core's own mesh is there
          const p0 = j * n + i, p1 = p0 + 1, p2 = p0 + n, p3 = p2 + 1; idx.push(p0, p3, p1, p0, p2, p3);
        }
        if (!idx.length) continue;
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; subs[b * SUB + a].group.add(mesh); t.terrains.push(mesh);
      }
      if (t.terrains.length) {
        t.terrain = t.terrains[0];
        (O.idx.tiles[t.k] & 4 ? E.loadPhoto(`assets/world/p/${t.k}.webp`) : Promise.resolve(null)).then(tex => {
          if (!tex) { if (t.terrains) { const m2 = E.terrainMaterial(true); for (const m of t.terrains) m.material = m2; t.mat = m2; mat.dispose(); } return; }
          if (!t.group) { tex.dispose(); return; } mat.map = tex; mat.needsUpdate = true; t.photo = tex; E.mapPhoto(t, tex.image); if (t.built && !t.trees) plant(t); });
      }
      // the sea: wherever the ground dips under sea level
      const sea = E.seaLevel(); let wet = false; for (let k = 0; k < HN * HN; k++) if (t.hN[k] < sea + 0.5) { wet = true; break; }
      if (wet) {
        const geo = new THREE.PlaneGeometry(T, T, 1, 1).rotateX(-Math.PI / 2).translate(t.x0 + T / 2, sea, t.z0 + T / 2);
        const m = new THREE.Mesh(geo, E.seaMat()); m.receiveShadow = true; m.matrixAutoUpdate = false; g.add(m);
      }
    }
    E.scene.add(g); // the ground shows now (its heights were already what you stand on); the rest joins it as it's built
    yield;
    // roads: asphalt, sidewalks and curbs, markings (the core's paveRoad), the graph for traffic and the GPS
    t.phase = 'roads'; on();
    let n = 0;
    for (const e of t.edges) {
      E.paveRoad(e.t, e.w, densify(e.p, 3), e.p);
      E.mapRoad(e);
      n++; if (due()) { off(); yield; on(); }
    }
    off();
    t.phase = 'graph'; for (const _ of E.addEdges(t.edges.filter(e => e.t <= 6), t, due)) yield;
    O.stats.edges += t.edges.length;
    yield;
    // street furniture: lamps along the bigger streets, stop signs, signal poles, crosswalk stripes
    t.phase = 'kit'; t.props = { meshes: [], props: [] }; on(); for (const _ of E.streetKit(t, d, t.props, due)) { off(); yield; on(); } off();
    yield;
    // buildings: one footprint makes both the walls you see and the polygon you hit
    t.phase = 'buildings'; on(); t.bld[0] = E.bldCount(); const p0 = E.polyCount(); t.polys = [p0, p0]; t.partial = true; // until done, unbuild drops everything added since p0
    n = 0;
    for (const b of t.blds) {
      if (b[2].length < 6) continue;
      const kind = b[1] === 0 && area(b[2]) > 450 ? 1 : b[1]; // a big "building=yes" is not a house
      E.addBuilding([b[0], kind, b[2], kind === 0 ? 1 : 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // houses get hip roofs
      n++; if (due()) { off(); yield; on(); }
    }
    off(); t.bld[1] = E.bldCount(); t.polys = [p0, E.polyCount()]; t.partial = false;
    O.stats.buildings += n;
    yield;
    // meshes, one builder at a time, into their pieces
    // meshes, one builder at a time, off-scene (so nothing shows before it's solid) ...
    t.phase = 'meshes'; t.staging = new THREE.Group();
    for (const sb of subs) { const out = { lod: [] }; sb.stage = new THREE.Group(); t.staging.add(sb.stage); for (const _ of E.meshChunkSteps(sb.ch, sb.stage, out)) yield; sb.ch = null; }
    // ... then into the scene in the same frame as the walls go solid
    t.phase = 'show';
    for (const sb of subs) { for (const m of sb.stage.children.slice()) sb.group.add(m); sb.stage = null; } t.staging = null; t.subs = subs;
    E.releasePolys(t.pend); t.pend = null; t.built = true; O.stats.built++;
    if (t.photo && !t.trees) plant(t); // trees and brush, read off the photo (when it's in)
    t.phase = '';
    if (O.onBuilt) O.onBuilt(t);
  }
  function plant(t) { if (E.plantTiles && t.photo) { const s0 = performance.now(); t.trees = E.plantTiles(t, t.photo.image); slow('plant', performance.now() - s0); } }
  O.plantAll = () => { for (const t of O.tiles.values()) if (t.built && !t.trees) plant(t); };
  O.vegNear = (dt, cam) => { for (const t of O.tiles.values()) { const V = t.trees && t.trees.veg; if (!V) continue; const L = V.last; L.t += dt; if (Math.hypot(cam.x - L.x, cam.z - L.z) > 6 || L.t > 2) { V.updateNear(cam.x, cam.z); L.x = cam.x; L.z = cam.z; L.t = 0; } } };
  O.seaLevel = () => E.seaLevel();
  function area(p) { let a = 0; for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) a += (p[j * 2] + p[i * 2]) * (p[j * 2 + 1] - p[i * 2 + 1]); return Math.abs(a) / 2; }
  function slow(k, ms, t) { const S = O.stats.slow || (O.stats.slow = {}); if (!(ms < (S[k] || 0))) S[k] = Math.round(ms); if (t) { const P = t.ms || (t.ms = {}); P[k] = (P[k] || 0) + ms; } } // worst step of each kind; each tile's time per phase
  async function gunzipJSON(r) { // the tile files are gzipped JSON (a server may have unzipped them already)
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
    return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  }
  function densify(p, step) {
    const out = [p[0], p[1]];
    for (let i = 0; i < p.length - 2; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
      for (let k = 1; k <= n; k++) out.push(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
    }
    return out;
  }
  function unbuild(t) {
    if (O.building === t) { // stopped half way: whatever its buildings added so far goes too (no walls without a building)
      O.building = null; t.job = null; E.setSink(null); E.holdPolys(null); t.pend = null;
      if (t.partial) { t.polys = [t.polys[0], E.polyCount()]; t.bld = [t.bld[0], E.bldCount()]; }
    }
    for (const G of [t.group, t.staging]) if (G) { E.scene.remove(G); G.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    if (t.mat) t.mat.dispose(); if (t.photo) { t.photo.dispose(); E.mapPhoto(t, null); }
    E.dropPolys(t.polys); E.dropBuildings(t.bld);
    if (t.props) E.dropKit(t.props); if (t.trees && E.dropTrees) E.dropTrees(t.trees);
    t.group = null; t.staging = null; t.terrain = null; t.terrains = null; t.subs = null; t.built = false; t.photo = null; t.mat = null; t.props = null; t.trees = null; t.polys = [0, 0]; t.bld = [0, 0];
  }
  function unload(t) { unbuild(t); O.tiles.delete(t.k); t.rs = null; t.hN = t.hM = null; t.d = null; }
  return O;
}
