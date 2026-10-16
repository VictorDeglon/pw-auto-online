// Reusable prop kit: school furniture, restroom fixtures, street furniture, signs.
//
//   import { createPropKit } from './props/kit.js';
//   const kit = createPropKit(THREE, { renderer?, audio?: AudioContext | () => AudioContext | null, audioOut?, envMap?, volume? });
//   kit.kinds                                  // string[]
//   const obj = kit.make(kind, params = {})    // THREE.Group, metres, origin on the floor, FRONT faces +Z
//   kit.instanced(kind, matrices, params?)     // THREE.Group of InstancedMesh (static, no interactions)
//   kit.interact.add/remove/nearest            // interaction registry (see createInteract below)
//   kit.update(dt, ctx)                        // tweens, timers, clocks, strobes, water, particles
//   kit.dispose()
// Extras: kit.info(kind) -> {anchor, desc}, kit.size(kind, params) -> THREE.Vector3, kit.release(obj),
//   kit.setAudio(ac, out?), kit.announce(text, ctx) (PA chime), kit.fireAlarm(on, seconds, ctx), kit.burst(obj, ctx),
//   kit.makeSign(opts), kit.roomNumber(text, opts).
//
// Conventions:
//   - anchor 'floor': origin = centre of the footprint on the floor. Seating/desks: +Z is the way the user faces
//     (desk + chair rotated the same way face the board; the teacher desk faces the class).
//   - anchor 'wall': back of the prop on the plane z = 0, prop in front of it (z > 0); place on the wall surface
//     and rotate so +Z points into the room. Heights are absolute from the floor (override with params.y).
//   - anchor 'ceiling': hangs from params.ceiling (default 3.0 m) above the origin.
//   - params.interactive === false: no interactions registered (make() registers its own otherwise).
// Action context (all members optional): { notify(text, cls?, dur?), money: { get(), add(n) }, heal(n), crime(kind),
//   sound(name, pos?), time(): {day, hour, minute}, player, emit(event, data) }.
// Nothing here knows about a particular school; text comes from params.
import { createGeo } from './geo.js';
import { createTex } from './tex.js';
import { createSynth } from './sfx.js';
import { signFactory } from './signs.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { schoolKinds } from './kinds_school.js';
// kinds_restroom.js and kinds_city.js were planned but never written (session ba5e3d98); only school kinds exist.

export const ease = {
  linear: t => t,
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: t => 1 - (1 - t) ** 3,
  in: t => t * t * t,
  back: t => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  bounce: t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
};

