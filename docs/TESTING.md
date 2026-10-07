# Testing — how the agent proves things work

The human should only need to test **feel and fun**. Everything else is checked by machines.

## 1. Layers

| Layer | What | Command |
|---|---|---|
| Types | strict TypeScript across all packages | part of `npm run verify` |
| Unit | shared sim, track math, race rules, items, scoring, schemas | `npm test` |
| Golden | bot lap-time windows per track and car; replay determinism hash | `npm test` |
| Integration | server room + real Colyseus clients in-process: join, roles, merge, disconnect, full race | `npm test` |
| Load | 8 cars × 2 bot clients race 3 laps through the real server; checks every car finishes, average tick < 25% of the 16.7 ms slot, overruns ≤ 0.1% of ticks; prints avg/max | `npm run test:load` (~2 min, not in verify) |
| Soak | 8 cars × 2 bot clients (a child process) race back to back for 10 min against the server in the soak process (chaos on, 2 laps); after each race: heap after a forced GC, tick avg/max/overruns, connected clients. Fails on heap growth > 8 MB (race 2 → last), > 0.1% overruns, a race that does not finish, or a lost client. Writes `artifacts/soak.json` | `npm run soak -- [--minutes 10] [--cars 8] [--laps 2] [--chaos on\|off]` (P10.5, not in verify) |
| Bot race | real WebSocket bot clients against a running server (split pilot/engineer bots); `tests/bot-clients.test.ts` runs 2 cars × 2 clients for one real-time lap (~40 s) in every verify | `npm run bots` |
| Visual | Playwright screenshots + render stats per scenario | `npm run shots` |
| Human | feel, fun, real-laptop FPS, real LAN | HUMAN GATEs in the phase files |

`npm run verify` = typecheck + all Vitest tests + a short headless bot race (one track,
2 cars, 1 lap, stepped as fast as possible). Must stay under about 60 s. Output: dot reporter,
failures, one summary line.

## 2. Bot driver

`packages/shared/src/bot/` drives a car along the track centerline with a look-ahead point
and slows down for curves. It is split into a **pilot half** (steer) and an **engineer half**
(gas/brake/nitro/items) so two separate bot clients can drive one car, which proves the
split-control networking end to end. Bots also fill empty cars in real races.

## 3. Golden tests

- **Lap window**: the bot drives 3 laps on each track with each car; lap time must be inside
  the expected window, and the roster spread within ±3% of the median.
- **Replay hash**: record the bot inputs of a 2-car, 1-lap race (~37 s), replay them on a fresh
  world and compare `hashWorld`; the hash of that race is also pinned. Tests live in
  `packages/shared/src/bot/bot.test.ts`. Headless race by hand: `node scripts/bot-race.mjs --cars 4 --laps 3`.
- Change expected values only for intended feel changes, and say so in the commit.

## 4. Shots (visual checks)

`npm run shots -- <scenario ...> [--track <id>] [--quality low|medium|high] [--season <id>] [--lang en|ar] [--gl default|swiftshader|angle|headed]` (`scripts/shots.mjs`; `--season` decorates the race scenarios for a `config/seasons.json` season, P11.3; `--lang ar` shows the UI in Arabic, P11.4):
1. Builds the client and starts the real server entry with `--prod --port 0` (a free port).
2. Launches the system browser with `playwright-core` (`channel: "chrome"`, then `"msedge"`),
   so no browser download is needed. Without either (cloud/CI containers) it falls back to a
   plain Chromium: `BROWSER_PATH`, else the Playwright bundle under `PLAYWRIGHT_BROWSERS_PATH`
   (`scripts/browser.mjs`). Software WebGL there: images are fine, fps numbers are not real.
3. Opens `http://localhost:<port>/?scenario=<name>&seed=1` per scenario (`&track=<id>` with
   `--track`), waits for `window.__game.ready`, saves `artifacts/shots/<name>.png`
   (`<name>-<track>.png` with `--track`; 1280×720) and adds
   `window.__game.stats()` to `artifacts/shots/stats.json`, plus console errors and failed
   requests (HTTP ≥ 400) per scenario.
4. An unknown scenario sets `window.__game.error`, so that shot fails at once instead of
   timing out. Hooks live in `packages/client/src/test-hooks.ts` (`KNOWN_SCENARIOS`).
   `stats()` returns `tickMs`/`pingMs`/`inputDelayMs`/`snapshotAgeMs` as `null` until measured.
   `focusCar()` returns the drawn pose `{ x, z, yaw, speed }` of the followed car (or `null`), for
   browser checks of motion and prediction. Drive with Playwright's trusted key presses
   (`page.keyboard.down`), not synthetic in-page `KeyboardEvent`s, and press slowly (~250 ms)
   when checking DOM buttons that live updates touch.

### Scenarios

