"""Contact sheet of materials: albedo, then lit with its normal map (light from the upper left), 2x2 tiles each."""
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from core import *


def lit(m, light=(-0.55, 0.55, 0.63)):
    nrm = normal_from_height(m.height, m.strength)
    L = np.array(light, np.float32); L /= np.linalg.norm(L)
    d = np.clip((nrm * L).sum(-1), 0, 1)[..., None]
    spec = np.clip((nrm * (L + np.array([0, 0, 1.0], np.float32)) / np.linalg.norm(L + np.array([0, 0, 1.0]))).sum(-1), 0, 1) ** (2 + 60 * (1 - m.rough))
    c = srgb_to_lin(m.albedo) * (0.25 + 1.1 * d) + (spec * (1 - m.rough) * 0.5)[..., None]
    return lin_to_srgb(c)


def sheet(mats, path, thumb=240, cols=6):
    f = ImageFont.load_default(size=14)
    rows = (len(mats) + cols - 1) // cols
    W, H = cols * (thumb * 2 + 8), rows * (thumb + 24)
    im = Image.new('RGB', (W, H), (24, 24, 26))
    d = ImageDraw.Draw(im)
    for i, m in enumerate(mats):
        x, y = (i % cols) * (thumb * 2 + 8), (i // cols) * (thumb + 24)
        for k, img in enumerate((m.albedo, lit(m))):
            t = np.tile(img, (2, 2, 1))[::2 * N // thumb if False else 1, ::1]
            t = Image.fromarray((np.clip(np.tile(img, (2, 2, 1)), 0, 1) * 255).astype(np.uint8)).resize((thumb, thumb), Image.LANCZOS)
            im.paste(t, (x + k * thumb + k * 4, y + 22))
        d.text((x + 4, y + 3), f'{m.name}  {m.tile} m', fill=(240, 220, 150), font=f)
    im.save(path, quality=90)
