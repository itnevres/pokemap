import { describe, it, expect } from "vitest";
import { chunkRows, pickFold } from "../../src/shared/paletteFold.js";

describe("pickFold (Plan 9 addendum R-F3)", () => {
  it.each([
    // [rowCount, uniformRows, boundaryRow, expected, why]
    [0, [], undefined, 0, "empty: one (empty) column"],
    [1, [], undefined, 1, "one row: one column"],
    [10, [], undefined, 5, "no candidate: the middle"],
    [9, [], undefined, 5, "odd count: ceil of the middle"],
    [10, [4], undefined, 5, "after a uniform row at the middle"],
    [10, [1], undefined, 5, "a cut more than rowCount / 4 from the middle is ignored"],
    [10, [2, 6], undefined, 3, "two equidistant cuts (3 and 7): the earlier"],
    [10, [9], undefined, 5, "a uniform LAST row gives no cut (nothing after it)"],
    [10, [], 3, 3, "the primary/secondary boundary is a candidate"],
    [10, [4], 3, 5, "a uniform-row cut nearer the middle beats the boundary"],
    [77, [], 64, 39, "GBA 512 primary + 104 secondary: the boundary is too far from the middle"],
    [98, [], 80, 49, "GBA Route29 (640 primary + 144 secondary): boundary at row 80 is too far, cut at the middle"],
    [8, [], 2, 2, "the limit is inclusive: |2 - 4| = 2 = 8 / 4"],
  ] as const)("rowCount %i, uniform %j, boundary %s -> %i (%s)", (rowCount, uniform, boundary, expected, _why) => {
    expect(pickFold(rowCount, new Set(uniform), boundary)).toBe(expected);
  });

  it("ignores a boundary at row 0 or at rowCount (no empty column)", () => {
    expect(pickFold(10, new Set(), 0)).toBe(5);
    expect(pickFold(10, new Set(), 10)).toBe(5);
  });
});

describe("chunkRows", () => {
  it("splits into rows of `width`, keeping a short last row", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkRows([], 4)).toEqual([]);
  });
});
