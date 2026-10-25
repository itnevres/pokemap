# Task 1 implementer: Pure view and cell math

- Base: `90dbf3506cd284927df84e74d3c865e69509c848`; initially clean tree.
- Tier: High, because the task requires independently hand-derived numeric fixtures.
- Routing: delegate skill read; direct Codex implementation per the user's implementer brief (no sub-dispatch).
- `codex-rules.md` was absent from this worktree; followed the rules pasted in the brief.

## Files touched

- `packages/ui/src/canvas/view.ts` (new)
- `packages/ui/src/canvas/cells.ts` (new)
- `packages/ui/src/components/mapView.ts`
- `packages/ui/test/canvas/view.test.ts` (new)
- `packages/ui/test/canvas/cells.test.ts` (new)
- `docs/superpowers/task-reports/pokemap-plan-12-canvas-core/task-1-implementer.md` (this report)

## Step 1: baseline and tests first

- Ran the existing Plan 11 `measure.py` against both original pairs.
- Map: 427 / 443 code lines, 167 aligned, 30 runs; matches the plan.
- World: 1113 / 799 code lines, 189 aligned, 42 runs; matches the plan.
- Added tests before implementation, with arithmetic comments beside expected values.
- View coverage: stepped 1 -> 2 -> 4 and back, fixed source pivot, fractional pivot rounding, legacy entry point, continuous fractional pan and both clamps, no-op identity including clamped limits, both projection round trips.
- Fit coverage: small/oversized maps, bands on every side, no band, rounded pan, both-zero and individual-zero viewport fallbacks, fallback with a band.
- Cells coverage: 16/32 px cells, pan/origin/zoom, negative flooring, near/far boundaries, outside returns null, raw overshoot, independently scaled CSS axes, fractional view and unscaled rect.
- Initial `npx.cmd tsc -p packages/ui --noEmit` failed only with TS2307 for the two not-yet-created modules. This is not a Vitest red-run claim.

## Step 2: implementation

- Added generic `View`, point projections, stepped/continuous policies, pivot zoom, and `fitView` delegating to `fitWithBand` with the existing independent zero-axis fallback.
- Added raw/bounded cell lookups and client DOMRect projection using existing sign-anchor scaling math.
- `mapView.ts` keeps all exports, signatures and rationale comments; its four-argument helper delegates with stepped `ZOOM_LEVELS`, and `MapView` extends shared `View<Zoom>`.
- No existing callers, tests or fixtures changed; no dependency added.
- `git diff --stat -- packages/ui/test` produced no output: both added test files are untracked; no tracked test changes. See the new test files in the file list above.
- Removed rationale comment lines: none. Original mapView comments remain at the compatibility entry point.

## Step 3: verification and limits

- PASS: `npx.cmd tsc -p packages/ui --noEmit` after implementation (exit 0).
- PASS: `git diff --check` (exit 0); Git printed its existing LF-to-CRLF working-copy warning.
- Plain `npx` was blocked by PowerShell script execution policy; used `npx.cmd` successfully.
- Not run per sandbox brief: Vitest (new and existing tests), full gate, UI build, and the five mutation checks (floor, bounded clamp, continuous rounding, pivot sign, dropped band). Coordinator verification remains required; no test/gate/file-count pass is claimed.
- No UI change or live app check. No commit, push, review dispatch, or extra report folder.
- Deviation: compatibility uses a delegation wrapper rather than a bare re-export to preserve the four-argument signature while the foundation takes a policy; explicitly allowed by the user brief.
- Open questions: none. Independent reviews and runtime/mutation evidence remain coordinator work.
