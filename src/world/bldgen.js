// Buildings from their footprints. A footprint says a lot about what stands on it: a tract house is 150-350 m² with
// square corners and a wing or two; a detached garage is a 6 x 7 m box; a strip mall is long and 12-25 m deep; a big
// box fills its bounding rectangle and is huge; a garden-apartment block is long, two or three storeys and pitched.
// shapeOf reads the shape (area, the minimum bounding rectangle, how much of it the footprint fills, how square the
// corners are, how convex, how many corners); contextIndex reads what's round it (how built-up, a parking lot, school
// grounds or a park, a mapped shop, restaurant, bank or fire station at its door); planBuilding turns those, with the
// map's kind, height and roof colour, the street it faces, the zone (src/world/zones.js) and the neighbourhood's own
// look (src/world/regions.js: tract stucco, Spanish revival, ranch, modern, beach cottage, bungalow), into a plan: a
// type, its storeys, a roof form fitted to the footprint (src/world/roofs.js), its materials and its details (awnings
// over shop fronts, a tile mansard, a raised entrance parapet, floor bands, a cornice, a chimney, garage doors to the
// street, rooftop units, dishes, turbine vents). Everything comes from a hash of where the building stands, so every
// player sees the same town.
//   shapeOf(flat) -> { A, P, n, L, W, ang, aspect, fill, convex, ortho, reflex }
//   contextIndex(flats, areas, pois).at(x, z, S, flat) -> { near, meanA, parking, school, park, poi }
//   planBuilding(S, o) -> plan (o and the plan: see planBuilding)
//   rnd(x, z, salt) -> a seeded random stream for the building at (x, z)
//   wallFrames, awnings, bands, cornice, chimney, raisedFront: detail geometry for index.html's genBuilding

export const TYPE = { house: 'house', garage: 'garage', shed: 'shed', row: 'row', apartment: 'apartment', shop: 'shop', strip: 'strip',
  bigbox: 'bigbox', warehouse: 'warehouse', office: 'office', civic: 'civic', hall: 'hall' };
// the facade shader's styles (src/world/surfaces.js): 0 house, 1 shop, 2 big box, 3 office, 4 shed, 5 apartment, 6 garage, 7 row
const FAC = { house: 0, garage: 6, shed: 4, row: 7, apartment: 5, shop: 1, strip: 1, bigbox: 2, warehouse: 2, office: 3, civic: 3, hall: 5 };

