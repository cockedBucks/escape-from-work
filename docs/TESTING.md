# Testing — how the agent proves things work

The human should only need to test **feel and fun**. Everything else is checked by machines.

## 1. Layers

| Layer | What | Command |
|---|---|---|
| Types | strict TypeScript across all packages | part of `npm run verify` |
| Unit | shared sim, track math, race rules, items, scoring, schemas | `npm test` |
| Golden | bot lap-time windows per track and car; replay determinism hash | `npm test` |
| Integration | server room + real Colyseus clients in-process: join, roles, merge, disconnect, full race | `npm test` |
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

`npm run shots -- <scenario ...> [--gl default|swiftshader|angle|headed]` (`scripts/shots.mjs`):
1. Builds the client and starts the real server entry with `--prod --port 0` (a free port).
2. Launches the system browser with `playwright-core` (`channel: "chrome"`, then `"msedge"`),
   so no browser download is needed.
3. Opens `http://localhost:<port>/?scenario=<name>&seed=1` per scenario, waits for
   `window.__game.ready`, saves `artifacts/shots/<name>.png` (1280×720) and adds
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
| `cockpit` | same race, cockpit cam of car 1, teammate bobblehead visible |
| `track-overview` | top-down camera over the whole track, cars on the start line |
| `lobby` | lobby with made-up players (you = host, full cars, a solo car, one away) over the track overview |
| `garage` | all roster cars side by side in team colors |
| `lobby` | lobby with fake players in 4 teams |
| `items` | frozen moment with several item effects active |
| `results` | results screen with fake times, awards and points |
| `menu` | main menu |

Any scenario also takes `&quality=low|medium|high` (default `quality.default`).
New screens add a scenario in the same task.

### If WebGL fails headless
Try in order, and record which worked in `docs/DECISIONS.md`:
1. `--gl swiftshader` (launch args `--use-angle=swiftshader --enable-unsafe-swiftshader`).
2. `--gl angle` (`--use-gl=angle` with the default backend).
3. `--gl headed` (a real window opens for a few seconds).
Headless FPS is meaningless; only draw calls, triangles and the images are judged.

## 5. What the human tests (HUMAN GATEs)

Feel (steering, speed, drift, heat), fun (does the duo yell?), readability on a real laptop,
real FPS with the F3 overlay, and the real office LAN with two or more laptops.
Results go into the "Playtest log" in `docs/PROGRESS.md`; changes go through `/feedback`.
