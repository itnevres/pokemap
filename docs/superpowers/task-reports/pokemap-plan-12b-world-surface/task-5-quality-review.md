# Plan 12b Task 5: code-quality review (High)

Reviewer: Opus, quality pass. Scope: uncommitted `packages/ui/src/canvas/WorldSurface.tsx`, `canvas/worldSurfaceAdapter.ts`, `test/canvas/WorldSurface.test.tsx`, and the `useStage.ts` diff. I read all four plus `worldView.ts`, `useWorldTiles.ts`, `view.ts`, `shared/useWorldContext.ts`, `shared/useFitShortcut.ts`, `world/useConflictAcceptance.ts`, `shared/worldBadges.ts`, and the matching sections of `GbcWorldCanvas.tsx` and `WorldCanvas.tsx`. Per the brief, I did not run vitest or npm because the gate is running. I re-derived the fixtures by hand (below). The mutation evidence comes from the fix1 report's table. I checked that each mutation is plausible against the code, but I did not re-run any.

## Verdict: Approved with fixes

There are no Critical findings. One Important finding is an adapter-type gap that Task 8 (GBA) would otherwise have to work around with a cast or a side channel. The Minor findings are cheap, and most can be folded into Task 6.

## Important

**I1. `drawExtraLayers` cannot reach family world data without a cast. `worldSurfaceAdapter.ts:84`, `WorldSurface.tsx:239`.**
GBA's only extra layer is the dive/emerge triangles (`WorldCanvas.tsx:1327-1336`). It iterates `world.verticalLinks`. `SurfaceWorld<P, C>` has no such field, and the adapter cannot add one because the type is generic only over `P` and `C`. The wrapper memoises the adapter outside the surface, while `useWorld` runs inside it, so the adapter object has no closure over the raw GBA world either.
Failure scenario: in Task 8 the GBA adapter must either return a world with an undeclared extra property and cast in `drawExtraLayers` (`(a.world as GbaWorld).verticalLinks`, which typecheck no longer guards), or publish the raw world through a ref that `useWorld` writes during render. That second option is the render-time ref leak that this task's own fix round removed from `useStage`.
Fix (small, now or as an explicit Task 8 brief item): add a third generic, `W extends SurfaceWorld<P, C> = SurfaceWorld<P, C>`, and thread it through `WorldData.world`, `WorldStatus.world` and `drawExtraLayers`'s `world`. GBA then declares `verticalLinks` on its `W`, and its status items get typed access too. Because the default is set, the GBC adapter and the fake adapter do not change.
Related, not a finding: the triangles' viewport cull in GBA needs the viewport, which is not in the argument. `ctx.canvas.width/height` already equals the viewport (`WorldSurface.tsx:391-392`), and the canvas clips off-screen triangles anyway, so this is acceptable. Say so in the Task 8 brief.

## Minor

**M1. `fitRef.current = fit` is written during render. `WorldSurface.tsx:141`.**
The fix round moved `boundsFor` (useStage `:37-40`) and `maxZoomRef` (`WorldSurface.tsx:125-127`) to commit-time publication, and the comment at `:89-90` gives the reason. `fitRef` still uses the render-time write the fix round removed elsewhere, so the file contradicts its own stated rule. The practical impact is nil today. `stableFit` is reachable only through `useStageFit`'s `fitOverride`, whose callers in a chromeless continuous stage are all inert: there is no image auto-fit, F is disabled, and no `ContextMapFit` provider exists. Either publish it in the same `useLayoutEffect` as `maxZoomRef`, or note that the callback is inert by design.

**M2. If the first world has no sized placements, the view never becomes fitted. `WorldSurface.tsx:150-152`, `:203`.**
`initialFitDone` is stamped before `fitWorld()`. When `fitClusters` returns null, `fitWorld` is a no-op, so `view.fitted` stays false and `visible` stays `[]` permanently. Failure scenario: a world that loads with zero drawable placements, and then gains one through a later GET (reload) or the Task 6 rail drop, draws nothing until the user presses Fit or jumps. GBC carries the same latent behaviour (`GbcWorldCanvas.tsx:540-546`), so this is not a regression for GBC. GBA has no fitted gate today, so it is new for GBA. Fix: have `fitWorld` return whether it fitted, and stamp the ref only on success.

**M3. Badge colours are read inside the per-conflict loop on the pan hot path. `WorldSurface.tsx:248-250`.**
Both source canvases resolve `conflictColor` and `acceptedColor` once per draw (`GbcWorldCanvas.tsx:829-830`, `WorldCanvas.tsx:1317-1318`). The surface calls `getPropertyValue` once or twice per conflict per frame. Hoist the two colours above the loop, as the sources do. That also shortens the loop.

**M4. `hiddenCount` is recomputed on every render. `WorldSurface.tsx:337-339`.**
GBA memoises it (`WorldCanvas.tsx:907`). Here it walks every placement and calls `adapter.drawnByDefault` on each pan or wheel frame. It is O(n) at about 391 maps, so cheap, but it churns for no reason. Wrap it in `useMemo([world, adapter, revealed])`. `spotlightEntries` (`:330`) also allocates a visible-length array every render, even when the spotlight is off. GBC returns `[]` early when there are no hits (`GbcWorldCanvas.tsx:807-810`). This is a nit.

