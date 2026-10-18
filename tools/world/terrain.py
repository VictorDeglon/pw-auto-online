# The terrarium z13 tiles (fetch.py terrain) as one height mosaic: metres above sea level at any lat / lon.
import math, os
import numpy as np
from PIL import Image
from config import RAW, ll_to_tile

Z = 13

class Terrain:
    def __init__(self):
        d = os.path.join(RAW, 'terrarium13')
        xy = [tuple(map(int, f[:-4].split('_'))) for f in os.listdir(d) if f.endswith('.png')]
        if not xy: raise SystemExit('no terrain tiles: run fetch.py terrain')
        self.x0, self.y0 = min(x for x, _ in xy), min(y for _, y in xy)
        nx, ny = max(x for x, _ in xy) - self.x0 + 1, max(y for _, y in xy) - self.y0 + 1
        self.h = np.zeros((ny * 256, nx * 256), np.float32)
        for x, y in xy:
            a = np.asarray(Image.open(os.path.join(d, f'{x}_{y}.png')).convert('RGB'), np.float32)
            self.h[(y - self.y0) * 256:(y - self.y0 + 1) * 256, (x - self.x0) * 256:(x - self.x0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768

    def px(self, lat, lon):
        n = 2 ** Z; lat = np.asarray(lat, np.float64); lon = np.asarray(lon, np.float64)
        x = (lon + 180) / 360 * n; lr = np.radians(lat); y = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / np.pi) / 2 * n
        return (x - self.x0) * 256 - 0.5, (y - self.y0) * 256 - 0.5

    def at(self, lat, lon):
        """bilinear height (m); lat / lon may be numpy arrays"""
        px, py = self.px(np.asarray(lat, np.float64), np.asarray(lon, np.float64))
        H, W = self.h.shape
        px = np.clip(px, 0, W - 1.001); py = np.clip(py, 0, H - 1.001)
        x0 = np.floor(px).astype(np.int64); y0 = np.floor(py).astype(np.int64); fx = px - x0; fy = py - y0
        h = self.h
        return (h[y0, x0] * (1 - fx) + h[y0, x0 + 1] * fx) * (1 - fy) + (h[y0 + 1, x0] * (1 - fx) + h[y0 + 1, x0 + 1] * fx) * fy

    def max_in(self, s, w, n, e):
        x0, y0 = self.px(n, w); x1, y1 = self.px(s, e)
        H, W = self.h.shape
        a = self.h[max(0, int(y0)):min(H, int(y1) + 2), max(0, int(x0)):min(W, int(x1) + 2)]
        return float(a.max()) if a.size else 0.0
