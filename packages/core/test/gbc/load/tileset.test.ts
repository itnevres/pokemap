import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import {
  parseMetatiles,
  encodeMetatiles,
  parseConstDefs,
  parseTilesetsTable,
  parsePaletteMap,
  parseCollisionConstants,
  parseCollision,
  loadGbcTileset,
  loadGbcTilesetByName,
  pngTileIndex,
} from "../../../src/gbc/load/tileset.js";
import { parseIncbins } from "../../../src/gbc/load/incbin.js";
import { loadGbcMaps, loadLayout } from "../../../src/gbc/load/map.js";
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

describe("parseConstDefs", () => {
  it("assigns sequential values starting at const_def's argument", () => {
    const text = ["\tconst_def 1", "\tconst FOO ; 01", "\tconst BAR ; 02"].join("\n");
    expect(parseConstDefs(text)).toEqual(new Map([["FOO", 1], ["BAR", 2]]));
  });

  it("defaults to 0 when const_def has no argument", () => {
    const text = ["\tconst_def", "\tconst FOO", "\tconst BAR"].join("\n");
    expect(parseConstDefs(text)).toEqual(new Map([["FOO", 0], ["BAR", 1]]));
  });

  it("resets the counter at each const_def, across multiple enums in one file", () => {
    const text = ["\tconst_def 1", "\tconst FOO", "\tconst_def", "\tconst BAR"].join("\n");
    expect(parseConstDefs(text)).toEqual(new Map([["FOO", 1], ["BAR", 0]]));
  });

  describe("corpus", () => {
    itWithGbcCorpus("constants/tileset_constants.asm: TILESET_JOHTO=1 .. TILESET_AERODACTYL_WORD_ROOM=36, PAL_BG_GRAY=0..PAL_BG_TEXT=7", () => {
      const consts = parseConstDefs(readFileSync(`${GBC_SUBJECT_ROOT}/constants/tileset_constants.asm`, "utf8"));
      expect(consts.get("TILESET_JOHTO")).toBe(1);
      expect(consts.get("TILESET_AERODACTYL_WORD_ROOM")).toBe(36);
      expect(consts.get("PAL_BG_GRAY")).toBe(0);
      expect(consts.get("PAL_BG_TEXT")).toBe(7);
    });
  });
});

describe("parseTilesetsTable", () => {
  it("returns tileset names in table order", () => {
    const text = ["Tilesets::", "\ttileset Tileset0", "\ttileset TilesetJohto"].join("\n");
    expect(parseTilesetsTable(text)).toEqual(["Tileset0", "TilesetJohto"]);
  });

  describe("corpus", () => {
    itWithGbcCorpus("data/tilesets.asm: 37 tileset entries, index 0 is Tileset0, index 1 is TilesetJohto", () => {
      const table = parseTilesetsTable(readFileSync(`${GBC_SUBJECT_ROOT}/data/tilesets.asm`, "utf8"));
      expect(table).toHaveLength(37);
      expect(table[0]).toBe("Tileset0");
      expect(table[1]).toBe("TilesetJohto");
    });
  });
});

