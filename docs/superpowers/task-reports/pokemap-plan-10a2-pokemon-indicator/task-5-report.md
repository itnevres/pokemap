# Task 5 implementation report

Status: implemented in this scratch worktree, uncommitted; coordinator review and live acceptance remain pending.
Risk: **High** ? hub response validation and stale-request ordering in the dialog and both inspectors.
Execution ledger: this session is the Task 5 implementation dispatch. Read the exact task brief, binding spec, Task 4 contracts, delegate, tests-first and verification guidance. Added/migrated tests before implementation; no recursive delegation, git writes, or subject-source edits. Initial normal Vitest invocation produced no result because this worktree has no dependencies; subsequent checks borrowed installed dependencies read-only, with all application/test source resolved here.

## Files

Renamed:
- `packages/ui/src/components/SignComposer.tsx` -> `PokemonIndicatorDialog.tsx`.
- `packages/ui/test/SignComposer.test.tsx` -> `PokemonIndicatorDialog.test.tsx`.

Modified UI source:
- `packages/ui/src/components/Toolbar.tsx`, `MapEditingWorkspace.tsx`, `EventInspector.tsx`.
- `packages/ui/src/gba/adapter.tsx`.
- `packages/ui/src/gbc/adapter.tsx`, `GbcMapEditing.tsx`, `GbcEventInspector.tsx`, `hooks/useGbcEditSession.ts`.
- `packages/ui/src/hooks/useMapEditing.ts`, `useEditSession.ts`.
- `packages/ui/src/shell/adapter.ts`, `shared/useWorldContext.ts`, `styles.css`.

Modified tests: `packages/ui/test/Toolbar.test.tsx`, `gbc/ToolbarGbc.test.tsx`, `MapEditingWorkspace.test.tsx`, `MapEditingWorkspaceActive.test.tsx`, `AppEditingWiring.test.tsx`, `shell/adapter.test.ts`. Added `packages/ui/test/indicatorStrings.test.ts`.

The Sign tool's component, routes, labels, keyboard shortcut and shared CSS selectors remain unchanged. CSS changes only update feature comments; the dialog retains the existing classes. The toolbar uses the existing icon/label styling. Dialogue uses a one-row textarea so editing preserves wrapped lines and paragraphs.

## Contracts and payload application

`PokemonIndicatorDialog` has exactly `{ mapName, edit?, onDone(scriptLabel, payload), onCancel }`. Suggestions use `/api/indicator/:map/suggestions` and the shared `{ species, name, percent }` rows. Place posts `{ x, y, species, text }` to `indicator/add`. Edit prefills species/text, hides X/Y, posts `{ index, scriptLabel, species, text }` to `indicator/update`, and retains the original script label when the update response omits it. Refusals show the required prefix and fix. Runtime guards validate suggestions, refusal entries, lookup blocks and success envelopes before use; adapter exceptions remain visible in the open dialog.

GBA: its adapter checks `isIndicatorMapUpdate`, including the returned map name and event-array structure, then calls the existing `applyExternalMapUpdate(map, isDirty)`. This merges the live map while preserving blocks/border and applies the existing event-operation undo/redo convention (`true`/`false`). Both add and update use this path.

GBC: its adapter checks the existing, now-exported `isSessionBody` and rejects null events, then calls `applyExternalSession(payload)`. The unchanged session merge applies returned blocks, events, dirty, canUndo and canRedo. Both add and update use this path. The runtime owns the dialog and dismissible success banner; both workspaces wire Edit Indicator to that same dialog.

## Stale responses

The dialog preserves the original cleanup/cancelled suggestions guard. A generation ticket also retires submit successes, refusals and errors after a map/edit change or unmount; a synchronous pending ref prevents duplicate submissions. GBA clears dialog/edit state on a map visit change. GBC tags dialog state with its map and clears it when selection changes.

Both inspectors share `useIndicatorBlock`: every map/index/source revision owns a cancelled flag; late successes and failures cannot publish. Results are also tagged with map/index/source and filtered during render, so a previous selection's Edit button is never displayed for the new selection. GBA supplies the live map as its source revision (updates/undo refresh recognition); GBC uses its session events. Non-Indicators have no button; changed generated scripts show a disabled button plus the reason in its title and visible note. Lookup errors are visible inline, preserving the host operation banner's alert semantics. An unwired standalone GBC workspace does not issue Indicator lookups.

