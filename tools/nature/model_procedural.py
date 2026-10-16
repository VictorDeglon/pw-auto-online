"""Procedural palms + eucalyptus for Grand Theft Poway (Blender, headless).

Species / variants (real-world metres, origin at trunk base on the ground, Z-up in Blender, exported Y-up):
  palm_fan_a / palm_fan_b      Mexican fan palm (Washingtonia robusta), ~12 m / ~19 m
  palm_date_a / palm_date_b    Canary Island date palm (Phoenix canariensis), ~8.5 m / ~10.5 m
  eucalyptus_a / eucalyptus_b  blue / red gum (E. globulus / camaldulensis), ~22 m / ~28 m

For each variant it writes <out>/<name>_hi.glb (impostor-bake source, real geometry), <out>/<name>_lod0.glb
(game LOD: low-side trunk/limbs + alpha-cut foliage cards with crown-radial normals and AO in COLOR_0) and
preview renders in <out>/preview/.  Two materials per file: <name>_bark (opaque) and <name>_leaves (MASK 0.5).
All textures are generated here (numpy) or rendered here (card atlases); the eucalyptus bark is the CC0
Poly Haven texture `bark_bluegum`, downloaded with curl into <out>/tex/bark_bluegum/.

Usage:
  blender -b --factory-startup --python tools/nature/model_procedural.py -- --out DIR [--tree palm_fan_a,...|all]
          [--stage textures,models,preview|all] [--samples 64]
"""
import bpy, math, os, sys, time, json, subprocess, argparse
import numpy as np
from mathutils import Vector, Matrix

# ----------------------------------------------------------------------------------------------------------------
# args / config
# ----------------------------------------------------------------------------------------------------------------
def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--tree', default='all')
    ap.add_argument('--stage', default='all')
    ap.add_argument('--samples', type=int, default=16)
    ap.add_argument('--card-samples', type=int, default=16)
    ap.add_argument('--res', type=int, default=512)
    ap.add_argument('--views', default='side,34')
    ap.add_argument('--force-tex', action='store_true')
    ap.add_argument('--device', default='CPU', help='Cycles device: CPU or GPU (Metal)')
    ap.add_argument('--engine', default='EEVEE', help='preview engine: CYCLES or EEVEE')
    return ap.parse_args(argv)

VARIANTS = {
    'palm_fan_a':   dict(species='palm_fan', seed=11, height=12.0),
    'palm_fan_b':   dict(species='palm_fan', seed=23, height=19.0),
    'palm_date_a':  dict(species='palm_date', seed=31, height=8.6),
    'palm_date_b':  dict(species='palm_date', seed=37, height=10.6),
    'eucalyptus_a': dict(species='eucalyptus', seed=41, height=22.0, nlimb=3),
    'eucalyptus_b': dict(species='eucalyptus', seed=53, height=28.0, nlimb=5),
    'opuntia_a':    dict(species='opuntia', seed=61, width=1.6, height=0.9),
    'opuntia_b':    dict(species='opuntia', seed=67, width=2.4, height=1.3),
    'yucca_a':      dict(species='yucca', seed=71, diam=1.0, stalk=False),
    'yucca_b':      dict(species='yucca', seed=73, diam=1.15, stalk=True),
    'agave_a':      dict(species='agave', seed=79, diam=1.8),
}
DEVICE = ['CPU']
ENGINE = ['CYCLES']
SINK = 0.3   # trunks continue this far below z=0 so they never float on uneven ground

def log(*a):
    print('[proc]', *a, flush=True)

# ----------------------------------------------------------------------------------------------------------------
# small numpy helpers
# ----------------------------------------------------------------------------------------------------------------
def nrm(v):
    v = np.asarray(v, float)
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)

def rodrigues(v, axis, ang):
    """rotate vectors v (...,3) about unit axis (...,3) by ang (...)"""
    axis = nrm(axis); ang = np.asarray(ang, float)[..., None] if np.ndim(ang) else ang
    c, s = np.cos(ang), np.sin(ang)
    return v * c + np.cross(axis, v) * s + axis * (np.sum(axis * v, -1, keepdims=True)) * (1 - c)

def rot_toward(d, target, ang):
    """rotate unit vector d toward unit target by at most ang radians"""
    d = nrm(d); target = nrm(target)
    cosa = float(np.clip(np.dot(d, target), -1, 1)); full = math.acos(cosa)
    if full < 1e-6:
        return d
    ax = np.cross(d, target)
    if np.linalg.norm(ax) < 1e-9:
        ax = np.cross(d, [1, 0, 0]) if abs(d[0]) < 0.9 else np.cross(d, [0, 1, 0])
    return nrm(rodrigues(d, nrm(ax), min(ang, full)))

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def lerp(a, b, t):
    return a + (b - a) * t

def perp_frame(t, hint=(0, 0, 1)):
    t = nrm(t); h = np.array(hint, float)
    if abs(np.dot(t, h)) > 0.95:
        h = np.array([1.0, 0, 0]) if abs(t[0]) < 0.9 else np.array([0, 1.0, 0])
    e1 = nrm(np.cross(h, t)); e2 = np.cross(t, e1)
    return e1, e2

def transport_frames(P, hint=(1, 0, 0)):
    """parallel-transport frames along polyline P (n,3): returns T,E1,E2 with E1 x E2 = T"""
    P = np.asarray(P, float); n = len(P)
    T = np.zeros((n, 3))
    T[1:-1] = P[2:] - P[:-2]; T[0] = P[1] - P[0]; T[-1] = P[-1] - P[-2]
    T = nrm(T)
    E1 = np.zeros((n, 3)); E2 = np.zeros((n, 3))
    h = np.array(hint, float)
    if abs(np.dot(h, T[0])) > 0.9:
        h = np.array([0, 1.0, 0]) if abs(T[0][1]) < 0.9 else np.array([0, 0, 1.0])
    E1[0] = nrm(h - T[0] * np.dot(h, T[0]))
    for i in range(1, n):
        a, b = T[i - 1], T[i]
        ax = np.cross(a, b); s = np.linalg.norm(ax)
        e = E1[i - 1]
        if s > 1e-9:
            ang = math.atan2(s, float(np.dot(a, b)))
            e = rodrigues(e, ax / s, ang)
        E1[i] = nrm(e - b * np.dot(e, b))
    E2 = np.cross(T, E1)
    return T, E1, E2

# ---- periodic noise (FFT) ---------------------------------------------------------------------------------------
def fnoise(h, w, scale=8.0, beta=2.0, seed=0, ax=1.0, ay=1.0, fmax=None):
    """tileable fractal noise, zero-mean unit-std.  scale ~ feature count across; ax/ay stretch frequencies
    (ay>1 => features shorter in y).  beta = spectral slope."""
    r = np.random.default_rng(seed)
    wn = r.standard_normal((h, w))
    fy = np.fft.fftfreq(h)[:, None] * h * ay
    fx = np.fft.fftfreq(w)[None, :] * w * ax
    f = np.sqrt(fx ** 2 + fy ** 2)
    f[0, 0] = 1
    amp = 1.0 / np.maximum(f / scale, 1.0) ** (beta / 2) * np.exp(-(f / (scale * 0.25)) ** 2 * 0)
    amp = np.where(f < scale, (f / scale) ** 0.5, (f / scale) ** (-beta / 2))
    if fmax is not None:
        amp *= np.exp(-(f / fmax) ** 2)
    amp[0, 0] = 0
    out = np.real(np.fft.ifft2(np.fft.fft2(wn) * amp))
    out -= out.mean(); out /= out.std() + 1e-9
    return out

def blur_periodic(a, sigma_y, sigma_x=None):
    sigma_x = sigma_y if sigma_x is None else sigma_x
    h, w = a.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi ** 2) * ((fy * sigma_y) ** 2 + (fx * sigma_x) ** 2))
    if a.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(a) * g))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., c]) * g)) for c in range(a.shape[2])], -1)

def height_to_normal(hgt, strength, wrap=True):
    """OpenGL-convention normal map (rows = +v)."""
    if wrap:
        dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5
        dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5
    else:
        dy, dx = np.gradient(hgt)
    n = np.stack([-dx * strength, -dy * strength, np.ones_like(hgt)], -1)
    n = nrm(n)
    return n * 0.5 + 0.5

def dilate_rgba(rgba, alpha_thresh=0.5):
    """push-pull fill of colour into transparent texels (prevents dark fringes on alpha-cut cards)."""
    a = (rgba[..., 3] >= alpha_thresh).astype(float)
    col = rgba[..., :3] * a[..., None]
    levels = [(col, a)]
    c, w = col, a
    while min(c.shape[0], c.shape[1]) > 1:
        H, W = c.shape[0] // 2 * 2, c.shape[1] // 2 * 2
        c = c[:H, :W]; w = w[:H, :W]
        c = (c[0::2, 0::2] + c[1::2, 0::2] + c[0::2, 1::2] + c[1::2, 1::2])
        w = (w[0::2, 0::2] + w[1::2, 0::2] + w[0::2, 1::2] + w[1::2, 1::2])
        levels.append((c, w))
    # pull
    fc = levels[-1][0] / np.maximum(levels[-1][1], 1e-9)[..., None]
    for c, w in reversed(levels[:-1]):
        H, W = c.shape[:2]
        up = np.repeat(np.repeat(fc, 2, 0), 2, 1)
        up = np.pad(up, ((0, max(0, H - up.shape[0])), (0, max(0, W - up.shape[1])), (0, 0)), mode='edge')[:H, :W]
        known = w > 1e-9
        fc = np.where(known[..., None], c / np.maximum(w, 1e-9)[..., None], up)
    out = rgba.copy()
    out[..., :3] = np.where(a[..., None] > 0, rgba[..., :3], fc)
    return out

def hsv2rgb(h, s, v):
    h = (h % 360) / 60.0; c = v * s; x = c * (1 - abs(h % 2 - 1)); m = v - c
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][int(h) % 6]
    return np.array([r + m, g + m, b + m])

# ---- image io through bpy (rows = bottom->top, like UV v) ------------------------------------------------------
def save_image(arr, path, quality=92):
    arr = np.clip(np.asarray(arr, np.float32), 0, 1)
    h, w = arr.shape[:2]
    if arr.ndim == 2:
        arr = np.repeat(arr[..., None], 3, -1)
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], -1)
    name = os.path.basename(path)
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(arr.ravel())
    img.filepath_raw = path
    img.file_format = 'JPEG' if path.lower().endswith('.jpg') else 'PNG'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if img.file_format == 'JPEG':
        img.save(filepath=path, quality=quality)
    else:
        img.save()
    bpy.data.images.remove(img)

def load_image(path):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'   # read raw stored values
    w, h = img.size
    a = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)

def resize(arr, h, w):
    """bilinear resize (no wrap)"""
    H, W = arr.shape[:2]
    ys = (np.arange(h) + 0.5) * H / h - 0.5; xs = (np.arange(w) + 0.5) * W / w - 0.5
    y0 = np.clip(np.floor(ys).astype(int), 0, H - 1); x0 = np.clip(np.floor(xs).astype(int), 0, W - 1)
    y1 = np.clip(y0 + 1, 0, H - 1); x1 = np.clip(x0 + 1, 0, W - 1)
    fy = np.clip(ys - y0, 0, 1)[:, None]; fx = np.clip(xs - x0, 0, 1)[None, :]
    if arr.ndim == 3:
        fy = fy[..., None]; fx = fx[..., None]
    a = arr[y0][:, x0] * (1 - fx) + arr[y0][:, x1] * fx
    b = arr[y1][:, x0] * (1 - fx) + arr[y1][:, x1] * fx
    return a * (1 - fy) + b * fy

def sample_wrap(arr, u, v):
    """bilinear sample with wrap; u,v in texture units (0..1 tiles)"""
    H, W = arr.shape[:2]
    x = np.asarray(u) * W - 0.5; y = np.asarray(v) * H - 0.5
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = x - x0; fy = y - y0
    x0 %= W; y0 %= H; x1 = (x0 + 1) % W; y1 = (y0 + 1) % H
    return (arr[y0, x0] * (1 - fx) * (1 - fy) + arr[y0, x1] * fx * (1 - fy)
            + arr[y1, x0] * (1 - fx) * fy + arr[y1, x1] * fx * fy)

# ----------------------------------------------------------------------------------------------------------------
# mesh builder: shared vertices, per-corner UVs, per-face material, optional per-vertex normals / AO
# ----------------------------------------------------------------------------------------------------------------
class MB:
    def __init__(self):
        self.V = []; self.nv = 0
        self.F = []; self.UV = []; self.M = []
        self.tag = []     # per-vertex int tag (0 wood, 1 foliage) used for AO / normals

    def verts(self, v, tag=0):
        v = np.asarray(v, float).reshape(-1, 3)
        base = self.nv; self.V.append(v); self.nv += len(v)
        self.tag.append(np.full(len(v), tag, np.int8))
        return base

    def faces(self, f, uv, mat):
        f = np.asarray(f, np.int64); uv = np.asarray(uv, float)
        assert uv.shape[:2] == f.shape, (uv.shape, f.shape)
        self.F.append(f); self.UV.append(uv); self.M.append(np.full(len(f), mat, np.int32))

    def grid(self, P, UV, mat, tag=0, flip=False):
        """P (R,C,3) rows along, cols across; UV (R,C,2) per-vertex (no wrap)."""
        P = np.asarray(P, float); R, C = P.shape[:2]
        b = self.verts(P.reshape(-1, 3), tag)
        idx = np.arange(R * C).reshape(R, C) + b
        q = np.stack([idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]], -1).reshape(-1, 4)
        UV = np.asarray(UV, float)
        uq = np.stack([UV[:-1, :-1], UV[:-1, 1:], UV[1:, 1:], UV[1:, :-1]], -2).reshape(-1, 4, 2)
        if flip:
            q = q[:, ::-1]; uq = uq[:, ::-1]
        self.faces(q, uq, mat)
        return idx

    def orient_outward(self, centre, tag_sel=1):
        """flip winding of foliage faces whose geometric normal points into the crown (three.js flips the shading
        normal on back faces, so cards must face outward for crown-radial normals to work)."""
        V = np.concatenate(self.V); T = np.concatenate(self.tag)
        for i, (f, uv) in enumerate(zip(self.F, self.UV)):
            if not (T[f[:, 0]] == tag_sel).any():
                continue
            P = V[f]                                  # (m,k,3)
            if f.shape[1] == 4:
                nrm_ = np.cross(P[:, 2] - P[:, 0], P[:, 3] - P[:, 1])
            else:
                nrm_ = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
            c = P.mean(1)
            flip = (np.sum(nrm_ * (c - centre), 1) < 0) & (T[f[:, 0]] == tag_sel)
            if flip.any():
                f = f.copy(); uv = uv.copy()
                f[flip] = f[flip][:, ::-1]; uv[flip] = uv[flip][:, ::-1]
                self.F[i] = f; self.UV[i] = uv

    def tris(self):
        n = 0
        for f in self.F:
            n += len(f) * (f.shape[1] - 2)
        return n

    def build(self, name, materials, normals=None, colors=None, smooth=True):
        V = np.concatenate(self.V).astype(np.float32)
        quads = [(f, u, m) for f, u, m in zip(self.F, self.UV, self.M)]
        loops = np.concatenate([f.ravel() for f, _, _ in quads]).astype(np.int32)
        uvs = np.concatenate([u.reshape(-1, 2) for _, u, _ in quads]).astype(np.float32)
        sizes = np.concatenate([np.full(len(f), f.shape[1], np.int32) for f, _, _ in quads])
        mats = np.concatenate([m for _, _, m in quads]).astype(np.int32)
        starts = np.concatenate([[0], np.cumsum(sizes)[:-1]]).astype(np.int32)
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(V)); me.vertices.foreach_set('co', V.ravel())
        me.loops.add(len(loops)); me.loops.foreach_set('vertex_index', loops)
        me.polygons.add(len(sizes)); me.polygons.foreach_set('loop_start', starts)
        me.polygons.foreach_set('loop_total', sizes)
        me.update(calc_edges=True)
        uvl = me.uv_layers.new(name='UVMap'); uvl.data.foreach_set('uv', uvs.ravel())
        me.polygons.foreach_set('material_index', mats)
        me.polygons.foreach_set('use_smooth', np.full(len(sizes), smooth, bool))
        for m in materials:
            me.materials.append(m)
        if colors is not None:
            ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
            c4 = np.ones((len(V), 4), np.float32); c4[:, :3] = np.asarray(colors, np.float32).reshape(-1, 1) if np.ndim(colors) == 1 else colors
            ca.data.foreach_set('color', c4.ravel())
            me.color_attributes.active_color = ca
            me.color_attributes.render_color_index = 0
        me.validate(clean_customdata=False)
        if normals is not None:
            normals = np.array(normals, float)
            bad = ~np.isfinite(normals).all(1)
            if bad.any():
                vn = np.empty(len(V) * 3, np.float32); me.vertex_normals.foreach_get('vector', vn)
                normals[bad] = vn.reshape(-1, 3)[bad]
            me.normals_split_custom_set_from_vertices([tuple(n) for n in normals])
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob

# ---- tube / sweep with tile-aware per-corner UVs ---------------------------------------------------------------
def sweep(mb, P, profile, mat, region=(0, 1, 0, 1), tile_v=1.0, rep_u=1, v0=0.0, tag=0, E=None, cap_end=False,
          u_phase=0.0, swap=False):
    """P (n,3) centreline; profile (n,k,2) closed CCW cross-section coords in (E1,E2); returns vertex index grid.
    UV: u runs rep_u times around (k must be divisible by rep_u), v = v0 + arclength / tile_v.  Each face is mapped
    into atlas `region`=(u0,u1,v0,v1) using its own tile (floor of its centre), so regions can sit inside an atlas."""
    P = np.asarray(P, float); n = len(P)
    profile = np.asarray(profile, float)
    if profile.ndim == 2:
        profile = np.repeat(profile[None], n, 0)
    k = profile.shape[1]
    if E is None:
        T, E1, E2 = transport_frames(P)
    else:
        E1, E2 = E
    pts = P[:, None, :] + profile[..., 0:1] * E1[:, None, :] + profile[..., 1:2] * E2[:, None, :]
    b = mb.verts(pts.reshape(-1, 3), tag)
    idx = (np.arange(n * k).reshape(n, k) + b)
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    if tile_v is None:
        tile_v = seg.sum() * 1.0001
    vv = v0 + np.concatenate([[0], np.cumsum(seg)]) / tile_v
    uu = np.arange(k + 1) / k * rep_u + u_phase
    i = np.arange(n - 1)[:, None]; j = np.arange(k)[None, :]
    i = np.broadcast_to(i, (n - 1, k)); j = np.broadcast_to(j, (n - 1, k))
    q = np.stack([idx[i, j], idx[i, (j + 1) % k], idx[i + 1, (j + 1) % k], idx[i + 1, j]], -1).reshape(-1, 4)
    cu = np.stack([uu[j], uu[j + 1], uu[j + 1], uu[j]], -1)
    cv = np.stack([vv[i], vv[i], vv[i + 1], vv[i + 1]], -1)
    fu = np.floor(cu.mean(-1, keepdims=True)); fv = np.floor(cv.mean(-1, keepdims=True))
    ru0, ru1, rv0, rv1 = region
    if swap:   # along-axis -> atlas u, around -> atlas v (for strips stored lying down)
        lu = ru0 + (cv - fv) * (ru1 - ru0); lv = rv0 + (cu - fu) * (rv1 - rv0)
    else:
        lu = ru0 + (cu - fu) * (ru1 - ru0)
    if swap:
        pass
    elif rv0 == 0 and rv1 == 1:
        lv = cv          # full-height region: let the sampler wrap (no per-face folding needed)
    else:
        lv = rv0 + (cv - fv) * (rv1 - rv0)
    uv = np.stack([lu, lv], -1).reshape(-1, 4, 2)
    mb.faces(q, uv, mat)
    if cap_end:
        c = mb.verts(P[-1:], tag)
        tri = np.stack([idx[-1, np.arange(k)], idx[-1, (np.arange(k) + 1) % k], np.full(k, c)], -1)
        uc = np.zeros((k, 3, 2)); uc[..., 0] = ru0 + 0.5 * (ru1 - ru0); uc[..., 1] = (rv0 + rv1) / 2 if not (rv0 == 0 and rv1 == 1) else vv[-1]
        mb.faces(tri, uc, mat)
    return idx

def circle_profile(r, k, noise=None):
    a = np.arange(k) / k * 2 * math.pi
    r = np.asarray(r, float)
    if r.ndim == 0:
        pr = np.stack([np.cos(a) * r, np.sin(a) * r], -1)
    else:
        rr = r[:, None] * (1 + (noise if noise is not None else 0))
        pr = np.stack([np.cos(a)[None] * rr, np.sin(a)[None] * rr], -1)
    return pr

# ----------------------------------------------------------------------------------------------------------------
# materials / scene
# ----------------------------------------------------------------------------------------------------------------
def load_tex(path, noncolor=False):
    img = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        img.colorspace_settings.name = 'Non-Color'
    return img

