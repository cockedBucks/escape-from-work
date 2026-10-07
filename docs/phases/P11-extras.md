# P11 — Extras after v1.0 (the "Later ideas")

**Goal:** build the roadmap's "Later ideas" while the human cannot playtest (human, 2026-10-07:
"finish the project … finish all things and then I will test"). Every extra can be turned off,
so the v1.0 game stays as tested. One task = one commit, pushed to the cloud branch.

**Done when**
- Each extra below works, has tests, is in the docs, and passes `/verify` (+ `/shots` if visual).
- Final sweep: all shots scenarios, `track:check` on every track, `test:load`, `soak`, reviewer.

Not built: **a public internet server.** It needs a hosting account, a domain, HTTPS and abuse
protection the human has to choose and pay for, and it breaks pillar 5 / ARCHITECTURE "LAN only".
Left in "Later ideas" for the human to decide.

## Tasks

- [x] **P11.1 Ghost of your best lap.** The page records your car's path each lap and keeps your
  best lap per track (this browser); in later races a see-through ghost car drives it. Settings
  toggle. Visual only (the sim never sees it).
- [x] **P11.2 Photo-finish replay.** When 2nd place finishes within a few tenths of the winner, a
  slow-motion replay from a camera at the finish line, with "PHOTO FINISH! by 0.12 s", for
  players already finished and spectators; drivers still racing get a toast.
- [x] **P11.3 Seasonal decorations.** Date ranges in config (winter, Halloween, Ramadan, …) put
  original decoration props beside every track (and snow in winter). Settings: Auto / Off / pick one.
- [x] **P11.4 Arabic UI.** All screens in English or Arabic (right-to-left), language picker in
  settings (default: the browser's language).
- [x] **P11.5 Phones as controllers.** A phone opens the same URL and becomes a controller: pick a
  car and seat, then big touch buttons for that role (the teammate's laptop shows the race). Two
  people can share one laptop.
- [x] **P11.6 Battle mode.** Host picks Race or Battle. Battle: every car has 3 lives, item hits take
  one, last car standing (or most lives at the time limit) wins. A small arena track. Bots play it.
  Battle results are not league races.
- [x] **P11.7 Final sweep.** All shots, all tracks, load + soak, reviewer on `p10-done..HEAD`, fixes,
  docs, final report, then the deferred human tests (with P11 checks added).
