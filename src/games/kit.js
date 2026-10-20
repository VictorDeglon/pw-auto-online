// Building blocks the crew-garage worlds share: canvas textures, instanced props, the big leaderboard screens and
// tyre tracks that fade away. Everything a world builds goes under its own group, placed at the world's origin, so
// the vertex data stays small numbers (the worlds are 80-120 km out; float32 vertices that far would shimmer).
import { ctx } from '../ctx.js';

export const FONT_D = 'Anton, Impact, sans-serif', FONT_U = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

// a canvas texture: draw(g, w, h). repeat: [u, v] tiles (wraps), or null (clamped)
export function canvasTex(w, h, draw, repeat = null, srgb = true) {
  const { THREE } = ctx, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy()); t.needsUpdate = true;
  return t;
}
export function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
// speckled ground: base colour with noise of a few others (dirt, grass, sand)
export function speckle(g, w, h, base, cols, n, r0 = 0.6, r1 = 2.2, seed = 7) {
  const R = rng(seed); g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { g.globalAlpha = 0.08 + R() * 0.22; g.fillStyle = cols[(R() * cols.length) | 0]; const r = r0 + R() * (r1 - r0); g.beginPath(); g.arc(R() * w, R() * h, r, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
}
export function woodTex(rep) { // planks along u, with grain and gaps
  return canvasTex(512, 512, (g, w, h) => {
    const R = rng(11), n = 8;
    for (let i = 0; i < n; i++) {
      const y = i * h / n, tone = 0.85 + R() * 0.3; g.fillStyle = `rgb(${Math.round(150 * tone)},${Math.round(104 * tone)},${Math.round(62 * tone)})`; g.fillRect(0, y, w, h / n);
      for (let k = 0; k < 26; k++) { g.strokeStyle = `rgba(70,42,20,${0.08 + R() * 0.15})`; g.lineWidth = 1 + R() * 2; g.beginPath(); const yy = y + R() * h / n; g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + R() * 6 - 3, w * 0.7, yy + R() * 6 - 3, w, yy + R() * 4 - 2); g.stroke(); }
      g.fillStyle = 'rgba(40,24,10,.75)'; g.fillRect(0, y, w, 3);
      const cut = R() * w; g.fillRect(cut, y, 3, h / n); // a butt joint
      for (let k = 0; k < 2; k++) { g.fillStyle = 'rgba(60,60,60,.8)'; g.beginPath(); g.arc((cut + 12 + k * w / 2) % w, y + h / n / 2, 3, 0, Math.PI * 2); g.fill(); } // nails
    }
  }, rep);
}
export function concreteTex(rep, tone = '#b9b4aa') { return canvasTex(256, 256, (g, w, h) => { speckle(g, w, h, tone, ['#8d877c', '#d6d1c6', '#a39d92'], 2600, 0.5, 2, 3); g.strokeStyle = 'rgba(60,55,50,.25)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); }, rep); }

// one InstancedMesh of a geometry; items: [{ x, y, z, ry, sx, sy, sz, color }]
export function instanced(geo, mat, items, opts = {}) {
  const { THREE } = ctx, m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length)), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  items.forEach((it, i) => {
    e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ'); q.setFromEuler(e); p.set(it.x, it.y || 0, it.z); s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    m.setMatrixAt(i, M.compose(p, q, s)); if (it.color !== undefined) m.setColorAt(i, c.set(it.color));
  });
  m.count = items.length; m.castShadow = opts.cast ?? true; m.receiveShadow = opts.receive ?? true;
  m.computeBoundingSphere(); return m;
}
// a box geometry with its base at y = 0
export function baseBox(w = 1, h = 1, d = 1) { return new ctx.THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0); }

// collision: a wall (thin rectangle) from a to b, thickness t, in world coordinates; base/top heights
export function wallPoly(ax, az, bx, bz, t, base = -50, top = 60) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L * t / 2, nz = dx / L * t / 2;
  ctx.addPoly([ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz], base, top);
}
export function rectPoly(x, z, hw, hd, ry = 0, base = -50, top = 200) { // a solid box footprint
  const c = Math.cos(ry), s = Math.sin(ry), P = [];
  for (const [u, v] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) P.push(x + u * c + v * s, z - u * s + v * c);
  ctx.addPoly(P, base, top);
}

