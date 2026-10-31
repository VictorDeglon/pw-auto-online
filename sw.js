// The asset packs' service worker: every game file under assets/ and data/ (and poway-data.js) is answered from this
// computer once it has been downloaded, so a second visit loads from disk. assets-manifest.json (tools/packs/build.mjs)
// lists each file's content hash and where its bytes are in its pack, a zip on the asset host. The page (index.html,
// PACKS) tells this worker the manifest and the host, then asks it to stream the packs the loading screen needs, a few
// megabytes per request. A file the game asks for before its pack has streamed in is fetched by itself from its pack
// (a range request), and from this site (Firebase Hosting) when the host doesn't answer. Bytes are stored by content
// hash, so after an update only files whose hash changed download again; files no manifest lists any more are deleted.
const DATA = 'pao-packs', META = 'pao-packs-meta', KEEP = [DATA, META];
const KEY = h => '/__pack/' + h, MKEY = '/__pack/manifest';
const CHUNK = 6 << 20, GAP = 256 << 10; // bytes per streamed request; an already-stored run shorter than GAP is fetched again rather than splitting a request
const TYPES = { js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', glb: 'model/gltf-binary', gz: 'application/gzip', m4a: 'audio/mp4', mp3: 'audio/mpeg', ktx2: 'image/ktx2', bin: 'application/octet-stream', txt: 'text/plain' };
const typeOf = p => TYPES[p.slice(p.lastIndexOf('.') + 1).toLowerCase()] || 'application/octet-stream';
const PACKED = /^\/(assets\/|data\/|poway-data\.js$)/;

let S = null; // { man, host, files: Map(path -> entry), packs: [[entry...] by offset], have: Set(hash) }
let loading = null;
const inflight = new Map(); // hash -> Promise<Blob>
const cursor = [];
let hostDown = 0; // the host failed: until then, files come from this site
let store = null; const data = () => store || (store = caches.open(DATA));
const stats = { host: 0, origin: 0, local: 0, bytes: 0 };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('pao-packs') && !KEEP.includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

function index(man, host) {
  const files = new Map(), packs = man.packs.map(() => []);
  for (const [p, a] of Object.entries(man.files)) { const e = { p, pi: a[0], off: a[1], cs: a[2], size: a[3], m: a[4], h: a[5] }; files.set(p, e); packs[e.pi].push(e); }
  for (const l of packs) l.sort((a, b) => a.off - b.off);
  return { man, host, files, packs, have: null };
}
async function state() { // the last manifest this worker was told about (it survives the worker being stopped)
  if (S) return S;
  return loading || (loading = (async () => {
    const r = await (await caches.open(META)).match(MKEY); if (!r) return null;
    const { man, host } = await r.json(); S = index(man, host); return S;
  })().finally(() => { loading = null; }));
}
async function haveSet() {
  if (S.have) return S.have;
  const c = await data(), h = new Set();
  for (const r of await c.keys()) h.add(new URL(r.url).pathname.slice(8));
  return S.have = h;
}

// ---- answering the game
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin || !PACKED.test(u.pathname)) return;
  e.respondWith(answer(decodeURIComponent(u.pathname.slice(1)), r));
});
async function answer(path, req) {
  const s = await state().catch(() => null), e = s && s.files.get(path);
  if (!e) return fetch(req);
  let blob;
  const hit = await (await data()).match(KEY(e.h));
  if (hit) { blob = await hit.blob(); stats.local++; }
  else {
    try { blob = await fileOf(e); } catch (err) { console.warn('[packs]', path, err && err.message); return fetch(req); }
  }
  return respond(req, blob, path);
}
function respond(req, blob, path) {
  const type = typeOf(path), rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (rg && (rg[1] || rg[2])) { // <audio> asks for ranges
    const n = blob.size; let a = rg[1] ? +rg[1] : n - +rg[2], b = rg[1] && rg[2] ? +rg[2] : n - 1; a = Math.max(0, a); b = Math.min(n - 1, b);
    if (a > b) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${n}` } });
    return new Response(blob.slice(a, b + 1), { status: 206, headers: { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${n}`, 'Content-Length': String(b - a + 1), 'Accept-Ranges': 'bytes' } });
  }
  return new Response(blob, { headers: { 'Content-Type': type, 'Content-Length': String(blob.size), 'Accept-Ranges': 'bytes' } });
}

