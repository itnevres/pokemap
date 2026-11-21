---
name: archive-reports
description: Move a finished task's report files into the plan's _archive/ folder (global rule 7). Use once every review of a task has passed with no open findings, or when the user says to archive task reports.
---

# Archive task reports

Global rule 7: once a task's reviews all pass with no open findings, move its report files into `_archive/` under the same plan directory. Never delete them.

## Steps

1. Confirm the task is clean. Read its latest review report(s) and check that no finding is still open. If one is open, stop and say which.
2. List the task's files, for example:
   ```bash
   ls docs/superpowers/task-reports/<plan-slug>/ | grep -E '^task-<N>-'
   ```
   Keep plan-level files in place: `final-review.md`, live reports still referenced from RESUME.md or a spec, and helper scripts such as `measure.py`. Check with `grep -rn "<file name>" docs/superpowers/RESUME.md docs/superpowers/specs docs/superpowers/plans`; if a file is referenced by path, leave it or update the reference in the same commit.
3. Move them with `git mv` for tracked files (plain `mv` for untracked ones):
   ```bash
   mkdir -p docs/superpowers/task-reports/<plan-slug>/_archive
   git mv docs/superpowers/task-reports/<plan-slug>/task-<N>-*.md docs/superpowers/task-reports/<plan-slug>/_archive/
   ```
4. Commit only on the user's go-ahead, or as part of the task's own close-out commit: `docs(<plan>): Task <N> reviews clean; archive review reports`.

Never use `rm`, `git rm`, or `git clean` on task reports.
