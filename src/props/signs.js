// Flat signs with text drawn on a CanvasTexture (cached by key): street/school/room signs, wall plaques.
//   makeSign({ text, lines?, w, h, bg, fg, border?, shape?: 'rect'|'octagon'|'pentagon'|'diamond'|'circle',
//              post?: bool, wall?: bool, emissive?: bool, height?, y?, font?, sub?, back?, draw?(g, W, H) }) -> THREE.Group
//   roomNumber(text, { sub?, bg?, fg?, y? }) -> THREE.Group   (ADA room ID plaque with braille, wall-mounted)
// Origin on the floor/ground, sign face toward +Z. wall: back of the plate at z = 0, centre at `y` (default 1.6).
// post: galvanised pipe at the origin, sign bottom at `height` (default 2.1 m). Otherwise the plate stands on z = 0
// with its bottom edge at y = 0 (caller positions it).
import * as THREE_ from 'three';
import { FONTS, rrect, fit } from './tex.js';

export function signFactory(THREE, { anisotropy = 4, envMap = null } = {}) {
  const texCache = new Map(), matCache = new Map(), geoCache = new Map();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.45, envMap, envMapIntensity: 0.5 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0xa4a9ad, metalness: 0.6, roughness: 0.5, envMap, envMapIntensity: 0.5 });

  function outline(shape, w, h) {
    const s = new THREE.Shape();
    if (shape === 'octagon') {
      const R = (w / 2) / Math.cos(Math.PI / 8);
      for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; i ? s.lineTo(Math.cos(a) * R, Math.sin(a) * R) : s.moveTo(Math.cos(a) * R, Math.sin(a) * R); }
    } else if (shape === 'pentagon') {
      s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h * 0.1); s.lineTo(0, h / 2); s.lineTo(-w / 2, h * 0.1);
    } else if (shape === 'diamond') {
      s.moveTo(0, h / 2); s.lineTo(-w / 2, 0); s.lineTo(0, -h / 2); s.lineTo(w / 2, 0);
    } else if (shape === 'circle') {
      s.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
    } else {
      const r = Math.min(w, h) * 0.06, x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
      s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    }
    s.closePath();
    return s;
  }
  function pathOn(g, shape, W, H, inset = 0) { // same outline in canvas pixels
    const sx = W / 2, sy = H / 2;
    g.beginPath();
    if (shape === 'octagon') {
      const R = (W / 2 - inset) / Math.cos(Math.PI / 8);
      for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(sx + Math.cos(a) * R, sy - Math.sin(a) * R); }
    } else if (shape === 'pentagon') {
      g.moveTo(inset, H - inset); g.lineTo(W - inset, H - inset); g.lineTo(W - inset, H * 0.4); g.lineTo(sx, inset * 1.4); g.lineTo(inset, H * 0.4);
    } else if (shape === 'diamond') {
      const k = inset * 1.42; g.moveTo(sx, k); g.lineTo(W - k, sy); g.lineTo(sx, H - k); g.lineTo(k, sy);
    } else if (shape === 'circle') {
      g.ellipse(sx, sy, W / 2 - inset, H / 2 - inset, 0, 0, Math.PI * 2);
    } else { rrect(g, inset, inset, W - inset * 2, H - inset * 2, Math.min(W, H) * 0.06); return; }
    g.closePath();
  }

  function texture(o) {
    const key = JSON.stringify([o.key, o.text, o.lines, o.w, o.h, o.bg, o.fg, o.border, o.shape, o.font, o.sub, o.kind]);
    let t = texCache.get(key); if (t) return t;
    const scale = 512 / Math.max(o.w, o.h), W = Math.max(32, Math.round(o.w * scale)), H = Math.max(32, Math.round(o.h * scale));
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    if (o.draw) o.draw(g, W, H);
    else {
      pathOn(g, o.shape, W, H, 0); g.fillStyle = o.bg; g.fill();
      if (o.border) { g.lineWidth = Math.min(W, H) * 0.035; g.strokeStyle = o.border; pathOn(g, o.shape, W, H, Math.min(W, H) * 0.045); g.stroke(); }
      const lines = o.lines || String(o.text ?? '').split('\n');
      const inner = o.shape === 'diamond' ? 0.6 : o.shape === 'octagon' ? 0.84 : o.shape === 'circle' ? 0.7 : 0.86;
      const n = lines.length + (o.sub ? 0.6 : 0);
      const lh = Math.min(H * (o.shape === 'diamond' ? 0.5 : 0.78) / n, H * 0.62);
      let y = H / 2 - (n * lh) / 2 + lh / 2 + (o.shape === 'pentagon' ? H * 0.1 : 0);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = o.fg;
      for (const l of lines) { fit(g, l, W * inner, lh * 0.82, o.font || FONTS.SANS, 'bold'); g.fillText(l, W / 2, y + lh * 0.04); y += lh; }
      if (o.sub) { fit(g, o.sub, W * inner, lh * 0.42, o.font || FONTS.SANS, 'bold'); g.fillText(o.sub, W / 2, y - lh * 0.15); }
    }
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy;
    texCache.set(key, t); return t;
  }

  function faceGeometry(shape, w, h) {
    const key = `${shape}|${w}|${h}`; let gg = geoCache.get(key); if (gg) return gg;
    const s = outline(shape, w, h);
    const face = new THREE.ShapeGeometry(s, 12);
    const p = face.attributes.position, uv = face.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
    const t = Math.min(0.004, Math.min(w, h) * 0.03);
    const body = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 12 });
    face.translate(0, 0, t + 0.0006);
    gg = { face, body, t }; geoCache.set(key, gg); return gg;
  }

  function makeSign(o = {}) {
    const p = Object.assign({ w: 0.6, h: 0.45, bg: '#ffffff', fg: '#111111', shape: 'rect' }, o);
    if (p.shape === 'circle' && !o.h) p.h = p.w;
    const tex = texture(p);
    const mk = `${tex.uuid}|${!!p.emissive}`;
    let mat = matCache.get(mk);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: p.emissive ? 0.6 : 0.42, metalness: 0.0 });
      if (p.emissive) { mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = tex; mat.emissiveIntensity = 0.9; }
      matCache.set(mk, mat);
    }
    const { face, body } = faceGeometry(p.shape, p.w, p.h);
    const g = new THREE.Group(); g.name = 'sign'; g.userData.kind = 'sign'; g.userData.text = p.text;
    const plate = new THREE.Group();
    plate.add(new THREE.Mesh(body, bodyMat), new THREE.Mesh(face, mat));
    if (p.post) {
      const H = p.height ?? 2.1, top = H + p.h;
      const pole = new THREE.Mesh(postGeo(top + 0.05), postMat); pole.position.set(0, (top + 0.05) / 2, -0.035); g.add(pole);
      plate.position.set(0, H + p.h / 2, 0);
      if (p.back ?? (p.shape === 'rect')) { const b = plate.clone(); b.rotation.y = Math.PI; b.position.z = -0.07; g.add(b); } // street-name style: two-faced
    } else if (p.wall) plate.position.set(0, p.y ?? 1.6, 0);
    else plate.position.set(0, p.h / 2, 0);
    g.add(plate);
    g.traverse(m => { if (m.isMesh) { m.castShadow = !!p.post; m.receiveShadow = true; } });
    return g;
  }
  function postGeo(h) {
    const key = 'post|' + h.toFixed(2); let gg = geoCache.get(key);
    if (!gg) { gg = new THREE.CylinderGeometry(0.03, 0.03, h, 10); geoCache.set(key, gg); }
    return gg;
  }

  function roomNumber(text, o = {}) {
    const bg = o.bg || '#2b2f36', fg = o.fg || '#ffffff', sub = o.sub || '';
    return makeSign({
      w: 0.2, h: 0.2, wall: true, y: o.y ?? 1.52, text: String(text), sub, kind: 'room', bg, fg,
      draw: (g, W, H) => {
        g.fillStyle = bg; rrect(g, 0, 0, W, H, W * 0.06); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, W, H * 0.08);
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        fit(g, String(text), W * 0.84, H * 0.42, FONTS.SANS, 'bold'); g.fillText(String(text), W / 2, H * (sub ? 0.36 : 0.42));
        if (sub) { fit(g, sub.toUpperCase(), W * 0.84, H * 0.11, FONTS.SANS, 'bold'); g.fillText(sub.toUpperCase(), W / 2, H * 0.62); }
        const n = Math.min(6, String(text).length + 1), d = W * 0.018; // braille cells
        for (let c = 0; c < n; c++) for (let i = 0; i < 6; i++) {
          if (((c * 7 + i * 3 + String(text).charCodeAt(c % String(text).length)) % 5) < 2) continue;
          const px = W / 2 - n * d * 1.6 + c * d * 3.2 + (i % 2) * d * 1.2, py = H * 0.8 + Math.floor(i / 2) * d * 1.2;
          g.beginPath(); g.arc(px, py, d * 0.42, 0, Math.PI * 2); g.fill();
        }
      },
    });
  }

  function dispose() {
    for (const t of texCache.values()) t.dispose(); for (const m of matCache.values()) m.dispose();
    for (const g of geoCache.values()) { if (g.isBufferGeometry) g.dispose(); else { g.face.dispose(); g.body.dispose(); } }
    texCache.clear(); matCache.clear(); geoCache.clear(); bodyMat.dispose(); postMat.dispose();
  }
  return { makeSign, roomNumber, texture, dispose, setEnvMap(e) { bodyMat.envMap = postMat.envMap = e; bodyMat.needsUpdate = postMat.needsUpdate = true; } };
}

let _default = null;
const def = () => (_default ||= signFactory(THREE_));
export function makeSign(o) { return def().makeSign(o); }
export function roomNumber(text, o) { return def().roomNumber(text, o); }
