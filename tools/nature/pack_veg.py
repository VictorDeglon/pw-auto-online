# Pack baked impostors + near LODs into game assets and write assets/nature/veg.json.
#   python pack_veg.py <bake_dir> <assets/nature dir> [species ...]
# bake_dir holds imp/<variant>_{alb,nrm}.png + imp/<variant>.json (bake_impostor.py) and lod/<variant>.glb
# (build_lod.py, or the procedural models). Each species gets one albedo atlas (RGBA, variants as blocks) and one
# half-resolution normal atlas; transparent texels are filled with the nearest opaque colour so mipmaps don't halo.
import json, os, shutil, subprocess, sys, math
import numpy as np
from PIL import Image
try:
    from scipy import ndimage
except ImportError:  # numpy-only fallback below
    ndimage = None

SPECIES = {  # species -> variant bake names (in atlas block order)
    'oak': ['oak'], 'olive': ['olive'], 'scruboak': ['scruboak'], 'slender': ['slender'], 'jacaranda': ['jacaranda'],
    'chapbig': ['chapbig_large', 'chapbig_medium', 'chapbig_small'],
    'chap': ['chap_a', 'chap_b', 'chap_c', 'chap_d'],
    'sage': ['sage_a', 'sage_b', 'sage_c', 'sage_d'],
    'palm_fan': ['palm_fan_a', 'palm_fan_b'], 'palm_date': ['palm_date_a'],
    'eucalyptus': ['eucalyptus_a', 'eucalyptus_b'],
    'opuntia': ['opuntia_a', 'opuntia_b'], 'yucca': ['yucca_a', 'yucca_b'], 'agave': ['agave_a'],
}
bake, out = sys.argv[1], sys.argv[2]
only = set(sys.argv[3:])
os.makedirs(os.path.join(out, 'imp'), exist_ok=True); os.makedirs(os.path.join(out, 'lod'), exist_ok=True)
man_path = os.path.join(out, 'veg.json')
manifest = json.load(open(man_path)) if os.path.exists(man_path) else {'species': {}}

def pad(rgb, alpha, G):
    """fill transparent texels of every frame cell with the nearest opaque texel of the same cell"""
    H = rgb.shape[0]; c = H // G; res = rgb.copy()
    for j in range(G):
        for i in range(G):
            sl = (slice(j * c, (j + 1) * c), slice(i * c, (i + 1) * c))
            a = alpha[sl] > 8
            if not a.any() or a.all(): continue
            if ndimage is not None:
                _, (iy, ix) = ndimage.distance_transform_edt(~a, return_indices=True)
                res[sl] = rgb[sl][iy, ix]
            else:
                res[sl] = grow(rgb[sl], a)
    return res

def shift(x, dy, dx):
    """x moved by (dy, dx), zeros where nothing moved in"""
    out = np.zeros_like(x); H, W = x.shape[:2]
    out[max(dy, 0):H + min(dy, 0), max(dx, 0):W + min(dx, 0)] = x[max(-dy, 0):H + min(-dy, 0), max(-dx, 0):W + min(-dx, 0)]
    return out

def grow(rgb, filled):
    """without scipy: opaque colour spread outward ring by ring (the mean of the filled neighbours), close to nearest fill"""
    img = rgb.astype(np.float32); filled = filled.copy()
    while not filled.all():
        acc = np.zeros_like(img); cnt = np.zeros(filled.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            f = shift(filled, dy, dx); acc += shift(img, dy, dx) * f[..., None]; cnt += f
        new = ~filled & (cnt > 0)
        if not new.any(): break
        img[new] = acc[new] / cnt[new][:, None]; filled |= new
    return img.astype(np.uint8)

def webp(arr, path, q, mode):
    tmp = path + '.png'; Image.fromarray(arr, mode).save(tmp)
    args = ['cwebp', '-quiet', '-q', str(q), '-m', '4', '-exact']
    if mode == 'RGBA': args += ['-alpha_q', '100']
    subprocess.run(args + [tmp, '-o', path], check=True); os.remove(tmp)

for sp, names in SPECIES.items():
    if only and sp not in only: continue
    have = [n for n in names if os.path.exists(os.path.join(bake, 'imp', n + '_alb.png'))]
    if not have: continue
    metas = [json.load(open(os.path.join(bake, 'imp', n + '.json'))) for n in have]
    G = metas[0]['G']; cell = metas[0]['cell']; S = G * cell
    bx = math.ceil(math.sqrt(len(have))); by = math.ceil(len(have) / bx)
    alb = np.zeros((by * S, bx * S, 4), np.uint8); nrm = np.zeros((by * S, bx * S, 3), np.uint8)
    variants = []
    for k, (n, m) in enumerate(zip(have, metas)):
        a = np.asarray(Image.open(os.path.join(bake, 'imp', n + '_alb.png')).convert('RGBA'))
        nn = np.asarray(Image.open(os.path.join(bake, 'imp', n + '_nrm.png')).convert('RGB'))
        assert a.shape[0] == S, (n, a.shape, S)
        bi, bj = k % bx, k // bx
        y0 = (by - 1 - bj) * S; x0 = bi * S    # block (bi, bj) counts from the bottom-left (texture v up)
        alb[y0:y0 + S, x0:x0 + S, :3] = pad(a[..., :3], a[..., 3], G); alb[y0:y0 + S, x0:x0 + S, 3] = a[..., 3]
        nrm[y0:y0 + S, x0:x0 + S] = pad(nn, a[..., 3], G)
        lod = None
        src = os.path.join(bake, 'lod', n + '.glb')
        if os.path.exists(src): shutil.copy(src, os.path.join(out, 'lod', n + '.glb')); lod = 'lod/' + n + '.glb'
        variants.append({'name': n, 'lod': lod, 'block': [bi, bj], 'center': [round(v, 4) for v in m['center']],
                         'radius': round(m['radius'], 4), 'height': round(m['height'], 3), 'width': round(m['width'], 3)})
    webp(alb, os.path.join(out, 'imp', sp + '_alb.webp'), 86, 'RGBA')
    half = np.asarray(Image.fromarray(nrm).resize((nrm.shape[1] // 2, nrm.shape[0] // 2), Image.LANCZOS))
    webp(half, os.path.join(out, 'imp', sp + '_nrm.webp'), 85, 'RGB')
    manifest['species'][sp] = {'atlas': 'imp/' + sp, 'G': G, 'cell': cell, 'blocks': [bx, by], 'variants': variants}
    print(sp, len(have), 'variants', f'{bx * S}x{by * S}', [os.path.getsize(os.path.join(out, 'imp', sp + s)) // 1024 for s in ('_alb.webp', '_nrm.webp')], 'KB')
json.dump(manifest, open(man_path, 'w'), indent=1)
