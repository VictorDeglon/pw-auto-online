/**
 * Procedural Landscaping & Hardscaping Generator
 * Builds biologically accurate SoCal/Poway vegetation, driveways, swimming pools, perimeter walls, and gates.
 */
import * as THREE from 'three';

export class LandscapingGenerator {
  constructor(textureFactory) {
    this.tex = textureFactory;
  }

  generate(options) {
    const {
      width = 12,
      depth = 14,
      lotWidth = 32,
      lotDepth = 38,
      hasPool = true,
      hasGate = true,
      style = 'spanish_tile'
    } = options;

    const group = new THREE.Group();
    group.name = 'LandscapingSystem';

    const halfW = width / 2;
    const halfD = depth / 2;
    const lotHalfW = lotWidth / 2;
    const lotHalfD = lotDepth / 3; // Shift lot so front yard is in front and large backyard behind

    // --- 1. Parcel Lawn Base ---
    const lawnMat = this.tex.getLawn();
    lawnMat.map.repeat.set(lotWidth * 0.4, lotDepth * 0.4);
    lawnMat.normalMap.repeat.set(lotWidth * 0.4, lotDepth * 0.4);

    const parcelLawn = new THREE.Mesh(new THREE.PlaneGeometry(lotWidth, lotDepth), lawnMat);
    parcelLawn.rotation.x = -Math.PI / 2;
    parcelLawn.position.set(0, 0, 4);
    parcelLawn.receiveShadow = true;
    group.add(parcelLawn);

    // Front Sidewalk & Street Curb
    const sidewalkMat = this.tex.getConcrete();
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(lotWidth, 0.15, 1.8), sidewalkMat);
    sidewalk.position.set(0, 0.075, -halfD - 7.0);
    sidewalk.receiveShadow = true;
    group.add(sidewalk);

    // --- 2. Concrete Driveway & Walkway ---
    const driveW = 5.6;
    const driveL = 8.5;
    const driveX = halfW * 0.45;
    const driveZ = -halfD - driveL / 2;

    const driveway = new THREE.Mesh(new THREE.BoxGeometry(driveW, 0.1, driveL), sidewalkMat);
    driveway.position.set(driveX, 0.05, driveZ);
    driveway.receiveShadow = true;
    group.add(driveway);

    // Front Walkway connecting Porch to Driveway
    const walkW = 1.4;
    const walkL = 5.0;
    const walkway = new THREE.Mesh(new THREE.BoxGeometry(walkL, 0.08, walkW), sidewalkMat);
    walkway.position.set(-halfW * 0.15 + walkL / 2 - 0.4, 0.05, -halfD - 2.5);
    walkway.receiveShadow = true;
    group.add(walkway);

