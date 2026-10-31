// Paste into the console of a game page that was loaded with an empty cache and packs off (?packs=0 on the live site,
// or a local copy), once the console has said "[later] everything in". It prints order.json: the packed files the game
// fetched before the loading screen ended (boot) and before the after-loading steps were done (later), in start order.
(() => {
  const mark = n => (performance.getEntriesByName(n)[0] || {}).startTime, ready = mark('pao:ready'), later = mark('pao:later');
  if (!ready || !later) return 'not loaded yet: wait for "[later] everything in"';
  const out = { boot: [], later: [] }, seen = new Set();
  for (const e of performance.getEntriesByType('resource').sort((a, b) => a.startTime - b.startTime)) {
    const u = new URL(e.name); if (u.origin !== location.origin) continue;
    const p = decodeURIComponent(u.pathname.slice(1)); if (!/^(assets\/|data\/|poway-data\.js$)/.test(p) || seen.has(p)) continue;
    seen.add(p); if (e.startTime < ready) out.boot.push(p); else if (e.startTime < later) out.later.push(p);
  }
  const text = JSON.stringify(out, null, 1); console.log(text); return text;
})();
