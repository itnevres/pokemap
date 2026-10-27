# Plan 12b Task 6 spec review (High)

Read-only reviewer. Do NOT run vitest, npm, tsc, or any build (a gate is running; two vitest runs break this machine). Do not edit files.

Repo C:\Programming Projects\PokeMap, branch plan-12b-world-surface at 3d6ff3f. Task 6 is uncommitted: modified packages/ui/src/canvas/WorldSurface.tsx and canvas/worldSurfaceAdapter.ts (`git diff`), new packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx.

Inputs: plan docs/superpowers/plans/2026-10-26-pokemap-plan-12b-world-surface.md (Global Constraints, Review Focus, Task 6); spec docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md; brief docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-6-brief.md; ledger docs/superpowers/task-reports/pokemap-plan-12b-world-surface/ledger.md; sources packages/ui/src/components/WorldCanvas.tsx (GBA) and packages/ui/src/gbc/GbcWorldCanvas.tsx (GBC). Read the code before the implementer notes (docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-6-impl-notes.md); treat the notes as claims to check.

Focus: SPEC COMPLIANCE: check every item of the plan's Task 6 behaviour paragraph and Step 1 test list against the code and tests; every ruling P12-3, P12-4a/c/d/i/n/o/p/q/r/s, P12-6, P12-7; the brief's family-difference and carry-forward rules (each kept as an adapter fact, no family branch in canvas/); no Task 7/8 work leaked in; no existing test changed; DOM changes only where a ruling names one. Re-derive at least five numeric test expectations by hand. The fix round changed a fixture (Far shelved in the endpoint test): judge whether that keeps the test's role.

Conductor evidence (not yours to re-run): canvas tests 226/226, typecheck clean.

Report: verdict (PASS / Approved with fixes / Needs rework), then Critical / Important / Minor findings, each with file:line and a concrete failure scenario. Plain sentences, short.
