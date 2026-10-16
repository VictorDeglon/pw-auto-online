// Procedural radio: original songs written on the fly by a small composer, in WebAudio. Each song is a seed and a
// style, so "Twin Peaks Nights" is the same tune every time you hear it. Nothing is downloaded; nothing is licensed.
//   const C = createComposer(AC, destination)
//   C.play(song, { offset })   song = { title, artist, seed, style }   C.stop()   C.onend = fn   C.volume(v)
// Styles: synthwave, funk, lofi, country, rock, chip, latin, lounge.
export const PROC_STATIONS = [
  { name: 'Titan FM 99.5 · Synthwave', style: 'synthwave', songs: ['Twin Peaks Nights', 'Neon on Poway Road', 'Espola Overdrive', 'Midnight at the Plaza', 'Lake Poway Mirage', 'Highway 67 Afterglow'] },
  { name: 'KPOW 92.1 · Poway Funk', style: 'funk', songs: ['Community Road Strut', 'Sabre Springs Shuffle', 'Old Coach Groove', 'Bowron Boogie', 'Midland Slide'] },
  { name: 'Lo-Fi Lake 88.3 · Beats to Drive To', style: 'lofi', songs: ['Rainy Day at Hilleary Park', 'Library Study Hall', 'Late Bus Home', 'Sunday at the Sportspark', 'Porch Light', 'Fog over Green Valley'] },
  { name: 'K67 Country 101.9', style: 'country', songs: ['Garden Road Gravel', 'Iron Mountain Morning', 'Two Lane Poway', 'Barn at Old Poway Park', 'Dust on the Dash'] },
  { name: 'Rock 105 · The Grade', style: 'rock', songs: ['Poway Grade Redline', 'Mount Woodson Thunder', 'Busted on Pomerado', 'Chaparral Fire', 'Titans Fight Song (Loud Version)'] },
  { name: '8-Bit Poway 64.0', style: 'chip', songs: ['Potato Chip Rock', 'Level 1: Old Poway', 'Boss Fight at the Lake', 'Power-Up on Poway Road', 'Continue? 9... 8...'] },
  { name: 'Radio Sol 97.7 · Latino', style: 'latin', songs: ['Noche en Poway', 'Cumbia del Lago', 'Sol de Espola', 'Bailando en la Plaza', 'Carretera 67'] },
];
const ARTISTS = { synthwave: ['Grid Runner', 'VHS Sunset', 'Chrome Coyote'], funk: ['The Bowron Horns', 'Slick Rick & the Sedans'], lofi: ['beatsbyvalley', 'nap time', 'porchcat'],
  country: ['Dusty Hollis', 'The Garden Road Band'], rock: ['Redline Canyon', 'The Graders'], chip: ['Pixel Poway', '0x92064'], latin: ['Los del Lago', 'Sonido Poway'] };
