# Architecture — Escape from Work

## 1. Big picture

```
 Laptop A (Pilot)        Laptop B (Engineer)       Laptops C..P
  browser client          browser client            browser clients
     │  inputs: steer         │  inputs: gas/brake/nitro/fire
     └──────────┐   ┌─────────┘
                ▼   ▼
        Host PC: one Node process  (npm start)
        ├─ Express: serves the built client + assets
        ├─ Colyseus: one "race" room (lobby + race state)
        │    └─ runs the shared sim at 60 Hz, merges each car's inputs by role
        └─ League store: data/league.json
                │
                ▼  state patches ~30/s (+ event messages)
          all clients interpolate and render
```

- **Server-authoritative**: the server runs the only real simulation.
- **Shared package**: the sim, track math, race rules, items, bot driver and message schemas
  are one TypeScript package used by server, client (for interpolation helpers, constants,
  schemas) and tests.
- **LAN only**: no internet needed at runtime.

## 2. Folder structure

```
escape-from-work/
  CLAUDE.md  README.md  package.json (npm workspaces)  tsconfig.base.json
  vitest.config.ts (test projects)  .npmrc (exact versions)  .gitattributes (LF)
  config/
    tuning.json        car, sim, track, bot, heat, drift, nitro, solo, race, net, league, quality
    cars.json          roster: stats, visual spec, horn preset
    items.json         item params + roll weights
    tracks/<id>.json   track data
  assets/
    faces/             coworker faces (bobbleheads) + generated faces.json manifest
    menu/              company images for the menu
  packages/
    shared/src/
      constants.ts     GAME_TITLE, version
      config/          zod schemas + loaders for every config file
      util/            rng.ts (seeded), math, ring buffer
      track/           spline, build (walls, sectors, zones), progress lookup
      sim/             world, car physics, collisions, zones, step, events
      race/            phases, laps, positions, finish, respawn
      items/           one file per item + registry + roll table
      bot/             driver (pilot half + engineer half)
      net/             message schemas, role permissions, input merge
      league/          scoring, awards
    server/src/
      index.ts         entry: CLI flags (--prod, --port), LAN URL print
      app.ts           startServer(): express + colyseus bootstrap, static serving (also used by tests)
      config.ts        reads config/*.json from disk, validates with shared schemas
      lan.ts           LAN address list (skips virtual adapters)
      rooms/RaceRoom.ts
      schema/          Colyseus state classes (mirrors shared world for sync)
      lobby/           teams, seats, host, shuffle, bots
      league/store.ts  atomic JSON store
      dev/             tuning save + hot reload (dev only)
    client/src/
      main.ts          boot, router between screens
      net/             connection, interpolation buffer, latency stats
      input/           keyboard (KeyboardEvent.code), pointer lock
      render/          scene, lights, quality presets, track mesh, cars/ (car kit),
                       props/ (prop kit), effects/
      cameras/         chase, cockpit, spectator, showroom
      ui/              menu, lobby, hud, results, settings, overlays (blue screen…)
      audio/           procedural Web Audio: engine, horns, sfx
      debug/           F3 overlay, F2 tuning panel (dev)
      test-hooks.ts    ?scenario= handling + window.__game
  scripts/             shots.mjs, bots.mjs, track-check.mjs, faces.mjs, verify.mjs
  tests/               integration tests (server + real clients in-process), helpers.ts
  artifacts/           generated (gitignored)
  data/                league data on the host (gitignored)
```

## 3. Approved dependencies

Check the current version with `npm view <pkg> version` before adding, pin it, and read the
installed types for the API. Anything not on this list → ask the human first.

