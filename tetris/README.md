# Тетріс відключень (Outage Tetris)

Ordinary Tetris for *One Day in Kyiv*, themed as an outage-queue schedule.

- Board: **24×10** — hour rows `00–01` … `23–24` × queues `1.1, 1.2, … 5.2`. Header corner: `Час/Гр.`
- No weekday / half-day labels — columns are outage queues only.
- Pieces: standard seven tetrominoes. **Active** = yellow lightning; **settled** = grey cell with white crossed lightning.
- Dark navy/charcoal schedule aesthetic, subtle grey grid, light labels.
- Rules: move, rotate (wall kicks), soft/hard drop, full-row clear, score, next preview, pause, game over, replay.
- Pace: beginner gravity (~900 ms), speeds up each level (every 10 lines).
- Controls: on-screen pad + swipe; keyboard arrows / WASD / Space / P.
- UA/EN, ☰ Menu. Tall board may scroll naturally on short viewports rather than crushing cells. No TikTok chrome, flashes, or shake.
- Test API: `window.__tetris` (`state`, `reset`, `move`, `rotate`, `hardDrop`, `pause`, `setLang`, `QUEUES`, …).
