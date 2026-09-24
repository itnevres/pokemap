import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { parseRoofsAsm, loadGbcRoofs } from "../../../src/gbc/load/roofs.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";

/**
 * Copied verbatim from the real `data/maps/roofs.asm`'s shape (27
 * `MapGroupRoofs` entries, 5 `Roofs:` INCBINs) -- see this module's own doc
 * comment and GBC format findings §3.4 step 5 / §Extra Border.
 */
const REAL_SHAPE_FIXTURE = `; MapGroupRoofs values; Roofs indexes
\tconst_def
\tconst ROOF_NEW_BARK  ; 0
\tconst ROOF_VIOLET    ; 1
\tconst ROOF_AZALEA    ; 2
\tconst ROOF_OLIVINE   ; 3
\tconst ROOF_GOLDENROD ; 4
DEF NUM_ROOFS EQU const_value

MapGroupRoofs:
; entries correspond to MAPGROUP_* constants
; values are indexes for Roofs (see below)
\ttable_width 1, MapGroupRoofs
\tdb -1             ;  0
\tdb ROOF_OLIVINE   ;  1 (Olivine)
\tdb ROOF_AZALEA    ;  2 (Mahogany)
\tdb -1             ;  3
\tdb ROOF_VIOLET    ;  4 (Ecruteak)
\tdb ROOF_AZALEA    ;  5 (Blackthorn)
\tdb -1             ;  6
\tdb -1             ;  7
\tdb ROOF_AZALEA    ;  8 (Azalea)
\tdb ROOF_AZALEA    ;  9 (Lake of Rage)
\tdb ROOF_VIOLET    ; 10 (Violet)
\tdb ROOF_GOLDENROD ; 11 (Goldenrod)
\tdb -1             ; 12
\tdb -1             ; 13
\tdb -1             ; 14
\tdb -1             ; 15
\tdb -1             ; 16
\tdb -1             ; 17
\tdb -1             ; 18
\tdb ROOF_NEW_BARK  ; 19 (Silver Cave)
\tdb -1             ; 20
\tdb -1             ; 21
\tdb ROOF_OLIVINE   ; 22 (Cianwood)
\tdb -1             ; 23
\tdb ROOF_NEW_BARK  ; 24 (New Bark)
\tdb -1             ; 25
\tdb ROOF_NEW_BARK  ; 26 (Cherrygrove)
\tassert_table_length NUM_MAP_GROUPS + 1

Roofs:
; entries correspond to ROOF_* constants
\ttable_width ROOF_LENGTH * LEN_2BPP_TILE, Roofs
INCBIN "gfx/tilesets/roofs/new_bark.2bpp"
INCBIN "gfx/tilesets/roofs/violet.2bpp"
INCBIN "gfx/tilesets/roofs/azalea.2bpp"
INCBIN "gfx/tilesets/roofs/olivine.2bpp"
INCBIN "gfx/tilesets/roofs/goldenrod.2bpp"
\tassert_table_length NUM_ROOFS
`;

/** A `MapGroupRoofs`/`Roofs:` shape with one extra, UNREFERENCED `ROOF_*`
 *  constant -- exercises the "roof count must equal the number of ROOF_*
 *  consts" refusal (fix round 1, spec review m5) without also tripping the
 *  "unknown ROOF_* constant" refusal (every one of the real 5 is still
 *  referenced by some `MapGroupRoofs` entry; the extra one just isn't). */
const EXTRA_UNUSED_ROOF_CONST_FIXTURE = REAL_SHAPE_FIXTURE.replace(
  "\tconst ROOF_GOLDENROD ; 4\nDEF NUM_ROOFS EQU const_value",
  "\tconst ROOF_GOLDENROD ; 4\n\tconst ROOF_EXTRA     ; 5\nDEF NUM_ROOFS EQU const_value",
);

/** 26 `newgroup` lines -- matches the real `constants/map_constants.asm`'s
 *  count (OLIVINE..CHERRYGROVE) and `REAL_SHAPE_FIXTURE`'s 27 `MapGroupRoofs`
 *  entries (26 groups + 1 unused). `loadGbcRoofs`'s unit tests need this file
 *  on disk now that it cross-checks the two counts (fix round 1, spec review
 *  m5). */
const MAP_CONSTANTS_FIXTURE = Array.from({ length: 26 }, (_, i) => `\tnewgroup GROUP_${i + 1}`).join("\n") + "\n";

