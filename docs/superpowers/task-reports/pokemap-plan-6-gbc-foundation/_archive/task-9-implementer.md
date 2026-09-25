# Plan 6 Task 9: GBC per-map renderer -- implementer report

Worktree: `/home/user/pokemap/.claude/worktrees/agent-a5471bd90c343f9d4`
Branch: `worktree-agent-a5471bd90c343f9d4` (fast-forwarded onto `plan-6-gbc-foundation` at `5e453f1` before starting -- see "Setup note" below)

## Setup note (read this first)

The worktree handed to me was **not** at the tip of `plan-6-gbc-foundation`. Its
branch (`worktree-agent-a5471bd90c343f9d4`) pointed at `bcdfd63`, an ancestor
commit that predates the entire GBC arc (Tasks 1-8 didn't exist there --
`packages/core/src/gbc/` was missing outright). I verified with
`git merge-base --is-ancestor` that `bcdfd63` is a genuine ancestor of
`plan-6-gbc-foundation` (not a diverged branch), confirmed the working tree had
no uncommitted changes of consequence (only a stray `package-lock.json`
re-lock from `npm install`, which I discarded), and fast-forwarded
(`git merge --ff-only plan-6-gbc-foundation`) to `5e453f1` ("docs: Plan 6
handoff note (Tasks 1-7 done, Task 8 fix round next)"). This is a pure
fast-forward, not a rebase or merge commit, and it brought in exactly the
Tasks 1-8 code and docs the spec assumes exist. I did this before writing any
of my own code, so my HEAD's history is: `plan-6-gbc-foundation@5e453f1` +
my own commit. Flagging this plainly since it wasn't something I was told to
do, but the task was impossible without it.

## Files changed

New:
- `packages/core/src/gbc/load/roofs.ts` -- `parseRoofsAsm` + `loadGbcRoofs`.
- `packages/core/src/gbc/project.ts` -- `openGbcProject`/`GbcProject`.
- `packages/core/src/gbc/render/map.ts` -- `renderGbcMetatile` + `renderGbcMap`.
- `packages/core/test/gbc/load/roofs.test.ts` (13 tests).
- `packages/core/test/gbc/render/map.test.ts` (27 tests).

Modified:
- `packages/core/src/gbc/load/tileset.ts` -- exported the previously-private
  `sliceTiles` (unchanged body) and generalized `pngPathFor`'s regex to also
  accept a bare `.2bpp` (no `.lz`), which is the shape `data/maps/roofs.asm`'s
  `Roofs:` INCBINs use (`gfx/tilesets/roofs/new_bark.2bpp`, not
  `.2bpp.lz`) -- reused rather than duplicated, per the task's own
  instruction. Both are still used exactly as before for the `.2bpp.lz` case.
- `pokemap.config.json` -- local-only `gbc.projectPath` set to
  `/home/user/pokecrystal-PerfPlus`. **Not committed** (never `git add`ed).

## Design choices

- **`renderGbcMetatile(tiles, ts, metatileId, palettes)`** is pure and takes
  `tiles` separately from `ts` exactly as the spec asked, so a per-map
  roof-swapped copy can be passed without ever touching `ts.tiles`. It mirrors
  GBA's `MetatileRaster.outOfRange` flag and adds `unmappedTiles` (a count,
  not a flag, since up to 16 independent tile-slot lookups can each miss).
- **Placeholder color**: opaque magenta `(255,0,255,255)`, one constant
  (`PLACEHOLDER`), used for both an out-of-range metatile (whole 32x32) and an
  individual unmapped tile slot (its own 8x8). Documented in `map.ts`'s doc
  comment as a deliberate choice (GBA leaves these transparent; here a visible
  placeholder was preferred per the spec).
- **Roof tile swap** (`roofSwappedTiles`, private to `render/map.ts`): gated on
  `map.tileset` being one of the 3 real constants, looks up
  `proj.roofs().mapGroupRoofs[map.group]` (direct index, no `-1`), and returns
  `ts.tiles` **by reference, unchanged** when no swap applies (the common
  case) -- it only ever writes into a fresh `.slice()`. This is the one path
  the "mutate cached tileset in place" mutation targets, and the mutation
  check (below) confirms both a dedicated unit test and, as a bonus, the real
  VioletCity corpus pixel test catch it (because `GbcProject.tileset()` caches
  by const, so a mutated array corrupts every later map that reuses it).
- **`MAP_CONNECTION_PADDING_WIDTH`**: read from `constants/gfx_constants.asm`
  via a new `GbcProject.paddingWidth()` (lazy, cached), not hardcoded. I put
  the tiny `DEF ... EQU N` parser in `project.ts` rather than `render/map.ts`
  or a shared `load/` module, since it's a one-off single-constant read this
  task introduces and future tasks (11: world stitching) are the more likely
  next consumer of a project-level padding constant.
