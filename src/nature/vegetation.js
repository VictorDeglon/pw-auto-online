// Trees, shrubs and succulents.
//
// Every plant has two representations baked offline from a photoscanned / high-detail model (tools/nature/):
//  - an octahedral impostor: 8x8 views over the upper hemisphere (albedo with baked AO + normals). All instances of a
//    species are ONE draw call; the shader picks and blends the 4 nearest views and lights them with the scene's sun
//    and sky, so 300k+ plants cost a few draws.
//  - a near LOD mesh (~5-30k tris for trees, ~1-4k for shrubs) for the plants within `near` metres, with shadows and
//    wind sway. Near meshes and impostors cross-fade with complementary dither, so there is no pop.
// Placement (assignPlants) turns the aerial tree detections into species: planted trees in town, chaparral and
// sage scrub in the wild (Poway's hills are shrubland; oaks only along creek bottoms), plus succulents.

export const IGN = 'fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))';

// ---------------------------------------------------------------- loading
export async function loadVegetation(THREE, gltfLoader, renderer, base = 'assets/nature/') {
  const man = await (await fetch(base + 'veg.json')).json();
  const texLoader = new THREE.TextureLoader();
  const tex = (url, srgb) => texLoader.loadAsync(url).then(t => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; return t;
  });
  const species = new Map();
  await Promise.all(Object.entries(man.species).map(async ([name, sp]) => {
    const [alb, nrm] = await Promise.all([tex(base + sp.atlas + '_alb.webp', true), tex(base + sp.atlas + '_nrm.webp', false)]);
    const lods = await Promise.all(sp.variants.map(v => v.lod ? gltfLoader.loadAsync(base + v.lod).then(g => mergeLod(THREE, g.scene)).catch(() => null) : null));
    species.set(name, { name, ...sp, alb, nrm, lods });
  }));
  return { THREE, species };
}

// flatten a GLB scene into one geometry with material groups
function mergeLod(THREE, root) {
  root.updateMatrixWorld(true);
  const geos = [], mats = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    for (const k of Object.keys(g.attributes)) { // quantized (KHR_mesh_quantization) or integer attributes -> float, so transforms and merging work
      const a = g.attributes[k]; if (a.array instanceof Float32Array && !a.normalized) continue;
      const f = new Float32Array(a.count * a.itemSize), get = ['getX', 'getY', 'getZ', 'getW'];
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a[get[c]](i);
      g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
    }
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.color) { const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    if (g.attributes.color.itemSize === 4) { // RGBA vertex colour -> RGB
      const a = g.attributes.color, c = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { c[i * 3] = a.getX(i); c[i * 3 + 1] = a.getY(i); c[i * 3 + 2] = a.getZ(i); }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    geos.push(g.index ? g.toNonIndexed() : g);
    const m = o.material; mats.push(m);
  });
  if (!geos.length) return null;
  // merge by hand into groups (BufferGeometryUtils is not imported here)
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), C = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry(); let o = 0;
  geos.forEach((g, i) => {
    const c = g.attributes.position.count;
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2);
    C.set(g.attributes.color.array, o * 3);
    geo.addGroup(o, c, i); o += c;
  });
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U, 2)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.computeBoundingSphere();
  return { geo, mats };
}

// ---------------------------------------------------------------- shared uniforms (lights, wind, LOD ranges)
export function natureUniforms(THREE) {
  return {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
    uSky: { value: new THREE.Color(0.5, 0.6, 0.7) }, uGround: { value: new THREE.Color(0.3, 0.28, 0.2) },
    uTime: { value: 0 }, uWind: { value: 1 }, uWindBase: { value: 1 }, uGust: { value: 0.5 }, uNear: { value: 55 }, uBand: { value: 12 }, uFar: { value: 2400 },
  };
}

