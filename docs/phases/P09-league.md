# P9 — League and awards

**Goal:** the office rivalry layer: points, records, a weekly cup, goofy awards and the
Rubber Duck of Shame, stored safely on the host PC.

**Done when**
- Every finished race updates `data/league.json` atomically (survives a server crash).
- Points per player, duo records, best lap per track, weekly cup with configurable week start.
- Results show points earned and up to 3 awards plus the Rubber Duck of Shame.
- A League screen in the menu shows the week, all-time table, records and duos.
- Tests for scoring, awards, week boundaries and the store.

## Tasks

- [x] **P9.1 League store.** Versioned JSON schema, atomic writes, load with validation, backup of
  a corrupt file instead of crashing. Tests.
- [x] **P9.2 Scoring.** Points table from config, every human in the car scores, bots never score.
  Duo records, best laps per track with car and both names. Weekly cup with
  `league.weekStartsOn` (default Sunday). Tests including week boundaries.
- [x] **P9.3 Awards.** Counters from sim events (wall hits, brake time, drift levels, item hits,
  honks). Award rules in config. Rubber Duck of Shame for last place every race. Tests.
- [x] **P9.4 League UI.** Results show points and awards; League screen in the menu (this week,
  all time, records, best duos). Update scenario `results`; add `league` scenario.
- [~] **HUMAN GATE — a league week.** (deferred)
  1. Play normally for a few days. Look at the League screen.
  2. Reply: anything unfair, missing or not funny enough? Which awards should change?
- [ ] **P9.5 Phase end.** Reviewer, fixes, `git tag p9-done`, report.
