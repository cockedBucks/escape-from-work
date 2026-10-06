# Game Design — Escape from Work

The name lives in ONE constant (`GAME_TITLE` in `packages/shared/src/constants.ts`).

## 1. The pitch

Two coworkers, one car, two laptops. One steers, one handles the pedals, and they sit next
to each other yelling. Short, loud, goofy races on office-themed tracks, with IT-joke items
that mess with the other teams. Easy to learn in 10 seconds, hard to master as a duo.

**Theme:** it is the end of the workday and every team is racing to get out of the building
first. Use it for flavor everywhere:
- Countdown "3… 2… 1… CLOCK OUT!" and the finish line is a giant glowing EXIT sign.
- Winning screen: "You escaped!". Last place gets the Rubber Duck of Shame and "Overtime!".
- Menu Quit button says "Clock out". The lobby is the "break room".
- Fake loading messages keep the IT humor ("Waiting for IT to approve your ticket…").

## 2. Design pillars (use these to settle arguments)

1. **Yelling is the feature.** Every mechanic should reward teammates talking to each other.
2. **Ten-second onboarding.** Each role uses 2–4 keys. No manual needed.
3. **Close races.** Short races (about 2.5 min), rubber-band items, no runaway leaders.
4. **Office in-jokes.** Tracks, items, cars and menus are IT/office humor.
5. **Runs on work laptops.** Mid-range laptops with integrated graphics, 60 fps, LAN only.

## 3. Players, teams and roles

- 4–16 players, 2–8 cars. One server on the LAN hosts one lobby. Everyone who opens the
  URL lands in that lobby. The first player is the **host** (can start races, change
  settings). Host passes to the next player if they leave.
- A **team** = one car = up to two players.
  - **Pilot**: steering, aiming items.
  - **Engineer**: gas, brake/reverse, nitro, firing items, managing engine heat.
  - **Solo**: a player alone in a car has all controls. Optional solo handicap in config
    (`solo.speedMultiplier`, default 1.0 = no handicap).
- Teams get a color (fixed per slot) and a generated IT-pun name the players can edit:
  "The Blue Screens", "404 Not Found", "Ctrl Freaks", "Have You Tried Turning It Off",
  "Packet Sniffers", "The Hotfixers", "Merge Conflict", "Cable Management".
- The lobby supports both styles: players freely join teams and seats, and the host has a
  **Shuffle** button that randomizes pairs. Nothing assumes fixed or shuffled teams.
- **Bots** can fill empty cars (host toggle). A bot car drives with both roles.
- **Spectators**: players who join during a race watch with a spectator camera and join
  the next race.

## 4. Controls (physical keys, any keyboard layout)

| Action | Pilot | Engineer | Solo |
|---|---|---|---|
| Steer | A / D or ← / → | — | A / D or ← / → |
| Gas | — | W or ↑ | W or ↑ |
| Brake / reverse | — | S or ↓ | S or ↓ |
| Nitro | — | Shift | Shift |
| Fire item | — | Space | Space |
| Aim item backward (hold) | Q | — | Q |
| Honk | H | H | H |
| Respawn on track | R | R | R |
| Switch camera | C | C | C |
| Scoreboard (hold) | Tab | Tab | Tab |
| Look around (cockpit cam) | mouse | mouse | mouse |
| Debug overlay / tuning panel (dev) | F3 / F2 | F3 / F2 | F3 / F2 |

Steering is smoothed: holding a key ramps the wheel up, releasing returns it to center.
Steering strength drops a little at high speed so the car stays controllable.

## 5. Driving and the teamwork loop

The core loop ties both roles together:

```
Pilot steers hard  +  Engineer taps brake  →  DRIFT  →  fills NITRO
Engineer fires NITRO  →  big speed  →  but heats the ENGINE
ENGINE at 100%  →  stall for ~2 s  →  Engineer must manage heat
SWAP LANE  →  roles swap + engine fully cooled  →  a strategic choice
```

### Car feel
Arcade, not simulation. Fast acceleration, strong grip, small slides, big forgiving walls
(bounce, no sticking). Jumps launch the car with a height value; landing squashes the body
(visual only). Starting values live in `config/tuning.json`; the human tunes them.

