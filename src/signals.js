// Traffic-signal hardware for every signalised intersection, modelled on Caltrans combined signal + lighting
// standards as used across San Diego County: galvanized tapered pole on a concrete pile, mast arm over the approach
// lanes, luminaire davit with an LED cobra head on top, 12" heads with black backplates and a yellow retroreflective
// border, 4-section flashing-yellow-arrow left-turn heads, side/pedestal heads, countdown ped heads, push buttons,
// internally illuminated street-name signs, limit lines and crosswalks. One InstancedMesh per part type city-wide;
// instances are stored per intersection so update(..., eye) can draw only the intersections near the camera.
//
//   createSignals(THREE, ctx) -> { group, update(aspectFn, night, t, eye?), approaches, layout, stats, drawDist }
//   ctx = { inters, edges, nodeEdges, NX, heightAt(x,z), addPoly?(flat, y0, y1), materials?: { pole, line },
//           walkMode?: 'parallel'|'across', drawDist?: metres (default 1100), signFont?, anisotropy?,
//           lineY?: paint height over heightAt (default 0.18), school?(x, z): true = school zone (yellow crosswalks) }
//   aspectFn(ap) -> { ball: 'r'|'y'|'g'|'off'|'fr'|'fy', arrow: null|'r'|'y'|'g'|'fy', walk: 'walk'|'flash'|'dont', cd? }
//   walk ('parallel', default) = the ped phase that runs WITH this approach's through movement (NEMA style: peds
//   walking parallel to it). 'across' = the crosswalk on this approach's own leg. cd = optional countdown seconds
//   during 'flash' (estimated from the previous flash when omitted). arrow null on a leftArrow approach mirrors the
//   ball (green -> flashing yellow arrow). 'fr'/'fy' balls flash (e.g. all-way-stop flash during a power event).
import { laneOffset, arrivalDir } from './roadnet.js';

const SEC = 0.356, HWID = 0.36, HDEP = 0.24, BPM = 0.13, LENS_R = 0.15, LENS_Z = 0.13; // 12" sections
const ARM_Y = 7.05, POLE_H = 10.4, LUM_L = 4.6, HANG = 0.32;  // mast arm centre (head bottoms 17.4-18.6 ft clear), pole, 15 ft davit
const SIDE_Y = 3.05, PED_Y = 2.3, POST_H = 3.05, PB_Y = 1.0;   // side heads, ped heads, Type 1-A post, push buttons
const SIGN_H = 0.61, SIGN_WS = [1.83, 2.44, 3.05, 3.66];       // IISNS 24" tall, 6/8/10/12 ft long
const DAY_GLOW = 0.32; // daylight halo beyond ~20 m (keeps lit lenses readable at 100+ m)
const GALV = [0.66, 0.68, 0.68], LUMC = [0.6, 0.62, 0.63], CAMC = [0.82, 0.81, 0.77], HOUS = [0.045, 0.045, 0.045], BLK = [0.025, 0.025, 0.025], YEL = [0.98, 0.74, 0.05];
const LIT = [[1.15, 0.012, 0.006], [1.25, 0.42, 0], [0, 0.75, 0.4]];             // red, yellow, green (LED; kept < ~1.3 so ACES keeps them saturated)
const DIM = [[0.055, 0.008, 0.007], [0.065, 0.038, 0.006], [0.006, 0.042, 0.034]];
const GLOW = [[1, 0.1, 0.03], [1, 0.5, 0.03], [0.05, 1, 0.6]];
const HAND = [1.3, 0.25, 0.01], PERSON = [1.1, 1.2, 1.2], GHOST = [0.05, 0.045, 0.04];
const BALL_ON = { r: [1, 0, 0], y: [0, 1, 0], g: [0, 0, 1] };
const ABBR = [[/\bRoad\b/g, 'Rd'], [/\bDrive\b/g, 'Dr'], [/\bStreet\b/g, 'St'], [/\bAvenue\b/g, 'Ave'], [/\bBoulevard\b/g, 'Blvd'], [/\bParkway\b/g, 'Pkwy'], [/\bLane\b/g, 'Ln'], [/\bCourt\b/g, 'Ct'], [/\bPlace\b/g, 'Pl'], [/\bCircle\b/g, 'Cir'], [/\bTerrace\b/g, 'Ter'], [/\bHighway\b/g, 'Hwy'], [/^North\b/, 'N'], [/^South\b/, 'S'], [/^East\b/, 'E'], [/^West\b/, 'W']];
export const signName = n => ABBR.reduce((s, [re, r]) => s.replace(re, r), n || '');
const PARTS = ['std', 'arm', 'pipe', 'box', 'found', 'h3', 'h4', 'ped', 'pb', 'reg', 'noU', 'lumLens', 'lumGlow', 'ball', 'arrow', 'glow', 'glyph'];
const CAB = [0.72, 0.73, 0.71], CONC = [0.74, 0.72, 0.68], REG_W = 0.76, REG_H = 0.91; // 332L cabinet aluminium, pad, R10-12 30"x36"
const LIVE = ['ball', 'arrow', 'glow', 'glyph']; // parts whose colours change at run time
const NOU = 0.76; // R3-4 NO U-TURN, 30" square

