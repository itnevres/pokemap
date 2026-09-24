# Plan 6 Task 3 implementer report -- GBC map/layout loader

## Status
Complete. `npm test` 785/785 green (752 baseline + 33 new). `npm run typecheck` clean. PerfPlus (`C:\Programming Projects\pokecrystal-PerfPlus`) porcelain empty throughout and at end.

Note: resumed after a rate-limit cutoff. State check confirmed the working tree was clean at `d97cb07` with no persisted work -- this report covers a full redo from scratch, not a continuation of partial edits.

## Files
- `packages/core/src/gbc/model/types.ts` (edited) -- added `DataDefect`, `Connection`, `GbcMap`, `Layout`.
- `packages/core/src/gbc/load/map.ts` (new) -- `parseMapConstants`, `parseMapAttributes`, `parseMapHeaders`, `loadGbcMaps`, `loadLayout`.
- `packages/core/test/gbc/load/map.test.ts` (new) -- 33 tests (18 inline-string unit tests + temp-root join/refusal tests + 12 corpus tests, one of which asserts on 3 raw-source line counts as a vacuous-pass guard).

## Design notes
- Split `Map`/`Layout` per findings §3.6, as directed.
- Shared parsing helpers in `map.ts`: `stripComment`, `stripMacroDefs` (drops every `MACRO...ENDM` block, verified necessary because `attributes.asm`'s `connection` macro body contains a legacy `connection \1, \2, \3, (\4) - (\5)` line that is syntactically indistinguishable from a real call), `splitArgs` (comma-split, trimmed, never `\w+`), `matchCall`, `parseNum` (`$xx` hex or signed decimal). One shared implementation, not three, per the instructions.
- `parseMapHeaders` builds the `MapGroupPointers::` dw-order -> `MapGroup_X` label map first, then walks the file again tracking current group/number as it crosses `MapGroup_X:` labels. First implementation had a bug here (see Mutation/bugs below).
- `loadGbcMaps` iterates the 391 `map_attributes` entries as the canonical map list, joining to header (by name), map_const (by constName), and blocks label `${name}_Blocks` (by name). Refuses (throws, naming the map and, for the mismatch case, both group/number pairs) on any miss or group/number disagreement between `maps.asm` and `map_constants.asm`. Returns `{ maps, byName, map(name) }` -- `map()` throws naming the miss, satisfying the GBA `project.ts` refusal-style requirement directly, in addition to the plain `byName` Map the spec also asked for.
- `loadLayout` mimics `ChangeMap`: buf.length === w*h -> writable, no defects; buf.length > w*h -> first w*h bytes, one `DataDefect` naming file/actual-size/w*h, `writable: false`; buf.length < w*h -> throws (refuses to guess, no real corpus hit for this case).

## Measured pins (re-measured against PerfPlus, not assumed)
All matched the prompt/findings doc exactly:
- 391 maps, 26 groups, 142 connections total (raw grep on `attributes.asm`'s `connection ` lines showed 143 -- confirmed the +1 is the legacy call inside the `connection` macro body itself, correctly excluded by MACRO-skipping).
- 257 distinct blkPaths; 23 shared, by 157 maps total; `maps/House1.blk` x50 (also independently confirmed via Task 2's `incbin.test.ts`, which already pins this exact number).
- Border `$00` on 272/391 maps.
- NewBarkTown: group 24, number 4, 10x9, `maps/NewBarkTown.blk`, TILESET_JOHTO/TOWN/LANDMARK_NEW_BARK_TOWN/MUSIC_NEW_BARK_TOWN/FALSE/PALETTE_AUTO/FISHGROUP_OCEAN, border 5, connections west Route29/0 and east Route27/0 -- all confirmed against source.
- AzaleaTown west -> Route34, offset -18. RadioTower1F music exactly `RADIO_TOWER_MUSIC | MUSIC_GOLDENROD_CITY`.
- Every one of the 23 shared-blkPath groups agrees on width/height/tileset.
- `loadLayout` over all 391 maps (257 distinct `.blk` files, loaded once each): exactly 2 defects (CeruleanCave2F, CeruleanCaveB1), both not writable with 135 blocks; the other 255 files writable with 0 defects.
- NewBarkTown layout first 20 ids match `05 05 18 1f 19 05 05 05 05 05 05 47 1c 77 1e 05 18 19 05 05`.

No fact in the prompt/findings doc was contradicted by direct measurement.

## Bug found and fixed during TDD
`parseMapHeaders`'s first cut terminated the `MapGroupPointers::` scan on the very first non-`dw` line, which in the real file is the `table_width 2, MapGroupPointers` directive that precedes the `dw` list (real shape: label, then a comment line, then `table_width`, then the 26 `dw` lines, then `assert_table_length`). This zeroed every map's `group` field. Caught by the corpus tests (`NewBarkTown` came back `group: 0`), root-caused, and fixed by only ending the table scan on the next real label line rather than on any non-`dw` line; a `table_width`/comment-bearing variant of the earlier unit test was added to catch this shape without needing the corpus.

## Mutation checks (all reverted after confirming red)
1. Disabled `stripMacroDefs` (made it a no-op passthrough) -> 11/33 red (the legacy `connection` line inside the macro body got parsed as real, corrupting `NewBarkTown`'s and others' downstream group/number joins).
2. `parseNum` wrapped decimal branch in `Math.abs` (drops the negative sign) -> 2/33 red (AzaleaTown offset test, corpus offset-sum sanity via NewBarkTown chain).
3. Removed the group/number mismatch `throw` in `loadGbcMaps` -> 1/33 red (the dedicated temp-root mismatch-refusal test).
4. Changed the oversize branch to keep the whole buffer instead of `buf.subarray(0, expected)` -> 2/33 red (temp-root oversize test's exact-block-count assertion; corpus "2 defects, 135 blocks" test).

All four reverted; final state is the version described above, re-verified green.

## Self-review / concerns
- `loadLayout` re-reads and re-decodes a shared `.blk` file once per map that references it (no caching). Not required by the spec, and the corpus test explicitly loads each of the 257 distinct paths once (dedup by `blkPath`) rather than exercising the redundant path 391 times, so this is a deliberate no-cache choice, not an oversight. Flag if Plan 7's CLI wants memoization for interactive use.
- `connection` direction validation throws on an unrecognized direction token; the corpus has 0 violations (findings doc: "always north, south, west, east") so this refusal path is untested against real data, only against the inline unit style used elsewhere in this module (no dedicated unit test added for it, since findings guarantee 0 real hits and the mutation/mismatch coverage was prioritized per the task's explicit list). Low risk, flagging for visibility only.
- Did not memoize `loadGbcMaps`'s file reads across calls; each call re-reads and re-parses all 4 source files. Matches Task 2 precedent (`parseIncbins`/`parseBlk` are similarly call-scoped, no module-level cache).

## Commit
`feat(core): GBC map/layout loader`, SHA `5e476149d38979ce026e36e2c3676079f004655c`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` per task instructions (this run executed under Sonnet 5; trailer kept as instructed).

## Fix round 1

Spec review (`docs/superpowers/task-reports/pokemap-plan-6-gbc-foundation/task-3-spec-review.md`) found 1 blocking issue and 3 non-blocking items. All addressed:

1. **Trailing-comment test vacuous (M1 stripComment->identity survived 33/33).** Root cause: the only trailing-comment coverage was on `map_const` lines, where `parseInt`'s truncation happened to mask the missing strip. Added two tests -- a `map_attributes` line with a comment after the flags arg, and a `map` header line with a comment after the fishGroup arg -- each asserting the exact string (`"WEST"`, `"FISHGROUP_OCEAN"`), not the corrupted `"WEST ; comment"` shape. No production code change needed (comment-stripping was already correct in `matchCall`, just untested on these two call sites).
2. **Direction validation untested (M5 survived).** Added `parseMapAttributes`: `connection up, ...` -> throws, naming `up`.
3. **Join refusal, both directions + duplicates (G4).** `loadGbcMaps` was attributes-driven only: a `map_const`/header with no `map_attributes` counterpart, or a duplicate name/const in any of the three sources, was silently dropped or overwritten by `Map` construction rather than refused. Added `assertNoDuplicates` (checked for `mapConsts`, `headers`, `attributes`) and an orphan check in each direction (`mapConsts` vs attributes' constNames; `headers` vs attributes' names), all throwing before the per-map join loop runs. 5 new unit tests: orphan const, orphan header, duplicate const, duplicate header, duplicate attributes name. The duplicate-header test needed a deliberately constructed fixture (a consistent "Placeholder" map shifting `FOO_TOWN`'s `map_const` number to 2, matching the *surviving* -- i.e. last, per plain `Map` dedup -- of two duplicate `FooTown` header lines) so it fails only via the duplicate check itself, not incidentally via a masking group/number mismatch; first draft of that test would have passed for the wrong reason under the dup-check-disabled mutation.
4. **`parseNum` truncation (no NaN, no `parseInt` truncation).** Tightened to `/^\$[0-9A-Fa-f]+$/` or `/^-?\d+$/`, else throws naming the offending text. Exported for direct unit testing. 6 new tests (valid hex/decimal/whitespace-trim cases plus the 3 refusal cases named in the review: `"5 + 1"`, `"4 ;  1"`, `""`).
5. **Corpus `loadLayout` defect message.** Added `toMatch(/400/)` and `toMatch(/135/)` assertions on both real defect messages in the whole-corpus test.

### Mutation checks (fix round 1, all reverted after confirming red)
1. `stripComment` -> identity: 29/47 red (cascading, since comment-stripping is shared infrastructure; includes both new trailing-comment tests).
2. Removed the direction-validation `throw`: exactly 1/47 red (the new direction test, no collateral).
3. Removed `assertNoDuplicates` calls + both orphan-check blocks: exactly 5/47 red (all 5 new duplicate/orphan tests, no collateral) -- confirmed only after fixing the duplicate-header test's fixture per item 3 above (first attempt at that one test passed under the mutation for the wrong reason, i.e. a masking mismatch error; the finished fixture isolates it correctly).
4. Reverted `parseNum` to plain `parseInt`-based leniency: exactly 3/47 red (the 3 new refusal tests, no collateral).
5. Changed the oversize-defect message template to omit the byte counts: 2/47 red (the new corpus assertion plus one pre-existing temp-root test that also checks message content -- both correctly catch the regression).

All reverted; final state re-verified: `npm test` 799/799 green (785 + 14 new: 2 trailing-comment + 1 direction + 5 duplicate/orphan + 6 parseNum, since the corpus-message assertion was added to an existing test rather than a new one), `npm run typecheck` clean, PerfPlus porcelain empty.

## Commit (fix round 1)
`fix(core): refuse orphan/duplicate GBC map records, strict parseNum`, SHA `72ac531fa06b19030b7488922cca75b8222c006d`.

## Fix round 2

Re-review found one remaining gap: loosening `parseNum`'s hex branch (dropping the trailing `$` anchor, e.g. `/^\$[0-9A-Fa-f]+$/` -> `/^\$/`) survived all 47 tests -- nothing pinned that the hex match had to consume the *entire* token. Added 3 tests: `"$05 + 1"` (valid hex prefix, trailing junk), `"$zz"` (invalid hex digits after `$`), `"$"` (bare `$`, no digits) -- all must throw naming the text. No production change needed; the regex was already correct (fully anchored), only untested at this specific failure mode.

Mutation check: loosened the hex regex to `/^\$/` (prefix-only, no digit requirement, no end anchor) -> exactly 3/50 red (the 3 new tests, no collateral). Reverted. Re-verified: `npm test` 802/802 green, `npm run typecheck` clean, PerfPlus porcelain empty.

## Commit (fix round 2)
`test(core): pin parseNum hex-branch strictness`, SHA `bbaad404989ce256360263dc62606f36cff93d74`.

## Fix round 3

Code-quality review (`docs/superpowers/task-reports/pokemap-plan-6-gbc-foundation/task-3-code-quality-review.md`, verdict CHANGES_REQUIRED, 1 Important + 4 Minor). Addressed:

- **I1 (root guard).** `loadGbcMaps` had no `project.ts`-style root check -- a bad `--project` root would surface a bare `ENOENT` naming neither the root nor what a GBC project root looks like. Added a top-of-function `existsSync` guard on `data/maps/attributes.asm`, throwing `"${root} does not look like a pokecrystal-family project root: missing ${attributesAsm}"`, mirroring `project.ts`'s `openProject` message shape exactly (including the "first error most users will ever see" doc-comment rationale, since Task 10 will wire `--project` through to this loader the same way). Unit test via `mkdtempSync` on a genuinely empty temp root.
- **M1 (duplicated orphan-check shape).** Extracted `assertNoOrphans<T>(entries, keyFn, present, sourceFile, label)` next to `assertNoDuplicates`, replacing the two hand-written `Set`+`filter`+`throw` blocks with one-line calls.
- **M2 (root not normalized).** `loadGbcMaps` and `loadLayout` now call the existing exported `norm()` from `packages/core/src/config/paths.ts` (same helper `family.ts` already uses) before building any path, matching GBA's `project.ts` convention. Unit test constructs both a trailing-slash and an all-backslash variant of a temp root and confirms `loadGbcMaps`/`loadLayout` both still resolve correctly.
- **M3 (redundant `byName`).** Dropped `byName` from the public `LoadedGbcMaps` interface -- `maps` (enumeration) + the throwing `map()` (checked lookup) cover every need; a raw `Map.get()` would let a future caller silently reintroduce the guess-instead-of-refuse failure mode (G4/I7) this module otherwise avoids. `byName` is still built internally for `map()`'s O(1) lookup, just not exposed. Updated the one test that destructured it.
- **M5 (no direct CRLF unit test).** Added an inline `"\r\n"`-joined `parseMapConstants` test (`stripMacroDefs` already split on `/\r\n|\n/`, just untested at the unit level -- corpus coverage exercises whatever line endings PerfPlus itself uses, which happen to be LF).
- **M4 (asm-line helpers -> shared module) skipped per coordinator instruction** -- deferred to Task 5/7, the actual second caller; extracting now would be speculative (YAGNI), matching the review's own non-blocking recommendation.

3 new tests (I1 root-guard, M2 normalization, M5 CRLF); one existing test updated to stop destructuring `byName`. `npm test`: 805/805 green (802 + 3). `npm run typecheck`: clean. PerfPlus porcelain empty. No mutation checks requested for this round (structural/refusal-shape changes already covered by fix-round-1/2 mutation suite; M2's normalization is exercised by a positive test, not a refusal, so mutation-testing it would mean re-denormalizing the code, which the review didn't ask for).

## Commit (fix round 3)
`refactor(core): root guard, path normalization, drop redundant byName`, SHA `222e2f74eda480a2647c23c56cc564c67202ee3a`.
