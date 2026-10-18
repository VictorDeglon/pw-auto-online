// Avatars that belong to one person. Story characters and the weapon dealers each wear their own, and nobody else
// does: these never appear in the random crowd pools, in the police pool, or in the player's skin picker.
// Swimwear athletes (Sports_*) are kept for places that make sense: Lake Poway, the Poway High pool, the club.
export const CAST_SKINS = {
  rosa: 'Chef_Female_01', dee: 'Construction_Female_01', walt: 'Wood_Male_01', kessler: 'Police_Male_02', vance: 'Business_Male_01', brenda: 'Business_Female_01',
  nina: 'Female_Adult_09', lang: 'Business_Female_03', okoye: 'Military_Male_01', ray: 'Male_Adult_07', salas: 'Male_Adult_20',
  harlan: 'Business_Male_05', mags: 'Medical_Female_02', cruz: 'Pilot_Male_02', tommy: 'Male_Adult_16', lucky: 'Female_Adult_15',
};
export const DEALER_SKINS = ['Security_Male_01', 'Business_Male_02', 'Construction_Male_03', 'Military_Male_02'];
export const RESERVED = new Set([...Object.values(CAST_SKINS), ...DEALER_SKINS]);
export const SWIM = name => /^Sports_/.test(name);
