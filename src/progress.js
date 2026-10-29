// Progression on the client: your level, XP, skill points, skills and daily challenges, as the Nakama server keeps
// them (server/nakama/index.js decides; this module only shows and applies them). The last profile is cached in
// localStorage, so skills still apply offline or when the server can't be reached.
//   skill(id)         a skill's rank (0 when you don't have it)
//   PROG.me           the profile (null until known)
//   onProgress(cb)    profile changes
// Skill effects outside this module are one-line hooks: index.html (weapons, damage taken, running, regen,
// respawn shield) and src/police.js (Low Profile). Driving skills are applied here, on car:enter / car:exit.
import { ACCOUNT, PRO, NET, on as onNet } from './online/net.js';
import { on as onBus } from './events.js';

const CACHE_KEY = 'pw-auto-online-prog';
export const PROG = { me: null, skills: [], rows: null, titles: [], available: !!PRO, err: '' };
try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.me) Object.assign(PROG, { me: c.me, skills: c.skills || [], titles: c.titles || [] }); } catch (e) { }
const subs = new Set();
export function onProgress(cb) { subs.add(cb); return () => subs.delete(cb); }
function changed(ev) { try { if (!(NET && NET.tabGuest)) localStorage.setItem(CACHE_KEY, JSON.stringify({ me: PROG.me, skills: PROG.skills, titles: PROG.titles })); } catch (e) { } for (const cb of subs) { try { cb(PROG, ev || []); } catch (e) { console.error('[progress]', e); } } }
export function skill(id) { return PROG.me && PROG.me.skills ? PROG.me.skills[id] | 0 : 0; }

export async function refresh() {
  if (!PRO) return PROG;
  try { const r = await PRO.profile(); PROG.me = r.me; PROG.skills = r.skills || PROG.skills; PROG.rows = r.rows || PROG.rows; PROG.titles = r.titles || PROG.titles; PROG.err = ''; changed(); }
  catch (e) { PROG.err = e.message || String(e); }
  return PROG;
}
export async function buySkill(id) { const r = await PRO.buySkill(id); PROG.me = r.me; changed(); return PROG; }
export async function resetSkills() { const r = await PRO.resetSkills(); PROG.me = r.me; changed(); return PROG; }

// Kills, XP and levels only count online, in a room: achievements, missions and jobs done there pay XP (each achievement
// once, each mission once a day), and so does every NPC you take down. Single player doesn't touch your level.
const pending = [];
const online = () => !!(PRO && ACCOUNT && PRO.online());
async function claim(kind, id) {
  if (!online()) return;
  try { const r = await PRO.claim(kind, id); if (r.me) PROG.me = r.me; changed(r.ev); }
  catch (e) { if (pending.length < 50) pending.push([kind, id]); } // the server didn't answer: try again shortly
}
export function retryClaims() { const a = pending.splice(0); for (const [k, id] of a) claim(k, id); }
onBus('mission:pass', d => claim('mission', 'story:' + (d && d.id || 'mission')));
onBus('job:done', d => claim('mission', 'job:' + ((d && d.job && (d.job.kind || d.job.type)) || 'courier')));
onBus('ach:unlock', d => claim('ach', d && d.id));
onBus('ped:killed', d => { if (d && d.by === 'player' && online()) PRO.npcKill(d.ped && d.ped.isCop); });

// the room tells you about your kills, XP, level-ups and challenges as they happen
onNet('stats', d => { if (d.me) { PROG.me = d.me; changed(d.ev || []); } else changed(d.ev || []); });

// ---- driving skills: applied to the car you drive, taken off when you get out
onBus('car:enter', ({ vehicle: v }) => {
  if (!v || !v.spec || v._skill) return;
  const e = skill('engine'), g = skill('grip'); if (!e && !g) return;
  v._skill = { vmax: v.spec.vmax, acc: v.spec.acc, turn: v.spec.turn };
  v.spec.vmax *= 1 + 0.04 * e; v.spec.acc *= 1 + 0.04 * e; if (v.spec.turn) v.spec.turn *= 1 + 0.06 * g;
});
onBus('car:exit', ({ vehicle: v }) => { if (!v || !v._skill) return; Object.assign(v.spec, v._skill); v._skill = null; });
// damage the car you drive takes (Reinforced Frame), and its self-repair per second (Road Mechanic)
export const carArmor = () => 1 - 0.08 * skill('plating');
export const carRepairPerS = () => 0.6 * skill('mechanic');
// Nitrous: seconds of boost; Second Wind: health per second once nobody has hurt you for 6 s (none without the skill)
export const nitroSeconds = () => skill('nitro');
export const regenPerS = () => 0.8 * skill('regen');

export function levelTitle() { return PROG.me ? `LV ${PROG.me.lvl} · ${PROG.me.title}` : ''; }
export function signedIn() { return !!(ACCOUNT && NET); }
