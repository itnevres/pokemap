# Task 9 final whole-branch review brief (Plan 12a, High, review only)

Repo: C:\Programming Projects\PokeMap. Branch `plan-12-canvas-core`; code range `d3bf280..HEAD` (`git diff d3bf280..HEAD -- packages`, 28 files). Read only: edit nothing except your output file. Do NOT run vitest or builds (the coordinator runs every check; gate at HEAD: 3,633 pass / 0 fail / 226 files, typecheck and UI build pass).

Read first:
- Spec: `docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md` (rulings P12-1..P12-8 are binding; 12a acceptance; review record).
- Plan: `docs/superpowers/plans/2026-10-24-pokemap-plan-12a-canvas-foundation-map-surface.md` (Global Constraints, Review Focus 1-6).
- Task reports `docs/superpowers/task-reports/pokemap-plan-12-canvas-core/task-{1..8}-report.md` / `task-8-live.md` (the behaviour-difference ledger is in `task-6-report.md`; Task 7 lists two items for this review: `shared/useCanvasView.ts` has no production consumer; `canvas/MapSurface.tsx` imports from `components/`).

Review the whole branch as one change, adversarially:
1. Behaviour: no change outside the named rulings (P12-4a/b/f/g/h/k/l). Compare HEAD `MapCanvas.tsx` / `GbcMapCanvas.tsx` at `d3bf280` against wrapper + adapter + `MapSurface` + foundation now. Hunt for dropped behaviour the tests would not catch: effects whose deps changed, callbacks whose identity now changes each render (adapter rebuilt every render: does anything depend on adapter field identity — e.g. `adapter.overlays` deps, `adapter.blocks` in the debounce effect, `useStrokeChain` registration), StrictMode double effects, cleanup order.
2. Ordering: image-load guard (P12-4g), stroke chain begin/apply/end order and map-switch retirement, same-cell skip reset (P12-4b), `onStrokeChain` registration so discard waits for queued strokes.
3. Cell math: GBA 16 px paint/event; GBC 32 px paint, 16 px event step; raw vs bounded call sites (rect/shift end raw; sign bounded on the event grid).
4. No family branch in `canvas/`.
5. Tests: every changed existing test cites its ruling; no test weakened; test count never fell.
6. Comments: moved rationale kept beside its code; no parked comment blocks; no dangling references to deleted code.
7. Anything else a senior reviewer would block a merge on.

Output: write `docs/superpowers/task-reports/pokemap-plan-12-canvas-core/task-9-final-review.md`: verdict (Approved / Changes requested), then findings each with severity (Critical / Important / Minor), file:line, a concrete failure scenario, and the fix. Verify each finding against the code before writing it. Return only a one-line status plus that path.
