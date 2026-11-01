# Fits one downloaded Sketchfab model for the game (Blender, no window):
#   blender -b --factory-startup --python tools/sketchfab/fit.py -- <in.glb> <out.glb> <kind> '<opts json>' <report.json> [preview.png]
# kinds: car (wheels split out, +z forward, Kenney-style node names), person (rig and animations kept), anything else
# is a static thing (one mesh, grounded, centred).
# opts: tris (target triangles), tex (largest texture side), size ([how, metres]: 'l' longest side across the ground,
#       'h' height; a model already that size in metres keeps its own scale), draco (default true)
# Every model comes out at real size in metres, standing on y = 0, centred on x/z, textures as WebP, meshes Draco-packed.
# The report says what was found (size, wheels and axles, the paint, which end is the front and how sure that is) so
# the game's catalogue can be built from it; the preview is a small render for checking by eye.
import bpy, bmesh, sys, json, math, re
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, DST, KIND, OPT, REP = argv[0], argv[1], argv[2], json.loads(argv[3]), argv[4]
PREV = argv[5] if len(argv) > 5 else None
warn = []

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
for o in list(bpy.data.objects):
    if o.type in ('CAMERA', 'LIGHT', 'LIGHT_PROBE', 'SPEAKER'): bpy.data.objects.remove(o)

def meshes(): return [o for o in bpy.data.objects if o.type == 'MESH']
def select(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)

def world_verts(o):
    co = np.empty(len(o.data.vertices) * 3, np.float32); o.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    if not len(co): return co
    m = np.array(o.matrix_world); return co @ m[:3, :3].T + m[:3, 3]

def bbox(objs):
    lo, hi = np.full(3, 1e18), np.full(3, -1e18)
    for o in objs:
        v = world_verts(o)
        if len(v): lo = np.minimum(lo, v.min(0)); hi = np.maximum(hi, v.max(0))
    return lo, hi

def tris(objs): return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)

# ---------------------------------------------------------------- flatten: modifiers applied, no parents, no transforms
def flatten(keep_rig=False):
    for o in list(bpy.data.objects):
        if o.type in ('CURVE', 'SURFACE', 'META', 'FONT'):
            select([o]); bpy.ops.object.convert(target='MESH')
    ms = meshes()
    if not keep_rig:
        select(ms); bpy.ops.object.make_single_user(object=True, obdata=True)
        for o in ms:
            if o.data.shape_keys: o.shape_key_clear()
        select(ms); bpy.ops.object.convert(target='MESH')  # bakes the armature pose and every other modifier
        select(meshes()); bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
        for o in list(bpy.data.objects):
            if o.type != 'MESH': bpy.data.objects.remove(o)
        select(meshes()); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(meshes()):
        if not len(o.data.polygons): bpy.data.objects.remove(o)

def drop_floor(objs, flat=0.02, wide=1.25):
    """A showroom floor, turntable or backdrop under the model: flat and wider than everything else."""
    out = []
    for o in objs:
        lo, hi = bbox([o]); ext = hi - lo
        rest = [p for p in objs if p is not o]
        if not rest: continue
        rlo, rhi = bbox(rest); rext = rhi - rlo
        if ext[2] < flat * max(rext) and ext[0] > wide * rext[0] and ext[1] > wide * rext[1]: out.append(o)
        elif ext[0] > 3 * rext[0] and ext[1] > 3 * rext[1]: out.append(o)  # a backdrop dome or room
    for o in out: warn.append(f'dropped floor/backdrop {o.name}'); bpy.data.objects.remove(o)

def ground_sheets(objs):
    """Flat sheets at the very bottom about as big as the model: a floor or a baked shadow (the game draws its own)."""
    lo, hi = bbox(objs); ext = hi - lo
    for o in list(objs):
        if not len(o.data.polygons): continue
        isl = islands(o); e = isl['hi'] - isl['lo']
        flat = (e[:, 2] <= 0.005 * max(ext)) & (isl['lo'][:, 2] <= lo[2] + 0.03 * ext[2]) & (e[:, 0] >= 0.5 * ext[0]) & (e[:, 1] >= 0.5 * ext[1])
        if not flat.any(): continue
        pc = np.searchsorted(isl['ids'], isl['poly'])
        p = split_faces(o, flat[pc], 'ground')
        if p: warn.append(f'dropped ground/shadow sheet from {o.name}'); bpy.data.objects.remove(p)

