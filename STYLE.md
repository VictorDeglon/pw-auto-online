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

## Water (`src/world/water.js`)

- **Pools:** clear as glass: a white plaster shell, a 15 cm band of blue mosaic tile at the waterline, a shallow end
  with steps sloping to the deep end; the water itself is a Fresnel mirror over the shell, which turns turquoise with
  depth and carries the sun's caustics. Some are lit at night. Cast coping, a light concrete deck, the ground and grass
  cut out round each pool (`setPoolHoles`, `src/nature/ground.js`).
- **Lakes:** dark, cold and choppy, never bright blue; whitecaps when it blows; a band of wet decomposed granite and
  mud at the shore, not lawn to the waterline.
- **The sea:** swell lines up with the shore (it reads the distance to land), builds, breaks and runs up the sand as
  whitewater; Pacific blue-black offshore, green over the sand. Beaches get lifeguard towers, umbrellas, towels, boards.
- **Fountains:** tiered cast stone, water sheeting off each bowl, a jet, spray, on a round paved court.

## Streets, edges and nature

- Streets end the way Poway's do: cul-de-sacs among houses, barricades with END markers elsewhere (`src/world/roadends.js`).
- House fronts have depth: stoops, beds with mow curbs, sills, trim, lanterns, mailboxes, curb cuts, side gates.
- Main roads with houses backing onto them get tan split-face block walls with pilasters; country roads get white
  ranch fences; estates get stone pillars and open iron gates.
- Trails are decomposed granite (`SURF.path`): compacted down the middle, loose at ragged edges, stones along them.
- Ground never shows bare and flat: lawns are dense, wild ground is grass, bushes in clumped stands, pebbles and stones;
  lawn and garden edges fray and lawns have worn patches.
- Trees: coast live oaks at their real size (wider than tall); leaves bright where the sun reaches, dark deep in the
  crown; real meshes out to ~85 m on High.
- Fences and walls are physical: cars smash through wood fences easily and block walls only fast, and pay for it.
- The sky moves: clouds billow and drift, fair-weather cumulus come and go, and their shadows cross the ground.
- Dusk is violet overhead and orange at the horizon (`C.duskTop`, `C.duskHor` in index.html), with pink-lit clouds.

## Zones (`src/world/zones.js`)

The county by money and character: rich (La Jolla, Del Mar, Rancho Santa Fe, Coronado, Fairbanks Ranch), comfortable
(north Poway's Green Valley and High Valley, Rancho Bernardo, Scripps Ranch, Carmel Valley, Point Loma), downtown,
beach towns, working neighbourhoods (Barrio Logan, City Heights, National City, El Cajon, Escondido, Chula Vista), and
the back country. A zone sets the car mix, cash and loot, and the police presence (more patrols in rich areas and
downtown).

## Sound

- The main theme (*Descent into Luxury*) owns the menus: main menu after the loading screen, and the pause screen.
- On foot the game's exploring songs take turns with silence, so the place can be heard: birds and a hawk by day,
  crickets and coyotes at night, wind gusts outdoors. In a car it's the radio; a supercar comes on to *Out of Pocket*.
- Thunder follows lightning by the speed of sound. Rain and wind are muffled indoors and in cars.
