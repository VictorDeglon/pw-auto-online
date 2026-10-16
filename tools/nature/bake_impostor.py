# Bake hemi-octahedral impostor atlases for vegetation (run inside Blender, Cycles).
#   blender -b --python bake_impostor.py -- <model.gltf|glb> <out_prefix> <obj_substr|*> <cell_px> [G]
# Writes <out_prefix>_alb.png (RGB albedo with baked AO, A coverage) and <out_prefix>_nrm.png
# (camera-space normal per frame, 0.5+0.5n) plus <out_prefix>.json (centre/radius in glTF Y-up space).
# Frame (i, j) of a G x G grid looks at the object from the hemi-octahedral direction decoded from
# ((i+.5)/G, (j+.5)/G); the runtime (src/nature.js) uses the same encode/decode and basis.
import bpy, sys, json, math, functools
print = functools.partial(print, flush=True)
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out, pick, cell = argv[0], argv[1], argv[2], int(argv[3])
G = int(argv[4]) if len(argv) > 4 else 8

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.data.objects if o.type == 'MESH' and (pick == '*' or pick in o.name)]
assert objs, 'no mesh matched ' + pick
for o in bpy.data.objects:
    if o not in objs: bpy.data.objects.remove(o)
# join the picked meshes into one object at the origin (variants are laid out side by side in the source file)
base = objs[0].location.copy()
for o in objs: o.location -= base
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
if len(objs) > 1: bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = obj.data
co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
lo, hi = co.min(0), co.max(0); C = (lo + hi) / 2; R = float(np.sqrt(((co - C) ** 2).sum(1)).max()) * 1.01
print('bounds', lo, hi, 'R', R)

# foliage materials = small mesh islands (leaves); they get a crown-radial normal blend
def island_sizes():
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    seen = np.zeros(len(bm.faces), bool); per = {}
    for f in bm.faces:
        if seen[f.index]: continue
        stack = [f]; seen[f.index] = True; vs = set()
        while stack:
            g = stack.pop()
            for v in g.verts: vs.add(v.index)
            for e in g.edges:
                for h in e.link_faces:
                    if not seen[h.index] and h.material_index == f.material_index: seen[h.index] = True; stack.append(h)
        p = co[list(vs)]; per.setdefault(f.material_index, []).append(float(np.linalg.norm(p.max(0) - p.min(0))))
    bm.free(); return {k: float(np.median(v)) for k, v in per.items()}
isl = island_sizes()
foliage = {me.materials[k].name for k, s in isl.items() if s < 0.25 and me.materials[k] and 'trunk' not in me.materials[k].name}
print('island median size', {me.materials[k].name: round(s, 3) for k, s in isl.items()}, 'foliage', foliage)

# ---- frames: hemi-octahedral directions in glTF space (Y up), converted to Blender (Z up)
def decode(i, j):
    a = (i + 0.5) / G * 2 - 1; b = (j + 0.5) / G * 2 - 1
    x = (a + b) / 2; z = (a - b) / 2; y = 1 - abs(x) - abs(z)
    v = np.array([x, y, z]); return v / np.linalg.norm(v)
def basis(d):
    up = np.array([0.0, 1.0, 0.0]); u = up - d * d.dot(up); u /= np.linalg.norm(u)
    r = np.cross(u, d); return r, u
B = lambda v: Vector((v[0], -v[2], v[1]))           # glTF (x, y, z) -> Blender (x, -z, y)
Cb = B(C)  # NB: C was computed on Blender coords already
Cb = Vector(C.tolist())

S = 2 * R; Xc, Yc, Zc = Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0))
camM = Matrix((Xc, Yc, Zc)).transposed()
for j in range(G):
    for i in range(G):
        d = decode(i, j); r, u = basis(d)
        objM = Matrix((B(r), B(u), B(d))).transposed()     # columns: object-space basis in Blender coords
        M = camM @ objM.transposed()                        # maps B(r)->Xc, B(u)->Yc, B(d)->Zc
        inst = obj if (i, j) == (0, 0) else bpy.data.objects.new(f'f{i}_{j}', me)
        if inst is not obj: bpy.context.scene.collection.objects.link(inst)
        T = Matrix.Translation(Vector(((i - (G - 1) / 2) * S, 0, (j - (G - 1) / 2) * S)))
        inst.matrix_world = T @ M.to_4x4() @ Matrix.Translation(-Cb)

cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = G * S; cam.clip_start = 0.01; cam.clip_end = 4 * R + 100
co_ = bpy.data.objects.new('cam', cam); bpy.context.scene.collection.objects.link(co_)
co_.matrix_world = Matrix.Translation(Vector((0, -(2 * R + 50), 0))) @ Matrix.Rotation(math.radians(90), 4, 'X')
sc = bpy.context.scene; sc.camera = co_
sc.render.engine = 'CYCLES'
# CPU: these are emission-only renders with no bounces, and Cycles' Metal kernel compile takes 10+ minutes
# on a small GPU. Set BAKE_GPU=1 to use Metal anyway.
import os
sc.cycles.device = 'CPU'
if os.environ.get('BAKE_GPU'):
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for dv in prefs.devices: dv.use = True
    sc.cycles.device = 'GPU'
sc.render.threads_mode = 'AUTO'
sc.cycles.samples = 24; sc.cycles.use_denoising = False; sc.cycles.max_bounces = 0
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = G * cell; sc.render.resolution_percentage = 100
sc.render.filter_size = 1.2
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '8'
try:
    sc.display_settings.display_device = 'sRGB'; sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
