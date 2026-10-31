// What you see of everyone else's names and chat. src/online/moderation.js finds the bad words; with the setting on
// (the default) bad words in chat become ****, and a player with a rude name shows up under a first name that suits
// the character they picked (src/online/nicknames.js), the same one every time. Off: what they typed. Your own name
// and your own lines are always shown as you wrote them. The server keeps what people typed; this is per viewer.
//   shownName(raw, id?, skin?)   shownChat(text)   shownLine(text)   onShownChange(fn)   MOD (the setting)
import { MOD, displayName, cleanChat, cleanLine, rememberPlayer } from './moderation.js';
import { NET } from './net.js';
import { HUMANS, splitSkin } from '../humans.js';
export { MOD };

function sexOf(skin) { // the character's sex from the avatar list ('m' / 'f'), so a nickname fits the look
  skin = splitSkin(skin).avatar;
  const A = HUMANS.manifest && HUMANS.manifest.avatars, a = skin && A ? A.find(q => q.name === skin) : null;
  return a ? a.sex : /^female/i.test(skin || '') ? 'f' : /^male/i.test(skin || '') ? 'm' : undefined;
}
function byName(raw) { for (const [id, p] of NET.players) if (p.n === raw) return [id, p.s]; return [null, undefined]; }
const memo = new Map(); // `${id}|${raw}|${skin}` -> what to show; cleared when the setting changes
MOD.onChange(() => memo.clear());

export function shownName(raw, id, skin) {
  if (!raw || raw === NET.name || (id && id === NET.uid)) return raw; // yours
  if (!id) [id, skin] = byName(raw);
  else if (skin === undefined) { const p = NET.players.get(id); skin = p && p.s; }
  const k = `${id || ''}|${raw}|${skin || ''}`; let s = memo.get(k);
  if (s === undefined) { const o = { key: id || raw, sex: sexOf(skin) }; rememberPlayer(raw, o); s = displayName(raw, o); memo.set(k, s); }
  return s;
}
export function shownChat(text) { return cleanChat(String(text || '')); }
// a line the server wrote that names players ("X is on a 5-kill streak")
export function shownLine(text) { for (const [id, p] of NET.players) if (p.n) shownName(p.n, id, p.s); return cleanLine(String(text || '')); }
export function onShownChange(fn) { MOD.onChange(fn); }
