// Pitched roofs for houses, from any footprint. The footprint is turned to its main axis, rasterised at half a metre
// and covered by a few rectangles (the biggest first, each grown back over the others so wings overlap the main body);
// every rectangle gets a hip or gable roof with eaves, and where the roofs of a house's wings cross, their slopes
// intersect the way cross-gabled roofs do. Each slope's uv runs along the eave (x) and up the slope (y) in metres,
// so tile courses follow the eaves.
//   pitchedRoof(flat, top, o) -> { roof: [tri], trim: [tri], gable: [tri] }   tri = [a, b, c, uva, uvb, uvc, hint]
//   o: { pitch (rise per run), overhang (m), gables ('none' hips all round, 'main' gable ends on the main body, 'wings'
//        on the wings only, 'all'; the old gable: true is 'main'), cell (raster size, m) }
//   roof: the slopes; trim: fascia and soffits (white-painted wood); gable: the gable-end walls (wall material)
//   shedRoof(flat, top, o) -> the same, one slope per rectangle (o.flip: which long side is high)
//   mansard(edges, yTop, depth, drop) -> { roof, under }: a tile skirt standing out from the given walls
//   wings(flat, cell) -> { rects, ux, uz, vx, vz } (rects in the main-axis frame), the footprint as rectangles

export function wings(flat, cell = 0.5) { return rasterRects(flat, cell); }
function rasterRects(flat, cell) {
  const n = flat.length / 2;
  // main axis: the longest edge, folded into 0..90 degrees
  let best = 0, ang = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, dx = flat[j * 2] - flat[i * 2], dz = flat[j * 2 + 1] - flat[i * 2 + 1], L = Math.hypot(dx, dz); if (L > best) { best = L; ang = Math.atan2(dz, dx); } }
  const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
  const P = []; let u0 = 1e9, v0 = 1e9, u1 = -1e9, v1 = -1e9;
  for (let i = 0; i < n; i++) { const x = flat[i * 2], z = flat[i * 2 + 1], u = x * ux + z * uz, v = x * vx + z * vz; P.push(u, v); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const W = Math.max(1, Math.ceil((u1 - u0) / cell)), H = Math.max(1, Math.ceil((v1 - v0) / cell));
  if (W * H > 40000) return null;
  const fill = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const pu = u0 + (i + 0.5) * cell, pv = v0 + (j + 0.5) * cell; let ins = false;
    for (let a = 0, b = n - 1; a < n; b = a++) { const ua = P[a * 2], va = P[a * 2 + 1], ub = P[b * 2], vb = P[b * 2 + 1]; if ((va > pv) !== (vb > pv) && pu < (ub - ua) * (pv - va) / (vb - va) + ua) ins = !ins; }
    fill[j * W + i] = ins ? 1 : 0;
  }
  const total = fill.reduce((s, v) => s + v, 0); if (!total) return null;
  const cov = new Uint8Array(W * H), rects = [];
  for (let iter = 0; iter < 5; iter++) {
    // the largest rectangle of filled, uncovered cells (histogram method)
    const hgt = new Int32Array(W); let ba = 0, br = null;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) hgt[i] = fill[j * W + i] && !cov[j * W + i] ? hgt[i] + 1 : 0;
      const st = [];
      for (let i = 0; i <= W; i++) {
        const h = i < W ? hgt[i] : 0;
        while (st.length && hgt[st[st.length - 1]] >= h) { const top = st.pop(), hh = hgt[top], left = st.length ? st[st.length - 1] + 1 : 0, a = hh * (i - left); if (a > ba && hh > 0) { ba = a; br = [left, j - hh + 1, i - 1, j]; } }
        st.push(i);
      }
    }
    if (!br || ba * cell * cell < (rects.length ? 9 : 4)) break;
    let [i0, j0, i1, j1] = br;
    const full = (a0, b0, a1, b1) => { for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) if (!fill[j * W + i]) return false; return true; };
    // grow back over covered cells so this wing reaches into the body it joins
    for (let g = 0; g < 40; g++) { let grew = false;
      if (i0 > 0 && full(i0 - 1, j0, i0 - 1, j1)) { i0--; grew = true; } if (i1 < W - 1 && full(i1 + 1, j0, i1 + 1, j1)) { i1++; grew = true; }
      if (j0 > 0 && full(i0, j0 - 1, i1, j0 - 1)) { j0--; grew = true; } if (j1 < H - 1 && full(i0, j1 + 1, i1, j1 + 1)) { j1++; grew = true; }
      if (!grew) break; }
    if ((i1 - i0 + 1) * cell < 2.2 || (j1 - j0 + 1) * cell < 2.2) { for (let j = br[1]; j <= br[3]; j++) for (let i = br[0]; i <= br[2]; i++) cov[j * W + i] = 1; continue; }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cov[j * W + i] = 1;
    rects.push([u0 + i0 * cell, v0 + j0 * cell, u0 + (i1 + 1) * cell, v0 + (j1 + 1) * cell]);
    if (cov.reduce((s, v, k) => s + (v && fill[k]), 0) >= total * 0.93) break;
  }
  return { rects, ux, uz, vx, vz };
}

