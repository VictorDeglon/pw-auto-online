// Poway High School campus: the Blender-built GLB from tools/phs replaces the game's generic buildings there.
//
// Refresh the inputs after every tools/phs build (run from the repo root):
//   python3 -c "import json,shutil;shutil.copy('build/phs/phs_game.glb','assets/phs/phs.glb');open('data/phs.js','w').write('window.PHS_MANIFEST = '+json.dumps(json.load(open('build/phs/phs_manifest.json')),separators=(',',':'))+';\n')"
//
// Frames. The GLB is glTF Y-up metres in a campus-local frame: x = metres east, z = -metres north of
// manifest.frame.origin_lat/lon. The game (index.html aerInv) uses x = (lon - LON0) * KX, z = -(lat - LAT0) * KZ.
// Both are linear in lat/lon, so campus -> game is affine: one root Group with
//   position (ox, 0, oz), scale (KX / m_per_deg_lon, 1, KZ / m_per_deg_lat).
// Heights in the GLB are relative to the ground: "drape" vertices store a lift above the ground under them,
// "rigid" nodes have y = 0 at the lowest of their gtp_anchor points (gtp_anchor_ref = reuse another node's offset).
//
// API (index.html hooks are marked `// PHS`):
//   initPHS(ctx)          before buildWorld: manifest, campus polygon, GTP_NATURE_EXCLUDE, starts the GLB download
//   phsSkip(x, z)         point inside the campus (game x/z): buildWorld skips its own houses/pools/trees there
//   phsSkipFlat(flat)     same test on a footprint's centroid, for D.buildings
//   excludePoly()         campus polygon as a flat game [x0, z0, x1, z1, ...] array
//   loadPHS(ctx)          after buildWorld: place + ground-conform the GLB, colliders, doors/gates, zones
//   updatePHS(dt, pos)    every frame: door/gate animation, zone notices, "press E" hint, far-away culling
//   interactPHS(pos)      E key: open/close the nearest door or gate (true if one toggled)
// ctx: { THREE, scene, gltfLoader, heightAt, addPoly, notify, LAT0, LON0, KX, KZ, aniso? }

const GLB_URL = new URL('../assets/phs/phs.glb', import.meta.url).href;
const REACH = 3;          // m from a door/gate leaf (hinge to free edge) for E to work
const WALK_UNDER = 1.8;   // boxes raised at least this far off the ground get no 2-D collider (bleachers)
const CULL_DIST = 1900;   // hide the campus when the focus is this far from its centre (chunks use 1700)
const OFFSET = [[-1, -2], [-2, -4], [-4, -8]]; // polygonOffset factor/units: ground cover, surfaces, markings/paths

const S = {
  tried: false, ready: false, M: null, F: null, poly: null, bb: null, cx: 0, cz: 0, glb: null, root: null, mixer: null,
  groups: [], leaves: [], zones: [], inZone: new Set(), onCampus: false, lastNote: new Map(),
  near: null, hinted: new Map(), scan: 0, ctx: null,
};
export const state = S;

