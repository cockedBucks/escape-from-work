# Progress

Updated by the agent at the end of every task and by `/handoff`. Keep it under ~60 lines:
roll old "Last sessions" lines into one summary line per finished phase.

## Now
- Phase: P7 — Cars and The Office (`docs/phases/P07-cars-and-office.md`)
- Next task: P7.6 Juice
- Status: P7.5 done. `npm run verify` passes (421 tests + bot race, best lap 35.52 s).
  The Office is the default race track (`track:check -- office` OK: plain bots 42–43 s, skilled 39 s).
  Shots: track-overview-office 50 draw calls, chase-office 22 (software GL in the cloud).

## Half-done
- (nothing)

## Deferred human tests (run all after the last phase; human's request 2026-10-06)
- P2 FUN GATE step 3: close a tab mid-lap and reopen it (reconnect keeps your seat).
- P5 duo mechanics (re-test after P5.6a–c): duo race, chain drifts into nitro without
  overheating, swap lane once from lap 2. Ask: drifting understandable/fun? heat (nitro only)
  better? any stutter left (`npm run jitter`)? feels fast now?
- P6 chaos race: race with chaos on, 3+ cars (bots allowed). Ask: most fun items? annoying or
  unclear ones? anything too strong? (weights/durations in config/items.json)

## Cloud session (read me first, local Claude)
- 2026-10-06: local Claude Code hit its usage limit after P7.4. Work continues in a claude.ai cloud
  session (Linux container, Node 22, no GPU, no speakers, no LAN) on the session's branch, now
  `claude/keen-edison-iupozz` (it contains `cloud-work`, D093), pushed after each task (never `main`; D090).
- **When back local:** `git fetch origin`, review `main..origin/claude/keen-edison-iupozz`
  (diff + `npm run verify` on Windows + `npm run shots`), then merge it into `main` if OK
  (the human approved this plan). Then remove this section.
- Works in the cloud: `verify`, `track:check`, `test:load`, `bots`, `shots` (Playwright Chromium,
  software WebGL: images are fine, the fps number is NOT real).
- Cannot be done in the cloud (do on the Windows laptop): real FPS, listening to audio,
  LAN/firewall, real `npm run jitter` numbers. Look for "LOCAL:" lines in this file.

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

- 2026-10-06: **P5 done** — engine heat (only nitro overuse heats; stall 2 s, smoke, sad sound),
  tandem drift (Pilot steers hard + Engineer taps S; 3 spark levels; release = boost + nitro;
  release grace), nitro (Shift), swap lane (swaps seats, cools engine, slower; solo handicap
  option), bot skills + balance test (skilled 7% faster), how-to cards, stutter fix in prediction
  (`npm run jitter`), sense of speed (engine hum, squeal, speed FOV, speed lines, center dashes,
  posts). Duo gate deferred (D075). Review fixes D076. Decisions D067–D076.

- 2026-10-06: **P6 done** — chaos items: boxes in item rows rolled by position (rubber-banding),
  Reply-All, Firewall, Coffee Spill, Ctrl+Z, Blue Screen, Lag Spike, Control Swap, Forced Update
  (Space fires, Q aims back, mash any key), effects on both screens, item props / icons / toasts /
  sounds, host chaos toggle, bots use items (skill ≥ 1). Chaos gate deferred. Review fixes D083.
  Decisions D077–D083.

- 2026-10-06: P7.1 car kit — cars.json `look` (body preset, wheelScale, parts); one vertex-colored
  merged body per car (+ wheels, roof number atlas, shadow = 6 draw calls, < 1,500 triangles);
  7 body presets and 8 parts with dims in look tables; heads per body; `garage` scenario. D085.

- 2026-10-06: P7.2 roster — the 8 ART_STYLE cars in cars.json (looks, stat leans inside
  0.92–1.08, horns incl. new `siren` and `squeak`); garage camera behind the rows. D086.

- 2026-10-06: P7.2b car picker — ◀ name ▶ on your team card's header (lobby:setCar, either
  player, between races), state `carModels` (slot N = roster car N by default), server stats per
  slot, client look/horn per car, prediction with your car's stats. D087.

- 2026-10-06: P7.3 balance — roster balance test (every car's 3-lap bot time within `lapSpread`
  ±3% of the median; Test Loop now, The Office in P7.5). Hot Fix speed 1.05 → 1.03 (was −3.4%). D088.

- 2026-10-06: P7.4 office prop kit — 12 props as data (`PROP_SHAPES`, real sizes ×
  `officeScale` 2), built by the shared kit builder, one InstancedMesh per kind (track `props`
  now drawn), `props` scenario; track schema validates prop kinds. D089.

- 2026-10-06 (cloud): P7.5 The Office — branch splines (shortcuts: open spline, progress mapped,
  walls cut at junctions, bots with `shortcutSkill` follow them), `track:check` lap target (40–55 s,
  `dev` flag exempts Test Loop) + shortcut bot laps, office.json (hairpin, chicane + slicks, jump
  over the boardroom table, Server Closet shortcut, swap lane, 166 props), carpet ground, Office =
  default track, `shots --track`. Bot drift fixes (release on straights, no drift into S-bends or
  shortcuts). D091.
- 2026-10-06 (cloud, 2nd session): two sessions had built P7.5 in parallel; kept `cloud-work`'s, added
  the general wall fix, ground polygon offset and the `shortcut` scenario from the other. D093.

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
- 2026-10-06 P5 gate "duo mechanics" (first try): "drift does not stay for long so there is not a
  lot of fun"; heat "is shit, maybe make engine heat when over use of nitro"; swap lane: "yes keep";
  driving: car stutters/jitters when moving, "feels like a box moving, no sense of speed or fun".
  → P5.6a–c added before re-testing the gate.