export function hashXZ(x, z, salt = 0) {
  let h = Math.imul(Math.round(x * 10) | 0, 73856093) ^ Math.imul(Math.round(z * 10) | 0, 19349663) ^ Math.imul(salt + 1, 83492791);
  h = Math.imul(h ^ h >>> 16, 0x45d9f3b); h = Math.imul(h ^ h >>> 16, 0x45d9f3b); return (h ^ h >>> 16) >>> 0;
}
export function rnd(x, z, salt = 0) {
  let a = hashXZ(x, z, salt);
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- reading the shape
export function shapeOf(flat) {
  // the outline without repeated points and without corners that are really straight (traced footprints wobble)
  let P = [];
  const n0 = flat.length / 2;
  for (let i = 0; i < n0; i++) { const x = flat[i * 2], z = flat[i * 2 + 1], q = P.length; if (q && Math.hypot(x - P[q - 2], z - P[q - 1]) < 0.15) continue; P.push(x, z); }
  if (P.length >= 4 && Math.hypot(P[0] - P[P.length - 2], P[1] - P[P.length - 1]) < 0.15) P.length -= 2;
  for (let pass = 0; pass < 2; pass++) {
    const Q = [], n = P.length / 2;
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, c = (i + 1) % n, ax = P[i * 2] - P[a * 2], az = P[i * 2 + 1] - P[a * 2 + 1], bx = P[c * 2] - P[i * 2], bz = P[c * 2 + 1] - P[i * 2 + 1];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), s = (ax * bz - az * bx) / (la * lb || 1), d = (ax * bx + az * bz) / (la * lb || 1);
      if (n - Q.length / 2 > 3 && d > 0 && Math.abs(s) < 0.16) continue; // under ~9 degrees off straight
      Q.push(P[i * 2], P[i * 2 + 1]);
    }
    P = Q.length >= 6 ? Q : P;
  }
  const n = P.length / 2;
  let A2 = 0, per = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; A2 += P[i * 2] * P[j * 2 + 1] - P[j * 2] * P[i * 2 + 1]; per += Math.hypot(P[j * 2] - P[i * 2], P[j * 2 + 1] - P[i * 2 + 1]); }
  const A = Math.abs(A2) / 2, sg = A2 >= 0 ? 1 : -1;
  // convex hull (monotone chain) and the smallest rectangle round it (one side lies along a hull edge)
  const pts = []; for (let i = 0; i < n; i++) pts.push([P[i * 2], P[i * 2 + 1]]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const H = lo.slice(0, -1).concat(hi.slice(0, -1));
  let hA = 0; for (let i = 0; i < H.length; i++) { const j = (i + 1) % H.length; hA += H[i][0] * H[j][1] - H[j][0] * H[i][1]; } hA = Math.abs(hA) / 2;
  let best = { area: Infinity, L: 1, W: 1, ang: 0, cx: 0, cz: 0 };
  for (let i = 0; i < H.length; i++) {
    const j = (i + 1) % H.length, dx = H[j][0] - H[i][0], dz = H[j][1] - H[i][1], l = Math.hypot(dx, dz); if (l < 1e-6) continue;
    const ux = dx / l, uz = dz / l; let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of H) { const u = p[0] * ux + p[1] * uz, v = -p[0] * uz + p[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const a = (u1 - u0) * (v1 - v0);
    if (a < best.area) {
      const um = (u0 + u1) / 2, vm = (v0 + v1) / 2, long = u1 - u0 >= v1 - v0;
      best = { area: a, L: Math.max(u1 - u0, v1 - v0), W: Math.min(u1 - u0, v1 - v0), ang: long ? Math.atan2(uz, ux) : Math.atan2(ux, -uz), cx: um * ux - vm * uz, cz: um * uz + vm * ux };
    }
  }
  // corners: square ones (90 or 270 degrees) and reflex ones (the notches of an L, T or U)
  let sq = 0, reflex = 0;
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, c = (i + 1) % n, ax = P[i * 2] - P[a * 2], az = P[i * 2 + 1] - P[a * 2 + 1], bx = P[c * 2] - P[i * 2], bz = P[c * 2 + 1] - P[i * 2 + 1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), d = (ax * bx + az * bz) / (la * lb || 1), s = (ax * bz - az * bx) * sg;
    if (Math.abs(d) < 0.21) sq++;
    if (s < 0) reflex++;
  }
  return { A, P: per, n, L: best.L, W: best.W, ang: best.ang, cx: best.cx, cz: best.cz, aspect: best.L / Math.max(best.W, 0.5),
    fill: A / Math.max(best.area, 1e-3), convex: A / Math.max(hA, 1e-3), ortho: sq / n, reflex };
}

// ---------------------------------------------------------------- where it stands
// What's round each building, read from whole lists at once (a tile's, or the core's), so the answer never depends on
// what happens to be loaded or in what order: how built-up it is (buildings within 60 m and their size), whether it
// sits by a parking lot, on school grounds or in a park (OpenStreetMap areas: 1 park, 2 parking, 3 school), and the
// mapped place inside or at its door (POIs: shop, restaurant, fast_food, cafe, bank, fuel, school, fire_station, ...).
//   contextIndex(flats, areas [[kind, flat]], pois [[type, x, z]]) -> { at(x, z, S, flat) -> ctx }
const CG = 64;
export function contextIndex(flats, areas = [], pois = []) {
  const bg = new Map(), ag = new Map(), pg = new Map(), key = (i, j) => i * 100003 + j;
  const put = (g, x, z, v) => { const k = key(Math.floor(x / CG), Math.floor(z / CG)); let c = g.get(k); if (!c) g.set(k, c = []); c.push(v); };
  for (const f of flats) {
    let x = 0, z = 0, a = 0; const n = f.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) { x += f[i * 2]; z += f[i * 2 + 1]; a += (f[j * 2] + f[i * 2]) * (f[j * 2 + 1] - f[i * 2 + 1]); }
    put(bg, x / n, z / n, [x / n, z / n, Math.abs(a) / 2]);
  }
  for (const [k, f] of areas) {
    if (k < 1 || k > 3 || f.length < 6) continue; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let i = 0; i < f.length; i += 2) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1]); }
    const A = { k, f }; for (let i = Math.floor(x0 / CG); i <= Math.floor(x1 / CG); i++) for (let j = Math.floor(z0 / CG); j <= Math.floor(z1 / CG); j++) { const kk = key(i, j); let c = ag.get(kk); if (!c) ag.set(kk, c = []); c.push(A); }
  }
  for (const [t, x, z] of pois) put(pg, x, z, [t, x, z]);
  const cells = (g, x, z, r, fn) => { for (let i = Math.floor((x - r) / CG); i <= Math.floor((x + r) / CG); i++) for (let j = Math.floor((z - r) / CG); j <= Math.floor((z + r) / CG); j++) { const c = g.get(key(i, j)); if (c) for (const v of c) fn(v); } };
  const areaAt = (x, z) => { let k = 0; const c = ag.get(key(Math.floor(x / CG), Math.floor(z / CG))); if (c) for (const A of c) if (pipF(x, z, A.f)) k |= 1 << A.k; return k; };
  return {
    at(x, z, S, flat) {
      let n = 0, sa = 0; cells(bg, x, z, 60, b => { const d = Math.hypot(b[0] - x, b[1] - z); if (d > 0.5 && d < 60) { n++; sa += b[2]; } });
      // areas: under the middle, and just outside each side of its bounding rectangle
      const ux = Math.cos(S.ang), uz = Math.sin(S.ang), a = S.L / 2 + 9, b = S.W / 2 + 9;
      const under = areaAt(x, z); let by = 0;
      for (const [p, q] of [[a, 0], [-a, 0], [0, b], [0, -b]]) by |= areaAt(S.cx + ux * p - uz * q, S.cz + uz * p + ux * q);
      let poi = null, pd = 1e9; cells(pg, x, z, Math.max(S.L, 20), p => { const d = pipF(p[1], p[2], flat) ? 0 : Math.hypot(p[1] - x, p[2] - z) - S.L / 2; if (d < 8 && d < pd) { pd = d; poi = p[0]; } });
      return { near: n, meanA: n ? sa / n : 0, parking: !!(by & 4) || !!(under & 4), school: !!(under & 8), park: !!(under & 2), poi };
    },
  };
}
function pipF(x, z, f) { let ins = false; for (let a = 0, n = f.length / 2, b = n - 1; a < n; b = a++) { const xa = f[a * 2], za = f[a * 2 + 1], xb = f[b * 2], zb = f[b * 2 + 1]; if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) ins = !ins; } return ins; }

