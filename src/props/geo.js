// Geometry builder for the prop kit: primitives placed in prop space, grouped by material, merged into one
// BufferGeometry per material (BufferGeometryUtils.mergeGeometries). Cheap "bevel" via RoundedBoxGeometry.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function createGeo(THREE) {
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const _c = new THREE.Color();

  // keep only position/normal/uv (+color) so every piece of a group merges
  function normalize(g, wantColor) {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (wantColor && !g.attributes.color) {
      const n = g.attributes.position.count, a = new Float32Array(n * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    if (!wantColor && g.attributes.color) g.deleteAttribute('color');
    g.morphAttributes = {};
    return g;
  }

  function merge(list) {
    if (list.length === 1) return list[0];
    const wantColor = list.some(g => g.attributes.color);
    list.forEach(g => normalize(g, wantColor));
    const mixed = list.some(g => !g.index) && list.some(g => g.index);
    const arr = mixed ? list.map(g => (g.index ? g.toNonIndexed() : g)) : list;
    const out = mergeGeometries(arr, false);
    if (!out) throw new Error('prop kit: mergeGeometries failed');
    return out;
  }

  class Builder {
    constructor() { this.groups = new Map(); }
    // o: { rx, ry, rz, s: number|[sx,sy,sz], color: hex|Color (vertex colour), uv: [su, sv] }
    push(mat, g, x = 0, y = 0, z = 0, o = {}) {
      if (o.uv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * o.uv[0] + (o.uvo ? o.uvo[0] : 0), uv.getY(i) * o.uv[1] + (o.uvo ? o.uvo[1] : 0)); }
      _e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ'); _q.setFromEuler(_e);
      const s = o.s ?? 1; if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.set(s, s, s);
      _m.compose(_p.set(x, y, z), _q, _s); g.applyMatrix4(_m);
      if (o.pre) g.applyMatrix4(o.pre);
      if (o.color !== undefined) {
        _c.set(o.color); const n = g.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      }
      let l = this.groups.get(mat); if (!l) this.groups.set(mat, l = []);
      l.push(g); return g;
    }
    box(mat, w, h, d, x, y, z, o) { return this.push(mat, new THREE.BoxGeometry(w, h, d), x, y, z, o); }
    // box whose bottom sits at y (handy for furniture)
    boxB(mat, w, h, d, x, y, z, o) { return this.box(mat, w, h, d, x, y + h / 2, z, o); }
    rbox(mat, w, h, d, r, x, y, z, o = {}) {
      r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
      return this.push(mat, new RoundedBoxGeometry(w, h, d, o.seg ?? 1, Math.max(r, 1e-4)), x, y, z, o);
    }
    cyl(mat, rt, rb, h, x, y, z, o = {}) {
      return this.push(mat, new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 12, o.hseg ?? 1, !!o.open, o.ts ?? 0, o.tl ?? Math.PI * 2), x, y, z, o);
    }
    // cylinder between two points (tubes, legs, pipes)
    rod(mat, r, a, b, o = {}) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
      const g = new THREE.CylinderGeometry(o.r2 ?? r, r, len, o.seg ?? 8, 1, !!o.open);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      g.applyQuaternion(q); const mid = A.add(B).multiplyScalar(0.5);
      return this.push(mat, g, mid.x, mid.y, mid.z, { color: o.color });
    }
    sphere(mat, r, x, y, z, o = {}) {
      return this.push(mat, new THREE.SphereGeometry(r, o.ws ?? 12, o.hs ?? 8, o.ps ?? 0, o.pl ?? Math.PI * 2, o.ts ?? 0, o.tl ?? Math.PI), x, y, z, o);
    }
    // pts: [[r, y], ...] revolved about Y
    lathe(mat, pts, x, y, z, o = {}) {
      return this.push(mat, new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(p[0], 0), p[1])), o.seg ?? 16, o.ps ?? 0, o.pl ?? Math.PI * 2), x, y, z, o);
    }
    torus(mat, R, r, x, y, z, o = {}) {
      return this.push(mat, new THREE.TorusGeometry(R, r, o.rs ?? 6, o.ts ?? 16, o.arc ?? Math.PI * 2), x, y, z, o);
    }
    plane(mat, w, h, x, y, z, o = {}) { return this.push(mat, new THREE.PlaneGeometry(w, h, o.ws ?? 1, o.hs ?? 1), x, y, z, o); }
    circle(mat, r, x, y, z, o = {}) { return this.push(mat, new THREE.CircleGeometry(r, o.seg ?? 16), x, y, z, o); }
    tube(mat, pts, r, o = {}) {
      const curve = Array.isArray(pts) ? new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), !!o.closed, 'catmullrom', o.tension ?? 0.5) : pts;
      return this.push(mat, new THREE.TubeGeometry(curve, o.seg ?? 16, r, o.radial ?? 6, !!o.closed), 0, 0, 0, o);
    }
    extrude(mat, shape, depth, x, y, z, o = {}) {
      return this.push(mat, new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!o.bevel, bevelSize: o.bevel || 0, bevelThickness: o.bevel || 0, bevelSegments: 1, curveSegments: o.cs ?? 10 }), x, y, z, o);
    }
    // quad with explicit uv rectangle [u0, v0, u1, v1]
    quad(mat, w, h, x, y, z, uvr, o = {}) {
      const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uvr[0] + uv.getX(i) * (uvr[2] - uvr[0]), uvr[1] + uv.getY(i) * (uvr[3] - uvr[1]));
      return this.push(mat, g, x, y, z, o);
    }
    geo(mat, g, x, y, z, o) { return this.push(mat, g, x, y, z, o); }
    build() {
      const out = [];
      for (const [mat, list] of this.groups) {
        const g = merge(list); g.computeBoundingSphere(); g.computeBoundingBox(); out.push({ geo: g, mat });
      }
      this.groups.clear();
      return out;
    }
  }

  // bake a whole Object3D (meshes only, visible ones) into [{geo, mat}] in the root's space, merged per material
  function bake(root) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const byMat = new Map();
    root.traverseVisible(o => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.noBake) return;
      if (Array.isArray(o.material)) return;
      const g = o.geometry.clone(); g.applyMatrix4(_m.multiplyMatrices(inv, o.matrixWorld));
      let l = byMat.get(o.material); if (!l) byMat.set(o.material, l = []); l.push(g);
    });
    const out = [];
    for (const [mat, list] of byMat) { const g = merge(list); g.computeBoundingSphere(); out.push({ geo: g, mat }); }
    return out;
  }

  function tris(obj) {
    let n = 0;
    obj.traverse(o => { if (o.isMesh) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
    return Math.round(n);
  }

  return { Builder, merge, bake, tris, normalize };
}
