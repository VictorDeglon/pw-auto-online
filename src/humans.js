// Rocketbox people (Microsoft Rocketbox Avatar Library, MIT): the player, pedestrians and deputies.
//
// assets/humans/ is built by tools/humans/build_rocketbox.py: one GLB per avatar (80-bone 3ds Max Biped) and one GLB
// per animation clip. Every avatar shares the skeleton, so clips bind by bone name. Outlaws (assets/humans/outlaws.json)
// are characters from Sketchfab with rigs of their own: tools/humans/fit_outlaw.py renames their main bones to the
// Biped's, and the clips are re-aimed onto their rest pose here (retarget), once per avatar and clip. At load we fetch the player, the
// police avatars, a random pool of civilians and the clips; after that `makeHuman` is synchronous, so the old
// `buildRig` call sites keep working. If anything fails to load, the game keeps the blocky rigs.
//
// The returned rig matches the blocky one where other code touches it: g (placed in the world), body (tipped over
// when someone is knocked down), gun / phone (props in the right hand), armR (a Group on the right hand, story props
// hang off it), punch, phase. Animation: idle / walk / run / sprint chosen from speed, plus talk and wave.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { person, nameAll } from './people.js';
import { splitSkin, dress } from './wardrobe.js'; // a skin can carry a look: "Male_Adult_18~a2104…" (src/wardrobe.js)
export { splitSkin };

const BASE = 'assets/humans/';
import { RESERVED, SWIM } from './reserved.js';
export const HUMANS = { ready: false, manifest: null, proto: new Map(), clips: { m: {}, f: {} }, pools: { civ: [], police: [], plain: [], swim: [] }, player: null, prepare: null, once: new Set(), mx: null };

function prep(scene) {
  // stand on y = 0, face +Z, about 1.75 m tall whatever the export units were
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene), h = box.max.y - box.min.y;
  const s = h > 0.5 && h < 3 ? 1 : 1.75 / Math.max(h, 1e-3);
  const foot = scene.getObjectByName('Bip01_L_Foot'), toe = scene.getObjectByName('Bip01_L_Toe0');
  let yaw = 0;
  if (foot && toe) { const a = foot.getWorldPosition(new THREE.Vector3()), b = toe.getWorldPosition(new THREE.Vector3()); yaw = -Math.atan2(b.x - a.x, b.z - a.z); }
  const root = new THREE.Group(); root.add(scene); scene.scale.multiplyScalar(s); scene.rotation.y = yaw;
  root.updateMatrixWorld(true); const b2 = new THREE.Box3().setFromObject(root); scene.position.y -= b2.min.y;
  scene.traverse(o => {
    if (!o.isMesh) return; o.castShadow = true; o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { m.envMapIntensity = 0.5; if (m.alphaTest === 0 && m.transparent) { m.transparent = false; m.alphaTest = 0.5; } }
  });
  return root;
}

function stripRootMotion(clip) {
  // the walk / run cycles move the root forward; the game moves the character itself, so keep only the bob
  for (const t of clip.tracks) {
    if (!t.name.endsWith('.position')) continue;
    const bone = t.name.slice(0, -9);
    if (bone !== 'Bip01' && bone !== 'Bip01_Pelvis') continue;
    // freeze whichever axes drift (the travel); keep the one that only bobs. Works whatever the axes and units are.
    const v = t.values, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < v.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], v[i + c]); hi[c] = Math.max(hi[c], v[i + c]); }
    const R = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    for (let c = 0; c < 3; c++) if (hi[c] - lo[c] > 0.35 * R) for (let i = 0; i < v.length; i += 3) v[i + c] = v[c];
  }
  return clip;
}

