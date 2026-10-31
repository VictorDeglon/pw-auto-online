"""Roof, ground and detail materials."""
import numpy as np
from core import *
from walls import aniso_noise


# ---------------------------------------------------------------- roofs
def roof_clay_barrel(seed=301):
    """Spanish S-tile: ridges across, every tile overlapping the one below it"""
    x, y = grid()
    cols, rows = 7, 5                                                            # 0.25 m pitch across, 0.35 m down a 1.75 m tile
    u = x * cols
    ridge = 0.5 + 0.5 * np.cos((u % 1.0) * 2 * np.pi)                           # 1 on the cap of the barrel, 0 in the pan
    row = np.floor(y * rows).astype(np.int32)
    v = (y * rows) % 1.0
    tile_id = row * 13 + np.floor(u).astype(np.int32)
    lift = 0.35 + 0.65 * sstep(0.0, 0.85, v)                                     # each tile rises toward its upper end ...
    step = 1 - sstep(0.88, 1.0, v)                                               # ... and drops away at its lower lip
    h = ridge * 0.6 * lift * (0.35 + 0.65 * step) + 0.25 * v * (1 - 0.3 * ridge)
    per = hash_id(tile_id, seed)
    base = np.array([rgb('#a8502f'), rgb('#9a4529'), rgb('#b55e3a'), rgb('#8d4428')], np.float32)
    k = (per * 4).astype(int) % 4
    col = base[k] * (0.82 + 0.3 * hash_id(tile_id, seed + 1))[..., None]
    fade = fnoise(seed + 2, 2.4, lo=4, hi=40)
    col = hsv_mix(col, col * np.array([0.8, 0.82, 0.8]) + 0.05, 0.5 * fade)
    shadow = 0.55 + 0.45 * sstep(0.0, 0.22, v) * (0.6 + 0.4 * sstep(0.0, 0.5, 1 - v))   # the lip above shades the tile below
    moss = sstep(0.68, 0.85, fnoise(seed + 3, 2.4, lo=6, hi=40)) * (1 - ridge) * 0.5
    col = hsv_mix(col, np.array([0.28, 0.33, 0.16], np.float32), moss * 0.5)
    h = h + 0.03 * (fnoise(seed + 4, 1.2, lo=40) - 0.5)
    return Mat(col * shadow[..., None] * cavity(h, 8, 0.4)[..., None], h, 0.78 + 0.1 * fade, 1.75, 6.0, name='roof_clay_barrel', cat='roof')


def roof_concrete_flat(seed=311):
    x, y = grid()
    rows, cols = 5, 4
    row = np.floor(y * rows).astype(np.int32)
    xo = x * cols + np.where(row % 2 == 1, 0.5, 0.0)
    tid = row * 11 + np.floor(xo).astype(np.int32) % cols
    fu, fv = xo % 1.0, (y * rows) % 1.0
    edge = sstep(0.0, 0.03, fu) * sstep(0.0, 0.03, 1 - fu)
    lap = 0.5 + 0.5 * sstep(0.0, 0.8, fv)
    h = lap * edge * 0.5 + 0.2 + 0.03 * (fnoise(seed, 1.2, lo=40) - 0.5)
    per = hash_id(tid, seed)
    tint = rgb('#7d6b5c') * (0.82 + 0.3 * per)[..., None] + 0.0
    shadow = 0.55 + 0.45 * sstep(0.0, 0.2, fv)
    col = tint * (0.9 + 0.12 * (fnoise(seed + 1, 2.2, lo=3, hi=30)[..., None] - 0.5)) * (1 - 0.35 * (1 - edge))[..., None] * shadow[..., None]
    return Mat(col, h, 0.88, 1.6, 4.0, name='roof_concrete_tile', cat='roof')


