import { describe, it, expect } from "vitest";
import { snapContextZoom, enterContextView, mapViewFromWorld, worldViewFromMapView } from "../../src/world/contextView.js";

// Plan 6c E4: the pure alignment math between the world canvas (zoom = screen px per tile, 16 = native, pan in
// screen px) and a MapCanvas (zoom 1|2|4 over a composite that carries a one-ring border: originX/originY are the
// composite px of the map's top-left tile). 16*z world px per tile == MapCanvas zoom z.

describe("snapContextZoom: clamp(round(log2(worldZoom / 16)), 0, 2) as 2^k", () => {
  it.each([
    [0.5, 1], // log2(0.5/16) = log2(1/32) = -5 -> clamped to 0 -> 1x
    [16, 1], // log2(1) = 0 -> 1x
    [22, 1], // 22/16 = 1.375, log2 = 0.459 -> round 0 -> 1x
    [23, 2], // 23/16 = 1.4375, log2 = 0.524 -> round 1 -> 2x
    [45, 2], // 45/16 = 2.8125, log2 = 1.492 -> round 1 -> 2x
    [46, 4], // 46/16 = 2.875, log2 = 1.524 -> round 2 -> 4x
    [200, 4], // 200/16 = 12.5, log2 = 3.64 -> round 4 -> clamped to 2 -> 4x
  ])("%s px/tile -> %sx", (worldZoom, expected) => {
    expect(snapContextZoom(worldZoom)).toBe(expected);
  });
});

describe("enterContextView: the map's centre lands on the pointer", () => {
  it("z=2: placement (10,20) 30x20, pointer (200,150)", () => {
    // centre = (10 + 30/2, 20 + 20/2) = (25, 30) tiles; at 16*2 = 32 px/tile that is (800, 960) px;
    // pan = (200 - 800, 150 - 960) = (-600, -810).
    expect(enterContextView({ placement: { x: 10, y: 20, width: 30, height: 20 }, pointer: { x: 200, y: 150 }, zoom: 2 }))
      .toEqual({ zoom: 32, pan: { x: -600, y: -810 } });
  });
  it("z=1, odd size: placement (3,4) 5x7, pointer (100,100)", () => {
    // centre = (5.5, 7.5) tiles * 16 = (88, 120) px; pan = (100 - 88, 100 - 120) = (12, -20).
    expect(enterContextView({ placement: { x: 3, y: 4, width: 5, height: 7 }, pointer: { x: 100, y: 100 }, zoom: 1 }))
      .toEqual({ zoom: 16, pan: { x: 12, y: -20 } });
  });
  it("z=4: placement (0,0) 3x3, pointer (50,60)", () => {
    // centre = (1.5, 1.5) * 64 = (96, 96); pan = (50 - 96, 60 - 96) = (-46, -36).
    expect(enterContextView({ placement: { x: 0, y: 0, width: 3, height: 3 }, pointer: { x: 50, y: 60 }, zoom: 4 }))
      .toEqual({ zoom: 64, pan: { x: -46, y: -36 } });
  });
  it("rounds the pan to whole px (Math.round: .5 goes up)", () => {
    // Same placement as the z=1 case, pointer (100.5, 100.5): x = 100.5 - 88 = 12.5 -> 13; y = 100.5 - 120 = -19.5 -> -19.
    expect(enterContextView({ placement: { x: 3, y: 4, width: 5, height: 7 }, pointer: { x: 100.5, y: 100.5 }, zoom: 1 }).pan)
      .toEqual({ x: 13, y: -19 });
  });
});

describe("mapViewFromWorld", () => {
  it("p=(10,20), origin (32,32), z=2, worldPan (5,-7) -> pan (261, 569)", () => {
    // worldZoom 32 -> z = 2. pan.x = 10*32 + 5 - 32*2 = 320 + 5 - 64 = 261; pan.y = 20*32 - 7 - 64 = 640 - 7 - 64 = 569.
    expect(mapViewFromWorld({ placement: { x: 10, y: 20 }, worldPan: { x: 5, y: -7 }, worldZoom: 32, originX: 32, originY: 32 }))
      .toEqual({ zoom: 2, pan: { x: 261, y: 569 } });
  });
  it("z=1, p=(0,0), origin (16,32), worldPan (100,50) -> pan (84, 18)", () => {
    // pan.x = 0 + 100 - 16*1 = 84; pan.y = 0 + 50 - 32*1 = 18.
    expect(mapViewFromWorld({ placement: { x: 0, y: 0 }, worldPan: { x: 100, y: 50 }, worldZoom: 16, originX: 16, originY: 32 }))
      .toEqual({ zoom: 1, pan: { x: 84, y: 18 } });
  });
  it("z=4, negative placement, p=(-3,2), origin (48,32), worldPan (-10,7) -> pan (-394, 7)", () => {
    // pan.x = -3*64 + -10 - 48*4 = -192 - 10 - 192 = -394; pan.y = 2*64 + 7 - 32*4 = 128 + 7 - 128 = 7.
    expect(mapViewFromWorld({ placement: { x: -3, y: 2 }, worldPan: { x: -10, y: 7 }, worldZoom: 64, originX: 48, originY: 32 }))
      .toEqual({ zoom: 4, pan: { x: -394, y: 7 } });
  });
});

describe("worldViewFromMapView", () => {
  it("view {2, (261,569)}, p=(10,20), origin (32,32) -> world zoom 32, pan (5, -7)", () => {
    // pan.x = 261 + 32*2 - 10*32 = 261 + 64 - 320 = 5; pan.y = 569 + 64 - 20*32 = 569 + 64 - 640 = -7.
    expect(worldViewFromMapView({ placement: { x: 10, y: 20 }, view: { zoom: 2, pan: { x: 261, y: 569 } }, originX: 32, originY: 32 }))
      .toEqual({ zoom: 32, pan: { x: 5, y: -7 } });
  });
  it("round-trips exactly in both directions", () => {
    const a = { placement: { x: 10, y: 20 }, originX: 32, originY: 32 };
    const worldA = { zoom: 32, pan: { x: 5, y: -7 } };
    expect(worldViewFromMapView({ ...a, view: mapViewFromWorld({ ...a, worldPan: worldA.pan, worldZoom: worldA.zoom }) })).toEqual(worldA);
    const b = { placement: { x: -3, y: 2 }, originX: 48, originY: 32 };
    const viewB = { zoom: 4 as const, pan: { x: -394, y: 7 } };
    const worldB = worldViewFromMapView({ ...b, view: viewB });
    expect(mapViewFromWorld({ ...b, worldPan: worldB.pan, worldZoom: worldB.zoom })).toEqual(viewB);
  });
});
