#!/usr/bin/env python3
"""Rasterize coloring/map.json into coloring/grid.json.

Each cell is assigned the feature with the largest overlap inside that cell
(area-majority via supersampling). Features are tested in SVG paint order
(oblast → raion → city → river → town) so nested/overlapping geometry matches
the original map; there is no distance-based thickening of rivers or towns.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MAP_PATH = ROOT / "map.json"
OUT_PATH = ROOT / "grid.json"

# Fine grid so the silhouette reads; keep square cells in map space.
COLS = 96
# 8×8 = 64 samples/cell — enough for area-majority without being too slow.
SAMPLES = 8

# Paint order (low → high). Higher wins at a sample point when polygons overlap.
Z = {"oblast": 0, "raion": 1, "city": 2, "river": 3, "town": 4}


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


def poly_bbox(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def feature_at(x, y, parsed, ordered):
    """Topmost feature covering (x,y), or -1."""
    hit = -1
    hit_z = -1
    for fi in ordered:
        f = parsed[fi]
        bx0, by0, bx1, by1 = f["bbox"]
        if x < bx0 or x > bx1 or y < by0 or y > by1:
            continue
        if any(pip(x, y, p) for p in f["polys"]):
            z = Z.get(f["kind"], -1)
            if z >= hit_z:
                hit = fi
                hit_z = z
    return hit


def main():
    data = json.loads(MAP_PATH.read_text())
    vb = data["viewBox"]
    w, h = float(vb[2]), float(vb[3])
    # Square cells: rows from aspect so cellW == cellH
    cw = w / COLS
    rows = int(round(h / cw))
    ch = h / rows  # ≈ cw
    features = data["features"]
    parsed = []
    for f in features:
        polys = parse_path(f["path"])
        if polys:
            bbs = [poly_bbox(p) for p in polys]
            bbox = (
                min(b[0] for b in bbs),
                min(b[1] for b in bbs),
                max(b[2] for b in bbs),
                max(b[3] for b in bbs),
            )
        else:
            bbox = (f["cx"], f["cy"], f["cx"], f["cy"])
        parsed.append({**f, "polys": polys, "bbox": bbox})

    # Process low→high so later overwrites in ordered list are fine; feature_at uses Z.
    ordered = sorted(range(len(parsed)), key=lambda i: Z.get(parsed[i]["kind"], -1))

    cell = [-1] * (COLS * rows)
    step = 1.0 / SAMPLES
    # Sample at centres of SAMPLES×SAMPLES subcells
    offsets = [(i + 0.5) * step for i in range(SAMPLES)]

    for row in range(rows):
        y0 = row * ch
        for col in range(COLS):
            x0 = col * cw
            votes = Counter()
            for oy in offsets:
                for ox in offsets:
                    fi = feature_at(x0 + ox * cw, y0 + oy * ch, parsed, ordered)
                    if fi >= 0:
                        votes[fi] += 1
            if not votes:
                continue
            # Majority; ties → higher Z, then lower index for stability
            best = max(
                votes.items(),
                key=lambda kv: (kv[1], Z.get(parsed[kv[0]]["kind"], -1), -kv[0]),
            )[0]
            cell[row * COLS + col] = best

    counts = Counter(cell)
    # Ensure every feature that had geometry but lost the majority vote still
    # appears at least once (centroid cell), otherwise the colour can't be played.
    for fi, f in enumerate(parsed):
        if counts[fi] > 0:
            continue
        col = min(COLS - 1, max(0, int(f["cx"] / cw)))
        row = min(rows - 1, max(0, int(f["cy"] / ch)))
        # Prefer empty or lower-Z overwrite of multi-cell features
        placed = False
        for rad in range(0, 8):
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    if max(abs(dx), abs(dy)) != rad and rad > 0:
                        continue
                    c, r = col + dx, row + dy
                    if not (0 <= c < COLS and 0 <= r < rows):
                        continue
                    prev = cell[r * COLS + c]
                    if prev >= 0 and counts[prev] <= 1:
                        continue
                    cell[r * COLS + c] = fi
                    counts = Counter(cell)
                    placed = True
                    break
                if placed:
                    break
            if placed:
                break

    counts = Counter(cell)
    out = {
        "cols": COLS,
        "rows": rows,
        "viewBox": list(vb),
        "cellW": cw,
        "cellH": ch,
        "samples": SAMPLES,
        "cells": cell,
    }
    OUT_PATH.write_text(json.dumps(out, separators=(",", ":")))
    have = sum(1 for i in range(len(parsed)) if counts[i] > 0)
    print(
        f"wrote {OUT_PATH} ({COLS}×{rows}, cell≈{cw:.3f}, "
        f"{have}/{len(parsed)} features, filled={COLS * rows - counts[-1]}, samples={SAMPLES}²)"
    )
    for fi, f in enumerate(parsed):
        if f["kind"] in ("city", "river", "town") or counts[fi] < 5:
            print(f"  {counts[fi]:5d}  {f['id']:20s}  {f['kind']}")


if __name__ == "__main__":
    main()
