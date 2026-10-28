// Bad words in chat and rude usernames, at display time: the server keeps what people typed, and each player's setting
// decides what they see (src/online/shown.js puts it on screen). Catches the usual dodges: capitals, repeated letters,
// leetspeak and symbols (f4ck, sh1t, a$$), dots/dashes/underscores/stars inside a word (f.u.c.k), letters spaced out
// (f u c k), accents, fullwidth and Cyrillic/Greek look-alikes, zero-width characters. A word that's caught is masked
// whole, letter for letter ('fucking' -> '*******'). Ordinary words that contain a bad one (class, Scunthorpe,
// cocktail, therapist, Niger) are left alone: short and common roots only count as whole words or known compounds.
//   MOD.on / MOD.on = v / MOD.onChange(fn)   the setting (on by default; localStorage 'pw-auto-online-filter')
//   maskProfanity(text)  isProfane(text)  cleanChat(text)  nameIsProfane(name)  nickFor(key, sex)
//   displayName(raw, { key, sex })  rememberPlayer(raw, { key, sex })  cleanLine(text)
import { BOY, GIRL } from './nicknames.js';

// ---------------------------------------------------------------- the setting
const KEY = 'pw-auto-online-filter', listeners = [];
let on = (() => { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } })();
export const MOD = {
  get on() { return on; },
  set on(v) { v = !!v; if (v === on) return; on = v; try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { } for (const f of listeners) try { f(v); } catch (e) { } },
  onChange(fn) { listeners.push(fn); },
};

// ---------------------------------------------------------------- the words
// A root is spelled in plain letters; each letter also matches its leetspeak stand-ins and may repeat (fuuuck), so a
// doubled letter needs at least two (ass, not as). A letter followed by '!' may not repeat (rap!ing is not rapping).
// sub: found anywhere in a word (unless the word is in OK). Otherwise the root must be the whole word, with one of
// its suffixes (and, for a few, prefixes): 'hell' and 'hells' but not 'hello'.
const SUB = ['fuck', 'fack', 'fuk', 'fuq', 'fcuk', 'phuck', 'phuk', 'phuq', 'shit', 'shyt', 'cunt', 'bitch', 'biatch', 'beyotch', 'biotch',
  'nigg', 'fagg', 'whore', 'slut', 'bastard', 'twat', 'dildo', 'blowjob', 'handjob', 'jizz', 'cocksuck', 'pussy', 'penis', 'vagina',
  'porn', 'bollock', 'douche', 'retard', 'tranny', 'wetback', 'raghead', 'towelhead', 'damn', 'dammit', 'goddam', 'piss',
  'asshole', 'arsehole', 'dumbass', 'jackass', 'smartass', 'badass', 'fatass', 'lardass', 'kissass', 'asswipe', 'asshat', 'asslick',
  'motherf', 'jerkoff', 'jackoff', 'cumshot', 'cumslut', 'kike', 'dickhead', 'dickface', 'dickwad'];
const WORD = {
  ass: ['es', 'hat', 'hats', 'hole', 'holes', 'wipe', 'wipes', 'face', 'head', 'clown', 'lick', 'kisser'], arse: ['s', 'hole', 'holes'],
  hell: ['s', 'hole', 'holes'], crap: ['s', 'py', 'pier', 'per', 'pers', 'ping', 'ped'], dick: ['s', 'head', 'heads', 'face', 'wad', 'weed', 'hole'],
  cock: ['s', 'head', 'heads', 'face', 'sucker', 'suckers'], prick: ['s'], tit: ['s', 'ty', 'ties', 'tie'], boob: ['s', 'y', 'ies'],
  cum: ['s', 'ming', 'med', 'mer'], spunk: [], hoe: ['s'], 'rap!e': ['s', 'd', 'r', 'rs'], 'rap!ing': [], rapist: ['s'], bugger: ['s', 'ed', 'ing'],
  wank: ['s', 'er', 'ers', 'ing', 'ed', 'y'], spic: ['s'], chink: ['s'], gook: ['s'], coon: ['s'], dyke: ['s'], beaner: ['s'], paki: ['s'],
  wop: ['s'], nazi: ['s'], niga: ['s', 'h'], fag: ['s', 'got', 'gots'], tard: ['s'], sht: [], btch: ['es'], fck: ['ing', 'er', 'ed', 's'],
  wtf: [], stfu: [], gtfo: [], omfg: [], azz: ['hole', 'holes'],
};
// words that contain a sub root but are fine
const OK = ['fukushima', 'fukuoka', 'fukuda', 'phuket', 'scunthorpe', 'shiitake', 'shitake', 'matsushita', 'mishit', 'mishits', 'pussycat', 'pussywillow', 'penistone', 'pissarro', 'snigger',
  'sniggers', 'sniggered', 'sniggering', 'niggle', 'niggles', 'niggled', 'niggling', 'niggly', 'retardant', 'retardants', 'cockatoo', 'amsterdam'];
