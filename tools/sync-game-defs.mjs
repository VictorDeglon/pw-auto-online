// Copies the shared block of src/games/defs.js (between BEGIN SHARED and END SHARED) into server/nakama/index.js,
// so the game and the server judge the crew-garage games from the same data.
//   node tools/sync-game-defs.mjs           write it
//   node tools/sync-game-defs.mjs --check   exit 1 if the server's copy is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src/games/defs.js'), DST = join(root, 'server/nakama/index.js');
const B = '// BEGIN SHARED', E = '// END SHARED';
const block = s => { const a = s.indexOf(B), b = s.indexOf(E); if (a < 0 || b < a) throw new Error('no shared block'); return [a, b + E.length]; };
const src = readFileSync(SRC, 'utf8'), dst = readFileSync(DST, 'utf8');
const [a, b] = block(src), [c, d] = block(dst);
const want = src.slice(a, b), have = dst.slice(c, d);
if (process.argv.includes('--check')) {
  if (want !== have) { console.error('server/nakama/index.js has an old copy of src/games/defs.js: run node tools/sync-game-defs.mjs'); process.exit(1); }
  console.log('in sync');
} else if (want === have) console.log('already in sync');
else { writeFileSync(DST, dst.slice(0, c) + want + dst.slice(d)); console.log('copied the shared defs into server/nakama/index.js'); }
