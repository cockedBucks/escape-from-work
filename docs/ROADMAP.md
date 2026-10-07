# Roadmap — Escape from Work

Built risk-first: the scariest question ("is one car with two drivers over a network fun?")
is answered in Phase 2, before any art or content. Each phase ends playable.

| Phase | File | Goal | Ends with |
|---|---|---|---|
| P0 | `phases/P00-foundation.md` | Project skeleton, tooling, checks, screenshot pipeline | two tabs see each other over the LAN |
| P1 | `phases/P01-drive-feel.md` | One car on a greybox track that feels good to drive | HUMAN GATE: drive + tune |
| P2 | `phases/P02-split-control.md` | Two laptops, one car. Bots prove it end to end | **FUN GATE** with a coworker |
| P3 | `phases/P03-race-loop.md` | Lobby, teams, seats, full races up to 16 players | HUMAN GATE: real race |
| P4 | `phases/P04-cockpit.md` | Cockpit cam, bobblehead teammate, dashboard, mirror, honk | HUMAN GATE: cockpit fun |
| P5 | `phases/P05-teamwork.md` | Heat, tandem drift, nitro, swap lane | HUMAN GATE: duo mechanics |
| P6 | `phases/P06-chaos-items.md` | Item boxes and all 8 items, rubber-banding | HUMAN GATE: chaos race |
| P7 | `phases/P07-cars-and-office.md` | 8 goofy cars, The Office track, juice, audio, perf | HUMAN GATE: real-laptop FPS |
| P8 | `phases/P08-menu-ux.md` | Goofy main menu, settings, onboarding, UI polish | HUMAN GATE: first-time players |
| P9 | `phases/P09-league.md` | League, records, weekly cup, awards, Rubber Duck | HUMAN GATE: a league week |
| P10 | `phases/P10-tracks-and-ship.md` | 3 more tracks, office deployment, v1.0 | launch party |
| P12 | `phases/P12-host-join-garage.md` | Host/Join games, real-life cars, visual garage and seats | tested with the deferred tests |
| P11 | `phases/P11-extras.md` | Later ideas: ghost lap, photo finish, seasons, Arabic UI, phone pads, battle mode | tested with the deferred tests |
| P13 | `phases/P13-fun-pass.md` | Smooth online play, kart drift on Space, rocket start, slipstream, tricks, boost pads | tested with the deferred tests |

## How tasks work

- Task ids: `P<phase>.<n>`, for example `P2.4`. One task is about one focused commit.
- A task can be split if it turns out large: add `P2.4a`, `P2.4b` in the phase file.
- Discovered work goes into the phase file as a new unchecked task (or a later phase),
  never silently into the current task.
- HUMAN GATEs are checklists for the human. The agent stops there and waits.

## Skills that grow with the project

| Skill | Usable from | Purpose |
|---|---|---|
| `/next`, `/handoff`, `/verify` | P0 | the work loop |
| `/shots` | end of P0 | visual checks |
| `/feedback` | P1 | playtest notes → tuning |
| `/add-track` | P1 (track system exists) | new tracks |
| `/add-car` | P7 (car kit exists) | new cars |
| `/add-item` | P6 (item system exists) | new items |

If a skill's steps no longer match the code (paths, commands), update the skill file in the
same task that changed the code.

## Later ideas (not scheduled)

Built in P11 (2026-10-07): ghost of your best lap, photo-finish replay, battle arena mode,
seasonal track decorations, phones as controllers, Arabic UI translation.
Still open: a public internet server (needs hosting the human chooses; see P11).
