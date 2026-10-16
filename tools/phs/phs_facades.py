"""Facade dressing and campus furniture for build_phs.py.

Public data fixes where buildings are, how big and how tall. Facades are not in any public dataset,
so this module dresses them procedurally in the style of a 1960s-2000s Southern California high
school (stucco wings, exterior covered walkways, classroom doors opening to the outside, aluminium
window bays, letter-coded buildings). Everything it adds is tagged gtp_confidence="procedural".
"""
import math

import numpy as np
from mathutils import Matrix, Vector

import build_phs as B

BAY = 3.6           # window bay spacing along a wall
DOOR_EVERY = 9.6    # classroom door spacing along a walkway wall
WALK_DEPTH = 2.8    # covered walkway depth


def letter_of(name):
    p = name.split()
    return p[0] if len(p) == 2 and p[1] == "Building" and len(p[0]) <= 2 else None


def campus_center(b):
    return B.poly_centroid(b.campus_ring())


def walkway_edges(b, bd):
    """Classroom wings get a covered walkway on their longest wall that faces the campus core."""
    if not letter_of(bd["name"]):
        return []
    ring = bd["ring"]
    area = abs(B.signed_area(ring))
    if area > 2600:  # gyms, big halls: no classroom doors
        return []
    cx, cy = campus_center(b)
    best = []
    for i in range(len(ring)):
        (x1, y1), (x2, y2) = ring[i], ring[(i + 1) % len(ring)]
        L = math.dist(ring[i], ring[(i + 1) % len(ring)])
        if L < 14:
            continue
        nx, ny = (y2 - y1) / L, -(x2 - x1) / L
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        facing = (cx - mx) * nx + (cy - my) * ny
        best.append((L * (1.5 if facing > 0 else 1.0), i))
    best.sort(reverse=True)
    return [i for _, i in best[:1]]


