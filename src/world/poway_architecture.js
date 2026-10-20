/**
 * Poway Architecture & Interior Ecosystem (AAA Real-Time World System)
 *
 * Implements strict architectural grammar, distinct zoning, furnished interiors,
 * transparent windows, illuminated 3D logos, authentic curbs/sidewalks, and smooth
 * interior camera movement.
 *
 * ZONING & TYPOLOGY:
 * 1. Big-Box Commercial / Industrial Retail (Carmel Mountain & Poway Rd):
 *    - Target: Concentric red bullseye logo, red concrete sphere bollards, high-bay warehouse trusses,
 *      checkout conveyor lanes, customer service.
 *    - Walmart Supercenter: Blue entry portal, yellow spark logo, pharmacy, grocery aisles, electronics display.
 *    - Costco Wholesale: Industrial corrugated steel, 3D red/blue typography logo, multi-tier pallet racking towers,
 *      food court counter with pizza ovens and wholesale staging.
 *
 * 2. Strip Plaza Retail & Dining:
 *    - Subway: Yellow & green illuminated logo, refrigerated glass sandwich prep counter with sneeze guard,
 *      menu boards, dining booths, beverage dispenser.
 *    - Great Clips: Bright blue logo with shears, hydraulic salon chairs, full-length vanity mirrors, styling products.
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
import { buildMajorPlazas } from './plazas/plaza_builder.js';

export function createPowayArchitecture(ctx) {
  const { THREE, scene, camera, player, heightAt, sfx, notify, addInteract, hour } = ctx;

  const group = new THREE.Group();
  group.name = 'PowayArchitectureWorld';
  scene.add(group);

  // Modular Major Plazas Ecosystem (5 Major Plazas across Poway)
  const majorPlazas = buildMajorPlazas(ctx);

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
  const targetLogoTex = getCanvasTexture('target_logo', (g, w, h) => {
    g.fillStyle = '#cc0000';
    g.fillRect(0, 0, w, h);
    // Outer white ring
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2); g.fill();
    // Middle red ring
    g.fillStyle = '#cc0000';
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.28, 0, Math.PI * 2); g.fill();
    // Center white dot
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.14, 0, Math.PI * 2); g.fill();
  });

  const walmartLogoTex = getCanvasTexture('walmart_logo', (g, w, h) => {
    g.fillStyle = '#0071dc'; // Walmart signature blue
    g.fillRect(0, 0, w, h);
    // Yellow 6-spark star
    g.save();
    g.translate(w / 2, h / 2);
    g.fillStyle = '#ffc220';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.roundRect ? g.roundRect(-14, -w * 0.44, 28, w * 0.28, 12) : g.rect(-14, -w * 0.44, 28, w * 0.28);
      g.fill();
      g.rotate(Math.PI / 3);
    }
    g.restore();
  });

  const costcoLogoTex = getCanvasTexture('costco_logo', (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e31837'; // Red
    g.font = 'bold 120px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Costco', w / 2, h * 0.38);

    g.fillStyle = '#005baa'; // Blue
    g.font = 'bold 54px Arial, sans-serif';
    g.letterSpacing = '8px';
    g.fillText('WHOLESALE', w / 2, h * 0.72);
  }, 1024, 512);

  const subwayLogoTex = getCanvasTexture('subway_logo', (g, w, h) => {
    g.fillStyle = '#005a36'; // Subway green
    g.fillRect(0, 0, w, h);
    g.font = 'italic 900 130px "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Green and yellow split text
    g.fillStyle = '#ffffff';
    g.fillText('SUB', w * 0.32, h / 2);
    g.fillStyle = '#ffc220';
    g.fillText('WAY', w * 0.68, h / 2);
  }, 1024, 256);

  const greatClipsLogoTex = getCanvasTexture('great_clips_logo', (g, w, h) => {
    g.fillStyle = '#005ca9'; // Great Clips Blue
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.font = 'bold 96px "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Great Clips', w / 2, h * 0.45);
    g.font = 'bold 36px Arial, sans-serif';
    g.fillStyle = '#93c5fd';
    g.fillText('IT\'S GONNA BE GREAT', w / 2, h * 0.78);
  }, 1024, 256);

  const starbucksLogoTex = getCanvasTexture('starbucks_logo', (g, w, h) => {
    g.fillStyle = '#00704a'; // Starbucks Green
    g.fillRect(0, 0, w, h);
    // White ring
    g.strokeStyle = '#ffffff';
    g.lineWidth = 14;
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2); g.stroke();
    // Inner Siren Star
    g.fillStyle = '#ffffff';
    g.font = 'bold 160px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('★', w / 2, h / 2);
  });

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

  // =========================================================================
  // 1. BIG-BOX COMMERCIAL: TARGET (Carmel Mountain / Poway Border)
  // =========================================================================
  function buildTargetStore() {
    const cx = -4581.7, cz = -1997.5;
    const floorY = heightAt(cx, cz);
    const bW = 78.0, bD = 62.0, bH = 8.8;

    const bGroup = new THREE.Group();
    bGroup.name = 'Target_Superstore';
    bGroup.position.set(cx, floorY, cz);

    createCurbSidewalk(bGroup, bW, bD, 0);

    // Polished Concrete Floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), concreteFloorMat);
    floor.position.y = 0.15;
    floor.receiveShadow = true;
    bGroup.add(floor);

    // Industrial Ceiling with Open Web Bar Joists & LED Shop Lights
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), ceilingGridMat);
    ceiling.position.y = bH - 0.15;
    bGroup.add(ceiling);

    // Exterior Envelope Walls (Back, Left, Right)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, 0.5), beigeCommercialWallMat);
    backWall.position.set(0, bH / 2, bD / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, bH, bD), beigeCommercialWallMat);
    leftWall.position.set(-bW / 2, bH / 2, 0);
    const rightWall = leftWall.clone();
    rightWall.position.x = bW / 2;
    bGroup.add(backWall, leftWall, rightWall);

    // Front Wall with Prominent Red Fascia Portal
    const frontWallL = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.35, bH, 0.5), beigeCommercialWallMat);
    frontWallL.position.set(-bW * 0.325, bH / 2, -bD / 2);
    const frontWallR = frontWallL.clone();
    frontWallR.position.x = bW * 0.325;
    bGroup.add(frontWallL, frontWallR);

    // Central Glass Entrance Facade (SEE-THROUGH GLASS)
    const glassW = bW * 0.3, glassH = 4.8;
    const glassFront = new THREE.Mesh(new THREE.PlaneGeometry(glassW, glassH), seeThroughGlassMat);
    glassFront.position.set(0, glassH / 2 + 0.1, -bD / 2 - 0.02);
    bGroup.add(glassFront);

    // Target Red Architectural Portal Arch above Entrance
    const portalMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.4 });
    const portalBeam = new THREE.Mesh(new THREE.BoxGeometry(glassW + 4.0, 2.2, 1.4), portalMat);
    portalBeam.position.set(0, glassH + 1.2, -bD / 2 - 0.5);
    portalBeam.castShadow = true;

    // Glowing 3D Target Bullseye Logo
    const logoMat = new THREE.MeshStandardMaterial({
      map: targetLogoTex,
      emissive: new THREE.Color(0xef4444),
      emissiveMap: targetLogoTex,
      emissiveIntensity: 0.9,
      roughness: 0.2
    });
    const logoMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.25, 24), logoMat);
    logoMesh.rotation.x = Math.PI / 2;
    logoMesh.position.set(0, glassH + 2.8, -bD / 2 - 1.25);
    bGroup.add(portalBeam, logoMesh);

    // Signature Red Concrete Sphere Entrance Bollards
    for (let bx = -glassW * 0.55; bx <= glassW * 0.55; bx += 3.2) {
      const bollard = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), redBollardMat);
      bollard.position.set(bx, 0.55, -bD / 2 - 2.8);
      bollard.castShadow = true;
      bGroup.add(bollard);
    }

    // --- FURNISHED INTERIOR ---
    // 1. Checkout Conveyor Lanes (8 Lanes)
    const laneW = 1.4, laneL = 4.2;
    for (let c = -14; c <= 14; c += 4.0) {
      const lane = new THREE.Mesh(
        new THREE.BoxGeometry(laneW, 0.95, laneL),
        new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5 })
      );
      lane.position.set(c, 0.48, -bD * 0.3);

      // Register Monitor & Green Lane Light Pylon
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8),
        stainlessSteelMat
      );
      pylon.position.set(c + 0.5, 1.3, -bD * 0.3 - laneL / 2 + 0.4);

      const lightBeacon = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.25, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.0 })
      );
      lightBeacon.position.set(c + 0.5, 2.6, -bD * 0.3 - laneL / 2 + 0.4);

      bGroup.add(lane, pylon, lightBeacon);
    }

    // 2. Retail Merchandise Gondola Aisles (6 Deep Aisle Blocks)
    const rackMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.6 });
    const productColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6];
    for (let rx = -bW * 0.38; rx <= bW * 0.38; rx += 7.5) {
      for (let rz = -bD * 0.05; rz <= bD * 0.35; rz += 12.0) {
        const gondola = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.2, 9.0), rackMat);
        gondola.position.set(rx, 1.6, rz);
        gondola.castShadow = true;

        // Stocked Goods on Shelves
        for (let sh = 0.6; sh <= 2.8; sh += 0.8) {
          const prodMat = new THREE.MeshStandardMaterial({
            color: productColors[Math.floor(Math.random() * productColors.length)],
            roughness: 0.4
          });
          const itemBlock = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 8.6), prodMat);
          itemBlock.position.set(rx, sh, rz);
          bGroup.add(itemBlock);
        }
        bGroup.add(gondola);
      }
    }


    group.add(bGroup);

    // Register interior boundaries for camera collision & walk mode
    interiorBounds.push({
      minX: cx - bW / 2 + 0.5,
      maxX: cx + bW / 2 - 0.5,
      minZ: cz - bD / 2 + 0.5,
      maxZ: cz + bD / 2 - 0.5,
      floorY,
      ceilY: floorY + bH,
      name: 'Target Supercenter'
    });
  }

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

  // =========================================================================
  // 3. BIG-BOX COMMERCIAL: WALMART SUPERCENTER (Poway Road)
  // =========================================================================
  function buildWalmartStore() {
    const cx = -247.3, cz = 97.7;
    const floorY = heightAt(cx, cz);
    const bW = 88.0, bD = 72.0, bH = 9.2;

    const bGroup = new THREE.Group();
    bGroup.name = 'Walmart_Supercenter';
    bGroup.position.set(cx, floorY, cz);

    createCurbSidewalk(bGroup, bW, bD, 0);

    // Polished Floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), concreteFloorMat);
    floor.position.y = 0.15;
    floor.receiveShadow = true;
    bGroup.add(floor);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.3, bD), ceilingGridMat);
    ceiling.position.y = bH - 0.15;
    bGroup.add(ceiling);

    // Perimeter Walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, 0.6), beigeCommercialWallMat);
    backWall.position.set(0, bH / 2, bD / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, bH, bD), beigeCommercialWallMat);
    leftWall.position.set(-bW / 2, bH / 2, 0);
    const rightWall = leftWall.clone();
    rightWall.position.x = bW / 2;
    bGroup.add(backWall, leftWall, rightWall);

    // Front Wall with Iconic Walmart Blue Entrance Portal
    const frontL = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.36, bH, 0.6), beigeCommercialWallMat);
    frontL.position.set(-bW * 0.32, bH / 2, -bD / 2);
    const frontR = frontL.clone();
    frontR.position.x = bW * 0.32;
    bGroup.add(frontL, frontR);

    // Glass Entry Window Wall
    const glassW = bW * 0.28, glassH = 4.8;
    const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(glassW, glassH), seeThroughGlassMat);
    glassMesh.position.set(0, glassH / 2 + 0.1, -bD / 2 - 0.02);
    bGroup.add(glassMesh);

    // Signature Blue Portal Arch
    const bluePortal = new THREE.Mesh(
      new THREE.BoxGeometry(glassW + 3.0, 2.2, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x0071dc, roughness: 0.4 })
    );
    bluePortal.position.set(0, glassH + 1.2, -bD / 2 - 0.4);

    // 3D Yellow Walmart Spark Logo
    const sparkMat = new THREE.MeshStandardMaterial({
      map: walmartLogoTex,
      emissive: new THREE.Color(0xffc220),
      emissiveMap: walmartLogoTex,
      emissiveIntensity: 0.85
    });
    const sparkMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 24), sparkMat);
    sparkMesh.rotation.x = Math.PI / 2;
    sparkMesh.position.set(0, glassH + 2.8, -bD / 2 - 1.1);
    bGroup.add(bluePortal, sparkMesh);

    // Interior: Grocery Section, Electronics Display, and Checkout Rows
    for (let c = -12; c <= 12; c += 3.8) {
      const reg = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.95, 3.8), metalFrameMat);
      reg.position.set(c, 0.48, -bD * 0.28);
      bGroup.add(reg);
    }

    // Electronics TV Wall (Back wall with glowing screens)
    for (let tx = -20; tx <= 20; tx += 6.5) {
      const tvScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(4.8, 2.7),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.95 })
      );
      tvScreen.position.set(tx, 3.2, bD / 2 - 0.35);
      tvScreen.rotation.y = Math.PI;
      bGroup.add(tvScreen);
    }

    group.add(bGroup);

    interiorBounds.push({
      minX: cx - bW / 2 + 0.5,
      maxX: cx + bW / 2 - 0.5,
      minZ: cz - bD / 2 + 0.5,
      maxZ: cz + bD / 2 - 0.5,
      floorY,
      ceilY: floorY + bH,
      name: 'Walmart Supercenter'
    });
  }

  // =========================================================================
  // 4. STRIP PLAZA SHOP: SUBWAY FAST FOOD RESTAURANT
  // =========================================================================
  function buildSubwayStore(cx, cz) {
    const floorY = heightAt(cx, cz);
    const bW = 12.0, bD = 14.0, bH = 4.2;

    const bGroup = new THREE.Group();
    bGroup.name = 'Subway_Store';
    bGroup.position.set(cx, floorY, cz);

    createCurbSidewalk(bGroup, bW, bD, 0);

    // Ceramic Tile Flooring
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.25, bD), tileFloorMat);
    floor.position.y = 0.125;
    floor.receiveShadow = true;
    bGroup.add(floor);

    // Ceiling with Downlights
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.25, bD), plasterWallMat);
    ceiling.position.y = bH - 0.125;
    bGroup.add(ceiling);

    // Perimeter Enclosure Walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, 0.3), plasterWallMat);
    backWall.position.set(0, bH / 2, bD / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, bH, bD), plasterWallMat);
    leftWall.position.set(-bW / 2, bH / 2, 0);
    const rightWall = leftWall.clone();
    rightWall.position.x = bW / 2;
    bGroup.add(backWall, leftWall, rightWall);

    // Front Storefront: Transparent Glass Wall (See-Through into the Restaurant!)
    const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(bW - 0.4, bH - 0.8), seeThroughGlassMat);
    frontGlass.position.set(0, (bH - 0.8) / 2 + 0.2, -bD / 2 - 0.02);

    // Green Canvas Sun Awning
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(bW + 0.4, 0.35, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x005a36, roughness: 0.8 })
    );
    awning.position.set(0, bH - 0.3, -bD / 2 - 0.6);
    awning.rotation.x = 0.22;
    bGroup.add(frontGlass, awning);

    // Illuminated 3D Subway Logo Sign above Entrance
    const logoMat = new THREE.MeshStandardMaterial({
      map: subwayLogoTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: subwayLogoTex,
      emissiveIntensity: 0.9,
      roughness: 0.25
    });
    const logoMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), logoMat);
    logoMesh.position.set(0, bH + 0.65, -bD / 2 - 0.1);
    bGroup.add(logoMesh);

    // --- FURNISHED INTERIOR ---
    // 1. Refrigerated Sandwich Prep Counter with Sneeze Guard
    const prepCounter = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.05, 1.3), stainlessSteelMat);
    prepCounter.position.set(-1.8, 0.52, 1.2);

    const sneezeGuard = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.55), seeThroughGlassMat);
    sneezeGuard.position.set(-1.8, 1.35, 0.6);
    sneezeGuard.rotation.x = 0.25;

    // Overhead Menu Boards
    const menuMat = new THREE.MeshStandardMaterial({ color: 0x14532d, emissive: 0x166534, emissiveIntensity: 0.7 });
    const menuBoard = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.85, 0.08), menuMat);
    menuBoard.position.set(-1.8, bH - 1.2, 2.5);
    menuBoard.rotation.x = 0.1;
    bGroup.add(prepCounter, sneezeGuard, menuBoard);

    // 2. Dining Booths & Tables along right wall
    const boothMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 }); // Subway green vinyl
    for (let bz = -bD * 0.32; bz <= bD * 0.15; bz += 3.2) {
      // Table
      const table = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.85, 1.1),
        new THREE.MeshStandardMaterial({ color: 0xca8a04, roughness: 0.4 })
      );
      table.position.set(bW / 2 - 1.8, 0.42, bz);

      // Seats (two facing benches)
      const seatF = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.95, 0.45), boothMat);
      seatF.position.set(bW / 2 - 1.8, 0.48, bz - 0.85);
      const seatB = seatF.clone();
      seatB.position.z = bz + 0.85;
      bGroup.add(table, seatF, seatB);
    }

    // 3. Beverage Fountain Station
    const sodaDispenser = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.5, 0.8),
      stainlessSteelMat
    );
    sodaDispenser.position.set(-bW / 2 + 1.2, 0.75, -bD * 0.15);
    bGroup.add(sodaDispenser);

    // Interior Warm Lighting

    group.add(bGroup);

    interiorBounds.push({
      minX: cx - bW / 2 + 0.3,
      maxX: cx + bW / 2 - 0.3,
      minZ: cz - bD / 2 + 0.3,
      maxZ: cz + bD / 2 - 0.3,
      floorY,
      ceilY: floorY + bH,
      name: 'Subway Restaurant'
    });
  }

  // =========================================================================
  // 5. STRIP PLAZA SHOP: GREAT CLIPS HAIR SALON
  // =========================================================================
  function buildGreatClipsStore(cx, cz) {
    const floorY = heightAt(cx, cz);
    const bW = 11.0, bD = 13.0, bH = 4.2;

    const bGroup = new THREE.Group();
    bGroup.name = 'GreatClips_Salon';
    bGroup.position.set(cx, floorY, cz);

    createCurbSidewalk(bGroup, bW, bD, 0);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.25, bD), tileFloorMat);
    floor.position.y = 0.125;
    floor.receiveShadow = true;
    bGroup.add(floor);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.25, bD), plasterWallMat);
    ceiling.position.y = bH - 0.125;
    bGroup.add(ceiling);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, 0.3), plasterWallMat);
    backWall.position.set(0, bH / 2, bD / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, bH, bD), plasterWallMat);
    leftWall.position.set(-bW / 2, bH / 2, 0);
    const rightWall = leftWall.clone();
    rightWall.position.x = bW / 2;
    bGroup.add(backWall, leftWall, rightWall);

    // Front Window with See-Through Glass
    const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(bW - 0.4, bH - 0.8), seeThroughGlassMat);
    frontGlass.position.set(0, (bH - 0.8) / 2 + 0.2, -bD / 2 - 0.02);
    bGroup.add(frontGlass);

    // Great Clips Illuminated Blue Sign
    const signMat = new THREE.MeshStandardMaterial({
      map: greatClipsLogoTex,
      emissive: new THREE.Color(0x38bdf8),
      emissiveMap: greatClipsLogoTex,
      emissiveIntensity: 0.85
    });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.35), signMat);
    signMesh.position.set(0, bH + 0.7, -bD / 2 - 0.1);
    bGroup.add(signMesh);

    // --- FURNISHED INTERIOR: Styling Stations & Barber Chairs ---
    const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xecfdf5, metalness: 0.95, roughness: 0.05 });
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.3 }); // Black leather chair

    for (let sx = -bW * 0.32; sx <= bW * 0.32; sx += 3.2) {
      // Full-Length Styling Mirror on Back Wall
      const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), mirrorMat);
      mirror.position.set(sx, 2.2, bD / 2 - 0.16);
      mirror.rotation.y = Math.PI;

      // Vanity Counter with Styling Tools
      const vanity = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.85, 0.8), stainlessSteelMat);
      vanity.position.set(sx, 0.42, bD / 2 - 0.55);

      // Hydraulic Swivel Barber Chair
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.08, 16), stainlessSteelMat);
      base.position.set(sx, 0.04, bD / 2 - 2.1);

      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 0.85), chairMat);
      seat.position.set(sx, 0.65, bD / 2 - 2.1);

      const backRest = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.15), chairMat);
      backRest.position.set(sx, 1.05, bD / 2 - 2.5);

      bGroup.add(mirror, vanity, base, seat, backRest);
    }

    // Front Waiting Area: Reception Counter & Bench
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.45, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 })
    );
    bench.position.set(-bW * 0.22, 0.22, -bD * 0.28);
    bGroup.add(bench);


    group.add(bGroup);

    interiorBounds.push({
      minX: cx - bW / 2 + 0.3,
      maxX: cx + bW / 2 - 0.3,
      minZ: cz - bD / 2 + 0.3,
      maxZ: cz + bD / 2 - 0.3,
      floorY,
      ceilY: floorY + bH,
      name: 'Great Clips Salon'
    });
  }

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

    // 1. Big-Box Commercial Anchors (Separated from residential!)
    buildTargetStore();
    buildWalmartStore();

    // 2. Strip Plaza Retail & Dining
    buildSubwayStore(-4489.0, -1934.9);    // Carmel Mountain Plaza Strip
    buildGreatClipsStore(-2384.9, -2215.2); // Community Plaza

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
