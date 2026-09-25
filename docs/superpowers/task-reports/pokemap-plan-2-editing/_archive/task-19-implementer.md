# Task 19: Extend the corpus gate to real writes -- implementer report

**Status:** DONE (fix-round applied after spec-compliance review, see "Fix-round outcome" at end)

## What I implemented

Extended `packages/core/test/write/corpus.test.ts` with four new `it.each(roots)` blocks (6 roots each = 24 new test cases), per the task spec, plus two helper functions (`profileOf`, `projFor`) and expanded imports. No production `core` code was changed -- this is a test-only diff (258 insertions / 3 deletions, one file).

1. `insertArrayElement`/`removeArrayElement` append-then-remove round-trip on every `object_events` array, across all 6 roots.
2. Same, but insert-at-index-0 (prepend) instead of append, to exercise the other end of `walkArray`'s gap bookkeeping.
3. `encodeBlocks(parseBlocks(bytes))` round-trip on every layout's `map.bin` and `border.bin`, across all 6 roots.
4. The full `paintCells` -> `planSave` -> `commitSave` funnel painting one real block on one real map, verifying exactly one binary change, restoring byte-identical.

## Deviations from the task's literal Step 6 code (all necessary; production code untouched)

The task text asserted "`planSave`/`commitSave` only ever read `proj.paths` and `proj.profile`" and specified `planSave({ paths, profile } as Parameters<typeof planSave>[0], session)`. This is **not true against current `master`**: `save.ts`'s `collectRefusals` calls `guardLayoutSave(proj, ...)`, and `guardLayoutSave`'s `idOutOfRange` helper unconditionally calls `proj.splitFor(layout)`, `proj.tileset(...)`, and `proj.constants.metatilesTotal` for every block in the layout. The literal cast would throw `TypeError: proj.splitFor is not a function` on the very first block, before any assertion ran. Likewise the task's `map: {} as EditSession["map"]` would crash inside `guardMapSave`, which dereferences `prevMap.warpEvents` unconditionally (the `_proj` parameter is unused, but `prevMap`/`nextMap` are not).

Fixes made, all documented inline in the new code:

