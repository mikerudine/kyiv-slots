# Графік світла (minesweeper)

Outage-schedule Minesweeper for *One Day in Kyiv*. Difficulty selector:

- **Easy:** 12×14 — 7 weekdays × 00–12 / 12–24 half-days, 18 darkness (~10.7%).
- **Hard:** 24×28 — one hour row (00–01 … 23–24) × 28 day columns, 120 darkness (~17.9%). Two-axis scroll on phone.

- Open a lit cell to see how many darkness neighbours it has (8-adjacent, no wrap).
- Zero floods open the safe area.
- Grey cells with a crossed lightning bolt are darkness — opening one loses.
- First click is always safe. Flag with long-press, right-click, or the Flag button.
- Win by opening every lit cell. Switching difficulty resets the board.
- UA/EN, ☰ Меню, rules overlay, replay. No official logos or live outage data — it's a game.
- Test API: `window.__minesweeper` (`state`, `setMode`, `openAt`, `toggleFlag`, `seed`, `reset`).
- Headless checks: `node minesweeper/logic-test.mjs` (needs `playwright-core` + Chrome).
