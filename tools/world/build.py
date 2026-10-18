#!/usr/bin/env python3
# work/osm.pickle + terrain + photos -> assets/world/ (the streamed outer world):
#   index.json          tile grid, which tiles exist, region-wide lists (POIs, places)
#   t/<i>_<j>.json      one 2 km tile: terrain posts, roads (graph edges), buildings, trees, POIs, signals, stops, crossings
#   p/<i>_<j>.jpg       the tile's aerial photo (USGS / NAIP, public domain), 512 px
# Coordinates in tiles are decimetres from the tile's corner. Anything inside the hand-built core (poway-data.js)
# is left out: the core already has it, and the game snaps the outer roads to the core's at the seam.
# Usage: build.py [roads] [photos] [only i,j]   (no arguments: everything)
import json, math, os, pickle, re, sys, time
from collections import defaultdict
import numpy as np
from config import *
from terrain import Terrain

work = os.path.join(DATA, 'work')
T0 = time.time()
def log(*a): print(f'{time.time() - T0:6.0f}s', *a, flush=True)

# ------------------------------------------------------------------ road classes
# game road types (poway-data.js): 0 freeway, 1 arterial, 2 major, 3 collector, 4 local, 5 service, 6 path / track
TYPE = {'motorway': 0, 'motorway_link': 0, 'trunk': 1, 'trunk_link': 1, 'primary': 1, 'primary_link': 1, 'secondary': 2, 'secondary_link': 2,
        'tertiary': 3, 'tertiary_link': 3, 'unclassified': 4, 'residential': 4, 'living_street': 4, 'road': 4, 'service': 5,
        'track': 6, 'path': 6, 'footway': 6, 'cycleway': 6, 'pedestrian': 6, 'bridleway': 6}
LANES = {'motorway': 4, 'trunk': 3, 'primary': 4, 'secondary': 4, 'tertiary': 2, 'unclassified': 2, 'residential': 2, 'living_street': 2, 'road': 2, 'service': 1}
MPH = {0: 65, 1: 45, 2: 40, 3: 35, 4: 25, 5: 15, 6: 10}

# way records from osm.py: (id, highway, name, ref, lanes, oneway, maxspeed, bridge, tunnel, service, footway, ids, xs, zs)
WID, WHW, WNAME, WREF, WLANES, WONEWAY, WMAX, WBRIDGE, WTUNNEL, WSERVICE, WFOOT, WIDS, WXS, WZS = range(14)
def keep_way(w):
    hw = w[WHW]
    if hw == 'footway' and w[WFOOT] in ('sidewalk', 'crossing'): return False
    if hw == 'service' and w[WSERVICE] in ('parking_aisle', 'driveway', 'drive-through', 'emergency_access'): return False
    if hw in ('steps',): return False
    if w[WTUNNEL] in ('yes', 'building_passage', 'culvert') and hw not in ('motorway', 'trunk', 'primary'): return False
    return hw in TYPE

