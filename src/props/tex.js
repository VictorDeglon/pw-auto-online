// Canvas textures for the prop kit: labels, screens, posters, whiteboard text. Cached by key.
// Nothing here knows about a particular school or place; callers pass the words.

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const COND = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
const HAND = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive';
const SERIF = 'Georgia, "Times New Roman", serif';

export const FONTS = { SANS, COND, HAND, SERIF };

export function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// largest font size <= size so that text fits maxW
export function fit(g, text, maxW, size, family = SANS, weight = 'bold') {
  let s = size;
  for (; s > 6; s -= 1) { g.font = `${weight} ${s}px ${family}`; if (g.measureText(text).width <= maxW) break; }
  return s;
}
export function textC(g, text, x, y, maxW, size, family = SANS, weight = 'bold', color = '#000') {
  const s = fit(g, text, maxW, size, family, weight);
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y);
  return s;
}
function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function wrapLines(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(' '); let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    out.push(line);
  }
  return out;
}
function star(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.382 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
function braille(g, x, y, cells, d, col = '#fff') {
  const R = rng(cells * 7 + 3);
  for (let c = 0; c < cells; c++) for (let i = 0; i < 6; i++) {
    if (R() < 0.45) continue;
    const px = x + c * d * 3.2 + (i % 2) * d * 1.2, py = y + Math.floor(i / 2) * d * 1.2;
    const gr = g.createRadialGradient(px - d * 0.15, py - d * 0.15, 0, px, py, d * 0.45);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, col);
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, d * 0.4, 0, Math.PI * 2); g.fill();
  }
}

