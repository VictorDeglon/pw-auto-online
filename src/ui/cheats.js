// Cheats. Typed into the chat box (Enter opens it, online or off) and never sent: a known code is swallowed and the
// cheat runs on this machine only. The codes aren't in this file: each one is stored as a salted SHA-256, and the
// list you see in the cheat sheet is AES-GCM encrypted with a key derived from the master phrase, so only someone who
// types the phrase can read it.
// In the sheet each cheat can be switched on and off (or run, for the one-shots) with a click, and its code stays on
// show so it can still be typed.
//   const CHEAT = createCheats({ run(id, arg), state(id) -> true / false for a toggle, null for a one-shot, notify(html), onOpen(), onClose() })
//   CHEAT.handle(text) -> Promise<boolean>   true = it was a cheat (or the phrase): don't send it
//   CHEAT.open / CHEAT.close()
const DATA = {"master":"6b745b7ff3f61a7490c6b6586253ffb01bad784245ab6f2ca22b69d3664bf8b4","salt":"rjZOpKpy6aAoz0MSPNko0Q==","iv":"yUJ7NsAxU2fSy+yG","box":"86LSk8AceWh3Zy5daIg7AcMWeRVs8lS3X5dlDBeH8aBm6zJKckovBCfuaY3d+UQDo6vgT9xiZyNgstmVcorrUImv5+vzJFyTEIcJkG3upyOLXr/npqILbVuyQPTzlgdBi2PwYtMiwM3WjuYjKXFZUdIYmr8yB/XRPP26OHyVuyJnkPWGh1DmuII9+7lcyPc7s5T4ceT/Uv5ZMviqKHNtZLscMN6X0T/LdxPajn9c/f7gcEb/gUIk0aBP2BmmB74F2SPjSPseryVaRx0wGK1uKx/1pChOzP1IlPsz+vxOh9owye94DkulyemTLOLqONSuh6HWzrEk2AQz7YPyrmAMi1LK4t9JhWAS2f7jncWj0GYCpGUHCxJoIQSnMyAsrbD9avJvOSgiLWIp9aeWLbrtfqG+zqY4dj/Zttq2kEgdZ9KTpm/1Ei2mIAxKffaQ/iFBoBCR9ZFAvKGbPj9SD93SSLzjsXd14vVnvpI/n4yJr4X/FjkclxRlSegzj3guTHl2dhbR6GifNkKNL3L9PwetVD20n8yVQJnmGn+Cs7puE9YqrzQHRFanwOgc+/s50WvdxbvX0iNZ0yk30dwXIoIthNmI3WxN0G735UGIOiKPzXA2skBQwepUrnrgqRm+kVhFMMmjpkviq98ryTUkQ9UuxIduadxYKqYhIflnU7STVlLiqxybP8WNEDI/fJHZmgeSan8pu+X9nR5Q8YvT32lCE1cLw2ADnoLhgpVh+XQ6maOpq9vgrvPYbCf65N161FQeRHVTd6D68q5RksX6Fzm8csojHzWi7v+3hGOVvXCLcjt/nKE5uNzVRS5yhOQJFANIHuETeFMwa7r98gL9lGSAyKUeSQvJ5qaHv3nMuFk3FP44vXxFGCuzbbDYpR6tdLYrNcah2b9TzpBXpPwt+QruAapnO9LwJDW7aV9XdcPlp62rWSJ9l+PPY91WwFZuhIpXFqFzU2qtBHpU8Nud+TfT2bcbWPCGvvTKncXIqGQfj9KIclcJDpMK0MY1tqJla0ObOoRnIeDQf+A+zY526ZIRKy7VKlQUR3F/Fz25tcofCGnTcAaalsv38rNE5GSEkFhfDbYCLxNtT45wKWN2OWI4Nn10EhPn27sN+yrG1Q26DoSi52YuP3Wm5OQ2p8OxUJjeU6gsL1QyJclC/do7aqYsd4J83qD7DCEk3UhtQ7HNavz/KFMg2PP4kGrwDXBVtipYm9RCvPyV/0tXscxYwSZNVbxDoZJqIN4Emv0xhc3lLvm1vA4/HUA1OmbQ5woaljUj6BuKBkTP0Kg7VcSDJwq4N7/HMmo8eoSEdUhvx97bNKXp4gaiKni4tiTehWfkWTg56pcobY44EA57HPwkqvCQENUy88AJuvdjTwR6U3H6mAXMogX8Bn/77ZJ41bIr2ylGff0YK/tJHahxUeeHagF7g1WtNegYrccncTKsGKrr3Zl8n3X4oquG/vEIUaztP3ORI007mRAK7+sRE15LtIqZuERaR/EPjMxhuxiJ5Ole30w5YukRsOpsk8hsRL5hYiHNezViKZ7IQ4VrIYd2dKSxmMFyxNFdOzlBUfCtp5KYIU7NztkyG813CyKjQKWGFyCWotpbGCd97F9ZWwAfEiil7G9BaKEehPPuTUWQDkdZQEIqim4KpKyApzNjcI8plmr92JTAkHGnBDJxtAvpMO1bvnWwpZViJpbv5Qi8mUwdpPut0Efeak4eJWbnmEGbYw0G2rMwETiFyjtuMMZI2nwCU9S0XCwKehkmX8cuy1TFFvYrkYHVi8lnCTOre5li8CUVB6uZn5wUHH3e3NdWdyx80epnAaN1E7mx+mRJVZ+BTDFapeLph9binVC3l1IhrSnEvjkidCS97MxJzJv4aVSK6DMHX12aMunq0Y5yq0wKNnKVmAzcJlnvvldNYjSQdda5vSkZA9ednCYcXrhmOvWme5DLxnxby8G0gWNGZDS1q2t4WOoFlUdniin524u9K1ga8e/wvCu7zU5PHfLvydfooQuvW8xMrsfyhTHo2INJAJ6fB4CIsokgWKT3Z6tTDRn2vK5g/2rz99OpND6I1pUIKMsRixwdjlNQ7kTxx+HVW3fQcOGCtal7/ZZqory7+rZ17AUqlLvhel90V96n9BGjsd1tAmaTVmZqbr9xinLz0V6kfWp/HO19fi0Ih9M/Zqg/JhH/qoe7S9UG6X9cC+hX6rm2XZuWnDvSJAQyEIwKwvi0KXs/AKZCs2eOjEt5aA0Q9XaHdUzEGvumRdHOFVX4wlZOmDWwypIyaZs0EpO5XC4RIDwRGlN7YAyL2FPHKNqU0BP/rJLmjpwJVDHp08xrZJVOCURxWUlQ97hOSr+nZ+LGOyzihGkyA+Y8i+716kIJ5iAmRiLWsRW+Vxt85xnEciGCWS3gekm4I5ssoTZd1/MdXuF1DtGIU1JmMi3gEZl3QR+1MUj5HgzdOA7BuKAKbmXrMZSroCju9q2mf+7tgev3obhZmgeEkXLRFCtSiVa0B7fVdK0QF+iRTDB9UX2l6L/rNgmYYE/5Mm0+grkmUgom7SmfrRzVDT7Vz+u9EnzJ+AZnnjx56E8X9vJCeboa7iS762F4hUW6UrjHm/JF85kP3Gr/by3LzEX8E4DtgRL+g0blUUhtEsFySisPQ9ZKybQtoamQribiw+PaB1gfT/LNshdvM87qQUtOYJxV327Rnf4EvkS9BYjIEzta2uwaB786o3eoJD40lehI9A6jocItIaSbGBWLFhjpP91neUGnZXEL4peWgury7ACjLONFFvfpAsjSEDVYoHhT+egjr8+5CBh8AwCYREA1bT0njuAUDQ03dShC1VKmOCErcfP8KQ6C+eBRmhcDWHJaZ+Jnkwmtn86SzjU0mcx/myUrzxf6a1R7kq5Bj+Mlcfxn3Gs/pwP8AIsWl38FmFmSj6429Qdse81u38QtrfU0x/HHy1i66OCt4D62Y6M3tU7k971mdiSMaBjOu4eL/fLZrzkHFkEr2uhjxJIU/YNpYrDAtRgDeE2EDxyNMxWpMgj+PWcOyDxY7jTorh8D4Tns0x9AZ/CeoprWFnZE8u8DN9oE6IquSi+45QLaLHDI0hy5vfgD1QzqAjFz8onI9QcfRDXIAZ38w5oppxRVExrdPycCtIp+YCBs5xV2ceAQ/ubJqAgTcN6h7XS2X0uutYDxZoD24omueGZKeQDxPiRzz0n67JcPKL4Jw885C4seprj3Cd3Wwh6Q9DFVCJWQSGBb4najfG9+WpWVyb9u+0Ol90rkWtt5vG7EMy4m+wTqIWyZYw5Wx6qoCmIQdvAEmteFaw==","codes":{"f4918de752d0a2ee376ca8ea220f9fada4467f35dca328e1de2c19d3640379f4":"nuke","e7d154fd72ad4acc727b169f5befec68be4c4533957a8fef153694b11e7e0cda":"god","ed4b0980eaa7e4de542d9d7de8d3758528d113ef4b2a379561c45fdc55b665c6":"fly","af80b2fdced6e865dac744dc84f2b170adfe22dfb82ee7c736230d40d404fd0a":"jet","d4019c6479232e099391d30d2af95efd0c8ea51a8c73f489b9f6ad9a38dc31c1":"rich","86ae9a7cf7292565d40f144cb622d978f4c08ecd461399e2b681d0330ce2d376":"aimbot","f6b1ce03493036165e2358b3ad18342da6126b87a92cbf876e8fa13847c7219e":"ghost","331edaf850985bb5c5e12f97647a028dcc9600382047693b02331b046597ab9f":"heat","d7e469754cb4a264ca034cf53f2a7f83252c3f04120cf023b00d40d76a15ddf3":"arsenal","490d6dea292ca1ef9b1a1fc7dd094190ccbba89bd555cea8bb20b8ee3afddbf6":"heal","673eb744cee33736aaac1b0ef3a775abe9bf7265f19f8ccc46a6c2c2d983b900":"speed","2db32e0bf47ef611870f7879d8577889ee1038979c37a5cefabd5ec1839c718d":"jump","3ddd271cd440439690062b23b94e50958919706ccf3d9e571ff0c2a9ad63af56":"boom","f66aae5c17656e4b0744f7754b52eb44972fb9a6afcfb817f6b1fad22135e621":"punch","49959495ed8e156ee306c40f1a5b6394312292ff9d48965ff9fff7afc1b499b6":"tank","152f3fce905b436f57208934bc481c4612eaf63c3540d4db9ef89e20b6d61195":"nitro","e097670d9afb1f87ae3fa16c8b2f81bc4cd59cb0b51a869e2848d8ec92851772":"moon","a09c94dae4a400dcf3362c94105e1e9c2d3573167f08764f2af058daa653ca67":"slowmo","175387054d7bb4e9b2b85193098c7bfe6aa590322cb7483bebcfe57859fdb1ec":"sunset","b235416850f685966a629ba07c78687fc43779efa94f6f64b5ea6561b2186f5f":"blink","1b6c37222678b6f3b3c2d926f7752b4f31a74c70e378a987ba7e8a77f228c0ef":"riot","63f22851c0242d7fe4db67d0ba417fb9651ca46558b63b900ef293876074dd3b":"airstrike","6dadce0278a6e25faa67ba6bf63c7a3828c90709b5231c702c31b46517cb5722":"storm","3c046820edae77173c75d3df868d50a162a1f2ecb573feecadecd5b07e609ee0":"supercar","4afe9d95201170841aadb416810cec326fcfad13eb7623c20f0b587f3ce662db":"clean"}};
const enc = new TextEncoder(), b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function sha(s) { const d = await crypto.subtle.digest('SHA-256', enc.encode('pw-auto-online:' + s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function unlock(phrase) {
  const base = await crypto.subtle.importKey('raw', enc.encode(phrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(DATA.salt), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(DATA.iv) }, key, b64(DATA.box))));
}

export function createCheats(H) {
  let sheet = null, el = null, ids = [];
  const api = {
    open: false,
    async handle(text) {
      const t = String(text || '').trim(); if (!t || t.length > 80 || !crypto.subtle) return false;
      const sp = t.indexOf(' '), head = sp < 0 ? t : t.slice(0, sp), arg = sp < 0 ? '' : t.slice(sp + 1).trim();
      if (head.toLowerCase() === '/build' || head.toLowerCase() === 'build' || head.toLowerCase() === '/builder') {
        H.run('build', arg); return true;
      }
      if (await sha(t) === DATA.master) { try { if (!sheet) { sheet = await unlock(t); ids = await Promise.all(sheet.map(c => sha(String(c.code).split(' ')[0]).then(h => DATA.codes[h] || null))); } show(); } catch (e) { } return true; }
      const id = DATA.codes[await sha(head)]; if (!id) return false;
      H.run(id, arg); return true;
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
