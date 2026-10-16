// Driving helpers shared by the Sheriff AI and mission cars: steer a free-physics car toward a point,
// follow an A* path when the target is far, and build one-way-aware edge routes for rail-mode cars.
import { ctx } from './ctx.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapA = a => { if (a <= Math.PI && a >= -Math.PI) return a; if (!isFinite(a)) { if (!self.__wrapBad) self.__wrapBad = new Error('wrapA ' + a).stack; return 0; } a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; }; // O(1): a runaway angle used to spin a while-loop for seconds

// Point the car at (tx, tz) and drive. o.maxSpeed caps forward speed, o.stop brakes to a halt,
// o.arrive slows down as the target gets close. Reverses out when stuck against a wall.
export function steerTo(v, tx, tz, dt, o = {}) {
  const want = Math.atan2(tx - v.pos.x, tz - v.pos.z), diff = wrapA(want - v.rotY);
  const sp = v.vel.length(), fwd = v.vel.x * v.fx + v.vel.y * v.fz;
  let st = clamp(diff * 2.2, -1, 1), thr = 1, brake = false;
  let vmax = o.maxSpeed ?? v.spec.vmax;
  if (o.arrive) vmax = Math.min(vmax, Math.max(3, Math.hypot(tx - v.pos.x, tz - v.pos.z) * 0.5));
  if (Math.abs(diff) > 1.2 && sp > 9) { thr = 0; brake = sp > 14; } // slow for sharp turns
  if (fwd > vmax + 1) { thr = 0; brake = fwd > vmax + 4; } else if (fwd > vmax - 1) thr = 0.3;
  if (o.stop) { thr = 0; brake = true; }
  if (v.rev > 0) { v.rev -= dt; thr = -1; st = -st; brake = false; }
  else if (!o.stop && sp < 1.2 && thr > 0.5) { v.stuck += dt; if (v.stuck > 1.6) { v.rev = 1.2; v.stuck = 0; } }
  else v.stuck = 0;
  ctx.drivePhysics(v, thr, st, brake, false, dt); ctx.carHitWorld(v); ctx.settleCar(v, dt);
}

// Like steerTo, but beyond `near` metres it follows the road graph (A*, refreshed every 3 s).
export function driveTo(v, tx, tz, dt, o = {}) {
  const d = Math.hypot(tx - v.pos.x, tz - v.pos.z), near = o.near ?? 70;
  if (d > near) {
    v.pathT = (v.pathT || 0) - dt;
    const moved = v.pathGoal && Math.hypot(v.pathGoal.x - tx, v.pathGoal.z - tz) > 40;
    if (!v.path || v.pathT <= 0 || moved) {
      v.path = ctx.findPath(ctx.nearestNode(v.pos.x, v.pos.z), ctx.nearestNode(tx, tz)); v.pi = 0; v.pathT = 3; v.pathGoal = { x: tx, z: tz };
    }
    const P = v.path;
    if (P && P.length >= 4) {
      const n = P.length / 2;
      while (v.pi < n - 1) {
        const dc = Math.hypot(P[v.pi * 2] - v.pos.x, P[v.pi * 2 + 1] - v.pos.z);
        const dn = Math.hypot(P[v.pi * 2 + 2] - v.pos.x, P[v.pi * 2 + 3] - v.pos.z);
        if (dc < 14 || dn < dc) v.pi++; else break;
      }
      tx = P[v.pi * 2]; tz = P[v.pi * 2 + 1];
    }
  } else v.path = null;
  steerTo(v, tx, tz, dt, o);
}