### Engine heat (Engineer's main decision)
- Heat comes from **overusing nitro**: about +40%/s while burning, so burning a full meter in
  one go overheats the engine. Burn it in bursts.
- Heat falls whenever nitro is off: slowly while driving (about −12%/s), faster off the gas or
  braking (about −35%/s). Inside the swap lane it resets to 0.
- At 100%: the engine **stalls** for about 2 s (smoke, sad engine sound), then restarts at
  about 60% heat.
- (First duo playtest, 2026-10-06: heat from plain full gas was "not fun" and was removed;
  `heat.risePerSec` can switch it back on.)

### Tandem drift (needs both players)
- Entry: the Engineer **taps** brake (short press) while the Pilot holds steering hard
  (≥ 70%) above 40% of top speed.
- While drifting the car slides wider and charges a **mini-turbo** in three levels, shown by
  spark colors: blue → orange → pink.
- Release: when the Pilot straightens out (for a quarter second, so a quick key tap does not
  end it) and the Engineer is on the gas, the car gets a short boost (longer for higher
  levels), and nitro charges.
- Solo players can do it alone, but it is harder with one hand set.

### Nitro (Engineer)
- A meter filled by drifting (and a little by item boxes). Shift burns it: strong speed boost,
  flames, and extra heat.

### Swap lane
- A marked side lane on lap 2 and later. Driving through it swaps Pilot and Engineer and
  fully cools the engine. The lane is a little slower, so it is a choice.
- Nobody moves seats: each laptop simply switches role, so whoever was steering now runs
  the pedals. The HUD flashes the new role and its keys.

### Respawn
- R (either player) or falling off: 1 s fade, the car returns to the last checkpoint facing
  forward, ghosted (no collisions) for 1 s.

## 6. Race format

- Default 3 laps, about 45 s per lap, about 2.5 min per race. Laps are configurable.
- Staggered 2-wide grid, up to 8 cars. Grid order: random for the first race, then reverse
  of the previous result (leaders start at the back).
- Countdown: "3… 2… 1… CLOCK OUT!"
- Laps count by passing sector checkpoints in order (no shortcut cheating across the infield).
- Positions update live. Wrong-way warning when driving backwards for a few seconds.
- When the winner finishes, everyone else has 30 s (configurable) to finish, then DNF.
- Results screen: positions, total time, best lap, awards, points. Buttons: Rematch, Lobby.

## 7. Items (chaos mode)

Item boxes ("Mystery Packets") sit in rows on the track and respawn after a few seconds.
A car holds one item. The Engineer fires it with Space; the Pilot holds Q to aim backward.
The host can switch chaos mode off for clean races.

Effects that hit a car affect BOTH players of that car (both screens).

| Item | Effect | Target | Duration | Blocked by Firewall |
|---|---|---|---|---|
| Reply-All | Envelope projectile, bounces off walls up to 3 times; hit = goofy spin-out | Forward, or backward with Q | flies 6 s | yes |
| Firewall | Shield around your car, absorbs one hit | Self | 8 s or 1 hit | — |
| Coffee Spill | Drops a slippery puddle behind you | Dropped | 20 s | — |
| Ctrl+Z | Rewinds your car 3 s back in time, clears bad effects on you | Self | instant | — |
| Blue Screen | Target's screens show a fake blue error screen, mostly opaque ("STOP CODE: TOO_MUCH_YELLING") | Car directly ahead | 2 s | yes |
| Lag Spike | Target's inputs arrive 0.8 s late | Car directly ahead | 4 s | yes |
| Control Swap | Target's Pilot keys now control pedals and Engineer keys steer | Race leader | 5 s | yes |
| Forced Update | Target stops with an update progress bar; both players mash any key to finish faster | Random car ahead (prefers top 3) | max 2.5 s | yes |

### Roll weights (rubber-banding)
Position bucket by race place: front = top 25%, back = bottom 25%, mid = the rest.
Each column sums to 100. Starting values (in `config/items.json`):

