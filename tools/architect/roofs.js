/**
 * Procedural Roof Generator (AAA Photorealistic SoCal / Poway Architecture)
 * Features:
 * - Spanish Clay Tile: Barrel tiles, terracotta ridge caps, exposed dark wood rafter tails (corbels).
 * - Commercial Flat: Stepped parapets, coping caps, RTU HVAC chillers + San Diego code louvered screens.
 * - California Ranch Gable/Hip: Shingle ridge caps, fascia boards, drip edges, and overhangs.
 * - Modern Luxury Shed: Deep 1.2m cantilevers, architectural cedar tongue-and-groove under-soffit.
 */
import * as THREE from 'three';

export class RoofGenerator {
  constructor(textureFactory) {
    this.tex = textureFactory;
  }

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

  // --- 1. Spanish Clay Tile Roof with Exposed Wooden Rafter Tails (Corbels) ---
  buildSpanishHipRoof(group, w, d, baseH, pitch) {
    const overhang = 0.45; // Real SoCal Spanish revivals have tight/minimal eaves
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

    const geom = new THREE.BufferGeometry();
    const pos = [];
    const uvs = [];
    const normals = [];

    const pBL = [-halfW, baseH, -halfD];
    const pBR = [halfW, baseH, -halfD];
    const pTR = [halfW, baseH, halfD];
    const pTL = [-halfW, baseH, halfD];

    const rL = [-halfRidge, apexH, 0];
    const rR = [halfRidge, apexH, 0];

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

    // 3D Terracotta Ridge Caps along the hips and apex ridge
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

    // AUTHENTIC SOCAL DETAIL: Exposed Dark Wood Rafter Tails (Corbels)
    const rafterMat = new THREE.MeshStandardMaterial({
      color: 0x3d271a, // Dark espresso stained wood
      roughness: 0.8
    });
    const rafterGeom = new THREE.BoxGeometry(0.12, 0.18, overhang + 0.15);

    // Front & Back Rafter Tails
    const rafterSpacing = 0.8;
    const countX = Math.floor(w / rafterSpacing);
    for (let i = 0; i <= countX; i++) {
      const rx = (i / countX - 0.5) * (w - 0.4);
      // Front
      const rf = new THREE.Mesh(rafterGeom, rafterMat);
      rf.position.set(rx, baseH - 0.09, -d / 2 - overhang * 0.4);
      rf.castShadow = true;
      // Back
      const rb = new THREE.Mesh(rafterGeom, rafterMat);
      rb.position.set(rx, baseH - 0.09, d / 2 + overhang * 0.4);
      rb.castShadow = true;
      group.add(rf, rb);
    }

    // Left & Right Rafter Tails
    const sideRafterGeom = new THREE.BoxGeometry(overhang + 0.15, 0.18, 0.12);
    const countZ = Math.floor(d / rafterSpacing);
    for (let i = 0; i <= countZ; i++) {
      const rz = (i / countZ - 0.5) * (d - 0.4);
      // Left
      const rl = new THREE.Mesh(sideRafterGeom, rafterMat);
      rl.position.set(-w / 2 - overhang * 0.4, baseH - 0.09, rz);
      rl.castShadow = true;
      // Right
      const rr = new THREE.Mesh(sideRafterGeom, rafterMat);
      rr.position.set(w / 2 + overhang * 0.4, baseH - 0.09, rz);
      rr.castShadow = true;
      group.add(rl, rr);
    }
  }

