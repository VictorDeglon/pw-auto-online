// Each Sketchfab car's top speed and pull, from what the real one does: the first pattern its title matches gives its
// real top speed in mph, else its kind and price tier do. The game runs a little under real life (a Civic tops out
// near 87 mph, as the stock sedan did), so speeds are scaled by GAME and kept inside a range a street can take.
//   speedOf(title, type, tier) -> { v, ac }   the game's vmax and acc for it (index.html's CAR table, same units)
const GAME = 0.7, MIN_MPH = 42, MAX_MPH = 185, MPH_PER_V = 1.88; // CAR.sedan vmax 46 is about 87 mph flat out
const BASE = { sedan: [46, 11], suv: [42, 10], pickup: [42, 10.5], sports: [64, 17], van: [36, 8], police: [60, 16], bus: [30, 5] };
const TIER = { sports: [125, 140, 165, 195], sedan: [105, 115, 130, 150], suv: [100, 110, 125, 145], pickup: [95, 105, 115, 125], van: [85, 88, 92, 95], police: [125, 130, 140, 150] };
const REAL = [ // [pattern, real top speed in mph], most specific first
  [/bugatti/i, 261], [/koenigsegg one/i, 273], [/koenigsegg/i, 245], [/pininfarina/i, 217], [/apollo/i, 208], [/project one|amg one/i, 219],
  [/vulcan|valkyrie/i, 220], [/aventador|veneno|venevo|countach lpi/i, 217], [/huracan|gallardo/i, 202], [/countach/i, 183], [/urus/i, 190],
  [/mclaren (p1|senna)/i, 217], [/720s|765lt/i, 212], [/600lt|mp4-12c|mclaren spider|mclaren/i, 204], [/ferrari f40/i, 201], [/ferrari|enzo|laferrari/i, 200],
  [/c-x75/i, 220], [/de tomaso/i, 200], [/vision 6|maybach|avtr|pb18|vayanne|furai/i, 175], [/goblin|saba v12/i, 205],
  [/gt2 rs/i, 211], [/gt3 rs/i, 193], [/gt3/i, 197], [/cayman gt4/i, 188], [/930|porsche.*turbo/i, 155], [/rwb|993/i, 168], [/924/i, 150], [/porsche 911/i, 180], [/porsche/i, 170],
  [/r35|nissan gt-?r\b/i, 196], [/r34/i, 165], [/r32/i, 155], [/kenmeri|c110/i, 120], [/audi r8/i, 205],
  [/\bi8\b/i, 155], [/\bm8\b|\bm6\b|\bm5\b.*e34|e34.*\bm5\b/i, 160], [/\bm5\b/i, 190], [/m4 csl/i, 190], [/\bm4\b/i, 180], [/\bm3\b/i, 155], [/bmw.*e3[04]|e90|320i/i, 130],
  [/viper/i, 206], [/challenger srt|super stock|hellcat/i, 199], [/charger srt/i, 175], [/camaro zl1/i, 198], [/shelby/i, 155], [/mustang/i, 120],
  [/db11/i, 200], [/vantage/i, 186], [/lexus lc/i, 168], [/sc300/i, 145], [/300 ?sl/i, 160], [/stradale/i, 160],
  [/rolls|cullinan/i, 155], [/xe sv|project 8/i, 200], [/jaguar/i, 150], [/supra/i, 155], [/rx-?7 fd|\bfd\b/i, 155], [/rx-?7/i, 135],
  [/silvia|200sx|180sx|sileighty|s1[345]\b/i, 140], [/240z|fairlady|s30/i, 120], [/z proto/i, 155], [/ae86|trueno|levin|ae92/i, 115],
  [/type-?r|civic si/i, 145], [/eg6/i, 130], [/civic/i, 125], [/impreza|subaru|evolution|lancer evo/i, 150], [/miata|mx-?5/i, 125], [/mr2/i, 140], [/starion/i, 135],
  [/a45 amg/i, 168], [/g63|g-class|g550|w263/i, 137], [/trackhawk/i, 180], [/range rover/i, 140], [/levante/i, 155], [/x3 m40i/i, 155], [/navigator|escalade/i, 112],
  [/cupra/i, 150], [/cybertruck/i, 130], [/trx\b/i, 118], [/pikes peak/i, 160], [/silverado ev/i, 112], [/f-?150|silverado|titan|amarok|hilux|tacoma/i, 110], [/hummer/i, 100],
  [/model t\b/i, 45], [/model a\b/i, 65], [/willys|jeep mb|uaz|zet jeep|gaz|soviet jeep|m1009/i, 65], [/beetle|fusca|typ-?82|kdf/i, 72], [/fiat.*(500|126)|nuova 500|126p/i, 65],
  [/trabant/i, 62], [/vaz|lada|zhiguli/i, 90], [/t360|autolib/i, 65], [/s800/i, 100], [/spitfire/i, 95], [/tr6/i, 120], [/dolomite/i, 112], [/cobra/i, 138],
  [/karlmann/i, 87], [/bollinger/i, 100], [/zis-101/i, 70], [/cord 812|1930s|1936/i, 90], [/postal/i, 55], [/sprinter|hiace|alphard|town & country|step-van/i, 95],
  [/interceptor|highway patrol|police|cop cruiser/i, 135],
  [/19[0-3]\d|'[0-3]\d\b/i, 70], [/194\d|'4\d\b/i, 85], [/195\d|'5\d\b/i, 100], [/196\d|'6\d\b/i, 112], [/197\d|'7\d\b/i, 115],
];
export function speedOf(title, type, tier) {
  const hit = REAL.find(([re]) => re.test(title || ''));
  const real = hit ? hit[1] : (TIER[type] || TIER.sedan)[Math.max(0, Math.min(3, tier | 0))];
  const mph = Math.max(MIN_MPH, Math.min(MAX_MPH, real * GAME)), [bv, ba] = BASE[type] || BASE.sedan;
  const v = mph / MPH_PER_V, a = Math.max(5, Math.min(24, ba * (v / bv) ** 0.9));
  return { v: Math.round(v * 10) / 10, ac: Math.round(a * 10) / 10 };
}
