# Plan 6 Task 9 spec-compliance review: GBC per-map renderer

- Reviewed: worktree `/home/user/pokemap/.claude/worktrees/agent-a5471bd90c343f9d4`, branch `worktree-agent-a5471bd90c343f9d4`, commit `494380f` (on `5e453f1`).
- Subject: `/home/user/pokecrystal-PerfPlus` @ `81ededbe3`. It was only read; `git status --porcelain` is empty at the end.
- Binding inputs: `task-9-spec.md`; findings §3.4 steps 4-5, §Extra Border, Decisions 3/6, "Consequences → Task 9".
- I did not rely on the implementer's report. Every pixel, count and roof claim below was re-derived independently: a from-scratch Python PNG decoder (zlib plus unfilter, shade = 3 − gray), `od` on the `.blk`/`_metatiles.bin`, and direct parsing of the asm/pal sources.

## Verdict: ❌ ISSUES (4)

The renderer itself is correct. All 7 corpus pixel pins, the roof claims, the border semantics and the corpus facts check out against my own derivations. The four issues are test-coverage gaps. Each one leaves a spec requirement unpinned, and each has a surviving mutation to show it. Beyond those four, one explicit spec doc-comment is missing (Issue 4). Every fix is small.

---

## Verification run (worktree)

| Gate | Result |
|---|---|
| `npx vitest run packages/core/test/gbc` | **12 files / 363 tests passed, 0 skipped** (map.test.ts 27, roofs.test.ts 13) |
| `npm run typecheck` | clean (both `tsc --noEmit` passes) |
| Full `npm test` | not re-run. The GBA-suite failures there are environmental, per the brief. |
| Subject repo untouched | `git -C pokecrystal-PerfPlus status --porcelain` is empty |
| Worktree after mutation testing | `git diff` shows only the pre-existing, uncommitted local `pokemap.config.json` (`gbc.projectPath`). All source files are byte-identical to `494380f`. |

## Per-deliverable table

