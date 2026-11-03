// Pasted into a signed-in sketchfab.com tab (downloads need a sign-in). Saves each model to the browser's download
// folder as sf-<uid>.glb (the smallest GLB whose textures are still `min` px or more) or sf-<uid>.zip (glTF, when
// there's no GLB), four at a time, for tools/sketchfab/process.mjs with SF_INBOX set to that folder.
//   SFDL.add(['uid', ...], min = 1024)   SFDL.stat()   SFDL.failed: uids it gave up on, with why
// Keep it to one tab, in front: Chrome freezes and discards background tabs. Sketchfab answers too many requests (two
// a model; it also keeps a quota over a longer window) with 429s, which the queue waits out with growing pauses, so
// more tabs don't go faster. SFDL.name names the failed list it saves. When the computer runs short of memory Chrome
// discards even the front tab (it comes back with a new id and no SFDL): reload it and add what's still missing.
// A dropped connection pauses everything and retries (for up to about an hour) instead of failing the queue, and a
// request that hangs (it happens after a network change) times out and is retried.
// SFDL.handoff = true saves only the signed file link, as sf-<uid>.glb.txt, for process.mjs to fetch with curl
// (Chrome opens six connections to a host at most, across all tabs); each tab then hands over about `rate` bytes a
// second, since the links expire five minutes after they're made.
window.SFDL = window.SFDL || (() => {
  const D = { name: '', queue: [], active: 0, done: 0, bytes: 0, failed: [], max: 4, gap: 4000, last: 0, pause: 0, handoff: false, rate: 2e6, limited: 0 };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pref = min => v => { const t = v.textureMaxResolution || 99999; return t >= min ? t : 200000 - t; };
  const offline = e => e instanceof TypeError || e.name === 'TimeoutError' || e.name === 'AbortError';
  async function net(f) { // a network error or a timeout (not an HTTP status) waits for the connection to come back
    for (let tries = 0; ; tries++) {
      try { return await f(); } catch (e) {
        if (!offline(e) || tries >= 60) throw e;
        D.pause = Math.max(D.pause, Date.now() + 60000); await sleep(60000);
      }
    }
  }
  async function json(url) {
    for (let tries = 0; ; tries++) {
      const wait = Math.max(D.last + D.gap, D.pause) - Date.now(); if (wait > 0) await sleep(wait); D.last = Date.now();
      const r = await net(() => fetch(url, { credentials: 'include', signal: AbortSignal.timeout(60000) }));
      if (r.status === 429) { D.limited++; D.pause = Date.now() + 60000 * 2 ** Math.min(tries, 4); continue; } /* a quota: wait it out */
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }
  }
  async function one([uid, min]) {
    const { latest: L = {} } = await json(`/i/models/${uid}/download`);
    let pick = null, ext = 'glb';
    if (L.glb) pick = Object.values(L.glb).sort((a, b) => pref(min)(a) - pref(min)(b))[0];
    else if (L.gltf) { pick = Object.values(L.gltf)[0]; ext = 'zip'; }
    if (!pick) throw new Error('no glb or gltf');
    const { url, size } = await json(pick.url);
    if (D.handoff) {
      const a = document.createElement('a'), href = URL.createObjectURL(new Blob([url + '\n'], { type: 'text/plain' }));
      a.href = href; a.download = `sf-${uid}.${ext}.txt`; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
      D.bytes += size || 0; await sleep((size || 1e7) / D.rate * D.max * 1000); return;
    }
    const blob = await net(async () => {
      const r = await fetch(url, { signal: AbortSignal.timeout(900000) }); if (!r.ok) throw new Error('file HTTP ' + r.status); return r.blob();
    });
    const a = document.createElement('a'), href = URL.createObjectURL(blob);
    a.href = href; a.download = `sf-${uid}.${ext}`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 180000);
    D.bytes += blob.size;
  }
  D.pump = () => {
    while (D.active < D.max && D.queue.length) {
      const job = D.queue.shift(), uid = job[0]; D.active++;
      one(job).then(() => { D.done++; }, e => { if ((job[2] = (job[2] || 0) + 1) < 3) D.queue.push(job); else D.failed.push([uid, String(e.message || e)]); })
        .finally(() => { D.active--; D.pump(); });
    }
  };
  D.add = (list, min = 1024) => { D.queue.push(...list.map(u => Array.isArray(u) ? u : [u, min])); D.pump(); return D.queue.length; };
  D.watch = D.watch || setInterval(() => { // the queue's empty: save what failed as sf-inbox-failed[-name].txt, for process.mjs
    if (D.queue.length || D.active || !D.done && !D.failed.length) return; clearInterval(D.watch);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([D.failed.map(f => f.join(' ')).join('\n') + '\n']));
    a.download = `sf-inbox-failed${D.name ? '-' + D.name : ''}.txt`; document.body.append(a); a.click(); a.remove();
  }, 30000);
  D.stat = () => ({ name: D.name, done: D.done, active: D.active, queued: D.queue.length, failed: D.failed.length, limited: D.limited, mb: Math.round(D.bytes / 1e6) });
  return D;
})();
