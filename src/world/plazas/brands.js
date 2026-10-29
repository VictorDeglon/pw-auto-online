// The plaza's shops, as parodies: each chain is recognisable at a glance (its colours, the shape of its mark, a typeface
// in the same family) but its name is nudged a letter or two, so nothing here is a real company's trademark. Signs are
// drawn at the proportions of the sign they go on, so the lettering is never stretched.
//   brandLogo(THREE, key, aspect = 4.4) -> CanvasTexture (redrawn once the web fonts arrive)
//   parodyName(name) -> the parody of a real store name (OpenStreetMap POIs), or the name unchanged
//   BRAND_FONTS: the Google Fonts families these use (index.html loads them)
const SANS = '"Archivo Black", "Arial Black", sans-serif', KANIT = '"Kanit", "Arial Black", sans-serif', POP = '"Poppins", Arial, sans-serif';
const SERIF = '"Playfair Display", Georgia, serif', GARA = '"Cormorant Garamond", Georgia, serif', RYE = '"Rye", Georgia, serif', NUNITO = '"Nunito Sans", Arial, sans-serif';
const LILITA = '"Lilita One", "Arial Black", sans-serif', MONT = '"Montserrat", Arial, sans-serif', ARVO = '"Arvo", Georgia, serif', JOSE = '"Josefin Sans", Arial, sans-serif';
const PACI = '"Pacifico", cursive', LOB = '"Lobster", cursive', LORA = '"Lora", Georgia, serif', OSW = '"Oswald", "Arial Narrow", sans-serif';
export const BRAND_FONTS = ['Archivo Black', 'Kanit:ital,wght@1,800', 'Poppins:wght@600;700', 'Playfair Display:ital,wght@0,800;1,800', 'Cormorant Garamond:wght@700', 'Nunito Sans:wght@800;900',
  'Lilita One', 'Montserrat:wght@800', 'Arvo:wght@700', 'Josefin Sans:wght@700', 'Pacifico', 'Lobster', 'Lora:ital,wght@1,700', 'Oswald:wght@600'];
const LOAD = ['400 40px "Archivo Black"', 'italic 800 40px "Kanit"', '700 40px "Poppins"', '800 40px "Playfair Display"', 'italic 800 40px "Playfair Display"', '700 40px "Cormorant Garamond"', '900 40px "Nunito Sans"',
  '400 40px "Lilita One"', '800 40px "Montserrat"', '700 40px "Arvo"', '700 40px "Josefin Sans"', '400 40px "Pacifico"', '400 40px "Lobster"', 'italic 700 40px "Lora"', '600 40px "Oswald"', '400 40px "Rye"'];

// text helpers: the largest size of `font` (with {s} for the px size) that fits maxW and maxH
function fitFont(g, text, font, maxW, maxH, track = 0) {
  let s = maxH; g.font = font.replace('{s}', s); if ('letterSpacing' in g) g.letterSpacing = track + 'px';
  while (s > 10 && g.measureText(text).width > maxW) { s -= 2; g.font = font.replace('{s}', s); }
  return s;
}
function text(g, t, x, y, font, maxW, maxH, color, o = {}) {
  g.save(); g.textAlign = o.align || 'center'; g.textBaseline = 'middle'; const s = fitFont(g, t, font, maxW, maxH, o.track || 0);
  if (o.skew) { g.translate(x, y); g.transform(1, 0, -o.skew, 1, 0, 0); x = 0; y = 0; }
  if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.strokeW || s * 0.12; g.strokeStyle = o.stroke; g.strokeText(t, x, y); }
  g.fillStyle = color; g.fillText(t, x, y); g.restore(); return s;
}
function bg(g, W, H, c) { g.fillStyle = c; g.fillRect(0, 0, W, H); }
function star(g, x, y, r, n = 5, k = 0.45) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * k : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }

