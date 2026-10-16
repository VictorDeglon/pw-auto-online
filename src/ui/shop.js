// Weapon dealers: a shop where you buy guns and explosives, ammo, and per-weapon upgrades that stay with you.
//   initShop({ weapons, money(), spend(n), arsenal, upgrades, owned(i), onBuy(), notify, sfx })
//   openShop(dealer) / closeShop() / isShopOpen()
// Prices are in game dollars; upgrades have three levels each.
export const PRICES = { pistol: 0, smg: 900, shotgun: 1100, rifle: 1800, sniper: 2600, minigun: 6500, rpg: 4500, gl: 3600, grenade: 650, sticky: 950, airstrike: 9000 };
export const UPGRADES = {
  dmg: { name: 'Damage', note: 'Hotter loads, bigger charges', step: 0.15, cost: [350, 900, 2000] },
  rate: { name: 'Fire rate', note: 'Lighter trigger, quicker reload', step: 0.12, cost: [300, 800, 1800] },
  acc: { name: 'Accuracy', note: 'Better barrel and sights', step: 0.18, cost: [250, 700, 1500] },
  cap: { name: 'Capacity', note: 'Extended mags, bigger bag', step: 0.3, cost: [200, 600, 1300] },
};
const BLURB = {
  pistol: 'Reliable sidearm. Every deputy carries one.', smg: 'Sprays fast, kicks a little. Good from a car window.',
  shotgun: 'Nine pellets of bad news. Throws people back.', rifle: 'Accurate at range, steady on full auto.',
  sniper: 'One shot. Z zooms the scope while aiming.', minigun: 'Six barrels. You will need ammo.',
  rpg: 'Rockets. Brings down buildings with a few hits.', gl: 'Bouncing grenades, lobbed.', grenade: 'Throw, count, duck.',
  sticky: 'Stick to anything; G sets them all off.', airstrike: 'Throw the flare, then run. Very far.',
};
let H = null, open = false, sel = 'smg', dealer = null;
const $ = id => document.getElementById(id);
const fmt = n => '$' + Math.round(n).toLocaleString();
export function isShopOpen() { return open; }
export function upgradeCost(wid, k, lv) { const tier = 1 + (PRICES[wid] || 0) / 3000; return Math.round(UPGRADES[k].cost[lv] * tier / 10) * 10; }
export function ammoPack(w) { return { n: w.give || 0, cost: Math.max(40, Math.round((PRICES[w.id] || 400) * 0.09 / 10) * 10) }; }

export function initShop(hooks) {
  H = hooks;
  const el = document.createElement('div'); el.id = 'shop'; el.hidden = true; el.innerHTML = '<div class="shop-card"><header><div><div class="eyebrow" id="shopwho"></div><h2>Weapons</h2></div><div class="shop-cash" id="shopcash"></div><button class="mbtn small" data-a="close">Leave <kbd>E</kbd></button></header><div class="shop-body"><div class="shop-list" id="shoplist"></div><div class="shop-detail" id="shopdetail"></div></div></div>';
  document.body.appendChild(el);
  el.addEventListener('click', onClick);
  const st = document.createElement('style'); st.textContent = `
#shop{position:fixed;inset:0;z-index:45;display:grid;place-items:center;background:rgba(5,8,16,.72);backdrop-filter:blur(3px);animation:shopin .2s ease-out}
@keyframes shopin{from{opacity:0}}
.shop-card{width:min(980px,94vw);max-height:88vh;display:flex;flex-direction:column;background:#0e1528;border-top:4px solid var(--gold);box-shadow:0 30px 80px rgba(0,0,0,.6);animation:shoprise .28s cubic-bezier(.2,.9,.3,1.2)}
@keyframes shoprise{from{transform:translateY(16px) scale(.98)}}
.shop-card header{display:flex;align-items:center;gap:16px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.07)}
.shop-card header>div:first-child{flex:1} .shop-card h2{margin:0;font:400 36px/1 var(--display);letter-spacing:.04em;text-transform:uppercase}
.shop-cash{font:400 32px/1 var(--display);color:var(--cash)}
.shop-body{display:grid;grid-template-columns:minmax(220px,300px) 1fr;min-height:0;flex:1}
.shop-list{overflow:auto;border-right:1px solid rgba(255,255,255,.07);padding:8px}
.shop-list button{display:flex;justify-content:space-between;align-items:center;width:100%;gap:8px;text-align:left;font:600 16px/1.2 var(--ui);color:var(--paper);background:none;border:0;border-left:3px solid transparent;padding:9px 10px;cursor:pointer}
.shop-list button:hover{background:rgba(255,255,255,.05)} .shop-list button.on{background:rgba(255,122,47,.12);border-left-color:var(--gold)}
.shop-list small{font:700 12px/1 var(--ui);letter-spacing:.08em;color:var(--dim)} .shop-list small.own{color:var(--sage)}
.shop-detail{padding:18px 22px;overflow:auto;display:flex;flex-direction:column;gap:14px}
.shop-detail h3{margin:0;font:400 34px/1 var(--display);letter-spacing:.04em;text-transform:uppercase}
.shop-detail p{margin:0;color:var(--dim);font:500 16px/1.4 var(--ui)}
.shop-stats{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font:700 13px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--dim);align-items:center}
.shop-stats i{display:block;height:8px;background:rgba(255,255,255,.08);position:relative} .shop-stats i b{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,var(--gold),#ffd23f);transition:width .35s}
.shop-up{display:grid;grid-template-columns:1fr auto;gap:10px 14px;align-items:center;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}
.shop-up b{font:400 20px/1 var(--display);letter-spacing:.04em;text-transform:uppercase} .shop-up span{display:block;color:var(--dim);font:500 13px/1.3 var(--ui)}
.pips{display:flex;gap:4px;margin-top:6px} .pips i{width:22px;height:6px;background:rgba(255,255,255,.1);transform:skewX(-20deg)} .pips i.on{background:var(--gold);box-shadow:0 0 8px rgba(255,122,47,.6);animation:pip .4s ease-out}
@keyframes pip{from{transform:skewX(-20deg) scaleY(2.4);background:#fff}}
.shop-buy{display:flex;gap:10px;flex-wrap:wrap}
#shop .mbtn[disabled]{cursor:not-allowed}
.shop-flash{animation:sflash .5s ease-out} @keyframes sflash{0%{box-shadow:0 0 0 0 rgba(124,211,107,.8)}100%{box-shadow:0 0 0 18px rgba(124,211,107,0)}}
@media (max-width:700px){.shop-body{grid-template-columns:1fr}}`;
  document.head.appendChild(st);
}