| Scenario | Shows |
|---|---|
| `hello` | Phase 0 player-count page |
| `chase` | 4-bot race on the test track (or `&track=<id>`), run locally with the shared sim and frozen at 6 s; chase cam behind car 1 |
| `ghost` | same frozen race in chase view, with the see-through ghost of your best lap 8 m ahead and to the right of car 1 (P11.1) |
| `photo` | photo finish: a recorded clip of 4 cars through the finish line played by the real replay, held where car 1 and 2 cross nose to nose, from the photo-finish camera, with the "PHOTO FINISH!" banner (P11.2) |
| `pad` | the phone controller (P11.5) as the Engineer mid-race: status line and the big touch buttons; shot on a landscape phone (844×390, touch) |
| `juice` | same frozen race in chase view: confetti over car 1 (its finish), its body squashed by a landing, and a HONK! bubble over it (P7.6) |
| `cockpit` | same frozen race from car 1's Pilot seat, head turned right at the teammate's bobblehead (placeholder face) |
| `stall` | same frozen race in chase view, car 1's engine just stalled: smoke puffing from the hood (P5.1) |
| `drift` | same frozen race in chase view, car 1 mid-drift with orange (level 2) sparks at the rear wheels (P5.2) |
| `nitro` | same frozen race in chase view, car 1 burning nitro: big flames out the back (P5.3) |
| `sandstorm` | same frozen race in chase view, the track's sandstorm blowing at full strength (thick sand fog; use `--track smart-oasis`) (P10.2) |
| `items` | chaos on in the frozen race at 2.2 s: Mystery Packet boxes, a Reply-All envelope ahead of car 1, a coffee puddle, car 1's Firewall bubble, and the Forced Update overlay at 40% (P6.5) |
| `garage` | showroom: one car per slot (car0–car7, cycling through config/cars.json) parked in two rows at the start line, fixed camera in front (P7.1) |
| `props` | one of every office prop in a row beside the start straight, fixed camera (P7.4) |
| `track-overview` | top-down camera over the whole track, cars on the start line |
| `shortcut` | fixed camera over the fork where the track's first shortcut leaves the main road, no cars (P7.5) |
| `league` | the main menu with the League screen open on made-up tables (this week) (P9.4) |
| `menu` | main menu: turntable showroom (first roster car, with its real-life type), HOST, JOIN, HONK, loading message; the slideshow shows when `assets/menu/` has images (P8.1, P12.1) |
| `lobby` | lobby with made-up players (you = host, full cars, a solo car, one away) over the track overview: car pictures, seat buttons (P12.3) |
| `carpick` | the same lobby with your team's garage window open: every car, type, stat bars, Honk (P12.3) |
| `host` | the main menu with the HOST window open: name, track cards with mini maps, mode, laps, bots, chaos (P12.1) |
| `join` | the main menu with the JOIN list open on made-up games (P12.1) |
| `garage` | all roster cars side by side in team colors |
| `props` | one of every office prop in a row beside the start straight, fixed camera (P7.4) |
| `lobby` | lobby with fake players in 4 teams |
| `items` | frozen moment with several item effects active |
| `garage` | showroom: one car per slot (car0–car7, cycling through config/cars.json) parked in two rows at the start line, fixed camera in front (P7.1) |
| `props` | one of every office prop in a row beside the start straight, fixed camera (P7.4) |
| `results` | results screen with made-up times, the podium, points and awards (P9.4) |
| `menu` | main menu |

Any scenario also takes `&quality=low|medium|high` (default `quality.default`).
New screens add a scenario in the same task.

### If WebGL fails headless
Try in order, and record which worked in `docs/DECISIONS.md`:
1. `--gl swiftshader` (launch args `--use-angle=swiftshader --enable-unsafe-swiftshader`).
2. `--gl angle` (`--use-gl=angle` with the default backend).
3. `--gl headed` (a real window opens for a few seconds).
Headless FPS is meaningless; only draw calls, triangles and the images are judged.

### Smoothness (`npm run jitter -- [seconds] [--lag ms] [--jitter ms]`)

Real browser + real production server: sits solo in car 1, turns bots on, starts a race, holds
gas while weaving, and records the drawn car, the camera and one bot car every frame
(`window.__game.focusCar()` has `camX/camZ`; `otherCar()` is the bot). `--lag/--jitter` put an
in-order TCP proxy between the browser and the server that delays each packet by lag +
random(0..jitter) ms: office Wi-Fi on one PC. P13.1 with `--lag 30 --jitter 40`: the bot car
was off on 42% of frames with 66 frozen frames (fixed 50 ms buffer); with the adaptive buffer
0.4% and none. Prints the per-frame movement ÷ car speed (1.00 = perfectly even) and the
car-vs-camera wobble; exits 1 when more than 5% of frames (your car or the bot) are off by over 40%. Use it when a
player says "laggy" or "stutters". The unit test "server updates every 2 ticks never make the
drawn car step unevenly" in `net/predictor.test.ts` guards the prediction part in `verify`.
P5.6b baseline: 1.4–2.7% uneven frames, wobble p50 0.01 m (was 46% and 0.16 m).

## 5. What the human tests (HUMAN GATEs)

Feel (steering, speed, drift, heat), fun (does the duo yell?), readability on a real laptop,
real FPS with the F3 overlay, and the real office LAN with two or more laptops.
Results go into the "Playtest log" in `docs/PROGRESS.md`; changes go through `/feedback`.