1. **Reused the project's own existing `stubProject`/`stubTileset` helper** (`packages/core/test/helpers/stubProject.ts`, already used by `guards.test.ts` and `save.test.ts`) instead of inventing a new pattern -- this is the established convention for building a partial `Project` for guard tests, with `unused()` throwing loudly if an un-overridden field is touched.
2. **`projFor(root)`**: builds `paths`/`profile` (via `profileOf`, exactly as spec'd) and `constants` (real, via `parseFieldmapConstants(fieldmapH)` -- confirmed directly that all 6 engines, including pokeclassic, ship `include/fieldmap.h` even though pokeclassic lacks `src/data/tilesets/`) and `splitFor` (real, via `resolveSplit(layout, constants)`) for real. `tileset()` is the one deliberately permissive member: it returns `metatileCount: profile.blockMetatileIdMask + 1` for both primary and secondary, because a real per-tileset count needs the same `src/data/tilesets/headers.h`-driven path resolution `openProject` depends on, which pokeclassic (an older, asm-based fork) does not have. That sub-check (`metatile-out-of-range`) already has dedicated, hand-derived-fixture coverage in `guards.test.ts`'s "whole thesis of the project" test -- this permissive stub declines to re-litigate it while still exercising `missing-layout-version`, `border-size-mismatch`, and `warp-tile-moved` against fully real data.
3. **`map`/`originalMap`** are real `MapData`, via `parseMap()` on the real map.json text -- not `{}`.
4. **Target-map selection** additionally skips any map with a warp event sitting exactly at grid (0,0) -- painting under a stationary warp is exactly what `warp-tile-moved` exists to refuse, so avoiding it is a legitimate test-construction choice, not a weakened assertion.
5. **`paintedId`** is clamped against the real `proj.constants.metatilesTotal` ceiling (bump by 1, or decrement if that would reach/exceed the ceiling) rather than only the block mask -- this mirrors what `idOutOfRange`'s ceiling term actually resolves to once the permissive tileset stub saturates it (`Math.min(split.metatiles + (mask+1), metatilesTotal)` collapses to `metatilesTotal` in every real case measured).

All 6 roots produced **zero refusals** on the first real run with these fixes -- no clamping or map-skipping branch was empirically exercised as a fallback; they're defensive/correctness measures, not dead code (removing them would leave a real crash-or-refusal risk for engines not covered by the 6 currently configured).

## Real measured numbers per floor assertion

| Engine | map.json w/ object_events (`checked`, floor >100) | map.bin+border.bin pairs (`checked`, floor >500) |
|---|---|---|
| game (subject) | 1020 | 2040 |
| pokeemerald | 428 | 882 |
| pokefirered | 358 | 730 |
| pokeemerald-expansion | 786 | 1570 |
| modern-emerald | 463 | 928 |
| pokeclassic | 315 | 1370 |

Smallest per-root margins: object_events floor 100 vs. measured minimum 315 (pokeclassic); binary-files floor 500 vs. measured minimum 730 (pokefirered). Both floors hold with comfortable real margin on every engine, measured via a throwaway instrumented test file (created, run, then deleted -- never committed).

The pre-existing `checked`/`nestedChecked` floors (400/30) on the original two test blocks were not re-measured -- unchanged by this task.

## Test results

- `-t "insertArrayElement"`: 12/12 passed (2 blocks x 6 roots).
- `-t "encodeBlocks"`: 6/6 passed.
- `-t "paints one real block"`: 6/6 passed, first run, no refusals on any engine.
- Full `corpus.test.ts`: **37/37 passed** (1 + 6x6).
- Full `packages/core` suite: **325/325 passed** across 38 test files.
- `npm run typecheck` (whole repo, both tsconfigs): clean, no errors.

## Step 10: six-root git-status before/after proof

Ran `git status --porcelain` in each of the 6 engine roots, then ran the full `corpus.test.ts` (all 37 tests, including all 4 new funnel/binary/array-splice blocks), then re-ran `git status --porcelain` in all 6 roots again. Output was byte-identical before and after in every root:

| Root | Before == After |
|---|---|
| `C:/Programming Projects/Pokemon Game/game` (subject) | Yes -- 5 modified + 1 untracked, all pre-existing (`NavelRockZygardeChamber/map.bin`, `NavelRock_Fork/map.bin`, `layouts.json`, `NavelRock_Fork/map.json`, `NavelRock_ZygardeChamber/map.json`, `include/fieldmap.h`, `docs/human-tasks-notes.md`) -- confirmed unrelated to this task, matches the pre-flight description given at dispatch |
| `refs/pokeemerald` | Yes -- clean both times |
| `refs/pokefirered` | Yes -- clean both times |
| `refs/pokeemerald-expansion` | Yes -- clean both times |
| `refs/modern-emerald` | Yes -- clean both times |
| `refs/pokeclassic` | Yes -- clean both times |

This is real, on-disk proof (not merely an in-process assertion) that every `finally` block restore in the new funnel test, and every round-trip in the array/binary tests, actually left every file untouched on every one of the 6 real engines this project targets. Ran a second time after the full-`packages/core` suite run too, for the same result.

## Files changed

- `packages/core/test/write/corpus.test.ts` (modified -- the only file touched)

## Self-review

- **Completeness:** all 4 specified test blocks present; all exercise `it.each(roots)` across all 6 configured roots (confirmed via `--reporter=verbose` output naming each root explicitly, not just a pass count).
- **Quality:** new comments follow the file's existing voice/structure (long explanatory blocks, "--" em-dash style, specific measured numbers, no vague hand-waving).
- **Discipline:** single file touched, no production `core` code modified. The `stubProject`/`stubTileset` reuse is itself a discipline win -- it follows an established in-repo pattern (`guards.test.ts`, `save.test.ts`) instead of introducing a second ad hoc "build a Project" convention.
- **Testing:** every assertion pins a real, concrete value (exact `Buffer`/string equality, exact `metatileId`, `refusals === []`, `changes.length === 1`, `kind === "binary"`); restores are verified both in-process (`expect(readFileSync(...)).toEqual(...)` inside each test's own `finally`) and externally via the 6-root git-status proof above.

## Issues / concerns

None outstanding. The one substantive finding is the task-spec/reality mismatch on `planSave`/`commitSave`'s actual `Project` dependency surface (see "Deviations" above) -- resolved with real data wherever reachable and one narrowly-scoped, clearly-commented permissive stub (`tileset()`'s metatile count) for the one sub-check (`metatile-out-of-range`) that would otherwise require re-deriving tileset-path resolution for a fork (pokeclassic) that structurally doesn't support it -- which is exactly the class of dependency this file's own header comment already explains the whole gate exists to avoid. No production bug was found; `guards.ts`, `jsonEdit.ts`, and `blocks.ts` all behaved exactly as documented against real data on the first passing run.

## Commit

Committed as `6d6ccdd` on `master`: `test(core): extend the I5 identity-corpus gate to array splicing, binary round-tripping, and the full save funnel -- the merge gate for Plan 2`. Staged only `packages/core/test/write/corpus.test.ts` (no `git add -A`). 1 file changed, 258 insertions(+), 3 deletions(-). Verified via `git log -1 --pretty=full` that the message landed intact (no backtick shell substitution).

## Fix-round outcome (post spec-compliance review)

Review (`docs/superpowers/task-reports/pokemap-plan-2-editing/task-19-spec-review.md`, range `ead9a6c..6d6ccdd`) confirmed everything except one real blocking issue.

**Issue (§3):** target selection deterministically picked NewBarkTown for the subject root (always the first name in `map_groups.json`). `packages/core/test/load/blocks.test.ts:19-35` pins exact byte values off that same real `map.bin` ("reads NewBarkTown's real map.bin": `metatileId: 20/21/20/19/120/121`). Under vitest's default parallel-file execution, our funnel test's paint-then-restore window (~1169 `toEqual` calls between `commitSave` and the `finally` restore) races that pin -- the identical hazard the project already diagnosed and fixed twice in Task 18 (`writeCommands.test.ts` Route33->Route37, Route34->Route38, commit `5de00c0`).

**My own grep, beyond what the review scoped** (per the coordinator's instruction to check `packages/*/test/**`, not just `packages/core`): the review's fix suggestion ("add the pinned names to the skip predicate") undersold the blast radius. Walking the subject root's `map_groups.json` order past NewBarkTown, the next 6 real, resolvable candidates -- CherrygroveCity, VioletCity, AzaleaTown, GoldenrodCity, EcruteakCity, OlivineCity -- are **not all clean**: `packages/server/test/paintRoutes.test.ts` does real `paint/apply` + commit writes against CherrygroveCity, VioletCity, and GoldenrodCity; `packages/server/test/saveRoutes.test.ts` does the same against EcruteakCity, OlivineCity, and BlackthornCity. Only AzaleaTown, among the first 11 subject-root map names, has zero references anywhere in `packages/*/test/**`.

**Fix applied:**
1. Added `EXCLUDED_TARGET_NAMES` (`corpus.test.ts`, before the `describe` block) listing all 7 confirmed-colliding subject-root names (NewBarkTown + the 6 above), with an inline comment naming which file each collides with and why the set is a structural no-op for every reference root (Johto/GSC map names don't exist in the Hoenn/Kanto reference trees).
2. Wired `if (EXCLUDED_TARGET_NAMES.has(name)) continue;` into the existing target-selection loop, alongside the pre-existing warp-at-(0,0) skip.
3. Verified via a throwaway probe test (created, run, deleted) that AzaleaTown is now the picked target for the subject root, and that it has zero matches anywhere in `packages/*/test/**`.
4. Added the missing `expect(afterBlocks).toHaveLength(blocks.length)` assertion (§4.1) immediately before the pinned-id check, so a `commitSave` that silently truncated `map.bin` would now fail this test (previously the loop bound was `afterBlocks.length` itself, so truncation was invisible).
5. Re: §4.2 (unconditional `finally` rewrite of `borderPath`/`mapJsonPath`) -- confirmed by re-reading `save.ts`'s `commitSave` that this test's `border`/`map.json` are never actually written by `commitSave` at all: `session.border` is never painted (`planBorderWrite` returns `null` on an exact `encodeBlocks` match, proven by the existing round-trip test), and `session.jsonEdits`/`insertOps`/`removeOps` are all empty (`applyJsonOps` returns `session.originalMapJson` unchanged, `!==` check is false). So this concern is structurally resolved regardless of target map -- the `finally` block's border/map.json rewrites are always writing back byte-identical content that was never actually touched, on any engine, for any target. Confirmed by the pre-existing `expect(readFileSync(borderPath)).toEqual(beforeBorder)` / `expect(readFileSync(mapJsonPath, "utf8")).toBe(beforeMapJson)` assertions, which already passed on every run.

**Verification after fix:**
- `npx tsc --noEmit -p packages/core`: clean.
- `npx vitest run packages/core/test/write/corpus.test.ts -t "paints one real block"`: 6/6 passed, verbose output confirms all 6 roots.
- `npx vitest run packages/core/test/write/corpus.test.ts`: 37/37 passed.
- `npx vitest run packages/core`: 325/325 passed, 38 files.
- `npm run typecheck` (whole repo): clean.
- Step 10 six-root `git status --porcelain` before/after, captured to temp files and diffed programmatically: **identical in all 6 roots** (diff produced zero output for every root).

**Commit:** `fc0b7dc` on `master` -- `fix(core): corpus funnel test avoids maps pinned/written by other packages' tests`. Staged only `packages/core/test/write/corpus.test.ts`. 1 file changed, 33 insertions(+), 0 deletions. `git log -1 --pretty=full` confirms the message landed intact.

**New HEAD:** `fc0b7dc883dbeb40f6d8a6545602f25cf64af943`.

## Second fix-round outcome (post code-quality review)

Review (`docs/superpowers/task-reports/pokemap-plan-2-editing/task-19-code-quality-review.md`, range `ead9a6c..fc0b7dc`) independently re-verified everything from both prior rounds green (37/37, 325/325, whole-repo 673/673, `AzaleaTown` collision-free, exclusion set a no-op on reference roots) and found 2 Important issues, both in the funnel test's `finally` block, plus 4 Minor (3 left alone per the coordinator, explicitly low-priority/inherited).

**I1 (real issue):** the `finally` block unconditionally rewrote `borderPath` and `mapJsonPath` even though `commitSave` provably never touches either for this test (no json edits staged; border never painted). Zero upside, real cost: those two writes are a race surface that `EXCLUDED_TARGET_NAMES` structurally cannot protect, because the colliding readers scan the WHOLE corpus by iteration, not by map name. Reviewer found a concrete cross-root hit my own grep missed: `packages/core/test/load/maps.test.ts:44-58` parses every pokefirered `map.json` -- and pokefirered's funnel target is `BattleColosseum_2P`, whose `map.json` the old `finally` rewrote unconditionally on every run.

**Fix:** read-guarded both writes (`if (!readFileSync(borderPath).equals(beforeBorder)) writeFileSync(...)`, same pattern for `mapJsonPath` as a string comparison) -- exactly the reviewer's suggested 2-liner, matching Task 18's own `writeCommands.test.ts` precedent (restore only what was actually written). `blockdataPath`'s write stays unconditional since `commitSave` genuinely rewrites it every run. This removes 2 of 3 real write surfaces entirely in the normal (always no-op) case while still acting as a safety net if a future change ever does make `commitSave` touch either file here.

**I2:** the `EXCLUDED_TARGET_NAMES` comment read as "not in this list = safe," which is false -- the residual `map.bin` write is unavoidable (`commitSave` genuinely writes it) and still races the whole-corpus `map.bin`/`border.bin` scanners in `blocks.test.ts` and `binary.test.ts` on the subject root; they survive today only because their pins are metatileId-agnostic and `paintCells` never changes a file's length. Added a paragraph to the comment naming this second, separate hazard class explicitly, and pointing at the `finally` block's own minimal-write-surface discipline as the actual defence against it (a name-based list can never cover an iteration-based reader).

**Minor #4 (also done, cheap):** added a paragraph to `projFor`'s doc comment noting `stubProject.ts`'s OTHER un-overridden fields (`layouts: []`, `layoutByName`/`layoutById: () => undefined`, `mapNames: () => []`) are silent benign defaults, not `unused()` throwers like `splitFor`/`tileset`/`constants` -- so a future `guards.ts` change reading any of those would silently see empty data in this merge gate rather than failing loudly. Left alone per the coordinator's explicit instruction: Minor #1 (assert-in-`finally`), Minor #2 (missing `existsSync` guard on `borderPath`), Minor #3 (4 of 7 exclusion entries currently unreachable) -- all marked low-priority/inherited/harmless by the reviewer.

**Verification after fix:**
- `npx tsc --noEmit -p packages/core`: clean.
- `npx vitest run packages/core/test/write/corpus.test.ts --reporter=verbose`: 37/37, every root named under all 4 new blocks.
- `npx vitest run packages/core`: 325/325, 38 files.
- `npx vitest run` (whole repo): **673/673, 73 files** -- matches the reviewer's own independently-verified count exactly.
- `npm run typecheck` (whole repo): clean.
- Step 10 six-root `git status --porcelain` before/after, captured to temp files and diffed programmatically: identical in all 6 roots (zero diff output everywhere), captured around the full core suite and the whole-repo run together.

**Commit:** `92a85f1` on `master` -- `fix(core): funnel test restores border.bin/map.json only if actually changed, avoiding whole-corpus scanner races`. Staged only `packages/core/test/write/corpus.test.ts`. 1 file changed, 43 insertions(+), 3 deletions(-). `git log -1 --pretty=full` confirms the message landed intact.

**New HEAD:** `92a85f1119d15395b57f9cd801e8645d5fa9dbf4`.
