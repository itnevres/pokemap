# Task 2 report: shared world context (useWorldContext + WorldContextOverlay), M9 + M6

Status: DONE.

## Implemented
- `packages/ui/src/shared/useWorldContext.ts`: R1 interface verbatim. Snap effect (deps are primitives, R5), capture-phase Escape (shared checks in the hook, family `isBlocked()` through a ref, R2), contextView, onContextViewChange, setContextZoom, `stepZoom` (R4, nearest-level semantics, no-op while contextView is null), overlayRef, onOverlayDoubleClick, `maxWorldZoom`. Comments moved here once (R11).
- `packages/ui/src/shared/WorldContextOverlay.tsx`: module-level component, markup/class names/ARIA identical to before; props `{ map, ctx, renderCanvas, onDone }`.
- `gbc/GbcWorldCanvas.tsx`: consumes the hook; wheel `zoomBoundsFor` uses `maxWorldZoom(GBC_MAX_ZOOM)` (R3), `GBC_CONTEXT_MAX_ZOOM` removed, `+ = - _` handler calls `stepZoom` (still consumes the key while contextView is null), Fit all untouched. `setView` keeps `fitted` (R7).
- `components/WorldCanvas.tsx`: consumes the hook; wheel bound untouched (R3); `setView` = `setZoom` then `setPan` (R7); placement null for zero size (R6). Overlay rendered at the same JSX position, `{context && <WorldContextOverlay .../>}` (R8); no key or sibling changed.
- Tests: `test/shared/useWorldContext.test.tsx` (18), `test/gbc/GbcWorldCanvasContextZoom.test.tsx` (2, harness copied from GbcWorldCanvasContext.test.tsx).

## Commits
- de33885 tests + hook + overlay (witness red at this point)
- 88340ad GbcWorldCanvas consumes the hook (M6 fixed)
- (GBA consume commit) WorldCanvas consumes the hook
- this report + gate logs

## TDD
RED (`task-2-red.log`; hook file temporarily moved away, GBC canvas still pre-change):
`npx vitest run packages/ui/test/shared/useWorldContext.test.tsx packages/ui/test/gbc/GbcWorldCanvasContextZoom.test.tsx`
- useWorldContext.test.tsx: `Failed to resolve import "../../src/shared/useWorldContext.js"` (expected, hook absent).
- GbcWorldCanvasContextZoom: both tests fail. `+ steps up to 4x`: expected 'true' (4x aria-pressed) received 'false' (pre-change `indexOf` -1 gives 1x); `- steps down to 2x`: same failure shape (clamps to 1x).
GREEN: hook file restored: useWorldContext 18/18. After GBC consuming: `npx vitest run packages/ui/test/gbc` 24 files / 506 tests pass (incl. witness 2/2). After GBA consuming: the 7-file focused set + shared dir: 8 files / 152 tests pass.

## Gate
- `npm test` (task-2-gate.log): 156 files, 2644 tests, all passed, no flake hit.
- `npm run typecheck`: exit 0 (task-2-typecheck.log). `npm run build -w @pokemap/ui`: exit 0 (task-2-build.log).
- Oracle `git diff dc33490 -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'`: prints nothing.

## Self-review
- R1-R11 checked against the diff. The overlay is module-level, same JSX slot (R8). GBA wheel bound untouched (R3). Context comments moved into the hook; each canvas keeps one pointer line (R11). No dead code left in the canvases (removed ZOOM_LEVELS/zoomAboutPivot/contextView.js imports and `GBC_CONTEXT_MAX_ZOOM`; GBA no longer destructures unused `inContext`/`contextView`).
- One deliberate deviation from the spec text: the hook reads `world.zoom` directly in the snap effect (as before; the effect's deps are the R5 primitives with the existing eslint-disable) instead of via a ref.
- Hook test file doubles as StrictMode check (single snap). It dispatches Escape on `document.body` (bubbles) so a `document` bubble listener can remove the modal after the capture-phase judgement.

## Concerns
- `docs/.../ledger.md` shows as modified in this worktree (not mine; left uncommitted).
- Log files are gitignored; committed with `-f`.