const BRANDS = {
  target: { name: 'Tarjet', draw(g, W, H) { bg(g, W, H, '#f6f3ee'); const r = H * 0.4, cx = H * 0.55;
    for (const [rr, c] of [[1, '#cc0d12'], [0.75, '#f6f3ee'], [0.5, '#cc0d12'], [0.25, '#f6f3ee']]) { g.fillStyle = c; g.beginPath(); g.arc(cx, H / 2, r * rr, 0, Math.PI * 2); g.fill(); }
    text(g, 'tarjet', cx + r + (W - cx - r) / 2, H * 0.52, `400 {s}px ${SANS}`, W - cx - r - H * 0.3, H * 0.62, '#cc0d12'); } },
  walmart: { name: 'Walmark', draw(g, W, H) { bg(g, W, H, '#0b63c6'); const cx = W - H * 0.62;
    text(g, 'Walmark', (W - H * 1.2) / 2 + H * 0.1, H * 0.52, `900 {s}px ${NUNITO}`, W - H * 1.5, H * 0.6, '#ffffff');
    g.save(); g.translate(cx, H / 2); g.fillStyle = '#ffc61a'; for (let i = 0; i < 5; i++) { g.beginPath(); g.roundRect(-H * 0.055, -H * 0.42, H * 0.11, H * 0.27, H * 0.05); g.fill(); g.rotate(Math.PI * 2 / 5); } g.restore(); } },
  target_mark: { name: 'Tarjet', draw(g, W, H) { bg(g, W, H, '#cc0d12'); const r = Math.min(W, H) * 0.46; for (const [rr, c] of [[1, '#f6f3ee'], [0.75, '#cc0d12'], [0.5, '#f6f3ee'], [0.25, '#cc0d12']]) { g.fillStyle = c; g.beginPath(); g.arc(W / 2, H / 2, r * rr, 0, Math.PI * 2); g.fill(); } } },
  walmart_mark: { name: 'Walmark', draw(g, W, H) { bg(g, W, H, '#0b63c6'); g.save(); g.translate(W / 2, H / 2); g.fillStyle = '#ffc61a'; const s = Math.min(W, H); for (let i = 0; i < 5; i++) { g.beginPath(); g.roundRect(-s * 0.06, -s * 0.44, s * 0.12, s * 0.28, s * 0.05); g.fill(); g.rotate(Math.PI * 2 / 5); } g.restore(); } },
  costco: { name: 'Costko', draw(g, W, H) { bg(g, W, H, '#ffffff');
    text(g, 'COSTKO', W / 2, H * 0.4, `400 {s}px ${SANS}`, W * 0.86, H * 0.52, '#e31837', { skew: 0.18 });
    g.fillStyle = '#005daa'; g.beginPath(); g.moveTo(W * 0.08, H * 0.7); g.quadraticCurveTo(W * 0.5, H * 0.6, W * 0.92, H * 0.66); g.lineTo(W * 0.92, H * 0.7); g.quadraticCurveTo(W * 0.5, H * 0.66, W * 0.08, H * 0.74); g.fill();
    text(g, 'WHOLESALE', W / 2, H * 0.86, `700 {s}px ${POP}`, W * 0.6, H * 0.16, '#005daa', { track: 6 }); } },
  subway: { name: 'Subwai', draw(g, W, H) { bg(g, W, H, '#008938'); g.save(); g.font = `italic 800 ${Math.round(H * 0.62)}px ${KANIT}`; let s = H * 0.62;
    while (s > 20 && g.measureText('SUBWAI').width > W * 0.78) { s -= 2; g.font = `italic 800 ${Math.round(s)}px ${KANIT}`; }
    const w1 = g.measureText('SUB').width, w2 = g.measureText('WAI').width, x0 = (W - w1 - w2) / 2, y = H * 0.54; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = '#ffffff'; g.fillText('SUB', x0, y); g.fillStyle = '#ffc20e'; g.fillText('WAI', x0 + w1, y);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x0 - s * 0.5, y + s * 0.05); g.lineTo(x0 - s * 0.08, y - s * 0.12); g.lineTo(x0 - s * 0.08, y + s * 0.22); g.fill(); // the arrows
    g.fillStyle = '#ffc20e'; g.beginPath(); g.moveTo(x0 + w1 + w2 + s * 0.5, y - s * 0.05); g.lineTo(x0 + w1 + w2 + s * 0.08, y + s * 0.12); g.lineTo(x0 + w1 + w2 + s * 0.08, y - s * 0.22); g.fill(); g.restore(); } },
  great_clips: { name: 'Great Snips', draw(g, W, H) { bg(g, W, H, '#0e57a6'); text(g, 'Great Snips', W * 0.56, H * 0.46, `700 {s}px ${POP}`, W * 0.7, H * 0.5, '#ffffff');
    text(g, 'IT\'S GONNA BE GREAT', W * 0.56, H * 0.8, `600 {s}px ${POP}`, W * 0.55, H * 0.13, '#9fd0ff', { track: 3 });
    g.strokeStyle = '#ffffff'; g.lineWidth = H * 0.05; const x = W * 0.12, y = H / 2, r = H * 0.12; for (const d of [-1, 1]) { g.beginPath(); g.arc(x - r * 1.2, y + d * r * 1.1, r * 0.7, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(x - r * 0.6, y + d * r * 0.7); g.lineTo(x + r * 2.6, y - d * r * 0.9); g.stroke(); } } },
  starbucks: { name: 'Starbrew Coffee', draw(g, W, H) { bg(g, W, H, '#00653b'); const R = Math.min(W, H) * 0.44, cx = W / 2, cy = H / 2;
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); g.fillStyle = '#00653b'; g.beginPath(); g.arc(cx, cy, R * 0.94, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, R * 0.6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#00653b'; star(g, cx, cy - R * 0.02, R * 0.42, 5, 0.42);
    g.save(); g.fillStyle = '#ffffff'; g.font = `700 ${Math.round(R * 0.2)}px ${JOSE}`; g.textAlign = 'center'; g.textBaseline = 'middle'; const t = '★ STARBREW ★ COFFEE ';
    for (let i = 0; i < t.length; i++) { const a = -Math.PI * 0.95 + i / t.length * Math.PI * 2; g.save(); g.translate(cx + Math.cos(a) * R * 0.77, cy + Math.sin(a) * R * 0.77); g.rotate(a + Math.PI / 2); g.fillText(t[i], 0, 0); g.restore(); } g.restore(); } },
  habit_burger: { name: 'The Havit Burger Grill', draw(g, W, H) { bg(g, W, H, '#231f1c'); g.fillStyle = '#b5121b'; g.beginPath(); g.roundRect(W * 0.03, H * 0.08, W * 0.94, H * 0.84, H * 0.12); g.fill();
    text(g, 'the', W * 0.2, H * 0.36, `400 {s}px ${LOB}`, W * 0.14, H * 0.3, '#ffffff'); text(g, 'Havit', W * 0.55, H * 0.42, `400 {s}px ${SANS}`, W * 0.5, H * 0.5, '#ffffff');
    text(g, 'BURGER GRILL', W / 2, H * 0.78, `700 {s}px ${POP}`, W * 0.6, H * 0.17, '#fde68a', { track: 8 }); } },
  board_and_brew: { name: 'Bored & Brew', draw(g, W, H) { bg(g, W, H, '#1f4e79'); g.fillStyle = '#f2c14e'; g.beginPath(); g.ellipse(W * 0.12, H / 2, H * 0.11, H * 0.4, 0.5, 0, Math.PI * 2); g.fill();
    text(g, 'Bored & Brew', W * 0.58, H * 0.5, `400 {s}px ${PACI}`, W * 0.72, H * 0.62, '#ffffff'); } },
  round_table_pizza: { name: 'Round Fable Pizza', draw(g, W, H) { bg(g, W, H, '#7a1418'); g.fillStyle = '#d4a63a'; g.beginPath(); const x = W * 0.1, y = H / 2, r = H * 0.34; g.moveTo(x - r, y - r); g.lineTo(x + r, y - r); g.lineTo(x + r, y); g.quadraticCurveTo(x + r, y + r, x, y + r * 1.2); g.quadraticCurveTo(x - r, y + r, x - r, y); g.fill();
    text(g, 'ROUND FABLE', W * 0.58, H * 0.4, `700 {s}px ${GARA}`, W * 0.72, H * 0.44, '#f3e3b5', { track: 4 }); text(g, 'PIZZA', W * 0.58, H * 0.78, `700 {s}px ${GARA}`, W * 0.4, H * 0.24, '#d4a63a', { track: 10 }); } },
  five_guys: { name: 'Five Dudes', draw(g, W, H) { bg(g, W, H, '#ffffff'); const s = H * 0.09; for (let x = 0; x < W; x += s) for (const y of [0, H - s]) { g.fillStyle = ((x / s) | 0) % 2 ? '#d71920' : '#ffffff'; g.fillRect(x, y, s, s); }
    text(g, 'FIVE DUDES', W / 2, H * 0.44, `400 {s}px ${SANS}`, W * 0.84, H * 0.42, '#d71920'); text(g, 'BURGERS and FRIES', W / 2, H * 0.72, `700 {s}px ${POP}`, W * 0.5, H * 0.15, '#d71920', { track: 2 }); } },
  jersey_mikes: { name: 'Jersey Mack\'s Subs', draw(g, W, H) { bg(g, W, H, '#f8f5ee'); text(g, 'Jersey Mack\'s', W * 0.44, H * 0.48, `italic 800 {s}px ${SERIF}`, W * 0.66, H * 0.56, '#c8102e');
    g.fillStyle = '#0a3a7d'; g.beginPath(); g.roundRect(W * 0.8, H * 0.22, W * 0.17, H * 0.56, H * 0.06); g.fill(); text(g, 'SUBS', W * 0.885, H * 0.5, `400 {s}px ${SANS}`, W * 0.14, H * 0.3, '#ffffff'); } },
  wingstop: { name: 'Wingspot', draw(g, W, H) { bg(g, W, H, '#0b0b0b'); const x = W * 0.13, y = H / 2, r = H * 0.3; g.fillStyle = '#00843d'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(x + d * r * 0.2, y); g.quadraticCurveTo(x + d * r * 1.6, y - r * 1.2, x + d * r * 1.9, y - r * 0.2); g.quadraticCurveTo(x + d * r * 1.2, y - r * 0.2, x + d * r * 0.2, y + r * 0.3); g.fill(); }
    text(g, 'WINGSPOT', W * 0.6, H * 0.52, `italic 800 {s}px ${KANIT}`, W * 0.66, H * 0.56, '#ffffff', { stroke: '#00843d' }); } },
  little_caesars: { name: 'Little Cesar\'s', draw(g, W, H) { bg(g, W, H, '#ff6a13'); g.strokeStyle = '#1b1b1b'; g.lineWidth = H * 0.04; const x = W * 0.11, y = H * 0.52, r = H * 0.3;
    for (const d of [-1, 1]) for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + d * (0.35 + k * 0.38); g.beginPath(); g.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, H * 0.035, H * 0.08, a, 0, Math.PI * 2); g.stroke(); }
    text(g, 'Little Cesar\'s', W * 0.58, H * 0.42, `400 {s}px ${LILITA}`, W * 0.7, H * 0.5, '#ffffff', { stroke: '#1b1b1b' }); text(g, 'PIZZA! PIZZA!', W * 0.58, H * 0.8, `400 {s}px ${LILITA}`, W * 0.4, H * 0.18, '#1b1b1b'); } },
  oreilly_auto: { name: 'O\'Riley Auto Parts', draw(g, W, H) { bg(g, W, H, '#00843d'); text(g, 'O\'RILEY', W * 0.36, H * 0.5, `italic 800 {s}px ${KANIT}`, W * 0.5, H * 0.62, '#ffffff');
    g.fillStyle = '#e4002b'; g.fillRect(W * 0.65, H * 0.25, W * 0.32, H * 0.5); text(g, 'AUTO PARTS', W * 0.81, H * 0.5, `italic 800 {s}px ${KANIT}`, W * 0.29, H * 0.3, '#ffffff'); } },
  outback: { name: 'Outbank Steakhouse', draw(g, W, H) { bg(g, W, H, '#3d1a10'); g.fillStyle = '#9c3a1c'; g.beginPath(); g.ellipse(W * 0.1, H * 0.5, H * 0.28, H * 0.2, -0.3, 0, Math.PI * 2); g.fill();
    text(g, 'Outbank', W * 0.56, H * 0.42, `400 {s}px ${RYE}`, W * 0.7, H * 0.5, '#f1e2c4'); text(g, 'STEAKHOUSE', W * 0.56, H * 0.8, `600 {s}px ${OSW}`, W * 0.4, H * 0.18, '#d9a441', { track: 8 }); } },
  ikes_sandwiches: { name: 'Ivy\'s Sandwiches', draw(g, W, H) { bg(g, W, H, '#ffd200'); g.fillStyle = '#111'; g.fillRect(W * 0.04, H * 0.14, W * 0.3, H * 0.72);
    text(g, 'Ivy\'s', W * 0.19, H * 0.5, `400 {s}px ${LILITA}`, W * 0.26, H * 0.56, '#ffd200'); text(g, 'Love & Sandwiches', W * 0.66, H * 0.5, `400 {s}px ${LILITA}`, W * 0.6, H * 0.36, '#111'); } },
  wells_fargo: { name: 'Wells Cargo Bank', draw(g, W, H) { bg(g, W, H, '#c8102e'); g.strokeStyle = '#ffcd41'; g.lineWidth = H * 0.025; g.strokeRect(W * 0.02, H * 0.1, W * 0.96, H * 0.8);
    text(g, 'WELLS CARGO', W / 2, H * 0.52, `800 {s}px ${SERIF}`, W * 0.84, H * 0.56, '#ffcd41', { track: 3 }); } },
  barnes_and_noble: { name: 'Barns & Nobel', draw(g, W, H) { bg(g, W, H, '#14432e'); text(g, 'Barns & Nobel', W / 2, H * 0.42, `700 {s}px ${GARA}`, W * 0.86, H * 0.52, '#f5f0e1');
    text(g, 'BOOKSELLERS', W / 2, H * 0.8, `700 {s}px ${GARA}`, W * 0.4, H * 0.17, '#cbb67c', { track: 10 }); } },
  trader_joes: { name: 'Trader Moe\'s', draw(g, W, H) { bg(g, W, H, '#f7f0e0'); text(g, 'TRADER MOE\'S', W / 2, H * 0.52, `400 {s}px ${RYE}`, W * 0.9, H * 0.56, '#c8102e', { stroke: '#2a1a12', strokeW: 3 }); } },
  ulta_beauty: { name: 'ulti beauty', draw(g, W, H) { bg(g, W, H, '#ffffff'); text(g, 'ulti', W * 0.35, H * 0.48, `800 {s}px ${MONT}`, W * 0.36, H * 0.6, '#f26b21'); text(g, 'beauty', W * 0.68, H * 0.54, `800 {s}px ${MONT}`, W * 0.34, H * 0.4, '#e3007b'); } },
  chipotle: { name: 'Chipolte Mexican Grill', draw(g, W, H) { bg(g, W, H, '#451400'); const x = W * 0.1, y = H / 2, r = H * 0.36; g.fillStyle = '#a81612'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f1e2c4'; g.lineWidth = H * 0.025; g.beginPath(); g.arc(x, y, r * 0.86, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#f1e2c4'; g.beginPath(); g.ellipse(x, y + r * 0.1, r * 0.22, r * 0.5, 0.4, 0, Math.PI * 2); g.fill();
    text(g, 'CHIPOLTE', W * 0.58, H * 0.42, `700 {s}px ${ARVO}`, W * 0.7, H * 0.48, '#f1e2c4', { track: 4 }); text(g, 'MEXICAN GRILL', W * 0.58, H * 0.78, `700 {s}px ${ARVO}`, W * 0.46, H * 0.16, '#d6a64b', { track: 6 }); } },
  cava: { name: 'CAVO', draw(g, W, H) { bg(g, W, H, '#1e3b2f'); text(g, 'CAVO', W / 2, H * 0.55, `700 {s}px ${JOSE}`, W * 0.6, H * 0.6, '#f0c987', { track: 30 }); } },
  panera_bread: { name: 'Panero Bread', draw(g, W, H) { bg(g, W, H, '#4a6b2a'); text(g, 'Panero', W * 0.5, H * 0.42, `italic 700 {s}px ${LORA}`, W * 0.6, H * 0.5, '#f6efd9'); text(g, 'BREAD', W * 0.5, H * 0.8, `600 {s}px ${OSW}`, W * 0.3, H * 0.18, '#e3c770', { track: 10 }); } },
  panda_express: { name: 'Panda Expresso', draw(g, W, H) { bg(g, W, H, '#d02030'); const x = W * 0.12, y = H / 2, r = H * 0.34; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#111';
    for (const d of [-1, 1]) { g.beginPath(); g.arc(x + d * r * 0.62, y - r * 0.62, r * 0.28, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(x + d * r * 0.34, y - r * 0.05, r * 0.16, r * 0.22, d * 0.5, 0, Math.PI * 2); g.fill(); }
    text(g, 'PANDA EXPRESSO', W * 0.6, H * 0.5, `400 {s}px ${SANS}`, W * 0.68, H * 0.42, '#ffffff'); } },
  jamba: { name: 'Jumba', draw(g, W, H) { bg(g, W, H, '#ffffff'); text(g, 'jumba', W / 2, H * 0.5, `800 {s}px ${MONT}`, W * 0.6, H * 0.6, '#7ab800'); } },
  sport_clips: { name: 'Sport Snips', draw(g, W, H) { bg(g, W, H, '#0a2240'); text(g, 'SPORT SNIPS', W / 2, H * 0.46, `italic 800 {s}px ${KANIT}`, W * 0.8, H * 0.5, '#ffffff'); text(g, 'HAIRCUTS', W / 2, H * 0.8, `600 {s}px ${OSW}`, W * 0.3, H * 0.16, '#e4002b', { track: 8 }); } },
};

