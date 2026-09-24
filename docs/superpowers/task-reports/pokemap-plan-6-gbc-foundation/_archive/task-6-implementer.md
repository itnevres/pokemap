# Plan 6 Task 6 -- implementer report

**Status:** done, fix rounds 1-2 applied. `npm test` 960/960 green. `npm run typecheck` clean. PerfPlus (`C:\Programming Projects\pokecrystal-PerfPlus`, HEAD `81ededbe3`) porcelain empty before and after. Commits `1e675cec65d129801df644650ca0af2510e4fdc1` (initial), `df61cb8f89d5dd49db89f3b1ea0e2bcbd6f76c13` (fix round 1), `e131eb765ef2c8d1bc1053f2d293bff53be9bb3a` (fix round 2) on `plan-6-gbc-foundation`.

## Fix round 2 (code-quality review `task-6-code-quality-review.md`, I1 + M1 + M2; M3 skipped per coordinator)

- **I1 (perf, the real fix).** `resolveMapPalettes` used to reparse every shared table file (constants, `bg_tiles.pal`, `environment_colors.asm`, `roofs.pal`, `timeofday_pals.asm`, both `tileset_palettes.asm` INCLUDE tables, every special-tileset `.pal` file) on *every call* -- its own doc comment told callers to "cache anything keyed only by root," but exposed nothing cacheable. Split into exported `loadPaletteTables(root): PaletteTables` (all of that I/O + parsing, once, including eagerly preloading all 5 `SPECIAL_TILESET_LABELS` palettes + the mansion patch into `specialPalettesByTileset`/`mansionPalette`) and pure `resolveFromTables(tables, input, opts)` (the per-map logic: special-palette lookup, environment-row resolution, roof overlay -- zero file I/O). `resolveMapPalettes` is now `resolveFromTables(loadPaletteTables(root), input, opts)`.
  - **Measured** (isolated via `tsx`, outside vitest's own per-`expect()` overhead, which dominates the test's wall-clock either way and is unrelated to this fix): the old reload-per-call path (`resolveMapPalettes` x 2346) took **3747ms**; `loadPaletteTables` once (**11ms**) + `resolveFromTables` x 2346 (**4ms**) took **15ms** total -- about 250x on the actual resolve work, matching the review's "roughly two orders of magnitude" estimate. The sweep test's own vitest-reported wall-clock barely moved (~5.5s before and after) because it makes ~225,000 `expect()` calls (2346 x 8 palettes x 4 colors x 3 checks) -- that overhead predates this fix and is orthogonal to it; the test file's own comment now explains this so a future reader doesn't mistake the unchanged wall-clock for a failed optimization.
  - Updated the 391x3x2 sweep test to call `loadPaletteTables` once and `resolveFromTables` per iteration (was `resolveMapPalettes` per iteration).
- **M1.** `parseConstDefs` moved from `tileset.ts` to `asm.ts` (it outgrew being tileset-scoped once `palette.ts` reused it for the environment/palette/clock-time enums too -- three more domains). Moving it required also moving `parseNum` to `asm.ts` (it's `parseConstDefs`'s own numeric-argument parser) to avoid a circular import (`asm.ts` -> `map.ts` -> `asm.ts`) -- not requested by the coordinator directly, but a necessary consequence of the requested move. `map.ts` re-exports `parseNum` (`export { parseNum };` after importing it from `asm.js`) so its existing importers (`tileset.ts`, `palette.ts`, `map.test.ts`) needed no changes. `parseConstDefs` itself has **no** re-export shim, per the coordinator's instruction: its two production importers (`tileset.ts`, `palette.ts`) and its one test importer (`tileset.test.ts`) were all updated to import it from `asm.js` directly.
- **M2.** `findClockConstIn`'s doc comment now states its first-match-wins behavior explicitly (Map iteration order decides which constant wins if more than one appears in the scanned text), and notes both current call sites are safe because each bounds its input to a section that in practice contains exactly one clock constant.
- **M3 skipped** per the coordinator's explicit instruction (file-size/single-module split not required).

Verification: `npx vitest run packages/core/test/gbc` -- 241/241 pass (unchanged test count, confirms the `asm.ts`/`tileset.ts`/`map.ts`/`palette.ts` import moves broke nothing) before running the full 960-test suite + typecheck.

## Fix round 1 (spec review `task-6-spec-review.md`, verdict ❌ 3 issues + 2 minor)

