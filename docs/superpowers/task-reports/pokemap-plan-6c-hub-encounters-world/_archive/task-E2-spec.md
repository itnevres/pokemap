# E2 executed spec: extract map-editing state and chrome from `App.tsx` (pure refactor, GBA)

Branch `plan-6c-hub-encounters-world`. Base: the HEAD at dispatch, after E1. Gate baseline: 2,042 pass / 2 fail plus E1's new tests. Both failures are the known `world.test.ts` pair; ignore them.

**This is a pure refactor.** The rendered DOM, the behaviour, and every existing test stay unchanged. `packages/ui/test/App.test.tsx` (29 tests) and every other GBA UI test must pass **without a single edited line**. That is the proof. E4 will mount the same editing chrome a second time, over the world view.

## Deviation from the plan text (coordinator ruling)

The plan sketches `MapEditingWorkspace({ mapName, data, canvas })` owning the `useEditSession` wiring. **Don't move `useEditSession` out of `App`.** It is deliberately tracked on `selected` regardless of mode (see the long comment above `const editSession = useEditSession(...)`), and three things need it outside Map mode:

- `changeSelection`'s dirty guard;
- the `beforeunload` effect;
- the `SaveDialog`/`SignComposer` siblings.

E4 will reuse that same session for the map being edited in context. So E2 splits the work two ways:

- **State and handlers → a hook.** `packages/ui/src/hooks/useMapEditing.ts` exports `useMapEditing({ editSession, layoutData })`. It returns the editing state and handlers that `App` holds today. `App` calls it once, at the same place, so state lifetime is unchanged: it survives mode switches exactly as today.
- **Chrome → a component.** `packages/ui/src/components/MapEditingWorkspace.tsx` renders today's `<div className="app__map-editing">…</div>` subtree.

## Grounding (at dispatch)

`App.tsx` is 677 lines. Its editing pieces:

- **Module-level helpers:** `resolveEventRef(ref, map)` and `eventOpErrorMessage(e)`.
- **Event state and handlers:**
  - state: `selectedEvent`/`setSelectedEvent`, `eventOpError`, `currentMap = editSession.map ?? layout.data?.map`;
  - handlers: `onSelectEvent`, `onCanvasMoveEvent`, `onMoveEventFromInspector`, `onDeleteEvent` (with its warp-renumber `window.alert`), `onAddEvent`.
- **Tool and dialog state:**
  - tool state: `activeToolKind`, `collisionValue`, `currentStamp`;
  - dialog and banner state: `saveDialogOpen`, `signComposerOpen`, `signAddedMessage`;
  - the `activeTool` memo and `handleDiscard`.
- **Selection resets:** `changeSelection` resets `setSelectedEvent(null)` and `setCurrentStamp(null)`. Note that it does **not** reset `activeToolKind`/`collisionValue`, which persist across map switches today; that must stay true.
- **The JSX subtree** in the Map-mode `layout.data ?` branch: `Toolbar`, the collision strip, the metatile strip, the `eventOpError` alert banner, the `signAddedMessage` status banner, and `.app__map-editing-body` with `MapCanvas` + `EventInspector`.
- **Dialogs:** `SaveDialog` and `SignComposer` are rendered as siblings at the `<main>` level, for stacking reasons (see their comments). **They stay in `App`**, reading their open flags and callbacks from the hook.

## Required changes

1. **`hooks/useMapEditing.ts`:**
   - Move `resolveEventRef` and `eventOpErrorMessage` (with their doc comments) and all the state, memos and handlers listed above into it, verbatim.
   - Return an object with all of them, plus `resetForMapChange()`, which does exactly `setSelectedEvent(null); setCurrentStamp(null)`.
   - `App.changeSelection` calls `editing.resetForMapChange()` in place of those two setters, synchronously in the same handler as today.
   - Keep every existing comment, moved with its code.
2. **`components/MapEditingWorkspace.tsx`:**
   - Props: `{ mapName: string; data: MapLayoutData; editSession: UseEditSessionResult; editing: ReturnType<typeof useMapEditing>; renderCanvas?: (canvasProps: MapEditingCanvasProps) => ReactNode }`.
   - It renders the exact `.app__map-editing` subtree, with the same elements, classes, attributes and order.
   - `MapEditingCanvasProps` = the props App passes to `MapCanvas` today: `mapName`, `data`, `editSession`, `activeTool`, `onSelectEvent`, `selectedEventRef`, `onMoveEvent`, `onDropperPick`.
   - With no `renderCanvas`, it renders `<MapCanvas {...canvasProps} />`, which is today's behaviour. E4 will pass a `renderCanvas` that adds the controlled `view`/`onViewChange`. Document that seam in the component's doc comment.
3. **`App.tsx`:**
   - Call `useMapEditing`.
   - Render `<MapEditingWorkspace mapName={selected} data={layout.data} editSession={editSession} editing={editing} />` in the same branch.
   - Keep the `beforeunload` effect, `changeSelection`, the dialogs and all mode/world/dungeon logic in `App`.
   - Remove the now-unused imports.
4. **Unchanged code.** Make no CSS change. Don't change `MapCanvas`, `Toolbar`, `EventInspector`, `SaveDialog`, `SignComposer` or `useEditSession`. **Race-safety:** the paint chain (`pendingPaintRef`/`endActiveStroke`/`paintAt`/`beginStroke`) lives in `MapCanvas` and must not be touched or re-routed.

## Tests

- **Zero edits to existing test files.** After your work, `git diff <base> -- packages/ui/test` must show only **new** files.
- **New tests:**
  - **`packages/ui/test/MapEditingWorkspace.test.tsx`,** small. With a stub `editing` object, `renderCanvas` receives exactly the canvas props built from `editing` (assert `activeTool`, `selectedEventRef` and the handler identities) and its output is rendered inside `.app__map-editing-body` before `EventInspector`. Without `renderCanvas`, a `MapCanvas` stage canvas is rendered (`canvas.map-canvas__stage`).
  - **`resetForMapChange`:** one `renderHook` test of `useMapEditing` showing it clears `selectedEvent` and `currentStamp` while keeping `activeToolKind`.
- **Red-prove each new test** with an in-memory source mutation that you restore afterwards. Record the results in the report.

## Binding rules

- **Undoing experiments.** Never use `git checkout`/`git restore`/`git stash` to undo an experiment. Mutate in memory, restore the saved bytes, and byte-compare.
- **Commits.** Make pathspec commits for each green step. Leave `.codex/` alone. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **UI conventions.** No jest-dom, real tokens, no `.btn`, and no setter inside an updater.
- **Verification.**
  - Run `node node_modules/vitest/vitest.mjs run packages/ui/test/App.test.tsx packages/ui/test/MapEditingWorkspace.test.tsx packages/ui/test/MapCanvas.test.tsx packages/ui/test/EventInspector.test.tsx packages/ui/test/Toolbar.test.tsx packages/ui/test/SaveDialog.test.tsx packages/ui/test/SignComposer.test.tsx packages/ui/test/useEditSession.test.tsx`.
  - Then run `npm run typecheck` and `npm run build -w @pokemap/ui`.
  - Don't run the full suite.

## Mutations the coordinator will rerun

- **E2-M1:** `resetForMapChange` also resets `activeToolKind`. This is a behaviour change, and the hook test must go red. If no test kills it, add the assertion.
- **E2-M2:** `MapEditingWorkspace` ignores `renderCanvas`. The workspace test must go red.
- **E2-M3:** `App.changeSelection` drops the `resetForMapChange()` call. An existing `App.test.tsx` test should go red. If none does, report it: don't edit `App.test.tsx`, and add the coverage in a new test file instead.
