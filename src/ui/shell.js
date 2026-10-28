// Menus and the online HUD: loading screen, main menu (servers, character, settings, controls), the username prompt,
// chat, kill feed and the Tab player list. index.html owns the game; it hands this module a few hooks:
//   ready()                 the world is built
//   startOffline()          free roam
//   startOnline(sid, name)  after the name was claimed: drop into the world as that player
//   toMenu()                back from the pause menu to the main menu (leaves the server)
//   wear(skin)              swap the player's avatar (resolves when loaded)
//   gfx, setVoices(on), voices(), sens(), setSens(v)
import { NET, initNet, watchServers, ping, join, leave, sendChat, on as onNet, serverName, validName, explain } from '../online/net.js';
import { SERVERS, MAX_PLAYERS } from '../online/config.js';
import { HUMANS, skinList, skinLabel, skinRole, ensureAvatar, makeHuman, animHuman } from '../humans.js';
import { CATEGORIES } from '../people.js';
import { ACHIEVEMENTS, renderAchievements, achievementCount, bump as achBump } from './achievements.js';
import { PRESETS, ORDER, saveGfx } from '../gfx.js';
import { remoteList, colorOf } from '../online/remote.js';
import { shownName, shownChat, onShownChange, MOD } from '../online/shown.js';
import { openCareer, closeCareer, renderOnlineBoard } from './career.js';

const $ = id => document.getElementById(id);
const PROFILE_KEY = 'pw-auto-online-profile';
export const profile = (() => { try { return Object.assign({ name: '', skin: '', names: {}, last: '' }, JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}')); } catch (e) { return { name: '', skin: '', names: {}, last: '' }; } })();
export function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) { } }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let H = null, screen = null, unwatch = null, counts = {}, pings = {};
const TIPS = [
  'Every server is the same Poway. Pick one with friends on it, or a quiet one to learn the roads.',
  'Space mid-air turns a jump into a glide. Off-road hills launch you further than you think.',
  'Hold Tab online to see who is on your server. Enter opens chat.',
  'The dealer in the Kirkham Way business park sells everything with a trigger.',
  'Bring a car into your garage to store it, repair it and tune it at the body shop.',
  'Police ignore car theft. The owner does not: they will take the next car and come after you.',
  'Running people over brings the Sheriff, but only up to two stars.',
  'Too slow? Settings has a Potato preset and dynamic resolution for older computers.',
];

// ---------------------------------------------------------------- loading screen
let tipI = 0, tipTimer = 0;
export function bootProgress(frac, msg) {
  const p = Math.max(0, Math.min(1, frac)) * 100;
  $('loadfill').style.width = p + '%'; $('loadcar').style.left = p + '%';
  if (msg) $('loadmsg').textContent = msg;
}
function nextTip() { const t = $('boottip'); t.style.opacity = 0; setTimeout(() => { t.textContent = TIPS[tipI++ % TIPS.length]; t.style.opacity = 1; }, 350); }
export function bootDone(msg) {
  bootProgress(1, msg); clearInterval(tipTimer);
  const go = $('bootgo'); go.hidden = false; go.focus();
  const enter = () => { removeEventListener('keydown', key); $('boot').classList.add('out'); setTimeout(() => { $('boot').hidden = true; }, 650); showMenu(); };
  const key = e => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); enter(); } };
  go.onclick = enter; addEventListener('keydown', key);
}
export function bootFail(msg) { $('loadmsg').textContent = msg; clearInterval(tipTimer); }

