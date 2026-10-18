# Task 6 fix report

Status: implementation and regression tests written; executable verification blocked by the sandbox/dependency setup. No commits, staging, or other git writes.

## Scope and execution

Read the supplied task-6-fix-brief.md before inspecting implementation. High risk: this fixes save staging and refusal handling at the server/UI boundary. This is the assigned, bounded fix round; implementation remained inline in this Codex worktree rather than redispatching the fix to another implementer. Delegate/TDD guidance was read. Initial git status was clean. Only the two permitted production files, their named tests, and this requested report changed.

Acceptance: a newly inserted event can move without scalar edits addressing absent disk entries; move undo restores the insertion snapshot; saved map JSON contains only the intended inserted object with its final coordinates; ordinary on-disk moves retain scalar edits; loaded plan refusals are visible and prevent saving.

## Changes

- packages/server/src/index.ts: event/move matches a pending insertion by exact one-element array path and event index, using EVENT_ARRAY_KEY. It immutably folds x/y and optional elevation into that insertion value. Without a matching insertion, the existing jsonEdits path is retained. The existing handleEventOp snapshot remains the single undo step. Deletion handling is untouched.
- packages/ui/src/components/SaveDialog.tsx: render refusals from the current plan using the existing refusal markup (with the existing commit-refusal state as fallback). Suppress the empty-state message and disable Save when refusals exist. Commit responses already replace the plan, so commit-time refusals retain the same presentation; reloaded plans also determine the current refusal display.

All edits used targeted byte replacements/insertions, preserving unrelated bytes and CRLF. Compared original comment lines and UTF-8 section-sign line contents against HEAD: unchanged. All four section signs in index.ts remain intact. An initial comparison including line endings failed because git's HEAD blob is LF and the checkout is CRLF; the corrected content comparison passed, and all four edited files retain uniform CRLF. git diff --check passed.

## Tests written before production changes

packages/server/test/indicatorRoutes.test.ts adds four regression cases:

- Indicator Place -> move, parameterized over omitted elevation and elevation 4: asserts the moved session map/insertion, no scalar edits, refusal-free plan, undo restoring the entire original placement snapshot, redo restoring the move, no pre-commit disk write, and commit producing exactly the expected surgically inserted JSON and staged scripts.
- Plain object Add Event -> move: checks a clean plan, preserved elevation when omitted, undo/redo, exact committed JSON insertion, and unchanged scripts.
- An on-disk object move still emits x/y/elevation jsonEdits and no insertions.

packages/ui/test/SaveDialog.test.tsx adds two regression cases (empty and nonempty change lists): loaded refusal message/fix are shown, the no-changes message is absent, and Save Changes is disabled.

The unchanged implementation would fail the pending-insert and UI-refusal assertions. Runtime red/green could not be observed: the pre-fix attempt failed at infrastructure startup, before test collection.

## Verification evidence

- Requested pre-fix command: `npx.cmd vitest run packages/server/test/indicatorRoutes.test.ts packages/ui/test/SaveDialog.test.tsx`. The worktree has no node_modules; npx stalled resolving dependencies and was stopped. No successful test run resulted.
- Pre-fix retry using the main checkout's installed Vitest and `--config C:/Programming Projects/PokeMap/vitest.config.ts`: exit 1 during esbuild config startup. Errors: `Cannot read directory "../../../../../../../..": Access is denied.` and `Could not resolve "C:\\Programming Projects\\PokeMap\\vitest.config.ts"`. No tests collected.
- Post-fix focused command: `node "C:/Programming Projects/PokeMap/node_modules/vitest/vitest.mjs" run packages/server/test/indicatorRoutes.test.ts packages/ui/test/SaveDialog.test.tsx`: exit 1 before collection; esbuild cannot read the ancestor directory and cannot resolve this worktree's vitest.config.ts.
- Full gate: `node "C:/Programming Projects/PokeMap/node_modules/vitest/vitest.mjs" run`: exit 1 with the same startup/config errors. Pass/fail/file counts unavailable; this is not a passing gate.
- Server/core typecheck: `node "C:/Programming Projects/PokeMap/node_modules/typescript/bin/tsc" --noEmit -p tsconfig.base.json`: exit 1, TS2688 cannot find type definition file for `node`.
- UI typecheck: the same compiler with `--noEmit -p packages/ui/tsconfig.json`: exit 1, TS2688 cannot find type definition files for `node` and `vite/client`.
- UI build: `node "C:/Programming Projects/PokeMap/node_modules/vite/bin/vite.js" build packages/ui`: exit 1 before build, same ancestor-directory access denial and failure resolving packages/ui/vite.config.ts.
- TypeScript transpileModule syntax check on all four changed TS/TSX files: zero error diagnostics. This is syntax evidence only, not a semantic typecheck.
- Final git diff --check: passed.

## Concerns / coordinator follow-up

Run the requested focused suite in the coordinator environment, then the full gate, both semantic typechecks, and UI build. Live UI acceptance and mutation checks were not runnable here; independent coordinator review remains required. No test passes, live-check success, mutation success, or semantic typecheck success are claimed. The server suite uses the existing real-subject temporary-copy fixture and skips when SUBJECT_ROOT is unavailable; the coordinator must confirm these cases actually execute.


