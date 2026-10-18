// What the story has opened up so far: fast-travel spots, garages, crimes and abilities. One list in the save
// (save.story.unlocks), keys like 'parkway', 'garage:dee', 'crime:pickpocket', 'ability:lockpick'. The story's
// `learn` and `unlock` steps add to it; everything else only reads it.
import { ctx } from '../ctx.js';

export function unlockList() { const st = ctx.save.story || (ctx.save.story = {}); return st.unlocks || (st.unlocks = []); }
export function isUnlocked(key) { return !!ctx.save && unlockList().includes(key); }
