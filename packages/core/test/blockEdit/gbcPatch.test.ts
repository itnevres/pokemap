import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BlockEditRefusal } from "../../src/blockEdit/types.js";
import {
  patchGbcCollision,
  patchGbcMetatiles,
  patchGbcPaletteMap,
  readGbcCollisionRecords,
} from "../../src/blockEdit/gbcPatch.js";
import { parseMetatiles } from "../../src/gbc/load/tileset.js";
import { parseIncbins, parseIncludes } from "../../src/gbc/load/incbin.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../gbc/helpers/corpus.js";

// Plan 14.2 Task 2: the three lossless GBC tileset patchers. Every one is a
// pure function over bytes/text -- it never touches disk, and it never
// re-serializes a parsed model, so a no-op rewrite must return the input's
// exact bytes and an edit must change only its own target span.

const METATILES_PATH = "gfx/tilesets/test_metatiles.bin";
const COLLISION_PATH = "gfx/tilesets/test_collision.asm";
const PALETTE_PATH = "gfx/tilesets/test_palette_map.asm";

/** Runs `fn` and returns the refusal it threw; fails the test when it returns. */
function refusal(fn: () => unknown): BlockEditRefusal {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BlockEditRefusal);
    return e as BlockEditRefusal;
  }
  throw new Error("test fixture: expected a BlockEditRefusal, but the call returned");
}

const tilepalLine = (bank: number, names: readonly string[]): string => `\ttilepal ${bank}, ${names.join(", ")}`;
const gray: readonly string[] = Array.from({ length: 8 }, () => "GRAY");

/**
 * The exact palette-map shape `parsePaletteMap` accepts: 12 bank-0 tilepal
 * lines, the $60-$7F `rept 16`/`db $ff` filler, 12 bank-1 lines. `overrides`
 * replaces one bank/line-index/name-index slot.
 */
function paletteMapText(overrides?: { bank: 0 | 1; line: number; index: number; name: string }): string {
  const lineAt = (bank: 0 | 1, line: number): string[] => {
    const names = [...gray];
    if (overrides && overrides.bank === bank && overrides.line === line) names[overrides.index] = overrides.name;
    return names;
  };
  const low = Array.from({ length: 12 }, (_, i) => tilepalLine(0, lineAt(0, i)));
  const high = Array.from({ length: 12 }, (_, i) => tilepalLine(1, lineAt(1, i)));
  return [...low, "rept 16", "\tdb $ff", "endr", ...high].join("\n");
}

describe("patchGbcMetatiles", () => {
  it("changes only bytes [16*id, 16*id+16)", () => {
    const buf = Buffer.from(Array.from({ length: 64 }, (_, i) => i));
    const tiles = Array.from({ length: 16 }, (_, i) => 0xf0 + i);
    const patched = patchGbcMetatiles(buf, 1, tiles, METATILES_PATH);
    expect(patched.length).toBe(buf.length);
    expect([...patched.subarray(0, 16)]).toEqual([...buf.subarray(0, 16)]);
    expect([...patched.subarray(16, 32)]).toEqual(tiles);
    expect([...patched.subarray(32)]).toEqual([...buf.subarray(32)]);
    // The input is never mutated.
    expect([...buf.subarray(16, 32)]).toEqual(Array.from({ length: 16 }, (_, i) => 16 + i));
  });

  it("appends a record at id === count", () => {
    const buf = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
    const tiles = Array.from({ length: 16 }, () => 0x2a);
    const patched = patchGbcMetatiles(buf, 2, tiles, METATILES_PATH);
    expect(patched.length).toBe(48);
    expect([...patched.subarray(0, 32)]).toEqual([...buf]);
    expect([...patched.subarray(32)]).toEqual(tiles);
  });

  it("refuses BAD_VALUE for id > count, and BLOCK_CAP at 256", () => {
    const buf = Buffer.alloc(2 * 16, 1);
    const beyond = refusal(() => patchGbcMetatiles(buf, 3, new Array(16).fill(0), METATILES_PATH));
    expect(beyond.code).toBe("BAD_VALUE");
    expect(beyond.message.startsWith(METATILES_PATH)).toBe(true);

    const negative = refusal(() => patchGbcMetatiles(buf, -1, new Array(16).fill(0), METATILES_PATH));
    expect(negative.code).toBe("BAD_VALUE");

    const full = Buffer.alloc(256 * 16, 2);
    const capped = refusal(() => patchGbcMetatiles(full, 256, new Array(16).fill(0), METATILES_PATH));
    expect(capped.code).toBe("BLOCK_CAP");
    expect(capped.message.startsWith(METATILES_PATH)).toBe(true);
    expect(capped.message).toMatch(/256/);
    // An existing id below the cap stays editable.
    expect(patchGbcMetatiles(full, 255, new Array(16).fill(9), METATILES_PATH).length).toBe(full.length);
  });

  it("refuses BLOCK_CAP for every id when the input already exceeds 256 records", () => {
    const oversized = Buffer.alloc(257 * 16, 2);
    for (const id of [-1, 0, 255, 256, 257, 258]) {
      const bad = refusal(() => patchGbcMetatiles(oversized, id, new Array(16).fill(9), METATILES_PATH));
      expect({ id, code: bad.code }).toEqual({ id, code: "BLOCK_CAP" });
      expect(bad.message.startsWith(METATILES_PATH)).toBe(true);
    }
  });

  it("edits an existing record at exactly 256 records without changing other bytes", () => {
    const full = Buffer.alloc(256 * 16, 2);
    const patched = patchGbcMetatiles(full, 255, new Array(16).fill(9), METATILES_PATH);
    expect(patched).toEqual(Buffer.concat([Buffer.alloc(255 * 16, 2), Buffer.alloc(16, 9)]));
    expect(full).toEqual(Buffer.alloc(256 * 16, 2));
  });

  it("refuses a record that is not 16 tile ids, naming the path", () => {
    const bad = refusal(() => patchGbcMetatiles(Buffer.alloc(16), 0, new Array(15).fill(0), METATILES_PATH));
    expect(bad.code).toBe("BAD_VALUE");
    expect(bad.message.startsWith(METATILES_PATH)).toBe(true);
  });
});

