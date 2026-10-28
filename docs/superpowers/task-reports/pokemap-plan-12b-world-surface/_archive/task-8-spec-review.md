# Plan 12b Task 8 spec review (High): GBA world canvas onto `WorldSurface`

Reviewer: Claude Opus fallback (Codex at its usage limit). This was a read-only review of worktree `wt-t8` (base `a09fbcf`, Task 8 uncommitted). I ran no vitest, npm, tsc or build. The old GBA canvas was read from `git show a09fbcf:packages/ui/src/components/WorldCanvas.tsx` and compared side by side with `gba/worldSurface.tsx` plus `canvas/WorldSurface.tsx`. I read the code before the implementer notes and the conductor report.

## Verdict: Approved with fixes

The adapter, wrapper, colour move and reconciliation match the old GBA behaviour wherever no ruling changes it. Every rebased literal I re-derived is correct, and no assertion was deleted or loosened. There are no Critical findings. One Important finding: P12-4e silently made some unchanged GBA tests vacuous. They still pass, so the inventory (failures only) missed them. The rest is Minor: stale comments and record drift.

## Adapter fields traced to old GBA lines (same observable behaviour unless a ruling says otherwise)

- `nativePx` 16 (old :39). Zoom readout `Math.round(zoom/16*100)` is the same (old :1835, surface :389).
- `imageUrl`: identical encoded `/api/render/<map>.png` plus a truthy `?v=` (old :940-941).
- `useWorld = useGbaWorld`. Reconciliation is line-identical to old :490-527. `ledger.snapshot()` is taken at GET issue, outside any updater (new :76). The keep set is evaluated at landing, before `setRaw` (new :81-82). The keep rule `!serverShows(name, snap) || (!(name in d.placements) && !dropAbsent(name, snap))` is unchanged. The updater only reads `previous` and the immutable `keep`. Toggle settlement moved to the surface: `setLoadedGen(refetchGen)` in the same batch as `setRaw`, and the surface clears pending when `loadedGen >= toggleReloadGeneration` (WorldSurface :452-457). That is equivalent to old :516-519, because `reload()` always returns a generation above any landed one, and the effect cleanup cancels older GETs. The `ledger` dependency is stable (`useState(createPlacementLedger)`, surface :94). Dropping `setCompositeVersion` is fine because the draw effect depends on `world`.
- Component:-1 sizing: the `world` memo restores singleton sizes (new :112-121), replacing `sizeOfPlacement` (old :224-227). True orphans stay 0x0 and are excluded by `hasSize`, as before.
- `move`: for drag frames it keeps every field and changes x/y (old :1598-1632). A fresh rail drop fabricates `{map, x, y, size, component: -1}` (old :1801-1806). An already-placed map keeps its metadata, as ruled by P12-4v(1).
- `postPlacement` / `postDungeons`: same URLs, same `{map,x,y}` / `{enabled}` bodies, no headers, a non-OK status throws with the same message (old :1433-1442, :542-545).
- `saveErrorPolicy: "dismissible"`, `wrapToasts` with `div.world-canvas__toasts`, and `draggingMapClass` `world-canvas__stage--dragging-map` (old :1811, :1946). These fields are omitted, so the defaults hold: `pruneSelectionOnFilter`, `dropSize`, `modifiedDoubleClick`, `shiftClickSelects`, `overlayOrder`, `borderNeighbours`, `unresolvedWarpError`, `connectionColors`, `fitFirst`, `canvasLabel`. Group membership has no filter guard (surface :438).
- `drawnByDefault`: identical (old :244-246).
- `warpOffset: 1`. `warpPoint` gives `(p.x + w.x*1)*zoom + pan.x`, the same as old :1183-1184.
- `fetchWarps`: `fetchGuarded` with the same label `/api/warps/<raw name>`, so the non-OK message is the same as old :999. `resolveDestination` uses `cache.get(destMapName)?.[Number(destWarpId)]` with no fallback, the same as old :1231-1243. A null (in-flight) cache entry yields no line. The P12-4r scope comment sits above `fetchWarps` (:188-189), as the brief asks.
- Vertical-link triangles (`drawExtraLayers`): same tokens and fallbacks, the same corner `(x + BADGE, y + h - BADGE)`, and the same `drawTriangle`. They draw after tiles and before badges (surface :278). The viewport cull uses `ctx.canvas.width/height`, which equal `viewport.w/h` (surface :827-828), so it is equivalent to old :1332. The unscoped lookup is kept on purpose. P12-4v(3) scopes only conflict badges.
- `conflictTooltip`: the text is byte-identical to old :1363, and the accepted prefix is still added by the surface.
- `fetchEncounters`: same URL and guard, `summariseGba` on arrival, the same water > fishing > rock-smash tint. A failure is counted and gives `[]` summaries and a null tint, the same as old :971-981 and :1121-1122.
- Level colours: `themedLevelColorMap(levelByMap)` and `emptyMapNames` are as before. `worldColours.ts` holds the three helpers unchanged apart from the comments and a split declaration.
- `statusItems`: the textContent is identical to old :1990-2002, including "placed N · hidden H · unplaced U · C conflicts · A accepted", the hover copy, " · Shift+drag to move" and "Hover the world…".
- Toolbar DOM order: Dungeon switch, Warps, optional Connection lines, the warp alert (P12-4d), EncounterFetchAlert, the grow group (spotlight, lenses), then the zoom readout and Fit. This matches old :1816-1839 plus the ruled alert. The legend (conflict items, then Dive and Emerge), the viewport overlay order, the toasts, the rail (hidden in context under P12-7) and the warp popup position also match.
- Wrapper: the same `WorldCanvas` export, `WorldCanvasProps` and `WorldCanvasContext` (field types unchanged). `computeFit` is re-exported with the P12-4j default (1/128..16), and `drawDiamond`, `levelColorMap` and `themedLevelColorMap` are re-exported. The adapter is memoised once and holds no prop-dependent state. `WorldSurface.tsx` changed only its import line. The conductor's `worldView.ts` constant change and the `gbc/worldSurface.tsx` comment come from the amendment.

