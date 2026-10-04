# Progress

Updated by the agent at the end of every task and by `/handoff`. Keep it under ~60 lines:
roll old "Last sessions" lines into one summary line per finished phase.

## Now
- Phase: P1 — Drive feel (`docs/phases/P01-drive-feel.md`)
- Next task: P1.6 (client rendering)
- Status: P1.5 done. `npm run verify` passes (115 tests + headless bot race).

## Half-done
- (nothing)

## Waiting on the human
- (nothing)

## Environment
- OS: Windows 11 Pro 10.0.22631
- Node v24.19.0, npm 11.17.0, git 2.55.0.windows.5
- Browsers: Chrome 154.0.8037.93, Edge 154.0.4258.53
- Host LAN IP 192.168.0.105 (office Wi-Fi is a Public network; firewall rule D030 opens 2567 + 5173)

## Known issues
- A client could call `create('race')` and make a second room. Lock this down when the
  lobby is built (one lobby per server, D004).
- `RaceRoom.maxClients` is unlimited. Cap it from config (e.g. 16 players) when the lobby is built.
- A busy port prints Colyseus' own EADDRINUSE stack before our friendly message (exit code 1);
  cosmetic, left as is.

## Last sessions
- 2026-10-04: starter kit created (CLAUDE.md, rules, skills, reviewer agent, docs). No code yet.
- 2026-10-04: **P0 done** — env check, git (`main`, LF, GitHub remote, human pushes), npm workspaces
  with strict TS 7 and pinned deps, `config/tuning.json` + zod, Express+Colyseus `race` room with
  live player count page, `npm run verify` (typecheck + tests incl. real-server test),
  `npm run shots`, docs pass, LAN gate passed. Review fixes: busy port no longer hangs, verify
  step timeout. Decisions D015–D030.
- 2026-10-04: P1.1 shared basics — seeded RNG, XZ math helpers, ring buffer; tuning gains `car`, `race` (stub), `quality`; new `config/cars.json` (one Box Car) and track schema. D031.
- 2026-10-04: P1.2 track system — spline sampling, walls, sector gates, grids, `locateOnTrack`/`zonesAt`, `checkTrack`; `config/tracks/test-loop.json` (931 m); `npm run track:check`. D032.
- 2026-10-04: P1.3 car physics v1 — `sim/` (drive, air, walls, car, step): smoothed steer, gas/brake/reverse, drag, grip, slick, ramp jump + landing, wall bounce, ordered checkpoints, respawn (button + off-track). D033.
- 2026-10-04: P1.4 bot driver (pilot look-ahead steer + engineer curve-speed pedals + stuck respawn), `runBotRace`, `hashWorld`, golden lap window + pinned replay hash, bot race in verify and track:check. D034. `/next` now keeps going until a HUMAN GATE (human request).
- 2026-10-04: P1.5 server sim — `race` room runs the sim at 60 Hz (setFixedTimestep), zod `input` + token-bucket rate limit, synced `cars` map + `tick`, `events` broadcast; `RaceSim` unit tests + real-client integration test. D035.

## Playtest log
- 2026-10-04 P0 gate "first contact": `npm run dev` page showed the live count on the host.
  Second laptop on office Wi-Fi first got "site can't be reached": Wi-Fi is a Public network
  and Node is only allowed on Private/Domain. Human added the game-ports firewall rule (D030)
  → second laptop loaded `http://192.168.0.105:5173/`: **works**.
