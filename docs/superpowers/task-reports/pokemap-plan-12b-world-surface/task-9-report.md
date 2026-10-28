# Task 9 report: measurement, mutation evidence, docs, last re-exports (Medium)

Tier: Medium (checks and docs; deletions pinned by an inventory). Delegation: Anthropic direct (conductor inline), reason "under ~10 minutes of tool calls": a one-line re-export cut, one dead-file delete, and doc tables. The bulk read (Step 2, nine reports) went down the reading chain: Gemini `HTTP 503` → Nemotron 3 Ultra done; two claims spot-checked against the reports (Task 1 `captured`, Task 7 `cacheKey` survivor), both correct.

## Step 1: measurement (spec Goal 5)

Each family's owned files concatenated with a `// FILE:` line before each (GBA: `components/WorldCanvas.tsx`, `gba/worldSurface.tsx`; GBC: `gbc/GbcWorldCanvas.tsx`, `gbc/worldSurface.tsx`), `measure.py --all` (Plan 11 script):

**269 / 250 code lines, 22 aligned, 5 runs** (target at most 30). Baseline before 12b: 1113 / 799, 189 aligned, 42 runs.

| Run | GBA | GBC | Ruling |
|---|---|---|---|
| 8 | 351-358 | 411-418 | Status items: hover span and the empty "Hover the world…" span. Same classes on purpose (one stylesheet); the hover text differs per family (GBA component size and Shift+drag hint, GBC component index and block size). Adapter-supplied `statusItems`. |
| 4 | 66-74 | 47-54 | Wrapper props interface (`map: string;` fields of the context prop). Each wrapper keeps its public props type. |
| 4 | 345-348 | 404-407 | Closing `</span>` and the `hover ?` ternary head of the same status items. |
| 3 | 79-84 | 59-64 | Wrapper `return (` into `<WorldSurface …>`. |
| 3 | 287-289 | 369-371 | Closing syntax `}));` of the warp-line map. |

