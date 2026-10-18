// Named regions and map sectors, so players always know where they are ("Twin Peaks · F5").
// Regions are the nearest anchor (neighbourhood, landmark) within reach; anchors sit on the park or school that gives
// the area its name, in game metres (x east, z south). Sectors are a 1 km grid: columns A.. from the west edge,
// rows 1.. from the north edge.
//   regionAt(x, z) -> region   sectorAt(x, z) -> 'F5'   SECTOR (grid frame for the map)
//   initRegionBanner()  updateRegion(x, z, dt)   shows a banner when you cross into a new region
export const REGIONS = [
  // Poway
  { id: 'old-poway', name: 'Old Poway', district: 'Poway', x: -170, z: -1080, col: '#d9a441', tag: 'Trains, barns and the Saturday market' },
  { id: 'town-center', name: 'Town Center', district: 'Poway', x: -600, z: -140, col: '#e8743b', tag: 'Poway Road, all of it' },
  { id: 'civic-center', name: 'Civic Center', district: 'Poway', x: -1050, z: 600, col: '#5d8fd8', tag: 'City hall, the Sheriff, Community Park' },
  { id: 'starridge', name: 'Starridge', district: 'Poway', x: -1560, z: -440, col: '#9b7fd1', tag: 'Cul-de-sacs and quiet streets' },
  { id: 'silverset', name: 'Silverset', district: 'Poway', x: -1385, z: -2285, col: '#7ab8a8', tag: 'Ranch houses on the hill' },
  { id: 'twin-peaks', name: 'Twin Peaks', district: 'Poway', x: 450, z: -2240, col: '#c75b5b', tag: 'Two schools and a long hill' },
  { id: 'espola', name: 'Espola', district: 'Poway', x: 860, z: -4260, col: '#3b8fe8', tag: 'Home of the Titans' },
  { id: 'lake-poway', name: 'Lake Poway', district: 'Poway', x: 2300, z: -5090, col: '#3fb6d9', tag: 'Fishing, hiking, Mt. Woodson trail' },
  { id: 'green-valley', name: 'Green Valley', district: 'Poway', x: -285, z: -6185, col: '#6fbf5a', tag: 'Horse country' },
  { id: 'valle-verde', name: 'Valle Verde', district: 'Poway', x: -1025, z: -6595, col: '#8fcf6a', tag: 'Big lots, long driveways' },
  { id: 'blue-sky', name: 'Blue Sky', district: 'Poway', x: 3300, z: -6300, col: '#4a9bd0', tag: 'Ecological reserve' },
  { id: 'mt-woodson', name: 'Mt. Woodson', district: 'Poway', x: 7100, z: -6120, col: '#b08a5a', tag: 'Golf, boulders, Potato Chip Rock' },
  { id: 'iron-mountain', name: 'Iron Mountain', district: 'Poway', x: 6400, z: -2600, col: '#a0704a', tag: 'Highway 67 and the switchbacks' },
  { id: 'garden-road', name: 'Garden Road', district: 'Poway', x: 2250, z: 270, col: '#84b04a', tag: 'Ranches up the canyon' },
  { id: 'sycamore', name: 'Sycamore Creek', district: 'Poway', x: 3110, z: 40, col: '#5aa06a', tag: 'Oak groves and creek beds' },
  { id: 'south-poway', name: 'South Poway', district: 'Poway', x: 940, z: 2590, col: '#8a8f99', tag: 'The business park' },
  { id: 'sportspark', name: 'Sportspark', district: 'Poway', x: -570, z: 1835, col: '#e0b040', tag: 'Ball fields under the lights' },
  { id: 'poway-oaks', name: 'Poway Oaks', district: 'Poway', x: -2540, z: 1305, col: '#b9a06a', tag: 'Tract homes and pocket parks' },
  { id: 'meadowbrook', name: 'Meadowbrook', district: 'Poway', x: -2875, z: -595, col: '#d07a9a', tag: 'Middle school and the creek' },
  { id: 'arbolitos', name: 'Rancho Arbolitos', district: 'Poway', x: -2440, z: -1900, col: '#c4a35a', tag: 'Ball fields and the west hills' },
  { id: 'pomerado', name: 'Pomerado', district: 'Poway', x: -2000, z: -4040, col: '#e06060', tag: 'The hospital and Pomerado Road' },
  // the San Diego neighbourhoods around Poway
  { id: 'highland-ranch', name: 'Highland Ranch', district: 'San Diego', x: -3460, z: -2550, col: '#9a8ad0', tag: 'Up the hill from the 15' },
  { id: 'rancho-bernardo', name: 'Rancho Bernardo', district: 'San Diego', x: -2900, z: -3900, col: '#c08040', tag: 'Red tile roofs' },
  { id: 'bernardo-heights', name: 'Bernardo Heights', district: 'San Diego', x: -3260, z: -4730, col: '#7a9a50', tag: 'The country club' },
  { id: 'high-country', name: 'High Country West', district: 'San Diego', x: -4490, z: -5170, col: '#a07a60', tag: 'Ridges and canyons' },
  { id: 'westwood', name: 'Westwood', district: 'San Diego', x: -3925, z: -6440, col: '#80a0b0', tag: 'Webb Park and the west side' },
  { id: 'rolling-hills', name: 'Rolling Hills', district: 'San Diego', x: -5330, z: -3440, col: '#90b070', tag: 'Hills, as advertised' },
  { id: 'cm-plaza', name: 'Carmel Mountain Plaza', district: 'San Diego', x: -4300, z: -2350, col: '#e05050', tag: 'The AMC, and every store you need' },
  { id: 'carmel-mountain', name: 'Carmel Mountain Ranch', district: 'San Diego', x: -5260, z: -760, col: '#b07a9a', tag: 'The plaza and the 56' },
  { id: 'sabre-springs', name: 'Sabre Springs', district: 'San Diego', x: -4030, z: 1830, col: '#6a90c0', tag: 'Creekside and South Creek' },
  { id: 'penasquitos', name: 'Rancho Peñasquitos', district: 'San Diego', x: -5430, z: 2880, col: '#c0906a', tag: 'Black Mountain\'s shadow' },
];
// the outer world (src/world/outer.js): 50 km around Poway, from the beaches to the back country. Anchors in lat / lon;
// r: how far the name reaches (m), bigger than Poway's neighbourhoods
const ll = (lat, lon) => ({ x: Math.round((lon + 117.035) * 93403.11), z: Math.round(-(lat - 32.96) * 110540) });
const OUTER_REGIONS = [
  ['downtown', 'Downtown', 'San Diego', 32.7157, -117.1611, '#f0b23a', 'Gaslamp, the ballpark and the bay', 1600],
  ['little-italy', 'Little Italy', 'San Diego', 32.7243, -117.1690, '#e06060', 'Espresso and the airport flight path', 900],
  ['balboa-park', 'Balboa Park', 'San Diego', 32.7341, -117.1446, '#6fbf5a', 'Museums, gardens and the zoo', 1400],
  ['hillcrest', 'Hillcrest', 'San Diego', 32.7484, -117.1661, '#c06ac0', 'The sign, the bars, the brunch lines', 1100],
  ['north-park', 'North Park', 'San Diego', 32.7480, -117.1300, '#d07a9a', 'Craft beer on every corner', 1500],
  ['mission-valley', 'Mission Valley', 'San Diego', 32.7700, -117.1600, '#5d8fd8', 'Malls, the river and the 8', 2200],
  ['old-town', 'Old Town', 'San Diego', 32.7540, -117.1970, '#d9a441', 'Where San Diego started', 1000],
  ['point-loma', 'Point Loma', 'San Diego', 32.7200, -117.2400, '#4a9bd0', 'Lighthouse, cliffs and the Navy', 2600],
  ['ocean-beach', 'Ocean Beach', 'San Diego', 32.7495, -117.2470, '#3fb6d9', 'The pier and the dog beach', 1200],
  ['mission-beach', 'Mission Beach', 'San Diego', 32.7700, -117.2520, '#3fb6d9', 'Boardwalk and the roller coaster', 1300],
  ['mission-bay', 'Mission Bay', 'San Diego', 32.7800, -117.2250, '#3b8fe8', 'Islands, kites and SeaWorld', 1800],
  ['pacific-beach', 'Pacific Beach', 'San Diego', 32.7967, -117.2536, '#3fb6d9', 'Crystal Pier and Garnet Avenue', 1600],
  ['la-jolla', 'La Jolla', 'San Diego', 32.8400, -117.2713, '#7ab8a8', 'The Cove, sea lions and big houses', 2400],
  ['utc', 'University City', 'San Diego', 32.8710, -117.2210, '#9b7fd1', 'UC San Diego and the Golden Triangle', 2600],
  ['torrey-pines', 'Torrey Pines', 'San Diego', 32.9200, -117.2500, '#84b04a', 'Gliders over the cliffs', 2000],
  ['clairemont', 'Clairemont', 'San Diego', 32.8300, -117.2000, '#b9a06a', 'Mesa tops and canyons', 2400],
  ['kearny-mesa', 'Kearny Mesa', 'San Diego', 32.8331, -117.1250, '#8a8f99', 'Convoy Street and the 163', 2000],
  ['miramar', 'MCAS Miramar', 'San Diego', 32.8686, -117.1428, '#a0704a', 'Jets overhead. Do not land here.', 3200],
  ['mira-mesa', 'Mira Mesa', 'San Diego', 32.9156, -117.1439, '#c0906a', 'Tract homes on the mesa', 2200],
  ['scripps-ranch', 'Scripps Ranch', 'San Diego', 32.9100, -117.1000, '#5aa06a', 'Eucalyptus and Miramar Lake', 2200],
  ['sorrento-valley', 'Sorrento Valley', 'San Diego', 32.9000, -117.2050, '#80a0b0', 'Biotech and the Coaster', 1800],
  ['carmel-valley', 'Carmel Valley', 'San Diego', 32.9400, -117.2200, '#b07a9a', 'Newer houses, bigger lawns', 2200],
  ['tierrasanta', 'Tierrasanta', 'San Diego', 32.8240, -117.0950, '#7a9a50', 'A suburb on an old artillery range', 1800],
  ['mission-trails', 'Mission Trails', 'San Diego', 32.8250, -117.0500, '#84b04a', 'Cowles Mountain and the gorge', 2600],
  ['del-mar', 'Del Mar', 'Del Mar', 32.9595, -117.2653, '#3fb6d9', 'The racetrack and the fair', 1800],
  ['solana-beach', 'Solana Beach', 'Solana Beach', 32.9912, -117.2711, '#3fb6d9', 'Bluffs and the Belly Up', 1600],
  ['rancho-santa-fe', 'Rancho Santa Fe', 'Rancho Santa Fe', 33.0203, -117.2028, '#d9a441', 'Horses, golf and gates', 3000],
  ['encinitas', 'Encinitas', 'Encinitas', 33.0370, -117.2920, '#3fb6d9', 'Swami\'s and the surf', 2600],
  ['carlsbad', 'Carlsbad', 'Carlsbad', 33.1581, -117.3506, '#3fb6d9', 'Flower fields and the lagoons', 3600],
  ['oceanside', 'Oceanside', 'Oceanside', 33.1959, -117.3795, '#3b8fe8', 'The longest wooden pier on the coast', 3200],
  ['camp-pendleton', 'Camp Pendleton', 'Marine Corps', 33.3000, -117.3500, '#a0704a', 'Restricted. Mostly hills.', 9000],
  ['fallbrook', 'Fallbrook', 'Fallbrook', 33.3764, -117.2511, '#6fbf5a', 'Avocado capital of the world', 4000],
  ['vista', 'Vista', 'Vista', 33.2000, -117.2425, '#e0b040', 'Breweries and hills', 3200],
  ['san-marcos', 'San Marcos', 'San Marcos', 33.1434, -117.1661, '#e8743b', 'Cal State and Double Peak', 3200],
  ['escondido', 'Escondido', 'Escondido', 33.1192, -117.0864, '#e06060', 'Grand Avenue and the 15', 3600],
  ['valley-center', 'Valley Center', 'Valley Center', 33.2184, -117.0342, '#8fcf6a', 'Orchards and casinos', 5000],
  ['lake-hodges', 'Lake Hodges', 'San Diego', 33.0560, -117.1250, '#3fb6d9', 'The bridge and the trail', 2000],
  ['safari-park', 'San Pasqual Valley', 'Escondido', 33.0975, -116.9956, '#b08a5a', 'The Safari Park and the battlefield', 3500],
  ['ramona', 'Ramona', 'Ramona', 33.0420, -116.8680, '#c4a35a', 'Wine country on the 78', 4500],
  ['julian', 'Julian', 'Julian', 33.0787, -116.6022, '#b5583a', 'Apple pie and snow, sometimes', 4000],
  ['palomar', 'Palomar Mountain', 'Back country', 33.3560, -116.8640, '#7a9a50', 'The observatory up top', 6000],
  ['cuyamaca', 'Cuyamaca', 'Back country', 32.9500, -116.5900, '#6f7a4a', 'Pines and burned slopes', 6000],
  ['santee', 'Santee', 'Santee', 32.8384, -116.9739, '#e0b040', 'Riverbed parks and the 52', 3000],
  ['lakeside', 'Lakeside', 'Lakeside', 32.8573, -116.9222, '#c4a35a', 'Rodeo town on the 67', 3200],
  ['el-cajon', 'El Cajon', 'El Cajon', 32.7948, -116.9625, '#e8743b', 'The valley floor', 3600],
  ['la-mesa', 'La Mesa', 'La Mesa', 32.7678, -117.0231, '#9b7fd1', 'The village and the trolley', 2400],
  ['lemon-grove', 'Lemon Grove', 'Lemon Grove', 32.7426, -117.0314, '#f2c14e', 'The big lemon', 1600],
  ['spring-valley', 'Spring Valley', 'Spring Valley', 32.7448, -116.9989, '#84b04a', 'Hills east of the 125', 2400],
  ['alpine', 'Alpine', 'Alpine', 32.8351, -116.7664, '#6f7a4a', 'Up the 8 into the mountains', 4500],
  ['national-city', 'National City', 'National City', 32.6781, -117.0992, '#d35400', 'Mile of Cars', 2400],
  ['coronado', 'Coronado', 'Coronado', 32.6859, -117.1831, '#3fb6d9', 'The bridge and the Hotel del', 2400],
  ['chula-vista', 'Chula Vista', 'Chula Vista', 32.6401, -117.0842, '#e06060', 'The bayfront and the hills', 4000],
  ['imperial-beach', 'Imperial Beach', 'Imperial Beach', 32.5839, -117.1131, '#3fb6d9', 'The last beach in the USA', 2000],
  ['otay-mesa', 'Otay Mesa', 'San Diego', 32.5700, -116.9700, '#8a8f99', 'Trucks lining up for the border', 3500],
  ['san-ysidro', 'San Ysidro', 'San Diego', 32.5520, -117.0420, '#d07a9a', 'The busiest border crossing', 1800],
  ['tijuana', 'Tijuana', 'Baja California', 32.5149, -117.0382, '#c0392b', 'Across the line', 5000],
  ['pacific', 'Pacific Ocean', 'California coast', 32.8500, -117.4800, '#24566e', 'Nothing but water till Japan', 14000],
];
for (const [id, name, district, lat, lon, col, tag, r] of OUTER_REGIONS) REGIONS.push({ id, name, district, ...ll(lat, lon), col, tag, r, outer: true });
const WILD = { id: 'backcountry', name: 'Poway Backcountry', district: 'Poway', col: '#9a8a6a', tag: 'Chaparral, dirt roads, no cell signal' };
const COUNTY = { id: 'county', name: 'San Diego County', district: 'Back country', col: '#9a8a6a', tag: 'Hills, ranches and long empty roads' };
const REACH = 1700;
export function regionAt(x, z) {
  let best = null, bd = 1; // the nearest anchor, measured in its own reach
  for (const r of REGIONS) { const R = r.r || REACH, d = ((r.x - x) ** 2 + (r.z - z) ** 2) / (R * R); if (d < bd) { bd = d; best = r; } }
  return best || (x > SECTOR.x0 - 3000 && x < SECTOR.x0 + SECTOR.cols * SECTOR.size + 3000 && z > SECTOR.z0 - 3000 && z < SECTOR.z0 + SECTOR.rows * SECTOR.size + 3000 ? WILD : COUNTY);
}
// map bounds from poway-data.js ([-5969, -8391, 7461, 3275]): 14 columns x 12 rows of 1 km
export const SECTOR = { x0: -5969, z0: -8391, size: 1000, cols: 14, rows: 12 };
export function sectorAt(x, z) {
  const cx = Math.floor((x - SECTOR.x0) / SECTOR.size), cz = Math.floor((z - SECTOR.z0) / SECTOR.size);
  if (cx < 0 || cz < 0 || cx >= SECTOR.cols || cz >= SECTOR.rows) { // outside Poway's grid: how far and which way
    const dx = x - (SECTOR.x0 + SECTOR.cols * SECTOR.size / 2), dz = z - (SECTOR.z0 + SECTOR.rows * SECTOR.size / 2);
    const dir = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][((Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) % 8) + 8) % 8];
    return `${Math.round(Math.hypot(dx, dz) / 1000)} km ${dir}`;
  }
  const c = Math.max(0, Math.min(SECTOR.cols - 1, Math.floor((x - SECTOR.x0) / SECTOR.size)));
  const r = Math.max(0, Math.min(SECTOR.rows - 1, Math.floor((z - SECTOR.z0) / SECTOR.size)));
  return String.fromCharCode(65 + c) + (r + 1);
}

