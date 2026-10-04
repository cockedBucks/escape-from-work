---
name: add-item
description: Add or change a chaos-mode item (effect logic, roll weights, visuals, sound) with tests. Use when asked to add, change or rebalance an item.
argument-hint: "<item idea>"
---

# /add-item

Item idea: `$ARGUMENTS`

1. Read the "Items" section of `docs/GAME_DESIGN.md` and `config/items.json`.
2. Define it on paper first: id, name (IT joke), who fires it (Engineer; Pilot aims with Q),
   target rule (self / car ahead / leader / projectile / dropped), duration, what blocks it
   (Firewall?), and roll weights for the front / mid / back position buckets.
   Each bucket's weights must still sum to 100.
3. Logic: one file `packages/shared/src/items/<id>.ts` implementing the item interface,
   registered in `packages/shared/src/items/index.ts`. All numbers from `config/items.json`.
4. Client: effect visuals, HUD icon (drawn in code or CSS, no emoji fonts), and a procedural
   sound. Target-screen effects (like Blue Screen) apply to BOTH players of the target car.
5. Tests: effect on world state, Firewall interaction, expiry, and roll-table sums and
   rubber-band ordering (back bucket gets the strongest items).
6. `/verify`, then `/shots items`.
7. Update the items table in `docs/GAME_DESIGN.md`. Commit `content: add item <id>`.
