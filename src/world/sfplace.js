// Sketchfab things in the world (src/sf.js models), chosen by rule and by hash so a corner looks the same each time you
// come back. Cells of 128 m are built around the player as their models arrive and let go once you're well past them.
//  - sidewalks: a line of things by the curb and one at the back of the walk, by the kind of neighbourhood
//    (src/world/zones.js): meters and scooters downtown, bins and the odd couch out for bulky-item pickup in the
//    suburbs, yard trees up in the rich hills, people standing about where it's busy. The club strip at Carmel Mountain
//    Plaza gets its doormen and its crowd. Where a street has no sidewalk, in the country and the industrial parks,
//    the shoulder gets the farm and work vehicles instead.
//  - parks and school grounds: benches (someone sitting on some), tables, trees and plants, a statue in the big parks
//  - beaches: chairs, coolers and people on the sand (the umbrellas, towels and boards are src/world/water.js's)
//  - airfields: a plane or a helicopter
//  - places (shops, banks, schools, the fire station...): things out front, someone at work by the door, and the
//    place's own vehicle (a fire truck, an ambulance, the school bus)
// People keep their own rig and play their first animation; everything else is frozen where it stands. Nothing goes
// on a road or inside a building, and no palms, gums, live oaks or cypress: those are grown in code (STYLE.md).
//   const SP = createSfPlacer(H)   SP.update(x, z, dt) (every frame: builds a little, plays the people)   SP.count()
// H: { THREE, scene, SF, edges, egrid, EG, ckey, edgePos, zoneHere, heightAt, areasNear(x0, z0, x1, z1) -> [{k, p}],
//      pois: [{ type, x, z }], nearSignal(x, z, r), nearestEdge(x, z, r, filter), pip(x, z, poly), addPoly(flat, base, top) -> i,
//      dropPoly(i), blocked(x, z, r) (a building, a wall), onRoad(x, z, margin), plaza: { x, z } | null }
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';

