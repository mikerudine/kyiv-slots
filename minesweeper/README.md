# Графік світла (minesweeper)

Outage-schedule Minesweeper for *One Day in Kyiv*. Difficulty selector:

- **Easy:** 12×14 — 7 weekdays × 00–12 / 12–24 half-days, 18 darkness (~10.7%).
- **Hard:** 24×28 — one hour row (00–01 … 23–24) × 28 day columns, 120 darkness (~17.9%). Two-axis scroll on phone.

- Closed hours look **dark**; open them. Power-on hours turn **white with a digit** (nearby outages, 8-adjacent, no wrap).
- Zero floods neighbouring power-on hours. A true outage hour loses.
- First click is always safe. Flags work while playing (long-press / right-click / Flag button).
- Win by opening every power-on hour. On win **or** loss the grid becomes a **clean schedule**: white = power, grey + bolt = outage — no numbers or flags. Result banner sits outside the grid.
- Switching difficulty resets the board.
- UA/EN, ☰ Меню, rules overlay, replay. No official logos or live outage data — it's a game.
- Test API: `window.__minesweeper` (`state`, `setMode`, `openAt`, `toggleFlag`, `seed`, `reset`).
- Headless checks: `node minesweeper/logic-test.mjs` (needs `playwright-core` + Chrome).
