# Графік світла (minesweeper)

Outage-schedule Minesweeper for *One Day in Kyiv*. Difficulty selector:

- **Easy:** 12×14 — 7 weekdays × 00–12 / 12–24 half-days, 18 traps (~10.7%).
- **Hard:** 24×28 — one hour row (00–01 … 23–24) × 28 day columns, 120 traps (~17.9%). Two-axis scroll on phone.

## Visual meaning

- **Closed** dark cells = unknown hours (no bolt).
- **Opened empty (zero) flood** = **no power** — mid-grey with crossed lightning.
- **Opened numbered** = **power on** — white with a digit (counts adjacent **trap** outages / mines).
- **Trap mines** lose the round if opened; the counter tracks them. At the end they also show as no-power (grey + bolt).
- Classic flood / first-click safety / flags unchanged. Win by opening every safe cell.
- On win **or** loss: strip digits and flags; keep the same power / no-power colours. Result banner sits outside the grid.

- UA/EN, ☰ Меню, rules overlay, replay. No official logos or live outage data — it's a game.
- Test API: `window.__minesweeper` (`state`, `setMode`, `openAt`, `toggleFlag`, `seed`, `reset`).
- Headless checks: `node minesweeper/logic-test.mjs` (needs `playwright-core` + Chrome).
