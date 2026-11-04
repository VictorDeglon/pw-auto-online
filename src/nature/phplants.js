// Scanned plants and stones from Poly Haven (assets/nature/polyhaven, CC0): garden shrubs for the house fronts, a
// fine-leaved wild bush that reads as California buckwheat and sage among the chaparral, ice plant for the banks along
// the freeways, stones and pebble scatters for the bare dirt, and dead branches under the oaks. Each model is merged
// into one geometry (a material group per part, standing on y = 0, centred) and baked into impostors with the grown
// trees' baker (src/nature/proctrees.js speciesFrom), so thousands of them cost a handful of instanced draws.
//   const lib3 = await loadPHPlants(THREE, gltfLoader, renderer)   -> Map(name -> species): shrub, bush, iceplant,
//                                                                    pebbles, stone, branches
import { speciesFrom } from './proctrees.js';

const SETS = {
  shrub: { ids: ['shrub_02', 'shrub_03', 'shrub_04'], trans: 0.2, sway: 0.01 },
  bush: { ids: ['wild_rooibos_bush'], trans: 0.25, sway: 0.014 },
  iceplant: { ids: ['crystalline_iceplant'], trans: 0.1, sway: 0 },
  pebbles: { ids: ['namaqualand_stones_01'], trans: 0, sway: 0 },
  stone: { ids: ['stone_01', 'rock_07'], trans: 0, sway: 0 },
  branches: { ids: ['dry_branches_medium_01'], trans: 0, sway: 0 },
};

function mergeScene(THREE, root) {
  root.updateMatrixWorld(true);
  const parts = [], mats = [], matIdx = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const geo = g.index ? g.toNonIndexed() : g;
    const src = Array.isArray(o.material) ? o.material[0] : o.material; let mi = matIdx.get(src);
    if (mi === undefined) {
      const cut = src.alphaTest > 0 || src.transparent;
      mats.push(new THREE.MeshStandardMaterial({ map: src.map || null, normalMap: src.normalMap || null, roughness: 0.9, metalness: 0, alphaTest: cut ? 0.5 : 0, side: cut ? THREE.DoubleSide : THREE.FrontSide }));
      mi = mats.length - 1; matIdx.set(src, mi);
    }
    parts.push([geo, mi]);
  });
  if (!parts.length) return null;
  parts.sort((a, b) => a[1] - b[1]);
  let n = 0; for (const [g] of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1), geo = new THREE.BufferGeometry();
  let o = 0, start = 0, cur = parts[0][1];
  for (const [g, mi] of parts) {
    if (mi !== cur) { geo.addGroup(start, o - start, cur); start = o; cur = mi; }
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count;
  }
  geo.addGroup(start, o - start, cur);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingBox(); const b = geo.boundingBox; geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); geo.computeBoundingBox(); geo.computeBoundingSphere();
  return { geo, mats };
}

export async function loadPHPlants(THREE, gltfLoader, renderer, base = 'assets/nature/polyhaven/') {
  const S = {};
  await Promise.all(Object.entries(SETS).map(async ([name, set]) => {
    const list = (await Promise.all(set.ids.map(id => gltfLoader.loadAsync(`${base}${id}/${id}_1k.gltf`).then(g => mergeScene(THREE, g.scene)).catch(e => { console.warn('[polyhaven]', id, e); return null; })))).filter(Boolean);
    if (list.length) S[name] = { trans: set.trans, sway: set.sway, list };
  }));
  if (!Object.keys(S).length) return new Map();
  return speciesFrom(THREE, renderer, S, { cell: 128 });
}

// a tuft of scanned grass seen from the side, as a ground-cover card (ImageData, RGBA, transparent background). The
// model is a row of separate small clumps, so they are gathered into one dense tuft (side by side and behind each other,
// taller in the middle, all scaled to the card's height) and rendered with sRGB output; the card's foot is the root.
export async function grassCard(THREE, gltfLoader, renderer, id, W = 512, H = 256, base = 'assets/nature/polyhaven/', n = 34) { // id: one model, or several whose clumps mix in the tuft
  const gs = (await Promise.all([].concat(id).map(k => gltfLoader.loadAsync(`${base}${k}/${k}_1k.gltf`).catch(() => null)))).filter(Boolean); if (!gs.length) return null;
  const clumps = []; for (const g of gs) { const root = g.scene; root.updateMatrixWorld(true); root.traverse(o => { if (!o.isMesh) return; const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); geo.computeBoundingBox(); const b = geo.boundingBox;
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); const m = Array.isArray(o.material) ? o.material[0] : o.material;
    clumps.push({ geo, h: Math.max(0.02, b.max.y - b.min.y), mat: new THREE.MeshBasicMaterial({ map: m.map, alphaTest: 0.5, side: THREE.DoubleSide }) }); }); }
  if (!clumps.length) return null;
  const scene = new THREE.Scene(), aspect = W / H; let a = 77; const r = () => (a = (a * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < n; k++) { // the card spans x -aspect/2..aspect/2, y 0..1
    const c = clumps[Math.floor(r() * clumps.length)], u = (r() * 2 - 1) * 0.92, ht = (0.55 + 0.45 * r()) * (1 - 0.45 * u * u);
    const m = new THREE.Mesh(c.geo, c.mat); m.scale.setScalar(ht / c.h); m.position.set(u * aspect / 2 * 0.86, 0, -r() * 2); m.rotation.y = r() * Math.PI * 2; scene.add(m);
  }
  const cam = new THREE.OrthographicCamera(-aspect / 2, aspect / 2, 1.02, 0, -10, 10); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0);
  const rt = new THREE.WebGLRenderTarget(W, H); rt.texture.colorSpace = THREE.SRGBColorSpace; // the bytes read back are sRGB, as the card textures expect
  const prev = { rt: renderer.getRenderTarget(), col: renderer.getClearColor(new THREE.Color()), a: renderer.getClearAlpha() };
  renderer.setRenderTarget(rt); renderer.setClearColor(new THREE.Color(0, 0, 0), 0); renderer.clear(); renderer.render(scene, cam);
  const px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  renderer.setRenderTarget(prev.rt); renderer.setClearColor(prev.col, prev.a); rt.dispose(); for (const c of clumps) { c.geo.dispose(); c.mat.dispose(); }
  const out = new ImageData(W, H); for (let y = 0; y < H; y++) out.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // GL rows run bottom up
  let lit = 0; for (let i = 3; i < out.data.length; i += 4) if (out.data[i] >= 128) lit++;
  return lit > W * H * 0.08 ? out : null; // a card that came out (nearly) empty is no card: the drawn one stands in
}
