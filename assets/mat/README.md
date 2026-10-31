# Generated materials

Tileable materials made by `tools/matpack` (`python3 -I tools/matpack/build_pack.py`, needs numpy, scipy and pillow)
from noise and cell patterns: no downloaded scans, nothing to attribute. `manifest.json` lists the layers (metres per
repeat, metalness, mean brightness); `512/albedo*.webp` (sRGB, ambient occlusion baked in) and `512/nr*.webp` (normal
x, y and roughness) pack them 4 x 4 per sheet. The walls use them through `src/world/wallarr.js`.
