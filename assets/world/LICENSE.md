# The outer world (50 km around Poway)

Built by `tools/world/` (see its README for how). The game's credits name the same sources.

| Files | Made from | Licence |
| --- | --- | --- |
| `t/*.json.gz` (roads, buildings, areas, signals, stop signs, crossings, lamps, trees), `index.json` (places) | OpenStreetMap, through the Geofabrik Southern California extract and the Overpass API | © OpenStreetMap contributors, Open Database License (ODbL 1.0, https://opendatacommons.org/licenses/odbl/). These tiles are a derived database under the same licence. |
| `t/*.json.gz` (terrain heights) | AWS Terrain Tiles (Mapzen terrarium, z13), which in this area come from USGS 3DEP | public dataset; USGS data is public domain |
| `p/*.webp`, `overview.jpg` | USGS Imagery Only (NAIP), z15 | public domain |

Changes: OpenStreetMap ways and footprints were cut to 2 km tiles, simplified, and stored as game coordinates;
photos were reprojected to the same tiles and re-encoded.