| # | Deliverable (spec) | Status | Evidence |
|---|---|---|---|
| 1 | `openGbcProject(root): GbcProject` with `root`, `maps`, `map(name)` | ✅ | `project.ts:316-328`. It eagerly calls `loadGbcMaps`, which refuses a non-GBC root. |
| 1 | `tileset(const)` cached per const | ✅ impl / ⚠ untested | `project.ts:329-336`. Mutation R10 (cache disabled) survives. See Issue 3. |
| 1 | `paletteTables()` and `roofs()` lazy and cached | ✅ impl / ⚠ untested | `project.ts:337-344`. R11 and R12 survive. See Issue 3. |
| 1 | `layout(map)` = `loadLayout`, uncached | ✅ | `project.ts:345` |
| 1 | Read-only; a missing file fails loudly | ✅ | Every read is `readFileSync` through the loaders, and ENOENT names the path. |
| 1+ | (extra) `paddingWidth()` reads `MAP_CONNECTION_PADDING_WIDTH` from `constants/gfx_constants.asm` | ✅ | `project.ts:279-284, 346-351`. The subject has `DEF MAP_CONNECTION_PADDING_WIDTH EQU 3 ; metatiles` (line 24). Killed by S8 and R16. |
| 2 | `parseRoofsAsm(text)` → `{mapGroupRoofs, roofPngPaths}` | ✅ | `roofs.ts:44-138`. A strict phase machine. The corpus test pins 27 entries, `[0]=null`, `[10]=1`, `[24]=0` and the 5 paths. |
| 2 | Refuses an unknown ROOF const naming file:line | ✅ | `roofs.ts:85-88`. Tested at `roofs.test.ts:86-90`. Killed by R5 and R5b. |
| 2 | Refuses non-`db` lines in the table naming file:line | ✅ | `roofs.ts:77-80`. Tested at `:92-96`. |
| 2 | Refuses a `table_width`/INCBIN shape it doesn't understand | ✅ | `roofs.ts:64-70, 99-117`. The tests assert the message but not the `file:line` prefix (Minor m3). |
| 2 | Loader uses `readShadesPng` + slices 9 tiles; refuses non-24×24 | ✅ | `roofs.ts:153-167`. Tested at `:236-252`. Killed by R19. |
| 2 | `.2bpp` → `.png` resolved via the INCBIN, never name-mangled | ✅ | Reuses `pngPathFor` from `tileset.ts`, now exported and widened to accept a bare `.2bpp`. `sliceTiles` is exported with its body unchanged. |
| 3 | `renderGbcMetatile(tiles, ts, id, palettes)`: pure, 32×32 plus flags | ✅ | `map.ts:53-99`. It takes `tiles` separately, so the roof-swapped copy can be passed in. |
| 3 | `renderGbcMap(proj, name, {border, time, flash, blocksOverride})` | ✅ | `map.ts:183-262` |
| 3 | `GbcMapRaster` fields: `mapName`, `blockWidth`/`blockHeight`, `originX`/`originY`, `outOfRangeCount`, `unmappedTileCount`, `defects` | ✅ | `map.ts:137-155`. Ring exclusion is implemented for both counts (`map.ts:253-256`). The ring half of `unmappedTileCount` is not tested (Issue 1). |
| 3 | One fixed, documented placeholder colour | ✅ | `PLACEHOLDER = (255,0,255,255)`, `map.ts:18-26`. The same value is used for an out-of-range metatile and for an unmapped tile. Killed by R18. |
| 3 | Block-0 → border substitution inside the map | ✅ | `map.ts:245`. This matches `home/map.asm` `LoadMetatiles` line 139-142: `ld a,[de] / and a / jr nz,.ok / ld a,[wMapBorderBlock]`. Killed by S2. |
| 3 | `blocksOverride` must be exactly w×h, else refused | ✅ | `map.ts:192-197`. Killed by R4. |
| 3 | Metatile cache per call, keyed by id | ✅ | `map.ts:224-232`. Removing it is behaviour-invisible, so it is an equivalent mutation and was not counted. |
| 3 | Roof swap gate, index, range; never mutates the cache | ✅ | `map.ts:112-135`. My own script checked that the Johto tile hex dump is byte-identical before and after rendering VioletCity and GoldenrodCity. |
| 4 | Unit: tile at each 4×4 position | ✅ | Corner test, `map.test.ts:38-79`. Killed by S1. |
| 4 | Unit: palette per tile | ✅ | `:81-92`. Killed by S7. |
| 4 | Unit: unmapped → placeholder; out of range → placeholder, count incremented | ✅ | `:94-119`, `:342-350` |
| 4 | Unit: synthetic palMap **including bank 1 and one null entry** | ❌ | There is no `bank: 1` entry anywhere. The null entry (`:355`) is never placed, because the metatile uses tile 40. **Issue 2** |
| 4 | Stub `GbcProject` built from its interface, no unchecked `as` | ✅ | `stubProject`, `:191-206`. There is one needless `null as unknown as PaletteMapEntry` on the palMap (Minor m1). |
| 4 | Unit: block-0 in map; ring geometry at `border: 3`; `border: 4` refused | ✅ | `:252-301` |
| 4 | Unit: roof swaps exactly `$0A-$12`, only on the 3 tilesets; `db -1` → none; cache unmutated | ✅ | `:419-470` |
| 4 | Unit: `parseRoofsAsm` verbatim fixture plus refusals | ✅ | The fixture matches the real file's shape line for line. |
| 4 | Corpus NewBarkTown: ≥3 pins; ring pin; roof pin that differs from unswapped | ✅ with an accepted deviation | New Bark's own roof is a real no-op (verified below), so the "differs" proof moved to VioletCity. This follows the findings and the bytes. |
| 4 | Corpus ElmsLab: ring pixel from metatile 0 plus an interior pixel | ✅ | Verified below. |
| 4 | Corpus: all 391 render; counts pinned; exactly 2 defect maps and **`defects` names their files** | ⚠ | Map names are pinned. The `file` field is not asserted, although the renderer does carry it (Minor m2). |
| 4 | Corpus: determinism; nite ≠ day | ✅ | `:570-575`, `:540-542` |
| 5 | 8 spec mutations | ✅ | All 8 are killed; re-run below. |
| OOS | Tile animation: render the static frame **and say so in a doc comment** | ❌ | There is no such comment in `render/map.ts` or `project.ts` (grep for `anim` returns nothing). **Issue 4** |
| OOS | No CLI, world, atlas, sprites or write path | ✅ | The commit touches only the 6 listed files. |