def _shingle(seed, rows, tab_w, name, base, arch):
    x, y = grid()
    r = rng(seed)
    row = np.floor(y * rows).astype(np.int32)
    v = (y * rows) % 1.0
    tabs = np.maximum(int(1.0 / tab_w), 2)
    ids = np.zeros_like(row)
    xo = x * tabs
    off = np.array([r.random() for _ in range(rows)])[row]                       # each course's tabs start somewhere else
    uu = (x * tabs + off * 3.0)
    col_i = np.floor(uu).astype(np.int32)
    fu = uu % 1.0
    tid = row * 37 + (col_i % tabs)
    slot = sstep(0.0, 0.035, fu) * sstep(0.0, 0.035, 1 - fu) if arch else 1 - 0.0 * fu
    notch = 1 - 0.9 * (v < 0.55) * (1 - slot)                                    # slots between tabs reach up into the course
    grain = fnoise(seed + 1, 0.7, lo=120)
    per = hash_id(tid, seed)
    tone = (0.78 + 0.4 * (per - 0.5)) * (0.88 + 0.22 * grain)
    col = rgb(base)[None, None, :] * tone[..., None]
    h = 0.15 + 0.7 * sstep(0.0, 0.85, v) * (0.75 + 0.25 * per) + 0.05 * grain
    shadow = 0.5 + 0.5 * sstep(0.0, 0.14, v)
    lowedge = 1 - sstep(0.9, 1.0, v) * 0.25
    return Mat(col * (notch * shadow * lowedge)[..., None], h, 0.93, 1.6, 6.0, name=name, cat='roof')


def roof_shingle_arch(seed=321):
    return _shingle(seed, 12, 0.18, 'roof_shingle_arch', '#4b4742', True)


def roof_shingle_3tab(seed=331):
    return _shingle(seed, 14, 0.333, 'roof_shingle_3tab', '#6a5d52', True)


def roof_gravel(seed=341):
    f1, f2, ident = voronoi(seed, 70, jitter=0.9)
    d = f1 * 70
    stone = sstep(0.62, 0.38, d * (0.7 + 0.7 * hash_id(ident, seed)))
    pal = np.array([rgb(c) for c in ['#8a8782', '#a29c93', '#6f6c68', '#b1a99c', '#7a7064']], np.float32)
    k = (hash_id(ident, seed + 1) * len(pal)).astype(int) % len(pal)
    col = pal[k] * (0.8 + 0.35 * hash_id(ident, seed + 2))[..., None]
    col = col * stone[..., None] + rgb('#3a3834')[None, None, :] * (1 - stone[..., None])
    h = 0.15 + 0.85 * np.sqrt(np.clip(1 - (d / 0.62) ** 2, 0, 1)) * stone
    dust = sstep(0.4, 0.9, fnoise(seed + 3, 2.6, hi=14)) * 0.25
    col = hsv_mix(col, rgb('#8b8478')[None, None, :], dust[..., None] * 0.5)
    return Mat(col * cavity(h, 3, 0.6)[..., None], h, 0.92, 1.5, 4.0, name='roof_gravel', cat='roof')


def roof_membrane(seed=351):
    x, y = grid()
    seam = np.maximum(np.exp(-(np.minimum(x, 1 - x) / 0.004) ** 2), np.exp(-(((y * 2) % 1.0 - 0.0) / 0.004) ** 2) * 0 + np.exp(-(np.minimum((y * 2) % 1.0, 1 - (y * 2) % 1.0) / 0.004) ** 2))
    dirt = 0.18 * sstep(0.4, 1.0, aniso_noise(seed, 1.0, 1.0, 2.6, N)) + 0.1 * fnoise(seed + 1, 3.2, hi=10)
    ponding = sstep(0.6, 0.85, fnoise(seed + 2, 3.0, hi=6)) * 0.18
    tone = 0.84 - dirt - ponding * 0.5
    col = np.stack([tone, tone * 0.99, tone * 0.97], -1) * (1 - 0.1 * seam)[..., None]
    return Mat(col, 0.1 + 0.2 * seam + 0.03 * fnoise(seed + 3, 1.0, lo=40), 0.55 + 0.3 * dirt, 2.0, 3.0, name='roof_membrane_white', cat='roof')


def roof_metal(seed=361):
    x, y = grid()
    u = (x * 4) % 1.0
    rib = np.exp(-((np.minimum(u, 1 - u)) / 0.03) ** 2)
    can = fnoise(seed, 2.2, lo=3, hi=14) - 0.5
    streak = aniso_noise(seed + 1, 0.05, 1.0, 1.8)
    tone = 0.55 + 0.05 * (streak - 0.5) + 0.04 * can
    alb = np.stack([tone * 0.9, tone * 0.5, tone * 0.45], -1) * (1 - 0.15 * rib)[..., None]          # a red-brown painted default; tinted in game
    return Mat(alb, 0.12 + 0.8 * rib + 0.05 * can, 0.36 + 0.1 * streak, 1.2, 6.0, metal=0.7, name='roof_metal_ribbed', cat='roof')