export function pitchedRoof(flat, top, o = {}) {
  const pitch = o.pitch ?? 0.42, oh = o.overhang ?? 0.5, out = { roof: [], trim: [], gable: [] };
  const R = rasterRects(flat, o.cell || 0.5); if (!R || !R.rects.length) return null;
  const gables = o.gables || (o.gable ? 'main' : 'none');
  const { ux, uz, vx, vz } = R, W = (u, v, y) => [u * ux + v * vx, y, u * uz + v * vz];
  const quad = (list, a, b, c, d, ua, ub, uc, ud, hint) => { list.push([a, b, c, ua, ub, uc, hint], [a, c, d, ua, uc, ud, hint]); };
  // a row of cap tiles along a ridge or hip: a half round lying on the line
  const cap = (p0, p1, r = 0.11) => {
    const t = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(...t); if (L < 0.2) return; t[0] /= L; t[1] /= L; t[2] /= L;
    let up = [-t[0] * t[1], 1 - t[1] * t[1], -t[2] * t[1]]; const ul = Math.hypot(...up) || 1; up = up.map(v => v / ul);
    const sd = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]], K = 6;
    const at = (p, a) => [p[0] + (sd[0] * Math.cos(a) + up[0] * Math.sin(a)) * r, p[1] + (sd[1] * Math.cos(a) + up[1] * Math.sin(a)) * r - 0.02, p[2] + (sd[2] * Math.cos(a) + up[2] * Math.sin(a)) * r];
    for (let k = 0; k < K; k++) { const a0 = k / K * Math.PI, a1 = (k + 1) / K * Math.PI, m = (a0 + a1) / 2, n = [sd[0] * Math.cos(m) + up[0] * Math.sin(m), sd[1] * Math.cos(m) + up[1] * Math.sin(m), sd[2] * Math.cos(m) + up[2] * Math.sin(m)];
      quad(out.roof, at(p0, a0), at(p1, a0), at(p1, a1), at(p0, a1), [0, a0 * r], [L, a0 * r], [L, a1 * r], [0, a1 * r], n); }
  };
  R.rects.forEach(([a0, b0, a1, b1], ri) => {
    // the eave rectangle, and the ridge along its longer side
    const A0 = a0 - oh, B0 = b0 - oh, A1 = a1 + oh, B1 = b1 + oh, along = (A1 - A0) >= (B1 - B0);
    const span = along ? B1 - B0 : A1 - A0, rise = span / 2 * pitch, ey = top - oh * pitch * 0.5, ry = ey + rise, fh = 0.2;
    // gable ends where asked, but only on an end that faces out: an end lying inside another rectangle (a wing running
    // into the main body) is hipped, so it stays under the roof it joins instead of standing up through it
    const gm = gables === 'all' || (gables === 'main' && ri === 0) || (gables === 'wings' && ri > 0);
    const inOther = (u, v) => R.rects.some((q, k) => k !== ri && u > q[0] + 0.05 && u < q[2] - 0.05 && v > q[1] + 0.05 && v < q[3] - 0.05);
    const gA = gm && !(along ? inOther(a0 + 0.3, (b0 + b1) / 2) : inOther((a0 + a1) / 2, b0 + 0.3));
    const gB = gm && !(along ? inOther(a1 - 0.3, (b0 + b1) / 2) : inOther((a0 + a1) / 2, b1 - 0.3));
    const slopeLen = Math.hypot(span / 2, rise);
    if (along) {
      const mv = (B0 + B1) / 2, ra = gA ? A0 : Math.min(A0 + span / 2, (A0 + A1) / 2), rb = gB ? A1 : Math.max(A1 - span / 2, (A0 + A1) / 2);
      // the two long slopes
      quad(out.roof, W(A0, B0, ey), W(A1, B0, ey), W(rb, mv, ry), W(ra, mv, ry), [A0, 0], [A1, 0], [rb, slopeLen], [ra, slopeLen], [-vx, 1, -vz]);
      quad(out.roof, W(A1, B1, ey), W(A0, B1, ey), W(ra, mv, ry), W(rb, mv, ry), [-A1, 0], [-A0, 0], [-ra, slopeLen], [-rb, slopeLen], [vx, 1, vz]);
      // each end: a gable-end wall from the plate up to the ridge, or a hip
      if (gA) out.gable.push([W(a0, b0, top - 0.02), W(a0, b1, top - 0.02), W(a0, mv, ry - 0.05), [b0, 0], [b1, 0], [mv, ry - top], [-ux, 0, -uz]]);
      else out.roof.push([W(A0, B1, ey), W(A0, B0, ey), W(ra, mv, ry), [B1, 0], [B0, 0], [mv, Math.hypot(ra - A0, rise)], [-ux, 1, -uz]]);
      if (gB) out.gable.push([W(a1, b1, top - 0.02), W(a1, b0, top - 0.02), W(a1, mv, ry - 0.05), [b1, 0], [b0, 0], [mv, ry - top], [ux, 0, uz]]);
      else out.roof.push([W(A1, B0, ey), W(A1, B1, ey), W(rb, mv, ry), [-B0, 0], [-B1, 0], [-mv, Math.hypot(A1 - rb, rise)], [ux, 1, uz]]);
      // cap tiles on the ridge and down the hips
      cap(W(ra, mv, ry), W(rb, mv, ry));
      if (!gA) { cap(W(A0, B0, ey), W(ra, mv, ry)); cap(W(A0, B1, ey), W(ra, mv, ry)); }
      if (!gB) { cap(W(A1, B0, ey), W(rb, mv, ry)); cap(W(A1, B1, ey), W(rb, mv, ry)); }
    } else {
      const mu = (A0 + A1) / 2, ra = gA ? B0 : Math.min(B0 + span / 2, (B0 + B1) / 2), rb = gB ? B1 : Math.max(B1 - span / 2, (B0 + B1) / 2);
      quad(out.roof, W(A0, B1, ey), W(A0, B0, ey), W(mu, ra, ry), W(mu, rb, ry), [B1, 0], [B0, 0], [ra, slopeLen], [rb, slopeLen], [-ux, 1, -uz]);
      quad(out.roof, W(A1, B0, ey), W(A1, B1, ey), W(mu, rb, ry), W(mu, ra, ry), [-B0, 0], [-B1, 0], [-rb, slopeLen], [-ra, slopeLen], [ux, 1, uz]);
      if (gA) out.gable.push([W(a1, b0, top - 0.02), W(a0, b0, top - 0.02), W(mu, b0, ry - 0.05), [a1, 0], [a0, 0], [mu, ry - top], [-vx, 0, -vz]]);
      else out.roof.push([W(A0, B0, ey), W(A1, B0, ey), W(mu, ra, ry), [A0, 0], [A1, 0], [mu, Math.hypot(ra - B0, rise)], [-vx, 1, -vz]]);
      if (gB) out.gable.push([W(a0, b1, top - 0.02), W(a1, b1, top - 0.02), W(mu, b1, ry - 0.05), [a0, 0], [a1, 0], [mu, ry - top], [vx, 0, vz]]);
      else out.roof.push([W(A1, B1, ey), W(A0, B1, ey), W(mu, rb, ry), [-A1, 0], [-A0, 0], [-mu, Math.hypot(B1 - rb, rise)], [vx, 1, vz]]);
      cap(W(mu, ra, ry), W(mu, rb, ry));
      if (!gA) { cap(W(A0, B0, ey), W(mu, ra, ry)); cap(W(A1, B0, ey), W(mu, ra, ry)); }
      if (!gB) { cap(W(A0, B1, ey), W(mu, rb, ry)); cap(W(A1, B1, ey), W(mu, rb, ry)); }
    }
    // fascia boards round the eaves and the soffit under them
    const E = [[A0, B0, A1, B0, -vx, -vz], [A1, B0, A1, B1, ux, uz], [A1, B1, A0, B1, vx, vz], [A0, B1, A0, B0, -ux, -uz]];
    const I = [[a0, b0, a1, b0], [a1, b0, a1, b1], [a1, b1, a0, b1], [a0, b1, a0, b0]];
    E.forEach(([pa, qa, pb, qb, nx, nz], k) => {
      const L = Math.hypot(pb - pa, qb - qa);
      quad(out.trim, W(pa, qa, ey - fh), W(pb, qb, ey - fh), W(pb, qb, ey + 0.02), W(pa, qa, ey + 0.02), [0, 0], [L, 0], [L, fh], [0, fh], [nx, 0, nz]);
      const [ia, ja, ib, jb] = I[k];
      quad(out.trim, W(pa, qa, ey - fh), W(ia, ja, top - 0.02), W(ib, jb, top - 0.02), W(pb, qb, ey - fh), [0, 0], [0, oh], [L, oh], [L, 0], [0, -1, 0]);
    });
  });
  return out;
}

