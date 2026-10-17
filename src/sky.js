// The sky dome. index.html decides the hour and the weather (updateWeather, sharedSky, the Settings lock) and feeds
// the colours and amounts in through the uniforms; this only draws them:
//   - the day gradient with a living sunset: gold -> orange -> red -> magenta bands toward the sun, the pink belt of
//     Venus over the blue shadow of the Earth on the far side, a Mie halo and a limb-darkened disc, crepuscular rays
//   - cumulus: domain-warped noise on a cloud plane, lit by marching a few steps toward the sun (or the moon), with a
//     powdery dark core, bright silver edges toward the light and undersides on fire at golden hour; an overcast deck
//     when the weather fills in; high cirrus streaks above
//   - night: a real star field (fixed on the celestial sphere, turning about the pole star once a sidereal day, with
//     the Milky Way), the moon at its real phase with maria and earthshine, and the orange glow San Diego county
//     throws on the low sky and the cloud bases
//   const SKY = createSky(THREE)   scene.add(SKY.mesh)   SKY.U.* = the uniforms   SKY.celestial(date, hour, sunPh)
// The uniforms keep the names the old inline shader had (top, horizon, sunDir, ...), so index.html sets them as before.

const SYNODIC = 29.530588853, NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14); // a known new moon, 2000-01-06 18:14 UTC
const LAT = 32.96 * Math.PI / 180; // Poway: the pole star sits 33 degrees up in the north

export function createSky(THREE) {
  const U = {
    top: { value: new THREE.Color(0x4a8fd8) }, horizon: { value: new THREE.Color(0xbfd8ee) }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunCol: { value: new THREE.Color(0xfff0c0) }, cloud: { value: 0.1 }, time: { value: 0 }, night: { value: 0 }, flash: { value: 0 }, dusk: { value: 0 },
    moonDir: { value: new THREE.Vector3(0, -1, 0) }, moonLit: { value: 1 }, starAng: { value: 0 }, glow: { value: 1 }, rain: { value: 0 }, fog: { value: 0 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p; gl_Position.z=p.w*0.9999; }`,
    fragmentShader: FRAG,
  }));
  mesh.renderOrder = -10; mesh.frustumCulled = false;

  // moon and stars for a calendar date ('YYYY-MM-DD', Poway time) and hour. sunPh is the sun's angle along its path
  // as index.html computes it ((hour - 6) / 12 * PI). The moon runs the same path, behind the sun by its phase:
  // new moon with the sun, first quarter highest at sunset, full moon rising as the sun sets.
  const _md = new THREE.Vector3();
  function celestial(date, hour, sunPh) {
    const ms = date ? Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + (hour + 7.5) * 3600e3 : Date.now();
    const age = ((ms - NEW_MOON_2000) / 86400e3) / SYNODIC, phase = age - Math.floor(age); // 0 new, 0.5 full
    const ph = sunPh - phase * Math.PI * 2;
    _md.set(Math.cos(ph), Math.sin(ph) * 0.94 + 0.05, Math.sin(ph) * 0.34 - 0.08).normalize();
    U.moonDir.value.copy(_md);
    const lit = (1 - Math.cos(phase * Math.PI * 2)) / 2; U.moonLit.value = lit;
    const doy = date ? (Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(+date.slice(0, 4), 0, 1)) / 86400e3 : 0;
    U.starAng.value = ((hour + doy * 24 / 365.2422) / 23.9345 * Math.PI * 2) % (Math.PI * 2);
    return { dir: _md, phase, lit };
  }
  return { mesh, U, celestial };
}

const FRAG = /* glsl */`
uniform vec3 top, horizon, sunDir, sunCol, moonDir; uniform float cloud, time, night, flash, dusk, moonLit, starAng, glow, rain, fog;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return v; }
float fbm3(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return v; }
float hg(float c, float g){ float g2 = g * g; return (1. - g2) / pow(1. + g2 - 2. * g * c, 1.5) * .0796; } // Henyey-Greenstein
vec3 rotAxis(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1. - c); }

// cumulus density on the cloud plane: domain-warped fbm, thresholded by the weather's cover
float cumulus(vec2 uv, float th){
  vec2 w = vec2(fbm3(uv * .55 + vec2(3.1, 7.7)), fbm3(uv * .55 + vec2(8.3, 1.9))) - .5;
  float n = fbm(uv + w * 1.1);
  return smoothstep(th, th + .22 + cloud * .25, n);
}

