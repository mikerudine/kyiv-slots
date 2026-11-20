# Розфарбуй тривоги (coloring)

Paint-by-numbers map of Kyiv city, Kyiv oblast raions, and neighbouring oblasts
(Zhytomyr, Chernihiv, Cherkasy, Poltava, Sumy, Vinnytsia), styled like an air-raid
alert map. The map is rasterized into a fine grid of square cells (~96 across,
≈4–5 CSS px at default zoom on a phone so the silhouette stays readable). Paint
every cell before the 1-minute timer ends; a “change” then reassigns ~60% of
land targets and wipes paint on those cells. Incomplete map at change time ends
the run.

## Map data

- Administrative boundaries: [geoBoundaries](https://www.geoboundaries.org/) gbOpen
  UKR ADM1/ADM2 (Open Data Commons ODbL 1.0) — attribution required.
- Rivers (Dnipro, Desna): [Natural Earth](https://www.naturalearthdata.com/) 10m
  rivers/lake centerlines (public domain).
- Simplified and projected offline into `map.json` (SVG paths). Labels in Ukrainian.
- Cell ownership is precomputed in `grid.json` (centre pip for land; overlap /
  distance tests for rivers, city edges, and towns). Regenerate with
  `python3 build-grid.py` after editing `map.json`.

## Controls

- Palette swatches 1–5 (no alert / yellow / missile / river / town)
- Drag (or tap) to paint with a ~11 CSS px brush; only matching-target cells fill
- Selected-colour blanks use a pale static tint + tiny dot (no dark flash)
- Numbers appear only when zoomed in enough; default view is silhouette-only
- Two fingers: pinch zoom + pan; mouse wheel zooms on desktop
- `prefers-reduced-motion` disables the short «зміна» banner fade

## Test API

`window.__coloring` — `state`, `select`, `paintId`, `paintCell`, `paintAt`,
`paintCorrectAll`, `forceChange`, `forceOver`, `features`, `cells`.