def make_material(name, base_path, normal_path=None, rough=0.85, alpha=False, normal_strength=1.0,
                  spec=0.5, use_vcol=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    p = N.get('Principled BSDF')
    tex = N.new('ShaderNodeTexImage'); tex.image = load_tex(base_path); tex.location = (-600, 200)
    tex.interpolation = 'Linear'
    col_out = tex.outputs['Color']
    if use_vcol:
        va = N.new('ShaderNodeVertexColor'); va.layer_name = 'Col'; va.location = (-600, 450)
        mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        L.new(col_out, mix.inputs['A']); L.new(va.outputs['Color'], mix.inputs['B'])
        col_out = mix.outputs['Result']
    L.new(col_out, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    if 'Specular IOR Level' in p.inputs:
        p.inputs['Specular IOR Level'].default_value = spec
    if normal_path:
        nt_ = N.new('ShaderNodeTexImage'); nt_.image = load_tex(normal_path, True); nt_.location = (-600, -250)
        nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal_strength
        L.new(nt_.outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], p.inputs['Normal'])
    if alpha:
        rnd = N.new('ShaderNodeMath'); rnd.operation = 'ROUND'; rnd.location = (-250, -50)
        L.new(tex.outputs['Alpha'], rnd.inputs[0]); L.new(rnd.outputs[0], p.inputs['Alpha'])
        m.use_backface_culling = False
        try:
            m.surface_render_method = 'DITHERED'
        except Exception:
            pass
    else:
        m.use_backface_culling = True
    return m

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def export_glb(path, objs, vcol):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
              export_normals=True, export_texcoords=True, export_tangents=False, export_materials='EXPORT',
              export_image_format='AUTO', export_cameras=False, export_lights=False, export_extras=False,
              export_vertex_color='ACTIVE' if vcol else 'NONE', export_animations=False)
    props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})
    log('wrote', path, os.path.getsize(path) // 1024, 'KB')

# ----------------------------------------------------------------------------------------------------------------
# Cycles helpers (card renders + previews)
# ----------------------------------------------------------------------------------------------------------------
def setup_cycles(samples, transparent=False, denoise=True):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    if DEVICE[0] == 'GPU':
        prefs = bpy.context.preferences.addons['cycles'].preferences
        try:
            prefs.compute_device_type = 'METAL'; prefs.get_devices()
            for d in prefs.devices:
                d.use = d.type != 'CPU'
            sc.cycles.device = 'GPU'
        except Exception as e:
            log('gpu n/a', e)
    else:
        sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = denoise
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 1
    sc.cycles.transmission_bounces = 2; sc.cycles.transparent_max_bounces = 64
    sc.render.film_transparent = transparent
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    sc.render.image_settings.color_depth = '8'
    return sc

def render_to_array(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return load_image(path)

def card_render(objs_builder, xr, yr, px_w, px_h, path, samples=48, view_dir='TOP', ao_strength=1.0):
    """Render geometry built by objs_builder() orthographically into an RGBA albedo*sky-visibility image.
    xr, yr = world ranges mapped to image width/height.  view_dir TOP looks down -Z (image x=+X, y=+Y);
    FRONT looks along +Y (image x=+X, y=+Z)."""
    clear_scene()
    sc = setup_cycles(samples, transparent=True, denoise=True)
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    objs = objs_builder()
    # replace leaf/bark materials by pure diffuse (albedo under uniform white sky = albedo * visibility)
    for o in objs:
        for m in o.data.materials:
            nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
            if p is None:
                continue
            p.inputs['Roughness'].default_value = 1.0
            if 'Specular IOR Level' in p.inputs:
                p.inputs['Specular IOR Level'].default_value = 0.0
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = ao_strength
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    cx, cy = (xr[0] + xr[1]) / 2, (yr[0] + yr[1]) / 2
    sx, sy = xr[1] - xr[0], yr[1] - yr[0]
    cam.ortho_scale = max(sx, sy)
    cam.sensor_fit = 'HORIZONTAL' if sx >= sy else 'VERTICAL'
    cam.clip_start = 0.01; cam.clip_end = 200
    if view_dir == 'TOP':
        co.location = (cx, cy, 50); co.rotation_euler = (0, 0, 0)
    else:
        co.location = (cx, -50, cy); co.rotation_euler = (math.pi / 2, 0, 0)
    sc.render.resolution_x = px_w; sc.render.resolution_y = px_h
    sc.render.filter_size = 1.0
    return render_to_array(path)

# ----------------------------------------------------------------------------------------------------------------
# AO + crown normals for LOD0
# ----------------------------------------------------------------------------------------------------------------
def crown_ao(P, tag, centre, radii, ground_z=0.0, trunk_top=None):
    """analytic AO: foliage darker deep inside / underneath the crown ellipsoid, trunk darker near ground and
    inside the crown."""
    P = np.asarray(P, float)
    d = (P - centre) / radii
    rr = np.linalg.norm(d, axis=1)
    below = np.clip(-d[:, 2], 0, 1)
    ao_f = 0.55 + 0.45 * smoothstep(0.15, 1.0, rr)
    ao_f *= 1.0 - 0.18 * below * (1 - smoothstep(0.7, 1.2, rr))
    ao_f = np.clip(ao_f, 0.55, 1.0)
    z = P[:, 2] - ground_z
    ao_w = 0.8 + 0.2 * smoothstep(0.0, 2.5, z)
    inside = 1 - smoothstep(0.6, 1.1, rr)
    ao_w = ao_w * (1 - 0.35 * inside)
    ao = np.where(tag == 1, ao_f, np.clip(ao_w, 0.55, 1.0))
    return ao

def finish_lod0(mb, mats, name, centre=None, radii=None, centre_offset=(0, 0, 0), orient=True):
    V = np.concatenate(mb.V); tag = np.concatenate(mb.tag)
    fol = V[tag == 1]
    lo, hi = fol.min(0), fol.max(0)
    if centre is None:
        centre = (lo + hi) / 2 + np.array(centre_offset)
    if radii is None:
        radii = np.maximum((hi - lo) / 2, 0.3)
    if orient:
        mb.orient_outward(centre)
    normals = np.full_like(V, np.nan)
    normals[tag == 1] = nrm(V[tag == 1] - centre)
    ao = crown_ao(V, tag, centre, radii)
    ob = mb.build(name + '_lod0', mats, normals=normals, colors=ao)
    log(name, 'lod0 tris', mb.tris(), 'crown centre', np.round(centre, 2), 'radii', np.round(radii, 2))
    return [ob]

# ================================================================================================================
# TEXTURES: palm_fan
# ================================================================================================================
def tex_palm_trunk(w, h, rng, palette):
    """Washingtonia trunk: tight horizontal leaf-scar rings, fine vertical fissures, grey-brown.  Periodic.
    returns colour (h,w,3) sRGB, height (h,w)."""
    y = np.arange(h)[:, None].astype(float); x = np.arange(w)[None, :].astype(float)
    hgt = np.zeros((h, w))
    nr = int(rng.integers(30, 38))
    sp = rng.uniform(0.6, 1.4, nr); sp = sp / sp.sum() * h
    yc = np.cumsum(sp) - rng.uniform(0, sp[0])
    brk = fnoise(1, w, scale=6, seed=int(rng.integers(1e9)))[0]
    ring_mask = np.zeros((h, w))
    for i, yi in enumerate(yc):
        k1 = rng.integers(1, 3); k2 = rng.integers(3, 7)
        wav = rng.uniform(1, 4) * np.sin(2 * math.pi * k1 * x / w + rng.uniform(0, 6.3)) \
            + rng.uniform(0.3, 1.5) * np.sin(2 * math.pi * k2 * x / w + rng.uniform(0, 6.3))
        st = rng.uniform(0.45, 1.0) * np.clip(0.75 + 0.5 * np.roll(brk, int(rng.integers(w)))[None, :], 0.15, 1.3)
        dy = ((y - yi - wav + h / 2) % h) - h / 2
        groove = np.exp(-(dy / rng.uniform(1.3, 2.2)) ** 2)
        lip = np.exp(-((dy - 3.5) / 3.2) ** 2)
        hgt += st * (-1.0 * groove + 0.35 * lip)
        ring_mask = np.maximum(ring_mask, st * groove)
    # corrugation between rings
    hgt += 0.25 * fnoise(h, w, scale=24, seed=int(rng.integers(1e9)), ax=4.0, ay=0.6)
    # vertical fissures
    fis = fnoise(h, w, scale=60, beta=2.4, seed=int(rng.integers(1e9)), ax=1.0, ay=8.0)
    cracks = np.clip((fis - 1.3) / 0.6, 0, 1)
    hgt -= 0.7 * cracks
    hgt += 0.15 * fnoise(h, w, scale=120, beta=1.5, seed=int(rng.integers(1e9)))
    # colour
    m1 = fnoise(h, w, scale=5, seed=int(rng.integers(1e9)), ay=0.6)
    m2 = fnoise(h, w, scale=30, seed=int(rng.integers(1e9)), ax=1.5, ay=6.0)
    grey, brown = np.array(palette[0]), np.array(palette[1])
    t = np.clip(0.5 + 0.3 * m1, 0, 1)[..., None]
    col = grey * (1 - t) + brown * t
    col = col * (1 + 0.05 * m2[..., None])
    hn = (hgt - hgt.mean()) / (hgt.std() + 1e-9)
    col = col * np.clip(0.88 + 0.08 * hn, 0.55, 1.15)[..., None]
    col = col * (1 - 0.35 * ring_mask[..., None]) * (1 - 0.4 * cracks[..., None])
    # pale lichen / sun-bleach spots
    sp_ = fnoise(h, w, scale=40, seed=int(rng.integers(1e9)))
    spots = np.clip((sp_ - 1.9) / 0.5, 0, 1)[..., None]
    col = col * (1 - spots * 0.5) + np.array(palette[2]) * spots * 0.5
    return np.clip(col, 0, 1), hgt

def tex_lattice(w, h, phys_w, phys_h, rng, palette):
    """criss-cross split petiole bases (Washingtonia 'boot').  Periodic."""
    m, n = 12, 5
    S = 1.0 / math.sqrt((m / phys_w) ** 2 + (n / phys_h) ** 2)
    al = math.atan2(m / phys_w, n / phys_h)
    X = (np.arange(w)[None, :] + 0.5) / w * phys_w
    Y = (np.arange(h)[:, None] + 0.5) / h * phys_h
    qa = (X * math.sin(al) + Y * math.cos(al)) / S
    qb = (-X * math.sin(al) + Y * math.cos(al)) / S
    qa = qa + 0 * Y; qb = qb + 0 * X
    ia, fa = np.floor(qa), qa - np.floor(qa)
    ib, fb = np.floor(qb), qb - np.floor(qb)
    # along-strap coordinates for fibre noise
    fib1 = fnoise(1, 2048, scale=300, beta=1.2, seed=int(rng.integers(1e9)))[0]
    def fibre(f, i):
        idx = ((f + (i * 0.6180339 % 1)) * 512).astype(int) % 2048
        return fib1[idx]
    def prof(f):
        return np.clip(np.sin(math.pi * np.clip((f - 0.06) / 0.88, 0, 1)), 0, 1) ** 0.6
    pa, pb = prof(fa), prof(fb)
    hsh = ((ia * 7 + ib * 13) % 2 == 0)
    top_a = hsh
    h_a = pa * np.where(top_a, 1.0, 0.55)
    h_b = pb * np.where(top_a, 0.55, 1.0)
    hgt = np.maximum(h_a, h_b)
    is_a = h_a >= h_b
    fibres = np.where(is_a, fibre(fa, ia), fibre(fb, ib))
    hgt = hgt + 0.06 * fibres * (hgt > 0.05)
    # per strap colour
    def strap_rand(i, s):
        return (np.sin(i * 12.9898 + s * 78.233) * 43758.5453) % 1.0
    ra = np.where(is_a, strap_rand(ia, 1.0), strap_rand(ib, 2.0))
    c0, c1 = np.array(palette[0]), np.array(palette[1])
    col = c0 * (1 - ra[..., None]) + c1 * ra[..., None]
    col = col * (0.85 + 0.12 * fibres[..., None])
    under = (~is_a & top_a) | (is_a & ~top_a)
    col = col * np.where(under, 0.72, 1.0)[..., None]
    gap = (hgt < 0.08)[..., None]
    col = np.where(gap, np.array(palette[2]), col)
    col = col * np.clip(0.55 + 0.5 * hgt, 0.3, 1.05)[..., None]
    mott = fnoise(h, w, scale=6, seed=int(rng.integers(1e9)))
    col = col * (1 + 0.08 * mott[..., None])
    return np.clip(col, 0, 1), hgt

def tex_fibrous(w, h, rng, palette, cut_band=0.06):
    """fibrous petiole-stub strap: fibres along v, lighter fresh cut at v>1-cut_band."""
    fib = fnoise(h, w, scale=80, beta=1.6, seed=int(rng.integers(1e9)), ax=1.0, ay=12.0)
    fib2 = fnoise(h, w, scale=10, seed=int(rng.integers(1e9)), ay=2)
    c0, c1 = np.array(palette[0]), np.array(palette[1])
    t = np.clip(0.5 + 0.35 * fib2, 0, 1)[..., None]
    col = c0 * (1 - t) + c1 * t
    col = col * (0.88 + 0.1 * fib[..., None])
    yv = (np.arange(h)[:, None] + 0.5) / h + 0 * fib
    cut = (yv > 1 - cut_band)[..., None]
    col = np.where(cut, np.array(palette[2]) * (0.9 + 0.08 * fib2[..., None]), col)
    hgt = 0.3 * fib + 0.2 * fib2
    return np.clip(col, 0, 1), hgt

def seg_texture(h, w, rng, kind, base_rgb, tip_brown=0.0, fray=0.0, notch=True):
    """one palm leaf segment / leaflet strip (u across: edge-fold-edge, v along: base->tip). RGBA."""
    y = (np.arange(h)[:, None] + 0.5) / h + np.zeros((1, w))
    x = (np.arange(w)[None, :] + 0.5) / w + np.zeros((h, 1))
    base = np.array(base_rgb)
    col = np.ones((h, w, 3)) * base
    # longitudinal veins
    vx = np.zeros((h, w))
    for k in range(int(rng.integers(9, 14))):
        xc = rng.uniform(0.03, 0.97); amp = rng.uniform(-0.07, 0.05)
        vx += amp * np.exp(-((x - xc) / rng.uniform(0.006, 0.015)) ** 2)
    col *= (1 + vx)[..., None]
    # fold line + lighter margins
    fold = np.exp(-((x - 0.5) / 0.018) ** 2)
    col = col * (1 + 0.12 * fold[..., None])
    marg = np.exp(-(np.minimum(x, 1 - x) / 0.035) ** 2)
    col = col * (1 - 0.25 * marg[..., None]) + np.array([0.75, 0.7, 0.35]) * 0.25 * marg[..., None]
    # streaky mottling + base fading to pale yellow-green
    st = fnoise(h, w, scale=20, seed=int(rng.integers(1e9)), ax=0.5, ay=10)
    col = col * (1 + 0.05 * st[..., None])
    mb_ = fnoise(h, w, scale=4, seed=int(rng.integers(1e9)), ay=0.5)
    col = col * (1 + 0.06 * mb_[..., None])
    basef = (1 - smoothstep(0.0, 0.18, y))[..., None]
    col = col * (1 - 0.45 * basef) + np.array([0.62, 0.62, 0.38]) * 0.45 * basef
    alpha = np.ones((h, w))
    if tip_brown > 0:
        edge = 1 - tip_brown + 0.05 * fnoise(h, w, scale=6, seed=int(rng.integers(1e9)))
        tb = smoothstep(edge - 0.03, edge + 0.03, y)[..., None]
        brown = np.array([0.46, 0.34, 0.2]) * (1 + 0.1 * st[..., None])
        col = col * (1 - tb) + brown * tb
    if kind == 'dead':
        streak = fnoise(h, w, scale=30, seed=int(rng.integers(1e9)), ax=0.5, ay=14)
        col = col * (1 + 0.12 * streak[..., None])
    if fray > 0:
        fr = fnoise(h, w, scale=40, seed=int(rng.integers(1e9)), ax=0.3, ay=8)
        e = np.minimum(x, 1 - x)
        alpha = np.where(e < fray * np.clip(0.5 + 0.6 * fr, 0, 1) * (0.3 + y), 0.0, alpha)
    if notch:
        tip = (y > 0.9) & (np.abs(x - 0.5) < (y - 0.9) / 0.1 * 0.22)
        alpha = np.where(tip, 0.0, alpha)
        alpha = np.where(y > 0.985, 0.0, alpha)
    rgba = np.concatenate([np.clip(col, 0, 1), alpha[..., None]], -1)
    return rgba

def petiole_texture(h, w, rng, live=True, margins=(0.0, 1 / 3)):
    y = (np.arange(h)[:, None] + 0.5) / h + np.zeros((1, w))
    x = (np.arange(w)[None, :] + 0.5) / w + np.zeros((h, 1))
    st = fnoise(h, w, scale=20, seed=int(rng.integers(1e9)), ax=0.5, ay=10)
    if live:
        upper = np.array([0.43, 0.47, 0.22]); lower = np.array([0.42, 0.27, 0.17])
        t = smoothstep(0.0, 0.35, y)[..., None]
        col = lower * (1 - t) + upper * t
        if len(margins) > 1:
            top = ((x > margins[0]) & (x < margins[1]))[..., None]
            col = np.where(top, col * 1.12, col)
    else:
        col = np.ones((h, w, 3)) * np.array([0.47, 0.41, 0.32])
    col = col * (1 + 0.08 * st[..., None])
    for mx in margins:
        d = np.minimum(np.abs(x - mx), 1 - np.abs(x - mx))
        mk = np.exp(-(d / 0.025) ** 2)[..., None]
        col = col * (1 - mk) + (np.array([0.55, 0.36, 0.18]) if live else np.array([0.36, 0.3, 0.22])) * mk
    return np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], -1)

# palm_fan leaf atlas columns (16 x 64px x 1024px)
FAN_COLS_GREEN = list(range(0, 10))
FAN_COLS_OLD = [10, 11]
FAN_COLS_DEAD = [12, 13]
FAN_COL_PET = 14
FAN_COL_PET_DEAD = 15

def gen_palm_fan_textures(tdir, seed=5):
    rng = np.random.default_rng(seed)
    # ---- bark atlas 1024: [0,.5] trunk (tiles in v), [.5,1]x[.5,1] boot lattice, [.5,1]x[0,.5] stub fibre
    col = np.zeros((1024, 1024, 3)); hgt = np.zeros((1024, 1024)); nrmimg = np.zeros((1024, 1024, 3))
    c, hh = tex_palm_trunk(512, 1024, rng, [(0.52, 0.5, 0.47), (0.45, 0.4, 0.34), (0.66, 0.65, 0.61)])
    col[:, :512] = c; nrmimg[:, :512] = height_to_normal(hh / (hh.std() + 1e-9), 1.2)
    c, hh = tex_lattice(512, 512, 1.5, 0.8, rng, [(0.42, 0.31, 0.22), (0.47, 0.41, 0.33), (0.06, 0.045, 0.035)])
    col[512:, 512:] = c; nrmimg[512:, 512:] = height_to_normal(hh * 6, 1.0)
    c, hh = tex_fibrous(512, 512, rng, [(0.40, 0.30, 0.21), (0.50, 0.43, 0.34), (0.66, 0.55, 0.40)])
    col[:512, 512:] = c; nrmimg[:512, 512:] = height_to_normal(hh, 1.5)
    save_image(col, os.path.join(tdir, 'palm_fan_bark.jpg'))
    save_image(nrmimg, os.path.join(tdir, 'palm_fan_bark_n.jpg'))
    # ---- hi leaf atlas: segment strips + petioles
    atlas = np.zeros((1024, 1024, 4))
    greens = []
    for i in FAN_COLS_GREEN:
        hue = rng.uniform(70, 88); sat = rng.uniform(0.45, 0.58); val = rng.uniform(0.40, 0.50)
        greens.append(hsv2rgb(hue, sat, val))
        atlas[:, i * 64:(i + 1) * 64] = seg_texture(1024, 64, rng, 'live', greens[-1],
                                                    tip_brown=rng.uniform(0.0, 0.06) if i % 3 == 0 else 0.0)
    for i in FAN_COLS_OLD:
        atlas[:, i * 64:(i + 1) * 64] = seg_texture(1024, 64, rng, 'live', hsv2rgb(rng.uniform(55, 68), 0.5, 0.45),
                                                    tip_brown=rng.uniform(0.15, 0.3), fray=0.05)
    for j, i in enumerate(FAN_COLS_DEAD):
        base = [(0.62, 0.52, 0.37), (0.52, 0.45, 0.36)][j]
        atlas[:, i * 64:(i + 1) * 64] = seg_texture(1024, 64, rng, 'dead', base, fray=0.25)
    atlas[:, FAN_COL_PET * 64:(FAN_COL_PET + 1) * 64] = petiole_texture(1024, 64, rng, True)
    atlas[:, FAN_COL_PET_DEAD * 64:(FAN_COL_PET_DEAD + 1) * 64] = petiole_texture(1024, 64, rng, False)
    atlas = dilate_rgba(atlas)
    save_image(atlas, os.path.join(tdir, 'palm_fan_leaf_hi.png'))

# ================================================================================================================
# GEOMETRY: palm_fan
# ================================================================================================================
def palm_axis(rng, height, base_lean_deg, step=0.05):
    """centreline from z=-SINK to z=height: leans at the base and straightens upward (J-curve) with wander."""
    psi = rng.uniform(0, 2 * math.pi)
    a0 = math.radians(base_lean_deg)
    wob = fnoise(1, 256, scale=3, seed=int(rng.integers(1e9)))[0]
    wob2 = fnoise(1, 256, scale=3, seed=int(rng.integers(1e9)))[0]
    pts = [np.zeros(3)]
    p = np.zeros(3)
    dirs = []
    while p[2] < height:
        s = p[2] / height
        ang = a0 * (1 - s) ** 1.6 + math.radians(1.5) * s + math.radians(1.2) * wob[int(s * 255)]
        az = psi + 0.35 * wob2[int(s * 255)]
        d = np.array([math.sin(ang) * math.cos(az), math.sin(ang) * math.sin(az), math.cos(ang)])
        p = p + d * step
        pts.append(p.copy()); dirs.append(d)
    d0 = dirs[0]
    below = [-(d0 * SINK * (k / 6)) for k in range(6, 0, -1)]
    P = np.array(below + pts)
    return P

def axis_at(P, z):
    i = int(np.clip(np.searchsorted(P[:, 2], z), 1, len(P) - 1))
    a, b = P[i - 1], P[i]
    t = (z - a[2]) / max(b[2] - a[2], 1e-9)
    return a + (b - a) * t, nrm(b - a)

def resample(P, zs):
    return np.array([axis_at(P, z)[0] for z in zs])

def fan_frond_params(rng, age, dead=False):
    """age 0 = newest (centre), 1 = oldest live."""
    if dead:
        return dict(R=rng.uniform(0.55, 0.7), nseg=int(rng.integers(44, 54)), theta=math.radians(rng.uniform(25, 45)),
                    fold=rng.uniform(0.9, 1.3), arch=rng.uniform(0.0, 0.1), droop=rng.uniform(5, 9),
                    split=rng.uniform(0.35, 0.5), pet_len=rng.uniform(1.0, 1.3))
    return dict(R=rng.uniform(0.74, 0.86) * (0.9 + 0.1 * min(age * 3, 1)), nseg=int(rng.integers(54, 64)),
                theta=math.radians(rng.uniform(100, 118) * (0.75 + 0.25 * min(age * 4, 1))),
                fold=rng.uniform(0.18, 0.35) * (1.6 - 0.8 * min(age * 2, 1)),
                arch=rng.uniform(0.15, 0.35) * (0.4 + age), droop=rng.uniform(1.6, 2.6) * (0.5 + 0.9 * age),
                split=rng.uniform(0.5, 0.62), pet_len=rng.uniform(1.0, 1.3) * (0.8 + 0.2 * min(age * 3, 1)))

def blade_local_to_world(xl, yl, zl, H, f, s, n):
    return H + np.multiply.outer(xl, f) + np.multiply.outer(yl, s) + np.multiply.outer(zl, n)

def fan_segment_lines(prm, rng, H, f, s, n, J_fused=4, J_free=8, sheet=False, n_lines=None, theta_list=None,
                      rad_scale=None, rmax=None):
    """Compute centre polylines of fan segments (or radial lines of the card sheet).
    returns list of dicts with points (J+1,3), across vectors (J+1,3), widths (J+1), s-param (J+1), theta, R_k."""
    R, nseg, TH = prm['R'], prm['nseg'], prm['theta']
    thetas = theta_list if theta_list is not None else (np.linspace(-TH, TH, nseg))
    dth = 2 * TH / max(nseg - 1, 1)
    down = np.array([0, 0, -1.0])
    out = []
    for k, th in enumerate(thetas):
        if rad_scale is not None:
            Rk = rad_scale(th)
            ssplit = prm['split'] * Rk
            jit = 0
        else:
            Rk = R * (0.55 + 0.45 * max(math.cos(th * 0.78), 0) ** 1.2) * (1 + 0.05 * rng.standard_normal())
            ssplit = Rk * (prm['split'] + 0.03 * rng.standard_normal())
            jit = 1
        if rmax is not None:
            Rk = min(Rk, rmax * R)
        ssplit = float(np.clip(ssplit, 0.25 * Rk, 0.75 * Rk))
        s_f = np.linspace(0, ssplit, J_fused + 1)
        s_r = np.linspace(ssplit, Rk, J_free + 1)[1:]
        ss = np.concatenate([s_f, s_r])
        # fused part in blade-local coords: polar + fold (V along costa) + costa arch
        xl = s_f * math.cos(th); yl = s_f * math.sin(th)
        zl = prm['fold'] * np.abs(yl) - prm['arch'] * (np.maximum(xl, 0) ** 2) / max(R, 1e-6)
        pts = list(blade_local_to_world(xl, yl, zl, H, f, s, n))
        acr_l = np.array([-math.sin(th), math.cos(th), 0.0])
        acr = acr_l[0] * f + acr_l[1] * s + acr_l[2] * n
        # free part: march with gravity droop increasing toward the tip
        d = nrm(pts[-1] - pts[-2]) if J_fused > 0 else nrm(f)
        droop = prm['droop'] * (1 + (0.12 * rng.standard_normal() if jit else 0))
        curl = (0.2 * rng.standard_normal() if jit else 0.0)
        p = pts[-1].copy()
        for j, sv in enumerate(s_r):
            ds = sv - (s_r[j - 1] if j > 0 else ssplit)
            frac = (sv - ssplit) / max(Rk - ssplit, 1e-6)
            d = rot_toward(d, down, droop * ds * (0.6 + 1.6 * frac))
            if curl:
                d = nrm(rodrigues(d, nrm(np.cross(d, acr)) if np.linalg.norm(np.cross(d, acr)) > 1e-6 else n, curl * ds))
            p = p + d * ds
            pts.append(p.copy())
        pts = np.array(pts)
        T = np.zeros_like(pts); T[1:-1] = pts[2:] - pts[:-2]; T[0] = pts[1] - pts[0]; T[-1] = pts[-1] - pts[-2]
        T = nrm(T)
        A = nrm(acr[None, :] - T * np.sum(T * acr[None, :], 1, keepdims=True))
        wf = s_f * dth * 0.98
        wsplit = ssplit * dth * 0.98
        fr = (s_r - ssplit) / max(Rk - ssplit, 1e-6)
        wr = wsplit * (1 + 0.25 * fr) * (1 - fr ** 2.2) ** 0.55 + 0.002
        widths = np.concatenate([wf, wr])
        out.append(dict(P=pts, A=A, T=T, W=widths, S=ss, th=th, R=Rk, split=ssplit))
    return out

