Status: DONE_WITH_CONCERNS.

Base: `e1050b2cb43eabf8173f436a25fbf4c837aa8265`, branch `plan-8-ui-engine-adapter`.

Implemented Task 3's R1-R4 shared context controller and M5 stroke settlement. All existing test files remain unchanged. No dependency, core/server/CLI changes, state-changing git commands, or commits.

Files changed:
- `packages/ui/src/shared/useContextEditing.ts`: shared context entry/exit, selection-leaves effect, map-only commit version bump, and prompt-free leave. Exit waits for stroke settlement and decides from post-render session state. Duplicate exit requests coalesce; a mode switch retires the pending request even on reentry.
- `packages/ui/src/App.tsx`: consumes the controller, reuses one dirty guard, registers mounted chains, and delegates the SaveDialog commit. Existing dialog ownership remains unchanged.
- `packages/ui/src/gbc/GbcApp.tsx`: equivalent integration, retaining discard-before-switch, same-map clears, and reload/error handling.
- `packages/ui/src/components/MapCanvas.tsx`, `packages/ui/src/gbc/GbcMapCanvas.tsx`: optional `onStrokeChain` registration effect and cleanup.
- `packages/ui/src/components/MapEditingWorkspace.tsx`, `packages/ui/src/gbc/GbcMapEditing.tsx`: pass the registration callback through canvasProps; omit its key when no callback is supplied, preserving existing callers' prop shape. Task 6 must retain this in `buildCanvasProps`.
- New tests: `packages/ui/test/shared/useContextEditing.test.tsx` (10 hook cases), `packages/ui/test/AppContextStroke.test.tsx`, `packages/ui/test/gbc/GbcAppContextStroke.test.tsx` (one held-apply app witness each).
- Report/log artifacts: `task-3-report.md`, `task-3-red.log`, `task-3-red-api.log`, `task-3-reentry-red.log`, `task-3-green.log`, `task-3-gate.log`, `task-3-gate-api.log`, `task-3-ui-gate.log`, `task-3-typecheck.log`, `task-3-typecheck-final.log`, `task-3-build.log`, `task-3-oracle.log`.

RED evidence:
- Attempted root `npx.cmd vitest run packages/ui/test/shared/useContextEditing.test.tsx packages/ui/test/AppContextStroke.test.tsx packages/ui/test/gbc/GbcAppContextStroke.test.tsx`. Config loading failed before collection because esbuild cannot read an ancestor directory in this sandbox.
- Equivalent root Vitest API run bypassing config-file bundling: both family tests named `M5: Done waits for held paint/apply before deciding the dirty exit` failed as expected on pre-change code: `expected null not to be null` at `AppContextStroke.test.tsx:146` and `gbc/GbcAppContextStroke.test.tsx:150`, both `expect(contextOverlay()).not.toBeNull()`. Hook suite failed import resolution because the hook did not exist. Full output saved in `task-3-red.log`.
- Additional R2 reentry witness failed before the retirement fix: `a mode switch retires the held exit even if context is reentered before it settles`, `expect(a.openSave).not.toHaveBeenCalled()` at `useContextEditing.test.tsx:123`, actual one call; `task-3-reentry-red.log`.

GREEN evidence:
- Root Vitest API run of the six specified focused files plus `MapEditingWorkspace.test.tsx`: 7 files / 54 tests passed, exit 0 (`task-3-green.log`).
- Final root Vitest API run filtered to `packages/ui/test/`: 75 files / 1,276 tests passed, 0 failed, exit 0 (`task-3-ui-gate.log`). Existing clean-exit tests passed without edits; no R4 stop was triggered.

Gate results:
- `npm.cmd test` ran once, exit 1 before collection (sandbox esbuild config-load failure), `task-3-gate.log`.
- Equivalent full-root API suite ran once, exit 1: 159 files, 149 passed / 10 failed; 2,564 tests passed / 41 failed / 50 skipped (2,655 total). It caught the optional-key regression in `MapEditingWorkspace.test.tsx`, subsequently fixed and verified in the focused and entire UI suites. Other failures concern untouched external-fixture writes, Git ownership checks, and spawned CLI processes in this sandbox; their exact names and errors follow below. The full suite was not repeated.
- `npm.cmd run typecheck` ran once, exit 0 (`task-3-typecheck.log`). After the final fixes, direct `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.base.json` and `... -p packages/ui/tsconfig.json` both exit 0 (`task-3-typecheck-final.log`).
- `npm.cmd run build -w @pokemap/ui` ran once, exit 0: 77 modules, built successfully (`task-3-build.log`). This build preceded the final optional-key/exit-retirement fixes; not repeated per the brief's once-each instruction.
- Oracle: `git diff e1050b2cb43eabf8173f436a25fbf4c837aa8265 -- ':(glob)packages/*/test/**' | Select-String -Pattern '^-[^-]'` printed nothing; `task-3-oracle.log` is empty. `git diff --check` passed.