// ---------------------------------------------------------------- leaderboard screens
// A big self-lit screen with a title and up to ten rows. rows: [{ rank, name, val, sub }] (strings, already formatted)
export function createScreen({ w = 24, h = 13.5, title = '', sub = '', accent = '#f0b23a', px = 1024 }) {
  const { THREE } = ctx, H = Math.round(px * h / w);
  const cv = document.createElement('canvas'); cv.width = px; cv.height = H; const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  let last = { rows: null, note: '' };
  function draw(rows, note, hi) {
    last = { rows, note, hi };
    const gr = g.createLinearGradient(0, 0, px, H); gr.addColorStop(0, '#0b1222'); gr.addColorStop(1, '#1a0d22'); g.fillStyle = gr; g.fillRect(0, 0, px, H);
    g.fillStyle = accent; g.fillRect(0, 0, px, 10); g.fillRect(0, H - 10, px, 10);
    const k = px / 1024; g.textBaseline = 'middle';
    g.fillStyle = accent; g.font = `400 ${62 * k}px ${FONT_D}`; g.textAlign = 'left'; g.fillText(title, 34 * k, 62 * k);
    g.fillStyle = '#9aa3b8'; g.font = `600 ${28 * k}px ${FONT_U}`; g.fillText(sub, 36 * k, 112 * k);
    if (note) { g.textAlign = 'right'; g.fillStyle = '#f3ede1'; g.font = `600 ${30 * k}px ${FONT_U}`; g.fillText(note, px - 34 * k, 62 * k); g.textAlign = 'left'; }
    if (!rows || !rows.length) {
      g.fillStyle = '#f4f1ea'; g.font = `400 ${46 * k}px ${FONT_D}`; g.fillText(rows ? 'NOBODY ON THE BOARD YET' : 'PLAY ONLINE FOR THE BOARD', 36 * k, H * 0.55);
    } else {
      const top = 158 * k, rh = Math.min(46 * k, (H - top - 24 * k) / 10);
      rows.slice(0, 10).forEach((r, i) => {
        const y = top + i * rh + rh / 2, me = hi && r.name === hi, podium = i < 3;
        if (me) { g.fillStyle = 'rgba(240,178,58,.18)'; g.fillRect(20 * k, y - rh / 2 + 2, px - 40 * k, rh - 4); }
        g.fillStyle = podium ? ['#ffd23f', '#d6dde8', '#d79a5a'][i] : '#f4f1ea'; g.font = `400 ${(podium ? 36 : 32) * k}px ${FONT_D}`;
        g.fillText(String(r.rank), 36 * k, y); g.fillText(String(r.name).slice(0, 16).toUpperCase(), 100 * k, y);
        g.textAlign = 'right'; g.fillText(r.val, px - 230 * k, y);
        g.fillStyle = '#9aa3b8'; g.font = `600 ${26 * k}px ${FONT_U}`; g.fillText(r.sub || '', px - 34 * k, y + 2); g.textAlign = 'left';
      });
    }
    tex.needsUpdate = true;
  }
  draw(null, '');
  return { mesh, draw, redraw: () => draw(last.rows, last.note, last.hi) };
}
// a billboard on two legs: the screen faces +z of the returned group
export function screenStand(screen, lift = 3, legs = true) {
  const { THREE } = ctx, g = new THREE.Group(), w = screen.mesh.geometry.parameters.width, h = screen.mesh.geometry.parameters.height;
  const steel = new THREE.MeshStandardMaterial({ color: 0x4d535c, roughness: 0.5, metalness: 0.7 }), back = new THREE.MeshStandardMaterial({ color: 0x15181e, roughness: 0.8 });
  screen.mesh.position.set(0, lift + h / 2, 0.21); g.add(screen.mesh);
  const box = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, h + 0.6, 0.4), back); box.position.set(0, lift + h / 2, 0); box.castShadow = true; g.add(box);
  if (legs) for (const x of [-w * 0.32, w * 0.32]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, lift + 0.5, 0.6), steel); p.position.set(x, (lift + 0.5) / 2, -0.4); p.castShadow = true; g.add(p); }
  return g;
}
// a flat sign with text (distance boards, labels): a plane facing +z
export function textSign(text, { w = 4, h = 1.6, bg = '#f3ede1', fg = '#13161c', font = FONT_D, px = 256, border = null } = {}) {
  const { THREE } = ctx, H = Math.round(px * h / w);
  const t = canvasTex(px, H, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, px, H); if (border) { g.strokeStyle = border; g.lineWidth = px * 0.04; g.strokeRect(0, 0, px, H); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; let fs = H * 0.72; g.font = `400 ${fs}px ${font}`;
    while (g.measureText(text).width > px * 0.88 && fs > 8) { fs *= 0.9; g.font = `400 ${fs}px ${font}`; }
    g.fillText(text, px / 2, H * 0.54);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, side: THREE.DoubleSide }));
}

