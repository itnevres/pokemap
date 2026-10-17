# Task 4 implementer report

Status: implemented; focused checks pass. No commit or mutation testing performed.

## Changes

- `packages/core/src/signs/gbaSign.ts`: simple same-file MSGBOX_SIGN reader, paragraph renderer, S9 script/text builders, lowest-unused-number allocator, guarded adoption/update. Imports the existing SignBlock/SignMode and marker/hash helpers from marker.ts.
- `packages/core/src/write/save.ts`: optional whole-file ScriptReplace entries; one replacement text change per path with the required summary; byte comparison against before during both plan and fresh commit validation; missing/unreadable files also refuse with script-changed-on-disk. Replacements write before existing appends, so same-path appends build on after.
- `packages/server/src/editSessions.ts`: snapshots always carry scriptReplaces, defaulting to an empty array, using the existing immutable-array snapshot convention.
- `packages/core/src/gbc/signs.ts`: binding ruling s1 applied to raw whole-word references anywhere outside the text definition and own jumptext line. GBA applies the same rule outside its own msgbox line and text definition.
- New GBA sign and save replacement tests; added one GBC sharing case and one server snapshot/undo/redo case. Existing cases and fixtures were not changed.

## Behavior and safety

The reader accepts only a double-colon script label followed by msgbox X, MSGBOX_SIGN and end, with one same-file text definition. Other script shapes, shared text, unsupported body commands/escapes and missing terminators are refused. Backslash-n/backslash-l become lines; backslash-p becomes a paragraph; dollar ends the text. Rendering emits one tab-indented .string per text line, using backslash-n after the first line, backslash-l after later lines, backslash-p between paragraphs and a final dollar.

R-a is implemented: marked-block hash takes precedence over baselineHash; absent/mismatched baseline throws hand-edited unless explicitly forced. Updates re-read current source, including when the caller block is stale. Force cannot rewrite an unsupported body. Unchanged paragraphs preserve body bytes; only the marker is added or updated. Changed bodies and markers use Task 3's existing replaceLines helper, preserving EOL and final-newline state without duplicating the splice implementation.

New save tests read real Route101 data but write only temporary copies. No new test writes SUBJECT_ROOT. No decomp source, global Git configuration, dependencies or unrelated production files were changed.

## Red/green evidence

Tests were written before production changes. The requested Vitest CLI could not load vitest.config.ts because esbuild could not read an ancestor directory in this sandbox. The authorized Node API fallback used config:false and the repository setupFiles.

Initial fallback: one missing-module suite (gbaSign.ts did not exist), seven assertion failures and 33 passes. Assertions exposed missing replacement planning/writes, missing changed-on-disk refusal, missing snapshot state, and missing GBC jumptextfaceplayer sharing detection. After implementation: four files, 56 tests passed, zero failures and zero skips.

The 16 GBA sign cases cover real Route101 paragraphs and a real MSGBOX_NPC, exact two-line output, scrolling/paragraph round trip, S9 labels/marker, allocation across orphan script/text labels, invalid label inputs, unsupported script/body shapes, generic shared references including MSGBOX_DEFAULT, baseline adoption, byte-preserving unchanged updates, marked and stale-source rejection, forced refresh/re-hash, unsupported forced source, CRLF with and without a final newline, and control/assembly injection refusal.

The five new save cases cover LF/CRLF byte-exact commit, one replacement change in the preview with no preview write, stale/missing source refusal, fresh commit validation before a pending JSON write, and ordered appends on top of replacement content. The server case covers default-empty snapshots, previous-array preservation, undo, redo and restoration to an empty snapshot. The added GBC case covers jumptextfaceplayer sharing.

## Verification

Focused Node API run:

`packages/core/test/signs/gbaSign.test.ts packages/core/test/write/saveScriptReplace.test.ts packages/server/test/editSessions.test.ts packages/core/test/gbc/signs.test.ts`

Result: 56 passed, zero failed, zero skipped.

Requested wider selection (duplicate server file deduplicated by Vitest), plus the changed GBC test:

`packages/core/test/signs/gbaSign.test.ts packages/core/test/write/saveScriptReplace.test.ts packages/server/test/editSessions.test.ts packages/core/test/write packages/core/test/gbc/signs.test.ts`

