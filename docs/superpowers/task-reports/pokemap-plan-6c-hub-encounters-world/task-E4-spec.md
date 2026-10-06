# E4 executed spec: GBA in-context edit mode

Branch `plan-6c-hub-encounters-world`. Base: the HEAD at dispatch, after E3. Gate baseline: the latest gate plus the new tests, with the 2 known `world.test.ts` failures.

**Criterion 8, from the plan:**
- double-clicking NewBarkTown in the GBA world view shows the map-editing tools with the world visible around the map;
- pencil-painting one block and saving updates the world tile;
- "Open in Map view" and Shift+double-click switch to the Map view (done in E3);
- GBC double-click still opens the Map view, and GBC "Edit here" stays disabled (U2, done in E3).

E4 is **GBA only**. GBC code must not change.

## Building blocks already in place

- **E1.** `MapCanvas` has a controlled `view`/`onViewChange` (`components/mapView.ts`: `MapView`, `Zoom = 1|2|4`, `zoomAboutPivot`). Controlled mode never auto-fits. Use the ref'd `onViewChange` freely.
  - MapCanvas draws the composite `/api/render/:map.png?border=1` (with `&v=<paintVersion>` while editing), so the composite includes one border ring.
  - `originX = 1 * layout.borderWidth * 16` and `originY = 1 * layout.borderHeight * 16` are the composite px of the map's top-left tile.
  - Composite native scale is 16 px/tile, so MapCanvas zoom `z` = 16·z screen px per tile.
- **E2.** `App.tsx` holds `editSession = useEditSession(selected, ...)` and `editing = useMapEditing(...)`, and `MapEditingWorkspace({ mapName, data, editSession, editing, renderCanvas? })` renders the chrome: Toolbar, strips, banners, and `.app__map-editing-body` with [canvas slot, EventInspector].
  - `App` renders `SaveDialog` when `editing.saveDialogOpen && selected`, and its `onCommitted` calls `editSession.markClean()`.
  - `changeSelection(name)` returns false when the user cancels the dirty confirm.