// ---- getting a file's bytes: from a stream already on its way, else its own range from the host, else this site
function fileOf(e) {
  let p = inflight.get(e.h); if (p) return p;
  p = (async () => {
    if (S.host && Date.now() > hostDown) {
      try {
        const r = await hostRange(S.man.packs[e.pi].f, e.off, e.off + e.cs - 1);
        const blob = await unpack(e, new Uint8Array(await r.arrayBuffer())); stats.host++; return blob;
      } catch (err) { if (!err.busy) hostFailed(err); }
    }
    const r = await fetch('/' + e.p.split('/').map(encodeURIComponent).join('/'));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const raw = new Uint8Array(await r.arrayBuffer()); stats.origin++;
    if (await hashOf(raw) === e.h) await keep(e, raw); // a copy that doesn't match the manifest (a deploy half done) is used, not kept
    return new Blob([raw]);
  })().finally(() => inflight.delete(e.h));
  inflight.set(e.h, p); return p;
}
function hostFailed(err) { hostDown = Date.now() + 60e3; console.warn('[packs] the asset host failed, using this site for a minute:', err && err.message || err); }
async function hostRange(file, a, b, signal) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12e3); // the headers, at least, within 12 s
  if (signal) signal.addEventListener('abort', () => ctl.abort());
  try {
    const r = await fetch(S.host + file, { headers: { Range: `bytes=${a}-${b}` }, cache: 'no-store', credentials: 'omit', signal: ctl.signal });
    if (r.status !== 206) throw Object.assign(new Error('host answered ' + r.status), { busy: r.status === 503 }); // 503: too many downloads at once there
    return r;
  } finally { clearTimeout(t); }
}
async function hashOf(raw) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', raw)); let s = ''; for (let i = 0; i < 6; i++) s += d[i].toString(16).padStart(2, '0'); return s; }
async function unpack(e, bytes) { // a zip entry's bytes (stored or deflated) -> checked and kept
  const raw = e.m === 8 ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : bytes;
  if (raw.length !== e.size || await hashOf(raw) !== e.h) throw new Error('bad bytes for ' + e.p);
  await keep(e, raw); return new Blob([raw]);
}
let full = false;
async function keep(e, raw) { // a full disk only means the file isn't kept: it is still served
  try { await (await data()).put(KEY(e.h), new Response(raw, { headers: { 'Content-Type': 'application/octet-stream' } })); }
  catch (err) { if (!full) console.warn('[packs] could not keep files:', err && err.message); full = true; return; }
  if (S.have) S.have.add(e.h); stats.bytes += raw.length;
}

