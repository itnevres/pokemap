# Plan 6 Task 5 spec-compliance review: GBC per-tileset loader

Commit `fa4cb08`, diffed against `39e70cc`. Every check below was re-derived independently with scratch tsx and PowerShell scripts. The implementer's report was not trusted. Subject porcelain afterwards: 0 lines. PokeMap tree: only the untracked report files.

**Verdict: ❌ 2 issues** (1 substantive, 1 minor), plus 2 ⚠️ notes.

## Per item

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | One stacked-label implementation for INCBIN and INCLUDE | ✅ | There is one private `scanStackedLabels(text, keyword)`, and `parseIncbins`/`parseIncludes` are thin wrappers around it. All Task 2 incbin tests are green, and the new parseIncludes tests pass. |
| 2a | PNG decode: gray d2 and RGBA d8, with shade = 3−gray | ✅ | **Whole-corpus independent check:** all 36 `gfx/tilesets/*.png` were decoded with System.Drawing (LockBits into 32bppArgb) and compared per pixel with `readShadesPng`. 393,216 px, **0 mismatches**. Every System.Drawing pixel was R=G=B, A=255 and one of {0,85,170,255}. All 4 grays appear in every file. port.png is ct6/d8, the other 35 are ct0/d2, and all are 128 wide (28×96 and 8×48 tall), matching the findings. |
| 2b | RGBA refusals (A≠255, R≠G≠B, value outside the 4 levels) name the pixel | ✅ | Unit tests cover all 3. Mutation M1 (removing the level check) was caught. |
| 2c | Named refusals for an unsupported type/depth or interlace | ✅ | The messages name the colour type and depth, and "interlaced". A truncated-IDAT refusal was also added. |
| 2d | Unfilter reused, GBA behaviour unchanged | ✅ | **12,927 PNGs** (`Pokemon Game/game` plus `refs/pokeemerald`) were run through the old `readIndexedPng` (from `git show 39e70cc`) and the new one. Result: 11,401 identical, 1,526 thrown with the identical message in both versions, **0 differences**. GBA rows by filter type 0-4: 774248/1578/12802/2165/3127, so all 5 filters were exercised. |
| 2e | `bpp` generalisation correct for RGBA (bpp=4) | ✅ | **No real GBC PNG uses a filter other than 0**: every row of all 36 files is filter 0, and a GDI+-saved RGBA PNG was also filter 0 only. So the only coverage of bpp=4 with filters 1-4 is synthetic. The unit test covers Sub only. My own textbook encoder (13×25 RGBA, row filter y%5, so all of None/Sub/Up/Avg/Paeth with bpp=4) round-tripped with **0/325 mismatches**. Mutation M2 (bpp forced to 1) was caught by the Sub unit test. Note that Paeth and Avg at bpp=4 have no committed test; only my scratch check covers them. |
| 2f | Pins from an independent decoder | ✅ | The johto (0,9,14,11 @ y0) and port (0,0 / 10,8 / 18,0 / 16,0) coordinates match my System.Drawing dump. |
| 3a | Const → `Tilesets[x]` → labels → paths (I4), with GFX taken from the `.png` sibling (I3) | ✅ | All 36 `TILESET_*` resolve to `table[i+1]`. For all 37 table entries, gfx/meta/coll/palMap paths equal my own label resolution. Aliases hold: Tileset0 = Johto; BattleTowerOutside → johto_modern.png; DarkCave shares cave's meta/coll/palmap but has its own dark_cave.png; all 5 word rooms → ruins_of_alph palmap. |
| 3b | Collision is numeric COLL per quadrant, with length = metatiles | ✅ | 109 COLL constants; my parse and the implementation agree. For all 37 table entries, `collision.length === metatiles.length`, and **2,664 quadruples match** my own parse. All **37 on-disk** `*_collision.asm` files (2,688 lines, including orphans) went through `parseCollision` and matched my parse exactly. Forest has 64 source lines, trimmed to 40. |
| 3c | palMap: 224 entries of `{bank,pal}` or null, with PAL_BG parsed rather than hardcoded | ✅ | PAL_BG values come from `parseConstDefs` on `tileset_constants.asm`. All **37 on-disk** palette-map files went through `parsePaletteMap` and matched my own macro emulation exactly. For the 30 distinct files the table reaches, 8,288 tile entries matched a byte-level emulation (`dn (x\|\3),(x\|\2)` → low nibble = even tile, `bank=nib>>3`, filler → null). All 37 real files have the identical shape `T0×12 R16 T1×12`. |
| 3d | `pngTileIndex` | ✅ on the corpus | For all 37 tilesets and t=0..255, the result equals the findings rule (t<$60→t; $80≤t<$E0→t−$20; else null; null if ≥ tile count). **0 mismatches.** Mutation M4 (range check removed) was caught. |
| 3e | Refuse: unknown const / missing label / unknown coll token / collision < metatiles | ✅ (with ❌2 below) | Unit tests cover each case. Mutation M5 (count refusal removed) was caught. Mutation M6 (the `index===undefined` throw removed) **survived**, but that is benign: `table[undefined]` then hits the next throw, whose message also names the const. |
| 3f | Refuse a palette map that doesn't match the fixed 12 / rept-16 / 12 shape | ❌ **Issue 1** | See below. |
| 3g | No roof handling | ✅ | None present. |
| 4 | Tests: unit + corpus (37 load, aliases, 128/40/64, placed-tile sweep with a non-vacuous guard, johto $0c, johto palmap 0-7, pins) | ✅ | All present. `npm test` gives 81 files and 906 tests, all passing. `npm run typecheck` is clean. The verbose gbc run showed 187 tests passing, with all corpus tests executed (✓), none skipped. |
| – | Mutations | ✅ | M1-M5 were all caught (1-3 failures each). M3 (labelMap keeps only the last stacked label) failed 3 tests: the fixture alias test, the 37-load test and the placed-tile sweep. Each mutation was reverted with `git checkout`. |

