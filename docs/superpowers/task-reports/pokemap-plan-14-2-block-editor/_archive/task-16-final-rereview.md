# Task 16 fix round 1: scoped re-review (I1, F5, m2, F2, F3)

Reviewer: Claude Opus (read-only; no vitest runs, per brief). Diffs read in full:
`wt-t16a` f0ba2f0..b0c7328 (hop A), `wt-t16b` f0ba2f0..cf79483 (hop B). There is no implementer report for either
hop, only WIP checkpoint commits, so every claim below comes from reading the code.

## Verdict: APPROVE WITH FIXES

All five fixes are correct in both families. Two small follow-ups, both cheap enough to do before merge:
- N1 (Important, test gap): the I1 client hooks have no test.
- N2 (Minor): the F3 catch is broader than NOT_OWNER.

Neither is a user-visible bug today.

## Per item

### I1: PASS (code), test coverage PARTIAL (see N1)
- GBA hub, `packages/server/src/index.ts:279-298` (`sendSession`): calls `syncOverlay()` first, then
  `project.tileset(layout.primaryTileset|secondaryTileset).metatileCount`. That is the same computation `/api/map` does
  at `index.ts:~441`. The fields are omitted when the layout is missing. `/block/apply` reaches it through
  `deps.sessionBody` (`index.ts:303-305`). Undo and redo reach it through `sendSession` (`:1018`, `:1027`).
- GBC hub, `packages/server/src/gbcEditRoutes.ts:112-123` (`sessionBody`): `proj.tileset(e.session.map.tileset).metatiles.length`
  after `syncOverlay()`. This matches `gbcRoutes.ts:168,193`. `NOTHING_OPEN` (`:109`) carries no count on purpose,
  and the client keeps the previous value when the field is absent. That is safe.
- GBA hook, `packages/ui/src/hooks/useEditSession.ts:~238-247`: `callSession` spreads `prev` and overwrites a count
  only when the reply has one. The event-op, createEvent and external-update paths (`:265`, `:281`, `:302`) all
  spread `prev`, so a move, add or delete does not drop a grown count.
- GBC hook, `packages/ui/src/gbc/hooks/useGbcEditSession.ts` (`stateFrom`, ~`:101-103`; `isSessionBody` count guard,
  ~`:81`): every apply site goes through `stateFrom`, which keeps `prev.metatileCount` when the body has none.
- Reset: a map or seed change re-seeds through `useEditSessionCore.ts:134-136` (counts become undefined), and
  `discard` sets stored state to null (`:162`). This matches the brief's "reset when the map changes".
- Workspaces: GBA `MapEditingWorkspace.tsx:~257-258` and GBC `GbcMapEditing.tsx:~261` pass
  `session.X ?? data.X` to the palette.

Tests:
- Server: suite case `11b.6a` (`server/test/helpers/blockEditRoutesSuite.ts:~1440`) runs for both families, because
  `blockEditRoutes.test.ts` and `gbcBlockEditRoutes.test.ts` both call `suite(...)`. It expects +1 after a saveAsNew
  apply and the original count after one undo. Reverting `sendSession` or `sessionBody` fails it, and so does the
  exact key list in `expectSessionBody`.
- UI: the two `Plan 14.2 I1` cases (`MapEditingWorkspace.test.tsx:~394`, `GbcMapEditing.test.tsx:~388`) rerender with
  an injected count. They guard only the workspace `??` preference: reverting to `data.X` fails `getByRole("metatile 0x290" / "0x6")`.
- Gap: the hook storage step has no test (N1).

### F5: PASS
- GBA `MapEditingWorkspace.tsx:135-140` and GBC `GbcMapEditing.tsx:~183-187` compute
  `busy = editRequests > 0 || creating || hasPendingSessionMutations(mapName)`, held in `busyRef`, which is updated
  on every render.