const CORE = ['idle', 'walk', 'run', 'sprint', 'talk', 'wave'];
// the Mixamo clips (tools/humans/mixamo.mjs): a pack per sex, {sex}_core.glb with the game and {sex}_more.glb once the
// world is up. anim/mixamo.json lists them, which play once (a roll, a punch) and each walk's ground speed (v, m/s).
async function loadPack(loader, s, p) {
  try { const g = await loader.loadAsync(`${BASE}anim/${s}_${p}.glb`); for (const c of g.animations) HUMANS.clips[s][c.name] = c; }
  catch (e) { console.warn('[humans] clips', s, p, e); }
}
async function loadClip(loader, s, c) {
  try { const g = await loader.loadAsync(`${BASE}anim/${s}_${c}.glb`); const clip = g.animations[0]; if (clip) { clip.name = c; clip.tracks = clip.tracks.filter(t => t.name.startsWith('Bip01')); HUMANS.clips[s][c] = ['walk', 'run', 'sprint', 'injured', 'stroll'].includes(c) ? stripRootMotion(clip) : clip; } }
  catch (e) { console.warn('[humans] clip', s, c, e); }
}
// the rest of the clips (crouch, cheer, dance, laugh, listen, talk2, look, injured, stroll), fetched in the background
export async function loadExtraClips() {
  if (HUMANS.mx && !HUMANS.mx.moreIn) { HUMANS.mx.moreIn = true; const loader = new GLTFLoader(); await Promise.all(['m', 'f'].map(s => loadPack(loader, s, 'more'))); return; }
  if (!HUMANS.extra || !HUMANS.extra.length) return;
  const loader = new GLTFLoader(), list = HUMANS.extra; HUMANS.extra = [];
  for (const c of list) await Promise.all(['m', 'f'].map(s => loadClip(loader, s, c)));
}
export function hasClip(r, k) { return !!(r && (r.actions[k] || (HUMANS.clips[r.sex] || {})[k])); }
export async function loadHumans(opts = {}) {
  const loader = new GLTFLoader(), poolSize = opts.pool ?? 14;
  const res = await fetch(BASE + 'manifest.json'); if (!res.ok) throw new Error('humans manifest: HTTP ' + res.status);
  const man = await res.json(); HUMANS.manifest = man;
  // the outlaws join the list; the first of them is the skin a new player starts in
  try { const o = await fetch(BASE + 'outlaws.json').then(r => r.ok ? r.json() : null); if (o && o.avatars) { for (const a of o.avatars) man.avatars.push({ ...a, kind: a.kind || 'outlaw' }); if (o.player) man.player = o.player; HUMANS.outlaws = o; } } catch (e) { console.warn('[humans] outlaws', e); }
  const all = man.avatars, rnd = () => Math.random();
  const free = a => !RESERVED.has(a.name) && !SWIM(a.name); // story / dealer skins and swimwear never join the random pools
  const police = all.filter(a => a.kind === 'police' && free(a)).map(a => a.name);
  const plain = all.filter(a => a.kind === 'business' && free(a)).map(a => a.name);
  // the crowd is townspeople: everyday and business clothes. Uniforms (fire, medical, construction, pilots, chefs,
  // security, delivery, gardeners) and athletes are roles, loaded when someone in that role is needed (pickAvatar)
  const civ = all.filter(a => (a.kind === 'civilian' || a.kind === 'business') && a.name !== man.player && free(a)).map(a => a.name);
  HUMANS.roles = {}; for (const a of all) if (!['civilian', 'business', 'police', 'military'].includes(a.kind) && free(a)) (HUMANS.roles[a.kind] || (HUMANS.roles[a.kind] = [])).push(a.name);
  HUMANS.swimAll = all.filter(a => SWIM(a.name)).map(a => a.name);
  for (let i = civ.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [civ[i], civ[j]] = [civ[j], civ[i]]; }
  const pools = { civ: civ.slice(0, poolSize), police };
  pools.plain = plain.filter(n => pools.civ.includes(n)).concat(plain.slice(0, 2));
  const pick = splitSkin(opts.player).avatar; HUMANS.playerLook = splitSkin(opts.player).look;
  const me = pick && all.some(a => a.name === pick) && !RESERVED.has(pick) ? pick : man.player; // the skin the player picked (never a reserved one)
  const want = [...new Set([me, ...pools.civ, ...police, ...pools.plain])];
  // opts.crowd === false: only the player's avatar now; loadCrowd() fetches everyone else after the loading screen,
  // and until then buildRig() falls back to the blocky people
  // an outlaw player is animated from a Rocketbox body's clips (clipFor), so one of those loads with it
  const meA = all.find(a => a.name === me), src = meA && meA.file ? pools.civ.find(n => (all.find(a => a.name === n) || {}).sex === (meA.sex || 'm')) || pools.civ[0] : null;
  const now = opts.crowd === false ? [me, ...(src ? [src] : [])] : want;
  HUMANS.crowd = pools; HUMANS.later = want.filter(n => !now.includes(n));
  await Promise.all(now.map(n => loadAvatar(loader, n)));
  const mx = await fetch(BASE + 'anim/mixamo.json').then(r => r.ok ? r.json() : null).catch(() => null);
  if (mx) { HUMANS.mx = mx; HUMANS.once = new Set(mx.once); await Promise.all(['m', 'f'].map(s => loadPack(loader, s, 'core'))); }
  else { // the Rocketbox clips, one file each
    await Promise.all(['m', 'f'].flatMap(s => man.clips.filter(c => CORE.includes(c)).map(c => loadClip(loader, s, c))));
    HUMANS.extra = man.clips.filter(c => !CORE.includes(c)); // crowd and emote clips: loadExtraClips() after the world is up
  }
  fillPools(HUMANS.later.length ? me : null); // the player's own skin stays out of the crowd until the crowd is in
  HUMANS.player = HUMANS.proto.has(me) ? me : HUMANS.proto.has(man.player) ? man.player : HUMANS.pools.civ[0];
  HUMANS.ready = HUMANS.proto.size > 0 && Object.keys(HUMANS.clips.m).length > 0;
  console.info('[humans]', HUMANS.proto.size, 'avatars,', Object.keys(HUMANS.clips.m).length + Object.keys(HUMANS.clips.f).length, 'clips; player', HUMANS.player);
  return HUMANS.ready;
}

const fileOf = a => BASE + (a && a.file || (a ? a.name : '') + '.glb');
function protoOf(g, a) { return { root: prep(g.scene), sex: (a || {}).sex || 'm', retarget: !!(a && a.file), clips: {} }; }
async function loadAvatar(loader, n) {
  const a = HUMANS.manifest.avatars.find(x => x.name === n);
  try { const g = await loader.loadAsync(fileOf(a || { name: n })); HUMANS.proto.set(n, protoOf(g, a)); }
  catch (e) { console.warn('[humans] avatar', n, e); }
}
function fillPools(skip) {
  for (const k of ['civ', 'police', 'plain']) HUMANS.pools[k] = (HUMANS.crowd[k] || []).filter(n => HUMANS.proto.has(n) && n !== skip);
}
// the rest of the people (locals, deputies), after loadHumans({ crowd: false }); each joins its pool as soon as it's
// in and its shaders are built (ensureAvatar runs HUMANS.prepare first: someone who spawned wearing it before that
// compiled its shaders inside a frame). Resolves to how many were fetched.
export async function loadCrowd() {
  const list = HUMANS.later || []; HUMANS.later = [];
  if (!HUMANS.crowd || !list.length) return 0;
  await Promise.all(list.map(n => ensureAvatar(n).then(() => fillPools(null))));
  console.info('[humans] crowd in:', HUMANS.proto.size, 'avatars');
  return list.length;
}

// load one more avatar on demand (a skin someone picked); resolves true when makeHuman(name) will work
const pending = new Map();
export function ensureAvatar(name) {
  name = splitSkin(name).avatar;
  if (HUMANS.proto.has(name)) return Promise.resolve(true);
  if (!HUMANS.manifest || !HUMANS.manifest.avatars.some(a => a.name === name)) return Promise.resolve(false);
  if (pending.has(name)) return pending.get(name);
  const info = HUMANS.manifest.avatars.find(a => a.name === name);
  const p = new GLTFLoader().loadAsync(fileOf(info)).then(async g => { const P = protoOf(g, info); if (HUMANS.prepare) await HUMANS.prepare(P.root); HUMANS.proto.set(name, P); return true; }) // prepare: index.html builds its shaders first
    .catch(e => { console.warn('[humans] avatar', name, e); return false; }).finally(() => pending.delete(name));
  pending.set(name, p); return p;
}
// every avatar a player may wear (no uniforms): [{ name, sex, group, label }]
export function skinList() {
  if (!HUMANS.manifest) return [];
  nameAll(HUMANS.manifest.avatars);
  return HUMANS.manifest.avatars.filter(a => !RESERVED.has(a.name)).map(a => { const p = person(a); return { name: a.name, sex: a.sex, kind: a.kind, label: p.full, role: p.role, category: p.category }; });
}
export function skinLabel(n) {
  n = splitSkin(n).avatar; const a = HUMANS.manifest && HUMANS.manifest.avatars.find(x => x.name === n);
  if (!a) return String(n).replace(/_/g, ' ');
  nameAll(HUMANS.manifest.avatars); const p = person(a); return p.full;
}
export function skinRole(n) { n = splitSkin(n).avatar; const a = HUMANS.manifest && HUMANS.manifest.avatars.find(x => x.name === n); return a ? person(a).role : ''; }
// make the player wear this avatar from now on (it must be loaded)
export function setPlayerAvatar(name) { const { avatar, look } = splitSkin(name); if (HUMANS.proto.has(avatar) && !RESERVED.has(avatar)) { HUMANS.player = avatar; HUMANS.playerLook = look; } }
// swimwear avatars load on demand the first time you're somewhere they belong
export function loadSwim() { if (HUMANS.swimLoading || !HUMANS.swimAll) return; HUMANS.swimLoading = true; for (const n of HUMANS.swimAll) ensureAvatar(n).then(ok => { if (ok && !HUMANS.pools.swim.includes(n)) HUMANS.pools.swim.push(n); }); }

