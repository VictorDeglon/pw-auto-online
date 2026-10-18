/**
 * Procedural Roof Generator
 * Builds high-fidelity roofs: Spanish Clay Tile, Shingle Gable/Hip, and Commercial Flat with HVAC.
 */
import * as THREE from 'three';

export class RoofGenerator {
  constructor(textureFactory) {
    this.tex = textureFactory;
  }

  /**
   * Generates a roof matching the building style and dimensions.
   */
  generate(style, width, depth, height, pitch = 0.35) {
    const group = new THREE.Group();
    group.name = 'RoofSystem';

    switch (style) {
      case 'spanish_tile':
        this.buildSpanishHipRoof(group, width, depth, height, pitch);
        break;
      case 'shingle_gable':
        this.buildGableShingleRoof(group, width, depth, height, pitch);
        break;
      case 'commercial_flat':
        this.buildCommercialFlatRoof(group, width, depth, height);
        break;
      case 'modern_shed':
        this.buildModernShedRoof(group, width, depth, height, pitch * 0.6);
        break;
      default:
        this.buildSpanishHipRoof(group, width, depth, height, pitch);
        break;
    }

    return group;
  }

  // --- 1. Spanish Clay Tile Hip Roof ---
  buildSpanishHipRoof(group, w, d, baseH, pitch) {
    const overhang = 0.55;
    const rw = w + overhang * 2;
    const rd = d + overhang * 2;
    const halfW = rw / 2;
    const halfD = rd / 2;

    const ridgeLen = Math.max(0, rw - rd);
    const halfRidge = ridgeLen / 2;
    const apexH = baseH + (Math.min(rw, rd) / 2) * pitch;

    const tileMat = this.tex.getSpanishTile();
    tileMat.map.repeat.set(rw * 0.8, rd * 0.8);
    tileMat.normalMap.repeat.set(rw * 0.8, rd * 0.8);

    // Create 4 pitched roof planes
    const geom = new THREE.BufferGeometry();
    const pos = [];
    const uvs = [];
    const normals = [];

    // Left trapezoid/triangle, Right trapezoid/triangle, Front & Back slopes
    const pBL = [-halfW, baseH, -halfD];
    const pBR = [halfW, baseH, -halfD];
    const pTR = [halfW, baseH, halfD];
    const pTL = [-halfW, baseH, halfD];

    const rL = [-halfRidge, apexH, 0];
    const rR = [halfRidge, apexH, 0];

    // Helper to add triangle
    const addTri = (p1, p2, p3) => {
      pos.push(...p1, ...p2, ...p3);
      const v1 = new THREE.Vector3(...p1);
      const v2 = new THREE.Vector3(...p2);
      const v3 = new THREE.Vector3(...p3);
      const n = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(v2, v1),
        new THREE.Vector3().subVectors(v3, v1)
      ).normalize();

      normals.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
      uvs.push(p1[0] / 3, p1[2] / 3, p2[0] / 3, p2[2] / 3, p3[0] / 3, p3[2] / 3);
    };

    // Front slope (-Z)
    addTri(pBL, rL, rR);
    addTri(pBL, rR, pBR);

    // Back slope (+Z)
    addTri(pTL, rR, rL);
    addTri(pTL, pTR, rR);

    // Left hip (-X)
    addTri(pBL, pTL, rL);

    // Right hip (+X)
    addTri(pBR, rR, pTR);

    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    const roofMesh = new THREE.Mesh(geom, tileMat);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    group.add(roofMesh);