- `editBlockDisabledReason` (GBA `:~170`, GBC `:~216`) and `onPaletteEditBlock` (GBA `:~246`, GBC `:~196`) both read
  `busyRef.current || hasPendingSessionMutations(mapName)`. Operator precedence is right: `(a || b) ? msg : null`.
- `onPaletteEditBlock` deps stay `[mapName]`, as required.
- The K tool goes through the same gate: `canvas/MapSurface.tsx:200` checks
  `if (cell && !editBlockDisabledReason?.()) onEditBlock?.(cell)`.
- The ref snapshot is sound. `editRequests` and `creating` are state, so every change re-renders and refreshes the
  ref before the next user event.
- The map-switch reset (`MapEditingWorkspace.tsx:104`) zeroes `editRequests`, and the GBC visit guard does the same.
- The GBA `disabledReason` and GBC `AddEventBar` now reuse `busy`. That is the same expression as before, so there is
  no behaviour change.
- Save: the Save dialog is a modal (`setSaveDialogOpen`) that covers the canvas and palette, and save is not tracked
  in `editRequests`. Not adding it is acceptable. The brief asked the implementer to report this; no report exists,
  so I am recording it here.

Tests (`Plan 14.2 F5` cases, both families):
- Reverting `editBlockDisabledReason` to the registry-only check fails the `menuitem /Wait for the current change/`
  lookup and the `.disabled` assertion.
- Reverting `onPaletteEditBlock` fails `.block-editor` is null. The dialog panel renders unconditionally at
  `BlockEditorDialog.tsx:120` and is not lazy-loaded, so `fireEvent` (act-wrapped) mounts it synchronously and the
  check is not vacuous.
- The re-enable half guards against over-blocking.

### m2: PASS
- `BlockEditorDialog.tsx:118`: the backdrop now also requires `editor.status !== "applying"`.
- `:176`: Cancel is `disabled={editor.status === "applying"}`. Escape was already blocked.

Test "prevents closing through Cancel or the backdrop while applying" (`BlockEditorDialog.test.tsx:~124`):
- Reverting either guard fails it: Cancel's `.disabled`, or `onClose` not called after the backdrop mouseDown.
- After resolve, `onApplied` and `onClose` are each called once, so the success path is unchanged.
- It runs only on GBC, but the component and the guard are shared and do not depend on the family.

### F2: PASS
- `BlockEditorDialog.tsx:~158`: `values` is deduplicated with `[...new Set(...)]`, keeping first-seen order.
- `:~164`: the GBA `optionLabel` joins every name with that value using `" / "`, falling back to `text`.
- GBC string options are untouched.
- `values.includes(String(initialValue))` behaves the same after deduplication.

Test "combines GBA behavior names that share a value":
- Without the dedupe, the length-1 assertion fails.
- Without the join, `textContent` is `MB_A` and the assertion fails.
- The `console.error` "same key" check matches React's own format string.

### F3: PASS, with N2
- `blockEditRoutes.ts:187-192` wraps `stageTilesetPlan` and answers 409 with `${name}: ${error.message}` and `code`.
- `blockEditOwnership.ts` is untouched, so the `requireTilesetOwnership` text is unchanged.
- No double prefix on redo: redo calls `requireTilesetOwnership` directly and prefixes once (GBA `index.ts:1024-1028`,
  GBC `gbcEditRoutes.ts:399-403`), never through this route.
- Existing `11b.8` still passes: it uses `toEqual({ error: any String, code: "NOT_OWNER" })`, and `stageTilesetPlan`
  still closes a session it opened (`blockEditOwnership.ts:107-114`).

Test "names the requesting map when another map owns the applied file" (suite `:~1472`, both families):
- Reverting the catch sends the refusal to `fail()`, which returns 409 NOT_OWNER with `"<path>: <mapA> has..."`.
  `startsWith("<mapB>: ")` then fails, so the test guards the fix.

Merge note: hop A and hop B both edit `blockEditRoutesSuite.ts`, in separate hunks (`~462-485` and `~1440` vs `~1472`).
They should merge cleanly. Re-run the suite once after merging both: hop A's exact key list in `expectSessionBody` then
applies to hop B's tests too, and none of hop B's new assertions call it.

