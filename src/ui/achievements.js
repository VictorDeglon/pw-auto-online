// Achievements: 30 badges, each with its own emblem (drawn in SVG) and its own unlock animation. Saved locally.
//   initAchievements({ save, persist, bus, sfx, probe })   probe() -> live numbers (speed mph, air time, wanted, ...)
//   tickAchievements(dt)   unlock(id)   renderAchievements(el)
const TIER = { b: ['#c98a4b', '#7a4a1f'], s: ['#d9dee6', '#7d8794'], g: ['#ffd23f', '#a8760a'], p: ['#9ff0ff', '#3a7f99'] };
// icon: a few SVG primitives in a 64x64 box. anim: how the badge arrives.
const A = [
  ['first-wheels', 'First Wheels', 'Take a car that isn\'t yours.', 'b', 'key', 'stamp', s => s.cars >= 1],
  ['autobiography', 'Grand Theft Auto-mobile', 'Steal 25 cars.', 'g', 'key2', 'spin', s => s.cars >= 25],
  ['joyride', 'Joyride', 'Hit 100 mph.', 'b', 'gauge', 'zoom', (s, p) => p.mph >= 100],
  ['ludicrous', 'Ludicrous Speed', 'Hit 150 mph.', 'g', 'gauge2', 'warp', (s, p) => p.mph >= 150],
  ['air-time', 'Air Time', 'Three seconds airborne in a car.', 's', 'wing', 'float', (s, p) => p.airT >= 3],
  ['frequent-flyer', 'Frequent Flyer', 'Glide for a minute in total.', 'g', 'plane', 'float', s => (s.glide || 0) >= 60],
  ['fender-bender', 'Fender Bender', 'Total a car.', 'b', 'crash', 'shake', s => (s.wrecks || 0) >= 1],
  ['demolition-derby', 'Demolition Derby', 'Total 25 cars.', 'g', 'crash2', 'shake', s => (s.wrecks || 0) >= 25],
  ['chain-reaction', 'Chain Reaction', 'Three explosions within three seconds.', 's', 'boom', 'burst', (s, p) => p.chain >= 3],
  ['urban-renewal', 'Urban Renewal', 'Bring a building down.', 's', 'tower', 'drop', s => (s.buildings || 0) >= 1],
  ['wrecking-crew', 'Wrecking Crew', 'Bring down ten buildings.', 'p', 'tower2', 'drop', s => (s.buildings || 0) >= 10],
  ['lumberjack', 'Lumberjack', 'Knock down 25 trees.', 's', 'tree', 'flip', s => (s.trees || 0) >= 25],
  ['lights-out', 'Lights Out', 'Knock down ten street lights.', 'b', 'lamp', 'flip', s => (s.lamps || 0) >= 10],
  ['five-stars', 'Most Wanted', 'Reach five stars.', 'g', 'star5', 'burst', (s, p) => p.wanted >= 5],
  ['slippery', 'Slippery', 'Lose a three-star chase.', 's', 'ghost', 'fade', s => (s.evaded3 || 0) >= 1],
  ['busted', 'Read Your Rights', 'Get busted.', 'b', 'cuffs', 'stamp', s => s.busted >= 1],
  ['wasted', 'Respawn Required', 'Get wasted.', 'b', 'skull', 'shake', s => s.wasted >= 1],
  ['shopper', 'Retail Therapy', 'Buy a weapon from a dealer.', 'b', 'bag', 'zoom', s => (s.bought || 0) >= 1],
  ['fully-loaded', 'Fully Loaded', 'Max out any weapon upgrade.', 's', 'chevrons', 'warp', s => (s.maxUpgrades || 0) >= 1],
  ['arsenal', 'Walking Arsenal', 'Own every weapon.', 'p', 'crosshair', 'spin', (s, p) => p.ownedAll],
  ['courier', 'Signed, Sealed', 'Finish five courier jobs.', 's', 'box', 'drop', s => s.jobs >= 5],
  ['tourist', 'Tourist', 'Fast travel to five places.', 'b', 'pin', 'float', s => (s.travelled || []).length >= 5],
  ['collector', 'Car Collector', 'Keep three cars in your garage.', 's', 'garage', 'drop', (s, p) => p.garage >= 3],
  ['pimp', 'Showroom Ready', 'Fit five body-shop parts.', 'g', 'spanner', 'spin', s => (s.parts || 0) >= 5],
  ['sharpshooter', 'Sharpshooter', 'Ten headshots.', 'g', 'target', 'zoom', s => (s.headshots || 0) >= 10],
  ['social', 'Social Butterfly', 'Say something in online chat.', 'b', 'bubble', 'float', s => (s.chats || 0) >= 1],
  ['hopper', 'Server Hopper', 'Play on three different servers.', 's', 'globe', 'spin', s => (s.servers || []).length >= 3],
  ['rival', 'Rivalry', 'Take down another player.', 'g', 'swords', 'burst', s => (s.pvpKills || 0) >= 1],
  ['night-owl', 'Night Owl', 'Drive around at 3 a.m.', 'b', 'moon', 'fade', (s, p) => p.inCar && p.hour >= 3 && p.hour < 4],
  ['dancer', 'Dance Floor', 'Dance in the street.', 'b', 'note', 'warp', s => (s.danced || 0) >= 1],
];
export const ACHIEVEMENTS = A.map(([id, name, desc, tier, icon, anim, test]) => ({ id, name, desc, tier, icon, anim, test }));