// ------------------------------------------------------------------ interaction registry
export function createInteract(THREE) {
  const entries = new Map();
  let nextId = 1;
  const tmp = new THREE.Vector3();

  function posOf(e, out) {
    const p = typeof e.pos === 'function' ? e.pos() : e.pos;
    return p ? out.copy(p) : null;
  }
  // object attached to a scene and visible all the way up?
  function live(o) {
    let n = o;
    while (n) { if (!n.visible) return false; if (!n.parent) return !!n.isScene; n = n.parent; }
    return false;
  }
  function labelOf(e) { if (!e) return ''; try { return typeof e.label === 'function' ? e.label() : (e.label || ''); } catch (err) { return ''; } }

  const R = {
    // { pos: Vector3 | () => Vector3, radius = 1.6, label: string | () => string, action(ctx), enabled?(), obj? } -> id
    add(e) {
      const id = nextId++;
      entries.set(id, Object.assign({ radius: 1.6, label: '', action: () => {} }, e, { id }));
      return id;
    },
    remove(id) { return entries.delete(id); },
    // drop every entry whose obj is `root` or inside it
    removeObject(root) {
      for (const [id, e] of entries) {
        let n = e.obj; while (n && n !== root) n = n.parent;
        if (n === root && e.obj) entries.delete(id);
      }
    },
    get(id) { return entries.get(id) || null; },
    get size() { return entries.size; },
    all() { return [...entries.values()]; },
    labelOf,
    // closest enabled entry within its radius (horizontal distance; entry may be 1 m below to 3 m above the
    // player's feet). With facingYaw (forward = (sin yaw, cos yaw)) entries in front win over ones behind.
    nearest(p, facingYaw) {
      if (!p) return null;
      let best = null, bestScore = Infinity;
      const hasYaw = typeof facingYaw === 'number' && isFinite(facingYaw);
      const fx = hasYaw ? Math.sin(facingYaw) : 0, fz = hasYaw ? Math.cos(facingYaw) : 0;
      for (const e of entries.values()) {
        if (e.obj && !live(e.obj)) continue;
        if (!posOf(e, tmp)) continue;
        const dx = tmp.x - p.x, dz = tmp.z - p.z, dy = tmp.y - (p.y || 0);
        if (dy < -1.0 || dy > 3.0) continue;
        const d = Math.hypot(dx, dz), r = e.radius ?? 1.6;
        if (d > r) continue;
        if (e.enabled && !e.enabled()) continue;
        let score = d / r;
        if (hasYaw && d > 0.3) {
          const c = (dx * fx + dz * fz) / d;
          if (c < -0.35 && d > 0.7) continue; // behind the player
          score += (1 - c) * 0.45;
        }
        if (score < bestScore) { bestScore = score; best = e; }
      }
      return best;
    },
    // convenience: nearest + action
    use(p, facingYaw, ctx) { const e = R.nearest(p, facingYaw); if (e) e.action(ctx || {}); return e; },
  };
  return R;
}

