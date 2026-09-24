# Plan 6 Task 5 implementer report: GBC per-tileset loader

**Status:** done. `npm test` 906/906 green (was 856; +50). `npm run typecheck` clean. PerfPlus porcelain empty throughout.

## Files

- `packages/core/src/gbc/load/incbin.ts` — generalized: `scanStackedLabels(text, keyword)` extracted; `parseIncbins`/`parseIncludes` are thin wrappers (one stacked-label implementation, per Task 2's own note).
- `packages/core/src/load/png.ts` (GBA) — extracted `unfilterScanlines(raw, bytesPerRow, height, bpp)` (exported), parameterized on `bpp` (was hardcoded 1). `readIndexedPng` now calls it with `bpp=1`. Behavior unchanged; GBA's own 11 png tests are the regression net and stayed green untouched.
- `packages/core/src/gbc/load/png.ts` (new) — `readShadesPng`: grayscale depth 2 (colour type 0) and RGBA depth 8 (colour type 6, non-interlaced), decoding to per-pixel shade 0-3 via the shared `unfilterScanlines`. Chose a separate file over extending GBA's `readIndexedPng` (which returns indexed+PLTE, a shape that doesn't fit shade data and whose signature/tests I didn't want to touch) — extension was the shared unfilter helper only.
- `packages/core/src/gbc/model/types.ts` — added `PaletteMapEntry`, `Collision`, `GbcTileset`.
- `packages/core/src/gbc/load/tileset.ts` (extended) — `parseConstDefs`, `parseTilesetsTable`, `parsePaletteMap`, `parseCollisionConstants`, `parseCollision`, `pngTileIndex`, `loadGbcTilesetByName`, `loadGbcTileset`, plus private `sliceTiles`/`pngPathFor`/`labelMap`.
- Tests: `packages/core/test/gbc/load/incbin.test.ts` (+9), `packages/core/test/gbc/load/png.test.ts` (new, 10), `packages/core/test/gbc/load/tileset.test.ts` (+45, incl. a synthetic fixture-project suite and corpus suites).

## Design choices

- **`loadGbcTilesetByName(root, name, constName=name)` + `loadGbcTileset(root, tilesetConst)`.** The latter resolves `TILESET_x` → table index → name → defers to the former. Needed because table index 0 (`Tileset0`) has no matching `TILESET_*` constant (`const_def 1` starts at 1) — the corpus test "all 37 table entries load" iterates table *names*, not constants.
- **`parsePaletteMap`** builds `{bank, pal}` directly from each `tilepal` line's 8 names in source order (verified against the `dn`/`shift` macro expansion: pair (\2,\3) → tiles 2k/2k+1 in order) rather than re-deriving nibble packing — simpler and no less correct.
- **Palette-map shape enforcement**: no explicit "must be exactly 12/rept16/12" check; instead any deviation either changes the final count (checked: must be 224) or hits "unrecognized line". Verified by a dedicated refusal test with 5 lines only.
- **Collision**: `collision.length < metatiles.length` throws; `>` is silently trimmed to `metatiles.length` (forest: 64→40), matching findings exactly.
- **`pngTileIndex`** takes `Pick<GbcTileset, "palMap"|"tiles">` (structural, easier to unit-test with stubs).
- **GFX path**: `pngPathFor` strips `.2bpp.lz` → `.png` (I3, source not build artifact).

## Corpus pins (all measured directly, none assumed; none contradicted findings)

- `constants/tileset_constants.asm`: `TILESET_JOHTO=1`, `TILESET_AERODACTYL_WORD_ROOM=36`, `PAL_BG_GRAY=0`, `PAL_BG_TEXT=7`.
- `data/tilesets.asm`: 37 `Tilesets::` entries; index 0 = `Tileset0`, index 1 = `TilesetJohto`.
- All 37 table entries load via `loadGbcTilesetByName` with 0 failures.
- Aliases confirmed via resolved paths (not name-mangled): `Tileset0`.gfxPath === `TilesetJohto`.gfxPath; `TilesetBattleTowerOutside`.gfxPath === `"gfx/tilesets/johto_modern.png"`; `TilesetDarkCave` shares `TilesetCave`'s metatilesPath/collisionPath/palMapPath but has its own distinct gfxPath (`"gfx/tilesets/dark_cave.png"`); all 5 word-room tilesets share `TilesetRuinsOfAlph`'s palMapPath.
- Metatile counts via full loader: Johto 128, Forest 40, Mart 64 (matches findings' 128/40/64 split).
- Forest: collision trimmed to 40 entries despite 64 source `tilecoll` lines.
- Johto collision metatile `0x0c` = `{tl: COLL_FLOOR, tr: COLL_FLOOR, bl: COLL_WALL, br: COLL_WARP_CARPET_DOWN}` = `{0, 0, 7, 0x70}`.
- Johto palette-map tiles 0-7 = GRAY,BROWN,BROWN,RED,GREEN,GREEN,GRAY,RED (as bank/pal pairs against the parsed `PAL_BG_*` map).
- `COLL_WARP_CARPET_DOWN = 0x70`, `COLL_FLOOR = 0`, `COLL_WALL = 7` (from `constants/collision_constants.asm`).
- **Every placed metatile tile id, across every real map's layout (incl. border, incl. the 2 oversize CeruleanCave `.blk`s handled by Task 3's `loadLayout`), resolves via `pngTileIndex` to a non-null index within that tileset's own PNG tile count.** Non-vacuous: `checkedTiles` > 0 (in the thousands across 391 maps × up to 16 tiles/metatile). 0 failures, 0 unknown-tileset-field maps (every map header's tileset field is a bare `TILESET_*` token, confirming findings' implicit assumption).

## Independent-decoder shade pins (PowerShell `System.Drawing`, run against the real files)

```powershell
Add-Type -AssemblyName System.Drawing
$b = [System.Drawing.Bitmap]::FromFile("C:\Programming Projects\pokecrystal-PerfPlus\gfx\tilesets\johto.png")
# scanned (0,0)..(19,8) then a full scan for the missing gray=85 sample
```
Output (johto.png, 128x96, grayscale depth 2): `(0,0) R=255`, `(9,0) R=170`, `(14,0) R=85`, `(11,0) R=0`.

```powershell
$b = [System.Drawing.Bitmap]::FromFile("C:\Programming Projects\pokecrystal-PerfPlus\gfx\tilesets\port.png")
```
Output (port.png, 128x48, RGBA depth 8): `(0,0) R=255 A=255`, `(10,8) R=170 A=255`, `(18,0) R=85 A=255`, `(16,0) R=0 A=255`.

Both files' `readShadesPng` output at those exact coordinates equals `3 - round(gray/85)` (0→3, 85→2, 170→1, 255→0): pinned in `packages/core/test/gbc/load/png.test.ts`'s `corpus: independent-decoder pins` describe block. **No fact contradicted the findings doc** — the shade formula (`shade = 3 - gray`) held exactly at all 8 sampled points across both PNG shapes.

## Mutation checks (all confirmed red, then reverted — verified via `git status`/`diff`, no residue)

1. Shade inverted (`shades[i] = gray` instead of `3 - gray`) → 4 test failures in `png.test.ts` (the independent-decoder corpus pins).
2. Palette-map nibble/name order swapped (`for (const name of [...names].reverse())`) → 2 failures (johto tiles 0-7 pin, both inline and corpus).
3. Bank bit ignored in `pngTileIndex` (`idx = tileId & 0x7f`, dropping the `bank ? 0x60 : 0` term) → 1 failure (`pngTileIndex` bank-1 unit test).
4. Alias resolution by name-mangling instead of labels (bypassed `gfxByLabel.get`, derived path from `name` via snake_case) → 3 failures: the alias-pin corpus test (`Tileset0`/`TilesetJohto`, `TilesetBattleTowerOutside`, `TilesetDarkCave` all mismatch or ENOENT) and the full corpus tile-resolution test (ENOENT on a mangled path that doesn't exist on disk, e.g. `poke_com_center.png` for `TilesetPokeComCenter`).

All four reverted with `mv <file>.bak_mutation <file>`; `git diff` after each revert showed the mutation fully undone (confirmed by re-running the green suite).

## Self-review / concerns

- `parseConstDefs` is a single flat pass across the whole file (both the `TILESET_*` and `PAL_BG_*` enums) — safe because RGBDS const names are unique per file and neither enum's names collide with the other's.
- Deliberately did not add a `roofPath`/roof-tile field to `GbcTileset` — Decision 6 puts roof tile graphics in Task 9 (per-map render); this loader is map-agnostic as specified.
- `loadGbcTilesetByName`'s `constName` parameter defaults to `name` — harmless for `Tileset0`/table-name-only callers since nothing in Task 5 reads `constName` except round-tripping it back to the caller.
- No fixture test exercises a palette-map file with a *wrong* rept count (e.g. `rept 15`) — covered indirectly by the "224 total" refusal (any rept count other than 16 changes the total away from 224), but not with its own named test. Low risk: the shape-total check is the actual invariant that matters (per findings' own phrasing: "assert that uniformity").

## Fix round 1

Addressed `task-5-spec-review.md` (verdict: ❌ 2 issues + 2 ⚠️ notes), commit `fa4cb08` -> this round.

1. **Issue 1 (palette-map shape not enforced).** Replaced the "total 224 + unrecognized line" check in `parsePaletteMap` with a strict phase machine: exactly 12 bank-0 `tilepal` lines, then exactly `rept 16`/`db $ff`/`endr`, then exactly 12 bank-1 `tilepal` lines, then nothing else. Every deviation now throws `parsePaletteMap: <source>:<1-based line>: <what>`, naming the file (new optional `source` param, defaulted `"<palette map>"`, wired to `palMapPath` in `loadGbcTilesetByName`) and line (via `codeLines` instead of `stripMacroDefs`, to keep line numbers). Added `(tileId & 0x7f) < 0x60` guard to `pngTileIndex` as defense-in-depth (it takes plain `palMap` data, not necessarily `parsePaletteMap`'s output). Unit tests for reviewer's cases A (bank=1 in the low block), B (13 low lines + `rept 12`), G (filler-first), plus F (bank=2, coordinator's addition) — all in `parsePaletteMap`'s new "spec-review Issue 1" describe block. Real corpus files (`johto_palette_map.asm` etc.) still pass the stricter parser unchanged, confirming all 37 really are exactly 12/rept16/12.
2. **Issue 2 (`loadGbcTileset` accepted non-`TILESET_*` constants).** Added an explicit `tilesetConst.startsWith("TILESET_")` guard at the top of `loadGbcTileset`, before any lookup. Unit test: `loadGbcTileset(root, "PAL_BG_GRAY")` now throws naming it (the fixture's `PAL_BG_GRAY` sits at table index 0, mirroring the reviewer's `PAL_BG_RED`-resolves-to-`TilesetJohto` finding).
3. **⚠️ PNG errors not wrapped with gfxPath.** Wrapped `readShadesPng` in `loadGbcTilesetByName` in a try/catch that rethrows `loadGbcTilesetByName: <gfxPath>: <original message>`. Unit test corrupts a fixture PNG's signature and asserts the thrown message contains the PNG's path.
4. **⚠️ Paeth/Average at bpp=4 uncommitted.** Added 3 synthetic RGBA depth-8 PNGs (Up/Average/Paeth, each hand-worked in its builder's own doc comment, arithmetic verified against the shared `unfilterScanlines`) to `png.test.ts`. All passed on the first run (no production bug — the reviewer's own scratch check had already found none), closing the coverage gap the review flagged.

**Mutation checks (all confirmed red, then reverted via `cp` from a pre-mutation backup; final state re-verified against a diff-free `git status`):**
- A: removed the bank-mismatch check in `parsePaletteMap` -> cases A and F (bank≠expected) failed, as expected; B/G (structural, not bank) still passed since they fail on a different check.
- B: removed the `low7 >= 0x60` guard in `pngTileIndex` -> the dedicated unit test failed.
- C: removed the `TILESET_` prefix guard -> the new refusal test failed.
- D: removed the gfxPath try/catch wrap -> the new wrapping test failed.
- E: forced `bpp = 1` unconditionally in `readShadesPng` -> the existing Sub test and the new Average/Paeth tests failed (3/4; the new Up test is unaffected by bpp, since PNG's Up filter never references `a`/`c` at all — a correct, not a gap: Up is genuinely bpp-independent by the PNG spec).

`npm test`: 916/916 green (was 906; +10: 4 palette-map structure cases + 1 pngTileIndex guard case + 1 TILESET_ prefix case + 1 gfxPath-wrap case + 3 RGBA filter cases). `npm run typecheck` clean (one incidental fix: TS's `never`-return narrowing needed explicit `throw fail(...)` at each call site rather than a bare `fail(...)` statement, for `tp`/`pal`/`rept` destructuring after the corresponding guard). PerfPlus porcelain empty throughout.

## Fix round 2

Addressed `task-5-code-quality-review.md` (verdict: 3 Important, 3 Minor — 2 advisory/no-action), commit `7c58bb4` -> this round.

1. **I1 (`sliceTiles` didn't validate PNG dims are multiples of 8).** Added a guard at the top of `sliceTiles`, throwing `sliceTiles: <source>: <width>x<height> isn't a multiple of 8x8` before the slicing loop can read past `shades`. `sliceTiles` gained a `source` param, wired to `gfxPath` at its one call site. Unit test: a 10x8 fixture PNG (valid to decode, invalid to tile) now throws naming both `10` and `gfx/tilesets/tiny.png`.
2. **I2 (`parseMetatiles`/`parseCollision` errors didn't name their file).** Both gained an optional `source` param (mirroring `parsePaletteMap`'s existing pattern), defaulted to `"<metatiles>"`/`"<collision>"` for callers with no file, wired to `metatilesPath`/`collisionPath` in `loadGbcTilesetByName`. Unit tests: a 17-byte `tiny_metatiles.bin` and a `tiny_collision.asm` with an unknown token now both throw naming their repo-relative path.
3. **I3 (`gfx/tilesets.asm` read+parsed twice per call).** `loadGbcTilesetByName` now reads it once into `tilesetsAsmText`, passed to both `parseIncbins` and `parseIncludes`. Pure dedup; no test needed (behavior unchanged, all existing tests still green — this only removes a redundant `readFileSync` + rescan).
4. **M4 (`parseCollisionConstants` didn't go through `stripMacroDefs` like its sibling `parseConstDefs`).** Swapped the raw `text.split(/\r\n|\n/)` for `stripMacroDefs(text)`, matching `parseConstDefs`'s pattern. Existing tests (inline + corpus) still pass unchanged — the real file has no `MACRO`/`ENDM`, so this is purely defensive consistency, not a behavior change.
5. **M5 (no doc-comment on `loadGbcTileset` about caching).** Added a paragraph to its doc comment: the function stays a pure per-call read with no internal cache, deliberately, and a caller loading many maps should cache by `tilesetConst` on its own side (the pattern this file's own placed-tile corpus test already uses) — so Task 9/10 doesn't rediscover this from scratch.

**Mutation checks (guards only, since I3/M4/M5 are non-refusing refactors/docs — confirmed red, then reverted via `cp` from a pre-mutation backup, re-verified green):**
- Q1: removed the `sliceTiles` dims guard -> the new 10x8 unit test failed (the other 54 tests, including the full placed-tile corpus sweep, stayed green — no real corpus PNG is off-8, so nothing else notices).
- Q2: dropped the `metatilesPath`/`collisionPath` args at both call sites in `loadGbcTilesetByName` -> both new I2 unit tests failed (message reverted to un-prefixed).

`npm test`: 919/919 green (was 916; +3: the I1 dims-refusal case, and the two I2 file-naming cases). `npm run typecheck` clean. PerfPlus porcelain empty throughout.