## New findings

**N1 (Important, test gap; no live bug). The I1 client hook step is not tested.** Neither hop adds a hook-level test.
These mutations would all pass the whole suite plus typecheck:
- dropping the count spreads in GBA `callSession` (`useEditSession.ts:~244-245`);
- making `stateFrom` always return `prev.metatileCount` (`useGbcEditSession.ts:~102`);
- removing `primaryCount`, `secondaryCount` or `metatileCount` from the hook's return. The result fields are optional,
  so typecheck does not catch it.

Each of these silently brings back the original I1 bug: the palette stays at the load-time count after Save-as-new.
This is the user-visible half of the fix, and the high-risk tier requires mutation evidence for it.

Fix: one `renderHook` case per family, reusing the existing hook test harness:
1. Mock `/block/apply` to reply with count N+1 and assert the hook field.
2. Run an event-op reply without counts and assert the value is kept.
3. Mock `/undo` to reply with N and assert N.

**N2 (Minor). The F3 catch rewrites every `BlockEditRefusal`, not only NOT_OWNER** (`blockEditRoutes.ts:188-191`).
`stageInto` can also throw `BAD_VALUE`:
- `"<map>: placement (x, y) is outside the map"` (`blockEditOwnership.ts:127`);
- `mergeTilesetEdits`' `"<path>: more than one staged edit"` and `"not a canonical ... path"` (`core/src/blockEdit/save.ts:20,24`).

Before the change, these went to `fail()`, which answers 400 for BAD_VALUE (`blockEditRoutes.ts:147-148`). Now they
answer 409, and the placement message is double-prefixed: `"MapB: MapB: placement (…) is outside the map"`.

Reachability is low. The planner (`write`) validates the cell first, and planning and staging run in the same
synchronous block, so these are defensive invariants. The brief literally asked for every `BlockEditRefusal`, so this
is a brief defect, not an implementer slip.

Fix: narrow to `error instanceof BlockEditRefusal && error.code === "NOT_OWNER"` and rethrow everything else to `fail`.

## Conductor concerns

**(a) Save-as-new, then Save, then a later Discard: the palette falls back to the load-time count.**
- Real, GBA only. GBC reloads the map after a save (`gbc/adapter.tsx:186`), so its seed and `data` are fresh.
- In GBA, `useMapLayout` fetches only on `[name]` (`hooks/useMapLayout.ts:80`). Discard sets stored state to null
  (`useEditSessionCore.ts:162`), so the count falls back to stale `data` and the saved block is missing from the palette
  until a map switch or reload.
- The block exists on disk and canvas references still render.
- Severity: Minor. Recommend Plan H, not now.
- Related observation, outside this fix's scope and not verified live: the same discard-to-seed path also restores the
  GBA load-time `blocks` after a Save. If that path is reachable, the canvas would show pre-save blocks too. A Plan H
  fix that re-fetches the GBA map after a commit (as GBC does) would fix both together. Worth a quick live check.

**(b) Another map sharing the tileset appends or undoes a block; this map's palette count stays until its own next session reply.**
- Real, both families. This is no regression: before the fix the palette never followed any append.
- The bad direction is the shrink. If B received a reply while A's append was staged and A then undoes it, B's palette
  offers a block id that no longer exists until B's next reply.
- If the user paints with it, the paint is a server-side edit, and B's next reply corrects the palette. Whether a save
  would accept the dangling id falls under the existing save-time defect and `refuseUnsavedBlockRefs` checks; I did not
  trace that.
- Severity: Minor. Recommend Plan H. One option is to re-read the counts when `tilesetVersion` changes, for example
  through a lightweight GET of the session or map counts.

## Summary

Fix now: N1 (hook tests, both families) and N2 (narrow the catch to NOT_OWNER).
Defer to Plan H: concerns (a) and (b), plus the GBA post-save reload observation.
