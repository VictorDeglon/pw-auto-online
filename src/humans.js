// Rocketbox people (Microsoft Rocketbox Avatar Library, MIT): the player, pedestrians and deputies.
//
// assets/humans/ is built by tools/humans/build_rocketbox.py: one GLB per avatar (80-bone 3ds Max Biped) and one GLB
// per animation clip. Every avatar shares the skeleton, so clips bind by bone name. At load we fetch the player, the
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

const BASE = 'assets/humans/';
import { RESERVED, SWIM } from './reserved.js';
export const HUMANS = { ready: false, manifest: null, proto: new Map(), clips: { m: {}, f: {} }, pools: { civ: [], police: [], plain: [], swim: [] }, player: null };

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
async function loadClip(loader, s, c) {
  try { const g = await loader.loadAsync(`${BASE}anim/${s}_${c}.glb`); const clip = g.animations[0]; if (clip) { clip.name = c; clip.tracks = clip.tracks.filter(t => t.name.startsWith('Bip01')); HUMANS.clips[s][c] = ['walk', 'run', 'sprint', 'injured', 'stroll'].includes(c) ? stripRootMotion(clip) : clip; } }
  catch (e) { console.warn('[humans] clip', s, c, e); }
}
// the rest of the clips (crouch, cheer, dance, laugh, listen, talk2, look, injured, stroll), fetched in the background
export async function loadExtraClips() {
  if (!HUMANS.extra || !HUMANS.extra.length) return;
  const loader = new GLTFLoader(), list = HUMANS.extra; HUMANS.extra = [];
  for (const c of list) await Promise.all(['m', 'f'].map(s => loadClip(loader, s, c)));
}
export function hasClip(r, k) { return !!(r && (r.actions[k] || (HUMANS.clips[r.sex] || {})[k])); }
export async function loadHumans(opts = {}) {
  const loader = new GLTFLoader(), poolSize = opts.pool ?? 14;
  const res = await fetch(BASE + 'manifest.json'); if (!res.ok) throw new Error('humans manifest: HTTP ' + res.status);
  const man = await res.json(); HUMANS.manifest = man;
  const all = man.avatars, rnd = () => Math.random();
  const free = a => !RESERVED.has(a.name) && !SWIM(a.name); // story / dealer skins and swimwear never join the random pools
  const police = all.filter(a => a.kind === 'police' && free(a)).map(a => a.name);
  const plain = all.filter(a => a.kind === 'business' && free(a)).map(a => a.name);
  const civ = all.filter(a => a.kind !== 'police' && a.kind !== 'military' && a.name !== man.player && free(a)).map(a => a.name);
  HUMANS.swimAll = all.filter(a => SWIM(a.name)).map(a => a.name);
  for (let i = civ.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [civ[i], civ[j]] = [civ[j], civ[i]]; }
  const pools = { civ: civ.slice(0, poolSize), police };
  pools.plain = plain.filter(n => pools.civ.includes(n)).concat(plain.slice(0, 2));
  const me = opts.player && all.some(a => a.name === opts.player) && !RESERVED.has(opts.player) ? opts.player : man.player; // the skin the player picked (never a reserved one)
  const want = [...new Set([me, ...pools.civ, ...police, ...pools.plain])];
  // opts.crowd === false: only the player's avatar now; loadCrowd() fetches everyone else after the loading screen,
  // and until then buildRig() falls back to the blocky people
  const now = opts.crowd === false ? [me] : want;
  HUMANS.crowd = pools; HUMANS.later = want.filter(n => !now.includes(n));
  await Promise.all(now.map(n => loadAvatar(loader, n)));
  await Promise.all(['m', 'f'].flatMap(s => man.clips.filter(c => CORE.includes(c)).map(c => loadClip(loader, s, c))));
  HUMANS.extra = man.clips.filter(c => !CORE.includes(c)); // crowd and emote clips: loadExtraClips() after the world is up
  fillPools(HUMANS.later.length ? me : null); // the player's own skin stays out of the crowd until the crowd is in
  HUMANS.player = HUMANS.proto.has(me) ? me : HUMANS.proto.has(man.player) ? man.player : HUMANS.pools.civ[0];
  HUMANS.ready = HUMANS.proto.size > 0 && Object.keys(HUMANS.clips.m).length > 0;
  console.info('[humans]', HUMANS.proto.size, 'avatars,', Object.keys(HUMANS.clips.m).length + Object.keys(HUMANS.clips.f).length, 'clips; player', HUMANS.player);
  return HUMANS.ready;
}

