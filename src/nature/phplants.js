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

// a scanned grass clump seen from the side, as a ground-cover card (ImageData, RGBA, transparent background): the
// clump is framed to the card, bottom-centred, so the card's foot is the clump's root
export async function grassCard(THREE, gltfLoader, renderer, id, W = 512, H = 256, base = 'assets/nature/polyhaven/') {
  const g = await gltfLoader.loadAsync(`${base}${id}/${id}_1k.gltf`).catch(() => null); if (!g) return null;
  const root = g.scene; root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), sx = box.max.x - box.min.x, sy = box.max.y - box.min.y, cx = (box.min.x + box.max.x) / 2;
  const half = Math.max(sx / 2, sy * W / H / 2) * 1.02, cam = new THREE.OrthographicCamera(cx - half, cx + half, box.min.y + half * 2 * H / W, box.min.y, -100, 100);
  cam.position.set(0, 0, 50); cam.lookAt(0, 0, 0);
  const scene = new THREE.Scene(); scene.add(root);
  root.traverse(o => { if (o.isMesh) { const m = o.material; o.material = new THREE.MeshBasicMaterial({ map: m.map, alphaTest: 0.5, side: THREE.DoubleSide }); } });
  const rt = new THREE.WebGLRenderTarget(W, H), prev = { rt: renderer.getRenderTarget(), col: renderer.getClearColor(new THREE.Color()), a: renderer.getClearAlpha() };
  renderer.setRenderTarget(rt); renderer.setClearColor(new THREE.Color(0, 0, 0), 0); renderer.clear(); renderer.render(scene, cam);
  const px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  renderer.setRenderTarget(prev.rt); renderer.setClearColor(prev.col, prev.a); rt.dispose();
  const out = new ImageData(W, H); for (let y = 0; y < H; y++) out.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // GL rows run bottom up
  return out;
}
