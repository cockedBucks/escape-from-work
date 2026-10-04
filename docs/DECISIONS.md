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
- D017 (2026-10-04, P0.3): Pinned versions (exact, `.npmrc` save-exact): typescript 7.0.2, tsx 4.23.15, vitest 5.0.3, zod 4.6.5, @colyseus/core 0.18.18, @colyseus/ws-transport 0.18.4, @colyseus/schema 5.0.36, @colyseus/sdk 0.18.5, express 5.2.1, three 0.186.1, vite 8.3.2, lil-gui 0.21.0, concurrently 10.0.5, playwright-core 1.63.0, @fontsource/fredoka 5.3.0; types: @types/node 24.19.1 (matches Node 24), @types/express 5.0.6, @types/three 0.186.0.
- D018 (2026-10-04, P0.3): Server uses Colyseus's parts (`@colyseus/core` + `@colyseus/ws-transport` + `@colyseus/schema`) instead of the `colyseus` meta package — the meta package force-installs Redis drivers, auth and a native uWebSockets binary we never use. Client SDK is `@colyseus/sdk` (the 0.18 name; `colyseus.js` stopped at 0.16).
- D019 (2026-10-04, P0.3): npm 11 install scripts stay unapproved (esbuild, msgpackr-extract). Both work without them (esbuild's binary comes as an optional package; msgpackr falls back to pure JS), so installs need no native build tools.
- D020 (2026-10-04, P0.3): TS uses `module: preserve` + `moduleResolution: bundler`, no emit; workspace packages export their `src/*.ts` directly. The server runs through tsx, the client through Vite, so nothing needs a compile step or `.js` import suffixes.
