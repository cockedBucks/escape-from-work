# Escape from Work

Browser multiplayer racing game for the Smart Oasis office LAN. Teams of two share ONE car:
the **Pilot** steers, the **Engineer** runs gas, brake, nitro and items. Each player is on
their own laptop, sitting next to their teammate. 4–16 players (2–8 cars). Goofy, chaotic,
easy in 10 seconds. A player without a partner drives **solo** with all controls.

The human is a former UE5 dev, new to web/TypeScript. They design the fun and playtest.
You build everything else, agentically, from these docs. Explain decisions in plain English.

## How we work (the loop)

- Every session starts with `/next`. It reads `docs/PROGRESS.md`, then ONLY the current
  phase file in `docs/phases/`, does the next task, verifies, commits, updates PROGRESS.
- One task = one commit. Commit message starts with the task id: `P1.3: car physics v1`.
- **HUMAN GATEs are deferred** (human's request, 2026-10-06: no playtest partner until the end).
  At a gate, do not stop: mark it `[~] deferred`, add it to "Deferred human tests" in
  `docs/PROGRESS.md`, and continue. After the last phase, run all deferred tests with the human.
- Before stopping mid-task (or when context feels large), run `/handoff`.
- A task is DONE only when: `/verify` passes, new logic has tests, the phase checkbox is
  ticked, touched docs are updated, and it is committed.
- Visual change (rendering, UI, camera, cars, tracks) → also run `/shots`.
- End of phase → `reviewer` subagent on the phase diff, fix Critical items, `git tag pN-done`,
  give the phase report, then continue into the next phase (the human wants `/next` to keep
  going and stop only for decisions or blockers; gates are deferred, see above).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | server (watch) + Vite client, hot reload |
| `npm start` | production build, one process serves page + multiplayer on the LAN |
| `npm run verify` | typecheck + all tests + short headless bot race. Terse output |
| `npm run typecheck` | typecheck only (`verify.mjs --types-only`) |
| `npm test` | Vitest only |
| `npm run test:load` | 8 cars / 16 bot clients, 3-lap race through the real server (~2 min, not in verify) |
| `npm run soak` | 16 bot clients, 10 min of back-to-back races: heap growth + tick times (not in verify) |
| `start-server.bat` / `.sh` | office start: install if needed, build, start, print URLs (docs/LAN.md) |
| `npm run bots -- --cars 4 --seconds 60` | real WebSocket bot clients (split pilot/engineer) against a running server (`--url`) |
| `npm run shots -- chase lobby` | Playwright screenshots + render stats → `artifacts/shots/` |
| `npm run jitter` | real browser + server: how smoothly your car is drawn (stutter check) |
| `npm run track:check -- office` | validate a track file and run bot laps on it — from P1 |

## Folder map

- `config/` all tunable data: `tuning.json`, `cars.json`, `items.json`, `tracks/*.json`
- `packages/shared/` deterministic sim, track math, race rules, items, bot driver, schemas
- `packages/server/` Node + Colyseus: authoritative room, lobby, league store, dev endpoints
- `packages/client/` Three.js + Vite: rendering, input, cameras, UI, audio, test hooks
- `scripts/` cross-platform Node scripts (shots, bots, track-check, faces)
- `assets/faces/` coworker face images (bobbleheads), `assets/menu/` menu images
- `docs/` design + plan. `artifacts/`, `data/` are gitignored

## Hard rules

1. Server is authoritative. The client only sends inputs and draws interpolated state.
2. All game rules and physics live in `packages/shared`, deterministic, with tests.
3. No hardcoded tuning numbers. Every gameplay number lives in `config/` and is validated
   by a zod schema in shared. Math constants (PI, epsilon) are fine.
4. TypeScript strict. No `any` without a comment saying why. Small focused files.
5. Scripts must run on Windows, macOS and Linux: Node `.mjs` scripts, no bash-only syntax.
6. Offline at runtime: no CDNs, no external calls. Fonts and libs come from npm.
7. Original art only: no real brands, logos or copyrighted characters. Log every external
   asset in `docs/ASSETS.md` (CC0 or own work only).
8. Dependencies: the approved list is in `docs/ARCHITECTURE.md`. Anything else → ask first.
   Check current versions with `npm view <pkg> version` and read installed type definitions
   for APIs instead of trusting memory (Colyseus and Three.js APIs change between versions).
9. Never `git push`, never rewrite history, never `git reset --hard`.
10. Decisions that change `docs/ARCHITECTURE.md` or `docs/GAME_DESIGN.md` → ask the human
    first. Small decisions → just decide, log a line in `docs/DECISIONS.md`.
11. Do not install plugins, MCP servers or third-party skills. Suggest them instead.
12. Keyboard input uses `KeyboardEvent.code` (physical keys) so Arabic/other layouts work.

## Token economy (the human is on a Pro plan)

- Read only what the task needs. Never read all of `docs/`. Never scan the whole repo.
- Read large files by section (offset/limit or grep), not whole.
- Never paste long logs or full test output: failures + one summary line only.
- Prefer editing over rewriting files. Do not re-read a file you just wrote.
- Use subagents only for `/shots`, the `reviewer`, or noisy one-off investigations.
- Do not create new docs unless a phase task asks for one.

## Where to find things

| Need | Read |
|---|---|
| Current state, next task | `docs/PROGRESS.md` |
| Task list for a phase | `docs/phases/PNN-*.md` (only the current one) |
| Phase overview | `docs/ROADMAP.md` |
| What the game is, mechanics, items, tracks | `docs/GAME_DESIGN.md` |
| Tech design, folders, net protocol, data formats | `docs/ARCHITECTURE.md` |
| Look, palette, car roster, performance budget | `docs/ART_STYLE.md` |
| Test strategy, scenarios, shots pipeline | `docs/TESTING.md` |
| Why something was decided | `docs/DECISIONS.md` |
| Asset licenses | `docs/ASSETS.md` |
| LAN setup / firewall | `docs/LAN.md` |

Path-specific rules load automatically from `.claude/rules/` when you touch those folders.

## Reporting to the human

Plain English, short. After each task: what changed (1–3 lines), how to see it, what is next.
At a HUMAN GATE: the exact checklist, the commands to run, and what to reply.

# Compact instructions

When compacting, keep: current task id and its checklist, files changed so far, failing
test names, decisions made this session, and the exact next step. Drop file contents and logs.
