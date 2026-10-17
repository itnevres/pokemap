# Task 3 implementer report

Status: implemented; targeted verification passes. No commit or mutation testing performed.

## Files

- `packages/core/src/signs/marker.ts`: the single shared SignMode/SignBlock definition, FNV-1a hash, family marker formatting and parsing.
- `packages/core/src/gbc/signs.ts`: conservative sign reader, paragraph renderer, number allocation, additive insertion and guarded update/adoption.
- `packages/core/src/gbc/write/asmSplice.ts`: added replaceLines only; existing functions and comments retained.
- `packages/core/test/signs/marker.test.ts`: marker/hash tests.
- `packages/core/test/gbc/signs.test.ts`: golden, parsing, safety, real-corpus and splice tests.
- `packages/core/test/gbc/write/writeGate.test.ts`: imports and one new B7 sign case inside the existing per-root suite; existing cases unchanged.
- This report.

## Design and coordinator rulings

- R-a: update options include optional baselineHash. A marked block's hash takes precedence over the supplied baseline. An absent baseline refuses unless forced. Update re-reads current source rather than trusting the caller's potentially stale body. Missing terminators and unsupported shapes cannot be rewritten even with force.
- R-b: B7 walks all 391 subject and 388 pret maps. Each sign is inserted in memory, then addGbcEvent adds its BGEVENT_READ at (0,0), after confirming positive map dimensions. The app's parseMapEvents must return one additional bg event with the requested script and coordinates. An independent insertion-only line diff, retaining terminators, identifies nine added lines. Deleting exactly those lines must reproduce the original bytes. There is no assignment restoring the original string as the undo operation.
- R-c: both shared types live only in marker.ts; gbc/signs.ts imports them.
- Paragraphs are string[][], with para beginning a new inner array. Comments and blank lines are retained in the hashed source body. Body includes the terminator line's actual EOL when present; hashing normalizes CRLF and lone CR to LF and uses UTF-8 FNV-1a bytes.
- Unchanged paragraphs preserve the original body bytes and only insert/update the marker. Changed paragraphs render text/line/cont/para/done. Source outside that body and marker is retained.
- New blocks follow S8 exactly and refuse missing/ambiguous anchors and either script/text label collisions. replaceLines uses the first line ending for inserted lines, preserves untouched source bytes and final-newline state, and validates ranges and embedded line breaks.
- The reader supports only the specified single-jumptext shape and same-file, singly-referenced text. It strips comments outside quoted text, accounts for the three specified reference commands, and refuses unsupported commands, missing terminators, and macro definitions in candidate script/body regions.

## Tests and what they prove

`marker.test.ts` (2 tests):

- Reads both prefixes, all relevant modes, and rejects junk/invalid mode/hash/trailing metadata; verifies family-specific formatting. Catches broken prefix/mode parsing.
- Independent empty-string and hello FNV vectors, CRLF/lone-CR normalization, and changed-body distinction. Catches a constant hash or wrong hash arithmetic.

`gbc/signs.test.ts` (28 tests):

- B1: hand-written Tiny expected source with independently calculated literal hash 11eed898; exact LF output and CRLF/no-final-newline output. Expected source is not produced by the writer.
- Paragraph rendering/parsing: text, line, cont, blank line plus para, done; parsed paragraph shape and physical body line span.
- Allocation/guards: lowest unused script number, script collision, text collision, missing MapEvents refusal.
- Ten parameterized source shapes: multi-command script; script containing a macro definition; missing text label; sharing via jumptext, writetext and text_far separately; unsupported prompt; body containing a macro definition; missing done; supported quoted semicolon plus trailing comment. Each asserts the exact reason and editability.
- Adoption/hash safety: absent and wrong baselines refuse; correct baseline adopts; marker mode parses; unchanged marked update is byte-identical; edited body refuses even with a matching caller-supplied baseline; explicit force rewrites and re-hashes without duplicating the marker.
- Stale caller block: current-body changes refuse against the original baseline, and a missing terminator refuses even under force.
- Replacement boundaries: CRLF update changes only marker/body, preserves following labels, and handles a done at EOF without introducing a final newline; marker hash matches that EOF body.
- Renderer safety: empty paragraph structures, quotes, embedded newlines, @ and backslashes refuse.
- Real Route29Sign1: exact required paragraphs and unchanged adoption differs only by one inserted marker line.
- Real PerfPlus GoldenrodCityPokecenterSign: verifies the bg event references it, then confirms its jumpstd script is read-only with the required reason.
- Eight parameterized replaceLines cases: multiline LF/CRLF replacement, first-EOL selection in mixed source, tail deletion with/without final newline, EOF insertion, empty source insertion, whole-file deletion.
- Invalid splice ranges and embedded line breaks refuse.

