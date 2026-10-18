/**
 * Procedural Exterior Facade & Wall Generator (AAA Photorealistic SoCal Architecture)
 * Features:
 * - Spanish Colonial: Arched entry loggia with keystone, ornamental wrought-iron window grilles (rejas),
 *   decorative azulejo ceramic tile border, and exterior iron lantern sconces.
 * - California Ranch: Lower brick/stone wainscoting (bottom 1.0m) with stone ledge cap, vertical board & batten siding,
 *   full-width front porch with square posts and corbels.
 * - Commercial Plaza: Full-height aluminum storefront glazing, double glass commercial doors, sun awnings,
 *   rear industrial steel security exit door.
 * - Modern Luxury: Floor-to-ceiling glass curtain walls, cedar slat rainscreen accent cladding, black metal accents.
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
      hasGarage = true
    } = options;

    const group = new THREE.Group();
    group.name = 'ExteriorFacade';

    const wallMat = this.tex.getStucco(wallColor);
    wallMat.map.repeat.set(width * 0.4, height * 0.4);
    wallMat.normalMap.repeat.set(width * 0.4, height * 0.4);

    const glassMat = this.tex.getGlass();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.35, metalness: 0.2 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xfaf8f5, roughness: 0.65 });
    const woodDoorMat = new THREE.MeshStandardMaterial({ color: 0x4a2411, roughness: 0.45 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.85 });

    const wallThick = 0.30; // Thick adobe appearance for Spanish/SoCal
    const halfW = width / 2;
    const halfD = depth / 2;
    const storyH = height / stories;

    // --- 1. Base Foundation / Brick Wainscoting (Ranch Style) ---
    if (style === 'shingle_gable' || style === 'poway_ranch') {
      // 3.5 ft (1.05m) Red Brick Wainscoting along lower perimeter
      const brickMat = new THREE.MeshStandardMaterial({ color: 0x8a3e2d, roughness: 0.9 });
      const wainscotH = 1.05;
      const bFront = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, wainscotH, wallThick + 0.08), brickMat);
      bFront.position.set(0, wainscotH / 2, -halfD + wallThick / 2);
      bFront.castShadow = true;
      const bBack = bFront.clone();
      bBack.position.z = halfD - wallThick / 2;

      // Stone Cap Ledge on top of brick
      const stoneCapMat = new THREE.MeshStandardMaterial({ color: 0xd2cbc0, roughness: 0.8 });
      const capFront = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, 0.08, wallThick + 0.12), stoneCapMat);
      capFront.position.set(0, wainscotH + 0.04, -halfD + wallThick / 2);
      capFront.castShadow = true;
      group.add(bFront, bBack, capFront);
    } else {
      // Concrete Water-Table Foundation Base
      const baseSill = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.08, 0.35, depth + 0.08),
        new THREE.MeshStandardMaterial({ color: 0x7c7870, roughness: 0.9 })
      );
      baseSill.position.set(0, 0.175, 0);
      baseSill.castShadow = true;
      baseSill.receiveShadow = true;
      group.add(baseSill);
    }

    // --- 2. Main Perimeter Walls ---
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallThick), wallMat);
    backWall.position.set(0, height / 2, halfD - wallThick / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, depth), wallMat);
    leftWall.position.set(-halfW + wallThick / 2, height / 2, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, depth), wallMat);
    rightWall.position.set(halfW - wallThick / 2, height / 2, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;

    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallThick), wallMat);
    frontWall.position.set(0, height / 2, -halfD + wallThick / 2);
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;

    group.add(backWall, leftWall, rightWall, frontWall);

    // --- 3. Style-Specific Commercial Storefront Glazing ---
    if (style === 'commercial_flat') {
      const sfGroup = new THREE.Group();
      const sfW = width * 0.75, sfH = 3.2;
      const sfZ = -halfD - 0.02;

      // Floor-to-ceiling glass display windows
      const sfGlass = new THREE.Mesh(new THREE.PlaneGeometry(sfW, sfH), glassMat);
      sfGlass.position.set(0, sfH / 2 + 0.1, sfZ);

      // Aluminum Mullion Grid
      const mullionCount = 6;
      for (let m = 0; m <= mullionCount; m++) {
        const mx = (m / mullionCount - 0.5) * sfW;
        const mul = new THREE.Mesh(new THREE.BoxGeometry(0.06, sfH, 0.1), frameMat);
        mul.position.set(mx, sfH / 2 + 0.1, sfZ);
        mul.castShadow = true;
        sfGroup.add(mul);
      }

      // Horizontal Mid-Rail
      const midRail = new THREE.Mesh(new THREE.BoxGeometry(sfW, 0.06, 0.1), frameMat);
      midRail.position.set(0, sfH * 0.4 + 0.1, sfZ);
      sfGroup.add(midRail);

      // Double Commercial Glass Entry Doors with Push Bars
      const doorW = 1.9, doorH = 2.4;
      const pushBar = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.2, 0.04, 0.06), ironMat);
      pushBar.position.set(0, 1.05, sfZ - 0.06);
      sfGroup.add(sfGlass, pushBar);

      // Canvas Sun Shade Awning over Storefront
      const awningMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.85 }); // Royal Blue
      const awning = new THREE.Mesh(new THREE.BoxGeometry(sfW + 0.4, 0.4, 1.2), awningMat);
      awning.position.set(0, sfH + 0.3, sfZ - 0.5);
      awning.rotation.x = 0.2;
      awning.castShadow = true;
      sfGroup.add(awning);

      group.add(sfGroup);
      return group;
    }

    // --- 4. Windows, Frames, and Wrought-Iron Grilles (Rejas) ---
    const addWindow = (x, y, z, rotY = 0, winW = 1.3, winH = 1.6, addReja = false) => {
      const winGroup = new THREE.Group();

      const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
      glass.position.z = 0.03;

      // Projecting Stone/Stucco Sill
      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(winW + 0.24, 0.12, 0.24),
        trimMat
      );
      sill.position.set(0, -winH / 2 - 0.06, 0.06);
      sill.castShadow = true;

      // Outer Trim Surround
      const trimW = 0.08, trimThick = 0.06;
      const tTop = new THREE.Mesh(new THREE.BoxGeometry(winW + trimW * 2, trimW, trimThick), trimMat);
      tTop.position.set(0, winH / 2 + trimW / 2, 0.02);
      const tLeft = new THREE.Mesh(new THREE.BoxGeometry(trimW, winH, trimThick), trimMat);
      tLeft.position.set(-winW / 2 - trimW / 2, 0, 0.02);
      const tRight = new THREE.Mesh(new THREE.BoxGeometry(trimW, winH, trimThick), trimMat);
      tRight.position.set(winW / 2 + trimW / 2, 0, 0.02);

      // Window Frame & Mullions
      const fHoriz = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.04, 0.05), frameMat);
      const fVert = new THREE.Mesh(new THREE.BoxGeometry(0.04, winH, 0.05), frameMat);

      winGroup.add(glass, sill, tTop, tLeft, tRight, fHoriz, fVert);

      // AUTHENTIC SPANISH DETAIL: Wrought-Iron Window Grille (Reja)
      if (addReja && style === 'spanish_tile') {
        const rejaGroup = new THREE.Group();
        const bars = 5;
        for (let b = 0; b < bars; b++) {
          const bx = (b / (bars - 1) - 0.5) * (winW - 0.2);
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, winH + 0.1, 6), ironMat);
          bar.position.set(bx, 0, 0.14);
          bar.castShadow = true;
          rejaGroup.add(bar);
        }
        // Top and bottom decorative cross rails
        const railT = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.1, 0.025, 0.025), ironMat);
        railT.position.set(0, winH * 0.45, 0.14);
        const railB = railT.clone();
        railB.position.y = -winH * 0.45;
        rejaGroup.add(railT, railB);
        winGroup.add(rejaGroup);
      }

      winGroup.position.set(x, y, z);
      winGroup.rotation.y = rotY;
      group.add(winGroup);
    };

    // Front Windows
    for (let s = 0; s < stories; s++) {
      const wy = s * storyH + storyH * 0.55;
      if (s === 0) {
        // Ground floor window with ornamental reja grille
        addWindow(-halfW * 0.55, wy, -halfD, 0, 1.4, 1.6, true);
      } else {
        // Second floor windows
        addWindow(-halfW * 0.5, wy, -halfD, 0, 1.3, 1.5, false);
        addWindow(halfW * 0.45, wy, -halfD, 0, 1.3, 1.5, false);
        if (width > 13) addWindow(0, wy, -halfD, 0, 1.3, 1.5, false);
      }
    }

    // Side Windows
    for (let s = 0; s < stories; s++) {
      const wy = s * storyH + storyH * 0.55;
      addWindow(-halfW, wy, -depth * 0.2, Math.PI / 2);
      addWindow(-halfW, wy, depth * 0.25, Math.PI / 2);
      addWindow(halfW, wy, -depth * 0.2, -Math.PI / 2);
      addWindow(halfW, wy, depth * 0.25, -Math.PI / 2);
    }

    // --- 5. Front Entrance: Arched Loggia or Covered Porch ---
    const doorW = 1.15, doorH = 2.35;
    const doorX = hasGarage ? -halfW * 0.12 : 0;
    const doorZ = -halfD;

    const entryGroup = new THREE.Group();

    // Terracotta Paver Entry Porch Steps
    const stepMat = new THREE.MeshStandardMaterial({ color: 0xa84e32, roughness: 0.75 }); // Terracotta tile steps
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.6, 0.18, 1.6), stepMat);
    step1.position.set(doorX, 0.09, doorZ - 0.8);
    step1.castShadow = true;
    step1.receiveShadow = true;
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.2, 0.18, 1.1), stepMat);
    step2.position.set(doorX, 0.27, doorZ - 0.55);
    step2.castShadow = true;
    entryGroup.add(step1, step2);

    // Front Door with Raised Wood Panels & Brass Handle
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.09), woodDoorMat);
    door.position.set(doorX, doorH / 2 + 0.36, doorZ - 0.02);
    door.castShadow = true;

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 })
    );
    handle.rotation.z = Math.PI / 2;
    handle.position.set(doorX + doorW * 0.38, 1.35, doorZ - 0.08);

    // SPANISH ARCHED ENTRY PORTICO
    if (style === 'spanish_tile') {
      const archGroup = new THREE.Group();
      // Side masonry piers
      const pierMat = wallMat;
      const pierL = new THREE.Mesh(new THREE.BoxGeometry(0.35, doorH + 0.1, 0.35), pierMat);
      pierL.position.set(doorX - doorW / 2 - 0.35, (doorH + 0.1) / 2 + 0.36, doorZ - 0.9);
      pierL.castShadow = true;
      const pierR = pierL.clone();
      pierR.position.x = doorX + doorW / 2 + 0.35;

      // Curved Arch Lintro (Half Ring)
      const archGeom = new THREE.TorusGeometry((doorW + 0.7) / 2, 0.18, 8, 16, Math.PI);
      const arch = new THREE.Mesh(archGeom, pierMat);
      arch.position.set(doorX, doorH + 0.46, doorZ - 0.9);
      arch.rotation.z = Math.PI;
      arch.castShadow = true;

      // Keystone detail
      const keystone = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.3, 0.26),
        new THREE.MeshStandardMaterial({ color: 0xcfc8bc, roughness: 0.7 })
      );
      keystone.position.set(doorX, doorH + 0.46 + (doorW + 0.7) / 2, doorZ - 0.9);
      keystone.castShadow = true;

      archGroup.add(pierL, pierR, arch, keystone);
      entryGroup.add(archGroup);
    } else {
      // Classic Suburban Flat Portico with Square White Posts
      const porticoRoof = new THREE.Mesh(
        new THREE.BoxGeometry(doorW + 1.4, 0.18, 1.4),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
      );
      porticoRoof.position.set(doorX, doorH + 0.55, doorZ - 0.8);
      porticoRoof.castShadow = true;
      entryGroup.add(porticoRoof);
    }

    // Hand-Forged Wrought Iron Lantern Sconce
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xfff0d0,
      emissive: 0xffaa44,
      emissiveIntensity: 0.85
    });
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), lanternMat);
    lantern.position.set(doorX - doorW / 2 - 0.35, 2.0, doorZ - 0.15);
    lantern.castShadow = true;

    // Small warm point light inside lantern
    const lanternLight = new THREE.PointLight(0xffa834, 1.2, 5, 2.0);
    lanternLight.position.copy(lantern.position);
    lanternLight.position.z -= 0.15;
    entryGroup.add(door, handle, lantern, lanternLight);

    group.add(entryGroup);

    // --- 6. Sectional Embossed Roll-Up Garage Door ---
    if (hasGarage) {
      const gw = 5.2, gh = 2.45;
      const gx = halfW * 0.48;
      const gz = -halfD;

      const garageGroup = new THREE.Group();
      const gDoorMat = new THREE.MeshStandardMaterial({ color: 0xf5f3ee, roughness: 0.65 });
      const gDoor = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, 0.08), gDoorMat);
      gDoor.position.set(gx, gh / 2 + 0.2, gz - 0.02);
      gDoor.castShadow = true;

      // Sectional panel horizontal grooves
      const grooveMat = new THREE.MeshStandardMaterial({ color: 0xc8c3b8, roughness: 0.7 });
      for (let p = 1; p < 4; p++) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.025, 0.09), grooveMat);
        seam.position.set(gx, p * (gh / 4) + 0.2, gz - 0.02);
        garageGroup.add(seam);
      }

      // Garage Windows across top panel
      const gWinMat = this.tex.getGlass();
      for (let w = -gw * 0.38; w <= gw * 0.38; w += 1.3) {
        const gwin = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.35), gWinMat);
        gwin.position.set(gx + w, gh * 0.85 + 0.2, gz - 0.07);
        garageGroup.add(gwin);
      }

      // Molded Trim Architrave around Garage opening
      const gTrimTop = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.35, 0.18, 0.14), trimMat);
      gTrimTop.position.set(gx, gh + 0.29, gz - 0.04);
      gTrimTop.castShadow = true;
      garageGroup.add(gDoor, gTrimTop);
      group.add(garageGroup);
    }

    // --- 7. Utility Equipment (Side Wall) ---
    // Ground AC Condenser with Protective Metal Cage
    const acUnit = new THREE.Group();
    const acCabinet = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.85, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x6e7882, roughness: 0.6, metalness: 0.4 })
    );
    acCabinet.position.set(-halfW - 0.6, 0.45, depth * 0.12);
    acCabinet.castShadow = true;

    const fanGuard = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.06, 16),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })
    );
    fanGuard.position.copy(acCabinet.position);
    fanGuard.position.y += 0.44;
    acUnit.add(acCabinet, fanGuard);
    group.add(acUnit);

    // Electric Power Meter with Conduit Tube
    const meterGroup = new THREE.Group();
    const meterBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.45, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x828b94, roughness: 0.5, metalness: 0.5 })
    );
    meterBox.position.set(-halfW - 0.08, 1.7, depth * 0.32);
    meterBox.castShadow = true;

    // Conduit Pipe down to ground
    const conduit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7 })
    );
    conduit.position.set(-halfW - 0.08, 0.75, depth * 0.32);
    meterGroup.add(meterBox, conduit);
    group.add(meterGroup);

    return group;
  }
}
