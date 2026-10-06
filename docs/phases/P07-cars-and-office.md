# P7 — Cars and The Office

**Goal:** make it look and sound like a real game: the 8-car goofy roster, the first real
track (The Office), juice, procedural audio, and a performance pass on real hardware.

**Done when**
- All 8 roster cars from `docs/ART_STYLE.md` exist, look distinct, and pass the balance test.
- The Office track matches `docs/GAME_DESIGN.md`, passes `track:check`, and bots lap it.
- Juice and audio from `docs/ART_STYLE.md` section 6 are in.
- Quality presets keep every scenario inside the budget table.
- `/shots garage chase cockpit track-overview` pass.

## Tasks

- [x] **P7.1 Car kit.** Body presets, parts library, team paint, roof number decal, wheels that
  spin and steer, bobblehead mounts, merging per material. `garage` scenario.
  `/add-car` is usable from here.
- [x] **P7.2 Roster.** The 8 cars in `config/cars.json` per the roster table (use `/add-car` per
  car or in batches). Each has its horn preset.
- [x] **P7.2b Car picker.** Each team picks its car in the lobby (human decision 2026-10-06):
  synced per car slot, server uses that car's stats and horn, prediction uses its stats, bots
  pick one too. Tests.
- [x] **P7.3 Balance.** Roster balance test on Test Loop and The Office: every car within ±3% of
  the median lap time. Tune stats to pass.
- [x] **P7.4 Prop kit (office).** All office props from the art style list, instanced where
  repeated.
- [x] **P7.5 The Office track.** Layout, zones, swap lane, item rows, server-closet shortcut
  (branch spline), props. Use `/add-track`. `npm run track:check -- office`.
  Add the 40–55 s lap-target check to `track:check` (human chose a `dev` flag that exempts
  the Test Loop; D091).
- [x] **P7.6 Juice.** Dust, spark levels, nitro flames, stall smoke, landing squash, hit shake,
  finish confetti, head wobble, honk bubble polish.
- [x] **P7.7 Procedural audio.** Engine synth per car (pitch by speed, timbre per car), skids,
  bumps, landings, item sounds, countdown beeps, a light menu loop. Volume settings.
- [x] **P7.8 Performance pass.** Shots stats at Low and High for chase, cockpit and overview on
  The Office; fix anything over budget.
- [~] **HUMAN GATE — looks, sound, real FPS.** (deferred)
  1. On a normal work laptop: race The Office with F3 open, on Medium.
  2. Reply: the FPS you saw (min and typical), your favorite and least favorite car,
     anything ugly or confusing on the track, too loud/quiet sounds.
- [ ] **P7.9 Phase end.** Reviewer, fixes, `git tag p7-done`, report.
