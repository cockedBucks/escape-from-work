---
paths:
  - "**/*.test.ts"
  - "tests/**"
  - "scripts/**"
---

# Test and script rules

- Vitest. Unit tests live next to the code (`foo.test.ts`). Multi-package integration
  tests live in `tests/`.
- Tests are fast and deterministic: step the sim directly instead of waiting real time.
  No sleeps. Seed every RNG.
- Golden tests guard game feel: bot lap-time windows per track and car, and a replay
  determinism hash. Change their expected values only when a feel change is intended,
  and say so in the commit message.
- Scripts are Node `.mjs`, cross-platform: `path.join`, no shell pipes, no bash-only syntax,
  `process.exitCode` for failures.
- Output is terse: dot reporter, then only failures and one summary line.
- `artifacts/` holds generated output (screenshots, stats, bot logs). Never commit it.
