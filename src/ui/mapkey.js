// The big map's key: every kind of marker the maps can show, drawn with the same code that draws them on the map
// (MAPKIT.drawItems), so the key can never disagree with the map. Bottom left of the big map; click its title to fold
// it away (remembered on this computer). Crime spots appear in the key once the story has opened them up.
//   initMapKey()   once, at boot; it refreshes itself whenever the big map opens
import * as MAPKIT from './mapkit.js';
import { isUnlocked as storyUnlocked } from '../story/unlocks.js';

const LM = { school: '#f2c14e', park: '#7fc25a', water: '#4fb3e8', hospital: '#ff5a5a', police: '#3b7bff', library: '#d8b98a', fire_station: '#ff8a3d' };
const icon = (glyph, color) => ({ kind: 'icon', glyph, color });
const dot = (color, r = 3) => ({ kind: 'dot', color, r });
// [section, [[label, mark | special, unlock key (optional)]]]
const KEY = [
  ['People', [
    ['You', 'self'],
    ['Other players (online)', { kind: 'player', color: '#4fb3e8', label: 'P', heading: 0 }],
    ['Deputy', dot('#3b7bff')],
    ['Sheriff cruiser, helicopter', dot('#3b7bff', 4.5)],
    ['Fight, or calling 911', dot('#d4302f')],
    ['Witness (about to call)', dot('#ffb020')],
    ['Owner coming for their car', dot('#ff8c1a', 4.5)],
  ]],
  ['Story & jobs', [
    ['Objective, courier drop-off', icon('star', '#f0b23a')],
    ['Target', dot('#d4302f', 4)],
    ['Someone with work for you', icon('R', '#f29ccf')],
    ['Time trial', icon('T', '#f3ede1')],
    ['Waypoint (click the map)', { kind: 'pin', color: '#b06cff' }],
    ['GPS route', 'route'],
  ]],
  ['Places', [
    ['Your garages', icon('garage', '#d9dde3')],
    ['Gun shop', icon('shop', '#ff3cac')],
    ['Hospital', icon('hospital', LM.hospital)],
    ['Sheriff station', icon('police', LM.police)],
    ['School', icon('school', LM.school)],
    ['Park', icon('park', LM.park)],
    ['Lake', icon('water', LM.water)],
    ['Library', icon('library', LM.library)],
    ['Fire station', icon('fire_station', LM.fire_station)],
  ]],
  ['Crime', [
    ['Fence (buys what you steal)', icon('F', '#c792ea'), 'crime:fence'],
    ['Chop shop (stolen cars)', icon('C', '#ff7849'), 'crime:chop'],
    ['Dee\'s repo list', icon('D', '#7cc0ff'), 'crime:repo'],
    ['Cooler run pick-up', icon('N', '#ff9f43'), 'crime:runs'],
    ['Security camera', 'camera', 'crime:shoplift'],
  ]],
  ['Map', [
    ['Not explored yet', 'fog'],
    ['Sheriff search area', 'search'],
  ]],
];

const CSS = `
#mapkey{position:absolute;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2;max-height:calc(100% - 170px);overflow:auto;
  background:rgba(14,18,26,.95);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.45);color:#f3ede1;font:600 12.5px/1.1 var(--ui,"Barlow Condensed",Arial,sans-serif);
  padding:6px 10px 8px;cursor:default;user-select:none;width:min(372px,calc(100vw - 32px))}
#mapkey h4{margin:0;font:400 16px/1 var(--display,Anton,Impact,sans-serif);letter-spacing:.06em;cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:2px 0}
#mapkey h4 small{font:600 12px/1 var(--ui,Arial);color:rgba(243,237,225,.6);letter-spacing:.04em}
#mapkey.fold .body{display:none}
#mapkey .sec{margin-top:5px;color:rgba(243,237,225,.5);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase}
#mapkey .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
#mapkey .row{display:flex;align-items:center;gap:4px;min-height:19px}
#mapkey canvas{width:21px;height:19px;flex:none}
@media (max-width:640px){#mapkey .grid{grid-template-columns:1fr}}`;