## Issue 1 (❌, substantive): palette-map shape is not enforced

The only guards are "total = 224" and "unrecognised line". I ran `v6.ts` against the constructed cases below.

| Case | Result | `pngTileIndex` effect |
|---|---|---|
| A: `tilepal 1` ×12 in the bank-0 region | **accepted** | $00→96 |
| B: 13×`tilepal 0` + `rept 12` + 12×`tilepal 1` | **accepted** | **$60→96, $67→103**: wrong non-null indices |
| E: order swapped (T1 block first) | **accepted** | $80→0 |
| F: `tilepal 2` (bank 2, overflows the nibble in real asm) | **accepted** | bank treated as truthy |
| G: filler first, then 24 tilepal | **accepted** | $00→null, $60→96, $7F→127 |
| I: 10 T0 + `rept 32` + 10 T1 | **accepted** | $5F/$80→null |
| D: `rept 8` with 2×`db $ff` | accepted | byte-equivalent, harmless |
| C: `rept 16 / db $00` | refused | unrecognised line |
| H: `db $ff` outside a rept block | refused | |
| J: tilepal with 16 names | refused | |

The spec explicitly required refusal. The findings (§3.2) also allowed a bank-from-nibble variant, but only "valid for `t & $7F < $60`". `pngTileIndex` omits that guard. For bank 0 with t in $60-$7F, it returns 0x60+ (bank-1 PNG tiles), yet the engine puts those at vTiles2+$60, which is not PNG data. So a non-conforming map silently yields wrong graphics (cases B and G).

**Fix:** assert the exact structure: 12 bank-0 tilepal lines, then `rept 16 / db $ff / endr`, then 12 bank-1 tilepal lines, and bank ∈ {0,1}. Optionally add `(tileId & 0x7f) < 0x60` to `pngTileIndex`. Add unit tests for A, B and G.

## Issue 2 (❌, minor): `loadGbcTileset` accepts a constant that is not a `TILESET_*`

`parseConstDefs` merges both enums in `tileset_constants.asm`, so `loadGbcTileset(root, "PAL_BG_RED")` resolves to index 1 and **silently returns TilesetJohto** (checked in v4). Spec: "Refuse: unknown const". **Fix:** require the `TILESET_` prefix, or parse only the `const_def 1` block.