// ---- emblems: simple bold glyphs, white on the tier medal
const ICON = {
  key: '<circle cx="24" cy="32" r="9" fill="none" stroke="#fff" stroke-width="5"/><path d="M33 32h18M45 32v7M51 32v5" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>',
  key2: '<circle cx="22" cy="30" r="8" fill="none" stroke="#fff" stroke-width="5"/><path d="M30 30h20M44 30v7M50 30v5" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M14 46l36 0" stroke="#fff" stroke-width="3" stroke-dasharray="4 4"/>',
  gauge: '<path d="M14 42a18 18 0 1 1 36 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M32 42l12-12" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  gauge2: '<path d="M12 42a20 20 0 1 1 40 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M32 42l16-4" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M10 50h44" stroke="#fff" stroke-width="3"/>',
  wing: '<path d="M10 38c10-14 26-18 44-14-10 2-16 6-20 12 8-2 14-1 18 2-14 0-28 4-42 0z" fill="#fff"/>',
  plane: '<path d="M8 34l22-4 8-16 6 2-4 14 14 2 4-6 4 1-2 9 2 9-4 1-4-6-14 2 4 14-6 2-8-16-22-4z" fill="#fff"/>',
  crash: '<rect x="14" y="26" width="30" height="14" rx="4" fill="#fff"/><circle cx="21" cy="42" r="4" fill="#fff"/><circle cx="38" cy="42" r="4" fill="#fff"/><path d="M48 20l6-6M50 28h8M48 36l6 6" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  crash2: '<path d="M12 40l10-14h20l10 14z" fill="#fff"/><path d="M20 22l4 6M32 18v8M44 22l-4 6" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="20" cy="44" r="5" fill="#fff"/><circle cx="44" cy="44" r="5" fill="#fff"/>',
  boom: '<path d="M32 8l5 13 13-5-6 13 12 6-13 4 4 13-12-7-6 12-4-13-13 4 6-12-12-7 13-3-4-13 12 6z" fill="#fff"/>',
  tower: '<rect x="20" y="14" width="22" height="36" fill="#fff"/><path d="M24 20h4M34 20h4M24 28h4M34 28h4M24 36h4M34 36h4" stroke="#0004" stroke-width="3"/><path d="M12 52h40" stroke="#fff" stroke-width="4"/>',
  tower2: '<path d="M18 50l6-30 12 4-4 26zM34 50l10-22 8 6-8 16z" fill="#fff"/><path d="M10 52h44" stroke="#fff" stroke-width="4"/>',
  tree: '<path d="M32 10l14 20h-8l10 14H16l10-14h-8z" fill="#fff"/><rect x="29" y="44" width="6" height="10" fill="#fff"/>',
  lamp: '<path d="M24 54V18c0-4 4-6 8-6h12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M40 12h12v5H40z" fill="#fff"/><path d="M18 54h12" stroke="#fff" stroke-width="5"/>',
  star5: '<path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z" fill="#fff"/>',
  ghost: '<path d="M18 50V28a14 14 0 0 1 28 0v22l-5-4-5 4-4-4-4 4-5-4z" fill="#fff"/><circle cx="27" cy="28" r="3" fill="#0006"/><circle cx="37" cy="28" r="3" fill="#0006"/>',
  cuffs: '<circle cx="22" cy="36" r="9" fill="none" stroke="#fff" stroke-width="5"/><circle cx="42" cy="36" r="9" fill="none" stroke="#fff" stroke-width="5"/><path d="M28 24h8" stroke="#fff" stroke-width="5"/>',
  skull: '<path d="M18 30a14 14 0 0 1 28 0v8l-4 2v6H22v-6l-4-2z" fill="#fff"/><circle cx="26" cy="32" r="4" fill="#0007"/><circle cx="38" cy="32" r="4" fill="#0007"/>',
  bag: '<path d="M16 24h32l-3 28H19z" fill="#fff"/><path d="M24 24v-4a8 8 0 0 1 16 0v4" fill="none" stroke="#fff" stroke-width="4"/>',
  chevrons: '<path d="M16 46l16-12 16 12M16 34l16-12 16 12M16 22l16-12 16 12" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>',
  crosshair: '<circle cx="32" cy="32" r="16" fill="none" stroke="#fff" stroke-width="5"/><path d="M32 8v14M32 42v14M8 32h14M42 32h14" stroke="#fff" stroke-width="5"/>',
  box: '<path d="M14 24l18-10 18 10v20L32 54 14 44z" fill="#fff"/><path d="M14 24l18 10 18-10M32 34v20" stroke="#0005" stroke-width="3" fill="none"/>',
  pin: '<path d="M32 54s-14-16-14-26a14 14 0 0 1 28 0c0 10-14 26-14 26z" fill="#fff"/><circle cx="32" cy="28" r="5" fill="#0006"/>',
  garage: '<path d="M10 28l22-14 22 14v24H10z" fill="#fff"/><path d="M18 34h28M18 40h28M18 46h28" stroke="#0005" stroke-width="3"/>',
  spanner: '<path d="M44 12a10 10 0 0 0-12 13L14 43l7 7 18-18a10 10 0 0 0 13-12l-6 6-6-2-2-6z" fill="#fff"/>',
  target: '<circle cx="32" cy="32" r="18" fill="none" stroke="#fff" stroke-width="5"/><circle cx="32" cy="32" r="8" fill="none" stroke="#fff" stroke-width="5"/><circle cx="32" cy="32" r="2" fill="#fff"/>',
  bubble: '<path d="M12 16h40v24H28l-10 10v-10h-6z" fill="#fff"/><path d="M20 26h24M20 32h16" stroke="#0005" stroke-width="3"/>',
  globe: '<circle cx="32" cy="32" r="18" fill="none" stroke="#fff" stroke-width="5"/><path d="M14 32h36M32 14c-8 10-8 26 0 36M32 14c8 10 8 26 0 36" fill="none" stroke="#fff" stroke-width="4"/>',
  swords: '<path d="M14 14l26 26M50 14L24 40" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M36 44l8 8M28 44l-8 8" stroke="#fff" stroke-width="6" stroke-linecap="round"/>',
  moon: '<path d="M40 12a20 20 0 1 0 12 30 16 16 0 0 1-12-30z" fill="#fff"/><circle cx="20" cy="18" r="2" fill="#fff"/><circle cx="14" cy="30" r="1.5" fill="#fff"/>',
  note: '<path d="M26 44V16l22-6v28" fill="none" stroke="#fff" stroke-width="5"/><circle cx="21" cy="44" r="7" fill="#fff"/><circle cx="43" cy="38" r="7" fill="#fff"/>',
};
export function badgeSVG(a, locked) {
  const [c1, c2] = TIER[a.tier], id = 'g' + a.id.replace(/[^a-z0-9]/g, '');
  return `<svg viewBox="0 0 64 64" class="badge-svg" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${locked ? '#3a4152' : c1}"/><stop offset="1" stop-color="${locked ? '#1c2130' : c2}"/></linearGradient></defs>
    <path d="M32 2l26 10v20c0 16-12 26-26 30C18 58 6 48 6 32V12z" fill="url(#${id})" stroke="${locked ? '#2a3142' : '#0007'}" stroke-width="2"/>
    <path d="M32 7l21 8v17c0 13-10 21-21 25" fill="none" stroke="#ffffff40" stroke-width="2"/>
    <g opacity="${locked ? 0.25 : 1}" transform="translate(6 6) scale(.81)">${ICON[a.icon] || ''}</g></svg>`;
}

