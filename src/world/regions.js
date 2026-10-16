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
  { id: 'carmel-mountain', name: 'Carmel Mountain Ranch', district: 'San Diego', x: -5260, z: -760, col: '#b07a9a', tag: 'The plaza and the 56' },
  { id: 'sabre-springs', name: 'Sabre Springs', district: 'San Diego', x: -4030, z: 1830, col: '#6a90c0', tag: 'Creekside and South Creek' },
  { id: 'penasquitos', name: 'Rancho Peñasquitos', district: 'San Diego', x: -5430, z: 2880, col: '#c0906a', tag: 'Black Mountain\'s shadow' },
];
const WILD = { id: 'backcountry', name: 'Poway Backcountry', district: 'Poway', col: '#9a8a6a', tag: 'Chaparral, dirt roads, no cell signal' };
const REACH = 1700;
export function regionAt(x, z) {
  let best = WILD, bd = REACH * REACH;
  for (const r of REGIONS) { const d = (r.x - x) ** 2 + (r.z - z) ** 2; if (d < bd) { bd = d; best = r; } }
  return best;
}
// map bounds from poway-data.js ([-5969, -8391, 7461, 3275]): 14 columns x 12 rows of 1 km
export const SECTOR = { x0: -5969, z0: -8391, size: 1000, cols: 14, rows: 12 };
export function sectorAt(x, z) {
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
