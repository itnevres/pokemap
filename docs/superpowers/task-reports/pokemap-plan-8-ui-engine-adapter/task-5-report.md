Status: BLOCKED.

Implemented the shared edit-session core and both adapters. Stopped under the brief's existing-test failure rule when the full gate failed `GbcApp > the palette highlight resets when switching to a different map (spec review finding 9, mutation check X17)`: `expected null to be truthy`, at `packages/ui/test/gbc/GbcApp.test.tsx:550`. This is not one of the named flake exceptions. It was not rerun or diagnosed; its cause is unresolved. The already-running gate was allowed to finish. Existing tests were not edited.

Files changed:
- `packages/ui/src/shared/useEditSessionCore.ts`: new render-derived map/seed state, ordered request tickets, POST/error handling, discard and markClean.
- `packages/ui/src/hooks/useEditSession.ts`: memoized GBA seed and shared core; retains family reply merging, event flags, external updates, request bodies, exported interfaces and discard postmortem (references to removed internals updated).
- `packages/ui/src/gbc/hooks/useGbcEditSession.ts`: memoized GBC seed and shared core; retains shape validation, closed-session handling, routes, resolved values and exports.
- `packages/ui/test/shared/useEditSessionCore.test.tsx`: 13 core tests covering Tests 1(a)-(l).
- `packages/ui/test/useEditSessionShared.test.tsx`: five GBA witnesses covering all R3(a)-(e), including the seed-refetch witness required by R3(b).
- `packages/ui/test/gbc/useGbcEditSessionShared.test.tsx`: GBC discard/in-flight witness.
- This report and `task-5-{red,green,consumers,gate,typecheck,build,oracle-head,oracle-base,failures}.log`: evidence; reports/logs are ignored by Git in this checkout.

RED evidence: `npx.cmd vitest run` with the six brief-specified files failed to load configuration (sandbox access denied). The permitted `node --input-type=module` / Vitest Node API fallback produced 2 failed / 4 passed files, 5 failed / 32 passed tests. The core suite failed import resolution because the module did not exist. All 31 existing focused tests passed, as did the new GBC witness. The five GBA failures in `task-5-red.log`, with original assertion lines in `useEditSessionShared.test.tsx`, were:
- `keeps only the newer out-of-order paint reply`, line 34: `expect(last.blocks[0].metatileId).toBe(3)` received 2.
- `drops a moveEvent reply after switching maps`, line 44: `expect(last.map).toBe(mapB)` received map A.
- `drops a paint reply issued before a same-map seed refetch`, line 56: `expect(last.blocks).toBe(refreshed)` received tile 9 instead of 7.
- `does not resurrect an in-flight edit after discard`, line 68: `expect(last.blocks).toBe(seed)` received tile 9 instead of 1.
- `shows the new seed on the very first render after a map switch`, line 81: `expect(renders[0].blocks).toBe(nextSeed)` received tile 9 instead of 7. Host records the first render, so effect flushing cannot conceal the stale render.

GREEN evidence: the same Node API command/filter passed 6 files / 50 tests, zero failures (`task-5-green.log`). A second Node API run of all other hook-importing test files, plus App.test.tsx, passed 9 files / 206 tests, zero failures (`task-5-consumers.log`).

Final gate:
- `npm.cmd test`: exit 1, config-load access failure; one full Node API fallback run: exit 1, 154 passed / 11 failed files; 2,591 passed / 45 failed / 50 skipped tests. No simultaneous full suites. Full failures and stacks are in `task-5-gate.log`; `task-5-failures.log` names every failure header, including suite/hook failures and duplicate contexts.
- Failures include external-fixture EPERM writes, inaccessible external Git checks, spawned CLI `uv_os_get_passwd` ENOMEM errors, four CLI tests incompatible with the thread pool (`process.chdir()`), and the unresolved GbcApp palette assertion above. These results are not a clean gate and are not all claimed to be pre-existing.
- `npm.cmd run typecheck`: initially exit 2 for four unchecked array accesses in the new GBA test only. Added non-null assertions without changing runtime behavior; the corrective rerun exited 0. Both outputs are retained in `task-5-typecheck.log`.
- `npm.cmd run build -w @pokemap/ui`: exit 0 (`task-5-build.log`).
- Oracle: both `git diff HEAD -- ':(glob)packages/*/test/**'` and `git diff d37959e -- ':(glob)packages/*/test/**'`, filtered with PowerShell `Select-String '^-[^-]'`, printed nothing. Both oracle logs are empty. `git diff --check` found no whitespace errors (Git emitted an LF/CRLF advisory).

Deviations/remaining work: no intended deviations from R1-R7. Used `.cmd` launchers and the explicitly permitted Node API fallback; repeated typecheck once to verify the new-test type corrections. The fifth GBA witness implements R3(b), which is required in the rulings although omitted from the four-item Tests 2 list. Per the stop condition, no further source changes, diagnosis, tests, or live checks were undertaken after identifying the unlisted existing-test failure. The coordinator-owned teeth checks and commit were not performed; no state-changing Git command was run. The live paint/undo/redo/save/reverse-edit comparison remains unverified.

Reproducible Node API command (piped to `node --input-type=module` from repository root; output redirected to the relevant log):

```js
import { startVitest } from 'vitest/node';
const ctx = await startVitest('test', FILTERS, {
  config: false, root: process.cwd(), run: true,
  pool: 'threads', maxWorkers: 2, minWorkers: 1,
  globals: false, environment: 'node',
  environmentMatchGlobs: [['packages/ui/**', 'jsdom']],
  include: ['packages/*/test/**/*.test.{ts,tsx}'],
  setupFiles: ['packages/ui/test/setup.ts'],
});
await ctx.close();
```

RED/GREEN FILTERS:
```js
['packages/ui/test/shared/useEditSessionCore.test.tsx',
 'packages/ui/test/useEditSessionShared.test.tsx',
 'packages/ui/test/gbc/useGbcEditSessionShared.test.tsx',
 'packages/ui/test/useEditSession.test.tsx',
 'packages/ui/test/useEditSessionGuard.test.tsx',
 'packages/ui/test/gbc/useGbcEditSession.test.tsx']
```
Consumer FILTERS:
```js
['packages/ui/test/MapCanvas.test.tsx',
 'packages/ui/test/MapCanvasStroke.test.tsx',
 'packages/ui/test/MapEditingWorkspace.test.tsx',
 'packages/ui/test/MapEditingWorkspaceActive.test.tsx',
 'packages/ui/test/gbc/GbcMapCanvasEdit.test.tsx',
 'packages/ui/test/gbc/GbcMapCanvasStroke.test.tsx',
 'packages/ui/test/gbc/GbcMapEditing.test.tsx',
 'packages/ui/test/useMapEditing.test.tsx',
 'packages/ui/test/App.test.tsx']
```
Full gate FILTERS: `[]`.