// kind: 'player' | 'police' | 'plain' (undercover) | 'civ'
export function pickAvatar(kind) {
  if (kind === 'player') return HUMANS.player;
  if (kind === 'swim') { const sw = HUMANS.pools.swim; if (sw.length) return sw[Math.floor(Math.random() * sw.length)]; kind = 'civ'; }
  const role = HUMANS.roles && HUMANS.roles[kind];
  if (role) { // a uniform: from those already loaded; the rest load in the background for next time
    const have = role.filter(n => HUMANS.proto.has(n)); if (!role.asked) { role.asked = true; for (const n of role) ensureAvatar(n); }
    if (have.length) return have[Math.floor(Math.random() * have.length)];
    kind = 'civ';
  }
  const pool = HUMANS.pools[kind] && HUMANS.pools[kind].length ? HUMANS.pools[kind] : HUMANS.pools.civ;
  return pool[Math.floor(Math.random() * pool.length)];
}

// gun / phone: meshes to put in the right hand (the caller's existing prop meshes)
export function makeHuman(skin, props = {}) {
  const { avatar: name, look } = splitSkin(skin);
  const P = HUMANS.proto.get(name); if (!P) return null;
  const inst = skClone(P.root), g = new THREE.Group(), body = new THREE.Group(); body.add(inst); g.add(body);
  const hand = inst.getObjectByName('Bip01_R_Hand'), armR = new THREE.Group();
  if (hand) { hand.add(armR); armR.scale.setScalar(1 / Math.max(1e-3, hand.getWorldScale(new THREE.Vector3()).x)); }
  const mixer = new THREE.AnimationMixer(inst), actions = {}; // actions are made the first time a clip is wanted (a hundred clips each, on every person, all ticking, would be a lot)
  const r = { human: true, name, sex: HUMANS.clips[P.sex] && Object.keys(HUMANS.clips[P.sex]).length ? P.sex : 'm', g, body, inst, mixer, actions, cur: null, once: null, idleK: IDLES[Math.floor(Math.random() * IDLES.length)], armR, armL: new THREE.Group(), legL: new THREE.Group(), legR: new THREE.Group(), phase: Math.random() * 10, punch: 0, gun: props.gun || new THREE.Object3D(), phone: props.phone || new THREE.Object3D() };
  const holder = new THREE.Group(); holder.add(r.gun); r.gun.position.set(0, 0, 0.08); r.gun.rotation.set(0, 0, 0); g.add(holder); r.gun = holder; // placed by holdWeapon
  r.phone.position.set(0.05, 0, 0.03); armR.add(r.phone);
  r.proto = P;
  setAction(r, 'idle', 0); r.mixer.setTime(Math.random() * 3);
  if (look) try { dress(THREE, r, P.root, look); } catch (e) { console.warn('[wardrobe]', e); } // hats, glasses, chains, bags; height and build
  return r;
}

