// How to play, taught as you go: a card on the left with the key and one line on what it does, shown when a mission
// step needs it (a step's `tip`) or the first time something happens to you (the first stars, the first witness). It
// goes away once you've done the thing, and never comes back: save.story.tips lists what you've learned.
//   tip(id)          show it (queued behind the one showing; nothing if you already know it)
//   untip(id)        stop waiting to show it (the step that wanted it is over)
//   updateTips(dt)   every frame
//   TIPS             every tip, for the journal's how-to-play page
import { ctx } from '../ctx.js';
import { on } from '../events.js';
import { police } from '../police.js';

const seen = new Map(); // key code / 'click' -> last time pressed (performance.now)
let ready = false, el = null, cur = null, curT = 0, queue = [], yaw0 = null, walked = 0, lastP = null, shot = 0;
const pressed = (k, since) => (seen.get(k) || 0) > since;
const P = () => ctx.player;
// k: what to press (shown as keys); t: what it does; done(t0): has the player done it since the card came up
export const TIPS = {
  look: { k: ['Mouse'], t: 'Look around.', done: () => yaw0 !== null && Math.abs(ctx.cam.yaw - yaw0) > 0.6 },
  move: { k: ['W', 'A', 'S', 'D'], t: 'Walk.', done: () => walked > 5 },
  sprint: { k: ['Shift'], t: 'Hold it to run.', done: () => !P().inCar && P().speed > 6 },
  jump: { k: ['Space'], t: 'Jump.', done: () => P().air > 0.35 },
  roll: { k: ['X'], t: 'Dodge roll while you run. Shots miss you more.', done: () => P().rollT > 0 },
  crouch: { k: ['C'], t: 'Crouch: slower, quieter, much harder to spot.', done: () => !!P().crouch },
  talk: { k: ['E'], t: 'Talk to people, use things. E also skips a line of dialogue.', done: t0 => pressed('KeyE', t0) },
  map: { k: ['M'], t: 'The map. Click anywhere to set a waypoint; its route shows on the minimap.', done: () => !!ctx.mapOpen },
  travel: { k: ['K'], t: 'Fast travel to places you know. Your car comes with you.', done: t0 => pressed('KeyK', t0) },
  punch: { k: ['Click'], t: 'Punch. Keep swinging.', done: t0 => pressed('click', t0) && !P().weapon },
  wheel: { k: ['Tab'], t: 'Hold for the weapon wheel and point at a gun. The mouse wheel and 1–0 work too.', done: t0 => pressed('Tab', t0) || pressed('wheel', t0) },
  aim: { k: ['Right click'], t: 'Aim. Q locks the aim on, no button to hold.', done: () => !!P().aiming },
  shoot: { k: ['Click'], t: 'Shoot. Aimed shots go where the cross is.', done: () => shot > 0 },
  car: { k: ['F'], t: 'Get in a car. If somebody\'s driving it, F pulls them out.', done: () => !!P().inCar },
  drive: { k: ['W', 'S'], t: 'Gas, and brake or reverse. A and D steer, Space is the handbrake.', done: () => !!P().inCar && P().inCar.vel.length() > 12 },
  radio: { k: ['R'], t: 'Next radio station. Hold Q in a car for the radio wheel.', done: t0 => pressed('KeyR', t0) || pressed('KeyQ', t0) },
  horn: { k: ['H'], t: 'Horn.', done: t0 => pressed('KeyH', t0) },
  stars: { k: ['★'], t: 'Stars: the Sheriff wants you. Get out of sight, then outside the circle on the minimap, until they give up.', done: () => !police.wanted },
  witness: { k: ['👁'], t: 'A witness. They run, then call 911, and that call is your stars. Stop them first, or do it where nobody sees.', done: (t0, age) => age > 14 },
  garage: { k: ['E'], t: 'In a garage bay: save the car you\'re in. It\'s yours from then on, and comes back repaired if you lose it.', done: () => (ctx.save.garage || []).length > 0 },
  callcar: { k: ['N'], t: 'Call your car. It pulls up wherever you are.', done: t0 => pressed('KeyN', t0) },
  journal: { k: ['Esc'], t: 'Pause. The journal there has your story, the crimes you know and everyone you\'ve met.', done: t0 => pressed('Escape', t0) || !!ctx.paused },
  jobs: { k: ['J'], t: 'A courier job, whenever you\'re free. Honest money, fast.', done: t0 => pressed('KeyJ', t0) },
};
const CSS = `
#tipcard{position:fixed;left:18px;top:42%;z-index:6;max-width:300px;pointer-events:none;padding:10px 14px 11px;border-radius:6px;
  background:linear-gradient(160deg,rgba(59,36,23,.94),rgba(21,12,9,.94));box-shadow:0 0 0 1px #5b3822,inset 0 0 0 3px rgba(242,163,58,.12),0 8px 24px rgba(0,0,0,.45);
  color:#f3e6cc;font:600 16px/1.3 "Barlow Condensed",Arial,sans-serif;opacity:0;transform:translateX(-12px);transition:opacity .35s,transform .35s}
#tipcard.on{opacity:1;transform:none}
#tipcard.got{box-shadow:0 0 0 2px #9bd16e,0 8px 24px rgba(0,0,0,.45)}
#tipcard h5{margin:0 0 6px;font:400 13px/1 Rye,serif;letter-spacing:.12em;color:#f2a33a}
#tipcard kbd{display:inline-block;min-width:20px;text-align:center;font:700 14px/1 "Barlow Condensed",Arial;color:#150c09;background:linear-gradient(#ffc64d,#f2a33a);border-radius:4px;padding:4px 7px 3px;margin:0 4px 4px 0;box-shadow:0 2px 0 #8a5a1c}
body.cine #tipcard{visibility:hidden}
@media (prefers-reduced-motion:reduce){#tipcard{transition:none}}`;
function init() {
  ready = true;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  el = document.createElement('div'); el.id = 'tipcard'; el.className = 'hud'; document.body.appendChild(el);
  addEventListener('keydown', e => seen.set(e.code, performance.now()), true);
  addEventListener('mousedown', e => seen.set(e.button === 2 ? 'rclick' : 'click', performance.now()), true);
  addEventListener('wheel', () => seen.set('wheel', performance.now()), { capture: true, passive: true });
  on('shot:fired', e => { if (e.from === 'player') shot++; });
  on('wanted', e => { if (e.level > 0 && !e.prev) tip('stars'); });
}
const learned = () => { const st = ctx.save.story || (ctx.save.story = {}); return st.tips || (st.tips = []); };
export function tip(id) {
  if (!TIPS[id] || ctx.online || learned().includes(id)) return;
  if (cur && cur.id === id) return; if (!queue.includes(id)) queue.push(id);
}
export function untip(id) { queue = queue.filter(q => q !== id); }
function show(id) {
  const T = TIPS[id]; cur = { id, t0: performance.now() }; curT = 0; shot = 0;
  if (id === 'look') yaw0 = ctx.cam.yaw; if (id === 'move') walked = 0;
  el.innerHTML = `<h5>HOW TO PLAY</h5>${T.k.map(k => `<kbd>${k}</kbd>`).join('')} ${T.t}`; el.classList.remove('got'); el.classList.add('on');
}
export function updateTips(dt) {
  if (!ready) { if (!ctx.save || !ctx.player) return; init(); }
  const p = P(); if (lastP && !p.inCar) walked += Math.hypot(p.pos.x - lastP.x, p.pos.z - lastP.z); lastP = { x: p.pos.x, z: p.pos.z };
  if (!cur) {
    while (queue.length && learned().includes(queue[0])) queue.shift();
    if (queue.length && !ctx.player.dead && !document.body.classList.contains('cine')) show(queue.shift());
    return;
  }
  curT += dt;
  if (cur.done) { if (curT > cur.done + 1.1) { el.classList.remove('on'); if (curT > cur.done + 1.5) cur = null; } return; }
  if (curT > 0.8 && TIPS[cur.id].done(cur.t0, curT)) { // got it: a green edge, then gone
    if (!learned().includes(cur.id)) learned().push(cur.id);
    el.classList.add('got'); cur.done = curT;
  }
}
// the journal's page: what you've been shown so far, and the keys for everything else
export function tipsJournal() {
  const L = learned(), esc = s => String(s).replace(/</g, '&lt;');
  return '<h3>How to play</h3>' + Object.entries(TIPS).map(([id, T]) => `<p style="${L.includes(id) ? '' : 'opacity:.6'}">${T.k.map(k => `<b>${esc(k)}</b>`).join(' ')} · ${esc(T.t)}</p>`).join('');
}
