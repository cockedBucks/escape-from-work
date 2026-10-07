# P13 — Smooth online play + the kart fun pass

**Goal:** the human's request of 2026-10-07, after the first real test ("sound alright, fps good
kinda"): (1) a friend saw **lag and stuttering**; (2) "change the drift from S to Space and you do
not have to turn so the car drifts — make it feel like a fun go-kart drift"; (3) "search and
redesign the gameplay and mechanics to make it more fun, so people actually like to play".

Research (kart racer design): the loved mechanics are a hop-drift held on one button with a
mini-turbo that charges in colors, a timed rocket start, slipstreaming behind a rival, a trick
off every jump, and boost pads. Network: Wi-Fi delivers packets in bursts (jitter); a fixed
50 ms interpolation buffer with 33 ms patches runs dry on ~17 ms of jitter, so remote cars
freeze and jump. Fix with an adaptive buffer sized to the measured 95th-percentile jitter.

Roles stay a team: the **Pilot** gets Space (drift on the ground, trick in the air); the
**Engineer** keeps Space for items and owns the rocket start, gas, brake and nitro (drifts and
tricks fill the nitro meter). **Solo**: Space drifts/tricks, **E** uses items.

**Done when**
- Remote cars stay smooth with 40 ms ± 30 ms of simulated Wi-Fi jitter (`npm run jitter -- --lag`).
- Holding Space drifts into the corner without having to turn; releasing gives a mini-turbo.
- Rocket start, slipstream, jump tricks and boost pads work for players and bots, with sound,
  visuals, onboarding text (English + Arabic) and phone pad buttons.
- `/verify`, `/shots`, the reviewer pass, tag `p13-done`.

## Tasks

- [x] **P13.1 Smooth online play.** Adaptive interpolation delay (measured jitter, p95 + margin,
  clamped, eased), short extrapolation when snapshots run late, longer prediction cap, net stats in
  F3, a jitter proxy for `npm run jitter -- --lag 40 --jitter 30` that also measures a bot car.
- [x] **P13.2 Kart drift on Space.** `drift` input (Pilot / Solo), hold to drift: direction from
  your steering or the bend ahead, steering only adjusts tight/wide, auto-follow when no key is
  held, three mini-turbo levels, release = boost + nitro. Visual hop, solo items on E, bots, pad.
- [x] **P13.3 Rocket start.** Engineer (or Solo) presses gas in the last moment before "CLOCK
  OUT!": boost; too early: the engine floods (short sputter). Bots by skill. HUD + sound.
- [x] **P13.4 Slipstream.** Close behind a rival at speed: wind lines charge, then a boost.
- [x] **P13.5 Jump tricks.** Space in the air (Pilot / Solo): the car flips; landing = boost.
- [x] **P13.6 Boost pads.** A `boost` track zone (arrows on the road) on every track; bot laps ok.
- [x] **P13.7 Review and ship.** Reviewer on the phase diff, fixes, docs, `/shots`, tag.
