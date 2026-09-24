import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { parseBlk, encodeBlk } from "../../../src/gbc/load/blocks.js";
import { parseIncbins } from "../../../src/gbc/load/incbin.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus, hasGbcProject } from "../helpers/corpus.js";

describe("parseBlk / encodeBlk", () => {
  it("parses each byte as a block's metatileId, row-major", () => {
    const buf = Buffer.from([0x05, 0x18, 0x1f]);
    expect(parseBlk(buf)).toEqual([{ metatileId: 0x05 }, { metatileId: 0x18 }, { metatileId: 0x1f }]);
  });

  it("parses an empty buffer to an empty array", () => {
    expect(parseBlk(Buffer.alloc(0))).toEqual([]);
  });

  it("encodeBlk is the exact inverse of parseBlk", () => {
    const buf = Buffer.from([0x05, 0x05, 0x18, 0x1f, 0x19, 0x47]);
    expect(encodeBlk(parseBlk(buf))).toEqual(buf);
  });

  it("encodeBlk refuses metatileId 256 (does not truncate to 0)", () => {
    expect(() => encodeBlk([{ metatileId: 256 }])).toThrow(/block 0/);
    expect(() => encodeBlk([{ metatileId: 256 }])).toThrow(/256/);
  });

  it("encodeBlk refuses a negative metatileId", () => {
    expect(() => encodeBlk([{ metatileId: -1 }])).toThrow(/-1/);
  });

  it("encodeBlk refuses a non-integer metatileId (does not floor/round it)", () => {
    expect(() => encodeBlk([{ metatileId: 1.5 }])).toThrow(/1\.5/);
  });

  it("encodeBlk accepts the widest legal values, 0 and 255", () => {
    expect(encodeBlk([{ metatileId: 0 }, { metatileId: 255 }])).toEqual(Buffer.from([0, 255]));
  });

  describe("corpus", () => {
    let allBlkPaths: string[];
    beforeAll(() => {
      if (!hasGbcProject(GBC_SUBJECT_ROOT)) return;
      const blocksAsm = readFileSync(`${GBC_SUBJECT_ROOT}/data/maps/blocks.asm`, "utf8");
      allBlkPaths = [...new Set(parseIncbins(blocksAsm).map((e) => e.path))];
    });

    itWithGbcCorpus("maps/NewBarkTown.blk is 90 bytes; first 20 metatile ids match the real file", () => {
      const buf = readFileSync(`${GBC_SUBJECT_ROOT}/${allBlkPaths.find((p) => p === "maps/NewBarkTown.blk")}`);
      expect(buf).toHaveLength(90);
      const blocks = parseBlk(buf);
      expect(blocks.slice(0, 20).map((b) => b.metatileId)).toEqual([
        0x05, 0x05, 0x18, 0x1f, 0x19, 0x05, 0x05, 0x05, 0x05, 0x05,
        0x05, 0x47, 0x1c, 0x77, 0x1e, 0x05, 0x18, 0x19, 0x05, 0x05,
      ]);
    });

    itWithGbcCorpus("maps/CeruleanCave2F.blk and CeruleanCaveB1.blk are 400 bytes and round-trip whole", () => {
      for (const name of ["maps/CeruleanCave2F.blk", "maps/CeruleanCaveB1.blk"]) {
        const buf = readFileSync(`${GBC_SUBJECT_ROOT}/${name}`);
        expect(buf).toHaveLength(400);
        expect(encodeBlk(parseBlk(buf))).toEqual(buf);
      }
    });

    itWithGbcCorpus("every .blk INCBIN path (all 305) round-trips byte-identically", () => {
      expect(allBlkPaths).toHaveLength(305);
      const failures: string[] = [];
      for (const path of allBlkPaths) {
        const buf = readFileSync(`${GBC_SUBJECT_ROOT}/${path}`);
        if (!encodeBlk(parseBlk(buf)).equals(buf)) failures.push(path);
      }
      expect(failures).toEqual([]);
    });
  });
});
