import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { readShadesPng } from "../../../src/gbc/load/png.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";

const G = GBC_SUBJECT_ROOT;

/** Minimal PNG builder for colour types 0 (grayscale) and 6 (RGBA), the two
 *  the GBC decoder must accept. `raw` is the pre-deflate scanline data
 *  (filter byte + packed/expanded samples), hand-derived per test so the
 *  unfilter path is exercised on real filter bytes, not just filter 0. */
function buildPng(width: number, height: number, colourType: number, depth: number, raw: Buffer): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const byte of b) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = depth; ihdr[9] = colourType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 4x2 grayscale depth-2: row0 filter None, gray [0,1,2,3]; row1 filter Up,
 *  gray [3,2,1,0]. bpp is 1 for sub-byte samples, so Up operates byte-wise:
 *  row0 packed byte = 0b00_01_10_11 = 0x1B; row1 packed byte (true) =
 *  0b11_10_01_00 = 0xE4; raw = (0xE4 - 0x1B) & 0xff = 0xC9. */
function grayscaleDepth2Png(): Buffer {
  const raw = Buffer.from([0x00, 0x1b, 0x02, 0xc9]);
  return buildPng(4, 2, 0, 2, raw);
}

/** 2x2 RGBA depth-8: row0 filter None, gray [255, 0]; row1 filter Sub,
 *  gray [85, 170] -- worked by hand in the implementer report. */
function rgbaDepth8Png(): Buffer {
  const raw = Buffer.from([
    0x00, 255, 255, 255, 255, 0, 0, 0, 255,
    0x01, 85, 85, 85, 255, 85, 85, 85, 0,
  ]);
  return buildPng(2, 2, 6, 8, raw);
}

/**
 * 2x2 RGBA depth-8, row0 filter None gray [255, 0] (as above), row1 filter
 * Up (2), gray [170, 85]. bpp=4, so Up's `prior` is the same byte offset in
 * the previous row (spec-review Item 4: this exercises bpp=4's row-to-row
 * back-reference, not just Sub's within-row one).
 *
 * Hand-worked: row0 true bytes [255,255,255,255, 0,0,0,255]; row1 true
 * bytes [170,170,170,255, 85,85,85,255]. raw(x) = (true(x) - prior(x)) & 0xff:
 *   idx0-2: (170-255)&0xff=171   idx3: (255-255)&0xff=0
 *   idx4-6: (85-0)&0xff=85       idx7: (255-255)&0xff=0
 */
function rgbaDepth8UpPng(): Buffer {
  const raw = Buffer.from([
    0x00, 255, 255, 255, 255, 0, 0, 0, 255,
    0x02, 171, 171, 171, 0, 85, 85, 85, 0,
  ]);
  return buildPng(2, 2, 6, 8, raw);
}

/**
 * 2x2 RGBA depth-8, row0 filter None gray [255, 0], row1 filter Average (3),
 * gray [85, 170]. Average's predictor is `floor((a+b)/2)` where `a` is the
 * same-row pixel `bpp` bytes back (0 when x < bpp) and `b` is the previous
 * row's same byte offset -- both a within-row AND a row-to-row reference.
 *
 * Hand-worked (bpp=4):
 *   x=0..2 (pixel0 R/G/B): a=0 (x<bpp), b=prior[x]=255, avg=floor(255/2)=127.
 *     true=85 -> raw=(85-127)&0xff=214
 *   x=3 (pixel0 A): a=0, b=prior[3]=255, avg=127. true=255(A unchanged) -> raw=(255-127)&0xff=128
 *   x=4..6 (pixel1 R/G/B): a=Recon[x-4]=85 (just-reconstructed pixel0), b=prior[x]=0, avg=floor(85/2)=42.
 *     true=170 -> raw=(170-42)&0xff=128
 *   x=7 (pixel1 A): a=Recon[3]=255, b=prior[7]=255, avg=255. true=255 -> raw=0
 */
