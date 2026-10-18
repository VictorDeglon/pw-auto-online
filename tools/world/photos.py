#!/usr/bin/env python3
# raw/usgs15 (web-mercator z15 photo tiles) -> assets/world/p/<i>_<j>.jpg, each tile's photo in game coordinates
# (512 px for 2 km), and assets/world/overview.jpg (the whole outer world at about 62 m a pixel, for the big map).
# Usage: photos.py [only i,j]
import math, os, sys, time
import numpy as np
from PIL import Image
from config import *

Z = 15
SRC = os.path.join(RAW, 'usgs15')
cache = {}
def src_tile(x, y):
    k = (x, y)
    if k not in cache:
        p = os.path.join(SRC, f'{x}_{y}.jpg')
        try: cache[k] = np.asarray(Image.open(p).convert('RGB'), np.float32) if os.path.exists(p) else None
        except Exception: cache[k] = None
        if len(cache) > 400: cache.pop(next(iter(cache)))
    return cache[k]

def tile_photo(i, j):
    x0, z0, x1, z1 = tile_rect(i, j); n = PHOTO_PX
    u = (np.arange(n) + 0.5) / n
    X = x0 + u * TILE; Zg = z0 + u * TILE
    lon = ORIGIN[1] + X / KX; lat = ORIGIN[0] - Zg / KZ
    gx = (lon + 180) / 360 * (2 ** Z) * 256                     # global mercator pixel, columns
    lr = np.radians(lat); gy = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * (2 ** Z) * 256  # rows
    tx0, tx1 = int(gx.min() // 256), int(gx.max() // 256); ty0, ty1 = int(gy.min() // 256), int(gy.max() // 256)
    mos = np.full(((ty1 - ty0 + 2) * 256, (tx1 - tx0 + 2) * 256, 3), np.nan, np.float32)
    got = 0
    for ty in range(ty0, ty1 + 2):
        for tx in range(tx0, tx1 + 2):
            a = src_tile(tx, ty)
            if a is not None:
                a = a.copy(); a[a.max(axis=2) < 10] = np.nan # black = no imagery here (south of the border, gaps)
                mos[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = a; got += 1
    if not got: return None
    px = gx - tx0 * 256 - 0.5; py = gy - ty0 * 256 - 0.5
    PX, PY = np.meshgrid(px, py)
    xa = np.clip(np.floor(PX).astype(int), 0, mos.shape[1] - 2); ya = np.clip(np.floor(PY).astype(int), 0, mos.shape[0] - 2)
    fx = (PX - xa)[..., None]; fy = (PY - ya)[..., None]
    img = (mos[ya, xa] * (1 - fx) + mos[ya, xa + 1] * fx) * (1 - fy) + (mos[ya + 1, xa] * (1 - fx) + mos[ya + 1, xa + 1] * fx) * fy
    hole = np.isnan(img).any(axis=2)
    if hole.mean() > 0.5 and not sea_mostly(i, j): return None # land with no imagery: the game paints procedural ground
    if hole.all(): return None
    img[hole] = (38, 66, 92) # open water where no photo was fetched
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))

_T = None
def sea_mostly(i, j):
    global _T
    if _T is None:
        from terrain import Terrain; _T = Terrain()
    x0, z0, x1, z1 = tile_rect(i, j); xs = np.linspace(x0, x1, 9); zs = np.linspace(z0, z1, 9); X, Zg = np.meshgrid(xs, zs)
    return float((_T.at(ORIGIN[0] - Zg / KZ, ORIGIN[1] + X / KX) <= 0).mean()) > 0.5

def main(args):
    os.makedirs(os.path.join(OUT, 'p'), exist_ok=True)
    only = tuple(int(v) for v in args[args.index('only') + 1].split(',')) if 'only' in args else None
    t0 = time.time(); n = 0
    ni, nj = I1 - I0 + 1, J1 - J0 + 1; S = 32
    ov = Image.new('RGB', (ni * S, nj * S), (24, 44, 62))
    for j in range(J0, J1 + 1):
        for i in range(I0, I1 + 1):
            if only and (i, j) != only: continue
            if not os.path.exists(os.path.join(OUT, 't', f'{i}_{j}.json')): continue
            path = os.path.join(OUT, 'p', f'{i}_{j}.jpg')
            if os.path.exists(path) and not only: im = Image.open(path).convert('RGB')
            else:
                im = tile_photo(i, j)
                if im is None: continue
                im.save(path, quality=72, optimize=True)
            ov.paste(im.resize((S, S), Image.LANCZOS), ((i - I0) * S, (j - J0) * S))
            n += 1
            if n % 200 == 0: print(f'{n} photos {time.time() - t0:.0f}s', flush=True)
    if not only:
        ov.save(os.path.join(OUT, 'overview.jpg'), quality=80, optimize=True)
        # index: bit 4 = this tile has a photo (so the game never asks for one that isn't there)
        import json
        ip = os.path.join(OUT, 'index.json'); idx = json.load(open(ip))
        for k in idx['tiles']: idx['tiles'][k] = (idx['tiles'][k] & 3) | (4 if os.path.exists(os.path.join(OUT, 'p', k + '.jpg')) else 0)
        json.dump(idx, open(ip, 'w'), separators=(',', ':'))
    print('photos', n, f'{time.time() - t0:.0f}s')

if __name__ == '__main__': main(sys.argv[1:])