def petiole_curve(base, d0, length, bend, nstep=10):
    P = [base.copy()]; d = nrm(d0); p = base.copy(); ds = length / nstep
    down = np.array([0, 0, -1.0])
    for i in range(nstep):
        horiz = math.sqrt(max(0.0, 1 - d[2] ** 2))
        d = rot_toward(d, down, bend * ds * (0.3 + horiz))
        p = p + d * ds; P.append(p.copy())
    return np.array(P)

def dead_petiole(base, rad, rng, length, nstep=10):
    """dead frond: short outward-down start, then hinged to hang almost vertically (pressed to the trunk skirt)"""
    up = np.array([0, 0, 1.0])
    e0 = math.radians(rng.uniform(100, 125))
    d0 = nrm(math.sin(e0) * rad + math.cos(e0) * up)
    d1 = nrm(-up + rng.uniform(0.08, 0.22) * rad + 0.06 * rng.standard_normal(3))
    P = [base.copy()]; p = base.copy(); ds = length / nstep
    for i in range(nstep):
        t = smoothstep(0.05, 0.3, i / nstep)
        d = nrm(d0 * (1 - t) + d1 * t)
        p = p + d * ds; P.append(p.copy())
    return np.array(P), d1

def blade_frame(P, radial):
    f = nrm(P[-1] - P[-2])
    up = np.array([0, 0, 1.0])
    c = np.cross(f, up)
    if np.linalg.norm(c) < 0.2:
        c = np.cross(f, radial) if np.linalg.norm(np.cross(f, radial)) > 1e-3 else np.array([1.0, 0, 0])
    s = nrm(c); n = nrm(np.cross(s, f))
    return f, s, n

def petiole_profile(n, rng, w0=0.11, w1=0.045, th0=0.05, th1=0.022, sheath=0.17):
    t = np.linspace(0, 1, n)
    w = lerp(w0, w1, t ** 0.6) + (sheath - w0) * np.exp(-t / 0.06)
    th = lerp(th0, th1, t)
    pr = np.stack([np.stack([w / 2, 0 * w], -1), np.stack([0 * w, -0.2 * th], -1), np.stack([-w / 2, 0 * w], -1),
                   np.stack([-0.32 * w, -0.75 * th], -1), np.stack([0 * w, -th], -1),
                   np.stack([0.32 * w, -0.75 * th], -1)], 1)
    return pr

def fan_sheath_frames(P, s_vec, n_vec):
    """frames for a petiole such that profile x = -s (left), y = n (up).  E1 x E2 must equal T."""
    T, E1, E2 = transport_frames(P)
    # rotate transport frame so E2 aligns with the blade normal at the tip, blend along length
    out1 = np.zeros_like(E1); out2 = np.zeros_like(E2)
    for i in range(len(P)):
        nn = nrm(n_vec - T[i] * np.dot(n_vec, T[i]))
        e1 = np.cross(nn, T[i])
        out1[i] = e1; out2[i] = nn
    return out1, out2

