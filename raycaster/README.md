# Raycaster courtyard — archived tech spike

**Status:** archived for reuse in other projects.  
**Not** the current dog-walk mini-game for *One Day in Kyiv* (that is now a 3-lane runner under [`/dogwalk/`](../dogwalk/)).

**Live:** https://mikerudine.github.io/kyiv-slots/raycaster/  
**Tag:** `raycaster-v1` (commit that introduced the spike)

## What this is

Playable pixel Wolfenstein-3D-style **DDA raycaster** in plain HTML5 canvas (no engines): 320×200 buffer, procedural khrushchevka / garage / hedge textures, floor–ceiling fog, billboard dog + props, WASD + touch stick, UA/EN HUD.

Kept here so the rendering approach can be lifted into another game without digging through history.

## Architecture

```
raycaster/
  index.html
  raycaster.js
  README.md
```

See git history / tag `raycaster-v1` for the original dog-walk framing. Gameplay direction for One Day in Kyiv moved to a Minions-style 3-lane runner (notifications + puddles + angry dogs).

## Perf (historical)

Headless Chromium ~60 fps on the 320×200 buffer. Viable as a look; superseded for this product by a simpler mechanic.