`writeGate.test.ts` (15 tests): existing corpus presence and B1-B6 checks plus B7 on each root. B7 proves parsing and additive byte restoration on all 779 maps; existing pins are unchanged. Existing disk-write cases operate only on temp copies and retain their real-root porcelain checks.

## Red/green evidence and commands

1. Added tests before production implementation. Requested CLI command:

   `node node_modules/vitest/vitest.mjs run packages/core/test/signs/marker.test.ts packages/core/test/gbc/signs.test.ts packages/core/test/gbc/write/writeGate.test.ts`

   Failed at startup: esbuild could not read an ancestor directory/load vitest.config.ts in this sandbox. Used the dispatch-authorized Vitest Node API fallback.

2. Initial Node API run: three failed suites because marker.ts and gbc/signs.ts did not exist yet. This established missing-feature red, not a claimed assertion failure.

3. Implemented modules; first corpus run was blocked by Git dubious-ownership checks. Process-local GIT_CONFIG_COUNT / GIT_CONFIG_KEY_N / GIT_CONFIG_VALUE_N entries scoped safe.directory to the two configured corpus roots; no global Git settings were written. Then 40 tests passed, zero skipped.

4. Added macro-definition boundary tests before tightening the reader: 2 failed, 26 passed, with actual-vs-expected reason assertion failures. Fixed the reader; final targeted run passed all 45 tests.

5. An attempted warning-suppression launcher setting core.excludesFile=NUL caused Git setup failures. Removed that setting; it is not in repository code. The final successful run uses only process-local safe.directory entries. Harmless denied-access warnings for the user's Git ignore file remain.

Final targeted fallback, piped to `node --input-type=module` from the repository root:

```js
import { startVitest } from 'vitest/node';
process.env.GIT_CONFIG_COUNT = '2';
process.env.GIT_CONFIG_KEY_0 = 'safe.directory';
process.env.GIT_CONFIG_VALUE_0 = 'C:/Programming Projects/pokecrystal-PerfPlus';
process.env.GIT_CONFIG_KEY_1 = 'safe.directory';
process.env.GIT_CONFIG_VALUE_1 = 'C:/Programming Projects/Pokemon Game/refs/pokecrystal';
const ctx = await startVitest('test', [
  'packages/core/test/signs/marker.test.ts',
  'packages/core/test/gbc/signs.test.ts',
  'packages/core/test/gbc/write/writeGate.test.ts'
], { config: false, watch: false, globals: false, environment: 'node',
     setupFiles: ['packages/ui/test/setup.ts'] });
await ctx.close();
```

Result: `Test Files 3 passed (3)`; `Tests 45 passed (45)`; exit 0; duration 89.27s. No corpus tests skipped. Subject and pret GATE-STATS match existing pins.

`npm.cmd run typecheck`: both tsc invocations passed, exit 0 (run again after the final parser changes).

`git diff --check`: exit 0. All six source/test files contain only ASCII bytes. Final status shows only the six allowed source/test files plus this report.

## Broader suite and concerns

Full-suite verification used the same Node API fallback with the repository config's include, jsdom environment matching, and setupFiles, plus process-local safe.directory entries for all configured corpus roots. A custom onFinished reporter enumerated every failing test and counted leaf test states. Final result: 187 files; 2,879 passed, 40 failed, zero skipped, zero unhandled errors; exit 1. All Task 3 tests passed in this run as well. The preceding launcher attempt with the rejected NUL setting produced 2,827 passed, 40 failed and 52 skipped; the corrected final run supersedes it.