async function loadAvatar(loader, n) {
  const a = HUMANS.manifest.avatars.find(x => x.name === n);
  try { const g = await loader.loadAsync(BASE + n + '.glb'); HUMANS.proto.set(n, { root: prep(g.scene), sex: (a || {}).sex || 'm' }); }
  catch (e) { console.warn('[humans] avatar', n, e); }
}
function fillPools(skip) {
  for (const k of ['civ', 'police', 'plain']) HUMANS.pools[k] = (HUMANS.crowd[k] || []).filter(n => HUMANS.proto.has(n) && n !== skip);
}
// the rest of the people (locals, deputies), after loadHumans({ crowd: false }); each joins its pool as it arrives.
// Resolves to how many were fetched.
export async function loadCrowd() {
  const list = HUMANS.later || []; HUMANS.later = [];
  if (!HUMANS.crowd || !list.length) return 0;
  const loader = new GLTFLoader();
  await Promise.all(list.map(n => loadAvatar(loader, n).then(() => fillPools(null))));
  console.info('[humans] crowd in:', HUMANS.proto.size, 'avatars');
  return list.length;
}

// load one more avatar on demand (a skin someone picked); resolves true when makeHuman(name) will work
const pending = new Map();
export function ensureAvatar(name) {
  if (HUMANS.proto.has(name)) return Promise.resolve(true);
  if (!HUMANS.manifest || !HUMANS.manifest.avatars.some(a => a.name === name)) return Promise.resolve(false);
  if (pending.has(name)) return pending.get(name);
  const info = HUMANS.manifest.avatars.find(a => a.name === name);
  const p = new GLTFLoader().loadAsync(BASE + name + '.glb').then(g => { HUMANS.proto.set(name, { root: prep(g.scene), sex: info.sex || 'm' }); return true; })
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
  const a = HUMANS.manifest && HUMANS.manifest.avatars.find(x => x.name === n);
  if (!a) return String(n).replace(/_/g, ' ');
  nameAll(HUMANS.manifest.avatars); const p = person(a); return p.full;
}
export function skinRole(n) { const a = HUMANS.manifest && HUMANS.manifest.avatars.find(x => x.name === n); return a ? person(a).role : ''; }
// make the player wear this avatar from now on (it must be loaded)
export function setPlayerAvatar(name) { if (HUMANS.proto.has(name) && !RESERVED.has(name)) HUMANS.player = name; }
// swimwear avatars load on demand the first time you're somewhere they belong
export function loadSwim() { if (HUMANS.swimLoading || !HUMANS.swimAll) return; HUMANS.swimLoading = true; for (const n of HUMANS.swimAll) ensureAvatar(n).then(ok => { if (ok && !HUMANS.pools.swim.includes(n)) HUMANS.pools.swim.push(n); }); }

// kind: 'player' | 'police' | 'plain' (undercover) | 'civ'
export function pickAvatar(kind) {
  if (kind === 'player') return HUMANS.player;
  if (kind === 'swim') { const sw = HUMANS.pools.swim; if (sw.length) return sw[Math.floor(Math.random() * sw.length)]; kind = 'civ'; }
  const pool = HUMANS.pools[kind] && HUMANS.pools[kind].length ? HUMANS.pools[kind] : HUMANS.pools.civ;
  return pool[Math.floor(Math.random() * pool.length)];
}

// gun / phone: meshes to put in the right hand (the caller's existing prop meshes)
export function makeHuman(name, props = {}) {
  const P = HUMANS.proto.get(name); if (!P) return null;
  const inst = skClone(P.root), g = new THREE.Group(), body = new THREE.Group(); body.add(inst); g.add(body);
  const hand = inst.getObjectByName('Bip01_R_Hand'), armR = new THREE.Group();
  if (hand) { hand.add(armR); armR.scale.setScalar(1 / Math.max(1e-3, hand.getWorldScale(new THREE.Vector3()).x)); }
  const mixer = new THREE.AnimationMixer(inst), clips = HUMANS.clips[P.sex] && Object.keys(HUMANS.clips[P.sex]).length ? HUMANS.clips[P.sex] : HUMANS.clips.m;
  const actions = {}; for (const k in clips) { actions[k] = mixer.clipAction(clips[k]); actions[k].play(); actions[k].setEffectiveWeight(0); }
  const r = { human: true, name, sex: HUMANS.clips[P.sex] && Object.keys(HUMANS.clips[P.sex]).length ? P.sex : 'm', g, body, inst, mixer, actions, cur: null, armR, armL: new THREE.Group(), legL: new THREE.Group(), legR: new THREE.Group(), phase: Math.random() * 10, punch: 0, gun: props.gun || new THREE.Object3D(), phone: props.phone || new THREE.Object3D() };
  const holder = new THREE.Group(); holder.add(r.gun); r.gun.position.set(0, 0, 0.08); r.gun.rotation.set(0, 0, 0); g.add(holder); r.gun = holder; // placed by holdWeapon
  r.phone.position.set(0.05, 0, 0.03); armR.add(r.phone);
  setAction(r, 'idle', 0); r.mixer.setTime(Math.random() * 3);
  return r;
}

