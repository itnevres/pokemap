# Task 5 Code-Quality Review — GBC Tileset Loader

Scope: `git diff 39e70cc 7c58bb4 -- packages` (gbc/load/{incbin,png,tileset}.ts, gbc/model/types.ts, load/png.ts, tests). Spec compliance already approved (decode verified vs System.Drawing on whole corpus). This review: quality/maintainability/perf only.

Verification: `npm test` → 81 files / 916 tests pass (tileset.test.ts 52 tests/691ms, png.test.ts 13/15ms, incbin.test.ts 18/9ms). `npm run typecheck` → clean, no errors.

## Critical
None.

## Important

**1. `sliceTiles` (tileset.ts:254-270) doesn't validate PNG dims are multiples of 8 — silent zero-fill instead of refusal.**
`cols = png.width / 8; rows = png.height / 8` — if either isn't exact, the loop bound (`ty < rows`) still runs the fractional extra iteration, and `png.shades[...]` reads past the array; `Uint8Array` coerces the resulting `undefined` to `0` rather than throwing. This contradicts the stated project-wide principle this same diff enforces everywhere else (refuse on any unexpected shape, I7/G4 — see `parsePaletteMap`'s whole rationale, `parseMetatiles`'s multiple-of-16 check). Real corpus PNGs are presumably always tile-aligned, so no test currently exercises this, but a future/modded tileset PNG with an off dimension would silently render garbage instead of erroring.
Fix: `if (png.width % 8 !== 0 || png.height % 8 !== 0) throw new Error(...)` at the top of `sliceTiles`, naming the actual width/height.

**2. `parseMetatiles`/`parseCollision` errors don't name the source file — inconsistent with the fix already applied to PNG and palette-map errors.**
- `parseMetatiles` (tileset.ts:19-28) throws `"metatiles buffer length X is not a multiple of 16"` — no path. Called at tileset.ts:326 with no wrapping.
- `parseCollision` (tileset.ts:234-251) throws `"unknown collision token ..."` — no path, and unlike `parsePaletteMap` it takes no `source` parameter at all. Called at tileset.ts:328 with no wrapping.
- Contrast: `parsePaletteMap` was given an explicit `source` param specifically to fix this class of problem (doc comment says so directly), and `loadGbcTilesetByName` wraps `readShadesPng`'s error with `gfxPath` at tileset.ts:340-348, with a comment explicitly citing "a corpus-level failure among 36+ PNGs wouldn't say which one" as the reason.
That same reasoning applies equally to a corpus-level `_metatiles.bin` or `_collision.asm` failure, but the fix wasn't carried over. Task's own review checklist asks for this ("Error messages name file/line/value").
Fix: either add a `source` param to `parseCollision` (mirroring `parsePaletteMap`), or wrap both calls at tileset.ts:326/328 the same way the PNG call is wrapped at 340-348 (`metatilesPath`/`collisionPath` in the rethrown message).

**3. `loadGbcTilesetByName` reads and re-parses `gfx/tilesets.asm` twice in the same call (tileset.ts:299-300).**
```
const gfxIncbins = parseIncbins(readFileSync(`${r}/gfx/tilesets.asm`, "utf8"));
const collIncludes = parseIncludes(readFileSync(`${r}/gfx/tilesets.asm`, "utf8"));
```
Two `readFileSync` + two independent line-scans of the identical file content, every single call. Trivial to avoid and cheap to fix now, before Task 9/10 start calling this per-map (37 tilesets × repeated calls across 1209 maps compounds it). Not a caching architecture question — just don't read the same file twice in one function.
Fix: `const tilesetsAsmText = readFileSync(...); const gfxIncbins = parseIncbins(tilesetsAsmText); const collIncludes = parseIncludes(tilesetsAsmText);`

## Minor

**4. `parseCollisionConstants` (tileset.ts:216-224) doesn't go through `codeLines`/`stripMacroDefs`, unlike its sibling `parseConstDefs`.**
Both parse a `constants/*.asm` file line-by-line with `stripComment`; `parseConstDefs` (line 63-81) runs `stripMacroDefs(text)` first, `parseCollisionConstants` does a raw `text.split(/\r\n|\n/)`. Harmless today — the real `collision_constants.asm` has no `MACRO`/`ENDM` (checked directly against the corpus) — but it's an unnecessary second style/implementation for "iterate this file's code lines" in the same file, and would silently mis-parse if a macro block were ever added. Low cost to align: swap the `split` for `stripMacroDefs(text)`.

**5. No cross-call cache for shared table files, but this looks like the right call for now, not a gap.**
`loadGbcTileset`/`loadGbcTilesetByName` re-read+re-parse `gfx/tilesets.asm`, `constants/tileset_constants.asm`, `constants/collision_constants.asm`, `data/tilesets.asm` on every call, with zero memoization. Across 1209 maps sharing 37 tilesets (Task 9/10), that's real repeated I/O — but the loader stays a pure, side-effect-free function this way, and the corpus test in this very diff (tileset.test.ts:653-659) already demonstrates the intended pattern: caller-side `Map<string, GbcTileset>` keyed by `constName`. Recommend Task 9/10 do the same rather than adding a cache inside this module. Worth a one-line doc-comment note on `loadGbcTileset` saying "callers loading many maps should cache by tilesetConst" so Task 9 doesn't rediscover this.

