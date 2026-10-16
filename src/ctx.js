// Shared context (docs/roadmap/00-foundations.md §1). index.html fills it at boot, after the world is
// built, with the game's internals (functions, live arrays, and getters for primitive `let` state such
// as simTime). Feature modules read ctx.* at call time, never at import time.
export const ctx = {};
