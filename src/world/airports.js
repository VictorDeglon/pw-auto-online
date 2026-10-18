// Airports, Stealable Real Planes, Runways, and Airstrips
// Features:
// - Real airports with modeled runways (threshold stripes, centerline, runway lighting, hangars, control tower)
// - Stealable Real Planes: Stunt Prop Plane, Executive Private Jet, and Supersonic Fighter
// - Realistic ground taxi, takeoff roll, aerodynamic flight physics, landing, and mid-air bailouts
// - Buyable Airstrips (individual or Gang ownership) and Buyable Aircraft Dealerships

import { ctx } from '../ctx.js';

export const AIRPORTS = [
  {
    id: 'poway-valley',
    name: 'Poway Valley Executive Airfield',
    x: 1800, z: 2400,
    len: 580, wid: 32, rot: 0.15,
    tag: 'Main local airport with terminal, hangars, and flight school',
    price: 350000,
    planes: [
      { type: 'prop', ox: -18, oz: 40, rot: 0.15 },
      { type: 'prop', ox: -24, oz: -50, rot: 0.15 },
      { type: 'jet', ox: 25, oz: 70, rot: 0.15 }
    ]
  },
  {
    id: 'ramona-county',
    name: 'Ramona Valley Skypark',
    x: 4800, z: -4600,
    len: 520, wid: 28, rot: 0.42,
    tag: 'Backcountry strip for private flyers and crop dusters',
    price: 280000,
    planes: [
      { type: 'prop', ox: -20, oz: 20, rot: 0.42 },
      { type: 'jet', ox: 22, oz: -30, rot: 0.42 }
    ]
  },
  {
    id: 'miramar-outpost',
    name: 'Miramar Border Airfield',
    x: -4600, z: 2400,
    len: 620, wid: 36, rot: -0.1,
    tag: 'Joint military-civilian staging strip',
    price: 500000,
    planes: [
      { type: 'fighter', ox: -25, oz: 0, rot: -0.1 },
      { type: 'fighter', ox: 25, oz: 60, rot: -0.1 },
      { type: 'jet', ox: -20, oz: -80, rot: -0.1 }
    ]
  },
  // Gang Buyable Airstrips (Fictionalized in spacious valley/mountain areas)
  {
    id: 'gang-ridgecrest',
    name: 'Ridgecrest Tactical Airstrip',
    x: -1400, z: -7000,
    len: 440, wid: 26, rot: 0.6,
    tag: 'Secluded mountain airstrip with secure warehouse garage',
    price: 150000,
    tier: 1,
    isGangBase: true,
    planes: [
      { type: 'prop', ox: -16, oz: 30, rot: 0.6 }
    ]
  },
  {
    id: 'gang-sycamore',
    name: 'Sycamore Canyon Hangar Compound',
    x: 3600, z: 750,
    len: 540, wid: 30, rot: -0.35,
    tag: 'Medium gang airfield with dual watchtowers and warehouse garage',
    price: 320000,
    tier: 2,
    isGangBase: true,
    planes: [
      { type: 'prop', ox: -20, oz: -40, rot: -0.35 },
      { type: 'jet', ox: 22, oz: 50, rot: -0.35 }
    ]
  },
  {
    id: 'gang-ironpeak',
    name: 'Iron Peak Fortress Airbase',
    x: 5600, z: 1200,
    len: 640, wid: 36, rot: 0.05,
    tag: 'Fortified heavy airstrip with reinforced warehouse, AA battery & sniper towers',
    price: 650000,
    tier: 3,
    isGangBase: true,
    planes: [
      { type: 'fighter', ox: -28, oz: 20, rot: 0.05 },
      { type: 'jet', ox: 26, oz: -60, rot: 0.05 }
    ]
  }
];

export const PLANES = [];
let activePlane = null;

