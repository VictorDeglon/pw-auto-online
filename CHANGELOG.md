# Changelog

The game's version lives in `src/version.js` and shows on the loading screen and the menu. **Bump it with every
update you ship**, and add an entry here at the same time:

- the **minor** number goes up for each day of updates (`0.7.0` → `0.8.0`), with a name for the update;
- the **patch** number goes up for each deploy within that day (`0.7.0` → `0.7.1`).

`0.0.0` is the first commit. The numbers below were assigned afterwards, one per day of work in the git history.

## 0.12.3 (2026-11-03)

- **Smooth on every computer:** driving fast through town on Medium (the same 750 m run), the median frame went from
  145 ms to 30-60 ms, the slowest 1 % from 2.1 s to 0.2-0.4 s and frames over a quarter of a second from 430 to
  12-66; a car model's first appearance builds its shaders off the frame. What was drawn and never seen is gone: the town's 3,662 hydrants, its lamps, mailboxes, pedestals and sign
  poles were each one mesh for the whole map, drawn whole every frame (the hydrants alone 2.3 million triangles), and
  are now in cells drawn only near you; empty plant, boat, trailer and power-pole meshes no longer cost a draw; the
  town behind the main menu's painting isn't drawn; grass behind the camera isn't drawn; a car whose wheel carried
  see-through lamp glass made the whole scene draw twice.
- **Cars far away cost a fraction:** past ~110 m a car is its paint and one merged piece, past ~170 m a stand-in
  lofted from its own shape in its own colour, past ~560 m not drawn (further on High and Ultra). Two-wheelers and
  people far off are lighter too (people's shadows only near you).
- **Much less memory:** the streets and buildings streamed round you keep only what they need once it's on the
  GPU, a chunk's builders no longer hold on to their buffers, cars' textures let go of their decoded copies once
  uploaded, the tree atlases and the street-sign sheet are smaller on Medium and below, and streamed chunks are
  dropped sooner behind you.
- **Graphics that follow the computer:** a better first guess (phones, integrated graphics, Apple chips), and with
  nothing picked in Settings a computer that can't keep up even at the lowest render scale steps down a preset by
  itself (with a note), while one with lots of headroom gets a step back up next time. A slow computer's frames
  still leave room to stream the world, so the town fills in round you.
- **Fewer freezes while things load:** textures are decoded off the main thread, the ground's texture sheets are
  read in a worker, and a shop's room is only built when you're at its door.
- **Trees no longer vanish up close:** the oak's close-up model was broken (a texture slot pointing at nothing), so
  oaks disappeared as you came up to them and fell over as the old stand-in; it loads again, and a plant whose
  close-up model fails now keeps its far look instead of vanishing.
- **More grass and ground detail:** lawns are scanned Bermuda grass, the wild grass mixes two scanned clumps with
  scanned dry stalks and brome rising out of it (golden seed heads; ambientCG Foliage002 and Foliage003, CC0), and
  grass, pebbles, stones and dead branches grow denser on Medium and up.
- **Gazania** (Poly Haven, CC0), the yellow and orange daisy of SoCal front beds and banks: in beds round some of the
  houses' foundation shrubs, among the ice plant on the banks round the parking lots and shopping centres, and here and
  there along the freeway banks (about 43,000 clumps).
- **Gravel, stones and twigs on the bare ground:** within ~25 m of you the dirt between the grass is scattered with
  scanned stones and dead twigs (rendered once from Poly Haven scans and laid flat), thickest where the ground is bare,
  twigs more under the brush; the ground used to be one flat, blurry texture there.
- **Tyre marks when you stop hard:** braking hard (S or down) never left marks (only the handbrake, a slide or a
  burnout did); it now lays dark marks on all four tyres from the first moment. Drifts mark the parking lots too (they
  counted as unpaved), and a slide on dirt leaves brown ruts that last a minute.
- **Coming back is quicker:** the slowest parts of a load (the terrain fitted under every street, which of the 320,000
  mapped trees pass the cleanup) are kept on your computer after the first visit (`src/bakecache.js`, IndexedDB) and
  taken from there next time; the asset packs were already kept. An update works them out again once.
- **Into the game sooner:** only the streets you can see from where you start are built before you play (the rest
  streams in round you as you go), the loading screen waits at most a second and a half for the first scanned cars,
  and their textures are cut down in a worker instead of on the page.
- **Poway High's frontage:** a chain-link fence at the back of the sidewalk where the campus meets the street (with gaps
  for the campus's walks; solid, you can't walk or drive through it), brush and bigger shrubs behind it, and the curb in
  front lined with parked cars.
- **Light in the air** (Medium and up, `src/volumetrics.js`): a mist lying over the land round you, lit by the sun
  only where it gets through, so beams of light stream between the trunks of an oak grove, under branches, past roofs
  and off ridges, from any angle, glowing gold toward a low sun and pale in the shade. It follows the hour and the
  weather: thickest on a dawn with the marine layer (gone by nine), golden at sunset, faint at a clear noon, heavy in
  fog and rain, dusty on a Santa Ana, beams gone under cloud, a faint glow by moonlight; it drifts inland on the sea
  breeze. Each pixel marches its view ray through the shadow map at a quarter (Medium) or half (High, Ultra)
  resolution and comes back to full along depth edges, so a trunk against a lit shaft stays sharp. `?vol=0` turns it
  off (testing).
- **Grass everywhere:** every patch of natural ground now grows wild oats and brome, not only where the aerial photo
  reads as grass (the chaparral, the dry banks and the bare lots between houses were flat dirt and shrubs), taller (knee
  to thigh high) and denser, near you and in the far rings out to the hills.
- **Trees sway far off too:** distant trees moved not at all and snapped into motion as they turned into real models;
  they now sway like the near ones, and gusts roll across trees and shrubs as waves, as they already did on the grass.
- `tools/audit/ground-audit.js` (testing): walks the town chunk by chunk and lists where the terrain pokes through
  paving, where two paved surfaces fight, walls and fences without collision, and plants on roads or in buildings.