const CELL = 128, NEAR = 230, FAR = 330;
// weights by zone kind, for the line by the curb and the line at the back of the walk
const CURB = {
  downtown: { 'fire hydrant': 2, 'parking meter': 4, 'bollard': 2, 'newspaper box': 2, 'vespa': 0.4, 'scooter': 0.4, 'motorbike': 0.3, 'motorcycle': 0.2, 'harley davidson': 0.15, 'sport bike': 0.15, 'bicycle': 0.3, 'street sign': 0.4, 'manhole': 0.3 },
  beach: { 'fire hydrant': 1, 'parking meter': 2, 'bollard': 1, 'bicycle': 1, 'scooter': 0.6, 'vespa': 0.3, 'bmx': 0.3 },
  working: { 'fire hydrant': 2, 'wheelie bin': 3, 'shopping cart': 1, 'traffic cone': 0.5, 'road barrier': 0.3, 'jersey barrier': 0.2, 'manhole': 0.3 },
  suburb: { 'fire hydrant': 2, 'mailbox': 3, 'wheelie bin': 3, 'recycling bin': 2, 'couch': 0.15, 'sofa': 0.1, 'armchair': 0.1, 'television': 0.06, 'refrigerator': 0.05, 'washing machine': 0.05 },
  comfy: { 'fire hydrant': 2, 'mailbox': 3, 'wheelie bin': 2, 'recycling bin': 2, 'couch': 0.06 },
  rich: { 'fire hydrant': 2, 'mailbox': 2, 'golf cart': 0.15 },
  rural: { 'mailbox': 3 },
};
const BACK = {
  downtown: { 'trash can': 4, 'bench urban': 3, 'park bench': 1, 'planter': 3, 'potted plant': 1, 'bike rack': 2, 'vending machine': 1, 'atm': 0.5, 'phone booth': 0.5, 'mailbox': 1, 'newspaper stand': 1, 'food cart': 0.6, 'hot dog stand': 0.6, 'street vendor cart': 0.6, 'bus stop': 0.5, 'electrical box': 1,
    'standing woman': 0.5, 'casual man': 0.4, 'businessman': 0.4, 'businesswoman': 0.2, 'realistic man': 0.3, 'realistic woman': 0.2, 'walking woman': 0.2, 'old man': 0.2, 'old woman': 0.1, 'office worker': 0.2, 'hip hop': 0.15, 'musician': 0.15, 'punk': 0.05,
    'public art': 0.08, 'sculpture': 0.06, 'bust': 0.04 },
  beach: { 'trash can': 3, 'bench urban': 2, 'bike rack': 3, 'surfboard': 1, 'food cart': 1, 'planter': 1, 'beach umbrella': 0.3, 'beach man': 1, 'surfer': 0.4, 'standing woman': 0.5, 'casual woman': 0.2 },
  working: { 'dumpster': 2, 'trash bag': 2, 'cardboard box': 2, 'pallet': 1.5, 'tire stack': 1, 'oil drum': 1, 'barrel': 0.4, 'wooden crate': 0.5, 'gas cylinder': 0.3, 'pipes': 0.3, 'concrete block': 0.3, 'generator': 0.2, 'porta potty': 0.2, 'wheelbarrow': 0.2, 'scaffolding': 0.1, 'ladder': 0.1, 'trash can': 1, 'vending machine': 0.5, 'electrical box': 1,
    'construction worker': 0.3, 'mechanic': 0.15, 'thug': 0.1, 'gangster': 0.08 },
  suburb: { 'electrical box': 1, 'planter': 0.5, 'park bench': 0.3, 'lemon tree': 0.15, 'orange tree': 0.1, 'bird of paradise': 0.2, 'agave': 0.2, 'basketball hoop': 0.2, 'lawn mower': 0.05, 'gardener': 0.05, 'jogger': 0.03 },
  comfy: { 'electrical box': 1, 'planter': 0.6, 'olive tree': 0.2, 'hedge': 0.3, 'bird of paradise': 0.2, 'rose bush': 0.2, 'lavender': 0.2, 'gardener': 0.05 },
  rich: { 'planter': 1, 'olive tree': 0.3, 'lemon tree': 0.2, 'hedge': 0.5, 'bird of paradise': 0.3, 'garden statue': 0.1, 'gardener': 0.08 },
  rural: { 'oil drum': 0.5, 'pallet': 0.3, 'tumbleweed': 0.3, 'dry grass': 0.4, 'prickly pear': 0.3, 'yucca': 0.2, 'boulder': 0.3, 'tree stump': 0.2, 'wooden fence': 0.3 },
  club: { 'velvet rope': 1.5, 'neon sign': 0.8, 'speaker': 0.3, 'stage lights': 0.2, 'food cart': 0.4, 'hot dog stand': 0.4, 'trash can': 1, 'bouncer': 1.2, 'dj': 0.3, 'rapper': 0.6, 'hip hop': 0.6, 'dancer': 0.5, 'bartender': 0.3, 'standing woman': 0.8, 'walking woman': 0.3, 'casual man': 0.4, 'thug': 0.2 },
};
const DENSITY = { downtown: 0.4, beach: 0.28, working: 0.28, suburb: 0.13, comfy: 0.11, rich: 0.08, rural: 0.05, club: 0.5 };
// streets without a sidewalk: things on the shoulder, every 30 m at most
const SHOULDER = {
  rural: { 'tractor': 1, 'atv quad': 0.6, 'dirt bike': 0.4, 'trailer': 0.6, 'rv motorhome': 0.4, 'camper van': 0.4, 'flatbed truck': 0.3, 'farmer': 0.4, 'cowboy': 0.15, 'tumbleweed': 0.6, 'dead tree': 0.3, 'fallen log': 0.3, 'boulder': 0.6, 'desert plant': 0.4, 'wooden fence': 0.5 },
  working: { 'forklift': 0.6, 'box truck': 0.6, 'flatbed truck': 0.5, 'semi truck': 0.4, 'dump truck': 0.3, 'cement mixer': 0.3, 'excavator': 0.3, 'crane truck': 0.15, 'garbage truck': 0.2, 'cargo van': 0.5, 'tow truck': 0.2, 'dumpster': 1, 'pallet': 1, 'construction worker': 0.4, 'sandbags': 0.2, 'chain link fence': 0.3 },
};
const SHOULDER_DENSITY = { rural: 0.07, working: 0.12 };
const PARK = { 'park bench': 4, 'picnic table': 3, 'trash can': 3, 'grill bbq': 1, 'playground': 0.5, 'basketball hoop': 0.3,
  'agave': 1, 'yucca': 1, 'bird of paradise': 1, 'rose bush': 1, 'lavender': 1, 'bush': 1.5, 'shrub': 1.5, 'succulent': 0.6, 'flowers': 0.6, 'fern': 0.2,
  'sycamore': 0.4, 'pine tree': 0.3, 'olive tree': 0.3,
  'jogger': 0.2, 'standing woman': 0.3, 'old man': 0.2, 'casual man': 0.2, 'gardener': 0.1, 'musician': 0.05, 'dancer': 0.05 };
