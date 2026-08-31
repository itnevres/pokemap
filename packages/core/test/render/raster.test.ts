import { describe, it, expect } from "vitest";
import { createRaster, blit, blitScaled, fillRect, blendRect } from "../../src/render/raster.js";

describe("raster", () => {
  it("creates a transparent RGBA buffer", () => {
    const r = createRaster(4, 2);
    expect(r.width).toBe(4);
    expect(r.height).toBe(2);
    expect(r.data).toHaveLength(4 * 2 * 4);
    expect([...r.data.slice(0, 4)]).toEqual([0, 0, 0, 0]);
  });

  it("blits a source over a destination, skipping transparent pixels", () => {
    const dst = createRaster(2, 1);
    fillRect(dst, 0, 0, 2, 1, { r: 10, g: 20, b: 30, a: 255 });
    const src = createRaster(2, 1);
    src.data.set([99, 0, 0, 255], 0); // opaque red at x=0; x=1 stays transparent
    blit(dst, src, 0, 0);
    expect([...dst.data.slice(0, 4)]).toEqual([99, 0, 0, 255]);
    expect([...dst.data.slice(4, 8)]).toEqual([10, 20, 30, 255]);
  });

  it("clips a blit that runs past the far edge, writing only the overlap", () => {
    // "does not throw" would pass against an empty function body. Check which
    // pixels actually changed.
    const dst = createRaster(2, 2);
    const src = createRaster(2, 2);
    src.data.fill(255);
    blit(dst, src, 1, 1);
    const px = (x: number, y: number) => [...dst.data.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 4)];
    expect(px(0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(1, 0)).toEqual([0, 0, 0, 0]);
    expect(px(0, 1)).toEqual([0, 0, 0, 0]);
    expect(px(1, 1)).toEqual([255, 255, 255, 255]);   // the single overlapping pixel
  });

  it("clips a blit at negative offsets, taking the source's far corner", () => {
    const dst = createRaster(2, 2);
    const src = createRaster(2, 2);
    // Distinguish the four source pixels so we can tell which one landed.
    for (let i = 0; i < 4; i++) src.data.set([i + 1, 0, 0, 255], i * 4);
    blit(dst, src, -1, -1);
    const px = (x: number, y: number) => [...dst.data.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 4)];
    // src (1,1) -- its fourth pixel, value 4 -- is the only one still on screen.
    expect(px(0, 0)).toEqual([4, 0, 0, 255]);
    expect(px(1, 0)).toEqual([0, 0, 0, 0]);
    expect(px(0, 1)).toEqual([0, 0, 0, 0]);
  });

  it("fillRect clamps to the raster instead of writing out of bounds", () => {
    const r = createRaster(2, 2);
    // Deliberately overhangs on every side.
    fillRect(r, -5, -5, 100, 100, { r: 1, g: 2, b: 3, a: 4 });
    expect([...r.data]).toEqual([
      1, 2, 3, 4, 1, 2, 3, 4,
      1, 2, 3, 4, 1, 2, 3, 4,
    ]);
  });

  it("fillRect writes only the rectangle it is given", () => {
    const r = createRaster(3, 1);
    fillRect(r, 1, 0, 1, 1, { r: 9, g: 9, b: 9, a: 255 });
    expect([...r.data]).toEqual([
      0, 0, 0, 0,
      9, 9, 9, 255,
      0, 0, 0, 0,
    ]);
  });

  it("blitScaled at scale 1 is byte-identical to blit", () => {
    const src = createRaster(4, 4);
    for (let i = 0; i < 16; i++) src.data.set([i * 16, i, 255 - i, 255], i * 4);

    const viaBlit = createRaster(4, 4);
    blit(viaBlit, src, 0, 0);
    const viaScaled = createRaster(4, 4);
    blitScaled(viaScaled, src, 0, 0, 1);

    expect([...viaScaled.data]).toEqual([...viaBlit.data]);
  });

  it("blitScaled at 0.25 samples every fourth pixel, nearest-neighbour", () => {
    // The world view draws 1,209 maps at a fraction of full size. Smoothing
    // would blend adjacent metatiles into colours that exist in neither, so
    // this must sample rather than average.
    const src = createRaster(8, 8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) src.data.set([x * 8, y * 8, 0, 255], (y * 8 + x) * 4);
    }
    const dst = createRaster(2, 2);
    blitScaled(dst, src, 0, 0, 0.25);

    const px = (x: number, y: number) => [...dst.data.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 4)];
    // Destination (0,0) samples source (0,0); (1,1) samples source (4,4).
    expect(px(0, 0)).toEqual([0, 0, 0, 255]);
    expect(px(1, 0)).toEqual([32, 0, 0, 255]);
    expect(px(0, 1)).toEqual([0, 32, 0, 255]);
    expect(px(1, 1)).toEqual([32, 32, 0, 255]);
    // Every value present must come from the source; nothing averaged.
    for (let i = 0; i < dst.data.length; i += 4) {
      expect(dst.data[i]! % 8).toBe(0);
      expect(dst.data[i + 1]! % 8).toBe(0);
    }
  });

  it("blendRect composites source-over instead of overwriting", () => {
    // Opaque white background, blend opaque-ish red at half alpha over it.
    // Source-over math: out = sa + da*(1-sa); with da=1 the result stays fully
    // opaque, and each channel moves toward the source in proportion to sa.
    // fillRect would instead replace the pixel outright with (255,0,0,128) --
    // still opaque-looking in isolation, but a plainly different, wrong,
    // colour and alpha than a true blend produces. That distinguishes this
    // test from one that would pass against fillRect renamed to blendRect.
    const r = createRaster(1, 1);
    fillRect(r, 0, 0, 1, 1, { r: 255, g: 255, b: 255, a: 255 });
    blendRect(r, 0, 0, 1, 1, { r: 255, g: 0, b: 0, a: 128 });
    const [red, green, blue, alpha] = [...r.data];
    expect(red).toBe(255);
    expect(green).toBeGreaterThanOrEqual(125);
    expect(green).toBeLessThanOrEqual(130);
    expect(blue).toBe(green);
    expect(alpha).toBe(255);
  });

  it("blendRect at a:0 is a no-op, catching an implementation that ignores source alpha", () => {
    // A blendRect that assigns straight into the buffer (i.e. degenerates to
    // fillRect regardless of alpha) would still change these pixels even at
    // a:0. Only a real alpha-aware compositor leaves them untouched.
    const r = createRaster(2, 1);
    fillRect(r, 0, 0, 2, 1, { r: 10, g: 20, b: 30, a: 200 });
    const before = [...r.data];
    blendRect(r, 0, 0, 2, 1, { r: 255, g: 255, b: 255, a: 0 });
    expect([...r.data]).toEqual(before);
  });

  it("blendRect clamps to the raster instead of writing out of bounds", () => {
    const r = createRaster(2, 2);
    fillRect(r, 0, 0, 2, 2, { r: 0, g: 0, b: 0, a: 255 });
    // Deliberately overhangs on every side, mirroring fillRect's own clamp test.
    blendRect(r, -5, -5, 100, 100, { r: 255, g: 255, b: 255, a: 255 });
    expect([...r.data]).toEqual([
      255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255,
    ]);
  });
});