- `?brick=4` (testing): runs the game as if on a computer four times slower, on the Potato preset.

## 0.12.2 (2026-11-03)

- **Everyone moves with Mixamo animations:** 99 clips from Mixamo, re-aimed onto the game's skeleton, for every
  person, deputy, outlaw and player: new walks (women walk their own way, outlaws swagger), runs and a sprint matched
  to the ground so feet don't slide, crouch-walking, strafing and backing off while aiming, pistol and rifle stances,
  jumps, falls and landings, real punches, hooks, uppercuts and kicks, flinches when hit, deaths, knockdowns and
  getting back up, and a bigger crowd of idles (bored, looking around, happy). The fingers move too.
- **A real dodge roll and slide:** X dives into a forward roll and C from a sprint slides feet first, instead of the
  body spinning like a coin.
- **Emotes, dances and the club crowd's moves load:** the second set of animations was never fetched, so anyone
  asked to cheer, dance or laugh stood still; it now loads once the town is up.
- **The cowboy's hands:** outlaws (the rigged Sketchfab characters) no longer hold their hands flat out sideways; every
  bone is lined up with the skeleton the clips were made for, roll included.
- **Emote wheel (U):** wave, cheer, clap, laugh, point, thumbs up, salute, shrug, taunt, dance (one of eleven each
  time), sit and warm your hands by a fire. You turn to face the nearest player.
- **Other players see it all:** emotes, stances, rolls, jumps, punches, falls and deaths go out with your position,
  so everyone in the room sees what your character does.
- **Every car is for sale:** the dealers sell all 319 Sketchfab cars, with made-up showroom names, prices from their
  class and top speed, kinds to filter by, sorting and a search box, alongside the lot's classics in three trims. A
  car you buy always arrives as its own model.
- **The old cars are back:** about a third of the street's cars are the game's own stock bodies again.
- **Twelve cars that drove backwards** now face the right way.

## 0.12.1 (2026-11-03)

- **More real trees and plants:** Canary Island date palms, slender date palms for the queen palms, a broad oak and
  Italian cypress, lemon and orange trees in town and yards, bottlebrush among the shrubs along house fronts,
  spineless yuccas in front yards and among the chaparral with prickly pear, all from Sketchfab (PlantCatalog by
  e-on software, massive-graphisme, ElectroNick; CC BY 4.0, credited in `assets/nature/CREDITS.md` and the menu). A
  fourth Mexican fan palm joins the street palms. Only the gums and pepper trees are still grown in code.

## 0.12.0: Wild Oats (2026-11-03)

- **The aerial photo is painted over:** the ground no longer shows the photo anywhere, near or far (its cars,
  shadows, treetops and smears are gone). The photo only decides what lies where; each ground is drawn in its own
  colour and texture: tan decomposed granite, golden thatch, lawn, leaf litter and mulch, granite, sand. Chaparral
  reads as a lumpy olive canopy from a distance, the thatch has tussocks, and Poway High's campus ground is painted
  the same way.
- **Grass everywhere, as far as you can see:** the wild grass was nearly invisible (its scanned card had come out as a
  few black specks); it is now a dense tuft of scanned blades with oat heads, golden in the sun. Past the near grass,
  coarser rings carry the lawns on to ~75 m and the wild oats and brome to ~300 m on High, so the grass never ends in
  a circle round you. Grass keeps off tracks, campuses, lots and yards' dry gardens, and thins under thick brush.
- **Parks are watered only where they're green:** a park's dry hillsides (Lake Poway's among them) are wild grass and
  chaparral again, not mown lawn.
- **Real palms:** Mexican fan palms (one in its skirt of dead fronds) and a California fan palm from Sketchfab
  (PlantCatalog, CC BY 4.0, credited in `assets/nature/CREDITS.md` and the menu) replace the fan palms grown in code,
  and grow to their species' height (10-22 m). The tools that fit them (`tools/nature/bake_sf.sh`, `fit_plant.py`)
  are ready for the date palms, oak, cypress, bottlebrush, citrus, yucca and prickly pear chosen to follow; until
  those arrive, the bottlebrush and citrus planted in town and yards stand in as olives.

## 0.11.0: Golden Hour (2026-11-01)

- **A new look for every screen** (`src/ui/sunset.css`, replacing the leather-and-wood western skin): golden hour over
  Poway seen through smoked glass. Dark plum glass panels with a thin sunset line along the top, buttons as slim pills
  (the main action a sunlit one), the main menu as a list of plain type with the sunset line marking where you are,
  thin switches and sliders, glass notes in the HUD, and money, speed and the street name without heavy outlines.
  The wild west stays in the type: WASTED and BUSTED in a slab wanted-poster face, a spur-rowel cursor.
- **The wordmark:** a brush-script "Poway" over "AUTOMOBILE ONLINE" replaces the licence plate on the loading screen,
  the menu and the pause card.
- **The loading screen is a painting:** a muscle car on the coast road at sundown, palms, the pier and the mountains,
  pushing in slowly while the world loads. The wordmark top left, "Sun. Dust. Opportunity." top right, the tip, what's
  loading and a thin glowing progress line bottom left, "Poway, CA" and the version bottom right. The menu sits over
  the same painting.

## 0.10.2 (2026-10-31)

- **319 real cars on the streets** (`src/sf.js`): every car the streets make for themselves is now one of 319 models
  from Sketchfab, at real size, from beaters to exotics. Cheaper cars where the money is thin and nicer ones where it
  isn't; police cruisers for the police. Each keeps its own look except the paint (it takes the car's colour), the
  glass and the lamps, lit at night. A few of each kind come in with the loading screen, the old built-in bodies
  only stand in until a model has loaded and are swapped for one out of sight, and buses keep their own. A model loads
  when a car needs it and is let go once none does, so the streets turn over every few minutes. To keep the frame
  rate, each car is drawn in as few pieces as its textures allow and its textures are cut to 512 px, only cars near
  you show their cabins and badges and cast shadows, and see-through parts that made the whole scene draw twice are
  made solid.