// ---- one-way-aware edge routing for rail cars (a.route / a.ri are read by chooseNext/advance)
function heapPush(h, item) { h.push(item); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function heapPop(h) {
  const top = h[0], last = h.pop();
  if (h.length) { h[0] = last; let i = 0; for (; ;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } }
  return top;
}
// Route from (sx,sz) to (gx,gz) along edges accepted by `filter` (default: drivable roads).
// Returns { start: {e, dir, s}, edges: [{e, dir}], goal } or null.
export function routeEdges(sx, sz, gx, gz, filter = e => e.t <= 5) {
  const { edges, nodeEdges, NX, nearestEdge } = ctx;
  const s = nearestEdge(sx, sz, 400, filter), g = nearestEdge(gx, gz, 400, filter);
  if (!s || !g) return null;
  const se = edges[s.e], ge = edges[g.e];
  const open = [], gs = new Map(), came = new Map(), closed = new Set();
  const h = n => Math.hypot(NX[n * 2] - g.x, NX[n * 2 + 1] - g.z);
  const push = (n, cost, from) => { if (cost < (gs.get(n) ?? Infinity)) { gs.set(n, cost); came.set(n, from); heapPush(open, [cost + h(n), n]); } };
  push(se.b, se.len - s.d, { start: 1 });
  if (!se.ow) push(se.a, s.d, { start: -1 });
  let goal = -1, it = 0;
  while (open.length && it++ < 30000) {
    const [, u] = heapPop(open); if (closed.has(u)) continue; closed.add(u);
    if ((u === ge.a || (u === ge.b && !ge.ow)) || (came.get(u).ei === g.e)) { goal = u; break; }
    for (const ei of nodeEdges[u]) {
      const e = edges[ei]; if (!filter(e)) continue;
      const dir = e.a === u ? 1 : -1; if (e.ow && dir < 0) continue;
      push(dir > 0 ? e.b : e.a, gs.get(u) + e.len, { u, ei, dir });
    }
  }
  if (goal < 0) return null;
  const list = []; let cur = goal, startDir = 1;
  for (; ;) { const c = came.get(cur); if (c.start) { startDir = c.start; break; } list.push({ e: c.ei, dir: c.dir }); cur = c.u; }
  list.reverse();
  if (!list.length || list[list.length - 1].e !== g.e) list.push({ e: g.e, dir: goal === ge.a ? 1 : -1 });
  if (list.length > 1 && list[0].e === s.e) { startDir = list[0].dir; list.shift(); } // doubles back along the start edge
  return { start: { e: s.e, dir: startDir, s: startDir > 0 ? s.d : se.len - s.d }, edges: list, goal: g };
}

// Flatten a route into a polyline [x0,z0,x1,z1,…] starting at the route's start point.
export function routePolyline(r) {
  const { edges, edgePos } = ctx; const out = [];
  const tmp = { x: 0, z: 0, tx: 0, tz: 0 };
  const se = edges[r.start.e];
  edgePos(se, r.start.dir > 0 ? r.start.s : se.len - r.start.s, tmp); out.push(tmp.x, tmp.z);
  const addEdge = (e, dir, from = 0) => {
    const p = e.pts, n = p.length / 2;
    if (dir > 0) { for (let k = 0; k < n; k++) if (e.cum[k] >= from) out.push(p[k * 2], p[k * 2 + 1]); }
    else { for (let k = n - 1; k >= 0; k--) if (e.len - e.cum[k] >= from) out.push(p[k * 2], p[k * 2 + 1]); }
  };
  addEdge(se, r.start.dir, r.start.s);
  for (const { e, dir } of r.edges) addEdge(edges[e], dir);
  return out;
}

// Points every `step` metres along a polyline (always includes the last point).
export function samplePolyline(pts, step) {
  const out = []; let acc = 0;
  for (let k = 2; k < pts.length; k += 2) {
    const ax = pts[k - 2], az = pts[k - 1], bx = pts[k], bz = pts[k + 1], L = Math.hypot(bx - ax, bz - az);
    let t = step - acc;
    while (t <= L) { out.push({ x: ax + (bx - ax) * t / L, z: az + (bz - az) * t / L }); t += step; }
    acc = (acc + L) % step;
  }
  const n = pts.length; const last = { x: pts[n - 2], z: pts[n - 1] };
  if (!out.length || Math.hypot(out[out.length - 1].x - last.x, out[out.length - 1].z - last.z) > step * 0.4) out.push(last); else out[out.length - 1] = last;
  return out;
}
