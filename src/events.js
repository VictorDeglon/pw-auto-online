// Tiny event bus (docs/roadmap/00-foundations.md §2). Systems emit facts; features listen.
// Events in use: crime, wanted, player:died, player:respawn, car:enter, car:exit, car:destroyed,
// ped:killed, job:done, job:failed, shot:fired, police:stop, mission:start, mission:pass, mission:fail.
const subs = new Map();
export const on = (type, fn) => { (subs.get(type) || subs.set(type, []).get(type)).push(fn); return () => off(type, fn); };
export const off = (type, fn) => { const a = subs.get(type); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } };
export const emit = (type, payload) => { const a = subs.get(type); if (a) for (const fn of a.slice()) fn(payload); };
