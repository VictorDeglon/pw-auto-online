// Procedural sound effects, second generation. Everything is synthesized (noise, oscillators, filters), nothing loaded.
// Distance matters: far sounds are quieter, duller (low-passed) and late (343 m/s), and every gunshot and explosion has
// an outdoor slap-back off the buildings.
//   const S = createSfx2(AC, master)
//   S.gun(id, vol, dist)  S.boom(R, vol, dist)  S.ricochet(v)  S.glass(v)  S.crunch(v)  S.step(surface, v)  S.ui(kind)
//   S.engine(speed, throttle, on)  S.screech(amount)  S.wind(amount)    (call the last three every frame)
export function createSfx2(AC, master) {
  const SR = AC.sampleRate, nb = AC.createBuffer(1, SR * 2, SR), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const brown = AC.createBuffer(1, SR * 2, SR), bd = brown.getChannelData(0); { let l = 0; for (let i = 0; i < bd.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = l * 3.5; } }
  const out = AC.createGain(); out.gain.value = 1; out.connect(master);
  // outdoor reflections: a short, bright, sparse impulse (slap-back off walls) rather than a hall
  const verb = AC.createConvolver(); { const L = Math.round(SR * 1.4), b = AC.createBuffer(2, L, SR); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let k = 0; k < 7; k++) { const at = Math.round(SR * (0.06 + Math.random() * 0.35)), a = 0.5 * Math.pow(0.7, k); for (let i = 0; i < 300 && at + i < L; i++) d[at + i] += (Math.random() * 2 - 1) * a * (1 - i / 300); } for (let i = 0; i < L; i++) d[i] += (Math.random() * 2 - 1) * 0.08 * Math.pow(1 - i / L, 4); } verb.buffer = b; }
  const verbIn = AC.createGain(); verbIn.gain.value = 0.35; const verbLp = AC.createBiquadFilter(); verbLp.type = 'lowpass'; verbLp.frequency.value = 3500; verbIn.connect(verbLp).connect(verb).connect(out);
  const now = () => AC.currentTime;
  let booms = []; // when the last few booms started
  // a voice chain for one sound: distance low-pass + gain, then dry out and a verb send
  function chain(vol, dist = 0, wet = 0.4) {
    const g = AC.createGain(), f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(500, 18000 / (1 + dist / 60)); g.gain.value = vol / (1 + dist / 45);
    f.connect(g); g.connect(out); const s = AC.createGain(); s.gain.value = wet * Math.min(1.6, 0.6 + dist / 120); g.connect(s).connect(verbIn); return f;
  }
  function noise(dst, t, dur, type, freq, q, gain, attack = 0.001, buf = nb) {
    const s = AC.createBufferSource(); s.buffer = buf; const f = AC.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dst); s.start(t, Math.random()); s.stop(t + dur + 0.05); return f;
  }
  function tone(dst, t, dur, type, f0, f1, gain) {
    const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(dst); o.start(t); o.stop(t + dur + 0.05);
  }
  // per weapon: crack (transient), body (band, length), thump (low sine), tail
  const GUN = {
    pistol: { crack: 0.9, band: 1600, len: 0.16, thump: 110, tg: 0.6, wet: 0.45 },
    smg: { crack: 0.7, band: 2000, len: 0.1, thump: 140, tg: 0.4, wet: 0.3 },
    shotgun: { crack: 1, band: 900, len: 0.35, thump: 70, tg: 1, wet: 0.6 },
    rifle: { crack: 1, band: 2400, len: 0.22, thump: 95, tg: 0.7, wet: 0.55 },
    sniper: { crack: 1.2, band: 2800, len: 0.4, thump: 70, tg: 1, wet: 0.9 },
    minigun: { crack: 0.5, band: 2200, len: 0.07, thump: 160, tg: 0.3, wet: 0.2 },
    npc: { crack: 0.8, band: 1700, len: 0.16, thump: 110, tg: 0.5, wet: 0.5 },
    rocket: { launch: true }, gl: { thunk: true }, grenade: { thunk: true }, sticky: { thunk: true }, airstrike: { thunk: true },
  };
  const api = {
    gun(id, vol = 1, dist = 0) {
      const G = GUN[id] || GUN.pistol, t = now() + dist / 343, d = chain(vol, dist, G.wet || 0.4);
      if (G.launch) { noise(d, t, 0.9, 'bandpass', 700, 0.6, 0.7, 0.02); noise(d, t, 0.25, 'lowpass', 300, 1, 0.9); tone(d, t, 0.5, 'sawtooth', 220, 70, 0.15); return; }
      if (G.thunk) { tone(d, t, 0.12, 'sine', 160, 60, 0.6); noise(d, t, 0.08, 'bandpass', 900, 1.5, 0.35); return; }
      noise(d, t, 0.012, 'highpass', 5000, 0.7, 0.9 * G.crack);                // the crack
      noise(d, t, G.len, 'bandpass', G.band * (0.9 + Math.random() * 0.2), 0.8, 0.8); // the body
      noise(d, t, G.len * 1.6, 'lowpass', 600, 0.7, 0.5 * G.tg);
      tone(d, t, 0.14, 'sine', G.thump * 1.8, G.thump * 0.6, 0.55 * G.tg);         // the thump in your chest
      if (id === 'shotgun') { noise(d, t + 0.35, 0.06, 'bandpass', 1200, 3, 0.2); noise(d, t + 0.5, 0.05, 'bandpass', 900, 3, 0.18); } // pump
    },
    boom(R = 7, vol = 1, dist = 0) { // booms on top of each other share the loudness instead of stacking into a clip
      const T = now(); booms = booms.filter(b => T - b < 0.4); booms.push(T); const pile = 1 / Math.sqrt(booms.length);
      const t = T + dist / 343, d = chain(vol * (0.7 + R / 20) * 0.6 * pile, dist, 0.8), big = R >= 8;
      noise(d, t, 0.03, 'highpass', 3000, 0.6, 1);                                   // the crack of the blast front
      noise(d, t, big ? 2.4 : 1.6, 'lowpass', 260, 0.7, 1.2, 0.004, brown);           // the body
      noise(d, t, 0.8, 'bandpass', 900, 0.5, 0.5);
      tone(d, t, big ? 1.6 : 1.1, 'sine', 70, 24, 1);                                  // sub drop
      for (let i = 0; i < (big ? 14 : 8); i++) { const at = t + 0.35 + Math.random() * 1.6; noise(d, at, 0.05 + Math.random() * 0.08, 'bandpass', 1500 + Math.random() * 3000, 4, 0.08 + Math.random() * 0.12); } // debris coming down
      noise(d, t + 0.9 + dist / 900, 2.6, 'lowpass', 160, 0.7, 0.35, 0.3, brown);    // rolling back off the hills
    },
    ricochet(v = 1) { const t = now(), d = chain(v * 0.6, 0, 0.5), f0 = 2600 + Math.random() * 1800; tone(d, t, 0.28, 'sine', f0, f0 * 0.45, 0.25); noise(d, t, 0.05, 'highpass', 4000, 1, 0.2); },
    glass(v = 1) { const t = now(), d = chain(v, 0, 0.4); noise(d, t, 0.45, 'highpass', 6000, 0.7, 0.5); for (let i = 0; i < 9; i++) tone(d, t + Math.random() * 0.25, 0.12 + Math.random() * 0.2, 'sine', 3000 + Math.random() * 5000, 0, 0.05 + Math.random() * 0.05); },
    crunch(v = 1) { // metal on metal: low body, resonant sweeps, clanks; glass if it was hard
      const t = now(), d = chain(v, 0, 0.35);
      noise(d, t, 0.5, 'lowpass', 500, 0.8, 0.9, 0.003, brown);
      for (let i = 0; i < 3; i++) { const f = noise(d, t + i * 0.03, 0.3, 'bandpass', 600 + Math.random() * 900, 9, 0.35); f.frequency.exponentialRampToValueAtTime(250 + Math.random() * 200, t + 0.3); }
      for (let i = 0; i < 4; i++) tone(d, t + 0.05 + Math.random() * 0.25, 0.18, 'square', 180 + Math.random() * 300, 90, 0.08);
      if (v > 0.7) api.glass(v * 0.7);
    },
    step(surface = 'asphalt', v = 1) {
      const t = now(), d = chain(v * 0.35, 0, 0.1);
      if (surface === 'grass') { noise(d, t, 0.09, 'lowpass', 900, 0.7, 0.5, 0.01); noise(d, t, 0.06, 'highpass', 4000, 0.6, 0.12, 0.01); }
      else if (surface === 'dirt') noise(d, t, 0.1, 'bandpass', 700, 0.8, 0.6, 0.005);
      else { noise(d, t, 0.05, 'bandpass', 1800 + Math.random() * 600, 1.2, 0.5); tone(d, t, 0.05, 'sine', 120, 60, 0.25); }
    },
    ui(kind = 'tick') { const t = now(), d = chain(0.25, 0, 0); if (kind === 'tick') tone(d, t, 0.03, 'sine', 2200, 1800, 0.12); else if (kind === 'click') { tone(d, t, 0.06, 'triangle', 900, 600, 0.25); noise(d, t, 0.03, 'highpass', 5000, 1, 0.1); } else if (kind === 'back') tone(d, t, 0.09, 'triangle', 600, 380, 0.22); },
  };
  // ---- loops: engine, tyre screech, wind
  const L = {};
  function loop(name, make) { if (!L[name]) L[name] = make(); return L[name]; }
  api.engine = (speed, thr, on) => {
    const E = loop('engine', () => {
      const g = AC.createGain(); g.gain.value = 0; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
      const o1 = AC.createOscillator(), o2 = AC.createOscillator(), o3 = AC.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o3.type = 'sine';
      const g2 = AC.createGain(); g2.gain.value = 0.35; const g3 = AC.createGain(); g3.gain.value = 0.6;
      o1.connect(f); o2.connect(g2).connect(f); o3.connect(g3).connect(g); f.connect(g).connect(out);
      const n = AC.createBufferSource(); n.buffer = nb; n.loop = true; const nf = AC.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 500; nf.Q.value = 1.5; const ng = AC.createGain(); ng.gain.value = 0; n.connect(nf).connect(ng).connect(out);
      for (const o of [o1, o2, o3]) o.start(); n.start();
      return { g, f, o1, o2, o3, ng, nf, gear: 1, rpm: 900 };
    });
    const t = now(), sp = Math.abs(speed), R = [0, 9, 16, 24, 33, 44]; // shift points (m/s) for gears 1..5
    let gear = 1; while (gear < 5 && sp > R[gear]) gear++;
    const lo = R[gear - 1], hi = R[gear], k = Math.min(1.15, (sp - lo) / (hi - lo + 1e-6)), rpm = on ? 900 + (gear === 1 ? sp / R[1] : k) * 5200 + thr * 400 : 0;
    if (gear !== E.gear && on) { E.g.gain.setTargetAtTime(0.02, t, 0.02); } E.gear = gear; // a dip at each shift
    E.rpm += (rpm - E.rpm) * 0.25;
    const f0 = Math.max(20, E.rpm / 60 * 2); // 4-cylinder: two pulses per revolution
    E.o1.frequency.setTargetAtTime(f0, t, 0.03); E.o2.frequency.setTargetAtTime(f0 * 0.5, t, 0.03); E.o3.frequency.setTargetAtTime(f0 * 0.5, t, 0.03);
    E.f.frequency.setTargetAtTime(300 + E.rpm * 0.25 + thr * 900, t, 0.05);
    E.g.gain.setTargetAtTime(on ? 0.05 + thr * 0.05 + E.rpm / 6000 * 0.03 : 0, t, 0.06);
    E.ng.gain.setTargetAtTime(on ? thr * 0.03 + sp * 0.0012 : 0, t, 0.1); E.nf.frequency.setTargetAtTime(400 + E.rpm * 0.2, t, 0.1);
  };
  api.screech = a => {
    const S = loop('screech', () => { const n = AC.createBufferSource(); n.buffer = nb; n.loop = true; const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 6; const g = AC.createGain(); g.gain.value = 0; n.connect(f).connect(g).connect(out); n.start(); return { f, g }; });
    const t = now(); S.g.gain.setTargetAtTime(Math.min(0.22, a * 0.22), t, 0.05); S.f.frequency.setTargetAtTime(1900 + Math.sin(t * 23) * 250 + a * 500, t, 0.02);
  };
  api.wind = a => {
    const W = loop('wind', () => { const n = AC.createBufferSource(); n.buffer = brown; n.loop = true; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; const g = AC.createGain(); g.gain.value = 0; n.connect(f).connect(g).connect(out); n.start(); return { f, g }; });
    const t = now(); W.g.gain.setTargetAtTime(Math.min(0.5, a * 0.5), t, 0.2); W.f.frequency.setTargetAtTime(300 + a * 1600, t, 0.2);
  };
  api.silence = () => { for (const k in L) { const x = L[k]; x.g.gain.setTargetAtTime(0, now(), 0.05); if (x.ng) x.ng.gain.setTargetAtTime(0, now(), 0.05); } };
  return api;
}
