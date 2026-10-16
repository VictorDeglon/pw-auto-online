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

const BASE = 'assets/humans/';
export const HUMANS = { ready: false, manifest: null, proto: new Map(), clips: { m: {}, f: {} }, pools: { civ: [], police: [], plain: [] }, player: null };

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

export async function loadHumans(opts = {}) {
  const loader = new GLTFLoader(), poolSize = opts.pool ?? 14;
  const res = await fetch(BASE + 'manifest.json'); if (!res.ok) throw new Error('humans manifest: HTTP ' + res.status);
  const man = await res.json(); HUMANS.manifest = man;
  const all = man.avatars, rnd = () => Math.random();
  const police = all.filter(a => a.kind === 'police').map(a => a.name);
  const plain = all.filter(a => a.kind === 'business').map(a => a.name);
  const civ = all.filter(a => a.kind !== 'police' && a.kind !== 'military' && a.name !== man.player).map(a => a.name);
  for (let i = civ.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [civ[i], civ[j]] = [civ[j], civ[i]]; }
  HUMANS.pools.civ = civ.slice(0, poolSize); HUMANS.pools.police = police; HUMANS.pools.plain = plain.filter(n => HUMANS.pools.civ.includes(n)).concat(plain.slice(0, 2));
  const me = opts.player && all.some(a => a.name === opts.player) ? opts.player : man.player; // the skin the player picked
  const want = [...new Set([me, ...HUMANS.pools.civ, ...police, ...HUMANS.pools.plain])];
  const info = new Map(all.map(a => [a.name, a]));
  await Promise.all(want.map(async n => {
    try { const g = await loader.loadAsync(BASE + n + '.glb'); HUMANS.proto.set(n, { root: prep(g.scene), sex: (info.get(n) || {}).sex || 'm' }); }
    catch (e) { console.warn('[humans] avatar', n, e); }
  }));
  await Promise.all(['m', 'f'].flatMap(s => man.clips.map(async c => {
    try { const g = await loader.loadAsync(`${BASE}anim/${s}_${c}.glb`); const clip = g.animations[0]; if (clip) { clip.name = c; clip.tracks = clip.tracks.filter(t => t.name.startsWith('Bip01')); HUMANS.clips[s][c] = ['walk', 'run', 'sprint'].includes(c) ? stripRootMotion(clip) : clip; } }
    catch (e) { console.warn('[humans] clip', s, c, e); }
  })));
  for (const k of ['civ', 'police', 'plain']) HUMANS.pools[k] = HUMANS.pools[k].filter(n => HUMANS.proto.has(n));
  HUMANS.player = HUMANS.proto.has(me) ? me : HUMANS.proto.has(man.player) ? man.player : HUMANS.pools.civ[0];
  HUMANS.ready = HUMANS.proto.size > 0 && Object.keys(HUMANS.clips.m).length > 0;
  console.info('[humans]', HUMANS.proto.size, 'avatars,', Object.keys(HUMANS.clips.m).length + Object.keys(HUMANS.clips.f).length, 'clips; player', HUMANS.player);
  return HUMANS.ready;
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
  return HUMANS.manifest.avatars.filter(a => a.kind !== 'police' && a.kind !== 'military').map(a => ({ name: a.name, sex: a.sex, kind: a.kind, label: skinLabel(a.name) }));
}
export function skinLabel(n) { return String(n).replace(/_/g, ' ').replace(/\b0(\d)\b/, '$1'); }
// make the player wear this avatar from now on (it must be loaded)
export function setPlayerAvatar(name) { if (HUMANS.proto.has(name)) HUMANS.player = name; }

// kind: 'player' | 'police' | 'plain' (undercover) | 'civ'
export function pickAvatar(kind) {
  if (kind === 'player') return HUMANS.player;
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
  const r = { human: true, name, g, body, inst, mixer, actions, cur: null, armR, armL: new THREE.Group(), legL: new THREE.Group(), legR: new THREE.Group(), phase: Math.random() * 10, punch: 0, gun: props.gun || new THREE.Object3D(), phone: props.phone || new THREE.Object3D() };
  const holder = new THREE.Group(); holder.add(r.gun); r.gun.position.set(0, 0, 0.08); r.gun.rotation.set(0, 0, 0); g.add(holder); r.gun = holder; // placed by holdWeapon
  r.phone.position.set(0.05, 0, 0.03); armR.add(r.phone);
  setAction(r, 'idle', 0); r.mixer.setTime(Math.random() * 3);
  return r;
}

function setAction(r, k, fade = 0.25) {
  if (!r.actions[k]) k = 'idle';
  if (r.cur === k) return;
  const next = r.actions[k], prev = r.cur && r.actions[r.cur];
  next.reset(); next.setEffectiveWeight(1); next.play();
  if (prev && fade > 0) prev.crossFadeTo(next, fade, false); else if (prev) prev.setEffectiveWeight(0);
  r.cur = k;
}

// speed in m/s; mode as in the blocky animRig ('phone', 'aim', 'hands', 'fists', 'talk', 'wave')
export function animHuman(r, speed, dt, mode) {
  let k, ts = 1;
  if (speed < 0.25) k = mode === 'talk' || mode === 'phone' ? 'talk' : mode === 'wave' ? 'wave' : 'idle';
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
