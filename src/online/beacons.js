// Other players, findable at a glance. Past a few dozen metres, or out of sight behind a building, each one gets a
// marker on screen over where they are: their colour, name and distance, drawn over the world so it reads through
// buildings and at any range. Up close, in plain view, their own name tag with the health bar (remote.js) shows
// instead, so there is only ever one label per player. Nobody gets a marker in ground you haven't explored yet (the
// map's fog, src/ui/fog.js). Reads REMOTES, so it works whatever net.js talks to.
//   updateBeacons(dt)   once a frame, after the camera moved
import { ctx } from '../ctx.js';
import { REMOTES } from './remote.js';
import { fogSeen } from '../ui/fog.js';

const NEAR = 40; // metres: closer than this, with a clear view, the 3D name tag is enough
const CSS = `
#beacons{position:fixed;inset:0;pointer-events:none;z-index:4;overflow:hidden}
#beacons .bcn{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;will-change:transform;transform-origin:50% 100%;
  font:700 15px/1 "Barlow Condensed","Arial Narrow",sans-serif;color:#fff;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.8)}
#beacons .pl{display:flex;align-items:center;gap:6px;padding:3px 9px 3px 3px;border-radius:999px;background:rgba(10,14,22,.8);box-shadow:0 0 0 1.5px var(--c),0 3px 10px rgba(0,0,0,.45)}
#beacons .ini{width:19px;height:19px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 2px #fff;display:grid;place-items:center;color:#0e1013;font-size:12px;text-shadow:none}
#beacons .ds{font-weight:600;font-size:13px;color:rgba(255,255,255,.72)}
#beacons .chev{width:0;height:0;margin-top:2px;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid var(--c);filter:drop-shadow(0 1px 1px rgba(0,0,0,.7))}
#beacons .bcn.dead{--c:#8a8f99 !important}
#beacons .bcn.dead .nm{text-decoration:line-through;opacity:.8}`;

let root = null, lastT = 0, V = null;
const B = new Map(); // player id -> { el, nm, ds, ini, key, w, losT, clear }
function ensure() {
  if (root) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  root = document.createElement('div'); root.id = 'beacons'; document.body.appendChild(root);
  V = new ctx.THREE.Vector3();
  setInterval(() => { root.style.visibility = performance.now() - lastT > 300 ? 'hidden' : ''; }, 200); // paused, map open, back at the menu
}
function make(rem) {
  const el = document.createElement('div'); el.className = 'bcn';
  el.innerHTML = '<div class="pl"><span class="ini"></span><span class="nm"></span><span class="ds"></span></div><i class="chev"></i>';
  root.appendChild(el);
  return { el, nm: el.querySelector('.nm'), ds: el.querySelector('.ds'), ini: el.querySelector('.ini'), key: '', dist: '', w: 110, losT: 0, clear: false, shown: false };
}
const fmt = d => d >= 1000 ? (d / 1000).toFixed(d >= 10000 ? 0 : 1) + ' km' : Math.round(d / 5) * 5 + ' m';
const hide = b => { if (b.shown) { b.el.style.display = 'none'; b.shown = false; } };

export function updateBeacons(dt) {
  const camera = ctx.camera; if (!camera || (!REMOTES.size && !B.size)) return;
  ensure(); lastT = performance.now();
  for (const [id, b] of B) if (!REMOTES.has(id)) { b.el.remove(); B.delete(id); }
  const cam = camera.position, W = innerWidth, H = innerHeight, list = [];
  for (const rem of REMOTES.values()) {
    const p = rem.ped; if (!p) continue;
    let b = B.get(rem.id); if (!b) { b = make(rem); B.set(rem.id, b); }
    const at = rem.car ? rem.car.g.position : p.pos, top = at.y + (rem.car ? 2.3 : 2.1);
    const d = Math.hypot(at.x - cam.x, top - cam.y, at.z - cam.z);
    b.losT -= dt; if (b.losT <= 0) { b.losT = 0.2 + Math.random() * 0.1; b.clear = d < NEAR + 10 && ctx.los(cam.x, cam.y, cam.z, at.x, top, at.z); }
    if (!fogSeen(at.x, at.z)) { hide(b); if (rem.tag) rem.tag.visible = d < NEAR && b.clear; continue; } // somewhere you haven't explored (src/ui/fog.js)
    const show = !(d < NEAR && b.clear);
    if (rem.tag) rem.tag.visible = !show; // one label per player
    if (!show) { hide(b); continue; }
    V.set(at.x, top + 0.35, at.z).project(camera);
    if (V.z > 1 || V.x < -1.1 || V.x > 1.1 || V.y < -1.1 || V.y > 1.15) { hide(b); continue; } // behind or off screen: the minimap's edge arrow points at them
    list.push({ b, rem, d, x: (V.x + 1) / 2 * W, y: (1 - V.y) / 2 * H });
  }
  list.sort((a, b) => a.d - b.d); // nearest first; one that would land on a nearer one goes above it
  const placed = [];
  for (const q of list) {
    const { b, rem } = q, dead = !!(rem.st && rem.st.dead), key = rem.name + '|' + rem.color + '|' + dead;
    if (key !== b.key) {
      b.key = key; b.nm.textContent = rem.name; b.ini.textContent = (rem.name || '?').trim().charAt(0).toUpperCase();
      b.el.style.setProperty('--c', rem.color); b.el.classList.toggle('dead', dead); b.w = 0;
    }
    const dist = fmt(q.d); if (dist !== b.dist) { b.dist = dist; b.ds.textContent = dist; b.w = 0; }
    if (!b.shown) { b.el.style.display = ''; b.shown = true; }
    if (!b.w) b.w = b.el.offsetWidth || 110;
    const k = Math.max(0.78, Math.min(1, 1.08 - q.d / 2500)), w = b.w * k, h = 34 * k;
    let y = q.y;
    for (let i = 0; i < 5; i++) { const hit = placed.find(p => Math.abs(p.x - q.x) < (p.w + w) / 2 && Math.abs(p.y - y) < h); if (!hit) break; y = hit.y - h; }
    placed.push({ x: q.x, y, w });
    b.el.style.transform = `translate(${q.x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%) scale(${k.toFixed(3)})`;
    b.el.style.opacity = q.d > 1500 ? '0.85' : '1';
  }
}