// ------------------------------------------------------------------ geometry helpers (game x/z)
function pip(x, z, p) {
  let inside = false; const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function bbox(f) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < f.length; i += 2) { a = Math.min(a, f[i]); c = Math.max(c, f[i]); b = Math.min(b, f[i + 1]); d = Math.max(d, f[i + 1]); }
  return [a, b, c, d];
}
const gx = e => S.F.ox + e * S.F.sx;           // campus metres east  -> game x
const gz = n => S.F.oz - n * S.F.sz;           // campus metres north -> game z
function toGame(flat) { const out = new Array(flat.length); for (let i = 0; i < flat.length; i += 2) { out[i] = gx(flat[i]); out[i + 1] = gz(flat[i + 1]); } return out; }
function minGround(H, f) { let m = Infinity; for (let i = 0; i < f.length; i += 2) m = Math.min(m, H(f[i], f[i + 1])); return m; }
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz; let t = L ? ((px - ax) * dx + (pz - az) * dz) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ before buildWorld
export async function initPHS(ctx) {
  if (S.tried) return !!S.M; // one attempt: the skips in buildWorld must agree with what loadPHS places
  S.tried = true;
  try {
    if (!window.PHS_MANIFEST) await import('../data/phs.js'); // classic `window.PHS_MANIFEST = …` file, also valid as a module
    const M = window.PHS_MANIFEST; if (!M || !M.frame || !M.campus) throw new Error('window.PHS_MANIFEST missing');
    // without the model, keep the game's own buildings/trees there rather than leave a hole
    if (!(await fetch(GLB_URL, { method: 'HEAD' }).then(r => r.ok, () => false))) throw new Error(GLB_URL + ' not found');
    const f = M.frame;
    S.F = { ox: (f.origin_lon - ctx.LON0) * ctx.KX, oz: -(f.origin_lat - ctx.LAT0) * ctx.KZ, sx: ctx.KX / f.m_per_deg_lon, sz: ctx.KZ / f.m_per_deg_lat };
    S.M = M; S.poly = toGame(M.campus); S.bb = bbox(S.poly);
    S.cx = (S.bb[0] + S.bb[2]) / 2; S.cz = (S.bb[1] + S.bb[3]) / 2;
    (window.GTP_NATURE_EXCLUDE ||= []).push(S.poly);
    if (ctx.gltfLoader) S.glb = ctx.gltfLoader.loadAsync(GLB_URL).catch(e => { console.warn('PHS: could not load', GLB_URL, e); return null; });
    return true;
  } catch (e) {
    console.warn('PHS: campus disabled:', e); S.M = S.poly = S.bb = null; return false;
  }
}
export function phsSkip(x, z) {
  const b = S.bb; return !!b && x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && pip(x, z, S.poly);
}
export function phsSkipFlat(f) {
  if (!S.bb || !f || f.length < 2) return false;
  let cx = 0, cz = 0; const n = f.length / 2; for (let i = 0; i < n; i++) { cx += f[i * 2]; cz += f[i * 2 + 1]; }
  return phsSkip(cx / n, cz / n);
}
export function excludePoly() { return S.poly; }