## Test migration and added coverage

All eight original composer tests remain under the renamed file/component. Significant title/contract changes:
- `POSTs /sign/add ... elevation/species/dialogue ... onAdded` -> `POSTs /indicator/add ... species/text ... onDone` (also asserts opaque payload).
- `the Add Sign button ...` -> `the Pokémon Indicator button ...` (queries Place).
- `500 from POST /sign/add ... onAdded` -> `500 from POST /indicator/add ... onDone`.
- Toolbar `clicking Add Sign calls onOpenSignComposer` -> `clicking Pokémon Indicator calls onOpenIndicator`.
- App `Save ... not SignComposer` / `Add Sign opens SignComposer` -> corresponding `PokemonIndicatorDialog` cases.
- Workspace `Save and Add Sign ...` -> `Save and Pokémon Indicator ...`.
- Capability expectations replace `addSign` with `pokemonIndicator: true` for both families.

Added edit/update, multiline round trip, malformed suggestions/add/lookup, stale suggestions/submit, both inspectors' editable/disabled/plain-NPC states, A-then-B late-A responses (including a disabled B), capability on/off, exact strings and the real `Sign (G)` tooltip. Runtime adapter tests assert each family's returned session data and dirty/undo flags, plus malformed-payload rejection without closing the dialog.

## Verification

Final focused run: **156 passed, 0 failed, 12 files**. Includes all task tests and unchanged EventInspector, GbcEventInspector, GbcMapEditing and shell/switchPrompt regression suites.

Final borrowed TypeScript checks: **0 diagnostics** for both root and UI configs. Final in-memory Vite production build: **PASS**, 113 modules, no emitted build artifacts. Dependency paths/React declarations were supplied in memory; project configs were not changed. `git diff --check`: **PASS**.

Mutation evidence (in-memory Vite transforms, no source mutation left behind): removing submit generation checks fails `ignores a submit response after the map changes`; removing both lookup cancellation guards fails `keeps B's disabled state when A's valid Indicator lookup resolves last` for **each family**. The multiline test was observed **RED** on the old text input (newlines stripped), then **GREEN** after the textarea change.

