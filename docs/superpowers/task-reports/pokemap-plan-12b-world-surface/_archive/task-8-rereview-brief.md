Plan 12b Task 8 re-review (High, combined spec + quality, fix round only). Read-only: run no vitest, npm, tsc or build; edit no file except your report.

Repo: C:\Programming Projects\PokeMap, branch plan-12b-world-surface. Base of the fix round: `ec63e49` (Task 8 checkpoint). The fix round is the working-tree diff against `ec63e49` (or the commit after it, if committed): `git diff ec63e49 -- packages docs/superpowers/plans`.

Inputs:
- Findings being fixed: `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-8-spec-review.md` (I1 + M1-M10) and `task-8-quality-review.md` (Minor 1-5, plus the "35 fixture rebases" note).
- What the conductor claims it did: `task-8-report.md`, section "Fix round (conductor 11)" (fixes, mutations A-E with results, ruling on fixture rebases).
- Spec rulings: `docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md` (P12-4e, P12-4m amended 2026-10-27, P12-4c, P12-4v).

Check:
1. Each finding is fixed as claimed, or the stated reason for leaving it (M9; Q3 kept re-exports with a note for Task 9) is sound.
2. I1: the two rebased tests now discriminate. Re-derive by hand: (a) mapFilter test, OutsideDungeon at (10,0) under the filter fit (InDungeon1+2, 30x10 in a 100x100 viewport) is inside the view and outside the filter; (b) badge test, Tiny + Frame(90,90,10,10) fit gives z1 pan0 and the badge centre (0,10) is off both bodies (badge = right - BADGE_SIZE - offset, top + BADGE_SIZE; BADGE_SIZE 10). Did the sweep miss any other unchanged GBA test whose premise ("zoom 1", "pan 0", "default view", "offscreen", "culled") is now false under the P12-4e first-load fit? Name file:line and a mutation that would pass it.
3. Every new or changed literal has a correct adjacent derivation: `GbcApp.test.tsx` "entering World centres on the selection" (300x200 viewport, Port x11: fit 100/7 = 45%, jump z20 = 63%, click points), `canvas/worldView.test.ts` 0.6 assertion, rewritten comments in `WorldCanvas.test.tsx`.
4. No assertion deleted or loosened; no behaviour change in src beyond comments, the `NO_LEVELS` constant and the `worldColours.ts` comment move.
5. CRLF throughout, no added line over 140 chars.

Write the report to `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-8-rereview.md`: verdict (Approved / Approved with fixes / Needs rework), then findings as Critical / Important / Minor with file:line and a failure scenario. Reply with one status line and the report path only.
