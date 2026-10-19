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

## Fix round 1

Addressed all five verified findings against committed Task 4 (`3408636`). High risk remains session/undo ownership and external parse-error handling. Regression tests were added before implementation; no git writes, compatibility aliases, unrelated file edits, or writes to subject source repositories.

Files changed in this round: `packages/server/src/index.ts`, `packages/server/src/gbcEditRoutes.ts`, `packages/server/test/indicatorRoutes.test.ts`, `packages/server/test/gbcIndicatorRoutes.test.ts`, and this report. The coordinator's `packages/cli/test/gbcCommands.test.ts` rename was retained untouched.

1. **GBC update refusal locations.** Stale ownership with an existing selected event and non-editable recognition now return the parsed object's one-based `event.lineIndex + 1` in the located message, the map ASM path as subject, and specific one-sentence fixes (reload/select current Indicator; restore generated shape/select editable Indicator). Missing indices have no fabricated line. Regression asserts exact file/line/fix, unchanged complete session snapshot, and the real undo result.
2. **Plan content and saved bytes.** Place tests now assert exact plan paths, kinds and summaries, staged graphics/cry/text or object sprite/cry/text lines, and full committed file bytes (GBA map JSON and scripts; GBC whole events ASM). Dedicated persisted-Indicator species Update tests assert exact plan metadata, only graphics/sprite and cry changes, stable script/text labels and text, and full committed bytes equal the expected source. The wire plan contains metadata rather than a source diff; tests therefore inspect the staged session source associated with that plan as well as metadata, then read back the committed bytes. Temporary roots are normalized to forward slashes so exact-path assertions match project paths on Windows. Existing real snapshot undo/redo and pending-insert folding regressions remain intact.
3. **GBA pending object deletions.** Update now refuses before mutation when any pending one-segment `object_events` removal has index <= the requested current target position. Message is exactly `Save or undo the pending object deletion before editing this Indicator`. Regression persists an Indicator, deletes an earlier object, checks 400 and unchanged full snapshot/history/dirty state, then undoes the deletion and confirms Update succeeds. Pending-insert graphics folding is unchanged.
4. **Malformed charmaps.** Indicator-only paragraph wrappers reuse the Sign wrapping helpers but add the actual subject charmap path and a fix to read/parse failures. Refusal subjects now name the charmap when that wrapper reports an error, instead of the map scripts file. Both families test empty and unparseable files on add and update; they assert charmap subject/message/fix, unchanged snapshot/history/dirty state, and a single real undo restoring the pre-Place source. `signRefresh.ts` and Sign routes were not changed.
5. **Encoding restoration.** Restored all four unrelated section-symbol comments directly from `git show d2ba838:packages/server/src/index.ts` via raw subprocess bytes decoded as UTF-8, avoiding PowerShell text re-encoding. Verified each restored line matches the baseline bytes (excluding line terminators), UTF-8 is valid, no BOM exists, and existing CRLF-only line endings remain. Sequence comparison against `d2ba838` finds differences only in intended imports, Indicator helpers and Indicator route regions; the unrelated encounter/warp/world/dungeon regions are equal.

Verification:

- In-memory borrowed-dependency TypeScript checks: `tsconfig.base.json` **0 diagnostics**, `packages/ui/tsconfig.json` **0 diagnostics**. Workspace package aliases resolve to this worktree; installed dependencies are read-only.
- Read-only native Node HTTP smoke checks against both configured subjects: **PASS**. Checks exact plan paths, malformed charmap add/update file/fix plus complete session/undo-state atomicity, GBA pending-deletion refusal and recovery after undo, and GBC stale/non-editable file/line/fix refusals. A temporary in-memory loader captured real session stores and intercepted charmap reads; no on-disk source mutation, commit endpoint, or test weakening was involved.
- `git diff --check`: **PASS**. UTF-8/no-BOM/CRLF and four restored comment-byte comparisons: **PASS**.
- Targeted Vitest attempted both before implementation and after: **blocked before collection**, esbuild `Cannot read directory ... Access is denied` / cannot load this worktree's `vitest.config.ts`. No targeted or full-gate pass/fail/file count can be claimed here. UI build remains blocked by the same previously demonstrated config-loader sandbox restriction. Coordinator must run route tests, full gate, normal typecheck/build and any required mutations/re-reviews. Previous coordinator gate evidence is not treated as validation of these new edits.

No remaining implementation concerns identified for these five findings; runtime suite and commit read-back assertions await coordinator execution in the normal environment. No tests were removed or loosened in this round.
