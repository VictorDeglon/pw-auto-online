#!/usr/bin/env python3
# Downloads the raw inputs of the outer world into $PAO_WORLD_DATA/raw (default ~/.cache/pw-auto-online/world/raw):
#   terrain   AWS Terrain Tiles (terrarium PNG, z13, about 16 m), public dataset
#   photo     USGS Imagery Only (NAIP, public domain) web-mercator tiles, z15 (about 4 m); open ocean is skipped
#   osm       Geofabrik's Southern California extract (OpenStreetMap, ODbL), plus Overpass for the strip of Mexico
# Usage: fetch.py terrain | photo | osm
import concurrent.futures as cf, math, os, sys, time, urllib.request, json
from config import RAW, bbox_ll, ll_to_tile

UA = {'User-Agent': 'pw-auto-online world builder (github.com/VictorDeglon/pw-auto-online)'}

def get(url, path, tries=4):
    if os.path.exists(path) and os.path.getsize(path) > 0: return 'have'
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: data = r.read()
            tmp = path + '.part'
            with open(tmp, 'wb') as f: f.write(data)
            os.replace(tmp, path); return 'ok'
        except Exception as e:
            if getattr(e, 'code', 0) == 404: open(path + '.404', 'w').close(); return '404'
            time.sleep(2 * (k + 1))
    return 'fail'

def tile_range(z, pad):
    s, w, n, e = bbox_ll(pad)
    x0, y0 = ll_to_tile(n, w, z); x1, y1 = ll_to_tile(s, e, z)
    return range(math.floor(x0), math.floor(x1) + 1), range(math.floor(y0), math.floor(y1) + 1)

def run(jobs, workers):
    done, stats, t0 = 0, {}, time.time()
    with cf.ThreadPoolExecutor(workers) as ex:
        for res in ex.map(lambda j: get(*j), jobs):
            stats[res] = stats.get(res, 0) + 1; done += 1
            if done % 200 == 0 or done == len(jobs): print(f'{done}/{len(jobs)} {stats} {time.time() - t0:.0f}s', flush=True)

def terrain():
    d = os.path.join(RAW, 'terrarium13'); os.makedirs(d, exist_ok=True)
    xs, ys = tile_range(13, 3000)
    run([(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/{x}/{y}.png', os.path.join(d, f'{x}_{y}.png')) for y in ys for x in xs], 8)

def photo():
    from terrain import Terrain
    T = Terrain()
    d = os.path.join(RAW, 'usgs15'); os.makedirs(d, exist_ok=True)
    xs, ys = tile_range(15, 500)
    jobs = []
    from config import tile_to_ll
    for y in ys:
        for x in xs:
            # skip open ocean: no land within about 1 km of the tile
            lat0, lon0 = tile_to_ll(x - 1, y - 1, 15); lat1, lon1 = tile_to_ll(x + 2, y + 2, 15)
            if T.max_in(lat1, lon0, lat0, lon1) <= 0.5: continue
            jobs.append((f'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/15/{y}/{x}', os.path.join(d, f'{x}_{y}.jpg')))
    print(len(jobs), 'photo tiles to fetch', flush=True)
    run(jobs, 6)

def osm():
    # Mexico is not in the SoCal extract: everything south of the border inside the outer world, from Overpass, in
    # strips (one big answer needed gigabytes to parse): raw/mexico-<k>.json
    s, w, n, e = bbox_ll(500); n = min(n, 32.545)
    parts = 8
    for k in range(parts):
        w0, w1 = w + (e - w) * k / parts, w + (e - w) * (k + 1) / parts
        part = os.path.join(RAW, f'mexico-{k}.json')
        if not os.path.exists(part):
            q = f'[out:json][timeout:600];(way["highway"]({s},{w0},{n},{w1});way["building"]({s},{w0},{n},{w1}););out body geom;'
            for url in ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']:
                try:
                    req = urllib.request.Request(url, data=('data=' + urllib.request.quote(q)).encode(), headers=UA)
                    with urllib.request.urlopen(req, timeout=900) as r, open(part + '.part', 'wb') as f:
                        while True:
                            b = r.read(1 << 20)
                            if not b: break
                            f.write(b)
                    os.replace(part + '.part', part); print('strip', k, os.path.getsize(part)); break
                except Exception as ex: print('overpass', k, url, ex)
    # osm.py mexico reads the strips one at a time

if __name__ == '__main__':
    {'terrain': terrain, 'photo': photo, 'osm': osm}[sys.argv[1]]()