class PalmFan:
    def __init__(self, name, seed, height):
        self.name = name; self.seed = seed; self.H = height
        rng = np.random.default_rng(seed)
        self.rng = rng
        self.crown_h = 1.55 + 0.1 * rng.standard_normal()
        self.top = height - self.crown_h          # top of boot / where the live petioles leave
        self.P = palm_axis(rng, self.top + 0.6, base_lean_deg=rng.uniform(5, 9))
        self.r_top = 0.165 * (1.0 if height < 15 else 0.95)
        self.boot_len = 1.05
        n_live = 34 if height < 15 else 38
        self.fronds = []
        for i in range(n_live):
            age = i / (n_live - 1)
            prm = fan_frond_params(rng, age)
            phi = i * math.radians(137.508) + rng.normal(0, 0.12)
            elev = math.radians(lerp(8, 118, age ** 0.75) + rng.normal(0, 6))
            z = self.top + 0.36 - 0.45 * age + rng.normal(0, 0.03)
            prm.update(phi=phi, elev=elev, z=z, age=age, dead=False,
                       variant=int(rng.choice(FAN_COLS_GREEN)) if age < 0.8 or rng.uniform() < 0.5 else int(rng.choice(FAN_COLS_OLD)))
            self.fronds.append(prm)
        n_dead = int(rng.integers(10, 14))
        for i in range(n_dead):
            prm = fan_frond_params(rng, 1.0, dead=True)
            phi = (n_live + i) * math.radians(137.508) + rng.normal(0, 0.25)
            prm.update(phi=phi, elev=math.radians(rng.uniform(160, 176)), z=self.top - 0.05 - rng.uniform(0, 0.3),
                       age=1.0, dead=True, variant=int(rng.choice(FAN_COLS_DEAD)))
            self.fronds.append(prm)

    def radius(self, z):
        s = np.clip(z / self.H, 0, 1)
        zc = np.maximum(z, 0)
        r = self.r_top * (1.1 - 0.12 * s) * (1 + 0.85 * np.exp(-zc / 0.5) + 0.25 * np.exp(-zc / 0.12))
        r = r * (1 + 0.08 * np.clip(-z / SINK, 0, 1))
        # slight widening into the boot
        r = r + 0.03 * smoothstep(self.top - self.boot_len - 0.6, self.top - self.boot_len, z)
        return r

    def frond_base(self, prm, out_r=0.6):
        c, d = axis_at(self.P, prm['z'])
        rad = np.array([math.cos(prm['phi']), math.sin(prm['phi']), 0.0])
        base = c + rad * self.radius(prm['z']) * out_r
        d0 = math.sin(prm['elev']) * rad + math.cos(prm['elev']) * np.array([0, 0, 1.0])
        return base, nrm(d0), rad

    # ------------------------------------------------------------------ hi
    def build_hi(self, mats):
        rng = np.random.default_rng(self.seed + 1000)
        mb = MB()
        BARK, LEAF = 0, 1
        # trunk: 28 sides, ring every 5cm (more at the base)
        zs = np.concatenate([np.linspace(-SINK, 1.5, 40), np.arange(1.55, self.top - self.boot_len + 0.12, 0.08)])
        P = resample(self.P, zs)
        k = 28
        rn = 0.02 * fnoise(len(zs), k, scale=3, seed=self.seed)
        prof = circle_profile(self.radius(zs), k, noise=rn)
        sweep(mb, P, prof, BARK, region=(0.0, 0.5, 0, 1), tile_v=1.0, rep_u=1, tag=0)
        # boot core (lattice) up into the crown
        zb = np.linspace(self.top - self.boot_len - 0.05, self.top + 0.45, 24)
        Pb = resample(self.P, zb)
        tb = (zb - zb[0]) / (zb[-1] - zb[0])
        rb = self.radius(zb) + 0.035 + 0.05 * np.sin(np.clip(tb, 0, 1) * math.pi * 0.9) - 0.12 * smoothstep(0.75, 1.0, tb)
        sweep(mb, Pb, circle_profile(rb, 24), BARK, region=(0.5, 1.0, 0.5, 1.0), tile_v=None, rep_u=1, tag=0, cap_end=True)
        # boot stubs: old cut petiole bases, spiral, pointing up/out, with split heels
        nst = 54 if self.H < 15 else 58
        for i in range(nst):
            t = i / (nst - 1)
            z = self.top - 0.05 - t * (self.boot_len - 0.05) + rng.normal(0, 0.02)
            phi = i * math.radians(137.508) + rng.normal(0, 0.1)
            c, _ = axis_at(self.P, z)
            rad = np.array([math.cos(phi), math.sin(phi), 0])
            tng = np.array([-math.sin(phi), math.cos(phi), 0])
            rr = self.radius(z) + 0.04
            base = c + rad * rr * 0.85
            ang = math.radians(rng.uniform(18, 40))
            d = nrm(math.sin(ang) * rad + math.cos(ang) * np.array([0, 0, 1.0]) + 0.15 * rng.standard_normal(3))
            L = rng.uniform(0.18, 0.42) * (1.1 - 0.4 * t)
            ns = 4
            Ps = np.array([base + d * L * (j / ns) + rad * 0.02 * math.sin(math.pi * j / ns) for j in range(ns + 1)])
            wv = np.linspace(rng.uniform(0.11, 0.15), rng.uniform(0.05, 0.08), ns + 1)
            th = np.linspace(0.035, 0.018, ns + 1)
            pr = np.stack([np.stack([wv / 2, th / 2], -1), np.stack([-wv / 2, th / 2], -1),
                           np.stack([-wv / 2, -th / 2], -1), np.stack([wv / 2, -th / 2], -1)], 1)
            e2 = nrm(rad - d * np.dot(rad, d)); e1 = np.cross(e2, d)
            E1 = np.repeat(e1[None], ns + 1, 0); E2 = np.repeat(e2[None], ns + 1, 0)
            sweep(mb, Ps, pr, BARK, region=(0.5, 1.0, 0.0, 0.47), tile_v=L * 1.05, rep_u=1, tag=0, E=(E1, E2))
            # cut face (lighter band at the top of the stub region)
            top4 = Ps[-1][None] + pr[-1][:, 0:1] * e1 + pr[-1][:, 1:2] * e2
            bi = mb.verts(top4)
            mb.faces([[bi, bi + 1, bi + 2, bi + 3]], [[[0.55, 0.97], [0.95, 0.97], [0.95, 0.995], [0.55, 0.995]]], BARK)
            # split heels: two strips running down-left / down-right on the core
            for sgn in (-1, 1):
                hd = nrm(-0.75 * np.array([0, 0, 1.0]) + sgn * 0.65 * tng)
                hl = rng.uniform(0.12, 0.2)
                h0 = base - rad * 0.01
                h1 = h0 + hd * hl + rad * 0.005
                wv2 = 0.045
                side = nrm(np.cross(rad, hd))
                quad = np.array([h0 - side * wv2, h0 + side * wv2, h1 + side * wv2 * 0.6, h1 - side * wv2 * 0.6])[::-1] + rad * 0.012
                bi = mb.verts(quad)
                mb.faces([[bi, bi + 1, bi + 2, bi + 3]], [[[0.55, 0.05], [0.95, 0.05], [0.95, 0.4], [0.55, 0.4]]], BARK)
        # spear (unopened newest leaf)
        c, _ = axis_at(self.P, self.top + 0.4)
        spear = dict(R=0.9, nseg=20, theta=math.radians(14), fold=2.5, arch=0.0, droop=0.3, split=0.9, pet_len=0.6,
                     phi=rng.uniform(0, 6.3), elev=math.radians(4), z=self.top + 0.42, age=0.0, dead=False,
                     variant=FAN_COLS_GREEN[0])
        for prm in [spear] + self.fronds:
            self._frond_hi(mb, prm, rng, LEAF)
        ob = mb.build(self.name + '_hi', mats)
        log(self.name, 'hi tris', mb.tris())
        return [ob]

    def _frond_hi(self, mb, prm, rng, LEAF):
        base, d0, rad = self.frond_base(prm, out_r=0.85 if prm['dead'] else 0.6)
        if prm['dead']:
            Pp, d1 = dead_petiole(base, rad, rng, prm['pet_len'], nstep=12)
            f = d1; n = nrm(rad - f * np.dot(rad, f)); s = np.cross(f, n)
        else:
            bend = 0.35 * (0.4 + prm['age'])
            Pp = petiole_curve(base, d0, prm['pet_len'], bend, nstep=12)
            f, s, n = blade_frame(Pp, rad)
        pet_col = FAN_COL_PET_DEAD if prm['dead'] else FAN_COL_PET
        pr = petiole_profile(len(Pp), rng)
        E1, E2 = fan_sheath_frames(Pp, s, n)
        u0 = pet_col / 16 + 0.002; u1 = (pet_col + 1) / 16 - 0.002
        sweep(mb, Pp, pr, LEAF, region=(u0, u1, 0.0, 1.0), tile_v=prm['pet_len'] * 1.02, rep_u=1, tag=1, E=(E1, E2))
        # blade segments
        H = Pp[-1]
        segs = fan_segment_lines(prm, rng, H, f, s, n)
        for k, sg in enumerate(segs):
            var = prm['variant']
            if not prm['dead'] and rng.uniform() < 0.25:
                var = int(rng.choice(FAN_COLS_GREEN)) if var in FAN_COLS_GREEN else var
            u0 = var / 16 + 0.004; u1 = (var + 1) / 16 - 0.004; um = (u0 + u1) / 2
            Pn = sg['P']; A = sg['A']; W = sg['W']; T = sg['T']
            Nn = nrm(np.cross(T, A))
            if np.dot(Nn[len(Nn) // 3], n) < 0:
                Nn = -Nn
            pleat = 0.22 * W
            left = Pn + A * (W / 2)[:, None] + Nn * (pleat / 2)[:, None]
            mid = Pn - Nn * (pleat / 2)[:, None]
            right = Pn - A * (W / 2)[:, None] + Nn * (pleat / 2)[:, None]
            G = np.stack([right, mid, left], 1)
            v = sg['S'] / sg['R']
            UV = np.stack([np.stack([np.full_like(v, u0), v], -1), np.stack([np.full_like(v, um), v], -1),
                           np.stack([np.full_like(v, u1), v], -1)], 1)
            mb.grid(G, UV, LEAF, tag=1)

    # ------------------------------------------------------------------ lod0
    def build_lod0(self, mats, card_layout):
        rng = np.random.default_rng(self.seed + 2000)
        mb = MB()
        BARK, LEAF = 0, 1
        zs = np.concatenate([[-SINK, 0.0, 0.2, 0.45, 0.8, 1.3], np.linspace(2.0, self.top - self.boot_len + 0.1, 9)])
        P = resample(self.P, zs)
        sweep(mb, P, circle_profile(self.radius(zs), 8), BARK, region=(0.0, 0.5, 0, 1), tile_v=1.0, rep_u=1)
        zb = np.linspace(self.top - self.boot_len - 0.05, self.top + 0.45, 6)
        Pb = resample(self.P, zb)
        tb = (zb - zb[0]) / (zb[-1] - zb[0])
        rb = self.radius(zb) + 0.06 + 0.05 * np.sin(tb * math.pi * 0.9) - 0.12 * smoothstep(0.75, 1.0, tb)
        sweep(mb, Pb, circle_profile(rb, 8), BARK, region=(0.5, 1.0, 0.5, 1.0), tile_v=None, rep_u=1, cap_end=True)
        # a ring of simple stubs breaking the boot silhouette
        for i in range(18):
            t = i / 17
            z = self.top - 0.08 - t * (self.boot_len - 0.15)
            phi = i * math.radians(137.508)
            c, _ = axis_at(self.P, z)
            rad = np.array([math.cos(phi), math.sin(phi), 0])
            base = c + rad * (self.radius(z) + 0.05)
            ang = math.radians(rng.uniform(20, 38))
            d = nrm(math.sin(ang) * rad + math.cos(ang) * np.array([0, 0, 1.0]))
            L = rng.uniform(0.22, 0.38)
            Ps = np.array([base, base + d * L])
            w = 0.1; th = 0.03
            pr = np.array([[w / 2, th / 2], [-w / 2, th / 2], [-w / 2, -th / 2], [w / 2, -th / 2]])
            e2 = nrm(rad - d * np.dot(rad, d)); e1 = np.cross(e2, d)
            sweep(mb, Ps, pr, BARK, region=(0.5, 1.0, 0.0, 0.47), tile_v=L, rep_u=1, E=(np.array([e1, e1]), np.array([e2, e2])))
        # fronds
        for prm in self.fronds:
            self._frond_lod0(mb, prm, rng, LEAF, card_layout)
        # spear as a thin 4-sided cone
        c, _ = axis_at(self.P, self.top + 0.35)
        Ps = np.array([c, c + np.array([0.02, 0.0, 0.7]), c + np.array([0.03, 0.01, 1.35])])
        pr = circle_profile(np.array([0.05, 0.035, 0.004]), 4)
        u0, u1 = card_layout['pet_live']
        sweep(mb, Ps, pr, LEAF, region=(u0[0], u0[1], u1[0], u1[1]), tile_v=1.4, tag=1, swap=True)
        return finish_lod0(mb, mats, self.name)

    def _frond_lod0(self, mb, prm, rng, LEAF, lay):
        base, d0, rad = self.frond_base(prm)
        bend = (0.35 if not prm['dead'] else 3.5) * (0.4 + prm['age'])
        Pp = petiole_curve(base, d0, prm['pet_len'], bend, nstep=4)
        f, s, n = blade_frame(Pp, rad)
        if prm['dead']:
            # dead fronds: two crossed cards hanging from the crown base
            cell = lay['dead'][prm['variant'] - FAN_COLS_DEAD[0]]
            c, _ = axis_at(self.P, prm['z'])
            top = c + rad * (self.radius(prm['z']) + 0.12) + np.array([0, 0, 0.05])
            L = prm['pet_len'] + prm['R'] * 0.9
            down = nrm(np.array([0, 0, -1.0]) + 0.15 * rad + 0.06 * rng.standard_normal(3))
            for side in (np.cross(down, rad), rad):
                side = nrm(side - down * np.dot(side, down))
                wd = lay['dead_aspect'] * L
                A = top - side * wd / 2; B = top + side * wd / 2
                quad = np.array([A, B, B + down * L, A + down * L])
                bi = mb.verts(quad, tag=1)
                (cu0, cu1), (cv0, cv1) = cell
                # image long axis is u (cell x): top of frond at u0
                mb.faces([[bi, bi + 1, bi + 2, bi + 3]], [[[cu0, cv1], [cu0, cv0], [cu1, cv0], [cu1, cv1]]], LEAF)
            return
        # petiole: 3-sided prism
        pr = circle_profile(np.linspace(0.06, 0.025, len(Pp)), 3)
        (pu0, pu1), (pv0, pv1) = lay['pet_live']
        sweep(mb, Pp, pr, LEAF, region=(pu0, pu1, pv0, pv1), tile_v=prm['pet_len'] * 1.02, tag=1, swap=True)
        # blade card: polar sheet deformed like the hi segments
        cell = lay['live'][lay['live_map'](prm['variant'])]
        (cu0, cu1), (cv0, cv1) = cell
        H = Pp[-1]
        R = prm['R']
        nth = 13
        thetas = np.linspace(-prm['theta'] * 1.04, prm['theta'] * 1.04, nth)
        rs = lambda th: min(R * (0.55 + 0.45 * max(math.cos(th * 0.78), 0) ** 1.2) * 1.08, 1.045 * R)
        lines = fan_segment_lines(prm, rng, H, f, s, n, J_fused=3, J_free=4, sheet=True, theta_list=thetas, rad_scale=rs)
        G = np.stack([ln['P'] for ln in lines], 1)        # (J+1, nth, 3)
        # uv from flat polar coords normalised by R: x along costa in [-0.27,1.05]R, y across in [-1,1]R
        S_ = np.stack([ln['S'] for ln in lines], 1); TH = np.array([ln['th'] for ln in lines])[None, :]
        xl = S_ * np.cos(TH) / R; yl = S_ * np.sin(TH) / R
        U = cu0 + (yl + 1.0) / 2.0 * (cu1 - cu0)
        Vv = cv0 + (xl + 0.27) / 1.32 * (cv1 - cv0)
        mb.grid(G, np.stack([U, Vv], -1), LEAF, tag=1)

# ---- palm_fan cards (lod0 leaf atlas) --------------------------------------------------------------------------
FAN_CARD = dict(
    # cells: (u0,u1),(v0,v1) in atlas; live frond cells 512x336, dead 512x336 (long axis = u)
    live=[((0.0, 0.5), (0.0 + 16 / 1024, 352 / 1024)), ((0.5, 1.0), (16 / 1024, 352 / 1024)),
          ((0.0, 0.5), (352 / 1024, 688 / 1024)), ((0.5, 1.0), (352 / 1024, 688 / 1024))],
    dead=[((0.0, 0.5), (688 / 1024, 1.0)), ((0.5, 1.0), (688 / 1024, 1.0))],
    pet_live=((0.0, 0.5), (0.0, 7 / 1024)), pet_dead=((0.5, 1.0), (0.0, 7 / 1024)),
    dead_aspect=336 / 512,
)

def fan_live_map(variant):
    if variant in FAN_COLS_OLD:
        return 3
    return [0, 1, 2][variant % 3]
FAN_CARD['live_map'] = fan_live_map

def gen_palm_fan_cards(tdir, out_png, samples):
    """render flat fronds (no droop) from above + hanging dead fronds from the side into the LOD0 leaf atlas."""
    hi_leaf = os.path.join(tdir, 'palm_fan_leaf_hi.png')
    atlas = np.zeros((1024, 1024, 4))
    tmp = os.path.join(tdir, '_card.png')
    variants = [[2, 5], [7, 3], [9, 4], [10, 11]]     # segment colour columns mixed per card
    for ci, cols in enumerate(variants):
        def build(cols=cols, ci=ci):
            m = make_material('cardleaf', hi_leaf, alpha=True)
            rng = np.random.default_rng(100 + ci)
            mb = MB()
            prm = dict(R=1.0, nseg=56, theta=math.radians(108), fold=0.0, arch=0.0, droop=0.0, split=0.5)
            H = np.zeros(3); f = np.array([0, 1.0, 0]); s = np.array([1.0, 0, 0]); n = np.array([0, 0, 1.0])
            segs = fan_segment_lines(prm, rng, H, f, s, n, J_fused=6, J_free=10, rmax=1.03)
            for sg in segs:
                var = int(rng.choice(cols))
                u0 = var / 16 + 0.004; u1 = (var + 1) / 16 - 0.004; um = (u0 + u1) / 2
                Pn, A, W = sg['P'], sg['A'], sg['W']
                Nn = np.repeat(n[None], len(Pn), 0)
                pleat = 0.25 * W
                G = np.stack([Pn - A * (W / 2)[:, None] + Nn * (pleat / 2)[:, None], Pn - Nn * (pleat / 2)[:, None],
                              Pn + A * (W / 2)[:, None] + Nn * (pleat / 2)[:, None]], 1)
                v = sg['S'] / sg['R']
                UV = np.stack([np.stack([np.full_like(v, u0), v], -1), np.stack([np.full_like(v, um), v], -1),
                               np.stack([np.full_like(v, u1), v], -1)], 1)
                mb.grid(G, UV, 0, tag=1)
            # little hastula disc
            return [mb.build('card', [m])]
        img = card_render(build, (-1.0, 1.0), (-0.27, 1.05), 512, 336, tmp, samples=samples, view_dir='TOP')
        (cu0, cu1), (cv0, cv1) = FAN_CARD['live'][ci]
        atlas[int(cv0 * 1024):int(cv0 * 1024) + 336, int(cu0 * 1024):int(cu0 * 1024) + 512] = img
    # dead fronds: build hanging, render from the side, long axis along image x
    for di in range(2):
        def build(di=di):
            m = make_material('cardleaf', hi_leaf, alpha=True)
            rng = np.random.default_rng(200 + di)
            mb = MB()
            for rep in range(2):
                prm = fan_frond_params(rng, 1.0, dead=True)
                prm['R'] = 0.75; prm['pet_len'] = 1.15
                # petiole along -X (hanging direction mapped to +x in image), blade continues
                base = np.array([0.0, 0.0, 0.0])
                d0 = nrm(np.array([1.0, 0.0, 0.05 * (rep - 0.5)]))
                Pp = np.array([base + d0 * prm['pet_len'] * t for t in np.linspace(0, 1, 6)])
                pr = petiole_profile(len(Pp), rng, w0=0.09, w1=0.04, sheath=0.12)
                f = d0; s = np.array([0, 0, 1.0]); n = np.array([0, -1.0, 0])
                E1, E2 = fan_sheath_frames(Pp, s, n)
                pc = FAN_COL_PET_DEAD
                sweep(mb, Pp, pr, 0, region=(pc / 16, (pc + 1) / 16, 0, 1), tile_v=1.2, E=(E1, E2), tag=1)
                prm['droop'] = 0.0; prm['fold'] = 0.0; prm['theta'] = math.radians(22 + 8 * rep)
                segs = fan_segment_lines(prm, rng, Pp[-1], f, s, n, J_fused=4, J_free=6)
                for sg in segs:
                    var = FAN_COLS_DEAD[(di + (rng.uniform() < 0.3)) % 2]
                    u0 = var / 16 + 0.004; u1 = (var + 1) / 16 - 0.004; um = (u0 + u1) / 2
                    Pn, A, W = sg['P'], sg['A'], sg['W'] * 1.6
                    jitter = rng.normal(0, 0.03, 3) * np.array([0, 0, 1])
                    Nn = np.repeat(n[None], len(Pn), 0)
                    G = np.stack([Pn - A * (W / 2)[:, None] + jitter, Pn + Nn * 0.01 + jitter,
                                  Pn + A * (W / 2)[:, None] + jitter], 1)
                    v = sg['S'] / sg['R']
                    UV = np.stack([np.stack([np.full_like(v, u0), v], -1), np.stack([np.full_like(v, um), v], -1),
                                   np.stack([np.full_like(v, u1), v], -1)], 1)
                    mb.grid(G, UV, 0, tag=1)
            return [mb.build('card', [m])]
        L = 1.15 + 0.75 * 1.0
        img = card_render(build, (0.0, L + 0.05), (-(L + 0.05) * 336 / 512 / 2, (L + 0.05) * 336 / 512 / 2), 512, 336, tmp,
                          samples=samples, view_dir='FRONT')
        (cu0, cu1), (cv0, cv1) = FAN_CARD['dead'][di]
        atlas[int(cv0 * 1024):int(cv0 * 1024) + 336, int(cu0 * 1024):int(cu0 * 1024) + 512] = img
    # petiole strips (long axis along u): resample petiole columns of the hi atlas
    hi = load_image(hi_leaf)
    for key, col in (('pet_live', FAN_COL_PET), ('pet_dead', FAN_COL_PET_DEAD)):
        strip = hi[:, col * 64:(col + 1) * 64]            # (1024 along, 64 around)
        strip = np.transpose(strip, (1, 0, 2))           # (64 around, 1024 along)
        strip = resize(strip, 7, 512)
        (u0, u1), (v0, v1) = FAN_CARD[key]
        atlas[0:7, int(u0 * 1024):int(u0 * 1024) + 512] = strip
    atlas = dilate_rgba(atlas)
    save_image(atlas, out_png)
    if os.path.exists(tmp):
        os.remove(tmp)


# ================================================================================================================
# palm_date (Phoenix canariensis)
# ================================================================================================================
def phash(i, j, s=0.0):
    return (np.sin(i * 12.9898 + j * 78.233 + s * 37.719) * 43758.5453) % 1.0

def tex_diamond(w, h, nc, nr, rng, pal, knob=False):
    """trimmed leaf-base diamonds (periodic over the tile).  returns colour (h,w,3), height (h,w)."""
    u = (np.arange(w)[None, :] + 0.5) / w + np.zeros((h, 1))
    v = (np.arange(h)[:, None] + 0.5) / h + np.zeros((1, w))
    ju = 0.12 * fnoise(h, w, scale=3, seed=int(rng.integers(1e9))) / nc
    jv = 0.12 * fnoise(h, w, scale=3, seed=int(rng.integers(1e9))) / nr
    a = (u + ju) * nc + (v + jv) * nr
    b = -(u + ju) * nc + (v + jv) * nr
    ia, ib = np.floor(a), np.floor(b); fa, fb = a - ia, b - ib
    du = (fa - fb) / 2; dv = (fa + fb - 1) / 2
    e = np.clip(2 * (np.abs(du) + np.abs(dv)), 0, 1)
    k1 = np.mod(ia + ib, 2 * nr); k2 = np.mod(ia - ib, 2 * nc)
    r1, r2, r3 = phash(k1, k2, 1), phash(k1, k2, 2), phash(k1, k2, 3)
    fib = fnoise(h, w, scale=90, beta=1.6, seed=int(rng.integers(1e9)), ax=1.0, ay=5.0)
    fib2 = fnoise(h, w, scale=160, beta=1.2, seed=int(rng.integers(1e9)))
    bulge = (1 - e ** (1.6 if not knob else 2.2))
    upper = smoothstep(-0.15, 0.25, dv)
    hgt = bulge * (0.55 + 0.6 * upper) * (0.8 + 0.4 * r1)
    cutline = 0.05 + 0.2 * (r2 - 0.5)
    cut = (dv > cutline) & (e < (0.78 if not knob else 0.82))
    hgt = np.where(cut, hgt * 0.92 + 0.06, hgt)
    groove = smoothstep(0.78, 0.97, e)
    hgt = hgt - 0.5 * groove + 0.06 * fib + 0.03 * fib2
    c_side = np.array(pal['side']) * (0.85 + 0.3 * r3[..., None])
    c_cut = np.array(pal['cut']) * (0.88 + 0.24 * r1[..., None])
    col = np.where(cut[..., None], c_cut, c_side)
    col = col * (0.9 + 0.1 * fib[..., None]) * (0.95 + 0.06 * fib2[..., None])
    col = col * (1 - 0.75 * groove[..., None]) + np.array(pal['groove']) * 0.75 * groove[..., None]
    col = col * np.clip(0.75 + 0.35 * bulge, 0, 1.1)[..., None]
    mott = fnoise(h, w, scale=3, seed=int(rng.integers(1e9)))
    col = col * (1 + 0.07 * mott[..., None])
    return np.clip(col, 0, 1), hgt

DATE_COLS_GREEN = list(range(0, 8))
DATE_COLS_OLD = [8, 9]
DATE_COLS_DEAD = [10, 11]
DATE_COL_SPINE = 12
DATE_COL_RACHIS = 13
DATE_COL_RACHIS_OLD = 14

def gen_palm_date_textures(tdir, seed=7):
    rng = np.random.default_rng(seed)
    col = np.zeros((1024, 1024, 3)); nimg = np.zeros((1024, 1024, 3)); H = np.zeros((1024, 1024))
    c, hh = tex_diamond(768, 1024, 7, 10, rng, dict(side=(0.37, 0.32, 0.26), cut=(0.50, 0.45, 0.37), groove=(0.09, 0.075, 0.06)))
    col[:, :768] = c; nimg[:, :768] = height_to_normal(hh, 9.0); H[:, :768] = hh
    c, hh = tex_diamond(256, 1024, 3, 16, rng, dict(side=(0.42, 0.31, 0.2), cut=(0.68, 0.55, 0.37), groove=(0.1, 0.07, 0.05)), knob=True)
    col[:, 768:] = c; nimg[:, 768:] = height_to_normal(hh, 7.0); H[:, 768:] = hh
    save_image(col, os.path.join(tdir, 'palm_date_bark.jpg'))
    save_image(nimg, os.path.join(tdir, 'palm_date_bark_n.jpg'))
    np.save(os.path.join(tdir, 'palm_date_bark_h.npy'), H.astype(np.float32))
    atlas = np.zeros((1024, 1024, 4))
    for i in DATE_COLS_GREEN:
        base = hsv2rgb(rng.uniform(85, 102), rng.uniform(0.45, 0.58), rng.uniform(0.30, 0.39))
        atlas[:, i * 64:(i + 1) * 64] = seg_texture(1024, 64, rng, 'live', base, tip_brown=rng.uniform(0, 0.04), notch=False)
    for i in DATE_COLS_OLD:
        atlas[:, i * 64:(i + 1) * 64] = seg_texture(1024, 64, rng, 'live', hsv2rgb(rng.uniform(58, 70), 0.55, 0.42),
                                                    tip_brown=rng.uniform(0.1, 0.25), notch=False)
    for j, i in enumerate(DATE_COLS_DEAD):
        atlas[:, i * 64:(i + 1) * 64] = seg_texture(1024, 64, rng, 'dead', [(0.55, 0.45, 0.3), (0.47, 0.39, 0.29)][j], notch=False)
    sp = seg_texture(1024, 64, rng, 'live', (0.72, 0.6, 0.3), notch=False)
    yv = (np.arange(1024)[:, None] + 0.5) / 1024
    sp[..., :3] = sp[..., :3] * (1 - 0.35 * smoothstep(0.6, 1.0, yv))[..., None]
    atlas[:, DATE_COL_SPINE * 64:(DATE_COL_SPINE + 1) * 64] = sp
    rc = petiole_texture(1024, 64, rng, True, margins=(0.0,))
    tint = np.array([1.25, 1.12, 0.8])
    rc[..., :3] = np.clip(rc[..., :3] * tint, 0, 1)
    atlas[:, DATE_COL_RACHIS * 64:(DATE_COL_RACHIS + 1) * 64] = rc
    atlas[:, DATE_COL_RACHIS_OLD * 64:(DATE_COL_RACHIS_OLD + 1) * 64] = petiole_texture(1024, 64, rng, False, margins=(0.0,))
    atlas[:, 15 * 64:] = atlas[:, DATE_COL_RACHIS * 64:(DATE_COL_RACHIS + 1) * 64]
    atlas = dilate_rgba(atlas)
    save_image(atlas, os.path.join(tdir, 'palm_date_leaf_hi.png'))

def date_frond_geometry(mb, prm, rng, LEAF, flat=False):
    """one pinnate frond.  prm: base, d0, L, bend, beta, alpha, droop, nleaf, var, rachis_col.  flat=True lays it in
    the XY plane along +Y (for card renders)."""
    up = np.array([0, 0, 1.0])
    L = prm['L']; nst = 26
    if flat:
        P = np.stack([np.zeros(nst + 1), np.linspace(0, L, nst + 1), np.zeros(nst + 1)], -1)
        T = np.repeat(np.array([[0, 1.0, 0]]), nst + 1, 0); Nup = np.repeat(up[None], nst + 1, 0)
    else:
        P = [prm['base'].copy()]; d = nrm(prm['d0']); p = prm['base'].copy(); ds = L / nst
        for i in range(nst):
            horiz = math.sqrt(max(0.0, 1 - d[2] ** 2))
            d = rot_toward(d, -up, prm['bend'] * ds * (0.25 + horiz) * (0.6 + 0.8 * i / nst))
            p = p + d * ds; P.append(p.copy())
        P = np.array(P)
        T = np.zeros_like(P); T[1:-1] = P[2:] - P[:-2]; T[0] = P[1] - P[0]; T[-1] = P[-1] - P[-2]; T = nrm(T)
        rad = nrm(np.array([prm['d0'][0], prm['d0'][1], 0]) + 1e-6)
        Nup = nrm(up[None] - T * (T @ up)[:, None] + 0.02 * rad[None])
    S = nrm(np.cross(T, Nup))
    tt = np.linspace(0, 1, nst + 1)
    # rachis tube (flattened ellipse, wider at the base)
    rr = 0.006 + 0.045 * (1 - tt) ** 0.9 + 0.05 * np.exp(-tt / 0.05)
    k = 5
    ang = np.arange(k) / k * 2 * math.pi
    prof = np.stack([np.cos(ang)[None] * rr[:, None] * 0.8, np.sin(ang)[None] * rr[:, None] * 1.25], -1)
    rc = prm['rachis_col']
    sweep(mb, P, prof, LEAF, region=(rc / 16 + 0.003, (rc + 1) / 16 - 0.003, 0, 1), tile_v=L * 1.0001, tag=1, E=(Nup, S))
    # leaflets + basal spines, both sides
    def at(t):
        x = t * nst; i = np.clip(np.floor(x).astype(int), 0, nst - 1); f = (x - i)[:, None]
        return (P[i] * (1 - f) + P[i + 1] * f, nrm(T[i] * (1 - f) + T[i + 1] * f), nrm(Nup[i] * (1 - f) + Nup[i + 1] * f),
                nrm(S[i] * (1 - f) + S[i + 1] * f))
    nl = prm['nleaf']
    for kind in ('spine', 'leaf'):
        if kind == 'leaf':
            t = np.linspace(0.2, 0.995, nl) + rng.uniform(-0.25, 0.25, nl) * (0.795 / nl)
            ln = 0.1 + 0.45 * np.sin(math.pi * np.clip((t - 0.19) / 0.81, 0, 1) ** 0.62) ** 0.9
            ln *= prm.get('leaf_scale', 1.0) * (1 + 0.06 * rng.standard_normal(nl))
            wd = 0.024 * np.ones(nl) * (1 + 0.1 * rng.standard_normal(nl))
            nseg = 4
        else:
            nsp = int(rng.integers(9, 14))
            t = np.sort(rng.uniform(0.04, 0.2, nsp))
            ln = 0.05 + 0.12 * ((t - 0.04) / 0.16) * rng.uniform(0.7, 1.2, nsp)
            wd = 0.007 * np.ones(nsp)
            nseg = 2
        n_ = len(t)
        for side in (-1, 1):
            pb, tb, nb, sb = at(t)
            sd = sb * side
            al = math.radians(prm['alpha']) + rng.normal(0, 0.06, n_)
            if flat:
                be = np.zeros(n_)
            else:
                rank = (np.arange(n_) % 3) - 1
                be = math.radians(prm['beta']) + math.radians(11) * rank + rng.normal(0, 0.08, n_)
                if kind == 'spine':
                    be = be * 0.5
            d = nrm(sd * np.cos(al)[:, None] + tb * np.sin(al)[:, None])
            d = nrm(d * np.cos(be)[:, None] + nb * np.sin(be)[:, None])
            pts = [pb + sd * (rr[np.clip((t * nst).astype(int), 0, nst)] * 0.9)[:, None]]
            ds = ln / nseg
            dd = d.copy()
            for j in range(nseg):
                if not flat and kind == 'leaf':
                    dd = nrm(dd + np.array([0, 0, -1.0]) * (prm['droop'] * ds * (0.5 + j / nseg))[:, None])
                pts.append(pts[-1] + dd * ds[:, None])
            pts = np.stack(pts, 1)                               # (n, nseg+1, 3)
            Tl = nrm(np.diff(pts, axis=1)); Tl = np.concatenate([Tl, Tl[:, -1:]], 1)
            acr = nrm(tb[:, None, :] - Tl * np.sum(Tl * tb[:, None, :], -1, keepdims=True))
            nl_ = nrm(np.cross(Tl, acr))
            flipn = np.sum(nl_ * up, -1) < 0
            nl_[flipn] *= -1
            s_ = np.linspace(0, 1, nseg + 1)
            wprof = np.sin(math.pi * np.clip(s_, 0.02, 1) ** 0.55) ** 0.7
            wprof[0] = max(wprof[0], 0.35)
            W = wd[:, None] * wprof[None]
            fold = 0.3 * W
            left = pts + acr * (W / 2)[..., None] + nl_ * (fold / 2)[..., None]
            mid = pts - nl_ * (fold / 2)[..., None]
            right = pts - acr * (W / 2)[..., None] + nl_ * (fold / 2)[..., None]
            G = np.stack([right, mid, left], 2)                 # (n, nseg+1, 3, 3)
            if kind == 'spine':
                cols = np.full(n_, DATE_COL_SPINE)
            else:
                cols = prm['var_cols'][rng.integers(0, len(prm['var_cols']), n_)]
            u0 = cols / 16 + 0.004; u1 = (cols + 1) / 16 - 0.004; um = (u0 + u1) / 2
            for i in range(n_):
                UV = np.stack([np.stack([np.full(nseg + 1, u0[i]), s_], -1), np.stack([np.full(nseg + 1, um[i]), s_], -1),
                               np.stack([np.full(nseg + 1, u1[i]), s_], -1)], 1)
                mb.grid(G[i], UV, LEAF, tag=1)
    return P, T, Nup, S

class PalmDate:
    def __init__(self, name, seed, height):
        self.name = name; self.seed = seed; self.H = height
        rng = np.random.default_rng(seed); self.rng = rng
        self.crown_h = 3.1 + 0.2 * rng.standard_normal()
        self.top = height - self.crown_h           # top of the 'pineapple' knob
        self.knob_len = 1.3
        self.r0 = 0.43 if height < 9.5 else 0.45
        P = palm_axis(rng, self.top + 1.2, base_lean_deg=rng.uniform(1.0, 3.0))
        self.P = P
        n = 62 if height < 9.5 else 68
        self.fronds = []
        for i in range(n):
            age = i / (n - 1)
            phi = i * math.radians(137.508) + rng.normal(0, 0.1)
            elev = math.radians(lerp(14, 108, age ** 0.85) + rng.normal(0, 6))
            z = self.top + 0.75 - 1.05 * age + rng.normal(0, 0.04)
            L = lerp(3.4, 4.9, min(age * 1.6, 1.0)) * (1 + 0.05 * rng.standard_normal())
            old = age > 0.88 and rng.uniform() < 0.6
            var_cols = np.array(DATE_COLS_OLD if old else list(rng.choice(DATE_COLS_GREEN, 3, replace=False)))
            self.fronds.append(dict(phi=phi, elev=elev, z=z, L=L, age=age, bend=0.12 + 0.2 * age ** 1.2,
                                    beta=rng.uniform(28, 42), alpha=rng.uniform(30, 40), droop=0.6 + 1.6 * age,
                                    nleaf=int(rng.integers(104, 118)), var_cols=var_cols, old=old,
                                    rachis_col=DATE_COL_RACHIS_OLD if old else DATE_COL_RACHIS))
        self.H_tex = None

    def radius(self, z):
        zc = np.maximum(z, 0)
        r = self.r0 * (1 - 0.06 * np.clip(z / self.top, 0, 1)) * (1 + 0.22 * np.exp(-zc / 0.45))
        r = r * (1 + 0.06 * np.clip(-z / SINK, 0, 1))
        kn = smoothstep(self.top - self.knob_len - 0.5, self.top - self.knob_len + 0.4, z)
        r = r + 0.13 * kn
        top = smoothstep(self.top + 0.1, self.top + 0.95, z)
        r = r * (1 - 0.55 * top)
        return r

    def frond_base(self, prm):
        c, _ = axis_at(self.P, prm['z'])
        rad = np.array([math.cos(prm['phi']), math.sin(prm['phi']), 0.0])
        base = c + rad * self.radius(prm['z']) * 0.8
        d0 = math.sin(prm['elev']) * rad + math.cos(prm['elev']) * np.array([0, 0, 1.0])
        return base, nrm(d0), rad

    def _trunk(self, mb, BARK, k_tr, k_kn, ring, displace):
        H = load_image_npy(self.tdir, 'palm_date_bark_h.npy') if displace else None
        zt = np.arange(-SINK, self.top - self.knob_len + 0.06, ring)
        zk = np.arange(self.top - self.knob_len - 0.04, self.top + 1.0, ring * 0.8)
        for zs, k, reg, rep, tile, amp in ((zt, k_tr, (0.0, 0.75, 0, 1), 3, None, 0.035),
                                           (zk, k_kn, (0.75, 1.0, 0, 1), 8, None, 0.05)):
            P = resample(self.P, zs)
            r = self.radius(zs)
            circ = 2 * math.pi * float(np.mean(r))
            tile_v = (circ / rep) * (1024 / ((reg[1] - reg[0]) * 1024))
            noise = None
            if displace:
                seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
                vv = np.concatenate([[0], np.cumsum(seg)]) / tile_v
                uu = np.arange(k) / k * rep
                sub = H[:, int(reg[0] * 1024):int(reg[1] * 1024)]
                hv = sample_wrap(sub, (uu % 1)[None, :] + 0 * vv[:, None], vv[:, None] + 0 * uu[None, :])
                hv = (hv - hv.mean()) / (hv.std() + 1e-9)
                fade = np.clip((zs + 0.05) / 0.4, 0, 1)[:, None]
                noise = amp * hv * fade / np.maximum(r[:, None], 0.1)
            sweep(mb, P, circle_profile(r, k, noise=noise), BARK, region=reg, tile_v=tile_v, rep_u=rep, tag=0,
                  cap_end=(zs is zk))

    def build_hi(self, mats):
        rng = np.random.default_rng(self.seed + 1000)
        mb = MB(); BARK, LEAF = 0, 1
        self._trunk(mb, BARK, k_tr=96, k_kn=112, ring=0.03, displace=True)
        for prm in self.fronds:
            base, d0, rad = self.frond_base(prm)
            q = dict(prm, base=base, d0=d0)
            date_frond_geometry(mb, q, rng, LEAF)
        ob = mb.build(self.name + '_hi', mats)
        log(self.name, 'hi tris', mb.tris())
        return [ob]

    def build_lod0(self, mats, lay):
        rng = np.random.default_rng(self.seed + 2000)
        mb = MB(); BARK, LEAF = 0, 1
        # trunk: 8 sides, few rings
        for zs, reg, rep in ((np.concatenate([[-SINK, 0.0, 0.25, 0.6], np.linspace(1.2, self.top - self.knob_len + 0.05, 5)]), (0.0, 0.75, 0, 1), 3),
                             (np.linspace(self.top - self.knob_len - 0.05, self.top + 1.0, 6), (0.75, 1.0, 0, 1), 8)):
            P = resample(self.P, zs); r = self.radius(zs)
            circ = 2 * math.pi * float(np.mean(r))
            tile_v = (circ / rep) * (1024 / ((reg[1] - reg[0]) * 1024))
            sweep(mb, P, circle_profile(r, 8 if rep != 3 else 9), BARK, region=reg, tile_v=tile_v, rep_u=rep, cap_end=(rep == 8))
        for prm in self.fronds:
            base, d0, rad = self.frond_base(prm)
            self._frond_card(mb, dict(prm, base=base, d0=d0), rng, LEAF, lay)
        c, _ = axis_at(self.P, self.top + 0.5)
        return finish_lod0(mb, mats, self.name, centre=None, centre_offset=(0, 0, -0.4))

    def _frond_card(self, mb, prm, rng, LEAF, lay):
        up = np.array([0, 0, 1.0])
        L = prm['L']; nst = 14
        P = [prm['base'].copy()]; d = nrm(prm['d0']); p = prm['base'].copy(); ds = L / 26
        for i in range(26):
            horiz = math.sqrt(max(0.0, 1 - d[2] ** 2))
            d = rot_toward(d, -up, prm['bend'] * ds * (0.25 + horiz) * (0.6 + 0.8 * i / 26))
            p = p + d * ds; P.append(p.copy())
        P = np.array(P)[::2]
        n = len(P)
        T = np.zeros_like(P); T[1:-1] = P[2:] - P[:-2]; T[0] = P[1] - P[0]; T[-1] = P[-1] - P[-2]; T = nrm(T)
        rad = nrm(np.array([prm['d0'][0], prm['d0'][1], 0]) + 1e-6)
        Nup = nrm(up[None] - T * (T @ up)[:, None] + 0.02 * rad[None]); S = nrm(np.cross(T, Nup))
        tt = np.linspace(0, 1, n)
        HW = lay['half_width'] * L / lay['ref_len']
        beta = math.radians(prm['beta'] * 0.9)
        cols = []
        ws = [-1.0, -0.5, 0.0, 0.5, 1.0]
        for w in ws:
            sd = S * np.sign(w) if w != 0 else S
            dirv = nrm(sd * math.cos(beta) + Nup * math.sin(beta)) if w != 0 else S
            off = dirv * (abs(w) * HW)
            droop = -up[None] * (prm['droop'] * 0.35 * (abs(w) * HW) ** 2)
            cols.append(P + off + droop * (w != 0))
        G = np.stack(cols, 1)
        cell = lay['cells'][prm['cell']]
        (cu0, cu1), (cv0, cv1) = cell
        U = np.array([cu0 + (w + 1) / 2 * (cu1 - cu0) for w in ws])[None, :] + 0 * tt[:, None]
        Vv = (cv0 + tt * (cv1 - cv0))[:, None] + 0 * U
        mb.grid(G, np.stack([U, Vv], -1), LEAF, tag=1)

def load_image_npy(tdir, name):
    return np.load(os.path.join(tdir, name))

DATE_CARD = dict(cells=[((0.0, 0.25), (0.0, 1.0)), ((0.25, 0.5), (0.0, 1.0)), ((0.5, 0.75), (0.0, 1.0)), ((0.75, 1.0), (0.0, 1.0))],
                 half_width=0.5, ref_len=4.5)

def gen_palm_date_cards(tdir, out_png, samples):
    hi_leaf = os.path.join(tdir, 'palm_date_leaf_hi.png')
    atlas = np.zeros((1024, 1024, 4))
    tmp = os.path.join(tdir, '_card.png')
    sets = [[0, 1, 2], [3, 4, 5], [6, 7, 1], DATE_COLS_OLD]
    for ci, cols in enumerate(sets):
        def build(cols=cols, ci=ci):
            m = make_material('cardleaf', hi_leaf, alpha=True)
            rng = np.random.default_rng(300 + ci)
            mb = MB()
            prm = dict(L=4.5, alpha=35, beta=0, droop=0, nleaf=112, var_cols=np.array(cols),
                       rachis_col=DATE_COL_RACHIS_OLD if ci == 3 else DATE_COL_RACHIS, base=np.zeros(3))
            date_frond_geometry(mb, prm, rng, 0, flat=True)
            return [mb.build('card', [m])]
        img = card_render(build, (-0.5, 0.5), (0.0, 4.5), 256, 1024, tmp, samples=samples, view_dir='TOP')
        (cu0, cu1), _ = DATE_CARD['cells'][ci]
        atlas[:, int(cu0 * 1024):int(cu0 * 1024) + 256] = img
    atlas = dilate_rgba(atlas)
    save_image(atlas, out_png)
    if os.path.exists(tmp):
        os.remove(tmp)

# ================================================================================================================
# eucalyptus (E. globulus / camaldulensis)
# ================================================================================================================
EUC_LEAF_STATIONS = np.array([0.0, 0.11, 0.5, 0.82, 1.0])
EUC_PET = 0.11

def euc_leaf_shape(v, falc):
    """centre-line u and half-width (in UV units of the 128x512 leaf cell)"""
    t = np.clip((v - EUC_PET) / (1 - EUC_PET), 0, 1)
    uc = 0.5 + falc * (np.sin(math.pi * t) * 0.6 + t * 0.4 - 0.2) * (v > 0)
    hw = 0.27 * np.sin(math.pi * np.clip(t, 1e-3, 1) ** 0.6) ** 0.8
    hw = np.where(v < EUC_PET, 0.035, np.maximum(hw, 0.035 * (1 - t)))
    return uc, hw

def euc_leaf_image(h, w, rng, base, falc, kind):
    v = (np.arange(h)[:, None] + 0.5) / h + np.zeros((1, w))
    u = (np.arange(w)[None, :] + 0.5) / w + np.zeros((h, 1))
    uc, hw = euc_leaf_shape(v, falc)
    d = np.abs(u - uc) / np.maximum(hw, 1e-4)
    alpha = np.clip((1 - d) * hw * w * 0.7 + 0.5, 0, 1)
    alpha = np.where(v > 0.995, 0, alpha)
    t = np.clip((v - EUC_PET) / (1 - EUC_PET), 0, 1)
    col = np.ones((h, w, 3)) * np.array(base)
    st = fnoise(h, w, scale=10, seed=int(rng.integers(1e9)), ax=1.0, ay=0.6)
    col *= (1 + 0.05 * st[..., None])
    # side veins (faint, angled) + intramarginal vein
    sv = np.sin((v * 90 + np.abs(u - uc) * 60) * math.pi + rng.uniform(0, 6))
    col *= (1 + 0.018 * sv[..., None])
    mid = np.exp(-((u - uc) / 0.018) ** 2)
    col = col * (1 - 0.35 * mid[..., None]) + np.array([0.72, 0.68, 0.45]) * 0.35 * mid[..., None]
    edge = smoothstep(0.75, 1.0, d)
    col = col * (1 - 0.25 * edge[..., None]) + np.array([0.6, 0.55, 0.38]) * 0.25 * edge[..., None]
    # base / petiole: yellow to reddish
    pet = (v < EUC_PET + 0.02)
    col = np.where(pet[..., None], np.array([0.55, 0.42, 0.28]) * (1 + 0.1 * st[..., None]), col)
    # gradients, blemishes
    col *= (0.94 + 0.1 * t)[..., None]
    if kind in ('old', 'spot'):
        sp = fnoise(h, w, scale=30, seed=int(rng.integers(1e9)))
        spots = np.clip((sp - 1.6) / 0.5, 0, 1)[..., None]
        col = col * (1 - spots) + np.array([0.42, 0.33, 0.22]) * spots
    if kind == 'young':
        col = col * 0.7 + np.array([0.55, 0.33, 0.25]) * 0.3 * (1 - t[..., None] * 0.5)
    if kind == 'old':
        tipb = smoothstep(0.82, 0.95, v)[..., None]
        col = col * (1 - tipb) + np.array([0.48, 0.36, 0.22]) * tipb
    return np.concatenate([np.clip(col, 0, 1), alpha[..., None]], -1)

EUC_FALC = []

def grade_bluegum(src_dir, tdir):
    """pale grey-cream smooth gum bark with tan peeling patches, from Poly Haven bark_bluegum (CC0)."""
    c = load_image(os.path.join(src_dir, 'bark_bluegum_diff_1k.jpg'))[..., :3].astype(float)
    g = c.mean(-1, keepdims=True)
    chroma = c - g
    chroma = chroma - chroma.reshape(-1, 3).mean(0)        # drop the overall brown cast, keep local hue shifts
    gm, gs = g.mean(), g.std()
    ng = 0.63 + (g - gm) / gs * 0.08
    cream = np.array([1.0, 0.985, 0.95])
    out = ng * cream + chroma * 0.8
    # tan/ochre peeling patches where the source is most rusty
    rr = c[..., 0:1] - c[..., 2:3]
    thr = np.percentile(rr, 82)
    rust = blur_periodic(np.clip((rr - thr) * 14, 0, 1)[..., 0], 2.0)[..., None]
    out = out * (1 - 0.55 * rust) + np.array([0.70, 0.56, 0.40]) * 0.55 * rust
    save_image(np.clip(out, 0, 1), os.path.join(tdir, 'eucalyptus_bark.jpg'))
    n = load_image(os.path.join(src_dir, 'bark_bluegum_nor_gl_1k.jpg'))[..., :3]
    save_image(n, os.path.join(tdir, 'eucalyptus_bark_n.jpg'))

def gen_eucalyptus_textures(tdir, out, seed=9):
    rng = np.random.default_rng(seed)
    src = os.path.join(out, 'tex', 'bark_bluegum')
    if not os.path.exists(os.path.join(src, 'bark_bluegum_diff_1k.jpg')):
        os.makedirs(src, exist_ok=True)
        for k in ('diff', 'nor_gl'):
            subprocess.run(['curl', '-sfL', 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/bark_bluegum/bark_bluegum_%s_1k.jpg' % k,
                            '-o', os.path.join(src, 'bark_bluegum_%s_1k.jpg' % k)], check=True)
    grade_bluegum(src, tdir)
    atlas = np.zeros((1024, 1024, 4))
    falcs = []
    for ci in range(16):
        r_ = rng.uniform()
        kind = 'adult' if ci < 12 else ('young' if ci < 14 else 'old')
        if ci in (3, 9):
            kind = 'spot'
        hue = rng.uniform(78, 100); sat = rng.uniform(0.2, 0.32); val = rng.uniform(0.40, 0.50)
        base = hsv2rgb(hue, sat, val)
        falc = rng.uniform(0.13, 0.22) * rng.choice([-1, 1])
        falcs.append(falc)
        img = euc_leaf_image(512, 128, rng, base, falc, kind)
        x0 = (ci % 8) * 128; y0 = (ci // 8) * 512
        atlas[y0:y0 + 512, x0:x0 + 128] = img
    atlas = dilate_rgba(atlas)
    save_image(atlas, os.path.join(tdir, 'eucalyptus_leaf_hi.png'))
    json.dump(falcs, open(os.path.join(tdir, 'eucalyptus_leaf_falc.json'), 'w'))

def euc_leaves_mesh(mb, LEAF, base, ldir, side, length, cells, falcs, curv):
    """vectorised leaf strips: K stations (K-1 paired + tip) -> (K-2) quads + 1 tri per leaf (7 tris for K=5).
    Geometry follows the falcate outline of the texture so the silhouette holds even without alpha."""
    N = len(base)
    if N == 0:
        return
    st = EUC_LEAF_STATIONS; K = len(st); m = K - 1
    falc = np.asarray(falcs)[cells]
    uc, hw = euc_leaf_shape(st[None, :], falc[:, None])           # (N,K)
    hw_g = hw * 1.12 + 0.01
    nrm_ = nrm(np.cross(ldir, side))
    aspect = 128 / 512
    def pos(uu, vv):
        along = vv * length[:, None]
        across = (uu - 0.5) * length[:, None] * aspect
        bend = curv[:, None] * (vv ** 2) * length[:, None]
        return (base[:, None, :] + ldir[:, None, :] * along[..., None] + side[:, None, :] * across[..., None]
                + nrm_[:, None, :] * bend[..., None])
    uL = uc - hw_g; uR = uc + hw_g
    stm = np.broadcast_to(st[None, :m], (N, m))
    PL = pos(uL[:, :m], stm); PR = pos(uR[:, :m], stm); PT = pos(uc[:, m:], np.ones((N, 1)))
    V = np.concatenate([PL, PR, PT], 1)                              # (N,2m+1,3)
    b = mb.verts(V.reshape(-1, 3), tag=1)
    i0 = b + np.arange(N) * (2 * m + 1)
    j = np.arange(m - 1)[None]
    q = np.stack([i0[:, None] + j, i0[:, None] + m + j, i0[:, None] + m + j + 1, i0[:, None] + j + 1], -1)
    cu = (cells % 8) / 8.0; cv = (cells // 8) / 2.0
    def UV(uu, vv):
        return np.stack([cu[:, None] + np.clip(uu, 0.002, 0.998) / 8.0, cv[:, None] + np.clip(vv, 0.002, 0.998) / 2.0], -1)
    uvL = UV(uL[:, :m], stm); uvR = UV(uR[:, :m], stm)
    qu = np.stack([uvL[:, :m - 1], uvR[:, :m - 1], uvR[:, 1:m], uvL[:, 1:m]], 2)
    mb.faces(q.reshape(-1, 4), qu.reshape(-1, 4, 2), LEAF)
    t = np.stack([i0 + m - 1, i0 + 2 * m - 1, i0 + 2 * m], -1)
    uvT = UV(uc[:, m:], np.ones((N, 1)))
    tu = np.stack([uvL[:, m - 1], uvR[:, m - 1], uvT[:, 0]], 1)
    mb.faces(t, tu, LEAF)

def euc_clump(rng, anchor, bdir, size, leaf_mul=1.0, spacing=0.06):
    """a pendulous tuft: several hanging twigs (0.6-1.3 m) around the end of a branch, leaves hanging along them.
    returns twig polylines [(P, r0)] and leaf instance arrays (base, dir, side, length)."""
    up = np.array([0, 0, 1.0])
    ntw = int(rng.integers(4, 8))
    twigs = []; LB = []; LD = []; LS = []; LL = []
    for i in range(ntw):
        a0 = anchor - bdir * rng.uniform(0, 0.35) * size
        perp = nrm(np.cross(bdir, rng.standard_normal(3)))
        d = nrm(0.5 * bdir + 0.6 * perp + rng.uniform(-0.1, 0.5) * up)
        Lt = rng.uniform(0.6, 1.3) * size
        P = [a0]; p = a0.copy(); n = 5
        for j in range(n):
            d = nrm(d - up * 0.9 * (Lt / n) * (0.6 + j))
            p = p + d * Lt / n; P.append(p.copy())
        P = np.array(P)
        twigs.append((P, 0.005 * (0.8 + 0.4 * size)))
        nl = max(3, int(Lt / spacing * leaf_mul))
        ts = (np.arange(nl) + rng.uniform(0.3, 0.7, nl)) / nl
        ts = 0.08 + 0.92 * ts
        seg = np.clip((ts * n).astype(int), 0, n - 1); f = ts * n - seg
        pts = P[seg] * (1 - f[:, None]) + P[seg + 1] * f[:, None]
        tdir = nrm(P[seg + 1] - P[seg])
        side = nrm(np.cross(tdir, up + 1e-3 * rng.standard_normal(3)))
        pts = pts + side * (rng.choice([-1, 1], nl) * 0.012)[:, None]
        ld = nrm(-up[None] * 1.0 + tdir * 0.2 + rng.standard_normal((nl, 3)) * 0.28)
        hz = nrm(np.cross(ld, rng.standard_normal((nl, 3))))
        LB.append(pts); LD.append(ld); LS.append(hz); LL.append(rng.uniform(0.17, 0.30, nl))
    return twigs, np.concatenate(LB), np.concatenate(LD), np.concatenate(LS), np.concatenate(LL)

class Eucalyptus:
    def __init__(self, name, seed, height, nlimb=None, max_leaves=60000, max_tufts=950):
        self.name = name; self.seed = seed; self.H = height; self.max_leaves = max_leaves
        rng = np.random.default_rng(seed); self.rng = rng
        self.branches = []      # dict(P, R, level)
        self.clumps = []        # dict(anchor, dir, size)
        self.R0 = 0.42 if height < 25 else 0.5
        self.nlimb = nlimb
        self._grow_all(rng)
        if len(self.clumps) > max_tufts:
            keep = np.sort(rng.choice(len(self.clumps), max_tufts, replace=False))
            self.clumps = [self.clumps[i] for i in keep]
        # scale uniformly so the top of the foliage sits at the target height
        top = max(c['anchor'][2] for c in self.clumps) + 0.4
        k = height / top
        for b in self.branches:
            b['P'] = b['P'] * k; b['R'] = b['R'] * k ** 0.5
        for c in self.clumps:
            c['anchor'] = c['anchor'] * k
        A = np.array([c['anchor'] for c in self.clumps])
        log(name, 'branches', len(self.branches), 'tufts', len(self.clumps), 'scale', round(k, 3),
            'crown w/d %.1f x %.1f' % (A[:, 0].max() - A[:, 0].min(), A[:, 1].max() - A[:, 1].min()),
            'fork z %.1f' % (self.trunk_top[2] * k))

    def _grow(self, start, d, length, r0, r1, level, rng, step, photo, wander, grav, up_end=0.0):
        up = np.array([0, 0, 1.0])
        n = max(2, int(math.ceil(length / step)))
        ds = length / n
        P = [start.copy()]; p = start.copy(); d = nrm(d)
        for i in range(n):
            t = i / n
            r = lerp(r0, r1, t)
            d = nrm(d + rng.standard_normal(3) * wander * math.sqrt(ds) + up * (photo + up_end * t * t) * ds
                    - up * grav * ds * (0.03 / max(r, 0.01)) * (0.3 + t))
            p = p + d * ds; P.append(p.copy())
        P = np.array(P)
        tt = np.linspace(0, 1, n + 1)
        R = r0 + (r1 - r0) * tt ** 0.9
        self.branches.append(dict(P=P, R=R, level=level))
        return P, R

    def _tufts_along(self, P, rng, t0, every, size_rng):
        """tufts spaced along the part of a branch beyond t0 (outer third) plus one at the tip"""
        seg = np.linalg.norm(np.diff(P, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)])
        L = cum[-1]
        s_ = L * t0 + rng.uniform(0, every)
        while s_ < L - every * 0.5:
            i = int(np.searchsorted(cum, s_)) - 1; i = max(0, min(i, len(P) - 2))
            f = (s_ - cum[i]) / max(seg[i], 1e-6)
            self.clumps.append(dict(anchor=P[i] + (P[i + 1] - P[i]) * f, dir=nrm(P[i + 1] - P[i]),
                                    size=rng.uniform(*size_rng) * 0.9))
            s_ += every * rng.uniform(0.8, 1.25)
        self.clumps.append(dict(anchor=P[-1].copy(), dir=nrm(P[-1] - P[-2]), size=rng.uniform(*size_rng)))

    def _limb(self, start, d, length, r0, gen, rng):
        """major limb: curves upward, forks sympodially (gen 1..3), carries laterals"""
        r1 = r0 * (0.35 if gen < 3 else 0.25)
        P, R = self._grow(start, d, length, r0, r1, 1, rng, 0.45, photo=0.035, wander=0.045, grav=0.0, up_end=0.08)
        up = np.array([0, 0, 1.0])
        if gen < 3 and length > 4.0:
            tf = rng.uniform(0.38, 0.6); i = int(tf * (len(P) - 1))
            dd = nrm(P[i + 1] - P[i])
            out = nrm(np.array([P[i][0], P[i][1], 0.0]) + 1e-6)
            perp = nrm(np.cross(dd, rng.standard_normal(3)))
            nch = 2 if rng.uniform() < 0.35 else 1
            for c in range(nch):
                ang = math.radians(rng.uniform(22, 40))
                side = perp if c == 0 else -perp
                cd = nrm(dd * math.cos(ang) + (0.6 * side + 0.5 * out) * math.sin(ang))
                self._limb(P[i], cd, length * (1 - tf) * rng.uniform(0.8, 1.05), R[i] * rng.uniform(0.62, 0.78), gen + 1, rng)
        nlat = int(length / rng.uniform(1.0, 1.5))
        for j in range(nlat):
            t = rng.uniform(0.15, 0.97); i = int(t * (len(P) - 1))
            dd = nrm(P[min(i + 1, len(P) - 1)] - P[i])
            perp = nrm(np.cross(dd, rng.standard_normal(3)))
            ang = math.radians(rng.uniform(35, 65))
            cd = nrm(dd * math.cos(ang) + perp * math.sin(ang))
            ln = rng.uniform(1.8, 4.5) * (1.15 - 0.5 * t)
            self._branch(P[i], cd, ln, R[i] * rng.uniform(0.32, 0.5), 2, rng)
        self._tufts_along(P, rng, 0.75, 0.7, (0.9, 1.25))

    def _branch(self, start, d, length, r0, level, rng):
        if level == 2:
            r1 = max(r0 * 0.3, 0.012)
            P, R = self._grow(start, d, length, r0, r1, 2, rng, 0.35, photo=0.02, wander=0.1, grav=0.5)
            nlat = int(length / rng.uniform(0.5, 0.8))
            for j in range(nlat):
                t = rng.uniform(0.15, 0.95); i = int(t * (len(P) - 1))
                dd = nrm(P[min(i + 1, len(P) - 1)] - P[i])
                perp = nrm(np.cross(dd, rng.standard_normal(3)))
                ang = math.radians(rng.uniform(40, 70))
                cd = nrm(dd * math.cos(ang) + perp * math.sin(ang))
                ln = rng.uniform(0.7, 2.0) * (1.1 - 0.4 * t)
                self._branch(P[i], cd, ln, max(R[i] * 0.5, 0.008), 3, rng)
            self._tufts_along(P, rng, 0.6, 0.6, (0.8, 1.15))
        else:
            P, R = self._grow(start, d, length, r0, max(r0 * 0.4, 0.005), 3, rng, 0.25, photo=0.0, wander=0.15, grav=0.8)
            self._tufts_along(P, rng, 0.45, 0.55, (0.6, 0.95))

    def _grow_all(self, rng):
        H = self.H
        up = np.array([0, 0, 1.0])
        lean = math.radians(rng.uniform(2, 6)); az = rng.uniform(0, 2 * math.pi)
        d0 = np.array([math.sin(lean) * math.cos(az), math.sin(lean) * math.sin(az), math.cos(lean)])
        Hf = H * rng.uniform(0.22, 0.3)
        start = -d0 * SINK
        P, R = self._grow(start, d0, Hf + SINK, self.R0, self.R0 * 0.8, 0, rng, 0.3, photo=0.01, wander=0.025, grav=0.0)
        self.trunk_top = P[-1]
        n = self.nlimb or int(rng.choice([3, 4, 5], p=[0.35, 0.4, 0.25]))
        az0 = rng.uniform(0, 2 * math.pi)
        rf = R[-1]
        for i in range(n):
            a = az0 + i * 2 * math.pi / n + rng.normal(0, 0.3)
            tilt = math.radians(rng.uniform(18, 38))
            dd = nrm(d0 * math.cos(tilt) + np.array([math.cos(a), math.sin(a), 0]) * math.sin(tilt))
            rr = rf * math.sqrt(1.0 / n) * rng.uniform(0.95, 1.15)
            ln = (H - Hf) / math.cos(tilt) * rng.uniform(0.75, 0.92)
            self._limb(P[-1] - dd * rf * 0.4, dd, ln, rr, 1, rng)
        # a few lower side limbs below the main fork
        for j in range(int(rng.integers(1, 4))):
            t = rng.uniform(0.6, 0.95); i = int(t * (len(P) - 1))
            a = rng.uniform(0, 2 * math.pi)
            ang = math.radians(rng.uniform(45, 65))
            dd = nrm(d0 * math.cos(ang) + np.array([math.cos(a), math.sin(a), 0]) * math.sin(ang))
            self._branch(P[i], dd, rng.uniform(0.2, 0.32) * H, R[i] * rng.uniform(0.22, 0.32), 2, rng)
        # a couple of dead branch stubs on the trunk
        for j in range(int(rng.integers(1, 4))):
            t = rng.uniform(0.35, 0.9); i = int(t * (len(P) - 1))
            a = rng.uniform(0, 2 * math.pi)
            dd = nrm(np.array([math.cos(a), math.sin(a), rng.uniform(0.2, 0.8)]))
            self._grow(P[i], dd, rng.uniform(0.3, 0.9), R[i] * 0.18, R[i] * 0.1, 4, rng, 0.2, 0.0, 0.1, 0.0)

    # ------------------------------------------------------------------ geometry
    def _wood(self, mb, BARK, lod):
        for b in self.branches:
            P, R, lev = b['P'], b['R'], b['level']
            r0 = R[0]
            if lod == 'lod0':
                if lev >= 3 or r0 < 0.03:
                    continue
                k = 8 if lev == 0 else (6 if r0 > 0.1 else (5 if r0 > 0.05 else 4))
                stride = 3 if lev == 0 else (2 if lev == 1 else 3)
                idx = np.unique(np.concatenate([np.arange(0, len(P), stride), [len(P) - 1]]))
                P = P[idx]; R = R[idx]
            else:
                k = 32 if lev == 0 else int(np.clip(5 + r0 * 60, 5, 18))
                if lev >= 3:
                    k = 4
                    idx = np.unique(np.concatenate([np.arange(0, len(P), 2), [len(P) - 1]]))
                    P = P[idx]; R = R[idx]
            noise = None
            if lev == 0:
                # trunk flare + buttress lobes
                z = P[:, 2]
                fl = 1 + 0.35 * np.exp(-np.maximum(z, 0) / 0.6) + 0.1 * np.clip(-z / SINK, 0, 1)
                R = R * fl
                th = np.arange(k) / k * 2 * math.pi
                ph = self.rng.uniform(0, 6.3)
                noise = (0.13 * np.cos(4 * th[None] + ph) + 0.06 * np.cos(7 * th[None] + 2 * ph)) * np.exp(-np.maximum(z, 0) / 0.9)[:, None]
                if lod == 'hi':
                    noise = noise + 0.015 * fnoise(len(P), k, scale=4, seed=self.seed)
            circ = 2 * math.pi * float(np.mean(R))
            rep = max(1, int(round(circ / 1.3)))
            tile_v = max(circ / rep, min(1.3, 4 * circ))
            prof = circle_profile(R, k, noise=noise)
            sweep(mb, P, prof, BARK, region=(0, 1, 0, 1), tile_v=tile_v, rep_u=rep, tag=0, cap_end=(lev > 0))

    def build_hi(self, mats, falcs):
        rng = np.random.default_rng(self.seed + 1000)
        mb = MB(); BARK, LEAF = 0, 1
        self._wood(mb, BARK, 'hi')
        LB, LD, LS, LL = [], [], [], []
        for c in self.clumps:
            twigs, lb, ld, ls, ll = euc_clump(rng, c['anchor'], c['dir'], c['size'])
            for P, r in twigs[:2]:
                P2 = P[[0, 2, 3, 5]]
                sweep(mb, P2, circle_profile(np.linspace(r, r * 0.4, len(P2)), 3), BARK, region=(0, 1, 0, 1), tile_v=0.4, tag=0)
            LB.append(lb); LD.append(ld); LS.append(ls); LL.append(ll)
        LB = np.concatenate(LB); LD = np.concatenate(LD); LS = np.concatenate(LS); LL = np.concatenate(LL)
        if len(LB) > self.max_leaves:
            keep = rng.choice(len(LB), self.max_leaves, replace=False)
            LB, LD, LS, LL = LB[keep], LD[keep], LS[keep], LL[keep]
        N = len(LB)
        cells = rng.choice(16, N, p=np.array([1.0] * 12 + [0.35, 0.35, 0.5, 0.5]) / (12 + 1.7))
        euc_leaves_mesh(mb, LEAF, LB, LD, LS, LL, cells, falcs, rng.normal(0.0, 0.08, N))
        ob = mb.build(self.name + '_hi', mats)
        log(self.name, 'hi tris', mb.tris(), 'leaves', N)
        return [ob]

    def build_lod0(self, mats, lay):
        rng = np.random.default_rng(self.seed + 2000)
        mb = MB(); BARK, LEAF = 0, 1
        self._wood(mb, BARK, 'lod0')
        up = np.array([0, 0, 1.0])
        side_cells = [i for i, k in enumerate(lay['kind']) if k == 'side']
        top_cells = [i for i, k in enumerate(lay['kind']) if k == 'top']
        def hang_card(ctr_top, hz, sz, cell):
            (cu0, cu1), (cv0, cv1) = lay['cells'][cell]
            tilt = math.radians(rng.uniform(-20, 20))
            dn = nrm(-up * math.cos(tilt) + np.cross(up, hz) * math.sin(tilt))
            mid = ctr_top + dn * sz * 0.5
            bend = np.cross(hz, dn) * sz * rng.uniform(-0.12, 0.12)
            G = np.array([[ctr_top - hz * sz / 2, ctr_top + hz * sz / 2],
                          [mid - hz * sz / 2 + bend, mid + hz * sz / 2 + bend],
                          [ctr_top + dn * sz - hz * sz / 2, ctr_top + dn * sz + hz * sz / 2]])
            UV = np.array([[[cu0, cv1], [cu1, cv1]], [[cu0, (cv0 + cv1) / 2], [cu1, (cv0 + cv1) / 2]], [[cu0, cv0], [cu1, cv0]]])
            mb.grid(G, UV, LEAF, tag=1)
        for c in self.clumps:
            sz = lay['size'] * c['size'] * rng.uniform(0.9, 1.1)
            yaw = rng.uniform(0, 2 * math.pi)
            hz = np.array([math.cos(yaw), math.sin(yaw), 0.0])
            top = c['anchor'] + up * lay['top_off'] * sz + rng.normal(0, 0.08, 3)
            hang_card(top, hz, sz, int(rng.choice(side_cells)))
            if c['size'] > 0.85:
                hz2 = np.array([-hz[1], hz[0], 0.0])
                hang_card(top + rng.normal(0, 0.1, 3), hz2, sz * rng.uniform(0.85, 1.0), int(rng.choice(side_cells)))
            if rng.uniform() < 0.25:
                cell = int(rng.choice(top_cells)); (cu0, cu1), (cv0, cv1) = lay['cells'][cell]
                tilt = math.radians(rng.uniform(0, 25))
                ax1 = hz; ax2 = nrm(np.cross(up, hz) * math.cos(tilt) + up * math.sin(tilt))
                ctr = c['anchor'] + np.array([0, 0, -0.3 * sz]) + rng.normal(0, 0.12, 3)
                s2 = sz * 0.8
                quad = [ctr - ax1 * s2 / 2 - ax2 * s2 / 2, ctr + ax1 * s2 / 2 - ax2 * s2 / 2,
                        ctr + ax1 * s2 / 2 + ax2 * s2 / 2, ctr - ax1 * s2 / 2 + ax2 * s2 / 2]
                bi = mb.verts(np.array(quad), tag=1)
                mb.faces([[bi, bi + 1, bi + 2, bi + 3]], [[[cu0, cv0], [cu1, cv0], [cu1, cv1], [cu0, cv1]]], LEAF)
        return finish_lod0(mb, mats, self.name, centre_offset=(0, 0, -0.5))

EUC_CARD = dict(cells=[((0.0, 0.5), (0.0, 0.5)), ((0.5, 1.0), (0.0, 0.5)), ((0.0, 0.5), (0.5, 1.0)), ((0.5, 1.0), (0.5, 1.0))],
                kind=['side', 'side', 'side', 'top'], size=2.0, top_off=0.3)

def gen_eucalyptus_cards(tdir, out_png, samples):
    hi_leaf = os.path.join(tdir, 'eucalyptus_leaf_hi.png')
    bark = os.path.join(tdir, 'eucalyptus_bark.jpg')
    falcs = json.load(open(os.path.join(tdir, 'eucalyptus_leaf_falc.json')))
    atlas = np.zeros((1024, 1024, 4))
    tmp = os.path.join(tdir, '_card.png')
    S = EUC_CARD['size']
    for ci in range(4):
        def build(ci=ci):
            ml = make_material('cardleaf', hi_leaf, alpha=True)
            mbk = make_material('cardbark', bark)
            rng = np.random.default_rng(400 + ci)
            mb = MB()
            # a short branch end coming in from the back, a clump of hanging twigs
            anchor = np.array([0.0, 0.0, S * (0.5 - EUC_CARD['top_off'])]) if EUC_CARD['kind'][ci] == 'side' else np.array([0.0, 0.0, 0.0])
            bdir = nrm(np.array([rng.uniform(-0.3, 0.3), 1.0, 0.25]))
            Pb = np.array([anchor - bdir * 0.7, anchor])
            sweep(mb, Pb, circle_profile(np.array([0.014, 0.008]), 5), 0, tile_v=0.5)
            twigs, lb, ld, ls, ll = euc_clump(rng, anchor, bdir, 1.1, leaf_mul=1.3)
            t2, lb2, ld2, ls2, ll2 = euc_clump(rng, anchor + np.array([0.3, -0.15, 0.05]) * rng.choice([-1, 1]), nrm(np.array([1.0, -0.5, 0.2])), 0.9, leaf_mul=1.2)
            twigs += t2; lb = np.concatenate([lb, lb2]); ld = np.concatenate([ld, ld2]); ls = np.concatenate([ls, ls2]); ll = np.concatenate([ll, ll2])
            for P, r in twigs:
                sweep(mb, P, circle_profile(np.linspace(r, r * 0.4, len(P)), 4), 0, tile_v=0.4)
            N = len(lb)
            cells = rng.choice(16, N, p=np.array([1.0] * 12 + [0.35, 0.35, 0.5, 0.5]) / (12 + 1.7))
            euc_leaves_mesh(mb, 1, lb, ld, ls, ll, cells, falcs, rng.normal(0.0, 0.08, N))
            return [mb.build('card', [mbk, ml])]
        if EUC_CARD['kind'][ci] == 'top':
            img = card_render(build, (-S / 2, S / 2), (-S / 2, S / 2), 512, 512, tmp, samples=samples, view_dir='TOP')
        else:
            img = card_render(build, (-S / 2, S / 2), (-S / 2, S / 2), 512, 512, tmp, samples=samples, view_dir='FRONT')
        (cu0, cu1), (cv0, cv1) = EUC_CARD['cells'][ci]
        atlas[int(cv0 * 1024):int(cv0 * 1024) + 512, int(cu0 * 1024):int(cu0 * 1024) + 512] = img
    atlas = dilate_rgba(atlas)
    save_image(atlas, out_png)
    if os.path.exists(tmp):
        os.remove(tmp)

# ================================================================================================================
# shrubs / succulents: opuntia, yucca, agave
# ================================================================================================================
def draw_line(img, x0, y0, x1, y1, col, w=1.0, alpha=None):
    """paint an anti-aliased line into img (h,w,3[+1]) in place"""
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 2
    xs = np.linspace(x0, x1, n); ys = np.linspace(y0, y1, n)
    H, W = img.shape[:2]
    for x, y in zip(xs, ys):
        xi, yi = int(round(x)), int(round(y))
        if 0 <= xi < W and 0 <= yi < H:
            img[yi, xi, :3] = col
            if alpha is not None:
                alpha[yi, xi] = 1.0
            if w > 1.5:
                for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                    if 0 <= xi + dx < W and 0 <= yi + dy < H:
                        img[yi + dy, xi + dx, :3] = col * 0.9 + img[yi + dy, xi + dx, :3] * 0.1
                        if alpha is not None:
                            alpha[yi + dy, xi + dx] = 1.0

def areole_layout(rng, nx=7, ny=8):
    """areole positions in normalised pad coords (x in [-1,1] across, y in [0,1] base->apex); diamond lattice"""
    pts = []
    for j in range(ny):
        y = (j + 0.5) / ny
        for i in range(nx):
            x = (i + 0.5 + 0.5 * (j % 2)) / nx * 2 - 1
            x += rng.normal(0, 0.03); yy = y + rng.normal(0, 0.015)
            rr = math.sqrt(x * x + ((yy - 0.5) * 2) ** 2)
            if rr < 0.9:
                pts.append((x, yy))
    return np.array(pts)

def tex_opuntia_pad(sz, rng, base_hsv, stress, edge_col, areoles, corky=0.0):
    h = w = sz
    v = (np.arange(h)[:, None] + 0.5) / h + np.zeros((1, w))
    u = (np.arange(w)[None, :] + 0.5) / w + np.zeros((h, 1))
    x = u * 2 - 1; y = (v - 0.5) * 2
    r = np.sqrt(x * x + y * y)
    base = hsv2rgb(*base_hsv)
    col = np.ones((h, w, 3)) * base
    big = fnoise(h, w, scale=3, seed=int(rng.integers(1e9)))
    fine = fnoise(h, w, scale=40, seed=int(rng.integers(1e9)), ay=0.5)
    col *= (1 + 0.06 * big[..., None] + 0.04 * fine[..., None])
    # sun-stress yellow patches
    yel = np.clip(0.5 + 0.45 * fnoise(h, w, scale=2, seed=int(rng.integers(1e9))), 0, 1) * stress
    col = col * (1 - yel[..., None]) + hsv2rgb(62, 0.42, 0.66) * yel[..., None]
    # purple/red rim
    edge = smoothstep(0.62, 0.98, r) * np.clip(0.6 + 0.5 * fnoise(h, w, scale=4, seed=int(rng.integers(1e9))), 0, 1)
    col = col * (1 - 0.7 * edge[..., None]) + np.array(edge_col) * 0.7 * edge[..., None]
    # bloom (waxy lighter) in the middle
    col *= (1 + 0.05 * (1 - smoothstep(0.3, 0.9, r)))[..., None]
    if corky > 0:
        ck = np.clip((fnoise(h, w, scale=6, seed=int(rng.integers(1e9))) - 0.9) / 0.5, 0, 1) * corky
        col = col * (1 - ck[..., None]) + np.array([0.5, 0.42, 0.33]) * ck[..., None]
    alpha = np.ones((h, w))
    # areoles: brown pad with pale spines
    for (ax, ay) in areoles:
        cx = (ax + 1) / 2 * w; cy = (ay) * h
        d = np.sqrt((np.arange(w)[None, :] - cx) ** 2 + (np.arange(h)[:, None] - cy) ** 2)
        dot = np.clip(1 - (d - 3.5) / 2.5, 0, 1)
        col = col * (1 - dot[..., None]) + np.array([0.33, 0.27, 0.2]) * dot[..., None]
        halo = np.clip(1 - (d - 6) / 6, 0, 1) * 0.5
        col = col * (1 - halo[..., None] * 0.5) + np.array([0.6, 0.55, 0.32]) * halo[..., None] * 0.5
        nsp = int(rng.integers(2, 6))
        for k in range(nsp):
            ang = rng.uniform(0, 2 * math.pi); ln = rng.uniform(8, 22) * sz / 512
            draw_line(col, cx, cy, cx + math.cos(ang) * ln, cy + math.sin(ang) * ln, np.array([0.88, 0.85, 0.7]), w=1)
    return np.concatenate([np.clip(col, 0, 1), alpha[..., None]], -1)

def tex_spine_card(h, w, rng):
    img = np.zeros((h, w, 4)); alpha = np.zeros((h, w))
    for k in range(int(rng.integers(4, 7))):
        ang = math.radians(rng.uniform(-55, 55)); ln = rng.uniform(0.55, 0.95) * h
        x0 = w / 2 + rng.uniform(-3, 3); y0 = 2
        draw_line(img, x0, y0, x0 + math.sin(ang) * ln, y0 + math.cos(ang) * ln, np.array([0.9, 0.86, 0.72]), w=2, alpha=alpha)
    # glochid tuft at the base
    for k in range(14):
        ang = math.radians(rng.uniform(-80, 80)); ln = rng.uniform(0.08, 0.2) * h
        draw_line(img, w / 2, 1, w / 2 + math.sin(ang) * ln, 1 + math.cos(ang) * ln, np.array([0.55, 0.42, 0.22]), w=1, alpha=alpha)
    img[..., 3] = alpha
    return img

def tex_fruit(h, w, rng):
    v = (np.arange(h)[:, None] + 0.5) / h + np.zeros((1, w))
    col = np.ones((h, w, 3)) * np.array([0.55, 0.12, 0.3])
    n = fnoise(h, w, scale=6, seed=int(rng.integers(1e9)))
    col *= (1 + 0.1 * n[..., None])
    top = smoothstep(0.8, 0.97, v)[..., None]
    col = col * (1 - top) + np.array([0.6, 0.45, 0.35]) * top
    bot = (1 - smoothstep(0.0, 0.12, v))[..., None]
    col = col * (1 - 0.3 * bot) + np.array([0.45, 0.5, 0.25]) * 0.3 * bot
    rng2 = np.random.default_rng(int(rng.integers(1e9)))
    for k in range(18):
        cx = rng2.uniform(0, w); cy = rng2.uniform(0.1, 0.9) * h
        d = np.sqrt((np.arange(w)[None, :] - cx) ** 2 + (np.arange(h)[:, None] - cy) ** 2)
        dot = np.clip(1 - (d - 2) / 2, 0, 1)[..., None]
        col = col * (1 - dot) + np.array([0.75, 0.65, 0.4]) * dot
    return np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], -1)

def tex_grey_bark(src_dir, tdir, name, tint=(0.62, 0.58, 0.52), light=0.55):
    """greyed-down Poly Haven bark_brown_01 for old woody cactus/agave stems"""
    c = load_image(os.path.join(src_dir, 'bark_brown_01_diff_1k.jpg'))[..., :3].astype(float)
    g = c.mean(-1, keepdims=True)
    out = (light + (g - g.mean()) / (g.std() + 1e-9) * 0.1) * np.array(tint) + (c - g) * 0.35
    save_image(np.clip(out, 0, 1), os.path.join(tdir, name + '_bark.jpg'))
    n = load_image(os.path.join(src_dir, 'bark_brown_01_nor_gl_1k.jpg'))[..., :3]
    save_image(n, os.path.join(tdir, name + '_bark_n.jpg'))

def ensure_ph_bark(out, asset, keys=('diff', 'nor_gl')):
    src = os.path.join(out, 'tex', asset)
    os.makedirs(src, exist_ok=True)
    for k in keys:
        f = os.path.join(src, '%s_%s_1k.jpg' % (asset, k))
        if not os.path.exists(f):
            subprocess.run(['curl', '-sfL', 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/%s/%s_%s_1k.jpg' % (asset, asset, k), '-o', f], check=True)
    return src

OP_CELLS = [((0.0, 0.5), (0.5, 1.0)), ((0.5, 1.0), (0.5, 1.0)), ((0.0, 0.5), (0.0, 0.5))]   # pad cells
OP_SPINE = ((0.5, 0.625), (0.0, 0.125))
OP_FRUIT = ((0.625, 1.0), (0.0, 0.5))

def gen_opuntia_textures(tdir, out, seed=13):
    rng = np.random.default_rng(seed)
    tex_grey_bark(ensure_ph_bark(out, 'bark_brown_01'), tdir, 'opuntia')
    atlas = np.zeros((1024, 1024, 4))
    layouts = []
    specs = [((112, 0.3, 0.56), 0.15, (0.5, 0.22, 0.32), 0.0), ((95, 0.34, 0.6), 0.55, (0.55, 0.25, 0.25), 0.0),
             ((110, 0.22, 0.5), 0.2, (0.45, 0.25, 0.3), 0.45)]
    for ci, (hsv, stress, edge, corky) in enumerate(specs):
        ar = areole_layout(rng)
        layouts.append(ar.tolist())
        (cu0, cu1), (cv0, cv1) = OP_CELLS[ci]
        atlas[int(cv0 * 1024):int(cv1 * 1024), int(cu0 * 1024):int(cu1 * 1024)] = tex_opuntia_pad(512, rng, hsv, stress, edge, ar, corky)
    (cu0, cu1), (cv0, cv1) = OP_SPINE
    atlas[int(cv0 * 1024):int(cv1 * 1024), int(cu0 * 1024):int(cu1 * 1024)] = tex_spine_card(128, 128, rng)
    (cu0, cu1), (cv0, cv1) = OP_FRUIT
    atlas[int(cv0 * 1024):int(cv1 * 1024), int(cu0 * 1024):int(cu1 * 1024)] = tex_fruit(512, 384, rng)
    atlas = dilate_rgba(atlas)
    save_image(atlas, os.path.join(tdir, 'opuntia_leaf_hi.png'))
    json.dump(layouts, open(os.path.join(tdir, 'opuntia_areoles.json'), 'w'))

def pad_mesh(mb, base, axis, normal, L, W, T, cell, mat, rings, around, tag=1):
    """flat oval cactus pad: stacked scaled outlines along the normal, planar UVs into cell.  returns centre pt."""
    X = nrm(np.cross(normal, axis)); Y = nrm(axis); Z = nrm(normal)
    th = np.arange(around) / around * 2 * math.pi
    k = 0.85 + 0.15 * (np.sin(th) + 1) / 2
    ox = np.cos(th) * k * W / 2; oy = np.sin(th) * L / 2
    ws = np.linspace(-0.97, 0.97, rings) if rings > 3 else np.array([-0.9, 0.0, 0.9])
    sc = (1 - np.abs(ws) ** 6) ** (1 / 6)
    ctr = base + Y * (L / 2)
    (cu0, cu1), (cv0, cv1) = cell
    pts = []; uvs = []
    for wv, s_ in zip(ws, sc):
        P = ctr[None] + X[None] * (ox * s_)[:, None] + Y[None] * (oy * s_)[:, None] + Z[None] * (T / 2 * wv)
        pts.append(P)
        uvs.append(np.stack([cu0 + (0.5 + 0.47 * np.cos(th) * k * s_) * (cu1 - cu0), cv0 + (0.5 + 0.47 * np.sin(th) * s_) * (cv1 - cv0)], -1))
    pts = np.stack(pts); uvs = np.stack(uvs)          # (rings, around, 3/2)
    b = mb.verts(pts.reshape(-1, 3), tag)
    idx = b + np.arange(rings * around).reshape(rings, around)
    i = np.arange(rings - 1)[:, None]; j = np.arange(around)[None, :]
    jn = (j + 1) % around
    q = np.stack([idx[i, j], idx[i, jn], idx[i + 1, jn], idx[i + 1, j]], -1).reshape(-1, 4)
    uq = np.stack([uvs[i, j], uvs[i, jn], uvs[i + 1, jn], uvs[i + 1, j]], -2).reshape(-1, 4, 2)
    mb.faces(q, uq, mat)
    for face, sign in ((rings - 1, 1), (0, -1)):
        c = mb.verts((ctr + Z * (T / 2 * ws[face]))[None], tag)
        jj = np.arange(around)
        tri = np.stack([np.full(around, c), idx[face, jj], idx[face, (jj + 1) % around]], -1)
        ut = np.stack([np.repeat(np.array([[cu0 + 0.5 * (cu1 - cu0), cv0 + 0.5 * (cv1 - cv0)]]), around, 0), uvs[face, jj], uvs[face, (jj + 1) % around]], 1)
        if sign < 0:
            tri = tri[:, ::-1]; ut = ut[:, ::-1]
        mb.faces(tri, ut, mat)
    return ctr, X, Y, Z

class Opuntia:
    def __init__(self, name, seed, width, height):
        self.name = name; self.seed = seed; self.W = width; self.Hmax = height
        rng = np.random.default_rng(seed); self.rng = rng
        self.pads = []; self.trunks = []; self.fruits = []
        up = np.array([0, 0, 1.0])
        nb = int(rng.integers(3, 6))
        for i in range(nb):
            az = i * 2 * math.pi / nb + rng.normal(0, 0.4)
            tilt = math.radians(rng.uniform(20, 55))
            d = np.array([math.sin(tilt) * math.cos(az), math.sin(tilt) * math.sin(az), math.cos(tilt)])
            start = np.array([math.cos(az), math.sin(az), 0]) * rng.uniform(0, 0.12) + np.array([0, 0, -0.06])
            Lt = rng.uniform(0.18, 0.4); rt = rng.uniform(0.045, 0.07)
            P = np.array([start, start + d * Lt * 0.5 + rng.normal(0, 0.02, 3), start + d * Lt])
            self.trunks.append((P, rt))
            n = nrm(np.cross(d, up)); n = nrm(rodrigues(n, d, rng.uniform(-0.7, 0.7)))
            self._chain(P[-1] - d * 0.03, d, n, 0, int(rng.integers(4, 7)), rng)
        pz = np.array([p['base'][2] + p['L'] for p in self.pads])
        log(name, 'pads', len(self.pads), 'fruits', len(self.fruits), 'height %.2f' % pz.max())

    def _chain(self, base, axis, normal, depth, maxd, rng):
        up = np.array([0, 0, 1.0])
        L = rng.uniform(0.2, 0.3) * (1 - 0.05 * depth); W = L * rng.uniform(0.6, 0.78); T = rng.uniform(0.022, 0.03)
        cell = 2 if depth == 0 and rng.uniform() < 0.7 else (1 if rng.uniform() < 0.35 else 0)
        pad = dict(base=base.copy(), axis=nrm(axis), normal=nrm(normal), L=L, W=W, T=T, cell=cell, depth=depth)
        self.pads.append(pad)
        apex = base + axis * L
        horiz = math.hypot(apex[0], apex[1])
        if depth >= maxd or horiz > self.W / 2:
            self._fruit_on(pad, rng, 0.7)
            return
        nchild = int(rng.choice([0, 1, 2, 3], p=[0.08, 0.42, 0.38, 0.12] if depth < 3 else [0.25, 0.5, 0.2, 0.05]))
        if nchild == 0:
            self._fruit_on(pad, rng, 0.6)
        X = nrm(np.cross(normal, axis))
        for c in range(nchild):
            phi = math.radians(rng.uniform(-55, 55))
            att = base + axis * (L / 2) + (X * math.cos(phi + math.pi / 2) * W / 2 * 0.95 + axis * math.sin(phi + math.pi / 2) * L / 2 * 0.95)
            d = nrm(rodrigues(axis, normal, phi))
            out = nrm(np.array([att[0], att[1], 0]) + 1e-6)
            d = nrm(d + out * 0.25 * depth / maxd - up * 0.12 * depth / maxd + rng.normal(0, 0.1, 3))
            if att[2] + d[2] * L < 0.04:
                d = nrm(d + up * 0.6)
            if att[2] > self.Hmax - 0.3:
                d = nrm(d + out * 0.8 - up * 0.3)
            n2 = nrm(rodrigues(normal, d, rng.uniform(-0.6, 0.6)))
            if rng.uniform() < 0.2:
                n2 = nrm(np.cross(n2, d))
            self._chain(att - d * 0.02, d, n2, depth + 1, maxd, rng)
        if nchild < 3 and depth >= 2:
            self._fruit_on(pad, rng, 0.35)

    def _fruit_on(self, pad, rng, p):
        if rng.uniform() > p:
            return
        for k in range(int(rng.integers(1, 4))):
            phi = math.radians(rng.uniform(25, 155))
            X = nrm(np.cross(pad['normal'], pad['axis']))
            rim = pad['base'] + pad['axis'] * (pad['L'] / 2) + X * math.cos(phi) * pad['W'] / 2 * 0.95 + pad['axis'] * math.sin(phi) * pad['L'] / 2 * 0.95
            d = nrm(X * math.cos(phi) + pad['axis'] * math.sin(phi) + rng.normal(0, 0.15, 3))
            self.fruits.append(dict(base=rim - d * 0.01, dir=d, L=rng.uniform(0.05, 0.07), R=rng.uniform(0.016, 0.022)))

    def build(self, mats, lod, areoles):
        rng = np.random.default_rng(self.seed + (1000 if lod == 'hi' else 2000))
        mb = MB(); BARK, LEAF = 0, 1
        for P, r in self.trunks:
            k = 12 if lod == 'hi' else 6
            sweep(mb, P, circle_profile(np.array([r * 1.15, r, r * 0.85]), k), BARK, tile_v=0.5, rep_u=1, cap_end=False)
        rings, around = (7, 32) if lod == 'hi' else (3, 12)
        for pad in self.pads:
            ctr, X, Y, Z = pad_mesh(mb, pad['base'], pad['axis'], pad['normal'], pad['L'], pad['W'], pad['T'], OP_CELLS[pad['cell']], LEAF, rings, around)
            if lod == 'hi':
                (su0, su1), (sv0, sv1) = OP_SPINE
                for (ax, ay) in areoles[pad['cell']]:
                    for sign in (1, -1):
                        k = 0.85 + 0.15 * (ay * 2 - 1 + 1) / 2
                        pos = pad['base'] + X * (ax * pad['W'] / 2 * k) + Y * (ay * pad['L']) + Z * (pad['T'] / 2 * 0.97 * sign)
                        h = 0.03; w = 0.03
                        for ang in (rng.uniform(0, math.pi), None):
                            a = ang if ang is not None else ang_prev + math.pi / 2
                            ang_prev = a
                            sd = X * math.cos(a) + Y * math.sin(a)
                            q = np.array([pos - sd * w / 2, pos + sd * w / 2, pos + sd * w / 2 + Z * sign * h, pos - sd * w / 2 + Z * sign * h])
                            bi = mb.verts(q, tag=1)
                            mb.faces([[bi, bi + 1, bi + 2, bi + 3]], [[[su0, sv0], [su1, sv0], [su1, sv1], [su0, sv1]]], LEAF)
        (fu0, fu1), (fv0, fv1) = OP_FRUIT
        for f in self.fruits:
            n = 7 if lod == 'hi' else 4; k = 9 if lod == 'hi' else 5
            t = np.linspace(0, 1, n)
            P = f['base'][None] + f['dir'][None] * (t * f['L'])[:, None]
            r = f['R'] * (np.sin(math.pi * np.clip(t, 0.03, 0.97)) ** 0.55) * (1 - 0.25 * t) + 0.002
            sweep(mb, P, circle_profile(r, k), LEAF, region=(fu0, fu1, fv0, fv1), tile_v=None, tag=1, cap_end=True)
        if lod == 'hi':
            ob = mb.build(self.name + '_hi', mats)
            log(self.name, 'hi tris', mb.tris())
            return [ob]
        return finish_lod0(mb, mats, self.name, orient=False)

# ---- yucca -----------------------------------------------------------------------------------------------------
YU_LIVE = list(range(0, 6)); YU_DEAD = [6, 7]; YU_STALK = 8; YU_CAPS = 9
YU_CARD = dict(cells=[((0.0, 170 / 1024), (0, 1)), ((170 / 1024, 340 / 1024), (0, 1)), ((340 / 1024, 510 / 1024), (0, 1))],
               panicle=((0.5, 1.0), (0.0, 1.0)), card_w=0.14, card_l=0.84, pan_w=0.8, pan_h=1.6)

def yucca_leaf_strip(h, w, rng, base, dead=False):
    v = (np.arange(h)[:, None] + 0.5) / h + np.zeros((1, w))
    u = (np.arange(w)[None, :] + 0.5) / w + np.zeros((h, 1))
    col = np.ones((h, w, 3)) * np.array(base)
    st = fnoise(h, w, scale=30, seed=int(rng.integers(1e9)), ax=0.4, ay=12)
    col *= (1 + 0.05 * st[..., None])
    e = np.minimum(u, 1 - u)
    marg = np.exp(-(e / 0.05) ** 2)[..., None]
    col = col * (1 - 0.6 * marg) + np.array([0.78, 0.72, 0.45] if not dead else [0.6, 0.5, 0.35]) * 0.6 * marg
    fold = np.exp(-((u - 0.5) / 0.03) ** 2)[..., None]
    col = col * (1 - 0.15 * fold)
    tip = smoothstep(0.93, 0.985, v)[..., None]
    col = col * (1 - tip) + np.array([0.22, 0.14, 0.08]) * tip
    basef = (1 - smoothstep(0.0, 0.12, v))[..., None]
    col = col * (1 - 0.4 * basef) + np.array([0.75, 0.72, 0.5]) * 0.4 * basef
    if dead:
        streak = fnoise(h, w, scale=20, seed=int(rng.integers(1e9)), ax=0.4, ay=10)
        col *= (1 + 0.12 * streak[..., None])
    return np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], -1)

def gen_yucca_textures(tdir, seed=17):
    rng = np.random.default_rng(seed)
    atlas = np.zeros((1024, 1024, 4))
    for i in YU_LIVE:
        base = hsv2rgb(rng.uniform(120, 150), rng.uniform(0.12, 0.2), rng.uniform(0.5, 0.6))
        atlas[:, i * 64:(i + 1) * 64] = yucca_leaf_strip(1024, 64, rng, base)
    for i in YU_DEAD:
        atlas[:, i * 64:(i + 1) * 64] = yucca_leaf_strip(1024, 64, rng, (0.62, 0.55, 0.42), dead=True)
    c, _ = tex_fibrous(64, 1024, rng, [(0.66, 0.56, 0.4), (0.72, 0.64, 0.48), (0.66, 0.56, 0.4)], cut_band=0.0)
    atlas[:, YU_STALK * 64:(YU_STALK + 1) * 64, :3] = c; atlas[:, YU_STALK * 64:(YU_STALK + 1) * 64, 3] = 1
    v = (np.arange(1024)[:, None] + 0.5) / 1024 + np.zeros((1, 64))
    cap = np.ones((1024, 64, 3)) * np.array([0.32, 0.22, 0.13])
    cap *= (1 + 0.1 * fnoise(1024, 64, scale=8, seed=int(rng.integers(1e9)))[..., None])
    cap = cap * (1 - 0.5 * smoothstep(0.75, 0.95, v))[..., None] + np.array([0.6, 0.5, 0.35]) * 0.5 * smoothstep(0.75, 0.95, v)[..., None]
    atlas[:, YU_CAPS * 64:(YU_CAPS + 1) * 64, :3] = cap; atlas[:, YU_CAPS * 64:(YU_CAPS + 1) * 64, 3] = 1
    # bark material: fibrous base (dead leaf bases)
    c, hh = tex_fibrous(1024, 1024, rng, [(0.45, 0.38, 0.28), (0.55, 0.48, 0.36), (0.45, 0.38, 0.28)], cut_band=0.0)
    save_image(c, os.path.join(tdir, 'yucca_bark.jpg'))
    save_image(height_to_normal(hh, 1.5), os.path.join(tdir, 'yucca_bark_n.jpg'))
    atlas = dilate_rgba(atlas)
    save_image(atlas, os.path.join(tdir, 'yucca_leaf_hi.png'))

def fib_dirs(n, rng, zmin=-0.55):
    i = np.arange(n) + 0.5
    z = 1 - 2 * i / n; r = np.sqrt(1 - z * z); th = i * math.pi * (3 - math.sqrt(5)) + rng.uniform(0, 6.3)
    d = np.stack([r * np.cos(th), r * np.sin(th), z], -1)
    d = d[d[:, 2] > zmin]
    return nrm(d + rng.normal(0, 0.05, d.shape))

def yucca_leaf_geo(mb, LEAF, base, d, L, w0, col, rng, nseg=6, fold=0.3, dead=False, droop=0.0):
    up = np.array([0, 0, 1.0])
    side = nrm(np.cross(d, up + rng.normal(0, 0.3, 3)))
    n = nrm(np.cross(side, d))
    if n[2] < 0:
        n = -n; side = -side
    t = np.linspace(0, 1, nseg + 1)
    P = base[None] + d[None] * (t * L)[:, None]
    if droop:
        P = P - up[None] * (droop * (t * L) ** 2)[:, None]
    w = w0 * (0.6 + 0.4 * np.sin(math.pi * np.clip(t, 0, 0.5) * 2 * 0.5 + 0.1)) * (1 - t ** 3) ** 0.7
    w[-1] = 0.001
    G = np.stack([P - side[None] * (w / 2)[:, None], P - n[None] * (fold * w)[:, None], P + side[None] * (w / 2)[:, None]], 1)
    u0 = col / 16 + 0.004; u1 = (col + 1) / 16 - 0.004; um = (u0 + u1) / 2
    UV = np.stack([np.stack([np.full_like(t, u0), t], -1), np.stack([np.full_like(t, um), t], -1), np.stack([np.full_like(t, u1), t], -1)], 1)
    mb.grid(G, UV, LEAF, tag=1)

class Yucca:
    def __init__(self, name, seed, diam, stalk):
        self.name = name; self.seed = seed; self.D = diam; self.stalk = stalk
        rng = np.random.default_rng(seed); self.rng = rng
        self.centre = np.array([0, 0, 0.3 * diam])
        n = int(rng.integers(420, 520))
        self.dirs = fib_dirs(n, rng, zmin=-0.5)
        self.L = (0.42 + 0.12 * rng.uniform(size=len(self.dirs))) * diam / 1.05
        self.Lstalk = rng.uniform(2.6, 3.4) if stalk else 0
        log(name, 'leaves', len(self.dirs), 'stalk %.1f' % self.Lstalk)

    def _core(self, mb, BARK, lod):
        k = 16 if lod == 'hi' else 8
        zs = np.array([-0.05, 0.05, 0.15, 0.25, 0.32])
        P = np.stack([0 * zs, 0 * zs, zs], -1)
        r = np.array([0.22, 0.2, 0.16, 0.1, 0.03]) * self.D
        sweep(mb, P, circle_profile(r, k), BARK, tile_v=0.4, cap_end=True)

    def _stalk(self, mb, BARK, LEAF, lod):
        if not self.stalk:
            return
        rng = np.random.default_rng(self.seed + 7)
        up = np.array([0, 0, 1.0])
        lean = rng.normal(0, 0.02, 3); lean[2] = 0
        n = 10
        t = np.linspace(0, 1, n + 1)
        P = self.centre[None] + (up[None] + lean[None] * t[:, None] * 2) * (t * self.Lstalk)[:, None]
        r = 0.028 * (1 - 0.55 * t) + 0.004
        k = 10 if lod == 'hi' else 4
        sweep(mb, P, circle_profile(r, k), BARK, region=(YU_STALK / 16, (YU_STALK + 1) / 16, 0, 1), tile_v=0.6, cap_end=True)
        return P

    def _panicle(self, mb, LEAF, P, rng, lod='hi'):
        """dead seed-capsule panicle on the upper 45% of the stalk"""
        up = np.array([0, 0, 1.0])
        L = self.Lstalk
        s_ = 0.55 * L
        i = 0
        while s_ < L - 0.05:
            t = s_ / L
            pos = self.centre + up * s_
            a = i * math.radians(137.5)
            rad = np.array([math.cos(a), math.sin(a), 0])
            fr = (t - 0.55) / 0.45
            ln = (0.1 + 0.2 * math.sin(math.pi * min(fr * 1.3, 1)) ** 0.8) * rng.uniform(0.8, 1.15)
            d = nrm(rad * 0.75 + up * rng.uniform(0.35, 0.7))
            Pb = np.array([pos, pos + d * ln * 0.5, pos + d * ln])
            sweep(mb, Pb, circle_profile(np.array([0.006, 0.004, 0.003]), 3), LEAF, region=(YU_STALK / 16, (YU_STALK + 1) / 16, 0, 1), tile_v=0.3, tag=1)
            ncap = int(rng.integers(2, 6))
            for c in range(ncap):
                tc = rng.uniform(0.3, 1.0)
                cb = pos + d * ln * tc + rng.normal(0, 0.012, 3)
                cd = nrm(d + rng.normal(0, 0.4, 3))
                tt = np.linspace(0, 1, 5)
                Pc = cb[None] + cd[None] * (tt * 0.035)[:, None]
                rc = 0.011 * np.sin(math.pi * np.clip(tt, 0.05, 0.95)) ** 0.5 + 0.001
                sweep(mb, Pc, circle_profile(rc, 6), LEAF, region=(YU_CAPS / 16, (YU_CAPS + 1) / 16, 0, 1), tile_v=None, tag=1, cap_end=True)
            s_ += rng.uniform(0.04, 0.07); i += 1

    def build_hi(self, mats):
        rng = np.random.default_rng(self.seed + 1000)
        mb = MB(); BARK, LEAF = 0, 1
        self._core(mb, BARK, 'hi')
        for d, L in zip(self.dirs, self.L):
            col = int(rng.choice(YU_LIVE))
            dead = d[2] < -0.3 and rng.uniform() < 0.5
            if dead:
                col = int(rng.choice(YU_DEAD))
            base = self.centre + d * 0.04
            yucca_leaf_geo(mb, LEAF, base, d, L * (0.85 if d[2] < -0.2 else 1.0), rng.uniform(0.015, 0.022), col, rng, nseg=6, droop=0.15 if dead else 0.0)
        # dead skirt on the ground
        for i in range(int(rng.integers(50, 90))):
            a = rng.uniform(0, 2 * math.pi); rad = np.array([math.cos(a), math.sin(a), 0])
            d = nrm(rad * 1.0 - np.array([0, 0, rng.uniform(0.5, 1.2)]))
            base = self.centre + d * 0.05 + np.array([0, 0, -0.1])
            yucca_leaf_geo(mb, LEAF, base, d, rng.uniform(0.3, 0.5), 0.018, int(rng.choice(YU_DEAD)), rng, nseg=4, droop=0.6)
        P = self._stalk(mb, BARK, LEAF, 'hi')
        if P is not None:
            self._panicle(mb, LEAF, P, rng)
        ob = mb.build(self.name + '_hi', mats)
        log(self.name, 'hi tris', mb.tris())
        return [ob]

    def build_lod0(self, mats, lay):
        rng = np.random.default_rng(self.seed + 2000)
        mb = MB(); BARK, LEAF = 0, 1
        self._core(mb, BARK, 'lod0')
        up = np.array([0, 0, 1.0])
        sel = self.dirs[::2]; Ls = self.L[::2]
        for d, L in zip(sel, Ls):
            cell = lay['cells'][int(rng.integers(0, 3))]
            (cu0, cu1), (cv0, cv1) = cell
            w = lay['card_w'] * L / lay['card_l'] * 1.3
            side = nrm(np.cross(d, rng.normal(0, 1, 3)))
            t = np.array([0, 0.5, 1.0])
            P = self.centre[None] + d[None] * 0.03 + d[None] * (t * L)[:, None]
            G = np.stack([P - side[None] * w / 2, P + side[None] * w / 2], 1)
            UV = np.stack([np.stack([np.full(3, cu0), cv0 + t * (cv1 - cv0)], -1), np.stack([np.full(3, cu1), cv0 + t * (cv1 - cv0)], -1)], 1)
            mb.grid(G, UV, LEAF, tag=1)
        # dead skirt cards
        for i in range(10):
            a = i / 10 * 2 * math.pi + rng.uniform(0, 0.4); rad = np.array([math.cos(a), math.sin(a), 0])
            d = nrm(rad - up * 0.9)
            side = nrm(np.cross(d, up)); L = 0.4
            P = self.centre[None] + d[None] * (np.array([0.05, 0.25, 0.45]))[:, None] + np.array([0, 0, -0.08])
            P[-1][2] = max(P[-1][2], 0.01)
            (cu0, cu1), (cv0, cv1) = lay['cells'][int(rng.integers(0, 3))]
            G = np.stack([P - side[None] * 0.1, P + side[None] * 0.1], 1)
            t = np.array([0, 0.5, 1.0])
            UV = np.stack([np.stack([np.full(3, cu0), cv0 + t * (cv1 - cv0)], -1), np.stack([np.full(3, cu1), cv0 + t * (cv1 - cv0)], -1)], 1)
            mb.grid(G, UV, LEAF, tag=1)
        P = self._stalk(mb, BARK, LEAF, 'lod0')
        if P is not None:
            (pu0, pu1), (pv0, pv1) = lay['panicle']
            zc = self.centre[2] + self.Lstalk * 0.775
            for k in range(3):
                a = k * math.pi / 3
                hz = np.array([math.cos(a), math.sin(a), 0]) * lay['pan_w'] / 2
                c0 = np.array([0, 0, zc - lay['pan_h'] / 2]); c1 = np.array([0, 0, zc + lay['pan_h'] / 2])
                q = np.array([c0 - hz, c0 + hz, c1 + hz, c1 - hz])
                bi = mb.verts(q, tag=1)
                mb.faces([[bi, bi + 1, bi + 2, bi + 3]], [[[pu0, pv0], [pu1, pv0], [pu1, pv1], [pu0, pv1]]], LEAF)
        return finish_lod0(mb, mats, self.name, centre=self.centre + np.array([0, 0, 0.05]), radii=np.array([self.D / 2, self.D / 2, self.D / 2]))

def gen_yucca_cards(tdir, out_png, samples):
    hi_leaf = os.path.join(tdir, 'yucca_leaf_hi.png')
    atlas = np.zeros((512, 512, 4))
    tmp = os.path.join(tdir, '_card.png')
    for ci in range(3):
        def build(ci=ci):
            m = make_material('cardleaf', hi_leaf, alpha=True)
            rng = np.random.default_rng(500 + ci)
            mb = MB()
            for k in range(3):
                ang = math.radians(rng.uniform(-5, 5)); d = np.array([math.sin(ang), math.cos(ang), 0.0])
                base = np.array([rng.uniform(-0.03, 0.03), rng.uniform(-0.02, 0.0), 0.02 * k])
                yucca_leaf_geo(mb, 0, base, d, rng.uniform(0.7, 0.82), rng.uniform(0.016, 0.022), int(rng.choice(YU_LIVE)), rng, nseg=6)
            return [mb.build('card', [m])]
        img = card_render(build, (-YU_CARD['card_w'] / 2, YU_CARD['card_w'] / 2), (0, YU_CARD['card_l']), 85, 512, tmp, samples=samples, view_dir='TOP')
        (cu0, cu1), _ = YU_CARD['cells'][ci]
        atlas[:, int(round(cu0 * 512)):int(round(cu0 * 512)) + 85] = img
    def build_pan():
        mbk = make_material('cardbark', os.path.join(tdir, 'yucca_bark.jpg'))
        ml = make_material('cardleaf', hi_leaf, alpha=True)
        y = Yucca('card', 900, 1.0, True); y.Lstalk = 3.2; y.centre = np.array([0, 0, 0.0])
        mb = MB()
        P = y._stalk(mb, 0, 1, 'hi')
        y._panicle(mb, 1, P, np.random.default_rng(901))
        return [mb.build('card', [mbk, ml])]
    zc = 3.2 * 0.775
    img = card_render(build_pan, (-YU_CARD['pan_w'] / 2, YU_CARD['pan_w'] / 2), (zc - YU_CARD['pan_h'] / 2, zc + YU_CARD['pan_h'] / 2), 256, 512, tmp, samples=samples, view_dir='FRONT')
    atlas[:, 256:] = img
    atlas = dilate_rgba(atlas)
    save_image(atlas, out_png)
    if os.path.exists(tmp):
        os.remove(tmp)

# ---- agave -----------------------------------------------------------------------------------------------------
def tex_agave_leaf(h, w, rng, base, dead=False):
    v = (np.arange(h)[:, None] + 0.5) / h + np.zeros((1, w))
    u = (np.arange(w)[None, :] + 0.5) / w + np.zeros((h, 1))
    col = np.ones((h, w, 3)) * np.array(base)
    col *= (1 + 0.05 * fnoise(h, w, scale=6, seed=int(rng.integers(1e9)))[..., None])
    col *= (1 + 0.03 * fnoise(h, w, scale=60, seed=int(rng.integers(1e9)), ax=0.3, ay=6)[..., None])
    # bud imprints: pale curved transverse bands on the upper face (u in 0..0.5)
    top = (u < 0.5)
    uu = np.where(top, u * 2, (u - 0.5) * 2)       # 0..1 across each face
    for k in range(int(rng.integers(5, 9))):
        vc = rng.uniform(0.1, 0.85); amp = rng.uniform(0.02, 0.05); wd = rng.uniform(0.006, 0.012)
        band = np.exp(-((v - (vc + amp * (uu - 0.5) ** 2 * 4)) / wd) ** 2) * (0.45 + 0.55 * top)
        col = col * (1 - 0.18 * band[..., None]) + np.array([0.8, 0.82, 0.74]) * 0.18 * band[..., None]
    # margins at u=0/1 and u=0.5: reddish-brown band with dark teeth
    for mu in (0.0, 0.5, 1.0):
        d = np.abs(u - mu)
        band = np.exp(-(d / 0.018) ** 2)
        col = col * (1 - 0.55 * band[..., None]) + np.array([0.5, 0.33, 0.2]) * 0.55 * band[..., None]
    teeth = np.zeros((h, w))
    nteeth = 26
    for k in range(nteeth):
        vt = 0.06 + (k + rng.uniform(0.2, 0.8)) / nteeth * 0.9
        sz = 0.012 * (0.6 + 0.6 * math.sin(math.pi * vt))
        for mu in (0.0, 0.5, 1.0):
            d = np.abs(u - mu)
            tri = (v > vt - sz * 1.4) & (v < vt + sz * 0.4) & (d < sz * 0.6 * np.clip((v - (vt - sz * 1.4)) / (sz * 1.8), 0, 1) * 2 + 0.004)
            teeth = np.maximum(teeth, tri)
    col = col * (1 - teeth[..., None]) + np.array([0.2, 0.12, 0.06]) * teeth[..., None]
    tip = smoothstep(0.95, 0.99, v)[..., None]
    col = col * (1 - tip) + np.array([0.2, 0.12, 0.07]) * tip
    basef = (1 - smoothstep(0.0, 0.15, v))[..., None]
    col = col * (1 - 0.3 * basef) + np.array([0.78, 0.78, 0.6]) * 0.3 * basef
    if dead:
        col = col * 0.25 + np.array([0.5, 0.42, 0.3]) * 0.75
        col *= (1 + 0.15 * fnoise(h, w, scale=20, seed=int(rng.integers(1e9)), ax=0.3, ay=8)[..., None])
    return np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], -1)

