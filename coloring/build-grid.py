#!/usr/bin/env python3
"""Rasterize coloring/map.json into coloring/grid.json.

Each cell is assigned the feature with the largest overlap inside that cell
(area-majority via supersampling). Features are tested in SVG paint order
(oblast → raion → city → river → town → highway) so nested/overlapping
geometry matches the original map; there is no distance-based thickening of
rivers or towns.

Highway features use geom:"line" (or kind highway): a cell becomes highway if
any line segment passes through it (1-cell-wide line rasterization). Rivers and
other polygons keep area-majority handling.

Elevation: if elev-means.json is present (from build-elev.py / SRTM Terrarium),
each filled cell gets a shade band 0..4 (quintiles across the map; higher =
darker when painted). Stored as grid.json "shade".
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
ELEV_MEANS_PATH = ROOT / "elev-means.json"
SHADE_BANDS = 5  # 0..4

# Fine grid so the silhouette reads; keep square cells in map space.
COLS = 96
# 8×8 = 64 samples/cell — enough for area-majority without being too slow.
SAMPLES = 8

# Paint order (low → high). Higher wins at a sample point when polygons overlap.
# Highways are stamped after majority so thin roads stay 1 cell wide on top.
Z = {"oblast": 0, "raion": 1, "city": 2, "river": 3, "town": 4, "highway": 5}


def parse_path(d: str):
    """Parse SVG path into polygons (closed) or polylines (open).

    Returns (polys, lines). Closed subpaths (ending in Z or returning to start)
    go to polys; open subpaths go to lines.
    """
    tokens = re.findall(r"[MLZ]|-?\d*\.?\d+", d)
    polys, lines, cur, i, cmd = [], [], [], 0, None
    closed = False

    def flush(force_poly=False):
        nonlocal cur, closed
        if not cur:
            closed = False
            return
        is_poly = force_poly or closed
        if len(cur) >= 2 and not is_poly:
            # Treat near-closed rings as polygons
            if math.hypot(cur[0][0] - cur[-1][0], cur[0][1] - cur[-1][1]) < 0.5:
                is_poly = True
        if is_poly and len(cur) >= 3:
            polys.append(cur)
        elif len(cur) >= 2:
            lines.append(cur)
        cur = []
        closed = False

    while i < len(tokens):
        t = tokens[i]
        if t in "MLZ":
            cmd = t
            i += 1
            if cmd == "Z":
                closed = True
                flush(force_poly=True)
            continue
        x, y = float(t), float(tokens[i + 1])
        i += 2
        if cmd == "M":
            flush()
            cur = [(x, y)]
        elif cmd == "L":
            cur.append((x, y))
    flush()
    return polys, lines


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
    """Topmost polygon feature covering (x,y), or -1. Skips line-only features."""
    hit = -1
    hit_z = -1
    for fi in ordered:
        f = parsed[fi]
        if not f["polys"]:
            continue
        bx0, by0, bx1, by1 = f["bbox"]
        if x < bx0 or x > bx1 or y < by0 or y > by1:
            continue
        if any(pip(x, y, p) for p in f["polys"]):
            z = Z.get(f["kind"], -1)
            if z >= hit_z:
                hit = fi
                hit_z = z
    return hit


def stamp_line_cells(cell, cols, rows, cw, ch, lines, fi):
    """Mark every cell a polyline passes through (1-cell wide)."""

    def visit(c, r):
        if 0 <= c < cols and 0 <= r < rows:
            cell[r * cols + c] = fi

    for pts in lines:
        for i in range(len(pts) - 1):
            x0, y0 = pts[i]
            x1, y1 = pts[i + 1]
            # Grid traversal (Amanatides & Woo style in cell space)
            c0 = x0 / cw
            r0 = y0 / ch
            c1 = x1 / cw
            r1 = y1 / ch
            dc = c1 - c0
            dr = r1 - r0
            steps = max(1, int(math.ceil(max(abs(dc), abs(dr)) * 2)))
            for s in range(steps + 1):
                t = s / steps
                visit(int(math.floor(c0 + dc * t)), int(math.floor(r0 + dr * t)))
            # Also stamp endpoints explicitly
            visit(int(math.floor(c0)), int(math.floor(r0)))
            visit(int(math.floor(c1)), int(math.floor(r1)))


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
        polys, lines = parse_path(f["path"])
        # Force highway kind to line treatment even if path looks closed
        if f.get("geom") == "line" or f.get("kind") == "highway":
            if polys and not lines:
                lines = polys
                polys = []
            elif polys:
                lines = lines + polys
                polys = []
        parts = polys + lines
        if parts:
            bbs = [poly_bbox(p) for p in parts]
            bbox = (
                min(b[0] for b in bbs),
                min(b[1] for b in bbs),
                max(b[2] for b in bbs),
                max(b[3] for b in bbs),
            )
        else:
            bbox = (f["cx"], f["cy"], f["cx"], f["cy"])
        parsed.append({**f, "polys": polys, "lines": lines, "bbox": bbox})

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
    # Ensure every polygon feature that had geometry but lost the majority vote
    # still appears at least once (centroid cell), otherwise the colour can't be played.
    for fi, f in enumerate(parsed):
        if f.get("lines") and not f["polys"]:
            continue  # line features stamped below
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

    # Fill interior holes (empty cells inside the outer silhouette) with the
    # majority feature of their 8-neighbours. Exterior empties stay background.
    exterior = [False] * (COLS * rows)
    stack = []
    for col in range(COLS):
        for row in (0, rows - 1):
            i = row * COLS + col
            if cell[i] < 0 and not exterior[i]:
                exterior[i] = True
                stack.append(i)
    for row in range(rows):
        for col in (0, COLS - 1):
            i = row * COLS + col
            if cell[i] < 0 and not exterior[i]:
                exterior[i] = True
                stack.append(i)
    while stack:
        i = stack.pop()
        r, c = i // COLS, i % COLS
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                rr, cc = r + dy, c + dx
                if not (0 <= rr < rows and 0 <= cc < COLS):
                    continue
                j = rr * COLS + cc
                if cell[j] < 0 and not exterior[j]:
                    exterior[j] = True
                    stack.append(j)

    holes = 0
    changed = True
    while changed:
        changed = False
        for row in range(rows):
            for col in range(COLS):
                i = row * COLS + col
                if cell[i] >= 0 or exterior[i]:
                    continue
                votes = Counter()
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        rr, cc = row + dy, col + dx
                        if not (0 <= rr < rows and 0 <= cc < COLS):
                            continue
                        prev = cell[rr * COLS + cc]
                        if prev >= 0:
                            votes[prev] += 1
                if not votes:
                    continue
                best = max(
                    votes.items(),
                    key=lambda kv: (kv[1], Z.get(parsed[kv[0]]["kind"], -1), -kv[0]),
                )[0]
                cell[i] = best
                holes += 1
                changed = True

    # Stamp highways last: 1-cell-wide line through cells (overwrite land only).
    # Never erase the last remaining cell of a river/town/city feature.
    hw_cells = 0
    for fi, f in enumerate(parsed):
        if not f["lines"]:
            continue
        before = cell.count(fi)
        tmp = [-1] * len(cell)
        stamp_line_cells(tmp, COLS, rows, cw, ch, f["lines"], fi)
        counts = Counter(cell)
        for i in range(len(cell)):
            if tmp[i] != fi or exterior[i] or cell[i] < 0:
                continue
            prev = cell[i]
            # Keep singleton (or last) cells of non-highway features playable
            if (
                prev >= 0
                and parsed[prev]["kind"] != "highway"
                and counts[prev] <= 1
                and parsed[prev]["kind"] in ("town", "river", "city")
            ):
                continue
            counts[prev] -= 1
            counts[fi] += 1
            cell[i] = fi
        after = cell.count(fi)
        hw_cells += max(0, after - before)

    # Re-place any polygon feature that lost all cells (e.g. town under a road).
    counts = Counter(cell)
    for fi, f in enumerate(parsed):
        if f["lines"] and not f["polys"]:
            continue
        if counts[fi] > 0:
            continue
        col = min(COLS - 1, max(0, int(f["cx"] / cw)))
        row = min(rows - 1, max(0, int(f["cy"] / ch)))
        placed = False
        for rad in range(0, 8):
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    if max(abs(dx), abs(dy)) != rad and rad > 0:
                        continue
                    c, r = col + dx, row + dy
                    if not (0 <= c < COLS and 0 <= r < rows):
                        continue
                    if exterior[r * COLS + c]:
                        continue
                    prev = cell[r * COLS + c]
                    if prev >= 0 and counts[prev] <= 1:
                        continue
                    # Prefer overwriting highway or multi-cell land
                    cell[r * COLS + c] = fi
                    counts = Counter(cell)
                    placed = True
                    break
                if placed:
                    break
            if placed:
                break

    counts = Counter(cell)

    # Relief shade bands 0..4 from precomputed mean elevation (optional).
    shade = [0] * (COLS * rows)
    elev_note = "none"
    if ELEV_MEANS_PATH.exists():
        elev = json.loads(ELEV_MEANS_PATH.read_text())
        means = elev.get("means") or []
        if len(means) != COLS * rows:
            # Grid size changed — ignore stale cache
            elev_note = f"stale({len(means)}≠{COLS * rows})"
        else:
            valid = [m for m, fi in zip(means, cell) if fi >= 0 and m is not None]
            if valid:
                valid_sorted = sorted(valid)
                # Quintile thresholds
                n = len(valid_sorted)
                thresholds = [
                    valid_sorted[min(n - 1, int(n * (b + 1) / SHADE_BANDS))]
                    for b in range(SHADE_BANDS - 1)
                ]
                for i, (m, fi) in enumerate(zip(means, cell)):
                    if fi < 0 or m is None:
                        continue
                    band = SHADE_BANDS - 1
                    for b, t in enumerate(thresholds):
                        if m <= t:
                            band = b
                            break
                    shade[i] = band
                elev_note = f"bands={Counter(s for s, fi in zip(shade, cell) if fi >= 0)}"
            else:
                elev_note = "empty"

    out = {
        "cols": COLS,
        "rows": rows,
        "viewBox": list(vb),
        "cellW": cw,
        "cellH": ch,
        "samples": SAMPLES,
        "cells": cell,
        "shade": shade,
        "shadeBands": SHADE_BANDS,
    }
    OUT_PATH.write_text(json.dumps(out, separators=(",", ":")))
    have = sum(1 for i in range(len(parsed)) if counts[i] > 0)
    print(
        f"wrote {OUT_PATH} ({COLS}×{rows}, cell≈{cw:.3f}, "
        f"{have}/{len(parsed)} features, filled={COLS * rows - counts[-1]}, "
        f"holes_filled={holes}, hw_stamp≈{hw_cells}, elev={elev_note}, samples={SAMPLES}²)"
    )
    for fi, f in enumerate(parsed):
        if f["kind"] in ("city", "river", "town", "highway") or counts[fi] < 5:
            print(f"  {counts[fi]:5d}  {f['id']:20s}  {f['kind']}")


if __name__ == "__main__":
    main()
