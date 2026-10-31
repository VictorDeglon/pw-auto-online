"""Wall materials: stucco, plaster, siding, brick, block, stone, concrete, metal, wood. Albedo is kept light and neutral where the
game tints it (stucco, siding, painted things) and carries its own colour where the material has one (brick, stone, wood)."""
import numpy as np
from core import *


def aniso_noise(seed, sx, sy, beta=2.0, n=N):
    """noise with different detail along x and y: sx, sy scale the x and y frequency in the spectrum. A SMALL multiplier keeps
    fine detail along that axis and makes features long along the other: (1, 0.05) = horizontal streaks, (0.05, 1) = vertical."""
    r = rng(seed)
    fx = np.fft.fftfreq(n)[:, None] * n * sy
    fy = np.fft.rfftfreq(n)[None, :] * n * sx
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = 1.0 / f ** (beta / 2)
    amp[0, 0] = 0
    spec = amp * (r.normal(size=(n, n // 2 + 1)) + 1j * r.normal(size=(n, n // 2 + 1)))
    a = np.fft.irfft2(spec, s=(n, n))
    a -= a.min()
    return a / max(a.max(), 1e-9)


def stucco_fine(seed=1):
    h = 0.55 * fnoise(seed, 2.8, lo=3, hi=40) + 0.45 * fnoise(seed + 1, 1.0, lo=70)
    tone = 0.93 + 0.07 * fnoise(seed + 2, 3.2, hi=12) + 0.04 * (fnoise(seed + 3, 0.8, lo=90) - 0.5)
    base = np.stack([tone * 0.80, tone * 0.785, tone * 0.755], -1)
    ao = cavity(h, 3, 0.55)
    return Mat(base * ao[..., None], h, 0.93 - 0.03 * h, 2.0, 3.0, name='stucco_fine', cat='wall')


def stucco_sand(seed=11):
    h = 0.4 * fnoise(seed, 2.6, lo=3, hi=50) + 0.6 * fnoise(seed + 1, 0.7, lo=40)
    tone = 0.9 + 0.1 * fnoise(seed + 2, 3.0, hi=10) + 0.07 * (fnoise(seed + 3, 0.6, lo=100) - 0.5)
    base = np.stack([tone * 0.79, tone * 0.775, tone * 0.745], -1)
    ao = cavity(h, 2.5, 0.8)
    return Mat(base * ao[..., None], h, 0.95 - 0.04 * h, 2.0, 6.0, name='stucco_sand', cat='wall')


def stucco_lace(seed=21):
    """skip-trowel / Spanish lace: raised, flattened blotches on a rougher ground"""
    f = fnoise(seed, 2.4, lo=2, hi=26)
    m = sstep(0.50, 0.58, f)
    grain = fnoise(seed + 1, 1.0, lo=60)
    h = 0.15 * grain + m * (0.32 + 0.08 * smooth(grain, 1.5)) + 0.1 * smooth(m, 5)
    edge = m - smooth(m, 4)
    tone = 0.92 + 0.07 * fnoise(seed + 2, 3.0, hi=10)
    base = np.stack([tone * 0.8, tone * 0.785, tone * 0.76], -1)
    base *= (1 - 0.05 * np.clip(-edge * 4, 0, 1))[..., None]
    base *= (1 - 0.035 * (1 - m))[..., None]
    ao = cavity(h, 4, 0.4)
    return Mat(base * ao[..., None], h, 0.95 - 0.1 * m, 2.5, 5.0, name='stucco_lace', cat='wall')


def stucco_aged(seed=31):
    m = stucco_sand(seed)
    h = m.height.copy()
    f1, f2, _ = voronoi(seed, 6, jitter=0.9)
    warp = (fnoise(seed + 5, 2.0, lo=6, hi=40) - 0.5) * 0.02
    crack = 1 - sstep(0.0015, 0.0042, (f2 - f1) + warp)
    keep = sstep(0.5, 0.68, fnoise(seed + 6, 2.2, hi=10))                       # only some of the cell edges crack
    crack *= keep
    streak = aniso_noise(seed + 7, 0.07, 1.0, 2.2)                              # rain streaks run down
    streak = sstep(0.45, 0.8, streak) * 0.22
    dirt = 0.12 * sstep(0.5, 1.0, fnoise(seed + 8, 2.8, hi=8))
    alb = m.albedo * (1 - streak - dirt)[..., None] * np.array([1.0, 0.985, 0.95])
    alb *= (1 - 0.65 * crack)[..., None]
    h = h - 0.5 * crack
    return Mat(alb, h, m.rough, 2.5, 6.0, name='stucco_aged', cat='wall')


def plaster_smooth(seed=41):
    h = 0.5 * fnoise(seed, 3.2, lo=2, hi=18)
    strokes = 0
    for i, ang in enumerate((0.3, 1.1, 2.0, 2.7)):                              # trowel sweeps
        a = aniso_noise(seed + 10 + i, 1.0, 0.18, 2.4)
        strokes = strokes + (a - 0.5)
    h = h + 0.12 * strokes
    tone = 0.94 + 0.06 * fnoise(seed + 2, 3.0, hi=10)
    base = np.stack([tone * 0.82, tone * 0.805, tone * 0.775], -1)
    return Mat(base * cavity(h, 6, 0.3)[..., None], h, 0.72 + 0.12 * fnoise(seed + 3, 2.5, hi=20), 2.0, 1.2, name='plaster_smooth', cat='wall')


# ---------------------------------------------------------------- siding
def siding_lap(seed=51, boards=8):
    x, y = grid()
    v = (y * boards) % 1.0
    prof = 0.15 + 0.85 * (v ** 0.8)                                              # thin at the top, thick at the drip edge
    prof = np.where(v > 0.93, prof * (1 - (v - 0.93) / 0.07 * 0.9), prof)       # rounded drip edge
    grain = aniso_noise(seed, 1.0, 0.04, 1.6)
    per = hash_id(np.floor(y * boards).astype(np.int32), seed)
    tone = 0.93 + 0.05 * (per - 0.5) + 0.035 * (grain - 0.5)
    base = np.stack([tone * 0.81, tone * 0.80, tone * 0.78], -1)
    ao = 0.55 + 0.45 * sstep(0.0, 0.16, v)                                       # the shadow under the board above
    h = prof * 0.5 + 0.03 * grain
    return Mat(base * ao[..., None], h, 0.62 + 0.1 * grain, 1.0, 9.0, name='siding_lap', cat='wall')


def siding_board_batten(seed=61):
    x, y = grid()
    boards = 4
    d = np.minimum((x * boards) % 1.0, 1 - (x * boards) % 1.0)                   # 0 on a batten's centre line
    inb = d < 0.07
    t = np.clip(d / 0.07, 0, 1)
    prof = np.where(inb, 0.55 + 0.45 * np.sqrt(np.clip(1 - t * t, 0, 1)), 0.2)
    grain = aniso_noise(seed, 0.04, 1.0, 1.6)
    per = hash_id(np.floor(x * boards + 0.5).astype(np.int32) % boards, seed)
    tone = 0.93 + 0.04 * (per - 0.5) + 0.035 * (grain - 0.5)
    base = np.stack([tone * 0.81, tone * 0.80, tone * 0.78], -1)
    shade = 1 - 0.45 * sstep(0.10, 0.07, d) * 0 - 0.4 * ((d > 0.07) & (d < 0.12)) * (1 - sstep(0.07, 0.12, d))
    h = prof * 0.45 + 0.02 * grain
    return Mat(base * shade[..., None] * cavity(h, 5, 0.5)[..., None], h, 0.62 + 0.1 * grain, 1.2, 5.0, name='siding_board_batten', cat='wall')


def siding_shiplap_wood(seed=71):
    x, y = grid()
    boards = 8
    v = (y * boards) % 1.0
    groove = 1 - sstep(0.0, 0.035, v) * sstep(0.0, 0.035, 1 - v)
    grain = aniso_noise(seed, 1.0, 0.025, 1.3)
    rings = np.sin((aniso_noise(seed + 1, 1.0, 0.03, 2.2) * 28 + y * boards * 2.3) * 2 * np.pi)
    per = hash_id(np.floor(y * boards).astype(np.int32), seed)
    tone = 0.62 + 0.18 * (per - 0.5) + 0.22 * (grain - 0.5) + 0.05 * rings
    warm = np.stack([tone * 1.0, tone * 0.82, tone * 0.62], -1)
    weathered = np.stack([tone * 0.83, tone * 0.8, tone * 0.76], -1)
    alb = hsv_mix(warm, weathered, 0.45)
    alb = alb * (1 - 0.7 * groove)[..., None]
    h = 0.5 - 0.35 * groove + 0.06 * grain
    return Mat(alb, h, 0.78 + 0.1 * grain, 1.0, 4.0, name='siding_shiplap_wood', cat='wall')


# ---------------------------------------------------------------- masonry
def _brick(seed, palette, mortar, course_n=12, brick_n=4, jitter=0.12, gloss=0.8, name='brick', edge=0.012, relief=1.0, paint=None):
    x, y = grid()
    row = np.floor(y * course_n).astype(np.int32)
    xo = x * brick_n + np.where(row % 2 == 1, 0.5, 0.0)
    col = np.floor(xo).astype(np.int32) % brick_n
    bid = row * 31 + col
    fu = xo % 1.0
    fv = (y * course_n) % 1.0
    mx, my = 0.05, 0.10                                                          # mortar share of a brick's width / height
    inx = sstep(mx * 0.5, mx * 0.5 + edge * 4, fu) * sstep(mx * 0.5, mx * 0.5 + edge * 4, 1 - fu)
    iny = sstep(my * 0.5, my * 0.5 + edge * 4, fv) * sstep(my * 0.5, my * 0.5 + edge * 4, 1 - fv)
    face = inx * iny                                                             # 1 on the brick, 0 in the mortar
    pal = np.array([rgb(c) for c in palette], np.float32)
    pick = (hash_id(bid, seed) * len(pal)).astype(int) % len(pal)
    pick2 = (hash_id(bid, seed + 9) * len(pal)).astype(int) % len(pal)
    t = hash_id(bid, seed + 3)[..., None]
    col_b = pal[pick] * (1 - t) + pal[pick2] * t
    col_b = col_b * (1 + (hash_id(bid, seed + 5)[..., None] - 0.5) * jitter * 2)
    surf = fnoise(seed + 1, 1.2, lo=24) - 0.5
    blot = fnoise(seed + 2, 2.6, lo=3, hi=25) - 0.5
    col_b = col_b * (1 + 0.16 * surf[..., None] + 0.18 * blot[..., None])
    mort = rgb(mortar)[None, None, :] * (0.92 + 0.12 * (fnoise(seed + 4, 1.0, lo=60)[..., None] - 0.5))
    alb = col_b * face[..., None] + mort * (1 - face[..., None])
    hb = 0.55 + 0.1 * (hash_id(bid, seed + 7) - 0.5) + 0.08 * surf
    h = np.where(face > 0.02, hb * face + 0.0, 0.18 * relief) * 1.0
    h = (0.18 + (hb - 0.18) * face) * relief + 0.04 * surf
    if paint is not None:                                                        # painted brick: colour is paint, the relief is softened
        h = smooth(h, 1.6)
        alb = np.ones_like(alb) * rgb(paint)[None, None, :] * (0.96 + 0.06 * blot[..., None]) * (1 - 0.18 * (1 - face[..., None]))
    ao = cavity(h, 7, 0.9)
    return Mat(alb * ao[..., None], h, np.where(face > 0.5, 0.78, 0.95) * (1 - 0.1 * gloss * face), 0.9, 6.0 if paint is None else 4.0, name=name, cat='wall')


def brick_red(seed=81):
    return _brick(seed, ['#8d3d2b', '#a04e38', '#7c3326', '#b05d41', '#6e2d22', '#96442f'], '#a59f92', name='brick_red_running')


def brick_tan(seed=91):
    return _brick(seed, ['#c9ab82', '#bf9d74', '#d3b88f', '#b08f68', '#c2a47c'], '#b5ac9b', name='brick_tan')


def brick_painted(seed=101):
    return _brick(seed, ['#d8d2c6'], '#c9c3b6', name='brick_painted_white', paint='#e4dfd3', relief=0.9)


def _blocks(seed, split, name, paint):
    x, y = grid()
    cols, rows = 4, 8                                                            # 16 x 8 in blocks: a 1.6 m tile
    row = np.floor(y * rows).astype(np.int32)
    xo = x * cols + np.where(row % 2 == 1, 0.5, 0.0)
    col = np.floor(xo).astype(np.int32) % cols
    bid = row * 17 + col
    fu, fv = xo % 1.0, (y * rows) % 1.0
    face = sstep(0.012, 0.03, fu) * sstep(0.012, 0.03, 1 - fu) * sstep(0.03, 0.07, fv) * sstep(0.03, 0.07, 1 - fv)
    rough_h = fnoise(seed, 1.1, lo=12) - 0.5
    if split:                                                                    # split-face: broken, bumpy faces
        h = 0.3 + 0.28 * face + face * (0.3 * rough_h + 0.12 * (hash_id(bid, seed)[..., None][..., 0] - 0.5))
        h = h + 0.2 * (fnoise(seed + 1, 2.0, lo=4, hi=30) - 0.5) * face
    else:
        h = 0.3 + 0.3 * face + 0.025 * rough_h * face
    pores = sstep(0.62, 0.7, fnoise(seed + 2, 0.7, lo=80)) * 0.18
    col_b = (rgb(paint) * (0.95 + 0.06 * (hash_id(bid, seed + 1) - 0.5)[..., None]))
    mort = rgb('#a9a69d')[None, None, :]
    alb = col_b * face[..., None] + mort * (1 - face[..., None])
    alb = alb * (1 - pores)[..., None] * (1 + 0.1 * rough_h[..., None])
    ao = cavity(h, 6, 0.8)
    return Mat(alb * ao[..., None], h, np.where(face > 0.5, 0.88, 0.97), 1.6, 5.0 if not split else 9.0, name=name, cat='wall')


def cmu_painted(seed=111):
    return _blocks(seed, False, 'cmu_painted', '#d9d5ca')


def cmu_split(seed=121):
    return _blocks(seed, True, 'cmu_split_face', '#b8b0a2')


def _rows(seed, tile_m, rows_h, wlo, whi, palette, mortar, name, gap=0.008, domed=0.5, grain=0.2):
    """courses of stones of random size: ledgestone. rows_h: row heights as fractions of the tile summing to 1."""
    n = N
    alb = np.tile(rgb(mortar)[None, None, :], (n, n, 1)).astype(np.float32) * 0.8
    h = np.full((n, n), 0.1, np.float32)
    r = rng(seed)
    pal = np.array([rgb(c) for c in palette], np.float32)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) / n
    y0 = 0.0
    for rh in rows_h:
        x0 = r.random() * 0.3
        widths = []
        tot = 0.0
        while tot < 1.0 - 1e-3:
            w = r.uniform(wlo, whi)
            if 1.0 - tot - w < wlo:
                w = 1.0 - tot
            widths.append(w)
            tot += w
        for w in widths:
            for sx in (-1, 0, 1):                                                # wrap the horizontal tile edge
                cx0 = x0 + sx
                if cx0 > 1 or cx0 + w < 0:
                    continue
                ia, ib = int(max(cx0, 0) * n), int(min(cx0 + w, 1) * n)
                ja, jb = int(y0 * n), int(min(y0 + rh, 1) * n)
                if ib <= ia or jb <= ja:
                    continue
                gx = (xx[ja:jb, ia:ib] - cx0) / w
                gy = (yy[ja:jb, ia:ib] - y0) / rh
                dx = np.minimum(gx, 1 - gx) * w
                dy = np.minimum(gy, 1 - gy) * rh
                d = np.minimum(dx, dy)
                m = sstep(gap, gap * 3.0, d)
                dome = np.sqrt(np.clip(1 - ((2 * gx - 1) ** 2 * 0.5 + (2 * gy - 1) ** 2 * 0.5), 0, 1))
                c = pal[r.integers(len(pal))] * r.uniform(0.85, 1.12)
                alb[ja:jb, ia:ib] = alb[ja:jb, ia:ib] * (1 - m[..., None]) + c * m[..., None]
                h[ja:jb, ia:ib] = np.where(m > 0.02, 0.25 + 0.5 * (1 - domed + domed * dome) * m, h[ja:jb, ia:ib])
            x0 += w
        y0 += rh
    g = fnoise(seed + 5, 1.2, lo=20) - 0.5
    alb = alb * (1 + 0.3 * grain * g[..., None])
    h = h + 0.05 * g
    ao = cavity(h, 5, 0.45)
    return Mat(alb * ao[..., None], h, 0.9 + 0.05 * g, tile_m, 7.0, name=name, cat='wall')


def stone_ledge(seed=131):
    rows = [0.1, 0.07, 0.12, 0.08, 0.1, 0.07, 0.11, 0.09, 0.08, 0.1, 0.08]
    rows = [r / sum(rows) for r in rows]
    return _rows(seed, 1.5, rows, 0.2, 0.42, ['#b3a58d', '#a59883', '#c0b49c', '#8f8574', '#b8a98c', '#9c8f7b'], '#8a8478', 'stone_ledgestone')


def stone_river(seed=141):
    f1, f2, ident = voronoi(seed, 9, jitter=0.7)
    d = f1 * 9.0                                                                 # 0 at a stone's centre, ~0.5 at the boundary
    cell = sstep(0.62, 0.42, d * (0.55 + 0.9 * hash_id(ident, seed)))            # stones of different size
    dome = np.sqrt(np.clip(1 - (d / 0.62) ** 2, 0, 1))
    pal = np.array([rgb(c) for c in ['#8d8a86', '#a39b90', '#7f7a74', '#b0a79a', '#6f6c68', '#9a8f80', '#857d72']], np.float32)
    pick = (hash_id(ident, seed + 1) * len(pal)).astype(int) % len(pal)
    alb = pal[pick] * (0.85 + 0.25 * hash_id(ident, seed + 2))[..., None] * (1 + 0.15 * (fnoise(seed + 3, 1.3, lo=20)[..., None] - 0.5))
    gap = rgb('#3a3731')[None, None, :]
    alb = alb * cell[..., None] + gap * (1 - cell[..., None])
    h = 0.1 + 0.9 * dome * cell
    return Mat(alb * cavity(h, 7, 0.55)[..., None], h, 0.62 + 0.3 * (1 - cell), 1.5, 8.0, name='stone_river_rock', cat='wall')


# ---------------------------------------------------------------- concrete, metal, wood
def concrete_panel(seed=151):
    x, y = grid()
    h = 0.25 * fnoise(seed, 2.4, lo=2, hi=40) + 0.12 * fnoise(seed + 1, 1.0, lo=60)
    pores = sstep(0.66, 0.74, fnoise(seed + 2, 0.5, lo=90))
    stain = 0.14 * sstep(0.45, 0.9, aniso_noise(seed + 3, 0.06, 1.0, 2.2)) + 0.07 * fnoise(seed + 4, 3.0, hi=8)
    reveal = np.maximum(1 - sstep(0.0, 0.005, np.minimum(x, 1 - x) % 0.5 if False else np.minimum(x, 1 - x)),
                        1 - sstep(0.0, 0.005, np.minimum(y, 1 - y)))
    tone = 0.80 + 0.06 * fnoise(seed + 5, 3.0, hi=6)
    alb = np.stack([tone * 0.8, tone * 0.8, tone * 0.78], -1) * (1 - stain - 0.4 * pores - 0.55 * reveal)[..., None]
    h = h - 0.55 * reveal - 0.1 * pores
    return Mat(alb * cavity(h, 4, 0.6)[..., None], h, 0.9 - 0.1 * (stain > 0.1), 2.4, 4.0, name='concrete_panel', cat='wall')


def concrete_smooth(seed=161):
    h = 0.2 * fnoise(seed, 2.6, lo=2, hi=30) + 0.08 * fnoise(seed + 1, 1.0, lo=80)
    pores = sstep(0.68, 0.76, fnoise(seed + 2, 0.5, lo=100))
    tone = 0.76 + 0.1 * fnoise(seed + 5, 3.0, hi=8) + 0.04 * (fnoise(seed + 6, 1.0, lo=40) - 0.5)
    alb = np.stack([tone * 0.82, tone * 0.82, tone * 0.8], -1) * (1 - 0.45 * pores)[..., None]
    return Mat(alb * cavity(h, 3, 0.4)[..., None], h - 0.1 * pores, 0.88, 2.0, 2.5, name='concrete_smooth', cat='wall')


def metal_corrugated(seed=171, ribs=16):
    x, y = grid()
    prof = 0.5 + 0.5 * np.sin(x * ribs * 2 * np.pi)
    n1 = fnoise(seed, 2.0, lo=2, hi=30)
    streak = aniso_noise(seed + 1, 0.05, 1.0, 1.8)
    tone = 0.70 + 0.08 * (n1 - 0.5) + 0.07 * (streak - 0.5)
    alb = np.stack([tone * 0.9, tone * 0.93, tone * 0.95], -1)
    alb = alb * (0.78 + 0.22 * prof)[..., None]
    rust = sstep(0.62, 0.85, fnoise(seed + 2, 2.4, lo=4, hi=30)) * 0.5 * (1 - prof * 0.4)
    alb = hsv_mix(alb, np.array([0.45, 0.24, 0.13], np.float32)[None, None, :] * (0.7 + 0.5 * n1[..., None]), rust)
    return Mat(alb, prof * 0.8 + 0.05 * n1, 0.38 + 0.4 * rust, 1.2, 6.0, metal=0.8, name='metal_corrugated', cat='wall')


def metal_seam(seed=181, pans=3):
    x, y = grid()
    u = (x * pans) % 1.0
    seam = np.exp(-((np.minimum(u, 1 - u)) / 0.018) ** 2)
    can = fnoise(seed, 2.2, lo=3, hi=14) - 0.5                                   # oil-canning ripples across a pan
    streak = aniso_noise(seed + 1, 0.05, 1.0, 1.8)
    tone = 0.74 + 0.05 * (streak - 0.5)
    alb = np.stack([tone * 0.92, tone * 0.93, tone * 0.94], -1) * (1 - 0.25 * seam + 0.06 * can)[..., None]
    return Mat(alb, 0.15 + 0.7 * seam + 0.05 * can, 0.34 + 0.12 * streak, 1.2, 6.0, metal=0.75, name='metal_standing_seam', cat='wall')


def wood_planks(seed=191, vertical=True, planks=8, base=('#8b6a47', '#6e5238'), weathered=0.0, name='wood_fence_cedar', tile=1.1):
    x, y = grid()
    a, b = (x, y) if vertical else (y, x)
    pid = np.floor(a * planks).astype(np.int32)
    u = (a * planks) % 1.0
    gap = 1 - sstep(0.0, 0.045, u) * sstep(0.0, 0.045, 1 - u)
    grain = aniso_noise(seed, 0.03, 1.0, 1.4) if vertical else aniso_noise(seed, 1.0, 0.03, 1.4)
    ring = 0.5 + 0.5 * np.sin((grain * 20 + a * planks * 0.5) * 2 * np.pi * 1.5)
    per = hash_id(pid, seed)
    tone = 0.75 + 0.35 * (per - 0.5) + 0.3 * (grain - 0.5)
    c0, c1 = rgb(base[0]), rgb(base[1])
    alb = hsv_mix(c0[None, None, :] * tone[..., None], c1[None, None, :] * tone[..., None], ring * 0.55)
    gray = np.stack([tone * 0.62, tone * 0.6, tone * 0.57], -1)
    alb = hsv_mix(alb, gray, weathered * (0.5 + 0.5 * grain))
    knots = sstep(0.8, 0.9, fnoise(seed + 3, 1.4, lo=8, hi=60)) * 0.45
    alb = alb * (1 - 0.8 * gap - knots)[..., None]
    h = 0.55 - 0.45 * gap + 0.07 * grain - 0.1 * knots
    return Mat(alb, h, 0.8 + 0.1 * (grain - 0.5), tile, 3.0, name=name, cat='wall')


def wood_fence(seed=191):
    return wood_planks(seed, True, 8, ('#9a7650', '#74573b'), 0.25, 'wood_fence_cedar', 1.1)


def wood_deck(seed=201):
    return wood_planks(seed, False, 8, ('#8a7156', '#6c5842'), 0.7, 'wood_deck_weathered', 1.2)


def trim_paint(seed=211):
    """flat painted trim: nearly white, a brush texture"""
    g = aniso_noise(seed, 1.0, 0.05, 1.6)
    h = 0.04 * g
    tone = 0.93 + 0.03 * (g - 0.5)
    return Mat(np.stack([tone, tone, tone * 0.985], -1), h, 0.45 + 0.08 * g, 1.0, 1.0, name='trim_paint', cat='wall')


WALLS = [stucco_fine, stucco_sand, stucco_lace, stucco_aged, plaster_smooth, siding_lap, siding_board_batten, siding_shiplap_wood,
         brick_red, brick_tan, brick_painted, cmu_painted, cmu_split, stone_ledge, stone_river, concrete_panel, concrete_smooth,
         metal_corrugated, metal_seam, wood_fence, wood_deck, trim_paint]