AG_CELLS = [((0.0, 0.25), (0, 1)), ((0.25, 0.5), (0, 1)), ((0.5, 0.75), (0, 1)), ((0.75, 1.0), (0, 1))]   # 3 live + 1 dead

def gen_agave_textures(tdir, out, seed=19):
    rng = np.random.default_rng(seed)
    atlas = np.zeros((1024, 1024, 4))
    for ci in range(4):
        base = hsv2rgb(rng.uniform(125, 150), rng.uniform(0.14, 0.2), rng.uniform(0.56, 0.64))
        (cu0, cu1), _ = AG_CELLS[ci]
        atlas[:, int(cu0 * 1024):int(cu1 * 1024)] = tex_agave_leaf(1024, 256, rng, base, dead=(ci == 3))
    save_image(atlas, os.path.join(tdir, 'agave_leaf_hi.png'))
    tex_grey_bark(ensure_ph_bark(out, 'bark_brown_01'), tdir, 'agave', tint=(0.55, 0.5, 0.42), light=0.5)

def agave_profile(n, wv, th):
    """closed lens profile: left margin (u=0) -> concave top -> right margin (u=0.5) -> convex bottom -> back.
    returns (n,k,2) in (side, up) coords."""
    k = 10
    a = np.linspace(0, 1, 6)                  # top: 6 verts from left to right (incl margins)
    xs_top = (a - 0.5) * wv[:, None]
    z_top = th[:, None] * (0.25 - 0.55 * np.sin(math.pi * a)[None, :])    # concave channel
    b = np.linspace(1, 0, 6)[1:-1]            # bottom: 4 interior verts right to left
    xs_bot = (b - 0.5) * wv[:, None]
    z_bot = -th[:, None] * (0.25 + 0.75 * np.sin(math.pi * b)[None, :])
    xs = np.concatenate([xs_top, xs_bot], 1); zs = np.concatenate([z_top, z_bot], 1)
    return np.stack([xs, zs], -1)