## New tests (`WorldCanvasSurface.test.tsx`): coverage and re-derived numbers

All of P12-4c/d/e/j/m/n/o/p/r/s go through the real wrapper. The fixture is a 200x100 viewport: A(0,0,10,10) and B(30,10,10,10) form a cluster, Near(100,50) is a singleton, and Far is shelved (component 99).
1. P12-4e: cluster union 40x20 gives z = min(5, 5) = 5 and pan (0,0). The readout is round(31.25) = 31%. B draws at (150,50,50,50). Near (100..110, 50..60) is inside the old z1 window but outside the fitted [0,40)x[0,20). Correct.
2. P12-4m: B 10x10 gives z = min(20,10) = 10 (under 16). Pan = (-300+50, -100+0) = (-250,-100). The box is (50,0,100,100) and the readout round(62.5) = 63%. Correct.
3. P12-4n: z5 to 6 about (100,50) gives pivot world (20,10) and pan (-20,-10). A becomes (-20,-10,60,60) and the readout round(37.5) = 38%. Correct.
4. P12-4r: the filter fit anchors A and B only, giving z5 and pan 0. The A warp (2,3) maps to (10,15). Far warp index 1 is (4,5), so (1004,1005)*5 = (5020,5025). Correct.
5. P12-4r scope: with B.x = 90 the cluster is 100x20, giving z = min(2, 5) = 2 and pan (0,30). Four ticks give 2·1.2^4 = 4.1472 ≥ 4. About pivot (0,0), A sits at y 62.2..103.7 (visible) and B at x ≥ 373 (culled), so ["A"]. Correct.
6. P12-4j: the context snap is 16 px/tile with A centred, pan (20,-30). A wheel at (100,50) is world (5,5); z 19.2 gives pan (4,-46) and size 192. Correct.
7. P12-4p: re-jump at t1500 should expire at t3500. The old code (string state) expired at t2000, so the test discriminates. Correct.

Note: after the amendment the P12-4m test is a preservation test, and it passes on `a09fbcf` (old 100% jump: same z10 and pan). The report's "13/13 red on old source" predates the amendment. Record this; it is expected.

## Rebases: rulings, assertions, re-derived literals

