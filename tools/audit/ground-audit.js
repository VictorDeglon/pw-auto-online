// Ground and collision audit: walks the town chunk by chunk (each 400 m chunk built in turn) and, looking straight down
// on the GPU, finds where the land isn't built right:
//   clip      the terrain pokes up through a paved surface (road, sidewalk, lot, driveway, trail) by more than 3 cm
//   fight     two different paved surfaces within 2 cm of each other over the same spot (they flicker)
//   walk      a wall, fence, post or bench face at body height (0.4-1.6 m over the ground) with no collision on it, so
//             you walk or drive straight through it (each near-vertical triangle sampled on the CPU against the game's own
//             collision; load the page with ?audit so streamed meshes keep their vertices)
//   plants    trees and shrubs standing on a road, in a parking lot or inside a building
//   trunks    a tree you'd hit with no trunk to stop you
// Run in the game page (a dev server, offline: ?emu=1&nk=firebase), after the loading screen:
//   const A = await import('/tools/audit/ground-audit.js'); const report = await A.audit({ res: 512 });
//   A.audit({ sample: 20 }) every 20th chunk (a full pass is hours on a laptop); A.audit({ only: [[cx, cz]], res: 1024 })
//   for one chunk in detail; report.worst lists the worst spots with their
//   coordinates, report.walk the solids by kind. Needs window.__gtp and window.__gtpAudit (index.html).
const CLIP = 0.03, FIGHT = 0.02, SLAB = [0.4, 1.6], PROBE = 0.3; // PROBE: about a person's radius (trim standing a few cm off a wall isn't a hole)

