# Progress

Updated by the agent at the end of every task and by `/handoff`. Keep it under ~60 lines:
roll old "Last sessions" lines into one summary line per finished phase.

## Now
- Phase: P0 — Foundation (`docs/phases/P00-foundation.md`)
- Next task: P0.9 phase end (gate passed)
- Status: P0.1–P0.8 done. `npm run verify` (17 tests) and `npm run shots -- hello` pass.

## Half-done
- (nothing)

## Waiting on the human
- (nothing)

## Environment
- OS: Windows 11 Pro 10.0.22631
- Node v24.19.0, npm 11.17.0, git 2.55.0.windows.5
- Browsers: Chrome 154.0.8037.93, Edge 154.0.4258.53

## Known issues
- A client could call `create('race')` and make a second room. Lock this down when the
  lobby is built (one lobby per server, D004).
## Last sessions
- 2026-10-04: starter kit created (CLAUDE.md, rules, skills, reviewer agent, docs). No code yet.
- 2026-10-04: P0.1 environment check passed (Node 24, npm 11, git 2.55, Chrome + Edge).
- 2026-10-04: P0.2 git init on `main`, LF `.gitattributes`, GitHub remote added, kit committed.
- 2026-10-04: P0.3 npm workspaces (shared/server/client), strict TS 7, deps pinned (D017–D020).
- 2026-10-04: P0.4 `config/tuning.json` (sim, net) + zod schema/loader + GAME_TITLE, tests (D021–D022).
- 2026-10-04: P0.5 Express+Colyseus `race` room, LAN URLs, Vite page with live count; 2 Chrome tabs → 2, close one → 1 (D023–D027).
- 2026-10-04: P0.6 Vitest projects, `tests/race-room.test.ts` (2 clients → 2 → 1), `npm run verify` (D028). Bot race step added to P1.4.
- 2026-10-04: P0.7 `npm run shots` + `window.__game` hooks; `/shots hello` PASS (D029).
- 2026-10-04: P0.8 docs pass: README game commands, CLAUDE.md command table, ARCHITECTURE folder map + LAN flags; `npm start` re-checked.

## Playtest log
- 2026-10-04 P0 gate "first contact": `npm run dev` page showed the live count on the host.
  Second laptop on office Wi-Fi first got "site can't be reached": Wi-Fi is a Public network
  and Node is only allowed on Private/Domain. Human added the game-ports firewall rule (D030)
  → second laptop loaded `http://192.168.0.105:5173/`: **works**.