function rgbaDepth8AveragePng(): Buffer {
  const raw = Buffer.from([
    0x00, 255, 255, 255, 255, 0, 0, 0, 255,
    0x03, 214, 214, 214, 128, 128, 128, 128, 0,
  ]);
  return buildPng(2, 2, 6, 8, raw);
}

/**
 * 2x2 RGBA depth-8, row0 filter None gray [255, 0], row1 filter Paeth (4),
 * gray [0, 255] (swapped from the other filter fixtures, so this test can't
 * pass by accident from a filter that's silently treated as None/Sub).
 * Paeth predictor: p=a+b-c, pick a/b/c by nearest to p (ties favour a, then b).
 *
 * Hand-worked (bpp=4):
 *   x=0..2 (pixel0): a=0 (x<bpp), b=prior[x]=255, c=0 (x<bpp). p=0+255-0=255.
 *     pa=255, pb=0, pc=255 -> pred=b=255. true=0 -> raw=(0-255)&0xff=1
 *   x=3 (pixel0 A): a=0, b=prior[3]=255, c=0. Same as above -> pred=255. true=255 -> raw=0
 *   x=4..6 (pixel1): a=Recon[x-4]=0, b=prior[x]=0, c=prior[x-4]=255. p=0+0-255=-255.
 *     pa=|-255-0|=255, pb=|-255-0|=255, pc=|-255-255|=510 -> pa<=pb -> pred=a=0.
 *     true=255 -> raw=(255-0)&0xff=255
 *   x=7 (pixel1 A): a=Recon[3]=255, b=prior[7]=255, c=prior[3]=255. p=255+255-255=255.
 *     pa=0 -> pred=a=255. true=255 -> raw=0
 */
function rgbaDepth8PaethPng(): Buffer {
  const raw = Buffer.from([
    0x00, 255, 255, 255, 255, 0, 0, 0, 255,
    0x04, 1, 1, 1, 0, 255, 255, 255, 0,
  ]);
  return buildPng(2, 2, 6, 8, raw);
}

