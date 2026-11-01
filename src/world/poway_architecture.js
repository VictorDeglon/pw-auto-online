/**
 * Poway Architecture & Interior Ecosystem (AAA Real-Time World System)
 *
 * Implements strict architectural grammar, distinct zoning, furnished interiors,
 * transparent windows, illuminated 3D logos, authentic curbs/sidewalks, and smooth
 * interior camera movement.
 *
 * ZONING & TYPOLOGY:
 * 1. Big-Box Commercial / Industrial Retail (Carmel Mountain & Poway Rd):
 *    - (Target: drawn by the building generator on its real footprint, src/world/bldgen.js.)
 *    - (Walmart: drawn by the building generator on its real footprint, src/world/bldgen.js.)
 *    - Costco Wholesale: Industrial corrugated steel, 3D red/blue typography logo, multi-tier pallet racking towers,
 *      food court counter with pizza ovens and wholesale staging.
 *
 * 2. Strip Plaza Retail & Dining:
 *    - (Subway, Great Clips: their shops are the map's own buildings, drawn by the building generator.)
 *    - Starbucks / Cafe: Round siren medallion, dual espresso machines, glass pastry showcase, bistro seating.
 *
 * 3. Residential Houses (Green Valley, Midland, High Valley, Silverwood):
 *    - Spanish Colonial Villa, California Modern Ranch, Contemporary Luxury Box.
 *    - Furnished open-concept living rooms, kitchen islands, bedroom suites.
 *    - Scaled with amplification (3.4m ceiling height, wide openings) so it never feels cramped.
 *    - Transparent glass windows with outdoor and indoor visibility.
 *
 * 4. Interior Camera Movement:
 *    - Seamless over-the-shoulder interior zoom (2.0m dist) with ceiling and wall collision clamping.
 */
import * as THREE from 'three';
import { brandLogo } from './plazas/brands.js';

