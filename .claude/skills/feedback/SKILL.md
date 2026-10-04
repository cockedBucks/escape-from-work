---
name: feedback
description: Turn the human's playtest feedback into changes, tuning values first and code second.
argument-hint: "<what felt wrong or what you want>"
disable-model-invocation: true
---

# /feedback — playtest notes in, better game out

Feedback from the human: `$ARGUMENTS`

1. Split the feedback into separate points. For each, find the tuning keys that control it
   (the tuning table in `docs/ARCHITECTURE.md` maps feelings to keys, for example
   "twitchy steering" → `car.steerRiseRate`, `car.steerAtTopSpeed`).
2. Prefer changing numbers in `config/` over changing code. Use moderate steps (15–30%).
   Show a small table: key, old, new, why.
3. Only if no key can fix a point: make a small, tested code change, or add a new tuning
   key with a schema entry.
4. Run `/verify`. If a golden window breaks because of the intended change, update it and
   say so.
5. Add an entry to "Playtest log" in `docs/PROGRESS.md`: date, feedback, what changed.
6. Commit: `tune: <short summary>`.
7. Tell the human what to try next time (1–3 bullets). If the change is a guess, say so
   and suggest the live tuning panel (F2 in dev builds) to fine-tune it themselves.
