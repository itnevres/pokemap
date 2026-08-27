import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readIndexedPng } from "../../src/load/png.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const G = SUBJECT_ROOT;

/** Checksum over every decoded index. Sensitive to unfiltering, nibble order
 *  and row stride all at once, and -- unlike a range check -- impossible to
 *  satisfy by returning zeros. */
const sum = (a: Uint8Array) => a.reduce((t, v) => t + v, 0);

/** `Math.max(...a)` spreads 32,768 arguments and can blow the stack. */
const max = (a: Uint8Array) => { let m = 0; for (const v of a) if (v > m) m = v; return m; };

describe("readIndexedPng", () => {
  itWithCorpus("reads a depth-8 indexed PNG (primary/general tiles)", () => {
    const img = readIndexedPng(readFileSync(`${G}/data/tilesets/primary/general/tiles.png`));
    expect(img.width).toBe(128);
    expect(img.height).toBe(256);
    expect(img.indices).toHaveLength(128 * 256);
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
    // sheet nobody questions. Index 150 is the first position where the two
    // halves of a byte differ, so this pair distinguishes the orders.
    const img = readIndexedPng(readFileSync(`${G}/data/tilesets/secondary/petalburg/tiles.png`));
    expect([...img.indices.slice(150, 158)]).toEqual([6, 0, 0, 0, 6, 6, 6, 6]);
    // A low-nibble-first decoder would give [0, 6, 0, 0, 6, 6, 6, 6] here.
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
