// Rolled light loops. three.js unrolls the point and spot light loops of every lit material into one copy of the
// lighting code per light; with the street lamps, headlights and effect lights that is twelve copies in each of some
// sixty programs, and the Direct3D shader compiler under Chrome on Windows spends half a second on each program (a
// third of that on the copies). Lights with no shadow and no light map don't need the loop index at compile time, so
// here they run as real loops; shadowed ones keep three's unrolled code. Call once, before the first material compiles.
//   rollLightLoops(THREE)   -> true when patched
export function rollLightLoops(THREE) {
  const C = THREE.ShaderChunk, src = C.lights_fragment_begin;
  const P = '#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )', S = '#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )';
  const pA = src.indexOf(P), sA = src.indexOf(S);
  if (pA < 0 || sA < pA || src.includes('ROLLED_LIGHT_LOOPS')) return false;
  const loop = (kind, arr, info) => `	${kind} ${arr.slice(0, -1)};
	for ( int i = 0; i < NUM_${kind === 'PointLight' ? 'POINT' : 'SPOT'}_LIGHTS; i ++ ) {
		${arr.slice(0, -1)} = ${arr}[ i ];
		${info}( ${arr.slice(0, -1)}, geometryPosition, directLight );
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}`;
  const point = `#define ROLLED_LIGHT_LOOPS
${P} && !( defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0 )
${loop('PointLight', 'pointLights', 'getPointLightInfo')}
#elif`;
  const spot = `${S} && NUM_SPOT_LIGHT_MAPS == 0 && !( defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0 )
${loop('SpotLight', 'spotLights', 'getSpotLightInfo')}
#elif`;
  // each original block stays as the #elif branch (its '#if' becomes '#elif'), for the shadowed and light-mapped cases
  C.lights_fragment_begin = src.slice(0, pA) + point + src.slice(pA + 3, sA) + spot + src.slice(sA + 3);
  return true;
}