void main(){
  vec3 d = normalize(vDir); float h = max(d.y, 0.), sy = sunDir.y;
  float cs = dot(d, sunDir), sd = max(cs, 0.);
  vec2 sh = normalize(sunDir.xz + 1e-5), dh = normalize(d.xz + 1e-5); float az = dot(sh, dh) * .5 + .5; // 1 toward the sun

  // ---- base gradient, with a thicker warm horizon the lower the sun
  vec3 col = mix(horizon, top, pow(h, .45 + dusk * .25));
  // sunset palette, banded by height above the horizon and spread round toward the sun
  float g = clamp(sy * 4. + .25, 0., 1.);
  vec3 gold = vec3(1., .72, .32), ora = vec3(1., .42, .12), red = vec3(.85, .16, .08), mag = vec3(.55, .18, .42);
  vec3 band = mix(mix(red, ora, smoothstep(0., .06, h)), mix(gold, mag * .6 + top * .4, smoothstep(.12, .45, h)), smoothstep(.04, .2, h));
  band = mix(band, mix(red, mag, .5), (1. - g) * .45 * smoothstep(0., .3, h));
  float spread = pow(az, 1.6 + 2. * g) * exp(-h * (3.2 - dusk * 1.4));
  col = mix(col, band * 1.25, clamp(dusk * spread * 1.35, 0., 1.) * (1. - cloud * .6));
  // anti-solar side: belt of Venus over the Earth's shadow
  float anti = pow(1. - az, 2.);
  col = mix(col, vec3(.86, .55, .62), dusk * anti * smoothstep(.02, .1, h) * (1. - smoothstep(.1, .32, h)) * .55 * (1. - cloud * .7));
  col = mix(col, vec3(.24, .3, .46), dusk * anti * (1. - smoothstep(0., .06, h)) * .6 * (1. - cloud * .7));

  // ---- night: the moonlit sky is a deep blue, brighter round the moon; the town's light glows on the low sky
  float md = dot(d, moonDir), mUp = smoothstep(-.05, .1, moonDir.y);
  col += vec3(.035, .05, .09) * pow(max(md, 0.), 3.) * moonLit * mUp * night * (1. - cloud * .5);
  vec3 sodium = vec3(1., .6, .36);
  float sw = .55 + .45 * max(dot(dh, normalize(vec2(-.6, .8))), 0.); // brightest toward San Diego (south-west)
  col += sodium * glow * night * exp(-h * 9.) * .07 * sw * (1. + cloud * 1.5);

  if (d.y < 0.) col = mix(horizon * .85, col, exp(d.y * 14.));

  // ---- sun: Mie halo, aureole and a disc that grows and reddens toward the horizon
  float mie = hg(cs, .76 + dusk * .12) * (.35 + dusk * 1.6);
  vec3 sc = mix(sunCol, vec3(1., .38, .12), dusk * .8);
  col += sc * mie * (1. - cloud * .8) * (1. - night * .9);
  float disc = smoothstep(.9994 - dusk * .0006, .99975 - dusk * .0003, cs);
  col += sc * disc * (7. + dusk * 3.) * (1. - cloud * .9) * (1. - smoothstep(-.02, -.06, sy));
  // crepuscular rays at golden hour
  vec3 t1 = normalize(cross(sunDir, vec3(0., 1., 0.)) + 1e-5), t2 = cross(t1, sunDir); float ang = atan(dot(d, t2), dot(d, t1));
  float rays = noise(vec2(ang * 18., time * .05)) * .6 + noise(vec2(ang * 41., time * .08)) * .4;
  col += sc * smoothstep(.45, .85, rays) * pow(sd, 6.) * dusk * .3 * (1. - cloud * .5) * smoothstep(-.02, .15, d.y);

  if (d.y > -.02) {
    float hor = smoothstep(-.02, .12, d.y); // everything up there fades into the haze at the horizon
    // ---- stars: fixed on the celestial sphere, turning about the pole (33 degrees up in the north, -z)
    vec3 pole = normalize(vec3(0., sin(${LAT.toFixed(4)}), -cos(${LAT.toFixed(4)})));
    vec3 sdir = rotAxis(d, pole, -starAng);
    vec3 stars = vec3(0.);
    if (sy < -.06) for (int L = 0; L < 2; L++) {
      float sc2 = L == 0 ? 70. : 150.;
      vec3 p = sdir * sc2, c = floor(p), r = hash33(c);
      float pick = L == 0 ? .955 : .975;
      if (r.x > pick) {
        vec3 sp = normalize(c + .5 + (hash33(c + 7.1) - .5) * .7);
        float a = length(sdir - sp) * 950.;                                // ~pixels from the star's centre
        float mag = pow((r.x - pick) / (1. - pick), 2.2) * (L == 0 ? 1.6 : .7) + .05;
        float tw = .7 + .3 * sin(time * (2. + r.y * 4.) + r.z * 60.) * (1. - h * .6); // twinkles more near the horizon
        vec3 tint = mix(vec3(.72, .82, 1.), vec3(1., .84, .62), r.y);           // blue-white to orange
        stars += tint * mag * tw * exp(-a * a * .9);
      }
    }
    // the Milky Way: a soft, dusty band across the sky
    vec3 gal = normalize(vec3(.35, .25, .9));
    float gb = dot(sdir, gal), band2 = exp(-gb * gb * 22.);
    vec3 ge1 = normalize(cross(gal, vec3(0., 1., 0.))), ge2 = cross(gal, ge1);      // coordinates in the galaxy's plane: no seam
    vec2 guv = vec2(dot(sdir, ge1), dot(sdir, ge2)) * 5. + gb * 3.;
    float dust = fbm(guv * 1.7), lanes = smoothstep(.5, .72, fbm(guv * 3.1 + 4.));
    stars += vec3(.55, .58, .72) * band2 * (.4 + dust * .8) * (1. - lanes * .4) * .04;
    float skyDark = night * (1. - .75 * moonLit * mUp) * (1. - glow * .25); // moonlight and the town wash the faint ones out
    float dark = smoothstep(-.08, -.3, sy);                                     // they come out as twilight ends
    col += stars * dark * hor * (.35 + .65 * skyDark) * (1. - cloud) * (1. - fog);

    // ---- the moon: a sphere lit from the sun's direction, so its phase is right; maria and earthshine
    float mR = .0105;                                               // drawn about twice its real size, as the eye sees it
    vec3 mu = normalize(cross(moonDir, vec3(0., 1., 0.)) + 1e-5), mv = cross(mu, moonDir);
    vec2 muv = vec2(dot(d, mu), dot(d, mv)) / mR; float r2 = dot(muv, muv);
    float mvis = mUp * smoothstep(-.01, .04, d.y) * (1. - cloud * .9) * (1. - fog * .8);
    if (r2 < 1.) {
      vec3 n = vec3(muv, sqrt(1. - r2));
      vec3 Lm = normalize(vec3(dot(sunDir, mu), dot(sunDir, mv), -dot(sunDir, moonDir)));
      float lit = smoothstep(-.06, .12, dot(n, Lm));
      float maria = smoothstep(.42, .62, fbm(muv * 1.7 + 3.3)), crat = noise(muv * 9.) * .12;
      float alb = .95 - maria * .32 - crat;
      float limb = .65 + .35 * n.z;
      vec3 mc = vec3(1., .97, .9) * alb * limb * (lit * 1.8 + .035);      // .035: earthshine on the dark part
      float edge = smoothstep(1., .9, r2);
      col = mix(col, mc * mix(.5, 1.15, night) + col * (1. - night) * .6, edge * mvis); // by day the blue sky shows through
    }
    col += vec3(.75, .8, .95) * (pow(max(md, 0.), 900.) * .5 + pow(max(md, 0.), 60.) * .05) * moonLit * mvis * night; // halo

    // ---- clouds. The light is the sun by day and the moon by night.
    vec3 Ld = sy > -.05 ? sunDir : moonDir;
    float lightK = moonLit * mUp;
    vec3 lightCol = mix(vec3(1.), mix(vec3(1., .62, .3), vec3(1., .36, .28), 1. - g), dusk);
    vec2 drift = vec2(time * .012, time * .005);
    vec2 uv = d.xz / (d.y + .1) * 1.1 + drift;
    float th = mix(.78, .18, cloud);                                  // the weather's cover
    float dens = cumulus(uv, th);
    float cov = dens * smoothstep(0., .1, d.y);
    // march toward the light across the cloud plane: how much cloud sits between this point and the light
    vec2 ldir = normalize(Ld.xz + 1e-4) * .07; float occ = 0.;
    for (int i = 1; i <= 3; i++) occ += smoothstep(th, th + .3, fbm3(uv + ldir * float(i)));
    float shadow = exp(-occ * .8), powder = 1. - exp(-dens * 3.);
    // day: sky-blue ambient, sunlit tops, dark cores, silver edges toward the sun
    vec3 cd = mix(horizon, top, .4) * (.85 + .15 * (1. - dens)) * (1. - .3 * dens);
    cd += lightCol * shadow * powder * (.85 + .3 * h);
    cd += lightCol * hg(dot(d, Ld), .6) * (1. - dens) * 2.2;
    cd = mix(cd, band * 1.4, dusk * spread * .6 * (1. - dens * .5));  // undersides catch the sunset band
    // night: grey shapes, a moonlit rim, the town's orange glow on their bellies
    vec3 cn = horizon * (.75 - .25 * dens);
    cn += vec3(.62, .7, .9) * lightK * (shadow * powder * .35 + hg(dot(d, Ld), .6) * (1. - dens) * 1.5);
    cn += sodium * glow * (.022 + .045 * dens) * (1. + cloud * .6) * exp(-h * 2.5);
    vec3 cc = mix(cd, cn, night) * (1. - .55 * rain) + flash;
    col = mix(col, cc, cov * hor);
    // high cirrus streaks
    vec2 cu = d.xz / (d.y + .06) * .55 + vec2(time * .004, 0.) + 9.;
    float cirr = smoothstep(.58, .9, fbm(vec2(cu.x * .5, cu.y * 1.8))) * smoothstep(0., .2, d.y) * (.55 - cloud * .3);
    vec3 cic = mix(vec3(1.), mix(ora, mag, .4) * 1.3, dusk) * mix(1., .08, night);
    col = mix(col, cic, cirr * (1. - cov) * hor);
  }
  col += flash * .6;
  col += (hash(vDir.xy * 413. + time) - .5) / 255.; // dither: no banding in the gradients
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
