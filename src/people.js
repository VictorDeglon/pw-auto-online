// Names and categories for the Rocketbox cast, used by the character selector, name tags of story-less NPCs, and
// anywhere the game needs to call a person something. Deterministic: the same avatar always gets the same name.
const F = ['Maya', 'Sofia', 'Ava', 'Emma', 'Lucia', 'Priya', 'Hannah', 'Grace', 'Nadia', 'Rosa', 'Camila', 'Keiko', 'Dana', 'Tessa',
  'Olivia', 'Elena', 'Jasmine', 'Brooke', 'Ines', 'Leah', 'Monique', 'Harper', 'Yara', 'Mei', 'Claire', 'Valeria', 'Aisha', 'Riley'];
const M = ['Marco', 'Jordan', 'Ethan', 'Diego', 'Kenji', 'Andre', 'Lucas', 'Owen', 'Mateo', 'Darius', 'Caleb', 'Ravi', 'Tyler',
  'Isaac', 'Malik', 'Noah', 'Hector', 'Felix', 'Wes', 'Omar', 'Julian', 'Grant', 'Tomas', 'Elijah', 'Quinn', 'Rafael', 'Victor', 'Sam'];
const LAST = ['Alvarez', 'Whitaker', 'Nguyen', 'Brooks', 'Castillo', 'Okafor', 'Hollis', 'Tanaka', 'Moreno', 'Patel', 'Delgado',
  'Sullivan', 'Reyes', 'Kim', 'Navarro', 'Hart', 'Ortega', 'Bishop', 'Fischer', 'Lindqvist', 'Mercer', 'Ramos', 'Chen', 'Dawson',
  'Park', 'Herrera', 'Quinlan', 'Vasquez', 'Abbott', 'Romero', 'Silva', 'Fletcher', 'Ibarra', 'Coleman', 'Haddad', 'Pruitt'];

// manifest kind -> category and the job title shown under the name
export const CATEGORIES = [
  { id: 'everyday', label: 'Everyday', kinds: ['civilian'] },
  { id: 'business', label: 'Business', kinds: ['business'] },
  { id: 'responders', label: 'First responders', kinds: ['fire', 'medical'] },
  { id: 'trades', label: 'Trades', kinds: ['construction', 'gardener', 'wood', 'delivery', 'chef'] },
  { id: 'athletes', label: 'Athletes', kinds: ['sports'] },
  { id: 'uniforms', label: 'Uniforms', kinds: ['pilot', 'security', 'police', 'military'] },
];
const ROLE = { civilian: 'Local', business: 'Office worker', fire: 'Firefighter', medical: 'Paramedic', construction: 'Construction crew',
  gardener: 'Gardener', wood: 'Lumberjack', delivery: 'Courier', chef: 'Chef', sports: 'Athlete', pilot: 'Pilot', security: 'Security guard',
  police: 'Deputy', military: 'Soldier' };

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const cache = new Map(), used = new Set();
// a = manifest avatar { name, sex, kind }. Call nameAll(manifest.avatars) once so names are unique and stable.
export function person(a) {
  if (cache.has(a.name)) return cache.get(a.name);
  const h = hash(a.name), firsts = a.sex === 'f' ? F : M;
  const cat = CATEGORIES.find(c => c.kinds.includes(a.kind)) || CATEGORIES[0];
  let i = 0, first, last;
  do { first = firsts[(h + i) % firsts.length]; last = LAST[((h >>> 8) + i * 7) % LAST.length]; i++; } while (used.has(first + last) && i < 400);
  used.add(first + last);
  const p = { first, last, full: first + ' ' + last, role: ROLE[a.kind] || 'Local', category: cat.id };
  cache.set(a.name, p); return p;
}
export function nameAll(avatars) { for (const a of [...avatars].sort((x, y) => x.name < y.name ? -1 : 1)) person(a); }
