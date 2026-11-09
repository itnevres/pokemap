# Plan 14.1 Task 6 -- fix round 2 (review round 1)

Commit: 542fe42 on p14-1-t6 (worktree wt-t6), parent 6f8e85f.

## Fixes

### 1. Spec I2 / quality I1: GBA-only inert-tool guard removed
- `MapEditingWorkspace.tsx`: `onSelectEvent: activeToolKind === null ? onSelectEvent : undefined` and its comment reverted to plain `onSelectEvent`. Both families again share the same canvas selection rule (no resolved tool, so the click selects or drags an event).
- Root cause: the Task 6 test migration added an object event at (0,0) to `PALLET_TOWN_LAYOUT` in `test/App.test.tsx`, which the discard test needs. `ROUTE1_LAYOUT` spreads `PALLET_TOWN_LAYOUT.map`, so Route1 inherited that object. At `App.test.tsx:634`, the inert-pencil click at (20,20) on Route1 lands on event cell (0,0). With no resolved tool, MapSurface treats it as event selection, which fires `GET /api/edit/Route1/indicator/at?index=0`. No product code in the diff changed click behaviour.
- Fix (fixture only): `ROUTE1_LAYOUT` now overrides `objectEvents: []`, with a doc comment explaining why. The assertion at :634 is unchanged.

### 2. Spec I1: real A->B->A move-success witness
- `test/AppVisitGuard.test.tsx` "ignores a deferred A to B to A move success": the old visit starts a drag move of object 0 from (0,0) to (1,0), with the POST deferred. After A->B->A, the new visit selects object 0 with a click (no drag) and the test asserts X = 0. It then resolves the stale success and asserts X and Y are still 0.
- Mutation: removing `if (!visit.isCurrent()) return;` from `onCanvasMoveEvent`'s `.then` (`useMapEditing.ts:109`) turns this test red with `expected '1' to be '0'`. The other two tests stay green. The guard was restored, and git shows the file unchanged.

### 3. Spec M1: hover live while placing
- `MapSurface.tsx` `onMouseMove`: while placing, it now updates the hover and then returns. Drag, paint and pan are still skipped. The placing mousedown already returns early, so no pan or drag can start.
- New test in `test/canvas/placement.test.tsx`: "keeps the hover readout live while placing" (GBA MapCanvas; MapSurface is shared). Mouse-move over block (1,0) leads to `onHoverMetatile(0x11)`. Mutation: restoring `if (placing) return;` turns it red. Restored.
- `MapCanvasProps` does not declare `placing`/`onEventPick` (they reach MapSurface through the rest spread). The test therefore passes them by spread, like the existing geometry test. MapCanvas.tsx is outside the Task 6 diff and was not touched.

## Not done (minor)
- M2: placement Escape capture listener has no text-field/context-menu exemption.
- M3: a cancelled Discard confirm still clears placement.
- M4: "after a pan" is injected through the `view` prop, not performed by a gesture.

## Verification
- `npx vitest run packages/ui --maxWorkers=4 --minWorkers=1`: 127 files, 2131 tests, all pass.
- `npm run typecheck`: pass.
- `npm run build -w packages/ui`: pass.
- Line endings preserved per file (CRLF files stay CRLF; placement.test.tsx stays LF in the working copy). No BOM.