Result: 143 passed, six failed, zero skipped across 11 files. All six failures are existing `packages/core/test/write/corpus.test.ts` cases named `paints one real block on one real map, commits through the full save funnel, and restores byte-identical`, one per configured GBA root: game (AzaleaTown), pokeemerald (PetalburgCity), pokefirered (BattleColosseum_2P), pokeemerald-expansion (PetalburgCity), modern-emerald (PetalburgCity), pokeclassic (PetalburgCity). Each fails with EPERM on the read-only real-root map.bin restoration/write. These also appeared in Task 3's report; no checks were loosened or tests edited to hide them.

`npm.cmd run typecheck`: passed both core/server and UI TypeScript checks. `git diff --check`: passed (Git prints only its existing LF/CRLF conversion warnings).

Full-suite `npm.cmd test` hit the same CLI/esbuild ancestor-access startup error. The Node API fallback reproduced the repository include, environmentMatchGlobs (UI uses jsdom), and setupFiles, with process-local safe.directory entries for the configured corpus roots (no persistent Git changes). A custom onFinished reporter enumerated every failing test and counted leaf states.

Result: 189 files, 2,902 passed, 40 failed, zero skipped, zero unhandled errors. These match the 40 environment failures recorded for Task 3. All Task 4 cases pass in this full run. Full logs are under `.superpowers/sdd/2026-10-16-pokemap-plan-10a-switch-and-signs/task-4-*.log`.

Every full-suite failure (test name and observed error):