No `expect` was removed. Matchers are unchanged or tightened (`AppWorldContextMenu`: from `toBeTruthy` to an exact `"63%"`). Every changed test traces to P12-4e, P12-4j, P12-4c or the amended P12-4m. I re-derived these by hand, and all are correct:
1. `WorldCanvas.test.tsx` tooltip: Solo 10x10 alone gives z10 and pan 0, so the badge is at (100-10, 0+10) = (90,10).
2. Edge plus Anchor: bounds 95x100 give z1 and pan (2.5,0). The badge moves to (87.5,80), so the (85,80) click is 2.5 px away, which is ≤ BADGE_SIZE 10. It is still a badge hit. The menu clamp (12,62) does not depend on pan.
3. Ghost alone: (5,5,8,6) gives z = min(12.5, 16.67) = 12.5 and pan (-62.5,-50). The rect is [0,100)x[12.5,87.5), so (50,50) hits.
4. MENU_WORLD: union 100x100 gives z1. B's centre is (60+20, 40+30) = (80,70). The empty probes (95,5), (20,90) and (50,50) stay empty. (95,95) is now on B, but it is used only as a `pointerDown`, so its role does not matter.
5. `App.test.tsx`: 30x10 in 100x100 gives z = 10/3. The readout is round(20.83) = 21%. Route1 spans y [33.3,66.7), so (5,50) hits. The second test: 21x10 in 200x100 gives z = 200/21 = 9.524 and 60%. Route2 spans x [104.8,200), so (150,50) hits. The jump gives z10 and 63%.
6. AppContext*: 21x10 in 400x100 gives z10 and pan (95,0), so Route1's centre is (255,50). The snap pan is (255-256, 50-80) = (-1,-30). The overlay pan is (176-1-16, -30-16) = (159,-46). Block (0,0) sits at client [275,291)x[70,86). The 20-wheel test: pivot (95,0) is world (0,0), so the pan stays (95,0) at z16. Route1's centre is 351 and PalletTown's is 175.
7. `WorldCanvasContext.test.tsx`: 23x10 gives z = 100/23 and pan (0, 650/23). B spans [86.96,100)x[28.26,41.30). The snap (95,35) gives pan (-249,11) and MapCanvas pan (55,-5). The key-menu centre (2150/23, 800/23) = (93.478,34.783) rounds to (-251,11), giving (53,-5). The shifted box top 116 gives pointer (95,-23) and MapCanvas pan (55,-63). The readout is round(27.17) = 27%. The warp test: pivot (0,50) is world (0,5); at z16 the pan is (0,-30) and the marker is at (32,18).
8. `canvas/WorldSurface.test.tsx`: D's wheel-out gives z = 10/1.2. D's origin is (100 - 5z, 50 - 5z) = (175/3, 25/3) and its size 250/3. Hidden 5x5: raw 20 is clamped to 16, giving pan (-100,-150), rect (60,10,80,80) and 100%.
9. `worldView.test.ts`: 20x18 in 1000x668 is clamped to 32, giving pan (500-640, 334-928) = (-140,-594).
10. GBC: GbcApp Port at x9 gives a 19x10 fit, z = 100/19, 16%, and Port at [47.4,100). GbcAppContext 400x200 gives z20 and pan (100,0), with City at [100,300) and Port at [300,500). GbcWorldCanvasSurface: 5x5 is clamped to 32, giving pan -31980, (20,20) and size 160.

I found no changed test without a ruling. Fixture changes keep their roles. Singletons stay singletons, Far and Blocker stay offscreen, and the hit targets and empty probes keep their meaning, with the exception noted in I1.

## Findings

### Critical
None.

### Important

