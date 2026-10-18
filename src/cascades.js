// Two shadow cascades for High and Ultra: a sharp map close around the camera and a coarse one out to ~300 m, in
// place of one map stretched over 240 m. The far map re-renders only every few frames (what it covers barely moves),
// and both snap to whole shadow texels so their edges don't crawl as you move.
// The sun stays the only light that shines. A second directional light (intensity 0) owns the far map, and three's
// light chunk is patched so that a scene with exactly two shadowed directional lights reads the second one as the far
// cascade of the first: near map inside its square, a blend at its rim, the far map beyond. Scenes with any other
// light setup compile three's code unchanged.
//   const CASC = createCascades(THREE, scene, sun, { near, far, nearHalf, farHalf, farEvery })   CASC.update(camera, lightDir)
export function createCascades(THREE, scene, sun, { near: nearSize = 2048, far: farSize = 2048, nearHalf = 34, farHalf = 300, farEvery = 3 } = {}) {
  const C = THREE.ShaderChunk;
  const at = C.lights_fragment_begin.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
  if (at < 0) { console.warn('[cascades] three light chunk changed; cascades off'); return null; }
  C.lights_fragment_begin = C.lights_fragment_begin.slice(0, at) + /* glsl */`
#if ( NUM_DIR_LIGHTS == 2 ) && ( NUM_DIR_LIGHT_SHADOWS == 2 ) && defined( RE_Direct ) && defined( USE_SHADOWMAP )
	DirectionalLight directionalLight = directionalLights[ 0 ];
	getDirectionalLightInfo( directionalLight, directLight );
	if ( directLight.visible && receiveShadow ) {
		vec4 c0 = vDirectionalShadowCoord[ 0 ];
		vec2 e0 = abs( c0.xy / c0.w - 0.5 ); float m0 = max( e0.x, e0.y ), s = 1.0;
		if ( m0 < 0.5 ) s = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, c0 );
		if ( m0 > 0.42 ) {
			float s1 = getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] );
			s = mix( s, s1, smoothstep( 0.42, 0.5, m0 ) );
		}
		directLight.color *= s;
	}
	RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
` + C.lights_fragment_begin.slice(at).replace('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )', '#elif ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');

  sun.shadow.mapSize.set(nearSize, nearSize);
  Object.assign(sun.shadow.camera, { left: -nearHalf, right: nearHalf, top: nearHalf, bottom: -nearHalf, near: 1, far: 900 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  const far = new THREE.DirectionalLight(0xffffff, 0); far.castShadow = true;
  far.shadow.mapSize.set(farSize, farSize);
  Object.assign(far.shadow.camera, { left: -farHalf, right: farHalf, top: farHalf, bottom: -farHalf, near: 1, far: 1400 });
  far.shadow.camera.updateProjectionMatrix(); far.shadow.bias = -0.0008; far.shadow.normalBias = 0.35;
  far.shadow.autoUpdate = false;
  scene.add(far, far.target);

  const X = new THREE.Vector3(), Y = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(), c = new THREE.Vector3();
  let frame = 0;
  // centre a cascade's square on p, moved in whole texels of its map (in the light's own x / y)
  function place(light, p, half, ld, dist, size) {
    X.crossVectors(up, ld); if (X.lengthSq() < 1e-6) X.set(1, 0, 0); X.normalize(); Y.crossVectors(ld, X);
    const t = half * 2 / size, x = p.dot(X), y = p.dot(Y);
    c.copy(p).addScaledVector(X, Math.round(x / t) * t - x).addScaledVector(Y, Math.round(y / t) * t - y);
    light.target.position.copy(c); light.position.copy(c).addScaledVector(ld, dist);
    light.target.updateMatrixWorld(); light.updateMatrixWorld();
  }
  return {
    far,
    update(camera, ld) {
      camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
      place(sun, c.copy(camera.position).addScaledVector(fwd, nearHalf * 0.55), nearHalf, ld, 400, nearSize);
      if (frame++ % farEvery === 0) { place(far, c.copy(camera.position).addScaledVector(fwd, farHalf * 0.45), farHalf, ld, 700, farSize); far.shadow.needsUpdate = true; }
    },
  };
}
