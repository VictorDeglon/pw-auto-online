// The background budget: how many milliseconds the streaming may take this frame (the outer tiles, the town's chunks,
// the plants' tiles, the brush and stones, texture uploads). index.html measures what the game's own work in a frame
// takes (everything but the streaming) and gives the streaming what's left of a 60 fps frame, so a heavy frame streams
// less instead of dropping to 30, and an easy one streams more. Work that runs between frames (setTimeout slices)
// reads BG.slice; work inside the frame asks bgBudget(max).
//   BG.frame(totalMs, streamMs)   once a frame, at its end
//   bgBudget(max)                 ms for streaming inside this frame (never more than max)
//   BG.slice                      ms for one slice of between-frames work
const TARGET = 15; // ms: a 60 fps frame with a little room for the browser
// A computer that can't make 60 anyway still streams with an eighth of its frame (left to "what's left of 15 ms", a slow
// one got 0.6 ms a frame and the town took minutes to fill in round you)
const SHARE = 0.12;
export const BG = {
  work: 9, slice: 4,
  frame(total, stream) {
    const own = Math.max(0, total - stream);
    this.work += (own - this.work) * (own > this.work ? 0.35 : 0.08); // quick to back off when frames get heavy, slow to take more
    this.slice = Math.max(1, Math.min(6, Math.max(TARGET - this.work, this.work * SHARE)));
  },
};
export function bgBudget(max) { return Math.max(0.6, Math.min(max, Math.max(TARGET - BG.work, BG.work * SHARE))); }