describe("parsePaletteMap", () => {
  const palBg = new Map([
    ["PAL_BG_GRAY", 0],
    ["PAL_BG_RED", 1],
    ["PAL_BG_GREEN", 2],
    ["PAL_BG_BROWN", 5],
  ]);
  const grayLine = ["GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY"];

  function tilepalLine(bank: number, names: string[]): string {
    return `\ttilepal ${bank}, ${names.join(", ")}`;
  }

  function fullShape(firstLowLine: string[]): string {
    const low = [firstLowLine, ...Array.from({ length: 11 }, () => grayLine)];
    const high = Array.from({ length: 12 }, () => grayLine);
    return [
      ...low.map((names) => tilepalLine(0, names)),
      "rept 16",
      "\tdb $ff",
      "endr",
      ...high.map((names) => tilepalLine(1, names)),
    ].join("\n");
  }

  it("maps each tilepal name, in source order, to the matching tile id (johto tiles 0-7 shape)", () => {
    const entries = parsePaletteMap(
      fullShape(["GRAY", "BROWN", "BROWN", "RED", "GREEN", "GREEN", "GRAY", "RED"]),
      palBg,
    );
    expect(entries).toHaveLength(224);
    expect(entries.slice(0, 8)).toEqual([
      { bank: 0, pal: 0 },
      { bank: 0, pal: 5 },
      { bank: 0, pal: 5 },
      { bank: 0, pal: 1 },
      { bank: 0, pal: 2 },
      { bank: 0, pal: 2 },
      { bank: 0, pal: 0 },
      { bank: 0, pal: 1 },
    ]);
  });

  it("marks tiles 0x60-0x7F (the rept-16 filler) as null, and leaves 0x5F/0x80 non-null", () => {
    const entries = parsePaletteMap(fullShape(grayLine), palBg);
    expect(entries.slice(0x60, 0x80)).toEqual(new Array(32).fill(null));
    expect(entries[0x5f]).not.toBeNull();
    expect(entries[0x80]).not.toBeNull();
  });

  it("gives bank 1 to every tile in the high tilepal block", () => {
    const entries = parsePaletteMap(fullShape(grayLine), palBg);
    expect(entries[0x80]).toEqual({ bank: 1, pal: 0 });
  });

  it("refuses a tilepal line with the wrong number of names", () => {
    expect(() => parsePaletteMap("\ttilepal 0, GRAY, GRAY", palBg)).toThrow(/8/);
  });

  it("refuses an unknown PAL_BG name", () => {
    expect(() =>
      parsePaletteMap("\ttilepal 0, GRAY, GRAY, GRAY, GRAY, GRAY, GRAY, GRAY, PURPLE", palBg),
    ).toThrow(/PURPLE/);
  });

  it("refuses a shape that doesn't total 224 tile entries", () => {
    const text = Array.from({ length: 5 }, () => tilepalLine(0, grayLine)).join("\n");
    expect(() => parsePaletteMap(text, palBg)).toThrow(/224/);
  });

  it("refuses an unrecognized line", () => {
    expect(() => parsePaletteMap("\tsomething weird", palBg)).toThrow(/tilepal/i);
  });

  // Spec review cases (task-5-spec-review.md Issue 1): each was silently
  // *accepted* by the old "total 224 + unrecognized line" check, producing
  // wrong pngTileIndex results. The strict 12/rept-16/12 phase machine must
  // refuse all of them, naming the file (`source`) and 1-based line number.
  describe("spec-review Issue 1: exact structure enforcement", () => {
    it("case A: tilepal bank=1 in the bank-0 (first 12-line) block is refused", () => {
      const text = [
        ...Array.from({ length: 12 }, () => tilepalLine(1, grayLine)), // should be bank 0
        "rept 16",
        "\tdb $ff",
        "endr",
        ...Array.from({ length: 12 }, () => tilepalLine(1, grayLine)),
      ].join("\n");
      expect(() => parsePaletteMap(text, palBg, "bad.asm")).toThrow(/bad\.asm:1:/);
      expect(() => parsePaletteMap(text, palBg, "bad.asm")).toThrow(/bank/i);
    });

    it("case B: 13 bank-0 lines + rept 12 + 12 bank-1 lines is refused (extra tilepal before the filler)", () => {
      const text = [
        ...Array.from({ length: 13 }, () => tilepalLine(0, grayLine)),
        "rept 12",
        "\tdb $ff",
        "endr",
        ...Array.from({ length: 12 }, () => tilepalLine(1, grayLine)),
      ].join("\n");
      expect(() => parsePaletteMap(text, palBg, "bad.asm")).toThrow(/rept 16/);
    });

    it("case F: tilepal bank=2 (overflows the real nibble) is refused, not treated as truthy bank 1", () => {
      const text = [
        tilepalLine(2, grayLine),
        ...Array.from({ length: 11 }, () => tilepalLine(0, grayLine)),
        "rept 16",
        "\tdb $ff",
        "endr",
        ...Array.from({ length: 12 }, () => tilepalLine(1, grayLine)),
      ].join("\n");
      expect(() => parsePaletteMap(text, palBg, "bad.asm")).toThrow(/bank/i);
    });

    it("case G: rept-16 filler first, then 24 tilepal lines, is refused", () => {
      const text = [
        "rept 16",
        "\tdb $ff",
        "endr",
        ...Array.from({ length: 12 }, () => tilepalLine(0, grayLine)),
        ...Array.from({ length: 12 }, () => tilepalLine(1, grayLine)),
      ].join("\n");
      expect(() => parsePaletteMap(text, palBg, "bad.asm")).toThrow(/tilepal/i);
    });
  });

  describe("corpus", () => {
    itWithGbcCorpus("johto_palette_map.asm parses to 224 entries with the real tile 0-7 line", () => {
      const constants = parseConstDefs(readFileSync(`${GBC_SUBJECT_ROOT}/constants/tileset_constants.asm`, "utf8"));
      const text = readFileSync(`${GBC_SUBJECT_ROOT}/gfx/tilesets/johto_palette_map.asm`, "utf8");
      const entries = parsePaletteMap(text, constants);
      expect(entries).toHaveLength(224);
      const names = ["GRAY", "BROWN", "BROWN", "RED", "GREEN", "GREEN", "GRAY", "RED"];
      expect(entries.slice(0, 8)).toEqual(names.map((n) => ({ bank: 0, pal: constants.get(`PAL_BG_${n}`) })));
    });
  });
});