// ---------------------------------------------------------------- impostor material
const IMP_VS = /* glsl */`
uniform vec4 uVar[8]; uniform vec2 uBlk[8]; uniform vec2 uBlocks; uniform float uG;
uniform float uNear, uBand, uFar;
attribute vec4 iPos;   // base x, y, z, rotation about Y
attribute vec2 iSV;    // scale, variant
attribute vec3 iTint;
varying vec2 vUv0; varying vec2 vUv1; varying vec2 vUv2; varying vec2 vUv3; varying vec4 vW;
varying vec3 vTint; varying float vFade; varying vec3 vBr; varying vec3 vBu; varying vec3 vBf;
#include <fog_pars_vertex>
vec3 decodeDir(vec2 f) {
  vec2 ab = (f + 0.5) / uG * 2.0 - 1.0;
  vec3 d = vec3((ab.x + ab.y) * 0.5, 0.0, (ab.x - ab.y) * 0.5); d.y = 1.0 - abs(d.x) - abs(d.z); return normalize(d);
}
vec2 frameUv(vec2 f, vec3 rel, float R, vec2 blk) {
  vec3 d = decodeDir(f); vec3 u = normalize(vec3(0.0, 1.0, 0.0) - d * d.y); vec3 r = cross(u, d);
  vec2 uv = clamp(vec2(dot(rel, r), dot(rel, u)) / (2.0 * R) + 0.5, 0.004, 0.996);
  return (blk + (f + uv) / uG) / uBlocks;
}
void main() {
  int vi = int(iSV.y + 0.5); vec4 cr = uVar[vi]; float R = cr.w; float s = iSV.x;
  float cs = cos(iPos.w), sn = sin(iPos.w);
  #define ROT(v) vec3(cs * (v).x + sn * (v).z, (v).y, -sn * (v).x + cs * (v).z)
  #define IROT(v) vec3(cs * (v).x - sn * (v).z, (v).y, sn * (v).x + cs * (v).z)
  vec3 cW = iPos.xyz + ROT(cr.xyz) * s;
  float dBase = distance(cameraPosition, iPos.xyz);
  vFade = smoothstep(uNear, uNear + uBand, dBase);
  // small plants stop drawing sooner: a 2 m shrub is under a pixel long before uFar, and the photo shows it there anyway
  if (vFade <= 0.0 || dBase > uFar * clamp(R * s / 3.5, 0.3, 1.0)) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec3 toCam = normalize(cameraPosition - cW);
  vec3 vO = IROT(toCam); vO.y = max(vO.y, 0.0); vO = normalize(vO + vec3(0.0, 1e-4, 0.0));
  vec3 bu = normalize(vec3(0.0, 1.0, 0.0) - vO * vO.y); vec3 br = cross(bu, vO);
  vec3 rel = (br * position.x + bu * position.y) * R;
  vec3 pW = cW + ROT(rel) * s;
  vec3 n = vO / (abs(vO.x) + abs(vO.y) + abs(vO.z));
  vec2 g = clamp((vec2(n.x + n.z, n.x - n.z) * 0.5 + 0.5) * uG - 0.5, 0.0, uG - 1.0);
  vec2 f0 = floor(g), fr = g - f0, f1 = min(f0 + 1.0, uG - 1.0);
  vec2 blk = uBlk[vi];
  vUv0 = frameUv(f0, rel, R, blk); vUv1 = frameUv(vec2(f1.x, f0.y), rel, R, blk);
  vUv2 = frameUv(vec2(f0.x, f1.y), rel, R, blk); vUv3 = frameUv(f1, rel, R, blk);
  vW = vec4((1.0 - fr.x) * (1.0 - fr.y), fr.x * (1.0 - fr.y), (1.0 - fr.x) * fr.y, fr.x * fr.y);
  vBr = ROT(br); vBu = ROT(bu); vBf = ROT(vO); vTint = iTint;
  vec4 mvPosition = viewMatrix * vec4(pW, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const IMP_FS = /* glsl */`