Broad gate attempt, before the last UI fixes/new multiline case: **FAIL ? 3,000 passed, 45 failed, 54 skipped; 182 passed files, 13 failed files (195 total)**. Three UI failures were corrected and are green in the final focused run: GbcMapEditing's `a delete refusal shows the server's text ...` and `the banner can be dismissed`, plus GBA switchPrompt's `discard failure shows switchError and stays`.

Remaining broad-run failure suites, all requiring coordinator environment verification:
- `packages/core/test/write/corpus.test.ts`, `packages/cli/test/writeCommands.test.ts`, `packages/server/test/saveRoutes.test.ts`, `dungeons.test.ts`, `gbcRoutes.test.ts`: denied writes to real subjects/sidecars (EPERM).
- `packages/core/test/gbc/write/writeGate.test.ts`, `packages/server/test/gbcEditRoutes.test.ts`, `packages/cli/test/gbcCommands.test.ts`: git ownership checks; spawned CLI cases also cannot resolve this worktree's absent `tsx`.
- `packages/cli/test/context.test.ts`: this borrowed runner used threads, where `process.chdir()` is unavailable.
- `packages/ui/test/styles.test.ts`, `stylesContext.test.ts`: borrowed runner cannot resolve `lightningcss` from the dependency-less worktree.

## Open concerns

No known remaining Task 5 implementation defect. The broad gate has **not** been rerun green after the fixes; coordinator must run the normal full gate with local dependencies and subject permissions. Live browser validation was not attempted here: coordinator must check Place/Edit in both real family UIs, including drag and Save acceptance. No live Save or source write is claimed. Separate high-risk spec/quality reviews remain coordinator-owned. Keep this report in place until those reviews pass; do not delete it.


## Fix round 1

Addressed both verified Important findings against `5647307`. Risk remains High: external success-payload validation and pending-request/session ownership. Continued in the same implementation session, following the delegate routing guidance; the narrowly specified fix and regression commands fit direct execution. No recursive dispatch, git writes, subject-source edits, unrelated files, comment rewrites, or JSX reflow. All added source/test text is ASCII; feature labels use `Pok\u00e9mon` escapes. This section supersedes the earlier implementation status where these two defects were not yet known.

Files changed in this round:
- `packages/ui/src/hooks/useEditSession.ts`.
- `packages/ui/src/gbc/hooks/useGbcEditSession.ts`.
- `packages/ui/src/components/PokemonIndicatorDialog.tsx`.
- `packages/ui/test/AppEditingWiring.test.tsx`.
- `packages/ui/test/PokemonIndicatorDialog.test.tsx`.
- This report (append only).

### 1. Reject malformed event entries before publishing a success

GBA `isIndicatorMapUpdate` now validates every coordinate-event entry as a non-null, non-array object with finite numeric x, y and elevation. It also validates the object graphics/movement/script strings, warp destination strings, background type, and connection records (map/direction strings and finite offset). These are the values the canvas, border selection and inspector consume. Validation completes before the existing adapter calls `applyExternalMapUpdate`, so a rejected body cannot alter the live map, blocks, dirty flag or undo state.

GBC's existing `isSessionBody`, already used by the adapter and session hook, now validates each object, warp, coordinate and background event with finite x/y and the corresponding numeric/string fields used by rendering, inspection and duplication. It keeps the existing null-events undo/redo no-op behavior and the prior block/container/flag/warning checks. The adapter rejects invalid bodies before calling `applyExternalSession`; the dialog catches the validation error, shows error text and stays open. No adapter changes were necessary because both existing callers already validate before applying.

The integration tests send otherwise valid success envelopes containing malformed entries in every coordinate-event list, plus GBA connections. Cases cover null, array, empty record, string x, NaN x and infinite y. Additional cases give objects valid coordinates but an invalid graphicsId/sprite value. Each test asserts visible error text, the dialog still mounted and exact serialized session equality with the pre-submit snapshot. Valid payload application remains covered for both families.

### 2. Preserve ownership until a pending POST completes

Cancel is disabled while `submitting`; Escape checks the synchronous `submitPending` ref and ignores dismissal during the request. The ref also covers the interval before React commits the disabled button. The existing generation/stale-response behavior is retained. Normal cancellation becomes available again after completion or failure.

Deferred add integration tests attempt Escape and Cancel for both family runtimes, then resolve the request and assert that the dialog closes with the returned event in the live session and dirty/undo state updated. Dialog-level tests cover both add and update: neither cancellation path calls onCancel while pending, eventual success calls onDone with the correct label/payload, and Cancel works again after completion. No existing tests were removed or renamed in this round.

### Verification

- Tests were added first. The initial selected run was RED: six regressions failed across both test files (pending add/update cancellation, pending runtime cancellation, and invalid displayed fields in both families).
- Final focused regression run: **246 passed, 0 failed, 15 files**. This includes all Task 5 UI tests, both session-hook suites and GBC shared-session coverage, plus the existing inspector/workspace/switch-prompt regressions.
- Mutation run: **6 expected failures** when the two entry guards and pending-cancellation controls were reverted in memory. Both families' null-object-entry and invalid-displayed-field tests failed, as did the add/update pending-cancellation tests. Mutation plugins altered transformed code only; no mutation was written to source.
- Root and UI TypeScript checks: **0 diagnostics each**. Vite in-memory production build: **PASS**, 113 modules. Dependencies were borrowed read-only from the installed checkout, with application/test paths resolved to this worktree and no config changes or emitted artifacts.
- `git diff --check`: **PASS**. Scope checked against the six files above.

The complete project gate was not repeated in this round: the previously recorded sandbox/dependency/worker limitations remain, and the coordinator's earlier passing gate does not validate these new edits. A fresh normal full gate and re-reviews remain coordinator-owned. No new live browser check or real Save is claimed. No remaining implementation concern is identified for the two requested findings.