## Fix 2

Status: both-family session-aware placement implemented with tests written first; executable checks remain blocked by the same sandbox and missing-local-dependency problems. Fix 1's uncommitted changes are retained. No git writes or subject-source writes.

### Risk and acceptance

High risk: source/session occupancy at an external suggestion route must agree with staged placement and undo/discard state. This remains the same assigned fix round, implemented inline without redispatch. Acceptance: suggestions without a session retain the on-disk default and do not create a session; after placing at that default, the next suggestion is a different unoccupied coordinate in both families; core scan order and omitted-parameter behavior remain unchanged.

### Changes

- packages/core/src/signs/suggest.ts and packages/core/src/indicator/gbcData.ts now accept optional `occupied?: ReadonlySet<string>`, keyed by `x,y`. A provided set represents current authoritative object occupancy; an omitted parameter retains the previous on-disk occupancy calculation. The set is never mutated. An explicit empty set is respected, allowing tiles vacated by staged moves/deletions to become available. Existing row-major grass scan and up/down/left/right candidate order are untouched.
- packages/server/src/index.ts passes current session.map.objectEvents coordinates when editSessions.has(map) is true.
- packages/server/src/gbcEditRoutes.ts passes current session.events.objects STEP coordinates when store.has(map) is true. These parsed events are maintained alongside eventsText by the existing staging/undo code. No block-to-step conversion is applied to these already parsed STEP positions.
- Both routes pass undefined without a session. The has check prevents read-only suggestions from opening an edit session. Species ranking is unchanged.

### Tests-first evidence

Added regressions before editing production:

- packages/server/test/indicatorRoutes.test.ts: GET default equals the core's on-disk default and does not open a session; Place at that coordinate; GET again returns a different non-null coordinate not occupied by any current session object; disk remains unchanged; undo restores the original suggestion, redo restores the next suggestion, and discard restores the no-session default without reopening a session.
- packages/server/test/gbcIndicatorRoutes.test.ts: the same route lifecycle for Route29 using parsed STEP object coordinates, plus unchanged source ASM before commit.
- packages/core/test/signs/suggest.test.ts: supplied occupancy excludes the original suggestion, leaves the input set unchanged, retains omitted-parameter behavior, and returns null when all map coordinates are occupied.
- packages/core/test/indicator/gbcData.test.ts: deterministic grass fixture checks exact up/down/left/right results for supplied occupancy, explicit empty-set override of on-disk occupancy, full occupancy returning null, set immutability, and unchanged default behavior.

The pre-fix focused run failed before test collection with the same esbuild startup denial described below. Thus tests were authored first, but runtime red/green and mutation checks could not be demonstrated here.

### Verification

All commands below used installed tools under `C:/Programming Projects/PokeMap/node_modules/` while keeping cwd in this scratch worktree:

- Pre-fix focused command: `node "C:/Programming Projects/PokeMap/node_modules/vitest/vitest.mjs" run packages/server/test/indicatorRoutes.test.ts packages/server/test/gbcIndicatorRoutes.test.ts packages/core/test/signs/suggest.test.ts packages/core/test/indicator/gbcData.test.ts`.
- Post-fix focused command: the same command including `packages/ui/test/SaveDialog.test.tsx` to retain Fix 1 coverage.
- Full gate: `node "C:/Programming Projects/PokeMap/node_modules/vitest/vitest.mjs" run`.
- All three Vitest attempts exited 1 before collection: `Cannot read directory "../../../../../../../..": Access is denied.` followed by failure to resolve this worktree's `vitest.config.ts`. Pass/fail/file counts are unavailable, not zero or passing.
- Typechecks rerun using the installed TypeScript CLI with `--noEmit -p tsconfig.base.json` and `--noEmit -p packages/ui/tsconfig.json`. Both exited 1: TS2688 missing `node`, and UI additionally missing `vite/client`.
- UI build rerun using the installed Vite CLI, `build packages/ui`: exit 1 before build, same ancestor-directory access denial and failure resolving this worktree's `packages/ui/vite.config.ts`.
- TypeScript transpileModule on all ten modified TS/TSX files: zero syntax error diagnostics. This does not establish semantic typecheck success.
- Original comment and section-sign line contents compared against HEAD for all ten modified files: preserved. Targeted byte edits retained each file's existing LF or CRLF convention; core gbcData.ts and its test already use LF, while the other changed files use CRLF. Git emits its existing LF-to-CRLF policy warnings for those two LF files; no conversion was performed.
- Final `git diff --check`: passed.

### Concerns

Coordinator must run both-family route regressions and both core suites with the subject corpora available, then the full gate, semantic typechecks, and UI build. Route/corpus-backed tests must actually execute rather than skip. Independent review, mutation checks, and live acceptance remain unverified in this sandbox. No additional UI files were modified for Fix 2. Full report history and Fix 1 edits remain in place.