Both adapters read side by side: no renamed or reordered duplication beyond the above. Data hooks differ (GBA ledger reconciliation and component:-1 sizes vs GBC's `useGbcWorld`), as do fetchers, layers and facts.

## Step 2: mutation results, Tasks 1-8

| Task | Mutation (what was changed, short) | Result (which test(s) failed, or 'survived'/'dropped' and why) | Source file name |
|---|---|---|---|
| 1 | Restore `captured` state set on capture and release | M4: capture and release cause no re-render | `canvas/useStage.ts` |
| 1 | Continuous step from the render-captured `zoom` | both batched-wheel tests | `canvas/useStage.ts` |
| 1 | Drop the `onImgLoad` URL guard (stale handler unlocks) | useRasterComposite "ignores a deferred load callback from the previous URL" | `canvas/useRasterComposite.ts` |
| 1 | Release-only `setCaptured(false)` (state already false, no re-render) | survived (harmless) | `canvas/useStage.ts` |
| 2 | singleton not excluded (`> 1` → `> 0`) | 1 fail | `canvas/worldView.ts` |
| 2 | fallback dropped | 2 fail | `canvas/worldView.ts` |
| 2 | `fitFilter` ignores the anchored rule | 1 fail | `canvas/worldView.ts` |
| 2 | wrapper drops `fitted` | 2 fail | `canvas/worldView.ts` |
| 2 | jump 60% → 100% | 2 fail | `canvas/worldView.ts` |
| 2 | LOD `<` → `<=` | 1 fail | `canvas/worldView.ts` |
| 2 | warp offset halved | 1 fail | `canvas/worldView.ts` |
| 2 | radius 6 | 2 fail | `canvas/worldView.ts` |
| 2 | cap clamps below current zoom | 1 fail | `canvas/worldView.ts` |
| 2 | cap ignores `maxWorldZoom` | 1 fail (unit test; GBA in-context 19.2 test lands in Task 8) | `canvas/worldView.ts` |
| 2 | `fitClusters` re-reads a spent iterator | 1 fail | `canvas/worldView.ts` |
| 3 | Swap on request (`entry.tile = undefined` when URL changes) | P12-7 retention; off-screen bump; superseded URL; error on refresh (4 tests) | `canvas/useWorldTiles.ts` |
| 3 | Drop the URL check in `onload` | superseded URL | `canvas/useWorldTiles.ts` |
| 3 | Keep entries across a `cacheKey` change | cacheKey drop | `canvas/useWorldTiles.ts` |
| 3 | Rebuild the small tile per lookup | one small tile per decoded image | `canvas/useWorldTiles.ts` |
| 3 | M5 drop the entry identity check in `onload` | cacheKey drop; key round trip | `canvas/useWorldTiles.ts` |
| 3 | M6 drop the `mounted` guard | late load after unmount | `canvas/useWorldTiles.ts` |
| 3 | M7 hard-code nativePx 16 | sizeOf/nativePx | `canvas/useWorldTiles.ts` |
| 3 | M8 key change deletes only visible maps | off-screen cacheKey drop | `canvas/useWorldTiles.ts` |
| 3 | M9 `mounted` never re-armed after StrictMode cleanup | StrictMode lands | `canvas/useWorldTiles.ts` |
| 3 | M10 drop the same-URL dedupe | 10 tests (requests once, StrictMode, ...) | `canvas/useWorldTiles.ts` |
| 4 | Group drag moves only the anchor | group by anchor delta; returned group settles | `canvas/useWorldDrag.ts` |
| 4 | Marquee ignores direction | marquee direction; one-render commit; uncaptured marquee leave | `canvas/useWorldDrag.ts` |
| 4 | Cancel commits (runs release) | 4 cancel tests | `canvas/useWorldDrag.ts` |
| 4 | Cancel skips `noop` | cancel reverts + noop; cancel waits on earlier POST | `canvas/useWorldDrag.ts` |
| 4 | A returned drag commits | returned drag settles without commit | `canvas/useWorldDrag.ts` |
| 4 | No-capture leave drops a map drag | uncaptured leave map + group; marquee leave | `canvas/useWorldDrag.ts` |
| 4 | `dragMoved` not set on pan | pan marks movement | `canvas/useWorldDrag.ts` |
| 4 | `begin` after the first optimistic move | begins before first move | `canvas/useWorldDrag.ts` |
| 4 | F1 `Math.floor` instead of `Math.round` | 4 rounding tests | `canvas/useWorldDrag.ts` |
| 4 | F2 marquee rule chosen by `y1 > y0` | right-and-up; left-and-down | `canvas/useWorldDrag.ts` |
| 4 | F3 no unmount cleanup | unmount mid map drag; mid group drag | `canvas/useWorldDrag.ts` |
| 5 | (a) drop the `view.fitted` gate in `visible` | FAIL (2): pre-fit StrictMode test; culling test | `canvas/WorldSurface.tsx` |
| 5 | (b) `fitClusters` → fit every placement | FAIL (6): initial StrictMode fit ×2, culling, status, draw order, manual cluster Fit | `canvas/WorldSurface.tsx` |
| 5 | (c) jump fraction 1.0 | FAIL (4): jump 60%, hidden initial jump, projection, filter/jump | `canvas/WorldSurface.tsx` |
| 5 | (d) outline rect without `view.pan` | FAIL (5): jump 60%, hidden initial jump, projection, filter/jump, reveal/retention | `canvas/WorldSurface.tsx` |
| 5 | (e) badges drawn before tiles (tile loop moved after badge loop) | FAIL (2): draw order; StrictMode fit (order check) | `canvas/WorldSurface.tsx` |
| 5 | (f) error placeholder shows "Loading world…" | FAIL (1): placeholders | `canvas/WorldSurface.tsx` |
| 5 | extra: revert the S1 viewport guard | FAIL (3): jump 60%, hidden initial jump, projection | `canvas/WorldSurface.tsx` |
| 5 | extra: revert the item 3 failed-entry store | FAIL (1): failed-encounter test | `canvas/WorldSurface.tsx` |
| 5 | extra: remove `key={token}` | FAIL (2): re-jump node identity; filter/jump | `canvas/WorldSurface.tsx` |
| 5 | `initialFitDone` stamped on first fit attempt (old behaviour) | fits the clusters once a filter with nothing to fit clears | `canvas/WorldSurface.tsx` |
| 5 | `useWorldTiles` clears `entry.tile` on URL change | reveals a hidden jump, shares projection, retains previous image until replacement loads | `canvas/useWorldTiles.ts` |
| 6 | P12-3: `inScope` guard back on group membership | moves every retained selected map when a filter leaves only the grabbed group member visible | `canvas/WorldSurface.tsx` |
| 6 | P12-3: reload after each successful POST | posts three group members and reloads once only after the last deferred outcome (+3 more) | `canvas/WorldSurface.tsx` |
| 6 | P12-4s: failed warp cache entry kept | warp fetch rejection alerts, never loops on alert renders, retries exactly once after a pan | `canvas/WorldSurface.tsx` |
| 6 | P12-4o: marker click suppression removed | marker clicks within eight screen pixels select nothing; nine pixels selects the map and double-click previews (+2) | `canvas/WorldSurface.tsx` |
| 6 | P12-4c: double-click fallback removed | double-click edits here when supplied, otherwise opens Map view; Shift always opens Map view (+1) | `canvas/WorldSurface.tsx` |
| 6 | commit-time refs: `cancelRef` published at render | unmount cancels with committed drag options after a later render suspends | `canvas/useWorldDrag.ts` |
| 7 | P12-4i: `WARP_HIT_RADIUS` 8 → 6 | red: "P12-4i: eight pixels ... nine selects" | `canvas/worldView.ts` |
| 7 | P12-3: surface posts only first moved map (selection in one request) | red: "P12-3: group movement posts one body per map ..." | `canvas/WorldSurface.tsx` / `gbc/worldSurface.tsx` |
| 7 | `cacheKey` ignores time (`"day"`) | survived first run (existing time tests only check `?time=` URLs); test added, now red | `canvas/useWorldTiles.ts` |
| 7 | `borderNeighbours: "scoped"` removed | red: "a hidden indoor neighbour still blocks a border side" | `canvas/worldSurfaceAdapter.ts` |
| 7 | Wheel effect deps include `zoom` again | red: "the wheel listener is registered with { passive: false }" | `canvas/useStage.ts` |
| 7 | Context snap not gated on `view.fitted` | red: 4 `GbcWorldCanvasContext` tests (snap once, 1x/2x/4x, zoom clamp, exit requests) | `canvas/WorldSurface.tsx` |
| 7 | Jump stamp waits for measured viewport | red: 3 `GbcApp` jump tests | `canvas/WorldSurface.tsx` |
| 7 | Jump fit applied before viewport measured | red: 4 `WorldSurface.test.tsx` jump tests | `canvas/WorldSurface.tsx` |
| 7 | P12-4q reveal insertion removed | red: both P12-4q (INDOOR, GATE) tests | `canvas/WorldSurface.tsx` |
| 7 | pending fit ignores scope | red (fix round) | `canvas/WorldSurface.tsx` |
| 7 | `shiftClickSelects` dropped | red (fix round) | `canvas/worldSurfaceAdapter.ts` / `gbc/worldSurface.tsx` |
| 7 | F shortcut unbound (`useFitShortcut(fit, false)`) | red (fix round) | `canvas/WorldSurface.tsx` |
| 8 | M1 ledger snapshot + keep set inside `setRaw` updater | red: 2 `world/placementResync.test.tsx` cases ("a GET issued before a save's acknowledgement keeps the local position...") | `components/WorldCanvas.tsx` |
| 8 | M2 vertical-link layer dropped (`drawExtraLayers` renamed) | red: "draws dive and emerge vertical links as distinctly-coloured badges" | `canvas/WorldSurface.tsx` |
| 8 | M3 `drawnByDefault` returns true | red: 5 (indoor art not fetched, hidden count, 3 encounter-border cases) | `canvas/WorldSurface.tsx` |
| 8 | M4 first fit replaced by old default view (zoom 1, pan 0) | red: 197 (P12-4e tests and new P12-4e cases) | `canvas/WorldSurface.tsx` |
| 8 | M5 `JUMP_FILL_FRACTION` back to 0.6 | red: 34 (every amended-P12-4m jump test, GBA 100% jump tests) | `canvas/worldView.ts` |
| 8 | M6 world scale floor 1/1024 (P12-4j) | red: 4 (computeFit default floor, worldView P12-4j) | `canvas/worldView.ts` |
| 8 | M7 no-handler double-click fallback removed (P12-4c) | red: 7 (P12-4c GBA/GBC/surface cases) | `canvas/WorldSurface.tsx` |
| 8 | M8 first fit zoom x1.25 | red: 156 | `canvas/WorldSurface.tsx` |
| 8 | M9 first fit pan +13/+7 | red: 122 | `canvas/WorldSurface.tsx` |
| 8 | M10 first fit pan +60 | run hung (test wait loop never ends); killed at 30 min timeout, file restored. Dropped. | `canvas/WorldSurface.tsx` |
| 8 | A `inScope(p.map) &&` dropped from `drawn` | red: 1 (mapFilter test; 157/157 before) | `canvas/WorldSurface.tsx` |
| 8 | B `badge?.map ??` dropped from context-menu target | red: 1 (badge-body test; 157/157 before) | `canvas/WorldSurface.tsx` |
| 8 | C marquee `contains` → `intersects` | red: 1 ("Ctrl+drag right selects only maps fully enclosed") | `canvas/useWorldDrag.ts` |
| 8 | D culling disabled (`visible = drawn`) | red: 6 (culls, warp marker visibility, late-save menu, 3 encounter-border cases) | `canvas/WorldSurface.tsx` |
| 8 | E stacked-badge offset dropped | red: 2 (two same-map badges; accepted-key redraw) | `canvas/WorldSurface.tsx` |

## Step 3: family words, branching, re-export inventory

- `rg -n -i 'gba|gbc|family' packages/ui/src/canvas`: every hit is a comment, except `MapSurface.tsx:71` `encounter.family`, an adapter-supplied value passed to `useMapEncounterSummaries` (data, not a branch). `WorldSurface.tsx` read for indirect branching: the only conditionals on adapter values are named facts (`borderNeighbours === "scoped"` :336, `saveErrorPolicy === "per-map"` :405); no `nativePx`/`warpOffset` comparisons.
- Re-export inventory (consumers by grep over `src` and `test`):
  - `components/mapView.ts`: `ZOOM_LEVELS`, `Zoom`, `MapView` re-exports are imported by 9 src files (`canvas/WorldSurface`, `MapCanvas`, `WorldCanvas`, `GbcMapCanvas`, `GbcWorldCanvas`, `CanvasZoomBar`, `useWorldContext`, `WorldContextOverlay`, `world/contextView`) and 5 tests; the file also owns the stepped `zoomAboutPivot` wrapper (used by `useWorldContext`, `GbcMapCanvas`, tests). Kept.
  - `components/WorldCanvas.tsx`: `levelColorMap` (imported by `test/WorldCanvas.test.tsx`) kept; `drawDiamond` and `themedLevelColorMap` had no consumer: **deleted**. `computeFit` is the GBA-defaults wrapper, not a re-export (plan M-d); kept.
  - `gbc/GbcWorldCanvas.tsx` (Task 7): every re-exported name is imported by `test/gbc/GbcWorldCanvas.test.tsx`. Kept.
  - Found while inventorying: `shared/useTileVersionRefetch.ts` (Plan 11) has no consumer and no test since both world canvases moved to `canvas/useWorldTiles.ts`. **Deleted.**
- `packages/ui/DESIGN.md` "Shared modules": Plan 12b table added (`canvas/worldView`, `useWorldTiles`, `useWorldDrag`, `worldSurfaceAdapter`, `WorldSurface`, `worldColours`, `shared/EncounterBorder`, both family adapters); Plan 11 rows now name their current consumers (`canvas/WorldSurface`, `canvas/useStage`, `canvas/useWorldTiles`); the deleted `useCanvasView` and `useTileVersionRefetch` rows removed; closing paragraph updated.

## Gate

Gate at Task 9 (pre-commit tree): **3,803 pass / 0 fail / 233 files**; typecheck and UI build pass; subjects unchanged. Review: one combined spec-and-quality review (Medium), pending.