**M5. Rationale comments dropped from the sources.**
- GBA's coverage-error comment above `WorldLensControl` (`WorldCanvas.tsx:1824-1830`): a failed `/api/coverage` replaces the lenses with an error instead of "0 maps have no encounters", while the spotlight is unaffected. `WorldSurface.tsx:363` has no comment.
- Both canvases' badge comment, "connection bugs become visible as geometry; never hidden behind a toggle" (`WorldCanvas.tsx:1339-1341`, `GbcWorldCanvas.tsx:832-835`). `WorldSurface.tsx:221` keeps only the order.
- `borderEntries` lists `encounterVersion` as a dependency that is not read in the body (`:304`). This is a deliberate cache-bust over a ref, but it has no comment, and the next reader or the exhaustive-deps lint will "fix" it. `useLensOverlayEntries` takes `encounterVersion` for the same reason. One clause covers both.
None of these comments sits above a short wrapper. The comments that were kept (F5 / ~308 of 391, Task 21 viewport, drag-frame filter re-fit, fade scoping, token key, the O(n²) ponytail note, the encounter never-retry note) are accurate and well shortened.

**M6. The surface's own in-context zoom-cap wiring is not under any Task 5 test. `WorldSurface.tsx:91-92`, `:97`, `:125-127`.**
The `useStage`-level cap test (`test:16-31`) is good. Mutation: dropping `boundsFor` collapses the cap to `max = 16`, so the test fails. But removing `boundsFor` from the surface's `zoomPolicy`, or dropping the `maxZoomRef` publication, fails no Task 5 test, because outside context `maxWorldZoom(base) = base` equals the static max. Existing GBC context tests (`GbcWorldCanvasContext.test.tsx:290`, `:314`) will catch this once Task 7 routes GBC through the surface. Acceptable if the conductor confirms those tests run against the surface in Task 7. Otherwise, add one fake-adapter test with a `context` prop.

**M7. Nits.**
- `useRef(createPlacementLedger())` (`:83`) builds and discards a ledger on every render. The brief spelled out this exact form, so this is harmless, but `useState(createPlacementLedger)[0]` or a lazy ref would avoid it.
- `setRevealed((old) => new Set(old).add(p.map))` (`:182`) makes a new Set even when the map is already revealed. That invalidates `drawn`, so `sideByMap` reruns its O(n²) pass on a same-map re-jump. Return `old` when `old.has(p.map)`.
- `type Encounter = Awaited<ReturnType<WorldSurfaceAdapter<...>["fetchEncounters"]>>` (`:45`) is indirect. A named exported `EncounterEntry` in the adapter file would read better and let Tasks 7-8 annotate their fetchers.
- The test name "…after a wheel zoom and after a pan" (`test:273`) is accurate only in that the pan change comes from a second jump. Real drag-pan is Task 6. Rename it or say so in the comment.

## Focus items checked with no finding

- **`useStage` `boundsFor` and MapSurface/stepped behaviour.** For a stepped policy, `bounds` is `undefined`, so the original `policy` is passed unchanged (`useStage.ts:42-43`). The same holds for a continuous policy without `boundsFor`. The added cost is one deps-less `useLayoutEffect` per stage commit, with no behaviour change. The wheel listener's deps are still scalar (`:75-76`), so an inline `boundsFor` never rebinds it. The updater reads `boundsFor.current(view.zoom)` from its own view, which is pure, so StrictMode's double invocation is harmless. Uncontrolled updaters run during the next render, after the last commit's publication. Controlled updaters run synchronously at event time from `latest.current`. Both see committed bounds.
- **StrictMode effects.** The initial fit, filter fit, jump and encounter effects are all ref-guarded and set one plain view value. The fit, filter and jump effects run in declaration order (`:149`, `:158`, `:176`), so a jump in the same commit as the first world or a new filter correctly wins. Re-arming `useWorldTiles`'s `mounted` ref covers StrictMode's unmount and remount.
- **Encounter cache.** The placeholder is set synchronously (`:275`), so effect reruns and StrictMode do not refetch. A rejection stores `FAILED_ENCOUNTERS`, increments the count and bumps the version, with no retry. A resolution after unmount only calls a no-op setState. `methodTint` is a pure function of the fetched sources in both families (`GbcWorldCanvas.tsx:275-282`, `WorldCanvas.tsx:1120-1126`), so computing it at fetch time is equivalent. GBC's time-of-day handling is dimming inside `EncounterBorder` via `border.time` (`GbcWorldCanvas.tsx:332`), not a refetch, so leaving the cache unkeyed on `cacheKey` is correct.
- **Draw loop.** `viewport` and `tiles.version` are in the deps. `conflictAcceptance.acceptedKeys` stands in for `isAccepted`, which is rebuilt each render from `acceptedKeys` and `world` (`useConflictAcceptance.ts:11`). LOD `smallTilesAt(zoom, nativePx)` gives a threshold of 4 for 16 px, equal to GBA's `LOD_ZOOM_THRESHOLD`, and 8 for 32 px, equal to GBC's. `EncounterBorder`'s `lodZoom` matches. Badges are skipped before the fit, which is fine because `visible` is `[]` then.
- **Pan hot path.** `drawn` and `sideByMap` have no view dependency. `visible`, `rectByMap`, `borderEntries` and the lens entries change on every pan frame, which is inherent because the rects move. That matches both sources. `visible` is a new array per frame even when the culled set is unchanged, so `useWorldTiles`'s and the encounter effect's loops rerun as cheap Map hits. Both source canvases behave the same way, so this is not a regression.
- **Adapter for GBC (Task 7).** `cacheKey = time` and `border.time` live on a memoised adapter, so when time changes the adapter's identity changes. That reruns `drawn`/`sideByMap` (fine) and redraws. It refetches nothing (the encounter, jump and initial-fit effects are guarded). `fitFirst` and `statusItems` cover GBC's DOM (Fit leads, zoom shown in the status bar). The GBA 0x0-orphan rule fits the contract: the adapter's `useWorld` maps wire placements to sized `P`.
- **Single projection (P12-6).** Every overlay reads `rectByMap`, or `screenRect`, which is `rectOf`, for culled outlines. The culling bounds in `visible` are the inverse transform, not a second projection.
- **The `gba|gbc|family` grep in `canvas/`.** The new files have no hits. The existing hits are older comments.

