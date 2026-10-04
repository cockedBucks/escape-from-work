# P10 — More tracks and ship v1.0

**Goal:** three more themed tracks, an easy way to run the game in the office every day,
and a final stability pass.

**Done when**
- Server Room, Smart Oasis and Motherboard tracks pass `track:check` and are in the track list.
- Starting the server is one double-click (Windows) or one command (macOS/Linux).
- A 10-minute 16-bot soak test shows no memory growth and stable tick time.
- `docs/LAN.md` is complete. Tag `v1.0`.

## Tasks

- [ ] **P10.1 Server Room.** Props (racks, cable trays, fans, AC), fan push zones, icy cold-aisle
  zone, cable-lane layout. `/add-track`.
- [ ] **P10.2 Smart Oasis.** Props (palms, dunes, rocks, tents, pond), dune jumps, oasis shortcut,
  sandstorm event (fog for one lap, config-driven). `/add-track`.
- [ ] **P10.3 Motherboard.** Props (chips, capacitors, resistors, CPU fan), trace-road look,
  capacitor jumps, CPU-fan loop. `/add-track`.
- [ ] **P10.4 Office deployment.** `start-server.bat` and `start-server.sh` (install if needed,
  build, start, print URLs). `docs/LAN.md` final: daily start, firewall, troubleshooting,
  updating the game with git, backing up `data/league.json`.
- [ ] **P10.5 Soak test.** Script: 16 bot clients, 10 minutes of back-to-back races; record memory
  and tick time; fix leaks.
- [ ] **P10.6 Final pass.** All scenarios through `/shots`, all golden tests, README refreshed,
  known issues listed.
- [ ] **HUMAN GATE — launch party.**
  1. Host on the office PC with the start script. Get as many people as possible. Race all tracks.
  2. Reply: anything broken, plus the next features you want (see "Later ideas" in the roadmap).
- [ ] **P10.7 Release.** Reviewer, fixes, `git tag v1.0`, final report.