def roof_shake(seed=371):
    x, y = grid()
    r = rng(seed)
    rows = 6
    row = np.floor(y * rows).astype(np.int32)
    v = (y * rows) % 1.0
    off = np.array([r.random() for _ in range(rows)])[row]
    cols = 16
    uu = x * cols + off * 5
    tid = row * 29 + (np.floor(uu).astype(np.int32) % cols)
    fu = uu % 1.0
    gap = 1 - sstep(0.0, 0.05, fu) * sstep(0.0, 0.05, 1 - fu)
    grain = aniso_noise(seed + 1, 0.03, 1.0, 1.4)
    per = hash_id(tid, seed)
    tone = 0.5 + 0.28 * (per - 0.5) + 0.26 * (grain - 0.5)
    col = np.stack([tone * 0.98, tone * 0.88, tone * 0.78], -1) * (0.55 + 0.45 * sstep(0.0, 0.2, v))[..., None] * (1 - 0.7 * gap)[..., None]
    h = 0.2 + 0.7 * sstep(0.0, 0.9, v) * (0.7 + 0.3 * per) * (1 - 0.6 * gap)
    return Mat(col, h, 0.88, 1.5, 6.0, name='roof_wood_shake', cat='roof')


# ---------------------------------------------------------------- ground
def _aggregate(seed, base, speck, big=0.5):
    fine = fnoise(seed, 0.5, lo=120)
    mid = fnoise(seed + 1, 1.1, lo=30)
    chips = sstep(0.82 - 0.2 * big, 0.9, fine) * (0.5 + 0.5 * mid)               # light aggregate showing through the binder
    return fine, mid, chips


def asphalt_new(seed=401):
    fine, mid, chips = _aggregate(seed, 0.2, 0.5)
    large = fnoise(seed + 2, 3.0, hi=8)
    tone = 0.17 + 0.05 * large + 0.04 * (mid - 0.5)
    col = np.stack([tone, tone, tone * 1.04], -1) + chips[..., None] * 0.2 + (0.06 * (fine - 0.5))[..., None]
    h = 0.5 * mid + 0.5 * fine + 0.3 * chips
    return Mat(col, h, 0.88 - 0.1 * chips, 3.0, 5.0, name='asphalt_new', cat='ground')


def asphalt_worn(seed=411):
    m = asphalt_new(seed)
    f1, f2, _ = voronoi(seed, 5, jitter=0.95)
    warp = (fnoise(seed + 5, 2.0, lo=5, hi=60) - 0.5) * 0.035
    crack = 1 - sstep(0.001, 0.0045, (f2 - f1) + warp)
    crack *= sstep(0.45, 0.65, fnoise(seed + 6, 2.2, hi=10))
    seal = 1 - sstep(0.0, 0.006, np.abs(f2 - f1 - 0.07 + warp * 0.5)) * 0                      # (sealed cracks omitted)
    patch = sstep(0.55, 0.6, fnoise(seed + 7, 2.8, lo=2, hi=6))
    oil = sstep(0.7, 0.8, fnoise(seed + 8, 2.0, lo=3, hi=20)) * 0.6
    tracks = sstep(0.4, 0.9, aniso_noise(seed + 9, 0.05, 1.0, 2.0)) * 0.5
    fade = 0.1 * sstep(0.3, 1.0, fnoise(seed + 10, 2.8, hi=8))
    col = m.albedo + fade[..., None] + 0.04 * patch[..., None] - 0.05 * oil[..., None] - 0.025 * tracks[..., None]
    col = col * (1 - 0.8 * crack)[..., None]
    h = m.height - 0.4 * crack + 0.1 * patch
    return Mat(col, h, np.clip(m.rough - 0.35 * oil + 0.05 * fade * 5, 0, 1), 3.0, 6.0, name='asphalt_worn', cat='ground')


