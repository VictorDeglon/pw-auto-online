// Re-aims the Mixamo animations onto the Rocketbox Biped, so every person in the game can play them (src/humans.js;
// the outlaws get them through its retarget). In: the packs tools/humans/mixamo-export.js exported into
// build/mixamo/zips/ (one FBX per clip, named by its key in tools/humans/mixamo.json, and X Bot.fbx). Out:
// assets/humans/anim/{m,f}_{core,more}.glb (one animation per clip, tracks named for the Biped's bones) and
// assets/humans/anim/mixamo.json (which clips are in which pack, which play once, each walk and run's speed, so feet don't
// slide, and how far each one-shot goes, so a roll covers its ground).
//   npm i --prefix build/node three@0.160.0     (once: three.js for Node, in the ignored build folder)
//   node tools/humans/mixamo.mjs
//
// Each Biped bone follows the Mixamo bone it stands for in world space: the turn the Mixamo bone has made since its
// T-pose is applied to the Biped bone, after first turning the Biped bone so that at rest it points and rolls the way
// the Mixamo bone does (two directions per bone: along it, and across the body, the chest or the palm). The Biped rests
// in an A-pose; this is what keeps its arms from hanging low and its hands from twisting. The hips take the Mixamo
// hips' travel scaled to the Biped's legs, minus the clip's net travel (the game moves people itself); see "root" in
// mixamo.json.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../../', import.meta.url).pathname, T3 = ROOT + 'build/node/node_modules/three/';
if (!existsSync(T3)) { console.error('three.js for Node is missing: npm i --prefix build/node three@0.160.0'); process.exit(1); }
const THREE = await import(T3 + 'build/three.module.js');
const { FBXLoader } = await import(T3 + 'examples/jsm/loaders/FBXLoader.js');
const V3 = THREE.Vector3, Q4 = THREE.Quaternion;
const LIST = JSON.parse(readFileSync(ROOT + 'tools/humans/mixamo.json', 'utf8')).clips;
const FPS = 30, TOL_Q = 0.005, TOL_P = 0.002; // sampling rate; how far (radians, metres) a dropped key may stray from the curve
const TARGETS = { m: 'assets/humans/Male_Adult_01.glb', f: 'assets/humans/Female_Adult_01.glb' };

// ---- the packs, unzipped
const ZIPS = ROOT + 'build/mixamo/zips/', FBX = ROOT + 'build/mixamo/fbx/';
mkdirSync(FBX, { recursive: true });
for (const z of readdirSync(ZIPS).filter(f => f.endsWith('.zip'))) execFileSync('unzip', ['-oq', ZIPS + z, '-d', FBX]);
const warn = console.warn; console.warn = () => {}; // FBXLoader complains about the X Bot's textures, which aren't wanted
const loader = new FBXLoader();
// three's reader guesses where a binary FBX ends from the footer's size, and some of Mixamo's files fool it into reading the
// footer as data: so the file is cut right after its last top-level record (7.5+ records start with 64-bit offsets) and
// padded so the guess lands there
function loadFbx(f) {
  const b = readFileSync(f), ver = b.readUInt32LE(23); let off = 27, end = b.length;
  if (ver >= 7500) { for (;;) { const e = Number(b.readBigUInt64LE(off)); if (!e || e > b.length) { end = off; break; } off = e; } }
  const cut = Buffer.concat([b.subarray(0, end), Buffer.alloc((end + 177) % 16 ? 177 : 178)]);
  return loader.parse(cut.buffer.slice(cut.byteOffset, cut.byteOffset + cut.byteLength), '');
}

// ---- which Biped bone stands for which Mixamo bone
const MAP = { Hips: 'Pelvis', Spine: 'Spine', Spine1: 'Spine1', Spine2: 'Spine2', Neck: 'Neck', Head: 'Head' };
const TIP = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head' }; // the bone each one points at
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
for (const [m, b] of [['Left', 'L'], ['Right', 'R']]) {
  Object.assign(MAP, { [m + 'Shoulder']: b + ' Clavicle', [m + 'Arm']: b + ' UpperArm', [m + 'ForeArm']: b + ' Forearm', [m + 'Hand']: b + ' Hand',
    [m + 'UpLeg']: b + ' Thigh', [m + 'Leg']: b + ' Calf', [m + 'Foot']: b + ' Foot', [m + 'ToeBase']: b + ' Toe0' });
  Object.assign(TIP, { [m + 'Shoulder']: m + 'Arm', [m + 'Arm']: m + 'ForeArm', [m + 'ForeArm']: m + 'Hand', [m + 'Hand']: m + 'HandMiddle1',
    [m + 'UpLeg']: m + 'Leg', [m + 'Leg']: m + 'Foot', [m + 'Foot']: m + 'ToeBase' });
  FINGERS.forEach((f, i) => { for (let s = 1; s <= 3; s++) { MAP[m + 'Hand' + f + s] = `${b} Finger${i}${s === 1 ? '' : s - 1}`; if (s < 3) TIP[m + 'Hand' + f + s] = m + 'Hand' + f + (s + 1); } });
}
const PARENT_DIR = { Head: 'Neck', LeftToeBase: 'LeftFoot', RightToeBase: 'RightFoot' }; // no tip in both rigs: along the bone before
for (const s of ['Left', 'Right']) for (const f of FINGERS) PARENT_DIR[s + 'Hand' + f + 3] = s + 'Hand' + f + 2;

