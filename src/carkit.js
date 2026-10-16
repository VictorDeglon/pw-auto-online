// TODO(build): carkit progress (run 4). DONE: helpers/env/materials/loft/wheels/lamps/assemble/build()/showroom page. NOW: verify sedan loft in showroom, then parts(), other specs, police tex, tuning rounds.
// Procedural car models for Poway Automobile Online. No assets: every body is lofted from side-profile / plan / section curves.
// Conventions: forward = +z, left = +x (right-hand side of travel is -x), y up, metres; origin on the ground under the car centre.
//   const kit = createCarKit(THREE, { renderer, BGU });
//   const m = kit.build('sedan', kit.paint());   // -> { g, body, wheels, bars, mats, lights, L, W, wr, dispose }
//   m.lights.update({ brake, ind, hazard, head, reverse, t });
export function createCarKit(THREE, { renderer = null, BGU = null } = {}) {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rand = (a, b) => a + Math.random() * (b - a), pick = a => a[(Math.random() * a.length) | 0];
  const D2R = Math.PI / 180;
  const col = h => new THREE.Color(h);

  // monotone cubic through [[x, y], ...] (no overshoot); clamps outside the range
  function curve(pts) {
    const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), m = new Array(n).fill(0), d = [];
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return x => {
      if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }

  // ---------------------------------------------------------------- environment map (car materials only)
  let envTex = null;
  if (renderer) {
    const es = new THREE.Scene();
    const em = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `varying vec3 vD;
      float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
      void main(){
        vec3 d = normalize(vD); float y = d.y, a = atan(d.z, d.x);
        vec3 sky = mix(vec3(.86, .9, .95), vec3(.22, .42, .78), pow(max(y, 0.), .55));
        float c = smoothstep(.55, .9, sin(a * 3. + 1.3) * sin(y * 9. + a) * .5 + .5) * smoothstep(.05, .25, y) * (1. - smoothstep(.5, .8, y));
        sky = mix(sky, vec3(1.), c * .55);
        float bi = floor(a * 7.), bh = h1(bi) * .09 * step(.35, h1(bi + 7.)), th = (.025 + .03 * h1(floor(a * 40.))) * step(.3, h1(floor(a * 13.) + 3.));
        float sil = max(bh, th);
        vec3 g = mix(vec3(.34, .32, .3), vec3(.13, .125, .12), clamp(-y * 2.5, 0., 1.));
        vec3 col = y > sil ? sky : (y > 0. ? mix(vec3(.16, .17, .14), vec3(.25, .25, .24), step(th, bh)) : g);
        col += vec3(1., .96, .88) * 5. * pow(max(dot(d, normalize(vec3(.3, .85, .4))), 0.), 300.);
        gl_FragColor = vec4(col, 1.);
      }`,
    });
    es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), em));
    const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(es, 0.012).texture; pm.dispose(); em.dispose();
  }
  let envK = 1; const envMats = new Set();
  function envd(m, k = 1) { m.userData.envK = k; if (envTex) { m.envMap = envTex; m.envMapIntensity = k * envK; } envMats.add(m); return m; }

  // ---------------------------------------------------------------- shared finishes: vertex colour = albedo, uv picks (roughness, metalness)
  const FIN = { plastic: [0.72, 0], gloss: [0.14, 0.05], chrome: [0.07, 1], metal: [0.3, 1], satin: [0.42, 0.75], rubber: [0.9, 0], tread: [0.97, 0], under: [1, 0], seat: [0.85, 0], mirror: [0.03, 1], paint: [0.3, 0.3] };
  const FIN_I = {}; Object.keys(FIN).forEach((k, i) => FIN_I[k] = i);
  const NF = 16, ormData = new Uint8Array(NF * 4);
  Object.keys(FIN).forEach((k, i) => { ormData.set([255, FIN[k][0] * 255, FIN[k][1] * 255, 255], i * 4); });
  const ormTex = new THREE.DataTexture(ormData, NF, 1); ormTex.needsUpdate = true;
  ormTex.magFilter = ormTex.minFilter = THREE.NearestFilter;
  const finUV = f => [(FIN_I[f] + 0.5) / NF, 0.5];
  const detailMat = envd(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, roughnessMap: ormTex, metalnessMap: ormTex }), 1);
  const glassMat = envd(new THREE.MeshPhysicalMaterial({ color: 0x1a2127, vertexColors: true, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.78, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: true }), 1.2);
  glassMat.polygonOffset = true; glassMat.polygonOffsetFactor = -1; glassMat.polygonOffsetUnits = -1;
  const wreckMat = new THREE.MeshStandardMaterial({ color: 0x1d1b1a, roughness: 1 });

  // ---------------------------------------------------------------- paints (US popularity; weights sum ~100)
  const PAINTS = [
    [0xf4f4f1, 15, 0], [0xe9e7e0, 10, 0.3], // solid white, pearl white
    [0x0d0e10, 11, 0.1], [0x15171b, 9, 0.6], // black, black metallic
    [0x5d6166, 7, 0.6], [0x3c3f44, 6, 0.65], [0x8c9094, 5, 0.25], // gunmetal, charcoal, cement gray
    [0xb4b8bc, 11, 0.75], // silver
    [0x1b2c4e, 4, 0.6], [0x2f5d9a, 3, 0.6], [0x6f8fae, 2, 0.3], // navy, mid blue, slate blue
    [0x9e1a1a, 5, 0.25], [0x5e1218, 3, 0.6], // red, dark red metallic
    [0x2c3b2c, 1.5, 0.5], [0x6d7a62, 1, 0.2], // dark green, sage
    [0x4a3428, 1.2, 0.55], [0x7a5a3a, 0.8, 0.6], // brown, bronze
    [0xc9b99a, 1.5, 0.3], [0xb59a52, 1, 0.7], [0xd0611f, 1, 0.3], [0xe3b51c, 0.5, 0.1], // beige, gold, orange, yellow
  ];
  const paintW = PAINTS.reduce((s, p) => s + p[1], 0);
  function paint() { let r = Math.random() * paintW; for (const p of PAINTS) { if ((r -= p[1]) <= 0) return p[0]; } return PAINTS[0][0]; }
  function paintFinish(hex, finish) {
    const p = PAINTS.find(q => q[0] === hex), met = finish === 'gloss' ? 0.05 : finish === 'metallic' || finish === 'pearl' ? 0.6 : finish === 'chrome' ? 1 : p ? p[2] : 0.45;
    return { metalness: met, roughness: finish === 'matte' ? 0.75 : finish === 'chrome' ? 0.05 : lerp(0.42, 0.3, met), clearcoat: finish === 'matte' ? 0 : 1, clearcoatRoughness: 0.05 };
  }

  // ---------------------------------------------------------------- geometry accumulator (one per material bucket)
  // attr: { c: Color (albedo), uv: [u, v] (finish / atlas), ch: [chA, chB] (light channels), em: [r, g, b] (emissive) }
  const CH_OFF = 7;
  class Acc {
    constructor(kind) { this.kind = kind; this.p = []; this.n = []; this.c = []; this.uv = []; this.ch = []; this.em = []; this.ix = []; }
    get count() { return this.p.length / 3; }
    v(x, y, z, nx, ny, nz, a, uv) {
      this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(a.c.r, a.c.g, a.c.b); const u = uv || a.uv; this.uv.push(u[0], u[1]);
      if (this.kind === 'light') { const ch = a.ch || [CH_OFF, CH_OFF], em = a.em || [0, 0, 0]; this.ch.push(ch[0], ch[1]); this.em.push(em[0], em[1], em[2]); }
      return this.count - 1;
    }
    tri(a, b, c) { this.ix.push(a, b, c); }
    // duplicate vertices/indices from (v0, i0) mirrored across x = 0; chSwap maps light channels (left <-> right indicator)
    mirror(v0, i0, chSwap) {
      const off = this.count - v0, vn = this.count;
      for (let k = v0; k < vn; k++) {
        this.p.push(-this.p[k * 3], this.p[k * 3 + 1], this.p[k * 3 + 2]); this.n.push(-this.n[k * 3], this.n[k * 3 + 1], this.n[k * 3 + 2]);
        this.c.push(this.c[k * 3], this.c[k * 3 + 1], this.c[k * 3 + 2]); this.uv.push(this.uv[k * 2], this.uv[k * 2 + 1]);
        if (this.kind === 'light') { const s = c => (chSwap && chSwap[c] !== undefined ? chSwap[c] : c); this.ch.push(s(this.ch[k * 2]), s(this.ch[k * 2 + 1])); this.em.push(this.em[k * 3], this.em[k * 3 + 1], this.em[k * 3 + 2]); }
      }
      const ie = this.ix.length; for (let k = i0; k < ie; k += 3) this.ix.push(this.ix[k] + off, this.ix[k + 2] + off, this.ix[k + 1] + off);
    }
    mark() { return [this.count, this.ix.length]; }
    geo() {
      if (!this.ix.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      if (this.kind === 'light') { g.setAttribute('lch', new THREE.Float32BufferAttribute(this.ch, 2)); g.setAttribute('lem', new THREE.Float32BufferAttribute(this.em, 3)); }
      g.setIndex(this.ix); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
    }
  }
  const _m3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
  // append any BufferGeometry, transformed by Matrix4 mx
  function addGeo(acc, geo, mx, a) {
    const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv, base = acc.count; _m3.getNormalMatrix(mx);
    const flip = mx.determinant() < 0;
    for (let k = 0; k < P.count; k++) {
      _v.fromBufferAttribute(P, k).applyMatrix4(mx); _n.fromBufferAttribute(N, k).applyMatrix3(_m3).normalize();
      acc.v(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, a, a.uvFn ? a.uvFn(UV ? UV.getX(k) : 0, UV ? UV.getY(k) : 0) : null);
    }
    const ix = geo.index ? geo.index.array : [...Array(P.count).keys()];
    for (let k = 0; k < ix.length; k += 3) flip ? acc.tri(base + ix[k], base + ix[k + 2], base + ix[k + 1]) : acc.tri(base + ix[k], base + ix[k + 1], base + ix[k + 2]);
  }
  const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  const M4 = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
  const GEO = {}; // cached unit primitives
  const prim = (k, f) => GEO[k] || (GEO[k] = f());
  const box = (acc, a, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => addGeo(acc, prim('box', () => new THREE.BoxGeometry(1, 1, 1)), M4(x, y, z, sx, sy, sz, rx, ry, rz), a);
  const rbox = (acc, a, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => addGeo(acc, prim('rbox', () => roundedBox(0.2, 1)), M4(x, y, z, sx, sy, sz, rx, ry, rz), a);
  const cyl = (acc, a, x, y, z, r, h, rx = 0, ry = 0, rz = 0, seg = 12) => addGeo(acc, prim('cyl' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1)), M4(x, y, z, r, h, r, rx, ry, rz), a);
  const sph = (acc, a, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => addGeo(acc, prim('sph', () => new THREE.SphereGeometry(1, 14, 8)), M4(x, y, z, sx, sy, sz, rx, ry, rz), a);
  // unit cube (-.5..5) with rounded edges: superellipsoid-ish via normalised cube sphere blend
  function roundedBox(r, seg) {
    const g = new THREE.BoxGeometry(1, 1, 1, seg * 2 + 1, seg * 2 + 1, seg * 2 + 1), P = g.attributes.position, h = 0.5 - r;
    for (let k = 0; k < P.count; k++) {
      const x = P.getX(k), y = P.getY(k), z = P.getZ(k), cx = clamp(x, -h, h), cy = clamp(y, -h, h), cz = clamp(z, -h, h);
      _v.set(x - cx, y - cy, z - cz); if (_v.lengthSq() > 1e-9) _v.setLength(r); P.setXYZ(k, cx + _v.x, cy + _v.y, cz + _v.z);
    }
    if (!BGU) { g.computeVertexNormals(); return g; }
    g.deleteAttribute('normal'); g.deleteAttribute('uv'); const m = BGU.mergeVertices(g); m.computeVertexNormals(); return m;
  }
  const ATT = (hex, fin) => ({ c: col(hex), uv: finUV(fin) });
  // ---------------------------------------------------------------- loft
  // A section is a rounded polyline ctrl = [[x, y, cut], ...] (half section, x >= 0). Pieces alternate straight / corner:
  // piece 2j = straight edge j, piece 2i-1 = corner at vertex i (quadratic bezier between the cut points).
  // plan[p] = sample fractions of piece p; every sample carries t = p + f so material bands can be addressed per piece.
  function sampleSec(ctrl, plan, out) {
    const k = ctrl.length - 1, A = [], B = [];
    for (let i = 1; i < k; i++) {
      const [x0, y0] = ctrl[i - 1], [x1, y1, c] = ctrl[i], [x2, y2] = ctrl[i + 1];
      const ein = Math.hypot(x0 - x1, y0 - y1) || 1e-6, eout = Math.hypot(x2 - x1, y2 - y1) || 1e-6, cc = Math.min(c || 0, ein * 0.5, eout * 0.5);
      A[i] = [x1 + (x0 - x1) / ein * cc, y1 + (y0 - y1) / ein * cc]; B[i] = [x1 + (x2 - x1) / eout * cc, y1 + (y2 - y1) / eout * cc];
    }
    out.length = 0;
    for (let p = 0; p < 2 * k - 1; p++) {
      const fr = plan[p];
      if (p % 2 === 0) {
        const j = p / 2, s = j === 0 ? ctrl[0] : B[j], e = j + 1 === k ? ctrl[k] : A[j + 1];
        for (const f of fr) out.push([lerp(s[0], e[0], f), lerp(s[1], e[1], f), p + f]);
      } else {
        const i = (p + 1) / 2, a = A[i], v = ctrl[i], b = B[i];
        for (const f of fr) { const u = 1 - f; out.push([u * u * a[0] + 2 * u * f * v[0] + f * f * b[0], u * u * a[1] + 2 * u * f * v[1] + f * f * b[1], p + f]); }
      }
    }
    out.push([ctrl[k][0], ctrl[k][1], 2 * k - 1]);
    return out;
  }
  const fr = n => [...Array(n).keys()].map(i => i / n); // n uniform samples in [0,1)

  // Loft along z. zs sorted rear -> front. sec(z) -> ctrl. Ring = mirrored half (x < 0) bottom..top, then half (x > 0) top..bottom.
  // mat(q) gets { z, t, x, y, i, j } at the quad centre and returns { acc, a, off } or null (skip).
  function loft(zs, sec, plan, mat, warp) {
    const S = zs.length, half = [], P = [], T = [];
    let M = 0;
    for (let i = 0; i < S; i++) {
      sampleSec(sec(zs[i]), plan, half); const N = half.length; M = 2 * N - 1;
      const row = new Float32Array(M * 3);
      for (let j = 0; j < M; j++) {
        const h = j < N ? half[j] : half[2 * N - 2 - j], sx = j < N ? -1 : 1;
        _v.set(h[0] * sx, h[1], zs[i]); if (warp) warp(_v);
        row[j * 3] = _v.x; row[j * 3 + 1] = _v.y; row[j * 3 + 2] = _v.z; if (i === 0) T[j] = h[2];
      }
      P.push(row);
    }
    // smooth normals, welded by position (handles collapsed tips and the closed seam)
    const Nr = P.map(() => new Float32Array(M * 3)), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), fn = new THREE.Vector3();
    const at = (i, j, o) => o.set(P[i][j * 3], P[i][j * 3 + 1], P[i][j * 3 + 2]);
    for (let i = 0; i < S - 1; i++) for (let j = 0; j < M - 1; j++) {
      at(i, j, a); at(i, j + 1, b); at(i + 1, j + 1, c); at(i + 1, j, d);
      fn.subVectors(c, a).cross(_n.subVectors(d, b)); // quad normal (diagonals), magnitude ~ 2*area
      for (const [ii, jj] of [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]]) { const o = Nr[ii]; o[jj * 3] += fn.x; o[jj * 3 + 1] += fn.y; o[jj * 3 + 2] += fn.z; }
    }
    const weld = new Map(), key = (i, j) => `${Math.round(P[i][j * 3] * 2e3)},${Math.round(P[i][j * 3 + 1] * 2e3)},${Math.round(P[i][j * 3 + 2] * 2e3)}`;
    for (let i = 0; i < S; i++) for (let j = 0; j < M; j++) { const k = key(i, j), w = weld.get(k); if (w) { w[0] += Nr[i][j * 3]; w[1] += Nr[i][j * 3 + 1]; w[2] += Nr[i][j * 3 + 2]; } else weld.set(k, [Nr[i][j * 3], Nr[i][j * 3 + 1], Nr[i][j * 3 + 2]]); }
    const mid = S >> 1, top = (M - 1) >> 1, wt = weld.get(key(mid, top)), flip = wt[1] < 0 ? -1 : 1;
    for (let i = 0; i < S; i++) for (let j = 0; j < M; j++) { const w = weld.get(key(i, j)), l = Math.hypot(w[0], w[1], w[2]) * flip || 1; Nr[i][j * 3] = w[0] / l; Nr[i][j * 3 + 1] = w[1] / l; Nr[i][j * 3 + 2] = w[2] / l; }
    // emit quads into buckets
    const vmap = new Map(), q = {};
    const vert = (r, i, j) => {
      let m = vmap.get(r); if (!m) vmap.set(r, m = new Map()); const k = i * M + j; let v = m.get(k);
      if (v === undefined) { const p = P[i], n = Nr[i], o = r.off || 0; v = r.acc.v(p[j * 3] + n[j * 3] * o, p[j * 3 + 1] + n[j * 3 + 1] * o, p[j * 3 + 2] + n[j * 3 + 2] * o, n[j * 3], n[j * 3 + 1], n[j * 3 + 2], r.a, r.uv && r.uv(i, j)); m.set(k, v); }
      return v;
    };
    for (let i = 0; i < S - 1; i++) for (let j = 0; j < M - 1; j++) {
      q.i = i; q.j = j; q.z = (zs[i] + zs[i + 1]) / 2; q.t = (T[j] + T[j + 1]) / 2; q.side = j < (M - 1) / 2 ? -1 : 1;
      q.x = (P[i][j * 3] + P[i + 1][j * 3 + 3]) / 2; q.y = (P[i][j * 3 + 1] + P[i + 1][j * 3 + 4]) / 2; q.zw = (P[i][j * 3 + 2] + P[i + 1][j * 3 + 5]) / 2;
      const r = mat(q); if (!r) continue;
      const v0 = vert(r, i, j), v1 = vert(r, i, j + 1), v2 = vert(r, i + 1, j + 1), v3 = vert(r, i + 1, j);
      if (flip > 0) { r.acc.tri(v0, v1, v2); r.acc.tri(v0, v2, v3); } else { r.acc.tri(v0, v2, v1); r.acc.tri(v0, v3, v2); }
    }
    return { P, Nr, S, M, T, zs, flip };
  }
  // station list: uniform spacing plus extra knots (each knot also gets close neighbours when `pair` > 0)
  function stations(z0, z1, step, knots, dense) {
    const s = new Set(); const n = Math.ceil((z1 - z0) / step);
    for (let i = 0; i <= n; i++) s.add(+(z0 + (z1 - z0) * i / n).toFixed(4));
    for (const k of knots) if (k >= z0 && k <= z1) s.add(+k.toFixed(4));
    for (const [a, b, st] of dense || []) { const m = Math.ceil((b - a) / st); for (let i = 0; i <= m; i++) { const z = a + (b - a) * i / m; if (z >= z0 && z <= z1) s.add(+z.toFixed(4)); } }
    const out = [...s].sort((p, q) => p - q), res = [];
    for (const z of out) if (!res.length || z - res[res.length - 1] > 0.0015) res.push(z);
    return res;
  }
  // ---------------------------------------------------------------- projection onto lofted surfaces + conforming patches
  const BIN = 0.05;
  class Surf {
    constructor() { this.p = []; this.n = []; }
    add(L, filt) {
      const { P, Nr, S, M } = L;
      const put = (i, j) => { this.p.push(P[i][j * 3], P[i][j * 3 + 1], P[i][j * 3 + 2]); this.n.push(Nr[i][j * 3], Nr[i][j * 3 + 1], Nr[i][j * 3 + 2]); };
      for (let i = 0; i < S - 1; i++) for (let j = 0; j < M - 1; j++) {
        if (filt && !filt(i, j)) continue;
        put(i, j); put(i, j + 1); put(i + 1, j + 1); put(i, j); put(i + 1, j + 1); put(i + 1, j);
      }
      this.bins = null; return this;
    }
    index() {
      this.bins = new Map(); const p = this.p;
      for (let t = 0; t < p.length / 9; t++) {
        const y0 = Math.min(p[t * 9 + 1], p[t * 9 + 4], p[t * 9 + 7]), y1 = Math.max(p[t * 9 + 1], p[t * 9 + 4], p[t * 9 + 7]);
        for (let b = Math.floor(y0 / BIN); b <= Math.floor(y1 / BIN); b++) { let l = this.bins.get(b); if (!l) this.bins.set(b, l = []); l.push(t); }
      }
    }
    // nearest hit along the ray (two-sided). returns { p: Vector3, n: Vector3, t } or null
    ray(ox, oy, oz, dx, dy, dz, tmax = 5) {
      if (!this.bins) this.index();
      const p = this.p, ya = Math.min(oy, oy + dy * tmax), yb = Math.max(oy, oy + dy * tmax), seen = new Set();
      let best = null, bt = tmax, bu = 0, bv = 0;
      for (let b = Math.floor(ya / BIN); b <= Math.floor(yb / BIN); b++) {
        const l = this.bins.get(b); if (!l) continue;
        for (const t of l) {
          if (seen.has(t)) continue; seen.add(t); const o = t * 9;
          const e1x = p[o + 3] - p[o], e1y = p[o + 4] - p[o + 1], e1z = p[o + 5] - p[o + 2], e2x = p[o + 6] - p[o], e2y = p[o + 7] - p[o + 1], e2z = p[o + 8] - p[o + 2];
          const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x, det = e1x * hx + e1y * hy + e1z * hz;
          if (Math.abs(det) < 1e-12) continue; const inv = 1 / det, sx = ox - p[o], sy = oy - p[o + 1], sz = oz - p[o + 2];
          const u = (sx * hx + sy * hy + sz * hz) * inv; if (u < 0 || u > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (dx * qx + dy * qy + dz * qz) * inv;
          if (v < 0 || u + v > 1) continue; const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (tt > 1e-4 && tt < bt) { bt = tt; best = t; bu = u; bv = v; }
        }
      }
      if (best === null) return null;
      const o = best * 9, n = this.n, w = 1 - bu - bv;
      const N = new THREE.Vector3(n[o] * w + n[o + 3] * bu + n[o + 6] * bv, n[o + 1] * w + n[o + 4] * bu + n[o + 7] * bv, n[o + 2] * w + n[o + 5] * bu + n[o + 8] * bv).normalize();
      if (N.x * dx + N.y * dy + N.z * dz > 0) N.negate();
      return { p: new THREE.Vector3(ox + dx * bt, oy + dy * bt, oz + dz * bt), n: N, t: bt };
    }
  }
  // ray generators (all return [ox, oy, oz, dx, dy, dz])
  const R0 = 4;
  const rayFront = (zc, phi, y) => [Math.sin(phi) * R0, y, zc + Math.cos(phi) * R0, -Math.sin(phi), 0, -Math.cos(phi)]; // phi from +z towards +x
  const rayRear = (zc, phi, y) => [Math.sin(phi) * R0, y, zc - Math.cos(phi) * R0, -Math.sin(phi), 0, Math.cos(phi)];
  const raySide = (z, y) => [R0, y, z, -1, 0, 0];
  const rayTop = (x, z) => [x, R0, z, 0, -1, 0];
  // grid patch: rf(u, v) -> ray; vertices at the hit + normal * off. uvf(u, v) optional per-vertex uv. Returns hit grid.
  function patch(acc, surf, a, nu, nv, rf, off = 0.003, uvf) {
    const H = [];
    for (let iv = 0; iv <= nv; iv++) for (let iu = 0; iu <= nu; iu++) { const u = iu / nu, v = iv / nv, h = surf.ray(...rf(u, v)); H.push(h ? { h, u, v } : null); }
    const id = new Array(H.length);
    for (let k = 0; k < H.length; k++) { const e = H[k]; if (!e) continue; const { p, n } = e.h; id[k] = acc.v(p.x + n.x * off, p.y + n.y * off, p.z + n.z * off, n.x, n.y, n.z, a, uvf && uvf(e.u, e.v)); }
    const W = nu + 1;
    for (let iv = 0; iv < nv; iv++) for (let iu = 0; iu < nu; iu++) {
      const k = iv * W + iu, q = [k, k + 1, k + W + 1, k + W]; if (q.some(x => id[x] === undefined)) continue;
      // orient so the face normal agrees with the surface normal
      const A = H[q[0]].h.p, B = H[q[1]].h.p, C = H[q[2]].h.p, nn = H[q[0]].h.n;
      const s = _v.subVectors(B, A).cross(_n.subVectors(C, A)).dot(nn) >= 0;
      if (s) { acc.tri(id[q[0]], id[q[1]], id[q[2]]); acc.tri(id[q[0]], id[q[2]], id[q[3]]); } else { acc.tri(id[q[0]], id[q[2]], id[q[1]]); acc.tri(id[q[0]], id[q[3]], id[q[2]]); }
    }
    return H;
  }
  // a raised strip (ribbon) following hit points: front face + two side walls, depth dp outward. pts: [{p, n}], width along `up`
  function ribbon(acc, a, pts, up, w, dp) {
    const base = acc.count, n = pts.length;
    for (const { p, n: nn } of pts) {
      for (const [s, d] of [[-1, 0], [-1, dp], [1, dp], [1, 0]]) {
        const ox = up.x * s * w / 2 + nn.x * d, oy = up.y * s * w / 2 + nn.y * d, oz = up.z * s * w / 2 + nn.z * d;
        const fx = d === 0 ? up.x * s : nn.x, fy = d === 0 ? up.y * s : nn.y, fz = d === 0 ? up.z * s : nn.z;
        acc.v(p.x + ox, p.y + oy, p.z + oz, fx * 0.6 + nn.x * 0.4, fy * 0.6 + nn.y * 0.4, fz * 0.6 + nn.z * 0.4, a);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < 3; k++) {
      const a0 = base + i * 4 + k, a1 = a0 + 1, b0 = a0 + 4, b1 = a1 + 4; acc.tri(a0, b0, b1); acc.tri(a0, b1, a1);
    }
  }
  // ---------------------------------------------------------------- wheels (built facing +x = outboard on the car's left side)
  const RIMS = { silver: [0xc3c6ca, 'metal'], dark: [0x34373b, 'satin'], black: [0x121314, 'gloss'], chrome: [0xe4e4e4, 'chrome'], steelBlack: [0x18191a, 'satin'], steelSilver: [0x9ea2a6, 'satin'], white: [0xe8e8e6, 'gloss'] };
  function roundPoly(pts, c) {
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const ca = Math.min(c, la * 0.4), cb = Math.min(c, lb * 0.4);
      const A = [p[0] + (a[0] - p[0]) / la * ca, p[1] + (a[1] - p[1]) / la * ca], B = [p[0] + (b[0] - p[0]) / lb * cb, p[1] + (b[1] - p[1]) / lb * cb];
      out.push(A, [(A[0] + 2 * p[0] + B[0]) / 4, (A[1] + 2 * p[1] + B[1]) / 4], B);
    }
    return out;
  }
  const arcPts = (R, a0, a1, n) => [...Array(n + 1).keys()].map(i => { const a = lerp(a0, a1, i / n); return [Math.cos(a) * R, Math.sin(a) * R]; });
  // spoke windows between consecutive spoke centre-lines (angles), spokes of linear width sw, from hub radius rh to ring radius ro
  function spokeWindows(angles, sw, rh, ro) {
    const holes = [], n = angles.length;
    for (let i = 0; i < n; i++) {
      const t0 = angles[i], t1 = i + 1 < n ? angles[i + 1] : angles[0] + Math.PI * 2, s = sw / 2;
      const o0 = t0 + Math.asin(s / ro), o1 = t1 - Math.asin(s / ro), h0 = t0 + Math.asin(Math.min(0.99, s / rh)), h1 = t1 - Math.asin(Math.min(0.99, s / rh));
      if (o1 - o0 < 0.05) continue;
      const pts = [...arcPts(ro, o0, o1, Math.max(2, Math.round((o1 - o0) * 5)))];
      if (h1 > h0) pts.push(...arcPts(rh, h1, h0, Math.max(1, Math.round((h1 - h0) * 3)))); else { const m = (t0 + t1) / 2, r = s / Math.sin((t1 - t0) / 2); pts.push([Math.cos(m) * r, Math.sin(m) * r]); }
      holes.push(roundPoly(pts, sw * 0.35));
    }
    return holes;
  }
  function wheelGeo(w) {
    const acc = new Acc('detail'), { r, rim, tw } = w, sh = r - rim, seg = 26;
    const tireC = col(0x1c1c1d), lathe = (pts, a, s = seg) => { const g = new THREE.LatheGeometry(pts.map(([rr, ax]) => new THREE.Vector2(rr, ax)), s); addGeo(acc, g, M4(0, 0, 0, 1, 1, 1, 0, 0, -Math.PI / 2), a); g.dispose(); };
    const T = tw / 2, ws = w.wall ?? 1;
    // tire: profile from outboard bead around the tread to the inboard bead (sidewall bulge ws, rounded shoulders)
    const prof = [[rim + 0.004, T * 0.8], [rim + sh * 0.35, T * (0.94 + 0.04 * ws)], [rim + sh * 0.72, T], [r - 0.016, T * 0.93], [r - 0.003, T * 0.8], [r, T * 0.55],
      [r, -T * 0.55], [r - 0.003, -T * 0.8], [r - 0.016, -T * 0.93], [rim + sh * 0.6, -T], [rim + 0.004, -T * 0.8]].reverse();
    lathe(prof, { c: tireC, uv: finUV('rubber'), uvFn: (u, v) => finUV(v > 0.3 && v < 0.7 ? 'tread' : 'rubber') }, 24);
    const [rc, rf] = RIMS[w.rimCol || 'silver'], rimA = ATT(rc, rf);
    // rim lip + barrel
    lathe([[rim + 0.014, T * 0.78], [rim + 0.008, T * 0.88], [rim - 0.01, T * 0.82], [rim - 0.016, T * 0.62]].reverse(), rimA, 24);
    lathe([[rim - 0.016, T * 0.62], [rim - 0.02, -T * 0.7], [rim + 0.004, -T * 0.82]].reverse(), ATT(0x3a3b3d, 'satin'), 16);
    // face
    const Rf = rim - 0.012, st = w.style || 'five', shape = new THREE.Shape(arcPts(Rf, 0, Math.PI * 2, 32).slice(0, 32).map(p => new THREE.Vector2(p[0], p[1])));
    let holes, dish = w.dish ?? 0.035, depth = 0.022, ofs = T * 0.55;
    const spokes = n => [...Array(n).keys()].map(i => Math.PI / 2 + i * Math.PI * 2 / n);
    if (st === 'five') holes = spokeWindows(spokes(5), Rf * 0.2, Rf * 0.36, Rf * 0.86);
    else if (st === 'six') holes = spokeWindows(spokes(6), Rf * 0.17, Rf * 0.36, Rf * 0.86);
    else if (st === 'twin') holes = spokeWindows(spokes(5).flatMap(a => [a - 0.12, a + 0.12]), Rf * 0.085, Rf * 0.34, Rf * 0.88);
    else if (st === 'multi') holes = spokeWindows(spokes(10), Rf * 0.075, Rf * 0.34, Rf * 0.88);
    else if (st === 'truck') holes = spokeWindows(spokes(6), Rf * 0.26, Rf * 0.42, Rf * 0.8);
    else { // stamped steel: vent holes
      holes = spokes(8).map(a => arcPts(Rf * 0.09, 0, Math.PI * 2, 10).slice(0, 10).map(([x, y]) => [x + Math.cos(a + 0.39) * Rf * 0.62, y + Math.sin(a + 0.39) * Rf * 0.62]));
      dish = 0.045; depth = 0.006;
    }
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));
    const fg = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 3 });
    const FP = fg.attributes.position;
    for (let k = 0; k < FP.count; k++) { const x = FP.getX(k), y = FP.getY(k), rr = Math.hypot(x, y) / Rf; FP.setZ(k, FP.getZ(k) + dish * Math.pow(rr, 1.6) - dish); }
    fg.computeVertexNormals();
    addGeo(acc, fg, M4(ofs, 0, 0, 1, 1, 1, 0, Math.PI / 2, 0), rimA); fg.dispose();
    // brake disc, hub, lug nuts, centre cap
    cyl(acc, ATT(0x77797c, 'metal'), ofs - 0.07, 0, 0, rim * 0.72, 0.024, 0, 0, Math.PI / 2, 16);
    cyl(acc, rimA, ofs + 0.012, 0, 0, Rf * 0.3, 0.02, 0, 0, Math.PI / 2, 16);
    const nl = st === 'truck' ? 6 : 5;
    for (let i = 0; i < nl; i++) { const a = i * Math.PI * 2 / nl; cyl(acc, ATT(0xd0d0d0, 'chrome'), ofs + 0.024, Math.cos(a) * Rf * 0.2, Math.sin(a) * Rf * 0.2, 0.011, 0.02, 0, 0, Math.PI / 2, 6); }
    cyl(acc, st === 'steel' ? ATT(0xb8babd, 'chrome') : ATT(0x1a1b1c, 'gloss'), ofs + 0.028, 0, 0, Rf * 0.12, 0.012, 0, 0, Math.PI / 2, 14);
    return acc.geo();
  }
  // ---------------------------------------------------------------- lamps + plates
  // light channels (uniform uL[8], set by lights.update): 0 head, 1 tail+brake, 2 brake only, 3 ind left, 4 ind right, 5 reverse, 6 DRL, 7 park
  // a light vertex has two channels (max is taken); lch.y >= 10 marks a plate texel (samples the plate atlas, lit by channel 7)
  const EM = { head: [5.5, 5.3, 4.8], drl: [4.5, 4.6, 4.8], red: [7, 0.18, 0.1], amber: [7, 2.6, 0.1], white: [4.5, 4.5, 4.5], plate: [0.55, 0.55, 0.55] };
  const LA = (base, ch, em) => ({ c: col(base), uv: [0.5, 0.5], ch, em });
  const LAMP = {
    head: LA(0xc9ccd0, [0, 0], EM.head), drl: LA(0xe0e0e0, [6, 6], EM.drl), indL: LA(0xc8a46a, [3, 3], EM.amber),
    tail: LA(0x5c0a0c, [1, 1], EM.red), brake: LA(0x5c0a0c, [2, 2], EM.red), tailIndL: LA(0x5c0a0c, [1, 3], EM.red), rev: LA(0xd6d6d6, [5, 5], EM.white),
    rIndL: LA(0xa86b2a, [3, 3], EM.amber), markA: LA(0xb07a2e, [7, 7], [3, 1.1, 0.05]), markR: LA(0x6a0c0c, [7, 7], [3, 0.08, 0.05]),
    plate: LA(0xffffff, [7, 10], EM.plate), dark: LA(0x1a1a1c, [0, 0], [0, 0, 0]), chrome: LA(0x8a8d90, [0, 0], [0, 0, 0]),
  };
  const SWAP = { 3: 4, 4: 3 };
  const plateCv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const PCOLS = 4, PROWS = 8;
  function plateText() { const A = 'ABCDEFGHJKLMNPRSTUVWXYZ', N = '0123456789', r = s => s[(Math.random() * s.length) | 0]; return r(N) + r(A) + r(A) + r(A) + r(N) + r(N) + r(N); }
  function drawPlate(g, x, y, w, h, txt) {
    g.save(); g.translate(x, y); g.scale(w / 128, h / 64);
    g.fillStyle = '#2a2a2c'; g.fillRect(0, 0, 128, 64);
    const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#fbfbf8'); gr.addColorStop(1, '#e4e8ec');
    g.fillStyle = gr; g.beginPath(); g.roundRect ? g.roundRect(2, 2, 124, 60, 5) : g.rect(2, 2, 124, 60); g.fill();
    g.fillStyle = '#c4161c'; g.font = 'bold 11px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CALIFORNIA', 64, 11);
    g.fillStyle = '#1b2a5c'; g.font = 'bold 30px "Arial Narrow", Arial, Helvetica, sans-serif'; g.save(); g.translate(64, 38); g.scale(0.78, 1.05); g.fillText(txt, 0, 0); g.restore();
    g.fillStyle = '#1b2a5c'; g.font = '6px Arial, sans-serif'; g.fillText('POWAY  COUNTY  DMV', 64, 57);
    g.restore();
  }
  let plateTex = null;
  if (plateCv) {
    plateCv.width = 128 * PCOLS; plateCv.height = 64 * PROWS; const g = plateCv.getContext('2d');
    for (let k = 0; k < PCOLS * PROWS; k++) drawPlate(g, (k % PCOLS) * 128, ((k / PCOLS) | 0) * 64, 128, 64, plateText());
    plateTex = new THREE.CanvasTexture(plateCv); plateTex.colorSpace = THREE.SRGBColorSpace; plateTex.anisotropy = 4;
  }
  function plateFor(text) {
    if (!plateTex) return null;
    if (text) { const c = document.createElement('canvas'); c.width = 256; c.height = 128; drawPlate(c.getContext('2d'), 0, 0, 256, 128, String(text).toUpperCase().slice(0, 7)); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.own = true; return t; }
    const k = (Math.random() * PCOLS * PROWS) | 0, t = plateTex.clone();
    t.repeat.set(1 / PCOLS, 1 / PROWS); t.offset.set((k % PCOLS) / PCOLS, 1 - (((k / PCOLS) | 0) + 1) / PROWS); t.needsUpdate = true; return t;
  }
  function lightMat(map) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.15, map });
    const uL = { value: new Float32Array(8) }; m.userData.uL = uL;
    m.onBeforeCompile = s => {
      s.uniforms.uL = uL;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 lch; attribute vec3 lem; uniform float uL[8]; varying vec3 vEm; varying float vPl;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPl = step(9.5, lch.y); vEm = lem * max(uL[int(lch.x + .5)], uL[int(min(lch.y, 7.) + .5)]);');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vEm; varying float vPl;')
        .replace('#include <map_fragment>', '#ifdef USE_MAP\n if (vPl > .5) diffuseColor *= texture2D(map, vMapUv);\n#endif')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vEm;');
    };
    m.customProgramCacheKey = () => 'carlights1';
    return envd(m, 0.7);
  }
  // lamp: ray(u, v) maps the unit square onto the body; cells = [[u0, u1, v0, v1, attr, nu, nv]]; optional dark housing border
  function lamp(B, ray, cells, { house = 0.012, houseA = null, off = 0.004 } = {}) {
    if (house > 0) patch(B.D, B.surf, houseA || ATT(0x141516, 'gloss'), 8, 3, (u, v) => ray(lerp(-house, 1 + house, u), lerp(-house * 3, 1 + house * 3, v)), off * 0.45);
    for (const [u0, u1, v0, v1, a, nu = 4, nv = 2] of cells) patch(B.Lt, B.surf, a, nu, nv, (u, v) => ray(lerp(u0, u1, u), lerp(v0, v1, v)), off);
  }
  // ---------------------------------------------------------------- assembly: body + greenhouse lofts
  const BODY_PLAN = [[0], [0, 0.5], [0, 0.5], [0], [0, 0.5], [0, 0.33, 0.66], [0], [0, 0.5], [0, 0.5, 0.88], [0, 0.33, 0.66], [0, 0.3, 0.65]];
  const GH_PLAN = [[0], [], [0], [0, 0.5], [0, 0.6, 0.85], [0, 0.5], [0, 0.07, 0.4, 0.75]];
  const cf = v => (Array.isArray(v) ? curve(v) : () => v);
  function bodyShape(S) {
    const zF = S.L / 2, zR = S.zBodyR ?? -S.L / 2, top = cf(S.top), bot = cf(S.bot), wid = cf(S.wid), inset = cf(S.inset), crown = cf(S.crown ?? 0.03);
    const axles = [S.axF, S.axR], Ra = S.r + S.archGap, yw = S.r, an = S.archN || 2;
    const arch = z => { let y = -1; for (const za of axles) { const d = Math.abs(z - za) / Ra; if (d < 1) y = Math.max(y, yw + Ra * Math.pow(1 - Math.pow(d, an), 1 / an)); } return y; };
    const flare = z => { let f = 0; for (const [za, fl] of [[S.axF, S.flareF || 0], [S.axR, S.flareR || 0]]) { const d = (z - za) / (Ra * 1.7); if (Math.abs(d) < 1) f += fl * (1 - d * d) * (1 - d * d); } return f; };
    const Ef = S.Ef, Er = S.Er, nf = S.nf || 4, nr = S.nr || 4;
    const eF = z => clamp((z - (zF - Ef)) / Ef, 0, 1), eR = z => clamp(((zR + Er) - z) / Er, 0, 1);
    const kx = z => { const a = eF(z), b = eR(z); return Math.pow(1 - Math.pow(a, nf), 1 / nf) * Math.pow(1 - Math.pow(b, nr), 1 / nr); };
    const y0 = z => Math.max(bot(z), arch(z));
    const sec = z => {
      const k = kx(z), w = wid(z) + flare(z), b = y0(z), yT = top(z), hb = yT - b, hr = Math.min(S.hr, hb * 0.3), ySh = yT - Math.min(S.shDrop, hb * 0.35), ym = lerp(b + hr, ySh, S.ymid ?? 0.45);
      return [[0, b, 0], [k * (w - S.tuck), b, 0.05], [k * (w - S.tuck * 0.35), b + hr, 0.03], [k * w, ym, 0.3], [k * (w - 0.008), ySh, S.cSh ?? 0.03], [k * (w - inset(z)), yT, S.cTop ?? 0.06], [0, yT + crown(z), 0]];
    };
    // start of the flat top (bezier end B5) = greenhouse base line
    const belt = z => { const c = sec(z), [x4, y4] = c[4], [x5, y5, cc] = c[5], [x6, y6] = c[6], e1 = Math.hypot(x6 - x5, y6 - y5), e0 = Math.hypot(x4 - x5, y4 - y5), d = Math.min(cc, e0 / 2, e1 / 2) / (e1 || 1); return [x5 + (x6 - x5) * d, y5 + (y6 - y5) * d]; };
    const warp = p => {
      const a = eF(p.z), b = eR(p.z);
      if (a > 0) p.z -= (S.leanF || 0) * (p.y - (S.leanFy ?? 0.5)) * a * a;
      if (b > 0) p.z += (S.leanR || 0) * (p.y - (S.leanRy ?? 0.6)) * b * b;
    };
    return { zF, zR, top, bot, wid, kx, y0, sec, belt, warp, arch, Ra, eF, eR };
  }
  // side band kinds from front to rear: [[z, kind]]; glass ranges get thin black frames
  function bandFn(list, frame = 0.02) {
    const r = list.map(([z, k], i) => [z, i + 1 < list.length ? list[i + 1][0] : -99, k]);
    return z => { for (const [z1, z0, k] of r) if (z <= z1 && z > z0) return k === 'g' && (z > z1 - frame || z < z0 + frame) ? 'f' : k; return 'p'; };
  }
  function bandKnots(list, frame = 0.02) { const k = []; list.forEach(([z, kd], i) => { k.push(z); if (kd === 'g') { k.push(z - frame); if (i + 1 < list.length) k.push(list[i + 1][0] + frame); } }); return k; }

  function assemble(S) {
    const B = { S, P: new Acc('paint'), D: new Acc('detail'), G: new Acc('glass'), Lt: new Acc('light'), surf: new Surf() };
    const bs = B.bs = bodyShape(S), { zF, zR } = bs, gh = S.gh;
    const two = S.livery; // police two-tone: paint vertex colour picks white / body colour
    const PA = { c: col(0xffffff), uv: [0.02, 0.02] }, PB = two ? { c: col(two.base), uv: [0.02, 0.02] } : PA;
    const R = {
      paint: { acc: B.P, a: PB }, paintW: { acc: B.P, a: PA }, glass: { acc: B.G, a: { c: col(0xffffff), uv: [0, 0] }, off: -0.004 }, glassR: { acc: B.G, a: { c: col(S.privacy ? 0x6a7076 : 0xffffff), uv: [0, 0] }, off: -0.004 },
      black: { acc: B.D, a: ATT(0x0c0c0d, 'gloss') }, frame: { acc: B.D, a: ATT(0x101011, 'plastic'), off: -0.001 }, seam: { acc: B.D, a: ATT(0x060606, 'plastic'), off: -0.0015 },
      under: { acc: B.D, a: ATT(0x111112, 'under') }, clad: { acc: B.D, a: ATT(0x1d1e1f, 'plastic') }, inter: { acc: B.D, a: ATT(0x23211f, 'seat') },
      trim: { acc: B.D, a: S.chromeTrim ? ATT(0xcfd2d5, 'chrome') : ATT(0x111112, 'gloss') },
    };
    const white = two ? two.white : () => false;
    // ---- body
    const hood = S.hood || [zF - 0.2, gh.zCowl], trunk = S.trunk; // [front z, rear z] of the hood / [rear z, front z] of the decklid
    const knots = [zF - S.Ef, zR + S.Er, gh.zCowl, gh.zEnd, ...(S.knots || [])];
    for (const za of [S.axF, S.axR]) knots.push(za - bs.Ra - 0.004, za - bs.Ra, za + bs.Ra, za + bs.Ra + 0.004);
    const da = S.archStep || 0.07, zs = stations(zR, zF, S.step || 0.14, knots, [[S.axF - bs.Ra, S.axF + bs.Ra, da], [S.axR - bs.Ra, S.axR + bs.Ra, da], [zF - S.Ef, zF, S.Ef / 6], [zR, zR + S.Er, S.Er / 6], [zF - 0.05, zF, 0.017], [zR, zR + 0.05, 0.017]]);
    const cab = z => z < gh.zCowl && z > gh.zEnd, bed = S.bed;
    B.body = loft(zs, bs.sec, BODY_PLAN, q => {
      const z = q.z, t = q.t;
      if (t < 1) return R.under;
      if (S.clad && t < (S.cladT ?? 3.5)) return R.clad;
      if (bed && t >= 10 && z > bed[0] && z < bed[1]) return null;
      if (t >= 8.88 && t < 9 && (z > hood[0] && z < hood[1] || trunk && z < trunk[1] && z > trunk[0])) return R.seam;
      if (t >= 10 && cab(z)) return R.inter;
      return white(z, t, q.y, 'body') ? R.paintW : R.paint;
    }, bs.warp);
    B.surf.add(B.body);
    // ---- greenhouse
    const topG = curve([[gh.zEnd, bs.belt(gh.zEnd)[1]], ...gh.top, [gh.zCowl, bs.belt(gh.zCowl)[1]]]), roofW = cf(gh.roofW), crownG = cf(gh.crown ?? 0.045);
    const side = bandFn(gh.side), href = gh.href || 0.42;
    const secG = z => {
      const [xb, yb] = bs.belt(z), yt = Math.max(yb, topG(z)), h = yt - yb, k = bs.kx(z);
      const xr = Math.min(xb, k * roofW(z)), xe = lerp(xb, xr, clamp(h / href, 0, 1)), bt = Math.min(0.028, h * 0.2), cr = Math.min(gh.cR ?? 0.09, h * 0.45);
      return [[xb, yb, 0], [xb - 0.002, yb + bt, 0], [lerp(xb, xe, 0.45) + (gh.bulge ?? 0.012) * Math.min(1, h / href), lerp(yb + bt, yt, 0.45), 1], [xe, yt, cr], [0, yt + crownG(z) * Math.min(1, h / href) * k, 0]];
    };
    B.topG = topG; B.secG = secG; B.side = side;
    const gk = [gh.zCowl - 0.05, gh.wsTop, gh.wsTop + 0.04, gh.blTop, gh.blTop - 0.04, gh.zEnd + 0.04, ...bandKnots(gh.side)];
    const gzs = stations(gh.zEnd, gh.zCowl, 0.1, gk, [[gh.wsTop - 0.1, gh.zCowl, 0.05], [gh.zEnd, gh.blTop + 0.1, 0.045]]);
    const pil = gh.pillars === 'b' ? R.black : R.paint;
    B.gh = loft(gzs, secG, GH_PLAN, q => {
      const z = q.z, t = q.t, ws = z > gh.wsTop, bl = z < gh.blTop;
      if (t < 1) return R.trim;
      if (t < 5) {
        const k = side(z);
        if (t >= 4.85) return k === 'g' || k === 'f' ? R.frame : k === 'b' ? R.black : white(z, t, q.y, 'gh') ? R.paintW : pil;
        return k === 'g' ? (z < (gh.privacyFrom ?? -99) ? R.glassR : R.glass) : k === 'f' ? R.frame : k === 'b' ? R.black : white(z, t, q.y, 'gh') ? R.paintW : R.paint;
      }
      if (t < 6) return white(z, t, q.y, 'gh') ? R.paintW : pil;
      if (ws) return t < 6.07 || z > gh.zCowl - 0.05 || z < gh.wsTop + 0.04 ? R.black : R.glass;
      if (bl) return t < 6.07 || z > gh.blTop - 0.04 || z < gh.zEnd + 0.04 ? R.black : R.glassR;
      if (gh.roof === 'glass') return t < 6.07 ? (white(z, t, q.y, 'gh') ? R.paintW : R.paint) : R.black;
      return white(z, t, q.y, 'gh') ? R.paintW : R.paint;
    }, bs.warp);
    B.surf.add(B.gh); B.R = R; B.white = white;
    return B;
  }
  // ---------------------------------------------------------------- parts (left side x > 0 then mirrored, unless noted)
  function sym(B, fn) { const ks = ['P', 'D', 'G', 'Lt'].map(k => [k, B[k].mark()]); fn(); for (const [k, [v0, i0]] of ks) B[k].mirror(v0, i0, SWAP); }
  const hSide = (B, z, y, s = 1) => B.surf.ray(R0 * s, y, z, -s, 0, 0), hTop = (B, x, z) => B.surf.ray(x, R0, z, 0, -1, 0);
  const hFront = (B, x, y) => B.surf.ray(x, y, B.bs.zF + R0, 0, 0, -1), hRear = (B, x, y) => B.surf.ray(x, y, B.bs.zR - R0, 0, 0, 1);
  // matrix: local +z along normal n, local +y ~ world up, scaled, at p + n * off
  function onSurf(p, n, sx = 1, sy = 1, sz = 1, off = 0) {
    const zA = n.clone().normalize(), xA = new THREE.Vector3(0, 1, 0).cross(zA); if (xA.lengthSq() < 1e-6) xA.set(1, 0, 0); xA.normalize();
    const yA = zA.clone().cross(xA);
    return new THREE.Matrix4().makeBasis(xA, yA, zA).scale(_s.set(sx, sy, sz)).setPosition(p.x + n.x * off, p.y + n.y * off, p.z + n.z * off);
  }
  function makePoliceTex() { return null; }
  function parts(B) {
  }
  // ---------------------------------------------------------------- specs (metres; z: rear -L/2 .. front +L/2)
  const SPECS = {
    sedan: {
      midsize: () => ({
        L: 4.88, W: 1.84, axF: 1.47, axR: -1.355, r: 0.335, archGap: 0.045,
        wheel: { r: 0.335, rim: 0.229, tw: 0.235, style: 'five', rimCol: 'silver' },
        wid: [[-2.44, 0.84], [-2.1, 0.9], [-1.4, 0.92], [0.2, 0.92], [1.5, 0.915], [2.1, 0.885], [2.44, 0.83]],
        top: [[-2.44, 0.96], [-2.3, 1.02], [-1.9, 1.045], [-1.4, 1.035], [-0.4, 1.0], [0.9, 0.975], [1.6, 0.92], [2.1, 0.85], [2.44, 0.74]],
        bot: [[-2.44, 0.36], [-2.25, 0.28], [-1.9, 0.2], [-1.5, 0.185], [1.6, 0.175], [2.1, 0.19], [2.35, 0.23], [2.44, 0.3]],
        inset: [[-2.44, 0.09], [0, 0.075], [2.44, 0.1]], crown: 0.03, tuck: 0.06, hr: 0.1, shDrop: 0.11, ymid: 0.45,
        Ef: 0.42, nf: 2.6, Er: 0.3, nr: 3, leanF: 0.28, leanFy: 0.5, leanR: 0.12, leanRy: 0.62,
        seams: [0.95, -0.1, -1.06], hood: [2.25, 0.92], trunk: [-2.4, -1.66],
        gh: {
          zCowl: 0.92, zEnd: -1.66, wsTop: 0.12, blTop: -0.8,
          top: [[-1.4, 1.17], [-1.1, 1.3], [-0.8, 1.4], [-0.45, 1.44], [-0.1, 1.445], [0.12, 1.415], [0.5, 1.215]],
          roofW: [[-1.6, 0.6], [-0.5, 0.645], [0.4, 0.635], [0.92, 0.61]],
          side: [[0.92, 'b'], [0.78, 'g'], [-0.07, 'b'], [-0.19, 'g'], [-1.02, 'b'], [-1.07, 'g'], [-1.36, 'p']],
        },
      }),
    },
  };
  // ---------------------------------------------------------------- build
  const cache = new Map(), V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function variantData(type, vn) {
    const key = type + '/' + vn; let V = cache.get(key); if (V) return V;
    const S = SPECS[type][vn](), B = assemble(S); parts(B);
    const geo = { paint: B.P.geo(), detail: B.D.geo(), glass: B.G.geo(), light: B.Lt.geo() };
    const bb = geo.paint.boundingBox, wr = S.r;
    const hubs = [];
    for (const [za, front] of [[S.axF, true], [S.axR, false]]) {
      const h = B.surf.ray(R0, S.r + B.bs.Ra + 0.03, za, -1, 0, 0), xo = h ? h.p.x : S.W / 2;
      const tH = (S.track ? S.track / 2 : xo - S.wheel.tw / 2 - (S.wIn ?? 0.012));
      hubs.push([tH, wr, za, front], [-tH, wr, za, front]);
    }
    V = { S, geo, wheel: wheelGeo(S.wheel), hubs, L: bb.max.z - bb.min.z, W: (bb.max.x - bb.min.x) - (S.mirrorW || 0), wr, bars: B.bars || null, tris: 0 };
    V.tris = Object.values(geo).reduce((n, g) => n + (g ? g.index.count / 3 : 0), 0) + V.wheel.index.count / 3 * 4 + (V.bars ? V.bars.reduce((n, g) => n + g.index.count / 3, 0) : 0);
    cache.set(key, V); return V;
  }
  function pickVariant(type) {
    const T = SPECS[type] || SPECS.sedan, ks = Object.keys(T); let r = Math.random() * ks.reduce((s, k) => s + (T[k].w ?? 1), 0);
    for (const k of ks) if ((r -= T[k].w ?? 1) <= 0) return k; return ks[0];
  }
  let policeTex = null;
  function build(type, paintHex, vn, opt = {}) {
    if (!SPECS[type]) type = 'sedan';
    vn = vn && SPECS[type][vn] ? vn : pickVariant(type);
    const V = variantData(type, vn), S = V.S, g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    if (paintHex == null) paintHex = S.fixedPaint ?? paint();
    const f = paintFinish(paintHex, S.finish);
    const pm = envd(new THREE.MeshPhysicalMaterial({ color: S.livery ? 0xffffff : paintHex, vertexColors: true, metalness: S.livery ? 0.05 : f.metalness, roughness: S.livery ? 0.28 : f.roughness, clearcoat: f.clearcoat, clearcoatRoughness: f.clearcoatRoughness }), 1);
    const dm = envd(detailMat.clone(), 1), gm = envd(glassMat.clone(), 1.2);
    const tex = S.livery ? (policeTex || (policeTex = makePoliceTex())) : plateFor(opt.plate);
    const lm = lightMat(tex);
    const mats = [pm, dm, gm, lm];
    for (const [k, m] of [['paint', pm], ['detail', dm], ['glass', gm], ['light', lm]]) {
      if (!V.geo[k]) continue; const o = new THREE.Mesh(V.geo[k], m); o.castShadow = k !== 'light'; o.receiveShadow = !!opt.receiveShadow && k === 'paint'; body.add(o);
    }
    const wheels = [];
    for (const [x, y, z, front] of V.hubs) {
      const piv = new THREE.Group(); piv.position.set(x, y, z); g.add(piv);
      const w = new THREE.Mesh(V.wheel, dm); w.castShadow = true; if (x < 0) w.rotation.y = Math.PI; piv.add(w);
      wheels.push({ piv, w, front });
    }
    let bars = null;
    if (V.bars) {
      bars = V.bars.map((bg, i) => { const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: i ? 0x000a40 : 0x400000, vertexColors: true })); body.add(m); return m; });
    }
    const uL = lm.userData.uL.value;
    const lights = {
      mat: lm,
      update(o = {}) {
        if (lm.color.r < 0.5) { uL.fill(0); return; } // wrecked
        const t = o.t || 0, bl = (t * 1.5) % 1 < 0.55, h = clamp(o.head || 0, 0, 1), ind = o.ind || 0, hz = !!o.hazard;
        uL[0] = h; uL[1] = o.brake ? 1 : h * 0.3; uL[2] = o.brake ? 1 : 0;
        uL[3] = (hz || ind < 0) && bl ? 1 : 0; uL[4] = (hz || ind > 0) && bl ? 1 : 0; uL[5] = o.reverse ? 1 : 0; uL[6] = 1 - h * 0.35; uL[7] = h;
      },
    };
    lights.update({});
    const dispose = () => { for (const m of mats) { envMats.delete(m); m.dispose(); } if (tex && tex !== policeTex) tex.dispose(); if (bars) bars.forEach(b => b.material.dispose()); };
    return { g, body, wheels, bars, mats, lights, L: V.L, W: V.W, wr: V.wr, type, variant: vn, dispose };
  }
  function setEnv(k) { envK = k; for (const m of envMats) if (m.envMap) m.envMapIntensity = m.userData.envK * k; }
  const kit = {
    types: Object.fromEntries(Object.entries(SPECS).map(([k, v]) => [k, Object.keys(v)])),
    paint, build, setEnv, envMap: envTex,
    stats(type, vn) { const V = variantData(type, vn); return { tris: V.tris, calls: Object.values(V.geo).filter(Boolean).length + 4 + (V.bars ? V.bars.length : 0), L: V.L, W: V.W, wr: V.wr, H: V.geo.paint.boundingBox.max.y }; },
  };

  return kit;
}
