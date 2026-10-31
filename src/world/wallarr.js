// Wall materials in one texture array, so a building can be clad in any of them and every wall in a chunk is still one
// mesh and one draw call. The layers are the scanned sets the game already ships (assets/pbr: Poly Haven, CC0) and the
// generated material library (assets/mat, tools/matpack: nothing to credit): smooth, sand, lace and aged stucco, plaster,
// lap siding, board-and-batten, shiplap, red, tan and painted brick, painted and split-face block, ledgestone, river rock,
// tilt-up and smooth concrete, corrugated metal, cedar, garage-door panels. Two arrays: colour (sRGB) and detail (normal
// x, y, roughness, ambient occlusion). The facade shader (src/world/surfaces.js) picks the layer per vertex (aWL).
//   const WA = await createWallArray(THREE, { size: 512, aniso })   WA.id('stucco_lace') -> layer
//   WA.A, WA.N (DataArrayTextures)   WA.inv[layer] (1 / metres per repeat)   WA.mean[layer] (mean linear luminance)
//   WA.paint[layer] (1: painted, the wall colour is the colour and the layer only adds relief; 0: natural, keeps its own)
const SCANS = [ // name, file stem in assets/pbr, metres per repeat, painted
  ['stucco', 'stucco', 2.6, 1], ['stucco_rough', 'stucco_rough', 2.2, 1], ['tiltup', 'tiltup', 3.5, 1], ['brick', 'brick', 2.4, 0],
  ['brick_painted', 'brick_painted', 2.4, 1], ['siding_weathered', 'siding', 2.0, 0], ['metal_wall', 'metal_wall', 2.0, 1],
];
const GEN = { // the library's layers used on walls (assets/mat/manifest.json), painted or not
  stucco_fine: 1, stucco_sand: 1, stucco_lace: 1, stucco_aged: 1, plaster_smooth: 1, siding_lap: 1, siding_board_batten: 1,
  siding_shiplap_wood: 0, brick_tan: 0, brick_painted_white: 1, cmu_painted: 1, cmu_split_face: 0, stone_ledgestone: 0,
  stone_river_rock: 0, concrete_panel: 1, concrete_smooth: 1, metal_corrugated: 1, wood_fence_cedar: 0, trim_paint: 1,
  garage_door_panels: 1, metal_galvanized: 0, solar_panel: 0,
};
const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });

async function pixels(url, size, cell) { // an image (or one cell of a 4 x 4 sheet) as size x size RGBA bytes
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  if (cell) { const w = bmp.width / 4, h = bmp.height / 4; g.drawImage(bmp, cell[0] * w, cell[1] * h, w, h, 0, 0, size, size); }
  else g.drawImage(bmp, 0, 0, size, size);
  bmp.close(); return g.getImageData(0, 0, size, size).data;
}

export async function createWallArray(THREE, { size = 512, aniso = 8, pbr = 'assets/pbr/', mat = 'assets/mat/' } = {}) {
  const manifest = await (await fetch(mat + 'manifest.json')).json();
  const gen = manifest.layers.map((l, i) => ({ ...l, i })).filter(l => l.id in GEN);
  const n = SCANS.length + gen.length, px = size * size * 4;
  const A = new Uint8Array(n * px), N = new Uint8Array(n * px), inv = new Float32Array(64), mean = new Float32Array(64), paint = new Float32Array(64), ids = new Map();
  const put = (k, name, tile, painted, alb, nrm, arm) => {
    A.set(alb, k * px); ids.set(name, k); inv[k] = 1 / tile; paint[k] = painted;
    const o = k * px; let s = 0, m = 0;
    for (let i = 0; i < px; i += 4) {
      N[o + i] = nrm[i]; N[o + i + 1] = nrm[i + 1]; N[o + i + 2] = arm ? arm[i + 1] : nrm[i + 2]; N[o + i + 3] = arm ? arm[i] : 255;
      if ((i & 60) === 0) { s += 0.2126 * LIN[alb[i]] + 0.7152 * LIN[alb[i + 1]] + 0.0722 * LIN[alb[i + 2]]; m++; }
    }
    mean[k] = Math.max(0.03, s / m);
  };
  let k = 0;
  await Promise.all(SCANS.map(async ([name, stem, tile, painted], j) => {
    const [c, nn, arm] = await Promise.all(['c', 'n', 'arm'].map(t => pixels(`${pbr}${stem}_${t}.webp`, size)));
    put(j, name, tile, painted, c, nn, arm);
  }));
  k = SCANS.length;
  const sheetCell = i => [i % 4, Math.floor(i / 4) % 4], sheetOf = i => Math.floor(i / 16), ms = manifest.sizes.albedo.includes(size) ? size : manifest.sizes.albedo[0];
  for (const l of gen) {
    const [c, nr] = await Promise.all([pixels(`${mat}${ms}/albedo${sheetOf(l.i)}.webp`, size, sheetCell(l.i)), pixels(`${mat}512/nr${sheetOf(l.i)}.webp`, size, sheetCell(l.i))]);
    put(k++, l.id, l.tile, GEN[l.id], c, nr, null);
  }
  const tex = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, size, size, n);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.onUpdate = () => { t.image.data = null; t.onUpdate = null; }; // the copy on the graphics card is all that's needed
    t.needsUpdate = true; return t;
  };
  return { A: tex(A, true), N: tex(N, false), inv, mean, paint, ids, count: n, id: name => ids.get(name) ?? 0 };
}
