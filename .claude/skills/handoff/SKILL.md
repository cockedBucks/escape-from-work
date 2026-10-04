---
name: handoff
description: Save the exact state of the work so a fresh session can continue. Use before stopping, before /clear, or when the usage limit is close.
disable-model-invocation: true
---

# /handoff — leave a clean trail

1. Run `/verify`.
2. If it passes: tick finished checkboxes, then `git add -A` and commit with
   `<task-id>: <what is done so far> (partial)`.
   If it fails: do NOT commit. Leave the changes in the working tree.
3. Update `docs/PROGRESS.md`:
   - **Now**: phase and task id.
   - **Half-done**: what is finished, what is not, the exact next step, which files are
     mid-edit, and any failing test names. Keep it under 10 lines.
   - **Known issues**: anything new.
4. Tell the human in 3 lines: where we stopped, whether it is committed, and
   "Run `/clear` (or close the session). Next time, type `/next`."
