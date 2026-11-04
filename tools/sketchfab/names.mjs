// A showroom name for each Sketchfab car (catalog field g). The game doesn't name real makers or their models (the
// credits do), so a real maker becomes a made-up one that sounds a little like it, and the model gets a word from the
// desert and the coast, picked by the car's id so it never changes. Cars that already have made-up names (the "Kiri '86"
// low-poly series) keep them. The year stays: '75.
//   gameName(title, type, id) -> 'Pfeffer Sidewinder ’75'
const MAKES = [
  [/porsche/i, 'Pfeffer'], [/ferrari/i, 'Ferrano'], [/lamborghini/i, 'Lambardo'], [/mclaren/i, 'McLaird'], [/bugatti/i, 'Bugatto'],
  [/koenigsegg/i, 'Königsberg'], [/pagani/i, 'Pagano'], [/maserati/i, 'Masoretti'], [/aston/i, 'Ashton Marlowe'], [/bentley/i, 'Bentham'],
  [/rolls/i, 'Rolland Royal'], [/maybach/i, 'Maybury'], [/mercedes|mersedes|benz|\bamg\b/i, 'Mercator'], [/\bbmw\b/i, 'Bavaria'], [/audi/i, 'Auda'],
  [/volkswagen|\bvw\b|beetle|fusca|typ-82/i, 'Volksburg'], [/toyota|lexus|trueno|sprinter/i, 'Tamaya'], [/honda|acura/i, 'Hanta'], [/nissan|datsun|infiniti|skyline|silvia|silEighty|180sx|fairlady/i, 'Nishiki'],
  [/mazda/i, 'Mazura'], [/subaru/i, 'Subira'], [/mitsubishi/i, 'Mitsuboshi'], [/suzuki/i, 'Suzaku'], [/hyundai/i, 'Hanseo'], [/\bkia\b/i, 'Kaya'],
  [/ford|mustang|crown victoria|model [ta]\b|f-?1[05]0/i, 'Fordham'], [/chevrolet|chevy|camaro|impala|malibu|bel air|silverado|suburban|blazer|el camino|caprice|colorado/i, 'Chevalier'],
  [/dodge|charger|challenger|viper/i, 'Dodd'], [/\bram\b/i, 'Ramrod'], [/chrysler|new yorker|saratoga/i, 'Crysta'], [/plymouth|fury/i, 'Plymont'], [/jeep|willy|cherokee|wrangler|renegade|rubicon|compass|comanche/i, 'Trekker'],
  [/cadillac|miller-meteor/i, 'Cadwell'], [/lincoln/i, 'Lancaster'], [/buick/i, 'Burwick'], [/oldsmobile/i, 'Oldfield'], [/mercury|grand marquis/i, 'Merrill'], [/\bamc\b/i, 'Ambassador'],
  [/hummer/i, 'Mammoth'], [/tesla|cybertruck/i, 'Volta'], [/volvo/i, 'Valvo'], [/fiat/i, 'Fiato'], [/alfa/i, 'Alba Romana'], [/jaguar/i, 'Ocelot'], [/land rover|range rover|defender/i, 'Landrider'],
  [/peugeot/i, 'Pugeault'], [/renault/i, 'Renard'], [/triumph/i, 'Trevelyan'], [/\bac cobra|\bcobra\b/i, 'Asp'], [/de tomaso/i, 'De Tomasi'], [/pininfarina/i, 'Pinavera'],
  [/vaz|lada|zhiguli|gaz|zis|uaz/i, 'Volgograd'], [/hongqi/i, 'Hongshan'], [/cupra|seat/i, 'Cuprino'], [/apollo/i, 'Apolline'], [/karlmann/i, 'Karlsberg'], [/international/i, 'Intercontinental'],
  [/bollinger/i, 'Bolling'], [/cord\b/i, 'Cordell'], [/\bgmc\b|yukon/i, 'Gemmell'],
];
const WORDS = {
  sports: ['Sidewinder', 'Mirage', 'Rattler', 'Javelina', 'Haboob', 'Santa Ana', 'Dust Devil', 'Gila', 'Vaquero', 'Halcón', 'Desperado', 'Pistolero', 'Chupacabra', 'Redtail', 'Kestrel', 'Lobo', 'Rayo', 'Relámpago', 'Tormenta', 'Fuego', 'Brasa', 'Cometa', 'Ocotillo', 'Scorpion', 'Sonora GT', 'Bandolero', 'Firewind', 'Sunburst', 'Vandal', 'Coyote'],
  sedan: ['Mesa', 'Laguna', 'Del Mar', 'Cortez', 'Hacienda', 'Palomar', 'Presidio', 'Cuyamaca', 'Escondido', 'Alameda', 'Arroyo', 'Marquesa', 'Pueblo', 'Mission', 'Ventana', 'Solana', 'Paloma', 'Esplanade', 'Rancho', 'Bonita', 'Serrano', 'Avenida', 'Torrey', 'Linda Vista', 'Miramar'],
  suv: ['Chaparral', 'Mojave', 'Anza', 'Borrego', 'Ironwood', 'Joshua', 'Yucca', 'Sagebrush', 'Tumbleweed', 'Saguaro', 'Badlands', 'Prospector', 'Homestead', 'Trailhead', 'Mesquite', 'Rimrock', 'Pinyon', 'Juniper', 'Cholla', 'Palo Verde'],
  pickup: ['Fieldhand', 'Teamster', 'Mule', 'Burro', 'Drover', 'Stockman', 'Packmule', 'Homesteader', 'Corral', 'Muleskinner', 'Plowman', 'Wrangle', 'Hayride', 'Feedlot', 'Barnstormer'],
  van: ['Wanderer', 'Courier', 'Drifter', 'Porter', 'Roamer', 'Stagecoach', 'Overland', 'Postrider', 'Freighter', 'Carryall'],
  police: ['Interceptor', 'Marshal', 'Deputy', 'Lawman', 'Sheriff', 'Ranger', 'Pursuit', 'Patrol'],
};
const EXTRA = [[/taxi/i, 'Taxi'], [/lifted/i, 'Lifted'], [/convertible|roadster|spider|spyder|no roof/i, 'Roadster'], [/wagon|\bsw\b|nomad/i, 'Wagon'], [/rally|racemod|race car/i, 'Rally'], [/concept/i, 'Concept'], [/\brescue\b|\bfire\b/i, 'Rescue']];
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const used = new Set();
export function gameName(title, type, id) {
  const t = String(title), h = hash(id);
  const y4 = t.match(/\b(19[0-9]{2}|20[0-4][0-9])\b/), y2 = t.match(/'([0-9]{2})\b/), yy = y4 ? y4[1].slice(2) : y2 ? y2[1] : '';
  const make = MAKES.find(([re]) => re.test(t));
  const own = !make && t.match(/^([A-Z][A-Za-z]+(?: [A-Z0-9][A-Za-z0-9]*)?) '\d\d/); // the low-poly series: 'Fairheaven SW '84 - Low poly model'
  let name;
  if (own) name = own[1];
  else { const w = WORDS[type] || WORDS.sedan; name = `${make ? make[1] + ' ' : ''}${w[h % w.length]}`; }
  const x = EXTRA.find(([re]) => re.test(t) && !name.includes(t.match(re)[0])); if (x && !(type === 'police' && x[1] === 'Rescue')) name += ' ' + x[1];
  if (yy) name += ` ’${yy}`;
  let out = name; for (let k = 2; used.has(out); k++) out = `${name} ${['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][k] || k}`;
  used.add(out); return out;
}