let O = null, live = { chain: 0, chainT: [] }, checkT = 0;
const queue = [];
export function initAchievements(o) {
  O = o; O.save.ach = O.save.ach || {};
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'achtoast'; document.body.appendChild(el);
  O.bus.on('car:destroyed', e => { if (e.byPlayer || e.vehicle?.driver === 'player') bump('wrecks'); });
  O.bus.on('building:collapsed', () => { const now = performance.now(); live.chainT.push(now); });
  O.bus.on('explosion', () => { const now = performance.now(); live.chainT = live.chainT.filter(t => now - t < 3000); live.chainT.push(now); live.chain = live.chainT.length; });
}
export function bump(k, n = 1) { const s = O.save.stats; s[k] = (s[k] || 0) + n; }
export function addTo(k, v) { const s = O.save.stats; const a = Array.isArray(s[k]) ? s[k] : (s[k] = []); if (!a.includes(v)) a.push(v); }
export function tickAchievements(dt) {
  checkT -= dt; if (checkT > 0 || !O) return; checkT = 0.5;
  const s = O.save.stats, p = Object.assign(O.probe(), { chain: live.chain });
  for (const a of ACHIEVEMENTS) if (!O.save.ach[a.id]) { let ok = false; try { ok = a.test(s, p); } catch (e) { } if (ok) unlock(a.id); }
}
export function unlock(id) {
  if (!O || O.save.ach[id]) return; const a = ACHIEVEMENTS.find(x => x.id === id); if (!a) return;
  O.save.ach[id] = Date.now(); O.persist(); queue.push(a); if (queue.length === 1) showNext();
}
function showNext() {
  const a = queue[0]; if (!a) return; const el = document.getElementById('achtoast');
  el.className = 'show anim-' + a.anim + ' tier-' + a.tier;
  el.innerHTML = `<div class="ach-badge">${badgeSVG(a)}<i class="ach-ring"></i><i class="ach-shine"></i></div><div class="ach-text"><small>Achievement unlocked</small><b>${a.name}</b><span>${a.desc}</span></div>`;
  if (O.sfx && O.sfx.achieve) O.sfx.achieve(a.tier);
  setTimeout(() => { el.classList.add('out'); }, 4200);
  setTimeout(() => { el.className = ''; queue.shift(); showNext(); }, 4800);
}
export function achievementCount() { return O ? Object.keys(O.save.ach).length : 0; }
export function renderAchievements(box) {
  box.textContent = ''; const got = O ? O.save.ach : {};
  for (const a of ACHIEVEMENTS) {
    const d = document.createElement('div'); d.className = 'ach-card' + (got[a.id] ? ' got tier-' + a.tier : ' locked');
    d.innerHTML = `<div class="ach-mini anim-${a.anim}">${badgeSVG(a, !got[a.id])}</div><div><b>${a.name}</b><span>${a.desc}</span>${got[a.id] ? `<small>${new Date(got[a.id]).toLocaleDateString()}</small>` : ''}</div>`;
    box.append(d);
  }
}

