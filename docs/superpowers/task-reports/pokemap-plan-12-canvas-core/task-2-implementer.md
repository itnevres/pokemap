# Plan 12a Task 2: raster composite hook

- Tier: High, because URL load ordering and React effect invalidation govern canvas readiness.
- Execution: inline in the supplied scratch worktree, as this implementer brief explicitly prohibits sub-dispatch. No commits or pushes.

## Files touched

- `packages/ui/src/canvas/useRasterComposite.ts` (new)
- `packages/ui/test/canvas/useRasterComposite.test.tsx` (new)
- `docs/superpowers/task-reports/pokemap-plan-12-canvas-core/task-2-implementer.md` (this report)

## Plan steps

- Step 1: wrote tests before the hook. Added controlled load-callback coverage for unloaded, stale-URL, cached StrictMode and error paths; enabled-layer order, reorder, replacement, membership, enabled/deps changes; shared get/put and zero-enabled-layer paths; equal fresh inputs, view and unrelated renders; exact blit arguments and decoration ordering.
- Also covered Object.is NaN/signed-zero semantics, dependency boundaries/lengths, latest drawer/decoration closures, dimensions and individual viewport/view changes.
- Step 2: implemented URL-keyed readiness, cached-image detection, retained-handler URL guards, a reusable offscreen canvas, ordered raster layers, version bumps and stage blitting/decorations.
- Stable copied signatures include layer keys, enabled flags and dependency lengths/values; callback refs keep implementations current without identity invalidation.
- No family-specific behavior, new dependencies, existing test edits or moved/deleted comments. Both new code files contain only ASCII bytes and no BOM.

## Verification and limits

- `npx.cmd tsc -p packages/ui --noEmit`: PASS, exit 0 after implementation.
- `npm.cmd run typecheck`: PASS, exit 0 (root and UI).
- Before implementation the UI typecheck failed on the missing hook module; this is compile evidence only, not a runtime red test.
- Initial typechecks also caught unsupported Vitest matchers and unchecked indexed accesses; corrected within the new test file.
- `git diff --check`: PASS for tracked changes; new files are untracked and therefore absent from that check.
- `git diff --stat -- packages/ui/test`: empty because the new test is untracked. Explicit no-index numstat: 266 added / 0 removed lines for the new test.
- Full gate: NOT RUN; pass/fail/test-file counts unavailable. Vitest and UI build were not attempted, following the brief's sandbox restriction; coordinator must run them.
- Runtime red/green, the three requested mutations (remove URL guard, use layer identity, ignore key order), and live/runtime hook checks remain for the coordinator. No mutation or runtime pass is claimed.
- Runtime target: `npm test -- packages/ui/test/canvas/useRasterComposite.test.tsx --maxWorkers=4 --minWorkers=1`; then the full gate and UI build per plan.

## Deviations and open questions

- No contract deviations. Commit/gate steps deferred as explicitly required by this implementer brief.
- No open implementation questions or unrelated bugs identified. Release readiness awaits coordinator checks and independent reviews.

## Fix round 1

- Scope: only the same hook/test files and this appended report section; no commits, sub-dispatch or self-review.
- Important: URL, layer and decoration refs now publish in a layout effect. Semantic dependency snapshots compare against committed values and publish only in a layout effect; abandoned renders cannot alter event guards, callback refs or stable signatures.
- Added a real img/Suspense transition regression: B renders and suspends while A remains committed; a DOM load of A must composite using A's layer/decorator. Another regression cancels B and forces a committed A render, asserting no extra composite/blit from leaked signatures.
- Minor: documented stable ref objects, ignored callback identities, complete captured-input deps and object identity changes beside the public fields.
- Minor: base bitmap dimensions are assigned only on actual size changes; clearRect remains unconditional. Added setter-spy coverage for same-size recomposites and independent width/height changes.
- `npx.cmd tsc -p packages/ui --noEmit`: PASS, exit 0. `npm.cmd run typecheck`: PASS, exit 0 after the fix-round changes.
- Runtime regressions, mutations, full gate and UI build remain NOT RUN under the original sandbox instructions; no runtime red/green or existing-suite pass is claimed. Coordinator should run the same targeted command above before the full gate.
- No contract deviations or open questions. Existing tests remain unchanged apart from imports and the new fix-round helper/tests in this task's named test file.