| Item | Front | Mid | Back |
|---|---|---|---|
| Reply-All | 30 | 30 | 15 |
| Firewall | 30 | 15 | 5 |
| Coffee Spill | 30 | 20 | 5 |
| Ctrl+Z | 10 | 10 | 10 |
| Blue Screen | 0 | 10 | 15 |
| Lag Spike | 0 | 10 | 15 |
| Control Swap | 0 | 5 | 20 |
| Forced Update | 0 | 0 | 15 |

## 8. Cars

Goofy versions of real car TYPES, original designs, no brands. Full visual specs are in
`docs/ART_STYLE.md`. Three stats, small differences so races stay fair:

- **speed** (top speed and acceleration), **grip** (cornering, drift control),
  **weight** (who wins bumps, how much items knock you around).
- Each stat is a multiplier around 1.0. Balance limits: every stat within 0.92–1.08, and
  bot lap times of all cars within ±3% of the roster median on every track.

Roster (8): Spoiler Alert, Cabbie, Bass Drop, Hot Fix, Packet Loss, Pocket Rocket,
Bug Report, Help Desk.

Each car has its own goofy horn. A driver bobblehead sits in each seat (coworker faces from
`assets/faces/`, or a drawn placeholder face).

## 9. Tracks

Tracks are data (`config/tracks/<id>.json`): a spline loop with widths, zones and props.
Lap target 40–55 s.

1. **Test Loop** (dev only, greybox): kidney-shaped loop, one hairpin, one ramp, one slick.
2. **The Office** (first real track):
   - Start/finish at reception → long straight between desk rows (open-plan) →
     hairpin around **Printer Island** → **kitchen chicane** with coffee slicks →
     ramp jump over the **boardroom table** → corridor with a risky narrow
     **server-closet shortcut** → **swap lane** through the IT help desk → reception.
   - Props: desks, rolling chairs, cubicle walls, monitors, plants, water cooler,
     coffee machine, printer, whiteboards with doodles.
3. **Server Room** (built in P10.1: `server-room.json`, ~1.3 km, ~48 s): cable-tray lanes, giant cooling fans that push you sideways,
   an icy cold aisle, blinking racks.
4. **Smart Oasis**: desert dunes (gentle jumps), a palm-tree oasis shortcut, a sandstorm
   event that lowers visibility for a lap.
5. **Motherboard**: tiny cars on a circuit board, driving on traces, jumps over capacitors,
   a loop around the CPU fan.

## 10. League and awards

- League data lives on the host PC (`data/league.json`), never in git.
- Points per race: 1st 10, 2nd 8, 3rd 6, 4th 5, 5th 4, 6th 3, 7th 2, 8th 1. Every human in
  the car gets the car's points. Bots score nothing. This works for fixed and shuffled teams.
- Also tracked: duo records (best pairs), best lap per track (car + both names),
  weekly cup (sum of the week's points). The week start day is configurable
  (`league.weekStartsOn`, default Sunday).
- Awards after each race (show up to 3 plus the Duck):
  Wall Hugger (most wall hits), Brake Abuser, Drift King, Item Sniper (most hits),
  Honk Champion, Clean Driver (fewest wall hits), and always the
  **Rubber Duck of Shame** for last place.

## 11. Menus and screens

- **Main menu**: cars spinning on a turntable, wobbly buttons, a big HONK button, fake IT
  loading messages ("Waiting for IT to approve your ticket…", "Rebooting the coffee
  machine…"), and company images from `assets/menu/` in a slideshow.
- **Lobby**: name, team list with colors, a car picker per team (either player of the car can
  change it; two teams may pick the same car), seat picker (Pilot / Engineer), solo indicator,
  Shuffle (host), bots toggle, chaos toggle, track and laps (host), Ready, Start (host).
  A short "how to play" card for each role.
- **HUD**: chase cam uses a DOM HUD; cockpit cam puts speed, heat, nitro, item and lap/place
  on the dashboard, plus a small rear-view mirror.
- **Results**: podium with bobbleheads, times, awards, points, Rematch / Lobby.
- **Settings**: quality preset (Low/Medium/High), volume, default camera, show FPS, key help.

## 12. Open questions (the agent asks at the matching phase)

- Fixed teams vs shuffled teams for the league (both supported; decide the default).
- Prediction on the client (Phase 2 fun gate decides if steering feels laggy without it).
