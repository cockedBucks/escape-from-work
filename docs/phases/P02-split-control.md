# P2 — Split control (the fun gate)

**Goal:** answer the biggest question early. Two players on two laptops drive ONE car, and
it feels responsive and fun. Bots prove it automatically; a coworker proves it for real.

**Done when**
- Players pick a car slot and a seat (Pilot / Engineer / Solo) on a simple temporary join screen.
- The server merges inputs by role and rejects fields a role may not send.
- Several cars drive at once with car-to-car bumps.
- A partner disconnecting turns the other player solo; rejoining restores roles.
- `npm run bots -- --cars 4` drives 4 cars with 8 separate bot clients (pilot + engineer each).
- `docs/LAN.md` explains hosting on the office network, including the Windows firewall.
- The FUN GATE is passed and its decision recorded.

## Tasks

- [x] **P2.1 Players, cars and seats.** State for players (name, car slot, seat, connected) and
  cars. Temporary join screen: name, car slot, seat. Shared seat rules + tests.
- [x] **P2.2 Input merge with permissions.** Shared `net/` role permission table and merge
  function (see `docs/ARCHITECTURE.md` input merge table). Server applies it each tick.
  Tests: Pilot cannot throttle, Engineer cannot steer, solo gets all.
- [x] **P2.3 Multiple cars.** Spawn grid from the track start, car-to-car collisions by weight,
  per-car chase cam (each client follows its own car). Tests.
- [x] **P2.4 Disconnect and rejoin.** Reconnection window from config; remaining partner becomes
  solo; rejoin restores seats. Integration tests.
- [x] **P2.5 Bot clients.** `scripts/bots.mjs` + `npm run bots -- --cars N --seconds S [--url]`:
  for each car, one pilot-bot client and one engineer-bot client over real WebSockets.
  Integration test version in `tests/`: 2 cars, 4 clients, 1 lap completes.
- [x] **P2.6 Latency visibility.** Overlay shows ping, snapshot age, and measured
  input-to-motion delay (input seq echoed back with the state that applied it).
  Interpolation delay and patch rate tunable live.
- [x] **P2.7 LAN guide.** `docs/LAN.md`: find the host IP, the Windows firewall rule for the
  game port (command + GUI steps), testing from another laptop, common problems. Confirm
  `npm start` works as the production path.
  Known from the P0 gate (D030): office Wi-Fi shows up as a **Public** network and the Node.js
  allow rule covers only Private/Domain. The fix that worked (admin terminal):
  `New-NetFirewallRule -DisplayName "Escape from Work (game ports)" -Direction Inbound -Protocol TCP -LocalPort 2567,5173 -RemoteAddress LocalSubnet -Action Allow -Profile Any`
  (undo: `Remove-NetFirewallRule -DisplayName "Escape from Work (game ports)"`).
- [x] **HUMAN GATE — FUN GATE (the important one).**
  1. Host: `npm start` on one laptop (or `npm run dev`). Second laptop: open the LAN URL.
  2. Both join the same car: one Pilot, one Engineer. Sit next to each other. Drive 10 minutes.
  3. Also try: one of you closes the tab mid-lap and reopens it.
  4. Reply with:
     - Does steering feel instant enough? (yes / a bit laggy / very laggy)
     - Is it fun? Did you yell? What was the best and worst moment?
     - The input delay number from the F3 overlay.
- [x] **P2.8 Act on the fun gate.** Record the answers in DECISIONS. If steering felt laggy,
  add client-side prediction for your own car (own fresh input + teammate's last known input),
  with tests. If it felt fine, record "no prediction for now". Apply tuning feedback.
- [ ] **P2.9 Phase end.** Reviewer, fixes, `git tag p2-done`, report.
