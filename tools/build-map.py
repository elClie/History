#!/usr/bin/env python3
"""Bake js/vn-map-data.js (Phần 2 fire map) from Natural Earth 1:50m countries.

    curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
    python3 tools/build-map.py ne_50m_admin_0_countries.geojson

Design space: 1000 px wide, equirectangular scaled by cos(15.3°). Hoàng Sa / Trường Sa and the small
offshore islands are hand-placed (Natural Earth leaves them out of VNM); disputed islets held under
other countries' polygons are dropped so they never render as foreign land.
"""
import json
import math
import sys
from pathlib import Path

LON0, LON1, LAT0, LAT1 = 101.6, 117.8, 7.0, 23.6
K = math.cos(math.radians(15.3))
S = 1000 / ((LON1 - LON0) * K)
W, H = 1000, round((LAT1 - LAT0) * S)
NEIGHBOURS = ("LAO", "KHM", "THA", "CHN", "MYS")


def proj(lon, lat):
    return ((lon - LON0) * K * S, (LAT1 - lat) * S)


def simplify(pts, tol):
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        n = math.hypot(dx, dy) or 1e-9
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / n
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(pts, tol):
    """Closed rings start and end on the same point — split at the far point so the chord is non-degenerate."""
    x0, y0 = pts[0]
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - x0) ** 2 + (pts[i][1] - y0) ** 2)
    return simplify(pts[: far + 1], tol) + simplify(pts[far:], tol)[1:]


def clip(pts, x0, y0, x1, y1):
    """Sutherland–Hodgman against the (padded) design box — edges land off-canvas, so no visible seams."""
    def run(poly, inside, cut):
        out = []
        for i, cur in enumerate(poly):
            prev = poly[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cut(prev, cur))
        return out

    def at_x(x):
        return lambda p, q: (x, p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0]))

    def at_y(y):
        return lambda p, q: (p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]), y)

    for inside, cut in (
        (lambda p: p[0] >= x0, at_x(x0)),
        (lambda p: p[0] <= x1, at_x(x1)),
        (lambda p: p[1] >= y0, at_y(y0)),
        (lambda p: p[1] <= y1, at_y(y1)),
    ):
        if not pts:
            break
        pts = run(pts, inside, cut)
    return pts


def path(rings):
    parts = []
    for r in rings:
        if len(r) < 3:
            continue
        parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in r) + "Z")
    return "".join(parts)


