# Art Style — Escape from Work

## 1. The look in one line

**Chunky toy-box low-poly**: flat-shaded, bright, rounded-feeling shapes, oversized wheels
and heads, like office supplies and toy cars came to life. Goofy but clean.

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

Cars are built in code from data in `config/cars.json`: a body preset (hatch, sedan, pickup,
van, mini, round, muscle) with proportions, plus parts (spoiler, roof sign, speaker stack,
roof box, dish, ladder, wind-up key, hood scoop). The kit merges parts per material.

- Wheels: oversized (about 1.3× realistic), visible from the chase cam, spin and steer.
- Body panels: team color. Trim, glass and tires: palette colors.
- Two bobblehead drivers per car (left seat Pilot, right seat Engineer; solo = one head
  plus an empty seat with a rubber duck). Heads are about 1.6× scale on a spring and wobble.
- Face textures from `assets/faces/` mapped on the front of the head sphere; placeholder is a
  drawn smiley with glasses.

### Car roster

| id | Name | Type | Signature feature | Stat lean |
|---|---|---|---|---|
| spoiler-alert | Spoiler Alert | hatchback | a 3-tier spoiler taller than the car | balanced |
| cabbie | Cabbie | taxi sedan | huge wobbling roof sign | balanced, slight grip |
| bass-drop | Bass Drop | pickup | speaker stack in the bed that thumps with the engine | heavy |
| hot-fix | Hot Fix | muscle car | hood twice as long as normal, big scoop | speed |
| packet-loss | Packet Loss | minivan | giant roof box that rattles | heavy, grip |
| pocket-rocket | Pocket Rocket | tiny city car | enormous wheels | light, grip |
| bug-report | Bug Report | round beetle-style car | big wind-up key on the back | light |
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
