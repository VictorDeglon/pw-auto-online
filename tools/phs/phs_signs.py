"""Campus signage for build_phs.py: rules/parking/wayfinding posts, building name lettering, school-zone
signs on Espola Road. Placement follows OSM geometry (entrances, footways, service roads, parking lots);
texts are typical California high-school signage, so they are tagged gtp_confidence="procedural"."""
import math

import numpy as np
from mathutils import Vector

import build_phs as B


def _mats(b):
    M = b.M
    if "sign_blue" not in M:
        M["sign_blue"] = B.material("Sign_ADA_Blue", B.srgb("#1f4fa3"), 0.4)
        M["sign_yellow"] = B.material("Sign_Yellow", B.srgb("#f2c230"), 0.4)
    return [M["steel"], M["sign_white"], M["sign_red"], M["sign_green"], M["sign_blue"], M["sign_black"],
            M["accent"], M["gold"], M["sign_ygreen"], M["sign_yellow"]]


STEEL, WHITE, RED, GREEN, BLUE, BLACK, ACCENT, GOLD, YGREEN, YELLOW = range(10)
PALETTE = {"white": (WHITE, BLACK), "red": (RED, WHITE), "green": (GREEN, WHITE), "blue": (BLUE, WHITE),
           "titan": (ACCENT, GOLD), "yellow": (YELLOW, BLACK), "ygreen": (YGREEN, BLACK)}


def post_sign(b, mb, x, y, facing_deg, lines, style="white", w=0.75, line_h=0.11, top=2.4, panel_h=None):
    """Panel on a square post. facing_deg = compass direction the face points toward (0 = north)."""
    bg, fg = PALETTE[style]
    z = b.world.g1(x, y)
    a = math.radians(facing_deg)
    f = (math.sin(a), math.cos(a))
    right = (-f[1], f[0])
    F = B.frame((x, y, z), right)
    h = panel_h or (len(lines) * line_h * 1.45 + 0.12)
    mb.box(F, -0.03, 0.03, 0.02, 0.08, -0.4, top, STEEL)  # post behind the panel
    mb.box(F, -w / 2, w / 2, -0.01, 0.01, top - h, top, bg)
    mb.box(F, -w / 2, w / 2, 0.011, 0.015, top - h, top, STEEL)  # aluminium back
    zt = top - 0.06 - line_h * 0.7
    for ln in lines:
        b.text_on(mb, F, ln, line_h, fg, z=zt, y=-0.012, max_w=w - 0.08)
        zt -= line_h * 1.45


def _bearing(dx, dy):
    return math.degrees(math.atan2(dx, dy)) % 360


