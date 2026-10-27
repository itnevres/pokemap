# Task 5 spec-compliance review (High, Opus)

Scope: uncommitted `packages/ui/src/canvas/WorldSurface.tsx`, `worldSurfaceAdapter.ts`, `packages/ui/test/canvas/WorldSurface.test.tsx`, `git diff packages/ui/src/canvas/useStage.ts`, checked against `task-5-brief.md`, plan 12b Task 5 and the Global Constraints, and spec rulings P12-4e/m/p/q/t/u and P12-6. I read the code before the implementer reports. I did not run vitest or npm, because a full gate was running. Mutation evidence comes from `task-5-fix1-report.md`. I checked it by tracing the code and did not re-run it.

**Verdict: PASS.** I found no Critical or Important findings. There are 5 Minor findings. Three of them are carry-forwards for Tasks 6-8.

## Brief rules 1-15

| # | Rule | Result | Evidence |
|---|---|---|---|
| 1 | Ledger ref passed to `useWorld` | OK | WorldSurface.tsx:83-84 |
| 2 | `useStage<WorldView>` options (continuous, WHEEL_FACTOR, worldZoomRange, boundsFor, mapName "world", zeros, side, stable fit via ref, chromeless) and `useFitShortcut(fit, fitEnabled)` after `useWorldContext` | OK | :87-106, :137-143. With chromeless set, useStageFit's own F binding is off (useStage.ts `useFitShortcut(fit, !chromeless)`), so F is bound once. |
| 3 | `boundsFor` on the continuous policy, applied to the updater's own view, read through a ref, and not in the wheel deps. The surface supplies `worldZoomBounds(nativePx, z, maxWorldZoom)` through a ref | OK | useStage.ts diff (published in a layout effect, deps unchanged). WorldSurface.tsx:91-92, :125-127. `applyZoom` gets the same clamp, which matches GBC's keyboard zoom (`GbcWorldCanvas.tsx:1101,1106`). |
| 4 | `inScope`; `drawn` in world placement order (P12-4t), with size, filter and the default/revealed rule only when unfiltered; `visible` is the AABB and is `[]` until `fitted` | OK | :113, :196-209. The AABB is identical to GBA `intersects` (`WorldCanvas.tsx:251`). The F5 reasoning is kept at :145-147. |
| 5 | First-load fit once per mount, measured, one updater value, null bounds means no fit | OK | :148-153 via `fitWorld` (:130-136). StrictMode: the ref survives the simulated remount, and the update is a plain value, not a relative updater. |
| 6 | Filter fit once per Set instance, reset on null | OK | :155-166. The reasoning is kept in short form. |
| 7 | Manual Fit (`fitFilter`/`fitClusters` + `computeFit`), context fit, `fitEnabled` | OK | :130-143 |
| 8 | Jump: unstamped wait (P12-4u), stamp, missing or empty stops, reveal when unfiltered (P12-4q), jumpFit + fitted, highlight `{map, token}`, separate 2000 ms fade, node keyed by token (P12-4p) | OK, with one documented addition | :175-193, :417-427. Added beyond the brief: it also waits for a measured viewport (:178). Without that wait, a jump present at mount stamps its token against `{0,0}`, `jumpFit` falls back to zoom 1 / pan 0 with `fitted:true`, and the cluster fit then replaces it with no retry. The fix1 report confirms this (S1). The wait is correct and stricter than GBC, which has the latent bug. |
| 9 | `useWorldTiles` wiring | OK | :210-217 |
| 10 | Draw: clear, tiles (small/img by `smallTilesAt`), extra layers, badges per GBC (in-scope, sized, offsets, center, diamond, accepted colors, ✓, `badgesRef` text = prefix + `conflictTooltip`); `viewport` dep with the Task 21 citation | OK | :222-264. Differences from the canvases, both intended: (a) GBA badges ignore the filter (`WorldCanvas.tsx:1343-1348`) while the surface applies `inScope` as the brief rules, and impl-notes reports this; (b) neither canvas skips badges and extra layers before the fit, while the surface returns early when `!view.fitted` (:235), which matches the P12-4e "nothing drawn pre-fit" guarantee. |
| 11 | One projection (P12-6) | OK | `rectByMap` (:291) built with `rectOf`. Outline fallback (:342-346) is the same `rectOf`. The only other view arithmetic is the inverse projection used for culling (:204-207) and the shared `conflictBadgeCenter`. |
| 12 | Encounters once per map ever, synchronous placeholder, failures counted and stored as loaded-empty, version bump; border side over `drawn` with the ponytail comment; `lodZoom = nativePx*LOD_SCALE` | OK | :269-304, :399. 16×0.25 = 4 = GBA `LOD_ZOOM_THRESHOLD` (`WorldCanvas.tsx:52`); 32×0.25 = 8 = GBC `GBC_LOD_ZOOM_THRESHOLD` (`GbcWorldCanvas.tsx:143`). On failure the border gets `[]` and while loading it gets `undefined`, which matches `GbcWorldCanvas.tsx:761`. `sideByMap` over `drawn` equals GBC's in-scope set (every GBC placement is drawn by default) and equals GBA's `drawnPlacements` (`WorldCanvas.tsx:1028`). |
| 13 | Lens entries (themed level map, empty names, `methodTintFor` from the cache), spotlight best-percent | OK | :306-330. The strict `<` tie-break matches both canvases. |
| 14 | `useWorldContext` with an in-scope sized placement and `setView` that keeps `fitted`; `useConflictAcceptanceMenu`; menu, toast and null tooltip rendered | OK | :107-124, :430-433 |
| 15 | Unplaced names = singletons not placed, sorted; rail filter state | OK | :332-336 |

