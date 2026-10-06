# P6 — Chaos items

**Goal:** item boxes and all 8 IT-joke items from `docs/GAME_DESIGN.md` section 7, with
rubber-banding that keeps races close, and a host toggle to turn chaos off.

**Done when**
- Item boxes spawn in rows, respawn, and give one item per car using position-based weights.
- All 8 items work as designed, including effects on BOTH screens of a target car.
- Firewall blocks what it should. Ctrl+Z rewinds correctly.
- Each item has visuals, a HUD icon and a sound. Chaos toggle works in the lobby.
- Tests cover every item and the roll table. `/shots items` pass.

## Tasks

- [x] **P6.1 Item system.** `config/items.json`, item interface + registry, item boxes (rows from
  track zones, respawn), pickup, one-item slot, roll table by position bucket. Tests (sums,
  ordering). Uses the `/add-item` skill steps from here on.
- [x] **P6.2 Projectile and defensive items.** Reply-All (bouncing projectile, Q aims back,
  spin-out on hit), Firewall, Coffee Spill. Tests.
- [x] **P6.3 Ctrl+Z.** 3-second per-car history ring buffer on the server, rewind and effect
  clearing. Tests.
- [x] **P6.4 Screen and control items.** Blue Screen (overlay on both target clients), Lag Spike
  (server input delay queue), Control Swap (role mapping swap), Forced Update (stop + mash
  progress). Tests.
- [x] **P6.5 Item presentation.** Effects, hit reactions, HUD and dashboard icon, procedural
  sounds, "you got hit by X" toast for both players. Scenario `items`. `/shots items`.
- [ ] **P6.6 Chaos toggle + bots.** Host toggle; bot engineer half uses items sensibly.
- [ ] **HUMAN GATE — chaos race.**
  1. Race with chaos on, 3+ cars (bots allowed).
  2. Reply: which items are the most fun, which are annoying or unclear, is anything too strong?
     Use `/feedback` for weights and durations.
- [ ] **P6.7 Phase end.** Reviewer, fixes, `git tag p6-done`, report.
