# Plan 12: shared canvas core (design)

Written 2026-10-24 from `master` `0e6d9af` (code = `d3bf280`), on branch `plan-12-canvas-core`. Roadmap: `plans/2026-10-14-pokemap-roadmap-unified-ui.md`, "Plan 12: shared canvas core". Starting point: Plan 11's final measurement and rulings (`task-reports/pokemap-plan-11-canvas-leaf/task-9-live.md`, `task-1-report.md`, `task-2-report.md`). Decisions D1-D18 are binding and are not re-opened here. **Tier: High** (async ordering in image loads and strokes, canvas-core behaviour, hit-testing that no test fully pins).

## Intent

One render and interaction layer for the map and world canvases. The core owns the view model, the stage, pointer handling, hit-testing helpers, the raster layer pipeline, tile caches and overlay projection. Each engine family supplies only engine facts through a surface adapter: geometry, tile and overlay drawers, hover readouts, edit bodies and its own overlays. After Plan 12 a canvas change lands once and shows in both families.

## Brainstorming rulings (user, 2026-10-24; binding)

- **P12-1 Foundation plus two surfaces.** One shared foundation (view model, stage canvas and layer stack, wheel, pan and pointer capture, drag dispatch, hit-test helpers). A **MapSurface** (cell editing) and a **WorldSurface** (map layout) sit on it. Each family's adapter supplies geometry, tile drawing and overlays. Map zoom stays stepped (`ZOOM_LEVELS` 1/2/4); world zoom stays continuous.
- **P12-2 Phases.** **12a:** foundation plus MapSurface; both map canvases move onto it. **12b:** WorldSurface; both world canvases, overlay layers, LOD and tile caches, the 6c deferrals and the `!world` placeholder. Each phase gets its own plan, reviews and merge. This spec covers both; the 12b plan is written after 12a merges, from a fresh measurement.
- **P12-3 GBC world multi-select.** In 12b GBC gets GBA's Ctrl/Cmd-click toggle, marquee selection and group move through the shared drag dispatcher. GBC keeps posting one placement per map (its route takes one map) and reloads once after all posts settle, as GBA does.
- **P12-4 Unify everything that can be unified.** Per family only what is an engine fact (see "What stays per family"). Named unifications:
  - a. Pointer capture on every canvas drag (GBA world has it; GBC world and both map canvases get it). Termination contract (SR-I2):
    - Capture held: the drag or stroke continues outside the canvas and ends on pointer up, wherever it happens; leave clears hover only.
    - `pointercancel` or an unexpected `lostpointercapture`: a stroke ends exactly once with no end cell (as today's leave: `chain.finish(null)`, so no rect or shift is applied); an event drag or map drag is cancelled with no commit.
    - Capture refused or unavailable (`setPointerCapture` missing or throwing; jsdom lacks it): today's leave behaviour stays as the fallback (strokes end on leave; GBA world's commit-on-leave for a map drag stays as it is, `WorldCanvas.tsx:1775-1800`).
    - Map switch or unmount: the stroke chain retires queued work as today (`useStrokeChain`); open drags are dropped.
    - Event boundary (PR-I2): the gesture flow stays on React mouse handlers (existing tests dispatch mouse events, e.g. `MapCanvas.test.tsx:592`, `GbcMapCanvasEdit.test.tsx:76`). Pointer handlers only take capture (`onPointerDown`, as GBA world's `onPointerDownCapture`), release it, and report `pointercancel`/`lostpointercapture`; they never start or commit a gesture, so a real mouse's pointer plus compatibility mouse events cannot act twice. `MapCanvasViewport` gains those pointer props.
    - Tests that pin end-on-leave are replaced by tests of this contract (outside release ends once; cancel applies nothing; fallback path ends on leave), never just deleted. Live acceptance covers a release outside the canvas.
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
  - l. One hover-notification policy (SR-I3): the palette's hovered-metatile callback fires when the hovered metatile id changes, including to `null` on leave and map switch (GBA today, `MapCanvas.tsx:352-360`). GBC today calls it on every move (`GbcMapCanvas.tsx:518`); a GBC test that counts per-move calls changes under this ruling.
  - m. One world fit and jump policy (SR-I5; 12b). Manual Fit fits the clusters (singleton components excluded, GBA's rule, `WorldCanvas.tsx:667-719`); if no cluster qualifies it fits every scoped placement; an empty world is a no-op. The dungeon filter fits the filter's maps (GBA's rule). Jump-to-map fits the map to about 60% of the viewport (GBC's `jumpFit`; GBA fits 100% today). Tests pinning GBC's all-placement Fit (`GbcWorldCanvas.test.tsx:1323-1342`) and GBA's 100% jump change under this ruling.
- **P12-8 Paint-version trigger stays a session-hook fact (design ruling, SR-I1).** GBA's `useEditSession` re-seeds `blocks` once after a map switch, so `MapCanvas` skips the first `blocks` change (`MapCanvas.tsx:296-338`; pinned by `MapCanvas.test.tsx:427-441`). GBC's session does not, and bumps on the first same-map change with a session (`GbcMapCanvas.tsx:373-386`; pinned by `GbcMapCanvasEdit.test.tsx:206-215`). Unifying the two edit-session hooks is outside Plan 12, so the adapter declares `skipFirstBlocksChange` (a fact about its session hook). Both trigger guarantees stay: the GBC oracle passes unchanged; the GBA oracle keeps its delayed assertion (the reseed schedules no bump), but its expected value changes from `"0"` to "no `v` parameter" under P12-4h (PR-I1). Shared rules: the pending timer is cancelled on map switch and unmount; the version only grows within a map.
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
5. **Measurement.** At most 30 aligned code lines per pair, every remaining run ruled in a task report. Procedure (SR-M3): `measure.py` takes two files, so each family's owned files (wrapper, then adapter module(s), in a fixed order listed in the report) are concatenated into one temporary file per family, with a `// FILE: <path>` line before each so runs can be attributed back. Because the script only finds aligned runs of 3+ identical normalised lines, the reviewer also reads both adapters side by side for renamed or reordered duplication; splitting code across files is not a way to pass.

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
| Hover resolution and readout | 16 px cell: metatile, collision, elevation, behaviour, event mark | 16 px step (not the 32 px paint cell): step coordinates, metatile, four quadrant collisions with the active quadrant emphasised, border-substitution note, events at that step (`GbcMapCanvas.tsx:511-518`, `:734-740`) |
| Encounter presentation | none time-dependent | time of day: legend suffix (`GbcMapCanvas.tsx:711`), `EncounterBorder` `time` (`:724`); a time switch re-dims sprites without refetching summaries or refitting (`GbcMapCanvas.test.tsx:613`) |
| Paint-version trigger | skip the first `blocks` change after a map switch (P12-8) | bump on the first same-map change with a session |
| Edit bodies | `PaintApplyBody` (pencil, bucket, rect, shift, collision) | `GbcPaintBody` (pencil, bucket, rect, shift) |
| World native unit | 16 px tile | 32 px block |
| World canvas layers | tiles, vertical-link (dive/emerge) triangles, conflict badges | tiles, conflict badges |
| World warp projection | `(p.x + w.x)` tiles | `(p.x + w.x / 2)` blocks |
| World data | fetch and reconciliation inline in `WorldCanvas.tsx:509-567` (moving it behind the adapter is 12b work; it must keep the snapshot capture before React state updaters, `:535-539`); GBA encounter payloads and summariser | `useGbcWorld` (`GbcWorldCanvas.tsx:480`); GBC payloads and summariser |

Capability flags already in `shell/adapter.ts` (Collision tool, Elevation overlay) keep deciding which tools and toggles exist.

## Architecture

### Foundation (`packages/ui/src/canvas/`)

- **`view.ts`** (pure): view `{ zoom, pan }`; `screenToSource`, `sourceToScreen`, `zoomAboutPivot` for a stepped level list or a continuous range. Rounding contract (SR-I8): the stepped policy rounds pan to whole stage pixels (today's `mapView.ts:24-28`); the continuous policy keeps fractional pan (both world canvases today). A zoom to the current level returns the same view object (no-op identity, so controlled callers see no change). Fit helpers (`fitWithBand` stays where it is and is called from here). Replaces `components/mapView.ts` `zoomAboutPivot`; `mapView.ts` keeps its exports as re-exports so imports elsewhere keep working.
- **`useStage.ts`**: the stage canvas, viewport measurement (`shared/useViewportMeasure.ts`), the non-passive wheel listener with a zoom policy (stepped or continuous), pan drag, pointer capture (P12-4a), leave handling. Absorbs `shared/useCanvasView.ts`'s controlled-view plumbing, auto-fit and fit callback (F shortcut, context fit); those exports stay as re-exports until 12b removes the last consumer.
- **`useRasterComposite.ts`**: the base image tracked by URL (P12-4g), an ordered list of raster layers (each `draw(raster)`), the offscreen composite, `compositeVersion`, and the blit with stage decorations (selection ring, drag preview). This is the map pair's recomposite and blit effects, once. Invalidation is semantic (SR-I7): each layer declares its inputs (a `deps` list of the real raster inputs, e.g. blocks, layout, events, enabled flag), and the composite re-runs only when the image URL's load state, the size, the ordered list of layer keys (membership or order, PR-I5), or a layer's declared inputs change, never on adapter or closure identity. No recomposite for pan, zoom, hover, the encounter toggle, or an unchanged parent re-render (`MapCanvas.test.tsx:1089-1098` pins the encounter case). Readiness keeps GBC's rules: an image already `complete` with `naturalWidth > 0` on URL change counts as loaded (cached re-entry under StrictMode, `GbcMapCanvasView.test.tsx:199-232`); a failed image never counts as loaded; a load for an older URL is ignored.
- **`cells.ts`** (pure), three distinct lookups (SR-I6): **raw** (unbounded cell, may be negative or past the edge), **bounded** (the cell, or `null` outside the layout; never clamped to an edge), and cell to client `DOMRect` (sign anchor). There is no numeric clamp: an outside pencil, bucket, dropper or sign click edits nothing (bounded → `null`), while rect and shift end cells and event-drag releases use the raw cell, as today (`MapCanvas.tsx:594-600`, `:729-770`; `GbcMapCanvas.tsx:529-532`, `:632-658`).

### MapSurface (12a)

`canvas/MapSurface.tsx` renders the toolbar groups (shared `CanvasZoomBar`, `OverlayToggleGroup`, `LegendBar`), the viewport (`MapCanvasViewport`), the `EncounterBorder`, and the shared status strip (P12-4k). It owns: toggles state and its reset on map change, encounter toggle, hover state and the hover-metatile callback, paint-version debounce (`PAINT_VERSION_DEBOUNCE_MS`), the stroke chain (`useStrokeChain`) with its error report routed to a prop (P12-4f) and its registration through `onStrokeChain` kept (register on mount, unregister on cleanup, as `MapCanvas.tsx:258-261` / `GbcMapCanvas.tsx:311-314`; the shell waits on it before a discard, `shell/FamilyApp.tsx:82-86`, `:282`) (PR-I3), same-cell skip (P12-4b), event select and drag, dropper, sign pick and pan.

`MapSurfaceAdapter` (built per render by each wrapper; typed per family by generics) supplies: geometry (composite size, origin, paint cell, event cell), the image URL builder, `skipFirstBlocksChange` (P12-8), the raster overlay list (key, label, legend items, `deps`, `draw`), `hoverAt(sourcePoint)` (the source-pixel position, so each family resolves its own hover unit: GBA cell, GBC step) and status items, encounter presentation inputs (GBC `time`: legend suffix and `EncounterBorder` dimming), `paintBody(tool, cell)` and `finishBody(tool, start, end)`, `findEventAt(eventCell)`, `eventPosition(selected)`, `dropperStamp(cell)`, the border side and encounter band, and the encounter-summary family key. The exact field list is the plan's call; the rule is that MapSurface contains no `family ===` branch.

### WorldSurface (12b, outline; the 12b plan details it)

`canvas/WorldSurface.tsx` on the same foundation: continuous zoom with the shared range (P12-4j), first-load fit (P12-4e), the per-map image cache with LOD small tiles (`shared/worldTiles.ts`) and previous-image retention on refresh (P12-7), culling, the canvas layer list (tiles, adapter layers, conflict badges), one world-to-screen projection for DOM overlays (P12-6), the drag dispatcher (pan, map, group, marquee; P12-3), click, Ctrl/Cmd-click, double-click (P12-4c), context menu, placement commits through `shared/placementLedger.ts`, warp markers with one hit radius (P12-4i) and their error alert (P12-4d), and the `!world` placeholder (P12-5). `WorldSurfaceAdapter` supplies the native unit, image URLs, world data hooks, encounter fetch and summariser, extra canvas layers, warp projection, placement POST, and status readouts.

## Constraints

- Tests are the oracle (Anti-goals). Async tests run under `timeout`; DOM-mutating probes never go inside `waitFor` (LESSONS: Testing; use a bounded `act` timer loop as in `test/world/placementResync.test.tsx`).
- "One refresh per X" claims are counted through a `vi.mock` wrapper of the hook, never by GET counts (React batches same-tick updates).
- Code moves keep their rationale comments; every task diffs removed comment lines (Codex drops them).
- Gate, typecheck, UI build before every commit touching `packages/`; 4 workers (LESSONS: Windows / Tooling).

## Acceptance

### 12a

1. Foundation modules exist with unit tests: view math (stepped and continuous zoom about a pivot, screen/source round trip, fit with hand-derived fixtures including the encounter band), cell lookup (raw, bounded returning `null` outside, both cell sizes, anchor rect), raster composite (layer order and a post-mount reorder, recomposite on input change, no composite before the current URL has loaded, stale URL load ignored).
2. `MapCanvas` and `GbcMapCanvas` render `MapSurface`; existing map-canvas tests pass unchanged except those changed by P12-4a/b/f/g/h/k/l, each named, and each replaced by an assertion that keeps the guarantee it pinned (SR-M2). The P12-8 guarantees hold: `GbcMapCanvasEdit.test.tsx:206-215` passes unchanged; `MapCanvas.test.tsx:427-441` keeps its delayed no-bump assertion with the expected value changed to "no `v`" (P12-4h).
3. New tests pin P12-4a (the termination contract: outside release ends once, cancel applies nothing, fallback ends on leave), P12-4b (GBA same-cell moves queue once), P12-4f (a GBA stroke rejection shows the banner), P12-4g (GBA stale image load does not composite; cached image counts as loaded), P12-4h (GBA URL has no `&v=` until a paint bump), P12-4k (both families' status strips render through one component), P12-4l (GBC hover callback fires on id change only), the raster invalidation rule (no recomposite on pan, hover, encounter toggle or parent re-render), the rounding contract (fractional pivot, stepped rounds, continuous keeps fractions, no-op identity, one controlled callback per gesture under StrictMode), a GBC time switch that re-dims encounters without refetch or refit (the test pans first, switches time, completes the new image load, and asserts the view is unchanged), and stroke-chain registration through the real wrappers (a deferred apply keeps the shell's settle pending; PR-I3). A GBA stroke error shows the banner in Map view and in context mode.
4. High-risk mutation checks: breaking the same-cell skip, the URL load guard, the stroke-error route, the bounded-vs-raw cell choice, the termination contract, the raster invalidation (values and key order), the auto-fit guard and the stroke-chain registration each fail at least one test.
5. Measurement: map pair at most 30 aligned code lines; remaining runs ruled.
6. Live acceptance in both families (Map view and in-context editing): zoom buttons and wheel, Fit, each overlay toggle and legend, hover readout, pencil stroke (one POST per new cell), rect, bucket, dropper, event drag, sign pick, a forced stroke error (`page.route` 500) showing the banner. No save is ever committed: the driver routes every `POST …/commit` and every world write (`/api/world/placement`, `/api/world/dungeons`) to a 500 and asserts none reached the hub (PR-I6). Edit applies only touch the hub's in-memory session. Subjects byte-identical after; manifests unchanged.
7. Gate count not below 3,533; typecheck and UI build pass. `DESIGN.md` gains a Plan 12 table.

### 12b

1. `WorldCanvas` and `GbcWorldCanvas` render `WorldSurface`; existing world tests pass unchanged except those a ruling changes, each named.
2. Tests pin P12-3, P12-4a/c/d/e/i/j/m, P12-5 and P12-7 (refreshed tile keeps its old image; tooltip clamp).
3. Mutation checks on hit-testing, the drag dispatcher, LOD selection and image retention.
4. Measurement: world pair at most 30 aligned code lines; remaining runs ruled.
5. Live acceptance in both families: World and Dungeon modes, wheel and Fit, first-load fit with GBA request count and settle time recorded (P12-4e), Ctrl-click and marquee and group move in both, placement commit and reload count, warp markers and their forced-error alert, lens, spotlight, context menu, in-context editing at 1024 px wide (toolbar not cramped), border overlap re-check at mid zoom, tooltip at the left edge.
6. Gate, typecheck, build; subjects byte-identical; `DESIGN.md` updated; RESUME and roadmap updated.

## Left to the builder

- The adapter field list and generic shape, as long as the surfaces hold no family branch.
- Whether a family adapter lives in the wrapper file or its own module (`gba/mapSurface.ts`, `gbc/mapSurface.ts`).
- When to delete `shared/useCanvasView.ts` and `components/mapView.ts` re-exports (latest: end of 12b), but only after a source-and-test import inventory shows no consumer (SR-M4). Known consumers beyond the canvases: `world/contextView.ts`, `shared/useWorldContext.ts`, `shared/CanvasZoomBar.tsx`, and tests such as `MapCanvas.test.tsx`. Exported helpers and types keep their contracts.

## Review record

**Spec review 1 (2026-10-24, Codex `gpt-6-astra`, Opus tier): Needs rework, 0 Critical / 8 Important / 4 Minor.** Report: `task-reports/pokemap-plan-12-canvas-core/spec-review.md`. Every finding was checked against the code and accepted:
- SR-I1 paint-version policies differ and are both pinned → new ruling P12-8 (adapter `skipFirstBlocksChange`; both oracles kept).
- SR-I2 pointer capture needed a termination contract → P12-4a contract.
- SR-I3 GBC hover resolves by 16 px step → `hoverAt(sourcePoint)`, readouts listed, P12-4l notification policy.
- SR-I4 GBC time drives encounter presentation → engine-facts row, adapter input, acceptance test.
- SR-I5 world manual Fit and jump differ beyond first load → P12-4m.
- SR-I6 "clamped" was wrong (today's lookup returns `null` outside) → raw / bounded lookups, no clamp.
- SR-I7 raster invalidation and cached-image readiness → semantic `deps`, readiness rules.
- SR-I8 rounding differs (stepped rounds, continuous keeps fractions) → rounding contract.
- SR-M1 GBA world data is inline, not `useWorld` → table fixed. SR-M2 exception list → P12-4a/k/l added. SR-M3 measurement of split files → concatenation procedure plus side-by-side read. SR-M4 re-export deletion → import inventory first.

**Spec re-review and plan review (2026-10-24, Codex `gpt-6-astra`): Spec approved with fixes; plan needs rework; 0 Critical / 6 Important / 3 Minor.** Report: `task-reports/pokemap-plan-12-canvas-core/plan-review.md`. All checked against the code and accepted:
- PR-I1 the GBA P12-8 oracle expects `"0"` (`MapCanvas.test.tsx:441`), which P12-4h removes → guarantee kept, expected value changes.
- PR-I2 `MapCanvasViewport` is mouse-only and tests dispatch mouse events → gesture flow stays on mouse handlers; pointer handlers only manage capture.
- PR-I3 the stroke-chain `onStrokeChain` registration was not carried → kept, with an integration test and mutation.
- PR-I4 fit fixtures and the time-switch no-refit test were unassigned → acceptance and plan Tasks 1, 5.
- PR-I5 layer reorder escaped invalidation → ordered keys invalidate.
- PR-I6 the live check could write subjects → every commit and world write is intercepted; no save.
- PR-M1 "clamped" leftovers → bounded. PR-M2 GBA `onEditError` call sites named (`MapEditingWorkspace.tsx` props `Pick` and `canvasProps`; `gba/adapter.tsx:99` spreads them in context). PR-M3 the family-branch check now uses `rg -i` over the folder.
