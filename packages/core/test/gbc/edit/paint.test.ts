import { describe, it, expect } from "vitest";
import { paintCells, floodFill, readBlock, shiftGrid, type GbcStamp } from "../../../src/gbc/edit/paint.js";
import type { Block } from "../../../src/gbc/model/types.js";

function grid(w: number, h: number, fill: number): Block[] {
  return Array.from({ length: w * h }, () => ({ metatileId: fill }));
}

describe("paintCells (GBC pencil / rect)", () => {
  it("1×1 stamp at (1,0) on a 3×2 grid: only index 1 changes, input and elements are unchanged, output !== input", () => {
    const blocks = grid(3, 2, 5);
    const original = [...blocks];
    const stamp: GbcStamp = { width: 1, height: 1, cells: [{ metatileId: 99 }] };
    const out = paintCells(blocks, 3, 2, [{ x: 1, y: 0 }], stamp, 1, 0);

    // Only index 1 changed
    expect(out[1]!.metatileId).toBe(99);
    expect(out[0]!.metatileId).toBe(5);
    expect(out[2]!.metatileId).toBe(5);
    expect(out[3]!.metatileId).toBe(5);
    expect(out[4]!.metatileId).toBe(5);
    expect(out[5]!.metatileId).toBe(5);

    // Input unchanged
    expect(blocks).toEqual(original);

    // Output !== input
    expect(out).not.toBe(blocks);
    expect(out[0]).not.toBe(blocks[0]);
  });

  it("tiling: a 2×1 stamp [7,8] with origin (1,0) across targets (1..3,0) on a 4×1 grid gives [_,7,8,7]; with origin (0,0) gives [_,8,7,8]", () => {
    const blocks = grid(4, 1, 0);
    const stamp: GbcStamp = { width: 2, height: 1, cells: [{ metatileId: 7 }, { metatileId: 8 }] };
    const targets = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];

    // Origin (1,0)
    const out1 = paintCells(blocks, 4, 1, targets, stamp, 1, 0);
    expect(out1.map((b) => b.metatileId)).toEqual([0, 7, 8, 7]);

    // Origin (0,0)
    const out2 = paintCells(blocks, 4, 1, targets, stamp, 0, 0);
    expect(out2.map((b) => b.metatileId)).toEqual([0, 8, 7, 8]);
  });

  it("out-of-grid targets (x:-1, x:w, y:h) are ignored with no throw", () => {
    const blocks = grid(2, 2, 0);
    const stamp: GbcStamp = { width: 1, height: 1, cells: [{ metatileId: 9 }] };
    expect(() => paintCells(blocks, 2, 2, [
      { x: -1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }
    ], stamp, 0, 0)).not.toThrow();
  });

  it("output keys: every block's Object.keys deep-equals ['metatileId']", () => {
    const blocks = grid(3, 2, 5);
    const stamp: GbcStamp = { width: 1, height: 1, cells: [{ metatileId: 99 }] };
    const out = paintCells(blocks, 3, 2, [{ x: 0, y: 0 }], stamp, 0, 0);

    for (const block of out) {
      expect(Object.keys(block)).toEqual(["metatileId"]);
    }
  });
});

describe("floodFill (GBC bucket)", () => {
  it("4-connected on metatileId: plus-shaped region id=1 with corners id=2, filling centre changes only plus", () => {
    const blocks = grid(3, 3, 1);
    const plusShape: [number, number][] = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]];
    for (const [x, y] of plusShape) blocks[y * 3 + x] = { metatileId: 2 };

    const out = floodFill(blocks, 3, 3, 1, 1, 5);
    expect(out.map((b) => b.metatileId)).toEqual([1, 5, 1, 5, 5, 5, 1, 5, 1]);

    // Filling from corner
    const out2 = floodFill(blocks, 3, 3, 0, 0, 7);
    expect(out2[0]!.metatileId).toBe(7);
    expect(out2[1]!.metatileId).toBe(2); // adjacent corner, different id
  });

  it("same-id is a no-op: returns equal fresh array, !==", () => {
    const blocks = grid(3, 3, 1);
    const out = floodFill(blocks, 3, 3, 0, 0, 1);
    expect(out.map((b) => b.metatileId)).toEqual(blocks.map((b) => b.metatileId));
    expect(out).not.toBe(blocks);
  });

  it("is iterative: fills 150×150 (22,500 cells) without stack overflow", () => {
    const blocks = grid(150, 150, 3);
    expect(() => floodFill(blocks, 150, 150, 0, 0, 8)).not.toThrow();
    const out = floodFill(blocks, 150, 150, 0, 0, 8);
    expect(out.every((b) => b.metatileId === 8)).toBe(true);
  });

  it("out-of-grid start returns equal fresh array", () => {
    const blocks = grid(3, 3, 5);
    const out = floodFill(blocks, 3, 3, -1, 0, 9);
    expect(out.map((b) => b.metatileId)).toEqual(blocks.map((b) => b.metatileId));
    expect(out).not.toBe(blocks);
  });

  it("output keys: every block's Object.keys deep-equals ['metatileId']", () => {
    const blocks = grid(3, 3, 1);
    const out = floodFill(blocks, 3, 3, 0, 0, 5);

    for (const block of out) {
      expect(Object.keys(block)).toEqual(["metatileId"]);
    }
  });
});

describe("shiftGrid (GBC re-exported from GBA)", () => {
  it("3×2 shift by (1,0) wraps on GBC blocks", () => {
    const blocks: Block[] = [
      { metatileId: 1 }, { metatileId: 2 }, { metatileId: 3 },
      { metatileId: 4 }, { metatileId: 5 }, { metatileId: 6 },
    ]; // 3×2: [[1,2,3],[4,5,6]]
    const out = shiftGrid(blocks, 3, 2, 1, 0); // shift right by 1, wrap
    expect(out.map((b) => b.metatileId)).toEqual([3, 1, 2, 6, 4, 5]);
  });

  it("shift by (w,h) is identity", () => {
    const blocks = grid(3, 2, 0).map((b, i) => ({ metatileId: i }));
    const out = shiftGrid(blocks, 3, 2, 3, 2);
    expect(out.map((b) => b.metatileId)).toEqual(blocks.map((b) => b.metatileId));
  });

  it("readBlock returns a copy; mutating result leaves source unchanged", () => {
    const blocks = grid(3, 2, 5);
    blocks[1] = { metatileId: 42 };
    const result = readBlock(blocks, 3, 2, 1, 0);
    expect(result).toBeDefined();
    result!.metatileId = 1234;
    expect(blocks[1]).toEqual({ metatileId: 42 });
  });

  it("readBlock returns undefined out of grid", () => {
    expect(readBlock(grid(3, 2, 5), 3, 2, 10, 10)).toBeUndefined();
    expect(readBlock(grid(3, 2, 5), 3, 2, -1, 0)).toBeUndefined();
  });
});