class Agave:
    def __init__(self, name, seed, diam):
        self.name = name; self.seed = seed; self.D = diam
        rng = np.random.default_rng(seed); self.rng = rng
        n = int(rng.integers(40, 50))
        self.leaves = []
        for i in range(n):
            age = i / (n - 1)
            phi = i * math.radians(137.508) + rng.normal(0, 0.1)
            elev = math.radians(lerp(78, 22, age ** 0.8) + rng.normal(0, 5))
            L = lerp(0.5, 1.0, age ** 0.7) * diam / 1.8 * rng.uniform(0.92, 1.08)
            self.leaves.append(dict(phi=phi, elev=elev, L=L, age=age, arch=lerp(0.2, 1.1, age) * rng.uniform(0.7, 1.3),
                                    curl=rng.uniform(-0.6, 1.2) if age > 0.5 else 0.0, z0=0.22 - 0.2 * age ** 0.5,
                                    cell=int(rng.integers(0, 3)), dead=False, w=lerp(0.11, 0.2, age ** 0.6) * diam / 1.8))
        for i in range(int(rng.integers(5, 9))):
            phi = rng.uniform(0, 2 * math.pi)
            self.leaves.append(dict(phi=phi, elev=math.radians(rng.uniform(-30, -5)), L=rng.uniform(0.7, 1.0) * diam / 1.8, age=1.2,
                                    arch=rng.uniform(0.2, 0.6), curl=rng.uniform(-0.5, 0.5), z0=0.02, cell=3, dead=True, w=0.16 * diam / 1.8))
        log(name, 'leaves', len(self.leaves))

    def _leaf_curve(self, lf, n):
        up = np.array([0, 0, 1.0])
        rad = np.array([math.cos(lf['phi']), math.sin(lf['phi']), 0.0])
        d = nrm(rad * math.cos(lf['elev']) + up * math.sin(lf['elev']))
        P = [rad * 0.06 + np.array([0, 0, lf['z0']])]; p = P[0].copy()
        ds = lf['L'] / n
        for i in range(n):
            t = i / n
            bend = lf['arch'] * ds * (0.3 + 1.2 * t)
            if t > 0.7 and lf['curl'] != 0:
                bend = bend - lf['curl'] * ds * (t - 0.7) / 0.3 * 2.5
            d = rot_toward(d, -up, bend) if bend > 0 else rot_toward(d, up, -bend)
            p = p + d * ds; P.append(p.copy())
        P = np.array(P)
        if lf['dead']:
            P[:, 2] = np.maximum(P[:, 2], 0.01)
        return P, rad

    def build(self, mats, lod):
        rng = np.random.default_rng(self.seed + (1000 if lod == 'hi' else 2000))
        mb = MB(); BARK, LEAF = 0, 1
        k = 14 if lod == 'hi' else 7
        zs = np.array([-0.05, 0.08, 0.2, 0.3])
        sweep(mb, np.stack([0 * zs, 0 * zs, zs], -1), circle_profile(np.array([0.2, 0.19, 0.15, 0.06]) * self.D / 1.8, k), BARK, tile_v=0.5, cap_end=True)
        n = 14 if lod == 'hi' else 7
        for lf in self.leaves:
            P, rad = self._leaf_curve(lf, n)
            t = np.linspace(0, 1, n + 1)
            wv = lf['w'] * (0.75 + 0.25 * np.sin(math.pi * np.clip(t * 1.4, 0, 1)) ** 0.5) * (1 - t ** 2.2) ** 0.8
            wv[-1] = 0.004
            th = (0.06 * (1 - t) ** 1.2 + 0.006) * self.D / 1.8 * (0.5 if lf['dead'] else 1.0)
            th[-1] = 0.002
            prof = agave_profile(n + 1, wv, th)
            T, E1, E2 = transport_frames(P, hint=(0, 0, 1))
            # keep the channel facing up: E2 ~ up projected
            up = np.array([0, 0, 1.0])
            E2n = nrm(up[None] - T * (T @ up)[:, None]); E1n = np.cross(E2n, T)
            (cu0, cu1), _ = AG_CELLS[lf['cell']]
            sweep(mb, P, prof, LEAF, region=(cu0, cu1, 0, 1), tile_v=None, tag=1, E=(E1n, E2n))
            # tip spine
            tipb = mb.verts(np.array([P[-1] + T[-1] * 0.03]), tag=1)
            if lod == 'hi':
                # marginal teeth: small pyramids along both margins
                s_ = np.linspace(0.12, 0.93, int(lf['L'] / 0.045))
                for sv in s_:
                    i = min(int(sv * n), n - 1); f = sv * n - i
                    c = P[i] * (1 - f) + P[i + 1] * f; e1 = E1n[i]; e2 = E2n[i]; tt = T[i]
                    ww = wv[i] * (1 - f) + wv[i + 1] * f
                    for sgn in (-1, 1):
                        m0 = c + e1 * sgn * ww / 2 + e2 * th[i] * 0.2
                        tipp = m0 + e1 * sgn * 0.008 + tt * 0.006
                        q = np.array([m0 - tt * 0.004 + e2 * 0.002, m0 + tt * 0.004 + e2 * 0.002, tipp, m0 - e2 * 0.004])
                        bi = mb.verts(q, tag=1)
                        uvt = [[cu0 + 0.002, 0.97], [cu0 + 0.006, 0.97], [cu0 + 0.004, 0.99]]
                        mb.faces([[bi, bi + 1, bi + 2], [bi + 1, bi, bi + 3], [bi + 3, bi + 2, bi + 1], [bi, bi + 2, bi + 3]],
                                 [uvt, uvt, uvt, uvt], LEAF)
        if lod == 'hi':
            ob = mb.build(self.name + '_hi', mats)
            log(self.name, 'hi tris', mb.tris())
            return [ob]
        return finish_lod0(mb, mats, self.name, orient=False, centre=np.array([0, 0, 0.35 * self.D / 1.8]))

