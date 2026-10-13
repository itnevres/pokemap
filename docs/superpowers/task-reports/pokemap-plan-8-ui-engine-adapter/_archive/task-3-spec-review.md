# Plan 8 Task 3: spec-compliance review

**Verdict: Spec ✅.** Critical 0, Important 0, Minor 2.

Base `e1050b2`, Head `ef36751`. Read: brief, spec (R1-R4), report, and the full review-package diff. Outside the diff I checked three named risks (listed under "Outside-diff checks"). Tests were not re-run.

## Findings

### Critical
None.

### Important
None.

### Minor

**M1. The new family witnesses carry copied-over header comments and unused imports.**
- `packages/ui/test/AppContextStroke.test.tsx:5-7` and `packages/ui/test/gbc/GbcAppContextStroke.test.tsx:7-10` still have the header comment of the file they were copied from ("Plan 6c E4 / Plan 7 Task 5b ... a save refreshes only that map's tile"). Neither comment describes M5.
- Unused names: `describe`, `within`, `chrome` in both files. `StrictMode` is imported in the GBC file but never used.
- Failure scenario: a later reader takes these files for general context-editing suites and adds unrelated cases to them, or thinks StrictMode is covered here when it is not.
- No effect on behaviour. This is mainly for the quality reviewer.

**M2. The register/unregister lifecycle under StrictMode is correct but no test covers it.**
- Code: `MapCanvas.tsx` diff lines 310-313 and `GbcMapCanvas.tsx` diff lines 698-701. The effect is keyed on `[chain, onStrokeChain]`. `chain` is stable (`useStrokeChain` returns `useMemo(..., [])`) and `onStrokeChain` is a `useCallback(..., [])` in both Apps. StrictMode's add, delete, add sequence on a `Set` therefore ends in the right state.
- Overlay mounting while the Map-view canvas unmounts is also safe. The two canvases own different chain objects, so the order of the cleanup and mount effects within one commit does not matter.
- Gap: no test renders under StrictMode or checks the Set after a Map-view to World switch. Breaking the cleanup (for example, dropping the `false` call) would leave a dead chain in the Set. Its `settled()` resolves anyway, so no current test would notice. It is harmless today.
- ⚠️ Verified by reading only.

## Outside-diff checks (named risks)

1. **Does the stroke chain settle only after the session's dirty `setState`?** This is R2's post-render read.
   - `shared/useStrokeChain.ts`: `settled()` returns `tailRef.current.then(...)`. `finish` appends `applyPaint(last)` and then `endStroke()` as a single link.
   - `hooks/useEditSession.ts:244-249,268-270`: `call()` sets `isDirty` from the response before its promise resolves.
   - `gbc/hooks/useGbcEditSession.ts:123,128-130`: `post()` calls `setState` the same way.
   - So `setIsDirty(true)` is always queued before `setExitPending(true)`. The decision effect runs on a render where `exitPending` is true, so it sees the post-paint `isDirty`. ✅
2. **Chain identity stability, so registration does not churn on every render:** `useStrokeChain` memoises with `[]`. ✅
3. **Does `onStrokeChain` reach the overlay canvas?**
   - `App.tsx:227` renders `<MapCanvas {...canvasProps} chromeless .../>`.
   - `gbc/GbcApp.tsx:250` renders `<GbcMapCanvas {...canvasProps} .../>`.
   - `canvasProps` carries `onStrokeChain` (`MapEditingWorkspace.tsx` diff line 377, `GbcMapEditing.tsx` diff line 777).
   - `onExitRequest` is only wired when `contextMap !== null` (`App.tsx:220-229`, `GbcApp.tsx:244-252`). The hook's early return in `requestExit` when `contextMap === null` (`useContextEditing.ts` diff line 850) is therefore unreachable from the UI and changes no behaviour.

## Behaviour equivalence against the removed code

