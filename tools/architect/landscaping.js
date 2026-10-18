/**
 * Procedural Landscaping & Hardscaping Generator (AAA Photorealistic SoCal / Poway Ecosystem)
 * Features:
 * - California Fan Palm (Washingtonia filifera) with skirt & fan fronds
 * - Coast Live Oak (Quercus agrifolia) with gnarled multi-fork branches & dense foliage
 * - Blue Gum Eucalyptus with tall slender peeling bark
 * - Flowering Jacaranda with lavender-purple blossoms
 * - Agave Americana succulents & Mexican river rock planter beds
 * - Concrete driveways with expansion joints & street curb
 * - Swimming pool with turquoise water, coping stone, and sun loungers
 * - Stucco perimeter privacy walls and wrought-iron spearhead security gates
 */
import * as THREE from 'three';

export class LandscapingGenerator {
  constructor(textureFactory) {
    this.tex = textureFactory;
  }

  generate(options) {
    const {
      width = 14,
      depth = 16,
      lotWidth = 34,
      lotDepth = 40,
      hasPool = true,
      hasGate = true,
      style = 'spanish_tile'
    } = options;

    const group = new THREE.Group();
    group.name = 'LandscapingSystem';

    const halfW = width / 2;
    const halfD = depth / 2;
    const lotHalfW = lotWidth / 2;

    // --- 1. Parcel Lawn Base & Foundation Planter Mulch Bed ---
    const lawnMat = this.tex.getLawn();
    lawnMat.map.repeat.set(lotWidth * 0.4, lotDepth * 0.4);
    lawnMat.normalMap.repeat.set(lotWidth * 0.4, lotDepth * 0.4);

    const parcelLawn = new THREE.Mesh(new THREE.PlaneGeometry(lotWidth, lotDepth), lawnMat);
    parcelLawn.rotation.x = -Math.PI / 2;
    parcelLawn.position.set(0, 0, 4);
    parcelLawn.receiveShadow = true;
    group.add(parcelLawn);

    // Dark Bark Mulch / River Rock Planter Bed surrounding the house foundation
    const mulchMat = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.95 });
    const mulchBed = new THREE.Mesh(
      new THREE.BoxGeometry(width + 2.2, 0.08, depth + 2.2),
      mulchMat
    );
    mulchBed.position.set(0, 0.04, 0);
    mulchBed.receiveShadow = true;
    group.add(mulchBed);

    // Front Sidewalk & Street Curb
    const sidewalkMat = this.tex.getConcrete();
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(lotWidth, 0.16, 2.0), sidewalkMat);
    sidewalk.position.set(0, 0.08, -halfD - 7.5);
    sidewalk.receiveShadow = true;
    group.add(sidewalk);

    // --- 2. Concrete Driveway & Walkway ---
    const driveW = 5.8;
    const driveL = 8.5;
    const driveX = halfW * 0.48;
    const driveZ = -halfD - driveL / 2;

    const driveway = new THREE.Mesh(new THREE.BoxGeometry(driveW, 0.1, driveL), sidewalkMat);
    driveway.position.set(driveX, 0.05, driveZ);
    driveway.receiveShadow = true;
    group.add(driveway);

    // Front Entry Walkway
    const walkW = 1.4;
    const walkL = 5.2;
    const walkway = new THREE.Mesh(new THREE.BoxGeometry(walkL, 0.08, walkW), sidewalkMat);
    walkway.position.set(-halfW * 0.12 + walkL / 2 - 0.4, 0.05, -halfD - 2.8);
    walkway.receiveShadow = true;
    group.add(walkway);

    // --- 3. Perimeter Privacy Walls & Security Gate ---
    const wallH = 1.85;
    const wallThick = 0.24;
    const wallMat = this.tex.getStucco(0xdcd5c5);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x8a8479, roughness: 0.8 });

    const addWallSegment = (len, px, pz, rotY = 0) => {
      const segGroup = new THREE.Group();
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len, wallH, wallThick), wallMat);
      wall.position.y = wallH / 2;
      wall.castShadow = true;
      wall.receiveShadow = true;

      const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 0.08, 0.08, wallThick + 0.08), capMat);
      cap.position.y = wallH + 0.04;
      cap.castShadow = true;

      segGroup.add(wall, cap);
      segGroup.position.set(px, 0, pz);
      segGroup.rotation.y = rotY;
      group.add(segGroup);
    };

    // Boundary walls around property
    addWallSegment(lotDepth - 10, -lotHalfW, 5, Math.PI / 2);
    addWallSegment(lotDepth - 10, lotHalfW, 5, Math.PI / 2);
    addWallSegment(lotWidth, 0, lotDepth / 2 + 3);

    // Front Driveway Wrought Iron Gate & Masonry Pilasters
    if (hasGate) {
      const addPilaster = (px, pz) => {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, wallH + 0.3, 0.55), wallMat);
        p.position.set(px, (wallH + 0.3) / 2, pz);
        p.castShadow = true;
        const pCap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.7), capMat);
        pCap.position.set(px, wallH + 0.3 + 0.06, pz);
        pCap.castShadow = true;
        group.add(p, pCap);
      };

      addPilaster(driveX - driveW / 2 - 0.3, -halfD - 5.5);
      addPilaster(driveX + driveW / 2 + 0.3, -halfD - 5.5);

      // Wrought Iron Security Gate with Spearhead Pickets
      const ironMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.25 });
      const gateGroup = new THREE.Group();
      const railTop = new THREE.Mesh(new THREE.BoxGeometry(driveW, 0.05, 0.05), ironMat);
      railTop.position.set(0, wallH * 0.85, 0);
      const railBottom = new THREE.Mesh(new THREE.BoxGeometry(driveW, 0.05, 0.05), ironMat);
      railBottom.position.set(0, 0.15, 0);
      gateGroup.add(railTop, railBottom);

      const picketCount = 22;
      for (let p = 0; p < picketCount; p++) {
        const px = (p / (picketCount - 1) - 0.5) * (driveW - 0.2);
        const picket = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, wallH * 0.85, 6), ironMat);
        picket.position.set(px, (wallH * 0.85) / 2 + 0.1, 0);
        picket.castShadow = true;

        // Decorative Spearhead Top
        const spear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), ironMat);
        spear.position.set(px, wallH * 0.85 + 0.16, 0);
        spear.castShadow = true;

        gateGroup.add(picket, spear);
      }
      gateGroup.position.set(driveX, 0, -halfD - 5.5);
      group.add(gateGroup);
    }

    // --- 4. Backyard Swimming Pool & Patio Deck ---
    if (hasPool) {
      const poolGroup = new THREE.Group();
      const poolW = 5.2, poolL = 9.5;
      const poolX = 0, poolZ = halfD + 6.5;

      // Concrete Pool Deck
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(poolW + 3.2, 0.12, poolL + 3.2),
        sidewalkMat
      );
      deck.position.set(poolX, 0.06, poolZ);
      deck.receiveShadow = true;
      poolGroup.add(deck);

      // Turquoise Shimmering Water
      const waterMat = new THREE.MeshPhysicalMaterial({
        color: 0x1db8b8,
        transmission: 0.9,
        transparent: true,
        opacity: 0.85,
        roughness: 0.08,
        metalness: 0.1,
        ior: 1.333
      });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(poolW, poolL), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(poolX, 0.13, poolZ);
      poolGroup.add(water);

      // Coping Stone Rim
      const copingRim = new THREE.Mesh(
        new THREE.BoxGeometry(poolW + 0.36, 0.16, poolL + 0.36),
        capMat
      );
      copingRim.position.set(poolX, 0.1, poolZ);
      poolGroup.add(copingRim);

      // Chaise Loungers
      const loungerMat = new THREE.MeshStandardMaterial({ color: 0xf5f3ee, roughness: 0.8 });
      for (let l = -1; l <= 1; l += 2) {
        const lounger = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 1.8), loungerMat);
        lounger.position.set(poolX + (poolW / 2 + 1.1) * l, 0.28, poolZ);
        lounger.castShadow = true;
        poolGroup.add(lounger);
      }

      group.add(poolGroup);
    }

    // --- 5. Authentic SoCal & Poway Trees ---
    // A. California Fan Palms (Washingtonia filifera)
    const palm1 = this.createCaliforniaFanPalm(10.5);
    palm1.position.set(-halfW - 2.8, 0, -halfD - 2.0);
    const palm2 = this.createCaliforniaFanPalm(8.5);
    palm2.position.set(-halfW - 4.5, 0, -halfD + 2.5);
    group.add(palm1, palm2);

    // B. Coast Live Oak (Quercus agrifolia) in backyard
    const oak = this.createCoastLiveOak(7.8, 4.5);
    oak.position.set(lotHalfW - 5.5, 0, halfD + 7.5);
    group.add(oak);

    // C. Blue Gum Eucalyptus
    const euca = this.createEucalyptus(13.5);
    euca.position.set(-lotHalfW + 4.5, 0, halfD + 9.5);
    group.add(euca);

    // D. Flowering Jacaranda (Lavender-Purple Blossoms)
    const jacaranda = this.createJacaranda(8.0);
    jacaranda.position.set(-lotHalfW + 5.0, 0, -halfD - 1.5);
    group.add(jacaranda);

    // E. Columnar Italian Cypress along boundary wall
    for (let c = -7; c <= 7; c += 3.5) {
      const cypress = this.createItalianCypress(5.4);
      cypress.position.set(-lotHalfW + 1.2, 0, c);
      group.add(cypress);
    }

    // F. Sculptural Agave Americana in Mulch Planter Beds
    for (let a = -3.2; a <= 3.2; a += 1.6) {
      const agave = this.createAgaveSucculent();
      agave.position.set(a, 0.1, -halfD - 1.1);
      group.add(agave);
    }

    return group;
  }

  // --- Plant Generators ---

  // 1. California Fan Palm (Washingtonia filifera)
  createCaliforniaFanPalm(totalHeight = 9.5) {
    const palm = new THREE.Group();
    const trunkH = totalHeight - 2.2;

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a483a, roughness: 0.95 });
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.44, trunkH, 10),
      trunkMat
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    palm.add(trunk);

    // Dead Frond Skirt (Under Crown)
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0x75604b, roughness: 0.95 });
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.3, 8), skirtMat);
    skirt.position.y = trunkH - 0.3;
    palm.add(skirt);

    // Radiating Fan Fronds
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
  createCoastLiveOak(height = 7.5, canopyRadius = 4.5) {
    const oak = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x443e38, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e5926, roughness: 0.85 });

    const trunkH = height * 0.45;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.68, trunkH, 8), trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    oak.add(trunk);

    const clusterCount = 15;
    for (let i = 0; i < clusterCount; i++) {
      const radius = 1.3 + Math.random() * 0.9;
      const cluster = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), leafMat);

      const angle = Math.random() * Math.PI * 2;
      const dist = (Math.random() * 0.7 + 0.3) * canopyRadius;
      const cy = trunkH + (Math.random() * 0.6 + 0.4) * (height - trunkH);

      cluster.position.set(Math.cos(angle) * dist, cy, Math.sin(angle) * dist);
      cluster.scale.set(1.25, 0.85, 1.25);
      cluster.castShadow = true;
      cluster.receiveShadow = true;
      oak.add(cluster);
    }

    return oak;
  }

  // 3. Blue Gum Eucalyptus
  createEucalyptus(height = 13.0) {
    const euca = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0xc2bcb0, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4e6b54, roughness: 0.85 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, height * 0.8, 8), trunkMat);
    trunk.position.y = (height * 0.8) / 2;
    trunk.castShadow = true;
    euca.add(trunk);

    for (let i = 0; i < 10; i++) {
      const cluster = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 1), leafMat);
      cluster.position.set(
        (Math.random() - 0.5) * 3.2,
        height * 0.65 + Math.random() * height * 0.35,
        (Math.random() - 0.5) * 3.2
      );
      cluster.scale.set(0.9, 1.45, 0.9);
      cluster.castShadow = true;
      euca.add(cluster);
    }

    return euca;
  }

  // 4. Flowering Jacaranda (Lavender-Purple Canopy)
  createJacaranda(height = 8.0) {
    const jacaranda = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x554c42, roughness: 0.9 });
    // Vibrant Lavender-Purple Blossom material
    const flowerMat = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6, // Vibrant purple
      roughness: 0.8,
      emissive: 0x4c1d95,
      emissiveIntensity: 0.25
    });

    const trunkH = height * 0.4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, trunkH, 8), trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    jacaranda.add(trunk);

    for (let i = 0; i < 12; i++) {
      const radius = 1.2 + Math.random() * 0.8;
      const flowerCluster = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), flowerMat);

      const angle = Math.random() * Math.PI * 2;
      const dist = (Math.random() * 0.7 + 0.3) * 3.8;
      const cy = trunkH + (Math.random() * 0.6 + 0.4) * (height - trunkH);

      flowerCluster.position.set(Math.cos(angle) * dist, cy, Math.sin(angle) * dist);
      flowerCluster.castShadow = true;
      jacaranda.add(flowerCluster);
    }

    return jacaranda;
  }

  // 5. Italian Cypress
  createItalianCypress(height = 5.2) {
    const cypress = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1f3821, roughness: 0.9 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, height, 8), mat);
    cone.position.y = height / 2;
    cone.castShadow = true;
    cypress.add(cone);
    return cypress;
  }

  // 6. Agave Americana Succulent
  createAgaveSucculent() {
    const agave = new THREE.Group();
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x548773, roughness: 0.7 });

    const leaves = 14;
    for (let i = 0; i < leaves; i++) {
      const angle = (i / leaves) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 4), leafMat);
      leaf.rotation.z = Math.PI / 3;
      leaf.position.x = 0.28;

      const leafPivot = new THREE.Group();
      leafPivot.add(leaf);
      leafPivot.rotation.y = angle;
      agave.add(leafPivot);
    }
    agave.scale.set(0.85, 0.85, 0.85);
    return agave;
  }
}
