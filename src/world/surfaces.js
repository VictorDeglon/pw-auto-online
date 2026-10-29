// Real surfaces: scanned PBR materials (assets/pbr: Poly Haven and ambientCG, CC0, fetched by tools/textures/fetch.py)
// and the shader work that makes them read as a lived-in Poway rather than a model:
//  - walls carry a facade: every wall lays out its own openings from its length, height, role (street front, side,
//    back) and the building's type. Houses get windows sized like a house's (white vinyl frames, sliders, blinds and
//    curtains), a sectional garage door and a front door on the street side; shops a storefront of glass between piers
//    under a sign band; big boxes tilt-up panels with an entrance and roll-up doors; offices ribbon windows. Behind the
//    glass is a room (interior mapping: back wall, floor, ceiling, side walls, furniture, a doorway), lit by the day
//    through the window or by its own lamps at night; the glass reflects the sky through the PBR pipeline. Walls weather:
//    splash grime at the foot, streaks under sills, dark corners, shade under the eaves, blotchy paint.
//  - roads: scanned asphalt, sun-bleached in places, newer and darker in others, with cut-in patches.
//  - sidewalks, curbs and driveways: broom-finished concrete in 5 ft slabs with tooled joints, each slab its own tone,
//    a few stains.
//  - roofs: clay barrel tile, flat concrete tile, asphalt shingles (drawn: tab rows with granules), bitumen and gravel.
//   const S = await loadSurfaces(THREE, loadTex)   S.U (uNight, uDayLum)   S.walls[i] S.road S.side S.roofs.{clay,tile,shingle,flat}
//   wall geometry needs attribute fac = [wall length, wall height, code, seed]; uv = [m along the wall, m above ground]
//   code = style + 8 * role + 32 * (u runs along +T) + 64 * floors (< 8) + 512 * garage + 1024 * garage side (1: at u = 0.9)
//   style 0 house, 1 shop, 2 big box, 3 office, 4 shed,
//   5 apartment; role 0 side, 1 street front, 2 back
export const STYLE = { house: 0, shop: 1, big: 2, office: 3, shed: 4, apartment: 5 };
export const ROLE = { side: 0, front: 1, back: 2 };

const SETS = ['asphalt', 'asphalt_old', 'concrete', 'concrete_stain', 'stucco', 'stucco_rough', 'tiltup', 'brick', 'siding',
  'roof_clay', 'roof_tile', 'roof_flat', 'gravel', 'trail', 'wood'];
export async function loadSurfaces(THREE, loadTex, base = 'assets/pbr/') {
  const T = {};
  await Promise.all([...SETS.flatMap(n => [['c', true], ['n', false], ['arm', false]].map(([k, srgb]) =>
    loadTex(`${base}${n}_${k}.webp`, srgb).then(t => { (T[n] || (T[n] = {}))[k] = t; }))),
    ...[['c', true], ['n', false]].map(([k, srgb]) => loadTex(`${base}lawn_${k}.webp`, srgb).then(t => { (T.lawn || (T.lawn = {}))[k] = t; }))]);
  return createSurfaces(THREE, T);
}

const NOISE = /* glsl */`
float sH11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
float sH21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sVn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sH21(i), sH21(i + vec2(1.0, 0.0)), f.x), mix(sH21(i + vec2(0.0, 1.0)), sH21(i + vec2(1.0, 1.0)), f.x), f.y); }
float sFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * sVn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float sRect(vec2 p, vec2 a, vec2 b) { vec2 w = fwidth(p) * 0.75 + 1e-4; vec2 s = smoothstep(a - w, a + w, p) - smoothstep(b - w, b + w, p); return clamp(s.x * s.y, 0.0, 1.0); }
`;

