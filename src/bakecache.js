// The slow, deterministic results of a load (the terrain fitted under every street, which trees pass the cleanup),
// kept on the player's computer (IndexedDB), so a second visit takes them from there instead of working them out
// again. A result is keyed by the game version and the map data it came from, so an update recomputes it once; ?nocache
// ignores the store (testing). Anything that fails (private mode, a full disk) just means computing it as before.
//   const v = await bakeGet(key)        a stored value or null
//   bakePut(key, value)                 store one (typed arrays and plain objects of them), dropping older versions
//   bakeKey(name, ...parts)             `${name}|${version}|${parts}`
import { VERSION } from './version.js';
const DB = 'pw-auto-online-bake', ST = 'bake', OFF = /[?&]nocache\b/.test(location.search);
let dbp = null;
function open() {
  if (OFF || typeof indexedDB === 'undefined') return Promise.resolve(null);
  return dbp || (dbp = new Promise(res => {
    try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null); }
    catch (e) { res(null); }
  }));
}
export function bakeKey(name, ...parts) { return `${name}|${VERSION.n}|${parts.join(',')}`; }
export async function bakeGet(key) {
  const db = await open(); if (!db) return null;
  return new Promise(res => { try { const q = db.transaction(ST).objectStore(ST).get(key); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); } catch (e) { res(null); } });
}
export async function bakePut(key, value) {
  const db = await open(); if (!db) return;
  try {
    const name = key.split('|')[0], tx = db.transaction(ST, 'readwrite'), st = tx.objectStore(ST);
    const ks = st.getAllKeys(); ks.onsuccess = () => { for (const k of ks.result) if (String(k).split('|')[0] === name && k !== key) st.delete(k); }; // an older version's copy goes
    st.put(value, key);
  } catch (e) { }
}