describe("readGbcCollisionRecords", () => {
  it("returns four argument names per tilecoll record, in source order", () => {
    const text = [
      "\ttilecoll FLOOR, FLOOR, FLOOR, WALL ; 00",
      "\ttilecoll CUT_TREE, CUT_TREE, CUT_TREE, CUT_TREE ; 01",
    ].join("\r\n");
    expect(readGbcCollisionRecords(text)).toEqual([
      ["FLOOR", "FLOOR", "FLOOR", "WALL"],
      ["CUT_TREE", "CUT_TREE", "CUT_TREE", "CUT_TREE"],
    ]);
  });

  it("refuses a record that does not have exactly four names", () => {
    const bad = refusal(() => readGbcCollisionRecords("\ttilecoll FLOOR, FLOOR, WALL"));
    expect(bad.code).toBe("BAD_VALUE");
    expect(bad.message).toContain("record 0");
  });
});

describe("patchGbcCollision", () => {
  it("replaces the four names of record id in place, keeping the comment", () => {
    const text = [
      "\ttilecoll FLOOR, FLOOR, FLOOR, WALL ; 00",
      "\ttilecoll CUT_TREE, CUT_TREE, CUT_TREE, CUT_TREE ; 01",
    ].join("\r\n");
    const patched = patchGbcCollision(text, 1, ["WALL", "WALL", "WATER", "01"], COLLISION_PATH);
    expect(patched).toBe(
      [
        "\ttilecoll FLOOR, FLOOR, FLOOR, WALL ; 00",
        "\ttilecoll WALL, WALL, WATER, 01 ; 01",
      ].join("\r\n"),
    );
    expect(readGbcCollisionRecords(patched)[0]).toEqual(["FLOOR", "FLOOR", "FLOOR", "WALL"]);
  });

  it("refuses BAD_VALUE for id > records.length, naming the path", () => {
    const text = "\ttilecoll FLOOR, FLOOR, FLOOR, WALL\r\n";
    const bad = refusal(() => patchGbcCollision(text, 2, ["WALL", "WALL", "WALL", "WALL"], COLLISION_PATH));
    expect(bad.code).toBe("BAD_VALUE");
    expect(bad.message.startsWith(COLLISION_PATH)).toBe(true);
  });

  it("appends with the last record's exact keyword spacing and individual separators without a final newline", () => {
    const text = "; header\r\n \ttilecoll\t  FLOOR \t,\tWALL,  WATER  , FLOOR ; last";
    expect(patchGbcCollision(text, 1, ["WALL", "WATER", "FLOOR", "WALL"], COLLISION_PATH)).toBe(
      `${text}\r\n \ttilecoll\t  WALL \t,\tWATER,  FLOOR  , WALL`,
    );
  });

  it("appends at id === records.length using the file's EOL and indentation", () => {
    for (const eol of ["\r\n", "\n"]) {
      const text = [
        "\ttilecoll FLOOR, FLOOR, FLOOR, WALL ; 00",
        "\ttilecoll WALL, WALL, WALL, WALL ; 01",
      ].join(eol) + eol;
      const patched = patchGbcCollision(text, 2, ["WATER", "WATER", "WATER", "WATER"], COLLISION_PATH);
      expect(patched).toBe(`${text}\ttilecoll WATER, WATER, WATER, WATER${eol}`);
      expect(patched.split(eol)).toHaveLength(4);
      if (eol === "\n") expect(patched).not.toContain("\r");
      else expect(patched.replaceAll("\r\n", "")).not.toContain("\n");
    }
  });
});