- **Credits** on the menu: every model with its title, its maker and its licence, with a search box (also in
  `assets/sf/CREDITS.md`).
- **Each car its own top speed and pull** (`tools/sketchfab/speeds.mjs`), from what the real one does: an Aventador
  tops out near 150 mph, a Civic near 90, a Model T at 42. Body-shop upgrades build on the car's own numbers, and police
  cruisers are never slower than the old police car.
- **Tyre marks, smoke and dust that everyone sees** (`src/fx/skids.js`): rubber on the road and white smoke where tyres
  slide (a drift, the handbrake, a hard stop, a burnout), dust kicked up off the pavement. Another player's car lays the
  same from their own game's slide, sent with their car.
- **Other players' cars move like cars:** their front wheels steer as they steer, the wheels turn with their speed
  (backwards in reverse), their lamps light at night, and they roll ruts in the beach sand.
- **Players show up at once:** someone joining appears straight away in a stand-in look until their own avatar has
  downloaded (a slow or stalled download from the asset host used to keep them invisible); anyone the room knows about
  that this screen missed is added within seconds; and a kept sign-in the server no longer accepts is renewed instead
  of failing the join.
- **Wheels on the road:** each new car's wheels turn about their own centre (some models' wheels swung down through the
  asphalt) and never rest below the ground, and wheels that aren't round don't spin. At Poway High, cars and people
  stand on the campus's own paving and paths instead of the terrain a few cm under them.

## 0.10.1 (2026-10-31)

- **Every shopping centre's stores, on their real buildings:** each of the 275 stores the map names in Poway's centres
  gets its own storefront where the map puts it, sized and dressed by its trade (glass, mullions, doors, sign or the
  chain's parody mark, awning or lit soffit, the trade's room through the glass, patios and umbrellas, bike racks, a
  barber pole, ATMs, ice chests, carts, window neon); the rest of each centre's fronts take made-up local tenants and
  a few vacancies. The five hand-built plaza shells (over the map's own buildings, Target's among them) are gone.
- **Walk into the shops:** go up to any storefront and step through its door into the room behind the glass,
  furnished by the trade to the back wall: booths and counters, espresso bars, barber chairs at their mirrors, nail
  stations and pedicure thrones, a bank's tellers and glass offices, market aisles and coolers, liquor coolers and wine
  aisles, weight rooms, yoga and martial-arts studios, offices. A stockroom door at the back, ceiling lights, and the
  camera stays inside with you.
- **Parking lots that hold together:** every lot is paved to its edges and a little beyond (no more grass, old photo
  stalls or strips of bare ground showing through or between lots), the drive aisles through it and the drives in
  from the street are asphalt (they were drawn as wide concrete driveways), the banks round it are planted in ice
  plant, its rows end in curbed planted islands with a tree and a light, lights stand down long rows, a concrete apron
  crosses the walk where it meets the street, and a strip centre's walk ends in a red fire-lane curb.
- **Storefronts face level ground:** shops no longer open onto banks of earth (110 of them did); a store moves to the
  side of its building that faces the lot. Rooms keep their floor at the door's level instead of rising to the hill
  behind the building (one was 2.4 m up).
- **Signs in real typefaces:** each shop's sign is set by its trade (a script for a salon or nail bar, a serif for a
  bank, a rounded or slab face for a taco shop or pizzeria, a heavy face for a market or gym), and the For Lease
  boards, the car dealers' signs and the auto shop's sign are no longer plain Arial.

## 0.10.0: Outlaws (2026-10-31)

- **Act I, all the way to your first car.** A new game starts on foot, and the story is a run from Poway High to
  Tommy's gold car that teaches the game as it goes. *Last Ride:* Tommy is waiting out front of the school on Espola
  Road; a black car with its lights off puts him through the rail at the bend, and its men come back for the witness.
  *Homecoming:* the memorial at Old Poway Park, where Jericho "the Deacon" Vance of the Iron Mountain Syndicate pulls up
  in a black SUV and hands Marco his brother's $40,000 debt. *Collections* (a fistfight at the Rusty Spur), *Iron*
  (bottles on a plank behind Poway Road Pawn), *Wheels* (your first stolen car) and *Impound:* Tommy's car out of the
  Sheriff's lot at night, past two deputies, into Doc's garage, where the Dust Devils ride again. Offline, Tommy's car
  no longer waits at the curb: it's the car you earn, and it stays in your garages.
- **How to play, taught as you go** (`src/story/tips.js`): a card on the left with the key and what it does, shown when
  a step needs it and gone once you've done it; the journal lists them all. After Impound, texts from the gang
  introduce calling your car, the gun dealers, courier jobs and car lots, the journal and the banks. Objectives say how
  far away they are.
- **Three new cutscenes:** the crash, now out front of Poway High (it used to be at the lake), the memorial, and the
  founding of the Dust Devils at Doc's Garage. No new traffic drives into a scene, and a scene waits for the garage menu
  to close.
- **Western names** for the cast: Tommy "Lightning" Reyes, Marco "the Espola Kid", Doc, Old Hickory, Sgt. "Two-Badge"
  Kessler, La Gata, El Patrón, Buzzard, the Widow, Hoss, Gunny, Cookie and Sawbones; new in the gang, Boone
  "Six-Shooter" Calloway and Jesse "Rattler" Ortiz, and the Deacon's undertaker, Cyrus Pike. The porch pirates are gone,
  and the rail-yard taggers are Los Coyotes prospects.
- **Outlaw avatars** (`assets/humans/outlaws.json`, CC BY 4.0 models from Sketchfab, credited there and in the README),
  fitted by `tools/humans/fit_outlaw.py` (Blender) and animated with the Rocketbox clips, re-aimed onto each model's
  own rest pose when it loads (`src/humans.js`); the fitter also stands up a model exported lying on its back. Seven of
  them: a new player starts as a cowboy, and Tommy, the Deacon, El Patrón, Pike, Rattler and Boone each have their own.
  The Deacon's men wear Pike's look or dark clothes. The character editor leaves their hats on.
