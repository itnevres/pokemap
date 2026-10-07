# E1 executed spec: `MapCanvas` view fixes + controlled view (GBA)

Branch `plan-6c-hub-encounters-world`. Base: the HEAD at dispatch. Gate baseline: `npm test` gives 2,042 pass / 2 fail. Both failures are the known `packages/server/test/world.test.ts` pair, caused by the GBA subject's persisted `dungeonAutoLayout:false`, so don't chase them.

This retires the follow-ups plan's Task D1 and D2 (`docs/superpowers/plans/2026-09-23-pokemap-followups-remaining.md`, "Task D"). `packages/ui/src/gbc/GbcMapCanvas.tsx` is the proven reference implementation.

## Grounding (measured at dispatch)

- `packages/ui/src/components/MapCanvas.tsx` (1,016 lines) has two separate states, `const [zoom, setZoom] = useState<Zoom>(1)` and `const [pan, setPan] = useState({ x: 0, y: 0 })`.
- **The D1 bug** is in `applyZoom`: `setZoom((prevZoom) => { ... setPan((prevPan) => ...) ... })`. That is a setter inside an updater, so `<StrictMode>` (`main.tsx`) applies the pan twice.
- **Other view writers:**
  - `fit()` calls `setZoom(z); setPan(p)`;
  - the pan drag in `onMouseMove` calls `setPan({ x: d.panX + ..., y: ... })`;
  - the wheel handler (a native listener with `{ passive: false }`) and the zoom buttons (`applyZoom(z, ...centerPivot())`) call `applyZoom`.
- **Readers of `zoom`/`pan`:** the draw effect, `hoverAt`, the cell-from-client math, the drag start, the encounter-border entries, and `zoom={zoom * METATILE_PX}`.
- **`ZOOM_LEVELS = [1, 2, 4] as const; type Zoom`** is identical in both files.
- **GBC reference:**
  - `GbcMapCanvas.tsx` exports `interface GbcView { zoom: Zoom; pan: {x,y} }` and the pure `zoomAboutPivot(view, next, pivotX, pivotY)`, which returns the same object when `next === view.zoom`;
  - it holds one `const [view, setView] = useState<GbcView>(...)`, with `applyZoom = (next, px, py) => setView((v) => zoomAboutPivot(v, next, px, py))`;
  - `test/gbc/GbcMapCanvas.test.tsx` imports `zoomAboutPivot` and `type GbcView` from `../../src/gbc/GbcMapCanvas.js`, and has the `describe("GbcMapCanvas under <StrictMode> ...")` test to mirror.
- **D2 (CSS):**
  - `.map-canvas` (`styles.css`) has `flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column` and no `min-width`.
  - The GBC root is `className="map-canvas gbc-map-canvas"`. The three `.gbc-map-canvas` rules fix the same overflow for GBC: `min-width: 0`, a fixed 44 px wrapping `.map-canvas__status` strip, and an ellipsising `.map-canvas__hover`.
  - The GBA root is `className="map-canvas"`.
- **`packages/ui/test/styles.test.ts`** parses the sheet strictly with lightningcss and has no `gbc-map-canvas` pins.

## Required changes

1. **Share the view math.** Create `packages/ui/src/components/mapView.ts` exporting:
   - `ZOOM_LEVELS = [1, 2, 4] as const`;
   - `type Zoom`;
   - `interface MapView { zoom: Zoom; pan: { x: number; y: number } }`;
   - `zoomAboutPivot` (moved verbatim from GbcMapCanvas, typed on `MapView`).

   `GbcMapCanvas.tsx` imports these, and keeps `export type GbcView = MapView` plus a re-export of `zoomAboutPivot`, so `test/gbc/GbcMapCanvas.test.tsx` passes **unchanged**. Delete GbcMapCanvas's local `ZOOM_LEVELS`/`Zoom` in favour of the import. `MapCanvas.tsx` imports them too and drops its own copies.
2. **D1: one view state in `MapCanvas`.** Replace `zoom`/`pan` with a single view. Rules:
   - `applyZoom` becomes a pure updater around `zoomAboutPivot`;
   - `fit()` sets the whole view in one call;
   - the pan drag updates `pan` through one updater, or a direct value;
   - no setter is ever called inside another setter's updater;
   - keep `const { zoom, pan } = view` for the readers, so the diff stays small.
