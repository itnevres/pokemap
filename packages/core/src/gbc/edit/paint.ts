import type { Block } from "../model/types.js";
export { readBlock, shiftGrid } from "../../edit/paint.js";

/** Row-major cells[y * width + x]; same shape GBA's Stamp uses for metatileId, without collision/elevation. */
export interface GbcStamp { width: number; height: number; cells: { metatileId: number }[]; }

/**
 * Paints `stamp`, tiled, across every cell in `targets` that falls inside
 * the grid -- an out-of-bounds target is silently skipped (a drag that
 * crosses the map edge should not throw mid-stroke). Tiling is anchored at
 * `(originX, originY)` -- the drag's own start point, or a rect's own
 * corner -- not at the grid's (0,0), so a stamp painted starting mid-grid
 * still begins its own pattern at its first painted cell.
 *
 * GBC blocks contain only metatileId, with no collision/elevation fields.
 * This function never adds those fields to output blocks; it returns blocks
 * with exactly { metatileId }, never merged/padded with undefined fields.
 *
 * Never mutates its input -- returns a fresh array every call, copying
 * every untouched block too (not just the painted ones), so a caller
 * holding onto the original `blocks` reference never sees it change.
 */
export function paintCells(
  blocks: Block[], gridWidth: number, gridHeight: number,
  targets: { x: number; y: number }[], stamp: GbcStamp, originX: number, originY: number,
): Block[] {
  const out = blocks.map((b) => ({ metatileId: b.metatileId }));
  for (const t of targets) {
    if (t.x < 0 || t.y < 0 || t.x >= gridWidth || t.y >= gridHeight) continue;
    const sx = ((t.x - originX) % stamp.width + stamp.width) % stamp.width;
    const sy = ((t.y - originY) % stamp.height + stamp.height) % stamp.height;
    const cell = stamp.cells[sy * stamp.width + sx];
    if (!cell) continue;
    const index = t.y * gridWidth + t.x;
    out[index] = { metatileId: cell.metatileId };
  }
  return out;
}

/**
 * 4-connected flood fill from `(x,y)`, bounded by the grid edge, replacing
 * every metatile-id-connected cell with the given metatileId. Iterative (an
 * explicit stack array, not a recursive call) -- some real layouts are
 * 60x80+, and a recursive fill would blow the call stack on one.
 *
 * GBC blocks contain only metatileId; this function never adds those fields
 * to output blocks. Every filled block is exactly { metatileId }.
 */
export function floodFill(blocks: Block[], gridWidth: number, gridHeight: number,
  x: number, y: number, metatileId: number): Block[] {
  const out = blocks.map((b) => ({ metatileId: b.metatileId }));
  const inGrid = x >= 0 && y >= 0 && x < gridWidth && y < gridHeight;
  const start = inGrid ? out[y * gridWidth + x] : undefined;
  if (!start) return out;
  const targetId = start.metatileId;

  const visited = new Uint8Array(gridWidth * gridHeight);
  const stack: [number, number][] = [[x, y]];

  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    if (cx < 0 || cy < 0 || cx >= gridWidth || cy >= gridHeight) continue;
    const index = cy * gridWidth + cx;
    if (visited[index]) continue;
    const here = out[index];
    if (!here || here.metatileId !== targetId) continue;
    visited[index] = 1;
    out[index] = { metatileId };
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }

  return out;
}