Scope split: no Task 6 logic leaked in. There are no mouse, key or drop handlers, no `useWorldDrag`, no warp fetch, and no POSTs. `selected` is an empty state with a `// Task 6:` marker (:169). Task 6 markers are at :169, :354 and :434. `useStage.test.tsx` is unmodified. `rg -i 'gba|gbc|family'` finds nothing in the two new canvas files or in the useStage diff. The existing hits are in comments of files from earlier tasks. There is no `key={url}`. `worldSurfaceAdapter.ts` contains types only.

Adapter shape: the brief's shape is kept, and every `unknown` is now a real type (`EncounterBorderProps["band"|"time"]`, `ComponentProps<typeof WorldLensLegend>` coverage/methodKey/legendCopy). The new slots `legendExtras` and `fitFirst` and the optional `canvasLabel` are each justified by the DOM diff below. The methodTint check is correct: GBA `methodTintFor` (`WorldCanvas.tsx:1120-1127`) reads only the fetched method rows, and GBC `methodTint(sources)` reads only the fetched sources. Both are pure, so computing the tint once at fetch time is equivalent.

## Hand re-derivations (independent of the test comments)

Viewport 200×100. nativePx 16, so the zoom range is [16/2048, 16].

- **Cluster fit.** Clusters A(10,10), B(20,10), C(30,20), D(40,20), each 10×10. Union x 10..50, y 10..30 = 40×20. Shelf (component 99) resolves to no component and is excluded, as are the singletons Far, Hidden and Near. zoom = min(200/40, 100/20) = 5. pan.x = −10·5 + (200−200)/2 = −50 and pan.y = −10·5 + (100−100)/2 = −50. A lands at (0,0,50,50). Zoom percent 5/16 = 31.25%, shown as 31. Fit window: x [50/5, 250/5) = [10,50) and y [10,30). That gives A, B, C, D. Near (100,50) and Far are out. Hidden is inside the window but not drawn by default. All of this matches the test.
- **Filter fit, {A, Shelf}.** Only A is anchored. zoom = min(200/10, 100/10) = 10. pan = (−100+50, −100+0) = (−50,−100). A lands at (50,0,100,100), which matches. Filter {A,B} with a manual Fit: union 20×10, zoom 10, pan (−100,−100), A at (0,0,100,100), 62.5% shown as 63. Matches.
- **60% jump to B (20,10,10,10).** raw = min(20,10) = 10, and ×0.6 = 6. pan.x = −120 + (200−60)/2 = −50 and pan.y = −60 + (100−60)/2 = −40. B lands at (70,20,60,60) and A at (10,20,60,60). 6/16 = 37.5%, which `Math.round` shows as 38. Matches.
- **Hidden jump (10,10,5,5).** raw = min(40,20) = 20, and ×0.6 = 12. pan = (−120+70, −120+20) = (−50,−100). The rect is (70,20,60,60) at 75%. After the reveal the hidden count is 0. Matches.
- **Projection.** From zoom 6 / pan (−50,−40), wheel in at (100,50): source (25,15), zoom 7.2, pan (−80,−58), B at (64,14,72,72). Jump to D: raw 10, zoom 6, pan (−170,−100). Wheel out at (100,50): source (45,25), zoom 5, pan (−125,−75), D at (75,25,50,50). Matches.
- **Badge.** Wheel in from zoom 5 / pan (−50,−50) at (100,50): source (30,20), zoom 6, pan (−80,−70). `conflictBadgeCenter` gives cx = 60−80+60−10−0 = 30 and cy = 60−70+10 = 0. `drawDiamond` then calls `moveTo(30,−10)`. Matches.
- **Zoom cap test.** base 2, current 3. Wheel in: 3.6 is clamped to max(2,3) = 3, so the view stays put. Wheel out: 3/1.2 = 2.5. The policy max is 10, so without `boundsFor` the wheel-in would reach 3.6. The test is sensitive to this mutation.

## Test list 1-9

All 9 cases exist, and the numbers are derived by hand in the comments. I traced mutation (a) myself, dropping the `fitted` gate. In the commit where the viewport becomes 200×100 but the fit has not landed yet, the default view (zoom 1, pan 0) puts Near inside `visible`. The tiles effect, which runs after the initial-fit effect, then requests Near. So "requests nothing from the pre-fit view" fails, as the fix1 table claims. The other claimed mutations (b-f, viewport guard, failed-entry store, token key) are consistent with the assertions I read.