// ---------------------------------------------------------------- main menu
export function showMenu(scr) {
  $('menu').hidden = false; $('menu').style.display = '';
  open(scr || (H && H.ready() ? null : null));
}
export function hideMenu() { $('menu').hidden = true; closeChar(); if (unwatch) { unwatch(); unwatch = null; } screen = null; }
function open(name) {
  for (const id of ['online', 'career', 'character', 'achievements', 'settings', 'controls']) { $('scr-' + id).hidden = id !== name; }
  for (const b of document.querySelectorAll('#mnav [data-go]')) b.classList.toggle('on', b.dataset.go === name);
  if (screen === 'character' && name !== 'character') closeChar();
  if (screen === 'career' && name !== 'career') closeCareer();
  if (screen === 'online' && name !== 'online' && unwatch) { unwatch(); unwatch = null; }
  screen = name;
  if (name === 'online') openServers();
  if (name === 'character') openChar();
  if (name === 'career') openCareer();
  if (name === 'settings') openSettings();
  if (name === 'achievements') renderAchievements($('achgrid'));
  achSub();
}
export function achSub() { const e = $('achsub'); if (e) e.textContent = `${achievementCount()} / ${ACHIEVEMENTS.length}`; }

// ---------------------------------------------------------------- servers
function renderServers() {
  const box = $('servers'); box.textContent = '';
  for (const s of SERVERS) {
    const n = counts[s.id] || 0, full = n >= MAX_PLAYERS;
    const b = document.createElement('button'); b.className = 'srv' + (full ? ' full' : ''); b.style.setProperty('--acc', s.accent); b.disabled = !NET.ready || full;
    const title = document.createElement('b'); title.textContent = s.name;
    const tag = document.createElement('i'); tag.textContent = s.tag;
    const meta = document.createElement('div'); meta.className = 'meta';
    const left = document.createElement('span'); left.innerHTML = `<span class="dot"></span>${n}/${MAX_PLAYERS} players`;
    const right = document.createElement('span'); right.textContent = pings[s.id] != null ? pings[s.id] + ' ms' : '';
    meta.append(left, right);
    const bar = document.createElement('div'); bar.className = 'bar'; const fill = document.createElement('i'); fill.style.width = (n / MAX_PLAYERS * 100) + '%'; bar.append(fill);
    b.append(title, tag, meta, bar);
    b.onclick = () => askName(s.id);
    box.append(b);
  }
}
async function openServers() {
  renderServers();
  $('netstate').textContent = 'Connecting…';
  let ok = false;
  try { ok = await initNet(); } catch (e) { console.warn('[net] init', e); $('netstate').textContent = explain(e) + ' '; const r = document.createElement('button'); r.className = 'mbtn small'; r.textContent = 'Try again'; r.onclick = () => openServers(); $('netstate').append(r); return; }
  if (!ok) { $('netstate').textContent = 'Online play is not set up in this build yet (no Firebase project configured). Free roam works.'; return; }
  $('netstate').textContent = H.ready() ? 'Pick a server. Same town on each, different people.' : 'Pick a server. You can join as soon as Poway finishes loading.';
  if (!unwatch) unwatch = watchServers(c => { counts = c; renderServers(); updateOnlineSub(); });
  renderOnlineBoard();
  for (const s of SERVERS) ping(s.id).then(ms => { pings[s.id] = ms; if (screen === 'online') renderServers(); });
}
function updateOnlineSub() { const tot = Object.values(counts).reduce((a, b) => a + b, 0); $('onlinesub').textContent = tot ? `${tot} playing now` : 'Pick a server'; }

// ---------------------------------------------------------------- username prompt (every join)
let joining = null;
function askName(sid) {
  joining = sid;
  $('namesrv').textContent = 'Joining ' + serverName(sid);
  $('nameerr').textContent = '';
  $('namein').value = profile.names[sid] || profile.name || '';
  $('namebox').hidden = false; $('namein').focus(); $('namein').select();
}
async function submitName(e) {
  e.preventDefault();
  const name = $('namein').value.trim(), sid = joining;
  if (!validName(name)) { $('nameerr').textContent = 'Use 3 to 16 letters, numbers or underscores.'; return; }
  if (!H.ready()) { $('nameerr').textContent = 'Poway is still loading. One moment…'; return; }
  $('namego').disabled = true; $('nameerr').textContent = 'Claiming your name…';
  const res = await join(sid, name, profile.skin || HUMANS.player || '', H.state());
  $('namego').disabled = false;
  if (!res.ok) { $('nameerr').textContent = res.err; return; }
  const actualName = NET.name || name;
  profile.name = actualName; profile.names[sid] = actualName; profile.last = sid; saveProfile();
  $('namebox').hidden = true; hideMenu();
  chatClear(); sysChat(`Joined ${serverName(sid)} as ${actualName}. Enter to chat, hold L for players.`);
  H.startOnline(sid, actualName);
}