// a mono-pitch roof: each rectangle slopes across its short side, high on one long side, with eaves all round; the
// walls are filled up to the slope at the ends and along the high side
export function shedRoof(flat, top, o = {}) {
  const pitch = o.pitch ?? 0.2, oh = o.overhang ?? 0.3, out = { roof: [], trim: [], gable: [] };
  const R = rasterRects(flat, o.cell || 0.5); if (!R || !R.rects.length) return null;
  const { ux, uz, vx, vz } = R, quad = (list, a, b, c, d, ua, ub, uc, ud, hint) => { list.push([a, b, c, ua, ub, uc, hint], [a, c, d, ua, uc, ud, hint]); };
  for (const [a0, b0, a1, b1] of R.rects) {
    // slope along the short side: work in (s along the ridge, t up the slope) and map back
    const along = a1 - a0 >= b1 - b0, s0 = along ? a0 : b0, s1 = along ? a1 : b1, t0 = along ? b0 : a0, t1 = along ? b1 : a1;
    const dir = o.flip ? -1 : 1, lo = dir > 0 ? t0 : t1, y = t => top + (t - lo) * dir * pitch;
    const W = (s, t, yy) => along ? [s * ux + t * vx, yy, s * uz + t * vz] : [t * ux + s * vx, yy, t * uz + s * vz];
    const S0 = s0 - oh, S1 = s1 + oh, T0 = t0 - oh, T1 = t1 + oh, L = Math.hypot(T1 - T0, y(T1) - y(T0));
    const up = along ? [vx, 0, vz] : [ux, 0, uz], hint = [-up[0] * dir * pitch, 1, -up[2] * dir * pitch];
    quad(out.roof, W(S0, T0, y(T0)), W(S1, T0, y(T0)), W(S1, T1, y(T1)), W(S0, T1, y(T1)), [S0, 0], [S1, 0], [S1, L], [S0, L], hint);
    // the walls under the slope: a triangle at each end, a strip along the high side
    const hi = dir > 0 ? t1 : t0, sn = along ? [ux, 0, uz] : [vx, 0, vz];
    for (const [s, sg] of [[s0, -1], [s1, 1]]) out.gable.push([W(s, t0, top - 0.02), W(s, t1, top - 0.02), W(s, hi, y(hi) - 0.04), [t0, 0], [t1, 0], [hi, y(hi) - top], [sn[0] * sg, 0, sn[2] * sg]]);
    const hn = [up[0] * dir, 0, up[2] * dir];
    out.gable.push([W(s0, hi, top - 0.02), W(s1, hi, top - 0.02), W(s1, hi, y(hi) - 0.04), [s0, 0], [s1, 0], [s1, y(hi) - top], hn], [W(s0, hi, top - 0.02), W(s1, hi, y(hi) - 0.04), W(s0, hi, y(hi) - 0.04), [s0, 0], [s1, y(hi) - top], [s0, y(hi) - top], hn]);
    // fascia round the edge and soffits under the eaves
    const fh = 0.18, E = [[S0, T0, S1, T0, [-up[0], 0, -up[2]]], [S1, T0, S1, T1, sn], [S1, T1, S0, T1, up], [S0, T1, S0, T0, [-sn[0], 0, -sn[2]]]];
    for (const [sa, ta, sb, tb, nn] of E) {
      const l = Math.hypot(sb - sa, tb - ta, y(tb) - y(ta));
      quad(out.trim, W(sa, ta, y(ta) - fh), W(sb, tb, y(tb) - fh), W(sb, tb, y(tb) + 0.02), W(sa, ta, y(ta) + 0.02), [0, 0], [l, 0], [l, fh], [0, fh], nn);
    }
    quad(out.trim, W(S0, T0, y(T0) - fh), W(S1, T0, y(T0) - fh), W(s1, t0, y(t0) - 0.02), W(s0, t0, y(t0) - 0.02), [0, 0], [S1 - S0, 0], [S1 - S0, oh], [0, oh], [0, -1, 0]);
    quad(out.trim, W(S0, T1, y(T1) - fh), W(s0, t1, y(t1) - 0.02), W(s1, t1, y(t1) - 0.02), W(S1, T1, y(T1) - fh), [0, 0], [0, oh], [S1 - S0, oh], [S1 - S0, 0], [0, -1, 0]);
  }
  return out;
}

