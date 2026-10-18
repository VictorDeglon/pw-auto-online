// Cloud save: everything the game keeps in localStorage (the save with money, garage, weapons and achievements; your
// look; graphics, input, look and sky settings) is copied to your Nakama account (storage save/game, only you can read
// or write it), so it follows your username and password to another computer.
//   This computer is the source of truth while you play on it: changes go up once a minute and when the page hides.
//   A save made somewhere else since this computer last synced is offered, not forced (askToLoad).
//   Signing in to an account on a new computer loads that account's save (and backs up what was here).
import { ACCOUNT } from './net.js';

const KEYS = ['pw-auto-online-v3', 'pw-auto-online-profile', 'pw-auto-online-gfx', 'pw-auto-online-post', 'pw-auto-online-input', 'pao.sky'];
const META = 'pw-auto-online-sync', BACKUP = 'pw-auto-online-backup';
const meta = (() => { try { return Object.assign({ at: 0, hash: '' }, JSON.parse(localStorage.getItem(META) || '{}')); } catch (e) { return { at: 0, hash: '' }; } })();
const saveMeta = () => { try { localStorage.setItem(META, JSON.stringify(meta)); } catch (e) { } };
function bundle() { const o = {}; for (const k of KEYS) { try { const v = localStorage.getItem(k); if (v != null) o[k] = v; } catch (e) { } } return o; }
function hash(o) { const s = JSON.stringify(o); let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36) + ':' + s.length; }
function apply(keys) {
  try { localStorage.setItem(BACKUP, JSON.stringify({ t: Date.now(), keys: bundle() })); } catch (e) { }
  for (const k of KEYS) { try { if (keys && keys[k] != null) localStorage.setItem(k, keys[k]); } catch (e) { } }
}

let busy = false, timer = 0;
export async function push(force) {
  if (!ACCOUNT || busy) return false;
  const b = bundle(), h = hash(b); if (!force && h === meta.hash) return false;
  busy = true;
  try { const t = Date.now(); await ACCOUNT.writeSave({ t, keys: b }); meta.at = t; meta.hash = h; saveMeta(); return true; }
  catch (e) { console.warn('[cloud] save failed', e && e.message || e); return false; }
  finally { busy = false; }
}
// is there a save from another computer that's newer than what this one last synced?
export async function check() {
  if (!ACCOUNT) return null;
  try { const c = await ACCOUNT.readSave(); if (!c || !c.keys) return null; if (c.t > meta.at + 2000 && hash(c.keys) !== hash(bundle())) return c; } catch (e) { }
  return null;
}
// load a cloud save into this computer (the old one is kept as a backup) and restart the game on it
export function load(c) { apply(c.keys); meta.at = c.t; meta.hash = hash(bundle()); saveMeta(); location.reload(); }
// after signing in to an account on this computer: its save wins (if it has one)
export async function afterSignIn() {
  const c = ACCOUNT ? await ACCOUNT.readSave().catch(() => null) : null;
  if (c && c.keys) { load(c); return true; }
  meta.at = 0; meta.hash = ''; saveMeta(); await push(true); return false;
}
export function start() {
  if (!ACCOUNT || timer) return;
  timer = setInterval(() => push(false), 60e3);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push(false); });
}
