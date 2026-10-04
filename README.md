# Escape from Work

A goofy office racing game for the Smart Oasis LAN. Teams of two share one car: one person
steers, the other runs the pedals, nitro and items, each on their own laptop.

This folder starts as a **starter kit**: design docs, a phased plan, and rules and skills
for Claude Code. Claude Code builds the whole game from it, task by task. Your job is to
playtest, give feedback, and say yes or no at the decision points.

---

## 1. One-time setup

1. Install **Node.js LTS** (22 or newer) from nodejs.org, and **Git** from git-scm.com.
2. Make sure **Chrome or Edge** is installed (used for automatic screenshots).
3. Install **Claude Code** and sign in with your Claude Pro account
   (instructions: https://code.claude.com/docs/en/setup).
4. Unzip this kit into an empty folder, for example `escape-from-work`.
   Check that the hidden `.claude` folder came along (enable "show hidden items").

## 2. Start building

1. Open the folder in Antigravity.
2. Open a terminal in that folder and run `claude`.
3. When Claude Code asks whether you trust this folder, say yes. That turns on the project
   permissions in `.claude/settings.json` (npm scripts, tests and git commits run without
   asking; `git push` is blocked; file edits are accepted automatically).
4. Type `/next`. That is it.

## 3. The daily loop

| You type | What happens |
|---|---|
| `/next` | Claude does the next task: builds it, tests it, commits it, updates progress |
| `/next phase` | keeps going through the current phase until a test gate or the phase ends |
| `/next P2.4` | does a specific task |
| `/feedback <what felt wrong>` | turns your playtest notes into tuning changes |
| `/handoff` | saves exactly where things stand before you stop |
| `/clear` | fresh conversation (do this between phases, saves your usage) |
| `/usage` | see how much of your Pro limit is used |

When Claude reaches a **HUMAN GATE**, it stops and shows you a short checklist
(for example: "open the game on two laptops and drive together"). Do it, reply with what
you saw, and it continues.

If you hit your usage limit mid-task, nothing is lost: next time just type `/next`. It reads
`docs/PROGRESS.md` and the uncommitted changes and carries on.

## 3b. Game commands

Run these in a terminal in the project folder. After cloning on a new PC, run `npm install`
once first.

| Command | What it does |
|---|---|
| `npm run dev` | game server + Vite page with hot reload. Open Vite's **Network** URL (port 5173) |
| `npm start` | builds the page and starts one server for the office; open the printed **LAN** URL (port 2567) |
| `npm run verify` | typecheck + all tests + a short headless bot race, one summary line (Claude runs this before every commit) |
| `npm test` | tests only |
| `npm run shots -- hello` | screenshots in your Chrome/Edge → `artifacts/shots/` |
| `npm run track:check` | checks every track file (or `-- test-loop` for one): shape, width, tight curves, crossing walls |
| `npm run bots`, `npm run faces` | arrive in P2 and P4 |

Driving (from P1.6): open the page and you join the race at once. **W/S** or **↑/↓** gas and
brake (hold S when stopped to reverse), **A/D** or **←/→** steer, **R** respawn, **F3** debug overlay
(fps, ping, draw calls). Add `?quality=low` to the URL on a slow laptop.

Stop a running server with **Ctrl+C**. The game port is `net.port` in `config/tuning.json`.

## 4. The plan (11 phases)

P0 skeleton → P1 driving feel → **P2 two laptops, one car (fun gate)** → P3 lobby and races →
P4 cockpit cam and bobbleheads → P5 heat, drift, nitro, swap lane → P6 chaos items →
P7 cars, The Office track, sound → P8 goofy menu → P9 league and awards →
P10 more tracks and v1.0. Details: `docs/ROADMAP.md`.

## 5. Your jobs

- Playtest at each HUMAN GATE and reply honestly (funny? laggy? confusing?).
- Tune feel live: in dev builds, **F2** opens the tuning panel, **F3** shows FPS and lag.
- Add coworker faces to `assets/faces/` (only people who agreed) and company images to
  `assets/menu/`. Both folders stay on your PC and are never committed.
- Answer the open questions when Claude asks (for example fixed vs shuffled teams).

## 6. Saving your usage (Pro plan)

- One phase per conversation, `/clear` between phases.
- Keep the default model (Sonnet is the right fit for this on Pro). Check `/model` and
  `/usage` now and then.
- If Claude heads the wrong way, press **Esc** right away and say what you want instead.
  `/rewind` restores code and conversation to an earlier point.
- Be specific in feedback ("the car slides too much after the jump" beats "make it better").

## 7. Optional add-ons (later, your call)

Claude will not install these on its own. Ideas worth trying once the matching phase starts:
- Anthropic's example skills (for menu and UI design ideas):
  `/plugin marketplace add anthropics/skills`, then install `example-skills`.
- A Three.js skill pack for Claude Code, around Phase 7 (art pass). Read its files before
  installing; third-party packs are not reviewed by Anthropic.

## 8. Where things are

| Path | What |
|---|---|
| `CLAUDE.md` | the rules Claude Code reads every session |
| `.claude/rules/` | extra rules that load only for matching folders |
| `.claude/skills/` | `/next`, `/handoff`, `/verify`, `/shots`, `/feedback`, `/add-car`, `/add-item`, `/add-track` |
| `.claude/agents/reviewer.md` | a fresh-eyes reviewer used at the end of each phase |
| `docs/PROGRESS.md` | where we are right now |
| `docs/phases/` | task lists and test gates for each phase |
| `docs/GAME_DESIGN.md` | the game: roles, mechanics, items, tracks, league |
| `docs/ARCHITECTURE.md` | how it is built |
| `docs/ART_STYLE.md` | the look, cars, colors, performance budget |
| `docs/TESTING.md` | how Claude proves things work |
| `docs/DECISIONS.md` | why things are the way they are |

## 9. If something goes wrong

- **Claude seems confused**: `/clear`, then `/next`. Progress lives in the docs and git, not
  in the conversation.
- **A change broke the game**: ask Claude to revert the last task's commit with `git revert`
  (history is never rewritten), or use `/rewind` inside the session.
- **Other laptops cannot open the game**: see `docs/LAN.md` (written in Phase 2); usually the
  Windows firewall needs a rule for the game port.