describe("patchGbcPaletteMap", () => {
  it("allows nonstandard untouched names while restricting the new name to the eight palettes", () => {
    const text = paletteMapText({ bank: 1, line: 2, index: 3, name: "PURPLE" });
    expect(patchGbcPaletteMap(text, 0, "GREEN", PALETTE_PATH)).toBe(
      text.replace("tilepal 0, GRAY", "tilepal 0, GREEN"),
    );
    const bad = refusal(() => patchGbcPaletteMap(text, 0, "PURPLE", PALETTE_PATH));
    expect(bad.code).toBe("BAD_VALUE");
    expect(bad.message.startsWith(PALETTE_PATH)).toBe(true);
    expect(bad.message).toContain("PURPLE");
  });

  it("preserves a noncanonical target line, CRLF and no final newline when replacing one palette name", () => {
    const line = " \ttilepal\t 1 , GRAY,\tGRAY ,  GRAY, GRAY ,\tGRAY,  RED  , GRAY,\tGRAY \t; comment";
    const text = paletteMapText().replace(tilepalLine(1, gray), line).replaceAll("\n", "\r\n");
    expect(patchGbcPaletteMap(text, 0x85, "GREEN", PALETTE_PATH)).toBe(text.replace("RED", "GREEN"));
  });

  it("changes only the $85 name on a bank-1 tilepal line", () => {
    const text = paletteMapText({ bank: 1, line: 0, index: 5, name: "RED" });
    const patched = patchGbcPaletteMap(text, 0x85, "GREEN", PALETTE_PATH);
    expect(patched).toBe(text.replace("tilepal 1, GRAY, GRAY, GRAY, GRAY, GRAY, RED", "tilepal 1, GRAY, GRAY, GRAY, GRAY, GRAY, GREEN"));
    expect(patched.split("\n")).toHaveLength(text.split("\n").length);
    // Nothing else moved: restoring the one name gives the exact original.
    expect(patchGbcPaletteMap(patched, 0x85, "RED", PALETTE_PATH)).toBe(text);
  });

  it("maps bank-0 tile 0x2a to the third name of its own line", () => {
    const text = paletteMapText({ bank: 0, line: 5, index: 2, name: "BROWN" });
    const patched = patchGbcPaletteMap(text, 0x2a, "WATER", PALETTE_PATH);
    expect(patched).toBe(text.replace("tilepal 0, GRAY, GRAY, BROWN", "tilepal 0, GRAY, GRAY, WATER"));
  });

  it("refuses BAD_VALUE for the $60-$7F gap, out-of-range tiles, and an unknown palette name", () => {
    const text = paletteMapText();
    for (const tileId of [0x60, 0x7f, 0xdf + 1, -1]) {
      const bad = refusal(() => patchGbcPaletteMap(text, tileId, "GRAY", PALETTE_PATH));
      expect({ tileId, code: bad.code }).toEqual({ tileId, code: "BAD_VALUE" });
      expect(bad.message.startsWith(PALETTE_PATH)).toBe(true);
    }
    const unknown = refusal(() => patchGbcPaletteMap(text, 0, "NOT_A_PALETTE", PALETTE_PATH));
    expect(unknown.code).toBe("BAD_VALUE");
    expect(unknown.message.startsWith(PALETTE_PATH)).toBe(true);
    expect(unknown.message).toContain("NOT_A_PALETTE");
  });
});

// ---------------------------------------------------------------------------
// Corpus: every real PerfPlus file round-trips through its own values.
// ---------------------------------------------------------------------------

