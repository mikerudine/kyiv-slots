#!/usr/bin/env python3
"""Rasterize coloring/map.json into coloring/grid.json.

Cell ownership uses centre point-in-polygon for land, plus meaningful cell↔geometry
overlap for thin features (rivers, city edges, towns) so the silhouette stays readable.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MAP_PATH = ROOT / "map.json"
OUT_PATH = ROOT / "grid.json"

# ~90–100 across → ~4–5 CSS px at default phone zoom; numbers appear when zoomed.
COLS = 96


def parse_path(d: str):
    tokens = re.findall(r"[MLZ]|-?\d*\.?\d+", d)
    polys, cur, i, cmd = [], [], 0, None
    while i < len(tokens):
        t = tokens[i]
        if t in "MLZ":
            cmd = t
            i += 1
            if cmd == "Z" and cur:
                polys.append(cur)
                cur = []
            continue
        x, y = float(t), float(tokens[i + 1])
        i += 2
        if cmd == "M":
            if cur:
                polys.append(cur)
            cur = [(x, y)]
        elif cmd == "L":
            cur.append((x, y))
    if cur:
        polys.append(cur)
    return polys


def pip(x, y, poly):
    n = len(poly)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-30) + xi):
            inside = not inside
        j = i
    return inside


def dist_to_seg(px, py, ax, ay, bx, by):
    abx, aby = bx - ax, by - ay
    apx, apy = px - ax, py - ay
    ab2 = abx * abx + aby * aby
    t = 0.0 if ab2 == 0 else max(0.0, min(1.0, (apx * abx + apy * aby) / ab2))
    cx, cy = ax + t * abx, ay + t * aby
    return math.hypot(px - cx, py - cy)


def poly_bbox(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def cell_samples(x0, y0, cw, ch):
    """Centre + corners + edge midpoints — catches thin polygon overlaps."""
    x1, y1 = x0 + cw, y0 + ch
    xm, ym = x0 + cw * 0.5, y0 + ch * 0.5
    return (
        (xm, ym),
        (x0, y0),
        (x1, y0),
        (x0, y1),
        (x1, y1),
        (xm, y0),
        (xm, y1),
        (x0, ym),
        (x1, ym),
    )


def cell_overlaps_poly(x0, y0, cw, ch, poly, edge_thresh):
    for x, y in cell_samples(x0, y0, cw, ch):
        if pip(x, y, poly):
            return True
    # Cell near a boundary (thin peninsula / city edge)
    xm, ym = x0 + cw * 0.5, y0 + ch * 0.5
    for i in range(len(poly)):
        a = poly[i]
        b = poly[(i + 1) % len(poly)]
        if dist_to_seg(xm, ym, a[0], a[1], b[0], b[1]) <= edge_thresh:
            return True
    return False


def cell_near_poly(x0, y0, cw, ch, poly, thresh):
    """True if cell centre/corners are inside or within thresh of an edge."""
    for x, y in cell_samples(x0, y0, cw, ch):
        if pip(x, y, poly):
            return True
        for i in range(len(poly)):
            a = poly[i]
            b = poly[(i + 1) % len(poly)]
            if dist_to_seg(x, y, a[0], a[1], b[0], b[1]) <= thresh:
                return True
    return False


def spiral(col, row, max_r=12):
    yield col, row
    for r in range(1, max_r + 1):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r:
                    continue
                yield col + dx, row + dy


def main():
    data = json.loads(MAP_PATH.read_text())
    vb = data["viewBox"]
    w, h = vb[2], vb[3]
    rows = int(round(COLS * h / w))
    cw, ch = w / COLS, h / rows
    features = data["features"]
    parsed = [{**f, "polys": parse_path(f["path"])} for f in features]
    for f in parsed:
        bbs = [poly_bbox(p) for p in f["polys"]] if f["polys"] else []
        if bbs:
            f["bbox"] = (
                min(b[0] for b in bbs),
                min(b[1] for b in bbs),
                max(b[2] for b in bbs),
                max(b[3] for b in bbs),
            )
        else:
            f["bbox"] = (f["cx"], f["cy"], f["cx"], f["cy"])

    order = {"oblast": 0, "raion": 1, "city": 2, "river": 3, "town": 4}
    cell = [-1] * (COLS * rows)
    # Half-diagonal + a little — claims cells that only graze a boundary
    edge_thresh = math.hypot(cw, ch) * 0.55
    river_thresh = max(cw, ch) * 0.85

    # 1) Land regions — centre pip first, then overlap for city/raion edges
    for fi, f in enumerate(parsed):
        if f["kind"] not in ("oblast", "raion", "city"):
            continue
        bx0, by0, bx1, by1 = f["bbox"]
        pad = edge_thresh if f["kind"] == "city" else 0
        c0 = max(0, int((bx0 - pad) / cw))
        c1 = min(COLS - 1, int((bx1 + pad) / cw))
        r0 = max(0, int((by0 - pad) / ch))
        r1 = min(rows - 1, int((by1 + pad) / ch))
        use_overlap = f["kind"] in ("city", "raion")
        for row in range(r0, r1 + 1):
            for col in range(c0, c1 + 1):
                x0, y0 = col * cw, row * ch
                xm, ym = x0 + cw * 0.5, y0 + ch * 0.5
                hit = False
                for p in f["polys"]:
                    if pip(xm, ym, p):
                        hit = True
                        break
                    if use_overlap and cell_overlaps_poly(x0, y0, cw, ch, p, edge_thresh):
                        hit = True
                        break
                if not hit:
                    continue
                prev = cell[row * COLS + col]
                if prev < 0 or order[f["kind"]] >= order[parsed[prev]["kind"]]:
                    cell[row * COLS + col] = fi

    # 2) Rivers — thicken so Dnipro/Desna stay continuous ribbons
    for fi, f in enumerate(parsed):
        if f["kind"] != "river":
            continue
        bx0, by0, bx1, by1 = f["bbox"]
        c0 = max(0, int((bx0 - river_thresh) / cw))
        c1 = min(COLS - 1, int((bx1 + river_thresh) / cw))
        r0 = max(0, int((by0 - river_thresh) / ch))
        r1 = min(rows - 1, int((by1 + river_thresh) / ch))
        for row in range(r0, r1 + 1):
            for col in range(c0, c1 + 1):
                x0, y0 = col * cw, row * ch
                if any(cell_near_poly(x0, y0, cw, ch, p, river_thresh) for p in f["polys"]):
                    cell[row * COLS + col] = fi

    # 3) Towns — every cell whose rect intersects the settlement disc
    for fi, f in enumerate(parsed):
        if f["kind"] != "town":
            continue
        # Match original SVG radii, but never thinner than ~1 cell
        base_r = 16.0 if f.get("major") else 13.0
        rad = max(base_r, math.hypot(cw, ch) * 0.9)
        cx, cy = f["cx"], f["cy"]
        c0 = max(0, int((cx - rad) / cw))
        c1 = min(COLS - 1, int((cx + rad) / cw))
        r0 = max(0, int((cy - rad) / ch))
        r1 = min(rows - 1, int((cy + rad) / ch))
        for row in range(r0, r1 + 1):
            for col in range(c0, c1 + 1):
                # circle vs cell AABB (closest point)
                x0, y0 = col * cw, row * ch
                qx = min(max(cx, x0), x0 + cw)
                qy = min(max(cy, y0), y0 + ch)
                if (qx - cx) ** 2 + (qy - cy) ** 2 <= rad * rad:
                    prev = cell[row * COLS + col]
                    if prev >= 0 and parsed[prev]["kind"] == "town" and prev != fi:
                        # keep earlier town; displace later ones below
                        continue
                    cell[row * COLS + col] = fi

    # Ensure every town that lost its cells (collision) still gets one
    counts = Counter(cell)
    for fi, f in enumerate(parsed):
        if f["kind"] != "town" or counts[fi] > 0:
            continue
        col0 = min(COLS - 1, max(0, int(f["cx"] / cw)))
        row0 = min(rows - 1, max(0, int(f["cy"] / ch)))
        for col, row in spiral(col0, row0):
            if not (0 <= col < COLS and 0 <= row < rows):
                continue
            prev = cell[row * COLS + col]
            if prev >= 0 and parsed[prev]["kind"] == "town":
                continue
            cell[row * COLS + col] = fi
            counts = Counter(cell)
            break

    counts = Counter(cell)
    for fi, f in enumerate(parsed):
        if counts[fi] > 0:
            continue
        col0 = min(COLS - 1, max(0, int(f["cx"] / cw)))
        row0 = min(rows - 1, max(0, int(f["cy"] / ch)))
        for col, row in spiral(col0, row0):
            if not (0 <= col < COLS and 0 <= row < rows):
                continue
            prev = cell[row * COLS + col]
            if prev >= 0 and parsed[prev]["kind"] == "town":
                continue
            if prev >= 0 and counts[prev] <= 1:
                continue
            cell[row * COLS + col] = fi
            counts = Counter(cell)
            break

    counts = Counter(cell)
    out = {
        "cols": COLS,
        "rows": rows,
        "viewBox": list(vb),
        "cellW": cw,
        "cellH": ch,
        "cells": cell,
    }
    OUT_PATH.write_text(json.dumps(out, separators=(",", ":")))
    have = sum(1 for i in range(len(parsed)) if counts[i] > 0)
    print(f"wrote {OUT_PATH} ({COLS}×{rows}, {have}/{len(parsed)} features, filled={COLS * rows - counts[-1]})")
    for fi, f in enumerate(parsed):
        if f["kind"] in ("city", "river", "town") or counts[fi] < 3:
            print(f"  {counts[fi]:5d}  {f['id']:20s}  {f['kind']}")


if __name__ == "__main__":
    main()