// ---------------------------------------------------------------- facades
const FACADE_VS_HEAD = /* glsl */`
attribute vec4 fac;
varying vec4 vFac; varying vec2 vFuv; varying vec3 vWPos; varying vec3 vWN;
`;
const FACADE_VS = /* glsl */`
vFac = fac; vFuv = uv; vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);
`;
const FACADE_FS_HEAD = /* glsl */`
varying vec4 vFac; varying vec2 vFuv; varying vec3 vWPos; varying vec3 vWN;
uniform float uNight, uDayLum, uPaint, uMapLum;
${NOISE}
// what this fragment of wall is
float fGlass = 0.0, fFrame = 0.0, fDoor = 0.0, fMetal = 0.0, fStreak = 0.0, fShade = 0.0, fSill = 0.0, fPanel = 0.0;
vec3 fFrameCol = vec3(0.9), fDoorCol = vec3(0.5), fRoom = vec3(0.0);
// a room behind a window (interior mapping): wp = metres from the window's bottom-left, ws = window size,
// sill = window bottom above the floor, ceil = ceiling above the floor, depth; rd = view ray (x along the wall, y up, z in)
vec3 sRoom(vec2 wp, vec2 ws, float sill, float ceil, float depth, vec3 rd, float id, float shop) {
  rd = normalize(rd + vec3(1e-4)); rd.z = max(rd.z, 0.05);
  float rw = max(ws.x + 1.8, 3.4) + shop * 6.0;
  vec3 lo = vec3((ws.x - rw) * 0.5, -sill, 0.0), hi = vec3((ws.x + rw) * 0.5, ceil - sill, depth), o = vec3(wp, 0.0);
  vec3 t1 = (lo - o) / rd, t2 = (hi - o) / rd, tf = max(t1, t2);
  float t = min(min(tf.x, tf.y), tf.z); vec3 h = o + rd * t;
  vec3 wallC = mix(vec3(0.86, 0.82, 0.74), vec3(0.74, 0.77, 0.8), sH11(id * 5.3)) * (0.8 + 0.2 * sH11(id * 7.7));
  vec3 c;
  if (t >= tf.z - 1e-3) {
    c = wallC;
    float dx = h.x - mix(lo.x + 0.8, hi.x - 0.8, sH11(id * 2.9));
    if (shop > 0.5) { // shelving: bands of goods
      float row = fract((h.y - lo.y) / 0.55); c = mix(vec3(0.75, 0.75, 0.73), mix(vec3(0.6, 0.25, 0.2), vec3(0.2, 0.35, 0.6), sH21(floor(h.xy * vec2(1.3, 1.8)))), step(0.18, row) * step(h.y, lo.y + 2.2));
    } else {
      if (abs(dx) < 0.45 && h.y < lo.y + 2.05) c = vec3(0.1, 0.09, 0.08);                         // a doorway to the next room
      else if (abs(dx - 1.4) < 0.4 && abs(h.y - lo.y - 1.55) < 0.28) c = mix(vec3(0.3, 0.35, 0.45), vec3(0.55, 0.42, 0.3), sH11(id)); // a picture
      float fx = h.x - mix(lo.x + 1.0, hi.x - 1.0, sH11(id * 1.7));
      if (abs(fx) < 0.95 && h.y < lo.y + 0.85) c = mix(vec3(0.16, 0.15, 0.14), vec3(0.42, 0.33, 0.25), sH11(id * 4.1)); // a sofa, a bed, a desk
    }
  } else if (t >= tf.y - 1e-3) {
    if (rd.y > 0.0) { c = vec3(0.9, 0.89, 0.86); float lamp = 1.0 - smoothstep(0.1, 0.5, length(h.xz - vec2((lo.x + hi.x) * 0.5, depth * 0.45))); c += lamp * (0.6 + shop); }
    else c = shop > 0.5 ? vec3(0.78, 0.77, 0.74) : mix(vec3(0.4, 0.28, 0.18), vec3(0.55, 0.52, 0.47), sH11(id * 8.3)); // wood or carpet; store tile
  } else c = wallC * 0.82;
  return c * (1.0 - 0.5 * clamp(h.z / depth, 0.0, 1.0));
}
// one window: frame width fw, frame colour fc, mullions (vertical count), muntin grid; fills the f* globals
void sWin(vec2 p, vec2 a, vec2 b, float fw, vec3 fc, float metal, float mull, float grid, float sill, float ceil, float depth, vec3 rd, float id, float shop) {
  vec2 a2 = a - vec2(0.06, 0.05), b2 = b + vec2(0.06, 0.06);
  if (p.x < a2.x - 0.05 || p.x > b2.x + 0.05 || p.y < a2.y - 1.6 || p.y > b2.y + 0.1) return;
  if (p.y < a.y && p.x > a.x && p.x < b.x) fStreak = max(fStreak, (1.0 - smoothstep(0.0, 1.5, a.y - p.y)) * smoothstep(0.45, 0.8, sVn(vec2(p.x * 9.0, id))));
  float outer = sRect(p, a2, b2), opening = sRect(p, a, b);
  fSill = max(fSill, sRect(p, vec2(a.x - 0.1, a.y - 0.07), vec2(b.x + 0.1, a.y)) * (1.0 - opening));
  fShade = max(fShade, (outer - opening) * (p.y > a.y ? 1.0 : 0.0));
  vec2 ia = a + fw, ib = b - fw; float glass = sRect(p, ia, ib);
  if (mull > 0.5) { float cw = (ib.x - ia.x) / (mull + 1.0); float m = abs(fract((p.x - ia.x) / cw + 0.5) - 0.5) * cw; glass *= smoothstep(fw * 0.5, fw * 0.5 + 0.01, m) ; }
  if (grid > 0.5) { vec2 g = abs(fract((p - ia) / vec2(0.32, 0.36)) - 0.5) * vec2(0.32, 0.36); glass *= smoothstep(0.012, 0.02, min(g.x, g.y)); }
  float frame = clamp(opening - glass, 0.0, 1.0);
  if (glass > 0.0) {
    vec2 cell = (p - ia) / max(ib - ia, vec2(0.1));
    vec3 room = sRoom(p - a, b - a, sill, ceil, depth, rd, id, shop);
    float bl = sH11(id * 17.3), cu = sH11(id * 23.1);
    if (shop < 0.5 && bl > 0.5) { float drop = (bl - 0.5) * 1.6; if (cell.y > 1.0 - drop) room = vec3(0.86, 0.83, 0.76) * (0.8 + 0.2 * step(0.45, fract(p.y * 24.0))) * 1.25; } // blinds
    if (shop < 0.5 && cu > 0.62) { float cw = 0.1 + 0.4 * (cu - 0.62); if (cell.x < cw || cell.x > 1.0 - cw) room = mix(vec3(0.75, 0.68, 0.58), vec3(0.45, 0.5, 0.58), sH11(id * 3.7)) * (0.8 + 0.25 * sin(p.x * 40.0)); } // curtains
    float lit = step(sH11(id * 13.7), shop > 0.5 ? 0.85 : 0.38);
    vec3 day = room * uDayLum * (shop > 0.5 ? 0.65 : 0.32), night = room * mix(vec3(0.004), vec3(1.0, 0.8, 0.55) * 0.9, lit);
    fRoom = mix(day, night, uNight);
  }
  fGlass = max(fGlass, glass); if (frame > fFrame) { fFrame = frame; fFrameCol = fc; fMetal = metal; }
}
`;
const FACADE_FS = /* glsl */`
{
  float fLen = vFac.x, fH = vFac.y, code = vFac.z, seed = vFac.w;
  float style = mod(code, 8.0), role = mod(floor(code / 8.0), 4.0), dirS = mod(floor(code / 32.0), 2.0) * 2.0 - 1.0, floors = max(1.0, mod(floor(code / 64.0), 8.0));
  float gBit = mod(floor(code / 512.0), 2.0), gSide = mod(floor(code / 1024.0), 2.0); // the garage the yard planner placed (src/world/yards.js)
  float u = vFuv.x, v = vFuv.y; vec2 p = vec2(u, v);
  vec3 Nw = normalize(vWN), Tw = dirS * normalize(vec3(-Nw.z, 0.0, Nw.x) + vec3(1e-5)), Vd = normalize(vWPos - cameraPosition);
  vec3 rd = vec3(dot(Vd, Tw), Vd.y, -dot(Vd, Nw));
  bool front = role > 0.5 && role < 1.5, back = role > 1.5;
  float wid = seed * 1000.0 + role * 101.0;
  if (style < 0.5 || style > 4.5) { // ---- a house or apartments
    float st = max(2.6, fH / floors), fl = clamp(floor(v / st), 0.0, floors - 1.0), vy = v - fl * st;
    vec3 fc = sH11(seed * 9.1) < 0.8 ? vec3(0.93, 0.92, 0.89) : vec3(0.32, 0.27, 0.22); // white vinyl, some bronze
    float gw = fLen > 16.0 ? 4.9 : 2.75, gx0 = gSide > 0.5 ? 0.9 : fLen - 0.9 - gw;
    bool hasG = front && style < 0.5 && gBit > 0.5;
    float dx0 = hasG ? (gx0 < 1.0 ? min(gx0 + gw + 1.7, fLen - 1.6) : max(gx0 - 2.7, 0.6)) : fLen * 0.5 - 0.48;
    bool door = front && fLen > 3.0;
    if (hasG && v < 2.4) { // a sectional garage door
      float gd = sRect(p, vec2(gx0, 0.0), vec2(gx0 + gw, 2.15));
      if (gd > 0.0) { float r = fract(v / 0.5375), pc = gw > 3.0 ? 8.0 : 4.0, c = fract((u - gx0) / (gw / pc));
        float groove = smoothstep(0.0, 0.035, r) * smoothstep(1.0, 0.965, r), panel = 1.0 - 0.12 * (1.0 - sRect(vec2(c, r), vec2(0.08, 0.18), vec2(0.92, 0.82)));
        fDoor = gd; fDoorCol = (sH11(seed * 4.3) < 0.75 ? vec3(0.92, 0.91, 0.87) : vec3(0.52, 0.4, 0.28)) * (0.72 + 0.28 * groove) * panel; }
      fShade = max(fShade, (sRect(p, vec2(gx0 - 0.12, 0.0), vec2(gx0 + gw + 0.12, 2.27)) - gd) * step(1.0, v));
    }
    if (door && fl < 0.5 && v < 2.35) { // the front door, in a little shadowed recess
      float d = sRect(p, vec2(dx0, 0.0), vec2(dx0 + 0.96, 2.1));
      if (d > 0.0) { float pick = sH11(seed * 6.6); vec3 dc = pick < 0.4 ? vec3(0.25, 0.15, 0.09) : pick < 0.6 ? vec3(0.08, 0.08, 0.09) : pick < 0.8 ? vec3(0.45, 0.1, 0.08) : vec3(0.12, 0.2, 0.32);
        float pn = sRect(fract(vec2((u - dx0) / 0.48, v / 0.7)), vec2(0.15), vec2(0.85));
        fDoor = max(fDoor, d); fDoorCol = dc * (0.85 + 0.15 * pn); if (length(p - vec2(dx0 + 0.82, 1.0)) < 0.035) fDoorCol = vec3(0.75, 0.62, 0.3); }
      fShade = max(fShade, sRect(p, vec2(dx0 - 0.1, 0.0), vec2(dx0 + 1.06, 2.2)) - d);
    }
    float n = floor((fLen - 0.6) / (front ? 3.3 : 3.9));
    if (n >= 1.0 && fDoor < 0.5) {
      float sp = fLen / n, k = clamp(floor(u / sp), 0.0, n - 1.0), cx = (k + 0.5) * sp;
      float ww = (front && fl < 0.5) ? 1.8 : 1.5, wh = fl > 0.5 ? 1.2 : 1.32, sill = 0.92 + fl * st;
      vec2 a = vec2(cx - ww * 0.5, sill), b = vec2(cx + ww * 0.5, sill + wh);
      bool blocked = (hasG && fl < 0.5 && b.x > gx0 - 0.4 && a.x < gx0 + gw + 0.4) || (door && fl < 0.5 && b.x > dx0 - 0.35 && a.x < dx0 + 1.3) || b.y > fl * st + st - 0.25;
      if (!blocked) sWin(p, a, b, 0.055, fc, 0.0, ww > 1.6 ? 1.0 : 1.0, sH11(seed * 2.2) < 0.3 ? 1.0 : 0.0, 0.92, st - 0.1, 3.5 + 2.0 * sH11(wid + k), rd, wid + k + fl * 37.0, 0.0);
    }
  } else if (style < 1.5) { // ---- a shop: storefront on the street, service doors behind
    float floorsUp = floors - 1.0, st0 = min(fH, 4.6);
    if (front) {
      float nb = max(1.0, floor(fLen / 7.2)), bw = fLen / nb, k = floor(u / bw), bu = u - k * bw;
      if (v < 3.15) {
        vec3 fc = sH11(seed * 5.1) < 0.6 ? vec3(0.07, 0.07, 0.075) : vec3(0.28, 0.22, 0.16);
        float dc = bw * 0.5, isDoor = (abs(bu - dc) < 0.95 && mod(k + floor(seed * 7.0), 2.0) < 1.0) ? 1.0 : 0.0;
        vec2 a = vec2(k * bw + 0.4, isDoor > 0.5 && abs(bu - dc) < 0.95 ? 0.02 : 0.45), b = vec2((k + 1.0) * bw - 0.4, 3.05);
        sWin(p, a, b, 0.07, fc, 0.6, floor((b.x - a.x) / 1.55), 0.0, a.y, st0, 9.0 + 4.0 * sH11(wid + k), rd, wid + k, 1.0);
        if (abs(v - 2.35) < 0.04 && p.x > a.x && p.x < b.x) { fFrame = 1.0; fFrameCol = fc; fMetal = 0.6; fGlass = 0.0; } // transom bar
      }
      if (v > 3.2 && v < 4.3) { fPanel = 1.0; } // the sign band
      if (v > 3.05 && v < 3.2) fShade = 1.0;   // the head of the storefront
    } else if (back) {
      float sp = 16.0, k = floor(u / sp), cx = (k + 0.5) * sp;
      float d = sRect(p, vec2(cx - 0.5, 0.0), vec2(cx + 0.5, 2.1));
      if (d > 0.0) { fDoor = d; fDoorCol = vec3(0.55, 0.53, 0.5) * (0.9 + 0.1 * sRect(fract(vec2(u, v * 0.5)), vec2(0.1), vec2(0.9))); fMetal = 0.4; }
    }
    if (floorsUp > 0.5 && v > st0) { // offices or flats upstairs
      float st = (fH - st0) / floorsUp, fl = floor((v - st0) / st), vy = v - st0 - fl * st, sp = 2.4, k = floor(u / sp), cx = (k + 0.5) * sp;
      if (fLen > 3.0) sWin(p, vec2(cx - 0.7, st0 + fl * st + 0.9), vec2(cx + 0.7, st0 + fl * st + 2.4), 0.06, vec3(0.1), 0.6, 0.0, 0.0, 0.9, st - 0.1, 4.0, rd, wid + k + fl * 37.0, 0.0);
    }
  } else if (style < 2.5) { // ---- a big box: tilt-up panels, an entrance, roll-up doors behind
    float j = abs(fract(u / 7.6 + 0.5) - 0.5) * 7.6; fShade = max(fShade, 1.0 - smoothstep(0.015, 0.03, j));
    fShade = max(fShade, (1.0 - smoothstep(0.015, 0.03, abs(v - 1.2))) + (1.0 - smoothstep(0.015, 0.03, abs(v - (fH - 1.4)))));
    if (front && fLen > 14.0) { float cx = fLen * 0.5; sWin(p, vec2(cx - 4.5, 0.02), vec2(cx + 4.5, 3.9), 0.08, vec3(0.08), 0.6, 5.0, 0.0, 0.0, 6.0, 14.0, rd, wid, 1.0); if (v > 3.95 && v < 4.6 && abs(u - cx) < 5.2) fPanel = 1.0; }
    if (back) { float sp = 18.0, k = floor(u / sp), cx = (k + 0.5) * sp; float d = sRect(p, vec2(cx - 1.8, 0.0), vec2(cx + 1.8, 4.3));
      if (d > 0.0) { fDoor = d; fDoorCol = vec3(0.62, 0.62, 0.6) * (0.85 + 0.15 * step(0.5, fract(v * 9.0))); fMetal = 0.5; } }
  } else if (style < 3.5) { // ---- an office: ribbon windows over spandrels
    float st = max(3.4, fH / floors), fl = floor(v / st), vy = v - fl * st;
    if (vy > 0.95 && vy < st - 0.5) sWin(p, vec2(0.3, fl * st + 0.95), vec2(fLen - 0.3, fl * st + st - 0.5), 0.05, vec3(0.12, 0.13, 0.14), 0.7, floor((fLen - 0.6) / 1.5), 0.0, 0.95, st - 0.3, 8.0, rd, wid + fl * 37.0 + floor(u / 3.0), 1.0);
  } else { // ---- a shed or garage: a door at most
    if (front) { float d = sRect(p, vec2(fLen * 0.5 - 1.3, 0.0), vec2(fLen * 0.5 + 1.3, 2.1)); if (d > 0.0) { fDoor = d; fDoorCol = vec3(0.85, 0.84, 0.8) * (0.8 + 0.2 * step(0.5, fract(v / 0.53))); } }
  }
  // ---- weathering on the wall itself
  float wall = 1.0 - max(max(fGlass, fFrame), fDoor);
  float splash = 1.0 - smoothstep(0.0, 0.6, v), blot = 0.86 + 0.24 * sFbm(vec2(u * 0.3 + seed * 13.0, v * 0.45)), fine = 0.94 + 0.12 * sVn(vec2(u * 3.1, v * 2.3));
  float eave = (style < 0.5 || style > 4.5) ? 1.0 - 0.32 * smoothstep(fH - 0.7, fH, v) : 1.0;
  float corner = mix(0.84, 1.0, smoothstep(0.0, 0.45, min(u, fLen - u)));
  vec3 wc = diffuseColor.rgb * blot * fine * eave * corner * (1.0 - 0.22 * fStreak) * (1.0 - 0.35 * fShade);
  wc = mix(wc, wc * vec3(0.78, 0.7, 0.58), splash * 0.75);
  wc = mix(wc, vec3(0.9, 0.89, 0.86), fSill * 0.8);
  if (fPanel > 0.5) wc *= 0.82;
  diffuseColor.rgb = mix(diffuseColor.rgb, wc, wall);
  diffuseColor.rgb = mix(diffuseColor.rgb, fFrameCol, fFrame);
  diffuseColor.rgb = mix(diffuseColor.rgb, fDoorCol, fDoor);
  diffuseColor.rgb *= 1.0 - fGlass; // glass has no diffuse: the room shows through as light, the sky as reflection
}
`;
function facadeMaterial(THREE, set, U, o) {
  for (const k of ['c', 'n', 'arm']) if (set[k]) set[k].repeat.set(1 / o.tile, 1 / o.tile);
  const m = new THREE.MeshStandardMaterial({ map: set.c, normalMap: set.n, normalScale: new THREE.Vector2(o.bump ?? 0.8, o.bump ?? 0.8), roughnessMap: set.arm, aoMap: set.arm, aoMapIntensity: 0.6, vertexColors: true, roughness: 1, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { uPaint: { value: o.paint ? 1 : 0 }, uMapLum: { value: o.lum || 0.55 } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + FACADE_VS_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + FACADE_VS);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FACADE_FS_HEAD)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
          vec4 texelColor = texture2D(map, vMapUv); float tl = dot(texelColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb *= mix(texelColor.rgb, vec3(tl / uMapLum), uPaint); // paint: the scan's relief, the house's colour
        #endif`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FACADE_FS)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.42, fFrame); roughnessFactor = mix(roughnessFactor, 0.5, fDoor); roughnessFactor = mix(roughnessFactor, 0.04, fGlass);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = max(metalnessFactor, fMetal * max(fFrame, fDoor));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(mix(normal, nonPerturbedNormal, max(max(fGlass, fFrame), fDoor)));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float cv = clamp(dot(normalize(cameraPosition - vWPos), normalize(vWN)), 0.0, 1.0), F = 0.04 + 0.96 * pow(1.0 - cv, 5.0);
          totalEmissiveRadiance += fRoom * fGlass * (1.0 - F); }`);
  };
  m.customProgramCacheKey = () => 'facade' + (o.paint ? 'p' : '');
  return m;
}

// ---------------------------------------------------------------- ground: roads, walks, driveways
const GROUND_VS_HEAD = 'varying vec3 vWPos; varying vec2 vGuv;';
const GROUND_VS = 'vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vGuv = uv;';
function roadMaterial(THREE, set, old, U) {
  // the road ribbons' uv is already in 7 m units
  const m = new THREE.MeshStandardMaterial({ map: set.c, normalMap: set.n, normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: set.arm, vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { uOld: { value: old.c } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GROUND_VS_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GROUND_VS);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec2 vGuv; uniform sampler2D uOld;\n' + NOISE + '\nfloat gSeal = 0.0, gPatch = 0.0;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
          vec2 wp = vWPos.xz;
          // the plainer scan carries the colour (the other's cracks read as drawn on); the cracked one only adds grain
          vec4 tn = texture2D(map, vMapUv * 0.61 + 0.17), to = texture2D(uOld, vMapUv);
          float tl = dot(tn.rgb, vec3(0.299, 0.587, 0.114));
          vec3 c = to.rgb * vec3(0.78, 0.78, 0.8) * (0.92 + 0.16 * smoothstep(0.02, 0.12, tl));
          float age = smoothstep(0.3, 0.8, sFbm(wp * 0.012));                         // newer, darker stretches and sun-bleached old ones
          c *= mix(0.82, 1.08, age);
          vec2 pc = floor(wp / vec2(9.0, 6.0)); float ph = sH21(pc);                   // patches: cut-in rectangles of newer asphalt
          if (ph > 0.95) { vec2 f = fract(wp / vec2(9.0, 6.0)); gPatch = sRect(f, vec2(0.15 + 0.2 * sH11(ph * 7.0), 0.2), vec2(0.6 + 0.3 * sH11(ph * 3.0), 0.75)); }
          c = mix(c, c * 0.86, gPatch);
          c *= 0.93 + 0.1 * sVn(wp * 0.35);                                           // oil and wear, soft
          diffuseColor.rgb *= c;
        #endif`);
  };
  m.customProgramCacheKey = () => 'road3';
  return m;
}
function walkMaterial(THREE, set, stain, U) {
  for (const s of [set, stain]) for (const k of ['c', 'n', 'arm']) if (s[k]) s[k].repeat.set(1 / 3, 1 / 3);
  const m = new THREE.MeshStandardMaterial({ map: set.c, normalMap: set.n, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: set.arm, vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { uStain: { value: stain.c }, uWalkLum: { value: avgLum(set.c) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GROUND_VS_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GROUND_VS);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec2 vGuv; uniform sampler2D uStain; uniform float uWalkLum;\n' + NOISE + '\nfloat gJoint = 0.0;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
          // vGuv: metres across (x) and along (y) the walk; 5 ft slabs, tooled joints, each slab its own pour
          float along = vGuv.y, slab = floor(along / 1.524), j = abs(fract(along / 1.524 + 0.5) - 0.5) * 1.524;
          gJoint = 1.0 - smoothstep(0.004, 0.012, j);
          float edge = min(vGuv.x, abs(vGuv.x - 2.2));
          vec4 tc = texture2D(map, vMapUv), ts = texture2D(uStain, vMapUv * 0.7 + 0.13);
          float tone = 0.93 + 0.12 * sH11(slab + floor(vWPos.x * 0.01) * 13.0);
          // light broom-finished concrete: the scan's relief at a set albedo (sidewalks read lighter than the asphalt)
          float tl = dot(tc.rgb, vec3(0.299, 0.587, 0.114)) / uWalkLum, sl = dot(ts.rgb, vec3(0.299, 0.587, 0.114)) / uWalkLum;
          vec3 c = vec3(0.5, 0.49, 0.46) * mix(tl, sl * 0.92, 0.25 * smoothstep(0.55, 0.8, sFbm(vWPos.xz * 0.15))) * tone;
          c *= 0.9 + 0.1 * smoothstep(0.0, 0.08, edge);                               // tooled edges
          c *= 1.0 - 0.55 * gJoint;
          float gum = step(0.985, sH21(floor(vWPos.xz * 3.0))) * (1.0 - smoothstep(0.03, 0.06, length(fract(vWPos.xz * 3.0) - 0.5) / 3.0));
          c = mix(c, c * 0.45, gum * 0.7);                                            // gum and drips
          diffuseColor.rgb *= c;
        #endif`);
  };
  m.customProgramCacheKey = () => 'walk3';
  return m;
}

// ---------------------------------------------------------------- roofs
// uv on roofs: metres across the slope (x) and up the slope (y) (flat roofs: world x, z)
function roofMaterial(THREE, set, U, o) {
  for (const k of ['c', 'n', 'arm']) if (set && set[k]) set[k].repeat.set(1 / o.tile, 1 / o.tile);
  const m = new THREE.MeshStandardMaterial({ map: set ? set.c : null, normalMap: set ? set.n : null, normalScale: new THREE.Vector2(1, 1), roughnessMap: set ? set.arm : null, aoMap: set ? set.arm : null, vertexColors: true, roughness: o.rough ?? 1, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { uDesat: { value: o.desat || 0 }, uDepth: { value: (o.depth || 0.03) / o.tile } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GROUND_VS_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GROUND_VS);
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec2 vGuv; uniform float uDesat, uDepth;\n' + NOISE);
    if (o.shingle) fs = fs.replace('#include <map_fragment>', `{ // asphalt shingles: courses of tabs, granules, a slight sun fade
        vec2 q = vGuv / vec2(0.33, 0.143); float row = floor(q.y), off = sH11(row) * 0.5;
        float tab = abs(fract(q.x + off) - 0.5), course = fract(q.y);
        float gran = sH21(floor(vGuv * 220.0)) * 0.25 + sVn(vGuv * 40.0) * 0.15;
        float shade = mix(0.55, 1.0, smoothstep(0.0, 0.18, course)) * (1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.012, 0.5 - tab)) * step(0.3, course));
        diffuseColor.rgb *= (0.8 + gran) * shade * (0.9 + 0.2 * sH11(row * 3.1 + floor(q.x + off)));
      }`);
    else {
      // parallax occlusion: the scan's AO stands in for height (grooves dark), so barrel tiles have relief that shifts
      // with the view; every map below is read at the displaced uv
      fs = fs.replace('#include <map_fragment>', `vec2 pUv = vec2(0.0);
        #ifdef USE_MAP
        {
          vec3 Nw = normalize(cross(dFdx(vWPos), dFdy(vWPos))); if (dot(Nw, cameraPosition - vWPos) < 0.0) Nw = -Nw;
          vec3 dp1 = dFdx(vWPos), dp2 = dFdy(vWPos); vec2 du1 = dFdx(vMapUv), du2 = dFdy(vMapUv);
          vec3 p2 = cross(dp2, Nw), p1 = cross(Nw, dp1), T = p2 * du1.x + p1 * du2.x, Bt = p2 * du1.y + p1 * du2.y;
          float im = inversesqrt(max(max(dot(T, T), dot(Bt, Bt)), 1e-12)); T *= im; Bt *= im;
          vec3 V = normalize(cameraPosition - vWPos); vec3 Vt = vec3(dot(V, T), dot(V, Bt), dot(V, Nw));
          float dist = length(cameraPosition - vWPos);
          pUv = vMapUv;
          if (dist < 60.0) {
            float layers = mix(14.0, 6.0, clamp(Vt.z, 0.0, 1.0)), dl = 1.0 / layers, cur = 0.0;
            vec2 dUv = Vt.xy / max(Vt.z, 0.15) * uDepth / layers;
            float h = 1.0 - textureGrad(roughnessMap, pUv, du1, du2).r; // explicit gradients: the loop exits per pixel
            for (int i = 0; i < 14; i++) { if (cur >= h || float(i) >= layers) break; pUv -= dUv; h = 1.0 - textureGrad(roughnessMap, pUv, du1, du2).r; cur += dl; }
            pUv = mix(vMapUv, pUv, 1.0 - smoothstep(35.0, 60.0, dist));
          }
          vec4 texelColor = texture2D(map, pUv); float tl = dot(texelColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb *= mix(texelColor.rgb, vec3(tl) * 1.15, uDesat) * (0.88 + 0.2 * sFbm(vWPos.xz * 0.15));
        }
        #endif`)
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = texture2D(roughnessMap, pUv); roughnessFactor *= texelRoughness.g;
        #endif`)
        .replace('#include <aomap_fragment>', `#ifdef USE_AOMAP
          { float ambientOcclusion = (texture2D(aoMap, pUv).r - 1.0) * aoMapIntensity + 1.0; reflectedLight.indirectDiffuse *= ambientOcclusion; }
        #endif`)
        .replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP_TANGENTSPACE
          { vec3 mapN = texture2D(normalMap, pUv).xyz * 2.0 - 1.0; mapN.xy *= normalScale; normal = normalize(tbn * mapN); }
        #else
          #include <normal_fragment_maps>
        #endif`);
    }
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'roof2' + (o.shingle ? 's' : '') + (o.desat || 0);
  return m;
}

// the mean linear luminance of a texture (the facade shader paints with the scan's relief, normalised by this)
function avgLum(t) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); g.drawImage(t.image, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data, lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.299 * lin(d[i]) + 0.587 * lin(d[i + 1]) + 0.114 * lin(d[i + 2]);
    return Math.max(0.05, s / 256);
  } catch (e) { return 0.3; }
}
// the mean linear colour of a texture
function avgColor(t) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); g.drawImage(t.image, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data, lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const m = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += lin(d[i + k]);
    return m.map(v => Math.max(0.02, v / 256));
  } catch (e) { return [0.3, 0.2, 0.15]; }
}
export function createSurfaces(THREE, T) {
  const U = { uNight: { value: 0 }, uDayLum: { value: 1 } };
  const S = { U, T };
  S.walls = [
    facadeMaterial(THREE, T.stucco, U, { tile: 2.6, paint: true, lum: avgLum(T.stucco.c), bump: 1 }),       // 0 houses: painted stucco
    facadeMaterial(THREE, T.stucco_rough, U, { tile: 2.2, paint: true, lum: avgLum(T.stucco_rough.c), bump: 1 }), // 1 shops: rougher stucco
    facadeMaterial(THREE, T.brick, U, { tile: 2.4, bump: 1 }),                                // 2 brick
    facadeMaterial(THREE, T.tiltup, U, { tile: 3.5, paint: true, lum: avgLum(T.tiltup.c), bump: 0.6 }),    // 3 tilt-up concrete
  ];
  S.road = roadMaterial(THREE, T.asphalt, T.asphalt_old, U);
  S.side = walkMaterial(THREE, T.concrete, T.concrete_stain, U);
  S.roofs = {
    clay: roofMaterial(THREE, T.roof_clay, U, { tile: 2.2, depth: 0.07 }),     // barrel tile: deep courses
    tile: roofMaterial(THREE, T.roof_tile, U, { tile: 2.0, desat: 0.85, depth: 0.035 }),
    shingle: roofMaterial(THREE, null, U, { shingle: true, rough: 0.95 }),
    flat: roofMaterial(THREE, T.roof_flat, U, { tile: 3, desat: 0.6, depth: 0.01 }),
    gravel: roofMaterial(THREE, T.gravel, U, { tile: 2.5, desat: 0.3, depth: 0.015 }),
  };
  // country trails (decomposed granite), post-and-rail fences, clipped hedges; uv in metres
  const rep = (set, m) => { for (const k of ['c', 'n', 'arm']) if (set && set[k]) set[k].repeat.set(1 / m, 1 / m); };
  rep(T.trail, 2.5); rep(T.wood, 1.6); rep(T.lawn, 0.9);
  S.trail = new THREE.MeshStandardMaterial({ map: T.trail.c, normalMap: T.trail.n, roughnessMap: T.trail.arm, vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  S.wood = new THREE.MeshStandardMaterial({ map: T.wood.c, normalMap: T.wood.n, roughnessMap: T.wood.arm, vertexColors: true, roughness: 1 });
  S.hedge = new THREE.MeshStandardMaterial({ map: T.lawn.c, normalMap: T.lawn.n, normalScale: new THREE.Vector2(1.5, 1.5), vertexColors: true, roughness: 0.95 });
  // what a roof material shows on average (linear), so a roof can be tinted to the colour of the real roof in the photo
  const ct = avgColor(T.roof_tile.c), lt = (0.299 * ct[0] + 0.587 * ct[1] + 0.114 * ct[2]) * 1.15;
  S.roofMean = { clay: avgColor(T.roof_clay.c), tile: [lt, lt, lt], shingle: [0.8, 0.8, 0.8] };
  return S;
}