Addressed all 3 issues + 2 minor:
1. **Constants hardcoded → parsed.** `constants/map_data_constants.asm` (environment enum `TOWN..DUNGEON`, `PALETTE_AUTO..PALETTE_DARK` enum, each isolated from neighboring enums in the same file via a new `extractConstDefBlockEndingAt` helper that walks backward from each enum's own `DEF NUM_<X> EQU` marker to the nearest preceding `const_def`), `constants/wram_constants.asm` (`MORN_F..DARKNESS_F`, and `DARKNESS_PALSET`'s `EQU` expression), `data/maps/environment_colors.asm`'s `EnvironmentColorsPointers` `dw .X` order (new `parseEnvironmentColorPointers` + `buildEnvironmentBlockMap`), and `constants/tileset_constants.asm`'s `PAL_BG_*` enum (reused `parseConstDefs` from `tileset.ts`) for the WATER/YELLOW/ROOF slot indices used in the mansion patch and roof overlay. New exports: `parseEnvironmentConsts`, `parseMapPaletteConsts`, `parseClockConsts`, `parseEnvironmentColorPointers`, `buildEnvironmentBlockMap`.
2. **BrightnessLevels now parsed, with a real pinning test.** New `parseBrightnessRows`/`parseBrightnessLevels` parse the `.BrightnessLevels:` `dc` rows (bounded to that label's own section -- the file's fade tables `.morn`/`.day`/`.nite`/`.darkness`/`.cgbfade` also use `dc`, with 12 args per line, which an unbounded scan misparsed on first attempt) and resolve each arg name via the parsed clock-const map. `.UsedFlash`'s inline broadcast and `DARKNESS_PALSET`'s `EQU` are parsed by name (`findClockConstIn`), not assumed to be NITE_F/DARKNESS_F. `resolveTimeOfDayPal`'s signature changed to take a `BrightnessLevels` + numeric `paletteIndex`/`darkPaletteIndex`/`clockIndex` instead of string switch. The one fixed-logic piece kept (documented in the function's doc comment, not parsed): column position `3 - clockIndex`, justified as coming from two immutable engine mechanisms (the `dc` macro's own bit-packing order, `macros/data.asm`, and `GetTimePalette`'s fixed AND-mask dispatch) rather than a data table a fork edits. New corpus test pins the parsed+packed bytes against `e4,55,aa,00,ff,e4,e4,e4` (hand-verified from the real `dc` lines).
3. **Corpus/mutation gaps closed.** Added RadioTower1F (RADIO_TOWER), BattleTower1F (BATTLE_TOWER_INSIDE), PokecomCenterAdminOfficeMobile (POKECOM_CENTER, both gray and water slots -- water needed because Pokecom's and BattleTowerInside's gray blocks are byte-identical, so gray alone can't distinguish them), and Route29 (ROUTE roof, group 24, same overlay as NewBarkTown's). Reviewer's M4 (RADIO_TOWER→PokeComPalette), M5 (POKECOM→BattleTowerInsidePalette), M8 (roof gated on TOWN only, dropping ROUTE) all confirmed red on the updated tests, then reverted (final file hash-verified identical to pre-mutation).
4. **Minor fixes.** Removed the unused `readFileSync`/`hasGbcProject` test imports (no more `void`-suppression) -- `readFileSync` is now genuinely used by the BrightnessLevels corpus test. Extended the 391-map sweep to `time x flash` = 3 x 2 = 2346 cases (was flash=true only).

**Two of my own transcription errors caught by real (informative) test failures during this round** -- neither was an implementation bug:
- `mansion_1.pal`'s block 6 (WATER override): I had hand-written `(15,31,31)/(05,17,31)`; the real line is `RGB 30,28,26, 17,19,31, 14,16,31, 07,07,07`. Caught in round 0, re-confirmed still correct here.
- `radio_tower.pal`'s gray block: I had assumed it matched house.pal's gray `(30,28,26)/(19,19,19)/...`; the real file (no section comments, unlike the other special `.pal` files) is `(27,31,27)/(21,21,21)/(13,13,13)/(07,07,07)` -- matching bg_tiles.pal's outdoor-day gray instead. Caught when the new RadioTower1F test failed with the implementation's (correct) output not matching my (wrong) expectation; fixed the test, not the code.

Also discovered while fixing: `pokecom_center.pal` and `battle_tower_inside.pal` have byte-identical gray/red/green blocks -- only water/yellow/brown differ. The RadioTower1F/PokecomCenterAdminOfficeMobile test pair had to be built on slots that actually differ between the real files to be mutation-effective, not just "any slot."

## Files
- `packages/core/src/gbc/load/palette.ts` (new, 360 lines) -- `resolveMapPalettes` + exported primitives (`rgb5to8`, `parsePalColors`, `parseEnvironmentColorBlocks`, `resolveEnvironmentPalette`, `resolveTimeOfDayPal`).
- `packages/core/test/gbc/load/palette.test.ts` (new, 244 lines) -- 25 tests: 13 unit (inline strings/data), 12 corpus (real repo, `itWithGbcCorpus`).

