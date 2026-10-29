// Tuning a saved car: what it can do (MODS: engine, gearbox, brakes, suspension, tyres, weight, armour, glide turbo)
// and how it looks (paint colour and finish, trim, glass, headlights, underglow, rims, livery, body parts). Every part
// is fitted to the actual body: a probe casts rays at the car's meshes to find its roof, hood, deck, bumpers and sills,
// so wings stand on the boot lid, roof bars on the roof and liveries are wrapped onto the panels (not flat cards).
// Lights are light: LEDs are bright enough to bloom, and the underglow throws a soft pool of colour on the road (and,
// on the car you drive, a real light).
//   const T = createCarMods(THREE)
//   T.applyPerf(v, base, mods)    T.applyLook(target, look)  (target: a Vehicle or { m, spec })
//   T.lookKey(look) / T.lookOf(key)   what other players need to draw it    T.glow(car, night)   once a frame
//   catalogs: T.MODS T.COLORS T.FINISHES T.TRIMS T.GLASS T.HEADLIGHTS T.NEONS T.RIM_COLORS T.RIM_STYLES T.LIVERIES T.PARTS
export function createCarMods(THREE) {
  // ---------------------------------------------------------------- catalogs (indices are saved: only ever append)
  const MODS = {
    engine: { name: 'Engine', max: 5, cost: [300, 600, 1000, 1600, 2500], desc: '+8% top speed, +10% acceleration a level' },
    gearbox: { name: 'Gearbox', max: 3, cost: [400, 800, 1400], desc: '+12% acceleration a level' },
    brakes: { name: 'Brakes', max: 3, cost: [250, 500, 900], desc: '+25% stopping power a level' },
    suspension: { name: 'Suspension', max: 3, cost: [300, 650, 1100], desc: 'sharper steering, more grip in corners' },
    tires: { name: 'Tyres', max: 3, cost: [150, 350, 700], desc: '+20% grip a level, on and off road' },
    weight: { name: 'Weight reduction', max: 3, cost: [400, 900, 1500], desc: 'lighter: quicker off the line and through turns' },
    armor: { name: 'Armour', max: 3, cost: [200, 450, 800], desc: 'takes 40% less damage a level' },
    turbo: { name: 'Glide turbo', max: 2, cost: [300, 700], desc: 'stronger SPACE glide in the air' },
    hop: { name: 'Hydraulic jump', max: 5, cost: [900, 1600, 2600, 4000, 6000], desc: 'X jumps the car (and SPACE glides): higher and further every level' },
  };
  const COLORS = [['Factory', null], ['Gloss black', 0x0e0f11], ['Arctic white', 0xf2f2ef], ['Silver', 0xb9bec4], ['Gunmetal', 0x3e444b], ['Racing red', 0xc4161c],
    ['Candy apple', 0x9a0c16], ['Sunset orange', 0xff5a14], ['Poway gold', 0xd4a017], ['Sunflower', 0xf2c230], ['Lime', 0x7ed321], ['British green', 0x0f3d2a],
    ['Teal', 0x0b8a8f], ['Electric blue', 0x1f5fff], ['Midnight blue', 0x0e1a3d], ['Sky blue', 0x6fb7ff], ['Royal purple', 0x5a1f9e], ['Hot pink', 0xff4fa3],
    ['Rose gold', 0xc98b7a], ['Bronze', 0x8a5a2b], ['Sand', 0xc9b48f], ['Olive drab', 0x55603a], ['Chalk grey', 0x8c8f8a], ['Pearl white', 0xf6f1e6]];
  const FINISHES = [['Gloss', 0], ['Metallic', 200], ['Matte', 250], ['Pearl', 400], ['Candy', 450], ['Chrome', 1200]];
  const TRIMS = [['Chrome', 0, 0xd8dde2, 1, 0.12], ['Blacked out', 200, 0x111214, 0.2, 0.55], ['Gold', 450, 0xd4a017, 1, 0.18], ['Carbon', 350, 0x1b1c1f, 0.4, 0.3], ['Gunmetal', 250, 0x4b5258, 0.9, 0.3]];
  const GLASS = [['Smoke', 0, 0x0a0d10, 0.1, 0.1], ['Limo black', 150, 0x020203, 0.2, 0.05], ['Blue mirror', 300, 0x2a6fd6, 1, 0.05], ['Gold mirror', 300, 0xc9982a, 1, 0.05], ['Rainbow', 450, 0x1a1c22, 0.6, 0.05]];
  const HEADLIGHTS = [['Halogen', 0, 0xfff4d8], ['Xenon white', 150, 0xe8f2ff], ['Ice blue', 200, 0x9fd4ff], ['Retro yellow', 150, 0xffd23a], ['Purple', 250, 0xc28cff]];
  const NEONS = [['None', null], ['Cyan', 0x00e5ff], ['Pink', 0xff2bd6], ['Green', 0x39ff14], ['Purple', 0x9b30ff], ['Red', 0xff1a1a], ['Orange', 0xff7a1a], ['White', 0xf2f6ff], ['Gold', 0xffc21a], ['Blue', 0x2a5bff]];
  const RIM_COLORS = [['Stock', null], ['Chrome', 0xd8dde2], ['Gold', 0xd4a017], ['Black', 0x151515], ['Red', 0xc4161c], ['Gunmetal', 0x4b5258], ['White', 0xf2f2ef], ['Bronze', 0x8a5a2b], ['Blue', 0x1f5fff]];
  const RIM_STYLES = [['Stock', 0], ['Five-spoke', 250], ['Mesh', 350], ['Turbine', 400], ['Deep dish', 450], ['Split ten', 400]];
  const LIVERIES = [['None', 0], ['Racing stripes', 120], ['Side stripe', 100], ['Flames', 250], ['Checker', 220], ['Race number', 180], ['Tribal', 260]];
  const PARTS = {
    spoiler: { name: 'Spoiler', opts: [['None', 0], ['Duck tail', 150], ['GT wing', 300], ['Drag wing', 450], ['Swan neck', 520]] },
    roof: { name: 'Roof', opts: [['None', 0], ['Rack + spare', 200], ['LED light bar', 250], ['Roof scoop', 180], ['Shark fin', 60], ['Aero roof box', 160]] },
    front: { name: 'Front', opts: [['None', 0], ['Bull bar', 220], ['Push bar + lights', 280], ['Splitter', 150], ['Canards', 180]] },
    hood: { name: 'Hood', opts: [['Stock', 0], ['Hood scoop', 200], ['Twin vents', 260], ['Carbon hood', 380]] },
    exhaust: { name: 'Exhaust', opts: [['Stock', 0], ['Twin tips', 120], ['Side pipes', 240], ['Truck stacks', 300], ['Quad tips', 220]] },
    skirts: { name: 'Side skirts', opts: [['None', 0], ['Carbon skirts', 220], ['Body-colour skirts', 180]] },
    rear: { name: 'Rear', opts: [['Stock', 0], ['Diffuser', 260]] },
    stance: { name: 'Stance', opts: [['Stock', 0], ['Lowered', 200], ['Lifted + big tyres', 400]] },
    rims: { name: 'Rim colour', opts: RIM_COLORS.map(([n], i) => [n, i ? 120 : 0]) },
    livery: { name: 'Livery', opts: LIVERIES },
    rockets: { name: 'Rocket boosters', opts: [['None', 0], ['Twin boosters (+40% glide)', 900]] },
  };

  // ---------------------------------------------------------------- performance (all relative to the car's base, so a
  // better car gains more from the same level)
  function applyPerf(v, base, m = {}) {
    const lv = k => Math.min(m[k] || 0, MODS[k].max), s = v.spec;
    s.vmax = base.vmax * (1 + 0.08 * lv('engine')) * (1 + 0.02 * lv('weight'));
    s.acc = base.acc * (1 + 0.1 * lv('engine')) * (1 + 0.12 * lv('gearbox')) * (1 + 0.05 * lv('weight'));
    s.turn = base.turn * (1 + 0.08 * lv('suspension')) * (1 + 0.04 * lv('weight'));
    v.brakeMul = 1 + 0.25 * lv('brakes');
    v.tireMul = (1 + 0.2 * lv('tires')) * (1 + 0.06 * lv('suspension'));
    v.armorMul = 0.35 * Math.pow(0.6, lv('armor')); v.turbo = 1 + 0.5 * lv('turbo'); v.hopLv = lv('hop');
  }
  // 0..10 ratings for a car's stats (the dealer and the garage show them)
  const rate = (x, lo, hi) => Math.max(0, Math.min(10, Math.round((x - lo) / (hi - lo) * 100) / 10));
  function ratings(s, v = {}) {
    return { speed: rate(s.vmax, 25, 95), accel: rate(s.acc, 4, 30), handling: rate(s.turn * (v.tireMul || 1), 1, 3.6), braking: rate(v.brakeMul || 1, 0.6, 2.2) };
  }

  // ---------------------------------------------------------------- materials
  const tex = (w, h, draw, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); } return t; };
  const carbonTex = tex(64, 64, (g, w, h) => { // a 2x2 twill weave
    g.fillStyle = '#121316'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const gr = g.createLinearGradient(x * 16, y * 16, x * 16 + 16, y * 16 + 16), on = (x + y) % 2; gr.addColorStop(0, on ? '#2c2f35' : '#17181b'); gr.addColorStop(1, on ? '#16171a' : '#25282d'); g.fillStyle = gr; g.fillRect(x * 16, y * 16, 16, 16); }
  }, 6);
  const M = {
    carbon: new THREE.MeshPhysicalMaterial({ map: carbonTex, color: 0xffffff, roughness: 0.35, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe4e8ec, roughness: 0.08, metalness: 1 }),
    satin: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.45, metalness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.3, metalness: 0.9 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.35, clearcoat: 1 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x050505 }),
  };
  const ledMats = new Map(); // bright enough to bloom: lights look lit, not painted
  const led = (hex, k = 3) => { const key = hex + ':' + k; let m = ledMats.get(key); if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false }); ledMats.set(key, m); } return m; };
  const glowTex = tex(128, 128, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });

  // ---------------------------------------------------------------- probing the body
  const ray = new THREE.Raycaster(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _inv = new THREE.Matrix4();
  function probe(m) {
    m.g.updateMatrixWorld(true); _inv.copy(m.g.matrixWorld).invert();
    const mesh = []; m.body.traverse(o => { if (o.isMesh && o.visible && !o.userData.tuning) mesh.push(o); });
    const W2 = (m.W || 2) * 0.75 + 1, L2 = (m.L || 5) * 0.75 + 1, Ht = (m.H || 1.6) + 3;
    const cast = (ox, oy, oz, dx, dy, dz) => {
      _o.set(ox, oy, oz).applyMatrix4(m.g.matrixWorld); _d.set(dx, dy, dz).transformDirection(m.g.matrixWorld);
      ray.set(_o, _d); ray.far = 30; const h = ray.intersectObjects(mesh, false)[0];
      return h ? { p: h.point.clone().applyMatrix4(_inv), n: h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).transformDirection(_inv) : new THREE.Vector3(0, 1, 0) } : null;
    };
    const top = (x, z) => { const h = cast(x, Ht, z, 0, -1, 0); return h ? h.p.y : null; };
    const front = (x, y) => { const h = cast(x, y, L2, 0, 0, -1); return h ? h.p.z : null; };
    const back = (x, y) => { const h = cast(x, y, -L2, 0, 0, 1); return h ? h.p.z : null; };
    const side = (y, z, s = 1) => { const h = cast(s * W2, y, z, -s, 0, 0); return h ? h.p.x : null; };
    // the car's shape along its centre line: where the roof is, where the bonnet and boot lid are
    const Lr = m.L || 5, zs = [], hs = []; for (let i = 0; i <= 48; i++) { const z = -Lr * 0.62 + Lr * 1.24 * i / 48, y = top(0, z); if (y != null) { zs.push(z); hs.push(y); } }
    const peak = Math.max(...hs), roofZ = zs.filter((z, i) => hs[i] > peak - 0.1), fz = Math.max(...zs), bz = Math.min(...zs);
    const lowY = 0.55 * peak, fr = front(0, lowY) ?? fz, bk = back(0, lowY) ?? bz;
    const halfW = Math.max(side(peak * 0.45, 0, 1) ?? (m.W || 2) / 2, -(side(peak * 0.45, 0, -1) ?? -(m.W || 2) / 2));
    return {
      cast, top, front, back, side, peak, roofFront: Math.max(...roofZ), roofBack: Math.min(...roofZ), frontZ: fr, backZ: bk, halfW,
      hoodZ: (Math.max(...roofZ) + fr) / 2 + (fr - Math.max(...roofZ)) * 0.15, deckZ: bk + Math.min(0.55, (Math.min(...roofZ) - bk) * 0.35),
    };
  }
  // a thin skin over the body: a grid of rays from one direction, joined into a mesh lifted 8 mm off the paint
  function wrap(P, from, a0, a1, b0, b1, mat, nA = 24, nB = 16) {
    const pos = [], uv = [], idx = [], ok = []; const lift = 0.008;
    for (let j = 0; j <= nB; j++) for (let i = 0; i <= nA; i++) {
      const a = a0 + (a1 - a0) * i / nA, b = b0 + (b1 - b0) * j / nB; let h = null;
      if (from === 'top') h = P.cast(a, 9, b, 0, -1, 0); else if (from === 'left') h = P.cast(9, b, a, -1, 0, 0); else if (from === 'right') h = P.cast(-9, b, a, 1, 0, 0);
      if (h) { const p = h.p.addScaledVector(h.n, lift); pos.push(p.x, p.y, p.z); } else pos.push(0, 0, 0);
      uv.push(i / nA, j / nB); ok.push(!!h && (from !== 'top' || h.n.y > 0.35) && (from === 'top' || Math.abs(h.n.x) > 0.3));
    }
    const row = nA + 1;
    for (let j = 0; j < nB; j++) for (let i = 0; i < nA; i++) { const q = j * row + i, r = q + 1, s = q + row, t = s + 1; if (ok[q] && ok[r] && ok[s] && ok[t]) { if (from === 'right') idx.push(q, r, s, r, t, s); else idx.push(q, s, r, r, s, t); } } // triangles face out of the body
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const o = new THREE.Mesh(g, mat); o.userData.tuning = true; return o;
  }

  // ---------------------------------------------------------------- shapes
  function airfoil(chord, thick) { // a wing section: rounded leading edge, sharp trailing edge, cambered
    const s = new THREE.Shape(); const pts = 18;
    for (let i = 0; i <= pts; i++) { const t = i / pts, x = chord * (1 - t), y = thick * (0.6 * Math.sqrt(t) - 0.5 * t - 0.25 * t * t) * 2.2 + chord * 0.05 * Math.sin(Math.PI * t); i ? s.lineTo(x, y) : s.moveTo(x, y); }
    for (let i = pts; i >= 0; i--) { const t = i / pts, x = chord * (1 - t), y = -thick * (0.3 * Math.sqrt(t) - 0.25 * t) + chord * 0.05 * Math.sin(Math.PI * t); s.lineTo(x, y); }
    return s;
  }
  const extrude = (shape, depth, mat, bevel = 0.012) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 }); g.translate(0, 0, -depth / 2); const o = new THREE.Mesh(g, mat); o.castShadow = true; return o; };
  const rrect = (w, h, r) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2); s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };
  const tube = (pts, r, mat, closed = false) => { const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), closed, 'catmullrom', 0.2); const o = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(24, pts.length * 12), r, 12, closed), mat); o.castShadow = true; return o; };
  const capsule = (r, len, mat) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat); o.castShadow = true; return o; };

  // ---------------------------------------------------------------- the parts
  function buildParts(m, P, look, body) {
    const g = new THREE.Group(); g.userData.tuning = true;
    const S = probe(m), add = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); o.userData.tuning = true; g.add(o); return o; };
    const W = S.halfW, deckY = S.top(0, S.deckZ) ?? S.peak * 0.7, hoodY = z => S.top(0, z) ?? S.peak * 0.7;
    // ---- spoilers: standing on the boot lid
    if (P.spoiler === 1) { const o = add(extrude(airfoil(0.32, 0.07), W * 1.5, body, 0.01), 0, deckY + 0.015, S.deckZ - 0.12); o.rotation.y = -Math.PI / 2; o.rotation.z = -0.35; }
    if (P.spoiler >= 2 && P.spoiler <= 4) {
      const span = P.spoiler === 3 ? W * 2.15 : W * 1.9, rise = P.spoiler === 2 ? 0.34 : P.spoiler === 3 ? 0.7 : 0.48, chord = P.spoiler === 3 ? 0.46 : 0.36, zc = S.deckZ - 0.05;
      const wing = add(extrude(airfoil(chord, chord * 0.14), span, M.carbon, 0.008), 0, deckY + rise, zc + chord / 2); wing.rotation.y = -Math.PI / 2; wing.rotation.z = -0.16;
      for (const s of [-1, 1]) { // end plates and stands
        const ep = add(extrude(rrect(chord * 1.25, 0.2, 0.05), 0.012, M.carbon, 0.004), s * span / 2, deckY + rise + 0.02, zc); ep.rotation.y = Math.PI / 2;
        const x = s * span * 0.3, foot = S.top(x, zc) ?? deckY;
        if (P.spoiler === 4) add(tube([[x, foot, zc + 0.05], [x, foot + rise * 0.55, zc - 0.05], [x, deckY + rise + 0.09, zc + chord * 0.35]], 0.022, M.satin)); // swan neck: from above
        else { const st = add(extrude(rrect(0.1, deckY + rise - foot, 0.03), 0.025, M.satin, 0.006), x, (foot + deckY + rise) / 2, zc + chord * 0.3); st.rotation.y = Math.PI / 2; }
      }
    }
    // ---- roof: feet on the roof itself
    const roofMid = (S.roofFront + S.roofBack) / 2, roofAt = (x, z) => S.top(x, z) ?? S.peak;
    if (P.roof === 1) { // rails, crossbars and a spare wheel
      const zf = S.roofFront - 0.08, zb = S.roofBack + 0.08, rx = W * 0.62, h = 0.07;
      for (const s of [-1, 1]) add(tube([[s * rx, roofAt(s * rx, zb) + 0.01, zb], [s * rx, roofAt(s * rx, zb) + h, zb + 0.08], [s * rx, Math.max(roofAt(s * rx, zf), roofAt(s * rx, zb)) + h + 0.01, roofMid], [s * rx, roofAt(s * rx, zf) + h, zf - 0.08], [s * rx, roofAt(s * rx, zf) + 0.01, zf]], 0.018, M.satin));
      for (const z of [zb + 0.25, roofMid, zf - 0.25]) add(capsule(0.016, rx * 2, M.satin), 0, roofAt(0, z) + h + 0.02, z).rotation.z = Math.PI / 2;
      const t = add(new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.1, 12, 28), M.rubber), 0, roofAt(0, roofMid) + h + 0.13, roofMid); t.rotation.x = Math.PI / 2; t.castShadow = true;
    }
    if (P.roof === 2) { // LED light bar at the windscreen's top edge
      const z = S.roofFront - 0.12, y = roofAt(0, z), bar = add(capsule(0.055, W * 1.35, M.satin), 0, y + 0.1, z); bar.rotation.z = Math.PI / 2;
      for (let i = 0; i < 8; i++) add(new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), led(0xf4f8ff, 4)), -W * 0.68 + i * W * 0.195, y + 0.1, z + 0.056);
      for (const s of [-1, 1]) add(tube([[s * W * 0.6, roofAt(s * W * 0.6, z) + 0.005, z - 0.05], [s * W * 0.6, y + 0.06, z - 0.02], [s * W * 0.62, y + 0.1, z]], 0.012, M.satin));
    }
    if (P.roof === 3) { const z = roofMid + 0.05, o = add(extrude(rrect(W * 0.7, 0.16, 0.06), 0.6, body, 0.02), 0, roofAt(0, z) + 0.07, z); o.scale.set(1, 1, 1); add(new THREE.Mesh(new THREE.PlaneGeometry(W * 0.5, 0.08), M.hole), 0, roofAt(0, z) + 0.08, z + 0.32); }
    if (P.roof === 4) { const z = S.roofBack + 0.12, s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.05, 0.14, 0.2, 0.17); s.quadraticCurveTo(0.25, 0.08, 0.32, 0); s.lineTo(0, 0); const o = add(extrude(s, 0.05, body, 0.008), 0, roofAt(0, z) - 0.005, z); o.rotation.y = Math.PI / 2; }
    if (P.roof === 5) { const z = roofMid - 0.05, len = Math.min(1.7, (S.roofFront - S.roofBack) * 0.9), box = add(new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14), M.satin), 0, roofAt(0, z) + 0.2, z); box.scale.set(W * 0.6, 0.17, len / 2); box.castShadow = true; for (const s of [-1, 1]) add(capsule(0.014, len * 0.9, M.steel), s * W * 0.45, roofAt(s * W * 0.45, z) + 0.03, z).rotation.x = Math.PI / 2; }
    // ---- front: on the bumper
    const fy = 0.42, fz = S.front(0, fy) ?? S.frontZ;
    if (P.front === 1) { const z = fz + 0.1, y0 = 0.25, y1 = Math.min(0.95, S.top(0, fz - 0.3) ?? 0.9); for (const s of [-1, 1]) add(tube([[s * W * 0.55, y0, z - 0.1], [s * W * 0.6, y0 + 0.05, z], [s * W * 0.55, y1, z + 0.02], [s * W * 0.3, y1 + 0.05, z + 0.02], [0, y1 + 0.06, z + 0.02]], 0.035, M.chrome)); add(capsule(0.03, W * 1.2, M.chrome), 0, (y0 + y1) / 2, z + 0.05).rotation.z = Math.PI / 2; }
    if (P.front === 2) { const z = fz + 0.12; add(extrude(rrect(W * 1.4, 0.44, 0.06), 0.06, M.satin, 0.01), 0, 0.55, z); for (const s of [-1, 1]) { const pod = add(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.09, 20).rotateX(Math.PI / 2), M.satin), s * W * 0.45, 0.88, z); pod.castShadow = true; add(new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), led(0xf4f8ff, 5)), s * W * 0.45, 0.88, z + 0.047); } add(new THREE.Mesh(new THREE.PlaneGeometry(W * 1.1, 0.05), led(0xf4f8ff, 4)), 0, 0.72, z + 0.032); }
    if (P.front === 3 || P.front === 4) { // splitter: a lip following the bumper's own outline
      const pts = []; for (let i = 0; i <= 16; i++) { const x = -W * 0.98 + W * 1.96 * i / 16, z = S.front(x, 0.22); if (z != null) pts.push([x, z]); }
      if (pts.length > 4) { const s = new THREE.Shape(); s.moveTo(pts[0][0], -(pts[0][1] - 0.02)); for (const [x, z] of pts) s.lineTo(x, -(z + 0.07)); for (let i = pts.length - 1; i >= 0; i--) s.lineTo(pts[i][0], -(pts[i][1] - 0.12)); const o = add(extrude(s, 0.025, M.carbon, 0.006), 0, 0.16, 0); o.rotation.x = Math.PI / 2; }
      if (P.front === 4) for (const s of [-1, 1]) { const c = new THREE.Shape(); c.moveTo(0, 0); c.lineTo(0.22, 0.02); c.lineTo(0.18, 0.06); c.lineTo(0, 0.05); const z = (S.front(s * W * 0.8, 0.35) ?? fz) - 0.02, o = add(extrude(c, 0.012, M.carbon, 0.004), s * (W * 0.86), 0.36, z); o.rotation.y = s * Math.PI / 2 + Math.PI; o.rotation.x = -0.25 * s; }
    }
    // ---- hood: on the bonnet
    if (P.hood === 1) { const z = S.hoodZ, s = new THREE.Shape(); s.moveTo(-0.22, 0); s.lineTo(-0.16, 0.12); s.quadraticCurveTo(0, 0.15, 0.16, 0.12); s.lineTo(0.22, 0); s.lineTo(-0.22, 0); const o = add(extrude(s, 0.55, body, 0.02), 0, hoodY(z) - 0.01, z); o.rotation.x = -0.08; add(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.08), M.hole), 0, hoodY(z + 0.28) + 0.07, z + 0.29); }
    if (P.hood === 2) for (const sx of [-1, 1]) { const x = sx * W * 0.35; for (let i = 0; i < 4; i++) { const z = S.hoodZ - 0.12 + i * 0.09, o = add(capsule(0.012, 0.22, M.satin), x, (S.top(x, z) ?? hoodY(z)) + 0.008, z); o.rotation.z = Math.PI / 2; } }
    if (P.hood === 3) { const o = wrap(S, 'top', -W * 0.95, W * 0.95, S.roofFront + 0.18, S.frontZ - 0.08, M.carbon, 18, 14); if (o) g.add(o); }
    // ---- exhaust: tips out of the rear bumper
    const ry = 0.3, rz = S.back(0, ry) ?? S.backZ, tip = (x, r = 0.05) => { const o = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 0.16, 20, 1, true).rotateX(Math.PI / 2), M.chrome), x, ry, rz - 0.05); o.material.side = THREE.DoubleSide; add(new THREE.Mesh(new THREE.CircleGeometry(r * 0.85, 18), M.hole), x, ry, rz - 0.06).rotation.y = Math.PI; };
    if (P.exhaust === 1) for (const s of [-1, 1]) tip(s * W * 0.45, 0.055);
    if (P.exhaust === 4) for (const s of [-1, 1]) { tip(s * W * 0.38, 0.045); tip(s * W * 0.55, 0.045); }
    if (P.exhaust === 2) for (const s of [-1, 1]) { const x = s * ((S.side(0.3, 0, s) ?? s * W) * s + 0.06); add(tube([[s * (W * 0.8), 0.22, 0.6], [x, 0.3, 0.3], [x, 0.3, -0.9], [x, 0.31, -1.15]], 0.05, M.chrome)); }
    if (P.exhaust === 3) for (const s of [-1, 1]) { const x = s * (W * 0.85), z = S.roofBack - 0.25; add(tube([[x, 0.4, z], [x, S.peak * 0.8, z], [x, S.peak + 0.35, z - 0.05], [x, S.peak + 0.5, z - 0.18]], 0.06, M.chrome)); }
    // ---- side skirts and diffuser
    if (P.skirts) for (const s of [-1, 1]) { const zs = []; for (let i = 0; i <= 10; i++) { const z = S.backZ * 0.62 + (S.frontZ * 0.62 - S.backZ * 0.62) * i / 10, x = S.side(0.32, z, s); if (x != null) zs.push([x, z]); } if (zs.length > 3) add(tube(zs.map(([x, z]) => [x + s * 0.035, 0.24, z]), 0.05, P.skirts === 1 ? M.carbon : body)); }
    if (P.rear === 1) { const z = rz + 0.13, s = rrect(W * 1.5, 0.06, 0.025); add(extrude(s, 0.36, M.carbon, 0.008), 0, 0.17, z); for (let i = -2; i <= 2; i++) add(extrude(rrect(0.012, 0.12, 0.004), 0.32, M.carbon, 0.003), i * W * 0.28, 0.23, z + 0.01); } // under the bumper, fins and all
    // ---- rockets
    if (P.rockets) for (const s of [-1, 1]) { const pts = [[0, -0.5], [0.12, -0.45], [0.14, -0.2], [0.14, 0.3], [0.1, 0.45], [0, 0.5]].map(([r, y]) => new THREE.Vector2(r, y)); const b = add(new THREE.Mesh(new THREE.LatheGeometry(pts, 24).rotateX(Math.PI / 2), M.steel), s * W * 0.55, deckY + 0.2, S.deckZ - 0.1); b.castShadow = true; add(new THREE.Mesh(new THREE.CircleGeometry(0.09, 18), led(0xff7a1a, 3)), s * W * 0.55, deckY + 0.2, S.deckZ - 0.61).rotation.y = Math.PI; }
    // ---- livery, wrapped onto the panels
    const L = (P.livery ?? look.livery) | 0;
    if (L) {
      const mat = liveryMat(L, look.paint);
      if (L === 1 || L === 4) { const o = wrap(S, 'top', -W * (L === 4 ? 0.9 : 0.42), W * (L === 4 ? 0.9 : 0.42), S.backZ + 0.05, S.frontZ - 0.05, mat, 18, 40); if (o) g.add(o); }
      else for (const s of [-1, 1]) { const o = wrap(S, s > 0 ? 'left' : 'right', S.backZ + 0.25, S.frontZ - 0.25, 0.25, S.peak * 0.62, mat, 36, 10); if (o) g.add(o); }
    }
    return g;
  }
  const livCache = new Map();
  function liveryMat(k, paint) {
    const key = k + ':' + (paint ?? 'f'); let m = livCache.get(key); if (m) return m;
    const ink = paint != null && new THREE.Color(paint).getHSL({}).l > 0.55 ? '#121316' : '#f2f2ef';
    const t = tex(512, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      if (k === 1) { g.fillStyle = ink; g.fillRect(w * 0.36, 0, w * 0.1, h); g.fillRect(w * 0.54, 0, w * 0.1, h); g.save(); g.translate(0, 0); g.restore(); }
      if (k === 2) { g.fillStyle = ink; g.fillRect(0, h * 0.42, w, h * 0.16); g.fillStyle = '#f0b23a'; g.fillRect(0, h * 0.62, w, h * 0.05); }
      if (k === 3) { const gr = g.createLinearGradient(w, 0, 0, 0); gr.addColorStop(0, '#ffe14a'); gr.addColorStop(0.45, '#ff7a1a'); gr.addColorStop(1, 'rgba(212,22,28,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(w, h * 0.2); for (let i = 0; i <= 7; i++) { const x = w - i * w / 7, a = h * (0.35 + 0.25 * Math.sin(i * 1.9)); g.quadraticCurveTo(x + w / 14, a - h * 0.25, x, a); } g.lineTo(0, h * 0.95); g.lineTo(w, h * 0.95); g.fill(); }
      if (k === 4) { for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) { g.fillStyle = ink; g.fillRect(w * 0.4 + x * w * 0.05, y * h / 8, w * 0.05, h / 8); } }
      if (k === 5) { g.fillStyle = '#f2f2ef'; g.beginPath(); g.arc(w * 0.5, h * 0.5, h * 0.36, 0, Math.PI * 2); g.fill(); g.fillStyle = '#121316'; g.font = `900 ${h * 0.5}px Arial Black, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(7 + ((paint || 3) % 90)), w * 0.5, h * 0.53); }
      if (k === 6) { g.fillStyle = ink; g.beginPath(); for (let i = 0; i < 6; i++) { const x = w * (0.15 + i * 0.13); g.moveTo(x, h * 0.8); g.quadraticCurveTo(x + w * 0.09, h * 0.2, x + w * 0.16, h * 0.55); g.quadraticCurveTo(x + w * 0.08, h * 0.5, x, h * 0.8); } g.fill(); }
    });
    m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.35, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    livCache.set(key, m); return m;
  }

  // ---------------------------------------------------------------- rims: a face on each wheel's outer side
  function rimFace(style, color) {
    const g = new THREE.Group(), mat = color == null ? M.steel : new THREE.MeshStandardMaterial({ color, roughness: color === 0x151515 ? 0.5 : 0.18, metalness: color === 0xf2f2ef ? 0.2 : 0.95 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.07, 10, 40), mat); g.add(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 20).rotateX(Math.PI / 2), mat); g.add(hub);
    const spoke = (a, w, len = 0.72, tw = 0, z = 0) => { const s = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.07), mat); s.position.set(Math.sin(a) * (0.2 + len / 2), Math.cos(a) * (0.2 + len / 2), z); s.rotation.z = -a + tw; g.add(s); };
    if (style === 1) for (let i = 0; i < 5; i++) spoke(i * Math.PI * 2 / 5, 0.2);
    if (style === 2) for (let i = 0; i < 14; i++) { spoke(i * Math.PI * 2 / 14, 0.05, 0.74, 0.5); spoke(i * Math.PI * 2 / 14, 0.05, 0.74, -0.5, -0.02); }
    if (style === 3) for (let i = 0; i < 9; i++) spoke(i * Math.PI * 2 / 9, 0.16, 0.72, 0.6);
    if (style === 4) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.04, 36).rotateX(Math.PI / 2), mat); d.position.z = -0.05; g.add(d); for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10).rotateX(Math.PI / 2), M.chrome); b.position.set(Math.sin(i) * 0.5, Math.cos(i) * 0.5, 0.01); g.add(b); } }
    if (style === 5) for (let i = 0; i < 5; i++) { spoke(i * Math.PI * 2 / 5 - 0.12, 0.08); spoke(i * Math.PI * 2 / 5 + 0.12, 0.08); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.tuning = true; } });
    return g;
  }
  const _wb = new THREE.Box3(), _wv = new THREE.Vector3(), _wq = new THREE.Quaternion();
  function fitRims(m, style, color) {
    for (const w of m.wheels) {
      if (w.rimFace) { w.w.remove(w.rimFace); w.rimFace = null; }
      if (!style) continue;
      // the wheel's outer face, in the wheel's own frame (it spins about its own x axis)
      w.w.updateMatrixWorld(true); _wb.makeEmpty(); w.w.traverse(o => { if (o.isMesh && o.geometry && !o.userData.tuning) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); _wb.union(b); } });
      if (_wb.isEmpty()) continue;
      const inv = new THREE.Matrix4().copy(w.w.matrixWorld).invert(), size = _wb.getSize(new THREE.Vector3()), ctr = _wb.getCenter(new THREE.Vector3());
      const outward = new THREE.Vector3(Math.sign(w.piv.position.x) || 1, 0, 0).transformDirection(m.g.matrixWorld), lc = ctr.clone().applyMatrix4(inv), lo = outward.clone().transformDirection(inv).normalize();
      const r = Math.min(size.y, Math.max(size.x, size.z)) / 2, face = rimFace(style, color), half = Math.abs(lo.x) > 0.5 ? size.x : size.z;
      const scale = r * 0.66 / w.w.getWorldScale(_wv).y;
      face.scale.setScalar(scale); face.position.copy(lc).addScaledVector(lo, (half / 2) / w.w.getWorldScale(_wv).x * 0.92);
      face.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), lo); w.w.add(face); w.rimFace = face;
    }
  }

  // ---------------------------------------------------------------- the look, on a car
  function ownMats(m) { // this car's own copies, so painting one car doesn't paint every car of that model
    if (m.ownMats) return m.ownMats;
    const by = {}; m.g.traverse(o => { if (!o.isMesh || o.userData.tuning) return; const one = mt => { if (!mt) return mt; if (!mt.userData.own) { const c = mt.clone(); c.userData = { ...mt.userData, own: true, orig: { color: mt.color && mt.color.clone(), emissive: mt.emissive && mt.emissive.clone(), metalness: mt.metalness, roughness: mt.roughness } }; (by[mt.name] || (by[mt.name] = [])).push(c); if (m.mats) { const i = m.mats.indexOf(mt); if (i >= 0) m.mats[i] = c; } return c; } return mt; }; o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); });
    return (m.ownMats = by);
  }
  function applyLook(t, look = {}) {
    const m = t.m, P = look.parts || {}, mats = ownMats(m);
    // stance first: the probe reads the body where it sits
    m.body.position.y = P.stance === 2 ? 0.25 : P.stance === 1 ? -0.1 : 0;
    for (const w of m.wheels) { if (w.baseS === undefined) { w.baseS = w.w.scale.clone(); w.baseY = w.piv.position.y; } w.w.scale.copy(w.baseS).multiplyScalar(P.stance === 2 ? 1.35 : 1); w.piv.position.y = w.baseY + (P.stance === 2 ? 0.12 : 0); }
    // paint and finish (Quaternius bodies: the Body material; Kenney work vehicles: their texture, tinted)
    const fin = look.finish | 0, paint = look.paint ?? null, tint = new THREE.Color(paint ?? t.tint ?? 0xffffff);
    const bodies = [...(mats.Body || []), ...(mats.colormap || [])];
    for (const mt of bodies) {
      const base = mt.userData.base || mt.userData.orig.color; if (mt.color && base && mt.userData.base) mt.color.copy(base).multiply(tint); else if (mt.color && paint != null) mt.color.copy(tint);
      const f = [[0.1, 0.32, 1, 0.04], [0.65, 0.34, 1, 0.06], [0, 0.82, 0, 0.5], [0.4, 0.3, 1, 0.05], [0.55, 0.16, 1, 0.02], [1, 0.05, 0, 0]][fin] || [0.1, 0.32, 1, 0.04];
      mt.metalness = f[0]; mt.roughness = f[1];
      if (mt.isMeshPhysicalMaterial) { mt.clearcoat = f[2]; mt.clearcoatRoughness = f[3]; mt.iridescence = fin === 3 ? 0.55 : 0; mt.iridescenceIOR = 1.6; }
      if (fin === 5 && mt.color) mt.color.lerp(new THREE.Color(0xffffff), 0.35); // chrome: a bright mirror of the colour
      mt.needsUpdate = true;
    }
    const body = (mats.Body || mats.colormap || [])[0] || M.satin;
    const tr = TRIMS[look.trim | 0]; for (const mt of [...(mats.Trim || [])]) { mt.color.setHex(tr[2]); mt.metalness = tr[3]; mt.roughness = tr[4]; if (look.trim === 3) { mt.map = carbonTex; mt.color.setHex(0xffffff); } else mt.map = null; mt.needsUpdate = true; }
    const gl = GLASS[look.glass | 0]; for (const mt of mats.Glass || []) { mt.color.setHex(gl[2]); mt.metalness = gl[3]; mt.roughness = gl[4]; if (mt.isMeshPhysicalMaterial) { mt.iridescence = look.glass === 4 ? 1 : 0; mt.iridescenceIOR = 1.8; } mt.needsUpdate = true; }
    const hl = HEADLIGHTS[look.head | 0]; for (const mt of mats.LightFront || []) { mt.color.setHex(hl[2]); if (mt.emissive) mt.emissive.setHex(hl[2]).multiplyScalar(0.9); }
    if (m.beam && m.beam.material && m.beam.material.color) m.beam.material.color.setHex(hl[2]);
    // rims
    const rimC = RIM_COLORS[P.rims | 0][1];
    for (const w of m.wheels) w.w.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material) || o.userData.tuning) return;
      if (!o.userData.ownMat) { o.material = o.material.clone(); o.userData.ownMat = true; o.userData.base = o.material.color.clone(); }
      const b0 = o.userData.base; if (b0.r * 0.3 + b0.g * 0.6 + b0.b * 0.1 < 0.18) return; // the tyre stays rubber
      o.material.color.copy(rimC != null ? new THREE.Color(rimC) : b0); o.material.metalness = rimC === 0xd8dde2 || rimC === 0xd4a017 ? 0.95 : rimC != null ? 0.6 : 0.1; o.material.roughness = rimC != null ? 0.22 : 0.6;
    });
    fitRims(m, look.rimStyle | 0, rimC);
    // parts and livery
    if (m.partsG) { m.g.remove(m.partsG); m.partsG.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); m.partsG = null; }
    const g = buildParts(m, P, look, body); m.g.add(g); m.partsG = g;
    // underglow: LED tubes along the sills and a soft pool of light on the road
    if (m.glowG) { m.g.remove(m.glowG); m.glowG.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); m.glowG = null; }
    m.neon = look.neon ?? null;
    if (m.neon != null) {
      const G = new THREE.Group(), S = probe(m), Lh = ((S.frontZ - S.backZ) || 4) * 0.36, poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(m.neon).multiplyScalar(1.6), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -20 }); // over any ground layer
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(S.halfW * 3.4, (S.frontZ - S.backZ) * 1.35).rotateX(-Math.PI / 2), poolMat); pool.position.set(0, 0.035, (S.frontZ + S.backZ) / 2); pool.renderOrder = 2; G.add(pool);
      for (const s of [-1, 1]) { const x = (S.side(0.3, 0, s) ?? s * S.halfW) - s * 0.06, tubeL = capsule(0.014, Lh * 2, led(m.neon, 5)); tubeL.rotation.x = Math.PI / 2; tubeL.position.set(x, 0.17, (S.frontZ + S.backZ) / 2); tubeL.castShadow = false; G.add(tubeL); }
      G.traverse(o => { o.userData.tuning = true; }); m.g.add(G); m.glowG = G;
    }
    t.partsKey = lookKey(look); t.rocket = P.rockets ? 1.4 : 1;
  }

  // ---------------------------------------------------------------- what other players need to draw your car
  // one letter a slot or setting (kept short: it rides along with every position update)
  const CODE = { spoiler: 's', roof: 'r', front: 'f', hood: 'h', exhaust: 'e', skirts: 'k', rear: 'b', stance: 't', rims: 'w', livery: 'l', rockets: 'x' };
  const LOOK = { finish: 'F', trim: 'T', glass: 'G', head: 'H', rimStyle: 'R' };
  function lookKey(L = {}) {
    const P = L.parts || {}, o = {}; for (const k in CODE) if (P[k]) o[CODE[k]] = P[k];
    for (const k in LOOK) if (L[k]) o[LOOK[k]] = L[k]; if (L.paint != null) o.c = L.paint; if (L.neon != null) o.n = L.neon;
    return Object.keys(o).length ? JSON.stringify(o).slice(0, 240) : '';
  }
  function lookOf(key) {
    let o = {}; try { o = typeof key === 'string' ? JSON.parse(key || '{}') : key || {}; } catch (e) { }
    if (Object.keys(o).some(k => k in CODE)) return { parts: o }; // from before tuning: just the parts, by name
    const parts = {}; for (const k in CODE) if (o[CODE[k]] != null) parts[k] = o[CODE[k]] | 0;
    const L = { parts, paint: o.c ?? null, neon: o.n ?? null }; for (const k in LOOK) L[k] = o[LOOK[k]] | 0;
    return L;
  }

  // ---------------------------------------------------------------- the one real underglow light (the car you drive)
  const light = new THREE.PointLight(0xffffff, 0, 7, 2); light.castShadow = false;
  function glow(car, night) {
    const m = car && car.m;
    if (!m || m.neon == null || car.dead) { light.intensity = 0; return; }
    light.color.setHex(m.neon); light.intensity = 3 + 9 * night; light.position.set(car.pos.x, car.pos.y + 0.25, car.pos.z);
  }

  return { MODS, COLORS, FINISHES, TRIMS, GLASS, HEADLIGHTS, NEONS, RIM_COLORS, RIM_STYLES, LIVERIES, PARTS, applyPerf, applyLook, lookKey, lookOf, ratings, glow, light, probe };
}