export function openShop(d) {
  if (open) return; open = true; dealer = d;
  $('shopwho').textContent = d && d.name ? d.name : 'Dealer';
  $('shop').hidden = false; render();
}
export function closeShop() { open = false; $('shop').hidden = true; }

function render() {
  const W = H.weapons, money = H.money(); $('shopcash').textContent = fmt(money);
  const list = $('shoplist'); list.textContent = '';
  W.forEach((w, i) => {
    if (!w.id || w.id === 'fists') return;
    const b = document.createElement('button'); b.dataset.a = 'sel:' + w.id; if (w.id === sel) b.className = 'on';
    const nm = document.createElement('span'); nm.textContent = w.name;
    const tag = document.createElement('small'); const own = H.owned(i);
    tag.textContent = own ? `${H.arsenal[w.id] | 0}/${H.maxOf(w)}` : fmt(PRICES[w.id] || 0); if (own) tag.className = 'own';
    b.append(nm, tag); list.append(b);
  });
  const i = W.findIndex(w => w.id === sel), w = W[i], own = H.owned(i), up = H.upgrades[w.id] || {};
  const d = $('shopdetail'), pack = ammoPack(w), full = (H.arsenal[w.id] | 0) >= H.maxOf(w);
  const stat = (label, v) => `<span>${label}</span><i><b style="width:${Math.round(Math.max(0.04, Math.min(1, v)) * 100)}%"></b></i>`;
  const s = H.stats(w);
  d.innerHTML = `<div><h3>${w.name}</h3><p>${BLURB[w.id] || ''}</p></div>
    <div class="shop-stats">${stat('Damage', s.dmg)}${stat('Fire rate', s.rate)}${stat('Accuracy', s.acc)}${stat('Capacity', s.cap)}</div>
    <div class="shop-buy">${own ? `<button class="mbtn primary small" data-a="ammo" ${full || money < pack.cost ? 'disabled' : ''}>Ammo +${pack.n} · ${fmt(pack.cost)}</button>` : `<button class="mbtn primary small" data-a="buy" ${money < (PRICES[w.id] || 0) ? 'disabled' : ''}>Buy · ${fmt(PRICES[w.id] || 0)}</button>`}</div>
    ${Object.entries(UPGRADES).map(([k, U]) => { const lv = up[k] || 0, max = lv >= 3, c = max ? 0 : upgradeCost(w.id, k, lv);
      return `<div class="shop-up"><div><b>${U.name}</b><span>${U.note}</span><div class="pips">${[0, 1, 2].map(j => `<i class="${j < lv ? 'on' : ''}"></i>`).join('')}</div></div>
        <button class="mbtn small" data-a="up:${k}" ${!own || max || money < c ? 'disabled' : ''}>${max ? 'Maxed' : !own ? 'Buy first' : fmt(c)}</button></div>`; }).join('')}`;
}
function onClick(e) {
  const b = e.target.closest('[data-a]'); if (!b || b.disabled) return; const a = b.dataset.a, W = H.weapons;
  if (a === 'close') { H.close(); return; }
  if (a.startsWith('sel:')) { sel = a.slice(4); render(); return; }
  const i = W.findIndex(w => w.id === sel), w = W[i];
  if (a === 'buy') { const c = PRICES[w.id] || 0; if (!H.spend(c)) return; H.arsenal[w.id] = Math.min(H.maxOf(w), w.give || 1); H.sfx.cash(); H.notify(`Bought the <b>${w.name.toLowerCase()}</b>.`, 'green', 2200); H.onBuy('buy', w); }
  if (a === 'ammo') { const p = ammoPack(w); if (!H.spend(p.cost)) return; H.arsenal[w.id] = Math.min(H.maxOf(w), (H.arsenal[w.id] | 0) + p.n); H.sfx.cash(); H.onBuy('ammo', w); }
  if (a.startsWith('up:')) { const k = a.slice(3), up = H.upgrades[w.id] || (H.upgrades[w.id] = {}), lv = up[k] || 0; if (lv >= 3) return; if (!H.spend(upgradeCost(w.id, k, lv))) return; up[k] = lv + 1; H.sfx.cash(); H.notify(`${w.name.toLowerCase()}: ${UPGRADES[k].name.toLowerCase()} level ${lv + 1}.`, 'green', 2200); H.onBuy('upgrade', w, k, lv + 1); }
  render(); $('shopdetail').classList.remove('shop-flash'); void $('shopdetail').offsetWidth; $('shopdetail').classList.add('shop-flash');
}
