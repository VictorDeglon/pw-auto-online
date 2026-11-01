// Picks the models to download from the harvest (tools/sketchfab/harvest.mjs): the best liked of each kind, no more
// than a few of any one car or search term, cars sorted into the game's types (src: CAR in index.html) and price tiers.
// Writes the pick (with each model's fit options) and a contact sheet of thumbnails for checking by eye.
//   node tools/sketchfab/curate.mjs <candidates.json...> --out build/sf/pick.json [--cars 400] [--things 1000] [--drop uid,uid]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const OUT = opt('--out') || 'build/sf/pick.json', NCARS = +(opt('--cars') || 400), NTHINGS = +(opt('--things') || 1000);
const DROP = new Set((opt('--drop') || '').split(',').filter(Boolean).concat(existsSync('tools/sketchfab/rejects.json') ? JSON.parse(readFileSync('tools/sketchfab/rejects.json', 'utf8')) : []));
const SIZES = JSON.parse(readFileSync(join(dirname(new URL(import.meta.url).pathname), 'sizes.json'), 'utf8'));
const all = {}; for (const f of files) Object.assign(all, JSON.parse(readFileSync(f, 'utf8')));
const C = Object.values(all).filter(m => !DROP.has(m.uid));

// ---------------------------------------------------------------- cars: type and tier from the title and tags
const T = m => `${m.name} ${m.tags.join(' ')}`.toLowerCase();
const TYPE = [
  ['police', /police|sheriff|\bcop\b|patrol|interceptor|highway patrol|\bchp\b|squad car|polizei|policia/],
  ['pickup', /pick-?up|\btruck\b|f-?1[05]0|f-?250|silverado|sierra|tacoma|tundra|\bram\b|ranger|hilux|el camino|colorado|frontier|\btitan\b|cybertruck|\bute\b|\bc-?10\b|\bf-?100\b/],
  ['van', /\bvan\b|minivan|transit|sprinter|caravan|odyssey|sienna|kombi|vw bus|microbus|econoline|\bt[12]\b bus|\bbus\b/],
  ['suv', /\bsuv\b|jeep|wrangler|cherokee|land ?cruiser|4runner|tahoe|suburban|escalade|explorer|bronco|range ?rover|land ?rover|defender|g-?wagon|g-?class|\bg63\b|\bg ?5[05]0\b|cayenne|rav4|cr-?v|\bx[567]\b|xc90|hummer|crossover|4x4|off-?road|blazer|durango|expedition|navigator|yukon|pathfinder|highlander|forester|tucson|santa fe|sportage|tiguan|touareg|\bq[578]\b|\bgle\b|\bglc\b|model [xy]\b|\burus\b|bentayga|cullinan|discovery|fj cruiser|pajero|lc\d{2,3}/],
  ['sports', /sport|super ?car|hyper ?car|ferrari|lamborghini|lambo|mclaren|bugatti|pagani|koenigsegg|\b911\b|porsche|corvette|viper|mustang|camaro|challenger|charger|supra|skyline|gt-?r\b|\bnsx\b|rx-?[78]\b|miata|mx-?5|roadster|convertible|cabrio|spider|spyder|coupe|\bgt[234]\b|amg gt|\br8\b|\blfa\b|ford gt|gt40|cobra|shelby|muscle|hot ?rod|drift|rally|silvia|s2000|350z|370z|240sx|\bbrz\b|\bgt86\b|type r|lancer evo|\bwrx\b|\bsti\b|\bz4\b|\bm[234]\b|f-?type|aston|lotus|alpine|zonda|huracan|aventador|murcielago|gallardo|countach|diablo|testarossa|\bf40\b|\bf50\b|enzo|laferrari|chiron|veyron|senna|\bp1\b|720s|570s|firebird|trans ?am|\bgto\b|chevelle|\bnova\b|cuda|road ?runner|delorean|\bdb[579]\b|vantage|\bsl\b|slr|sls/],
];
const TIER3 = /ferrari|lamborghini|lambo|mclaren|bugatti|pagani|koenigsegg|rolls|bentley|aston|maybach|zonda|huracan|aventador|murcielago|chiron|veyron|senna|laferrari|enzo|\bf40\b|\bf50\b|\blfa\b|ford gt|gt40|918|carrera gt|hyper ?car|super ?car|cullinan|\burus\b|sf90|\b488\b|\b458\b|\b812\b|countach|diablo|testarossa|\bslr\b|sls|db11|vanquish/;
const TIER2 = /bmw|mercedes|benz|amg|audi|porsche|lexus|tesla|cadillac|lincoln|range ?rover|land ?rover|maserati|jaguar|infiniti|acura|genesis|volvo|escalade|g-?wagon|corvette|model [sxy3]\b|lucid|rivian|alfa|\bm[2345]\b|\brs ?\d\b|\bs-?class|e-?class|7 series|5 series|viper|shelby|nsx|gt-?r\b/;
const TIER0 = /\b19[5-8]\d\b|\b[5-8]0s\b|beetle|\blada\b|punto|\bfiat\b|yugo|trabant|panda|datsun|chevette|pinto|old|used|beater|dirty|\bkei\b|micra|\bfit\b|yaris|versa|aveo|\bspark\b|smart|\b2cv\b|\bmini\b|reliant|kia rio|accent|corolla|civic|sentra|focus|fiesta|cobalt|cavalier|neon|taurus|crown vic|impala|caprice|buick|oldsmobile|plymouth|mercury|geo metro|tercel|camry|corsa|clio|golf/;
function carType(m) { // the title first: tags like 'truck' sit on sports cars too
  const n = m.name.toLowerCase(); for (const [ty, re] of TYPE) if (re.test(n)) return ty;
  const t = T(m); for (const [ty, re] of TYPE) if (re.test(t)) return ty; return 'sedan';
}
function carTier(m) { const t = T(m); return TIER3.test(t) ? 3 : TIER2.test(t) ? 2 : TIER0.test(t) ? 0 : 1; }
const LEN = { sedan: 4.7, suv: 4.8, pickup: 5.5, sports: 4.5, van: 5.0, police: 5.0 };

