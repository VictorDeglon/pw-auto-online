// "Press E here" registry (docs/roadmap/00-foundations.md §6). Any system registers an interactable
// { x, z, r, label, onUse, when? } and gets a handle back; the nearest one in range drives #prompt.
import { ctx } from './ctx.js';

const items = new Set();
let current = null, shown = null; // shown: the prompt's markup as last written (only rewritten when it changes)

export function addInteract(it) { items.add(it); return it; }
export function removeInteract(it) { items.delete(it); if (current === it) current = null; }

export function updateInteract() {
  const el = document.getElementById('prompt');
  const p = ctx.player;
  let best = null, bd = Infinity;
  if (!p.dead && !ctx.paused) {
    const f = ctx.focusPos();
    for (const it of items) {
      if (it.when && !it.when()) continue;
      const d = Math.hypot(it.x - f.x, it.z - f.z);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
  }
  current = best;
  if (!el) return;
  if (best) {
    const label = typeof best.label === 'function' ? best.label() : best.label, html = `<kbd>E</kbd> ${label}`;
    if (html !== shown) { el.innerHTML = html; shown = html; }
    if (el.hidden) el.hidden = false;
  } else if (!el.hidden) el.hidden = true;
}

export function useInteract() {
  if (current && !ctx.player.dead) { const it = current; it.onUse(it); return true; }
  return false;
}