describe("parseCollisionConstants", () => {
  it("parses DEF COLL_<NAME> EQU $xx lines, including raw hex-suffix names", () => {
    const text = ["DEF COLL_FLOOR EQU $00", "DEF COLL_01 EQU $01 ; garbage", "DEF COLL_WALL EQU $07"].join("\n");
    expect(parseCollisionConstants(text)).toEqual(new Map([["COLL_FLOOR", 0], ["COLL_01", 1], ["COLL_WALL", 7]]));
  });

  describe("corpus", () => {
    itWithGbcCorpus("constants/collision_constants.asm: COLL_FLOOR=0, COLL_WALL=7, COLL_WARP_CARPET_DOWN=0x70", () => {
      const consts = parseCollisionConstants(readFileSync(`${GBC_SUBJECT_ROOT}/constants/collision_constants.asm`, "utf8"));
      expect(consts.get("COLL_FLOOR")).toBe(0);
      expect(consts.get("COLL_WALL")).toBe(7);
      expect(consts.get("COLL_WARP_CARPET_DOWN")).toBe(0x70);
    });
  });
});

describe("parseCollision", () => {
  const consts = new Map([["COLL_FLOOR", 0], ["COLL_WALL", 7], ["COLL_01", 1]]);

  it("parses tilecoll TL,TR,BL,BR in that order", () => {
    const text = "\ttilecoll FLOOR, FLOOR, WALL, 01 ; 00";
    expect(parseCollision(text, consts)).toEqual([{ tl: 0, tr: 0, bl: 7, br: 1 }]);
  });

  it("refuses an unknown collision token", () => {
    expect(() => parseCollision("\ttilecoll FLOOR, FLOOR, FLOOR, NOPE", consts)).toThrow(/NOPE/);
  });

  describe("corpus", () => {
    itWithGbcCorpus("johto_collision.asm metatile 0x0c is FLOOR,FLOOR,WALL,WARP_CARPET_DOWN", () => {
      const collConsts = parseCollisionConstants(readFileSync(`${GBC_SUBJECT_ROOT}/constants/collision_constants.asm`, "utf8"));
      const text = readFileSync(`${GBC_SUBJECT_ROOT}/data/tilesets/johto_collision.asm`, "utf8");
      const collision = parseCollision(text, collConsts);
      expect(collision[0x0c]).toEqual({
        tl: collConsts.get("COLL_FLOOR"),
        tr: collConsts.get("COLL_FLOOR"),
        bl: collConsts.get("COLL_WALL"),
        br: collConsts.get("COLL_WARP_CARPET_DOWN"),
      });
    });
  });
});

