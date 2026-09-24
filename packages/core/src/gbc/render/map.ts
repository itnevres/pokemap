import type { GbcProject } from "../project.js";
import { pngTileIndex } from "../load/tileset.js";
import { resolveFromTables } from "../load/palette.js";
import type { Block, DataDefect, GbcTileset } from "../model/types.js";
import type { RGB } from "../../model/types.js";
import { createRaster, blit, fillRect, type Raster } from "../../render/raster.js";

/**
 * Tilesets whose graphics carry a dynamic per-mapgroup roof (`home/map.asm`
 * `LoadTilesetGFX`, GBC format findings §3.4 step 5 / Decision 6).
 */
const ROOF_TILESETS = new Set(["TILESET_JOHTO", "TILESET_JOHTO_MODERN", "TILESET_BATTLE_TOWER_OUTSIDE"]);

/** `LoadMapGroupRoof` copies 9 tiles starting at PNG tile index `$0A` (GBC format findings §3.4 step 5). */
const ROOF_FIRST_TILE_INDEX = 0x0a;
const ROOF_TILE_COUNT = 9;

/**
 * Placeholder for an out-of-range metatile id or a tile id with no
 * `pngTileIndex` mapping. Opaque magenta, chosen (unlike GBA's transparent
 * `MetatileRaster`) because a GBC render with no world-stitched neighbors to
 * show through is never meant to be layered -- a visible, unmistakable color
 * is more useful here than transparency. Keep this the ONE definition; every
 * placeholder pixel in this module goes through it.
 */
const PLACEHOLDER = { r: 255, g: 0, b: 255, a: 255 };

/**
 * One metatile's tiles (a 4x4 grid, row-major, tile id 0-255) rendered to a
 * 32x32 `Raster` (GBC format findings §3.2/§3.4). Pure: `tiles` is the PNG
 * tile array to draw from, passed separately from `ts` so a per-map
 * roof-swapped copy (Decision 6) can be used without ever mutating the
 * tileset's own cached `tiles` array.
 *
 * `outOfRange` mirrors GBA's `MetatileRaster.outOfRange` (`render/metatile.ts`):
 * true when `metatileId` isn't a valid index into `ts.metatiles`, in which
 * case the whole 32x32 raster is the placeholder and `unmappedTiles` is 0
 * (there's nothing to look up). Otherwise `unmappedTiles` counts how many of
 * the 16 tile slots had no `pngTileIndex` mapping (each painted as the
 * placeholder individually, since the other 15 may still be good data).
 *
 * Palette lookup assumes `palettes` has an entry for every `PAL_BG_*` index a
 * real palette map can name (0-7, `resolveFromTables`'s output always does)
 * -- this is a real-data invariant, not a caller-supplied one this function
 * re-validates, matching `renderMetatile`'s own `paletteFor` precedent of
 * trusting `split`/`profile`-shaped structural input.
 */
export interface GbcMetatileRaster extends Raster {
  outOfRange: boolean;
  unmappedTiles: number;
}

export function renderGbcMetatile(
  tiles: Uint8Array[],
  ts: Pick<GbcTileset, "metatiles" | "palMap">,
  metatileId: number,
  palettes: RGB[][],
): GbcMetatileRaster {
  const dst: GbcMetatileRaster = { ...createRaster(32, 32), outOfRange: false, unmappedTiles: 0 };

  if (!Number.isInteger(metatileId) || metatileId < 0 || metatileId >= ts.metatiles.length) {
    dst.outOfRange = true;
    fillRect(dst, 0, 0, 32, 32, PLACEHOLDER);
    return dst;
  }

  const metatile = ts.metatiles[metatileId]!;
  for (let i = 0; i < 16; i++) {
    const tileId = metatile.tiles[i]!;
    const row = Math.floor(i / 4);
    const col = i % 4;
    const ox = col * 8;
    const oy = row * 8;

    const idx = pngTileIndex({ palMap: ts.palMap, tiles }, tileId);
    if (idx === null) {
      dst.unmappedTiles++;
      fillRect(dst, ox, oy, 8, 8, PLACEHOLDER);
      continue;
    }

    const pal = ts.palMap[tileId]!.pal;
    const palette = palettes[pal]!;
    const shades = tiles[idx]!;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const shade = shades[y * 8 + x]!;
        const rgb = palette[shade]!;
        const di = ((oy + y) * 32 + (ox + x)) * 4;
        dst.data[di] = rgb.r;
        dst.data[di + 1] = rgb.g;
        dst.data[di + 2] = rgb.b;
        dst.data[di + 3] = 255;
      }
    }
  }

  return dst;
}