**6. Reviewer-noted test gaps from the spec review are already closed in this diff — not open items.**
- (a) Paeth bpp=4: closed. png.test.ts:144-160 adds hand-derived Up/Average/Paeth cases at bpp=4 (RGBA), not just Sub.
- (b) wrong `rept` count: closed. tileset.test.ts:280-289 ("case B") uses `rept 12` instead of `rept 16` and asserts the refusal names `"rept 16"`.
No action needed; flagging so it isn't rediscovered as a gap later.

## Other checks (no issues)

- **File size/cohesion**: tileset.ts is 407 lines (365 added). In line with repo precedent (`map.ts` is 344 lines for a comparably-scoped parser); the added code is all tileset-domain (metatiles/const-defs/table/palette-map/collision/loader/pngTileIndex) and reads as one cohesive unit. Splitting palette-map/collision into separate files isn't recommended — no consumer (Task 6, Task 9, Plan 7) needs them addressable independently of the tileset loader.
- **Duplicated asm-parsing logic**: clean, aside from Minor #4 above. `codeLines`/`stripMacroDefs`/`matchCall`/`stripComment` from `asm.ts` are reused throughout `parseConstDefs`, `parseTilesetsTable`, `parsePaletteMap`, `parseCollision` — no reimplemented comment/MACRO handling.
- **`unfilterScanlines` extraction**: clean minimal refactor. GBA `load/png.ts` call site (line ~91) shrank from a ~20-line inline loop to one call; behavior identical (verified by full corpus PNG tests still passing). GBC `png.ts` calls the same shared function for bpp=1 and bpp=4 cases — one implementation, no drift risk.
- **Types** (`gbc/model/types.ts`): `PaletteMapEntry`, `Collision`, `GbcTileset` fields are sensible for Task 9 (direct `ts.metatiles[id]`, `pngTileIndex(ts, tileId)`, `ts.tiles[idx]` access patterns). `Uint8Array[]` for pixel tiles vs `number[]` for small metatile grids is a deliberate, documented split (perf for the former, simplicity for the latter) — consistent with existing `Metatile.tiles: number[]`, not a new inconsistency.
- **Perf (measured)**: tileset.test.ts's full-corpus test (37 tilesets, all real maps, every placed tile resolved) runs in the 691ms bucket with the other 52 tests in that file — no per-test slowness observed. The double-read (Important #3) and no-cross-call-cache (Minor #5) are the only perf-relevant findings; neither shows up yet at this corpus size.

## Verdict
3 Important, 3 Minor (2 of which are advisory/no-action). No Critical issues; nothing here blocks merge, but Important #2 (file-naming in metatiles/collision errors) and #3 (duplicate read) are cheap enough to fix in this same task before Task 9 builds on top.

## Re-review 1

Scope: `git diff 7c58bb4 b3a7d45 -- packages` (tileset.ts +67/-18, tileset.test.ts +37). All 5 requested items verified fixed, each with a new test:

- **I1** (`sliceTiles` %8 refusal): fixed. `sliceTiles` now takes `source` and throws `sliceTiles: ${source}: ${width}x${height} isn't a multiple of 8x8` before computing `cols`/`rows` (tileset.ts:260-271). Test added: `oddWidthGrayscalePng(10)` fixture, asserts throw names `10` and `gfx/tilesets/tiny.png` (tileset.test.ts:603-613).
- **I2** (file-named metatile/collision errors): fixed both. `parseMetatiles(buf, source = "<metatiles>")` prefixes its error with `source` (tileset.ts:19-23); `parseCollision(text, collConsts, source = "<collision>")` prefixes both its "wrong arg count" and "unknown token" errors with `source` (tileset.ts:238-256). Both call sites pass `metatilesPath`/`collisionPath` (tileset.ts:350,352). Tests added: bad-length `metatiles.bin` throw names the path (tileset.test.ts:615-621); unknown collision token throw names the path (tileset.test.ts:623-629).
- **I3** (single read of `gfx/tilesets.asm`): fixed. One `readFileSync` into `tilesetsAsmText`, passed to both `parseIncbins`/`parseIncludes` (tileset.ts:320-323), with a comment citing the review issue. No dedicated test needed (behavior-invariant refactor; covered by existing loader tests still passing).
- **M4** (`parseCollisionConstants` via `stripMacroDefs`): fixed. Now `for (const line of stripMacroDefs(text))` instead of raw `text.split(...)` (tileset.ts:222-227), doc comment explains why (aligns with sibling `parseConstDefs`, future-proofs against a macro block). No behavior change on the real corpus file (confirmed no `MACRO`/`ENDM` in it) — existing `parseCollisionConstants` tests still pass unmodified.
- **M5** (cache doc-comment): fixed. `loadGbcTileset`'s doc comment now explicitly states it stays a pure, side-effect-free, uncached call per invocation, and tells a many-map caller (Task 9/10) to cache by `tilesetConst` itself, pointing at the pattern the corpus test already uses (tileset.ts:385-391).

Regressions: none. `npm test` → 81 files / **919 passed** (was 916; +3 for I1/I2's two new tests — arithmetic: +1 I1, +2 I2 = +3, consistent). `npm run typecheck` → clean.

No new findings. All 5 items closed. **APPROVED.**
