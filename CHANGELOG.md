# Changelog

The game's version lives in `src/version.js` and shows on the loading screen and the menu. **Bump it with every
update you ship**, and add an entry here at the same time:

- the **minor** number goes up for each day of updates (`0.7.0` → `0.8.0`), with a name for the update;
- the **patch** number goes up for each deploy within that day (`0.7.0` → `0.7.1`).

`0.0.0` is the first commit. The numbers below were assigned afterwards, one per day of work in the git history.

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
