// Builds the asset packs: zip files of everything under assets/ and data/ (plus poway-data.js), grouped by
// tools/packs/packs.json, and assets-manifest.json, the list the game's service worker (sw.js) reads. Each file in the
// manifest has its content hash and where its bytes sit inside its pack, so a player's browser fetches a whole pack in
// a few big range requests on a first visit, and after an update only the files whose hash changed.
//
//   node tools/packs/build.mjs            writes build/packs/<name>-<hash>.zip and assets-manifest.json
//   node tools/packs/build.mjs --check    builds in memory and says whether assets-manifest.json would change
//   (tools/packs/check.mjs is the quick check the deploy runs: the manifest's hashes against the files)
//
// Packs are deterministic (fixed dates, sorted or recorded order, fixed deflate level), so the same files give the
// same pack name. Files that compress by less than 8 % are stored. tools/packs/README.md has the rest.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const CONF = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/packs/packs.json'), 'utf8'));
const ORDER = JSON.parse(fs.readFileSync(path.join(ROOT, CONF.order), 'utf8'));
const OUT = path.join(ROOT, 'build/packs'), MANIFEST = path.join(ROOT, 'assets-manifest.json');
const check = process.argv.includes('--check');

// ---- the files: what Firebase Hosting would publish under the packed roots (no dotfiles, no Markdown)
const files = [];
function walk(rel) {
  const abs = path.join(ROOT, rel), st = fs.statSync(abs, { throwIfNoEntry: false }); if (!st) return;
  if (st.isFile()) { files.push(rel); return; }
  for (const n of fs.readdirSync(abs).sort()) { if (n.startsWith('.') || n.endsWith('.md')) continue; walk(rel ? rel + '/' + n : n); }
}
for (const r of CONF.roots) walk(r);

// ---- which pack each file goes in: a recorded load order first (boot, later), then the first matching prefix
const packOf = new Map(), lists = CONF.packs.map(() => []);
CONF.packs.forEach((p, i) => { if (!p.from) return; for (const f of ORDER[p.from] || []) if (!packOf.has(f) && files.includes(f)) { packOf.set(f, i); lists[i].push(f); } });
for (const f of files) {
  if (packOf.has(f)) continue;
  const i = CONF.packs.findIndex(p => p.match && p.match.some(m => f.startsWith(m)));
  if (i < 0) throw new Error('no pack for ' + f);
  packOf.set(f, i); lists[i].push(f);
}

// ---- zip writing (stored or deflated entries, UTF-8 names, 1980-01-01 dates, no extra fields)
const STORE = /\.(jpe?g|png|webp|gz|m4a|mp3|ogg|zip|ktx2|woff2?)$/i;
const crc32 = zlib.crc32 || (() => { const T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } return (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }; })();
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
function packZip(list) {
  const parts = [], central = [], ents = []; let off = 0;
  for (const rel of list) {
    const raw = fs.readFileSync(path.join(ROOT, rel)), name = Buffer.from(rel, 'utf8');
    let data = raw, method = 0;
    if (!STORE.test(rel) && raw.length > 1024) { const d = zlib.deflateRawSync(raw, { level: 9, memLevel: 9 }); if (d.length < raw.length * 0.92) { data = d; method = 8; } }
    const crc = crc32(raw), hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(DOS_DATE, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(DOS_DATE, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    ents.push([rel, off + 30 + name.length, data.length, raw.length, method, hash]);
    parts.push(lh, name, data); off += 30 + name.length + data.length;
    if (off > 0xffffffff - (1 << 24) || ents.length > 65000) throw new Error('pack too big for zip32: split it in packs.json');
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(ents.length, 8); end.writeUInt16LE(ents.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return { buf: Buffer.concat([...parts, cd, end]), ents };
}

// ---- build
const manifest = { v: 1, id: '', packs: [], files: {} };
let total = 0;
CONF.packs.forEach((p, i) => {
  if (!lists[i].length) return;
  const { buf, ents } = packZip(lists[i]);
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12), file = `${p.name}-${hash}.zip`;
  const pi = manifest.packs.length; manifest.packs.push({ n: p.name, f: file, s: buf.length, get: p.get || 'lazy' });
  for (const [rel, ...e] of ents) manifest.files[rel] = [pi, ...e];
  if (!check) { fs.mkdirSync(OUT, { recursive: true }); const dst = path.join(OUT, file); if (!fs.existsSync(dst)) { fs.writeFileSync(dst + '.tmp', buf); fs.renameSync(dst + '.tmp', dst); } }
  total += buf.length;
  console.log(`${file.padEnd(34)} ${String(ents.length).padStart(5)} files ${(buf.length / 1048576).toFixed(1).padStart(7)} MB  (${p.get || 'lazy'})`);
});
manifest.id = crypto.createHash('sha256').update(JSON.stringify(manifest.packs)).digest('hex').slice(0, 12);
const text = JSON.stringify(manifest).replace(/\],"/g, '],\n"').replace('"files":{', '"files":{\n') + '\n'; // a line a file: readable diffs
console.log(`${manifest.packs.length} packs, ${Object.keys(manifest.files).length} files, ${(total / 1048576).toFixed(1)} MB, manifest ${manifest.id}`);
if (check) { const cur = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, 'utf8') : ''; if (cur !== text) { console.log('assets-manifest.json is out of date: run node tools/packs/build.mjs'); process.exit(1); } console.log('assets-manifest.json is up to date'); }
else fs.writeFileSync(MANIFEST, text);
