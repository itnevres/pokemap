import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { parseIncbins, parseIncludes } from "../../../src/gbc/load/incbin.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus, hasGbcProject } from "../helpers/corpus.js";

describe("parseIncbins", () => {
  it("returns the path and preceding label for a single label", () => {
    const text = [
      'SECTION "Map Blocks 1", ROMX',
      "",
      "Route32_Blocks:",
      '\tINCBIN "maps/Route32.blk"',
      "",
    ].join("\n");
    expect(parseIncbins(text)).toEqual([{ labels: ["Route32_Blocks"], path: "maps/Route32.blk" }]);
  });

  it("attaches every stacked label to the one INCBIN that follows them", () => {
    const text = [
      "GoldenrodDeptStore1F_Blocks:",
      "CeladonDeptStore1F_Blocks:",
      '\tINCBIN "maps/DeptStore1F.blk"',
    ].join("\n");
    expect(parseIncbins(text)).toEqual([
      { labels: ["GoldenrodDeptStore1F_Blocks", "CeladonDeptStore1F_Blocks"], path: "maps/DeptStore1F.blk" },
    ]);
  });

  it("keeps a trailing '; unreferenced' comment on the label line from breaking the label match", () => {
    const text = ["BetaPlayersHouse2F_Blocks: ; unreferenced", '\tINCBIN "maps/unused/BetaPlayersHouse2F.blk"'].join("\n");
    expect(parseIncbins(text)).toEqual([
      { labels: ["BetaPlayersHouse2F_Blocks"], path: "maps/unused/BetaPlayersHouse2F.blk" },
    ]);
  });

  it("accepts a double-colon label with no comment (gfx/tilesets.asm style)", () => {
    const text = ["TilesetKantoMeta::", '\tINCBIN "data/tilesets/kanto_metatiles.bin"'].join("\n");
    expect(parseIncbins(text)).toEqual([{ labels: ["TilesetKantoMeta"], path: "data/tilesets/kanto_metatiles.bin" }]);
  });

  it("accepts a final line with no trailing newline", () => {
    const text = 'Foo_Blocks:\n\tINCBIN "maps/Foo.blk"';
    expect(parseIncbins(text)).toEqual([{ labels: ["Foo_Blocks"], path: "maps/Foo.blk" }]);
  });

  it("keeps a label across a blank line before its INCBIN (never occurs in the corpus, but a blank line must stay inert)", () => {
    const text = ["Foo_Blocks:", "", '\tINCBIN "maps/Foo.blk"'].join("\n");
    expect(parseIncbins(text)).toEqual([{ labels: ["Foo_Blocks"], path: "maps/Foo.blk" }]);
  });

  it("resets the pending label list when a non-label, non-blank line intervenes", () => {
    const text = ["Foo_Blocks:", "; a stray comment", '\tINCBIN "maps/Foo.blk"'].join("\n");
    expect(parseIncbins(text)).toEqual([{ labels: [], path: "maps/Foo.blk" }]);
  });

  it("does not match INCLUDE lines", () => {
    const text = ["TilesetKantoColl::", '\tINCLUDE "data/tilesets/kanto_collision.asm"'].join("\n");
    expect(parseIncbins(text)).toEqual([]);
  });

  it("tolerates CRLF line endings", () => {
    const text = 'Foo_Blocks:\r\n\tINCBIN "maps/Foo.blk"\r\n';
    expect(parseIncbins(text)).toEqual([{ labels: ["Foo_Blocks"], path: "maps/Foo.blk" }]);
  });

  describe("corpus", () => {
    let blocksAsm: string;
    let tilesetsAsm: string;
    beforeAll(() => {
      if (!hasGbcProject(GBC_SUBJECT_ROOT)) return;
      blocksAsm = readFileSync(`${GBC_SUBJECT_ROOT}/data/maps/blocks.asm`, "utf8");
      tilesetsAsm = readFileSync(`${GBC_SUBJECT_ROOT}/gfx/tilesets.asm`, "utf8");
    });

    itWithGbcCorpus("data/maps/blocks.asm: 305 INCBINs, 439 labels total, 305 distinct paths", () => {
      const entries = parseIncbins(blocksAsm);
      expect(entries).toHaveLength(305);
      expect(entries.reduce((n, e) => n + e.labels.length, 0)).toBe(439);
      expect(new Set(entries.map((e) => e.path)).size).toBe(305);
    });

    itWithGbcCorpus("maps/House1.blk's INCBIN carries 50 labels (measured, not assumed)", () => {
      const entry = parseIncbins(blocksAsm).find((e) => e.path === "maps/House1.blk");
      expect(entry?.labels).toHaveLength(50);
    });

    itWithGbcCorpus("gfx/tilesets.asm: 36 distinct *_metatiles.bin INCBIN paths", () => {
      const entries = parseIncbins(tilesetsAsm).filter((e) => e.path.endsWith("_metatiles.bin"));
      expect(new Set(entries.map((e) => e.path)).size).toBe(36);
      expect(entries).toHaveLength(36);
    });

    itWithGbcCorpus("gfx/tilesets.asm: TilesetJohtoColl stacks with Tileset0Coll onto johto_collision.asm", () => {
      const entry = parseIncludes(tilesetsAsm).find((e) => e.path === "data/tilesets/johto_collision.asm");
      expect(entry?.labels).toContain("TilesetJohtoColl");
      expect(entry?.labels).toContain("Tileset0Coll");
    });
  });
});

describe("parseIncludes", () => {
  it("returns the path and preceding label for a single label", () => {
    const text = ["TilesetKantoColl::", '\tINCLUDE "data/tilesets/kanto_collision.asm"'].join("\n");
    expect(parseIncludes(text)).toEqual([{ labels: ["TilesetKantoColl"], path: "data/tilesets/kanto_collision.asm" }]);
  });

  it("attaches every stacked label to the one INCLUDE that follows them", () => {
    const text = [
      "TilesetCavePalMap:",
      "TilesetDarkCavePalMap:",
      '\tINCLUDE "gfx/tilesets/cave_palette_map.asm"',
    ].join("\n");
    expect(parseIncludes(text)).toEqual([
      { labels: ["TilesetCavePalMap", "TilesetDarkCavePalMap"], path: "gfx/tilesets/cave_palette_map.asm" },
    ]);
  });

  it("does not match INCBIN lines", () => {
    const text = ["TilesetKantoGFX::", '\tINCBIN "gfx/tilesets/kanto.2bpp.lz"'].join("\n");
    expect(parseIncludes(text)).toEqual([]);
  });

  it("accepts a final line with no trailing newline", () => {
    const text = 'Foo:\n\tINCLUDE "foo.asm"';
    expect(parseIncludes(text)).toEqual([{ labels: ["Foo"], path: "foo.asm" }]);
  });

  it("tolerates CRLF line endings", () => {
    const text = 'Foo:\r\n\tINCLUDE "foo.asm"\r\n';
    expect(parseIncludes(text)).toEqual([{ labels: ["Foo"], path: "foo.asm" }]);
  });
});
