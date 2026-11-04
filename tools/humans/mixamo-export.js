// Exports the animations listed in tools/humans/mixamo.json from Mixamo as packs (zips of FBX files, one per clip,
// named by its key, plus the X Bot in its T-pose), using the session of a signed-in mixamo.com tab. Paste this into
// that tab's console, then:
//   const list = <the "clips" array from tools/humans/mixamo.json>;
//   const url = await mixamoPack(list.slice(0, 25), 'pw-anims-1');   // a signed link, good for 5 minutes
//   curl -sSfL -o build/mixamo/zips/pw-anims-1.zip '<url>'
// then run node tools/humans/mixamo.mjs. One pack at a time; Mixamo's own site does the same calls.
(() => {
  const API = 'https://www.mixamo.com/api/v1';
  const H = () => ({ Authorization: 'Bearer ' + localStorage.getItem('access_token'), 'X-Api-Key': 'mixamo2', Accept: 'application/json', 'Content-Type': 'application/json' });
  const get = path => fetch(API + path, { headers: H() }).then(r => { if (!r.ok) throw new Error(path + ': HTTP ' + r.status); return r.json(); });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function find(q, desc) { // the animation whose description is exactly desc, among the results for q
    for (let page = 1; page <= 4; page++) {
      const s = await get(`/products?page=${page}&limit=48&order=&type=Motion&query=${encodeURIComponent(q)}`);
      const hit = s.results.find(r => r.description === desc); if (hit) return hit;
      if (page >= s.pagination.num_pages) break;
    }
    return null;
  }
  async function clip(c, character) { // one entry of the pack: the animation's settings, named by the game's key
    const p = await find(c.q, c.desc); if (!p) throw new Error(`not found: ${c.key} (${c.desc})`);
    const d = await get(`/products/${p.id}?similar=0&character_id=${character}`), g = d.details.gms_hash;
    return { ...g, params: (g.params || []).map(x => x[1]).join(','), name: c.key, inplace: !!(c.inplace && d.details.supports_inplace) };
  }
  window.mixamoPack = async (list, name) => {
    const character = (await get('/characters/primary')).primary_character_id, gms = [];
    for (const c of list) { gms.push(await clip(c, character)); await wait(150); }
    const body = { character_id: character, gms_hash: gms, preferences: { format: 'fbx7_2019', mesh_motionpack: 't-pose', fps: '30', reducekf: '0' }, product_name: name, type: 'MotionPack' };
    const r = await fetch(API + '/animations/export', { method: 'POST', headers: H(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error('export: HTTP ' + r.status);
    for (let i = 0; i < 150; i++) {
      await wait(2000);
      const m = await get(`/characters/${character}/monitor`);
      if (m.status === 'completed') return m.job_result;
      if (m.status === 'failed') throw new Error('export failed: ' + JSON.stringify(m.job_result));
    }
    throw new Error('export: still not done after 5 minutes');
  };
})();
