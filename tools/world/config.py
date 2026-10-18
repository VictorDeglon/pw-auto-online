# The streamed outer world: Poway's data area (poway-data.js) plus 50 km on every side, cut into 2 km tiles.
# Game frame (same as poway-data.js): x east, z south, metres from ORIGIN, equirectangular with KX / KZ metres per degree.
import math, os

ORIGIN = (32.96, -117.035)            # lat, lon
KX, KZ = 93403.11204743062, 110540.0  # metres per degree of longitude / latitude (poway-data.js aerial.KX / KZ)
CORE = (-5968.9, -8391.4, 7460.9, 3275.1)   # poway-data.js bounds: the hand-built core, never re-generated here
RING = 50000.0                        # metres added on every side
TILE = 2000.0                         # tile edge (m)
BOUNDS = (CORE[0] - RING, CORE[1] - RING, CORE[2] + RING, CORE[3] + RING)
I0, J0 = math.floor(BOUNDS[0] / TILE), math.floor(BOUNDS[1] / TILE)
I1, J1 = math.floor(BOUNDS[2] / TILE), math.floor(BOUNDS[3] / TILE)
HCELL = 31.25                         # terrain grid spacing inside a tile (m): 65 x 65 posts
HN = int(TILE / HCELL) + 1
PHOTO_PX = 512                        # photo per tile (about 3.9 m a pixel)

DATA = os.path.expanduser(os.environ.get('PAO_WORLD_DATA', '~/.cache/pw-auto-online/world'))
RAW = os.path.join(DATA, 'raw')
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(REPO, 'assets', 'world')

def to_game(lat, lon):
    return (lon - ORIGIN[1]) * KX, -(lat - ORIGIN[0]) * KZ

def to_ll(x, z):
    return ORIGIN[0] - z / KZ, ORIGIN[1] + x / KX

def bbox_ll(pad=0.0):
    """(south, west, north, east) of the whole outer world, padded by pad metres."""
    s, w = to_ll(BOUNDS[0] - pad, BOUNDS[3] + pad)
    n, e = to_ll(BOUNDS[2] + pad, BOUNDS[1] - pad)
    return min(s, n), min(w, e), max(s, n), max(w, e)

def tiles():
    for j in range(J0, J1 + 1):
        for i in range(I0, I1 + 1):
            yield i, j

def tile_rect(i, j):
    return i * TILE, j * TILE, (i + 1) * TILE, (j + 1) * TILE

def in_core(x, z, margin=0.0):
    return CORE[0] - margin <= x <= CORE[2] + margin and CORE[1] - margin <= z <= CORE[3] + margin

# web-mercator slippy tiles
def ll_to_tile(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    lr = math.radians(lat)
    y = (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n
    return x, y

def tile_to_ll(x, y, z):
    n = 2 ** z
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon
