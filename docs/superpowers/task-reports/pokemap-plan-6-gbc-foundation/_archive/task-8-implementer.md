# Plan 6 Task 8 -- GBC wild encounter loader -- implementer report

## Status
Done. `npm test` 1042/1042 green (was 1004 baseline + 38 new). `npm run typecheck` clean. PerfPlus porcelain empty before/after (read-only, verified).

## Files
- `packages/core/src/gbc/model/types.ts` -- appended wild-data types (edit, not rewrite): `GbcPercentValue`, `GbcWildSlot`, `GbcGrassEntry`, `GbcWaterEntry`, `GbcWildProbabilities`, `GbcFishRodRecord`, `GbcFishGroup`, `GbcTimeFishEntry`, `GbcTreemonRecord`, `GbcTreemonSet`, `GbcTreemonMapEntry`, `GbcWildData`, `GbcWildForMap`.
- `packages/core/src/gbc/load/encounters.ts` (new) -- all parsing + `loadGbcWildData` + `wildForMap`.
- `packages/core/test/gbc/load/encounters.test.ts` (new) -- 20 unit tests (inline fixtures) + 18 corpus tests, 38 total.

## Design
Pure parsers per file, dependency-injected ordering arrays (`groupNamesInOrder`/`setNamesInOrder`) instead of each parser re-reading constants files -- keeps `parseFishGroups`/`parseTreemonSets` testable with literal arrays; `loadGbcWildData` is the only place that reads `constants/map_data_constants.asm`/`constants/pokemon_data_constants.asm` via `parseConstDefs` (existing `asm.ts` helper) and derives the ordering with a small `orderedNames(map, prefix, excludeZero)` helper.

