# Dog walk — 3-lane runner

Current mini-game for *One Day in Kyiv* «Прогулянка з собакою».

**Live:** https://mikerudine.github.io/kyiv-slots/dogwalk/

## Mechanic

**Minion Rush-style** 3-lane runner with **pseudo-3D** camera behind/above the player: road converges to a vanishing point, scenery and obstacles scale with depth. Swipe / ←→ to change lane. Player + dog on a leash, seen from behind.

### Bandit → walk

Before the run, spin the **київський однорукий бандит** (same three symbols as the root slot):

| Reel | Effect until first bush (1000 m) |
|---|---|
| 🚨 Тривога | Air-raid push notifications |
| 💡 Світла нема | Blackouts + generators |
| 🌧️ Дощ | Rain weather + puddles |

Dogs/cats always spawn. At **1000 m** the dog dives under the first bush — slot conditions end and **normal mode** unlocks every hazard (alerts, blackouts, rain/snow, puddles, generators).

**Obstacles (full mode)**
- Puddles
- Big angry dogs running toward you
- Cats crossing
- Rattling generators
- Periodic blackouts + flashlight halo
- Air-raid notifications (swipe to dismiss)

Score = distance + dismissed alerts. Lives + gentle speed ramp.

## Tech

Plain canvas (`360×640` logical), CSS full-bleed on mobile, no engines. UA/EN via `localStorage`.

```
dogwalk/
  index.html
  runner.js
  README.md
```

## Archived raycaster

The Wolfenstein-like courtyard prototype was moved to [`/raycaster/`](../raycaster/) (tag `raycaster-v1`) for reuse in other projects. See [`docs/gdd-dogwalk.md`](../docs/gdd-dogwalk.md).


## Balance check

`balance-bot.mjs` — Playwright bot with ~400ms reaction delay. Expectation: survive **>60s** on current tuning (casual first minute).

```bash
# from repo with playwright installed
node dogwalk/balance-bot.mjs
```
