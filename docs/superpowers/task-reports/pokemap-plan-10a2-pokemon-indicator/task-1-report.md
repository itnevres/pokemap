# Task 1 report: GBA Indicator core

Status: implemented in the scratch worktree; runtime verification pending coordinator.
Risk: High (subject-source construction and recogniser/error boundary).
Routing: delegate skill read; this session is the assigned Codex implementer. No further dispatch, git writes, or commits.

## Files changed

Created:
- `packages/core/src/indicator/gba.ts`
- `packages/core/test/indicator/gba.test.ts`
- `packages/core/test/fixtures/indicator/gba-place.inc`
- `packages/core/test/fixtures/indicator/gba-legacy.inc`
- This report.

Modified:
- `packages/core/src/edit/events.ts`: immutable `setObjectGraphics`, one graphics JsonEdit.
- `packages/core/test/edit/events.test.ts`: graphics edit/path and original-map preservation.
- `packages/core/src/signs/suggest.ts`: two requested function renames; return types unchanged.
- `packages/core/src/signs/linked.ts`: renamed ranker import/call.
- `packages/core/test/signs/suggest.test.ts`: renames only.
- `packages/core/src/signs/wrap.ts`: `SIGN_WIDTH = 18`.
- `packages/server/src/signRefresh.ts`: both families use SIGN_WIDTH instead of literal 18.
- `packages/server/src/index.ts`, `packages/cli/src/writeCommands.ts`: import paths and symbol names only (including corresponding references/comments); routes, request contracts and behavior retained.

Deleted after moving code/tests:
- `packages/core/src/signs/script.ts`
- `packages/core/src/signs/write.ts`
- `packages/core/test/signs/script.test.ts`
- `packages/core/test/signs/write.test.ts`

`linked.test.ts` had no renamed symbol references and required no edit. Whole-repository searches included UI; remaining old-name references in executable packages are comments/test descriptions, not imports or executable calls. Historical Plan 2 documentation still contains old import examples and was left untouched per scope. Out-of-scope comments were retained.

## Every changed expectation in the moved tests

Original script tests:
1. Exact CeladonCity script/text generator outputs -> the exact original GOLDEN_SCRIPT/GOLDEN_TEXT (and provenance comments) remain, now checked as an editable legacy block with exact POLIWRATH text/species. The removed public generator accepted explicit arbitrary labels, whereas the new builder allocates numbered labels; new `place golden` separately compares the complete newly generated C3 append byte-for-byte with `gba-place.inc`.
2. Derived `Route101_EventScript_WildSign_Rattata`, `Route101_Text_WildSign_Rattata`, and script prefix -> `Route101_EventScript_PokemonIndicator1`, `Route101_Text_PokemonIndicator1`, and the numbered script prefix. Reason: C2.
3. NIDORAN_F derived label `...WildSign_NidoranF` -> the same `...PokemonIndicator1` as any other species in an empty source. Added MR__MIME graphics assertion. Reason: label identity no longer depends on species.
4. Empty dialogue throws `/dialogue.*empty/i` -> empty paragraphs and an empty line throw `/empty|nonempty/i`. Reason: new paragraphs input and renderer diagnostics, with empty-text rejection retained.
5. Literal quote and dollar dialogue throw `/dialogue.*must not contain/i` -> both still throw, now matching `/character/i` from renderGbaBody. Reason: shared Sign renderer owns validation; no validation was weakened.
6. Raw-newline refusal -> 60-character text plus a blank-line paragraph is passed through wrapSign at SIGN_WIDTH and generates multiple .string lines with literal \n, \l and \p; recognition reconstructs the exact wrapped logical text. Reason: C1 explicitly removes the old single-line restriction.
7. Mixed-case species cry remains `playmoncry SPECIES_RATTATA, CRY_MODE_NORMAL`; graphics now also asserted for mixed case, uppercase prefix and lowercase prefix. Input changes from explicit generator labels/dialogue to builder paragraphs.

