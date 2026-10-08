import { describe, it, expect } from "vitest";
import { snapContextZoom, enterContextView, mapViewFromWorld, worldViewFromMapView } from "../../src/world/contextView.js";

// Plan 7 Task 5b: the same alignment math at the GBC native scale. The GBC world zoom is px per BLOCK, native 32
// (one 32 px block), so world zoom 32*z == GbcMapCanvas zoom z. The composite's border ring is one block: origin 32.

describe("snapContextZoom, native 32", () => {
  it.each([
    [32, 1], // log2(1) = 0 -> 1x
    [64, 2], // log2(2) = 1 -> 2x
    [128, 4], // log2(4) = 2 -> 4x
    [45, 1], // 45/32 = 1.406, log2 = 0.49 -> round 0 -> 1x
    [46, 2], // 46/32 = 1.4375, log2 = 0.524 -> round 1 -> 2x
    [1, 1], // log2(1/32) = -5 -> clamped to 0 -> 1x
    [400, 4], // 400/32 = 12.5, log2 = 3.64 -> clamped to 2 -> 4x
  ])("%s px/block -> %sx", (worldZoom, expected) => {
    expect(snapContextZoom(worldZoom, 32)).toBe(expected);
  });
  it("without native it is still the GBA scale (16)", () => {
    expect(snapContextZoom(32)).toBe(2); // log2(32/16) = 1
  });
});

describe("enterContextView, native 32", () => {
  it("z=2: placement (2,3) 4x2 blocks, pointer (200,150)", () => {
    // centre = (2 + 2, 3 + 1) = (4, 4) blocks; at 32*2 = 64 px/block that is (256, 256) px; pan = (200-256, 150-256) = (-56, -106).
    expect(enterContextView({ placement: { x: 2, y: 3, width: 4, height: 2 }, pointer: { x: 200, y: 150 }, zoom: 2, native: 32 }))
      .toEqual({ zoom: 64, pan: { x: -56, y: -106 } });
  });
  it("z=4, odd size: placement (0,0) 3x5, pointer (50,60)", () => {
    // centre = (1.5, 2.5) * 128 = (192, 320); pan = (50-192, 60-320) = (-142, -260).
    expect(enterContextView({ placement: { x: 0, y: 0, width: 3, height: 5 }, pointer: { x: 50, y: 60 }, zoom: 4, native: 32 }))
      .toEqual({ zoom: 128, pan: { x: -142, y: -260 } });
  });
});

describe("mapViewFromWorld / worldViewFromMapView, native 32", () => {
  it("p=(10,20), origin (32,32), worldZoom 64 (z=2), worldPan (5,-7) -> pan (581, 1209)", () => {
    // pan.x = 10*64 + 5 - 32*2 = 640 + 5 - 64 = 581; pan.y = 20*64 - 7 - 64 = 1280 - 7 - 64 = 1209.
    expect(mapViewFromWorld({ placement: { x: 10, y: 20 }, worldPan: { x: 5, y: -7 }, worldZoom: 64, originX: 32, originY: 32, native: 32 }))
      .toEqual({ zoom: 2, pan: { x: 581, y: 1209 } });
  });
  it("p=(-3,2), origin (32,32), worldZoom 128 (z=4), worldPan (-10,7) -> pan (-522, 135)", () => {
    // pan.x = -3*128 - 10 - 32*4 = -384 - 10 - 128 = -522; pan.y = 2*128 + 7 - 128 = 135.
    expect(mapViewFromWorld({ placement: { x: -3, y: 2 }, worldPan: { x: -10, y: 7 }, worldZoom: 128, originX: 32, originY: 32, native: 32 }))
      .toEqual({ zoom: 4, pan: { x: -522, y: 135 } });
  });
  it("worldViewFromMapView is the literal inverse: view {2,(581,1209)} -> world 64, pan (5,-7)", () => {
    // pan.x = 581 + 32*2 - 10*64 = 581 + 64 - 640 = 5; pan.y = 1209 + 64 - 1280 = -7.
    expect(worldViewFromMapView({ placement: { x: 10, y: 20 }, view: { zoom: 2, pan: { x: 581, y: 1209 } }, originX: 32, originY: 32, native: 32 }))
      .toEqual({ zoom: 64, pan: { x: 5, y: -7 } });
  });
  it("round-trips exactly, both directions, over several placements, zooms and pans", () => {
    for (const [px, py] of [[0, 0], [10, 20], [-3, 2], [7, -9]] as const) {
      for (const zoom of [1, 2, 4] as const) {
        for (const pan of [{ x: 0, y: 0 }, { x: 5, y: -7 }, { x: -311, y: 98 }]) {
          const a = { placement: { x: px, y: py }, originX: 32, originY: 32, native: 32 };
          const world = { zoom: 32 * zoom, pan };
          const view = mapViewFromWorld({ ...a, worldPan: world.pan, worldZoom: world.zoom });
          expect(worldViewFromMapView({ ...a, view })).toEqual(world);
          expect(mapViewFromWorld({ ...a, worldPan: world.pan, worldZoom: world.zoom })).toEqual(view);
        }
      }
    }
  });
});