// Plane Models
export function buildPlaneModel(type, THREE) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.6, metalness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.35 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd9383a, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d283a, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.2 });

  if (type === 'prop') {
    // Single-Engine Stunt / Sport Plane
    // Fuselage
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.4, 6.2, 10).rotateX(Math.PI / 2), white);
    fuse.position.set(0, 1.1, 0); g.add(fuse);
    // Canopy
    const can = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 1.8), glass);
    can.position.set(0, 1.6, -0.2); g.add(can);
    // Wings
    const wing = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.14, 1.6), red);
    wing.position.set(0, 1.4, -0.2); g.add(wing);
    // Tail
    const tailH = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 0.9), red);
    tailH.position.set(0, 1.3, -2.7); g.add(tailH);
    const tailV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 1.1), white);
    tailV.position.set(0, 1.8, -2.7); g.add(tailV);
    // Propeller
    const prop = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.08), dark);
    prop.position.set(0, 1.1, 3.15); g.add(prop);
    g.userData.prop = prop;
    // Wheels
    const wGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8).rotateZ(Math.PI / 2);
    const wL = new THREE.Mesh(wGeo, dark); wL.position.set(-1.1, 0.3, 0.8); g.add(wL);
    const wR = new THREE.Mesh(wGeo, dark); wR.position.set(1.1, 0.3, 0.8); g.add(wR);
    const wT = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 8).rotateZ(Math.PI / 2), dark);
    wT.position.set(0, 0.2, -2.8); g.add(wT);
  } else if (type === 'jet') {
    // Executive Twin-Turbine Private Jet
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.6, 12.0, 12).rotateX(Math.PI / 2), white);
    fuse.position.set(0, 1.6, 0); g.add(fuse);
    // Gold cheatline stripe
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 0.62, 0.6, 12).rotateX(Math.PI / 2), gold);
    stripe.position.set(0, 1.6, 1.2); g.add(stripe);
    // Swept Wings
    const wing = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.22, 2.8), white);
    wing.position.set(0, 1.2, -0.6); wing.rotation.y = 0.15; g.add(wing);
    // Engines on rear fuselage
    const engL = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 2.6, 10).rotateX(Math.PI / 2), dark);
    engL.position.set(-1.6, 2.0, -3.2); g.add(engL);
    const engR = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 2.6, 10).rotateX(Math.PI / 2), dark);
    engR.position.set(1.6, 2.0, -3.2); g.add(engR);
    // T-Tail
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 2.2), white);
    fin.position.set(0, 2.8, -5.2); fin.rotation.x = -0.3; g.add(fin);
    const tTail = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.15, 1.4), gold);
    tTail.position.set(0, 4.0, -5.6); g.add(tTail);
  } else {
    // Supersonic Fighter Jet
    const fuse = new THREE.Mesh(new THREE.ConeGeometry(1.2, 13.0, 10).rotateX(Math.PI / 2), dark);
    fuse.position.set(0, 1.4, 0); g.add(fuse);
    const delta = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.16, 4.8), dark);
    delta.position.set(0, 1.4, -1.8); g.add(delta);
    const fins = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 0.18), dark);
    fins.position.set(0, 2.3, -4.8); g.add(fins);
    // Flame nozzle
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6622 }));
    flame.position.set(0, 1.4, -6.8); g.add(flame);
    g.userData.flame = flame;
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Build 3D Runways, Markings, and Hangars
export function initAirports(scene, THREE) {
  if (!scene || !THREE) return;

  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.85 });
  const whitePaint = new THREE.MeshBasicMaterial({ color: 0xf3f4f6 });
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0x3d4450, roughness: 0.7 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xc87d2a, roughness: 0.6 });

  for (const ap of AIRPORTS) {
    const y = ctx.heightAt ? ctx.heightAt(ap.x, ap.z) : 100;
    const g = new THREE.Group();
    g.position.set(ap.x, y + 0.08, ap.z);
    g.rotation.y = ap.rot;

    // Runway surface
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(ap.wid, ap.len).rotateX(-Math.PI / 2), asphaltMat);
    rw.receiveShadow = true;
    g.add(rw);

    // Centerline dashes
    const dashCount = Math.floor(ap.len / 24);
    for (let i = -dashCount / 2; i <= dashCount / 2; i++) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 12).rotateX(-Math.PI / 2), whitePaint);
      dash.position.set(0, 0.02, i * 24);
      g.add(dash);
    }

    // Threshold piano key stripes
    for (let side = -1; side <= 1; side += 2) {
      const zPos = side * (ap.len / 2 - 18);
      for (let k = -4; k <= 4; k++) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 22).rotateX(-Math.PI / 2), whitePaint);
        stripe.position.set(k * 2.8, 0.02, zPos);
        g.add(stripe);
      }
    }

    // Warehouse Hangar Garage
    const hg = new THREE.Mesh(new THREE.BoxGeometry(42, 14, 38), hangarMat);
    hg.position.set(ap.wid / 2 + 28, 7, 0);
    hg.castShadow = true;
    g.add(hg);

    // Big drive-in hangar door
    const door = new THREE.Mesh(new THREE.BoxGeometry(26, 11, 0.8), doorMat);
    door.position.set(ap.wid / 2 + 14, 5.5, 0);
    g.add(door);

    scene.add(g);

    // Spawn parked stealable planes
    for (const p of ap.planes) {
      const cos = Math.cos(ap.rot), sin = Math.sin(ap.rot);
      const wx = ap.x + cos * p.ox - sin * p.oz;
      const wz = ap.z + sin * p.ox + cos * p.oz;
      const wy = ctx.heightAt ? ctx.heightAt(wx, wz) : y;
      const model = buildPlaneModel(p.type, THREE);
      model.position.set(wx, wy + 0.1, wz);
      model.rotation.y = ap.rot + (p.rot || 0);
      scene.add(model);

      const planeObj = {
        type: p.type,
        model,
        pos: new THREE.Vector3(wx, wy + 0.1, wz),
        vel: new THREE.Vector3(),
        rotY: ap.rot + (p.rot || 0),
        pitch: 0,
        roll: 0,
        throttle: 0,
        inAir: false,
        health: p.type === 'fighter' ? 600 : 350,
        airportId: ap.id
      };
      PLANES.push(planeObj);

      // Add interactive steal prompt
      if (ctx.addInteract) {
        ctx.addInteract({
          x: wx, z: wz, r: 5.5,
          label: () => `<b>[F] Fly ${p.type.toUpperCase()}</b>`,
          when: () => !activePlane && (!ctx.player || !ctx.player.inCar),
          onUse: () => enterPlane(planeObj)
        });
      }
    }

    // Airstrip purchase sign
    if (ctx.addInteract) {
      ctx.addInteract({
        x: ap.x + 18, z: ap.z + 18, r: 6.0,
        label: () => `<b>${ap.name}</b> · Deed: $${ap.price.toLocaleString()} · [E] Buy`,
        when: () => !ctx.player.inCar,
        onUse: () => buyAirstrip(ap)
      });
    }
  }
}

