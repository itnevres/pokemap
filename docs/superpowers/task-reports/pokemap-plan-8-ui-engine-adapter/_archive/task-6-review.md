# Task 6 review (spec + quality)

Spec ✅, quality Approved, 0C/0I/3M

## Spec compliance
- R1/R3: `shared/useVisit.ts:14-23` is GBC's old code moved verbatim (state `{key}`, render-phase setVisit, layout-effect commit/null-on-cleanup, `isCurrent = ref === visit`). A->B->A gives a new state object, so the first A guard stays false. OK.
- R2: `shared/EditingWorkspace.tsx:22-23` matches the spec shape (`{active && top}`, body, canvas, `{active && side}`).
- R4: `GbcMapEditing.tsx:67-74, 195` keeps export, props and fragment output; same three resets; `isCurrent` still gates every deferred callback. Base DOM order identical: Toolbar, error banner, body{canvas, rail}. The rail is still null with no map. The Task 3 `onStrokeChain` spread is kept (`:131`).
- R5: `useMapEditing.ts:59,69-70,234-239` optional `mapName`, `?? null`, three resets on `changed` (placed after all three useStates, so no TDZ). The guard `visit.isCurrent()` is in all five handlers (`:107,125,144,204,297-298`), including the delete `window.alert` (inside the guarded `.then`, `:144-166`). Returned keys unchanged; `resetForMapChange` still exported and called at `App.tsx:95`; `App.tsx:68` is the only App change. `MapEditingWorkspace.tsx` keeps the `.app__map-editing` wrapper, and the `onStrokeChain` spread is kept (`:62`). DOM order matches base (Toolbar, collision strip, metatile strip, error banner, sign banner, body{canvas, EventInspector}); the `data &&` strip condition is preserved.
- R6: comments updated (`useMapEditing.ts:84-85, 246-248`). `signAddedMessage` keeps the never-auto-clear rule.
- Tests 1-4 present; no existing test changed (only 4 new files).

## Behaviour preservation
- The canvas stays at body child 0 whatever `active` is (`false` placeholder in the fragment). The new EditingWorkspace test and the existing node-identity tests cover this.
- Render-phase setState: two same-component updates (`setVisit` plus the resets), one retry, no loop. The `useMapEditing.test.tsx` case has no `mapName`, so the key is a constant null and never changes. StrictMode: the layout-effect double-run re-commits the same `visit`, so it is safe.
- The `App.select` reset and the `visit.changed` reset overlap (redundant but harmless; the spec requires it).

## Critical
none

## Important
none

## Minor
- M1 `test/shared/useVisit.test.tsx:7-19`: the first test never observes `changed === true`. `result.current` is the settled render (false), and the child value is masked by the `pick.forMap === key ? ... : null` check, so the test passes even if `changed` never fires. Spec Test 1 bullet 1 ("changed is true exactly on the first render with a new key") is only killed indirectly, by the guard test. Fix: push `visit.changed` into a `renders` array and assert `[false, true, false]` after the A->B rerender. Drop the forMap masking, or reset the state with a bare value.
- M2 `shared/useVisit.ts:10-11` JSDoc ("preserve their stable canvas/body position") describes EditingWorkspace, not this hook. Replace it with "Stable until `key` changes; `changed` is true for exactly the render that changes it."
- M3 `useMapEditing.ts:59`: the new `mapName?` arg has no JSDoc. Add one, e.g. "Visit key; omitted = never changes". Task 7 note: `resetForMapChange` (the App.select call) is now redundant with `visit.changed` for selectedEvent and currentStamp. Remove it when App/GbcApp converge. `test/AppContextVisit.test.tsx:127` uses a magic `clientX: 200` double-click, which is fragile if the viewport stub changes. It is a regression pin that passes before and after (the file header says so).
