// Granite boulders where the real ones are. Poway's hills are studded with weathered granite: single boulders, piles
// and big slabs (Mt. Woodson, Iron Mountain, the ridges above Lake Poway). tools/nature/detect_boulders.py found them in
// the aerial photo (data/boulders.js: lat, lon, size, confidence); here the scanned boulders (assets/nature/rocks, their
// detailed level) are baked into impostors like the trees (src/nature/proctrees.js speciesFrom), so tens of thousands of
// rocks cost a few draws, with the real meshes up close.
//   const lib2 = await loadRocks(THREE, gltfLoader, renderer)        -> Map('boulder' -> species)
//   const list = await loadBoulders()                                 -> [[lat, lon, size, confidence], ...]
import { speciesFrom } from './proctrees.js';

export async function loadRocks(THREE, gltfLoader, renderer, base = 'assets/nature/rocks/') {
  const files = ['b02', 'b03', 'b04', 'b05', 'b06'];
  const list = (await Promise.all(files.map(f => gltfLoader.loadAsync(base + f + '.glb').catch(() => null)))).filter(Boolean).map(g => {
    let best = null; g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => { if (o.isMesh && (!best || o.geometry.attributes.position.count > best.geometry.attributes.position.count)) best = o; }); // the detailed level
    if (!best) return null;
    const geo = best.geometry.clone(); geo.applyMatrix4(best.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    geo.computeBoundingBox(); const b = geo.boundingBox; geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); // standing on y = 0, centred
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const n = geo.attributes.position.count; geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    geo.clearGroups(); geo.addGroup(0, geo.index ? geo.index.count : n, 0); geo.computeBoundingBox(); geo.computeBoundingSphere();
    const src = best.material, mat = new THREE.MeshStandardMaterial({ map: src.map || null, normalMap: src.normalMap || null, roughness: 0.92, metalness: 0 });
    return { geo, mats: [mat] };
  }).filter(Boolean);
  if (!list.length) return new Map();
  return speciesFrom(THREE, renderer, { boulder: { trans: 0, sway: 0, list } }, { cell: 96, clear: [0.45, 0.42, 0.38] });
}

export async function loadBoulders(url = 'data/boulders.js') {
  const t = await (await fetch(url)).text();
  const a = t.indexOf('[', t.indexOf('=')), b = t.lastIndexOf(']'); // the array after the assignment (the header comment has brackets too)
  return JSON.parse(t.slice(a, b + 1).replace(/,\s*\]$/, ']'));
}
