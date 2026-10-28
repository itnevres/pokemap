import { describe, expect, it } from "vitest";
import {
  JUMP_FILL_FRACTION, LOD_SCALE, WARP_HIT_RADIUS, WHEEL_FACTOR,
  boundsOf, centredFit, computeFit, fitClusters, fitFilter, hitPlacement, jumpFit, rectOf, screenToWorld,
  singletonSizes, smallTilesAt, warpHit, warpPoint, worldToScreen, worldZoomBounds, worldZoomRange,
  zoomWorldAboutPivot, type WorldPlacementLike,
} from "../../src/canvas/worldView.js";

const p = (map: string, x: number, y: number, width: number, height: number, component: number): WorldPlacementLike =>
  ({ map, x, y, width, height, component });
const identity = (base: number) => base;
const inContext = (base: number) => base * 4;

describe("worldView constants", () => {
  it("pins the shared factors", () => {
    expect(WHEEL_FACTOR).toBe(1.2);
    expect(LOD_SCALE).toBe(0.25);
    // P12-4m: full limiting-dimension fill has fraction 1.
    expect(JUMP_FILL_FRACTION).toBe(1);
    expect(WARP_HIT_RADIUS).toBe(8);
  });
});

describe("zoom range as scale (P12-4j)", () => {
  it("is 1/2048..1 of the native unit", () => {
    // 16 px tile: 16/2048 = 1/128, 16 * 1 = 16. 32 px block: 32/2048 = 1/64, 32.
    expect(worldZoomRange(16)).toEqual({ min: 1 / 128, max: 16 });
    expect(worldZoomRange(32)).toEqual({ min: 1 / 64, max: 32 });
  });

  it("caps at maxWorldZoom(native max), never below the current zoom", () => {
    // Out of context: cap = max(16, current).
    expect(worldZoomBounds(16, 4, identity)).toEqual({ min: 1 / 128, max: 16 });
    expect(worldZoomBounds(16, 48, identity)).toEqual({ min: 1 / 128, max: 48 });
    // In context: base x 4 -> GBA 64, GBC 128; current above that stays the cap.
    expect(worldZoomBounds(16, 16, inContext)).toEqual({ min: 1 / 128, max: 64 });
    expect(worldZoomBounds(32, 8, inContext)).toEqual({ min: 1 / 64, max: 128 });
    expect(worldZoomBounds(32, 200, inContext)).toEqual({ min: 1 / 64, max: 200 });
  });
});

describe("zoomWorldAboutPivot (continuous)", () => {
  const bounds = { min: 1 / 64, max: 32 };

  it("keeps the pivot's world point fixed and carries extra fields", () => {
    // zoom 2, pan (10, 20), pivot (110, 220): world point ((110-10)/2, (220-20)/2) = (50, 100).
    // x1.5 -> zoom 3, pan (110 - 150, 220 - 300) = (-40, -80).
    const view = { zoom: 2, pan: { x: 10, y: 20 }, fitted: true };
    expect(zoomWorldAboutPivot(view, 1.5, 110, 220, bounds)).toEqual({ zoom: 3, pan: { x: -40, y: -80 }, fitted: true });
  });

  it("keeps fractional pan", () => {
    // zoom 1, pan 0, pivot (7, 3), x1.2: pan (7 - 8.4, 3 - 3.6) = (-1.4, -0.6).
    const next = zoomWorldAboutPivot({ zoom: 1, pan: { x: 0, y: 0 }, fitted: false }, 1.2, 7, 3, bounds);
    expect(next.zoom).toBeCloseTo(1.2);
    expect(next.pan.x).toBeCloseTo(-1.4);
    expect(next.pan.y).toBeCloseTo(-0.6);
    expect(next.fitted).toBe(false);
  });

  it("round-trips in then out", () => {
    const start = { zoom: 3, pan: { x: 12.5, y: -7 }, fitted: true };
    const back = zoomWorldAboutPivot(zoomWorldAboutPivot(start, 1.2, 40, 50, bounds), 1 / 1.2, 40, 50, bounds);
    expect(back.zoom).toBeCloseTo(3);
    expect(back.pan.x).toBeCloseTo(12.5);
    expect(back.pan.y).toBeCloseTo(-7);
  });

  it("returns the same object when the clamped zoom does not change", () => {
    const atMax = { zoom: 32, pan: { x: 1, y: 2 }, fitted: true };
    expect(zoomWorldAboutPivot(atMax, 2, 0, 0, bounds)).toBe(atMax);
    const atMin = { zoom: 1 / 64, pan: { x: 1, y: 2 }, fitted: true };
    expect(zoomWorldAboutPivot(atMin, 0.5, 0, 0, bounds)).toBe(atMin);
  });
});