- packages/cli/test/gbcCommands.test.ts render NewBarkTown against the real subject exits 0 and prints the stdout line expected 'node:os:305\r\n    throw new ERR_SYST\u2026' to be '' // Object.is equality
- packages/cli/test/gbcCommands.test.ts render CeruleanCave2F against the real subject: the warning lands on stderr, never stdout expected 1 to be +0 // Object.is equality
- packages/cli/test/gbcCommands.test.ts query NoSuchMap against the real subject exits 1 with the loader's unknown-map message expected 'node:os:305\r\n    throw new ERR_SYST\u2026' to match /^pokemap: unknown map NoSuchMap; not \u2026/
- packages/cli/test/gbcCommands.test.ts render-world against the real subject, with no --scale, exits 0 using the GBC default of 8 expected 'node:os:305\r\n    throw new ERR_SYST\u2026' to be '' // Object.is equality
- packages/cli/test/gbcCommands.test.ts every GBA-only command refuses on the real gbc root with its own named message, never touching a GBA loader validate: expected the named refusal: expected 'node:os:305\r\n    throw new ERR_SYST\u2026' to be 'pokemap: validate is not supported fo\u2026' // Object.is equality
- packages/cli/test/gbcCommands.test.ts where DUNSPARCE against the real subject exits 0 and matches runGbcWhere's own output expected 1 to be +0 // Object.is equality
- packages/cli/test/gbcCommands.test.ts 11. real process: --yes paint changes the copy; --metatile abc exits 1 with 'pokemap: ' expected 1 to be +0 // Object.is equality
- packages/cli/test/gbcCommands.test.ts 12. real process, dry-run defaults: paint/diff/event add without --yes never write; --yes event add does expected 1 to be +0 // Object.is equality
- packages/cli/test/gbcCommands.test.ts 13. real process, CeruleanCave2F: dry run warns on stderr; --yes refusal keeps the size warning in stderr expected 1 to be +0 // Object.is equality
- packages/cli/test/gbcCommands.test.ts 10. event on a GBA root refuses (GBC-only) expected 'node:os:305\r\n    throw new ERR_SYST\u2026' to be 'pokemap: event move is not supported \u2026' // Object.is equality
- packages/cli/test/writeCommands.test.ts runSignAdd with --yes actually commits, then restores EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\data\maps\Route35\scripts.inc'
- packages/cli/test/writeCommands.test.ts runSignAdd refuses and writes nothing when the derived label already exists, even with --yes EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\data\maps\Route40\scripts.inc'
- packages/cli/test/writeCommands.test.ts runPaint with --yes actually paints one block and commits, then restores EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\data\layouts\Route37\map.bin'
- packages/cli/test/writeCommands.test.ts runPaint rect tool paints the whole rectangle EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\data\layouts\Route38\map.bin'
- packages/server/test/dungeons.test.ts lists an empty array when no dungeons exist yet EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\.pokemap\dungeons.json'
- packages/server/test/dungeons.test.ts creates a dungeon from an explicit maps list, lists it, then deletes it EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\.pokemap\dungeons.json'
- packages/server/test/dungeons.test.ts creates a dungeon from a seedMap, computing its members via the warp BFS EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\.pokemap\dungeons.json'
- packages/server/test/dungeons.test.ts 400s a create with an unknown seedMap EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\.pokemap\dungeons.json'
- packages/server/test/dungeons.test.ts PATCHes a dungeon's name and maps, reflected in the next GET EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\.pokemap\dungeons.json'
- packages/server/test/dungeons.test.ts 400s a PATCH with an empty/whitespace-only name, without persisting it EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\.pokemap\dungeons.json'
- packages/server/test/dungeons.test.ts PATCHes only the keys present in the body, leaving the others untouched EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\.pokemap\dungeons.json'
- packages/server/test/dungeons.test.ts 404s a PATCH or DELETE for an unknown dungeon id EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\.pokemap\dungeons.json'
- packages/server/test/dungeons.test.ts 400s a create with no name EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\.pokemap\dungeons.json'
- packages/server/test/dungeons.test.ts 400s a malformed dungeon-create body instead of hanging the request EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\.pokemap\dungeons.json'
- packages/server/test/dungeons.test.ts 400s a malformed dungeon-patch body instead of hanging the request EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\.pokemap\dungeons.json'
- packages/server/test/gbcRoutes.test.ts accepts and un-accepts Route17 without moving maps, with exact PerfPlus sidecar restoration expected 500 to be 200 // Object.is equality
- packages/server/test/gbcRoutes.test.ts writes a GBC manual placement, surfaces it on GET, and restores PerfPlus's absent sidecar expected 500 to be 200 // Object.is equality
- packages/server/test/gbcRoutes.test.ts roundtrips explicit and seeded dungeons in the root sidecar, then restores exact prior bytes expected 500 to be 200 // Object.is equality
- packages/server/test/saveRoutes.test.ts paint, GET /plan shows one binary change, POST /commit actually writes it, then restores EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\data\layouts\EcruteakCity\map.bin'
- packages/server/test/saveRoutes.test.ts commit refuses (400) when the plan contains a refusal, and writes nothing EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\data\layouts\OlivineCity\map.bin'
- packages/server/test/saveRoutes.test.ts after a successful commit, the session is closed -- a later GET /plan reflects the NEW on-disk state as its own fresh baseline (zero changes again) EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\data\layouts\BlackthornCity\map.bin'
- packages/server/test/saveRoutes.test.ts a render fetched before a commit is not served stale after it, for both border keys expected 500 to be 200 // Object.is equality
- packages/server/test/signRoutes.test.ts POST /sign/add on a route with grass and a real scripts.inc succeeds, GET /plan shows one object-events insert and one text append, then restores EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\data\maps\Route29\scripts.inc'
- packages/server/test/signRoutes.test.ts POST /sign/add refuses (400) with the real guardSignWrite refusal when the derived label already exists EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\data\maps\Route30\scripts.inc'
- packages/core/test/write/corpus.test.ts paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/game EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\game\data\layouts\AzaleaTown\map.bin'
- packages/core/test/write/corpus.test.ts paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/pokeemerald EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\refs\pokeemerald\data\layouts\PetalburgCity\map.bin'
- packages/core/test/write/corpus.test.ts paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/pokefirered EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\refs\pokefirered\data\layouts\BattleColosseum_2P\map.bin'
- packages/core/test/write/corpus.test.ts paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/pokeemerald-expansion EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\refs\pokeemerald-expansion\data\layouts\PetalburgCity\map.bin'
- packages/core/test/write/corpus.test.ts paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/modern-emerald EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\refs\modern-emerald\data\layouts\PetalburgCity\map.bin'
- packages/core/test/write/corpus.test.ts paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/pokeclassic EPERM: operation not permitted, open 'C:\Programming Projects\Pokemon Game\refs\pokeclassic\data\layouts\PetalburgCity\map.bin'

## Concerns and deferred work

The requested all-green wider gate is unavailable under the current real-corpus write restrictions. Existing cross-file saves remain non-transactional, as documented in save.ts; this task adds fresh validation before any write but does not introduce transaction/rollback machinery. Mutation testing, commit and coordinator review remain pending by dispatch instruction.
