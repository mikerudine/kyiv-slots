# Розфарбуй тривоги (coloring)

Paint-by-numbers map of Kyiv city, Kyiv oblast raions, and neighbouring oblasts
(Zhytomyr, Chernihiv, Cherkasy, Poltava, Sumy, Vinnytsia), styled like an air-raid
alert map. The original SVG region geometry (`map.json`) is the source of truth;
a uniform square grid (~96 across) is overlaid with area-majority ownership
(8×8 supersamples per cell). On screen every cell is an identical integer pixel
size (1px/cell buffer, nearest-neighbour scale).

**Rounds:** 5 rounds × 2 minutes. When the timer ends, a “change” reassigns ~60%
of land (city/raion/oblast) targets and wipes paint on those cells — whether the
map was finished or not. Each round’s coverage % is added to the score; after
round 5 the final screen shows total/average %. Finishing 100% early unlocks
«Далі» / «Next» with a small time bonus. Rivers, towns, and highways stay static.

**HUD:** live «N% території» / «N% of territory» (cells painted with their
current correct status). Timer warn ≤20 s, urgent ≤10 s.

## Map data

- Administrative boundaries: [geoBoundaries](https://www.geoboundaries.org/) gbOpen
  UKR ADM1/ADM2 (Open Data Commons ODbL 1.0) — attribution required.
- Rivers (Dnipro, Desna): [Natural Earth](https://www.naturalearthdata.com/) 10m
  rivers/lake centerlines (public domain).
- Highways (motorway/trunk): [OpenStreetMap](https://www.openstreetmap.org/) via
  Overpass — ODbL 1.0; regenerate with `python3 build-highways.py`.
- Elevation: SRTM via [Mapzen Terrarium](https://github.com/tilezen/joerd/blob/master/docs/formats.md)
  AWS tiles (public domain); `python3 build-elev.py` writes `elev-means.json`,
  then `build-grid.py` stores shade bands 0..4 in `grid.json`.
- Cell ownership is precomputed in `grid.json`. Regenerate with
  `python3 build-grid.py` after editing `map.json` / elev cache.

## Controls

- Palette swatches 1–6 (no alert / yellow / missile / river / town / highway)
- Drag (or tap) to paint with a ~11 CSS px brush; only matching-target cells fill
- Selected-colour blanks use a pale static tint + tiny dot (no dark flash)
- Painted cells show terrain relief (higher = darker shade of the status colour)
- Numbers appear only when zoomed in enough; default view is silhouette-only
- Two fingers: pinch zoom + pan; mouse wheel zooms on desktop
- `prefers-reduced-motion` disables the short «зміна» banner fade

## Test API

`window.__coloring` — `state`, `select`, `paintId`, `paintCell`, `paintAt`,
`paintCorrectAll`, `endRound`, `forceChange`, `forceOver`, `features`, `cells`.
