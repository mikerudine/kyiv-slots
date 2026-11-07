# Тетріс відключень (Outage Tetris)

Ordinary Tetris for *One Day in Kyiv*, themed as an outage schedule.

- Board: **12×14** — 7 weekdays × two half-days (`00–12` / `12–24`), with hour labels on rows.
- Pieces: standard seven tetrominoes, made of grey outage cells with a crossed lightning bolt.
- Rules: move, rotate (with simple wall kicks), soft/hard drop, full-row clear, score, next preview, pause, game over, replay.
- Pace: beginner gravity (~900 ms), speeds up each level (every 10 lines).
- Controls: on-screen pad + swipe on board; keyboard arrows / WASD / Space / P.
- UA/EN, ☰ Menu. White schedule aesthetic, navy type, yellow accents. No DTEK branding, no live outage data.
- Test API: `window.__tetris` (`state`, `reset`, `move`, `rotate`, `hardDrop`, `pause`, `setLang`, …).
