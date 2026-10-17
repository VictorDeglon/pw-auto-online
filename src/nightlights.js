// Night light that actually lights things: the street lamps nearest the camera get real spot lights (so cars, people
// and the road under them are lit, not just a glow painted on the ground), and every car's head and tail lights burn
// brighter after dark, with a soft pool of headlight on the road ahead.
//   const NL = createNightLights(THREE, scene, n)       // n lights, made once at boot so no shader ever recompiles
//   NL.update(camera, night, lampsNear)                  // lampsNear(x, z, r) -> [{ x, y, z, rot }] (lamp bases)
//   NL.carLights(model, night)                           // per car: lamp materials and the headlight pool
//   headlightBeam(THREE, length, width)                 // the headlight pool mesh buildCar hangs on each car

export function createNightLights(THREE, scene, n) {
  const lights = [];
  for (let i = 0; i < n; i++) {
    // LED street light: warm white, a wide cone straight down, gone by 26 m
    const l = new THREE.SpotLight(0xffd9a8, 0, 26, 1.05, 0.75, 1.6); l.castShadow = false;
    scene.add(l, l.target); lights.push(l);
  }
  const fwd = new THREE.Vector3();
  let t = 0;
  return {
    lights,
    update(camera, night, lampsNear, dt = 0.1) {
      t -= dt; if (t > 0 && night > 0.02) return; t = 0.25;
      if (!n) return;
      if (night < 0.02) { for (const l of lights) l.intensity = 0; return; }
      camera.getWorldDirection(fwd);
      const p = camera.position, list = lampsNear(p.x, p.z, 75);
      // nearest first, and the ones in front of the camera before the ones behind it
      for (const L of list) { const dx = L.x - p.x, dz = L.z - p.z, d = Math.hypot(dx, dz) || 1; L.score = d * (1.6 - 0.7 * (dx * fwd.x + dz * fwd.z) / d); }
      list.sort((a, b) => a.score - b.score);
      for (let i = 0; i < n; i++) {
        const l = lights[i], L = list[i];
        if (!L) { l.intensity = 0; continue; }
        const hx = L.x + Math.sin(L.rot) * 1.6, hz = L.z + Math.cos(L.rot) * 1.6;
        l.position.set(hx, L.y + 6.8, hz); l.target.position.set(hx, L.y, hz); l.target.updateMatrixWorld();
        l.intensity = 34 * night; // ~1.5 under the lamp, ~0.5 at the edge of its pool (moonlight is ~0.3)
      }
    },
    carLights(m, night) {
      for (const mt of m.allMats) {
        const k = mt.userData.lamp; if (!k) continue;
        mt.emissiveIntensity = k === 'head' ? 0.25 + night * 3.2 : 0.4 + night * 1.6;
      }
      if (m.beam) { m.beam.visible = night > 0.05; m.beam.material.opacity = night * 0.55; }
    },
  };
}

let beamTex = null;
// a soft, wide pool on the road ahead of a car's headlights (additive, no lighting needed)
export function headlightBeam(THREE, L, W) {
  if (!beamTex) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
    const img = g.createImageData(64, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
      const v = y / 127, u = (x / 63 - 0.5) * 2, spread = 0.35 + v * 0.65;     // v: 0 at the bumper, 1 far ahead
      const a = Math.max(0, 1 - Math.pow(Math.abs(u) / spread, 2)) * Math.pow(1 - v, 1.4) * Math.min(1, v * 8);
      const k = (y * 64 + x) * 4; img.data[k] = 255; img.data[k + 1] = 236; img.data[k + 2] = 200; img.data[k + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0); beamTex = new THREE.CanvasTexture(c); beamTex.colorSpace = THREE.SRGBColorSpace;
  }
  const len = 16, wid = W * 2.6;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wid, len).rotateX(-Math.PI / 2).translate(0, 0.06, L / 2 + len / 2 - 0.3),
    new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
  m.visible = false; m.renderOrder = 2; return m;
}
