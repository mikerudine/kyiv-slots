#!/usr/bin/env python3
"""Rasterize coloring/map.json into coloring/grid.json (point-in-polygon at cell centres)."""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MAP_PATH = ROOT / "map.json"
OUT_PATH = ROOT / "grid.json"

# ~12–16 CSS px at default zoom on a ~374px-wide phone stage (×1.15 fit zoom).
COLS = 32


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


def near_poly(x, y, poly, thresh):
    if pip(x, y, poly):
        return True
    for i in range(len(poly)):
        a = poly[i]
        b = poly[(i + 1) % len(poly)]
        if dist_to_seg(x, y, a[0], a[1], b[0], b[1]) <= thresh:
            return True
    return False


def spiral(col, row):
    yield col, row
    for r in range(1, 8):
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
    order = {"oblast": 0, "raion": 1, "city": 2, "river": 3, "town": 4}
    cell = [-1] * (COLS * rows)
    river_thresh = max(cw, ch) * 0.5

    for fi, f in enumerate(parsed):
        if f["kind"] not in ("oblast", "raion", "city"):
            continue
        for row in range(rows):
            for col in range(COLS):
                x, y = (col + 0.5) * cw, (row + 0.5) * ch
                if any(pip(x, y, p) for p in f["polys"]):
                    prev = cell[row * COLS + col]
                    if prev < 0 or order[f["kind"]] >= order[parsed[prev]["kind"]]:
                        cell[row * COLS + col] = fi

    for fi, f in enumerate(parsed):
        if f["kind"] != "river":
            continue
        for row in range(rows):
            for col in range(COLS):
                x, y = (col + 0.5) * cw, (row + 0.5) * ch
                if any(near_poly(x, y, p, river_thresh) for p in f["polys"]):
                    cell[row * COLS + col] = fi

    for fi, f in enumerate(parsed):
        if f["kind"] != "town":
            continue
        col0 = min(COLS - 1, max(0, int(f["cx"] / cw)))
        row0 = min(rows - 1, max(0, int(f["cy"] / ch)))
        placed = False
        for col, row in spiral(col0, row0):
            if not (0 <= col < COLS and 0 <= row < rows):
                continue
            prev = cell[row * COLS + col]
            if prev >= 0 and parsed[prev]["kind"] == "town":
                continue
            cell[row * COLS + col] = fi
            placed = True
            break
        if not placed:
            cell[row0 * COLS + col0] = fi

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
    print(f"wrote {OUT_PATH} ({COLS}×{rows}, {have}/{len(parsed)} features)")


if __name__ == "__main__":
    main()
