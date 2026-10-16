# Find granite boulders / outcrops in the aerial ground atlases and write data/boulders.js.
#   python detect_boulders.py <repo_dir> [preview.png tile_i tile_j x y size]
# Granite in NAIP reads as small bright, low-saturation specks with a dark shadow next to them, on otherwise
# darker scrub. We take local-contrast blobs of 1-60 texels (~2.4 m texels), reject green and saturated pixels,
# and record each blob's centre and size. Built-up areas, roads and roofs are filtered in-game at load time
# (src/nature/rocks.js) because that needs the building/road grids.
import json, math, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

repo = sys.argv[1]
s = open(os.path.join(repo, 'poway-data.js')).read(); D = json.loads(s[s.index('{'):s.rindex('}') + 1])
A = D['aerial']; gm = A['ground']; G = gm['size'] * gm['px']   # full-res aerial px per atlas (4096)
DEG = math.pi / 180

def aer_inv(px, py):  # aerial px -> lat, lon (same as index.html aerInv)
    mx = A['X0'] + px * A['PX']; my = A['Y1'] - py * A['PX']
    return (2 * math.atan(math.exp(my / A['R'])) - math.pi / 2) / DEG, mx / A['R'] / DEG

def detect(img):
    p = (np.asarray(img.convert('RGB'), np.float32) / 255.0) ** 2.2
    lum = p @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    mx, mn = p.max(-1), p.min(-1); sat = (mx - mn) / (mx + 1e-3)
    green = (p[..., 1] - np.maximum(p[..., 0], p[..., 2])) / (lum + 0.02)
    bg = ndimage.gaussian_filter(lum, 5); ctr = lum - bg
    # granite: a bright, grey speck on darker scrub WITH a shadow on its north-west side (NAIP sun is SE)
    # (the NAIP mosaic mixes flight lines, so the shadow can fall on any side)
    sh = np.full(lum.shape, False)
    for dy, dx in ((1, 1), (1, -1), (-1, 1), (-1, -1), (2, 2), (2, -2), (-2, 2), (-2, -2)):
        sh |= np.roll(np.roll(lum, dy, axis=0), dx, axis=1) < bg - 0.01
    cand = (ctr > 0.045) & (lum > 0.13) & (sat < 0.42) & (green < 0.09) & (bg < 0.19) & sh
    lab, n = ndimage.label(cand)
    if n == 0: return []
    idx = np.arange(1, n + 1)
    area = ndimage.sum(cand, lab, idx); com = ndimage.center_of_mass(cand, lab, idx)
    peak = ndimage.maximum(ctr, lab, idx)
    out = []
    for a, (cy, cx), pk in zip(area, com, peak):
        if a < 1 or a > 60: continue
        out.append((cx, cy, float(a), float(pk)))
    return out, cand

if len(sys.argv) > 2:   # preview: overlay detections on a crop
    out, ti, tj, x, y, sz = sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]), int(sys.argv[7])
    im = Image.open(os.path.join(repo, f'assets/ground/g_{ti}_{tj}.jpg')).crop((x, y, x + sz, y + sz))
    dets, cand = detect(im)
    from PIL import ImageDraw
    big = im.resize((sz * 2, sz * 2), Image.NEAREST).convert('RGB'); d = ImageDraw.Draw(big)
    for cx, cy, a, pk in dets:
        r = max(2, math.sqrt(a) * 1.4); d.ellipse([cx * 2 - r, cy * 2 - r, cx * 2 + r, cy * 2 + r], outline=(255, 40, 40))
    both = Image.new('RGB', (sz * 4, sz * 2)); both.paste(im.resize((sz * 2, sz * 2), Image.LANCZOS), (0, 0)); both.paste(big, (sz * 2, 0)); both.save(out)
    print(len(dets), 'detections'); sys.exit()

# offline masks on a 5 m grid: building footprints + 15 m, road corridors (asphalt + sidewalk + 3 m)
KX, KZ, LAT0, LON0 = A['KX'], A['KZ'], D['origin'][0], D['origin'][1]
MG, GX0, GZ0 = 5.0, -7000.0, -10000.0; NX, NZ = int(16500 / MG), int(14500 / MG)
mask = np.zeros((NZ, NX), bool)
def stamp_box(x0, z0, x1, z1):
    i0, i1 = max(0, int((x0 - GX0) / MG)), min(NX - 1, int((x1 - GX0) / MG)); j0, j1 = max(0, int((z0 - GZ0) / MG)), min(NZ - 1, int((z1 - GZ0) / MG))
    if i1 >= i0 and j1 >= j0: mask[j0:j1 + 1, i0:i1 + 1] = True
for b in D['buildings']:
    q = b[2]; xs, zs = q[0::2], q[1::2]; stamp_box(min(xs) - 15, min(zs) - 15, max(xs) + 15, max(zs) + 15)
for r in D['roads']:
    q, hw = r[3], r[2] / 2 + (5.5 if 1 <= r[1] <= 5 else 3)
    for k in range(0, len(q) - 2, 2):
        L = math.hypot(q[k + 2] - q[k], q[k + 3] - q[k + 1]); n = max(1, int(L / 3))
        for t in range(n + 1):
            x = q[k] + (q[k + 2] - q[k]) * t / n; z = q[k + 1] + (q[k + 3] - q[k + 1]) * t / n
            stamp_box(x - hw, z - hw, x + hw, z + hw)
def masked(lat, lon):
    x = (lon - LON0) * KX; z = -(lat - LAT0) * KZ
    i, j = int((x - GX0) / MG), int((z - GZ0) / MG)
    return not (0 <= i < NX and 0 <= j < NZ) or mask[j, i]
print('mask built', mask.mean().round(3), flush=True)
recs = []
for tj in range(gm['gny']):
    for ti in range(gm['gnx']):
        f = os.path.join(repo, f'assets/ground/g_{ti}_{tj}.jpg')
        if not os.path.exists(f): continue
        img = Image.open(f); k = G / img.width   # aerial px per atlas texel
        dets, _ = detect(img)
        for cx, cy, a, pk in dets:
            lat, lon = aer_inv(ti * G + cx * k, tj * G + cy * k)
            if pk < 0.06 or masked(lat, lon): continue
            size = min(9.0, 1.1 * math.sqrt(a) * k * A['PX'] * math.cos(lat * DEG))   # metres across
            recs.append((round(lat, 6), round(lon, 6), round(size, 1)))
        print(f'tile {ti},{tj}: {len(dets)} raw, {len(recs)} kept so far', flush=True)
os.makedirs(os.path.join(repo, 'data'), exist_ok=True)
with open(os.path.join(repo, 'data', 'boulders.js'), 'w') as fh:
    fh.write('// Granite boulders / outcrops detected in the NAIP aerial (tools/nature/detect_boulders.py).\n')
    fh.write('// [lat, lon, size_m] per record; built-up areas and road corridors are already masked out.\n')
    fh.write('(window.POWAY_EXTRA ||= {}).boulders = [\n')
    for r in recs: fh.write(f'[{r[0]},{r[1]},{r[2]}],\n')
    fh.write('];\n')
print(len(recs), 'boulders')
