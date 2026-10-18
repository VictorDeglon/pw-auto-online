/**
 * Major Plazas World System (AAA Modular Real-Time Commercial Centers)
 *
 * Implements 5 Distinct Plazas starting from the center of Poway and moving outwards:
 * 1. Poway Town Center / Creekside Plaza (Center: [-320, 432]) - Spanish Colonial Mission Commercial
 * 2. Poway Valley Center / Carriage Square (West-Central: [-702, 402]) - California Craftsman Commercial
 * 3. Twin Peaks Plaza (West: [-2437, -2322]) - Contemporary West Coast Suburban Retail
 * 4. Carmel Mountain Lifestyle Promenade (West Anchor: [-4250, -2260]) - High-End Lifestyle Commercial Center
 * 5. Costco Wholesale & Tech Center (Industrial: [-4260, -2640]) - Industrial Big-Box & Fast-Casual Pad
 *
 * Features:
 * - Real-world stores with authentic canvas brand logos.
 * - Architectural roofs (terracotta barrel tiles, standing seam metal, TPO cool roof).
 * - Rooftop mechanicals: multi-stage HVAC packaged units, kitchen exhaust mushroom fans, conduits, access hatches.
 * - Land chunks: high-detail asphalt, parking stalls, concrete curbs with chamfers, scored sidewalks, ADA safety ramps.
 * - Interactive double sliding glass doors that open when player approaches and close when departing.
 * - Furnished interiors with see-through physical glass and full interior camera boundary support.
 */
import * as THREE from 'three';
import {
  getAsphaltTex,
  getParkingLotTex,
  getScoredSidewalkTex,
  getTactilePavingTex,
  getSpanishRoofTileTex,
  getStandingSeamMetalTex,
  getTPOMembraneTex,
  getBrandLogoTex
} from './textures.js';
import {
  MovingDoorSystem,
  createRooftopHVAC,
  createRoofAccessHatch,
  createPlazaLandChunk,
  seeThroughGlassMat,
  darkBronzeFrameMat,
  silverAluminumFrameMat,
  galvanizedMetalMat,
  concreteCurbMat
} from './fixtures.js';

