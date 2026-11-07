# Графік світла (minesweeper)

Outage-schedule Minesweeper for *One Day in Kyiv*. The board looks like a weekly power timetable: 12 hour rows × 14 columns (7 weekdays × 00–12 / 12–24).

- Open a lit cell to see how many darkness neighbours it has (8-adjacent, no wrap).
- Zero floods open the safe area.
- Grey cells with a crossed lightning bolt are darkness — opening one loses.
- First click is always safe. Flag with long-press, right-click, or the Flag button.
- Win by opening every lit cell. 18 darkness cells (~beginner density).
- UA/EN, ☰ Меню, rules overlay, replay. No official logos or live outage data — it's a game.
- Test API: `window.__minesweeper` (`state`, `openAt`, `toggleFlag`, `seed`, `reset`).
- Headless checks: `node minesweeper/logic-test.mjs` (needs `playwright-core` + Chrome).