// a tile mansard: a steep skirt of roof tile standing out from the walls in edges ([ax, az, bx, bz, ox, oz] each, ox/oz
// the wall's outward normal, in order round the building), from yTop at the wall down to yTop - drop at depth out;
// neighbouring edges meet mitred, the ends of a run are closed. roof: the tile (uv: m along, m up the slope); under:
// the soffit and the end caps
export function mansard(edges, yTop, depth, drop) {
  const out = { roof: [], under: [] }, n = edges.length; if (!n) return out;
  const quad = (list, a, b, c, d, ua, ub, uc, ud, hint) => { list.push([a, b, c, ua, ub, uc, hint], [a, c, d, ua, uc, ud, hint]); };
  const joins = (e, f) => Math.hypot(e[2] - f[0], e[3] - f[1]) < 0.05;
  const off = (o1, o2) => { const k = 1 + o1[0] * o2[0] + o1[1] * o2[1]; if (k < 0.3) return [o1[0] * depth, o1[1] * depth]; const m = depth / k; return [(o1[0] + o2[0]) * m, (o1[1] + o2[1]) * m]; };
  const sl = Math.hypot(depth, drop), yb = yTop - drop;
  for (let i = 0; i < n; i++) {
    const e = edges[i], pv = edges[(i + n - 1) % n], nx = edges[(i + 1) % n], o = [e[4], e[5]];
    const ja = n > 1 && joins(pv, e), jb = n > 1 && joins(e, nx);
    const oa = ja ? off([pv[4], pv[5]], o) : [o[0] * depth, o[1] * depth], ob = jb ? off(o, [nx[4], nx[5]]) : [o[0] * depth, o[1] * depth];
    const L = Math.hypot(e[2] - e[0], e[3] - e[1]), A = [e[0], yTop, e[1]], B = [e[2], yTop, e[3]], C = [e[2] + ob[0], yb, e[3] + ob[1]], D = [e[0] + oa[0], yb, e[1] + oa[1]];
    quad(out.roof, D, C, B, A, [0, 0], [L, 0], [L, sl], [0, sl], [o[0] * drop, depth, o[1] * drop]);
    quad(out.under, [e[0], yb, e[1]], [e[2], yb, e[3]], C, D, [0, 0], [L, 0], [L, depth], [0, depth], [0, -1, 0]);
    const tx = (e[2] - e[0]) / (L || 1), tz = (e[3] - e[1]) / (L || 1);
    if (!ja) out.under.push([A, D, [e[0], yb, e[1]], [0, drop], [depth, 0], [0, 0], [-tx, 0, -tz]]);
    if (!jb) out.under.push([B, C, [e[2], yb, e[3]], [0, drop], [depth, 0], [0, 0], [tx, 0, tz]]);
  }
  return out;
}

