// The game server's address (nakama.json) and whether it answers, asked once per page. index.html starts this at the
// top of the page so the answer is in by the time src/online/net.js (which waits for it) runs.
export async function nakamaConfig() {
  const q = new URLSearchParams(location.search).get('nk');
  if (q === 'firebase') return null;
  const file = q === 'local' ? 'nakama.local.json' : 'nakama.json';
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(file, { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
    if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return null;
    const c = await r.json(); return c && c.host && c.key ? c : null;
  } catch (e) { return null; }
}
// a configured game server that doesn't answer (down, or the connection blocks it) means Firebase, so online play
// never disappears with it
export async function reachable(c) {
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`${c.ssl ? 'https' : 'http'}://${c.host}:${c.port || (c.ssl ? 443 : 7350)}/healthcheck`, { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
    return r.ok;
  } catch (e) { return false; }
}
let probed = null;
export const probe = () => probed || (probed = (async () => {
  const cfg = await nakamaConfig(), ok = !!cfg && await reachable(cfg);
  import(ok ? './net-nakama.js' : './net-firebase.js').catch(() => { }); // net.js loads the one it uses: start fetching it now
  return { cfg, ok };
})());