## Pixel re-derivations (independent)

Script: `scratchpad/derive.py`. It uses its own PNG decoder, reads tileset paths via the `data/tilesets.asm` → `gfx/tilesets.asm` / `gfx/tileset_palette_maps.asm` stacked labels, parses `tilepal` lines positionally (the low nibble is the even id), uses the `environment_colors.asm` rows and `bg_tiles.pal`, and applies `roofs.pal` for TOWN/ROUTE only (`color.asm`: `cp NITE_F / jr c,.morn_day`, which patches colours 1-2 of PAL_BG_ROOF). Conversion is 5→8 bit via `(c<<3)|(c>>2)`. Neither JOHTO nor LAB is a `LoadSpecialMapPalette` tileset.

Resolution chains:
- **Tilesets.** `TILESET_JOHTO` = 1 → `Tilesets::[1]` `TilesetJohto` → `data/tilesets/johto_metatiles.bin`, `gfx/tilesets/johto.png`, `johto_palette_map.asm`. `TILESET_LAB` = $0a → `TilesetLab` → `lab_metatiles.bin`, `lab.png`, `lab_palette_map.asm`.
- **Groups.** Counting `newgroup` gives VIOLET = 10, LAKE_OF_RAGE = 9 and NEW_BARK = 24, which covers NewBarkTown and ElmsLab.

| Pin | .blk byte (od) | metatile bytes (od) → pos → tile | palMap | PNG index / shade | palette | Derived | Test |
|---|---|---|---|---|---|---|---|
| NBT (66,24) day | `NewBarkTown.blk`[2] = `18` | mt 24 = `10 11 11 11 0d 0e 0e 0e 0d 0e 0e 0e 0a 0b 0b 0b`; pos 12 → `$0A` | line 2, idx 2 = ROOF(6), bank 0 | png 10, row0 `[3,3,0,1,1,1,2,1]`, (0,2) → shade 0. With the new_bark roof it is also 0. | Outdoor day slot 6 = `$0e` → `27,31,27` (colour 0 is never patched) | (222,255,222) | ✅ |
| NBT (0,0) day | [0] = `05` | mt 5 = `1e 1f 1e 1f 2e 2f …`; pos 0 → `$1E` | line 4, idx 6 = GREEN | png 30, row0 `[1,0,1,0,1,0,0,3]`, shade 1 | `$0a` → `12,25,1` | (99,206,8) | ✅ |
| NBT (0,0) nite | same | same | same | shade 1 | Outdoor nite slot 2 = `$12` → `8,13,19` | (66,107,156) | ✅ |
| NBT (15,168) border 3 | ring (bx=−3, by=2) → border `$05` | mt 5 pos 5 → `$2F` | line 6, idx 7 = GREEN | png 47, row0 `[2,2,2,2,2,2,3,0]`, (0,7) → shade 0 | `22,31,10` | (181,255,82) | ✅ |
| VC (129,248) | `VioletCity.blk`[7·20+4 = 144] = `18` | mt 24 pos 12 → `$0A` | ROOF | swapped `violet.png` t0 row0 `[3,0,1,1,1,1,1,1]`, (0,1) → 0. Unswapped Johto = 3. | colour 0 `27,31,27`; colour 3 `7,7,7` | (222,255,222); unswapped (57,57,57) | ✅ both |
| VC (131,248) | same | same | ROOF | violet (0,3) = 1; **azalea (0,3) = 2** | roofs.pal g10 md `24,14,31` / `13,7,21` | violet (198,115,255); azalea would give (107,57,173) | ✅ discriminates |
| EL (64,32) | `ElmsLab.blk`[7] = `01` | lab mt 1 = all `10` → `$10` | lab line 3, idx 0 = GRAY | lab png 16, row0 all 1 | Indoor day slot 0 `$20` → `19,19,19` | (156,156,156) | ✅ |
| EL (0,0) border 3 | ring → border `$00` | lab mt 0 = all `00` | GRAY | lab png 0 = uniform 3 | `7,7,7` | (57,57,57) | ✅ |