// ---------------------------------------------------------------- the local architecture
// How a house is built, by the look of where it is. Tract: the 70s-90s stucco tracts (concrete tile hips, some gables);
// Spanish: revival and Mediterranean (low clay hips and cross gables, short eaves, white and cream); ranch: low and wide
// (gables and hips, deep eaves, shingle or tile, tans); modern: flat or shed roofs over deep eaves (La Jolla, the beach,
// the hills); cottage: the beach towns' steep shingle gables; bungalow: the old city's small stucco houses.
const HSTYLE = {
  tract: { form: [['hip', 60], ['gable', 15], ['cross', 25]], mat: [['tile', 68], ['clay', 14], ['shingle', 18]], pitch: [0.36, 0.46], over: [0.45, 0.6], walls: 'tract' },
  spanish: { form: [['hip', 48], ['cross', 37], ['gable', 15]], mat: [['clay', 1]], pitch: [0.28, 0.36], over: [0.25, 0.4], walls: 'spanish' },
  ranch: { form: [['gable', 45], ['hip', 35], ['cross', 20]], mat: [['shingle', 52], ['tile', 36], ['metal', 12]], pitch: [0.27, 0.36], over: [0.6, 0.85], walls: 'ranch' },
  modern: { form: [['flat', 75], ['shed', 25]], mat: [['membrane', 1]], pitch: [0.08, 0.14], over: [0.7, 1.1], walls: 'modern' },
  cottage: { form: [['gable', 64], ['cross', 26], ['hip', 10]], mat: [['shingle', 85], ['tile', 15]], pitch: [0.5, 0.75], over: [0.3, 0.45], walls: 'coast' },
  bungalow: { form: [['gable', 42], ['hip', 38], ['flat', 20]], mat: [['shingle', 70], ['tile', 30]], pitch: [0.3, 0.42], over: [0.4, 0.6], walls: 'bungalow' },
};
// Poway by neighbourhood (src/world/regions.js), the county by zone (src/world/zones.js); strip: how its shops are fronted
const ARCH_REGION = {
  'old-poway': { house: [['ranch', 55], ['tract', 25], ['spanish', 20]], strip: [['metal', 35], ['canvas', 35], ['tile', 30]] },
  'town-center': { house: [['tract', 50], ['ranch', 30], ['spanish', 20]], strip: [['tile', 60], ['metal', 20], ['canvas', 20]] },
  'civic-center': { house: [['tract', 60], ['spanish', 25], ['ranch', 15]], civicClay: 0.8 },
  'starridge': { house: [['tract', 72], ['ranch', 18], ['spanish', 10]] },
  'silverset': { house: [['ranch', 60], ['tract', 30], ['spanish', 10]] },
  'twin-peaks': { house: [['tract', 65], ['ranch', 25], ['spanish', 10]] },
  'espola': { house: [['tract', 60], ['spanish', 25], ['ranch', 15]] },
  'lake-poway': { house: [['spanish', 40], ['ranch', 35], ['tract', 25]] },
  'green-valley': { house: [['spanish', 45], ['ranch', 40], ['tract', 10], ['modern', 5]] },
  'valle-verde': { house: [['spanish', 50], ['ranch', 35], ['tract', 15]] },
  'blue-sky': { house: [['ranch', 60], ['spanish', 40]] },
  'mt-woodson': { house: [['ranch', 55], ['spanish', 35], ['modern', 10]] },
};
const ARCH_ZONE = {
  rich: { house: [['spanish', 45], ['modern', 25], ['tract', 20], ['ranch', 10]], strip: [['canvas', 55], ['tile', 30], ['metal', 15]] },
  comfy: { house: [['tract', 48], ['spanish', 34], ['ranch', 18]] },
  suburb: { house: [['tract', 62], ['ranch', 24], ['spanish', 14]] },
  working: { house: [['bungalow', 48], ['tract', 34], ['ranch', 18]], strip: [['canvas', 40], ['metal', 40], ['tile', 20]] },
  beach: { house: [['cottage', 45], ['modern', 25], ['tract', 20], ['spanish', 10]], strip: [['canvas', 50], ['metal', 30], ['tile', 20]] },
  downtown: { house: [['modern', 40], ['bungalow', 30], ['spanish', 30]], strip: [['canvas', 60], ['metal', 35], ['tile', 5]] },
  rural: { house: [['ranch', 70], ['spanish', 15], ['tract', 15]], strip: [['metal', 50], ['canvas', 25], ['tile', 25]] },
};
const STRIP0 = [['tile', 42], ['metal', 30], ['canvas', 28]];

