# Progress

Updated by the agent at the end of every task and by `/handoff`. Keep it under ~60 lines:
roll old "Last sessions" lines into one summary line per finished phase.

## Now
- Phase: P3 — Race loop (`docs/phases/P03-race-loop.md`)
- Next task: P3.8 (phase end)
- Status: P3 gate passed ("all good"). `npm run verify` passes (250 tests + bot race).

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
- 2026-10-05: P3.1 race state machine — shared flow rules (phases, host, laps, seat lock, frozen
  countdown), RaceSim + room host controls, synced phase/host/laps. D050.
- 2026-10-05: P3.2 lobby UI — team names (config/teams.json, editable), Ready, host Shuffle/Bots/
  Laps/Start, `lobby` scenario; join screen removed. Live two-browser check passed. D051.
- 2026-10-05: P3.3 race rules — sector laps, live places, wrong way, finish window + DNF, grid
  order (random, then reversed results), countdown + lap/place HUD. D052.
- 2026-10-05: P3.4 bot cars — server bots fill empty cars up to race.botFillCars when the host turns
  bots on; people take over bot cars; bots-only races allowed. D053.
- 2026-10-05: P3.5 spectators + scoreboard — spectator cam (auto-cycle, A/D), late joiners watch,
  hold-Tab scoreboard with time-split gaps. Live check passed. D054.
- 2026-10-05: P3.6 results screen — places, times, best lap (fastest marked), host Rematch/Lobby;
  live loop lobby → race → results → rematch → results → lobby passed. D055.
- 2026-10-05: P3.7 load test — `npm run test:load`: 8 cars / 16 clients finish 3 laps (109 s), tick avg
  0.40 ms, overruns 2/6370 (GC). D056.

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
