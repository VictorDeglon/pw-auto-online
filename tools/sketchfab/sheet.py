# A contact sheet of fit previews for checking by eye (red ball = the car's front), numbered left to right, top to
# bottom; the numbers are printed with the file names.
#   blender -b --factory-startup --python tools/sketchfab/sheet.py -- <out.png> <columns> <preview.png> ...
import bpy, sys, numpy as np

args = sys.argv[sys.argv.index('--') + 1:]
out, cols, files = args[0], int(args[1]), args[2:]
W, H, PAD = 320, 240, 4
rows = (len(files) + cols - 1) // cols
sheet = np.ones(((H + PAD) * rows, (W + PAD) * cols, 4), np.float32)
DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
          '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111']
def stamp(img, n, x, y, s=4):  # a number in 3x5 blocks, black on white
    for k, ch in enumerate(str(n)):
        g = DIGITS[int(ch)]
        img[y - 2:y + 5 * s + 2, x + k * 4 * s - 2:x + k * 4 * s + 3 * s + 2] = (1, 1, 1, 1)
        for i in range(15):
            if g[i] == '1':
                r, c = i // 3, i % 3
                img[y + (4 - r) * s:y + (5 - r) * s, x + k * 4 * s + c * s:x + k * 4 * s + (c + 1) * s] = (0, 0, 0, 1)
for i, f in enumerate(files):
    try: im = bpy.data.images.load(f)
    except Exception: continue
    w, h = im.size
    px = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(px); px = px.reshape(h, w, 4)
    r, c = i // cols, i % cols
    y0 = (rows - 1 - r) * (H + PAD); x0 = c * (W + PAD)  # Blender images start at the bottom row
    sheet[y0:y0 + min(h, H), x0:x0 + min(w, W)] = px[:H, :W]
    stamp(sheet, i, x0 + 6, y0 + H - 30)
    bpy.data.images.remove(im)
img = bpy.data.images.new('sheet', sheet.shape[1], sheet.shape[0], alpha=True)
img.pixels.foreach_set(sheet.ravel()); img.filepath_raw = out; img.file_format = 'PNG'; img.save()
for i, f in enumerate(files): print(f'{i}\t{f}')