export async function audit(opts = {}) {
  const G = window.__gtp, A = window.__gtpAudit, THREE = G.THREE, R = G.renderer, N = opts.res || 512, S = A.CHUNK;
  if (!R.extensions.get('EXT_color_buffer_float')) throw new Error('needs EXT_color_buffer_float');
  const names = matNames(A), ground = new Set([...A.M.terrain, A.M.outer].filter(Boolean)), SU = A.SURF() || {};
  const paved = new Set([A.M.road, A.M.side, SU.road, SU.side, SU.path, SU.trail].filter(Boolean));
  const skipName = /^(near|impostors|groundcover|sky|Tyre marks|kit|lamps|mailboxes|sign-poles|moored|trailer|power|shop:)/;
  const vehG = new Set(G.vehicles.map(v => v.m && v.m.g)), pedG = new Set(G.peds.map(p => p.rig && p.rig.g));
  const isDyn = o => { for (let p = o; p; p = p.parent) if (vehG.has(p) || pedG.has(p)) return true; return false; };
  const rt = new THREE.WebGLRenderTarget(N, N, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const cam = new THREE.OrthographicCamera(-S / 2, S / 2, S / 2, -S / 2, 1, 8000); cam.up.set(0, 0, -1); cam.layers.set(29);
  const gTex = new THREE.DataTexture(new Float32Array(N * N * 4), N, N, THREE.RGBAFormat, THREE.FloatType); gTex.minFilter = gTex.magFilter = THREE.NearestFilter;
  const U = { uId: { value: 0 }, uSlab: { value: 0 }, uG: { value: gTex }, uBox: { value: new THREE.Vector4() }, uLo: { value: SLAB[0] }, uHi: { value: SLAB[1] } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `precision highp float; varying vec3 vW; uniform float uId, uSlab, uLo, uHi; uniform sampler2D uG; uniform vec4 uBox;
      void main(){ if (uSlab > 0.5) { vec2 uv = (vW.xz - uBox.xy) / uBox.zw; uv.y = 1.0 - uv.y; vec4 g = texture2D(uG, uv); if (g.a < 0.5) discard; float h = vW.y - g.r; if (h < uLo || h > uHi) discard; }
        gl_FragColor = vec4(vW.y, uId, 0.0, 1.0); }` });
  const out = { res: N, chunks: 0, clip: 0, fight: 0, walk: 0, plants: 0, trunks: 0, texel: S / N, worst: [], walkBy: {}, clipBy: {}, plantsBy: {}, trunksBy: {}, t0: performance.now() };
  let list = [...G.chunks.values()].filter(ch => opts.only ? opts.only.some(([x, z]) => Math.abs(x - ch.cx) < S / 2 && Math.abs(z - ch.cz) < S / 2) : (ch.lazy && (ch.lazy.blds.length || ch.lazy.roads.length)) || ch.group.children.length);
  if (opts.sample > 1) list = list.filter((_, k) => k % opts.sample === 0); // every n-th chunk: a town-wide sample in minutes, not hours
  if (opts.max) list = list.slice(0, opts.max);
  const wait = () => new Promise(r => setTimeout(r, 0));
  for (const ch of list) {
    if (opts.stop && opts.stop()) break;
    const cx = ch.cx, cz = ch.cz, x0 = cx - S / 2, z0 = cz - S / 2;
    G.player.pos.set(cx, G.heightAt(cx, cz), cz); A.updateChunkVisibility(cx, cz); await G.buildNear(cx, cz, 320); await wait();
    // the meshes over this chunk, by kind
    const meshes = { ground: [], paved: [], solid: [] };
    G.scene.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry || !o.geometry.boundingSphere || !o.material || Array.isArray(o.material)) return;
      const m = o.material; if (m.isShaderMaterial || m.transparent || (o.name && skipName.test(o.name)) || isDyn(o)) return;
      o.updateWorldMatrix(true, false); const bs = o.geometry.boundingSphere, c = bs.center.clone().applyMatrix4(o.matrixWorld), r = bs.radius * o.matrixWorld.getMaxScaleOnAxis();
      if (c.x + r < x0 || c.x - r > x0 + S || c.z + r < z0 || c.z - r > z0 + S || r > 5000) return;
      (ground.has(m) || /Terrain/.test(m.name || '') || /^(Ground|Field|Terrain|Track|Court)/.test(o.name || '') ? meshes.ground : paved.has(m) ? meshes.paved : meshes.solid).push(o);
    });
    const cap = (ms, slab) => capture(G, R, rt, cam, mat, U, ms, cx, cz, S, N, slab);
    const hG = cap(meshes.ground, 0), hP = cap(meshes.paved, 0);
    // the ground under anything solid: the terrain, or the paving over it
    const gd = gTex.image.data; for (let i = 0; i < N * N; i++) { const p = hP[i * 4 + 3] > 0.5, g = hG[i * 4 + 3] > 0.5; gd[i * 4] = p && (!g || hP[i * 4] > hG[i * 4]) ? hP[i * 4] : hG[i * 4]; gd[i * 4 + 3] = p || g ? 1 : 0; }
    gTex.needsUpdate = true; U.uBox.value.set(x0, z0, S, S);
    const at = i => [x0 + ((i % N) + 0.5) * S / N, z0 + (Math.floor(i / N) + 0.5) * S / N], spot = (kind, i, d, what) => { const [x, z] = at(i); return { kind, x: Math.round(x), z: Math.round(z), d: +d.toFixed(2), what }; };
    let clip = 0, fight = 0, walk = 0; const spots = [];
    for (let i = 0; i < N * N; i++) {
      if (hP[i * 4 + 3] > 0.5 && hG[i * 4 + 3] > 0.5) { const d = hG[i * 4] - hP[i * 4]; if (d > CLIP) { clip++; const w = nm(names, meshes.paved[hP[i * 4 + 1] - 1]); out.clipBy[w] = (out.clipBy[w] || 0) + 1; if (spots.length < 400) spots.push(spot('clip', i, d, w)); } }
    }
    // two paved layers on top of each other: the second-highest one, drawn alone, within FIGHT of the top one
    if (meshes.paved.length > 1) {
      const byId = new Map(); for (let i = 0; i < N * N; i++) if (hP[i * 4 + 3] > 0.5) { const id = hP[i * 4 + 1]; byId.set(id, (byId.get(id) || 0) + 1); }
      const top = [...byId.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0]); // the big surfaces: each against all the others
      for (const id of top) { const rest = meshes.paved.filter((_, k) => k + 1 !== id); const h2 = cap(rest, 0);
        for (let i = 0; i < N * N; i++) if (hP[i * 4 + 3] > 0.5 && hP[i * 4 + 1] === id && h2[i * 4 + 3] > 0.5) { const d = hP[i * 4] - h2[i * 4];
          if (d >= 0 && d < FIGHT && names.get(meshes.paved[id - 1].material) !== names.get(meshes.paved[h2[i * 4 + 1] - 1].material)) { fight++; if (spots.length < 400 && fight % 9 === 1) spots.push(spot('fight', i, d, nm(names, meshes.paved[id - 1]) + ' / ' + nm(names, meshes.paved[h2[i * 4 + 1] - 1]))); } } }
    }
    // walls, fences, posts at body height without collision: each near-vertical triangle sampled against the collision
    const probe = { x: 0, z: 0 }, va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
    const gAt = (x, z) => { const i = Math.floor((x - x0) / S * N), j = Math.floor((z - z0) / S * N); if (i < 0 || j < 0 || i >= N || j >= N) return null; const k = (j * N + i) * 4; return gd[k + 3] > 0.5 ? gd[k] : null; };
    let unaudited = 0, ops = 0;
    for (const o of meshes.solid) {
      const g = o.geometry, pa = g.attributes.position; if (!pa || !pa.array) { unaudited++; continue; }
      const ix = g.index && g.index.array, nt = (ix ? ix.length : pa.count) / 3, mw = o.matrixWorld, w = nm(names, o);
      for (let t = 0; t < nt; t++) {
        const a = ix ? ix[t * 3] : t * 3, b = ix ? ix[t * 3 + 1] : t * 3 + 1, c = ix ? ix[t * 3 + 2] : t * 3 + 2;
        va.fromBufferAttribute(pa, a).applyMatrix4(mw); vb.fromBufferAttribute(pa, b).applyMatrix4(mw); vc.fromBufferAttribute(pa, c).applyMatrix4(mw);
        nn.crossVectors(e1.subVectors(vb, va), e2.subVectors(vc, va)); const area = nn.length() / 2; if (area < 0.02) continue; nn.divideScalar(area * 2);
        if (Math.abs(nn.y) > 0.5) continue; // a floor, a roof, a step: walked on or over, not into
        const mx = (va.x + vb.x + vc.x) / 3, mz = (va.z + vb.z + vc.z) / 3; if (mx < x0 || mx >= x0 + S || mz < z0 || mz >= z0 + S) continue;
        const gy = gAt(mx, mz); if (gy === null) continue; const lo = Math.min(va.y, vb.y, vc.y) - gy, hi = Math.max(va.y, vb.y, vc.y) - gy;
        if (hi < SLAB[0] || lo > SLAB[1]) continue;
        // samples across the triangle (more on a big one), each a little in front of the face
        const k = Math.min(6, Math.max(1, Math.round(Math.sqrt(area) * 1.5)));
        for (let u = 0; u <= k; u++) for (let v = 0; u + v <= k; v++) {
          const bu = (u + 0.33) / (k + 1), bv = (v + 0.33) / (k + 1); if (bu + bv > 1) continue;
          const y = va.y + (vb.y - va.y) * bu + (vc.y - va.y) * bv - gy; if (y < SLAB[0] || y > SLAB[1]) continue;
          probe.x = va.x + (vb.x - va.x) * bu + (vc.x - va.x) * bv + nn.x * 0.05; probe.z = va.z + (vb.z - va.z) * bu + (vc.z - va.z) * bv + nn.z * 0.05;
          if (!A.collideCircle(probe, PROBE, true, gy + 0.2)) { walk++; out.walkBy[w] = (out.walkBy[w] || 0) + 1; if (spots.length < 400 && walk % 25 === 1) spots.push({ kind: 'walk', x: Math.round(probe.x), z: Math.round(probe.z), d: +y.toFixed(2), what: w }); }
          if ((++ops & 32767) === 0) await wait();
        }
      }
    }
    out.unaudited = (out.unaudited || 0) + unaudited;
    // plants on paving or in buildings, and trees with nothing to hit
    let plants = 0, trunks = 0; const V = G.nature.veg, TREE = /oak|olive|pepper|eucalyptus|jacaranda|palm|cypress|slender|citrus/, tp = { x: 0, z: 0 };
    if (V && V.inst) for (const [sp, a] of V.inst) for (let i = 0; i < a.x.length; i++) {
      const x = a.x[i], z = a.z[i]; if (x < x0 || x >= x0 + S || z < z0 || z >= z0 + S) continue;
      const bad = (G.ROADS && G.ROADS.onRoad(x, z, -0.3)) ? 'road' : A.inParkingLot(x, z) ? 'lot' : inBuilding(A, x, z) ? 'building' : null;
      if (bad) { plants++; const k = sp + ' ' + bad; out.plantsBy[k] = (out.plantsBy[k] || 0) + 1; if (spots.length < 400 && plants % 5 === 1) spots.push({ kind: 'plant', x: Math.round(x), z: Math.round(z), d: 0, what: k }); }
      if (TREE.test(sp) && a.s[i] * (V.lib.species.get(sp).variants[a.v[i]] || { height: 0 }).height > 3) { tp.x = x; tp.z = z; if (!A.collideCircle(tp, 0.35, true, a.y[i] + 0.3)) { trunks++; out.trunksBy[sp] = (out.trunksBy[sp] || 0) + 1; } } // a real tree: something to crash into
    }
    out.chunks++; out.clip += clip; out.fight += fight; out.walk += walk; out.plants += plants; out.trunks += trunks;
    out.worst.push({ cx, cz, clip, fight, walk, plants, trunks, spots: spots.filter((s2, k2) => k2 < 12 || s2.kind !== 'clip').slice(0, 40) });
    if (opts.onChunk) opts.onChunk(out, ch);
    await wait();
  }
  rt.dispose(); gTex.dispose(); mat.dispose();
  out.worst.sort((a, b) => (b.clip + b.fight + b.walk + b.plants * 4) - (a.clip + a.fight + a.walk + a.plants * 4)); out.worst = out.worst.slice(0, opts.keep || 40);
  for (const k of ['walkBy', 'clipBy', 'plantsBy', 'trunksBy']) out[k] = Object.fromEntries(Object.entries(out[k]).sort((a, b) => b[1] - a[1]).slice(0, 40));
  out.secs = Math.round((performance.now() - out.t0) / 1000); delete out.t0;
  return out;
}

