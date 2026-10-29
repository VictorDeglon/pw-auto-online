// Shared road-network contract for traffic behaviour (index.html) and signal visuals (src/signals.js).
// Pure functions over the road graph built in index.html; no three.js, no scene access.
//
// Conventions (same as index.html): x = east, z = south (metres), y = up. A heading (dx, dz) is a unit vector
// in the ground plane; the right-hand side of travel is (-dz, dx). Lane 0 is the LEFTMOST lane of a direction.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Travel lanes in one direction of an edge. Widths in the data include shoulders/bike lanes, so be conservative.
export function lanesPerDir(e) {
  if (e.ow) return e.w >= 18 ? 3 : e.w >= 11 ? 2 : 1;
  return e.w >= 21 ? 3 : e.w >= 15 ? 2 : 1;
}

// Lateral offset (metres, + = right of travel) of the centre of `lane` for traffic on edge e.
// Two-way roads: slack beyond the travel lanes is split between a centre gap (turn lane/median) and the shoulder.
export function laneOffset(e, lane) {
  const n = lanesPerDir(e);
  if (e.t === 4 && !e.ow && n === 1 && e.w >= 9.5) return 1.6; // a residential street: drive the middle, clear of the cars parked at the curb
  if (e.ow) { const lw = clamp(e.w / n, 2.8, 3.7); return (lane - (n - 1) / 2) * lw; }
  const lw = clamp(e.w / 2 / n, 2.8, 3.7), base = Math.max(0, e.w / 2 - n * lw) * 0.5;
  return base + (lane + 0.5) * lw;
}

// Unit travel direction of the last (or first) polyline segment of edge e for traffic ARRIVING at `node`.
export function arrivalDir(e, node) {
  const p = e.pts, n = p.length / 2; let dx, dz;
  if (e.b === node) { dx = p[2 * n - 2] - p[2 * n - 4]; dz = p[2 * n - 1] - p[2 * n - 3]; }
  else { dx = p[0] - p[2]; dz = p[1] - p[3]; }
  const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l];
}

// Can traffic on edge e travel INTO `node`? (two-way, or one-way a->b ending at node)
export function canArrive(e, node) { return !e.ow || e.b === node; }

// Group signalised graph nodes into intersections and describe every approach.
// lightNodes: Map(node -> any) of signalised nodes (built in index.html from OSM signal positions).
// Divided roads are two one-way carriageways, so one real intersection is often 2-4 graph nodes joined by short
// internal edges; those share one controller. Returns:
//   { list: [Intersection], byNode: Map(node -> Intersection), approachAt: Map(`${ei}:${node}` -> Approach) }
// Intersection: { id, nodes:[n], cx, cz, approaches:[Approach], axes: number of phase axes (1-3) }
// Approach: { id, inter, ei, node, dx, dz (travel dir arriving), nx, nz (node pos), lanes, width, oneway, cls,
//             name, crossName, setback (m from node back to stop line), stopX, stopZ (centreline at stop line),
//             axis (phase axis index; approaches on the same axis move together),
//             leftArrow (true = has a left-turn arrow signal head and a protected-left phase) }
export function buildIntersections({ edges, nodeEdges, NX, lightNodes, names = [] }) {
  const JOIN = 45; // internal edges shorter than this join two signalised nodes into one intersection
  const parent = new Map(); const find = n => { while (parent.get(n) !== n) { parent.set(n, parent.get(parent.get(n))); n = parent.get(n); } return n; };
  for (const n of lightNodes.keys()) parent.set(n, n);
  for (const n of lightNodes.keys()) for (const ei of nodeEdges[n]) {
    const e = edges[ei], o = e.a === n ? e.b : e.a;
    if (o !== n && lightNodes.has(o) && e.len < JOIN) parent.set(find(n), find(o));
  }
  const groups = new Map();
  for (const n of lightNodes.keys()) { const r = find(n); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(n); }

  const list = [], byNode = new Map(), approachAt = new Map();
  let aid = 0;
  for (const nodes of groups.values()) {
    const set = new Set(nodes); const inter = { id: list.length, nodes, cx: 0, cz: 0, approaches: [], axes: 1 };
    for (const n of nodes) { inter.cx += NX[n * 2] / nodes.length; inter.cz += NX[n * 2 + 1] / nodes.length; }
    for (const n of nodes) {
      const inc = nodeEdges[n].map(i => edges[i]);
      for (const e of inc) {
        const o = e.a === n ? e.b : e.a;
        if (set.has(o) && e.len < JOIN) continue; // internal link between carriageways
        if (!canArrive(e, n)) continue;
        const [dx, dz] = arrivalDir(e, n);
        // stop line sits behind the widest road crossing this approach at this node
        let cross = 0;
        for (const f of inc) {
          if (f === e) continue; const [fx, fz] = arrivalDir(f, n);
          if (Math.abs(fx * dx + fz * dz) < 0.75) cross = Math.max(cross, f.w);
        }
        const setback = clamp((cross || e.w) / 2 + 2.5, 4, 16);
        const ap = {
          id: aid++, inter, ei: e.i, node: n, dx, dz, nx: NX[n * 2], nz: NX[n * 2 + 1], lanes: lanesPerDir(e), width: e.w,
          oneway: e.ow, cls: e.t, name: e.name || '', crossName: '', setback,
          stopX: NX[n * 2] - dx * setback, stopZ: NX[n * 2 + 1] - dz * setback, axis: 0,
        };
        inter.approaches.push(ap); approachAt.set(`${e.i}:${n}`, ap);
      }
      byNode.set(n, inter);
    }
    assignAxes(inter);
    for (const ap of inter.approaches) {
      // multi-lane approaches on collector-or-bigger roads get a dedicated left-turn signal head (protected/permissive left)
      ap.leftArrow = ap.lanes >= 2 && ap.cls <= 3 && inter.approaches.length >= 3;
      const counts = new Map();
      for (const o of inter.approaches) if (o.axis !== ap.axis && o.name && o.name !== ap.name) counts.set(o.name, (counts.get(o.name) || 0) + 1);
      let best = '', bc = 0; for (const [nm, c] of counts) if (c > bc) { best = nm; bc = c; }
      ap.crossName = best;
    }
    list.push(inter);
  }
  return { list, byNode, approachAt };
}

// Axial clustering of approach bearings (direction mod 180deg): up to 3 axes, seeded by the most important approach.
function assignAxes(inter) {
  const A = inter.approaches; if (!A.length) return;
  const ang = a => { let t = Math.atan2(a.dz, a.dx); if (t < 0) t += Math.PI; if (t >= Math.PI) t -= Math.PI; return t; };
  const dist = (a, b) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
  const byImportance = A.slice().sort((p, q) => (p.cls - q.cls) || (q.width - p.width));
  const seeds = [ang(byImportance[0])];
  let far = null, fd = 0; for (const a of A) { const d = dist(ang(a), seeds[0]); if (d > fd) { fd = d; far = a; } }
  if (far && fd > 0.6) seeds.push(ang(far));
  for (const a of A) { const t = ang(a); if (seeds.every(s => dist(t, s) > 0.55) && seeds.length < 3) seeds.push(t); }
  for (const a of A) { const t = ang(a); let bi = 0, bd = 9; seeds.forEach((s, i) => { const d = dist(t, s); if (d < bd) { bd = d; bi = i; } }); a.axis = bi; }
  inter.axes = seeds.length;
}