const PARK_ONE = ['statue', 'bronze statue', 'fountain', 'monument', 'war memorial', 'sculpture', 'abstract sculpture', 'public art', 'horse statue', 'angel statue', 'lion statue', 'eagle statue', 'bear statue', 'obelisk', 'totem', 'greek statue', 'stone statue', 'plaque monument'];
const SCHOOL = { 'bike rack': 3, 'park bench': 2, 'trash can': 2, 'picnic table': 2, 'basketball hoop': 1, 'basketball player': 0.3, 'athlete': 0.2, 'teacher': 0.1 };
const BEACH = { 'beach chair': 2, 'cooler': 1.5, 'beach man': 3, 'standing woman': 2, 'casual woman': 0.5, 'surfer': 1.2, 'lifeguard': 0.3, 'fisherman': 0.4 }; // the umbrellas, towels and boards are water.js's
const AERO = { 'cessna': 2, 'helicopter': 1, 'police helicopter': 0.3 };
const SITTERS = ['sitting woman', 'sitting man'];
const AT_POI = { // things out front, who stands by the door, the place's own vehicle; share: how many of that kind get any
  shop: { share: 0.4, things: { 'potted plant': 1, 'trash can': 0.6, 'newspaper box': 0.3, 'neon sign': 0.3, 'vending machine': 0.2, 'mannequin': 0.3, 'clothes rack': 0.3, 'display case': 0.3 }, people: ['cashier', 'businesswoman', 'standing woman', 'casual woman', 'casual man'], vehicles: { 'delivery van': 0.15, 'box truck': 0.05 } },
  restaurant: { things: { 'umbrella table': 2, 'patio furniture': 1, 'potted plant': 1 }, people: ['waiter', 'chef'], vehicles: { 'food truck': 0.08 } },
  fast_food: { things: { 'umbrella table': 1, 'trash can': 1 }, people: ['cashier'] },
  cafe: { things: { 'umbrella table': 2, 'bike rack': 1, 'potted plant': 1 }, people: ['waiter', 'businesswoman', 'casual woman'] },
  bank: { things: { atm: 1 }, people: ['security guard', 'businessman'], vehicles: { 'armored truck': 0.5 } },
  fuel: { things: { 'propane tank': 1, 'vending machine': 1, 'trash can': 1 }, people: ['mechanic'], vehicles: { 'tow truck': 0.5 } },
  school: { things: { 'bike rack': 2 }, people: ['teacher', 'security guard'], vehicles: { 'school bus': 1 } },
  hospital: { things: { 'park bench': 1 }, people: ['doctor', 'nurse'], vehicles: { ambulance: 1 } },
  police: { things: { bollard: 2 }, people: ['police officer'] },
  fire_station: { things: {}, people: ['firefighter'], vehicles: { 'fire truck': 1 } },
  post_office: { things: { mailbox: 2 }, people: ['office worker'], vehicles: { 'mail truck': 1 } },
  library: { things: { 'park bench': 1, 'bike rack': 1, bust: 0.5 }, people: ['old man', 'teacher'] },
  mall: { things: { 'shopping cart': 3, planter: 2, fountain: 0.5 }, people: ['security guard', 'standing woman', 'casual man'], vehicles: { 'food truck': 0.5, 'delivery van': 0.5 } },
  place_of_worship: { things: { 'religious statue': 1, 'angel statue': 0.5 }, people: ['priest'] },
};
const CLOTHES = ['sneakers', 'hat', 'jacket', 'sunglasses', 'backpack', 'boots', 'shirt', 'suit']; // set out on a shop's display case
const SOLID = /bench|bus stop|dumpster|vending|phone booth|statue|sculpture|monument|memorial|fountain|playground|picnic|food cart|hot dog|vendor|atm|electrical box|planter|newspaper|mailbox|hydrant|parking meter|bollard|tire stack|oil drum|propane|grill|basketball|umbrella table|patio|couch|sofa|armchair|refrigerator|washing machine|lifeguard|porta potty|generator|concrete block|scaffolding|tree|palm|cypress|obelisk|totem|bust|display case|clothes rack|mannequin|speaker|stage lights/;