// ---------------------------------------------------------------- character (skin selector) with a turntable preview
let cv = null, cr = null, cscene = null, ccam = null, crig = null, craf = 0, sel = '', csex = '', ccat = '', clast = 0;
function openChar() {
  const list = $('charitems');
  if (!HUMANS.manifest) { list.textContent = 'People are still loading…'; setTimeout(() => { if (screen === 'character') openChar(); }, 800); return; }
  sel = profile.skin || HUMANS.player || ''; renderSkins(); preview(sel);
}
function renderSkins() {
  const q = $('charq').value.trim().toLowerCase(), list = $('charitems'); list.textContent = '';
  for (const s of skinList()) {
    if (csex && s.sex !== csex) continue;
    if (ccat && s.category !== ccat) continue;
    if (q && !(s.label + ' ' + s.role).toLowerCase().includes(q)) continue;
    const b = document.createElement('button'); b.textContent = s.label; b.dataset.n = s.name;
    const r = document.createElement('small'); r.textContent = s.role; b.append(r);
    if (s.name === sel) b.classList.add('sel'); if (s.name === (profile.skin || HUMANS.player)) b.classList.add('worn');
    b.onclick = () => { sel = s.name; for (const x of list.children) x.classList.toggle('sel', x.dataset.n === sel); preview(sel); };
    list.append(b);
  }
}
async function preview(name) {
  $('charname').textContent = name ? skinLabel(name) : ''; $('charrole').textContent = name ? skinRole(name) : '';
  $('wearbtn').disabled = !name || name === (profile.skin || HUMANS.player);
  if (!name || !HUMANS.ready) return;
  const THREE = H.THREE;
  if (!cr) {
    cv = $('charcv'); cr = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); cr.setPixelRatio(Math.min(devicePixelRatio, 1.5)); cr.outputColorSpace = THREE.SRGBColorSpace;
    cscene = new THREE.Scene(); ccam = new THREE.PerspectiveCamera(30, 36 / 46, 0.1, 20); ccam.position.set(0, 1.05, 4.6); ccam.lookAt(0, 0.92, 0);
    cscene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2a1a, 1.4)); const d = new THREE.DirectionalLight(0xffe2c4, 2.2); d.position.set(2, 3, 3); cscene.add(d);
    const r = new THREE.DirectionalLight(0xff7a2f, 1.2); r.position.set(-2, 1.5, -2); cscene.add(r);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.8, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })); floor.rotation.x = -Math.PI / 2; cscene.add(floor);
  }
  const ok = await ensureAvatar(name); if (!ok || sel !== name || screen !== 'character') return;
  const nr = makeHuman(name); if (!nr) return;
  if (cr.compileAsync) await cr.compileAsync(nr.g, ccam, cscene).catch(() => { }); // compile off the frame, then swap
  if (sel !== name || screen !== 'character') return;
  if (crig) cscene.remove(crig.g); crig = nr; cscene.add(crig.g);
  // the preview runs at 30 fps and only resizes its canvas when the box changes (setSize every frame reallocates it)
  if (!craf) { clast = performance.now(); let cw = 0, ch = 0, acc = 0; const loop = t => { craf = requestAnimationFrame(loop); const dt = Math.min(0.1, (t - clast) / 1000); clast = t; acc += dt; if (acc < 1 / 30) return;
    if (crig) { crig.g.rotation.y += acc * 0.6; animHuman(crig, 0, acc, null); } acc = 0;
    const w = cv.clientWidth || 360, h = cv.clientHeight || 460; if (w !== cw || h !== ch) { cw = w; ch = h; cr.setSize(w, h, false); } cr.render(cscene, ccam); }; craf = requestAnimationFrame(loop); }
}
function closeChar() { if (craf) cancelAnimationFrame(craf); craf = 0; }
export function previewOpen() { return craf !== 0 && screen === 'character'; }
async function wear() {
  if (!sel) return; $('wearbtn').disabled = true;
  const ok = await H.wear(sel); if (!ok) { $('wearbtn').disabled = false; return; }
  profile.skin = sel; saveProfile(); renderSkins(); $('skinsub').textContent = skinLabel(sel);
}