def concrete_sidewalk(seed=421):
    x, y = grid()
    slab = 2                                                                      # 2 x 2 slabs of 1.2 m in a 2.4 m tile
    sx, sy = np.floor(x * slab).astype(np.int32), np.floor(y * slab).astype(np.int32)
    sid = sy * 5 + sx
    fu, fv = (x * slab) % 1.0, (y * slab) % 1.0
    joint = 1 - sstep(0.0, 0.006, np.minimum(fu, 1 - fu)) * sstep(0.0, 0.006, np.minimum(fv, 1 - fv))
    edging = 1 - sstep(0.006, 0.025, np.minimum(fu, 1 - fu)) * sstep(0.006, 0.025, np.minimum(fv, 1 - fv))   # trowelled margins
    ctrl = np.exp(-((np.abs(fu - 0.5)) / 0.004) ** 2) * 0.6 + np.exp(-((np.abs(fv - 0.5)) / 0.004) ** 2) * 0.6    # control joints
    broom = aniso_noise(seed, 1.0, 0.012, 1.4)
    pits = sstep(0.7, 0.78, fnoise(seed + 1, 0.5, lo=100))
    tone = 0.70 + 0.08 * (hash_id(sid, seed) - 0.5) + 0.07 * fnoise(seed + 2, 3.0, hi=8)
    stain = 0.1 * sstep(0.55, 0.9, fnoise(seed + 3, 2.4, lo=3, hi=18))
    col = np.stack([tone * 0.97, tone * 0.96, tone * 0.92], -1) * (1 - stain - 0.35 * pits - 0.5 * joint - 0.25 * np.clip(ctrl, 0, 1))[..., None]
    h = 0.5 + 0.1 * broom * (1 - edging) - 0.35 * joint - 0.2 * np.clip(ctrl, 0, 1) - 0.1 * pits
    return Mat(col, h, 0.9 - 0.15 * edging, 2.4, 5.0, name='concrete_sidewalk', cat='ground')


def concrete_driveway(seed=431):
    m = concrete_sidewalk(seed)
    broom = aniso_noise(seed + 20, 0.015, 1.0, 1.3)
    h = m.height + 0.18 * (broom - 0.5)
    col = m.albedo * (0.95 + 0.1 * (broom - 0.5))[..., None]
    oil = sstep(0.78, 0.88, fnoise(seed + 21, 2.0, lo=4, hi=20)) * 0.22
    col = col * (1 - oil)[..., None]
    return Mat(col, h, m.rough - 0.25 * oil, 2.4, 5.0, name='concrete_driveway', cat='ground')


def pavers_basket(seed=441):
    x, y = grid()
    cells = 6                                                                     # 6 x 6 groups of two pavers: 1.2 m
    gx, gy = np.floor(x * cells).astype(np.int32), np.floor(y * cells).astype(np.int32)
    horiz = (gx + gy) % 2 == 0
    fu, fv = (x * cells) % 1.0, (y * cells) % 1.0
    a = np.where(horiz, fv, fu)                                                   # across the pair
    b = np.where(horiz, fu, fv)
    half = (a * 2) % 1.0
    pid = (gy * 11 + gx) * 2 + (a * 2).astype(np.int32)
    inner = sstep(0.0, 0.05, half) * sstep(0.0, 0.05, 1 - half) * sstep(0.0, 0.025, b) * sstep(0.0, 0.025, 1 - b)
    pal = np.array([rgb(c) for c in ['#a3896f', '#94795f', '#b09b82', '#8a7058', '#9d8468']], np.float32)
    k = (hash_id(pid, seed) * len(pal)).astype(int) % len(pal)
    col = pal[k] * (0.9 + 0.2 * hash_id(pid, seed + 1))[..., None] * (0.92 + 0.14 * fnoise(seed + 2, 1.0, lo=30)[..., None])
    col = col * inner[..., None] + rgb('#6f655a')[None, None, :] * (1 - inner[..., None])
    h = 0.2 + 0.5 * inner + 0.03 * fnoise(seed + 3, 1.0, lo=40)
    return Mat(col * cavity(h, 5, 0.6)[..., None], h, 0.9, 1.2, 5.0, name='pavers_basket', cat='ground')


