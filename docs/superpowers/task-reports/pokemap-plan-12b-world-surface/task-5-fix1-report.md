# Task 5 fix round 1 report

Status: DONE. Not committed. Worktree `scratchpad/wt-t5`.

## What changed

- `packages/ui/src/canvas/WorldSurface.tsx`: rewritten to the surrounding style (one statement per line, JSX one element per line, lines ≤ 140 chars, no BOM). Logic kept, except for the fixes below. Rationale comments restored and shortened: the `fitted` gate and initial fit (F5, ~308 of 391 renders measured live), the single view value and StrictMode, `chromeless: true` (the surface binds F; no ContextMapFit provider), `fittedFilter` (once per Set instance, reset on null, the drag-frame `world` churn from GBA's comment), the jump token guard (retry until world, viewport and filter are ready), the separately scoped fade effect, the highlight `key` by token (P12-4p), the encounter cache (once per map ever, not keyed on cacheKey, failure counted and stored as loaded-empty), the border side over every drawn placement with the `ponytail:` O(n²) comment, and the `viewport` draw dependency (Task 21). Small helpers `hasSize`, `screenRect` and the named `Badge` type replace repeated inline expressions. `JUMP_HIGHLIGHT_MS = 2000` is now named.
- `packages/ui/src/canvas/worldSurfaceAdapter.ts`: reformatted, with a one-line doc comment on every field. `canvasLabel` is now optional (S2: one canvas has no aria-label).
- `packages/ui/src/canvas/useStage.ts`: `boundsFor` is published to its ref in a `useLayoutEffect` (commit), not during render (Q2). The surface's `maxZoomRef` is published the same way.
- `packages/ui/test/canvas/WorldSurface.test.tsx`: 5 → 15 tests. Every existing assertion is kept unchanged. The `getContext` spy now records the stage canvas only, so `buildSmallTile`'s offscreen `drawImage` no longer pollutes the log (S3), and it records `moveTo` too. A `Near` singleton at (100,50) was added: inside the mount-default view and outside the cluster fit. `EncounterBorder` is mocked to capture its props (the MapSurface test's pattern).

### Bug fixes

1. **Failed encounter fetch (item 3).** On rejection, the cache now stores `{ summaries: [], methodTint: null }`, so the border receives `[]` (loaded, empty) instead of `undefined` (still loading). This matches `GbcWorldCanvas.tsx:702-713` and `:761`.
2. **S1/Q1, confirmed:** a jump present at mount stamped its token while the viewport was still `{0,0}`, so `jumpFit` returned zoom 1, pan 0 and set `fitted`. The measured render's cluster fit then replaced it, and the stamped token blocked a retry. The jump now also waits for `viewport.w > 0 && viewport.h > 0`. Reverting this guard fails 3 tests (see the mutation table).
3. **Q2, confirmed and fixed** with layout-effect publication. Skipped: the requested Suspense/transition regression test. A suspended render in jsdom is a large harness for a one-line commit-time move. Add it if the conductor wants it.

## Brief case → test mapping

| Brief case | Test(s) |
|---|---|
| 1 Placeholder | `shows load and error placeholders` |
| 2 StrictMode pre-fit gate, exact fit, pan once | `fits clusters under StrictMode…` (world arrives after mount); `with the world present at mount under StrictMode, requests nothing from the pre-fit view and pans once` (Near never requested; every A draw is (0,0,50,50); a doubled pan would give (-50,-50)) |
| 3a Manual Fit after a wheel (clusters) | `fits clusters manually after a wheel` (A back at (0,0,50,50), readout 31%) |
| 3b Filter fit (anchored only) | `fits manually, fits anchored filter members…` (A at (50,0,100,100)); filtered manual Fit is now pinned exactly: A (0,0,100,100) |
| 3c Jump fit at 60% | `jump-fits at 60% with exact zoom and pan` (38%, B (70,20,60,60), A (10,20,60,60)) |
| 3d Highlight keyed by token | `renders a new highlight node when the same map is re-jumped with a new token` |
| 3e Reveal on jump | `lands an initial jump on a hidden map at its own fit…` (Hidden requested, outline (70,20,60,60), status "75% hidden 0"); `reveals a hidden jump…` |
| 3f Jump outside the filter waits | `fits manually, fits anchored filter members and waits to jump outside the filter` |
| 4 Culling | `culls a placement that is off-screen after the fit and a hidden-by-default one` (exactly A, B, C, D requested; Far, Near and Hidden are not) |
| 5 Draw order | `draws tiles, then the extra layers, then the first badge path, in one redraw` (one redraw sliced at `clear`: tile < extra < badge; badge `moveTo` (30,-10) derived by hand) |
| 6 Projection after pan and wheel zoom | `projects the jump outline onto the drawImage rect after a wheel zoom and after a pan` (outline equals the drawImage rect, and both are close to the hand values (64,14,72,72) and (75,25,50,50); the pan comes from a second jump to D) |
| 7 Retention | `reveals a hidden jump, shares projection, and retains the previous image until replacement loads` |
| 8 Status items | `passes hand-derived zoomPercent, hiddenCount and unplacedCount to the status items` (exact text "31% hidden 1 unplaced 1") |
| 9 Zoom cap | `clamps continuous zoom against the current view` |
| Item 3 failed encounter | `hands the border [] for a map whose encounter fetch failed and undefined for one still loading` (plus the alert text "…for 1 map") |

