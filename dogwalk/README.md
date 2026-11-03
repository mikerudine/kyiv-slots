# Dog walk — 3-lane runner

Current mini-game for *One Day in Kyiv* «Прогулянка з собакою».

**Live:** https://mikerudine.github.io/kyiv-slots/dogwalk/

## Mechanic

**Minion Rush-style** 3-lane runner with **pseudo-3D** camera behind/above the player: road converges to a vanishing point, scenery and obstacles scale with depth. Swipe / ←→ to change lane. Player + dog on a leash, seen from behind.

**Obstacles**
- Puddles
- Big angry dogs running toward you

**Air-raid notifications** (the signature bit): fake phone pushes in Ukrainian (EN toggle) slide in, **do not auto-dismiss**, stack and obscure the view until swiped/clicked away. Spawn rate rises with distance; too many on screen eventually drain lives.

Score = distance + dismissed alerts. 3 lives. Speed ramps up.

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