// one model of a car per author, two of any car overall: "Ford Mustang GT 2018 (Blue) FREE" and "ford mustang gt 2018" are one car
const key = m => m.name.toLowerCase().replace(/\(.*?\)|\[.*?\]|free|low ?poly|game ?ready|realistic|high ?poly|3d model|model|pbr|\bv\d\b|version|\d{4}|[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !/^(the|car|by|and|with|blue|red|black|white|grey|gray|silver|green|yellow|orange|edition)$/.test(w)).slice(0, 3).join(' ');
function pickCars() {
  const NOT = /\bpack\b|\bset\b|collection|\bkit\b|scene|environment|diorama|garage|showroom|\broad\b|landscape|chassis|\bframe\b|untextured|\bwip\b|monster truck|military|\barmou?red\b|apocalyp|zombie|\bwire\b|\bmotor\b|generator|\bnpc\b|vehicles\b|\bcars\b|crash|snow|buggy frame|rock crawler|trophy truck|derby|wreck|\bbox truck|\btopkick|kamaz|\bural\b|oshkosh|\bm-?atv\b|infantry|tactical|subway|wagon wheel|\bcart\b|stall|gas pump|gas station|bridge|\bcity\b/;
  const RIP = new RegExp(readFileSync(join(dirname(new URL(import.meta.url).pathname), 'harvest.mjs'), 'utf8').match(/const RIP = \/(.*)\/i;/)[1], 'i');
  const cars = C.filter(m => m.kinds.includes('car') && !NOT.test(m.name.toLowerCase()) && !RIP.test(T(m))).map(m => ({ ...m, type: carType(m), tier: carTier(m), k: key(m) })).sort((a, b) => b.score - a.score);
  const want = { sedan: 105, suv: 80, sports: 110, pickup: 50, van: 25, police: 30 }, got = {}, perKey = {}, perKeyAuthor = new Set(), out = [];
  const take = (m, cap) => {
    if (perKeyAuthor.has(m.k + '|' + m.user) || (perKey[m.k] || 0) >= cap) return false;
    perKey[m.k] = (perKey[m.k] || 0) + 1; perKeyAuthor.add(m.k + '|' + m.user); got[m.type] = (got[m.type] || 0) + 1; out.push(m); return true;
  };
  for (const m of cars) if ((got[m.type] || 0) < want[m.type]) take(m, 2);
  for (const m of cars) { if (out.length >= NCARS) break; if (!out.includes(m)) take(m, 2); }
  return out.slice(0, NCARS).map(m => ({ id: slug(m), uid: m.uid, kind: 'car', q: m.q, type: m.type, tier: m.tier, opts: { tris: m.tier >= 2 ? 40000 : 30000, tex: 1024, len: LEN[m.type] } }));
}

// ---------------------------------------------------------------- everything else: the best few of each search term
const QUOTA = { vehicle: 120, prop: 270, building: 245, plant: 120, statue: 95, person: 160, clothes: 30 }; // people run short (few are usable): the others make up the thousand
const PER_Q = { vehicle: 3, prop: 4, building: 3, plant: 4, statue: 5, person: 6, clothes: 3 };
const TRIS = { vehicle: 20000, prop: 4000, building: 15000, plant: 12000, statue: 12000, person: 20000, clothes: 6000 };
const TEX = { vehicle: 1024, prop: 512, building: 1024, plant: 1024, statue: 1024, person: 1024, clothes: 512 };
// not the game's look (realistic, real scale) or not what was asked for; people must be grown-ups in everyday clothes
const JUNK = /anime|manga|chibi|cartoon|\btoon|stylized|stylised|low ?-?poly|voxel|pixel|minecraft|lego|\bscene\b|diorama|\bset\b|\bpack\b|collection|\bkit\b|bundle|\bufo\b|alien|sci-?fi|fantasy|dragon|monster|creepy|horror|zombie|demon|\bdoll\b|\bgirl|\bboy\b|\bkids?\b|child|teen|loli|waifu|vtuber|vroid|vrchat|\bmmd\b|miku|cyberpunk|steampunk|\bmech\b|robot|\btank\b|military|weapon|\bgun\b|sword|viking|medieval|castle|dungeon|ruins?\b|fire emblem|genshin|honkai|blue archive|touhou|azur lane|arknights|nikke|hover|futuristic|concept|wip\b|untitled|test\b|draft|\bbase ?mesh|sculpt(ing)? ?practice|study\b|warhammer|halloween|christmas|xmas|space|planet|\bisland\b|terrain|landscape|room\b|city\b|town\b|village|level\b|map\b|garnet|quartz|rhyolite|sandstone|sediment|plagioclase|\bdyke\b|seismite|formation|mineral|crystal|specimen|fossil|geolog|japan|chinese|korean|soviet|ussr|russian|hello neighbor|clothespin|chicken|bucket|pizza box|bust of|bellydance|stupa|sphinx/i;
const ALLOW = { statue: /war memorial|sculpture|monument|room\b|space/i, building: /room\b|town\b|city\b/i };
const GENERIC = new Set(['tree', 'plant', 'unit', 'machine', 'interior', 'shop', 'store', 'house', 'building', 'man', 'woman', 'worker', 'statue', 'sign', 'box', 'table', 'chair', 'truck', 'boat']);
function relevant(m) { // a word of its search term (other than the generic ones) in its title or tags
  const words = m.q.toLowerCase().split(/[\s-]+/).filter(w => w.length > 2 && !GENERIC.has(w)), text = T(m);
  if (!words.length) return text.includes(m.q.toLowerCase().split(' ').pop());
  return words.some(w => text.includes(w.replace(/s$/, '')));
}
function pickThings(taken) {
  const out = [];
  const RIP = new RegExp(readFileSync(join(dirname(new URL(import.meta.url).pathname), 'harvest.mjs'), 'utf8').match(/const RIP = \/(.*)\/i;/)[1], 'i');
  for (const kind of Object.keys(QUOTA)) {
    const list = C.filter(m => m.kinds[0] === kind && !taken.has(m.uid) && relevant(m) && !RIP.test(T(m)) && !(JUNK.test(m.name) && !(ALLOW[kind] && ALLOW[kind].test(m.name)))).sort((a, b) => b.score - a.score);
    const perQ = {}, keys = new Set(), mine = [];
    for (const m of list) { // round one: a few per term; round two: fill the quota from the best left
      const k = key(m); if (keys.has(k + '|' + m.user) || (perQ[m.q] || 0) >= PER_Q[kind]) continue;
      keys.add(k + '|' + m.user); perQ[m.q] = (perQ[m.q] || 0) + 1; mine.push(m); if (mine.length >= QUOTA[kind]) break;
    }
    for (const m of list) { if (mine.length >= QUOTA[kind]) break; if (!mine.includes(m) && !keys.has(key(m) + '|' + m.user)) { keys.add(key(m) + '|' + m.user); mine.push(m); } }
    for (const m of mine) out.push({ id: slug(m), uid: m.uid, kind, q: m.q, opts: { tris: TRIS[kind], tex: TEX[kind], size: SIZES[m.q] || (kind === 'person' ? ['h', 1.75] : ['h', 1]) } });
  }
  return out.slice(0, NTHINGS);
}
function slug(m) { return (m.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'model') + '-' + m.uid.slice(0, 6); }

const cars = pickCars(), things = pickThings(new Set(cars.map(c => c.uid)));
const pick = [...cars, ...things];
for (const p of pick) { const m = all[p.uid]; Object.assign(p, { n: m.name, a: m.author, l: m.licence, u: m.url, mb: m.mb, faces: m.faces, thumb: m.thumb }); }
mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, JSON.stringify(pick, null, 0));
const by = {}; for (const p of pick) { const k = p.kind === 'car' ? 'car:' + p.type : p.kind; by[k] = (by[k] || 0) + 1; }
console.log(pick.length, 'picked', by, 'download', Math.round(pick.reduce((a, p) => a + p.mb, 0) / 1000) + ' GB');
// contact sheet: numbered thumbnails, for striking out what isn't right (tools/sketchfab/rejects.json)
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const html = `<!doctype html><meta charset=utf-8><title>pick</title><style>body{margin:0;background:#111;color:#ddd;font:11px system-ui}div{display:grid;grid-template-columns:repeat(8,1fr);gap:2px}figure{margin:0;position:relative}img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}figcaption{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);padding:1px 3px;white-space:nowrap;overflow:hidden}b{color:#fc6}</style><div>` +
  pick.map((p, i) => `<figure id="p${i}"><img loading=lazy src="${esc(p.thumb)}"><figcaption><b>${i}</b> ${esc(p.kind === 'car' ? p.type + p.tier : p.kind)} ${esc(p.n)}</figcaption></figure>`).join('') + '</div>';
writeFileSync(OUT.replace(/\.json$/, '.html'), html);
