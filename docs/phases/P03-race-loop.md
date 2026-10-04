# P3 — Lobby and race loop

**Goal:** real races. A lobby with teams and seats, a countdown, laps, positions, a finish,
results and a rematch, for up to 16 players (8 cars), with bots filling gaps.

**Done when**
- Lobby → countdown → race → results → lobby works repeatedly without restarting the server.
- Host controls: shuffle, bots on/off, laps, start. Host passes on if the host leaves.
- Laps count by sectors in order; live positions; wrong-way warning; finish window and DNF.
- Late joiners spectate. Tab shows the scoreboard.
- An 8-car / 16-client bot race finishes in an integration test; server tick stays fast.
- `/shots lobby results chase` pass.

## Tasks

- [ ] **P3.1 Race state machine.** Phases lobby / countdown / racing / results in shared rules;
  server drives them. Host = first player, passes on leave. Tests for every transition.
- [ ] **P3.2 Lobby UI.** Replaces the temporary join screen: name (remembered locally), team list
  with slot colors and generated IT-pun names (editable), seat picker, solo indicator, Ready,
  host controls (Shuffle, bots, laps, Start). Scenario `lobby`. `/shots lobby`.
- [ ] **P3.3 Race rules.** Countdown "3… 2… 1… CLOCK OUT!", sector-ordered laps, live positions,
  wrong-way detection, finish order, post-winner finish window and DNF, grid order (random
  first race, then reversed results). Tests.
- [ ] **P3.4 Bot cars.** Server-side bot driver controls empty cars when the host enables bots.
- [ ] **P3.5 Spectators and scoreboard.** Late joiners watch with a spectator cam that cycles cars;
  Tab scoreboard (place, team, lap, gap).
- [ ] **P3.6 Results screen.** Positions, total time, best lap; Rematch and Lobby buttons.
  Scenario `results`. `/shots results`.
- [ ] **P3.7 Load test.** Integration test: 8 cars driven by 16 bot clients finish a 3-lap race.
  Record average and max server tick time; it must stay well under the 16.7 ms tick budget.
- [ ] **HUMAN GATE — first real race.**
  1. Get 4+ people (or fewer + bots on). Everyone opens the LAN URL, forms teams, picks seats.
  2. Race 3 times. Try Shuffle, Rematch, someone joining mid-race.
  3. Reply: what was confusing in the lobby, what broke, what was fun.
- [ ] **P3.8 Phase end.** Reviewer, fixes, `git tag p3-done`, report.