describe("parseRoofsAsm", () => {
  it("parses the real file's shape: 27 MapGroupRoofs entries (0 unused, 24 = ROOF_NEW_BARK), 5 Roofs PNG paths in ROOF_* order", () => {
    const { mapGroupRoofs, roofPngPaths } = parseRoofsAsm(REAL_SHAPE_FIXTURE, "data/maps/roofs.asm");
    expect(mapGroupRoofs).toHaveLength(27);
    expect(mapGroupRoofs[0]).toBeNull();
    expect(mapGroupRoofs[1]).toBe(3); // ROOF_OLIVINE
    expect(mapGroupRoofs[2]).toBe(2); // ROOF_AZALEA
    expect(mapGroupRoofs[3]).toBeNull();
    expect(mapGroupRoofs[24]).toBe(0); // ROOF_NEW_BARK
    expect(mapGroupRoofs[11]).toBe(4); // ROOF_GOLDENROD
    expect(roofPngPaths).toEqual([
      "gfx/tilesets/roofs/new_bark.png",
      "gfx/tilesets/roofs/violet.png",
      "gfx/tilesets/roofs/azalea.png",
      "gfx/tilesets/roofs/olivine.png",
      "gfx/tilesets/roofs/goldenrod.png",
    ]);
  });

  it("refuses an unknown ROOF_* constant, naming the file and 1-based line", () => {
    const bad = REAL_SHAPE_FIXTURE.replace("\tdb ROOF_OLIVINE   ;  1 (Olivine)", "\tdb ROOF_BOGUS     ;  1 (Olivine)");
    expect(() => parseRoofsAsm(bad, "data/maps/roofs.asm")).toThrow(/data\/maps\/roofs\.asm:15:/);
    expect(() => parseRoofsAsm(bad, "data/maps/roofs.asm")).toThrow(/ROOF_BOGUS/);
  });

  it("refuses a non-db line inside the MapGroupRoofs table", () => {
    const bad = REAL_SHAPE_FIXTURE.replace("\tdb -1             ;  0", "\tgarbage line here");
    expect(() => parseRoofsAsm(bad, "data/maps/roofs.asm")).toThrow(/data\/maps\/roofs\.asm:14:/);
    expect(() => parseRoofsAsm(bad, "data/maps/roofs.asm")).toThrow(/db.*line/);
  });

  it("refuses an unrecognized table_width line before MapGroupRoofs' db lines", () => {
    const bad = REAL_SHAPE_FIXTURE.replace("\ttable_width 1, MapGroupRoofs", "\ttable_width 2, MapGroupRoofs");
    expect(() => parseRoofsAsm(bad, "data/maps/roofs.asm")).toThrow(/data\/maps\/roofs\.asm:13:/);
    expect(() => parseRoofsAsm(bad, "data/maps/roofs.asm")).toThrow(/table_width 1, MapGroupRoofs/);
  });

  it("refuses an unrecognized table_width line before Roofs' INCBIN lines", () => {
    const bad = REAL_SHAPE_FIXTURE.replace(
      "\ttable_width ROOF_LENGTH * LEN_2BPP_TILE, Roofs",
      "\ttable_width 1, Roofs",
    );
    expect(() => parseRoofsAsm(bad, "data/maps/roofs.asm")).toThrow(/data\/maps\/roofs\.asm:45:/);
    expect(() => parseRoofsAsm(bad, "data/maps/roofs.asm")).toThrow(/ROOF_LENGTH \* LEN_2BPP_TILE/);
  });

  it("refuses a non-INCBIN line inside the Roofs table", () => {
    const bad = REAL_SHAPE_FIXTURE.replace(
      'INCBIN "gfx/tilesets/roofs/violet.2bpp"',
      "garbage line here",
    );
    expect(() => parseRoofsAsm(bad, "data/maps/roofs.asm")).toThrow(/data\/maps\/roofs\.asm:47:/);
    expect(() => parseRoofsAsm(bad, "data/maps/roofs.asm")).toThrow(/INCBIN/);
  });

  it("refuses when the Roofs table's entry count doesn't match the number of ROOF_* constants defined", () => {
    expect(() => parseRoofsAsm(EXTRA_UNUSED_ROOF_CONST_FIXTURE, "data/maps/roofs.asm")).toThrow(/data\/maps\/roofs\.asm:/);
    expect(() => parseRoofsAsm(EXTRA_UNUSED_ROOF_CONST_FIXTURE, "data/maps/roofs.asm")).toThrow(/Roofs: has 5 entries, but 6 ROOF_\* constant/);
  });

  it("refuses an incomplete file (missing the Roofs table entirely)", () => {
    const truncated = REAL_SHAPE_FIXTURE.slice(0, REAL_SHAPE_FIXTURE.indexOf("\tassert_table_length NUM_MAP_GROUPS + 1") + 40);
    expect(() => parseRoofsAsm(truncated, "data/maps/roofs.asm")).toThrow(/incomplete/);
  });

  it("refuses a MapGroupRoofs entry that references a Roofs index beyond what the Roofs table has", () => {
    const fewerRoofs = REAL_SHAPE_FIXTURE.replace('INCBIN "gfx/tilesets/roofs/goldenrod.2bpp"\n', "");
    expect(() => parseRoofsAsm(fewerRoofs, "data/maps/roofs.asm")).toThrow(/roof index 4/);
    expect(() => parseRoofsAsm(fewerRoofs, "data/maps/roofs.asm")).toThrow(/only has 4/);
  });

  it("defaults source to \"<roofs>\" when none is given", () => {
    const bad = REAL_SHAPE_FIXTURE.replace("\tdb ROOF_OLIVINE   ;  1 (Olivine)", "\tdb ROOF_BOGUS     ;  1 (Olivine)");
    expect(() => parseRoofsAsm(bad)).toThrow(/<roofs>:15:/);
  });

  describe("corpus", () => {
    itWithGbcCorpus("matches the real data/maps/roofs.asm byte for byte in shape", () => {
      const text = readFileSync(`${GBC_SUBJECT_ROOT}/data/maps/roofs.asm`, "utf8");
      const { mapGroupRoofs, roofPngPaths } = parseRoofsAsm(text, "data/maps/roofs.asm");
      expect(mapGroupRoofs).toHaveLength(27);
      expect(mapGroupRoofs[0]).toBeNull();
      expect(mapGroupRoofs[24]).toBe(0); // ROOF_NEW_BARK
      expect(mapGroupRoofs[10]).toBe(1); // ROOF_VIOLET (Violet)
      expect(roofPngPaths).toEqual([
        "gfx/tilesets/roofs/new_bark.png",
        "gfx/tilesets/roofs/violet.png",
        "gfx/tilesets/roofs/azalea.png",
        "gfx/tilesets/roofs/olivine.png",
        "gfx/tilesets/roofs/goldenrod.png",
      ]);
    });
  });
});