describe("bounds and fits (P12-4m)", () => {
  it("boundsOf skips zero-size placements and uses sizeOf for orphans", () => {
    // Orphan (component -1, 0x0 on the wire) sized 6x4 by sizeOf at (30, 40): union (0,0)-(36,44). Z (0x0) and W (0x5) skip.
    const list = [p("A", 0, 0, 10, 10, 0), p("O", 30, 40, 0, 0, -1), p("Z", 500, 500, 0, 0, -1), p("W", 900, 0, 0, 5, -1)];
    const sizes = new Map([["O", { width: 6, height: 4 }]]);
    expect(boundsOf(list, (q) => sizes.get(q.map) ?? q)).toEqual({ x: 0, y: 0, width: 36, height: 44 });
    expect(boundsOf([p("Z", 500, 500, 0, 0, -1)])).toBeNull();
    expect(boundsOf([])).toBeNull();
  });

  it("fitClusters excludes singleton components", () => {
    // A (0,0 10x10) and B (10,0 10x5) share component 0 -> (0,0)-(20,10). S is a singleton far away.
    const components = [{ maps: ["A", "B"] }, { maps: ["S"] }];
    const list = [p("A", 0, 0, 10, 10, 0), p("B", 10, 0, 10, 5, 0), p("S", 100, 100, 4, 4, 1)];
    expect(fitClusters(list, components)).toEqual({ x: 0, y: 0, width: 20, height: 10 });
  });

  it("fitClusters excludes manual orphans and shelved placements", () => {
    // M is component -1, H is shelved (index 7 >= components.length): neither resolves.
    const components = [{ maps: ["A", "B"] }];
    const list = [p("A", 0, 0, 10, 10, 0), p("B", 10, 0, 10, 5, 0), p("M", -90, -90, 5, 5, -1), p("H", 9000, 0, 5, 5, 7)];
    expect(fitClusters(list, components)).toEqual({ x: 0, y: 0, width: 20, height: 10 });
  });

  it("fitClusters falls back to every placement when no cluster qualifies", () => {
    // S (100,100 4x4) and T (-50,0 2x2): union x -50..104, y 0..104 -> (-50, 0, 154, 104).
    const components = [{ maps: ["S"] }, { maps: ["T"] }];
    expect(fitClusters([p("S", 100, 100, 4, 4, 0), p("T", -50, 0, 2, 2, 1)], components))
      .toEqual({ x: -50, y: 0, width: 154, height: 104 });
  });

  it("fitClusters falls back correctly from a one-shot iterator (Map.values())", () => {
    // Same fixture as above, passed as world.placements.values(): the fallback must not re-read a spent iterator.
    const placements = new Map([["S", p("S", 100, 100, 4, 4, 0)], ["T", p("T", -50, 0, 2, 2, 1)]]);
    expect(fitClusters(placements.values(), [{ maps: ["S"] }, { maps: ["T"] }]))
      .toEqual({ x: -50, y: 0, width: 154, height: 104 });
  });

  it("fitClusters is null for an empty world", () => {
    expect(fitClusters([], [])).toBeNull();
  });

  it("fitFilter fits only anchored members when one resolves (distant shelf excluded)", () => {
    // Town at (0,0 20x20) in component 0; Floor shelved at x 20000 (component 5 >= 2). Other is not in the filter.
    const components = [{ maps: ["Town", "Route"] }, { maps: ["Other"] }];
    const list = [p("Town", 0, 0, 20, 20, 0), p("Floor", 20000, 0, 5, 5, 5), p("Other", -500, -500, 9, 9, 1)];
    expect(fitFilter(list, new Set(["Town", "Floor", "Missing"]), components)).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  });

  it("fitFilter falls back to every member when none is anchored", () => {
    // Floors at x 20000 and 20010 (5x5 each), both shelved: (20000, 0, 15, 5).
    const list = [p("F1", 20000, 0, 5, 5, 5), p("F2", 20010, 0, 5, 5, 6), p("Town", 0, 0, 20, 20, 0)];
    expect(fitFilter(list, new Set(["F1", "F2"]), [{ maps: ["Town", "X"] }])).toEqual({ x: 20000, y: 0, width: 15, height: 5 });
    expect(fitFilter(list, new Set(["Missing"]), [])).toBeNull();
  });

  it("computeFit centres at the largest clamped zoom that shows everything", () => {
    const gba = { min: 1 / 128, max: 16 };
    // 100x50 in 400x300: min(4, 6) = 4; pan (0 + (400-400)/2, 0 + (300-200)/2) = (0, 50).
    expect(computeFit({ x: 0, y: 0, width: 100, height: 50 }, { w: 400, h: 300 }, gba)).toEqual({ zoom: 4, pan: { x: 0, y: 50 } });
    // 10x10 in 400x300: raw 30 -> clamp 16; pan ((400-160)/2, (300-160)/2) = (120, 70).
    expect(computeFit({ x: 0, y: 0, width: 10, height: 10 }, { w: 400, h: 300 }, gba)).toEqual({ zoom: 16, pan: { x: 120, y: 70 } });
    // Offset bounds (5, 10, 100x50) at 4: pan (-20 + 0, -40 + 50) = (-20, 10).
    expect(computeFit({ x: 5, y: 10, width: 100, height: 50 }, { w: 400, h: 300 }, gba)).toEqual({ zoom: 4, pan: { x: -20, y: 10 } });
    expect(computeFit({ x: 0, y: 0, width: 0, height: 5 }, { w: 400, h: 300 }, gba)).toEqual({ zoom: 1, pan: { x: 0, y: 0 } });
    expect(computeFit({ x: 0, y: 0, width: 5, height: 5 }, { w: 0, h: 300 }, gba)).toEqual({ zoom: 1, pan: { x: 0, y: 0 } });
  });

  it("jumpFit is a no-op fit for degenerate input", () => {
    expect(jumpFit({ x: 0, y: 0, width: 0, height: 5 }, { w: 400, h: 300 }, { min: 1 / 64, max: 32 })).toEqual({ zoom: 1, pan: { x: 0, y: 0 } });
  });

  it("centredFit centres at a given zoom", () => {
    // (10, 20, 30x40) at 2 in 200x100: pan (-20 + (200-60)/2, -40 + (100-80)/2) = (50, -30).
    expect(centredFit({ x: 10, y: 20, width: 30, height: 40 }, { w: 200, h: 100 }, 2)).toEqual({ zoom: 2, pan: { x: 50, y: -30 } });
  });

  it("jumpFit fills the limiting viewport dimension before clamping", () => {
    const gbc = { min: 1 / 64, max: 32 };
    // 20x18 at (10,20) in 1000x668: raw min(50,668/18)=37.111, clamped to 32.
    // Pan x=500-20*32=-140; y=334-29*32=-594.
    const small = jumpFit({ x: 10, y: 20, width: 20, height: 18 }, { w: 1000, h: 668 }, gbc);
    expect(small.zoom).toBeCloseTo(32, 6);
    expect(small.pan.x).toBeCloseTo(-140, 3);
    expect(small.pan.y).toBeCloseTo(-594, 3);
    // 2000x1000 in 1000x500: raw 0.5; centred dimensions fill exactly, giving pan (0,0).
    expect(jumpFit({ x: 0, y: 0, width: 2000, height: 1000 }, { w: 1000, h: 500 }, gbc)).toEqual({ zoom: 0.5, pan: { x: 0, y: 0 } });
    // 2x2 in 1000x668: raw 334, clamped to 32; pan ((1000-64)/2,(668-64)/2)=(468,302).
    expect(jumpFit({ x: 0, y: 0, width: 2, height: 2 }, { w: 1000, h: 668 }, gbc)).toEqual({ zoom: 32, pan: { x: 468, y: 302 } });
  });

  it("singletonSizes maps each one-map component to its size", () => {
    const sizes = singletonSizes([
      { maps: ["A", "B"], bounds: { width: 9, height: 9 } },
      { maps: ["S"], bounds: { width: 4, height: 3 } },
    ]);
    expect([...sizes]).toEqual([["S", { width: 4, height: 3 }]]);
    expect(singletonSizes(undefined).size).toBe(0);
  });
});

