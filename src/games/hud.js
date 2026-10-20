// The crew-garage HUD: a status bar at the top (game, phase, clock), a panel on the right (race standings, who's
// still hiding), big centre text (countdowns, "KNOCKED OUT"), a results card, key hints at the bottom, and the black
// fade the tunnel trips happen behind.
const CSS = `
#gmbar{position:fixed;z-index:6;top:calc(52px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);pointer-events:none;display:flex;align-items:stretch;gap:0;width:max-content;max-width:94vw;
  font:600 16px/1 var(--ui);color:var(--paper);text-shadow:0 1px 2px rgba(0,0,0,.6);filter:drop-shadow(0 4px 10px rgba(0,0,0,.35))}
#gmbar>div{background:rgba(10,14,24,.86);padding:6px 12px;display:flex;flex-direction:column;justify-content:center;gap:2px}
#gmbar .gt{border-left:4px solid var(--gold);font:400 19px/1 var(--display);letter-spacing:.05em;text-transform:uppercase}
#gmbar .gt small{display:block;font:600 12px/1.1 var(--ui);letter-spacing:.12em;color:var(--dim);margin-top:3px}
#gmbar .gc{font:400 26px/1 var(--display);min-width:84px;text-align:center;letter-spacing:.03em}
#gmbar .gc.warn{color:#ffd23f} #gmbar .gc.hot{color:#ff5d5d}
#gmbar .gs{max-width:360px;font:600 15px/1.15 var(--ui);color:var(--paper);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#gmbar .gs b{color:var(--gold);font-weight:700}
#gmside{position:fixed;z-index:6;right:18px;top:calc(150px + env(safe-area-inset-top,0px));width:230px;pointer-events:none;background:rgba(10,14,24,.82);
  border-top:3px solid var(--gold);font:600 15px/1.25 var(--ui);color:var(--paper);padding:6px 10px 8px}
#gmside h5{margin:0 0 4px;font:400 14px/1.2 var(--display);letter-spacing:.1em;color:var(--dim);text-transform:uppercase}
#gmside .r{display:flex;gap:6px;align-items:baseline;white-space:nowrap;overflow:hidden}
#gmside .r .n{flex:1;overflow:hidden;text-overflow:ellipsis} #gmside .r .v{color:var(--dim)} #gmside .r.me .n{color:var(--gold)} #gmside .r.out{opacity:.45;text-decoration:line-through}
#gmbig{position:fixed;z-index:7;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;text-align:center}
#gmbig .t{font:400 min(19vw,150px)/0.95 var(--display);color:var(--paper);letter-spacing:.02em;text-shadow:0 4px 0 rgba(0,0,0,.55),0 0 30px rgba(0,0,0,.4)}
#gmbig .s{font:600 min(6vw,30px)/1.2 var(--ui);color:var(--paper);text-shadow:0 2px 0 rgba(0,0,0,.6);margin-top:6px;max-width:80vw}
#gmbig.go .t{color:#7cd36b} #gmbig.red .t{color:#ff5d5d} #gmbig.gold .t{color:var(--gold)} #gmbig.small .t{font-size:min(11vw,84px)}
#gmbig .t{animation:gmpop .35s cubic-bezier(.2,1.4,.4,1)} @keyframes gmpop{from{transform:scale(1.6);opacity:0}to{transform:none;opacity:1}}
#gmres{position:fixed;z-index:7;left:50%;top:50%;transform:translate(-50%,-50%);min-width:min(460px,90vw);max-width:92vw;pointer-events:none;background:rgba(10,14,24,.93);
  border-top:4px solid var(--gold);padding:14px 20px 16px;font:600 18px/1.35 var(--ui);color:var(--paper);box-shadow:0 18px 50px rgba(0,0,0,.5)}
#gmres h3{margin:0 0 2px;font:400 34px/1.1 var(--display);letter-spacing:.04em;text-transform:uppercase}
#gmres p{margin:0 0 8px;color:var(--dim)}
#gmres .row{display:flex;gap:10px} #gmres .row .n{flex:1} #gmres .row .v{color:var(--gold)}
#gmhint{position:fixed;z-index:6;left:50%;bottom:calc(60px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);pointer-events:none;
  font:600 16px/1.3 var(--ui);color:var(--paper);text-shadow:0 2px 0 rgba(0,0,0,.7);text-align:center;width:min(820px,90vw)}
#gmhint kbd{display:inline-block;min-width:18px;padding:1px 6px;margin:0 2px;border-radius:4px;background:rgba(244,241,234,.92);color:#0a1020;font:700 13px/1.25 var(--ui);text-shadow:none}
#gmfade{position:fixed;z-index:9;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .35s ease}
#gmfade.on{opacity:1}
#gmfade .m{position:absolute;left:50%;top:60%;transform:translateX(-50%);font:600 18px/1.3 var(--ui);letter-spacing:.14em;text-transform:uppercase;color:rgba(244,241,234,.7)}
#gmscope{position:fixed;z-index:5;inset:0;pointer-events:none;overflow:hidden}
#gmscope .box{position:absolute;left:0;top:0;border:2px solid rgba(255,214,64,.55);border-radius:4px;transition:border-color .1s}
#gmscope .box.lock{border:3px solid #ff3b30;box-shadow:0 0 12px rgba(255,59,48,.8)}
#gmscope .box.lock::after{content:'LOCK';position:absolute;left:50%;top:-20px;transform:translateX(-50%);font:700 13px/1 var(--ui);letter-spacing:.14em;color:#ff3b30}
@media (max-width:700px){#gmside{display:none} #gmbar .gs{display:none}}
body.gm-in #regionbanner, body.gm-in #street, body.gm-in #helpline, body.gm-in #objective{display:none!important}
body.gm-in #killfeed{top:calc(118px + env(safe-area-inset-top,0px))}`;