# ================================================================================================================
# driver
# ================================================================================================================
def tex_dir(out):
    d = os.path.join(out, 'tex', 'gen'); os.makedirs(d, exist_ok=True); return d

def ensure_textures(species, out, samples, force=False):
    td = tex_dir(out)
    if species == 'palm_fan':
        if force or not os.path.exists(os.path.join(td, 'palm_fan_leaf_hi.png')):
            gen_palm_fan_textures(td)
        if force or not os.path.exists(os.path.join(td, 'palm_fan_leaf_lod0.png')):
            gen_palm_fan_cards(td, os.path.join(td, 'palm_fan_leaf_lod0.png'), samples)
    if species == 'palm_date':
        if force or not os.path.exists(os.path.join(td, 'palm_date_leaf_hi.png')):
            gen_palm_date_textures(td)
        if force or not os.path.exists(os.path.join(td, 'palm_date_leaf_lod0.png')):
            gen_palm_date_cards(td, os.path.join(td, 'palm_date_leaf_lod0.png'), samples)
    if species == 'eucalyptus':
        if force or not os.path.exists(os.path.join(td, 'eucalyptus_leaf_hi.png')):
            gen_eucalyptus_textures(td, out)
        if force or not os.path.exists(os.path.join(td, 'eucalyptus_leaf_lod0.png')):
            gen_eucalyptus_cards(td, os.path.join(td, 'eucalyptus_leaf_lod0.png'), samples)
    if species == 'opuntia' and (force or not os.path.exists(os.path.join(td, 'opuntia_leaf_hi.png'))):
        gen_opuntia_textures(td, out)
    if species == 'yucca':
        if force or not os.path.exists(os.path.join(td, 'yucca_leaf_hi.png')):
            gen_yucca_textures(td)
        if force or not os.path.exists(os.path.join(td, 'yucca_leaf_lod0.png')):
            gen_yucca_cards(td, os.path.join(td, 'yucca_leaf_lod0.png'), samples)
    if species == 'agave' and (force or not os.path.exists(os.path.join(td, 'agave_leaf_hi.png'))):
        gen_agave_textures(td, out)

