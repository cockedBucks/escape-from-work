---
name: verify
description: Run the project's automated checks (typecheck, tests, headless bot race) and report only failures. Use before every commit and before calling a task done.
---

# /verify

1. Run `npm run verify`.
   - Before the Phase 0 scaffold exists, run whatever exists (`npx tsc -b`, `npx vitest run`).
     If nothing exists yet, say so and skip.
2. Report only: failing check names, the first few lines of each error, and one summary line
   (for example `verify: 142 passed, 2 failed (car.test.ts, room.test.ts)`).
   Never paste full logs.
3. Fix failures caused by the current change and run again.
4. A failure that existed before this change and is unrelated: do not fix it silently.
   Add it to "Known issues" in `docs/PROGRESS.md` and tell the human.
5. A golden test (lap time window, replay hash) failing after an intended feel change:
   update the expected values and state the old → new numbers in the commit message.
