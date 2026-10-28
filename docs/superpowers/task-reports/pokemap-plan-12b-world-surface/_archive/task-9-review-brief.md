Plan 12b Task 9 review (Medium, combined spec + quality). Read-only: run no vitest, npm, tsc or build; edit no file except your report. You may run `python measure.py`-style read-only scripts if the report names them.

Repo: C:\Programming Projects\PokeMap, branch plan-12b-world-surface. Diff under review: `git diff 9e29a87..dd87f7f`.

Inputs:
- Plan: `docs/superpowers/plans/2026-10-26-pokemap-plan-12b-world-surface.md`, section "Task 9" (line ~171) and Global Constraints.
- Conductor's report: `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-9-report.md` (measurement, rulings, mutation table, deletions).
- Spec: `docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md` (Plan 12b rulings).

Check:
1. Every Task 9 step in the plan is done or its deviation is ruled in the report with a sound reason.
2. Measurement: the GBA/GBC code-line counts and the aligned count are reproducible from the method the report states; any ruled exception is justified against the plan's target.
3. Deleted re-exports (`drawDiamond`, `themedLevelColorMap`) and `shared/useTileVersionRefetch.ts` have no remaining importer anywhere in `packages/` (grep src and tests).
4. Mutation table: each row names a real test and a mutation that plausibly turns it red; flag any row whose test could not detect the stated mutation (spot-check at least 5 against the code).
5. `packages/ui/DESIGN.md` Plan 12b table matches the code (file names, exported names, ownership).
6. CRLF throughout, no added line over 140 chars.

Write the report to `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-9-review.md`: verdict (Approved / Approved with fixes / Needs rework), then findings as Critical / Important / Minor with file:line and a failure scenario. Reply with one status line and the report path only.
