# Style: how Poway Automobile Online looks

This is the art direction. Keep to it: don't revert a look that's written down here without changing this file first.
The version history is in `CHANGELOG.md`.

## The feel

A crime drama shot in a desert town at golden hour, crossed with a car game: **worn down, but it feels like home.**
Real Poway, at real scale, in sun-baked colour. Nothing toy-like, nothing plastic, nothing perfectly clean.

## Colour

- **The grade** (`src/post.js`, the realistic look's composite, `uGrade`):
  - highlights pushed amber (×1.07, 1.0, 0.86) by hue: warm things go amber, blue things (the sky) go a touch teal, so
    the sky never turns mauve
  - shadows lifted to a warm brown with a hint of teal
  - greens pulled toward olive and dust
  - a filmic S-curve (0.22) and 6% bleach
  - grain at 0.034
  - a burnt-edged vignette (60% of the way to 0.66, 0.58, 0.50 in the corners)
- **Shade:** the sky light in shade is half-saturated (`ENV.sat` 0.5 in `src/skyenv.js`) and the hemisphere fill is the
  horizon colour 55% of the way to warm white, so shadows are soft blue-grey at noon, never saturated blue or violet.
- **Light shafts:** from the sun's bright pixels, 28 steps, warm (1, 0.82, 0.58). They fade off screen, at sunset,
  under cloud and at night.
- **Dust** (`src/fx/dust.js`): forward-scattered motes. Most visible looking into the sun, thicker over dirt than
  lawns, none in rain or at night.
- **World palette:** stucco creams and tans, terracotta and concrete tile, grey sidewalks, mid-grey sun-bleached
  asphalt, golden wild oats, olive chaparral, tan decomposed granite, warm granite boulders. Wild ground is never
  blue-grey (`src/nature/ground.js` warms it). Jacarandas are in leaf, not purple, except in late spring.

## UI (`src/ui/western.css`)

- **Palette:**
  - leather and wood: `#150c09`, `#22140e`, `#3b2417`, `#5b3822`
  - paper: `#f3e6cc`
  - dust: `#bfa685`, `#c9a77a`
  - sun gold: `#f2a33a`, `#ffc64d`
  - rust: `#c4552c`; blood: `#c7362c`; cash green: `#9bd16e`
- **Type:**
  - **Rye** (woodtype) for headings, buttons and big titles
  - **Barlow Condensed** for everything you read
  - **Anton** for numbers that must read at a glance (money)
  - **Yellowtail** for the script on the plate
- **Panels:** saddle leather (radial gradient plus SVG grain), a stitched inner border, brass rivets in the corners.
- **Buttons:** weathered wood signs with a brass nail; they swing a little on hover and press down. The primary
  button is polished brass with a passing shine.
- **Tabs and segments:** tooled leather; the selected one is brass.
- **Toggles:** brass switches. **Sliders:** rope.
- **HUD notes:** torn paper slips with a coloured edge.
- **Cursors:** a brass arrow, and a spur rowel over anything you can click (SVG data URIs).
- **The logos stay:** the licence plate (Poway / AUTOMOBILE / ONLINE · 92064 / PW sticker), `assets/brand/logo.png`
  and `assets/brand/favicon.png`.
- **Motion:**
  - panels rise and warm in from sepia
  - the loading screen's sun rays turn and its road dashes run
  - dust drifts
  - everything honours `prefers-reduced-motion`
- **Loading screen:** a sunset drive into Poway.
  - In the scene: a striped sun (like the logo's), Poway ridgelines with granite boulders, utility poles and wires,
    palms and a eucalyptus, a fence line.
  - The progress bar is a road with a car kicking up dust.
  - The version is a red rubber stamp on the plate.

## World rules

- Real scale: people 1.75 m, cars their real size, roads their real width (`src/world/roadwidth.js`). Camera 56°.
- Every placed thing has a reason:
  - signs face the traffic they're for
  - red curbs before stops, at hydrants and at signals
  - yellow loading zones by shops; white passenger zones at schools
  - street sweeping signs on curbed residential streets
  - no furniture, lamps or plants in the road or in parking lots
- People walk only where there's a sidewalk or trail. The crowd wears everyday clothes; uniforms only where they work.
- Surfaces are scanned PBR (assets/pbr, CC0) with wear: grime at the foot of walls, streaks under sills, patched
  asphalt, stained slabs.
