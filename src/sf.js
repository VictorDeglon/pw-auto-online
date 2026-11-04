// Models from Sketchfab: found by tools/sketchfab/harvest.mjs, fitted for the game by tools/sketchfab/fit.py (real size
// in metres, standing on y = 0, +z forward, WebP textures, Draco meshes) and listed with their credits in
// assets/sf/catalog.json. Nothing loads up front: a model is fetched the first time something asks for it, kept while
// it's in use, and let go a while after nothing uses it, so a few hundred cars cost only what's on the street.
//   const SF = createSF(gltfLoader, { onUnload(id) })   await SF.ready
//   SF.cars -> [entry]   SF.things(kind) -> [entry]   SF.byId(id) -> entry
//   SF.get(id) -> scene (its clips on scene.animations) | null   SF.load(id) -> Promise<scene | null>   SF.wanted(id)
//   SF.use(id) / SF.drop(id) (reference counts)
//   SF.pickCar(type, wealth) -> a loaded car entry of that CAR type (or null), and keeps a few of each type loading
//   SF.warm(types, n) -> Promise: n cars of each type loaded (for the loading screen)
//   SF.tick(now)   once a second or so: rotates the cars on offer and unloads what nobody has used for a while
//   SF.credits() -> every entry, for the credits screen
// entry: { id, n: title, a: author, l: licence, u: Sketchfab page, k: kind, t: car type, tier 0..3, L, W, H, r, f: file }
const IDLE_MS = 90000, POOL = 4, ROTATE_MS = 40000, MAX_LOADING = 3;
const CAR_TEX = 512; // a car's textures are cut to this as it loads, and its normal and AO maps dropped: at 1024 a street of them took 1.5 GB of GPU memory
const TIER_WEALTH = [0.25, 0.5, 0.75, 0.95]; // economy, everyday, luxury, exotic: the zone wealth each fits best