const CSS = `
#achtoast{position:fixed;z-index:55;left:50%;top:calc(80px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:none;align-items:center;gap:14px;padding:12px 22px 12px 14px;background:linear-gradient(100deg,rgba(10,16,32,.95),rgba(20,28,52,.92));border:1px solid rgba(255,255,255,.08);border-radius:999px;box-shadow:0 18px 50px rgba(0,0,0,.5);pointer-events:none;color:var(--paper)}
#achtoast.show{display:flex;animation:achIn .5s cubic-bezier(.2,1.4,.4,1) both} #achtoast.out{animation:achOut .5s ease-in both}
@keyframes achIn{from{transform:translateX(-50%) translateY(-30px) scale(.7);opacity:0}} @keyframes achOut{to{transform:translateX(-50%) translateY(-20px) scale(.9);opacity:0}}
.ach-badge{position:relative;width:64px;height:64px;flex:none} .ach-badge .badge-svg{width:64px;height:64px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5))}
.ach-ring{position:absolute;inset:-6px;border-radius:50%;border:3px solid var(--gold);opacity:0;animation:achRing .9s .25s ease-out}
@keyframes achRing{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(1.7)}}
.ach-shine{position:absolute;inset:0;clip-path:polygon(50% 0,100% 15%,100% 50%,50% 100%,0 50%,0 15%);background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.75) 50%,transparent 65%);background-size:250% 100%;animation:achShine 1.2s .5s ease-in-out}
@keyframes achShine{from{background-position:120% 0}to{background-position:-60% 0}}
.ach-text{display:flex;flex-direction:column;gap:2px} .ach-text small{font:700 11px/1 var(--ui);letter-spacing:.3em;text-transform:uppercase;color:var(--gold)}
.ach-text b{font:400 26px/1 var(--display);letter-spacing:.03em;text-transform:uppercase} .ach-text span{font:500 14px/1.2 var(--ui);color:var(--dim)}
.tier-p .ach-ring{border-color:#9ff0ff} .tier-g .ach-ring{border-color:#ffd23f} .tier-s .ach-ring{border-color:#d9dee6} .tier-b .ach-ring{border-color:#c98a4b}
/* each badge arrives its own way */
.anim-stamp .badge-svg{animation:aStamp .55s cubic-bezier(.3,1.6,.5,1) both} @keyframes aStamp{from{transform:scale(2.4) rotate(-14deg);opacity:0}}
.anim-spin .badge-svg{animation:aSpin .9s cubic-bezier(.2,.9,.3,1) both} @keyframes aSpin{from{transform:rotateY(540deg) scale(.4);opacity:0}}
.anim-zoom .badge-svg{animation:aZoom .5s cubic-bezier(.2,1.5,.4,1) both} @keyframes aZoom{from{transform:scale(0)}}
.anim-warp .badge-svg{animation:aWarp .7s ease-out both} @keyframes aWarp{0%{transform:translateX(-60px) skewX(40deg);opacity:0;filter:blur(6px)}70%{transform:translateX(6px) skewX(-8deg)}}
.anim-float .badge-svg{animation:aFloat .9s ease-out both} @keyframes aFloat{0%{transform:translateY(30px);opacity:0}60%{transform:translateY(-6px)}}
.anim-shake .badge-svg{animation:aShake .7s ease-out both} @keyframes aShake{0%{transform:scale(.3);opacity:0}30%{transform:scale(1.15) rotate(8deg)}45%{transform:rotate(-8deg)}60%{transform:rotate(5deg)}75%{transform:rotate(-3deg)}}
.anim-burst .badge-svg{animation:aBurst .6s cubic-bezier(.2,1.8,.4,1) both} @keyframes aBurst{0%{transform:scale(0) rotate(-90deg);filter:brightness(4)}100%{filter:brightness(1)}}
.anim-drop .badge-svg{animation:aDrop .8s cubic-bezier(.3,1.5,.5,1) both} @keyframes aDrop{0%{transform:translateY(-70px);opacity:0}55%{transform:translateY(4px) scaleY(.85)}}
.anim-flip .badge-svg{animation:aFlip .75s ease-out both} @keyframes aFlip{from{transform:rotateX(-180deg);opacity:0}}
.anim-fade .badge-svg{animation:aFade 1.1s ease-out both} @keyframes aFade{from{opacity:0;filter:blur(8px) grayscale(1)}}
/* menu grid */
.achgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px;max-height:58vh;overflow:auto;padding-right:6px}
.ach-card{display:flex;gap:12px;align-items:center;padding:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}
.ach-card b{display:block;font:400 19px/1.05 var(--display);letter-spacing:.03em;text-transform:uppercase} .ach-card span{display:block;font:500 13px/1.25 var(--ui);color:var(--dim)} .ach-card small{font:700 11px/1 var(--ui);letter-spacing:.1em;color:var(--sage)}
.ach-card.locked b{color:#7c8499} .ach-mini{width:48px;height:48px;flex:none} .ach-mini .badge-svg{width:48px;height:48px}
.ach-card.got:hover .badge-svg{animation-duration:.6s;animation-iteration-count:1} .ach-card.got .ach-mini{animation:none}
.ach-card.got:hover .ach-mini .badge-svg{animation-name:aSpin}
`;
