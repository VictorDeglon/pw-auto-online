// The game's own songs (assets/music): the theme and the exploring music. The car radio's own songs are a station in
// index.html (STATIONS).
//   theme    'Descent into Luxury', looped on the main menu (after the loading screen) and the pause screen
//   explore  'Sunset Freeway' and 'California Twilight', on foot, taking turns, with quiet spells between them
// Plain <audio> elements (they stream; the songs are a few MB each), faded by hand.
//   const M = createMusic()   M.theme(on)   M.explore(on)   M.update(dt)   M.volume = 0..1
export const OWN = {
  theme: { title: 'Descent into Luxury', file: 'assets/music/Descent_into_Luxury.m4a' },
  explore: [{ title: 'Sunset Freeway', file: 'assets/music/Sunset_Freeway.m4a' }, { title: 'California Twilight', file: 'assets/music/California_Twilight.m4a' }],
  radio: [{ title: 'Out of Pocket', file: 'assets/music/Out_of_Pocket.m4a', electro: true }, { title: "California Dreamin'", file: 'assets/music/California_Dreamin.m4a' },
    { title: 'Bad Investment', file: 'assets/music/Bad_Investment.m4a' }],
};
export function createMusic() {
  const mk = (src, loop) => { const a = new Audio(); a.preload = 'none'; a.loop = loop; a.src = src; a.volume = 0; return a; };
  const T = { el: mk(OWN.theme.file, true), want: 0, level: 0, peak: 0.55 };
  const E = { el: null, want: 0, level: 0, peak: 0.32, i: Math.floor(Math.random() * 2), restT: 6, on: false };
  const M = { volume: 1 };
  const play = el => { const p = el.play(); if (p && p.catch) p.catch(() => { }); };
  M.theme = on => { T.want = on ? 1 : 0; if (on && T.el.paused) { if (T.el.currentTime > 200) T.el.currentTime = 0; play(T.el); } };
  M.explore = on => { E.on = on; if (!on) E.want = 0; };
  M.playing = () => !T.el.paused || (E.el && !E.el.paused);
  M.update = dt => {
    // the theme fades in over a second and a half, out over two
    T.level += Math.max(-dt / 2, Math.min(dt / 1.5, T.want - T.level)); T.el.volume = Math.max(0, Math.min(1, T.level * T.peak * M.volume));
    if (T.level <= 0.001 && !T.el.paused && !T.want) T.el.pause();
    // exploring: a song, then a quiet spell (the world gets to be heard), then the other song
    if (E.on && !T.want) {
      if (!E.el || E.el.ended || (E.el.paused && E.want === 0 && E.level <= 0.001)) {
        E.restT -= dt;
        if (E.restT <= 0) { const t = OWN.explore[E.i++ % OWN.explore.length]; if (E.el) E.el.pause(); E.el = mk(t.file, false); E.el.addEventListener('ended', () => { E.want = 0; E.restT = 40 + Math.random() * 50; }); play(E.el); E.want = 1; }
      }
    } else E.want = 0;
    if (E.el) { E.level += Math.max(-dt / 3, Math.min(dt / 4, E.want - E.level)); E.el.volume = Math.max(0, Math.min(1, E.level * E.peak * M.volume)); if (E.level <= 0.001 && !E.want && !E.el.paused) { E.el.pause(); if (!E.el.ended) E.restT = 12 + Math.random() * 20; } }
  };
  return M;
}
