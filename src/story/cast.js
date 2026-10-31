// Main cast. Everyone here is fictional. Full backgrounds and the arc: docs/roadmap/03-story-and-characters.md.
// look → buildRig() colours; color → subtitle name / map blip; voice → Web Speech pitch.
export const CAST = {
  marco: {
    name: 'Marco', full: 'Marco "the Espola Kid" Reyes', color: '#f3ede1', voice: 0.95,
    bio: '26. Grew up a few streets from Poway High, left at 19 after a fight with his brother. Came home because Tommy finally called, and got there in time to watch him die. Inherits his brother\'s debt to the Deacon, then his brother\'s crew, then a name: the Espola Kid.',
  },
  rosa: {
    name: 'Rosa', full: 'Rosa Reyes', color: '#f29ccf', voice: 1.15, letter: 'R', home: 'home',
    look: { skin: '#c68863', shirt: '#7a4a8c', pants: '#2b3a55', hair: '#4b3020' },
    bio: 'Marco\'s mother. Twenty-two years running a school cafeteria, widowed eight. Keeps Tommy\'s room exactly as he left it and wants Marco to stay, and to stay out of it.',
  },
  tommy: {
    name: 'Tommy', full: 'Tommy "Lightning" Reyes', color: '#f0b23a', voice: 0.9, letter: 'T',
    look: { skin: '#c68863', shirt: '#2f3a4a', pants: '#2b3a55', hair: '#1a1a1a', hat: '#8a6a2c' },
    bio: 'Marco\'s older brother, dead at 30. Poway High quarterback, the fastest driver the Dust Devils ever had, then a knee, pills and a debt to the Deacon. Called Marco home after six years and went off Espola Road at 2 AM the same night. The report says single-car accident.',
  },
  dee: {
    name: 'Doc', full: 'Deandra "Doc" Okafor', color: '#7cc0ff', voice: 1.05, letter: 'D', home: 'deeGarage',
    look: { skin: '#5e3b26', shirt: '#3d405b', sleeve: '#3d405b', pants: '#3d405b', hair: '#1a1a1a', hat: '#c8423b' },
    bio: 'The Dust Devils\' mechanic: if it has an engine, Doc can fix it, and if it has an alarm, she can quiet it. Tommy\'s best friend since Twin Peaks Middle. Runs an honest garage on Kirkham Way that is barely surviving. Blames Marco for leaving. Knows more than she says.',
  },
  walt: {
    name: 'Walt', full: 'Walt "Old Hickory" Hollister', color: '#a6c98a', voice: 0.75, letter: 'W', home: 'oldPoway',
    look: { skin: '#f1c9a5', shirt: '#6f8f4a', pants: '#6b5b45', hair: '#9a9a9a', hat: '#1f2a44' },
    bio: '78. Army mechanic in Vietnam, widower, volunteer at the Old Poway Park depot. Fished Lake Poway with the boys\' father. Was out on the water before dawn the night Tommy died.',
  },
  kessler: {
    name: 'Sgt. Kessler', full: 'Sgt. Wade "Two-Badge" Kessler', color: '#8ea877', voice: 0.7,
    look: { skin: '#e0ac85', shirt: '#b8a77a', sleeve: '#b8a77a', pants: '#2c4430', hair: '#4b3020', hat: '#2c4430', gun: true },
    bio: 'Sheriff\'s sergeant at the Poway station, and the Deacon\'s man inside it: one badge from the county, one from the Syndicate. Wrote Tommy\'s crash report himself. Drives a black sedan off duty.',
  },
  vance: {
    name: 'The Deacon', full: 'Jericho "the Deacon" Vance', color: '#d4302f', voice: 0.85,
    bio: 'Owns Vance Prestige Motors on Danielson Street and the Iron Mountain Syndicate behind it: stolen cars through the business park, deputies on the payroll, money washed through feed stores and housing tracts. City-council regular, Little League sponsor. Quotes scripture. Collects debts from the dead.',
  },
  brenda: {
    name: 'Brenda', full: 'Brenda Pruitt', color: '#ff8a65', voice: 1.3, letter: 'B', home: 'brenda',
    look: { skin: '#f6d7bd', shirt: '#e07a5f', pants: '#e5e0d2', hair: '#c9a46b' },
    bio: 'HOA board president and neighborhood-app moderator. Has opinions about your trash cans. Has stronger opinions about porch pirates.',
  },
  lucky: {
    name: 'Lucky', full: 'Lucinda "Lucky" Navarro', color: '#c792ea', voice: 1.1, letter: 'L', home: 'lucky',
    look: { skin: '#e0ac85', shirt: '#5b2a4e', pants: '#1f2a44', hair: '#2a1d14' },
    bio: 'Runs Lucky\'s Swap & Loan on Poway Road: guitars, wedding rings, power tools, no questions. Bought half of what Tommy ever stole and liked him anyway.',
  },
  // ---- the Dust Devils, Tommy's old crew, and the man the Deacon sends
  boone: {
    name: 'Boone', full: 'Boone "Six-Shooter" Calloway', color: '#d9a066', voice: 0.8, letter: 'B', home: 'pawn',
    look: { skin: '#e0ac85', shirt: '#6b4a2e', pants: '#2b2b2b', hair: '#4b3020', hat: '#3a2a1c' },
    bio: 'The Dust Devils\' gunhand. Rode shotgun for Tommy for six years and never once counted past six. Sells "antiques" out of the back of Poway Road Pawn. Thinks the Deacon owes him a brother too.',
  },
  jesse: {
    name: 'Rattler', full: 'Jesse "Rattler" Ortiz', color: '#7fd1ae', voice: 1.25, letter: 'J', home: 'rattler',
    look: { skin: '#c68863', shirt: '#2f6b5a', pants: '#3a3a3a', hair: '#1a1a1a', hat: '#1a1a1a' },
    bio: '19. Boosted his first car at fourteen, his second off Tommy, who caught him, then taught him to do it right. Talks fast, drives faster, can open a Lexus in the time it takes you to ask whose it is.',
  },
  pike: {
    name: 'Pike', full: 'Cyrus "the Undertaker" Pike', color: '#9aa3ad', voice: 0.65,
    bio: 'The Deacon\'s enforcer. Wears a mask to work. Nobody in Poway has seen his face and said so afterwards.',
  },
  hector: {
    name: 'Hector', full: 'Hector Ibarra', color: '#b9a37e', voice: 0.95,
    look: { skin: '#8d5a3b', shirt: '#7a2e2a', pants: '#2b2b2b', hair: '#1a1a1a' },
    bio: 'Works the door at the Rusty Spur. Borrowed forty-two hundred dollars from Tommy and figured it died with him.',
  },
  // ---- Sycamore Smoke
  nina: {
    name: 'Nina', full: 'Nina "La Gata" Salas', color: '#ff9f43', voice: 1.12, letter: 'N', home: 'canyonMouth',
    bio: '29. Keeps the books at Salas Feed & Supply on Sycamore Canyon Road, which sells very little feed. Smarter than her uncle and tired of being told so. Appears in Vance\'s ledger as "S. Salas, canyon storage."',
  },
  salas: {
    name: 'El Patrón', full: 'Salvador "El Patrón" Salas', color: '#c0392b', voice: 0.78,
    bio: 'Nina\'s uncle. Thirty years moving product up Sycamore Canyon, the last ten through the Deacon\'s barns. Gives to the church, the Little League and anyone who forgets things.',
  },
  cruz: {
    name: 'Buzzard', full: 'Eddie "Buzzard" Cruz', color: '#95a5a6', voice: 1.0,
    bio: 'Crop-duster pilot turned courier for the Coyotes, the crew pushing into Sal\'s canyon from the east. Lives at the Poway Inn. Tips well, drives worse.',
  },
  // ---- Clean Money
  lang: {
    name: 'Lang', full: 'Victoria "the Widow" Lang', color: '#e1c16e', voice: 1.18, letter: 'V', home: 'cityHall',
    bio: 'Lang Development: "Building Poway\'s Tomorrow." Wants Old Poway Park rezoned and the Kirkham Way lots cleared. Paid Vance for "site security" and the Sheriff for patience.',
  },
  harlan: {
    name: 'Harlan', full: 'Dale "Hoss" Harlan', color: '#7f8c8d', voice: 0.82,
    bio: 'Harlan Brothers Construction. Lost the plaza bid to Lang, then found out how. Keeps receipts. Keeps bodyguards.',
  },
  // ---- The Lake
  okoye: {
    name: 'Gunny', full: 'Gunnery Sgt. (ret.) Samuel "Gunny" Okoye', color: '#2ecc71', voice: 0.72, letter: 'O', home: 'lakeGate',
    bio: 'Twenty years in the Marines, now rents boats at Lake Poway. The creek went bad in spring and his dog died drinking from it. He followed the smell uphill.',
  },
  ray: {
    name: 'Cookie', full: 'Raymond "Cookie" Dwyer', color: '#d35400', voice: 0.9,
    bio: 'Runs a lab in the chaparral above the lake. Ex-chemistry teacher, ex-husband, ex-everything. Buys his precursors through a supply house Lang Development owns on paper.',
  },
  mags: {
    name: 'Sawbones', full: 'Margaret "Sawbones" Ito', color: '#ff7eb6', voice: 1.2,
    bio: 'Paramedic who patches up people who can\'t go to the hospital. Okoye\'s only friend. Has seen what comes out of Ray\'s lab, on skin.',
  },
};

