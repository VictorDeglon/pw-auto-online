#!/usr/bin/env python3
# OpenStreetMap -> work/osm.pickle: everything the outer world uses, in game metres, for the outer world's box.
# Reads raw/socal.osm.pbf (Geofabrik, US side) and raw/mexico.json (Overpass, south of the border) if present.
import json, math, os, pickle, sys, time
from array import array
import osmium
from config import RAW, DATA, bbox_ll, to_game

S, W, N, E = bbox_ll(1500)
work = os.path.join(DATA, 'work'); os.makedirs(work, exist_ok=True)

ROAD_KEYS = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
             'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road', 'track',
             'footway', 'path', 'cycleway', 'pedestrian', 'steps', 'bridleway'}
POI_TAGS = {
    'amenity': {'school', 'college', 'university', 'hospital', 'police', 'fire_station', 'library', 'townhall', 'courthouse',
                'stadium', 'theatre', 'cinema', 'marketplace', 'ferry_terminal', 'bus_station', 'fuel', 'restaurant',
                'fast_food', 'cafe', 'bank', 'post_office', 'bar', 'nightclub', 'arts_centre'},
    'leisure': {'park', 'stadium', 'golf_course', 'marina', 'nature_reserve', 'sports_centre', 'water_park', 'beach_resort'},
    'tourism': {'attraction', 'museum', 'zoo', 'theme_park', 'aquarium', 'viewpoint', 'hotel'},
    'natural': {'beach', 'peak', 'bay', 'cape'},
    'aeroway': {'aerodrome'},
    'military': {'base', 'airfield'},
    'landuse': {'military'},
    'shop': {'mall', 'department_store', 'supermarket', 'car'},
    'man_made': {'pier', 'lighthouse'},
    'place': {'city', 'town', 'suburb', 'neighbourhood', 'quarter', 'village', 'hamlet', 'island'},
    'railway': {'station'},
}
AREA_KINDS = { # -> poway-data.js area kinds where they exist: 0 water, 1 park / grass, 2 parking, 3 school / sports
    ('natural', 'water'): 0, ('landuse', 'reservoir'): 0, ('landuse', 'basin'): 0, ('leisure', 'swimming_pool'): None,
    ('leisure', 'park'): 1, ('leisure', 'golf_course'): 1, ('landuse', 'grass'): 1, ('leisure', 'pitch'): 3,
    ('amenity', 'parking'): 2, ('amenity', 'school'): 3, ('leisure', 'stadium'): 3,
    ('natural', 'beach'): 4, ('landuse', 'military'): 5, ('aeroway', 'aerodrome'): 5, ('natural', 'wood'): 6, ('landuse', 'forest'): 6,
    ('landuse', 'orchard'): 6, ('landuse', 'vineyard'): 6,
}

def inside(lat, lon): return S <= lat <= N and W <= lon <= E

# compact records (tuples and typed arrays: the dict-per-way version needed several GB)
# way: (id, highway, name, ref, lanes, oneway, maxspeed, bridge, tunnel, service, footway, node ids, xs, zs)
def way_rec(wid, tags, ids, xs, zs):
    g = lambda k: sys.intern(tags.get(k, '')) if k not in ('name', 'ref') else tags.get(k, '')
    return (wid, g('highway'), g('name'), g('ref'), g('lanes'), g('oneway'), g('maxspeed'), g('bridge'), g('tunnel'), g('service'), g('footway'), ids, xs, zs)

def gxz(lat, lon):
    x, z = to_game(lat, lon); return round(x, 1), round(z, 1)

out = {'ways': [], 'buildings': [], 'pois': [], 'nodes': [], 'areas': [], 'trees': []}

def poi_kind(tags):
    for k, vs in POI_TAGS.items():
        v = tags.get(k)
        if v in vs: return k + '=' + v
    return None

def area_kind(tags):
    for (k, v), kind in AREA_KINDS.items():
        if tags.get(k) == v: return kind
    if tags.get('water') or tags.get('natural') == 'water': return 0
    return None