// ---- a rig at rest: bone by Mixamo name, world positions and turns
function restOf(get, root) {
  root.updateMatrixWorld(true); const R = {};
  for (const m in MAP) { const o = get(m); if (o) R[m] = { o, p: o.getWorldPosition(new V3()), q: o.getWorldQuaternion(new Q4()) }; }
  for (const m in TIP) { const t = TIP[m]; if (!R[t] && get(t)) R[t] = { o: get(t), p: get(t).getWorldPosition(new V3()), q: get(t).getWorldQuaternion(new Q4()) }; }
  const left = new V3().subVectors(R.LeftUpLeg.p, R.RightUpLeg.p).setY(0).normalize(), up = new V3(0, 1, 0);
  return { R, left, up, fwd: new V3().crossVectors(left, up), hipY: R.Hips.p.y - Math.min(R.LeftFoot.p.y, R.RightFoot.p.y) + 0.0 };
}
function along(rig, m) { // the bone's direction at rest
  const R = rig.R, t = TIP[m];
  if (t && R[m] && R[t] && R[t].p.distanceToSquared(R[m].p) > 1e-10) return new V3().subVectors(R[t].p, R[m].p).normalize();
  if (PARENT_DIR[m]) return along(rig, PARENT_DIR[m]);
  return rig.up.clone();
}
function across(rig, m) { // a second direction that fixes the bone's roll: across the palm for hands and fingers, forward for arms, left for the rest
  const R = rig.R, side = m.startsWith('Left') ? 'Left' : 'Right';
  if (/Hand/.test(m) && R[side + 'HandIndex1'] && R[side + 'HandPinky1']) return new V3().subVectors(R[side + 'HandIndex1'].p, R[side + 'HandPinky1'].p).normalize();
  if (/Shoulder|Arm/.test(m)) return rig.fwd.clone();
  return rig.left.clone();
}
function frame(a, b) { // a rotation whose x axis is a and whose xy plane holds b
  const x = a.clone().normalize(); let z = new V3().crossVectors(x, b); if (z.lengthSq() < 1e-6) z = new V3().crossVectors(x, Math.abs(x.y) < 0.9 ? new V3(0, 1, 0) : new V3(0, 0, 1)); z.normalize();
  const y = new V3().crossVectors(z, x); return new Q4().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// ---- the Biped, from an avatar's nodes (its textures aren't needed)
function biped(file) {
  const b = readFileSync(ROOT + file), j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString());
  const objs = j.nodes.map(n => { const o = new THREE.Object3D(); o.name = n.name || ''; if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale); return o; });
  j.nodes.forEach((n, i) => (n.children || []).forEach(c => objs[i].add(objs[c])));
  const top = new THREE.Group(); for (const o of objs) if (!o.parent) top.add(o);
  const byName = new Map(objs.map(o => [o.name, o])), bones = []; top.traverse(o => { if (/^Bip01/.test(o.name)) bones.push(o); }); // parents first
  const rig = restOf(m => byName.get('Bip01 ' + (MAP[m] || ({ LeftHandMiddle1: 'L Finger2', RightHandMiddle1: 'R Finger2' })[m] || '')) || null, top);
  for (const o of bones) o.userData.rest = { lq: o.quaternion.clone(), lp: o.position.clone(), wq: o.getWorldQuaternion(new Q4()) };
  return { top, byName, bones, rig };
}

