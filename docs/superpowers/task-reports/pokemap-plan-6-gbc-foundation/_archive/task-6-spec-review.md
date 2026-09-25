# Plan 6 Task 6 — spec-compliance review (commit 1e675ce)

**Verdict: ❌ ISSUES (3).** Behaviour matches the engine exactly on every real map and on a synthetic cross-product. The 3 issues are spec requirements that were not met: constants are not parsed, BrightnessLevels has no test pinning it to the file, and some tests are missing.

## Independent verification (my own code, not the implementer's)
- Scratch resolver `indep.ts` models `LoadMapPals` at byte level, with everything parsed from asm:
  - `const_def` blocks from map_data/wram/tileset constants.
  - `EnvironmentColorsPointers` `dw` list read by numeric `env & 7`. Blocks are stored as a flat ROM with label offsets, and each row is found at `+tod*8`.
  - `.BrightnessLevels` `dc` rows packed into bytes per `macros/data.asm`, then decoded by `GetTimePalette`'s bit-field extraction per clock.
  - `GetMapTimeOfDay` `and $f`, then `cp PALETTE_DARK` (the `.UsedFlash` → `NITE*$55` path, otherwise `DARKNESS_PALSET`), then `maskbits` → `& 7`.
  - Special tilesets are copied as the first 32 colours (`8 palettes`). The Mansion patch is at `PAL_BG_*` offsets.
  - Roof: `group*4 + (tod>=NITE_F ? 2 : 0)` colours, 2 colours copied into ROOF colours 1-2.
  - Map groups come from the `MapGroupPointers` order in `data/maps/maps.asm`, not from the repo loader.
- Parsed BrightnessLevels bytes are `e4,55,aa,00,ff,e4,e4,e4`. The AUTO row is identity, DAY/NITE/MORN rows are constant, and the DARK row is `ff` but is never reached because `cp PALETTE_DARK` branches before the table. `wMapTimeOfDay` is already masked `and $f` (`home/map.asm` GetMapTimeOfDay), so the phone-service nibble cannot defeat `cp PALETTE_DARK`. **The implementer's reduction is correct.**
- **391 real maps × {morn, day, nite} × flash {T, F} = 2346 comparisons: 0 mismatches** (every one of the 32 colours compared exactly).
- **Synthetic cross-product: 7 tilesets (JOHTO + 6 specials) × 7 envs × 5 PALETTE_* × groups {0, 1, 13, 24, 26} × 3 times × 2 flash = 7350 comparisons: 0 mismatches.** This covers ENVIRONMENT_5, roof over every special tileset, and ICE_PATH in every env.
- The repo `loadGbcMaps` fields (tileset, env, palette, group) match my maps.asm parse for all 391 maps (0 diffs).
- Environment/palette combinations present in the corpus:
  - No TOWN or ROUTE map uses a special tileset, so roof-over-special can only be synthetic, as the implementer said.
  - The only special tileset outside INDOOR is ICE_PATH in CAVE (5 maps). HallOfFame is ICE_PATH in INDOOR.
- Clock: `engine/rtc/rtc.asm` `TimesOfDay` only produces MORN/DAY/NITE. DARKNESS comes only from PALETTE_DARK without flash, so the `time` option does not need a `dark` value ✅.

## Hand-verified against raw lines
| Map | Check | Result |
|---|---|---|
| NewBarkTown day (maps.asm:497, TOWN, AUTO; `dw MapGroup_NewBark ; 24` at maps.asm:43) | Row `db $08,$09,$0a,$28,$0c,$0d,$0e,$0f`. Output = bg_tiles.pal lines 12, 13, 14, 52 (`23,23,31, 18,19,31, 13,12,31, 07`), 16, 17, 18 with colours 1-2 = roofs.pal:98 `20,31,14, 11,23,05`, then 19 | ✅ all 32 colours |
| CeladonMansion1F (maps.asm:438, MANSION, INDOOR, group 21) | Slots 0,1,2,5,7 = mansion_1 palettes 0,1,2,5,7. Slot 3 = m1 palette 6 `30,28,26/17,19,31/14,16,31/07`. Slot 4 = mansion_2 `25,24,23/20,19,19/14,16,31/07`. Slot 6 = m1 palette 8 `05,05,16/08,19,28/00/31`. INDOOR, so no roof | ✅ |
| Route38EcruteakGate (maps.asm:58, GATE, DAY) | IndoorColors day `$20..$26,$07` = bg_tiles lines 42-48, then line 9 (morn text) | ✅ |

