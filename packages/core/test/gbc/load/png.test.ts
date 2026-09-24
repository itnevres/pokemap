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