let root = null, shownKey = '';
function swatch(kind, m) {
  const c = document.createElement('canvas'), dpr = Math.min(devicePixelRatio || 1, 2), W = 26, H = 24; c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'), s = dpr * 0.82, x = W * dpr / 2, y = H * dpr / 2;
  if (kind === 'self') MAPKIT.drawSelf(g, x, y, 0.5, s * 0.82, 0.4);
  else if (kind === 'route') { g.strokeStyle = '#f0b23a'; g.lineWidth = 4 * dpr; g.lineCap = 'round'; g.beginPath(); g.moveTo(4 * dpr, 17 * dpr); g.quadraticCurveTo(13 * dpr, 2 * dpr, 22 * dpr, 12 * dpr); g.stroke(); }
  else if (kind === 'fog') { const gr = g.createLinearGradient(0, 0, W * dpr, 0); gr.addColorStop(0, 'rgba(44,54,70,1)'); gr.addColorStop(0.55, 'rgba(110,122,140,.85)'); gr.addColorStop(1, 'rgba(110,122,140,0)'); g.fillStyle = '#6d8a5a'; g.fillRect(2 * dpr, 3 * dpr, 22 * dpr, 18 * dpr); g.fillStyle = gr; g.fillRect(2 * dpr, 3 * dpr, 22 * dpr, 18 * dpr); }
  else if (kind === 'search') { g.beginPath(); g.arc(x, y, 9 * dpr, 0, Math.PI * 2); g.fillStyle = 'rgba(59,123,255,0.25)'; g.fill(); g.setLineDash([3 * dpr, 2.5 * dpr]); g.lineWidth = 2 * dpr; g.strokeStyle = 'rgba(212,48,47,.9)'; g.stroke(); }
  else if (kind === 'camera') { g.fillStyle = '#d9dde3'; g.strokeStyle = 'rgba(10,12,16,.92)'; g.lineWidth = 1.4 * dpr; g.beginPath(); g.roundRect(5 * dpr, 7 * dpr, 12 * dpr, 9 * dpr, 2 * dpr); g.fill(); g.stroke(); g.beginPath(); g.moveTo(17 * dpr, 9 * dpr); g.lineTo(22 * dpr, 6 * dpr); g.lineTo(22 * dpr, 17 * dpr); g.lineTo(17 * dpr, 14 * dpr); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#ff3030'; g.beginPath(); g.arc(8.5 * dpr, 10 * dpr, 1.6 * dpr, 0, Math.PI * 2); g.fill(); }
  else { const mm = Object.assign({ x: 0, z: 0, pri: 3 }, m); MAPKIT.drawItems(g, [{ m: mm, x, y, n: 1, members: [mm], edge: false, ang: 0, hd: mm.heading != null ? -Math.PI / 4 : null }], { s, r: mm.kind === 'player' ? 8.6 : 9.5, labels: 'none' }); }
  return c;
}
function render() {
  const open = KEY.map(([sec, rows]) => [sec, rows.filter(r => !r[2] || storyUnlocked(r[2]))]).filter(([, rows]) => rows.length);
  const sig = open.map(([s, r]) => s + r.length).join(); if (sig === shownKey) return; shownKey = sig;
  const body = root.querySelector('.body'); body.textContent = '';
  for (const [sec, rows] of open) {
    const h = document.createElement('div'); h.className = 'sec'; h.textContent = sec; body.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'grid'; body.appendChild(grid);
    for (const [label, m] of rows) { const row = document.createElement('div'); row.className = 'row'; row.append(swatch(typeof m === 'string' ? m : 'mark', m), label); grid.appendChild(row); }
  }
}
export function initMapKey() {
  const map = document.getElementById('bigmap'); if (!map || root) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  root = document.createElement('div'); root.id = 'mapkey';
  root.innerHTML = '<h4>MAP KEY <small>click to hide</small></h4><div class="body"></div>';
  let fold = false; try { fold = localStorage.getItem('pao.mapkey') === 'fold'; } catch (e) { }
  if (fold || innerWidth < 640) root.classList.add('fold');
  const sm = root.querySelector('small'), sync = () => { sm.textContent = root.classList.contains('fold') ? 'click to show' : 'click to hide'; };
  root.querySelector('h4').addEventListener('click', () => { root.classList.toggle('fold'); sync(); try { localStorage.setItem('pao.mapkey', root.classList.contains('fold') ? 'fold' : 'open'); } catch (e) { } });
  for (const t of ['mousedown', 'mouseup', 'wheel', 'click']) root.addEventListener(t, e => e.stopPropagation()); // the map under it doesn't pan, zoom or drop a waypoint
  map.appendChild(root); sync();
  new MutationObserver(() => { if (map.classList.contains('show')) render(); }).observe(map, { attributes: true, attributeFilter: ['class'] });
  render();
}
