---
paths:
  - "packages/server/**"
---

# Server rules

- Authoritative. Never accept positions, lap counts, hits or results from a client.
- Validate every client message with its zod schema from `packages/shared/src/net/`.
  - Drop fields the sender's role may not send (a Pilot cannot send throttle).
  - Clamp numeric ranges. Rate-limit per client (inputs ~70/s, head ~25/s, lobby ~5/s).
- The sim runs on a fixed interval with `cfg.sim.dt`. Patch rate comes from `cfg.net.patchRateMs`.
- Persistent state goes in the Colyseus schema. One-off effects (honk, hit, item fired)
  go out as broadcast messages.
- Disconnects: allow reconnection (`cfg.net.reconnectSeconds`). While a partner is gone,
  the remaining player drives solo. On rejoin, restore the original roles.
- Dev-only endpoints (tuning save, hot reload) must be disabled when `NODE_ENV=production`.
- Listen on `0.0.0.0` and print every LAN URL at startup.
- Logging: one line per meaningful event (join, leave, race start/end). Never log per tick.
- League data writes are atomic (write temp file, then rename).
