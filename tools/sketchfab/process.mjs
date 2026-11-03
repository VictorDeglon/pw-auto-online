// Downloads a batch of Sketchfab models and fits each one for the game with Blender (tools/sketchfab/fit.py). The
// download is deleted once the model is fitted; only the game-sized GLB is kept.
//   node tools/sketchfab/process.mjs <jobs.json> [blender processes, default 2]
// jobs.json: [{ id, uid, url, kind, opts }]   out: assets/sf/<kind>/<id>.glb, build/sf/reports/<id>.json, build/sf/previews/<id>.png
// Downloads need a Sketchfab sign-in, so with SF_INBOX=<folder> the files come from a signed-in browser instead
// (tools/sketchfab/browser-dl.js saves them there as sf-<uid>.glb or .zip) and the jobs need no url. The run ends once
// every job is fitted or failed; uids listed in build/sf/inbox-failed.txt (the browser couldn't get them) count as failed,
// and once build/sf/inbox-done exists (the browser's queue is empty) so does every job whose file never came. The
// browser saves sf-inbox-failed.txt when its queue empties; move it to build/sf/inbox-failed.txt and touch inbox-done.
// SF_KEEP=1 keeps the downloads in build/sf/raw so SF_REFIT=1 can fit them again after a change to fit.py.
// tools/sketchfab/flips.json lists the uids of cars whose front the fitter got wrong (checked on the contact sheets).
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync, statSync, readdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..', '..');
const [jobsFile, par = '2'] = process.argv.slice(2);
const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
const RAW = join(ROOT, 'build/sf/raw'), REP = join(ROOT, 'build/sf/reports'), PREV = join(ROOT, 'build/sf/previews');
for (const d of [RAW, REP, PREV]) mkdirSync(d, { recursive: true });
const KEEP = !!process.env.SF_KEEP, REFIT = !!process.env.SF_REFIT;
const INBOX = process.env.SF_INBOX, GAVE_UP = join(ROOT, 'build/sf/inbox-failed.txt'), DONE = join(ROOT, 'build/sf/inbox-done');
const run = (cmd, args) => new Promise(res => { const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; }); p.on('close', code => res({ code, out })); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fromInbox(j, dl) { // waits for the browser's finished file (Chrome writes .crdownload until it's done)
  for (;;) {
    for (const ext of ['glb', 'zip']) {
      const f = join(INBOX, `sf-${j.uid}.${ext}`);
      if (existsSync(f)) { await run('mv', [f, dl]); return; }
      const link = f + '.txt'; // the browser's signed link (SFDL.handoff): fetched here, past Chrome's 6 connections a host
      if (existsSync(link)) {
        const url = readFileSync(link, 'utf8').trim(); unlinkSync(link);
        const r = await run('curl', ['-sSfL', '--retry', '3', '--max-time', '1800', '-o', dl, url]);
        if (r.code) throw new Error('download from the browser\'s link failed: ' + r.out.slice(0, 120));
        return;
      }
    }
    if (existsSync(GAVE_UP) && readFileSync(GAVE_UP, 'utf8').includes(j.uid)) throw new Error('the browser could not download it');
    if (existsSync(DONE)) { await sleep(10000); if (!['glb', 'zip'].some(e => existsSync(join(INBOX, `sf-${j.uid}.${e}`)))) throw new Error('never downloaded'); continue; }
    await sleep(3000);
  }
}

function inZip(dir) {
  const find = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? find(join(d, e.name)) : [join(d, e.name)]);
  const all = find(dir); return all.find(p => /\.glb$/i.test(p)) || all.find(p => /\.gltf$/i.test(p));
}