describe("pngTileIndex", () => {
  function tilesetStub(overrides: { palMap: (null | { bank: number; pal: number })[]; tileCount: number }) {
    return { palMap: overrides.palMap, tiles: new Array(overrides.tileCount).fill(new Uint8Array(64)) } as Parameters<
      typeof pngTileIndex
    >[0];
  }

  it("bank 0: pngTileIndex(t) === t", () => {
    const palMap = new Array(224).fill(null);
    palMap[0] = { bank: 0, pal: 0 };
    palMap[0x5f] = { bank: 0, pal: 0 };
    const ts = tilesetStub({ palMap, tileCount: 0x60 });
    expect(pngTileIndex(ts, 0)).toBe(0);
    expect(pngTileIndex(ts, 0x5f)).toBe(0x5f);
  });

  it("bank 1: pngTileIndex(t) === 0x60 + (t & 0x7F)", () => {
    const palMap = new Array(224).fill(null);
    palMap[0x80] = { bank: 1, pal: 0 };
    const ts = tilesetStub({ palMap, tileCount: 0x61 });
    expect(pngTileIndex(ts, 0x80)).toBe(0x60);
  });

  it("returns null for a tile id with no palette-map entry ($60-$7F filler)", () => {
    const palMap = new Array(224).fill(null);
    const ts = tilesetStub({ palMap, tileCount: 200 });
    expect(pngTileIndex(ts, 0x60)).toBeNull();
  });

  it("returns null for a tile id beyond the 224-entry palette map", () => {
    const palMap = new Array(224).fill(null);
    const ts = tilesetStub({ palMap, tileCount: 200 });
    expect(pngTileIndex(ts, 250)).toBeNull();
  });

  it("returns null when the resolved PNG index is beyond the tileset's own tile count", () => {
    const palMap = new Array(224).fill(null);
    palMap[0x5f] = { bank: 0, pal: 0 };
    const ts = tilesetStub({ palMap, tileCount: 1 }); // only PNG tile 0 exists
    expect(pngTileIndex(ts, 0x5f)).toBeNull();
  });

  it("returns null when (tileId & 0x7F) >= 0x60, even if the palMap entry is non-null (spec review Issue 1: findings' rule is valid only below 0x60)", () => {
    const palMap = new Array(224).fill(null);
    palMap[0x65] = { bank: 0, pal: 0 }; // never happens with a well-formed palette map, but guard directly
    const ts = tilesetStub({ palMap, tileCount: 256 });
    expect(pngTileIndex(ts, 0x65)).toBeNull();
  });
});

