// Spectators and their noise. Hundreds of people in ordinary clothes (T-shirts, hoodies, jeans; nobody in a uniform)
// on the stands, drawn as one instanced mesh per crowd: a low-poly body whose arms and bounce are animated in the
// vertex shader, so a full grandstand costs one draw call and no CPU per person. Idle they sway, chat and clap now
// and then; on a big moment (a long jump, a finish, a knock-out) the whole crowd jumps up, arms in the air.
// Sound: a crowd murmur near the stands, and cheers made on the fly (a dozen "yeah" voices through vowel filters,
// a roar and applause), all synthesized; nothing to download.
//   createCrowd(seats, opts) -> { mesh, update(dt), cheer(power) }   seats: [{ x, y, z, ry }] in the world's frame
//   CHEER.at(x, z, power) / CHEER.near(dist, level) / CHEER.update(dt)
import { ctx } from '../ctx.js';
import { rng } from './kit.js';

const SHIRTS = ['#c8423b', '#2f4f7f', '#f1efe8', '#8b9096', '#3d6b45', '#e0b03a', '#1d6f7a', '#6d2333', '#6a4c93', '#e07a3f', '#232428', '#8fb8de', '#d77fa1', '#4a7a9c', '#b5543a', '#e8d9b5', '#2e8a57', '#ffb000', '#5b3a29', '#9c2f2f'];
const PANTS = ['#2b3d5c', '#1f2c45', '#3a4a66', '#4e5a6e', '#2a2a2c', '#6b5b45', '#8a7c62', '#55595e', '#33415c'];
const SKINS = ['#f1c9a5', '#e0ac85', '#c68863', '#8d5a3b', '#5e3b26', '#f6d7bd', '#b07650'];
const HAIRS = ['#2a1d14', '#4b3020', '#8c6a3c', '#c9a46b', '#1a1a1a', '#9a9a9a', '#7a3b1e'];

let GEO = null;
function bodyGeo() { // feet at y = 0, facing +z. part: 0 legs, 1 torso, 2 left arm, 3 right arm, 4 head; col: 0 pants 1 shirt 2 skin 3 hair
  if (GEO) return GEO;
  const { THREE } = ctx, pos = [], nor = [], part = [], col = [], idx = [];
  const box = (w, h, d, x, y, z, p, c) => { // indexed: 24 vertices a box
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), P = g.attributes.position.array, N = g.attributes.normal.array, base = pos.length / 3;
    for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
    for (let i = 0; i < P.length / 3; i++) { part.push(p); col.push(c); }
    for (const k of g.index.array) idx.push(base + k);
  };
  box(0.15, 0.82, 0.17, -0.1, 0, 0, 0, 0); box(0.15, 0.82, 0.17, 0.1, 0, 0, 0, 0);
  box(0.4, 0.6, 0.23, 0, 0.82, 0, 1, 1);
  box(0.11, 0.3, 0.12, -0.265, 1.12, 0, 2, 1); box(0.1, 0.32, 0.11, -0.265, 0.8, 0, 2, 2);
  box(0.11, 0.3, 0.12, 0.265, 1.12, 0, 3, 1); box(0.1, 0.32, 0.11, 0.265, 0.8, 0, 3, 2);
  box(0.09, 0.08, 0.09, 0, 1.42, 0, 4, 2); box(0.2, 0.23, 0.21, 0, 1.49, 0.01, 4, 2);
  box(0.22, 0.07, 0.23, 0, 1.7, 0, 4, 3); box(0.22, 0.14, 0.05, 0, 1.57, -0.1, 4, 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('part', new THREE.Float32BufferAttribute(part, 1)); g.setAttribute('cid', new THREE.Float32BufferAttribute(col, 1)); g.setIndex(idx);
  return (GEO = g);
}

const VERT_HEAD = `
attribute float part; attribute float cid;
attribute vec3 iShirt; attribute vec3 iPants; attribute vec3 iSkin; attribute vec3 iHair; attribute vec4 iAnim; // phase, style, seat, energy
uniform float uTime; uniform float uCheer; uniform float uWave;
varying vec3 vCol;
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
`;
// arms swing about the shoulder: forward (x axis) for clapping, sideways (z axis) for arms in the air
const VERT_BODY = `
  float ph = iAnim.x, st = iAnim.y, en = iAnim.w, t = uTime + ph * 6.2831;
  float wave = uWave * smoothstep(0.55, 1.0, sin(uTime * 2.4 - iAnim.z * 0.09));
  float ch = clamp(max(uCheer * (0.65 + 0.35 * en), wave), 0.0, 1.0);
  float clap = (1.0 - ch) * step(0.72, fract(ph * 7.31 + floor(uTime / 7.0) * 0.37)); // now and then someone claps
  float side = part < 2.5 ? -1.0 : 1.0; // part 2 is the arm at -x
  float up = ch * (2.55 + 0.25 * sin(t * 5.5 + side)) * (st < 2.5 || side > 0.0 ? 1.0 : 0.3);
  float fwd = clap * (1.15 + 0.18 * sin(t * 15.0)) + (1.0 - ch) * (1.0 - clap) * 0.06 * sin(t * 1.3);
  mat3 R = mat3(1.0);
  if (part > 1.5 && part < 3.5) R = rotZ(side * up) * rotX(-fwd);
  vec3 piv = vec3(side * 0.265, 1.42, 0.0);
  float bob = ch * abs(sin(t * 4.6)) * (st > 1.5 ? 0.32 : 0.12) + (1.0 - ch) * 0.015 * sin(t * 1.7);
  float lean = (1.0 - ch) * 0.05 * sin(t * 0.9);
  vCol = cid < 0.5 ? iPants : cid < 1.5 ? iShirt : cid < 2.5 ? iSkin : iHair;
`;

