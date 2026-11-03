// Graphics presets, picked automatically for the machine and changeable in Settings. Everything here is read once at
// boot (renderer, shadows, grass, how many people and cars the town spawns), except the render scale, which the game
// keeps adjusting while you play (dynamic resolution) to stay near the target frame rate on a slow computer.
// The light and camera tiers (Medium and up; Potato and Low keep the old, cheaper path):
//   look    the default look in Settings (src/post.js): 0 off, 1 clean, 2 stylized, 3 realistic
//   msaa    MSAA samples for the realistic look (0: edge AA in the post pass instead, much cheaper)
//   ibl     size of the sky environment map cube (src/skyenv.js), 0 = none (hemisphere light only)
//   atmos   exponential height fog + aerial perspective (src/atmos.js) instead of linear fog
//   ao      ambient occlusion in the realistic look (half resolution, from depth)
//   csm     shadow cascades (src/cascades.js; 0 = one shadow map around the player)
//   lod     how far detail reaches (a multiplier): cars' detail steps, street furniture, cars drawn at all
// With nothing chosen in Settings the preset follows the machine (makeGovernor): one that can't hold its frame rate even
// at the lowest render scale steps down a preset, at once for what can change while playing and fully from the next
// load; one that ran with plenty of headroom gets a step back up (never past what detectPreset guessed) next time.
const KEY = 'pw-auto-online-gfx', KEY_AUTO = 'pw-auto-online-gfx-auto';

export const PRESETS = {
  potato: { label: 'Potato', note: 'Old laptops and school Chromebooks. No shadows or grass, short view, few people.',
    scale: 0.6, minScale: 0.45, aa: false, shadows: 0, grass: 0, view: 750, peds: 26, traffic: 18, parked: 14, pool: 5, pedDraw: 110, veg: 900, fps: 30, look: 0, ibl: 0, atmos: 0, ao: 0, csm: 0, lod: 0.6 },
  low: { label: 'Low', note: 'Integrated graphics. Light grass, no shadows.',
    scale: 0.8, minScale: 0.55, aa: false, shadows: 0, grass: 0.35, view: 1100, peds: 44, traffic: 34, parked: 26, pool: 8, pedDraw: 150, veg: 1400, fps: 40, look: 1, ibl: 0, atmos: 0, ao: 0, csm: 0, lod: 0.8 },
  medium: { label: 'Medium', note: 'Most laptops. Shadows on, grass at medium density, sky reflections, bloom and haze.',
    scale: 1, minScale: 0.7, aa: true, shadows: 1024, grass: 0.7, view: 1500, peds: 64, traffic: 48, parked: 42, pool: 12, pedDraw: 200, veg: 2000, fps: 50, look: 3, msaa: 0, ibl: 128, atmos: 1, ao: 0, csm: 0, lod: 1 },
  high: { label: 'High', note: 'Gaming laptops and desktops. Adds ambient occlusion and sharper shadows near you.',
    scale: 1.5, minScale: 0.85, aa: true, shadows: 2048, grass: 1, view: 2300, peds: 80, traffic: 60, parked: 56, pool: 14, pedDraw: 260, veg: 2400, fps: 55, look: 3, msaa: 4, ibl: 256, atmos: 1, ao: 1, csm: 2, lod: 1.3 },
  ultra: { label: 'Ultra', note: 'Strong desktop GPUs. Dense grass, crisp shadows, longest view.',
    scale: 2, minScale: 1, aa: true, shadows: 4096, grass: 1.5, view: 2600, peds: 96, traffic: 72, parked: 72, pool: 20, pedDraw: 320, veg: 2600, fps: 55, look: 3, msaa: 4, ibl: 256, atmos: 1, ao: 1, csm: 2, lod: 1.6 },
};
export const ORDER = ['potato', 'low', 'medium', 'high', 'ultra'];

