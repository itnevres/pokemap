# Plan 12b Task 6 quality review (High)

Read-only reviewer. Do NOT run vitest, npm, tsc, or any build (a gate is running; two vitest runs break this machine). Do not edit files.

Repo C:\Programming Projects\PokeMap, branch plan-12b-world-surface at 3d6ff3f. Task 6 is uncommitted: modified packages/ui/src/canvas/WorldSurface.tsx and canvas/worldSurfaceAdapter.ts (`git diff`), new packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx.

Inputs: plan docs/superpowers/plans/2026-10-26-pokemap-plan-12b-world-surface.md (Global Constraints, Review Focus, Task 6); spec docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md; brief docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-6-brief.md; ledger docs/superpowers/task-reports/pokemap-plan-12b-world-surface/ledger.md; sources packages/ui/src/components/WorldCanvas.tsx (GBA) and packages/ui/src/gbc/GbcWorldCanvas.tsx (GBC). Read the code before the implementer notes (docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-6-impl-notes.md); treat the notes as claims to check.

Focus: CODE QUALITY: correctness of async ordering (one reload after all POSTs settle, per-member outcomes, ledger begin before optimistic move, stale POST never rolls back a newer drag, cancel/unmount), warp fetch retry without loops, effect deps and StrictMode safety, ref publication at commit not render, one projection (P12-6), pan hot-path cost, rationale comments kept and placed above the code they explain, style (one statement per line, <=140 chars), test quality (deferred promises, bounded act loops, no DOM-mutating waitFor probes, hand-derived literals, reload counted via a spy not GET counts). Name the mutation each important test would catch and any behaviour no test would catch.

Conductor evidence (not yours to re-run): canvas tests 226/226, typecheck clean.

Report: verdict (PASS / Approved with fixes / Needs rework), then Critical / Important / Minor findings, each with file:line and a concrete failure scenario. Plain sentences, short.
