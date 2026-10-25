# Task 7 combined spec + quality review brief (Plan 12a, Medium)

Repo: C:\Programming Projects\PokeMap, branch plan-12-canvas-core, uncommitted working-tree changes. Read only; edit nothing except your output file.

Task (plan `docs/superpowers/plans/2026-10-24-pokemap-plan-12a-canvas-foundation-map-surface.md`, "Task 7"): DESIGN.md "Shared modules" Plan 12 table; measurement per spec Goal 5; mutation table from Tasks 1-6; family-branch check of `packages/ui/src/canvas`.

Review:
1. `git diff -- packages/ui/DESIGN.md`. Every row accurate against the code (`packages/ui/src/canvas/*`, `shared/MapStatusStrip.tsx`, `gba/mapSurface.tsx`, `gbc/mapSurface.tsx`, wrappers `components/MapCanvas.tsx`, `gbc/GbcMapCanvas.tsx`)? Consumers right (grep imports)? Ruling citations (P12-4a/b/g/h/k/l, P12-8) match the spec `docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md`? Repointed Plan 11 rows correct?
2. `docs/superpowers/task-reports/pokemap-plan-12-canvas-core/task-7-report.md`: mutation table faithful to task-1..6-report.md (nothing dropped, nothing invented; count right). Family-branch analysis complete: read `canvas/MapSurface.tsx` yourself for any indirect family branch the report missed. Side-by-side adapter duplication findings: anything missed or wrongly ruled?
3. Measurement claims plausible (143/180, 3 aligned, 1 run) — do not rerun unless cheap.

Output: write findings to `docs/superpowers/task-reports/pokemap-plan-12-canvas-core/task-7-review.md`: verdict (Approved / Changes requested), then findings each with severity (Important/Minor), file:line, and fix. Return only a one-line status plus that path.
