#!/bin/bash
# Bake impostors + near LODs for every Poly Haven plant used in the game.
# usage: bake_all.sh <raw_dir> <out_dir>    (raw_dir holds Poly Haven glTF downloads, one folder per asset)
set -u
RAW=$1; OUT=$2; HERE=$(cd "$(dirname "$0")" && pwd); mkdir -p "$OUT/imp" "$OUT/lod" "$OUT/log"
imp() { # name model pick cell
  [ -f "$OUT/imp/$1_alb.png" ] || blender -b --python "$HERE/bake_impostor.py" -- "$RAW/$2/$2.gltf" "$OUT/imp/$1" "$3" "$4" > "$OUT/log/imp_$1.log" 2>&1
  echo "imp $1 $(grep -c wrote "$OUT/log/imp_$1.log")"; }
lod() { # name model pick leaves wood_tris scale_max
  [ -f "$OUT/lod/$1.glb" ] || blender -b --python "$HERE/build_lod.py" -- "$RAW/$2/$2.gltf" "$OUT/lod/$1.glb" "$3" "$4" "$5" "$6" > "$OUT/log/lod_$1.log" 2>&1
  echo "lod $1 $(grep 'final tris' "$OUT/log/lod_$1.log")"; }
# trees (planted / riparian)
for t in "oak island_tree_02" "olive island_tree_01" "scruboak island_tree_03" "slender tree_small_02"; do
  set -- $t; imp $1 $2 '*' 192; done
# shrubs: chaparral (Searsia ~ laurel sumac / lemonade berry / toyon), sage scrub (rooibos ~ buckwheat / sagebrush)
for v in large medium small; do imp chapbig_$v searsia_burchellii burchellii_$v 96; done
for v in a b c d; do imp chap_$v searsia_lucida searsia_lucida_$v 96; imp sage_$v wild_rooibos_bush wild_rooibos_bush_$v 96; done
lod oak island_tree_02 '*' 7000 5000 1.5
lod olive island_tree_01 '*' 7000 5000 1.5
lod scruboak island_tree_03 '*' 6000 4000 1.5
lod slender tree_small_02 '*' 6000 4000 1.5
for v in large medium small; do lod chapbig_$v searsia_burchellii burchellii_$v 2500 1200 1.8; done
for v in a b c d; do lod chap_$v searsia_lucida searsia_lucida_$v 1600 800 1.8; lod sage_$v wild_rooibos_bush wild_rooibos_bush_$v 900 500 1.6; done
# procedural species (tools/nature/model_procedural.py): PROC=<dir with <name>_hi.glb + <name>_lod0.glb>
if [ -n "${PROC:-}" ]; then
  for n in palm_fan_a palm_fan_b palm_date_a eucalyptus_a eucalyptus_b opuntia_a opuntia_b yucca_a yucca_b agave_a; do
    [ -f "$PROC/${n}_hi.glb" ] || continue
    [ -f "$OUT/imp/${n}_alb.png" ] || blender -b --python "$HERE/bake_impostor.py" -- "$PROC/${n}_hi.glb" "$OUT/imp/$n" '*' 192 > "$OUT/log/imp_$n.log" 2>&1
    echo "imp $n $(grep -c wrote "$OUT/log/imp_$n.log")"
    [ -f "$OUT/lod/$n.glb" ] || cp "$PROC/${n}_lod0.glb" "$OUT/lod/$n.glb"
  done
fi
# the 3.8M-triangle jacaranda scan is slow to bake; it goes last
imp jacaranda jacaranda_tree '*' 192
lod jacaranda jacaranda_tree '*' 9000 6000 1.8
echo done
