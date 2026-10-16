// Story locations. Stored as lat/lon (WGS84) so they survive an engine port; converted to game
// coordinates at runtime and snapped to the road graph:
//   snap 'sidewalk' → sidewalkNear() (where an NPC stands / a giver marker sits)
//   snap 'road'     → nearest point on a road named in `names` (race lines, car spawns)
// Real places are fine; businesses and people here are fictional (docs/roadmap README, legal path).
export const PLACES = {
  home: { special: 'home', note: 'The Reyes house on Cardinal Court (the game spawn point)' },
  sheriff: { special: 'sheriff', note: 'Poway Sheriff Station (OSM police POI)' },
  oldPoway: { lat: 32.969598, lon: -117.036831, snap: 'sidewalk', note: 'Old Poway Park, Midland Road (depot of the Poway-Midland Railroad)' },
  deeGarage: { lat: 32.934851, lon: -117.039283, snap: 'sidewalk', note: "Dee's Garage (fictional), Kirkham Way business park" },
  vance: { lat: 32.940052, lon: -117.030610, snap: 'road', names: ['Danielson Street'], note: 'Vance Prestige Motors (fictional), Danielson Street' },
  ranch: { lat: 32.942884, lon: -116.986458, snap: 'road', names: ['Sycamore Canyon Road'], note: 'Vance chop-shop ranch (fictional), Sycamore Canyon Road' },
  highValley: { lat: 32.991156, lon: -117.019497, snap: 'road', names: ['High Valley Road'], note: 'Repo SUV driveway, High Valley Road' },
  espolaStart: { lat: 32.970403, lon: -117.016157, snap: 'road', names: ['Espola Road'], note: 'Espola Run start: Espola Road just north of Poway Road' },
  lakeGate: { lat: 33.007313, lon: -117.016157, snap: 'road', names: ['Lake Poway Road'], note: 'Lake Poway Recreation Area gate, end of Lake Poway Road' },
  brenda: { lat: 32.964523, lon: -117.050524, snap: 'sidewalk', note: "Brenda's cul-de-sac (fictional), off Hickory Street" },
  twinPeaksW: { lat: 32.983340, lon: -117.061123, snap: 'road', names: ['Twin Peaks Road'], note: 'Twin Peaks Sprint start, east of Pomerado Road' },
  twinPeaksE: { lat: 32.978138, lon: -117.023651, snap: 'road', names: ['Twin Peaks Road'], note: 'Twin Peaks Sprint finish, at Espola Road' },
  parkwayW: { lat: 32.939374, lon: -117.050813, snap: 'road', names: ['Scripps Poway Parkway'], note: 'Parkway After Dark start, Scripps Poway Parkway west' },
  parkwayE: { lat: 32.946412, lon: -117.003545, snap: 'road', names: ['Scripps Poway Parkway'], note: 'Parkway After Dark finish, near Sycamore Canyon Road' },
  // storylines II-IV and Espola Road's back half (businesses fictional)
  canyonMouth: { lat: 32.952, lon: -116.988, snap: 'sidewalk', note: 'Salas Feed & Supply (fictional), Sycamore Canyon Road' },
  motel: { lat: 32.9566, lon: -117.048, snap: 'sidewalk', note: 'The Poway Inn (fictional), Poway Road west' },
  cityHall: { lat: 32.9529, lon: -117.0386, snap: 'sidewalk', note: 'Civic Center, Poway' },
  plaza: { special: 'plaza', note: 'Carmel Mountain Plaza' },
  plazaLot: { special: 'plaza', dx: 70, dz: 40, note: 'Carmel Mountain Plaza, back lot' },
  kirkhamBack: { lat: 32.933, lon: -117.0405, snap: 'sidewalk', note: 'Kirkham Way business park, back lots' },
  downtown: { lat: 32.9626, lon: -117.0355, snap: 'sidewalk', note: 'Poway Road, downtown' },
  gardenRd: { lat: 32.975, lon: -116.993, snap: 'road', names: ['Garden Road'], note: 'Garden Road' },
  powayRdEast: { lat: 32.959, lon: -116.992, snap: 'road', names: ['Poway Road'], note: 'Poway Road, east end' },
  midland: { lat: 32.9655, lon: -117.0365, snap: 'road', names: ['Midland Road'], note: 'Midland Road' },
  espolaNorth: { lat: 32.993, lon: -117.018, snap: 'road', names: ['Espola Road'], note: 'Espola Road, north' },
  blueSky: { lat: 33.001, lon: -117.024, snap: 'sidewalk', note: 'Blue Sky Ecological Reserve trailhead, Espola Road' },
  lakeRamp: { lat: 33.004, lon: -117.0185, snap: 'road', names: ['Lake Poway Road'], note: 'Lake Poway Road' },
  woodsonTop: { special: 'summit', note: 'Mt Woodson, the summit' },
  woodsonRamp: { special: 'summit', below: 1, note: 'Mt Woodson, the road down' },
  hospital: { special: 'hospital', note: 'Palomar Medical Center Poway' },
};
