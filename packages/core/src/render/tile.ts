import type { IndexedImage } from "../load/png.js";
import type { RGB } from "../model/types.js";
import type { Raster } from "./raster.js";

/**
 * Draw one 8x8 tile into `dst` at (dx, dy).
 * Palette index 0 is transparent in every GBA tileset palette.
 */
export function drawTile(
  dst: Raster, sheet: IndexedImage, tileIndex: number,
  palette: RGB[], dx: number, dy: number, xFlip: boolean, yFlip: boolean,
): void {
  const tilesPerRow = sheet.width >> 3;
  const sx = (tileIndex % tilesPerRow) * 8;
  const sy = Math.floor(tileIndex / tilesPerRow) * 8;
  if (sy + 8 > sheet.height) return; // index past the end of this sheet

  for (let y = 0; y < 8; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < 8; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const px = xFlip ? 7 - x : x;
      const py = yFlip ? 7 - y : y;
      const idx = sheet.indices[(sy + py) * sheet.width + (sx + px)]!;
      if (idx === 0) continue; // transparent
      const c = palette[idx];
      if (!c) continue;
      const di = (ty * dst.width + tx) * 4;
      dst.data[di] = c.r; dst.data[di + 1] = c.g; dst.data[di + 2] = c.b; dst.data[di + 3] = 255;
    }
  }
}
