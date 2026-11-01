// The shops in Poway's shopping centres, on their real buildings: every store OpenStreetMap puts in or by a shop or
// strip building gets its own storefront on that building's front, sized by its trade, named (chains as their
// parodies, src/world/plazas/brands.js), and dressed the way that trade dresses a storefront: a pizza place's neon and
// patio, a café's bistro tables and bike rack, a barber's pole, a bank's ATM, a liquor store's ice chest, a nail salon's
// window neon. The rest of a centre's fronts fill with plausible local tenants and the odd vacancy, so a strip reads as
// a row of shops. Glass, aluminium mullions, doors with push bars, a transom, a kickplate, the sign (channel letters or
// a lit cabinet), an awning or a lit soffit; through the glass, the trade's own interior (a painted room per trade).
// The facade shader leaves those walls plain (their painted bays would show round the real ones), and a strip's walls
// opposite its shops become its service side.
// Planned when the buildings register (planShops), so the walls are drawn plain from the start; built centre by centre
// near you (one atlas of signs per centre, a handful of merged meshes), dropped when you're far away.
//   const PLAN = planShops({ BLD, POIS, isRetail(B), other(x, z, B) })     sets B.shopWalls (footprint edge indices)
//   const SHOPS = buildShops({ THREE, scene, PLAN, heightAt, addInteract, notify, sfx, hour, inCar, brandCanvas })
//   SHOPS.update(focus, night)   SHOPS.onCollapse(B)   SHOPS.onRepair(B)   SHOPS.stores   SHOPS.bays (for interiors)
//   bay: { name, cat, B, w (wall), c (centre along it), width, base, top, gh (glass height), gw, dc, dw (door centre and
//          width along the wall), depth (into the building), x, z (in front of its door) }   B.shopHoles: the openings
//   SHOPS.paintedGlass(bay, show): the painted room on the glass on or off (src/world/interiors.js opens the real one)
import { parodyName } from './plazas/brands.js';
export const PLAZA_CENTER = { x: -4300, z: -2350 };
const AMC_AT = { x: -4110, z: -2763 }; // Carmel Mountain's cinema, the tall 6,600 m2 box at the south end of the plaza
const SHOP_TYPES = new Set(['shop', 'fast_food', 'restaurant', 'cafe', 'bank']);