export function createPowayArchitecture(ctx) {
  const { THREE, scene, camera, player, heightAt, sfx, notify, addInteract, hour } = ctx;

  const group = new THREE.Group();
  group.name = 'PowayArchitectureWorld';
  scene.add(group);

  const majorPlazas = null; // (the five hand-built plaza shells stood over the map's own buildings: the shops are drawn on those, src/world/shops.js)

  // Material Palette
  const canvasTextures = new Map();
  function getCanvasTexture(key, drawFn, w = 512, h = 512) {
    if (canvasTextures.has(key)) return canvasTextures.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d');
    drawFn(g, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    canvasTextures.set(key, tex);
    return tex;
  }

  // --- Brand Logos (Procedural Canvas Textures) ---
  // the chains' marks, as parodies (./plazas/brands.js): drawn to the shape of what they go on
  const costcoLogoTex = brandLogo(THREE, 'costco', 2);

  // Base Physical Materials
  const concreteFloorMat = new THREE.MeshStandardMaterial({ color: 0x8e8d88, roughness: 0.4, metalness: 0.1 });
  const tileFloorMat = new THREE.MeshStandardMaterial({ color: 0xd4cebe, roughness: 0.3, metalness: 0.05 });
  const woodFloorMat = new THREE.MeshStandardMaterial({ color: 0x8a5d3b, roughness: 0.35, metalness: 0.05 });
  const ceilingGridMat = new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.8 }); // Dark open warehouse/shop ceiling
  const plasterWallMat = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.9 });
  const beigeCommercialWallMat = new THREE.MeshStandardMaterial({ color: 0xd8d3c5, roughness: 0.85 });
  const metalFrameMat = new THREE.MeshStandardMaterial({ color: 0x2b3035, roughness: 0.3, metalness: 0.8 });
  const stainlessSteelMat = new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.2, metalness: 0.9 });
  const redBollardMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.4 });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x9c9991, roughness: 0.9 });

  // SEE-THROUGH PHYSICAL WINDOW GLASS MATERIAL
  const seeThroughGlassMat = new THREE.MeshStandardMaterial({ // not transmission: that redraws the whole scene
    color: 0x334e68,
    transparent: true,
    opacity: 0.3,
    roughness: 0.04,
    metalness: 0.6,
    depthWrite: false
  });

  // Registry of all custom landmark buildings with furnished interiors
  const activeBuildings = [];
  const interiorBounds = []; // { minX, maxX, minZ, maxZ, floorY, ceilY, name }

  // Helper: Create Concrete Curb and Sidewalk around perimeter
  function createCurbSidewalk(parent, w, d, floorY) {
    const sidewalkW = w + 4.0;
    const sidewalkD = d + 4.0;
    const walkGeom = new THREE.BoxGeometry(sidewalkW, 0.18, sidewalkD);
    const sidewalk = new THREE.Mesh(walkGeom, curbMat);
    sidewalk.position.set(0, floorY + 0.09, 0);
    sidewalk.receiveShadow = true;
    parent.add(sidewalk);

    // Bevelled Perimeter Curb
    const curbBorder = new THREE.Mesh(
      new THREE.BoxGeometry(sidewalkW + 0.4, 0.22, sidewalkD + 0.4),
      new THREE.MeshStandardMaterial({ color: 0x7c7870, roughness: 0.95 })
    );
    curbBorder.position.set(0, floorY + 0.06, 0);
    curbBorder.receiveShadow = true;
    parent.add(curbBorder);
  }

  // (the Target that stood here, a box on top of the plaza's shops, is now drawn on its real footprint on Pomerado Road
  // by the building generator: src/world/bldgen.js MAPLESS_STORES)

  // =========================================================================
  // 2. BIG-BOX COMMERCIAL: COSTCO WHOLESALE (Carmel Mountain Plaza)
  // =========================================================================
  function buildCostcoWholesale() {
    const cx = -4259.9, cz = -2639.7;
    const floorY = heightAt(cx, cz);
    const bW = 96.0, bD = 84.0, bH = 10.2;

    const bGroup = new THREE.Group();
    bGroup.name = 'Costco_Wholesale';
    bGroup.position.set(cx, floorY, cz);

    createCurbSidewalk(bGroup, bW, bD, 0);

    // Industrial Gray Concrete Floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), concreteFloorMat);
    floor.position.y = 0.15;
    floor.receiveShadow = true;
    bGroup.add(floor);

    // High Steel Truss Roof Deck
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), ceilingGridMat);
    ceiling.position.y = bH - 0.15;
    bGroup.add(ceiling);

    // Exterior Steel Sandwich Panels
    const extMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.6, metalness: 0.3 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, 0.6), extMat);
    backWall.position.set(0, bH / 2, bD / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, bH, bD), extMat);
    leftWall.position.set(-bW / 2, bH / 2, 0);
    const rightWall = leftWall.clone();
    rightWall.position.x = bW / 2;
    bGroup.add(backWall, leftWall, rightWall);

    // Front Wall with Entrance & Exit Portals
    const frontL = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.35, bH, 0.6), extMat);
    frontL.position.set(-bW * 0.325, bH / 2, -bD / 2);
    const frontR = frontL.clone();
    frontR.position.x = bW * 0.325;
    bGroup.add(frontL, frontR);

    // High See-Through Entrance Glazing
    const glassW = bW * 0.3, glassH = 5.2;
    const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(glassW, glassH), seeThroughGlassMat);
    glassMesh.position.set(0, glassH / 2 + 0.1, -bD / 2 - 0.02);
    bGroup.add(glassMesh);

    // 3D Illuminated "Costco WHOLESALE" Sign
    const signMat = new THREE.MeshStandardMaterial({
      map: costcoLogoTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: costcoLogoTex,
      emissiveIntensity: 0.8,
      roughness: 0.3
    });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(16.0, 8.0), signMat);
    signMesh.position.set(0, bH - 1.8, -bD / 2 - 0.4);
    signMesh.rotation.y = Math.PI; // a plane faces +z: turn it to the street (-z)
    bGroup.add(signMesh);

    // --- FURNISHED INTERIOR: Massive Pallet Rack Towers & Wholesale Staging ---
    const rackOrangeMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.5 });
    const rackBlueMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 });

    // Multi-tier Pallet Racking Rows
    for (let rx = -bW * 0.38; rx <= bW * 0.38; rx += 11.0) {
      for (let rz = -bD * 0.1; rz <= bD * 0.38; rz += 16.0) {
        // Upright Steel Columns
        for (const cz of [-6.0, 0, 6.0]) {
          const colL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 6.5, 0.18), rackBlueMat);
          colL.position.set(rx - 1.1, 3.25, rz + cz);
          const colR = colL.clone();
          colR.position.x = rx + 1.1;
          bGroup.add(colL, colR);
        }

        // Horizontal Orange Load Beams
        for (let tier = 1.6; tier <= 5.5; tier += 1.8) {
          const beam1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 12.0), rackOrangeMat);
          beam1.position.set(rx - 1.1, tier, rz);
          const beam2 = beam1.clone();
          beam2.position.x = rx + 1.1;

          // Wooden Pallets loaded with Bulk Inventory
          const palletMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 });
          for (let pz = -4.5; pz <= 4.5; pz += 3.0) {
            const pallet = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 2.4), palletMat);
            pallet.position.set(rx, tier + 0.08, rz + pz);

            const bulkBox = new THREE.Mesh(
              new THREE.BoxGeometry(1.8, 1.2, 2.2),
              new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 })
            );
            bulkBox.position.set(rx, tier + 0.75, rz + pz);
            bGroup.add(pallet, bulkBox);
          }
          bGroup.add(beam1, beam2);
        }
      }
    }

    // Costco Food Court Counter (Hot Dogs & Pizza Slice Counter)
    const fcCounter = new THREE.Mesh(
      new THREE.BoxGeometry(14.0, 1.1, 2.2),
      stainlessSteelMat
    );
    fcCounter.position.set(-bW * 0.32, 0.55, -bD * 0.32);

    // Pizza Warmer Showcase
    const warmer = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.8, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xffaa00, emissiveIntensity: 0.6 })
    );
    warmer.position.set(-bW * 0.32, 1.5, -bD * 0.32);
    bGroup.add(fcCounter, warmer);

    group.add(bGroup);

    interiorBounds.push({
      minX: cx - bW / 2 + 0.5,
      maxX: cx + bW / 2 - 0.5,
      minZ: cz - bD / 2 + 0.5,
      maxZ: cz + bD / 2 - 0.5,
      floorY,
      ceilY: floorY + bH,
      name: 'Costco Wholesale'
    });
  }

  // (the Walmart that stood here, a box over the store's own footprint, is drawn by the building generator: the mapped
  // Walmart on Poway Road, src/world/bldgen.js BOX_BRANDS)

  // (the Subway and Great Clips that stood here were boxes over shops the map already has: the Carmel Mountain strip and
  // the Twin Peaks plaza next to Target; those buildings are drawn by the building generator)

  // =========================================================================
  // 6. RESIDENTIAL HOMES AROUND POWAY (Furnished, Spacious, To Scale)
  // =========================================================================
  function buildResidentialHome(cx, cz, style = 'spanish') {
    const floorY = heightAt(cx, cz);
    // Amplified scale: generous 18m x 15m footprint with 3.5m ceiling height
    const bW = 18.0, bD = 15.0, bH = 3.6;

    const bGroup = new THREE.Group();
    bGroup.name = `Home_${style}_${Math.round(cx)}_${Math.round(cz)}`;
    bGroup.position.set(cx, floorY, cz);

    createCurbSidewalk(bGroup, bW, bD, 0);

    // Warm Hardwood Flooring
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.25, bD), woodFloorMat);
    floor.position.y = 0.125;
    floor.receiveShadow = true;
    bGroup.add(floor);

    // Smooth Plaster Ceiling
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.25, bD), plasterWallMat);
    ceiling.position.y = bH - 0.125;
    bGroup.add(ceiling);

    // Exterior Perimeter Walls with Punched Window Openings
    const wallCol = style === 'spanish' ? 0xeae4d8 : style === 'modern' ? 0xf8f9fa : 0xd6c2a8;
    const stuccoMat = new THREE.MeshStandardMaterial({ color: wallCol, roughness: 0.9 });

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, 0.35), stuccoMat);
    backWall.position.set(0, bH / 2, bD / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.35, bH, bD), stuccoMat);
    leftWall.position.set(-bW / 2, bH / 2, 0);
    const rightWall = leftWall.clone();
    rightWall.position.x = bW / 2;
    bGroup.add(backWall, leftWall, rightWall);

    // Front Wall with Door Opening & Living Room Picture Window
    const frontL = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.38, bH, 0.35), stuccoMat);
    frontL.position.set(-bW * 0.31, bH / 2, -bD / 2);
    const frontR = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.42, bH, 0.35), stuccoMat);
    frontR.position.set(bW * 0.29, bH / 2, -bD / 2);

    // Front Living Room Picture Window (SEE-THROUGH GLASS from yard to inside!)
    const picW = 4.2, picH = 2.2;
    const picGlass = new THREE.Mesh(new THREE.PlaneGeometry(picW, picH), seeThroughGlassMat);
    picGlass.position.set(bW * 0.25, picH / 2 + 0.8, -bD / 2 - 0.02);

    // Entrance Door Opening (2.4m tall x 1.4m wide)
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.8, bH - 2.4, 0.35), stuccoMat);
    lintel.position.set(-bW * 0.08, 2.4 + (bH - 2.4) / 2, -bD / 2);
    bGroup.add(frontL, frontR, picGlass, lintel);

    // Front Doorway with House Number Plaque
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.3, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.4 })
    );
    door.position.set(-bW * 0.08, 1.15, -bD / 2 + 0.15); // Slightly ajar to invite exploration!
    door.rotation.y = 0.35;
    bGroup.add(door);

    // --- FURNISHED INTERIOR (Spacious, Amplified Scale) ---
    // 1. Living Room: Modern L-Sectional Sofa & Coffee Table
    const sofaMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
    const sofaMain = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.85, 1.1), sofaMat);
    sofaMain.position.set(3.8, 0.42, -1.8);
    const sofaL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 2.4), sofaMat);
    sofaL.position.set(2.55, 0.42, -3.05);

    const coffeeTable = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.42, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.3 })
    );
    coffeeTable.position.set(3.8, 0.21, -3.2);

    // Entertainment Console with 75" Flat-Screen TV
    const tvStand = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.65, 0.6), metalFrameMat);
    tvStand.position.set(3.8, 0.32, -bD / 2 + 1.2);

    const tvScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.35),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0284c7, emissiveIntensity: 0.75 })
    );
    tvScreen.position.set(3.8, 1.5, -bD / 2 + 1.5);
    bGroup.add(sofaMain, sofaL, coffeeTable, tvStand, tvScreen);

    // 2. Gourmet Kitchen: Quartz Waterfall Center Island
    const island = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 1.05, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.2, metalness: 0.1 })
    );
    island.position.set(-3.5, 0.52, -1.5);

    // Stainless Refrigerator
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1.1), stainlessSteelMat);
    fridge.position.set(-bW / 2 + 1.0, 1.1, -4.5);
    bGroup.add(island, fridge);

    // 3. Bedroom: King-Size Platform Bed with Upholstered Headboard
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.65, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 })
    );
    bed.position.set(-3.8, 0.32, 4.2);

    const headboard = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.4, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
    );
    headboard.position.set(-3.8, 0.7, 5.4);
    bGroup.add(bed, headboard);

    // Warm Ambient Interior Downlights

    group.add(bGroup);

    interiorBounds.push({
      minX: cx - bW / 2 + 0.4,
      maxX: cx + bW / 2 - 0.4,
      minZ: cz - bD / 2 + 0.4,
      maxZ: cz + bD / 2 - 0.4,
      floorY,
      ceilY: floorY + bH,
      name: `${style.toUpperCase()} Residential Home`
    });
  }

  // =========================================================================
  // POPULATE ALL POWAY PLAZAS & RESIDENTIAL ZONES
  // =========================================================================
  function buildAll() {
    // Merge Major Plazas into interior bounds for camera clipping
    if (majorPlazas && majorPlazas.interiorBounds) {
      interiorBounds.push(...majorPlazas.interiorBounds);
    }

    // 1. Big-Box Commercial Anchors: Target and Walmart are drawn by the building generator on their real footprints

    // 3. Residential Neighborhoods (Villas, Ranches, Modern Estates)
    // Green Valley Villas
    buildResidentialHome(-1850, -1450, 'spanish');
    buildResidentialHome(-1920, -1580, 'spanish');
    buildResidentialHome(-1760, -1320, 'spanish');

    // Poway Valley Ranches
    buildResidentialHome(-650, -420, 'ranch');
    buildResidentialHome(-820, -350, 'ranch');
    buildResidentialHome(-540, -560, 'ranch');

    // Silverwood / High Valley Modern Estates
    buildResidentialHome(-1250, 950, 'modern');
    buildResidentialHome(-1420, 1100, 'modern');
    buildResidentialHome(-1100, 820, 'modern');

    // Door Interactivity on furnished buildings (the plazas register their own)
    if (addInteract) {
      interiorBounds.slice(majorPlazas && majorPlazas.interiorBounds ? majorPlazas.interiorBounds.length : 0).forEach(b => {
        addInteract({
          x: (b.minX + b.maxX) / 2,
          z: b.minZ - 1.5,
          r: 3.5,
          when: () => !(player.inCar),
          label: () => `Enter <b>${b.name}</b>`,
          onUse: () => {
            if (sfx && sfx.punch) sfx.punch(0.2);
            notify(`Entered <b>${b.name}</b>`, '#38bdf8', 2000);
          }
        });
      });
    }
  }

  buildAll();

  // =========================================================================
  // INTERIOR CAMERA INTELLIGENCE (Smooth & Never Cramped)
  // =========================================================================
  function getActiveInterior(pos) {
    for (const b of interiorBounds) {
      if (
        pos.x >= b.minX && pos.x <= b.maxX &&
        pos.z >= b.minZ && pos.z <= b.maxZ &&
        pos.y >= b.floorY - 0.2 && pos.y <= b.ceilY + 0.2
      ) {
        return b;
      }
    }
    return null;
  }

  let inInterior = false;
  let currentInterior = null;

  function update(dt) {
    // Tick moving door animations and motion sensors
    if (majorPlazas && majorPlazas.update) {
      majorPlazas.update(dt);
    }

    const pPos = player.pos;
    const interior = getActiveInterior(pPos);

    if (interior && !inInterior) {
      inInterior = true;
      currentInterior = interior;
    } else if (!interior && inInterior) {
      inInterior = false;
      currentInterior = null;
    }

    // When inside, adjust camera to open interior shoulder perspective
    if (inInterior && currentInterior && !player.inCar) {
      // Pull camera closer so it never clips external walls or ceilings
      ctx.cam.dist = THREE.MathUtils.lerp(ctx.cam.dist, 2.2, dt * 6.0);
      // Softly clamp pitch so camera stays level inside rooms
      ctx.cam.pitch = THREE.MathUtils.clamp(ctx.cam.pitch, -0.15, 0.45);
    }
  }

  return {
    group,
    plazas: majorPlazas,
    interiorBounds,
    isInside: () => inInterior,
    currentInterior: () => currentInterior,
    update
  };
}
