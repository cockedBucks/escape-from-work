# Progress

Updated by the agent at the end of every task and by `/handoff`. Keep it under ~60 lines:
roll old "Last sessions" lines into one summary line per finished phase.

## Now
- Phase: P5 — Teamwork mechanics (`docs/phases/P05-teamwork.md`)
- Next task: P5.5 Bot skills + balance
- Status: P5.4 done. `npm run verify` passes (334 tests + bot race, best lap 37.25 s).
  Shots: cockpit 39 / chase 12 / overview 35 / stall / drift / nitro 13 draw calls.

## Half-done
- (nothing)

## Waiting on the human
- Later: try the FUN GATE step 3 (close the tab mid-lap and reopen it) — not tested yet.

## Environment
- OS: Windows 11 Pro 10.0.22631
- Node v24.19.0, npm 11.17.0, git 2.55.0.windows.5
- Browsers: Chrome 154.0.8037.93, Edge 154.0.4258.53
- Host LAN IP changes daily (192.168.0.105 on 10-04, 192.168.119.113 on 10-05); office Wi-Fi is a
  Public network; firewall rule D030 opens 2567 + 5173. See docs/LAN.md.

## Known issues
- Load test (server + 17 clients in one process): average tick 0.40 ms, but rare GC pauses make 1–2
  ticks per race overrun (max seen 24 ms). Measure the standalone server under `npm run bots` in
  the P7 performance pass.
- In dev, anyone on the LAN can use the F2 `/dev/tuning` endpoint (via Vite). Accepted for
  playtests; it never exists with `npm start`.
- A client could call `create('race')` and make a second room. Lock this down when the
  lobby is built (one lobby per server, D004).
- A busy port prints Colyseus' own EADDRINUSE stack before our friendly message (exit code 1);
  cosmetic, left as is.

## Last sessions
- 2026-10-04: starter kit created (CLAUDE.md, rules, skills, reviewer agent, docs). No code yet.
- 2026-10-04: **P0 done** — env check, git (`main`, LF, GitHub remote, human pushes), npm workspaces
  with strict TS 7 and pinned deps, `config/tuning.json` + zod, Express+Colyseus `race` room with
  live player count page, `npm run verify` (typecheck + tests incl. real-server test),
  `npm run shots`, docs pass, LAN gate passed. Review fixes: busy port no longer hangs, verify
  step timeout. Decisions D015–D030.
- 2026-10-04: **P1 done** — shared RNG/math/ring buffer, full config schemas (car, sim, track,
  bot, race, net, camera, quality; cars.json; track format), track system + `track:check`, car
  physics v1 (steer, gas/brake/reverse, grip, slick, ramp, walls, checkpoints, respawn), bot
  driver + golden lap/replay tests + bot race in verify, 60 Hz server sim with validated input,
  greybox client (track, box car, chase cam, interpolation, F3), live tuning (F2 panel, Save,
  config hot reload). Gate "drive it": all good. Review fixes D038. Decisions D031–D038.
- 2026-10-05: **P2 done** — seats (Pilot/Engineer/Solo) + temporary join screen, role-filtered
  input merge, multiple cars with grid + bumps, disconnect/rejoin (seat held, partner solo),
  networked bot clients (`npm run bots`), latency overlay (input → screen), docs/LAN.md, FUN GATE
  ("a bit laggy, fun, physics weird") → physics feel pass + client prediction. Review fixes D049
  (critical: reconnect controls). Decisions D039–D049.
- 2026-10-05: **P3 done** — race state machine (lobby/countdown/racing/results, host handover, seat
  lock), lobby UI (teams, Ready, Shuffle, Bots, Laps, Start), race rules (sector laps, places, wrong
  way, finish window/DNF, time limit, reversed grid, time-split gaps), server bot cars, spectator cam
  + Tab scoreboard, results + rematch, host End race, load test (`npm run test:load`). Gate: all
  good. Decisions D050–D057.
- 2026-10-05: **P4 done** — cockpit cam (seat by role, Pointer Lock look, head bob, C toggle), head
  sync, bobbleheads (`npm run faces`, any-language file names, per-photo eyes/chin framing, face
  picker, duck in solo cars), dashboard screen + chase gauges, rear-view mirror, honk (sim event,
  procedural horns, HONK! bubble). Gate: all good. Review fixes D066. Decisions D058–D066.

- 2026-10-05: P5.1 engine heat — shared heat model (rise at full gas when fast, cool off gas, stall
  2 s, restart at 60%), synced heat/stall, bot lifts at 90%, HUD/dashboard heat bar + STALL!, smoke,
  stall/restart sounds, `stall` scenario. Golden laps +2 s (intended). D067.

- 2026-10-05: P5.2 tandem drift — brake tap + hard steer at speed starts a drift (Engineer +
  Pilot, or solo), wider slide, 3 levels (dust → blue/orange/pink sparks, dings), release on the
  gas = boost + nitro; synced + predicted; `drift` scenario. Bots never drift yet (P5.5). D068.

- 2026-10-05: P5.3 nitro — Shift (Engineer/solo) burns the drift-filled meter: push to 1.35× top
  speed, +30%/s heat, big flames, roar; synced + predicted; `nitro` scenario. D069.

- 2026-10-05: P5.4 swap lane — sim counts laps; entering an open `swap` zone (lap ≥ minLap, once
  per lap) cools the engine fully and the server swaps Pilot/Engineer; lane is slower
  (`car.swapLaneSpeed` 0.8); striped lane on the Test Loop's last straight; SWAP! flash with your
  new keys; role texts in one place (`ui/roleKeys.ts`, keys now list drift/nitro/honk); solo
  handicap `solo.speedMultiplier` (default 1). D070.

## Playtest log
- 2026-10-04 P0 gate "first contact": `npm run dev` page showed the live count on the host.
  Second laptop on office Wi-Fi first got "site can't be reached": Wi-Fi is a Public network
  and Node is only allowed on Private/Domain. Human added the game-ports firewall rule (D030)
  → second laptop loaded `http://192.168.0.105:5173/`: **works**.
- 2026-10-04 P1 gate "drive it": human drove the Test Loop and tried F2 — "all good". They had
  saved topSpeed 30→90, gravity 25→75, radius 1.1→1.27 (topSpeed and gravity at the slider max,
  which nearly removed the jump); asked, they chose to restore the old values (slider experiments).
  Tuning unchanged.
- 2026-10-05 P2 FUN GATE: first try found a join-screen bug (seat buttons jittered and ignored
  clicks; fixed, D045). Then: steering "a little bit laggy"; "it is fun" but physics "feels
  weird": turning feels like a box spinning, steering twitchy/slow, speed feels wrong. Tab
  close/reopen not tried yet. F3 number not reported. → P2.8: prediction + physics feel pass.
- 2026-10-05 P3 gate "first real race": "all good" — no confusion or breakage reported.
- 2026-10-05 P4 gate "cockpit fun": `npm run faces` rejected Arabic file names (fixed, D064, with
  the lost face-picker styles and an empty-lobby backdrop); then "all good, but the faces are not at
  the same height" → per-photo eyes/chin framing (D065).