Notes:
- **VC (131,248) and the swap.** The unswapped Johto tile *also* gives shade 1 at this pixel, so it does not prove the swap happened. It only discriminates VIOLET from AZALEA, which is its stated purpose. The swap itself is proven by the (129,248) pin, so the pair together covers both claims.
- **EL (64,32) and the gate.** With the tileset gate dropped, `new_bark.png` t6 row0 `[0,3,…]` gives shade 0 → (247,231,214), so the ElmsLab gate assertion is real.
- **EL (64,32) and axis swaps.** The sub-pixel is (0,0), so this pin is insensitive to within-tile axis swaps. Other pins cover that (R7).

## Roof claims

- **NewBarkTown's swap is a no-op.** All 9 of `johto.png` tiles `$0A-$12` are identical to `roofs/new_bark.png` tiles 0-8 in my decoder. Violet, azalea, olivine and goldenrod each have 0 of 9 identical tiles.
- **VioletCity differs, and `MapGroupRoofs` is indexed by `map.group`.** Row 14 of `roofs.asm` is `db -1 ; 0`, so the table is 0-indexed with entry 0 unused. `[10]` = ROOF_VIOLET and `[9]` = ROOF_AZALEA. `engine/tilesets/mapgroup_roofs.asm` `LoadMapGroupRoof` does `ld a,[wMapGroup] / ld e,a / ld d,0 / add hl,de` with no decrement. The (131,248) pin kills S4 (`group - 1`).
- **Bank 0, PNG indices `$0A-$12`.** `home/map.asm` `LoadTilesetGFX` pushes rVBK, selects `BANK(vTiles5)` for the second `$60` tiles, then pops rVBK (lines 1365-1376) *before* the `farcall LoadMapGroupRoof` (line 1392). The roof copy goes to `vTiles2 tile $0a`, `ROOF_LENGTH EQU 9` (`constants/tileset_constants.asm:45`), which is bank 0, indices `$0A-$12`. The implementation swaps `ts.tiles` indices `0x0a..0x12` in a `.slice()` copy.
- **Gate.** Lines 1382-1389 are exactly `cp TILESET_JOHTO / cp TILESET_JOHTO_MODERN / cp TILESET_BATTLE_TOWER_OUTSIDE`. `ROOF_TILESETS` holds exactly those 3 names.

## Border semantics

- **Ring width.** It is read from `constants/gfx_constants.asm` and is never hardcoded (S8 and R16 are killed).
- **`border: n`.** It means n rings, as an integer 0..`paddingWidth()`. Negative, fractional and above-cap values are refused and tested. Geometry is `(w+2n)·32 × (h+2n)·32` with origin `n·32`, tested in the unit tests and on NewBarkTown (512×480) and ElmsLab (352×384).
- **Block-0 substitution inside the map.** This matches `LoadMetatiles`. The ring always draws `map.border`, which is equivalent to a zero-filled ring in Task 9, where nothing is stitched yet (R9 is killed).
- **Counts exclude the ring.** The code excludes the ring from both counts. `outOfRangeCount` exclusion is tested at `:329-340`. **`unmappedTileCount` exclusion is untested (Issue 1).**

## Corpus facts (re-measured)

- **Independent Python** (`scratchpad/corpus.py`). It resolves maps via `maps.asm`, `attributes.asm`, `map_constants.asm` and the stacked labels in `blocks.asm`, then reads tilesets as above. Results: **391 maps; out-of-range blocks 0; unmapped tile slots 0; size defects exactly `CeruleanCave2F` and `CeruleanCaveB1` (400 B vs 9×15)**. No map's border metatile is out of range.
- **Through the renderer.** A temporary test, since deleted, rendered all 391 maps × {morn, day, nite} × `border: 3` (1173 renders). Nothing threw. Both counts total 0, and the geometry was right for every map. The defects are the two CeruleanCave maps with `file: "maps/CeruleanCave2F.blk"` / `"maps/CeruleanCaveB1.blk"` and the message `actual size 400 bytes, declared 9x15=135 -- loaded first 135 bytes, not writable`.

## Mutation table

