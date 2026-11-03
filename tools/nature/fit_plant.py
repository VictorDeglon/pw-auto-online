# Build a game near LOD (GLB) from a ready-made plant model whose leaves are real geometry or cards already, such as a
# Sketchfab PlantCatalog palm, citrus or yucca (run inside Blender). build_lod.py collapses every leaf island to a card,
# which would wreck a palm frond; this keeps the mesh as it is and decimates it whole.
#   blender -b --python fit_plant.py -- <model.glb|gltf> <out.glb> <tris> [max_tex] [height_m] [pick]
# - every mesh (or those whose name contains pick) joined into one object standing on y = 0, centred; scaled to
#   height_m when given (0: as it is)
# - tris 0: only that (a clean, centred source for bake_impostor.py, so the impostor and the near mesh line up)
# - decimated (collapse) to ~tris triangles if it has more
# - COLOR_0 = ambient occlusion (crown interior and the ground darker), as build_lod.py
# - roughness and metal dropped, alpha-blended parts become alpha-tested, double-sided; textures down to max_tex
import bpy, sys, functools
import numpy as np
print = functools.partial(print, flush=True)

argv = sys.argv[sys.argv.index('--') + 1:]
src, out, tris = argv[0], argv[1], int(argv[2])
max_tex = int(argv[3]) if len(argv) > 3 else 512
height = float(argv[4]) if len(argv) > 4 else 0
pick = argv[5] if len(argv) > 5 else '*'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.data.objects if o.type == 'MESH' and (pick == '*' or pick in o.name)]
assert objs, 'no mesh matched ' + pick
for o in list(bpy.data.objects):
    if o.type != 'MESH': o.select_set(False)
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
for o in objs:  # keep the world transforms of the empties above them
    m = o.matrix_world.copy(); o.parent = None; o.matrix_world = m
if len(objs) > 1: bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o != obj: bpy.data.objects.remove(o)
me = obj.data

co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
lo, hi = co.min(0), co.max(0)  # Blender is z-up
s = height / max(1e-3, hi[2] - lo[2]) if height > 0 else 1.0
co = (co - np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]], np.float32)) * s
me.vertices.foreach_set('co', co.reshape(-1)); me.update()
lo, hi = co.min(0), co.max(0)
t0 = sum(len(p.vertices) - 2 for p in me.polygons)
print('source tris', t0, 'height', float(hi[2] - lo[2]), 'width', float(max(hi[0] - lo[0], hi[1] - lo[1])))
if 0 < tris < t0:
    mod = obj.modifiers.new('dec', 'DECIMATE'); mod.ratio = tris / t0; mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
me = obj.data

if tris == 0:  # the clean source: as it is, textures kept sharp
    for img in bpy.data.images:
        if img.size[0] > max_tex: img.scale(max_tex, max(1, max_tex * img.size[1] // img.size[0]))
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_image_format='AUTO', export_apply=True)
    print('wrote', out); sys.exit(0)

# ---- vertex AO into COLOR_0 (per corner): the crown is the upper part of the plant
lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
vc = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', vc); vc = vc.reshape(-1, 3)
top = vc[vc[:, 2] > lo[2] + (hi[2] - lo[2]) * 0.45]; top = top if len(top) > 50 else vc
C = np.percentile(top, 50, axis=0); C[2] = (np.percentile(top[:, 2], 5) + np.percentile(top[:, 2], 95)) / 2
Rr = np.maximum((np.percentile(top, 97, axis=0) - np.percentile(top, 3, axis=0)) / 2, 0.05)
def ao(p):
    q = (p - C) / Rr; d = np.sqrt((q ** 2).sum(-1))
    a = 0.55 + 0.45 * np.clip((d - 0.25) / 0.75, 0, 1)
    a *= 0.82 + 0.18 * np.clip((p[..., 2] - lo[2]) / max(0.3, hi[2] - lo[2]) * 2.5, 0, 1)
    return np.clip(a, 0.4, 1.0)
a = ao(vc[lv]); col = np.stack([a, a, a, np.ones_like(a)], 1).astype(np.float32)
for c in list(me.color_attributes): me.color_attributes.remove(c)
attr = me.color_attributes.new('Color', 'BYTE_COLOR', 'CORNER'); attr.data.foreach_set('color', col.reshape(-1))
me.color_attributes.active_color = attr
while len(me.uv_layers) > 1: me.uv_layers.remove(me.uv_layers[-1])

for m in me.materials:
    if not m or not m.use_nodes: continue
    nt = m.node_tree; bsdf = next((n for n in nt.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
    if not bsdf: continue
    for k in ('Roughness', 'Metallic', 'Normal'):
        for l in list(bsdf.inputs[k].links): nt.links.remove(l)
    bsdf.inputs['Roughness'].default_value = 0.9; bsdf.inputs['Metallic'].default_value = 0
    m.use_backface_culling = False
    if hasattr(m, 'blend_method'): m.blend_method = 'CLIP' if bsdf.inputs['Alpha'].is_linked else 'OPAQUE'
    if hasattr(m, 'surface_render_method'): m.surface_render_method = 'DITHERED'
    for n in [n for n in nt.nodes if n.bl_idname == 'ShaderNodeTexImage' and not any(o.is_linked for o in n.outputs)]:
        nt.nodes.remove(n)
for img in bpy.data.images:
    if img.size[0] > max_tex: img.scale(max_tex, max(1, max_tex * img.size[1] // img.size[0]))
print('final tris', sum(len(p.vertices) - 2 for p in me.polygons))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_vertex_color='ACTIVE',
                          export_all_vertex_colors=False, export_image_format='JPEG', export_jpeg_quality=85, export_apply=True)
print('wrote', out)