def plan_classroom_doors(b):
    """Add rigged classroom doors (single leaf, local x/y) along each walkway wall before walls are cut."""
    plan = {}
    for bd in b.buildings:
        lt = letter_of(bd["name"])
        for e in walkway_edges(b, bd):
            ring = bd["ring"]
            (x1, y1), (x2, y2) = ring[e], ring[(e + 1) % len(ring)]
            L = math.dist(ring[e], ring[(e + 1) % len(ring)])
            n = max(1, int((L - 4) / DOOR_EVERY))
            plan[(bd["id"], e)] = []
            rr = (n // 2 - 1, n // 2) if n >= 4 else ()  # one boys/girls restroom pair mid-wing
            num = 0
            for k in range(n):
                s = 2 + (L - 4) * (k + 0.5) / n
                x, y = x1 + (x2 - x1) * s / L, y1 + (y2 - y1) * s / L
                if k in rr:
                    room = "BOYS" if k == rr[0] else "GIRLS"
                else:
                    num += 1
                    room = f"{lt}-{num}"
                b.features.setdefault("doors", []).append({
                    "id": f"{lt}{k + 1}", "x": x, "y": y, "building": bd["name"], "leaves": 1, "width": 0.91,
                    "height": 2.13, "hinge": "left" if k % 2 else "right", "snap": 1.0, "room": room,
                    "source": "procedural classroom door", "confidence": "procedural"})
                plan[(bd["id"], e)].append((s, room))
                bays = b.__dict__.setdefault("_bays", [])
                bays.append({"building": bd["name"], "bid": bd["id"], "edge": e, "s": s,
                             "s0": 2 + (L - 4) * k / n, "s1": 2 + (L - 4) * (k + 1) / n, "room": room,
                             "type": ("restroom_boys" if room == "BOYS" else "restroom_girls" if room == "GIRLS"
                                      else "classroom"), "door_id": f"{lt}{k + 1}"})
    b._walkways = plan


def dress_buildings(b):
    mats = [b.M["glass"], b.M["frame"], b.M["trim"], b.M["concrete"], b.M["steel"], b.M["sign_white"],
            b.M["accent"], b.M["gold"], b.M["lamp"], b.M["soffit"]]
    GLASS, FRAME, TRIM, CONC, STEEL, WHITE, ACCENT, GOLD, LAMP, SOFFIT = range(10)
    for bd in b.buildings:
        ring = bd["ring"]
        n = len(ring)
        mb = B.MB()
        h = bd["height"]
        base_g = bd["ground"]
        stories = 2 if h > 7.5 else 1
        walk = {e: lst for (bid, e), lst in getattr(b, "_walkways", {}).items() if bid == bd["id"]}
        lt = letter_of(bd["name"])
        for i in range(n):
            (x1, y1), (x2, y2) = ring[i], ring[(i + 1) % n]
            L = math.dist(ring[i], ring[(i + 1) % n])
            if L < 2.0:
                continue
            tx, ty = (x2 - x1) / L, (y2 - y1) / L
            M = B.frame((x1, y1, 0), (tx, ty))  # local x along wall, -y outward, z absolute

            def gz(s):
                return b.world.g1(x1 + tx * s, y1 + ty * s)
            # plinth band (0.55 m darker base) and downspouts at both ends of long walls
            z0 = min(gz(0), gz(L))
            mb.box(M, 0, L, -0.025, 0.0, z0 - 0.3, max(gz(0), gz(L)) + 0.55, TRIM)
            if L > 10:
                for s in (0.35, L - 0.35):
                    mb.box(M, s - 0.06, s + 0.06, -0.14, -0.02, gz(s), bd["top"] - 0.1, TRIM)
            openings = [(o["s0"], o["s1"]) for o in bd["openings"].get(i, [])]
            on_walk = i in walk
            # windows: bays avoiding doors and corners; walkway walls get high windows beside doors
            for st in range(stories):
                sill = 0.95 + st * 3.9
                head = sill + (1.25 if on_walk else 1.55)
                if on_walk:
                    sill, head = 1.35 + st * 3.9, 2.45 + st * 3.9
                nb = int((L - 1.6) / BAY)
                for k in range(nb):
                    sc = 0.8 + BAY * (k + 0.5) + (L - 1.6 - nb * BAY) / 2
                    w = BAY - 1.2
                    a0, a1 = sc - w / 2, sc + w / 2
                    if any(a1 > o0 - 0.6 and a0 < o1 + 0.6 for o0, o1 in openings):
                        continue
                    g = gz(sc)
                    if g + head > bd["ground_med"] + h - 0.4:
                        continue
                    zs, zh = g + sill, g + head
                    mb.box(M, a0, a1, -0.03, 0.0, zs, zh, GLASS)
                    for (fx0, fx1, fz0, fz1) in ((a0 - 0.06, a0, zs - 0.06, zh + 0.06), (a1, a1 + 0.06, zs - 0.06, zh + 0.06),
                                                 (a0, a1, zh, zh + 0.06), (a0, a1, zs - 0.06, zs),
                                                 (sc - 0.03, sc + 0.03, zs, zh)):
                        mb.box(M, fx0, fx1, -0.07, 0.0, fz0, fz1, FRAME)
                    mb.box(M, a0 - 0.1, a1 + 0.1, -0.12, 0.0, zs - 0.12, zs - 0.06, TRIM)  # sill
            if on_walk:
                walkway(b, mb, bd, M, L, gz, walk[i], (CONC, STEEL, ACCENT, WHITE, LAMP, SOFFIT, TRIM))
            # wall pack light above every door on this wall
            for o0, o1 in openings:
                sc = (o0 + o1) / 2
                g = gz(sc)
                mb.box(M, sc - 0.15, sc + 0.15, -0.16, 0.0, g + 2.45, g + 2.62, LAMP)
        # building letter sign on the walkway wall (or longest wall): blue panel, gold letter
        if lt:
            ew = next(iter(walk), None)
            if ew is None:
                ew = max(range(n), key=lambda k: math.dist(ring[k], ring[(k + 1) % n]))
            (x1, y1), (x2, y2) = ring[ew], ring[(ew + 1) % n]
            L = math.dist(ring[ew], ring[(ew + 1) % n])
            tx, ty = (x2 - x1) / L, (y2 - y1) / L
            s = min(2.4, L / 4)
            g = b.world.g1(x1 + tx * s, y1 + ty * s)
            zc = min(g + 3.3, bd["top"] - 1.0)
            M = B.frame((x1 + tx * s, y1 + ty * s, zc), (tx, ty))
            off = -WALK_DEPTH - 0.05 if ew in walk else -0.04
            mb.box(M, -0.8, 0.8, off - 0.04, off, -0.8, 0.8, ACCENT)
            b.text_on(mb, M, lt, 1.15, GOLD, y=off - 0.045, extrude=0.03)
        if not mb.f:
            continue
        ob = mb.build(f"FACADE_{bd['name'].replace(' ', '_')}", b.col["Buildings"], mats)
        ob["gtp_conform"] = "rigid"
        ob["gtp_anchor_ref"] = f"BLD_{bd['name'].replace(' ', '_')}"
        ob["gtp_confidence"] = "procedural"


def walkway(b, mb, bd, M, L, gz, doors, mats):
    """Covered exterior walkway: concrete slab, steel columns, flat canopy with a coloured fascia,
    soffit lights, room-number plaques over the classroom doors."""
    CONC, STEEL, ACCENT, WHITE, LAMP, SOFFIT, TRIM = mats
    D = WALK_DEPTH
    g0 = min(gz(0), gz(L))
    zc = min(bd["ground_med"] + bd["height"] - 0.2, max(gz(0), gz(L)) + 3.25)
    mb.box(M, 0.0, L, -D, 0.0, g0 - 0.3, max(gz(s) for s in np.linspace(0, L, 6)) + 0.12, CONC)
    mb.box(M, -0.15, L + 0.15, -D - 0.15, 0.0, zc, zc + 0.12, SOFFIT)  # soffit / deck
    mb.box(M, -0.15, L + 0.15, -D - 0.2, -D - 0.15, zc - 0.25, zc + 0.35, ACCENT)  # fascia front
    for xe in (-0.15, L + 0.15):
        mb.box(M, xe - 0.05, xe, -D - 0.2, 0.0, zc - 0.25, zc + 0.35, ACCENT)
    ncol = max(2, int(L / 4.8) + 1)
    door_s = [s for s, _ in doors]
    for k in range(ncol):
        s = 0.3 + (L - 0.6) * k / (ncol - 1)
        if any(abs(s - ds) < 0.9 for ds in door_s):
            s += 1.2
        mb.box(M, s - 0.075, s + 0.075, -D + 0.1, -D + 0.25, g0 - 0.3, zc, STEEL)
    for k in range(int(L / 6)):
        s = 3 + k * 6
        mb.box(M, s - 0.2, s + 0.2, -D / 2 - 0.2, -D / 2 + 0.2, zc - 0.03, zc, LAMP)
    for s, room in doors:
        g = gz(s)
        Mp = B.frame((M @ Vector((s, 0, 0))).to_tuple(), (M.col[0].x, M.col[0].y))
        Mp = Matrix.Translation((0, 0, g + 2.4)) @ Mp
        mb.box(Mp, -0.28, 0.28, -0.03, 0.0, 0.0, 0.2, ACCENT)
        b.text_on(mb, Mp, room, 0.12, WHITE, z=0.1, y=-0.032)


# --------------------------------------------------------------------------- furniture

def furniture(b):
    import phs_details as DT  # noqa: PLC0415
    DT.detail_materials(b)
    mats = [b.M["steel"], b.M["wood"], b.M["concrete"], b.M["accent"], b.M["lamp"], b.M["galv_dark"],
            b.M["flag_us"], b.M["flag_ca"], b.M["trash"], b.M["umbrella"]]
    ST, WOOD, CONC, ACC, LAMP, GALV, FUS, FCA, TRASH, UMB = range(10)
    mb = B.MB()
    rng = np.random.default_rng(7)
    occupied = []
    blds = [bd["ring"] for bd in b.buildings]

    def free(x, y, r=1.5):
        if any(B.points_in_poly([x], [y], ring)[0] or B.dist_to_ring([x], [y], ring)[0] < r for ring in blds):
            return False
        return all(math.dist((x, y), o) > r for o in occupied)

    def z(x, y):
        return b.world.g1(x, y)

    # lunch tables in the paved quads (OSM pedestrian areas), on a 6 m grid
    for e in b.campus:
        t = e.get("tags", {})
        if e["type"] == "way" and t.get("highway") == "pedestrian" and t.get("area") == "yes":
            ring = B.ccw(B.clean_ring(B.way_xy(e)))
            xs, ys = [p[0] for p in ring], [p[1] for p in ring]
            cnt = 0
            for gx in np.arange(min(xs) + 4, max(xs) - 4, 6.5):
                for gy in np.arange(min(ys) + 4, max(ys) - 4, 6.5):
                    if cnt >= 28 or not B.points_in_poly([gx], [gy], ring)[0] or B.dist_to_ring([gx], [gy], ring)[0] < 3:
                        continue
                    if not free(gx, gy, 2.5):
                        continue
                    picnic_table(mb, gx, gy, z(gx, gy), rng.uniform(0, math.pi), (ST, WOOD, UMB), umbrella=cnt % 3 == 0)
                    occupied.append((gx, gy))
                    cnt += 1
    # benches, trash cans and lamp posts along campus footways
    acc = 0.0
    for e in b.campus:
        t = e.get("tags", {})
        if e["type"] != "way" or t.get("highway") not in ("footway", "pedestrian") or t.get("area") == "yes":
            continue
        pts = B.way_xy(e)
        for i in range(len(pts) - 1):
            (x1, y1), (x2, y2) = pts[i], pts[i + 1]
            L = math.dist(pts[i], pts[i + 1])
            if L < 1:
                continue
            ux, uy = (x2 - x1) / L, (y2 - y1) / L
            s = 0.0
            while s < L:
                acc += 1
                px, py = x1 + ux * s, y1 + uy * s
                side = 1 if int(acc) % 2 else -1
                ox, oy = px - uy * side * 1.8, py + ux * side * 1.8
                kind = int(acc) % 3
                if free(ox, oy, 1.2):
                    if kind == 0:
                        lamp_post(mb, ox, oy, z(ox, oy), (GALV, LAMP))
                    elif kind == 1:
                        bench(mb, ox, oy, z(ox, oy), math.atan2(uy, ux), (ST, WOOD))
                    else:
                        trash_can(mb, ox, oy, z(ox, oy), (TRASH, ST))
                    occupied.append((ox, oy))
                s += 11.0
    # flagpoles and bike racks by the main entrance (OSM entrance=main)
    ents = [B.ll2xy(e["lat"], e["lon"]) for e in b.campus if e["type"] == "node" and e.get("tags", {}).get("entrance")]
    if ents:
        ex, ey = ents[0]
        for k, (dx, fl) in enumerate(((-4, FUS), (0, FCA), (4, None))):
            fx, fy = ex + 14 + dx * 0.0, ey - 10 + dx
            if not free(fx, fy, 0.8):
                fx += 3
            flagpole(mb, fx, fy, z(fx, fy), 12.0 if k == 0 else 10.5, fl, (GALV, CONC))
            occupied.append((fx, fy))
        for k in range(6):
            rx, ry = ex + 6 + k * 0.9, ey - 18
            if free(rx, ry, 0.4):
                bike_rack(mb, rx, ry, z(rx, ry), (GALV,))
    if mb.f:
        ob = mb.build("Campus_Furniture", b.col["Structures"], mats)
        ob["gtp_conform"] = "drape"
        ob["gtp_confidence"] = "procedural"
    marquee(b)


def picnic_table(mb, x, y, z, a, mats, umbrella=False):
    ST, WOOD, UMB = mats
    M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(a, 4, "Z")
    mb.box(M, -1.0, 1.0, -0.4, 0.4, 0.72, 0.76, WOOD)
    for sy in (-0.75, 0.75):
        mb.box(M, -1.0, 1.0, sy - 0.15, sy + 0.15, 0.43, 0.47, WOOD)
    for sx in (-0.7, 0.7):
        mb.box(M, sx - 0.04, sx + 0.04, -0.85, 0.85, 0.3, 0.34, ST)
        mb.box(M, sx - 0.04, sx + 0.04, -0.04, 0.04, 0.0, 0.72, ST)
    if umbrella:
        mb.cylinder(M, 0.025, 0.72, 2.3, ST, seg=6)
        ring = [M @ Vector((1.3 * math.cos(2 * math.pi * k / 8), 1.3 * math.sin(2 * math.pi * k / 8), 2.05)) for k in range(8)]
        top = M @ Vector((0, 0, 2.35))
        for k in range(8):
            mb.poly([ring[k], ring[(k + 1) % 8], top], UMB)


def bench(mb, x, y, z, a, mats):
    ST, WOOD = mats
    M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(a, 4, "Z")
    mb.box(M, -0.9, 0.9, -0.22, 0.22, 0.43, 0.47, WOOD)
    mb.box(M, -0.9, 0.9, 0.2, 0.24, 0.5, 0.85, WOOD)
    for sx in (-0.75, 0.75):
        mb.box(M, sx - 0.03, sx + 0.03, -0.2, 0.24, 0.0, 0.47, ST)


def trash_can(mb, x, y, z, mats):
    TR, ST = mats
    M = Matrix.Translation((x, y, z))
    mb.cylinder(M, 0.3, 0.0, 0.95, TR, seg=12)
    mb.cylinder(M, 0.33, 0.95, 1.02, ST, seg=12)


def lamp_post(mb, x, y, z, mats):
    G, L = mats
    M = Matrix.Translation((x, y, z))
    mb.cylinder(M, 0.07, -0.3, 4.2, G, seg=8)
    mb.box(M, -0.22, 0.22, -0.22, 0.22, 4.2, 4.5, G)
    mb.box(M, -0.17, 0.17, -0.17, 0.17, 4.05, 4.2, L)


def flagpole(mb, x, y, z, h, flag, mats):
    G, C = mats
    M = Matrix.Translation((x, y, z))
    mb.cylinder(M, 0.6, -0.2, 0.25, C, seg=12)
    mb.cylinder(M, 0.07, 0.25, h, G, seg=8)
    mb.cylinder(M, 0.1, h, h + 0.15, G, seg=8)
    if flag is not None:
        fw, fh = 1.83, 0.97
        P = [M @ Vector((0.08, 0, h - 0.2 - fh)), M @ Vector((0.08 + fw, 0, h - 0.2 - fh)),
             M @ Vector((0.08 + fw, 0, h - 0.2)), M @ Vector((0.08, 0, h - 0.2))]
        mb.poly(P, flag, [(0, 0), (1, 0), (1, 1), (0, 1)])


def bike_rack(mb, x, y, z, mats):
    (G,) = mats
    for k in range(9):
        a = math.pi * k / 8
        p0 = (x, y - 0.35 * math.cos(a), z + 0.45 + 0.4 * math.sin(a))
        a2 = math.pi * (k + 1) / 8
        p1 = (x, y - 0.35 * math.cos(a2), z + 0.45 + 0.4 * math.sin(a2))
        if k < 8:
            from phs_details import pipe  # noqa: PLC0415
            pipe(mb, p0, p1, 0.025, G, seg=5)
    from phs_details import pipe  # noqa: PLC0415
    for sy in (-0.35, 0.35):
        pipe(mb, (x, y + sy, z), (x, y + sy, z + 0.45), 0.025, G, seg=5)


def marquee(b):
    """Monument + LED message board on the Espola Rd frontage (position from the 2023 aerial)."""
    s = {"id": "marquee", "kind": "monument", "x": 397.0, "y": 147.5}
    mats = [b.M["monument"], b.M["accent"], b.M["marquee_led"], b.M["gold"], b.M["sign_white"], b.M["concrete"]]
    MON, ACC, LED, GOLD, WHITE, CONC = range(6)
    x, y = s["x"], s["y"]
    z = b.world.g1(x, y)
    facing = (1.0, 0.0)  # toward Espola Road (east)
    right = (-facing[1], facing[0])
    mb = B.MB()
    for side, rgt in ((1, right), (-1, (-right[0], -right[1]))):
        F = B.frame((x, y, z), rgt)
        if side == 1:
            mb.box(F, -3.2, 3.2, -0.45, 0.45, -0.3, 0.6, CONC)          # planter base
            mb.box(F, -3.0, 3.0, -0.3, 0.3, 0.6, 3.6, MON)              # masonry body
            mb.box(F, -3.1, 3.1, -0.35, 0.35, 3.6, 3.75, CONC)          # cap
        mb.box(F, -2.8, 2.8, -0.32, -0.3, 2.65, 3.45, ACC)              # name band
        b.text_on(mb, F, "POWAY HIGH SCHOOL", 0.36, GOLD, z=3.05, y=-0.325, max_w=5.4, extrude=0.02)
        mb.box(F, -2.6, 2.6, -0.33, -0.3, 0.85, 2.45, LED)              # LED board
        b.text_on(mb, F, "HOME OF THE TITANS", 0.3, WHITE, z=2.05, y=-0.335, max_w=5.0)
        b.text_on(mb, F, "GO TITANS!", 0.3, WHITE, z=1.35, y=-0.335, max_w=5.0)
    ob = mb.build("SIGN_marquee", b.col["Signs"], mats)
    B.tag(ob, "sign", "marquee", text="POWAY HIGH SCHOOL | HOME OF THE TITANS",
          confidence="position from the 2023 aerial; design and message are illustrative")
    ob["gtp_conform"] = "rigid"


def extra_materials(b):
    M = b.M
    M["accent"] = B.material("Accent_TitanBlue", B.srgb(b.features.get("colors", {}).get("accent", "#1f3f7a")), 0.5)
    M["gold"] = B.material("Accent_Gold", B.srgb(b.features.get("colors", {}).get("gold", "#d6a21e")), 0.35, 0.6)
    M["soffit"] = B.material("Soffit_White", B.srgb("#ecebe6"), 0.8)
    M["wood"] = B.material("Recycled_Plank", B.srgb("#6b4f3a"), 0.8)
    M["trash"] = B.material("Trash_Can_Green", B.srgb("#2f4a35"), 0.6, 0.3)
    M["umbrella"] = B.material("Umbrella_Canvas", B.srgb("#1f3f7a"), 0.9)
    M["flag_us"] = B.material("Flag_US", (1, 1, 1), 0.8, image=us_flag())
    M["flag_ca"] = B.material("Flag_CA", (1, 1, 1), 0.8, image=ca_flag())
    if "monument" not in M:
        M["monument"] = B.material("Monument_Masonry", B.srgb("#9c8c78"), 0.9)


def us_flag():
    h, w = 130, 247
    a = np.ones((h, w, 4), np.float32)
    red = np.array([0.70, 0.13, 0.20])
    for k in range(13):
        if k % 2 == 0:
            a[h - (k + 1) * 10: h - k * 10, :, :3] = red
    a[h - 70:, :99, :3] = (0.24, 0.23, 0.43)
    for r in range(9):
        for c in range(11 if r % 2 == 0 else 10):
            cx = 4 + c * 8 + (4 if r % 2 else 0)
            cy = h - 4 - r * 7
            if cx < 97:
                a[cy - 1:cy + 1, cx - 1:cx + 1, :3] = 1
    return B.make_image("flag_us", a)


def ca_flag():
    h, w = 120, 180
    a = np.ones((h, w, 4), np.float32)
    a[:16, :, :3] = (0.72, 0.13, 0.2)            # red stripe at the bottom (row 0 = bottom)
    a[60:70, 60:120, :3] = (0.45, 0.3, 0.15)      # simplified bear silhouette
    a[70:84, 70:115, :3] = (0.45, 0.3, 0.15)
    a[100:108, 8:22, :3] = (0.72, 0.13, 0.2)      # star
    return B.make_image("flag_ca", a)


def export_rooms(b):
    """Room rectangles behind each walkway door, in the campus frame, for the game's interior builder.
    corners are CCW from above; corners[0]->[1] is the front (walkway) wall. floor_rel is the floor height relative
    to the building's rigid anchor (the game adds the building's runtime ground offset)."""
    rooms = []
    for bay in getattr(b, "_bays", []):
        bd = next(x for x in b.buildings if x["id"] == bay["bid"])
        ring = bd["ring"]
        e = bay["edge"]
        (x1, y1), (x2, y2) = ring[e], ring[(e + 1) % len(ring)]
        L = math.dist(ring[e], ring[(e + 1) % len(ring)])
        tx, ty = (x2 - x1) / L, (y2 - y1) / L
        ix, iy = -ty, tx  # inward (left of a CCW edge)
        s0, s1 = bay["s0"] + 0.1, bay["s1"] - 0.1
        # depth: march inward until any of three probes leaves the footprint, cap 10 m
        depth = 0.0
        for d in np.arange(0.5, 10.01, 0.25):
            probes = [(x1 + tx * s + ix * d, y1 + ty * s + iy * d) for s in (s0 + 0.2, (s0 + s1) / 2, s1 - 0.2)]
            if all(B.points_in_poly([px], [py], ring)[0] and B.dist_to_ring([px], [py], ring)[0] > 0.15
                   for px, py in probes):
                depth = d
            else:
                break
        if depth < 4.0:
            continue
        c = [(x1 + tx * s0, y1 + ty * s0), (x1 + tx * s1, y1 + ty * s1),
             (x1 + tx * s1 + ix * depth, y1 + ty * s1 + iy * depth), (x1 + tx * s0 + ix * depth, y1 + ty * s0 + iy * depth)]
        # corners 0->1 run along the wall direction; with inward = left, (0,1,2,3) is CCW from above
        door = next((dd for dd in b.doors if dd["d"].get("id") == bay["door_id"]), None)
        sill = None
        if door is not None:
            o = next(o for o in door["b"]["openings"][door["edge"]] if o["door"] is door["d"])
            sill = o.get("sill")
        floor_abs = sill if sill is not None else b.world.g1((c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2)
        g_anchor = b._anchor_g.get(f"BLD_{bd['name'].replace(' ', '_')}") if hasattr(b, "_anchor_g") else None
        floor_rel = floor_abs - (g_anchor if g_anchor is not None else bd["ground"])
        wins = []
        for k in range(int((L - 1.6) / BAY)):
            sc = 0.8 + BAY * (k + 0.5) + (L - 1.6 - int((L - 1.6) / BAY) * BAY) / 2
            w = BAY - 1.2
            if s0 < sc - w / 2 and sc + w / 2 < s1 and not any(
                    sc + w / 2 > o["s0"] - 0.6 and sc - w / 2 < o["s1"] + 0.6 for o in bd["openings"].get(e, [])):
                wins.append({"along": round(sc - s0, 2), "width": round(w, 2), "sill": 1.35, "head": 2.45})
        rooms.append({"id": bay["room"] if bay["type"] == "classroom" else f"{bd['name'][0]}-{bay['room']}",
                      "number": bay["room"], "building": bd["name"], "type": bay["type"],
                      "anchor_ref": f"BLD_{bd['name'].replace(' ', '_')}",
                      "corners": [[round(px, 2), round(py, 2)] for px, py in c],
                      "floor_rel": round(floor_rel, 3), "height": round(min(3.2, bd["height"] - 0.5), 2),
                      "door": {"node": f"DOOR_{bay['door_id']}_0", "along": round(bay["s"] - s0, 2), "width": 0.91},
                      "windows": wins})
    return rooms