- **E3.** `WorldCanvas` has optional `onOpenMap` and `onEditHere` props (App doesn't pass `onEditHere` yet), and the shared context-menu hook/component, whose Escape is a window keydown listener. GBA `onCanvasDoubleClick`: Shift → open the map; Ctrl/Meta/drag → return; otherwise only a warp-marker hit with warps on opens `WarpDestinationModal`.
- **GBA `WorldCanvas`** zoom = screen px per tile (`MIN_ZOOM = 1/64`, `MAX_ZOOM = 16`; 16 = native). Pan is screen px, and a map's screen rect is `(p.x*zoom + pan.x, p.y*zoom + pan.y, w*zoom, h*zoom)`, with `w`/`h` from `sizeOfPlacement`. Separate `zoom`/`pan` states are set sequentially, never nested; keep it that way. World tiles load as `/api/render/<map>.png` (no border) through `imageCacheRef`, keyed by map name.

## Coordinator rulings (design)

1. **Context zoom levels.** The world zoom must be allowed to reach 16·{1,2,4} = 16/32/64 px per tile while in context. Today `MAX_ZOOM = 16`. Raise the clamp to 64 **only while in context**. Outside context, behaviour is unchanged.
2. **No remount.** `WorldCanvas` must NOT remount when entering or leaving context, or it would lose its view, caches and toggles.
   - In World mode, `App` renders the `WorldCanvas` (key `"world"`) through `MapEditingWorkspace`'s `renderCanvas` at all times.
   - The workspace gains an optional `active?: boolean` prop (default `true`). With `active={false}` it renders only the wrapper and `.app__map-editing-body` holding the canvas slot. The Toolbar, strips, banners and EventInspector are each `{active && …}`, so React keeps the canvas slot's position and the `WorldCanvas` identity.
   - With `active` false, `data`/`editSession`/`editing` may be unused, so type them to allow a null `data` when inactive. Keep Map mode's call unchanged (`active` defaults to true).
   - Map mode's existing workspace call and all E2 tests stay unchanged.
3. **Overlay, not a second view.** In context, `WorldCanvas` renders an absolutely positioned overlay that fills its own viewport box (`.world-canvas__context`). It contains:
   - a dim layer, `background: var(--overlay-spotlight-dim)`, covering the world;
   - a `MapCanvas` in the new **`chromeless`** mode;
   - a small context bar, `.world-canvas__context-bar`, with the map name, the 1×/2×/4× zoom buttons and a **Done** button.
4. **`MapCanvas` gains `chromeless?: boolean`.** It hides `.map-canvas__toolbar` and `.map-canvas__status` and adds a root modifier `map-canvas--chromeless`, whose viewport background is transparent. Everything else is unchanged, especially the paint chain (`pendingPaintRef`/`endActiveStroke`/`paintAt`/`beginStroke`).
   - Because the toolbar is hidden, the stage canvas box equals the overlay box, which equals the world viewport box. Verify this live: the stage rect must equal the world canvas rect.
   - All painting, event clicks and drags go through `MapCanvas`'s existing handlers.
   - Known limitation, accepted for 6c: MapCanvas's Grid/Collision/Events/Encounters toggles aren't reachable in context. The collision tool still forces the collision overlay.
5. **Pure alignment math** in `packages/ui/src/world/contextView.ts`. Export and unit-test with exact numbers:
   - `snapContextZoom(worldZoom: number): Zoom` = clamp(round(log2(worldZoom / 16)), 0, 2) → 1, 2 or 4.
   - `enterContextView({ placement: {x,y,width,height}, pointer: {x,y}, zoom: Zoom }) → { zoom: number /* world px per tile = 16*zoom */, pan: {x,y} }`. It places the map's **centre** at `pointer`: `pan = round(pointer − (p.x + w/2, p.y + h/2) · 16z)`.
   - `mapViewFromWorld({ placement, worldPan, worldZoom, originX, originY }) → MapView`, with `z = worldZoom/16` and `pan = (p.x·worldZoom + worldPan.x − originX·z, p.y·worldZoom + worldPan.y − originY·z)`.
   - `worldViewFromMapView({ placement, view: MapView, originX, originY }) → { zoom: 16·view.zoom, pan: (view.pan.x + originX·z − p.x·16z, view.pan.y + originY·z − p.y·16z) }`.
   - These must be exact inverses. Test a round-trip and literal numbers, deriving them in comments. Example: p = (10, 20), originX = originY = 32, z = 2, worldPan = (5, −7) ⇒ MapCanvas pan = (10·32 + 5 − 64, 20·32 − 7 − 64) = (261, 569).
6. **The controlled loop.**
   - The overlay `MapCanvas` gets `view = mapViewFromWorld(...)` from the world's current pan/zoom.
   - Its `onViewChange(v)` sets the world view to `worldViewFromMapView(v)`. Use two sequential setters in the handler, never nested.
   - A wheel or drag over the overlay therefore pans/zooms the world in lock-step, and the zoom stays in 1/2/4.
   - The 1×/2×/4× context-bar buttons zoom about the overlay centre via `zoomAboutPivot` on the MapView, then the same conversion.
7. **Entering context.**
   - **Double-click.** A plain double-click on a map body (no modifier, no drag, no warp-marker hit when warps are on — the marker check stays first) calls `onEditHere(map)`, when that prop is supplied. The E3 menu's "Edit here" calls the same entry point.
   - **Snap pointer.** `WorldCanvas` records the pending snap pointer: the double-click point, or the menu's open position for "Edit here".
   - **App:**
     - `enterContext(name)`: if `name !== selected && !changeSelection(name)`, return; otherwise `setContextMap(name)`;
     - pass `onEditHere={enterContext}` to the World-mode `WorldCanvas` only, not Dungeon;
     - pass `context` props when `contextMap` is set: the map, the overlay render function and `onExitRequest`.
   - **Snap.** When `WorldCanvas` sees the context map become set, it applies `enterContextView` once, with `zoom = snapContextZoom(current zoom)` and the recorded pointer. If none was recorded, it uses the viewport centre.
   - **Wait for layout.** The overlay MapCanvas needs `layout.data` for that map: `App`'s `useMapLayout(selected)`, and selected == contextMap. Until it is loaded, render the dim layer and the bar only.
8. **Exiting context:**
   - **Triggers:** the Done button; Escape; or a double-click on the overlay outside the map rect (outside `[p.x·Z+pan.x, … w·Z]`, in overlay coordinates).
   - **Escape listener.** Escape is a window keydown listener, active only in context. It ignores `event.defaultPrevented`, so the E3 menu's Escape must call `preventDefault()`. Modals already stop propagation.
   - **Exit request.** Every trigger calls `onExitRequest`, which:
     - if `editSession.isDirty` → `editing.setSaveDialogOpen(true)` and stays in context. This is the existing `SaveDialog` flow; don't invent a new one;
     - otherwise → `setContextMap(null)`.
   - **Other exits.** Context also exits (without the dirty prompt; the session persists exactly as today) on:
     - a mode switch (Map/Dungeon buttons);
     - a successful `changeSelection` to another map (a tree click);
     - `selected` changing.
9. **Tile refresh after a save.**
   - `SaveDialog.onCommitted`, in App: if `contextMap === selected`, bump `tileVersions[contextMap]`, held in App state as `Record<string, number>`.
   - `WorldCanvas` takes the optional `tileVersions` prop. When a map's version changes, it drops that map's `imageCacheRef` entry and re-requests **only that map** as `/api/render/<map>.png?v=<n>`. Every later load of that map keeps `?v=<n>`.
   - No other tile is re-fetched.
10. **CSS and DESIGN.**
    - CSS: `.world-canvas__context` (absolute inset 0), the dim layer, `.world-canvas__context-bar` (top-left, `--bg-panel-raised`, `--border-strong`, the existing radius literal, `min-width: 0` text), and `.map-canvas--chromeless .map-canvas__viewport { background: transparent; }`. Real tokens only.
    - DESIGN.md: a short "In-context editing (GBA)" entry.

## Tests (test first; record red proofs)

- **`test/world/contextView.test.ts`:**
  - `snapContextZoom` at 0.5, 16, 22, 23, 45, 46 and 200. Derive each in a comment: log2(22/16) = 0.46 → 1; 23 → 0.52 → 2, and so on;
  - `enterContextView` literal numbers;
  - `mapViewFromWorld` literal numbers (the example above);
  - the round-trip identity for two cases.
- **MapCanvas:** `chromeless` hides the toolbar and status, adds the modifier class, and still draws at the controlled view. This is an addition; the existing MapCanvas tests stay unchanged.
- **WorldCanvas (additions):**
  - a plain double-click on a map body calls `onEditHere` with that map; with warps on, a double-click on a marker still opens the preview and does not call `onEditHere`; Ctrl/Shift double-click don't call it;
  - with the `context` prop set: the overlay renders, the dim layer is present, and the world view snaps (assert the exact pan/zoom from the stage draw or the overlay MapCanvas draw, using `enterContextView`'s literal);
  - the max zoom is 64 in context and 16 outside;
  - `tileVersions` bump → exactly one new image request, `/api/render/<map>.png?v=1`, and none for other maps;
  - Done, Escape and an outside double-click each call `onExitRequest`; an Escape with `defaultPrevented` does not.
- **App level (new file, e.g. `test/AppContextEdit.test.tsx`; `App.test.tsx` and the E2/E3 App files stay unchanged):**
  - double-click a map in World → the Toolbar and EventInspector appear, the world canvas is still mounted (same element: capture the node before and after), and no remount refetch of `/api/world` happens (count the calls);
  - Done when clean → the chrome is gone and World stays;
  - **Escape with a dirty session** → `SaveDialog` opens and the context stays;
  - after `SaveDialog` `onCommitted` → the world requests `/api/render/<map>.png?v=1`;
  - a cancelled dirty confirm on entering another map → no context.
- **Existing tests stay unchanged:** additions only. Check with `git diff <base> -- packages/ui/test | grep '^-[^-]'` (expect nothing). If an existing test must change, stop and report NEEDS_CONTEXT.

## Binding rules

- **Paint race-safety:** painting routes only through `MapCanvas`'s existing chain. The reviewer re-runs a `setTimeout`-delayed paint race repro (Plan 2 Task 11 lesson) against the chromeless overlay.
- **React state.** No setter inside an updater. Keep GBA `WorldCanvas`'s `zoom`/`pan` sequential setters.
- **Undoing experiments.** Never use `git checkout`/`git restore`/`git stash`. Mutate in memory, restore the bytes, and byte-compare.
- **Commits.** Pathspec commits, every message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Leave `.codex/` alone.
- **UI conventions.** No jest-dom, real tokens, no `.btn`. Cite `WorldCanvas.tsx` by grep-able anchor only.
- **Verification.** Run `node node_modules/vitest/vitest.mjs run packages/ui/test/world/contextView.test.ts packages/ui/test/MapCanvas.test.tsx packages/ui/test/WorldCanvas.test.tsx packages/ui/test/App.test.tsx packages/ui/test/MapEditingWorkspace.test.tsx packages/ui/test/AppEditingWiring.test.tsx packages/ui/test/AppWorldContextMenu.test.tsx packages/ui/test/styles.test.ts` plus your new files. Then run `npm run typecheck` and `npm run build -w @pokemap/ui`. No full suite.
- **No live corpus write.** The coordinator does the criterion-8 live write against the GBA subject with an exact-restore protocol. Implementers and reviewers must not save to the real decomp.

## Mutations the coordinator will rerun

- **E4-M1:** `mapViewFromWorld` drops the `originX·z` term. The literal-number tests must go red.
- **E4-M2:** the context zoom clamp stays at 16. The in-context max-zoom test must go red.
- **E4-M3:** the exit request ignores `isDirty` (always exits). The App Escape-dirty test must go red.
- **E4-M4:** the tile refresh drops the whole cache, or omits `?v=`. The single-request test must go red.
- **E4-M5:** the workspace renders differently when inactive, so the WorldCanvas remounts on enter. The App same-node / no-refetch test must go red.
- **E4-M6:** a double-click on a warp marker also calls `onEditHere`. The marker test must go red.
- **E4-M7:** the context Escape listener ignores `defaultPrevented`. The `defaultPrevented` test must go red.
