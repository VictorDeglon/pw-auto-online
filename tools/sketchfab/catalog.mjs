// Builds the game's list of Sketchfab models (assets/sf/catalog.json, read by src/sf.js) and the credits file
// (assets/sf/CREDITS.md) from the picks (tools/sketchfab/curate.mjs) and the fitter's reports (tools/sketchfab/fit.py).
// Only models that came out of the fitter are listed.
//   node tools/sketchfab/catalog.mjs build/sf/cars.json build/sf/things.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { speedOf } from './speeds.mjs';
import { gameName } from './names.mjs';

const REJECTS = new Set(JSON.parse(readFileSync('tools/sketchfab/rejects.json', 'utf8'))); // struck out on the contact sheets, after fitting too
const picks = process.argv.slice(2).flatMap(f => existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : []).filter(p => !REJECTS.has(p.uid));
const r2 = v => Math.round(v * 100) / 100;
const cars = [], things = [];
for (const p of picks) {
  const file = `${p.kind}/${p.id}.glb`, rep = `build/sf/reports/${p.id}.json`;
  if (!existsSync(`assets/sf/${file}`) || !existsSync(rep)) continue;
  const R = JSON.parse(readFileSync(rep, 'utf8'));
  const base = { id: p.id, n: p.n, a: p.a, l: p.l, u: p.u, f: file, L: r2(R.L), W: r2(R.W), H: r2(R.H) };
  if (p.kind === 'car') {
    if (R.L < 2.4 || R.L > 7.5 || R.H > 3.2 || R.W > 2.8) { console.log('skip (size)', p.id, R.L, R.W, R.H); continue; }
    let t = p.type; // the size has the last word: a 1.4 m tall "truck" is a car, a 1.9 m tall "sedan" an SUV
    if ((t === 'pickup' || t === 'suv') && R.H < 1.5) t = R.H < 1.3 ? 'sports' : 'sedan';
    if (t === 'sedan' && R.H > 1.75) t = R.L > 5.2 ? 'pickup' : 'suv';
    const ws = Object.values(R.wheels || {}), r = ws.length ? ws.reduce((a, w) => a + w.r, 0) / ws.length : 0.34;
    cars.push({ ...base, g: gameName(p.n, t, p.id), t, tier: p.tier, r: r2(r), w: ws.length === 4 ? 1 : 0, p: R.paint ? 1 : 0, ...speedOf(p.n, t, p.tier) }); // g: its showroom name (names.mjs); v, ac: its top speed and pull (speeds.mjs)
  } else things.push({ ...base, k: p.kind, q: p.q, ...(R.anims && R.anims.length ? { an: R.anims } : {}) });
}
writeFileSync('assets/sf/catalog.json', JSON.stringify({ v: 1, cars, things }));
const LIC = { 'CC0': 'CC0 1.0', 'CC-BY': 'CC BY 4.0', 'CC-BY-SA': 'CC BY-SA 4.0', 'CC-BY-NC': 'CC BY-NC 4.0' };
const KIND = { car: 'Cars', vehicle: 'Other vehicles', person: 'People', statue: 'Statues and monuments', prop: 'Street and city props', building: 'Buildings, shops and interiors', plant: 'Trees and plants', clothes: 'Clothes' };
const all = [...cars.map(c => ({ ...c, k: 'car' })), ...things];
let md = `# Sketchfab models\n\nEvery model in this folder comes from Sketchfab under the licence listed with it. Each one was changed for the game\n` +
  `by \`tools/sketchfab/fit.py\`: resized to real scale, simplified, its textures shrunk and re-encoded as WebP, its mesh\n` +
  `Draco-compressed; cars also had their wheels split out and their paint, glass and lamp materials renamed. The game\n` +
  `doesn't name the real makers; their names appear in these credits only.\n\nCC BY-NC models are used non-commercially: the game is free, with no ads or paid items.\n`;
for (const [k, title] of Object.entries(KIND)) {
  const list = all.filter(e => e.k === k).sort((a, b) => a.n.localeCompare(b.n)); if (!list.length) continue;
  md += `\n## ${title} (${list.length})\n\n| File | Model | Author | Licence |\n| --- | --- | --- | --- |\n`;
  for (const e of list) md += `| \`${e.f}\` | [${e.n.replace(/\|/g, '/')}](${e.u}) | ${e.a.replace(/\|/g, '/')} | ${LIC[e.l] || e.l} |\n`;
}
writeFileSync('assets/sf/CREDITS.md', md);
console.log(`catalogue: ${cars.length} cars, ${things.length} other models`);