describe("loadGbcTileset / loadGbcTilesetByName (synthetic fixture)", () => {
  function buildMiniPng(width: number, height: number, colourType: number, depth: number, raw: Buffer): Buffer {
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
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const c = Buffer.alloc(4);
      c.writeUInt32BE(crc(body));
      return Buffer.concat([len, body, c]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = depth;
    ihdr[9] = colourType;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }

  /** 8x8, grayscale depth 2, every pixel gray level 0, filter None. */
  function tinyGrayscalePng(): Buffer {
    const rows: number[] = [];
    for (let y = 0; y < 8; y++) rows.push(0, 0, 0); // filter None, 2 bytes/row (8*2/8=2)
    return buildMiniPng(8, 8, 0, 2, Buffer.from(rows));
  }

  /** width x 8, grayscale depth 2, gray level 0 everywhere, filter None -- for a width that isn't a multiple of 8 (code-quality review Issue I1). */
  function oddWidthGrayscalePng(width: number): Buffer {
    const bytesPerRow = Math.ceil((width * 2) / 8);
    const rows: number[] = [];
    for (let y = 0; y < 8; y++) rows.push(0, ...new Array(bytesPerRow).fill(0));
    return buildMiniPng(width, 8, 0, 2, Buffer.from(rows));
  }

  const grayLine8 = ["GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY", "GRAY"];

  function writeFixture(dir: string, opts: { metatileCount: number; collisionLines: number; withColl?: boolean }) {
    mkdirSync(join(dir, "constants"), { recursive: true });
    mkdirSync(join(dir, "data", "tilesets"), { recursive: true });
    mkdirSync(join(dir, "gfx", "tilesets"), { recursive: true });

    writeFileSync(
      join(dir, "constants", "tileset_constants.asm"),
      ["\tconst_def 1", "\tconst TILESET_TINY", "\tconst_def", "\tconst PAL_BG_GRAY"].join("\n"),
    );

    writeFileSync(
      join(dir, "data", "tilesets.asm"),
      ["Tilesets::", "\ttileset TilesetPlaceholder0", "\ttileset TilesetTiny"].join("\n"),
    );

    const gfxLines = [
      "TilesetPlaceholder0GFX::",
      "TilesetTinyGFX::",
      'INCBIN "gfx/tilesets/tiny.2bpp.lz"',
      "",
      "TilesetPlaceholder0Meta::",
      "TilesetTinyMeta::",
      'INCBIN "data/tilesets/tiny_metatiles.bin"',
      "",
    ];
    if (opts.withColl !== false) {
      gfxLines.push("TilesetPlaceholder0Coll::", "TilesetTinyColl::", 'INCLUDE "data/tilesets/tiny_collision.asm"');
    }
    writeFileSync(join(dir, "gfx", "tilesets.asm"), gfxLines.join("\n"));

    writeFileSync(
      join(dir, "gfx", "tileset_palette_maps.asm"),
      ["TilesetPlaceholder0PalMap:", "TilesetTinyPalMap:", 'INCLUDE "gfx/tilesets/tiny_palette_map.asm"'].join("\n"),
    );

    writeFileSync(
      join(dir, "constants", "collision_constants.asm"),
      ["DEF COLL_FLOOR EQU $00", "DEF COLL_WALL EQU $07"].join("\n"),
    );

    const collLines = Array.from({ length: opts.collisionLines }, () => "\ttilecoll FLOOR, FLOOR, FLOOR, WALL");
    writeFileSync(join(dir, "data", "tilesets", "tiny_collision.asm"), collLines.join("\n"));

    const palLines = [
      ...Array.from({ length: 12 }, () => `\ttilepal 0, ${grayLine8.join(", ")}`),
      "rept 16",
      "\tdb $ff",
      "endr",
      ...Array.from({ length: 12 }, () => `\ttilepal 1, ${grayLine8.join(", ")}`),
    ];
    writeFileSync(join(dir, "gfx", "tilesets", "tiny_palette_map.asm"), palLines.join("\n"));

    writeFileSync(join(dir, "data", "tilesets", "tiny_metatiles.bin"), Buffer.alloc(16 * opts.metatileCount, 0));
    writeFileSync(join(dir, "gfx", "tilesets", "tiny.png"), tinyGrayscalePng());
  }

  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "pokemap-gbc-tileset-"));
    writeFixture(root, { metatileCount: 1, collisionLines: 1 });
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("loads by TILESET_ constant, resolving GFX/Meta/Coll/PalMap through stacked labels", () => {
    const ts = loadGbcTileset(root, "TILESET_TINY");
    expect(ts.name).toBe("TilesetTiny");
    expect(ts.gfxPath).toBe("gfx/tilesets/tiny.png");
    expect(ts.metatilesPath).toBe("data/tilesets/tiny_metatiles.bin");
    expect(ts.collisionPath).toBe("data/tilesets/tiny_collision.asm");
    expect(ts.palMapPath).toBe("gfx/tilesets/tiny_palette_map.asm");
    expect(ts.metatiles).toHaveLength(1);
    expect(ts.collision).toEqual([{ tl: 0, tr: 0, bl: 0, br: 7 }]);
    expect(ts.palMap).toHaveLength(224);
    expect(ts.tiles).toHaveLength(1);
    expect(ts.tiles[0]).toHaveLength(64);
  });

  it("loads a table entry with no matching TILESET_ constant, by name directly (mirrors Tileset0/Johto aliasing)", () => {
    const ts = loadGbcTilesetByName(root, "TilesetPlaceholder0");
    expect(ts.name).toBe("TilesetPlaceholder0");
    expect(ts.gfxPath).toBe("gfx/tilesets/tiny.png");
  });

  it("refuses an unknown TILESET_ constant", () => {
    expect(() => loadGbcTileset(root, "TILESET_NOPE")).toThrow(/TILESET_NOPE/);
  });

  it("refuses a constant that isn't TILESET_* (spec review Issue 2: PAL_BG_* shares the same enum-parser map, but must never be accepted here)", () => {
    // The fixture's tileset_constants.asm defines PAL_BG_GRAY at index 0,
    // which happens to equal TilesetPlaceholder0's table index -- exactly
    // the silent-wrong-answer scenario the reviewer found (PAL_BG_RED ->
    // TilesetJohto on the real corpus).
    expect(() => loadGbcTileset(root, "PAL_BG_GRAY")).toThrow(/PAL_BG_GRAY/);
  });

  it("refuses when the resolved name has no matching GFX/Meta/Coll label", () => {
    const noCollRoot = mkdtempSync(join(tmpdir(), "pokemap-gbc-tileset-nocoll-"));
    writeFixture(noCollRoot, { metatileCount: 1, collisionLines: 1, withColl: false });
    expect(() => loadGbcTileset(noCollRoot, "TILESET_TINY")).toThrow(/TilesetTinyColl/);
    rmSync(noCollRoot, { recursive: true, force: true });
  });

  it("refuses when collision has fewer entries than metatiles", () => {
    const shortRoot = mkdtempSync(join(tmpdir(), "pokemap-gbc-tileset-short-"));
    writeFixture(shortRoot, { metatileCount: 2, collisionLines: 1 });
    expect(() => loadGbcTileset(shortRoot, "TILESET_TINY")).toThrow(/collision/i);
    rmSync(shortRoot, { recursive: true, force: true });
  });

  it("trims extra collision lines beyond the metatile count rather than exposing or refusing them (forest-style)", () => {
    const extraRoot = mkdtempSync(join(tmpdir(), "pokemap-gbc-tileset-extra-"));
    writeFixture(extraRoot, { metatileCount: 1, collisionLines: 3 });
    const ts = loadGbcTileset(extraRoot, "TILESET_TINY");
    expect(ts.collision).toHaveLength(1);
    rmSync(extraRoot, { recursive: true, force: true });
  });

  it("wraps a PNG decode error with gfxPath (spec review note: a corpus-level failure must say which PNG)", () => {
    const badPngRoot = mkdtempSync(join(tmpdir(), "pokemap-gbc-tileset-badpng-"));
    writeFixture(badPngRoot, { metatileCount: 1, collisionLines: 1 });
    // Corrupt the PNG signature so readShadesPng throws "not a PNG" --
    // any readShadesPng refusal exercises the same wrapping path.
    writeFileSync(join(badPngRoot, "gfx", "tilesets", "tiny.png"), Buffer.from([0, 1, 2, 3]));
    expect(() => loadGbcTileset(badPngRoot, "TILESET_TINY")).toThrow(/gfx\/tilesets\/tiny\.png/);
    rmSync(badPngRoot, { recursive: true, force: true });
  });

  it("refuses a PNG whose dimensions aren't a multiple of 8, naming width/height and the path (code-quality review I1)", () => {
    const oddRoot = mkdtempSync(join(tmpdir(), "pokemap-gbc-tileset-oddpng-"));
    writeFixture(oddRoot, { metatileCount: 1, collisionLines: 1 });
    // 10x8 decodes fine (readShadesPng doesn't care about tile alignment),
    // but sliceTiles's cols=width/8 loop would otherwise silently read past
    // the shades array (Uint8Array coerces undefined to 0) instead of
    // refusing the malformed sheet.
    writeFileSync(join(oddRoot, "gfx", "tilesets", "tiny.png"), oddWidthGrayscalePng(10));
    expect(() => loadGbcTileset(oddRoot, "TILESET_TINY")).toThrow(/10/);
    expect(() => loadGbcTileset(oddRoot, "TILESET_TINY")).toThrow(/gfx\/tilesets\/tiny\.png/);
    rmSync(oddRoot, { recursive: true, force: true });
  });

  it("refuses a metatiles.bin with a bad length, naming the file (code-quality review I2)", () => {
    const badMetaRoot = mkdtempSync(join(tmpdir(), "pokemap-gbc-tileset-badmeta-"));
    writeFixture(badMetaRoot, { metatileCount: 1, collisionLines: 1 });
    writeFileSync(join(badMetaRoot, "data", "tilesets", "tiny_metatiles.bin"), Buffer.alloc(17, 0));
    expect(() => loadGbcTileset(badMetaRoot, "TILESET_TINY")).toThrow(/data\/tilesets\/tiny_metatiles\.bin/);
    rmSync(badMetaRoot, { recursive: true, force: true });
  });

  it("refuses a collision file with an unknown token, naming the file (code-quality review I2)", () => {
    const badCollRoot = mkdtempSync(join(tmpdir(), "pokemap-gbc-tileset-badcoll-"));
    writeFixture(badCollRoot, { metatileCount: 1, collisionLines: 1 });
    writeFileSync(join(badCollRoot, "data", "tilesets", "tiny_collision.asm"), "\ttilecoll FLOOR, FLOOR, FLOOR, NOPE");
    expect(() => loadGbcTileset(badCollRoot, "TILESET_TINY")).toThrow(/data\/tilesets\/tiny_collision\.asm/);
    rmSync(badCollRoot, { recursive: true, force: true });
  });
});

