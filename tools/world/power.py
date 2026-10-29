#!/usr/bin/env python3
# The power grid where it really runs: transmission and sub-transmission lines with their towers and poles, and the
# substations, from the OpenStreetMap extract fetch.py downloaded (raw/socal.osm.pbf), inside the outer world's bounds.
# Writes assets/world/power.json (game frame, metres):
#   { lines: [[kv, circuits, kind, [x, z, support, ...]], ...],   kind 0 line, 1 minor line
#     subs:  [[x, z, x, z, ...], ...] }                            substation fences
#   support per vertex: 0 a bend, 1 lattice tower, 2 pole (steel or wood, see the kv), 3 portal (a substation gantry)
# Street distribution lines are mostly not in OpenStreetMap; the game lays those along the roads itself (src/world/power.js).
# Needs osmium-tool (brew install osmium-tool). Usage: power.py
import json, os, subprocess, sys, tempfile
from config import RAW, OUT, BOUNDS, to_game, bbox_ll

def run():
    src = os.path.join(RAW, 'socal.osm.pbf')
    if not os.path.exists(src): sys.exit(f'missing {src}: run fetch.py osm first')
    s, w, n, e = bbox_ll(2000)
    with tempfile.TemporaryDirectory() as tmp:
        box, flt, js = (os.path.join(tmp, f) for f in ('box.osm.pbf', 'power.osm.pbf', 'power.geojsonseq'))
        subprocess.run(['osmium', 'extract', '-b', f'{w},{s},{e},{n}', src, '-o', box, '--overwrite'], check=True)
        subprocess.run(['osmium', 'tags-filter', box, 'nw/power=line,minor_line,tower,pole,portal,substation', '-o', flt, '--overwrite'], check=True)
        subprocess.run(['osmium', 'export', flt, '-f', 'geojsonseq', '-o', js, '--overwrite'], check=True)
        feats = [json.loads(l.strip().lstrip('\x1e')) for l in open(js) if l.strip()]
    sup = {}
    for f in feats:
        p, g = f['properties'], f['geometry']
        if g['type'] == 'Point' and p.get('power') in ('tower', 'pole', 'portal'):
            sup[tuple(g['coordinates'])] = {'tower': 1, 'pole': 2, 'portal': 3}[p['power']]
    inside = lambda x, z: BOUNDS[0] <= x <= BOUNDS[2] and BOUNDS[1] <= z <= BOUNDS[3]
    lines, subs = [], []
    for f in feats:
        p, g = f['properties'], f['geometry']
        kind = p.get('power')
        if kind in ('line', 'minor_line') and g['type'] == 'LineString':
            if p.get('location') in ('underground', 'underwater') or p.get('layer', '0').startswith('-'): continue
            volts = [int(v) for v in str(p.get('voltage', '')).replace(',', ';').split(';') if v.strip().isdigit()]
            kv = max(volts) // 1000 if volts else (12 if kind == 'minor_line' else 0)
            circ = p.get('circuits', '')
            circ = int(circ) if circ.isdigit() else (2 if p.get('cables', '').isdigit() and int(p['cables']) >= 6 else 1)
            pts = []
            for lon, lat in g['coordinates']:
                x, z = to_game(lat, lon); pts += [round(x, 1), round(z, 1), sup.get((lon, lat), 0)]
            if not any(inside(pts[i], pts[i + 1]) for i in range(0, len(pts), 3)): continue
            if kv == 0: kv = 138 if any(pts[i + 2] == 1 for i in range(0, len(pts), 3)) else 69 # untagged: towers carry the bigger lines
            lines.append([kv, circ, 1 if kind == 'minor_line' else 0, pts])
        elif kind == 'substation' and g['type'] in ('Polygon', 'MultiPolygon'):
            ring = g['coordinates'][0] if g['type'] == 'Polygon' else g['coordinates'][0][0]
            pts = []
            for lon, lat in ring[:-1]:
                x, z = to_game(lat, lon); pts += [round(x, 1), round(z, 1)]
            if any(inside(pts[i], pts[i + 1]) for i in range(0, len(pts), 2)): subs.append(pts)
    out = os.path.join(OUT, 'power.json')
    with open(out, 'w') as fh: json.dump({'lines': lines, 'subs': subs}, fh, separators=(',', ':'))
    nsup = sum(1 for l in lines for i in range(2, len(l[3]), 3) if l[3][i])
    print(f'{len(lines)} lines, {nsup} supports, {len(subs)} substations -> {out} ({os.path.getsize(out) // 1024} KB)')

if __name__ == '__main__':
    run()