// ---------------------------------------------------------------- settings
let pick = null;
const clockLabel = h => { const m = Math.round(h * 60) % 1440, hh = Math.floor(m / 60); return `${(hh + 11) % 12 + 1}:${String(m % 60).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
function openSettings() {
  const G = H.gfx; pick = pick || G.id;
  const box = $('presets'); box.textContent = '';
  for (const id of ORDER) {
    const P = PRESETS[id], b = document.createElement('button'); b.className = 'preset' + (id === pick ? ' on' : '');
    const t = document.createElement('b'); t.textContent = P.label; const n = document.createElement('span'); n.textContent = P.note; b.append(t, n);
    if (G.auto && id === G.id) { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'Recommended'; b.prepend(tag); }
    b.onclick = () => { pick = id; openSettings(); };
    box.append(b);
  }
  $('gfxnote').textContent = G.auto ? `Picked “${PRESETS[G.id].label}” for this computer. Change it if the game feels slow or looks rough.` : `Using “${PRESETS[G.id].label}”.`;
  $('dynres').checked = G.dynamic; $('voiceson').checked = H.voices(); $('cleanchat').checked = MOD.on;
  for (const b of $('lookseg').children) { b.classList.toggle('on', +b.dataset.l === H.look()); b.onclick = () => { H.setLook(+b.dataset.l); openSettings(); }; }
  $('sens').value = H.sens(); $('sensv').textContent = (+H.sens()).toFixed(2) + '×';
  const sky = H.sky(); $('skylock').checked = sky.lock; $('skyset').classList.toggle('off', !sky.lock);
  $('skyhour').value = sky.hour; $('skyhourv').textContent = clockLabel(sky.hour);
  const wx = $('skywx'); wx.textContent = '';
  for (const [k, name] of H.weathers()) { const b = document.createElement('button'); b.textContent = name; b.classList.toggle('on', k === sky.weather); b.onclick = () => { H.setSky({ weather: k }); openSettings(); }; wx.append(b); }
  $('gfxapply').hidden = pick === G.id && $('dynres').checked === G.dynamic;
}
function applyGfx() { saveGfx(pick, $('dynres').checked); location.reload(); }

// ---------------------------------------------------------------- chat, kill feed, player list
let chatOpen = false;
export function isChatOpen() { return chatOpen; }
export function openChat() { chatOpen = true; $('chat').hidden = false; $('chatin').placeholder = NET.server ? 'Say something…' : 'Offline: nobody to talk to'; $('chat').classList.add('open'); $('chatform').hidden = false; $('chatin').value = ''; $('chatin').focus(); }
let chatClosedT = -1e9;
export function chatClosedAgo() { return performance.now() - chatClosedT; } // ms since the chat box closed
export function closeChat() { const was = chatOpen; chatOpen = false; if (was) { chatClosedT = performance.now(); if (H && H.chatClosed) H.chatClosed(); } if (!NET.server) $('chat').hidden = true; $('chat').classList.remove('open'); $('chatform').hidden = true; $('chatin').blur(); }
function chatLine(html, cls) { // html: a string, or a function that makes it (redrawn when the bad-words setting changes)
  const log = $('chatlog'), d = document.createElement('div'); d.className = 'cm ' + (cls || ''); if (typeof html === 'function') d._html = html; d.innerHTML = d._html ? d._html() : html; log.append(d);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  setTimeout(() => { d.style.opacity = 0.0; }, 12000);
}
function sysChat(t) { chatLine(typeof t === 'function' ? () => esc(t()) : esc(t), 'sys'); }
function chatClear() { $('chatlog').textContent = ''; }
function onChat(m) { chatLine(() => `<b style="color:${m.mine ? 'var(--gold)' : colorOf(m.u)}">${esc(m.mine ? m.n : shownName(m.n, m.u))}</b>${esc(m.mine ? m.m : shownChat(m.m))}`); } // yours as you typed it
const WNAME = w => String(w || '').replace(/_/g, ' ');
function onFeed(f) {
  const nm = (n, me) => `<b style="color:${me ? 'var(--gold)' : colorOf(f.u)}">${esc(shownName(n) || '?')}</b>`;
  if (f.k === 'join') { sysChat(() => `${shownName(f.a)} joined.`); return; }
  if (f.k === 'leave') { sysChat(() => `${shownName(f.a)} left.`); return; }
  const render = () => { // redrawn when the bad-words setting changes
    if (f.k === 'kill') return `${nm(f.a, f.a === NET.name)}<span class="w">☠ ${esc(WNAME(f.w) || 'killed')}</span>${nm(f.b, f.b === NET.name)}`;
    if (f.k === 'death') return `${nm(f.a, f.mine)}<span class="w">was wasted${f.b ? ' · ' + esc(WNAME(f.b)) : ''}</span>`;
    if (f.k === 'busted') return `${nm(f.a, f.mine)}<span class="w">got busted by the Sheriff</span>`;
    if (f.k === 'wreck') return `${nm(f.a, f.mine)}<span class="w">wrecked</span>${nm(f.b, f.b === NET.name)}<span class="w">'s car</span>`;
    return '';
  };
  const html = render(); if (!html) return;
  const kf = $('killfeed'), d = document.createElement('div'); d.className = 'kf' + (f.a === NET.name || f.b === NET.name ? ' me' : ''); d._html = render; d.innerHTML = html; kf.prepend(d);
  while (kf.children.length > 5) kf.lastChild.remove();
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 700); }, 7000);
}
export function showPlayers(show) {
  const el = $('plist'); if (!el) return;
  if (!show || !NET.server) { el.hidden = true; return; }
  const remotes = remoteList();
  const remMap = new Map(remotes.map(r => [r.id, r]));
  const rows = [{ name: (NET.name || 'You') + ' (you)', color: 'var(--gold)', hp: H.state().hp, me: true }];
  for (const [id, p] of NET.players) {
    const rem = remMap.get(id);
    const hp = rem && rem.hp !== undefined ? rem.hp : (p.p ? p.p.h : 100);
    const dead = rem && rem.dead !== undefined ? rem.dead : (p.p ? p.p.d : 0);
    const car = rem ? rem.car : !!(p.p && p.p.c);
    const color = rem ? rem.color : colorOf(id);
    rows.push({ name: shownName(p.n, id, p.s) || 'Player', color, hp, dead, car });
  }
  el.innerHTML = `<h3>${esc(serverName(NET.server))} · ${rows.length}/${MAX_PLAYERS}</h3>` + rows.map(r => `<div><b style="color:${r.color}">${esc(r.name)}</b><span>${r.dead ? (r.dead === 2 ? 'busted' : 'wasted') : r.car ? 'driving' : 'on foot'} · ${Math.max(0, Math.round(r.hp))} hp</span></div>`).join('');
  el.hidden = false;
}
export function serverBadge() {
  const b = $('srvbadge'); if (!b) return;
  if (!NET.server) { b.hidden = true; return; }
  const s = SERVERS.find(x => x.id === NET.server);
  if (s) b.style.setProperty('--acc', s.accent);
  b.innerHTML = `${esc(s ? s.name : NET.server)}<i>${NET.players.size + 1}/${MAX_PLAYERS}${NET.connected ? '' : ' · reconnecting'}</i>`;
  b.hidden = false;
}

