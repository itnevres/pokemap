# Plan H: Task D (done)

Done before Plan H was scheduled: D1/D2 in Plan 6c E1, D3 in Plan 6b. Text as it stood at `460370b`.

## Task D: GBA `MapCanvas` StrictMode zoom, hover overflow, and `vite build` CSS comment (DONE: D1/D2 in Plan 6c E1, D3 in Plan 6b)

**Origin:** Plan 6b Task 4's spec review (`docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/_archive/task-4-spec-review.md`, sections A and B plus its "Side note"). The review found the first two bugs in `GbcMapCanvas.tsx`, which was copied from GBA `MapCanvas.tsx`, and reproduced both on GBA live.

**D1 (StrictMode zoom bug): DONE in Plan 6c E1 (`a13a308`, 2026-10-05).** `MapCanvas` now holds one `view` state with a shared pure `zoomAboutPivot` (`components/mapView.ts`), pinned by a `<StrictMode>` test.

**D2 (hover overflow): DONE in Plan 6c E1 (`dd50d43`, 2026-10-05).** `min-width: 0` and an ellipsising hover now sit on the shared `.map-canvas` rules. GBA keeps its 28 px single-row status strip, and the 44 px two-row strip stays GBC-only (E1 fix round `a1a59e0`). All three are pinned in `styles.test.ts`.

**D3 (`vite build` CSS comment): DONE in Plan 6b (`5629602`, 2026-09-28).** Browsers had also silently dropped the next rule, `.species-spotlight { position: relative }`, so the spotlight dropdown rendered off-screen in both families. The fix rewords the comment. `packages/ui/test/styles.test.ts` parses the sheet strictly with lightningcss and pins the rule, and `vite build` passes.

The original task text (bug descriptions, fixes, tests, constraints) was deleted 2026-11-21 because all three parts are done; it is in this file's history before that date.