## Mansion patch, re-read byte by byte (`engine/tilesets/tileset_palettes.asm`)
1. `ld bc, 8 palettes` copies `MansionPalette1` (palettes 0-7) → wBGPals1.
2. `wBGPals1 palette PAL_BG_YELLOW` (4) ← `MansionPalette2`, `1 palettes`.
3. `PAL_BG_WATER` (3) ← `MansionPalette1 palette 6`, `1 palettes`.
4. `PAL_BG_ROOF` (6) ← `MansionPalette1 palette 8`, `1 palettes`.

mansion_1.pal has 36 RGB lines (9 palettes). Constants are in `tileset_constants.asm:50-57`. The implementation (`pals[4]=m2; pals[3]=m1[6]; pals[6]=m1[8]`) matches ✅. My mutation M7 (m1[6]→m1[5]) is killed.

## Spec items
| Item | Status | Evidence |
|---|---|---|
| `resolveMapPalettes(root, {tileset, environment, palette, group}, {time='day', flash=true})` → 8×4 RGB, 8-bit | ✅ | palette.ts. Defaults are day/true |
| Special override: 6 tilesets, ICE_PATH skipped when env is INDOOR, MANSION real patch | ✅ | Matches the asm and the 7350-case synthetic check. Env is compared by name (`=== "INDOOR"`), which is equivalent to `and $7; cp INDOOR` for names |
| Env row → 8 `bg_tiles.pal` indices | ✅ | 0 mismatches |
| Roof overwrite of palette 6 colours 1-2, +4 bytes when timeOfDayPal ≥ NITE_F, applied on top of special palettes too | ✅ | `timeOfDayPal < NITE_F ? mornDay : nite`, applied after special. M1 and M10 are killed |
| timeOfDayPal = BrightnessLevels; DARK + flash → NITE | ✅ behaviour | See the independent derivation above |
| 5→8 bit `(c<<3)\|(c>>2)` | ✅ | `rgb5to8`, unit-pinned 0/31/16 |
| **Env/time/PALETTE_* constants parsed from real constant files, not hardcoded** | ❌ | See issue 1 |
| **BrightnessLevels parsed, or hardcoded with a test pinning it to the file** | ❌ | See issue 2 |
| Paths via `parseIncludes` where practical (I4) | ⚠️ acceptable | bg_tiles and special .pal files go through `parseIncludes` ✅. `roofs.pal` is hardcoded; the stated reason is confirmed (`RoofPals:` / `table_width …` / `INCLUDE` at color.asm:1310-1312). `environment_colors.asm` is a bare INCLUDE (color.asm:1296), so hardcoding is fine. No aliasing risk for either |
| G4 refusal when a row is missing | ✅ / ⚠️ | All 4 blocks have 4 rows, so the refusal can only be tested synthetically. It is pinned by the synthetic 3-row test and is sensible: the engine would overrun into the next block. ⚠️ No length check on a row (must be 8 indices) or on a special .pal (must be exactly 8 palettes, or ≥8 and truncated). A short row or file returns fewer than 8 palettes instead of refusing, and a longer .pal returns more than 8 where the engine copies exactly 64 bytes. Not reachable with real data |
| Shared tables parsed once per call | ✅ | Each file is read at most once per call |
| Unit tests: RGB 1 and 4 triples per line, 5→8, row refusal, BrightnessLevels mapping | ✅ (BrightnessLevels is behaviour only, see issue 2) | |
| Corpus tests: NewBark day/nite with water $28/$29 and roof group 24, HOUSE, roof-over-special (synthetic), MANSION, ICE_PATH INDOOR vs CAVE, DARK flash T/F, GATE, 391 maps × 3 times (guard 391) | ✅ | 25/25 run and pass in the verbose run (not skipped). The 391 test takes 4.3 s |
| Mutation strength | ❌ | See issue 3 |

