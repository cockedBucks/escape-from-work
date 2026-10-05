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
    teams.json         default team names (IT puns), one per car slot
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
- Snapshots are placed on a timeline from the server tick (`tick × dt` + the smallest arrival
  offset seen, drifting up 0.5 ms per snapshot), not by arrival time, so network jitter does not
  wobble the cars. Each player's `ackSeq` (last input applied) rides in the state; the F3 overlay
  shows ping, snapshot age and "input → screen" = echo time + `net.interpDelayMs`.
- Client-side prediction (P2.8, the fun gate said "a bit laggy"): your own car is drawn by
  `OwnCarPredictor` (`packages/client/src/net/predictor.ts`): from each server update it runs the
  shared sim ahead by (time since update + measured input echo), at most `net.predictMaxMs`,
  using your keys for your role's controls and the server's applied input (`inSteer`, `inGas`,
  `inBrake`, synced per car with `vx/vz/vy`) for your partner's. Disagreements fade out at
  `net.predictCorrectionRate`. Other cars stay interpolated; bumps are not predicted.
  `net.predictMaxMs = 0` turns it off.

### Messages (client → server), all validated with zod

| Message | Fields | Who may send |
|---|---|---|
| `input` | seq, steer (-1/0/1), aimBack | Pilot / Solo |
| `input` | seq, gas, brake, nitro, fire | Engineer / Solo |
| `input` | honk, respawn, mash | anyone in a car |
| `head` | yaw, pitch (about 20/s) | anyone in a car |
| `lobby:*` | setName, joinTeam, setSeat, leaveSeat, setTeamName, ready | anyone |
| `host:*` | shuffle, bots, chaos, track, laps, start, kick | host only |

Schemas live in `packages/shared/src/net/messages.ts` (`MSG` names the message types). Until P2
every player drives solo and `input` is `{ seq, steer?, gas?, brake?, respawn? }`: missing keys
mean "not pressed", steer is clamped to -1..1, stale `seq` and malformed messages are dropped,
and each client is rate-limited by a token bucket (`net.inputRatePerSec`, `net.inputBurst`).
The room runs the sim with Colyseus `setFixedTimestep` at 1/`sim.dt` Hz, copies cars into the
synced `cars` map after each tick, and broadcasts that tick's `SimEvent[]` as `events`.
Seats (P2.1): `lobby:setName {name}`, `lobby:setSeat {slot, seat}` (seat = pilot | engineer |
solo), `lobby:leaveSeat`; refusals come back as `lobby:error {reason}`. Rules live in
`packages/shared/src/race/seats.ts`: two seats per car or one Solo; a player whose teammate is
missing or disconnected drives solo. A car (id `car<slot>`) exists while someone sits in its
slot. Lobby messages are rate-limited separately (`net.lobbyRatePerSec`, `net.lobbyBurst`);
`maxClients` = 2 × `race.maxCars`.
Spectators and scoreboard (P3.5): anyone not in a car (including late joiners, since seats lock
during a race) gets a spectator cam that follows the leader first, cycles every 8 s, and A/D or
←/→ switch. Hold Tab for the scoreboard (place, team, players, lap, gap). Gaps are time splits:
the race rules store when each car passed each sector; gap = this car's latest sector time minus
the leader's time at the same sector (synced as `gapMs`).
Bot cars (P3.4): with the host's bots switch on, `RaceSim` adds server-driven cars in the lowest
empty slots until there are `race.botFillCars` cars; the bot driver gives both halves of the input.
A person sitting in a bot car takes it over. The switch only changes between races. Cars sync
`bot`; the lobby shows "🤖 bot". A bots-only race is allowed (host watches).
Race rules (P3.3): `packages/shared/src/race/rules.ts` — a `RaceRun` starts at GO; every in-order
checkpoint event is a sector, gate 0 after the others is a lap, the last lap finishes the car.
Places: finishers in order, then sectors done + how far into the next sector (negative behind
the gate, so cars on the grid rank by grid spot). Winner opens `race.finishWindowSeconds`, then
DNF. Grid: random first race, then the last results reversed. Each car syncs lapsDone, place,
finished, dnf, wrongWay, finishMs, bestLapMs; the client HUD (`ui/raceHud.ts`) shows
"3… 2… 1… CLOCK OUT!", lap, place, wrong way and the finish banner.
Lobby (P3.2): `lobby:setTeamName {slot,name}` (team members or host), `lobby:ready {ready}`,
`host:shuffle` (random pairs via `shuffleSeats`, seeded), `host:bots {on}`. State adds `teams[]`,
`bots`, `players.ready`. Client `ui/lobbyScreen.ts`: opens between races, closes on countdown,
Esc hides it to drive around; never redraws under a focused text field.
Race loop (P3.1): `packages/shared/src/race/flow.ts` — phases lobby → countdown → racing → results →
lobby / rematch. The server owns a `RaceFlow` (phase, phaseTick, host, laps) and syncs it. Host =
earliest-joined connected player, passed on automatically. `host:start` (host, between races, ≥1
seated car) puts cars on the grid and starts the countdown, during which controls are ignored
(clients also pause prediction). Seats lock from countdown to results. `host:laps {laps}`,
`host:lobby` (after results). Refusals come back as `lobby:error`. `maxClients` = 2 × maxCars +
`race.maxSpectators`.
Disconnects (P2.4): an unplanned drop (`onDrop`: Wi-Fi blip, closed or reloaded tab) keeps the
seat for `net.reconnectSeconds`; the player shows as away and their partner drives solo. The
SDK reconnects by itself after a blip; a reopened tab reconnects with the token saved in
localStorage on `pagehide`. Back in time = same session, same seat, roles restored; too late =
`onLeave` frees the seat. A deliberate leave frees it at once.
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

