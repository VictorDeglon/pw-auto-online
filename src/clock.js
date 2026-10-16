// Calendar clock (docs/roadmap/00-foundations.md §4). The game date starts on the day you first played
// (Poway time, America/Los_Angeles) and advances with game time (1 game hour per real minute, so a game
// day is 24 real minutes and a season is roughly 36 hours of play). index.html still owns `hour`; it
// calls clock.addDays() when the hour wraps past midnight.
import { emit } from './events.js';

const LA = 'America/Los_Angeles';
const DAY = 86400000;
const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'];
function laNow() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: LA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: (+p.hour % 24) + +p.minute / 60 };
}
const toMs = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const toDate = ms => new Date(ms).toISOString().slice(0, 10);

export const clock = {
  date: null, startDate: null, hour: 10,
  init(saved) {
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved.date || '')) { this.date = saved.date; this.startDate = saved.startDate || saved.date; this.hour = Number.isFinite(saved.hour) ? saved.hour : 10; }
    else { const n = laNow(); this.date = this.startDate = n.date; this.hour = n.hour; }
  },
  toSave(hour) { if (Number.isFinite(hour)) this.hour = hour; return { date: this.date, startDate: this.startDate, hour: +this.hour.toFixed(3) }; },
  addDays(n = 1) { const prev = this.date; this.date = toDate(toMs(this.date) + n * DAY); emit('clock:day', { date: this.date, prev }); },
  get month() { return +this.date.slice(5, 7); },                       // 1-12
  get weekday() { return new Date(toMs(this.date)).getUTCDay(); },      // 0 = Sunday
  get doy() { return Math.round((toMs(this.date) - Date.UTC(+this.date.slice(0, 4), 0, 1)) / DAY) + 1; },
  get season() { return SEASONS[this.month - 1]; },
  get daysPlayed() { return Math.round((toMs(this.date) - toMs(this.startDate)) / DAY); },
  // Changes once per season (Dec-Feb, Mar-May, Jun-Aug, Sep-Nov). Seeds seasonal world dressing.
  get seasonKey() { const y = +this.date.slice(0, 4), m = this.month; return `${m === 12 ? y + 1 : y}-${this.season}`; },
  get isSchoolDay() { const w = this.weekday, m = this.month; return w > 0 && w < 6 && m !== 7 && !(m === 6 && +this.date.slice(8) > 12) && !(m === 8 && +this.date.slice(8) < 15); },
  label() {
    const d = new Date(toMs(this.date));
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  },
};
