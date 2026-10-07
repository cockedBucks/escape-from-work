# Art Style — Escape from Work

## 1. The look in one line

**Chunky toy-box low-poly**: flat-shaded, bright, rounded-feeling shapes, oversized heads,
like office supplies came to life. The cars are real-life car types (P12.2), low-poly and
unbranded, with goofy bobbleheads poking out of the sunroof. Goofy but clean.

## 2. Rules

- Flat shading, solid colors, no realistic textures. The only image textures are faces,
  menu images, and small canvas-drawn decals (team numbers, signs, doodles).
- Exaggerate one thing per object (giant spoiler, huge wheels, wobbly head).
- Silhouettes must read from behind (chase cam) and from above (track overview).
- Soft, warm lighting: one hemisphere light + one directional "sun". Light fog for depth.
- Shadows: blob shadows under cars on Low/Medium; one small shadow map on High only.
- Everything is original. No real brands, logos, mascots or recognizable copyrighted designs.
- UI: rounded, bold, playful. One local rounded font from `@fontsource`. Big readable numbers.
  Buttons wobble on hover. Never tiny text.

## 3. Palette

| Use | Hex |
|---|---|
| Sand / background | `#F4EBDC` |
| Road | `#3D4A5C` |
| Road lines / curbs | `#FFF6D6`, `#E63946` |
| Office carpet | `#8C9BB0` |
| Desk wood | `#E9D8B4` |
| Cubicle panels | `#8AA0B8` |
| Plants | `#4CAF50` |
| Metal / printer | `#D9DDE3` |
| Glass | `#BFE3F2` |
| Tires | `#2B2B2B` |
| UI dark / UI light | `#1E2230` / `#FFFFFF` |

Team colors (slot order), each car also shows its team number on the roof:

| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|
| `#E63946` red | `#1D7FE0` blue | `#FFB703` yellow | `#2A9D8F` teal | `#9B5DE5` purple | `#FB8500` orange | `#06D6A0` mint | `#F15BB5` pink |

## 4. Car kit

Cars are built in code from data in `config/cars.json`: a body type and parts. Body types are
real-life car types (P12.2): hatchback, sedan, pickup, muscle car, SUV, city car, sports car and
van. Each type is drawn as a side outline (hood, shoulders, deck, with wheel arches cut around
the wheels) and a cabin outline, extruded across the car (`render/sideProfile.ts`, shapes in
`render/look.ts` `CAR_BODIES`). Real-life details: tinted side windows split by pillars,
windshield and rear window, side mirrors, headlights, grille, taillights, dark bumpers with
plates, dark sills, rims. Parts: spoiler, taxi roof sign, speaker stack, hood scoop, roof box
with rails, spare wheel, satellite dish, ladder, racing stripes. No real brands, badges, logos
or recognizable model designs. The kit merges the body into one vertex-colored mesh.

- Wheels: about 1.15× realistic, tire + rim, flush with the body sides; they spin and steer.
- Body panels and pillars: team color. Trim, glass, lights and tires: kit colors.
- Two bobblehead drivers per car poking out of an open sunroof (left seat Pilot, right seat
  Engineer; solo = one head plus an empty seat with a rubber duck). Heads are about 1.6× scale
  on a spring and wobble.
- The team number sits on the roof behind the heads, or on the hood when the roof is short or
  carries a part.
- Face textures from `assets/faces/` mapped on the front of the head sphere; placeholder is a
  drawn smiley with glasses.

### Car roster

| id | Name | Type | Signature feature | Stat lean |
|---|---|---|---|---|
| spoiler-alert | Spoiler Alert | hot hatchback | a big rear wing on posts | balanced |
| cabbie | Cabbie | taxi sedan | yellow taxi sign on the roof | balanced, slight grip |
| bass-drop | Bass Drop | double-cab pickup | speaker stack in the open bed | heavy |
| hot-fix | Hot Fix | muscle car | long hood with a scoop, fastback | speed |
| packet-loss | Packet Loss | family SUV | roof box on rails, spare wheel on the tailgate | heavy, grip |
| pocket-rocket | Pocket Rocket | tall city car | short and boxy on big wheels | light, grip |
| bug-report | Bug Report | low sports car | racing stripes over hood, roof and deck | light |
| help-desk | Help Desk | IT support van | satellite dish and ladder on the roof | heavy |

## 5. Prop kit

Built from primitives, instanced when repeated:
- **Office**: desk, rolling chair, cubicle wall, monitor, keyboard, printer, water cooler,
  coffee machine, potted plant, whiteboard, filing cabinet, reception desk.
- **Server Room**: rack (blinking lights as emissive dots), cable tray, giant fan, AC unit.
- **Oasis**: palm tree, dune, rock, tent, oasis pond.
- **Motherboard**: chip, capacitor, resistor, trace pad, CPU fan.
- **Track**: curbs, arrows, item box ("Mystery Packet": a floating, rotating envelope-cube),
  start gate, swap-lane gate, checkpoint banners.

## 6. Juice (makes it feel alive)

Dust puffs on drift, colored spark levels (blue/orange/pink), nitro flames, smoke on stall,
squash and stretch on landing, small camera shake on hits, confetti at the finish, honk
speech bubble ("HONK!"), heads wobbling on bumps, swap-lane flash with the new role's keys.

## 7. Performance budget (target: 60 fps at 1080p on Intel Iris Xe-class integrated GPUs)

| Metric (in view) | Low | Medium | High |
|---|---|---|---|
| Draw calls | ≤ 100 | ≤ 150 | ≤ 200 |
| Triangles | ≤ 150k | ≤ 250k | ≤ 400k |
| Pixel ratio cap | 1.0 | 1.25 | 1.5 |
| Shadows | blob | blob | 1 × 1024 map |
| Rear-view mirror | off | every 2nd frame, low res | every frame, low res |
| Particles | reduced | normal | normal |

Per car: ≤ 1,500 triangles and ≤ 6 draw calls (parts merged per material).
Textures: faces ≤ 256×256, decals drawn to small canvases. No post-processing on Low.

`/shots` compares `window.__game.stats()` with this table. Real FPS is measured by the human
on a real laptop with the F3 overlay (headless FPS is not meaningful).
