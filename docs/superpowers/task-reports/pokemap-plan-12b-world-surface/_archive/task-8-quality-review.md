# Plan 12b Task 8 quality review (High)

Reviewer: Claude Opus fallback (Codex hit its usage limit). Read-only review of worktree `wt-t8` against `a09fbcf`. I ran no vitest, npm, tsc or build, and I edited no file except this report.

## Verdict: Approved with fixes (no Critical or Important findings; five Minor fixes, two of them stale comments)

I read the code before the notes. The adapter, the hook, the wrapper and the colour move are sound. Every async path I traced keeps the old ownership rules, and every hand-derived literal I re-derived (about 30, listed below) is correct.

## What I checked and found sound

- **Wrapper identity.** `components/WorldCanvas.tsx:76` builds the adapter once (`useMemo(..., [])`). Props go straight to `WorldSurface` and never enter the adapter. A prop change therefore cannot rebuild the adapter. It cannot trigger a refetch, a refit, a tile-cache drop (`cacheKey: 0` is constant), a warp-effect re-run or a remount of the world hook. `useWorld: useGbaWorld` is a fixed function, so hook order is stable.
- **Ledger ownership.** `gba/worldSurface.tsx`:
  - `snapshot()` is taken when the GET is issued (line 76).
  - The keep set is computed on landing, before `setRaw` (lines 81-82). It uses the same `!serverShows || (absent && !dropAbsent)` rule as old lines 497-498.
  - The updater only reads `previous` and the captured set, so a StrictMode replay is safe. Mutation M1 covers this.
- **Generation pairing.**
  - `setLoadedGen(refetchGen)` runs only on success and uses that effect's own closure value.
  - The cleanup cancels a superseded GET, so an older GET can never publish a newer generation.
  - `WorldSurface.tsx:452-457` clears the pending toggle only when `loadedGen >= toggleReloadGeneration`. `toggleReloadGeneration` is assigned synchronously right after `reload()`, before React renders.
  - If the post-toggle GET fails, the switch keeps its optimistic value until a later GET succeeds. The old code did the same, so this is not a regression.
- **`move()`.**
  - It keeps every field and changes only x/y.
  - A map absent from the world is created with its singleton size and `component: -1`. That size comes from the same `components` the surface's `onDrop` checks, so the two guards agree.
  - A drop of an already-placed map keeps its metadata, which matches P12-4v(1).
  - Raw entries with `component: -1` keep 0x0 sizes. The `world` memo restores their size on every rebuild (the Ghost rebase pins this).
- **Removed `compositeVersion`.** Every old bump has a replacement trigger:
  - A GET landing and a drop both produce a new `world`, which is a dependency of the draw effect (`WorldSurface.tsx:304`).
  - An image load bumps `tiles.version`.
  - A tile-version change goes through `useWorldTiles`.
  - A resize changes `viewport`.

  No redraw path is lost.
- **Async errors.**
  - `postPlacement` and `postDungeons` reject when the response is not OK.
  - Warp failures go through `fetchGuarded` to the surface. The surface evicts the failed entry and retries only when the scope or view changes. Error renders sample a ref and do not trigger a retry, so there is no render loop (P12-4s; the new test bounds it at one request).
  - Encounter failures are counted by the surface.
- **`computeFit` wrapper.** The default is now `worldZoomRange(16)` = 1/128..16 px per tile, which follows P12-4j. Only tests call it.
- **Colour move.** `canvas/WorldSurface.tsx` now imports from `./worldColours.js`, so there is no import cycle left.
- **Canvas folder grep.** `rg -i 'gba|gbc|family' packages/ui/src/canvas` finds new hits only in comments.
- **Style.** All touched files are CRLF throughout, no added line is over 140 characters, and there is no `key={url}`.
- **Hand-derived literals I re-derived, all correct.**
  - New suite: P12-4e (z5 → 31%, B at 150,50,50,50); P12-4m (z10, pan -250,-100, box 50,0,100,100, 63%); P12-4n (pivot 20,10 → pan -20,-10, 38%); P12-4j (pan 4,-46, 192 px); both P12-4r LOD cases (2·1.2⁴ = 4.1472).
  - Rebased tests:
    - `canvas/WorldSurface.test.tsx`: hidden-map clamp at 16 → 60,10,80,80; wheel 40,-10,120,120; D at 175/3, 25/3, 250/3.
    - `worldView.test.ts`: -140 / -594.
    - `WorldCanvasContext`: fit 100/23 with pan y 650/23; snap pan 55,-5 and 53,-5; -250.52 rounds to -251.
    - `AppContextEdit` and `AppContextStroke`: 275..291 / 70..86; 351 and 175 at z16.
    - `App.test`: 21% and 60%.
    - `AppWorldContextMenu`: 63%, Route1 at 205..305.
    - `GbcAppContext`: 400x200 viewport, z20, pan 100.
    - `GbcWorldCanvasSurface`: 20,20,160,160.