    // --- 3. Perimeter Walls & Security Gates ---
    const wallH = 1.8;
    const wallThick = 0.22;
    const wallMat = this.tex.getStucco(0xdcd5c5);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x8a8479, roughness: 0.8 });

    const addWallSegment = (len, px, pz, rotY = 0) => {
      const segGroup = new THREE.Group();
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len, wallH, wallThick), wallMat);
      wall.position.y = wallH / 2;
      wall.castShadow = true;
      wall.receiveShadow = true;

      // Stone Wall Cap
      const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 0.08, 0.08, wallThick + 0.08), capMat);
      cap.position.y = wallH + 0.04;
      cap.castShadow = true;

      segGroup.add(wall, cap);
      segGroup.position.set(px, 0, pz);
      segGroup.rotation.y = rotY;
      group.add(segGroup);
    };

    // Left and Right Boundary Privacy Walls
    addWallSegment(lotDepth - 10, -lotHalfW, 5, Math.PI / 2);
    addWallSegment(lotDepth - 10, lotHalfW, 5, Math.PI / 2);
    // Back Boundary Wall
    addWallSegment(lotWidth, 0, lotDepth / 2 + 3);

    // Front Wrought Iron Gate & Pilasters
    if (hasGate) {
      const pilasterMat = wallMat;
      const addPilaster = (px, pz) => {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, wallH + 0.25, 0.55), pilasterMat);
        p.position.set(px, (wallH + 0.25) / 2, pz);
        p.castShadow = true;
        const pCap = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.12, 0.68), capMat);
        pCap.position.set(px, wallH + 0.25 + 0.06, pz);
        pCap.castShadow = true;
        group.add(p, pCap);
      };

      addPilaster(driveX - driveW / 2 - 0.3, -halfD - 5.5);
      addPilaster(driveX + driveW / 2 + 0.3, -halfD - 5.5);

      // Wrought Iron Gate Mesh (Black Metal with pickets)
      const ironMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.25 });
      const gateGroup = new THREE.Group();
      const railTop = new THREE.Mesh(new THREE.BoxGeometry(driveW, 0.05, 0.05), ironMat);
      railTop.position.set(0, wallH * 0.85, 0);
      const railBottom = new THREE.Mesh(new THREE.BoxGeometry(driveW, 0.05, 0.05), ironMat);
      railBottom.position.set(0, 0.15, 0);
      gateGroup.add(railTop, railBottom);

      const picketCount = 20;
      for (let p = 0; p < picketCount; p++) {
        const px = (p / (picketCount - 1) - 0.5) * (driveW - 0.2);
        const picket = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, wallH * 0.85, 6), ironMat);
        picket.position.set(px, (wallH * 0.85) / 2 + 0.1, 0);
        picket.castShadow = true;
        gateGroup.add(picket);
      }
      gateGroup.position.set(driveX, 0, -halfD - 5.5);
      group.add(gateGroup);
    }

    // --- 4. Backyard Swimming Pool & Patio Deck ---
    if (hasPool) {
      const poolGroup = new THREE.Group();
      const poolW = 5.0, poolL = 9.0;
      const poolX = 0, poolZ = halfD + 6.0;

      // Concrete Pool Deck
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(poolW + 3.0, 0.12, poolL + 3.0),
        sidewalkMat
      );
      deck.position.set(poolX, 0.06, poolZ);
      deck.receiveShadow = true;
      poolGroup.add(deck);

      // Swimming Pool Water Surface (Shimmering Turquoise)
      const waterMat = new THREE.MeshPhysicalMaterial({
        color: 0x1db5b5,
        transmission: 0.9,
        transparent: true,
        opacity: 0.85,
        roughness: 0.1,
        metalness: 0.1,
        ior: 1.333
      });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(poolW, poolL), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(poolX, 0.13, poolZ);
      poolGroup.add(water);

      // Pool Coping Stone Rim
      const copingRim = new THREE.Mesh(
        new THREE.BoxGeometry(poolW + 0.35, 0.16, poolL + 0.35),
        capMat
      );
      copingRim.position.set(poolX, 0.1, poolZ);
      poolGroup.add(copingRim);

      // Chaise Loungers
      const loungerMat = new THREE.MeshStandardMaterial({ color: 0xefede6, roughness: 0.8 });
      for (let l = -1; l <= 1; l += 2) {
        const lounger = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 1.8), loungerMat);
        lounger.position.set(poolX + (poolW / 2 + 1.0) * l, 0.28, poolZ);
        lounger.castShadow = true;
        poolGroup.add(lounger);
      }

      group.add(poolGroup);
    }

    // --- 5. Biological SoCal / Poway Trees & Plants ---
    // A. California Fan Palms (Washingtonia)
    const palm1 = this.createCaliforniaFanPalm(10.5);
    palm1.position.set(-halfW - 2.5, 0, -halfD - 2.0);
    const palm2 = this.createCaliforniaFanPalm(8.5);
    palm2.position.set(-halfW - 4.5, 0, -halfD + 2.0);
    group.add(palm1, palm2);

    // B. Coast Live Oak (Quercus agrifolia) in backyard
    const oak = this.createCoastLiveOak(7.5, 4.2);
    oak.position.set(lotHalfW - 5.0, 0, halfD + 7.0);
    group.add(oak);

    // C. Blue Gum Eucalyptus
    const euca = this.createEucalyptus(13.0);
    euca.position.set(-lotHalfW + 4.0, 0, halfD + 9.0);
    group.add(euca);

    // D. Italian Cypress along boundary wall
    for (let c = -6; c <= 6; c += 3) {
      const cypress = this.createItalianCypress(5.2);
      cypress.position.set(-lotHalfW + 1.2, 0, c);
      group.add(cypress);
    }

    // E. Drought-Tolerant Planter Beds with Agave Succulents
    for (let a = -3; a <= 3; a += 1.5) {
      const agave = this.createAgaveSucculent();
      agave.position.set(a, 0.1, -halfD - 0.8);
      group.add(agave);
    }

    return group;
  }

  // --- Plant Builders ---

  // 1. California Fan Palm (Washingtonia)
  createCaliforniaFanPalm(totalHeight = 9.0) {
    const palm = new THREE.Group();
    const trunkH = totalHeight - 2.2;

    // Tapered fibrous trunk
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a483a, roughness: 0.95 });
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.42, trunkH, 10),
      trunkMat
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    palm.add(trunk);

    // Dead frond skirt (under crown)
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0x7a634e, roughness: 0.95 });
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.2, 8), skirtMat);
    skirt.position.y = trunkH - 0.3;
    palm.add(skirt);

    // Radiating green fan fronds
    const frondMat = new THREE.MeshStandardMaterial({
      color: 0x3d782e,
      roughness: 0.8,
      side: THREE.DoubleSide
    });

    const frondCount = 18;
    for (let i = 0; i < frondCount; i++) {
      const angle = (i / frondCount) * Math.PI * 2;
      const elevation = (Math.PI / 4) + (Math.sin(i * 3) * 0.2);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 2.2, 5), trunkMat);
      stem.position.y = 1.1;

      const fan = new THREE.Mesh(new THREE.CircleGeometry(0.75, 7, 0, Math.PI * 1.2), frondMat);
      fan.position.y = 2.2;
      fan.rotation.y = Math.PI / 2;
      fan.castShadow = true;

      const frondGroup = new THREE.Group();
      frondGroup.add(stem, fan);
      frondGroup.rotation.y = angle;
      frondGroup.rotation.z = elevation;
      frondGroup.position.y = trunkH + 0.2;

      palm.add(frondGroup);
    }

    return palm;
  }

  // 2. Coast Live Oak (Quercus agrifolia)
  createCoastLiveOak(height = 7.0, canopyRadius = 4.0) {
    const oak = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x48423c, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e5926, roughness: 0.85 });

    // Gnarled main trunk
    const trunkH = height * 0.45;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.65, trunkH, 8), trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    oak.add(trunk);

    // Volumetric dense leaf cluster spheres
    const clusterCount = 14;
    for (let i = 0; i < clusterCount; i++) {
      const radius = 1.2 + Math.random() * 0.9;
      const cluster = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), leafMat);

      const angle = Math.random() * Math.PI * 2;
      const dist = (Math.random() * 0.7 + 0.3) * canopyRadius;
      const cy = trunkH + (Math.random() * 0.6 + 0.4) * (height - trunkH);

      cluster.position.set(Math.cos(angle) * dist, cy, Math.sin(angle) * dist);
      cluster.scale.set(1.2, 0.85, 1.2);
      cluster.castShadow = true;
      cluster.receiveShadow = true;
      oak.add(cluster);
    }

    return oak;
  }

  // 3. Blue Gum Eucalyptus
  createEucalyptus(height = 12.0) {
    const euca = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0xb5afa4, roughness: 0.9 }); // Peeling whitish bark
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4e6b54, roughness: 0.85 }); // Muted blue-green

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, height * 0.8, 8), trunkMat);
    trunk.position.y = (height * 0.8) / 2;
    trunk.castShadow = true;
    euca.add(trunk);

    // Drooping airy foliage clusters near top
    for (let i = 0; i < 9; i++) {
      const cluster = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 1), leafMat);
      cluster.position.set(
        (Math.random() - 0.5) * 3.0,
        height * 0.7 + Math.random() * height * 0.3,
        (Math.random() - 0.5) * 3.0
      );
      cluster.scale.set(0.9, 1.4, 0.9);
      cluster.castShadow = true;
      euca.add(cluster);
    }

    return euca;
  }

  // 4. Italian Cypress (Columnar evergreen)
  createItalianCypress(height = 5.0) {
    const cypress = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x223d24, roughness: 0.9 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, height, 8), mat);
    cone.position.y = height / 2;
    cone.castShadow = true;
    cypress.add(cone);
    return cypress;
  }

  // 5. Agave Succulent
  createAgaveSucculent() {
    const agave = new THREE.Group();
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x5a8a78, roughness: 0.7 });

    const leaves = 12;
    for (let i = 0; i < leaves; i++) {
      const angle = (i / leaves) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.55, 4), leafMat);
      leaf.rotation.z = Math.PI / 3;
      leaf.position.x = 0.25;

      const leafPivot = new THREE.Group();
      leafPivot.add(leaf);
      leafPivot.rotation.y = angle;
      agave.add(leafPivot);
    }
    agave.scale.set(0.8, 0.8, 0.8);
    return agave;
  }
}
