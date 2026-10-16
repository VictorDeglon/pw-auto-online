"""Detail generators for build_phs.py: sports markings, bleachers, carports, portables, rooftop
equipment, fences, poles, scoreboard and other campus furniture.

Inputs come from data files written by the detection pass (all in the campus local frame,
metres east/north of lat 32.99612, lon -117.0280522):

    data/structures.json        [{id, kind, x, y, l, w, h, rot_deg, polyline?, details?, ...}]
    data/roof_equipment.json    [{building, kind, x, y, l, w, h, rot_deg, confidence}]

Oriented rectangles: (x, y) is the centre, l the long side, w the short side, rot_deg the
direction of the long side measured counter-clockwise from +x (east).
"""
import json
import math

import bpy
import numpy as np
from mathutils import Matrix, Vector

import build_phs as B

FT = 0.3048
YD = 0.9144


# --------------------------------------------------------------------------- helpers

def rect_M(x, y, z, rot_deg):
    """Frame at (x, y, z) whose +x runs along rot_deg (CCW from east), +z up."""
    a = math.radians(rot_deg)
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(a, 4, "Z")


def oriented_rect(ring):
    """Minimum-area oriented rectangle of a polygon: (cx, cy, l, w, rot_deg)."""
    pts = np.array(ring, dtype=float)
    best = None
    for i in range(len(pts)):
        d = pts[(i + 1) % len(pts)] - pts[i]
        L = np.hypot(*d)
        if L < 1e-6:
            continue
        u = d / L
        v = np.array([-u[1], u[0]])
        pu, pv = pts @ u, pts @ v
        area = (pu.max() - pu.min()) * (pv.max() - pv.min())
        if best is None or area < best[0]:
            cu, cv = (pu.max() + pu.min()) / 2, (pv.max() + pv.min()) / 2
            c = u * cu + v * cv
            lu, lv = pu.max() - pu.min(), pv.max() - pv.min()
            ang = math.degrees(math.atan2(u[1], u[0]))
            if lv > lu:
                lu, lv, ang = lv, lu, ang + 90
            best = (area, (float(c[0]), float(c[1]), float(lu), float(lv), ang % 180))
    return best[1]


def flat_quad(mb, M, x0, x1, y0, y1, z, mat):
    P = [M @ Vector((x0, y0, z)), M @ Vector((x1, y0, z)), M @ Vector((x1, y1, z)), M @ Vector((x0, y1, z))]
    mb.poly(P, mat, [(0, 0), (x1 - x0, 0), (x1 - x0, y1 - y0), (0, y1 - y0)])


def flat_line(mb, M, a, b, width, z, mat):
    (x1, y1), (x2, y2) = a, b
    L = math.hypot(x2 - x1, y2 - y1)
    if L < 1e-6:
        return
    nx, ny = -(y2 - y1) / L * width / 2, (x2 - x1) / L * width / 2
    P = [M @ Vector((x1 - nx, y1 - ny, z)), M @ Vector((x2 - nx, y2 - ny, z)),
         M @ Vector((x2 + nx, y2 + ny, z)), M @ Vector((x1 + nx, y1 + ny, z))]
    mb.poly(P, mat)


def flat_arc(mb, M, cx, cy, r, a0, a1, width, z, mat, seg=None):
    seg = seg or max(8, int(abs(a1 - a0) * r / 0.5))
    pts = [(cx + r * math.cos(a0 + (a1 - a0) * i / seg), cy + r * math.sin(a0 + (a1 - a0) * i / seg))
           for i in range(seg + 1)]
    for i in range(seg):
        flat_line(mb, M, pts[i], pts[i + 1], width, z, mat)


def flat_disc(mb, M, cx, cy, r, z, mat, seg=24):
    c = M @ Vector((cx, cy, z))
    ring = [M @ Vector((cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg), z))
            for i in range(seg)]
    for i in range(seg):
        mb.poly([c, ring[i], ring[(i + 1) % seg]], mat)


def flat_text(b, mb, M, text, size, x, y, z, rot, mat, max_w=None):
    me = B.text_mesh(text, size)
    w = B.mesh_width(me)
    sx = (max_w / w) if (max_w and w > max_w) else 1.0
    T = M @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Diagonal((sx, 1, 1, 1))
    mb.add_mesh(me, T, mat)
    bpy.data.meshes.remove(me)