| Package | Where | Why |
|---|---|---|
| typescript, tsx | all | language; run TS on the server without a build step |
| vitest | all | tests |
| zod | shared | config and message validation |
| colyseus as `@colyseus/core` + `@colyseus/ws-transport` + `@colyseus/schema` (D018) | server | rooms, state sync, reconnection |
| Colyseus client SDK: `@colyseus/sdk` | client, scripts | connect to the room |
| express | server | serve the client and dev endpoints |
| three | client | rendering |
| vite | client | dev server and production build |
| lil-gui | client (dev) | live tuning panel |
| concurrently | root (dev) | run server + client together in `npm run dev` |
| playwright-core | scripts (dev) | screenshots using the installed Chrome/Edge, no browser download |
| @fontsource/* (one goofy rounded font, e.g. Fredoka) | client | local font, works offline |

## 4. Simulation

- Fixed timestep `cfg.sim.dt` (1/60 s). `step(world, inputsByCar, cfg, rng)` advances one
  tick and returns events.
- Coordinates: XZ ground plane, Y up. Forward for yaw `a` = `(sin a, 0, cos a)`. Meters,
  seconds, radians.
- **Car state**: position x/z, height y + vertical speed, yaw, velocity x/z, steer (smoothed),
  heat, stalledUntil, nitro, drift (state, level, charge), item, status effects, lap,
  progress, place, respawn info, and counters for awards.
- **Car model (arcade)**: split velocity into forward/sideways parts; engine force from
  throttle (zero while stalled); brake/reverse; drag; sideways grip removes sideways speed
  (less grip while drifting); yaw rate from steer × speed curve. Ramps give vertical speed,
  gravity pulls down, landing emits an event.
- **Collisions**: car vs wall = circle vs segment, push out + reflect with bounce factor;
  car vs car = circles, push apart by weight; car vs pickups/zones = overlap tests. A simple
  uniform grid keeps it fast.
- **Determinism**: seeded RNG, no clock reads, sorted iteration. A replay test records inputs
  and checks the final world hash.

## 5. Tracks

### Track format (`config/tracks/<id>.json`)

```json
{
  "id": "office",
  "name": "The Office",
  "theme": "office",
  "laps": 3,
  "points": [ { "x": 0, "z": 0, "width": 16 }, { "x": 40, "z": 5, "width": 14 } ],
  "sectors": 6,
  "zones": [
    { "type": "ramp",  "from": 0.31, "to": 0.33, "launch": 1.0 },
    { "type": "slick", "from": 0.42, "to": 0.45, "side": "both" },
    { "type": "swap",  "from": 0.80, "to": 0.86, "side": "right", "minLap": 2 },
    { "type": "itemRow", "at": 0.20, "count": 4 }
  ],
  "props": [ { "kit": "desk", "x": 12, "z": 30, "rot": 1.57 } ],
  "start": { "at": 0.0 }
}
```

- `points` form a closed centripetal Catmull-Rom spline (centripetal = no loops or cusps when
  points are unevenly spaced). Zone `from`/`to` and `start.at` are fractions (0–1) of the loop
  length measured from control point 0, so they survive layout edits. A zone may not wrap past
  point 0. Lap progress for the race = that fraction minus `start.at`, wrapped.
- The builder samples the spline every `track.sampleSpacing` m into a centerline table, left/right
  wall segments, sector gates (gate 0 = start line) and spatial grids (`track.gridCellSize`) for
  fast "where am I on the track" and "which walls are near" lookups. `locateOnTrack` takes last
  tick's segment as a hint so a car stays on its own part of the track where it passes close.
- Shortcuts (later tracks) are extra branch splines that rejoin the main loop; progress on a
  branch maps to the main loop.
- `npm run track:check -- <id>` validates schema and geometry (width ≥ `track.minWidth`, no curve
  tighter than half the road width, no crossing walls); bot laps join in P1.4.

## 6. Networking

### Room and timing
- One Colyseus room type `race`. The server auto-creates it at startup; everyone joins it.
- Sim at 60 Hz. State patches every `cfg.net.patchRateMs` (start: 33 ms).
- Clients render about `cfg.net.interpDelayMs` (start: 50 ms) in the past and interpolate
  between snapshots. On a LAN this keeps total input-to-screen delay under ~100 ms.
- Phase 2 measures real latency and the human decides at the fun gate whether to add
  client-side prediction (predict own car using own fresh input + teammate's last input).

### Messages (client → server), all validated with zod

| Message | Fields | Who may send |
|---|---|---|
| `input` | seq, steer (-1/0/1), aimBack | Pilot / Solo |
| `input` | seq, gas, brake, nitro, fire | Engineer / Solo |
| `input` | honk, respawn, mash | anyone in a car |
| `head` | yaw, pitch (about 20/s) | anyone in a car |
| `lobby:*` | setName, joinTeam, setSeat, setTeamName, ready | anyone |
| `host:*` | shuffle, bots, chaos, track, laps, start, kick | host only |

The server keeps only the fields the sender's current role allows. Items like Control Swap
and Lag Spike change the role mapping or add an input delay queue on the server.

### Input merge per car

| Seat state | steer/aim from | gas/brake/nitro/fire from |
|---|---|---|
| Pilot + Engineer | Pilot | Engineer |
| Solo (one player) | that player | that player |
| Control Swap active | Engineer | Pilot |
| Partner disconnected | remaining player becomes solo until rejoin | |
| Bot car | bot driver | bot driver |

### State (synced) vs events (broadcast)
- Synced: race phase, settings, players (name, team, seat, connected, head angles),
  cars (transform, speed, heat, nitro, drift level, item, effects, lap, place), item boxes.
- Events: honk, wall hit, drift level up, boost, item fired/hit, stall, lap, finish, award.

## 7. Configuration and tuning

- `config/*.json` validated by zod at load; invalid data fails `npm run verify`.
- Dev: the server watches `config/` and pushes changes to clients live. The F2 tuning panel
  edits values live and **Save** writes `config/tuning.json` through a dev-only endpoint.
- Tuning table (feeling → keys). The agent keeps this table complete:

| If it feels… | Look at |
|---|---|
| twitchy / too slow steering | `car.steerRiseRate`, `car.steerFallRate`, `car.steerAtTopSpeed`, `car.maxYawRate` |
| can't turn when slow / spins on the spot | `car.steerFullSpeed`, `car.maxYawRate` |
| floaty / too sticky | `car.grip`, `car.driftGrip`, `car.drag` |
| slow / too fast | `car.topSpeed`, `car.accel`, `car.drag`, car `stats.speed` (cars.json) |
| rolls too far / stops too soon off the gas | `car.drag`, `car.rollingResistance` |
| brakes weak / reverse useless | `car.brake`, `car.reverseTopSpeed`, `car.reverseAccel` |
| walls too punishing | `car.wallBounce`, `car.wallSpeedLoss`, `car.radius` |
| slick patch too slippery / not slippery | `car.slickGrip` |
| jumps too floaty / too small | `car.gravity`, `car.rampLaunch`, ramp zone `launch` (track file) |
| too many / too few hit and landing effects | `car.wallHitMinSpeed`, `car.landingMinSpeed` |
| respawn too slow / too punishing | `race.respawnFadeSeconds`, `race.respawnGhostSeconds`, `race.offTrackRespawnDistance` |
| low FPS / blurry | `quality.default`, `quality.presets.*` (budgets used by /shots) |
| a car too strong | car `stats` and `statRange` (cars.json, all stats 0.92–1.08) |
| drifting hard to start | `drift.minSteer`, `drift.minSpeedRatio`, `drift.brakeTapMaxMs` |
| overheating too fast | `heat.risePerSec`, `heat.nitroRisePerSec`, `heat.coolPerSec`, `heat.stallSeconds` |
| laggy | `net.patchRateMs`, `net.interpDelayMs` |
| players lose their seat after a Wi-Fi blip | `net.reconnectSeconds` |
| port already in use | `net.port` |
| sim too coarse / too costly (rarely touch) | `sim.dt` |
| walls look jagged / track lookups slow (rarely touch) | `track.sampleSpacing`, `track.gridCellSize` |
| track:check too strict about narrow roads | `track.minWidth` |
| bots too slow / crash in corners (moves golden lap windows!) | `bot.cornerAccel`, `bot.brakePlanDecel`, `bot.planDistance` |
| bots weave / cut corners | `bot.lookAheadBase`, `bot.lookAheadTime`, `bot.steerGain` |
| bots respawn too eagerly when stuck | `bot.stuckSpeed`, `bot.stuckSeconds` |

## 8. Persistence

- League: `data/league.json` with a `version` field, written atomically (temp file + rename).
  No database server and no native modules, so it installs on Windows without build tools.
- Player name and settings: browser `localStorage` (wrapped in try/catch).

## 9. Test hooks (for agents)

- `?scenario=<name>&seed=<n>` boots straight into a screen or a bot race without the lobby
  (scenario list in `docs/TESTING.md`).
- `window.__game.ready` becomes `true` once the scene has rendered stable frames.
- `window.__game.stats()` returns `{ fps, drawCalls, triangles, geometries, textures, cars,
  tickMs, pingMs }` (`tickMs`/`pingMs` are `null` until measured).
- `window.__game.error` is set when a scenario cannot be shown (e.g. unknown name).

## 10. Running on the LAN

- `npm start` builds the client and starts the server (`--prod`) on `cfg.net.port`
  (default 2567), listening on `0.0.0.0`, printing every reachable LAN URL. `--port <n>`
  overrides the port (0 = any free port; used by `npm run shots`).
- `npm run dev`: server with watch + Vite dev server (port 5173, also on the LAN); the
  client connects to the game server port on the same hostname.
- Windows firewall and troubleshooting go in `docs/LAN.md` (written in Phase 2).
