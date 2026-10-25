import { describe, expect, it } from "vitest";
import { boundedCell, cellRect, rawCell } from "../../src/canvas/cells.js";

for (const cellPx of [16, 32]) {
  describe(`${cellPx}px cell math`, () => {
    const geometry = { pan: { x: 10, y: -6 }, zoom: 2, originX: 32, originY: 64, cellPx };
    // Map origin on canvas = (10+32*2,-6+64*2) = (74,122).
    it("subtracts pan and origin before flooring", () => {
      // At (74+3*cellPx,122+5*cellPx): cell = floor(1.5,2.5) = (1,2).
      expect(rawCell({ x: 74 + 3 * cellPx, y: 122 + 5 * cellPx }, geometry)).toEqual({ x: 1, y: 2 });
      // At origin: floor(0/cellPx) = (0,0).
      expect(rawCell({ x: 74, y: 122 }, geometry)).toEqual({ x: 0, y: 0 });
      // Half a screen pixel before origin: floor(-0.5/2/cellPx) = -1 on both axes.
      expect(rawCell({ x: 73.5, y: 121.5 }, geometry)).toEqual({ x: -1, y: -1 });
    });

    it("includes the near edge and excludes each far edge without clamping", () => {
      // 3x2 map: far screen edges (74+3*cellPx*2,122+2*cellPx*2).
      const right = 74 + 6 * cellPx;
      const bottom = 122 + 4 * cellPx;
      expect(boundedCell({ x: 74, y: 122 }, geometry, 3, 2)).toEqual({ x: 0, y: 0 }); // floor(0,0).
      // Half a screen pixel inside: floor(3-0.25/cellPx,2-0.25/cellPx) = (2,1).
      expect(boundedCell({ x: right - 0.5, y: bottom - 0.5 }, geometry, 3, 2)).toEqual({ x: 2, y: 1 });
      expect(rawCell({ x: right, y: bottom }, geometry)).toEqual({ x: 3, y: 2 }); // Exact far edges floor to (3,2).
      for (const point of [{ x: 73.5, y: 122 }, { x: 74, y: 121.5 }, { x: right, y: 122 }, { x: 74, y: bottom }, { x: right + cellPx, y: bottom + cellPx }]) {
        // Respectively x=-1, y=-1, x=3, y=2, (x,y)=(3,2): all outside [0,3)x[0,2).
        expect(boundedCell(point, geometry, 3, 2)).toBeNull();
      }
    });

    it("projects a cell to a client DOMRect with independent CSS scaling", () => {
      const rect = cellRect(new DOMRect(100, 200, 400, 150), 800, 600, { x: 2, y: 1 }, geometry);
      expect(rect).toBeInstanceOf(DOMRect);
      // scale=(400/800,150/600)=(0.5,0.25).
      // x=100+(10+(32+2*cellPx)*2)*0.5 = 137+2*cellPx; y=200+(-6+(64+cellPx)*2)*0.25 = 230.5+0.5*cellPx.
      // width=cellPx*2*0.5=cellPx; height=cellPx*2*0.25=cellPx/2.
      expect([rect.x, rect.y, rect.width, rect.height]).toEqual([137 + 2 * cellPx, 230.5 + cellPx / 2, cellPx, cellPx / 2]);
    });
  });
}

it("supports fractional view coordinates and an unscaled client rect", () => {
  const geometry = { pan: { x: -2.5, y: 3.25 }, zoom: 0.5, originX: 16, originY: 32, cellPx: 16 };
  // Cell (-1,2): source corner (16-16,32+32)=(0,64); stage=(-2.5,35.25); client adds (10,20).
  const rect = cellRect(new DOMRect(10, 20, 200, 100), 200, 100, { x: -1, y: 2 }, geometry);
  expect([rect.x, rect.y, rect.width, rect.height]).toEqual([7.5, 55.25, 8, 8]); // 16*0.5=8 per side.
  expect(rawCell({ x: -2.5, y: 35.25 }, geometry)).toEqual({ x: -1, y: 2 }); // floor((0-16)/16,(64-32)/16).
});

it("bounded lookup returns null for a non-finite cell (zero zoom at the pan origin)", () => {
  const geometry = { pan: { x: 0, y: 0 }, zoom: 0, originX: 0, originY: 0, cellPx: 16 };
  // (0-0)/0 = NaN; NaN fails every comparison, so only an explicit finiteness check rejects it.
  expect(boundedCell({ x: 0, y: 0 }, geometry, 4, 4)).toBeNull();
});
