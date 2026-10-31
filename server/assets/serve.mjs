// The asset host: serves the asset packs (build/packs/*.zip, tools/packs/build.mjs) to players' browsers. Plain Node,
// no packages. Range requests (the game fetches a few megabytes of a pack at a time, or one file), CORS for the game's
// site, a year's cache for the packs (their names carry their content hash) and no-cache for anything else.
//
//   node serve.mjs --dir <packs dir> [--port 7360] [--host 127.0.0.1] [--prefix /packs] [--rate <MB/s>]
//
// --rate caps what all downloads together send, so they leave room on the uplink for the game server (and anything
// else on it); players then just download more slowly.
// Requests may come with the --prefix (a path-mounted proxy that doesn't strip it) or without. Every 10 minutes it
// logs one line with the requests and bytes sent since the last; it never logs addresses. server/assets/README.md.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { Transform } from 'node:stream';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DIR = path.resolve(arg('dir', '.')), PORT = +arg('port', 7360), HOST = arg('host', '127.0.0.1'), PREFIX = arg('prefix', '/packs');
const RATE = +arg('rate', 0) * 1048576; // bytes a second for everyone together, 0 = no cap
const MAX_STREAMS = 96; // open responses at once; more get 503 (the game retries later, or uses the game's site)
const HASHED = /-[0-9a-f]{12}\.zip$/;
const TYPES = { zip: 'application/zip', json: 'application/json', txt: 'text/plain; charset=utf-8' };
let open = 0, bucket = 0, filled = Date.now(); const tally = { req: 0, bytes: 0, ranges: 0, busy: 0, miss: 0 };

function paced() { // a pass-through that holds chunks back while the shared bucket is empty
  return new Transform({ transform(c, _, cb) {
    const go = () => { const now = Date.now(); bucket = Math.min(RATE / 4, bucket + (now - filled) / 1000 * RATE); filled = now;
      if (bucket >= Math.min(c.length, RATE / 8)) { bucket -= c.length; cb(null, c); } else setTimeout(go, 20); };
    go();
  } });
}
function base(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, ETag');
  res.setHeader('Timing-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
const server = http.createServer((req, res) => {
  tally.req++; base(res);
  if (req.method === 'OPTIONS') { // preflight for the Range header
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Max-Age': '86400' }); res.end(); return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD, OPTIONS' }); res.end(); return; }
  let p; try { p = decodeURIComponent(new URL(req.url, 'http://h').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
  if (PREFIX && (p === PREFIX || p.startsWith(PREFIX + '/'))) p = p.slice(PREFIX.length);
  const name = p.replace(/^\/+/, '');
  if (name === 'health') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end('ok'); return; }
  if (!/^[\w.-]+$/.test(name) || name.startsWith('.')) { tally.miss++; res.writeHead(404); res.end(); return; } // flat folder, no paths
  const file = path.join(DIR, name);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { tally.miss++; res.writeHead(404, { 'Cache-Control': 'no-cache' }); res.end(); return; }
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const h = { 'Content-Type': TYPES[path.extname(name).slice(1)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', ETag: etag,
      'Last-Modified': st.mtime.toUTCString(), 'Cache-Control': HASHED.test(name) ? 'public, max-age=31536000, immutable' : 'no-cache' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); res.end(); return; }
    let a = 0, b = st.size - 1, status = 200;
    const rg = req.headers.range;
    if (rg && (!req.headers['if-range'] || req.headers['if-range'] === etag)) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(rg.trim()); // one range; anything else gets the whole file
      if (m && (m[1] || m[2])) {
        if (m[1]) { a = +m[1]; if (m[2]) b = Math.min(+m[2], st.size - 1); } else a = Math.max(0, st.size - +m[2]);
        if (a > b || a >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); res.end(); return; }
        status = 206; h['Content-Range'] = `bytes ${a}-${b}/${st.size}`; tally.ranges++;
      }
    }
    h['Content-Length'] = b - a + 1;
    if (req.method === 'HEAD') { res.writeHead(status, h); res.end(); return; }
    if (open >= MAX_STREAMS) { tally.busy++; res.writeHead(503, { 'Retry-After': '5', 'Cache-Control': 'no-store' }); res.end(); return; }
    open++; res.writeHead(status, h);
    const s = fs.createReadStream(file, { start: a, end: b, highWaterMark: 256 << 10 });
    s.on('data', c => { tally.bytes += c.length; });
    (RATE ? s.pipe(paced()) : s).pipe(res);
    s.on('error', () => res.destroy()); res.on('close', () => { open--; s.destroy(); });
  });
});
server.keepAliveTimeout = 30e3; server.headersTimeout = 20e3; server.requestTimeout = 0;
server.listen(PORT, HOST, () => console.log(new Date().toISOString(), 'asset host serving', DIR, 'on', `${HOST}:${PORT}`, 'prefix', PREFIX || '(none)', RATE ? `capped at ${RATE / 1048576} MB/s` : ''));
setInterval(() => {
  if (!tally.req) return;
  console.log(new Date().toISOString(), `${tally.req} requests, ${tally.ranges} ranges, ${(tally.bytes / 1048576).toFixed(1)} MB sent, ${tally.miss} not found, ${tally.busy} turned away, ${open} open`);
  for (const k in tally) tally[k] = 0;
}, 600e3).unref();
