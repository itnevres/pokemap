VERDICT: FAIL

# Plan 14.1 Task 6 spec-compliance review (6f8e85f, diff 100d295..HEAD)

Reviewer: Claude Opus, read-only. Read the full source and test diff and the surrounding code (MapSurface click/selection branches, useMapEditing move/visit reset, GbcMapEditing tool resolution, useWorldContext Escape). I did not run vitest (conductor ran it). Mutation evidence: I accept the conductor's two red mutations (origin zeroed, placing no longer short-circuits). Below, I re-derived by reading the code whether each migrated test still guards what it guarded before.

Important: 2. Critical: 0. Minor: 4.

## Requirement checklist

| Requirement | Status |
|---|---|
| Four exact labels; aria-label = title; icon only, one row | Met: `src/shared/AddEventBar.tsx:5-10`, test `test/shared/AddEventBar.test.tsx:14` |
| aria-pressed toggles; disabled reason = title and blocks toggle | Met (native `disabled`), tests :27, :40 |
| Real geometry, zoom 1 and zoom 2 after pan, both families, origin from adapter, GBC 16 px | Met with a caveat (Minor 4). `boundedCell` uses `g.origin` and `g.eventCellPx`. The test derives the origin from `compositeOrigin` / `GBC_COMPOSITE_ORIGIN`. The anchor rect is asserted. |
| Esc, same button, tool change, map switch, Save, Discard clear `placing` (both families) | Met: `test/canvas/placement.test.tsx` cancel matrix. Each wrapper `clear()` is load-bearing for Save and Discard. Tool change and map switch are also covered by the owner reset. |
| No paint POST while placing (strict mock) | Met. The pencil-with-stamp session throws on fetch; conductor mutation red. |
| GBC capacity: 15 objects disables Object; no scenes disables Coord, with reasons | Met: `src/gbc/GbcMapEditing.tsx:195-198`, test at end of placement.test.tsx |
| Old GBA Add Event button, `onAdd`, `onAddEvent` removed | Met |
| Bar above the inspector in both rails (A1) | Met |
| Every migrated test still tests what it tested before | NOT met: see Important 1 |
| One shared UI; family differences only in adapter data (A4) | NOT met for event selection: see Important 2 |

Deferred correctly (not findings): GBA object cap read from the project, "not editable" and "request in flight" disabled reasons (plan Task 8 Step 1 owns every Shell item 1 condition). The DESIGN.md shared-module row and rail-order text belong to the closing task (plan line 411).

## Important

### I1. Migrated "deferred A->B->A success" witness is vacuous
- Location: `packages/ui/test/AppVisitGuard.test.tsx:46` (guards `src/hooks/useMapEditing.ts:109`).
- Before: the test clicked Add Event, switched A->B->A, then resolved the add. Without the visit check, the old `onAddEvent` `.then` called `setSelectedEvent({ kind: "object", index: newIndex, ... })` unconditionally. "No event selected." would then fail, so the test guarded the success-path visit check.
- After: the test drags an existing object, switches A->B->A, then resolves the move. The visit reset (`useMapEditing.ts:197-206`) already set `selectedEvent` to null. `onCanvasMoveEvent`'s `.then` only maps `prev`: `prev && prev.kind === ... ? {...} : prev`. So with `if (!visit.isCurrent()) return;` deleted, `prev` is null and stays null. No error exists to clear, and every assertion still passes. The test cannot go red for the logic its name claims to guard. The implementer's ledger row "A-B-A success cannot restore selection" is therefore not real coverage.
- Failure scenario: someone drops the visit check on line 109. A late move success after A->B->A then rewrites the new visit's selection or clears its error banner. No test notices.
- Fix: make the stale success observable. After `switchTo("PalletTown")`, select object 0 again (no tool, mouseDown/mouseUp at the same cell, no drag) before resolving the deferred move. Then assert the X spinbutton still shows `0`, not the stale move's target. Also seed a current-visit `eventOpError` and assert it survives the stale success. Run the mutation (delete line 109's guard) and confirm it goes red.