/**
 * Per-map copy of `ts.tiles` with PNG tile indices `$0A-$12` replaced by the
 * matching roof's 9 tiles (Decision 6; GBC format findings §3.4 step 5), for
 * `TILESET_JOHTO`/`TILESET_JOHTO_MODERN`/`TILESET_BATTLE_TOWER_OUTSIDE` maps
 * whose group has a roof (`MapGroupRoofs[map.group] !== -1`). Returns
 * `ts.tiles` UNCHANGED (the same reference, never copied) when no swap
 * applies -- the common case for every other tileset and every roofless
 * group -- so a caller that skips the swap never pays a copy it doesn't need,
 * and, more importantly, never mutates the cache: this function itself never
 * writes into `ts.tiles`, only ever into a freshly `slice()`d copy.
 */
function roofSwappedTiles(proj: Pick<GbcProject, "roofs">, ts: GbcTileset, tilesetConst: string, group: number): Uint8Array[] {
  if (!ROOF_TILESETS.has(tilesetConst)) return ts.tiles;

  const { mapGroupRoofs, roofTiles } = proj.roofs();
  const roofIdx = mapGroupRoofs[group];
  if (roofIdx === null || roofIdx === undefined) return ts.tiles;

  const roof = roofTiles[roofIdx];
  if (!roof) {
    throw new Error(`roofSwappedTiles: MapGroupRoofs[${group}] = roof index ${roofIdx}, but only ${roofTiles.length} roof tile set(s) loaded`);
  }
  if (roof.length !== ROOF_TILE_COUNT) {
    throw new Error(`roofSwappedTiles: roof index ${roofIdx} has ${roof.length} tiles, expected ${ROOF_TILE_COUNT}`);
  }
  if (ts.tiles.length < ROOF_FIRST_TILE_INDEX + ROOF_TILE_COUNT) {
    throw new Error(
      `roofSwappedTiles: tileset "${ts.name}" has only ${ts.tiles.length} PNG tiles, too few for the roof swap at $0A-$12`,
    );
  }

  const swapped = ts.tiles.slice();
  for (let i = 0; i < ROOF_TILE_COUNT; i++) swapped[ROOF_FIRST_TILE_INDEX + i] = roof[i]!;
  return swapped;
}

export interface GbcMapRaster extends Raster {
  mapName: string;
  blockWidth: number;
  blockHeight: number;
  /** Pixel offset of block (0,0) within `data`. Non-zero only when `opts.border` draws a ring. */
  originX: number;
  originY: number;
  /** Map blocks (border ring excluded) whose metatile id was out of range for
   *  this tileset -- counts blocks, not distinct ids (GBA `LayoutRaster`'s
   *  own convention, `render/layout.ts`). */
  outOfRangeCount: number;
  /** Tile ids with no `pngTileIndex` mapping, counted over map blocks only
   *  (border ring excluded), summed across every tile slot of every block. */
  unmappedTileCount: number;
  /** From `proj.layout(map)` -- e.g. the 2 CeruleanCave oversize-`.blk`
   *  defects (Decision 3). Empty when `opts.blocksOverride` is supplied,
   *  since no `.blk` is read in that case. */
  defects: DataDefect[];
}

