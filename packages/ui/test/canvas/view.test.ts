import { describe, expect, it } from "vitest";
import { fitView, screenToSource, sourceToScreen, zoomAboutPivot, type View } from "../../src/canvas/view.js";
import { zoomAboutPivot as mapZoom, type MapView } from "../../src/components/mapView.js";

const stepped = { kind: "stepped", levels: [1, 2, 4] } as const;
const continuous = { kind: "continuous", min: 0.5, max: 3 } as const;

describe("zoomAboutPivot", () => {
  it("steps 1 -> 2 -> 4 and back while keeping an integral source pivot fixed", () => {
    let view: MapView = { zoom: 1, pan: { x: 10, y: -6 } };
    // Source pivot = ((30-10)/1, (14+6)/1) = (20,20).
    for (const [zoom, x, y] of [[2, -10, -26], [4, -50, -66], [2, -10, -26], [1, 10, -6]] as const) {
      // Pan = (30-20*zoom, 14-20*zoom): (-10,-26), (-50,-66), (-10,-26), (10,-6).
      const next = zoomAboutPivot(view, zoom, 30, 14, stepped);
      expect(next).toEqual({ zoom, pan: { x, y } });
      expect(mapZoom(view, zoom, 30, 14)).toEqual(next);
      expect(screenToSource({ x: 30, y: 14 }, next)).toEqual({ x: 20, y: 20 });
      view = next;
    }
  });

  it("rounds stepped pan at a fractional pivot exactly like the map API", () => {
    const view: MapView = { zoom: 1, pan: { x: 10, y: -6 } };
    // Source = (20.25,20.75); pan = (30.25-40.5,14.75-41.5) = (-10.25,-26.75), rounded (-10,-27).
    expect(zoomAboutPivot(view, 2, 30.25, 14.75, stepped)).toEqual({ zoom: 2, pan: { x: -10, y: -27 } });
    expect(mapZoom(view, 2, 30.25, 14.75)).toEqual({ zoom: 2, pan: { x: -10, y: -27 } });
    // At z2 source = (40.25/2,41.75/2); z1 pan = round(10.125,-6.125) = (10,-6).
    expect(mapZoom({ zoom: 2, pan: { x: -10, y: -27 } }, 1, 30.25, 14.75)).toEqual({ zoom: 1, pan: { x: 10, y: -6 } });
  });

  it("clamps continuous zoom at both ends and retains fractional pan", () => {
    const view = { zoom: 1, pan: { x: 10, y: -6 } };
    // Source = (20.25,20.75); z1.5 pan = (30.25-30.375,14.75-31.125).
    expect(zoomAboutPivot(view, 1.5, 30.25, 14.75, continuous)).toEqual({ zoom: 1.5, pan: { x: -0.125, y: -16.375 } });
    // Requested 8 clamps to 3: pan = (30.25-60.75,14.75-62.25).
    expect(zoomAboutPivot(view, 8, 30.25, 14.75, continuous)).toEqual({ zoom: 3, pan: { x: -30.5, y: -47.5 } });
    // Requested 0.1 clamps to 0.5: pan = (30.25-10.125,14.75-10.375).
    expect(zoomAboutPivot(view, 0.1, 30.25, 14.75, continuous)).toEqual({ zoom: 0.5, pan: { x: 20.125, y: 4.375 } });
  });

  it("returns the same object for unchanged zoom, including clamped no-ops", () => {
    const map: MapView = { zoom: 2, pan: { x: 5, y: 7 } };
    expect(zoomAboutPivot(map, 2, 1, 2, stepped)).toBe(map);
    expect(mapZoom(map, 2, 1, 2)).toBe(map);
    for (const [zoom, requested] of [[0.5, 0.1], [3, 8], [1, 1]]) {
      const view = { zoom: zoom!, pan: { x: 5, y: 7 } };
      expect(zoomAboutPivot(view, requested!, 1, 2, continuous)).toBe(view);
    }
  });
});

it("projects screen/source points in both directions", () => {
  const view: View = { zoom: 2.5, pan: { x: -7.5, y: 4.25 } };
  const source = { x: -3, y: 8 };
  const screen = { x: -15, y: 24.25 };
  // (-3*2.5-7.5,8*2.5+4.25) = (-15,24.25); inverse subtracts pan then divides by 2.5.
  expect(sourceToScreen(source, view)).toEqual(screen);
  expect(screenToSource(screen, view)).toEqual(source);
  expect(screenToSource(sourceToScreen(source, view), view)).toEqual(source);
  expect(sourceToScreen(screenToSource(screen, view), view)).toEqual(screen);
});