3. **Controlled view** (the props E4 needs):
   - Add optional `view?: MapView` and `onViewChange?: (next: MapView) => void` to `MapCanvasProps`, with doc comments.
   - **Uncontrolled** (no `view` prop): behaviour is exactly as today.
   - **Controlled** (a `view` prop): the canvas renders `props.view` and never owns view state. Every would-be change goes through `onViewChange(next)`: zoom buttons, wheel, pan drag, and the Fit button. Compute `next` from the current `props.view`, outside any React updater.
   - **Controlled also means no automatic first-load fit.** The `fittedForMapRef` effect must not call `onViewChange` on image load; the parent owns placement. The explicit Fit button still reports the fitted view via `onViewChange`.
   - **One write path.** A small local `updateView(next | (v) => next)` helper that branches on controlled vs. uncontrolled is fine. Don't add a second state.
4. **D2: CSS.**
   - Move the three `.gbc-map-canvas` rules onto the shared `.map-canvas` selectors: `.map-canvas` gets `min-width: 0`, plus `.map-canvas .map-canvas__status { ... }` and `.map-canvas .map-canvas__hover { ... }` with the same declarations.
   - Then delete the now-redundant `.gbc-map-canvas` rules and keep their explanatory comments. GBC renders identically, because its root also carries `map-canvas`.
   - Add a `styles.test.ts` pin that parses the sheet and asserts that `.map-canvas` declares `min-width: 0`. Follow the file's existing parse helpers.
5. **Docs.** In `docs/superpowers/plans/2026-09-23-pokemap-followups-remaining.md` Task D, mark D1 and D2 **DONE in Plan 6c E1 (`<sha>`)**, like D3's existing DONE line.
6. **Nested-updater check.** Re-run the follow-up's check for nested setters in `WorldCanvas.tsx` (`grep -n "setZoom((" packages/ui/src/components/WorldCanvas.tsx`, and look for any setter inside a setter's updater). Report the result; don't change WorldCanvas.

## Tests (test first; record each red run in your report)

- **StrictMode (D1),** in `packages/ui/test/MapCanvas.test.tsx`: a new `describe("MapCanvas under <StrictMode> (Plan 6c E1, follow-up D1)")` mirroring the GBC test.
  - Render `<StrictMode><MapCanvas .../></StrictMode>` using the file's existing fixtures and mocks.
  - Fit, then click "2×", then "4×". Pin the exact `drawImage` destination x/y after each step: the single-application `pivot − (pivot − pan0)·k` with `Math.round`, derived in a comment from the fit pan you observe.
  - Also assert it is NOT the doubled value.
  - **Must be red on the current code before your fix.** Paste the red output summary into the report.
- **Controlled view:**
  - with `view={{zoom:2, pan:{x:7,y:-3}}}`, the first draw uses dest x/y `(7,-3)` and size ×2;
  - clicking "4×" calls `onViewChange` once with `zoomAboutPivot(view, 4, centre)`, and does not redraw at 4 until the parent passes the new view;
  - a pan drag reports `onViewChange` with the dragged pan;
  - an image load in controlled mode never calls `onViewChange` (no auto-fit);
  - the Fit button does call it.
- **CSS:** the `styles.test.ts` pin above.
- **Unchanged:** every existing test in `test/MapCanvas.test.tsx` and `test/gbc/GbcMapCanvas.test.tsx`, and all other GBA UI tests, must pass **unchanged** (U1). Check with `git diff <base> -- packages/ui/test | grep -c '^-[^-]'`; it must be 0 outside additions. If any existing test needs editing, stop and report NEEDS_CONTEXT instead.

## Binding rules

- **Race-safety stays untouched.** Don't touch `pendingPaintRef`/`endActiveStroke`/`paintAt`/`beginStroke`.
- **Undoing experiments.** Never use `git checkout`/`git restore`/`git stash` to undo an experiment. Mutate in memory, restore from the saved bytes, and byte-compare.
- **Commits.** Commit each green step with pathspec commits. Don't touch `.codex/` or `pokemap.config.json`.
- **UI conventions.** No jest-dom matchers (use plain DOM reads), real CSS tokens only, no `.btn`, and cite `WorldCanvas.tsx` by grep-able anchor only.
- **Verification.** Run `node node_modules/vitest/vitest.mjs run packages/ui/test/MapCanvas.test.tsx packages/ui/test/gbc/GbcMapCanvas.test.tsx packages/ui/test/styles.test.ts`, then `npm run typecheck` and `npm run build -w @pokemap/ui`. Don't run the full suite; the coordinator runs the gate.

## Mutations the coordinator will rerun (make sure your tests kill them)

- **E1-M1:** restore the nested pattern, with `setPan` inside the zoom updater, or equivalently apply `zoomAboutPivot` twice. The StrictMode test must go red.
- **E1-M2:** remove `min-width: 0` from `.map-canvas`. The styles pin must go red.
- **E1-M3:** in controlled mode, ignore `props.view` and render the internal state. The controlled first-draw test must go red.
- **E1-M4:** in controlled mode, auto-fit on load and report it. The no-auto-fit test must go red.