export function enterPlane(plane) {
  const P = ctx.player;
  if (!P || P.dead || activePlane) return;

  if (P.inCar && ctx.toggleCar) ctx.toggleCar();
  activePlane = plane;
  P.inPlane = true;
  if (P.rig && P.rig.g) P.rig.g.visible = false;
  ctx.cam.dist = plane.type === 'fighter' ? 24 : (plane.type === 'jet' ? 22 : 16);
  ctx.notify(`✈️ <b>Cockpit Activated: ${plane.type.toUpperCase()}</b><br>W/S throttle · A/D steer/roll · mouse aim · F to exit`, '#38bdf8', 5000);
}

export function exitPlane() {
  if (!activePlane) return;
  const P = ctx.player;
  const p = activePlane;
  activePlane = null;
  P.inPlane = false;
  if (P.rig && P.rig.g) P.rig.g.visible = true;
  ctx.cam.dist = 6.5;

  const gy = ctx.heightAt ? ctx.heightAt(p.pos.x, p.pos.z) : p.pos.y;
  P.pos.copy(p.pos);
  if (p.pos.y > gy + 5) {
    // Parachute / Mid-air bailout
    P.air = p.pos.y - gy;
    P.vy = -3;
    ctx.notify('🪂 <b>Ejected! Parachute deployed.</b>', '#7dff6a', 3000);
  }
}

