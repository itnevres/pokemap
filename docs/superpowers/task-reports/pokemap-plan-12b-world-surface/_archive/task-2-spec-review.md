# Task 2 spec-compliance review: `canvas/worldView.ts` (High, hand-derived numeric fixtures)

Reviewer: Claude Opus subagent (high-risk-reviewer, spec pass). Scope: uncommitted working tree vs HEAD `0fc8920`: new `packages/ui/src/canvas/worldView.ts`, new `packages/ui/test/canvas/worldView.test.ts`, modified `components/WorldCanvas.tsx` and `gbc/GbcWorldCanvas.tsx`. Vitest not run (per brief). `npm run typecheck`: pass.

## Verdict: Approved with fixes (0 Critical, 0 Important, 4 Minor)

Every Task 2 content item exists with the ruled semantics. All numeric fixtures re-derived by hand and correct. No existing test changed. GBA `computeFit` default bounds are still 1/64..16. No family branch in `canvas/worldView.ts`.

## Content items vs plan and rulings

| Item | Where | Result |
|---|---|---|
| Zoom range as scale 1/2048..1 per native unit (P12-4j) | `worldView.ts` `WORLD_SCALE_MIN/MAX`, `worldZoomRange` | OK. 16 gives 1/128..16, 32 gives 1/64..32 (GBC's current bounds kept exactly). |
| Cap = max(maxWorldZoom(native*scaleMax), current) | `worldZoomBounds` | OK. Same as GBC `zoomBoundsFor` (`GbcWorldCanvas.tsx:903`) with `maxWorldZoom` from `useWorldContext.ts:160`. Not yet wired into GBA (Task 8, correctly). |
| Continuous zoom about pivot | `zoomWorldAboutPivot` over `view.ts` `zoomAboutPivot` continuous | OK. Clamps first, then identity check, keeps fractional pan, `{ ...view, ...r }` keeps `fitted`. Same arithmetic as the removed GBC body. |
| GBC wrapper stays (not an alias) | `GbcWorldCanvas.tsx:183-191` | OK. Default `GBC_ZOOM_BOUNDS`. Existing `GbcWorldCanvas.test.tsx:242-279` (exact numbers, identity, `fitted`) still import it. |
| `fitClusters` (GBA `fitWorld` else branch, fallback, null) | `worldView.ts` `fitClusters` | OK. `componentOf` is the same as `componentOfPlacement` (`WorldCanvas.tsx:229`). Clusters are components with `maps.length > 1`, falling back to all, `null` when empty. GBA's empty case (width 0, then early return) and the new `null` are both a no-op. It now reads the iterable once (one-shot iterator test). |
| `fitFilter` anchored rule | `fitFilter` | OK. Same as `WorldCanvas.tsx:671-675`: anchored = component resolves (not the cluster test), falling back to scoped. |
| `computeFit` needs bounds; GBA default in wrapper | `worldView.ts computeFit`; `WorldCanvas.tsx:274-279` | OK. The default param `{ MIN_ZOOM, MAX_ZOOM }` = 1/64..16 (`WorldCanvas.tsx:45-46`). An explicit `undefined` still takes the default. GBC calls the shared one, and typecheck shows every GBC call passes bounds. |
| `jumpFit` 60%, scale before clamp | `jumpFit` | OK, the same as the removed GBC body. |
| LOD `zoom < native * 0.25` | `useSmallTiles` | OK (see Minor 1 on the name). |
| Projection | `worldToScreen`/`screenToWorld` (aliases), `rectOf`, `warpPoint(placement, warp, warpOffset, view)` | OK. Offset 1/2 reproduces `projectGbcWarpPoint` (`GbcWorldCanvas.tsx:152`). |
| `warpHit` radius 8, first match | `warpHit` | OK, `hypot <= 8`, the same as GBA's `find` (`WorldCanvas.tsx:1583`). |
| Topmost hit, half-open | `hitPlacement` | OK, the same as both `hitTest`s (`WorldCanvas.tsx:1430`, `GbcWorldCanvas.tsx:921`). |
| Only math helpers move; `drawDiamond`/`themedLevelColorMap` stay | `GbcWorldCanvas.tsx:5-6` | OK. |

## Fixture re-derivation (`worldView.test.ts`)

All correct. Exact `toEqual` floats checked:
- :26-27: 16/2048 and 32/2048 are exact powers of two.
- :32-37: max(16,4)=16; max(16,48)=48; max(64,16)=64; max(128,8)=128; max(128,200)=200.
- :48: the source point (50,100), zoom 3, pan (110-150, 220-300) = (-40,-80). :53-57: (-1.4,-0.6) with closeTo. :62: round trip. :70/:72: clamp to 32 and 1/64 gives the same object.
- :81: (0,0)-(36,44); Z skipped as 0x0. :90/:97: (0,0,20,10); M (component -1) and H (index 7 >= 1) excluded. :103/:110: x -50..104 and y 0..104 give (-50,0,154,104).
- :122: Town only (Floor index 5 >= 2). :128: (20000,0,15,5); "Missing" gives null.
- :135: zoom min(4,6)=4, pan (0,50); the x pan is -0+0 = +0, so `toEqual` with `Object.is` holds. :137: 30 clamped to 16, pan (120,70). :139: (-20,10). :140-141: degenerate cases give zoom 1, pan 0.
- :146: (50,-30).
- :154-156: raw min(50, 37.1111) x 0.6 = 22.26667; pan x = 500-20z = 54.66667, y = 334-29z = -311.73333 (within 5e-4). :158: 0.5 x 0.6 is the double 0.3, 2000x0.3 rounds to 600 and 1000x0.3 to 300, so pan (200,100) is exact. :160: 334 x 0.6 = 200.4, clamped to 32, pan (468,302).
- :176-179: 3.99/4 and 7.99/8 on either side.
- :188-189: (25,37) and back to (10,20). :197-198: (25,37,8,6) and (25,37,12,10). :203-204: (37,45) and (31,41).
- :209-214: 7.9 and 8 hit, 8.1 misses; the diagonals 5.6√2 = 7.92 hits and 5.7√2 = 8.06 misses.
- :220-228: the overlap returns the later entry; (10,10) misses a's half-open edge and hits b; (15,15) is null; the orphan only hits with `sizeOf`.

## Mutation evidence (checked analytically, since vitest was not allowed)

Every mutation in the report fails a named assertion:
- `>1` to `>0`: :90.
- Fallback dropped: :103 and :110.
- `fitFilter` uses `scoped`: :122.
- `fitted` dropped: :48 and :57.
- 0.6 to 1: :154 and :158.
- `<` to `<=`: :177.
- Offset halved: :203.
- Radius 6: :209 and :213.
- Cap uses `Math.min`, or drops the `current` term: :33 and :37.
- Cap ignores `maxWorldZoom`: :35-37.

The GBC-wrapper mutations (drop `fitted`, break identity) are guarded by the existing `GbcWorldCanvas.test.tsx:260` and `:277-279`.

## Step 1 coverage

Every item on Step 1's list has a test. The only gap is the degenerate-input early return of `jumpFit`, which has no test here or in `GbcWorldCanvas.test.tsx` (Minor 3).

## Other checks

- `git diff --stat HEAD -- packages/ui/test` is empty. The only new file is `worldView.test.ts`. The importers `WorldCanvas.test.tsx:4` and `GbcWorldCanvas.test.tsx:229` (`computeFit` from `components/WorldCanvas.js`) still resolve through the wrapper.
- No family branch. The `gba|gbc` grep hits only comments (`worldView.ts:128`, `:201`, `:266`), and other `canvas/` files already do the same (MapSurface, mapSurfaceAdapter, view, events).
- Removed comments: 34 lines in the diff, matching the report. The mapping is accurate, with one stale leftover (Minor 2).

## Findings

**Minor 1: `useSmallTiles` is a pure predicate with a hook name.** `worldView.ts` `useSmallTiles`, test :176. The `use` prefix tells React tooling and readers that it is a hook. Task 5 will call it inside the draw loop or a `useCallback`. If eslint-plugin-react-hooks is ever added (there is no lint script today), that call is a rules-of-hooks error, and a reader may avoid calling it conditionally. Fix: rename it to `smallTilesAt` or `usesSmallTiles` before Task 5 consumes it. Its own doc already admits the problem ("Not a React hook despite the name").

**Minor 2: stale wrapper doc at `WorldCanvas.tsx:265-273`.** The comment still says "GBC's world canvas passes `{ min: 1/64, max: 32 }`" to this function. GBC now imports the shared `computeFit` from `canvas/worldView.ts` (`GbcWorldCanvas.tsx:6`) and never calls the GBA wrapper. Fix: drop or reword the GBC sentence. The px-per-block versus px-per-tile rationale belongs at GBC's `GBC_ZOOM_BOUNDS` (`GbcWorldCanvas.tsx:122-126`, where it already is).

**Minor 3: `jumpFit` degenerate early return is untested.** `worldView.ts` `jumpFit`, first `if`. If the guard is deleted, a zero-height map gives `Infinity * 0.6`, which clamps to max, and a NaN or Infinity pan, and no test fails. Fix: add one line mirroring `:140`, e.g. `jumpFit({x:0,y:0,width:0,height:5},{w:400,h:300},gbc)` toEqual `{zoom:1,pan:{x:0,y:0}}`.

**Minor 4: the conductor report is unfinished, and GBC duplicates the jump constant.**
- `task-2-report.md`, "Gate / Full: GATE" is a placeholder. The full gate result (pass / fail / file count, against the 3,634 / 226 baseline plus 25 new tests) must be recorded before commit.
- Separately, `GbcWorldCanvas.tsx:163` keeps a local `JUMP_FILL_FRACTION = 0.6` as the wrapper's default instead of importing the shared constant. The value matches, so this is harmless until Task 7 deletes the wrapper. Importing the shared one now avoids drift.