    // Add 3D Terracotta Ridge Caps along the hips and apex ridge
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x9e3c1d,
      roughness: 0.65,
      metalness: 0.05
    });

    const addRidgeLine = (start, end) => {
      const vStart = new THREE.Vector3(...start);
      const vEnd = new THREE.Vector3(...end);
      const dist = vStart.distanceTo(vEnd);
      const count = Math.ceil(dist / 0.35);

      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const pos = new THREE.Vector3().lerpVectors(vStart, vEnd, t);
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.14, 0.38, 8, 1, true, 0, Math.PI),
          capMat
        );
        cap.position.copy(pos);
        cap.position.y += 0.06;
        cap.lookAt(vEnd);
        cap.rotation.z += Math.PI / 2;
        cap.castShadow = true;
        group.add(cap);
      }
    };

    if (ridgeLen > 0.1) {
      addRidgeLine(rL, rR);
    }
    addRidgeLine(pBL, rL);
    addRidgeLine(pTL, rL);
    addRidgeLine(pBR, rR);
    addRidgeLine(pTR, rR);

    // Fascia board and gutter trim
    const fasciaMat = new THREE.MeshStandardMaterial({ color: 0x5a483a, roughness: 0.8 });
    const fasciaThick = 0.08, fasciaHeight = 0.22;
    const perimeterBox = new THREE.BoxGeometry(rw, fasciaHeight, fasciaThick);
    
    // Front and back fascia
    const fFront = new THREE.Mesh(perimeterBox, fasciaMat);
    fFront.position.set(0, baseH - fasciaHeight / 2, -halfD);
    fFront.castShadow = true;
    const fBack = fFront.clone();
    fBack.position.z = halfD;

    // Left and right fascia
    const sideBox = new THREE.BoxGeometry(fasciaThick, fasciaHeight, rd);
    const fLeft = new THREE.Mesh(sideBox, fasciaMat);
    fLeft.position.set(-halfW, baseH - fasciaHeight / 2, 0);
    fLeft.castShadow = true;
    const fRight = fLeft.clone();
    fRight.position.x = halfW;

    group.add(fFront, fBack, fLeft, fRight);
  }

  // --- 2. Gable Shingle Roof ---
  buildGableShingleRoof(group, w, d, baseH, pitch) {
    const overhang = 0.45;
    const rw = w + overhang * 2;
    const rd = d + overhang * 2;
    const halfW = rw / 2;
    const halfD = rd / 2;
    const apexH = baseH + halfW * pitch;

    const shingleMat = this.tex.getShingleRoof();
    shingleMat.map.repeat.set(rw * 0.5, rd * 0.5);

    // Sloped roof planes (Left slope & Right slope)
    const geom = new THREE.BufferGeometry();
    const pos = [];
    const normals = [];
    const uvs = [];

    // Left slope (-X to 0)
    pos.push(
      -halfW, baseH, -halfD,   0, apexH, -halfD,   0, apexH, halfD,
      -halfW, baseH, -halfD,   0, apexH, halfD,    -halfW, baseH, halfD
    );
    // Right slope (0 to +X)
    pos.push(
      0, apexH, -halfD,   halfW, baseH, -halfD,   halfW, baseH, halfD,
      0, apexH, -halfD,   halfW, baseH, halfD,    0, apexH, halfD
    );

    const calcNorm = (p1, p2, p3) => {
      const v1 = new THREE.Vector3(...p1);
      const v2 = new THREE.Vector3(...p2);
      const v3 = new THREE.Vector3(...p3);
      return new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(v2, v1),
        new THREE.Vector3().subVectors(v3, v1)
      ).normalize();
    };

    const nl = calcNorm([-halfW, baseH, -halfD], [0, apexH, -halfD], [0, apexH, halfD]);
    for (let i = 0; i < 6; i++) normals.push(nl.x, nl.y, nl.z);
    const nr = calcNorm([0, apexH, -halfD], [halfW, baseH, -halfD], [halfW, baseH, halfD]);
    for (let i = 0; i < 6; i++) normals.push(nr.x, nr.y, nr.z);

    for (let i = 0; i < 12; i++) {
      uvs.push(pos[i * 3] / 2, pos[i * 3 + 2] / 2);
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    const roofMesh = new THREE.Mesh(geom, shingleMat);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    group.add(roofMesh);

    // Gable triangular end walls (matching siding/stucco)
    const gableMat = this.tex.getStucco(0xdcd5c5);
    const gableGeom = new THREE.BufferGeometry();
    const gpos = [
      // Front triangle
      -halfW, baseH, -d / 2,  halfW, baseH, -d / 2,  0, apexH, -d / 2,
      // Back triangle
      halfW, baseH, d / 2,   -halfW, baseH, d / 2,   0, apexH, d / 2
    ];
    gableGeom.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
    gableGeom.computeVertexNormals();
    const gableMesh = new THREE.Mesh(gableGeom, gableMat);
    gableMesh.castShadow = true;
    group.add(gableMesh);

    // Ridge cap along center
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.08, rd),
      new THREE.MeshStandardMaterial({ color: 0x272a2e, roughness: 0.9 })
    );
    cap.position.set(0, apexH + 0.04, 0);
    cap.castShadow = true;
    group.add(cap);
  }

  // --- 3. Commercial Flat Roof with Parapets and HVAC ---
  buildCommercialFlatRoof(group, w, d, baseH) {
    const parapetH = 0.9;
    const parapetThick = 0.25;

    // Recessed roof surface (gravel/tar)
    const roofSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.95, metalness: 0.05 })
    );
    roofSurface.rotation.x = -Math.PI / 2;
    roofSurface.position.set(0, baseH - 0.15, 0);
    roofSurface.receiveShadow = true;
    group.add(roofSurface);

    // Parapet perimeter walls
    const parapetMat = this.tex.getStucco(0xc4beaf);
    const copingMat = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 0.6, roughness: 0.35 }); // Sheet metal cap

    const addParapetWall = (pw, ph, pd, px, pz) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), parapetMat);
      wall.position.set(px, baseH + ph / 2, pz);
      wall.castShadow = true;
      wall.receiveShadow = true;

      // Metal Coping Stone on top
      const coping = new THREE.Mesh(
        new THREE.BoxGeometry(pw + (pd > pw ? 0.06 : 0), 0.06, pd + (pw > pd ? 0.06 : 0)),
        copingMat
      );
      coping.position.set(px, baseH + ph + 0.03, pz);
      coping.castShadow = true;

      group.add(wall, coping);
    };

    addParapetWall(w + parapetThick * 2, parapetH, parapetThick, 0, -d / 2 - parapetThick / 2);
    addParapetWall(w + parapetThick * 2, parapetH, parapetThick, 0, d / 2 + parapetThick / 2);
    addParapetWall(parapetThick, parapetH, d, -w / 2 - parapetThick / 2, 0);
    addParapetWall(parapetThick, parapetH, d, w / 2 + parapetThick / 2, 0);

    // Rooftop Commercial HVAC Chiller Units
    const hvacMat = new THREE.MeshStandardMaterial({ color: 0x9098a0, metalness: 0.7, roughness: 0.35 });
    const hvacCount = Math.max(1, Math.floor((w * d) / 100));

    for (let i = 0; i < hvacCount; i++) {
      const hvac = new THREE.Group();
      // Main cabinet
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.6), hvacMat);
      cabinet.position.y = 0.7;
      cabinet.castShadow = true;
      hvac.add(cabinet);

      // Fan cylinder on top
      const fanGuard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.2, 16),
        new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 })
      );
      fanGuard.position.y = 1.4 + 0.1;
      fanGuard.castShadow = true;
      hvac.add(fanGuard);

      // Base vibration rails
      const railMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.15), railMat);
      r1.position.set(0, 0.06, -0.6);
      const r2 = r1.clone();
      r2.position.z = 0.6;
      hvac.add(r1, r2);

      const offsetX = (i - (hvacCount - 1) / 2) * 3.5;
      hvac.position.set(offsetX, baseH, 0);
      group.add(hvac);
    }
  }

  // --- 4. Modern Shed Roof ---
  buildModernShedRoof(group, w, d, baseH, pitch) {
    const overhang = 0.6;
    const rw = w + overhang * 2;
    const rd = d + overhang * 2;

    const angle = Math.atan(pitch);
    const roofLen = rd / Math.cos(angle);

    const roofGeom = new THREE.BoxGeometry(rw, 0.25, roofLen);
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x22262c,
      roughness: 0.4,
      metalness: 0.2
    });

    const roofMesh = new THREE.Mesh(roofGeom, roofMat);
    roofMesh.rotation.x = -angle;
    roofMesh.position.set(0, baseH + (rd / 2) * pitch * 0.5, 0);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    group.add(roofMesh);

    // Architectural Wood Under-Soffit
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xba7638,
      roughness: 0.45
    });
    const soffit = new THREE.Mesh(new THREE.PlaneGeometry(rw - 0.05, roofLen - 0.05), woodMat);
    soffit.rotation.x = Math.PI / 2 - angle;
    soffit.position.copy(roofMesh.position);
    soffit.position.y -= 0.13;
    group.add(soffit);
  }
}