- Saves already past the opening get the four new missions marked done and Tommy's car in their garage.
- **The slender trees have their branches back up close,** and the console has no shader error on load: the near
  model's branch material tiled its bark on a second UV set that the web LOD no longer carried, so its program failed
  to compile (`'uv1' : undeclared identifier`) and the branches between the trunk and the leaves weren't drawn. The LOD
  keeps the set each material's colour map reads (`tools/nature/slim_glb.py`), and the near meshes always read their
  one UV set (`src/nature/vegetation.js`).
- **Real cladding on the buildings:** walls are clad in real materials chosen by the neighbourhood's look and the
  building's type: smooth, sand, lace and aged stucco, plaster, lap siding, board-and-batten, shiplap, red, tan and
  painted brick, painted and split-face block, tilt-up, concrete panels, corrugated metal. Some street fronts have a
  stone or brick wainscot with a cap; trim is painted wood. The materials sit in one texture array
  (`src/world/wallarr.js`: Poly Haven scans plus the generated library from `tools/matpack`), so every wall in a block
  of town is one mesh: fewer draw calls than before (14-48 % fewer in the views tested).
- **Real fittings round the windows and doors:** window surrounds by the neighbourhood's look (foam, deep stucco,
  painted wood, thin dark metal), louvred shutters, wrought-iron rejas on Spanish houses, door casings, garage-door
  jambs, storefronts framed in aluminium with transoms, gutters and downspouts along the eaves, front porches on posts
  on ranch houses, cottages and bungalows, and balconies with railings on garden apartments. They are laid out by the
  same rules as the painted windows (`openings` in `src/world/bldgen.js`), so they sit exactly round them. The small
  pieces are instanced near you (`src/world/bldkit.js`); a refill now only copies prebuilt matrices.
- Wainscots sit lower (below the window sills) and their cap stops at doors, garage doors and storefronts.
- **Houses with depth:** windows and doors are set into the walls with reveals, some front doors in a covered alcove;
  picture windows on the front, a slider and wide windows out back, small bath windows and blank stretches on the
  sides; covered patios on posts over the back slider; a weep screed at the foot of stucco walls; vents in gable ends.
  Gable ends get rake boards and a soffit up the slopes instead of a fascia across them.
- **Estate houses** on Poway's big lots: cross gables in flat concrete tile, light stucco, white window frames, one or
  two chimneys, and often a two-storey wing under its own roof (roofed like the rest of the house) with a deck across
  its gable end.
- **Solar panels show again** (the ridge's cap tiles had been taken for the sunny slope); arrays go on the sunniest big
  slope, south then west. Tile roofs with no aerial photo over them are no longer darkened by the tile scan. Chimney
  chases are a real width and stop 0.7 m past the roof near them.
- **Big boxes:** doors face the parking lot, not the nearest street; supercenters get two entrances with raised towers,
  vestibules and canopies, pilasters, accent bands, a block base and bollards; warehouse clubs corrugated metal over a
  tall block base; the store's mapped name says which (the Poway Walmart now has its grocery and home entrances on its
  lot), and a mapped store is never drawn as a plain warehouse. Dock seals and bumpers behind.
- Footprints the map isn't sure about, on quiet residential streets with nothing mapped at the door, are houses, not
  shops. Brown concrete tile in the aerial photo is no longer read as clay.
- **Hillside lots are graded:** a house on a slope stands on a level terrace at the height where its driveway meets
  the garage, its side and back yards level with it out to the lot lines (half way to the neighbours, short of a
  street). Where the hill keeps falling or rising behind the house the back yard steps down or up in terraces, up to
  three, no wall between them over 2.4 m, joined by concrete stairs through the retaining wall (straight down, or along
  the wall from a landing). A pool sits whole on one terrace, at its own ground. The houses no longer stand on tall
  blank walls down the slope (`src/world/pads.js`; the ground shader leaves out the hill inside a terrace).
- **Walls and fences along the lot lines,** stepped down the slope, holding the ground where a terrace and the land
  beyond part, with a fence over the higher side by neighbourhood: stuccoed block, block with pilasters, stone pillars
  with cast caps (stone-faced walls on those lots), wood boards on posts, white vinyl, a split rail out in the country;
  wrought iron (between stone pillars on estates) on the side with the view. Some lots round their corners in a curved
  wall. The side yards' gates stand open, between pillars where the fence has them, with steps where the ground beyond
  is higher or lower, so every part of the yard can be walked to. You walk and drive on the terraces and stairs, and the
  walls stop you; plain yard walls still give way to a fast car.
- **Planting in the back yards:** shrubs along the walls inside, a tree (palms, olive, pepper, jacaranda by the look)
  in a back corner.
- Side-yard walls stop at the lot line, half way to the neighbour's house, so two neighbours no longer each build one
  in the same side yard; narrow side yards still get their gate.
- **Target is a real store now:** the hand-built box that stood on top of the Carmel Mountain shops is gone, and the
  Poway Target is drawn on its own footprint on Pomerado Road (the map has it only as an unlabelled outline): a red
  entrance tower with its parody sign, red bands and red bollards. Known chains wear their colours and signs on their
  big boxes (Walmark, Costko, Trader Moe's; Sprouts green, Ralphs blue...), supermarkets are grocery anchors (Sprouts was
  a tall blank shop), a store's name wins over the café inside it, and a big box's doors never open onto a wall another
  building stands against.
- The hand-built Walmart box that overlapped the real Walmart on Poway Road is gone too: the store is the generated
  supercenter, its two entrances signed. So are the hand-built Subway and Great Clips, boxes over shops the map has.