describe("LOD rule", () => {
  it("uses small tiles below native x LOD_SCALE", () => {
    // 16 -> 4 px/tile; 32 -> 8 px/block.
    expect(smallTilesAt(3.99, 16)).toBe(true);
    expect(smallTilesAt(4, 16)).toBe(false);
    expect(smallTilesAt(7.99, 32)).toBe(true);
    expect(smallTilesAt(8, 32)).toBe(false);
  });
});

describe("projection (P12-6)", () => {
  const view = { zoom: 2, pan: { x: 5, y: -3 } };

  it("worldToScreen and screenToWorld round-trip", () => {
    // (10, 20) -> (10*2 + 5, 20*2 - 3) = (25, 37).
    expect(worldToScreen({ x: 10, y: 20 }, view)).toEqual({ x: 25, y: 37 });
    expect(screenToWorld({ x: 25, y: 37 }, view)).toEqual({ x: 10, y: 20 });
    const back = worldToScreen(screenToWorld({ x: 3.3, y: -8.1 }, view), view);
    expect(back.x).toBeCloseTo(3.3);
    expect(back.y).toBeCloseTo(-8.1);
  });

  it("rectOf projects a placement's rect, with an optional size override", () => {
    // (10, 20, 4x3) -> (25, 37, 8x6); an orphan sized 6x5 -> 12x10.
    expect(rectOf({ x: 10, y: 20, width: 4, height: 3 }, view)).toEqual({ x: 25, y: 37, w: 8, h: 6 });
    expect(rectOf({ x: 10, y: 20, width: 0, height: 0 }, view, { width: 6, height: 5 })).toEqual({ x: 25, y: 37, w: 12, h: 10 });
  });

  it("warpPoint applies the family's warp offset", () => {
    // GBA (offset 1): ((10+6)*2 + 5, (20+4)*2 - 3) = (37, 45). GBC (offset 1/2): ((10+3)*2 + 5, (20+2)*2 - 3) = (31, 41).
    expect(warpPoint({ x: 10, y: 20 }, { x: 6, y: 4 }, 1, view)).toEqual({ x: 37, y: 45 });
    expect(warpPoint({ x: 10, y: 20 }, { x: 6, y: 4 }, 0.5, view)).toEqual({ x: 31, y: 41 });
  });

  it("warpHit uses an 8 px screen radius (P12-4i)", () => {
    const entries = [{ key: "a", sx: 100, sy: 100 }, { key: "b", sx: 100, sy: 100 }];
    expect(warpHit(entries, 107.9, 100)?.key).toBe("a");
    expect(warpHit(entries, 108, 100)?.key).toBe("a");
    expect(warpHit(entries, 108.1, 100)).toBeUndefined();
    // Diagonal (5.6, 5.6): hypot 7.92 hits; (5.7, 5.7): 8.06 misses.
    expect(warpHit(entries, 105.6, 105.6)?.key).toBe("a");
    expect(warpHit(entries, 105.7, 105.7)).toBeUndefined();
  });

  it("hitPlacement returns the topmost (last drawn) placement, half-open rects", () => {
    const a = p("A", 0, 0, 10, 10, 0);
    const b = p("B", 5, 5, 10, 10, 0);
    expect(hitPlacement([a, b], 7, 7)).toBe(b);
    expect(hitPlacement([b, a], 7, 7)).toBe(a);
    expect(hitPlacement([a, b], 2, 2)).toBe(a);
    expect(hitPlacement([a, b], 10, 10)).toBe(b);
    expect(hitPlacement([a, b], 15, 15)).toBeNull();
    // A alone: left/top edge closed, right edge open.
    expect(hitPlacement([a], 0, 0)).toBe(a);
    expect(hitPlacement([a], 10, 5)).toBeNull();
    // sizeOf override for an orphan.
    const o = p("O", 20, 20, 0, 0, -1);
    expect(hitPlacement([o], 21, 21)).toBeNull();
    expect(hitPlacement([o], 21, 21, () => ({ width: 3, height: 3 }))).toBe(o);
  });
});
