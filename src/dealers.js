// Dealers: car lots and a marina. Walk up to the salesperson and press E to browse; hover a listing and it turns on
// the lot's turntable with the camera circling it; buy it and it's yours (a car joins your garage list and waits at
// the lot's exit, a boat waits at the dock). Every Sketchfab car in the game (src/sf.js) is on sale, filtered by kind,
// sorted and searched; the lot's classics (the stock bodies) come in three trims, and the trim sets the car's own
// numbers: upgrades (src/carmods.js) multiply those, so a better car gets more out of the same upgrade.
//   const DL = createDealers(H)   DL.setup()   DL.openAt(D)   DL.close()   DL.open   DL.target (what the camera circles)
//   H: { THREE, scene, CAR, TUNE, buildCar, carBase, releaseCar(m), sfCars(), sfGet(id), sfLoad(id), boatModel, boatKinds(), ll, site, heightAt, addPoly, addInteract, canvasTex, clearPlants(poly),
//        person(x, z, rot, i), money(), spend(n), addCar(listing, spot), addBoat(listing, D), notify, sfx, opened(), closed() }
export function createDealers(H) {
  const { THREE } = H;
  const TRIMS = [['Base', 1, 1], ['Sport', 1.1, 1.8], ['Elite', 1.22, 3.2]]; // name, numbers, price
  const CARS = [
    { type: 'sedan', model: 'q-compact', name: 'Compact', price: 6000, blurb: 'Light and cheap; parks anywhere.' },
    { type: 'sedan', model: 'q-sedan', name: 'Sedan', price: 9000, blurb: 'Comfortable, honest, quick enough.' },
    { type: 'suv', model: 'q-suv', name: 'SUV', price: 14000, blurb: 'Big, tall and happy off the road.' },
    { type: 'pickup', model: 'truck', name: 'Pickup', price: 12000, blurb: 'Hauls anything, climbs anything.' },
    { type: 'van', model: 'van', name: 'Panel van', price: 10000, blurb: 'A blank canvas for paint and parts.' },
    { type: 'van', model: 'delivery', name: 'Box truck', price: 13000, blurb: 'Slow, huge, unstoppable in traffic.' },
    { type: 'sports', model: 'q-sports', name: 'Coupe', price: 38000, blurb: 'The fastest thing on the lot.' },
    { type: 'bus', model: 'q-bus', name: 'Party bus', price: 30000, blurb: 'Bring everyone.' },
  ];
  const BOATS = [ // the boat models: src/world/boatmodels.js; how they handle: src/pilot.js BOATS
    { kind: 'kayak', name: 'Sit-on-top kayak', price: 650, blurb: 'A paddle and the whole lake.' },
    { kind: 'rowboat', name: 'Aluminium rowboat', price: 900, blurb: 'Oars and quiet.' },
    { kind: 'pedal', name: 'Pedal boat', price: 1400, blurb: 'Two seats, a canopy, your legs.' },
    { kind: 'jon', name: '14 ft fishing boat', price: 4800, blurb: 'Riveted aluminium and a 15 hp tiller.' },
    { kind: 'runabout', name: 'Bowrider', price: 18000, blurb: 'Bow seats, a split screen, a sterndrive.' },
    { kind: 'pontoon', name: 'Tritoon', price: 32000, blurb: 'A floating living room with a bimini.' },
    { kind: 'center', name: 'Center console', price: 68000, blurb: 'T-top, rod holders, twin 250s.' },
    { kind: 'speedboat', name: 'Sport boat', price: 95000, blurb: 'A deep V and twin 300s. Hold on.' },
    { kind: 'sailboat', name: '30 ft sloop', price: 74000, blurb: 'A cabin, a wheel, the wind (and a diesel).' },
    { kind: 'yacht', name: 'Flybridge yacht', price: 1250000, blurb: 'Fifty feet of it. Radar, a flybridge, a swim platform.' },
  ];
  const LOTS = [ // car lots: name, lat, lon (on the auto rows), and the marina
    ['Poway Auto Mall', 32.95745, -117.03915, 'car'], ['Parkway Motors', 32.94295, -117.05605, 'car'], ['Carmel Mountain Motors', 32.98075, -117.07955, 'car'],
    ['Lake Poway Marina', 33.0045, -117.0135, 'boat'],
  ];
  const listings = []; for (const C of CARS) for (const [trim, k, pk] of TRIMS) { const b = H.CAR[C.type]; if (!b) continue; listings.push({ ...C, trim, base: { vmax: b.vmax * k, acc: b.acc * k, turn: b.turn * (1 + (k - 1) * 0.6) }, price: Math.round(C.price * pk / 500) * 500 }); }
  const D = { open: false, at: null, target: null, sel: 0 }, dealers = [];

  // ---------------------------------------------------------------- places
  const mat = {
    asphalt: new THREE.MeshStandardMaterial({ map: H.canvasTex(256, 256, c => { c.fillStyle = '#2c2e31'; c.fillRect(0, 0, 256, 256); for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } c.fillStyle = '#e8e8e2'; for (let x = 0; x <= 256; x += 64) c.fillRect(x, 0, 3, 120); }), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.35, metalness: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fc2d6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }),
    white: new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.6 }),
    deck: new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 0.75 }),
    ring: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3df2ff).multiplyScalar(2.2), toneMapped: false }),
    pad: new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.18, metalness: 0.35, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -24 }),
  };
  function groundPlane(g, cx, cz, rot, y, w, d, z0, m) { // a slab that follows the ground, w x d, from local z0
    const geo = new THREE.PlaneGeometry(w, d, 14, 14).rotateX(-Math.PI / 2), pa = geo.attributes.position;
    for (let k = 0; k < pa.count; k++) { const lx = pa.getX(k), lz = pa.getZ(k) + z0 + d / 2, wx = cx + Math.cos(rot) * lx + Math.sin(rot) * lz, wz = cz - Math.sin(rot) * lx + Math.cos(rot) * lz; pa.setXYZ(k, lx, H.heightAt(wx, wz) - y + 0.04, lz); }
    geo.computeVertexNormals(); const o = new THREE.Mesh(geo, m); o.receiveShadow = true; g.add(o); return o;
  }
  const sign = (text, sub, w, h, col) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5), map: H.canvasTex(1024, Math.round(1024 * h / w), c => { const W = 1024, Hh = Math.round(1024 * h / w); c.fillStyle = '#0f1115'; c.fillRect(0, 0, W, Hh); c.fillStyle = col; let fs = Math.round(Hh * 0.42); c.font = `400 ${fs}px "Anton", "Barlow Condensed", sans-serif`; const tw = c.measureText(text).width; if (tw > W * 0.9) { fs = Math.floor(fs * W * 0.9 / tw); c.font = `400 ${fs}px "Anton", "Barlow Condensed", sans-serif`; } c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, W / 2, Hh * 0.42); c.fillStyle = '#9aa0a8'; c.font = `600 ${Math.round(Hh * 0.16)}px "Barlow Condensed", sans-serif`; c.fillText(sub, W / 2, Hh * 0.8); }) }));
  function carLot(name, s, idx) {
    const y = H.heightAt(s.x, s.z), g = new THREE.Group(); g.position.set(s.x, y, s.z); g.rotation.y = s.rot;
    const wp = (lx, lz) => [s.x + Math.cos(s.rot) * lx + Math.sin(s.rot) * lz, s.z - Math.sin(s.rot) * lx + Math.cos(s.rot) * lz];
    groundPlane(g, s.x, s.z, s.rot, y, 22, 21, 0, mat.asphalt); H.clearPlants([...wp(-13, -4), ...wp(13, -4), ...wp(13, 23), ...wp(-13, 23)]);
    // the glass showroom at the back
    const box = (w, h, d, x, yy, z, m, sh = true) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, yy, z); o.castShadow = sh; o.receiveShadow = true; g.add(o); return o; };
    for (const [x, z] of [[-11, 13], [-11, 20.5], [-1, 13], [-1, 20.5], [-6, 13]]) box(0.25, 4.6, 0.25, x, 2.3, z, mat.frame);
    box(10.6, 0.35, 8, -6, 4.75, 16.75, mat.frame, false); box(10.2, 4.4, 0.06, -6, 2.25, 13, mat.glass, false); box(0.06, 4.4, 7.5, -11, 2.25, 16.75, mat.glass, false); box(0.06, 4.4, 7.5, -1, 2.25, 16.75, mat.glass, false);
    box(10.2, 4.4, 0.2, -6, 2.25, 20.5, mat.white); groundPlane(g, s.x, s.z, s.rot, y, 10, 7.5, 13, mat.white).position.y += 0.02;
    const sg = sign(name.toUpperCase(), 'NEW · SPORT · ELITE', 10, 1.1, '#3df2ff'); sg.position.set(-6, 5.5, 12.85); sg.rotation.y = Math.PI; g.add(sg);
    // a pylon sign at the road and flags
    box(0.5, 9, 0.5, 10.4, 4.5, 1.2, mat.frame); const py = sign(name.split(' ')[0].toUpperCase(), 'CARS', 3, 3.6, '#f0b23a'); py.position.set(10.4, 7.4, 0.9); py.rotation.y = Math.PI; g.add(py);
    for (let i = 0; i < 4; i++) { box(0.08, 7, 0.08, -10.5 + i * 6, 3.5, 0.6, mat.frame); const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ color: [0xc4161c, 0x1f5fff, 0xf0b23a, 0xf2f2ef][i], side: THREE.DoubleSide, roughness: 0.8 })); f.position.set(-9.8 + i * 6, 6.4, 0.6); g.add(f); }
    // the turntable for previews, and four cars on show
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.08, 48), mat.pad); pad.position.set(6, H.heightAt(...wp(6, 14)) - y + 0.07, 14); // the camera circles it 6-7 m out: nothing tall inside that ring pad.receiveShadow = true; g.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.22, 0.035, 8, 64).rotateX(Math.PI / 2), mat.ring); ring.position.copy(pad.position).y += 0.045; g.add(ring);
    H.scene.add(g);
    for (const [x0, z0, x1, z1] of [[-11.2, 12.9, -0.8, 13.1], [-11.2, 12.9, -10.8, 20.7], [-1.2, 12.9, -0.8, 20.7], [-11.2, 20.3, -0.8, 20.7]]) { const a = wp(x0, z0), b = wp(x1, z0), c = wp(x1, z1), d = wp(x0, z1); H.addPoly([...a, ...b, ...c, ...d], y, y + 4.8); }
    const shown = []; for (let i = 0; i < 4; i++) { const L = listings.filter(l => l.type !== 'bus')[(idx * 5 + i * 4) % 21], m = H.buildCar(L.type, 0xffffff, L.model); const [x, z] = wp(...[[-8.5, 6], [-3.5, 6], [1.5, 6], [-6, 16.9]][i]); m.g.position.set(x, H.heightAt(x, z), z); m.g.rotation.y = s.rot + Math.PI; H.TUNE.applyLook({ m, spec: { L: m.L, W: m.W, H: m.H } }, { paint: H.TUNE.COLORS[1 + ((idx * 7 + i * 5) % 23)][1], finish: (i + idx) % 3, parts: { rims: 1 + (i % 4) } }); H.scene.add(m.g); shown.push(m); const r = s.rot + Math.PI, c = Math.cos(r), sn = Math.sin(r), hl = m.L / 2, hw = m.W / 2, P = []; for (const [u, v] of [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]]) P.push(x + c * u + sn * v, z - sn * u + c * v); H.addPoly(P, H.heightAt(x, z), H.heightAt(x, z) + m.H); } // three out front, one in the showroom; solid
    const [px, pz] = wp(6, 14), [sx, sz] = wp(9.8, 4.5), [ox, oz] = wp(-7.5, 2);
    const Dl = { name, kind: 'car', x: sx, z: sz, pad: { x: px, z: pz, y: H.heightAt(px, pz), rot: s.rot + Math.PI * 0.75 }, exit: { x: ox, z: oz, rot: s.rot + Math.PI }, g }; // a bought car waits at the front, nose to the road
    H.person(sx, sz, s.rot + Math.PI, idx); H.addInteract({ x: sx, z: sz, r: 3.4, label: () => `<b>${name}</b>: buy a car`, onUse: () => openAt(Dl) });
    dealers.push(Dl);
  }
  function marina(name, x0, z0, idx) {
    const W = H.water && H.water(x0, z0, 500); if (!W) return console.warn('[dealers] no shore for', name); // { x, z (the shore), dx, dz (out over the water), y (the water's surface) }
    const g = new THREE.Group(), y = W.y; g.position.set(W.x, 0, W.z); g.rotation.y = Math.atan2(W.dx, W.dz);
    H.clearPlants([W.x - W.dz * 9 - W.dx * 8, W.z + W.dx * 9 - W.dz * 8, W.x + W.dz * 9 - W.dx * 8, W.z - W.dx * 9 - W.dz * 8, W.x + W.dz * 9 + W.dx * 2, W.z - W.dx * 9 + W.dz * 2, W.x - W.dz * 9 + W.dx * 2, W.z + W.dx * 9 + W.dz * 2]); // the landing
    const plank = (w, d, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), mat.deck); o.position.set(0, y + 0.45, z); o.castShadow = o.receiveShadow = true; g.add(o); };
    plank(3, 34, 15); plank(14, 3, 26); plank(14, 3, 8);
    for (let z = 0; z <= 32; z += 4) for (const sx of [-1.4, 1.4]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3, 8), mat.frame); p.position.set(sx, y - 0.8, z); g.add(p); }
    const sg = sign(name.toUpperCase(), 'BOATS · SALES · SLIPS', 7, 1.1, '#3df2ff'); sg.position.set(0, y + 3.2, 0.2); sg.rotation.y = Math.PI; g.add(sg); // read from the shore const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 0.25), mat.frame); post.position.set(0, y + 1.6, 0.4); g.add(post);
    H.scene.add(g);
    const at = d => ({ x: W.x + W.dx * d, z: W.z + W.dz * d });
    const sales = at(-3), padP = at(30), Dl = { name, kind: 'boat', x: sales.x, z: sales.z, pad: { x: padP.x + W.dz * 8, z: padP.z - W.dx * 8, y, rot: Math.atan2(W.dx, W.dz) + 1.2, water: true }, slip: k => { const p = at(6 + (k % 3) * 8), side = k % 6 < 3 ? 4.6 : -4.6; return { x: p.x + W.dz * side, z: p.z - W.dx * side, y, rot: Math.atan2(W.dx, W.dz) }; }, g, water: W }; // slip(k): where your k-th boat ties up, beside the dock
    H.person(sales.x, sales.z, Math.atan2(W.dx, W.dz), idx + 10); H.addInteract({ x: sales.x, z: sales.z, r: 3.6, label: () => `<b>${name}</b>: buy a boat`, onUse: () => openAt(Dl) });
    dealers.push(Dl);
  }
  function setup() {
    LOTS.forEach(([name, lat, lon, kind], i) => {
      const p = H.ll(lat, lon); if (!p) return;
      if (kind === 'boat') return marina(name, p.x, p.z, i);
      const s = H.site(p.x, p.z, e => e.t >= 1 && e.t <= 4, [0, 60, 120, 200, 300, 420, 560, 700], 11, 21); if (s) carLot(name, s, i); else console.warn('[dealers] no room for', name);
    });
  }

  // ---------------------------------------------------------------- every Sketchfab car (src/sf.js) is on sale too, with its own numbers
  // and its showroom name (catalog g: real makers are only named in the credits). One trim each; the price follows its
  // class and its top speed.
  const TIER = ['Economy', 'Everyday', 'Luxury', 'Exotic'], TIER_PRICE = [6500, 15000, 42000, 150000], MPH_PER_V = 1.88;
  let sfL = null;
  function sfListings() {
    if (sfL) return sfL; const cars = H.sfCars ? H.sfCars() : []; if (!cars.length) return [];
    return (sfL = cars.map(e => {
      const b = H.CAR[e.t]; if (!b || !e.v) return null;
      const mph = Math.round(e.v * MPH_PER_V), base = H.carBase(e.t, 'sf-' + e.id);
      return { sf: e.id, type: e.t, model: 'sf-' + e.id, name: e.g || e.n, trim: '', tier: e.tier | 0, mph, base: { vmax: base.vmax, acc: base.acc, turn: b.turn },
        price: Math.round(TIER_PRICE[e.tier | 0] * Math.min(3, Math.max(0.5, (e.v / 50) ** 1.6)) / 500) * 500,
        blurb: `${TIER[e.tier | 0]} ${e.t === 'suv' ? 'SUV' : e.t}, ${mph} mph flat out. Model by ${e.a}.` };
    }).filter(Boolean));
  }
  const KINDS = [['all', 'All'], ['sports', 'Sports'], ['sedan', 'Sedans'], ['suv', 'SUVs'], ['pickup', 'Pickups'], ['van', 'Vans'], ['police', 'Police'], ['lot', 'Lot classics']];
  const F = { kind: 'all', sort: 'price', q: '' };
  let view = []; // the car listings that pass the filter, in order
  function filtered() {
    const all = [...sfListings(), ...listings.map(l => ({ ...l, lot: true }))], q = F.q.trim().toLowerCase();
    const v = all.filter(l => (F.kind === 'all' || (F.kind === 'lot' ? l.lot : !l.lot && l.type === F.kind)) && (!q || l.name.toLowerCase().includes(q)));
    if (F.sort === 'price') v.sort((a, b) => a.price - b.price); else if (F.sort === 'speed') v.sort((a, b) => b.base.vmax - a.base.vmax); else v.sort((a, b) => a.name.localeCompare(b.name));
    return v;
  }

  // ---------------------------------------------------------------- the preview on the turntable
  let shown = null, want = 0;
  const lookFor = (L, i) => L.sf ? { paint: null, finish: 0, parts: {} } : ({ paint: H.TUNE.COLORS[[5, 13, 2, 1, 8, 15, 6, 10][i % 8]][1], finish: L.trim === 'Elite' ? 3 : L.trim === 'Sport' ? 1 : 0, parts: L.trim === 'Elite' ? { rims: 1, spoiler: L.type === 'sports' ? 2 : 0 } : {} }); // the car you see is the car you get (a Sketchfab car in its own paint)
  function unshow() { if (!shown) return; H.scene.remove(shown.g); if (shown.m && H.releaseCar) H.releaseCar(shown.m); shown = null; }
  function preview(i) {
    const at = D.at, L = list()[i], ask = ++want; if (!at || !L) return;
    if (L.sf && H.sfGet && !H.sfGet(L.sf)) { // not loaded yet: the turntable waits for it (a stock stand-in would be the wrong car)
      D.loading = L.sf; H.sfLoad(L.sf).then(() => { if (ask === want && D.open) { D.loading = null; preview(i); details(); } }); return;
    }
    D.loading = null; unshow();
    if (at.kind === 'car') { const m = H.buildCar(L.type, 0xffffff, L.model); H.TUNE.applyLook({ m, spec: { L: m.L, W: m.W, H: m.H } }, lookFor(L, i)); m.g.position.set(at.pad.x, at.pad.y + 0.06, at.pad.z); m.g.rotation.y = at.pad.rot; H.scene.add(m.g); shown = { g: m.g, m, L: m.L, H: m.H }; }
    else { const g = H.boatModel(L.kind); if (!g) return; g.position.set(at.pad.x, at.pad.y, at.pad.z); g.rotation.y = at.pad.rot; H.scene.add(g); const b = new THREE.Box3().setFromObject(g), sz = b.getSize(new THREE.Vector3()); shown = { g, L: Math.max(sz.x, sz.z), H: sz.y }; }
    D.target = { pos: shown.g.position, spec: { L: shown.L, H: shown.H }, rotY: shown.g.rotation.y };
  }
  const list = () => !D.at ? [] : D.at.kind === 'car' ? view : BOATS.filter(b => H.boatKinds().includes(b.kind));

  // ---------------------------------------------------------------- the menu: filters on top, the chosen car under them, then the list
  const $ = id => document.getElementById(id), fmt = n => '$' + Math.round(n).toLocaleString();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const bar = (label, n) => `<div class="dl-bar"><span>${label}</span><i><b style="width:${n * 10}%"></b></i><em>${n.toFixed(1)}</em></div>`;
  const trimTag = x => x.trim ? ` <span class="dl-trim t-${x.trim.toLowerCase()}">${x.trim}</span>` : '';
  function render() {
    let el = $('dealer');
    if (!el) {
      el = document.createElement('div'); el.id = 'dealer'; document.body.appendChild(el); el.addEventListener('click', click);
      let hov = 0; el.addEventListener('mouseover', e => { const b = e.target.closest && e.target.closest('[data-i]'); if (!b || +b.dataset.i === D.sel) return; clearTimeout(hov); hov = setTimeout(() => select(+b.dataset.i), 90); }); // a short wait: sweeping down the list doesn't fetch every car on the way
      el.addEventListener('input', e => { if (e.target.id === 'dlq') { F.q = e.target.value; refilter(); } });
      el.addEventListener('change', e => { if (e.target.id === 'dlsort') { F.sort = e.target.value; refilter(); } });
    }
    el.style.cssText = 'position:fixed;inset:0;z-index:40;display:flex;justify-content:flex-end;cursor:grab'; // drag the backdrop to turn the view
    const at = D.at, car = at.kind === 'car';
    let h = `<div class="dl"><div class="dl-head"><div class="dl-name">${esc(at.name)}</div><div class="dl-cash" id="dlcash"></div></div>`;
    h += `<div class="dl-hint">${car ? 'Hover a car to see it on the turntable; drag the background to turn it.' : 'Hover a boat to see it at the slip. It waits at the dock once it\'s yours.'}</div>`;
    if (car) {
      const all = [...sfListings(), ...listings.map(l => ({ ...l, lot: true }))], n = k => k === 'all' ? all.length : k === 'lot' ? listings.length : all.filter(l => !l.lot && l.type === k).length;
      h += `<div class="chips dl-kinds">${KINDS.map(([k, t]) => `<button data-kind="${k}" class="${F.kind === k ? 'on' : ''}">${t} <small>${n(k)}</small></button>`).join('')}</div>`;
      h += `<div class="dl-tools"><input id="dlq" type="search" placeholder="Search by name" value="${esc(F.q)}" autocomplete="off"><select id="dlsort"><option value="price"${F.sort === 'price' ? ' selected' : ''}>Cheapest first</option><option value="speed"${F.sort === 'speed' ? ' selected' : ''}>Fastest first</option><option value="name"${F.sort === 'name' ? ' selected' : ''}>A to Z</option></select></div>`;
    }
    h += `<div class="dl-sel" id="dlsel"></div><div class="dl-list" id="dllist"></div><button data-close="1" class="mbtn small dl-close">Close <kbd>Esc</kbd></button></div>`;
    el.innerHTML = h; el.hidden = false; rows(); details();
  }
  function rows() {
    const L = list(), el = $('dllist'); if (!el) return;
    el.innerHTML = L.length ? L.map((x, i) => `<div data-i="${i}" class="dl-row${i === D.sel ? ' on' : ''}"><b>${esc(x.name)}${trimTag(x)}</b><span>${fmt(x.price)}</span></div>`).join('') : '<div class="dl-none">No cars by that name. Clear the search to see them all.</div>';
  }
  function details() {
    const L = list(), x = L[D.sel], el = $('dlsel'), money = H.money(); if ($('dlcash')) $('dlcash').textContent = fmt(money); if (!el) return;
    if (!x) { el.innerHTML = ''; return; }
    const R = D.at.kind === 'car' ? H.TUNE.ratings(x.base) : null, short = money < x.price;
    el.innerHTML = `<div class="dl-title"><b>${esc(x.name)}${trimTag(x)}</b><span>${fmt(x.price)}</span></div><div class="dl-blurb">${esc(x.blurb)}</div>` + (R ? bar('Speed', R.speed) + bar('Accel', R.accel) + bar('Handling', R.handling) : '') +
      `<button data-buy="${D.sel}" class="mbtn small${short ? '' : ' primary'}" ${short || D.loading ? 'disabled' : ''}>${D.loading ? 'Bringing it out…' : short ? 'Not enough money' : 'Buy for ' + fmt(x.price)}</button>`;
  }
  function select(i) {
    D.sel = i; const el = $('dllist'); if (el) for (const r of el.children) r.classList.toggle('on', +r.dataset.i === i);
    preview(i); details();
  }
  function refilter() { view = filtered(); D.sel = 0; rows(); if ($('dllist')) $('dllist').scrollTop = 0; select(0); }
  function click(e) {
    const b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.dataset.close) return close();
    if (b.dataset.kind) { F.kind = b.dataset.kind; for (const c of b.parentNode.children) c.classList.toggle('on', c === b); refilter(); return; }
    if (b.dataset.buy != null) {
      const L = list()[+b.dataset.buy]; if (!L || H.money() < L.price || D.loading) return;
      const ok = D.at.kind === 'car' ? H.addCar(L, D.at.exit, lookFor(L, +b.dataset.buy)) : H.addBoat(L, D.at); if (!ok) return;
      H.spend(L.price); H.sfx && H.sfx.cash && H.sfx.cash(); H.notify(`${D.at.kind === 'car' ? `Your ${L.trim ? L.trim + ' ' : ''}${L.name} is parked at the lot's exit, and it's in your garage list` : `Your ${L.name} is waiting at the dock`}.`, 'green', 5000);
      close();
    }
  }
  function openAt(at) { if (D.open) return; D.open = true; D.at = at; D.sel = 0; view = at.kind === 'car' ? filtered() : []; render(); preview(0); details(); H.opened(); }
  function close() { if (!D.open) return; D.open = false; want++; D.loading = null; unshow(); D.target = null; const el = $('dealer'); if (el) el.hidden = true; H.closed(); }
  D.setup = setup; D.openAt = openAt; D.close = close; D.dealers = dealers; D.listings = listings; D.boats = BOATS;
  return D;
}