// seats: [{ x, y, z, ry }] in the parent group's frame
export function createCrowd(seats, { seed = 1, parent, cast = false } = {}) {
  const { THREE } = ctx, R = rng(seed), n = seats.length, geo = bodyGeo().clone();
  const a = { iShirt: new Float32Array(n * 3), iPants: new Float32Array(n * 3), iSkin: new Float32Array(n * 3), iHair: new Float32Array(n * 3), iAnim: new Float32Array(n * 4) };
  const c = new THREE.Color(), set = (arr, i, hex) => { c.set(hex).convertSRGBToLinear(); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; };
  const pick = L => L[(R() * L.length) | 0];
  for (let i = 0; i < n; i++) {
    set(a.iShirt, i, pick(SHIRTS)); set(a.iPants, i, pick(PANTS)); set(a.iSkin, i, pick(SKINS)); set(a.iHair, i, pick(HAIRS));
    a.iAnim.set([R(), (R() * 4) | 0, i, 0.4 + R() * 0.6], i * 4);
  }
  for (const k in a) geo.setAttribute(k, new THREE.InstancedBufferAttribute(a[k], k === 'iAnim' ? 4 : 3));
  const U = { uTime: { value: 0 }, uCheer: { value: 0 }, uWave: { value: 0 } };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = VERT_HEAD + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + VERT_BODY + ' objectNormal = R * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = R * (transformed - piv) + piv; transformed.y += bob; transformed.z += lean * transformed.y;');
    sh.fragmentShader = 'varying vec3 vCol;\n' + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vCol, opacity );');
  };
  mat.customProgramCacheKey = () => 'pao-crowd';
  const mesh = new THREE.InstancedMesh(geo, mat, n), M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  seats.forEach((st, i) => { q.setFromAxisAngle(up, st.ry || 0); const k = 0.92 + R() * 0.16; s.set(k, k, k); p.set(st.x, st.y || 0, st.z); mesh.setMatrixAt(i, M.compose(p, q, s)); });
  mesh.castShadow = cast; mesh.receiveShadow = false; mesh.computeBoundingSphere(); mesh.boundingSphere.radius += 3;
  if (parent) parent.add(mesh);
  let cheerT = 0, cheerP = 0;
  return {
    mesh, seats,
    update(dt) { U.uTime.value += dt; cheerT = Math.max(0, cheerT - dt); const want = cheerT > 0 ? cheerP : 0; U.uCheer.value += (want - U.uCheer.value) * (1 - Math.exp(-dt * (want > U.uCheer.value ? 6 : 1.5))); },
    cheer(power = 1, secs = 3.5) { cheerP = Math.max(cheerT > 0 ? cheerP : 0, Math.min(1, power)); cheerT = Math.max(cheerT, secs); },
    wave(on) { U.uWave.value = on ? 1 : 0; },
  };
}

// rows of seats on a grandstand: from (x0, z0) along the stand's length (dir = yaw the crowd faces), `rows` deep,
// stepping up `rise` per row. Returns seats in the group's frame; fill: 0..1 of the seats taken
export function standSeats(x, z, len, ry, rows, { rise = 0.45, depth = 0.85, y0 = 0.5, gap = 0.62, fill = 0.85, seed = 3 } = {}) {
  const R = rng(seed), out = [], fx = Math.sin(ry), fz = Math.cos(ry), rx = fz, rz = -fx;
  for (let r = 0; r < rows; r++) for (let u = -len / 2; u <= len / 2; u += gap) {
    if (R() > fill) continue;
    const back = r * depth, jitter = (R() - 0.5) * 0.18;
    out.push({ x: x + rx * (u + jitter) - fx * back, y: y0 + r * rise, z: z + rz * (u + jitter) - fz * back, ry: ry + (R() - 0.5) * 0.5 });
  }
  return out;
}