function hash(a, b = 0, c = 0) { const h = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return h - Math.floor(h); }
function weighted(table, r) { const e = Object.entries(table); let t = e.reduce((s, [, w]) => s + w, 0) * r; for (const [k, w] of e) { t -= w; if (t <= 0) return k; } return e[e.length - 1][0]; }
const solidKind = (e, term) => e.k === 'vehicle' || (e.k !== 'person' && SOLID.test(term));

export function createSfPlacer(H) {
  const { THREE, SF } = H;
  const cells = new Map(); // key -> { want: [placement], made: [{ obj, poly, mixer, id }] }
  let byTerm = null; const people = [];
  const terms = () => { // search term -> catalogue entries (src/sf.js things carry the term they were found by: e.q)
    if (byTerm) return byTerm; byTerm = new Map();
    for (const e of SF.credits()) if (e.k !== 'car' && e.q) { if (!byTerm.has(e.q)) byTerm.set(e.q, []); byTerm.get(e.q).push(e); }
    return byTerm;
  };
  const choose = (term, r) => { const l = terms().get(term); return l && l.length ? l[Math.floor(r * l.length) % l.length] : null; };
  const reach = e => Math.min(4, Math.max(0.3, Math.max(e.L, e.W) / 2));
  const free = (x, z, e) => !(H.onRoad && H.onRoad(x, z, 0.5)) && !(H.blocked && H.blocked(x, z, reach(e)));

  function plan(ci, cj) {
    const x0 = ci * CELL, z0 = cj * CELL, x1 = x0 + CELL, z1 = z0 + CELL, out = [], o = { x: 0, z: 0, tx: 0, tz: 0 };
    const zone = (x, z) => { try { return H.zoneHere(x, z).kind || 'suburb'; } catch (e) { return 'suburb'; } };
    const put = (e, term, x, z, rot, extra) => { out.push({ e, x, z, rot, solid: solidKind(e, term), person: e.k === 'person', ...extra }); };
    const sitOn = (bench, seed) => { // someone on some of the benches, facing the way the bench does
      if (hash(seed, 41) > 0.3) return; const who = choose(SITTERS[hash(seed, 42) < 0.5 ? 0 : 1], hash(seed, 43)); if (!who) return;
      put(who, '', bench.x + Math.sin(bench.rot) * 0.18, bench.z + Math.cos(bench.rot) * 0.18, bench.rot);
    };
    // sidewalks (and shoulders): each street belongs to the cell its middle is in
    const seen = new Set();
    for (let gx = Math.floor(x0 / H.EG) - 1; gx <= Math.floor(x1 / H.EG) + 1; gx++) for (let gz = Math.floor(z0 / H.EG) - 1; gz <= Math.floor(z1 / H.EG) + 1; gz++) {
      for (const ei of H.egrid.get(H.ckey(gx, gz)) || []) {
        if (seen.has(ei)) continue; seen.add(ei); const e = H.edges[ei]; if (!e || e.t < 1 || e.t > 5 || e.len < 24) continue;
        H.edgePos(e, e.len / 2, o); if (o.x < x0 || o.x >= x1 || o.z < z0 || o.z >= z1) continue;
        let Z = zone(o.x, o.z);
        if (H.plaza && Math.hypot(o.x - H.plaza.x, o.z - H.plaza.z) < 140) Z = 'club';
        for (const side of [1, -1]) {
          const walk = side > 0 ? e.walkP : e.walkN;
          if (!walk) { // no sidewalk on that side: the shoulder, in the country and the industrial parks
            const T = SHOULDER[Z]; if (!T) continue;
            for (let s = 15, slot = 0; s < e.len - 15; s += 30, slot++) {
              if (hash(ei, slot, side + 3) > SHOULDER_DENSITY[Z]) continue;
              const term = weighted(T, hash(ei, slot + 0.7, side)), ent = choose(term, hash(ei, slot, side + 9)); if (!ent) continue;
              H.edgePos(e, s, o); const off = (e.w / 2 + 1.5 + reach(ent)) * side, x = o.x - o.tz * off, z = o.z + o.tx * off;
              if (H.nearSignal(x, z, 12) || !free(x, z, ent)) continue;
              const along = Math.atan2(o.tx, o.tz) + (hash(ei, slot, 5) < 0.5 ? Math.PI : 0);
              put(ent, term, x, z, ent.k === 'vehicle' ? along : ent.k === 'person' ? Math.atan2(o.x - x, o.z - z) : hash(ei, slot, 6) * 6.283);
            }
            continue;
          }
          const dens = DENSITY[Z] ?? 0.1;
          for (let s = 11, slot = 0; s < e.len - 11; s += 9, slot++) {
            const r = hash(ei, slot, side); if (r > dens) continue;
            const curb = hash(ei + 0.5, slot, side) < 0.45, term = weighted(curb ? CURB[Z] || CURB.downtown : BACK[Z] || BACK.suburb, hash(ei, slot + 0.3, side));
            const ent = choose(term, hash(ei, slot, side + 7)); if (!ent) continue;
            H.edgePos(e, s, o); const off = (curb ? e.w / 2 + 0.55 : walk + 0.9) * side, x = o.x - o.tz * off, z = o.z + o.tx * off;
            if (H.nearSignal(x, z, 9) || H.nearestEdge(x, z, 3.5, q => q.t === 6)) continue; // corners and driveways stay clear
            if ((ent.k === 'vehicle' || ent.k === 'plant') && H.blocked && H.blocked(x, z, Math.min(1.2, reach(ent)))) continue;
            const face = Math.atan2(o.x - x, o.z - z); // its front to the street
            const rot = ent.k === 'vehicle' ? Math.atan2(o.tx, o.tz) + (hash(ei, slot, 8) < 0.5 ? Math.PI : 0) : ent.k === 'plant' || ent.k === 'statue' ? hash(ei, slot, 4) * 6.283 : face;
            put(ent, term, x, z, rot);
            if (/bench/.test(term)) sitOn({ x, z, rot }, ei * 31 + slot * 7 + side);
          }
        }
      }
    }
    // parks, school grounds, beaches and airfields: spread over the area, in the cell its middle is in
    for (const A of H.areasNear(x0, z0, x1, z1)) {
      const table = A.k === 1 ? PARK : A.k === 3 ? SCHOOL : A.k === 4 ? BEACH : A.k === 5 ? AERO : null; if (!table) continue;
      let ax = 0, az = 0, mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9; const n = A.p.length / 2;
      for (let i = 0; i < n; i++) { const x = A.p[i * 2], z = A.p[i * 2 + 1]; ax += x; az += z; mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z); }
      ax /= n; az /= n; if (ax < x0 || ax >= x1 || az < z0 || az >= z1) continue;
      let area = 0; for (let i = 0, j = n - 1; i < n; j = i++) area += (A.p[j * 2] + A.p[i * 2]) * (A.p[j * 2 + 1] - A.p[i * 2 + 1]); area = Math.abs(area) / 2;
      const seed = Math.round(ax * 7 + az * 13);
      const count = A.k === 5 ? Math.min(3, Math.floor(area / 40000)) : A.k === 4 ? Math.min(30, Math.max(2, Math.round(area / 350))) : Math.min(14, Math.max(1, Math.round(area / 900)));
      if (A.k === 1 && area > 2500 && H.pip(ax, az, A.p)) { const ent = choose(PARK_ONE[Math.floor(hash(seed, 1) * PARK_ONE.length)], hash(seed, 2)); if (ent && free(ax, az, ent)) put(ent, 'statue', ax, az, hash(seed, 3) * 6.283); }
      for (let k = 0, tries = 0; k < count && tries < count * 6; tries++) {
        const x = mnx + (mxx - mnx) * hash(seed, tries, 11), z = mnz + (mxz - mnz) * hash(seed, tries, 12);
        if (!H.pip(x, z, A.p) || Math.hypot(x - ax, z - az) < 6 || H.nearestEdge(x, z, 5, q => q.t <= 5)) continue;
        const term = weighted(table, hash(seed, tries, 13)), ent = choose(term, hash(seed, tries, 14)); if (!ent || !free(x, z, ent)) continue;
        const rot = hash(seed, tries, 15) * 6.283; put(ent, term, x, z, rot); k++;
        if (/bench/.test(term)) sitOn({ x, z, rot }, seed + tries * 13);
      }
    }
    // places: a few things out front, someone at work by the door, the place's own vehicle along the frontage
    for (const P of H.pois) {
      if (P.x < x0 || P.x >= x1 || P.z < z0 || P.z >= z1) continue; const R = AT_POI[P.type]; if (!R) continue;
      const seed = Math.round(P.x * 3 + P.z * 5); if (R.share && hash(seed, 51) > R.share) continue;
      const near = H.nearestEdge(P.x, P.z, 60, q => q.t >= 1 && q.t <= 5); let fx = 0, fz = 1;
      if (near && near.x !== undefined) { const d = Math.hypot(near.x - P.x, near.z - P.z) || 1; fx = (near.x - P.x) / d; fz = (near.z - P.z) / d; }
      const front = (ent, d0, side) => { // the first spot toward the street that's outside the building and off the road
        for (let d = d0; d < d0 + 12; d += 2) { const x = P.x + fx * d - fz * side, z = P.z + fz * d + fx * side; if (free(x, z, ent)) return [x, z]; }
        return null;
      };
      let k = 0;
      for (const [term, n] of Object.entries(R.things)) for (let i = 0; i < n; i++, k++) {
        if (n < 1 && hash(seed, k, 22) > n) continue;
        const ent = choose(term, hash(seed, k, 21)); if (!ent) continue;
        const at = front(ent, 6, (k % 2 ? 1 : -1) * (2 + k * 1.6)); if (!at) continue;
        put(ent, term, at[0], at[1], Math.atan2(fx, fz));
        if (term === 'display case') { const c = choose(CLOTHES[Math.floor(hash(seed, k, 23) * CLOTHES.length)], hash(seed, k, 24)); if (c) put(c, 'clothes', at[0], at[1], Math.atan2(fx, fz), { dy: ent.H }); }
      }
      const who = choose(R.people[Math.floor(hash(seed, 31) * R.people.length)], hash(seed, 32));
      if (who) { const at = front(who, 5, 1.2); if (at) put(who, '', at[0], at[1], Math.atan2(fx, fz)); }
      for (const [term, p] of Object.entries(R.vehicles || {})) {
        if (hash(seed, 61, term.length) > p) continue; const ent = choose(term, hash(seed, 62)); if (!ent) continue;
        const at = front(ent, 8, 6); if (at) put(ent, term, at[0], at[1], Math.atan2(-fz, fx) + (hash(seed, 63) < 0.5 ? Math.PI : 0)); // along the street
      }
    }
    return out;
  }

  function make(c, w) {
    const src = SF.get(w.e.id); if (!src) return false;
    const animated = w.person && src.animations && src.animations.length;
    const obj = w.person ? cloneRig(src) : src.clone(true), y = H.heightAt(w.x, w.z) + (w.dy || 0);
    obj.position.set(w.x, y, w.z); obj.rotation.y = w.rot; obj.updateMatrixWorld(true);
    obj.traverse(o => { if (o.isMesh) { o.castShadow = w.e.H > 0.5; o.receiveShadow = true; if (o.isSkinnedMesh) o.frustumCulled = false; } });
    let mixer = null;
    if (animated) { mixer = new THREE.AnimationMixer(obj); mixer.clipAction(src.animations[0]).play(); mixer.update(hash(w.x, w.z) * 10); people.push(mixer); }
    else obj.traverse(o => { o.matrixAutoUpdate = false; });
    H.scene.add(obj); SF.use(w.e.id);
    let poly = -1;
    if (w.solid && w.e.L * w.e.W > 0.08) { // its footprint blocks people and cars, up to its height
      const c0 = Math.cos(w.rot), s0 = Math.sin(w.rot), hx = w.e.W / 2, hz = w.e.L / 2, P = [];
      for (const [a, b] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) P.push(w.x + a * c0 + b * s0, w.z - a * s0 + b * c0);
      poly = H.addPoly(P, y, y + w.e.H);
    }
    c.made.push({ obj, poly, mixer, id: w.e.id }); return true;
  }

  function drop(key) {
    const c = cells.get(key); if (!c) return;
    for (const m of c.made) { H.scene.remove(m.obj); SF.drop(m.id); if (m.poly >= 0) H.dropPoly(m.poly); if (m.mixer) { m.mixer.stopAllAction(); const i = people.indexOf(m.mixer); if (i >= 0) people.splice(i, 1); } }
    cells.delete(key);
  }

  let t = 0;
  return {
    update(x, z, dt) {
      for (const m of people) m.update(dt);
      if ((t += dt) < 0.5) return; t = 0;
      if (!SF.credits().some(e => e.k !== 'car')) return;
      const ci0 = Math.floor((x - NEAR) / CELL), ci1 = Math.floor((x + NEAR) / CELL), cj0 = Math.floor((z - NEAR) / CELL), cj1 = Math.floor((z + NEAR) / CELL);
      let planned = 0;
      for (let ci = ci0; ci <= ci1; ci++) for (let cj = cj0; cj <= cj1; cj++) {
        const key = ci + ',' + cj; let c = cells.get(key);
        if (!c) { if (planned++ > 1) continue; c = { want: plan(ci, cj), made: [] }; cells.set(key, c); for (const w of c.want) SF.load(w.e.id); }
        if (c.want.length) c.want = c.want.filter(w => !make(c, w) && SF.wanted(w.e.id)); // the ones whose model isn't here yet wait (a broken one is let go)
      }
      for (const key of [...cells.keys()]) { const [ci, cj] = key.split(',').map(Number), cx = (ci + 0.5) * CELL, cz = (cj + 0.5) * CELL; if (Math.hypot(cx - x, cz - z) > FAR + CELL * 0.7) drop(key); }
    },
    count: () => { let n = 0; for (const c of cells.values()) n += c.made.length; return n; },
    clear() { for (const k of [...cells.keys()]) drop(k); },
  };
}
