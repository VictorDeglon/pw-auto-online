// Career: the competitive side of the menus and HUD.
//   Career screen    level, XP, title, lifetime stats, today's three challenges, the three skill trees, leaderboards,
//                    and the account (guest -> username + password, sign in, sign out)
//   Play online      a leaderboard next to the servers
//   HUD              level and XP under your reputation; online, your kills, deaths and streak this session
//   toasts           level-ups, finished challenges, streak and bounty announcements
// Everything competitive comes from the Nakama server (src/progress.js, src/online/net-nakama.js). Without it
// (Firebase builds) the screen says so and the rest stays hidden.
import { ACCOUNT, PRO, NET, on as onNet } from '../online/net.js';
import { PROG, refresh, buySkill, resetSkills, onProgress, retryClaims } from '../progress.js';
import * as CLOUD from '../online/cloud.js';
import { renderGang } from './gangpanel.js';


const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TREES = [['drive', 'Driving'], ['combat', 'Combat'], ['survival', 'Survival']];
const BOARDS = [['kd', 'All-time K/D'], ['kills_week', 'Kills this week'], ['level', 'Level']];
let H = null, board = 'kd', screenOpen = false;

export async function initCareer(hooks) {
  H = hooks;
  $('acctclose').onclick = closeAccount;
  $('acctbox').addEventListener('keydown', e => { e.stopPropagation(); if (e.code === 'Escape') closeAccount(); });
  $('acctform').addEventListener('submit', submitAccount);
  onProgress((P, ev) => { renderHud(); if (screenOpen) renderCareer(); for (const e of ev || []) toast(e); updateSub(); });
  onNet('stats', renderHud); setInterval(renderHud, 2000); // the session line follows joins and leaves
  onNet('announce', a => banner(a.m));
  if (!ACCOUNT) { updateSub(); return; }
  try { await ACCOUNT.load(); } catch (e) { }
  await refresh(); retryClaims(); updateSub(); renderHud();
  CLOUD.start();
  CLOUD.check().then(c => { if (c) askToLoad(c); });
  setInterval(() => { if (ACCOUNT && !NET.server) refresh(); }, 5 * 60e3); // progress made on other computers
}
function updateSub() {
  const s = $('careersub'); if (!s) return;
  s.textContent = !ACCOUNT ? 'Needs the game server' : PROG.me ? `Level ${PROG.me.lvl} · ${PROG.me.title}` : 'Levels, skills, leaderboards';
}

// ---------------------------------------------------------------- HUD
export function renderHud() {
  const box = $('prog'); if (!box) return;
  if (!PROG.me) { box.hidden = true; return; }
  const m = PROG.me, pct = m.need ? Math.min(100, m.xp / m.need * 100) : 100;
  box.hidden = false;
  box.innerHTML = `<div class="lv"><b>LV ${m.lvl}</b> ${esc(m.title)}${m.sp ? ` <span class="sp">${m.sp} pt${m.sp > 1 ? 's' : ''}</span>` : ''}</div><div class="xp"><i style="width:${pct}%"></i></div>` +
    (NET.server ? `<div class="kd">K <b>${NET.session.sk | 0}</b> · D <b>${NET.session.sd | 0}</b>${NET.session.streak > 1 ? ` · streak <b>${NET.session.streak}</b>` : ''}</div>` : '');
}