export function createSignals(THREE, ctx) {
  const { inters, edges, nodeEdges, NX } = ctx;
  const heightAt = ctx.heightAt || (() => 0), mats = ctx.materials || {}, walkMode = ctx.walkMode || 'parallel';
  const FONT = ctx.signFont || '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  const LINE_Y = ctx.lineY != null ? ctx.lineY : 0.18, school = ctx.school || (() => false), XW_SCHOOL = [0.96, 0.78, 0.08];
  const V3 = THREE.Vector3, UP = new V3(0, 1, 0);

  // ---------------------------------------------------------------- geometry helpers (indexed, position/normal/color)
  const tr = (g, x, y, z) => g.translate(x, y, z);
  const box = (w, h, d, x = 0, y = 0, z = 0) => tr(new THREE.BoxGeometry(w, h, d), x, y, z);
  const plane = (w, h, x = 0, y = 0, z = 0) => tr(new THREE.PlaneGeometry(w, h), x, y, z);
  const cyl = (rt, rb, h, seg, x, y, z, open = false, t0 = 0, tl = Math.PI * 2) => tr(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl), x, y, z);
  const disc = (r, seg, x, y, z) => tr(new THREE.CircleGeometry(r, seg), x, y, z);
  function tube(a, b, r0, r1, seg) { // open cylinder from point a (radius r0) to b (radius r1)
    const d = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    return tr(g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  }
  function merge(parts) {
    let nv = 0, ni = 0; for (const [g] of parts) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni); let ov = 0, oi = 0;
    for (const [g, c] of parts) {
      const p = g.attributes.position, n = g.attributes.normal, cnt = p.count;
      for (let i = 0; i < cnt; i++) { pos[(ov + i) * 3] = p.getX(i); pos[(ov + i) * 3 + 1] = p.getY(i); pos[(ov + i) * 3 + 2] = p.getZ(i); nor[(ov + i) * 3] = n.getX(i); nor[(ov + i) * 3 + 1] = n.getY(i); nor[(ov + i) * 3 + 2] = n.getZ(i); col.set(c, (ov + i) * 3); }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.getX(i) + ov; else for (let i = 0; i < cnt; i++) idx[oi++] = ov + i;
      ov += cnt; g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1)); return out;
  }

  // ---------------------------------------------------------------- part geometries (local: +z faces traffic, mast arm runs to -x)
  const G = {};
  { // combination standard: base plate + anchor nuts, tapered shaft, cap, luminaire davit with LED cobra head
    const P = [[box(0.56, 0.05, 0.56, 0, 0.145, 0), GALV], [cyl(0.115, 0.18, POLE_H - 0.17, 12, 0, (POLE_H + 0.17) / 2, 0, true), GALV],
      [cyl(0.02, 0.118, 0.09, 10, 0, POLE_H + 0.045, 0, true), GALV], [plane(0.13, 0.3, 0, 0.75, 0.172), GALV]]; // cap, handhole cover
    for (const [x, z] of [[0.21, 0.21], [-0.21, 0.21], [0.21, -0.21], [-0.21, -0.21]]) P.push([box(0.07, 0.09, 0.07, x, 0.21, z), GALV]);
    const dv = [[-0.05, POLE_H - 0.6, 0], [-0.75, POLE_H - 0.05, 0], [-1.8, POLE_H + 0.32, 0], [-3.2, POLE_H + 0.47, 0], [-LUM_L, POLE_H + 0.52, 0]], dr = [0.075, 0.064, 0.055, 0.048, 0.044];
    for (let i = 0; i < dv.length - 1; i++) P.push([tube(dv[i], dv[i + 1], dr[i], dr[i + 1], 6), GALV]);
    P.push([cyl(0.125, 0.125, 0.3, 10, 0, POLE_H - 0.55, 0, true), GALV]); // davit slip-fitter collar
    const cobra = new THREE.SphereGeometry(1, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.4, 0.13, 0.19);
    P.push([tr(cobra, -LUM_L - 0.28, POLE_H + 0.47, 0), LUMC], [box(0.7, 0.035, 0.36, -LUM_L - 0.28, POLE_H + 0.455, 0), LUMC]);
    // video detection camera hung under the davit, aimed down the approach (sun shield + body + dark lens)
    const cam = [[box(0.13, 0.12, 0.4, 0, 0, 0), CAMC], [box(0.17, 0.02, 0.46, 0, 0.075, 0.02), CAMC], [box(0.09, 0.08, 0.01, 0, 0, 0.205), BLK]]
      .map(([g, c]) => [g.rotateX(0.32).translate(-1.35, POLE_H + 0.02, 0.05), c]);
    P.push(...cam, [cyl(0.018, 0.018, 0.3, 5, -1.35, POLE_H + 0.2, 0), GALV]);
    G.std = merge(P);
  }
  { // tapered mast arm, unit length along -x (instance scale.x = length); radial normals so the stretch keeps shading right
    const g = new THREE.CylinderGeometry(0.075, 0.14, 1, 10, 1, true).rotateZ(Math.PI / 2).translate(-0.5, 0, 0);
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { const y = n.getY(i), z = n.getZ(i), l = Math.hypot(y, z) || 1; n.setXYZ(i, 0, y / l, z / l); }
    G.arm = merge([[g, GALV], [disc(0.075, 10, 0, 0, 0).rotateY(-Math.PI / 2).translate(-1, 0, 0), GALV]]);
  }
  G.pipe = merge([[cyl(1, 1, 1, 6, 0, 0.5, 0, true), GALV]]);
  G.box = merge([[box(1, 1, 1), GALV]]);
  G.found = merge([[cyl(0.42, 0.42, 0.78, 10, 0, -0.24, 0, true), [1, 1, 1]], [disc(0.42, 10, 0, 0, 0).rotateX(-Math.PI / 2).translate(0, 0.15, 0), [1, 1, 1]]]);
  function headGeo(n) { // n-section 12" head, origin at housing bottom centre, lenses face +z
    const H = n * SEC, bw = HWID + 2 * BPM, bh = H + 2 * BPM, bz = -HDEP / 2 - 0.012, b = 0.065, fz = bz + 0.011;
    const P = [[box(HWID, H, HDEP, 0, H / 2, 0), HOUS], [box(bw, bh, 0.02, 0, H / 2, bz), BLK],
      [plane(bw, b, 0, H / 2 + bh / 2 - b / 2, fz), YEL], [plane(bw, b, 0, H / 2 - bh / 2 + b / 2, fz), YEL],
      [plane(b, bh - 2 * b, bw / 2 - b / 2, H / 2, fz), YEL], [plane(b, bh - 2 * b, -bw / 2 + b / 2, H / 2, fz), YEL]];
    for (let k = 0; k < n; k++) {
      const y = H - SEC * (k + 0.5);
      P.push([cyl(0.172, 0.172, 0.25, 10, 0, 0, 0, true, Math.PI * 0.32, Math.PI * 1.36).rotateX(Math.PI / 2).translate(0, y, HDEP / 2 + 0.125), HOUS]); // tunnel visor
      if (n === 4) P.push([disc(LENS_R, 12, 0, y, LENS_Z), [0.02, 0.02, 0.022]]);
    }
    return merge(P);
  }
  G.h3 = headGeo(3); G.h4 = headGeo(4);
  // countdown ped head 18"x16": left half hand/person, right half two digits; open hood
  G.ped = merge([[box(0.48, 0.44, 0.2, 0, 0.22, 0), HOUS], [plane(0.44, 0.4, 0, 0.22, 0.102), [0.018, 0.018, 0.018]],
    [plane(0.48, 0.13).rotateX(-Math.PI / 2).translate(0, 0.44, 0.165), HOUS], [plane(0.13, 0.44).rotateY(Math.PI / 2).translate(0.235, 0.22, 0.165), HOUS], [plane(0.13, 0.44).rotateY(Math.PI / 2).translate(-0.235, 0.22, 0.165), HOUS]]);
  G.pb = merge([[box(0.11, 0.17, 0.07, 0, 0, 0.035), [0.16, 0.16, 0.16]], [cyl(0.03, 0.03, 0.03, 8, 0, 0, 0).rotateX(Math.PI / 2).translate(0, -0.02, 0.08), [0.75, 0.75, 0.72]],
    [plane(0.22, 0.29, 0, 0.26, 0.012), [0.92, 0.92, 0.9]], [plane(0.15, 0.025, 0, 0.2, 0.014), [0.05, 0.05, 0.05]], [plane(0.05, 0.1, 0, 0.3, 0.014), [0.05, 0.05, 0.05]]]);
  G.ball = new THREE.CircleGeometry(LENS_R, 12);
  { const s = new THREE.Shape(); s.moveTo(0.115, 0.026); s.lineTo(-0.015, 0.026); s.lineTo(-0.015, 0.078); s.lineTo(-0.118, 0); s.lineTo(-0.015, -0.078); s.lineTo(-0.015, -0.026); s.lineTo(0.115, -0.026); s.closePath(); G.arrow = new THREE.ShapeGeometry(s); }
  G.glow = new THREE.PlaneGeometry(1, 1);
  G.reg = new THREE.PlaneGeometry(REG_W, REG_H);
  G.noU = new THREE.PlaneGeometry(NOU, NOU);
  G.glyph = new THREE.PlaneGeometry(1, 1);
  G.lumLens = new THREE.CircleGeometry(1, 12).rotateX(Math.PI / 2).scale(0.3, 1, 0.14).translate(-LUM_L - 0.28, POLE_H + 0.435, 0);
  G.lumGlow = new THREE.PlaneGeometry(15, 15).rotateX(-Math.PI / 2);

  // ---------------------------------------------------------------- textures
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const radial = stops => { const c = canvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); };
  const glowTex = radial([[0, 1], [0.25, 0.55], [1, 0]]), haloTex = radial([[0, 1], [0.12, 0.7], [0.3, 0.22], [0.6, 0.05], [1, 0]]);
  const PED_CELLS = 13; // 0 hand, 1 person, 2..11 digits, 12 blank
  const pedTex = (() => {
    const CW = 96, CH = 128, c = canvas(CW * PED_CELLS, CH), g = c.getContext('2d'); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = g.lineJoin = 'round';
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
    rr(25, 52, 46, 58, 12); for (let k = 0; k < 4; k++) rr(25 + k * 11.8, 14 + (k === 0 ? 10 : k === 3 ? 8 : 0), 10, 50, 5);
    g.save(); g.translate(26, 80); g.rotate(-0.75); rr(-6, -34, 12, 36, 6); g.restore();
    g.save(); g.translate(CW, 0); g.lineWidth = 13; g.beginPath(); g.arc(50, 20, 10, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(49, 37); g.lineTo(45, 72); g.stroke(); g.lineWidth = 11;
    g.beginPath(); g.moveTo(45, 72); g.lineTo(58, 90); g.lineTo(62, 114); g.moveTo(45, 72); g.lineTo(36, 92); g.lineTo(22, 112); g.moveTo(48, 42); g.lineTo(32, 60); g.lineTo(26, 72); g.moveTo(48, 42); g.lineTo(62, 58); g.lineTo(72, 66); g.stroke(); g.restore();
    const SEG = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f]; // gfedcba
    for (let d = 0; d < 10; d++) {
      g.save(); g.translate(CW * (2 + d) + 18, 10); const w = 60, h = 108, t = 12, m = SEG[d];
      const seg = [[t / 2, 0, w - t, t], [w - t, t / 2, t, h / 2 - t], [w - t, h / 2 + t / 2, t, h / 2 - t], [t / 2, h - t, w - t, t], [0, h / 2 + t / 2, t, h / 2 - t], [0, t / 2, t, h / 2 - t], [t / 2, h / 2 - t / 2, w - t, t]];
      seg.forEach((s, i) => { if (m >> i & 1) rr(s[0], s[1], s[2], s[3], 4); }); g.restore();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  })();

  const regCanvas = canvas(256, 308), regTex = new THREE.CanvasTexture(regCanvas); regTex.colorSpace = THREE.SRGBColorSpace; regTex.anisotropy = 4;
  const drawReg = () => { // R10-12: LEFT TURN YIELD ON + flashing-yellow-arrow symbol, black on white
    const g = regCanvas.getContext('2d'); g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 256, 308);
    g.strokeStyle = '#111'; g.lineWidth = 7; g.beginPath(); g.roundRect(9, 9, 238, 290, 14); g.stroke();
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 50px ${FONT}`;
    g.fillText('LEFT TURN', 128, 52, 214); g.fillText('YIELD ON', 128, 106, 214);
    g.beginPath(); g.roundRect(70, 140, 116, 140, 16); g.fill(); g.fillStyle = '#f5b400';
    g.beginPath(); g.moveTo(84, 210); g.lineTo(122, 176); g.lineTo(122, 197); g.lineTo(170, 197); g.lineTo(170, 223); g.lineTo(122, 223); g.lineTo(122, 244); g.closePath(); g.fill();
    g.strokeStyle = '#f5b400'; g.lineWidth = 5; for (const [x0, y0, x1, y1] of [[64, 172, 52, 162], [64, 248, 52, 258], [192, 172, 204, 162], [192, 248, 204, 258], [58, 210, 44, 210], [198, 210, 212, 210]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    regTex.needsUpdate = true;
  };
  drawReg();
  const nouCanvas = canvas(256, 256), nouTex = new THREE.CanvasTexture(nouCanvas); nouTex.colorSpace = THREE.SRGBColorSpace; nouTex.anisotropy = 4;
  { // R3-4: black U-turn arrow under a red circle and slash, on white
    const g = nouCanvas.getContext('2d'); g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#111'; g.lineWidth = 7; g.beginPath(); g.roundRect(8, 8, 240, 240, 16); g.stroke();
    g.strokeStyle = '#111'; g.lineWidth = 24; g.lineCap = 'butt'; g.beginPath(); g.moveTo(160, 200); g.lineTo(160, 110); g.arc(122, 110, 38, 0, Math.PI, true); g.lineTo(84, 150); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.moveTo(54, 140); g.lineTo(114, 140); g.lineTo(84, 186); g.closePath(); g.fill();
    g.strokeStyle = '#c8102e'; g.lineWidth = 20; g.beginPath(); g.arc(128, 128, 94, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(62, 62); g.lineTo(194, 194); g.stroke(); nouTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- materials
  const galv = mats.pole || new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.48, metalness: 0.3 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xbab4a7, roughness: 0.95 });
  const headMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const glyphMat = new THREE.MeshBasicMaterial({ map: pedTex, transparent: true, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  glyphMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = vec2((aCell + uv.x) / ${PED_CELLS}.0, uv.y);`);
  };
  const glowMat = new THREE.ShaderMaterial({ // camera-facing halo, only visible from in front of the lens
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, opacity: { value: 0.15 }, dayOp: { value: 0 }, size: { value: 1.2 } }]),
    vertexShader: `uniform float size, opacity, dayOp; varying vec2 vUv; varying vec3 vCol; varying float vFogDepth;
      void main(){ vUv = uv; vCol = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
        vCol = instanceColor;
        #endif
        mat4 mm = modelViewMatrix * instanceMatrix; vec4 c = mm * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 fw = normalize((mm * vec4(0.0, 0.0, 1.0, 0.0)).xyz), toCam = normalize(-c.xyz);
        vCol *= smoothstep(0.3, 0.8, dot(fw, toCam));
        float d = -c.z; vCol *= opacity + dayOp * smoothstep(20.0, 90.0, d); c.xyz += toCam * 0.42; c.xy += position.xy * size * (1.0 + d * 0.006);
        vFogDepth = d; gl_Position = projectionMatrix * c; }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec3 vCol; varying float vFogDepth;
      #ifdef USE_FOG
      uniform float fogNear; uniform float fogFar;
      #endif
      void main(){ vec3 c = vCol * texture2D(map, vUv).a;
        #ifdef USE_FOG
        c *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  });
  glowMat.uniforms.map.value = haloTex;
  const regMat = new THREE.MeshStandardMaterial({ map: regTex, roughness: 0.5 });
  const nouMat = new THREE.MeshStandardMaterial({ map: nouTex, roughness: 0.5 });
  const lumLensMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
  const lumGlowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffe2b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 });
  const lineMat = mats.line || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 });

  // ---------------------------------------------------------------- instance collection (contiguous per intersection)
  const I = Object.fromEntries(PARTS.map(k => [k, { m: [], c: [], x: [], o: [] }]));
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _p = new V3(), _d = new V3();
  const put = (k, x, y, z, fx, fz, sx = 1, sy = 1, sz = 1, col) => {
    const L = I[k]; _q.setFromAxisAngle(UP, Math.atan2(fx, fz));
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); L.m.push(..._m.elements); L.c.push(...(col || [1, 1, 1])); return L.m.length / 16 - 1;
  };
  const pipe = (a, b, r, col) => { // pipe from a to b (world)
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _d.length(); if (len < 1e-3) return;
    _q.setFromUnitVectors(UP, _d.multiplyScalar(1 / len)); _m.compose(_p.set(a[0], a[1], a[2]), _q, _s.set(r, len, r)); I.pipe.m.push(..._m.elements); I.pipe.c.push(...(col || [1, 1, 1]));
  };
  // local (lx right, ly up, lz toward the viewer) -> world, for something at P facing (fx, fz)
  const loc = (P, fx, fz, lx, ly, lz) => [P[0] + fz * lx + fx * lz, P[1] + ly, P[2] - fx * lx + fz * lz];
  const marks = { p: [], c: [] }, signs = []; let poleCount = 0, postCount = 0;

  // flat strip on the ground from (ax,az) to (bx,bz), width w, subdivided to follow the terrain
  function strip(ax, az, bx, bz, w, col = [0.93, 0.93, 0.9]) {
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.05) return; const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz * w / 2, nz = tx * w / 2, n = Math.max(1, Math.ceil(L / 2.5));
    for (let i = 0; i < n; i++) {
      const x0 = ax + tx * L * i / n, z0 = az + tz * L * i / n, x1 = ax + tx * L * (i + 1) / n, z1 = az + tz * L * (i + 1) / n;
      const q = [[x0 + nx, z0 + nz], [x0 - nx, z0 - nz], [x1 - nx, z1 - nz], [x1 + nx, z1 + nz]].map(([x, z]) => [x, heightAt(x, z) + LINE_Y, z]);
      const flip = (q[1][0] - q[0][0]) * (q[2][2] - q[0][2]) - (q[1][2] - q[0][2]) * (q[2][0] - q[0][0]) > 0;
      for (const k of flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) { marks.p.push(...q[k]); marks.c.push(...col); }
    }
  }

  // ---------------------------------------------------------------- layout
  const frame = ap => ({ ox: ap.stopX, oz: ap.stopZ, dx: ap.dx, dz: ap.dz, rx: -ap.dz, rz: ap.dx });
  const toF = (F, x, z) => [(x - F.ox) * F.dx + (z - F.oz) * F.dz, (x - F.ox) * F.rx + (z - F.oz) * F.rz];
  const fromF = (F, a, l) => [F.ox + F.dx * a + F.rx * l, F.oz + F.dz * a + F.rz * l];
  const crossHalf = (n, dx, dz) => { let c = 0; for (const fi of nodeEdges[n]) { const f = edges[fi], [fx, fz] = arrivalDir(f, n); if (Math.abs(fx * dx + fz * dz) < 0.75) c = Math.max(c, f.w / 2); } return c; };
  const approaches = [], layout = new Map(), APS = [], XW = [], IT = [];
  // road clearance: segment grid over every edge ribbon; clear(x, z) = metres from the nearest carriageway edge (< 0 = on the road)
  const SG = 32, sgrid = new Map(), SEGS = [];
  for (const e of edges) {
    const p = e.pts, hw = e.w / 2, pad = hw + 3;
    for (let k = 0; k < p.length - 2; k += 2) {
      const si = SEGS.length; SEGS.push(p[k], p[k + 1], p[k + 2], p[k + 3], hw, e.i);
      for (let gx = Math.floor((Math.min(p[k], p[k + 2]) - pad) / SG); gx <= Math.floor((Math.max(p[k], p[k + 2]) + pad) / SG); gx++)
        for (let gz = Math.floor((Math.min(p[k + 1], p[k + 3]) - pad) / SG); gz <= Math.floor((Math.max(p[k + 1], p[k + 3]) + pad) / SG); gz++) {
          const key = gx * 100003 + gz; let c = sgrid.get(key); if (!c) sgrid.set(key, c = []); c.push(si);
        }
    }
  }
  function clear(x, z, skip, flat) { // flat: ignore points beyond a segment's ends (ribbon end caps)
    const c = sgrid.get(Math.floor(x / SG) * 100003 + Math.floor(z / SG)); let m = 3; if (!c) return m;
    for (const i of c) {
      if (skip && skip.has(SEGS[i + 5])) continue; const ax = SEGS[i], az = SEGS[i + 1], dx = SEGS[i + 2] - ax, dz = SEGS[i + 3] - az, l2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / l2; if (flat && (t < 0 || t > 1)) continue; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(ax + dx * t - x, az + dz * t - z) - SEGS[i + 4];
      if (d < m) { m = d; clear.ei = SEGS[i + 5]; }
    }
    return m;
  }
  // candidate offsets (da along the approach, dl to its right) by cost: further past the intersection is cheap, sideways
  // (longer arm) costs more, backwards (into the crosswalk) most; first candidate with `need` metres of clearance wins
  const OFFS = [];
  for (let da = -3; da <= 24; da += 0.5) for (let dl = -1.5; dl <= 7; dl += 0.5) OFFS.push([da, dl, (da < 0 ? -3 * da : da) + (dl < 0 ? -3 * dl : 1.6 * dl)]);
  OFFS.sort((p, q) => p[2] - q[2]);
  const depthAt = (F, a, l, own) => { const q = fromF(F, a, l); return clear(q[0], q[1], own, true); };
  const settle = (F, a, l, need, side = 1) => { for (const [da, dl] of OFFS) { const q = fromF(F, a + da, l + dl * side); if (clear(q[0], q[1]) >= need) return q; } return null; };
  const settleXZ = (x, z, need, R = 4) => { // nearest clear spot on growing rings (null: none within R)
    if (clear(x, z) >= need) return [x, z];
    for (let r = 0.5; r <= R; r += 0.5) for (let k = 0, n = Math.ceil(r * 6); k < n; k++) { const t = k / n * Math.PI * 2, qx = x + Math.cos(t) * r, qz = z + Math.sin(t) * r; if (clear(qx, qz) >= need) return [qx, qz]; }
    return null;
  };
  const signCells = new Map(); // text -> { text, w (m), rect }

  for (const it of inters.list) {
    for (const k of PARTS) I[k].o.push(I[k].m.length / 16);
    const T = { it, aps: [], xws: [] }; IT.push(T);
    const mounts = []; // { x, z, y, r, pole, head }
    const inSet = new Set(it.nodes);
    const internal = (f, n) => { const o = f.a === n ? f.b : f.a; return inSet.has(o) && f.len < 45; };
    const findMount = (x, z, maxD) => { let b = null, bd = maxD; for (const m of mounts) { const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; b = m; } } return b; };
    const addPost = (x, z, need = 0.6, R = 4) => { // Caltrans Type 1-A standard: 10 ft post on a cast base (null: no room off the road)
      const q = settleXZ(x, z, need, R); if (!q) return null; [x, z] = q; const y = heightAt(x, z), m = { x, z, y, r: 0.06, pole: false }; mounts.push(m); postCount++;
      put('found', x, y, z, 0, 1, 0.55, 0.62, 0.55); put('box', x, y + 0.36, z, 0, 1, 0.3, 0.42, 0.3);
      pipe([x, y + 0.5, z], [x, y + POST_H, z], 0.057); put('box', x, y + POST_H, z, 0, 1, 0.13, 0.03, 0.13);
      if (ctx.addPoly) ctx.addPoly([x - 0.18, z - 0.18, x + 0.18, z - 0.18, x + 0.18, z + 0.18, x - 0.18, z + 0.18], y, y + POST_H);
      return m;
    };
    const geo = it.approaches.map(ap => {
      const F = frame(ap), e = edges[ap.ei];
      let farA = 0, right = e.w / 2, left = -e.w / 2;
      for (const n of it.nodes) {
        const [a, l] = toF(F, NX[n * 2], NX[n * 2 + 1]); if (Math.abs(l) > 30 || a < -2) continue;
        farA = Math.max(farA, a + crossHalf(n, F.dx, F.dz));
        for (const fi of nodeEdges[n]) {
          const f = edges[fi]; if (fi === ap.ei || internal(f, n) || (f.ow && f.a !== n)) continue;
          const [ux, uz] = arrivalDir(f, n); if (-(ux * F.dx + uz * F.dz) < 0.7 || Math.abs(l) > 25 || a < 0) continue;
          right = Math.max(right, l + f.w / 2); left = Math.min(left, l - f.w / 2);
        }
      }
      if (farA < ap.setback + 2) farA = ap.setback + 4;
      return { ap, F, e, farA, right, left };
    });
    // pass 1: far-right combination standard + mast arm + arm heads + side head + street-name sign
    for (const g of geo) {
      const { ap, F, e, farA, right } = g;
      const S = { ap, balls: [], arrows: [], key: -1 }; T.aps.push(APS.length); APS.push(S); approaches.push(ap);
      let [px, pz] = settle(F, farA + 1.7, right + 1.3, 0.8) || fromF(F, farA + 1.7, right + 1.3);
      let m = findMount(px, pz, 3.6);
      if (!m || !m.pole) {
        const y = heightAt(px, pz); m = { x: px, z: pz, y, r: 0.16, pole: true }; mounts.push(m); poleCount++;
        put('std', px, y, pz, -F.dx, -F.dz); put('found', px, y, pz, 0, 1); put('lumLens', px, y, pz, -F.dx, -F.dz);
        const [lx, lz] = fromF(F, farA + 1.7, right + 1.3 - LUM_L - 0.28); put('lumGlow', lx, heightAt(lx, lz) + 0.22, lz, 0, 1);
        if (ctx.addPoly) ctx.addPoly([px - 0.25, pz - 0.25, px + 0.25, pz - 0.25, px + 0.25, pz + 0.25, px - 0.25, pz + 0.25], y, y + POLE_H);
      }
      px = m.x; pz = m.z; const y0 = m.y; const [pa, pl] = toF(F, px, pz);
      const heads = []; for (let i = 0; i < ap.lanes; i++) heads.push({ lat: laneOffset(e, i), n: ap.leftArrow && i === 0 ? 4 : 3 });
      const minLat = Math.min(...heads.map(h => h.lat)), maxLat = Math.max(...heads.map(h => h.lat));
      let tip = minLat - BPM - HWID / 2 - 0.45, sign = null;
      if (ap.crossName) { // street-name sign between the pole and the first head if it fits, else past the last head
        const cell = signCell(signName(ap.crossName)), W = cell.w, g0 = maxLat + 0.5, g1 = pl - 0.4; let c;
        if (g1 - g0 >= W + 0.1) c = (g0 + g1) / 2; else { c = minLat - 0.5 - W / 2; tip = c - W / 2 - 0.35; }
        sign = { lat: c, W, cell };
      }
      // R3-4 NO U-TURN hung past the left-turn head on some arterial arms (as on Espola Rd)
      let noU = null;
      if (ap.leftArrow && ap.cls <= 2 && (ap.id * 2654435761 >>> 0) % 3 === 0) { noU = (sign && sign.lat < minLat ? tip + 0.1 : minLat - BPM - HWID / 2 - 0.35) - NOU / 2; tip = Math.min(tip, noU - NOU / 2 - 0.3); }
      const L = Math.max(4.6, pl - tip), fx = -F.dx, fz = -F.dz, P0 = [px, y0, pz];
      put('arm', px, y0 + ARM_Y, pz, fx, fz, L, 1, 1);
      put('box', ...loc(P0, fx, fz, -0.16, ARM_Y, 0), fx, fz, 0.07, 0.6, 0.48); // arm flange plate
      put('box', ...loc(P0, fx, fz, -1.6, ARM_Y + 0.17, 0.03), fx, fz, 0.1, 0.1, 0.2, [0.2, 0.2, 0.21]); // EVP (preemption) detector
      const lay = { pole: [px, y0, pz], armLen: L, heads: [], side: [], sign: null };
      for (const h of heads) {
        const hb = ARM_Y - HANG - h.n * SEC, [hx, hz] = fromF(F, pa, h.lat), P = [hx, y0 + hb, hz];
        addHead(h.n, P, fx, fz, S); pipe([hx, y0 + hb + h.n * SEC, hz], [hx, y0 + ARM_Y, hz], 0.032);
        put('box', hx, y0 + ARM_Y, hz, fx, fz, 0.1, 0.25, 0.25); // arm clamp
        if (h.n === 4) { // R10-12 LEFT TURN YIELD ON (FYA) beside the left-turn head
          const [rx, rz] = fromF(F, pa, h.lat + 0.85), ry = y0 + ARM_Y - 0.24 - REG_H / 2;
          put('reg', rx, ry, rz, fx, fz); put('box', ...loc([rx, ry, rz], fx, fz, 0, 0, -0.012), fx, fz, REG_W + 0.01, REG_H + 0.01, 0.02, [0.5, 0.51, 0.52]);
          pipe([rx, ry + REG_H / 2, rz], [rx, y0 + ARM_Y, rz], 0.025); put('box', rx, y0 + ARM_Y, rz, fx, fz, 0.08, 0.22, 0.22);
        }
        lay.heads.push({ x: hx, y: y0 + hb, z: hz, lat: h.lat, sections: h.n });
      }
      if (noU != null) {
        const [ux, uz] = fromF(F, pa, noU), uy = y0 + ARM_Y - 0.24 - NOU / 2;
        put('noU', ux, uy, uz, fx, fz); put('box', ...loc([ux, uy, uz], fx, fz, 0, 0, -0.012), fx, fz, NOU + 0.01, NOU + 0.01, 0.02, [0.5, 0.51, 0.52]);
        pipe([ux, uy + NOU / 2, uz], [ux, y0 + ARM_Y, uz], 0.025); put('box', ux, y0 + ARM_Y, uz, fx, fz, 0.08, 0.22, 0.22);
      }
      if (sign) {
        const [sx, sz] = fromF(F, pa, sign.lat), sy = y0 + ARM_Y - 0.24 - SIGN_H / 2;
        put('box', sx, sy, sz, fx, fz, sign.W + 0.07, SIGN_H + 0.07, 0.15, [0.22, 0.22, 0.22]);
        for (const s of [-1, 1]) { const q = loc([sx, sy, sz], fx, fz, s * sign.W * 0.32, 0, 0); pipe([q[0], sy + SIGN_H / 2, q[2]], [q[0], y0 + ARM_Y, q[2]], 0.03); }
        signs.push({ x: sx, y: sy, z: sz, fx, fz, ...sign }); lay.sign = { x: sx, y: sy, z: sz, text: sign.cell.text };
      }
      sideHead(3, P0, fx, fz, -0.56, S); lay.side.push('far-right pole'); // SV-1-T side mount, road side of the pole
      layout.set(ap.id, lay); g.S = S; g.lay = lay;
    }
    // pass 2: far-left head (the left-turn arrow head when the approach has one): on a corner pole, or a median/corner Type 1-A post
    for (const g of geo) {
      const { ap, F, farA, left, S, lay } = g, fx = -F.dx, fz = -F.dz, n = ap.leftArrow ? 4 : 3; let gap = 1e9, opp = null;
      if (ap.oneway) for (const o of it.approaches) {
        if (o === ap || o.dx * F.dx + o.dz * F.dz > -0.7) continue; const [, l] = toF(F, o.stopX, o.stopZ);
        if (l < 0 && l > -40) { const gg = left - (l + o.width / 2); if (gg < gap) { gap = gg; opp = o; } }
      }
      if (opp && gap >= 1.3) { // divided road: Type 1-A post on the far median nose
        const [x, z] = fromF(F, farA + 3.4, left - Math.min(gap / 2, 1.2)), m = findMount(x, z, 1.0) || addPost(x, z, Math.min(0.6, gap / 2 - 0.15), 1);
        if (!m || m.head) continue; if (m.pole) sideHead(n, [m.x, m.y, m.z], fx, fz, 0.56, S); else postHead(n, m, fx, fz, S); lay.side.push('far-left median');
      } else { // far-left corner (past the opposing carriageway when the median is too narrow for a post)
        const fl = opp ? Math.min(left, toF(F, opp.stopX, opp.stopZ)[1] - opp.width / 2) : left;
        const q = settle(F, farA + 1.7, fl - 1.3, 0.6, -1), [x, z] = q || fromF(F, farA + 1.7, fl - 1.3), m = findMount(x, z, 3.5);
        if (m && m.pole) { sideHead(n, [m.x, m.y, m.z], fx, fz, 0.56, S); lay.side.push('far-left pole'); }
        else { const mm = m || (q && addPost(x, z)); if (!mm || mm.head) continue; postHead(n, mm, fx, fz, S); lay.side.push('far-left post'); }
      }
    }
    // pass 3: limit lines + crosswalks on every leg (approach legs, paired departing carriageways, departure-only legs)
    const usedDep = new Set();
    const legs = geo.map(({ ap, F, e }) => {
      const spans = [[-e.w / 2, e.w / 2]], sb0 = ap.oneway ? -e.w / 2 + 0.3 : 0.3, sb1 = e.w / 2 - 0.3, own = new Set([ap.ei]);
      if (ap.oneway) { // pair with the departing carriageway on the left (divided road)
        let best = null, bl = -1e9;
        for (const n of it.nodes) for (const fi of nodeEdges[n]) {
          const f = edges[fi]; if (!f.ow || f.a !== n || internal(f, n) || usedDep.has(fi)) continue;
          const [ux, uz] = arrivalDir(f, n); if (ux * F.dx + uz * F.dz < 0.7) continue;
          const [a, l] = toF(F, NX[n * 2], NX[n * 2 + 1]); if (l >= 0 || l < -45 || Math.abs(a - ap.setback) > 25) continue;
          if (l > bl) { bl = l; best = { fi, l, w: f.w }; }
        }
        if (best) { usedDep.add(best.fi); own.add(best.fi); spans.push([best.l - best.w / 2, best.l + best.w / 2]); }
      }
      if (sb1 > sb0 && depthAt(F, -0.15, (sb0 + sb1) / 2, own) >= -1) strip(...fromF(F, -0.15, sb0), ...fromF(F, -0.15, sb1), 0.3); // limit line (12", Caltrans A24E)
      return { F, spans, setback: ap.setback, cls: ap.cls, node: ap.node, ap, own };
    });
    for (const n of it.nodes) for (const fi of nodeEdges[n]) { // departure-only one-way legs
      const f = edges[fi]; if (!f.ow || f.a !== n || internal(f, n) || usedDep.has(fi)) continue; usedDep.add(fi);
      const [dx, dz] = arrivalDir(f, n), sb = Math.min(16, Math.max(4, crossHalf(n, dx, dz) + 2.5));
      legs.push({ F: { ox: NX[n * 2] - dx * sb, oz: NX[n * 2 + 1] - dz * sb, dx, dz, rx: -dz, rz: dx }, spans: [[-f.w / 2, f.w / 2]], setback: sb, cls: f.t, node: n, ap: null, own: new Set([fi]) });
    }
    for (const L of legs) {
      const { F, spans } = L, avail = L.setback - crossHalf(L.node, F.dx, F.dz);
      const cw = Math.min(3.05, Math.max(1.83, avail - 0.55)), gap = Math.min(1.2, Math.max(0.3, avail - cw - 0.25)), a0 = gap, a1 = gap + cw;
      const dd = spans.map(([l0, l1]) => [depthAt(F, (a0 + a1) / 2, (l0 + l1) / 2, L.own), clear.ei, fromF(F, (a0 + a1) / 2, (l0 + l1) / 2)]), depth = Math.min(...dd.map(v => v[0]));
      if (ctx.debug) ctx.debug.push({ it: it.id, depth, dd, own: [...L.own], ap: L.ap && L.ap.id });
      if (depth < -1) continue; // leg runs inside the junction (odd OSM geometry)
      const sz = school(...fromF(F, (a0 + a1) / 2, 0)), xc = sz ? XW_SCHOOL : undefined; // California: school crosswalks are yellow
      for (const [l0, l1] of spans) {
        for (const a of [a0 + 0.15, a1 - 0.15]) strip(...fromF(F, a, l0 + 0.15), ...fromF(F, a, l1 - 0.15), 0.3, xc);
        if (L.cls <= 2 || sz) for (let l = l0 + 0.9; l < l1 - 0.6; l += 1.25) strip(...fromF(F, a0 + 0.3, l), ...fromF(F, a1 - 0.3, l), 0.6, xc); // continental bars
      }
      const lo = Math.min(...spans.map(s => s[0])), hi = Math.max(...spans.map(s => s[1])), ac = (a0 + a1) / 2, [cx, cz] = fromF(F, ac, (lo + hi) / 2);
      // controlling approach: 'parallel' = the perpendicular approach that has this crosswalk on its right, nearest
      let ctrl = null;
      if (walkMode === 'across') ctrl = L.ap;
      else { let bd = 1e9; for (const o of it.approaches) { if (Math.abs(o.dx * F.dx + o.dz * F.dz) > 0.5) continue; const l = (cx - o.stopX) * -o.dz + (cz - o.stopZ) * o.dx, d = l > 0 ? l : 100 - l; if (d < bd) { bd = d; ctrl = o; } } }
      const X = { ctrl: ctrl ? approaches.indexOf(ctrl) : -1, glyphs: [], key: -1, prev: 'dont', fStart: 0, fDur: 10 };
      for (const [lat, sgn] of [[hi + 1.1, -1], [lo - 1.1, 1]]) { // ped head at each end, facing across to the other end
        const [ex, ez] = fromF(F, ac, lat), fx = F.rx * sgn, fz = F.rz * sgn;
        let m = findMount(ex, ez, 3.2);
        if (!m) { const [qx, qz] = fromF(F, a1 + 0.7, lat); m = addPost(qx, qz); if (!m) continue; }
        const off = m.r + 0.13, P = [m.x + fx * off, m.y + PED_Y, m.z + fz * off];
        put('ped', P[0], P[1], P[2], fx, fz);
        X.glyphs.push(glyph(loc(P, fx, fz, -0.115, 0.22, 0.106), fx, fz, 0.2, 0.27), glyph(loc(P, fx, fz, 0.06, 0.22, 0.106), fx, fz, 0.088, 0.16), glyph(loc(P, fx, fz, 0.158, 0.22, 0.106), fx, fz, 0.088, 0.16));
        put('pb', m.x - fx * (m.r + 0.01), m.y + PB_Y, m.z - fz * (m.r + 0.01), -fx, -fz); // APS push button facing the waiting pedestrian
      }
      T.xws.push(XW.length); XW.push(X);
    }
    { // controller cabinet (Caltrans 332L) + service pedestal on a pad at the back of the walk, behind the first corner pole
      let spot = null;
      for (const m of mounts) {
        if (!m.pole) continue; let vx = m.x - it.cx, vz = m.z - it.cz; const l = Math.hypot(vx, vz) || 1; vx /= l; vz /= l;
        const q = settleXZ(m.x + vx * 2.7, m.z + vz * 2.7, 1.5, 3); if (q) { spot = [q[0], q[1], vx, vz]; break; }
      }
      if (spot) {
        const [x, z, vx, vz] = spot, Q = [x, heightAt(x, z), z], fx = -vx, fz = -vz, c = (lx, ly, lz) => loc(Q, fx, fz, lx, ly, lz);
        put('box', ...c(0.1, 0.06, 0.15), fx, fz, 1.75, 0.2, 1.3, CONC);
        put('box', ...c(-0.2, 1.01, 0), fx, fz, 0.95, 1.7, 0.72, CAB); put('box', ...c(-0.2, 1.88, -0.01), fx, fz, 1.02, 0.05, 0.8, CAB);
        put('box', ...c(-0.2, 1.0, 0.362), fx, fz, 0.012, 1.55, 0.01, [0.3, 0.3, 0.3]); put('box', ...c(-0.08, 1.05, 0.37), fx, fz, 0.03, 0.16, 0.03, [0.2, 0.2, 0.2]); // door seam, handle
        put('box', ...c(0.62, 0.76, -0.05), fx, fz, 0.45, 1.2, 0.32, CAB); put('box', ...c(0.62, 1.1, 0.12), fx, fz, 0.2, 0.2, 0.04, [0.82, 0.84, 0.86]); // service pedestal + meter window
        if (ctx.addPoly) ctx.addPoly([c(-0.7, 0, -0.4), c(0.88, 0, -0.4), c(0.88, 0, 0.4), c(-0.7, 0, 0.4)].flatMap(q => [q[0], q[2]]), Q[1], Q[1] + 1.9);
      }
    }
  }
  for (const k of PARTS) I[k].o.push(I[k].m.length / 16);

  function addHead(n, P, fx, fz, S) {
    put(n === 3 ? 'h3' : 'h4', P[0], P[1], P[2], fx, fz); const H = n * SEC, k3 = n === 3 ? 'ball' : 'arrow';
    for (let k = 0; k < n; k++) {
      const q = loc(P, fx, fz, 0, H - SEC * (k + 0.5), n === 3 ? LENS_Z : LENS_Z + 0.004), i = put(k3, q[0], q[1], q[2], fx, fz, 1, 1, 1, [0, 0, 0]), gi = put('glow', q[0], q[1], q[2], fx, fz, 1, 1, 1, [0, 0, 0]);
      if (!k) (n === 3 ? S.balls : S.arrows).push([i, gi]);
    }
  }
  function sideHead(n, P0, fx, fz, lx, S) { // bracket-mounted on a pole at P0, head offset lx to the side
    const P = loc(P0, fx, fz, lx, SIDE_Y, 0.02); addHead(n, P, fx, fz, S); const H = n * SEC, s = Math.sign(lx);
    for (const y of [0.22, H - 0.22]) pipe(loc(P, fx, fz, -s * HWID / 2, y, -0.04), loc(P0, fx, fz, 0, SIDE_Y + y, -0.02), 0.03);
  }
  function postHead(n, m, fx, fz, S) { m.head = true; const P = [m.x, m.y + POST_H + 0.16, m.z]; addHead(n, P, fx, fz, S); pipe([m.x, m.y + POST_H, m.z], [m.x, P[1] + 0.02, m.z], 0.055); }
  function glyph(q, fx, fz, w, h) { const i = put('glyph', q[0], q[1], q[2], fx, fz, w, h, 1, [0, 0, 0]); I.glyph.x.push(12); return i; }

  // ---------------------------------------------------------------- street-name sign atlas (white on green, rounded, lit at night)
  function signCell(text) {
    let c = signCells.get(text); if (c) return c;
    const g = canvas(8, 8).getContext('2d'); g.font = `600 64px ${FONT}`; const tw = g.measureText(text).width / 112 * SIGN_H + 0.5;
    c = { text, w: SIGN_WS.find(x => x >= tw) || SIGN_WS[SIGN_WS.length - 1] }; signCells.set(text, c); return c;
  }
  const SPX = 112 / SIGN_H, AW = 4096; let ax = 0, ay = 0;
  for (const c of signCells.values()) { const pw = Math.round(c.w * SPX); if (ax + pw > AW) { ax = 0; ay += 112; } c.rect = [ax, ay, pw, 112]; ax += pw; }
  const AH = Math.max(112, ay + 112), signCanvas = canvas(AW, AH);
  const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = ctx.anisotropy || 8;
  function drawSigns() {
    const g = signCanvas.getContext('2d'); g.clearRect(0, 0, AW, AH);
    for (const c of signCells.values()) {
      const [x, y, w, h] = c.rect; g.fillStyle = '#0c6b3d'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#f4f6f2'; g.lineWidth = 4; g.beginPath(); g.roundRect(x + 6, y + 6, w - 12, h - 12, 10); g.stroke();
      g.fillStyle = '#f7f9f6'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 64px ${FONT}`;
      g.fillText(c.text, x + w / 2, y + h / 2 + 3, w - 34);
    }
    signTex.needsUpdate = true;
  }
  drawSigns();
  if (typeof document !== 'undefined' && document.fonts && !document.fonts.check(`600 64px ${FONT}`)) Promise.all([document.fonts.load(`600 64px ${FONT}`), document.fonts.load(`700 50px ${FONT}`)]).then(() => { drawSigns(); drawReg(); }, () => { });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0, roughness: 0.55 });

  // ---------------------------------------------------------------- build meshes
  const group = new THREE.Group(); group.name = 'signals'; const meshes = {}, P = {};
  const MAT = { std: galv, arm: galv, pipe: galv, box: galv, found: concrete, h3: headMat, h4: headMat, ped: headMat, pb: headMat, reg: regMat, noU: nouMat, lumLens: lumLensMat, lumGlow: lumGlowMat, ball: lensMat, arrow: lensMat, glow: glowMat, glyph: glyphMat };
  const COLORED = new Set(['box', 'pipe', ...LIVE]), SHADOW = new Set(['std', 'arm', 'h3', 'h4', 'ped', 'box', 'pipe']); // noU/reg are thin panels: no shadow pass
  for (const k of PARTS) {
    const L = I[k], n = L.m.length / 16; if (!n) continue;
    const geo = k === 'glyph' ? G.glyph.clone() : G[k], im = new THREE.InstancedMesh(geo, MAT[k], n);
    const part = P[k] = { k, im, n, o: L.o, mm: Float32Array.from(L.m), mc: COLORED.has(k) ? Float32Array.from(L.c) : null, mx: k === 'glyph' ? Float32Array.from(L.x) : null };
    im.instanceMatrix.array.set(part.mm);
    if (part.mc) im.instanceColor = new THREE.InstancedBufferAttribute(Float32Array.from(part.mc), 3);
    if (part.mx) geo.setAttribute('aCell', part.cell = new THREE.InstancedBufferAttribute(Float32Array.from(part.mx), 1));
    im.castShadow = SHADOW.has(k); im.receiveShadow = !['lumGlow', 'lumLens', 'glow', 'ball', 'arrow', 'glyph'].includes(k);
    if (k === 'glow') { im.frustumCulled = false; im.renderOrder = 2; }
    im.name = 'sig-' + k; im.computeBoundingSphere(); group.add(im); meshes[k] = im;
    L.m = L.c = L.x = null;
  }
  if (signs.length) { // double-faced sign panels in one merged mesh
    const p = [], nm = [], uv = [], ix = [];
    for (const s of signs) {
      const [x0, y0, w, h] = s.cell.rect, u0 = x0 / AW, u1 = (x0 + w) / AW, v1 = 1 - y0 / AH, v0 = 1 - (y0 + h) / AH;
      for (const side of [1, -1]) {
        const b = p.length / 3, hw = s.W / 2, hh = SIGN_H / 2, z = 0.078 * side;
        for (const [lx, ly, u, v] of [[-hw, -hh, u0, v0], [hw, -hh, u1, v0], [hw, hh, u1, v1], [-hw, hh, u0, v1]]) { p.push(...loc([s.x, s.y, s.z], s.fx, s.fz, lx * side, ly, z)); nm.push(s.fx * side, 0, s.fz * side); uv.push(u, v); }
        ix.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, signMat); m.name = 'sig-signs'; m.receiveShadow = true; group.add(m); meshes.signs = m;
  }
  if (marks.p.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(marks.p, 3));
    const nrm = new Float32Array(marks.p.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(marks.c, 3)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, lineMat); m.name = 'sig-marks'; m.receiveShadow = true; group.add(m); meshes.marks = m;
  }

  // ---------------------------------------------------------------- distance culling: copy the visible intersections' instance ranges to the front
  let vis = IT.map((_, i) => i), visKey = '';
  function compact() {
    for (const part of Object.values(P)) {
      const { im, o, mm, mc, mx } = part, M = im.instanceMatrix.array, C = im.instanceColor && im.instanceColor.array; let n = 0;
      part.base = new Int32Array(IT.length).fill(-1);
      for (const k of vis) { const s = o[k], e = o[k + 1]; if (e <= s) continue; part.base[k] = n; M.set(mm.subarray(s * 16, e * 16), n * 16); if (C) C.set(mc.subarray(s * 3, e * 3), n * 3); if (mx) part.cell.array.set(mx.subarray(s, e), n); n += e - s; }
      im.count = n; im.visible = n > 0; im.instanceMatrix.needsUpdate = true; if (C) im.instanceColor.needsUpdate = true; if (mx) part.cell.needsUpdate = true;
      if (n) im.computeBoundingSphere();
    }
  }
  function sync(keys) { // master colours of visible intersections -> GPU buffers
    for (const k of keys) {
      const part = P[k]; if (!part) continue; const { im, o, mc, mx, base } = part, C = im.instanceColor.array;
      for (const i of vis) { const s = o[i], e = o[i + 1]; if (e <= s) continue; C.set(mc.subarray(s * 3, e * 3), base[i] * 3); if (mx) part.cell.array.set(mx.subarray(s, e), base[i]); }
      im.instanceColor.needsUpdate = true; if (mx) part.cell.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- update: recolour lenses only when an aspect changes
  let lastNight = -1, dimK = 1; const asp = new Array(APS.length);
  const setC = (arr, i, c, k = 1) => { arr[i * 3] = c[0] * k; arr[i * 3 + 1] = c[1] * k; arr[i * 3 + 2] = c[2] * k; };
  const OFF = { ball: 'off', arrow: null, walk: 'dont' }, Z = [0, 0, 0];
  function paint(S, a, blink) {
    const b = a.ball || 'off', on = b === 'fr' ? [blink, 0, 0] : b === 'fy' ? [0, blink, 0] : BALL_ON[b] || Z, BC = P.ball.mc, GC = P.glow.mc;
    for (const [i0, g0] of S.balls) for (let k = 0; k < 3; k++) { setC(BC, i0 + k, on[k] ? LIT[k] : DIM[k], on[k] ? 1 : dimK); setC(GC, g0 + k, on[k] ? GLOW[k] : Z); }
    if (!S.arrows.length) return;
    let ar = a.arrow; if (ar == null) ar = b === 'g' ? 'fy' : b;
    const ao = [ar === 'r' || (ar === 'fr' && blink), ar === 'y', ar === 'fy' && blink, ar === 'g'], AC = P.arrow.mc;
    for (const [i0, g0] of S.arrows) for (let k = 0; k < 4; k++) { const ci = k === 0 ? 0 : k === 3 ? 2 : 1; setC(AC, i0 + k, ao[k] ? LIT[ci] : DIM[ci], ao[k] ? 1 : dimK * 0.8); setC(GC, g0 + k, ao[k] ? GLOW[ci] : Z); }
  }
  function update(aspectFn, night = 0, t = performance.now() / 1000, eye) {
    const blink = (t % 1) < 0.5 ? 1 : 0; let force = false, dirty = false, gdirty = false;
    if (eye) {
      const R = api.drawDist, nv = []; for (let i = 0; i < IT.length; i++) { const it = IT[i].it, d = Math.hypot(it.cx - eye.x, it.cz - eye.z); if (d < R || (d < R + 60 && vis.includes(i))) nv.push(i); }
      const key = nv.join(','); if (key !== visKey) { visKey = key; vis = nv; compact(); force = true; }
    }
    if (Math.abs(night - lastNight) > 0.02) {
      lastNight = night; force = true; dimK = 1 - 0.75 * night;
      glowMat.uniforms.opacity.value = 0.85 * night; glowMat.uniforms.dayOp.value = DAY_GLOW * (1 - night); glowMat.uniforms.size.value = 1.35;
      lumLensMat.color.setRGB(0.47 + night * 1.25, 0.47 + night * 1.15, 0.47 + night * 0.9); lumGlowMat.opacity = 0.55 * night;
      signMat.emissiveIntensity = 1.1 * night;
    }
    for (const ii of vis) {
      const T = IT[ii];
      for (const i of T.aps) {
        const S = APS[i], a = (aspectFn && aspectFn(S.ap)) || OFF; asp[i] = a;
        const fl = a.ball === 'fr' || a.ball === 'fy' || (S.arrows.length && (a.arrow === 'fy' || (a.arrow == null && a.ball === 'g')));
        const key = `${a.ball}${a.arrow}${fl ? blink : ''}`;
        if (key !== S.key || force) { S.key = key; paint(S, a, blink); dirty = true; }
      }
      if (P.glyph) for (const xi of T.xws) {
        const X = XW[xi], a = X.ctrl >= 0 ? asp[X.ctrl] : OFF, w = a.walk || 'dont';
        if (w === 'flash' && X.prev !== 'flash') X.fStart = t; else if (w !== 'flash' && X.prev === 'flash') X.fDur = Math.min(40, Math.max(3, t - X.fStart));
        X.prev = w;
        const cd = w === 'flash' ? Math.max(0, Math.min(99, a.cd != null ? Math.ceil(a.cd) : Math.ceil(X.fDur - (t - X.fStart)))) : -1;
        const key = w === 'walk' ? 1 : w === 'flash' ? 2 + blink + cd * 2 : 0;
        if (key === X.key && !force) continue; X.key = key; gdirty = true;
        const GC = P.glyph.mc, GX = P.glyph.mx;
        for (let h = 0; h < X.glyphs.length; h += 3) {
          const s = X.glyphs[h]; GX[s] = w === 'walk' ? 1 : 0; setC(GC, s, w === 'walk' ? PERSON : w === 'dont' || blink ? HAND : GHOST);
          for (let k = 1; k <= 2; k++) { const gi = X.glyphs[h + k], dg = cd < 0 ? -1 : k === 1 ? (cd >= 10 ? Math.floor(cd / 10) : -1) : cd % 10; GX[gi] = dg < 0 ? 12 : 2 + dg; setC(GC, gi, dg < 0 ? GHOST : HAND); }
        }
      }
    }
    if (dirty) sync(['ball', 'arrow', 'glow']);
    if (gdirty) sync(['glyph']);
  }

  const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const stats = { intersections: inters.list.length, approaches: APS.length, poles: poleCount, posts: postCount, crosswalks: XW.length, signs: signs.length, signAtlas: [AW, AH], instances: {}, trisEach: {}, drawCalls: 0, shadowCalls: 0, triangles: 0 };
  for (const [k, m] of Object.entries(meshes)) {
    const n = m.isInstancedMesh ? m.count : 1; stats.instances[k] = n; stats.trisEach[k] = tris(m.geometry); stats.drawCalls++; if (m.castShadow) stats.shadowCalls++; stats.triangles += tris(m.geometry) * n;
  }
  compact();
  const api = { group, update, approaches, layout, stats, meshes, drawDist: ctx.drawDist || 1100, visible: () => vis.length, clear };
  return api;
}

// Simple fixed-time controller (for the showroom, or as a stand-in until the real one is wired): per intersection it
// serves each axis in turn: protected dual lefts (if any approach on the axis has an arrow), then through green with
// flashing-yellow-arrow permissive lefts and the parallel ped phase (walk, then flashing hand with countdown), yellow,
// all-red. Returns (t) => aspectFn.
export function demoController(inters, o = {}) {
  const T = Object.assign({ prot: 7, protY: 3, green: 17, yellow: 3.6, red: 1.6, walk: 7, flash: 9 }, o), plans = new Map();
  for (const it of inters.list) {
    const segs = []; let c = 0;
    for (let ax = 0; ax < it.axes; ax++) { const left = it.approaches.some(a => a.axis === ax && a.leftArrow); segs.push({ ax, t0: c, left }); c += (left ? T.prot + T.protY : 0) + T.green + T.yellow + T.red; }
    plans.set(it.id, { segs, cycle: c, off: (it.id * 37.7) % c });
  }
  return t => ap => {
    const P = plans.get(ap.inter.id), tc = (t + P.off) % P.cycle; let seg = P.segs[0];
    for (const s of P.segs) if (tc >= s.t0) seg = s;
    if (seg.ax !== ap.axis) return { ball: 'r', arrow: 'r', walk: 'dont' };
    let u = tc - seg.t0;
    if (seg.left) { if (u < T.prot) return { ball: 'r', arrow: ap.leftArrow ? 'g' : 'r', walk: 'dont' }; if (u < T.prot + T.protY) return { ball: 'r', arrow: ap.leftArrow ? 'y' : 'r', walk: 'dont' }; u -= T.prot + T.protY; }
    if (u < T.green) { const walk = u < T.walk ? 'walk' : u < T.walk + T.flash ? 'flash' : 'dont'; return { ball: 'g', arrow: 'fy', walk, cd: walk === 'flash' ? T.walk + T.flash - u : undefined }; }
    if (u < T.green + T.yellow) return { ball: 'y', arrow: 'y', walk: 'dont' };
    return { ball: 'r', arrow: 'r', walk: 'dont' };
  };
}