**GBA `changeSelection`** (`App.tsx` diff lines 88-113): ✅
- It is now `leave(() => { select(name); changed = true; })`. `leave` is synchronous, so the boolean result is unchanged.
- The confirm text is byte-identical and now appears once (line 89).
- Callers:
  - `selectMap`: guard, `leaveContext`, jump.
  - `selectMapFromWorld`: guard when `name !== selected`.
  - `openMapFromWorld`: `name === selected || changeSelection`, then `leaveContext` and `setMode("map")`.
  - `enter` of another map: `leave(go)`, where `go` is `select` plus `setContextMap`.
- These match the old code. The only addition is that `leaveContext` also retires a pending exit, which is the intended R2 behaviour.

**GBA same-map entry does not call `resetForMapChange`:** in `useContextEditing.ts` diff lines 842-848, `go` calls `select` only when `map !== selected`. ✅

**GBC `leave`:** unchanged (`GbcApp.tsx` diff lines 458-462). Discard still runs before `go`, and a failed discard still sets `switchError`. `enter` of another map passes through it, and `select` (clear `switchError`, `setSelected`, clear `hoveredMetatileId`) runs inside `go` before `setContextMap`. This is the same order as the old `go`. ✅

**GBC same-map entry:** `enterContext` clears `switchError` and `hoveredMetatileId` when `name === selected`, then calls `ctx.enter` (diff lines 529-546). The result is the same as the old direct `go()`. R1 explicitly allows this approach. ✅

**Leaving without a prompt:** mode switch, tree click and Open in Map view now call `ctx.leaveContext()` instead of `setContextMap(null)` in both families (App diff lines 119, 136, 160; GbcApp diff lines 496, 519, 552). ✅

**Selection-leaves effect:** moved into the hook (`useContextEditing.ts` diff lines 825-827) with the same condition. ✅

**Commit bump:** `onCommitted` calls `markClean` and bumps only when `contextMap !== null && contextMap === selected` (diff lines 857-862). Both Apps call `ctx.onCommitted()` and then close their own dialog. GBC still calls `map.reload()` afterwards. ✅

**SaveDialog open state stays with each family:**
- GBA uses `editing.saveDialogOpen` / `setSaveDialogOpen`.
- GBC uses `saveOpen`.
- The hook only calls `openSave`. `onCancel` remains on the family side. ✅

**Canvas remounts:**
- GBA: both world-host branches keep `key="world-host"` and the element type `MapEditingWorkspace`. The only change is an added prop.
- GBC: the world-host `div` and `GbcMapEditing` keep their structure.
- No key, type or position changes, so the world and map canvas DOM nodes keep their identity. ✅

**DOM, classes, ARIA:** no markup changes. Only props were added. ✅

**No new context provider:** ✅

## M5 (R2) mechanics

| Requirement | Status | Where |
|---|---|---|
| The decision reads the post-render `isDirty`: `strokeSettled().then(() => setExitPending(true))`, then an effect on `[exitPending, session.isDirty, ...]` clears it and chooses `openSave` or exit | ✅ | `useContextEditing.ts` diff lines 830-837, 853-855 |
| A pending exit coalesces | ✅ | `exitRequested` ref guard, diff line 850 |
| A mode switch retires a pending exit | ✅ | `leaveContext` nulls the ref and clears `exitPending` (diff lines 819-823). The decision also checks `contextMap === null \|\| selected !== contextMap` (line 834) |
| Retirement holds across re-entry | ✅ | Request-object identity check (line 854), witnessed by the reentry test |
| `strokeSettled` covers every mounted editing canvas | ✅ | One `Set` per App fed by every `MapEditingWorkspace` / `GbcMapEditing` instance (Map view, world host active, world host inactive). Read-only canvases (previews) never paint |
| Register/unregister lifecycle | ✅ | See M2 and outside-diff check 2 |

## Tests against the spec's Tests section

