/**
 * Procedural Exterior Facade & Wall Generator
 * Builds realistic exterior walls, framed windows, entry doors, garage doors, and exterior utilities.
 */
import * as THREE from 'three';

export class FacadeGenerator {
  constructor(textureFactory) {
    this.tex = textureFactory;
  }

  generate(options) {
    const {
      width = 12,
      depth = 14,
      height = 6.2,
      stories = 2,
      wallColor = 0xebe5d8,
      hasGarage = true
    } = options;

    const group = new THREE.Group();
    group.name = 'ExteriorFacade';

    const wallMat = this.tex.getStucco(wallColor);
    wallMat.map.repeat.set(width * 0.4, height * 0.4);
    wallMat.normalMap.repeat.set(width * 0.4, height * 0.4);

    const glassMat = this.tex.getGlass();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.4, metalness: 0.1 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const woodDoorMat = new THREE.MeshStandardMaterial({ color: 0x5a2d18, roughness: 0.5 });
    const garageDoorMat = new THREE.MeshStandardMaterial({ color: 0xf2efea, roughness: 0.65 });

    const wallThick = 0.28;
    const halfW = width / 2;
    const halfD = depth / 2;
    const storyH = height / stories;

    // --- 1. Base Foundation Water-Table Trim ---
    const baseSill = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.1, 0.4, depth + 0.1),
      new THREE.MeshStandardMaterial({ color: 0x8a857b, roughness: 0.9 })
    );
    baseSill.position.set(0, 0.2, 0);
    baseSill.castShadow = true;
    baseSill.receiveShadow = true;
    group.add(baseSill);

    // --- 2. Build 4 Main Perimeter Walls ---
    // Back Wall (+Z)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallThick), wallMat);
    backWall.position.set(0, height / 2, halfD - wallThick / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    group.add(backWall);

    // Left Wall (-X)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, depth), wallMat);
    leftWall.position.set(-halfW + wallThick / 2, height / 2, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    group.add(leftWall);

    // Right Wall (+X)
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, depth), wallMat);
    rightWall.position.set(halfW - wallThick / 2, height / 2, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    group.add(rightWall);

    // Front Wall (-Z) is composed of sections with openings for door, windows, and garage
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallThick), wallMat);
    frontWall.position.set(0, height / 2, -halfD + wallThick / 2);
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    group.add(frontWall);

    // --- 3. Windows & Frames ---
    const addWindow = (x, y, z, rotY = 0, winW = 1.4, winH = 1.6) => {
      const winGroup = new THREE.Group();

      // Recessed glass
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
      glass.position.z = 0.02;

      // Outer Trim
      const trimThick = 0.08, trimW = 0.1;
      const tTop = new THREE.Mesh(new THREE.BoxGeometry(winW + trimW * 2, trimW, trimThick), trimMat);
      tTop.position.set(0, winH / 2 + trimW / 2, 0);
      const tBottom = new THREE.Mesh(new THREE.BoxGeometry(winW + trimW * 2 + 0.08, trimW + 0.04, trimThick + 0.06), trimMat);
      tBottom.position.set(0, -winH / 2 - trimW / 2, 0.02); // Projected Sill
      const tLeft = new THREE.Mesh(new THREE.BoxGeometry(trimW, winH, trimThick), trimMat);
      tLeft.position.set(-winW / 2 - trimW / 2, 0, 0);
      const tRight = new THREE.Mesh(new THREE.BoxGeometry(trimW, winH, trimThick), trimMat);
      tRight.position.set(winW / 2 + trimW / 2, 0, 0);

      // Window Frame & Mullions (Black/Bronze Aluminum)
      const fHoriz = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.04, 0.05), frameMat);
      const fVert = new THREE.Mesh(new THREE.BoxGeometry(0.04, winH, 0.05), frameMat);

      winGroup.add(glass, tTop, tBottom, tLeft, tRight, fHoriz, fVert);
      winGroup.position.set(x, y, z);
      winGroup.rotation.y = rotY;
      winGroup.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(winGroup);
    };

    // Front Windows
    for (let s = 0; s < stories; s++) {
      const wy = s * storyH + storyH * 0.55;
      if (s === 0) {
        // Ground floor: window next to front door
        addWindow(-halfW * 0.5, wy, -halfD);
      } else {
        // Second floor: balanced windows
        addWindow(-halfW * 0.5, wy, -halfD);
        addWindow(halfW * 0.5, wy, -halfD);
        if (width > 12) addWindow(0, wy, -halfD);
      }
    }

    // Side Windows
    for (let s = 0; s < stories; s++) {
      const wy = s * storyH + storyH * 0.55;
      addWindow(-halfW, wy, -depth * 0.2, Math.PI / 2);
      addWindow(-halfW, wy, depth * 0.2, Math.PI / 2);
      addWindow(halfW, wy, -depth * 0.2, -Math.PI / 2);
      addWindow(halfW, wy, depth * 0.2, -Math.PI / 2);
    }

    // --- 4. Main Front Entryway & Portico ---
    const doorW = 1.1, doorH = 2.3;
    const doorX = hasGarage ? -halfW * 0.15 : 0;
    const doorZ = -halfD;

    const entryGroup = new THREE.Group();
    // Entry Porch Step
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(doorW + 1.2, 0.2, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x908c84, roughness: 0.85 })
    );
    step.position.set(doorX, 0.1, doorZ - 0.6);
    step.castShadow = true;
    step.receiveShadow = true;

    // Wood Front Door with Inset Panels
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.08), woodDoorMat);
    door.position.set(doorX, doorH / 2 + 0.2, doorZ - 0.02);
    door.castShadow = true;

    // Metallic Door Handle
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 })
    );
    handle.rotation.z = Math.PI / 2;
    handle.position.set(doorX + doorW * 0.38, 1.15, doorZ - 0.08);

    // Portico Roof Overhang & Columns
    const porticoRoof = new THREE.Mesh(
      new THREE.BoxGeometry(doorW + 1.4, 0.18, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
    );
    porticoRoof.position.set(doorX, doorH + 0.45, doorZ - 0.7);
    porticoRoof.castShadow = true;

    const colGeom = new THREE.CylinderGeometry(0.08, 0.1, doorH + 0.15, 12);
    const colMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const colL = new THREE.Mesh(colGeom, colMat);
    colL.position.set(doorX - (doorW + 1.1) / 2, (doorH + 0.15) / 2 + 0.2, doorZ - 1.2);
    colL.castShadow = true;
    const colR = colL.clone();
    colR.position.x = doorX + (doorW + 1.1) / 2;

    // Exterior Lantern Sconce
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xffecc2,
      emissive: 0xffa030,
      emissiveIntensity: 0.6
    });
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), lanternMat);
    lantern.position.set(doorX - doorW / 2 - 0.25, 1.8, doorZ - 0.1);
    lantern.castShadow = true;

    entryGroup.add(step, door, handle, porticoRoof, colL, colR, lantern);
    group.add(entryGroup);

    // --- 5. Garage Door (2-Car Sectional) ---
    if (hasGarage) {
      const gw = 5.0, gh = 2.4;
      const gx = halfW * 0.45;
      const gz = -halfD;

      const garageGroup = new THREE.Group();
      // Sectional Door Face
      const gDoor = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, 0.06), garageDoorMat);
      gDoor.position.set(gx, gh / 2 + 0.1, gz - 0.02);
      gDoor.castShadow = true;

      // Embossed horizontal panel lines
      const panelMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7 });
      for (let p = 1; p < 4; p++) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.02, 0.07), panelMat);
        seam.position.set(gx, p * (gh / 4) + 0.1, gz - 0.02);
        garageGroup.add(seam);
      }

      // Exterior Garage Frame Architrave
      const gFrameTop = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.3, 0.16, 0.12), trimMat);
      gFrameTop.position.set(gx, gh + 0.18, gz - 0.04);
      gFrameTop.castShadow = true;
      garageGroup.add(gDoor, gFrameTop);
      group.add(garageGroup);
    }

    // --- 6. Utility Detailing (AC Compressor, Electric Meter) ---
    const acUnit = new THREE.Group();
    const acBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.85, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x6e7882, roughness: 0.6, metalness: 0.4 })
    );
    acBox.position.set(-halfW - 0.55, 0.45, depth * 0.15);
    acBox.castShadow = true;

    const acFan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })
    );
    acFan.position.copy(acBox.position);
    acFan.position.y += 0.44;
    acUnit.add(acBox, acFan);
    group.add(acUnit);

    // Electric Meter Box
    const meter = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.45, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x7c858c, roughness: 0.5, metalness: 0.5 })
    );
    meter.position.set(-halfW - 0.08, 1.6, depth * 0.35);
    meter.castShadow = true;
    group.add(meter);

    return group;
  }
}