## Hand re-derivation of the test fixtures (viewport 200x100, nativePx 16)

- Cluster fit, A..D: x 10..50, y 10..30, so 40x20. zoom = min(200/40, 100/20) = 5. pan = (-50 + 0, -50 + 0) = (-50, -50). A's rect is (0, 0, 50, 50). Zoom readout: 5/16 = 31.25%, shown as 31%. Matches `test:143,150,168,185`.
- The window after the fit is x [10, 50), y [10, 30). Near (100, 50) and Far (1000, 1000) are outside it. Hidden is inside it but not drawn by default. Requested: A, B, C, D. Matches `:178`.
- Filter {A, Shelf}: Shelf's component is 99, which is at least `components.length` (6), so Shelf is not anchored. Fit A alone (10x10): zoom = min(20, 10) = 10, which is at most 16. pan = (-100 + 50, -100 + 0) = (-50, -100). A's rect is (50, 0, 100, 100). Matches `:225`.
- Manual filter Fit {A, B} (20x10): zoom 10. pan (-100, -100). 62.5% rounds to 63%. A's rect is (0, 0, 100, 100). Matches `:237-239`.
- Jump to B: raw zoom min(20, 10) = 10, times 0.6 gives 6. pan = (-120 + 70, -60 + 20) = (-50, -40). B's rect is (70, 20, 60, 60). A's rect is (10, 20, 60, 60). 37.5% rounds to 38%. Matches `:245-251`.
- Jump to Hidden (5x5): raw zoom min(40, 20) = 20, times 0.6 gives 12. pan = (-120 + 70, -120 + 20) = (-50, -100). Rect (70, 20, 60, 60). 75%. Hidden count 0. Matches `:266-270`.
- Wheel in at (100, 50) from zoom 5, pan (-50, -50): the source point is (30, 20). Zoom 6. pan = (-80, -70). Badge centre: cx = 60 - 80 + 60 - 10 = 30, cy = 60 - 70 + 10 = 0. `moveTo(30, -10)`. Matches `:204-206`.
- Wheel in from the jump to B at (100, 50): the source point is (25, 15). Zoom 7.2. pan = (-80, -58). B's rect is (64, 14, 72, 72). The jump to D followed by a wheel out gives (75, 25, 50, 50). Matches `:276-290`.
- Zoom-cap test: the cap at 3 is max(2, 3) = 3, so 3.6 clamps to 3, and 3/1.2 = 2.5. Matches `:25-30`.

Every expected number is a literal derived in a comment. Production code supplies none of them. The projection tests compare the DOM against the `drawImage` arguments and also check the hand values with `toBeCloseTo`.

## Test quality

- There are no `waitFor` probes. The async tests use bounded `await act(async …)` microtask flushes. The 2000 ms fade timer is never reached and `cleanup` clears it. The fade itself is Task 6's test (PR12b-M2).
- The `getContext` spy records the stage canvas only, so `buildSmallTile` calls no longer pollute the order log. Draw order is checked within one redraw, sliced at `clear`.
- Mutation evidence (fix1 table, nine mutations) covers the fitted gate, cluster versus all fit, the jump fraction, the outline projection, draw order, the placeholder, the viewport guard on the jump, failed-entry storage and the token key. I checked each against the code and they are plausible. The coverage gap is M6.
- `findLastIndex` and `.at(-1)` need ES2023, which `packages/ui/tsconfig.json` includes in `lib`.
