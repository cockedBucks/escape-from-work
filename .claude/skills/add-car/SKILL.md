---
name: add-car
description: Add or redesign a goofy car in the roster (stats, procedural model, horn), keeping races balanced. Use when asked to add, change or rebalance a car.
argument-hint: "<car idea>"
---

# /add-car

Car idea: `$ARGUMENTS`

1. Read the "Car roster" and "Car kit" sections of `docs/ART_STYLE.md` and `config/cars.json`.
2. Design it:
   - a goofy version of a real car TYPE, original design, no brand names or logos
   - ONE exaggerated signature feature that reads from behind and from above
   - body panels take the team color; trim, glass and tires use the shared palette
   - a pun name that fits the office/IT theme
3. Add the entry to `config/cars.json`: `id`, `name`, `stats` (speed, grip, weight),
   `visual` (body preset, proportions, parts), `horn` preset. Stats must stay inside the
   balance limits in `docs/GAME_DESIGN.md` ("Cars").
4. New visual parts → add a builder to the client car kit (`packages/client/src/render/cars/`).
   Stay inside the per-car budget in `docs/ART_STYLE.md` (meshes merged per material).
5. Tests: schema test passes, and the roster balance test (bot lap times within the allowed
   spread of the roster median) passes on the test track.
6. `/shots garage chase`. Fix real issues.
7. Update the roster table in `docs/ART_STYLE.md`. Commit `content: add car <id>`.