// ---------------------------------------------------------------- the sound of a crowd
let noiseBuf = null, clapBuf = null, bed = null;
function bufs(AC) {
  if (noiseBuf) return;
  const sr = AC.sampleRate, n = sr * 2; noiseBuf = AC.createBuffer(1, n, sr);
  { const d = noiseBuf.getChannelData(0); let b = 0; for (let i = 0; i < n; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6 + (Math.random() * 2 - 1) * 0.25; } }
  clapBuf = AC.createBuffer(1, sr * 3, sr);
  { const d = clapBuf.getChannelData(0); for (let k = 0; k < 140; k++) { const s0 = Math.floor(Math.random() * (d.length - 2000)), a = 0.4 + Math.random() * 0.6; for (let i = 0; i < 900; i++) d[s0 + i] += (Math.random() * 2 - 1) * a * Math.exp(-i / 140); } }
}
export const CHEER = {
  level: 0, want: 0,
  // the murmur of the stands: 0..1, from how close you are (call every frame with the distance to the nearest stand)
  near(dist, busy = 1) { this.want = Math.max(0, Math.min(1, 1 - dist / 260)) * busy; },
  update(dt) {
    const AC = ctx.AC, out = ctx.master; if (!AC || !out) return;
    this.level += (this.want - this.level) * (1 - Math.exp(-dt * 1.5));
    if (!bed && this.level > 0.01) {
      bufs(AC); const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.8;
      const g = AC.createGain(); g.gain.value = 0; src.connect(bp).connect(g).connect(out); src.start(); bed = { src, g, bp, t: 0 };
    }
    if (bed) {
      bed.t += dt; const wob = 0.75 + 0.25 * Math.sin(bed.t * 0.7) * Math.sin(bed.t * 1.9 + 1);
      bed.g.gain.setTargetAtTime(this.level * 0.11 * wob, AC.currentTime, 0.3); bed.bp.frequency.setTargetAtTime(480 + 120 * Math.sin(bed.t * 0.33), AC.currentTime, 0.5);
      if (this.level < 0.005 && this.want === 0) { try { bed.src.stop(); } catch (e) { } bed = null; }
    }
  },
  // a cheer: power 0..1 (a good jump 0.5, a record 1), vol: 0..1 from distance
  burst(power = 1, vol = 1) {
    const AC = ctx.AC, out = ctx.master; if (!AC || !out || vol <= 0.01) return;
    bufs(AC); const t0 = AC.currentTime + 0.05, dur = 1.6 + power * 1.6, bus = AC.createGain(); bus.gain.value = 0.55 * vol; bus.connect(out);
    // voices: "yeahh" (sawtooth through two vowel formants), each a little different
    const vowels = [[730, 1090], [660, 1720], [570, 840], [530, 1840]];
    for (let i = 0; i < 10 + Math.round(power * 8); i++) {
      const o = AC.createOscillator(); o.type = 'sawtooth'; const f0 = Math.random() < 0.5 ? 120 + Math.random() * 60 : 210 + Math.random() * 90, st = t0 + Math.random() * 0.35;
      o.frequency.setValueAtTime(f0, st); o.frequency.linearRampToValueAtTime(f0 * (1.12 + Math.random() * 0.2), st + 0.25); o.frequency.linearRampToValueAtTime(f0 * (0.9 + Math.random() * 0.1), st + dur * 0.8);
      const v = vowels[(Math.random() * vowels.length) | 0], g = AC.createGain(); g.gain.value = 0;
      const f1 = AC.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = v[0]; f1.Q.value = 6;
      const f2 = AC.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = v[1]; f2.Q.value = 8;
      const a = 0.05 + Math.random() * 0.04; g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(a, st + 0.12 + Math.random() * 0.15); g.gain.setValueAtTime(a, st + dur * (0.4 + Math.random() * 0.3)); g.gain.linearRampToValueAtTime(0, st + dur);
      o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(bus); o.start(st); o.stop(st + dur + 0.1);
    }
    // the roar under them, and applause
    const n = AC.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const nb = AC.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 900; nb.Q.value = 0.6;
    const ng = AC.createGain(); ng.gain.setValueAtTime(0, t0); ng.gain.linearRampToValueAtTime(0.12 + power * 0.1, t0 + 0.3); ng.gain.linearRampToValueAtTime(0, t0 + dur + 0.6);
    n.connect(nb).connect(ng).connect(bus); n.start(t0); n.stop(t0 + dur + 0.7);
    const c = AC.createBufferSource(); c.buffer = clapBuf; const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const cg = AC.createGain(); cg.gain.setValueAtTime(0, t0 + 0.4); cg.gain.linearRampToValueAtTime(0.35, t0 + 0.8); cg.gain.linearRampToValueAtTime(0, t0 + 3);
    c.connect(hp).connect(cg).connect(bus); c.start(t0 + 0.3);
    setTimeout(() => { try { bus.disconnect(); } catch (e) { } }, (dur + 3.5) * 1000);
  },
  stop() { this.want = 0; },
};
