// The gang card on the Career screen: your gang (name, tag, colour), its crew, its airstrips and how its base defends
// itself, and founding a new one. The gang itself lives on this computer (src/gangs.js); it had no way in until now.
import { GANG } from '../gangs.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const colour = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#f0b23a');
const clean = (s, n) => String(s || '').replace(/[^A-Za-z0-9 '._-]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const DEF = { max: 'Max (missiles + snipers)', ground: 'Ground only (snipers)', off: 'Stand down' };

export function renderGang() {
  const el = $('careergang'); if (!el) return;
  if (!GANG.data) { try { GANG.init(); } catch (e) { } }
  const g = GANG.data; if (!g) { el.innerHTML = ''; return; }
  const mode = GANG.activeDefense || g.defense || 'max', strips = (g.airstrips || []).length;
  el.innerHTML = `<div class="card gangcard">
    <div class="eyebrow">Your gang</div>
    <h3 style="color:${colour(g.color)};margin:4px 0">${esc(g.name)} <small style="opacity:.75">[${esc(g.tag)}]</small></h3>
    <p class="fine">Crew: ${(g.members || []).map(m => `${esc(m.name)} <span style="opacity:.6">(${esc(m.rank)})</span>`).join(', ')}</p>
    <p class="fine">Airstrips: ${strips} of ${GANG.maxAirstrips()} (more crew, more airstrips) · warehouse: ${(g.warehouse && g.warehouse.cars || []).length} cars, ${(g.warehouse && g.warehouse.planes || []).length} planes</p>
    <p class="fine" style="margin-top:8px">Base defenses</p>
    <div class="row" style="display:flex;gap:8px;flex-wrap:wrap">${Object.keys(DEF).map(k => `<button class="mbtn small" data-gdef="${k}"${k === mode ? ' disabled' : ''}>${DEF[k]}</button>`).join('')}</div>
    <details style="margin-top:10px"><summary class="fine" style="cursor:pointer">Found a new gang (replaces this one)</summary>
      <form id="gangform" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
        <input id="gangname" maxlength="24" placeholder="Gang name" required style="padding:8px;min-width:180px">
        <input id="gangtag" maxlength="5" placeholder="TAG" required style="padding:8px;width:80px;text-transform:uppercase">
        <input id="gangcolor" type="color" value="${colour(g.color)}" style="width:48px;height:36px;padding:0;border:0;background:none">
        <button class="mbtn small" type="submit">Found it</button>
      </form></details>
  </div>`;
  for (const b of el.querySelectorAll('[data-gdef]')) b.onclick = () => { GANG.setDefenseMode(b.dataset.gdef); renderGang(); };
  const f = $('gangform');
  if (f) f.onsubmit = ev => {
    ev.preventDefault();
    const name = clean($('gangname').value, 24), tag = clean($('gangtag').value, 5).replace(/[ '.]/g, '').toUpperCase();
    if (name.length < 3 || tag.length < 2) return;
    GANG.createGang(name, tag, colour($('gangcolor').value)); renderGang();
  };
}