Code: `packages/shared/src/net/permissions.ts` (`ROLE_CONTROLS`, `mergeCarInput`). Each tick the
server merges every connected occupant's latest input; a control from a role that may not use
it is ignored (clients may send everything). Respawn: any player in the car.

### State (synced) vs events (broadcast)
- Synced: race phase, settings, players (name, team, seat, connected, head angles),
  cars (transform, speed, heat, nitro, drift level, item, effects, lap, place), item boxes.
- Events: honk, wall hit, drift level up, boost, item fired/hit, stall, lap, finish, award.

## 7. Configuration and tuning

- `config/*.json` validated by zod at load; invalid data fails `npm run verify`.
- Dev: the server watches `config/` (`LiveConfig` in `packages/server/src/liveConfig.ts`) and
  hot-reloads: tuning goes to the sim and to every client (`tuning` message); cars.json updates
  car stats; a track edit rebuilds the track, puts cars on the start line and tells pages to
  reload. A bad edit logs one line and keeps the last good config.
- The F2 panel (lil-gui, dev builds only) is built from the tuning schema (`tuningFields()`:
  every number with its min/max). Edits go live via `POST /dev/tuning {tuning, save:false}`;
  **Save** sends `save:true` (validated, atomic write of `config/tuning.json`); **Revert** is
  `POST /dev/tuning/revert`. Vite proxies `/dev` to the game server. The panel leaves out
  `sim`, `track`, `quality` and `net.port` (they need a restart or a rebuild). These routes
  and the watcher exist only in dev (never with `--prod` / `NODE_ENV=production`).
- Tuning table (feeling → keys). The agent keeps this table complete:

