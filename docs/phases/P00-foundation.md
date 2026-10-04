# P0 — Foundation

**Goal:** a clean, verified project skeleton that every later phase builds on, with the
checks and screenshot pipeline that let the agent prove its own work.

**Done when**
- `npm run dev`, `npm start`, `npm test`, `npm run verify` and `npm run shots -- hello` work.
- The page shows the game title and the live number of connected players.
- Two browser tabs show 2 players; closing one shows 1.
- The server prints its LAN URLs; a second device on the LAN can open the page.
- Everything is committed; tag `p0-done`.

## Tasks

- [x] **P0.1 Environment check.** Check Node.js (22 or newer LTS), npm, git, and an installed
  Chrome or Edge. Record versions and OS in `docs/PROGRESS.md`. If anything is missing,
  stop and tell the human exactly what to install.
- [x] **P0.2 Git.** `git init`, commit the kit as it is: `P0.2: project kit (docs, rules, skills)`.
- [x] **P0.3 Workspace scaffold.** Root `package.json` (private, npm workspaces `packages/*`),
  `tsconfig.base.json` (strict), packages `shared`, `server`, `client` with their own
  `package.json`/`tsconfig`. Look up current versions of the approved dependencies and pin
  them. Record versions in `docs/DECISIONS.md`.
- [x] **P0.4 Config foundation.** `config/tuning.json` with `sim`, `net` (port, patchRateMs,
  interpDelayMs, reconnectSeconds) sections only. zod schema + loader in shared.
  `GAME_TITLE` constant. Unit tests for valid and invalid config.
- [x] **P0.5 Hello multiplayer.** Server: Express + Colyseus, room `race` that tracks connected
  players, prints LAN URLs, serves the built client in production. Client: Vite page showing
  the title and the live player count. `npm run dev` runs both with hot reload; the client
  finds the server on the same hostname.
- [x] **P0.6 Checks.** Vitest across packages. One integration test in `tests/`: start the room
  in-process, connect 2 clients, see count 2, disconnect one, see 1.
  `scripts/verify.mjs` + `npm run verify` (typecheck + tests, terse output, nonzero exit on
  failure).
- [x] **P0.7 Shots pipeline.** `scripts/shots.mjs` + `npm run shots` per `docs/TESTING.md`,
  with the `hello` scenario, `window.__game.ready` and `stats()`. Run `/shots hello`.
- [ ] **P0.8 Docs pass.** README commands section confirmed, PROGRESS updated, anything that
  differs from `docs/ARCHITECTURE.md` fixed there.
- [ ] **HUMAN GATE — first contact.**
  1. Run `npm run dev`. Open the printed URL in two tabs: you should see 2 players.
  2. Open the LAN URL from a second laptop or phone on the office Wi-Fi. If it does not load,
     tell the agent: it will help with the firewall now (Phase 2 writes the full LAN guide).
  3. Reply: "works" or what went wrong.
- [ ] **P0.9 Phase end.** Reviewer, fixes, `git tag p0-done`, phase report.
