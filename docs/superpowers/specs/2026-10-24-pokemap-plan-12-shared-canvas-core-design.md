# Plan 12: shared canvas core (design)

Written 2026-10-24 from `master` `0e6d9af` (code = `d3bf280`), on branch `plan-12-canvas-core`. Roadmap: `plans/2026-10-14-pokemap-roadmap-unified-ui.md`, "Plan 12: shared canvas core". Starting point: Plan 11's final measurement and rulings (`task-reports/pokemap-plan-11-canvas-leaf/task-9-live.md`, `task-1-report.md`, `task-2-report.md`). Decisions D1-D18 are binding and are not re-opened here. **Tier: High** (async ordering in image loads and strokes, canvas-core behaviour, hit-testing that no test fully pins).

## Intent

One render and interaction layer for the map and world canvases. The core owns the view model, the stage, pointer handling, hit-testing helpers, the raster layer pipeline, tile caches and overlay projection. Each engine family supplies only engine facts through a surface adapter: geometry, tile and overlay drawers, hover readouts, edit bodies and its own overlays. After Plan 12 a canvas change lands once and shows in both families.

## Brainstorming rulings (user, 2026-10-24; binding)

- **P12-1 Foundation plus two surfaces.** One shared foundation (view model, stage canvas and layer stack, wheel, pan and pointer capture, drag dispatch, hit-test helpers). A **MapSurface** (cell editing) and a **WorldSurface** (map layout) sit on it. Each family's adapter supplies geometry, tile drawing and overlays. Map zoom stays stepped (`ZOOM_LEVELS` 1/2/4); world zoom stays continuous.
- **P12-2 Phases.** **12a:** foundation plus MapSurface; both map canvases move onto it. **12b:** WorldSurface; both world canvases, overlay layers, LOD and tile caches, the 6c deferrals and the `!world` placeholder. Each phase gets its own plan, reviews and merge. This spec covers both; the 12b plan is written after 12a merges, from a fresh measurement.
- **P12-3 GBC world multi-select.** In 12b GBC gets GBA's Ctrl/Cmd-click toggle, marquee selection and group move through the shared drag dispatcher. GBC keeps posting one placement per map (its route takes one map) and reloads once after all posts settle, as GBA does.
- **P12-4 Unify everything that can be unified.** Per family only what is an engine fact (see "What stays per family"). Named unifications:
  - a. Pointer capture on every canvas drag (GBA world has it; GBC world and both map canvases get it). Consequence: a drag or stroke continues outside the canvas until the button is released, instead of ending on `mouseleave`; leave then clears hover only. Tests that pin end-on-leave change under this ruling. jsdom lacks `setPointerCapture`, so the call is guarded as GBA world's is.
  - b. Pencil and collision strokes skip repeat moves within the same cell (GBC has `lastCellRef`; GBA queues every move).
  - c. World double-click with no Edit-here handler opens Map view (GBC today; GBA does nothing).
  - d. A failed warp-marker fetch shows an alert in both families (GBC today; GBA drops the error).
  - e. Both world canvases fit on first load (see P12-4e below).
  - Derived from P12-4 during design (same ruling, listed so reviews can check them):
  - f. GBA map stroke errors are shown. Today `MapCanvas` passes a no-op error report to `useStrokeChain` (`MapCanvas.tsx:257`); GBC routes it to its banner. GBA routes it to the existing dismissible `eventOpError` banner in `MapEditingWorkspace`.
  - g. Image-load tracking by URL in both map canvases (GBC's `loadedImageUrl === imageUrl` pattern). GBA's `imgLoaded` boolean reset by effect is replaced.
  - h. The `&v=` paint-version parameter is added only after the first paint bump (GBC today: `paintVersion > 0`). GBA today appends `&v=0` as soon as a session exists, which reloads the image once on session start.
  - i. One warp-marker hit radius in screen pixels (GBA 6, GBC 8): **8**.
  - j. One world zoom range expressed as scale (screen px per source px), with the in-context cap rule shared. Today GBA allows 1/64 to 16 px per 16 px tile (scale 1/1024 to 1) and GBC 1/64 to 32 px per 32 px block (scale 1/2048 to 1). Unified: scale 1/2048 to 1, and the shared in-context cap.
  - k. One map-canvas status strip and legend frame; each family supplies its readout items and legend items.
- **P12-4e World load fit, measured.** Both families fit the clusters on first load (singleton components excluded, GBA's `fitWorld` rule; GBC's `fitted` gate keeps the "no render before fit" guarantee). GBA's code comment explains why it never did: fitting puts every non-singleton placement in view and fetches each one's image on first render. The 12b live check records GBA's render-request count and the time until the canvas settles. **If GBA load is visibly slow, 12b stops for the user before it ships.**
- **P12-5 Load placeholder (re-ruled from Plan 11).** The identical `!world` error/loading `<p>` lives once, in WorldSurface.
- **P12-6 DOM overlays stay DOM.** Warp markers, connection lines, selection outlines, lens, spotlight, tooltips, menus and toasts stay DOM elements (accessibility, and the tests read them). Canvas-drawn layers stay canvas-drawn. The core gives both one world-to-screen projection, so no overlay computes its own.
- **P12-7 6c deferrals (12b).**
  - Cramped world toolbar in context mode: hide the Unplaced rail while in context (the fix recorded in RESUME, 6c deferrals).
  - A refreshed world tile is blank until its new image loads: keep drawing the previous image until the new one has decoded.
  - The encounter sprite tooltip clips at the viewport's left edge: clamp it inside the viewport.
  - "Gutter overlap at mid zoom" was recorded in 6b against the old gutter strips, which 6c B3 replaced with `EncounterBorder`. 12b re-checks it live in both families first. If adjacent maps' borders still overlap, fix it in `EncounterBorder` (shared); if not, record the evidence and close it.

## Goals

1. **Foundation (12a).** `packages/ui/src/canvas/` holds the view math, stage hook, raster layer pipeline and hit-test helpers, each with unit tests, used by both surfaces.
2. **MapSurface (12a).** One map canvas component. `MapCanvas` and `GbcMapCanvas` keep their export names and props and become thin wrappers that build their family adapter and render `MapSurface`. Callers (`MapEditingWorkspace`, `GbcMapEditing`, both in-context overlays) do not change, apart from P12-4f's error prop.
3. **WorldSurface (12b).** Same for `WorldCanvas` and `GbcWorldCanvas`, plus P12-3 and P12-7.
4. **Unifications.** Every P12-4 item is done and pinned by a test (or, for layout-only items, a live check).
5. **Measurement.** `measure.py` on each family pair (wrapper plus adapter per family) shows at most 30 aligned code lines per pair, and every remaining run is ruled in a task report.

## Non-goals

- Issues #5/#6 (Plan 13), GBC Add Event and collision editing (Plan 14), stamps and terrain (14A, 14B), minimap (16).
- Engine-side changes: render routes, payloads, server hit-testing. The core consumes today's routes.
- New features beyond P12-3 and P12-4.
- Everything the session brief lists as out of scope: GBC CLI indicator commands, undo for saves, crash-mid-swap durability.

## Anti-goals

- No DOM change except where a ruling names one (P12-3 GBC selection and marquee DOM, P12-4c/d/f, P12-4k, P12-7). Class names, `role`, `aria-*`, `data-testid`, text and element order stay otherwise.
- No canvas test is weakened. Existing tests are the oracle: they pass unchanged, except a test a ruling changes; each such change cites its ruling ID in the task report. The test count never falls.
- No surface option that only one family ever sets, unless it is an engine fact listed below (then it is an adapter field, not a flag).
- No new dependency.

## What stays per family (engine facts)

| Area | GBA | GBC |
|---|---|---|
| Paint cell | 16 px metatile | 32 px block |
| Event cell | 16 px (= paint cell) | 16 px step (half a block) |
| Composite size and origin | `BORDER_RINGS` rings of the layout's border size; `compositeOrigin(layout)` | fixed rings of 32 px; `GBC_COMPOSITE_ORIGIN` |
| Render URL | `?border=` | `?border=&time=` (time of day) |
| Raster overlays | grid, collision, elevation, events; collision forced on with the Collision tool | grid, collision (wall/water quadrants), events |
| Hover readout | metatile, collision, elevation, behaviour, event mark | metatile and four quadrant collisions |
| Edit bodies | `PaintApplyBody` (pencil, bucket, rect, shift, collision) | `GbcPaintBody` (pencil, bucket, rect, shift) |
| World native unit | 16 px tile | 32 px block |
| World canvas layers | tiles, vertical-link (dive/emerge) triangles, conflict badges | tiles, conflict badges |
| World warp projection | `(p.x + w.x)` tiles | `(p.x + w.x / 2)` blocks |
| World data | `useWorld` family hooks, encounter payloads and summarisers | `useGbcWorld`, GBC payloads |

Capability flags already in `shell/adapter.ts` (Collision tool, Elevation overlay) keep deciding which tools and toggles exist.

## Architecture

### Foundation (`packages/ui/src/canvas/`)

- **`view.ts`** (pure): view `{ zoom, pan }`; `screenToSource`, `sourceToScreen`, `zoomAboutPivot` for a stepped level list or a continuous range; fit helpers (`fitWithBand` stays where it is and is called from here). Replaces `components/mapView.ts` `zoomAboutPivot`; `mapView.ts` keeps its exports as re-exports so imports elsewhere keep working.
- **`useStage.ts`**: the stage canvas, viewport measurement (`shared/useViewportMeasure.ts`), the non-passive wheel listener with a zoom policy (stepped or continuous), pan drag, pointer capture (P12-4a), leave handling. Absorbs `shared/useCanvasView.ts`'s controlled-view plumbing, auto-fit and fit callback (F shortcut, context fit); those exports stay as re-exports until 12b removes the last consumer.
- **`useRasterComposite.ts`**: the base image tracked by URL (P12-4g), an ordered list of raster layers (each `draw(raster)`), the offscreen composite, `compositeVersion`, and the blit with stage decorations (selection ring, drag preview). This is the map pair's recomposite and blit effects, once.
- **`cells.ts`** (pure): client point to cell for a given cell size and origin, clamped and raw; cell to client `DOMRect` (sign anchor).

### MapSurface (12a)

`canvas/MapSurface.tsx` renders the toolbar groups (shared `CanvasZoomBar`, `OverlayToggleGroup`, `LegendBar`), the viewport (`MapCanvasViewport`), the `EncounterBorder`, and the shared status strip (P12-4k). It owns: toggles state and its reset on map change, encounter toggle, hover state and the hover-metatile callback, paint-version debounce (`PAINT_VERSION_DEBOUNCE_MS`), the stroke chain (`useStrokeChain`) with its error report routed to a prop (P12-4f), same-cell skip (P12-4b), event select and drag, dropper, sign pick and pan.

`MapSurfaceAdapter` (built per render by each wrapper; typed per family by generics) supplies: geometry (composite size, origin, paint cell, event cell), the image URL builder, the raster overlay list (key, label, legend items, `draw`), `hoverAt(cell)` and status items, `paintBody(tool, cell)` and `finishBody(tool, start, end)`, `findEventAt(eventCell)`, `eventPosition(selected)`, `dropperStamp(cell)`, the border side and encounter band, and the encounter-summary family key. The exact field list is the plan's call; the rule is that MapSurface contains no `family ===` branch.

### WorldSurface (12b, outline; the 12b plan details it)

`canvas/WorldSurface.tsx` on the same foundation: continuous zoom with the shared range (P12-4j), first-load fit (P12-4e), the per-map image cache with LOD small tiles (`shared/worldTiles.ts`) and previous-image retention on refresh (P12-7), culling, the canvas layer list (tiles, adapter layers, conflict badges), one world-to-screen projection for DOM overlays (P12-6), the drag dispatcher (pan, map, group, marquee; P12-3), click, Ctrl/Cmd-click, double-click (P12-4c), context menu, placement commits through `shared/placementLedger.ts`, warp markers with one hit radius (P12-4i) and their error alert (P12-4d), and the `!world` placeholder (P12-5). `WorldSurfaceAdapter` supplies the native unit, image URLs, world data hooks, encounter fetch and summariser, extra canvas layers, warp projection, placement POST, and status readouts.

## Constraints

- Tests are the oracle (Anti-goals). Async tests run under `timeout`; DOM-mutating probes never go inside `waitFor` (LESSONS: Testing; use a bounded `act` timer loop as in `test/world/placementResync.test.tsx`).
- "One refresh per X" claims are counted through a `vi.mock` wrapper of the hook, never by GET counts (React batches same-tick updates).
- Code moves keep their rationale comments; every task diffs removed comment lines (Codex drops them).
- Gate, typecheck, UI build before every commit touching `packages/`; 4 workers (LESSONS: Windows / Tooling).

## Acceptance

### 12a

1. Foundation modules exist with unit tests: view math (stepped and continuous zoom about a pivot, screen/source round trip, fit), cell lookup (raw, clamped, both cell sizes, anchor rect), raster composite (layer order, recomposite on input change, no composite before the current URL has loaded, stale URL load ignored).
2. `MapCanvas` and `GbcMapCanvas` render `MapSurface`; existing map-canvas tests pass unchanged except those changed by P12-4b/f/g/h, each named.
3. New tests pin P12-4a (map pan and stroke keep pointer capture), P12-4b (GBA same-cell moves queue once), P12-4f (a GBA stroke rejection shows the banner), P12-4g (GBA stale image load does not composite), P12-4h (GBA URL has no `&v=` until a paint bump), P12-4k (both families' status strips render through one component).
4. High-risk mutation checks: breaking the same-cell skip, the URL load guard, the stroke-error route and the cell math each fail at least one test.
5. Measurement: map pair at most 30 aligned code lines; remaining runs ruled.
6. Live acceptance in both families (Map view and in-context editing): zoom buttons and wheel, Fit, each overlay toggle and legend, hover readout, pencil stroke (one POST per new cell), rect, bucket, dropper, event drag, sign pick, a forced stroke error (`page.route` 500) showing the banner. Subjects byte-identical after; manifests unchanged.
7. Gate count not below 3,533; typecheck and UI build pass. `DESIGN.md` gains a Plan 12 table.

### 12b

1. `WorldCanvas` and `GbcWorldCanvas` render `WorldSurface`; existing world tests pass unchanged except those a ruling changes, each named.
2. Tests pin P12-3, P12-4a/c/d/e/i/j, P12-5 and P12-7 (refreshed tile keeps its old image; tooltip clamp).
3. Mutation checks on hit-testing, the drag dispatcher, LOD selection and image retention.
4. Measurement: world pair at most 30 aligned code lines; remaining runs ruled.
5. Live acceptance in both families: World and Dungeon modes, wheel and Fit, first-load fit with GBA request count and settle time recorded (P12-4e), Ctrl-click and marquee and group move in both, placement commit and reload count, warp markers and their forced-error alert, lens, spotlight, context menu, in-context editing at 1024 px wide (toolbar not cramped), border overlap re-check at mid zoom, tooltip at the left edge.
6. Gate, typecheck, build; subjects byte-identical; `DESIGN.md` updated; RESUME and roadmap updated.

## Left to the builder

- The adapter field list and generic shape, as long as the surfaces hold no family branch.
- Whether a family adapter lives in the wrapper file or its own module (`gba/mapSurface.ts`, `gbc/mapSurface.ts`).
- When to delete `shared/useCanvasView.ts` and `components/mapView.ts` re-exports (latest: end of 12b).

## Review record

(Filled by the spec review.)
