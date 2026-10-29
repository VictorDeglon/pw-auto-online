# Near tree and shrub meshes

The close-up versions of the scanned plants whose impostors are in `../imp/`. All are built from Poly Haven models,
**CC0 1.0** (public domain, https://polyhaven.com/license):

| Files | Species in the game | Poly Haven model |
| --- | --- | --- |
| `olive.glb` | olive | Island Tree 01 (https://polyhaven.com/a/island_tree_01) |
| `scruboak.glb` | scrub oak | Island Tree 03 (https://polyhaven.com/a/island_tree_03) |
| `jacaranda.glb` | jacaranda | Jacaranda Tree (https://polyhaven.com/a/jacaranda_tree) |
| `slender.glb` | slender young street tree | Tree Small 02 (https://polyhaven.com/a/tree_small_02) |
| `chap_a.glb` … `chap_d.glb` | chaparral shrubs | Searsia Lucida (https://polyhaven.com/a/searsia_lucida) |
| `chapbig_large.glb`, `chapbig_medium.glb`, `chapbig_small.glb` | big chaparral | Searsia Burchellii (https://polyhaven.com/a/searsia_burchellii) |

Built with `tools/nature/bake_all.sh` in Blender (`build_lod.py`: trees 6000-9000 leaves and 4000-6000 wood triangles,
shrubs 1600-2500 leaves), then slimmed with `tools/nature/slim_glb.py` (16-bit positions with KHR_mesh_quantization,
byte normals and colours, normal maps dropped). The coast live oak is grown in code (`src/nature/proctrees.js`).
