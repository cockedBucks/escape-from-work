---
paths:
  - "packages/shared/**"
---

# Shared simulation rules

- Deterministic: same inputs + same seed = same result on every machine.
  - Fixed timestep from `cfg.sim.dt`. Never read the clock (`Date.now`, `performance.now`).
  - Never use `Math.random`. Use the seeded RNG in `packages/shared/src/util/rng.ts`.
  - When iteration order affects results, iterate in sorted id order.
- Pure and portable: no DOM, no Three.js, no Colyseus, no Node-only APIs in shared.
  Server and client both import it; tests run it headless.
- `step(world, inputs, cfg)` advances one tick. No async, no I/O inside the step.
- Units: meters, seconds, radians. World plane is XZ, Y is up.
  Forward vector for yaw `a` is `(sin a, 0, cos a)`. Keep this everywhere.
- Every gameplay number comes from `cfg` (validated config). Only math constants are literal.
- Every new mechanic gets a unit test. If a feel change is intended, update the golden
  test windows in the same commit and say so in the commit message.
- Game events (wall hit, drift start, item hit, honk) are emitted as plain event objects
  from the step so the server can broadcast them and the league can count them.
