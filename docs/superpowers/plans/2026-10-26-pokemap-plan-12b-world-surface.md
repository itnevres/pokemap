# Plan 12b: WorldSurface — Implementation Plan

**STATUS (2026-10-26): plan written, under review; not started.** Waits for the user's go-ahead after the plan review.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move both world canvases onto one `canvas/WorldSurface.tsx` built on the 12a foundation, with GBC multi-select (P12-3), the world unifications (P12-4a/c/d/e/i/j/m/n/o/p/q), the `!world` placeholder (P12-5) and the 6c deferrals (P12-7), and close the 12a carry-overs.

**Architecture:** Carry-over cleanup first. Then pure world view and fit math, then the two world hooks (tile cache, drag dispatcher), then `WorldSurface` in two steps against a fake adapter (render and view; interaction and commits). Then each family becomes a thin wrapper plus adapter: GBC first (it already has first-load fit, the `fitted` gate, the warp alert, the 60% jump and the keys), GBA second (it gains them, and its inline world data moves behind the adapter). The existing world tests are the oracle for both wrapper tasks.

**Tech Stack:** TypeScript, React, Vitest (existing). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md` (rulings P12-1..P12-8 plus the 12b rulings P12-4n..q recorded 2026-10-26; "What stays per family"; "WorldSurface (12b, outline)"; 12b acceptance; review record). Read it with this plan. 12a plan for format and history: `plans/2026-10-24-pokemap-plan-12a-canvas-foundation-map-surface.md`.

## Global Constraints

- Branch `plan-12b-world-surface` from `master` `935d981` (code = 12a merge `58f7213`).
- Gate before every commit touching `packages/`, from the repo root, as a background command (never `&`): `npm test -- --maxWorkers=4 --minWorkers=1 > <scratch>/run.txt 2>&1`, strip ANSI, `grep -a "Test Files|Tests"`; then `npm run typecheck` and `npm run build -w @pokemap/ui` (the `gate` skill). Baseline **3,634 pass / 0 fail / 226 files**. Never the default worker count (it has crashed this PC); `--maxWorkers` alone runs 0 tests; never two vitest runs at once. Known load-only flakes: rerun alone first (GbcApp palette tests, GbcAppEditing "beforeunload", App.test "P selects Pencil").
- Commit with explicit pathspecs. Never push or merge without the user. Merges use merge commits.
- **Tests are the oracle.** Existing tests pass unchanged, except a test a ruling changes; the task report names each changed test and its ruling ID. The test count never falls. `git diff --stat -- packages/ui/test` is part of every task report. Expected ruling changes (from the 2026-10-26 ledger, `task-reports/pokemap-plan-12b-world-surface/ledger.md`; line numbers on `935d981`): P12-4c `WorldCanvasContext.test.tsx:144`, `WorldCanvas.test.tsx:1728`, `:2617`; P12-4e GBA initial-zoom/culling cases `WorldCanvas.test.tsx:357`, `:487`, `:515`, `:2282`; P12-4j bound fixtures `WorldCanvas.test.tsx:466-477`, `GbcWorldCanvas.test.tsx:251-258`; P12-4m GBC Fit-all `GbcWorldCanvas.test.tsx:685`, `:1323`, GBA 100% jump `WorldCanvas.test.tsx:1458`, `:1488`; P12-4p GBA same-map re-jump `WorldCanvas.test.tsx:1488-1530`. Any other changed test is a finding: stop and rule it with the user.
- No DOM change except where a ruling names one (P12-3 GBC selection outlines and marquee, P12-4c/d, P12-5, P12-7, P12-4n..q). Class names, `role`, `aria-*`, `data-testid`, text and element order stay otherwise. The status bar keeps each family's text (adapter items).
- `WorldSurface`, the foundation and the world hooks hold no `family ===` branch. Engine facts come from the adapter (spec, "What stays per family"). Check with `rg -n -i 'gba|gbc|family' packages/ui/src/canvas` and a read for indirect branching.
- Unnamed differences: the 2026-10-26 ledger lists the differences no ruling named; the user ruled four (P12-4n..q). Two were flagged "audit before moving": the world save-error lifecycle (GBA one dismissible `saveError`, `WorldCanvas.tsx:410-418`, `:1469-1503`; GBC per-post guarded errors, `GbcWorldCanvas.tsx:972-1007`) and the filter selection/drop guards (`WorldCanvas.tsx:1831-1848`; `GbcWorldCanvas.tsx:561-565`, `:1283-1295`). Tasks 6-7 keep both families' current observable behaviour for these (adapter facts if they cannot be one shared rule without changing a pinned test). Any other difference found during the work: keep each family's behaviour and stop for the user before unifying it.
- Moved code keeps its rationale comments. Each task report lists removed comment lines (`git diff -U0 | grep '^-\s*//'` plus block comments) and where each went. Reviews reject a comment block parked above a short wrapper.
- Async tests use deferred promises the test resolves by hand; never a DOM-mutating probe inside `waitFor` (use a bounded `act` timer loop, as `test/world/placementResync.test.tsx` `expectNeighbourY`). Run new async tests under `timeout`, then kill leftover vitest/tinypool node processes.
- "Once per X" claims (one reload after a group move, one composite) are counted through a `vi.mock` wrapper of the hook, never by GET counts.
- Implementers go through the `delegate` skill (Codex in a scratch worktree with `node_modules` junctions to absolute targets; Codex cannot run vitest or vite build, so Claude runs every check; feed Codex its brief on stdin, `codex exec ... - < brief.md`, and arm a stall watchdog). Reviews: separate spec and quality reviews for High tasks (Opus tier: Codex `gpt-6-astra`; fallback Claude Opus subagent `high-risk-reviewer`, logged); one combined review for Medium tasks (Codex `gpt-5.6-terra`; fallback `quality-reviewer`). Codex `key={url}` remounts are removed on sight.
- Task reports: `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-<N>-<role>.md` (global rule 7; `archive-reports` skill once a task's reviews pass). Measurement script: `task-reports/pokemap-plan-11-canvas-leaf/measure.py`, run from `packages/ui/src` with Windows paths (`cygpath -w`), args `file1 file2 --all`, flag last.
- Subjects are read only, except the live-check backup/restore protocol: GBA `C:/Programming Projects/Pokemon Game/game` (HEAD `718b89f73`, exactly 8 porcelain lines, the user's own; never restore them), PerfPlus (HEAD `81ededbe3`, clean, no `.pokemap`). Manifests GBA `a0349693144d`, GBC `13a31cb654ff` (`task-reports/pokemap-plan-10a2-pokemon-indicator/task-6-shots/manifest.sh`). The `.claude/hooks/guard-subject-writes.mjs` hook asks before any write there.

## Review Focus

1. No behaviour change outside the named rulings; every changed test cites its ruling.
2. Placement ordering: the ledger snapshot is captured before any React state updater (`WorldCanvas.tsx:535-539`); a group move posts one placement per map and reloads once after all posts settle, in both families (P12-3); a stale world GET never overwrites a newer local placement (`test/world/placementResync.test.tsx` passes unchanged).
3. Image ordering: a refreshed tile keeps drawing its previous image until the new one has decoded (P12-7); a load for an older URL or an older time of day never lands in the cache; a failed load never replaces a good image.
4. Drag dispatch: pan, map, group and marquee start, move, end and cancel exactly once; a click after a real drag selects nothing; the capture contract (P12-4a) with GBA's commit-on-leave fallback for an uncaptured map drag.
5. Hit-testing and projection: one world-to-screen projection for every DOM overlay (P12-6); warp hit radius 8 screen px (P12-4i); GBC warp offset `w.x / 2` blocks vs GBA `w.x` tiles (adapter fact).
6. No family branch in `canvas/`.

## Baseline (record in Task 1's report; a different number is a finding)

- World pair `components/WorldCanvas.tsx` vs `gbc/GbcWorldCanvas.tsx`: 1113 / 799 code lines, 189 aligned, 42 runs (re-measured 2026-10-25 on `master` `935d981`).
- Map pair after 12a (wrappers + adapters): 143 / 180, 3 aligned, 1 run (imports; ruled).

---

### Task 1: 12a carry-overs — Medium

Tier reason: deletions and moves pinned by existing tests, plus two small hook fixes each with a mutation.

**Files:**
- Delete: `packages/ui/src/shared/useCanvasView.ts` (no production consumer; inventory first: `rg -n "useCanvasView" packages/ui/src packages/ui/test`)
- Modify: `packages/ui/test/canvas/useStage.test.tsx` (`:5` and `:310-314` move to the `canvas/useStage.ts` exports; same assertions)
- Move: `components/EncounterBorder.tsx` → `shared/EncounterBorder.tsx` (`git mv`; every importer updated; no re-export left behind); `ZOOM_LEVELS` and `MapView` into `canvas/view.ts`, with `components/mapView.ts` re-exporting them until Task 8's inventory
- Modify: `packages/ui/src/canvas/MapSurface.tsx`, `canvas/mapSurfaceAdapter.ts` (imports only), `canvas/useStage.ts` (final review M4: drop the `captured` `useState`; `hasCapture()` stays the reader), `canvas/useRasterComposite.ts` (final review M3: the `onLoad` path also requires `img.complete && img.naturalWidth > 0` for the URL it records), `gbc/GbcWorldCanvas.tsx:93-137` (stale stepped-zoom history comment rewritten to today's facts; comment only)
- Optional (T6 quality Minor 7): shared GBA test fixtures in `test/gba/fixtures.ts` only if two or more GBA map test files can use them without changing an assertion.

- [ ] Step 1: Record the baseline measurement (both pairs) in the report. Run the inventories (`useCanvasView`, `EncounterBorder`, `mapView`) and list every consumer.
- [ ] Step 2: Make the moves and deletions; update imports; tests unchanged apart from the import lines.
- [ ] Step 3: M4: a test counts renders of a fake surface across one click with capture held (one render fewer than today, or a stated count) and pins that `hasCapture()` still answers. M3: a test fires `load` on an image whose `naturalWidth` is 0 for the current URL and asserts no composite. Mutation: restore the `captured` state set inside the handler (render count test fails); drop the `naturalWidth` check (M3 test fails). Gate; commit.

### Task 2: World view, fit and projection math (`canvas/worldView.ts`) — High

Tier reason: hand-derived numeric fixtures (High trigger); pure, so tests come first.

**Files:**
- Create: `packages/ui/src/canvas/worldView.ts`, `packages/ui/test/canvas/worldView.test.ts`
- Modify: `components/WorldCanvas.tsx`, `gbc/GbcWorldCanvas.tsx` (only to import the moved helpers; GBC's imports from `WorldCanvas.tsx`, `GbcWorldCanvas.tsx:5`, point at `canvas/` instead; old exports kept as re-exports where a test imports them)

Contents, moved with their comments from both canvases and unified per the rulings:
- Zoom range as scale (P12-4j): view zoom stays in screen px per native unit (the unit `world/contextView.ts` and `shared/useWorldContext.ts` consume), and the range is `scale × nativePx`, scale `1/2048..1`. The in-context cap rule is one function: the cap is `max(context max world zoom, current zoom)` (GBC `zoomBoundsFor`, `GbcWorldCanvas.tsx:941`; GBA's `Math.max(MAX_ZOOM, zoom)` at `WorldCanvas.tsx:1448-1450` is the same rule with the context max at today's value). Wheel factor 1.2 both.
- Continuous zoom about a pivot: `canvas/view.ts` `zoomAboutPivot` with the continuous policy (fractional pan kept, no-op identity), replacing GBC's `zoomWorldAboutPivot` (`GbcWorldCanvas.tsx:198`); re-export the old name if a test imports it.
- Fits (P12-4m): `computeFit`, `centredFit`, `singletonSizes`, world bounds (`WorldCanvas.tsx:262-325`); `fitClusters` (singleton components excluded, GBA `fitWorld` rule, `WorldCanvas.tsx:667-719`), falling back to every scoped placement when no cluster qualifies, `null` for an empty world (no-op); `fitFilter` (the dungeon filter's maps); `jumpFit` at `JUMP_FILL_FRACTION = 0.6` (`GbcWorldCanvas.tsx:168`, `:360`). GBC's `initialFitBounds`/`fitAllBounds` become these.
- LOD rule, one for both: use small tiles while `zoom < nativePx × LOD_SCALE` (`LOD_SCALE = 0.25`; GBA's threshold 4 px/tile and GBC's 8 px/block are this rule today).
- Projection (P12-6): `worldToScreen`, `screenToWorld`, `rectOf(placement, size)`, `warpPoint(placement, warp, warpOffset)` where the adapter supplies the native warp offset (GBA `w.x` tiles, GBC `w.x / 2` blocks; `projectGbcWarpPoint`, `GbcWorldCanvas.tsx:157`); hit test of a point against placements (topmost first, as today in both); `warpHit(entries, sx, sy)` with `WARP_HIT_RADIUS = 8` (P12-4i).

- [ ] Step 1: Failing tests with fixtures derived by hand in comments: zoom range per native unit (16 and 32) at both ends and the in-context cap (cap never below the current zoom); continuous zoom about a pivot (round trip, fractional pan, no-op identity); `fitClusters` with clusters plus singletons, singletons only (falls back to all), empty (null); `fitFilter`; `jumpFit` at 60% for a small and a large map; LOD on both sides of the threshold for 16 and 32; `worldToScreen`/`screenToWorld` round trip; `warpPoint` for both offsets; `warpHit` at radius 8 (7.9 hits, 8.1 misses); topmost hit order.
- [ ] Step 2: Implement until green; the existing `WorldCanvas`/`GbcWorldCanvas` tests that import these helpers pass unchanged.
- [ ] Step 3: Mutation: singleton not excluded; fallback dropped; 60% → 100%; LOD `<` → `<=` at the threshold; warp offset halved for 16 px; radius 6; cap clamps below current zoom. Each fails a test. Gate; commit.

### Task 3: World tile cache (`canvas/useWorldTiles.ts`) — High

Tier reason: async ordering between image loads, tile versions and time-of-day changes (High trigger).

**Files:**
- Create: `packages/ui/src/canvas/useWorldTiles.ts`, `packages/ui/test/canvas/useWorldTiles.test.tsx`

Behaviour, from both canvases' image-cache effects (`WorldCanvas.tsx:959-1005`, `GbcWorldCanvas.tsx:688-724`) and `shared/useTileVersionRefetch.ts`, `shared/worldTiles.ts`: input the visible placements (culled by the caller), an adapter `imageUrl(placement, version)`, a `cacheKey` (GBC: time of day; GBA: constant) and `tileVersions`. One entry per map: `{ url, img, small, loaded }`. A changed `cacheKey` drops every entry (GBC today: time switch clears the cache); a changed tile version refetches only that map. **P12-7 retention:** while a refreshed entry's new image is loading, the previous decoded image (and its small tile) keeps drawing; it is replaced only when the new image's `load` fires for the entry's current URL. A load for a superseded URL is ignored; an `error` keeps the previous image (or stays empty if none). The small LOD tile is built once per decoded image (`buildSmallTile`). The hook returns a draw lookup and a `version` that bumps once per landed image, for the draw loop's dependencies.

- [ ] Step 1: Failing tests with fake images resolved by hand: first load draws nothing until `load`; a tile-version bump keeps the old image drawing until the new `load`, then swaps (P12-7); an old URL's late `load` after a second bump is ignored; `error` on refresh keeps the old image; a `cacheKey` change drops every entry and a late `load` from the old key is ignored; one small tile per decoded image; `version` bumps once per landed image and not on unrelated re-renders.
- [ ] Step 2: Implement until green.
- [ ] Step 3: Mutation: swap on request instead of on load (retention test fails); drop the URL check (stale load lands); keep entries across a `cacheKey` change; rebuild the small tile per draw. Each fails a test. Gate; commit.

### Task 4: World drag dispatcher (`canvas/useWorldDrag.ts`) — High

Tier reason: shared hit-testing and drag dispatch, the pointer-capture contract (canvas-core behaviour).

**Files:**
- Create: `packages/ui/src/canvas/useWorldDrag.ts`, `packages/ui/test/canvas/useWorldDrag.test.tsx`

Behaviour, from GBA's dispatcher (`WorldCanvas.tsx:1516-1558`, `:1626-1800`), which GBC adopts (P12-3): mouse down with button 0. Ctrl/Cmd on a map toggles it in the selection; Ctrl/Cmd on empty space starts a marquee (screen space), whose release replaces the selection with the maps it selects (GBA's direction-sensitive rule, `WorldCanvas.tsx:250-262`: intersect vs contain). Shift on a map starts a map drag, or a group drag when the map is in a selection of more than one. Otherwise pan. Moves update the drag's preview (local positions, no POST); any real movement sets `dragMoved` so the following `click` selects nothing. Release commits through a `commit(moves)` callback: one entry per moved map, nothing for an unmoved drag. Pointer capture through `canvas/useStage.ts` (P12-4a): capture held → the drag ends on mouse up wherever it happens and leave clears hover only; `pointercancel`/unexpected `lostpointercapture` → the drag is dropped with no commit; capture refused or missing (jsdom) → today's leave fallback: a map or group drag commits on leave (GBA `WorldCanvas.tsx:1775-1800`; GBC commits on leave today too, `GbcWorldCanvas.tsx:1067`), a marquee or pan ends. Gestures stay on React mouse handlers; pointer handlers only take, release and report capture (P12-4a event boundary).

- [ ] Step 1: Failing tests against a fake placement set: each drag kind starts from the right modifiers; group drag moves every selected map by the anchor's delta; marquee intersect vs contain by direction; Ctrl/Cmd toggle; a click after a moved drag is suppressed, after an unmoved one it is not; release outside with capture commits once; cancel commits nothing; no capture → leave commits a map/group drag once and ends a marquee/pan; mousedown after its pointerdown starts one gesture.
- [ ] Step 2: Implement until green.
- [ ] Step 3: Mutation: group drag moves only the anchor; marquee ignores direction; cancel commits; the fallback leave drops a map drag; `dragMoved` not set on pan. Each fails a test. Gate; commit.

### Task 5: `WorldSurface` render, view and data contract — High

Tier reason: canvas-core behaviour of both world canvases (draw loop, culling, first-load fit, projection).

**Files:**
- Create: `packages/ui/src/canvas/WorldSurface.tsx`, `packages/ui/src/canvas/worldSurfaceAdapter.ts` (types), `packages/ui/test/canvas/WorldSurface.test.tsx` (fake adapter)

Behaviour: the section, toolbar and viewport skeleton both canvases share (JSX order from `WorldCanvas.tsx:1850-2047` / `GbcWorldCanvas.tsx:1205-1355`, with each family's groups and text supplied by the adapter). The `!world` placeholder lives here once (P12-5): "Could not load the world: …" or "Loading world…" in `p.app__canvas-placeholder`. View through `useStage` with the continuous policy and Task 2's range and cap. **First-load fit (P12-4e):** once per world load, `fitClusters` on the scoped placements; no tile is requested and nothing is drawn before the fit lands (GBC's `fitted` gate, `GbcWorldCanvas.tsx:77`, `:175`, kept in the one view object so StrictMode's double updaters stay harmless). Manual Fit, dungeon-filter fit (`fittedFilterRef` rule) and jump fit per P12-4m; the F shortcut and context fit through `useWorldContext` as today. Culling to the viewport (with GBA's revealed set and each adapter's `drawnByDefault` visibility predicate; P12-4q makes reveal-on-jump shared). Draw loop: tiles from Task 3 (LOD per Task 2), then the adapter's extra canvas layers (GBA vertical-link triangles), then conflict badges (shared `drawDiamond`, acceptance through the existing conflict-acceptance module). One projection for every DOM overlay (P12-6): selection outlines, jump highlight, warp markers, connection lines, encounter border, lens, spotlight, tooltips and the context overlay all read Task 2's projection. Adapter data contract: a world hook returning `{ world, error, reload, dismissError }` and the placement POST (Task 7 moves GBA's inline fetch behind it; the ledger snapshot stays before any state updater). Status items come from the adapter.

Adapter fields (the builder may refine names; the rule is no family branch in the surface): `nativePx`, `imageUrl`, `cacheKey`, `useWorld`, `postPlacement`, `postDungeons`, `drawnByDefault`, `warpOffset`, `extraLayers`, `conflictTooltip`, encounter fetch + summariser + presentation inputs (GBC `time`), status items, toolbar extras, the context native unit.

- [ ] Step 1: Write the adapter type; failing fake-adapter tests: placeholder for loading and error; no tile request before the first fit lands, then a fit of the clusters (singletons excluded) under StrictMode with the exact single-application pan; manual Fit, filter fit and jump fit (60%); culling (an off-screen map is not requested); draw order tiles → extra layers → badges; a DOM overlay and the canvas agree on a map's screen rect after a pan and a wheel zoom; tile retention reaches the draw (Task 3); the status items render.
- [ ] Step 2: Implement on Tasks 1-4 plus the existing shared world modules (`useWorldContext`, `WorldContextOverlayMount`, `useFitShortcut`, `UnplacedRail`, lens/spotlight/conflict overlays, `placementLedger`, `worldBadges`). No family branch.
- [ ] Step 3: Mutation: draw before the fit lands; fit includes singletons; jump at 100%; one overlay with its own projection (pan offset dropped); badges drawn under tiles. Each fails a test. Gate; commit.

### Task 6: `WorldSurface` interaction and commits — High

Tier reason: placement ordering (save ownership through the ledger) and selection behaviour of both families.

**Files:**
- Modify: `packages/ui/src/canvas/WorldSurface.tsx`, `canvas/worldSurfaceAdapter.ts`
- Test: `packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx` (fake adapter)

Behaviour: Task 4's dispatcher wired in. Selection is a set in both families (P12-3): click selects one map and calls `onSelectMap`; Ctrl/Cmd toggles; marquee replaces; Escape clears. A click within the warp hit radius of a visible warp marker selects nothing (P12-4o). Double-click: Edit-here handler when given, else `onOpenMap` (P12-4c); a double-click on a warp marker opens the warp popup as today. Keys on the canvas (P12-4n): Escape clears the selection; the context-menu key opens the menu for one selected in-scope map at its rect centre; Enter opens the selected in-scope map; `+`/`=` and `-`/`_` zoom about the viewport centre by the wheel factor, or step the context zoom in context mode (`GbcWorldCanvas.tsx:1132-1159`). Context menu on right-click at the pointer. Commits: one placement POST per moved map through the ledger (`moved`, `resolve`; `shared/placementLedger.ts`), the reload once after every POST of the gesture settles (P12-3), then `onPlacementsSaved`. Dungeon toggle POST, reload and `onLayoutChanged` as today. Warp markers: fetch per visible map; a failed fetch shows the alert in both families (P12-4d, GBC's DOM, `GbcWorldCanvas.tsx:1221`). Jump highlight keyed by `jumpToken` (P12-4p): a re-jump to the same map restarts the 2 s fade. Reveal on jump (P12-4q): jumping to a placed map the visibility predicate hides reveals it for the session, in both families. In context mode the Unplaced rail is hidden (P12-7). The encounter sprite tooltip is clamped inside the viewport (P12-7; left and right edges). Save errors and filter selection/drop guards keep each family's current behaviour (Global Constraints, "Unnamed differences").

- [ ] Step 1: Failing fake-adapter tests for each item above, including: a group move of three maps posts three times and reloads once after the last deferred POST resolves (counted through a `vi.mock` wrapper of the world hook's `reload`); a POST that resolves after a newer drag of the same map does not roll it back (ledger); a warp-marker click selects nothing, a click 9 px away selects the map; the warp alert on a rejected fetch; a re-jump to the same map with a new token restarts the highlight; reveal on jump; rail hidden in context only; tooltip clamped at the left edge.
- [ ] Step 2: Implement until green.
- [ ] Step 3: Mutation: reload per POST; no marker click suppression; double-click fallback removed; Enter ignored; highlight keyed by map; rail shown in context; tooltip unclamped. Each fails a test. Gate; commit.

### Task 7: GBC world canvas onto `WorldSurface` — High

Tier reason: replaces a family canvas; GBC gains multi-select, marquee and group move (P12-3); existing tests are the oracle.

**Files:**
- Create: `packages/ui/src/gbc/worldSurface.tsx` (GBC adapter: 32 px block, `?time=` URLs and `cacheKey = time`, `useGbcWorld`, one-map placement POST, indoor/gate visibility predicate, `w.x / 2` warp offset, no extra layers, GBC conflict tooltip, `summariseGbc` and time dimming, block-dimension status items, toolbar extras)
- Modify: `packages/ui/src/gbc/GbcWorldCanvas.tsx` (wrapper: same export, same props)
- Test: new GBC tests through the real wrapper for P12-3 (Ctrl-click toggle, marquee, group move posting once per map and reloading once), P12-4a (capture contract on a map drag), P12-4i (radius 8 kept), P12-4q (reveal on jump, new for GBC)

- [ ] Step 1: Build the adapter by moving code out of `GbcWorldCanvas.tsx` (keep comments). The wrapper renders `WorldSurface`.
- [ ] Step 2: Run the GBC world tests (`test/gbc/GbcWorldCanvas*.test.tsx`, `GbcApp*`, `GbcAppContext*`, `GbcAppWorldGuard`, `useGbcWorld`, `test/shell/worldParity.test.tsx`, `test/world/*`) and the full gate. Only the tests listed under Global Constraints for P12-4j/m may change, each named. The GBC first-fit and no-prefit-load guarantees (`GbcWorldCanvas.test.tsx:673`, `:756`), the malformed-fetch/retry warp alert (`:85`), the 60% jump (`:1211`) and the time re-dim cases pass unchanged.
- [ ] Step 3: Add the new GBC tests; confirm each fails on `935d981` for the right reason. Mutation: the adapter posts the whole selection in one request; `cacheKey` ignores time. Each fails a test. `measure.py` progress note. Gate; commit.

### Task 8: GBA world canvas onto `WorldSurface`, data behind the adapter — High

Tier reason: replaces a family canvas, moves the inline world fetch and reconciliation (save/ledger ownership), changes GBA behaviour under P12-4c/d/e/m/n/o/p.

**Files:**
- Create: `packages/ui/src/gba/worldSurface.tsx` (GBA adapter: 16 px tile, render URLs, a `useGbaWorld` hook holding today's fetch and reconciliation (`WorldCanvas.tsx:509-567`) with the ledger snapshot taken before any React state updater (`:535-539`), batched placement POSTs, dungeon POST, `drawnByDefault` (`:243`), `w.x` warp offset, vertical-link triangle layer (`drawTriangle`, `:2050`), GBA conflict tooltip, `summariseGba` and level colours, hidden/unplaced/tile-dimension status items, toolbar extras)
- Modify: `packages/ui/src/components/WorldCanvas.tsx` (wrapper: same export, same props; `themedLevelColorMap`, `levelColorMap`, `drawDiamond` keep their exports, moved to `canvas/` or `shared/` with re-exports while a consumer imports them)
- Test: new GBA tests through the real wrapper for P12-4c (no Edit-here handler → double-click opens Map view), P12-4d (rejected warp fetch shows the alert), P12-4e (first-load fit of the clusters; no tile request before it), P12-4m (jump 60%), P12-4n (Enter, `+`/`-`), P12-4o (marker click selects nothing), P12-4p (same-map re-jump restarts the fade)

- [ ] Step 1: Write the new tests; confirm each fails on `935d981` for the right reason.
- [ ] Step 2: Build the adapter and wrapper. Diff the reconciliation code against `WorldCanvas.tsx:509-567` line by line in the report: same snapshot point, same keep rule.
- [ ] Step 3: Run the GBA world tests (`WorldCanvas*.test.tsx`, `App*`, `AppContext*`, `test/world/*`, `test/shell/worldParity.test.tsx`) and the full gate. Only the tests listed under Global Constraints may change, each named. `placementResync.test.tsx` passes unchanged.
- [ ] Step 4: Mutation: snapshot taken inside the updater; vertical-link layer dropped; `drawnByDefault` ignored. Each fails a test. Gate; commit.

### Task 9: Measurement, mutation evidence, docs, last re-exports — Medium

Tier reason: checks and docs; deletions pinned by an inventory.

**Files:**
- Modify: `packages/ui/DESIGN.md` ("Shared modules": Plan 12b table for `canvas/worldView.ts`, `useWorldTiles.ts`, `useWorldDrag.ts`, `WorldSurface.tsx`, `worldSurfaceAdapter.ts`, `gba/worldSurface.tsx`, `gbc/worldSurface.tsx`, `shared/EncounterBorder.tsx`)
- Delete if the inventory shows no consumer: `components/mapView.ts` re-exports and any re-export Tasks 2 and 8 left (spec "Left to the builder", SR-M4)
- Report: `task-9-report.md`

- [ ] Step 1: Concatenate each family's owned files (wrapper, then adapter) into one temp file per family with a `// FILE: <path>` line before each (spec Goal 5); run `measure.py --all`. Target: at most 30 aligned code lines; rule every remaining run. Read both adapters side by side for renamed or reordered duplication.
- [ ] Step 2: Collect the mutation results from Tasks 1-8 in one table (mutation, failing test).
- [ ] Step 3: `rg -n -i 'gba|gbc|family' packages/ui/src/canvas`, inspect every match, and read `WorldSurface.tsx` for indirect branching. Re-export inventory; delete what has no consumer. Gate; commit.

### Task 10: Live acceptance (both families) — Medium

Tier reason: checks only; every save commit and world write is intercepted, and no subject write is possible.

**Files:**
- Report: `task-10-live.md`, drivers and screenshots under `task-10-shots/` (copy `lib.mjs`, `guard.mjs` from `task-reports/pokemap-plan-12-canvas-core/task-8-shots/`)

- [ ] Step 1: Back up GBA `.pokemap/`; record manifests. Real `serve.ts` with the `--import` preload remapping 5174→5184, scratch `POKEMAP_HOME`, Vite on 5183, headless Chromium shell 1248 via the cached `playwright-core`. Stop servers by port only.
- [ ] Step 2: `guard.mjs` before any page loads: every `POST` ending in `/commit` and every `POST` to `/api/world/placement*` or `/api/world/dungeons*` is answered 500 and counted; the run asserts the hub saw none. Placement commits are therefore observed as the browser's POST attempts (one per moved map) and the reload GETs after them, with the 500 path's rollback shown; never click Save.
- [ ] Step 3: Each family, World and Dungeon modes: wheel and Fit; **first-load fit with GBA render-request count and the time from the world payload to the last tile drawn (P12-4e). If GBA's settle time is over 1.5 s, or the page visibly janks, stop and show the user the numbers before Task 11** (user threshold, 2026-10-26); Ctrl-click, marquee and group move (POST attempts one per map, one reload); a map drag released outside the canvas (one commit attempt); warp markers, a marker click (no selection), and the forced-error alert (`page.route` 500 on the warp fetch); Enter and `+`/`-` on the canvas; jump to the same map twice (fade restarts); reveal on jump of a hidden map; lens; spotlight; context menu; in-context editing at 1024 px wide (toolbar not cramped, rail hidden); P12-7 border overlap re-check at mid zoom (fix in `shared/EncounterBorder.tsx` if adjacent borders overlap, else record the evidence and close it); encounter tooltip at the left edge (clamped); a tile refresh after an in-context paint keeps the old image until the new one decodes.
- [ ] Step 4: Restore; manifests unchanged; GBA exactly 8 porcelain lines; PerfPlus clean with no `.pokemap`.

### Task 11: Final review and handoff docs — High (review only)

- [ ] Step 1: Full gate, typecheck, UI build; record the count (not below 3,634).
- [ ] Step 2: Final whole-branch review (Opus tier: Codex `gpt-6-astra`; fallback Claude Opus `high-risk-reviewer`, logged). Fix findings; re-review.
- [ ] Step 3: Update this plan's STATUS, RESUME (Git state and Unified UI row), roadmap Plan 12 status (Plan 12 complete), the spec's review record. Commit. Stop for the user before push or merge.