### I2. Unrequested GBA-only change to shared canvas input (inert tool no longer selects events)
- Location: `packages/ui/src/components/MapEditingWorkspace.tsx:94` (`onSelectEvent: activeToolKind === null ? onSelectEvent : undefined`). GBC still passes `onSelectEvent: setEvent` unconditionally (`src/gbc/GbcMapEditing.tsx:153`).
- Before this commit, in both families, a chosen Pencil/Rect/Bucket without a stamp resolves `activeTool` to null. `MapSurface.tsx:193` then treats the click as event selection and drag.
- Fix round 1 changed this for GBA only, so that `App.test.tsx:634` keeps a zero-fetch count. That test failed because the migration added an object at (0,0) to the shared `PALLET_TOWN_LAYOUT` fixture (`test/App.test.tsx:293`). The clicked cell then selected it and fired the indicator GET.
- This is product behavior changed to fit a fixture edit. Task 6 does not ask for it, and it breaks A4 parity.
- Failure scenario: after a GBA map switch, `currentStamp` is cleared while Pencil stays selected. A click or drag on an NPC now pans instead of selecting or moving it. On GBC the same gesture selects. The MapSurface contract comment "Event selection precedes paint only with no tool" now means different things per family.
- Fix: revert line 94 and its comment. Then fix the fixture instead, for example:
  - put the App.test object on a cell the inert-pencil click at (20,20) does not hit, and adjust the discard test's drag coordinates; or
  - give that one test its own fixture without objects.
- If the stricter rule is wanted, apply it in both families. It then needs a conductor ruling recorded in the spec, not a fix-round edit.

## Minor

### M1. Hover readout freezes while placing
- Location: `src/canvas/MapSurface.tsx:218` (`if (placing) return;` at the top of `onMouseMove`).
- This also skips `setHover`, so the status strip's tile coordinates stop updating exactly while the user is choosing a tile.
- Spec Shell item 2: "The cursor and the click use the event grid".
- Fix: return only after the hover update, skipping only the drag and paint branches.

### M2. Placement Escape stops every other Escape listener, including text fields and the World context menu
- Location: `src/shared/AddEventBar.tsx:43-47`.
- The capture listener calls `stopImmediatePropagation()` without the text-field exemption that `useWorldContext.ts:120` applies.
- Failure scenario: the user is placing and has the World context menu open, or is in an input with its own Escape handling. The first Escape is swallowed by placement and the menu stays open.
- Fix: skip when the target is an input, textarea, select or contenteditable, or when a context menu is open.

### M3. A cancelled Discard confirm still cancels placement
- Location: `src/gbc/GbcMapEditing.tsx:133` and `src/components/MapEditingWorkspace.tsx:113`.
- `clear()` runs before `window.confirm`. Clicking Discard and then Cancel ends placement even though nothing was discarded.
- The behavior is harmless and the same in both families. Clear after confirm returns true only if the spec's "Discard cancels it" is meant literally.

### M4. "After a pan" is injected, not performed
- Location: `test/canvas/placement.test.tsx:73`.
- The pan offset comes from the controlled `view` prop, not from a pan gesture. Spec Step 1 says "at zoom 2 after a pan".
- The hit math still exercises the pan offset, so the geometry is covered. A pan gesture that failed to propagate into the hit math would not be caught.
- Optional: perform a real middle-drag or no-tool drag pan in one case before placing.

## Migration audit (other rows)

- EventInspector: the Add in-flight guard moved to Duplicate. The old Add guard code is gone, so this is a fair replacement pin.
- AppEditingWiring, App discard, AppWorldContextMenu, AppContextEdit, switchPrompt, warpPopup: each dirtying action was swapped for a move or paint. Each test still asserts the dirty indicator before its real subject, so the subjects are unchanged.
- AppVisitGuard failure and retire tests: real. Removing the `.catch` visit check shows "old failure", which turns them red.
- MapEditingWorkspace: exact keys extended and rail order extended. Both are fine.
- Cosmetic only: the AppContextEdit mock pairs the path `map.json` with the summary "map.bin: 1 block changed".
