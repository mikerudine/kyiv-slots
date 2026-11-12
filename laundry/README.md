# Стирка (laundry)

Portrait match-3 for *One Day in Kyiv*: laundry items (socks, briefs, T-shirts) match by **colour**. Matched items fill colour baskets on the right; a full basket goes into the washer and starts the next timed round.

## Rules

- Swap adjacent tiles (swipe or tap-tap). Matching is by colour only; item shape is visual variety.
- Cascades refill from the top. Boards start without ready matches; reshuffle if no moves remain.
- Start with 4 colours; a new colour (and basket) is added at rounds 4, 7, 10…
- Round timer starts at 60s and drops 10s every third round (60→50→40…). When the next round’s duration would be 0 → **«Світло скінчилось»**.
- Fill at least one basket before the timer hits 0, or → **«Екстрене відключення»**.
- Loading a basket within the first 30s of a round grants `QUICK_WASH_BONUS` (owner note: may mean something else — easy to retune in `logic.mjs`).

Tunable constants live at the top of [`logic.mjs`](./logic.mjs).

## Files

| File | Role |
|------|------|
| `index.html` | Shell, HUD, overlays, safe-area insets |
| `logic.mjs` | Pure rules + capacity helper |
| `game.js` | Canvas UI (board left, baskets right) |
| `logic-test.mjs` | Node unit tests + greedy-bot capacity sim |

```bash
node laundry/logic-test.mjs
```

Open [index.html](./index.html) or GitHub Pages `/laundry/`.