uniform sampler2D uAlb; uniform sampler2D uNrm;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGround; uniform float uTrans;
varying vec2 vUv0; varying vec2 vUv1; varying vec2 vUv2; varying vec2 vUv3; varying vec4 vW;
varying vec3 vTint; varying float vFade; varying vec3 vBr; varying vec3 vBu; varying vec3 vBf;
#include <common>
#include <fog_pars_fragment>
void main() {
  if (${IGN} < 1.0 - vFade) discard;   // complement of the near mesh's dither
  vec4 a = texture2D(uAlb, vUv0) * vW.x + texture2D(uAlb, vUv1) * vW.y + texture2D(uAlb, vUv2) * vW.z + texture2D(uAlb, vUv3) * vW.w;
  float cov = clamp((a.a - 0.5) / max(fwidth(a.a), 1e-3) + 0.5, 0.0, 1.0);
  if (cov < 0.5) discard; // below this the fringe has no MSAA to soften it and reads as a dark halo
  vec3 nt = (texture2D(uNrm, vUv0).xyz * vW.x + texture2D(uNrm, vUv1).xyz * vW.y + texture2D(uNrm, vUv2).xyz * vW.z + texture2D(uNrm, vUv3).xyz * vW.w) * 2.0 - 1.0;
  vec3 N = normalize(vBr * nt.x + vBu * nt.y + vBf * max(nt.z, 0.05));
  float ndl = dot(N, uSunDir);
  vec3 irr = uSunCol * max(ndl, 0.0) + mix(uGround, uSky, 0.5 * N.y + 0.5) + uSunCol * uTrans * max(-ndl, 0.0);
  gl_FragColor = vec4(a.rgb * vTint * irr * RECIPROCAL_PI, cov);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function impostorMaterial(THREE, sp, U) {
  const V = sp.variants;
  const uVar = Array.from({ length: 8 }, (_, i) => { const v = V[Math.min(i, V.length - 1)]; return new THREE.Vector4(v.center[0], v.center[1], v.center[2], v.radius); });
  const uBlk = Array.from({ length: 8 }, (_, i) => { const v = V[Math.min(i, V.length - 1)]; return new THREE.Vector2(v.block[0], v.block[1]); });
  const m = new THREE.ShaderMaterial({
    vertexShader: IMP_VS, fragmentShader: IMP_FS, fog: true, alphaToCoverage: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
  });
  Object.assign(m.uniforms, U, sp.lods.some(l => l) ? {} : { uNear: { value: 0 }, uBand: { value: 1e-3 } }, {
    uAlb: { value: sp.alb }, uNrm: { value: sp.nrm }, uVar: { value: uVar }, uBlk: { value: uBlk },
    uBlocks: { value: new THREE.Vector2(sp.blocks[0], sp.blocks[1]) }, uG: { value: sp.G }, uTrans: { value: sp.trans ?? 0.18 },
  });
  return m;
}

// near-mesh material patch, the way Unreal shades foliage: dithered fade-out beyond uNear (the impostor fades in under
// it), wind sway growing with height plus a flutter on the leaves, an anti-aliased alpha cut that keeps its coverage in
// the distance, and two-sided foliage: sunlight coming through the leaves when they're backlit or you look toward the
// sun through the crown.
function patchNear(mat, U, sway, leaf) {
  mat.onBeforeCompile = sh => {
    for (const k of ['uNear', 'uBand', 'uTime', 'uWind', 'uSunDir', 'uSunCol']) sh.uniforms[k] = U[k];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uNear, uBand, uTime, uWind; varying float vNearFade;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ipos = vec3(instanceMatrix[3]);
          vNearFade = 1.0 - smoothstep(uNear, uNear + uBand, distance(ipos, cameraPosition));
          float hgt = max(transformed.y, 0.0), ph = dot(ipos.xz, vec2(0.13, 0.17));
          float sw = uWind * ${sway.toFixed(4)} * hgt * hgt / (1.0 + hgt);
          transformed.x += sin(uTime * 1.3 + ph + transformed.y * 0.4) * sw;
          transformed.z += cos(uTime * 1.1 + ph * 1.3 + transformed.x * 0.4) * sw * 0.7;
          ${leaf ? 'transformed += objectNormal * sin(uTime * 6.3 + dot(transformed, vec3(3.1, 1.7, 2.3)) + ph) * 0.025 * uWind * min(hgt, 1.0);' : ''}
        #else
          vNearFade = 1.0;
        #endif`);
    let fs = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vNearFade; uniform vec3 uSunDir, uSunCol;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nif (${IGN} >= vNearFade) discard;`)
      .replace('#include <normal_fragment_begin>', leaf ? `#include <normal_fragment_begin>
        normal = normalize(vNormal); // leaf normals point out of the crown on both faces: a flipped back face lit the inside` : '#include <normal_fragment_begin>');
    if (leaf) fs = fs
      .replace('#include <alphatest_fragment>', `{ // keep thin leaves from thinning out with the mip level, then cut at 0.5
          vec2 tsz = vec2(textureSize(map, 0)); vec2 dx = dFdx(vMapUv * tsz), dy = dFdy(vMapUv * tsz);
          float mip = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
          diffuseColor.a *= 1.0 + mip * 0.25;
          if (diffuseColor.a < 0.5) discard;
          diffuseColor.a = 1.0;
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { vec3 Ls = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz), V = normalize(vViewPosition);
          float back = max(dot(-normal, Ls), 0.0), thru = pow(max(dot(-V, Ls), 0.0), 4.0);
          reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * (back * 0.22 + thru * 0.5) * vec3(1.0, 1.06, 0.62) * RECIPROCAL_PI; }`);
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'nearveg2' + sway + (leaf ? 'leaf' : '');
}

// ---------------------------------------------------------------- the renderer
export class Vegetation {
  constructor(THREE, lib, scene, U, opts = {}) {
    this.THREE = THREE; this.lib = lib; this.scene = scene; this.U = U;
    this.opts = Object.assign({ cell: 64, nearShadows: true }, opts);
    this.inst = new Map(); // species -> { x: [], y, z, rot, s, v, tr, tg, tb }
    this.near = new Map(); // `${species}/${variant}` -> InstancedMesh
    this.grid = new Map(); // cell -> [species index, instance index, ...]
    this.last = { x: 1e9, z: 1e9, t: -1e9 };
  }
  add(species, x, y, z, rot, s, variant, tint) {
    if (!this.lib.species.has(species)) return false;
    let a = this.inst.get(species);
    if (!a) { a = { x: [], y: [], z: [], rot: [], s: [], v: [], t: [] }; this.inst.set(species, a); }
    a.x.push(x); a.y.push(y); a.z.push(z); a.rot.push(rot); a.s.push(s); a.v.push(variant); a.t.push(tint[0], tint[1], tint[2]);
    return true;
  }
  // knock one plant out (a car drove through it): scale 0 in the impostors and the near meshes. Returns its size.
  hide(species, i) {
    const a = this.inst.get(species); if (!a || a.s[i] === 0) return null;
    const sp = this.lib.species.get(species), V = sp.variants[a.v[i]] || sp.variants[0], out = { h: V.height * a.s[i], w: V.width * a.s[i] };
    a.s[i] = 0;
    const m = this.meshes && this.meshes.get(species); if (m) { const at = m.geometry.attributes.iSV; at.array[i * 2] = 0; at.needsUpdate = true; }
    this.last.t = 1e9; // re-gather the near meshes next frame
    return out;
  }
  // one plant as a standalone object at the origin (its own near mesh: same model, materials, size, turn and tint), so a
  // tree a car knocks over falls as the tree you saw. Call before hide(). null when the species has no near mesh.
  standalone(species, i) {
    const a = this.inst.get(species); if (!a || !a.s[i] || !this.order) return null;
    const im = this.near.get(`${this.order.indexOf(species)}/${a.v[i]}`); if (!im) return null;
    const { THREE } = this, one = new THREE.InstancedMesh(im.geometry, im.material, 1); // same shader path as the near meshes
    one.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a.rot[i]), new THREE.Vector3().setScalar(a.s[i])));
    one.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array([a.t[i * 3], a.t[i * 3 + 1], a.t[i * 3 + 2]]), 3);
    one.castShadow = im.castShadow; one.receiveShadow = true; one.frustumCulled = false; one.name = 'fallen:' + species;
    return one;
  }
  count() { let n = 0; for (const a of this.inst.values()) n += a.x.length; return n; }
  build() {
    const { THREE } = this; const quad = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
    let si = 0; this.order = [];
    for (const [name, a] of this.inst) {
      const sp = this.lib.species.get(name), n = a.x.length; this.order.push(name);
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(quad, 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
      const P = new Float32Array(n * 4), SV = new Float32Array(n * 2), T = new Float32Array(a.t);
      for (let i = 0; i < n; i++) { P[i * 4] = a.x[i]; P[i * 4 + 1] = a.y[i]; P[i * 4 + 2] = a.z[i]; P[i * 4 + 3] = a.rot[i]; SV[i * 2] = a.s[i]; SV[i * 2 + 1] = a.v[i]; }
      g.setAttribute('iPos', new THREE.InstancedBufferAttribute(P, 4)); g.setAttribute('iSV', new THREE.InstancedBufferAttribute(SV, 2));
      g.setAttribute('iTint', new THREE.InstancedBufferAttribute(T, 3)); g.instanceCount = n;
      const mesh = new THREE.Mesh(g, impostorMaterial(THREE, sp, this.U)); mesh.frustumCulled = false; mesh.renderOrder = 1;
      (this.meshes || (this.meshes = new Map())).set(name, mesh);
      mesh.name = 'impostors:' + name; this.scene.add(mesh);
      // spatial grid for the near-LOD gather
      const C = this.opts.cell;
      for (let i = 0; i < n; i++) { const k = Math.floor(a.x[i] / C) * 100000 + Math.floor(a.z[i] / C); let c = this.grid.get(k); if (!c) this.grid.set(k, c = []); c.push(si, i); }
      // near meshes, one InstancedMesh per variant with a LOD
      sp.lods.forEach((lod, v) => {
        if (!lod) return;
        const mats = lod.mats.map(m0 => {
          const leaf = !!m0.map && (m0.transparent || m0.alphaTest > 0); // the leaf cards (their texture has alpha)
          const m = m0.clone(); m.vertexColors = true; m.side = THREE.DoubleSide; m.roughness = leaf ? 0.75 : 0.92; m.metalness = 0;
          m.transparent = false; m.alphaTest = leaf ? 0.5 : 0; m.depthWrite = true; m.envMapIntensity = 0.4; m.normalMap = null;
          patchNear(m, this.U, sp.sway ?? 0.012, leaf); return m;
        });
        const im = new THREE.InstancedMesh(lod.geo, mats, 64); im.count = 0; im.frustumCulled = false;
        im.castShadow = this.opts.nearShadows; im.receiveShadow = true; im.name = `near:${name}/${v}`;
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3);
        this.scene.add(im); this.near.set(`${si}/${v}`, im);
      });
      si++;
    }
  }
  // gather plants within the near radius into the near InstancedMeshes (cheap; runs when the camera moved)
  updateNear(cx, cz) {
    const { THREE } = this, R = this.U.uNear.value + this.U.uBand.value + 2, C = this.opts.cell, R2 = R * R;
    const lists = new Map();
    for (let gx = Math.floor((cx - R) / C); gx <= Math.floor((cx + R) / C); gx++)
      for (let gz = Math.floor((cz - R) / C); gz <= Math.floor((cz + R) / C); gz++) {
        const c = this.grid.get(gx * 100000 + gz); if (!c) continue;
        for (let k = 0; k < c.length; k += 2) {
          const si = c[k], i = c[k + 1], a = this.inst.get(this.order[si]);
          const dx = a.x[i] - cx, dz = a.z[i] - cz; if (dx * dx + dz * dz > R2) continue;
          const key = `${si}/${a.v[i]}`; if (!this.near.has(key)) continue;
          let l = lists.get(key); if (!l) lists.set(key, l = []); l.push(i);
        }
      }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [key, im] of this.near) {
      const l = lists.get(key) || [];
      if (l.length > im.instanceMatrix.count) { // grow
        const cap = Math.ceil(l.length * 1.5); const old = im;
        const nim = new THREE.InstancedMesh(old.geometry, old.material, cap); nim.frustumCulled = false; nim.castShadow = old.castShadow; nim.receiveShadow = true; nim.name = old.name;
        nim.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        this.scene.remove(old); this.scene.add(nim); this.near.set(key, nim); old.dispose?.();
      }
      const m = this.near.get(key), a = this.inst.get(this.order[+key.split('/')[0]]);
      l.forEach((i, j) => {
        q.setFromAxisAngle(up, a.rot[i]); m4.compose(v.set(a.x[i], a.y[i], a.z[i]), q, s.setScalar(a.s[i])); m.setMatrixAt(j, m4);
        m.instanceColor.setXYZ(j, a.t[i * 3], a.t[i * 3 + 1], a.t[i * 3 + 2]);
      });
      m.count = l.length; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
    }
  }
  update(dt, camera, sun, hemi) {
    const U = this.U; U.uTime.value += dt;
    { // wind comes in gusts: a slow swell (incommensurate sines), the trees lean harder and the grass waves run faster
      const t = U.uTime.value, g = Math.max(0, Math.min(1, 0.5 + 0.28 * Math.sin(t * 0.31) + 0.18 * Math.sin(t * 0.73 + 1.3) + 0.12 * Math.sin(t * 1.91 + 0.4)));
      U.uGust.value = g; U.uWind.value = U.uWindBase.value * (0.6 + 0.7 * g);
    }
    U.uSunDir.value.subVectors(sun.position, sun.target.position).normalize();
    U.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
    U.uSky.value.copy(hemi.color).multiplyScalar(hemi.intensity); U.uGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity);
    const p = camera.position, L = this.last; L.t += dt;
    if (Math.hypot(p.x - L.x, p.z - L.z) > 6 || L.t > 2) { this.updateNear(p.x, p.z); L.x = p.x; L.z = p.z; L.t = 0; }
  }
}