// the topmost surface of `meshes` over the chunk, looking down: Float32 RGBA per texel (y, mesh index + 1, 0, written)
function capture(G, R, rt, cam, mat, U, meshes, cx, cz, S, N, slab) {
  const px = new Float32Array(N * N * 4); if (!meshes.length) return px;
  const keep = meshes.map(o => [o, o.visible, o.frustumCulled, o.onBeforeRender]);
  meshes.forEach((o, k) => { o.layers.enable(29); o.visible = true; o.frustumCulled = false; o.onBeforeRender = () => { U.uId.value = k + 1; mat.uniformsNeedUpdate = true; }; });
  const scn = G.scene, prev = { rt: R.getRenderTarget(), ov: scn.overrideMaterial, bg: scn.background, ac: R.autoClear, sm: R.shadowMap.autoUpdate, col: R.getClearColor(new G.THREE.Color()), a: R.getClearAlpha() };
  cam.position.set(cx, 4000, cz); cam.lookAt(cx, 0, cz); cam.updateMatrixWorld(); U.uSlab.value = slab;
  scn.overrideMaterial = mat; scn.background = null; R.shadowMap.autoUpdate = false; R.autoClear = true;
  try { R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(scn, cam); R.readRenderTargetPixels(rt, 0, 0, N, N, px); }
  finally {
    R.setRenderTarget(prev.rt); scn.overrideMaterial = prev.ov; scn.background = prev.bg; R.autoClear = prev.ac; R.shadowMap.autoUpdate = prev.sm; R.setClearColor(prev.col, prev.a);
    for (const [o, v, fc, ob] of keep) { o.layers.disable(29); o.visible = v; o.frustumCulled = fc; o.onBeforeRender = ob; }
  }
  // GL rows run bottom up; the camera's up is -z, so row 0 is the chunk's south edge (z0 + S): flip to z0-first rows
  const flip = new Float32Array(N * N * 4); for (let y = 0; y < N; y++) flip.set(px.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4);
  return flip;
}

