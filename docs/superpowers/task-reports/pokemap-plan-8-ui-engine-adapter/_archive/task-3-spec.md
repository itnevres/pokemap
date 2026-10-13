# Plan 8 Task 3: executed spec (shared app-level context controller, M5)

Plan: `docs/superpowers/plans/2026-10-12-pokemap-plan-8-ui-engine-adapter.md`, section "Task 3". The plan's interface is binding in intent; R1 adapts it to the real code. Base: the branch HEAD when you start (record it in the report).

## Anchors (at `722d90e`)

GBA, `packages/ui/src/App.tsx`:
- `:40-42` `contextMap`, `tileVersions` state.
- `:93-103` `changeSelection` (confirm guard + `setSelected` + `editing.resetForMapChange()`).
- `:105-111` `selectMap` (tree click; sets `contextMap` null). `:121-127` `openMapFromWorld` (sets null, mode map).
- `:131-134` `enterContext`. `:138-141` `requestExitContext` (the M5 bug: reads `editSession.isDirty` synchronously). `:144-147` `switchMode`. `:149-151` selection-leaves effect.
- `:209-238` `renderWorld` (`context.onExitRequest: requestExitContext`, `MapCanvas {...canvasProps} chromeless`).
- `:357-374` SaveDialog: `editing.saveDialogOpen` (owned by `hooks/useMapEditing.ts`, also opened by the workspace's Save button); `onCommitted` = `markClean`, close, bump `tileVersions[contextMap]` when `contextMap === selected`.
- Canvas props type: `components/MapEditingWorkspace.tsx:15-18` `MapEditingCanvasProps` (a `Pick` of `MapCanvasProps`).

GBC, `packages/ui/src/gbc/GbcApp.tsx`:
- `:81-83` state. `:106` `saveOpen` (also opened by the toolbar's `onOpenSave`, `:332`, `:353`).
- `:128-132` `leave(go)` (confirm, then `session.discard()` before `go`; a failed discard sets `switchError`).
- `:150-160` `selectMap`, `:182-193` `openMapFromWorld`, `:197-205` `enterContext` (go = clear `switchError`, `setSelected`, clear `hoveredMetatileId`, `setContextMap`), `:209-212` `requestExitContext` (M5 bug), `:215-218` `switchMode`, `:220-222` selection effect.
- `:241-265` `renderWorld`; `:362-375` SaveDialog `onCommitted`.
- Canvas props type: `gbc/GbcMapEditing.tsx:20-23` `GbcMapEditingCanvasProps`.

Stroke chain: `packages/ui/src/shared/useStrokeChain.ts` (`StrokeChain.settled()` resolves when every link issued so far has settled; never rejects). Used by `components/MapCanvas.tsx` and `gbc/GbcMapCanvas.tsx` (`useStrokeChain(` call sites).

Existing witnesses (unchanged, green): `test/AppContextEdit.test.tsx`, `test/gbc/GbcAppContext.test.tsx`, `test/gbc/GbcAppContextSelection.test.tsx`, `test/AppEditing*.test.tsx`, `test/gbc/GbcAppEditing.test.tsx`, plus every other existing test file.

## Coordinator rulings (binding)

R1. **Interface (supersedes the plan block where they differ):**

```ts
// packages/ui/src/shared/useContextEditing.ts
export interface UseContextEditingArgs {
  selected: string | null;
  session: { isDirty: boolean; markClean(): void };
  /** The family's dirty-switch guard: runs `go` now when clean; when dirty, after the confirm (GBC: after the server discard). */
  leave(go: () => void): void;
  /** The family's per-entry selection steps for a map other than `selected` (GBA: setSelected + editing.resetForMapChange();
   *  GBC: clear switchError, setSelected, clear hoveredMetatileId). Called inside `go`, before contextMap is set. */
  select(map: string): void;
  /** Opens the family's existing SaveDialog (GBA: editing.setSaveDialogOpen(true); GBC: setSaveOpen(true)). */
  openSave(): void;
  /** Settles when every stroke issued so far on every mounted map canvas has settled (M5). */
  strokeSettled(): Promise<void>;
}
export interface ContextEditing {
  contextMap: string | null;
  tileVersions: Record<string, number>;
  enter(map: string): void;        // map === selected: go() directly; else leave(go). go = select(map) (only if map !== selected) + set contextMap.
  requestExit(): void;             // M5: waits for strokeSettled(), then dirty → openSave(), else leave context.
  onCommitted(): void;             // markClean() + bump tileVersions[contextMap] only when contextMap !== null && contextMap === selected.
  leaveContext(): void;            // contextMap = null, no prompt (mode switch, tree click, Open in Map view).
}
```

- The SaveDialog open state stays where it is today in each family (GBA `useMapEditing`, GBC `saveOpen`): the workspace/toolbar Save button opens it too, so the hook must not own it. The family's `SaveDialog onCommitted` calls `ctx.onCommitted()` and closes its own dialog; `onCancel` stays family-side.
- `leaveForModeSwitch` is named `leaveContext`: the same no-prompt leave also serves the tree click and Open in Map view.
- The selection-leaves effect (`contextMap !== null && selected !== contextMap` → null) moves into the hook.
- GBA's `changeSelection` should be re-expressed with the new GBA `leave` so the confirm text lives once; keep its existing callers' behaviour identical.
- GBC same-map entry today also clears `switchError` and `hoveredMetatileId`; keep that by having GBC's `enterContext` path call the hook's `enter` and, for `name === selected`, keep those two clears (e.g. GBC's `select` is called for the same map too). Pick one approach and keep GBC's existing tests green; GBA same-map entry must NOT call `resetForMapChange` (it does not today).

R2. **M5 mechanics.** `requestExit` must not read `isDirty` from the closure right after the await: the response that marks the session dirty lands as a React state update that may not have rendered yet. Required shape: `strokeSettled().then(() => setExitPending(true))`, and an effect on `[exitPending, session.isDirty]` that, when `exitPending`, clears it, then `isDirty ? openSave() : setContextMap(null)`. (Or an equivalent that provably reads the post-render `isDirty`.) A second `requestExit` while one is pending is harmless (one decision). If `contextMap` became null meanwhile (mode switch), the pending decision does nothing.

R3. **Exposing `settled` from the canvases.** Add an optional prop `onStrokeChain?: (chain: { settled(): Promise<void> }, mounted: boolean) => void` to `MapCanvasProps` and `GbcMapCanvasProps`; each canvas calls it with `mounted: true` in an effect when its chain is created and `false` in that effect's cleanup. Add `"onStrokeChain"` to `MapEditingCanvasProps` and `GbcMapEditingCanvasProps` picks and thread it through the existing canvas-props path (`MapEditingWorkspace` / `GbcMapEditing` build canvasProps; add the prop to their inputs). Each App keeps a `useRef(new Set())` of live chains; `strokeSettled = () => Promise.all([...set].map((c) => c.settled())).then(() => {})`. No new context provider. Task 6 must keep `onStrokeChain` in `buildCanvasProps` (ledger).

R4. **No behaviour change besides M5.** Clean exits, dirty exits with no stroke in flight, commit bump, mode switch, tree click, Open in Map view, the selection effect and focus behaviour stay exactly as today. A clean exit with no stroke in flight now waits for an already-resolved promise plus one render: the existing tests must stay green without edits (use `findBy`/`waitFor` only in NEW tests). If an existing test fails only because a clean exit is no longer synchronous, STOP and report NEEDS_CONTEXT with the test name and output; never edit an existing test.

## Tests

- `packages/ui/test/shared/useContextEditing.test.tsx` (new, `renderHook`, fake args with spies; flush with `await act(async () => {})` before negatives):
  - `enter` of another map goes through `leave` (a `leave` that never calls `go` leaves `contextMap` null and `select` uncalled); of the selected map does not call `leave` or `select`;
  - dirty exit calls `openSave` and stays (`contextMap` unchanged); clean exit sets it null;
  - `onCommitted` calls `markClean` and bumps only `tileVersions[contextMap]` (another key untouched); with `contextMap` null it bumps nothing;
  - `leaveContext` sets null and calls neither `leave` nor `openSave`;
  - a `selected` change away from `contextMap` leaves;
  - **M5:** `strokeSettled` returns a held promise; `requestExit()`; flush → neither `openSave` nor exit yet; rerender with `isDirty: true`; release → `openSave` called once, `contextMap` unchanged. And with the held promise released while still clean → exits.
- `packages/ui/test/AppContextStroke.test.tsx` (new, GBA M5 family witness) and `packages/ui/test/gbc/GbcAppContextStroke.test.tsx` (new, GBC): copy the minimum harness from `test/AppContextEdit.test.tsx` / `test/gbc/GbcAppContext.test.tsx` (do not edit those). Enter context on a map with a clean session, paint one cell on the overlay canvas with a fetch mock whose `/paint/apply` is held (and returns a dirty state when released), click `Done editing <map>` while held → still in context and no SaveDialog; release → the `Save changes` dialog appears and the overlay is still there. Must FAIL on the pre-change code (record it: today Done exits immediately).

## Test oracle

`git diff <BASE> -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` prints nothing.

## Out of scope for the implementer

Step 6 (mutations) and the live check are the coordinator's. The implementer runs Steps 1-5 and the gate (`npm test` once to `task-3-gate.log`, `npm run typecheck`, `npm run build -w @pokemap/ui`), then commits.