## Issues
1. ❌ **Constants are hardcoded, which the spec prohibits.**
   - `ENV_BLOCK` transcribes the `EnvironmentColorsPointers` `dw` table, keyed by env name. `resolveTimeOfDayPal` switches on the `PALETTE_*` names. `MORN_F`, `DAY_F`, `NITE_F` and `DARKNESS_F` are literals 0-3. `ROOF` is the literal index 6.
   - Keying by name loses nothing on the current data. The `unused` index 0 entry is never reachable because envs start at `const_def 1`, and `and 7` is a no-op for 1-7.
   - A parse would still be **materially safer on a fork**, and the subject is a fork (PerfPlus). If a fork edits the `dw` table (e.g. remaps GATE), a BrightnessLevels row, or the order of the `const` lists, the current code ignores the change silently. A parser picks it up.
   - The fix is small: parse `dw .X` lines in order, index them with the env value from `const_def 1`, and parse the `PALETTE_*` and `*_F` consts. My `indep.ts` does all of this in about 25 lines.
2. ❌ **BrightnessLevels is hardcoded and nothing pins it to the file.**
   - The spec requires a pinning test if the table is hardcoded. The only tests are behaviour unit tests with literal inputs.
   - The doc comment in palette.ts says "see the corpus BrightnessLevels test for the byte-level pin". **No such test exists** (grep of `packages/core/test` finds only the `describe` title at palette.test.ts:89).
   - Fix: parse the 8 `dc` rows plus the `.UsedFlash`/`DARKNESS_PALSET` path, or add a corpus test asserting the parsed `dc` bytes equal `e4,55,aa,00,…` and that the reduction holds.
3. ❌ **Test gaps let regressions on real data survive.** These are my own mutations, each reverted:
   | # | Mutation | Result |
   |---|---|---|
   | M1 | Roof threshold `<` → `<=` | killed (1) |
   | M2 | Roof `group - 1` | killed (3) |
   | M3 | ICE_PATH exception INDOOR → GATE | killed (1) |
   | **M4** | **RADIO_TOWER → PokeComPalette** | **survives** |
   | **M5** | **POKECOM → BattleTowerInsidePalette** | **survives** |
   | M6 | TOWN → DungeonColors (water $28 lost) | killed (4) |
   | M7 | Mansion WATER m1[6] → m1[5] | killed (1) |
   | **M8** | **Roof applied only for TOWN (ROUTE dropped)** | **survives** |
   | M9 | Special palette truncated to 7 | killed (1) |
   | M10 | Roof writes colours 0-1 | killed (3) |

   - The special-tileset label table is pinned only for HOUSE, MANSION and ICE_PATH. RADIO_TOWER (6 real maps), POKECOM_CENTER (1) and BATTLE_TOWER_INSIDE (4) have no pin.
   - The ROUTE branch of the roof overlay has no pin, although 54 real ROUTE maps use it.
   - The 391-map test only checks that values are valid integers, so it cannot catch any of these.
   - Fix: add one corpus assertion each for a RADIO_TOWER map, a BATTLE_TOWER_INSIDE map and PokecomCenterAdminOfficeMobile (quoting the .pal line), plus one ROUTE map roof assertion (e.g. Route29, group 24).

## Minor (not counted)
- ⚠️ The test file imports `readFileSync` and `hasGbcProject` without using them and suppresses the warnings with `void`. They should be removed, not voided.
- ⚠️ The 391-map test runs only with flash=true. Flash=false is covered only by WhirlIslandNW. My 2346-case check covers both.

## Commands
- `npm test`: 82 files / 944 tests pass. `npm run typecheck`: clean.
- Verbose `palette.test.ts`: 25/25 ✓, none skipped.
- Mutations were run on a copy and restored. PokeMap `git status --porcelain` shows only the untracked reports. pokecrystal-PerfPlus porcelain is empty.
- Scripts are in the scratchpad: `indep.ts` (independent resolver + comparison) and `hand.ts` (5-bit dump).