async function download(j) {
  const raw = join(RAW, j.uid);
  if (existsSync(raw + '.glb')) return raw + '.glb';
  if (existsSync(raw)) { const f = inZip(raw); if (f) return f; }
  if (INBOX) await fromInbox(j, raw + '.dl');
  else {
    const r = await run('curl', ['-sSfL', '--retry', '3', '--max-time', '900', '-o', raw + '.dl', j.url]);
    if (r.code) throw new Error('download failed: ' + r.out.slice(0, 200));
  }
  const head = readFileSync(raw + '.dl').subarray(0, 4).toString('latin1');
  if (head === 'glTF') { await run('mv', [raw + '.dl', raw + '.glb']); return raw + '.glb'; }
  if (head.startsWith('PK')) { // a zip: the .glb (or a .gltf with its files) inside
    mkdirSync(raw, { recursive: true }); await run('unzip', ['-qo', raw + '.dl', '-d', raw]); unlinkSync(raw + '.dl');
    const f = inZip(raw); if (!f) throw new Error('no glb/gltf in the zip'); return f;
  }
  throw new Error('not a glb or zip: ' + JSON.stringify(head));
}

const FLIPS = new Set(existsSync(join(ROOT, 'tools/sketchfab/flips.json')) ? JSON.parse(readFileSync(join(ROOT, 'tools/sketchfab/flips.json'), 'utf8')) : []);
async function fit(j, file) {
  if (FLIPS.has(j.uid)) j = { ...j, opts: { ...j.opts, flip: true } }; // its front was checked by eye
  const outDir = join(ROOT, 'assets/sf', j.kind); mkdirSync(outDir, { recursive: true });
  const out = join(outDir, j.id + '.glb');
  const blend = opts => run('blender', ['-b', '--factory-startup', '--python', join(ROOT, 'tools/sketchfab/fit.py'), '--', file, out, j.kind === 'car' ? 'car' : j.kind === 'person' ? 'person' : j.kind,
    JSON.stringify(opts), join(REP, j.id + '.json'), join(PREV, j.id + '.png')]);
  let r = await blend(j.opts || {});
  if (!/FIT_OK|Traceback/.test(r.out)) r = await blend({ ...j.opts, draco: false }); // Blender crashed outright (the Draco encoder does, on some meshes): plain meshes instead
  if (!/FIT_OK/.test(r.out) || !existsSync(out)) throw new Error('fit failed: ' + r.out.split('\n').filter(l => /Error|Traceback|line \d+/.test(l)).slice(-6).join(' | '));
  return statSync(out).size;
}

const done = [], failed = [];
const dlQueue = [...jobs.filter(j => REFIT || !existsSync(join(ROOT, 'assets/sf', j.kind, j.id + '.glb')))];
const fitQueue = []; let downloading = 0, fitting = 0, left = dlQueue.length;
console.log(`${left} to do (${jobs.length - left} already fitted)`);
await new Promise(resolve => {
  if (!left) return resolve();
  const pump = () => {
    while (downloading < (INBOX ? Infinity : 4) && dlQueue.length && fitQueue.length < 6) { // the browser's order isn't ours, so wait on every file at once
      const j = dlQueue.shift(); downloading++;
      download(j).then(f => { fitQueue.push([j, f]); }, e => { failed.push([j.id, e.message]); console.log('FAIL', j.id, e.message); left--; })
        .finally(() => { downloading--; pump(); if (!left) resolve(); });
    }
    while (fitting < +par && fitQueue.length) {
      const [j, f] = fitQueue.shift(); fitting++;
      fit(j, f).then(sz => { done.push(j.id); console.log('OK', j.id, (sz / 1e6).toFixed(2) + ' MB'); }, e => { failed.push([j.id, e.message]); console.log('FAIL', j.id, e.message); })
        .finally(() => { if (!KEEP) { rmSync(join(RAW, j.uid), { recursive: true, force: true }); rmSync(join(RAW, j.uid + '.glb'), { force: true }); } fitting--; left--; pump(); if (!left) resolve(); });
    }
  };
  pump();
});
writeFileSync(jobsFile.replace(/\.json$/, '.result.json'), JSON.stringify({ done, failed }, null, 1));
console.log(`done ${done.length}, failed ${failed.length}`);
