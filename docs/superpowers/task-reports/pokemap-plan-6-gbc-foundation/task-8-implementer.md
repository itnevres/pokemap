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