// a few rooftop units for a flat roof (an HVAC box, a vent stack), inside the footprint and off its edges
export function roofUnits(flat, top, area, rnd, want0) {
  const n = flat.length / 2; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, flat[i * 2]); x1 = Math.max(x1, flat[i * 2]); z0 = Math.min(z0, flat[i * 2 + 1]); z1 = Math.max(z1, flat[i * 2 + 1]); }
  const inside = (x, z) => { let ins = false; for (let a = 0, b = n - 1; a < n; b = a++) { const xa = flat[a * 2], za = flat[a * 2 + 1], xb = flat[b * 2], zb = flat[b * 2 + 1]; if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) ins = !ins; } return ins; };
  const out = [], want = want0 ?? Math.min(8, Math.floor(area / 300));
  for (let k = 0; k < want * 6 && out.length < want; k++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), w = 1.2 + rnd() * 1.6, d = 1.0 + rnd() * 1.4, h = 0.9 + rnd() * 0.8;
    if (![[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a, b]) => inside(x + a * (w / 2 + 1.5), z + b * (d / 2 + 1.5)))) continue;
    if (out.some(u => Math.abs(u.x - x) < (u.w + w) / 2 + 1 && Math.abs(u.z - z) < (u.d + d) / 2 + 1)) continue;
    out.push({ x, z, w, d, h, y: top });
  }
  return out;
}
