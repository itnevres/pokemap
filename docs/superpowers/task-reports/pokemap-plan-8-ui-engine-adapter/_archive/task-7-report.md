# Task 7 report

Status: DONE_WITH_CONCERNS.

Files changed:

- `packages/ui/src/shared/useBeforeUnloadGuard.ts`: shared dirty-only `beforeunload` guard.
- `packages/ui/src/shared/useStrokeChain.ts`: `SettledChain` and stable shared stroke-chain registry.
- `packages/ui/src/App.tsx` and `packages/ui/src/gbc/GbcApp.tsx`: consume both shared hooks.
- `packages/ui/src/components/MapCanvas.tsx` and `packages/ui/src/gbc/GbcMapCanvas.tsx`: use `SettledChain` for the callback prop.
- `packages/ui/src/hooks/useMapEditing.ts`: uses the existing visit reset, and no longer exposes `resetForMapChange`.
- `packages/ui/src/shared/useEditSessionCore.ts`: preserves a new map record when an older discard resolves.
- Tests: new guard/registry suites; the permitted R3 edits; the required new core discard witness.

RED evidence: Root `npx.cmd vitest run ...` was attempted first and saved to `task-7-red.log`, but sandbox config loading failed before collection (`Cannot read directory ... Access is denied`). The permitted Node API fallback is appended to that log and separately saved as `task-7-red-api.log`: `useBeforeUnloadGuard` failed to resolve, all four registry cases failed because `useStrokeChainRegistry is not a function`, and `useEditSessionCore`'s new discard-switch witness failed at line 67 (`expected { n: 1 } to deeply equal { n: 9 }`). These are the required RED cases 1, 2, and 4.

GREEN evidence: the root Node-API fallback over the focused brief filters passed 20 files / 170 tests / 0 failures (`task-7-green.log`). This includes the new guard and registry suites, the new core witness, all listed App/GBC shell oracle suites, and the R3 map-editing test. The fallback was required because configured Vitest cannot load in this sandbox.

Gate results:

- `npm.cmd test`: configured gate attempted once; startup failure before test collection due the same sandbox config/ancestor-directory access error (`task-7-gate.log`), so no configured file/test counts exist.
- `npm.cmd run typecheck`: exit 0 (`task-7-typecheck.log`).
- `npm.cmd run build -w @pokemap/ui`: exit 0 (`task-7-build.log`).
- Oracle (`git diff HEAD -- ':(glob)packages/*/test/**' | Select-String '^-[^-]'`): the five removals in `task-7-oracle.log` are exactly the R3-authorised AppContextVisit comment, two `resetForMapChange` mock fields, and the old reset test title/call. No other existing-test removal appears. `git diff --check` reported no whitespace errors (only line-ending/config-ignore warnings).

No implementation-ruling deviations. The Plan Step 3 live smoke and coordinator mutations remain coordinator-owned. The sole concern is that the configured full suite could not start in the sandbox; focused fallback coverage, typecheck, and UI build are green.

## Final-review fix

The required root CLI command (`npx.cmd vitest run packages/ui/test/gbc/GbcAppWorldGuard.test.tsx packages/ui/test/gbc/GbcAppEditing.test.tsx packages/ui/test/shared/useEditSessionCore.test.tsx`) was attempted first but could not load `vitest.config.ts` because the sandbox denies ancestor-directory access. The permitted Node API fallback over the same three files passed 3 files / 28 tests / 0 failures. `npm.cmd run typecheck` exited 0. The three ordering witnesses now wait for `GET /api/map/OlivinePort` before comparing indexes, and the core's seed-window limitation is documented without behaviour change.
