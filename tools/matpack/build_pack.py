"""Builds the material pack the game loads (assets/mat/).

    python3 -I tools/matpack/build_pack.py [--out assets/mat] [--preview /tmp/sheet.jpg] [--no-write]    (needs numpy, scipy, pillow)

Every layer is a tileable material generated from noise and cell patterns (no downloaded scans, so there is nothing to
attribute). Each layer is written twice per resolution as two opaque images packed 4 x 4 per sheet:
    albedo  RGB   sRGB colour, ambient occlusion baked in
    nr      RGB   R,G = tangent-space normal x,y (OpenGL, z rebuilt in the shader), B = roughness
Metalness is per layer (manifest). Resolutions: albedo at 512 (Medium, High) and 1024 (Ultra), normal/roughness at 512 only. manifest.json lists the layers in order:
sheet s, cell (i % 4, i // 4 % 4) holds layer 16 * s + i.
"""
import argparse, json, os, sys, time
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import *
import walls, roofs, preview

ALL = walls.WALLS + roofs.ROOFS + roofs.GROUND + roofs.DETAILS
CELL = 4


def mean_lum(m):
    """Mean linear luminance of the albedo: the shader divides by it to turn a layer into a brightness pattern around 1."""
    a = np.clip(m.albedo, 0, 1)
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    return float((lin * np.array([0.3, 0.59, 0.11])).sum(-1).mean())


def to_images(m, size):
    nrm = normal_from_height(m.height, m.strength)
    alb = (np.clip(m.albedo, 0, 1) * 255 + 0.5).astype(np.uint8)
    nr = np.stack([nrm[..., 0] * 0.5 + 0.5, nrm[..., 1] * 0.5 + 0.5, m.rough], -1)
    nr = (np.clip(nr, 0, 1) * 255 + 0.5).astype(np.uint8)
    a, b = Image.fromarray(alb), Image.fromarray(nr)
    if size != alb.shape[0]:
        a, b = a.resize((size, size), Image.LANCZOS), b.resize((size, size), Image.LANCZOS)
    return a, b


def write_sheets(mats, out, size, quality, kinds=('albedo', 'nr')):
    per = CELL * CELL
    os.makedirs(out, exist_ok=True)
    total = 0
    for s in range((len(mats) + per - 1) // per):
        A = Image.new('RGB', (CELL * size, CELL * size), (128, 128, 128))
        B = Image.new('RGB', (CELL * size, CELL * size), (128, 128, 255))
        for i, m in enumerate(mats[s * per:(s + 1) * per]):
            a, b = to_images(m, size)
            x, y = (i % CELL) * size, (i // CELL) * size
            A.paste(a, (x, y)); B.paste(b, (x, y))
        for name, im in (('albedo', A), ('nr', B)):
            if name not in kinds:
                continue
            path = os.path.join(out, f'{name}{s}.webp')
            im.save(path, 'WEBP', quality=quality, method=6)
            total += os.path.getsize(path)
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='assets/mat')
    ap.add_argument('--no-write', action='store_true', help='just the preview')
    ap.add_argument('--preview', default='')
    ap.add_argument('--quality', type=int, default=88)
    args = ap.parse_args()
    mats = []
    for fn in ALL:
        t = time.time()
        m = fn()
        mats.append(m)
        print(f'{len(mats) - 1:2d} {m.name:24s} {m.cat:7s} {m.tile:4.2f} m  {time.time() - t:4.1f}s', flush=True)
    if args.preview:
        for k in range(0, len(mats), 24):
            preview.sheet(mats[k:k + 24], args.preview.replace('.jpg', f'-{k // 24}.jpg'))
    if args.no_write:
        return
    manifest = {
        'version': 1, 'cell': CELL, 'sizes': {'albedo': [512, 1024], 'nr': [512]},
        'layers': [{'id': m.name, 'cat': m.cat, 'tile': m.tile, 'metal': m.metal, 'tint': list(m.tint), 'strength': m.strength, 'mean': round(mean_lum(m), 4)} for m in mats],
    }
    sizes = {}
    for size in (512, 1024):    # the normal/roughness sheets are only needed at 512; Ultra loads 1024 albedo beside them
        kinds = ('albedo', 'nr') if size == 512 else ('albedo',)
        sizes[size] = write_sheets(mats, os.path.join(args.out, str(size)), size, args.quality, kinds)
        print(f'{size}: {sizes[size] / 1e6:.1f} MB in {(len(mats) + 15) // 16} sheets x {len(kinds)}')
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)


if __name__ == '__main__':
    main()
