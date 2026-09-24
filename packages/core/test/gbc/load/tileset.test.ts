import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { parseMetatiles, encodeMetatiles } from "../../../src/gbc/load/tileset.js";
import { parseIncbins } from "../../../src/gbc/load/incbin.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus, hasGbcProject, gbcCorpusRoots } from "../helpers/corpus.js";

function metatile(...tiles: number[]) {
  return { tiles };
}

describe("parseMetatiles / encodeMetatiles", () => {
  it("parses each 16-byte record as a metatile's row-major tile grid", () => {
    const buf = Buffer.concat([Buffer.alloc(16, 0x00), Buffer.alloc(16, 0x06)]);
    const ms = parseMetatiles(buf);
    expect(ms).toHaveLength(2);
    expect(ms[0]!.tiles).toEqual(new Array(16).fill(0x00));
    expect(ms[1]!.tiles).toEqual(new Array(16).fill(0x06));
  });

  it("refuses a buffer whose length is not a multiple of 16", () => {
    expect(() => parseMetatiles(Buffer.alloc(17))).toThrow(/17/);
  });

  it("accepts an empty buffer as zero metatiles", () => {
    expect(parseMetatiles(Buffer.alloc(0))).toEqual([]);
  });

  it("encodeMetatiles is the exact inverse of parseMetatiles", () => {
    const buf = Buffer.from([...Array(16).keys()].concat([...Array(16).keys()].reverse()));
    expect(encodeMetatiles(parseMetatiles(buf))).toEqual(buf);
  });

  it("refuses a metatile with 15 tiles (not 16)", () => {
    const bad = metatile(...new Array(15).fill(0));
    expect(() => encodeMetatiles([bad])).toThrow(/metatile 0/);
    expect(() => encodeMetatiles([bad])).toThrow(/15/);
  });

  it("refuses a metatile with 17 tiles (not 16)", () => {
    const bad = metatile(...new Array(17).fill(0));
    expect(() => encodeMetatiles([bad])).toThrow(/17/);
  });

  it("refuses a tile id outside 0-255 (does not truncate)", () => {
    const bad = metatile(...new Array(15).fill(0), 256);
    expect(() => encodeMetatiles([bad])).toThrow(/256/);
  });

  it("refuses a non-integer tile id", () => {
    const bad = metatile(...new Array(15).fill(0), 1.5);
    expect(() => encodeMetatiles([bad])).toThrow(/1\.5/);
  });

  describe("corpus", () => {
    let metatilesBinPaths: string[];
    beforeAll(() => {
      if (!hasGbcProject(GBC_SUBJECT_ROOT)) return;
      const tilesetsAsm = readFileSync(`${GBC_SUBJECT_ROOT}/gfx/tilesets.asm`, "utf8");
      metatilesBinPaths = [
        ...new Set(parseIncbins(tilesetsAsm).map((e) => e.path).filter((p) => p.endsWith("_metatiles.bin"))),
      ];
    });

    itWithGbcCorpus(
      // Findings doc claims 37; re-measured directly with a throwaway script
      // over the real gfx/tilesets.asm and it is 36 (Tileset0Meta and
      // TilesetDarkCaveMeta are stacked labels sharing Johto's/Cave's
      // metatiles.bin, not separate INCBINs -- 37 `tileset` table entries but
      // 36 distinct INCBIN paths). See implementer report for detail.
      //
      // Loops every configured gbc corpus root, not just the subject, so
      // vanilla pokecrystal auto-joins this round-trip once the user adds it
      // to gbc.referenceProjects. The 36-path count is subject-specific and
      // stays pinned only for GBC_SUBJECT_ROOT.
      "distinct *_metatiles.bin paths round-trip identically, across every gbc corpus root (36 on the subject)",
      () => {
        // A zero-length gbcCorpusRoots() would make this loop -- and its
        // in-loop 36 pin -- pass vacuously. Guard against that rather than
        // trust the loop ran.
        expect(gbcCorpusRoots()).toContain(GBC_SUBJECT_ROOT);
        const failures: string[] = [];
        for (const root of gbcCorpusRoots()) {
          const tilesetsAsm = readFileSync(`${root}/gfx/tilesets.asm`, "utf8");
          const paths = [
            ...new Set(parseIncbins(tilesetsAsm).map((e) => e.path).filter((p) => p.endsWith("_metatiles.bin"))),
          ];
          if (root === GBC_SUBJECT_ROOT) expect(paths).toHaveLength(36);
          for (const path of paths) {
            const buf = readFileSync(`${root}/${path}`);
            if (!encodeMetatiles(parseMetatiles(buf)).equals(buf)) failures.push(`${root}/${path}`);
          }
        }
        expect(failures).toEqual([]);
      },
    );

    itWithGbcCorpus("metatile counts: 128 for the 5 largest tilesets, 40 for forest, 64 for the rest", () => {
      const countsByPath = new Map<string, number>();
      for (const path of metatilesBinPaths) {
        countsByPath.set(path, parseMetatiles(readFileSync(`${GBC_SUBJECT_ROOT}/${path}`)).length);
      }
      const byCount = new Map<number, number>();
      for (const n of countsByPath.values()) byCount.set(n, (byCount.get(n) ?? 0) + 1);
      expect([...byCount.entries()].sort((a, b) => a[0] - b[0])).toEqual([
        [40, 1],
        [64, 30],
        [128, 5],
      ]);
      expect(countsByPath.get("data/tilesets/forest_metatiles.bin")).toBe(40);
      for (const p of [
        "data/tilesets/johto_metatiles.bin",
        "data/tilesets/johto_modern_metatiles.bin",
        "data/tilesets/kanto_metatiles.bin",
        "data/tilesets/battle_tower_outside_metatiles.bin",
        "data/tilesets/unused_johto_metatiles.bin",
      ]) {
        expect(countsByPath.get(p)).toBe(128);
      }
    });

    itWithGbcCorpus("johto_metatiles.bin's first 3 metatiles are all-0x00, all-0x06, all-0x05", () => {
      const buf = readFileSync(`${GBC_SUBJECT_ROOT}/data/tilesets/johto_metatiles.bin`);
      const ms = parseMetatiles(buf);
      expect(ms[0]!.tiles).toEqual(new Array(16).fill(0x00));
      expect(ms[1]!.tiles).toEqual(new Array(16).fill(0x06));
      expect(ms[2]!.tiles).toEqual(new Array(16).fill(0x05));
    });
  });
});
