# P8 — Menu and UX

**Goal:** the goofy front door and a smooth first-time experience, so a new coworker can
join and play without anyone explaining.

**Done when**
- Main menu per `docs/GAME_DESIGN.md` section 11 with company images from `assets/menu/`.
- Settings (quality, volume, default camera, show FPS, key help) saved locally.
- First-race onboarding shows each player their role's keys.
- Lobby, HUD and results match `docs/ART_STYLE.md`. `/shots menu lobby results garage` pass.

## Tasks

- [x] **P8.1 Main menu.** Car turntable (showroom cam), wobbly buttons, big HONK button, rotating
  fake IT loading messages, slideshow of images in `assets/menu/` (manifest built like faces).
  Scenario `menu`.
- [x] **P8.2 Settings.** Quality preset, master/engine/sfx volume, default camera, show FPS,
  key help page. Stored in `localStorage` with safe fallbacks.
- [x] **P8.3 Onboarding.** First race per browser: role card with keys during the countdown,
  "?" opens key help any time, swap-lane and item first-time hints.
- [ ] **P8.4 UI polish.** Local `@fontsource` font, consistent buttons/panels/colors, readable at
  1366×768, results podium with bobbleheads, smooth screen transitions.
- [ ] **P8.5 Shots.** `/shots menu lobby results garage`; fix issues.
- [ ] **HUMAN GATE — first-time players.**
  1. Find 2 coworkers who have never seen the game. Give them only the URL. Watch, do not help.
  2. Reply: where they got stuck, what made them laugh, what they asked.
- [ ] **P8.6 Phase end.** Reviewer, fixes, `git tag p8-done`, report.
