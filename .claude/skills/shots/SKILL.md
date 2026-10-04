---
name: shots
description: Visual check of the game. Captures screenshots and render stats with Playwright, reviews them against the art style and performance budget. Use after any change to rendering, UI, cameras, cars or tracks.
argument-hint: "[scenario ...]"
context: fork
background: false
---

# /shots — look at the game like a player would

Scenarios to capture: `$ARGUMENTS` (if empty, use `chase`).
The scenario list and how the pipeline works are in `docs/TESTING.md` ("Shots").

1. Run `npm run shots -- <scenarios>`. It builds the client, starts a server on a free
   port, opens each `?scenario=` URL, waits for `window.__game.ready`, and writes
   `artifacts/shots/<scenario>.png` plus `artifacts/shots/stats.json`.
   If the script fails because WebGL is unavailable headless, follow the fallback steps in
   `docs/TESTING.md` and report which one worked.
2. Read `artifacts/shots/stats.json`. Compare draw calls, triangles and textures with the
   budget table in `docs/ART_STYLE.md` (read only that table).
3. Open each PNG with the Read tool. Check:
   - not blank, not black, no missing or pink/magenta materials
   - camera framing is right, the car and the road are clearly visible
   - HUD/UI text is readable and not overlapping or cut off
   - colors fit the palette, the look is goofy but clean, no z-fighting or holes
   - anything that looks broken or unfinished
4. Return, max 15 lines:
   - one line per scenario: `PASS` or `FAIL` + the main issue
   - budget: draw calls / triangles vs limits
   - up to 5 concrete fixes, most important first (`file` if you can tell)

Do not edit code. Only report.