export function procSongs() {
  let n = 0; return PROC_STATIONS.map(S => ({ ...S, songs: S.songs.map((title, i) => ({ title, style: S.style, seed: hash(title) ^ (n++ * 7919), artist: ARTISTS[S.style][i % ARTISTS[S.style].length] })) }));
}
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11] };
// per style: tempo, swing, scale, chord progressions (scale degrees), sevenths, instruments
const STYLE = {
  synthwave: { bpm: [92, 112], swing: 0, scale: ['minor'], prog: [[0, 5, 2, 6], [0, 6, 5, 6], [5, 3, 0, 4]], sev: 0, drum: 'four', bass: 'pump', comp: 'pad', arp: true, lead: 'saw', rev: 0.35 },
  funk: { bpm: [98, 112], swing: 0.08, scale: ['dorian', 'mixo'], prog: [[0, 3], [0, 0, 3, 4], [0, 6, 3, 0]], sev: 1, drum: 'funk', bass: 'slap', comp: 'stab', lead: 'brass', rev: 0.15 },
  lofi: { bpm: [72, 88], swing: 0.18, scale: ['major', 'dorian'], prog: [[1, 4, 0, 5], [3, 2, 1, 4], [0, 5, 1, 4]], sev: 1, drum: 'boom', bass: 'soft', comp: 'rhodes', lead: 'flute', rev: 0.3, crackle: true },
  country: { bpm: [100, 124], swing: 0.12, scale: ['major', 'mixo'], prog: [[0, 3, 4, 0], [0, 0, 3, 4], [0, 4, 5, 3]], sev: 0, drum: 'train', bass: 'boomchick', comp: 'strum', lead: 'twang', rev: 0.2 },
  rock: { bpm: [120, 148], swing: 0, scale: ['minor'], prog: [[0, 5, 6, 6], [0, 3, 5, 4], [0, 6, 5, 6]], sev: 0, drum: 'rock', bass: 'eighth', comp: 'power', lead: 'gtr', rev: 0.18 },
  chip: { bpm: [128, 152], swing: 0, scale: ['major', 'minor'], prog: [[0, 5, 3, 4], [0, 4, 5, 3], [5, 3, 0, 4]], sev: 0, drum: 'chip', bass: 'chip', comp: 'arp', arp: true, lead: 'square', rev: 0.05 },
  latin: { bpm: [92, 108], swing: 0.05, scale: ['harm', 'minor'], prog: [[0, 3, 4, 0], [0, 6, 5, 4], [0, 3, 6, 2]], sev: 0, drum: 'cumbia', bass: 'tumbao', comp: 'strum', lead: 'flute', rev: 0.22 },
};

