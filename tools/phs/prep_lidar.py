"""Turn the clipped USGS 3DEP LiDAR points into the rasters build_phs.py reads, and detect rooftop
equipment as bumps above each flat roof deck.

Usage (needs numpy + scipy, e.g. a venv):
    python -I tools/phs/prep_lidar.py /path/to/campus_points.npz

Input npz: x, y (campus local frame metres), z (NAVD88 m), classification, return_number, withheld.
Source: USGS 3DEP CA_SanDiegoCo_D24 (flown 2024-11), public domain.

Writes into tools/phs/data/lidar/:
    dtm.npy/.json   1.0 m bare earth (class 2 mean per cell, holes filled), north-up
    dsm.npy/.json   0.5 m first-return surface (max per cell, holes filled), north-up
and tools/phs/data/roof_equipment.json (rectangles in the local frame, heights above the deck).
"""
import json
import math
import pathlib
import sys

import numpy as np
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "data" / "lidar"
X0, Y0, X1, Y1 = -40.0, -40.0, 441.0, 664.0  # raster extent, local frame


def grid(x, y, v, cell, how):
    cols = int(round((X1 - X0) / cell))
    rows = int(round((Y1 - Y0) / cell))
    c = ((x - X0) / cell).astype(int)
    r = ((Y1 - y) / cell).astype(int)
    ok = (c >= 0) & (c < cols) & (r >= 0) & (r < rows)
    c, r, v = c[ok], r[ok], v[ok]
    idx = r * cols + c
    if how == "max":
        out = np.full(rows * cols, -np.inf)
        np.maximum.at(out, idx, v)
        out[np.isinf(out)] = np.nan
    else:
        s = np.bincount(idx, v, rows * cols)
        n = np.bincount(idx, None, rows * cols)
        with np.errstate(invalid="ignore", divide="ignore"):
            out = s / n
    return out.reshape(rows, cols)


def fill(a):
    """Fill NaN cells from the nearest valid cell."""
    bad = np.isnan(a)
    if not bad.any():
        return a
    idx = ndimage.distance_transform_edt(bad, return_distances=False, return_indices=True)
    return a[tuple(idx)]


def save(name, a, cell, note):
    OUT.mkdir(parents=True, exist_ok=True)
    np.save(OUT / f"{name}.npy", a.astype(np.float32))
    meta = {"x0": X0 + cell / 2, "y0": Y1 - cell / 2, "cell": cell, "rows": a.shape[0], "cols": a.shape[1],
            "north_up": True, "z": "NAVD88 metres (GEOID18)", "frame": "campus local frame (see build_phs.py)",
            "source": "USGS 3DEP CA_SanDiegoCo_D24 LiDAR, flown 2024-11, public domain", "note": note}
    (OUT / f"{name}.json").write_text(json.dumps(meta, indent=1))


def ring_mask(ring, cell, shape):
    from matplotlib.path import Path as MPath  # noqa: PLC0415 (optional dependency)
    rows, cols = shape
    xs = X0 + (np.arange(cols) + 0.5) * cell
    ys = Y1 - (np.arange(rows) + 0.5) * cell
    gx, gy = np.meshgrid(xs, ys)
    return MPath(ring).contains_points(np.c_[gx.ravel(), gy.ravel()]).reshape(shape)


def main(npz):
    d = np.load(npz)
    x, y, z = d["x"].astype(np.float64), d["y"].astype(np.float64), d["z"].astype(np.float64)
    cls = d["classification"]
    keep = ~d["withheld"] & (cls != 7) & (cls != 18)
    g = keep & (cls == 2)
    dtm = fill(grid(x[g], y[g], z[g], 1.0, "mean"))
    dtm = ndimage.uniform_filter(dtm, 3)
    save("dtm", dtm, 1.0, "class 2 mean per 1 m cell, nearest-filled, 3x3 smoothed")
    f = keep & (d["return_number"] == 1)
    dsm = fill(grid(x[f], y[f], z[f], 0.5, "max"))
    dsm = ndimage.median_filter(dsm, 3)  # knock out single-cell spikes (birds, wires)
    save("dsm", dsm, 0.5, "first-return max per 0.5 m cell, nearest-filled, 3x3 median")
    print("dtm", dtm.shape, float(np.nanmin(dtm)), float(np.nanmax(dtm)), "dsm", dsm.shape)

    # rooftop equipment: connected bumps 0.5-4.5 m above the deck of each flat-roofed building
    campus = json.loads((HERE / "data" / "campus.json").read_text())["elements"]
    lat0, lon0, mlat, mlon = 32.99612, -117.0280522, 110904.3881, 93457.3049
    cell = 0.5
    dtm_hi = np.kron(dtm, np.ones((2, 2)))[: dsm.shape[0], : dsm.shape[1]]
    hag = dsm - dtm_hi
    items = []
    for e in campus:
        t = e.get("tags", {})
        if e["type"] != "way" or "building" not in t:
            continue
        ring = [((p["lon"] - lon0) * mlon, (p["lat"] - lat0) * mlat) for p in e["geometry"]]
        m = ring_mask(ring, cell, dsm.shape)
        core = ndimage.binary_erosion(m, iterations=2)  # 1 m in from the walls (skip parapets)
        if core.sum() < 20:
            continue
        h = hag[core]
        deck = np.percentile(h, 35)
        if np.percentile(h, 85) - np.percentile(h, 15) > 2.5:
            continue  # pitched or multi-level roof: build_phs takes its shape straight from the DSM
        bump = core & (hag > deck + 0.5) & (hag < deck + 4.5)
        lab, n = ndimage.label(bump)
        for k in range(1, n + 1):
            rr, cc = np.nonzero(lab == k)
            area = rr.size * cell * cell
            if area < 0.75 or area > 60:
                continue
            px = X0 + (cc + 0.5) * cell
            py = Y1 - (rr + 0.5) * cell
            pts = np.c_[px, py]
            ctr = pts.mean(0)
            cov = np.cov((pts - ctr).T) if len(pts) > 2 else np.eye(2)
            w_, v_ = np.linalg.eigh(cov)
            u = v_[:, 1]
            pu, pv = (pts - ctr) @ u, (pts - ctr) @ np.array([-u[1], u[0]])
            L = pu.max() - pu.min() + cell
            W = pv.max() - pv.min() + cell
            hh = float(np.percentile(hag[rr, cc], 90) - deck)
            items.append({"building": t.get("name") or f"Building_{e['id']}", "kind": "hvac",
                          "x": round(float(ctr[0]), 2), "y": round(float(ctr[1]), 2), "l": round(float(L), 2),
                          "w": round(float(W), 2), "h": round(hh, 2),
                          "rot_deg": round(math.degrees(math.atan2(u[1], u[0])) % 180, 1),
                          "confidence": "LiDAR 2024 bump above roof deck; kind assumed HVAC",
                          "deck_hag_m": round(float(deck), 2)})
    (HERE / "data" / "roof_equipment.json").write_text(json.dumps(items, indent=1))
    print("roof items", len(items))


if __name__ == "__main__":
    main(sys.argv[1])
