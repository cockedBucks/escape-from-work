# P5 — Teamwork mechanics

**Goal:** the duo loop from `docs/GAME_DESIGN.md` section 5: engine heat, tandem drift,
nitro and the swap lane. Teams that talk should clearly beat teams that do not.

**Done when**
- Heat rises and cools as designed; at 100% the engine stalls; visible on HUD and dashboard.
- Tandem drift needs both players (or solo), has 3 spark levels, boosts and charges nitro.
- Nitro (Shift, Engineer) gives speed and heat. The swap lane swaps roles and cools fully.
- A balance test shows a drifting, nitro-using bot team beats a plain bot team by a
  configured margin, without being overpowered.
- Lobby shows a short how-to-play card per role.

## Tasks

- [x] **P5.1 Engine heat.** Heat model, stall and restart, smoke and sad engine sound, gauges.
  All numbers in `tuning.json` (`heat.*`). Tests.
- [x] **P5.2 Tandem drift.** Brake-tap detection, entry conditions, drift handling, 3 charge
  levels with spark colors, boost on release, nitro charge, events. Tests, including solo.
- [x] **P5.3 Nitro.** Meter, Shift burn, speed boost, extra heat, flames. Tests.
- [x] **P5.4 Swap lane.** `swap` zone (lap 2+): swaps seats, resets heat, HUD flash with the new
  role's keys. Solo handicap option (`solo.speedMultiplier`). Tests.
- [x] **P5.5 Bot skills + balance.** Engineer bot half learns to drift, use nitro and manage heat
  (with a skill level). Balance test: skilled vs plain bot team lap-time gain inside the
  configured range. Update golden windows if needed (and say why).
- [x] **P5.6 How-to-play cards.** One short card per role in the lobby, with the keys.
- [x] **P5.6a Gate fixes: drift + heat.** From the first duo test (2026-10-06): drifts end too
  soon (release grace, longer brake hold), heat only from nitro overuse (normal driving cools).
- [x] **P5.6b Gate fixes: stutter.** Measure the drawn own-car motion per frame in a real
  browser; find and fix jumps (prediction corrections, timeline, camera).
- [ ] **P5.6c Gate fixes: sense of speed.** Engine hum (pitch follows speed), tire squeal while
  drifting, speed FOV, speed lines, roadside markers so speed is visible.
- [ ] **HUMAN GATE — duo mechanics.**
  1. Race as a duo. Try to chain drifts into nitro without overheating. Use the swap lane once.
  2. Reply: is drifting understandable? Does heat create good tension or just annoy?
     Is the swap lane worth taking? Use `/feedback` for tuning.
- [ ] **P5.7 Phase end.** Reviewer, fixes, `git tag p5-done`, report.
