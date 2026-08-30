import type { EngineProfile } from "../config/engine.js";
import type { Tileset, TileEntry } from "../load/tilesetData.js";
import type { RGB, Split } from "../model/types.js";
import { createRaster, type Raster } from "./raster.js";
import { drawTile } from "./tile.js";

export interface MetatileRaster extends Raster {
  /** True when the metatile ID falls outside its tileset's real metatile count
   *  for this split. open-bugs.md #41, made visible. Also true for a negative
   *  or non-integer id -- `renderMetatile` is public API that Task 21's tile
   *  picker and the CLI will call with computed ids, not just ids Task 14 has
   *  already masked to a valid range.
   *
   *  Scoped to the id deliberately. A tile index past the end of its sheet is a
   *  separate failure that `drawTile` clips silently; no primary tileset in the
   *  subject repo has one, and Task 17's port of check_metatile_range.py is
   *  where that gets audited across the corpus. Do not widen this flag's
   *  meaning without widening its test. */
  outOfRange: boolean;
}

export interface RenderMetatileOptions { overrideEntries?: TileEntry[]; }

/**
 * A tile entry's palette field is 4 bits wide, so it can name palette indices
 * 13, 14 and 15 -- but NUM_PALS_TOTAL is 13, and most secondary tilesets ship
 * only palettes/00.pal through 12.pal. Measured across the subject repo: 14
 * tilesets carry 2,534 tile entries selecting index 13, 14 or 15, and 13 of
 * those tilesets have no palette file at the index named (gTileset_Petalburg
 * is the benign exception -- it ships all 16). This constant is that missing
 * lookup made explicit and named, not an accident of `?? []`: those tiles
 * render with zero pixels, the same failure Task 13's tile.ts comment already
 * documents for a missing tile index. On real hardware they draw with
 * whatever non-tileset palette happens to be resident in VRAM slots 13-15 --
 * not a colour this renderer can know or should guess at. Deciding what (if
 * anything) to paint instead is a parity question for Task 16's visual
 * regression harness; Task 17 owns auditing where this constant gets hit.
 */
const MISSING_PALETTE: RGB[] = [];

/**
 * Invariant I1: the boundary arrives as `split`. There is no ambient constant.
 *
 *   id  <  split.metatiles  -> primary,   index id
 *   id  >= split.metatiles  -> secondary, index id - split.metatiles
 *
 * Tile indices follow the same subtracting rule against split.tiles, because
 * the two sheets are concatenated into one VRAM range.
 *
 * Palettes do NOT. A secondary tileset's palette array is indexed absolutely:
 * VRAM slot p is loaded from that tileset's own palettes/PP.pal, so the lookup
 * is secondary.palettes[p], not [p - split.pals]. See src/fieldmap.c:1012 and
 * :958, and Porymap's Tileset::getBlockPalettes.
 *
 * `profile` is unused here today. It stays in the signature because Task 14
 * passes it and Plan 0 fixes Plan 1's signatures for the later plans.
 */
export function renderMetatile(
  id: number, primary: Tileset, secondary: Tileset,
  split: Split, profile: EngineProfile, opts: RenderMetatileOptions = {},
): MetatileRaster {
  const dst: MetatileRaster = { ...createRaster(16, 16), outOfRange: false };

  const inSecondary = id >= split.metatiles;
  const owner = inSecondary ? secondary : primary;
  const local = inSecondary ? id - split.metatiles : id;

  if (!Number.isInteger(id) || local < 0 || local >= owner.metatileCount) {
    dst.outOfRange = true;
    return dst;
  }

  const entries = opts.overrideEntries ?? owner.metatile(local);

  // Absolute, not offset -- see the header comment.
  const paletteFor = (p: number): RGB[] =>
    p < split.pals ? (primary.palettes[p] ?? MISSING_PALETTE) : (secondary.palettes[p] ?? MISSING_PALETTE);

  const sheetFor = (t: number) =>
    t < split.tiles
      ? { sheet: primary.tiles, index: t }
      : { sheet: secondary.tiles, index: t - split.tiles };

  // Entries 0-3 are the bottom layer, 4-7 the top, and the top always paints
  // over the bottom. `layerType` decides which background layer each half lands
  // on -- Bg3 bottom, Bg2 middle, Bg1 top -- and so whether the player sprite
  // is drawn between them. It never reverses the two halves. See DrawMetatile
  // in src/field_camera.c: NORMAL is Bg2/Bg1, COVERED is Bg3/Bg2, SPLIT is
  // Bg3/Bg1, and in each the bottom half is the lower-priority background.
  // So `owner.layerType(local)` is deliberately not consulted here. Task 21
  // reads it to render the halves separately for the layer-toggle overlay.
  for (let i = 0; i < 8; i++) {
    const e = entries[i];
    if (!e) continue;
    const { sheet, index } = sheetFor(e.tile);
    drawTile(dst, sheet, index, paletteFor(e.palette), (i % 2) * 8, (Math.floor(i / 2) % 2) * 8, e.xFlip, e.yFlip);
  }

  return dst;
}
