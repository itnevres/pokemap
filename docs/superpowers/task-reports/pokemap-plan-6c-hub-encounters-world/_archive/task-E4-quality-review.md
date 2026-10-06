# E4 code-quality review: GBA in-context edit mode

Scope `git diff 664189b 3492a84`, committed state only. Read-only: no tests run, no browser run. Findings marked (read) are derived from the code and not run live.

**Verdict: CHANGES_REQUIRED** (2 x P1, 1 x P2, rest P3).

Accepted deviations not flagged: chromeless hides the legend; the context Escape skips while a menu or modal is open (the skip is kept, only its mechanism is flagged in P1-2).

## P1

**P1-1. The tile refresh cannot work: the server `pngCache` is never invalidated on commit (read).**
- Anchors: `packages/server/src/index.ts:342-347` (`/api/render/:name.png`, key `name:border`, `pngCache.set`); commit route `index.ts:920` (`commitSave`), then `editSessions.close(name)`. A grep of `packages/server/src` finds no `pngCache.delete`/`clear`.
- Flow: the world loads `/api/render/NewBarkTown.png` (border 0) before any edit, which fills `pngCache["NewBarkTown:0"]`. While a session is open the route bypasses the cache (renders from the session), but the world never refetches then. After the commit the session is closed, and `/api/render/NewBarkTown.png?v=1` is a cache HIT. The server ignores `?v` (it parses only `border`), so it returns the pre-edit PNG. The client-side `?v` only busts the browser cache, which `cache-control: no-cache` already revalidates.
- Impact: criterion 8, "saving updates the world tile", will fail in the live write even though every unit test is green (the unit tests fake `Image`). `renderLayout` reads blockdata from disk on each call, so the cache is the only stale layer.
- Fix: in the commit route, right after `commitSave(project, plan)`, add `pngCache.clear();`. Clearing everything is the cheapest correct choice, because other maps can share the layout and the key is by map name. Add a server test in `packages/server/test/saveRoutes.test.ts`: GET render, paint and commit, GET render again, assert the bytes differ. Nothing covers render-after-commit today. The coordinator's live write will confirm.

**P1-2. The Escape guard against an open modal does not hold in a real browser (read).**
- Anchors: `WorldCanvas.tsx:1476-1484` (Escape effect: `window.addEventListener("keydown", ...)` plus `document.querySelector('[aria-modal="true"]')`). The modals close on a React `onKeyDown` on their backdrop: `SaveDialog.tsx:116-117`, `SignComposer.tsx:130-131`, `WarpDestinationModal.tsx:36-37`.
- Flow: React's root-container listener runs before the window bubble listener. For a trusted key event a microtask checkpoint runs after each listener callback. React 18 (`createRoot`, `main.tsx`) flushes the discrete update in that microtask, so the dialog is already unmounted when the window listener runs.
- Result: `querySelector` finds nothing, so Escape in the SaveDialog cancels the dialog and then calls `onExitRequest`. When dirty, that sets `saveDialogOpen` true again and the dialog reopens. This hits the dirty-exit flow and also the Toolbar Save dialog opened while in context. Cancel and Done still work.
- The jsdom tests cannot see it: `dispatchEvent`/`userEvent` runs with a non-empty stack and React flushes only at the end of `act`. The implementer's "pinned by the App test" proves nothing about the ordering.
- Fix: register the listener in the **capture** phase: `window.addEventListener("keydown", onKeyDown, true)` and remove it with `true`.
  - It then runs before any modal handler or the menu's window listener. The modal is still in the DOM and `menuOpenRef` is still true, so both existing guards become order-independent. Keep `defaultPrevented`.
  - Replace the comment's "registration order" reasoning with this.
  - Test that can fail: add a `document` bubble listener that removes the `[aria-modal]` node on Escape, mimicking the flush. Assert no `onExitRequest`. It is red today and green with capture.
