// Soft sand that remembers: tyre ruts and footprints pressed into the beach. A 1024 x 1024 texture covering 192 m round
// the player (R: how deep the dent, G: the sand pushed up beside it), stamped as cars and people cross the sand, fading
// over a couple of minutes, re-centred as you go. The ground shader reads it (src/nature/ground.js TRACK_U): darker,
// damper sand in the dents, the slopes of ruts and berms in the lighting.
//   const TR = createTracks(THREE, renderer, TRACK_U)
//   TR.tyre(x0, z0, x1, z1, width)   a stretch of rut from the last wheel position to this one
//   TR.foot(x, z, yaw, left)          a footprint
//   TR.update(dt, cx, cz)             the window follows (cx, cz); the stamps of this frame go down; the old ones fade
const RES = 1024, SIZE = 192;

const STAMP_VS = /* glsl */`
attribute vec4 iA; attribute vec4 iB; // iA: centre x, z, along x, along z (unit); iB: half length, half width, kind (0 rut, 1 foot), seed
uniform vec4 uWin; varying vec2 vQ; varying float vKind; varying float vSeed; varying float vLen;
void main() {
  vec2 al = iA.zw, ac = vec2(-al.y, al.x), p = iA.xy + al * position.y * iB.x + ac * position.x * iB.y * 1.7; // the quad reaches past the rut for its berm
  vQ = vec2(position.x * 1.7, position.y); vKind = iB.z; vSeed = iB.w; vLen = iB.x;
  vec2 uv = (p - uWin.xy) / uWin.z; gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}`;
const STAMP_FS = /* glsl */`
varying vec2 vQ; varying float vKind; varying float vSeed; varying float vLen;
void main() {
  float a = abs(vQ.x), dent, berm;
  if (vKind < 0.5) { // a rut: deepest in the middle, the tread's blocks across it, sand heaped on both sides
    float tread = 0.82 + 0.18 * step(0.0, sin((vQ.y * vLen + vSeed) * 34.0) * sin(vQ.x * 9.0 + 1.0));
    dent = (1.0 - smoothstep(0.55, 1.0, a)) * tread; berm = smoothstep(0.9, 1.15, a) * (1.0 - smoothstep(1.2, 1.7, a));
  } else { // a footprint: heel and ball, the toes
    vec2 q = vQ * vec2(1.0 / 1.7, 1.0); float heel = length((q - vec2(0.0, -0.45)) * vec2(1.6, 2.4)), ball = length((q - vec2(0.05, 0.3)) * vec2(1.4, 2.0));
    dent = max(1.0 - smoothstep(0.6, 1.0, heel), 1.0 - smoothstep(0.65, 1.0, ball)) * 0.8; berm = 0.0;
  }
  gl_FragColor = vec4(dent, berm, 0.0, 1.0);
}`;
const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export function createTracks(THREE, renderer, TU) {
  const mk = () => { const t = new THREE.WebGLRenderTarget(RES, RES, { depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); return t; };
  let A = mk(), Bt = mk(); const win = new THREE.Vector4(0, 0, SIZE, 0), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // stamps: up to 512 a frame
  const N = 512, geo = new THREE.InstancedBufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
  const iA = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4), iB = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); geo.setAttribute('iA', iA); geo.setAttribute('iB', iB); geo.instanceCount = 0;
  const stampMat = new THREE.ShaderMaterial({ vertexShader: STAMP_VS, fragmentShader: STAMP_FS, uniforms: { uWin: { value: win } }, depthTest: false, depthWrite: false, side: THREE.DoubleSide, /* along and across swap the quad's winding */
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
  const stamps = new THREE.Mesh(geo, stampMat); stamps.frustumCulled = false; const sScene = new THREE.Scene(); sScene.add(stamps);
  // fading: the whole texture times k; moving: the old texture shifted into the other one
  const fadeMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: 'uniform float uK; void main() { gl_FragColor = vec4(uK); }', uniforms: { uK: { value: 0.996 } }, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor });
  const moveMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VS, uniforms: { uSrc: { value: null }, uOff: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    fragmentShader: 'uniform sampler2D uSrc; uniform vec2 uOff; varying vec2 vUv; void main() { vec2 uv = vUv + uOff; gl_FragColor = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture2D(uSrc, uv); }' });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat); quad.frustumCulled = false; const qScene = new THREE.Scene(); qScene.add(quad);
  const borrow = () => ({ rt: renderer.getRenderTarget(), auto: renderer.autoClear, col: renderer.getClearColor(new THREE.Color()), a: renderer.getClearAlpha() });
  const giveBack = k => { renderer.setRenderTarget(k.rt); renderer.autoClear = k.auto; renderer.setClearColor(k.col, k.a); };
  const clear = rt => { renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); };
  let n = 0, fadeT = 0, active = false, seed = 0;
  const push = (cx, cz, ax, az, hl, hw, kind) => { if (n >= N) return; const a = iA.array, b = iB.array, o = n * 4; a[o] = cx; a[o + 1] = cz; a[o + 2] = ax; a[o + 3] = az; b[o] = hl; b[o + 1] = hw; b[o + 2] = kind; b[o + 3] = (seed = (seed + 7.31) % 100); n++; active = true; };
  TU.gTrk.value = A.texture; TU.gTrkWin.value = [0, 0, SIZE, 0];
  let first = true;
  return {
    tyre(x0, z0, x1, z1, w) { const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.02 || L > 6) return; push((x0 + x1) / 2, (z0 + z1) / 2, dx / L, dz / L, L / 2 + w * 0.2, w / 2, 0); },
    foot(x, z, yaw, left) { const ax = Math.sin(yaw), az = Math.cos(yaw), s = left ? -0.11 : 0.11; push(x - az * s, z + ax * s, ax, az, 0.14, 0.055, 1); },
    update(dt, cx, cz) {
      const k = borrow(); renderer.autoClear = false;
      if (first) { clear(A); clear(Bt); first = false; win.set(cx - SIZE / 2, cz - SIZE / 2, SIZE, 0); }
      if (Math.abs(cx - (win.x + SIZE / 2)) > SIZE * 0.22 || Math.abs(cz - (win.y + SIZE / 2)) > SIZE * 0.22) { // re-centre: shift what's there into the other target
        const nx = Math.round((cx - SIZE / 2) / (SIZE / RES)) * (SIZE / RES), nz = Math.round((cz - SIZE / 2) / (SIZE / RES)) * (SIZE / RES);
        quad.material = moveMat; moveMat.uniforms.uSrc.value = A.texture; moveMat.uniforms.uOff.value.set((nx - win.x) / SIZE, (nz - win.y) / SIZE);
        renderer.setRenderTarget(Bt); renderer.render(qScene, cam); [A, Bt] = [Bt, A]; win.x = nx; win.y = nz; TU.gTrk.value = A.texture;
      }
      if (n) { iA.needsUpdate = iB.needsUpdate = true; geo.instanceCount = n; renderer.setRenderTarget(A); renderer.render(sScene, cam); n = 0; }
      if ((fadeT += dt) > 0.25 && active) { fadeT = 0; quad.material = fadeMat; renderer.setRenderTarget(A); renderer.render(qScene, cam); }
      giveBack(k);
      TU.gTrkWin.value = [win.x, win.y, SIZE, active ? 1 : 0];
    },
  };
}
