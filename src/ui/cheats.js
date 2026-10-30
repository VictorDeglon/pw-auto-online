// Cheats. Typed into the chat box (Enter opens it, online or off) and never sent: a known code is swallowed and the
// cheat runs on this machine only. The codes aren't in this file: each one is stored as a salted SHA-256, and the
// list you see in the cheat sheet is AES-GCM encrypted with a key derived from the master phrase, so only someone who
// types the phrase can read it. The phrase opens the sheet typed straight on the keyboard in play, chat closed (letters
// in a row, each within 1.5 s of the last), or in the chat box.
// In the sheet each cheat can be switched on and off (or run, for the one-shots) with a click, and its code stays on
// show so it can still be typed.
//   const CHEAT = createCheats({ run(id, arg), state(id) -> true / false for a toggle, null for a one-shot, notify(html), onOpen(), onClose() })
//   CHEAT.handle(text) -> Promise<boolean>   true = it was a cheat (or the phrase): don't send it
//   CHEAT.key(e)   every keydown in play, chat closed: watches for the phrase
//   CHEAT.open / CHEAT.close()
const DATA = {"master":"e9abf7dd72317e4f16c0b331faef7451cbc71f6b7db653142965865b1d68dce6","salt":"UawApGXlwUb4XY8UhGo7hA==","iv":"qD9pfpx5la0ZL78y","box":"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","codes":{"f4918de752d0a2ee376ca8ea220f9fada4467f35dca328e1de2c19d3640379f4":"nuke","e7d154fd72ad4acc727b169f5befec68be4c4533957a8fef153694b11e7e0cda":"god","ed4b0980eaa7e4de542d9d7de8d3758528d113ef4b2a379561c45fdc55b665c6":"fly","af80b2fdced6e865dac744dc84f2b170adfe22dfb82ee7c736230d40d404fd0a":"jet","d4019c6479232e099391d30d2af95efd0c8ea51a8c73f489b9f6ad9a38dc31c1":"rich","86ae9a7cf7292565d40f144cb622d978f4c08ecd461399e2b681d0330ce2d376":"aimbot","f6b1ce03493036165e2358b3ad18342da6126b87a92cbf876e8fa13847c7219e":"ghost","331edaf850985bb5c5e12f97647a028dcc9600382047693b02331b046597ab9f":"heat","d7e469754cb4a264ca034cf53f2a7f83252c3f04120cf023b00d40d76a15ddf3":"arsenal","490d6dea292ca1ef9b1a1fc7dd094190ccbba89bd555cea8bb20b8ee3afddbf6":"heal","673eb744cee33736aaac1b0ef3a775abe9bf7265f19f8ccc46a6c2c2d983b900":"speed","2db32e0bf47ef611870f7879d8577889ee1038979c37a5cefabd5ec1839c718d":"jump","3ddd271cd440439690062b23b94e50958919706ccf3d9e571ff0c2a9ad63af56":"boom","f66aae5c17656e4b0744f7754b52eb44972fb9a6afcfb817f6b1fad22135e621":"punch","49959495ed8e156ee306c40f1a5b6394312292ff9d48965ff9fff7afc1b499b6":"tank","152f3fce905b436f57208934bc481c4612eaf63c3540d4db9ef89e20b6d61195":"nitro","e097670d9afb1f87ae3fa16c8b2f81bc4cd59cb0b51a869e2848d8ec92851772":"moon","a09c94dae4a400dcf3362c94105e1e9c2d3573167f08764f2af058daa653ca67":"slowmo","175387054d7bb4e9b2b85193098c7bfe6aa590322cb7483bebcfe57859fdb1ec":"sunset","b235416850f685966a629ba07c78687fc43779efa94f6f64b5ea6561b2186f5f":"blink","1b6c37222678b6f3b3c2d926f7752b4f31a74c70e378a987ba7e8a77f228c0ef":"riot","63f22851c0242d7fe4db67d0ba417fb9651ca46558b63b900ef293876074dd3b":"airstrike","6dadce0278a6e25faa67ba6bf63c7a3828c90709b5231c702c31b46517cb5722":"storm","3c046820edae77173c75d3df868d50a162a1f2ecb573feecadecd5b07e609ee0":"supercar","4afe9d95201170841aadb416810cec326fcfad13eb7623c20f0b587f3ce662db":"clean"}};
const enc = new TextEncoder(), b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function sha(s) { const d = await crypto.subtle.digest('SHA-256', enc.encode('pw-auto-online:' + s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function unlock(phrase) {
  const base = await crypto.subtle.importKey('raw', enc.encode(phrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(DATA.salt), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(DATA.iv) }, key, b64(DATA.box))));
}

const TESTER = '51fbd66ef42cc7cdb698a833a3106227bb2d9ce06508dc56f2007a390d45b28b';
export function createCheats(H) {
  let sheet = null, el = null, ids = [], typed = '', typedAt = 0;
  async function openSheet(phrase) { try { if (!sheet) { sheet = await unlock(phrase); ids = await Promise.all(sheet.map(c => sha(String(c.code).split(' ')[0]).then(h => DATA.codes[h] || null))); } show(); } catch (e) { } }
  const api = {
    open: false,
    async handle(text) {
      const t = String(text || '').trim(); if (!t || t.length > 80 || !crypto.subtle) return false;
      const sp = t.indexOf(' '), head = sp < 0 ? t : t.slice(0, sp), arg = sp < 0 ? '' : t.slice(sp + 1).trim();
      if (head.toLowerCase() === '/build' || head.toLowerCase() === 'build' || head.toLowerCase() === '/builder') {
        H.run('build', arg); return true;
      }
      if (await sha(t.toLowerCase()) === TESTER) { H.run('tester_fast_travel', arg); return true; } // the tester code, stored like the others: as a salted hash
      if (await sha(t) === DATA.master) { await openSheet(t); return true; }
      const id = DATA.codes[await sha(head)]; if (!id) return false;
      H.run(id, arg); return true;
    },
    key(e) { // the phrase is only stored hashed, so each letter checks the tail of what was typed, every length up to 24
      if (e.repeat || api.open || !crypto.subtle || e.ctrlKey || e.metaKey || e.altKey || !/^[a-z]$/i.test(e.key)) return;
      const now = performance.now(); if (now - typedAt > 1500) typed = ''; typedAt = now;
      const t = typed = (typed + e.key.toLowerCase()).slice(-24);
      Promise.all([...t].map((_, i) => sha(t.slice(i)))).then(hs => {
        const i = hs.indexOf(DATA.master); if (i < 0 || api.open) return;
        typed = ''; openSheet(t.slice(i));
      });
    },
    close() { if (!api.open) return; api.open = false; if (el) el.hidden = true; H.onClose && H.onClose(); },
  };
  function show() {
    if (!el) {
      el = document.createElement('div'); el.id = 'cheatsheet'; el.hidden = true; document.body.append(el);
      el.addEventListener('click', e => {
        if (e.target === el || e.target.closest('.cx')) { api.close(); return; }
        const t = e.target.closest('button[data-t]'); // a switch: flip it and show where it landed
        if (t) { const id = ids[+t.dataset.t]; if (id) { H.run(id, ''); paint(t, H.state && H.state(id)); } return; }
        const r = e.target.closest('button[data-r]'); // a one-shot: run it and get out of the way so you see it happen
        if (r) { const id = ids[+r.dataset.r]; if (id) { api.close(); H.run(id, ''); } return; }
        const b = e.target.closest('button[data-c]'); if (!b) return;
        const code = sheet[+b.dataset.c].code;
        (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1200); }, () => { b.textContent = 'Select it'; });
      });
    }
    el.textContent = '';
    const box = document.createElement('div'); box.className = 'cs';
    const h = document.createElement('h3'); h.textContent = 'Cheat sheet'; const x = document.createElement('button'); x.className = 'cx'; x.textContent = '×';
    const sub = document.createElement('p'); sub.textContent = 'Click a switch to turn a cheat on or off, or Run for the one-shots. Or type the code in chat and press Enter. Nobody else sees it.';
    box.append(h, x, sub);
    sheet.forEach((c, i) => {
      const row = document.createElement('div'); row.className = 'cr';
      const n = document.createElement('b'); n.textContent = c.name; const d = document.createElement('small'); d.textContent = c.desc;
      const k = document.createElement('code'); k.textContent = c.code; const b = document.createElement('button'); b.dataset.c = i; b.textContent = 'Copy'; b.className = 'cp';
      const st = ids[i] && H.state ? H.state(ids[i]) : null, a = document.createElement('button');
      if (st === true || st === false) { a.dataset.t = i; a.className = 'sw'; a.setAttribute('role', 'switch'); paint(a, st); }
      else { a.dataset.r = i; a.className = 'run'; a.textContent = 'Run'; if (!ids[i]) a.disabled = true; }
      const l = document.createElement('div'); l.append(n, d); row.append(l, k, b, a); box.append(row);
    });
    el.append(box); el.hidden = false; api.open = true; H.onOpen && H.onOpen();
  }
  function paint(b, on) { b.classList.toggle('on', !!on); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.textContent = on ? 'On' : 'Off'; }
  return api;
}