const PRE = { ass: ['dumb', 'jack', 'smart', 'bad', 'fat', 'lard', 'kiss', 'big', 'half', 'hard', 'kick'], dick: ['big', 'small', 'tiny'] };

const LEET = { a: 'a4@', b: 'b8', c: 'c', e: 'e3', g: 'g69', h: 'h#', i: 'i1!|l', l: 'l1|', o: 'o0', s: 's5$z', t: 't7+', u: 'uv', z: 'z' };
const esc = s => s.replace(/[\\\]^-]/g, '\\$&');
function spell(word, exact) { // root spelling -> regex source (exact: no repeats, for suffixes and prefixes)
  let out = '';
  for (let i = 0; i < word.length; i++) {
    const c = word[i]; if (c === '!') continue;
    const cls = `[${esc(LEET[c] || c)}]`, once = exact || word[i + 1] === '!';
    out += once ? cls : cls + '+';
  }
  return out;
}
const spellExact = w => spell(w, true);
const SUB_RE = SUB.map(w => new RegExp(spell(w), 'g'));
const WORD_RE = Object.entries(WORD).map(([w, suf]) => {
  const root = w.replace(/!/g, ''), pre = PRE[root] || [];
  return new RegExp(`^(?:${pre.map(spellExact).join('|')})?${spell(w)}(?:${suf.map(spellExact).join('|')})?$`);
});

// ---------------------------------------------------------------- reading text the way a person would
const ZW = /[​-‍⁠﻿­᠎]/;
const LOOK = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'к': 'k', 'і': 'i', 'ѕ': 's', 'ј': 'j', 'һ': 'h', 'ԁ': 'd', 'ӏ': 'l',
  'в': 'b', 'м': 'm', 'т': 't', 'н': 'h', 'г': 'r', 'ё': 'e', 'α': 'a', 'ο': 'o', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'τ': 't', 'υ': 'u',
  'ρ': 'p', 'χ': 'x', 'ƒ': 'f', 'ʂ': 's', 'ɑ': 'a', 'β': 'b', 'η': 'n', 'ω': 'w', 'ѵ': 'v', 'ɡ': 'g', 'ı': 'i' };
