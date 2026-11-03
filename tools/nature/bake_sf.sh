#!/bin/bash
# Bake impostors + near LODs for the Sketchfab plants (assets/nature/CREDITS.md): Mexican and California fan palms,
# Canary Island date palms, slender date palms standing in for queen palms, oaks, an Italian cypress, bottlebrush,
# citrus, spineless yucca and prickly pear. Downloads need a Sketchfab sign-in (tools/sketchfab/browser-dl.js, the
# 1K-texture GLB of each); they arrive as sf-<uid>.glb.
#   bake_sf.sh <dir with sf-<uid>.glb> <out_dir>      then: python pack_veg.py <out_dir> assets/nature <species ...>
# Each model is first made a clean, centred source (fit_plant.py, tris 0), so the impostor and the near mesh line up.
set -u
RAW=$1; OUT=$2; HERE=$(cd "$(dirname "$0")" && pwd); mkdir -p "$OUT/src" "$OUT/imp" "$OUT/lod" "$OUT/log"
# variant uid near_tris [near_tex] [impostor_cell]: palms keep 256 px textures near (their fronds are 10-20 m up, and a
# PlantCatalog palm has twenty-odd materials), shrubs bake 128 px impostor views (they're small on screen)
one() {
  local f="$RAW/sf-$2.glb"; [ -f "$f" ] || { echo "missing $1 ($2)"; return; }
  [ -f "$OUT/src/$1.glb" ] || blender -b --python "$HERE/fit_plant.py" -- "$f" "$OUT/src/$1.glb" 0 1024 > "$OUT/log/src_$1.log" 2>&1
  [ -f "$OUT/lod/$1.glb" ] || blender -b --python "$HERE/fit_plant.py" -- "$OUT/src/$1.glb" "$OUT/lod/$1.glb" "$3" "${4:-512}" > "$OUT/log/lod_$1.log" 2>&1
  [ -f "$OUT/imp/$1_alb.png" ] || blender -b --python "$HERE/bake_impostor.py" -- "$OUT/src/$1.glb" "$OUT/imp/$1" '*' "${5:-192}" > "$OUT/log/imp_$1.log" 2>&1
  echo "$1 $(grep -h 'source tris' "$OUT/log/src_$1.log") $(grep -h 'final tris' "$OUT/log/lod_$1.log") $(grep -c wrote "$OUT/log/imp_$1.log") images"; }
one palm_fan_a 5ee9ceea537543c9ba18350f945dad9e 16000 256 192 # Mexican fan palm (Washingtonia robusta), PlantCatalog
one palm_fan_b 00bd2ea54eb1405bb056eac3f1e14673 16000 256 192
one palm_fan_c 3914b6105cd34f54b37181426b167e4c 16000 256 192 # in its skirt of dead fronds
one palm_fan_d 40f72588e90a428abd3bdf206c0e21d6 14000 256 192 # California fan palm (Washingtonia filifera)
one palm_date_a 2b4a6b2b78164048a7fde77c7387735d 20000 256 192 # Canary Island date palm (Phoenix canariensis)
one palm_date_b 53cb8ec923ec431bb8884479c4570ecb 20000 256 192
one palm_queen_a a8706e6ce8f94f26a97329c2f7610384 16000 256 192 # date palm (Phoenix dactylifera), slender: for the queen palms
one palm_queen_b 28fb3114ae82495e859ae3cfda213d19 16000 256 192
one oak_a 3dc59560f2d24345bdbe65c44636453b 18000 512 192 # a broad, gnarled oak (massive-graphism)
one cypress_a 249d8cb553a8469e9d645713f8e96ed1 12000 512 192 # Italian cypress (ElectroNick)
one bottlebrush_a 3c3f5fd64a584b838deeabd204b0dbc3 10000 384 128 # Callistemon laevis, PlantCatalog
one bottlebrush_b 9e7c67d7a5c641ad8e9621719d0bacac 12000 384 128 # Callistemon rigidus
one citrus_a 20190e9590724a81945cd7dbccbc2f1d 12000 384 128 # lemon
one citrus_b cde1925862cf403a84c8a4a409f9b2af 12000 384 128 # sour orange
one yucca_a 266f99b6664348e8a2df538d67f8494e 6000 384 128 # spineless yucca (Yucca elephantipes)
one yucca_b 4c979638fb514601ba1207814d1e54c8 8000 384 128
one opuntia_a fcedb45ec316450f96309ace6b636195 5000 384 128 # Barbary fig (Opuntia ficus-indica)
one opuntia_b 1bf72033680c41508b1ae259b6d61e65 6000 384 128
echo done
