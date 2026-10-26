# Task 2 report — world view, fit and projection math (`canvas/worldView.ts`) (High)

Conductor 5, 2026-10-26. Base `0fc8920` (Task 1 `294ab6c`).

## Files
- New `packages/ui/src/canvas/worldView.ts`: constants (`WHEEL_FACTOR` 1.2, `LOD_SCALE` 0.25, `JUMP_FILL_FRACTION` 0.6, `WARP_HIT_RADIUS` 8, `WORLD_SCALE_MIN/MAX` 1/2048..1); `worldZoomRange(nativePx)`, `worldZoomBounds(nativePx, current, maxWorldZoom)` (GBC `zoomBoundsFor` rule, P12-4j); `zoomWorldAboutPivot<V extends View>` (continuous `view.ts` `zoomAboutPivot`, extra fields kept, identity on no change); `boundsOf`, `fitClusters`, `fitFilter` (P12-4m, GBA `fitWorld` rules), `computeFit` (bounds required), `centredFit`, `jumpFit` (scale before clamp), `singletonSizes`; `smallTilesAt` (pure LOD predicate; renamed from `useSmallTiles` per reviews); `worldToScreen`/`screenToWorld` (aliases of `view.ts` `sourceToScreen`/`screenToSource`), `rectOf`, `warpPoint(placement, warp, warpOffset, view)`, `warpHit` (≤ 8 px), `hitPlacement` (topmost = last, half-open). No family branch.
- New `packages/ui/test/canvas/worldView.test.ts`: 26 tests, every fixture derived by hand in comments (Step 1 list covered; plus `boundsOf` orphan sizing, manual/shelved exclusion, `centredFit`, `singletonSizes`, a one-shot iterator case).
- `components/WorldCanvas.tsx`: `computeFit` is now GBA's default-bounds wrapper (`MIN_ZOOM`/`MAX_ZOOM` = 1/64..16, unchanged until Task 8's P12-4j) over the shared one; no re-export of `centredFit`/`singletonSizes` (no consumer; quality M3). `fitWorld`, `worldBoundsOf`, `hitTest` untouched (callers move in Task 8).
- `gbc/GbcWorldCanvas.tsx`: imports `computeFit`/`singletonSizes`/`jumpFit`/`zoomWorldAboutPivot` from `canvas/worldView.ts`; its exported `zoomWorldAboutPivot` and `jumpFit` are compatibility wrappers with GBC default bounds (tests import them). `initialFitBounds`/`fitAllBounds` untouched (become `fitClusters`/`boundsOf` in Task 7).
- Out of scope, per plan: `drawDiamond`, `themedLevelColorMap` (Task 8).

## Tests changed
`git diff --stat -- packages/ui/test`: empty (no existing test changed). New file only.

## Removed comment lines (34) and where they went
- WorldCanvas `computeFit` "Pure so a test can predict…" opener → replaced by the wrapper's first line; the `zoomBounds` paragraph stays on the wrapper. `centredFit` and `singletonSizes` one-line docs → same docs in `worldView.ts`.
- GBC `zoomWorldAboutPivot` 12-line doc → `worldView.ts` doc (identity, extra fields survive) + 2-line wrapper doc; StrictMode single-updater reasoning stays in the GBC header bullet.
- GBC `jumpFit` 16-line doc (scale-before-clamp fix round, the 20x18 / 0.52 fill measurement) → condensed into `worldView.ts` `jumpFit` doc; wrapper keeps a 2-line pointer.
- `fitWorld` rationale (singletons, Safari Zone shelf) is NOT removed (code stays until Task 8); a condensed copy is on `fitClusters`/`fitFilter`.

## Mutations (each restored; `worldView.test.ts`)
| Mutation | Result |
|---|---|
| singleton not excluded (`> 1` → `> 0`) | 1 fail |
| fallback dropped | 2 fail |
| `fitFilter` ignores the anchored rule | 1 fail |
| wrapper drops `fitted` | 2 fail |
| jump 60% → 100% | 2 fail |
| LOD `<` → `<=` | 1 fail |
| warp offset halved | 1 fail |
| radius 6 | 2 fail |
| cap clamps below current zoom | 1 fail |
| cap ignores `maxWorldZoom` | 1 fail (unit test; the GBA in-context 19.2 test lands in Task 8) |
| `fitClusters` re-reads a spent iterator | 1 fail |

## Delegation log
- Codex at usage limit until 5:29 PM → Aider Nemotron 3 Ultra (free) wrote `worldView.ts` against the conductor's test file: 24/24 first run. Conductor fixes: `fitClusters` iterated a one-shot `Iterable` twice (would break on `Map.values()`; test added), condensed moved rationale comments, `rectOf` size type (typecheck).
- Tests (oracle with hand-derived fixtures) and the two canvases' import rewiring (~30 lines): Anthropic direct — design decision (the module's API) and tiny edits.

## Reviews (Codex at limit → Claude Opus `high-risk-reviewer`, logged)
- Spec: Approved with fixes, 0 I / 4 M (`task-2-spec-review.md`); every fixture re-derived by hand, all correct. M1 rename → `smallTilesAt`; M2 stale GBA wrapper doc trimmed; M3 `jumpFit` degenerate test added; M4 GBC imports the shared `JUMP_FILL_FRACTION` (local constant and its comment removed; rationale on the shared constant).
- Quality: Approved, 0 I / 8 M (`task-2-quality-review.md`). M1/M2 docs fixed; M3 dead re-exports removed; M4 rename; M5 `hitPlacement` left/right edge asserts added; M6 `boundsOf` 0x5 entry added (both survivor mutations, `>` for `>=` and `&&` for `||`, now fail 1 test each); M7 restating docs trimmed, `WorldRect = Bounds` (core), GBC local `FitResult` removed; signatures left multi-line (no functional cost); `boundsOf` name kept (worldView-scoped, Task 7 adapter warned here). M8 (GBC first-fit deltas under P12-4m) recorded in the plan's Task 7 Step 2.

## Gate
- Focused: `worldView`, `WorldCanvas`, `GbcWorldCanvas`, both `*Context*` suites: 6 files / 326 pass. Typecheck pass.
- Full, before review fixes: 3,662 pass / 0 fail / 227 files; UI build pass; subjects unchanged.
- Full, after review fixes: Gate at working tree on 0fc8920: 3,663 pass / 0 fail / 227 files; typecheck pass, UI build pass; subjects unchanged.
