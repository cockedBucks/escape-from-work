---
name: next
description: Continue building the game. Does the next roadmap task, verifies, commits and updates progress. Run at the start of every work session.
argument-hint: "[task-id | phase]"
disable-model-invocation: true
---

# /next — do the next piece of work

Argument: `$ARGUMENTS`
- empty → keep going: do task after task, across phase ends too, and stop only when a
  human is needed (HUMAN GATE, a decision for the human, a blocker). The human asked for this.
- `one` → do exactly ONE task, then stop.
- `phase` → keep doing tasks until the phase is done, a HUMAN GATE is reached, or the
  context is getting large (then run `/handoff`).
- a task id like `P2.4` → do that task (only if its prerequisites are done).

## 1. Find where we are

1. Read `docs/PROGRESS.md`.
2. Run `git status --short`. If there are uncommitted changes, a previous session was cut
   off: read the "Half-done" notes in PROGRESS and finish or repair that work first.
3. Read ONLY the current phase file in `docs/phases/`. Pick the first unchecked task.
4. If that item is a **HUMAN GATE**: stop. Print its checklist exactly, the commands to run,
   and what the human should reply. Do not continue until they answer. When they answer,
   record the result in PROGRESS ("Playtest log") and DECISIONS if it decides something,
   tick the gate, and continue.

## 2. Plan briefly

Say in 2–4 plain lines what you will do and which files you will touch. Read only the
doc sections this task needs (`docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md` etc. by section).
If the task would change a decision in `docs/ARCHITECTURE.md` or `docs/GAME_DESIGN.md`, stop
and ask the human with 2–3 options and your recommendation.

## 3. Build

- Write the code and its tests together. Follow `CLAUDE.md` and the path rules.
- New gameplay numbers go into `config/` with schema updates.
- Keep the task scoped. If you discover extra work, add it as a new unchecked task in the
  phase file (or a later phase) instead of doing it now.

## 4. Prove it

- Run `/verify` and fix until it passes.
- If anything visual changed, run `/shots <scenarios>` and fix real problems it reports.

## 5. Record and commit

1. Tick the task checkbox in the phase file.
2. Update the docs this task changed (formats, commands, tuning table, roster tables).
3. Update `docs/PROGRESS.md`: Now, Next task, Known issues, and one line in "Last sessions".
   Clear the "Half-done" section.
4. Small decision made? Add one line to `docs/DECISIONS.md`.
5. `git add -A` and `git commit -m "<task-id>: <short summary>"`.

## 6. Report

Plain English, max 6 lines: what changed, how the human can see it (command or URL),
anything they should know, and the next task id.

## 7. End of phase

When every task and gate in the phase is ticked:
1. Use the `reviewer` subagent with range `<previous phase tag or first commit>..HEAD` and the
   phase file path. Fix all Critical items (and cheap Should-fix items), then `/verify`.
2. `git tag pN-done` (N = phase number).
3. Phase report: what works, how to run it, what the human should try, known issues,
   what the next phase does.
4. In the default (keep going) mode, write the phase report into PROGRESS and continue with
   Phase N+1 (context compaction handles length). Otherwise tell the human: "Run `/clear`,
   then `/next` to start Phase N+1."
