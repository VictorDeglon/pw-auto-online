// Finds downloadable Sketchfab models for the game through the public search API (no account needed to search).
// Each query runs once per allowed licence, best liked first, a few pages deep; results are filtered (licence, size,
// age restriction, rips from other games, things that aren't what was asked for), scored and de-duplicated.
//   node tools/sketchfab/harvest.mjs <plan.json> <out.json>
// plan.json: [{ "kind": "car", "q": ["sedan", ...], "cat": "cars-vehicles", "pages": 2, "faces": [3000, 400000], "drop": "regex" }, ...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [planFile, outFile] = process.argv.slice(2);
const PLAN = JSON.parse(readFileSync(planFile, 'utf8'));
const LICENCES = { cc0: 'CC0', by: 'CC-BY', 'by-sa': 'CC-BY-SA', 'by-nc': 'CC-BY-NC' };
// models lifted from other games (their makers hold the rights, whatever the upload says), and kits that aren't a whole thing
const RIP = /forza|\bfh[345]\b|\bgta\b|grand theft|need for speed|\bnfs\b|gran turismo|\bgt[ -]?(sport|7)\b|assetto|beamng|\bripp?ed\b|game ?rip|\brip\b|extracted|the crew|midnight club|burnout|test drive|driveclub|project cars|cyberpunk|rocket league|mario kart|roblox|fortnite|call of duty|battlefield|\bgtav?\b|euro truck|\bets ?2\b|car mechanic simulator|\bcms\b|my summer car|wreckfest|ridge racer|crazy taxi|watch ?dogs|mafia|saints row|half.?life|red orchestra|metal slug|postal ?2|zootopia|pixar|disney|inside out|lightning mcqueen|ghibli|star wars|marvel|transformers|fallout|borderlands|\bhalo\b|gears of war|left 4 dead|counter.?strike|cs:?go|team fortress|\btf2\b|pubg|apex legends|overwatch|valorant|genshin|zelda|pokemon|crash bandicoot|uncharted|last of us|days gone|death stranding|god of war|arkham|hitman|just cause|far cry|assassin'?s creed|ghost recon|rainbow six|dying light|dead island|resident evil|silent hill|metal gear|final fantasy|kingdom hearts|yakuza|shenmue|tekken|street fighter|mortal kombat|dark souls|elden ring|bloodborne|witcher|skyrim|starfield|wolfenstein|bioshock|stalker|metro 2033|metro exodus|tarkov|dayz|\barma ?[23]\b|subnautica|sea of thieves|mario|nintendo|unreal tournament|crysis|warzone|modern warfare|black ops|simpsons|futurama|scooby|ghostbusters|back to the future|fast (and|&) furious|knight rider|batmobile|mad max|spongebob|minions|paw patrol|cars 2|cars 3|fire emblem|genshin|honkai|blue archive|touhou|azur lane|arknights|nikke|vrchat|vroid|\bmmd\b|hatsune|miku|league of legends|dota|world of warcraft|\bwow\b|overwatch|fortnite|valorant|starcraft|hearthstone|sims ?[234]|animal crossing|splatoon|smash bros|kirby|metroid|persona [345]|danganronpa|jojo|naruto|one piece|dragon ball|demon slayer|attack on titan|my hero academia|evangelion|gundam|sailor moon|pokemon|digimon|yu-gi-oh|\bdriver\b ?(san francisco|parallel)|hot wheels unleashed|minecraft|lego/i;
const NSFW = /nsfw|nude|naked|sexy|hentai|lewd|ecchi|futa|porn|erotic|topless|lingerie|fetish|\bloli\b|\bbdsm\b|stripper|playboy/i;
const seen = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
const doneFile = outFile + '.done', done = new Set(existsSync(doneFile) ? JSON.parse(readFileSync(doneFile, 'utf8')) : []); // searches already run, so a stopped run picks up where it was
const GAP = +(process.env.GAP || 2500); // ms between requests: the API answers 429 above about one a second
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'pw-auto-online asset search' } }).catch(() => null);
    if (r && r.ok) return r.json();
    if (r && r.status === 429) process.stdout.write(`429, waiting ${60 * (i + 1)} s\n`);
    await sleep(r && r.status === 429 ? 60000 * (i + 1) : 3000 * (i + 1));
  }
  return null;
}

