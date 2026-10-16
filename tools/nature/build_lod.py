# Build a game-ready near LOD (GLB) from a high-detail Poly Haven plant (run inside Blender).
#   blender -b --python build_lod.py -- <model.gltf> <out.glb> <obj_substr|*> <leaf_keep> <wood_tris> [leaf_scale_max] [max_tex]
# leaf_keep <= 1 is a fraction of leaves to keep, > 1 a target leaf count.
# - every connected mesh island is classed as foliage (small: leaves/twigs) or wood (trunk, branches)
# - wood islands smaller than 2.5% of the plant are dropped, the rest decimated to ~wood_tris
# - each kept foliage island collapses to a 2-triangle "leaf" (base, side, tip, side) with its original UVs;
#   a random leaf_keep fraction survives, scaled up by 1/sqrt(leaf_keep) (capped) to keep the canopy density
# - COLOR_0 = baked ambient occlusion (crown interior and the ground darker); leaf normals point out of the crown
import bpy, bmesh, sys, math, functools
import numpy as np
print = functools.partial(print, flush=True)

argv = sys.argv[sys.argv.index('--') + 1:]
src, out, pick, keep, wood_tris = argv[0], argv[1], argv[2], float(argv[3]), int(argv[4])
scale_max = float(argv[5]) if len(argv) > 5 else 1.6
max_tex = int(argv[6]) if len(argv) > 6 else 512
rng = np.random.default_rng(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.data.objects if o.type == 'MESH' and (pick == '*' or pick in o.name)]
assert objs, 'no mesh matched ' + pick
for o in list(bpy.data.objects):
    if o not in objs: bpy.data.objects.remove(o)
base = objs[0].location.copy()
for o in objs: o.location -= base
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
if len(objs) > 1: bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = obj.data; mats = list(me.materials)

# ---- mesh arrays
nv, nf = len(me.vertices), len(me.polygons)
co = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
loop_v = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', loop_v)
ls = np.empty(nf, np.int32); me.polygons.foreach_get('loop_start', ls)
lt = np.empty(nf, np.int32); me.polygons.foreach_get('loop_total', lt)
fm = np.empty(nf, np.int32); me.polygons.foreach_get('material_index', fm)
uvl = me.uv_layers.active
uv = np.empty(len(me.loops) * 2, np.float32); uvl.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
vuv = np.zeros((nv, 2), np.float32); vuv[loop_v] = uv   # per-vertex uv (seams are rare inside a leaf)
lo, hi = co.min(0), co.max(0); size = float(np.linalg.norm(hi - lo))
print('verts', nv, 'faces', nf, 'size', size)

# ---- connected components over vertices (label propagation with pointer jumping)
fidx = np.repeat(np.arange(nf), lt)
a_ = loop_v; b_ = np.empty_like(loop_v)
nxt = np.arange(len(loop_v)) + 1; last = ls + lt - 1; nxt[last] = ls   # next loop in the same polygon
b_ = loop_v[nxt]
lab = np.arange(nv)
for it in range(400):
    m = np.minimum(lab[a_], lab[b_])
    new = lab.copy(); np.minimum.at(new, a_, m); np.minimum.at(new, b_, m)
    new = new[new]; new = new[new]
    if np.array_equal(new, lab): break
    lab = new
_, comp = np.unique(lab, return_inverse=True); ncomp = comp.max() + 1
print('islands', ncomp, 'iterations', it)
order = np.argsort(comp, kind='stable'); starts = np.searchsorted(comp[order], np.arange(ncomp + 1))
cmin = np.full((ncomp, 3), np.inf, np.float32); cmax = np.full((ncomp, 3), -np.inf, np.float32)
np.minimum.at(cmin, comp, co); np.maximum.at(cmax, comp, co)
diag = np.linalg.norm(cmax - cmin, axis=1)
fcomp = comp[loop_v[ls]]
# majority material per island
cm = np.zeros(ncomp, np.int32); cm[fcomp] = fm
leafy_mat = np.array([('leaf' in (m.name.lower() if m else '') or 'twig' in (m.name.lower() if m else '')) for m in mats])
foliage = (diag < max(0.06 * size, 0.12)) & ((diag < 0.35) | leafy_mat[cm])
foliage &= ~np.array([('trunk' in (mats[k].name.lower() if mats[k] else '')) for k in cm])
print('foliage islands', int(foliage.sum()), 'wood islands', int((~foliage).sum()))

# crown ellipsoid from foliage vertices
fv = co[foliage[comp]] if foliage.any() else co
C = np.percentile(fv, 50, axis=0); C[2] = (np.percentile(fv[:, 2], 5) + np.percentile(fv[:, 2], 95)) / 2
Rr = np.maximum((np.percentile(fv, 97, axis=0) - np.percentile(fv, 3, axis=0)) / 2, 0.05)
def ao(p):
    q = (p - C) / Rr; d = np.sqrt((q ** 2).sum(-1))
    a = 0.5 + 0.5 * np.clip((d - 0.25) / 0.75, 0, 1)                  # interior of the crown is darker
    a *= 0.82 + 0.18 * np.clip((p[..., 2] - lo[2]) / max(0.3, hi[2] - lo[2]) * 2.5, 0, 1)  # and the bottom
    return np.clip(a, 0.35, 1.0)

# ---- wood: delete foliage + tiny islands from the original object, then decimate
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
drop_wood = (~foliage) & (diag < 0.025 * size)
kill = [bm.faces[i] for i in np.nonzero(foliage[fcomp] | drop_wood[fcomp])[0]]
bmesh.ops.delete(bm, geom=kill, context='FACES')
bm.to_mesh(me); bm.free()
wt = sum(len(p.vertices) - 2 for p in me.polygons)
if wt > wood_tris:
    mod = obj.modifiers.new('dec', 'DECIMATE'); mod.ratio = wood_tris / wt; mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