// ---- streaming a pack: the next run of files it doesn't have yet, as one range request, each file kept as it arrives
function nextRun(pi) {
  const list = S.packs[pi], have = S.have, free = x => !have.has(x.h) && !inflight.has(x.h);
  let i = cursor[pi] || 0; while (i < list.length && !free(list[i])) i++;
  if (i >= list.length) { cursor[pi] = i; return null; }
  const run = [list[i]], a = list[i].off; let end = a + list[i].cs; i++;
  for (; i < list.length; i++) {
    const x = list[i]; if (x.off + x.cs - a > CHUNK) break;
    if (free(x)) { run.push(x); end = x.off + x.cs; continue; }
    let j = i; while (j < list.length && !free(list[j])) j++; // stored ones: skip them, unless they are a short hop
    if (j >= list.length || list[j].off - end > GAP || list[j].off + list[j].cs - a > CHUNK) break;
    i = j - 1;
  }
  cursor[pi] = i;
  return { a, b: end - 1, run };
}
async function streamRun(pi, port) {
  const R = nextRun(pi); if (!R) return { done: true };
  const waits = R.run.map(x => { let res, rej; const p = new Promise((a, b) => { res = a; rej = b; }); p.catch(() => {}); inflight.set(x.h, p); return { x, res, rej, p }; });
  const len = R.b - R.a + 1, buf = new Uint8Array(len); let got = 0, k = 0, lastP = 0, chain = Promise.resolve(), rd = null;
  const settle = w => { inflight.delete(w.x.h); };
  try {
    const r = await hostRange(S.man.packs[pi].f, R.a, R.b); rd = r.body.getReader();
    for (;;) {
      let t; const stall = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('the download stalled')), 20e3); });
      const { done, value } = await Promise.race([rd.read(), stall]).finally(() => clearTimeout(t));
      if (done) break;
      buf.set(value, got); got += value.length;
      while (k < waits.length && waits[k].x.off + waits[k].x.cs - R.a <= got) { // files that are complete: unpack and keep them, in order
        const w = waits[k++], s = w.x.off - R.a; chain = chain.then(() => unpack(w.x, buf.subarray(s, s + w.x.cs))).then(w.res, w.rej).finally(() => settle(w));
      }
      const now = Date.now(); if (port && now - lastP > 250) { lastP = now; port.postMessage({ p: got }); }
    }
    if (got < len) throw new Error('short read');
    await chain;
    return { done: false, bytes: len };
  } catch (err) {
    if (rd) rd.cancel().catch(() => {});
    for (const w of waits.slice(k)) { w.rej(err); settle(w); }
    await chain.catch(() => {}); cursor[pi] = 0;
    if (err.busy) { await new Promise(r => setTimeout(r, 4000)); return { done: false, bytes: 0 }; } // the host is busy: try again shortly
    hostFailed(err);
    return { done: true, err: String(err && err.message || err) };
  }
}

// ---- the page's calls (index.html PACKS): { t: 'config' | 'step' | 'clean' | 'stats' }, answered on the message port
self.addEventListener('message', e => {
  const m = e.data || {}, port = e.ports[0]; if (!port) return;
  const work = (async () => {
    if (m.t === 'config') return config(m);
    if (!await state()) return { err: 'no manifest' };
    await haveSet();
    if (m.t === 'step') return Date.now() < hostDown || !S.host ? { done: true, err: 'host down' } : streamRun(m.pack, port);
    if (m.t === 'clean') return clean();
    if (m.t === 'stats') return Object.assign({ have: S.have.size, inflight: inflight.size, hostDown: Date.now() < hostDown }, stats);
    return { err: 'unknown call' };
  })().then(r => port.postMessage(r), err => port.postMessage({ err: String(err && err.message || err) }));
  e.waitUntil(work);
});
async function config({ manifest, host }) {
  let man = null;
  try { const r = await fetch(manifest, { cache: 'no-cache' }); if (r.ok) man = await r.json(); } catch (e) { }
  const prev = await state().catch(() => null);
  if (!man) { if (!prev) return { err: 'no manifest' }; man = prev.man; } // offline: the last one
  if (host && !host.endsWith('/')) host += '/';
  if (!prev || prev.man.id !== man.id || prev.host !== (host || null)) {
    await (await caches.open(META)).put(MKEY, new Response(JSON.stringify({ man, host: host || null }), { headers: { 'Content-Type': 'application/json' } }));
    const old = S && S.have; S = index(man, host || null); S.have = old; cursor.length = 0;
  }
  const have = await haveSet(); // the host isn't asked anything here: the first streamed request finds out whether it's there
  const packs = S.man.packs.map((p, i) => {
    let miss = 0, n = 0; for (const x of S.packs[i]) if (!have.has(x.h)) { miss += x.cs; n++; }
    return { i, n: p.n, get: p.get, size: p.s, miss, missN: n };
  });
  return { id: man.id, host: !!S.host && Date.now() > hostDown, packs, have: have.size, files: S.files.size };
}
async function clean() { // files the current manifest doesn't list
  const c = await data(), want = new Set(); for (const e of S.files.values()) want.add(e.h);
  let n = 0; for (const r of await c.keys()) { const h = new URL(r.url).pathname.slice(8); if (!want.has(h)) { await c.delete(r); S.have.delete(h); n++; } }
  return { removed: n };
}
