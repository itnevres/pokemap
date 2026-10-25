---
name: gate
description: Run PokeMap's full verification gate (vitest suite, typecheck, UI build) and record the evidence. Use before any claim that work is done, before a review dispatch, and before a commit that closes a task.
---

# PokeMap gate

CLAUDE.md requires the full gate result (pass / fail / file count) plus passing typecheck and UI build before any "done" claim.

## Steps

1. Snapshot the subjects. The full suite once crashed this PC mid-run and zeroed GBA subject files (LESSONS, Plan 10b). Record each subject's state first:
   ```bash
   for d in "$(node -p 'require("./pokemap.config.json").projectPath')" "$(node -p 'require("./pokemap.config.json").gbc.projectPath')"; do echo "== $d"; git -C "$d" status --porcelain; done
   ```
2. Run the suite in the background (it takes minutes). Never run it at default workers:
   ```bash
   npm test -- --maxWorkers=4 --minWorkers=1
   ```
   Vitest rejects `--maxWorkers` on its own and runs 0 tests. A run that collects 0 tests is a failure, not a pass.
3. Run `npm run typecheck`.
4. Run `npm run build -w packages/ui`.
5. Snapshot the subjects again and compare with step 1. Any new porcelain line is damage the run caused. Restore only those paths from subject HEAD and keep the user's own lines.

## Record

Report one line, at the commit you measured:

`Gate at <short sha>: <N> pass / <M> fail / <F> files; typecheck <pass|fail>, UI build <pass|fail>; subjects unchanged|<paths restored>.`

- Name each failing test. Mark known flakes only if RESUME.md or LESSONS.md already lists them, and say which list.
- Put the line in the task report (`docs/superpowers/task-reports/<plan-slug>/`) and, when a task or plan closes, in `docs/superpowers/RESUME.md`.
- If anything failed, don't call the work done.
