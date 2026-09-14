import { describe, it, expect } from "vitest";
import { paintCells, floodFill, readBlock, shiftGrid, type Stamp } from "../../src/edit/paint.js";
import type { Block } from "../../src/model/types.js";

function grid(w: number, h: number, fill: number): Block[] {
  return Array.from({ length: w * h }, () => ({ metatileId: fill, collision: 0, elevation: 0 }));
}

describe("readBlock (dropper)", () => {
  it("reads id, collision and elevation together, at (x,y) in a gridWidth-wide grid", () => {
    const blocks = grid(4, 3, 1);
    blocks[2 * 4 + 1] = { metatileId: 42, collision: 2, elevation: 5 }; // (x=1,y=2)
    expect(readBlock(blocks, 4, 3, 1, 2)).toEqual({ metatileId: 42, collision: 2, elevation: 5 });
  });

  it("returns undefined outside the grid", () => {
    expect(readBlock(grid(4, 3, 1), 4, 3, 10, 10)).toBeUndefined();
    expect(readBlock(grid(4, 3, 1), 4, 3, -1, 0)).toBeUndefined();
  });

  it("returns undefined for a y within blocks.length but at/beyond gridHeight (a trailing block, the 19-layout shape) -- never exposes padding data as a real cell", () => {
    const blocks = grid(4, 3, 1); // 12 blocks, a 4x3 grid
    blocks.push({ metatileId: 999, collision: 1, elevation: 1 }); // index 12, the trailing block
    // y=3 at x=0 lands on index 12 -- inside blocks.length, but beyond gridHeight=3.
    expect(readBlock(blocks, 4, 3, 0, 3)).toBeUndefined();
  });

  it("returns a copy, not a live reference -- mutating the result never mutates the source blocks array", () => {
    const blocks = grid(4, 3, 1);
    blocks[0] = { metatileId: 42, collision: 2, elevation: 5 };
    const result = readBlock(blocks, 4, 3, 0, 0);
    expect(result).toBeDefined();
    result!.metatileId = 1234;
    expect(blocks[0]).toEqual({ metatileId: 42, collision: 2, elevation: 5 });
  });
});

describe("paintCells (pencil / rect)", () => {
  it("a single-cell stamp at one target cell paints only that cell's metatileId, preserving its own collision/elevation", () => {
    const blocks = grid(3, 3, 1);
    blocks[4] = { metatileId: 1, collision: 3, elevation: 7 }; // (1,1) has non-default collision/elevation
    const stamp: Stamp = { width: 1, height: 1, cells: [{ metatileId: 99 }] }; // no collision/elevation -> preserve
    const out = paintCells(blocks, 3, 3, [{ x: 1, y: 1 }], stamp, 1, 1);
    expect(out[4]).toEqual({ metatileId: 99, collision: 3, elevation: 7 });
    expect(out).not.toBe(blocks); // never mutates the input array
    expect(blocks[4]).toEqual({ metatileId: 1, collision: 3, elevation: 7 }); // input genuinely untouched
  });

  it("a full block stamp (id+collision+elevation, e.g. from the dropper) overwrites all three fields", () => {
    const blocks = grid(3, 3, 1);
    const stamp: Stamp = { width: 1, height: 1, cells: [{ metatileId: 5, collision: 2, elevation: 9 }] };
    const out = paintCells(blocks, 3, 3, [{ x: 0, y: 0 }], stamp, 0, 0);
    expect(out[0]).toEqual({ metatileId: 5, collision: 2, elevation: 9 });
  });

  it("painting a multi-cell selection tiles the source pattern across the target cells", () => {
    // A 2x1 stamp [A, B] painted across 4 cells in a row must repeat A,B,A,B.
    const blocks = grid(4, 1, 0);
    const stamp: Stamp = { width: 2, height: 1, cells: [{ metatileId: 10 }, { metatileId: 20 }] };
    const targets = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    const out = paintCells(blocks, 4, 1, targets, stamp, 0, 0);
    expect(out.map((b) => b.metatileId)).toEqual([10, 20, 10, 20]);
  });

  it("stamp tiling is anchored at the given origin, not at the target cell nearest (0,0) -- a drag starting mid-grid still tiles from its own start", () => {
    const blocks = grid(4, 1, 0);
    const stamp: Stamp = { width: 2, height: 1, cells: [{ metatileId: 10 }, { metatileId: 20 }] };
    // Drag starts at x=1 (the origin), covering x=1..3.
    const targets = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    const out = paintCells(blocks, 4, 1, targets, stamp, 1, 0);
    // x=1 -> (1-1)%2=0 -> A; x=2 -> (2-1)%2=1 -> B; x=3 -> (3-1)%2=0 -> A.
    expect(out.map((b) => b.metatileId)).toEqual([0, 10, 20, 10]); // x=0 untouched (0)
  });

  it("ignores a target cell outside the grid rather than throwing", () => {
    const blocks = grid(2, 2, 0);
    const stamp: Stamp = { width: 1, height: 1, cells: [{ metatileId: 9 }] };
    expect(() => paintCells(blocks, 2, 2, [{ x: 99, y: 99 }], stamp, 0, 0)).not.toThrow();
  });
});