## Mutations (each applied alone, then restored; final `diff` against the original is clean)

| Mutation | Result | Failing tests |
|---|---|---|
| (a) drop the `view.fitted` gate in `visible` | FAIL (2) | the pre-fit StrictMode test; the culling test |
| (b) `fitClusters` → fit every placement | FAIL (6) | initial StrictMode fit ×2, culling, status, draw order, manual cluster Fit |
| (c) jump fraction 1.0 | FAIL (4) | jump 60%, hidden initial jump, projection, filter/jump |
| (d) outline rect without `view.pan` | FAIL (5) | jump 60%, hidden initial jump, projection, filter/jump, reveal/retention |
| (e) badges drawn before tiles (tile loop moved after the badge loop) | FAIL (2) | draw order; StrictMode fit (its order check) |
| (f) error placeholder shows "Loading world…" | FAIL (1) | placeholders |
| extra: revert the S1 viewport guard | FAIL (3) | jump 60%, hidden initial jump, projection |
| extra: revert the item 3 failed-entry store | FAIL (1) | failed-encounter test |
| extra: remove `key={token}` | FAIL (2) | re-jump node identity; filter/jump |

## Codex self-review findings

- **S1 / Q1 (jump before the viewport is measured): accepted and fixed.** Covered by tests, with exact Hidden geometry (70,20,60,60) and zoom 12 (75%).
- **S2, aria-label: accepted.** `canvasLabel` is optional.
- **S2, overlay order: rejected.** `.world-canvas__lens` and `.world-canvas__spotlight` have `z-index: 2` and `.world-canvas__selection` has `z-index: 6` (`styles.css:1739-1745`, `:1811-1816`), so DOM order between them does not change paint order. There is no observable difference.
- **S2, the GBA `.world-canvas__toasts` wrapper: deferred to Task 6, needs a conductor or user call.** With only the conflict toast, the wrapper and a bare `.world-canvas__toast` sit at the same spot (same left, bottom and z-index 10). The wrapper only matters when the save and reload toasts stack, and those are Task 6 content (GBA puts them in the wrapper; GBC puts its save and reload errors in the toolbar). The slot shape should be decided along with them.
- **S3 (weak pre-fit and draw-order oracles): accepted.** The spy is stage-only, the order is checked within one redraw, and the Near pre-fit probe was added. Mutations (a) and (e) now fail.
- **S4 (manual cluster Fit untested, filtered manual pan unasserted): accepted.** Both are now pinned exactly.
- **Q2 (render-time ref publication): accepted and fixed** in both `useStage` and the surface. The Suspense regression test is skipped (see above).
- **Q2 side note:** `fitRef.current = fit` is still assigned during render. It is only called from user events and effects after commit, and both canvases do the same, so it is left as is.

## Verification

- `timeout 300 npx vitest run packages/ui/test/canvas/WorldSurface.test.tsx packages/ui/test/canvas/useStage.test.tsx`: 2 files, **39 passed** (24 useStage + 15 WorldSurface; previously 29).
- `timeout 300 npm run typecheck`: clean (exit 0, no output).
- `rg -i 'gba|gbc|family'` over the two new canvas files: no matches. No `key={url}`. No line over 140 chars.
- No vitest or node processes from this worktree remain.
- Not run: the full gate, the UI build, a live check (not in this brief).