// ---------------------------------------------------------------- tyre tracks
// Dark marks under the rear wheels of cars on dirt, gone after `life` seconds: one dynamic mesh, a ring of quads.
// Each vertex carries the time it was laid; the shader fades it out.
export function createTracks(group, { max = 6000, life = 15, width = 0.32, color = 0x2a2016, opacity = 0.55 } = {}) {
  const { THREE } = ctx, pos = new Float32Array(max * 4 * 3), born = new Float32Array(max * 4), idx = new Uint32Array(max * 6);
  for (let i = 0; i < max; i++) { const a = i * 4; idx.set([a, a + 1, a + 2, a, a + 2, a + 3], i * 6); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('born', new THREE.BufferAttribute(born, 1).setUsage(THREE.DynamicDrawUsage)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  born.fill(-1e6);
  const U = { uNow: { value: 0 } }, LIFE = life.toFixed(1); // the lifetime is baked into the shader: a second uniform didn't reach the program
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true }); // double-sided: the quad's winding follows the way the car was going
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute float born;\nuniform float uNow;\nvarying float vFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n vFade = clamp(1.0 - (uNow - born) / ${LIFE}, 0.0, 1.0);`);
    sh.fragmentShader = 'varying float vFade;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.a *= vFade;');
  };
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; group.add(mesh);
  let head = 0, dirty0 = max, dirty1 = -1, now = 0;
  const wheels = new Map(); // key -> last point per wheel
  // one wheel at (x, z) local, ground y, travel direction; call every frame for each wheel touching the dirt
  function mark(key, x, y, z) {
    const L = wheels.get(key);
    if (!L || now - L.t > 0.25) { wheels.set(key, { x, y, z, t: now }); return; }
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz); if (d < 0.6) return;
    if (d > 6) { wheels.set(key, { x, y, z, t: now }); return; }
    const nx = -dz / d * width, nz = dx / d * width, i = head, a = i * 12;
    pos.set([L.x + nx, L.y + 0.04, L.z + nz, L.x - nx, L.y + 0.04, L.z - nz, x - nx, y + 0.04, z - nz, x + nx, y + 0.04, z + nz], a);
    born.fill(now, i * 4, i * 4 + 4);
    dirty0 = Math.min(dirty0, i); dirty1 = Math.max(dirty1, i);
    head = (head + 1) % max; L.x = x; L.y = y; L.z = z; L.t = now;
  }
  function update(t) {
    now = t; U.uNow.value = t;
    if (dirty1 >= dirty0) {
      const P = geo.attributes.position, B = geo.attributes.born;
      P.clearUpdateRanges(); B.clearUpdateRanges();
      P.addUpdateRange(dirty0 * 12, (dirty1 - dirty0 + 1) * 12); B.addUpdateRange(dirty0 * 4, (dirty1 - dirty0 + 1) * 4);
      P.needsUpdate = true; B.needsUpdate = true; dirty0 = max; dirty1 = -1;
    }
  }
  // a car's two rear wheels: pose in local coords
  function car(key, x, y, z, rot, W = 1.9, L = 4.6) {
    const fx = Math.sin(rot), fz = Math.cos(rot), rx = fz, rz = -fx, bx = x - fx * L * 0.33, bz = z - fz * L * 0.33;
    mark(key + 'l', bx + rx * W * 0.42, y, bz + rz * W * 0.42); mark(key + 'r', bx - rx * W * 0.42, y, bz - rz * W * 0.42);
  }
  return { mesh, mark, car, update, clear: () => { born.fill(-1e6); geo.attributes.born.needsUpdate = true; wheels.clear(); } };
}