// ---------------------------------------------------------------- what it is
const pickW = (r, list) => { let t = 0; for (const [, w] of list) t += w; let x = r() * t; for (const [k, w] of list) { x -= w; if (x <= 0) return k; } return list[0][0]; };
const COMMERCE = new Set(['shop', 'restaurant', 'fast_food', 'cafe', 'bank', 'fuel']), CIVIC = new Set(['fire_station', 'post_office', 'library', 'police']);
//   o: { h, kind (0 house/yes, 1 commercial, 2 civic), retail (a mapped store), zone, region (id), x, z, ctx (contextIndex),
//        street ({ t: road type 0 motorway .. 4 residential, d: metres from the middle }), roofCol (roof:colour, or -1) }
export function planBuilding(S, o) {
  const r = rnd(o.x, o.z, 17), h = o.h, A = S.A, zone = o.zone || 'suburb', C = o.ctx || {}, st = o.street;
  const AR = ARCH_REGION[o.region] || {}, AZ = ARCH_ZONE[zone] || ARCH_ZONE.suburb;
  const wings = S.fill > 0.9 && S.reflex === 0 ? 1 : S.fill > 0.62 ? 2 : 3; // a rough count of the rectangles it is made of
  const arterial = !!(st && st.t >= 1 && st.t <= 2 && st.d < S.L / 2 + 30), sparse = C.near !== undefined && C.near <= 3, poi = C.poi;
  // what the map calls it, corrected by what's round it: an untagged footprint (most of Poway's come from Microsoft's
  // building outlines and say nothing) by a parking lot on a main road is a shop, not a house; one on school grounds is
  // a school; a mapped shop, restaurant or bank inside it says what it is
  let kind = o.kind;
  if (kind === 0 && (COMMERCE.has(poi) || (C.parking && A > 300 && h < 8.5 && (arterial || A > 900)) || (arterial && C.parking && A > 160) || (A > 520 && C.meanA > 900))) kind = 1; // (the last: a big one among big ones, a business park)
  if (kind !== 2 && (CIVIC.has(poi) || poi === 'school' || poi === 'hospital' || (C.school && A > 150))) kind = 2;
  let type, floors = 1, storey = 2.95;
  if (kind === 0) {
    // low ones: a shed, a garage (or a block of them), and most of all single-storey houses whose height was guessed low
    if (h <= 3.6) type = A < 22 || (A < 40 && S.aspect < 1.6) ? TYPE.shed : A < 110 || S.aspect >= 3.6 ? TYPE.garage : TYPE.house;
    else if (A < 30) type = TYPE.shed;
    else if (h >= 8.5 || A > 520) type = A > 260 && S.aspect > 2.8 && h < 12 ? TYPE.row : TYPE.apartment;
    else if (A > 230 && S.aspect > 3.2 && S.fill > 0.75) type = TYPE.row;
    else type = TYPE.house;
    if (C.park && type !== TYPE.shed && A < 400) type = TYPE.civic; // the rec building, the restrooms
  } else if (kind === 1) {
    if ((h === 10.5 || h === 13.5) && !C.parking && !COMMERCE.has(poi) && A < 4000) type = TYPE.apartment; // the county tiles' height for building=apartments (tools/world/build.py)
    else if (poi === 'hospital' || (h >= 10.5 && A < 6000 && !o.retail)) type = TYPE.office;
    else if (A >= 4500 || (A >= 2400 && S.fill > 0.86 && S.aspect < 2.6)) type = zone === 'downtown' ? TYPE.office : (S.aspect > 2.4 || S.fill < 0.8) && !C.parking ? TYPE.warehouse : TYPE.bigbox;
    else if (S.aspect >= 2.0 && S.W >= 9 && S.W <= 30 && A >= 220) type = TYPE.strip;
    else type = TYPE.shop;
  } else {
    if (h >= 13 || poi === 'hospital') type = TYPE.office;
    else if (!C.school && A >= 140 && A <= 1600 && S.aspect >= 1.5 && S.aspect <= 3.4 && S.fill > 0.82 && h > 5.5) type = TYPE.hall;
    else type = TYPE.civic;
  }
  // storeys
  if (type === TYPE.house) floors = h > 6.4 ? 2 : 1;
  else if (type === TYPE.row) floors = h >= 9 ? 3 : 2;
  else if (type === TYPE.apartment) { floors = Math.max(2, Math.min(7, Math.round((h - 0.6) / 2.9))); storey = 2.9; }
  else if (type === TYPE.office) { storey = 3.8; floors = Math.max(2, Math.min(7, Math.round(h / 3.8))); }
  else if (type === TYPE.shop || type === TYPE.strip) floors = h > 7.8 ? 2 : 1;
  else if (type === TYPE.civic) { storey = 4; floors = h > 8.4 ? 2 : 1; }
  // the local look: the neighbourhood's, else the zone's; big lots out of town lean Spanish and ranch
  let hs = pickW(r, AR.house || AZ.house);
  if (sparse && hs === 'tract' && r() < 0.5) hs = r() < 0.5 ? 'spanish' : 'ranch';
  const HS = HSTYLE[hs];
  // the roof
  let form = 'flat', mat = 'gravel', pitch = 0, over = 0, parapet = 0, eave = 0, gables = 'main';
  const span = (a) => a[0] + r() * (a[1] - a[0]);
  if (type === TYPE.house) {
    form = pickW(r, HS.form); mat = pickW(r, HS.mat); pitch = span(HS.pitch); over = span(HS.over);
    if (form === 'flat' && (A > 420 || S.ortho < 0.5)) { form = 'shed'; pitch = 0.12; }
    if (form === 'cross' && wings === 1) form = r() < 0.6 ? 'hip' : 'gable';
    if (form === 'gable' && wings > 1) form = 'cross';
    if (form === 'shed' && wings > 1 && S.fill < 0.8) form = 'flat';
    gables = form === 'gable' ? 'all' : form === 'cross' ? 'wings' : 'none';
    if (form === 'flat') { mat = 'membrane'; eave = over; } // a thin roof slab over deep eaves
    if (form === 'shed') mat = hs === 'modern' ? 'metal' : mat;
  } else if (type === TYPE.row || type === TYPE.apartment) {
    const tall = type === TYPE.apartment && (floors >= 4 || A > 3200);
    form = tall ? 'flat' : hs === 'modern' ? 'flat' : pickW(r, [['hip', 58], ['gable', 30], ['flat', 12]]);
    mat = form === 'flat' ? 'gravel' : hs === 'spanish' ? 'clay' : pickW(r, zone === 'beach' || zone === 'working' ? [['shingle', 50], ['tile', 35], ['clay', 15]] : [['tile', 55], ['clay', 30], ['shingle', 15]]);
    pitch = form === 'flat' ? 0 : mat === 'clay' ? 0.3 + r() * 0.06 : 0.32 + r() * 0.1; over = 0.45 + r() * 0.15; gables = form === 'gable' ? 'all' : 'none';
    if (form === 'flat') parapet = 0.9;
  } else if (type === TYPE.garage) {
    form = A < 30 ? 'shed' : pickW(r, [['gable', 52], ['hip', 34], ['shed', 14]]);
    mat = zone === 'rural' && r() < 0.5 ? 'metal' : pickW(r, HS.mat); if (mat === 'membrane') mat = 'shingle';
    pitch = form === 'shed' ? 0.16 + r() * 0.1 : 0.3 + r() * 0.12; over = 0.3 + r() * 0.15; gables = 'all';
  } else if (type === TYPE.shed) {
    form = A > 60 ? 'gable' : 'shed'; mat = zone === 'rural' || A > 60 ? 'metal' : 'shingle'; pitch = form === 'shed' ? 0.16 + r() * 0.1 : 0.3; over = 0.2; gables = 'all';
  } else if (type === TYPE.hall) {
    form = 'gable'; mat = pickW(r, [['clay', 40], ['shingle', 35], ['tile', 25]]); pitch = 0.62 + r() * 0.4; over = 0.4; gables = 'all';
  } else if (type === TYPE.civic) {
    const school = C.school || poi === 'school';
    if (!school && A < 2600 && S.fill > 0.7 && r() < (AR.civicClay ?? (CIVIC.has(poi) ? 0.75 : 0.45))) { form = 'hip'; mat = 'clay'; pitch = 0.3 + r() * 0.06; over = 0.9; gables = 'none'; } // Spanish civic: low clay hips over deep eaves
    else { form = 'flat'; mat = 'membrane'; eave = school || r() < 0.4 ? 1.6 + r() * 0.8 : 0; parapet = eave ? 0 : 0.9; } // a school's deep eaves over the walks, or a parapet
  } else { // commercial
    form = 'flat'; mat = type === TYPE.office || type === TYPE.bigbox || type === TYPE.warehouse ? 'gravel' : 'membrane';
    parapet = type === TYPE.bigbox ? 1.5 : type === TYPE.warehouse ? 1.1 : type === TYPE.office ? 1.0 : 0.9;
    const padHip = poi === 'bank' ? 0.8 : poi === 'fast_food' || poi === 'fuel' ? 0.1 : zone === 'downtown' ? 0.1 : 0.3;
    if (type === TYPE.shop && A < 900 && S.fill > 0.8 && r() < padHip) { form = 'hip'; mat = 'clay'; pitch = 0.32 + r() * 0.08; over = 0.7; parapet = 0; gables = 'none'; } // a pad with a tile hip roof
  }
  if (form !== 'flat' && S.ortho < 0.45 && !(form === 'hip' && S.convex > 0.95)) { form = 'flat'; parapet = type === TYPE.house ? 0 : 0.9; eave = type === TYPE.house ? 0.6 : 0; if (mat !== 'membrane') mat = 'membrane'; } // odd angles: no hip or gable fits, a flat roof does
  // details
  const front = type === TYPE.shop || type === TYPE.strip;
  let awning = null, mansard = 0, raised = 0, cornice = false, bands = false, chimney = false, units = 0, kit = { dish: false, turbine: false };
  if (front) {
    awning = pickW(r, AR.strip || AZ.strip || STRIP0);
    if (poi === 'restaurant' || poi === 'cafe') awning = r() < 0.75 ? 'canvas' : awning;
    if (poi === 'fuel') awning = 'metal';
    if (poi === 'fast_food' && type === TYPE.shop && form === 'flat') awning = r() < 0.6 ? 'tile' : 'metal';
    if (form !== 'flat' && awning === 'tile') awning = 'canvas';
    if (awning === 'tile') { mansard = 1.4 + r() * 0.5; awning = null; }
    raised = type === TYPE.strip && S.L > 40 && r() < 0.5 ? 1 : 0;
    cornice = !mansard && r() < 0.6;
  }
  if (type === TYPE.bigbox) { raised = 1; awning = 'entry'; }
  if (type === TYPE.office || (type === TYPE.apartment && form === 'flat')) { cornice = true; bands = true; }
  if (type === TYPE.civic && parapet) cornice = r() < 0.5;
  if (type === TYPE.row || (type === TYPE.apartment && form !== 'flat') || (type === TYPE.house && floors === 2)) bands = r() < 0.55;
  if (type === TYPE.house && form !== 'flat' && form !== 'shed') chimney = r() < (hs === 'ranch' || hs === 'spanish' ? 0.55 : hs === 'tract' ? 0.4 : 0.25);
  if (type === TYPE.row) chimney = r() < 0.25;
  if (form === 'flat' && !eave) units = type === TYPE.bigbox || type === TYPE.warehouse ? Math.min(18, Math.floor(A / 400)) : type === TYPE.house ? 0 : Math.min(10, Math.floor(A / 220) + 1);
  if (type === TYPE.house || type === TYPE.row) { kit.dish = r() < (zone === 'rural' ? 0.35 : zone === 'working' ? 0.3 : 0.14); kit.turbine = form !== 'flat' && r() < (zone === 'working' ? 0.35 : 0.18); }
  // the walls: painted stucco on homes (in the local look's colours); rough stucco or brick on shops; tilt-up concrete
  // on big boxes and warehouses
  const wall = type === TYPE.shop || type === TYPE.strip ? (r() < (zone === 'downtown' ? 0.35 : 0.12) ? 2 : 1) : type === TYPE.office ? 1 : type === TYPE.bigbox || type === TYPE.warehouse ? (r() < 0.75 ? 3 : 1) : type === TYPE.civic ? (r() < 0.4 ? 3 : 1) : 0;
  return {
    type, style: FAC[type], floors, storey, wings, wall, area: A, look: hs, walls: wall === 0 ? HS.walls : null, kind, poi,
    roof: { form, mat, pitch, over, parapet, eave, gables, col: o.roofCol >= 0 ? o.roofCol : -1 },
    awning, mansard, raised, cornice, bands, chimney, units, kit,
    seed: r(), r1: r(), r2: r(), r3: r(),
  };
}
// stucco by the local look (index.html picks one by the plan's r1)
export const WALLS = {
  tract: ['#f1e6cf', '#e7d6b7', '#efe2cb', '#dccfb8', '#d9c7ab', '#ece2d0', '#f0d7bd', '#e4dac6', '#d2c3a8', '#e9c9b0'],
  spanish: ['#f5efe3', '#fbf6ea', '#f2e8d5', '#efe2cb', '#f7ebd3', '#ece0c8', '#e9d8bd'],
  ranch: ['#d8c3a0', '#c9b08a', '#e3d2b4', '#b89f7c', '#d6c5a6', '#cbb79a', '#a88f6c', '#ddd2bd'],
  modern: ['#f4f3ef', '#ecebe6', '#d9d8d3', '#c6c5c0', '#e8e4dc', '#a9a8a3'],
  coast: ['#f4f3ef', '#e9ecea', '#dfe6e8', '#c9d6dc', '#eae4d6', '#d6dccf', '#f2ede2', '#bfcad0', '#e6e1d8'],
  bungalow: ['#efd9c0', '#e6d3a8', '#d8e0cc', '#e8cfc0', '#d9dfe3', '#f1e3b8', '#e2d0b6', '#cfd3c6'],
};

