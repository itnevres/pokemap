# Plan 6 Task 9: per-map renderer (re-granularised 2026-09-24 against real code at 16fad97)

Binding sources: the plan's Task 9 text; findings §Extra (Border), §3.4 steps 4-5 (roof); Decisions 3 and 6; "Consequences → Task 9". Where the plan text and the findings disagree, the findings win. The plan says "render/layout.ts, no border ring unless found". The findings found a ring, and say to render per map, not per layout.

## Real facts this spec is built on (verified by the coordinator against source)

- **Metatile.** 16 bytes = 4×4 tile ids, row-major (`GbcTileset.metatiles[i].tiles`). So a metatile is 32×32 px, and a block is one metatile.
- **Tile pixels.** `GbcTileset.tiles[pngIndex]` is a `Uint8Array(64)` of shades 0-3. Use `pngTileIndex(ts, tileId)` (`load/tileset.ts:406`) for tile id → PNG index. It returns `null` for unmapped ids; never guess.
- **Tile palette.** `ts.palMap[tileId].pal` gives the `PAL_BG_*` index (0-7). The colour of a pixel is `palettes[pal][shade]`, where `palettes` is the `RGB[][]` (8×4) from `resolveFromTables(tables, map, {time, flash})` (`load/palette.ts:642`). Load `tables` once per project via `loadPaletteTables(root)`.
- **Roof tile swap** (Decision 6; `engine/tilesets/mapgroup_roofs.asm`; `home/map.asm` `LoadTilesetGFX`).
  - It applies only when `map.tileset` is `TILESET_JOHTO`, `TILESET_JOHTO_MODERN` or `TILESET_BATTLE_TOWER_OUTSIDE`.
  - `MapGroupRoofs[map.group]` comes from `data/maps/roofs.asm` (`db -1` = none, else a `ROOF_*` const from that file's own `const_def`). It selects entry N of the `Roofs:` INCBIN list in that same file. Resolve each `.2bpp` path to `.png` the way `tileset.ts`'s `pngPathFor` does, via the INCBIN (I4: never name-mangle).
  - Each roof PNG is 24×24 grayscale depth 2, i.e. 9 tiles in row-major 3×3 order (same slicing as `sliceTiles`).
  - They are copied to `vTiles2 tile $0a` in VRAM bank 0. `LoadTilesetGFX` pops `rVBK` back before the farcall, so they replace **PNG tile indices $0A-$12** (bank-0 ids $0A-$12, which `pngTileIndex` maps to indices $0A-$12).
  - Implement it as a per-map copy of the tileset's `tiles` array with those 9 entries replaced. Never mutate the cached tileset.
  - `MapGroupRoofs` is indexed by `map.group` directly (1-based `newgroup` order, entry 0 unused). Verify this: the table is `assert_table_length NUM_MAP_GROUPS + 1`, with the "; 24 (New Bark)" comment at index 24.
- **Border** (findings §Extra Border).
  - `GbcMap.border` is ONE metatile id. The engine pads with `MAP_CONNECTION_PADDING_WIDTH EQU 3` rings (`constants/gfx_constants.asm`; read the value from there, don't hardcode it).
  - `LoadMetatiles` substitutes the border metatile for ANY block byte 0, including inside the map: `ld a,[de] / and a / jr nz / ld a,[wMapBorderBlock]`. Replicate that for map blocks too.
  - 272 maps have border `$00`, so rendering metatile 0 as the ring is the common case.
- **Layout.** `loadLayout(root, map)` (`load/map.ts:305`) returns `{layout, defects}`. The 2 CeruleanCave oversize files load their first w×h bytes and produce 1 defect each (Decision 3). Surface these defects on the render result; never drop them.
- **Maps.** `loadGbcMaps(root)` returns `{maps, map(name)}`. The map name is the `map_attributes` name, e.g. `NewBarkTown`.
- **Tilesets.** `loadGbcTileset(root, const)` is uncached by design, and its doc tells callers to cache by const.
- **Raster.** Reuse the family-agnostic `packages/core/src/render/raster.ts` (`createRaster`, `blit`, `fillRect`); `data` is RGBA.

## Deliverables

1. **`packages/core/src/gbc/project.ts`: `openGbcProject(root): GbcProject`.** This is the shared per-root cache Tasks 10-12 will reuse. It has:
   - `root`, `maps`, and `map(name)` (delegating to `loadGbcMaps`, which already refuses a non-GBC root with a clear message);
   - `tileset(tilesetConst)`, cached per const;
   - `paletteTables()`, lazy and cached;
   - `roofs()`, lazy and cached: the parsed `MapGroupRoofs` plus the roof tile sets;
   - `layout(map)`, which is `loadLayout` with no caching needed.
   Everything is read-only, and a missing file fails loudly.
2. **`packages/core/src/gbc/load/roofs.ts`.**
   - A pure `parseRoofsAsm(text)` returns `{ mapGroupRoofs: (number | null)[], roofPngPaths: string[] }`. It refuses (throws, naming file:line) unknown ROOF consts, non-`db` lines inside the table, and any `table_width`/INCBIN shape it doesn't understand.
   - A loader decodes each roof PNG with `readShadesPng` and slices it into 9 tiles. It refuses any PNG that isn't 24×24.
3. **`packages/core/src/gbc/render/map.ts`.**
   - `renderGbcMetatile(tiles: Uint8Array[], ts, metatileId, palettes)` returns a 32×32 `Raster` plus flags. It is pure; `tiles` is passed separately so the roof-swapped copy can be used.
   - `renderGbcMap(proj, mapName, opts?: { border?: number /* rings, default 0, max = padding width 3; refuse other values */; time?: "morn"|"day"|"nite"; flash?: boolean; blocksOverride?: Block[] })` returns a `GbcMapRaster`.
   - `GbcMapRaster extends Raster` adds `mapName`, `blockWidth`, `blockHeight`, `originX`, `originY`, `outOfRangeCount` (map blocks whose metatile id ≥ `metatiles.length`, counted per block, border ring excluded, like GBA's `LayoutRaster`), `unmappedTileCount` (tile ids where `pngTileIndex` returned null, counted over map blocks only), and `defects: DataDefect[]` (from `loadLayout`).
   - **Out-of-range metatile and unmapped tile.** Pick ONE fixed, documented placeholder colour, e.g. opaque magenta (255,0,255). GBA leaves out-of-range metatiles transparent, but here a visible placeholder is preferred. State the choice and keep it consistent.
   - **Block-0 → border substitution** applies inside the map as well as in the ring.
   - `blocksOverride` must have exactly w×h entries, or it refuses. It follows the GBA `renderLayout` precedent and is kept for Plan 7's edit sessions.
   - Cache rendered metatiles per `renderGbcMap` call, keyed by id.
4. **Tests** in `packages/core/test/gbc/render/map.test.ts` and `packages/core/test/gbc/load/roofs.test.ts`.
   - **Unit, hand-derived.** Use a synthetic tileset with 2 metatiles and a few tiles with known shades, synthetic palettes and a synthetic palMap (including bank 1 and one null entry). Assert exact RGBA at specific pixels. Cover:
     - a tile placed at each of the 4×4 positions (catches transposition);
     - palette selection per tile;
     - an unmapped tile → placeholder;
     - metatile id out of range → placeholder, with the count incremented.
     You'll need a small in-memory `GbcProject` stub for `renderGbcMap` unit tests; build it from `GbcProject`'s own interface, and don't use unchecked `as` casts to a partial shape (RESUME lesson).
   - **Unit.** Block-0 substitution inside the map. Border ring geometry: `border: 3` gives `(w+6)*32 × (h+6)*32` with origin 96,96; ring pixels come from the border metatile. `border: 4` is refused.
   - **Unit.** The roof swap replaces exactly indices $0A-$12, only for the 3 tilesets; `db -1` group → no swap; the cached tileset stays unmutated.
   - **Unit.** `parseRoofsAsm` on a fixture copied verbatim from the real file's shape, plus refusals naming file:line.
   - **Corpus** (`itWithGbcCorpus` from `test/gbc/helpers/corpus.ts`):
     - **NewBarkTown** (JOHTO, TOWN, PALETTE_AUTO, group 24, roof NEW_BARK, border $05). Pin exact RGBA at ≥3 pixels, derived INDEPENDENTLY of the renderer, and show the derivation chain in a comment (block byte → metatile → tile id → png index → shade → palette → RGB). One pixel must lie inside a roof tile (ids $0A-$12) and differ from the unswapped tileset's pixel there, which proves the swap matters. One pixel must be in the border ring with `border: 3`.
     - **ElmsLab or PlayersHouse1F** (border $00). Pin a ring pixel from metatile 0 and an interior pixel.
     - **All 391 maps render without throwing.** `outOfRangeCount` and `unmappedTileCount` are measured and pinned (whatever the real numbers are, report them). Exactly 2 maps carry a defect: the CeruleanCave pair, and `defects` names their files.
     - **Determinism:** NewBarkTown rendered twice gives byte-identical `data`.
     - A `time: "nite"` NewBarkTown render differs from `day` at a pinned pixel.
   - Grep `packages/*/test/**` for the map names you use before adding tests (RESUME lesson). Every test here is read-only.
5. **Mutation-check.** At minimum:
   - transpose the 4×4 tile loop;
   - drop the block-0 substitution;
   - off-by-one the roof range ($0B-$13);
   - index `MapGroupRoofs` by `group - 1`;
   - drop the tileset gate on the roof swap;
   - mutate the cached tileset in place (a second map without a roof must then show roof tiles, and a test must catch that);
   - ignore `palMap.pal`;
   - hardcode ring width 3 instead of reading it.
   Record each mutation and which test went red.

## Out of scope
- The CLI (Task 10), world stitching (Task 11) and the atlas (Task 12).
- Tile animation (water/flower frames): render the static PNG frame and say so in a doc comment.
- Sprites and events overlays.
- No write path. Never write to the subject repo.