def island_table(objs):
    """every loose part of every mesh: (object, part index per face, lo, hi, area per part)"""
    rows = []
    for o in objs:
        n = len(o.data.polygons)
        if not n: continue
        isl = islands(o)
        ar = np.empty(n, np.float32); o.data.polygons.foreach_get('area', ar)
        idx = np.searchsorted(isl['ids'], isl['poly'])
        rows.append((o, idx, isl['lo'], isl['hi'], np.bincount(idx, weights=ar, minlength=len(isl['ids']))))
    return rows

def drop_parts(o, idx, kill, why):
    p = split_faces(o, kill[idx], 'junk')
    if p: warn.append(why); bpy.data.objects.remove(p)
    if not len(o.data.polygons): bpy.data.objects.remove(o)

def clean_parts(base=True, copies=True):
    """loose parts that aren't the model: the stage or floor it stands on; a second copy beside it or bits floating
    away from it (along each ground axis the parts fall into groups with clear gaps between; the biggest group stays)"""
    rows = island_table(meshes())
    if not rows: return
    if base:
        LO = np.min([r[2].min(0) for r in rows], 0); HI = np.max([r[3].max(0) for r in rows], 0); E = HI - LO
        cand = [((r[3] - r[2])[:, 2] < 0.3 * E[2]) & ((r[3] - r[2])[:, 0] >= 0.85 * E[0]) & ((r[3] - r[2])[:, 1] >= 0.85 * E[1]) for r in rows]
        rest = [r[2][~c] for r, c in zip(rows, cand) if (~c).any()]
        if any(c.any() for c in cand) and rest:
            rlo = np.min([x.min(0) for x in rest], 0); rhi = np.max([r[3][~c].max(0) for r, c in zip(rows, cand) if (~c).any()], 0)
            for r, c in zip(rows, cand):
                kill = c & (r[3][:, 2] <= rlo[2] + 0.05 * (rhi[2] - rlo[2]))
                if kill.any(): drop_parts(r[0], r[1], kill, f'dropped a stage/floor under the model ({r[0].name})')
        rows = island_table(meshes())
    if copies:
        for ax in (0, 1):
            parts = [(r[2][j, ax], r[3][j, ax], r[4][j], i, j) for i, r in enumerate(rows) for j in range(len(r[4]))]
            parts.sort(key=lambda t: t[0]); groups = []
            for lo_, hi_, a, i, j in parts:
                if groups and lo_ <= groups[-1]['hi']: g = groups[-1]; g['hi'] = max(g['hi'], hi_); g['a'] += a; g['m'].append((i, j))
                else: groups.append({ 'lo': lo_, 'hi': hi_, 'a': a, 'm': [(i, j)] })
            if len(groups) < 2: continue
            main = max(groups, key=lambda g: g['a']); size = main['hi'] - main['lo']
            gone = []
            for g in groups:
                if g is main: continue
                gap = g['lo'] - main['hi'] if g['lo'] > main['hi'] else main['lo'] - g['hi']
                if gap > 0.05 * size: gone += g['m']
            if not gone: continue
            for i, r in enumerate(rows):
                kill = np.zeros(len(r[4]), bool)
                for gi, gj in gone:
                    if gi == i: kill[gj] = True
                if kill.any(): drop_parts(r[0], r[1], kill, f'dropped parts set apart from the model ({r[0].name})')
            rows = island_table(meshes())

