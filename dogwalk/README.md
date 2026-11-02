# Dog walk raycaster — tech spike

Playable prototype for the **«Прогулянка з собакою»** mini-game in *One Day in Kyiv*.

**Live:** https://mikerudine.github.io/kyiv-slots/dogwalk/

## Goal of the spike

Prove that a pixel Wolfenstein-3D-style raycaster in plain HTML5 canvas (no engines, no WebGL) can:

- Feel like a Kyiv khrushchevka courtyard
- Run at ~60 fps on a mid-range phone
- Support dog-follow + billboard props
- Stay small enough to ship as one of seven day mini-games

## Architecture

```
dogwalk/
  index.html     # shell, HUD, virtual stick / turn buttons, UA↔EN toggle
  raycaster.js   # map, textures, DDA walls, floor/ceiling, sprites, input, loop
  README.md
```

Internal framebuffer is **320×200**, blitted with `putImageData`, then CSS-upscaled with `image-rendering: pixelated`.

| Piece | Approach |
|---|---|
| Walls | Classic DDA per column; tile id → procedural 64×64 texture (brick / garage / hedge) |
| Floor & ceiling | Per-row affine mapping; asphalt tint + overcast sky gradient |
| Fog | Distance blend toward cool gray-blue on walls, floor, ceiling, sprites |
| Sprites | Camera-space billboards, far→near sort, z-buffer test vs wall depth |
| Dog | Billboard that steers toward the player when farther than ~1.35 cells |
| Props | Bench ×2, киоск, puddles (alpha blend) |
| Input | WASD + arrows; left virtual stick; right turn buttons (pointer events) |
| i18n | `localStorage` lang flag; HUD strings UA / EN |

No deps. One script tag. Fits GitHub Pages next to the existing root slot machine (untouched).

## Perf notes

Target: **60 fps** on a mid Android/iPhone at full CSS size of the 320×200 buffer.

Cost drivers (worst first):

1. Floor/ceiling fill — `W×H` pixel writes every frame (~64k)
2. Wall texturing — `W` rays × column height
3. Sprites — few (≤6), cheap if overdraw stays low

Mitigations already in the spike:

- Low internal resolution (320×200)
- Integer tex coords, no bilinear
- Cap of 64 DDA steps
- Soft dt clamp (max 50 ms) so a hitch doesn’t explode physics

### Headless measurement

Measured with Chromium (Playwright) loading `file://…/dogwalk/index.html`, sampling `window.__dogwalk.getFps()` after a few seconds of idle rendering (no input):

| Environment | Avg fps | Notes |
|---|---|---|
| Box Chromium headless (SwiftShader) | **~60–61 avg** (samples 60–64) | Idle + brief WASD; no JS errors |

Phones will be lower; if a mid device stays ≥45–50 fps while walking, the approach is viable. If not, first knobs: drop to 256×160, skip floor every other row, or cut fog math.

## Viability recommendation

**Yes — ship this approach for the dog-walk mini-game.**

Reasons:

- Look is already “Kyiv courtyard” readable (brick, garage doors, hedges, киоск, puddles, dog)
- Code size is tiny (~20 KB JS), easy to embed in the day structure
- Controls work on desktop and touch without extra libraries
- UA/EN is trivial to extend to the rest of the day

Next steps (not in this spike): condition state machine (leash / peе / neighbor / alarm), collision with dog goals, better art (hand pixels or atlas), audio bed, and a thin “scene” API so the day shell can start/stop the walk.

## Open questions for Misha

1. Is the courtyard **free roam** or a short scripted loop with checkpoints?
2. Dog breed / color / name for the final sprite?
3. Should rain / alarm / blackout from the slot machine **tint** this scene when those events are “on” for the day?
4. Win / fail conditions for the walk (bags collected? time limit? don’t lose the dog)?
5. Keep pure canvas 2D, or OK to add a tiny WebGL column renderer later if phones struggle?

## Controls

| Input | Action |
|---|---|
| W / ↑ or stick up | Forward |
| S / ↓ or stick down | Back |
| A/D or stick X | Strafe |
| ← → or ◀ ▶ buttons | Turn |
| UA / EN button | Language |