def build_signs(b):
    mats = _mats(b)
    mb = B.MB()
    n = 0
    ring = b.campus_ring()
    cx, cy = B.poly_centroid(ring)

    def inside(x, y, margin=0.0):
        return B.points_in_poly([x], [y], ring)[0] and B.dist_to_ring([x], [y], ring)[0] > margin

    def clear(x, y):
        return not any(B.points_in_poly([x], [y], bd["ring"])[0] or B.dist_to_ring([x], [y], bd["ring"])[0] < 1.0
                       for bd in b.buildings)

    # 1. entrances: welcome + visitor check-in
    ents = [B.ll2xy(e["lat"], e["lon"]) for e in b.campus if e["type"] == "node" and e.get("tags", {}).get("entrance")]
    for k, (ex, ey) in enumerate(ents[:2]):
        face = _bearing(400 - ex, 0)  # toward Espola (east)
        sx, sy = ex + 4.0, ey + (3.0 if k else -3.0)
        if clear(sx, sy):
            post_sign(b, mb, sx, sy, face, ["ALL VISITORS", "MUST CHECK IN AT", "THE FRONT OFFICE"], "titan", w=0.9)
            n += 1
    # 2. rules posts at the start of every campus footway (every 3rd gets a different rule)
    rules = [["NO SKATEBOARDS", "BIKES OR SCOOTERS", "ON CAMPUS"], ["TOBACCO & VAPE", "FREE CAMPUS"],
             ["CLOSED CAMPUS", "STUDENTS MUST", "REMAIN ON CAMPUS"], ["NO DOGS", "ON SCHOOL GROUNDS"],
             ["CAMPUS UNDER", "VIDEO SURVEILLANCE"]]
    k = 0
    for e in b.campus:
        t = e.get("tags", {})
        if e["type"] != "way" or t.get("highway") != "footway":
            continue
        pts = B.way_xy(e)
        if len(pts) < 2 or math.dist(pts[0], pts[-1]) < 25:
            continue
        (x0, y0), (x1, y1) = pts[0], pts[1]
        L = math.dist(pts[0], pts[1]) or 1
        ux, uy = (x1 - x0) / L, (y1 - y0) / L
        sx, sy = x0 + ux * 2 - uy * 1.6, y0 + uy * 2 + ux * 1.6
        if inside(sx, sy) and clear(sx, sy):
            post_sign(b, mb, sx, sy, _bearing(-ux, -uy), rules[k % len(rules)], "white")
            k += 1
            n += 1
    # 3. service roads: fire lane, speed limit, staff parking, drop-off
    fl = 0
    for e in b.campus:
        t = e.get("tags", {})
        if e["type"] != "way" or t.get("highway") != "service":
            continue
        pts = B.way_xy(e)
        w = B.road_width(t) / 2 + 0.9
        run = 0.0
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            L = math.dist(pts[i], pts[i + 1])
            if L < 1:
                continue
            ux, uy = (x1 - x0) / L, (y1 - y0) / L
            for s in np.arange(0, L, 2.0):
                run += 2.0
                if run % 70 > 2.0:
                    continue
                sx, sy = x0 + ux * s + uy * w, y0 + uy * s - ux * w
                if not (inside(sx, sy, 1) and clear(sx, sy)):
                    continue
                kind = fl % 4
                face = _bearing(-ux, -uy)
                if kind == 0:
                    post_sign(b, mb, sx, sy, face, ["FIRE LANE", "NO PARKING", "VIOLATORS TOWED"], "red", w=0.46)
                elif kind == 1:
                    post_sign(b, mb, sx, sy, face, ["SPEED", "LIMIT", "5"], "white", w=0.46, line_h=0.1)
                elif kind == 2:
                    post_sign(b, mb, sx, sy, face, ["STAFF", "PARKING ONLY", "PERMIT REQUIRED"], "green", w=0.6)
                else:
                    post_sign(b, mb, sx, sy, face, ["STUDENT", "DROP-OFF &", "PICK-UP"], "titan", w=0.6)
                fl += 1
                n += 1
    # 4. accessible parking signs along the parking lot edge nearest the main entrance
    if ents:
        ex, ey = ents[0]
        lots = []
        for e in b.campus:
            if e["type"] == "way" and e.get("tags", {}).get("amenity") == "parking":
                r = B.ccw(B.clean_ring(B.way_xy(e)))
                c = B.poly_centroid(r)
                lots.append((math.dist(c, (ex, ey)), r))
        if lots:
            _, r = min(lots, key=lambda q: q[0])
            i = min(range(len(r)), key=lambda j: math.dist(r[j], (ex, ey)))
            (x0, y0), (x1, y1) = r[i], r[(i + 1) % len(r)]
            L = math.dist(r[i], r[(i + 1) % len(r)]) or 1
            ux, uy = (x1 - x0) / L, (y1 - y0) / L
            for k2 in range(4):
                sx, sy = x0 + ux * (2 + k2 * 3.6), y0 + uy * (2 + k2 * 3.6)
                if clear(sx, sy):
                    post_sign(b, mb, sx, sy, _bearing(uy, -ux), ["RESERVED", "ACCESSIBLE", "PARKING"], "blue", w=0.46)
                    n += 1
    # 5. wayfinding posts at footway junctions: building letters grouped by side
    nodes = {}
    for e in b.campus:
        if e["type"] == "way" and e.get("tags", {}).get("highway") in ("footway", "pedestrian"):
            for nid, g in zip(e.get("nodes", []), e.get("geometry", [])):
                nodes.setdefault(nid, [0, g])[0] += 1
    letters = [(bd["name"].split()[0], B.poly_centroid(bd["ring"])) for bd in b.buildings
               if bd["name"].endswith(" Building")]
    wf = 0
    for nid, (cnt, g) in nodes.items():
        if cnt < 2 or wf >= 10:
            continue
        x, y = B.ll2xy(g["lat"], g["lon"])
        sx, sy = x + 1.5, y + 1.5
        if not (inside(sx, sy, 2) and clear(sx, sy)):
            continue
        near = sorted(letters, key=lambda q: math.dist(q[1], (x, y)))[:6]
        east = " ".join(l for l, c in sorted(near) if c[0] >= x)
        west = " ".join(l for l, c in sorted(near) if c[0] < x)
        lines = [f"{west}  <" if west else "", f"> {east}" if east else ""]
        lines = [ln for ln in lines if ln] + ["OFFICE  GYM  PCPA"]
        post_sign(b, mb, sx, sy, 180.0, ["BUILDINGS"] + lines, "titan", w=0.8, line_h=0.1, top=2.5)
        wf += 1
        n += 1
    # 6. school zone signs on Espola Road approaching the frontage (both directions)
    espola = [B.way_xy(e) for e in b.surr if e["type"] == "way" and e.get("tags", {}).get("name") == "Espola Road"]
    spots = []
    for target, heading in (((400.0, 15.0), 0.0), ((400.0, 640.0), 180.0)):  # northbound below, southbound above
        best = None
        for pts in espola:
            for i in range(len(pts) - 1):
                (x0, y0), (x1, y1) = pts[i], pts[i + 1]
                L = math.dist(pts[i], pts[i + 1]) or 1
                t = max(0.0, min(1.0, ((target[0] - x0) * (x1 - x0) + (target[1] - y0) * (y1 - y0)) / (L * L)))
                px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                d = math.dist((px, py), target)
                if best is None or d < best[0]:
                    best = (d, px, py)
        if best:
            _, px, py = best
            # traffic heading `heading` (compass); drivers' right side; road half width ~ 9 m on Espola
            hx, hy = math.sin(math.radians(heading)), math.cos(math.radians(heading))
            rx, ry = hy, -hx
            spots.append((px + rx * 10.5, py + ry * 10.5, (heading + 180) % 360))
    if True:
        for (sx, sy, face) in spots:
            post_sign(b, mb, sx, sy, face, ["SCHOOL"], "ygreen", w=0.76, line_h=0.16, top=3.0, panel_h=0.76)
            post_sign(b, mb, sx, sy, face, ["SPEED", "LIMIT", "25"], "white", w=0.6, line_h=0.13, top=2.15, panel_h=0.75)
            post_sign(b, mb, sx, sy, face, ["WHEN CHILDREN", "ARE PRESENT"], "white", w=0.6, line_h=0.08, top=1.35,
                      panel_h=0.3)
            n += 3
    ob = mb.build("SIGNS_campus", b.col["Signs"], mats)
    ob["gtp_conform"] = "drape"
    ob["gtp_confidence"] = "procedural"
    building_names(b)
    return n


