# Stack the ground detail layers into two 1024 x (1024*N) atlases for a WebGL2 texture array.
#   python pack_ground.py <rawtex_dir> <out_dir>
# ground_alb.webp: RGB colour, A height (for height-blended transitions); ground_nrm.webp: OpenGL normal.
# Prints the per-layer mean colour (linear) that src/nature-ground.js divides by.
import json, os, subprocess, sys
import numpy as np
from PIL import Image
raw, out = sys.argv[1], sys.argv[2]
LAYERS = [  # name, colour, normal, height   (all CC0: Poly Haven / ambientCG)
    ('soil',   'gravelly_sand/gravelly_sand_diff_1k.jpg', 'gravelly_sand/gravelly_sand_nor_gl_1k.jpg', 'gravelly_sand/gravelly_sand_disp_1k.jpg'),
    ('dry',    'Grass003/Grass003_1K-JPG_Color.jpg', 'Grass003/Grass003_1K-JPG_NormalGL.jpg', 'Grass003/Grass003_1K-JPG_Displacement.jpg'),
    ('lawn',   'Grass004/Grass004_1K-JPG_Color.jpg', 'Grass004/Grass004_1K-JPG_NormalGL.jpg', 'Grass004/Grass004_1K-JPG_Displacement.jpg'),
    ('litter', 'Ground023/Ground023_1K-JPG_Color.jpg', 'Ground023/Ground023_1K-JPG_NormalGL.jpg', 'Ground023/Ground023_1K-JPG_Displacement.jpg'),
    ('rock',   'rock_boulder_dry/rock_boulder_dry_diff_1k.jpg', 'rock_boulder_dry/rock_boulder_dry_nor_gl_1k.jpg', 'rock_boulder_dry/rock_boulder_dry_disp_1k.jpg'),
]
S = 1024
def load(p, mode): return np.asarray(Image.open(os.path.join(raw, p)).convert(mode).resize((S, S), Image.LANCZOS))
alb, nrm, means = [], [], {}
for name, c, n, h in LAYERS:
    col = load(c, 'RGB'); hgt = load(h, 'L').astype(np.float32)
    hgt = (hgt - hgt.min()) / max(1, hgt.max() - hgt.min()) * 255   # stretch so every layer uses the full height range
    alb.append(np.dstack([col, hgt.astype(np.uint8)])); nrm.append(load(n, 'RGB'))
    lin = (col / 255.0) ** 2.2; means[name] = [round(float(v), 4) for v in lin.reshape(-1, 3).mean(0)]
os.makedirs(out, exist_ok=True)
Image.fromarray(np.vstack(alb), 'RGBA').save('/tmp/_alb.png'); Image.fromarray(np.vstack(nrm), 'RGB').save('/tmp/_nrm.png')
subprocess.run(['cwebp', '-quiet', '-q', '90', '-alpha_q', '100', '-exact', '/tmp/_alb.png', '-o', os.path.join(out, 'ground_alb.webp')], check=True)
subprocess.run(['cwebp', '-quiet', '-q', '92', '/tmp/_nrm.png', '-o', os.path.join(out, 'ground_nrm.webp')], check=True)
print(json.dumps({'layers': [l[0] for l in LAYERS], 'mean': means}))
