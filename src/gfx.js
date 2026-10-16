// Graphics presets, picked automatically for the machine and changeable in Settings. Everything here is read once at
// boot (renderer, shadows, grass, how many people and cars the town spawns), except the render scale, which the game
// keeps adjusting while you play (dynamic resolution) to stay near the target frame rate on a slow computer.
const KEY = 'pw-auto-online-gfx';

export const PRESETS = {
  potato: { label: 'Potato', note: 'Old laptops and school Chromebooks. No shadows or grass, short view, few people.',
    scale: 0.6, minScale: 0.45, aa: false, shadows: 0, grass: 0, view: 750, peds: 20, traffic: 14, pool: 5, pedDraw: 110, veg: 900, fps: 30 },
  low: { label: 'Low', note: 'Integrated graphics. Light grass, no shadows.',
    scale: 0.8, minScale: 0.55, aa: false, shadows: 0, grass: 0.35, view: 1100, peds: 32, traffic: 26, pool: 8, pedDraw: 150, veg: 1400, fps: 40 },
  medium: { label: 'Medium', note: 'Most laptops. Shadows on, grass at medium density.',
    scale: 1, minScale: 0.7, aa: true, shadows: 1024, grass: 0.7, view: 1500, peds: 46, traffic: 36, pool: 12, pedDraw: 200, veg: 2000, fps: 50 },
  high: { label: 'High', note: 'Gaming laptops and desktops.',
    scale: 1.5, minScale: 0.85, aa: true, shadows: 2048, grass: 1, view: 2300, peds: 56, traffic: 46, pool: 14, pedDraw: 260, veg: 2400, fps: 55 },
  ultra: { label: 'Ultra', note: 'Strong desktop GPUs. Dense grass, crisp shadows, longest view.',
    scale: 2, minScale: 1, aa: true, shadows: 4096, grass: 1.5, view: 2600, peds: 68, traffic: 56, pool: 20, pedDraw: 320, veg: 2600, fps: 55 },
};
export const ORDER = ['potato', 'low', 'medium', 'high', 'ultra'];

// a guess from what the browser tells us; good enough to start, the dynamic resolution does the rest
export function detectPreset() {
  let gpu = '';
  try { const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'); const ext = gl && gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { }
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 4, mobile = matchMedia('(pointer: coarse)').matches;
  if (/swiftshader|llvmpipe|software|mali-[gt][0-9]{2}\b|adreno \(tm\) [3-5]/i.test(gpu) || mem <= 2) return 'potato';
  if (mobile || mem <= 4 || cores <= 4 || /intel.*(hd|uhd) graphics [0-9]{3}\b|intel\(r\) hd/i.test(gpu)) return 'low';
  if (/apple m[2-9]|rtx|radeon rx [6-9]|arc a/i.test(gpu) && mem >= 8) return 'high';
  return 'medium';
}

export function loadGfx() {
  let s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
  const q = new URLSearchParams(location.search).get('gfx');
  const id = PRESETS[q] ? q : s && PRESETS[s.preset] ? s.preset : detectPreset();
  const auto = !(PRESETS[q]) && !(s && PRESETS[s.preset]);
  return { id, auto, dynamic: s ? s.dynamic !== false : true, ...PRESETS[id] };
}
export function saveGfx(id, dynamic) { try { localStorage.setItem(KEY, JSON.stringify({ preset: id, dynamic })); } catch (e) { } }

// dynamic resolution: call every frame with the real frame time; returns a new pixel ratio when it should change
export function makeScaler(G, setRatio) {
  let acc = 0, n = 0, cur = Math.min(devicePixelRatio, G.scale);
  const maxR = Math.min(devicePixelRatio, G.scale), minR = Math.min(maxR, G.minScale), target = 1 / G.fps;
  setRatio(cur);
  return function step(rdt) {
    if (!G.dynamic) return;
    acc += rdt; n++;
    if (acc < 1.5) return;
    const avg = acc / n; acc = 0; n = 0;
    let next = cur;
    if (avg > target * 1.18) next = Math.max(minR, cur * 0.88);       // too slow: render fewer pixels
    else if (avg < target * 0.8) next = Math.min(maxR, cur * 1.06);   // headroom: sharpen back up
    if (Math.abs(next - cur) > 0.02) { cur = next; setRatio(cur); }
  };
}