// ------------------------------------------------------------------ after buildWorld
export async function loadPHS(ctx) {
  if (S.ready) return true;
  if (!(await initPHS(ctx))) return false;
  try {
    const gltf = await (S.glb || ctx.gltfLoader.loadAsync(GLB_URL)); if (!gltf) return false;
    const { THREE } = ctx, H = ctx.heightAt; S.ctx = ctx;
    const root = new THREE.Group(); root.name = 'PHS';
    root.position.set(S.F.ox, 0, S.F.oz); root.scale.set(S.F.sx, 1, S.F.sz);
    const sc = gltf.scene; root.add(sc); root.updateMatrixWorld(true);

    // nodes by original name (userData.name) and by the loader's sanitized name
    const byName = new Map(); sc.traverse(o => { if (o.userData.name) byName.set(o.userData.name, o); if (o.name && !byName.has(o.name)) byName.set(o.name, o); });
    const node = name => name ? byName.get(name) || byName.get(THREE.PropertyBinding.sanitizeNodeName(name)) || null : null;

    // objects carrying gtp_conform (outermost only)
    const tagged = []; (function walk(o) { for (const c of o.children) { if (c.userData.gtp_conform) tagged.push(c); else walk(c); } })(sc);

    // ---- rigid: lift the whole node to the lowest ground under its anchor points
    const offsets = new Map(), _b = new THREE.Box3();
    const selfOffset = o => {
      const a = o.userData.gtp_anchor;
      if (Array.isArray(a) && a.length >= 2) return minGround(H, toGame(a));
      _b.setFromObject(o); if (_b.isEmpty()) return H(o.position.x * S.F.sx + S.F.ox, o.position.z * S.F.sz + S.F.oz);
      return Math.min(H(_b.min.x, _b.min.z), H(_b.max.x, _b.min.z), H(_b.max.x, _b.max.z), H(_b.min.x, _b.max.z), H((_b.min.x + _b.max.x) / 2, (_b.min.z + _b.max.z) / 2));
    };
    for (const o of tagged) if (o.userData.gtp_conform === 'rigid' && !o.userData.gtp_anchor_ref) offsets.set(o, selfOffset(o));
    for (const o of tagged) if (o.userData.gtp_conform === 'rigid' && o.userData.gtp_anchor_ref) {
      const ref = node(o.userData.gtp_anchor_ref);
      let off = ref ? offsets.get(ref) : undefined;
      if (off === undefined) { console.warn('PHS:', o.name, 'anchor_ref', o.userData.gtp_anchor_ref, 'not found; anchoring to itself'); off = selfOffset(o); }
      offsets.set(o, off);
    }
    for (const [o, off] of offsets) o.position.y += off;

    // ---- drape: every vertex sits its stored lift above the game ground under it
    const seen = new Set(), ground = new Map(); // ground drape mesh -> polygonOffset tier
    for (const o of tagged) {
      if (o.userData.gtp_conform !== 'drape') continue;
      const meshes = []; o.traverse(m => { if (m.isMesh) meshes.push(m); });
      let lo = Infinity, hi = -Infinity;
      for (const m of meshes) {
        if (seen.has(m.geometry)) m.geometry = m.geometry.clone(); seen.add(m.geometry);
        const g = m.geometry, p = g.attributes.position, e = m.matrixWorld.elements;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i); lo = Math.min(lo, y); hi = Math.max(hi, y);
          const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
          p.setY(i, (H(wx, wz) + y - (e[1] * x + e[9] * z + e[13])) / e[5]);
        }
        p.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
      }
      if (hi - lo < 0.6 && hi < 0.6) { // flat, ground-hugging layer
        const nm = o.userData.name || o.name, tier = /cover/i.test(nm) ? 0 : /mark|path|line|paint/i.test(nm) ? 2 : 1;
        for (const m of meshes) ground.set(m, tier);
      }
    }

    // ---- materials and shadows (the game has no environment map: tame metals so they don't render black)
    const tuned = new Set(), tierMats = new Map();
    const tune = m => {
      if (tuned.has(m)) return m; tuned.add(m);
      if (!ctx.scene.environment && m.metalness > 0.35) m.metalness = 0.35;
      for (const k of ['map', 'emissiveMap']) if (m[k] && ctx.aniso) m[k].anisotropy = ctx.aniso;
      return m;
    };
    const tierMat = (m, t) => {
      const k = m.uuid + ':' + t; let c = tierMats.get(k);
      if (!c) { c = m.clone(); c.polygonOffset = true; c.polygonOffsetFactor = OFFSET[t][0]; c.polygonOffsetUnits = OFFSET[t][1]; tierMats.set(k, c); }
      return c;
    };
    sc.traverse(o => {
      if (!o.isMesh) return;
      const t = ground.get(o);
      o.material = Array.isArray(o.material) ? o.material.map(m => t === undefined ? tune(m) : tierMat(tune(m), t)) : (t === undefined ? tune(o.material) : tierMat(tune(o.material), t));
      o.castShadow = t === undefined; o.receiveShadow = true;
    });

    // ---- zones: invisible volumes, tracked by their world AABB
    for (const o of tagged) {
      if (o.userData.gtp_kind !== 'zone') continue;
      o.visible = false; o.traverse(m => { m.castShadow = false; });
    }
    root.updateMatrixWorld(true);
    for (const o of tagged) {
      if (o.userData.gtp_kind !== 'zone') continue;
      const mz = (S.M.zones || []).find(z => z.node === (o.userData.name || o.name) || z.id === o.userData.gtp_id);
      S.zones.push({ id: o.userData.gtp_id || o.name, name: o.userData.gtp_name || (mz && mz.name) || o.name, box: new THREE.Box3().setFromObject(o) });
    }

    // ---- colliders (2-D footprints; base/top only matter to rayBuildings: bullets and the camera)
    let nCol = 0;
    for (const b of S.M.buildings || []) {
      const f = toGame(b.ring); if (f.length < 6) continue;
      const base = minGround(H, f) - 1; ctx.addPoly(f, base, base + b.h + 1); nCol++;
    }
    S.raised = [];
    for (const bx of S.M.boxes || []) {
      const r = (bx.rot_deg || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), hl = bx.l / 2, hw = bx.w / 2;
      const loc = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].flatMap(([u, v]) => [bx.x + c * u - s * v, bx.y + s * u + c * v]);
      const f = toGame(loc), g = Math.min(minGround(H, f), H(gx(bx.x), gz(bx.y))), y0 = bx.y0 || 0;
      if (ctx.onAsphalt && bx.l < 6 && bx.w < 6 && bx.h < 3 && ctx.onAsphalt((f[0] + f[4]) / 2, (f[1] + f[5]) / 2, 0.3)) continue; // hidden below
      // collideCircle ignores y, so any footprint blocks the player: raised boxes stay walk-under (no collider)
      if (y0 >= WALK_UNDER) { S.raised.push({ id: bx.id, f, base: g + y0, top: g + bx.h }); continue; }
      ctx.addPoly(f, y0 > 0 ? g + y0 : g - 1, g + bx.h); nCol++;
    }
    for (const fe of S.M.fences || []) {
      const p = toGame(fe.pts), h = fe.h || 1.83, t = 0.08;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az); if (L < 0.05) continue;
        const nx = -(bz - az) / L * t, nz = (bx - ax) / L * t, ha = H(ax, az), hb = H(bx, bz);
        ctx.addPoly([ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz], Math.min(ha, hb) - 0.5, Math.max(ha, hb) + h); nCol++;
      }
    }

    // ---- doors and gates: one action per clip ("<id>_open", rest pose = closed); double leaves share a clip
    S.mixer = new THREE.AnimationMixer(sc);
    const clips = new Map(gltf.animations.map(c => [c.name, c])), byClip = new Map(), animated = new Set();
    let list = S.M.interactives;
    if (!list || !list.length) { list = []; sc.traverse(o => { const u = o.userData; if ((u.gtp_kind === 'door' || u.gtp_kind === 'gate') && u.gtp_anim) list.push({ node: u.name || o.name, kind: u.gtp_kind, id: u.gtp_id, anim: u.gtp_anim }); }); }
    for (const it of list) {
      const o = node(it.node), anim = it.anim || (o && o.userData.gtp_anim), clip = clips.get(anim);
      if (!o || !clip) { console.warn('PHS: interactive', it.node, o ? 'has no clip ' + anim : 'not found'); continue; }
      let grp = byClip.get(anim);
      if (!grp) {
        const action = S.mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true;
        grp = { id: it.id || anim, kind: it.kind || o.userData.gtp_kind || 'door', room: o.userData.gtp_room || '', action, open: false, leaves: [] };
        byClip.set(anim, grp); S.groups.push(grp);
      }
      // closed leaf as a segment hinge -> free edge, in game x/z (leaf geometry runs along the node's local x)
      const lb = new THREE.Box3(); o.traverse(m => { if (m.isMesh) { m.geometry.computeBoundingBox(); lb.union(m.geometry.boundingBox); } });
      const lx = lb.isEmpty() ? 1 : Math.abs(lb.max.x) >= Math.abs(lb.min.x) ? lb.max.x : lb.min.x;
      const hp = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld), tp = new THREE.Vector3(lx, 0, 0).applyMatrix4(o.matrixWorld);
      const leaf = { grp, hx: hp.x, hz: hp.z, tx: tp.x, tz: tp.z }; grp.leaves.push(leaf); S.leaves.push(leaf);
      for (const tr of clip.tracks) animated.add(tr.name.split('.')[0]);
    }

    // static nodes: freeze local matrices (animated leaves keep auto-update)
    sc.traverse(o => { if (o === sc || animated.has(o.name) || animated.has(o.uuid)) return; o.updateMatrix(); o.matrixAutoUpdate = false; });
    root.updateMatrixWorld(true);
    // small campus furniture (bike racks, benches, bollards) the model put out on a public street's asphalt: hide it
    if (ctx.onAsphalt) {
      const bb = new THREE.Box3(), sz = new THREE.Vector3(), cn = new THREE.Vector3(); let hidden = 0;
      sc.traverse(o => {
        if (!o.isMesh || animated.has(o.name)) return;
        bb.setFromObject(o); bb.getSize(sz); bb.getCenter(cn);
        if (Math.max(sz.x, sz.z) < 6 && sz.y < 3 && ctx.onAsphalt(cn.x, cn.z, 0.3)) { o.visible = false; hidden++; }
      });
      if (hidden) console.info(`PHS: hid ${hidden} small pieces standing on street asphalt`);
    }
    ctx.scene.add(root); S.root = root; S.ready = true;
    if (window.__gtp) window.__gtp.phs = S;
    console.info(`PHS: campus loaded (${tagged.length} nodes, ${nCol} colliders, ${S.groups.length} doors/gates, ${S.zones.length} zones)`);
    return true;
  } catch (e) {
    console.warn('PHS: failed to place the campus:', e); return false;
  }
}

