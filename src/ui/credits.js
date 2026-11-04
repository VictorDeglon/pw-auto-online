// The credits screen (main menu > Credits): the game's sources, then every Sketchfab model by kind with its title
// (linked to its page), its author and its licence. The models were changed for the game (resized, simplified,
// re-textured, wheels split out, materials renamed), which the CC licences ask us to say.
//   renderCredits(el, SF)   SF: src/sf.js (its catalogue)
const LIC = {
  'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/', 'CC-BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/', 'CC-BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
};
const KINDS = [['car', 'Cars'], ['vehicle', 'Other vehicles'], ['person', 'People'], ['statue', 'Statues and monuments'], ['prop', 'Street and city props'],
  ['building', 'Buildings, shops and interiors'], ['plant', 'Trees and plants'], ['clothes', 'Clothes']];
const BASE = [
  ['Streets and buildings', '© OpenStreetMap contributors', 'ODbL', 'https://www.openstreetmap.org/copyright'],
  ['Aerial imagery', 'USGS NAIP', 'Public domain', 'https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip'],
  ['Terrain', 'Mapzen / AWS Terrain Tiles', 'Open data', 'https://registry.opendata.aws/terrain-tiles/'],
  ['Textures, trees and HDRIs', 'Poly Haven', 'CC0', 'https://polyhaven.com/license'],
  ['Vehicles, trees and props', 'Kenney', 'CC0', 'https://kenney.nl/'], ['Cars and buses', 'Quaternius', 'CC0', 'https://quaternius.com/'],
  ['Aircraft', 'Poly by Google, Vojtěch Balák, Gilang Romadhan and jeremy via Poly Pizza', 'CC-BY 3.0', 'https://poly.pizza/'],
  ['People', 'Microsoft Rocketbox', 'MIT', 'https://github.com/microsoft/Microsoft-Rocketbox'],
  ['Animations', 'Mixamo by Adobe', 'Mixamo terms', 'https://www.mixamo.com/'],
  ['Radio', 'Kevin MacLeod, incompetech.com', 'CC-BY 4.0', 'https://incompetech.com/'],
];

export async function renderCredits(el, SF) {
  el.textContent = 'Loading…';
  await SF.ready;
  el.textContent = '';
  const a = (href, text) => { const x = document.createElement('a'); x.href = href; x.target = '_blank'; x.rel = 'noopener noreferrer'; x.textContent = text; return x; };
  const row = (parts) => { const li = document.createElement('li'); for (const p of parts) li.append(p); return li; };
  const sec = (title, note) => { const h = document.createElement('h3'); h.textContent = title; el.append(h); if (note) { const p = document.createElement('p'); p.className = 'fine'; p.textContent = note; el.append(p); } const ul = document.createElement('ul'); el.append(ul); return ul; };
  const base = sec('Sources');
  for (const [what, who, lic, url] of BASE) base.append(row([`${what}: `, a(url, who), ` (${lic})`]));
  const all = SF.credits();
  const find = document.createElement('input'); find.type = 'search'; find.placeholder = `Search ${all.length} models by title or author`; find.className = 'creditfind';
  if (all.length) el.append(find);
  const lists = [];
  for (const [k, title] of KINDS) {
    const list = all.filter(e => e.k === k); if (!list.length) continue;
    const ul = sec(`${title} (${list.length})`, k === 'car' ? 'From Sketchfab. Each model was changed for the game: resized to real scale, simplified, re-textured and its wheels split out. Makers\' names appear here only.' : 'From Sketchfab, changed for the game: resized, simplified and re-textured.');
    for (const e of list.sort((x, y) => x.n.localeCompare(y.n))) {
      const li = row([a(e.u, e.n), ` by ${e.a} · `, LIC[e.l] ? a(LIC[e.l], e.l) : e.l]);
      li.dataset.q = `${e.n} ${e.a}`.toLowerCase(); ul.append(li); lists.push(li);
    }
  }
  find.oninput = () => { const q = find.value.trim().toLowerCase(); for (const li of lists) li.hidden = !!q && !li.dataset.q.includes(q); };
}
