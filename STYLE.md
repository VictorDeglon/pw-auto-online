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
  blue-grey (`src/nature/ground.js` warms it). Jacarandas are in leaf, not purple, except in late spring. Trees and
  shrubs are real models where a good one exists: Poly Haven scans (olive, scrub oak, jacaranda, chaparral, garden
  shrubs) and Sketchfab's PlantCatalog and others (Mexican and California fan palms, Canary Island date palms, slender
  date palms for the queen palms, an oak, Italian cypress, bottlebrush, lemon and orange, spineless yucca, prickly
  pear; `assets/nature/CREDITS.md`), grown in code where not (gums, peppers). Palms stand at their species' height.

## UI (`src/ui/sunset.css`)

Golden hour over Poway, seen through smoked glass. The sunset art carries the drama; the interface is quiet, dark glass
over it, and the western comes through in the type and a few motifs, not in leather and wood textures.

- **Palette** (from the loading art's dusk):
  - night `#1a1220` (plum-black glass), dusk `#3a2338` (raised surfaces)
  - ember `#ff7a2e` (the sun's glare: the one accent), flare `#ffc46b` (highlights, what's selected)
  - bone `#f5e9d3` (text and the logo's cream), dust `#b9a48c` (secondary text)
  - meaning only: cash green `#9bd16e`, blood `#e5483b`, siren blue `#5b8cff`
- **Type:**
  - **Mr Dafoe** (brush script) for the wordmark only: "Poway" over "AUTOMOBILE ONLINE"
  - **Barlow**, uppercase and widely tracked (about .3em), for the small captions the loading screen and the corners use;
    never as a label over every heading
  - **Barlow Condensed** for everything you read: headings in sentence case, buttons, lists, the HUD
  - **Anton** for numbers that must read at a glance (money, speed)
  - **Ultra** (slab poster) for WASTED and BUSTED only: the wanted-poster moment
- **The horizon:** one ornament, a hairline running transparent to ember to flare to transparent, like the sun on the
  sea. It tops each panel, marks the selected menu row and tab, and is the loading bar. Nothing else decorates.
- **Panels:** smoked glass (night at about 72%, backdrop blur 16px), a bone hairline at 12%, 14 px corners, the horizon
  along the top. **Buttons:** menu entries are rows of type, not boxes; the primary action is a sunlit pill (flare to
  ember) with dark text; secondary actions are hairline pills. **Tabs and segments:** quiet text, the selected one
  underlined by the horizon. **Toggles and sliders:** thin, ember when on.
- **HUD:** smoked-glass slips with an ember edge for notes; a thin bone ring round the minimap; money in Anton with a
  soft shadow, no outline; the street name in Barlow Condensed, the area in tracked caps.
- **Cursors:** a slim bone arrow, and a small ember spur rowel over anything you can click.
- **The wordmark:** the brush-script "Poway" over tracked "AUTOMOBILE ONLINE" replaces the licence plate on the loading
  screen, the menu and the pause card. `assets/brand/logo.png` and `assets/brand/favicon.png` stay for the tab and
  link previews.
- **Loading screen:** the sunset drive (`assets/ui/sunset-drive.webp`): a muscle car on the coast road at sundown,
  palms, the pier and the mountains. The wordmark top left, "SUN. DUST. OPPORTUNITY." top right, the tip, the status and
  the horizon-line progress bar bottom left, "POWAY, CA" and the version bottom right. The art drifts in slowly (a
  Ken Burns push); the menu reuses it, darkened on the left.
- **Motion:** one slow push on the loading art, panels fading up when they open, the bar's glowing head. Everything
  honours `prefers-reduced-motion`.

## World rules

- Real scale: people 1.75 m, cars their real size, roads their real width (`src/world/roadwidth.js`). Camera 56°.
- Every placed thing has a reason:
  - signs face the traffic they're for
  - red curbs before stops, at hydrants and at signals
  - yellow loading zones by shops; white passenger zones at schools
  - street sweeping signs on curbed residential streets
  - no furniture, lamps or plants in the road, nor loose in parking lots: a lot's own lights stand on concrete bases
    at its row ends and down long rows, its trees in curbed islands
- People walk only where there's a sidewalk or trail. The crowd wears everyday clothes; uniforms only where they work.
- Surfaces are scanned PBR (assets/pbr, CC0) with wear: grime at the foot of walls, streaks under sills, patched
  asphalt, stained slabs.

## Detail by preset (`src/gfx.js`)

- Every preset looks the same up close. What changes with the preset is how far detail reaches (`lod`: car detail
  steps, street furniture, cars at all), grass and ground-detail density, the view distance, shadow and texture sizes
  (impostor atlases 1024/1536/2048 px on Potato/Low/Medium, full size above; the street-sign sheet 2048 px on Medium
  and below), and how many people and cars are about.
- With nothing picked in Settings the preset follows the computer: one that can't keep up even at the lowest render
  scale steps down a preset (with a note saying so), and one with plenty of headroom gets a step back up next time.
- Nothing is drawn that can't be seen: the town behind the main menu's painting, street furniture past its distance,
  empty instanced meshes, a shop's room until you're at its door (7 m).

## Buildings (`src/world/bldgen.js`, `src/world/roofs.js`, the facade shader in `src/world/surfaces.js`)

- Every building is generated from its footprint: its shape (area, the smallest rectangle round it and how much of it
  the footprint fills, how square its corners are, how many wings), the map's kind, height and roof colour, what's round
  it (how built-up, a parking lot, school grounds, a park, a mapped shop, restaurant, bank or fire station at its door),
  the street it faces and the zone decide what it is and how it's built, in Poway and out in the county alike. Its looks
  come from a hash of where it stands, never a random pick, so every player sees the same town.
- **The local look:** each Poway neighbourhood and each county zone has its own mix. Tract stucco (concrete tile hips)
  in Starridge, Twin Peaks and Espola; ranch houses in Old Poway and Silverset; Spanish revival (low clay hips and cross
  gables, white and cream stucco) and ranch on Green Valley's and Valle Verde's big lots; Spanish and modern in the rich
  coastal places; steep shingle cottages and modern boxes in the beach towns; small stucco bungalows in the working
  neighbourhoods. Out of town, big lots lean Spanish and ranch. The big 1980s estate houses on Poway's acre lots (big
  tract and ranch footprints, more where it's sparse): cross gables in flat concrete tile, light stucco, white trim,
  often a two-storey wing, chimneys, a covered patio out back.
- **Houses:** hip roofs mostly, low ranch gables, cross gables over L and T plans; clay barrel tile low-pitched with
  short eaves, concrete tile and shingle with deeper ones; a few flat-roofed modern houses with a thin roof slab over
  deep eaves (more of them in La Jolla, the beach towns and downtown). Where the aerial photo shows the roof, its
  material and colour win. A single-storey house whose height was guessed low is still a house (windows, a door, a
  yard), not a shed. Some have a stucco chimney chase about a metre wide up a side or back wall, capped, with a spark
  arrestor, rising 0.7 m past the roof within 3 m of it (and no further). A gable end has rake boards and a soffit up
  its slopes, never a fascia across it. A tile roof with no photo over it takes its palette colour as it should look,
  not darkened by the scan.
- **Depth on houses:** windows and doors sit in the wall, with reveals; some have an entry alcove. The front gets a
  picture window or two, the back a slider and wide windows, the sides small bath windows and blank stretches. A
  two-storey wing over a single-storey house has its own roof, the same kind as the rest (gables with gables, hips with
  hips), and many estates a deck with a rail across its gable end. Solar arrays sit on the sunniest big slope (south,
  then west, never north; where the aerial photo shows the roof, it decides), skylights on another. Covered patios on
  posts over the back slider; a weep screed at the foot of stucco; vents in the gable ends.
- **Garages and sheds:** a detached garage shows sectional doors to the street (one car, two, or a row of them); a shed
  gets a shed roof.
- **Townhouses:** long two- and three-storey rows, a front door per unit on the street side and a garage each behind.
- **Apartments:** garden apartments are two or three storeys under pitched concrete tile; the big and tall ones are flat
  behind a parapet with a cornice and floor bands.
- **Shops:** flat behind a parapet. Strip malls (long and shallow) carry a clay tile mansard on the street side, or a
  painted metal canopy, or canvas awnings over the storefront bays, and some a raised parapet over the middle. Small pads
  get a tile mansard all round, or a low clay hip roof.
- **Storefronts:** every store the map puts in a shopping centre has its own bay on its real building, on the wall
  nearest where the map puts it (never a party wall), sized by its trade (`src/world/shops.js`): aluminium or bronze
  mullions, a kickplate, a transom, a single or double door with push bars and the hours on the glass, the sign
  (channel letters, or a lit cabinet with gooseneck lamps; a chain's parody mark), an awning in the sign's colour or a
  lit soffit, and through the glass the trade's own room. The trade dresses the front: a patio with a rail and
  umbrellas, bistro tables and a bike rack, a menu A-frame, a barber pole, an ATM, an ice chest, carts, produce bins,
  window neon. The rest of a centre's fronts take made-up local tenants and the odd vacancy, never a real business's
  name. No hand-built shop box stands over the map's own buildings. A strip centre's walk ends in a red fire-lane curb.
  A storefront opens only where the ground before it is level with its walk (never onto a bank of earth): a store the
  map puts by a banked wall moves to the building's level side. Signs are set in real typefaces by trade (scripts for
  salons and nail bars, serifs for banks and offices, rounded and slab faces for food, heavy sans for stores and gyms;
  `FACES` in src/world/shops.js), never the browser's plain Arial.
- **Shop interiors** (`src/world/interiors.js`): walk up to a storefront and its room is built behind the glass, the glass
  turns clear, and you walk in through the door. A ceiling of tiles and light panels, a stockroom wall at the back with
  its door and EXIT light, racks of boxes behind it. The trade furnishes the room to its full depth: a pizza or burger
  place's booths and tables up to the counter and menu boards with the kitchen behind; a café's bar, espresso machine
  and pastry case; a barber's chairs at mirrors down both walls and the waiting row by the window; a nail salon's
  pedicure thrones down one wall and manicure tables with lamps and polish, the polish wall at the back; a bank's
  teller line, queue rope, bankers' glass offices, check desk, armchairs and ATM; a market's gondolas, coolers and
  checkouts; a liquor store's coolers, wine aisles and the till with the lottery sign; a gym's treadmills, benches and
  cable machines; a yoga or dance studio's mats, mirror wall and barre; a martial-arts school's puzzle mats, heavy bags
  and belt rack; an office's reception, waiting chairs and desks. Trees in front don't grow through the walls while
  you're inside. The floor is level with the walk (a step up at the door at most); where the building is cut into a
  slope the room ends at the hill, and a room too shallow to walk into keeps its painted view.
- **Big boxes and warehouses:** a big box's doors face its parking lot (the long wall with the most lot in front of it,
  the nearest counting most), wherever the street is; never a wall another building stands against; with no lot mapped,
  the long wall facing the most open ground. A supercenter: stucco, tilt-up or concrete panels over a split-face block
  base, pilasters, an accent band, a raised tower with a vestibule and canopy over each entrance (two on a long front:
  grocery and home), bollards. A warehouse club: corrugated metal over a tall split-face base, two accent bands, one
  entrance. A supermarket (Sprouts, Ralphs, Vons, Trader Joe's...) is a grocery anchor: one entrance, a big box's front.
  The store's mapped name decides which (Costco, Sam's Club: a club; Walmart, Target: a supercenter), else a guess; a
  mapped store is a big box even with no lot mapped, and it wins the footprint's name over the shops inside it. A known
  chain wears its own colours (band, tower, bollards) and its parody sign on the tower (`src/world/plazas/brands.js`:
  Tarjet, Walmark, Costko...). Big stores the map has only as an unlabelled footprint are named in
  `MAPLESS_STORES` (src/world/bldgen.js), never drawn as a separate box over the map's buildings. Rooftop units;
  roll-up doors and dock seals behind. A warehouse is plain.
- **Offices and civic buildings:** offices have ribbon windows, floor bands, a cornice and rooftop units. Civic buildings
  are low clay hips over deep eaves, or a school's flat roof over deep eaves along the walks; a hall has a steep gable.
- **Cladding** (`src/world/wallarr.js`): walls are clad by the local look and the type, from one texture array of real
  materials: smooth, sand-finish, lace and aged stucco, smooth plaster, lap siding, board-and-batten, shiplap, red, tan
  and painted brick, painted and split-face block, tilt-up and smooth concrete, corrugated metal. Tracts are stucco;
  Spanish houses lace stucco or plaster; ranch houses board-and-batten, lap siding, stucco or painted brick; beach
  cottages siding; strip malls rough stucco, painted block or brick; big boxes and warehouses tilt-up, panels, block or
  metal. Some street fronts carry a knee-high wainscot of ledgestone, river rock or tan brick, capped, the cap broken at
  the doors. Trim is
  painted wood. Natural materials (brick, stone, block, wood) keep their own colour with only a hint of the paint.
- **Fittings** (`facadeKit` in `src/world/bldgen.js`, fitted round the openings the facade shader paints, laid out by the
  same rules): window surrounds by look (foam on tracts, deep stucco on Spanish houses, painted wood on ranch houses,
  cottages and bungalows, a thin dark metal frame on modern ones); louvred shutters on many ranch houses and cottages;
  wrought-iron rejas on Spanish front windows; door casings; jambs beside garage doors; storefronts framed in black or
  bronze aluminium with a transom; gutters and downspouts in white, beige or brown under pitched eaves; front porches
  (a shed roof in the house's own roofing on painted posts) on ranch houses, cottages and bungalows, never in front of
  the garage; balconies with iron or white rails on garden apartments. The small pieces are instanced near the camera;
  porches and balcony slabs are part of the town's meshes.
- Canvas is sun-faded and deep (forest, oxblood, navy, sand, rust, charcoal, plum, khaki); canopies are painted metal
  (bronze, charcoal, white, brown). Awnings and canopies are only drawn near (with the sidewalks).

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
- Hillside lots are graded, never a house on stilts down the slope: the house and its side and back yards sit on a
  level terrace at the height where the driveway meets the garage (the front yard keeps its grade); a steep back yard
  steps down (or up) in up to three terraces, no wall between them over 2.4 m, every one reached by stairs, every side
  yard by a gate (with steps where the ground beyond is higher or lower). A pool sits whole on one terrace. Walls along
  the lot lines, stepped down the slope, hold up to 3 m of ground (more only to keep a pool level), with the fence over
  the higher side by neighbourhood: stuccoed block, block with pilasters, stone pillars with cast caps, wood boards,
  white vinyl, a split rail in the country; open wrought iron on the side with the view. Some lots round a corner in a
  curved wall. Shrubs line the walls inside, a tree stands in a back corner. Side-yard walls stop half way to the
  neighbour's house.
- Main roads with houses backing onto them get tan split-face block walls with pilasters; country roads get white
  ranch fences; estates get stone pillars and open iron gates.
- **Parking lots** (`src/world/parking.js`): paved in asphalt cut along the ground mesh's own triangles and laid on it,
  with 4 m round each lot, so no grass, photo or strip of ground shows through or between lots; the banks beyond are
  planted in ice plant; stalls painted; each double row of stalls ends in a curbed bark island with a tree and a light;
  lights down long rows; a concrete apron straight off the curb where a lot meets its street. The drive aisles the map
  draws through a lot are asphalt like the lot, never a house driveway's concrete.
- Trails are decomposed granite (`SURF.path`): compacted down the middle, loose at ragged edges, stones along them.
- The aerial photo never shows on the ground (`src/nature/ground.js`): it only decides which ground lies where. Each
  ground is painted in its own colour, near and far: tan decomposed granite, golden thatch (olive where it's greener,
  straw in the sun), lawn, leaf litter and bark mulch, warm granite, beach sand. Past the first few metres, dark wild
  ground takes the olive of the chaparral standing on it.
- Ground never shows bare and flat: lawns are dense, wild ground is golden oats and brome, bushes in clumped stands,
  pebbles and stones; lawn and garden edges fray and lawns have worn patches. The grass runs on past the near ring in
  coarser rings of wider tufts (lawn to ~75 m, wild grass to ~300 m on High), so it never ends in a circle round you.
  Grass grows only where plants may: never on roads, tracks, courts, lots or campuses. Lawns are scanned Bermuda grass
  tufts; the wild grass mixes two scanned clumps with scanned dry stalks and brome rising out of it (golden seed heads).
  Gazania (yellow and orange daisies) in beds round some foundation shrubs and among the ice plant on lot and freeway
  banks. Grass and the ground's pebbles, stones and dead
  branches grow denser on stronger presets (Medium and up denser than before 0.12.2); none is drawn behind the camera.
  Near you (~25 m) the bare ground carries scanned stones and dead twigs lying on it, thickest where it's bare.
- Trees: coast live oaks at their real size (wider than tall); leaves bright where the sun reaches, dark deep in the
  crown; real meshes out to ~85 m on High.
- Fences and walls are physical: cars smash through wood fences easily and block walls only fast, and pay for it.
- The sky moves: clouds billow and drift, fair-weather cumulus come and go, and their shadows cross the ground.
- Dusk is violet overhead and orange at the horizon (`C.duskTop`, `C.duskHor` in index.html), with pink-lit clouds.
- Palms are never ruler-straight: fan palms lean and curve back up, at mixed heights, some trimmed to a boot of leaf
  bases, some in their skirts of dead fronds (`src/nature/proctrees.js`).

## Power lines (`src/world/power.js`)

- Transmission lines go where OpenStreetMap has them (`assets/world/power.json`, `tools/world/power.py`); street lines
  only along rural and estate roads, because Poway's tracts are fed underground.
- Every structure is modelled to its hardware: weathered wood with checks and old staples, crossarms with braces and
  through-bolts, pin and post insulators, transformers with cutouts, guys with yellow guards, lattice with X-bracing.
- Wires sag (more on long spans) and are never thinner than a pixel; aluminium reads grey against the sky, not white.

## Boats, marinas and the beach (`src/world/boatmodels.js`, `harbor.js`, `surf.js`)

- Hulls are lofted (deep V aft, fine entry, chines, flare), never boxes. White gelcoat is the norm; navy, red and
  green hulls are the exception. Bottom paint below the waterline.
- Marinas come from the mapped docks; the bigger the slip, the bigger the boat; boats bob out of step with each other.
- Beaches have surf rental shacks by the towers, boards stuck in the sand, boards on car roofs in the beach towns.
- Sand is soft: ruts and footprints, fading over a couple of minutes.

## Sketchfab models (`src/sf.js`, `src/world/sfplace.js`, `assets/sf`)

- Found and fitted by `tools/sketchfab/` (real size, standing on the ground, the front to +z) and credited on the
  menu's Credits screen and in `assets/sf/CREDITS.md`. CC0, CC BY, CC BY-SA and CC BY-NC only, so no ads or paid
  items while BY-NC models are in the game. No game or film rips, no real people, no brand storefronts.
- Cars: every car a street makes for itself, nicer ones where the money is (the old built-in bodies only stand in
  while a model loads, and for kinds with no Sketchfab car, like buses). They keep their own materials except the
  paint (it takes the car's colour, clear-coated), the glass (the game's) and the lamps (lit at night). Further off a
  car keeps its shape and colours for less: past ~70 m no cabin or badges, past ~110 m its paint and everything else as
  one piece in each part's own average colour, past ~170 m a lofted stand-in of its own profile in its paint colour
  (dark glass band, dark tyres), past ~560 m not drawn (all longer on High and Ultra, shorter on Low and Potato).
- Tyres on the ground (every car, other players' too): near-black rubber marks on paving and parking lots only where
  a tyre slides or locks (a hard stop marks all four from the start), fading over 45 s; brown ruts in the dirt, a
  minute; white smoke only in a hard slide; tan dust off the pavement, thicker in a slide, none in the rain.
- The rest fills in what the code doesn't build or grow: street furniture by neighbourhood, people at work by their
  door (uniforms only there), everyday people standing about where it's busy, the club strip's doormen and crowd, a
  place's own vehicle (fire truck, ambulance, school bus), garden plants (citrus, olive, bird of paradise, agave,
  yucca, prickly pear). Never palms, gums, live oaks or cypress (grown in code), and nothing the beach code already
  lays out (umbrellas, towels, boards).

## The club (`src/world/club.js`)

- The Velvet Javelina, a cabaret lounge on open ground by the Carmel Mountain Plaza club strip: dark stucco, the name
  in pink script neon over a canopy, a doorman in a suit and shades at a velvet rope, a paved apron to the street.
- Inside it's lit only by what glows: stage-lip strips, coloured beams through the haze, the bar's back-lit shelf, a
  disco ball. A pleated red curtain behind a black gloss stage, a DJ booth, booths and high-tops.
- The dancers dance in their party outfits. Nobody undresses, whatever the settings.

## Two wheels (`src/twowheel.js`)

- Beach cruisers, step-through scooters and rental kick scooters; the rider is the player's own avatar, posed on the
  saddle with feet on the pedals and hands on the grips (`ride()` in `src/humans.js`), leaning into turns.

## What people wear (`src/wardrobe.js`)

- Hats, glasses, things round the neck and on the back are built in code at real size: matte cloth and felt, metal
  that keeps its colour where there's no sky to mirror, no logos. Colours come from small named palettes, muted except
  safety colours and the lei.
- Each is fitted to the person from their own mesh and moves with them: a hat on the skull (over the hair, not a bun),
  glasses just clear of the brows, chains and leis along the collar, straps over the shoulders and across the chest,
  packs flat on the back.
- Whoever already has something on their head or over their eyes (a hood, a keffiyeh or hijab, a uniform cap or
  helmet, a mask, a visor, their own glasses) keeps it: no hat or glasses goes over it.
- Height and build change a body by a few percent, never into a caricature.
- Everyday things cost cash; the flashy and the job-related come with an achievement or a career level, and uniforms
  with the work they stand for.

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