Deviations: no R1-R4 deviation. PowerShell disables npm/npx `.ps1` launchers, so `.cmd` launchers were used. Vitest CLI cannot load its config in this restricted sandbox; API runs supplied the identical test settings with `config: false`, `run: true`. Reproduction from repository root (pipe into `node --input-type=module`, substituting the filters):

```js
import { startVitest } from 'vitest/node';
const ctx = await startVitest('test', FILTERS, {
  config: false, run: true, globals: false, environment: 'node',
  environmentMatchGlobs: [['packages/ui/**', 'jsdom']],
  include: ['packages/*/test/**/*.test.{ts,tsx}'],
  setupFiles: ['packages/ui/test/setup.ts'],
});
await ctx?.close();
```

Preexisting modified `ledger.md` and untracked `task-3-codex-brief.md` were left untouched. Mutation checks, live checks, reviews and commit remain the coordinator's, as directed by the Codex brief.

Skipped: coordinator-only mutations, live checks and commit; no unrelated fixes.
Risk: the full repository gate is not green in this sandbox. Run it in the coordinator's normal environment before committing.

Full API gate failure inventory (including the subsequently fixed workspace failure):


## Fix round 1

Status: DONE.

Changed only the two requested witness files and this report (plus verification logs):
- `packages/ui/test/AppContextStroke.test.tsx`: added ONE test, `dirty Map and Dungeon mode switches leave context without prompting and preserve the session`. It enters context, paints through the actual App/session/canvas path with a non-held fetch response, waits for the dirty indicator and paint/end, switches to Map, and checks overlay removal, no SaveDialog and retained dirty state. It reenters context, switches to Dungeon, verifies the same exit/no-dialog behavior, then returns to Map and verifies dirty state remains. A confirm spy also proves no browser prompt occurred.
- Both family witness files: removed unused `describe`, `within` and `chrome`; removed GBC's unused `StrictMode`; replaced copied headers with M5-specific comments. No other test files changed.

Mutation RED: temporarily inserted `if (editSession.isDirty) { ctx.requestExit(); return; }` before `ctx.leaveContext()` in GBA `switchMode`. Root Vitest API run filtered to the new test (`testNamePattern: 'dirty Map and Dungeon mode switches'`) failed, exit 1: 1 test failed / 1 skipped, 1 file failed. Failure: `dirty Map and Dungeon mode switches leave context without prompting and preserve the session`, `AppContextStroke.test.tsx:180`, `expect(contextOverlay()).toBeNull()` received the still-mounted overlay. Complete output: `task-3-fix-round-1-red.log`.

Restoration: Python captured the original bytes and restored them in `finally`, verified byte equality and SHA256 `f87689ec91cf64d24c13691eb886f693bb8dde354446b31ff766ed6114749777`. `git diff --quiet -- packages/ui/src/App.tsx` returned 0. No git checkout/restore/stash or other git state-changing command was used.

GREEN: attempted the required root command `npx.cmd vitest run packages/ui/test/AppContextStroke.test.tsx packages/ui/test/gbc/GbcAppContextStroke.test.tsx`, exit 1 before collection due to the same sandbox esbuild ancestor-directory/config-loading restriction (`task-3-fix-round-1-cli.log`). Used the same root API fallback:

```js
import { startVitest } from 'vitest/node';
const ctx = await startVitest('test', [
  'packages/ui/test/AppContextStroke.test.tsx',
  'packages/ui/test/gbc/GbcAppContextStroke.test.tsx',
], {
  config: false, run: true, globals: false, environment: 'node',
  environmentMatchGlobs: [['packages/ui/**', 'jsdom']],
  include: ['packages/*/test/**/*.test.{ts,tsx}'],
  setupFiles: ['packages/ui/test/setup.ts'],
});
await ctx?.close();
```

Executed via `node --input-type=module` from repository root: 2 files passed / 3 tests passed / 0 failures, exit 0 (`task-3-fix-round-1-green.log`). Existing jsdom canvas warnings remain. `git diff --check` passed.

Skipped full suite, typecheck and build for this test-only fix round, as scoped; no production diff remains. No new risk identified.
