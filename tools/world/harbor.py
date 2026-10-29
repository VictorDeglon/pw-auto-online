#!/usr/bin/env python3
# San Diego's waterfront from the OpenStreetMap extract fetch.py downloaded (raw/socal.osm.pbf), inside the outer world:
# marina docks down to their fingers, the fixed piers (Crystal Pier, Ocean Beach, Scripps, Oceanside...), breakwaters
# and jetties, the marinas' outlines. Writes assets/world/harbor.json (game frame, metres):
#   { docks:   [[width, floating, water, x, z, x, z, ...], ...]   walkways and fingers (width 0: not mapped)
#     decks:   [[water, x, z, x, z, ...], ...]                     piers mapped as areas
#     breaks:  [[width, water, x, z, ...], ...]                    breakwaters and jetties as lines (areas outlined)
#     marinas: [[name, x, z, x, z, ...], ...] }
# water: the surface's elevation in metres from the terrain tiles (0: the sea; a lake's own level otherwise). The game builds
# them in src/world/harbor.js. Needs osmium-tool and the terrain tiles (fetch.py terrain), numpy and pillow (README).
import json, os, subprocess, sys, tempfile
from config import RAW, OUT, BOUNDS, to_game, to_ll, bbox_ll
from terrain import Terrain

def num(v, d):
    try: return float(str(v).replace('m', '').strip())
    except Exception: return d

def run():
    src = os.path.join(RAW, 'socal.osm.pbf')
    if not os.path.exists(src): sys.exit(f'missing {src}: run fetch.py osm first')
    s, w, n, e = bbox_ll(2000)
    with tempfile.TemporaryDirectory() as tmp:
        box, flt, js = (os.path.join(tmp, f) for f in ('box.osm.pbf', 'harbor.osm.pbf', 'harbor.geojsonseq'))
        subprocess.run(['osmium', 'extract', '-b', f'{w},{s},{e},{n}', src, '-o', box, '--overwrite'], check=True)
        subprocess.run(['osmium', 'tags-filter', box, 'nwr/leisure=marina', 'nwr/man_made=pier,breakwater,groyne', '-o', flt, '--overwrite'], check=True)
        subprocess.run(['osmium', 'export', flt, '-f', 'geojsonseq', '-o', js, '--overwrite'], check=True)
        feats = [json.loads(l.strip().lstrip('\x1e')) for l in open(js) if l.strip()]
    inside = lambda x, z: BOUNDS[0] <= x <= BOUNDS[2] and BOUNDS[1] <= z <= BOUNDS[3]
    T = Terrain()
    def water(pts): # the surface under the middle of a feature: under 8 m is the sea
        n = len(pts) // 2; x = sum(pts[0::2]) / n; z = sum(pts[1::2]) / n; lat, lon = to_ll(x, z); h = float(T.at(lat, lon))
        return 0 if h < 8 else round(h, 1) # (the 16 m terrain smears the shore: a dock reads a few metres up)
    def xz(coords):
        out = []
        for lon, lat in coords: x, z = to_game(lat, lon); out += [round(x, 1), round(z, 1)]
        return out
    rings = lambda g: [g['coordinates'][0]] if g['type'] == 'Polygon' else [p[0] for p in g['coordinates']] if g['type'] == 'MultiPolygon' else []
    docks, decks, breaks, marinas = [], [], [], []
    for f in feats:
        p, g = f['properties'], f['geometry']
        if p.get('leisure') == 'marina':
            for r in rings(g):
                pts = xz(r[:-1])
                if any(inside(pts[i], pts[i + 1]) for i in range(0, len(pts), 2)): marinas.append([p.get('name', '')] + pts)
            continue
        mm = p.get('man_made')
        if mm == 'pier':
            if g['type'] == 'LineString':
                pts = xz(g['coordinates'])
                if any(inside(pts[i], pts[i + 1]) for i in range(0, len(pts), 2)): docks.append([num(p.get('width'), 0), 1 if p.get('floating') == 'yes' else 0, water(pts)] + pts)
            else:
                for r in rings(g):
                    pts = xz(r[:-1])
                    if any(inside(pts[i], pts[i + 1]) for i in range(0, len(pts), 2)): decks.append([water(pts)] + pts)
        elif mm in ('breakwater', 'groyne'):
            lines = [g['coordinates']] if g['type'] == 'LineString' else rings(g)
            for c in lines:
                pts = xz(c)
                if any(inside(pts[i], pts[i + 1]) for i in range(0, len(pts), 2)): breaks.append([num(p.get('width'), 8 if g['type'] == 'LineString' else 0), water(pts)] + pts)
    out = os.path.join(OUT, 'harbor.json')
    with open(out, 'w') as fh: json.dump({'docks': docks, 'decks': decks, 'breaks': breaks, 'marinas': marinas}, fh, separators=(',', ':'))
    print(f'{len(docks)} docks, {len(decks)} pier decks, {len(breaks)} breakwaters, {len(marinas)} marinas -> {out} ({os.path.getsize(out) // 1024} KB)')

if __name__ == '__main__':
    run()