// a guess from what the browser tells us; good enough to start, the dynamic resolution and makeGovernor do the rest.
// Phones: the strong ones (an Apple GPU, Adreno 7xx, recent Mali/Xclipse) Low, the rest Potato. Integrated Intel
// graphics and small machines Low; Apple M2+, RTX, RX 6000+ and Arc desktops High.
export function detectPreset() {
  let gpu = '';
  try { const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'); const ext = gl && gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { }
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 4, touch = matchMedia('(pointer: coarse)').matches;
  const phone = touch && Math.min(screen.width, screen.height) < 820;
  if (/swiftshader|llvmpipe|software|basic render|mali-[gt][0-9]{2}\b|mali-4|adreno \(tm\) [3-5]|powervr/i.test(gpu) || mem <= 2) return 'potato';
  if (phone) return /apple|adreno \(tm\) (7[3-9]|[89][0-9])[0-9]|mali-g(7[1-9]|[6-9][0-9]{2})|xclipse|immortalis/i.test(gpu) && mem >= 4 ? 'low' : 'potato';
  if (touch || mem <= 4 || cores <= 4 || (/intel/i.test(gpu) && !/arc/i.test(gpu))) return 'low';
  if (/apple m[2-9]|rtx|radeon rx [6-9]|arc a/i.test(gpu) && mem >= 8) return 'high';
  return 'medium';
}

export function loadGfx() {
  let s = null, a = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); a = JSON.parse(localStorage.getItem(KEY_AUTO) || 'null'); } catch (e) { }
  const q = new URLSearchParams(location.search).get('gfx'), detected = detectPreset();
  const auto = !(PRESETS[q]) && !(s && PRESETS[s.preset]);
  const brick = new URLSearchParams(location.search).has('brick'); // testing a very slow computer (index.html BRICK)
  const id = PRESETS[q] ? q : brick ? 'potato' : s && PRESETS[s.preset] ? s.preset : a && PRESETS[a.id] && a.from === detected ? a.id : detected; // (a new guess for this machine forgets the old adjustment)
  return { id, auto, detected, tier: id, dynamic: s ? s.dynamic !== false : true, ...PRESETS[id] };
}
function saveAuto(id, from) { try { localStorage.setItem(KEY_AUTO, JSON.stringify({ id, from, at: Date.now() })); } catch (e) { } }
export function saveGfx(id, dynamic) { try { localStorage.setItem(KEY, JSON.stringify({ preset: id, dynamic })); } catch (e) { } }

// dynamic resolution: call every frame with the real frame time; returns a new pixel ratio when it should change
export function makeScaler(G, setRatio) {
  let acc = 0, n = 0, cur = Math.min(devicePixelRatio, G.scale), maxR, minR, target;
  const retarget = () => { maxR = Math.min(devicePixelRatio, G.scale); minR = Math.min(maxR, G.minScale); target = 1 / G.fps; if (cur > maxR) { cur = maxR; setRatio(cur); } };
  retarget(); setRatio(cur);
  function step(rdt) {
    if (!G.dynamic) return;
    acc += rdt; n++;
    if (acc < 1.5) return;
    const avg = acc / n; acc = 0; n = 0;
    let next = cur;
    if (avg > target * 1.18) next = Math.max(minR, cur * 0.88);       // too slow: render fewer pixels
    else if (avg < target * 0.8) next = Math.min(maxR, cur * 1.06);   // headroom: sharpen back up
    if (Math.abs(next - cur) > 0.02) { cur = next; setRatio(cur); }
  }
  step.atMin = () => !G.dynamic || cur <= minR + 0.01; step.atMax = () => cur >= maxR - 0.01; step.retarget = retarget;
  return step;
}

// What can change while playing when the tier steps down (the rest waits for the next load)
const LIVE = ['scale', 'minScale', 'fps', 'view', 'pedDraw', 'peds', 'traffic', 'parked', 'veg', 'lod'];
// Call every frame with its real length in seconds (rAF to rAF, not clamped), the seconds the frame's own work took, and
// whether it was a streaming or loading spike (not counted). apply(P) changes the live settings to preset P's; note(label)
// tells the player. Headroom is judged by the work, since a 60 Hz display holds every frame at 16.7 ms.
export function makeGovernor(G, scaler, apply, note) {
  if (!G.auto) return () => { };
  let slow = 0, fast = 0, cool = 25, up = false;
  return function govern(sec, work, spike) {
    if (spike || sec > 0.5) return; // a hitch isn't the machine's pace
    if ((cool -= sec) > 0) return;
    const t = 1 / G.fps, i = ORDER.indexOf(G.tier);
    slow = scaler.atMin() && sec > t * 1.35 ? slow + sec : Math.max(0, slow - sec * 0.5);
    fast = scaler.atMax() && work < t * 0.45 && sec < t * 1.1 ? fast + sec : 0;
    if (slow > 8 && i > 0) { // ~8 s of slow frames at the lowest render scale
      const id = ORDER[i - 1], P = PRESETS[id]; slow = 0; cool = 25; G.tier = id; saveAuto(id, G.detected);
      for (const k of LIVE) G[k] = P[k]; scaler.retarget(); apply(P); if (note) note(P.label);
    }
    if (fast > 60 && !up && i < ORDER.indexOf(G.detected)) { up = true; saveAuto(ORDER[i + 1], G.detected); } // a minute of headroom: one step back up, next time
  };
}
