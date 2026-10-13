# Task 6 report

Status: DONE_WITH_CONCERNS.

Changed files:
- `packages/ui/src/shared/useVisit.ts`: shared render-phase visit reset and committed-visit guard.
- `packages/ui/src/shared/EditingWorkspace.tsx`: active chrome/body/canvas shell used by both families.
- `packages/ui/src/components/MapEditingWorkspace.tsx`: GBA chrome supplied as shared shell slots.
- `packages/ui/src/gbc/GbcMapEditing.tsx`: GBC visit identity and shell supplied by the shared modules; its canvas-prop `onStrokeChain` spread remains unchanged.
- `packages/ui/src/hooks/useMapEditing.ts` and `App.tsx`: GBA now receives `selected` as its visit key, retires per-visit selection/stamp/error state, and ignores stale deferred event handlers.
- New tests: `shared/useVisit.test.tsx`, `shared/EditingWorkspace.test.tsx`, and `AppVisitGuard.test.tsx`.

RED evidence: the required root CLI invocation was attempted first and saved to `task-6-red.log`, but the sandbox blocked Vitest config loading (`Cannot read directory ... Access is denied`). The permitted Node API fallback also saved there: both new shared suites failed collection because `useVisit` and `EditingWorkspace` did not exist; the App witnesses initially failed at `MapTree.tsx:41` because this fallback does not load the normal test setup that supplies `scrollIntoView`. The latter was corrected in the new test harness before production code was written.

GREEN evidence: Node API fallback with the three new files passed 3 files / 9 tests (shared visit: 3, shared workspace: 3, GBA visit guards: 3). `npm.cmd run typecheck` exited 0. `npm.cmd run build -w @pokemap/ui` exited 0.

Gate results: `npm.cmd test` was run once and output is in `task-6-gate.log`; it could not load `vitest.config.ts` due the sandbox's ancestor-directory access denial, so no suite counts were produced. A wider Node API run cannot reproduce the repository's config setup/automatic DOM cleanup and therefore reported unrelated accumulated-DOM failures in existing suites; it is not treated as a regression. The PowerShell equivalent of the required oracle produced no removed existing-test lines, and no `packages/server`, `packages/core`, or `packages/cli` paths were changed.

Deviation: R1 is applied through `useVisit` in the hooks (rather than component-local state) as required. R2 uses the specified node-shaped `top`/`side`/`canvasProps` slots. The spec's additional World-context regression pin and coordinator teeth mutations were not completed before the interruption; this is the reason for `DONE_WITH_CONCERNS`.

## Fix round 1

Restored the original GBA workspace comments and multiline JSX, the GBC rail comment, and R2/R3 documentation on the shared modules. `onSelectEvent` is again an unguarded synchronous handler; deferred callbacks remain guarded. The GBA stale-response witnesses now flush after resolving their deferred response and assert negatives synchronously, including no X/Y form on stale add success.

The requested Node-API focused run is recorded in `task-6-fix-1.log`: 5 files / 18 tests passed, while one existing `MapEditingWorkspace.test.tsx` test failed only because the sandbox fallback omits the repository's configured automatic DOM cleanup and accumulated prior test DOM nodes. `npm.cmd run typecheck` and `npm.cmd run build -w @pokemap/ui` both exited 0 (their outputs are `task-6-fix-1-typecheck.log` and `task-6-fix-1-build.log`).

The World-context A -> B -> A pin was not added: its required fixture/harness extraction could not be completed inside this fix round. This task remains `DONE_WITH_CONCERNS` for that missing requested witness and the sandbox-configured test limitation.