// ------------------------------------------------------------------ the kit
export function createPropKit(THREE, opts = {}) {
  const geo = createGeo(THREE);
  const renderer = opts.renderer || null;
  const aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  const tex = createTex(THREE, { anisotropy: aniso });

  // small studio environment for chrome / stainless / mirrors (not assigned to scene.environment)
  let envMap = opts.envMap || null, ownEnv = false;
  if (!envMap && renderer && opts.envMap !== false) {
    try {
      const pm = new THREE.PMREMGenerator(renderer); const room = new RoomEnvironment(renderer);
      envMap = pm.fromScene(room, 0.04).texture; room.dispose(); pm.dispose(); ownEnv = true;
    } catch (e) { envMap = null; }
  }

  let audioSrc = opts.audio ?? null, audioOut = opts.audioOut ?? null;
  const sfx = createSynth(
    () => (typeof audioSrc === 'function' ? audioSrc() : audioSrc),
    ac => (typeof audioOut === 'function' ? audioOut(ac) : audioOut), opts.volume ?? 0.7);
  const signs = signFactory(THREE, { anisotropy: aniso, envMap });

  // ---------------------------------------------------------------- materials (shared, cached by key)
  const mats = new Map();
  function mat(key, make) { let m = mats.get(key); if (!m) { m = make(); m.name = key; mats.set(key, m); } return m; }
  const hex = c => (typeof c === 'string' ? c : '#' + new THREE.Color(c).getHexString());
  const std = (key, o) => mat(key, () => new THREE.MeshStandardMaterial(o));
  const M = {
    std, mat,
    porcelain: std('porcelain', { color: 0xf4f4f0, roughness: 0.14, metalness: 0, envMap, envMapIntensity: 0.55 }),
    porcelainIn: std('porcelainIn', { color: 0xe6e8e6, roughness: 0.2, metalness: 0, envMap, envMapIntensity: 0.4, side: THREE.DoubleSide }),
    chrome: std('chrome', { color: 0xe8ecef, roughness: 0.12, metalness: 1, envMap, envMapIntensity: 1.1 }),
    stainless: std('stainless', { color: 0xc9cdd0, roughness: 0.32, metalness: 0.9, envMap, envMapIntensity: 0.9 }),
    brushed: std('brushed', { color: 0xb9bdc1, roughness: 0.42, metalness: 0.8, envMap, envMapIntensity: 0.8 }),
    alu: std('alu', { color: 0xc4c8cc, roughness: 0.38, metalness: 0.75, envMap, envMapIntensity: 0.7 }),
    galv: std('galv', { color: 0xa9aeb2, roughness: 0.5, metalness: 0.65, envMap, envMapIntensity: 0.6 }),
    steelBlack: std('steelBlack', { color: 0x26282b, roughness: 0.5, metalness: 0.55, envMap, envMapIntensity: 0.5 }),
    castIron: std('castIron', { color: 0x1f2022, roughness: 0.65, metalness: 0.45, envMap, envMapIntensity: 0.35 }),
    rubber: std('rubber', { color: 0x141414, roughness: 0.92, metalness: 0 }),
    plasticBlack: std('plasticBlack', { color: 0x1a1b1d, roughness: 0.45, metalness: 0, envMap, envMapIntensity: 0.3 }),
    plasticWhite: std('plasticWhite', { color: 0xeeeeea, roughness: 0.4, metalness: 0, envMap, envMapIntensity: 0.3 }),
    plasticGray: std('plasticGray', { color: 0x8e9296, roughness: 0.55, metalness: 0 }),
    dark: std('dark', { color: 0x1c1d1f, roughness: 0.85, metalness: 0 }),
    interior: std('interior', { color: 0x3a3c3f, roughness: 0.75, metalness: 0.2 }),
    laminate: std('laminate', { color: 0xd8bd92, map: tex.wood(0), roughness: 0.5, metalness: 0, envMap, envMapIntensity: 0.25 }),
    laminateGray: std('laminateGray', { color: 0xc9c6bd, map: tex.speckle(), roughness: 0.5, metalness: 0, envMap, envMapIntensity: 0.25 }),
    woodMed: std('woodMed', { color: 0xa8774a, map: tex.wood(1), roughness: 0.6, metalness: 0 }),
    woodDark: std('woodDark', { color: 0x6b4428, map: tex.wood(2), roughness: 0.55, metalness: 0, envMap, envMapIntensity: 0.25 }),
    woodSlat: std('woodSlat', { color: 0x9a6a3e, map: tex.wood(3), roughness: 0.75, metalness: 0 }),
    concrete: std('concrete', { color: 0xa9a59c, map: tex.speckle(), roughness: 0.95, metalness: 0 }),
    glass: std('glass', { color: 0xd8eef5, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, envMap, envMapIntensity: 1.2, depthWrite: false }),
    glassSmoke: std('glassSmoke', { color: 0x2a3036, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55, envMap, envMapIntensity: 1, depthWrite: false }),
    mirror: std('mirror', { color: 0xe2e8ea, map: tex.mirror(), roughness: 0.03, metalness: 1, envMap, envMapIntensity: 1.25 }),
    paper: std('paper', { color: 0xf3f1ea, roughness: 0.9, metalness: 0 }),
    towel: std('towel', { color: 0xd9ccb0, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    gold: std('gold', { color: 0xe0b44a, roughness: 0.25, metalness: 1, envMap, envMapIntensity: 1.1 }),
    silver: std('silver', { color: 0xd6dadd, roughness: 0.2, metalness: 1, envMap, envMapIntensity: 1.1 }),
    bronze: std('bronze', { color: 0xb07a45, roughness: 0.3, metalness: 1, envMap, envMapIntensity: 1 }),
    water: std('water', { color: 0xcfeaf8, map: tex.waterStream(), roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.62, emissive: 0x16303f, depthWrite: false, envMap, envMapIntensity: 1 }),
    vcolor: std('vcolor', { vertexColors: true, roughness: 0.6, metalness: 0 }),
    // painted metal / plastics / emissive by colour
    paint: (c, rough = 0.45, metal = 0.35) => std(`paint|${hex(c)}|${rough}|${metal}`, { color: c, roughness: rough, metalness: metal, envMap, envMapIntensity: 0.45 }),
    plastic: (c, rough = 0.42, side = THREE.FrontSide) => std(`plastic|${hex(c)}|${rough}|${side}`, { color: c, roughness: rough, metalness: 0, envMap, envMapIntensity: 0.3, side }),
    glow: (c, i = 1.4) => std(`glow|${hex(c)}|${i}`, { color: 0x000000, emissive: c, emissiveIntensity: i, roughness: 0.4, metalness: 0 }),
    tex: (t, o = {}) => std(`tex|${t.uuid}|${JSON.stringify(o)}`, Object.assign({ map: t, roughness: 0.6, metalness: 0 }, o)),
  };
  M.envMap = envMap;
  // emissive-map material (screens, signs, panels): base map + glow map
  M.screen = (t, glowTex = t, i = 0.9, c = 0xffffff, o = {}) => std(`screen|${t.uuid}|${glowTex.uuid}|${i}|${hex(c)}|${JSON.stringify(o)}`,
    Object.assign({ map: t, emissive: c, emissiveMap: glowTex, emissiveIntensity: i, roughness: 0.35, metalness: 0 }, o));

  // ---------------------------------------------------------------- geometry caching, objects
  const partCache = new Map();
  function parts(key, fn) {
    let l = partCache.get(key);
    if (!l) { const b = new geo.Builder(); fn(b); l = b.build(); partCache.set(key, l); }
    return l;
  }
  function add(parent, list, o = {}) {
    const out = [];
    for (const { geo: g, mat: m } of list) {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = o.cast ?? !(m.transparent || m.emissiveIntensity > 0.5 && m.color && m.color.getHex() === 0);
      mesh.receiveShadow = o.receive ?? true;
      if (o.name) mesh.name = o.name;
      parent.add(mesh); out.push(mesh);
    }
    return out;
  }
  function pivot(parent, x = 0, y = 0, z = 0, name = '') { const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; parent.add(g); return g; }

  // ---------------------------------------------------------------- runtime: tweens, timers, live updaters
  const state = { baking: false, now: 0, ctx: {}, alarm: 0, alarmSnd: null };
  const tweens = [];
  function tween(dur, fn, done, e = ease.inOut) { const tw = { t: 0, dur, fn, done, e }; tweens.push(tw); if (fn) fn(0, 0); return tw; }
  function after(sec, fn) { const tw = { t: 0, dur: sec, fn: null, done: fn }; tweens.push(tw); return tw; }
  const lives = new Set();
  function live(obj, fn) { if (state.baking) return null; const l = { obj, fn }; lives.add(l); return l; }
  function isLive(o) { let n = o; while (n) { if (!n.visible) return false; if (!n.parent) return !!n.isScene; n = n.parent; } return false; }

  // ---------------------------------------------------------------- interactions
  const interact = createInteract(THREE);
  function on(obj, p, spec) {
    if (p.interactive === false || state.baking) return null;
    const local = new THREE.Vector3(...(spec.at || [0, 1, 0.4])), wp = new THREE.Vector3();
    const id = interact.add({
      pos: () => wp.copy(local).applyMatrix4(obj.matrixWorld),
      radius: spec.radius ?? 1.6, label: spec.label, enabled: spec.enabled, obj, kind: obj.userData.kind,
      action: ctx => spec.action(ctx || {}),
    });
    (obj.userData.interactIds ||= []).push(id);
    return id;
  }

  // ---------------------------------------------------------------- ctx helpers (all ctx members optional)
  const say = (ctx, text, cls = '', dur) => { try { if (ctx && typeof ctx.notify === 'function') ctx.notify(text, cls, dur); } catch (e) { /* host notify failed */ } };
  const wallet = {
    known: ctx => !!(ctx && ctx.money && typeof ctx.money.get === 'function'),
    get: ctx => (wallet.known(ctx) ? +ctx.money.get() || 0 : Infinity),
    add: (ctx, n) => { if (ctx && ctx.money && typeof ctx.money.add === 'function') ctx.money.add(n); },
    pay(ctx, price) { if (wallet.get(ctx) + 1e-6 < price) return false; wallet.add(ctx, -price); return true; },
  };
  const heal = (ctx, n) => { if (ctx && typeof ctx.heal === 'function') ctx.heal(n); };
  const crime = (ctx, kind) => { if (ctx && typeof ctx.crime === 'function') ctx.crime(kind); };
  const emit = (ctx, ev, data) => { if (ctx && typeof ctx.emit === 'function') ctx.emit(ev, data); };
  const worldPos = (obj, x = 0, y = 0, z = 0) => { obj.updateWorldMatrix(true, false); return new THREE.Vector3(x, y, z).applyMatrix4(obj.matrixWorld); };
  // play a synthesized sound; with no AudioContext fall back to ctx.sound(name) and an on-screen onomatopoeia
  function play(ctx, name, args = [], text = '', pos = null) {
    let ok = false;
    try { ok = typeof sfx[name] === 'function' ? !!sfx[name](...args) : false; } catch (e) { ok = false; }
    if (!ok) {
      if (ctx && typeof ctx.sound === 'function') { try { ctx.sound(name, pos); } catch (e) { /* ignore */ } }
      if (text) say(ctx, `<i>${text}</i>`, 'sfx', 1800);
    }
    return ok;
  }
  const pick = a => a[(Math.random() * a.length) | 0];
  const fmt$ = n => '$' + (Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0);

  // ---------------------------------------------------------------- particles (sprites in the prop's space)
  const puffTex = tex.make('fx-puff', 64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const glowTex = tex.make('fx-glow', 64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  // emitter: o = { at:[x,y,z], dir:[x,y,z], dur, rate, life, speed, spread, size:[a,b], color, opacity, gravity, drag }
  function emitter(parent, o) {
    if (state.baking) return;
    const life = o.life ?? 1, max = Math.ceil((o.rate ?? 20) * life) + 2, pool = [];
    for (let i = 0; i < max; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: o.color ?? 0xffffff, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; s.userData.noBake = true; s.userData.v = new THREE.Vector3(); s.userData.age = 0; parent.add(s); pool.push(s);
    }
    const dir = new THREE.Vector3(...(o.dir || [0, 1, 0])).normalize(), at = new THREE.Vector3(...(o.at || [0, 0, 0]));
    let t = 0, acc = 0, idx = 0;
    const l = live(parent, dt => {
      t += dt; acc += t < (o.dur ?? 1) ? dt * (o.rate ?? 20) : 0;
      while (acc >= 1) {
        acc -= 1; const s = pool[idx++ % max]; s.visible = true; s.userData.age = 0; s.position.copy(at);
        const sp = o.spread ?? 0.3;
        s.userData.v.set(dir.x + (Math.random() - 0.5) * sp, dir.y + (Math.random() - 0.5) * sp, dir.z + (Math.random() - 0.5) * sp).normalize().multiplyScalar((o.speed ?? 2) * (0.7 + Math.random() * 0.6));
      }
      let alive = false;
      for (const s of pool) {
        if (!s.visible) continue;
        const u = s.userData; u.age += dt; const k = u.age / life;
        if (k >= 1) { s.visible = false; continue; }
        alive = true;
        u.v.y -= (o.gravity ?? 0) * dt; u.v.multiplyScalar(1 - Math.min(0.9, (o.drag ?? 1.5) * dt));
        s.position.addScaledVector(u.v, dt);
        const sz = (o.size?.[0] ?? 0.1) + ((o.size?.[1] ?? 0.8) - (o.size?.[0] ?? 0.1)) * Math.sqrt(k); s.scale.set(sz, sz, sz);
        s.material.opacity = (o.opacity ?? 0.8) * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      }
      if (!alive && t > (o.dur ?? 1)) { lives.delete(l); for (const s of pool) { parent.remove(s); s.material.dispose(); } }
    });
  }

  // ---------------------------------------------------------------- kinds
  const builders = {};
  // flat textured quad (labels, screens, faces); shares PlaneGeometry per size
  const quadGeos = new Map();
  const quadGeo = (w, h) => { const k = w + '|' + h; let g = quadGeos.get(k); if (!g) quadGeos.set(k, g = new THREE.PlaneGeometry(w, h)); return g; };
  const quad = (parent, w, h, m, x, y, z, ry = 0, rx = 0) => {
    const q = new THREE.Mesh(quadGeo(w, h), m); q.position.set(x, y, z); q.rotation.set(rx, ry, 0); q.receiveShadow = true; parent.add(q); return q;
  };
  const texMat = (t, o = {}) => M.std(`t|${t.uuid}|${JSON.stringify(o)}`, Object.assign({ map: t, roughness: 0.55, metalness: 0 }, o));
  const K = {
    quad, quadGeo, texMat,
    THREE, geo, tex, sfx, signs, M, mats, parts, add, pivot, on, live, tween, after, ease, state, emitter, glowTex, puffTex,
    say, wallet, heal, crime, emit, play, pick, fmt$, worldPos, isLive, builders, strobes: new Set(), speakers: new Set(),
    headlines: opts.headlines || null, city: opts.city || 'Poway',
  };
  schoolKinds(K);

  // signs as kinds too
  builders.sign = { anchor: 'floor', desc: 'generic sign (signs.js makeSign params)', build(obj, p) { obj.add(signs.makeSign(p)); } };
  builders.room_number = { anchor: 'wall', desc: 'ADA room number plaque (params.text, params.sub)', build(obj, p) { obj.add(signs.roomNumber(p.text ?? '101', p)); } };
  builders.stop_sign = {
    anchor: 'floor', desc: 'octagonal stop sign on a post',
    build(obj, p) { obj.add(signs.makeSign({ text: 'STOP', w: 0.76, h: 0.76, shape: 'octagon', bg: '#c1121f', fg: '#ffffff', border: '#ffffff', post: true, height: p.height ?? 2.1, back: false })); },
  };

  function make(kind, params = {}) {
    const b = builders[kind];
    const obj = new THREE.Group(); obj.name = kind; obj.userData.kind = kind; obj.userData.params = params;
    if (!b) { console.warn('[props] unknown kind:', kind); return obj; }
    b.build(obj, params || {}, K);
    return obj;
  }

  function stableKey(p) {
    return JSON.stringify(p || {}, (k, v) => (typeof v === 'function' || (v && (v.isObject3D || v.isMaterial || v.isTexture)) ? undefined : v));
  }

  const bakeCache = new Map();
  function template(kind, params = {}) {
    const key = kind + '|' + stableKey(params);
    let t = bakeCache.get(key);
    if (!t) {
      state.baking = true;
      try { const o = make(kind, Object.assign({}, params, { interactive: false })); t = { list: geo.bake(o), box: new THREE.Box3().setFromObject(o) }; }
      finally { state.baking = false; }
      bakeCache.set(key, t);
    }
    return t;
  }

  function instanced(kind, matrices, params = {}) {
    const grp = new THREE.Group(); grp.name = `${kind} x${matrices.length}`; grp.userData.kind = kind;
    if (!matrices || !matrices.length) return grp;
    const { list } = template(kind, params);
    for (const { geo: g, mat: m } of list) {
      const im = new THREE.InstancedMesh(g, m, matrices.length);
      for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i]);
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere(); im.computeBoundingBox();
      im.castShadow = params.castShadow ?? false; im.receiveShadow = true;
      grp.add(im);
    }
    return grp;
  }

  function update(dt, ctx = {}) {
    dt = Math.min(Math.max(dt || 0, 0), 0.25);
    state.ctx = ctx || {}; state.now += dt;
    for (let i = 0; i < tweens.length; i++) {
      const tw = tweens[i]; tw.t += dt;
      const k = tw.dur > 0 ? Math.min(1, tw.t / tw.dur) : 1;
      if (tw.fn) tw.fn(tw.e ? tw.e(k) : k, k);
      if (k >= 1) { tweens.splice(i--, 1); if (tw.done) tw.done(state.ctx); }
    }
    for (const l of lives) { if (l.obj && !isLive(l.obj)) continue; l.fn(dt, state.ctx, state.now); }
    const wm = M.water.map; if (wm) wm.offset.y = (wm.offset.y - dt * 2.2) % 1;
    if (state.alarm > 0) { state.alarm -= dt; if (state.alarm <= 0) fireAlarm(false); }
  }

  // building-wide fire alarm: every fire_alarm strobe flashes, horn sounds (temporal-3)
  function fireAlarm(onOff = true, seconds = 30, ctx = state.ctx) {
    if (onOff) {
      const wasOn = state.alarm > 0;
      state.alarm = seconds;
      if (!wasOn) { const h = sfx.alarm(Math.min(seconds, 14), 0.9); state.alarmSnd = h; if (!h) say(ctx, '<i>WHOOP! WHOOP! WHOOP!</i>', 'sfx', 2500); }
    } else {
      state.alarm = 0; if (state.alarmSnd) { state.alarmSnd.stop(); state.alarmSnd = null; }
      for (const s of K.strobes) s.reset && s.reset();
    }
    return state.alarm > 0;
  }

  function announce(text, ctx = state.ctx) {
    const ok = sfx.chime(0.9);
    for (const s of K.speakers) s.flash && s.flash();
    after(ok ? 1.1 : 0, () => say(ctx, `<b>PA</b> · ${text}`, 'pa', 8000));
    return K.speakers.size;
  }

  function burst(obj, ctx = state.ctx) { const f = obj && obj.userData && obj.userData.burst; if (f) { f(ctx); return true; } return false; }

  function release(obj) {
    interact.removeObject(obj);
    for (const l of lives) { let n = l.obj; while (n && n !== obj) n = n.parent; if (n === obj) lives.delete(l); }
    obj.traverse(o => { K.strobes.forEach(s => { if (s.obj === o) K.strobes.delete(s); }); K.speakers.forEach(s => { if (s.obj === o) K.speakers.delete(s); }); });
  }

  const sizeCache = new Map();
  function size(kind, params = {}) {
    const key = kind + '|' + stableKey(params);
    let s = sizeCache.get(key);
    if (!s) { s = template(kind, params).box.getSize(new THREE.Vector3()); sizeCache.set(key, s); }
    return s.clone();
  }
  function info(kind) { const b = builders[kind]; return b ? { anchor: b.anchor || 'floor', desc: b.desc || '' } : null; }

  function dispose() {
    tweens.length = 0; lives.clear();
    for (const l of partCache.values()) for (const { geo: g } of l) g.dispose();
    for (const g of quadGeos.values()) g.dispose(); quadGeos.clear();
    for (const t of bakeCache.values()) for (const { geo: g } of t.list) g.dispose();
    partCache.clear(); bakeCache.clear(); sizeCache.clear();
    for (const m of mats.values()) m.dispose(); mats.clear();
    tex.dispose(); signs.dispose();
    if (ownEnv && envMap) envMap.dispose();
    if (state.alarmSnd) state.alarmSnd.stop();
  }

  const kit = {
    get kinds() { return Object.keys(builders); },
    make, instanced, interact, update, dispose, info, size, release, template,
    setAudio(ac, out) { audioSrc = ac ?? null; if (out !== undefined) audioOut = out; },
    announce, fireAlarm, burst,
    makeSign: o => signs.makeSign(o), roomNumber: (t, o) => signs.roomNumber(t, o),
    tex, sfx, materials: M, triangles: geo.tris,
  };
  K.kit = kit;
  return kit;
}