export function createSF(loader, hooks = {}) {
  const S = { cars: [], all: [], ready: null, byIdMap: new Map(), models: new Map(), loading: new Map(), failed: new Set(), refs: new Map(), last: new Map(), retired: new Set(), rotT: 0 };
  S.ready = fetch('assets/sf/catalog.json').then(r => r.ok ? r.json() : { cars: [], things: [] }).catch(() => ({ cars: [], things: [] })).then(c => {
    S.cars = (c.cars || []).map(e => ({ ...e, k: 'car' })); S.all = [...S.cars, ...(c.things || [])];
    for (const e of S.all) S.byIdMap.set(e.id, e);
  });
  const api = {
    get ready() { return S.ready; }, get cars() { return S.cars; },
    things: kind => S.all.filter(e => e.k === kind), byId: id => S.byIdMap.get(id) || null,
    get: id => S.models.get(id) || null,
    loaded: () => [...S.models.keys()],
    wanted: id => S.byIdMap.has(id) && !S.failed.has(id), // in the catalogue and not a file that failed to load
    load(id) {
      if (S.models.has(id)) return Promise.resolve(S.models.get(id));
      if (S.loading.has(id)) return S.loading.get(id);
      const e = S.byIdMap.get(id); if (!e || S.failed.has(id)) return Promise.resolve(null); // a broken file isn't fetched again
      const p = new Promise(res => loader.load(`assets/sf/${e.f}`, g => { g.scene.animations = g.animations || []; res(g.scene); }, undefined, err => { console.warn('[sf]', id, err && err.message || err); res(null); }))
        .then(scene => scene && e.k === 'car' ? slim(scene, hooks.onUploaded).then(() => scene, () => scene) : scene)
        .then(scene => { S.loading.delete(id); if (scene) { S.models.set(id, scene); S.last.set(id, performance.now()); } else S.failed.add(id); return scene; });
      p.then(() => {}); S.loading.set(id, p); return p;
    },
    use(id) { S.refs.set(id, (S.refs.get(id) || 0) + 1); S.last.set(id, performance.now()); },
    drop(id) { const n = (S.refs.get(id) || 0) - 1; if (n > 0) S.refs.set(id, n); else S.refs.delete(id); S.last.set(id, performance.now()); },
    pickCar(type, wealth = 0.5) {
      const have = S.cars.filter(e => e.t === type && S.models.has(e.id) && !S.retired.has(e.id));
      if (have.length < POOL) startOne(type, wealth);
      if (!have.length) return null;
      // closer to the zone's money is likelier (a beater in Rancho Santa Fe now and then, never mostly)
      const w = have.map(e => Math.exp(-((TIER_WEALTH[e.tier | 0] - wealth) ** 2) / 0.06));
      let r = Math.random() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < have.length; i++) { r -= w[i]; if (r <= 0) return have[i]; }
      return have[have.length - 1];
    },
    warm(types, n = 2) { // the first n cars of each of these types, fetched while the loading screen is up: resolves once they're in (or can't be)
      return S.ready.then(() => new Promise(done => {
        const next = () => {
          let short = false;
          for (const t of types) {
            const of = S.cars.filter(e => e.t === t), have = of.filter(e => S.models.has(e.id)).length;
            if (have < n) short = true;
            if (have + of.filter(e => S.loading.has(e.id)).length < n) startOne(t, 0.5);
          }
          if (!short || !S.loading.size) done(); else Promise.race([...S.loading.values()]).then(next);
        };
        next();
      }));
    },
    tick(now) {
      if (now - S.rotT > ROTATE_MS) { // retire the oldest car of each type on offer, so the streets don't repeat
        S.rotT = now;
        const types = new Set(S.cars.filter(e => S.models.has(e.id)).map(e => e.t));
        for (const t of types) {
          const on = S.cars.filter(e => e.t === t && S.models.has(e.id) && !S.retired.has(e.id));
          if (on.length >= POOL) { on.sort((a, b) => (S.last.get(a.id) || 0) - (S.last.get(b.id) || 0)); S.retired.add(on[0].id); }
        }
      }
      for (const [id, scene] of S.models) {
        if (S.refs.get(id) || now - (S.last.get(id) || 0) < IDLE_MS) continue;
        const e = S.byIdMap.get(id); if (e && e.k !== 'car' && !S.retired.has(id) && now - (S.last.get(id) || 0) < IDLE_MS * 3) continue;
        S.models.delete(id); S.retired.delete(id); if (hooks.onUnload) hooks.onUnload(id); dispose(scene);
      }
    },
    credits: () => S.all,
  };
  function startOne(type, wealth) {
    if (S.loading.size >= MAX_LOADING) return;
    const pool = S.cars.filter(e => e.t === type && !S.models.has(e.id) && !S.loading.has(e.id) && !S.failed.has(e.id));
    if (!pool.length) return;
    const w = pool.map(e => Math.exp(-((TIER_WEALTH[e.tier | 0] - wealth) ** 2) / 0.06));
    let r = Math.random() * w.reduce((a, b) => a + b, 0), pick = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { pick = pool[i]; break; } }
    api.load(pick.id);
  }
  return api;
}

// Once a car's texture is on the GPU its decoded copy (an ImageBitmap, ~1 MB at 512 px) is let go: a few hundred cars'
// worth was ~370 MB held for nothing (nothing re-uploads them; a model loaded again brings fresh ones). onUploaded(t)
// runs first, for whatever still wants the pixels (index.html: the far LOD's average colour).
const freeAfterUpload = onUploaded => t => { const im = t.image; t.onUpdate = null; if (onUploaded) try { onUploaded(t); } catch (e) { } t.image = null; if (im && im.close) im.close(); };
async function slim(root, onUploaded) {
  const seen = new Set(), jobs = [], free = freeAfterUpload(onUploaded);
  root.traverse(o => {
    for (const m of o.isMesh ? [].concat(o.material) : []) {
      for (const k of ['normalMap', 'aoMap']) if (m[k]) { m[k].dispose(); m[k] = null; m.needsUpdate = true; }
      for (const k of ['map', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'alphaMap']) {
        const t = m[k], im = t && t.image; if (!im || seen.has(t)) continue; seen.add(t);
        const s = CAR_TEX / Math.max(im.width, im.height); if (!(s < 1)) { if (im.close) t.onUpdate = free; continue; }
        jobs.push(createImageBitmap(im, { resizeWidth: Math.round(im.width * s), resizeHeight: Math.round(im.height * s), resizeQuality: 'medium' })
          .then(b => { if (im.close) im.close(); t.image = b; t.needsUpdate = true; t.onUpdate = free; }, () => { }));
      }
    }
  });
  await Promise.all(jobs);
}

function dispose(root) {
  const seen = new Set();
  root.traverse(o => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    for (const m of [].concat(o.material || [])) {
      if (seen.has(m)) continue; seen.add(m);
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) if (m[k] && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
      m.dispose();
    }
  });
}