- **The game's files stay on your computer:** the town comes as a few zip files (packs) from the game's own asset
  server instead of Firebase. On a first visit the loading screen streams the pack it needs (56 MB for the 85 MB of
  files it loads), a few megabytes per request, each file checked against the manifest and kept as soon as it's in,
  so a download that gets cut off carries on where it stopped. The county tiles, people and everything else come file
  by file from their packs as you need them. A service worker keeps them all in the browser: the next visit loads
  them from disk and downloads nothing, and after an update only the files that changed download again; files no
  longer used are deleted. When the asset server doesn't answer, the game takes its files from the site as before,
  and keeps those too. (`sw.js`, `tools/packs/`, `server/assets/`; off until the deploy's `nakama.json` names the
  server.)
- **Faster loading:** curb parking checked each of the 67,000 curb spots against every driveway and hydrant in town
  (about 700 million distance checks), and finding the nearest street, asked a few hundred thousand times while the
  buildings are raised and all through play, made garbage at every road segment it looked at. Both now look only
  at what's near: raising the buildings dropped from 7–23 s to about 1 s on a test laptop, and the parking step from
  1–15 s to a fraction of a second. Road lookups skip the far parts of long roads. The game server check now starts
  with the page instead of holding up the game's code.
- **No more shader freezes while you play:** on Windows every new shader program holds the game for a third to
  two-thirds of a second, and some were still compiled in the middle of a frame, after the loading screen: the shadow
  versions of things (three builds a separate program to draw each kind of object into the sun's shadow maps, and
  nothing warmed those), the post-processing passes and the sun dust on the first frame, and things that only appear
  later: the power-line wires and the docks as you come near them, the marina's boats, the first flight overhead, the
  first rabbit or hawk, a car or bike model that first drives by after the loading screen, an avatar fetched in the
  middle of play. Now each of them is built before it can show: the shadow programs with one shadow pass of the new
  things alone into a tiny stand-in map, the late arrivals from one of each kind on a hidden holder. A program the
  warm-ups built is kept even when the last thing using it goes (a bike's chain was compiled again every time the last
  bike left town). Measured in a 30 s drive after loading: from 19-24 programs compiled inside frames to none. Nothing
  looks different.

## 0.9.2 (2026-10-30)

- **The Velvet Javelina,** a cabaret lounge by the Carmel Mountain Plaza club strip and the first building you can walk
  into (`src/world/club.js`). Pink script neon over the canopy, a doorman in a suit and shades at the velvet rope, and
  inside, lit only by what glows: a black gloss stage with lit edges and a red curtain, coloured beams sweeping through
  the haze, a disco ball, a DJ in headphones, a bar with a back-lit shelf and a bartender, booths and high-tops full of
  patrons. Three dancers on the stage, in their party outfits. Nobody undresses, whatever the settings.
- This deploy also ships 0.9.0 (the character editor) and 0.9.1 (buildings from their footprints).

## 0.9.1 (2026-10-30)

- **Buildings generated from their footprints,** all 28,000 in Poway and every one out in the county
  (`src/world/bldgen.js`): the shape (area, how long and thin, how much of its bounding rectangle it fills, square
  corners, wings), the map's kind, height and roof colour, what's round it (parking lots, school grounds, parks, how
  built-up, the shop or restaurant mapped at its door), the street it faces, the zone and the neighbourhood's own look
  (tract, Spanish revival, ranch, modern, beach cottage, bungalow) decide what a building is and how it's built.
  Houses get hip, gable or cross-gabled roofs fitted to their L and T plans (a wing's roof now runs into the main one
  instead of standing a gable up through it), a few modern flat or shed roofs over deep eaves, chimneys; detached
  garages show their doors to the street; townhouse rows have a door per unit in front and garages behind; garden
  apartments are pitched, the big ones flat with cornices and floor bands; strip malls get clay tile mansards, metal
  canopies or canvas awnings over the storefronts and raised parapets; big boxes a raised entrance parapet and canopy;
  banks and civic buildings low clay hips, schools deep eaves; halls steep gables; sheds a shed roof. Untagged
  footprints by a parking lot on a main road are shops, not houses; on school grounds, schools.
- **Rooftop units, satellite dishes and turbine vents** are real models near you, instanced (three draw calls in all,
  `src/world/bldkit.js`); far away a rooftop unit is the plain box it was. Awnings are drawn with the sidewalks.
- **Single-storey houses are houses again:** about 3,000 low homes whose height was guessed under 3.6 m were drawn as
  windowless sheds; they now have windows, a front door and a yard.
- **Everyone sees the same town:** wall colours and every choice above come from where the building stands (they were
  random per player).

## 0.9.0: Dressed Up (2026-10-30)

- **Character editor:** the Character screen now dresses who you play as. Tabs for the person, hats (ball cap,
  backwards cap, beanie, sun visor, bucket hat, fedora, cowboy hat, hard hat, open-face helmet, crown), glasses
  (shades, round specs, aviators, sport wraps, gold aviators), the neck (bandana, headphones, chain, chain and
  medallion, lei) and the back (backpack, sling bag, parachute pack, cash duffel), each in a choice of colours, plus
  height and build sliders. Drag the preview to turn them round.
- **Unlocks:** everyday things are bought with your cash; others come with an achievement (the hard hat, the helmet,
  the crown, the sport wraps, the lei, the parachute pack, the duffel) or, online, a career level. Uniforms come with
  the work they stand for (firefighters with Chain Reaction, pilots with Frequent Flyer, police at level 10, and so
  on); athletes are bought. What you wore before stays yours. Purchases are saved and travel with your cloud save.
- **Fitted to each person:** everything is measured against that person's own body and moves with it: hats on the
  skull, glasses just in front of the eyes, chains and leis along the collar, straps over the shoulders and across the
  chest. People who already wear something on their head or face (hoods, keffiyehs, uniform caps, helmets, masks)
  keep it, and the editor says so.
- **Online:** other players see your outfit, height and build, and see changes as you make them.

## 0.8.8 (2026-10-29)

