import type { Block } from "../model/types.js";

export interface StampCell { metatileId: number; collision?: number; elevation?: number; }
/** Row-major, `cells[y * width + x]`. A 1x1 stamp is the common pencil case;
 *  a larger one is a copied rectangle from the palette or another part of
 *  the map (the dropper's own "reads id, collision and elevation together"
 *  output is a 1x1 stamp with both fields present). */
export interface Stamp { width: number; height: number; cells: StampCell[]; }

export function readBlock(blocks: Block[], gridWidth: number, gridHeight: number, x: number, y: number): Block | undefined {
  if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) return undefined;
  const block = blocks[y * gridWidth + x];
  return block ? { ...block } : undefined;
}

/**
 * Paints `stamp`, tiled, across every cell in `targets` that falls inside
 * the grid -- an out-of-bounds target is silently skipped (a drag that
 * crosses the map edge should not throw mid-stroke). Tiling is anchored at
 * `(originX, originY)` -- the drag's own start point, or a rect's own
 * corner -- not at the grid's (0,0), so a stamp painted starting mid-grid
 * still begins its own pattern at its first painted cell.
 *
 * A stamp cell missing `collision`/`elevation` preserves whatever the
 * TARGET block already had there -- an ordinary metatile paint never
 * disturbs collision/elevation painted separately (Task 8's own
 * requirement: "painting collision must not disturb the id" holds by the
 * same symmetric rule here, the other direction).
 *
 * Never mutates its input -- returns a fresh array every call, copying
 * every untouched block too (not just the painted ones), so a caller
 * holding onto the original `blocks` reference (e.g. EditSession.blocks
 * before a command applies) never sees it change out from under it.
 */
export function paintCells(
  blocks: Block[], gridWidth: number, gridHeight: number,
  targets: { x: number; y: number }[], stamp: Stamp, originX: number, originY: number,
): Block[] {
  const out = blocks.map((b) => ({ ...b }));
  for (const t of targets) {
    if (t.x < 0 || t.y < 0 || t.x >= gridWidth || t.y >= gridHeight) continue;
    const sx = ((t.x - originX) % stamp.width + stamp.width) % stamp.width;
    const sy = ((t.y - originY) % stamp.height + stamp.height) % stamp.height;
    const cell = stamp.cells[sy * stamp.width + sx];
    if (!cell) continue;
    const index = t.y * gridWidth + t.x;
    const existing = out[index];
    if (!existing) continue;
    out[index] = {
      metatileId: cell.metatileId,
      collision: cell.collision ?? existing.collision,
      elevation: cell.elevation ?? existing.elevation,
    };
  }
  return out;
}

/**
 * 4-connected flood fill from `(x,y)`, bounded by the grid edge, replacing
 * every metatile-id-connected cell with `replacement`. Iterative (an
 * explicit stack array, not a recursive call) -- some real layouts are
 * 60x80+, and a recursive fill would blow the call stack on one.
 */
export function floodFill(blocks: Block[], gridWidth: number, gridHeight: number, x: number, y: number, replacement: StampCell): Block[] {
  const start = readBlock(blocks, gridWidth, gridHeight, x, y);
  if (!start) return blocks.map((b) => ({ ...b }));
  const targetId = start.metatileId;

  const out = blocks.map((b) => ({ ...b }));
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
    out[index] = { metatileId: replacement.metatileId, collision: replacement.collision ?? here.collision, elevation: replacement.elevation ?? here.elevation };
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }

  return out;
}

/**
 * Moves the whole `gridWidth x gridHeight` region by `(dx, dy)`, wrapping
 * at the edges -- Porymap's own "Shift Layout" semantics (a torus, not a
 * clip-and-fill). Only ever touches indices `0` through
 * `gridWidth*gridHeight - 1`; a trailing block beyond that (the 19-layout
 * shape binary.ts's own doc comment describes) is copied through
 * unchanged, never touched by the shift.
 *
 * Events are not part of this function's input at all -- "without moving
 * events" is automatically true because this only ever returns a `Block[]`
 * and the caller (Task 10's own event-aware wiring) never feeds this
 * function anything event-shaped to begin with.
 */
export function shiftGrid(blocks: Block[], gridWidth: number, gridHeight: number, dx: number, dy: number): Block[] {
  const out = blocks.map((b) => ({ ...b }));
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const srcX = ((x - dx) % gridWidth + gridWidth) % gridWidth;
      const srcY = ((y - dy) % gridHeight + gridHeight) % gridHeight;
      const src = blocks[srcY * gridWidth + srcX];
      if (src) out[y * gridWidth + x] = { ...src };
    }
  }
  // Anything at or beyond gridWidth*gridHeight (a trailing block) is
  // already an exact copy from the initial `blocks.map` above and is
  // never touched by the loop, which only ever writes indices below it.
  return out;
}
