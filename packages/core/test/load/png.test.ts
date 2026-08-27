import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { readIndexedPng } from "../../src/load/png.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const G = SUBJECT_ROOT;

/** Checksum over every decoded index. Sensitive to unfiltering, nibble order
 *  and row stride all at once, and -- unlike a range check -- impossible to
 *  satisfy by returning zeros. */
const sum = (a: Uint8Array) => a.reduce((t, v) => t + v, 0);

/** `Math.max(...a)` spreads 32,768 arguments and can blow the stack. */
const max = (a: Uint8Array) => { let m = 0; for (const v of a) if (v > m) m = v; return m; };

/** Minimal colour-type-3 PNG builder, for error paths that cannot be produced
 *  by mutating a real file. `raw` is the pre-deflate scanline data. */
function buildPng(width: number, height: number, depth: number, raw: Buffer): Buffer {
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
  ihdr[8] = depth; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("PLTE", Buffer.alloc(16 * 3)),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("readIndexedPng", () => {
  itWithCorpus("reads a depth-8 indexed PNG (primary/general tiles)", () => {
    const img = readIndexedPng(readFileSync(`${G}/data/tilesets/primary/general/tiles.png`));
    expect(img.width).toBe(128);
    expect(img.height).toBe(256);
    // Measured. `max <= 15` would pass against a decoder returning all zeros,
    // which is exactly what a broken unfilter produces.
    expect(sum(img.indices)).toBe(247736);
    expect(max(img.indices)).toBe(15);
    expect(new Set(img.indices).size).toBe(16);
    expect(img.indices.filter((v) => v === 0).length).toBe(5877);
    // Centre pixel, away from the transparent border.
    expect(img.indices[(128 * 256) / 2 + 64]).toBe(12);
    expect(img.palette).toHaveLength(16);
  });

  itWithCorpus("reads a depth-4 indexed PNG (secondary/petalburg tiles)", () => {
    const img = readIndexedPng(readFileSync(`${G}/data/tilesets/secondary/petalburg/tiles.png`));
    expect(img.width).toBe(128);
    expect(img.height).toBe(80);
    expect(img.indices).toHaveLength(128 * 80);
    expect(sum(img.indices)).toBe(59528);
    // This sheet uses 15 of the 16 slots -- index 8 appears nowhere. A decoder
    // with the nibbles the wrong way round would not reproduce that gap.
    expect([...new Set(img.indices)].sort((a, b) => a - b))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
    expect(img.indices.filter((v) => v === 0).length).toBe(2447);
  });

  itWithCorpus("reads a mon overworld sprite", () => {
    const img = readIndexedPng(readFileSync(`${G}/graphics/object_events/pics/pokemon/espeon.png`));
    expect([img.width, img.height]).toEqual([192, 32]);
    expect(sum(img.indices)).toBe(16844);
    // A sprite sheet is mostly transparent; that ratio is itself a signal.
    expect(img.indices.filter((v) => v === 0).length).toBe(4586);
    expect([...new Set(img.indices)].sort((a, b) => a - b))
      .toEqual([0, 6, 7, 8, 9, 10, 11, 12, 13, 15]);
  });

  itWithCorpus("puts the HIGH nibble first at depth 4", () => {
    // The likeliest decoder bug, and one no range check can see: swapped
    // nibbles stay within 0-15, produce a plausible image, and yield a tile
    // sheet nobody questions.
    //
    // This is the ONLY test that can catch it. A nibble swap leaves the index
    // sum at 59528, the zero count at 2447 and the distinct set unchanged --
    // measured, not assumed -- so every other assertion in this file is blind
    // to it. The two orders first diverge at index 64; the slice below is the
    // first run where the difference is legible.
    const img = readIndexedPng(readFileSync(`${G}/data/tilesets/secondary/petalburg/tiles.png`));
    expect([...img.indices.slice(150, 158)]).toEqual([6, 0, 0, 0, 6, 6, 6, 6]);
    // A low-nibble-first decoder gives [0, 6, 0, 0, 6, 6, 6, 6] here.
  });

  itWithCorpus("unfilters every filter type at depth 8", () => {
    // All three fixtures above use filter 0 on every scanline, so without this
    // the whole unfilter branch -- paeth included, roughly 40% of the module --
    // could be replaced with `dst[x] = v` and the suite would stay green.
    // wyrdeer uses all five: None x4, Sub x3, Up x10, Average x6, Paeth x9.
    const img = readIndexedPng(readFileSync(
      `${G}/graphics/object_events/pics/pokemon/followers/wyrdeer.png`));
    expect([img.width, img.height]).toEqual([192, 32]);
    expect(sum(img.indices)).toBe(14006);
    expect(img.indices.filter((v) => v === 0).length).toBe(3906);
    expect([...new Set(img.indices)].sort((a, b) => a - b))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14]);
  });

  itWithCorpus("unfilters every filter type at depth 4, where nibbles also apply", () => {
    // The combination that matters: filtering AND sub-byte packing together,
    // which is where bpp = 1 actually earns its keep.
    // Filters: None x3, Sub x3, Up x45, Average x3, Paeth x10.
    const img = readIndexedPng(readFileSync(`${G}/graphics/pokemon/abomasnow/front.png`));
    expect([img.width, img.height]).toEqual([64, 64]);
    expect(sum(img.indices)).toBe(12773);
    expect(img.indices.filter((v) => v === 0).length).toBe(1461);
    expect([...new Set(img.indices)].sort((a, b) => a - b))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  itWithCorpus("concatenates multiple IDAT chunks into one zlib stream", () => {
    // 8 of Task 10's own tile sheets are split across 2 IDAT chunks, and
    // nothing else here covers the concat path.
    const img = readIndexedPng(readFileSync(`${G}/data/tilesets/primary/frlg_general/tiles.png`));
    expect([img.width, img.height]).toEqual([128, 320]);
    expect(sum(img.indices)).toBe(285613);
    expect(img.indices.filter((v) => v === 0).length).toBe(5251);
  });

  it("refuses a truncated IDAT rather than zero-filling the last row", () => {
    // A stream short by a few bytes is the one truncation that stays silent:
    // the final row's filter byte still reads, `src[x]` comes back undefined,
    // and Buffer's setter coerces that to 0 -- so the last row turns black
    // rather than raising. Built here rather than mutated from a corpus file,
    // because the bytes must still inflate successfully to reach the bug.
    const width = 4, height = 3, bytesPerRow = 2; // depth 4
    const full = Buffer.alloc((bytesPerRow + 1) * height);
    for (let y = 0; y < height; y++) {
      full[y * (bytesPerRow + 1)] = 0;          // filter None
      full[y * (bytesPerRow + 1) + 1] = 0x12;
      full[y * (bytesPerRow + 1) + 2] = 0x34;
    }
    const short = full.subarray(0, full.length - 2); // lose the last row's pixels

    expect(() => readIndexedPng(buildPng(width, height, 4, short))).toThrow(/truncated/i);
    // The untruncated equivalent decodes, so this is about the truncation and
    // not about buildPng producing something unreadable.
    const ok = readIndexedPng(buildPng(width, height, 4, full));
    expect([...ok.indices]).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]);
  });

  itWithCorpus("throws a clear error on an unsupported colour type", () => {
    const truecolour = Buffer.from(readFileSync(`${G}/data/tilesets/primary/general/tiles.png`));
    truecolour[25] = 6; // colourType 6
    expect(() => readIndexedPng(truecolour)).toThrow(/colour type/i);
  });

  itWithCorpus("throws on an interlaced PNG rather than decoding it wrongly", () => {
    const interlaced = Buffer.from(readFileSync(`${G}/data/tilesets/primary/general/tiles.png`));
    interlaced[28] = 1;
    expect(() => readIndexedPng(interlaced)).toThrow(/interlac/i);
  });

  itWithCorpus("throws on an unsupported bit depth", () => {
    const deep = Buffer.from(readFileSync(`${G}/data/tilesets/primary/general/tiles.png`));
    deep[24] = 2;
    expect(() => readIndexedPng(deep)).toThrow(/bit depth/i);
  });
});
