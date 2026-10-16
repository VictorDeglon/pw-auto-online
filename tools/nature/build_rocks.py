# Decimate photoscanned boulders into a 2-LOD GLB each (run inside Blender).
#   blender -b --python build_rocks.py -- <out_dir> <name>=<model.gltf> ...
# Output <out_dir>/<name>.glb with meshes "lod0" (~2500 tris) and "lod1" (~300 tris) sharing one material
# (base colour + normal, textures capped at 1024 px), origin centred on the footprint at the lowest point.
import bpy, sys, functools
print = functools.partial(print, flush=True)
argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]
for spec in argv[1:]:
    name, src = spec.split('=', 1)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    objs = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    import numpy as np
    me = o.data; co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    lo, hi = co.min(0), co.max(0); shift = np.array([-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]])
    co += shift; me.vertices.foreach_set('co', co.reshape(-1)); me.update()
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    o.name = 'lod0'
    lod1 = o.copy(); lod1.data = o.data.copy(); lod1.name = 'lod1'; bpy.context.scene.collection.objects.link(lod1)
    for ob, target in ((o, 2500), (lod1, 300)):
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = min(1.0, target / tris); m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='d')
    for mat in bpy.data.materials:
        if not mat.use_nodes: continue
        nt = mat.node_tree; b = next((n for n in nt.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
        if b:
            for k in ('Roughness', 'Metallic'):
                for l in list(b.inputs[k].links): nt.links.remove(l)
            b.inputs['Roughness'].default_value = 0.85; b.inputs['Metallic'].default_value = 0
        for n in [n for n in nt.nodes if n.bl_idname == 'ShaderNodeTexImage' and not any(x.is_linked for x in n.outputs)]: nt.nodes.remove(n)
    for img in bpy.data.images:
        if img.size[0] > 1024: img.scale(1024, 1024 * img.size[1] // img.size[0])
    bpy.ops.export_scene.gltf(filepath=f'{out}/{name}.glb', export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85, export_apply=True)
    print(name, 'src tris', tris, 'size', (hi - lo).round(2).tolist())
