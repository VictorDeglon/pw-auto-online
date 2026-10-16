"""Generate Poway High School (15500 Espola Rd, Poway, CA) in Blender from public data.

Run headless from the repo root:

    blender -b --factory-startup -P tools/phs/build_phs.py -- \
        --out build/phs/phs.blend --glb build/phs/phs.glb --fbx build/phs/phs.fbx \
        --render build/phs/preview

Inputs (all optional except campus.json; missing inputs fall back to simpler geometry):
    data/campus.json, data/surroundings.json  OpenStreetMap (fetch_osm.py), ODbL
    data/lidar/dtm.npy + dtm.json              bare-earth terrain, metres (prep_lidar.py)
    data/lidar/dsm.npy + dsm.json              first-return surface, metres (prep_lidar.py)
    data/lidar/structures.json                 roofed structures LiDAR sees but OSM lacks
    data/ortho/ortho.png + ortho.json          aerial image draped on terrain and roofs
    data/features.json                         hand-curated doors, gates, signs, colours

Coordinates: 1 Blender unit = 1 metre, +X east, +Y north, +Z up, origin at
lat 32.99612, lon -117.0280522 (SW corner of the campus parcel). Z = elevation - Z0,
where Z0 is stored on the scene as gtp_z0 (NAVD88 metres when LiDAR is present).

Every interactive object carries custom properties (exported as glTF "extras"):
    gtp_kind   door | gate | sign | traffic_signal | light
    gtp_id     stable id
    gtp_anim   name of the glTF animation / NLA track that opens it
"""
import argparse
import json
import math
import pathlib
import sys

import bmesh  # noqa: F401  (kept for interactive use from the Blender console)
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.geometry import delaunay_2d_cdt

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE / "data"
# phs_details does "import build_phs"; make that resolve to this running module, not a second copy
sys.modules.setdefault("build_phs", sys.modules[__name__])
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
LAT0, LON0 = 32.99612, -117.0280522
CAMPUS_WAY = 107391680
FPS = 24
OPEN_FRAMES = 24  # 1 s open animation

# --------------------------------------------------------------------------- geo

_A = 6378137.0
_F = 1 / 298.257223563
_E2 = _F * (2 - _F)
_PHI = math.radians(LAT0)
_S = math.sin(_PHI)
_N = _A / math.sqrt(1 - _E2 * _S * _S)
_M = _A * (1 - _E2) / (1 - _E2 * _S * _S) ** 1.5


def ll2xy(lat, lon):
    """WGS84 lat/lon -> local east/north metres (local tangent plane, <3 cm error on campus)."""
    return (math.radians(lon - LON0) * _N * math.cos(_PHI), math.radians(lat - LAT0) * _M)


class Raster:
    """North-up grid. x0/y0 are the local metres of the centre of cell [row 0, col 0]."""

    def __init__(self, arr, x0, y0, cell):
        self.a = np.asarray(arr, dtype=np.float64)
        self.x0, self.y0, self.cell = float(x0), float(y0), float(cell)
        self.rows, self.cols = self.a.shape

    @classmethod
    def load(cls, stem):
        npy, meta = DATA / "lidar" / f"{stem}.npy", DATA / "lidar" / f"{stem}.json"
        if not (npy.exists() and meta.exists()):
            return None
        m = json.loads(meta.read_text())
        arr = np.load(npy)
        nodata = m.get("nodata")
        arr = arr.astype(np.float64)
        if nodata is not None:
            arr[arr == nodata] = np.nan
        return cls(arr, m["x0"], m["y0"], m["cell"])

    def sample(self, x, y):
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        c = (x - self.x0) / self.cell
        r = (self.y0 - y) / self.cell
        c0 = np.clip(np.floor(c).astype(int), 0, self.cols - 2)
        r0 = np.clip(np.floor(r).astype(int), 0, self.rows - 2)
        fc = np.clip(c - c0, 0, 1)
        fr = np.clip(r - r0, 0, 1)
        a = self.a
        v00, v01 = a[r0, c0], a[r0, c0 + 1]
        v10, v11 = a[r0 + 1, c0], a[r0 + 1, c0 + 1]
        out = (v00 * (1 - fc) + v01 * fc) * (1 - fr) + (v10 * (1 - fc) + v11 * fc) * fr
        # nan-aware fallback: nearest valid of the four corners
        bad = np.isnan(out)
        if np.any(bad):
            stack = np.stack([v00, v01, v10, v11])
            with np.errstate(all="ignore"):
                alt = np.nanmean(stack, axis=0)
            out = np.where(bad, alt, out)
        return out

    def extent(self):
        return (self.x0 - self.cell / 2, self.y0 - (self.rows - 0.5) * self.cell,
                self.x0 + (self.cols - 0.5) * self.cell, self.y0 + self.cell / 2)


class World:
    """Ground height lookup in scene Z (metres above Z0)."""

    def __init__(self, dtm, dsm):
        self.dtm, self.dsm = dtm, dsm
        if dtm is not None:
            self.z0 = float(math.floor(np.nanmin(dtm.a)))
        else:
            self.z0 = 0.0

    def ground(self, x, y):
        if self.dtm is None:
            return np.zeros_like(np.asarray(x, dtype=np.float64))
        return self.dtm.sample(x, y) - self.z0

    def g1(self, x, y):
        return float(self.ground([x], [y])[0])

    def surface(self, x, y):
        if self.dsm is None:
            return None
        return self.dsm.sample(x, y) - self.z0


# --------------------------------------------------------------------------- polygons