## Real fact contradicting the prompt/findings doc -- STOPPING TO FLAG

The prompt (quoting findings §3.4) claims:

> **IndoorColors (and maybe others) have only 3 rows (no dark row)** ... Coordinator measured: every real `PALETTE_DARK` map is CAVE env (Dungeon table has a dark row), so real data never hits it.

I read the real `data/maps/environment_colors.asm` at PerfPlus HEAD `81ededbe3` (the exact commit findings was measured against; verified via `git log -1`). **All four blocks -- `.OutdoorColors`, `.IndoorColors`, `.DungeonColors`, `.Env5Colors` -- have the full 4 rows (morn/day/nite/dark), including IndoorColors:**

```
.IndoorColors:
	db $20, $21, $22, $23, $24, $25, $26, $07 ; morn
	db $20, $21, $22, $23, $24, $25, $26, $07 ; day
	db $10, $11, $12, $13, $14, $15, $16, $07 ; nite
	db $18, $19, $1a, $1b, $1c, $1d, $1e, $07 ; dark
```

The findings doc's own quoted excerpt (§3.4) shows only 3 lines for IndoorColors (cutting off before the dark row) -- that excerpt is incomplete/wrong, not the real file. **No real block is short a row.** The "missing-dark-row refusal" is real defensive code (G4: refuse rather than guess) but is now pinned by a **synthetic** unit test (`resolveEnvironmentPalette` on an inline 3-row `Map`), not a corpus test, since no real file exercises it. This is noted in `palette.ts`'s own top-of-file doc comment as well.

Nothing else in the prompt/findings needed correction.

## Design

`resolveMapPalettes(root, input, opts?)` replicates `LoadMapPals` (`engine/gfx/color.asm:1197`) exactly:

1. `resolveSpecialPalette` -- special-tileset override (POKECOM_CENTER, BATTLE_TOWER_INSIDE, ICE_PATH, HOUSE, RADIO_TOWER via `SPECIAL_TILESET_LABELS` + `parseIncludes` on `engine/tilesets/tileset_palettes.asm`; MANSION via dedicated `mansionPalette`). Returns `null` (fall through) for ICE_PATH-in-INDOOR (Hall of Fame) or any non-special tileset.
2. Else `resolveEnvironmentPalette` -- environment name -> block name (`ENV_BLOCK`, a direct transcription of `EnvironmentColorsPointers`' `dw` lines, keyed by the source constant name since `GbcMap.environment` already stores that) -> row at `resolveTimeOfDayPal`'s result -> 8 indices into `bg_tiles.pal` (parsed once via `chunk4(parsePalColors(...))`, 42 palettes).
3. If environment is TOWN/ROUTE (regardless of whether step 1 or 2 ran -- confirmed by `color.asm`'s own code, which runs this unconditionally after `.got_pals`): overwrite ROOF (palette 6) colors 1-2 from `roofs.pal`'s `input.group` row, picking morn/day vs nite by `timeOfDayPal < NITE_F`.

`resolveTimeOfDayPal(mapPalette, clockIndex, flash)` collapses `.BrightnessLevels`/`ReplaceTimeOfDayPals`/`GetTimePalette` to its observable behavior (AUTO=identity, DAY/NITE/MORN=fixed, DARK=`flash ? NITE_F : DARKNESS_F`) rather than encoding the packed-nibble table -- justified in the file's doc comment; the byte-level `dc` packing (`macros/data.asm`: `(\1<<6)|(\2<<4)|(\3<<2)|\4`) was hand-verified against the jumptable's bit-extraction to confirm this reduction is exact, and it's pinned by dedicated unit tests per findings' own "your call, justify" invitation.

`Input` type is a plain `{tileset, environment, palette, group}` interface (no import of `GbcMap`) -- structurally compatible, so a real `GbcMap` passes directly (verified in every corpus test). No wrapper/overload needed.

## Path resolution (I4)

- `TilesetBGPalette` -> `bg_tiles.pal`: resolved via `parseIncludes` on `engine/gfx/color.asm` (label immediately precedes INCLUDE -- works).
- `RoofPals` -> `roofs.pal`: **hardcoded**, not resolved via `parseIncludes`. Real shape: `RoofPals:` label, then a `table_width ...` directive line, *then* `INCLUDE`. `parseIncludes`'s stacked-label scanner (`incbin.ts`) resets pending labels on any intervening line that isn't itself a label or the directive -- by design, shared with `parseIncbins`/`blocks.asm`/`gfx/tilesets.asm`, and correct for those. Extending it to tolerate `table_width` would touch shared, already-tested code for a single caller. No aliasing risk exists for this one global table (I4's actual concern is multiple names aliasing one file), so hardcoding is the smaller, safer diff. Documented inline.
- `data/maps/environment_colors.asm`: **hardcoded**. Bare `INCLUDE`, no preceding label anywhere in the engine -- nothing for `parseIncludes` to resolve.
- Special-tileset `.pal` files and `MansionPalette1`/`MansionPalette2`: resolved via `parseIncludes` on `engine/tilesets/tileset_palettes.asm` (immediate INCLUDE after each label -- works).

## Corpus test picks (all hand-derived, source lines quoted in test comments)

- **NewBarkTown** (JOHTO, TOWN, PALETTE_AUTO, group 24): day gray ($08), day water ($28, overworld-water morn/day line), day roof ($0e base + roofs.pal group-24 morn/day overlay); nite water ($29) + nite roof overlay.
- **PlayersNeighborsHouse** (TILESET_HOUSE, INDOOR): house.pal verbatim, no roof (env not TOWN/ROUTE).
- **Synthetic** `{HOUSE, TOWN, ...}`: pins the roof-over-special case. Confirmed by grep that **no real map** combines a special tileset with TOWN/ROUTE env (0 matches for `TILESET_(HOUSE|MANSION|ICE_PATH|POKECOM_CENTER|BATTLE_TOWER_INSIDE|RADIO_TOWER),\s*(TOWN|ROUTE)` in `data/maps/maps.asm`) -- matches findings' own prediction.
- **CeladonMansion1F** (TILESET_MANSION, INDOOR): pins gray (unpatched), WATER<-mansion_1 pal6, YELLOW<-mansion_2, ROOF<-mansion_1 pal8. **Caught my own transcription error here during implementation**: my first hand-read of `mansion_1.pal` block 6 (lines 31-34) was wrong (`(15,31,31)/(05,17,31)` -- I'd mentally substituted digits); the actual line is `RGB 30,28,26, 17,19,31, 14,16,31, 07,07,07`. The implementation was right the first time; the test literal was wrong and got corrected after a real (informative) test failure -- exactly the case TDD is for.
- **IcePath1F** (CAVE) vs **HallOfFame** (INDOOR): both TILESET_ICE_PATH; confirms the Hall-of-Fame exception.
- **WhirlIslandNW** (TILESET_DARK_CAVE, CAVE, PALETTE_DARK): flash true -> DungeonColors nite row ($10 gray); flash false -> dark row ($18 gray).
- **Route38EcruteakGate** (TILESET_GATE, GATE): confirms GATE resolves through IndoorColors.
- **All 391 real maps** x 3 times x flash=true: no throw, 8x4 shape, every component an integer 0-255.

## Mutation testing (performed, reverted -- `palette.ts` hash-verified identical to pre-mutation after each revert)

1. Roof applied only when `!wasSpecial` (skip roof over special palette) -> RED on the synthetic roof-over-special test (`expected {r:189,g:255,b:41}`-ish, got unpatched house roof colors).
2. Swapped `PALETTE_DAY`/`PALETTE_NITE` return values in `resolveTimeOfDayPal` -> RED (`expected 2 to be 1`).
3. `rgb5to8` reduced to `c << 3` (dropped `| (c >> 2)`) -> RED (`expected 248 to be 255`).
4. Dropped the `TILESET_ICE_PATH && environment === "INDOOR"` exception -> RED on HallOfFame test (wrong colors: ice_path.pal's gray instead of bg_tiles.pal's indoor gray).

All 4 confirmed red, then reverted; final file hash matches the pre-mutation backup.

## Self-review / concerns

- `resolveMapPalettes` is a pure read on every call, no internal cache, matching `loadGbcTileset`'s stated convention -- caller should cache shared-table parses across many maps if needed (not required by this task; 391-map corpus test re-parses every file 3x per map and still runs in ~5-6s, acceptable for a one-shot test).
- `ResolveMapPalettesOpts.time` only accepts `"morn"|"day"|"nite"` (not `"dark"`) -- matches the clock's actual 3 values (`wTimeOfDay` never reads DARKNESS_F from the RTC per findings §3.4 step 1); DARKNESS only ever arises via `PALETTE_DARK` + no-flash, which `flash` controls. This matches the spec's stated `opts` shape exactly.
- Did not implement roof **tile** substitution (Decision 6: that's Task 9's job, per-map render). This module only ever touches palette bytes.
- `parsePalColors`/`chunk4` refuse (throw) on non-positive-multiple-of-3/4 counts rather than silently truncating -- consistent with the codebase's existing G4 refusal style (`parseNum`, `splitArgsWithOffsets`, etc.).