export function createTex(THREE, { anisotropy = 4 } = {}) {
  const cache = new Map();
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function wrap(c, o = {}) {
    const t = new THREE.CanvasTexture(c);
    if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function make(key, w, h, draw, o) {
    let t = cache.get(key); if (t) return t;
    const c = canvas(w, h); draw(c.getContext('2d'), w, h);
    t = wrap(c, o); t.name = key; cache.set(key, t); return t;
  }
  // uncached texture the caller redraws (meters, displays); call .redraw(fn) then it re-uploads
  function dynamic(w, h, draw, o) {
    const c = canvas(w, h); const g = c.getContext('2d'); draw(g, w, h);
    const t = wrap(c, o);
    t.redraw = fn => { g.clearRect(0, 0, w, h); fn(g, w, h); t.needsUpdate = true; };
    return t;
  }

  const T = {
    make, dynamic, cache, rng, hashStr,
    dispose() { for (const t of cache.values()) t.dispose(); cache.clear(); },

    // neutral wood grain, tinted by the material colour
    wood: (k = 0) => make('wood' + k, 256, 256, (g, w, h) => {
      const R = rng(11 + k); g.fillStyle = '#e9dcc6'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const y0 = R() * h, a = 0.05 + R() * 0.12, amp = 2 + R() * 6, fr = 0.01 + R() * 0.03, ph = R() * 9;
        g.strokeStyle = `rgba(120,80,40,${a})`; g.lineWidth = 0.6 + R() * 2.2; g.beginPath();
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * fr + ph) * amp);
        g.stroke();
      }
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,60,30,${R() * 0.08})`; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1); }
    }, { repeat: true }),

    // speckled terrazzo-ish noise used for plastics / powder coat (subtle)
    speckle: () => make('speckle', 128, 128, (g, w, h) => {
      const R = rng(5); g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { const v = 200 + R() * 55 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(R() * w, R() * h, 1, 1); }
    }, { repeat: true }),

    whiteboard(text, extra = []) {
      const key = 'wb|' + text + '|' + extra.join('|');
      return make(key, 1024, 512, (g, w, h) => {
        const R = rng(hashStr(key));
        const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#fbfbf8'); gr.addColorStop(1, '#eceeee');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        // ghosting from old lessons
        g.globalAlpha = 0.07; g.fillStyle = '#5a6a7a';
        for (let i = 0; i < 9; i++) { g.font = `${30 + R() * 30 | 0}px ${HAND}`; g.fillText(['x²', 'Ch. 4', 'due Fri', '∫', 'HW', 'quiz', 'p. 112'][i % 7], R() * w, 60 + R() * (h - 80)); }
        g.globalAlpha = 0.05; for (let i = 0; i < 6; i++) { g.fillRect(R() * w, R() * h, 120 + R() * 200, 20 + R() * 30); }
        g.globalAlpha = 1;
        const lines = String(text).split('\n');
        const cols = ['#1d3fa5', '#151515', '#151515', '#b3141b', '#151515', '#0f7a35'];
        let y = 70; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        lines.forEach((ln, i) => {
          const s = i === 0 ? 62 : 46; g.font = `bold ${s}px ${HAND}`;
          const ss = fit(g, ln, w - 90, s, HAND, 'bold'); g.fillStyle = cols[i % cols.length];
          g.save(); g.translate(48 + R() * 10, y); g.rotate((R() - 0.5) * 0.025); g.fillText(ln, 0, 0); g.restore();
          if (i === 0) { g.strokeStyle = '#b3141b'; g.lineWidth = 4; g.beginPath(); g.moveTo(48, y + 12); g.lineTo(48 + Math.min(g.measureText(ln).width, w - 100), y + 16); g.stroke(); }
          y += ss * 1.3 + (i === 0 ? 8 : 0);
        });
        extra.forEach((d, i) => { // doodles added by players
          g.fillStyle = ['#b3141b', '#1d3fa5', '#0f7a35'][i % 3]; g.font = `bold ${40}px ${HAND}`;
          g.save(); g.translate(w * 0.5 + (R() - 0.5) * 120, h - 60 - i * 58); g.rotate((R() - 0.5) * 0.15);
          g.textAlign = 'center'; fit(g, d, w * 0.6, 44, HAND, 'bold'); g.fillText(d, 0, 0); g.restore();
        });
        // tray shadow
        const sh = g.createLinearGradient(0, h - 24, 0, h); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.08)');
        g.fillStyle = sh; g.fillRect(0, h - 24, w, 24);
      });
    },

    poster({ text = '', sub = '', style = 'motivational', color = '#1b4f8f', seed = 0, landscape = false } = {}) {
      const W = landscape ? 768 : 512, H = landscape ? 512 : 768;
      const key = `poster|${style}|${text}|${sub}|${color}|${seed}|${landscape}`;
      return make(key, W, H, (g, w, h) => {
        const R = rng(hashStr(key));
        if (style === 'periodic') {
          g.fillStyle = '#f7f5ee'; g.fillRect(0, 0, w, h);
          textC(g, text || 'Periodic Table of the Elements', w / 2, h * 0.07, w * 0.9, 34, SANS, 'bold', '#222');
          const grp = ['#f2a65a', '#f6d55c', '#9ed36a', '#5bc0be', '#7a9cd6', '#c38bd6', '#ef6f6c', '#bbb'];
          const cw = w / 19.5, ch = cw * 1.15, x0 = cw * 0.75, y0 = h * 0.15;
          const rows = [[0, 17], [0, 1, 12, 13, 14, 15, 16, 17], [0, 1, 12, 13, 14, 15, 16, 17], [...Array(18).keys()], [...Array(18).keys()], [...Array(18).keys()], [...Array(18).keys()]];
          const SYM = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ');
          let z = 0;
          rows.forEach((r, ri) => r.forEach(c => {
            const gi = c < 2 ? c : c >= 12 ? 2 + Math.min(5, c - 12) : 7, num = z < 72 ? (z < 57 ? z + 1 : z + 15) : z < 75 ? z + 15 : z + 29;
            g.fillStyle = grp[gi]; g.fillRect(x0 + c * cw, y0 + ri * ch, cw - 2, ch - 2);
            g.fillStyle = '#222'; g.font = `${cw * 0.28 | 0}px ${SANS}`; g.textAlign = 'left'; g.fillText(String(num), x0 + c * cw + 2, y0 + ri * ch + cw * 0.3);
            g.font = `bold ${cw * 0.45 | 0}px ${SANS}`; g.textAlign = 'center'; g.fillText(SYM[z++] || '', x0 + c * cw + cw / 2, y0 + ri * ch + ch * 0.72);
          }));
          for (let ri = 0; ri < 2; ri++) for (let c = 0; c < 15; c++) { g.fillStyle = ri ? '#e8a0c8' : '#f0b8d8'; g.fillRect(x0 + (c + 2.5) * cw, y0 + (7.4 + ri) * ch, cw - 2, ch - 2); }
          return;
        }
        if (style === 'map') {
          g.fillStyle = '#9cc7e6'; g.fillRect(0, 0, w, h);
          g.fillStyle = '#d9cf9c'; g.strokeStyle = '#8a7d4c'; g.lineWidth = 2;
          const blobs = [[0.22, 0.35, 0.16, 0.2], [0.28, 0.68, 0.08, 0.17], [0.5, 0.33, 0.07, 0.1], [0.53, 0.6, 0.09, 0.17], [0.7, 0.35, 0.2, 0.17], [0.82, 0.72, 0.08, 0.07]];
          for (const [x, y, rx, ry] of blobs) { g.beginPath(); for (let a = 0; a < 6.3; a += 0.3) { const k = 0.8 + R() * 0.35; g.lineTo(w * (x + Math.cos(a) * rx * k), h * (y + Math.sin(a) * ry * k)); } g.closePath(); g.fill(); g.stroke(); }
          g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
          for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo(w * i / 12, 0); g.lineTo(w * i / 12, h); g.stroke(); g.beginPath(); g.moveTo(0, h * i / 12); g.lineTo(w, h * i / 12); g.stroke(); }
          g.fillStyle = '#fff'; g.fillRect(0, h - 56, w, 56); textC(g, text || 'THE WORLD', w / 2, h - 28, w * 0.9, 34, SERIF, 'bold', '#223');
          return;
        }
        if (style === 'safety') {
          g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
          g.fillStyle = color === '#1b4f8f' ? '#0b6b3a' : color; g.fillRect(0, 0, w, h * 0.22);
          textC(g, text || 'EMERGENCY EXIT ROUTE', w / 2, h * 0.11, w * 0.88, 52, SANS, 'bold', '#fff');
          g.strokeStyle = '#333'; g.lineWidth = 3; g.strokeRect(w * 0.1, h * 0.28, w * 0.8, h * 0.45);
          g.strokeStyle = '#c11'; g.lineWidth = 8; g.beginPath(); g.moveTo(w * 0.5, h * 0.5); g.lineTo(w * 0.5, h * 0.66); g.lineTo(w * 0.2, h * 0.66); g.lineTo(w * 0.2, h * 0.73); g.stroke();
          g.fillStyle = '#c11'; g.beginPath(); g.arc(w * 0.5, h * 0.5, 12, 0, 7); g.fill();
          g.fillStyle = '#333'; g.font = `20px ${SANS}`; g.textAlign = 'center'; g.fillText('YOU ARE HERE', w * 0.5, h * 0.47);
          const ls = wrapLines(g, sub || 'In case of fire, do not use elevators. Walk to the nearest exit and gather at the assembly area.', w * 0.8);
          ls.forEach((l, i) => { g.fillStyle = '#222'; g.font = `22px ${SANS}`; g.fillText(l, w / 2, h * 0.8 + i * 28); });
          return;
        }
        // motivational / event: gradient background, shapes, headline
        const c2 = color;
        const gr = g.createLinearGradient(0, 0, w * 0.3, h); gr.addColorStop(0, c2); gr.addColorStop(1, '#0d1b2a');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        if (style === 'event') {
          g.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 14; i++) { g.save(); g.translate(R() * w, R() * h); g.rotate(R() * 6); g.fillRect(-60, -6, 120 + R() * 120, 12); g.restore(); }
          g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(w * 0.5, h * 0.36, w * 0.24, 0, 7); g.fill();
        } else {
          g.fillStyle = 'rgba(255,255,255,0.10)'; // mountains + sun
          g.beginPath(); g.arc(w * 0.68, h * 0.3, w * 0.13, 0, 7); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(0, h * 0.62);
          for (let x = 0; x <= w; x += w / 8) g.lineTo(x, h * (0.42 + R() * 0.16)); g.lineTo(w, h * 0.62); g.lineTo(w, h * 0.66); g.lineTo(0, h * 0.66); g.fill();
        }
        g.fillStyle = '#0d1b2a'; g.fillRect(0, h * 0.66, w, h * 0.34);
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28);
        const head = (text || 'BELIEVE').toUpperCase();
        const hl = head.split('\n');
        hl.forEach((l, i) => textC(g, l, w / 2, h * (0.75 + i * 0.08) - (hl.length - 1) * h * 0.03, w * 0.84, landscape ? 70 : 76, SERIF, 'bold', '#fff'));
        if (sub) { g.font = `italic ${landscape ? 24 : 26}px ${SERIF}`; g.fillStyle = '#cfd8e3'; g.textAlign = 'center'; const ls = wrapLines(g, sub, w * 0.8); ls.slice(0, 3).forEach((l, i) => g.fillText(l, w / 2, h * 0.88 + i * 30)); }
      });
    },

    clockFace: () => make('clockface', 256, 256, (g, w) => {
      const c = w / 2; g.fillStyle = '#fbfbf6'; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
      g.strokeStyle = '#111';
      for (let i = 0; i < 60; i++) { const a = i * Math.PI / 30, r1 = i % 5 ? c * 0.88 : c * 0.8; g.lineWidth = i % 5 ? 2 : 6; g.beginPath(); g.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); g.lineTo(c + Math.sin(a) * c * 0.94, c - Math.cos(a) * c * 0.94); g.stroke(); }
      g.fillStyle = '#111'; g.font = `bold 30px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 1; i <= 12; i++) { const a = i * Math.PI / 6; g.fillText(String(i), c + Math.sin(a) * c * 0.66, c - Math.cos(a) * c * 0.66 + 2); }
      g.fillStyle = '#b01818'; g.font = `bold 11px ${SANS}`; g.fillText('QUARTZ', c, c + c * 0.36);
    }),

    exit: (color = 'red', arrow = 'none', lit = false) => make(`exit|${color}|${arrow}|${lit}`, 256, 160, (g, w, h) => {
      const col = color === 'green' ? '#18d36a' : '#ff2a1a';
      g.fillStyle = lit ? '#000' : '#f4f4f0'; g.fillRect(0, 0, w, h);
      if (!lit) { g.strokeStyle = '#ccc'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); }
      g.fillStyle = lit ? '#fff' : col;
      g.font = `bold 92px ${COND}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('EXIT', w / 2, h / 2 + 6);
      const chev = (x, dir) => { g.beginPath(); g.moveTo(x, h / 2 - 22); g.lineTo(x + dir * 22, h / 2); g.lineTo(x, h / 2 + 22); g.lineTo(x + dir * 10, h / 2); g.closePath(); g.fill(); };
      if (arrow === 'left' || arrow === 'both') chev(28, -1);
      if (arrow === 'right' || arrow === 'both') chev(w - 28, 1);
    }),

    // products behind vending glass, rows of bags/bars with price tags
    vending: (seed = 0, price = '1.50') => make(`vend|${seed}|${price}`, 512, 1024, (g, w, h) => {
      const R = rng(seed * 97 + 13);
      g.fillStyle = '#1a1c20'; g.fillRect(0, 0, w, h);
      const lg = g.createLinearGradient(0, 0, w, 0); lg.addColorStop(0, 'rgba(255,255,255,0.05)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.16)'); lg.addColorStop(1, 'rgba(255,255,255,0.05)');
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
      const names = ['CRUNCHOS', 'Tater Bits', 'CHOCO BOMB', 'Peanut Pal', 'Gummi Wurms', 'Pretzel Twist', 'Granola Gold', 'CHEEZ PUFFS', 'Mint Blast', 'Cookie Stax', 'Nacho Nite', 'SOUR ZAPS', 'Trail Mix', 'Fruit Snax', 'Big Chew', 'Kettle Krisp'];
      const pal = [['#e63946', '#ffd166'], ['#f4a261', '#264653'], ['#6a2c70', '#f9ed69'], ['#2a9d8f', '#fff'], ['#ff6b6b', '#4ecdc4'], ['#1d3557', '#f1faee'], ['#e9c46a', '#5a3e1b'], ['#ff8c00', '#ffffff'], ['#00a6a6', '#effffa'], ['#7b2cbf', '#ffb703'], ['#d62828', '#fcbf49'], ['#38b000', '#000']];
      const rows = 6, rh = h / rows, letters = 'ABCDEF';
      for (let r = 0; r < rows; r++) {
        const cols = r < 2 ? 4 : r < 5 ? 5 : 7, cw = w / cols, y0 = r * rh;
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, y0 + rh - 34, w, 34);
        for (let c = 0; c < cols; c++) {
          const [a, b] = pal[(R() * pal.length) | 0], nm = names[(R() * names.length) | 0], x0 = c * cw;
          const pw = cw * (r < 2 ? 0.8 : 0.72), ph = rh * (r < 2 ? 0.72 : r < 5 ? 0.5 : 0.36), px = x0 + (cw - pw) / 2, py = y0 + rh - 38 - ph;
          for (let k = 2; k >= 0; k--) { // stacked depth
            g.fillStyle = k ? 'rgba(0,0,0,0.35)' : a; rrect(g, px + k * 4, py - k * 5, pw, ph, r < 2 ? 14 : 6); g.fill();
          }
          const gr = g.createLinearGradient(px, 0, px + pw, 0); gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.4, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
          g.fillStyle = gr; rrect(g, px, py, pw, ph, r < 2 ? 14 : 6); g.fill();
          g.save(); g.translate(px + pw / 2, py + ph / 2); if (r >= 2) g.rotate(-0.08);
          g.fillStyle = b; g.beginPath(); g.ellipse(0, 0, pw * 0.42, ph * 0.22, 0, 0, 7); g.fill();
          textC(g, nm, 0, 1, pw * 0.8, r < 2 ? 26 : 18, SANS, 'bold', a); g.restore();
          g.strokeStyle = 'rgba(200,200,210,0.55)'; g.lineWidth = 2; // spiral coil
          for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x0 + cw / 2, y0 + rh - 30 - k * 2, cw * 0.4, 6, 0, Math.PI, 0); g.stroke(); }
          g.fillStyle = '#f2f2f2'; g.fillRect(x0 + cw / 2 - 26, y0 + rh - 26, 52, 20);
          g.fillStyle = '#111'; g.font = `bold 14px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(`${letters[r]}${c + 1}  ${price}`, x0 + cw / 2, y0 + rh - 16);
        }
      }
    }),
    vendPanel: (price = '1.50') => make('vendpanel|' + price, 128, 512, (g, w, h) => {
      g.fillStyle = '#2b2e33'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#080808'; rrect(g, 12, 18, w - 24, 46, 6); g.fill();
      g.fillStyle = '#ff3b2f'; g.font = `bold 28px "Courier New", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$' + price, w / 2, 42);
      g.fillStyle = '#ddd'; g.font = `bold 12px ${SANS}`; g.fillText('MAKE SELECTION', w / 2, 80);
      const keys = ['A', 'B', 'C', '1', '2', '3', 'D', 'E', 'F', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'OK'];
      keys.forEach((k, i) => { const x = 20 + (i % 3) * 32, y = 96 + Math.floor(i / 3) * 32; g.fillStyle = '#c9ccd1'; rrect(g, x, y, 26, 26, 4); g.fill(); g.fillStyle = '#111'; g.font = `bold ${k.length > 1 ? 9 : 14}px ${SANS}`; g.fillText(k, x + 13, y + 14); });
      g.fillStyle = '#111'; rrect(g, 22, 306, 84, 40, 4); g.fill(); g.fillStyle = '#3a8f3a'; g.fillRect(30, 324, 68, 5); // bill slot
      g.fillStyle = '#ddd'; g.font = `10px ${SANS}`; g.fillText('$1  $5  BILLS', w / 2, 356);
      g.fillStyle = '#111'; rrect(g, 54, 372, 20, 34, 3); g.fill(); g.fillStyle = '#888'; g.fillRect(62, 378, 4, 22); // coin slot
      g.fillStyle = '#ddd'; g.fillText('COINS', w / 2, 418);
      g.fillStyle = '#0c0c0c'; rrect(g, 34, 440, 60, 40, 6); g.fill(); g.fillStyle = '#ddd'; g.fillText('COIN RETURN', w / 2, 494);
    }),

    // locker door: louvers top and bottom, recessed handle (grayscale, tinted by paint colour)
    lockerDoor: () => make('lockerdoor', 64, 256, (g, w, h) => {
      g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, w, h);
      const louvers = y0 => { for (let i = 0; i < 6; i++) { const y = y0 + i * 7; g.fillStyle = '#2a2a2a'; g.fillRect(14, y, w - 28, 3); g.fillStyle = '#ffffff'; g.fillRect(14, y + 3, w - 28, 1.5); } };
      louvers(12); louvers(h - 56);
      g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(0, 0, 2, h); g.fillRect(w - 2, 0, 2, h);
      g.fillStyle = '#9a9a9a'; g.fillRect(w - 20, h * 0.47, 10, 26); // handle recess
      g.fillStyle = '#4a4a4a'; g.fillRect(w - 18, h * 0.47 + 3, 6, 20);
    }),
    // digits 0-9 in one strip, each cell 32x48, black on brushed plate
    digits: () => make('digits', 320, 48, (g, w, h) => {
      g.fillStyle = '#d9dbdd'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#151515'; g.font = `bold 40px ${COND}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i < 10; i++) g.fillText(String(i), i * 32 + 16, h / 2 + 2);
    }),

    flag: () => make('flag_us', 512, 270, (g, w, h) => {
      for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#b22234'; g.fillRect(0, i * h / 13, w, h / 13 + 1); }
      const cw = w * 0.4, ch = h * 7 / 13; g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#fff';
      for (let r = 0; r < 9; r++) { const n = r % 2 ? 5 : 6; for (let c = 0; c < n; c++) star(g, cw * ((c * 2 + (r % 2 ? 2 : 1)) / 12), ch * ((r + 1) / 10), ch * 0.034); }
    }),

    // ADA restroom plaque (pictogram, words, braille)
    restroom: (who = 'unisex') => make('rr|' + who, 256, 320, (g, w, h) => {
      g.fillStyle = '#1d4e9a'; rrect(g, 0, 0, w, h, 18); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 4; rrect(g, 8, 8, w - 16, h - 16, 12); g.stroke();
      g.fillStyle = '#fff';
      const man = (cx, cy, s) => { g.beginPath(); g.arc(cx, cy - 54 * s, 13 * s, 0, 7); g.fill(); rrect(g, cx - 20 * s, cy - 36 * s, 40 * s, 52 * s, 8 * s); g.fill(); g.fillRect(cx - 18 * s, cy + 10 * s, 15 * s, 54 * s); g.fillRect(cx + 3 * s, cy + 10 * s, 15 * s, 54 * s); };
      const woman = (cx, cy, s) => { g.beginPath(); g.arc(cx, cy - 54 * s, 13 * s, 0, 7); g.fill(); g.beginPath(); g.moveTo(cx - 12 * s, cy - 38 * s); g.lineTo(cx + 12 * s, cy - 38 * s); g.lineTo(cx + 28 * s, cy + 24 * s); g.lineTo(cx - 28 * s, cy + 24 * s); g.fill(); g.fillRect(cx - 13 * s, cy + 22 * s, 10 * s, 42 * s); g.fillRect(cx + 3 * s, cy + 22 * s, 10 * s, 42 * s); };
      const wheel = (cx, cy, s) => {
        g.beginPath(); g.arc(cx - 2 * s, cy - 44 * s, 9 * s, 0, 7); g.fill();
        g.lineWidth = 9 * s; g.strokeStyle = '#fff'; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx - 6 * s, cy - 30 * s); g.lineTo(cx - 8 * s, cy); g.lineTo(cx + 18 * s, cy); g.lineTo(cx + 28 * s, cy + 24 * s); g.stroke();
        g.beginPath(); g.moveTo(cx - 6 * s, cy - 18 * s); g.lineTo(cx + 14 * s, cy - 18 * s); g.stroke();
        g.lineWidth = 6 * s; g.beginPath(); g.arc(cx - 6 * s, cy + 12 * s, 26 * s, -0.9, 3.9); g.stroke();
      };
      const label = { boys: 'BOYS', girls: 'GIRLS', unisex: 'RESTROOM', staff: 'STAFF', men: 'MEN', women: 'WOMEN' }[who] || String(who).toUpperCase();
      if (who === 'boys' || who === 'men') { man(w / 2 - 34, 128, 1); wheel(w / 2 + 44, 140, 0.8); }
      else if (who === 'girls' || who === 'women') { woman(w / 2 - 34, 128, 1); wheel(w / 2 + 44, 140, 0.8); }
      else { man(w / 2 - 66, 130, 0.8); woman(w / 2, 130, 0.8); wheel(w / 2 + 66, 140, 0.7); }
      textC(g, label, w / 2, 236, w - 40, 44, SANS, 'bold', '#fff');
      braille(g, w / 2 - label.length * 9.5, 268, label.length, 6);
    }),
    // California Title 24 door symbol: triangle (men), circle (women), circle + triangle (unisex)
    doorSymbol: (who = 'unisex') => make('rrdoor|' + who, 256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const blue = '#1d4e9a';
      const tri = (col) => { g.fillStyle = col; g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w - 8, h - 30); g.lineTo(8, h - 30); g.closePath(); g.fill(); };
      if (who === 'boys' || who === 'men') tri(blue);
      else if (who === 'girls' || who === 'women') { g.fillStyle = '#b0204f'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 4, 0, 7); g.fill(); }
      else { g.fillStyle = '#1b6e4a'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 4, 0, 7); g.fill(); g.save(); g.translate(w * 0.14, h * 0.16); g.scale(0.72, 0.72); tri('#f2f2f2'); g.restore(); }
    }),

    fireAlarm: () => make('firealarm', 128, 160, (g, w, h) => {
      g.fillStyle = '#c8161d'; g.fillRect(0, 0, w, h);
      textC(g, 'FIRE', w / 2, 26, w - 16, 34, SANS, 'bold', '#fff');
      g.fillStyle = '#fff'; g.font = `bold 13px ${SANS}`; g.textAlign = 'center'; g.fillText('PULL DOWN', w / 2, h - 36);
      g.beginPath(); g.moveTo(w / 2 - 10, h - 26); g.lineTo(w / 2 + 10, h - 26); g.lineTo(w / 2, h - 12); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(w / 2 - 36, 52, 72, 40);
    }),
    horn: () => make('horn', 128, 128, (g, w, h) => {
      g.fillStyle = '#c8161d'; g.fillRect(0, 0, w, h);
      for (let y = 12; y < 64; y += 9) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(18, y, w - 36, 4); }
      textC(g, 'FIRE', w / 2, 92, w - 20, 30, SANS, 'bold', '#fff');
    }),
    // perforated grille (speakers, dryers)
    grille: (bg = '#eeeeea') => make('grille|' + bg, 128, 128, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      for (let y = 6; y < h; y += 8) for (let x = 6 + (y / 8 % 2) * 4; x < w; x += 8) { if (Math.hypot(x - w / 2, y - h / 2) < w * 0.47) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); } }
    }),
    // a dark screen with a few lines (monitors, projector slides)
    screen: (kind = 'desktop') => make('screen|' + kind, 256, 160, (g, w, h) => {
      if (kind === 'slide') {
        g.fillStyle = '#f7f9fc'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b4f8f'; g.fillRect(0, 0, w, 34);
        textC(g, 'Unit 7: Cells & Energy', w / 2, 18, w - 20, 18, SANS, 'bold', '#fff');
        g.fillStyle = '#333'; g.font = `12px ${SANS}`; g.textAlign = 'left';
        ['• Mitochondria = powerhouse', '• ATP stores energy', '• Photosynthesis vs respiration', '• Lab report due Friday'].forEach((l, i) => g.fillText(l, 16, 56 + i * 20));
        g.fillStyle = '#7fb069'; g.beginPath(); g.ellipse(w - 46, h - 44, 30, 20, 0.3, 0, 7); g.fill();
        return;
      }
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#0c3b6e'); gr.addColorStop(1, '#2b7bb9'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 5; i++) { g.fillRect(10, 10 + i * 24, 16, 16); }
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, h - 12, w, 12);
    }),

    newspaper: (paper, headline) => make('news|' + paper + '|' + headline, 256, 320, (g, w, h) => {
      g.fillStyle = '#f1efe6'; g.fillRect(0, 0, w, h);
      textC(g, paper, w / 2, 26, w - 20, 30, SERIF, 'bold', '#111');
      g.fillStyle = '#111'; g.fillRect(10, 46, w - 20, 2); g.fillRect(10, 62, w - 20, 1);
      g.font = `9px ${SANS}`; g.textAlign = 'left'; g.fillText('Your hometown paper since forever', 12, 56);
      g.font = `bold 21px ${SERIF}`; const ls = wrapLines(g, headline, w - 26);
      ls.slice(0, 4).forEach((l, i) => g.fillText(l, 13, 88 + i * 23));
      const y = 88 + Math.min(4, ls.length) * 23;
      g.fillStyle = '#9a9a94'; g.fillRect(13, y, w * 0.55, 90);
      for (let i = 0; i < 16; i++) { g.fillStyle = '#7a7a76'; g.fillRect(w * 0.6, y + i * 7, w * 0.35 * (0.6 + 0.4 * ((i * 37) % 10) / 10), 3); }
      for (let i = 0; i < 8; i++) { g.fillRect(13, y + 98 + i * 7, (w - 30) * (0.5 + 0.5 * ((i * 53) % 10) / 10), 3); }
    }),

    payphone: () => make('payphone', 128, 256, (g, w, h) => {
      g.fillStyle = '#b8bcc0'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1b1b1b'; rrect(g, 10, 10, w - 20, 54, 4); g.fill(); g.fillStyle = '#e8e8e8'; g.font = `bold 10px ${SANS}`; g.textAlign = 'center';
      ['LOCAL CALLS 50¢', 'DIAL 911 FREE', 'NO COINS NEEDED'].forEach((l, i) => g.fillText(l, w / 2, 26 + i * 15));
      const k = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
      k.forEach((c, i) => { const x = 22 + (i % 3) * 30, y = 80 + Math.floor(i / 3) * 30; g.fillStyle = '#e9eaec'; rrect(g, x, y, 24, 24, 4); g.fill(); g.strokeStyle = '#666'; g.stroke(); g.fillStyle = '#111'; g.font = `bold 13px ${SANS}`; g.fillText(c, x + 12, y + 17); });
      g.fillStyle = '#222'; rrect(g, 44, 206, 40, 14, 3); g.fill(); g.fillStyle = '#777'; g.fillRect(50, 211, 28, 3);
      g.fillStyle = '#333'; g.font = `9px ${SANS}`; g.fillText('INSERT COINS', w / 2, 234);
    }),

    label: (text, bg = '#1d4e9a', fg = '#fff', w = 256, h = 64, family = SANS) => make(`label|${text}|${bg}|${fg}|${w}|${h}`, w, h, (g, W, H) => {
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      textC(g, text, W / 2, H / 2 + 2, W * 0.9, H * 0.7, family, 'bold', fg);
    }),

    swirl: () => make('swirl', 128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      gr.addColorStop(0, '#2c4a5c'); gr.addColorStop(0.5, '#7fa8bd'); gr.addColorStop(1, '#d9eef7'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2;
      for (let k = 0; k < 4; k++) { g.beginPath(); for (let a = 0; a < 9; a += 0.1) { const r = a * 6; g.lineTo(w / 2 + Math.cos(a + k * 1.57) * r, h / 2 + Math.sin(a + k * 1.57) * r); } g.stroke(); }
    }),
    waterStream: () => make('waterstream', 32, 128, (g, w, h) => {
      g.fillStyle = '#cfe8f5'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.6})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 6 + Math.random() * 20); }
    }, { repeat: true }),

    mirror: () => make('mirror', 128, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c9d4d8'); gr.addColorStop(0.45, '#8e9da3'); gr.addColorStop(0.55, '#a9b8bd'); gr.addColorStop(1, '#6f7e84');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(w * 0.2, 0); g.lineTo(w * 0.45, 0); g.lineTo(w * 0.05, h * 0.6); g.lineTo(0, h * 0.6); g.lineTo(0, h * 0.35); g.fill();
      g.beginPath(); g.moveTo(w * 0.7, 0); g.lineTo(w * 0.78, 0); g.lineTo(w * 0.3, h); g.lineTo(w * 0.22, h); g.fill();
    }),

    // generic small text panel (LCD counters etc.)
    lcd: (text, fg = '#5cff7a', bg = '#071a0c') => make(`lcd|${text}|${fg}|${bg}`, 128, 48, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); textC(g, text, w / 2, h / 2 + 1, w - 10, 26, '"Courier New", monospace', 'bold', fg);
    }),
  };
  return T;
}
