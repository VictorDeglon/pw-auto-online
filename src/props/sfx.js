// Synthesized prop sounds (WebAudio, no samples). Every function returns true when it actually played,
// false when there is no AudioContext, so callers can fall back to on-screen text.
// getAC() -> AudioContext|null, getOut(ac) -> AudioNode|null (defaults to ac.destination).

export function createSynth(getAC, getOut, volume = 0.7) {
  let ac = null, master = null, noiseBuf = null;

  function ready() {
    let a = null;
    try { a = getAC(); } catch (e) { a = null; }
    if (!a) return null;
    if (a !== ac) {
      ac = a; noiseBuf = null;
      master = ac.createGain(); master.gain.value = volume;
      let out = null; try { out = getOut && getOut(ac); } catch (e) { out = null; }
      master.connect(out || ac.destination);
    }
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) { /* needs a user gesture */ } }
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ac;
  }

  // envelope on a gain param: attack to peak, hold, release to silence
  function env(p, t, peak, a, hold, r) {
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + Math.max(a, 0.005));
    p.setValueAtTime(Math.max(peak, 0.0002), t + a + hold);
    p.exponentialRampToValueAtTime(0.0001, t + a + hold + Math.max(r, 0.01));
    return a + hold + r;
  }

  // filtered noise burst. o: {dur, type, f, f2, q, gain, a, r, delay, lfo, lfoDepth, out}
  function noise(o) {
    const t = ac.currentTime + (o.delay || 0);
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); f.Q.value = o.q ?? 0.8;
    const len = (o.a ?? 0.02) + (o.dur ?? 0.3) + (o.r ?? 0.1);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + len);
    const g = ac.createGain();
    env(g.gain, t, o.gain ?? 0.3, o.a ?? 0.02, o.dur ?? 0.3, o.r ?? 0.1);
    let tail = g;
    if (o.lfo) { // amplitude wobble (gurgle, buzz)
      const am = ac.createGain(); am.gain.value = 1 - (o.lfoDepth ?? 0.5);
      const l = ac.createOscillator(); l.frequency.value = o.lfo;
      const ld = ac.createGain(); ld.gain.value = o.lfoDepth ?? 0.5;
      l.connect(ld).connect(am.gain); l.start(t); l.stop(t + len + 0.05);
      g.connect(am); tail = am;
    }
    s.connect(f).connect(g); tail.connect(o.out || master);
    s.start(t, Math.random() * 1.5); s.stop(t + len + 0.05);
  }

  function tone(o) {
    const t = ac.currentTime + (o.delay || 0);
    const osc = ac.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    const len = (o.a ?? 0.005) + (o.dur ?? 0.1) + (o.r ?? 0.05);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + len);
    const g = ac.createGain(); env(g.gain, t, o.gain ?? 0.2, o.a ?? 0.005, o.dur ?? 0.1, o.r ?? 0.05);
    let node = osc;
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g).connect(o.out || master);
    osc.start(t); osc.stop(t + len + 0.05);
  }

  const DTMF = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477],
    7: [852, 1209], 8: [852, 1336], 9: [852, 1477], '*': [941, 1209], 0: [941, 1336], '#': [941, 1477] };

  const S = {
    ok: () => !!ready(),
    setVolume(v) { volume = v; if (master) master.gain.value = v; },

    // toilet / urinal flush: rushing whoosh, gurgle, then refill hiss
    flush(v = 1, short = false) {
      if (!ready()) return false;
      const k = short ? 0.55 : 1;
      noise({ type: 'bandpass', f: 1400, f2: 380, q: 0.6, gain: 0.55 * v, a: 0.04, dur: 1.4 * k, r: 1.6 * k });
      noise({ type: 'lowpass', f: 320, q: 1, gain: 0.5 * v, a: 0.3, dur: 1.6 * k, r: 0.8, delay: 0.4, lfo: 7, lfoDepth: 0.7 });
      noise({ type: 'highpass', f: 2600, q: 0.5, gain: 0.07 * v, a: 0.6, dur: 2.5 * k, r: 1.2, delay: 2.2 * k });
      tone({ f: 140, f2: 70, type: 'sine', gain: 0.18 * v, a: 0.02, dur: 0.05, r: 0.3 });
      return true;
    },
    // running tap
    water(dur = 3, v = 1) {
      if (!ready()) return false;
      noise({ type: 'bandpass', f: 2400, q: 0.5, gain: 0.22 * v, a: 0.12, dur, r: 0.35 });
      noise({ type: 'bandpass', f: 700, q: 1.2, gain: 0.12 * v, a: 0.12, dur, r: 0.3, lfo: 13, lfoDepth: 0.3 });
      return true;
    },
    drink(v = 1) {
      if (!ready()) return false;
      noise({ type: 'bandpass', f: 1800, q: 0.7, gain: 0.14 * v, a: 0.08, dur: 1.1, r: 0.2 });
      for (let i = 0; i < 3; i++) tone({ f: 190, f2: 110, type: 'sine', gain: 0.25 * v, dur: 0.06, r: 0.08, delay: 0.35 + i * 0.32 });
      return true;
    },
    // hand dryer: jet noise + motor whine
    dryer(dur = 3, v = 1) {
      if (!ready()) return false;
      noise({ type: 'bandpass', f: 1600, q: 0.35, gain: 0.45 * v, a: 0.35, dur, r: 0.6 });
      noise({ type: 'lowpass', f: 400, q: 0.7, gain: 0.25 * v, a: 0.3, dur, r: 0.5 });
      tone({ f: 180, f2: 210, type: 'sawtooth', gain: 0.05 * v, a: 0.4, dur, r: 0.6, lp: 700 });
      return true;
    },
    click(v = 1) {
      if (!ready()) return false;
      noise({ type: 'highpass', f: 3500, gain: 0.25 * v, a: 0.002, dur: 0.01, r: 0.03 });
      tone({ f: 1900, type: 'square', gain: 0.05 * v, dur: 0.008, r: 0.02 });
      return true;
    },
    // sheet-metal door: clank with a couple of metallic partials
    clank(v = 1) {
      if (!ready()) return false;
      noise({ type: 'bandpass', f: 2600, q: 3, gain: 0.35 * v, a: 0.003, dur: 0.03, r: 0.18 });
      tone({ f: 310, type: 'triangle', gain: 0.22 * v, dur: 0.02, r: 0.35 });
      tone({ f: 873, type: 'sine', gain: 0.1 * v, dur: 0.02, r: 0.25 });
      tone({ f: 1547, type: 'sine', gain: 0.06 * v, dur: 0.01, r: 0.18 });
      return true;
    },
    coin(v = 1) {
      if (!ready()) return false;
      tone({ f: 2637, type: 'sine', gain: 0.12 * v, dur: 0.03, r: 0.15 });
      tone({ f: 3520, type: 'sine', gain: 0.08 * v, dur: 0.03, r: 0.2, delay: 0.07 });
      noise({ type: 'bandpass', f: 5000, q: 4, gain: 0.08 * v, dur: 0.04, r: 0.08, delay: 0.25 });
      return true;
    },
    thunk(v = 1) {
      if (!ready()) return false;
      tone({ f: 110, f2: 55, type: 'sine', gain: 0.35 * v, dur: 0.04, r: 0.2 });
      noise({ type: 'lowpass', f: 500, gain: 0.25 * v, dur: 0.03, r: 0.12 });
      return true;
    },
    whirr(dur = 0.9, v = 1) {
      if (!ready()) return false;
      tone({ f: 120, f2: 150, type: 'sawtooth', gain: 0.09 * v, a: 0.05, dur, r: 0.1, lp: 650 });
      noise({ type: 'bandpass', f: 900, q: 2, gain: 0.05 * v, a: 0.05, dur, r: 0.1, lfo: 22, lfoDepth: 0.6 });
      return true;
    },
    tear(v = 1) {
      if (!ready()) return false;
      noise({ type: 'bandpass', f: 3200, q: 0.9, gain: 0.3 * v, a: 0.01, dur: 0.25, r: 0.08, lfo: 55, lfoDepth: 0.9 });
      return true;
    },
    // US dial tone (350 + 440 Hz)
    dial(dur = 1.2, v = 1, delay = 0) {
      if (!ready()) return false;
      tone({ f: 350, gain: 0.07 * v, a: 0.01, dur, r: 0.02, delay });
      tone({ f: 440, gain: 0.07 * v, a: 0.01, dur, r: 0.02, delay });
      return true;
    },
    dtmf(digits, v = 1, delay = 0) {
      if (!ready()) return false;
      [...String(digits)].forEach((c, i) => {
        const p = DTMF[c]; if (!p) return;
        for (const f of p) tone({ f, gain: 0.07 * v, a: 0.005, dur: 0.1, r: 0.01, delay: delay + i * 0.17 });
      });
      return true;
    },
    // US ringback (440 + 480 Hz, 2 s on 4 s off)
    ringback(times = 2, v = 1, delay = 0) {
      if (!ready()) return false;
      for (let i = 0; i < times; i++) for (const f of [440, 480]) tone({ f, gain: 0.05 * v, a: 0.01, dur: 1.9, r: 0.05, delay: delay + i * 4 });
      return true;
    },
    hiss(dur = 2, v = 1) {
      if (!ready()) return false;
      noise({ type: 'highpass', f: 1800, q: 0.5, gain: 0.45 * v, a: 0.03, dur, r: 0.3 });
      noise({ type: 'bandpass', f: 600, q: 0.7, gain: 0.15 * v, a: 0.03, dur, r: 0.3 });
      return true;
    },
    gush(dur = 6, v = 1) {
      if (!ready()) return false;
      noise({ type: 'lowpass', f: 900, q: 0.6, gain: 0.5 * v, a: 0.25, dur, r: 1 });
      noise({ type: 'bandpass', f: 2600, q: 0.5, gain: 0.18 * v, a: 0.3, dur, r: 1, lfo: 9, lfoDepth: 0.35 });
      return true;
    },
    creak(v = 1) {
      if (!ready()) return false;
      tone({ f: 170, f2: 120, type: 'sawtooth', gain: 0.05 * v, a: 0.03, dur: 0.25, r: 0.1, lp: 1100 });
      return true;
    },
    beep(f = 1400, v = 1, delay = 0) {
      if (!ready()) return false;
      tone({ f, type: 'square', gain: 0.06 * v, dur: 0.08, r: 0.02, delay, lp: 3000 });
      return true;
    },
    // dry-erase marker squeaks
    squeak(v = 1) {
      if (!ready()) return false;
      for (let i = 0; i < 4; i++) tone({ f: 2100 + Math.random() * 900, f2: 2600 + Math.random() * 700, type: 'triangle', gain: 0.035 * v, a: 0.01, dur: 0.07 + Math.random() * 0.08, r: 0.03, delay: i * 0.2 + Math.random() * 0.06, lp: 5000 });
      noise({ type: 'bandpass', f: 4200, q: 2, gain: 0.05 * v, a: 0.02, dur: 0.8, r: 0.05 });
      return true;
    },
    // PA attention chime (two-tone ding-dong)
    chime(v = 1) {
      if (!ready()) return false;
      tone({ f: 784, type: 'sine', gain: 0.16 * v, a: 0.005, dur: 0.05, r: 1.2 });
      tone({ f: 1568, type: 'sine', gain: 0.03 * v, a: 0.005, dur: 0.05, r: 0.6 });
      tone({ f: 622, type: 'sine', gain: 0.16 * v, a: 0.005, dur: 0.05, r: 1.5, delay: 0.55 });
      tone({ f: 1244, type: 'sine', gain: 0.03 * v, a: 0.005, dur: 0.05, r: 0.7, delay: 0.55 });
      return true;
    },
    page(v = 1) { // paper rustle
      if (!ready()) return false;
      noise({ type: 'highpass', f: 2500, gain: 0.18 * v, a: 0.02, dur: 0.12, r: 0.1, lfo: 30, lfoDepth: 0.8 });
      return true;
    },
    // fire alarm horn, temporal-3 pattern. Returns {stop(), gain} or null.
    alarm(dur = 20, v = 1) {
      if (!ready()) return null;
      const out = ac.createGain(); out.gain.value = v; out.connect(master);
      const t0 = ac.currentTime + 0.05;
      for (let c = 0; c * 4 < dur; c++) for (let b = 0; b < 3; b++) {
        const delay = c * 4 + b * 1 + 0.05;
        if (delay > dur) break;
        tone({ f: 470, type: 'sawtooth', gain: 0.16, a: 0.01, dur: 0.48, r: 0.02, delay, lp: 2200, out });
        tone({ f: 940, type: 'square', gain: 0.06, a: 0.01, dur: 0.48, r: 0.02, delay, lp: 3000, out });
        noise({ type: 'bandpass', f: 3100, q: 6, gain: 0.08, a: 0.01, dur: 0.48, r: 0.02, delay, lfo: 60, lfoDepth: 0.8, out });
      }
      return { gain: out.gain, stop() { try { out.gain.setValueAtTime(0, ac.currentTime); out.disconnect(); } catch (e) { /* gone */ } }, t0 };
    },
  };
  return S;
}
