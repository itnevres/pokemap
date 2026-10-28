**Verdict: Needs rework.**

Critical: None found.

Important:

- `packages/ui/src/canvas/WorldSurface.tsx:215`: Pending jump fits bypass P12-4u’s scope guard. Queue a jump to A while the viewport is 0×0, then filter to B before measurement. Once measured, the saved A placement overrides B’s filter fit, centring an undrawn map. The pending placement can also become stale after a world update. Keep pending jump identity and revalidate scope and current placement before fitting. Existing Task 5 tests do not cover this intervening change.

Minor:

- `packages/ui/src/canvas/WorldSurface.tsx:575`: A stationary Shift-click no longer selects a GBC map or calls `onSelectMap`; Shift-clicking empty space no longer clears selection. Old GBC `:1020–1028` did both. P12-3 names toggle, marquee and group movement, but does not explicitly rule this additional change. Preserve it or obtain a ruling, with a regression test.
- `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-7-report.md:37`: “10/10” predates the added cache-retention test. The current file expands to 11 cases. Update the evidence so acceptance cannot mistake the earlier run for verification of the final file.

The remaining adapter fields match the old GBC implementation: native units, time/version URLs, guarded POST bodies, warp map-name validation and exact destination endpoints, half-block offsets, visibility, encounters, coverage, status text, toolbar and overlay order, save-error policy, and filter/drop guards. Wrapper exports and props remain intact. Rationale comments are retained or relocated.

Only the three permitted P12-4m tests changed. Independent calculations confirm:

- Cluster fit: zoom `10`, pan `(0,50)`, display `31%`.
- MapB outline: `(100,50,100,100)`.
- Group move: A `(2,1)`, B `(12,1)`.
- Captured outside release: A `(20,11)`.
- Warp marker: `(50,100)`; distances `8` and `9` are correct.
- Hidden-map jump: zoom `24`, pan `(-23960,-23960)`, rectangle `(40,40,120,120)`.
- Hidden neighbour blocks the left band, yielding top.

The first three conductor fixes preserve the relevant GBA behaviour and introduce no family branch. Fix 4 preserves immediate highlight/reveal and delayed fitting in the ordinary case, but needs the pending-jump correction above. M6 tests exercise the real wrapper’s context cap.

Read-only review completed. No tests, builds, or edits performed; conductor runtime results were treated as supplied evidence.