// real store names -> parodies, for the OpenStreetMap POIs on the Carmel Mountain Plaza storefronts
const NAMES = [
  [/\btarget\b/i, 'Tarjet'], [/wal-?mart/i, 'Walmark'], [/\bcostco\b/i, 'Costko'], [/\bsubway\b/i, 'Subwai'], [/great clips/i, 'Great Snips'], [/starbucks/i, 'Starbrew Coffee'],
  [/\bhabit\b/i, 'The Havit Burger Grill'], [/board (&|and) brew/i, 'Bored & Brew'], [/round table/i, 'Round Fable Pizza'], [/five guys/i, 'Five Dudes'], [/jersey mike/i, 'Jersey Mack\'s Subs'],
  [/wingstop/i, 'Wingspot'], [/little caesar/i, 'Little Cesar\'s'], [/o'?reilly/i, 'O\'Riley Auto Parts'], [/outback/i, 'Outbank Steakhouse'], [/\bike'?s\b/i, 'Ivy\'s Sandwiches'],
  [/wells fargo/i, 'Wells Cargo'], [/barnes/i, 'Barns & Nobel'], [/trader joe/i, 'Trader Moe\'s'], [/\bulta\b/i, 'ulti beauty'], [/chipotle/i, 'Chipolte'], [/\bcava\b/i, 'CAVO'],
  [/panera/i, 'Panero Bread'], [/panda express/i, 'Panda Expresso'], [/jamba/i, 'Jumba'], [/sport clips/i, 'Sport Snips'], [/in-n-out/i, 'In-N-Up Burger'], [/chick-fil-a/i, 'Chick-fil-Eh'],
  [/mcdonald/i, 'McDougal\'s'], [/burger king/i, 'Burger Kingdom'], [/taco bell/i, 'Taco Belle'], [/\bwendy'?s\b/i, 'Windy\'s'], [/jack in the box/i, 'Jack in the Crate'], [/del taco/i, 'Dell Taco'],
  [/carl'?s jr/i, 'Karl\'s Jr.'], [/\bkfc\b|kentucky fried/i, 'KFG'], [/domino/i, 'Dominoe\'s'], [/pizza hut/i, 'Pizza Hutt'], [/papa john/i, 'Papa Jon\'s'], [/dunkin/i, 'Dunkan\'s'], [/\bpeet'?s\b/i, 'Pete\'s Coffee'],
  [/coffee bean/i, 'Coffee Beam'], [/baskin/i, 'Baskin Robins'], [/cold stone/i, 'Cold Stoned'], [/\brubio'?s\b/i, 'Rubios'], [/el pollo loco/i, 'El Pollo Lobo'], [/olive garden/i, 'Olive Gardens'],
  [/applebee/i, 'Appleby\'s'], [/chili'?s/i, 'Chilly\'s'], [/red robin/i, 'Red Robyn'], [/\bihop\b/i, 'IHOB'], [/\bdenny'?s\b/i, 'Denney\'s'], [/cheesecake factory/i, 'Cheesecake Foundry'],
  [/home depot/i, 'Home Depo'], [/lowe'?s/i, 'Lowell\'s'], [/best buy/i, 'Best Bye'], [/\bkohl'?s\b/i, 'Kohn\'s'], [/marshalls/i, 'Marshals'], [/\bross\b/i, 'Roz Dress for Less'], [/tj ?maxx/i, 'TJ Maxi'],
  [/old navy/i, 'Old Navvy'], [/michaels/i, 'Michael\'s Crafts'], [/petsmart/i, 'PetSmarts'], [/\bpetco\b/i, 'Petko'], [/bed bath/i, 'Bed Bath & Further'], [/\bstaples\b/i, 'Staplez'], [/office depot/i, 'Office Depo'],
  [/\bvons\b/i, 'Vonz'], [/ralphs/i, 'Ralph\'s Market'], [/albertsons/i, 'Albertson'], [/sprouts/i, 'Sproutz Farmers Market'], [/whole foods/i, 'Hole Foods'], [/\bcvs\b/i, 'CVZ Pharmacy'], [/walgreens/i, 'Wallgreens'],
  [/rite aid/i, 'Right Aid'], [/7-?eleven/i, '8-Eleven'], [/\bchase\b/i, 'Chace Bank'], [/bank of america/i, 'Bank of Amerika'], [/us bank|u\.s\. bank/i, 'UZ Bank'], [/verizon/i, 'Verizen'],
  [/at&t/i, 'AT&P'], [/t-mobile/i, 'T-Mobil'], [/\bamc\b/i, 'AMK Theatres'], [/\bregal\b/i, 'Regale Cinemas'], [/24 hour fitness/i, '25 Hour Fitness'], [/planet fitness/i, 'Planet Fitnes'],
  [/autozone/i, 'AutoZoan'], [/jiffy lube/i, 'Jiffy Loob'], [/\bshell\b/i, 'Shel'], [/chevron/i, 'Chevrun'], [/\barco\b/i, 'Arko'], [/\bmobil\b/i, 'Mobile'], [/^76\b/, '77'],
];
export function parodyName(n) { for (const [re, p] of NAMES) if (re.test(n)) return p; return n; }

const made = [];
let fontsReady = false;
function draw(rec) { const g = rec.canvas.getContext('2d'); g.setTransform(rec.canvas.width / 1024, 0, 0, rec.canvas.width / 1024, 0, 0); g.clearRect(0, 0, 1024, rec.H); BRANDS[rec.key].draw(g, 1024, rec.H); rec.tex.needsUpdate = true; }
export function brandLogo(THREE, key, aspect = 4.4) {
  if (!BRANDS[key]) return null;
  const H = Math.round(1024 / Math.max(0.8, aspect)), hit = made.find(m => m.key === key && m.H === H); if (hit) return hit.tex;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.round(H / 2); // half size: plenty for a 6 m sign
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.userData.brandKey = key;
  const rec = { key, H, canvas, tex }; made.push(rec); draw(rec);
  if (!fontsReady) whenFonts().then(() => draw(rec));
  return tex;
}
export function brandName(key) { return BRANDS[key] ? BRANDS[key].name : null; }
let fontP = null;
function whenFonts() {
  if (fontP) return fontP;
  fontP = (document.fonts && document.fonts.load ? Promise.race([Promise.all(LOAD.map(f => document.fonts.load(f).catch(() => null))), new Promise(r => setTimeout(r, 8000))]) : Promise.resolve()).then(() => { fontsReady = true; });
  return fontP;
}
