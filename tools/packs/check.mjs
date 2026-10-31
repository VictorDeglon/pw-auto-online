// The deploy's check on the asset packs (firebase.json predeploy, tools/packs/publish.sh):
//   1. assets-manifest.json lists exactly the files being deployed, with their current content hashes. A stale
//      manifest would have players served the old packs' bytes for files that changed.
//   2. When the deploy's nakama.json names an asset host ("assets"), every pack the manifest names is on it, at its
//      size. Otherwise every first visit would come from Firebase. PACKS_SKIP_HOST=1 skips this part.
//   node tools/packs/check.mjs [site folder] [--no-host]
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';

const ROOT = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(path.dirname(new URL(import.meta.url).pathname), '../..'));
const CONF = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/packs/packs.json'), 'utf8'));
const fail = m => { console.error('packs: ' + m); process.exit(1); };
let man; try { man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets-manifest.json'), 'utf8')); } catch (e) { fail('no assets-manifest.json: run node tools/packs/build.mjs'); }

const files = [];
const walk = rel => { const abs = path.join(ROOT, rel), st = fs.statSync(abs, { throwIfNoEntry: false }); if (!st) return; if (st.isFile()) { files.push(rel); return; }
  for (const n of fs.readdirSync(abs).sort()) { if (n.startsWith('.') || n.endsWith('.md')) continue; walk(rel ? rel + '/' + n : n); } };
for (const r of CONF.roots) walk(r);
const listed = new Set(Object.keys(man.files)), bad = [];
for (const f of files) {
  const e = man.files[f]; if (!e) { bad.push('not in the manifest: ' + f); continue; } listed.delete(f);
  if (crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 12) !== e[5]) bad.push('changed since the manifest: ' + f);
}
for (const f of listed) bad.push('in the manifest but missing: ' + f);
if (bad.length) fail(`assets-manifest.json is out of date (${bad.length}): ${bad.slice(0, 5).join('; ')}${bad.length > 5 ? '; ...' : ''}. Run node tools/packs/build.mjs, then tools/packs/publish.sh, then deploy.`);
console.log(`packs: manifest ${man.id} matches all ${files.length} files`);

if (process.argv.includes('--no-host') || process.env.PACKS_SKIP_HOST) process.exit(0);
let host = null; try { host = JSON.parse(fs.readFileSync(path.join(ROOT, 'nakama.json'), 'utf8')).assets || null; } catch (e) { }
if (!host) { console.log('packs: no asset host in nakama.json: players load assets from this site'); process.exit(0); }
if (!host.endsWith('/')) host += '/';
const missing = [];
await Promise.all(man.packs.map(async p => {
  try { const r = await fetch(host + p.f, { method: 'HEAD', signal: AbortSignal.timeout(15000) }); if (!r.ok || +r.headers.get('content-length') !== p.s) missing.push(`${p.f} (${r.status})`); }
  catch (e) { missing.push(`${p.f} (${e.message})`); }
}));
if (missing.length) fail(`the asset host lacks ${missing.length} of ${man.packs.length} packs: ${missing.join(', ')}. Run tools/packs/publish.sh first (or PACKS_SKIP_HOST=1 to deploy anyway).`);
console.log(`packs: all ${man.packs.length} packs are on the asset host`);