// ---------------------------------------------------------------- details
// a wall's frame: start (ax, az), along (tx, tz), out (ox, oz), length; outward from the polygon winding (as walls() does)
export function wallFrames(flat) {
  const n = flat.length / 2; let S = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; S += flat[i * 2] * flat[j * 2 + 1] - flat[j * 2] * flat[i * 2 + 1]; }
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = flat[i * 2], az = flat[i * 2 + 1], dx = flat[j * 2] - ax, dz = flat[j * 2 + 1] - az, len = Math.hypot(dx, dz);
    const tx = dx / (len || 1), tz = dz / (len || 1);
    out.push({ i, ax, az, tx, tz, ox: S > 0 ? tz : -tz, oz: S > 0 ? -tx : tx, len });
  }
  return out;
}
// storefront awnings over a shop's street walls, one per bay as the facade shader lays the bays out (7.2 m), or one
// continuous metal canopy. Returns quads [p0, p1, p2, p3, normal hint, uv size] in world space, y from ground g.
export function awnings(frames, roles, kind, g, r) {
  const Q = [], fr = (p0, p1, p2, p3, n, w, h) => Q.push([p0, p1, p2, p3, n, w, h]);
  let entry = null; if (kind === 'entry') for (const f of frames) if (roles[f.i] === 1 && f.len > 20 && (!entry || f.len > entry.len)) entry = f;
  for (const f of frames) {
    if (roles[f.i] !== 1 || f.len < 3.2) continue;
    const at = (u, d, y) => [f.ax + f.tx * u + f.ox * d, g + y, f.az + f.tz * u + f.oz * d];
    if (kind === 'entry') { // a big box's entrance canopy, centred on the doors the facade shader draws
      if (f !== entry) continue;
      const u0 = f.len / 2 - 7.5, u1 = f.len / 2 + 7.5, D = 4.2, y = 4.7, t = 0.75;
      fr(at(u0, 0.02, y), at(u1, 0.02, y), at(u1, D, y), at(u0, D, y), [0, 1, 0], u1 - u0, D);
      fr(at(u0, 0.02, y - 0.1), at(u0, D, y - 0.1), at(u1, D, y - 0.1), at(u1, 0.02, y - 0.1), [0, -1, 0], u1 - u0, D);
      fr(at(u0, D, y - t), at(u1, D, y - t), at(u1, D, y + 0.05), at(u0, D, y + 0.05), [f.ox, 0, f.oz], u1 - u0, t);
      for (const [u, s] of [[u0, -1], [u1, 1]]) fr(u > u0 ? at(u, D, y - t) : at(u, 0.02, y - t), u > u0 ? at(u, 0.02, y - t) : at(u, D, y - t), u > u0 ? at(u, 0.02, y + 0.05) : at(u, D, y + 0.05), u > u0 ? at(u, D, y + 0.05) : at(u, 0.02, y + 0.05), [f.tx * s, 0, f.tz * s], D, t);
      continue;
    }
    if (kind === 'metal') { // a flat canopy on the head of the storefronts, with a deep fascia
      const u0 = 0.15, u1 = f.len - 0.15, D = 1.9, y = 3.3, t = 0.32;
      fr(at(u0, 0.02, y), at(u1, 0.02, y), at(u1, D, y), at(u0, D, y), [0, 1, 0], f.len, D);
      fr(at(u0, 0.02, y - 0.06), at(u0, D, y - 0.06), at(u1, D, y - 0.06), at(u1, 0.02, y - 0.06), [0, -1, 0], f.len, D);
      fr(at(u0, D, y - t), at(u1, D, y - t), at(u1, D, y + 0.04), at(u0, D, y + 0.04), [f.ox, 0, f.oz], f.len, t);
      fr(at(u0, 0.02, y - t), at(u0, D, y - t), at(u0, D, y + 0.04), at(u0, 0.02, y + 0.04), [-f.tx, 0, -f.tz], D, t);
      fr(at(u1, D, y - t), at(u1, 0.02, y - t), at(u1, 0.02, y + 0.04), at(u1, D, y + 0.04), [f.tx, 0, f.tz], D, t);
      continue;
    }
    // canvas: sloped, with a valance and closed sides, a bay at a time (some bays go without)
    const nb = Math.max(1, Math.floor(f.len / 7.2)), bw = f.len / nb;
    for (let k = 0; k < nb; k++) {
      if (nb > 2 && r() < 0.18) continue;
      const u0 = k * bw + 0.3, u1 = (k + 1) * bw - 0.3, D = 1.15, yt = 3.25, yb = 2.62, v = 0.24, sl = Math.hypot(D, yt - yb);
      fr(at(u0, 0.03, yt), at(u1, 0.03, yt), at(u1, D, yb), at(u0, D, yb), [f.ox * (yt - yb), D, f.oz * (yt - yb)], u1 - u0, sl);
      fr(at(u0, D, yb - v), at(u1, D, yb - v), at(u1, D, yb), at(u0, D, yb), [f.ox, 0, f.oz], u1 - u0, v);
      for (const [u, s] of [[u0, -1], [u1, 1]]) Q.push([at(u, 0.03, yt), at(u, D, yb), at(u, D, yb - v), null, [f.tx * s, 0, f.tz * s], D, yt - yb + v]); // the side: a triangle and the valance's end
    }
  }
  return Q;
}
// boxes along the walls: [cx, cz, tx, tz, half along, half out, y0, y1] (index.html's obox)
// floor bands: a stucco band at each floor line, standing 6 cm proud
export function bands(frames, g, floors, storey, first = 0) {
  const out = [];
  for (const f of frames) {
    if (f.len < 1.2) continue;
    for (let k = 1; k < floors; k++) { const y = g + first + k * storey - 0.1; out.push([f.ax + f.tx * f.len / 2 + f.ox * 0.04, f.az + f.tz * f.len / 2 + f.oz * 0.04, f.tx, f.tz, f.len / 2 + 0.05, 0.06, y, y + 0.22]); }
  }
  return out;
}
// a cornice: a projecting cap at the top of the parapet
export function cornice(frames, y) {
  const out = [];
  for (const f of frames) { if (f.len < 0.8) continue; out.push([f.ax + f.tx * f.len / 2 + f.ox * 0.08, f.az + f.tz * f.len / 2 + f.oz * 0.08, f.tx, f.tz, f.len / 2 + 0.1, 0.13, y - 0.28, y + 0.06]); }
  return out;
}
// the raised parapet over the entrance of a big box or the middle of a long strip mall: a taller false front
export function raisedFront(frames, roles, y0, rise, r, centre) {
  let best = null; for (const f of frames) if (roles[f.i] === 1 && (!best || f.len > best.len)) best = f;
  if (!best || best.len < 14) return null;
  const w = Math.min(best.len * 0.4, 14 + r() * 10), u = centre ? best.len / 2 : best.len / 2 + (r() - 0.5) * Math.max(0, best.len - w - 4) * 0.5;
  return { f: best, u0: u - w / 2, u1: u + w / 2, y0, y1: y0 + rise };
}
// a fireplace chimney: a stucco chase on the outside of a side or back wall, up past the eaves
export function chimney(frames, roles, g, wallTop, pitch, r) {
  const c = frames.filter(f => roles[f.i] !== 1 && f.len > 4.2); if (!c.length) return null;
  const f = c[Math.floor(r() * c.length)], u = f.len * (0.3 + r() * 0.4), w = 0.62 + r() * 0.3, d = 0.62;
  const top = wallTop + Math.max(1.3, 2.6 * pitch + 0.9);
  return { x: f.ax + f.tx * u + f.ox * (d / 2 + 0.02), z: f.az + f.tz * u + f.oz * (d / 2 + 0.02), tx: f.tx, tz: f.tz, hu: w / 2, ho: d / 2, y0: g - 0.3, y1: top };
}