describe("fitView", () => {
  const base = { pixelWidth: 64, pixelHeight: 64, viewport: { w: 400, h: 400 }, policy: stepped };

  it("fits a small map without a band on every side", () => {
    for (const side of ["left", "right", "top", "bottom"] as const) {
      // z4: 64*4=256 <= 400; pan = (400-256)/2 = 72 on both axes.
      expect(fitView({ ...base, side, bandNative: 0 })).toEqual({ zoom: 4, pan: { x: 72, y: 72 } });
    }
  });

  it("reserves the encounter band on each side", () => {
    // Band 64: long axis 128*4=512 > 400, 128*2=256 fits; short axis 64*2=128.
    // Base long-axis pan (400-256)/2=72; short-axis pan (400-128)/2=136; leading band adds 64*2=128.
    expect(fitView({ ...base, side: "left", bandNative: 64 })).toEqual({ zoom: 2, pan: { x: 200, y: 136 } });
    expect(fitView({ ...base, side: "right", bandNative: 64 })).toEqual({ zoom: 2, pan: { x: 72, y: 136 } });
    expect(fitView({ ...base, side: "top", bandNative: 64 })).toEqual({ zoom: 2, pan: { x: 136, y: 200 } });
    expect(fitView({ ...base, side: "bottom", bandNative: 64 })).toEqual({ zoom: 2, pan: { x: 136, y: 72 } });
  });

  it("uses the smallest level for an oversized map, with and without a band", () => {
    const large = { ...base, pixelWidth: 600, pixelHeight: 500 };
    // z1 cannot fit: ((400-600)/2,(400-500)/2) = (-100,-50).
    expect(fitView({ ...large, side: "left", bandNative: 0 })).toEqual({ zoom: 1, pan: { x: -100, y: -50 } });
    // Left/right: (400-664)/2=-132, left adds 64 -> -68. Top/bottom: (400-564)/2=-82, top adds 64 -> -18.
    expect(fitView({ ...large, side: "left", bandNative: 64 })).toEqual({ zoom: 1, pan: { x: -68, y: -50 } });
    expect(fitView({ ...large, side: "right", bandNative: 64 })).toEqual({ zoom: 1, pan: { x: -132, y: -50 } });
    expect(fitView({ ...large, side: "top", bandNative: 64 })).toEqual({ zoom: 1, pan: { x: -100, y: -18 } });
    expect(fitView({ ...large, side: "bottom", bandNative: 64 })).toEqual({ zoom: 1, pan: { x: -100, y: -82 } });
  });

  it("rounds fit pan and falls back independently for each zero viewport axis", () => {
    // z4, horizontal pan round((401-256)/2)=73, vertical pan (400-256)/2=72.
    expect(fitView({ ...base, viewport: { w: 401, h: 400 }, side: "right", bandNative: 0 })).toEqual({ zoom: 4, pan: { x: 73, y: 72 } });
    // Both zero -> native 64x64 viewport; only z1 fits, (64-64)/2=0.
    expect(fitView({ ...base, viewport: { w: 0, h: 0 }, side: "right", bandNative: 0 })).toEqual({ zoom: 1, pan: { x: 0, y: 0 } });
    // Width 0 -> 64, height stays 400: z1, pan (0,(400-64)/2)=(0,168).
    expect(fitView({ ...base, viewport: { w: 0, h: 400 }, side: "right", bandNative: 0 })).toEqual({ zoom: 1, pan: { x: 0, y: 168 } });
    // Height 0 -> 64, width stays 400: z1, pan ((400-64)/2,0)=(168,0).
    expect(fitView({ ...base, viewport: { w: 400, h: 0 }, side: "right", bandNative: 0 })).toEqual({ zoom: 1, pan: { x: 168, y: 0 } });
    // Fallback 64x64 with left band: content 128x64; x=(64-128)/2+64=32, y=0, z1 minimum.
    expect(fitView({ ...base, viewport: { w: 0, h: 0 }, side: "left", bandNative: 64 })).toEqual({ zoom: 1, pan: { x: 32, y: 0 } });
  });
});