def build_variant(name, out):
    cfg = VARIANTS[name]; sp = cfg['species']; td = tex_dir(out)
    for lod in ('hi', 'lod0'):
        clear_scene()
        if sp == 'palm_fan':
            tree = PalmFan(name, cfg['seed'], cfg['height'])
            bark = make_material(name + '_bark', os.path.join(td, 'palm_fan_bark.jpg'),
                                 os.path.join(td, 'palm_fan_bark_n.jpg'), rough=0.9)
            leaf = make_material(name + '_leaves', os.path.join(td, 'palm_fan_leaf_%s.png' % lod), alpha=True,
                                 rough=0.55, spec=0.45)
            objs = tree.build_hi([bark, leaf]) if lod == 'hi' else tree.build_lod0([bark, leaf], FAN_CARD)
        elif sp == 'palm_date':
            tree = PalmDate(name, cfg['seed'], cfg['height']); tree.tdir = td
            for f in tree.fronds:
                f['cell'] = 3 if f['old'] else int(np.random.default_rng(int(f['phi'] * 1000) % 99991).integers(0, 3))
            bark = make_material(name + '_bark', os.path.join(td, 'palm_date_bark.jpg'),
                                 os.path.join(td, 'palm_date_bark_n.jpg'), rough=0.92)
            leaf = make_material(name + '_leaves', os.path.join(td, 'palm_date_leaf_%s.png' % lod), alpha=True,
                                 rough=0.45, spec=0.5)
            objs = tree.build_hi([bark, leaf]) if lod == 'hi' else tree.build_lod0([bark, leaf], DATE_CARD)
        elif sp == 'eucalyptus':
            tree = Eucalyptus(name, cfg['seed'], cfg['height'], nlimb=cfg.get('nlimb'))
            bark = make_material(name + '_bark', os.path.join(td, 'eucalyptus_bark.jpg'),
                                 os.path.join(td, 'eucalyptus_bark_n.jpg'), rough=0.75)
            leaf = make_material(name + '_leaves', os.path.join(td, 'eucalyptus_leaf_%s.png' % lod), alpha=True,
                                 rough=0.5, spec=0.5)
            falcs = json.load(open(os.path.join(td, 'eucalyptus_leaf_falc.json')))
            objs = tree.build_hi([bark, leaf], falcs) if lod == 'hi' else tree.build_lod0([bark, leaf], EUC_CARD)
        elif sp == 'opuntia':
            tree = Opuntia(name, cfg['seed'], cfg['width'], cfg['height'])
            bark = make_material(name + '_bark', os.path.join(td, 'opuntia_bark.jpg'), os.path.join(td, 'opuntia_bark_n.jpg'), rough=0.9)
            leaf = make_material(name + '_leaves', os.path.join(td, 'opuntia_leaf_hi.png'), alpha=True, rough=0.6, spec=0.4)
            objs = tree.build([bark, leaf], lod, json.load(open(os.path.join(td, 'opuntia_areoles.json'))))
        elif sp == 'yucca':
            tree = Yucca(name, cfg['seed'], cfg['diam'], cfg['stalk'])
            bark = make_material(name + '_bark', os.path.join(td, 'yucca_bark.jpg'), os.path.join(td, 'yucca_bark_n.jpg'), rough=0.9)
            leaf = make_material(name + '_leaves', os.path.join(td, 'yucca_leaf_%s.png' % lod), alpha=True, rough=0.55, spec=0.45)
            objs = tree.build_hi([bark, leaf]) if lod == 'hi' else tree.build_lod0([bark, leaf], YU_CARD)
        elif sp == 'agave':
            tree = Agave(name, cfg['seed'], cfg['diam'])
            bark = make_material(name + '_bark', os.path.join(td, 'agave_bark.jpg'), os.path.join(td, 'agave_bark_n.jpg'), rough=0.9)
            leaf = make_material(name + '_leaves', os.path.join(td, 'agave_leaf_hi.png'), alpha=True, rough=0.5, spec=0.45)
            objs = tree.build([bark, leaf], lod)
        export_glb(os.path.join(out, '%s_%s.glb' % (name, lod)), objs, vcol=(lod == 'lod0'))

# ---- preview ---------------------------------------------------------------------------------------------------
def preview(glb, out_prefix, res, samples, lod0, views=('side', '34')):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=glb)
    objs = [o for o in bpy.data.objects if o.type == 'MESH']
    sc = setup_cycles(samples, transparent=False, denoise=True)
    if ENGINE[0] == 'EEVEE':
        sc.render.engine = 'BLENDER_EEVEE'
        ee = sc.eevee
        for attr, val in (('taa_render_samples', max(samples, 32)), ('use_shadows', True), ('shadow_ray_count', 2),
                          ('shadow_step_count', 4), ('use_raytracing', False), ('fast_gi_method', 'GLOBAL_ILLUMINATION'),
                          ('use_fast_gi', True), ('fast_gi_resolution', '2'), ('shadow_resolution_scale', 1.0)):
            try:
                setattr(ee, attr, val)
            except Exception:
                pass
    try:
        sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Base Contrast'
    except Exception:
        pass
    for o in objs:
        for m in o.data.materials:
            if m is None:
                continue
            nt = m.node_tree; p = next((n for n in nt.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
            if lod0 and p is not None and p.inputs['Base Color'].is_linked:
                # show COLOR_0 (AO) like three.js does: multiply base colour
                src = p.inputs['Base Color'].links[0].from_socket
                if not any(n.bl_idname == 'ShaderNodeVertexColor' for n in nt.nodes):
                    va = nt.nodes.new('ShaderNodeVertexColor')
                    names = [a.name for a in o.data.color_attributes]
                    va.layer_name = names[0] if names else ''
                    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
                    mix.inputs['Factor'].default_value = 1.0
                    nt.links.new(src, mix.inputs['A']); nt.links.new(va.outputs['Color'], mix.inputs['B'])
                    nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    cos = []
    for o in objs:
        a = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', a); a = a.reshape(-1, 3)
        M = np.array(o.matrix_world); cos.append(a @ M[:3, :3].T + M[:3, 3])
    co = np.concatenate(cos)
    lo, hi = co.min(0), co.max(0)
    lo[2] = max(lo[2], 0.0)
    ctr = (lo + hi) / 2
    Hh = hi[2] - lo[2]; Wd = max(hi[0] - lo[0], hi[1] - lo[1])
    # world: sky gradient + sun
    w = bpy.data.worlds.new('sky'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; N = nt.nodes; L = nt.links
    bg = N['Background']
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); ramp = N.new('ShaderNodeValToRGB')
    L.new(tc.outputs['Generated'], sep.inputs[0])
    mp = N.new('ShaderNodeMapRange'); mp.inputs['From Min'].default_value = 0.0; mp.inputs['From Max'].default_value = 0.6
    L.new(sep.outputs['Z'], mp.inputs['Value']); L.new(mp.outputs['Result'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].color = (0.62, 0.70, 0.80, 1); ramp.color_ramp.elements[1].color = (0.22, 0.40, 0.72, 1)
    L.new(ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.9
    # Generated coords on world = direction; z in [-1,1] -> remap
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 4.0; sun.angle = math.radians(1.5)
    try:
        sun.use_shadow = True; sun.shadow_soft_size = 0.03
    except Exception:
        pass
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), 0, math.radians(-60))
    # ground
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
    gp = bpy.context.active_object
    gm = bpy.data.materials.new('ground'); gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.32, 0.29, 0.24, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
    gp.data.materials.append(gm)
    cam = bpy.data.cameras.new('cam'); cam.lens = 50; cam.sensor_width = 36
    co_ = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co_); sc.camera = co_
    cam.clip_end = 2000
    sc.render.resolution_x = res; sc.render.resolution_y = res
    fov = 2 * math.atan(18 / 50)
    # foliage bounds for the crown close-up
    fl = []
    for o in objs:
        li = [i for i, m in enumerate(o.data.materials) if m and m.name.endswith('_leaves')]
        if not li:
            continue
        pm = np.empty(len(o.data.polygons), np.int32); o.data.polygons.foreach_get('material_index', pm)
        lt = np.empty(len(o.data.polygons), np.int32); o.data.polygons.foreach_get('loop_total', lt)
        ls = np.empty(len(o.data.polygons), np.int32); o.data.polygons.foreach_get('loop_start', ls)
        vi = np.empty(len(o.data.loops), np.int32); o.data.loops.foreach_get('vertex_index', vi)
        sel = np.isin(pm, li)
        idx = np.concatenate([vi[a:a + b] for a, b in zip(ls[sel], lt[sel])]) if sel.any() else np.zeros(0, int)
        a = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', a); a = a.reshape(-1, 3)[np.unique(idx)]
        M = np.array(o.matrix_world); fl.append(a @ M[:3, :3].T + M[:3, 3])
    fl = np.concatenate(fl) if fl else co
    flo, fhi = fl.min(0), fl.max(0)
    allv = {'side': ('side', 0.0, 2.0), '34': ('34', 45.0, 22.0), 'crown': ('crown', 30.0, 12.0), 'top': ('top', 0.0, 80.0)}
    for view, az, el in [allv[v] for v in views]:
        if view == 'crown':
            fc = (flo + fhi) / 2; fs = fhi - flo
            span = max(fs[2], fs[0], fs[1]) * 1.15
            dist = span / 2 / math.tan(fov / 2) + max(fs[0], fs[1]) / 2
            tgt = Vector(fc.tolist())
        else:
            span = max(Hh, Wd) * 1.12
            dist = span / 2 / math.tan(fov / 2) + Wd / 2
            tgt = Vector((ctr[0], ctr[1], lo[2] + Hh * 0.5))
        a = math.radians(az - 90); e = math.radians(el)
        pos = tgt + Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))) * dist
        co_.location = pos
        co_.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = '%s_%s.png' % (out_prefix, view)
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        log('preview', sc.render.filepath, '%.1fs' % (time.time() - t0))

def main():
    a = parse_args()
    DEVICE[0] = a.device; ENGINE[0] = a.engine
    out = a.out; os.makedirs(out, exist_ok=True); os.makedirs(os.path.join(out, 'preview'), exist_ok=True)
    names = list(VARIANTS) if a.tree == 'all' else a.tree.split(',')
    stages = ['textures', 'models', 'preview'] if a.stage == 'all' else a.stage.split(',')
    if 'textures' in stages:
        for sp in sorted({VARIANTS[n]['species'] for n in names}):
            t0 = time.time(); ensure_textures(sp, out, a.card_samples, force=a.force_tex); log('textures', sp, '%.1fs' % (time.time() - t0))
    if 'models' in stages:
        for n in names:
            t0 = time.time(); build_variant(n, out); log('models', n, '%.1fs' % (time.time() - t0))
    if 'preview' in stages:
        for n in names:
            for lod in ('hi', 'lod0'):
                preview(os.path.join(out, '%s_%s.glb' % (n, lod)), os.path.join(out, 'preview', '%s_%s' % (n, lod)),
                        a.res, a.samples, lod == 'lod0', views=a.views.split(','))

if __name__ == '__main__':
    main()