def see_through_effects():
    """smoke, light beams, glow cards: see-through, not glass, and reaching well outside the solid model"""
    solid, clear = [], {}
    for o in meshes():
        n = len(o.data.polygons)
        if not n: continue
        me = o.data; v = world_verts(o)
        mi = np.empty(n, np.int32); me.polygons.foreach_get('material_index', mi)
        lt = np.empty(n, np.int64); me.polygons.foreach_get('loop_total', lt)
        lv = np.empty(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
        for i, sl in enumerate(o.material_slots):
            m = sl.material; sel = mi == i
            if not sel.any(): continue
            pts = v[np.unique(lv[np.repeat(sel, lt)])]
            if m and mat_info(m)['alpha'] < 0.6 and not GLASS_RE.search(m.name): clear.setdefault(m.name, []).append(pts)
            else: solid.append(pts)
    if not solid or not clear: return
    s = np.concatenate(solid); slo, shi = s.min(0), s.max(0); pad = 0.05 * (shi - slo).max()
    for nm, pts in clear.items():
        p = np.concatenate(pts)
        if (p.min(0) < slo - pad).any() or (p.max(0) > shi + pad).any():
            drop_material(bpy.data.materials[nm]); warn.append(f'dropped see-through effect {nm}')

def strays(objs, k=2.5):
    """Bits far from the model (a second copy, a logo card, a light rig)."""
    lo, hi = bbox(objs); size = max(hi - lo)
    cs = [(o, (lambda b: (b[0] + b[1]) / 2)(bbox([o]))) for o in objs]
    med = np.median(np.array([c for _, c in cs]), axis=0)
    for o, c in cs:
        if np.linalg.norm((c - med)[:2]) > k * size / 3 and len(objs) > 2: warn.append(f'dropped stray {o.name}'); bpy.data.objects.remove(o)

# ---------------------------------------------------------------- textures and size
def to_rgba(im):
    """a full RGBA copy of a palette or grey PNG (8 bits a pixel), which Blender's WebP writer can't save"""
    w, h = im.size
    px = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(px)
    new = bpy.data.images.new(im.name + '_rgba', w, h, alpha=True)
    new.colorspace_settings.name = im.colorspace_settings.name; new.alpha_mode = im.alpha_mode
    new.pixels.foreach_set(px); new.pack(); im.user_remap(new)

def shrink_textures(maxside):
    for im in list(bpy.data.images):
        if im.size[0] and im.size[1] and not im.is_float and im.depth < 24:
            try: to_rgba(im)
            except Exception as e: warn.append(f'texture {im.name}: {e}')
    for im in bpy.data.images:
        if im.size[0] == 0 or im.size[1] == 0 or not im.users: continue
        w, h = im.size; s = maxside / max(w, h)
        if s < 1:
            try: im.scale(max(4, int(w * s)), max(4, int(h * s)))
            except Exception as e: warn.append(f'texture {im.name}: {e}')

def decimate(objs, target):
    total = tris(objs)
    if total <= target: return total
    r = max(0.02, target / total)
    for o in objs:
        if len(o.data.polygons) < 120: continue
        m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = r; m.use_collapse_triangulate = True
        select([o]); bpy.ops.object.modifier_apply(modifier=m.name)
    return tris(objs)

def plausible_scale(native, target):
    """Keep a model's own units when they already read as metres near the target; else scale to the target."""
    for unit in (1, 0.01, 0.001, 0.1, 0.0254, 1 / 39.37):
        if 0.6 * target <= native * unit <= 1.6 * target: return unit
    return target / native

def scale_all(objs, s):
    for o in objs: o.scale = (s, s, s)
    select(objs); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

def scale_about_ground(objs, s):
    """like scale_all, but origins move too (a wheel's origin is its hub)"""
    for o in objs: o.location = o.location * s; o.scale = (s, s, s)
    select(objs); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

def ground_centre(objs):
    lo, hi = bbox(objs); c = (lo + hi) / 2
    for o in objs: o.location = (o.location[0] - c[0], o.location[1] - c[1], o.location[2] - lo[2])
    select(objs); bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

def rotate_z(objs, ang):
    for o in objs: o.matrix_world = Matrix.Rotation(ang, 4, 'Z') @ o.matrix_world
    select(objs); bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)

# ---------------------------------------------------------------- materials
def principled(mat):
    if not mat or not mat.use_nodes: return None
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED': return n
    return None

def mat_info(mat):
    n = principled(mat); col, tex, emis, alpha = (0.8, 0.8, 0.8), False, 0.0, 1.0
    if n:
        bc = n.inputs['Base Color']; col = tuple(bc.default_value[:3]); tex = bc.is_linked
        e = n.inputs.get('Emission Strength'); ec = n.inputs.get('Emission Color')
        if e and ec: emis = e.default_value * max(ec.default_value[:3]) if not ec.is_linked else e.default_value
        a = n.inputs.get('Alpha'); alpha = a.default_value if a and not a.is_linked else (0.5 if a and a.is_linked else 1.0)
        tr = n.inputs.get('Transmission Weight')
        if tr and tr.default_value > 0.5: alpha = min(alpha, 0.3)
    return { 'col': col, 'tex': tex, 'emis': emis, 'alpha': alpha }

def area_by_material(objs, region=None):
    """surface area per material slot name (optionally only faces whose centre passes region(x, y, z))"""
    out = {}
    for o in objs:
        me = o.data; n = len(me.polygons)
        if not n: continue
        ar = np.empty(n, np.float32); me.polygons.foreach_get('area', ar)
        mi = np.empty(n, np.int32); me.polygons.foreach_get('material_index', mi)
        if region is not None:
            ce = np.empty(n * 3, np.float32); me.polygons.foreach_get('center', ce); ce = ce.reshape(-1, 3)
            ar = ar * region(ce)
        for i, slot in enumerate(o.material_slots):
            if slot.material: out[slot.material.name] = out.get(slot.material.name, 0) + float(ar[mi == i].sum())
    return out