Original write tests:
8. Full raw object expectation unchanged except `script: Route101_EventScript_WildSign_Rattata` -> `script: Route101_EventScript_PokemonIndicator1`; result.scriptLabel changes identically. Coordinates, elevation, graphics, movement, ranges, trainer fields, flag, cry and literal text assertions remain unchanged. Reason: C2; input is now four-argument builder plus paragraphs.
9. SPECIES_RATTATA input still produces `OBJ_EVENT_GFX_SPECIES(RATTATA)`; only function/input shape changes.
10. Empty-dialogue propagation -> empty-paragraph rejection with `/empty|nonempty/i`; same refusal, shared-renderer vocabulary.
11. Missing scripts.inc still returns one NO_SCRIPTS_INC refusal with a scripts.inc fix. Fixture label now numbered and function renamed; expectations unchanged.
12. Existing-label collision still returns one SIGN_LABEL_EXISTS refusal. Fixture/request label `...WildSign_Rattata` -> `...PokemonIndicator1`; reason: C2. Existing externally visible refusal code retained.
13. Free label still returns `[]`. Requested label becomes numbered; no outcome change.

Original suggest tests only rename functions/describe strings; all assertions remain unchanged.

## Design notes

### Shape and round trip

`findGbaIndicator` scopes its cry search to the event's own script block. No playmoncry there returns null, even if another script elsewhere has a cry. A cry-bearing candidate with duplicate labels, a non-double-colon script label, altered/extra commands, incorrect command order/modes, absent or duplicate local text, shared text, unsupported text controls, or graphics/cry disagreement returns editable:false with a reason.

It validates the nine C3 commands in order and the exact species graphics expression. After this check, a line-index-preserving in-memory adapter turns just that script into a Sign-shaped msgbox/end pair. `findGbaSign` supplies the existing text-body grammar, single-reference guard and paragraph round trip. The adapter never writes source. Extra commands after the text terminator are also refused. Legacy WildSign labels and the original Celadon labels need no renaming; recognition depends on shape, not a species-derived label suffix.

Update revalidates the supplied block against current source. Species changes replace only the cry constant inside the existing raw line, preserving comments/indentation/EOL. Text changes use replaceLines only for the parsed body. Cry replacement changes no line counts, so simultaneous updates work when text precedes the script. Identical species/paragraphs return the original string. Tests cover LF, CRLF, unrelated blocks, trailing-newline state and a stale changed script.

### Number allocation

The four-argument builder scans source plus mapScripts for identifiers. Either the script or text identifier reserves that pair, including references without definitions. It takes the lowest unused positive integer; species never affects the number. Tests cover existing 1 + mapScripts-only 2 -> 3, repeated species -> 1 then 2, text-only reservation, and reuse of a hole before 3. Scanning comments/string tokens is conservative and may reserve an otherwise unused number; it cannot cause a collision.

## Integration notes and open concerns

- The instruction to change server/CLI imports only while preserving behavior conflicts with immediately requiring their old two-argument dialogue calls to use the new four-argument builder. A temporary two-argument overload of `buildGbaIndicator` retains the moved legacy generator privately, including its comments, labels and restrictions. Existing routes/CLI use it unchanged except for renamed imports/calls. Task 4 should migrate them to incText/mapScripts/validated paragraphs and remove this overload/private legacy implementation. The new four-argument API follows C1-C3 now.
- The specified three-argument guard cannot validate an unknown species: numbered scriptLabel contains no species. Added an optional fourth `species` argument; when supplied, it checks the subject's species_names.h and returns located refusals for unknown species or unreadable table. A comment-aware reader ignores commented-out names. Existing three-argument callers preserve their current behavior. Task 4 must supply species explicitly to activate this guard.
- The pure builder/renderer consumes already wrapped, charmap-validated paragraphs; it cannot validate a subject charmap without a project/root. Task 4 remains responsible for wrapping/subject charmap checks, per the planned integration.
- No unrelated bugs fixed. No UI behavior changed or live UI check required for these import-only caller changes.

## Verification

Tests were written/moved before production edits; follow-up edge-case tests preceded their implementation edits. Per the explicit task instruction, Vitest, the full gate, typecheck, UI build and mutation checks were not run; no pass claim is made. Coordinator must run the required verification and mutations.

Static validation: `node --check` succeeded for new indicator source/test and edited events source; `git diff --check` succeeded. All edited pre-existing text files retain CRLF; fixtures deliberately contain literal LF source bytes. No git writes or commits performed.