// ---------------------------------------------------------------- the "you are entering" banner
let cur = null, cand = null, candT = 0, el = null, hideT = 0;
export function initRegionBanner() {
  el = document.createElement('div'); el.id = 'regionbanner'; el.className = 'hud'; el.hidden = true; document.body.appendChild(el);
  const st = document.createElement('style'); st.textContent = `
#regionbanner{position:fixed;left:50%;top:22%;transform:translateX(-50%);text-align:center;pointer-events:none;z-index:30;white-space:nowrap}
#regionbanner .rb-d{font:700 13px/1 var(--ui);letter-spacing:.5em;text-transform:uppercase;color:var(--gold);opacity:0;animation:rbD .6s .15s ease-out forwards}
#regionbanner .rb-n{font:400 clamp(40px,7vw,78px)/1 var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--paper);text-shadow:0 4px 0 rgba(0,0,0,.35),0 0 30px rgba(0,0,0,.4);animation:rbN .9s cubic-bezier(.2,.9,.2,1) both}
#regionbanner .rb-l{height:3px;margin:10px auto 8px;width:0;background:linear-gradient(90deg,transparent,var(--rb),transparent);animation:rbL .8s .2s ease-out forwards}
#regionbanner .rb-t{font:500 15px/1.2 var(--ui);color:var(--dim);opacity:0;animation:rbD .6s .35s ease-out forwards}
#regionbanner .rb-s{display:inline-block;margin-left:10px;padding:2px 7px;border:1px solid rgba(255,255,255,.25);font:700 12px/1 var(--ui);letter-spacing:.15em;color:var(--paper)}
#regionbanner.out{animation:rbOut .6s ease-in forwards}
@keyframes rbN{from{opacity:0;letter-spacing:.4em;filter:blur(6px)}} @keyframes rbL{to{width:min(460px,70vw)}} @keyframes rbD{to{opacity:1}}
@keyframes rbOut{to{opacity:0;transform:translateX(-50%) translateY(-12px)}}`;
  document.head.appendChild(st);
}
// call every HUD tick; shows the banner after you've been in a new region for a moment (no flicker on borders)
export function updateRegion(x, z, dt, quiet) {
  const r = regionAt(x, z);
  if (!cur) { cur = r; return r; }
  if (r !== cur) { if (cand !== r) { cand = r; candT = 0; } candT += dt; if (candT > 1.2) { cur = r; cand = null; if (!quiet) show(r, sectorAt(x, z)); } }
  else cand = null;
  if (hideT > 0 && (hideT -= dt) <= 0 && el) { el.classList.add('out'); setTimeout(() => { el.hidden = true; }, 600); }
  return cur;
}
function show(r, sec) {
  if (!el) return;
  el.style.setProperty('--rb', r.col); el.className = 'hud';
  el.innerHTML = `<div class="rb-d">${r.district}<span class="rb-s">${sec}</span></div><div class="rb-n">${r.name}</div><div class="rb-l"></div><div class="rb-t">${r.tag}</div>`;
  el.hidden = false; void el.offsetWidth; hideT = 3.6;
}
export function currentRegion() { return cur; }
