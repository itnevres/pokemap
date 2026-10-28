# Plan 12b Task 7 re-review (High)

Read-only reviewer. Do NOT run vitest, npm, tsc, or any build (a gate is running). Do not edit files.

Repo C:\Programming Projects\PokeMap, branch plan-12b-world-surface at d4a95fe; Task 7 is uncommitted in the main checkout (`git status`, `git diff`, plus untracked packages/ui/src/gbc/worldSurface.tsx and packages/ui/test/gbc/GbcWorldCanvasSurface.test.tsx).

Prior reviews: docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-7-spec-review.md (Needs rework) and task-7-quality-review.md (Approved with fixes). The conductor's fix round is described in task-7-report.md, section "Fix round". Treat it as claims to check.

Check that each finding is resolved in the code: (1) pending jump fit re-resolves the placement and scope when the viewport is measured (canvas/WorldSurface.tsx jump effect), with no new hazard (StrictMode, a re-jump while pending, world reload while pending) and GBA's current behaviour (components/WorldCanvas.tsx jump effect) still reachable for Task 8; (2) shiftClickSelects adapter fact (canvas/worldSurfaceAdapter.ts, WorldSurface onClick, gbc/worldSurface.tsx) matches old GBC (`git show d4a95fe:packages/ui/src/gbc/GbcWorldCanvas.tsx` onClick) and the default keeps GBA's guard; (3) report evidence count; (4) the F-shortcut test (GbcWorldCanvas.test.tsx, "F does what the Fit button does") now fails without F. Re-derive the new tests' numeric literals (31%, 75%, 38%, the Shift-click points). Confirm no family branch in packages/ui/src/canvas and that no other existing test changed.

Report: verdict (PASS / Approved with fixes / Needs rework), then any remaining findings with file:line and a failure scenario. Short.