def pipe(mb, a, b, r, mat, seg=6):
    """Cylinder between two world points."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    if L < 1e-6:
        return
    q = d.to_track_quat("Z", "Y")
    M = Matrix.Translation(a) @ q.to_matrix().to_4x4()
    mb.cylinder(M, r, 0, L, mat, seg=seg)


def load_list(name):
    for cand in (B.DATA / name.replace(".json", ".verified.json"), B.DATA / name):
        if cand.exists():
            return json.loads(cand.read_text())
    return []


# --------------------------------------------------------------------------- materials

def detail_materials(b):
    M = b.M
    if "aluminium" in M:
        return
    M["aluminium"] = B.material("Aluminium_Bleacher", B.srgb("#c9cdd0"), 0.35, 0.9)
    M["galv_dark"] = B.material("Steel_Structural", B.srgb("#6f7377"), 0.5, 0.8)
    M["pv"] = B.material("Solar_PV", (0.02, 0.03, 0.07), 0.12, 0.2, image=pv_image(), uv_scale=None)
    M["pv_frame"] = B.material("Solar_Frame", B.srgb("#b8bcc0"), 0.4, 0.9)
    M["hvac"] = B.material("HVAC_Cabinet", B.srgb("#d9d6cc"), 0.55, 0.2)
    M["hvac_fan"] = B.material("HVAC_FanGrille", (0.05, 0.05, 0.05), 0.6, 0.4)
    M["corrugated"] = B.material("Metal_Corrugated", B.srgb("#d8d4c8"), 0.5, 0.6, image=corrugated_image(),
                                 uv_scale=1.0)
    M["portable_wall"] = B.material("Portable_Siding", B.srgb("#c9b99a"), 0.8, image=siding_image(),
                                    uv_scale=1.0)
    M["cmu"] = B.material("CMU_Block", B.srgb("#b7ada0"), 0.9, image=cmu_image(), uv_scale=1.0)
    M["net"] = B.material("Netting", (0.05, 0.05, 0.05), 0.8, image=net_image(), alpha_clip=True, uv_scale=1 / 0.1)
    M["scoreboard"] = B.material("Scoreboard_Face", B.srgb("#13294b"), 0.4)
    M["digits"] = B.material("Scoreboard_LED", (0.05, 0.02, 0.0), 0.3, emit=(1.0, 0.55, 0.1), emit_strength=5.0)
    M["goalpost"] = B.material("Goalpost_Yellow", B.srgb("#f2c80f"), 0.4, 0.3)
    M["base_white"] = B.material("Base_White", B.srgb("#f4f4f0"), 0.5)
    M["rubber"] = B.material("Pitching_Rubber", B.srgb("#f4f4f0"), 0.6)
    M["container_colors"] = [B.material(f"Container_{c}", B.srgb(c), 0.6, 0.5, image=corrugated_image(), uv_scale=1.0)
                             for c in ("#8b2b22", "#2b4f7a", "#3f6b3a", "#a8752a", "#7a7a7a")]
    M["court_green"] = B.material("Court_Green", B.srgb("#3d7a4f"), 0.6)
    M["concrete_floor"] = B.material("Concrete_Slab", B.srgb("#a9a59d"), 0.85)
    M["zone_marker"] = B.material("Zone_Volume_Invisible", (1, 0, 1), 1.0)
    M["lamp_off"] = B.material("Lamp_Lens", (0.85, 0.85, 0.8), 0.2, emit=(1, 0.97, 0.9), emit_strength=0.5)


def pv_image():
    """Mono-PERC look: dark cells with thin silver busbars, one 6x10 module per 1 m x 1.7 m tile."""
    w, h = 96, 160
    a = np.zeros((h, w, 4), np.float32)
    a[..., 0], a[..., 1], a[..., 2], a[..., 3] = 0.02, 0.035, 0.08, 1
    yy, xx = np.mgrid[0:h, 0:w]
    cell = ((xx % 16) < 1) | ((yy % 16) < 1)
    a[cell, :3] = 0.55
    frame = (xx < 2) | (xx > w - 3) | (yy < 2) | (yy > h - 3)
    a[frame, :3] = 0.7
    return B.make_image("pv_module", a)


def corrugated_image():
    n = 64
    x = np.linspace(0, 2 * np.pi * 8, n)
    s = 0.85 + 0.15 * np.sin(x)
    a = np.ones((n, n, 4), np.float32)
    for i in range(3):
        a[..., i] = s[None, :]
    return B.make_image("corrugated", a)


def siding_image():
    n = 64
    a = np.ones((n, n, 4), np.float32)
    grooves = (np.arange(n) % 16) < 1
    a[:, grooves, :3] = 0.7
    return B.make_image("t111_siding", a)


def cmu_image():
    """8x16 in concrete block running bond, 1 m tile = 2.5 blocks wide x 5 courses."""
    w, h = 250, 250
    a = np.ones((h, w, 4), np.float32) * 0.95
    a[..., 3] = 1
    yy, xx = np.mgrid[0:h, 0:w]
    course = yy // 50
    off = (course % 2) * 50
    joint = ((yy % 50) < 2) | (((xx + off) % 100) < 2)
    a[joint, :3] = 0.7
    return B.make_image("cmu_block", a)


def net_image():
    n = 32
    a = np.zeros((n, n, 4), np.float32)
    yy, xx = np.mgrid[0:n, 0:n]
    a[((xx % 16) < 1) | ((yy % 16) < 1), :] = (0.05, 0.05, 0.05, 1)
    return B.make_image("netting", a)


# --------------------------------------------------------------------------- sports surfaces

def sports_markings(b):
    """White lines and numbers on the football field, track lanes, tennis/basketball courts, baseball
    diamonds. Built from OSM pitch polygons, which fixes position and orientation; dimensions are the
    rule-book values (NFHS for football/basketball, ITF tennis, NFHS/ASA baseball/softball)."""
    detail_materials(b)
    mats = [b.M["paint_w"], b.M["paint_y"], b.M["clay"], b.M["base_white"], b.M["grass"], b.M["steel"],
            b.M["net"], b.M["goalpost"], b.M["sign_white"]]
    W, Y, CLAY, BASE, GRASS, STEEL, NET, GOAL, TXT = range(9)
    mb = B.MB()
    props = B.MB()
    cfg = b.features.get("field", {})
    for e in b.campus:
        t = e.get("tags", {})
        if e["type"] != "way" or t.get("leisure") != "pitch":
            continue
        ring = B.ccw(B.clean_ring(B.way_xy(e)))
        if len(ring) < 3:
            continue
        sport = t.get("sport", "")
        if sport == "american_football":
            football(b, mb, props, ring, cfg, (W, Y, TXT, GOAL))
        elif sport == "tennis":
            tennis(b, mb, props, ring, (W, STEEL, NET))
        elif sport == "basketball":
            basketball(b, mb, props, ring, (W, STEEL, BASE))
        elif sport in ("baseball", "softball"):
            diamond(b, mb, props, ring, (W, CLAY, BASE, GRASS))
    track_lanes(b, mb, W)
    if mb.f:
        ob = mb.build("Field_Markings", b.col["Ground"], mats)
        ob["gtp_conform"] = "drape"
    if props.f:
        props.build("Sports_Equipment", b.col["Ground"], mats)


def _ground_z(b, M, lx, ly):
    p = M @ Vector((lx, ly, 0))
    return b.world.g1(p.x, p.y)


def football(b, mb, props, ring, cfg, mats):
    W, Y, TXT, GOAL = mats
    cx, cy, l, w, rot = oriented_rect(ring)
    M = rect_M(cx, cy, 0, rot)
    L, Wd = 120 * YD, 160 * FT  # 360 ft x 160 ft incl. end zones
    hx, hy = L / 2, Wd / 2
    lift = 0.15

    def z(lx, ly):
        return _ground_z(b, M, lx, ly) + lift

    def line(a, c, width=0.1, m=W):
        # split long lines so they follow terrain
        n = max(1, int(math.dist(a, c) / 4))
        for i in range(n):
            p0 = (a[0] + (c[0] - a[0]) * i / n, a[1] + (c[1] - a[1]) * i / n)
            p1 = (a[0] + (c[0] - a[0]) * (i + 1) / n, a[1] + (c[1] - a[1]) * (i + 1) / n)
            zz = z((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
            flat_line(mb, M, p0, p1, width, zz, m)

    # boundary (6 ft limit line is optional; draw the 4 in boundary)
    for a, c in (((-hx, -hy), (hx, -hy)), ((-hx, hy), (hx, hy)), ((-hx, -hy), (-hx, hy)), ((hx, -hy), (hx, hy))):
        line(a, c, 0.1)
    for k in range(0, 21):  # goal lines and yard lines every 5 yd
        x = -50 * YD + k * 5 * YD
        line((x, -hy), (x, hy), 0.1)
    hash_y = 53 * FT + 4 / 12 * FT  # NFHS hash marks 53'4" in from each sideline
    for k in range(1, 100):
        if k % 5 == 0:
            continue
        x = -50 * YD + k * YD
        for side in (-1, 1):
            yb = side * hy
            line((x, yb - side * 0.6), (x, yb), 0.1)
            yh = side * (hy - hash_y)
            line((x, yh - 0.3), (x, yh + 0.3), 0.1)
    # yard numbers: 6 ft tall, tops 9 yd from the sideline, facing the near sideline
    for k, num in enumerate(("10", "20", "30", "40", "50", "40", "30", "20", "10")):
        x = -40 * YD + k * 10 * YD
        for side in (-1, 1):
            ny = side * (hy - 9 * YD - 0.9)
            flat_text(b, mb, M, num, 1.83, x, ny, z(x, ny) + 0.01, 0 if side < 0 else math.pi, W)
    # midfield logo and end zone lettering from features.json (or the defaults seen on the aerial)
    logo = cfg.get("center_logo", "P")
    if logo:
        flat_text(b, mb, M, logo, float(cfg.get("center_logo_size", 7.0)), 0, 0, z(0, 0) + 0.01, 0,
                  Y if cfg.get("center_logo_color", "yellow") == "yellow" else W)
    for side, word in ((-1, cfg.get("endzone_south", "POWAY")), (1, cfg.get("endzone_north", "TITANS"))):
        if word:
            ex = side * 55 * YD
            flat_text(b, mb, M, word, 3.0, ex, 0, z(ex, 0) + 0.01, -side * math.pi / 2, W, max_w=Wd - 6)
    # goal posts: NFHS 23'4" between uprights, crossbar 10 ft, uprights 10 ft above the bar, gooseneck offset
    for side in (-1, 1):
        ex = side * (hx + 0.0)
        g = _ground_z(b, M, ex, 0)
        base = M @ Vector((ex + side * 1.8, 0, g))
        bar = M @ Vector((ex, 0, g + 10 * FT))
        pipe(props, base, (base.x, base.y, g + 3.2), 0.11, GOAL)
        pipe(props, (base.x, base.y, g + 3.2), bar, 0.09, GOAL)
        half = 23 * FT / 2 + 2 / 12 * FT
        l0, l1 = M @ Vector((ex, -half, g + 10 * FT)), M @ Vector((ex, half, g + 10 * FT))
        pipe(props, l0, l1, 0.07, GOAL)
        for p in (l0, l1):
            pipe(props, p, (p.x, p.y, p.z + 20 * FT), 0.06, GOAL)


def track_lanes(b, mb, mat):
    """Lane lines every 1.22 m outward from the inner kerb of the OSM track ring."""
    for e in b.campus:
        t = e.get("tags", {})
        if e["type"] != "relation" or t.get("leisure") != "track":
            continue
        inners = B.relation_rings(e, "inner")
        outers = B.relation_rings(e, "outer")
        if not inners or not outers:
            continue
        inner = B.ccw(inners[0])
        outer = B.ccw(outers[0])
        width_avail = np.median(B.dist_to_ring([p[0] for p in inner], [p[1] for p in inner], outer))
        lanes = int(min(8, max(4, round(width_avail / 1.22))))
        for k in range(0, lanes + 1):
            ring = B.Builder._inset(inner, -k * 1.22) if k else inner
            if not ring:
                continue
            pts = list(ring) + [ring[0]]
            b.ribbon(mb, pts, 0.05, mat, 0.16, sample=1.5)


def tennis(b, mb, props, ring, mats):
    W, STEEL, NET = mats
    cx, cy, l, w, rot = oriented_rect(ring)
    M = rect_M(cx, cy, 0, rot)
    L, Dw, Sw = 23.77, 10.97, 8.23
    g = _ground_z(b, M, 0, 0) + 0.16

    def line(a, c):
        flat_line(mb, M, a, c, 0.05, g, W)
    for y in (-Dw / 2, Dw / 2, -Sw / 2, Sw / 2):
        line((-L / 2, y), (L / 2, y))
    for x in (-L / 2, L / 2):
        line((x, -Dw / 2), (x, Dw / 2))
    for x in (-6.40, 6.40):
        line((x, -Sw / 2), (x, Sw / 2))
    line((-6.40, 0), (6.40, 0))
    for x in (-L / 2, L / 2):
        line((x, -0.0), (x - math.copysign(0.10, x), 0.0))
    # net: posts 0.914 m outside the doubles lines, 1.07 m high at posts
    gz = g - 0.16
    for s in (-1, 1):
        p = M @ Vector((0, s * (Dw / 2 + 0.914), gz))
        pipe(props, p, (p.x, p.y, gz + 1.07), 0.04, STEEL)
    a = M @ Vector((0, -(Dw / 2 + 0.914), gz + 0.1))
    c = M @ Vector((0, Dw / 2 + 0.914, gz + 0.1))
    a1 = M @ Vector((0, -(Dw / 2 + 0.914), gz + 1.07))
    c1 = M @ Vector((0, Dw / 2 + 0.914, gz + 1.07))
    mid = M @ Vector((0, 0, gz + 0.914))
    props.poly([a, c, c1, mid, a1], NET, [(0, 0), (1, 0), (1, 1), (0.5, 0.86), (0, 1)])


def basketball(b, mb, props, ring, mats):
    W, STEEL, BASE = mats
    cx, cy, l, w, rot = oriented_rect(ring)
    M = rect_M(cx, cy, 0, rot)
    L, Wd = min(84 * FT, l - 1.0), min(50 * FT, w - 1.0)
    g = _ground_z(b, M, 0, 0) + 0.16

    def line(a, c):
        flat_line(mb, M, a, c, 0.05, g, W)
    for a, c in (((-L / 2, -Wd / 2), (L / 2, -Wd / 2)), ((-L / 2, Wd / 2), (L / 2, Wd / 2)),
                 ((-L / 2, -Wd / 2), (-L / 2, Wd / 2)), ((L / 2, -Wd / 2), (L / 2, Wd / 2)),
                 ((0, -Wd / 2), (0, Wd / 2))):
        line(a, c)
    flat_arc(mb, M, 0, 0, 1.83, 0, 2 * math.pi, 0.05, g, W)
    for s in (-1, 1):
        bx = s * L / 2
        hoop = bx - s * (4 * FT + 0.23)
        key_x = bx - s * 19 * FT
        for y in (-6 * FT, 6 * FT):
            line((bx, y), (key_x, y))
        line((key_x, -6 * FT), (key_x, 6 * FT))
        flat_arc(mb, M, key_x, 0, 6 * FT, -math.pi / 2 * s + (0 if s < 0 else 0), math.pi / 2 * s, 0.05, g, W)
        # NFHS 3-point arc 19'9" from the basket centre
        r3 = 19.75 * FT
        ang = math.asin(min(1, (Wd / 2 - 0.9) / r3))
        a0, a1 = (math.pi - ang, math.pi + ang) if s > 0 else (-ang, ang)
        flat_arc(mb, M, hoop, 0, r3, a0, a1, 0.05, g, W)
        # pole, backboard, rim
        gz = g - 0.16
        pole = M @ Vector((bx + s * 1.2, 0, gz))
        pipe(props, pole, (pole.x, pole.y, gz + 3.3), 0.08, STEEL)
        top = M @ Vector((bx - s * 1.0, 0, gz + 3.3))
        pipe(props, (pole.x, pole.y, gz + 3.3), top, 0.06, STEEL)
        Mb = M @ Matrix.Translation((bx - s * 1.2, 0, gz)) @ Matrix.Rotation(math.pi / 2, 4, "Z")
        props.box(Mb, -0.9, 0.9, -0.02, 0.02, 2.9, 3.97, BASE)
        rim = M @ Matrix.Translation((hoop, 0, gz + 3.05))
        for k in range(12):
            a_ = 2 * math.pi * k / 12
            a2 = 2 * math.pi * (k + 1) / 12
            pipe(props, rim @ Vector((0.23 * math.cos(a_), 0.23 * math.sin(a_), 0)),
                 rim @ Vector((0.23 * math.cos(a2), 0.23 * math.sin(a2), 0)), 0.01, STEEL, seg=4)


def diamond(b, mb, props, ring, mats):
    """Infer home plate as the polygon vertex whose two edges are the longest near-perpendicular pair
    (the foul lines), then lay out rule-book bases, mound and infield dirt."""
    W, CLAY, BASE, GRASS = mats
    n = len(ring)

    def ray(i, step):
        """Direction from vertex i to the first vertex >= 20 m away walking `step`, plus straightness."""
        p = ring[i]
        j = i
        for _ in range(n - 1):
            j = (j + step) % n
            q = ring[j]
            d = math.dist(p, q)
            if d >= 20:
                u = ((q[0] - p[0]) / d, (q[1] - p[1]) / d)
                k, dev = i, 0.0
                while k != j:  # max deviation of intermediate vertices from the chord
                    k = (k + step) % n
                    r = ring[k]
                    dev = max(dev, abs((r[0] - p[0]) * u[1] - (r[1] - p[1]) * u[0]))
                # follow the straight run to its end to get the foul line length
                length = d
                m = j
                for _ in range(n):
                    m2 = (m + step) % n
                    r = ring[m2]
                    if abs((r[0] - p[0]) * u[1] - (r[1] - p[1]) * u[0]) > 2.0:
                        break
                    length = max(length, math.dist(p, r))
                    m = m2
                return u, dev, length
        return None
    best = None
    for i in range(n):
        r1, r2 = ray(i, -1), ray(i, 1)
        if not r1 or not r2:
            continue
        (u1, dev1, l1), (u2, dev2, l2) = r1, r2
        if dev1 > 2.0 or dev2 > 2.0:
            continue
        cosang = u1[0] * u2[0] + u1[1] * u2[1]
        score = -abs(cosang) * 100 + min(l1, l2)
        if best is None or score > best[0]:
            best = (score, ring[i], u1, u2, l1, l2)
    if not best or best[0] < 0:
        b.warn("baseball pitch: could not find home plate corner")
        return
    _, home, u1, u2, l1, l2 = best
    bis = (u1[0] + u2[0], u1[1] + u2[1])
    bl = math.hypot(*bis)
    d = (bis[0] / bl, bis[1] / bl)  # home -> second base
    far = max(l1, l2)
    softball = far < 75
    base = 60 * FT if softball else 90 * FT
    mound = 43 * FT if softball else 60.5 * FT
    dirt_r = 60 * FT if softball else 95 * FT
    rot = math.degrees(math.atan2(d[1], d[0]))
    M = rect_M(home[0], home[1], 0, rot)  # local +x = home -> 2B, foul lines at +-45 deg

    def gz(lx, ly):
        return _ground_z(b, M, lx, ly)
    # infield dirt: fan of radius dirt_r around the mound, clipped to fair territory + 3 ft
    pm = (mound, 0)
    fan = [(0, 0)]
    for k in range(0, 33):
        a = -math.pi / 4 - 0.05 + (math.pi / 2 + 0.1) * k / 32
        # point where the ray from home at angle a meets the dirt circle around the mound
        ca, sa = math.cos(a), math.sin(a)
        bq = -2 * (ca * pm[0] + sa * pm[1])
        cq = pm[0] ** 2 + pm[1] ** 2 - dirt_r ** 2
        tq = (-bq + math.sqrt(max(0, bq * bq - 4 * cq))) / 2
        fan.append((tq * ca, tq * sa))
    _drape_local(b, mb, M, fan, 0.14, CLAY)
    if not softball:  # grass infield square inside the base paths, with a dirt mound circle
        s = base / math.sqrt(2)
        inset = 3 * FT
        sq = [(inset * 1.6, 0), (s, -(s - inset * 1.4)), (2 * s - inset * 1.6, 0), (s, s - inset * 1.4)]
        _drape_local(b, mb, M, sq, 0.145, GRASS)
        circ = [(mound + 9 * FT * math.cos(2 * math.pi * k / 20), 9 * FT * math.sin(2 * math.pi * k / 20))
                for k in range(20)]
        _drape_local(b, mb, M, circ, 0.15, CLAY)
    home_c = [(13 * FT * math.cos(2 * math.pi * k / 20), 13 * FT * math.sin(2 * math.pi * k / 20)) for k in range(20)]
    _drape_local(b, mb, M, home_c, 0.15, CLAY)
    # foul lines to the polygon edge
    for u in ((math.cos(-math.pi / 4), math.sin(-math.pi / 4)), (math.cos(math.pi / 4), math.sin(math.pi / 4))):
        length = far - 2
        for i in range(int(length / 3)):
            a = (u[0] * i * 3, u[1] * i * 3)
            c = (u[0] * (i + 1) * 3, u[1] * (i + 1) * 3)
            flat_line(mb, M, a, c, 0.08, gz((a[0] + c[0]) / 2, (a[1] + c[1]) / 2) + 0.16, W)
    # bases (15 in square) and pitching rubber
    s = base / math.sqrt(2)
    for (bx, by) in ((s, -s), (2 * s, 0), (s, s)):
        Mb = M @ Matrix.Translation((bx, by, gz(bx, by) + 0.16)) @ Matrix.Rotation(math.pi / 4, 4, "Z")
        props.box(Mb, -0.19, 0.19, -0.19, 0.19, 0, 0.08, BASE)
    hp = [(0, 0), (-0.22, -0.22), (-0.43, -0.22), (-0.43, 0.22), (-0.22, 0.22)]
    props.poly([M @ Vector((x, y, gz(0, 0) + 0.17)) for x, y in hp], BASE)
    Mr = M @ Matrix.Translation((mound, 0, gz(mound, 0) + 0.25))
    props.box(Mr, -0.08, 0.08, -0.3, 0.3, 0, 0.03, BASE)


def _drape_local(b, mb, M, ring_local, lift, mat):
    world = [tuple((M @ Vector((x, y, 0)))[:2]) for x, y in ring_local]
    b.drape_poly(mb, world, [], mat, lift, step=2.0)


# --------------------------------------------------------------------------- bleachers

def bleachers(b, s, field_c):
    """Aluminium grandstand: footboards and seat planks per row, aisles, riser plates, railings, steel
    understructure frames, a concrete slab under the stands and an invisible zone volume there.

    s: {id, x, y, l, w, rot_deg, rows?, front_h?, back_h?, aisles?: [along-metres], press_box?: {...},
        under?: 'open'|'enclosed', name?}
    """
    detail_materials(b)
    mats = [b.M["aluminium"], b.M["galv_dark"], b.M["concrete_floor"], b.M["steel"], b.M["wall"],
            b.M["glass"], b.M["roof"], b.M["door"], b.M["sign_white"]]
    AL, STR, SLAB, RAIL, WALL, GLASS, ROOF, DOOR, TXT = range(9)
    L, Wd = float(s["l"]), float(s["w"])
    rows = int(s.get("rows") or max(5, round(Wd / 0.71)))
    front_h = float(s.get("front_h", 0.9))
    back_h = float(s.get("back_h", front_h + rows * 0.36))
    rise = (back_h - front_h) / max(rows - 1, 1)
    depth = Wd / rows
    rot = float(s["rot_deg"])
    # orient so local -y faces the field
    a = math.radians(rot)
    ny = (-math.sin(a), math.cos(a))
    to_field = (field_c[0] - s["x"], field_c[1] - s["y"])
    if ny[0] * to_field[0] + ny[1] * to_field[1] > 0:
        rot += 180
    z0 = b.world.g1(s["x"], s["y"])
    M = rect_M(s["x"], s["y"], z0, rot)
    mb = B.MB()
    aisles = s.get("aisles") or [(-L / 2 + L * (k + 0.5) / max(1, round(L / 18))) for k in range(max(1, round(L / 18)))]
    aisle_w = 1.2
    y_front = -Wd / 2
    # concrete slab under and in front of the stands (walkway apron 3 m)
    mb.box(M, -L / 2 - 0.5, L / 2 + 0.5, y_front - 3.0, Wd / 2 + 0.5, -0.3, 0.12, SLAB)
    segs = []
    edges = [-L / 2] + sorted(x for x in aisles if -L / 2 < x < L / 2) + [L / 2]
    for i in range(len(edges) - 1):
        x0 = edges[i] + (aisle_w / 2 if i > 0 else 0)
        x1 = edges[i + 1] - (aisle_w / 2 if i < len(edges) - 2 else 0)
        if x1 - x0 > 0.5:
            segs.append((x0, x1))
    for r in range(rows):
        yr = y_front + r * depth
        zr = front_h + r * rise
        # footboard spans the full length (aisles become steps), riser plate below the next row
        mb.box(M, -L / 2, L / 2, yr, yr + depth * 0.55, zr - 0.04, zr, AL)
        mb.box(M, -L / 2, L / 2, yr + depth * 0.55 - 0.01, yr + depth * 0.55, zr, zr + rise * 0.9, AL)
        for x0, x1 in segs:  # seat planks (10 in) 17 in above the footboard
            mb.box(M, x0, x1, yr + depth * 0.62, yr + depth * 0.98, zr + 0.43 - 0.035, zr + 0.43, AL)
        for xa in edges[1:-1]:  # aisle half-steps
            mb.box(M, xa - aisle_w / 2, xa + aisle_w / 2, yr + depth * 0.55, yr + depth, zr + rise / 2 - 0.04,
                   zr + rise / 2, AL)
    top_z = front_h + (rows - 1) * rise
    y_back = y_front + rows * depth
    # understructure: a frame every 3.66 m (12 ft): sloped stringer, columns, cross braces
    nf = max(2, int(L / 3.66) + 1)
    for k in range(nf):
        x = -L / 2 + 0.1 + (L - 0.2) * k / (nf - 1)
        pipe(mb, M @ Vector((x, y_front, front_h - 0.05)), M @ Vector((x, y_back, top_z - 0.05)), 0.06, STR)
        for frac in (0.0, 0.5, 1.0):
            yy = y_front + frac * (y_back - y_front)
            zz = front_h + frac * (top_z - front_h) - 0.05
            pipe(mb, M @ Vector((x, yy, 0.1)), M @ Vector((x, yy, zz)), 0.05, STR)
        pipe(mb, M @ Vector((x, y_front, 0.15)), M @ Vector((x, y_back, top_z * 0.6)), 0.03, STR)
    for frac in (0.0, 0.5, 1.0):  # longitudinal ties
        yy = y_front + frac * (y_back - y_front)
        zz = front_h + frac * (top_z - front_h) - 0.08
        pipe(mb, M @ Vector((-L / 2, yy, zz)), M @ Vector((L / 2, yy, zz)), 0.04, STR)
    # railings: back rail 42 in above the top footboard, end rails, front rail with openings at aisles
    for zr in (0.53, 1.07):
        pipe(mb, M @ Vector((-L / 2, y_back - 0.05, top_z + zr)), M @ Vector((L / 2, y_back - 0.05, top_z + zr)),
             0.025, RAIL)
    for k in range(int(L / 2.4) + 1):
        x = -L / 2 + k * 2.4
        pipe(mb, M @ Vector((x, y_back - 0.05, top_z)), M @ Vector((x, y_back - 0.05, top_z + 1.07)), 0.022, RAIL)
    for xe in (-L / 2, L / 2):
        pipe(mb, M @ Vector((xe, y_front, front_h + 1.07)), M @ Vector((xe, y_back, top_z + 1.07)), 0.025, RAIL)
    for x0, x1 in segs:
        pipe(mb, M @ Vector((x0, y_front - 0.05, front_h + 0.9)), M @ Vector((x1, y_front - 0.05, front_h + 0.9)),
             0.025, RAIL)
    # press box on the top rows (home side), with a window band facing the field
    pb = s.get("press_box")
    if pb:
        pl, pw, ph = float(pb.get("l", 12)), float(pb.get("w", 3.0)), float(pb.get("h", 2.8))
        px = float(pb.get("along", 0.0))
        pz = top_z
        mb.box(M, px - pl / 2, px + pl / 2, y_back - pw, y_back, pz, pz + ph, WALL)
        mb.box(M, px - pl / 2 + 0.3, px + pl / 2 - 0.3, y_back - pw - 0.02, y_back - pw + 0.02, pz + 0.9,
               pz + ph - 0.35, GLASS)
        mb.box(M, px - pl / 2 - 0.3, px + pl / 2 + 0.3, y_back - pw - 0.6, y_back + 0.3, pz + ph, pz + ph + 0.15, ROOF)
        label = pb.get("text")
        if label:
            Mt = M @ Matrix.Translation((px, y_back - pw - 0.61, pz + ph + 0.075))
            b.text_on(mb, B.frame(Mt.translation, (M.col[0].x, M.col[0].y)), label, 0.12, TXT, y=-0.002,
                      max_w=pl)
    ob = mb.build(f"BLEACHERS_{s['id']}", b.col["Bleachers"], mats)
    B.tag(ob, "bleachers", s["id"], rows=rows, name=s.get("name", ""), source=s.get("source", ""),
          confidence=s.get("confidence", ""))
    ob["gtp_conform"] = "rigid"
    # walkable zone under the stands: invisible volume the game can test the player against
    zone = B.MB()
    zone.box(M, -L / 2 + 0.3, L / 2 - 0.3, y_front + 0.4, y_back - 0.3, 0.0, max(1.9, top_z * 0.85), 0)
    zob = zone.build(f"ZONE_under_{s['id']}", b.col["Zones"], [b.M["zone_marker"]])
    zob.hide_render = True
    zob.display_type = "WIRE"
    B.tag(zob, "zone", f"under_{s['id']}", name=s.get("zone_name", "Under the Bleachers"),
          clear_height_m=round(top_z * 0.85, 2))
    zob["gtp_conform"] = "rigid"
    zob["gtp_anchor_ref"] = ob.name
    under_props(b, M, L, y_front, y_back, front_h, top_z, s["id"], ob.name)
    return ob


def under_props(b, M, L, y0, y1, zf, zb, sid, ref):
    """Things that live under school bleachers: storage cages, a few stacked crates and trash cans."""
    mats = [b.M["chain"], b.M["steel"], b.M["galv_dark"], b.M["corrugated"]]
    mb = B.MB()
    depth = y1 - y0
    # chain-link storage cage at one end, tall enough only where the stands are high
    cx0, cx1 = L / 2 - 6, L / 2 - 1
    cy0, cy1 = y0 + depth * 0.55, y1 - 0.4
    h = max(1.8, zf + (zb - zf) * 0.55 - 0.3)
    for (a, c) in (((cx0, cy0), (cx1, cy0)), ((cx0, cy0), (cx0, cy1)), ((cx1, cy0), (cx1, cy1))):
        Lr = math.dist(a, c)
        F = M @ Matrix.Translation((a[0], a[1], 0)) @ Matrix.Rotation(math.atan2(c[1] - a[1], c[0] - a[0]), 4, "Z")
        mb.box(F, 0, Lr, -0.01, 0.01, 0.1, h, 0)
        mb.box(F, 0, Lr, -0.02, 0.02, h - 0.04, h, 1)
    for k, (x, y) in enumerate(((-L / 2 + 3, y1 - 1.2), (-L / 2 + 4.2, y1 - 1.0), (0, y1 - 0.9))):
        mb.cylinder(M @ Matrix.Translation((x, y, 0.1)), 0.3, 0, 0.95, 2, seg=10)  # trash cans
    for k in range(3):
        x = -L / 4 + k * 1.1
        mb.box(M, x, x + 1.0, y1 - 1.6, y1 - 0.6, 0.12, 0.12 + 0.6 * (1 + k % 2), 3)  # storage crates
    ob = mb.build(f"UNDER_{sid}", b.col["Bleachers"], mats)
    ob["gtp_conform"] = "rigid"
    ob["gtp_anchor_ref"] = ref


# --------------------------------------------------------------------------- other structures

def carport(b, s):
    """Solar carport: column line(s) every ~7.6 m (25 ft), cantilevered canopy tilted 7 deg, PV modules."""
    detail_materials(b)
    mats = [b.M["galv_dark"], b.M["pv"], b.M["pv_frame"]]
    L, Wd = float(s["l"]), float(s["w"])
    h = float(s.get("h", 4.2))
    tilt = math.radians(float(s.get("tilt_deg", 7)))
    z0 = b.world.g1(s["x"], s["y"])
    M = rect_M(s["x"], s["y"], z0, float(s["rot_deg"]))
    mb = B.MB()
    n = max(2, int(L / 7.6) + 1)
    two_rows = Wd > 14
    col_y = [-Wd / 4, Wd / 4] if two_rows else [0.0]
    for k in range(n):
        x = -L / 2 + 1 + (L - 2) * k / (n - 1)
        for cy in col_y:
            mb.box(M, x - 0.18, x + 0.18, cy - 0.18, cy + 0.18, -0.6, h - 0.35, 0)  # wide-flange column
            mb.box(M, x - 0.12, x + 0.12, -Wd / 2 + 0.3, Wd / 2 - 0.3, h - 0.55, h - 0.35, 0)  # beam
    for k in range(int(Wd / 1.7) + 1):  # purlins
        y = -Wd / 2 + 0.3 + k * 1.7
        zz = h - 0.3 + (y + Wd / 2) * math.tan(tilt)
        mb.box(M, -L / 2, L / 2, y - 0.06, y + 0.06, zz - 0.2, zz, 0)
    # module plane with world-scaled UVs (1 tile = one 1.0 x 1.7 m module)
    zs = lambda y: h - 0.3 + (y + Wd / 2) * math.tan(tilt) + 0.05  # noqa: E731
    P = [M @ Vector((-L / 2, -Wd / 2, zs(-Wd / 2))), M @ Vector((L / 2, -Wd / 2, zs(-Wd / 2))),
         M @ Vector((L / 2, Wd / 2, zs(Wd / 2))), M @ Vector((-L / 2, Wd / 2, zs(Wd / 2)))]
    mb.poly(P, 1, [(0, 0), (L / 1.0, 0), (L / 1.0, Wd / 1.7), (0, Wd / 1.7)])
    mb.poly(P[::-1], 2)  # underside
    ob = mb.build(f"CARPORT_{s['id']}", b.col["Structures"], mats)
    B.tag(ob, "structure", s["id"], struct="solar_carport", source=s.get("source", ""),
          confidence=s.get("confidence", ""))
    ob["gtp_conform"] = "rigid"
    return ob


def portable(b, s):
    """Relocatable classroom: raised floor on a skirted chassis, T1-11 siding, low-slope ribbed roof,
    wall-mounted HVAC pack, door with landing, ramp and pipe railing."""
    detail_materials(b)
    mats = [b.M["portable_wall"], b.M["corrugated"], b.M["hvac"], b.M["door"], b.M["glass"], b.M["steel"],
            b.M["concrete_floor"]]
    WALL, ROOF, HV, DOOR, GLASS, RAIL, CONC = range(7)
    L, Wd = float(s["l"]), float(s["w"])
    h = float(s.get("h", 3.9))
    z0 = b.world.g1(s["x"], s["y"])
    M = rect_M(s["x"], s["y"], z0, float(s["rot_deg"]))
    mb = B.MB()
    floor = 0.75
    mb.box(M, -L / 2, L / 2, -Wd / 2, Wd / 2, -0.3, floor, CONC)
    mb.box(M, -L / 2, L / 2, -Wd / 2, Wd / 2, floor, h - 0.35, WALL)
    # gable-ish low slope roof with overhang
    ov = 0.3
    zr0, zr1 = h - 0.35, h
    P = [(-L / 2 - ov, -Wd / 2 - ov, zr0), (L / 2 + ov, -Wd / 2 - ov, zr0), (L / 2 + ov, 0, zr1), (-L / 2 - ov, 0, zr1)]
    Q = [(-L / 2 - ov, 0, zr1), (L / 2 + ov, 0, zr1), (L / 2 + ov, Wd / 2 + ov, zr0), (-L / 2 - ov, Wd / 2 + ov, zr0)]
    for poly in (P, Q):
        mb.poly([M @ Vector(p) for p in poly], ROOF, [(0, 0), (L, 0), (L, Wd / 2), (0, Wd / 2)])
    # windows on the long sides, door + HVAC on the -y side
    for side in (-1, 1):
        y = side * (Wd / 2 + 0.02)
        for k in range(int(L / 4)):
            x = -L / 2 + 2 + k * 4
            if side < 0 and abs(x) < 1.5:
                continue
            mb.box(M, x - 0.75, x + 0.75, y - 0.02, y + 0.02, floor + 1.0, floor + 2.1, GLASS)
    mb.box(M, -0.46, 0.46, -Wd / 2 - 0.03, -Wd / 2, floor, floor + 2.13, DOOR)
    mb.box(M, L / 2 - 2.0, L / 2 - 1.0, -Wd / 2 - 0.45, -Wd / 2, floor + 0.6, floor + 2.6, HV)
    # landing + ramp (1:12) along the wall, railing
    mb.box(M, -1.2, 1.2, -Wd / 2 - 1.6, -Wd / 2, floor - 0.05, floor, CONC)
    run = floor * 12
    ramp = [M @ Vector(p) for p in ((1.2, -Wd / 2 - 1.6, floor), (1.2 + run, -Wd / 2 - 1.6, 0.05),
                                     (1.2 + run, -Wd / 2 - 0.4, 0.05), (1.2, -Wd / 2 - 0.4, floor))]
    mb.poly(ramp, CONC)
    for y in (-Wd / 2 - 1.6, -Wd / 2 - 0.4):
        pipe(mb, M @ Vector((1.2, y, floor + 0.9)), M @ Vector((1.2 + run, y, 0.95)), 0.02, RAIL)
    ob = mb.build(f"PORTABLE_{s['id']}", b.col["Structures"], mats)
    B.tag(ob, "structure", s["id"], struct="portable", source=s.get("source", ""), confidence=s.get("confidence", ""))
    ob["gtp_conform"] = "rigid"
    return ob


def canopy(b, s):
    """Covered walkway / shade canopy on round columns; curved roof when details mention 'curved'."""
    detail_materials(b)
    mats = [b.M["steel"], b.M["corrugated"]]
    L, Wd = float(s["l"]), float(s["w"])
    h = float(s.get("h", 3.4))
    z0 = b.world.g1(s["x"], s["y"])
    M = rect_M(s["x"], s["y"], z0, float(s["rot_deg"]))
    mb = B.MB()
    n = max(2, int(L / 6) + 1)
    for k in range(n):
        x = -L / 2 + 0.3 + (L - 0.6) * k / (n - 1)
        for y in (-Wd / 2 + 0.3, Wd / 2 - 0.3):
            mb.cylinder(M @ Matrix.Translation((x, y, 0)), 0.1, -0.3, h, 0, seg=8)
    curved = "curv" in (s.get("details") or "").lower()
    segs = 8 if curved else 1
    for i in range(segs):
        y0 = -Wd / 2 - 0.3 + (Wd + 0.6) * i / segs
        y1 = -Wd / 2 - 0.3 + (Wd + 0.6) * (i + 1) / segs
        bump = (lambda y: 0.6 * (1 - (2 * y / (Wd + 0.6)) ** 2)) if curved else (lambda y: 0)
        P = [M @ Vector((-L / 2 - 0.3, y0, h + bump(y0))), M @ Vector((L / 2 + 0.3, y0, h + bump(y0))),
             M @ Vector((L / 2 + 0.3, y1, h + bump(y1))), M @ Vector((-L / 2 - 0.3, y1, h + bump(y1)))]
        mb.poly(P, 1, [(0, y0), (L, y0), (L, y1), (0, y1)])
    ob = mb.build(f"CANOPY_{s['id']}", b.col["Structures"], mats)
    B.tag(ob, "structure", s["id"], struct="canopy", confidence=s.get("confidence", ""))
    ob["gtp_conform"] = "rigid"


def simple_box(b, s, mat_key, roof_key=None, open_front=False):
    detail_materials(b)
    mats = [b.M[mat_key], b.M[roof_key or mat_key], b.M["steel"]]
    L, Wd, h = float(s["l"]), float(s["w"]), float(s.get("h", 2.6))
    z0 = b.world.g1(s["x"], s["y"])
    M = rect_M(s["x"], s["y"], z0, float(s["rot_deg"]))
    mb = B.MB()
    if open_front:  # dugout: back wall, ends, roof, bench
        mb.box(M, -L / 2, L / 2, Wd / 2 - 0.2, Wd / 2, -0.3, h, 0)
        for x in (-L / 2, L / 2 - 0.2):
            mb.box(M, x, x + 0.2, -Wd / 2, Wd / 2, -0.3, h, 0)
        mb.box(M, -L / 2, L / 2, -Wd / 2 - 0.3, Wd / 2, h, h + 0.15, 1)
        mb.box(M, -L / 2 + 0.3, L / 2 - 0.3, Wd / 2 - 0.65, Wd / 2 - 0.25, 0.42, 0.47, 2)
    else:
        mb.box(M, -L / 2, L / 2, -Wd / 2, Wd / 2, -0.3, h, 0)
        mb.box(M, -L / 2 - 0.1, L / 2 + 0.1, -Wd / 2 - 0.1, Wd / 2 + 0.1, h, h + 0.12, 1)
    ob = mb.build(f"{s['kind'].upper()}_{s['id']}", b.col["Structures"], mats)
    B.tag(ob, "structure", s["id"], struct=s["kind"], confidence=s.get("confidence", ""))
    ob["gtp_conform"] = "rigid"


def container(b, s, k):
    detail_materials(b)
    mat = b.M["container_colors"][k % len(b.M["container_colors"])]
    L, Wd, h = float(s.get("l", 6.06)), float(s.get("w", 2.44)), float(s.get("h", 2.59))
    z0 = b.world.g1(s["x"], s["y"])
    M = rect_M(s["x"], s["y"], z0, float(s["rot_deg"]))
    mb = B.MB()
    mb.box(M, -L / 2, L / 2, -Wd / 2, Wd / 2, 0, h, 0)
    ob = mb.build(f"CONTAINER_{s['id']}", b.col["Structures"], [mat])
    ob["gtp_conform"] = "rigid"


def fence_polyline(b, mb, pts, h, posts_every=3.0):
    for i in range(len(pts) - 1):
        (x1, y1), (x2, y2) = pts[i], pts[i + 1]
        L = math.dist(pts[i], pts[i + 1])
        if L < 0.2:
            continue
        n = max(1, int(L / 4))
        for k in range(n):
            ax, ay = x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n
            bx, by = x1 + (x2 - x1) * (k + 1) / n, y1 + (y2 - y1) * (k + 1) / n
            za, zb = b.world.g1(ax, ay), b.world.g1(bx, by)
            Ls = math.dist((ax, ay), (bx, by))
            ux, uy = (bx - ax) / Ls, (by - ay) / Ls
            nx, ny = -uy * 0.01, ux * 0.01
            mb.poly([(ax - nx, ay - ny, za + 0.05), (bx - nx, by - ny, zb + 0.05),
                     (bx - nx, by - ny, zb + h), (ax - nx, ay - ny, za + h)], 1,
                    [(0, 0), (Ls, 0), (Ls, h), (0, h)])
            pipe(mb, (ax, ay, za + h), (bx, by, zb + h), 0.02, 0, seg=5)
        for s_ in np.arange(0, L + 1e-6, posts_every):
            px, py = x1 + (x2 - x1) * s_ / L, y1 + (y2 - y1) * s_ / L
            pz = b.world.g1(px, py)
            pipe(mb, (px, py, pz - 0.3), (px, py, pz + h + 0.05), 0.03, 0, seg=6)


def backstop(b, s):
    detail_materials(b)
    mats = [b.M["steel"], b.M["chain"]]
    mb = B.MB()
    if s.get("polyline"):
        fence_polyline(b, mb, [tuple(p) for p in s["polyline"]], float(s.get("h", 6.0)), 3.0)
    else:
        L = float(s["l"])
        a = math.radians(float(s["rot_deg"]))
        pts = [(s["x"] - math.cos(a) * L / 2, s["y"] - math.sin(a) * L / 2),
               (s["x"] + math.cos(a) * L / 2, s["y"] + math.sin(a) * L / 2)]
        fence_polyline(b, mb, pts, float(s.get("h", 6.0)), 3.0)
    ob = mb.build(f"BACKSTOP_{s['id']}", b.col["Fences"], mats)
    ob["gtp_conform"] = "drape_rigid_parts"


def light_pole(b, mb, x, y, h):
    z = b.world.g1(x, y)
    if h > 14:
        pipe(mb, (x, y, z - 0.5), (x, y, z + h), 0.3, 0, seg=10)
        F = B.frame((x, y, z + h - 1.6), (1, 0))
        for r in range(2):
            for c in range(4):
                mb.box(F, -1.6 + c * 0.82, -1.0 + c * 0.82, -0.25, 0.25, r * 0.75, r * 0.75 + 0.6, 1)
    else:
        pipe(mb, (x, y, z - 0.4), (x, y, z + h), 0.09, 0, seg=8)
        pipe(mb, (x, y, z + h), (x + 1.2, y, z + h + 0.2), 0.05, 0, seg=6)
        mb.box(Matrix.Translation((x + 1.3, y, z + h + 0.1)), -0.35, 0.35, -0.15, 0.15, -0.12, 0.0, 1)


def scoreboard(b, s, text):
    detail_materials(b)
    mats = [b.M["steel"], b.M["scoreboard"], b.M["digits"], b.M["sign_white"]]
    L = float(s.get("l", 7.3))
    H = float(s.get("board_h", 3.0))
    h = float(s.get("h", 9.0))
    z = b.world.g1(s["x"], s["y"])
    facing = s.get("facing_deg", 180.0)
    fa = math.radians(facing)
    f = (math.sin(fa), math.cos(fa))
    right = (-f[1], f[0])
    F = B.frame((s["x"], s["y"], z), right)
    mb = B.MB()
    for x in (-L / 2 + 0.6, L / 2 - 0.6):
        mb.box(F, x - 0.15, x + 0.15, -0.1, 0.2, -0.5, h, 0)
    mb.box(F, -L / 2, L / 2, -0.2, 0.2, h - H, h, 1)
    b.text_on(mb, F, text, H * 0.18, 3, z=h - H * 0.18, y=-0.205, max_w=L - 0.6)
    for k, lab in enumerate(("HOME", "GUEST")):
        x = (-1 if k == 0 else 1) * L * 0.28
        b.text_on(mb, F, lab, H * 0.1, 3, x=x, z=h - H * 0.42, y=-0.205)
        b.text_on(mb, F, "00", H * 0.22, 2, x=x, z=h - H * 0.68, y=-0.205)
    b.text_on(mb, F, "12:00", H * 0.16, 2, x=0, z=h - H * 0.5, y=-0.205)
    ob = mb.build(f"SCOREBOARD_{s['id']}", b.col["Structures"], mats)
    B.tag(ob, "structure", s["id"], struct="scoreboard", confidence=s.get("confidence", ""))
    ob["gtp_conform"] = "rigid"


def structures(b):
    items = load_list("structures.json")
    if not items:
        b.warn("no structures.json: bleachers, carports, portables, fences and poles skipped")
        return 0
    detail_materials(b)
    field_c = None
    for e in b.campus:
        if e.get("tags", {}).get("sport") == "american_football":
            field_c = B.poly_centroid(B.ccw(B.clean_ring(B.way_xy(e))))
    field_c = field_c or (310.0, 460.0)
    poles = B.MB()
    fences = B.MB()
    n = 0
    for k, s in enumerate(items):
        kind = s.get("kind", "")
        try:
            if kind == "bleachers":
                bleachers(b, s, field_c if s.get("faces") != "own_field" else (s["x"], s["y"]))
            elif kind == "press_box":
                continue  # built with its bleachers when attached
            elif kind == "solar_carport":
                carport(b, s)
            elif kind == "portable":
                portable(b, s)
            elif kind == "canopy":
                canopy(b, s)
            elif kind in ("dugout",):
                simple_box(b, s, "cmu", "corrugated", open_front=True)
            elif kind in ("shed", "other") and s.get("l"):
                simple_box(b, s, "portable_wall", "corrugated")
            elif kind == "container":
                container(b, s, k)
            elif kind in ("backstop", "batting_cage"):
                backstop(b, s)
            elif kind == "fence" and s.get("polyline"):
                fence_polyline(b, fences, [tuple(p) for p in s["polyline"]], float(s.get("h", 1.83)))
            elif kind == "light_pole":
                light_pole(b, poles, float(s["x"]), float(s["y"]), float(s.get("h", 10)))
            elif kind == "scoreboard":
                scoreboard(b, s, b.features.get("scoreboard_text", "TITANS"))
            elif kind == "goal_post":
                continue  # generated from the football field geometry
            else:
                b.warn(f"structure {s.get('id')}: kind '{kind}' not built")
                continue
            n += 1
        except (KeyError, TypeError, ValueError) as ex:
            b.warn(f"structure {s.get('id')} ({kind}) skipped: {ex}")
    if poles.f:
        ob = poles.build("Light_Poles_Campus", b.col["Lights"], [b.M["galv_dark"], b.M["lamp_off"]])
        ob["gtp_conform"] = "per_vertex_ground"
    if fences.f:
        ob = fences.build("Fences_Campus", b.col["Fences"], [b.M["steel"], b.M["chain"]])
        ob["gtp_conform"] = "per_vertex_ground"
    return n


# --------------------------------------------------------------------------- rooftop equipment

def roof_equipment(b):
    items = load_list("roof_equipment.json")
    if not items:
        b.warn("no roof_equipment.json: rooftop units skipped")
        return 0
    detail_materials(b)
    mats = [b.M["hvac"], b.M["hvac_fan"], b.M["pv"], b.M["pv_frame"], b.M["galv_dark"], b.M["glass"]]
    HV, FAN, PV, PVF, STR, GL = range(6)
    by_name = {bd["name"]: bd for bd in b.buildings}
    per = {}
    n = 0
    for it in items:
        bd = by_name.get(it.get("building"))
        x, y = float(it["x"]), float(it["y"])
        if bd is None:
            for cand in b.buildings:
                if B.points_in_poly([x], [y], cand["ring"])[0]:
                    bd = cand
                    break
        if bd is None:
            continue
        deck = roof_z_at(b, bd, x, y)
        mb = per.setdefault(bd["name"], B.MB())
        l, w = max(0.3, float(it.get("l", 1.5))), max(0.3, float(it.get("w", 1.0)))
        h = max(0.2, float(it.get("h", 1.0)))
        M = rect_M(x, y, deck, float(it.get("rot_deg", 0)))
        kind = it.get("kind", "hvac")
        if kind == "hvac":
            mb.box(M, -l / 2, l / 2, -w / 2, w / 2, -0.05, 0.15, STR)  # curb
            mb.box(M, -l / 2 + 0.05, l / 2 - 0.05, -w / 2 + 0.05, w / 2 - 0.05, 0.15, h, HV)
            # condenser fans on top: dark discs, one per ~1.1 m of length
            nf = max(1, int(l / 1.1))
            for k in range(nf):
                fx = -l / 2 + l * (k + 0.5) / nf
                B_ = M @ Matrix.Translation((fx, w * 0.15, h + 0.005))
                ring = [B_ @ Vector((0.33 * math.cos(2 * math.pi * i / 16), 0.33 * math.sin(2 * math.pi * i / 16), 0))
                        for i in range(16)]
                mb.poly(ring, FAN)
            mb.box(M, -l / 2 + 0.05, l / 2 - 0.05, -w / 2 + 0.03, -w / 2 + 0.05, 0.3, h - 0.15, FAN)  # coil grille
        elif kind == "pv_array":
            tilt = math.radians(float(it.get("tilt_deg", 10)))
            rows = max(1, int(round(w / 2.2)))
            for r in range(rows):
                y0 = -w / 2 + r * (w / rows)
                y1 = y0 + (w / rows) * 0.8
                z0_, z1_ = 0.3, 0.3 + (y1 - y0) * math.tan(tilt)
                P = [M @ Vector((-l / 2, y0, z0_)), M @ Vector((l / 2, y0, z0_)), M @ Vector((l / 2, y1, z1_)),
                     M @ Vector((-l / 2, y1, z1_))]
                mb.poly(P, PV, [(0, 0), (l, 0), (l, (y1 - y0) / 1.7), (0, (y1 - y0) / 1.7)])
                mb.poly(P[::-1], PVF)
                for xk in np.arange(-l / 2 + 0.5, l / 2, 2.0):
                    mb.box(M, xk - 0.03, xk + 0.03, y0, y1, 0.0, z1_, STR)
        elif kind == "skylight":
            mb.box(M, -l / 2, l / 2, -w / 2, w / 2, -0.05, min(h, 0.45), GL)
        elif kind in ("vent", "exhaust_fan"):
            mb.cylinder(M, min(l, w) / 2, -0.05, h, HV, seg=12)
            mb.cylinder(M, min(l, w) / 2 + 0.1, h, h + 0.12, FAN, seg=12)
        elif kind == "duct":
            mb.box(M, -l / 2, l / 2, -w / 2, w / 2, 0.2, 0.2 + min(h, 0.8), HV)
        else:
            mb.box(M, -l / 2, l / 2, -w / 2, w / 2, -0.05, h, HV)
        n += 1
    for name, mb in per.items():
        if mb.f:
            ob = mb.build(f"ROOFKIT_{name.replace(' ', '_')}", b.col["Buildings"], mats)
            ob["gtp_conform"] = "rigid"
            ob["gtp_anchor_ref"] = f"BLD_{name.replace(' ', '_')}"
    return n


def roof_z_at(b, bd, x, y):
    """Roof deck height at (x, y): flat roofs use the deck, LiDAR roofs the local surface median."""
    if bd.get("roof_mode") == "dsm" and b.world.dsm is not None:
        xs = np.array([x - 0.6, x, x + 0.6, x, x])
        ys = np.array([y, y - 0.6, y, y + 0.6, y])
        zs = b.world.surface(xs, ys)
        zs = zs[np.isfinite(zs)]
        if zs.size:
            return float(max(bd["top"], np.min(zs)))
    return float(bd["top"])