function keep(m, step) {
  const lic = m.license && Object.entries(LICENCES).find(([, v]) => v === licOf(m.license.label));
  if (!lic || !m.isDownloadable || m.isAgeRestricted) return false;
  const text = `${m.name} ${(m.tags || []).map(t => t.name).join(' ')} ${m.description || ''}`;
  if (RIP.test(text) || NSFW.test(text)) return false;
  if (step.drop && new RegExp(step.drop, 'i').test(`${m.name} ${(m.tags || []).map(t => t.name).join(' ')}`)) return false;
  if (step.need && !new RegExp(step.need, 'i').test(`${m.name} ${(m.tags || []).map(t => t.name).join(' ')}`)) return false;
  const [f0, f1] = step.faces || [200, 400000]; if (m.faceCount < f0 || m.faceCount > f1) return false;
  const glb = m.archives && m.archives.glb; if (!glb || !glb.size || glb.size > (step.maxMB || 90) * 1e6) return false;
  return true;
}
function licOf(label) {
  return { 'CC0 Public Domain': 'CC0', 'CC Attribution': 'CC-BY', 'CC Attribution-ShareAlike': 'CC-BY-SA', 'CC Attribution-NonCommercial': 'CC-BY-NC' }[label] || null;
}
function score(m) { // liked and looked at, a staff pick counts, very heavy or tiny meshes count less
  const likes = Math.log10(1 + m.likeCount) * 2 + Math.log10(1 + m.viewCount) * 0.6 + (m.staffpickedAt ? 1.5 : 0);
  const f = m.faceCount, heavy = f > 250000 ? 0.8 : f < 1500 ? 0.6 : 0;
  return +(likes - heavy).toFixed(3);
}

for (const step of PLAN) {
  for (const q of step.q) {
    for (const lic of step.lic || Object.keys(LICENCES)) {
      const tag = `${step.kind}|${q}|${lic}`; if (done.has(tag)) continue;
      let url = `https://api.sketchfab.com/v3/search?type=models&downloadable=true&count=24&sort_by=-likeCount${lic === 'any' ? '' : '&license=' + lic}&q=${encodeURIComponent(q)}` + (step.cat ? `&categories=${step.cat}` : '');
      for (let page = 0; page < (step.pages || 2) && url; page++) {
        const d = await get(url); await sleep(GAP); if (!d) break;
        let n = 0;
        for (const m of d.results || []) {
          if (seen[m.uid]) { if (!seen[m.uid].kinds.includes(step.kind)) seen[m.uid].kinds.push(step.kind); continue; }
          if (!keep(m, step)) continue; n++;
          const th = (m.thumbnails && m.thumbnails.images || []).filter(i => i.width >= 200).sort((a, b) => a.width - b.width)[0];
          seen[m.uid] = { uid: m.uid, name: m.name, author: m.user.displayName || m.user.username, user: m.user.username, licence: licOf(m.license.label),
            url: m.viewerUrl, faces: m.faceCount, likes: m.likeCount, views: m.viewCount, staff: !!m.staffpickedAt, mb: +(m.archives.glb.size / 1e6).toFixed(1),
            tex: m.archives.glb.textureMaxResolution || null, anim: m.animationCount || 0, tags: (m.tags || []).map(t => t.name).slice(0, 20),
            thumb: th && th.url, kinds: [step.kind], q, score: score(m) };
        }
        process.stdout.write(`${step.kind} "${q}" ${lic} p${page}: +${n}\n`);
        url = d.next;
      }
      done.add(tag);
    }
    writeFileSync(outFile, JSON.stringify(seen)); writeFileSync(doneFile, JSON.stringify([...done]));
  }
}
writeFileSync(outFile, JSON.stringify(seen));
console.log('total', Object.keys(seen).length);