| If it feels… | Look at |
|---|---|
| twitchy / too slow steering | `car.steerRiseRate`, `car.steerFallRate`, `car.steerAtTopSpeed`, `car.maxYawRate` |
| turning feels like a box spinning / like on rails | `car.carve` (higher = follows the nose), `car.grip` |
| pickup fades near top speed / too punchy | `car.accelCurve`, `car.accel` |
| can't turn when slow / spins on the spot | `car.steerFullSpeed`, `car.maxYawRate` |
| floaty / too sticky | `car.grip`, `car.drag` (`car.driftGrip` arrives in P5) |
| slow / too fast | `car.topSpeed`, `car.accel`, `car.drag`, car `stats.speed` (cars.json) |
| rolls too far / stops too soon off the gas | `car.drag`, `car.rollingResistance` |
| brakes weak / reverse useless | `car.brake`, `car.reverseTopSpeed`, `car.reverseAccel` |
| walls too punishing | `car.wallBounce`, `car.wallSpeedLoss`, `car.radius` |
| bumps too soft / too wild between cars | `car.carBounce`, car `stats.weight` (cars.json) |
| too many / too few bump effects | `car.carHitMinSpeed` |
| start grid too tight / too spread | `race.gridRowSpacing`, `race.gridLateral` |
| slick patch too slippery / not slippery | `car.slickGrip` |
| jumps too floaty / too small | `car.gravity`, `car.rampLaunch`, ramp zone `launch` (track file) |
| too many / too few hit and landing effects | `car.wallHitMinSpeed`, `car.landingMinSpeed` |
| room too small / too big | `race.maxCars` (players = 2 × cars; colors exist for 8), `race.maxSpectators` |
| countdown too long / short | `race.countdownSeconds` |
| too few / too many bot cars | `race.botFillCars` (bots fill empty cars up to this many cars) |
| stragglers wait too long / get cut off | `race.finishWindowSeconds` |
| a race nobody finishes ends too soon / late | `race.maxRaceSeconds` (host can also press End race) |
| wrong-way warning too eager / too late | `race.wrongWaySeconds`, `race.wrongWayMinSpeed` |
| races too long / short | `race.defaultLaps`, `race.minLaps`, `race.maxLaps` (host picks in the lobby) |
| name or seat clicks ignored | `net.lobbyRatePerSec`, `net.lobbyBurst` |
| respawn too slow / too punishing | `race.respawnFadeSeconds`, `race.respawnGhostSeconds`, `race.offTrackRespawnDistance` |
| low FPS / blurry | `quality.default`, `quality.presets.*` (budgets used by /shots); try `?quality=low` in the URL |
| chase cam too close / too far / too stiff / floaty | `camera.chaseDistance`, `camera.chaseHeight`, `camera.followRate` |
| chase cam looks at the wrong spot / feels slow | `camera.lookAhead`, `camera.lookHeight`, `camera.fov` |
| cockpit too narrow / wide, mouse look too fast / slow | `camera.cockpitFov`, `camera.mouseSensitivity` |
| can turn your head too far / not far enough, head snaps back | `camera.headYawLimit`, `camera.headPitchLimit`, `camera.headRecenterRate` |
| cockpit too shaky / too stiff on bumps (motion sickness!) | `camera.headBob` (0 = off), `camera.headBobStiffness` |
| a car too strong | car `stats` and `statRange` (cars.json, all stats 0.92–1.08) |
| drifting hard to start (P5) | `drift.minSteer`, `drift.minSpeedRatio`, `drift.brakeTapMaxMs` |
| overheating too fast (P5) | `heat.risePerSec`, `heat.nitroRisePerSec`, `heat.coolPerSec`, `heat.stallSeconds` |
| laggy | `net.patchRateMs`, `net.interpDelayMs`, `net.predictMaxMs` (0 = prediction off, to compare) |
| own car shimmers / snaps after bumps | `net.predictCorrectionRate` (lower = softer corrections) |
| players lose their seat after a Wi-Fi blip | `net.reconnectSeconds` |
| controls ignored when mashing keys | `net.inputRatePerSec`, `net.inputBurst` |
| a key seems stuck after a network hiccup | `net.inputResendMs` |
| port already in use | `net.port` |
| sim too coarse / too costly (rarely touch) | `sim.dt` |
| walls look jagged / track lookups slow (rarely touch) | `track.sampleSpacing`, `track.gridCellSize` |
| track:check too strict about narrow roads | `track.minWidth` |
| bots too slow / crash in corners (moves golden lap windows!) | `bot.cornerAccel`, `bot.brakePlanDecel`, `bot.planDistance`, `bot.speedMargin` |
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
- Windows firewall and troubleshooting: `docs/LAN.md`.