describe("GbcTileset corpus", () => {
  itWithGbcCorpus("all 37 Tilesets table entries load, with the documented aliases", () => {
    const table = parseTilesetsTable(readFileSync(`${GBC_SUBJECT_ROOT}/data/tilesets.asm`, "utf8"));
    expect(table).toHaveLength(37);

    const failures: string[] = [];
    for (const name of table) {
      try {
        loadGbcTilesetByName(GBC_SUBJECT_ROOT, name);
      } catch (e) {
        failures.push(`${name}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);

    const t0 = loadGbcTilesetByName(GBC_SUBJECT_ROOT, "Tileset0");
    const johto = loadGbcTilesetByName(GBC_SUBJECT_ROOT, "TilesetJohto");
    expect(t0.gfxPath).toBe(johto.gfxPath);

    const battleTowerOutside = loadGbcTilesetByName(GBC_SUBJECT_ROOT, "TilesetBattleTowerOutside");
    expect(battleTowerOutside.gfxPath).toBe("gfx/tilesets/johto_modern.png");

    const darkCave = loadGbcTilesetByName(GBC_SUBJECT_ROOT, "TilesetDarkCave");
    const cave = loadGbcTilesetByName(GBC_SUBJECT_ROOT, "TilesetCave");
    expect(darkCave.metatilesPath).toBe(cave.metatilesPath);
    expect(darkCave.collisionPath).toBe(cave.collisionPath);
    expect(darkCave.palMapPath).toBe(cave.palMapPath);
    expect(darkCave.gfxPath).toBe("gfx/tilesets/dark_cave.png");
    expect(darkCave.gfxPath).not.toBe(cave.gfxPath);

    const ruinsOfAlph = loadGbcTilesetByName(GBC_SUBJECT_ROOT, "TilesetRuinsOfAlph");
    for (const wordRoom of [
      "TilesetBetaWordRoom",
      "TilesetHoOhWordRoom",
      "TilesetKabutoWordRoom",
      "TilesetOmanyteWordRoom",
      "TilesetAerodactylWordRoom",
    ]) {
      expect(loadGbcTilesetByName(GBC_SUBJECT_ROOT, wordRoom).palMapPath).toBe(ruinsOfAlph.palMapPath);
    }
  });

  itWithGbcCorpus("metatile counts 128/40/64 per tileset match findings, via the full loader", () => {
    expect(loadGbcTileset(GBC_SUBJECT_ROOT, "TILESET_JOHTO").metatiles).toHaveLength(128);
    expect(loadGbcTileset(GBC_SUBJECT_ROOT, "TILESET_FOREST").metatiles).toHaveLength(40);
    expect(loadGbcTileset(GBC_SUBJECT_ROOT, "TILESET_MART").metatiles).toHaveLength(64);
  });

  itWithGbcCorpus("forest: collision is trimmed to 40 entries even though the source file has 64 tilecoll lines", () => {
    const forest = loadGbcTileset(GBC_SUBJECT_ROOT, "TILESET_FOREST");
    expect(forest.collision).toHaveLength(40);
  });

  itWithGbcCorpus(
    "every placed tile id (in every metatile of every tileset actually used by a real map, incl. border) resolves to a non-null PNG tile index within that PNG's tile count",
    () => {
      const loaded = loadGbcMaps(GBC_SUBJECT_ROOT);
      const constants = parseConstDefs(readFileSync(`${GBC_SUBJECT_ROOT}/constants/tileset_constants.asm`, "utf8"));
      const tilesetCache = new Map<string, ReturnType<typeof loadGbcTileset>>();
      const getTileset = (constName: string) => {
        if (!tilesetCache.has(constName)) tilesetCache.set(constName, loadGbcTileset(GBC_SUBJECT_ROOT, constName));
        return tilesetCache.get(constName)!;
      };

      let checkedTiles = 0;
      const failures: string[] = [];
      const unknownTilesetFields = new Set<string>();

      for (const map of loaded.maps) {
        const tilesetConst = map.tileset.trim();
        if (!constants.has(tilesetConst)) {
          unknownTilesetFields.add(tilesetConst);
          continue;
        }
        const ts = getTileset(tilesetConst);

        const metatileIds = new Set<number>();
        const { layout } = loadLayout(GBC_SUBJECT_ROOT, map);
        for (const block of layout.blocks) metatileIds.add(block.metatileId);
        metatileIds.add(map.border);

        for (const metatileId of metatileIds) {
          const metatile = ts.metatiles[metatileId];
          if (!metatile) {
            failures.push(`${map.name} (tileset ${tilesetConst}): metatile id ${metatileId} >= tileset's ${ts.metatiles.length} metatiles`);
            continue;
          }
          for (const tileId of metatile.tiles) {
            checkedTiles++;
            const idx = pngTileIndex(ts, tileId);
            if (idx === null || idx >= ts.tiles.length) {
              failures.push(
                `${map.name} (tileset ${tilesetConst}) metatile ${metatileId}: tile id ${tileId} -> PNG index ${idx}`,
              );
            }
          }
        }
      }

      // Every real map's tileset header field is a bare TILESET_ constant
      // (I3: parsed as an expression, but none observed uses `|` etc.).
      expect([...unknownTilesetFields]).toEqual([]);
      expect(checkedTiles).toBeGreaterThan(0); // vacuous-pass guard
      expect(failures.slice(0, 20)).toEqual([]);
    },
  );
});
