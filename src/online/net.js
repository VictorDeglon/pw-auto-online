// Online play: picks the transport once, at load.
//   Nakama   when the site has a game server: nakama.json next to index.html ({ host, port, ssl, key }), written at
//            deploy time and never committed (it names the server). ?nk=local reads nakama.local.json instead, for
//            testing against a local or tunnelled server. A copy served from this computer (localhost) leaves the
//            real server alone unless asked with ?nk=prod, so test runs don't make accounts on it.
//            See server/nakama/README.md.
//   Firebase otherwise (Realtime Database, net-firebase.js), as before.
// Both export the same interface; ACCOUNT and PRO (accounts, progression, leaderboards) exist only with Nakama.
import { createLocalNet } from '../games/localroom.js';
import { probe, reachable } from './nkconfig.js'; // nakama.json and the first healthcheck, started by index.html
const { cfg: CFG, ok: NK_UP } = await probe(), NK = NK_UP ? CFG : null;
if (CFG && !NK) console.warn('[net] the game server is not answering: playing online over Firebase only (no accounts, levels or leaderboards this time)');
const impl = NK ? await import('./net-nakama.js') : await import('./net-firebase.js');
if (NK) impl.configure(NK);
// no game server: the crew garages run in this browser instead, solo (src/games/localroom.js)
const LOCAL = impl.GAMENET ? null : createLocalNet(impl.NET, impl.emit);
// the game server didn't answer at load: keep checking, and say when it's back (a reload switches to it)
if (CFG && !NK) { const iv = setInterval(async () => { if (await reachable(CFG)) { clearInterval(iv); impl.emit('announce', { m: 'The game server is back: reload the page to play with accounts, levels and everyone in the crew garages.' }); } }, 60000); }

export const NET = impl.NET, HOME = impl.HOME, ACCOUNT = impl.ACCOUNT || null, PRO = impl.PRO || null;
export const on = impl.on, serverNow = impl.serverNow, explain = impl.explain, initNet = impl.initNet, watchServers = impl.watchServers;
export const ping = impl.ping, validName = impl.validName, join = impl.join, unpack = impl.unpack;
export const leave = LOCAL ? (...a) => { LOCAL.stop(); return impl.leave(...a); } : impl.leave;
// in a local crew-garage world your position stays here (the others would see you 90 km east of town)
export const sendState = LOCAL ? (st, skin) => { if (!LOCAL.inWorld) impl.sendState(st, skin); LOCAL.state(st, skin); } : impl.sendState;
export const sendChat = impl.sendChat, feed = impl.feed, sendHit = impl.sendHit, sendEvent = impl.sendEvent, setRuin = impl.setRuin;
export const sendCrowd = impl.sendCrowd, clearCrowd = impl.clearCrowd, connectHome = impl.connectHome, disconnectHome = impl.disconnectHome;
export const serverName = impl.serverName;
export const trafficHit = impl.trafficHit || (() => { }), trafficTake = impl.trafficTake || (() => { }); // the room's traffic (Nakama only)
export const pedHit = impl.pedHit || (() => { }); // the room's people (Nakama only)
export const GAMENET = impl.GAMENET || LOCAL; // crew garages: the game server runs them, or this browser does (solo)