// a rig that's gone for good: its skeleton's bone texture is the GPU's to free (one per character, never shared)
export function freeHuman(r) {
  if (!r || !r.human) return;
  r.g.traverse(o => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
  if (r.mixer) { r.mixer.stopAllAction(); r.mixer.uncacheRoot(r.inst); }
}

// the clip a rig plays for a key: women walk their own walk, outlaws swagger (when those clips are in)
const ALIAS = { f: { walk: 'fwalk' }, outlaw: { walk: 'swagger' } }, IDLES = ['idle', 'idle', 'idle2', 'idle3', 'bored']; // ('look' turns the whole body round: a pose, not an idle)
function clipKey(r, k) { const a = (ALIAS[r.proto && r.proto.retarget ? 'outlaw' : r.sex] || {})[k]; return a && (HUMANS.clips[r.sex] || {})[a] ? a : k; }
function makeAction(r, k) { // made when first wanted (clips that arrived after this rig was made too)
  const ck = clipKey(r, k), c = r.proto ? clipFor(r.proto, ck, HUMANS.clips[r.sex] || {}) : (HUMANS.clips[r.sex] || {})[ck]; if (!c) return null;
  const a = r.actions[k] = r.mixer.clipAction(c); if (HUMANS.once.has(ck)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
  return a;
}
function setAction(r, k, fade = 0.25) {
  if (!r.actions[k] && !makeAction(r, k)) { if (k === 'idle' || (!r.actions.idle && !makeAction(r, 'idle'))) return; k = 'idle'; } // no such clip: stand
  if (r.cur === k) return;
  const next = r.actions[k], prev = r.cur && r.actions[r.cur]; if (!next) return; // (nothing to play it from yet)
  next.reset(); next.setEffectiveWeight(1); next.play();
  if (prev && fade > 0) prev.crossFadeTo(next, fade, false); else if (prev) prev.setEffectiveWeight(0);
  r.cur = k;
}

// a one-shot (a roll, a jump, a punch, a hit, getting up): it plays over whatever the legs were doing and then lets go.
// o: { from, to } (a part of the clip, 0..1), speed, fade (in), out (seconds before the end it starts fading back),
// hold (stay on the last frame until another one-shot or stopOnce: a body that fell). r.onceN counts them, so the game
// can tell other players (src/online/remote.js plays the same ones).
export function playOnce(r, k, o = {}) {
  if (!r || !r.human || !hasClip(r, k)) return false;
  if (r.cur === k) r.cur = null; // the same move again: from the top
  setAction(r, k, o.fade ?? 0.1);
  const a = r.actions[k]; if (!a || r.cur !== k) return false;
  const dur = a.getClip().duration, to = Math.min(1, o.to ?? 1); a.time = (o.from || 0) * dur; a.timeScale = o.speed || 1;
  if (to < 1) { a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; } else if (HUMANS.once.has(clipKey(r, k))) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
  r.once = { k, end: to * dur, out: o.hold ? 0 : o.out ?? 0.15, hold: !!o.hold }; r.onceK = k; r.onceO = o; r.onceN = (r.onceN || 0) + 1;
  return true;
}
export function stopOnce(r) { if (r && r.once) r.once = null; }
// the ground a walk or run clip covers at its own pace (m/s, measured by tools/humans/mixamo.mjs), so feet don't slide
const V0 = { walk: 1.35, run: 3.6, sprint: 5.6, stroll: 1.05, injured: 3 }; // the Rocketbox clips'
const paceOf = (r, k) => { const ck = clipKey(r, k); return (HUMANS.mx && HUMANS.mx.v[ck]) || V0[k] || 1.4; };
// what to play for a speed and a mode: standing still, a mode is a pose or an emote (wave, cheer, dance, sit, …) when
// there's a clip of that name; moving, it picks the gait. r.longGun: the gun in hand is a long one; r.strafe: -1 left,
// 1 right, 2 backwards (aiming while moving)
function pick(r, speed, mode) {
  const has = k => hasClip(r, k);
  if (mode === 'fall' && has('fall')) return 'fall';
  if (speed < 0.25) {
    if (mode === 'aim') return has('pistolidle') ? (r.longGun ? 'rifleidle' : 'pistolidle') : 'idle';
    if (mode === 'fists') return has('fightidle') ? 'fightidle' : 'idle';
    if (mode === 'talk' || mode === 'phone') return mode === 'phone' && has('phone') ? 'phone' : 'talk';
    if (mode === 'hands') return has('terrified') ? 'terrified' : 'idle';
    for (const [m, k] of [['injured', 'injuredidle'], ['drunk', 'drunkidle'], ['swim', 'tread']]) if (mode === m) return has(k) ? k : 'idle';
    if (mode && has(mode)) return mode;
    return has(r.idleK) ? r.idleK : 'idle';
  }
  const gait = speed < 2.6 ? 'walk' : speed < 5.2 ? 'run' : 'sprint', or = (k, fb = gait) => has(k) ? k : fb;
  if (mode === 'aim') return r.strafe === -1 ? or('strafeL') : r.strafe === 1 ? or('strafeR') : r.strafe === 2 ? or('walkback') : speed < 2.6 ? or(r.longGun ? 'riflewalk' : 'pistolwalk') : or(r.longGun ? 'riflerun' : 'pistolrun');
  if (mode === 'swim') return or('swim');
  if (mode === 'crouch') return or('crouchwalk');
  if (mode === 'injured') return or('injured');
  if (mode === 'drunk') return or('drunk');
  if (mode === 'stroll' && speed < 1.5) return or('stroll');
  if (mode === 'phone' && speed < 2.2) return or('textwalk');
  return gait;
}
// a punch (the game sets r.punch when someone swings): a cross, a hook, an uppercut or a kick, the strike itself
const PUNCHES = [['punch', { from: 0.48, to: 0.8, speed: 1.3 }], ['hook', { from: 0.38, to: 0.64, speed: 1.3 }], ['uppercut', { from: 0.2, to: 0.75, speed: 1.4 }], ['punch', { from: 0.48, to: 0.8, speed: 1.3 }], ['kick', { from: 0.15, to: 0.75, speed: 1.4 }]];
// speed in m/s; mode as in the blocky animRig ('phone', 'aim', 'hands', 'fists', 'talk', 'wave') or any clip's name
export function animHuman(r, speed, dt, mode) {
  let k = null, ts = 1;
  if (r.punch > 0 && !r.punchOn) { r.punchOn = true; const [pk, po] = PUNCHES[Math.floor(Math.random() * PUNCHES.length)]; playOnce(r, pk, po); } else if (!(r.punch > 0)) r.punchOn = false;
  if (r.once) { // a one-shot in progress
    const a = r.actions[r.once.k];
    if (a && r.cur === r.once.k && (a.time < r.once.end - r.once.out * a.timeScale || r.once.hold)) { k = r.once.k; if (r.once.hold && a.time >= r.once.end) a.paused = true; } else r.once = null;
  }
  if (!k) {
    k = pick(r, speed, mode); if (speed >= 0.25 && ((HUMANS.mx && HUMANS.mx.v[clipKey(r, k)]) || V0[k])) ts = speed / paceOf(r, k); // gaits keep pace with the ground
    setAction(r, k, r.cur && r.actions[r.cur] && HUMANS.once.has(clipKey(r, r.cur)) ? 0.2 : 0.25);
    k = r.cur || k; if (r.actions[k]) r.actions[k].timeScale = Math.min(2.2, Math.max(0.5, ts));
  }
  r.mixer.update(dt);
  r.phone.visible = mode === 'phone';
  if (r.punch > 0) r.punch -= dt;
  if (r.ownAim) return; // the player's arms are posed by the game with the camera's aim
  if (mode === 'hands') { handsUp(r); return; }
  if (mode === 'aim') holdWeapon(r, _t.set(Math.sin(r.g.rotation.y), 0, Math.cos(r.g.rotation.y)), { twoHand: true, grip: 0.12, dt });
  else if (r.gun.visible) holdWeapon(r, null, { dt });
}

// ---- outlaws: the clips re-aimed onto a rig of another shape
// Each mapped bone follows the Biped bone of the same name in world space: the turn the Biped bone has made since its
// rest pose is applied to the outlaw's bone, after first turning the outlaw's bone so that at rest it points and rolls
// the way the Biped's does (two directions per bone: along it, and across the palm for hands and fingers, forward for
// arms, to the left for the rest). Without the roll, a rig resting in a T-pose kept its hands flat out sideways while its
// arms hung down. Fingers map too when the rig has Mixamo's (…HandIndex1…). The pelvis also takes the bob, scaled to the
// outlaw's leg length. Bones the Biped doesn't have (the face, cloth) keep their rest pose.
const CHAIN = { Bip01_Spine: 'Bip01_Spine1', Bip01_Spine1: 'Bip01_Spine2', Bip01_Spine2: 'Bip01_Neck', Bip01_Neck: 'Bip01_Head' };
const ALONG_PARENT = { Bip01_Head: 'Bip01_Neck' }; // no tip in both rigs: along the bone before
const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
for (const s of ['L', 'R']) {
  Object.assign(CHAIN, { [`Bip01_${s}_Clavicle`]: `Bip01_${s}_UpperArm`, [`Bip01_${s}_UpperArm`]: `Bip01_${s}_Forearm`, [`Bip01_${s}_Forearm`]: `Bip01_${s}_Hand`, [`Bip01_${s}_Hand`]: `Bip01_${s}_Finger2`,
    [`Bip01_${s}_Thigh`]: `Bip01_${s}_Calf`, [`Bip01_${s}_Calf`]: `Bip01_${s}_Foot`, [`Bip01_${s}_Foot`]: `Bip01_${s}_Toe0` });
  Object.assign(ALONG_PARENT, { [`Bip01_${s}_Toe0`]: `Bip01_${s}_Foot`, [`Bip01_${s}_Hand`]: `Bip01_${s}_Forearm` });
  for (let i = 0; i < 5; i++) { CHAIN[`Bip01_${s}_Finger${i}`] = `Bip01_${s}_Finger${i}1`; CHAIN[`Bip01_${s}_Finger${i}1`] = `Bip01_${s}_Finger${i}2`; ALONG_PARENT[`Bip01_${s}_Finger${i}2`] = `Bip01_${s}_Finger${i}1`; }
}
const MAIN = ['Bip01_Pelvis', 'Bip01_Head', 'Bip01_L_Hand', 'Bip01_R_Hand', 'Bip01_L_Toe0', 'Bip01_R_Toe0', ...Object.keys(CHAIN).filter(n => !/Finger/.test(n))];
function restOf(root) {
  root.updateMatrixWorld(true); const by = new Map(), rest = new Map(), list = [];
  root.traverse(o => { if (!o.isBone) return; by.set(o.name, o); list.push(o); rest.set(o.name, { q: o.getWorldQuaternion(new THREE.Quaternion()), p: o.getWorldPosition(new THREE.Vector3()), lq: o.quaternion.clone() }); });
  return { by, rest, list };
}
const SRC = new Map(); // sex -> a Biped instance to play the clips on
function sourceRig(sex) {
  if (SRC.has(sex)) return SRC.get(sex);
  let P = null; for (const p of HUMANS.proto.values()) if (!p.retarget && p.sex === sex) { P = p; break; }
  if (!P) for (const p of HUMANS.proto.values()) if (!p.retarget) { P = p; break; }
  if (!P) return null;
  const inst = skClone(P.root), S = { inst, mixer: new THREE.AnimationMixer(inst), ...restOf(inst) };
  SRC.set(sex, S); return S;
}
function frameOf(a, b) { // a rotation whose x axis is a and whose xy plane holds b
  const x = a.clone().normalize(), z = new THREE.Vector3().crossVectors(x, b); if (z.lengthSq() < 1e-6) z.crossVectors(x, Math.abs(x.y) < 0.9 ? _up : _z); z.normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, new THREE.Vector3().crossVectors(z, x), z));
}
function alignOf(P, S, T) { // per Biped bone name: the turn that makes the outlaw's rest match the Biped's, and which outlaw bone it drives
  P.map = new Map(); for (const n of MAIN) if (T.rest.has(n) && S.rest.has(n)) P.map.set(n, n);
  for (const b of T.list) { const m = /(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)([123])(?!\d)/.exec(b.name); if (m) { const n = `Bip01_${m[1][0]}_Finger${FINGER_NAMES.indexOf(m[2])}${m[3] === '1' ? '' : +m[3] - 1}`; if (S.rest.has(n)) P.map.set(n, b.name); } }
  const ps = n => S.rest.has(n) ? S.rest.get(n).p : null, pt = n => P.map.has(n) ? T.rest.get(P.map.get(n)).p : null;
  const along = n => { const c = CHAIN[n]; if (c && ps(c) && pt(c)) return [new THREE.Vector3().subVectors(ps(c), ps(n)), new THREE.Vector3().subVectors(pt(c), pt(n))]; return ALONG_PARENT[n] && pt(ALONG_PARENT[n]) ? along(ALONG_PARENT[n]) : [_up.clone(), _up.clone()]; };
  const side = (pos, s) => new THREE.Vector3().subVectors(pos(`Bip01_${s}_Finger1`), pos(`Bip01_${s}_Finger${pt(`Bip01_${s}_Finger4`) ? 4 : 3}`)); // across the palm, index to little finger
  const leftOf = pos => new THREE.Vector3().subVectors(pos('Bip01_L_Thigh'), pos('Bip01_R_Thigh')).setY(0).normalize();
  const L = [leftOf(ps), leftOf(pt)], F = L.map(l => new THREE.Vector3().crossVectors(l, _up));
  const across = n => { const s = n.includes('_L_') ? 'L' : 'R'; if (/Hand|Finger/.test(n) && pt(`Bip01_${s}_Finger1`) && pt(`Bip01_${s}_Finger3`)) return [side(ps, s), side(pt, s)]; return /Clavicle|Arm|Forearm|Hand/.test(n) ? F : L; };
  P.align = new Map(); P.rev = new Map();
  for (const [n, tn] of P.map) { const [as, at] = along(n), [cs, ct] = across(n); P.align.set(n, frameOf(as, cs).multiply(frameOf(at, ct).invert())); P.rev.set(tn, n); }
  const tp = T.rest.get('Bip01_Pelvis'), sp = S.rest.get('Bip01_Pelvis');
  P.hipK = tp && sp && sp.p.y > 0.05 ? tp.p.y / sp.p.y : 1;
}
function clipFor(P, k, clips) {
  if (!P.retarget) return clips[k] || null;
  if (P.clips[k]) return P.clips[k];
  const c = clips[k] || (HUMANS.clips.m || {})[k]; if (!c) return null;
  const S = sourceRig(P.sex); if (!S) return null;
  const T = P.T || (P.T = restOf(P.root));
  if (!P.align) alignOf(P, S, T);
  const act = S.mixer.clipAction(c); S.mixer.stopAllAction(); act.reset(); act.play(); act.setEffectiveWeight(1);
  const fps = 30, n = Math.max(2, Math.round(c.duration * fps) + 1), times = new Float32Array(n);
  const mapped = T.list.filter(b => P.rev.has(b.name)), vals = new Map(mapped.map(b => [b.name, new Float32Array(n * 4)]));
  const pel = T.by.get('Bip01_Pelvis'), pos = pel && S.by.has('Bip01_Pelvis') ? new Float32Array(n * 3) : null;
  const W = new Map(), q = new THREE.Quaternion(), d = new THREE.Quaternion(), loc = new THREE.Quaternion(), v = new THREE.Vector3(), base = new THREE.Quaternion();
  const pelParentInv = pel && pel.parent ? pel.parent.matrixWorld.clone().invert() : null;
  for (let i = 0; i < n; i++) {
    const t = Math.min(c.duration, i / fps); times[i] = t;
    S.mixer.setTime(t); S.inst.updateMatrixWorld(true); W.clear();
    for (const b of T.list) {
      const pw = b.parent && W.get(b.parent.name) || (b.parent ? b.parent.getWorldQuaternion(base) : base.identity());
      let wq; const sn = P.rev.get(b.name);
      if (sn) {
        S.by.get(sn).getWorldQuaternion(q); d.copy(S.rest.get(sn).q).invert().premultiply(q); // the Biped bone's turn since rest
        wq = d.clone().multiply(P.align.get(sn)).multiply(T.rest.get(b.name).q);
        loc.copy(pw).invert().multiply(wq); const arr = vals.get(b.name);
        if (i > 0 && loc.x * arr[i * 4 - 4] + loc.y * arr[i * 4 - 3] + loc.z * arr[i * 4 - 2] + loc.w * arr[i * 4 - 1] < 0) loc.set(-loc.x, -loc.y, -loc.z, -loc.w); // the short way round
        loc.toArray(arr, i * 4);
      } else wq = pw.clone().multiply(T.rest.get(b.name).lq);
      W.set(b.name, wq);
    }
    if (pos) { // the hips: the Biped's bob and sway, scaled to these legs
      S.by.get('Bip01_Pelvis').getWorldPosition(v).sub(S.rest.get('Bip01_Pelvis').p).multiplyScalar(P.hipK).add(T.rest.get('Bip01_Pelvis').p);
      if (pelParentInv) v.applyMatrix4(pelParentInv); v.toArray(pos, i * 3);
    }
  }
  act.stop();
  const tracks = mapped.map(b => new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, vals.get(b.name)));
  if (pos) tracks.push(new THREE.VectorKeyframeTrack(pel.name + '.position', times, pos));
  return (P.clips[k] = new THREE.AnimationClip(k, c.duration, tracks));
}