The following unrelated failures are outside the task's allowed edits. Most are explicit EPERM writes to the read-only real corpus; subprocess failures display node:os:305 errors or exit 1, and sidecar write routes return 500 instead of 200. No checks were loosened or bypassed.

`packages/cli/test/gbcCommands.test.ts` (10):

- render NewBarkTown against the real subject exits 0 and prints the stdout line
- render CeruleanCave2F against the real subject: the warning lands on stderr, never stdout
- query NoSuchMap against the real subject exits 1 with the loader's unknown-map message
- render-world against the real subject, with no --scale, exits 0 using the GBC default of 8
- every GBA-only command refuses on the real gbc root with its own named message, never touching a GBA loader
- where DUNSPARCE against the real subject exits 0 and matches runGbcWhere's own output
- 11. real process: --yes paint changes the copy; --metatile abc exits 1 with 'pokemap: '
- 12. real process, dry-run defaults: paint/diff/event add without --yes never write; --yes event add does
- 13. real process, CeruleanCave2F: dry run warns on stderr; --yes refusal keeps the size warning in stderr
- 10. event on a GBA root refuses (GBC-only)

`packages/cli/test/writeCommands.test.ts` (4, EPERM at real scripts.inc/map.bin):

- runSignAdd with --yes actually commits, then restores
- runSignAdd refuses and writes nothing when the derived label already exists, even with --yes
- runPaint with --yes actually paints one block and commits, then restores
- runPaint rect tool paints the whole rectangle

`packages/server/test/dungeons.test.ts` (11, EPERM at real .pokemap/dungeons.json):

- lists an empty array when no dungeons exist yet
- creates a dungeon from an explicit maps list, lists it, then deletes it
- creates a dungeon from a seedMap, computing its members via the warp BFS
- 400s a create with an unknown seedMap
- PATCHes a dungeon's name and maps, reflected in the next GET
- 400s a PATCH with an empty/whitespace-only name, without persisting it
- PATCHes only the keys present in the body, leaving the others untouched
- 404s a PATCH or DELETE for an unknown dungeon id
- 400s a create with no name
- 400s a malformed dungeon-create body instead of hanging the request
- 400s a malformed dungeon-patch body instead of hanging the request

`packages/server/test/gbcRoutes.test.ts` (3, 500 vs 200 on real-root sidecar writes):

- accepts and un-accepts Route17 without moving maps, with exact PerfPlus sidecar restoration
- writes a GBC manual placement, surfaces it on GET, and restores PerfPlus's absent sidecar
- roundtrips explicit and seeded dungeons in the root sidecar, then restores exact prior bytes

`packages/server/test/saveRoutes.test.ts` (4):

- paint, GET /plan shows one binary change, POST /commit actually writes it, then restores (EPERM EcruteakCity/map.bin)
- commit refuses (400) when the plan contains a refusal, and writes nothing (EPERM OlivineCity/map.bin)
- after a successful commit, the session is closed -- a later GET /plan reflects the NEW on-disk state as its own fresh baseline (zero changes again) (EPERM BlackthornCity/map.bin)
- a render fetched before a commit is not served stale after it, for both border keys (500 vs 200)

`packages/server/test/signRoutes.test.ts` (2, EPERM real scripts.inc):

- POST /sign/add on a route with grass and a real scripts.inc succeeds, GET /plan shows one object-events insert and one text append, then restores
- POST /sign/add refuses (400) with the real guardSignWrite refusal when the derived label already exists

`packages/core/test/write/corpus.test.ts` (6): the parameterized test "paints one real block on one real map, commits through the full save funnel, and restores byte-identical" fails with EPERM for each configured GBA root: game (AzaleaTown), pokeemerald (PetalburgCity), pokefirered (BattleColosseum_2P), pokeemerald-expansion (PetalburgCity), modern-emerald (PetalburgCity), pokeclassic (PetalburgCity).

Mutation checks and commit intentionally left to the coordinator, as required. No assembler check exists in this task; the G5 parser and byte checks are the required GBC gate. No unrelated production code or existing fixtures were changed.
