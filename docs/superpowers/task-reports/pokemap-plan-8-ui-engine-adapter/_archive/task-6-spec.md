# Task 6 executed spec (coordinator, 2026-10-13)

BASE: 8121835. Plan text: `task-6-brief.md`. Where this spec and the brief differ, this spec wins.
Sources: `packages/ui/src/components/MapEditingWorkspace.tsx` (GBA, 160 lines), `packages/ui/src/hooks/useMapEditing.ts` (GBA per-map state, 332), `packages/ui/src/gbc/GbcMapEditing.tsx` (GBC, 206), mount sites `App.tsx:310-336`, `gbc/GbcApp.tsx:305-345`.

## What the two sides share today, and what differs

Shared shape: `{active && <Toolbar …>}` … `<div className="app__map-editing-body">{canvas}{active && <side panel>}</div>`, where `canvas = renderCanvas ? renderCanvas(canvasProps) : canvasProps && <FamilyCanvas {...canvasProps} />` and `canvasProps` is null unless `mapName !== null && data !== null`, and spreads `onStrokeChain` only when given (Task 3).

Differs, and stays per family:
- GBA wraps everything in `<div className="app__map-editing">`; GBC returns a fragment (its host `GbcApp` supplies that div).
- Above the body: GBA has Toolbar, collision strip, metatile strip (tool-dependent), event-op error banner, sign-added banner; GBC has Toolbar and its error banner. Beside the canvas: GBA `EventInspector`; GBC `.gbc-map-editing__rail` (palette over inspector), shown only with a map.
- GBA per-map state lives in the hook `useMapEditing`, called once in `App`. It survives Map ↔ World mode switches (those mount different `MapEditingWorkspace` elements). Its reset is `resetForMapChange()`, called from `App.select`. It has NO visit-identity guard: a deferred event-op callback from map A (`onAddEvent` → `setSelectedEvent({index:newIndex})`, `onDeleteEvent` → `setSelectedEvent(null)`, the move handlers, `handleDiscard`'s `.then/.catch` → `setEventOpError`) lands on whatever map is showing when it resolves.
- GBC per-map state lives inside the `GbcMapEditing` component (`pick`, `err`, `warn` as `{forMap,…}`), retired by a render-phase visit check (lines 65-78) and guarded by `isCurrent()` (A→B→A safe).

## Rulings

- **R1: per-visit state stays in hooks; the shared visit logic is a hook, not a component.** Moving GBA's per-map state into the workspace component (the plan's literal "move into the shared workspace") would drop GBA's stamp/selection on every Map ↔ World switch, because the two modes mount different workspace elements: an unnamed behaviour change. So the visit identity and its guard become `shared/useVisit.ts`, used by `GbcMapEditing` (where the state already lives) and by `useMapEditing` (where GBA's lives). GBA gains the A→B→A protection exactly as the plan intends. Cost if wrong: none user-visible; the plan's "inside the workspace" placement differs.
- **R2: `WorkspaceSlots` becomes nodes, not component types.** The families' palettes/inspectors take unrelated props and sit in different places (GBA strips above the canvas, GBC rail beside it), so a `Palette: ComponentType<{mapKey,onPick}>` slot would need adapters in both families for no gain. The shared shell is:
  ```ts
  // packages/ui/src/shared/EditingWorkspace.tsx
  export interface WorkspaceSlots<CanvasProps> {
    /** Rendered only while active, before the body (toolbar, strips, banners). */
    top: React.ReactNode;
    /** Rendered only while active, inside the body after the canvas (inspector / rail). */
    side: React.ReactNode;
    /** Null while there is no map (inactive host before load). */
    canvasProps: CanvasProps | null;
    /** The family's own canvas, used when renderCanvas is absent. */
    Canvas: React.ComponentType<CanvasProps>;
  }
  export function EditingWorkspace<CanvasProps>(props: WorkspaceSlots<CanvasProps> & {
    active: boolean;
    renderCanvas?: (canvasProps: CanvasProps | null) => React.ReactNode;
  }): JSX.Element // <>{active && top}<div className="app__map-editing-body">{canvas}{active && side}</div></>
  ```
  `buildCanvasProps` stays the one expression each family already has (it now feeds `canvasProps`); it must keep the Task 3 `...(onStrokeChain ? { onStrokeChain } : {})` spread in both families. Cost if wrong: Task 7's adapter `slots` field is node-shaped, not component-shaped.
- **R3: the visit hook.**
  ```ts
  // packages/ui/src/shared/useVisit.ts
  export interface Visit {
    /** True on the render where `key` changed from the previous visit (before children render). The caller resets
     *  its per-visit state in that same render (setState during render), as GbcMapEditing does today. */
    changed: boolean;
    /** False once this render's visit is no longer the committed one (key changed, including A → B → A, or unmount). */
    isCurrent(): boolean;
  }
  export function useVisit(key: string | null): Visit;
  ```
  Implementation is GBC's current code moved verbatim (state `{ mapName }`, render-phase `setVisit`, `useLayoutEffect` committing to a ref and nulling it on cleanup, `isCurrent = () => ref.current === visit`). A → B → A must give a NEW visit object for the second A.