`packages/ui/test/shared/useContextEditing.test.tsx`:

| Case | Status | Location |
|---|---|---|
| `enter` of another map goes through `leave`; a `leave` that never calls `go` leaves `contextMap` null and `select` uncalled | ✅ | diff lines 1201-1208 |
| `enter` of the selected map calls neither `leave` nor `select` | ✅ | diff lines 1209-1212 |
| Accepted guard calls `select` | ✅ | diff lines 1215-1221 |
| Dirty exit calls `openSave` and stays; clean exit sets null | ✅ | diff lines 1223-1236 |
| `onCommitted` calls `markClean` and bumps only its own key, leaving the other untouched; with null it bumps nothing | ✅ | diff lines 1238-1253 |
| `leaveContext` calls neither `leave` nor `openSave` (flushed) | ✅ | diff lines 1255-1264 |
| A selection change leaves | ✅ | diff lines 1266-1272 |
| M5: held settle; double `requestExit` (coalescing); flush, then no decision; rerender dirty; release, then `openSave` exactly once and context stays. The clean variant exits | ✅ | diff lines 1274-1287 |
| Extra: mode switch retires the pending exit | ✅ | diff lines 1289-1300 |
| Extra: retirement holds across re-entry | ✅ | diff lines 1301-1313 |

Family witnesses: `AppContextStroke.test.tsx` (diff lines 988-1022) and `gbc/GbcAppContextStroke.test.tsx` (diff lines 1161-1183).
- Each enters context on a clean session, paints one cell with `/paint/apply` held, and asserts no dirty indicator.
- Each clicks `Done editing <map>` and flushes, then asserts the overlay is still present and no SaveDialog is open.
- Each releases the apply and asserts that the `Save changes` dialog appears and the overlay is still present. ✅
- Failure on the pre-change code, for the stated reason: the old `requestExitContext` read a synchronously clean `isDirty` and exited immediately. The first `expect(contextOverlay()).not.toBeNull()` therefore fails. That matches the report's RED (`AppContextStroke.test.tsx:146`, `GbcAppContextStroke.test.tsx:150`, `expected null not to be null`). I verified the reasoning, not the log. ✅

**Oracle** (no deleted lines in existing tests): the coordinator verified it. The diff's test changes are all in new files. ✅

## Checklist

- **R1** ✅
  - Interface matches exactly: `useContextEditing.ts` diff lines 796-812.
  - `enter` semantics: lines 842-848.
  - `onCommitted` guard: lines 857-862.
  - The hook does not own the SaveDialog state (both Apps).
  - `changeSelection` is re-expressed through `leave`: `App.tsx` diff lines 109-113.
  - GBC same-map clears: GbcApp diff lines 529-546.
  - No `resetForMapChange` on GBA same-map entry.
- **R2** ✅
  - `setExitPending` follows the settle: diff lines 853-855.
  - The decision effect reads the post-render `isDirty`: lines 830-837.
  - Coalescing: line 850. Null or retired: lines 819-823, 834, 854.
- **R3** ✅
  - Optional `onStrokeChain` on `MapCanvasProps` (diff line 265) and `GbcMapCanvasProps` (line 656).
  - Mount/unmount effect: lines 310-313 and 698-701.
  - Added to both `Pick`s: lines 340 and 728.
  - Workspace inputs: lines 344 and 732, threaded into `canvasProps` (lines 377 and 777).
  - Each App has a `useRef(new Set())` and `strokeSettled = Promise.all(...).then(() => {})`: App diff lines 99-106, GbcApp diff lines 463-471.
  - No provider. Task 6 must keep `onStrokeChain` in `buildCanvasProps` (ledger item).
- **R4** ✅
  - The only behaviour change is M5.
  - Existing tests are unedited (oracle) and green per the coordinator gate (159 files, 2,656 tests pass).
  - No new dependencies and no server, core or CLI changes. The diff touches `packages/ui` only.
