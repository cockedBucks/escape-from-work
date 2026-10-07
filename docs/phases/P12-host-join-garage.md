# P12 — Host & join games, real-life cars, a visual garage

**Goal:** the human's request of 2026-10-07 (cloud): "instead of PLAY you can HOST a game: in that
window configure the game, start it and wait for players; JOIN shows all created games to join and
then pick cars. Redesign the cars to be real-life cars, and make the car and seat selection more
fun, more visual and clear." One task = one commit, pushed to the cloud branch.

**Done when**
- The menu has HOST and JOIN; several games run on one server, each with its own track and
  settings; JOIN lists them live; leaving a game goes back to the menu.
- The roster looks like real-life car types (original, unbranded: CLAUDE.md rule 7), in budget.
- Picking a car and a seat is visual (car pictures in team colors, stats, clear seats).
- `/verify`, `/shots`, a real-browser host/join run and the reviewer pass.

## Tasks

- [x] **P12.1 Host and join.** Rooms = games: the server's always-open game plus up to
  `net.maxGames` hosted ones (name, track, mode, laps, bots, chaos; closed when empty);
  `GET /games.json`; per-game track; HOST window, JOIN list, Leave game; the phone pad picks a game.
- [ ] **P12.2 Real-life cars.** New car kit body types and parts (sedan, hatchback, SUV, pickup,
  sports car, van, …), lights, rims, windows; cars.json looks; budgets; `/shots garage`.
- [ ] **P12.3 Visual garage and seats.** Car pictures (rendered once, team colors) on the lobby
  cards, a garage window with stats to pick your team's car, big clear seat buttons.
- [ ] **P12.4 Review and ship.** Reviewer, fixes, docs, push, how to pull and start.