- **`border` option semantics**: I read the spec's "`border?: number` /*
  rings, default 0, max = padding width 3 */" together with the Tests
  bullet's concrete example ("`border: 3` gives `(w+6)*32 x (h+6)*32`") as:
  `border` is the padding depth **in blocks**, directly (not a multiplier of
  the real constant, unlike GBA's `renderLayout`'s `rings * borderWidth`).
  Valid range is an integer `0..paddingWidth()` inclusive; anything else
  (negative, fractional, or above the cap) is refused. `border: 4` is refused
  against the real corpus (`paddingWidth() === 3`); a unit test with a stubbed
  `paddingWidth() => 2` proves `border: 3` is refused and `border: 2` isn't --
  which is also the mutation check for "hardcode ring width 3".
- **Block-0 substitution**: applied identically whether the byte is read from
  a real map block or is conceptually the ring's own byte. Since Task 9 never
  stitches a real neighboring map's connection data into the ring (that's
  Task 11's job), every ring cell's byte is always treated as 0, so the ring
  is simply "always the border metatile" -- I implemented it that way
  directly (no per-cell substitution branch for the ring) rather than
  synthesizing a phantom "0" byte and running it through the same branch,
  since the two are behaviorally identical and the direct form is clearer.
- **Caching**: `renderGbcMap` caches rendered `GbcMetatileRaster`s in a
  `Map<number, GbcMetatileRaster>` per call, as asked. I did not add a
  dedicated test that proves this caching happens (e.g. a call-counting
  spy) -- it's not in the mutation list, and every test that exercises a
  repeated metatile id (the border-ring tests, where the ring and various
  interior cells share ids) already exercises the cache's *correctness*
  (same id -> same raster) without needing to prove it was memoized rather
  than recomputed identically. Flagging this as the one deliberately-skipped
  test angle.
