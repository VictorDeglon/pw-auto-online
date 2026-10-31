// Avatars that belong to one person. Story characters and the weapon dealers each wear their own, and nobody else
// does: these never appear in the random crowd pools, in the police pool, or in the player's skin picker. A list is
// first-one-there: an outlaw from Sketchfab (assets/humans/outlaws.json) when it's installed, else a Rocketbox skin.
// OUTLAW_LOOKS are the Deacon's men: the story's enforcers and crews wear them (src/story/cast.js LOOKS).
// Swimwear athletes (Sports_*) are kept for places that make sense: Lake Poway, the Poway High pool, the club.
export const CAST_SKINS = {
  rosa: 'Chef_Female_01', dee: 'Construction_Female_01', walt: 'Wood_Male_01', kessler: 'Police_Male_02', vance: 'Business_Male_01', brenda: 'Business_Female_01',
  nina: 'Female_Adult_09', lang: 'Business_Female_03', okoye: 'Military_Male_01', ray: 'Male_Adult_07', salas: 'Male_Adult_20',
  harlan: 'Business_Male_05', mags: 'Medical_Female_02', cruz: 'Pilot_Male_02', lucky: 'Female_Adult_15',
  tommy: ['Outlaw_Gunslinger', 'Male_Adult_16'], vance: ['Outlaw_Boss', 'Business_Male_01'], salas: ['Outlaw_Patron', 'Male_Adult_20'],
  boone: ['Outlaw_Bandana', 'Male_Adult_14'], jesse: ['Outlaw_Kid', 'Male_Adult_09'], pike: ['Outlaw_Masked', 'Male_Adult_21'],
};
export const OUTLAW_LOOKS = ['Outlaw_Masked', 'Outlaw_Muscle'];
export const DEALER_SKINS = ['Security_Male_01', 'Business_Male_02', 'Construction_Male_03', 'Military_Male_02'];
export const RESERVED = new Set([...Object.values(CAST_SKINS).flat(), ...DEALER_SKINS, ...OUTLAW_LOOKS]);
export const SWIM = name => /^Sports_/.test(name);