function setAction(r, k, fade = 0.25) {
  if (!r.actions[k]) { const c = (HUMANS.clips[r.sex] || {})[k]; if (c) { r.actions[k] = r.mixer.clipAction(c); r.actions[k].play(); r.actions[k].setEffectiveWeight(0); } else k = 'idle'; } // clips that arrived after this rig was made
  if (r.cur === k) return;
  const next = r.actions[k], prev = r.cur && r.actions[r.cur];
  next.reset(); next.setEffectiveWeight(1); next.play();
  if (prev && fade > 0) prev.crossFadeTo(next, fade, false); else if (prev) prev.setEffectiveWeight(0);
  r.cur = k;
}

// speed in m/s; mode as in the blocky animRig ('phone', 'aim', 'hands', 'fists', 'talk', 'wave')
export function animHuman(r, speed, dt, mode) {
  let k, ts = 1;
  const POSE = ['crouch', 'cheer', 'dance', 'laugh', 'listen', 'talk2', 'look'];
  if (speed < 0.25) k = mode === 'talk' || mode === 'phone' ? 'talk' : mode === 'wave' ? 'wave' : POSE.includes(mode) && hasClip(r, mode) ? mode : 'idle';
  else if (mode === 'injured' && speed >= 1.6 && hasClip(r, 'injured')) { k = 'injured'; ts = speed / 3; }
  else if (mode === 'stroll' && speed < 1.5 && hasClip(r, 'stroll')) { k = 'stroll'; ts = speed / 1.05; }
  else if (speed < 2.6) { k = 'walk'; ts = speed / 1.35; }
  else if (speed < 5.2) { k = 'run'; ts = speed / 3.6; }
  else { k = 'sprint'; ts = speed / 5.6; }
  setAction(r, k);
  if (r.actions[k]) r.actions[k].timeScale = Math.min(2.2, Math.max(0.5, ts));
  r.mixer.update(dt);
  r.phone.visible = mode === 'phone';
  if (r.punch > 0) r.punch -= dt;
  if (r.ownAim) return; // the player's arms are posed by the game with the camera's aim
  if (mode === 'aim') holdWeapon(r, _t.set(Math.sin(r.g.rotation.y), 0, Math.cos(r.g.rotation.y)), { twoHand: true, grip: 0.12, dt });
  else if (r.gun.visible) holdWeapon(r, null, { dt });
}

// ---- holding and aiming guns. Rocketbox ships no weapon animations, so arms are posed on top of the clip: the right
// arm swings so the hand lines up with the aim, the left hand reaches for the fore-grip (two-handed weapons), and the
// held model (r.gun, a holder Group) is placed at the hand pointing down the aim. Works in world space, so it doesn't
// care how the Biped bones' local axes are set up.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _m = new THREE.Matrix4();
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
  r.bones = { ru: n('Bip01_R_UpperArm'), rf: n('Bip01_R_Forearm'), rh: n('Bip01_R_Hand'), lu: n('Bip01_L_UpperArm'), lf: n('Bip01_L_Forearm'), lh: n('Bip01_L_Hand'), sh: n('Bip01_R_Clavicle') };
  return r.bones;
}
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _z = new THREE.Vector3(0, 0, 1);
// r: rig; dirW: aim direction (world, unit) or null to carry the weapon low; o: { twoHand, grip (m), shoulder, dt (s) }
export function holdWeapon(r, dirW, o = {}) {
  const B = bones(r); if (!B.ru || !B.rf || !B.rh) return;
  r.g.updateMatrixWorld(true);
  const kick = r.recoil || 0;
  if (dirW) {
    _d.copy(dirW); _d.y += kick * 0.12; _d.normalize();
    swing(B.ru, B.rh, _d); swing(B.rf, B.rh, _d);
    if (o.twoHand && B.lu && B.lf && B.lh) { // left hand to a point along the barrel
      B.rh.getWorldPosition(_t).addScaledVector(_d, o.grip || 0.3); B.lu.getWorldPosition(_a);
      _b.subVectors(_t, _a).normalize(); swing(B.lu, B.lh, _b);
      B.lf.getWorldPosition(_a); _b.subVectors(_t, _a).normalize(); swing(B.lf, B.lh, _b);
    }
  }
  // the held model: at the hand (or the shoulder for launchers), pointing along the aim / slightly down when carried
  const H = r.gun; if (!H || !H.isGroup) return;
  (o.shoulder && B.sh ? B.sh : B.rh).getWorldPosition(_a);
  if (o.shoulder) _a.y += 0.08;
  if (!dirW) { _d.set(Math.sin(r.g.rotation.y), -1.4, Math.cos(r.g.rotation.y)).normalize(); }
  _a.addScaledVector(_d, -kick * 0.08);
  r.g.worldToLocal(_a); H.position.copy(_a);
  r.g.getWorldQuaternion(_q2).invert(); _b.copy(_d).applyQuaternion(_q2);
  H.quaternion.setFromUnitVectors(_z, _b);
  r.recoil = Math.max(0, kick - (o.dt ?? 1 / 60) * 8); // decays in time, not per frame
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
