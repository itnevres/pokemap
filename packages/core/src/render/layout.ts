import { readFileSync } from "node:fs";
import type { Project } from "../project.js";
import { parseBlocks } from "../load/blocks.js";
import { createRaster, blit, type Raster } from "./raster.js";
import { renderMetatile, type MetatileRaster } from "./metatile.js";
import type { Block } from "../model/types.js";

export interface LayoutRaster extends Raster {
  layoutName: string;
  blockWidth: number;
  blockHeight: number;
  /** Pixel offset of block (0,0). Non-zero when a border is drawn. */
  originX: number;
  originY: number;
  /**
   * How many of the layout's own map blocks (not border blocks) rendered an
   * out-of-range metatile -- see `MetatileRaster.outOfRange`. This counts
   * blocks, not distinct metatile ids: the same bad id used on ten blocks
   * adds ten, not one.
   *
   * Border blocks are blitted the same way but never touch this counter, so
   * it is identical whether or not `opts.border` is set -- it answers "is
   * this layout's own data corrupt", not "did anything on screen look wrong".
   */
  outOfRangeCount: number;
  blocks: Block[];
}

export interface RenderLayoutOptions {
  /** Rings of border to draw outside the map. 0 = none. */
  border?: number;
}

export function renderLayout(proj: Project, layoutName: string, opts: RenderLayoutOptions = {}): LayoutRaster {
  const layout = proj.layoutByName(layoutName);
  if (!layout) {
    throw new Error(
      `unknown layout ${layoutName}: not among the ${proj.layouts.length} layouts in ` +
      `${proj.paths.layoutsJson}. Have a map name instead? Use proj.layoutForMap(name).`,
    );
  }

  const split = proj.splitFor(layout);
  const primary = proj.tileset(layout.primaryTileset);
  const secondary = proj.tileset(layout.secondaryTileset);

  const blockdataPath = `${proj.paths.root}/${layout.blockdataFilepath}`;
  const blocks = parseBlocks(readFileSync(blockdataPath), proj.profile);
  const wantBlocks = layout.width * layout.height;
  // A short file is a guess wearing the shape of a render: `blocks[i]` would
  // come back `undefined` mid-grid and `!b` would skip it silently, leaving a
  // partly transparent map with no complaint. Measured across the subject
  // repo: 1,001 blockdata files exact, 19 over by rounding, 0 short -- so this
  // never fires on real data (I7) and is cheap insurance against a corrupt one.
  if (blocks.length < wantBlocks) {
    throw new Error(
      `${blockdataPath} holds ${blocks.length} blocks but ${layout.name} declares ` +
      `${layout.width}x${layout.height} = ${wantBlocks}`,
    );
  }

  const rings = opts.border ?? 0;
  const padX = rings * layout.borderWidth;
  const padY = rings * layout.borderHeight;

  const dst: LayoutRaster = {
    ...createRaster((layout.width + padX * 2) * 16, (layout.height + padY * 2) * 16),
    layoutName: layout.name,
    blockWidth: layout.width,
    blockHeight: layout.height,
    originX: padX * 16,
    originY: padY * 16,
    outOfRangeCount: 0,
    blocks,
  };

  const cache = new Map<number, MetatileRaster>();
  const tile = (id: number): MetatileRaster => {
    let r = cache.get(id);
    if (!r) { r = renderMetatile(id, primary, secondary, split, proj.profile); cache.set(id, r); }
    return r;
  };

  if (rings > 0) {
    // Read border.bin only when it is going to be drawn. The world view renders
    // 1,209 maps borderless, and reading a file per map to discard it is the
    // kind of cost that is invisible until Task 25.
    const borderBlocks = parseBlocks(readFileSync(`${proj.paths.root}/${layout.borderFilepath}`), proj.profile);
    // padX is rings * borderWidth, so it is an exact multiple of borderWidth
    // and `x % borderWidth` keeps the same phase as the unpadded grid would.
    // That stops holding if padding is ever computed any other way.
    for (let y = 0; y < layout.height + padY * 2; y++) {
      for (let x = 0; x < layout.width + padX * 2; x++) {
        if (x >= padX && x < padX + layout.width && y >= padY && y < padY + layout.height) continue;
        const b = borderBlocks[(y % layout.borderHeight) * layout.borderWidth + (x % layout.borderWidth)];
        if (b) blit(dst, tile(b.metatileId), x * 16, y * 16);
      }
    }
  }

  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      const b = blocks[y * layout.width + x];
      if (!b) continue;
      const r = tile(b.metatileId);
      if (r.outOfRange) dst.outOfRangeCount++;
      blit(dst, r, dst.originX + x * 16, dst.originY + y * 16);
    }
  }

  return dst;
}