def width_of(w, t, oneway):
    try: lanes = int(re.match(r'\d+', w[WLANES]).group())
    except Exception: lanes = None
    base = w[WHW].replace('_link', '')
    if lanes is None:
        lanes = LANES.get(base, 1 if t >= 5 else 2)
        if w[WHW].endswith('_link'): lanes = 1 if oneway else 2
        elif oneway and t <= 2: lanes = max(2, lanes // 2 + (1 if t == 0 else 0))
    if t == 6: return 3.0 if w[WHW] in ('path', 'footway', 'cycleway', 'bridleway') else 4.0
    lw = 3.7 if t == 0 else 3.4 if t <= 2 else 3.2
    shoulder = 3.0 if t == 0 else 1.6 if t <= 2 else 1.0 if t <= 4 else 0.4
    return round(min(lanes, 8) * lw + shoulder, 1)

def mph_of(w, t):
    m = re.match(r'(\d+)', w[WMAX] or '')
    if m: v = int(m.group(1)); return round(v / 1.609) if 'mph' not in w[WMAX] and v > 70 else v
    return MPH[t]

# ------------------------------------------------------------------ the core: what's already in poway-data.js
def load_core():
    s = open(os.path.join(REPO, 'poway-data.js')).read()
    D = json.loads(s[s.index('{'):s.rindex('}') + 1])
    segs = defaultdict(list) # 20 m grid of core road segments
    for r in D['roads']:
        p = r[3]
        for k in range(0, len(p) - 2, 2):
            ax, az, bx, bz = p[k], p[k + 1], p[k + 2], p[k + 3]
            for gx in range(math.floor((min(ax, bx) - 12) / 20), math.floor((max(ax, bx) + 12) / 20) + 1):
                for gz in range(math.floor((min(az, bz) - 12) / 20), math.floor((max(az, bz) + 12) / 20) + 1):
                    segs[(gx, gz)].append((ax, az, bx, bz))
    bl = []
    for b in D['buildings']:
        p = b[2]; xs, zs = p[0::2], p[1::2]; bl.append((min(xs), min(zs), max(xs), max(zs)))
    return D, segs, bl

def near_core_road(segs, x, z, tx, tz, r=7.0):
    for ax, az, bx, bz in segs.get((math.floor(x / 20), math.floor(z / 20)), ()):
        dx, dz = bx - ax, bz - az; L = dx * dx + dz * dz
        t = 0 if L == 0 else max(0, min(1, ((x - ax) * dx + (z - az) * dz) / L))
        qx, qz = ax + dx * t, az + dz * t
        if (qx - x) ** 2 + (qz - z) ** 2 < r * r:
            if L == 0: return True
            l = math.sqrt(L)
            if abs((dx * tx + dz * tz) / l) > 0.8: return True # same direction: the same road
    return False

# ------------------------------------------------------------------ roads -> graph edges
def build_roads(osm, core_segs):
    ways = [w for w in osm['ways'] if keep_way(w)]
    seen = set(); ways = [w for w in ways if not (w[WID] in seen or seen.add(w[WID]))]
    log('roads kept', len(ways), 'of', len(osm['ways'])); osm['ways'] = None
    refs = defaultdict(int)
    for w in ways:
        ids = w[WIDS]; n = len(ids)
        for k in range(n): refs[ids[k]] += 1 if 0 < k < n - 1 else 2
    nodes = {} # node id -> (x, z)
    edges = []
    synth = [-1]
    def new_id(): synth[0] -= 1; return synth[0] - 10**12
    def new_stub(): synth[0] -= 1; return 's' + str(-synth[0]) # where an outer road runs onto one of the core's: the game joins them
    names = {}; name_list = []
    def name_idx(n):
        if not n: return -1
        if n not in names: names[n] = len(name_list); name_list.append(n)
        return names[n]
    cut_core = 0
    for w in ways:
        t = TYPE[w[WHW]]; ow = w[WONEWAY] in ('yes', 'true', '1', '-1') or w[WHW] in ('motorway',) and w[WONEWAY] != 'no'
        pts = list(zip(w[WIDS], w[WXS], w[WZS]))
        if w[WONEWAY] == '-1': pts.reverse()
        wd = width_of(w, t, ow); mph = mph_of(w, t); nm = name_idx(w[WNAME] or w[WREF])
        fl = (1 if w[WBRIDGE] not in ('', 'no') else 0) | (2 if w[WTUNNEL] not in ('', 'no') else 0)
        # pieces between junctions
        piece = [pts[0]]
        for k in range(1, len(pts)):
            piece.append(pts[k])
            if refs[pts[k][0]] >= 2 or k == len(pts) - 1:
                if len(piece) >= 2: edges.append([piece, t, wd, ow, nm, mph, fl])
                piece = [pts[k]]
    log('edges', len(edges))
    # densify to <= 25 m, drop what the core has, split long edges, keep pieces >= 8 m
    out = []
    for piece, t, wd, ow, nm, mph, fl in edges:
        P = []
        for k in range(len(piece)):
            nid, x, z = piece[k]
            if k:
                _, px, pz = piece[k - 1]; L = math.hypot(x - px, z - pz); n = int(L // 25)
                for s in range(1, n + 1):
                    f = s / (n + 1); P.append((None, px + (x - px) * f, pz + (z - pz) * f))
            P.append((nid, x, z))
        covered = []
        for k, (nid, x, z) in enumerate(P):
            a = P[max(0, k - 1)]; b = P[min(len(P) - 1, k + 1)]; L = math.hypot(b[1] - a[1], b[2] - a[2]) or 1
            c = in_core(x, z) or (in_core(x, z, 600) and near_core_road(core_segs, x, z, (b[1] - a[1]) / L, (b[2] - a[2]) / L))
            covered.append(c)
        runs, cur = [], []
        for k, q in enumerate(P):
            if covered[k]:
                if cur: cur.append((new_stub(), q[1], q[2])) # end on the core's road: a stub the game snaps
                if len(cur) >= 2: runs.append((cur, True))
                cur = []; cut_core += 1
            else:
                if not cur and k and covered[k - 1]: cur = [(new_stub(), *P[k - 1][1:])] # start on the core's road: a stub the game snaps
                cur.append(q)
        if len(cur) >= 2: runs.append((cur, False))
        for run, _ in runs:
            # split at 400 m
            acc, start = 0.0, 0
            for k in range(1, len(run)):
                acc += math.hypot(run[k][1] - run[k - 1][1], run[k][2] - run[k - 1][2])
                if (acc > 400 and k < len(run) - 3) or k == len(run) - 1:
                    seg = run[start:k + 1]
                    if seg[0][0] is None: seg[0] = (new_id(), *seg[0][1:])
                    if seg[-1][0] is None: seg[-1] = (new_id(), *seg[-1][1:])
                    run[k] = seg[-1]
                    length = sum(math.hypot(seg[q][1] - seg[q - 1][1], seg[q][2] - seg[q - 1][2]) for q in range(1, len(seg)))
                    if length >= 8 or (refs.get(seg[0][0], 0) >= 2 and refs.get(seg[-1][0], 0) >= 2):
                        out.append({'a': seg[0][0], 'b': seg[-1][0], 't': t, 'w': wd, 'ow': ow, 'n': nm, 'mph': mph, 'fl': fl,
                                    'p': [(x, z) for _, x, z in seg]})
                    start = k; acc = 0.0
    log('outer edges', len(out), 'points covered by the core', cut_core)
    return out, name_list

def simplify(p, tol=0.6):
    if len(p) <= 2: return p
    # Douglas-Peucker on the 25 m densified line (keeps curves, drops the straight runs)
    keep = [False] * len(p); keep[0] = keep[-1] = True; st = [(0, len(p) - 1)]
    while st:
        a, b = st.pop(); ax, az = p[a]; bx, bz = p[b]; dx, dz = bx - ax, bz - az; L = math.hypot(dx, dz) or 1e-9
        best, bi = 0, -1
        for k in range(a + 1, b):
            d = abs((p[k][0] - ax) * dz - (p[k][1] - az) * dx) / L
            if d > best: best, bi = d, k
        if best > tol: keep[bi] = True; st += [(a, bi), (bi, b)]
    return [q for q, k in zip(p, keep) if k]

# ------------------------------------------------------------------ buildings
LEVEL = 3.2
def bkind(k, amen):
    if k in ('school', 'university', 'college', 'hospital', 'church', 'civic', 'public', 'government', 'fire_station', 'train_station', 'stadium', 'cathedral', 'chapel', 'temple', 'mosque') or amen in ('school', 'hospital', 'place_of_worship'): return 2
    if k in ('commercial', 'retail', 'industrial', 'warehouse', 'office', 'hotel', 'apartments', 'supermarket', 'hangar', 'parking', 'manufacture', 'mall', 'dormitory', 'kiosk', 'service'): return 1
    return 0

def bheight(b, area):
    for key in ('h',):
        m = re.match(r'([\d.]+)', b[key] or '')
        if m:
            v = float(m.group(1))
            if 'ft' in b[key] or "'" in b[key]: v *= 0.3048
            if 2 < v < 400: return v
    m = re.match(r'([\d.]+)', b['lv'] or '')
    if m and 0 < float(m.group(1)) < 120: return float(m.group(1)) * LEVEL + (1.0 if b['kind'] in ('house', 'detached', 'residential') else 0.6)
    k = b['kind']
    if k in ('garage', 'garages', 'shed', 'carport', 'roof', 'hut'): return 3.0
    if k in ('house', 'detached', 'residential', 'semidetached_house', 'bungalow'): return 5.5 if area < 250 else 7.0
    if k in ('apartments', 'dormitory'): return 10.5 if area < 1500 else 13.5
    if k in ('industrial', 'warehouse', 'manufacture', 'hangar'): return 9.0
    if k in ('commercial', 'retail', 'office', 'supermarket'): return 7.5 if area < 3000 else 9.5
    return 5.0 if area < 150 else 6.5 if area < 600 else 8.0 if area < 2500 else 10.0

def poly_area(p):
    xs, zs = p[0::2], p[1::2]; n = len(xs)
    return abs(sum(xs[i] * zs[i - 1] - xs[i - 1] * zs[i] for i in range(n))) / 2

# ------------------------------------------------------------------ main
def main(args):
    os.makedirs(os.path.join(OUT, 't'), exist_ok=True); os.makedirs(os.path.join(OUT, 'p'), exist_ok=True)
    osm = pickle.load(open(os.path.join(work, 'osm.pickle'), 'rb'))
    log('osm loaded', {k: len(v) for k, v in osm.items()})
    D, core_segs, core_bl = load_core()
    edges, names = build_roads(osm, core_segs)
    Tr = Terrain(); log('terrain loaded', Tr.h.shape)
    tiles = defaultdict(lambda: {'e': [], 'x': [], 'b': [], 'tr': [], 'poi': [], 'sig': [], 'stop': [], 'cr': [], 'ar': [], 'lamp': []})
    def tkey(x, z): return (math.floor(x / TILE), math.floor(z / TILE))
    # edges: owned by the tile holding their middle point; context copies in every other tile they pass within 60 m of
    for k, e in enumerate(edges):
        p = simplify(e['p']); e['p'] = p
        L, cum = 0.0, [0.0]
        for q in range(1, len(p)): L += math.hypot(p[q][0] - p[q - 1][0], p[q][1] - p[q - 1][1]); cum.append(L)
        h = L / 2; q = next(q for q in range(1, len(p)) if cum[q] >= h) if len(p) > 1 else 0
        f = (h - cum[q - 1]) / max(1e-9, cum[q] - cum[q - 1]); mx = p[q - 1][0] + (p[q][0] - p[q - 1][0]) * f; mz = p[q - 1][1] + (p[q][1] - p[q - 1][1]) * f
        own = tkey(mx, mz); e['own'] = own; e['k'] = k
        tiles[own]['e'].append(e)
        xs = [q[0] for q in p]; zs = [q[1] for q in p]
        for i in range(math.floor((min(xs) - 60) / TILE), math.floor((max(xs) + 60) / TILE) + 1):
            for j in range(math.floor((min(zs) - 60) / TILE), math.floor((max(zs) + 60) / TILE) + 1):
                if (i, j) != own and I0 <= i <= I1 and J0 <= j <= J1: tiles[(i, j)]['x'].append(e)
    log('edges placed')
    # buildings (by centroid), skipping the core's
    nb = 0
    for kind_, h_, lv_, minh_, amen_, p in osm['buildings']:
        b = {'kind': kind_, 'h': h_, 'lv': lv_, 'minh': minh_, 'amenity': amen_}
        p = [round(v, 1) for v in p]
        if len(p) < 6: continue
        xs, zs = p[0::2], p[1::2]; cx, cz = sum(xs) / len(xs), sum(zs) / len(zs)
        if in_core(cx, cz) or not (BOUNDS[0] <= cx <= BOUNDS[2] and BOUNDS[1] <= cz <= BOUNDS[3]): continue
        area = poly_area(p)
        if area < 12 or area > 400000: continue
        tiles[tkey(cx, cz)]['b'].append((round(bheight(b, area), 1), bkind(b['kind'], b['amenity']), p, b['minh']))
        nb += 1
    log('buildings', nb)
    for kind, flat, name in osm['areas']:
        xs, zs = flat[0::2], flat[1::2]; cx, cz = sum(xs) / len(xs), sum(zs) / len(zs)
        if in_core(cx, cz): continue
        a = poly_area(flat)
        if a < 40: continue
        tiles[tkey(cx, cz)]['ar'].append((kind, flat, name))
    pois = []
    seenp = set()
    for name, k, x, z, area in osm['pois']:
        if in_core(x, z) or not (BOUNDS[0] <= x <= BOUNDS[2] and BOUNDS[1] <= z <= BOUNDS[3]): continue
        key = (name, k, round(x / 300), round(z / 300))
        if key in seenp: continue
        seenp.add(key); pois.append((name, k, round(x, 1), round(z, 1), area))
    for hw, x, z, nid, cr in osm['nodes']:
        if in_core(x, z): continue
        key = {'traffic_signals': 'sig', 'stop': 'stop', 'crossing': 'cr', 'give_way': 'stop'}.get(hw)
        if key: tiles[tkey(x, z)][key].append((round(x, 1), round(z, 1)))
        if hw == 'street_lamp': tiles[tkey(x, z)]['lamp'].append((round(x, 1), round(z, 1)))
    for x, z in osm['trees']:
        if not in_core(x, z): tiles[tkey(x, z)]['tr'].append((round(x, 1), round(z, 1)))
    # write tiles
    exist = {}
    only = None
    if 'only' in args: only = tuple(int(v) for v in args[args.index('only') + 1].split(','))
    nwrite = 0; total = 0
    for i, j in tiles_all():
        if only and (i, j) != only: continue
        x0, z0, x1, z1 = tile_rect(i, j)
        # terrain posts
        gx = x0 + np.arange(HN) * HCELL; gz = z0 + np.arange(HN) * HCELL
        X, Z = np.meshgrid(gx, gz)
        lat = ORIGIN[0] - Z / KZ; lon = ORIGIN[1] + X / KX
        h = Tr.at(lat, lon)
        land = float(h.max()) > 0.5
        t = tiles.get((i, j))
        if not land and not (t and (t['e'] or t['b'])): continue
        rel = lambda x, z: [round((x - x0) * 10), round((z - z0) * 10)]
        def relp(p): return [v for q in p for v in rel(*q)]
        def relf(flat): return [v for k in range(0, len(flat), 2) for v in rel(flat[k], flat[k + 1])]
        tj = {'i': i, 'j': j, 'h': np.round(h * 10).astype(int).ravel().tolist()}
        if t:
            loc_names = {}; nl = []
            def ln(n):
                if n < 0: return -1
                if n not in loc_names: loc_names[n] = len(nl); nl.append(names[n])
                return loc_names[n]
            tj['e'] = [[str(e['a']), str(e['b']), e['t'], e['w'], 1 if e['ow'] else 0, ln(e['n']), relp(e['p']), e['mph'], e['fl']] for e in t['e']]
            tj['x'] = [[e['t'], e['w'], relp(clip_line(e['p'], x0 - 60, z0 - 60, x1 + 60, z1 + 60)), e['fl']] for e in t['x']]
            tj['x'] = [x for x in tj['x'] if len(x[2]) >= 4]
            tj['names'] = nl
            tj['b'] = [[bh, bk, relf(p), round(float(mh) * 10) if re.match(r'^[\d.]+$', mh or '') else 0] for bh, bk, p, mh in t['b']]
            tj['ar'] = [[k, relf(f), n] for k, f, n in t['ar']]
            tj['sig'] = [rel(*q) for q in t['sig']]; tj['stop'] = [rel(*q) for q in t['stop']]; tj['cr'] = [rel(*q) for q in t['cr']]
            tj['tr'] = [rel(*q) for q in t['tr']]; tj['lamp'] = [rel(*q) for q in t['lamp']]
        s = json.dumps(tj, separators=(',', ':'))
        with open(os.path.join(OUT, 't', f'{i}_{j}.json'), 'w') as f: f.write(s)
        exist[f'{i}_{j}'] = 1 | (2 if land else 0)
        nwrite += 1; total += len(s)
        if nwrite % 200 == 0: log('tiles', nwrite, f'{total / 1e6:.0f} MB')
    log('tiles written', nwrite, f'{total / 1e6:.0f} MB')
    if not only:
        idx = {'v': 1, 'tile': TILE, 'hcell': HCELL, 'hn': HN, 'photo': PHOTO_PX, 'origin': ORIGIN, 'core': CORE, 'bounds': BOUNDS,
               'i0': I0, 'j0': J0, 'i1': I1, 'j1': J1, 'tiles': exist, 'pois': pois}
        json.dump(idx, open(os.path.join(OUT, 'index.json'), 'w'), separators=(',', ':'))
        log('index', len(exist), 'tiles,', len(pois), 'pois')

def tiles_all():
    for j in range(J0, J1 + 1):
        for i in range(I0, I1 + 1): yield i, j

def clip_line(p, x0, z0, x1, z1):
    # keep the run of points inside the box, plus one point either side so the line reaches the edge
    ins = [x0 <= x <= x1 and z0 <= z <= z1 for x, z in p]
    if not any(ins): return p if len(p) == 2 else []
    a = ins.index(True); b = len(ins) - 1 - ins[::-1].index(True)
    return p[max(0, a - 1):min(len(p), b + 2)]

if __name__ == '__main__': main(sys.argv[1:])
