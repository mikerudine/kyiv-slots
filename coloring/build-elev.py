#!/usr/bin/env python3
"""Build coloring/elev-means.json from AWS Terrain Tiles (Mapzen Terrarium / SRTM).

Downloads z=8 Terrarium PNGs covering the coloring map bbox, samples mean
elevation per grid cell (same cols/rows as grid.json), and writes a compact
JSON cache that build-grid.py turns into shade bands 0..4.

Licence: underlying SRTM is public domain; Terrarium encoding via AWS elevation
tiles. Attribution is added to map.json by this script.

Requires: Pillow
  pip install pillow

Usage:
  python3 build-elev.py
"""
from __future__ import annotations

import json
import math
import urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError as e:
    raise SystemExit("Pillow required: pip install pillow") from e

import numpy as np

ROOT = Path(__file__).resolve().parent
GRID_PATH = ROOT / "grid.json"
MAP_PATH = ROOT / "map.json"
OUT_PATH = ROOT / "elev-means.json"
TILE_DIR = ROOT / "elev" / "8"

# Affine fit used for map.json landmarks (lon,lat → map x,y); invert for sampling.
CX = (1.37328161e02, 7.27498615e-01, -3.85123677e03)
CY = (-2.18584249e-01, -2.96083699e02, 1.54510023e04)
_M = np.array([[CX[0], CX[1]], [CY[0], CY[1]]], dtype=float)
_MINV = np.linalg.inv(_M)

ZOOM = 8
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
# Tile range covering map bbox ≈ lon 27.7–35.1, lat 48.4–52.2
X_RANGE = range(147, 153)
Y_RANGE = range(84, 89)


def map_to_lonlat(x: float, y: float) -> tuple[float, float]:
    lon, lat = _MINV @ np.array([x - CX[2], y - CY[2]])
    return float(lon), float(lat)


def deg2num(lat: float, lon: float, zoom: int) -> tuple[float, float]:
    n = 2**zoom
    xt = (lon + 180.0) / 360.0 * n
    lat_rad = math.radians(lat)
    yt = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n
    return xt, yt


def ensure_attr(s: str, bit: str) -> str:
    if bit in s:
        return s
    return (s.rstrip(". ") + ". " + bit).strip()


def fetch_tiles() -> None:
    TILE_DIR.mkdir(parents=True, exist_ok=True)
    for x in X_RANGE:
        for y in Y_RANGE:
            dest = TILE_DIR / f"{x}-{y}.png"
            if dest.exists() and dest.stat().st_size > 1000:
                continue
            url = TILE_URL.format(z=ZOOM, x=x, y=y)
            print(f"  fetch {url}")
            req = urllib.request.Request(url, headers={"User-Agent": "kyiv-slots-coloring/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                dest.write_bytes(resp.read())


def main() -> None:
    if not GRID_PATH.exists():
        raise SystemExit("grid.json missing — run build-grid.py first (without elev is fine)")

    print("fetching Terrarium tiles…")
    fetch_tiles()

    grid = json.loads(GRID_PATH.read_text())
    cols, rows = grid["cols"], grid["rows"]
    cw, ch = grid["cellW"], grid["cellH"]
    cells = grid["cells"]

    tile_cache: dict[tuple[int, int], np.ndarray] = {}

    def elev_at(lon: float, lat: float):
        xt, yt = deg2num(lat, lon, ZOOM)
        tx, ty = int(math.floor(xt)), int(math.floor(yt))
        key = (tx, ty)
        if key not in tile_cache:
            path = TILE_DIR / f"{tx}-{ty}.png"
            if not path.exists():
                return None
            tile_cache[key] = np.asarray(Image.open(path).convert("RGB"), dtype=np.int32)
        arr = tile_cache[key]
        px = max(0, min(255, int((xt - tx) * 256)))
        py = max(0, min(255, int((yt - ty) * 256)))
        r, g, b = arr[py, px]
        return (r * 256 + g + b / 256.0) - 32768.0

    means: list[float | None] = []
    for row in range(rows):
        for col in range(cols):
            i = row * cols + col
            if cells[i] < 0:
                means.append(None)
                continue
            vals = []
            for sy in (0.25, 0.5, 0.75):
                for sx in (0.25, 0.5, 0.75):
                    lon, lat = map_to_lonlat((col + sx) * cw, (row + sy) * ch)
                    e = elev_at(lon, lat)
                    if e is not None and e > -500:
                        vals.append(e)
            means.append(round(sum(vals) / len(vals), 1) if vals else None)

    valid = [m for m in means if m is not None]
    out = {
        "cols": cols,
        "rows": rows,
        "unit": "m",
        "source": "SRTM via Mapzen Terrarium (AWS elevation-tiles-prod) z8",
        "means": means,
    }
    OUT_PATH.write_text(json.dumps(out, separators=(",", ":")))
    print(
        f"wrote {OUT_PATH} ({len(valid)} cells, "
        f"elev {min(valid):.0f}–{max(valid):.0f} m)"
    )

    # Attribution on map credits line
    data = json.loads(MAP_PATH.read_text())
    data["attribution"] = ensure_attr(
        data.get("attribution") or "",
        "Рельєф: SRTM (Terrarium).",
    )
    data["source"] = ensure_attr(
        data.get("source") or "",
        "SRTM elevation via Mapzen Terrarium tiles (public domain)",
    )
    MAP_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print("updated map.json attribution")


if __name__ == "__main__":
    main()