except Exception as e: print('colour management n/a', e)
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0

def principled(m): return next((n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
def source(sock): return sock.links[0].from_socket if sock.is_linked else None
orig = {}
for m in me.materials:
    p = principled(m); orig[m.name] = (source(p.inputs['Base Color']) if p else None, tuple(p.inputs['Base Color'].default_value) if p else (0.5, 0.5, 0.5, 1))

def set_pass(mode):
    for m in me.materials:
        nt = m.node_tree; N, L = nt.nodes, nt.links
        for n in [n for n in N if n.name.startswith('bk_')]: N.remove(n)
        out = next(n for n in N if n.bl_idname == 'ShaderNodeOutputMaterial'); out.target = 'ALL'
        em = N.new('ShaderNodeEmission'); em.name = 'bk_em'
        src_sock, dflt = orig[m.name]
        if mode == 'alb':
            ao = N.new('ShaderNodeAmbientOcclusion'); ao.name = 'bk_ao'; ao.samples = 16; ao.only_local = True
            ao.inputs['Distance'].default_value = 0.35 * R if m.name in foliage else 0.5
            mix = N.new('ShaderNodeMix'); mix.name = 'bk_mix'; mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 0.7
            if src_sock: L.new(src_sock, mix.inputs['A'])
            else: mix.inputs['A'].default_value = dflt
            L.new(ao.outputs['AO'], mix.inputs['B'])
            L.new(mix.outputs['Result'], em.inputs['Color'])
        else:
            geo = N.new('ShaderNodeNewGeometry'); geo.name = 'bk_geo'
            # flip back-facing normals toward the viewer
            flip = N.new('ShaderNodeMath'); flip.name = 'bk_flip'; flip.operation = 'MULTIPLY_ADD'
            L.new(geo.outputs['Backfacing'], flip.inputs[0]); flip.inputs[1].default_value = -2; flip.inputs[2].default_value = 1
            nf = N.new('ShaderNodeVectorMath'); nf.name = 'bk_nf'; nf.operation = 'SCALE'
            L.new(geo.outputs['Normal'], nf.inputs[0]); L.new(flip.outputs[0], nf.inputs['Scale'])
            n = nf.outputs[0]
            if m.name in foliage:   # crown-radial normal: object-space position minus crown centre, to world
                tc = N.new('ShaderNodeTexCoord'); tc.name = 'bk_tc'
                sub = N.new('ShaderNodeVectorMath'); sub.name = 'bk_sub'; sub.operation = 'SUBTRACT'
                L.new(tc.outputs['Object'], sub.inputs[0]); sub.inputs[1].default_value = Cb + Vector((0, 0, -0.15 * R))
                vt = N.new('ShaderNodeVectorTransform'); vt.name = 'bk_vt'; vt.vector_type = 'NORMAL'; vt.convert_from = 'OBJECT'; vt.convert_to = 'WORLD'
                L.new(sub.outputs[0], vt.inputs[0])
                nr = N.new('ShaderNodeVectorMath'); nr.name = 'bk_nr'; nr.operation = 'NORMALIZE'; L.new(vt.outputs[0], nr.inputs[0])
                mx = N.new('ShaderNodeMix'); mx.name = 'bk_mx'; mx.data_type = 'VECTOR'; mx.inputs['Factor'].default_value = 0.6
                L.new(n, mx.inputs[4]); L.new(nr.outputs[0], mx.inputs[5])
                nn = N.new('ShaderNodeVectorMath'); nn.name = 'bk_nn'; nn.operation = 'NORMALIZE'; L.new(mx.outputs[1], nn.inputs[0]); n = nn.outputs[0]
            tw = N.new('ShaderNodeVectorTransform'); tw.name = 'bk_tw'; tw.vector_type = 'NORMAL'; tw.convert_from = 'WORLD'; tw.convert_to = 'CAMERA'
            L.new(n, tw.inputs[0])
            ma = N.new('ShaderNodeVectorMath'); ma.name = 'bk_ma'; ma.operation = 'MULTIPLY_ADD'
            L.new(tw.outputs[0], ma.inputs[0]); ma.inputs[1].default_value = (0.5, 0.5, -0.5); ma.inputs[2].default_value = (0.5, 0.5, 0.5)
            L.new(ma.outputs[0], em.inputs['Color'])
        L.new(em.outputs[0], out.inputs['Surface'])
        m.blend_method = 'OPAQUE' if hasattr(m, 'blend_method') else None

for mode in ('alb', 'nrm'):
    set_pass(mode)
    if mode == 'nrm':
        try: sc.view_settings.view_transform = 'Raw'
        except Exception: pass
        sc.cycles.samples = 12
    sc.render.filepath = f'{out}_{mode}.png'
    bpy.ops.render.render(write_still=True)
    print('wrote', sc.render.filepath)

# centre/radius in glTF space (Y up) for the runtime
Cg = [float(C[0]), float(C[2]), float(-C[1])]
json.dump({'G': G, 'cell': cell, 'center': Cg, 'radius': R, 'height': float(hi[2] - lo[2]),
           'width': float(max(hi[0] - lo[0], hi[1] - lo[1])), 'base': [float(lo[0]), float(lo[2]), float(-hi[1])]},
          open(out + '.json', 'w'))
