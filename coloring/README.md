# Розфарбуй тривоги (coloring)

Paint-by-numbers map of Kyiv city, Kyiv oblast raions, and neighbouring oblasts
(Zhytomyr, Chernihiv, Cherkasy, Poltava, Sumy, Vinnytsia), styled like an air-raid
alert map. Paint every region, river segment, and town before the ~20s timer ends;
a “change” then reassigns ~60% of land targets. Incomplete map at change time ends
the run.

## Map data

- Administrative boundaries: [geoBoundaries](https://www.geoboundaries.org/) gbOpen
  UKR ADM1/ADM2 (Open Data Commons ODbL 1.0) — attribution required.
- Rivers (Dnipro, Desna): [Natural Earth](https://www.naturalearthdata.com/) 10m
  rivers/lake centerlines (public domain).
- Simplified and projected offline into `map.json` (SVG paths). Labels in Ukrainian.

## Controls

- Palette swatches 1–5 (no alert / yellow / missile / river / town)
- Tap regions to fill (wrong colour overwrites)
- Pinch or wheel to zoom; drag to pan
- `prefers-reduced-motion` disables short fades

## Test API

`window.__coloring` — `state`, `select`, `paintId`, `paintCorrectAll`, `forceChange`, `forceOver`, `features`.