describe("readShadesPng", () => {
  it("decodes grayscale depth 2, shade = 3 - grayLevel, including filter type Up", () => {
    const img = readShadesPng(grayscaleDepth2Png());
    expect([img.width, img.height]).toEqual([4, 2]);
    expect([...img.shades]).toEqual([3, 2, 1, 0, 0, 1, 2, 3]);
  });

  it("decodes RGBA depth 8, shade = 3 - (gray >> 6), including filter type Sub", () => {
    const img = readShadesPng(rgbaDepth8Png());
    expect([img.width, img.height]).toEqual([2, 2]);
    expect([...img.shades]).toEqual([0, 3, 2, 1]);
  });

  // Spec review note (task-5-spec-review.md item 2e): no real GBC PNG uses
  // any filter but None, and only Sub (above) had a committed bpp=4 test --
  // Average and Paeth's bpp=4 row-to-row back-reference was covered only by
  // the reviewer's own scratch script. These three pin filters Up/Average/
  // Paeth at bpp=4 with hand-derived expected shades (see each builder's
  // comment for the arithmetic).
  it("decodes RGBA depth 8 with filter type Up (bpp=4 row-to-row back-reference)", () => {
    const img = readShadesPng(rgbaDepth8UpPng());
    expect([img.width, img.height]).toEqual([2, 2]);
    expect([...img.shades]).toEqual([0, 3, 1, 2]);
  });

  it("decodes RGBA depth 8 with filter type Average (bpp=4 within-row AND row-to-row back-reference)", () => {
    const img = readShadesPng(rgbaDepth8AveragePng());
    expect([img.width, img.height]).toEqual([2, 2]);
    expect([...img.shades]).toEqual([0, 3, 2, 1]);
  });

  it("decodes RGBA depth 8 with filter type Paeth (bpp=4 within-row AND row-to-row back-reference)", () => {
    const img = readShadesPng(rgbaDepth8PaethPng());
    expect([img.width, img.height]).toEqual([2, 2]);
    expect([...img.shades]).toEqual([0, 3, 3, 0]);
  });

  it("refuses an RGBA pixel with alpha != 255, naming the pixel", () => {
    const raw = Buffer.from([0x00, 255, 255, 255, 254, 0, 0, 0, 255]);
    expect(() => readShadesPng(buildPng(2, 1, 6, 8, raw))).toThrow(/\(0,\s*0\).*alpha/i);
  });

  it("refuses a non-gray RGBA pixel (r != g), naming the pixel", () => {
    const raw = Buffer.from([0x00, 10, 20, 10, 255, 0, 0, 0, 255]);
    expect(() => readShadesPng(buildPng(2, 1, 6, 8, raw))).toThrow(/\(0,\s*0\)/);
  });

  it("refuses an RGBA gray value outside {0,85,170,255}, naming the pixel", () => {
    const raw = Buffer.from([0x00, 100, 100, 100, 255, 0, 0, 0, 255]);
    expect(() => readShadesPng(buildPng(2, 1, 6, 8, raw))).toThrow(/\(0,\s*0\)/);
  });

  it("refuses an unsupported colour type / depth combination, naming it", () => {
    // grayscale depth 8 (colourType 0, depth 8) is not one of the two
    // accepted shapes (grayscale depth 2, RGBA depth 8).
    const raw = Buffer.from([0x00, 0, 0]);
    expect(() => readShadesPng(buildPng(2, 1, 0, 8, raw))).toThrow(/colour type|depth/i);
  });

  it("refuses an interlaced PNG", () => {
    const buf = grayscaleDepth2Png();
    buf[28] = 1; // interlace method
    expect(() => readShadesPng(buf)).toThrow(/interlac/i);
  });

  it("refuses a truncated IDAT", () => {
    const buf = grayscaleDepth2Png();
    // Shrink the declared height so the truncation check has less to work
    // with is fragile; instead corrupt via a fresh short raw stream.
    const shortRaw = Buffer.from([0x00, 0x1b]); // missing row 1 entirely
    expect(() => readShadesPng(buildPng(4, 2, 0, 2, shortRaw))).toThrow(/truncated/i);
  });

  describe("corpus: independent-decoder pins", () => {
    // Read with PowerShell's System.Drawing (a decoder wholly independent of
    // this module) against the real files:
    //   Add-Type -AssemblyName System.Drawing
    //   $b = [System.Drawing.Bitmap]::FromFile("<path>")
    //   $b.GetPixel($x,$y)
    // johto.png (128x96, grayscale depth 2): (0,0)=255 (0,1)=170 (2)=85 (3)=0
    //   -- found via: (0,0) R=255; (9,0) R=170; (14,0) R=85; (11,0) R=0.
    // port.png (128x48, RGBA depth 8): (0,0)=255 (10,8)=170 (18,0)=85 (16,0)=0.
    // shade = 3 - round(gray/85): 255->0, 170->1, 85->2, 0->3.
    itWithGbcCorpus("johto.png (grayscale depth 2): pixels at all 4 measured gray levels decode to 3-round(gray/85)", () => {
      const img = readShadesPng(readFileSync(`${G}/gfx/tilesets/johto.png`));
      expect([img.width, img.height]).toEqual([128, 96]);
      expect(img.shades[0 * 128 + 0]).toBe(0); // gray 255
      expect(img.shades[0 * 128 + 9]).toBe(1); // gray 170
      expect(img.shades[0 * 128 + 14]).toBe(2); // gray 85
      expect(img.shades[0 * 128 + 11]).toBe(3); // gray 0
    });

    itWithGbcCorpus("port.png (RGBA depth 8): pixels at all 4 measured gray levels decode to 3-round(gray/85)", () => {
      const img = readShadesPng(readFileSync(`${G}/gfx/tilesets/port.png`));
      expect([img.width, img.height]).toEqual([128, 48]);
      expect(img.shades[0 * 128 + 0]).toBe(0); // gray 255
      expect(img.shades[8 * 128 + 10]).toBe(1); // gray 170
      expect(img.shades[0 * 128 + 18]).toBe(2); // gray 85
      expect(img.shades[0 * 128 + 16]).toBe(3); // gray 0
    });
  });
});