// ---- one clip, re-aimed
function retarget(clipFile, tgt, opt) {
  const g = loadFbx(clipFile), clip = g.animations[0]; if (!clip) throw new Error('no animation in ' + clipFile);
  const get = m => g.getObjectByName('mixamorig' + m) || null, src = restOf(get, g), S = src.R, T = tgt.rig.R;
  // the source's frame turned to the target's (both stand up along +y; turn about y so their left sides agree)
  const yaw = Math.atan2(tgt.rig.left.x, tgt.rig.left.z) - Math.atan2(src.left.x, src.left.z), F = new Q4().setFromAxisAngle(new V3(0, 1, 0), yaw), Fi = F.clone().invert();
  const align = {}; // per bone: target rest -> the source's rest pointing and roll
  for (const m in MAP) {
    if (!S[m] || !T[m]) continue;
    const fs = frame(along(src, m).applyQuaternion(F), across(src, m).applyQuaternion(F)), ft = frame(along(tgt.rig, m), across(tgt.rig, m));
    align[m] = fs.multiply(ft.invert());
  }
  const k = tgt.rig.hipY / src.hipY, mixer = new THREE.AnimationMixer(g), act = mixer.clipAction(clip); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.play(); // (a loop would wrap its last frame back to the first)
  const [t0, t1] = (opt.trim || [0, 1]).map(f => f * clip.duration), dur = t1 - t0; // trim: the part of the clip to keep (a loop that starts by sitting down)
  const n = Math.max(2, Math.round(dur * FPS) + 1), times = new Float32Array(n), mapped = Object.keys(align);
  const byTarget = new Map(mapped.map(m => [tgt.byName.get('Bip01 ' + MAP[m]), m]));
  const rot = new Map(mapped.map(m => [m, new Float32Array(n * 4)])), hip = new Float32Array(n * 3), disp = [];
  const W = new Map(), q = new Q4(), d = new Q4(), wq = new Q4(), lq = new Q4();
  for (let i = 0; i < n; i++) {
    const t = Math.min(dur, i / FPS); times[i] = t; mixer.setTime(t0 + t); g.updateMatrixWorld(true); W.clear();
    for (const b of tgt.bones) {
      const pw = W.get(b.parent) || b.parent.getWorldQuaternion(new Q4()), m = byTarget.get(b);
      if (m) {
        S[m].o.getWorldQuaternion(q); d.copy(S[m].q).invert().premultiply(q); // the source bone's turn since its T-pose
        d.premultiply(F).multiply(Fi); // ...in the target's frame
        wq.copy(d).multiply(align[m]).multiply(b.userData.rest.wq);
        lq.copy(pw).invert().multiply(wq); const arr = rot.get(m);
        if (i > 0 && lq.x * arr[i * 4 - 4] + lq.y * arr[i * 4 - 3] + lq.z * arr[i * 4 - 2] + lq.w * arr[i * 4 - 1] < 0) lq.set(-lq.x, -lq.y, -lq.z, -lq.w); // the short way round
        lq.toArray(arr, i * 4); W.set(b, wq.clone());
      } else W.set(b, pw.clone().multiply(b.userData.rest.lq));
    }
    disp.push(S.Hips.o.getWorldPosition(new V3()).sub(S.Hips.p).applyQuaternion(F).multiplyScalar(k));
  }
  // how far the clip travels: a walk or run's speed (m/s), a one-shot's distance (a roll, a dive), before it's taken out
  const net = Math.hypot(disp[n - 1].x - disp[0].x, disp[n - 1].z - disp[0].z), v = Math.round((opt.once ? net : net / dur) * 100) / 100;
  // the hips' travel: drift (default) takes out the start offset and the net travel, keeps the sway; lock keeps only the
  // bob; still keeps the hips where they rest (jumps: the game lifts the body); keep leaves it all (falls, getting up)
  const mode = opt.root || 'drift', a = disp[0], z = disp[n - 1];
  const pel = tgt.byName.get('Bip01 Pelvis'), pParent = pel.parent.matrixWorld.clone().invert();
  for (let i = 0; i < n; i++) {
    const v = disp[i].clone(), f = n > 1 ? i / (n - 1) : 0;
    if (mode === 'still') v.set(0, 0, 0); else if (mode === 'lock') { v.x = 0; v.z = 0; } else if (mode === 'drift') { v.x -= a.x + (z.x - a.x) * f; v.z -= a.z + (z.z - a.z) * f; }
    v.add(T.Hips.p).applyMatrix4(pParent).toArray(hip, i * 3);
  }
  const tracks = mapped.map(m => reduce('Bip01 ' + MAP[m], 'rotation', times, rot.get(m), 4));
  tracks.push(reduce('Bip01 Pelvis', 'translation', times, hip, 3));
  return { name: opt.key, duration: dur, tracks, v };
}

