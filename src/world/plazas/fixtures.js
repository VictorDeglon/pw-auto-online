/**
 * Plaza Fixtures, Architectural Mechanicals & Interactive Moving Doors
 *
 * Implements:
 * 1. Animated double sliding glass doors with proximity motion sensors & audio cues.
 * 2. Multi-stage commercial rooftop HVAC packaged units, kitchen exhaust mushroom fans, conduits.
 * 3. Hyper-realistic land chunks: asphalt base, scored sidewalks, beveled concrete curbs,
 *    ADA yellow tactile paving ramps, striped parking bays, and curbed landscape islands with trees.
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
  getHVACGrilleTex
} from './textures.js';

// Glass for storefronts and moving doors: see-through and glossy. Not transmission: any transmissive mesh on screen
// makes three.js draw the whole scene a second time, every frame
export const seeThroughGlassMat = new THREE.MeshStandardMaterial({
  color: 0x3b5266,
  transparent: true,
  opacity: 0.3,
  roughness: 0.05,
  metalness: 0.6,
  depthWrite: false
});

// Shared Structural Materials
export const darkBronzeFrameMat = new THREE.MeshStandardMaterial({ color: 0x242220, roughness: 0.4, metalness: 0.7 });
export const silverAluminumFrameMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.35, metalness: 0.85 });
export const galvanizedMetalMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.45, metalness: 0.8 });
export const copperPipeMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.3, metalness: 0.9 });
export const concreteCurbMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.9 });
export const darkMulchMat = new THREE.MeshStandardMaterial({ color: 0x291d18, roughness: 0.95 });
export const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 });
export const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4a36, roughness: 0.9 });

// ---------------------------------------------------------------------------
// 1. ANIMATED DOUBLE SLIDING GLASS DOORS (PROXIMITY DETECTOR)
// ---------------------------------------------------------------------------

export class MovingDoorSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.doors = []; // List of active moving doors
  }

  createSlidingDoor(parent, opts = {}) {
    const {
      x = 0, y = 0, z = 0,
      rotY = 0,
      width = 3.2,
      height = 2.8,
      frameMat = darkBronzeFrameMat,
      storeName = 'Store'
    } = opts;

    const doorGroup = new THREE.Group();
    doorGroup.position.set(x, y, z);
    doorGroup.rotation.y = rotY;
    parent.add(doorGroup);

    // Outer Aluminum Door Portal Frame (Header + Jambs)
    const frameThick = 0.12, frameDepth = 0.22;
    const header = new THREE.Mesh(new THREE.BoxGeometry(width + frameThick * 2, frameThick, frameDepth), frameMat);
    header.position.set(0, height + frameThick / 2, 0);

    const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(frameThick, height, frameDepth), frameMat);
    leftJamb.position.set(-(width / 2 + frameThick / 2), height / 2, 0);

    const rightJamb = leftJamb.clone();
    rightJamb.position.x = width / 2 + frameThick / 2;

    // Overhead Infrared Motion Sensor Unit with glowing green/blue status LED
    const sensorUnit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), frameMat);
    sensorUnit.position.set(0, height + 0.12, frameDepth / 2 + 0.05);

    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    led.position.set(0, height + 0.12, frameDepth / 2 + 0.12);

    doorGroup.add(header, leftJamb, rightJamb, sensorUnit, led);

    // Left and Right Sliding Glass Door Panels
    const panelW = width / 2 - 0.04;
    const panelH = height - 0.08;
    const panelDepth = 0.05;

    // Left Leaf Group
    const leftLeaf = new THREE.Group();
    leftLeaf.position.set(-panelW / 2 - 0.02, 0, 0);
    const leftGlass = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, panelDepth), seeThroughGlassMat);
    leftGlass.position.y = panelH / 2 + 0.04;
    // Push bar / handle
    const leftHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8), silverAluminumFrameMat);
    leftHandle.position.set(panelW / 2 - 0.12, 1.1, panelDepth / 2 + 0.04);
    leftLeaf.add(leftGlass, leftHandle);

    // Right Leaf Group
    const rightLeaf = new THREE.Group();
    rightLeaf.position.set(panelW / 2 + 0.02, 0, 0);
    const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, panelDepth), seeThroughGlassMat);
    rightGlass.position.y = panelH / 2 + 0.04;
    // Push bar / handle
    const rightHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8), silverAluminumFrameMat);
    rightHandle.position.set(-panelW / 2 + 0.12, 1.1, panelDepth / 2 + 0.04);
    rightLeaf.add(rightGlass, rightHandle);

    doorGroup.add(leftLeaf, rightLeaf);

    // Door State
    const maxSlide = panelW * 0.88;
    const doorRecord = {
      group: doorGroup,
      leftLeaf,
      rightLeaf,
      led,
      worldPos: new THREE.Vector3(),
      openAmount: 0.0,
      targetOpen: 0.0,
      maxSlide,
      origLeftX: leftLeaf.position.x,
      origRightX: rightLeaf.position.x,
      storeName,
      wasOpen: false
    };

    doorGroup.getWorldPosition(doorRecord.worldPos);
    this.doors.push(doorRecord);
    return doorRecord;
  }

  update(dt, playerPos) {
    if (!playerPos) return;

    for (const d of this.doors) {
      if (!d.placed) { d.group.getWorldPosition(d.worldPos); d.placed = true; } // doors don't move: where it is, once
      const dx = playerPos.x - d.worldPos.x, dz = playerPos.z - d.worldPos.z;
      if (d.openAmount < 0.002 && d.targetOpen === 0 && dx * dx + dz * dz > 400) continue; // shut and nobody near: nothing to do
      const dist = Math.hypot(dx, dz);
      const vertDist = Math.abs(playerPos.y - d.worldPos.y);

      // Trigger sensor within 3.8m distance; the LED only changes when the sensor does
      const want = dist < 3.8 && vertDist < 3.2 ? 1.0 : 0.0;
      if (want !== d.targetOpen) { d.targetOpen = want; d.led.material.color.setHex(want ? 0x38bdf8 : 0x22c55e); } // blue when active, green when idle

      // Smooth slide animation (fast responsive pneumatic open, gentle close)
      const speed = d.targetOpen > d.openAmount ? 4.5 : 2.5;
      d.openAmount = THREE.MathUtils.lerp(d.openAmount, d.targetOpen, dt * speed);

      d.leftLeaf.position.x = d.origLeftX - d.openAmount * d.maxSlide;
      d.rightLeaf.position.x = d.origRightX + d.openAmount * d.maxSlide;

      // Sound trigger
      if (d.openAmount > 0.15 && !d.wasOpen) {
        d.wasOpen = true;
        if (this.ctx && this.ctx.sfx && this.ctx.sfx.interact) {
          this.ctx.sfx.interact(0.15);
        }
      } else if (d.openAmount < 0.05 && d.wasOpen) {
        d.wasOpen = false;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. ROOFTOP HVAC, RESTAURANT EXHAUST FANS & MECHANICALS
// ---------------------------------------------------------------------------

export function createRooftopHVAC(parent, opts = {}) {
  const {
    x = 0, y = 0, z = 0,
    rotY = 0,
    width = 3.4,
    depth = 2.2,
    height = 1.6,
    isRestaurant = false
  } = opts;

  const hvacGroup = new THREE.Group();
  hvacGroup.position.set(x, y, z);
  hvacGroup.rotation.y = rotY;
  parent.add(hvacGroup);

  // 1. Vibration Isolation Mounting Curb (Heavy wood/steel base)
  const curbH = 0.35;
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.9 });
  const curb = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, curbH, depth + 0.2), curbMat);
  curb.position.y = curbH / 2;
  hvacGroup.add(curb);

  // 2. Main Sheet Metal RTU Cabinet
  const grilleTex = getHVACGrilleTex();
  const rtuMat = new THREE.MeshStandardMaterial({
    color: 0x9ca3af,
    metalness: 0.7,
    roughness: 0.4
  });
  const rtuCabinet = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), rtuMat);
  rtuCabinet.position.y = curbH + height / 2;
  hvacGroup.add(rtuCabinet);

  // Louvered Condenser Grille Panels on Cabinet Sides
  const grilleMat = new THREE.MeshStandardMaterial({
    map: grilleTex,
    roughness: 0.45,
    metalness: 0.65
  });
  const grilleFront = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.45, height * 0.7), grilleMat);
  grilleFront.position.set(width * 0.22, curbH + height / 2, depth / 2 + 0.01);
  const grilleBack = grilleFront.clone();
  grilleBack.rotation.y = Math.PI;
  grilleBack.position.z = -(depth / 2 + 0.01);
  hvacGroup.add(grilleFront, grilleBack);

  // 3. Top Condenser Exhaust Fan Cowl & Protective Radial Wire Guard
  const cowlMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.5, metalness: 0.6 });
  const fanCowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.3, 16), cowlMat);
  fanCowl.position.set(-width * 0.2, curbH + height + 0.15, 0);

  // Wire guard grill top
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.3, metalness: 0.8 });
  const fanGrill = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.04, 12), wireMat);
  fanGrill.position.set(-width * 0.2, curbH + height + 0.31, 0);
  hvacGroup.add(fanCowl, fanGrill);

  // 4. Electrical Disconnect Switch Box & EMT Conduit Pipe
  const disconnectBox = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.14), galvanizedMetalMat);
  disconnectBox.position.set(width / 2 + 0.13, curbH + height * 0.55, depth * 0.25);

  const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, curbH + height * 0.55), silverAluminumFrameMat);
  conduit.position.set(width / 2 + 0.13, (curbH + height * 0.55) / 2, depth * 0.25);
  hvacGroup.add(disconnectBox, conduit);

  // 5. Copper Refrigerant Line Set
  const copperLine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, curbH + height * 0.6), copperPipeMat);
  copperLine.position.set(width / 2 + 0.08, (curbH + height * 0.6) / 2, -depth * 0.25);
  hvacGroup.add(copperLine);

  // 6. Upblast Restaurant Kitchen Grease Exhaust Mushroom Fan (if restaurant)
  if (isRestaurant) {
    const hoodGroup = new THREE.Group();
    hoodGroup.position.set(width * 0.85, 0, 0);

    // Tall curb
    const hoodCurb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.2), curbMat);
    hoodCurb.position.y = 0.4;

    // Upblast spun aluminum dome (mushroom fan)
    const domeMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.9, roughness: 0.2 });
    const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.55, 0.6, 20), domeMat);
    domeBase.position.y = 1.1;

    const domeCap = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), domeMat);
    domeCap.position.y = 1.4;

    // Grease collection box
    const greaseBox = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), galvanizedMetalMat);
    greaseBox.position.set(0.65, 0.7, 0);

    hoodGroup.add(hoodCurb, domeBase, domeCap, greaseBox);
    hvacGroup.add(hoodGroup);
  }

  return hvacGroup;
}

// ---------------------------------------------------------------------------
// 3. ROOFTOP ACCESS HATCH & PARAPET FLASHING
// ---------------------------------------------------------------------------

export function createRoofAccessHatch(parent, x, y, z) {
  const hatchGroup = new THREE.Group();
  hatchGroup.position.set(x, y, z);

  // Curb
  const curb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 1.1), galvanizedMetalMat);
  curb.position.y = 0.175;

  // Angled insulated steel cover
  const cover = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.08, 1.18), darkBronzeFrameMat);
  cover.position.set(0, 0.38, 0);
  cover.rotation.x = 0.08;

  // Safety railing on 3 sides
  const railMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }); // Safety Yellow
  const railBack = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.06), railMat);
  railBack.position.set(0, 0.5, 0.7);

  const railLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 1.3), railMat);
  railLeft.position.set(-0.8, 0.5, 0);

  const railRight = railLeft.clone();
  railRight.position.x = 0.8;

  hatchGroup.add(curb, cover, railBack, railLeft, railRight);
  parent.add(hatchGroup);
  return hatchGroup;
}

// ---------------------------------------------------------------------------
// 4. HYPER-REALISTIC LAND CHUNKS: ASPHALT, CURBS, PARKING & SIDEWALKS
// ---------------------------------------------------------------------------

export function createPlazaLandChunk(parent, opts = {}) {
  const {
    cx = 0, cz = 0,
    width = 110, depth = 90,
    floorY = 0,
    storefrontOffsetZ = -18,
    parkingRows = 3,
    plazaStyle = 'spanish'
  } = opts;

  const landGroup = new THREE.Group();
  landGroup.position.set(cx, floorY, cz);
  parent.add(landGroup);

  // 1. High-Detail Dark Asphalt Ground Pad
  const asphaltTex = getAsphaltTex().clone(); // own tiling per plaza (the image is shared)
  asphaltTex.repeat.set(width / 16, depth / 16);
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    roughness: 0.85,
    metalness: 0.05
  });
  const asphaltPad = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, depth), asphaltMat);
  asphaltPad.position.y = 0.08;
  asphaltPad.receiveShadow = true;
  landGroup.add(asphaltPad);

  // 2. Continuous Scored Concrete Pedestrian Promenade & Sidewalk Arcade
  const sidewalkW = width - 4.0;
  const sidewalkD = 14.0;
  const scoredTex = getScoredSidewalkTex().clone();
  scoredTex.repeat.set(sidewalkW / 3, sidewalkD / 3);
  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: scoredTex,
    roughness: 0.85,
    metalness: 0.02
  });

  const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(sidewalkW, 0.18, sidewalkD), sidewalkMat);
  sidewalk.position.set(0, 0.17, storefrontOffsetZ + sidewalkD / 2);
  sidewalk.receiveShadow = true;
  landGroup.add(sidewalk);

  // 3. 3D Beveled Concrete Perimeter Curb (Chamfered edge)
  const curbBevel = new THREE.Mesh(
    new THREE.BoxGeometry(sidewalkW + 0.3, 0.22, sidewalkD + 0.3),
    concreteCurbMat
  );
  curbBevel.position.set(0, 0.11, storefrontOffsetZ + sidewalkD / 2);
  curbBevel.receiveShadow = true;
  landGroup.add(curbBevel);

  // 4. ADA Ramp Cuts with Safety-Yellow Truncated Dome Warning Paving
  const tactileTex = getTactilePavingTex();
  const tactileMat = new THREE.MeshStandardMaterial({
    map: tactileTex,
    roughness: 0.6,
    metalness: 0.1
  });

  // Crosswalk ramp cut in front of store center and wings
  [-width * 0.32, 0, width * 0.32].forEach(rx => {
    const rampCut = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.24, 1.8), tactileMat);
    rampCut.position.set(rx, 0.18, storefrontOffsetZ + sidewalkD + 0.1);
    landGroup.add(rampCut);
  });

  // 5. Striped Parking Bays (Double rows of stalls + Driving Aisles)
  const parkingTex = getParkingLotTex();
  parkingTex.repeat.set(2, 1);
  const parkingMat = new THREE.MeshStandardMaterial({
    map: parkingTex,
    roughness: 0.8,
    metalness: 0.05
  });

  const stallRowW = width * 0.86;
  const stallRowD = 16.0;

  for (let r = 0; r < parkingRows; r++) {
    const rowZ = storefrontOffsetZ + sidewalkD + 8.0 + r * (stallRowD + 7.5);
    if (rowZ + stallRowD / 2 > depth / 2 - 2) break;

    const stallRow = new THREE.Mesh(new THREE.PlaneGeometry(stallRowW, stallRowD), parkingMat);
    stallRow.rotation.x = -Math.PI / 2;
    stallRow.position.set(0, 0.17, rowZ);
    stallRow.receiveShadow = true;
    landGroup.add(stallRow);

    // Concrete Wheel Stops / Bumper Blocks on stalls
    for (let bx = -stallRowW * 0.44; bx <= stallRowW * 0.44; bx += 5.2) {
      const wheelStop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.2), concreteCurbMat);
      wheelStop.position.set(bx, 0.23, rowZ - stallRowD * 0.44);
      wheelStop.castShadow = true;
      landGroup.add(wheelStop);
    }
  }

  // 6. Curbed Landscape Islands with Dark Mulch & Palms / Cypress
  const islandW = 4.2, islandD = 14.0;
  [-width * 0.44, width * 0.44].forEach(ix => {
    const islandGroup = new THREE.Group();
    islandGroup.position.set(ix, 0, storefrontOffsetZ + sidewalkD + 18.0);

    // Concrete Curb
    const islandCurb = new THREE.Mesh(new THREE.BoxGeometry(islandW + 0.4, 0.28, islandD + 0.4), concreteCurbMat);
    islandCurb.position.y = 0.14;

    // Mulch Top
    const mulch = new THREE.Mesh(new THREE.BoxGeometry(islandW, 0.3, islandD), darkMulchMat);
    mulch.position.y = 0.16;

    // the island's tree: a marker the game plants a real one on (index.html initArchWorld -> GARDEN): fan palms at the
    // Spanish and lifestyle centres, pepper trees elsewhere
    const treeGroup = new THREE.Object3D();
    treeGroup.position.set(0, 0.3, 0);
    treeGroup.userData.plant = plazaStyle === 'spanish' || plazaStyle === 'lifestyle' ? (plazaStyle === 'lifestyle' && ix > 0 ? 'palm_queen' : 'palm_fan') : 'pepper';

    islandGroup.add(islandCurb, mulch, treeGroup);
    landGroup.add(islandGroup);
  });

  // 7. Commercial LED Parking Lot Light Poles
  [-width * 0.35, width * 0.35].forEach(lx => {
    const poleGroup = new THREE.Group();
    poleGroup.position.set(lx, 0, storefrontOffsetZ + sidewalkD + 26.0);

    const baseCurb = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.6, 12), concreteCurbMat);
    baseCurb.position.y = 0.3;

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 9.0, 10), darkBronzeFrameMat);
    pole.position.y = 4.8;

    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.16, 0.16), darkBronzeFrameMat);
    arm.position.y = 9.3;

    const luminaireL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.4), darkBronzeFrameMat);
    luminaireL.position.set(-1.2, 9.15, 0);

    const luminaireR = luminaireL.clone();
    luminaireR.position.x = 1.2;

    poleGroup.add(baseCurb, pole, arm, luminaireL, luminaireR);
    landGroup.add(poleGroup);
  });

  return landGroup;
}
