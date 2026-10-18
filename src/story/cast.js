// Main cast. Everyone here is fictional. Full backgrounds and the arc: docs/roadmap/03-story-and-characters.md.
// look → buildRig() colours; color → subtitle name / map blip; voice → Web Speech pitch.
export const CAST = {
  marco: {
    name: 'Marco', full: 'Marco Reyes', color: '#f3ede1', voice: 0.95,
    bio: '26. Grew up a few streets from Poway High, left Poway at 19 after a fight with his brother and never called. Came home because Tommy finally did, and got there in time to watch him die.',
  },
  rosa: {
    name: 'Rosa', full: 'Rosa Reyes', color: '#f29ccf', voice: 1.15, letter: 'R', home: 'home',
    look: { skin: '#c68863', shirt: '#7a4a8c', pants: '#2b3a55', hair: '#4b3020' },
    bio: 'Marco\'s mother. Twenty-two years running a school cafeteria, widowed eight. Keeps Tommy\'s room exactly as he left it and wants Marco to stay, and to stay out of it.',
  },
  tommy: {
    name: 'Tommy', full: 'Tommy Reyes', color: '#f0b23a', voice: 0.9, letter: 'T',
    look: { skin: '#c68863', shirt: '#2f3a4a', pants: '#2b3a55', hair: '#1a1a1a', hat: '#8a6a2c' },
    bio: 'Marco\'s older brother, dead at 30. Poway High quarterback, gifted mechanic, then a knee injury, pills and a debt. Called Marco home after six years, and went off Espola Road at 2 AM the same night. The report says "single-car accident."',
  },
  dee: {
    name: 'Dee', full: 'Deandra "Dee" Okafor', color: '#7cc0ff', voice: 1.05, letter: 'D', home: 'deeGarage',
    look: { skin: '#5e3b26', shirt: '#3d405b', sleeve: '#3d405b', pants: '#3d405b', hair: '#1a1a1a', hat: '#c8423b' },
    bio: 'Tommy\'s best friend since Twin Peaks Middle. Runs an honest garage on Kirkham Way that is barely surviving. Blames Marco for leaving. Knows more than she says.',
  },
  walt: {
    name: 'Walt', full: 'Walt Hollister', color: '#a6c98a', voice: 0.75, letter: 'W', home: 'oldPoway',
    look: { skin: '#f1c9a5', shirt: '#6f8f4a', pants: '#6b5b45', hair: '#9a9a9a', hat: '#1f2a44' },
    bio: '78. Army mechanic in Vietnam, widower, volunteer at the Old Poway Park depot. Fished Lake Poway with the boys\' father. Was out on the water before dawn the night Tommy died.',
  },
  kessler: {
    name: 'Sgt. Kessler', full: 'Sgt. Ray Kessler', color: '#8ea877', voice: 0.7,
    look: { skin: '#e0ac85', shirt: '#b8a77a', sleeve: '#b8a77a', pants: '#2c4430', hair: '#4b3020', hat: '#2c4430', gun: true },
    bio: 'Sheriff\'s sergeant at the Poway station. Wrote Tommy\'s crash report. Tired, divorced, and on somebody\'s payroll.',
  },
  vance: {
    name: 'Vance', full: 'Garrett Vance', color: '#d4302f', voice: 0.85,
    bio: 'Owner of Vance Prestige Motors on Danielson Street. City-council regular, Little League sponsor, and the man moving stolen luxury cars through Poway\'s quiet business park.',
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
  // ---- Sycamore Smoke
  nina: {
    name: 'Nina', full: 'Nina Salas', color: '#ff9f43', voice: 1.12, letter: 'N', home: 'canyonMouth',
    bio: '29. Keeps the books at Salas Feed & Supply on Sycamore Canyon Road, which sells very little feed. Smarter than her uncle and tired of being told so. Appears in Vance\'s ledger as "S. Salas, canyon storage."',
  },
  salas: {
    name: 'Sal', full: 'Salvador "Sal" Salas', color: '#c0392b', voice: 0.78,
    bio: 'Nina\'s uncle. Thirty years moving product up the canyon, the last ten through Garrett Vance\'s barns. Gives to the church, the Little League and anyone who forgets things.',
  },
  cruz: {
    name: 'Cruz', full: 'Eddie Cruz', color: '#95a5a6', voice: 1.0,
    bio: 'Crop-duster pilot turned courier for the Coyotes, the crew pushing into Sal\'s canyon from the east. Lives at the Poway Inn. Tips well, drives worse.',
  },
  // ---- Clean Money
  lang: {
    name: 'Lang', full: 'Victoria Lang', color: '#e1c16e', voice: 1.18, letter: 'V', home: 'cityHall',
    bio: 'Lang Development: "Building Poway\'s Tomorrow." Wants Old Poway Park rezoned and the Kirkham Way lots cleared. Paid Vance for "site security" and the Sheriff for patience.',
  },
  harlan: {
    name: 'Harlan', full: 'Dale Harlan', color: '#7f8c8d', voice: 0.82,
    bio: 'Harlan Brothers Construction. Lost the plaza bid to Lang, then found out how. Keeps receipts. Keeps bodyguards.',
  },
  // ---- The Lake
  okoye: {
    name: 'Okoye', full: 'Gunnery Sgt. (ret.) Samuel Okoye', color: '#2ecc71', voice: 0.72, letter: 'O', home: 'lakeGate',
    bio: 'Twenty years in the Marines, now rents boats at Lake Poway. The creek went bad in spring and his dog died drinking from it. He followed the smell uphill.',
  },
  ray: {
    name: 'Ray', full: 'Raymond "Cook" Dwyer', color: '#d35400', voice: 0.9,
    bio: 'Runs a lab in the chaparral above the lake. Ex-chemistry teacher, ex-husband, ex-everything. Buys his precursors through a supply house Lang Development owns on paper.',
  },
  mags: {
    name: 'Mags', full: 'Margaret "Mags" Ito', color: '#ff7eb6', voice: 1.2,
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
};