export function createComposer(AC, dest) {
  const out = AC.createGain(); out.gain.value = 0.5;
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  const bus = AC.createGain(); bus.connect(comp).connect(out).connect(dest);
  // reverb send: generated impulse; delay send for leads
  const rev = AC.createConvolver(); { const L = Math.round(AC.sampleRate * 2.2), b = AC.createBuffer(2, L, AC.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 3.2); } rev.buffer = b; }
  const revG = AC.createGain(); revG.gain.value = 0.25; revG.connect(rev).connect(comp);
  const dly = AC.createDelay(1.5), dlyFb = AC.createGain(), dlyG = AC.createGain(); dlyFb.gain.value = 0.32; dlyG.gain.value = 0.18; dlyG.connect(dly); dly.connect(dlyFb).connect(dly); dly.connect(comp);
  const noiseBuf = (() => { const L = AC.sampleRate, b = AC.createBuffer(1, L, AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < L; i++) d[i] = Math.random() * 2 - 1; return b; })();
  const dist = (() => { const s = AC.createWaveShaper(), n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / n * 2 - 1; c[i] = Math.tanh(x * 6) * 0.8; } s.curve = c; return s; })();
  dist.connect(bus);

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function env(g, t, a, peak, d, sus, rel, end) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(peak * sus, t + a, d); g.gain.setTargetAtTime(0.0001, end, rel); }
  function osc(type, f, t, end, dst, detune = 0) { const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune; o.connect(dst); o.start(t); o.stop(end + 0.6); return o; }
  function nz(t, dur, type, freq, q, gain, dst = bus) { const s = AC.createBufferSource(); s.buffer = noiseBuf; const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = AC.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f).connect(g).connect(dst); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); }
  // ---- instruments
  const I = {
    kick(t, v = 1, chip) { const o = AC.createOscillator(), g = AC.createGain(); o.type = chip ? 'square' : 'sine'; o.frequency.setValueAtTime(chip ? 180 : 150, t); o.frequency.exponentialRampToValueAtTime(chip ? 40 : 42, t + 0.12); g.gain.setValueAtTime(0.95 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.45); },
    snare(t, v = 1, chip) { nz(t, chip ? 0.12 : 0.2, chip ? 'highpass' : 'bandpass', chip ? 3000 : 1900, 0.7, 0.55 * v); if (!chip) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08); g.gain.setValueAtTime(0.3 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.15); } const s = AC.createGain(); s.gain.value = 0.25 * v; nz(t, 0.25, 'bandpass', 2400, 0.5, 0.25 * v, revG); },
    hat(t, v = 1, open) { nz(t, open ? 0.22 : 0.045, 'highpass', 8000, 0.8, 0.22 * v); },
    clap(t, v = 1) { for (let k = 0; k < 3; k++) nz(t + k * 0.011, 0.09, 'bandpass', 1400, 1.2, 0.3 * v); nz(t + 0.03, 0.3, 'bandpass', 1400, 0.8, 0.15 * v, revG); },
    crash(t, v = 1) { nz(t, 1.6, 'highpass', 5000, 0.5, 0.25 * v); },
    shaker(t, v = 1) { nz(t, 0.06, 'bandpass', 6000, 2, 0.12 * v); },
    conga(t, m, v = 1) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(mtof(m) * 1.3, t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.04); g.gain.setValueAtTime(0.35 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.3); },
    clave(t) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = 2500; g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.06); },
    bass(t, m, dur, kind) {
      const g = AC.createGain(), f = AC.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = kind === 'slap' ? 6 : 1;
      const cut = { pump: 500, slap: 900, soft: 380, boomchick: 600, eighth: 700, chip: 4000, tumbao: 550 }[kind] || 600;
      f.frequency.setValueAtTime(cut * 2.4, t); f.frequency.exponentialRampToValueAtTime(cut, t + 0.12);
      env(g, t, 0.006, kind === 'soft' ? 0.5 : 0.6, 0.15, kind === 'soft' ? 0.7 : 0.45, 0.06, t + dur);
      f.connect(g).connect(bus);
      const type = kind === 'chip' ? 'triangle' : kind === 'soft' ? 'sine' : kind === 'slap' ? 'sawtooth' : 'sawtooth';
      osc(type, mtof(m), t, t + dur, f); if (kind !== 'chip' && kind !== 'soft') osc('square', mtof(m - 12), t, t + dur, f).detune.value = 4;
    },
    pad(t, notes, dur, v = 1) { const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1600, t + dur * 0.6); const g = AC.createGain(); env(g, t, 0.35, 0.09 * v, 0.6, 0.8, 0.5, t + dur); f.connect(g).connect(bus); g.connect(revG); for (const m of notes) { osc('sawtooth', mtof(m), t, t + dur, f, -7); osc('sawtooth', mtof(m), t, t + dur, f, 7); } },
    stab(t, notes, dur, v = 1) { const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.7; const g = AC.createGain(); env(g, t, 0.004, 0.14 * v, 0.05, 0.3, 0.04, t + dur); f.connect(g).connect(bus); for (const m of notes) osc('square', mtof(m), t, t + dur, f); },
    rhodes(t, notes, dur, v = 1) { const g = AC.createGain(); env(g, t, 0.01, 0.13 * v, 0.6, 0.35, 0.4, t + dur); const trem = AC.createGain(); trem.gain.value = 1; const lfo = AC.createOscillator(); lfo.frequency.value = 4.5; const lg = AC.createGain(); lg.gain.value = 0.25; lfo.connect(lg).connect(trem.gain); lfo.start(t); lfo.stop(t + dur + 0.6); g.connect(trem).connect(bus); trem.connect(revG); for (const m of notes) { osc('sine', mtof(m), t, t + dur, g); const h = AC.createGain(); h.gain.value = 0.25; h.connect(g); osc('triangle', mtof(m + 12), t, t + dur * 0.3, h); } },
    pluck(t, m, dur, v = 1, bright = 2500) { const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(bright, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.4); const g = AC.createGain(); g.gain.setValueAtTime(0.18 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(1.2, dur + 0.4)); f.connect(g).connect(bus); g.connect(revG); osc('sawtooth', mtof(m), t, t + dur + 0.4, f); osc('triangle', mtof(m), t, t + dur + 0.4, f, 6); },
    power(t, root, dur, v = 1) { const g = AC.createGain(); env(g, t, 0.005, 0.12 * v, 0.2, 0.7, 0.05, t + dur); const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600; g.connect(f).connect(dist); for (const m of [root, root + 7, root + 12]) osc('sawtooth', mtof(m), t, t + dur, g, (Math.random() - 0.5) * 12); },
    arp(t, m, dur, v = 1, chip) { const g = AC.createGain(); env(g, t, 0.003, (chip ? 0.07 : 0.06) * v, 0.08, 0.4, 0.03, t + dur); g.connect(bus); if (!chip) g.connect(dlyG); osc(chip ? 'square' : 'sawtooth', mtof(m), t, t + dur, g); },
    lead(t, m, dur, kind, v = 1) {
      const g = AC.createGain(), f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = { saw: 2800, brass: 2200, flute: 3000, twang: 3500, gtr: 3000, square: 6000 }[kind] || 2500;
      env(g, t, kind === 'flute' ? 0.05 : kind === 'brass' ? 0.03 : 0.008, (kind === 'square' ? 0.07 : 0.1) * v, 0.2, kind === 'twang' ? 0.3 : 0.7, 0.08, t + dur);
      f.connect(g); (kind === 'gtr' ? g.connect(dist) : g.connect(bus)); g.connect(dlyG); g.connect(revG);
      const type = { saw: 'sawtooth', brass: 'sawtooth', flute: 'triangle', twang: 'sawtooth', gtr: 'sawtooth', square: 'square' }[kind] || 'square';
      const o = osc(type, mtof(m), t, t + dur, f);
      if (kind !== 'square') { const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(kind === 'flute' ? 9 : 6, t + Math.min(0.4, dur)); lfo.connect(lg).connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.6); }
      if (kind === 'twang') { o.frequency.setValueAtTime(mtof(m - 1), t); o.frequency.linearRampToValueAtTime(mtof(m), t + 0.06); }
    },
  };

  // ---- writing a song
  function write(song) {
    const R = rng(song.seed), S = STYLE[song.style], pick = a => a[Math.floor(R() * a.length)];
    const bpm = Math.round(S.bpm[0] + R() * (S.bpm[1] - S.bpm[0])), scale = SCALES[pick(S.scale)], key = 40 + Math.floor(R() * 8); // E2..B2 as the bass root
    const progA = pick(S.prog), progB = pick(S.prog.filter(p => p !== progA).concat([progA])), progC = S.prog[(S.prog.indexOf(progA) + 1) % S.prog.length];
    const deg = (d, o = 0) => { const n = scale.length, k = ((d % n) + n) % n; return key + scale[k] + 12 * (Math.floor(d / n) + o); };
    const chord = (d, o) => [deg(d, o), deg(d + 2, o), deg(d + 4, o)].concat(S.sev ? [deg(d + 6, o)] : []);
    // a lead motif: 2 bars of 8th-note slots, 1 = note, 0 = rest, pitches as chord-tone steps
    const motif = () => { const r = [], p = []; let s = Math.floor(R() * 3); for (let i = 0; i < 16; i++) { r.push(R() < (i % 2 ? 0.35 : 0.7) ? 1 : 0); s += Math.floor(R() * 5) - 2; s = Math.max(-2, Math.min(6, s)); p.push(s); } r[0] = 1; return { r, p }; };
    const mA = motif(), mB = motif();
    const form = [['intro', 4, progA, 0], ['A', 8, progA, 1], ['B', 8, progB, 2], ['A', 8, progA, 1], ['B', 8, progB, 2], ['C', 8, progC, 1], ['B', 8, progB, 3], ['outro', 4, progA, 0]];
    return { bpm, swing: S.swing, S, deg, chord, mA, mB, form, R, bars: form.reduce((n, f) => n + f[1], 0) };
  }
  // schedule one bar (16 steps) at time t
  function bar(W, sec, bi, t) {
    const { S, deg, chord } = W, step = 60 / W.bpm / 4, [name, , prog, energy] = sec, d = prog[bi % prog.length], root = deg(d), ch = chord(d, 1);
    const sw = i => t + i * step + (i % 2 ? W.swing * step * 2 : 0), last = bi === sec[1] - 1, first = bi === 0;
    const E = energy, R = W.R;
    // drums
    if (E > 0 || name === 'intro' && bi >= 2) {
      const D = S.drum, chip = D === 'chip';
      for (let i = 0; i < 16; i++) {
        const tt = sw(i);
        if (D === 'four' || D === 'chip') { if (i % 4 === 0) I.kick(tt, 1, chip); if (i === 4 || i === 12) (chip ? I.snare(tt, 1, true) : I.clap(tt)); if (i % 2 === 0 || E > 1) I.hat(tt, i % 4 === 2 ? 1 : 0.5, !chip && i % 4 === 2 && E > 1); }
        if (D === 'funk') { if (i === 0 || i === 3 || i === 10 || (E > 1 && i === 7)) I.kick(tt); if (i === 4 || i === 12) I.snare(tt); if ((i === 7 || i === 9 || i === 14) && R() < 0.5) I.snare(tt, 0.25); I.hat(tt, i % 2 ? 0.4 : 0.8, i === 14 && E > 1); }
        if (D === 'boom') { if (i === 0 || i === 10 || (i === 7 && R() < 0.5)) I.kick(tt, 0.9); if (i === 4 || i === 12) I.snare(tt, 0.8); if (i % 2 === 0) I.hat(tt, 0.45); }
        if (D === 'train') { if (i === 0 || i === 8) I.kick(tt, 0.8); if (i === 4 || i === 12) I.snare(tt, 0.7); I.hat(tt, i % 2 ? 0.3 : 0.6); }
        if (D === 'rock') { if (i === 0 || i === 8 || i === 10 || (E > 1 && i === 6)) I.kick(tt); if (i === 4 || i === 12) I.snare(tt); if (i % 2 === 0) I.hat(tt, 0.7, E > 1); }
        if (D === 'cumbia') { if (i % 8 === 0) I.kick(tt, 0.8); if (i === 4 || i === 12) I.snare(tt, 0.5); I.shaker(tt, i % 2 ? 0.6 : 1); if ([0, 3, 6, 10, 12].includes(i)) I.clave(tt); if (i === 6 || i === 7 || i === 14) I.conga(tt, i === 14 ? 64 : 60, 0.8); }
      }
      if (first && E > 0 && (S.drum === 'rock' || S.drum === 'four' || S.drum === 'funk')) I.crash(t);
      if (last && E > 0) for (let i = 12; i < 16; i++) I.snare(sw(i), 0.4 + (i - 12) * 0.15, chip); // fill into the next section
    }
    // bass
    if (E > 0 || name === 'intro' && bi >= 1) {
      const B = S.bass, L = step;
      const pat = { pump: [0, 2, 4, 6, 8, 10, 12, 14], slap: [0, 3, 6, 8, 10, 11, 14], soft: [0, 6, 10], boomchick: [0, 8], eighth: [0, 2, 4, 6, 8, 10, 12, 14], chip: [0, 2, 4, 6, 8, 10, 12, 14], tumbao: [3, 6, 10, 14] }[B];
      for (const i of pat) { let m = root; if (B === 'slap' && i === 11) m = root + 12; if (B === 'boomchick' && i === 8) m = deg(d + 4); if (B === 'chip' && i % 4 === 2) m = root + 12; if (B === 'tumbao' && i === 10) m = deg(d + 4); if (B === 'soft' && i === 10) m = deg(d + 2); I.bass(sw(i), m, B === 'soft' ? L * 5 : B === 'boomchick' ? L * 3 : L * 1.6, B); }
    }
    // comping
    const C = S.comp, barLen = step * 16;
    if (C === 'pad') I.pad(t, ch, barLen, E > 0 ? 1 : 0.7);
    if (C === 'stab' && E > 0) for (const i of [2, 6, 10, 13]) I.stab(sw(i), ch, step * 0.8);
    if (C === 'rhodes') { I.rhodes(t, ch, step * 7); I.rhodes(sw(8), ch, step * 7, 0.8); }
    if (C === 'strum') for (const i of S.drum === 'cumbia' ? [2, 6, 10, 14] : [0, 4, 8, 10, 12]) ch.forEach((m, k) => I.pluck(sw(i) + k * 0.012, m, step * 2, 0.8));
    if (C === 'power' && E > 0) for (const i of [0, 3, 6, 8, 11, 14]) I.power(sw(i), root + 12, step * (i === 6 || i === 14 ? 2 : 1.4), E > 1 ? 1 : 0.8);
    if (C === 'power' && E === 0) I.pad(t, ch, barLen, 0.6);
    if (S.arp && E !== 3) { const a = ch.concat([ch[0] + 12]); for (let i = 0; i < 16; i++) I.arp(sw(i), a[(i * (C === 'arp' ? 1 : 2)) % a.length] + 12, step * 0.9, 0.8, S.drum === 'chip'); }
    // lead: motif A in A sections, B in B, both in the bridge, nothing in the intro
    if (E > 0 && name !== 'intro' && name !== 'outro') {
      const M = name === 'B' ? W.mB : name === 'C' ? (bi % 2 ? W.mA : W.mB) : W.mA, half = (bi % 2) * 8, var_ = Math.floor(bi / 2) % 2;
      for (let i = 0; i < 8; i++) {
        if (!M.r[half + i]) continue; let len = 1; while (i + len < 8 && !M.r[half + i + len] && len < 3) len++;
        const s = M.p[half + i] + (var_ && i > 5 ? 1 : 0), m = deg(d + s, 2) + (S.lead === 'square' ? 12 : 0);
        I.lead(sw(i * 2), m, step * 2 * len * 0.92, S.lead, name === 'B' ? 1 : 0.85);
      }
    }
    if (S.crackle && R() < 0.8) for (let k = 0; k < 6; k++) nz(t + R() * barLen, 0.01, 'highpass', 3000, 1, 0.05);
  }

  let cur = null, timer = 0;
  function pump() {
    if (!cur) return;
    const ahead = AC.currentTime + 0.35;
    while (cur.next < ahead) {
      const W = cur.W; if (cur.bar >= W.bars) { const c = cur; cur = null; clearInterval(timer); setTimeout(() => api.onend && api.onend(c.song), Math.max(0, (c.next - AC.currentTime) * 1000)); return; }
      let b = cur.bar, si = 0; while (b >= W.form[si][1]) { b -= W.form[si][1]; si++; }
      if (cur.next > AC.currentTime - 0.05) bar(W, W.form[si], b, cur.next);
      cur.next += 60 / W.bpm * 4; cur.bar++;
    }
  }
  const api = {
    onend: null,
    play(song, o = {}) {
      api.stop(); const W = write(song), barT = 60 / W.bpm * 4, start = Math.min(W.bars - 8, Math.floor((o.offset || 0) / barT));
      cur = { song, W, bar: Math.max(0, start), next: AC.currentTime + 0.08 }; out.gain.cancelScheduledValues(AC.currentTime); out.gain.setValueAtTime(0, AC.currentTime); out.gain.linearRampToValueAtTime(api.vol, AC.currentTime + 0.4);
      pump(); timer = setInterval(pump, 60);
      return { bpm: W.bpm, length: W.bars * barT };
    },
    stop() { if (timer) clearInterval(timer); timer = 0; cur = null; out.gain.cancelScheduledValues(AC.currentTime); out.gain.setTargetAtTime(0, AC.currentTime, 0.05); },
    vol: 0.5, volume(v) { api.vol = v; if (cur) out.gain.setTargetAtTime(v, AC.currentTime, 0.1); },
    get playing() { return !!cur; },
  };
  return api;
}