function matNames(A) {
  const m = new Map(), add = (v, k) => { if (v && v.isMaterial && !m.has(v)) m.set(v, k); };
  for (const [k, v] of Object.entries(A.M)) { if (Array.isArray(v)) v.forEach((x, i) => add(x, `M.${k}[${i}]`)); else add(v, 'M.' + k); }
  const SU = A.SURF(); if (SU) for (const [k, v] of Object.entries(SU)) add(v, 'SURF.' + k);
  return m;
}
function nm(names, o) {
  if (!o) return '?'; const n = names.get(o.material); if (n) return n.replace(/\[\d+\]$/, '[]');
  let p = o; while (p && !p.name) p = p.parent; return (p && p.name ? p.name.split(/[:_]/)[0] : o.material.type) + (o.material.name ? ' ' + o.material.name.slice(0, 24) : '');
}
function inBuilding(A, x, z) { // inside a building's collision polygon (taller than 2.5 m), through the collision grid
  const c = A.cgrid.get(A.ckey(Math.floor(x / A.CELL), Math.floor(z / A.CELL))); if (!c || !c.b) return false;
  for (const bi of c.b) { const P = A.polys[bi]; if (!P || P.dead || x < P.minx || x > P.maxx || z < P.minz || z > P.maxz) continue; if (P.top - P.base > 2.5 && A.pip(x, z, P.p)) return true; }
  return false;
}
