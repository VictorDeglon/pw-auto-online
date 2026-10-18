/**
 * Procedural Interior Generator
 * Builds multi-story floor layouts, partition walls, staircases, furniture props, and warm interior lighting.
 */
import * as THREE from 'three';

export class InteriorGenerator {
  constructor(textureFactory) {
    this.tex = textureFactory;
  }

  generate(options) {
    const {
      width = 12,
      depth = 14,
      height = 6.2,
      stories = 2,
      hasGarage = true
    } = options;

    const group = new THREE.Group();
    group.name = 'InteriorSystem';

    const storyH = height / stories;
    const halfW = width / 2;
    const halfD = depth / 2;
    const wallThick = 0.14;

    const floorMat = this.tex.getHardwood();
    floorMat.map.repeat.set(width * 0.4, depth * 0.4);

    const intWallMat = new THREE.MeshStandardMaterial({ color: 0xf5f3ee, roughness: 0.9 });
    const woodFurnitureMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1b, roughness: 0.5 });
    const fabricSofaMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.95 });
    const counterMat = new THREE.MeshStandardMaterial({ color: 0xefede8, roughness: 0.2, metalness: 0.1 }); // Quartz/Marble

    // --- Ground Floor (Story 0) ---
    const groundFloorGroup = new THREE.Group();
    groundFloorGroup.name = 'Story_0';

    // Ground Floor Slab
    const groundFloorSlab = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.4, depth - 0.4), floorMat);
    groundFloorSlab.rotation.x = -Math.PI / 2;
    groundFloorSlab.position.set(0, 0.05, 0);
    groundFloorSlab.receiveShadow = true;
    groundFloorGroup.add(groundFloorSlab);

    // Garage Partition Wall (separating garage on right side)
    if (hasGarage) {
      const gWallX = 1.0;
      const gWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThick, storyH - 0.1, depth * 0.5),
        intWallMat
      );
      gWall.position.set(gWallX, storyH / 2, -depth * 0.25);
      gWall.castShadow = true;
      gWall.receiveShadow = true;
      groundFloorGroup.add(gWall);

      // Garage concrete floor
      const garageFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(halfW - 0.8, depth * 0.5),
        this.tex.getConcrete()
      );
      garageFloor.rotation.x = -Math.PI / 2;
      garageFloor.position.set(halfW * 0.5 + 0.4, 0.06, -depth * 0.25);
      garageFloor.receiveShadow = true;
      groundFloorGroup.add(garageFloor);
    }

    // Main Corridor / Living Room Partition Wall
    const mainDividingWall = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.55, storyH - 0.1, wallThick),
      intWallMat
    );
    mainDividingWall.position.set(-halfW * 0.4, storyH / 2, 0);
    mainDividingWall.castShadow = true;
    mainDividingWall.receiveShadow = true;
    groundFloorGroup.add(mainDividingWall);

    // --- Living Room Furniture (Left Front) ---
    const lrGroup = new THREE.Group();
    lrGroup.position.set(-halfW * 0.45, 0, -halfD * 0.4);

    // L-Shaped Sectional Sofa
    const sofaMain = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 0.9), fabricSofaMat);
    sofaMain.position.set(0, 0.38, 0);
    sofaMain.castShadow = true;
    const sofaL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 1.6), fabricSofaMat);
    sofaL.position.set(-0.85, 0.38, 1.25);
    sofaL.castShadow = true;

    // Coffee Table
    const coffeeTable = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.38, 0.65), woodFurnitureMat);
    coffeeTable.position.set(0.3, 0.19, 0.8);
    coffeeTable.castShadow = true;

    // Media Credenza & TV
    const credenza = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.4), woodFurnitureMat);
    credenza.position.set(0, 0.25, 2.0);
    credenza.castShadow = true;
    const tv = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.9, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.1, metalness: 0.8 })
    );
    tv.position.set(0, 1.1, 2.0);
    tv.castShadow = true;

    lrGroup.add(sofaMain, sofaL, coffeeTable, credenza, tv);
    groundFloorGroup.add(lrGroup);

    // --- Kitchen & Dining (Back Left & Center) ---
    const kitchenGroup = new THREE.Group();
    kitchenGroup.position.set(-halfW * 0.3, 0, halfD * 0.45);

    // Kitchen Island with Waterfall Quartz Countertop
    const island = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.1), counterMat);
    island.position.set(0, 0.45, 0);
    island.castShadow = true;

    // Barstools
    for (let b = -0.7; b <= 0.7; b += 0.7) {
      const stool = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.65, 12),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6 })
      );
      stool.position.set(b, 0.32, -0.75);
      stool.castShadow = true;
      kitchenGroup.add(stool);
    }

    // Rear Cabinet Wall & Fridge
    const cabinets = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 0.65), woodFurnitureMat);
    cabinets.position.set(0, 0.45, 1.4);
    cabinets.castShadow = true;

    const fridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 1.85, 0.75),
      new THREE.MeshStandardMaterial({ color: 0xc8cdd4, metalness: 0.85, roughness: 0.25 }) // Stainless steel
    );
    fridge.position.set(2.0, 0.92, 1.4);
    fridge.castShadow = true;

    kitchenGroup.add(island, cabinets, fridge);
    groundFloorGroup.add(kitchenGroup);

    // --- Dining Table ---
    const diningGroup = new THREE.Group();
    diningGroup.position.set(halfW * 0.3, 0, halfD * 0.4);
    const diningTable = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 1.0), woodFurnitureMat);
    diningTable.position.set(0, 0.38, 0);
    diningTable.castShadow = true;
    diningGroup.add(diningTable);

    // Dining Chairs
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x2d3748 });
    const chairOffsets = [[-0.6, 0.65], [0.6, 0.65], [-0.6, -0.65], [0.6, -0.65]];
    for (const [cx, cz] of chairOffsets) {
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.85, 0.42), chairMat);
      chair.position.set(cx, 0.42, cz);
      chair.castShadow = true;
      diningGroup.add(chair);
    }
    groundFloorGroup.add(diningGroup);

    // --- Staircase connecting Ground to Story 1 ---
    if (stories > 1) {
      const stairGroup = new THREE.Group();
      stairGroup.position.set(0, 0, -0.5);
      const steps = 14;
      const stepW = 1.0, stepH = storyH / steps, stepD = 0.28;
      const stepMat = woodFurnitureMat;

      for (let i = 0; i < steps; i++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepH, stepD), stepMat);
        step.position.set(0, (i + 0.5) * stepH, (i - steps / 2) * stepD);
        step.castShadow = true;
        stairGroup.add(step);
      }

      // Handrail
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(storyH, steps * stepD)),
        new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 })
      );
      rail.rotation.x = Math.atan2(storyH, steps * stepD);
      rail.position.set(stepW / 2 + 0.02, storyH / 2 + 0.5, 0);
      stairGroup.add(rail);

      groundFloorGroup.add(stairGroup);
    }

    // Warm Interior Ceiling Can Lights
    const light1 = new THREE.PointLight(0xffeedd, 1.2, 8, 1.5);
    light1.position.set(-halfW * 0.4, storyH - 0.2, -halfD * 0.3);
    const light2 = new THREE.PointLight(0xffeedd, 1.2, 8, 1.5);
    light2.position.set(-halfW * 0.3, storyH - 0.2, halfD * 0.3);
    groundFloorGroup.add(light1, light2);

    group.add(groundFloorGroup);

    // --- Second Floor (Story 1) ---
    if (stories > 1) {
      const secondFloorGroup = new THREE.Group();
      secondFloorGroup.name = 'Story_1';
      secondFloorGroup.position.set(0, storyH, 0);

      // Floor Slab (with stairwell cutout)
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.4, depth - 0.4), floorMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(0, 0.05, 0);
      slab.receiveShadow = true;
      secondFloorGroup.add(slab);

      // Central Corridor Dividing Wall
      const corridorWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThick, storyH - 0.1, depth * 0.7),
        intWallMat
      );
      corridorWall.position.set(-0.8, storyH / 2, 0);
      corridorWall.castShadow = true;
      secondFloorGroup.add(corridorWall);

      // Master Bedroom (Right Side)
      const masterBedGroup = new THREE.Group();
      masterBedGroup.position.set(halfW * 0.5, 0, -halfD * 0.4);

      // King Bed (Platform + Mattress + Headboard)
      const headboard = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 1.1, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x2b2d42, roughness: 0.85 })
      );
      headboard.position.set(0, 0.55, -1.0);
      headboard.castShadow = true;

      const mattress = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.55, 2.1),
        new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.9 })
      );
      mattress.position.set(0, 0.3, 0);
      mattress.castShadow = true;

      // Nightstands
      const nsMat = woodFurnitureMat;
      const ns1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.4), nsMat);
      ns1.position.set(-1.3, 0.22, -0.9);
      const ns2 = ns1.clone();
      ns2.position.x = 1.3;

      masterBedGroup.add(headboard, mattress, ns1, ns2);
      secondFloorGroup.add(masterBedGroup);

      // Secondary Bedroom (Back Right)
      const bed2Group = new THREE.Group();
      bed2Group.position.set(halfW * 0.5, 0, halfD * 0.45);
      const bed2 = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.5, 1.9),
        new THREE.MeshStandardMaterial({ color: 0x3d5a80, roughness: 0.9 })
      );
      bed2.position.set(0, 0.25, 0);
      bed2.castShadow = true;
      bed2Group.add(bed2);
      secondFloorGroup.add(bed2Group);

      // Upper floor warm ceiling lights
      const lightU1 = new THREE.PointLight(0xffeedd, 1.0, 7, 1.5);
      lightU1.position.set(halfW * 0.4, storyH - 0.2, -halfD * 0.3);
      secondFloorGroup.add(lightU1);

      group.add(secondFloorGroup);
    }

    return group;
  }
}