def building_names(b):
    """Big lettering: PCPA name on its Espola face, GYMNASIUM on the largest letter building,
    ADMINISTRATION and LIBRARY on the next buildings nearest the main drive (creative assignment)."""
    mats = [b.M["gold"], b.M["accent"]]
    ents = [B.ll2xy(e["lat"], e["lon"]) for e in b.campus if e["type"] == "node" and e.get("tags", {}).get("entrance")]
    ex, ey = ents[0] if ents else (380.0, 80.0)
    letter_blds = [bd for bd in b.buildings if bd["name"].endswith(" Building")]
    by_area = sorted(letter_blds, key=lambda bd: -abs(B.signed_area(bd["ring"])))
    gym = by_area[0] if by_area else None
    rest = sorted((bd for bd in letter_blds if bd is not gym),
                  key=lambda bd: math.dist(B.poly_centroid(bd["ring"]), (ex, ey)))
    plan = []
    pcpa = next((bd for bd in b.buildings if "Performing Arts" in bd["name"]), None)
    if pcpa:
        plan.append((pcpa, ["POWAY CENTER FOR THE", "PERFORMING ARTS"], (1.0, 0.0)))
    if gym:
        plan.append((gym, ["GYMNASIUM"], None))
    for bd, label in zip(rest[:2], (["ADMINISTRATION"], ["LIBRARY", "MEDIA CENTER"])):
        plan.append((bd, label, None))
    for bd, lines, face in plan:
        ring = bd["ring"]
        n = len(ring)
        best = None
        for i in range(n):
            (x1, y1), (x2, y2) = ring[i], ring[(i + 1) % n]
            L = math.dist(ring[i], ring[(i + 1) % n])
            if L < 8:
                continue
            nx, ny = (y2 - y1) / L, -(x2 - x1) / L
            score = L if face is None else L * (1 + 3 * (nx * face[0] + ny * face[1]))
            if best is None or score > best[0]:
                best = (score, i, L)
        if not best:
            continue
        _, i, L = best
        (x1, y1), (x2, y2) = ring[i], ring[(i + 1) % n]
        tx, ty = (x2 - x1) / L, (y2 - y1) / L
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        top = bd["top"]
        size = 0.75 if len(lines) == 1 else 0.6
        mb = B.MB()
        F = B.frame((mx, my, top - 0.9), (tx, ty))
        zt = 0.0
        for ln in lines:
            b.text_on(mb, F, ln, size, 0, z=zt, y=-0.06, max_w=L - 2, extrude=0.05)
            zt -= size * 1.3
        ob = mb.build(f"LETTERS_{bd['name'].replace(' ', '_')}", b.col["Signs"], mats)
        ob["gtp_conform"] = "rigid"
        ob["gtp_anchor_ref"] = f"BLD_{bd['name'].replace(' ', '_')}"
        ob["gtp_confidence"] = "procedural (building use assignment is illustrative)"