def rings_of(feature):
    g = feature["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    return [poly[0] for poly in polys]


def main(src):
    data = json.loads(Path(src).read_text())
    vn, near = [], []
    pad = 40
    for f in data["features"]:
        iso = f["properties"].get("ADM0_A3")
        if iso != "VNM" and iso not in NEIGHBOURS:
            continue
        for ring in rings_of(f):
            lats = [c[1] for c in ring]
            if iso == "CHN" and sum(lats) / len(lats) < 18.0:
                continue
            pts = [proj(lon, lat) for lon, lat in ring]
            if iso == "VNM":
                vn.append(simplify_ring(pts, 0.35))
                continue
            pts = clip(simplify_ring(pts, 0.6), -pad, -pad, W + pad, H + pad)
            if len(pts) >= 3:
                near.append(pts)

    def dots(items):
        out = []
        for lon, lat, r in items:
            x, y = proj(lon, lat)
            out.append([round(x, 1), round(y, 1), r])
        return out

    hoang_sa = dots([
        (112.33, 16.83, 3.2), (112.27, 16.98, 2.2), (112.73, 16.66, 2.0), (112.53, 16.05, 1.8),
        (111.60, 16.53, 2.6), (111.71, 16.45, 2.0), (111.74, 16.47, 1.8), (111.77, 16.05, 1.8),
        (111.20, 15.78, 2.2), (111.50, 16.20, 1.6),
    ])
    truong_sa = dots([
        (111.92, 8.65, 3.0), (114.33, 11.43, 2.6), (114.36, 11.45, 1.8), (114.48, 10.38, 2.0),
        (114.36, 10.18, 2.2), (114.33, 9.88, 2.2), (114.28, 11.05, 2.0), (112.92, 7.89, 2.0),
        (113.69, 8.97, 1.8), (112.25, 8.85, 1.8), (113.30, 8.17, 1.6), (114.42, 10.68, 1.8),
        (113.85, 10.05, 1.6), (115.53, 9.90, 1.6), (112.89, 9.55, 1.8), (114.25, 9.77, 1.6),
        (116.10, 10.70, 1.6), (115.00, 8.80, 1.6),
    ])
    islets = dots([
        (107.72, 20.13, 2.2), (107.34, 17.16, 2.0), (109.12, 15.38, 2.4), (108.94, 10.52, 2.4),
        (103.47, 9.30, 2.0), (107.80, 20.95, 1.6), (106.62, 8.70, 1.6),
    ])

    towns = {
        # north
        "hagiang": (104.98, 22.82), "caobang": (106.25, 22.67), "laocai": (103.97, 22.48),
        "laichau": (103.15, 22.06), "sonla": (103.91, 21.33), "yenbai": (104.87, 21.72),
        "tuyenquang": (105.21, 21.82), "bacan": (105.83, 22.15), "langson": (106.76, 21.85),
        "thainguyen": (105.85, 21.59), "phutho": (105.22, 21.32), "vinhyen": (105.60, 21.31),
        "bacninh": (106.08, 21.18), "bacgiang": (106.19, 21.27), "haiphong": (106.68, 20.86),
        "haiduong": (106.33, 20.94), "hungyen": (106.05, 20.65), "hanoi": (105.85, 21.03),
        "hadong": (105.77, 20.97), "sontay": (105.50, 21.14), "hoabinh": (105.34, 20.81),
        "namdinh": (106.17, 20.42), "thaibinh": (106.34, 20.45), "ninhbinh": (105.97, 20.25),
        "hanam": (105.92, 20.54), "quangyen": (106.80, 20.94), "moncai": (107.97, 21.52),
        "tantrao": (105.47, 21.78),
        # centre
        "thanhhoa": (105.78, 19.81), "nghean": (105.68, 18.68), "hatinh": (105.90, 18.34),
        "quangbinh": (106.62, 17.47), "quangtri": (107.19, 16.75), "hue": (107.59, 16.46),
        "quangnam": (108.33, 15.88), "quangngai": (108.80, 15.12), "binhdinh": (109.22, 13.78),
        "phuyen": (109.30, 13.09), "khanhhoa": (109.19, 12.24), "ninhthuan": (108.99, 11.56),
        "binhthuan": (108.10, 10.93), "kontum": (108.00, 14.35), "pleiku": (108.00, 13.98),
        "darlac": (108.04, 12.67), "dongnaithuong": (108.44, 11.94),
        # south
        "saigon": (106.70, 10.78), "bienhoa": (106.82, 10.95), "thudaumot": (106.65, 10.98),
        "baria": (107.17, 10.50), "tayninh": (106.10, 11.31), "tanan": (106.41, 10.54),
        "mytho": (106.36, 10.36), "gocong": (106.67, 10.36), "bentre": (106.38, 10.24),
        "travinh": (106.34, 9.93), "vinhlong": (105.97, 10.25), "sadec": (105.76, 10.29),
        "longxuyen": (105.43, 10.38), "chaudoc": (105.12, 10.70), "cantho": (105.78, 10.03),
        "soctrang": (105.97, 9.60), "baclieu": (105.72, 9.29), "rachgia": (105.08, 10.01),
        "hatien": (104.49, 10.38), "camau": (105.15, 9.18),
    }
    town_xy = {k: [round(v, 1) for v in proj(*ll)] for k, ll in towns.items()}

    out = {
        "w": W,
        "h": H,
        "box": [LON0, LAT0, LON1, LAT1, round(K * S, 4), round(S, 4)],
        "vn": path(vn),
        "near": path(near),
        "hoangSa": hoang_sa,
        "truongSa": truong_sa,
        "islets": islets,
        "towns": town_xy,
    }
    dst = Path(__file__).resolve().parent.parent / "js" / "vn-map-data.js"
    dst.write_text(
        "/* Generated by tools/build-map.py — Natural Earth 1:50m (public domain) + hand-placed islands. */\n"
        f"window.HisMapData = {json.dumps(out, ensure_ascii=False, separators=(',', ':'))};\n"
    )
    print(f"{dst}  {dst.stat().st_size} bytes  vn rings {len(vn)}  near rings {len(near)}  {W}x{H}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "ne_50m_admin_0_countries.geojson")