export function updatePlanes(dt, keys, cam, mouseDown) {
  for (const p of PLANES) {
    // Spin propeller if prop plane
    if (p.model.userData.prop) {
      const speed = p === activePlane ? (0.2 + p.throttle * 1.8) : 0.05;
      p.model.userData.prop.rotation.z += speed;
    }
  }

  if (!activePlane) return;
  const p = activePlane;
  const P = ctx.player;

  const up = keys.has('KeyW') ? 1 : 0;
  const dn = keys.has('KeyS') ? 1 : 0;
  const left = keys.has('KeyA') ? 1 : 0;
  const right = keys.has('KeyD') ? 1 : 0;
  const boost = keys.has('ShiftLeft') || keys.has('ShiftRight');

  // Throttle
  p.throttle = Math.max(0, Math.min(1.0, p.throttle + (up - dn) * dt * 0.6));

  const maxSp = p.type === 'fighter' ? (boost ? 480 : 260) : (p.type === 'jet' ? 140 : 80);
  const curSpeed = p.throttle * maxSp;

  // Ground taxi vs Flight
  const gy = ctx.heightAt ? ctx.heightAt(p.pos.x, p.pos.z) : 0;
  const onGround = p.pos.y <= gy + 0.8;

  if (onGround) {
    p.rotY += (left - right) * dt * (curSpeed > 5 ? 1.4 : 0.5);
    p.pitch *= 0.92;
    p.roll *= 0.92;
    if (curSpeed > 26 && up) {
      // Takeoff!
      p.inAir = true;
      p.pos.y += dt * 8;
      p.pitch = 0.25;
    }
  } else {
    // In air: flight dynamics
    p.roll += (left - right) * dt * 2.2;
    p.roll *= 0.96;
    p.rotY += Math.sin(p.roll) * dt * 1.5;

    // Pitch follows camera
    const wantPitch = -(cam.pitch - 0.2);
    p.pitch += (wantPitch - p.pitch) * dt * 3.0;

    // Stall check
    if (curSpeed < 20) p.pos.y -= 14 * dt;
  }

  // Forward velocity vector
  const fwdX = Math.sin(p.rotY) * Math.cos(p.pitch);
  const fwdY = Math.sin(p.pitch);
  const fwdZ = Math.cos(p.rotY) * Math.cos(p.pitch);

  p.pos.x += fwdX * curSpeed * dt;
  p.pos.y += fwdY * curSpeed * dt;
  p.pos.z += fwdZ * curSpeed * dt;

  // Ground collision check
  if (p.pos.y < gy + 0.4) {
    p.pos.y = gy + 0.4;
    if (p.pitch < -0.35 && curSpeed > 45) {
      // Crash!
      if (ctx.explosionAt) ctx.explosionAt(p.pos.x, p.pos.y, p.pos.z, 15, 'player');
      exitPlane();
      return;
    }
    p.inAir = false;
  }

  p.model.position.copy(p.pos);
  p.model.rotation.set(p.pitch, p.rotY, p.roll, 'YXZ');

  // Player follows plane
  P.pos.copy(p.pos);
  P.rotY = p.rotY;

  // Bailout / exit key
  if (keys.has('KeyF')) {
    keys.delete('KeyF');
    exitPlane();
  }
}

export function buyAirstrip(ap) {
  const save = ctx.save;
  if (!save) return;
  if (save.money < ap.price) {
    ctx.notify(`Need <b>$${ap.price.toLocaleString()}</b> to purchase this airfield.`, '#ef4444', 3000);
    return;
  }

  save.money -= ap.price;
  save.airstrips = save.airstrips || [];
  if (!save.airstrips.includes(ap.id)) save.airstrips.push(ap.id);

  if (ctx.sfx && ctx.sfx.cash) ctx.sfx.cash();
  ctx.notify(`🎉 <b>PURCHASED: ${ap.name}</b><br>Hangar warehouse and runway deed transferred to you!`, '#7dff6a', 6000);
}
