/**
 * Procedural Exterior Facade & Wall Kit (AAA Photorealistic SoCal Architecture)
 * Strict Architectural Grammar & Distinct Typology for each style:
 *
 * 1. Spanish Colonial Revival / Mission Villa:
 *    - Asymmetric massing with projecting entry tower / mirador wing
 *    - Deeply recessed punched windows with terracotta sills & wrought-iron rejas (grilles)
 *    - Arched feature windows on upper gallery
 *    - Cantilevered 2nd floor Juliet balcony with ornate wrought-iron scrollwork railing & carved corbels
 *    - Recessed arched loggia entry portico with keystone
 *    - Heavy rustic arched timber door with iron clavos (decorative studs) & coach lanterns
 *    - Arched wooden carriage garage doors
 *
 * 2. California Modern Ranch:
 *    - Sprawling low-slung horizontal silhouette
 *    - 1.05m red running-bond brick / flagstone wainscoting with bevelled cut-stone cap ledge
 *    - Full-width covered front veranda porch with solid 6x6 exposed timber posts, cross-beams, and corbels
 *    - Prominent 3.2m front living room picture window with divided lites
 *    - Horizontal bedroom ribbon windows with clean white trim casings
 *    - Recessed mid-century front door with vertical frosted sidelite window
 *    - Attached 2-car garage with horizontal grooved panels and upper windows
 *
 * 3. Contemporary Luxury Hillside Box:
 *    - Interlocking stacked rectilinear volumes with cantilevered upper box
 *    - Contrasting materials: California smooth white stucco + horizontal warm cedar wood rainscreen slats
 *    - Minimalist black anodized aluminum floor-to-ceiling curtain wall glazing & wrap-around corner glass
 *    - Cantilevered upper balcony / sky terrace with frameless structural tempered glass balustrades
 *    - Grand 2.6m tall modern pivot door with full-height brushed steel vertical pull bar & LED downlights
 *    - Modern frosted-glass aluminum panel garage door
 *
 * 4. Commercial Strip / Poway Plaza (Large Accurate Commercial Frontage):
 *    - Wide commercial retail frontage (24m - 48m wide) with rhythmic 6-8m structural store bays
 *    - Full-height aluminum commercial storefront glazing with transoms and kickplates
 *    - Aluminum double commercial entry glass doors with panic push bars
 *    - Continuous illuminated fascia marquee sign band with authentic glowing 3D signage
 *    - Deep canvas sun awnings over retail entrances
 *    - Rear industrial steel service exit doors with security lighting and loading dock bumpers
 *
 * 5. Suburban Family 2-Story:
 *    - Balanced symmetrical suburban facade with corner boards
 *    - Colonial 6-over-6 double-hung windows with decorative louvered window shutters
 *    - Classical covered entry portico with square columns and pediment
 *    - 6-panel fiberglass front door with arched fanlight transom overhead
 *    - Upper floor balcony with turned white balusters and handrails
 *    - 2-car raised panel garage door with decorative carriage hardware
 */
import * as THREE from 'three';

export class FacadeGenerator {
  constructor(textureFactory) {
    this.tex = textureFactory;
  }

  generate(options) {
    const {
      width = 14,
      depth = 16,
      height = 6.2,
      stories = 2,
      style = 'spanish_tile',
      wallColor = 0xebe5d8,
      hasGarage = true,
      balconyStyle = null,
      doorStyle = null,
      windowStyle = null
    } = options;

    const group = new THREE.Group();
    group.name = 'ExteriorFacade';

    // Normalize style key
    const s = (style || '').toLowerCase();

    if (s.includes('commercial') || s === 'commercial_flat') {
      return this.buildCommercialPlaza(group, width, depth, height, stories, wallColor);
    } else if (s.includes('ranch') || s === 'poway_ranch') {
      return this.buildCaliforniaRanch(group, width, depth, height, stories, wallColor, hasGarage);
    } else if (s.includes('modern') || s === 'modern_luxury' || s === 'modern_shed') {
      return this.buildModernLuxury(group, width, depth, height, stories, wallColor, hasGarage);
    } else if (s.includes('suburban') || s === 'suburban_2story' || s === 'shingle_gable') {
      return this.buildSuburbanFamily(group, width, depth, height, stories, wallColor, hasGarage);
    } else {
      // Default / Spanish Villa / Mission Revival
      return this.buildSpanishVilla(group, width, depth, height, stories, wallColor, hasGarage);
    }
  }

