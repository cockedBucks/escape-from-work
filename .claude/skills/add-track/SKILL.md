---
name: add-track
description: Create or change a race track (layout data, zones, props) and prove it is drivable with bot laps. Use when asked to add, change or fix a track.
argument-hint: "<track idea or id>"
---

# /add-track

Track: `$ARGUMENTS`

1. Read "Tracks" in `docs/GAME_DESIGN.md`, "Track format" in `docs/ARCHITECTURE.md`, and one
   existing file in `config/tracks/` as a template.
2. Sketch the layout as a closed loop of control points (clockwise), with a width per point.
   Targets: width 12–18 m (wider at the start grid), lap 40–55 s for the median car,
   at least one long straight, one hairpin, one fast sweeper, one jump.
3. Add zones along the track: ramps, slicks, swap lane (lap 2+), 2 boost pads on straights
   (one `both`, one on a half = a choice of line; P13.6), 2–3 item-box rows,
   theme hazards. Add props from the prop kit (instanced where repeated).
4. Validate: `npm run track:check -- <id>` (no self-intersection, min width and turn radius,
   start grid fits 8 cars, bots finish 3 laps inside the lap-time target, no stuck spots).
5. `/shots track-overview chase` on the new track. Fix real issues.
6. Add the track to the track list in `docs/GAME_DESIGN.md`. Commit `content: add track <id>`.
