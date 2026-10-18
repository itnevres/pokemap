# Task 4 implementation report

Status: implemented, not committed; coordinator runtime gate/reviews/mutation pending.
Risk: High (session/undo ownership, parsing and subject save boundaries).
Execution: dispatched Codex implementer working directly from the approved Task 4 brief; no further delegation, git writes, or writes to subject repositories. Tests were edited before implementation. Temporary runtime loaders only borrowed installed dependencies read-only; application source always came from this worktree.

## Files

- `packages/server/src/index.ts`: GBA Indicator suggestions/add/at/update, current-map shared-script guard, atomic staging, species normalization/display names.
- `packages/server/src/gbcEditRoutes.ts`: equivalent GBC routes, own-sprite/species validation, whole-file staging.
- `packages/cli/src/index.ts`, `packages/cli/src/writeCommands.ts`: `indicator suggest/add/list`, `runIndicator*` exports, `IndicatorAddArgs`, `--text`, subject-charmap wrapping, numbered labels and species guard; still GBA only.
- `packages/server/test/signRoutes.test.ts` moved to `indicatorRoutes.test.ts`; background Sign coverage retained in the moved file. New `gbcIndicatorRoutes.test.ts`.
- `packages/cli/test/writeCommands.test.ts`: migrated names/contracts and added refusal/no-write coverage.
- `packages/core/src/indicator/gba.ts`: deleted temporary legacy overload, `LegacyIndicatorScriptOptions`, `LegacyIndicatorScript`, `LegacyIndicatorInput`, `titleCase`, `generateLegacyIndicator`, and `buildLegacyIndicator`; kept the modern builder/result and legacy-script recognition.
- `packages/core/test/indicator/gba.test.ts`: renamed one stale empty-dialogue test title; no tests removed.

## Route contracts

Both families serve:

- `GET /api/indicator/:map/suggestions`: `{ species: { species, name, percent }[], placement: { x, y } | null }`. GBA maps ranked rows to bare species and subject species-table display names; GBC uses its ranked helper.
- `POST /api/edit/:map/indicator/add`: `{ x, y, elevation?, species, text }`. GBA defaults elevation to zero; GBC uses step coordinates. Returns the existing family event result plus `scriptLabel`. Validates/wraps free text with `gbaSignParagraphs`/`gbcSignParagraphs`, thus the Sign tool's charmap and SIGN_WIDTH. Failures return 400 `{ refusals }` with source context and a fix. Existing Sign put/at/resolve handlers remain unchanged.
- `GET /api/edit/:map/indicator/at?index=`: `{ indicator: IndicatorBlock | null }` from current staged source. GBA additionally disables any recognized block with multiple current object owners, reason `shared script`.
- `POST /api/edit/:map/indicator/update`: `{ index, scriptLabel, species, text }`; validates current ownership/label/editability and species before staging. Returns the family event result. Stale labels, shared scripts, changed shapes and source/text failures return 400 refusals without changing the session/undo stack.

Old `POST .../sign/add` is removed (404). CLI old `sign` command and dialogue argument are removed, with no compatibility alias. Every `buildGbaIndicator` caller now supplies current scripts, reserved object scripts and wrapped paragraphs.

## Undo and save ownership

GBA captures `snapshotOf` before working on a shallow session copy. Add stages `addEvent` + script append; update uses `setObjectGraphics` and, only if script bytes changed, `replaceGbaScripts(updateGbaIndicator(effectiveGbaScripts(...)))`. A changed result is published with one `snapshotCommand`; identical updates publish nothing. Snapshots include map, scriptAppends and scriptReplaces. Because save applies scalar JSON edits before insertions, graphics updates to unsaved objects fold into the pending insert value; persisted-object graphics edits replace any prior pending edit to the same field.

GBC reuses `stageSign` (gbcSnapshotOf + parseMapEvents + one snapshotCommand); all wrapping, sprite loading, recognition and generation finish before publishing eventsText/events. Unchanged text adds no command. Tests capture the real stores and exercise HTTP Place -> Update -> undo twice -> redo twice, comparing the entire snapshots, including full GBC eventsText, at each step. Both families also have commit read-back assertions, no-op update after Save and refusal atomicity coverage.

## Removed/renamed tests

- Old `GET /api/sign/:map/suggestions returns a ranked species list...` -> `Indicator suggestions have the shared species contract and old add is gone`; stronger exact row-shape assertion.
- Old `POST /sign/add ... GET /plan shows one object-events insert and one text append...` -> `Indicator add stages exact core bytes, commit equals plan` (LF/CRLF); uses temp subject copies instead of original-subject writes.
- Old `POST /sign/add refuses ... derived label already exists` -> `Indicator add twice numbers independently; unchanged update has no script diff or undo step`; species-derived collision behavior intentionally removed by numbered-label contract. Missing-source refusals separately tested.
- Old `undo after a sign add removes BOTH...` -> full-snapshot Place/Update/undo/redo test.
- CLI runSignSuggest/Add/List tests -> runIndicatorSuggest/Add/List. Old CLI label-collision refusal -> fresh-number allocation for an existing label; an additional test covers invalid text and unknown species without writing.
- Core `propagates buildGbaIndicator's own empty-dialogue refusal...` -> `...empty-text refusal...` (assertion retained). No legacy-helper-only core tests existed: all existing builder tests already used the modern four-argument contract, so none were deleted. Old WildSign recognition/golden tests remain.

## Verification and limits

- Tests written first; initial `npx` invocation blocked by PowerShell execution policy. `npx.cmd --no-install vitest run` could not acquire absent local Vitest (npm EACCES/network denied). Borrowed installed Vitest also failed before collection: esbuild could not traverse sandbox parent directories/load this worktree's vitest.config.ts. Therefore **no Vitest pass/fail/file count is available**, and full gate remains pending with coordinator.
- Borrowed TypeScript compiler, in-memory dependency paths pointing to the installed checkout while workspace packages point here: core/server/CLI/tests **0 diagnostics**, UI **0 diagnostics**. The first UI attempt lacked an explicit React declaration mapping; adding that mapping resolved the environment-only diagnostics without changing project files.
- Native Node read-only HTTP smoke checks passed against both configured real subjects: suggestions, add, at, species update, plan without refusals, undo twice yielding an empty plan, redo twice restoring updated species. GBA planned 2 files; GBC planned 1. No commit endpoint or disk writes in smoke checks.
- Syntax transpilation diagnostics: 0 for edited implementation and route test files. `git diff --check`: pass.
- UI build attempted via installed Vite, blocked before compilation by the same sandbox/esbuild config-directory denial. No visual UI changes in this task.
- Snapshot-drop mutation is explicitly coordinator-owned and not run here. Coordinator must run targeted Vitest, full gate, normal typecheck/build and the mutation before completion claims.

## Open concerns for coordinator

- Out-of-scope `packages/cli/test/gbcCommands.test.ts:349-351` still invokes `sign suggest/add/list` and asserts the old named GBC-only refusal. Those cases must migrate to `indicator` and `--text` for the full gate; file left untouched per the explicit allowlist. Do not retain a legacy command alias to appease the stale test.
- UI callers still use old sign routes until their planned UI migration; not changed here. `gbcRoutes.ts` retains its old `/api/sign/*` 501 fallback and its corresponding test (also outside the allowed files); the new GBC Indicator suggestions route is claimed before that fallback.
- Corpus-dependent tests need configured subjects and a writable test-temp location. Coordinator must validate all newly added assertions at runtime; smoke checks do not replace those assertions or review.
