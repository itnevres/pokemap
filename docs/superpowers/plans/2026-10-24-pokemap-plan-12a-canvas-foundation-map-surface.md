# Plan 12a: canvas foundation and MapSurface — Implementation Plan

**STATUS (2026-10-24):** planned and approved by review (spec and plan: Codex astra, 3 rounds); not started. Awaiting the user's go-ahead.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared canvas foundation (`packages/ui/src/canvas/`) and one `MapSurface`, then move both map canvases onto it, with the P12-4 unifications that touch the map pair.

**Architecture:** Pure modules first (view math, cell math), then the two foundation hooks (raster composite, stage), then `MapSurface` tested against a fake adapter, then each family becomes a thin wrapper plus adapter: GBC first (it already has the target behaviours for P12-4b/g/h), GBA second (it gains them). The existing map-canvas tests are the oracle for both wrapper tasks.

**Tech Stack:** TypeScript, React, Vitest (existing). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md` (rulings P12-1 to P12-7; 12a acceptance; review record). Read it with this plan. Plan 12b (WorldSurface) gets its own plan after 12a merges.

## Global Constraints

- Branch `plan-12-canvas-core` (from `master` `0e6d9af`; code = `d3bf280`).
- Gate before every commit touching `packages/`, from the repo root, as a background command: `npm test -- --maxWorkers=4 --minWorkers=1 > <scratch>/run.txt 2>&1`, strip ANSI, `grep -a "Test Files|Tests"`; then `npm run typecheck` and `npm run build -w @pokemap/ui`. Baseline **3,533 pass / 0 fail / 218 files**. Never the default worker count (it has crashed this PC); `--maxWorkers` alone runs 0 tests. Known load-only flakes: rerun alone first (GbcApp palette tests, GbcAppEditing "beforeunload", App.test "P selects Pencil").
- Commit with explicit pathspecs. Never push or merge without the user. Merges use merge commits.
- **Tests are the oracle.** Existing tests pass unchanged, except a test a ruling changes (P12-4a/b/f/g/h/k/l); the task report names each changed test and its ruling. The test count never falls. `git diff --stat -- packages/ui/test` is part of every task report.
- No DOM change except where a ruling names one: class names, `role`, `aria-*`, `data-testid`, text, element order.
- `MapSurface` and the foundation hold no `family ===` branch. Engine facts come from the adapter (spec, "What stays per family").
- Moved code keeps its rationale comments. Each task report lists removed comment lines (`git diff -U0 | grep '^-\s*//'`) and where each went.
- Async tests use deferred promises the test resolves by hand; never a DOM-mutating probe inside `waitFor` (use a bounded `act` timer loop, as `test/world/placementResync.test.tsx` `expectNeighbourY`). Run new async tests under `timeout`, then kill leftover vitest/tinypool node processes.
- "Once per X" claims are counted through a `vi.mock` wrapper of the hook, never by request counts.
- Implementers go through the `delegate` skill (Codex in a scratch worktree with `node_modules` junctions to absolute targets; Codex cannot run vitest or vite build, so Claude runs every check). Reviews: separate spec and quality reviews for High tasks (Opus tier: Codex `gpt-6-astra`; fallback Claude Opus subagent, logged); one combined review for Medium tasks (Codex `gpt-5.6-terra`).
- Task reports: `docs/superpowers/task-reports/pokemap-plan-12-canvas-core/task-<N>-<role>.md` (global rule 7). Measurement script: `task-reports/pokemap-plan-11-canvas-leaf/measure.py`, run from `packages/ui/src` with Windows paths (`cygpath -w`).
- Subjects are read only, except the live-check backup/restore protocol: GBA `C:/Programming Projects/Pokemon Game/game` (HEAD `718b89f73`, exactly 8 porcelain lines, the user's own; never restore them), PerfPlus (HEAD `81ededbe3`, clean, no `.pokemap`). Manifests GBA `a0349693144d`, GBC `13a31cb654ff`.

## Review Focus

1. No behaviour change outside the named rulings: every changed test cites P12-4a/b/f/g/h/k/l; P12-8 guarantees hold (GBC oracle unchanged; GBA oracle's delayed no-bump assertion kept, value "no `v`").
6. The stroke chain stays registered with the shell (`onStrokeChain`), so a discard still waits for queued strokes.
2. Image-load ordering: a load event for an old URL never composites over the current map (P12-4g); the composite never runs before the current URL has loaded.
3. Stroke ordering: the shared chain keeps begin/apply/end order and map-switch retirement; same-cell skip resets on map switch and on stroke end (P12-4b).
4. Cell math: GBA 16 px paint and event cells; GBC 32 px paint cell and 16 px event step; raw vs bounded (`null` outside, never clamped) lookups keep today's call sites (rect/shift end uses the raw cell).
5. No family branch in `canvas/`.

## Baseline (record in Task 1's report; a different number is a finding)

- Map pair `components/MapCanvas.tsx` vs `gbc/GbcMapCanvas.tsx`: 427 / 443 code lines, 167 aligned, 30 runs.
- World pair (unchanged by 12a; recorded for 12b): 1113 / 799 code lines, 189 aligned, 42 runs (re-measured 2026-10-24 on `master`).

---

### Task 1: Pure view and cell math (`canvas/view.ts`, `canvas/cells.ts`) — High

Tier reason: hand-derived numeric fixtures (High trigger); pure, so tests come first.

**Files:**
- Create: `packages/ui/src/canvas/view.ts`, `packages/ui/src/canvas/cells.ts`, `packages/ui/test/canvas/view.test.ts`, `packages/ui/test/canvas/cells.test.ts`
- Modify: `packages/ui/src/components/mapView.ts` (re-export `zoomAboutPivot` and types from `canvas/view.ts`; no caller changes)

- [ ] Step 1: Record the baseline measurement. Write failing tests with fixtures derived by hand in the test file's comments: `zoomAboutPivot` for a stepped level list (keeps the pivot's source point fixed; same results as today's `mapView.ts` for 1→2→4 and back, pan rounded to whole pixels, a fractional pivot included) and for a continuous range with clamping (pan stays fractional); zoom to the current level returns the same object; `screenToSource`/`sourceToScreen` round trip; `rawCell` and `boundedCell` (16 px and 32 px cells, negative coordinates floor correctly, far edge exclusive, `boundedCell` returns `null` outside and never clamps); `cellRect` → client `DOMRect` with canvas CSS scaling (today's `signAnchor` math in both canvases); `fitView` (wraps `encounters/fit.ts` `fitWithBand` for the stepped policy) with hand-derived fixtures: a map smaller and larger than the viewport, with and without the encounter band, each border side, and the zero-viewport fallback (today's `vw || pixelWidth`).
- [ ] Step 2: Implement until green. `mapView.ts` keeps its exports by re-export; existing `mapView` and `fit` tests pass unchanged.
- [ ] Step 3: Mutation check: an off-by-one in the floor, a clamp in `boundedCell`, rounding in the continuous policy, a swapped pivot sign, and a dropped band in `fitView` each fail a test. Gate; commit.

### Task 2: Raster composite hook (`canvas/useRasterComposite.ts`) — High

Tier reason: async ordering between image loads and the composite (High trigger).

**Files:**
- Create: `packages/ui/src/canvas/useRasterComposite.ts`, `packages/ui/test/canvas/useRasterComposite.test.tsx`

Behaviour (from both map canvases' recomposite and blit effects, unified per P12-4g and the spec's SR-I7 rules): input `imageUrl`, `imgRef`, composite size, ordered layers (`{ key, enabled, deps, draw(raster) }`), stage canvas ref, view, and a `decorate(ctx)` callback with its own `deps` for the selection ring and drag preview. Loaded state is `loadedUrl === imageUrl`; the `onLoad` handler records the URL it loaded; an image already `complete && naturalWidth > 0` on URL change counts as loaded (GBC `GbcMapCanvas.tsx`); an `error` never counts. The composite re-runs only when the load state, the size, the ordered list of layer keys, or a layer's `enabled`/`deps` change (compared by value per entry, never by array or closure identity) and bumps `compositeVersion`; the blit runs on `compositeVersion`, view, viewport and the decoration `deps`.

- [ ] Step 1: Failing tests with deferred image loads: no composite before the current URL loads; a load for the previous URL after a URL change does not composite; a cached complete image composites without a load event (StrictMode); a failed image never composites; layers draw in list order and only when enabled; reordering or replacing a layer after the first composite recomposites in the new order; one `getImageData`/`putImageData` pair per composite and none when no layer is enabled; no recomposite on a re-render with fresh-but-equal layer arrays and closures, on view change or on an unrelated prop; the blit uses `drawImage(base, 0, 0, w, h, pan.x, pan.y, w*zoom, h*zoom)`; `decorate` runs after the blit.
- [ ] Step 2: Implement until green. Mutation: drop the URL comparison (stale load composites); compare layers by identity (recomposite loop or extra composite); ignore key order (stale order after a reorder) → each fails a test. Gate; commit.

### Task 3: Stage hook (`canvas/useStage.ts`) — High

Tier reason: canvas-core interaction (wheel, pan, pointer capture) used by every surface.

**Files:**
- Create: `packages/ui/src/canvas/useStage.ts`, `packages/ui/test/canvas/useStage.test.tsx`
- Modify: `packages/ui/src/shared/useCanvasView.ts` (its four hooks become thin re-exports or delegate to `useStage`; consumers unchanged until Tasks 5-6), `packages/ui/src/shared/MapCanvasViewport.tsx` (adds optional `onPointerDown`, `onPointerCancel`, `onLostPointerCapture` props; mouse props unchanged)

Event boundary (spec P12-4a, PR-I2): gestures stay on the React mouse handlers; the pointer handlers only take capture, release it and report cancel. They never start or commit a gesture.

Behaviour: controlled or own view (today's `useCanvasView`), viewport measurement (`shared/useViewportMeasure.ts`), non-passive wheel with a zoom policy (`{ kind: "stepped", levels }` now; `{ kind: "continuous", min, max, factor }` reserved for 12b and tested here), pan drag from a start point, pointer capture on drag start with the spec's P12-4a termination contract (capture held: end on pointer up anywhere, leave clears hover only; `pointercancel`/unexpected `lostpointercapture`: an `onCancel` callback; capture refused or missing: `captured = false`, so the surface keeps today's end-on-leave), auto-fit once per map and the fit callback with the F shortcut and context fit (today's `useCanvasAutoFit`/`useCanvasFit`, including `chromeless`).

- [ ] Step 1: Failing tests: wheel steps through levels about the pointer and clamps at the ends (stepped, pan rounded) and multiplies by the factor with clamping (continuous, pan fractional); one controlled `onViewChange` per wheel notch under StrictMode, none for a no-op; pan drag moves by the client delta; capture requested on drag start; missing or throwing `setPointerCapture` reports `captured = false` without throwing; `pointercancel` and `lostpointercapture` call `onCancel` once; a pointerdown followed by its compatibility mousedown starts one gesture, not two; auto-fit runs once per map name and never when controlled (mutation: drop the once-per-map guard → a test fails); F calls fit unless chromeless.
- [ ] Step 2: Implement; re-run the existing map-canvas and context tests that cover wheel, Fit and auto-fit: unchanged and green. Gate; commit.

### Task 4: `MapSurface` and its adapter contract — High

Tier reason: the shared stroke, event-drag and hover behaviour of both families (async stroke ordering).

**Files:**
- Create: `packages/ui/src/canvas/MapSurface.tsx`, `packages/ui/src/canvas/mapSurfaceAdapter.ts` (types), `packages/ui/src/shared/MapStatusStrip.tsx` (P12-4k), `packages/ui/test/canvas/MapSurface.test.tsx` (fake adapter)

Behaviour: everything the spec's "MapSurface" section lists. Pointer flow, in today's order: sign pick (bounded cell; outside → nothing) → event select/drag when no tool (raw event cell) → dropper (bounded paint cell) → stroke start (bounded paint cell; rect/shift record the start) → pan. Move: event-drag preview → pencil/collision queue with same-cell skip (P12-4b) while the chain is open and the primary button is down → pan → hover (`adapter.hoverAt(sourcePoint)`). Up: event-drag commit only when the cell changed → stroke finish with the **raw** end cell → pan end. Leave: hover cleared; ends strokes and drags only when capture was not taken (P12-4a fallback). Cancel (`pointercancel`/lost capture): stroke `finish(null)`, event drag dropped with no commit. The chain's error report goes to an `onEditError` prop (P12-4f). The chain is registered through the `onStrokeChain` prop on mount and unregistered on cleanup, exactly as today (`MapCanvas.tsx:258-261`, `GbcMapCanvas.tsx:311-314`; PR-I3). The hovered-metatile callback fires on id change only (P12-4l). Paint-version debounce follows the adapter's `skipFirstBlocksChange` (P12-8); the timer is cleared on map change and unmount. Toggles, encounter toggle, hover and same-cell memory reset on map change. Encounter presentation inputs (GBC `time`) reach the legend and `EncounterBorder` without refetching summaries or refitting.

- [ ] Step 1: Write the adapter type from the spec's list; write failing fake-adapter tests for each flow above: outside clicks edit nothing; the same-cell skip (two moves in one cell queue once; a new cell queues; a new stroke after finish queues the first cell again; map switch resets it); the termination contract (outside release finishes once; cancel finishes with `null` and applies no rect/shift; fallback without capture ends on leave); the error route; `onStrokeChain` called with the live chain on mount and `false` on unmount; hover callback on id change only; both `skipFirstBlocksChange` values; the reset on map change; the status strip rendering the adapter's items.
- [ ] Step 2: Implement `MapSurface` on Tasks 1-3 plus the existing shared `CanvasZoomBar`, `OverlayToggleGroup`, `LegendBar`, `MapCanvasViewport`, `EncounterBorder`, `useStrokeChain`. No family branch.
- [ ] Step 3: Mutation: remove the same-cell skip; route errors to a no-op; use the bounded cell for the stroke end; finish a cancelled stroke with its last cell; drop the `onStrokeChain` registration. Each fails a test. Gate; commit.

### Task 5: GBC map canvas onto `MapSurface` — High

Tier reason: replaces a family canvas; existing tests are the oracle.

**Files:**
- Create: `packages/ui/src/gbc/mapSurface.ts` (GBC adapter: 32 px block paint cell, 16 px event step, `GBC_COMPOSITE_ORIGIN`, `?time=` URL, `skipFirstBlocksChange: false`, grid/collision/events drawers with their colour resolution and `deps`, hover by 16 px step via `gbcStepInfo` with the full readout (step coordinates, quadrants with the active one emphasised, border-substitution note, events), `time` for the encounter legend suffix and `EncounterBorder`, `GbcPaintBody`)
- Modify: `packages/ui/src/gbc/GbcMapCanvas.tsx` (wrapper: same export, same props)

- [ ] Step 1: Build the adapter by moving code out of `GbcMapCanvas.tsx` (keep comments). The wrapper renders `MapSurface`.
- [ ] Step 2: Run the GBC map-canvas tests (`test/gbc/GbcMapCanvas*.test.tsx`, `GbcApp*`, `GbcAppContext*`) and the full gate. Expected unchanged; only P12-4a (end-on-leave becomes the no-capture fallback; jsdom has no capture, so most leave tests should still pass), P12-4k and P12-4l (per-move hover calls) may change a test, each named and replaced per the spec. `GbcMapCanvasEdit.test.tsx:206-215` and the time re-dim test (`GbcMapCanvas.test.tsx:613`) pass unchanged.
- [ ] Step 3: Add two tests through the real `GbcMapCanvas`: (a) pan the view, switch `time`, complete the new image's load, assert the view is unchanged and fit was not called (no refit); (b) inside a `useStrokeChainRegistry` host, start a stroke whose apply is a deferred promise, assert `strokeSettled()` stays pending until it resolves. Mutation: drop the registration → (b) fails.
- [ ] Step 4: `measure.py` progress note. Gate; commit.

### Task 6: GBA map canvas onto `MapSurface`, with P12-4f/g/h — High

Tier reason: replaces a family canvas and changes GBA behaviour under three rulings.

**Files:**
- Create: `packages/ui/src/gba/mapSurface.ts` (GBA adapter: 16 px cells, `compositeOrigin(layout)`, border-ring size, `skipFirstBlocksChange: true` (P12-8; `MapCanvas.test.tsx:427-441` keeps its delayed no-bump assertion, expected value "no `v`" under P12-4h), grid/collision/elevation/events drawers and event marks, collision forced on with the Collision tool, hover readout with behaviour and mark, `PaintApplyBody` incl. collision strokes, dropper stamp)
- Modify: `packages/ui/src/components/MapCanvas.tsx` (wrapper: same export; gains `onEditError`), `packages/ui/src/components/MapEditingWorkspace.tsx` (add `onEditError` to its canvas-props `Pick` (`:19-22`) and to the `canvasProps` object (`:79-93`), routed to `setEventOpError`). Verify `packages/ui/src/gba/adapter.tsx:99`: it spreads those props into the chromeless in-context canvas, so no extra handler should be needed there.
- Test: new tests for P12-4b (GBA), P12-4f (rejected stroke shows the banner, in Map view and in context mode), P12-4g (stale GBA image load does not composite), P12-4h (no `&v=` until the first paint bump), and stroke-chain registration through the real `MapCanvas` (deferred apply keeps `strokeSettled()` pending)

- [ ] Step 1: Write the new tests; confirm each fails on today's code for the right reason (the registration test passes today; it guards the move: mutate the registration away after Step 2 and see it fail).
- [ ] Step 2: Build the adapter and wrapper; wire `onEditError`.
- [ ] Step 3: Run the GBA map tests (`MapCanvas*.test.tsx`, `MapEditingWorkspace*`, `App*`, `AppContext*`) and the full gate. Only tests pinning `&v=0` (incl. `MapCanvas.test.tsx:427-441`'s expected value), a no-op stroke error, end-on-leave, or per-render hover calls may change, each named with its ruling.
- [ ] Step 4: Gate; commit.

### Task 7: Measurement, mutation evidence, docs — Medium

Tier reason: checks and docs.

**Files:**
- Modify: `packages/ui/DESIGN.md` ("Shared modules": Plan 12 table for `canvas/*`, `shared/MapStatusStrip.tsx`, `gba/mapSurface.ts`, `gbc/mapSurface.ts`)
- Report: `task-7-report.md`

- [ ] Step 1: Concatenate each family's owned files (wrapper, then adapter) into one temp file per family with a `// FILE: <path>` line before each (spec Goal 5 procedure); run `measure.py --all` on the two temp files. Target: at most 30 aligned code lines; rule every remaining run. Read both adapters side by side for renamed or reordered duplication and record what you found.
- [ ] Step 2: Collect the mutation results from Tasks 1-6 in one table (mutation, failing test).
- [ ] Step 3: Confirm `canvas/` has no family branch: `rg -n -i 'gba|gbc|family' packages/ui/src/canvas`, inspect every match, and read `MapSurface.tsx` for indirect branching (e.g. checks on adapter fields that only one family sets, other than declared engine facts). Gate; commit.

### Task 8: Live acceptance (both families) — Medium

Tier reason: checks only, and no subject write is possible: every save commit and world write is intercepted (Step 2), and edit applies touch only the hub's in-memory session.

**Files:**
- Report: `task-8-live.md`, drivers and screenshots under `task-8-shots/` (copy `lib.mjs`, `map.mjs` from `task-reports/pokemap-plan-11-canvas-leaf/task-9-shots/`)

- [ ] Step 1: Back up GBA `.pokemap/`; record manifests with `task-reports/pokemap-plan-10a2-pokemon-indicator/task-6-shots/manifest.sh`. Real `serve.ts` with the `--import` preload remapping 5174→5184, scratch `POKEMAP_HOME`, Vite on 5183, headless Chromium shell 1248 via the cached `playwright-core`.
- [ ] Step 2: Before any page loads, `page.route` every `POST` whose path ends in `/commit` and every `POST` to `/api/world/placement` or `/api/world/dungeons` to `fulfill({ status: 500 })`, and count them; the hub's request log must show none of them. Never click Save to completion. Then, each family, Map view and in-context editing: zoom buttons, wheel (mouse back over the canvas after Fit), Fit, each overlay toggle and legend, hover readout and status strip, pencil stroke (network: one apply per new cell), rect, bucket, dropper, event drag, sign pick, a pencil drag released outside the canvas (the stroke ends once; Undo enabled; no further applies), a stroke apply forced to 500 with `page.route` (banner shown; nothing reaches the subject), GBC time switch re-dims the encounter border without a refetch. Leave each map with Discard, so no session survives.
- [ ] Step 3: Restore; manifests unchanged; GBA exactly 8 porcelain lines; PerfPlus clean with no `.pokemap`. Stop servers by port.

### Task 9: Final review and handoff docs — High (review only)

- [ ] Step 1: Full gate, typecheck, UI build; record the count (not below 3,533).
- [ ] Step 2: Final whole-branch review (Opus tier: Codex `gpt-6-astra`; fallback Claude Opus subagent). Fix findings; re-review.
- [ ] Step 3: Update this plan's STATUS, RESUME (Git state and Unified UI row), roadmap Plan 12 status; the spec's review record. Commit. Stop for the user before push or merge.