const KEEP = /[a-z0-9@$!|+#]/; // what a word is read from (other marks inside a word are skipped: f.u.c.k)
const SPLIT = /[\s,;:?/"()[\]{}<>]/; // what separates words
function norm(c) { // one character as plain lowercase latin ('' for invisible ones)
  if (ZW.test(c)) return '';
  let d = c.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase(), o = '';
  for (const x of d) o += LOOK[x] || x;
  return o;
}
// text -> words: { s (the letters read), at (original char index for each letter of s), from, to (the word's span) }
function words(text) {
  const out = []; let cur = null, i = 0;
  for (const ch of text) {
    const len = ch.length;
    if (SPLIT.test(ch)) { cur = null; i += len; continue; }
    if (!cur) { cur = { s: '', at: [], from: i, to: i }; out.push(cur); }
    for (const x of norm(ch)) if (KEEP.test(x)) { cur.s += x; cur.at.push(i); }
    cur.to = i + len; i += len;
  }
  return out.filter(w => w.to > w.from);
}
const hasLetter = s => /[a-z]/.test(s);
function bad(s) { // a word's letters: is it a bad word (or does it hide one)?
  if (!s || !hasLetter(s)) return false;
  const plain = s.replace(/[^a-z]/g, '');
  for (const re of SUB_RE) { re.lastIndex = 0; let m; while ((m = re.exec(s))) { if (hasLetter(m[0]) && !OK.some(w => plain.includes(w))) return true; if (!m[0].length) re.lastIndex++; } }
  const t = s.replace(/^[^a-z]+|[^a-z]+$/g, ''); // 'hell!' and 'ass!!!' are still whole words
  for (const re of WORD_RE) if (re.test(s) || (t !== s && re.test(t))) return true;
  return false;
}

// ---------------------------------------------------------------- masking
export function maskProfanity(text) {
  text = String(text ?? ''); if (!text) return text;
  const W = words(text), hit = new Array(W.length).fill(false);
  for (let k = 0; k < W.length; k++) if (bad(W[k].s)) hit[k] = true;
  // spaced out: a run of one- or two-letter words that together spell one (f u c k, fu ck, a s s)
  for (let a = 0; a < W.length; a++) {
    if (hit[a] || W[a].s.length > 2) continue;
    let s = W[a].s;
    for (let b = a + 1; b < W.length && !hit[b] && W[b].s.length <= 2 && b - a < 16; b++) {
      s += W[b].s; if (!bad(s)) continue;
      const join = (x, y) => W.slice(x, y + 1).map(w => w.s).join('');
      let to = b; for (let c = b + 1; c < W.length && !hit[c] && W[c].s.length <= 2 && c - a < 16; c++) if (bad(join(a, c))) to = c; // the whole word (a s s h o l e)
      let from = a; while (from < to && bad(join(from + 1, to))) from++; // 'I f u c k': not the I
      for (let k = from; k <= to; k++) hit[k] = true; break;
    }
  }
  if (!hit.some(Boolean)) return text;
  const chars = Array.from(text), idx = []; let p = 0; for (const c of chars) { idx.push(p); p += c.length; }
  const spans = W.filter((w, k) => hit[k]);
  return chars.map((c, n) => spans.some(w => idx[n] >= w.from && idx[n] < w.to) && !/\s/.test(c) && !ZW.test(c) ? '*' : c).join('');
}
export function isProfane(text) { return maskProfanity(text) !== String(text ?? ''); }
export function cleanChat(text) { return on ? maskProfanity(text) : String(text ?? ''); }

// ---------------------------------------------------------------- names
// usernames are 3-16 of [A-Za-z0-9_]: read whole (f_u_c_k, xXFuckXx) and in parts (BigAss99 -> big, ass)
export function nameIsProfane(name) {
  name = String(name || ''); if (!name) return false;
  if (isProfane(name)) return true;
  const parts = name.split(/_+|(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])/).filter(Boolean);
  return parts.length > 1 && parts.some(p => isProfane(p));
}
function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
export function nickFor(key, sex) {
  const h = hash(String(key || '')), L = sex === 'f' ? GIRL : sex === 'm' ? BOY : (h & 1 ? GIRL : BOY);
  return L[(h >>> 1) % L.length];
}
export function displayName(raw, o = {}) {
  if (!on || !raw) return raw;
  return nameIsProfane(raw) ? nickFor(o.key || raw, o.sex) : raw;
}
const seen = new Map(); // raw name -> { key, sex }, for lines the server wrote
export function rememberPlayer(raw, o = {}) { if (raw) seen.set(String(raw), { key: o.key, sex: o.sex }); }
export function cleanLine(text) {
  text = String(text ?? ''); if (!on) return text;
  const subs = [];
  for (const [raw, o] of seen) { const d = displayName(raw, o); if (d !== raw) subs.push([raw, d]); }
  subs.sort((a, b) => b[0].length - a[0].length);
  const marks = []; // nicknames put in: not masked afterwards
  for (const [raw, d] of subs) {
    const re = new RegExp(`(^|[^A-Za-z0-9_])${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'g');
    text = text.replace(re, (m, pre) => { const tag = `\u0001${marks.length}\u0002`; marks.push(d); return pre + tag; });
  }
  text = maskProfanity(text);
  return text.replace(/\u0001(\d+)\u0002/g, (m, n) => marks[+n]);
}
