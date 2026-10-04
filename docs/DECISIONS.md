# Decisions

One line per decision: `Dnnn (date, phase): decision — why`. Newest at the bottom.
Big decisions that change ARCHITECTURE or GAME_DESIGN need the human's OK first.

- D001 (2026-10-04, kit): Pure web stack (TypeScript, Three.js, Vite, Colyseus, Node), no game engine — everything is text, so agents can read, change and test all of it; runs in any browser.
- D002 (2026-10-04, kit): Server-authoritative sim from day one, even for solo driving — one code path; split control in P2 only adds a second client.
- D003 (2026-10-04, kit): Shared deterministic sim with seeded RNG and fixed timestep — enables headless tests, golden lap windows and replay checks.
- D004 (2026-10-04, kit): One lobby per server instead of room codes — one office, one server; fewer edge cases.
- D005 (2026-10-04, kit): Tracks are spline data with zones as lap fractions — tracks can be written and validated as text by agents.
- D006 (2026-10-04, kit): Cars and props built procedurally from data, no 3D model files at first — no art pipeline needed; original designs by construction.
- D007 (2026-10-04, kit): Procedural Web Audio instead of sound files — zero assets, small download, per-car horns from presets.
- D008 (2026-10-04, kit): League stored as an atomic JSON file — no database server, no native modules, installs on Windows without build tools.
- D009 (2026-10-04, kit): Screenshots via playwright-core with the installed Chrome/Edge — no large browser download on work laptops.
- D010 (2026-10-04, kit): Keyboard via `KeyboardEvent.code` — works with Arabic and other keyboard layouts.
- D011 (2026-10-04, kit): Client-side prediction postponed until the P2 fun gate — LAN latency may make it unnecessary.
- D012 (2026-10-04, kit): League points go to each player, not to fixed teams — works whether teams are fixed or shuffled.
- D013 (2026-10-04, kit): Weekly cup week start is configurable, default Sunday — matches a Sunday–Thursday work week; change in `config/tuning.json` if needed.
- D014 (2026-10-04, kit): Game name is **Escape from Work** (chosen by the human; replaces the working title Ctrl+Alt+Drive). Theme: racing to clock out first.
- D015 (2026-10-04, P0.2): `.gitattributes` forces LF line endings (CRLF only for `.bat`/`.cmd`) — the repo is edited on Windows but must behave the same on macOS/Linux.
- D016 (2026-10-04, P0.2): Branch `main`, remote `origin` = github.com/cockedBucks/escape-from-work (set by the human). The agent never pushes; the human pushes when they want.