  // =========================================================================
  // 1. SPANISH COLONIAL REVIVAL / MISSION VILLA
  // =========================================================================
  buildSpanishVilla(group, width, depth, height, stories, wallColor, hasGarage) {
    const wallMat = this.tex.getStucco(wallColor || 0xebe5d8);
    wallMat.map.repeat.set(width * 0.4, height * 0.4);
    wallMat.normalMap.repeat.set(width * 0.4, height * 0.4);

    const glassMat = this.tex.getGlass();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1f1d19, roughness: 0.4, metalness: 0.2 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf5eedf, roughness: 0.7 });
    const woodDoorMat = new THREE.MeshStandardMaterial({ color: 0x3d2012, roughness: 0.5 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.85 });
    const tileSillMat = new THREE.MeshStandardMaterial({ color: 0xa84e32, roughness: 0.75 }); // Terracotta sill

    const wallThick = 0.32;
    const halfW = width / 2;
    const halfD = depth / 2;
    const storyH = height / stories;

    // Concrete Plinth / Water Table Foundation Base
    const baseSill = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.12, 0.4, depth + 0.12),
      new THREE.MeshStandardMaterial({ color: 0x827c70, roughness: 0.9 })
    );
    baseSill.position.set(0, 0.2, 0);
    baseSill.castShadow = baseSill.receiveShadow = true;
    group.add(baseSill);

    // Main Perimeter Stucco Walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallThick), wallMat);
    backWall.position.set(0, height / 2, halfD - wallThick / 2);
    backWall.castShadow = backWall.receiveShadow = true;

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, depth), wallMat);
    leftWall.position.set(-halfW + wallThick / 2, height / 2, 0);
    leftWall.castShadow = leftWall.receiveShadow = true;

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, depth), wallMat);
    rightWall.position.set(halfW - wallThick / 2, height / 2, 0);
    rightWall.castShadow = rightWall.receiveShadow = true;

    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallThick), wallMat);
    frontWall.position.set(0, height / 2, -halfD + wallThick / 2);
    frontWall.castShadow = frontWall.receiveShadow = true;

    group.add(backWall, leftWall, rightWall, frontWall);

    // Asymmetric Massing: Projecting Spanish Tower / Mirador Wing on Left Side
    const towerW = Math.min(5.5, width * 0.36);
    const towerD = 2.2;
    const towerH = height + (stories > 1 ? 0.9 : 0.6);
    const towerX = -halfW + towerW / 2;
    const towerZ = -halfD - towerD / 2 + wallThick;

    const towerMesh = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerD), wallMat);
    towerMesh.position.set(towerX, towerH / 2, towerZ);
    towerMesh.castShadow = towerMesh.receiveShadow = true;
    group.add(towerMesh);

    // Decorative Talavera / Azulejo Tile Frieze Belt along upper tower
    const azulejoMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.2,
      metalness: 0.1
    });
    const frieze = new THREE.Mesh(new THREE.BoxGeometry(towerW + 0.08, 0.22, towerD + 0.08), azulejoMat);
    frieze.position.set(towerX, towerH - 0.4, towerZ);
    frieze.castShadow = true;
    group.add(frieze);

    // Helper: Add Punched Recessed Spanish Window with Terracotta Sill
    const addSpanishWindow = (x, y, z, rotY = 0, winW = 1.3, winH = 1.6, isArched = false, hasReja = false) => {
      const winGroup = new THREE.Group();

      const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
      glass.position.z = 0.04;

      // Projecting Terracotta Quarry Tile Sill
      const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.3, 0.14, 0.28), tileSillMat);
      sill.position.set(0, -winH / 2 - 0.07, 0.08);
      sill.castShadow = true;

      // Thick Stucco Reveal / Outer Architrave
      const trimW = 0.09, trimThick = 0.07;
      const tTop = new THREE.Mesh(new THREE.BoxGeometry(winW + trimW * 2, trimW, trimThick), trimMat);
      tTop.position.set(0, winH / 2 + trimW / 2, 0.03);
      const tLeft = new THREE.Mesh(new THREE.BoxGeometry(trimW, winH, trimThick), trimMat);
      tLeft.position.set(-winW / 2 - trimW / 2, 0, 0.03);
      const tRight = tLeft.clone();
      tRight.position.x = winW / 2 + trimW / 2;

      // Dark Wood / Bronze Mullions
      const fHoriz = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.04, 0.05), frameMat);
      const fVert = new THREE.Mesh(new THREE.BoxGeometry(0.04, winH, 0.05), frameMat);
      winGroup.add(glass, sill, tTop, tLeft, tRight, fHoriz, fVert);

      // Upper Arch Feature if specified
      if (isArched) {
        const archGeom = new THREE.TorusGeometry(winW / 2, 0.09, 8, 16, Math.PI);
        const arch = new THREE.Mesh(archGeom, trimMat);
        arch.position.set(0, winH / 2, 0.03);
        arch.rotation.z = Math.PI;
        arch.castShadow = true;
        winGroup.add(arch);
      }

      // Wrought-Iron Window Grille (Reja) on lower floor
      if (hasReja) {
        const rejaGroup = new THREE.Group();
        const bars = 5;
        for (let b = 0; b < bars; b++) {
          const bx = (b / (bars - 1) - 0.5) * (winW - 0.22);
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, winH + 0.12, 6), ironMat);
          bar.position.set(bx, 0, 0.16);
          bar.castShadow = true;
          rejaGroup.add(bar);
        }
        // Top and bottom decorative cross rails
        const railT = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.12, 0.03, 0.03), ironMat);
        railT.position.set(0, winH * 0.44, 0.16);
        const railB = railT.clone();
        railB.position.y = -winH * 0.44;
        rejaGroup.add(railT, railB);
        winGroup.add(rejaGroup);
      }

      winGroup.position.set(x, y, z);
      winGroup.rotation.y = rotY;
      group.add(winGroup);
    };

    // Windows on Tower Wing:
    addSpanishWindow(towerX, storyH * 0.55, towerZ - towerD / 2, 0, 1.4, 1.7, false, true); // Ground floor with Reja
    if (stories > 1) {
      addSpanishWindow(towerX, storyH * 1.55, towerZ - towerD / 2, 0, 1.3, 1.8, true, false); // Upper floor arched
    }

    // Front Entrance: Recessed Arched Loggia Portico & Rustic Timber Door
    const doorW = 1.25, doorH = 2.45;
    const doorX = hasGarage ? 0.3 : halfW * 0.3;
    const doorZ = -halfD;

    const entryGroup = new THREE.Group();

    // Terracotta Tile Porch Steps
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.8, 0.18, 1.8), tileSillMat);
    step1.position.set(doorX, 0.09, doorZ - 0.9);
    step1.castShadow = step1.receiveShadow = true;
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.3, 0.18, 1.2), tileSillMat);
    step2.position.set(doorX, 0.27, doorZ - 0.6);
    step2.castShadow = step2.receiveShadow = true;
    entryGroup.add(step1, step2);

    // Heavy Rustic Timber Arched Door
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.1), woodDoorMat);
    door.position.set(doorX, doorH / 2 + 0.36, doorZ - 0.02);
    door.castShadow = true;

    // Iron Clavos (Decorative Pyramid Studs) on Door
    for (let py = 0.5; py <= 2.2; py += 0.4) {
      for (let px = -0.4; px <= 0.4; px += 0.4) {
        const clavo = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.025), ironMat);
        clavo.position.set(doorX + px, py + 0.36, doorZ - 0.08);
        entryGroup.add(clavo);
      }
    }

    // Heavy Forged Iron Ring Latch
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12), ironMat);
    ring.position.set(doorX + doorW * 0.36, 1.35, doorZ - 0.09);
    ring.castShadow = true;
    entryGroup.add(door, ring);

    // Arched Portico Columns & Keystone
    const pierL = new THREE.Mesh(new THREE.BoxGeometry(0.38, doorH + 0.15, 0.38), wallMat);
    pierL.position.set(doorX - doorW / 2 - 0.38, (doorH + 0.15) / 2 + 0.36, doorZ - 0.95);
    pierL.castShadow = true;
    const pierR = pierL.clone();
    pierR.position.x = doorX + doorW / 2 + 0.38;

    const archRing = new THREE.Mesh(
      new THREE.TorusGeometry((doorW + 0.76) / 2, 0.19, 8, 16, Math.PI),
      wallMat
    );
    archRing.position.set(doorX, doorH + 0.51, doorZ - 0.95);
    archRing.rotation.z = Math.PI;
    archRing.castShadow = true;

    const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.28), trimMat);
    keystone.position.set(doorX, doorH + 0.51 + (doorW + 0.76) / 2, doorZ - 0.95);
    keystone.castShadow = true;

    // Spanish Carriage Sconce Lanterns
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xfff0d0, emissive: 0xffaa44, emissiveIntensity: 1.0
    });
    for (const lx of [doorX - doorW / 2 - 0.38, doorX + doorW / 2 + 0.38]) {
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), lanternMat);
      lantern.position.set(lx, 2.1, doorZ - 0.2);
      lantern.castShadow = true;
      const lLight = new THREE.PointLight(0xffa834, 1.4, 6, 2.0);
      lLight.position.copy(lantern.position);
      lLight.position.z -= 0.15;
      entryGroup.add(lantern, lLight);
    }

    entryGroup.add(pierL, pierR, archRing, keystone);
    group.add(entryGroup);

    // BALCONY: Cantilevered Juliet Balcony with Wrought-Iron Balustrade on 2nd Floor
    if (stories > 1) {
      const balcGroup = new THREE.Group();
      const balcW = 3.6, balcD = 1.3, balcH = 1.05;
      const balcX = doorX;
      const balcY = storyH + 0.15;
      const balcZ = -halfD - balcD / 2;

      // Cantilevered Stucco Slab
      const slab = new THREE.Mesh(new THREE.BoxGeometry(balcW, 0.28, balcD), wallMat);
      slab.position.set(balcX, balcY, balcZ);
      slab.castShadow = slab.receiveShadow = true;

      // Decorative Carved Stone Corbel Brackets underneath balcony
      for (const cx of [-balcW * 0.35, 0, balcW * 0.35]) {
        const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.45, balcD * 0.8), trimMat);
        corbel.position.set(balcX + cx, balcY - 0.35, balcZ + balcD * 0.1);
        corbel.castShadow = true;
        balcGroup.add(corbel);
      }

      // Wrought-Iron Balustrade Railing (Front and Sides)
      const railH = balcH;
      const topRailF = new THREE.Mesh(new THREE.BoxGeometry(balcW, 0.05, 0.05), ironMat);
      topRailF.position.set(balcX, balcY + railH, balcZ - balcD / 2);
      const botRailF = topRailF.clone();
      botRailF.position.y = balcY + 0.15;

      // Vertical Wrought-Iron Spindles
      const spindles = 14;
      for (let s = 0; s <= spindles; s++) {
        const sx = (s / spindles - 0.5) * (balcW - 0.1);
        const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, railH - 0.15, 6), ironMat);
        spindle.position.set(balcX + sx, balcY + railH / 2 + 0.07, balcZ - balcD / 2);
        spindle.castShadow = true;
        balcGroup.add(spindle);
      }

      // Balcony French Doors
      const frenchDoorW = 1.6, frenchDoorH = 2.2;
      const frenchDoor = new THREE.Mesh(new THREE.PlaneGeometry(frenchDoorW, frenchDoorH), glassMat);
      frenchDoor.position.set(balcX, balcY + frenchDoorH / 2 + 0.14, -halfD - 0.02);
      balcGroup.add(slab, topRailF, botRailF, frenchDoor);
      group.add(balcGroup);
    }

    // Garage: Arched Wooden Carriage Garage Door
    if (hasGarage && width > 12) {
      const gw = 5.2, gh = 2.5;
      const gx = halfW * 0.52;
      const gz = -halfD;

      const gDoor = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, 0.09), woodDoorMat);
      gDoor.position.set(gx, gh / 2 + 0.2, gz - 0.02);
      gDoor.castShadow = true;

      // Stucco Trim Arch overhead
      const gArch = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.4, 0.22, 0.16), trimMat);
      gArch.position.set(gx, gh + 0.32, gz - 0.04);
      gArch.castShadow = true;
      group.add(gDoor, gArch);
    }

    // Side Punched Windows
    for (let s = 0; s < stories; s++) {
      const wy = s * storyH + storyH * 0.55;
      addSpanishWindow(-halfW, wy, depth * 0.15, Math.PI / 2, 1.2, 1.5, false, s === 0);
      addSpanishWindow(halfW, wy, -depth * 0.15, -Math.PI / 2, 1.2, 1.5, false, s === 0);
      addSpanishWindow(halfW, wy, depth * 0.25, -Math.PI / 2, 1.2, 1.5, false, false);
    }

    return group;
  }

  // =========================================================================
  // 2. CALIFORNIA MODERN RANCH
  // =========================================================================
  buildCaliforniaRanch(group, width, depth, height, stories, wallColor, hasGarage) {
    const wallMat = this.tex.getStucco(wallColor || 0xd6c2a8);
    const brickMat = this.tex.getBrick();
    brickMat.map.repeat.set(width * 0.5, 1.0);
    brickMat.normalMap.repeat.set(width * 0.5, 1.0);

    const stoneCapMat = new THREE.MeshStandardMaterial({ color: 0xd0c8bc, roughness: 0.8 });
    const woodPostMat = new THREE.MeshStandardMaterial({ color: 0x422a1d, roughness: 0.7 }); // Stained timber
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }); // Crisp white trim
    const glassMat = this.tex.getGlass();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });

    const wallThick = 0.26;
    const halfW = width / 2;
    const halfD = depth / 2;
    const storyH = height / stories;

    // 1.05m Red Brick Wainscoting along lower perimeter
    const wainscotH = 1.05;
    const bFront = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, wainscotH, wallThick + 0.08), brickMat);
    bFront.position.set(0, wainscotH / 2, -halfD + wallThick / 2);
    bFront.castShadow = true;
    const bBack = bFront.clone();
    bBack.position.z = halfD - wallThick / 2;

    const bLeft = new THREE.Mesh(new THREE.BoxGeometry(wallThick + 0.08, wainscotH, depth + 0.08), brickMat);
    bLeft.position.set(-halfW + wallThick / 2, wainscotH / 2, 0);
    const bRight = bLeft.clone();
    bRight.position.x = halfW - wallThick / 2;

    // Bevelled Cut-Stone Cap Ledge on top of wainscoting
    const capFront = new THREE.Mesh(new THREE.BoxGeometry(width + 0.14, 0.08, wallThick + 0.14), stoneCapMat);
    capFront.position.set(0, wainscotH + 0.04, -halfD + wallThick / 2);
    capFront.castShadow = true;

    group.add(bFront, bBack, bLeft, bRight, capFront);

    // Stucco Upper Perimeter Walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, height - wainscotH, wallThick), wallMat);
    backWall.position.set(0, (height + wainscotH) / 2, halfD - wallThick / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height - wainscotH, depth), wallMat);
    leftWall.position.set(-halfW + wallThick / 2, (height + wainscotH) / 2, 0);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height - wainscotH, depth), wallMat);
    rightWall.position.set(halfW - wallThick / 2, (height + wainscotH) / 2, 0);
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(width, height - wainscotH, wallThick), wallMat);
    frontWall.position.set(0, (height + wainscotH) / 2, -halfD + wallThick / 2);

    group.add(backWall, leftWall, rightWall, frontWall);

    // BROAD COVERED FRONT PORCH (Veranda) with 6x6 Timber Posts & Corbel Ties
    const porchW = width * 0.55;
    const porchD = 2.4;
    const porchH = storyH * 0.95;
    const porchX = -halfW * 0.25;
    const porchZ = -halfD - porchD / 2;

    // Concrete Porch Deck
    const porchDeck = new THREE.Mesh(
      new THREE.BoxGeometry(porchW + 0.4, 0.2, porchD),
      new THREE.MeshStandardMaterial({ color: 0x999388, roughness: 0.9 })
    );
    porchDeck.position.set(porchX, 0.1, porchZ);
    porchDeck.receiveShadow = true;

    // Timber Posts along front edge
    const posts = 4;
    const postGroup = new THREE.Group();
    for (let p = 0; p < posts; p++) {
      const px = porchX + (p / (posts - 1) - 0.5) * porchW;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, porchH, 0.18), woodPostMat);
      post.position.set(px, porchH / 2 + 0.2, -halfD - porchD + 0.12);
      post.castShadow = true;

      // Stone Pedestal at base of timber post
      const basePed = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.45, 0.32), stoneCapMat);
      basePed.position.set(px, 0.42, -halfD - porchD + 0.12);
      basePed.castShadow = true;

      postGroup.add(post, basePed);
    }

    // Heavy Header Beam across porch top
    const beam = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.5, 0.24, 0.2), woodPostMat);
    beam.position.set(porchX, porchH + 0.18, -halfD - porchD + 0.12);
    beam.castShadow = true;
    postGroup.add(beam);

    group.add(porchDeck, postGroup);

    // Recessed Mid-Century Front Door with Sidelite Window
    const doorX = porchX - porchW * 0.22;
    const doorZ = -halfD;
    const doorW = 1.1, doorH = 2.3;

    const doorMat = new THREE.MeshStandardMaterial({ color: 0x244238, roughness: 0.4 }); // Dark sage green
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.08), doorMat);
    doorMesh.position.set(doorX, doorH / 2 + 0.2, doorZ - 0.02);
    doorMesh.castShadow = true;

    // Vertical Sidelite Glass Window
    const sideLite = new THREE.Mesh(new THREE.PlaneGeometry(0.42, doorH), glassMat);
    sideLite.position.set(doorX + doorW / 2 + 0.25, doorH / 2 + 0.2, doorZ - 0.04);

    // Door Frame Surround
    const doorTrim = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.65, doorH + 0.15, 0.12), trimMat);
    doorTrim.position.set(doorX + 0.15, (doorH + 0.15) / 2 + 0.2, doorZ - 0.03);

    group.add(doorMesh, sideLite, doorTrim);

    // PROMINENT FRONT LIVING ROOM PICTURE WINDOW (3.2m Wide with Divided Lites)
    const picW = 3.2, picH = 1.6;
    const picX = porchX + porchW * 0.22;
    const picY = wainscotH + picH / 2 + 0.15;

    const picGlass = new THREE.Mesh(new THREE.PlaneGeometry(picW, picH), glassMat);
    picGlass.position.set(picX, picY, -halfD - 0.02);

    const picTrim = new THREE.Mesh(new THREE.BoxGeometry(picW + 0.2, picH + 0.2, 0.08), trimMat);
    picTrim.position.set(picX, picY, -halfD - 0.01);

    // Horizontal Mullions
    for (let my of [-picH * 0.28, picH * 0.28]) {
      const mul = new THREE.Mesh(new THREE.BoxGeometry(picW, 0.04, 0.05), frameMat);
      mul.position.set(picX, picY + my, -halfD - 0.03);
      group.add(mul);
    }
    group.add(picGlass, picTrim);

    // Attached 2-Car Garage with Horizontal Grooved Carriage Door
    if (hasGarage && width > 14) {
      const gw = 5.4, gh = 2.4;
      const gx = halfW * 0.58;
      const gz = -halfD;

      const gDoorMat = new THREE.MeshStandardMaterial({ color: 0xf5f3ea, roughness: 0.6 });
      const gDoor = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, 0.08), gDoorMat);
      gDoor.position.set(gx, gh / 2 + 0.2, gz - 0.02);
      gDoor.castShadow = true;

      // Upper Carriage Window Row
      for (let wx = -gw * 0.36; wx <= gw * 0.36; wx += 1.25) {
        const gwWin = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.35), glassMat);
        gwWin.position.set(gx + wx, gh * 0.84 + 0.2, gz - 0.07);
        group.add(gwWin);
      }
      group.add(gDoor);
    }

    return group;
  }

  // =========================================================================
  // 3. CONTEMPORARY LUXURY HILLSIDE BOX
  // =========================================================================
  buildModernLuxury(group, width, depth, height, stories, wallColor, hasGarage) {
    const stuccoMat = this.tex.getStucco(wallColor || 0xf8f9fa);
    const cedarMat = this.tex.getCedarWood();
    cedarMat.map.repeat.set(width * 0.3, height * 0.3);
    cedarMat.normalMap.repeat.set(width * 0.3, height * 0.3);

    const metalPanelMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d20,
      roughness: 0.3,
      metalness: 0.8
    });
    const glassMat = this.tex.getGlass();
    const blackFrameMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.7 });

    const wallThick = 0.28;
    const halfW = width / 2;
    const halfD = depth / 2;
    const storyH = height / stories;

    // Ground Floor Concrete / Stucco Base Volume
    const baseWall = new THREE.Mesh(new THREE.BoxGeometry(width, storyH, depth), stuccoMat);
    baseWall.position.set(0, storyH / 2, 0);
    baseWall.castShadow = baseWall.receiveShadow = true;
    group.add(baseWall);

    // Interlocking Upper Box: Cantilevered 1.4m forward with Horizontal Cedar Cladding
    if (stories > 1) {
      const upperW = width * 0.75;
      const upperD = depth * 0.85;
      const upperH = height - storyH;
      const upperX = -halfW * 0.18;
      const upperZ = -halfD * 0.15;

      const upperBox = new THREE.Mesh(new THREE.BoxGeometry(upperW, upperH, upperD), cedarMat);
      upperBox.position.set(upperX, storyH + upperH / 2, upperZ);
      upperBox.castShadow = upperBox.receiveShadow = true;
      group.add(upperBox);

      // Black Metal Perimeter Fascia Band along roofline
      const roofBand = new THREE.Mesh(new THREE.BoxGeometry(upperW + 0.14, 0.24, upperD + 0.14), metalPanelMat);
      roofBand.position.set(upperX, height + 0.12, upperZ);
      roofBand.castShadow = true;
      group.add(roofBand);

      // Floor-to-Ceiling Anodized Black Aluminum Curtain Glazing on Upper Level
      const curW = upperW * 0.65, curH = upperH * 0.85;
      const curZ = upperZ - upperD / 2 - 0.02;
      const curGlass = new THREE.Mesh(new THREE.PlaneGeometry(curW, curH), glassMat);
      curGlass.position.set(upperX, storyH + curH / 2 + 0.1, curZ);

      // Aluminum Mullions Grid
      const mullions = 4;
      for (let m = 0; m <= mullions; m++) {
        const mx = upperX + (m / mullions - 0.5) * curW;
        const mul = new THREE.Mesh(new THREE.BoxGeometry(0.06, curH, 0.08), blackFrameMat);
        mul.position.set(mx, storyH + curH / 2 + 0.1, curZ);
        group.add(mul);
      }
      group.add(curGlass);

      // UPPER CANTILEVERED BALCONY / SKY TERRACE with Frameless Glass Balustrade
      const balcW = width * 0.42;
      const balcD = 2.2;
      const balcX = halfW * 0.45;
      const balcY = storyH;
      const balcZ = -halfD - balcD / 2 + 0.4;

      // Cantilevered Slab
      const slab = new THREE.Mesh(new THREE.BoxGeometry(balcW, 0.28, balcD), metalPanelMat);
      slab.position.set(balcX, balcY, balcZ);
      slab.castShadow = slab.receiveShadow = true;

      // Frameless Tempered Glass Balustrades
      const glassRailF = new THREE.Mesh(new THREE.PlaneGeometry(balcW, 1.05), glassMat);
      glassRailF.position.set(balcX, balcY + 0.66, balcZ - balcD / 2);

      const glassRailR = new THREE.Mesh(new THREE.PlaneGeometry(balcD, 1.05), glassMat);
      glassRailR.rotation.y = Math.PI / 2;
      glassRailR.position.set(balcX + balcW / 2, balcY + 0.66, balcZ);

      // Stainless Steel Spigot Mounts along base of glass
      const spigotMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.1 });
      for (let sx = -balcW * 0.45; sx <= balcW * 0.45; sx += balcW * 0.3) {
        const spigot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), spigotMat);
        spigot.position.set(balcX + sx, balcY + 0.22, balcZ - balcD / 2);
        group.add(spigot);
      }

      group.add(slab, glassRailF, glassRailR);
    }

    // GRAND 2.6M MODERN ARCHITECTURAL PIVOT DOOR
    const doorW = 1.35, doorH = 2.65;
    const doorX = -halfW * 0.22;
    const doorZ = -halfD;

    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.08), metalPanelMat);
    doorMesh.position.set(doorX, doorH / 2 + 0.1, doorZ - 0.02);
    doorMesh.castShadow = true;

    // Full-Height Brushed Stainless Steel Vertical Pull Bar (1.8m tall)
    const pullBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 1.8, 12),
      new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 0.9, roughness: 0.15 })
    );
    pullBar.position.set(doorX + doorW * 0.38, doorH * 0.52 + 0.1, doorZ - 0.09);
    pullBar.castShadow = true;

    // Recessed Modern Soffit LED Downlights
    const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff5ea, emissiveIntensity: 1.2 });
    const led = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12), ledMat);
    led.position.set(doorX, doorH + 0.2, doorZ - 0.4);
    const ledLight = new THREE.PointLight(0xffeedd, 1.6, 6, 2.0);
    ledLight.position.copy(led.position);
    group.add(doorMesh, pullBar, led, ledLight);

    // Modern Frosted-Glass Garage Door with Black Anodized Frame
    if (hasGarage && width > 14) {
      const gw = 5.2, gh = 2.45;
      const gx = halfW * 0.52;
      const gz = -halfD;

      const gFrame = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, 0.08), blackFrameMat);
      gFrame.position.set(gx, gh / 2 + 0.1, gz - 0.02);
      gFrame.castShadow = true;

      // Frosted Glass Panels (4 rows x 4 cols)
      const pw = (gw - 0.4) / 4, ph = (gh - 0.4) / 4;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const px = gx + (c - 1.5) * pw;
          const py = (r + 0.5) * ph + 0.1;
          const panel = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.08, ph - 0.08), glassMat);
          panel.position.set(px, py, gz - 0.07);
          group.add(panel);
        }
      }
      group.add(gFrame);
    }

    return group;
  }

  // =========================================================================
  // 4. COMMERCIAL STRIP / POWAY PLAZA (Large Accurate Commercial Frontage)
  // =========================================================================
  buildCommercialPlaza(group, width, depth, height, stories, wallColor) {
    const stuccoMat = this.tex.getStucco(wallColor || 0xc4beaf);
    const glassMat = this.tex.getGlass();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.3, metalness: 0.7 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.85 });

    const wallThick = 0.35;
    const halfW = width / 2;
    const halfD = depth / 2;

    // Perimeter Commercial Envelope Walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallThick), stuccoMat);
    backWall.position.set(0, height / 2, halfD - wallThick / 2);
    backWall.castShadow = backWall.receiveShadow = true;

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, depth), stuccoMat);
    leftWall.position.set(-halfW + wallThick / 2, height / 2, 0);
    leftWall.castShadow = leftWall.receiveShadow = true;

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, depth), stuccoMat);
    rightWall.position.set(halfW - wallThick / 2, height / 2, 0);
    rightWall.castShadow = rightWall.receiveShadow = true;

    group.add(backWall, leftWall, rightWall);

    // Commercial Structural Storefront Bays (Rhythmic 7m bays)
    const bayWidth = 7.0;
    const numBays = Math.max(2, Math.floor(width / bayWidth));
    const actualBayW = width / numBays;

    const sfH = Math.min(3.4, height * 0.75);
    const sfZ = -halfD - 0.02;

    const storeTitles = ['POWAY TRADING POST', 'MISSION PHARMACY', 'VALLEY DINER', 'HARDWARE & FEED', 'CANYON COFFEE'];
    const awningColors = [0x1d4ed8, 0x15803d, 0xb91c1c, 0x475569];

    for (let b = 0; b < numBays; b++) {
      const bayX = (b - (numBays - 1) / 2) * actualBayW;

      // Masonry Pier dividing each retail bay
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.55, height, wallThick + 0.12), trimMat);
      pier.position.set(bayX - actualBayW / 2 + 0.275, height / 2, -halfD + wallThick / 2);
      pier.castShadow = true;
      group.add(pier);

      // Full-Height Anodized Aluminum Storefront Glazing
      const curW = actualBayW - 0.65;
      const sfGlass = new THREE.Mesh(new THREE.PlaneGeometry(curW, sfH), glassMat);
      sfGlass.position.set(bayX, sfH / 2 + 0.1, sfZ);

      // Aluminum Mullions
      const mullions = 4;
      for (let m = 0; m <= mullions; m++) {
        const mx = bayX + (m / mullions - 0.5) * curW;
        const mul = new THREE.Mesh(new THREE.BoxGeometry(0.06, sfH, 0.1), frameMat);
        mul.position.set(mx, sfH / 2 + 0.1, sfZ);
        mul.castShadow = true;
        group.add(mul);
      }

      // Horizontal Transom Rail
      const transom = new THREE.Mesh(new THREE.BoxGeometry(curW, 0.06, 0.1), frameMat);
      transom.position.set(bayX, sfH * 0.72 + 0.1, sfZ);
      group.add(sfGlass, transom);

      // Commercial Aluminum Double Glass Entry Doors with Push Bars
      const doorW = 1.9, doorH = 2.4;
      const pushBar = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.2, 0.04, 0.06), ironMat);
      pushBar.position.set(bayX, 1.05, sfZ - 0.06);
      group.add(pushBar);

      // CONTINUOUS ILLUMINATED FASICA MARQUEE SIGN BAND
      const signTitle = storeTitles[b % storeTitles.length];
      const signMat = this.tex.getCommercialSignage(signTitle, '#38bdf8');
      const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(curW * 0.85, 0.8), signMat);
      signBoard.position.set(bayX, sfH + 0.65, sfZ - 0.04);
      group.add(signBoard);

      // Canvas Sun Shade Awning over Storefront
      const awnColor = awningColors[b % awningColors.length];
      const awningMat = new THREE.MeshStandardMaterial({ color: awnColor, roughness: 0.85 });
      const awning = new THREE.Mesh(new THREE.BoxGeometry(curW, 0.35, 1.3), awningMat);
      awning.position.set(bayX, sfH + 0.2, sfZ - 0.55);
      awning.rotation.x = 0.22;
      awning.castShadow = true;
      group.add(awning);
    }

    // Rear Service Loading Dock & Steel Security Doors
    const rearDoor = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.3, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.4 })
    );
    rearDoor.position.set(-halfW * 0.35, 1.15, halfD - wallThick + 0.05);
    rearDoor.castShadow = true;

    // Industrial Yellow Safety Bollards
    const bollardMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 });
    for (const bx of [-halfW * 0.35 - 0.8, -halfW * 0.35 + 0.8]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 12), bollardMat);
      bollard.position.set(bx, 0.5, halfD + 0.4);
      bollard.castShadow = true;
      group.add(bollard);
    }
    group.add(rearDoor);

    return group;
  }

  // =========================================================================
  // 5. SUBURBAN FAMILY 2-STORY
  // =========================================================================
  buildSuburbanFamily(group, width, depth, height, stories, wallColor, hasGarage) {
    const wallMat = this.tex.getStucco(wallColor || 0xf5f5f0);
    const glassMat = this.tex.getGlass();
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const shutterMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.6 }); // Classic navy shutters
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.4 }); // Classic red front door

    const wallThick = 0.28;
    const halfW = width / 2;
    const halfD = depth / 2;
    const storyH = height / stories;

    // Perimeter Walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallThick), wallMat);
    backWall.position.set(0, height / 2, halfD - wallThick / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, depth), wallMat);
    leftWall.position.set(-halfW + wallThick / 2, height / 2, 0);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, depth), wallMat);
    rightWall.position.set(halfW - wallThick / 2, height / 2, 0);
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallThick), wallMat);
    frontWall.position.set(0, height / 2, -halfD + wallThick / 2);

    group.add(backWall, leftWall, rightWall, frontWall);

    // Colonial 6-over-6 Double-Hung Windows with Louvered Shutters
    const addColonialWindow = (x, y, z, rotY = 0) => {
      const winW = 1.25, winH = 1.6;
      const winGroup = new THREE.Group();

      const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
      glass.position.z = 0.03;

      const trim = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.16, winH + 0.16, 0.06), trimMat);
      trim.position.z = 0.02;

      // 6-pane Colonial Grid Mullions
      const h1 = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.03, 0.04), frameMat);
      h1.position.set(0, winH * 0.25, 0.04);
      const h2 = h1.clone();
      h2.position.y = -winH * 0.25;
      const v1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, winH, 0.04), frameMat);
      v1.position.set(0, 0, 0.04);

      // Louvered Shutters on Left & Right
      const shutterW = 0.38;
      const sLeft = new THREE.Mesh(new THREE.BoxGeometry(shutterW, winH, 0.04), shutterMat);
      sLeft.position.set(-winW / 2 - shutterW / 2 - 0.02, 0, 0.03);
      sLeft.castShadow = true;
      const sRight = sLeft.clone();
      sRight.position.x = winW / 2 + shutterW / 2 + 0.02;

      winGroup.add(glass, trim, h1, h2, v1, sLeft, sRight);
      winGroup.position.set(x, y, z);
      winGroup.rotation.y = rotY;
      group.add(winGroup);
    };

    // Front Windows on both stories
    for (let s = 0; s < stories; s++) {
      const wy = s * storyH + storyH * 0.55;
      addColonialWindow(-halfW * 0.55, wy, -halfD);
      if (s > 0) {
        addColonialWindow(0, wy, -halfD);
        addColonialWindow(halfW * 0.55, wy, -halfD);
      }
    }

    // Classical Front Portico with Pediment & Columns
    const doorX = hasGarage ? -halfW * 0.12 : 0;
    const doorZ = -halfD;
    const doorW = 1.1, doorH = 2.3;

    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.08), doorMat);
    doorMesh.position.set(doorX, doorH / 2 + 0.2, doorZ - 0.02);
    doorMesh.castShadow = true;

    // Arched Fanlight Transom overhead
    const transom = new THREE.Mesh(new THREE.CircleGeometry(doorW / 2, 16, 0, Math.PI), glassMat);
    transom.position.set(doorX, doorH + 0.22, doorZ - 0.03);
    group.add(doorMesh, transom);

    // Classical Columns & Overhead Roof
    const colMat = trimMat;
    const colL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, doorH + 0.2, 12), colMat);
    colL.position.set(doorX - doorW / 2 - 0.45, (doorH + 0.2) / 2 + 0.2, doorZ - 1.1);
    colL.castShadow = true;
    const colR = colL.clone();
    colR.position.x = doorX + doorW / 2 + 0.45;

    const porticoRoof = new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.4, 0.18, 1.4), trimMat);
    porticoRoof.position.set(doorX, doorH + 0.45, doorZ - 0.7);
    porticoRoof.castShadow = true;
    group.add(colL, colR, porticoRoof);

    // Raised Panel 2-Car Garage Door
    if (hasGarage && width > 13) {
      const gw = 5.2, gh = 2.45;
      const gx = halfW * 0.48;
      const gz = -halfD;

      const gDoor = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, 0.08), trimMat);
      gDoor.position.set(gx, gh / 2 + 0.2, gz - 0.02);
      gDoor.castShadow = true;
      group.add(gDoor);
    }

    return group;
  }
}