print('wood tris', wt, '->', sum(len(p.vertices) - 2 for p in me.polygons))

# ---- foliage: one rhombus per kept island
if keep > 1: keep = min(1.0, keep / max(1, int(foliage.sum())))
keep_mask = foliage & (rng.random(ncomp) < keep)
s = min(scale_max, 1 / math.sqrt(max(keep, 1e-3)))
P, U, M, Nrm = [], [], [], []
for c in np.nonzero(keep_mask)[0]:
    vi = order[starts[c]:starts[c + 1]]
    p = co[vi]; cen = p.mean(0)
    t1 = np.argmax(((p - cen) ** 2).sum(1)); t0 = np.argmax(((p - p[t1]) ** 2).sum(1))
    ax = p[t1] - p[t0]; L = np.linalg.norm(ax)
    if L < 1e-5: continue
    ax /= L; rel = p - p[t0]; perp = rel - np.outer(rel @ ax, ax); pd = np.linalg.norm(perp, axis=1)
    s1 = np.argmax(pd); side = perp[s1] / max(pd[s1], 1e-6); s2 = np.argmin(perp @ side)
    q = np.stack([p[t0], p[s1], p[t1], p[s2]]); q = cen + (q - cen) * s
    quv = vuv[vi[[t0, s1, t1, s2]]]
    rad = cen - C; rad /= (np.linalg.norm(rad) + 1e-6)
    fn = np.cross(q[2] - q[0], q[1] - q[3]); fn /= (np.linalg.norm(fn) + 1e-6)
    if fn @ rad < 0: fn = -fn
    n = 0.68 * rad + 0.32 * fn; n /= np.linalg.norm(n)
    P.append(q); U.append(quv); M.append(cm[c]); Nrm.append(n)
print('leaf cards', len(P), 'scale', round(s, 2))

wood = obj
leaf_me = bpy.data.meshes.new('leaves')
if P:
    P = np.array(P, np.float32); U = np.array(U, np.float32); n = len(P)
    leaf_me.vertices.add(n * 4); leaf_me.vertices.foreach_set('co', P.reshape(-1))
    leaf_me.loops.add(n * 6); leaf_me.polygons.add(n * 2)
    tri = np.array([0, 1, 2, 0, 2, 3]); vidx = (np.arange(n)[:, None] * 4 + tri).reshape(-1)
    leaf_me.loops.foreach_set('vertex_index', vidx)
    leaf_me.polygons.foreach_set('loop_start', np.arange(n * 2) * 3); leaf_me.polygons.foreach_set('loop_total', np.full(n * 2, 3))
    leaf_me.polygons.foreach_set('material_index', np.repeat(np.array(M), 2))
    leaf_me.update(); leaf_me.validate()
    luv = leaf_me.uv_layers.new(name='UVMap'); luv.data.foreach_set('uv', U[np.arange(n)[:, None], tri].reshape(-1))
    for m in mats: leaf_me.materials.append(m)
    leaf_me.normals_split_custom_set([tuple(v) for v in np.repeat(np.array(Nrm), 6, axis=0)]) if hasattr(leaf_me, 'normals_split_custom_set') else None
    lo_ = bpy.data.objects.new('leaves', leaf_me); bpy.context.scene.collection.objects.link(lo_)
    bpy.ops.object.select_all(action='DESELECT'); lo_.select_set(True); wood.select_set(True)
    bpy.context.view_layer.objects.active = wood; bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active; me = obj.data

# ---- vertex AO into COLOR_0 (per corner, byte colour)
lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
vc = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', vc); vc = vc.reshape(-1, 3)
a = ao(vc[lv]); col = np.stack([a, a, a, np.ones_like(a)], 1).astype(np.float32)
attr = me.color_attributes.new('Color', 'BYTE_COLOR', 'CORNER'); attr.data.foreach_set('color', col.reshape(-1))
# trim materials: drop roughness/metal + leaf normal maps (keeps the GLB small); leaves double-sided
for m in me.materials:
    if not m or not m.use_nodes: continue
    nt = m.node_tree; bsdf = next((n for n in nt.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
    if not bsdf: continue
    for k in ('Roughness', 'Metallic'):
        for l in list(bsdf.inputs[k].links): nt.links.remove(l)
    bsdf.inputs['Roughness'].default_value = 0.9; bsdf.inputs['Metallic'].default_value = 0
    if 'leaf' in m.name.lower() or 'leaves' in m.name.lower() or 'twig' in m.name.lower():
        for l in list(bsdf.inputs['Normal'].links): nt.links.remove(l)
    m.use_backface_culling = False
    if hasattr(m, 'blend_method'): m.blend_method = 'OPAQUE'
    if hasattr(m, 'surface_render_method'): m.surface_render_method = 'DITHERED'
# remove now-unused image nodes so they are not exported
for m in me.materials:
    if not m or not m.use_nodes: continue
    for n in [n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeTexImage' and not any(o.is_linked for o in n.outputs)]:
        m.node_tree.nodes.remove(n)
for img in bpy.data.images:
    if img.size[0] > max_tex: img.scale(max_tex, max_tex * img.size[1] // img.size[0])
print('final tris', sum(len(p.vertices) - 2 for p in me.polygons))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_vertex_color='ACTIVE',
                          export_all_vertex_colors=False, export_image_format='JPEG', export_jpeg_quality=85, export_apply=True)
print('wrote', out)
