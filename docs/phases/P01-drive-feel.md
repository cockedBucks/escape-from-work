# P1 — Drive feel

**Goal:** one car on a greybox track, driven through the real server, that feels good.
Driving feel is the foundation of everything else, so it gets its own phase.

**Done when**
- A solo player drives the Test Loop through the server with the chase cam.
- Smoothed steering, gas/brake/reverse, walls that bounce, one jump, one slick, respawn.
- The F2 tuning panel changes the feel live and Save writes `config/tuning.json`.
- The bot driver laps the Test Loop; golden lap and replay tests pass.
- `/shots chase track-overview` pass and stay inside the performance budget.

## Tasks

- [x] **P1.1 Shared basics.** Seeded RNG, small vector/math helpers, ring buffer. Full config
  schemas: `tuning.json` sections `car`, `sim`, `race` (stub), `quality`; `cars.json` with one
  placeholder car; track schema. Tests.
- [x] **P1.2 Track system.** Closed Catmull-Rom spline, sampling, widths, wall segments,
  sectors, zones (ramp, slick), spatial grid and progress lookup. `config/tracks/test-loop.json`
  (kidney loop, hairpin, ramp, slick). `scripts/track-check.mjs` + `npm run track:check`.
  Tests for progress lookup and wall building.
- [x] **P1.3 Car physics v1.** Throttle, brake, reverse, drag, smoothed steering with speed
  curve, sideways grip, walls (bounce + speed loss), car height for ramps and landing, slick
  zones, respawn to last checkpoint. Events for wall hits and landings. Tests per behavior.
- [x] **P1.4 Bot driver + golden tests.** Look-ahead steering and curve-based speed, split into
  pilot half and engineer half. Golden lap window on the Test Loop, replay determinism hash.
  Add the short headless bot race (1 track, 2 cars, 1 lap) to `scripts/verify.mjs` (slot
  marked there; replace the "bot race n/a" summary text).
- [x] **P1.5 Server sim.** The `race` room runs the sim at 60 Hz for solo players; `input`
  message with zod validation and rate limit; patch rate from config. Integration test:
  a client holding gas moves forward.
- [x] **P1.6 Client rendering.** Scene, lights, quality presets; track mesh from data (road
  ribbon, curbs, walls, ground); placeholder box car; chase cam with spring smoothing;
  snapshot interpolation; keyboard input (physical keys); F3 debug overlay (fps, ping, draw
  calls, triangles, tick ms). Scenarios `chase` and `track-overview`. `/shots chase track-overview`.
- [x] **P1.7 Live tuning.** Server watches `config/` and hot-reloads; F2 lil-gui panel bound to
  `tuning.json`; Save via the dev-only endpoint. Fill the tuning table in `docs/ARCHITECTURE.md`.
- [x] **HUMAN GATE — drive it.**
  1. `npm run dev`, open the URL, drive with W/A/S/D. Press F2 for the tuning panel.
  2. Drive 5 laps. Try the jump, the slick patch, hitting walls, R to respawn.
  3. Tune anything you want live and press Save, or tell the agent with
     `/feedback steering too twitchy, car too slow…`.
  4. Reply: how it feels in a few words (and anything that annoyed you).
- [ ] **P1.8 Phase end.** `/shots chase track-overview`, reviewer, fixes, `git tag p1-done`, report.
