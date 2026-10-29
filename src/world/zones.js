// San Diego County by money and character, the way people from here talk about it: La Jolla, Del Mar, Rancho Santa
// Fe and Coronado are old money (supercars in the drives, private security, the Sheriff never far); north Poway's
// ranch estates and Rancho Bernardo are comfortable; downtown is glass towers, taxis and cops on every block; the beach
// towns are surf trucks, old vans and convertibles; Barrio Logan, City Heights, National City and El Cajon are working
// neighbourhoods (lowriders, pickups, cash in hand, fewer patrols); the back country is pickups and dust.
//   zoneAt(lat, lon) -> { name, kind, wealth 0..1, police (patrol multiplier), cars: { type: weight } }
// Zones are circles (km) blended by distance, the nearest-and-strongest winning; outside them, the region decides.
const CARS = {
  rich: { sports: 30, suv: 38, sedan: 26, pickup: 4, van: 2 },
  comfy: { suv: 36, sedan: 34, sports: 12, pickup: 12, van: 6 },
  downtown: { sedan: 46, suv: 18, van: 16, sports: 12, pickup: 8 },
  beach: { sedan: 28, suv: 22, pickup: 22, van: 16, sports: 12 },
  working: { sedan: 46, pickup: 26, van: 18, suv: 8, sports: 2 },
  rural: { pickup: 50, suv: 30, sedan: 16, van: 4 },
  suburb: { sedan: 38, suv: 26, pickup: 16, van: 10, sports: 10 },
};
const KIND = {
  rich: { wealth: 0.95, police: 1.6 }, comfy: { wealth: 0.75, police: 1.15 }, downtown: { wealth: 0.6, police: 2.0 }, beach: { wealth: 0.6, police: 1.2 },
  working: { wealth: 0.25, police: 0.85 }, rural: { wealth: 0.45, police: 0.5 }, suburb: { wealth: 0.55, police: 1.0 },
};
export const ZONES = [
  ['La Jolla', 32.840, -117.272, 3.6, 'rich'], ['Del Mar', 32.959, -117.262, 2.4, 'rich'], ['Rancho Santa Fe', 33.020, -117.200, 4.5, 'rich'],
  ['Coronado', 32.685, -117.180, 2.8, 'rich'], ['Fairbanks Ranch', 32.990, -117.180, 2.5, 'rich'], ['Point Loma', 32.718, -117.240, 2.6, 'comfy'],
  ['Carmel Valley', 32.935, -117.220, 3.0, 'comfy'], ['Green Valley', 33.010, -117.020, 3.2, 'comfy'], ['High Valley', 33.020, -116.990, 2.2, 'comfy'],
  ['Rancho Bernardo', 33.025, -117.070, 3.5, 'comfy'], ['Scripps Ranch', 32.905, -117.100, 3.0, 'comfy'], ['4S Ranch', 33.000, -117.120, 2.0, 'comfy'],
  ['Downtown San Diego', 32.715, -117.160, 1.9, 'downtown'], ['Little Italy', 32.724, -117.169, 0.8, 'downtown'],
  ['Pacific Beach', 32.797, -117.245, 2.3, 'beach'], ['Mission Beach', 32.770, -117.251, 1.2, 'beach'], ['Ocean Beach', 32.748, -117.248, 1.4, 'beach'],
  ['Encinitas', 33.045, -117.290, 2.6, 'beach'], ['Carlsbad', 33.160, -117.345, 2.8, 'beach'], ['Oceanside', 33.195, -117.375, 3.0, 'beach'], ['Imperial Beach', 32.577, -117.115, 1.8, 'beach'],
  ['Barrio Logan', 32.697, -117.143, 1.3, 'working'], ['City Heights', 32.748, -117.100, 2.4, 'working'], ['National City', 32.678, -117.099, 2.6, 'working'],
  ['El Cajon', 32.795, -116.962, 3.6, 'working'], ['Escondido', 33.120, -117.085, 3.6, 'working'], ['Chula Vista', 32.640, -117.080, 3.2, 'working'], ['Spring Valley', 32.745, -116.998, 2.2, 'working'],
  ['Ramona', 33.042, -116.868, 3.5, 'rural'], ['Lakeside', 32.857, -116.920, 2.5, 'rural'],
];
const KM_LAT = 110.95, KM_LON = 93.4; // km per degree near 33 N
export function zoneAt(lat, lon) {
  let best = null, bw = 0;
  for (const [name, la, lo, r, kind] of ZONES) {
    const d = Math.hypot((lat - la) * KM_LAT, (lon - lo) * KM_LON), w = 1 - d / r; if (w > bw) { bw = w; best = { name, kind }; }
  }
  if (!best) { // between the named places: the region
    const kind = lon > -116.93 ? 'rural' : lat > 32.92 && lon > -117.1 && lon < -116.98 ? 'suburb' : 'suburb';
    best = { name: kind === 'rural' ? 'Back country' : 'San Diego County', kind };
  }
  const K = KIND[best.kind]; return { name: best.name, kind: best.kind, wealth: K.wealth, police: K.police, cars: CARS[best.kind] };
}
export function pickCar(z, r = Math.random()) { let t = 0; for (const k in z.cars) t += z.cars[k]; let x = r * t; for (const k in z.cars) { x -= z.cars[k]; if (x <= 0) return k; } return 'sedan'; }
