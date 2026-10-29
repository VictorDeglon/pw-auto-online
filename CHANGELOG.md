# Changelog

The game's version lives in `src/version.js` and shows on the loading screen and the menu. **Bump it with every
update you ship**, and add an entry here at the same time:

- the **minor** number goes up for each day of updates (`0.7.0` → `0.8.0`), with a name for the update;
- the **patch** number goes up for each deploy within that day (`0.7.0` → `0.7.1`).

`0.0.0` is the first commit. The numbers below were assigned afterwards, one per day of work in the git history.

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