## Notes (⚠️, not counted)

- The RGBA refusal names the pixel but not the file. `loadGbcTilesetByName` calls `readShadesPng` without wrapping the error with `gfxPath`, so a corpus-level failure wouldn't say which PNG. The spec said "naming file/pixel".
- Paeth and Avg with bpp=4 are verified only by my scratch encoder, not by a committed test. No real PNG exercises them, so a regression there would be invisible. Consider one synthetic RGBA row per filter 2-4.

---

# Re-review 1 (`git diff fa4cb08 7c58bb4`, "Fix round 1")

**Verdict: ✅ SPEC COMPLIANT.** Both issues and both notes are fixed. Two minor test-strength gaps are recorded below; neither blocks.

| Item | Status | Evidence |
|---|---|---|
| Issue 1: exact 12 / rept 16 / 12 structure | ✅ | `parsePaletteMap` is now a strict phase machine: low → `rept 16` → one `db $ff` → `endr` → high → done, with trailing content refused. Re-ran the constructed cases: **A, B, C, D, E, F, G, H, I and J are all refused**, and the real shape is accepted. Each message names the source and a 1-based line (e.g. `<palette map>:13: expected "rept 16"`). The loader passes `palMapPath` as the source. |
| Refusing D (`rept 8` + 2×`db $ff`) | ✅ correct | D is byte-equivalent, but it is not the fixed shape, and the spec says refuse. None of the 37 real files use it, so refusing it costs nothing. |
| bank ∈ {0,1}, matched to its block | ✅ | A, E and F are refused, with "bank is N, expected M". |
| `pngTileIndex` guard `(t&0x7f)<0x60` | ✅ | Unit test added. Mutation M9 (guard removed) was caught. |
| Issue 2: a non-`TILESET_` const is refused | ✅ | `PAL_BG_RED` gives `"PAL_BG_RED" is not a TILESET_* constant` (v4). Test added. Mutation M10 was caught. |
| PNG errors wrapped with `gfxPath` | ✅ | `loadGbcTilesetByName: <gfxPath>: <msg>`. Test added. Mutation M12 was caught. |
| Synthetic RGBA-8 filter 2/3/4 tests | ✅ (⚠️ Paeth weak) | Up, Avg and Paeth tests were added. Mutation M8 (Avg ignores `a`) was caught. Mutation M7 (Paeth with `c`→0) **survived the gbc suite**, because the fixture never hits a case where `c` decides the pick. It *is* caught by the full suite through the shared unfilter's GBA tests (`load/png.test.ts`, 2 failures), and my scratch encoder (all 5 filters at bpp=4) still gives 0/325 mismatches. So there is no correctness gap, only a weak GBC-local fixture. |
| All 37 real palette maps still load | ✅ | v5: all **37 on-disk** palette-map files match my own parse exactly (37/37, 0 differences). v4: all 37 table entries load; the 30 reachable files give 8,288 tile entries with 0 mismatches; the shape is identical everywhere. |
| Whole-corpus decode | ✅ | v1: 36 PNGs and 393,216 px against System.Drawing, **0 mismatches**. |
| Collision / pngTileIndex / slicing | ✅ | 2,664 table quadruples and 37 on-disk files (2,688 lines) show 0 differences. `pngTileIndex` against the findings rule, for 37 tilesets × t 0-255: 0 mismatches. Tile slicing: 0 mismatches. 36 `TILESET_*` → `table[i+1]`: 36/36. |
| Tests / typecheck | ✅ | `npm test`: 81 files and 916 tests, all passing. `npm run typecheck` is clean. The gbc verbose run (197 tests) has 0 skipped. |
| Mutations | ✅ | M8-M12 were caught. Two survived: M7 (explained above), and M13 (`rept N≠16` count check removed). M13 survives because no committed test puts a wrong-count `rept` right after exactly 12 low lines: case B refuses earlier, at the 13th tilepal. My v6 case D shows the runtime refusal works. ⚠️ Optional: add a D-style test. All mutations were reverted with `git checkout`. |
| Trees | ✅ | Subject porcelain: 0 lines. PokeMap: only the untracked report files. |