Each mutation was applied by a script (`scratchpad/mut.py`), run against the full `packages/core/test/gbc` suite, then reverted by restoring the saved source. `git diff` afterwards shows no source changes.

| # | Mutation | Result | Killed by |
|---|---|---|---|
| S1 | Transpose the 4×4 tile loop | killed (8) | corner unit test, NBT, VC, … |
| S2 | Drop block-0 substitution | killed (1) | block-0 unit test |
| S3 | Roof range `$0B-$13` | killed (2) | `$0A-$12` unit test, VC |
| S4 | `MapGroupRoofs[group-1]` | killed (4) | VC (131,248), unit tests |
| S5 | Drop the tileset gate | killed (13) | ElmsLab gate, unit tests |
| S6 | Mutate the cached tileset in place | killed (2) | cache-unmutated unit test, VC |
| S7 | Ignore `palMap.pal` | killed (13) | palette unit test, all corpus pins |
| S8 | Hardcode ring cap 3 | killed (1) | `paddingWidth() => 2` unit test |
| R1 | Roof pal: nite also uses the morn/day pair (`<=`) | killed (1) | `palette.test.ts` NBT nite roof (Task 6's test; map.test's nite pin is GREEN, not ROOF) |
| R1b | Roof pal: day uses the nite pair | killed (9) | palette.test and map roof unit tests |
| **R2** | **`unmappedTileCount` counts ring blocks** | **SURVIVED** | none. **Issue 1** |
| R3 | `outOfRangeCount` never counts | killed (1) | out-of-range interior unit test |
| R4 | Skip `blocksOverride` length check | killed (1) | exact-length unit test |
| R5 | `parseRoofsAsm` accepts an unknown ROOF const | killed (2) | roofs refusal tests |
| R5b | Unknown ROOF const → `null` (silently no swap) | killed (2) | roofs refusal tests |
| R6 | Placeholder on shade-0 pixels | killed (8) | NBT, VC, ring and unit tests |
| R7 | Within-tile x/y swap (`shades[x*8+y]`) | killed (2) | NBT (66,24)/(15,168), VC |
| **R8** | **Bank ignored: `tiles[tileId & 0x7f]`** | **SURVIVED** | none. **Issue 2** |
| **R8b** | **Raw tile id as PNG index: `tiles[tileId] ?? tiles[idx]`** | **SURVIVED** | none. **Issue 2** |
| R9 | Ring draws metatile 0, not `map.border` | killed (3) | NBT ring, unit ring tests |
| **R10** | **`proj.tileset()` cache disabled** | **SURVIVED** | none. **Issue 3** |
| **R11** | **`proj.paletteTables()` cache disabled** | **SURVIVED** | none. **Issue 3** |
| **R12** | **`proj.roofs()` cache disabled** | **SURVIVED** | none. **Issue 3** |
| R13 | `defects` dropped | killed (2) | corpus 391 test, defects unit test |
| R14 | `time` not forwarded to the palette | killed (1) | NBT nite pin |
| R15 | Roof tile count 8 | killed (8) | roof unit tests, corpus (the length guard throws) |
| R16 | `parsePaddingWidth` off by one | killed (1) | corpus `border: 4` refused |
| R17 | Origin not offset by ring | killed (4) | geometry tests |
| R18 | Unmapped tile left transparent | killed (1) | unmapped-placeholder unit test |
| R19 | Roof PNG 24×24 check removed | killed (1) | non-24×24 refusal test |
| — | Per-call metatile cache removed | equivalent (behaviour-invisible) | not counted |

## Issues (❌ blocking)

1. **The ring exclusion for `unmappedTileCount` is untested (R2 survives).** The spec says `unmappedTileCount` is "counted over map blocks only" and the brief asks for ring exclusion. The only unmapped test (`map.test.ts:352-369`) renders with no ring, so moving `dst.unmappedTileCount += r.unmappedTiles` outside the `countsTowardMapStats` guard stays green.
   - **Fix:** add a unit test where the *border metatile* has unmapped tiles (e.g. `map.border` → a metatile containing tile 40), render with `border: 1` over interior blocks that are all mapped, and assert `unmappedTileCount === 0`. A second assertion with `border: 0` and one interior block of that metatile would pin the positive case.

