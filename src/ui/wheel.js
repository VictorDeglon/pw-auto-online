// GTA-style radial wheels, made to work on a touchpad as well as a mouse:
//   hold the key, point, let go     the classic flick
//   tap the key                     the wheel stays open: swipe, ← → (or A D) or a number key to choose, then click,
//                                   Enter, Space or the key again to take it; Esc closes it
//   scroll (wheel or two fingers)   opens it and steps through it; it equips on its own once you stop scrolling
// Pointing adds up into a cursor that stays where you leave it (a dot on the wheel): short touchpad strokes nudge it,
// lifting the finger doesn't lose it, and it stops at the ring.
//   const W = createWheel({ title, help, stickyHelp, items: () => [{ label, sub, icon, off, color }], current: () => i, onPick: i => {} })
//   W.show()  W.move(dx, dy)  W.hover(clientX, clientY)  W.step(±1)  W.choose(i)  W.scroll(deltaY, notch)  W.release()  W.commit()  W.cancel()
//   W.open  W.sticky
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
  const REACH = 110, DEAD = 22, TAP_MS = 250; // cursor travel (px), how far before it picks, a tap vs a hold
  let items = [], sel = -1, cx = 0, cy = 0, openedAt = 0, moved = false, dot = null, help = null;
  let acc = 0, lastScroll = 0, lastStep = 0, burst = 0, settleT = 0, byScroll = false;
  const api = {
    open: false, sticky: false,
    show() {
      items = o.items(); if (!items.length) return false;
      sel = o.current ? o.current() : -1; cx = cy = 0; moved = false; api.sticky = false; byScroll = false; acc = 0; burst = 0; openedAt = performance.now();
      api.open = true; render(); el.hidden = false; requestAnimationFrame(() => el.classList.add('in')); return true;
    },
    move(dx, dy) {
      cx += dx; cy += dy; const r = Math.hypot(cx, cy); if (r > REACH) { cx *= REACH / r; cy *= REACH / r; }
      if (Math.hypot(cx, cy) > DEAD) { moved = true; pickAt(Math.atan2(cx, -cy)); }
      place(); settle();
    },
    hover(x, y) { const ox = x - innerWidth / 2, oy = y - innerHeight / 2; if (Math.hypot(ox, oy) > 40) { moved = true; pickAt(Math.atan2(ox, -oy)); } },
    step(d) { // next (or previous) slice you can take
      const n = items.length; let i = sel < 0 ? (d > 0 ? -1 : 0) : sel;
      for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!items[i].off) break; }
      moved = true; setSel(i); aimAt(i);
    },
    scroll(d, notch) { // a mouse-wheel click is one step; a touchpad stroke adds up: one step at once, then one per long stroke
      const now = performance.now();
      if (notch) { if (now - lastStep > 50) { api.step(d > 0 ? 1 : -1); lastStep = now; } }
      else {
        if (now - lastScroll > 400) acc = 0; lastScroll = now; // a pause in the stroke starts the count again
        acc += d;
        if (Math.abs(acc) >= (burst ? 200 : 24) && now - lastStep > 200) { api.step(acc > 0 ? 1 : -1); acc = 0; burst++; lastStep = now; }
      }
      if (!byScroll) { byScroll = true; api.sticky = true; el.classList.add('sticky'); if (help) help.textContent = o.scrollHelp || 'Scroll to choose · it equips when you stop'; }
      settle();
    },
    choose(i) { if (!items[i] || items[i].off) return; setSel(i); api.commit(); },
    release() { // the key came up: a quick tap leaves the wheel open for the touchpad, a hold takes what's highlighted
      if (!api.open) return;
      if (!moved && performance.now() - openedAt < TAP_MS) { api.sticky = true; el.classList.add('sticky'); if (help) help.textContent = o.stickyHelp || 'Swipe or ← → to choose · click or Enter to take · Esc to close'; return; }
      api.commit();
    },
    commit() { if (!api.open) return; const i = sel; api.cancel(); if (i >= 0 && items[i] && !items[i].off) o.onPick(i); },
    cancel() { clearTimeout(settleT); api.open = false; api.sticky = false; byScroll = false; el.classList.remove('in', 'sticky'); el.hidden = true; },
  };
  function settle() { if (!byScroll) return; clearTimeout(settleT); settleT = setTimeout(() => { if (api.open && byScroll) api.commit(); }, 700); }
  function setSel(i) { if (i !== sel) { sel = i; mark(); o.tick && o.tick(); } }
  function aimAt(i) { const a = i * Math.PI * 2 / items.length, r = REACH * 0.7; cx = Math.sin(a) * r; cy = -Math.cos(a) * r; place(); }
  function place() { if (dot) { const k = 135 / REACH; dot.style.transform = `translate(${cx * k}px, ${cy * k}px)`; dot.style.opacity = Math.hypot(cx, cy) > 4 ? 1 : 0; } }
  function pickAt(a) { const n = items.length; setSel(((Math.round(a / (Math.PI * 2 / n)) % n) + n) % n); }
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
    el.innerHTML = `<div class="wtitle">${o.title}</div>${svg}<div class="wcenter"></div><div class="whelp"></div>`;
    help = el.querySelector('.whelp'); help.textContent = o.help || 'Point to choose · let go to pick · tap to keep it open';
    dot = document.createElement('i'); dot.className = 'wdot';
    dot.style.cssText = 'position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(0,0,0,.35),0 0 14px rgba(255,255,255,.6);opacity:0;transition:opacity .1s;pointer-events:none';
    el.append(dot);
    mark();
  }
  return api;
}