## DOM comparison (re-checked against `WorldCanvas.tsx:1813-2003` and `GbcWorldCanvas.tsx:1151-1300`)

The impl-notes table is accurate. I checked these points:
- Toolbar: GBA has the switches, the alert, the grow group, then zoom+Fit. GBC has Fit, the switches and errors, the alert, the save/reload errors, then the grow group. The surface renders [Fit if `fitFirst`], `toolbarExtras`, the alert, the grow group, [readout+Fit]. That is faithful for Task 5 content.
- Lens legend: the props differ only in methodKey and copy, which are covered by `lensLegend`. Conflict legend: GBA adds Dive and Emerge, which are covered by `legendExtras`.
- Placeholder: same text and class. Canvas: same class and tabIndex. GBA has no aria-label, so `canvasLabel` is optional.
- Overlay sibling order differs between the families. It is not observable, because `.world-canvas__selection` has z-index 6 and `.world-canvas__lens` / `.world-canvas__spotlight` have z-index 2 (`styles.css:1739-1745`, `:1811-1816`).
- Status: `statusItems` receives the world, which is enough for both families' counts.

## Findings

### Critical
None.

### Important
None.

### Minor

1. **The retention test (case 7) can't catch a dropped old tile before onload.** `WorldSurface.test.tsx:313-316`. After `rerender(... tileVersions={{ Hidden: 2 }})`, none of the draw effect's deps change (`visible`, `view`, `tiles.version`, `adapter` and `inScope` are all stable, and `useWorldTiles` only bumps `version` on onload). So no redraw happens, and `log.at(-1)` is the draw from before the bump. Scenario: if the surface or `useWorldTiles` cleared `entry.tile` on a URL change, the "old image is still drawn" assertion would still pass. Fix: force one redraw between the rerender and `next.onload` (for example, a wheel event), then assert that the last tile draw is `old`. The useWorldTiles tests from Task 3 cover retention itself, so the risk is low.

2. **A first load with a filter whose fit bounds are null leaves the canvas blank until the user presses Fit.** WorldSurface.tsx:149-152 sets `initialFitDone` even when `fitWorld` finds no bounds (`fitFilter` returns null when no filter member has a sized placement). `fittedFilter` resets on null but does not re-fit (:159-161), so after clearing the filter `view.fitted` stays false and `visible` stays `[]`. GBC has the same behavior today (`GbcWorldCanvas.tsx:538-546`). GBA has no fitted gate, so for GBA this is a new behavior. The brief rules only the empty-world case. Suggestion: stamp `initialFitDone` only when a fit actually landed, or report this to the conductor as an inherited GBC edge.

3. **Carry-forward for Task 6/8: GBA's `.world-canvas__toasts` wrapper.** In GBA, the conflict, save and reload toasts sit inside `div.world-canvas__toasts`, and GBC has no wrapper. The surface renders a bare `ConflictErrorToast` (:433), which looks identical while only that toast exists (same absolute left/bottom/z-index 10, `styles.css:1046-1079`). It will matter when GBA's save and reload toasts arrive, because a bare toast would overlap rather than stack. impl-notes and fix1 both defer this. It needs a slot decision in Task 6.

4. **Carry-forward for Task 6/7: GBC's save/reload error toolbar groups come after `EncounterFetchAlert`** (`GbcWorldCanvas.tsx:1171-1183`). A single `toolbarExtras` slot before the alert (WorldSurface.tsx:359-360) cannot keep that order. GBA's stage `--dragging-map` class modifier (`WorldCanvas.tsx:1811`) also needs a hook, and the impl-notes table doesn't list it. Neither is Task 5 content.

5. **Unflagged family difference, ruled by the brief: a jump in filter mode never reveals.** WorldSurface.tsx:182 reveals only when `!mapFilter`, as rule 8 says. GBA reveals a hidden in-filter map on a filtered jump (`WorldCanvas.tsx:721-723`), and that map then stays visible after the filter clears. Under the surface it goes back to hidden. The brief rules this, so it is not a defect. It is listed here so the conductor knows the GBA behavior changes.

Notes (not findings): the local `Hit` type (:44) duplicates the non-exported `SpotlightHit` shape plus `mapName`. That is acceptable. `setRevealed` always allocates a new Set (:182), even when the map is already revealed, which costs one extra render per jump and does no harm.

## Implementer claims vs code

- impl-notes says "no mutation checks". This is superseded by fix1, which records 9 mutations with failing counts.
- fix1 says "39 passed". I did not re-run it (gate in progress). The orchestrator's gate result is the evidence.
- "Overlay order unobservable": I confirmed this from the CSS z-indexes.
- "Jump waits for viewport": I confirmed it is necessary (see rule 8).