// drop the keys the curve doesn't need (each one checked against its neighbours that stay)
function reduce(node, path, times, v, w) {
  const keep = [0], n = times.length, at = (i, o) => v.subarray(i * w, i * w + w), tmp = new Float32Array(w);
  for (let i = 1; i < n - 1; i++) {
    const a = keep[keep.length - 1], f = (times[i] - times[a]) / (times[i + 1] - times[a]);
    if (w === 4) { const qa = new Q4().fromArray(at(a)), qb = new Q4().fromArray(at(i + 1)), qi = new Q4().fromArray(at(i)); qa.slerp(qb, f); if (qa.angleTo(qi) > TOL_Q) keep.push(i); }
    else { let e = 0; for (let c = 0; c < w; c++) { tmp[c] = at(a)[c] + (at(i + 1)[c] - at(a)[c]) * f; e = Math.max(e, Math.abs(tmp[c] - at(i)[c])); } if (e > TOL_P) keep.push(i); }
  }
  if (n > 1) keep.push(n - 1);
  const t = new Float32Array(keep.length), o = new Float32Array(keep.length * w);
  keep.forEach((k, j) => { t[j] = times[k]; o.set(at(k), j * w); });
  return { node, path, times: t, values: o };
}

// ---- a GLB of animations only: one node per animated bone, named as in the avatars (the loader binds by name)
function writeGlb(file, clips) {
  const chunks = [], views = [], accessors = [], nodes = [], nodeOf = new Map(); let off = 0;
  const add = (arr, type, count, minmax) => {
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); chunks.push(b); views.push({ buffer: 0, byteOffset: off, byteLength: b.length }); off += b.length;
    const acc = { bufferView: views.length - 1, componentType: arr instanceof Int16Array ? 5122 : 5126, count, type }; if (arr instanceof Int16Array) acc.normalized = true;
    if (minmax) { acc.min = [arr[0]]; acc.max = [arr[arr.length - 1]]; } accessors.push(acc); return accessors.length - 1;
  };
  const short = v => Int16Array.from(v, x => Math.round(Math.max(-1, Math.min(1, x)) * 32767)); // turns as normalized 16-bit (glTF allows it for rotations): half the size
  const animations = clips.map(c => {
    const channels = [], samplers = [];
    for (const tr of c.tracks) {
      if (!nodeOf.has(tr.node)) { nodes.push({ name: tr.node }); nodeOf.set(tr.node, nodes.length - 1); }
      const input = add(tr.times, 'SCALAR', tr.times.length, true), output = tr.path === 'rotation' ? add(short(tr.values), 'VEC4', tr.times.length) : add(tr.values, 'VEC3', tr.times.length);
      samplers.push({ input, output, interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: nodeOf.get(tr.node), path: tr.path } });
    }
    return { name: c.name, channels, samplers };
  });
  const bin = Buffer.concat(chunks), pad = (4 - bin.length % 4) % 4, binP = Buffer.concat([bin, Buffer.alloc(pad)]);
  const json = { asset: { version: '2.0', generator: 'tools/humans/mixamo.mjs' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, buffers: [{ byteLength: binP.length }], bufferViews: views, accessors, animations };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + binP.length, 8);
  const c0 = Buffer.alloc(8); c0.writeUInt32LE(js.length, 0); c0.writeUInt32LE(0x4e4f534a, 4);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(binP.length, 0); c1.writeUInt32LE(0x004e4942, 4);
  writeFileSync(ROOT + file, Buffer.concat([head, c0, js, c1, binP]));
  return 12 + 16 + js.length + binP.length;
}

// ---- every clip, for both Bipeds
const out = { packs: { core: [], more: [] }, once: [], v: {}, dist: {} }, missing = [];
for (const [sex, file] of Object.entries(TARGETS)) {
  const tgt = biped(file), packs = { core: [], more: [] };
  for (const c of LIST) {
    const f = FBX + c.key + '.fbx'; if (!existsSync(f)) { if (sex === 'm') missing.push(c.key); continue; }
    packs[c.pack || 'more'].push(retarget(f, tgt, c));
  }
  for (const p of ['core', 'more']) {
    const size = writeGlb(`assets/humans/anim/${sex}_${p}.glb`, packs[p]);
    console.log(`${sex}_${p}.glb: ${packs[p].length} clips, ${(size / 1024).toFixed(0)} KB`);
    if (sex === 'm') { out.packs[p] = packs[p].map(c => c.name); for (const c of packs[p]) if (c.v > 0.2) out[LIST.find(x => x.key === c.name).once ? 'dist' : 'v'][c.name] = c.v; }
  }
}
out.once = LIST.filter(c => c.once && out.packs[c.pack || 'more'].includes(c.key)).map(c => c.key);
writeFileSync(ROOT + 'assets/humans/anim/mixamo.json', JSON.stringify({ note: 'Mixamo animations on the Rocketbox Biped (tools/humans/mixamo.mjs): {sex}_{pack}.glb', ...out }) + '\n');
console.warn = warn;
if (missing.length) console.log('not exported yet:', missing.join(' '));