def main():
    t0 = time.time(); n = 0
    # the SoCal extract cut to the box and the tags used here first (osmium-tool), so the node index stays small:
    #   osmium extract -b -117.66,32.46,-116.39,33.51 --strategy=complete_ways socal.osm.pbf -o sd.osm.pbf
    #   osmium tags-filter sd.osm.pbf nwr/highway nwr/building nwr/name ... -o sdf.osm.pbf
    pbf = os.path.join(RAW, 'sdf.osm.pbf')
    if not os.path.exists(pbf): pbf = os.path.join(RAW, 'socal.osm.pbf')
    keys = ['highway', 'building', 'name', 'natural', 'landuse', 'leisure', 'amenity', 'water', 'aeroway', 'tourism', 'shop', 'military', 'man_made', 'place', 'railway']
    fp = osmium.FileProcessor(pbf).with_locations().with_areas().with_filter(osmium.filter.KeyFilter(*keys))
    for o in fp:
        n += 1
        if n % 2_000_000 == 0: print(f'{n:,} objects {time.time() - t0:.0f}s ways {len(out["ways"]):,} buildings {len(out["buildings"]):,}', flush=True)
        tags = o.tags
        if o.is_node():
            loc = o.location
            if not loc.valid() or not inside(loc.lat, loc.lon): continue
            hw = tags.get('highway')
            x, z = gxz(loc.lat, loc.lon)
            if hw in ('traffic_signals', 'stop', 'crossing', 'give_way', 'bus_stop', 'street_lamp'):
                out['nodes'].append((hw, x, z, o.id, tags.get('crossing', '')))
            if tags.get('natural') == 'tree': out['trees'].append((x, z))
            k = poi_kind(tags)
            if k and tags.get('name'): out['pois'].append((tags.get('name'), k, x, z, 0))
        elif o.is_way():
            hw = tags.get('highway')
            if hw in ROAD_KEYS and tags.get('area') != 'yes':
                ids, xs, zs = array('q'), array('f'), array('f'); ok = False
                for nd in o.nodes:
                    if not nd.location.valid(): continue
                    if inside(nd.location.lat, nd.location.lon): ok = True
                    x, z = to_game(nd.location.lat, nd.location.lon); ids.append(nd.ref); xs.append(x); zs.append(z)
                if ok and len(ids) >= 2:
                    out['ways'].append(way_rec(o.id, tags, ids, xs, zs))
        elif o.is_area():
            b = tags.get('building'); b = None if b in (None, 'no') else b
            kind = area_kind(tags); pk = poi_kind(tags)
            if not (b or kind is not None or (pk and tags.get('name'))): continue
            try:
                rings = []
                for outer in o.outer_rings():
                    ring = [(nd.lat, nd.lon) for nd in outer if nd.location.valid()]
                    if len(ring) >= 3: rings.append(ring)
            except Exception: continue
            if not rings: continue
            lat0, lon0 = rings[0][0]
            if not inside(lat0, lon0) and not any(inside(la, lo) for la, lo in rings[0][::max(1, len(rings[0]) // 8)]): continue
            for ring in rings:
                flat = []
                for la, lo in ring[:-1] if ring[0] == ring[-1] else ring:
                    x, z = gxz(la, lo); flat += [x, z]
                if b: # (kind, height, levels, min height, amenity, flat x z)
                    out['buildings'].append((sys.intern(b), tags.get('height', ''), tags.get('building:levels', ''), tags.get('min_height', ''), sys.intern(tags.get('amenity', '')), array('f', flat)))
                elif kind is not None:
                    out['areas'].append((kind, flat, tags.get('name', '')))
            if pk and tags.get('name'):
                xs, zs = [q for q in flat[0::2]], [q for q in flat[1::2]]
                area = abs(sum(xs[i] * zs[i - 1] - xs[i - 1] * zs[i] for i in range(len(xs)))) / 2
                out['pois'].append((tags.get('name'), pk, round(sum(xs) / len(xs), 1), round(sum(zs) / len(zs), 1), round(area)))
    print(f'pbf done {time.time() - t0:.0f}s: ways {len(out["ways"]):,} buildings {len(out["buildings"]):,} pois {len(out["pois"]):,} nodes {len(out["nodes"]):,} areas {len(out["areas"]):,} trees {len(out["trees"]):,}', flush=True)
    with open(os.path.join(work, 'osm.pickle'), 'wb') as f: pickle.dump(out, f, protocol=5)
    print('saved', flush=True)

def mexico(): # adds raw/mexico.json (Overpass) to work/osm.pickle; ways and buildings the US extract already has are skipped
    import glob
    paths = sorted(glob.glob(os.path.join(RAW, 'mexico-*.json')))
    if not paths: print('no raw/mexico-*.json (fetch.py osm)'); return
    global out
    out = pickle.load(open(os.path.join(work, 'osm.pickle'), 'rb'))
    have = {w[0] for w in out['ways']}; nw = nb = 0
    def elements(path): # streamed: a strip can be hundreds of MB of JSON
        try:
            import ijson
            with open(path, 'rb') as f: yield from ijson.items(f, 'elements.item', use_float=True)
        except ImportError: yield from json.load(open(path)).get('elements', [])
    for el in (el for path in paths for el in elements(path)):
        if el.get('type') == 'way': have_b = el['id'] in have; have.add(el['id'])
        else: continue
        if have_b: continue
        if 'geometry' not in el: continue
        tags = el.get('tags', {}); g = el['geometry']
        if tags.get('highway') in ROAD_KEYS:
            ids = array('q', el.get('nodes') or [-(el['id'] * 1000 + k) for k in range(len(g))]); xs, zs = array('f'), array('f')
            for q in g: x, z = to_game(q['lat'], q['lon']); xs.append(x); zs.append(z)
            out['ways'].append(way_rec(el['id'], tags, ids, xs, zs)); nw += 1
        elif tags.get('building') and len(g) >= 4 and g[0]['lat'] < 32.5435: # south of the line (the US side is in the extract)
            flat = []
            for q in g[:-1]: x, z = to_game(q['lat'], q['lon']); flat += [x, z]
            out['buildings'].append((tags['building'], tags.get('height', ''), tags.get('building:levels', ''), '', '', array('f', flat))); nb += 1
    print('mexico: ways', nw, 'buildings', nb)
    with open(os.path.join(work, 'osm.pickle'), 'wb') as f: pickle.dump(out, f, protocol=5)

if __name__ == '__main__': mexico() if sys.argv[1:] == ['mexico'] else main()