- **`GbcProject`**: mirrors the GBA `Project`'s shape and its
  cache-per-varying-key pattern (`tileset` per const, `paletteTables`/`roofs`
  lazy-once, `layout` uncached since it's cheap and per-call anyway, matching
  `loadLayout`'s own doc comment).
- **`parseRoofsAsm`**: a strict two-table phase machine (mirrors
  `parsePaletteMap`'s reasoning), refusing any line inside either table that
  isn't the exact shape expected, an unknown `ROOF_*` name, or a
  `MapGroupRoofs` entry whose roof index is beyond what `Roofs:` actually
  has. Reuses `codeLines`/`stripComment`/`parseConstDefs` from `asm.ts` rather
  than re-implementing comment/line handling.

## Real facts / corpus values measured

All measured against `/home/user/pokecrystal-PerfPlus` (the read-only subject;
`git status --porcelain` on it is empty at the end).

- **All 391 maps render without throwing** (`proj.maps.length === 391`).
- **`outOfRangeCount` summed over all 391 maps (day render): 0.**
- **`unmappedTileCount` summed over all 391 maps (day render): 0.**
  Every placed metatile id is within its tileset's range, and every placed
  tile id resolves to a real PNG tile, across the whole corpus.
- **Exactly 2 maps carry a defect**: `CeruleanCave2F` and `CeruleanCaveB1`,
  both `maps/*.blk: actual size 400 bytes, declared 9x15=135 -- loaded first
  135 bytes, not writable` (matches Decision 3 exactly; these come straight
  through from `loadLayout`, unmodified).
- **New Bark Town's own roof swap is a real, measured no-op.** I decoded
  `gfx/tilesets/johto.png` and `gfx/tilesets/roofs/new_bark.png` independently
  (a from-scratch Python PNG/zlib/unfilter decoder, not this repo's
  `readShadesPng`) and found all 9 tiles at PNG indices `$0A-$12` are
  **byte-identical** between the two. This makes sense in hindsight -- New
  Bark is the starting town, so its roof art is baked into the base tileset
  graphic, and only the *other* 4 towns need the dynamic swap -- but it means
  the spec's literal ask ("one pixel [in NewBarkTown] must ... differ from
  the unswapped tileset's pixel there") cannot be satisfied using NewBarkTown
  itself. See "Deviations" below for how I handled this.

### Corpus pixel derivations (independent of the renderer)

Every pin below was computed by hand from raw bytes (`od -An -tx1 -v` on the
`.blk`, a from-scratch Python `_metatiles.bin` slice, the real
`*_palette_map.asm`/`environment_colors.asm`/`roofs.pal`/`bg_tiles.pal`
source text, and an independent from-scratch PNG decoder), then checked
against the actual renderer's output -- every one matched exactly. The full
chain is also written as a comment beside each corpus test in
`render/map.test.ts`.

**NewBarkTown** (`TILESET_JOHTO`, TOWN, `PALETTE_AUTO`, group 24 = New Bark,
border `$05`):
- `.blk` byte[2] (block x=2,y=0) = `0x18` = metatile 24. Its position 12
  (row3,col0) = tile `$0A` (a real `PAL_BG_ROOF` tile,
  `johto_palette_map.asm` line 2). `pngTileIndex($0A) = 10`. `johto.png` tile
  10, row0 = shades `[3,3,0,1,1,1,2,1]`; sub-pixel (row0,col2) = shade 0.
  Palette: day `OutdoorColors` slot ROOF = `$0e` = `bg_tiles.pal[14]`
  ("day roof") = `RGB 27,31,27, 15,31,31, 05,17,31, 07,07,07`; color0 is
  never touched by the roof-pal patch (that only overwrites colors 1-2). 5->8
  bit: `27->222, 31->255, 27->222`. **Pixel (66,24) = (222,255,222,255).**
  (New Bark's own roof PNG gives the identical byte at this position -- see
  above -- so this pin is correct with or without the swap.)
- `.blk` byte[0] = `0x05` = metatile 5. Position 0 (row0,col0) = tile `$1E`,
  `PAL_BG_GREEN` (`johto_palette_map.asm` line 4, index 6 of 8). `johto.png`
  tile 30, row0 = `[1,0,1,0,1,0,0,3]`; (row0,col0) = shade 1. Day
  `OutdoorColors` GREEN slot = `$0a` = `bg_tiles.pal[10]` = `RGB 22,31,10,
  12,25,01, 05,14,00, 07,07,07`; color1 (5-bit `12,25,1`) -> 8-bit
  `(99,206,8)`. **Pixel (0,0), day = (99,206,8,255).**
- Same pixel, `time: "nite"`: `PALETTE_AUTO`'s row is
  `[DARKNESS_F,NITE_F,DAY_F,MORN_F] = [3,2,1,0]`; nite's clockIndex=2 ->
  `timeOfDayPal = row[1] = 2`. Nite `OutdoorColors` GREEN slot = `$12` =
  `bg_tiles.pal[18]` = `RGB 15,14,24, 08,13,19, 00,11,13, 00,00,00`; shade1 ->
  `(8,13,19)` -> 8-bit `(66,107,156)`. **Pixel (0,0), nite =
  (66,107,156,255)** -- confirmed different from day.
- Border ring, `border: 3`: dims `(320+192, 288+192) = (512,480)`,
  origin `(96,96)`. Ring block (bx=0, by=5, west strip) shows metatile 5's own
  position 5 (row1,col1) = tile `$2F`, `PAL_BG_GREEN` again
  (`johto_palette_map.asm` line 6, index 7). `johto.png` tile 47, row0 =
  `[2,2,2,2,2,2,3,0]`; (row0,col7) = shade 0 -> day GREEN color0
  `(22,31,10)` -> 8-bit `(181,255,82)`. **Pixel (15,168) =
  (181,255,82,255).**
- `border: 4` is refused (`paddingWidth()` is 3 in the real corpus).
- Two calls with identical options produce byte-identical `data`.

**VioletCity** (`TILESET_JOHTO`, TOWN, `PALETTE_AUTO`, group 10 = Violet, roof
VIOLET) -- proves the swap matters and that `MapGroupRoofs` is indexed by
`map.group` directly:
- `.blk` (20x18) byte at (x=4,y=7) = `0x18` = metatile 24 again (shared
  `_metatiles.bin`), position 12 = tile `$0A`.
- Sub-pixel (row0,col1): unswapped `johto.png` tile `$0A` row0 = shade 3;
  swapped `roofs/violet.png` tile 0 row0 = shade 0. Day ROOF color0 (never
  patched) = `bg_tiles.pal[14]` color0 `(27,31,27)` -> 8-bit `(222,255,222)`;
  color3 (unswapped baseline) = `(7,7,7)` -> 8-bit `(57,57,57)`. Absolute
  pixel `(128+1, 224+24) = (129,248)`. **Real render = (222,255,222,255)**,
  independently confirmed different from a direct
  `renderGbcMetatile(ts.tiles, ...)` call on the *unswapped* tileset at the
  same local pixel (`(57,57,57,255)`) -- proving the swap changes this map's
  actual output.
- Sub-pixel (row0,col3), chosen because it discriminates group 10 (Violet,
  correct) from group 9 (Lake of Rage -> `ROOF_AZALEA`, what a `group - 1`
  bug would use): `violet.png` tile0 row0 col3 = shade 1 ->
  `roofs.pal` group 10 morn/day pair `(24,14,31)` -> 8-bit `(198,115,255)`;
  `azalea.png` tile0 row0 col3 = shade 2 -> the pair's other color
  `(13,7,21)` -> 8-bit `(107,57,173)` (a different value). Absolute pixel
  `(131,248)`. **Real render = (198,115,255,255)** -- the correct group-10
  value.

**ElmsLab** (`TILESET_LAB`, INDOOR, `PALETTE_DAY`, border `$00`, group 24 =
New Bark -- same group as NewBarkTown, which *does* have a real roof entry):
- `.blk` (5x6) byte[7] (x=2,y=1) = 1 = metatile 1, all 16 positions tile
  `$10`, `PAL_BG_GRAY` (`lab_palette_map.asm` line 3, index 0).
  `pngTileIndex($10) = 16`. `lab.png` tile 16, row0 = uniform shade 1.
  `PALETTE_DAY` forces `DAY_F` regardless of the clock; INDOOR day row slot
  GRAY = `$20` = `bg_tiles.pal[32]` ("indoor gray") = `RGB 30,28,26, 19,19,19,
  13,13,13, 07,07,07`; shade1 -> `(19,19,19)` -> 8-bit `(156,156,156)`.
  **Pixel (64,32) = (156,156,156,255).**
- Border ring, `border: 3`: dims `(352,384)`, origin `(96,96)`. Metatile 0
  (the border metatile, id `$00` -- the common case, 272/391 maps) is all 16
  positions tile `$00`, uniformly shade 3 in `lab.png`; INDOOR day GRAY
  color3 (never patched, ElmsLab isn't TOWN/ROUTE) = `(7,7,7)` -> 8-bit
  `(57,57,57)` at every ring pixel. **Pixel (0,0) = (57,57,57,255).**
- Gate check: ElmsLab's group (24) genuinely has a roof entry
  (`ROOF_NEW_BARK`), but `TILESET_LAB` isn't JOHTO-family, so the pinned
  interior pixel above is the plain `lab.png` value -- tile `$10` sits inside
  `$0A-$12`, so if the tileset gate were dropped this pixel would instead show
  `new_bark.png` tile 6's (row0,col0) shade (0, not 1), a different color.
  This is a real, corpus-verified instance of the "drop the tileset gate"
  mutation having an observable effect, confirmed in the mutation-check table
  below.

## Mutation-check table

Each mutation was introduced with `Edit`, checked against
`packages/core/test/gbc/render/map.test.ts` (and `roofs.test.ts` where
relevant), confirmed red, then reverted and confirmed green again (`diff`
against a saved-off original copy showed the file byte-identical after every
revert).

| # | Mutation | File / change | Tests gone red |
|---|---|---|---|
| 1 | Transpose the 4x4 tile loop | `render/map.ts`: swapped `row`/`col` in `renderGbcMetatile` | 8 (incl. the dedicated "places a distinct tile at each corner" unit test, both NewBarkTown pins, VioletCity, ElmsLab, the corpus all-391 test) |
| 2 | Drop the block-0 substitution | `render/map.ts`: `metatileId = raw` instead of `raw === 0 ? map.border : raw` | 1 (the dedicated "substitutes the border metatile for a real block byte of 0" test) |
| 3 | Off-by-one the roof range (`$0B-$13`) | `render/map.ts`: `ROOF_FIRST_TILE_INDEX = 0x0b` | 2 (the dedicated "swaps exactly PNG tile indices $0A-$12" unit test, and the VioletCity corpus test) |
| 4 | Index `MapGroupRoofs` by `group - 1` | `render/map.ts`: `mapGroupRoofs[group - 1]` | 4 (the "never mutates the cached tileset" unit test -- which renders 2 maps at different groups and is sensitive to group-index bugs -- and the VioletCity corpus test's group-discriminating pixel) |
| 5 | Drop the tileset gate on the roof swap | `render/map.ts`: `if (false && !ROOF_TILESETS.has(...))` | 13 (every roof-swap unit test plus the ElmsLab corpus gate assertion) |
| 6 | Mutate the cached tileset in place | `render/map.ts`: `const swapped = ts.tiles;` (drop `.slice()`) | 2 (the dedicated "never mutates the cached tileset" unit test, and -- unprompted bonus -- the VioletCity corpus test, because `GbcProject.tileset()`'s real caching lets the corruption leak across maps) |
| 7 | Ignore `palMap.pal` | `render/map.ts`: `const pal = 0;` | 13 (every test that depends on a non-zero palette index, incl. both NewBarkTown/VioletCity/ElmsLab corpus pins) |
| 8 | Hardcode ring width 3 instead of reading it | `render/map.ts`: `const maxRings = 3;` | 1 (the dedicated "reads the padding-width cap from the project instead of hardcoding 3" test, which stubs `paddingWidth() => 2`) |

No mutation survived; none required adding a new test after the fact.

## Test counts

- `npx vitest run packages/core/test/gbc`: **12 files / 363 tests, all green,
  0 skipped** (up from the pre-existing 10 files / 323 tests -- +2 files,
  +40 tests: 13 in `roofs.test.ts`, 27 in `render/map.test.ts`).
- `npm run typecheck`: clean (`tsc --noEmit` on both `tsconfig.base.json` and
  `packages/ui/tsconfig.json`).
- Full `npm test`: **17 failed test files, 1 failed test, 810 passed, 136
  skipped** -- identical in shape to the documented GBA baseline (17 GBA
  files failing at collection for lack of the GBA decomp, plus
  `write/corpus.test.ts`'s "has every reference engine available"). No new
  failures.
- `git -C /home/user/pokecrystal-PerfPlus status --porcelain`: empty.

## Concerns and deviations

1. **Worktree base was stale** (see "Setup note" above) -- I fast-forwarded it
   onto `plan-6-gbc-foundation`'s real tip before starting. This is the one
   deviation from "just implement the task" I made without being asked, and
   I want it flagged plainly rather than silently folded into my commit.
2. **NewBarkTown's roof swap is a measured no-op** (see above). The spec's
   test bullet for NewBarkTown asks for a pixel that "differ[s] from the
   unswapped tileset's pixel there, which proves the swap matters" -- I
   could not satisfy this literally using NewBarkTown, because the real bytes
   don't support it. I kept the NewBarkTown corpus test's roof-tile pixel
   pin (documenting the no-op finding right there in the test comment) and
   added the "swap matters" proof to a second, real corpus test on
   VioletCity instead (group 10, roof VIOLET), which does show a real,
   large pixel difference. I believe this satisfies the spirit of the
   requirement -- a real map, real bytes, a genuine before/after difference
   -- while being honest that it isn't literally NewBarkTown.
3. **No dedicated "caching actually happens" test.** `renderGbcMap` does
   cache per call as asked (`Map<number, GbcMetatileRaster>`), but I didn't
   write a call-counting/spy test to prove memoization specifically (as
   opposed to correctness under repeated ids, which is tested). It isn't on
   the mutation list, and I judged a synthetic call-counter not worth the
   fragility it would add. Happy to add one if wanted.
4. **`pngPathFor`'s regex was widened** (in `tileset.ts`) to accept a bare
   `.2bpp` (no `.lz`) in addition to `.2bpp.lz`, since `data/maps/roofs.asm`'s
   `Roofs:` INCBINs use the former. I reused/extended the existing function
   (per the task's explicit instruction) rather than writing a second
   resolver; the existing `.2bpp.lz` behavior is unchanged (verified by the
   full `tileset.test.ts` suite still passing) and its doc comment now notes
   both shapes.
5. **`border` option's exact semantics** were somewhat underspecified (see
   "Design choices" above for my reading and why). If the coordinator meant
   something different (e.g. `border` as a multiplier of the real constant,
   allowing values > `paddingWidth()`), that would be a small, localized
   change to `renderGbcMap`'s validation and the ring-geometry math -- flagging
   it in case my reading doesn't match intent, though it matches the spec's
   own worked example (`border: 3` -> `(w+6)*32`) exactly.

## Commit

Conventional Commit message (written to a file, committed with `git commit
-F`): `feat(core): GBC per-map renderer with roof tile swap and border ring`.
Staged paths (named explicitly, never `git add -A`): the 5 new files above
plus `packages/core/src/gbc/load/tileset.ts`. `pokemap.config.json` and
`package-lock.json` were never staged.

## Fix round 1

Addresses the Opus spec review (`task-9-spec-review.md`, commit `494380f`):
4 blocking issues (R2, R8/R8b, R10-R12) plus 8 minors.

### Required fixes

1. **R2 (`unmappedTileCount` ring exclusion untested).** The code already
   excluded the ring correctly (`if (countsTowardMapStats) { ...; += }`), but
   no test exercised a border metatile that itself had unmapped tiles, so the
   guard could be silently dropped without any test going red. Added a unit
   test (`render/map.test.ts`, "excludes the border ring from
   unmappedTileCount...") that renders with `border: 1` using a border
   metatile with 5 unmapped tile slots, asserts `unmappedTileCount === 0`,
   then places the same metatile as an interior block instead and asserts
   `unmappedTileCount === 5` (proving the exclusion is real, not an artifact
   of the metatile never actually being unmapped). No source change was
   needed; this closed a real test gap, not a bug.

2. **R8/R8b (bank-1 and explicit-null palMap entries untested).** Added:
   - A `renderGbcMetatile` unit test with a genuine `bank: 1` entry (tile id
     `0x85`, PNG index `0x65`) whose shade/palette differ from its bank-0
     "same low 7 bits" counterpart (`0x05`, PNG index `0x05`) -- plus a decoy
     tile planted at the *raw* tile id `0x85` in the tiles array, so a bug
     that reads `tiles[tileId & 0x7f]` (R8) or `tiles[tileId] ?? tiles[idx]`
     (R8b) is exposed, not accidentally correct.
   - Reworked the existing "unmapped tile" unit test to place an *explicit*
     `null` at tile id 2 (not a sparse/out-of-bounds index that merely reads
     back as `undefined`), matching the spec's literal ask.
   - Removed the `null as unknown as PaletteMapEntry` cast (minor m1) from
     the map-level "sums unmapped tiles" test; the array's own declared type
     (`(PaletteMapEntry | null)[]`) already accepts a literal `null`.

3. **R10/R11/R12 (`GbcProject` caching untested).** Added
   `packages/core/test/gbc/project.test.ts` with corpus-backed identity
   assertions: `proj.tileset("TILESET_JOHTO") === proj.tileset("TILESET_JOHTO")`,
   the same for a second const (also proving the cache is keyed, not a single
   memoized slot), `proj.paletteTables() === proj.paletteTables()`, and
   `proj.roofs() === proj.roofs()`.

4. **Tile-animation doc comment.** Added to `renderGbcMap`'s doc comment in
   `render/map.ts`: animated tiles (`*Anim`, `engine/tilesets/tileset_anims.asm`)
   render as their static PNG frame; there is no frame-cycling logic anywhere
   in the module.

### Minors fixed

- m1: see #2 above (null-cast removed).
- m2: the all-391 corpus test now asserts the defect `file` fields
  (`maps/CeruleanCave2F.blk` / `maps/CeruleanCaveB1.blk`), not just map names.
- m3: the `roofs.test.ts` `table_width`/INCBIN refusal tests now assert the
  full `data/maps/roofs.asm:<line>:` prefix, not just the message.
- m4: removed the ElmsLab test's "WAIT: verified..." working note and folded
  the duplicated gate assertion into one (the existing pin already proves the
  gate; the second identical `expect` added nothing).
- m5: `parseRoofsAsm` now refuses when `Roofs:`' entry count doesn't match
  the number of `ROOF_*` constants the file's own leading `const_def` block
  defines (a new unit test adds an unreferenced 6th constant and confirms the
  refusal, without tripping the pre-existing "unknown constant" check).
  `loadGbcRoofs` now additionally refuses when `MapGroupRoofs`' length
  doesn't match `constants/map_constants.asm`'s `newgroup` count + 1 (a new
  unit test builds a temp root with a mismatched count and confirms the
  refusal; the real corpus values -- 27 entries, 26 newgroups -- are pinned
  in the corpus tests for both `roofs.ts` and `roofs.test.ts`). Both existing
  `loadGbcRoofs` unit test fixtures were updated to include a valid
  `constants/map_constants.asm` (26 `newgroup` lines), since the function now
  reads it unconditionally.
- m6: documented on `RenderGbcMapOptions.blocksOverride` and
  `GbcMapRaster.defects` that writability is `proj.layout(map)`'s own fact
  (Decision 3) to report, not this render's -- an edit-session render with an
  override intentionally never surfaces it. No behavior change.
- m7: restored `tileset.ts`'s `pngPathFor` to Task 5's original strictness
  (`.2bpp.lz` only again); `roofs.ts` now has its own tiny `roofPngPathFor`
  that accepts only a bare `.2bpp`, used solely for `Roofs:`' own INCBINs.
  Added a `pngPathFor` unit test in `tileset.test.ts` confirming a bare
  `.2bpp` is refused again.

### Verification

- `npx vitest run packages/core/test/gbc`: **13 files / 370 tests, all
  green, 0 skipped** (was 12/363; +1 file (`project.test.ts`), +7 tests: the
  bank-1 unit test, the R2 unit test, the caching identity test, the
  ROOF_*-count-mismatch unit test, the newgroup-count-mismatch unit test, and
  2 `pngPathFor` unit tests).
- `npm run typecheck`: clean.
- `git -C /home/user/pokecrystal-PerfPlus status --porcelain`: empty.
- Full `npm test`: 17 failed test files, 1 failed test, 817 passed, 136
  skipped -- same shape as the documented GBA baseline (up from 810 passed
  before this round, matching the +7 new GBC tests; no new failures).
- Re-ran the reviewer's own `scratchpad/mut.py` against the full combined
  set: the original 8 (S1-S8) plus all 19 reviewer mutations (R1, R1b, R2-R19)
  -- 27 mutations total. **All 27 are killed**, including the 4 issues'
  mutation IDs that previously survived (R2; R8 and R8b; R10, R11 and R12).
  `git diff --stat` after the run shows only this round's own source/test
  changes (plus the pre-existing local `pokemap.config.json` line) -- every
  mutated file was correctly restored between runs. Full per-mutation kill
  list:

  | # | Mutation | Failures |
  |---|---|---|
  | S1 | Transpose 4x4 tile loop | 9 |
  | S2 | Drop block-0 substitution | 1 |
  | S3 | Roof range $0B-$13 | 2 |
  | S4 | `MapGroupRoofs[group-1]` | 4 |
  | S5 | Drop roof tileset gate | 14 |
  | S6 | Mutate cached tileset in place | 2 |
  | S7 | Ignore `palMap.pal` | 14 |
  | S8 | Hardcode ring cap 3 | 1 |
  | R1 | Roof pal nite boundary (`<=`) | 1 |
  | R1b | Roof pal boundary (day uses nite pair) | 9 |
  | R2 | `unmappedTileCount` counts ring | 1 (new test) |
  | R3 | `outOfRangeCount` counts ring | 1 |
  | R4 | Skip `blocksOverride` length check | 1 |
  | R5 | Unknown ROOF const accepted | 2 |
  | R5b | Unknown ROOF const -> null | 2 |
  | R6 | Placeholder on shade-0 pixels | 8 |
  | R7 | Within-tile x/y swap | 2 |
  | R8 | Bank ignored | 1 (new test) |
  | R8b | Raw tile id as PNG index | 1 (new test) |
  | R9 | Ring draws metatile 0, not `map.border` | 3 |
  | R10 | `tileset()` cache disabled | 1 (new test) |
  | R11 | `paletteTables()` cache disabled | 1 (new test) |
  | R12 | `roofs()` cache disabled | 1 (new test) |
  | R13 | `defects` dropped | 2 |
  | R14 | `time` not forwarded | 1 |
  | R15 | Roof tile count 8 | 8 |
  | R16 | `parsePaddingWidth` off by one | 1 |
  | R17 | Origin not offset by ring | 4 |
  | R18 | Unmapped tile left transparent | 1 |
  | R19 | Roof PNG 24x24 check removed | 1 |

  No mutation survived; none required a further test after this round.

## Fix round 2

Addresses the spec re-check (`task-9-spec-review-2.md`, commit `623ee41`,
1 new blocking issue) and the code-quality review (`task-9-quality-review.md`,
**Approved**, 5 minors).

### Required (spec re-check Issue 1)

`roofPngPathFor`'s own refusal (`roofs.ts`) named neither the file nor a
line -- unlike every other refusal in `parseRoofsAsm`'s phase machine. Fixed
by routing it through the same `fail(lineIndex, …)` the rest of the
`roofsIncbin` phase already uses (`try { roofPngPaths.push(roofPngPathFor(...)) }
catch (e) { throw fail(lineIndex, (e as Error).message); }`). Added two unit
tests: an `INCBIN "…/violet.2bpp.lz"` line (the real tileset-GFX shape, not
roofs' own bare `.2bpp`) and an `INCBIN "…/violet.bin"` line (no `.2bpp` at
all), both asserting the exact `data/maps/roofs.asm:47:` prefix (the real
violet INCBIN's line in `REAL_SHAPE_FIXTURE`) plus the offending path.
Confirmed via the reviewer's `scratchpad/mut2.py`: N6 (`roofPngPathFor` also
accepts `.2bpp.lz`) and N7 (accepts anything) both now kill 1-2 tests each;
they were the round's only 2 real survivors (N4 stayed equivalent, as
review 2 already noted).

### Quality minors (all 5)

1. **Shared `DEF NAME EQU value` helper.** Added `findDefEquLine(text, name,
   source)` (returns the matching line's own raw text, refusing by `source`
   when absent) and `findDefEqu(text, name, source)` (parses the value as a
   plain `$hex`/decimal literal via `parseNum`) to `asm.ts`.
   `project.ts`'s `parsePaddingWidth` is now a 1-line wrapper over
   `findDefEqu`. `palette.ts`'s `parseBrightnessLevels` now calls
   `findDefEquLine` for its `DARKNESS_PALSET` lookup -- but NOT `findDefEqu`,
   since that constant's value is a compound RGBDS expression
   (`(DARKNESS_F << 6) | ...`), not a plain number `parseNum` could parse;
   the existing code already only needed the line's raw text (fed to
   `findClockConstIn`), so this is genuinely the same "find the line" idiom
   at that level, not the "parse a number" one. All 41 `palette.test.ts`
   tests, including the 391x3x2 corpus sweep, stay green -- behavior is
   byte-identical.
2. **No more force-unwrap.** `findDefEqu` refuses (naming `source`) a
   `DEF NAME EQU` line with no parseable value after `EQU` (e.g. a trailing
   comment stripping it), instead of the old `parsePaddingWidth`'s
   `m![1]!` crashing with an unnamed `TypeError`. Falls out of #1 for free.
3. **Direct unit tests for the helper.** `asm.test.ts` gets a new
   `describe("findDefEquLine / findDefEqu")` block: success (plain and
   compound-expression values), "not found", and "malformed" (found but no
   value token) for each function. `project.test.ts` also gets a thin
   `describe("parsePaddingWidth")` (success + "not found"), matching its
   sibling single-constant parsers' existing direct coverage.
4. **`flash` forwarding test.** The corpus has real `PALETTE_DARK` maps
   (e.g. `WhirlIslandNW`, `TILESET_DARK_CAVE`/CAVE/border `$09`). Added a
   corpus test rendering it with `flash: true` vs `flash: false` and pinning
   pixel (0,0): `PALETTE_DARK`'s paletteIndex equals `BrightnessLevels`'
   `darkPaletteIndex`, so `resolveTimeOfDayPal` special-cases it before ever
   reading the time-of-day table -- `flash: true` -> `flashPalette`
   (`NITE_F`), `flash: false` -> `noFlashPalette` (`DARKNESS_F`), entirely
   independent of the `time` option. CAVE uses the Dungeon environment table;
   the placed tile's `PAL_BG_BROWN` slot resolves to `(66,33,41,255)` at
   `NITE_F` vs `(0,0,0,255)` at `DARKNESS_F` (both hand-derived from
   `cave_metatiles.bin`, `dark_cave.png`, `environment_colors.asm`'s Dungeon
   table and `bg_tiles.pal`, independent of the renderer, full chain in the
   test comment). Also pins that the no-option default matches `flash: true`.
   Manually confirmed dropping `flash` from `renderGbcMap`'s
   `resolveFromTables(...)` call turns this test red, then reverted.
5. **Border semantics cross-reference.** Added a note to
   `RenderGbcMapOptions.border`'s doc comment: unlike GBA's `renderLayout`'s
   same-named `border` (which multiplies by `layout.borderWidth`), GBC's
   `border: n` is exactly `n` blocks of padding -- GBC has no per-tileset
   border-block dimension to multiply by.

### Verification

- `npx vitest run packages/core/test/gbc`: **13 files / 381 tests, all
  green, 0 skipped** (was 13/370; +11 tests: 2 `roofPngPathFor` file:line
  unit tests, 6 `findDefEquLine`/`findDefEqu` unit tests, 2
  `parsePaddingWidth` unit tests, 1 flash-forwarding corpus test).
- `npm run typecheck`: clean.
- `git -C /home/user/pokecrystal-PerfPlus status --porcelain`: empty.
- Ran the reviewer's `scratchpad/mut2.py` filtered to `N6 N7` (this round's
  two required targets): both now kill a test each (`N6`: 1 failure; `N7`: 2
  failures), confirmed, then reverted. Manually applied and reverted the
  "drop `flash`" mutation on `renderGbcMap`'s `resolveFromTables(...)` call
  (dropping the `flash: opts.flash` field): the new flash-forwarding corpus
  test goes red, as required, then green again after reverting.
  I also started a full re-run of every mutation from both rounds (S1-S8,
  R1/R1b/R2-R19, N1-N9 -- 36 total) for extra confidence; it was interrupted
  partway through (after confirming S1-S4 all still kill correctly) by a
  session boundary, and its `finally`-block revert for the in-flight
  mutation (S6, "mutate cached tileset in place") did not get to run before
  the process was killed, leaving `render/map.ts` mid-mutation on disk. I
  caught this by checking every mutation's target line by hand afterward
  (`grep` for each of the 8 original mutations' exact "correct" text) before
  doing anything else, found the one leftover (`const swapped = ts.tiles;`
  missing its `.slice()`), fixed it by hand, and re-ran the full GBC suite
  and typecheck clean afterward -- both confirmed green. `git diff --stat`
  now shows exactly this round's own changes (plus the pre-existing local
  `pokemap.config.json` line), matching what it should be with every file
  correctly un-mutated.
