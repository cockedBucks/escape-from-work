# P4 — Cockpit cam and bobbleheads

**Goal:** the "sit in the car and see your friend's dumb face" experience. A cockpit camera
with mouse look, your teammate as a bobblehead whose head turns where they really look,
a dashboard HUD, a rear-view mirror, and a goofy horn.

**Done when**
- C switches chase ↔ cockpit, per player, remembered locally.
- In cockpit, the mouse turns your head (Pointer Lock), and your teammate sees your
  bobblehead turn the same way (synced head angles).
- Faces come from `assets/faces/` via `npm run faces`, with a drawn placeholder fallback.
- Dashboard shows speed, lap/place and placeholders for heat, nitro and item.
- Mirror works on Medium/High and is off on Low. H honks with a per-car horn.
- `/shots cockpit chase` pass and stay in budget.

## Tasks

- [x] **P4.1 Cockpit camera.** Seat position per seat (left Pilot, right Engineer), Pointer Lock
  mouse look with yaw/pitch limits, light head bob on bumps, C toggle, preference saved.
- [ ] **P4.2 Head sync.** `head` message (~20/s, validated, rate-limited) → state → teammates
  interpolate the head angle. Test for validation and clamping.
- [ ] **P4.3 Bobbleheads.** `scripts/faces.mjs` + `npm run faces` builds `assets/faces/faces.json`.
  Players choose their face in the lobby (or a placeholder). Head sphere with the face on the
  front, spring wobble driven by car acceleration. Solo cars show a rubber duck in the empty
  seat.
- [ ] **P4.4 Dashboard HUD.** Speedometer, lap/place, and slots for heat, nitro and item (filled
  in later phases), drawn to a small canvas texture on the dashboard. The chase-cam DOM HUD
  shows the same info.
- [ ] **P4.5 Rear-view mirror.** Low-res render target, rate by quality preset, off on Low.
- [ ] **P4.6 Honk.** H by either player; per-car horn preset from `cars.json`, procedural Web
  Audio; "HONK!" bubble over the car for everyone.
- [ ] **P4.7 Shots.** Scenario `cockpit` (teammate visible). `/shots cockpit chase`.
- [ ] **HUMAN GATE — cockpit fun.**
  1. Put a few face images in `assets/faces/` (only people who agreed), run `npm run faces`.
  2. Two players in one car, both in cockpit cam. Look at each other while driving.
  3. Reply: funny or not? Any motion sickness? Is the dashboard readable? Mirror useful?
- [ ] **P4.8 Phase end.** Reviewer, fixes, `git tag p4-done`, report.
