VERDICT: ALL ADDRESSED

# Plan 14.1 Task 6 re-review 1 (fix round 2, 542fe42, diff 6f8e85f..542fe42)

Reviewer: Claude Opus, read-only. I read the full fix diff (5 files, +28/-9) and the surrounding code: `MapSurface.tsx` onMouseDown/Move/Up, `useMapEditing.ts` move `.then` and the visit reset, `EventInspector.tsx` draft sync, both test fixtures, and the GBC `onSelectEvent` wiring. I did not run vitest. Mutation results below come from my reading of the code, not from a run.

Counts: Critical 0, Important 0, Minor 0 new.

## Round-1 findings

| ID | Status | Evidence |
|---|---|---|
| Spec I2 / Quality I1 (GBA-only inert-tool guard) | ADDRESSED | `packages/ui/src/components/MapEditingWorkspace.tsx:93` is `onSelectEvent,` again, the same as 100d295:88. GBC still has `onSelectEvent: setEvent` (`src/gbc/GbcMapEditing.tsx:153`). Both families go through the shared `!activeTool && onSelectEvent` gate (`src/canvas/MapSurface.tsx:193`). Parity is restored, and no family-specific rule remains to pin. |
| Spec I1 (vacuous A->B->A success witness) | ADDRESSED | `packages/ui/test/AppVisitGuard.test.tsx:46-63`. See the derivation below. |
| Spec M1 / Quality M2 (hover freezes while placing) | ADDRESSED | `src/canvas/MapSurface.tsx:219` updates the hover, then returns. The new test is at `test/canvas/placement.test.tsx:147-158`. |

## Fixture root cause (verified real)

- 6f8e85f changed `PALLET_TOWN_LAYOUT.map.objectEvents` from `[]` to one object at (0,0) (`test/App.test.tsx:293`).
- `ROUTE1_LAYOUT` spreads `PALLET_TOWN_LAYOUT.map`, so Route1 inherited that object. `/api/map/Route1` serves `ROUTE1_LAYOUT` (`App.test.tsx:335`).
- In the inert-pencil test (`App.test.tsx:~628`), the click is at (20,20). Border 1 gives origin 16, so source (4,4), which is event cell (0,0).
- Pencil with no stamp resolves `activeTool` to null. `MapSurface.tsx:193` therefore runs `findEventAt` and hits the inherited object. `onSelectEvent` selects it. `EventInspector`'s `useIndicatorBlock` then GETs `/api/edit/Route1/indicator/at?index=0`. That GET is unmocked, but the call is still counted, so `calls.length` no longer equals `callsBefore`.
- At 100d295 the fixture had no objects, so the same click selected nothing and the count held.
- The root cause is real. `objectEvents: []` on Route1 (`App.test.tsx:319`) restores the original zero-fetch condition. The assertion is unchanged.
- The PalletTown discard test still keeps its object, because it reads `PALLET_TOWN_LAYOUT` directly.

## Spec I1 derivation

1. The old visit drags object 0 from (0,0) to (1,0), and the POST is deferred.
2. A->B->A runs the visit reset (`useMapEditing.ts:197-206`), which sets `selectedEvent` to null.
3. The new visit clicks at (24,24): source (8,8), cell (0,0). Mouseup lands on the same cell, so no drag and no move fire. `resolveEventRef` selects object 0, and X shows 0.
4. The deferred success then resolves.
   - With the `useMapEditing.ts:109` guard: the `.then` returns early.
   - Guard removed: `prev` is {object, 0}, which matches `next`, so `selectedEvent` becomes x 1. `EventInspector` syncs `draft` from `selected` (`EventInspector.tsx:87`), so the X spinbutton shows 1 and `:61` fails.
5. The response map has x 0, so the session-map path cannot mask or fake the result. Only the guarded `setSelectedEvent` can change X.
6. This matches the implementer's claimed red (`expected '1' to be '0'`). The witness is no longer vacuous.
7. The suggested second check (a current-visit `eventOpError` survives) was not added. That was optional, and the X check alone fails when the guard is removed.

## M1 derivation

- The test (`placement.test.tsx:147-158`) mounts with `placing="object"` and moves the mouse over block (1,0), which holds 0x11, with `buttons: 0`.
- With the old `if (placing) return;`, `setHover` never runs, so `onHoverMetatile` is never called with 0x11 and the assertion fails. The mutation is red.
- The placing branch now skips eventDrag, paint and `movePan`. Mousedown returns early while placing (`MapSurface.tsx:183-189`), so none of those can start during placement. Skipping them loses nothing.

## New breakage from 542fe42

None found.
- The guard revert returns behavior exactly to 100d295.
- The fixture change only affects Route1 users in `App.test.tsx`. I checked the other Route1 user at `:694`: it spreads `ROUTE1_LAYOUT` and needs no object.
- The hover branch duplicates one `setHover` line, which is harmless.

## Round-1 Minors still open (not findings)

- Spec: M2 (Escape capture has no text-field or context-menu exemption), M3 (a cancelled Discard confirm still clears placement), M4 (the pan is injected through `view`).
- Quality: M1 (same as spec M2), M3 (the `onMouseUp` placing guard can strand a stroke or drag that was already in progress), M4 (a kind disabled mid-placement does not cancel placement), M5 (hard-coded `15`), M6 (test-hygiene gaps).
