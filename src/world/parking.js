// Parking lots: painted stalls in every lot OpenStreetMap maps (area kind 2), parked cars that fill them by time of
// day, and traffic that uses them: cars turn in off the street, drive the aisle, pull into a stall and the driver walks
// off; later someone walks back, backs out and drives away into traffic.
//   const PARK = createParking(hooks)   PARK.build(areas)   PARK.update(dt, focus)   PARK.stalls
// hooks: { THREE, paint(x, z, tx, tz, len, wid), onRoad(x, z, m), blocked(x, z, r), nearestRoad(x, z), heightAt,
//          spawnParked(x, z, rot, stall), traffic(near), makeDriverWalk(v, stall), toRail(v), vehicles(), cap, busy(x, z), hour() }
const SW = 2.7, SD = 5.4, AISLE = 7, MODULE = SD * 2 + AISLE;

function pip(x, z, f) { let ins = false; const n = f.length / 2; for (let i = 0, j = n - 1; i < n; j = i++) { const xi = f[i * 2], zi = f[i * 2 + 1], xj = f[j * 2], zj = f[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; }
function area(f) { let s = 0; const n = f.length / 2; for (let i = 0, j = n - 1; i < n; j = i++) s += (f[j * 2] + f[i * 2]) * (f[j * 2 + 1] - f[i * 2 + 1]); return Math.abs(s) / 2; }
function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function createParking(H) {
  const lots = [], stalls = [], grid = new Map(), G = 120;
  const gkey = (x, z) => Math.floor(x / G) * 100000 + Math.floor(z / G);
  // ---- layout: rows along the lot's longest edge; back-to-back stall rows with an aisle between each pair
  function layout(poly, li) {
    const n = poly.length / 2; let best = 0, ux = 1, uz = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n, dx = poly[j * 2] - poly[i * 2], dz = poly[j * 2 + 1] - poly[i * 2 + 1], L = Math.hypot(dx, dz); if (L > best) { best = L; ux = dx / L; uz = dz / L; } }
    const vx = -uz, vz = ux; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (let i = 0; i < n; i++) { const u = poly[i * 2] * ux + poly[i * 2 + 1] * uz, v = poly[i * 2] * vx + poly[i * 2 + 1] * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const lot = { li, poly, ux, uz, vx, vz, stalls: [], cx: 0, cz: 0, entry: null }; let cn = 0;
    const P = (u, v) => [u * ux + v * vx, u * uz + v * vz];
    for (let v = v0 + 0.5; v + SD <= v1; v += MODULE) {
      for (const side of [0, 1]) { // the two back-to-back rows of this module; cars nose toward the shared back line
        const vr = v + side * SD, aisleV = side ? vr + SD + AISLE / 2 : vr - AISLE / 2;
        for (let u = u0 + 1; u + SW <= u1 - 1; u += SW) {
          const cu = u + SW / 2, cv = vr + SD / 2, [cx, cz] = P(cu, cv);
          const corners = [P(u, vr), P(u + SW, vr), P(u, vr + SD), P(u + SW, vr + SD)];
          if (!corners.every(([x, z]) => pip(x, z, poly))) continue;
          if (H.onRoad(cx, cz, 1) || H.blocked(cx, cz, 1.6)) continue;
          const face = side ? -1 : 1; // the direction (along v) the car faces when parked: nose in, toward the back line
          const [ax, az] = P(cu, side ? vr + SD + AISLE / 2 : vr - AISLE / 2);
          const st = { lot, x: cx, z: cz, rot: Math.atan2(vx * face, vz * face), ax, az, car: null, busyT: 0, i: stalls.length };
          stalls.push(st); lot.stalls.push(st); cn++; lot.cx += cx; lot.cz += cz;
          const k = gkey(cx, cz); (grid.get(k) || grid.set(k, []).get(k)).push(st);
          // the painted stall: a side line on each edge, plus the back line drawn once per row below
          const [lx, lz] = P(u, cv); H.paint(lx, lz, vx, vz, SD, 0.12);
        }
        const [bx, bz] = P((u0 + u1) / 2, side ? vr + SD : vr); // the row's back line (where noses meet)
        if (lot.stalls.length) H.paint(bx, bz, ux, uz, u1 - u0 - 2, 0.12);
      }
    }
    if (!cn) return;
    lot.cx /= cn; lot.cz /= cn;
    const rd = H.nearestRoad(lot.cx, lot.cz); if (rd) lot.entry = rd; // where cars come in from the street
    lots.push(lot);
  }
  const api = {
    lots, stalls,
    build(areas) {
      areas.forEach((a, i) => { if (a[0] === 2 && area(a[1]) > 250 && area(a[1]) < 60000) layout(a[1], i); });
      return stalls.length;
    },
    // the same, a few milliseconds at a time between frames (the 15,000 stalls held a fast PC for three seconds)
    async buildAsync(areas, ms = 8) {
      let t = performance.now();
      for (let i = 0; i < areas.length; i++) {
        const a = areas[i]; if (a[0] === 2 && area(a[1]) > 250 && area(a[1]) < 60000) layout(a[1], i);
        if (performance.now() - t > ms) { await new Promise(r => setTimeout(r, 0)); t = performance.now(); }
      }
      return stalls.length;
    },
    // stalls outside the lots: driveways (home: full overnight, emptier through the workday; cars pull in from the
    // street and back out) and curbside spaces (kerb: no comings and goings, they fill and empty out of sight).
    // list: [{ x, z, rot, ax, az (where a car turns in from), entry ({ x, z, tx, tz } on the street, or null), home, kerb }]
    addStalls(list) {
      for (const o of list) {
        const st = { i: stalls.length, x: o.x, z: o.z, rot: o.rot, ax: o.ax ?? o.x, az: o.az ?? o.z, home: !!o.home, kerb: !!o.kerb, car: null };
        st.lot = { entry: o.entry || null, stalls: [st], cx: o.x, cz: o.z, home: st.home };
        stalls.push(st); const k = gkey(o.x, o.z); (grid.get(k) || grid.set(k, []).get(k)).push(st);
      }
      return stalls.length;
    },
    // ---- occupancy around the focus: parked cars appear in stalls as you come near, by time of day and how busy the area is
    _t: 0, _arr: 0,
    update(dt, f) {
      this._t -= dt; if (this._t > 0) return; this._t = 0.7;
      const h = H.hour(), day = h > 7 && h < 21 ? 1 : h > 6 && h < 23 ? 0.6 : 0.25;
      const cars = H.vehicles(), parkedHere = cars.filter(v => v.stall && !v.removed).length;
      for (const v of cars) if (v.stall && (v.removed || v.dead || !v.parked && !v.lot)) { if (v.stall.car === v) v.stall.car = null; if (v.removed || v.dead) v.stall = null; } // freed
      const near = [];
      for (let gx = Math.floor((f.x - 260) / G); gx <= Math.floor((f.x + 260) / G); gx++) for (let gz = Math.floor((f.z - 260) / G); gz <= Math.floor((f.z + 260) / G); gz++) { const c = grid.get(gx * 100000 + gz); if (c) near.push(...c); }
      // fill: deterministic per stall and hour, so a lot looks the same when you come back
      let budget = Math.max(0, H.cap - parkedHere);
      for (const st of near) {
        if (budget <= 0) break; if (st.car && !st.car.removed) continue;
        const d = Math.hypot(st.x - f.x, st.z - f.z); if (d < 45 || d > 240) continue; // nobody pops into view next to you
        const want = st.home ? (h < 7 || h >= 20 ? 0.88 : h < 9 || h >= 17 ? 0.62 : 0.38) : st.kerb ? 0.3 + 0.2 * (h < 8 || h >= 18 ? 1 : 0) : day * H.busy(st.x, st.z), r = rng(st.i * 7919 + Math.floor(h))();
        if (r < want) { const v = H.spawnParked(st.x, st.z, st.rot, st); if (v) { st.car = v; v.stall = st; budget--; } }
      }
      // dynamic: now and then a car from traffic turns into a lot near you and parks, or a parked car leaves
      this._arr -= 0.7;
      if (this._arr <= 0) {
        this._arr = 6 + Math.random() * 6;
        const free = near.filter(st => !st.car && st.lot.entry && Math.hypot(st.x - f.x, st.z - f.z) < 180);
        if (free.length && Math.random() < 0.7 * day) { const st = free[Math.floor(Math.random() * free.length)], v = H.traffic(st.lot.entry); if (v) arrive(v, st); }
        const leavers = near.filter(st => st.car && st.car.parked && !st.car.driver && !st.car.mine && !st.car.keep && st.lot.entry && Math.hypot(st.x - f.x, st.z - f.z) < 160);
        if (leavers.length && Math.random() < 0.5) { const st = leavers[Math.floor(Math.random() * leavers.length)]; H.walkToCar(st.car); }
      }
    },
    // per frame for cars on a lot path (called from the vehicle loop)
    step(v, dt) { stepLot(v, dt); },
    depart(v) { depart(v); },
  };
  return api;

  // a car follows waypoints: off the street to the lot entrance, along the aisle, nose into the stall
  function arrive(v, st) {
    const e = st.lot.entry; st.car = v; v.stall = st;
    v.lot = { pts: [[e.x, e.z, 7], [st.ax, st.az, 4], [st.x, st.z, 1.8]], i: 0, sp: Math.max(4, v.speed || 8), park: true };
    v.mode = 'lot'; v.agent = null;
  }
  function depart(v) {
    const st = v.stall; if (!st || !st.lot.entry) return; const e = st.lot.entry;
    v.parked = false; v.driver = 'ai';
    v.lot = { pts: [[st.ax, st.az, 2, true], [e.x, e.z, 5], [e.x + e.tx * 12, e.z + e.tz * 12, 8]], i: 0, sp: 0, leave: true };
    v.mode = 'lot';
  }
  function stepLot(v, dt) {
    const L = v.lot; if (!L) return; const pt = L.pts[L.i]; if (!pt) { finish(v); return; }
    const [tx, tz, vmax, rev] = pt, dx = tx - v.pos.x, dz = tz - v.pos.z, d = Math.hypot(dx, dz);
    // don't drive into anyone: wait while a car or a person is right in the way
    let blocked = false; for (const o of H.vehicles()) { if (o === v || o.removed) continue; const ox = o.pos.x - v.pos.x, oz = o.pos.z - v.pos.z, od = Math.hypot(ox, oz); if (od < 6 && (ox * Math.sin(v.rotY) + oz * Math.cos(v.rotY)) * (rev ? -1 : 1) > 1.5 && od > 0.5) { blocked = true; break; } }
    const want = rev ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
    const last = L.i === L.pts.length - 1, target = blocked ? 0 : Math.min(vmax, last && L.park ? Math.max(0.8, d * 0.9) : vmax);
    L.sp += Math.sign(target - L.sp) * Math.min(Math.abs(target - L.sp), dt * 4);
    let turn = ((want - v.rotY + Math.PI * 3) % (Math.PI * 2)) - Math.PI; v.rotY += turn * Math.min(1, dt * (rev ? 2.5 : 3.2));
    const dir = rev ? -1 : 1; v.pos.x += Math.sin(v.rotY) * L.sp * dir * dt; v.pos.z += Math.cos(v.rotY) * L.sp * dir * dt; v.speed = L.sp * dir; v.braking = L.sp < target - 0.2 || target === 0;
    v.vel.set(Math.sin(v.rotY) * L.sp * dir, Math.cos(v.rotY) * L.sp * dir);
    H.settle(v, dt);
    if (d < (last ? 0.6 : 2.2)) L.i++;
    if (L.i >= L.pts.length) finish(v);
  }
  function finish(v) {
    const L = v.lot; v.lot = null; v.vel.set(0, 0); v.speed = 0;
    if (L && L.park) { const st = v.stall; if (st) { v.rotY = st.rot; v.pos.x = st.x; v.pos.z = st.z; } v.mode = 'free'; v.parked = true; H.driverOut(v); }
    else { if (v.stall && v.stall.car === v) v.stall.car = null; v.stall = null; H.toRail(v); }
  }
}