- Also guard text fields (P3-level, same handler): return when `e.target` is an `input`/`textarea`/`select`/contenteditable. EventInspector fields use Escape locally; today it would also exit context or open the save dialog.

## P2

**P2-1. The snap is applied in pre-chrome coordinates, so the map lands about 58 px below the pointer (concern 7).**
- Anchors: the snap effect `WorldCanvas.tsx:1447-1466`; `viewport.w/2,h/2` fallback at `:1459`; the pointer recorded at `:389`, `:1863`, `:1879`, and in `onCanvasDoubleClick` (`{x: sx, y: sy}`, canvas-relative).
- Cause: after a double-click the selection already equals the map, so `contextLayout` is non-null in the same render. The Toolbar and strip mount in the same commit. The canvas's page top moves down by the chrome height, but the pointer was canvas-relative before the shift. `viewport` is stale until the ResizeObserver fires, so the centre fallback is stale too. Live: the world rect height went 603 to 545.
- Alignment of map and overlay is still exact, because both share the canvas frame. This only affects "map centre under the pointer" and clipping near the bottom edge.
- Cheapest fix (about 8 lines):
  1. Record **client** coordinates (`rect.left + sx`, `rect.top + sy`) at the 3 record sites.
  2. In the snap effect, read `canvasRef.current.getBoundingClientRect()` (the DOM already holds the chrome in effects) and use `pointer = client - rect`. Use `rect.width/2` and `rect.height/2` for the fallback instead of `viewport`.
  3. Gate the effect on `context.origin !== null` and add it to the deps. Then the chrome is guaranteed mounted in the same commit, which also covers the case where the map is not yet `selected` and its layout lands later. Update the "origin null shows only dim + bar" test only if it asserts no snap.
- Add a test that stubs `getBoundingClientRect` with a shifted `top` and asserts the pan.

## P3

- **P3-1. Concern 5, leftover zoom of 32/64 after exit.** `WorldCanvas.tsx:1530` clamps the wheel to `MAX_ZOOM` outside context. At zoom 64 the first wheel-in jumps to 16 (a 4x zoom-out on a wheel-in); wheel-out gives 53.
  - Clamping on exit would be worse: a visible jump on Done. Not recommended.
  - Cheap fix: use `Math.max(MAX_ZOOM, zoom)` as the upper bound. It never jumps, wheel-out works, and a zoom of 16 or less is unchanged. It also deletes `CONTEXT_MAX_ZOOM` (`:34`) and the `inContext` dep at `:1537`.
  - Today the in-context branch is dead for users: the overlay covers the world canvas, so no wheel event reaches the canvas listener in context. Zoom reaches 32/64 only through `onContextViewChange` -> `setZoom`. The "in-context max 64" test (and E4-M2) exercises a path no user can hit. If the coordinator keeps M2, leave the clamp as is; otherwise rewrite that test as "wheel-in at 64 stays 64".
  - UX otherwise acceptable: no view jump on exit.
- **P3-2. `snapPointerRef` is never cleared** (`WorldCanvas.tsx:386-389`; the comment says "consumed" but nothing consumes it). A cancelled `enterContext` leaves its point behind. It is harmless today only because every entry route overwrites it. Fix: set it to null right after reading in the snap effect.
- **P3-3. Accessibility.**
  - The bar (`:2141`) is an unlabelled `div`: give it `role="group"` and `aria-label` "Editing <map> in place".
  - The Done button's name is bare "Done": give it `aria-label` "Done editing <map>".
  - The dim layer (`:2139`) is decorative: add `aria-hidden="true"`.
  - Focus: Done unmounts on exit and focus falls to `body`. Return focus to the world canvas on exit so keyboard users keep their place.
  - The zoom group `aria-label="Zoom"` with `aria-pressed` buttons is fine.
