# Near tree meshes

`oak.glb`, `olive.glb` and `scruboak.glb` are the close-up versions of the three tree species whose impostors are in
`../imp/`. They are built from the same Poly Haven models, all **CC0 1.0** (public domain, https://polyhaven.com/license):

| File | Poly Haven model |
| --- | --- |
| `oak.glb` | Island Tree 02 (https://polyhaven.com/a/island_tree_02) |
| `olive.glb` | Island Tree 01 (https://polyhaven.com/a/island_tree_01) |
| `scruboak.glb` | Island Tree 03 (https://polyhaven.com/a/island_tree_03) |

Built with `tools/nature/build_lod.py` in Blender (leaf_keep 3600 / 3600 / 3000, wood 3500 / 3500 / 2600 triangles,
leaf scale cap 1.9), then slimmed with gltf-transform: normal maps dropped, vertex data quantized
(KHR_mesh_quantization), about 0.6 MB each.