// ---------------------------------------------------------------- toasts
function toast(e) {
  if (!H) return;
  if (e.k === 'level') { H.big(`LEVEL ${e.lvl}`, `${e.title} · +${e.sp} skill point${e.sp > 1 ? 's' : ''}${e.cash ? ` · +$${e.cash}` : ''}`, 'pass', 3.2); if (e.cash && H.addCash) H.addCash(e.cash); if (H.sfx) H.sfx('level'); } // big() sets text, not HTML
  else if (e.k === 'challenge') H.notify(`Challenge done: <b>${esc(e.name)}</b> +${e.xp} XP`, 'green', 4000);
  else if (e.k === 'xp' && e.n >= 50) H.notify(`+${e.n} XP`, 'green', 1500);
}
let bannerT = 0;
function banner(m) {
  const b = $('announce'); if (!b) return;
  b.textContent = m; b.hidden = false; b.classList.remove('out'); clearTimeout(bannerT);
  bannerT = setTimeout(() => { b.classList.add('out'); setTimeout(() => { b.hidden = true; }, 400); }, 4500);
}
function askToLoad(c) {
  if (!H) return;
  const when = new Date(c.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  H.notify(`Your account has a newer save from another computer (${esc(when)}). <button class="mini" id="cloudload">Load it</button>`, '', 15000);
  setTimeout(() => { const b = $('cloudload'); if (b) b.onclick = () => CLOUD.load(c); }, 50);
}

// ---------------------------------------------------------------- Career screen
export async function openCareer() {
  screenOpen = true; renderCareer();
  if (!ACCOUNT) return;
  await refresh(); renderCareer(); loadBoard($('lbcareer'), board, 10);
}
export function closeCareer() { screenOpen = false; }
function renderCareer() {
  renderGang(); // the gang card works online and off
  const box = $('careerbody'); if (!box) return;
  if (!ACCOUNT) { box.innerHTML = '<p class="fine">Levels, skills, challenges and leaderboards live on the game server, and this build is playing on Firebase only.</p>'; return; }
  const m = PROG.me, a = ACCOUNT.info();
  if (!m) { box.innerHTML = `<p class="fine">${esc(PROG.err ? 'Can\'t reach the game server: ' + PROG.err : 'Loading your career…')}</p>`; return; }
  const pct = m.need ? Math.min(100, m.xp / m.need * 100) : 100, hours = m.mins >= 60 ? (m.mins / 60).toFixed(1) + ' h' : m.mins + ' min';
  const acc = a.guest
    ? `<p>Playing as <b>${esc(a.username)}</b>, a guest: your career is saved on this computer only.</p><div class="row"><button class="mbtn primary small" data-acct="register">Save my progress</button><button class="mbtn small" data-acct="signin">Sign in</button></div>`
    : `<p>Signed in as <b>${esc(a.username)}</b>. Your career, save and settings follow you to any computer.</p><div class="row"><button class="mbtn small" data-acct="signout">Sign out</button></div>`;
  const daily = m.daily.map(d => `<div class="ch${d.done ? ' done' : ''}"><div><b>${esc(d.name)}</b><small>${esc(d.desc)}</small></div><span>${d.done ? 'Done' : `${d.prog} / ${d.goal}`} · ${d.xp} XP</span><div class="bar"><i style="width:${Math.min(100, d.prog / d.goal * 100)}%"></i></div></div>`).join('');
  const trees = TREES.map(([t, label]) => `<div class="tree"><h4>${label}</h4>${PROG.skills.filter(s => s.tree === t).map(s => node(s, m)).join('')}</div>`).join('');
  box.innerHTML = `
    <div class="cgrid">
      <div class="card who"><div class="eyebrow">${esc(m.title)}</div><h3>${esc(a.username || m.name)} <small>Level ${m.lvl}</small></h3>
        <div class="xpbar"><i style="width:${pct}%"></i></div><p class="fine">${m.need ? `${m.xp} / ${m.need} XP to level ${m.lvl + 1}` : 'Max level'}</p>
        <div class="stats"><div><b>${m.kd.toFixed(2)}</b><small>K/D</small></div><div><b>${m.kills}</b><small>Kills${m.npc ? ` · ${m.npc} NPC` : ''}</small></div><div><b>${m.deaths}</b><small>Deaths</small></div><div><b>${m.best}</b><small>Best streak</small></div><div><b>${hours}</b><small>Online</small></div></div>
        <div class="acct">${acc}</div></div>
      <div class="card"><h4>Today's challenges</h4>${daily}<p class="fine">New ones every day at midnight UTC. Only online play counts: kills (players and NPCs), streaks and time.</p></div>
      <div class="card"><div class="tabs" id="lbtabs">${BOARDS.map(([k, l]) => `<button data-b="${k}"${k === board ? ' class="on"' : ''}>${l}</button>`).join('')}</div><div id="lbcareer" class="lb"></div></div>
    </div>
    <div class="skillhead"><h3>Skills <small>${m.sp} point${m.sp === 1 ? '' : 's'} to spend</small></h3><button class="mbtn small" id="skreset"${m.respecToday ? ' disabled' : ''}>${m.respecToday ? 'Reset used today' : 'Reset skills (free, once a day)'}</button></div>
    <div class="trees">${trees}</div>
    <p class="fine">Each level gives a skill point (two every tenth level). Rank n of a skill costs n points. Skills work online and offline.</p>`;
  for (const b of box.querySelectorAll('[data-acct]')) b.onclick = () => openAccount(b.dataset.acct);
  for (const b of box.querySelectorAll('[data-sk]')) b.onclick = async () => { b.disabled = true; try { await buySkill(b.dataset.sk); if (H) H.skillsChanged && H.skillsChanged(); } catch (e) { H && H.notify(esc(e.message), 'red', 2500); } renderCareer(); };
  $('skreset').onclick = async () => { try { await resetSkills(); if (H) H.skillsChanged && H.skillsChanged(); } catch (e) { H && H.notify(esc(e.message), 'red', 2500); } renderCareer(); };
  for (const b of box.querySelectorAll('#lbtabs button')) b.onclick = () => { board = b.dataset.b; renderCareer(); loadBoard($('lbcareer'), board, 10); };
  loadBoard($('lbcareer'), board, 10, true);
}
function node(s, m) {
  const r = m.skills[s.id] | 0, max = r >= s.max, cost = r + 1, locked = s.req && (m.skills[s.req[0]] | 0) < s.req[1];
  const reqName = s.req ? (PROG.skills.find(x => x.id === s.req[0]) || { name: s.req[0] }).name : '';
  const pips = Array.from({ length: s.max }, (_, i) => `<i${i < r ? ' class="on"' : ''}></i>`).join('');
  const btn = max ? '<span class="maxed">Maxed</span>' : locked ? `<span class="lock">Needs ${esc(reqName)} ${s.req[1]}</span>` : `<button class="mini" data-sk="${s.id}"${m.sp < cost ? ' disabled' : ''}>Rank ${r + 1} · ${cost} pt${cost > 1 ? 's' : ''}</button>`;
  return `<div class="sk${locked ? ' locked' : ''}${r ? ' has' : ''}"><div class="t"><b>${esc(s.name)}</b><span class="pips">${pips}</span></div><small>${esc(s.desc)}</small>${btn}</div>`;
}

// ---------------------------------------------------------------- leaderboards (Career and Play online)
const boardCache = {};
export async function loadBoard(el, which, limit, cachedOnly) {
  if (!el) return;
  if (!PRO) { el.innerHTML = '<p class="fine">Leaderboards need the game server.</p>'; return; }
  const c = boardCache[which]; if (c) el.innerHTML = boardHtml(c, which);
  else el.innerHTML = '<p class="fine">Loading…</p>';
  if (cachedOnly && c && Date.now() - c.at < 30e3) return;
  try { const r = await PRO.leaderboard(which, limit); r.at = Date.now(); boardCache[which] = r; if (el.isConnected) el.innerHTML = boardHtml(r, which); }
  catch (e) { if (!c) el.innerHTML = `<p class="fine">${esc(e.message)}</p>`; }
}
function score(r, which) { return which === 'kd' ? (r.score / 1000).toFixed(2) : which === 'level' ? `LV ${r.lvl}` : r.score; }
function boardHtml(r, which) {
  if (!r.rows.length) return `<p class="fine">${which === 'kd' ? 'Nobody yet. You need 10 kills plus deaths to get on the K/D board.' : 'Nobody yet. Be the first.'}</p>`;
  const me = ACCOUNT && ACCOUNT.info().username, rows = r.rows.map(x => `<li${x.name === me ? ' class="me"' : ''}><span class="rk">${x.rank}</span><span class="nm">${esc(x.name)}<small>${esc(x.title || '')}</small></span><b>${score(x, which)}</b>${which === 'kd' ? `<small class="kd">${x.k | 0}/${x.d | 0}</small>` : ''}</li>`).join('');
  const mine = r.mine && !r.rows.some(x => x.name === me) ? `<li class="me sep"><span class="rk">${r.mine.rank}</span><span class="nm">You</span><b>${score(r.mine, which)}</b></li>` : '';
  return `<ol>${rows}${mine}</ol>`;
}
export function renderOnlineBoard() {
  const el = $('lbonline'); if (!el) return;
  if (!PRO) { el.hidden = true; return; }
  el.hidden = false; el.innerHTML = '<h4>All-time K/D</h4><div id="lbonlinelist" class="lb"></div>';
  loadBoard($('lbonlinelist'), 'kd', 10);
  const fine = $('onlinefine'); if (fine) fine.textContent = 'Your name is yours across the game. Only online play counts toward your level and the leaderboards: kills (players and NPCs), deaths, missions and achievements. Save your progress with a password in Career to play on other computers.';
}
export function boardRows(which) { return boardCache[which] ? boardCache[which].rows : null; }
export async function fetchBoard(which, limit) { if (!PRO) return null; try { const r = await PRO.leaderboard(which, limit); r.at = Date.now(); boardCache[which] = r; return r; } catch (e) { return boardCache[which] || null; } }

// ---------------------------------------------------------------- account dialog
let mode = 'register';
function openAccount(m) {
  if (m === 'signout') { signOut(); return; }
  mode = m; const reg = m === 'register';
  $('accttitle').textContent = reg ? 'Save your progress' : 'Sign in';
  $('accthint').textContent = reg ? 'Pick your name and a password. Then sign in with them on any computer to pick up where you left off.' : 'Sign in with the name and password you saved your progress with. This computer then plays as that account.';
  $('acctname').value = reg ? (ACCOUNT.info().username || '') : ''; $('acctpass').value = ''; $('accterr').textContent = '';
  $('acctgo').textContent = reg ? 'Save progress' : 'Sign in';
  $('acctbox').hidden = false; (reg && $('acctname').value ? $('acctpass') : $('acctname')).focus();
}
function closeAccount() { $('acctbox').hidden = true; }
async function submitAccount(e) {
  e.preventDefault();
  const name = $('acctname').value.trim(), pass = $('acctpass').value;
  $('acctgo').disabled = true; $('accterr').textContent = mode === 'register' ? 'Saving…' : 'Signing in…';
  try {
    if (mode === 'register') { await ACCOUNT.register(name, pass); await CLOUD.push(true); closeAccount(); H && H.notify(`Saved. Sign in as <b>${esc(name)}</b> on any computer.`, 'green', 4000); }
    else { await ACCOUNT.signIn(name, pass); closeAccount(); H && H.notify(`Signed in as <b>${esc(name)}</b>. Loading your save…`, 'green', 3000); if (!(await CLOUD.afterSignIn())) { await refresh(); renderCareer(); } return; }
    await refresh(); renderCareer();
  } catch (err) { $('accterr').textContent = err.message || String(err); }
  finally { $('acctgo').disabled = false; }
}
async function signOut() {
  if (!confirm('Sign out? This computer goes back to a new guest. Your career stays on your account.')) return;
  await CLOUD.push(true).catch(() => { });
  await ACCOUNT.signOut(); await refresh(); renderCareer(); renderHud();
}