/** Minimal PNG builder, mirrors png.test.ts's own (grayscale depth 2, filter-0 rows only -- this module doesn't need to exercise the unfilter path, that's png.test.ts's job). */
function buildGrayscalePng(width: number, height: number, shade: number): Buffer {
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
  const gray = 3 - shade; // readShadesPng: shade = 3 - grayLevel
  const packedByte = gray | (gray << 2) | (gray << 4) | (gray << 6);
  const bytesPerRow = Math.ceil((width * 2) / 8);
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(0x00); // filter None
    for (let i = 0; i < bytesPerRow; i++) rows.push(packedByte);
  }
  const raw = Buffer.from(rows);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 2; // depth
  ihdr[9] = 0; // colour type (grayscale)
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

describe("loadGbcRoofs", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "gbc-roofs-"));
    mkdirSync(join(dir, "data", "maps"), { recursive: true });
    mkdirSync(join(dir, "constants"), { recursive: true });
    mkdirSync(join(dir, "gfx", "tilesets", "roofs"), { recursive: true });
    writeFileSync(join(dir, "data", "maps", "roofs.asm"), REAL_SHAPE_FIXTURE);
    writeFileSync(join(dir, "constants", "map_constants.asm"), MAP_CONSTANTS_FIXTURE);
    for (const [name, shade] of [
      ["new_bark", 0],
      ["violet", 1],
      ["azalea", 2],
      ["olivine", 3],
      ["goldenrod", 0],
    ] as const) {
      writeFileSync(join(dir, "gfx", "tilesets", "roofs", `${name}.png`), buildGrayscalePng(24, 24, shade));
    }
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("decodes all 5 roof PNGs into 9 uniform-shade tiles each, mapGroupRoofs intact", () => {
    const roofs = loadGbcRoofs(dir);
    expect(roofs.mapGroupRoofs).toHaveLength(27);
    expect(roofs.mapGroupRoofs[24]).toBe(0); // ROOF_NEW_BARK
    expect(roofs.roofTiles).toHaveLength(5);
    for (const [i, expectedShade] of [0, 1, 2, 3, 0].entries()) {
      expect(roofs.roofTiles[i]).toHaveLength(9);
      for (const tile of roofs.roofTiles[i]!) {
        expect(tile).toHaveLength(64);
        expect([...tile]).toEqual(new Array(64).fill(expectedShade));
      }
    }
  });

  it("refuses a roof PNG that isn't exactly 24x24, naming the path and actual dimensions", () => {
    const dir2 = mkdtempSync(join(tmpdir(), "gbc-roofs-bad-"));
    try {
      mkdirSync(join(dir2, "data", "maps"), { recursive: true });
      mkdirSync(join(dir2, "constants"), { recursive: true });
      mkdirSync(join(dir2, "gfx", "tilesets", "roofs"), { recursive: true });
      writeFileSync(join(dir2, "data", "maps", "roofs.asm"), REAL_SHAPE_FIXTURE);
      writeFileSync(join(dir2, "constants", "map_constants.asm"), MAP_CONSTANTS_FIXTURE);
      writeFileSync(join(dir2, "gfx", "tilesets", "roofs", "new_bark.png"), buildGrayscalePng(16, 16, 0));
      writeFileSync(join(dir2, "gfx", "tilesets", "roofs", "violet.png"), buildGrayscalePng(24, 24, 0));
      writeFileSync(join(dir2, "gfx", "tilesets", "roofs", "azalea.png"), buildGrayscalePng(24, 24, 0));
      writeFileSync(join(dir2, "gfx", "tilesets", "roofs", "olivine.png"), buildGrayscalePng(24, 24, 0));
      writeFileSync(join(dir2, "gfx", "tilesets", "roofs", "goldenrod.png"), buildGrayscalePng(24, 24, 0));
      expect(() => loadGbcRoofs(dir2)).toThrow(/new_bark\.png/);
      expect(() => loadGbcRoofs(dir2)).toThrow(/16x16/);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it("refuses when MapGroupRoofs' length doesn't match constants/map_constants.asm's newgroup count + 1", () => {
    const dir3 = mkdtempSync(join(tmpdir(), "gbc-roofs-mismatch-"));
    try {
      mkdirSync(join(dir3, "data", "maps"), { recursive: true });
      mkdirSync(join(dir3, "constants"), { recursive: true });
      mkdirSync(join(dir3, "gfx", "tilesets", "roofs"), { recursive: true });
      writeFileSync(join(dir3, "data", "maps", "roofs.asm"), REAL_SHAPE_FIXTURE); // 27 entries = 26 + 1
      // Only 20 newgroups here, not 26 -- MapGroupRoofs (27 entries) now disagrees.
      const fewerGroups = Array.from({ length: 20 }, (_, i) => `\tnewgroup GROUP_${i + 1}`).join("\n") + "\n";
      writeFileSync(join(dir3, "constants", "map_constants.asm"), fewerGroups);
      for (const name of ["new_bark", "violet", "azalea", "olivine", "goldenrod"]) {
        writeFileSync(join(dir3, "gfx", "tilesets", "roofs", `${name}.png`), buildGrayscalePng(24, 24, 0));
      }
      expect(() => loadGbcRoofs(dir3)).toThrow(/MapGroupRoofs has 27 entries/);
      expect(() => loadGbcRoofs(dir3)).toThrow(/defines 20 newgroup\(s\)/);
      expect(() => loadGbcRoofs(dir3)).toThrow(/expected 21/);
    } finally {
      rmSync(dir3, { recursive: true, force: true });
    }
  });

  describe("corpus", () => {
    itWithGbcCorpus(
      "real project: 5 roof tile sets (== the 5 ROOF_* consts), each 9 tiles of 64 shades; MapGroupRoofs has 27 entries (== 26 newgroups + 1)",
      () => {
        const roofs = loadGbcRoofs(GBC_SUBJECT_ROOT);
        expect(roofs.roofTiles).toHaveLength(5);
        for (const set of roofs.roofTiles) {
          expect(set).toHaveLength(9);
          for (const tile of set) expect(tile).toHaveLength(64);
        }
        expect(roofs.mapGroupRoofs).toHaveLength(27);
        expect(roofs.mapGroupRoofs[24]).toBe(0); // ROOF_NEW_BARK, New Bark's own group
      },
    );
  });
});
