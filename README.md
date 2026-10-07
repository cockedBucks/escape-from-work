# Escape from Work

A goofy office racing game for the Smart Oasis LAN. Teams of two share one car: the **Pilot**
steers, the **Engineer** runs the pedals, nitro and items, each on their own laptop, sitting
next to each other. Up to 16 players (8 cars); bots can fill the empty cars. A player without a
partner drives **solo** with all the controls.

Runs in Chrome or Edge. One PC hosts; nobody else installs anything. No internet needed.

---

## 1. Play it in the office

1. **Host PC, once:** install Node.js LTS (22.12+) and Git, clone this repo, add the firewall
   rule. Step by step: [`docs/LAN.md`](docs/LAN.md).
2. **Host PC, every day:** double-click **`start-server.bat`** (Windows) or run
   `./start-server.sh` (macOS/Linux). It installs what is missing, builds and starts the game,
   then prints the address, for example `http://192.168.1.23:2567`.
3. **Everyone:** open that address. Type your name, pick a face and a seat (Pilot, Engineer or
   Solo) in a team, press **Ready**.
4. **The host** picks the track, laps, chaos items and bots, then presses **Start**.

Stop the server with **Ctrl+C**. The league is saved on the host PC (`data/league.json`) with
a daily backup in `data/backups/`.

## 2. Controls

Keys are physical positions, so they work with any keyboard layout (Arabic too).

| Who | Keys |
|---|---|
| **Pilot** | **A / D** (or ← / →) steer · steer hard while the partner taps **S** = **DRIFT** · hold **Q** to aim an item backward |
| **Engineer** | **W** gas · **S** brake / reverse (tap while turning = DRIFT) · **Shift** nitro (heats the engine) · **Space** use the item |
| **Solo** | everything above, by yourself |
| **Everyone** | **H** honk · **R** respawn · **C** chase ↔ cockpit view (mouse to look) · hold **Tab** scoreboard · **Esc** lobby · **?** key help · **F3** FPS and ping |

The duo loop: drift → fills nitro → nitro heats the engine → the purple **swap lane** (from
lap 2) trades seats and cools it. Too much nitro and the engine stalls for 2 s.

**No second laptop?** Open the same address on a phone and press **📱 Use this phone as a
controller** (or add `?pad` to the address). Pick your seat: you get big touch buttons for your
role (Pilot: ◀ ▶; Engineer: gas, brake, nitro, item) and watch the race on your teammate's laptop.

**Extras** (Settings ⚙): race the see-through **ghost** of your best lap, holiday **decorations**
(Ramadan, Eid, Halloween, winter snow), and the whole game in **العربية** (Language). A close
finish gets a slow-motion **photo finish** replay.

## 3. Tracks

| Track | What is special |
|---|---|
| **The Office** (default) | desk-row straight, Printer Island hairpin, coffee slicks, a jump over the boardroom table, the narrow Server Closet shortcut |
| **Server Room** | giant cooling fans that shove you sideways, an icy cold aisle, blinking racks |
| **Smart Oasis** | desert dune jumps, the Palm Oasis shortcut past the pond, a sandstorm on lap 2 |
| **Motherboard** | tiny cars on copper traces, jumps over chips between capacitors, a loop around the CPU fan |
| **The Break Room** | a small arena for **Battle** mode (host: 🏁 Race / 💥 Battle in the lobby): 3 lives, item hits take one, last car standing wins |
| Test Loop | the greybox test track (dev only, not in the picker) |

Chaos items (host toggle): Reply-All, Firewall, Coffee Spill, Ctrl+Z, Blue Screen, Lag Spike,
Control Swap, Forced Update. The league: points per race, a weekly cup, duo records, lap
records and silly awards (menu → 🏆 League).

## 4. Commands

Run in a terminal in the game folder (`npm install` once after cloning, or just use the start
script).

| Command | What it does |
|---|---|
| `start-server.bat` / `./start-server.sh` | office start: install if needed, build, start, print the LAN address |
| `npm start` | build the page and start one server for the office (port 2567) |
| `npm run dev` | server + Vite page with hot reload; open Vite's **Network** URL (port 5173); **F2** tuning panel |
| `npm run verify` | typecheck + all tests + a short headless bot race, one summary line |
| `npm test` | tests only |
| `npm run test:load` | 8 bot cars (16 clients) race 3 laps through the real server, prints tick times (~2 min) |
| `npm run soak` | 16 bot clients race back to back for 10 min: memory growth and tick times |
| `npm run shots -- chase --track motherboard` | screenshots of a scenario → `artifacts/shots/` |
| `npm run track:check -- smart-oasis` | check a track file and run bot laps on it |
| `npm run bots -- --cars 4 --seconds 60` | bot players join a running game (`--url http://<ip>:<port>` for another PC) |
| `npm run faces` | list the face photos in `assets/faces/` for the face picker (after adding photos) |
| `npm run jitter` | how smoothly your car is drawn (stutter check, real browser) |

All tuning (car feel, items, league points, awards) lives in `config/` as JSON, checked on load.
Add `?quality=low` to the URL on a slow laptop, or pick a quality in Settings.

## 5. Your own content

- Coworker faces (bobbleheads): photos in `assets/faces/` (only people who agreed), then
  `npm run faces`. Company images for the menu slideshow: `assets/menu/`. Both folders stay on
  the host PC and are never committed.
- New tracks, cars and items are data files in `config/` (see `docs/ARCHITECTURE.md`).

## 6. Building it further with Claude Code

The game was built by Claude Code from the docs in this repo, phase by phase
(`docs/ROADMAP.md`). To continue: open a terminal here, run `claude`, type `/next`.

| You type | What happens |
|---|---|
| `/next` | the next task: build it, test it, commit it, update `docs/PROGRESS.md` |
| `/feedback <what felt wrong>` | turns playtest notes into tuning changes |
| `/add-track`, `/add-car`, `/add-item` | new content, validated with bot laps |
| `/handoff` | saves exactly where things stand before you stop |

Tips for a Pro plan: one phase per conversation (`/clear` between), specific feedback
("the car slides too much after the jump"), **Esc** at once if it heads the wrong way.

## 7. Where things are

| Path | What |
|---|---|
| `config/` | all tunable data: `tuning.json`, `cars.json`, `items.json`, `tracks/*.json` |
| `packages/shared/` | deterministic sim, track math, race rules, items, bots, league scoring |
| `packages/server/` | the authoritative game server (Colyseus), lobby, league store |
| `packages/client/` | Three.js page: rendering, input, cameras, UI, audio |
| `scripts/` | start, shots, bots, soak, track check, faces |
| `docs/` | design (`GAME_DESIGN.md`), tech (`ARCHITECTURE.md`), look (`ART_STYLE.md`), tests (`TESTING.md`), LAN guide (`LAN.md`), decisions, progress |
| `CLAUDE.md`, `.claude/` | the rules, skills and reviewer agent Claude Code uses |

## 8. Known issues

See "Known issues" in [`docs/PROGRESS.md`](docs/PROGRESS.md). If other laptops cannot open the
game, it is almost always the Windows firewall: [`docs/LAN.md`](docs/LAN.md) section 2.
