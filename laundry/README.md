# Стирка (laundry)

Portrait match-3 for *One Day in Kyiv*: laundry items (socks, briefs, T-shirts) match when **colour and type** are the same. Cleared items fill **per-colour** baskets on the right; a full basket goes into the washer and starts the next timed round.

## Rules

- Swap adjacent tiles (swipe or tap-tap). A line matches only if 3+ tiles share both colour **and** item type (2 red socks + 1 red tee does **not** match).
- Matched items still go into that **colour’s** basket (3 red socks + 3 red tees = 6 in the red basket).
- Cascades refill from the top (soft neighbour bias). Boards start without ready matches; reshuffle/redeal if no moves remain.
- Start with **3 colours** (9 tile kinds); a new colour (and basket) is added at rounds 4, 7, 10…
- Round timer starts at 60s and drops 10s every third round. When the next round’s duration would be 0 → **«Світло скінчилось»**.
- Fill at least one basket before the timer hits 0, or → **«Екстрене відключення»**.
- Loading a basket within the first 30s of a round grants `QUICK_WASH_BONUS` (owner note — retune in `logic.mjs`).

Tunable constants live at the top of [`logic.mjs`](./logic.mjs).

## Tuned defaults

| Constant | Value |
|----------|-------|
| Board | 8×8 |
| `START_COLOURS` | 3 (9 kinds) |
| `REFILL_NEIGHBOR_BIAS` | 1.0 |
| `BASKET_CAPACITY_BASE` | 36 → 36 / 27 / 22 / 18 / 15 at 3–7 colours |

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