- **Cheat sheet:** it opens by typing its new phrase straight on the keyboard while you play, chat closed, one letter
  after another (each within a second and a half of the last). Typing it in the chat box still works; the old phrase
  no longer does. The cheat codes themselves are unchanged.

## 0.8.7 (2026-10-29)

- **Roads, rebuilt:** about a fifth wider than life (they felt cramped at true size). Every town street has a curb, a
  concrete gutter and a sidewalk, downtown and the business parks included (they were treated as country roads).
  Corners are rounded with real curb returns, the sidewalk carried round them, instead of sidewalks running across the
  junction. Every town junction has crosswalks, side streets have a stop line and a STOP sign, mid-block crossings have
  pedestrian crossing signs, and lines stop short of the junction. Divided roads have raised medians, concrete or
  planted, and freeways a concrete barrier you can't drive through. Country roads have edge lines. Driveways are
  concrete, with the sidewalk running across them.
- **No more ground through the road:** on hillsides the ground came up through the asphalt (a metre in places beside
  split-level roads), and the graded verge behind a sidewalk could climb over the next road down. Both fixed.
- **Ground up close:** the detailed ground textures load first, a second after you start (they used to wait for the
  trees, a minute or more of blurry ground), keep their relief further out, and reach twice as far.
- **Busier streets:** cars parked along the curbs wherever a street has room for them, the same ones each time you
  come back; about 40% more people and traffic on every graphics setting (the online room's too, once the server is
  updated).
- **Driving:** your speed in mph and your elevation in feet next to the street name.
- **HUD:** no more overlaps on smaller windows: the corner blocks scale together, the job, waypoint and radio lines sit
  in their own columns. On the loading screen the Enter button no longer sits on the logo.

## 0.8.6 (2026-10-29)

- **One town for everyone online:** the game server now walks the people on the sidewalks, the way it already drove the
  traffic. Every player sees the same people in the same places, wherever they are; a shot or an explosion sends them
  all running, and someone killed falls for everybody. Games online spawn no people of their own any more.
- **The same chase for everyone:** the cops after a wanted player (the cruisers on a call, sirens and all, and the
  deputies on foot) show up in every other player's game too. Hitting one of them, or taking their car, reaches the
  game that runs them.
- **No more launch ramps outside Poway:** a road's height along its length was worked out once, sometimes before the
  map tile next to it had loaded, from a fallback that is tens of metres off out there; side streets meeting it were
  pulled up (or down) to match, in 70–180 m ramps a few car lengths long. Heights that depend on ground not loaded yet
  are now redone once it arrives, the ground is re-carved under them before the tile is built, and nothing is pulled to
  a guess.
- Tiles of the outer world built while the trees were still loading crashed and were never built (holes in the map
  after a quick fast travel). They now wait to be planted, and a planting that fails leaves the tile bare, not missing.

## 0.8.5 (2026-10-29)

- **Smoother play:** the streaming (the outer county's tiles, the town's streets and buildings, the plants' tiles, the
  brush and stones, texture uploads) now shares one budget per frame: what's left of a 60 fps frame after the game's
  own work (`src/budget.js`). A heavy frame streams less instead of stuttering.
- The town's meshes are written into growable typed arrays instead of plain arrays: building a chunk of streets and
  houses costs about a third of what it did.
- The roof photos download with everything else and are applied before the first streets are built. They used to
  arrive after you started playing and make every chunk of town rebuild from scratch, with holes while it did.
- A chunk that must be rebuilt (a wall knocked down, a building repaired) keeps showing until its new meshes are ready.

## 0.8.4 (2026-10-29)

- **Online works again:** the 0.8.3 site went out without its game-server address (`nakama.json`), so every game fell
  back to playing alone over Firebase. It's back, and a deploy now refuses to go out without it.
- **The last loading stalls, gone or split up:** the map's ranch fences and block walls, turning every chunk into meshes,
  laying out the parking lots, and raising the buildings all run in short slices with the loading bar moving. Textures go
  to the graphics card a few at a time on the loading screen and after each later step (drawn for the first time they
  went up inside one frame), and the crowd's shaders and textures are ready before anyone wears the new bodies.
- **Beaches:** real sand (Poly Haven dense sand, CC0) instead of the gravel layer, warm tan whatever the far photo shows,
  with lumps and wind ripples, and a dark, damp, glossy band where the waves reach. Along the tide line: tangles of kelp,
  cobbles and chips of rock, shells and bleached driftwood, heaped in drifts at the high-water mark; what lies at the
  water's edge slides up and down with each wave (`src/world/wrack.js`).

## 0.8.3 (2026-10-29)

- **Fairer Sheriff chases:** cruisers drive in a formation (one behind, two on your flanks, a fourth further back)
  and match your speed instead of charging into your car. A PIT comes only from a flanking unit lined up on your rear
  quarter at a sane speed, one unit at a time with 9 to 14 s between tries, and it is a single nudge. Only the SED
  rams, at five stars. A deputy's contact does half damage to your car, and it no longer counts as you ramming them
  (which used to add stars and let deputies shoot). Deputies' and passengers' rounds hit a little softer.
- **Robbers:** now and then a crew of two hits a store near you and runs for a getaway car. Stop them (they shoot
  back) for a reward and the cash they took; fighting them isn't a crime. Leave them and a deputy tails the car, PITs
  it and arrests them.
- **Bank heists:** case a bank (unarmed, hold E at the door), then go in loud (gun out: hostages, armed guards,
  thermite, an alarm on a timer) or quiet (after 10 PM: guards walking a beat, a slow drill, 40% more if nobody ever
  knew). Grab up to four bags (they slow you down) and get clear: the take pays once you've lost the Sheriff.
- **Skill tree 2.0** ([docs/skill-tree.md](docs/skill-tree.md)): five trees (Driver, Gunfighter, Survivor, and new
  Hustler and Crew) plus hybrid perks, 42 skills in all and far more than one character can buy. Rows open as you
  spend points in a tree, and each tree ends in two capstones you choose between. The Career screen shows the trees
  as tabs with their rows. The server enforces every rule.

