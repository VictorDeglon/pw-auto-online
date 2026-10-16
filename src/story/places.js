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
};