// Nameless people the missions spawn.
export const LOOKS = {
  thug: [
    { skin: '#e0ac85', shirt: '#2f2f33', pants: '#1f2a44', hair: '#1a1a1a', gun: true },
    { skin: '#8d5a3b', shirt: '#1d1f24', pants: '#3a3a3a', hair: '#1a1a1a', hat: '#1a1a1a', gun: true },
    { skin: '#c68863', shirt: '#3a3d44', pants: '#2b3a55', hair: '#2a1d14', gun: true },
    { skin: '#f1c9a5', shirt: '#26282d', pants: '#1f2a44', hair: '#8c6a3c', hat: '#26282d', gun: true },
  ],
  tagger: [
    { skin: '#c68863', shirt: '#81b29a', pants: '#3a3a3a', hair: '#1a1a1a', hat: '#e07a5f' },
    { skin: '#f1c9a5', shirt: '#e07a5f', pants: '#2b3a55', hair: '#c9a46b', hat: '#1d6f7a' },
    { skin: '#5e3b26', shirt: '#3a6ea5', pants: '#54616e', hair: '#1a1a1a', hat: '#f2cc8f' },
  ],
  pirate: [{ skin: '#e0ac85', shirt: '#54616e', sleeve: '#54616e', pants: '#2b3a55', hair: '#2a1d14', hat: '#1a1a1a' }],
  // the Deacon's men: outlaws from Sketchfab when they're installed (src/reserved.js OUTLAW_LOOKS), dark clothes if not
  enforcer: [
    { kind: 'civ', avatar: 'Outlaw_Masked', skin: '#e0ac85', shirt: '#1b1c1f', pants: '#22252b', hair: '#111', hat: '#111', gun: true },
    { kind: 'civ', skin: '#c68863', shirt: '#2a2c31', pants: '#3a3226', hair: '#1a1a1a', gun: true },
  ],
  deputy: [{ kind: 'police', skin: '#e0ac85', shirt: '#b8a77a', sleeve: '#b8a77a', pants: '#2c4430', hair: '#4b3020', hat: '#2c4430', gun: true }],
};
// the Syndicate's crews wear the outlaws too, mixed with plain dark clothes
LOOKS.thug.push(...LOOKS.enforcer);