---

# Re-review 1 (df61cb8, `git diff 1e675ce df61cb8 -- packages`)

**Verdict: ✅ SPEC COMPLIANT.** All 3 issues are closed. Behaviour is unchanged: my independent resolver still finds 0 mismatches.

| Asked | Status | Evidence |
|---|---|---|
| Parse the env `dw` table and the env consts | ✅ | `parseEnvironmentColorPointers` collects `dw .X` lines in source order. `parseEnvironmentConsts` isolates the `const_def 1` block ending at `NUM_ENVIRONMENTS`. `buildEnvironmentBlockMap` indexes by numeric value and refuses an index outside the table. `ENV_BLOCK` is deleted. M12 (pointer off-by-one) is killed (3 tests) |
| Parse PALETTE_* and *_F consts | ✅ | `parseMapPaletteConsts` and `parseClockConsts` isolate each block by its `DEF NUM_*` end marker. `requireConst` refuses unknown names. `CLOCK_OPTION_CONST_NAME` maps the option to a const name only, never a value |
| ROOF (and WATER/YELLOW) from PAL_BG_* | ✅ | `parseConstDefs(tileset_constants.asm)` feeds `palBg`, which is used by the Mansion patch and the roof overlay. M14 (roof → yellow slot) is killed (4 tests) |
| Parse BrightnessLevels `dc` rows and the UsedFlash path | ✅ | The `.BrightnessLevels` section is bounded to the next label, so the fade-table `dc` lines are excluded. Each row must have 4 args, resolved by const name. The flash value comes from the `.UsedFlash` section and the no-flash value from the `DEF DARKNESS_PALSET` line. `3 - clockIndex` is the only fixed logic, and it is justified: `dc` packs the first arg into the high bits and `GetTimePalette` reads bits `2c..2c+1`, which matches my derivation. The `cp PALETTE_DARK` check comes before the table, and `& 7` is omitted, which is equivalent because values are < 8. M11 (`col=c`) is killed (4 tests). M13 (flash swap) is killed (3 tests) |
| Pinning test | ✅ | The corpus test packs the parsed rows and asserts `e4,55,aa,00,ff,e4,e4,e4`, which matches my independent decode |
| Stale doc comment | ✅ | Rewritten. The test it references now exists |
| Corpus pins: RADIO_TOWER, BATTLE_TOWER_INSIDE, PokecomCenterAdminOfficeMobile, ROUTE roof | ✅ | I checked every quoted line against the files: radio_tower.pal:1-4 gray `27,31,27`; battle_tower_inside gray; pokecom_center.pal:17-20 water `17,19,31/14,16,31`, which differs from battle_tower_inside:17-20 `15,16,31/09,09,31`; Route29 is at maps.asm:496, ROUTE, group 24. **M4, M5 and M8 are all killed now (1 test each)** |
| Unused imports removed | ✅ | The `void readFileSync` / `void hasGbcProject` lines and the `hasGbcProject` import are gone. `readFileSync` is now used |
| 391 sweep includes flash=false | ✅ | 391 × 3 × 2 = 2346 cases, run for 8.5 s, not skipped |

**Re-run results**
- `indep.ts`: 391 real maps 2346 cases, 0 mismatches. Synthetic 7350 cases, 0 mismatches. Loader field diffs: 0.
- `npm test`: 82 files / 960 tests pass. `palette.test.ts`: 41/41 ✓ in the verbose run. `npm run typecheck`: OK.
- Mutations were run on a copy and restored. PokeMap has only untracked reports. pokecrystal-PerfPlus porcelain is empty.

**Residual minors (not counted):**
- No check that a special .pal has exactly 8 palettes, or that an env row has 8 indices (G4). Real data cannot trigger either.
- `findClockConstIn` returns the first clock name it finds in the text. Correct for real data, but ambiguous if a fork mixed names in `.UsedFlash`.
