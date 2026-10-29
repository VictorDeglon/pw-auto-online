# Downloads the CC0 scanned materials the game uses into assets/pbr/ as WebP:
#   <name>_c.webp (colour, sRGB), <name>_n.webp (normal, OpenGL), <name>_arm.webp (AO, roughness, metalness)
# Poly Haven (polyhaven.com, CC0) through its public API, ambientCG (ambientcg.com, CC0) as zips.
#   python3 tools/textures/fetch.py            (needs cwebp)
import json, os, subprocess, sys, tempfile, urllib.request, zipfile, io
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'assets', 'pbr')
UA = {'User-Agent': 'pw-auto-online texture fetch'}
# name -> (source, id, resolution)
SETS = {
  # roads, sidewalks, curbs, driveways
  'asphalt': ('ph', 'asphalt_02', '2k'), 'asphalt_old': ('ph', 'asphalt_04', '2k'),
  'concrete': ('ph', 'concrete_floor_worn_001', '2k'), 'concrete_stain': ('ph', 'concrete_floor_02', '1k'),
  # walls
  'stucco': ('ph', 'beige_wall_001', '2k'), 'stucco_rough': ('ph', 'white_stucco_02', '1k'),
  'tiltup': ('ph', 'concrete_wall_007', '1k'), 'brick': ('ph', 'red_bricks_02', '1k'), 'brick_painted': ('ph', 'painted_brick', '1k'),
  'siding': ('ph', 'weathered_plank_siding', '1k'), 'metal_wall': ('ph', 'corrugated_iron_02', '1k'),
  # roofs
  'roof_clay': ('ph', 'clay_roof_tiles_02', '2k'), 'roof_tile': ('ph', 'roof_tiles_14', '1k'), 'roof_shingle': ('ph', 'roof_07', '1k'),
  'roof_slate': ('ph', 'roof_09', '1k'), 'roof_flat': ('ph', 'bitumen', '1k'), 'gravel': ('ph', 'gravel_floor_02', '1k'),
  # ground
  'lawn': ('acg', 'Grass004', '2K'), 'lawn_dry': ('acg', 'Grass006', '1K'), 'dg': ('ph', 'dry_ground_rocks', '1k'),
  'trail': ('ph', 'rocky_trail', '1k'), 'litter': ('ph', 'forest_ground_04', '1k'), 'dirt': ('ph', 'dirt', '1k'), 'rock_gravel': ('ph', 'gravel_stones', '1k'),
  # bark, wood
  'bark_gum': ('ph', 'bark_bluegum', '1k'), 'bark_plane': ('ph', 'bark_platanus', '1k'), 'bark': ('ph', 'bark_brown_02', '1k'), 'wood': ('ph', 'wood_planks_grey', '1k'),
}
ATLAS = ['Foliage001', 'Foliage004', 'Foliage006', 'Foliage007', # scanned grass blades and wild-oat seed heads (colour + opacity)
         'LeafSet001', 'LeafSet002', 'LeafSet013', 'LeafSet020', 'LeafSet022', 'LeafSet024', 'LeafSet025'] # scanned leaves the tree generator builds twigs from

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r: return r.read()
def webp(src_bytes, dst, q=82, alpha=None):
    with tempfile.TemporaryDirectory() as td:
        a = os.path.join(td, 'in'); open(a, 'wb').write(src_bytes)
        subprocess.run(['cwebp', '-quiet', '-q', str(q), '-mt', a, '-o', dst], check=True)
def ph(name, aid, res):
    files = json.loads(get(f'https://api.polyhaven.com/files/{aid}'))
    for key, suf, q in (('Diffuse', 'c', 82), ('nor_gl', 'n', 90), ('arm', 'arm', 85)):
        m = files.get(key) or (files.get('Rough') if key == 'arm' else None)
        if not m: print('  no', key, 'for', aid); continue
        r = m.get(res) or m.get('1k'); url = (r.get('jpg') or r.get('png'))['url']
        webp(get(url), os.path.join(OUT, f'{name}_{suf}.webp'), q)
def acg(name, aid, res):
    z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={aid}_{res}-JPG.zip')))
    pick = lambda k: next((n for n in z.namelist() if k in n), None)
    for k, suf, q in (('_Color', 'c', 82), ('_NormalGL', 'n', 90), ('_Roughness', 'r', 85)):
        n = pick(k)
        if n: webp(z.read(n), os.path.join(OUT, f'{name}_{suf}.webp'), q)
def atlas(aid):
    z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={aid}_1K-PNG.zip')))
    for n in z.namelist():
        if n.endswith('.png') and ('_Color' in n or '_Opacity' in n):
            k = 'c' if '_Color' in n else 'a'
            open(os.path.join(OUT, 'atlas', f'{aid.lower()}_{k}.png'), 'wb').write(z.read(n))

if __name__ == '__main__':
    os.makedirs(os.path.join(OUT, 'atlas'), exist_ok=True)
    only = set(sys.argv[1:])
    for name, (src, aid, res) in SETS.items():
        if only and name not in only: continue
        if os.path.exists(os.path.join(OUT, f'{name}_c.webp')) and not only: continue
        print(name, '<-', src, aid, res, flush=True)
        try: (ph if src == 'ph' else acg)(name, aid, res)
        except Exception as e: print('  failed:', e)
    for aid in ATLAS:
        if only and aid not in only: continue
        if os.path.exists(os.path.join(OUT, 'atlas', f'{aid.lower()}_c.png')) and not only: continue
        print('atlas', aid, flush=True)
        try: atlas(aid)
        except Exception as e: print('  failed:', e)