describe("floodFill (bucket)", () => {
  it("is 4-connected on metatile id, bounded by the map edge", () => {
    // A 3x3 grid, id=1 everywhere except a plus-shaped id=2 region in the
    // middle row/column, id=1 in the four corners. Filling from center
    // must NOT leak diagonally into the corners.
    const blocks = grid(3, 3, 1);
    const plusShape: [number, number][] = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]];
    for (const [x, y] of plusShape) blocks[y * 3 + x] = { metatileId: 2, collision: 0, elevation: 0 };
    const out = floodFill(blocks, 3, 3, 1, 1, { metatileId: 7 });
    expect(out.map((b) => b.metatileId)).toEqual([1, 7, 1, 7, 7, 7, 1, 7, 1]);
  });

  it("filling a region already at the target id is a no-op (same array contents, still a new array)", () => {
    const blocks = grid(3, 3, 1);
    const out = floodFill(blocks, 3, 3, 0, 0, { metatileId: 1 });
    expect(out.map((b) => b.metatileId)).toEqual(blocks.map((b) => b.metatileId));
  });

  // 60x60 was the plan's original size, but measured against this machine's
  // vitest worker-thread stack it does NOT reliably overflow a recursive
  // implementation (confirmed by direct experiment: 60x60 survives a
  // recursive rewrite, 100x100 and up reliably throw "Maximum call stack
  // size exceeded"). 150x150 is used instead, with margin above that
  // measured threshold, so this test is a real teeth-proof rather than an
  // assumed one.
  it("is iterative, not recursive -- fills a large single-id region (150x150 = 22,500 cells) without a stack overflow", () => {
    const blocks = grid(150, 150, 3);
    expect(() => floodFill(blocks, 150, 150, 0, 0, { metatileId: 8 })).not.toThrow();
    const out = floodFill(blocks, 150, 150, 0, 0, { metatileId: 8 });
    expect(out.every((b) => b.metatileId === 8)).toBe(true);
  });
});

describe("shiftGrid", () => {
  it("shifts every block by (dx,dy), wrapping around the edges (Porymap's own Shift Layout semantics -- events do not move, this only touches the returned Block[])", () => {
    const blocks: Block[] = [
      { metatileId: 1, collision: 0, elevation: 0 }, { metatileId: 2, collision: 0, elevation: 0 },
      { metatileId: 3, collision: 0, elevation: 0 }, { metatileId: 4, collision: 0, elevation: 0 },
    ]; // 2x2: [[1,2],[3,4]]
    const out = shiftGrid(blocks, 2, 2, 1, 0); // shift right by 1, wrap
    expect(out.map((b) => b.metatileId)).toEqual([2, 1, 4, 3]);
  });

  it("shifting by the full grid width/height is the identity", () => {
    const blocks = grid(3, 3, 0).map((b, i) => ({ ...b, metatileId: i }));
    const out = shiftGrid(blocks, 3, 3, 3, 3);
    expect(out.map((b) => b.metatileId)).toEqual(blocks.map((b) => b.metatileId));
  });

  it("preserves a trailing block beyond width*height untouched (the 19-layout shape) -- shift only ever touches the first width*height cells", () => {
    const blocks: Block[] = [
      { metatileId: 1, collision: 0, elevation: 0 }, { metatileId: 2, collision: 0, elevation: 0 },
      { metatileId: 999, collision: 1, elevation: 1 }, // the trailing block, index 2, past a 2x1 grid
    ];
    const out = shiftGrid(blocks, 2, 1, 1, 0);
    expect(out[2]).toEqual({ metatileId: 999, collision: 1, elevation: 1 });
  });
});