export function buildMajorPlazas(ctx) {
  const { THREE, scene, player, heightAt, addInteract, notify, sfx } = ctx;

  const plazaRoot = new THREE.Group();
  plazaRoot.name = 'MajorPlazasEcosystem';
  scene.add(plazaRoot);

  const doorSystem = new MovingDoorSystem(ctx);
  const interiorBounds = []; // Registered bounds for smooth interior camera and collision

  // Shared Base Materials
  const stuccoSpanishMat = new THREE.MeshStandardMaterial({ color: 0xede4d5, roughness: 0.9 });
  const stuccoCraftsmanMat = new THREE.MeshStandardMaterial({ color: 0xd6cebe, roughness: 0.88 });
  const stoneWainscotMat = new THREE.MeshStandardMaterial({ color: 0x827d73, roughness: 0.95 });
  const stuccoModernMat = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.85 });
  const stuccoLifestyleMat = new THREE.MeshStandardMaterial({ color: 0xded3c1, roughness: 0.85 });
  const industrialMetalMat = new THREE.MeshStandardMaterial({ color: 0xc8cbd0, roughness: 0.4, metalness: 0.8 });
  const woodTrimMat = new THREE.MeshStandardMaterial({ color: 0x4a3425, roughness: 0.8 });
  const polishedConcreteMat = new THREE.MeshStandardMaterial({ color: 0x938f87, roughness: 0.4, metalness: 0.1 });
  const tileFloorMat = new THREE.MeshStandardMaterial({ color: 0xd5cebf, roughness: 0.35, metalness: 0.05 });
  const darkCeilingMat = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.8 });

  // Helper to create illuminated brand storefront sign
  function createStoreSign(logoTex, width = 6.2, height = 1.6) {
    const signGroup = new THREE.Group();
    // Backing Tray
    const tray = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, height + 0.2, 0.18), darkBronzeFrameMat);
    // Illuminated Face
    const signMat = new THREE.MeshStandardMaterial({
      map: logoTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: logoTex,
      emissiveIntensity: 0.65,
      roughness: 0.25
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), signMat);
    face.position.z = 0.1;
    signGroup.add(tray, face);
    return signGroup;
  }

  // =========================================================================
  // PLAZA 1: POWAY TOWN CENTER & CREEKSIDE PLAZA (CENTER OF POWAY)
  // Location: [-320, 432]
  // Stores: The Habit Burger Grill, Board & Brew, Subway, Round Table Pizza
  // Style: Spanish Colonial Mission Commercial
  // =========================================================================
  function buildPlaza1_PowayTownCenter() {
    const cx = -320.0, cz = 432.0;
    const floorY = heightAt(cx, cz);
    const bW = 74.0, bD = 22.0, bH = 5.6;

    // 1. Land Chunk (Asphalt parcel, parking stalls, concrete curbs, fan palms)
    createPlazaLandChunk(plazaRoot, {
      cx, cz, width: 104, depth: 82, floorY,
      storefrontOffsetZ: -bD / 2 - 2,
      parkingRows: 2,
      plazaStyle: 'spanish'
    });

    const bGroup = new THREE.Group();
    bGroup.name = 'Plaza1_PowayTownCenter';
    bGroup.position.set(cx, floorY, cz);
    plazaRoot.add(bGroup);

    // Interior Bounds for Camera
    interiorBounds.push({
      minX: cx - bW / 2 + 0.4,
      maxX: cx + bW / 2 - 0.4,
      minZ: cz - bD / 2 + 0.4,
      maxZ: cz + bD / 2 - 0.4,
      floorY,
      ceilY: floorY + bH,
      name: 'Poway Town Center Plaza'
    });

    // Interior Floor & Ceiling
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), tileFloorMat);
    floor.position.y = 0.15;
    floor.receiveShadow = true;
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), darkCeilingMat);
    ceiling.position.y = bH - 0.15;
    bGroup.add(floor, ceiling);

    // Envelope Walls (Back, Left, Right)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, 0.5), stuccoSpanishMat);
    backWall.position.set(0, bH / 2, bD / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, bH, bD), stuccoSpanishMat);
    leftWall.position.set(-bW / 2, bH / 2, 0);
    const rightWall = leftWall.clone();
    rightWall.position.x = bW / 2;
    bGroup.add(backWall, leftWall, rightWall);

    // Spanish Clay Tile Mansard Parapet Roof
    const roofTileTex = getSpanishRoofTileTex();
    roofTileTex.repeat.set(12, 2);
    const tileMat = new THREE.MeshStandardMaterial({ map: roofTileTex, roughness: 0.8 });
    const tileParapet = new THREE.Mesh(new THREE.BoxGeometry(bW + 0.8, 1.4, 1.8), tileMat);
    tileParapet.position.set(0, bH + 0.65, -bD / 2 + 0.8);
    bGroup.add(tileParapet);

    // Rooftop HVAC & Exhaust Units
    createRooftopHVAC(bGroup, { x: -22, y: bH, z: 2, width: 3.2, depth: 2.0, height: 1.5, isRestaurant: true }); // Habit
    createRooftopHVAC(bGroup, { x: -6, y: bH, z: 2, width: 3.0, depth: 1.9, height: 1.4, isRestaurant: false }); // Board & Brew
    createRooftopHVAC(bGroup, { x: 10, y: bH, z: 2, width: 2.8, depth: 1.8, height: 1.4, isRestaurant: false }); // Subway
    createRooftopHVAC(bGroup, { x: 24, y: bH, z: 2, width: 3.4, depth: 2.2, height: 1.6, isRestaurant: true }); // Round Table
    createRoofAccessHatch(bGroup, 0, bH, 5);

    // 4 Store Bays: Habit, Board & Brew, Subway, Round Table Pizza
    const stores = [
      { name: 'The Habit Burger Grill', key: 'habit_burger', x: -26.0 },
      { name: 'Board & Brew', key: 'board_and_brew', x: -8.5 },
      { name: 'Subway', key: 'subway', x: 8.5 },
      { name: 'Round Table Pizza', key: 'round_table_pizza', x: 26.0 }
    ];

    const bayW = bW / 4;
    stores.forEach((st, idx) => {
      const bayCenter = -bW / 2 + bayW / 2 + idx * bayW;

      // Storefront Dividing Pillars (Spanish Stucco Columns)
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, bH, 0.8), stuccoSpanishMat);
      pillar.position.set(bayCenter - bayW / 2 + 0.6, bH / 2, -bD / 2);
      bGroup.add(pillar);

      // Storefront Glass Window
      const glassW = bayW - 4.6;
      const glassFront = new THREE.Mesh(new THREE.PlaneGeometry(glassW, 3.4), seeThroughGlassMat);
      glassFront.position.set(bayCenter + 1.2, 2.0, -bD / 2 - 0.02);
      bGroup.add(glassFront);

      // Illuminated Brand Logo Sign
      const logoTex = st.key === 'subway' ? getBrandLogoTex('subway') : getBrandLogoTex(st.key);
      const sign = createStoreSign(logoTex, 6.4, 1.5);
      sign.position.set(bayCenter, bH - 1.2, -bD / 2 - 0.35);
      bGroup.add(sign);

      // Interactive Moving Double Sliding Glass Door
      doorSystem.createSlidingDoor(bGroup, {
        x: bayCenter - 3.2,
        y: 0.15,
        z: -bD / 2,
        rotY: 0,
        width: 2.8,
        height: 2.7,
        frameMat: darkBronzeFrameMat,
        storeName: st.name
      });

      // Interior Furnishings for each store bay
      // Order Counter
      const counter = new THREE.Mesh(
        new THREE.BoxGeometry(4.8, 1.1, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.4 })
      );
      counter.position.set(bayCenter, 0.7, -bD / 2 + 6.0);
      // Dining Booths & Tables
      for (let tx = -3.0; tx <= 3.0; tx += 3.0) {
        const table = new THREE.Mesh(
          new THREE.CylinderGeometry(0.65, 0.65, 0.85, 12),
          new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.3 })
        );
        table.position.set(bayCenter + tx, 0.55, -bD / 2 + 2.5);
        bGroup.add(table);
      }
      bGroup.add(counter);
    });
  }

  // =========================================================================
  // PLAZA 2: POWAY VALLEY CENTER / CARRIAGE SQUARE (WEST-CENTRAL)
  // Location: [-702, 402]
  // Stores: Five Guys, Jersey Mike's, Wingstop, Little Caesars, O'Reilly Auto Parts
  // Style: California Craftsman Commercial (Standing Seam Canopies, Stone Wainscot)
  // =========================================================================
  function buildPlaza2_PowayValleyCenter() {
    const cx = -702.0, cz = 402.0;
    const floorY = heightAt(cx, cz);
    const bW = 86.0, bD = 24.0, bH = 5.4;

    createPlazaLandChunk(plazaRoot, {
      cx, cz, width: 112, depth: 84, floorY,
      storefrontOffsetZ: -bD / 2 - 2,
      parkingRows: 2,
      plazaStyle: 'craftsman'
    });

    const bGroup = new THREE.Group();
    bGroup.name = 'Plaza2_PowayValleyCenter';
    bGroup.position.set(cx, floorY, cz);
    plazaRoot.add(bGroup);

    interiorBounds.push({
      minX: cx - bW / 2 + 0.4,
      maxX: cx + bW / 2 - 0.4,
      minZ: cz - bD / 2 + 0.4,
      maxZ: cz + bD / 2 - 0.4,
      floorY,
      ceilY: floorY + bH,
      name: 'Poway Valley Center Plaza'
    });

    // Floor & Ceiling
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), polishedConcreteMat);
    floor.position.y = 0.15;
    floor.receiveShadow = true;
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), darkCeilingMat);
    ceiling.position.y = bH - 0.15;
    bGroup.add(floor, ceiling);

    // Envelope Walls with Stacked Stone Wainscoting
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, 0.5), stuccoCraftsmanMat);
    backWall.position.set(0, bH / 2, bD / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, bH, bD), stuccoCraftsmanMat);
    leftWall.position.set(-bW / 2, bH / 2, 0);
    const rightWall = leftWall.clone();
    rightWall.position.x = bW / 2;
    bGroup.add(backWall, leftWall, rightWall);

    // Stone Wainscot Base along facade
    const stoneBase = new THREE.Mesh(new THREE.BoxGeometry(bW + 0.4, 1.2, 0.6), stoneWainscotMat);
    stoneBase.position.set(0, 0.6, -bD / 2);
    bGroup.add(stoneBase);

    // Standing Seam Metal Awning Canopy along the entire storefront
    const metalTex = getStandingSeamMetalTex();
    metalTex.repeat.set(16, 2);
    const canopyMat = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.4, metalness: 0.8 });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(bW + 1.2, 0.18, 3.2), canopyMat);
    awning.position.set(0, 3.8, -bD / 2 - 1.4);
    awning.rotation.x = 0.12;
    awning.castShadow = true;
    bGroup.add(awning);

    // Heavy Timber Awning Support Brackets
    for (let bx = -bW * 0.46; bx <= bW * 0.46; bx += 8.6) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 1.8), woodTrimMat);
      bracket.position.set(bx, 3.3, -bD / 2 - 0.8);
      bGroup.add(bracket);
    }

    // Rooftop HVAC Systems
    createRooftopHVAC(bGroup, { x: -30, y: bH, z: 2, width: 3.4, depth: 2.2, height: 1.6, isRestaurant: true }); // Five Guys
    createRooftopHVAC(bGroup, { x: -12, y: bH, z: 2, width: 3.0, depth: 1.9, height: 1.4, isRestaurant: true }); // Jersey Mikes
    createRooftopHVAC(bGroup, { x: 6, y: bH, z: 2, width: 3.2, depth: 2.0, height: 1.5, isRestaurant: true }); // Wingstop
    createRooftopHVAC(bGroup, { x: 22, y: bH, z: 2, width: 2.8, depth: 1.8, height: 1.4, isRestaurant: true }); // Little Caesars
    createRooftopHVAC(bGroup, { x: 36, y: bH, z: 2, width: 3.6, depth: 2.4, height: 1.7, isRestaurant: false }); // O'Reilly
    createRoofAccessHatch(bGroup, -2, bH, 6);

    const stores = [
      { name: 'Five Guys', key: 'five_guys', wRatio: 1.0 },
      { name: 'Jersey Mike\'s Subs', key: 'jersey_mikes', wRatio: 0.9 },
      { name: 'Wingstop', key: 'wingstop', wRatio: 0.9 },
      { name: 'Little Caesars', key: 'little_caesars', wRatio: 0.9 },
      { name: 'O\'Reilly Auto Parts', key: 'oreilly_auto', wRatio: 1.3 }
    ];

    const totalRatio = stores.reduce((acc, s) => acc + s.wRatio, 0);
    let curX = -bW / 2;

    stores.forEach((st) => {
      const bayW = (bW * st.wRatio) / totalRatio;
      const bayCenter = curX + bayW / 2;
      curX += bayW;

      // Front Glass Storefront
      const glassW = bayW - 4.2;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(glassW, 2.4), seeThroughGlassMat);
      glass.position.set(bayCenter + 1.2, 2.4, -bD / 2 - 0.02);
      bGroup.add(glass);

      // Sign Above Awning
      const logoTex = getBrandLogoTex(st.key);
      const sign = createStoreSign(logoTex, Math.min(6.6, bayW - 1.2), 1.45);
      sign.position.set(bayCenter, bH - 0.9, -bD / 2 - 0.35);
      bGroup.add(sign);

      // Moving Double Glass Door
      doorSystem.createSlidingDoor(bGroup, {
        x: bayCenter - 2.8,
        y: 0.15,
        z: -bD / 2,
        rotY: 0,
        width: 2.8,
        height: 2.7,
        frameMat: darkBronzeFrameMat,
        storeName: st.name
      });
    });
  }

  // =========================================================================
  // PLAZA 3: TWIN PEAKS PLAZA (WEST POWAY)
  // Location: [-2437, -2322]
  // Stores: Outback Steakhouse, Ike's Sandwiches, Wells Fargo Bank, Great Clips
  // Style: Contemporary West Coast Suburban Retail (Clean Parapets, Geometric Porticos)
  // =========================================================================
  function buildPlaza3_TwinPeaksPlaza() {
    const cx = -2437.0, cz = -2322.0;
    const floorY = heightAt(cx, cz);
    const bW = 84.0, bD = 26.0, bH = 6.0;

    createPlazaLandChunk(plazaRoot, {
      cx, cz, width: 116, depth: 88, floorY,
      storefrontOffsetZ: -bD / 2 - 2,
      parkingRows: 2,
      plazaStyle: 'contemporary'
    });

    const bGroup = new THREE.Group();
    bGroup.name = 'Plaza3_TwinPeaksPlaza';
    bGroup.position.set(cx, floorY, cz);
    plazaRoot.add(bGroup);

    interiorBounds.push({
      minX: cx - bW / 2 + 0.4,
      maxX: cx + bW / 2 - 0.4,
      minZ: cz - bD / 2 + 0.4,
      maxZ: cz + bD / 2 - 0.4,
      floorY,
      ceilY: floorY + bH,
      name: 'Twin Peaks Plaza'
    });

    // Floor & Ceiling
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), tileFloorMat);
    floor.position.y = 0.15;
    floor.receiveShadow = true;
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), darkCeilingMat);
    ceiling.position.y = bH - 0.15;
    bGroup.add(floor, ceiling);

    // Exterior Walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, 0.5), stuccoModernMat);
    backWall.position.set(0, bH / 2, bD / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, bH, bD), stuccoModernMat);
    leftWall.position.set(-bW / 2, bH / 2, 0);
    const rightWall = leftWall.clone();
    rightWall.position.x = bW / 2;
    bGroup.add(backWall, leftWall, rightWall);

    // Architectural Split-Face Masonry Porticos projecting forward
    const porticoMat = new THREE.MeshStandardMaterial({ color: 0x524b45, roughness: 0.95 });
    [-bW * 0.35, bW * 0.35].forEach(px => {
      const portico = new THREE.Mesh(new THREE.BoxGeometry(14.0, bH + 1.2, 1.8), porticoMat);
      portico.position.set(px, (bH + 1.2) / 2, -bD / 2 - 0.7);
      portico.castShadow = true;
      bGroup.add(portico);
    });

    // Rooftop Units
    createRooftopHVAC(bGroup, { x: -28, y: bH, z: 2, width: 3.6, depth: 2.4, height: 1.7, isRestaurant: true }); // Outback
    createRooftopHVAC(bGroup, { x: -8, y: bH, z: 2, width: 3.0, depth: 2.0, height: 1.5, isRestaurant: true }); // Ikes
    createRooftopHVAC(bGroup, { x: 12, y: bH, z: 2, width: 3.2, depth: 2.0, height: 1.5, isRestaurant: false }); // Wells Fargo
    createRooftopHVAC(bGroup, { x: 30, y: bH, z: 2, width: 2.8, depth: 1.8, height: 1.4, isRestaurant: false }); // Great Clips
    createRoofAccessHatch(bGroup, 0, bH, 7);

    const stores = [
      { name: 'Outback Steakhouse', key: 'outback', bayW: 24.0 },
      { name: 'Ike\'s Sandwiches', key: 'ikes_sandwiches', bayW: 18.0 },
      { name: 'Wells Fargo Bank', key: 'wells_fargo', bayW: 22.0 },
      { name: 'Great Clips', key: 'great_clips', bayW: 20.0 }
    ];

    let curX = -bW / 2;
    stores.forEach(st => {
      const bayCenter = curX + st.bayW / 2;
      curX += st.bayW;

      // Storefront Glass
      const glassW = st.bayW - 4.4;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(glassW, 3.2), seeThroughGlassMat);
      glass.position.set(bayCenter + 1.3, 2.1, -bD / 2 - 0.02);
      bGroup.add(glass);

      // Signage
      const logoTex = st.key === 'great_clips' ? getBrandLogoTex('great_clips') : getBrandLogoTex(st.key);
      const sign = createStoreSign(logoTex, Math.min(7.2, st.bayW - 2.0), 1.6);
      sign.position.set(bayCenter, bH - 1.1, -bD / 2 - 0.4);
      bGroup.add(sign);

      // Moving Double Sliding Glass Door
      doorSystem.createSlidingDoor(bGroup, {
        x: bayCenter - 3.2,
        y: 0.15,
        z: -bD / 2,
        rotY: 0,
        width: 3.0,
        height: 2.8,
        frameMat: darkBronzeFrameMat,
        storeName: st.name
      });
    });
  }

  // =========================================================================
  // PLAZA 4: CARMEL MOUNTAIN LIFESTYLE PROMENADE (WEST ANCHOR)
  // Location: [-4250, -2260]
  // Stores: Barnes & Noble, Trader Joe's, Ulta Beauty, Chipotle, CAVA
  // Style: High-End Lifestyle Commercial Center (Sandstone, Pergolas, Trellises)
  // =========================================================================
  function buildPlaza4_CarmelMountainPromenade() {
    const cx = -4250.0, cz = -2260.0;
    const floorY = heightAt(cx, cz);
    const bW = 96.0, bD = 28.0, bH = 6.4;

    createPlazaLandChunk(plazaRoot, {
      cx, cz, width: 124, depth: 96, floorY,
      storefrontOffsetZ: -bD / 2 - 2,
      parkingRows: 2,
      plazaStyle: 'lifestyle'
    });

    const bGroup = new THREE.Group();
    bGroup.name = 'Plaza4_CarmelMountainLifestyle';
    bGroup.position.set(cx, floorY, cz);
    plazaRoot.add(bGroup);

    interiorBounds.push({
      minX: cx - bW / 2 + 0.4,
      maxX: cx + bW / 2 - 0.4,
      minZ: cz - bD / 2 + 0.4,
      maxZ: cz + bD / 2 - 0.4,
      floorY,
      ceilY: floorY + bH,
      name: 'Carmel Mountain Lifestyle Promenade'
    });

    // Floor & Ceiling
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), tileFloorMat);
    floor.position.y = 0.15;
    floor.receiveShadow = true;
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), darkCeilingMat);
    ceiling.position.y = bH - 0.15;
    bGroup.add(floor, ceiling);

    // Walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, 0.5), stuccoLifestyleMat);
    backWall.position.set(0, bH / 2, bD / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, bH, bD), stuccoLifestyleMat);
    leftWall.position.set(-bW / 2, bH / 2, 0);
    const rightWall = leftWall.clone();
    rightWall.position.x = bW / 2;
    bGroup.add(backWall, leftWall, rightWall);

    // Architectural Trellis Pergola in front of Chipotle & CAVA dining zones
    const trellisGroup = new THREE.Group();
    trellisGroup.position.set(24, 0, -bD / 2 - 2.8);
    // Posts
    for (let tx = -14; tx <= 14; tx += 7) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.2, 0.25), darkBronzeFrameMat);
      post.position.set(tx, 2.1, 0);
      trellisGroup.add(post);
    }
    // Overhead Rafter Slats
    for (let rz = -2.5; rz <= 2.5; rz += 0.8) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(29.0, 0.12, 0.2), woodTrimMat);
      slat.position.set(0, 4.25, rz);
      trellisGroup.add(slat);
    }
    bGroup.add(trellisGroup);

    // Rooftop Units
    createRooftopHVAC(bGroup, { x: -36, y: bH, z: 4, width: 3.8, depth: 2.6, height: 1.8, isRestaurant: false }); // Barnes & Noble
    createRooftopHVAC(bGroup, { x: -16, y: bH, z: 4, width: 3.6, depth: 2.4, height: 1.7, isRestaurant: false }); // Trader Joe's
    createRooftopHVAC(bGroup, { x: 4, y: bH, z: 4, width: 3.2, depth: 2.0, height: 1.5, isRestaurant: false }); // Ulta
    createRooftopHVAC(bGroup, { x: 22, y: bH, z: 4, width: 3.4, depth: 2.2, height: 1.6, isRestaurant: true }); // Chipotle
    createRooftopHVAC(bGroup, { x: 38, y: bH, z: 4, width: 3.2, depth: 2.0, height: 1.5, isRestaurant: true }); // CAVA
    createRoofAccessHatch(bGroup, 0, bH, 8);

    const stores = [
      { name: 'Barnes & Noble', key: 'barnes_and_noble', bayW: 24.0 },
      { name: 'Trader Joe\'s', key: 'trader_joes', bayW: 22.0 },
      { name: 'Ulta Beauty', key: 'ulta_beauty', bayW: 18.0 },
      { name: 'Chipotle Mexican Grill', key: 'chipotle', bayW: 16.0 },
      { name: 'CAVA', key: 'cava', bayW: 16.0 }
    ];

    let curX = -bW / 2;
    stores.forEach(st => {
      const bayCenter = curX + st.bayW / 2;
      curX += st.bayW;

      // High Physical Glass Windows
      const glassW = st.bayW - 4.4;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(glassW, 3.8), seeThroughGlassMat);
      glass.position.set(bayCenter + 1.4, 2.5, -bD / 2 - 0.02);
      bGroup.add(glass);

      // Signage
      const logoTex = getBrandLogoTex(st.key);
      const sign = createStoreSign(logoTex, Math.min(7.6, st.bayW - 1.8), 1.65);
      sign.position.set(bayCenter, bH - 1.1, -bD / 2 - 0.4);
      bGroup.add(sign);

      // Moving Double Glass Door
      doorSystem.createSlidingDoor(bGroup, {
        x: bayCenter - 3.2,
        y: 0.15,
        z: -bD / 2,
        rotY: 0,
        width: 3.2,
        height: 2.9,
        frameMat: darkBronzeFrameMat,
        storeName: st.name
      });
    });
  }

  // =========================================================================
  // PLAZA 5: COSTCO WHOLESALE & TECH CENTER (INDUSTRIAL BIG-BOX)
  // Location: [-4260, -2640]
  // Stores: Costco Wholesale (Warehouse + Tire Center), Panera Bread, Panda Express
  // Style: Industrial Commercial Big-Box (Corrugated Metal, TPO Membrane Roof)
  // =========================================================================
  function buildPlaza5_CostcoTechCenter() {
    const cx = -4260.0, cz = -2640.0;
    const floorY = heightAt(cx, cz);
    const bW = 110.0, bD = 68.0, bH = 9.5;

    createPlazaLandChunk(plazaRoot, {
      cx, cz, width: 140, depth: 104, floorY,
      storefrontOffsetZ: -bD / 2 - 2,
      parkingRows: 3,
      plazaStyle: 'industrial'
    });

    const bGroup = new THREE.Group();
    bGroup.name = 'Plaza5_CostcoTechCenter';
    bGroup.position.set(cx, floorY, cz);
    plazaRoot.add(bGroup);

    interiorBounds.push({
      minX: cx - bW / 2 + 0.4,
      maxX: cx + bW / 2 - 0.4,
      minZ: cz - bD / 2 + 0.4,
      maxZ: cz + bD / 2 - 0.4,
      floorY,
      ceilY: floorY + bH,
      name: 'Costco Wholesale & Tech Center'
    });

    // Floor & Ceiling
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), polishedConcreteMat);
    floor.position.y = 0.15;
    floor.receiveShadow = true;
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), darkCeilingMat);
    ceiling.position.y = bH - 0.15;
    bGroup.add(floor, ceiling);

    // Industrial Corrugated Metal Walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, 0.6), industrialMetalMat);
    backWall.position.set(0, bH / 2, bD / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, bH, bD), industrialMetalMat);
    leftWall.position.set(-bW / 2, bH / 2, 0);
    const rightWall = leftWall.clone();
    rightWall.position.x = bW / 2;
    bGroup.add(backWall, leftWall, rightWall);

    // Front Wall with Tire Center bays on left and Main Entrance on right
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.4, bH, 0.6), industrialMetalMat);
    frontWall.position.set(0, bH / 2, -bD / 2);
    bGroup.add(frontWall);

    // White TPO Cool Roof Membrane
    const tpoTex = getTPOMembraneTex();
    tpoTex.repeat.set(8, 6);
    const tpoMat = new THREE.MeshStandardMaterial({ map: tpoTex, roughness: 0.6, metalness: 0.1 });
    const tpoRoof = new THREE.Mesh(new THREE.BoxGeometry(bW + 0.4, 0.25, bD + 0.4), tpoMat);
    tpoRoof.position.y = bH + 0.12;
    bGroup.add(tpoRoof);

    // 6 Large Commercial Rooftop RTU HVAC Units
    for (let hx = -bW * 0.35; hx <= bW * 0.35; hx += bW * 0.35) {
      for (let hz = -bD * 0.25; hz <= bD * 0.25; hz += bD * 0.5) {
        createRooftopHVAC(bGroup, { x: hx, y: bH, z: hz, width: 4.2, depth: 2.8, height: 2.0, isRestaurant: false });
      }
    }

    // Translucent Domed Industrial Skylights across Warehouse Roof
    const skylightMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.75,
      roughness: 0.2,
      opacity: 0.6,
      transparent: true
    });
    for (let sx = -bW * 0.38; sx <= bW * 0.38; sx += 18.0) {
      for (let sz = -bD * 0.35; sz <= bD * 0.35; sz += 18.0) {
        const skylight = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 1.6), skylightMat);
        skylight.position.set(sx, bH + 0.35, sz);
        bGroup.add(skylight);
      }
    }
    createRoofAccessHatch(bGroup, 12, bH, 14);

    // 1. Costco Main Warehouse Entrance (Right Wing)
    const costcoLogoTex = getBrandLogoTex('costco');
    const costcoSign = createStoreSign(costcoLogoTex, 12.0, 3.4);
    costcoSign.position.set(22.0, bH - 2.2, -bD / 2 - 0.5);
    bGroup.add(costcoSign);

    // Moving High-Capacity Entrance Sliding Doors
    doorSystem.createSlidingDoor(bGroup, {
      x: 22.0,
      y: 0.15,
      z: -bD / 2,
      rotY: 0,
      width: 4.2,
      height: 3.4,
      frameMat: darkBronzeFrameMat,
      storeName: 'Costco Wholesale'
    });

    // 2. Costco Tire Service Bays (Left Wing)
    const tireCenterBayW = 28.0;
    const tireSign = createStoreSign(getBrandLogoTex('costco'), 7.5, 1.6);
    tireSign.position.set(-32.0, bH - 2.0, -bD / 2 - 0.5);
    bGroup.add(tireSign);

    // 3 Rollup Service Bay Doors
    const rollupMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.3 });
    [-40.0, -32.0, -24.0].forEach(bx => {
      const bayDoor = new THREE.Mesh(new THREE.BoxGeometry(4.8, 4.4, 0.15), rollupMat);
      bayDoor.position.set(bx, 2.2, -bD / 2 - 0.1);
      bGroup.add(bayDoor);
    });

    // Interior Warehouse Pallet Racks
    const rackFrameMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4 });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4 });
    for (let rx = 5.0; rx <= 42.0; rx += 9.0) {
      for (let rz = -bD * 0.3; rz <= bD * 0.3; rz += 14.0) {
        const uprightL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 6.5, 1.2), rackFrameMat);
        uprightL.position.set(rx - 2.0, 3.25, rz);
        const uprightR = uprightL.clone();
        uprightR.position.x = rx + 2.0;
        const beam1 = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.12, 1.2), beamMat);
        beam1.position.set(rx, 2.2, rz);
        const beam2 = beam1.clone();
        beam2.position.y = 4.4;
        bGroup.add(uprightL, uprightR, beam1, beam2);
      }
    }
  }

  // Build All 5 Major Plazas
  buildPlaza1_PowayTownCenter();
  buildPlaza2_PowayValleyCenter();
  buildPlaza3_TwinPeaksPlaza();
  buildPlaza4_CarmelMountainPromenade();
  buildPlaza5_CostcoTechCenter();

  // Add interact prompts for each plaza
  if (addInteract) {
    interiorBounds.forEach(b => {
      addInteract({
        x: (b.minX + b.maxX) / 2,
        z: b.minZ - 2.0,
        r: 4.5,
        when: () => !(player.inCar),
        label: () => `Enter <b>${b.name}</b>`,
        onUse: () => {
          if (sfx && sfx.punch) sfx.punch(0.2);
          notify(`Welcome to <b>${b.name}</b>`, '#38bdf8', 2500);
        }
      });
    });
  }

  function update(dt) {
    doorSystem.update(dt, player.pos);
  }

  return {
    group: plazaRoot,
    interiorBounds,
    doorSystem,
    update
  };
}