// ------------------------------------------------------------------ runtime
function nearest(pos, reach) {
  let best = null, bd = reach;
  for (const l of S.leaves) { const d = segDist(pos.x, pos.z, l.hx, l.hz, l.tx, l.tz); if (d <= bd) { bd = d; best = l.grp; } }
  return best;
}
function note(key, html, dur = 3000, cool = 20) { // rate-limited HUD message
  const now = performance.now() / 1000, t = S.lastNote.get(key);
  if (t !== undefined && now - t < cool) return; S.lastNote.set(key, now); if (S.ctx && S.ctx.notify) S.ctx.notify(html, '', dur);
}
export function updatePHS(dt, pos) {
  if (!S.ready) return;
  if (S.mixer) S.mixer.update(dt);
  if (!pos) return;
  S.root.visible = Math.hypot(pos.x - S.cx, pos.z - S.cz) < CULL_DIST;
  if ((S.scan -= dt) > 0) return; S.scan = 0.2; // the rest runs at 5 Hz

  const on = phsSkip(pos.x, pos.z);
  if (on && !S.onCampus) note('campus', 'Entering <b>Poway High School</b>', 3000, 60);
  S.onCampus = on;
  for (const z of S.zones) {
    const b = z.box, inside = pos.x >= b.min.x && pos.x <= b.max.x && pos.z >= b.min.z && pos.z <= b.max.z && pos.y >= b.min.y - 3 && pos.y <= b.max.y + 0.5;
    if (inside && !S.inZone.has(z.id)) { S.inZone.add(z.id); note('zone:' + z.id, `<b>${esc(z.name)}</b>`); }
    else if (!inside) S.inZone.delete(z.id);
  }
  const g = nearest(pos, REACH);
  if (g && g !== S.near) note('hint:' + g.id, `Press <b>E</b> to ${g.open ? 'close' : 'open'} the ${esc(g.kind)}${g.room ? ` (room ${esc(g.room)})` : ''}`, 2500, 30);
  S.near = g;
}
export function interactPHS(pos, reach = REACH) {
  if (!S.ready || !pos) return false;
  const g = nearest(pos, reach); if (!g) return false;
  const a = g.action; g.open = !g.open;
  a.timeScale = g.open ? 1 : -1; a.paused = false;
  if (!a.isScheduled()) { a.time = g.open ? 0 : a.getClip().duration; a.play(); }
  return true;
}

// ------------------------------------------------------------------ spawn
// Game start point: on the running track at the south end of the football stadium, looking up the field, with the
// player's car parked beside them (campus local metres east/north). Lots of open room to walk or drive.
// index.html pickSpawn() keeps the nearest sidewalk as `curb` (the garage goes off the road there).
export function spawnPoint() {
  if (!S.F) return null;
  const x = gx(330), z = gz(378), fx = gx(316) - x, fz = gz(455) - z;
  return { x, z, rot: Math.atan2(fx, fz), car: { x: gx(341), z: gz(381), rot: Math.atan2(gx(343) - gx(341), gz(420) - gz(381)) } };
}
