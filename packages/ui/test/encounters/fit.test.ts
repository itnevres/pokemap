import { describe, it, expect } from "vitest";
import { fitWithBand } from "../../src/encounters/fit.js";

// Image 64x64 native px in a 400x400 viewport, zoom levels 1/2/4, a band of 64 native px.
const base = { pw: 64, ph: 64, vw: 400, vh: 400, levels: [1, 2, 4] as const };

describe("fitWithBand (pure)", () => {
  it("band 0: the plain fit -- zoom 4 (256 <= 400), centred at (72, 72)", () => {
    for (const side of ["left", "top", "right", "bottom"] as const) {
      expect(fitWithBand({ ...base, bandNative: 0, side })).toEqual({ zoom: 4, pan: { x: 72, y: 72 } });
    }
  });

  // Width-wise sides: content (64+64) x 64. zoom 4: 512 > 400; zoom 2: 256 x 128 fits -> z 2.
  //   x0 = round((400-256)/2) = 72, y0 = round((400-128)/2) = 136.
  it("left: one band of room on the left; the image is pushed right by band*z = 128", () => {
    expect(fitWithBand({ ...base, bandNative: 64, side: "left" })).toEqual({ zoom: 2, pan: { x: 200, y: 136 } });
  });

  it("right: same zoom and centring, no offset (the band sits after the image)", () => {
    expect(fitWithBand({ ...base, bandNative: 64, side: "right" })).toEqual({ zoom: 2, pan: { x: 72, y: 136 } });
  });

  // Height-wise sides: content 64 x (64+64). zoom 2: 128 x 256 fits; zoom 4: 512 tall > 400 -> z 2.
  //   x0 = round((400-128)/2) = 136, y0 = round((400-256)/2) = 72.
  it("top: the image is pushed down by band*z = 128", () => {
    expect(fitWithBand({ ...base, bandNative: 64, side: "top" })).toEqual({ zoom: 2, pan: { x: 136, y: 200 } });
  });

  it("bottom: same zoom and centring, no offset", () => {
    expect(fitWithBand({ ...base, bandNative: 64, side: "bottom" })).toEqual({ zoom: 2, pan: { x: 136, y: 72 } });
  });

  it("the band shrinks the zoom: left at 400 is zoom 2 where band 0 was zoom 4", () => {
    expect(fitWithBand({ ...base, bandNative: 64, side: "left" }).zoom).toBeLessThan(fitWithBand({ ...base, bandNative: 0, side: "left" }).zoom);
  });

  it("a band on the left does not shrink the zoom by height, nor one on top by width", () => {
    // viewport 130 wide x 400 tall: left needs 128 wide at z1 (fits), z2 = 256 (no) -> z1;
    // top needs only 64 wide, but 128 tall: z2 = 128 wide x 256 tall fits -> z2.
    const narrow = { ...base, vw: 130, bandNative: 64 };
    expect(fitWithBand({ ...narrow, side: "left" }).zoom).toBe(1);
    expect(fitWithBand({ ...narrow, side: "top" }).zoom).toBe(2);
  });

  it("nothing fits: the smallest level, centred (possibly negative pan)", () => {
    // z1: content (64+64) x 64 in 10 x 10: x0 = round((10-128)/2) = -59, y0 = round((10-64)/2) = -27; left adds 64.
    expect(fitWithBand({ ...base, vw: 10, vh: 10, bandNative: 64, side: "left" })).toEqual({ zoom: 1, pan: { x: 5, y: -27 } });
  });

  it("pan is rounded like the old fit: (401-256)/2 = 72.5 -> 73", () => {
    expect(fitWithBand({ ...base, vw: 401, bandNative: 0, side: "left" })).toEqual({ zoom: 4, pan: { x: 73, y: 72 } });
  });
});
