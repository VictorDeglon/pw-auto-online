// Main cast. Everyone here is fictional. Full backgrounds and the arc: docs/roadmap/03-story-and-characters.md.
// look → buildRig() colours; color → subtitle name / map blip; voice → Web Speech pitch.
export const CAST = {
  marco: {
    name: 'Marco', full: 'Marco Reyes', color: '#f3ede1', voice: 0.95,
    bio: '26. Grew up on Cardinal Court, left Poway at 19 after a fight with his brother and never called. Back for Tommy\'s funeral, carrying the call he let go to voicemail.',
  },
  rosa: {
    name: 'Rosa', full: 'Rosa Reyes', color: '#f29ccf', voice: 1.15, letter: 'R', home: 'home',
    look: { skin: '#c68863', shirt: '#7a4a8c', pants: '#2b3a55', hair: '#4b3020' },
    bio: 'Marco\'s mother. Twenty-two years running a school cafeteria, widowed eight. Keeps Tommy\'s room exactly as he left it and wants Marco to stay, and to stay out of it.',
  },
  tommy: {
    name: 'Tommy', full: 'Tommy Reyes', color: '#f0b23a', voice: 0.9,
    bio: 'Marco\'s older brother, dead at 30. Poway High quarterback, gifted mechanic, then a knee injury, pills and a debt. Died in a "single-car accident" on Espola Road at 2 AM.',
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