**I1. P12-4e silently made some unchanged GBA tests vacuous. The inventory listed only failures, so they were never rebased.**
- `test/WorldCanvas.test.tsx:1849-1865` "draws and fetches art only for maps in mapFilter". Its premise (comment :1858-1864) is that OutsideDungeon (0,20) lies inside the unscoped view, so only the filter source restriction keeps it unfetched. Under the new fit, the filter fit is 30x10, giving z = 10/3 and pan y = 33.3, so the world window is y [-10,20). OutsideDungeon at y = 20 is culled by the viewport anyway. Failure scenario: the `inScope` term in `drawn` (`canvas/WorldSurface.tsx:238`) is broken for GBA, and this GBA test still passes. The shared logic is still pinned by GBC's `GbcWorldCanvas.test.tsx:75-82`, which deliberately moved `Outside` into the scoped fit for this reason. The GBA copy needs the same fix: move OutsideDungeon to (0,5), inside the fitted window but outside the filter.
- `test/WorldCanvas.test.tsx:2587-2598` "right-click on a badge whose map body is not under the pointer". Tiny 10x10 alone now fits at z10, so the badge is at (90,10). The right-click at (0,10) is world (0,1), inside Tiny's body. The menu targets Tiny through `hitTest`, not the badge. Failure scenario: dropping `badge?.map ??` (surface :620) passes this GBA test. It is still caught by the GBC copy (`GbcWorldCanvas.test.tsx:1938`). Fix: add a P12-4e rebase, for example a 100x100 Frame anchor keeping z1, or right-click (90,10) with a body-free fixture.
- Ask: before commit, sweep the unchanged GBA tests whose comments assume "zoom 1 / pan 0 / default view" (`WorldCanvas.test.tsx` :500, :529, :1859, plus the plan's own P12-4e list :487/:515) for passes that are now coincidental. :487 (pan) and :515 (wheel pivot) are zoom-invariant and still discriminate, but their derivations say z1 while the real z is 10 (see M1).

### Minor

- **M1.** Stale derivation comments in unchanged tests the plan named as P12-4e (`WorldCanvas.test.tsx:500` "At zoom=1", `:502` "50,50 is well outside Solo", which is now inside Solo at z10, and `:529-531` "zoom 1 -> 1.2"). The assertions still hold by zoom invariance (pan delta in screen px; pivot pan = s(1-1.2) when pan = 0). Rule: every literal needs a correct adjacent derivation.
- **M2.** `AppWorldContextMenu.test.tsx:93` keeps the old comment "Fresh World view …: zoom 1, pan 0 -- PalletTown [0,10), Route1 [11,21)" directly above the new P12-4e derivation that contradicts it. Delete it.
- **M3.** `WorldCanvas.test.tsx:2662-2671` ("Ctrl+double-click is suppressed and plain double-click opens Map view"): the behaviour change is P12-4c, but the in-test comment and the notes' rebase table (row :2621/:2628) cite only P12-4e. Add the P12-4c citation.
- **M4.** `canvas/worldView.test.ts:154-166` no longer pins scale-before-clamp. With fraction 1 the order cannot be observed, and the brief asked to keep an explicit `0.6` for that case. It is still guarded by `gbc/GbcWorldCanvas.test.tsx:396` (explicit 0.6, through the same `worldJumpFit`). Add one explicit-`0.6` assertion to the shared pure suite, or note the coverage there. The new title ("fills the limiting viewport dimension before clamping") is also confused.
- **M5.** Stale "60%" text: `canvas/WorldSurface.tsx:202` ("the 60% fit waits for a measured viewport"), the plan's Task 8 Test line (`P12-4m (jump 60%)`), and `task-8-impl-notes.md:136` ("P12-4m derives B's 60% rect 70,20,60,60 and 38%"). The spec was amended but these were not.
- **M6.** `gbc/GbcApp.test.tsx:767` moves OlivinePort to x9, so City [0,10) and Port [9,19) now overlap by one block. The click at (95,50) is inside both, and it resolves to Port only because Port is later in placement order (hit order, P12-4t). The roles are kept, but the comment should say so. A wider viewport, as in the GbcAppContext fix, would avoid the overlap.
- **M7.** `gba/worldSurface.tsx:162`: `levelByMap: data?.levelByMap ?? []` makes a new array on every render while coverage is loading or has failed. That re-runs `themedLevelColorMap` (a `getComputedStyle` call) and the lens entries on every render, including drag and hover frames. The old memo was keyed on `coverageData`. Use a module-level empty constant. This is behaviour-neutral and belongs to the quality pass.
- **M8.** `gba/worldSurface.tsx:152` comment: "The existing route has no required map identity field". The GBA route sends `mapName` (`server/src/index.ts:548`). Better: "GBA does not validate the optional `mapName`, as before" (the notes say this correctly).
- **M9.** Unruled, probably unreachable old-behaviour delta: the old `toggleDungeons` POSTed even before `world` loaded (old :537-542). The surface returns early when `!world` (surface :459), so a click on the switch during "Loading world…" now does nothing. This is surface behaviour from Task 6 and also applies to GBC. I list it for completeness. It looks like a fix, not a loss.
- **M10.** Notes and report record quality: the Pass 2 table has duplicate rows (`AppContextEdit :214` ×3, `WorldCanvas :2677` ×2, `GbcAppContext :477` ×2) and calls Route1 "B 255,50". The report's line "35 fixture rebases stay green under M4/M8/M9" lists AppContextEdit/AppContextStroke. Those were literal rebases at pan (95,0), not fixture changes, and should go red under M4 (old view z1/pan0). Recheck which tests that sentence covers.

## Old GBA behaviour lost that no test or ruling covers

None of substance. Every delta I found is ruled: P12-4c/d/e/j/m(amended)/n/o/p/q/r/s/t/u/v, and P12-7 (rail hidden in context). There are two unruled deltas, both cosmetic or unreachable:
- The toggle-before-load no-op (M9).
- `hitTest` runs over `drawn`, not the viewport-culled `visible` (surface :432). This is equivalent for any pointer inside the canvas. Pointer capture routes off-canvas moves to the drag path, so hover is unaffected. The implementer's notes flagged it too.

## Mutation evidence

The conductor's matrix covers the plan's three required mutations: M1 (snapshot and keep inside the updater) turns 2 `placementResync` cases red, M2 (vertical layer dropped) turns the dive/emerge test red, and M3 (`drawnByDefault` true) turns 5 red. It also covers P12-4e/j/m/c. I did not re-run them (forbidden here). The causal chains are sound:
- M1 breaks the "snapshot at issue" ordering that `placementResync` pins.
- M5 (0.6) changes every amended-jump literal I re-derived.
- M7 removes the `!onEditHere` branch at surface :603.

Open question from the report: the 35 fixture-change rebases stay green under fit mutations. In my view this is acceptable under the rebase rule's own second option ("change the fixture world so the fit is the old view"). Their guarded logic is the original feature logic, which the fit mutations do not touch. The conductor should record this as a ruling rather than leave it open, and fix the vacuity class in I1, which is the real risk of that option.
