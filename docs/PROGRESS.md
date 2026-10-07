# Progress

Updated by the agent at the end of every task and by `/handoff`. Keep it under ~60 lines:
roll old "Last sessions" lines into one summary line per finished phase.

## Now
- Phase: P11 — Extras after v1.0 (`docs/phases/P11-extras.md`), human's request 2026-10-07 (D117).
- Next task: P11.7 Final sweep
- Status: v1.0 done (P0–P10 + P10.8 fixes). `npm run verify` passes (524 tests + bot race).

## Half-done
- (none)

## v1.0 phase report (P10)
- Works: four tracks the host picks in the lobby (Track drop-down; everyone reloads into it,
  seats and host kept), office start = double-click `start-server.bat` (or `./start-server.sh`),
  daily league backups, 10-minute 16-bot soak with no leak, one lobby per server.
- Try: `npm start` (or the start script), open the printed URL on 2+ laptops, pick each track.
- Known issues: see below (bots and the sandstorm, real-hardware checks not done yet).
- Next: the deferred human tests, then "Later ideas" in docs/ROADMAP.md.

## Deferred human tests (run all after the last phase; human's request 2026-10-06)
- P2 FUN GATE step 3: close a tab mid-lap and reopen it (reconnect keeps your seat).
- P5 duo mechanics (re-test after P5.6a–c): duo race, chain drifts into nitro without
  overheating, swap lane once from lap 2. Ask: drifting understandable/fun? heat (nitro only)
  better? any stutter left (`npm run jitter`)? feels fast now?
- P7 looks, sound, real FPS: on a normal work laptop race The Office with F3 open, on Medium. Reply:
  FPS (min and typical), favorite and least favorite car, anything ugly or confusing on the track,
  too loud/quiet sounds (volume sliders: speaker button top right).
- P8 first-time players: find 2 coworkers who never saw the game, give them only the URL, watch,
  do not help. Reply: where they got stuck, what made them laugh, what they asked.
- P9 a league week: play normally for a few days, look at the League screen (menu → 🏆 League).
  Reply: anything unfair, missing or not funny enough? Which awards should change?
- P10 launch party: host on the office PC with `start-server.bat` (double-click). Get as many
  people as possible and race all four tracks (lobby: the Track drop-down): The Office, Server Room, Smart
  Oasis (sandstorm on lap 2), Motherboard. Reply: anything broken, plus the next features you want
  (see "Later ideas" in docs/ROADMAP.md).
- P6 chaos race: race with chaos on, 3+ cars (bots allowed). Ask: most fun items? annoying or
  unclear ones? anything too strong? (weights/durations in config/items.json)
- P11 extras (built in the cloud 2026-10-07; each can be turned off):
  1. Ghost: race 2+ laps on one track; from your next lap a see-through car drives your best lap.
     Reply: helpful or distracting? (Settings → Screen → ghost checkbox.)
  2. Photo finish: finish close behind/ahead of another car (or watch bots: many cars, 1 lap).
     Reply: is the slow-motion replay fun, too long, or confusing?
  3. Decorations: Settings → Decorations → try Ramadan, Eid, Halloween, Winter on a track.
     Reply: which look good, which are tacky? Are the Ramadan/Eid dates right (config/seasons.json)?
  4. Arabic: Settings → Language → العربية, then menu, lobby, a race, results, League, Settings.
     Reply: wrong or awkward Arabic, anything not translated, layout problems?
  5. Phone controller: on a phone open the game address → "📱 Use this phone as a controller",
     sit as Engineer next to a laptop Pilot and race. Reply: buttons comfortable? any lag? does
     the phone screen lock mid-race (raise the screen timeout)? Does it buzz on hits (Android)?
  6. Battle: host presses 🏁 Race → 💥 Battle, picks The Break Room, 3+ cars (bots ok).
     Reply: fun? too long/short (battle.* in tuning.json)? is "out" clear?

## Cloud session (read me first, local Claude)
- 2026-10-06: local Claude Code hit its usage limit after P7.4. Work continues in a claude.ai cloud
  session (Linux container, Node 22, no GPU, no speakers, no LAN) on the session's branch, now
  `claude/keen-edison-iupozz` (it contains `cloud-work`, D093), pushed after each task (never `main`; D090).
- **When back local (after P10.7 is done in the cloud)** — local Claude, walk the human through this:
  1. `git status` must be clean on `main` (commit or stash local changes first).
  2. `git fetch origin` then `git log --oneline main..origin/claude/keen-edison-iupozz` (what is new).
  3. `git checkout -b cloud-review origin/claude/keen-edison-iupozz`, then `npm install`,
     `npm run verify`, `npm run shots -- menu lobby chase`, and `npm start` for a quick look (Windows).
  4. If OK: `git checkout main` and `git merge --no-ff cloud-review -m "Merge cloud work (P7.5–P10)"`
     (no rebase, no reset). If a conflict appears, stop and ask the human.
  5. `npm run verify` again on `main`, then the HUMAN pushes `main` (`git push origin main`).
  6. Tags (cloud tags were never pushed): `git tag p7-done <hash of "P7.9">`, the same for
     `p8-done` ("P8.6"), `p9-done` ("P9.5"), `p10-done` and `v1.0` (the final "P10.7" commit);
     find hashes with `git log --oneline --grep "^P9.5"`. The human may `git push origin --tags`.
  7. Delete the review branch (`git branch -d cloud-review`), remove this "Cloud session" section,
     commit "docs: back local", then run the "Deferred human tests" with the human (LOCAL: lines too).
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
- Not checked on real hardware yet (the cloud has no GPU, speakers or LAN): real FPS on office
  laptops, audio levels, `npm run jitter` numbers, `start-server.bat` on Windows. All are in the
  launch-party gate.
