# The outer world

`assets/world` holds everything within 50 km of the hand-built core (`poway-data.js`): the beaches, downtown San Diego,
Miramar, Escondido, the back country and the strip of Tijuana inside that box, in 2 km tiles the game streams in as you
move (`src/world/outer.js`). These scripts build it from public data:

| Source | What | Licence |
|---|---|---|
| Geofabrik, Southern California extract | roads, buildings, places, signals, stop signs, crossings, trees | OpenStreetMap, ODbL |
| Overpass API (south of the border) | roads and buildings in Tijuana | OpenStreetMap, ODbL |
| AWS Terrain Tiles (terrarium, z13) | elevation, about 16 m | public dataset (USGS 3DEP and others) |
| USGS Imagery Only (NAIP), z15 | aerial photos, about 4 m | public domain (none south of the border) |

## Running it

Needs Python 3 with `numpy pillow osmium ijson` (a venv outside the repo is fine) and `osmium-tool` (`brew install osmium-tool`).
Raw downloads and work files go to `$PAO_WORLD_DATA` (default `~/.cache/pw-auto-online/world`), never into the repo.

```bash
cd tools/world
python fetch.py terrain      # ~900 tiles, 60 MB
python fetch.py photo        # ~9,600 tiles, 370 MB (open ocean skipped)
curl -L -o $PAO_WORLD_DATA/raw/socal.osm.pbf https://download.geofabrik.de/north-america/us/california/socal-latest.osm.pbf
osmium extract -b -117.66,32.46,-116.39,33.51 --strategy=complete_ways socal.osm.pbf -o sd.osm.pbf     # in raw/
osmium tags-filter sd.osm.pbf nwr/highway nwr/building nwr/name nwr/natural nwr/landuse nwr/leisure nwr/amenity \
  nwr/water nwr/aeroway nwr/tourism nwr/shop nwr/military nwr/man_made nwr/place nwr/railway -o sdf.osm.pbf
python fetch.py osm          # Tijuana from Overpass, in 8 strips
python osm.py                # -> work/osm.pickle (4-5 minutes)
python osm.py mexico         # adds the strips
python build.py              # -> assets/world/index.json, t/*.json.gz (a few minutes)
python power.py              # -> assets/world/power.json: the transmission lines, towers and poles, substations
python harbor.py             # -> assets/world/harbor.json: marina docks, piers, breakwaters, with their water level
python photos.py             # -> assets/world/p/*.webp, overview.jpg
```

`config.py` has the box (the core's bounds plus 50 km), the tile size and the game's coordinate frame (the same as
`poway-data.js`).

## What's in a tile

`t/<i>_<j>.json.gz` covers x `i*2000 .. +2000`, z `j*2000 .. +2000` (game metres: x east, z south of the origin).
Coordinates are decimetres from the tile corner, delta-coded (each point is the step from the previous one); the file
is gzipped JSON (the game unzips it with `DecompressionStream`).

- `h`: 65 x 65 terrain posts (31.25 m apart), raw metres x 10, each row delta-coded
- `e`: roads owned by the tile, as road-graph edges `[a, b, type, width, oneway, name, points, mph, flags]`; `a`/`b` are
  OpenStreetMap node ids (or `s…` where a road runs onto one of the core's: the game joins those to the core's graph)
- `x`: copies of the neighbours' roads that reach into the tile (for the road surface only)
- `b`: buildings `[height m, kind, footprint, min height]`; `ar`: water, parks, parking, beaches
- `sig`, `stop`, `cr`, `lamp`, `tr`: traffic signals, stop signs, crossings, street lamps, mapped trees

`index.json`: the grid, which tiles exist (bit 1), have land (2) and a photo (4), and the named places for the maps.
Everything inside the core's bounds is left out; road stretches the core already has (its roads stick out past its
edge) are cut where they meet it.