export async function leaveServer() { await leave(); serverBadge(); $('chat').hidden = true; closeChat(); $('killfeed').textContent = ''; }

// ---------------------------------------------------------------- wiring
export function initShell(hooks) {
  H = hooks;
  nextTip(); tipTimer = setInterval(nextTip, 5200);
  for (const b of document.querySelectorAll('#mnav [data-go]')) b.onclick = () => open(screen === b.dataset.go ? null : b.dataset.go);
  $('nameform').addEventListener('submit', submitName);
  $('namecancel').onclick = () => { $('namebox').hidden = true; joining = null; };
  $('namebox').addEventListener('keydown', e => { if (e.code === 'Escape') { $('namebox').hidden = true; joining = null; } e.stopPropagation(); });
  $('charq').addEventListener('input', renderSkins);
  { const cats = $('charcat'), mk = (id, label) => { const b = document.createElement('button'); b.textContent = label; b.dataset.c = id; if (id === ccat) b.classList.add('on'); b.onclick = () => { ccat = id; for (const x of cats.children) x.classList.toggle('on', x.dataset.c === id); renderSkins(); }; cats.append(b); };
    mk('', 'Everyone'); for (const c of CATEGORIES) mk(c.id, c.label); }
  for (const b of $('charsex').children) b.onclick = () => { csex = b.dataset.s; for (const x of $('charsex').children) x.classList.toggle('on', x === b); renderSkins(); };
  $('wearbtn').onclick = wear;
  $('dynres').onchange = () => openSettings();
  $('voiceson').onchange = () => H.setVoices($('voiceson').checked);
  $('cleanchat').onchange = () => { MOD.on = $('cleanchat').checked; };
  onShownChange(() => { // the bad-words setting changed: redraw what's on screen
    for (const d of [...$('chatlog').children, ...$('killfeed').children]) if (d._html) d.innerHTML = d._html();
    if (!$('plist').hidden) showPlayers(true);
  });
  $('sens').oninput = () => { H.setSens(+$('sens').value); $('sensv').textContent = (+$('sens').value).toFixed(2) + '×'; };
  $('skylock').onchange = () => { H.setSky({ lock: $('skylock').checked }); openSettings(); };
  $('skyhour').oninput = () => { H.setSky({ hour: +$('skyhour').value }); $('skyhourv').textContent = clockLabel(+$('skyhour').value); };
  $('gfxapply').onclick = applyGfx;
  $('gfxsub').textContent = `Graphics: ${PRESETS[H.gfx.id].label}`;
  if (profile.skin) $('skinsub').textContent = skinLabel(profile.skin);
  $('chatform').addEventListener('submit', async e => { // cheats are checked first and never leave this machine
    e.preventDefault(); const t = $('chatin').value; $('chatin').value = ''; closeChat();
    if (!t.trim()) return; if (H.cheat && await H.cheat(t)) return;
    if (NET.server) { sendChat(t); achBump('chats'); }
  });
  $('chatin').addEventListener('keydown', e => { e.stopPropagation(); if (e.code === 'Escape') closeChat(); });
  $('chatin').addEventListener('keyup', e => e.stopPropagation());
  onNet('chat', onChat); onNet('feed', onFeed);
  onNet('chat:error', m => sysChat('Message not sent: ' + m));
  onNet('connection', c => { serverBadge(); if (NET.server) sysChat(c ? 'Reconnected.' : 'Connection lost, retrying…'); });
  onNet('player:add', () => { serverBadge(); if ($('plist') && !$('plist').hidden) showPlayers(true); });
  onNet('player:remove', () => { serverBadge(); if ($('plist') && !$('plist').hidden) showPlayers(true); });
  onNet('player:update', () => { if ($('plist') && !$('plist').hidden) showPlayers(true); });
  onNet('kicked', why => { H.toMenu().then(() => { open('online'); $('netstate').textContent = why || 'You were disconnected from the server.'; }); });
  // the pause menu
  $('pchar').onclick = () => { H.toMenuScreen('character'); };
  $('pset').onclick = () => { H.toMenuScreen('settings'); };
  $('pleave').onclick = () => H.toMenu();
}
export function openScreen(name) { showMenu(); open(name); }
