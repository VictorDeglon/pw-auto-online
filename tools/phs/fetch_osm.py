"""Download OpenStreetMap data for Poway High School and the streets around it.

Writes two Overpass JSON files next to this script in data/:
  campus.json        everything inside the school's campus polygon (OSM way 107391680)
  surroundings.json  roads, signals, stop signs and crossings in a ~150 m margin

Usage: python3 tools/phs/fetch_osm.py [campus.json|surroundings.json ...]
Data (c) OpenStreetMap contributors, ODbL.
"""
import json, pathlib, sys, time, urllib.parse, urllib.request

CAMPUS_WAY = 107391680
BBOX = (32.9947, -117.0296, 33.0031, -117.0222)  # south, west, north, east (campus + margin)
MIRRORS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
OUT = pathlib.Path(__file__).resolve().parent / "data"

QUERIES = {
    "campus.json": f"[out:json][timeout:90];way({CAMPUS_WAY});map_to_area->.s;"
                   f"(nwr(area.s);way({CAMPUS_WAY}););out body geom;",
    "surroundings.json": "[out:json][timeout:120];("
                         "way[highway]({s},{w},{n},{e});"
                         "node[highway~\"traffic_signals|stop|give_way|crossing|street_lamp\"]({s},{w},{n},{e});"
                         "way[barrier]({s},{w},{n},{e});"
                         "node[barrier~\"gate|lift_gate|sliding_gate|swing_gate|bollard\"]({s},{w},{n},{e});"
                         ");out body geom;".format(s=BBOX[0], w=BBOX[1], n=BBOX[2], e=BBOX[3]),
}


def fetch(query):
    body = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for url in MIRRORS:
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "grand-theft-poway/phs-builder"})
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.loads(r.read())
            if data.get("elements"):
                return data
            last = f"{url}: empty result"
        except Exception as exc:  # try the next mirror
            last = f"{url}: {exc}"
        time.sleep(2)
    sys.exit(f"all Overpass mirrors failed ({last})")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    names = sys.argv[1:] or list(QUERIES)
    for name in names:
        data = fetch(QUERIES[name])
        (OUT / name).write_text(json.dumps(data))
        print(f"{name}: {len(data['elements'])} elements, OSM base {data['osm3s'].get('timestamp_osm_base')}")