## 0.8.2 (2026-10-29)

- **No more waiting on the whole map:** the plants are planted in 500 m tiles, nearest first. The trees, rocks, yard
  plants, brush and stones round you are in within seconds of the loading screen, and the rest of the map fills in
  outward while you play, a tile at a time between frames (the old way placed all 1.2 million plants before showing
  any, and held the game while it did). Each tile comes out the same whichever is planted first.
- **Better trees** (Poly Haven scans, CC0, baked in Blender into impostors and near meshes): jacarandas, slender young
  street trees, and two chaparral shrubs (laurel-sumac and lemonade-berry-like) on the wild hills; sharper olives
  and scrub oaks up close. The grown Italian cypress keeps the coast's windbreaks. The near meshes load in the
  background, and every species' close-up leaves now share one shader (they were two each).
- Parking lots stripe in slices during the loading screen.

## 0.8.1 (2026-10-29)

- **Finding the last freezes:** the loading screen times each of its steps in the console (`[boot]`), and any freeze
  over a second is logged (`[freeze]`, with the step it happened in). `?jsprof` in the address starts the browser's
  JS profiler from the first line, for measuring on players' machines.
- The trees' collision setup runs in slices instead of one block.

## 0.8.0: Smooth Ride (2026-10-29)

- **Far fewer freezes on Windows.** Under Chrome on Windows (Direct3D) every new standard-material shader holds the
  page for half a second or more, and a gaming PC measured over 90 s of them per load, some in one 137 s freeze.
  - The loading screen compiled the screen-output versions of the shaders, but the game draws through its post
    chain, so the versions it uses then compiled in the first frames. Compiles now aim at the same kind of target
    as the frame, which also halves the number of shader programs (232 to under 100).
  - The street lamps', headlights' and effect lights' lighting stays a real loop instead of twelve unrolled copies
    in every material (`src/lightloops.js`): each shader compiles about 30% faster.
  - Shaders compile a piece at a time with the loading bar moving, instead of all at once on a frozen screen.
- **Faster start:** the loading screen builds only the streets and buildings within 800 m of you, in slices; the rest
  of the view streams in as you play. The tree filter runs in slices, and the plants' valley map is built once
  instead of four times.
- **Music:** the exploring songs take turns in one audio element instead of a new one per song.

## 0.7.2 (2026-10-28)

- **Fewer freezes:** the plants, ground cover, grown trees and their impostors now build in small slices after the
  loading screen instead of in one block (that froze the game for seconds just after it started), and their shaders
  compile off the frame before they show; the scene's shaders compile during the loading screen too. The minimap
  redraws its base map only when you leave it (it redrew every few seconds and whenever your speed changed the zoom);
  long roads pave in steps; the grass under you re-reads the ground a few rows a frame; leaf textures are stamped from
  pre-tinted sheets (a canvas filter per leaf took seconds). The tree atlas no longer keeps four hidden copies of
  itself in video memory. A frame profiler (`window.__gtp.prof`) records where any slow frame went.
- **Palms** lean and curve back toward the sky, at heights from 4 to 26 m, trimmed with a boot of leaf bases or still in
  their skirts of dead fronds, thin or full. Queen palms join the fan and date palms. The plazas' cone palms are gone:
  their islands grow real ones.
- **Power lines where they really run** (`assets/world/power.json`, OpenStreetMap): about 20,000 towers and poles out
  to 50 km. Lattice towers with X-braced panels, crossarms and disc strings for the 138-230 kV lines; the 500 kV
  towers with their V-strings; tubular steel poles with davit arms; tall wood 69 kV poles with post insulators and a
  12 kV circuit underbuilt; gantries at the substations. Along Poway's rural and estate roads, wooden distribution
  poles laid by rule (the tracts are fed underground): crossarms and braces, pin insulators, transformers with their
  cutouts and jumpers, guyed dead-ends and angles, cobra-head streetlights, phone and cable lines below the power,
  service drops to the houses, some streets with only the telephone poles left. The wires sag between them and stay
  crisp at any distance. Hit a wooden pole fast enough and it snaps, arcing, and its wires come down.
- **Boats, rebuilt:** real lofted hulls (a deep V at the transom into a fine entry, chines, flared topsides) for the
  lakes' rental boats, rowboats, pedal boats and kayaks, bowriders, center consoles with T-tops and twin outboards,
  sport boats, tritoons, 30 ft sloops with their rigging and 50 ft flybridge yachts. More of them for sale at the
  marina.
- **Marinas** (`assets/world/harbor.json`, OpenStreetMap): San Diego's docks down to their fingers, with about 5,000
  boats in their slips (bigger slips, bigger boats), bobbing on their lines; the fixed piers on their pile bents; rock
  breakwaters and jetties.
- **Trailers** in the driveways: boats backed in on their trailers, travel trailers, utility trailers, and horse
  trailers in the country.
- **Surf:** real surfboards stuck in the sand; surf rental shacks on the beaches (soft tops on a rack, wetsuits,
  a SURF flag); a third of the beach towns' cars carry boards on a roof rack.
- **Soft sand:** tyres leave ruts and people leave footprints on the beach; they fade over a couple of minutes. Sand
  drags at cars and slows you on foot.
- **Bikes and scooters:** beach cruisers, step-through scooters and rental kick scooters on the sidewalks (mostly in the
  beach towns and downtown); ride them with F, and you're on them: on the saddle, feet on the pedals, leaning into
  the turns.

## 0.7.1 (2026-10-28)

- **Water by kind:** clear pools with a tile band, steps, a sloped floor, caustics and night lights, the ground cut out
  round each one; dark, choppy lakes with muddy shores; the sea near the coast with swell that lines up with the beach,
  breaks and runs up the sand; working fountains at three plazas; beaches with lifeguard towers, umbrellas, towels
  and boards.
- **Streets that end like Poway's:** cul-de-sac bulbs on residential dead ends, barricades with END markers elsewhere,
  NO OUTLET and DEAD END signs. Manholes and valve covers. Signs stand off their posts and have galvanised backs.