def centroid_y(objs, test):
    """area-weighted mean y of the faces whose material or object name passes test(name)"""
    s, w = 0.0, 0.0
    for o in objs:
        me = o.data; n = len(me.polygons)
        if not n: continue
        ar = np.empty(n, np.float32); me.polygons.foreach_get('area', ar)
        ce = np.empty(n * 3, np.float32); me.polygons.foreach_get('center', ce); ce = ce.reshape(-1, 3)
        mi = np.empty(n, np.int32); me.polygons.foreach_get('material_index', mi)
        on = test(o.name)
        sel = np.zeros(n, bool)
        for i, slot in enumerate(o.material_slots):
            if on or (slot.material and test(slot.material.name)): sel |= mi == i
        if on and not o.material_slots: sel[:] = True
        s += float((ce[sel, 1] * ar[sel]).sum()); w += float(ar[sel].sum())
    return (s / w, w) if w > 0 else (None, 0)

# ---------------------------------------------------------------- islands (loose parts) of a mesh
def islands(o):
    me = o.data; nv = len(me.vertices)
    ev = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get('vertices', ev); ev = ev.reshape(-1, 2)
    lab = np.arange(nv)
    for _ in range(200):
        m = np.minimum(lab[ev[:, 0]], lab[ev[:, 1]])
        new = lab.copy(); np.minimum.at(new, ev[:, 0], m); np.minimum.at(new, ev[:, 1], m)
        new = new[new]
        if np.array_equal(new, lab): break
        lab = new
    ls = np.empty(len(me.polygons), np.int64); me.polygons.foreach_get('loop_start', ls)
    lv = np.empty(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    pl = lab[lv[ls]]
    co = world_verts(o)
    ids, inv = np.unique(lab, return_inverse=True)
    lo = np.full((len(ids), 3), 1e18); hi = np.full((len(ids), 3), -1e18)
    np.minimum.at(lo, inv, co); np.maximum.at(hi, inv, co)
    return { 'poly': pl, 'ids': ids, 'lo': lo, 'hi': hi }

def split_faces(o, mask, name):
    """move the faces where mask is true into a new object"""
    if not mask.any(): return None
    select([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    o.data.polygons.foreach_set('select', mask.astype(bool))
    before = set(bpy.data.objects)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='FACE'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    new = [p for p in bpy.data.objects if p not in before]
    if not new: return None
    new[0].name = name; return new[0]

def split_labels(o, labels, names):
    """move the faces labelled i into a new object names[i]; a face attribute carries the labels through each split"""
    out = {}
    if not (labels >= 0).any(): return out
    o.data.attributes.new('wk', 'INT', 'FACE').data.foreach_set('value', labels.astype(np.int32))
    for i, name in enumerate(names):
        cur = np.empty(len(o.data.polygons), np.int32); o.data.attributes['wk'].data.foreach_get('value', cur)
        p = split_faces(o, cur == i, name)
        if p: out[i] = p
    for x in [o] + list(out.values()):
        a = x.data.attributes.get('wk')
        if a: x.data.attributes.remove(a)
    return out

def drop_material(m):
    """delete the faces that use material m"""
    for o in list(meshes()):
        idx = [i for i, sl in enumerate(o.material_slots) if sl.material is m]
        if not idx: continue
        mi = np.empty(len(o.data.polygons), np.int32); o.data.polygons.foreach_get('material_index', mi)
        p = split_faces(o, np.isin(mi, idx), 'shell')
        if p: bpy.data.objects.remove(p)

def roof_height(objs):
    """height under which 99.5% of the surface lies: the roof, not an antenna or a whip"""
    zs, ws = [], []
    for o in objs:
        n = len(o.data.polygons)
        if not n: continue
        ar = np.empty(n, np.float32); o.data.polygons.foreach_get('area', ar)
        ce = np.empty(n * 3, np.float32); o.data.polygons.foreach_get('center', ce)
        zs.append(ce.reshape(-1, 3)[:, 2]); ws.append(ar)
    z = np.concatenate(zs); w = np.concatenate(ws); i = np.argsort(z); cw = np.cumsum(w[i])
    lo, hi = bbox(objs)
    return float(min(hi[2], z[i][np.searchsorted(cw, 0.995 * cw[-1])] + 0.02) - lo[2])

def join(objs, name):
    objs = [o for o in objs if o and o.name in bpy.data.objects]
    if not objs: return None
    select(objs, objs[0]);
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = name; o.data.name = name; return o

def origin_to_centre(o):
    lo, hi = bbox([o]); c = (lo + hi) / 2
    o.data.transform(Matrix.Translation(Vector(-c))); o.location = Vector(c); return c

# ---------------------------------------------------------------- cars
WHEEL_RE = re.compile(r'wheel|tire|tyre|\brims?\b|rim[_\.\d]|felge|reifen|rueda|llanta|pneu|roue|brake|caliper|\bdis[ck]\b|\bhub\b|lug|tread', re.I)
NOT_WHEEL = re.compile(r'steer|spare|volant|lenkrad|arch|well|fender|guard|cover|interior|dash', re.I)
FRONT_RE = re.compile(r'head.?l|headlamp|head_lamp|grill|grille|front|hood|bonnet|windshield|windscreen|frontal|avant|vorne|delanter|bumper_?f\b|f_?bumper|fog', re.I)
REAR_RE = re.compile(r'tail.?l|taillight|rear|trunk|\bboot\b|exhaust|muffler|tail.?pipe|\bback|heck|hinten|traser|arriere|bumper_?r\b|r_?bumper|licen[cs]e.?plate_?r|reverse', re.I)
STEER_RE = re.compile(r'steer|volant|lenkrad|volante', re.I)
GLASS_RE = re.compile(r'glass|window|windshield|windscreen|vidrio|scheibe|verre|cristal|vetro', re.I)
HEAD_RE = re.compile(r'head.?l|headlamp|front.?light|light.?f\b|lamp.?front|fog', re.I)
TAIL_RE = re.compile(r'tail.?l|taillight|rear.?light|brake.?l|stop.?l|light.?r\b|lamp.?rear|reverse', re.I)
PAINT_RE = re.compile(r'paint|carpaint|car_paint|\bbody|body_?col|exterior|kaross|lack|chassis|\bshell|livery|colou?r', re.I)
NOT_PAINT = re.compile(r'glass|window|chrome|tire|tyre|rubber|interior|seat|black|plastic|light|lamp|rim|wheel|grill|metal|carbon|mirror|plate|badge|logo|emblem|leather|dash|engine|under|brake|exhaust|shadow', re.I)

def fit_car():
    flatten()
    ms = meshes(); drop_floor(ms); strays(meshes()); see_through_effects(); ground_sheets(meshes()); clean_parts()
    ms = meshes(); lo, hi = bbox(ms); ext = hi - lo
    if ext[2] > max(ext[0], ext[1]): warn.append('taller than long: lying on its side?')
    if ext[0] > ext[1]: rotate_z(ms, math.pi / 2)  # length along y
    ms = meshes(); lo, hi = bbox(ms)
    unit = plausible_scale(hi[1] - lo[1], OPT.get('len', 4.6)); scale_all(ms, unit)
    ground_centre(meshes())
    ms = meshes(); lo, hi = bbox(ms); L, W, H = hi[1] - lo[1], hi[0] - lo[0], hi[2] - lo[2]

    # which end is the front: names, lamps, the steering wheel. votes > 0: front at -y
    votes = []
    def vote(test, sign, weight, why):
        y, a = centroid_y(ms, test)
        if y is None or abs(y) < 0.04 * L: return
        votes.append((why, weight * (1 if (y < 0) == (sign > 0) else -1)))
    vote(lambda n: bool(FRONT_RE.search(n)) and not REAR_RE.search(n), 1, 1.0, 'front names')
    vote(lambda n: bool(REAR_RE.search(n)) and not FRONT_RE.search(n), -1, 1.0, 'rear names')
    vote(lambda n: bool(STEER_RE.search(n)), 1, 1.5, 'steering wheel')
    share = area_by_material(ms); share_tot = sum(share.values()) or 1
    def red_lamp(n):  # small: a red car's paint is red too
        m = bpy.data.materials.get(n)
        if not m or share.get(n, 0) > 0.03 * share_tot: return False
        i = mat_info(m); r, g, b = i['col']; return r > 0.35 and g < 0.18 and b < 0.18 and (i['emis'] > 0.1 or TAIL_RE.search(n))
    vote(red_lamp, -1, 1.2, 'red lamps')
    vote(lambda n: bool(HEAD_RE.search(n)), 1, 1.2, 'headlamps')
    score = sum(v for _, v in votes)
    if OPT.get('flip'): score, votes = -(score or 1), votes + [('checked by eye', 0)]  # tools/sketchfab/flips.json
    if score < 0: rotate_z(meshes(), math.pi); ms = meshes()
    conf = abs(score)

    # wheels: named parts, else round parts standing at the four corners
    corners = { 'front-left': (1, -1), 'front-right': (-1, -1), 'back-left': (1, 1), 'back-right': (-1, 1) }  # (sign x, sign y); front is -y, left is +x
    groups = { k: [] for k in corners }
    wheel = {}
    def corner_of(c):
        if abs(c[1]) < 0.12 * L or abs(c[0]) < 0.08 * W or c[2] > 0.5 * H: return None
        for k, (sx, sy) in corners.items():
            if np.sign(c[0]) == sx and np.sign(c[1]) == sy: return k
    named = [o for o in meshes() if (WHEEL_RE.search(o.name) or any(s.material and WHEEL_RE.search(s.material.name) for s in o.material_slots)) and not NOT_WHEEL.search(o.name)]
    # (1) named: islands of the named objects (or of the named material's faces) go to their corner
    for o in named:
        if not len(o.data.polygons): continue
        isl = islands(o); ce = (isl['lo'] + isl['hi']) / 2
        mi = np.empty(len(o.data.polygons), np.int32); o.data.polygons.foreach_get('material_index', mi)
        onmat = np.zeros(len(mi), bool)
        if not WHEEL_RE.search(o.name) or NOT_WHEEL.search(o.name):
            for i, s in enumerate(o.material_slots):
                if s.material and WHEEL_RE.search(s.material.name): onmat |= mi == i
        else: onmat[:] = True
        pc = np.searchsorted(isl['ids'], isl['poly'])
        at = np.array([list(corners).index(corner_of(c)) if corner_of(c) else -1 for c in ce])
        lab = np.where(onmat, at[pc], -1)
        for i, p in split_labels(o, lab, [f'w_{k}' for k in corners]).items(): groups[list(corners)[i]].append(p)
    found = all(groups[k] for k in corners)
    # (2) geometry: a tyre is a round loose part touching the ground at a corner; everything inside its drum goes with it
    if not found:
        for k in corners:
            for p in groups[k]: join([p] + [o for o in meshes() if o.name == 'body_rest'], 'body_rest')
        groups = { k: [] for k in corners }
        best = {}
        for o in meshes():
            if not len(o.data.polygons): continue
            isl = islands(o)
            for j in range(len(isl['ids'])):
                l, h = isl['lo'][j], isl['hi'][j]; e = h - l; c = (l + h) / 2
                k = corner_of(c)
                if not k: continue
                d = e[2]
                if not (0.22 * H < d < 0.8 * H) or abs(e[1] - d) > 0.25 * d or e[0] > 0.9 * d or l[2] > 0.08 * H: continue
                if k not in best or d > best[k][0]: best[k] = (d, c, e)
        if len(best) == 4:
            for o in list(meshes()):
                if not len(o.data.polygons): continue
                isl = islands(o); ce = (isl['lo'] + isl['hi']) / 2
                pc = np.searchsorted(isl['ids'], isl['poly'])
                at = np.full(len(isl['ids']), -1)
                for i, k in enumerate(corners):
                    if k not in best: continue
                    d, c, e = best[k]; r = d / 2 * 1.06; xin = [c[0] - e[0] / 2 - 0.12 * d, c[0] + e[0] / 2 + 0.04 * d]
                    inside = (np.abs(isl['lo'][:, 1] - c[1]) <= r) & (np.abs(isl['hi'][:, 1] - c[1]) <= r) & (np.abs(isl['lo'][:, 2] - c[2]) <= r) & (np.abs(isl['hi'][:, 2] - c[2]) <= r) \
                        & (np.minimum(isl['lo'][:, 0], isl['hi'][:, 0]) >= min(xin)) & (np.maximum(isl['lo'][:, 0], isl['hi'][:, 0]) <= max(xin))
                    at[inside & (at < 0)] = i
                for i, p in split_labels(o, at[pc], [f'w_{k}' for k in corners]).items(): groups[list(corners)[i]].append(p)
            found = all(groups[k] for k in corners)
    body = join([o for o in meshes() if not o.name.startswith('w_')], 'body')
    if found:
        for k in corners:
            w = join(groups[k], f'wheel-{k}'); c = origin_to_centre(w)
            lo_, hi_ = bbox([w]); wheel[k] = { 'c': [float(c[0]), float(hi_[2] - lo_[2]) / 2, float(c[1])], 'r': float(hi_[2] - lo_[2]) / 2 }
    else:
        for k in corners:
            for p in groups[k]: join([body, p], 'body')
        warn.append('wheels not found: they stay in the body')
    # a model in odd units can still be a plausible car length (a 4 m car modelled 2.8 units long): car wheels are
    # 0.28-0.42 m in radius, so wheels well outside that set the scale instead
    if found:
        rr = sum(w['r'] for w in wheel.values()) / 4
        if not 0.27 <= rr <= 0.46:
            f = 0.33 / rr; scale_about_ground(meshes(), f); unit *= f; L, W, H = L * f, W * f, H * f
            for w in wheel.values(): w['c'] = [x * f for x in w['c']]; w['r'] *= f
            warn.append(f'rescaled x{f:.2f} by the wheels')

    # roles: paint (the biggest coloured outside surface), glass, lamps
    outside = lambda ce: (np.abs(ce[:, 0]) > 0.3 * W).astype(np.float32) + (ce[:, 2] > 0.75 * H).astype(np.float32)
    areas = area_by_material([o for o in meshes() if not o.name.startswith('wheel-')], outside)
    paint = None; tot = sum(areas.values()) or 1
    ranked = sorted(areas.items(), key=lambda kv: -kv[1])
    for nm, a in ranked:
        m = bpy.data.materials[nm]; i = mat_info(m); r, g, b = i['col']
        if GLASS_RE.search(nm) or NOT_PAINT.search(nm) or i['alpha'] < 0.9: continue
        if PAINT_RE.search(nm) or (a > 0.3 * tot and not i['tex']): paint = nm; break  # a big textured one is usually an atlas of everything: leave it be
    paint_m = bpy.data.materials.get(paint) if paint else None
    for m in list(bpy.data.materials):  # a snapshot: renaming re-sorts bpy.data.materials
        if m is paint_m: continue
        if m.name == 'Body': m.name = 'Own_Body'  # the game tints whatever is called Body
        if mat_info(m)['alpha'] < 0.6 and not GLASS_RE.search(m.name) and 0.25 * tot < areas.get(m.name, 0) < 0.6 * tot:
            drop_material(m); warn.append(f'dropped see-through shell {m.name}'); continue  # a clear-coat layer over the paint (most of the surface is the car itself)
        if GLASS_RE.search(m.name): m.name = 'Glass_' + m.name
        elif HEAD_RE.search(m.name): m.name = 'Headlight_' + m.name
        elif TAIL_RE.search(m.name): m.name = 'TailLight_' + m.name
    if paint_m: paint_m.name = 'Body'
    if paint is None: warn.append('no paint found: keeps its own colour')

    t = decimate([body], OPT.get('tris', 30000))
    for k in corners:
        w = bpy.data.objects.get(f'wheel-{k}')
        if w: decimate([w], OPT.get('wheel_tris', 1600))
    shrink_textures(OPT.get('tex', 1024))
    lo, hi = bbox(meshes())
    return { 'L': float(hi[1] - lo[1]), 'W': float(hi[0] - lo[0]), 'H': roof_height(meshes()), 'Hmax': float(hi[2] - lo[2]), 'unit': unit, 'wheels': wheel, 'paint': paint,
             'front': { 'score': score, 'votes': votes }, 'tris': tris(meshes()) }

# ---------------------------------------------------------------- static things
def fit_static():
    flatten(); ms = meshes()
    if KIND in ('vehicle', 'prop', 'building', 'clothes'): drop_floor(ms, 0.01, 2.0)
    if KIND in ('vehicle', 'prop', 'statue'): see_through_effects(); ground_sheets(meshes())  # not plants (a bed's soil) or buildings (a floor)
    if KIND == 'vehicle': clean_parts()
    ms = meshes(); lo, hi = bbox(ms); ext = hi - lo
    # lay the long side along x, then turn the open side to the front (+z in the game): a bench's back, a shelter's
    # back wall, a vending machine's body is where the mass sits high, so the side with less up top is the front
    if ext[1] > ext[0] * 1.15: rotate_z(ms, math.pi / 2); ms = meshes(); lo, hi = bbox(ms); ext = hi - lo
    if KIND in ('prop', 'building', 'vehicle', 'statue') and ext[0] > ext[1] * 1.3:
        v = np.concatenate([world_verts(o) for o in ms]); top = v[v[:, 2] > lo[2] + 0.6 * ext[2]]
        if len(top) > 20:
            cy = (lo[1] + hi[1]) / 2; lean = (top[:, 1].mean() - cy) / max(1e-6, ext[1])
            if lean < -0.08: rotate_z(ms, math.pi); ms = meshes(); lo, hi = bbox(ms); ext = hi - lo  # the back belongs at +y (Blender), away from the front at -y
    how, target = OPT.get('size', ['h', 1.0])
    native = ext[2] if how == 'h' else max(ext[0], ext[1])
    unit = plausible_scale(native, target) if native > 0 else 1; scale_all(ms, unit)
    ground_centre(meshes())
    o = join(meshes(), 'model')
    decimate([o], OPT.get('tris', 6000)); shrink_textures(OPT.get('tex', 512))
    lo, hi = bbox([o])
    return { 'L': float(hi[1] - lo[1]), 'W': float(hi[0] - lo[0]), 'H': float(hi[2] - lo[2]), 'unit': unit, 'tris': tris([o]) }

# ---------------------------------------------------------------- people: rig and animations kept, scaled to their height
def fit_person():
    flatten(keep_rig=True)
    ms = meshes(); lo, hi = bbox(ms); hgt = hi[2] - lo[2]
    unit = plausible_scale(hgt, OPT.get('size', ['h', 1.75])[1]) if hgt > 0 else 1
    tops = [o for o in bpy.data.objects if o.parent is None]
    root = bpy.data.objects.new('root', None); scene.collection.objects.link(root)
    for o in tops: o.parent = root
    c = (lo + hi) / 2
    root.scale = (unit, unit, unit); root.location = (-c[0] * unit, -c[1] * unit, -lo[2] * unit)
    total = tris(ms); r = max(0.05, min(1, OPT.get('tris', 20000) / max(1, total)))
    for o in ms:
        if r < 1 and len(o.data.polygons) > 200 and not o.data.shape_keys:
            m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = r
            select([o]); bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)  # before the armature, so the skin follows
            bpy.ops.object.modifier_apply(modifier=m.name)
    shrink_textures(OPT.get('tex', 1024))
    lo, hi = bbox(meshes())
    anims = [a.name for a in bpy.data.actions]
    return { 'L': float(hi[1] - lo[1]) * unit, 'W': float(hi[0] - lo[0]) * unit, 'H': float(hi[2] - lo[2]) * unit, 'unit': unit, 'anims': anims, 'tris': tris(meshes()) }

rep = fit_car() if KIND == 'car' else fit_person() if KIND == 'person' else fit_static()
draco = OPT.get('draco', True)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_image_format='WEBP', export_image_quality=82, export_apply=True,
    export_animations=(KIND == 'person'), export_cameras=False, export_lights=False, export_extras=False, export_yup=True,
    export_draco_mesh_compression_enable=draco, export_draco_mesh_compression_level=6, export_draco_position_quantization=14,
    export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)

def glb_sanitize(path):
    """Blender writes a texture with no image when it can't save that image; three.js then fails the whole model.
    Drop such textures from the materials (the model keeps its other textures)."""
    import struct
    b = open(path, 'rb').read(); n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20 + n]); rest = b[20 + n:]
    imgs = j.get('images', [])
    def ok(t):
        src = t.get('source', (t.get('extensions') or {}).get('EXT_texture_webp', {}).get('source'))
        return src is not None and 0 <= src < len(imgs)
    bad = { i for i, t in enumerate(j.get('textures', [])) if not ok(t) }
    if not bad: return 0
    def strip(o):
        if isinstance(o, dict):
            for k in list(o):
                v = o[k]
                if isinstance(v, dict) and v.get('index') in bad and k.lower().endswith('texture'): del o[k]
                else: strip(v)
        elif isinstance(o, list):
            for v in o: strip(v)
    for m in j.get('materials', []): strip(m)
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + len(rest)) + struct.pack('<II', len(js), 0x4E4F534A) + js + rest
    open(path, 'wb').write(out); return len(bad)
nbad = glb_sanitize(DST)
if nbad: warn.append(f'{nbad} textures had no image and were dropped')
rep['warn'] = warn
json.dump(rep, open(REP, 'w'), indent=1)

if PREV:  # a small render for checking by eye: the front faces the camera, a red ball marks where the front should be
    lo, hi = bbox(meshes()); ext = hi - lo; size = max(ext)
    if KIND == 'car':
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12 * ext[2], location=(0, lo[1] - 0.15 * ext[2], 0.12 * ext[2]))
        ball = bpy.context.active_object; mm = bpy.data.materials.new('marker'); mm.diffuse_color = (1, 0, 0, 1); ball.data.materials.append(mm)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
    target = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, ext[2] * 0.4))
    cam.location = target + Vector((0.95, -1.25, 0.7)).normalized() * size * 1.9
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 50
    scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x, scene.render.resolution_y = 320, 240; scene.render.film_transparent = False
    scene.render.filepath = PREV; bpy.ops.render.render(write_still=True)
print('FIT_OK', json.dumps({ k: rep[k] for k in ('L', 'W', 'H', 'tris') }))