export interface RenderGbcMapOptions {
  /** Rings of border to draw outside the map, in blocks. 0 (default) = none.
   *  Capped at the real `MAP_CONNECTION_PADDING_WIDTH` (`constants/gfx_constants.asm`,
   *  read via `proj.paddingWidth()` -- 3 in the real corpus, but never
   *  hardcoded here); any other value (negative, non-integer, or above the
   *  cap) is refused. */
  border?: number;
  time?: "morn" | "day" | "nite";
  flash?: boolean;
  /** Render these blocks instead of `proj.layout(map)`'s own `.blk` read --
   *  mirrors GBA's `renderLayout`'s `blocksOverride` (kept for Plan 7's edit
   *  sessions). Must have exactly `map.width * map.height` entries. */
  blocksOverride?: Block[];
}

/**
 * Renders one GBC map (GBC format findings §3.4/§Extra Border; Decision 6),
 * per-map rather than per-layout -- palette and roof both depend on the
 * map's own fields (environment/palette/group), not just its blockdata.
 *
 * Block id 0 renders as the map's own border metatile, both inside the map
 * and in the padding ring (`LoadMetatiles`: `ld a,[de] / and a / jr nz,.ok /
 * ld a,[wMapBorderBlock]` -- GBC format findings, "Extra findings" -> Border).
 * The ring itself is drawn as the border metatile directly (Task 9 never
 * stitches a real neighboring map's data into it -- that is Task 11's job).
 */
export function renderGbcMap(proj: GbcProject, mapName: string, opts: RenderGbcMapOptions = {}): GbcMapRaster {
  const map = proj.map(mapName);
  const ts = proj.tileset(map.tileset);
  const palettes = resolveFromTables(proj.paletteTables(), map, { time: opts.time, flash: opts.flash });
  const tiles = roofSwappedTiles(proj, ts, map.tileset, map.group);

  let blocks: Block[];
  let defects: DataDefect[];
  const wantBlocks = map.width * map.height;
  if (opts.blocksOverride) {
    if (opts.blocksOverride.length !== wantBlocks) {
      throw new Error(
        `renderGbcMap: ${mapName}: blocksOverride has ${opts.blocksOverride.length} blocks, expected ${map.width}x${map.height} = ${wantBlocks}`,
      );
    }
    blocks = opts.blocksOverride;
    defects = [];
  } else {
    const loaded = proj.layout(map);
    blocks = loaded.layout.blocks;
    defects = loaded.defects;
  }

  const maxRings = proj.paddingWidth();
  const rings = opts.border ?? 0;
  if (!Number.isInteger(rings) || rings < 0 || rings > maxRings) {
    throw new Error(`renderGbcMap: ${mapName}: border ${rings} out of range -- must be an integer 0-${maxRings}`);
  }

  const dst: GbcMapRaster = {
    ...createRaster((map.width + rings * 2) * 32, (map.height + rings * 2) * 32),
    mapName,
    blockWidth: map.width,
    blockHeight: map.height,
    originX: rings * 32,
    originY: rings * 32,
    outOfRangeCount: 0,
    unmappedTileCount: 0,
    defects,
  };

  const cache = new Map<number, GbcMetatileRaster>();
  const renderCached = (id: number): GbcMetatileRaster => {
    let r = cache.get(id);
    if (!r) {
      r = renderGbcMetatile(tiles, ts, id, palettes);
      cache.set(id, r);
    }
    return r;
  };

  const paddedWidth = map.width + rings * 2;
  const paddedHeight = map.height + rings * 2;
  for (let by = 0; by < paddedHeight; by++) {
    for (let bx = 0; bx < paddedWidth; bx++) {
      const inMap = bx >= rings && bx < rings + map.width && by >= rings && by < rings + map.height;
      let metatileId: number;
      let countsTowardMapStats: boolean;
      if (inMap) {
        const mx = bx - rings;
        const my = by - rings;
        const raw = blocks[my * map.width + mx]!.metatileId;
        metatileId = raw === 0 ? map.border : raw;
        countsTowardMapStats = true;
      } else {
        metatileId = map.border;
        countsTowardMapStats = false;
      }

      const r = renderCached(metatileId);
      if (countsTowardMapStats) {
        if (r.outOfRange) dst.outOfRangeCount++;
        dst.unmappedTileCount += r.unmappedTiles;
      }
      blit(dst, r, bx * 32, by * 32);
    }
  }

  return dst;
}