- **R4: GBC.** `GbcMapEditing` keeps its export, props and DOM. It replaces its inline visit code with `useVisit(mapName)`, runs its existing three resets when `changed`, and renders through `EditingWorkspace` (fragment output, so `GbcApp`'s wrapper div is unchanged). No other change.
- **R5: GBA.** `useMapEditing` takes a new OPTIONAL arg `mapName?: string | null` (absent → the key never changes, so `useMapEditing.test.tsx` is unaffected); `App.tsx` passes `selected` (its only change). Inside: `const visit = useVisit(mapName ?? null)`; when `visit.changed`, reset `selectedEvent`, `currentStamp` and `eventOpError` in that render. Every deferred `.then`/`.catch` in `onCanvasMoveEvent`, `onMoveEventFromInspector`, `onDeleteEvent` (including its `window.alert`), `onAddEvent` and `handleDiscard` first checks `visit.isCurrent()` and returns if false. `resetForMapChange` stays exported and still called by `App.select` unchanged (its test and the workspace test mocks use it). `activeToolKind`, `collisionValue`, `saveDialogOpen`, `signComposerOpen`, `signAddedMessage` are not per-visit and are untouched. The returned object's keys stay exactly as today. `MapEditingWorkspace` keeps its export, props, and DOM, and renders through `EditingWorkspace` inside its `<div className="app__map-editing">`.
- **R6: named GBA behaviour changes** (plan-named: "per-visit state … pick, err, warn"): (a) a deferred event-op result from a previous visit no longer selects/deselects an event or sets/clears the error banner on the current map; (b) the event-op error banner is retired on a map visit change (today it persists across maps; the comment at `useMapEditing.ts:76-82`/`232-234` that says "never auto-cleared on map switch" is updated for eventOpError only — `signAddedMessage` keeps that rule). Each gets a GBA witness (Tests 3). Cost if wrong: a GBA user switching maps loses a stale error banner they had not dismissed.
- **R7: deferred minors** — none folded in (the chain registry and SaveDialog state are App-shell concerns for Task 7; Task 5's Q2 is core-hook scope).

## Tests (new files only; every existing test file stays byte-unchanged)

1. `packages/ui/test/shared/useVisit.test.tsx`:
   - `changed` is true exactly on the first render with a new key, false on re-renders with the same key; a host that resets a `{forMap}` state when `changed` never renders a child with the previous key's value (record every value a child receives).
   - a guard captured during visit A returns false after A → B, and after A → B → A (the second A is a new visit); true while A is still current.
   - unmount makes a captured `isCurrent` return false.
2. `packages/ui/test/shared/EditingWorkspace.test.tsx` (stub `Canvas` that renders `<canvas data-testid="c" />`):
   - active: renders `top`, the body with the canvas, then `side` (DOM order); inactive: renders only `.app__map-editing-body` with the canvas, no `top`/`side` nodes.
   - toggling `active` false → true → false keeps the SAME canvas DOM node and the same body node.
   - `renderCanvas` given: its output replaces `Canvas` and it receives `canvasProps` (including `null`).
3. GBA family witnesses, new file `packages/ui/test/AppVisitGuard.test.tsx` (copy the harness style of `App.test.tsx` `makeEditFetchMock`: PalletTown and Route1 maps; stub `window.confirm` → true):
   - **A → B → A deferred add:** select PalletTown (Map mode), click "Add Event" with the `/event/add` POST held on a deferred promise, select Route1, select PalletTown again, resolve the add with a 200 `{ map, isDirty: true }`. Expect the EventInspector shows no selected event (its empty state, e.g. the "Add Event" button is present and no X/Y form for index N). Must FAIL before R5 (red log) and pass after.
   - **deferred failure:** same, but resolve with 500 → no `role="alert"` banner on PalletTown. Fails before R5.
   - **error retired on switch:** a failed add on PalletTown shows the alert; select Route1 → no alert. Fails before R5.
   - **plan Step 3 mirror:** in World context (copy `AppContextEdit.test.tsx`'s harness), pencil + pick a metatile on map A, tree-click B, re-enter A: the stamp is not current, the pencil tool stays pressed, the world canvas and `.app__map-editing-body` nodes are the same. Expected to PASS before R5 too (GBA's `resetForMapChange` already clears the stamp); record that in the report as a regression pin, not a red witness.
4. GBC: no new family test needed (`GbcMapEditing.test.tsx` "retires stamp, event and error on an actual visit, including A to B to A" and `GbcAppContext.test.tsx` "different-map tree visits retire…" already pin R4); they must stay green unchanged.

## Teeth-proof (coordinator, after implementation)

- V1 `useVisit` never reports `changed` → must kill shared + GBC + GBA (error-retired witness).
- V2 `isCurrent` always true → must kill shared + GBC + GBA (deferred add/failure witnesses).
- V3 `EditingWorkspace` keys/moves the body by `active` (remount) → must kill shared + `MapEditingWorkspaceActive.test.tsx` + `GbcAppContext.test.tsx` node-identity tests.

## Oracle

`git diff 8121835 -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` prints nothing. No server/core/cli changes. No new dependencies.