- **Test robustness.**
  - The new suite uses deferred world and warp responses, a bounded `settle()` of 12 passes, no `waitFor` probes and no DOM mutation.
  - `stubViewport(400, 200)` in `GbcAppContext` is undone by the file's `afterEach` `restoreViewport()` and reset by `beforeEach`.
  - The `AppWorldContextMenu` `waitFor` only reads the DOM.
  - The scale-before-clamp ordering is still guarded with an explicit `fraction` 0.6 at `GbcWorldCanvas.test.tsx:395`.

## Critical

None.

## Important

None.

## Minor

1. **Stale "60%" comment** at `packages/ui/src/canvas/WorldSurface.tsx:202`: "the 60% fit waits for a measured viewport". Since the P12-4m amendment the jump fills 100%. A reader tuning the jump would be pointed at the wrong fraction. Change it to "the jump fit".

2. **Stale header and misplaced rationale in the moved `canvas/worldColours.ts`.**
   - Lines 1-4 still say `GbcWorldCanvas` draws its own conflict badges and explain why `drawTriangle` is not exported. Both are false now: `WorldSurface` draws the badges, and `drawTriangle` is private to `gba/worldSurface.tsx`.
   - Lines 38-84 are the JSDoc and rationale for `levelColorMap`, but they sit above the short `themedLevelColorMap` wrapper. Editors therefore show the percentile JSDoc on the wrong function.
   - That block also refers to things that no longer exist in this file: "lensOverlayEntries below", "coverageData", "I8 ... Plan 1" and "the draw effect drawers".

   Fix: move the block directly above `levelColorMap` (line 98), and trim the references to the old component.

3. **Two unused compat re-exports** at `packages/ui/src/components/WorldCanvas.tsx:7`. Nothing imports `drawDiamond` or `themedLevelColorMap` from the wrapper. The only consumers are tests, which use `levelColorMap` and `computeFit`. Unless the plan's M-d requires the full set, re-export only `levelColorMap`. If it does, add a one-line note saying the re-exports are for compatibility.

4. **The `GbcApp.test.tsx` fixture now relies on hit order** (diff at about lines 760-771). OlivinePort moved from x11 to x9, so it overlaps OlivineCity on [9,10).
   - After City's z10 jump, City covers screen [0,100) and Port covers [90,190). The click at (95,50) at line 800 hits both maps and selects Port only because the last placement is topmost.
   - If the hit order changes, this test fails for a reason unrelated to "entering World centres on the selection".
   - Fix: use the same approach as `GbcAppContext`, a wider viewport with abutting maps, instead of overlapping the fixture.

5. **Stale evidence bookkeeping.**
   - After the amendment, the new `P12-4m` test (`WorldCanvasSurface.test.tsx:236`) asserts GBA's old 100% jump, so it would pass on the old source. The report's "13/13 red on the old source" is now 12/13. The P12-4m case is guarded only by mutation M5, which turns it red.
   - `task-8-impl-notes.md` still describes that test as a 60% fill with a 70,20,60,60 box at 38%.
   - Fix: correct both lines in the report so the archive does not mislead a later reviewer.

## Notes (no change required)

- **The 35 P12-4e fixture rebases** that stay green under M4, M8 and M9. Their fixtures only neutralise the fit (anchors or enlarged maps that make the fit z1, pan 0). I checked that no rebased fixture makes an assertion trivially true. The empty-space probes are still empty (for example (20,90), (95,5) and (50,50) in `MENU_WORLD`, and (90,90) in `TWO`). Crossing versus enclosure in the marquee is still discriminated (B is now [20,100)). Culling still separates 3 images from 12.
  - These tests guard feature logic, not the fit, so a fit mutation is the wrong probe.
  - The rebase rule's "red by a mutation of the logic it guards" is met in substance if each test's original feature mutation still applies. There is no reported run showing that.
  - A cheap way to close it is two or three sampled feature mutations, for example marquee `contains` → `intersects`, culling disabled, and the badge offset. Treat this as optional; it is the spec reviewer's call.
- **Two small costs in `useGbaWorld`, both cheap.**
  - The `world` memo at `gba/worldSurface.tsx:112-121` copies every placement on each drag frame, on top of the copy in `move()`. That is two allocations of about 1,209 entries per frame where the old code made one. This matches what GBC already does.
  - `useGbaSurfaceCoverage` returns a new `[]` on each render until coverage arrives, which recomputes one memo over an empty list.
- **`drawExtraLayers` ignores `inScope`** (`gba/worldSurface.tsx:216-227`). In dungeon mode, a vertical-link source outside the filter, or a hidden indoor map, still gets a triangle over blank space. Conflict badges are now filtered by scope under P12-4v(3). The old layer drew these triangles too, and the spec's "keep each family's behaviour" covers it. If the user wants the two consistent, it is a one-line `if (!inScope(link.from)) continue;`. That would be a new behaviour difference and needs the user first.
- **`ctx.canvas?.width ?? Infinity`** (`gba/worldSurface.tsx:214-215`) is optional chaining that exists only because older mock contexts have no `canvas`. It is harmless.
- **Explicit `toolbarExtras: undefined` and `toolbarAfterEncounter: undefined`** (`gba/worldSurface.tsx:276-277`) are noise. The comment above them carries the information.