// ---- holding and aiming guns. Rocketbox ships no weapon animations, so arms are posed on top of the clip with
// two-bone IK (shoulder, elbow, wrist): the gun's grip goes where a shooter holds it for that kind of weapon, the right
// hand takes it, and the left hand takes the fore-grip `grip` m down the barrel with its elbow under the gun. Long guns
// sit in the shoulder pocket with the right elbow out; pistols are pushed out in front of the face in both hands; the
// minigun rides at the hip; launchers rest on the shoulder. Works in world space, so it doesn't care how the Biped
// bones' local axes are set up.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
function swing(bone, tip, dirW) { // rotate `bone` so the bone->tip vector points along dirW (world)
  bone.getWorldPosition(_a); tip.getWorldPosition(_b); _c.subVectors(_b, _a).normalize();
  _q.setFromUnitVectors(_c, dirW);
  bone.getWorldQuaternion(_q2); _q2.premultiply(_q);
  bone.parent.getWorldQuaternion(_q3).invert(); bone.quaternion.copy(_q3.multiply(_q2));
  bone.updateMatrixWorld(true);
}
function bones(r) {
  if (r.bones) return r.bones;
  const n = s => r.inst.getObjectByName(s);
  r.bones = { ru: n('Bip01_R_UpperArm'), rf: n('Bip01_R_Forearm'), rh: n('Bip01_R_Hand'), lu: n('Bip01_L_UpperArm'), lf: n('Bip01_L_Forearm'), lh: n('Bip01_L_Hand'), sh: n('Bip01_R_Clavicle'), sp: n('Bip01_Spine2') || n('Bip01_Spine1') };
  return r.bones;
}
// put the wrist on `target` (world), bending the elbow toward `pole` (a world direction)
const _s = new THREE.Vector3(), _e = new THREE.Vector3(), _w = new THREE.Vector3(), _ax = new THREE.Vector3(), _pl = new THREE.Vector3(), _el = new THREE.Vector3(), _dw = new THREE.Vector3(); // (swing uses _a/_b/_c)
function reach(up, fore, hand, target, pole) {
  up.getWorldPosition(_s); fore.getWorldPosition(_e); hand.getWorldPosition(_w);
  const a = _s.distanceTo(_e), b = _e.distanceTo(_w);
  _ax.subVectors(target, _s); let d = _ax.length(); if (d < 1e-4) return; _ax.divideScalar(d);
  d = Math.min(Math.max(d, Math.abs(a - b) + 0.02), (a + b) * 0.995); // out of reach: the arm points at it, straight
  const ca = (a * a + d * d - b * b) / (2 * a * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  _pl.copy(pole).addScaledVector(_ax, -pole.dot(_ax)); if (_pl.lengthSq() < 1e-6) _pl.set(0, -1, 0).addScaledVector(_ax, _ax.y); _pl.normalize();
  _el.copy(_s).addScaledVector(_ax, ca * a).addScaledVector(_pl, sa * a);
  swing(up, fore, _dw.subVectors(_el, _s).normalize());
  fore.getWorldPosition(_e); _w.copy(_s).addScaledVector(_ax, d); // where the wrist ends up (target, clamped)
  swing(fore, hand, _dw.subVectors(_w, _e).normalize());
}
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _up = new THREE.Vector3(0, 1, 0);
const _rs = new THREE.Vector3(), _ls = new THREE.Vector3(), _lf = new THREE.Vector3(), _g = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
// r: rig; dirW: aim direction (world, unit) or null to carry the weapon low; o: { twoHand, grip (m), shoulder, pose, dt (s) }
// pose: 'long' | 'pistol' | 'hip' | 'shoulder' (default from twoHand / grip / shoulder)
export function holdWeapon(r, dirW, o = {}) {
  const B = bones(r); if (!B.ru || !B.rf || !B.rh) return;
  r.g.updateMatrixWorld(true);
  const kick = r.recoil || 0, H = r.gun;
  const pose = o.pose || (o.shoulder ? 'shoulder' : o.twoHand && (o.grip || 0) >= 0.15 ? 'long' : o.twoHand ? 'pistol' : 'one');
  if (dirW) {
    _d.copy(dirW); _d.y += kick * 0.12; _d.normalize();
    // lean the chest into the aim a little (up or down), so the arms don't do all of it
    if (B.sp) { _lf.set(_d.x, 0, _d.z).normalize(); const pitch = Math.asin(Math.max(-1, Math.min(1, _d.y))); _p1.crossVectors(_up, _lf).normalize(); _q.setFromAxisAngle(_p1, -pitch * 0.35); B.sp.getWorldQuaternion(_q2); _q2.premultiply(_q); B.sp.parent.getWorldQuaternion(_q3).invert(); B.sp.quaternion.copy(_q3.multiply(_q2)); B.sp.updateMatrixWorld(true); }
    B.ru.getWorldPosition(_rs); (B.lu || B.ru).getWorldPosition(_ls);
    _lf.subVectors(_ls, _rs); _lf.y = 0; if (_lf.lengthSq() < 1e-6) _lf.set(1, 0, 0); _lf.normalize(); // the body's left
    const L = _rs.distanceTo(B.rf.getWorldPosition(_p1)) + _p1.distanceTo(B.rh.getWorldPosition(_p2)); // arm length
    // where the grip goes
    if (pose === 'long') _g.copy(_rs).addScaledVector(_d, 0.3).addScaledVector(_up, -0.03).addScaledVector(_lf, 0.07);
    else if (pose === 'hip') _g.copy(_rs).addScaledVector(_d, 0.3).addScaledVector(_up, -0.36).addScaledVector(_lf, 0.04);
    else if (pose === 'shoulder') _g.copy(_rs).addScaledVector(_d, 0.24).addScaledVector(_up, 0.0).addScaledVector(_lf, 0.03);
    else if (pose === 'pistol') _g.copy(_rs).lerp(_ls, 0.38).addScaledVector(_d, L * 0.82).addScaledVector(_up, -0.04);
    else _g.copy(_rs).addScaledVector(_d, L * 0.85).addScaledVector(_lf, 0.05);
    _g.addScaledVector(_d, -kick * 0.06);
    // right arm: elbow down, and out to the side for a long gun
    _p1.copy(_up).multiplyScalar(-1).addScaledVector(_lf, pose === 'long' || pose === 'shoulder' ? -0.9 : -0.35).addScaledVector(_d, -0.15);
    reach(B.ru, B.rf, B.rh, _t.copy(_g).addScaledVector(_d, -0.08), _p1);
    if (pose !== 'one' && B.lu && B.lf && B.lh) { // left hand under the fore-grip (or cupping the right hand on a pistol)
      _t.copy(_g).addScaledVector(_d, pose === 'pistol' ? 0.02 : (o.grip || 0.3) - 0.04).addScaledVector(_up, pose === 'pistol' ? -0.05 : -0.06);
      if (pose === 'pistol') _t.addScaledVector(_lf, 0.03);
      _p2.copy(_up).multiplyScalar(-1).addScaledVector(_lf, pose === 'pistol' ? 0.45 : 0.3);
      reach(B.lu, B.lf, B.lh, _t, _p2);
    }
  }
  // the held model: its grip in the right hand, pointing along the aim / slightly down when carried
  if (!H || !H.isGroup) return;
  B.rh.getWorldPosition(_a);
  if (!dirW) { _d.set(Math.sin(r.g.rotation.y), -1.4, Math.cos(r.g.rotation.y)).normalize(); }
  else if (pose === 'shoulder') _a.addScaledVector(_up, 0.06); // the tube rides over the hand, on the shoulder
  r.g.worldToLocal(_a); H.position.copy(_a);
  r.g.getWorldQuaternion(_q2).invert(); _b.copy(_d).applyQuaternion(_q2);
  H.quaternion.setFromUnitVectors(_z, _b);
  r.recoil = Math.max(0, kick - (o.dt ?? 1 / 60) * 8); // decays in time, not per frame
}

// hands up: both wrists above the shoulders and a little out, elbows bent out to the sides (someone with a gun on them)
export function handsUp(r) {
  const B = bones(r); if (!B.ru || !B.rf || !B.rh || !B.lu || !B.lf || !B.lh) return;
  r.g.updateMatrixWorld(true);
  B.ru.getWorldPosition(_rs); B.lu.getWorldPosition(_ls); _lf.subVectors(_ls, _rs); _lf.y = 0; if (_lf.lengthSq() < 1e-6) _lf.set(1, 0, 0); _lf.normalize();
  _d.set(Math.sin(r.g.rotation.y), 0, Math.cos(r.g.rotation.y));
  const shake = Math.sin(performance.now() * 0.023) * 0.012; // trembling
  _t.copy(_rs).addScaledVector(_up, 0.42 + shake).addScaledVector(_lf, -0.2).addScaledVector(_d, 0.06); _p1.copy(_lf).multiplyScalar(-1).addScaledVector(_up, -0.3); reach(B.ru, B.rf, B.rh, _t, _p1);
  _t.copy(_ls).addScaledVector(_up, 0.42 - shake).addScaledVector(_lf, 0.2).addScaledVector(_d, 0.06); _p2.copy(_lf).addScaledVector(_up, -0.3); reach(B.lu, B.lf, B.lh, _t, _p2);
}

// ---- hurt bodies: limbs posed procedurally on top of the last clip frame (Rocketbox has no ragdoll or death clips).
//   kind 'flail'   thrown through the air: arms and legs windmilling
//        'crumple' lying where they fell: knees bent, arms splayed, a different heap for each person (seed)
//        'burn'    on fire: arms flapping around the head while the legs keep running
//        'stagger' hit and off balance: arms thrown out
// Directions are in the body's own frame (+z forward, +x its left, +y up) and turned into world space here.
const _bq = new THREE.Quaternion(), _bd = new THREE.Vector3();
function limbs(r) {
  if (r.limbs) return r.limbs; const n = s => r.inst.getObjectByName(s), B = bones(r);
  r.limbs = { ...B, lt: n('Bip01_L_Thigh'), lc: n('Bip01_L_Calf'), lft: n('Bip01_L_Foot'), rt: n('Bip01_R_Thigh'), rc: n('Bip01_R_Calf'), rft: n('Bip01_R_Foot') };
  return r.limbs;
}
export function ragdoll(r, kind, t = 0, seed = 0) {
  if (!r || !r.human) return; const L = limbs(r); if (!L.lu || !L.ru) return;
  r.g.updateMatrixWorld(true); r.body.getWorldQuaternion(_bq);
  const aim = (bone, tip, x, y, z) => { if (!bone || !tip) return; _bd.set(x, y, z).normalize().applyQuaternion(_bq); swing(bone, tip, _bd); };
  const s = seed * 10, S = Math.sin, C = Math.cos, h = k => { const v = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); }; // seeded 0..1
  if (kind === 'flail') {
    aim(L.lu, L.lf, 0.75, 0.4 + 0.5 * S(t * 11 + s), 0.4 * C(t * 9 + s)); aim(L.lf, L.lh, 0.45, 0.6 + 0.4 * S(t * 13 + s * 2), 0.6 * S(t * 10 + s));
    aim(L.ru, L.rf, -0.75, 0.4 + 0.5 * S(t * 10 + s + 2), 0.4 * C(t * 8 + s + 1)); aim(L.rf, L.rh, -0.45, 0.6 + 0.4 * S(t * 12 + s), 0.6 * S(t * 11 + s + 3));
    aim(L.lt, L.lc, 0.22, -0.7, 0.6 * S(t * 9 + s)); aim(L.lc, L.lft, 0.12, -0.6, -0.5 + 0.5 * S(t * 9 + s + 1.2));
    aim(L.rt, L.rc, -0.22, -0.7, -0.6 * S(t * 9 + s)); aim(L.rc, L.rft, -0.12, -0.6, -0.5 - 0.5 * S(t * 9 + s + 1.2));
  } else if (kind === 'crumple') {
    aim(L.lu, L.lf, 0.9, -0.3 + h(1) * 1.1, -0.4 + h(2) * 0.9); aim(L.lf, L.lh, 0.5 + h(3) * 0.4, -0.2 + h(4) * 0.9, -0.6 + h(5) * 1.2);
    aim(L.ru, L.rf, -0.9, -0.3 + h(6) * 1.1, -0.4 + h(7) * 0.9); aim(L.rf, L.rh, -0.5 - h(8) * 0.4, -0.2 + h(9) * 0.9, -0.6 + h(10) * 1.2);
    const bend = h(11) > 0.5; // one knee drawn up, the other leg out
    aim(L.lt, L.lc, 0.2 + h(12) * 0.3, -0.9, bend ? 0.7 : 0.1); aim(L.lc, L.lft, 0.1, -0.6, bend ? -0.85 : 0.05);
    aim(L.rt, L.rc, -0.15 - h(13) * 0.3, -0.95, bend ? 0.05 : 0.6); aim(L.rc, L.rft, -0.1, -0.7, bend ? 0.1 : -0.8);
  } else if (kind === 'burn') {
    aim(L.lu, L.lf, 0.7, 0.55 + 0.35 * S(t * 14 + s), 0.3 + 0.3 * C(t * 12)); aim(L.lf, L.lh, 0.1, 0.9, 0.3 * S(t * 15 + s));
    aim(L.ru, L.rf, -0.7, 0.55 + 0.35 * S(t * 13 + s + 1), 0.3 + 0.3 * C(t * 11 + 1)); aim(L.rf, L.rh, -0.1, 0.9, 0.3 * S(t * 16 + s + 2));
  } else if (kind === 'stagger') {
    aim(L.lu, L.lf, 0.95, 0.15 + 0.25 * S(t * 7 + s), 0.15); aim(L.lf, L.lh, 0.8, 0.3, 0.4);
    aim(L.ru, L.rf, -0.95, 0.15 + 0.25 * S(t * 7 + s + 2), 0.15); aim(L.rf, L.rh, -0.8, 0.3, 0.4);
  }
}