def decomposed_granite(seed=451):
    f1, f2, ident = voronoi(seed, 140, jitter=1.0)
    d = f1 * 140
    pebble = sstep(0.62, 0.3, d * (0.8 + 0.9 * hash_id(ident, seed)))
    pal = np.array([rgb(c) for c in ['#b19a74', '#a38c66', '#c2ab84', '#8f7c5c', '#b8a47e', '#9a8b72']], np.float32)
    k = (hash_id(ident, seed + 1) * len(pal)).astype(int) % len(pal)
    col = pal[k] * (0.8 + 0.4 * hash_id(ident, seed + 2))[..., None]
    fines = fnoise(seed + 3, 0.8, lo=60)
    col = col * pebble[..., None] + (rgb('#7d6e55') * (0.7 + 0.5 * fines[..., None])) * (1 - pebble[..., None])
    h = 0.2 + 0.7 * pebble * np.sqrt(np.clip(1 - (d / 0.7) ** 2, 0, 1)) + 0.1 * fines
    return Mat(col * cavity(h, 2, 0.5)[..., None], h, 0.96, 2.0, 5.0, name='decomposed_granite', cat='ground')


def gravel_rock(seed=461):
    f1, f2, ident = voronoi(seed, 28, jitter=0.9)
    d = f1 * 28
    stone = sstep(0.7, 0.45, d * (0.6 + 0.8 * hash_id(ident, seed)))
    pal = np.array([rgb(c) for c in ['#8a8782', '#9c968c', '#77736c', '#a8a094', '#6a6660', '#8f8574']], np.float32)
    k = (hash_id(ident, seed + 1) * len(pal)).astype(int) % len(pal)
    col = pal[k] * (0.82 + 0.3 * hash_id(ident, seed + 2))[..., None] * (1 + 0.2 * (fnoise(seed + 3, 1.2, lo=30)[..., None] - 0.5))
    col = col * stone[..., None] + rgb('#3b3833')[None, None, :] * (1 - stone[..., None])
    h = 0.1 + 0.9 * np.sqrt(np.clip(1 - (d / 0.72) ** 2, 0, 1)) * stone
    return Mat(col * cavity(h, 5, 0.8)[..., None], h, 0.88, 2.0, 7.0, name='gravel_rock', cat='ground')


def mulch_bark(seed=471):
    h = 0.0
    acc = 0
    for i in range(8):                                                           # shredded strands lying every which way
        a = aniso_noise(seed + i, 1.0 if i % 2 else 0.05, 0.05 if i % 2 else 1.0, 1.3)
        ridge = 1 - np.abs(a - 0.5) * 2                                          # thin bright ridges where the noise crosses its middle
        ridge = ridge ** 5
        h = np.maximum(h, ridge * (0.55 + 0.45 * hash_id(np.array([i]), seed)[0]))
        acc = acc + ridge * (0.5 + 0.5 * ((i * 37) % 7) / 7)
    fine = fnoise(seed + 9, 0.8, lo=60)
    tone = 0.22 + 0.22 * np.clip(h, 0, 1) + 0.1 * np.clip(acc / 3, 0, 1) * (fine - 0.3) + 0.05 * (fine - 0.5)
    col = np.stack([tone * 1.18, tone * 0.8, tone * 0.58], -1)
    return Mat(col * cavity(h, 4, 0.9)[..., None], h, 0.95, 1.5, 6.0, name='mulch_bark', cat='ground')


# ---------------------------------------------------------------- details with their own layout (use whole-tile uvs)
def garage_door(seed=481):
    """sectional door: 4 x 4 raised panels in a 2.4 m tile (the door is 2.1 m high: it's mapped 0..0.875 in v)"""
    x, y = grid()
    rows, cols = 4, 4
    fu, fv = (x * cols) % 1.0, (y * rows) % 1.0
    seam = np.exp(-((np.minimum(fv, 1 - fv)) / 0.012) ** 2)
    panel_in = sstep(0.1, 0.16, fu) * sstep(0.1, 0.16, 1 - fu) * sstep(0.2, 0.27, fv) * sstep(0.2, 0.27, 1 - fv)
    panel_in2 = sstep(0.16, 0.22, fu) * sstep(0.16, 0.22, 1 - fu) * sstep(0.28, 0.34, fv) * sstep(0.28, 0.34, 1 - fv)
    h = 0.5 + 0.18 * panel_in - 0.1 * seam + 0.06 * panel_in2
    grain = aniso_noise(seed, 1.0, 0.1, 1.5)
    tone = 0.86 + 0.02 * (grain - 0.5)
    col = np.stack([tone, tone * 0.99, tone * 0.96], -1) * (1 - 0.28 * seam - 0.12 * (1 - panel_in))[..., None]
    return Mat(col * cavity(h, 6, 0.4)[..., None], h, 0.5, 2.4, 5.0, name='garage_door_panels', cat='detail')


