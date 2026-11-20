#!/usr/bin/env python3
"""Fetch OSM motorway/trunk for the coloring map bbox and merge into map.json.

Uses Overpass API. Geometry is projected with the same affine fit used for the
existing map (town/oblast landmarks → viewBox). Licence: ODbL — attribution is
appended to map.json attribution / source fields.

Usage:
  python3 build-highways.py                  # fetch + update map.json
  python3 build-highways.py --from FILE.json # use a saved Overpass response
"""
from __future__ import annotations

import argparse
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MAP_PATH = ROOT / "map.json"

# Affine fit (lon,lat → map x,y) from landmark towns in map.json.
CX = (1.37328161e02, 7.27498615e-01, -3.85123677e03)
CY = (-2.18584249e-01, -2.96083699e02, 1.54510023e04)

BBOX = (48.4, 27.7, 52.2, 35.1)  # south, west, north, east
OVERPASS = "https://overpass-api.de/api/interpreter"
QUERY = (
    f'[out:json][timeout:120];'
    f'way["highway"~"^(motorway|trunk)$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});'
    f'out geom;'
)


def project(lon: float, lat: float) -> tuple[float, float]:
    x = CX[0] * lon + CX[1] * lat + CX[2]
    y = CY[0] * lon + CY[1] * lat + CY[2]
    return x, y


def perp_dist(p, a, b) -> float:
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(pts, eps: float):
    if len(pts) <= 2:
        return pts
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = perp_dist(pts[i], pts[0], pts[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        left = simplify(pts[: idx + 1], eps)
        right = simplify(pts[idx:], eps)
        return left[:-1] + right
    return [pts[0], pts[-1]]


def path_to_svg(lines) -> str:
    parts = []
    for pts in lines:
        if len(pts) < 2:
            continue
        parts.append(
            f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"
            + "".join(f"L{x:.1f} {y:.1f}" for x, y in pts[1:])
        )
    return "".join(parts)


def fetch_overpass() -> dict:
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    req = urllib.request.Request(
        OVERPASS,
        data=data,
        headers={"User-Agent": "kyiv-slots-coloring-build/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=130) as resp:
        return json.loads(resp.read().decode())


def lines_from_overpass(osm: dict):
    lines = []
    for e in osm.get("elements") or []:
        geom = e.get("geometry") or []
        if len(geom) < 2:
            continue
        pts = [project(g["lon"], g["lat"]) for g in geom]
        if all(x < -50 or x > 1050 or y < -50 or y > 1150 for x, y in pts):
            continue
        pts = simplify(pts, 2.0)
        if len(pts) >= 2:
            lines.append([(round(x, 1), round(y, 1)) for x, y in pts])
    return lines


def ensure_attr(s: str, bit: str) -> str:
    if bit in s:
        return s
    return (s.rstrip(". ") + ". " + bit).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", help="Overpass JSON file")
    args = ap.parse_args()

    if args.src:
        osm = json.loads(Path(args.src).read_text())
    else:
        print("fetching Overpass…")
        osm = fetch_overpass()

    lines = lines_from_overpass(osm)
    if not lines:
        raise SystemExit("no highway lines produced")

    xs, ys = [], []
    for pts in lines:
        for x, y in pts:
            if 0 <= x <= 1000 and 0 <= y <= 1100:
                xs.append(x)
                ys.append(y)
    cx = round(sum(xs) / len(xs), 1)
    cy = round(sum(ys) / len(ys), 1)
    svg = path_to_svg(lines)

    feature = {
        "id": "highways",
        "kind": "highway",
        "layer": "road",
        "label": "",
        "major": False,
        "cx": cx,
        "cy": cy,
        "geom": "line",
        "path": svg,
    }

    data = json.loads(MAP_PATH.read_text())
    feats = [f for f in data["features"] if f.get("kind") != "highway"]
    feats.append(feature)
    data["features"] = feats
    data["attribution"] = ensure_attr(
        data.get("attribution") or "",
        "Траси: © OpenStreetMap (ODbL).",
    )
    # EN-friendly source line
    src = data.get("source") or ""
    data["source"] = ensure_attr(
        src,
        "OpenStreetMap motorway/trunk (ODbL 1.0)",
    )
    MAP_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(
        f"updated {MAP_PATH}: {len(lines)} highway polylines, "
        f"svg={len(svg)} chars, centroid=({cx},{cy})"
    )


if __name__ == "__main__":
    main()