- **P3-4. Tile reload gap.** `imageCacheRef.current.delete(map)` (`:954`) blanks the tile until the new image loads, and there is no `onerror`, so a failed reload leaves it blank (the same pre-existing gap as first loads). It is hidden under the dim layer while in context, so acceptable. If cheap, keep the old entry and swap on load.
- **P3-5. Tile race, verified OK.**
  - The old in-flight image lands on the detached `entry` object (the closure captures it), so it never writes the current entry. `setCompositeVersion` only triggers a harmless redraw.
  - `seenTileVersionsRef` is updated even for off-screen maps and the entry is deleted, so the next visible load carries `?v`.
  - A remount with a non-empty `tileVersions` loads with `?v` on the first run.
  - StrictMode: the mount double-run is idempotent (cache and `seen` refs persist). Bump and snap happen post-mount, so they are not double-applied. `setTileVersions` uses a pure updater. No setter sits inside an updater anywhere in the diff.
- **P3-6. Snap effect keyed on `[contextName, world]`** (`:1466`, with an `eslint-disable`) is correct: the `snappedForRef` guard governs re-entry, and `snappedFor` is gated at `contextView` (`:1487`), so a direct A to B change never draws a stale view. The null branch's `setSnappedFor(null)` bails out when unchanged.
- **P3-7. Workspace union and remount.** Both ternary branches in `App.tsx` (`<MapEditingWorkspace key="world-host" ...>`) share type, key and position, and the `{active && ...}` falsy placeholders keep the `.app__map-editing-body` index. No remount risk found. Keep the "same node" App test.
- **P3-8. `App.tsx:149-151` effect for `selected !== contextMap`** is setState-in-effect (one extra render). It is tested and needed for non-tree routes. Deriving `contextMap === selected` is an alternative; not worth changing.
- **P3-9. Size of the change.** `WorldCanvas.tsx` grows by 183 lines. The context block (`:1440-1512`, about 70 lines) plus the JSX (about 28 lines) is cohesive and marked, with the maths already in `contextView.ts`. A safe extraction is only the overlay JSX into a small presentational `WorldContextOverlay` (props: `context`, `contextView`, `overlayRef`, `onDoubleClick`, `onZoom`): about 25 lines moved, no state moved. Optional. Do not extract the hooks (they share the `zoom`/`pan` setters and the menu ref).

## Hygiene

- **CSS:** every token used exists in `:root`: `--overlay-spotlight-dim`, `--bg-panel-raised`, `--border-strong`, `--space-1/2/3`, `--font-data`, `--text-sm`, `--text-primary`. `min-width: 0` is on `.world-canvas__context-name`; `border-radius: 4px` matches the existing literal; the box-shadow literal is already used six times elsewhere; no `.btn` (uses `.map-canvas__btn`). The overlay's `.map-canvas` fills because the base rule has `flex: 1 1 auto; min-width: 0`. OK.
- **DESIGN entry:** accurate and complete (no remount, overlay geometry, exits, tile refresh, tokens). The behaviour stated for Escape stays correct after P1-2; only the mechanism changes.
- **Naming and doc comments:** clear. The module `contextView.ts` versus the `contextView` variable in `WorldCanvas` is a mild collision, not worth renaming. The `compositeOrigin` export is a good dedupe. The `MapEditingWorkspace` union is documented; the `renderCanvas as (...)` cast is the only wart and is commented.
- **Tests:** exact literal values with derivations (`contextView`, snap pans, the stage draw rect, `?v=1` request lists), observable behaviour (same DOM node, request counts, dialog and overlay presence), mutation-checked by the implementer, no existing test lines removed. Gaps: (1) the Escape-ordering test cannot fail in jsdom (P1-2); (2) no server-side render-after-commit test (P1-1); (3) no test for snapping with a shifted canvas rect (P2-1).
- **Spec and rule compliance:** the paint chain is untouched (`MapCanvas.tsx` diff is only `chromeless` conditionals and `compositeOrigin`); GBC code untouched; setters sequential in `onContextViewChange`; no setter in an updater.