def solar_panel(seed=491):
    """one 1.0 x 1.65 m module in the corner of a 1.65 m tile: frame, 6 x 10 cells, bus bars. Map it with uv (0..0.606, 0..1)."""
    x, y = grid()
    W, H = 1.0 / 1.65, 1.0
    u, v = x, y
    inside = (u < W) & (v < H)
    fr = 0.025
    inner = (u > fr * 0.6) & (u < W - fr * 0.6) & (v > fr) & (v < H - fr)
    cu = ((u - fr * 0.6) / (W - fr * 1.2) * 6) % 1.0
    cv = ((v - fr) / (H - fr * 2) * 10) % 1.0
    cell = sstep(0.0, 0.012, cu) * sstep(0.0, 0.012, 1 - cu) * sstep(0.0, 0.012, cv) * sstep(0.0, 0.012, 1 - cv)
    bus = np.exp(-((np.abs(cu - 0.33)) / 0.006) ** 2) + np.exp(-((np.abs(cu - 0.66)) / 0.006) ** 2)
    fine = np.exp(-((np.abs(((cv * 22) % 1.0) - 0.5) - 0.0) / 0.3) ** 2) * 0
    sheen = 0.5 + 0.5 * fnoise(seed, 3.0, hi=6)
    cellc = np.stack([0.035 + 0.02 * sheen, 0.05 + 0.03 * sheen, 0.11 + 0.05 * sheen], -1) * (1 + 0.5 * bus[..., None])
    frame = np.stack([0.62, 0.64, 0.66], -1)[None, None, :] * (0.9 + 0.1 * fnoise(seed + 1, 1.0, lo=40)[..., None])
    gap = np.stack([0.75, 0.77, 0.8], -1)[None, None, :] * np.ones_like(cellc)
    col = np.where(inner[..., None], cellc * cell[..., None] + gap * 0.1 * (1 - cell[..., None]), frame)
    col = np.where(inside[..., None], col, np.stack([0.05, 0.05, 0.06], -1)[None, None, :] * np.ones_like(col))
    h = np.where(inner, 0.5, 0.62)
    return Mat(col, h, np.where(inner, 0.12, 0.45), 1.65, 2.0, metal=0.1, name='solar_panel', cat='detail')


def galvanized(seed=501):
    streak = aniso_noise(seed, 0.05, 1.0, 1.8)
    spangle = voronoi(seed, 60, jitter=1.0)[2]
    tone = 0.62 + 0.1 * (hash_id(spangle, seed) - 0.5) + 0.06 * (streak - 0.5)
    col = np.stack([tone * 0.95, tone * 0.97, tone], -1)
    dirt = sstep(0.55, 0.9, fnoise(seed + 1, 2.4, hi=14)) * 0.3
    col = col * (1 - dirt)[..., None]
    return Mat(col, 0.1 * streak, 0.38 + 0.3 * dirt, 1.0, 1.5, metal=0.85, name='metal_galvanized', cat='detail')


def glass_window(seed=511):
    """dark window glass with a soft vertical gradient and faint grime; the sky comes from the reflections"""
    x, y = grid()
    grime = fnoise(seed, 3.0, hi=10)
    g = 0.05 + 0.03 * (1 - y) + 0.015 * grime
    col = np.stack([g * 0.8, g * 0.95, g * 1.15], -1)
    return Mat(col, np.full((N, N), 0.5, np.float32), 0.06 + 0.08 * sstep(0.55, 0.85, grime), 1.0, 1.0, metal=0.0, name='glass_window', cat='detail')


ROOFS = [roof_clay_barrel, roof_concrete_flat, roof_shingle_arch, roof_shingle_3tab, roof_gravel, roof_membrane, roof_metal, roof_shake]
GROUND = [asphalt_new, asphalt_worn, concrete_sidewalk, concrete_driveway, pavers_basket, decomposed_granite, gravel_rock, mulch_bark]
DETAILS = [garage_door, solar_panel, galvanized, glass_window]
