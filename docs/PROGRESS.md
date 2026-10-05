# Progress

Updated by the agent at the end of every task and by `/handoff`. Keep it under ~60 lines:
roll old "Last sessions" lines into one summary line per finished phase.

## Now
- Phase: P2 — Split control (`docs/phases/P02-split-control.md`)
- Next task: P2.7 (LAN guide)
- Status: P2.6 done. `npm run verify` passes (181 tests + bot race, ~1 min).

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
- 2026-10-04: P2.1 players, cars and seats — shared seat rules, lobby messages, players in state
  (name, slot, seat, role, connected), cars per slot, temporary join screen + `join` scenario. D039.
- 2026-10-04: P2.2 input merge — shared role permission table + `mergeCarInput`, server merges per car
  each tick, role badge (PILOT / ENGINEER / SOLO + keys, flashes on change). D040.
- 2026-10-04: P2.3 multiple cars — starting grid (rows of two behind the line), car-to-car bumps by
  weight (`carHit` event), cars spawn on their slot's grid spot. Golden hash a71bcb87 → 27703279. D041.
- 2026-10-04: P2.4 disconnect and rejoin — seat held `net.reconnectSeconds` on drop (partner solo),
  SDK auto-reconnect + saved token for reopened tabs; integration tests + browser reload smoke. D042.
- 2026-10-04: P2.5 bot clients — `npm run bots` (pilot + engineer bot per car over WebSockets),
  `carStateFromView` adapter, integration lap test; 4 cars lapped in 36.9–37.3 s. D043.
- 2026-10-04: P2.6 latency visibility — `ackSeq` echo, input-delay meter, tick-based snapshot
  timeline, F3 shows snapshot age + input→screen (88 ms on localhost). D044.

## Playtest log
- 2026-10-04 P0 gate "first contact": `npm run dev` page showed the live count on the host.
  Second laptop on office Wi-Fi first got "site can't be reached": Wi-Fi is a Public network
  and Node is only allowed on Private/Domain. Human added the game-ports firewall rule (D030)
  → second laptop loaded `http://192.168.0.105:5173/`: **works**.
- 2026-10-04 P1 gate "drive it": human drove the Test Loop and tried F2 — "all good". They had
  saved topSpeed 30→90, gravity 25→75, radius 1.1→1.27 (topSpeed and gravity at the slider max,
  which nearly removed the jump); asked, they chose to restore the old values (slider experiments).
  Tuning unchanged.