// ---- feet on the ground: after the clip has posed the legs, each foot is lifted (two-bone IK on thigh, calf, foot) to
// where the ground under it really is, and the hips drop by as much as the lower foot needs, so a body stands on a
// slope, a kerb or a step instead of floating over one foot and sinking the other. groundY(x, z): the visible surface.
// r.g must already be at the ground height under the body's centre (rootY).
const _fL = new THREE.Vector3(), _fR = new THREE.Vector3(), _ft = new THREE.Vector3(), _kp = new THREE.Vector3();
// on a bike or a scooter: the hips onto the seat (seat: a world point, or null standing on a kick scooter), each foot to
// its pedal or the floorboard, each hand to its grip; knees bend forward, elbows out and down (fwd: the ride's forward)
const _rk = new THREE.Vector3(), _re = new THREE.Vector3(), _rp = new THREE.Vector3(), _rd = new THREE.Vector3();
export function ride(r, seat, feet, hands, fwd) {
  if (!r || !r.human) return; const L = limbs(r); if (!L.lt || !L.lc || !L.lft || !L.lu || !L.lf || !L.lh) return;
  r.g.updateMatrixWorld(true);
  if (seat) { const pel = r.inst.getObjectByName('Bip01_Pelvis'); if (pel) { pel.getWorldPosition(_rp); _rd.subVectors(seat, _rp); // move the body so the pelvis sits on the seat
      r.body.parent.updateMatrixWorld(true); const inv = r.body.parent.matrixWorld.clone().invert(); const a = r.body.position.clone().applyMatrix4(r.body.parent.matrixWorld).add(_rd).applyMatrix4(inv); r.body.position.copy(a); r.g.updateMatrixWorld(true); } }
  _rk.copy(fwd).multiplyScalar(1).add(_up).normalize();                               // knees: forward and up
  reach(L.lt, L.lc, L.lft, feet[0], _rk); reach(L.rt, L.rc, L.rft, feet[1], _rk);
  _re.copy(fwd).multiplyScalar(-0.6).add(_up.clone().multiplyScalar(-1)).normalize();   // elbows: down and back
  reach(L.lu, L.lf, L.lh, hands[0], _re); reach(L.ru, L.rf, L.rh, hands[1], _re);
}
export function plantFeet(r, groundY, rootY, dt) {
  if (!r || !r.human) return; const L = limbs(r); if (!L.lt || !L.lc || !L.lft || !L.rt || !L.rc || !L.rft) return;
  r.g.updateMatrixWorld(true); L.lft.getWorldPosition(_fL); L.rft.getWorldPosition(_fR);
  const dL = Math.max(-0.45, Math.min(0.45, groundY(_fL.x, _fL.z) - rootY)), dR = Math.max(-0.45, Math.min(0.45, groundY(_fR.x, _fR.z) - rootY));
  const drop = Math.min(0, dL, dR), k = 1 - Math.exp(-(dt || 0.016) * 14);
  r.footDrop = (r.footDrop || 0) + (drop - (r.footDrop || 0)) * k; // eased: no snapping hips over a kerb
  r.body.position.y += r.footDrop; r.g.updateMatrixWorld(true);
  _kp.set(Math.sin(r.g.rotation.y), 0.25, Math.cos(r.g.rotation.y)); // knees bend forward
  for (const [t, c, f, d] of [[L.lt, L.lc, L.lft, dL], [L.rt, L.rc, L.rft, dR]]) {
    const lift = d - r.footDrop; if (Math.abs(lift) < 0.01) continue;
    f.getWorldPosition(_ft); _ft.y += lift; reach(t, c, f, _ft, _kp);
  }
}