- In dev (`npm run dev`), anyone on the LAN can use the F2 `/dev/tuning` endpoint (via Vite).
  Accepted for playtests; it never exists with `npm start`.
- The sandstorm is drawn only (fog on every screen); bots do not slow down in it (by design, D110).

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

- 2026-10-06: **P7 done** (P7.5–P7.9 in the cloud) — car kit + 8-car roster with looks, horns and
  engine voices, car picker, roster balance (±3%), office prop kit; The Office (default track, Server
  Closet shortcut on branch splines, lap target 40–55 s with a `dev` flag); juice (squash, hit shake,
  head kicks, confetti, honk bubble) + cockpit eye fix; procedural audio + volume sliders; perf within
  budget (standalone tick max 5 ms). Two parallel P7.5s merged (D093). Gate deferred. Review fixes
  D097. Decisions D085–D097. Tag `p7-done` was made in the cloud on commit "P7.9" (re-tag locally).

- 2026-10-06: **P8 done** (cloud) — main menu (turntable, HONK, IT jokes, assets/menu slideshow,
  held seat skips it), settings + key help window (quality, volumes, camera, FPS), first-race
  onboarding (role card, "?", swap/item hints), UI polish (one button/panel style, podium with faces,
  fits 1366×768). Gate deferred. Review fixes D102. Decisions D098–D102. Tag `p8-done` made in the
  cloud on commit "P8.6" (re-tag locally).

- 2026-10-06: **P9 done** (cloud) — league on the host PC (data/league.json: race history, atomic +
  fsync, corrupt-file backup), points by place from config (people only, once per race), weekly cup
  by the host-local date, duos, lap records, award counters + 6 config awards + the Rubber Duck of
  Shame, results points/awards, League screen (/league/tables.json). Gate deferred. Review fixes
  D107. Decisions D103–D107. Tag `p9-done` made in the cloud (re-tag locally).

- 2026-10-06/07: **P10 done** (cloud) — track picker (host, lobby drop-down, pages reload with seats
  and host held), Server Room (fan push zones, icy aisle), Smart Oasis (dune jumps, Palm Oasis
  shortcut, lap-2 sandstorm), Motherboard (chip jumps, CPU-fan loop), `start-server.bat/.sh` + daily
  league backups, `npm run soak` (no leak), final pass (props off roads, one lobby per server,
  README). Launch-party gate deferred. Review fixes D115. Decisions D108–D115. **v1.0.**
  LOCAL: double-click `start-server.bat` once on the Windows host to confirm it.
- 2026-10-07 (cloud): P10.8 known-issue fixes — network bots follow the server's track, busy port
  prints only the friendly line, `props` showroom off the roads. D116.
- 2026-10-07 (cloud): P11.1 Ghost of your best lap — records your drawn car per lap, keeps the
  best per track in the browser, see-through ghost car, Settings toggle, scenario `ghost`. D118.
- 2026-10-07 (cloud): P11.2 Photo finish — 1st/2nd within 0.5 s: slow-motion replay of the last
  seconds from a finish-line camera with flashes and a banner (finished players and spectators;
  drivers get a toast), scenario `photo`. D119.
- 2026-10-07 (cloud): P11.3 Seasonal decorations — config/seasons.json (Ramadan, Eid, Halloween, winter),
  9 original decoration kits beside every track (off roads, clear of props, tested), snow in winter,
  Settings → Decorations (Auto/Off/season), `shots --season <id>`. D120.
- 2026-10-07 (cloud): P11.4 Arabic UI — every screen in English or Arabic (right-to-left), string tables in
  `packages/client/src/i18n/` (Arabic must cover every key: typed + tested), Settings → Language,
  `shots --lang ar`. Server refusal messages stay English. D121.
- 2026-10-07 (cloud): P11.5 Phone controller — `?pad` (menu button on touch screens): seat list, big touch
  buttons per role, status line, buzz on hits; same input messages (no server change); checked live
  in a phone-sized browser (holding GAS drove the car). Scenario `pad`. D122.
- 2026-10-07 (cloud): P11.6 Battle mode — host 🏁 Race / 💥 Battle, 3 lives, item hits take one (2 s grace),
  last car standing or most lives at 2.5 min, out cars see-through; lives in HUD/scoreboard/results/pad;
  not a league race; new arena track The Break Room (`battle: true`, ~22 s laps). A real 4-bot battle
  in the browser ended in 116 s. D123.

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