2. **Bank-1 tile handling is untested, and the null palMap entry is never exercised (R8 and R8b survive).** The spec requires "a synthetic palMap (including bank 1 and one null entry)". No unit test has a `bank: 1` entry, and every corpus pin is a bank-0 tile. As a result, `renderGbcMetatile` indexing `tiles[tileId & 0x7f]` or `tiles[tileId]` instead of `tiles[pngTileIndex(...)]` is invisible. The `palMap[2] = null` entry at `:355` is dead, because the metatile places tile 40 (undefined), not tile 2.
   - **Fix:** in a `renderGbcMetatile` unit test, place a bank-1 tile id (e.g. `0x85` with `palMap[0x85] = {bank: 1, pal: k}`) whose PNG index `0x65` holds a distinct shade/palette from index `0x05`/`0x85`, and assert the exact RGBA. Also place tile 2 (the `null` entry) and assert the placeholder. Optionally, add a corpus pin on a bank-1 tile.

3. **`GbcProject` caching is untested (R10, R11 and R12 survive).** Deliverable 1 says `tileset` is cached per const and `paletteTables`/`roofs` are lazy and cached, and Tasks 10-12 rely on it. The "never mutate the cached tileset" guarantee is also only meaningful because `tileset()` returns the same object. Disabling any of the three caches leaves the suite green.
   - **Fix:** add a corpus test (or a small fixture-root test) asserting `proj.tileset("TILESET_JOHTO") === proj.tileset("TILESET_JOHTO")`, `proj.paletteTables() === proj.paletteTables()` and `proj.roofs() === proj.roofs()`.

4. **The tile-animation doc comment is missing.** The spec's out-of-scope section requires: "Tile animation (water/flower frames): render the static PNG frame and say so in a doc comment." Neither `render/map.ts` nor `project.ts` mentions animation.
   - **Fix:** add a sentence to `renderGbcMap`'s or `renderGbcMetatile`'s doc comment saying that animated tiles (`*Anim` in `data/tilesets.asm`, `engine/tilesets/tileset_anims.asm`) render as their static PNG frame.

## Minors (non-blocking)

- m1. `map.test.ts:355` has `palMap[2] = null as unknown as PaletteMapEntry`. The array is already typed `(PaletteMapEntry | null)[]`, so the double cast is unnecessary and is the kind of unchecked cast the RESUME lesson warns about. Assign `null` directly. This folds into Issue 2.
- m2. The spec asks that "`defects` names their files". The all-391 test pins the defect *map names* only. Add `expect(r.defects.map(d => d.file))` equal to `["maps/CeruleanCave2F.blk"]` etc. (the renderer already carries them; verified).
- m3. The `table_width` and INCBIN refusal tests (`roofs.test.ts:98-117`) assert the message but not the `data/maps/roofs.asm:<line>:` prefix. The code emits it. The post-loop "roof index beyond Roofs" refusal names the file but no line.
- m4. The ElmsLab corpus test comment (`map.test.ts:627`) contains a working note: "`-- WAIT: verified against the real file, ...`". Its "gate check" (`:659`) repeats the `:640` assertion verbatim. That works for S5, but it reads as a duplicate. Tidy the comment and fold the two into one.
- m5. `parseRoofsAsm` does not check the `MapGroupRoofs` count against `NUM_MAP_GROUPS + 1`, or the `Roofs:` count against `NUM_ROOFS`. It only checks that the referenced indices exist. This is acceptable because the text of the assert lines is matched, but a fork that adds a group without a row would parse silently.
- m6. With `blocksOverride`, `defects` is `[]`. This means a CeruleanCave edit-session render (Plan 7) would drop the "not writable" defect. It is documented in the field's comment. Flag it for Plan 7.
- m7. `pngPathFor` now also accepts a bare `.2bpp` for *tileset* GFX INCBINs (previously refused). This is harmless, since the sibling `.png` is still required, but it is a small loosening of Task 5's refusal.
- m8. Accepted deviation, not an issue: the spec's "NewBarkTown roof pixel must differ from unswapped" cannot be met, because New Bark's roof PNG is byte-identical to `johto.png` `$0A-$12` (independently verified). The proof on VioletCity is correct and also discriminates VIOLET from AZALEA.
