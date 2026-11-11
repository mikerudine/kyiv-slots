# Графік світла (minesweeper)

Outage-schedule Minesweeper for *One Day in Kyiv*. Columns are outage queues (same labels as Tetris). Difficulty selector:

- **Easy:** 24×10 — hour rows `00–01` … `23–24` × queues `1.1, 1.2, … 5.2`, 26 traps (~10.8%). Corner: `Час/Гр.` / `Time/Q.`
- **Hard:** 24×30 — same hour rows × three day groups, each repeating queues `1.1–5.2` (no invented 6.x IDs), 130 traps (~18.1%). Sticky day + queue headers; two-axis scroll on phone.

## Visual meaning

- **Closed** dark cells = unknown hours (no bolt).
- **Opened empty (zero) flood** = **no power** — mid-grey with crossed lightning.
- **Opened numbered** = **power on** — white with a digit (counts adjacent **trap** outages / mines).
- **Trap mines** lose the round if opened; the counter tracks them. At the end they also show as no-power (grey + bolt).
- Classic flood / first-click safety / flags unchanged. Win by opening every safe cell.
- On win **or** loss: strip digits and flags; keep the same power / no-power colours. Result banner sits outside the grid.

- UA/EN, ☰ Меню, rules overlay, replay. No official logos or live outage data — it's a game.
- Test API: `window.__minesweeper` (`state`, `setMode`, `openAt`, `toggleFlag`, `seed`, `reset`, `QUEUES`).
- Headless checks: `node minesweeper/logic-test.mjs` (needs `playwright-core` + Chrome).