  // --- 2. California Ranch Shingle Gable Roof ---
  buildGableShingleRoof(group, w, d, baseH, pitch) {
    const overhang = 0.55;
    const rw = w + overhang * 2;
    const rd = d + overhang * 2;
    const halfW = rw / 2;
    const halfD = rd / 2;
    const apexH = baseH + halfW * pitch;

    const shingleMat = this.tex.getShingleRoof();
    shingleMat.map.repeat.set(rw * 0.5, rd * 0.5);

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

    // Front & Back Gable Triangular Pediments
    const gableMat = this.tex.getStucco(0xdcd5c5);
    const gableGeom = new THREE.BufferGeometry();
    const gpos = [
      -halfW, baseH, -d / 2,  halfW, baseH, -d / 2,  0, apexH, -d / 2,
      halfW, baseH, d / 2,   -halfW, baseH, d / 2,   0, apexH, d / 2
    ];
    gableGeom.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
    gableGeom.computeVertexNormals();
    const gableMesh = new THREE.Mesh(gableGeom, gableMat);
    gableMesh.castShadow = true;
    group.add(gableMesh);

    // Ridge cap shingle line along apex
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.08, rd),
      new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.9 })
    );
    cap.position.set(0, apexH + 0.04, 0);
    cap.castShadow = true;
    group.add(cap);

    // White Eave Trim & Rake Fascia
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.6 });
    const fasciaL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, rd), trimMat);
    fasciaL.position.set(-halfW, baseH - 0.1, 0);
    const fasciaR = fasciaL.clone();
    fasciaR.position.x = halfW;
    group.add(fasciaL, fasciaR);
  }

  // --- 3. Commercial Strip Plaza Flat Roof with Stepped Parapets & Screened HVAC ---
  buildCommercialFlatRoof(group, w, d, baseH) {
    const parapetH = 1.1; // Front stepped parapet
    const parapetThick = 0.28;

    // Recessed roof surface (gravel/tar)
    const roofSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0x3e4247, roughness: 0.95, metalness: 0.05 })
    );
    roofSurface.rotation.x = -Math.PI / 2;
    roofSurface.position.set(0, baseH - 0.2, 0);
    roofSurface.receiveShadow = true;
    group.add(roofSurface);

    // Parapet perimeter walls with stepped center marquee
    const parapetMat = this.tex.getStucco(0xc4beaf);
    const copingMat = new THREE.MeshStandardMaterial({ color: 0xcfd4dc, metalness: 0.7, roughness: 0.3 }); // Aluminum coping

    // Stepped Front Parapet (Taller center section for retail tenant sign)
    const centerW = w * 0.45;
    const sideW = (w - centerW) / 2;

    const fCenter = new THREE.Mesh(new THREE.BoxGeometry(centerW, parapetH + 0.6, parapetThick), parapetMat);
    fCenter.position.set(0, baseH + (parapetH + 0.6) / 2, -d / 2 - parapetThick / 2);
    fCenter.castShadow = true;

    const fLeft = new THREE.Mesh(new THREE.BoxGeometry(sideW, parapetH, parapetThick), parapetMat);
    fLeft.position.set(-centerW / 2 - sideW / 2, baseH + parapetH / 2, -d / 2 - parapetThick / 2);
    fLeft.castShadow = true;

    const fRight = fLeft.clone();
    fRight.position.x = centerW / 2 + sideW / 2;

    // Coping caps
    const cCenter = new THREE.Mesh(new THREE.BoxGeometry(centerW + 0.06, 0.06, parapetThick + 0.06), copingMat);
    cCenter.position.set(0, baseH + parapetH + 0.6 + 0.03, -d / 2 - parapetThick / 2);
    const cLeft = new THREE.Mesh(new THREE.BoxGeometry(sideW + 0.06, 0.06, parapetThick + 0.06), copingMat);
    cLeft.position.set(-centerW / 2 - sideW / 2, baseH + parapetH + 0.03, -d / 2 - parapetThick / 2);
    const cRight = cLeft.clone();
    cRight.position.x = centerW / 2 + sideW / 2;

    group.add(fCenter, fLeft, fRight, cCenter, cLeft, cRight);

    // Side and Rear Parapets
    const addSideWall = (pw, ph, pd, px, pz) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), parapetMat);
      wall.position.set(px, baseH + ph / 2, pz);
      wall.castShadow = true;
      const coping = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.06, 0.06, pd + 0.06), copingMat);
      coping.position.set(px, baseH + ph + 0.03, pz);
      coping.castShadow = true;
      group.add(wall, coping);
    };

    addSideWall(w + parapetThick * 2, parapetH * 0.8, parapetThick, 0, d / 2 + parapetThick / 2);
    addSideWall(parapetThick, parapetH * 0.8, d, -w / 2 - parapetThick / 2, 0);
    addSideWall(parapetThick, parapetH * 0.8, d, w / 2 + parapetThick / 2, 0);

    // SAN DIEGO MUNICIPAL CODE: Louvered Equipment Screen enclosing Rooftop HVAC
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x555d66,
      roughness: 0.4,
      metalness: 0.6
    });
    const screenBox = new THREE.BoxGeometry(w * 0.5, 1.4, d * 0.4);
    const screenEdges = new THREE.Mesh(screenBox, screenMat);
    screenEdges.position.set(0, baseH + 0.7, 0);
    screenEdges.castShadow = true;
    group.add(screenEdges);

    // Industrial Rooftop HVAC Package Unit inside screen
    const hvacMat = new THREE.MeshStandardMaterial({ color: 0x8a929c, metalness: 0.7, roughness: 0.35 });
    const hvac = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 1.8), hvacMat);
    hvac.position.set(0, baseH + 0.65, 0);
    hvac.castShadow = true;

    // Roof Access Hatch & Plumbing Vent Pipes
    const hatch = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.4, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 })
    );
    hatch.position.set(-w * 0.35, baseH + 0.2, d * 0.25);
    group.add(hvac, hatch);
  }

  // --- 4. Modern Luxury Cantilevered Shed Roof ---
  buildModernShedRoof(group, w, d, baseH, pitch) {
    const overhang = 1.1; // Deep architectural cantilever
    const rw = w + overhang * 2;
    const rd = d + overhang * 2;

    const angle = Math.atan(pitch);
    const roofLen = rd / Math.cos(angle);

    const roofGeom = new THREE.BoxGeometry(rw, 0.26, roofLen);
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x1f2328, // Dark bronze architectural metal
      roughness: 0.35,
      metalness: 0.4
    });

    const roofMesh = new THREE.Mesh(roofGeom, roofMat);
    roofMesh.rotation.x = -angle;
    roofMesh.position.set(0, baseH + (rd / 2) * pitch * 0.5, 0);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    group.add(roofMesh);

    // Architectural Cedar Tongue-and-Groove Under-Soffit with Recessed LED Lights
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xb57038,
      roughness: 0.45
    });
    const soffit = new THREE.Mesh(new THREE.PlaneGeometry(rw - 0.05, roofLen - 0.05), woodMat);
    soffit.rotation.x = Math.PI / 2 - angle;
    soffit.position.copy(roofMesh.position);
    soffit.position.y -= 0.14;
    group.add(soffit);

    // Recessed LED Can Lights in Overhang
    const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffeedd, emissiveIntensity: 1.0 });
    for (let i = -rw * 0.35; i <= rw * 0.35; i += rw * 0.35) {
      const led = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12), ledMat);
      led.position.set(i, baseH - 0.1, -d / 2 - overhang * 0.6);
      group.add(led);
    }
  }
}
