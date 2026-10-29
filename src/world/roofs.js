// Pitched roofs for houses, from any footprint. The footprint is turned to its main axis, rasterised at half a metre
// and covered by a few rectangles (the biggest first, each grown back over the others so wings overlap the main body);
// every rectangle gets a hip or gable roof with eaves, and where the roofs of a house's wings cross, their slopes
// intersect the way cross-gabled roofs do. Each slope's uv runs along the eave (x) and up the slope (y) in metres,
// so tile courses follow the eaves.
//   pitchedRoof(flat, top, o) -> { roof: [tri], trim: [tri], gable: [tri] }   tri = [a, b, c, uva, uvb, uvc, hint]
//   o: { pitch (rise per run), overhang (m), gable (true: gable ends, else hips), seed }
//   roof: the slopes; trim: fascia and soffits (white-painted wood); gable: the gable-end walls (wall material)

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
  const R = rasterRects(flat, 0.5); if (!R || !R.rects.length) return null;
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
    const gable = !!o.gable && ri === 0;
    const slopeLen = Math.hypot(span / 2, rise);
    if (along) {
      const mv = (B0 + B1) / 2, ra = gable ? A0 : Math.min(A0 + span / 2, (A0 + A1) / 2), rb = gable ? A1 : Math.max(A1 - span / 2, (A0 + A1) / 2);
      // the two long slopes
      quad(out.roof, W(A0, B0, ey), W(A1, B0, ey), W(rb, mv, ry), W(ra, mv, ry), [A0, 0], [A1, 0], [rb, slopeLen], [ra, slopeLen], [-vx, 1, -vz]);
      quad(out.roof, W(A1, B1, ey), W(A0, B1, ey), W(ra, mv, ry), W(rb, mv, ry), [-A1, 0], [-A0, 0], [-ra, slopeLen], [-rb, slopeLen], [vx, 1, vz]);
      if (gable) { // gable-end walls, from the plate up to the ridge
        out.gable.push([W(a0, b0, top - 0.02), W(a0, b1, top - 0.02), W(a0, mv, ry - 0.05), [b0, 0], [b1, 0], [mv, ry - top], [-ux, 0, -uz]]);
        out.gable.push([W(a1, b1, top - 0.02), W(a1, b0, top - 0.02), W(a1, mv, ry - 0.05), [b1, 0], [b0, 0], [mv, ry - top], [ux, 0, uz]]);
      } else { // hips
        const hl = Math.hypot(ra - A0, rise);
        out.roof.push([W(A0, B1, ey), W(A0, B0, ey), W(ra, mv, ry), [B1, 0], [B0, 0], [mv, hl], [-ux, 1, -uz]]);
        out.roof.push([W(A1, B0, ey), W(A1, B1, ey), W(rb, mv, ry), [-B0, 0], [-B1, 0], [-mv, hl], [ux, 1, uz]]);
      }
    } else {
      const mu = (A0 + A1) / 2, ra = gable ? B0 : Math.min(B0 + span / 2, (B0 + B1) / 2), rb = gable ? B1 : Math.max(B1 - span / 2, (B0 + B1) / 2);
      quad(out.roof, W(A0, B1, ey), W(A0, B0, ey), W(mu, ra, ry), W(mu, rb, ry), [B1, 0], [B0, 0], [ra, slopeLen], [rb, slopeLen], [-ux, 1, -uz]);
      quad(out.roof, W(A1, B0, ey), W(A1, B1, ey), W(mu, rb, ry), W(mu, ra, ry), [-B0, 0], [-B1, 0], [-rb, slopeLen], [-ra, slopeLen], [ux, 1, uz]);
      if (gable) {
        out.gable.push([W(a1, b0, top - 0.02), W(a0, b0, top - 0.02), W(mu, b0, ry - 0.05), [a1, 0], [a0, 0], [mu, ry - top], [-vx, 0, -vz]]);
        out.gable.push([W(a0, b1, top - 0.02), W(a1, b1, top - 0.02), W(mu, b1, ry - 0.05), [a0, 0], [a1, 0], [mu, ry - top], [vx, 0, vz]]);
      } else {
        const hl = Math.hypot(ra - B0, rise);
        out.roof.push([W(A0, B0, ey), W(A1, B0, ey), W(mu, ra, ry), [A0, 0], [A1, 0], [mu, hl], [-vx, 1, -vz]]);
        out.roof.push([W(A1, B1, ey), W(A0, B1, ey), W(mu, rb, ry), [-A1, 0], [-A0, 0], [-mu, hl], [vx, 1, vz]]);
      }
    }
    // cap tiles on the ridge and down the hips
    if (along) { const mv = (B0 + B1) / 2, ra = gable ? A0 : Math.min(A0 + span / 2, (A0 + A1) / 2), rb = gable ? A1 : Math.max(A1 - span / 2, (A0 + A1) / 2);
      cap(W(ra, mv, ry), W(rb, mv, ry)); if (!gable) { cap(W(A0, B0, ey), W(ra, mv, ry)); cap(W(A0, B1, ey), W(ra, mv, ry)); cap(W(A1, B0, ey), W(rb, mv, ry)); cap(W(A1, B1, ey), W(rb, mv, ry)); } }
    else { const mu = (A0 + A1) / 2, ra = gable ? B0 : Math.min(B0 + span / 2, (B0 + B1) / 2), rb = gable ? B1 : Math.max(B1 - span / 2, (B0 + B1) / 2);
      cap(W(mu, ra, ry), W(mu, rb, ry)); if (!gable) { cap(W(A0, B0, ey), W(mu, ra, ry)); cap(W(A1, B0, ey), W(mu, ra, ry)); cap(W(A0, B1, ey), W(mu, rb, ry)); cap(W(A1, B1, ey), W(mu, rb, ry)); } }
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

// a few rooftop units for a flat roof (an HVAC box, a vent stack), inside the footprint and off its edges
export function roofUnits(flat, top, area, rnd) {
  const n = flat.length / 2; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, flat[i * 2]); x1 = Math.max(x1, flat[i * 2]); z0 = Math.min(z0, flat[i * 2 + 1]); z1 = Math.max(z1, flat[i * 2 + 1]); }
  const inside = (x, z) => { let ins = false; for (let a = 0, b = n - 1; a < n; b = a++) { const xa = flat[a * 2], za = flat[a * 2 + 1], xb = flat[b * 2], zb = flat[b * 2 + 1]; if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) ins = !ins; } return ins; };
  const out = [], want = Math.min(8, Math.floor(area / 300));
  for (let k = 0; k < want * 6 && out.length < want; k++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), w = 1.2 + rnd() * 1.6, d = 1.0 + rnd() * 1.4, h = 0.9 + rnd() * 0.8;
    if (![[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a, b]) => inside(x + a * (w / 2 + 1.5), z + b * (d / 2 + 1.5)))) continue;
    if (out.some(u => Math.abs(u.x - x) < (u.w + w) / 2 + 1 && Math.abs(u.z - z) < (u.d + d) / 2 + 1)) continue;
    out.push({ x, z, w, d, h, y: top });
  }
  return out;
}