def signed_area(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return a / 2


def ccw(pts):
    return pts if signed_area(pts) > 0 else pts[::-1]


def clean_ring(pts, tol=0.05):
    out = []
    for p in pts:
        if not out or math.dist(p, out[-1]) > tol:
            out.append(p)
    if len(out) > 1 and math.dist(out[0], out[-1]) <= tol:
        out.pop()
    return out


def points_in_poly(px, py, ring):
    px = np.asarray(px)
    py = np.asarray(py)
    inside = np.zeros(px.shape, dtype=bool)
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        cond = (y1 > py) != (y2 > py)
        with np.errstate(divide="ignore", invalid="ignore"):
            xint = (x2 - x1) * (py - y1) / (y2 - y1) + x1
        inside ^= cond & (px < xint)
    return inside


def dist_to_ring(px, py, ring):
    px = np.asarray(px, dtype=np.float64)
    py = np.asarray(py, dtype=np.float64)
    d = np.full(px.shape, np.inf)
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy or 1e-9
        t = np.clip(((px - x1) * dx + (py - y1) * dy) / L2, 0, 1)
        d = np.minimum(d, np.hypot(px - (x1 + t * dx), py - (y1 + t * dy)))
    return d


def poly_centroid(ring):
    a = signed_area(ring)
    cx = cy = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        k = x1 * y2 - x2 * y1
        cx += (x1 + x2) * k
        cy += (y1 + y2) * k
    if abs(a) < 1e-9:
        return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
    return (cx / (6 * a), cy / (6 * a))


def triangulate(outer, holes=(), step=3.0):
    """Constrained Delaunay of a polygon (+holes) with interior grid points every `step` m.
    Returns (verts2d, tris) with tris CCW."""
    outer = ccw(clean_ring(outer))
    rings = [outer] + [ccw(clean_ring(h))[::-1] for h in holes if len(clean_ring(h)) >= 3]
    verts, edges, faces = [], [], []
    for ring in rings:
        base = len(verts)
        verts.extend(Vector(p) for p in ring)
        n = len(ring)
        edges.extend((base + i, base + (i + 1) % n) for i in range(n))
        faces.append(list(range(base, base + n)))
    if step:
        xs = [p[0] for p in outer]
        ys = [p[1] for p in outer]
        gx, gy = np.meshgrid(np.arange(min(xs) + step / 2, max(xs), step),
                             np.arange(min(ys) + step / 2, max(ys), step))
        gx, gy = gx.ravel(), gy.ravel()
        if gx.size:
            keep = points_in_poly(gx, gy, outer) & (dist_to_ring(gx, gy, outer) > step * 0.3)
            for h in rings[1:]:
                keep &= ~points_in_poly(gx, gy, h) & (dist_to_ring(gx, gy, h) > step * 0.3)
            verts.extend(Vector((x, y)) for x, y in zip(gx[keep], gy[keep]))
    # output type 1 keeps triangles inside the outer constraint; holes are removed below
    out_v, _e, out_f, *_ = delaunay_2d_cdt(verts, edges, [faces[0]] + faces[1:], 1, 1e-4)
    pv = [(v.x, v.y) for v in out_v]
    tris = []
    for f in out_f:
        if len(f) != 3:
            continue
        cx = sum(pv[i][0] for i in f) / 3
        cy = sum(pv[i][1] for i in f) / 3
        if any(points_in_poly([cx], [cy], h)[0] for h in rings[1:]):
            continue
        if not points_in_poly([cx], [cy], outer)[0]:
            continue
        a = signed_area([pv[i] for i in f])
        tris.append(list(f) if a > 0 else list(f)[::-1])
    return pv, tris


# --------------------------------------------------------------------------- mesh builder

class MB:
    """Accumulates verts/faces/material slots/UVs and emits one mesh object."""

    def __init__(self):
        self.v, self.f, self.fm, self.uv = [], [], [], []

    def vert(self, co):
        self.v.append((float(co[0]), float(co[1]), float(co[2])))
        return len(self.v) - 1

    def face(self, idx, mat=0, uvs=None):
        self.f.append(list(idx))
        self.fm.append(mat)
        self.uv.append(list(uvs) if uvs else [(0.0, 0.0)] * len(idx))

    def poly(self, cos, mat=0, uvs=None):
        self.face([self.vert(c) for c in cos], mat, uvs)

    def box(self, M, x0, x1, y0, y1, z0, z1, mat=0, inverted=False):
        """Axis-aligned box in the local frame M (a Matrix with det > 0)."""
        P = [M @ Vector(c) for c in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                     (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
        quads = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        dims = [(x1 - x0, y1 - y0), (x1 - x0, y1 - y0), (x1 - x0, z1 - z0),
                (y1 - y0, z1 - z0), (x1 - x0, z1 - z0), (y1 - y0, z1 - z0)]
        for q, (w, h) in zip(quads, dims):
            uv = [(0, 0), (w, 0), (w, h), (0, h)]
            q = q[::-1] if inverted else q
            self.poly([P[i] for i in q], mat, uv[::-1] if inverted else uv)

    def cylinder(self, M, r, z0, z1, mat=0, seg=10):
        ring0 = [M @ Vector((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z0))
                 for i in range(seg)]
        ring1 = [M @ Vector((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z1))
                 for i in range(seg)]
        for i in range(seg):
            j = (i + 1) % seg
            self.poly([ring0[i], ring0[j], ring1[j], ring1[i]], mat)
        self.poly(ring1, mat)
        self.poly(ring0[::-1], mat)

    def add_mesh(self, me, M, mat):
        n = len(me.vertices)
        co = np.empty(n * 3)
        me.vertices.foreach_get("co", co)
        base = len(self.v)
        for c in co.reshape(-1, 3):
            self.vert(M @ Vector(c))
        for p in me.polygons:
            self.face([base + i for i in p.vertices], mat)

    def build(self, name, coll, mats, smooth=False):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        if self.f:
            uvl = me.uv_layers.new(name="UVMap")
            flat = [c for face in self.uv for uv in face for c in uv]
            uvl.data.foreach_set("uv", flat)
            me.polygons.foreach_set("material_index", self.fm)
            if smooth:
                me.polygons.foreach_set("use_smooth", [True] * len(self.f))
        for m in mats:
            me.materials.append(m)
        me.validate(clean_customdata=False)
        me.update()
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        return ob


def frame(origin, right2d, up=(0, 0, 1)):
    """Local frame: x = right (horizontal), z = up, y = into the face (viewer stands at -y)."""
    r = Vector((right2d[0], right2d[1], 0)).normalized()
    u = Vector(up)
    n = r.cross(u)  # toward the viewer
    into = -n
    o = Vector(origin)
    return Matrix(((r.x, into.x, u.x, o.x), (r.y, into.y, u.y, o.y), (r.z, into.z, u.z, o.z), (0, 0, 0, 1)))


def text_frame(M):
    """Map a text mesh (XY plane, reading +X, up +Y, face +Z) onto the -y face of frame M."""
    return M @ Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


# --------------------------------------------------------------------------- materials

_IMG_CACHE = {}


def make_image(name, rgba):
    """rgba: float array (h, w, 4) in 0..1, row 0 = bottom."""
    if name in _IMG_CACHE:
        return _IMG_CACHE[name]
    h, w, _ = rgba.shape
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.pack()
    _IMG_CACHE[name] = img
    return img


def chainlink_image():
    n = 64
    yy, xx = np.mgrid[0:n, 0:n] / n
    d1 = np.abs(((xx + yy) % 0.5) - 0.25)
    d2 = np.abs(((xx - yy) % 0.5) - 0.25)
    wire = (np.minimum(d1, d2) > 0.205).astype(np.float32)
    rgba = np.zeros((n, n, 4), np.float32)
    rgba[..., :3] = 0.62
    rgba[..., 3] = wire
    return make_image("chainlink", rgba)


def noise_image(name, base, amp, n=256, seed=1):
    rng = np.random.default_rng(seed)
    a = rng.normal(0, 1, (n, n)).astype(np.float32)
    for _ in range(3):  # cheap blur for a stucco / asphalt grain
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    a = a / (np.abs(a).max() or 1)
    rgba = np.ones((n, n, 4), np.float32)
    for i in range(3):
        rgba[..., i] = np.clip(base[i] * (1 + amp * a), 0, 1)
    return make_image(name, rgba)


def material(name, color=(0.8, 0.8, 0.8), rough=0.8, metal=0.0, emit=None, emit_strength=0.0,
             image=None, alpha_clip=False, uv_scale=None, double_sided=True):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    if image is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        if uv_scale:
            uv = nt.nodes.new("ShaderNodeTexCoord")
            mp = nt.nodes.new("ShaderNodeMapping")
            mp.inputs["Scale"].default_value = (uv_scale, uv_scale, 1)
            nt.links.new(uv.outputs["UV"], mp.inputs["Vector"])
            nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha_clip:
            rnd = nt.nodes.new("ShaderNodeMath")
            rnd.operation = "ROUND"
            nt.links.new(tex.outputs["Alpha"], rnd.inputs[0])
            nt.links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
    m.diffuse_color = (*color, 1)
    m.use_backface_culling = not double_sided
    if alpha_clip:
        try:
            m.surface_render_method = "DITHERED"
        except AttributeError:
            pass
    return m


def srgb(hexstr):
    hexstr = hexstr.lstrip("#")
    c = [int(hexstr[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# --------------------------------------------------------------------------- scene helpers

def new_coll(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    return c


def tag(ob, kind, gid, **extra):
    ob["gtp_kind"] = kind
    ob["gtp_id"] = gid
    for k, v in extra.items():
        ob[f"gtp_{k}"] = v


def add_open_anim(ob, track, channels):
    """Keyframe a 1 s open motion and move it into an NLA track named `track`.
    channels: [(data_path, index, closed_value, open_value), ...]
    glTF export in NLA_TRACKS mode merges same-named tracks into one animation, so both
    leaves of a double door share one "<id>_open" clip."""
    ob.animation_data_create()
    for path, idx, closed, _ in channels:
        getattr(ob, path)[idx] = closed
        ob.keyframe_insert(data_path=path, index=idx, frame=1)
    for path, idx, _, opened in channels:
        getattr(ob, path)[idx] = opened
        ob.keyframe_insert(data_path=path, index=idx, frame=1 + OPEN_FRAMES)
    act = ob.animation_data.action
    act.name = f"{track}__{ob.name}"
    nt = ob.animation_data.nla_tracks.new()
    nt.name = track
    nt.strips.new(track, 1, act)
    ob.animation_data.action = None
    for path, idx, closed, _ in channels:  # rest pose = closed
        getattr(ob, path)[idx] = closed


_FONT = None


def text_mesh(text, size, extrude=0.0, align="CENTER"):
    cu = bpy.data.curves.new("txt", "FONT")
    cu.body = text
    cu.size = size
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.extrude = extrude
    cu.resolution_u = 2 if size < 0.5 else 4  # text is the bulk of the triangles; fine at sign scale
    if _FONT is not None:
        cu.font = _FONT
    ob = bpy.data.objects.new("txt", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    return me


def mesh_width(me):
    if not me.vertices:
        return 0.0
    xs = [v.co.x for v in me.vertices]
    return max(xs) - min(xs)


# --------------------------------------------------------------------------- OSM

def load_osm(name):
    p = DATA / name
    if not p.exists():
        return []
    return json.loads(p.read_text())["elements"]


def way_xy(e):
    return [ll2xy(g["lat"], g["lon"]) for g in e.get("geometry", []) if g]


def relation_rings(e, role):
    """Assemble multipolygon member ways of `role` into closed rings."""
    segs = [way_xy(m) for m in e.get("members", []) if m.get("role") == role and m.get("geometry")]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while math.dist(cur[0], cur[-1]) > 0.05 and changed:
            changed = False
            for i, s in enumerate(segs):
                if math.dist(cur[-1], s[0]) < 0.05:
                    cur = cur + s[1:]
                elif math.dist(cur[-1], s[-1]) < 0.05:
                    cur = cur + s[::-1][1:]
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        rings.append(clean_ring(cur))
    return [r for r in rings if len(r) >= 3]


ROAD_WIDTH = {"secondary": 3.6, "tertiary": 3.5, "residential": 3.4, "unclassified": 3.4,
              "service": 3.0, "footway": 1.8, "pedestrian": 3.0, "steps": 2.0, "path": 1.5}


def road_width(t):
    if "width" in t:
        try:
            return float(str(t["width"]).split()[0])
        except ValueError:
            pass
    hw = t.get("highway")
    per = ROAD_WIDTH.get(hw, 3.0)
    if hw in ("footway", "pedestrian", "steps", "path"):
        return per
    lanes = t.get("lanes")
    if lanes and lanes.isdigit():
        return per * int(lanes)
    if hw == "service":
        return 6.0 if t.get("oneway") != "yes" else 4.5
    return per * (1 if t.get("oneway") == "yes" else 2)


# --------------------------------------------------------------------------- builders

class Builder:
    def __init__(self, args):
        self.args = args
        self.game = getattr(args, "target", "blender") == "game"
        self.features = json.loads((DATA / "features.json").read_text()) if (DATA / "features.json").exists() else {}
        self.campus = load_osm("campus.json")
        self.surr = load_osm("surroundings.json")
        self.world = World(Raster.load("dtm"), Raster.load("dsm"))
        self.ortho, self.ortho_box = self._load_ortho()
        self.report = {"warnings": [], "counts": {}}
        colors = self.features.get("colors", {})
        self.C = {
            "wall": srgb(colors.get("wall", "#cdbb9c")),
            "wall_trim": srgb(colors.get("trim", "#7a6a55")),
            "door": srgb(colors.get("door", "#1f3f7a")),
            "frame": srgb(colors.get("door_frame", "#5b5f63")),
        }
        self.buildings = []  # dicts: id, name, ring, base, top, openings{edge: [...]}

    # ---- inputs
    def _load_ortho(self):
        meta = DATA / "ortho" / "ortho.json"
        png = next((p for p in (DATA / "ortho" / "ortho.jpg", DATA / "ortho" / "ortho.png") if p.exists()), None)
        if not (png and meta.exists()):
            return None, None
        m = json.loads(meta.read_text())
        img = bpy.data.images.load(str(png))
        img.pack()
        return img, (m["xmin"], m["ymin"], m["xmax"], m["ymax"])

    def ortho_uv(self, x, y):
        x0, y0, x1, y1 = self.ortho_box
        return ((x - x0) / (x1 - x0), (y - y0) / (y1 - y0))

    def warn(self, msg):
        self.report["warnings"].append(msg)
        print("WARN", msg)

    # ---- scene
    def setup_scene(self):
        for ob in list(bpy.data.objects):
            bpy.data.objects.remove(ob)
        sc = bpy.context.scene
        sc.unit_settings.system = "METRIC"
        sc.unit_settings.scale_length = 1.0
        sc.render.fps = FPS
        sc.frame_start, sc.frame_end = 1, 1 + OPEN_FRAMES
        sc["gtp_origin_lat"] = LAT0
        sc["gtp_origin_lon"] = LON0
        sc["gtp_z0"] = self.world.z0
        sc["gtp_frame"] = "local tangent plane, +X east, +Y north, metres; Z = elevation - gtp_z0"
        root = sc.collection
        self.col = {n: new_coll(n, root) for n in
                    ("Terrain", "Ground", "Buildings", "Doors", "Gates", "Fences", "Signs", "Traffic",
                     "Vegetation", "Lights", "Bleachers", "Structures", "Zones")}
        self.M = {
            "terrain": material("Terrain_Ortho", (0.35, 0.4, 0.25), 0.95, image=self.ortho) if self.ortho
            else material("Terrain_Grass", srgb("#7c8a4a"), 0.95),
            "asphalt": material("Asphalt", srgb("#3a3b3d"), 0.9,
                                image=noise_image("asphalt_grain", srgb("#3c3d40"), 0.25), uv_scale=1 / 4),
            "concrete": material("Concrete", srgb("#b9b5ac"), 0.85,
                                 image=noise_image("concrete_grain", srgb("#bdb8ae"), 0.12, seed=2), uv_scale=1 / 3),
            "turf": material("Turf_Artificial", srgb("#3f7a33"), 0.7),
            "grass": material("Grass", srgb("#6f8f3d"), 0.95),
            "clay": material("Infield_Clay", srgb("#b0714a"), 0.95),
            "court": material("Court_Hard", srgb("#3d6b8f"), 0.6),
            "track": material("Track_Rubber", srgb("#a2412f"), 0.8),
            "water": material("Pool_Water", srgb("#3aa6c9"), 0.05),
            "paint_w": material("Paint_White", srgb("#f2f2ee"), 0.6),
            "paint_y": material("Paint_Yellow", srgb("#f2c230"), 0.6),
            "wall": material("Wall_Stucco", self.C["wall"], 0.9,
                             image=noise_image("stucco_grain", self.C["wall"], 0.08, seed=3), uv_scale=1 / 2),
            "trim": material("Wall_Trim", self.C["wall_trim"], 0.8),
            "roof": material("Roof_Ortho", srgb("#8d8a83"), 0.85, image=self.ortho) if self.ortho
            else material("Roof", srgb("#8d8a83"), 0.85),
            "void": material("Interior_Dark", (0.02, 0.02, 0.02), 1.0),
            "door": material("Door_Paint", self.C["door"], 0.45, 0.3),
            "frame": material("Door_Frame", self.C["frame"], 0.5, 0.6),
            "glass": material("Glass_Dark", (0.03, 0.05, 0.06), 0.05, 0.0),
            "steel": material("Galvanized_Steel", srgb("#9a9d9f"), 0.45, 0.9),
            "chain": material("Chain_Link", (0.6, 0.6, 0.6), 0.5, 0.8, image=chainlink_image(),
                              alpha_clip=True, uv_scale=1 / 0.15, double_sided=True),
            "sign_green": material("Sign_Green", srgb("#006b3f"), 0.4),
            "sign_red": material("Sign_Red", srgb("#c1121c"), 0.4),
            "sign_white": material("Sign_White", srgb("#f7f7f2"), 0.4),
            "sign_ygreen": material("Sign_SchoolYellowGreen", srgb("#c6e21d"), 0.4),
            "sign_black": material("Sign_Black", (0.01, 0.01, 0.01), 0.5),
            "sign_back": material("Sign_Back_Aluminium", srgb("#a8abad"), 0.5, 0.8),
            "marquee_led": material("Marquee_LED", (0.02, 0.02, 0.02), 0.3, emit=srgb("#ffb347"),
                                    emit_strength=4.0),
            "monument": material("Monument_Masonry", srgb("#9c8c78"), 0.9),
            "signal_body": material("Signal_Body", srgb("#2f3a24"), 0.6, 0.2),
            "lens_red": material("Lens_Red", (0.3, 0.0, 0.0), 0.2, emit=(1, 0.05, 0.02), emit_strength=6.0),
            "lens_off": material("Lens_Off", (0.05, 0.05, 0.04), 0.2),
            "trunk": material("Tree_Trunk", srgb("#5a4632"), 0.9),
            "leaf": material("Tree_Canopy", srgb("#4b6b2e"), 0.9),
            "lamp": material("Lamp_Head", (0.9, 0.9, 0.85), 0.3, emit=(1, 0.95, 0.85), emit_strength=2.0),
        }

    # ---- terrain
    def terrain(self):
        if self.world.dtm is not None:
            x0, y0, x1, y1 = self.world.dtm.extent()
        else:
            xs, ys = zip(*[ll2xy(g["lat"], g["lon"]) for e in self.campus if e.get("id") == CAMPUS_WAY
                           for g in e["geometry"]])
            x0, y0, x1, y1 = min(xs) - 60, min(ys) - 60, max(xs) + 60, max(ys) + 60
            self.warn("no LiDAR DTM: terrain is flat")
        step = 2.0
        xs = np.arange(x0, x1 + 1e-6, step)
        ys = np.arange(y0, y1 + 1e-6, step)
        gx, gy = np.meshgrid(xs, ys)
        gz = self.world.ground(gx.ravel(), gy.ravel()).reshape(gx.shape)
        gz = np.nan_to_num(gz, nan=float(np.nanmedian(gz)) if np.isfinite(gz).any() else 0.0)
        nx, ny = len(xs), len(ys)
        mb = MB()
        for j in range(ny):
            for i in range(nx):
                mb.vert((gx[j, i], gy[j, i], gz[j, i]))
        for j in range(ny - 1):
            for i in range(nx - 1):
                a, b = j * nx + i, j * nx + i + 1
                c, d = (j + 1) * nx + i + 1, (j + 1) * nx + i
                quad = [a, b, c, d]
                if self.ortho:
                    uvs = [self.ortho_uv(mb.v[k][0], mb.v[k][1]) for k in quad]
                else:
                    uvs = [(mb.v[k][0] / 4, mb.v[k][1] / 4) for k in quad]
                mb.face(quad, 0, uvs)
        self.extent = (x0, y0, x1, y1)
        ob = mb.build("Terrain", self.col["Terrain"], [self.M["terrain"]])
        self.report["counts"]["terrain_verts"] = len(mb.v)
        return ob

    def campus_ring(self):
        return ccw(clean_ring(way_xy(next(e for e in self.campus if e.get("id") == CAMPUS_WAY))))

    def ground_cover(self):
        """Game target: aerial-textured ground clipped to the campus parcel (+4 m), 2 m triangles."""
        ring = self.campus_ring()
        grown = self._inset(ring, -4.0) or ring
        mb = MB()
        pv, tris = triangulate(grown, [], 2.0)
        z = self.world.ground([p[0] for p in pv], [p[1] for p in pv]) + 0.05
        z = np.nan_to_num(z, nan=0.0)
        for (x, y), zz in zip(pv, z):
            mb.vert((x, y, zz))
        for t in tris:
            uvs = [self.ortho_uv(*pv[i]) if self.ortho else (pv[i][0] / 4, pv[i][1] / 4) for i in t]
            mb.face(t, 0, uvs)
        ob = mb.build("Ground_Cover", self.col["Terrain"], [self.M["terrain"]])
        ob["gtp_conform"] = "drape"
        return ob

    # ---- game target: store everything relative to the ground so the game can conform it
    DRAPE_COLLS = ("Terrain", "Ground", "Vegetation", "Fences", "Lights")

    def conform_for_game(self):
        """Rewrite geometry so Z is height above the local ground:
        drape  - per vertex: z -= ground(x, y)   (runtime: y = heightAt(x, z) + y)
        rigid  - per object: z -= min ground over gtp_anchor points (runtime: y += min heightAt(anchor))
        Objects tagged gtp_anchor_ref follow the named object's anchor (doors, roof kit, zones)."""
        anchors = {}

        def anchor_pts(ob):
            if ob.get("gtp_kind") == "building":
                b = next(bb for bb in self.buildings if bb["id"] == ob["gtp_id"])
                ring = b["ring"]
                step = max(1, len(ring) // 24)
                return [c for p in ring[::step] for c in p]
            co = np.array([ob.matrix_world @ v.co for v in ob.data.vertices]) if ob.data.vertices else np.zeros((1, 3))
            x0, y0 = co[:, 0].min(), co[:, 1].min()
            x1, y1 = co[:, 0].max(), co[:, 1].max()
            return [x0, y0, x1, y0, x1, y1, x0, y1, (x0 + x1) / 2, (y0 + y1) / 2]

        def min_ground(pts):
            g = self.world.ground(pts[0::2], pts[1::2])
            return float(np.nanmin(g)) if np.isfinite(g).any() else 0.0

        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        # pass 1: rigid objects that others reference
        for ob in meshes:
            coll = ob.users_collection[0].name if ob.users_collection else ""
            mode = ob.get("gtp_conform") or ("drape" if coll in self.DRAPE_COLLS else "rigid")
            if mode in ("drape", "per_vertex_ground", "drape_rigid_parts"):
                ob["gtp_conform"] = "drape"
                continue
            if ob.get("gtp_anchor_ref"):
                continue
            pts = anchor_pts(ob)
            g = min_ground(pts)
            anchors[ob.name] = g
            self._anchor_g = anchors
            ob["gtp_conform"] = "rigid"
            ob["gtp_anchor"] = [round(float(v), 2) for v in pts]
            self._shift(ob, -g)
        # pass 2: dependants and drapes
        for ob in meshes:
            if ob.get("gtp_anchor_ref"):
                ref = ob["gtp_anchor_ref"]
                g = anchors.get(ref)
                if g is None:
                    self.warn(f"{ob.name}: anchor ref {ref} missing; anchored to itself")
                    pts = anchor_pts(ob)
                    g = min_ground(pts)
                    ob["gtp_anchor"] = [round(float(v), 2) for v in pts]
                    ob["gtp_anchor_ref"] = ""
                ob["gtp_conform"] = "rigid"
                self._shift(ob, -g)
            elif ob["gtp_conform"] == "drape":
                me = ob.data
                n = len(me.vertices)
                co = np.empty(n * 3)
                me.vertices.foreach_get("co", co)
                co = co.reshape(-1, 3)
                mw = np.array(ob.matrix_world)
                wco = co @ mw[:3, :3].T + mw[:3, 3]
                g = np.nan_to_num(self.world.ground(wco[:, 0], wco[:, 1]), nan=0.0)
                co[:, 2] -= g  # objects with drape are built in world space (identity transform)
                me.vertices.foreach_set("co", co.ravel())
                me.update()

    @staticmethod
    def _shift(ob, dz):
        if ob.animation_data or ob.location.length > 1e-6 or ob.rotation_euler.z != 0:
            ob.location.z += dz
        else:
            me = ob.data
            n = len(me.vertices)
            co = np.empty(n * 3)
            me.vertices.foreach_get("co", co)
            co[2::3] += dz
            me.vertices.foreach_set("co", co)
            me.update()

    def write_manifest(self, path):
        """Colliders, zones, doors and attribution for the game, in the campus local frame (metres)."""
        man = {"frame": {"origin_lat": LAT0, "origin_lon": LON0, "m_per_deg_lat": _M * math.pi / 180,
                         "m_per_deg_lon": _N * math.cos(_PHI) * math.pi / 180,
                         "axes": "x east, y north (glTF: x east, y up, z = -north)"},
               "campus": [round(c, 2) for p in self.campus_ring() for c in p],
               "buildings": [], "boxes": [], "fences": [], "zones": [], "interactives": [], "rooms": [],
               "attribution": [
                   "Map data (c) OpenStreetMap contributors, ODbL",
                   "Elevation and building heights: USGS 3DEP LiDAR (public domain)",
                   "Aerial imagery: SANDAG / SanGIS regional imagery partnership (Nearmap), 2023 9-inch product",
               ]}
        for b in self.buildings:
            man["buildings"].append({"name": b["name"], "id": b["id"], "h": round(b.get("peak", b["height"]), 2),
                                     "ring": [round(c, 2) for p in b["ring"] for c in p]})
        import phs_facades as FC
        man["rooms"] = FC.export_rooms(self)
        import phs_details as DT
        for s in DT.load_list("structures.json"):
            k = s.get("kind")
            if k in ("bleachers",):
                man["boxes"].append({"id": s["id"], "kind": k, "x": s["x"], "y": s["y"], "l": s["l"], "w": s["w"],
                                     "rot_deg": s["rot_deg"], "y0": 1.95, "h": float(s.get("back_h", 4.0)) + 1.2})
            elif k in ("portable", "dugout", "container", "shed", "scoreboard") and s.get("l"):
                man["boxes"].append({"id": s["id"], "kind": k, "x": s["x"], "y": s["y"], "l": s["l"],
                                     "w": s.get("w", 0.5), "rot_deg": s.get("rot_deg", 0), "y0": 0,
                                     "h": float(s.get("h", 3.0))})
            elif k in ("fence", "backstop", "batting_cage") and s.get("polyline"):
                man["fences"].append({"id": s["id"], "h": float(s.get("h", 1.83)),
                                      "pts": [round(c, 2) for p in s["polyline"] for c in p]})
        for ob in bpy.data.objects:
            kind = ob.get("gtp_kind")
            if kind == "zone":
                co = np.array([ob.matrix_world @ v.co for v in ob.data.vertices])
                man["zones"].append({"id": ob["gtp_id"], "name": ob.get("gtp_name", ""), "node": ob.name,
                                     "min": [round(float(v), 2) for v in co.min(0)],
                                     "max": [round(float(v), 2) for v in co.max(0)]})
            elif kind in ("door", "gate"):
                man["interactives"].append({"node": ob.name, "kind": kind, "id": ob["gtp_id"],
                                            "anim": ob.get("gtp_anim", ""),
                                            "hinge": [round(ob.location.x, 2), round(ob.location.y, 2)]})
        pathlib.Path(path).write_text(json.dumps(man, separators=(",", ":")))
        return man

    # ---- draped polygons and ribbons
    def drape_poly(self, mb, outer, holes, mat, lift, step=3.0, uv_mode="world"):
        pv, tris = triangulate(outer, holes, step)
        if not tris:
            return
        z = self.world.ground([p[0] for p in pv], [p[1] for p in pv]) + lift
        base = len(mb.v)
        for (x, y), zz in zip(pv, z):
            mb.vert((x, y, zz))
        for t in tris:
            uvs = [(pv[i][0] / 4, pv[i][1] / 4) for i in t]
            mb.face([base + i for i in t], mat, uvs)

    def ribbon(self, mb, pts, width, mat, lift, sample=2.0):
        dense = []
        for i in range(len(pts) - 1):
            (x1, y1), (x2, y2) = pts[i], pts[i + 1]
            L = math.dist(pts[i], pts[i + 1])
            n = max(1, int(L / sample))
            for k in range(n):
                dense.append((x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n))
        dense.append(pts[-1])
        if len(dense) < 2:
            return
        hw = width / 2
        left, right, dist = [], [], [0.0]
        for i, p in enumerate(dense):
            a = dense[max(i - 1, 0)]
            b = dense[min(i + 1, len(dense) - 1)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy) or 1
            nx, ny = -dy / L, dx / L
            left.append((p[0] + nx * hw, p[1] + ny * hw))
            right.append((p[0] - nx * hw, p[1] - ny * hw))
            if i:
                dist.append(dist[-1] + math.dist(dense[i - 1], p))
        zl = self.world.ground([p[0] for p in left], [p[1] for p in left]) + lift
        zr = self.world.ground([p[0] for p in right], [p[1] for p in right]) + lift
        for i in range(len(dense) - 1):
            q = [(*right[i], zr[i]), (*right[i + 1], zr[i + 1]), (*left[i + 1], zl[i + 1]), (*left[i], zl[i])]
            uv = [(0, dist[i] / 4), (0, dist[i + 1] / 4), (width / 4, dist[i + 1] / 4), (width / 4, dist[i] / 4)]
            mb.poly(q, mat, uv)

    def dashed(self, mb, pts, offset, width, mat, lift, dash=3.0, gap=9.0):
        """Painted line `offset` metres left of the way centreline. gap=0 -> solid."""
        if gap <= 0:
            shifted = self._offset_line(pts, offset)
            self.ribbon(mb, shifted, width, mat, lift)
            return
        shifted = self._offset_line(pts, offset)
        run = 0.0
        for i in range(len(shifted) - 1):
            a, b = shifted[i], shifted[i + 1]
            L = math.dist(a, b)
            t = 0.0
            while t < L:
                phase = run % (dash + gap)
                if phase < dash:
                    seg = min(dash - phase, L - t)
                    p0 = (a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L)
                    p1 = (a[0] + (b[0] - a[0]) * (t + seg) / L, a[1] + (b[1] - a[1]) * (t + seg) / L)
                    self.ribbon(mb, [p0, p1], width, mat, lift, sample=dash)
                else:
                    seg = min(dash + gap - phase, L - t)
                t += seg
                run += seg

    @staticmethod
    def _offset_line(pts, off):
        out = []
        for i, p in enumerate(pts):
            a = pts[max(i - 1, 0)]
            b = pts[min(i + 1, len(pts) - 1)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy) or 1
            out.append((p[0] - dy / L * off, p[1] + dx / L * off))
        return out

    def ground_layers(self):
        mats = [self.M[k] for k in ("asphalt", "concrete", "turf", "grass", "clay", "court", "track",
                                    "water", "paint_w", "paint_y")]
        idx = {k: i for i, k in enumerate(("asphalt", "concrete", "turf", "grass", "clay", "court", "track",
                                           "water", "paint_w", "paint_y"))}
        mb = MB()
        seen = set()
        for e in self.campus + ([] if self.game else self.surr):
            if e["id"] in seen or e["type"] != "way":
                continue
            seen.add(e["id"])
            t = e.get("tags", {})
            ring = clean_ring(way_xy(e))
            closed = e.get("geometry") and len(e["geometry"]) > 3 and \
                math.dist(way_xy(e)[0], way_xy(e)[-1]) < 0.05
            if t.get("landuse") == "grass" and closed:
                self.drape_poly(mb, ring, [], idx["grass"], 0.06)
            elif t.get("amenity") == "parking" and closed:
                self.drape_poly(mb, ring, [], idx["asphalt"], 0.08)
            elif t.get("highway") == "pedestrian" and t.get("area") == "yes" and closed:
                self.drape_poly(mb, ring, [], idx["concrete"], 0.10)
            elif t.get("leisure") == "pitch" and closed:
                sport = t.get("sport", "")
                m = {"baseball": "clay", "softball": "clay", "tennis": "court", "basketball": "court",
                     "american_football": "turf", "soccer": "turf"}.get(sport, "grass")
                if sport in ("baseball", "softball"):
                    # OSM baseball pitches cover the whole diamond+outfield; grass with clay infield
                    self.drape_poly(mb, ring, [], idx["grass"], 0.12)
                else:
                    self.drape_poly(mb, ring, [], idx[m], 0.12)
            elif t.get("leisure") == "swimming_pool" and closed:
                self.drape_poly(mb, ring, [], idx["water"], 0.12)
        for e in self.campus:
            t = e.get("tags", {})
            if e["type"] == "relation" and t.get("leisure") == "track":
                outers = relation_rings(e, "outer")
                inners = relation_rings(e, "inner")
                for o in outers:
                    self.drape_poly(mb, o, [h for h in inners if points_in_poly([h[0][0]], [h[0][1]], o)[0]],
                                    idx["track"], 0.13, step=2.0)
        # roads and paths
        road_seen = set()
        for e in self.campus + ([] if self.game else self.surr):
            if e["type"] != "way" or e["id"] in road_seen:
                continue
            road_seen.add(e["id"])
            t = e.get("tags", {})
            hw = t.get("highway")
            if not hw or t.get("area") == "yes":
                continue
            pts = way_xy(e)
            if len(pts) < 2:
                continue
            if self.game and hw in ("secondary", "tertiary", "residential", "primary", "unclassified"):
                continue  # public streets: the game draws these itself
            w = road_width(t)
            if hw in ("footway", "pedestrian", "steps", "path"):
                self.ribbon(mb, pts, w, idx["concrete"], 0.15)
                continue
            self.ribbon(mb, pts, w, idx["asphalt"], 0.16)
            if hw in ("secondary", "tertiary", "residential") and t.get("oneway") != "yes":
                for off in (-0.1, 0.1):
                    self.dashed(mb, pts, off, 0.1, idx["paint_y"], 0.18, gap=0)
            lanes = t.get("lanes")
            if lanes and lanes.isdigit() and int(lanes) >= 3:
                lw = w / int(lanes)
                for k in range(1, int(lanes)):
                    off = -w / 2 + k * lw
                    if abs(off) > 0.3:
                        self.dashed(mb, pts, off, 0.1, idx["paint_w"], 0.18)
        ob = mb.build("Ground_Surfaces", self.col["Ground"], mats)
        self.report["counts"]["ground_faces"] = len(mb.f)
        return ob

    # ---- buildings
    def collect_buildings(self):
        for e in self.campus + self.load_extra_structures():
            t = e.get("tags", {})
            if "building" not in t or e["type"] != "way":
                continue
            ring = ccw(clean_ring(way_xy(e)) if "ring" not in e else e["ring"])
            if len(ring) < 3:
                continue
            name = t.get("name") or f"Building_{e['id']}"
            self.buildings.append({"id": str(e["id"]), "name": name, "ring": ring, "tags": t,
                                   "openings": {}, "confidence": e.get("confidence", "osm")})

    def load_extra_structures(self):
        p = DATA / "lidar" / "structures.json"
        if not p.exists():
            return []
        out = []
        for s in json.loads(p.read_text()):
            out.append({"type": "way", "id": s["id"], "ring": [tuple(q) for q in s["ring"]],
                        "tags": {"building": s.get("kind", "yes"), "name": s.get("name", f"Structure_{s['id']}"),
                                 "height": str(s.get("height", 3.5))},
                        "confidence": "lidar-only"})
        return out

    def building_heights(self, b):
        ring = b["ring"]
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        gz = self.world.ground(xs, ys)
        b["ground"] = float(np.nanmin(gz))
        b["ground_med"] = float(np.nanmedian(gz))
        t = b["tags"]
        dsm = self.world.dsm
        b["roof_mode"] = "flat"
        if dsm is not None:
            step = max(dsm.cell, 0.5)
            gx, gy = np.meshgrid(np.arange(min(xs), max(xs), step), np.arange(min(ys), max(ys), step))
            gx, gy = gx.ravel(), gy.ravel()
            ins = points_in_poly(gx, gy, ring)
            d = dist_to_ring(gx, gy, ring)
            core = ins & (d > 1.0)
            band = ins & (d > 0.6) & (d < 2.0)
            if core.sum() >= 4:
                h = self.world.surface(gx[core], gy[core]) - self.world.ground(gx[core], gy[core])
                h = h[np.isfinite(h)]
                hb = self.world.surface(gx[band], gy[band]) - self.world.ground(gx[band], gy[band])
                hb = hb[np.isfinite(hb)]
                if h.size >= 4:
                    p10, p50, p90 = np.percentile(h, [10, 50, 90])
                    eave = float(np.percentile(hb, 40)) if hb.size >= 4 else float(p10)
                    b["lidar"] = {"p10": float(p10), "p50": float(p50), "p90": float(p90), "eave": eave,
                                  "n": int(h.size)}
                    if p90 < 2.0:
                        self.warn(f"{b['name']}: LiDAR sees no roof (p90 {p90:.1f} m); building may be newer "
                                  f"than the LiDAR survey, using OSM/default height")
                    else:
                        b["roof_mode"] = "dsm" if (p90 - p10) > 1.5 else "flat"
                        b["height"] = float(p50 if b["roof_mode"] == "flat" else eave)
                        b["peak"] = float(p90)
        if "height" not in b:
            if "height" in t:
                b["height"] = float(str(t["height"]).split()[0])
            elif "building:levels" in t:
                b["height"] = float(t["building:levels"]) * 4.2
            else:
                b["height"] = 4.8
            b["peak"] = b["height"]
            b.setdefault("lidar", None)
        b["top"] = b["ground_med"] + b["height"]

    def snap_to_wall(self, x, y, building=None, max_d=8.0):
        best = None
        for b in self.buildings:
            if building and building not in (b["name"], b["id"]):
                continue
            ring = b["ring"]
            for i in range(len(ring)):
                (x1, y1), (x2, y2) = ring[i], ring[(i + 1) % len(ring)]
                dx, dy = x2 - x1, y2 - y1
                L = math.hypot(dx, dy)
                if L < 1.2:
                    continue
                s = max(0.0, min(L, ((x - x1) * dx + (y - y1) * dy) / L))
                px, py = x1 + dx * s / L, y1 + dy * s / L
                d = math.hypot(x - px, y - py)
                if best is None or d < best[0]:
                    best = (d, b, i, s, L)
        if best is None or best[0] > max_d:
            return None
        return best

    def place_openings(self):
        doors = list(self.features.get("doors", []))
        used = {(d.get("lat"), d.get("lon")) for d in doors}
        for e in self.campus:
            t = e.get("tags", {})
            if e["type"] == "node" and "entrance" in t and (e["lat"], e["lon"]) not in used:
                doors.append({"id": f"osm{e['id']}", "lat": e["lat"], "lon": e["lon"], "leaves": 2,
                              "width": 1.83, "height": 2.13, "source": "OSM entrance=" + t["entrance"],
                              "confidence": "position from OSM; leaf count/size assumed"})
        self.doors = []
        for d in doors:
            x, y = (d["x"], d["y"]) if "x" in d else ll2xy(d["lat"], d["lon"])
            hit = self.snap_to_wall(x, y, d.get("building"), max_d=d.get("snap", 8.0))
            if not hit:
                self.warn(f"door {d['id']}: no building wall within snap distance, skipped")
                continue
            dist, b, edge, s, L = hit
            w = float(d.get("width", 0.91 * d.get("leaves", 1)))
            h = float(d.get("height", 2.13))
            s = max(w / 2 + 0.25, min(L - w / 2 - 0.25, s))
            if L < w + 0.5:
                self.warn(f"door {d['id']}: wall {edge} of {b['name']} too short ({L:.1f} m)")
                continue
            b["openings"].setdefault(edge, []).append({"s0": s - w / 2, "s1": s + w / 2, "h": h, "door": d})
            self.doors.append({"d": d, "b": b, "edge": edge, "s": s, "w": w, "h": h})
        # resolve overlaps on the same wall (keep first)
        for b in self.buildings:
            for edge, ops in b["openings"].items():
                ops.sort(key=lambda o: o["s0"])
                keep = []
                for o in ops:
                    if keep and o["s0"] < keep[-1]["s1"] + 0.3:
                        self.warn(f"door {o['door']['id']} overlaps another on {b['name']}, dropped")
                        self.doors = [x for x in self.doors if x["d"] is not o["door"]]
                        continue
                    keep.append(o)
                b["openings"][edge] = keep

    def build_building(self, b):
        ring = b["ring"]
        n = len(ring)
        base = b["ground"] - 0.6  # bury the footing so sloped sites never float
        top_flat = b["top"]
        mats = [self.M["wall"], self.M["roof"], self.M["trim"], self.M["void"], self.M["frame"]]
        W, R, T, V, F = range(5)
        mb = MB()
        eave_z = []
        for (x, y) in ring:
            eave_z.append(top_flat)
        parapet = 0.45 if b["roof_mode"] == "flat" else 0.0
        run = 0.0
        for i in range(n):
            (x1, y1), (x2, y2) = ring[i], ring[(i + 1) % n]
            L = math.dist(ring[i], ring[(i + 1) % n])
            tx, ty = (x2 - x1) / L, (y2 - y1) / L
            nx, ny = ty, -tx  # outward for CCW
            z1t, z2t = eave_z[i] + parapet, eave_z[(i + 1) % n] + parapet

            def P(s, z):
                return (x1 + tx * s, y1 + ty * s, z)

            def ztop(s):
                return z1t + (z2t - z1t) * s / L

            cuts = [0.0]
            ops = b["openings"].get(i, [])
            for o in ops:
                cuts += [o["s0"], o["s1"]]
            cuts.append(L)
            for k in range(len(cuts) - 1):
                sa, sb = cuts[k], cuts[k + 1]
                if sb - sa < 1e-4:
                    continue
                op = next((o for o in ops if abs(o["s0"] - sa) < 1e-6), None)
                uv = lambda s, z: ((run + s) / 2.0, z / 2.0)  # noqa: E731 (2 m stucco tile)
                if op is None:
                    q = [P(sa, base), P(sb, base), P(sb, ztop(sb)), P(sa, ztop(sa))]
                    mb.poly(q, W, [uv(sa, base), uv(sb, base), uv(sb, ztop(sb)), uv(sa, ztop(sa))])
                    continue
                sill = self.world.g1(*P((sa + sb) / 2, 0)[:2]) + 0.02
                head = sill + op["h"]
                op["sill"] = sill
                # wall above the door and the buried strip below it
                mb.poly([P(sa, head), P(sb, head), P(sb, ztop(sb)), P(sa, ztop(sa))], W,
                        [uv(sa, head), uv(sb, head), uv(sb, ztop(sb)), uv(sa, ztop(sa))])
                mb.poly([P(sa, base), P(sb, base), P(sb, sill), P(sa, sill)], W)
                M = frame(P(sa, 0), (tx, ty))
                if self.game and op["door"].get("room"):
                    for (fx0, fx1, fz0, fz1) in ((-0.08, 0.0, sill, head + 0.08), (sb - sa, sb - sa + 0.08, sill, head + 0.08),
                                                 (0.0, sb - sa, head, head + 0.08)):
                        mb.box(M, fx0, fx1, -0.03, 0.02, fz0, fz1, F)
                    continue
                # dark vestibule behind the doors (inverted box, open toward the outside)
                depth = 2.0
                w = sb - sa
                vb = MB()
                vb.box(M, 0, w, 0.0, depth, sill, head, 0, inverted=True)
                # drop the face that sits in the wall plane (local y = 0 side): it's index 2
                for kk in range(6):
                    if kk == 2:
                        continue
                    face = vb.f[kk]
                    mb.poly([vb.v[q] for q in face], V)
                # frame trim on the outside face
                for (fx0, fx1, fz0, fz1) in ((-0.08, 0.0, sill, head + 0.08), (w, w + 0.08, sill, head + 0.08),
                                             (0.0, w, head, head + 0.08)):
                    mb.box(M, fx0, fx1, -0.03, 0.02, fz0, fz1, F)
            run += L
        # roof
        if b["roof_mode"] == "dsm" and self.world.dsm is not None:
            pv, tris = triangulate(ring, [], 1.0)
            xs = np.array([p[0] for p in pv])
            ys = np.array([p[1] for p in pv])
            zs = self.world.surface(xs, ys)
            d = dist_to_ring(xs, ys, ring)
            zs = np.where(d < 0.05, top_flat, np.nan_to_num(zs, nan=top_flat))
            zs = np.maximum(zs, top_flat)  # never dip below the eave
            zs = np.minimum(zs, b["ground_med"] + b["peak"] + 1.0)
        else:
            inset = []
            if parapet:
                # parapet inner face + cap, roof deck at top_flat
                inset = self._inset(ring, 0.3)
            deck_ring = inset or ring
            pv, tris = triangulate(deck_ring, [], 0)
            zs = np.full(len(pv), top_flat)
            if inset:
                for i in range(n):
                    a, b2 = ring[i], ring[(i + 1) % n]
                    ia, ib = inset[i], inset[(i + 1) % n]
                    zt = top_flat + parapet
                    mb.poly([(a[0], a[1], zt), (b2[0], b2[1], zt), (ib[0], ib[1], zt), (ia[0], ia[1], zt)], T)
                    mb.poly([(ib[0], ib[1], top_flat), (ia[0], ia[1], top_flat), (ia[0], ia[1], zt),
                             (ib[0], ib[1], zt)], W)
        base_i = len(mb.v)
        for (x, y), z in zip(pv, zs):
            mb.vert((x, y, z))
        for tri in tris:
            uvs = [self.ortho_uv(pv[i][0], pv[i][1]) if self.ortho else (pv[i][0] / 4, pv[i][1] / 4) for i in tri]
            mb.face([base_i + i for i in tri], R, uvs)
        ob = mb.build(f"BLD_{b['name'].replace(' ', '_')}", self.col["Buildings"], mats)
        ob["gtp_kind"] = "building"
        ob["gtp_id"] = b["id"]
        ob["gtp_name"] = b["name"]
        ob["gtp_height_m"] = round(b["height"], 2)
        ob["gtp_height_source"] = "lidar" if b.get("lidar") else "osm/default"
        ob["gtp_confidence"] = b["confidence"]
        return ob

    @staticmethod
    def _inset(ring, d):
        out = []
        n = len(ring)
        for i in range(n):
            p0, p1, p2 = ring[i - 1], ring[i], ring[(i + 1) % n]
            def nrm(a, b):
                dx, dy = b[0] - a[0], b[1] - a[1]
                L = math.hypot(dx, dy) or 1
                return (-dy / L, dx / L)  # inward (left) for CCW
            n1, n2 = nrm(p0, p1), nrm(p1, p2)
            bx, by = n1[0] + n2[0], n1[1] + n2[1]
            bl = math.hypot(bx, by)
            if bl < 1e-6:
                return []
            cos_half = (bx * n1[0] + by * n1[1]) / bl
            if cos_half < 0.3:
                return []  # very sharp corner; skip the parapet rather than make spikes
            k = d / cos_half
            out.append((p1[0] + bx / bl * k, p1[1] + by / bl * k))
        return out if signed_area(out) > 0 else []

    # ---- doors
    def build_doors(self):
        th = 0.045
        for i, dd in enumerate(self.doors):
            b, d = dd["b"], dd["d"]
            ring = b["ring"]
            e = dd["edge"]
            (x1, y1), (x2, y2) = ring[e], ring[(e + 1) % len(ring)]
            L = math.dist(ring[e], ring[(e + 1) % len(ring)])
            tx, ty = (x2 - x1) / L, (y2 - y1) / L
            nx, ny = ty, -tx
            s0, s1 = dd["s"] - dd["w"] / 2, dd["s"] + dd["w"] / 2
            sill = next(o["sill"] for o in b["openings"][e] if o["door"] is d)
            leaves = int(d.get("leaves", 1))
            hinge_side = d.get("hinge", "left")
            leaf_w = dd["w"] / leaves - 0.006
            gid = d["id"]
            track = f"{gid}_open"
            specs = []
            if leaves == 2:
                specs = [(s0, +1), (s1, -1)]
            else:
                specs = [(s0, +1)] if hinge_side == "left" else [(s1, -1)]
            for k, (hs, dirsign) in enumerate(specs):
                hx, hy = x1 + tx * hs - nx * 0.06, y1 + ty * hs - ny * 0.06
                mb = MB()
                I = Matrix.Identity(4)
                mb.box(I, 0.003, leaf_w, -th / 2, th / 2, 0.0, dd["h"] - 0.01, 0)
                # vision panel (glass inset both faces) and pull handle on the outside face
                gw, gh = leaf_w * 0.28, 0.55
                gx0 = leaf_w * 0.62 - gw / 2
                mb.box(I, gx0, gx0 + gw, -th / 2 - 0.002, th / 2 + 0.002, 1.25, 1.25 + gh, 1)
                # handle sits on the outward side; outward is local -Y for dirsign +1, +Y for -1
                hy0 = -th / 2 - 0.06 if dirsign > 0 else th / 2 + 0.02
                mb.box(I, leaf_w - 0.12, leaf_w - 0.09, hy0, hy0 + 0.04, 0.9, 1.25, 2)
                mb.box(I, 0.003, leaf_w, -th / 2 - 0.001, th / 2 + 0.001, 0.0, 0.25, 2)  # kick plate
                ob = mb.build(f"DOOR_{gid}_{k}", self.col["Doors"], [self.M["door"], self.M["glass"],
                                                                         self.M["steel"]])
                ang = math.atan2(ty * dirsign, tx * dirsign)
                ob.location = (hx, hy, sill)
                ob.rotation_euler = (0, 0, ang)
                swing = math.radians(float(d.get("swing_deg", 95)))
                # exterior doors open outward: local -Y is outward when the leaf points along +t
                # leaf local +X runs hinge->latch; outward is local -Y when the leaf runs along the
                # wall direction (dirsign +1) and local +Y otherwise, so swing sign follows dirsign
                add_open_anim(ob, track, [("rotation_euler", 2, ang, ang - dirsign * swing)])
                tag(ob, "door", gid, anim=track, building=b["name"], leaf=k, swing_deg=math.degrees(swing),
                    room=d.get("room", ""),
                    source=d.get("source", "features.json"), confidence=d.get("confidence", ""))
                ob["gtp_anchor_ref"] = f"BLD_{b['name'].replace(' ', '_')}"
        self.report["counts"]["doors"] = len(self.doors)

    # ---- gates and fences
    def find_way_dir(self, node_id, lat, lon):
        x, y = ll2xy(lat, lon)
        for e in self.surr + self.campus:
            if e["type"] != "way" or "nodes" not in e:
                continue
            if node_id in e["nodes"]:
                i = e["nodes"].index(node_id)
                pts = way_xy(e)
                a = pts[max(i - 1, 0)]
                b = pts[min(i + 1, len(pts) - 1)]
                dx, dy = b[0] - a[0], b[1] - a[1]
                L = math.hypot(dx, dy) or 1
                return e, (dx / L, dy / L)
        return None, None

    def build_gates(self):
        gates = {g["id"]: g for g in self.features.get("gates", [])}
        for e in self.surr + self.campus:
            t = e.get("tags", {})
            if e["type"] == "node" and t.get("barrier") in ("gate", "sliding_gate", "swing_gate", "lift_gate"):
                gid = f"osm{e['id']}"
                if gid in gates:
                    gates[gid].setdefault("node", e)
                    continue
                gates[gid] = {"id": gid, "lat": e["lat"], "lon": e["lon"], "node": e,
                              "source": "OSM barrier=" + t["barrier"],
                              "confidence": "position from OSM; style/size assumed"}
        cx, cy = poly_centroid(ccw(clean_ring(way_xy(next(e for e in self.campus if e.get("id") == CAMPUS_WAY)))))
        mats = [self.M["steel"], self.M["chain"]]
        fence_mb = MB()
        n = 0
        for gid, g in gates.items():
            x, y = ll2xy(g["lat"], g["lon"])
            way, wdir = (None, None)
            if "node" in g:
                way, wdir = self.find_way_dir(g["node"]["id"], g["lat"], g["lon"])
            if "heading_deg" in g:
                a = math.radians(g["heading_deg"])
                wdir = (math.sin(a), math.cos(a))
            if wdir is None:
                self.warn(f"gate {gid}: unknown orientation, skipped")
                continue
            span = float(g.get("width") or (road_width(way.get("tags", {})) + 0.6 if way else 4.0))
            height = float(g.get("height", 1.83))
            kind = g.get("kind") or ("double_swing" if span > 4.5 else "swing")
            ax, ay = -wdir[1], wdir[0]  # gate line runs across the way
            gx0, gy0 = x - ax * span / 2, y - ay * span / 2
            z = self.world.g1(x, y)
            # campus side decides swing direction (gates swing into the property)
            inward = 1 if ((cx - x) * wdir[0] + (cy - y) * wdir[1]) > 0 else -1
            track = f"{gid}_open"
            # posts + 3 m fence wings either side
            M = frame((gx0, gy0, z), (ax, ay))
            for px in (-0.1, span):
                fence_mb.box(M, px, px + 0.1, -0.05, 0.05, -0.3, height + 0.1, 0)
            for wx0, wx1 in ((-3.1, -0.1), (span + 0.1, span + 3.1)):
                fence_mb.box(M, wx0, wx1, -0.01, 0.01, 0.05, height, 1)
                fence_mb.box(M, wx0, wx1, -0.02, 0.02, height - 0.04, height, 0)
                fence_mb.box(M, wx0 + (wx1 - wx0) / 2 - 0.03, wx0 + (wx1 - wx0) / 2 + 0.03, -0.03, 0.03,
                             -0.3, height + 0.05, 0)
            leaves = [(0.0, +1), (span, -1)] if kind == "double_swing" else [(0.0, +1)]
            leaf_w = span / len(leaves) - 0.02
            for k, (hs, dirsign) in enumerate(leaves):
                mb = MB()
                I = Matrix.Identity(4)
                for (bx0, bx1, bz0, bz1) in ((0, 0.05, 0.05, height), (leaf_w - 0.05, leaf_w, 0.05, height),
                                             (0, leaf_w, height - 0.05, height), (0, leaf_w, 0.05, 0.1),
                                             (0, leaf_w, height / 2 - 0.025, height / 2 + 0.025)):
                    mb.box(I, bx0, bx1, -0.025, 0.025, bz0, bz1, 0)
                mb.box(I, 0.05, leaf_w - 0.05, -0.005, 0.005, 0.1, height - 0.05, 1)
                ob = mb.build(f"GATE_{gid}_{k}", self.col["Gates"], mats)
                hx, hy = gx0 + ax * hs, gy0 + ay * hs
                ang = math.atan2(ay * dirsign, ax * dirsign)
                ob.location = (hx, hy, z)
                ob.rotation_euler = (0, 0, ang)
                if kind == "sliding":
                    add_open_anim(ob, track, [("location", 0, hx, hx - ax * span),
                                              ("location", 1, hy, hy - ay * span)])
                else:
                    # local +Y of the leaf points to the left of its run; rotate toward campus
                    left = (-ay * dirsign, ax * dirsign)
                    toward = 1 if (left[0] * wdir[0] + left[1] * wdir[1]) * inward > 0 else -1
                    add_open_anim(ob, track, [("rotation_euler", 2, ang, ang + toward * math.radians(90))])
                tag(ob, "gate", gid, anim=track, gate_type=kind, leaf=k, source=g.get("source", "features.json"),
                    confidence=g.get("confidence", ""))
            n += 1
        # free-standing fences from features.json (lat/lon polylines)
        for f in self.features.get("fences", []):
            pts = [ll2xy(a, b) for a, b in f["path"]]
            h = float(f.get("height", 1.83))
            for i in range(len(pts) - 1):
                (x1, y1), (x2, y2) = pts[i], pts[i + 1]
                L = math.dist(pts[i], pts[i + 1])
                if L < 0.1:
                    continue
                z1 = self.world.g1(x1, y1)
                M = frame((x1, y1, z1), ((x2 - x1) / L, (y2 - y1) / L))
                fence_mb.box(M, 0, L, -0.01, 0.01, 0.05, h, 1)
                fence_mb.box(M, 0, L, -0.02, 0.02, h - 0.04, h, 0)
                for s in np.arange(0, L, 3.0):
                    zz = self.world.g1(x1 + (x2 - x1) * s / L, y1 + (y2 - y1) * s / L) - z1
                    fence_mb.box(M, s, s + 0.06, -0.03, 0.03, zz - 0.3, zz + h + 0.05, 0)
        if fence_mb.f:
            fence_mb.build("Fences", self.col["Fences"], mats)
        self.report["counts"]["gates"] = n

    # ---- signs
    def sign_post(self, mb, M, top, mat, r=0.03):
        mb.cylinder(M, r, -0.4, top, mat, seg=8)

    def text_on(self, mb, M, text, size, mat, x=0.0, z=0.0, y=-0.004, max_w=None, extrude=0.0):
        me = text_mesh(text, size, extrude)
        w = mesh_width(me)
        sx = 1.0
        if max_w and w > max_w:
            sx = max_w / w
        T = text_frame(M) @ Matrix.Translation((x, z, -y)) @ Matrix.Diagonal((sx, 1, 1, 1))
        mb.add_mesh(me, T, mat)
        bpy.data.meshes.remove(me)
        return w * sx

    def street_name_signs(self):
        ways = [e for e in self.surr if e["type"] == "way" and e.get("tags", {}).get("name")
                and e["tags"].get("highway") in ("secondary", "tertiary", "residential", "unclassified")]
        node_ways = {}
        for e in ways:
            for i, nid in enumerate(e["nodes"]):
                node_ways.setdefault(nid, []).append((e, i))
        mats = [self.M["steel"], self.M["sign_green"], self.M["sign_white"]]
        count = 0
        for nid, lst in node_ways.items():
            names = {}
            for e, i in lst:
                names.setdefault(e["tags"]["name"], (e, i))
            if len(names) < 2:
                continue
            (ea, ia), (eb, ib) = list(names.values())[:2]
            pa, pb = way_xy(ea), way_xy(eb)
            P = pa[ia]

            def away(pts, i):
                j = i + 1 if i + 1 < len(pts) else i - 1
                dx, dy = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
                L = math.hypot(dx, dy) or 1
                return dx / L, dy / L
            da, db = away(pa, ia), away(pb, ib)
            bis = (da[0] + db[0], da[1] + db[1])
            bl = math.hypot(*bis)
            if bl < 0.2:
                bis = (-da[1], da[0])
                bl = 1
            off = max(road_width(ea["tags"]), road_width(eb["tags"])) / 2 + 2.0
            x, y = P[0] + bis[0] / bl * off, P[1] + bis[1] / bl * off
            z = self.world.g1(x, y)
            mb = MB()
            base = Matrix.Translation((x, y, z))
            self.sign_post(mb, base, 3.4, 0)
            for k, (e, d) in enumerate(((ea, da), (eb, db))):
                label = abbreviate(e["tags"]["name"])
                zc = 3.05 + k * 0.26
                M = frame((x, y, z + zc), d)
                me = text_mesh(label, 0.15)
                tw = mesh_width(me)
                bpy.data.meshes.remove(me)
                bw = max(0.6, tw + 0.25)
                mb.box(M, -bw / 2, bw / 2, -0.012, 0.012, -0.115, 0.115, 1)
                # both faces
                self.text_on(mb, M, label, 0.15, 2, z=0.0, y=-0.013)
                Mb = frame((x, y, z + zc), (-d[0], -d[1]))
                self.text_on(mb, Mb, label, 0.15, 2, z=0.0, y=-0.013)
            ob = mb.build(f"SIGN_street_{nid}", self.col["Signs"], mats)
            tag(ob, "sign", f"street_{nid}", text=" / ".join(names), mutcd="D3-1",
                confidence="placement estimated at intersection corner")
            count += 1
        return count

    def stop_signs(self):
        mats = [self.M["steel"], self.M["sign_red"], self.M["sign_white"], self.M["sign_back"]]
        count = 0
        for e in self.surr + self.campus:
            t = e.get("tags", {})
            if e["type"] != "node" or t.get("highway") != "stop":
                continue
            way, wdir = self.find_way_dir(e["id"], e["lat"], e["lon"])
            if not way:
                continue
            travel = wdir if t.get("direction", "forward") != "backward" else (-wdir[0], -wdir[1])
            x0, y0 = ll2xy(e["lat"], e["lon"])
            off = road_width(way.get("tags", {})) / 2 + 0.8
            right = (travel[1], -travel[0])
            x, y = x0 + right[0] * off, y0 + right[1] * off
            z = self.world.g1(x, y)
            mb = MB()
            self.sign_post(mb, Matrix.Translation((x, y, z)), 2.5, 0)
            # frame() puts the viewer on its -y side; using the driver's right as the frame's right
            # makes the face point back along -travel, i.e. at the approaching driver
            M = frame((x, y, z + 2.5), right)
            oct_r = 0.38  # 30 in R1-1
            ring = [(oct_r * math.cos(math.radians(22.5 + 45 * k)), oct_r * math.sin(math.radians(22.5 + 45 * k)))
                    for k in range(8)]
            front = [M @ Vector((px, -0.01, pz)) for px, pz in ring]
            back = [M @ Vector((px, 0.01, pz)) for px, pz in ring]
            mb.poly(front, 1)
            mb.poly(back[::-1], 3)
            for k in range(8):
                j = (k + 1) % 8
                mb.poly([front[k], front[j], back[j], back[k]], 3)
            self.text_on(mb, M, "STOP", 0.2, 2, y=-0.012)
            ob = mb.build(f"SIGN_stop_{e['id']}", self.col["Signs"], mats)
            tag(ob, "sign", f"stop_{e['id']}", text="STOP", mutcd="R1-1", source="OSM highway=stop",
                confidence="position from OSM; side of road assumed")
            count += 1
        return count

    def traffic_signals(self):
        mats = [self.M["signal_body"], self.M["lens_red"], self.M["lens_off"], self.M["steel"]]
        count = 0
        for e in self.surr:
            t = e.get("tags", {})
            if e["type"] != "node" or t.get("highway") != "traffic_signals":
                continue
            way, wdir = self.find_way_dir(e["id"], e["lat"], e["lon"])
            if not way:
                continue
            dirn = t.get("traffic_signals:direction", t.get("direction", "forward"))
            travel = wdir if dirn != "backward" else (-wdir[0], -wdir[1])
            x0, y0 = ll2xy(e["lat"], e["lon"])
            hw = road_width(way.get("tags", {})) / 2
            right = (travel[1], -travel[0])
            px, py = x0 + right[0] * (hw + 1.0), y0 + right[1] * (hw + 1.0)
            z = self.world.g1(px, py)
            mb = MB()
            mb.cylinder(Matrix.Translation((px, py, z)), 0.15, -0.5, 6.4, 3, seg=12)
            arm_len = hw + 0.5
            Ma = frame((px, py, z + 6.0), (-right[0], -right[1]))
            mb.box(Ma, 0, arm_len, -0.08, 0.08, -0.08, 0.08, 3)
            # one 3-section head over the travel lane, facing oncoming traffic
            hx, hy = px - right[0] * (arm_len - 0.6), py - right[1] * (arm_len - 0.6)
            Mh = frame((hx, hy, z + 5.1), (right[0], right[1]))
            mb.box(Mh, -0.18, 0.18, -0.15, 0.15, 0.0, 1.05, 0)
            for k, mat in enumerate((2, 2, 1)):  # bottom green(off), yellow(off), top red(on)
                zc = 0.18 + k * 0.34
                Ml = Mh @ Matrix.Translation((0, -0.16, zc))
                disc = [Ml @ Vector((0.13 * math.cos(2 * math.pi * s / 12), 0, 0.13 * math.sin(2 * math.pi * s / 12)))
                        for s in range(12)]
                mb.poly(disc, mat)
            ob = mb.build(f"SIGNAL_{e['id']}", self.col["Traffic"], mats)
            tag(ob, "traffic_signal", f"signal_{e['id']}", source="OSM highway=traffic_signals",
                confidence="node position from OSM; mast arm layout assumed")
            count += 1
        return count

    def feature_signs(self):
        """Signs listed in features.json: monument, wall_text, school_zone, custom."""
        count = 0
        for s in self.features.get("signs", []):
            kind = s["kind"]
            if "lat" not in s:
                continue
            x, y = ll2xy(s["lat"], s["lon"])
            mb = MB()
            mats = [self.M["monument"], self.M["sign_white"], self.M["marquee_led"], self.M["sign_black"],
                    self.M["sign_ygreen"], self.M["steel"]]
            heading = s.get("facing_deg")
            if kind == "wall_text":
                hit = self.snap_to_wall(x, y, s.get("building"), 10.0)
                if not hit:
                    self.warn(f"sign {s['id']}: no wall nearby")
                    continue
                _, b, edge, sd, L = hit
                ring = b["ring"]
                (x1, y1), (x2, y2) = ring[edge], ring[(edge + 1) % len(ring)]
                tx, ty = (x2 - x1) / L, (y2 - y1) / L
                nx, ny = ty, -tx
                px, py = x1 + tx * sd + nx * 0.02, y1 + ty * sd + ny * 0.02
                z = float(s.get("height_m", 3.0)) + self.world.g1(px, py)
                M = frame((px, py, z), (tx, ty))
                self.text_on(mb, M, s["text"], float(s.get("size", 0.6)),
                             {"white": 1, "black": 3}.get(s.get("color", "black"), 3), y=-0.01, extrude=0.01)
            else:
                if heading is None:
                    self.warn(f"sign {s['id']}: facing_deg missing, skipped")
                    continue
                a = math.radians(heading)
                facing = (math.sin(a), math.cos(a))
                right = (-facing[1], facing[0])  # frame right whose viewer-normal equals `facing`
                z = self.world.g1(x, y)
                M = frame((x, y, z), right)
                if kind == "monument":
                    W = float(s.get("width", 4.0))
                    H = float(s.get("height", 2.4))
                    mb.box(M, -W / 2, W / 2, -0.25, 0.25, -0.3, H, 0)
                    lines = s.get("lines", [])
                    led = s.get("led_panel")
                    zt = H - 0.35
                    for ln in lines:
                        self.text_on(mb, M, ln, float(s.get("text_size", 0.32)), 1, z=zt, y=-0.27, max_w=W - 0.4,
                                     extrude=0.01)
                        zt -= float(s.get("text_size", 0.32)) * 1.35
                    if led:
                        lz0 = float(led.get("z0", 0.3))
                        lz1 = float(led.get("z1", zt))
                        lw = float(led.get("width", W - 0.6))
                        mb.box(M, -lw / 2, lw / 2, -0.27, -0.25, lz0, lz1, 3)
                        msg = led.get("text", "")
                        if msg:
                            self.text_on(mb, M, msg, (lz1 - lz0) * 0.32, 2, z=(lz0 + lz1) / 2, y=-0.272,
                                         max_w=lw - 0.2)
                    if s.get("double_sided", True):
                        Mb = frame((x, y, z), (-right[0], -right[1]))
                        zt = H - 0.35
                        for ln in lines:
                            self.text_on(mb, Mb, ln, float(s.get("text_size", 0.32)), 1, z=zt, y=-0.27,
                                         max_w=W - 0.4, extrude=0.01)
                            zt -= float(s.get("text_size", 0.32)) * 1.35
                elif kind == "school_zone":
                    self.sign_post(mb, Matrix.Translation((x, y, z)), 2.9, 5)
                    Ms = frame((x, y, z + 2.4), right)
                    w = 0.91
                    pent = [(-w / 2, 0), (w / 2, 0), (w / 2, w * 0.6), (0, w), (-w / 2, w * 0.6)]
                    mb.poly([Ms @ Vector((px, -0.01, pz)) for px, pz in pent], 4)
                    mb.poly([Ms @ Vector((px, 0.01, pz)) for px, pz in pent][::-1], 5)
                    self.text_on(mb, Ms, "SCHOOL", 0.12, 3, z=0.2, y=-0.012)
                else:
                    self.warn(f"sign {s['id']}: unknown kind {kind}")
                    continue
            ob = mb.build(f"SIGN_{s['id']}", self.col["Signs"], mats)
            tag(ob, "sign", s["id"], text=" | ".join(s.get("lines", [s.get("text", "")])),
                source=s.get("source", ""), confidence=s.get("confidence", ""))
            count += 1
        return count

    # ---- vegetation & lights
    def trees(self):
        mb = MB()
        n = 0
        for e in self.campus + self.surr:
            if e["type"] == "node" and e.get("tags", {}).get("natural") == "tree":
                x, y = ll2xy(e["lat"], e["lon"])
                z = self.world.g1(x, y)
                h = 8.0
                s = self.world.surface([x], [y])
                if s is not None and np.isfinite(s[0]) and s[0] - z > 2.5:
                    h = float(min(s[0] - z, 30.0))
                M = Matrix.Translation((x, y, z))
                mb.cylinder(M, 0.18, 0, h * 0.45, 0, seg=7)
                # canopy: two stacked octagonal prisms tapered = cheap low-poly crown
                r = max(1.5, h * 0.32)
                for (z0, z1, rr) in ((h * 0.4, h * 0.75, r), (h * 0.75, h, r * 0.65)):
                    mb.cylinder(M, rr, z0, z1, 1, seg=8)
                n += 1
        if mb.f:
            mb.build("Trees", self.col["Vegetation"], [self.M["trunk"], self.M["leaf"]])
        return n

    def light_poles(self):
        p = DATA / "lidar" / "poles.json"
        poles = json.loads(p.read_text()) if p.exists() else []
        mb = MB()
        for i, pole in enumerate(poles):
            x, y, h = pole["x"], pole["y"], float(pole["height"])
            z = self.world.g1(x, y)
            M = Matrix.Translation((x, y, z))
            mb.cylinder(M, 0.25 if h > 15 else 0.1, -0.5, h, 0, seg=10)
            if h > 15:  # stadium bank
                Mb = frame((x, y, z + h - 1.5), (1, 0))
                mb.box(Mb, -1.5, 1.5, -0.2, 0.2, 0, 1.6, 1)
            else:
                mb.box(M @ Matrix.Translation((0, 0, h)), -0.3, 0.3, -0.12, 0.12, -0.12, 0.0, 1)
        if mb.f:
            ob = mb.build("Light_Poles", self.col["Lights"], [self.M["steel"], self.M["lamp"]])
            tag(ob, "light", "lidar_poles", source="LiDAR tall-structure detection",
                confidence="positions from LiDAR; pole style assumed")
        return len(poles)

    # ---- preview
    def preview(self, out_stem):
        sc = bpy.context.scene
        world = bpy.data.worlds.new("Sky")
        world.use_nodes = True
        nt = world.node_tree
        bg = nt.nodes.get("Background")
        try:
            sky = nt.nodes.new("ShaderNodeTexSky")
            sky.sky_type = "MULTIPLE_SCATTERING"
            sky.sun_elevation = math.radians(38)
            sky.sun_rotation = math.radians(200)
            nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
            bg.inputs["Strength"].default_value = 1.0
        except Exception:  # sky model unavailable: flat colour
            bg.inputs["Color"].default_value = (0.55, 0.7, 0.9, 1)
        sc.world = world
        sun_d = bpy.data.lights.new("Sun", "SUN")
        sun_d.energy = 4.0
        sun_d.angle = math.radians(0.6)
        sun = bpy.data.objects.new("Sun", sun_d)
        sun.rotation_euler = (math.radians(52), 0, math.radians(200))
        sc.collection.objects.link(sun)
        sc.render.engine = "BLENDER_EEVEE"
        sc.render.resolution_x, sc.render.resolution_y = 1280, 720
        sc.render.image_settings.file_format = "PNG"
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.exposure = -0.9
        cam_d = bpy.data.cameras.new("Cam")
        cam_d.lens = 28
        cam_d.clip_start = 0.3
        cam_d.clip_end = 3000
        cam = bpy.data.objects.new("PreviewCam", cam_d)
        sc.collection.objects.link(cam)
        sc.camera = cam
        shots = []
        cx, cy = poly_centroid(ccw(clean_ring(way_xy(next(e for e in self.campus if e.get("id") == CAMPUS_WAY)))))
        cz = self.world.g1(cx, cy)
        shots.append(("aerial", (cx + 260, cy - 380, cz + 260), (cx, cy, cz)))
        only = set(self.args.views.split(",")) if getattr(self.args, "views", None) else None
        if only is not None and "aerial" not in only:
            shots.clear()
        for v in self.features.get("preview_views", []):
            if only is not None and v["name"] not in only:
                continue
            if "x" in v:  # local frame metres
                px, py, tx, ty = v["x"], v["y"], v["look_x"], v["look_y"]
            else:
                px, py = ll2xy(v["lat"], v["lon"])
                tx, ty = ll2xy(v["look_lat"], v["look_lon"])
            shots.append((v["name"], (px, py, self.world.g1(px, py) + v.get("eye_m", 1.7)),
                          (tx, ty, self.world.g1(tx, ty) + v.get("look_up_m", 1.5))))
        walks = getattr(self, "_walkways", {})
        if walks and (only is None or "campus_walk" in only):
            (bid, e), lst = sorted(walks.items(), key=lambda kv: -len(kv[1]))[0]
            bd = next(bb for bb in self.buildings if bb["id"] == bid)
            (x1, y1), (x2, y2) = bd["ring"][e], bd["ring"][(e + 1) % len(bd["ring"])]
            L = math.dist((x1, y1), (x2, y2))
            tx, ty = (x2 - x1) / L, (y2 - y1) / L
            nx, ny = ty, -tx
            mx, my = x1 + tx * L * 0.3, y1 + ty * L * 0.3
            gz0 = self.world.g1(mx, my)
            shots.append(("campus_walk", (mx + nx * 9 - tx * 6, my + ny * 9 - ty * 6, gz0 + 1.7),
                          (mx + tx * 6, my + ty * 6, gz0 + 2.0)))
        if self.doors and (only is None or "door" in only):
            dd = self.doors[0]
            b = dd["b"]
            ring = b["ring"]
            e = dd["edge"]
            (x1, y1), (x2, y2) = ring[e], ring[(e + 1) % len(ring)]
            L = math.dist(ring[e], ring[(e + 1) % len(ring)])
            tx, ty = (x2 - x1) / L, (y2 - y1) / L
            nx, ny = ty, -tx
            px, py = x1 + tx * dd["s"], y1 + ty * dd["s"]
            z = self.world.g1(px, py)
            shots.append(("door", (px + nx * 9 + tx * 3, py + ny * 9 + ty * 3, z + 2.2), (px, py, z + 1.2)))
        out = []
        for name, eye, look in shots:
            cam.location = eye
            d = Vector(look) - Vector(eye)
            cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
            frames = [1, 1 + OPEN_FRAMES] if name == "door" else [1]
            for f in frames:
                if name == "door":
                    for ob in self.col["Doors"].objects:
                        ob.animation_data.action = None
                    sc.frame_set(f)
                else:
                    sc.frame_set(1)
                sc.render.filepath = f"{out_stem}_{name}{'_open' if f > 1 else ''}.png"
                bpy.ops.render.render(write_still=True)
                out.append(sc.render.filepath)
        return out

    # ---- run
    def run(self):
        global _FONT
        a = self.args
        if a.font:
            _FONT = bpy.data.fonts.load(a.font)
        self.setup_scene()
        if self.game:
            self.ground_cover()
        else:
            self.terrain()
        self.ground_layers()
        self.collect_buildings()
        for b in self.buildings:
            self.building_heights(b)
        import phs_facades as FC  # noqa: E402
        FC.extra_materials(self)
        FC.plan_classroom_doors(self)
        self.place_openings()
        for b in self.buildings:
            self.build_building(b)
        self.build_doors()
        self.build_gates()
        FC.dress_buildings(self)
        FC.furniture(self)
        import phs_details as DT  # noqa: E402 (needs the module alias set at import time)
        DT.sports_markings(self)
        self.report["counts"]["structures"] = DT.structures(self)
        self.report["counts"]["roof_equipment"] = DT.roof_equipment(self)
        if not self.game:  # in the game, roads, signals and street signs belong to the city-wide systems
            self.report["counts"]["street_signs"] = self.street_name_signs()
            self.report["counts"]["stop_signs"] = self.stop_signs()
            self.report["counts"]["traffic_signals"] = self.traffic_signals()
        self.report["counts"]["feature_signs"] = self.feature_signs()
        import phs_signs as SG  # noqa: E402
        self.report["counts"]["campus_signs"] = SG.build_signs(self)
        self.report["counts"]["trees"] = self.trees()
        self.report["counts"]["light_poles"] = self.light_poles()
        if self.game:
            self.conform_for_game()
        self.report["buildings"] = [
            {"name": b["name"], "id": b["id"], "height_m": round(b["height"], 2),
             "peak_m": round(b.get("peak", b["height"]), 2), "roof": b["roof_mode"],
             "height_source": "lidar" if b.get("lidar") else "osm/default", "confidence": b["confidence"]}
            for b in self.buildings]
        sc = bpy.context.scene
        sc.frame_set(1)
        out = pathlib.Path(a.out).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        if a.render:
            self.report["previews"] = self.preview(str(pathlib.Path(a.render).resolve()))
        bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
        if a.glb:
            bpy.ops.export_scene.gltf(filepath=str(pathlib.Path(a.glb).resolve()), export_format="GLB",
                                      export_extras=True, export_yup=True, export_animations=True,
                                      export_animation_mode="NLA_TRACKS", export_image_format="JPEG",
                                      export_image_quality=85, export_lights=False, use_selection=False)
        if a.fbx:
            bpy.ops.export_scene.fbx(filepath=str(pathlib.Path(a.fbx).resolve()), object_types={"MESH", "EMPTY"},
                                     apply_unit_scale=True, apply_scale_options="FBX_SCALE_UNITS",
                                     axis_forward="-Y", axis_up="Z", bake_anim=True,
                                     bake_anim_use_nla_strips=True, bake_anim_use_all_actions=False,
                                     path_mode="COPY", embed_textures=True, use_custom_props=True)
        if self.game and a.manifest:
            self.write_manifest(a.manifest)
        rep = out.with_suffix(".report.json")
        rep.write_text(json.dumps(self.report, indent=2))
        print("REPORT", json.dumps(self.report["counts"]), "warnings:", len(self.report["warnings"]))


def abbreviate(name):
    rep = {"Road": "Rd", "Street": "St", "Avenue": "Ave", "Lane": "Ln", "Court": "Ct", "Place": "Pl",
           "Trail": "Trl", "Boulevard": "Blvd", "Drive": "Dr", "Way": "Way", "Circle": "Cir"}
    parts = name.split()
    if parts and parts[-1] in rep:
        parts[-1] = rep[parts[-1]]
    return " ".join(parts)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="build/phs/phs.blend")
    ap.add_argument("--glb")
    ap.add_argument("--fbx")
    ap.add_argument("--render", help="path stem for preview PNGs")
    ap.add_argument("--views", help="comma list of preview view names to render (default: all)")
    ap.add_argument("--font", help="TTF/OTF for sign lettering (e.g. an FHWA Series-style font)")
    ap.add_argument("--target", choices=("blender", "game"), default="blender",
                    help="game: campus only, geometry stored relative to the ground for runtime conforming")
    ap.add_argument("--manifest", help="game target: write the colliders/zones/doors manifest JSON here")
    Builder(ap.parse_args(argv)).run()


if __name__ == "__main__":
    main()
