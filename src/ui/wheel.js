// GTA-style radial wheels: hold a key, move the mouse (or the cursor) toward a slice, let go to pick.
//   const W = createWheel({ title, items: () => [{ label, sub, icon, off, color }], current: () => i, onPick: i => {} })
//   W.show()  W.move(dx, dy)  W.hover(clientX, clientY)  W.commit()  W.cancel()  W.open
// icon: an SVG fragment drawn in a 64x32 box (weapons) or 32x32 (stations).
export const ICONS = {
  fists: '<path d="M22 8h16a6 6 0 0 1 6 6v6a8 8 0 0 1-8 8H26a8 8 0 0 1-8-8v-8a4 4 0 0 1 4-4z"/><path d="M26 8v8M32 8v8M38 8v8" stroke="#000" stroke-opacity=".35" stroke-width="1.6"/><path d="M18 18h-4a3 3 0 0 0 0 6h5" />',
  pistol: '<path d="M10 9h40v7H30l-2 3h-6l-3 9h-8l3-12h-4z"/><rect x="50" y="10" width="4" height="4"/>',
  smg: '<path d="M6 10h40v7H34l-3 13h-6l2-13h-6l-2 6h-6l2-6H6z"/><rect x="46" y="11" width="12" height="3"/><rect x="2" y="12" width="6" height="2"/>',
  shotgun: '<path d="M4 15l14-3h42v4H32v3H20l-6 6H6z"/><rect x="34" y="17" width="16" height="3"/>',
  rifle: '<path d="M2 14l12-2 4-3h28v6h14v3H40l-4 10h-6l3-9h-9l-6 5H4z"/><rect x="24" y="5" width="12" height="3"/>',
  sniper: '<path d="M2 15l14-3h48v3H40l-2 3H22l-6 5H4z"/><rect x="22" y="6" width="18" height="4" rx="2"/><rect x="28" y="10" width="3" height="3"/>',
  minigun: '<rect x="20" y="9" width="40" height="3"/><rect x="20" y="13" width="40" height="3"/><rect x="20" y="17" width="40" height="3"/><rect x="8" y="7" width="16" height="15" rx="3"/><path d="M12 22h8l-2 7h-6z"/>',
  rpg: '<rect x="4" y="12" width="46" height="7" rx="2"/><path d="M50 10l12 5.5-12 5.5z"/><path d="M18 19h6l-2 8h-5zM32 19h5l-1 6h-5z"/>',
  gl: '<rect x="6" y="11" width="24" height="9" rx="2"/><circle cx="34" cy="15.5" r="7"/><rect x="40" y="12" width="20" height="6"/><path d="M14 20h6l-3 8h-6z"/>',
  grenade: '<ellipse cx="32" cy="18" rx="9" ry="11"/><rect x="28" y="3" width="8" height="5"/><path d="M36 5h8v3h-8z"/>',
  sticky: '<rect x="20" y="9" width="24" height="16" rx="3"/><circle cx="38" cy="13" r="2.4" fill="#ff3b30"/><path d="M24 25v4M40 25v4" stroke-width="2" stroke="currentColor"/>',
  airstrike: '<rect x="27" y="6" width="10" height="22" rx="3"/><path d="M32 2l3 4h-6z" fill="#ff3b30"/><path d="M14 10l8 4M14 22l8-4M50 10l-8 4M50 22l-8-4" stroke="currentColor" stroke-width="2"/>',
  radio: '<circle cx="16" cy="18" r="4"/><path d="M8 10a11 11 0 0 1 16 0M4 6a17 17 0 0 1 24 0" fill="none" stroke="currentColor" stroke-width="2.4"/>',
  off: '<circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" stroke-width="3"/><path d="M9 9l14 14" stroke="currentColor" stroke-width="3"/>',
};
export function createWheel(o) {
  const el = document.createElement('div'); el.className = 'wheel'; el.hidden = true; document.body.append(el);
  let items = [], sel = -1, vx = 0, vy = 0;
  const api = {
    open: false,
    show() {
      items = o.items(); if (!items.length) return false;
      sel = o.current ? o.current() : -1; vx = vy = 0; api.open = true; render(); el.hidden = false; requestAnimationFrame(() => el.classList.add('in')); return true;
    },
    move(dx, dy) { vx = vx * 0.85 + dx; vy = vy * 0.85 + dy; if (Math.hypot(vx, vy) > 18) pickAt(Math.atan2(vx, -vy)); },
    hover(x, y) { const cx = innerWidth / 2, cy = innerHeight / 2; if (Math.hypot(x - cx, y - cy) > 40) pickAt(Math.atan2(x - cx, -(y - cy))); },
    commit() { if (!api.open) return; const i = sel; api.cancel(); if (i >= 0 && items[i] && !items[i].off) o.onPick(i); },
    cancel() { api.open = false; el.classList.remove('in'); el.hidden = true; },
  };
  function pickAt(a) { const n = items.length, k = ((Math.round(a / (Math.PI * 2 / n)) % n) + n) % n; if (k !== sel) { sel = k; mark(); o.tick && o.tick(); } }
  function mark() {
    el.querySelectorAll('.wseg').forEach((s, i) => s.classList.toggle('sel', i === sel));
    const it = items[sel], c = el.querySelector('.wcenter');
    c.innerHTML = ''; const b = document.createElement('b'); b.textContent = it ? it.label : ''; const s = document.createElement('small'); s.textContent = it ? (it.off ? (it.offText || 'Locked') : it.sub || '') : ''; c.append(b, s);
  }
  function render() {
    const n = items.length, R = 190, r0 = 78, size = 2 * R + 40, C = size / 2, step = Math.PI * 2 / n, gap = 0.012;
    let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;
    items.forEach((it, i) => {
      const a0 = i * step - step / 2 + gap, a1 = i * step + step / 2 - gap, p = (a, r) => [C + Math.sin(a) * r, C - Math.cos(a) * r];
      const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r0), [x3, y3] = p(a0, r0), lg = step > Math.PI ? 1 : 0;
      const [ix, iy] = p(i * step, (R + r0) / 2), wpn = !!it.wide;
      svg += `<g class="wseg${it.off ? ' off' : ''}" style="--c:${it.color || '#f0b23a'}"><path d="M${x0} ${y0}A${R} ${R} 0 ${lg} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${lg} 0 ${x3} ${y3}Z"/>`;
      svg += `<svg x="${ix - (wpn ? 34 : 20)}" y="${iy - (wpn ? 22 : 24)}" width="${wpn ? 68 : 40}" height="${wpn ? 34 : 40}" viewBox="0 0 ${wpn ? 64 : 32} ${wpn ? 32 : 32}" class="wicon">${it.icon || ''}</svg>`;
      if (it.count != null) svg += `<text x="${ix}" y="${iy + (wpn ? 26 : 26)}" class="wcount">${it.count}</text>`;
      if (it.short) svg += `<text x="${ix}" y="${iy + 28}" class="wshort">${String(it.short).replace(/[<>&]/g, '')}</text>`;
      svg += '</g>';
    });
    svg += '</svg>';
    el.innerHTML = `<div class="wtitle">${o.title}</div>${svg}<div class="wcenter"></div><div class="whelp">${o.help || 'Move the mouse to choose · let go to pick'}</div>`;
    mark();
  }
  return api;
}