describe("no-op over the corpus", () => {
  itWithGbcCorpus("every metatiles record, collision record and palette-map entry 0 rewrites to the identical file", () => {
    const tilesetsAsm = readFileSync(`${GBC_SUBJECT_ROOT}/gfx/tilesets.asm`, "utf8");
    const metatilesPaths = [...new Set(parseIncbins(tilesetsAsm).map((e) => e.path).filter((p) => p.endsWith("_metatiles.bin")))];
    const collisionPaths = [...new Set(parseIncludes(tilesetsAsm).map((e) => e.path).filter((p) => p.endsWith("_collision.asm")))];
    const palettePaths = [
      ...new Set(
        parseIncludes(readFileSync(`${GBC_SUBJECT_ROOT}/gfx/tileset_palette_maps.asm`, "utf8"))
          .map((e) => e.path)
          .filter((p) => p.endsWith("_palette_map.asm")),
      ),
    ];
    // Guard against a vacuous pass on a corpus missing the whole family.
    expect(metatilesPaths.length).toBeGreaterThan(0);
    expect(collisionPaths.length).toBeGreaterThan(0);
    expect(palettePaths.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const path of metatilesPaths) {
      const buf = readFileSync(`${GBC_SUBJECT_ROOT}/${path}`);
      parseMetatiles(buf, path).forEach((metatile, id) => {
        if (!patchGbcMetatiles(buf, id, metatile.tiles, path).equals(buf)) failures.push(`${path}: metatile ${id}`);
      });
    }
    for (const path of collisionPaths) {
      const text = readFileSync(`${GBC_SUBJECT_ROOT}/${path}`, "utf8");
      const records = readGbcCollisionRecords(text);
      records.forEach((names, id) => {
        const patched = patchGbcCollision(text, id, [names[0]!, names[1]!, names[2]!, names[3]!], path);
        if (patched !== text) failures.push(`${path}: collision record ${id}`);
      });
    }
    for (const path of palettePaths) {
      const text = readFileSync(`${GBC_SUBJECT_ROOT}/${path}`, "utf8");
      // The first bank-0 line's first name ($00) and the first bank-1 line's
      // first name ($80) -- the "tile 0" round-trip for each half.
      const low = /^[ \t]*tilepal[ \t]+0[ \t]*,[ \t]*([A-Za-z0-9_]+)/m.exec(text);
      const high = /^[ \t]*tilepal[ \t]+1[ \t]*,[ \t]*([A-Za-z0-9_]+)/m.exec(text);
      if (!low || !high) {
        failures.push(`${path}: no tilepal 0 / tilepal 1 line`);
        continue;
      }
      if (patchGbcPaletteMap(text, 0x00, low[1]!, path) !== text) failures.push(`${path}: palette tile $00`);
      if (patchGbcPaletteMap(text, 0x80, high[1]!, path) !== text) failures.push(`${path}: palette tile $80`);
    }
    expect(failures).toEqual([]);
  });

  itWithGbcCorpus("forest surplus: record 40 changes, 64 records remain, every other byte identical", () => {
    const path = "data/tilesets/forest_collision.asm";
    const text = readFileSync(`${GBC_SUBJECT_ROOT}/${path}`, "utf8");
    const before = readGbcCollisionRecords(text);
    expect(before).toHaveLength(64);

    // Flip each quadrant so the record always really changes (never patch a
    // record with the values it already has).
    const replacement = before[40]!.map((name) => (name === "WALL" ? "FLOOR" : "WALL")) as [string, string, string, string];
    const patched = patchGbcCollision(text, 40, replacement, path);
    const after = readGbcCollisionRecords(patched);
    expect(after).toHaveLength(64);
    expect(after[40]).toEqual(replacement);
    expect(after.filter((_names, id) => id !== 40)).toEqual(before.filter((_names, id) => id !== 40));
    // Only record 40's own line may differ; every other line is byte-identical.
    const beforeLines = text.split("\n");
    const afterLines = patched.split("\n");
    expect(afterLines).toHaveLength(beforeLines.length);
    const differing = beforeLines.map((line, i) => (line === afterLines[i] ? -1 : i)).filter((i) => i !== -1);
    expect(differing).toHaveLength(1);
    expect(beforeLines[differing[0]!]).toContain("tilecoll");
    expect(afterLines[differing[0]!]).toContain(replacement.join(", "));
    // Derive the expected line from its four source names, retaining all
    // captured whitespace, separators and the untouched trailing comment.
    const expectedLine = beforeLines[differing[0]!]!.replace(
      /^(.*?\btilecoll[ \t]+)\w+([ \t]*,[ \t]*)\w+([ \t]*,[ \t]*)\w+([ \t]*,[ \t]*)\w+([^\n]*)$/,
      (_match, prefix, sep1, sep2, sep3, suffix) =>
        `${prefix}${replacement[0]}${sep1}${replacement[1]}${sep2}${replacement[2]}${sep3}${replacement[3]}${suffix}`,
    );
    expect(afterLines[differing[0]!]).toBe(expectedLine);
  });
});