const $ = id => document.getElementById(id);
let made = false, bigT = 0, resT = 0;
function make() {
  if (made) return; made = true;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const add = (id, html = '') => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; d.hidden = id !== 'gmfade' && id !== 'gmscope'; document.body.appendChild(d); return d; };
  add('gmbar', '<div class="gt"></div><div class="gc"></div><div class="gs"></div>'); add('gmside'); add('gmbig', '<div class="t"></div><div class="s"></div>');
  add('gmres'); add('gmhint'); add('gmfade', '<div class="m"></div>'); add('gmscope');
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const clock = ms => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const lapTime = ms => { if (!(ms >= 0)) return '-'; const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };

export const HUD = {
  esc,
  on(on) { make(); document.body.classList.toggle('gm-in', on); for (const id of ['gmbar', 'gmhint']) $(id).hidden = !on; if (!on) { $('gmside').hidden = true; $('gmbig').hidden = true; $('gmres').hidden = true; this.boxes([]); } },
  bar(title, sub, clockText, cls, status) {
    make(); const b = $('gmbar');
    b.children[0].innerHTML = `${esc(title)}<small>${esc(sub || '')}</small>`;
    const c = b.children[1]; c.textContent = clockText || ''; c.hidden = !clockText; c.className = 'gc' + (cls ? ' ' + cls : '');
    b.children[2].innerHTML = status ? `<span>${status}</span>` : ''; b.children[2].hidden = !status; // one flex item: the text flows on one line
  },
  side(title, rows) { // rows: [{ n, v, me, out }]
    make(); const s = $('gmside'); if (!rows || !rows.length) { s.hidden = true; return; }
    s.hidden = false; s.innerHTML = `<h5>${esc(title)}</h5>` + rows.map(r => `<div class="r${r.me ? ' me' : ''}${r.out ? ' out' : ''}"><span class="n">${esc(r.n)}</span><span class="v">${esc(r.v || '')}</span></div>`).join('');
  },
  big(text, sub = '', cls = '', secs = 2) { make(); const b = $('gmbig'); b.className = cls; b.children[0].textContent = text; b.children[1].textContent = sub; b.hidden = false; const t0 = b.children[0]; t0.style.animation = 'none'; void t0.offsetWidth; t0.style.animation = ''; bigT = secs; },
  results(title, sub, rows, secs = 8) { // rows: [{ n, v }]
    make(); const r = $('gmres');
    r.innerHTML = `<h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}` + (rows || []).map(x => `<div class="row"><span class="n">${esc(x.n)}</span><span class="v">${esc(x.v || '')}</span></div>`).join('');
    r.hidden = false; resT = secs;
  },
  hint(html) { make(); $('gmhint').innerHTML = html; },
  fade(on, msg = '') { make(); const f = $('gmfade'); f.classList.toggle('on', on); f.firstChild.textContent = msg; return new Promise(r => setTimeout(r, on ? 380 : 0)); },
  // aim-assist boxes: [{ x, y, w, h, lock }] in CSS pixels
  boxes(list) {
    make(); const s = $('gmscope'); while (s.children.length < list.length) { const d = document.createElement('div'); d.className = 'box'; s.appendChild(d); }
    for (let i = 0; i < s.children.length; i++) {
      const d = s.children[i], b = list[i]; if (!b) { d.style.display = 'none'; continue; }
      d.style.display = ''; d.className = 'box' + (b.lock ? ' lock' : ''); d.style.width = b.w + 'px'; d.style.height = b.h + 'px'; d.style.transform = `translate(${b.x - b.w / 2}px,${b.y - b.h / 2}px)`;
    }
  },
  update(dt) { if (bigT > 0 && (bigT -= dt) <= 0) $('gmbig').hidden = true; if (resT > 0 && (resT -= dt) <= 0) $('gmres').hidden = true; },
  clearBig() { if (made) { $('gmbig').hidden = true; bigT = 0; } },
};