- **House fronts with depth:** stoops, planting beds with mow curbs, window sills, garage trim, coach lights,
  mailboxes, driveway curb cuts, wooden side gates. Block walls with pilasters along the main roads, white ranch
  fences in the country, open iron gates on estate drives.
- **Trails:** decomposed granite with ragged edges, worn lines and granite stones; gravel shoulders on country roads.
- **Nature:** coast live oaks grown at their real size, brighter leaves shaded through the crown, real tree meshes out
  to ~85 m; scanned shrubs, wild bushes in clumps, ice plant on the freeway banks, pebbles and stones on bare ground,
  dead branches under the brush (Poly Haven, CC0); thicker lawns and wild grass from a scanned grass clump; lawns and
  gardens with frayed edges and worn patches. Regional trees and house colours out in the county.
- **Driving:** brush and chaparral slow the car and scratch it up; ranch, trail and yard fences and block walls break
  when you hit them fast enough (and hurt the car). Jumping is the **Hydraulic jump** upgrade (X; SPACE glides), higher
  and further every level.
- **Sky:** clouds billow and change shape, drift on the breeze, fair-weather cumulus build and thin out, a mid deck of
  altocumulus; their shadows sweep across the ground.
- **People:** feet planted on the ground you see, hips dropping on slopes and kerbs.
- **Plazas:** shops as parodies with look-alike lettering; store signs now face the street.
- **Zones** (`src/world/zones.js`): La Jolla, Del Mar, Rancho Santa Fe and Coronado money; north Poway estates;
  downtown; the beach towns; working neighbourhoods; the back country. They set the traffic and parked cars (sports
  cars and SUVs where the money is, pickups out east), how much cash people carry, ammo drops, and how many patrol
  cars answer a call (more in the rich areas and downtown).
- **Dusk:** violet overhead, orange at the horizon, like the real thing.
- **Music:** the game's own songs. *Descent into Luxury* loops on the main menu and the pause screen; *Sunset Freeway*
  and *California Twilight* play on foot as you explore, with quiet spells between; KPOW 96.9 Sunset Radio plays
  *Out of Pocket*, *California Dreamin'* and *Bad Investment* (a supercar tunes straight to *Out of Pocket*).
- **Sound:** thunder rolls in a second per 343 m after the flash, with a crack when it's close; wind gusts on foot
  outdoors; rain muffled under a roof or in a car; birds by day, a hawk over the brush, crickets and coyotes at night.
- **Weather:** a Freeze the weather setting keeps today's weather while the day goes on; off, the weather cycles.

## 0.7.0: Golden Hour (2026-10-28)

- **Look:** a Sunset Western colour grade (amber highlights, warm-brown shadows, olive greens, filmic curve, grain,
  burnt vignette), light shafts through trees and buildings, dust motes in the sun, dust behind cars on dirt.
- **UI:** a western theme over every menu, button, tab, toggle and cursor (`src/ui/western.css`). A new loading
  screen: a sunset drive into Poway, with the version stamped on the plate.
- **Surfaces:** scanned CC0 materials (Poly Haven, ambientCG). Every wall lays out its own windows, doors, garage and
  storefront, with rooms behind the glass. Weathering. Tile roofs with parallax depth. Worn asphalt, jointed
  concrete sidewalks.
- **Houses:** hip and gable roofs with eaves, fascia, soffits and cap tiles. Each roof's colour comes from the aerial
  photo. Driveways, front walks, block walls, AC units, bins, shrubs and yard trees.
- **Streets:** real road widths fitted round the buildings, crowned asphalt, 15 cm curbs with gutters, graded ground
  behind the sidewalk, and country trails with post-and-rail fences. Curb colours and signs placed for a reason,
  house numbers on the curb. Driveway and curb parking that changes with the time of day.
- **Nature:** lawns and dry gardens per house; scanned grass, wild oats and gusty wind. Palms, eucalyptus,
  jacarandas, pepper trees and cypress grown in code. 68,000 granite boulders where the photo shows them. Hawks,
  ravens, rabbits, ground squirrels with burrows, and coyotes at night. Thick brush slows you down.
- **People:** walk only where there's a sidewalk or trail, and wear everyday clothes; uniforms only where they belong.
  They put their hands up at gunpoint and can be robbed, and walk away from a drawn gun.
- **Places:** car lots and the Lake Poway marina with salespeople and trims. Modern auto shops with far more tuning.
  A name and chat filter.

## 0.6.0 (2026-10-23)

- Online: everyone has the whole map.

## 0.5.0 (2026-10-20)

- The server runs the street traffic for real. Wrecks stay wrecked, and a car you took is never drawn twice.
- Race boards are created reliably at server start.

## 0.4.0 (2026-10-19)

- Holes fixed: Tab pause, account wipe, rules, tester code, planes, gangs; a garage showroom.
- Online: the room runs street traffic, rejoining works, no frozen copies of players.
- Half the frame time at the start point. Crew garages: community mini-games on the server.

## 0.3.0 (2026-10-18)

- The county around Poway, streamed in tiles. Architecture generator, furnished buildings, five plazas, a tactical map.
- Fixes for roads, weapons and online play; supersonic fighter jet.

## 0.2.0 (2026-10-17)

- Nakama game server: accounts, cloud saves, levels, skills, leaderboards.
- The realistic look: sky light, height fog, aerial perspective, cascaded shadows.
- Maps with a natural photo edge, story opening, street crime, rides in other players' cars, boats and planes for
  everyone, and the outer world 50 km round Poway.

## 0.1.0 (2026-10-16)

- Real-scale cars, people with names and animations, destruction, weapon shop, achievements, crowds, regions,
  procedural radio and sound, signals, a sunset sky, storylines, parking, the shared online world, nukes, brand images.

## 0.0.0 (2026-10-16)

- First commit: online multiplayer, a new look, a low-end mode.