// ---- trades: how a name reads, and what that trade's storefront looks like
// w: bay width; aw: awning (chance); pal: sign colours; neon: window neon; out: the props out front; room: the interior
const CATS = [
  ['nails', /nail/i, { w: 6, aw: 0.2, pal: ['#e4007c', '#5b2c83', '#c8102e'], neon: 'NAILS', out: [], room: 'nails' }],
  ['barber', /barber|cuts|shave|clips|snips|fade/i, { w: 6, aw: 0.2, pal: ['#1b365d', '#b5121b', '#111111'], neon: 'BARBER', out: ['pole'], room: 'barber' }],
  ['salon', /salon|hair|tresses|lash|brow|wax|sams|supercuts|phenix|beauty bar|mane|twist|skin/i, { w: 6, aw: 0.3, pal: ['#5b2c83', '#111111', '#b76e79', '#2e4a5a'], neon: 'OPEN', out: [], room: 'salon' }],
  ['spa', /spa|massage|med ?spa|wellness/i, { w: 6, aw: 0.2, pal: ['#2e4a3a', '#5b2c83', '#8a6a4a'], neon: 'OPEN', out: [], room: 'spa' }],
  ['bank', /bank|credit union|chase|wells|fargo|comerica|mypoint|sdccu/i, { w: 10, aw: 0, pal: ['#003b70', '#0a4c8a', '#b5121b', '#00573f'], neon: null, out: ['atm'], room: 'bank' }],
  ['pharmacy', /cvs|walgreens|pharmacy|rite aid/i, { w: 14, aw: 0, pal: ['#cc0000'], neon: 'PHARMACY', out: ['carts'], room: 'grocery' }],
  ['cleaners', /cleaners|laundry|alteration|tailor/i, { w: 6, aw: 0.3, pal: ['#1f3a93', '#2b2b2b'], neon: 'OPEN', out: [], room: 'cleaners' }],
  ['pets', /pet|dog|groom|paw|doggz/i, { w: 8, aw: 0.3, pal: ['#00639c', '#e87722', '#1f7a3a'], neon: 'OPEN', out: ['bench'], room: 'shop' }],
  ['fitness', /fitness|yoga|martial|karate|gym|crossfit|pilates|dance|boxing/i, { w: 10, aw: 0, pal: ['#111111', '#c8102e', '#ff6a13'], neon: null, out: [], room: 'gym' }],
  ['phone', /at&t|t-mobile|verizon|cricket|wireless|mobile/i, { w: 8, aw: 0, pal: ['#00a8e0', '#e20074', '#cd040b'], neon: null, out: [], room: 'shop' }],
  ['office', /tax|insurance|dental|dentist|clinic|medical|realty|real estate|mail|ship|print|loan|check|optometr|eye|vision|lenscraft|scrubs|clear choice|good feet|hear/i, { w: 8, aw: 0.2, pal: ['#1b365d', '#2e4a3a', '#4a4a4a'], neon: null, out: [], room: 'office' }],
  ['liquor', /liquor|wine|spirits|bevmo|smoke shop|vape|cigar|distiller|7-eleven|circle k|beer|hop stop|cellars/i, { w: 8, aw: 0, pal: ['#1b1b1b', '#7a1f2b', '#c8102e', '#00563f'], neon: 'LIQUOR', out: ['ice'], room: 'liquor' }],
  ['market', /market|grocery|produce|foods|swadeshi|meats & eats/i, { w: 12, aw: 0.4, pal: ['#2f6b34', '#c8102e', '#8a5a2b'], neon: 'OPEN', out: ['carts', 'produce'], room: 'grocery' }],
  ['pizza', /pizz|round table|little caes|dominos?|papa john/i, { w: 8, aw: 0.6, pal: ['#c8102e', '#1f6b3a', '#b5121b'], neon: 'PIZZA', out: ['patio', 'aframe'], room: 'diner' }],
  ['burger', /burger|hamburger|habit|five guys|in-n-out|carl|jack in|wendy|mcdonald/i, { w: 9, aw: 0.3, pal: ['#d62300', '#8b1a1a', '#e4a11b'], neon: 'BURGERS', out: ['patio'], room: 'diner' }],
  ['mexican', /taco|mexican|burrito|cantina|rubio|chipotle|sombrero|roberto|rigoberto|serrano|yesenia|ranchito|los primos|jalape|tequero|rancho viejo|taqueria/i, { w: 8, aw: 0.7, pal: ['#c8102e', '#00843d', '#e87722'], neon: 'TACOS', out: ['patio', 'umbrellas'], room: 'diner' }],
  ['sandwich', /subs?\b|sandwich|subway|jersey mike|\bike'?s|which wich|deli|bagel|einstein|panera|meats/i, { w: 7, aw: 0.2, pal: ['#00843d', '#1f3a93', '#c8102e'], neon: 'SUBS', out: ['patio'], room: 'counter' }],
  ['sweets', /donut|winchell|bake|bakery|crepe|cupcake|cookie|candies|candy|see's|mochinut|yogurt|ice cream|handel|dairy queen|starbread|cakes/i, { w: 6, aw: 0.6, pal: ['#e4007c', '#f7a1c4', '#7a4b2a', '#ff8200'], neon: 'DONUTS', out: ['bench'], room: 'counter' }],
  ['cafe', /coffee|caf[eé]|starbucks|\btea\b|boba|espresso|kung fu tea|juice|smoothie|jamba|nekter|nékter|idego|mostra|luckie|the stand|ding tea/i, { w: 7, aw: 0.5, pal: ['#00704a', '#5c3a21', '#2b2b2b', '#c8a04a'], neon: 'OPEN', out: ['bistro', 'bikes'], room: 'cafe' }],
  ['wings', /wing|chicken|cluckin|bbq|smokin|fish|seafood|hamburger factory|crepe/i, { w: 8, aw: 0.3, pal: ['#004225', '#c8102e', '#1b1b1b'], neon: 'OPEN', out: ['patio'], room: 'diner' }],
  ['indian', /indian|tandoor|tikka|curry|desi|darbar|delhi|lahori|bombay|kabob|kebab|mediterr|santorini|cava|luna grill|grill/i, { w: 9, aw: 0.5, pal: ['#8a2a22', '#1f4e3d', '#5b2c83'], neon: 'OPEN', out: ['patio'], room: 'restaurant' }],
  ['asian', /sushi|ramen|thai|wok|dragon|chinese|pho|poke|teriyaki|panda|dumpling|korean|tofu|dubu|hawaiian|lumpia|kyodai|boto|ginza|chopsticks|asian|burma|iron pan|ichizen|gato|kitchen|ipo bbq|pin lu/i, { w: 9, aw: 0.4, pal: ['#a6192e', '#1b365d', '#111111', '#7a1f2b'], neon: 'OPEN', out: ['aframe'], room: 'restaurant' }],
  ['retail', /./, { w: 9, aw: 0.35, pal: ['#c8102e', '#0057b8', '#1f7a3a', '#5b2c83', '#e35205', '#00787a', '#232f3e'], neon: null, out: [], room: 'shop' }],
];
const catOf = (name, type) => { if (type === 'bank') return 'bank'; for (const [k, re] of CATS) if (k !== 'retail' && re.test(name)) return k; return type === 'cafe' ? 'cafe' : type === 'restaurant' || type === 'fast_food' ? 'asian' : 'retail'; };
const CAT = Object.fromEntries(CATS.map(([k, , o]) => [k, o]));
// made-up neighbours for the fronts the map leaves empty (no real business is named here)
const FILL = [
  ['nails', 'Sunrise Nails & Spa'], ['nails', 'Lotus Nail Lounge'], ['salon', 'Bella Hair Studio'], ['salon', 'Shear Elegance'], ['barber', 'Classic Cuts Barbers'],
  ['cafe', 'Mesa Grind Coffee'], ['cafe', 'Peak Brew'], ['sweets', 'Sunny Donuts'], ['sweets', 'Frost Yogurt'], ['asian', 'Golden Wok'], ['asian', 'Pho Poway'],
  ['asian', 'Sakura Teriyaki'], ['mexican', 'Casa Verde Taqueria'], ['indian', 'Mediterranean Grill'], ['pizza', 'Hilltop Pizza'], ['sandwich', 'Canyon Deli'],
  ['cleaners', 'Mesa Cleaners'], ['office', 'Palomar Tax Service'], ['office', 'Twin Peaks Dental'], ['office', 'Granite Insurance'], ['office', 'Ship & Print'],
  ['fitness', 'Rancho Yoga'], ['fitness', 'Tiger Martial Arts'], ['liquor', 'Corner Vape & Smoke'], ['retail', 'Party Supply Co.'], ['phone', 'Poway Wireless'],
  ['retail', 'Trail Cyclery'], ['retail', 'Desert Bloom Florist'], ['retail', 'Mesa Jewelers'], ['pets', 'Wag & Wash'], ['spa', 'Serenity Massage'],
];

function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function pip(x, z, f) { let ins = false; const n = f.length / 2; for (let i = 0, j = n - 1; i < n; j = i++) { const xi = f[i * 2], zi = f[i * 2 + 1], xj = f[j * 2], zj = f[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; }
// a footprint's walls (edge index, ends, along, out), and how deep the building runs behind each
function wallsOf(B) {
  const f = B.flat, n = f.length / 2, out = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = f[i * 2], az = f[i * 2 + 1], bx = f[j * 2], bz = f[j * 2 + 1], L = Math.hypot(bx - ax, bz - az); if (L < 5) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L; let nx = uz, nz = -ux; const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (pip(mx + nx * 0.5, mz + nz * 0.5, f)) { nx = -nx; nz = -nz; }
    let depth = 4; for (let d = 2; d < 60; d += 1) { if (!pip(mx - nx * d, mz - nz * d, f)) break; depth = d; }
    out.push({ i, ax, az, bx, bz, L, ux, uz, nx, nz, depth, used: [] });
  }
  return out;
}
function place(w, t, width) { // slide a storefront along its wall until it doesn't overlap a neighbour
  const half = width / 2 + 0.3; let c = Math.max(half, Math.min(w.L - half, t));
  for (let k = 0; k < 14; k++) { const hit = w.used.find(([a, b]) => c + half > a && c - half < b); if (!hit) break; c = c < (hit[0] + hit[1]) / 2 ? hit[0] - half : hit[1] + half; if (c < half - 0.01 || c > w.L - half + 0.01) return null; }
  w.used.push([c - half, c + half]); return c;
}

// ---- the plan: which store goes on which wall where, and which walls the shader leaves plain
export function planShops({ BLD, POIS, isRetail, other, heightAt, open = () => true }) { // open(x, z): a parking lot or a street there
  const blds = BLD.filter(B => B.plan && isRetail(B)), W = new Map(blds.map(B => [B, wallsOf(B)]));
  const front = (B, w) => { // a wall a shop can open onto: no other building right in front of it
    let shut = 0; for (const t of [0.25, 0.5, 0.75]) if (other(w.ax + w.ux * w.L * t + w.nx * 2.5, w.az + w.uz * w.L * t + w.nz * 2.5, B)) shut++; return shut < 2; };
  const level = (w, c, width) => { // the ground in front of a storefront: level with its walk for 7 m, not a bank rising over the glass (or falling away under the walk)
    for (const f of [-0.4, 0, 0.4]) { const u = c + f * width, y0 = heightAt(w.ax + w.ux * u + w.nx * 1.2, w.az + w.uz * u + w.nz * 1.2);
      for (const d of [2.5, 4.5, 7]) { const dy = heightAt(w.ax + w.ux * u + w.nx * d, w.az + w.uz * u + w.nz * d) - y0; if (dy > 0.35 || dy < -1.0) return false; } }
    return true; };
  const faces = w => { if (w.faces === undefined) { w.faces = 0; for (const t of [0.25, 0.5, 0.75]) for (const d of [6, 12, 20]) if (open(w.ax + w.ux * w.L * t + w.nx * d, w.az + w.uz * w.L * t + w.nz * d)) w.faces++; } return w.faces; }; // how much lot or street the wall looks onto
  const placeLevel = (w, t, width) => { const c = place(w, t, width); if (c === null || level(w, c, width)) return c; w.used.pop(); return null; };
  const bays = [], pois = POIS.filter(p => SHOP_TYPES.has(p.type));
  // centres: the stores in them, linked within 150 m; a building belongs to the centre of the stores in or by it
  const grid = new Map(), key = (x, z) => Math.floor(x / 200) * 100000 + Math.floor(z / 200);
  for (const B of blds) { const k = key(B.cx, B.cz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(B); }
  const near = (x, z, r) => { const out = []; for (let i = Math.floor((x - r) / 200); i <= Math.floor((x + r) / 200); i++) for (let j = Math.floor((z - r) / 200); j <= Math.floor((z + r) / 200); j++) for (const B of grid.get(i * 100000 + j) || []) out.push(B); return out; };
  const tenants = new Map(); // B -> [{ p, cat }]
  for (const p of pois) {
    let best = null, bd = 25; if (near(p.x, p.z, 80).some(B => B.plan.type === 'bigbox' && pip(p.x, p.z, B.flat))) continue; // inside a big box: that store's
    for (const B of near(p.x, p.z, 80)) { if (B.plan.type === 'bigbox') continue; let d = pip(p.x, p.z, B.flat) ? 0 : 1e9; if (d) for (const w of W.get(B)) { const t = Math.max(0, Math.min(w.L, (p.x - w.ax) * w.ux + (p.z - w.az) * w.uz)); d = Math.min(d, Math.hypot(p.x - w.ax - w.ux * t, p.z - w.az - w.uz * t)); } if (d < bd) { bd = d; best = B; } }
    if (best) { let a = tenants.get(best); if (!a) tenants.set(best, a = []); a.push({ p, cat: catOf(p.name, p.type) }); }
  }
  const busy = new Map(); for (const p of pois) for (const B of near(p.x, p.z, 90)) if (Math.hypot(B.cx - p.x, B.cz - p.z) < 90) busy.set(B, (busy.get(B) || 0) + 1); // in a shopping centre: two stores mapped close by
  for (const B of blds) {
    if (B.plan.type !== 'shop' && B.plan.type !== 'strip') continue; const T = tenants.get(B) || []; if (!T.length && (busy.get(B) || 0) < 2) continue;
    const Wb = W.get(B).filter(w => front(B, w)); if (!Wb.length) continue;
    const used = new Set();
    for (const { p, cat } of T) { // on the wall nearest where the map puts it, where the ground in front is level
      const ws = Wb.map(w => { const t = Math.max(0, Math.min(w.L, (p.x - w.ax) * w.ux + (p.z - w.az) * w.uz)); return [Math.hypot(p.x - w.ax - w.ux * t, p.z - w.az - w.uz * t) + (faces(w) ? 0 : 30), w, t]; }).sort((a, b) => a[0] - b[0]); // a wall that looks onto a lot or a street before one onto open ground
      let bw = null, c = null, width = 0; for (const [, w, t] of ws) { width = Math.min(CAT[cat].w, w.L - 0.6); if (width < 3) continue; c = placeLevel(w, t, width); if (c !== null) { bw = w; break; } }
      if (c === null) continue;
      bays.push({ B, w: bw, c, width, name: parodyName(p.name), real: p.name, cat, type: p.type }); used.add(bw);
    }
    // the rest of a centre building's shop fronts: made-up neighbours, now and then a vacancy
    const byLen = Wb.slice().sort((a, b) => (faces(b) > 0) - (faces(a) > 0) || b.L - a.L); // the longest wall onto a lot or a street, with level ground before it
    const fronts = used.size ? [...used] : [byLen.find(w => level(w, w.L / 2, Math.min(10, w.L - 1))) || byLen[0]];
    for (const w of fronts) {
      let t = 0.3; const r = hash(B.i + ':' + w.i);
      for (let k = 0; t < w.L - 5.5 && k < 40; k++) {
        const gap = w.used.filter(([a]) => a > t - 0.01).sort((a, b) => a[0] - b[0])[0], end = gap ? gap[0] : w.L - 0.3;
        if (end - t < 5.6) { t = gap ? gap[1] : w.L; continue; }
        const f = FILL[(r + k * 7) % FILL.length], vac = ((r >>> (k % 16)) & 7) === 0, width = Math.min(end - t - 0.3, vac ? 7 : CAT[f[0]].w);
        const c0 = place(w, t + width / 2 + 0.3, width); if (c0 === null) break;
        if (!level(w, c0, width)) { w.used.pop(); t = c0 + width / 2 + 0.3; continue; } // no shop on a stretch of wall banked up with earth: plain wall there
        const c = c0; bays.push({ B, w, c, width, name: vac ? 'For Lease' : f[1], cat: vac ? 'vacant' : f[0], type: 'shop', fill: true }); t = c + width / 2 + 0.3;
      }
    }
    if (bays.some(b => b.B === B)) B.shopWalls = new Set(bays.filter(b => b.B === B).map(b => b.w.i));
  }
  // each bay's ground, glass, door: the same numbers the storefront is built from, so the wall opens just behind its glass
  for (const b of bays) { const { w, c, width } = b, Bd = b.B, h = hash(b.name + Bd.i), cat = b.cat === 'vacant' ? null : CAT[b.cat];
    b.base = heightAt(w.ax + w.ux * c + w.nx * 1.2, w.az + w.uz * c + w.nz * 1.2) + 0.02; b.top = Math.min(Bd.top, b.base + Math.max(4.2, Bd.top - Bd.base));
    b.gh = Math.max(2.6, Math.min(3.15, b.top - b.base - 1.3)); b.gw = width - 0.3;
    const pair = width >= 8 || (cat && (b.cat === 'bank' || b.cat === 'market' || b.cat === 'pharmacy')); b.dw = pair ? 1.9 : 1.0; b.dc = c + (pair ? 0 : (h & 1 ? -1 : 1) * Math.min(b.gw / 2 - 0.8, 1.2)); b.h = h;
    let a = Bd.shopHoles; if (!a) Bd.shopHoles = a = new Map(); let L = a.get(w.i); if (!L) a.set(w.i, L = []); L.push({ u0: c - b.gw / 2, u1: c + b.gw / 2, y0: b.base, y1: b.base + b.gh + 0.12 }); }
  // the cinema at Carmel Mountain
  const amc = blds.filter(B => Math.hypot(B.cx - AMC_AT.x, B.cz - AMC_AT.z) < 60).sort((a, b) => Math.hypot(a.cx - AMC_AT.x, a.cz - AMC_AT.z) - Math.hypot(b.cx - AMC_AT.x, b.cz - AMC_AT.z))[0];
  let cinema = null;
  if (amc) { const w = W.get(amc).filter(w => w.L > 22 && front(amc, w)).sort((a, b) => ((PLAZA_CENTER.x - (b.ax + b.bx) / 2) * b.nx + (PLAZA_CENTER.z - (b.az + b.bz) / 2) * b.nz) / Math.hypot(PLAZA_CENTER.x - (b.ax + b.bx) / 2, PLAZA_CENTER.z - (b.az + b.bz) / 2) - ((PLAZA_CENTER.x - (a.ax + a.bx) / 2) * a.nx + (PLAZA_CENTER.z - (a.az + a.bz) / 2) * a.nz) / Math.hypot(PLAZA_CENTER.x - (a.ax + a.bx) / 2, PLAZA_CENTER.z - (a.az + a.bz) / 2))[0];
    if (w) { cinema = { B: amc, w, c: w.L / 2 }; amc.shopWalls = new Set([w.i]); } }
  // centres for building and dropping: bays within 300 m of each other's first
  const centres = [];
  for (const b of bays) { const x = b.w.ax + b.w.ux * b.c, z = b.w.az + b.w.uz * b.c; let C = centres.find(C => Math.hypot(C.x - x, C.z - z) < 300); if (!C) centres.push(C = { x, z, bays: [], built: null }); C.bays.push(b); }
  if (cinema) { const x = cinema.w.ax + cinema.w.ux * cinema.c, z = cinema.w.az + cinema.w.uz * cinema.c; let C = centres.find(C => Math.hypot(C.x - x, C.z - z) < 300); if (!C) centres.push(C = { x, z, bays: [], built: null }); C.cinema = cinema; }
  return { bays, centres, cinema };
}
// a strip's shop walls are its fronts (the mansard over them), the walls facing away its service side; genBuilding then
// has the facade shader, the kit and the awnings leave the shop walls plain (the storefronts are these)
export function shopRoles(B, roles) {
  if (!B.shopWalls) return roles; const f = B.flat, n = f.length / 2, dir = i => { const j = (i + 1) % n, L = Math.hypot(f[j * 2] - f[i * 2], f[j * 2 + 1] - f[i * 2 + 1]) || 1; return [(f[j * 2] - f[i * 2]) / L, (f[j * 2 + 1] - f[i * 2 + 1]) / L]; };
  const out = Uint8Array.from(roles); for (const i of B.shopWalls) out[i] = 1;
  for (let i = 0; i < n; i++) { if (B.shopWalls.has(i)) continue; const [a, b] = dir(i); for (const s of B.shopWalls) { const [c, d] = dir(s); if (a * c + b * d < -0.9) { out[i] = 2; break; } } }
  return out;
}

// ---- what's seen through each trade's glass: a painted room per trade (one shared atlas, 4 x 4 rooms)
const ROOMS = ['diner', 'restaurant', 'counter', 'cafe', 'barber', 'salon', 'nails', 'spa', 'bank', 'grocery', 'liquor', 'cleaners', 'shop', 'gym', 'office', 'vacant'];
function paintRooms(cv) {
  const g = cv.getContext('2d'), S = cv.width / 4;
  const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
  ROOMS.forEach((k, i) => {
    const x0 = (i % 4) * S, y0 = Math.floor(i / 4) * S; g.save(); g.beginPath(); g.rect(x0, y0, S, S); g.clip();
    const wall = { diner: '#e8d6b0', restaurant: '#5a3a2a', counter: '#f1ede4', cafe: '#6b4a32', barber: '#e9e4da', salon: '#efe6e6', nails: '#f6e9ee', spa: '#d9d0c0', bank: '#e5e2dc', grocery: '#f3f1ec', liquor: '#2c2a28', cleaners: '#e7e9ec', shop: '#f2f0ec', gym: '#3b3f44', office: '#e9e7e1', vacant: '#bdb8ae' }[k];
    const gr = g.createLinearGradient(0, y0, 0, y0 + S); gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.08, wall); gr.addColorStop(0.62, wall); gr.addColorStop(0.62, k === 'restaurant' || k === 'liquor' || k === 'gym' ? '#3a2e26' : '#cfc8bb'); gr.addColorStop(1, k === 'restaurant' ? '#2a211b' : '#a9a294');
    g.fillStyle = gr; g.fillRect(x0, y0, S, S);
    for (let j = 0; j < 4; j++) { g.fillStyle = 'rgba(255,248,225,.9)'; g.fillRect(x0 + S * (0.12 + j * 0.24), y0 + S * 0.03, S * 0.12, S * 0.025); } // ceiling lights
    const shelf = (x, y, w, h, n) => { g.fillStyle = '#d8d4cc'; g.fillRect(x, y, w, h); for (let r = 0; r < n; r++) { const yy = y + (r + 0.15) * h / n; for (let q = 0; q < w; q += S * 0.025) { g.fillStyle = `hsl(${Math.floor(rnd() * 360)},${45 + rnd() * 40}%,${35 + rnd() * 30}%)`; g.fillRect(x + q, yy, S * 0.02, h / n * 0.62); } g.fillStyle = '#9a958c'; g.fillRect(x, yy + h / n * 0.65, w, 2); } };
    const table = (x, y, w, c) => { g.fillStyle = c || '#3a2a20'; g.fillRect(x, y, w, S * 0.025); g.fillRect(x + w * 0.45, y, w * 0.1, S * 0.1); for (const cx of [x - S * 0.05, x + w + S * 0.01]) { g.fillStyle = '#222'; g.fillRect(cx, y - S * 0.06, S * 0.035, S * 0.16); } };
    const counter = (y, c) => { g.fillStyle = c || '#8a5a3a'; g.fillRect(x0 + S * 0.05, y, S * 0.9, S * 0.16); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x0 + S * 0.05, y, S * 0.9, S * 0.02); };
    const menu = c => { for (let j = 0; j < 3; j++) { g.fillStyle = c || '#1b1b1b'; g.fillRect(x0 + S * (0.18 + j * 0.23), y0 + S * 0.14, S * 0.2, S * 0.13); g.fillStyle = 'rgba(255,255,255,.7)'; for (let r = 0; r < 5; r++) g.fillRect(x0 + S * (0.2 + j * 0.23), y0 + S * (0.16 + r * 0.022), S * (0.1 + rnd() * 0.06), 2); } };
    const chair = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, S * 0.09, S * 0.04); g.fillRect(x + S * 0.03, y - S * 0.12, S * 0.03, S * 0.12); g.fillRect(x, y + S * 0.04, S * 0.015, S * 0.1); g.fillRect(x + S * 0.075, y + S * 0.04, S * 0.015, S * 0.1); };
    const mirror = (x) => { g.fillStyle = '#9ab0bf'; g.fillRect(x, y0 + S * 0.18, S * 0.14, S * 0.26); g.strokeStyle = '#222'; g.lineWidth = 3; g.strokeRect(x, y0 + S * 0.18, S * 0.14, S * 0.26); };
    if (k === 'diner' || k === 'counter') { menu(k === 'diner' ? '#1b1b1b' : '#2f5a3c'); counter(y0 + S * 0.46, k === 'diner' ? '#b5121b' : '#7a5a3a'); for (let j = 0; j < 3; j++) table(x0 + S * (0.12 + j * 0.3), y0 + S * 0.74, S * 0.16, '#d8d0c0'); }
    if (k === 'restaurant') { for (let j = 0; j < 4; j++) { g.fillStyle = 'rgba(255,200,120,.85)'; g.beginPath(); g.arc(x0 + S * (0.15 + j * 0.23), y0 + S * 0.28, S * 0.035, 0, 7); g.fill(); } for (let j = 0; j < 3; j++) table(x0 + S * (0.12 + j * 0.3), y0 + S * 0.66, S * 0.18, '#f2ede2'); }
    if (k === 'cafe') { menu('#1b1b1b'); counter(y0 + S * 0.5, '#4a3020'); g.fillStyle = '#b8b8b8'; g.fillRect(x0 + S * 0.62, y0 + S * 0.4, S * 0.16, S * 0.1); for (let j = 0; j < 2; j++) table(x0 + S * (0.2 + j * 0.4), y0 + S * 0.76, S * 0.12, '#222'); }
    if (k === 'barber' || k === 'salon') { for (let j = 0; j < 4; j++) { mirror(x0 + S * (0.06 + j * 0.24)); chair(x0 + S * (0.08 + j * 0.24), y0 + S * 0.6, k === 'barber' ? '#7a1f1f' : '#222'); } }
    if (k === 'nails' || k === 'spa') { for (let j = 0; j < 4; j++) { g.fillStyle = k === 'nails' ? '#f0f0f0' : '#8a6a4a'; g.fillRect(x0 + S * (0.06 + j * 0.24), y0 + S * 0.56, S * 0.17, S * 0.05); chair(x0 + S * (0.08 + j * 0.24), y0 + S * 0.7, k === 'nails' ? '#4a2a4a' : '#d8d0c0'); } if (k === 'nails') for (let r = 0; r < 4; r++) for (let q = 0; q < 30; q++) { g.fillStyle = `hsl(${(q * 37 + r * 90) % 360},70%,55%)`; g.fillRect(x0 + S * 0.08 + q * S * 0.028, y0 + S * (0.14 + r * 0.06), S * 0.015, S * 0.035); } }
    if (k === 'bank') { counter(y0 + S * 0.5, '#5a4a3a'); for (let j = 0; j < 4; j++) { g.fillStyle = '#2a2a2a'; g.fillRect(x0 + S * (0.12 + j * 0.2), y0 + S * 0.4, S * 0.06, S * 0.08); } g.fillStyle = '#003b70'; g.fillRect(x0 + S * 0.3, y0 + S * 0.15, S * 0.4, S * 0.08); }
    if (k === 'grocery' || k === 'shop' || k === 'liquor') { for (let j = 0; j < 3; j++) shelf(x0 + S * (0.04 + j * 0.32), y0 + S * 0.2, S * 0.28, S * 0.5, k === 'liquor' ? 6 : 5); if (k === 'grocery') { g.fillStyle = '#c8102e'; g.fillRect(x0, y0 + S * 0.12, S, S * 0.04); } }
    if (k === 'liquor') { g.fillStyle = 'rgba(180,230,255,.35)'; g.fillRect(x0 + S * 0.04, y0 + S * 0.2, S * 0.92, S * 0.5); }
    if (k === 'cleaners') { g.strokeStyle = '#777'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y0 + S * 0.3); g.lineTo(x0 + S, y0 + S * 0.3); g.stroke(); for (let q = 0; q < 22; q++) { g.fillStyle = `hsl(${(q * 53) % 360},30%,${50 + (q % 3) * 12}%)`; g.fillRect(x0 + S * 0.02 + q * S * 0.044, y0 + S * 0.31, S * 0.035, S * 0.28); } counter(y0 + S * 0.62, '#6a6a6a'); }
    if (k === 'gym') { for (let j = 0; j < 4; j++) { g.fillStyle = '#111'; g.fillRect(x0 + S * (0.08 + j * 0.23), y0 + S * 0.5, S * 0.16, S * 0.12); g.fillStyle = '#c8102e'; g.fillRect(x0 + S * (0.08 + j * 0.23), y0 + S * 0.48, S * 0.16, S * 0.02); } g.fillStyle = '#8fa3b5'; g.fillRect(x0 + S * 0.05, y0 + S * 0.15, S * 0.9, S * 0.25); }
    if (k === 'office') { counter(y0 + S * 0.55, '#c9c2b4'); for (let j = 0; j < 2; j++) chair(x0 + S * (0.15 + j * 0.6), y0 + S * 0.72, '#2a3a4a'); g.fillStyle = '#7a8a6a'; g.fillRect(x0 + S * 0.4, y0 + S * 0.2, S * 0.2, S * 0.18); }
    if (k === 'vacant') { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x0, y0 + S * 0.62, S, S * 0.38); g.fillStyle = '#fff'; g.font = `600 ${S * 0.08}px "Oswald", "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.fillText('FOR LEASE', x0 + S / 2, y0 + S * 0.4); g.font = `400 ${S * 0.045}px Arial`; g.fillText('RETAIL · CALL TODAY', x0 + S / 2, y0 + S * 0.47); }
    g.fillStyle = 'rgba(10,20,30,.18)'; g.fillRect(x0, y0, S, S); // the glass's own tint
    g.restore();
  });
}
const roomUV = k => { const i = Math.max(0, ROOMS.indexOf(k)); return [(i % 4) / 4, 1 - (Math.floor(i / 4) + 1) / 4, (i % 4 + 1) / 4, 1 - Math.floor(i / 4) / 4]; };

// a sign's typeface by its trade, from the web fonts index.html loads ({s}: the size); a script face keeps the name's own
// capitals, the rest are set in capitals. Never the browser's plain Arial.
const FACES = {
  script: ['400 {s}px "Pacifico"', '400 {s}px "Lobster"', '400 {s}px "Yellowtail"', 'italic 800 {s}px "Playfair Display"', '700 {s}px "Cormorant Garamond"'],
  barber: ['400 {s}px "Rye"', '400 {s}px "Anton"', '400 {s}px "Archivo Black"', '400 {s}px "Lobster"'],
  formal: ['800 {s}px "Playfair Display"', '700 {s}px "Cormorant Garamond"', '800 {s}px "Montserrat"', '700 {s}px "Josefin Sans"'],
  food: ['400 {s}px "Lilita One"', '400 {s}px "Lobster"', '700 {s}px "Arvo"', 'italic 800 {s}px "Kanit"', '400 {s}px "Anton"', '400 {s}px "Rye"'],
  treat: ['400 {s}px "Pacifico"', '400 {s}px "Yellowtail"', '400 {s}px "Lilita One"', 'italic 700 {s}px "Lora"', '700 {s}px "Josefin Sans"'],
  dine: ['700 {s}px "Cormorant Garamond"', 'italic 700 {s}px "Lora"', '800 {s}px "Playfair Display"', '400 {s}px "Lobster"'],
  store: ['400 {s}px "Archivo Black"', '600 {s}px "Oswald"', '800 {s}px "Montserrat"', '700 {s}px "Poppins"', '400 {s}px "Anton"'],
  sport: ['italic 800 {s}px "Kanit"', '400 {s}px "Archivo Black"', '400 {s}px "Anton"', '600 {s}px "Oswald"'],
  pets: ['400 {s}px "Lilita One"', '900 {s}px "Nunito Sans"', '400 {s}px "Pacifico"'],
  plain: ['700 {s}px "Poppins"', '900 {s}px "Nunito Sans"', '700 {s}px "Josefin Sans"', '800 {s}px "Montserrat"', '600 {s}px "Oswald"', '700 {s}px "Barlow Condensed"'],
};
const FACE_OF = { nails: 'script', salon: 'script', spa: 'script', barber: 'barber', bank: 'formal', office: 'formal', pizza: 'food', burger: 'food', wings: 'food', mexican: 'food', sandwich: 'food',
  sweets: 'treat', cafe: 'treat', asian: 'dine', indian: 'dine', market: 'store', liquor: 'store', pharmacy: 'store', fitness: 'sport', pets: 'pets' };
const SCRIPT_FACE = /Pacifico|Lobster|Yellowtail|italic.*(Playfair|Lora)/;
function signFace(cat, h) { const L = FACES[FACE_OF[cat] || 'plain']; return L[(h >>> 21) % L.length]; }
export function buildShops(o) {
  const { THREE, scene, PLAN, heightAt } = o;
  let roomTex = null; const roomTexture = () => { if (roomTex) return roomTex; const cv = document.createElement('canvas'); cv.width = cv.height = 1024; paintRooms(cv); roomTex = new THREE.CanvasTexture(cv); roomTex.colorSpace = THREE.SRGBColorSpace; roomTex.anisotropy = 4; return roomTex; };
  const mats = {
    glass: new THREE.MeshStandardMaterial({ color: 0x9aa4ab, roughness: 0.12, metalness: 0.35, emissive: 0xfff2dd, emissiveIntensity: 0.05 }),
    frame: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.65, vertexColors: true }),
    awning: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true }),
    prop: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, vertexColors: true }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff1d0, vertexColors: true }),
  };
  const stores = [], ranges = new Map(), doorsOn = new Set();
  const night = { v: 0 };

  // one centre's storefronts: its own sign atlas, merged meshes per material
  function buildCentre(C) {
    const items = C.bays.length + (C.cinema ? 3 : 0), rows = Math.ceil((items * 2 + 4) / 4), AH = Math.min(2048, Math.max(256, 1 << Math.ceil(Math.log2(rows * 64))));
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = AH; const g = cv.getContext('2d'); let slot = 0; const SW = 256, SH = 64, cap = (AH / SH) * 4;
    const draws = []; // the atlas is drawn again once the web fonts are in
    const faces = new Set(); // the typefaces this centre's signs use: drawn again once they're loaded
    const sign = (text, bg, fg, style, sub, face = '700 {s}px "Barlow Condensed"') => { if (slot >= cap) return null; const sx = (slot % 4) * SW, sy = Math.floor(slot / 4) * SH; slot++; faces.add(face.replace('{s}', 40));
      const d = () => { g.clearRect(sx, sy, SW, SH);
        if (style === 'cabinet') { g.fillStyle = bg; g.fillRect(sx, sy, SW, SH); g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(sx, sy, SW, 5); }
        let fs = sub || SCRIPT_FACE.test(face) ? 34 : 42; const font = s => face.replace('{s}', s) + ', "Barlow Condensed", sans-serif'; g.font = font(fs); while (g.measureText(text).width > SW - 18 && fs > 14) { fs -= 2; g.font = font(fs); }
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (style !== 'cabinet') { g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeText(text, sx + SW / 2, sy + (sub ? SH * 0.4 : SH / 2) + 1); }
        g.fillStyle = style === 'cabinet' ? fg : bg; g.fillText(text, sx + SW / 2, sy + (sub ? SH * 0.4 : SH / 2) + 1);
        if (sub) { g.font = `700 14px "Barlow Condensed", Arial`; g.fillStyle = style === 'cabinet' ? fg : bg; g.fillText(sub, sx + SW / 2, sy + SH * 0.8); } };
      d(); draws.push(d); return [sx / 1024, 1 - (sy + SH) / AH, (sx + SW) / 1024, 1 - sy / AH]; };
    const neonUV = (text, color) => { if (slot >= cap) return null; const sx = (slot % 4) * SW, sy = Math.floor(slot / 4) * SH; slot++;
      const d = () => { g.clearRect(sx, sy, SW, SH); g.font = `700 40px "Pacifico", "Brush Script MT", cursive`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = color; g.shadowBlur = 14; g.fillStyle = color; g.fillText(text, sx + SW / 2, sy + SH / 2 + 2); g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.6; g.fillText(text, sx + SW / 2, sy + SH / 2 + 2); g.globalAlpha = 1; };
      d(); draws.push(d); return [sx / 1024, 1 - (sy + SH) / AH, (sx + SW) / 1024, 1 - sy / AH]; };
    const brand = (canvas) => { if (!canvas || slot >= cap) return null; const sx = (slot % 4) * SW, sy = Math.floor(slot / 4) * SH; slot++; const d = () => { g.clearRect(sx, sy, SW, SH); g.drawImage(canvas, sx, sy, SW, SH); }; d(); draws.push(d); return [sx / 1024, 1 - (sy + SH) / AH, (sx + SW) / 1024, 1 - sy / AH]; };

    const B = { glass: [], frame: [], awning: [], sign: [], neon: [], prop: [], light: [] }, col = new THREE.Color(), rgb = c => { col.set(c); return [col.r, col.g, col.b]; };
    const quad = (buf, p0, p1, p2, p3, n, uv, c) => { const U = uv || [0, 0, 1, 1], cc = c || [1, 1, 1]; for (const [p, u, v] of [[p0, U[0], U[1]], [p1, U[2], U[1]], [p2, U[2], U[3]], [p0, U[0], U[1]], [p2, U[2], U[3]], [p3, U[0], U[3]]]) buf.push(p[0], p[1], p[2], n[0], n[1], n[2], u, v, cc[0], cc[1], cc[2]); };
    // in a wall's frame: t along it, d out of it, y up
    const box = (buf, w, t, d, y, bw, bh, bd, c, rot = 0) => {
      const cr = Math.cos(rot), sr = Math.sin(rot), P = (a, b, e) => { const aa = a - t, bb = b - d, ra = aa * cr - bb * sr, rb = aa * sr + bb * cr; return [w.ax + w.ux * (t + ra) + w.nx * (d + rb), e, w.az + w.uz * (t + ra) + w.nz * (d + rb)]; };
      const a0 = t - bw / 2, a1 = t + bw / 2, b0 = d - bd / 2, b1 = d + bd / 2, y0 = y - bh / 2, y1 = y + bh / 2, R = (x, z) => [w.ux * x * cr + w.nx * x * sr + w.ux * z * -sr + w.nx * z * cr, 0, w.uz * x * cr + w.nz * x * sr + w.uz * z * -sr + w.nz * z * cr];
      const N = R(0, 1), S = R(0, -1), E = R(1, 0), Wv = R(-1, 0);
      quad(buf, P(a0, b1, y0), P(a1, b1, y0), P(a1, b1, y1), P(a0, b1, y1), N, null, c); quad(buf, P(a1, b0, y0), P(a0, b0, y0), P(a0, b0, y1), P(a1, b0, y1), S, null, c);
      quad(buf, P(a0, b0, y1), P(a0, b1, y1), P(a1, b1, y1), P(a1, b0, y1), [0, 1, 0], null, c);
      quad(buf, P(a1, b1, y0), P(a1, b0, y0), P(a1, b0, y1), P(a1, b1, y1), E, null, c); quad(buf, P(a0, b0, y0), P(a0, b1, y0), P(a0, b1, y1), P(a0, b0, y1), Wv, null, c);
    };
    const panel = (buf, w, t, d, y, pw, ph, uv, c) => { const P = (a, e) => [w.ax + w.ux * a + w.nx * d, e, w.az + w.uz * a + w.nz * d]; quad(buf, P(t - pw / 2, y - ph / 2), P(t + pw / 2, y - ph / 2), P(t + pw / 2, y + ph / 2), P(t - pw / 2, y + ph / 2), [w.nx, 0, w.nz], uv, c); };
    const under = (buf, w, t, d0, d1, y, pw, c) => { const P = (a, b) => [w.ax + w.ux * a + w.nx * b, y, w.az + w.uz * a + w.nz * b]; quad(buf, P(t - pw / 2, d1), P(t + pw / 2, d1), P(t + pw / 2, d0), P(t - pw / 2, d0), [0, -1, 0], null, c); };
    const cone = (buf, w, t, d, y0, y1, r, c) => { // an umbrella's canopy: eight panels
      const P = (a, b, e) => [w.ax + w.ux * a + w.nx * b, e, w.az + w.uz * a + w.nz * b], top = P(t, d, y1);
      for (let k = 0; k < 8; k++) { const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2, p0 = P(t + Math.cos(a0) * r, d + Math.sin(a0) * r, y0), p1 = P(t + Math.cos(a1) * r, d + Math.sin(a1) * r, y0);
        const cc = k % 2 ? c : c.map(v => Math.min(1, v * 1.25 + 0.15)); for (const p of [p0, p1, top]) B[buf].push(p[0], p[1], p[2], 0, 1, 0, 0, 0, cc[0], cc[1], cc[2]); for (const p of [p1, p0, top]) B[buf].push(p[0], p[1], p[2], 0, -1, 0, 0, 0, cc[0] * 0.7, cc[1] * 0.7, cc[2] * 0.7); }
    };
    const mark = () => { const m = {}; for (const k in B) m[k] = B[k].length / 11; return m; };
    const close = (Bd, m) => { const r = ranges.get(Bd) || {}; for (const k in B) (r[k] || (r[k] = [])).push([C, m[k], B[k].length / 11]); ranges.set(Bd, r); };

    const ALU = [0.72, 0.74, 0.76], BRONZE = [0.24, 0.2, 0.17], DARK = [0.08, 0.08, 0.09], WOOD = [0.42, 0.29, 0.18], WHITE = [0.94, 0.93, 0.9], GREEN = [0.2, 0.36, 0.2];
    for (const b of C.bays) {
      const { w, c, width } = b, Bd = b.B, base = b.base, top = b.top;
      const cat = b.cat === 'vacant' ? null : CAT[b.cat], h = b.h, m = mark();
      const gh = b.gh, aw = cat && ((h >>> 7) % 100) / 100 < cat.aw && top - (base + gh + 1.0) >= 0.75; // an awning over the glass where the sign still fits above it, else a lit soffit
      const fr = (h >>> 3) % 3 === 0 ? BRONZE : ALU, signY0 = base + gh + (aw ? 1.0 : 0.35), signH = Math.min(1.1, top - 0.15 - signY0);
      b.depth = w.depth; b.x = w.ax + w.ux * b.dc + w.nx * 1.4; b.z = w.az + w.uz * b.dc + w.nz * 1.4; b.C = C; b.savedGlass = null;
      // the walk in front: a concrete slab with a curb at its edge, a step down to the lot; a strip centre's curb is painted red (the fire lane)
      box(B.prop, w, c, 1.85, base - 0.14, width + 0.62, 0.3, 3.7, [0.8, 0.79, 0.76]); box(B.prop, w, c, 3.62, base - 0.13, width + 0.62, 0.3, 0.16, C.bays.length >= 3 ? [0.62, 0.14, 0.12] : [0.88, 0.87, 0.84]);
      // the glass: a kickplate, the panes (the trade's room behind them), mullions every 1.5 m or so, a transom bar, the head
      const gw = b.gw, np = Math.max(2, Math.round(gw / 1.6)), room = roomUV(cat ? cat.room : 'vacant'), g0 = B.glass.length / 11;
      box(B.frame, w, c, 0.1, base + 0.2, gw, 0.4, 0.12, fr);
      panel(B.glass, w, c, 0.08, base + 0.4 + (gh - 0.4) / 2, gw, gh - 0.4, room);
      for (let k = 0; k <= np; k++) box(B.frame, w, c - gw / 2 + k * gw / np, 0.12, base + gh / 2, 0.09, gh, 0.14, fr);
      box(B.frame, w, c, 0.12, base + 2.3, gw, 0.08, 0.14, fr); box(B.frame, w, c, 0.12, base + gh + 0.05, gw + 0.1, 0.12, 0.16, fr);
      // the door: a single or a pair, darker glass, a push bar, a pull, the closer above, the hours on the glass
      const pair = b.dw > 1.5, dw = b.dw, dc = b.dc;
      box(B.frame, w, dc, 0.14, base + 1.11, dw + 0.12, 2.22, 0.06, fr); panel(B.glass, w, dc, 0.18, base + 1.12, dw - 0.14, 2.06, room); b.glass = [g0, B.glass.length / 11]; // (the painted glass gives way to the real room: src/world/interiors.js)
      for (const s of pair ? [-1, 1] : [h & 2 ? -1 : 1]) { box(B.frame, w, dc + s * dw * 0.25, 0.24, base + 1.02, dw * 0.38, 0.045, 0.05, ALU); box(B.frame, w, dc + s * dw * 0.06, 0.25, base + 1.2, 0.035, 0.42, 0.04, ALU); }
      box(B.frame, w, dc, 0.2, base + 2.28, Math.min(0.45, dw * 0.4), 0.07, 0.07, DARK);
      if (b.cat !== 'vacant') panel(B.prop, w, dc + (pair ? 0.5 : 0.25), 0.19, base + 1.6, 0.22, 0.28, null, [0.96, 0.96, 0.96]); // the hours decal
      // the sign: channel letters on the fascia, or a lit cabinet; a brand's own mark where the chain has one
      const pal = cat ? cat.pal : ['#3a3f47'], bg = pal[h % pal.length], style = !cat || (h >>> 5) % 5 < 2 ? 'cabinet' : 'letters';
      const bc = b.cat !== 'vacant' && o.brandCanvas ? o.brandCanvas(b.real || b.name) : null;
      const face = b.cat === 'vacant' ? '600 {s}px "Oswald"' : signFace(b.cat, h);
      const uv = bc ? brand(bc) : sign(b.cat === 'vacant' ? 'FOR LEASE' : SCRIPT_FACE.test(face) ? b.name : b.name.toUpperCase(), bg, '#ffffff', style, b.cat === 'vacant' ? 'RETAIL · 2,400 SQ FT' : '', face);
      if (uv && signH > 0.45) { const sw = Math.min(width * 0.86, signH * 4 * 0.98); if (style === 'cabinet' || bc) box(B.frame, w, c, 0.1, signY0 + signH / 2, sw + 0.14, signH + 0.12, 0.16, DARK); panel(B.sign, w, c, style === 'cabinet' || bc ? 0.19 : 0.06, signY0 + signH / 2, sw, signH, uv);
        if (style === 'cabinet' && !bc) for (const k of [-1, 0, 1]) { box(B.frame, w, c + k * sw * 0.33, 0.35, signY0 + signH + 0.22, 0.05, 0.05, 0.5, DARK); box(B.frame, w, c + k * sw * 0.33, 0.6, signY0 + signH + 0.12, 0.22, 0.08, 0.14, DARK); } } // gooseneck lamps
      // over the glass: an awning in the sign's colour, or a lit soffit
      const ac = rgb(bg);
      if (aw) { const ad = 1.2, ay = base + gh + 0.32, P = (a, bb, e) => [w.ax + w.ux * a + w.nx * bb, e, w.az + w.uz * a + w.nz * bb]; // a sloped fabric awning with a valance
        quad(B.awning, P(c - width / 2, 0.05, ay + 0.55), P(c + width / 2, 0.05, ay + 0.55), P(c + width / 2, ad, ay), P(c - width / 2, ad, ay), [w.nx * 0.6, 0.8, w.nz * 0.6], null, ac);
        quad(B.awning, P(c + width / 2, ad, ay), P(c - width / 2, ad, ay), P(c - width / 2, ad, ay - 0.28), P(c + width / 2, ad, ay - 0.28), [w.nx, 0, w.nz], null, ac.map(v => v * 0.85));
        for (const s of [-1, 1]) quad(B.awning, P(c + s * width / 2, 0.05, ay + 0.55), P(c + s * width / 2, ad, ay), P(c + s * width / 2, ad, ay - 0.28), P(c + s * width / 2, 0.05, ay), [w.ux * s, 0, w.uz * s], null, ac.map(v => v * 0.75)); }
      else { box(B.frame, w, c, 0.55, base + gh + 0.22, width, 0.12, 1.0, [0.86, 0.85, 0.82]); under(B.light, w, c, 0.15, 0.95, base + gh + 0.155, width - 0.4, [1, 0.95, 0.85]); }
      // the window neon
      if (cat && cat.neon && (h >>> 9) % 3 !== 0) { const nc = ['#ff2d55', '#ff3b30', '#ff9500', '#34c759', '#00c7ff', '#bf5af2'][(h >>> 11) % 6], nu = neonUV(cat.neon, nc); if (nu) panel(B.neon, w, c + (dc > c ? -1 : 1) * Math.min(gw / 2 - 0.9, 1.6), 0.03, base + 1.75, 1.3, 0.33, nu); }
      // the trade's things out front
      const out = cat ? cat.out : [], wd = w.nx, sgn = dc > c ? -1 : 1;
      if (out.includes('patio') || out.includes('bistro') || out.includes('umbrellas')) { // tables and chairs on the walk, umbrellas over some
        const n = Math.max(1, Math.min(3, Math.floor((width - 2.2) / 2.4))), tc = out.includes('bistro') ? DARK : (h >>> 13) % 2 ? WHITE : DARK;
        for (let k = 0; k < n; k++) { const tt = Math.max(c - width / 2 + 0.9, Math.min(c + width / 2 - 0.9, c - sgn * width / 2 + sgn * (1.2 + k * 2.3)));
          if (Math.abs(tt - dc) < 1.3) continue; const dd = 2.2;
          box(B.prop, w, tt, dd, base + 0.74, 0.75, 0.04, 0.75, tc); box(B.prop, w, tt, dd, base + 0.36, 0.06, 0.72, 0.06, DARK);
          for (const [ox, oz, r] of [[-0.62, 0, 0], [0.62, 0, Math.PI]]) { box(B.prop, w, tt + ox, dd + oz, base + 0.45, 0.42, 0.04, 0.42, tc); box(B.prop, w, tt + ox + (r ? 0.2 : -0.2), dd, base + 0.72, 0.04, 0.5, 0.4, tc); for (const lx of [-0.17, 0.17]) for (const lz of [-0.17, 0.17]) box(B.prop, w, tt + ox + lx, dd + lz, base + 0.22, 0.03, 0.44, 0.03, DARK); }
          if (out.includes('umbrellas') || (out.includes('patio') && (h >>> (15 + k)) & 1)) { box(B.prop, w, tt, dd, base + 1.25, 0.04, 2.5, 0.04, WHITE); cone('prop', w, tt, dd, base + 2.15, base + 2.55, 1.15, rgb(pal[(h + k) % pal.length])); } }
        if (out.includes('patio') && width >= 7) for (let k = 0; k <= 4; k++) { const tt = c - width / 2 + 0.3 + k * (width - 0.6) / 4; box(B.prop, w, tt, 3.2, base + 0.45, 0.05, 0.9, 0.05, DARK); } // the patio's rail posts
        if (out.includes('patio') && width >= 7) { box(B.prop, w, c, 3.2, base + 0.88, width - 0.6, 0.04, 0.04, DARK); box(B.prop, w, c, 3.2, base + 0.5, width - 0.6, 0.03, 0.03, DARK); }
      }
      if (out.includes('aframe')) { const tt = dc + sgn * -1.4; box(B.prop, w, tt, 1.5, base + 0.5, 0.6, 1.0, 0.06, DARK, 0.15); panel(B.prop, w, tt, 1.54, base + 0.55, 0.5, 0.7, null, [0.12, 0.14, 0.12]); }
      if (out.includes('bikes')) for (let k = 0; k < 3; k++) { const tt = c - sgn * (width / 2 - 0.6 - k * 0.5); box(B.prop, w, tt, 1.0, base + 0.42, 0.05, 0.84, 0.6, [0.55, 0.57, 0.6]); }
      if (out.includes('pole')) { const tt = dc + sgn * (dw / 2 + 0.35); box(B.prop, w, tt, 0.18, base + 1.9, 0.16, 0.9, 0.16, WHITE); for (let k = 0; k < 4; k++) box(B.prop, w, tt, 0.27, base + 1.55 + k * 0.22, 0.17, 0.08, 0.02, k % 2 ? [0.1, 0.25, 0.65] : [0.75, 0.08, 0.08]); box(B.prop, w, tt, 0.18, base + 2.4, 0.2, 0.1, 0.2, ALU); box(B.prop, w, tt, 0.18, base + 1.4, 0.2, 0.1, 0.2, ALU); }
      if (out.includes('atm')) { const tt = c + (dc > c ? -1 : 1) * Math.min(gw / 2 - 0.6, 2.2); box(B.prop, w, tt, 0.18, base + 1.15, 0.9, 1.5, 0.3, [0.26, 0.28, 0.3]); panel(B.light, w, tt, 0.34, base + 1.45, 0.35, 0.25, null, [0.35, 0.65, 1]); box(B.prop, w, tt, 0.36, base + 1.1, 0.5, 0.12, 0.08, DARK); box(B.prop, w, tt, 0.25, base + 2.05, 1.1, 0.3, 0.45, rgb(bg)); }
      if (out.includes('ice')) { const tt = c - sgn * (width / 2 - 0.8); box(B.prop, w, tt, 0.6, base + 0.75, 1.2, 1.5, 0.75, WHITE); panel(B.prop, w, tt, 0.98, base + 1.2, 0.8, 0.35, null, [0.1, 0.4, 0.85]); box(B.prop, w, tt + 0.62, 0.9, base + 0.55, 0.45, 1.1, 0.55, [0.85, 0.12, 0.12]); }
      if (out.includes('carts')) { const tt = c - sgn * (width / 2 - 1.2); for (let k = 0; k < 6; k++) { box(B.prop, w, tt, 1.0 + k * 0.32, base + 0.75, 0.55, 0.45, 0.85, [0.6, 0.62, 0.65]); box(B.prop, w, tt, 1.0 + k * 0.32, base + 0.35, 0.5, 0.06, 0.8, DARK); } }
      if (out.includes('produce')) for (let k = 0; k < 3; k++) { const tt = c + sgn * (1.6 + k * 1.1); if (Math.abs(tt - dc) < 1.2) continue; box(B.prop, w, tt, 0.9, base + 0.4, 0.9, 0.8, 0.7, WOOD); box(B.prop, w, tt, 0.9, base + 0.84, 0.85, 0.1, 0.65, [[0.85, 0.15, 0.1], [0.95, 0.65, 0.1], [0.35, 0.6, 0.15]][k]); }
      if (out.includes('bench')) { const tt = c - sgn * (width / 2 - 1.4); box(B.prop, w, tt, 1.6, base + 0.45, 1.6, 0.06, 0.45, WOOD); for (const s of [-0.7, 0.7]) box(B.prop, w, tt + s, 1.6, base + 0.22, 0.06, 0.44, 0.4, DARK); }
      if ((h >>> 17) % 3 === 0) { const tt = c + (h & 1 ? 1 : -1) * (width / 2 - 0.25); box(B.prop, w, tt, 1.1, base + 0.45, 0.5, 0.9, 0.5, [0.32, 0.3, 0.27]); box(B.prop, w, tt, 1.1, base + 0.93, 0.56, 0.06, 0.56, DARK); } // a trash can
      if (b.cat !== 'vacant' && (h >>> 19) % 2 === 0) { const tt = c + (h & 4 ? 1 : -1) * (width / 2 - 0.5); box(B.prop, w, tt, 0.6, base + 0.3, 0.7, 0.6, 0.7, [0.55, 0.42, 0.3]); box(B.prop, w, tt, 0.6, base + 0.68, 0.62, 0.18, 0.62, GREEN); } // a planter
      close(Bd, m);
      const s = { name: b.name, type: b.cat === 'vacant' ? 'vacant' : b.type, cat: b.cat, x: b.x, z: b.z, B: Bd, bay: b }; stores.push(s); C.stores = (C.stores || []).concat(s);
    }
    if (C.cinema) { // the AMC: a tall glass front under a black canopy, its marquee and posters
      const { B: Bd, w } = C.cinema, mid = w.L / 2, base = Bd.base + 0.6, H = Bd.top - Bd.base, m = mark();
      panel(B.glass, w, mid, 0.07, base + 2.3, 16, 4.4, roomUV('restaurant'));
      for (let k = -4; k <= 4; k++) box(B.frame, w, mid + k * 2, 0.12, base + 2.3, 0.16, 4.4, 0.14, ALU);
      box(B.frame, w, mid, 0.12, base + 4.55, 16.4, 0.2, 0.16, ALU); box(B.awning, w, mid, 2.2, base + 5.1, 20, 0.5, 4.4, [0.08, 0.08, 0.09]);
      for (const k of [-9, 9]) box(B.frame, w, mid + k, 4.1, base + 2.4, 0.3, 4.8, 0.3, DARK);
      under(B.light, w, mid, 0.6, 4, base + 4.84, 18, [1, 0.95, 0.85]);
      const big = sign('AMC', '#c8102e', '#ffffff', 'cabinet', null, '400 {s}px "Anton"'), sub = sign('CARMEL MOUNTAIN 12', '#111418', '#ffffff', 'cabinet', 'TICKETS · IMAX · DOLBY', '600 {s}px "Oswald"');
      if (big) panel(B.sign, w, mid, 0.18, base + Math.min(H - 1.2, 8.4), 8, 2, big); if (sub) panel(B.sign, w, mid, 0.18, base + 6.15, 6, 1.5, sub);
      close(Bd, m); const s = { name: 'AMC Carmel Mountain 12', type: 'cinema', cat: 'cinema', x: w.ax + w.ux * mid + w.nx * 3, z: w.az + w.uz * mid + w.nz * 3, B: Bd }; stores.push(s); C.stores = (C.stores || []).concat(s);
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const redraw = () => { for (const d of draws) d(); tex.needsUpdate = true; };
    if (document.fonts && document.fonts.load) Promise.all([...faces].map(f => document.fonts.load(f).catch(() => null))).then(redraw); // fetched now if no page text has used them yet
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
    setTimeout(() => { for (const d of draws) d(); tex.needsUpdate = true; }, 4000); // (the parody marks redraw once their fonts are in)
    const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12, transparent: true, alphaTest: 0.35 });
    const neonMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const glassMat = mats.glass.clone(); glassMat.map = roomTexture(); glassMat.emissiveMap = roomTexture();
    const group = new THREE.Group(), meshes = {};
    for (const k in B) {
      const a = B[k]; if (!a.length) continue; const n = a.length / 11, P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2), CO = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const q = i * 11; P[i * 3] = a[q]; P[i * 3 + 1] = a[q + 1]; P[i * 3 + 2] = a[q + 2]; N[i * 3] = a[q + 3]; N[i * 3 + 1] = a[q + 4]; N[i * 3 + 2] = a[q + 5]; UV[i * 2] = a[q + 6]; UV[i * 2 + 1] = a[q + 7]; CO[i * 3] = a[q + 8]; CO[i * 3 + 1] = a[q + 9]; CO[i * 3 + 2] = a[q + 10]; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); geo.setAttribute('color', new THREE.BufferAttribute(CO, 3)); geo.computeBoundingSphere();
      const mat = k === 'sign' ? signMat : k === 'neon' ? neonMat : k === 'glass' ? glassMat : mats[k];
      const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.castShadow = k === 'awning' || k === 'prop'; mesh.matrixAutoUpdate = false; group.add(mesh); meshes[k] = mesh;
    }
    scene.add(group);
    C.built = { group, meshes, tex, signMat, neonMat, glassMat };
    // the doors: knock-only until the store's interior opens (src/world/interiors.js)
    if (o.addInteract) for (const s of C.stores || []) if (!doorsOn.has(s)) { doorsOn.add(s); o.addInteract({ x: s.x, z: s.z, r: s.type === 'cinema' ? 5 : 2.4, when: () => !s.B.dead && !(o.inCar && o.inCar()) && !(o.interiorOpen && o.interiorOpen(s)),
      label: () => s.type === 'vacant' ? 'Vacant storefront' : `<b>${s.name}</b> · ${isOpen(s, o.hour()) ? 'open' : 'closed'}`,
      onUse: () => { if (o.sfx) o.sfx.punch(0.25); const open = isOpen(s, o.hour()); o.notify(s.type === 'vacant' ? 'Nobody\'s home. The sign says to call a leasing agent.' : s.type === 'cinema' ? (open ? 'Every showing is sold out tonight. Try the late show.' : 'The AMC is closed. The last show let out a while ago.') : open ? `${s.name} is open: walk on in.` : `${s.name} is closed. Hours are on the door.`, '', 2600); } }); }
  }
  function dropCentre(C) { const b = C.built; if (!b) return; scene.remove(b.group); for (const m of Object.values(b.meshes)) m.geometry.dispose(); b.tex.dispose(); b.signMat.dispose(); b.neonMat.dispose(); b.glassMat.dispose(); C.built = null;
    for (const s of C.stores || []) { const i = stores.indexOf(s); if (i >= 0) stores.splice(i, 1); } C.stores = []; for (const [Bd, r] of ranges) for (const k in r) if (Array.isArray(r[k])) r[k] = r[k].filter(e => e[0] !== C); }
  const isOpen = (s, hour) => s.type === 'cinema' ? hour >= 10 || hour < 0.5 : s.cat === 'bank' ? hour >= 9 && hour < 17 : s.type === 'fast_food' || s.cat === 'cafe' || s.cat === 'sweets' ? hour >= 6 && hour < 22 : s.cat === 'liquor' ? hour >= 7 || hour < 1 : hour >= 9.5 && hour < 21;
  let t = 0;
  return {
    center: PLAZA_CENTER, stores, PLAN,
    update(f, nightAmt) {
      night.v = nightAmt;
      if ((t -= 1) <= 0) { t = 20; for (const C of PLAN.centres) { const d = Math.hypot(f.x - C.x, f.z - C.z); if (!C.built && d < 900) buildCentre(C); else if (C.built && d > 1500) dropCentre(C); } }
      for (const C of PLAN.centres) if (C.built) { const B = C.built; B.signMat.emissiveIntensity = 0.12 + nightAmt * 1.1; B.glassMat.emissiveIntensity = 0.05 + nightAmt * 0.75; B.neonMat.opacity = 0.75 + nightAmt * 0.25; }
      mats.light.color.setScalar(0.55 + nightAmt * 0.45);
    },
    onCollapse(Bd) { // its storefronts go with it (kept aside, so they come back when the building is rebuilt)
      const r = ranges.get(Bd); if (!r || r.saved) return; r.saved = [];
      for (const k in r) { if (k === 'saved') continue; for (const [C, a, e] of r[k]) { const m = C.built && C.built.meshes[k]; if (!m) continue; const pos = m.geometry.attributes.position; r.saved.push([m, a, pos.array.slice(a * 3, e * 3)]); for (let i = a; i < e; i++) pos.setXYZ(i, 0, -1000, 0); pos.needsUpdate = true; } }
    },
    onRepair(Bd) { const r = ranges.get(Bd); if (!r || !r.saved) return; for (const [m, a, arr] of r.saved) { m.geometry.attributes.position.array.set(arr, a * 3); m.geometry.attributes.position.needsUpdate = true; } r.saved = null; },
    paintedGlass(b, show) { // a bay's painted room on (closed) or off (its real room is open behind clear glass)
      const m = b.C && b.C.built && b.C.built.meshes.glass; if (!m || !b.glass) return; const pos = m.geometry.attributes.position, [a, e] = b.glass;
      if (!show) { if (b.savedGlass) return; b.savedGlass = pos.array.slice(a * 3, e * 3); for (let i = a; i < e; i++) pos.setXYZ(i, 0, -1000, 0); }
      else { if (!b.savedGlass) return; pos.array.set(b.savedGlass, a * 3); b.savedGlass = null; }
      pos.needsUpdate = true;
    },
  };
}
