"""Shared building blocks for the material pack: tileable noise, cell patterns, and turning a height field plus colours into
albedo / normal / roughness maps. Everything wraps (tiles seamlessly) because it is built from FFT noise and modular maths."""
import numpy as np
from scipy import ndimage

N = 1024  # master resolution of one layer (shipped at 1024 and 512)


def rng(seed):
    return np.random.default_rng(seed)


def fnoise(seed, beta=2.0, n=N, lo=0, hi=None):
    """Tileable noise with a 1/f^beta spectrum, normalised to 0..1. beta 1 = busy, 2 = cloudy, 3 = smooth blobs.
    lo / hi: keep only frequencies (cycles per tile) in [lo, hi]."""
    r = rng(seed)
    fx = np.fft.fftfreq(n)[:, None] * n
    fy = np.fft.rfftfreq(n)[None, :] * n
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = 1.0 / f ** (beta / 2)
    amp[0, 0] = 0
    if lo:
        amp *= (f >= lo)
    if hi:
        amp *= (f <= hi)
    spec = amp * (r.normal(size=(n, n // 2 + 1)) + 1j * r.normal(size=(n, n // 2 + 1)))
    a = np.fft.irfft2(spec, s=(n, n))
    a -= a.min()
    return a / max(a.max(), 1e-9)


def grid(n=N):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32) / n
    return x, y


def smooth(a, s):
    """gaussian blur that wraps"""
    return ndimage.gaussian_filter(a, s, mode='wrap')


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def voronoi(seed, cells, n=N, jitter=0.85):
    """Tileable voronoi: returns (F1 distance, F2 distance, id) in tile units, cells = points per side."""
    r = rng(seed)
    g = np.arange(cells)
    px = (g[None, :] + 0.5 + (r.random((cells, cells)) - 0.5) * jitter) / cells
    py = (g[:, None] + 0.5 + (r.random((cells, cells)) - 0.5) * jitter) / cells
    x, y = grid(n)
    f1 = np.full((n, n), 9.0, np.float32)
    f2 = np.full((n, n), 9.0, np.float32)
    ident = np.zeros((n, n), np.int32)
    # brute force over the 3x3 neighbourhood of each pixel's own cell
    cx = np.minimum((x * cells).astype(int), cells - 1)
    cy = np.minimum((y * cells).astype(int), cells - 1)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ix = (cx + dx) % cells
            iy = (cy + dy) % cells
            qx = px[iy, ix] + np.where(cx + dx < 0, -1, np.where(cx + dx >= cells, 1, 0))
            qy = py[iy, ix] + np.where(cy + dy < 0, -1, np.where(cy + dy >= cells, 1, 0))
            d = np.sqrt((x - qx) ** 2 + (y - qy) ** 2)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            ident = np.where(closer, iy * cells + ix, ident)
            f1 = np.where(closer, d, f1)
    return f1, f2, ident


def hash_id(ident, seed=0):
    """stable pseudo random 0..1 per integer id"""
    h = (ident.astype(np.uint32) * np.uint32(2654435761) + np.uint32(seed * 40503 + 12345)) & np.uint32(0xFFFFFFFF)
    h ^= h >> 15
    h = (h * np.uint32(2246822519)) & np.uint32(0xFFFFFFFF)
    h ^= h >> 13
    return (h & np.uint32(0xFFFFFF)).astype(np.float32) / float(0xFFFFFF)


def normal_from_height(h, strength=4.0, wrap=True):
    """tangent-space normal (x right, y up, OpenGL style like three.js) from a height field in 0..1. strength ~ slope per tile."""
    mode = 'wrap' if wrap else 'nearest'
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * h.shape[1]
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * h.shape[0]
    nx, ny = -dx * strength / h.shape[1] * 4, dy * strength / h.shape[0] * 4   # image y runs down; GL normal y runs up
    nz = np.ones_like(nx)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / ln, ny / ln, nz / ln], -1)


def cavity(h, radius=6, amount=0.6):
    """cheap ambient occlusion from a height field: darker where the surface sits below its blurred surroundings"""
    d = smooth(h, radius) - h
    return np.clip(1 - amount * np.clip(d * 6, 0, 1), 0, 1)


def hsv_mix(a, b, t):
    t = np.asarray(t)[..., None] if np.ndim(t) == 2 else t
    return a * (1 - t) + b * t


def rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


class Mat:
    """What a generator returns: albedo (sRGB 0..1, HxWx3, cavity already baked in), normal (HxWx3 -1..1), roughness (HxW),
    plus the tile size in metres and a default tint."""
    def __init__(self, albedo, height, rough, tile, strength=4.0, metal=0.0, tint=(1, 1, 1), ao=None, name='', cat=''):
        self.albedo = np.clip(albedo, 0, 1).astype(np.float32)
        self.height = np.broadcast_to(height, self.albedo.shape[:2]).astype(np.float32)
        self.rough = np.broadcast_to(np.clip(rough, 0.04, 1), self.height.shape).astype(np.float32)
        self.tile, self.strength, self.metal, self.tint, self.name, self.cat = tile, strength, metal, tint, name, cat
        self.ao = ao
