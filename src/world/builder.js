/**
 * In-Game Construction System (Poway Automobile Online)
 *
 * Allows players to build ramps, platforms, defensive walls, multi-story villa towers,
 * cantilevered balconies, and fortress gates in the live 3D world.
 *
 * Key features:
 * - Build Upward: Stack rooms, towers, and platform slabs into multi-story sky bases.
 * - Drive & Walk Up: Ramps have physical collision for both pedestrian feet and car tires.
 * - 10-Minute Persistence: Placed structures last for 600s (10 minutes) before decaying.
 * - Destruction: Takes damage from rockets, RPGs, missiles, stickies, gunfire, and vehicle rams.
 *   Blows up into physics debris chunks and smoke when destroyed!
 * - Smart Snapping: Snaps to ground grid, adjacent edges, or directly on top of existing pieces.
 * - Multiplayer Sync: Synchronizes structure placements and destruction across all players.
 */
import * as THREE from 'three';

export function createBuilder(ctx) {
  const {
    scene,
    camera,
    player,
    keys,
    heightAt,
    explosionAt,
    notify,
    sfx,
    FX,
    bus,
    net,
    smoke,
    fire
  } = ctx;

  let active = false;
  let selectedSlot = 0;
  let rotY = 0;
  let heightOffset = 0;
  let lastPlaceTime = 0;

  // Active Placed Structures Registry
  const structures = [];
  const buildGroup = new THREE.Group();
  buildGroup.name = 'PlayerBuildSystem';
  scene.add(buildGroup);

  // Ghost Holographic Preview Mesh Group
  const ghostGroup = new THREE.Group();
  ghostGroup.name = 'BuildGhostPreview';
  ghostGroup.visible = false;
  scene.add(ghostGroup);

  // Materials
  const ghostMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.55,
    wireframe: false,
    side: THREE.DoubleSide
  });

  const ghostWireMat = new THREE.MeshBasicMaterial({
    color: 0xbae6fd,
    wireframe: true,
    transparent: true,
    opacity: 0.8
  });

  // Physical Materials for Built Pieces
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xb5afa4,
    roughness: 0.85,
    metalness: 0.05
  });

  const stuccoMat = new THREE.MeshStandardMaterial({
    color: 0xeae4d8,
    roughness: 0.9,
    metalness: 0.02
  });

  const woodDeckMat = new THREE.MeshStandardMaterial({
    color: 0x966842,
    roughness: 0.65
  });

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x33373d,
    roughness: 0.35,
    metalness: 0.75
  });

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.4,
    metalness: 0.85
  });

  const rampMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.7,
    metalness: 0.15
  });

  // =========================================================================
  // PLACEABLE ARCHETYPES (6 Modular Construction Pieces)
  // =========================================================================
  const ARCHETYPES = [
    {
      id: 'ramp',
      name: 'Vehicle & Pedestrian Ramp',
      desc: '4m x 8m with 3m rise. Drive cars & sprint up onto roofs!',
      wid: 4.0,
      len: 8.0,
      rise: 3.0,
      h: 3.0,
      maxHp: 1500,
      type: 'ramp'
    },
    {
      id: 'platform',
      name: 'Reinforced Floor Slab',
      desc: '6m x 6m horizontal floor. Stack upward for sky towers & bridges.',
      wid: 6.0,
      len: 6.0,
      h: 0.28,
      maxHp: 1800,
      type: 'platform'
    },
    {
      id: 'wall',
      name: 'Reinforced Defensive Wall',
      desc: '6m x 3.5m concrete/stucco barrier with battlements.',
      wid: 6.0,
      len: 0.35,
      h: 3.5,
      maxHp: 2200,
      type: 'wall'
    },
    {
      id: 'room',
      name: 'Spanish Villa Room / Tower',
      desc: '6m x 6m x 3.5m stackable room with arched doorway & walkable roof.',
      wid: 6.0,
      len: 6.0,
      h: 3.5,
      maxHp: 2800,
      type: 'room'
    },
    {
      id: 'balcony',
      name: 'Cantilevered Balcony Terrace',
      desc: '6m x 2.6m observation overlook with wrought-iron railings.',
      wid: 6.0,
      len: 2.6,
      h: 1.15,
      maxHp: 1200,
      type: 'balcony'
    },
    {
      id: 'bunker',
      name: 'Fortress Gate & Rampart',
      desc: '6m wide with 2.8m drivethrough archway & upper sniper embrasures.',
      wid: 6.0,
      len: 1.2,
      h: 3.8,
      maxHp: 3200,
      type: 'bunker'
    }
  ];

  // Helper: Construct Mesh for a given archetype
  function createPieceMesh(arch, isGhost = false) {
    const g = new THREE.Group();
    const cMat = isGhost ? ghostMat : concreteMat;
    const sMat = isGhost ? ghostMat : stuccoMat;
    const rMat = isGhost ? ghostMat : rampMat;
    const stMat = isGhost ? ghostMat : steelMat;
    const iMat = isGhost ? ghostMat : ironMat;
    const wMat = isGhost ? ghostMat : woodDeckMat;

    switch (arch.id) {
      case 'ramp': {
        // Sloped wedge geometry (4m wide, 8m long, 3m rise)
        const rw = arch.wid, rl = arch.len, rh = arch.rise;
        const geom = new THREE.BufferGeometry();
        const pos = [];
        const norms = [];

        const p0 = [-rw / 2, 0, 0];
        const p1 = [rw / 2, 0, 0];
        const p2 = [rw / 2, rh, rl];
        const p3 = [-rw / 2, rh, rl];
        const b2 = [rw / 2, 0, rl];
        const b3 = [-rw / 2, 0, rl];

        const addQuad = (a, b, c, d) => {
          pos.push(...a, ...b, ...c, ...a, ...c, ...d);
          const vA = new THREE.Vector3(...a), vB = new THREE.Vector3(...b), vC = new THREE.Vector3(...c);
          const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(vB, vA), new THREE.Vector3().subVectors(vC, vA)).normalize();
          for (let i = 0; i < 6; i++) norms.push(n.x, n.y, n.z);
        };

        // Incline Tread Surface
        addQuad(p0, p3, p2, p1);
        // Back Lip Wall
        addQuad(p3, b3, b2, p2);
        // Left Side
        pos.push(...p0, ...b3, ...p3);
        for (let i = 0; i < 3; i++) norms.push(-1, 0, 0);
        // Right Side
        pos.push(...p1, ...p2, ...b2);
        for (let i = 0; i < 3; i++) norms.push(1, 0, 0);

        geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));

        const mesh = new THREE.Mesh(geom, rMat);
        mesh.castShadow = mesh.receiveShadow = !isGhost;
        g.add(mesh);

        // Guard rails along the incline sides
        if (!isGhost) {
          for (const sx of [-rw / 2, rw / 2]) {
            const railG = new THREE.BoxGeometry(0.08, 0.4, rl);
            const rail = new THREE.Mesh(railG, stMat);
            rail.position.set(sx, rh / 2 + 0.2, rl / 2);
            rail.rotation.x = Math.atan2(rh, rl);
            rail.castShadow = true;
            g.add(rail);
          }
        }
        break;
      }

      case 'platform': {
        // Reinforced Floor Slab (6m x 6m x 0.28m)
        const slab = new THREE.Mesh(new THREE.BoxGeometry(arch.wid, 0.28, arch.len), cMat);
        slab.position.y = 0.14;
        slab.castShadow = slab.receiveShadow = !isGhost;
        g.add(slab);

        if (!isGhost) {
          // Perimeter Structural Steel Beams
          const beamZ1 = new THREE.Mesh(new THREE.BoxGeometry(arch.wid, 0.24, 0.12), stMat);
          beamZ1.position.set(0, -0.05, -arch.len / 2 + 0.06);
          const beamZ2 = beamZ1.clone();
          beamZ2.position.z = arch.len / 2 - 0.06;
          g.add(beamZ1, beamZ2);
        }
        break;
      }

      case 'wall': {
        // Reinforced Defensive Wall (6m wide, 3.5m high, 0.35m thick)
        const wall = new THREE.Mesh(new THREE.BoxGeometry(arch.wid, arch.h, arch.len), sMat);
        wall.position.y = arch.h / 2;
        wall.castShadow = wall.receiveShadow = !isGhost;
        g.add(wall);

        // Top Crenelated Battlements / Parapet Cap
        if (!isGhost) {
          const cap = new THREE.Mesh(new THREE.BoxGeometry(arch.wid + 0.12, 0.16, arch.len + 0.12), cMat);
          cap.position.y = arch.h + 0.08;
          cap.castShadow = true;
          g.add(cap);

          // Crenels
          for (let cx = -arch.wid * 0.4; cx <= arch.wid * 0.4; cx += 1.4) {
            const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, arch.len + 0.12), cMat);
            merlon.position.set(cx, arch.h + 0.35, 0);
            merlon.castShadow = true;
            g.add(merlon);
          }
        }
        break;
      }

      case 'room': {
        // Stackable Spanish Villa Room Unit (6m x 6m x 3.5m)
        const rw = arch.wid, rl = arch.len, rh = arch.h;
        const th = 0.3;

        // Walkable Floor Slab
        const floor = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.22, rl), cMat);
        floor.position.y = 0.11;
        floor.receiveShadow = !isGhost;

        // Walkable Ceiling / Upper Deck Slab
        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.24, rl), cMat);
        ceiling.position.y = rh - 0.12;
        ceiling.castShadow = ceiling.receiveShadow = !isGhost;
        g.add(floor, ceiling);

        // Left & Right Walls
        const wallL = new THREE.Mesh(new THREE.BoxGeometry(th, rh, rl), sMat);
        wallL.position.set(-rw / 2 + th / 2, rh / 2, 0);
        const wallR = wallL.clone();
        wallR.position.x = rw / 2 - th / 2;
        wallL.castShadow = wallR.castShadow = !isGhost;
        g.add(wallL, wallR);

        // Back Wall
        const wallB = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, th), sMat);
        wallB.position.set(0, rh / 2, rl / 2 - th / 2);
        wallB.castShadow = !isGhost;
        g.add(wallB);

        // Front Wall with Central Arched Passage
        const sideW = (rw - 2.2) / 2;
        const frontL = new THREE.Mesh(new THREE.BoxGeometry(sideW, rh, th), sMat);
        frontL.position.set(-rw / 2 + sideW / 2, rh / 2, -rl / 2 + th / 2);
        const frontR = frontL.clone();
        frontR.position.x = rw / 2 - sideW / 2;

        const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.2, rh - 2.4, th), sMat);
        lintel.position.set(0, 2.4 + (rh - 2.4) / 2, -rl / 2 + th / 2);
        g.add(frontL, frontR, lintel);

        // Roof Parapet Railing so players don't fall off ceiling deck
        if (!isGhost) {
          const parapetF = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.65, 0.15), sMat);
          parapetF.position.set(0, rh + 0.32, -rl / 2 + 0.08);
          const parapetB = parapetF.clone();
          parapetB.position.z = rl / 2 - 0.08;
          g.add(parapetF, parapetB);
        }
        break;
      }

      case 'balcony': {
        // Cantilevered Balcony Platform (6m x 2.6m x 1.15m)
        const slab = new THREE.Mesh(new THREE.BoxGeometry(arch.wid, 0.25, arch.len), wMat);
        slab.position.y = 0.125;
        slab.castShadow = slab.receiveShadow = !isGhost;
        g.add(slab);

        // Wrought-Iron Perimeter Railing (Front and Sides)
        const railH = arch.h;
        const topRailF = new THREE.Mesh(new THREE.BoxGeometry(arch.wid, 0.05, 0.05), iMat);
        topRailF.position.set(0, railH, -arch.len / 2 + 0.04);
        g.add(topRailF);

        if (!isGhost) {
          const spindles = 12;
          for (let s = 0; s <= spindles; s++) {
            const sx = (s / spindles - 0.5) * (arch.wid - 0.2);
            const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, railH - 0.2, 6), iMat);
            spindle.position.set(sx, railH / 2 + 0.1, -arch.len / 2 + 0.04);
            spindle.castShadow = true;
            g.add(spindle);
          }
          // Side Railings
          for (const sd of [-1, 1]) {
            const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, arch.len), iMat);
            sideRail.position.set(sd * (arch.wid / 2 - 0.04), railH, 0);
            g.add(sideRail);
          }
        }
        break;
      }

      case 'bunker': {
        // Heavy Fortress Gate with 2.8m Vehicle Drivethrough Archway (6m wide, 3.8m high)
        const rw = arch.wid, rl = arch.len, rh = arch.h;
        const gateW = 2.8, gateH = 2.7;
        const postW = (rw - gateW) / 2;

        const postL = new THREE.Mesh(new THREE.BoxGeometry(postW, rh, rl), cMat);
        postL.position.set(-rw / 2 + postW / 2, rh / 2, 0);
        const postR = postL.clone();
        postR.position.x = rw / 2 - postW / 2;

        const archLintel = new THREE.Mesh(new THREE.BoxGeometry(gateW, rh - gateH, rl), cMat);
        archLintel.position.set(0, gateH + (rh - gateH) / 2, 0);
        g.add(postL, postR, archLintel);

        // Upper Walkable Sniper Rampart with Firing Embrasures
        if (!isGhost) {
          const rampartSlab = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.25, rl + 0.8), cMat);
          rampartSlab.position.set(0, rh + 0.12, 0);
          rampartSlab.castShadow = rampartSlab.receiveShadow = true;

          const parapet = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.85, 0.2), cMat);
          parapet.position.set(0, rh + 0.55, -rl / 2 - 0.3);
          g.add(rampartSlab, parapet);
        }
        break;
      }
    }

    if (isGhost) {
      const parts = [];
      g.traverse(o => { if (o.isMesh) parts.push(o); });
      for (const o of parts) {
        o.material = ghostMat;
        // Add wireframe overlay for high-tech holographic preview (a child of the part, so it sits where the part does)
        const wire = new THREE.Mesh(o.geometry, ghostWireMat);
        wire.scale.setScalar(1.002);
        o.add(wire);
      }
    }

    return g;
  }

  // Build HUD Elements
  const hudContainer = document.createElement('div');
  hudContainer.id = 'builder-hud';
  hudContainer.style.cssText = `
    position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(16px);
    border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 14px;
    padding: 10px 18px; display: none; align-items: center; gap: 12px;
    z-index: 9999; box-shadow: 0 12px 40px rgba(0,0,0,0.65);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f8fafc; user-select: none;
  `;

  ARCHETYPES.forEach((arch, idx) => {
    const itemBtn = document.createElement('div');
    itemBtn.className = `build-item-slot slot-${idx}`;
    itemBtn.style.cssText = `
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
      background: #1e293b; cursor: pointer; transition: all 0.15s ease; min-width: 60px;
    `;
    itemBtn.innerHTML = `
      <span style="font-size: 10px; font-weight: 800; color: #38bdf8;">[${idx + 1}]</span>
      <span style="font-size: 11px; font-weight: 700; white-space: nowrap;">${arch.name.split(' ')[0]}</span>
    `;
    itemBtn.addEventListener('click', () => selectSlot(idx));
    hudContainer.appendChild(itemBtn);
  });

  const hintsDiv = document.createElement('div');
  hintsDiv.style.cssText = `
    border-left: 1px solid rgba(255,255,255,0.15); padding-left: 14px;
    display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #94a3b8;
  `;
  hintsDiv.innerHTML = `
    <div><b style="color: #fff;">[LMB]</b> Place &nbsp; <b style="color: #fff;">[R]</b> Rotate 90° &nbsp; <b style="color: #fff;">[Q/E]</b> Height ±3m</div>
    <div><b style="color: #38bdf8;">Auto-Snaps</b> to roofs, tops & edges &nbsp; <b style="color: #e2e8f0;">[B]</b> Exit</div>
  `;
  hudContainer.appendChild(hintsDiv);
  document.body.appendChild(hudContainer);

  function selectSlot(idx) {
    if (idx < 0 || idx >= ARCHETYPES.length) return;
    selectedSlot = idx;

    // Update Ghost Mesh
    while (ghostGroup.children.length > 0) {
      const child = ghostGroup.children[0];
      ghostGroup.remove(child);
      child.traverse(o => { if (o.geometry) o.geometry.dispose(); }); // the ghost's materials are shared (ghostMat, ghostWireMat)
    }
    const newGhost = createPieceMesh(ARCHETYPES[selectedSlot], true);
    ghostGroup.add(newGhost);

    // Update HUD selection styling
    document.querySelectorAll('.build-item-slot').forEach((el, i) => {
      if (i === selectedSlot) {
        el.style.borderColor = '#38bdf8';
        el.style.background = 'rgba(56, 189, 248, 0.25)';
      } else {
        el.style.borderColor = 'rgba(255,255,255,0.1)';
        el.style.background = '#1e293b';
      }
    });

    if (sfx && sfx.menu) sfx.menu();
  }

  function toggleBuildMode() {
    active = !active;
    ghostGroup.visible = active;
    hudContainer.style.display = active ? 'flex' : 'none';
    if (active) {
      selectSlot(selectedSlot);
      notify('🔨 Build Mode Active: [1-6] Select, [LMB] Place, [B] Exit', '#38bdf8', 2500);
      if (sfx && sfx.whoosh) sfx.whoosh(0.5);
    } else {
      notify('Build Mode Closed', '', 1200);
    }
  }

  // =========================================================================
  // SMART SNAPPING & PLACEMENT CALCULATION
  // =========================================================================
  const _targetPos = new THREE.Vector3();
  const _camDir = new THREE.Vector3();

  function calcPlacementPos() {
    camera.getWorldDirection(_camDir);
    _camDir.y = 0;
    _camDir.normalize();

    // Base target distance ahead of player
    const dist = 6.5;
    const rawX = player.pos.x + _camDir.x * dist;
    const rawZ = player.pos.z + _camDir.z * dist;

    const arch = ARCHETYPES[selectedSlot];

    // Check if aiming near an existing placed structure for upward stacking / edge snapping
    let snapped = false;
    for (const b of structures) {
      const dx = rawX - b.pos.x;
      const dz = rawZ - b.pos.z;
      const d = Math.hypot(dx, dz);

      // Top Snapping (Building Upward!): Snap directly onto top of structure
      if (d < 3.2 && player.pos.y >= b.pos.y - 1.0) {
        _targetPos.set(b.pos.x, b.pos.y + b.h + heightOffset, b.pos.z);
        snapped = true;
        break;
      }

      // Edge Snapping (Chaining platforms, ramps, or walls)
      if (d < 5.5 && Math.abs(player.pos.y - b.pos.y) < 2.5) {
        const snapStep = (b.wid + arch.wid) / 2;
        // Snap along cardinal directions of existing piece
        const cos = b.cos, sin = b.sin;
        const relX = cos * dx + sin * dz;
        const relZ = -sin * dx + cos * dz;

        let snapRelX = 0, snapRelZ = 0;
        if (Math.abs(relX) > Math.abs(relZ)) {
          snapRelX = Math.sign(relX) * snapStep;
        } else {
          snapRelZ = Math.sign(relZ) * ((b.len + arch.len) / 2);
        }

        _targetPos.set(
          b.pos.x + cos * snapRelX - sin * snapRelZ,
          b.pos.y + heightOffset,
          b.pos.z + sin * snapRelX + cos * snapRelZ
        );
        snapped = true;
        break;
      }
    }

    if (!snapped) {
      // 2m Grid Snapping on Terrain
      const grid = 2.0;
      const gx = Math.round(rawX / grid) * grid;
      const gz = Math.round(rawZ / grid) * grid;
      const gy = heightAt(gx, gz);
      _targetPos.set(gx, gy + heightOffset, gz);
    }

    return _targetPos;
  }

  // =========================================================================
  // PLACE STRUCTURE
  // =========================================================================
  function placeCurrent(remoteData = null) {
    const arch = remoteData ? ARCHETYPES.find(a => a.id === remoteData.type) : ARCHETYPES[selectedSlot];
    if (!arch) return null;

    const pos = remoteData ? new THREE.Vector3(...remoteData.pos) : calcPlacementPos().clone();
    const rY = remoteData ? remoteData.rotY : rotY;
    const simTime = ctx.clock ? ctx.clock.simTime : Date.now() / 1000;

    const mesh = createPieceMesh(arch, false);
    mesh.position.copy(pos);
    mesh.rotation.y = rY;
    buildGroup.add(mesh);

    const b = {
      id: remoteData ? remoteData.id : `bld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: arch.name,
      type: arch.id,
      pos,
      rotY: rY,
      wid: arch.wid,
      len: arch.len,
      h: arch.h,
      rise: arch.rise || 0,
      cos: Math.cos(rY), sin: Math.sin(rY), // its turn, once: surfaceAt / collide run for every ground sample
      rad: Math.hypot(arch.wid / 2, arch.len) + 0.3, // bounding circle around pos (a ramp starts at pos and runs len)
      hp: remoteData ? remoteData.hp : arch.maxHp,
      maxHp: arch.maxHp,
      builtAt: simTime,
      decayAt: remoteData ? remoteData.decayAt : simTime + 600, // 10 MINUTES LIFETIME!
      mesh,
      dead: false
    };

    structures.push(b);

    if (!remoteData) {
      notify(`🔨 Placed ${arch.name} (Stays 10 min)`, '#10b981', 2000);
      if (sfx && sfx.punch) sfx.punch(0.8);

      // Dust / placement effect at base corners
      if (smoke) {
        for (let i = 0; i < 4; i++) {
          smoke.emit(pos.x + (Math.random() - 0.5) * arch.wid, pos.y + 0.1, pos.z + (Math.random() - 0.5) * arch.len, 0, 0.4, 0, 0.6, 0.8, 0.8, 0.75, 0.7, 0.8);
        }
      }

      // Broadcast to online peers
      if (net && net.sendEvent) {
        net.sendEvent('place_build', {
          id: b.id,
          type: b.type,
          pos: [pos.x, pos.y, pos.z],
          rotY: b.rotY,
          hp: b.hp,
          decayAt: b.decayAt
        });
      }
    }

    return b;
  }

  // =========================================================================
  // DESTRUCTION & EXPLOSIONS ("until it gets blown up or something")
  // =========================================================================
  function destroyStructure(b, by = 'explosion') {
    if (typeof b === 'string') b = structures.find(s => s.id === b);
    if (!b || b.dead) return;
    b.dead = true;

    const idx = structures.indexOf(b);
    if (idx >= 0) structures.splice(idx, 1);

    // Remove Visual Mesh
    buildGroup.remove(b.mesh);
    b.mesh.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });

    // Big Destruction Effects: Fireball, Plume, Flying Debris Chunks!
    if (FX && FX.explosion) {
      FX.explosion(b.pos.x, b.pos.y + b.h / 2, b.pos.z, 6);
    }
    if (FX && FX.plume) {
      FX.plume(b.pos.x, b.pos.y + b.h, b.pos.z, 14, 0.8);
    }
    if (sfx && sfx.boom) {
      sfx.boom(1.2);
    }

    notify(`💥 ${b.name} was blown up!`, '#ef4444', 2200);

    // Broadcast Destruction over network
    if (net && net.sendEvent && by !== 'net') {
      net.sendEvent('destroy_build', { id: b.id });
    }
  }

  function damageStructure(b, dmg, by = 'player') {
    if (b.dead) return;
    b.hp -= dmg;

    // Small impact smoke/dust puff
    if (smoke) {
      smoke.emit(b.pos.x, b.pos.y + b.h / 2, b.pos.z, 0, 0.6, 0, 0.5, 0.6, 0.8, 0.75, 0.7, 0.8);
    }

    if (b.hp <= 0) {
      destroyStructure(b, by);
    }
  }

  function onExplosion(x, y, z, R, by = 'player') {
    for (let i = structures.length - 1; i >= 0; i--) {
      const b = structures[i];
      const dx = b.pos.x - x, dz = b.pos.z - z;
      const dist = Math.hypot(dx, dz);
      const reach = R * 1.5 + Math.max(b.wid, b.len) / 2;

      if (dist < reach) {
        const factor = Math.max(0.1, 1 - dist / reach);
        const dmg = 2200 * factor;
        damageStructure(b, dmg, by);
      }
    }
  }

  // =========================================================================
  // SURFACE & COLLISION HOOKS (Walking & Driving Upward)
  // =========================================================================
  /**
   * Evaluates the highest walkable built surface at (x, z).
   * Supports ramps (smooth gradient) and flat platforms / roofs / slabs.
   */
  function surfaceAt(x, z, currentY) {
    let bestH = -1e9;

    for (const b of structures) {
      if (b.dead) continue;

      const dx = x - b.pos.x, dz = z - b.pos.z;
      if (dx * dx + dz * dz > b.rad * b.rad) continue;
      const cos = b.cos, sin = b.sin;
      // Transform into local piece coordinates
      const u = -sin * dx + cos * dz; // Along length
      const w = cos * dx + sin * dz;  // Along width

      if (b.type === 'ramp') {
        // Ramp incline bounds: 0 <= u <= len, |w| <= wid/2
        if (u >= -0.2 && u <= b.len + 0.2 && Math.abs(w) <= b.wid / 2 + 0.2) {
          const t = Math.max(0, Math.min(1, u / b.len));
          const h = b.pos.y + b.rise * t;
          if (currentY === undefined || h <= currentY + 0.7) {
            bestH = Math.max(bestH, h);
          }
        }
      } else {
        // Platform, Room, Balcony, Bunker horizontal surface bounds
        const halfW = b.wid / 2 + 0.15;
        const halfL = b.len / 2 + 0.15;
        if (Math.abs(w) <= halfW && Math.abs(u) <= halfL) {
          // Walkable top surface
          const topY = b.pos.y + (b.type === 'platform' ? 0.28 : b.h);
          if (currentY === undefined || topY <= currentY + 0.8) {
            bestH = Math.max(bestH, topY);
          }
        }
      }
    }

    return bestH;
  }

  /**
   * Lateral wall collision checker for player and vehicles.
   */
  function collide(pos, r, y) {
    let hit = null;

    for (const b of structures) {
      if (b.dead) continue;
      // If above structure top or below base, no collision
      if (y !== undefined && (y > b.pos.y + b.h - 0.1 || y < b.pos.y - 0.2)) continue;

      // Check wall and room perimeter boxes
      if (b.type === 'wall' || b.type === 'room' || b.type === 'bunker') {
        const dx = pos.x - b.pos.x, dz = pos.z - b.pos.z, R = b.rad + r * 1.5;
        if (dx * dx + dz * dz > R * R) continue;
        const cos = b.cos, sin = b.sin;
        const u = -sin * dx + cos * dz;
        const w = cos * dx + sin * dz;

        const halfW = b.wid / 2 + r;
        const halfL = b.len / 2 + r;

        if (Math.abs(w) < halfW && Math.abs(u) < halfL) {
          // Penetration along local axes
          const penW = halfW - Math.abs(w);
          const penL = halfL - Math.abs(u);

          let pushW = 0, pushL = 0;
          if (penW < penL) {
            pushW = Math.sign(w) * penW;
          } else {
            pushL = Math.sign(u) * penL;
          }

          // Transform back to world space
          pos.x += cos * pushW - sin * pushL;
          pos.z += sin * pushW + cos * pushL;

          hit = { x: cos * Math.sign(pushW), z: sin * Math.sign(pushL), depth: Math.min(penW, penL) };
        }
      }
    }

    return hit;
  }

  /**
   * Raycast check against structures for weapon fire / hitscan.
   */
  function raycast(origin, dir, maxD) {
    let best = { t: maxD, build: null };

    for (const b of structures) {
      if (b.dead) continue;
      const dx = b.pos.x - origin.x, dz = b.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > maxD + b.wid) continue;

      // Approximate bounding sphere hit
      const cy = b.pos.y + b.h / 2;
      const radius = Math.max(b.wid, b.len, b.h) * 0.75;
      const ocX = origin.x - b.pos.x, ocY = origin.y - cy, ocZ = origin.z - b.pos.z;
      const bProj = ocX * dir.x + ocY * dir.y + ocZ * dir.z;
      const cProj = ocX * ocX + ocY * ocY + ocZ * ocZ - radius * radius;
      const disc = bProj * bProj - cProj;

      if (disc >= 0) {
        const t = -bProj - Math.sqrt(disc);
        if (t > 0 && t < best.t) {
          best = { t, build: b };
        }
      }
    }

    return best;
  }

  // =========================================================================
  // UPDATE TICK LOOP
  // =========================================================================
  function update(dt) {
    const simTime = ctx.clock ? ctx.clock.simTime : Date.now() / 1000;

    // 1. Process 10-Minute Persistence & Decay Countdown
    for (let i = structures.length - 1; i >= 0; i--) {
      const b = structures[i];
      if (simTime >= b.decayAt) {
        // 10 minutes reached: crumble and decay
        if (smoke) {
          smoke.emit(b.pos.x, b.pos.y + b.h / 2, b.pos.z, 0, 0.8, 0, 1.0, 1.2, 0.8, 0.75, 0.7, 1.0);
        }
        buildGroup.remove(b.mesh);
        b.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        structures.splice(i, 1);
        notify(`⏳ ${b.name} decayed after 10 minutes.`, '#94a3b8', 2200);
      }
    }

    // 2. Handle Key Input while in Build Mode
    if (active) {
      // Rotation: R key rotates 90 degrees
      if (keys.has('KeyR')) {
        keys.delete('KeyR');
        rotY = (rotY + Math.PI / 2) % (Math.PI * 2);
        if (sfx && sfx.menu) sfx.menu();
      }

      // Height Adjustment: Q down 3m, E up 3m
      if (keys.has('KeyQ')) {
        keys.delete('KeyQ');
        heightOffset = Math.max(-6, heightOffset - 3.0);
        notify(`Height Offset: ${heightOffset >= 0 ? '+' : ''}${heightOffset.toFixed(1)}m`, '#38bdf8', 1000);
      }
      if (keys.has('KeyE')) {
        keys.delete('KeyE');
        heightOffset = Math.min(18, heightOffset + 3.0);
        notify(`Height Offset: ${heightOffset >= 0 ? '+' : ''}${heightOffset.toFixed(1)}m`, '#38bdf8', 1000);
      }

      // Number keys 1-6 for quick slot selection
      for (let num = 1; num <= 6; num++) {
        if (keys.has(`Digit${num}`)) {
          keys.delete(`Digit${num}`);
          selectSlot(num - 1);
        }
      }

      // Update Ghost Mesh Transform
      const p = calcPlacementPos();
      ghostGroup.position.copy(p);
      ghostGroup.rotation.y = rotY;

      // Pulsing holographic effect
      const pulse = 0.45 + Math.sin(simTime * 6) * 0.15;
      ghostMat.opacity = pulse;
    }
  }

  // Handle Player Click to Build
  function onPointerDown(e) {
    if (!active) return;
    if (e.button === 0) { // Left Click: Place Structure!
      const now = performance.now();
      if (now - lastPlaceTime > 250) { // 250ms debouncing
        lastPlaceTime = now;
        placeCurrent();
      }
    } else if (e.button === 2) { // Right Click: Exit Build Mode
      toggleBuildMode();
    }
  }

  window.addEventListener('pointerdown', onPointerDown);

  // Network Event Listeners
  if (bus) {
    bus.on('net:place_build', data => {
      placeCurrent(data);
    });
    bus.on('net:destroy_build', data => {
      const b = structures.find(s => s.id === data.id);
      if (b) destroyStructure(b, 'net');
    });
  }

  return {
    get active() { return active; },
    toggle: toggleBuildMode,
    selectSlot,
    placeCurrent,
    surfaceAt,
    collide,
    raycast,
    onExplosion,
    damageStructure,
    destroyStructure,
    update,
    get structures() { return structures; }
  };
}