Grass/water block scanning is one linear cursor (`makeWildCursor`) over `codeLines(text)`, not a two-pass scanCalls-then-slice: block headers are recognized as EITHER `def_grass_wildmons MAP` (johto/kanto files) OR a bare `map_id MAP` (swarm_grass.asm's real shape -- it never uses the def_/end_ macro wrapper at all, confirmed by grep: 0 `def_grass_wildmons` lines in swarm_grass.asm, 2 bare `map_id` lines). The cursor consumes exactly the fixed slot count (1 rate + 3x7 for grass, 1+3 for water) regardless of whether `end_grass_wildmons`/`end_water_wildmons` or the outer `db -1` terminator is present -- this is what makes the missing-terminator tolerance (Decision 4) fall out for free rather than needing special-case logic: `terminated` is only set true when a top-level `db -1` line is actually seen; EOF without it just ends the loop and produces one `DataDefect`.

`labelSections(text)` is a new local helper (data-body variant of `asm.ts`'s `labelTail`): finds every `Label:`/`.Label:` line (dot-prefixed local labels included, needed for fish.asm's `.Shore_Old` etc., which `labelTail`'s own next-label regex does NOT match since it requires `[A-Za-z_]` first) and bounds each to the next label line. Stacked labels with nothing between them (`TreeMonSet_City:`/`TreeMonSet_Canyon:`) correctly share the body starting after the LAST label in the run.

`parseTreemonSets` resolves sets strictly via the `TreeMons` pointer table's `dw` order (stopping at the first non-`dw` line, which excludes the trailing "; unused" duplicate entry after `assert_table_length`), never file label order -- this is the one fact both the findings doc and this task's prompt call out explicitly (file order is City/Canyon, Town, Route, Kanto, Lake, Forest, Rock, KCity, **KRoute, KTown**; table order is ...KCITY, **KTOWN, KROUTE**). `TREEMON_SET_CITY` (index 0) is flagged `yieldsNothing: true` even though its data is real and byte-identical to Canyon's.

`wildForMap` looks up by `map.constName`/`map.fishGroup` across the four tables; fishing swarm substitution is tagged via a 2-entry `FISH_SWARM_OF` map (`FISHGROUP_QWILFISH`->`_SWARM`, `FISHGROUP_REMORAID`->`_SWARM`) and never resolved (Decision 5 -- runtime daily-flag/wFishingSwarmFlag state isn't available to a static loader).

## percent operator
Found the real definition: `macros/data.asm:23`: `DEF percent EQUS "* $ff / 100"`. So `N percent` = `floor(N * 255 / 100)` (RGBDS integer division). Verified against `macros/data.asm`'s own worked-example comment table (e.g. "50 = 20 percent - 1" -> floor(20*255/100)=51, 51-1=50 checks out). `evalPercent` supports exactly the 3 shapes that occur in the corpus: `N percent`, `N percent + k`, `N percent - k`; anything else throws naming the text. `mon_prob`/treemon-record percentages are plain integers with NO `percent` operator (measured: `probabilities.asm`'s `mon_prob 25, 0` and `treemons.asm`'s `db 50, SPEAROW, 10` are bare decimals) -- these go through `parseNum` directly, never `evalPercent`.

## Measured pins (corpus)
All measured directly against PerfPlus, not assumed:
- Defects: exactly 1 (`data/wild/kanto_grass.asm`, missing terminator + missing final newline -- confirmed via `xxd` tail read, matches findings).
- Table counts: johto_grass.asm 61, kanto_grass.asm 33, johto_water.asm 38, kanto_water.asm 24, swarm_grass.asm 2 (bare `map_id`), swarm_water.asm 0.
- Probabilities: grass 25,25,20,10,10,5,5; water 45,30,25 (matches PerfPlus's changed values, per top-matter of findings doc).
- SproutTower2F: morn slot0 = level 3 RATTATA, nite slot0 = level 3 GASTLY -- confirmed.
- 13 fish groups (FISHGROUP_SHORE..QWILFISH_NO_SWARM, NONE excluded), 22 TimeFishGroups rows, row0 = CORSOLA 20/STARYU 20.
- `.Shore_Good`: 35%/MAGIKARP 20, 70%/KRABBY 20, 90%+1/KRABBY 20, 100%/time_group 0 -- confirmed exact resolved byte values (89, 178, 230, 255).
- Every rod table's last record resolves to 255 (100 percent) -- confirmed across all 13 groups x 3 rods = 39 tables.
- TreeMonMaps 66, RockMonMaps 4 (Cianwood City, Route 40, Dark Cave Violet Entrance, Slowpoke Well B1F) -- confirmed, in that order.
- 11 treemon sets; 13 maps -> TREEMON_SET_CITY.
- Rock set = 90 KRABBY 15 / 10 SHUCKLE 15, `rare: null` (single-list set, no rare/common split).
- City/Canyon: identical `common`/`rare` data via pointer-table resolution; City `yieldsNothing: true`, Canyon `false`.
- KTOWN/KROUTE: added an explicit corpus test (not in the original ask, added after mutation testing found the gap -- see below) pinning KTown's real data (SPEAROW/FEAROW-led) on `TREEMON_SET_KTOWN` and KRoute's (HOOTHOOT-led) on `TREEMON_SET_KROUTE`, matching table order not file order.
- Every map const referenced by any wild table is a real map (0 unknown), every map's `fishGroup` resolves.
- `wildForMap(NewBarkTown)`: **contra an initial assumption in the test I first wrote** -- NewBarkTown DOES have a water wildmons entry (TENTACOOL/TENTACRUEL; it has a dock in-game), no grass, `FISHGROUP_OCEAN`, headbutt resolves to `TREEMON_SET_CITY` with `yieldsNothing: true`. Fixed the test to the measured fact rather than the guess.
- `wildForMap(Route29)`: has grass, headbutt resolves to `TREEMON_SET_ROUTE` (`yieldsNothing: false`).

## Mutation testing (all reverted, confirmed back to 38/38 green after each)
1. Grass day/nite slot order swapped -> 2 tests red (SproutTower2F unit + corpus pin). Reverted.
2. `cumulativeToPerSlot` returned raw cumulative values (no diffing) -> 2 tests red (probabilities unit + corpus). Reverted.
3. `parseTreemonSets` resolved by file label order instead of `TreeMons` pointer-table order -> **initially 0 tests red** (real gap: my corpus tests checked City/Canyon, which happen to sit at the same position in both orderings in this file, and counted "11 sets" without checking which set got which data). Added a new corpus test pinning `TREEMON_SET_KTOWN`/`TREEMON_SET_KROUTE`'s real per-set data (these are exactly the two sets file order and table order disagree on). Re-ran the mutation -- now correctly red. Reverted, confirmed green with the new test included (38 tests, up from 37).
4. Missing-terminator tolerance replaced with a throw -> 18 tests red (every corpus test that calls `loadGbcWildData`, since kanto_grass.asm always hits this path). Reverted.
5. `evalPercent`'s `floor(N*255/100)` changed to `floor(N/100)*255` (wrong operand order, mathematically different due to integer truncation) -> 8 tests red (evalPercent unit tests + fish-group corpus tests using non-trivial percentages). Reverted.

All reverts confirmed via `npx vitest run packages/core/test/gbc/load/encounters.test.ts` returning to 38/38 green before moving to the next mutation, and a final full-suite + typecheck pass after the last revert.

## Design choices / self-review
- Chose dependency-injected ordering arrays over having `parseFishGroups`/`parseTreemonSets` read their own constants files, for testability (unit tests pass literal 1-2 element arrays) and single-responsibility (`loadGbcWildData` owns all file I/O and cross-file joins).
- `wildForMap` throws (rather than returning null) only when a map's `fishGroup` constant doesn't resolve at all -- an unrecognized constant is a real data-integrity problem (G4), whereas a resolved-but-absent grass/water/headbutt/rock entry is normal (most maps have no grass, e.g. towns) and returns `null` in that slot.
- Left the type additions as a pure edit appended to the existing `types.ts` (no restructuring of prior task's types), per the reuse instruction.
- Did not add a `data/wild/` corpus test for `RockMonMaps` terminator presence or `TreeMonMaps` terminator presence as defects -- the findings doc/decisions only call out the grass/water terminator as a real, measured defect (Decision 4); treemon_maps.asm's two `db -1` terminators are both present in the real corpus and parsing doesn't depend on them (bounded by label position instead), so there's nothing to flag.

## Concerns
- None outstanding. The one real gap mutation testing caught (treemon set resolution order) was fixed by adding a corpus assertion, not by weakening the mutation -- consistent with CLAUDE.md item 6's spirit (never gut rigor to save a cheaper pass).

## Fix round 1

Fixes the 4 Issues + 2 Minor items from `task-8-spec-review.md` (commit 16fad97 vs ac3fd3e review). All changes in `packages/core/src/gbc/load/encounters.ts`, `packages/core/test/gbc/load/encounters.test.ts`, `packages/core/src/gbc/model/types.ts`.

### Issue 1 -- arg-count mismatches silently accepted

- `readSlots` (encounters.ts:129-135) now requires exactly 2 args (`args.length !== 2`), not just "level/species !== undefined". Pinned by `parseGrassFile > refuses a slot line with the wrong argument count`.
- `parseTreemonSets` (encounters.ts:409-425): after the (mandatory) common list and the optional rare list, any further non-blank body line now refuses (`"${label}: unexpected data after the rare list"`). Confirmed against the subject (`data/wild/treemons.asm`): every one of the 11 sets is exactly 1 or 2 `db -1`-terminated lists -- no 3rd list exists, so this refusal never fires on the real corpus, only on malformed input. Pinned by `parseTreemonSets > refuses a set body with data left over after the common+rare lists`.
- Minor 2 -- `cumulativeToPerSlot` (encounters.ts:253-263) now requires exactly 2 `mon_prob` args, with a named `fail()` refusal instead of a bare `Cannot read properties of undefined` TypeError. Pinned by `parseWildProbabilities > refuses a mon_prob call with the wrong argument count`.
- **Arg-count audit** (every `db`/macro-call site in the file):
  - `readSlots` (grass/water slots, 2 args) -- **was the gap**, now exact.
  - `mon_prob` (2 args) -- **was the gap**, now exact.
  - grass rate line (3 args), water rate line (1 args), grass/water block header (1 arg), `fishgroup` (4 args), `treemon_map` (2 args), `TimeFishGroups` row (4 args), treemon record (3 args) -- all were **already exact** before this fix round (each already had an explicit `!== N` check); only the file+line prefix changed for these.
  - Rod records (`toRodRecord`) accept exactly 2 args (`time_group n`) or exactly 3 args (species record); anything else (0, 1, 4+) already refused before this round -- confirmed still exact.

### Issue 2 -- unknown consts not refused

- `loadGbcWildData` (encounters.ts:527-560) now also reads `constants/map_constants.asm` via `parseMapConstants` and builds a `Set<mapConst>`. Every grass/water entry (johto/kanto/swarm) and every `treemonMaps`/`rockMonMaps` row is checked against it; an unknown map const refuses, naming the source file and 1-based line. Every `treemonMaps`/`rockMonMaps` row's `setConst` is also checked against the derived `TREEMON_SET_*` names.
- `wildForMap` (encounters.ts:591-596, via the new `resolveTreemonSet` helper) no longer does `find(...) ?? null` for a treemon/rock row's set const -- it throws `wildForMap: <mapName>: unknown treemon set "<const>"` when a row exists but doesn't resolve, matching the existing unknown-fish-group throw. A map with no treemon/rock row at all still returns `{set: null, yieldsNothing: false}` / `rock: null` (pinned by `a map with NO treemon/rock row still returns null...`), so "no row" and "bad row" stay distinguishable.
- Since `loadGbcWildData` already refuses at load time, `resolveTreemonSet`'s throw is defense-in-depth / what a hand-built `GbcWildData` exercises directly in the new unit tests (`loadGbcWildData` never itself produces the bad state `wildForMap` refuses).
- 5 new tests build a minimal, complete, hand-written `data/wild/*.asm` + `constants/*.asm` fixture tree (via `mkdtempSync`, cleaned up with `rmSync` in a `finally`) so `loadGbcWildData`'s own refusals can be exercised without touching the read-only subject decomp: a clean load, a bad grass map const, a bad treemon-row map const, a bad treemon-row set const, and a bad rock-row set const.

### Issue 3 -- refusals don't name file+line

- Added `fail(file, lineIndex | null, message): never` (encounters.ts:47-53), mirroring `events.ts`'s helper: `<file>:<lineIndex+1>: <message>` or `<file>: <message>`. Every refusal in the file now routes through it.
- Added `at(file, lineIndex, fn)` (encounters.ts:59-66): runs a location-free primitive (`evalPercent`/`parseNum`) and rethrows with the `<file>:<line>:` prefix. `evalPercent`'s own message is unchanged, as required.
- `makeWildCursor.readDb` now returns `{ lineIndex, args }` instead of bare `args`, so every caller (`readSlots`, grass/water rate lines) has a line to attribute.
- `labelSections` now also returns `bodyLineIndex` per section (`marks[j].lineIndex + 1` -- the absolute line right after the LAST label in a stacked run, since the body always starts there). `dbLinesIn(body, bodyLineIndex, file)` now returns `{ args, lineIndex }[]` with absolute file lines, not just `string[][]`.
- `labelTailText` now returns `{ text, lineIndex }` (the tail's absolute starting line); `cumulativeToPerSlot` converts `scanCalls`' tail-relative `lineIndex` to absolute via `tail.lineIndex + c.lineIndex`.
- `parseWildProbabilities`, `parseFishGroups`, `parseTreemonSets` each gained a trailing optional `file` parameter defaulting to their real repo-relative path (`"data/wild/probabilities.asm"`, `"data/wild/fish.asm"`, `"data/wild/treemons.asm"`); `loadGbcWildData` passes each explicitly. Existing call sites (unit tests) are unaffected by the new default.
- `parseTreemonMaps` gained the same `file` param (default `"data/wild/treemon_maps.asm"`), replacing the previously hardcoded string, and now routes through `fail`.
- New tests pin exact line numbers on multi-line fixtures for: a bad grass slot line (`x.asm:22:`), a bad grass rate percent (`x.asm:4:`), a bad fish rod record (`fish.asm:15:`), a bad fish `fishgroup` percent (`fish.asm:11:`), a bad `TimeFishGroups` row (`fish.asm:30:`), a bad `mon_prob` call (`probabilities.asm:9:`), a bad treemon record (`treemons.asm:10:`), and extra data after a treemon set's rare list (`treemons.asm:16:`). Every one of these line numbers was verified by running the test (not hand-trusted) before being pinned, guarding against the off-by-one class of bug that bit Task 7 (commit 61a736d).

### Issue 4 -- surviving mutations

New pins, one per surviving mutation from the review:
- **M1/M12** (`corpus > wildForMap(Route35): swarm grass is swarm_grass.asm's Yanma entry...`): asserts `grass.swarm.swarm === true`, `grass.swarm.file === "data/wild/swarm_grass.asm"`, `grass.base.swarm === false`, `grass.base.file === "data/wild/johto_grass.asm"`, and a measured species difference -- NIDORAN_M is in the swarm's morn slots but not the base entry's. (Original plan was to use YANMA, but measurement showed Route35's *base* johto_grass entry also has a YANMA slot -- NIDORAN_M is the real distinguishing species; verified by reading the subject file directly, not assumed.)
- **M2** (`corpus > the FISHGROUP_QWILFISH map's swarmVariant is FISHGROUP_QWILFISH_SWARM...`): measured that Route32 is the one FISHGROUP_QWILFISH map; asserts its `swarmVariant.constName === "FISHGROUP_QWILFISH_SWARM"` and a FISHGROUP_SHORE map's `swarmVariant === null`.
- **M8** (`corpus > 13 fish groups + NONE handled by wildForMap (called on every FISHGROUP_NONE map -- M8)...`): the existing test now actually calls `wildForMap` on every one of the 5 real `FISHGROUP_NONE` maps and asserts `fishing.group === null && fishing.swarmVariant === null`.
- **M10** (`parseGrassFile`'s `oneEntry` fixture and the DIGLETTS_CAVE corpus pin): `oneEntry`'s rate line changed from equal `2 percent, 2 percent, 2 percent` to unequal `3 percent, 4 percent, 5 percent`, and a new corpus test pins DIGLETTS_CAVE's real measured rates (raw `"4 percent"`/`"2 percent"`/`"8 percent"` -> resolved 10/5/20).
- **M9** (`parseWaterFile > tags a NON-empty swarm water table's entries swarm: true`): a unit test using the existing non-empty water fixture with `swarm=true`, since `swarm_water.asm` has 0 real entries and can never observe this at the corpus level (confirmed: mutating the loader's `swarm_water` call from `true` to `false` stays green on the full corpus suite -- exactly the review's own note that "M9 is equivalent on the corpus"). The parser-level unit test does catch the underlying defect when `parseWaterFile` itself ignores its `swarm` argument.
- Loader-level guard: `corpus > every grass/water entry's swarm flag equals file.startsWith('data/wild/swarm_')`.
- Review probe (\u26a0, doc + guard): added a doc comment on `wildForMap` explaining the concatenated Johto+Kanto search is not engine-faithful (the engine picks one regional list via `IsInJohto`) but is equivalent on this corpus, plus a corpus test (`no map const appears in more than one non-swarm grass entry...`) that guards the equivalence.

### Minor 1 -- `GbcFishGroup.biteChance` doc

`packages/core/src/gbc/model/types.ts`: changed "the roll a `Random` result must be `<=` to bite at all" to explain the engine does `cp [hl]` / `jr nc, .no_bite`, so a bite roll must be strictly **less than** `biteChance`. Left the rod-record `<=` doc (`GbcFishRodRecord`) unchanged, as instructed -- that one is correct as written.

### Mutation-check table (each applied, `encounters.test.ts` run, then reverted and confirmed back to green)

| # | Mutation | Result |
|---|---|---|
| 1 | `readSlots`: revert to `level/species === undefined` check (drop exact-2 count) | RED -- 1 test (bad grass slot line) |
| 2 | `parseTreemonSets`: drop the leftover-after-rare-list check | RED -- 1 test (extra-data-after-rare-list) |
| 3 | `cumulativeToPerSlot`: drop the `mon_prob` arg-count check | RED -- 1 test (message became a bare `Cannot read properties of undefined` TypeError, no longer the named refusal the test pins) |
| 4 | `loadGbcWildData`: remove the grass/water unknown-map-const validation loop | RED -- 1 test (bad grass map const fixture no longer throws) |
| 5 | `loadGbcWildData`: remove the treemon/rock unknown-map-const/unknown-set-const validation loop | RED -- 3 tests (bad treemon map const, bad treemon set const, bad rock set const fixtures) |
| 6 | `resolveTreemonSet`: revert to `find(...) ?? null` (drop the throw) | RED -- 2 tests (unknown treemon-row/rock-row set const no longer throws) |
| 7 | Drop the `at()` wrapper on the grass rate-line `evalPercent` calls | RED -- 1 test (message loses the `x.asm:4:` prefix) |
| 8 | Off-by-one `labelSections`'s `bodyLineIndex` (`marks[j].lineIndex` instead of `+ 1`) | RED -- 5 tests (every line-pinned fish/treemon test off by exactly 1) |
| M1 | `loadGbcWildData`: load `swarm_grass.asm` with `swarm: false` | RED -- 3 tests (Route35 pin, swarm-flag-matches-file guard, Johto/Kanto-uniqueness guard) |
| M12 | `wildForMap`'s `findGrass` ignores the `swarm` param, always returns the first grass match | RED -- 1 test (Route35 pin: `grass.swarm.swarm` is `false`, not `true`) |
| M2 | `FISH_SWARM_OF`: cross QWILFISH<->REMORAID_SWARM mapping | RED -- 1 test (QWILFISH/SHORE swarmVariant pin) |
| M8 | `wildForMap`: remove the `FISHGROUP_NONE` early-out, always look up the fish group | RED -- 5 tests (NONE-maps corpus loop + both hand-built unit tests exercising a `FISHGROUP_NONE` map) |
| M9 (loader) | `loadGbcWildData`: load `swarm_water.asm` with `swarm: false` | **GREEN** on the full corpus suite -- expected per the spec review ("M9 is equivalent on the corpus", 0 real swarm_water entries); not a gap, see the parser-level check below |
| M9 (parser) | `parseWaterFile`: hardcode `swarm: false` in the pushed entry, ignoring the `swarm` parameter | RED -- 1 test (the new non-empty-swarm-water unit test) |
| M10 | `parseGrassFile`: swap `rates.morn`/`rates.nite` (read `args[2]`/`args[0]` reversed) | RED -- 2 tests (`oneEntry` unit fixture + DIGLETTS_CAVE corpus pin) |

Every mutation except the expected loader-level M9 (explicitly corpus-equivalent, called out by the review itself and covered instead by a parser-level unit test) went red. Each was reverted and `encounters.ts` confirmed byte-identical to the pre-mutation version (`diff -q`) before moving to the next, and the full `packages/core/test/gbc` suite (346 tests) was re-confirmed green after the last revert.

### Final state

- `npx vitest run packages/core/test/gbc`: 10 files / 346 tests, all green, 0 skipped (`encounters.test.ts` alone: 61 tests, up from 38).
- `npm run typecheck`: clean.
- Full `npm test`: 793 passed, 136 skipped, 1 pre-existing failure (`corpus.test.ts > identity corpus (invariant I5) > has every reference engine available`) and 17 pre-existing failed-to-collect GBA suites (missing `C:/Programming Projects/...` on this machine) -- identical to the documented environment baseline, no new failures.
- Subject decomp (`/home/user/pokecrystal-PerfPlus`) untouched: `git status --porcelain` empty throughout and after.

## Fix round 2

Addresses `task-8-spec-review-2.md` (Opus spec re-review, c867934 vs 16fad97) and `task-8-quality-review.md` (Sonnet code-quality review), both against fix round 1 (c867934). All source changes in `packages/core/src/gbc/load/encounters.ts` and `packages/core/src/gbc/model/types.ts`; all new tests in `packages/core/test/gbc/load/encounters.test.ts`.

### A. Every refusal names file:line, no exceptions (spec Issue 1, quality I1/I2)

- Added a shared `locate(file, lineIndex)` (encounters.ts:43-46) used by both `fail` and `at`, so they can never drift on the format.
- `at<T>(file, lineIndex: number | null, fn)` now accepts `lineIndex: null` too (encounters.ts:72-78), matching `fail`'s contract, for call sites where no single line exists yet.
- Wrapped every remaining location-free call site the reviewer named:
  - `readDb`'s `splitArgs` (encounters.ts:125), `dbLinesIn`'s `splitArgs` (encounters.ts:396).
  - `matchCall` in `parseGrassFile`/`parseWaterFile` (encounters.ts:167, 214), anchored at the header's own line.
  - `scanCalls` for `mon_prob` (encounters.ts:279, anchored at the table's `labelTail` start line -- `scanCalls` has no per-call line until it returns), `fishgroup` (encounters.ts:417, anchored at `fishGroupsSection.bodyLineIndex`), and `treemon_map` (encounters.ts:550, `at(file, null, ...)` -- whole-text scan, no anchor at all, so it's file-only like a `fail(file, null, ...)`).
- Replaced the private `labelTailText` with `asm.ts`'s exported `labelTail` (encounters.ts:250-266, `getLabelTail` wrapper), confirmed a drop-in replacement by the quality review; its own `no "X:" label found` throw is now routed through `fail(file, null, ...)`, matching the `FishGroups`/`TimeFishGroups`/`TreeMons` sibling refusals.
- `fail`'s doc comment (encounters.ts:48-56) now states its actual scope precisely (quality M4): every *located* refusal goes through `fail` or `at` (which reuses `fail`'s `locate`); the one exception is `evalPercent`'s own deliberately bare throw, documented as such on `evalPercent` itself.
- Pins (one exact `^file:line:` test per distinct call-site kind, plus the required 4): a blank-arg grass slot (`x.asm:22`), a blank-arg grass/water block header (`x.asm:3` / `w.asm:3`), a blank-arg `mon_prob` call (`probabilities.asm:7`, anchored at the table start, not the bad line -- documented in the test name), a blank-arg rod record (`fish.asm:16`, precise per-line since `dbLinesIn` tracks each line), a blank-arg `fishgroup` call (`fish.asm:10`), a blank-arg `treemon_map` call (`m.asm`, file-only, no line), and the missing `GrassMonProbTable:` label (`probabilities.asm: no "GrassMonProbTable:" label found`, file-only).

### B. `toRodRecord`: `time_group` + stray extra arg (spec Issue 2)

`toRodRecord` (encounters.ts:367-378) now computes `secondArgIsTimeGroup = args.length >= 2 && /^time_group\b/.test(args[1]!)` and refuses a 3-arg record when the 2nd arg is a `time_group` reference, instead of reading it as a species record whose "species" is the literal text `"time_group 0"`. `db 100 percent, time_group 0, 5` (3 bytes where the engine reads 2 for a `time_group` reference) now refuses:
```
fish.asm:22: rod record: "100 percent, time_group 0, 5" is neither a 3-arg species record nor a 2-arg time_group reference
```
Pinned by `parseFishGroups > refuses a rod record with time_group plus a stray extra arg...`.

### C. `cumulativeToPerSlot`: count/index/monotonic/ends-at-100 (quality I3)

Measured first: `data/wild/probabilities.asm` (subject decomp) ends both `GrassMonProbTable` and `WaterMonProbTable` at `mon_prob 100, ...` -- confirmed by direct read and by the corpus test `probabilities: grass 25,25,20,10,10,5,5; water 45,30,25` (unchanged). So the "ends at 100" check never fires on real data.

`cumulativeToPerSlot` (encounters.ts:278-316) now takes `expectedCount` (`NUM_GRASS_SLOTS`/`NUM_WATER_SLOTS`, passed from `parseWildProbabilities`) and refuses:
- a wrong total count (`expected 7 "mon_prob" line(s), found 6`);
- an index outside `0..expectedCount-1` or repeated (`"mon_prob" index 4 is not a unique value in 0..6`);
- a non-decreasing violation (`"mon_prob" cumulative value 60 is less than the previous entry's 80 -- ...`);
- a table that doesn't end at cumulative 100 (`"mon_prob" table ends at cumulative 99, expected 100`).

All four pinned individually in `describe("parseWildProbabilities", ...)`. My own round-1 unit fixture (`makeWildDataRoot`'s `probabilities` string) previously ended its synthetic grass/water tables at 70 -- caught immediately by the new check (all its consumers failed until fixed); updated it to a real `...,60,100` / `...,60,100`-style table ending at 100, matching the real shape.

### D. Kill the 23 mutation survivors (spec Issue 3) + my own new-guard mutations

Added table-driven (`it.each`) and individual pins for every named ID. See the mutation table below for the full list and result. Highlights:
- **N3a-d** (map-const validation coverage): a new `it.each` in `loadGbcWildData`'s describe covers swarm grass (`map_id` header), kanto grass, all three water files, and a `RockMonMaps`-only row -- previously only johto grass and headbutt rows were pinned.
- **N6b/N7a/N8/N9(both)/N10/N11/N13/N14/N15**: added the missing "extra" or "missing" direction at each site (readSlots, `mon_prob`, treemon record, `treemon_map`, `TimeFishGroups`, `fishgroup`, grass/water headers, water rate).
- **N20**: a new stacked-label fixture (`TreeMonSet_City:`/`TreeMonSet_Canyon:` with no blank line between, the real corpus shape) with a bad record inside the shared body, pinning the exact absolute line computed from the LAST stacked label, not the first.
- **N1a/b/d/e/f/g/i/j**: a bad *value* (not a count issue) at each `at()`-wrapped site -- readSlots level, grass morn rate, water rate, `mon_prob` cumulative/index, rod chance/level, `TimeFishGroups` level, treemon percent/level.

### Mutation-check table (fix round 2)

Ran the reviewer's own `mutate.mjs` (`/tmp/.../sr2/mutate.mjs`) against the round-2 source first; 5 of its 44 exact-string patterns no longer match (BADPATTERN) because the corresponding code was refactored (options objects, the shared `locate`, `dbLinesIn`'s `codeLines`-based rewrite, `toRodRecord`'s new guard, `labelTailText`'s removal) -- each was re-verified with an equivalent hand-written mutation against the new code (see "Re-verified" rows). All other 39 patterns still applied and are RED.

| ID | Mutation | Result |
|---|---|---|
| M1 | swarm_grass loaded `swarm: false` | RED (regression re-check) |
| M2 | QWILFISH -> REMORAID_SWARM | RED |
| M8 | FISHGROUP_NONE branch removed | RED |
| M10 | grass morn/nite rate swap | RED |
| M12 | `findGrass` ignores swarm tag | RED |
| N1a | drop `at()` on readSlots parseNum | RED |
| N1b | drop `at()` on grass morn rate evalPercent | RED |
| N1c | drop `at()` on grass day rate evalPercent | RED (pre-existing pin) |
| N1d | drop `at()` on water rate evalPercent | RED |
| N1e | drop `at()` on mon_prob parseNum (both) | RED |
| N1f | drop `at()` on rod chance evalPercent | RED |
| N1g | drop `at()` on rod species level parseNum | RED |
| N1h | drop `at()` on fishgroup biteChance | RED (pre-existing pin) |
| N1i | drop `at()` on TimeFishGroups levels | RED |
| N1j | drop `at()` on treemon record parseNums | RED |
| N2/N2b | `locate` off by one (`lineIndex` not `+1`, hits `fail` and `at` together since both route through it now) | RED (52 tests) |
| N3a | skip map-const validation, swarm grass only | RED |
| N3b | skip map-const validation, all water | RED |
| N3c | skip map-const validation, kanto grass only | RED |
| N3d | skip map-const validation, rock rows only | RED |
| N4a | skip set-const validation, rock rows only | RED (pre-existing pin) |
| N4b | skip set-const validation, headbutt rows only | RED (pre-existing pin) |
| N4c | `resolveTreemonSet` -> `?? null` for rock only | RED (pre-existing pin) |
| N5 | allow a 3rd treemon list | RED (pre-existing pin) |
| N6a | readSlots allows extra args | RED (pre-existing pin) |
| N6b | readSlots allows missing args | RED |
| N7a | mon_prob allows extra args | RED |
| N7b | mon_prob allows missing args (crash path) | RED (pre-existing pin) |
| N8 | treemon record allows extra args | RED |
| N9 | treemon_map arg-count check removed (both directions) | RED (2 tests: extra + missing) |
| N10 | TimeFishGroups allows extra args | RED |
| N11 | fishgroup allows extra args | RED |
| N12 | rod record: re-verified equivalent (`args.length === 3` -> `>= 3`, since the old exact string no longer exists after the `time_group` fix) | RED |
| N13 | grass header arg-count check removed | RED |
| N14 | water rate arg-count check removed | RED |
| N15 | water header arg-count check removed | RED |
| N16 | re-verified: its target (`labelTailText`'s own lineIndex math) no longer exists -- replaced by `asm.ts`'s `labelTail`, whose lineIndex correctness is already exercised end-to-end by `events.test.ts`'s corpus test "every event's lineIndex points at a line starting with its own macro name" (391 maps). Not re-tested here; out of this file's scope. | N/A (moved to asm.ts, already covered there) |
| N17 | mon_prob lineIndex forgets tail offset | RED (pre-existing pin) |
| N18 | fishgroup lineIndex uses label line not body line | RED (pre-existing pin) |
| N19 | re-verified equivalent (`dbLinesIn`'s `bodyLineIndex + relIndex` -> `+ relIndex + 1`, since the hand-`.split` version this ID targeted was replaced by the `codeLines`-based rewrite, M6) | RED (14 tests) |
| N20 | labelSections bodyLineIndex from FIRST stacked label | RED |
| N21 | treemon_map row lineIndex off by one | RED (pre-existing pin) |
| N22 | grass entry lineIndex = rate line | RED (pre-existing pin) |
| N23 | readDb reports next line | RED (pre-existing pin) |
| N24 | mapConstNames includes everything (validation vacuous) | RED (pre-existing pin) |
| N25 | parseWaterFile ignores `swarm` (M9 parser-level) | RED (pre-existing pin) |
| A-readDb | drop `at()` around readDb's splitArgs | RED |
| A-dbLinesIn | drop `at()` around dbLinesIn's splitArgs | RED |
| A-matchCall-grass | drop `at()` around grass matchCall | RED (gap found + closed) |
| A-matchCall-water | drop `at()` around water matchCall | RED (gap found + closed) |
| A-scanCalls-monprob | drop `at()` around mon_prob scanCalls | RED |
| A-scanCalls-fishgroup | drop `at()` around fishgroup scanCalls | RED (gap found + closed) |
| A-scanCalls-treemonmap | drop `at()` around treemon_map scanCalls | RED (gap found + closed) |
| A-labelTail-fail | getLabelTail: swallow file, bare throw (no `fail()`) | RED |
| B-timegroup | toRodRecord: drop the `secondArgIsTimeGroup` guard (old buggy logic) | RED |
| C-count | drop the exact-count check | RED |
| C-uniqueness | drop the index-range/uniqueness check | RED (2 tests) |
| C-monotonic | drop the non-decreasing check | RED |
| C-ends100 | drop the ends-at-100 check | RED |

**Gap-and-close note**: my first pass at Issue A wrapped `matchCall` (grass/water headers) and `scanCalls` (fishgroup, treemon_map) in `at()` but had no test that could actually observe dropping those specific wraps -- 4 of them (`A-matchCall-grass`, `A-matchCall-water`, `A-scanCalls-fishgroup`, `A-scanCalls-treemonmap`) survived on the first mutation run. Added one blank-comma-arg pin per site (a header with a trailing comma; a `fishgroup`/`treemon_map` call with a blank middle arg), re-ran, all four went red. Final full mutation set (44 IDs, all applicable ones) has zero survivors; the source file was diffed byte-identical to its pre-mutation snapshot after every single mutation and at the end of the run.

### E. Rock-only rare list is never refused, and is now documented (spec minor)

`RockMonEncounter` (engine/events/treemons.asm) calls `GetTreeMons` then `SelectTreeMon` over `common` only -- there is no rare-list branch on the rock path. Since a `TREEMON_SET_*` set is shared data (the same row can be pointed at by both a `TreeMonMaps` and a `RockMonMaps` row), a rare list on a set referenced only by rock rows is not a data error and is not refused. Documented:
- `GbcWildForMap.rock`'s own doc (types.ts) -- callers must use `.common` only for a rock-smash encounter.
- `wildForMap`'s doc comment (encounters.ts:664-670).

No corpus case currently exercises this (`TREEMON_SET_ROCK` has `rare: null`, pinned), so no test was added beyond the existing `rare: null` pin -- this is a documentation-only fix per the review's own framing ("Consider documenting this").

### F. Quality minors

- **M4** (fail's doc overclaimed): fixed as part of Item A above -- `fail`'s doc now names its one real exception (`evalPercent`'s bare throw) instead of claiming "every refusal" unconditionally.
- **M6** (`dbLinesIn` hand-split): `dbLinesIn` (encounters.ts:388-399) now iterates `codeLines(body)` instead of `body.split(/\r\n|\n/)`, building on the same shared line-split primitive (`asm.ts`'s `splitLines`, which handles `\r\n` and a lone trailing `\r`) every other scanner in this file already uses.
- **M7** (positional boolean params): `parseGrassFile`/`parseWaterFile`'s `swarm` and `orderedNames`'s `excludeZero` are now options objects (`{ swarm?: boolean }`, `{ excludeZero?: boolean }`) instead of positional booleans defaulting to `false`. Updated every call site in `loadGbcWildData` and every test call site (`{ swarm: true }` in place of a bare `true`).
- **Skipped, by instruction**: M5 (unifying `parseGrassFile`/`parseWaterFile`'s block-scanning loop into one shared `scanWildBlocks`) and M8 (dropping the redundant explicit `file` arg at `loadGbcWildData`'s single I/O call sites, since it already matches the parameter's own default). Both are judgment calls the quality review itself flagged as non-blocking ("not blocking", "harmless... low priority"); left as-is for clarity over DRY, and because `loadGbcWildData` is the one place that legitimately owns and should spell out every real file path it reads, rather than relying on a default that happens to match.

### Final state

- `npx vitest run packages/core/test/gbc`: 10 files / 387 tests, all green, 0 skipped (`encounters.test.ts` alone: 102 tests, up from 61).
- `npm run typecheck`: clean.
- Full `npm test`: 834 passed / 136 skipped / 1 pre-existing failure (`corpus.test.ts > identity corpus (invariant I5) > has every reference engine available`) / 17 pre-existing failed-to-collect GBA suites (missing `C:/Programming Projects/...` on this machine) -- identical to the documented environment baseline, no new failures.
- Regression check (`/tmp/.../sr2/regress.ts`, whose bundled `encounters_old.ts` is the spec reviewer's copy of 16fad97 -- the original feature commit, predating both fix rounds): **0 mismatches** across every field of `loadGbcWildData`'s output and `wildForMap` on all 391 maps -- the parsed data is byte-for-byte unchanged all the way back to 16fad97; only refusal robustness, message location, and the probabilities-table validation changed across both fix rounds. Measured counts unchanged: grass 96 (61/33/2), water 62, fish groups 13, TimeFishGroups 22, treemon sets 11, tree rows 66, rock rows 4, defects = [kanto_grass], probabilities `[25,25,20,10,10,5,5]`/`[45,30,25]`.
- Subject decomp (`/home/user/pokecrystal-PerfPlus`) untouched throughout: `git status --porcelain` empty before, during (all probes/mutations ran against copies or in-memory fixtures), and after.

## Fix round 3

Addresses `task-8-spec-review-3.md` (Opus spec re-review, 6c23b23 vs c867934). The quality re-review approved round 2 with no further action. Source changes in `packages/core/src/gbc/load/encounters.ts` only (`asm.ts`, `map.ts`, `types.ts` untouched this round); all new tests in `packages/core/test/gbc/load/encounters.test.ts`.

### Required 1 -- wrong or missing line on blank-arg refusals at the 3 `scanCalls` sites

Added `scanCallLines(text, macro, file, base)` (encounters.ts:80-105): walks `codeLines(text)` one line at a time, running `matchCall` through `at(file, base + line.lineIndex, ...)` per line, instead of the old pattern of wrapping one call to `scanCalls` (which throws mid-scan, before any per-call line is known, for a blank comma-separated arg). It keeps `lineStart` (the line's own byte offset), which `parseTreemonMaps` needs to split `TreeMonMaps` from `RockMonMaps` by position -- `parseTreemonMaps` is otherwise unchanged.

Replaced all 3 `scanCalls` call sites:
- `cumulativeToPerSlot` (encounters.ts:311): `scanCallLines(tail.text, "mon_prob", file, tail.lineIndex)`.
- `parseFishGroups` (encounters.ts:482): `scanCallLines(fishGroupsSection.body, "fishgroup", file, fishGroupsSection.bodyLineIndex)`.
- `parseTreemonMaps` (encounters.ts:602): `scanCallLines(text, "treemon_map", file, 0)` -- previously `at(file, null, ...)` (no line at all); now a real absolute line, since `text` is the whole file and starts at line 0.

`matchCall` returns plain `string[]` (not `AsmArg[]`), so downstream code no longer reads `.text` off each arg (`c.args[1]!.text` -> `c.args[1]!`, etc.) -- a small simplification, not a behavior change.

Re-pinned all 3 tests at the correct line, and added a "not the first call" fixture for each of the two that previously used a single-call fixture (mon_prob's existing fixture already puts the bad line 6th of 7, not first):
- `mon_prob` blank arg: was pinned at `probabilities.asm:7` (the tail's first line); now correctly `probabilities.asm:13` (the actual bad line, the 6th of 7 `mon_prob` lines).
- `fishgroup` blank arg: was `fish.asm:10` (`bodyLineIndex`); now `fish.asm:11` (the actual line). Added a second, 2-group fixture pinning `fish2.asm:8` for a blank arg on the *second* `fishgroup` call -- the real regression case per-line anchoring exists for.
- `treemon_map` blank arg: was file-only (no line); now `m.asm:7` (the actual line, the first `TreeMonMaps` row). Added a second pin, `m.asm:8`, for a blank arg on the *second* row (`NEW_BARK_TOWN`).

### Required 2 -- pin the 5 surviving prob-table mutations

All 5 pinned in `describe("parseWildProbabilities", ...)`:
- **C2a** (index `-1`): `"mon_prob" index -1 is out of range 0..6`.
- **C2c** (index `== expectedCount`, i.e. `7` for grass): `"mon_prob" index 7 is out of range 0..6` -- the existing test used `9`, far out of range, which doesn't distinguish `>` from `>=`.
- **C4b** (table ends at `101`): `"mon_prob" table ends at cumulative 101, expected 100`.
- **C3a** (equal consecutive cumulatives, a legal 0%-chance slot): asserted **accepted**, with the mutated slot's per-slot value `0` (cumulatives `25,50,70,70,90,95,100` -> per-slot `[25,25,20,0,20,5,5]`).
- **C5** (out-of-order `mon_prob` lines): a fixture with indices 2 and 1 swapped in file order; asserted the per-slot output is still index-ordered and correct (`[25,25,20,10,10,5,5]` / `[45,30,25]`).

### Minors

1. **Dangling `time_group` reference.** `parseFishGroups` now parses `TimeFishGroups` *before* the rod tables (encounters.ts:461-506), so `toRodRecord` (encounters.ts:409-426) can take `timeFishGroupsCount` and refuse a `time_group n` reference where `n >= timeFishGroupsCount`, naming the rod record's own line -- `db 100 percent, time_group 9` with only 2 `TimeFishGroups` rows now refuses instead of loading `timeGroupIndex: 9`, a reference a consumer could only resolve to `undefined`. Pinned (`fish.asm:25: rod record: time_group 2 is out of range -- TimeFishGroups has 2 row(s)`).
2. **Count-mismatch anchor.** `cumulativeToPerSlot`'s "expected N mon_prob lines" refusal now anchors at `tail.lineIndex - 1` (the label's own line -- `labelTail`'s tail always starts exactly one line after the label, so this is exact, not approximate), consistent with `FishGroups`'/`TreeMons`' own count-mismatch refusals. Pinned: the existing "wrong number of mon_prob lines" test now expects `probabilities.asm:6` (`GrassMonProbTable:`'s own line), not `:7` (the old anchor, `table_width`'s line).
3. **Quality minor -- combined range/uniqueness message.** Split `"mon_prob" index N is not a unique value in 0..6` into two distinct messages: `"mon_prob" index N is out of range 0..{N-1}` and `"mon_prob" index N is a duplicate`. Both re-pinned (the existing duplicate-index and out-of-range-index tests now check the split wording).
4. **Quality nit -- test title/coverage mismatch.** `encounters.test.ts`'s "refuses a missing GrassMonProbTable/WaterMonProbTable label" test named both tables but only ever exercised the Grass one missing. Converted to an `it.each` exercising both: a fixture missing `GrassMonProbTable:` and a fixture missing `WaterMonProbTable:`, each with its own expected message.

### Mutation-check table (fix round 3)

Ran the spec reviewer's own `sr3/mutate_orig.mjs` (review 2's set, re-run unchanged, this time with the pristine snapshot passed as its own argv path) against the round-3 source: all 39 patterns that still matched (5 no longer match, superseded by round 2/3 refactors already documented) went RED, identical to round 2's own re-verification.

For the reviewer's `sr3/mutate3.mjs` (the new-guard set from review 2/3): its own hardcoded pristine snapshot is a fixed copy of round-2's code (from before this round's edits), and it does not take a snapshot path as an argument -- running it directly would silently overwrite my in-progress round-3 changes with that stale snapshot on both success and its own `finally`. I caught this immediately (a post-run `diff` showed the file no longer matched my round-3 pristine), restored from my own backup, and instead wrote `mutate_round3.mjs`, a self-contained script (pristine paths passed as argv, exactly like the reviewer's own `mutate_orig.mjs`) re-expressing every ID from `mutate3.mjs` against the actual round-3 source, plus new mutations for this round's own changes (`scanCallLines`'s `at()` wrap and `base` argument at all 3 call sites, the dangling-`time_group` check and its boundary, the split range/duplicate messages, the label-line count-mismatch anchor).

| ID | Mutation | Result |
|---|---|---|
| M1 | swarm_grass loaded `{swarm: false}` | RED (3) |
| M2 | QWILFISH -> REMORAID_SWARM | RED (1) |
| M8 | FISHGROUP_NONE branch removed | RED (5) |
| M10 | grass morn/nite rate swap | RED (2) |
| M12 | `findGrass` ignores swarm tag | RED (1) |
| LOC1 | `locate()` off by one (hits both `fail` and `at`) | RED (59) |
| LABELTAIL1 | `asm.ts`'s `labelTail` lineIndex +1 | RED (27, full gbc suite) |
| GETLABELTAIL1 | `getLabelTail` shifts lineIndex +1 | RED (13) |
| GETLABELTAIL2 | `getLabelTail` rethrows the bare error (no `fail()`) | RED (2) |
| DBLINES1 | `dbLinesIn` line off by one | RED (15) |
| RODREC1 | rod record `>= 3` args treated as species | RED (1) |
| SCANLINES-AT | drop the `at()` wrap inside `scanCallLines` (all 3 call sites lose their location at once) | RED (5) |
| MONPROB-BASE | `mon_prob`'s `scanCallLines` anchor -> 0 instead of `tail.lineIndex` | RED (12) |
| FISHGROUP-BASE | `fishgroup`'s `scanCallLines` anchor -> 0 instead of `bodyLineIndex` | RED (4) |
| TREEMONMAP-BASE | `treemon_map`'s `scanCallLines` anchor off by one | RED (9) |
| B1 | drop the `secondArgIsTimeGroup` guard | RED (1) |
| B2 | `time_group` guard matches only a bare `time_group` | RED (1) |
| TG1 | dangling `time_group` index check removed | RED (1) |
| TG2 | dangling `time_group` bound off by one (`>` not `>=`) | RED (1) |
| C1 | count check removed | RED (1) |
| C1a | count check allows fewer | RED (1) |
| C1b | count check allows more | **GREEN, accepted equivalent** -- 8 calls in `0..6` always trips the uniqueness check, refused at the correct line either way |
| C1c | water expected count = grass count | RED (36) |
| C1d | count refusal anchored at the tail line, not the label line | RED (1) |
| C2a | index lower bound dropped | RED (1) |
| C2b | index upper bound dropped | RED (2) |
| C2c | index upper bound off by one (`>` not `>=`) | RED (1) |
| C2d | index uniqueness dropped | RED (1) |
| C2e | index-out-of-range refusal anchored at the tail line | RED (3) |
| C2f | duplicate-index refusal anchored at the tail line | RED (1) |
| SPLITMSG | merge the range+uniqueness checks back into one combined message | RED (4) |
| C3 | monotonic check removed | RED (1) |
| C3a | monotonic made strict (refuses a legal 0% slot) | RED (1) |
| C3b | monotonic refusal anchored at the tail line | RED (1) |
| C4 | ends-at-100 removed | RED (2) |
| C4a | ends-at-100 allows `< 100` | RED (1) |
| C4b | ends-at-100 allows `> 100` | RED (1) |
| C4c | ends-at-100 line = first entry, not last | RED (2) |
| C5 | sort by index removed (file order used) | RED (1) |
| D1 | `parseGrassFile` ignores `options.swarm` | RED (4) |
| D2 | `parseWaterFile` ignores `options.swarm` | RED (1) |
| D3 | `orderedNames` ignores `excludeZero` | RED (33) |
| D4 | swarm_water loaded `{swarm: false}` (loader-level M9) | **GREEN, accepted equivalent** -- on the corpus (0 real `swarm_water.asm` entries), as accepted in rounds 1 and 2; covered at the parser level by D2/N25 (RED) |
| E1 | `dbLinesIn` stops skipping blank lines | RED (51) |

Every mutation went red except the two explicitly accepted equivalents (**C1b**, **D4**), exactly as the review named them. Both files (`encounters.ts`, `asm.ts`) were diffed byte-identical to their pre-mutation snapshots after the run, and the full `packages/core/test/gbc` suite (396 tests) was re-confirmed green afterward.

### Final state

- `npx vitest run packages/core/test/gbc`: 10 files / 396 tests, all green, 0 skipped (`encounters.test.ts` alone: 111 tests, up from 102).
- `npm run typecheck`: clean.
- Full `npm test`: 843 passed / 136 skipped / 1 pre-existing failure / 17 pre-existing failed-to-collect GBA suites -- identical to the documented environment baseline.
- Regression check (`sr3/regress.ts`, comparing against 16fad97): **0 mismatches** across every field of `loadGbcWildData`'s output and `wildForMap` on all 391 maps. Measured counts unchanged: grass 96 (61/33/2), water 62, fish groups 13, TimeFishGroups 22, treemon sets 11, tree/rock rows 66/4, defects = [kanto_grass], probabilities `[25,25,20,10,10,5,5]`/`[45,30,25]`.
- Subject decomp (`/home/user/pokecrystal-PerfPlus`) untouched throughout: `git status --porcelain` empty before, during, and after.

## Fix round 4

Addresses `task-8-spec-review-4.md` (Opus spec re-review, 5c564f1 vs 6c23b23), a narrow re-check of round 3's own two Issues, both round-3 Minors, and one new defect the review found in round 3's own fix. Source changes in `packages/core/src/gbc/load/encounters.ts` and `packages/core/src/gbc/load/asm.ts`; new tests in `packages/core/test/gbc/load/encounters.test.ts` and `packages/core/test/gbc/load/asm.test.ts`.

### Required 1 -- label-line anchor off by one at EOF

Round 3's count-mismatch fix anchored the refusal at `tail.lineIndex - 1`, assuming the tail always starts exactly one line after the label. That assumption breaks when the table's label is the file's *last* line with no trailing newline: `labelTail` then sets `tailOffset = text.length` (there is no following line to point the tail at), so `tail.lineIndex` already names the label's own line, and subtracting 1 names the line *before* it.

Fixed by deriving the label's own line independently, the same way `labelSections` already does elsewhere in this file, instead of computing it from `tail.lineIndex`:
- `getLabelTail` (encounters.ts) now also runs the label's own line-bounding regex (`^${label}:[^\n]*$`) directly against `text` and counts `\n`s before that match to get `labelLineIndex` -- correct regardless of whether the label is followed by more content, a final newline with nothing after, or nothing at all.
- `cumulativeToPerSlot` takes the enriched `ProbTail` (`LabelTail & { labelLineIndex: number }`) and anchors the count-mismatch refusal at `tail.labelLineIndex` instead of `tail.lineIndex - 1`.

Pinned both shapes: a table whose label is the file's last line with **no** trailing newline (previously reported one line too early), and the same fixture **with** a trailing newline (the companion case, to guard against a regression the other way).

### Required 2 -- zero-arg macro calls silently skipped (Minor 2, real defect)

The shared `matchCall`/`scanCalls` regex in `asm.ts` required `\s+` (one or more whitespace characters) after the macro keyword, so a bare macro invocation with no arguments and no trailing whitespace at all (`treemon_map` alone on its line) matched neither `matchCall` nor `scanCalls` and was silently excluded from the scan -- a real 3-row `RockMonMaps` would load as 2 rows with no defect and no refusal, since the missing row was simply never seen.

Fixed in `asm.ts` (touches every GBC loader that uses `matchCall`/`scanCalls`, as it's the one shared primitive):
- `matchCall`'s regex: `^\s*<keyword>\s+(.*)$` -> `^\s*<keyword>(?:\s+(.*))?$`, with `splitArgs(m[1] ?? "")` (the capture group is now optional, so it can be `undefined` on a bare call).
- `scanCalls`'s regex: same change, plus `restStart = working.length - (m[1]?.length ?? 0)` (was `m[1]!.length`, which would throw on a bare call now that the capture can be missing).

Both changes preserve exact word-boundary safety (`map` still never matches `map_const`/`map_id`/`map_attributes`, `treemon_map` never matches `treemon_maps`): the trailing `$` anchor still requires the *entire* line to be consumed by either the optional group or nothing, so a keyword that's merely a prefix of a longer identifier still fails to match at all.

**Corpus check** (required before touching a primitive this shared): grepped every `.asm` file in the subject decomp for a bare occurrence (after stripping comments, nothing but the keyword itself on the line) of every macro name any GBC loader passes to `matchCall`/`scanCalls` -- `warp_event`, `coord_event`, `bg_event`, `object_event`, `scene_script`, `callback` (events.ts); `newgroup`, `map_const`, `map_attributes`, `connection`, `map` (map.ts); `tileset`, `tilepal`, `tilecoll` (tileset.ts); `RGB`, `dc` (palette.ts); `def_grass_wildmons`, `map_id`, `def_water_wildmons`, `fishgroup`, `treemon_map`, `mon_prob` (encounters.ts). **Zero hits** for any of them -- no real file has a legitimately zero-arg call of any macro any loader scans, so this fix cannot change behavior on real data. Confirmed by the full `packages/core/test/gbc` suite staying green (404/404, including the 391-map palette/tileset/map/events corpus checks) with both `asm.ts` changes in place.

Pinned:
- `asm.test.ts`: `matchCall` and `scanCalls` both match a bare zero-arg call with an empty `args` array; the pre-existing "trailing whitespace only" shape is unaffected; word-boundary safety (`treemon_maps` never matches `treemon_map`, bare or not) is preserved.
- `encounters.test.ts`: a bare `treemon_map` row in `RockMonMaps` now refuses (`"treemon_map" has 0 argument(s), expected 2`) at its own line, instead of silently vanishing from the parsed row count.

### Required 3 / Minor 1 -- fishgroup missing-arg direction

Only the *extra*-argument direction was pinned for `fishgroup`'s arg-count check (already correctly refused; just untested in that direction). Added `refuses a fishgroup call with a MISSING argument`, a 3-arg `fishgroup` line refused at its own line (`"fishgroup" has 3 argument(s), expected 4`).

### Mutation-check table (fix round 4)

Ran the spec reviewer's own `sr4/mutate4.mjs` (which restores from `git show 5c564f1`, i.e. round 3's committed state, and is safe with respect to git but does **not** take a snapshot-path argument and has no knowledge of this round's uncommitted edits). Backed up my round-4 working files first, ran it, and restored my round-4 changes from that backup afterward (its own `finally` block would otherwise have silently left the working tree at round 3's committed state, discarding this round's edits) -- all 34 of its patterns applied against round 3's committed code and went RED (many showing extra failures from the round-4 tests already present in the test file exercising the not-yet-applied round-4 source fix, which is expected and not a signal of anything wrong).

For this round's own two fixes, wrote a self-contained `mutate_round4.mjs` (pristine paths passed as argv, same safe pattern as `mutate_round3.mjs`) covering:

| ID | Mutation | Result |
|---|---|---|
| R1-revert | revert the count-mismatch anchor to `tail.lineIndex - 1` (round 3's bug) | RED (1) |
| R1-offbyone | `labelLineIndex` computed off by one (drop the `- 1` on the `\n`-count) | RED (3) |
| R1-alias | `getLabelTail` aliases `labelLineIndex` to `tail.lineIndex - 1` instead of computing it independently (masks the bug for every shape except the one it was fixed for) | RED (1) |
| R2-matchCall-revert | `matchCall` reverts to requiring `\s+` (the pre-fix bug) | RED (2, manually confirmed with the Edit tool: both new `asm.test.ts` and `encounters.test.ts` pins fail) |
| R2-scanCalls-revert | `scanCalls` reverts to requiring `\s+` (the pre-fix bug, both the regex and the `restStart` calculation) | RED |
| R2-scanCalls-crash | `scanCalls` keeps the new optional-group regex but reverts `restStart`'s null-safety (`m[1]!.length` instead of `m[1]?.length ?? 0`) | RED (manually confirmed: throws `Cannot read properties of undefined (reading 'length')` on the new bare-call test, exactly the crash the fallback prevents) |

Every mutation went red. Both `encounters.ts` and `asm.ts` were diffed byte-identical to their pre-mutation snapshots after every mutation and at the end of the run, and the full `packages/core/test/gbc` suite (404 tests) was re-confirmed green.

### Final state

- `npx vitest run packages/core/test/gbc`: 10 files / 404 tests, all green, 0 skipped (`encounters.test.ts`: 115, up from 111; `asm.test.ts`: 23, up from 19).
- `npm run typecheck`: clean.
- Full `npm test`: 851 passed / 136 skipped / 1 pre-existing failure / 17 pre-existing failed-to-collect GBA suites -- identical to the documented environment baseline.
- Regression check (`sr3/regress.ts`, against 16fad97): **0 mismatches**, output unchanged (grass 96, water 62, fish 13, TimeFishGroups 22, sets 11, tree/rock rows 66/4, defects = [kanto_grass], probabilities `[25,25,20,10,10,5,5]`/`[45,30,25]`).
- Subject decomp (`/home/user/pokecrystal-PerfPlus`) untouched throughout: `git status --porcelain` empty before, during, and after.
