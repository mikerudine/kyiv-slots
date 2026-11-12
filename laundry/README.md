# Стирка (laundry)

Portrait match-3 for *One Day in Kyiv*: **socks** match when they share a colour. Cleared socks fill **per-colour** laundry baskets in a strip **below** a full-width 8×8 board; a full basket goes into the washer and starts the next timed round.

Matching still keys on colour **and** item type (`ITEM_TYPES`). Only `'sock'` is dealt today — add `'briefs'` / `'tee'` later without changing the rules.

## Rules

- Swap adjacent tiles (swipe or tap-tap). A line matches only if 3+ tiles share both colour **and** item type.
- Matched items go into that **colour’s** basket.
- Cascades refill from the top (soft neighbour bias). Boards start without ready matches; reshuffle/redeal if no moves remain.
- Start with **4 colours** (4 sock kinds); a new colour (and basket) is added at rounds 4, 7, 10…
- Round timer starts at 60s and drops 10s every third round. When the next round’s duration would be 0 → **«Світло скінчилось»**.
- Fill at least one basket before the timer hits 0, or → **«Екстрене відключення»**.
- Loading a basket within the first 30s of a round grants `QUICK_WASH_BONUS` (owner note — retune in `logic.mjs`).

Tunable constants live at the top of [`logic.mjs`](./logic.mjs).

## Tuned defaults

| Constant | Value |
|----------|-------|
| Board | 8×8 |
| `ITEM_TYPES` | `['sock']` |
| `START_COLOURS` | 4 |
| `REFILL_NEIGHBOR_BIAS` | 0.85 |
| `BASKET_CAPACITY_BASE` | 48 → 48 / 38 / 32 / 27 at 4–7 colours |

## Files

| File | Role |
|------|------|
| `index.html` | Shell, HUD + prominent timer, overlays, safe-area insets |
| `logic.mjs` | Pure rules + capacity helper |
| `game.js` | Canvas UI (board, woven baskets, clear/fall FX) |
| `logic-test.mjs` | Node unit tests + greedy-bot capacity sim |

```bash
node laundry/logic-test.mjs
```

Open [index.html](./index.html) or GitHub Pages `/laundry/`.
