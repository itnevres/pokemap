import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseMapConstants,
  parseMapAttributes,
  parseMapHeaders,
  loadGbcMaps,
  loadLayout,
  parseNum,
} from "../../../src/gbc/load/map.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus, hasGbcProject, gbcCorpusRoots } from "../helpers/corpus.js";

describe("parseMapConstants", () => {
  it("parses group/number order and width/height, decimal args", () => {
    const text = [
      "\tconst_def",
      "",
      "\tnewgroup OLIVINE                                              ;  1",
      "\tmap_const OLIVINE_POKECENTER_1F,                        5,  4 ;  1",
      "\tmap_const OLIVINE_GYM,                                  5,  8 ;  2",
      "\tendgroup",
      "",
      "\tnewgroup MAHOGANY                                             ;  2",
      "\tmap_const MAHOGANY_TOWN,                               10,  9 ;  1",
      "\tendgroup",
    ].join("\n");
    expect(parseMapConstants(text)).toEqual([
      { constName: "OLIVINE_POKECENTER_1F", group: 1, number: 1, width: 5, height: 4 },
      { constName: "OLIVINE_GYM", group: 1, number: 2, width: 5, height: 8 },
      { constName: "MAHOGANY_TOWN", group: 2, number: 1, width: 10, height: 9 },
    ]);
  });

  it("skips the MACRO...ENDM definitions at the top of the file", () => {
    const text = [
      "MACRO map_const",
      ";\\1: map id",
      "\tDEF GROUP_\\1 EQU const_value",
      "ENDM",
      "",
      "\tconst_def",
      "\tnewgroup FOO                                                  ;  1",
      "\tmap_const FOO_TOWN,                                     4,  4 ;  1",
      "\tendgroup",
    ].join("\n");
    expect(parseMapConstants(text)).toEqual([{ constName: "FOO_TOWN", group: 1, number: 1, width: 4, height: 4 }]);
  });

  it("accepts irregular PerfPlus spacing and a trailing comment", () => {
    const text = [
      "\tnewgroup DUNGEONS                                             ;  3",
      "\tmap_const CERULEAN_CAVE_1F,                              9,  9 ; 17",
      "\tmap_const CERULEAN_CAVE_2F,                             9,  15 ; 18",
      "\tendgroup",
    ].join("\n");
    expect(parseMapConstants(text)).toEqual([
      { constName: "CERULEAN_CAVE_1F", group: 1, number: 1, width: 9, height: 9 },
      { constName: "CERULEAN_CAVE_2F", group: 1, number: 2, width: 9, height: 15 },
    ]);
  });

  it("accepts a final line with no trailing newline", () => {
    const text = "\tnewgroup FOO                                                  ;  1\n\tmap_const FOO_TOWN, 4, 4 ;  1";
    expect(parseMapConstants(text)).toEqual([{ constName: "FOO_TOWN", group: 1, number: 1, width: 4, height: 4 }]);
  });

  it("tolerates CRLF line endings (M5)", () => {
    const text = "\tnewgroup FOO                                                  ;  1\r\n\tmap_const FOO_TOWN, 4, 4 ;  1\r\n\tendgroup\r\n";
    expect(parseMapConstants(text)).toEqual([{ constName: "FOO_TOWN", group: 1, number: 1, width: 4, height: 4 }]);
  });
});

describe("parseNum", () => {
  it("parses $hex", () => {
    expect(parseNum("$05")).toBe(5);
    expect(parseNum("$2c")).toBe(44);
  });

  it("parses a plain and a negative decimal", () => {
    expect(parseNum("18")).toBe(18);
    expect(parseNum("-18")).toBe(-18);
    expect(parseNum("0")).toBe(0);
  });

  it("trims surrounding whitespace", () => {
    expect(parseNum("  5  ")).toBe(5);
  });

  it("refuses a non-clean expression, naming the text, rather than truncating (parseInt(\"5 + 1\") === 5)", () => {
    expect(() => parseNum("5 + 1")).toThrow(/5 \+ 1/);
  });

  it("refuses text with an unstripped comment fragment, naming the text, rather than truncating", () => {
    expect(() => parseNum("4 ;  1")).toThrow(/4 ;  1/);
  });

  it("refuses an empty string rather than returning NaN", () => {
    expect(() => parseNum("")).toThrow();
  });

  it("refuses a hex token with trailing junk, naming the text, rather than truncating at the first non-hex-digit", () => {
    expect(() => parseNum("$05 + 1")).toThrow(/\$05 \+ 1/);
  });

  it("refuses a $ prefix with non-hex digits, naming the text", () => {
    expect(() => parseNum("$zz")).toThrow(/\$zz/);
  });

  it("refuses a bare $ with no digits, naming the text", () => {
    expect(() => parseNum("$")).toThrow(/\$/);
  });
});

describe("parseMapAttributes", () => {
  it("parses name, constName, hex border and connection flags", () => {
    const text = "\tmap_attributes NewBarkTown, NEW_BARK_TOWN, $05, WEST | EAST";
    expect(parseMapAttributes(text)).toEqual([
      { name: "NewBarkTown", constName: "NEW_BARK_TOWN", border: 5, connectionFlags: "WEST | EAST", connections: [] },
    ]);
  });

  it("attaches connection lines, including a negative offset, to the preceding map_attributes", () => {
    const text = [
      "\tmap_attributes AzaleaTown, AZALEA_TOWN, $05, WEST | EAST",
      "\tconnection west, Route34, ROUTE_34, -18",
      "\tconnection east, Route33, ROUTE_33, 0",
    ].join("\n");
    expect(parseMapAttributes(text)).toEqual([
      {
        name: "AzaleaTown",
        constName: "AZALEA_TOWN",
        border: 5,
        connectionFlags: "WEST | EAST",
        connections: [
          { direction: "west", targetName: "Route34", targetConst: "ROUTE_34", offset: -18 },
          { direction: "east", targetName: "Route33", targetConst: "ROUTE_33", offset: 0 },
        ],
      },
    ]);
  });

  it("parses a border of 0 and connection flags of 0 (no connections)", () => {
    const text = "\tmap_attributes SomeRoom, SOME_ROOM, $00, 0";
    expect(parseMapAttributes(text)).toEqual([
      { name: "SomeRoom", constName: "SOME_ROOM", border: 0, connectionFlags: "0", connections: [] },
    ]);
  });

  it("skips the MACRO...ENDM definitions, including the legacy 6-arg connection call inside the macro body", () => {
    const text = [
      "MACRO map_attributes",
      "\tDEF CURRENT_MAP_WIDTH = \\2_WIDTH",
      "ENDM",
      "",
      "MACRO connection",
      "\tif _NARG == 6",
      "\t\tconnection \\1, \\2, \\3, (\\4) - (\\5)",
      "\telse",
      "\t\tDEF _src = 0",
      "\tendc",
      "ENDM",
      "",
      "\tmap_attributes NewBarkTown, NEW_BARK_TOWN, $05, WEST | EAST",
      "\tconnection west, Route29, ROUTE_29, 0",
    ].join("\n");
    expect(parseMapAttributes(text)).toEqual([
      {
        name: "NewBarkTown",
        constName: "NEW_BARK_TOWN",
        border: 5,
        connectionFlags: "WEST | EAST",
        connections: [{ direction: "west", targetName: "Route29", targetConst: "ROUTE_29", offset: 0 }],
      },
    ]);
  });

  it("accepts a final line with no trailing newline", () => {
    const text = "\tmap_attributes Foo, FOO, $00, 0";
    expect(parseMapAttributes(text)).toEqual([
      { name: "Foo", constName: "FOO", border: 0, connectionFlags: "0", connections: [] },
    ]);
  });

  it("strips a trailing comment on a map_attributes line -- the flags arg is not corrupted", () => {
    const text = "\tmap_attributes FooTown, FOO_TOWN, $00, WEST ; comment";
    expect(parseMapAttributes(text)).toEqual([
      { name: "FooTown", constName: "FOO_TOWN", border: 0, connectionFlags: "WEST", connections: [] },
    ]);
  });

  it("refuses an unrecognized connection direction, naming it", () => {
    const text = ["\tmap_attributes FooTown, FOO_TOWN, $00, 0", "\tconnection up, Bar, BAR, 0"].join("\n");
    expect(() => parseMapAttributes(text)).toThrow(/up/);
  });
});

describe("parseMapHeaders", () => {
  it("parses header args as trimmed expressions, group from MapGroupPointers order, number from position", () => {
    const text = [
      "MapGroupPointers::",
      "; pointers to the first map of each map group",
      "\ttable_width 2, MapGroupPointers",
      "\tdw MapGroup_Olivine     ;  1",
      "\tdw MapGroup_NewBark     ;  2",
      "\tassert_table_length NUM_MAP_GROUPS",
      "",
      "MapGroup_Olivine:",
      "\tmap OlivinePokecenter1F, TILESET_POKECENTER, INDOOR, LANDMARK_OLIVINE_CITY, MUSIC_POKEMON_CENTER, FALSE, PALETTE_DAY, FISHGROUP_SHORE",
      "",
      "MapGroup_NewBark:",
      "\tmap Route26, TILESET_JOHTO, ROUTE, LANDMARK_ROUTE_26, MUSIC_ROUTE_26, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN",
      "\tmap NewBarkTown, TILESET_JOHTO, TOWN, LANDMARK_NEW_BARK_TOWN, MUSIC_NEW_BARK_TOWN, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN",
    ].join("\n");
    expect(parseMapHeaders(text)).toEqual([
      {
        name: "OlivinePokecenter1F",
        group: 1,
        number: 1,
        tileset: "TILESET_POKECENTER",
        environment: "INDOOR",
        landmark: "LANDMARK_OLIVINE_CITY",
        music: "MUSIC_POKEMON_CENTER",
        phoneFlag: "FALSE",
        palette: "PALETTE_DAY",
        fishGroup: "FISHGROUP_SHORE",
      },
      {
        name: "Route26",
        group: 2,
        number: 1,
        tileset: "TILESET_JOHTO",
        environment: "ROUTE",
        landmark: "LANDMARK_ROUTE_26",
        music: "MUSIC_ROUTE_26",
        phoneFlag: "FALSE",
        palette: "PALETTE_AUTO",
        fishGroup: "FISHGROUP_OCEAN",
      },
      {
        name: "NewBarkTown",
        group: 2,
        number: 2,
        tileset: "TILESET_JOHTO",
        environment: "TOWN",
        landmark: "LANDMARK_NEW_BARK_TOWN",
        music: "MUSIC_NEW_BARK_TOWN",
        phoneFlag: "FALSE",
        palette: "PALETTE_AUTO",
        fishGroup: "FISHGROUP_OCEAN",
      },
    ]);
  });

  it("strips a trailing comment on a map header line -- the fishGroup arg is not corrupted", () => {
    const text = [
      "MapGroupPointers::",
      "\tdw MapGroup_Foo         ;  1",
      "\tassert_table_length NUM_MAP_GROUPS",
      "",
      "MapGroup_Foo:",
      "\tmap FooTown, TILESET_JOHTO, TOWN, LANDMARK_FOO, MUSIC_FOO, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN ; comment",
    ].join("\n");
    const [header] = parseMapHeaders(text);
    expect(header?.fishGroup).toBe("FISHGROUP_OCEAN");
  });

  it("keeps a compound expression argument intact (never bare-word matches)", () => {
    const text = [
      "MapGroupPointers::",
      "\tdw MapGroup_Goldenrod   ;  1",
      "\tassert_table_length NUM_MAP_GROUPS",
      "",
      "MapGroup_Goldenrod:",
      "\tmap RadioTower1F, TILESET_RADIO_TOWER, INDOOR, LANDMARK_RADIO_TOWER, RADIO_TOWER_MUSIC | MUSIC_GOLDENROD_CITY, TRUE, PALETTE_DAY, FISHGROUP_SHORE",
    ].join("\n");
    const [header] = parseMapHeaders(text);
    expect(header?.music).toBe("RADIO_TOWER_MUSIC | MUSIC_GOLDENROD_CITY");
  });

  it("skips the MACRO...ENDM map macro definition", () => {
    const text = [
      "MACRO map",
      ";\\1: map name",
      "\tdb BANK(\\1_MapAttributes), \\2, \\3",
      "ENDM",
      "",
      "MapGroupPointers::",
      "\tdw MapGroup_Foo         ;  1",
      "\tassert_table_length NUM_MAP_GROUPS",
      "",
      "MapGroup_Foo:",
      "\tmap FooTown, TILESET_JOHTO, TOWN, LANDMARK_FOO, MUSIC_FOO, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN",
    ].join("\n");
    expect(parseMapHeaders(text)).toHaveLength(1);
  });

  it("accepts a final line with no trailing newline", () => {
    const text = [
      "MapGroupPointers::",
      "\tdw MapGroup_Foo         ;  1",
      "\tassert_table_length NUM_MAP_GROUPS",
      "",
      "MapGroup_Foo:",
      "\tmap FooTown, TILESET_JOHTO, TOWN, LANDMARK_FOO, MUSIC_FOO, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN",
    ].join("\n");
    expect(parseMapHeaders(text)).toHaveLength(1);
  });
});

describe("loadGbcMaps / loadLayout join refusals (temp root)", () => {
  let root: string;
  const roots: string[] = [];

  function writeCorpus(files: Record<string, string>) {
    const r = mkdtempSync(join(tmpdir(), "pokemap-gbc-map-"));
    roots.push(r);
    for (const [rel, content] of Object.entries(files)) {
      const full = join(r, rel);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, content);
    }
    return r;
  }

  const baseFiles = (overrides: Partial<Record<string, string>> = {}) => ({
    "constants/map_constants.asm": [
      "\tnewgroup FOO                                                  ;  1",
      "\tmap_const FOO_TOWN,                                     4,  4 ;  1",
      "\tendgroup",
    ].join("\n"),
    "data/maps/attributes.asm": "\tmap_attributes FooTown, FOO_TOWN, $00, 0",
    "data/maps/maps.asm": [
      "MapGroupPointers::",
      "\tdw MapGroup_Foo         ;  1",
      "\tassert_table_length NUM_MAP_GROUPS",
      "",
      "MapGroup_Foo:",
      "\tmap FooTown, TILESET_JOHTO, TOWN, LANDMARK_FOO, MUSIC_FOO, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN",
    ].join("\n"),
    "data/maps/blocks.asm": ['FooTown_Blocks:', '\tINCBIN "maps/FooTown.blk"'].join("\n"),
    "maps/FooTown.blk": "",
    ...overrides,
  });

  afterAll(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true });
  });

  it("throws naming the root and the expected file when data/maps/attributes.asm is missing (I1 root guard)", () => {
    root = mkdtempSync(join(tmpdir(), "pokemap-gbc-map-empty-"));
    roots.push(root);
    expect(() => loadGbcMaps(root)).toThrow(root);
    expect(() => loadGbcMaps(root)).toThrow("attributes.asm");
  });

  it("normalizes a root with a trailing slash or backslash (M2)", () => {
    root = writeCorpus(baseFiles());
    writeFileSync(join(root, "maps/FooTown.blk"), Buffer.alloc(16, 7));
    const withTrailingSlash = `${root}/`;
    const withBackslashes = `${root.replace(/\//g, "\\")}\\`;
    expect(loadGbcMaps(withTrailingSlash).map("FooTown").blkPath).toBe("maps/FooTown.blk");
    expect(loadGbcMaps(withBackslashes).map("FooTown").blkPath).toBe("maps/FooTown.blk");
    const { layout } = loadLayout(withBackslashes, loadGbcMaps(root).map("FooTown"));
    expect(layout.writable).toBe(true);
  });

  it("loads a single self-consistent map with all fields joined", () => {
    root = writeCorpus(baseFiles());
    const { maps, map } = loadGbcMaps(root);
    expect(maps).toHaveLength(1);
    expect(map("FooTown")).toEqual(maps[0]);
    expect(maps[0]).toEqual({
      name: "FooTown",
      constName: "FOO_TOWN",
      group: 1,
      number: 1,
      width: 4,
      height: 4,
      blkPath: "maps/FooTown.blk",
      tileset: "TILESET_JOHTO",
      environment: "TOWN",
      landmark: "LANDMARK_FOO",
      music: "MUSIC_FOO",
      phoneFlag: "FALSE",
      palette: "PALETTE_AUTO",
      fishGroup: "FISHGROUP_OCEAN",
      border: 0,
      connectionFlags: "0",
      connections: [],
    });
  });

  it("map(name) throws, naming the map, on a miss", () => {
    root = writeCorpus(baseFiles());
    const { map } = loadGbcMaps(root);
    expect(() => map("NoSuchMap")).toThrow(/NoSuchMap/);
  });

  it("refuses (throws, naming the map) when attributes references a name absent from maps.asm", () => {
    // maps.asm has no headers at all here (rather than the baseFiles default,
    // which would make FooTown's header an orphan and trip that refusal
    // first) so this exercises the header-miss join specifically.
    root = writeCorpus(
      baseFiles({
        "data/maps/attributes.asm": "\tmap_attributes GhostTown, FOO_TOWN, $00, 0",
        "data/maps/maps.asm": "",
      }),
    );
    expect(() => loadGbcMaps(root)).toThrow(/GhostTown/);
  });

  it("refuses (throws, naming the map) when attributes' constName is absent from map_constants.asm", () => {
    // map_constants.asm is empty here (rather than the baseFiles default,
    // which would make FOO_TOWN an orphan const and trip that refusal first)
    // so this exercises the constName-miss join specifically.
    root = writeCorpus(
      baseFiles({
        "data/maps/attributes.asm": "\tmap_attributes FooTown, NO_SUCH_CONST, $00, 0",
        "constants/map_constants.asm": "",
      }),
    );
    expect(() => loadGbcMaps(root)).toThrow(/FooTown/);
    expect(() => loadGbcMaps(root)).toThrow(/NO_SUCH_CONST/);
  });

  it("refuses (throws, naming the map) when no <Name>_Blocks label exists in blocks.asm", () => {
    root = writeCorpus(
      baseFiles({
        "data/maps/blocks.asm": ['OtherTown_Blocks:', '\tINCBIN "maps/Other.blk"'].join("\n"),
      }),
    );
    expect(() => loadGbcMaps(root)).toThrow(/FooTown/);
  });

  it("refuses (throws, naming it) a map_const with no map_attributes counterpart (orphan, G4 both directions)", () => {
    root = writeCorpus(
      baseFiles({
        "constants/map_constants.asm": [
          "\tnewgroup FOO                                                  ;  1",
          "\tmap_const FOO_TOWN,                                     4,  4 ;  1",
          "\tmap_const ORPHAN_TOWN,                                  4,  4 ;  2",
          "\tendgroup",
        ].join("\n"),
      }),
    );
    expect(() => loadGbcMaps(root)).toThrow(/ORPHAN_TOWN/);
  });

  it("refuses (throws, naming it) a maps.asm header with no map_attributes counterpart (orphan, G4 both directions)", () => {
    root = writeCorpus(
      baseFiles({
        "data/maps/maps.asm": [
          "MapGroupPointers::",
          "\tdw MapGroup_Foo         ;  1",
          "\tassert_table_length NUM_MAP_GROUPS",
          "",
          "MapGroup_Foo:",
          "\tmap FooTown, TILESET_JOHTO, TOWN, LANDMARK_FOO, MUSIC_FOO, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN",
          "\tmap OrphanTown, TILESET_JOHTO, TOWN, LANDMARK_FOO, MUSIC_FOO, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN",
        ].join("\n"),
      }),
    );
    expect(() => loadGbcMaps(root)).toThrow(/OrphanTown/);
  });

  it("refuses (throws, naming it) a duplicate constName in map_constants.asm instead of silently overwriting", () => {
    root = writeCorpus(
      baseFiles({
        "constants/map_constants.asm": [
          "\tnewgroup FOO                                                  ;  1",
          "\tmap_const FOO_TOWN,                                     4,  4 ;  1",
          "\tmap_const FOO_TOWN,                                     5,  5 ;  2",
          "\tendgroup",
        ].join("\n"),
      }),
    );
    expect(() => loadGbcMaps(root)).toThrow(/FOO_TOWN/);
  });

  it("refuses (throws, naming it) a duplicate name in maps.asm instead of silently overwriting", () => {
    // The surviving (last, per plain Map dedup) FooTown header is made
    // fully consistent with map_const (number 2, via the Placeholder
    // shift) and attributes/blocks, so this only throws via the explicit
    // duplicate check -- not incidentally via a group/number mismatch or a
    // Placeholder-related join miss.
    root = writeCorpus(
      baseFiles({
        "constants/map_constants.asm": [
          "\tnewgroup FOO                                                  ;  1",
          "\tmap_const PLACEHOLDER_TOWN,                              4,  4 ;  1",
          "\tmap_const FOO_TOWN,                                      4,  4 ;  2",
          "\tendgroup",
        ].join("\n"),
        "data/maps/attributes.asm": [
          "\tmap_attributes FooTown, FOO_TOWN, $00, 0",
          "\tmap_attributes Placeholder, PLACEHOLDER_TOWN, $00, 0",
        ].join("\n"),
        "data/maps/maps.asm": [
          "MapGroupPointers::",
          "\tdw MapGroup_Foo         ;  1",
          "\tassert_table_length NUM_MAP_GROUPS",
          "",
          "MapGroup_Foo:",
          "\tmap FooTown, TILESET_JOHTO, TOWN, LANDMARK_FOO, MUSIC_FOO, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN",
          "\tmap FooTown, TILESET_JOHTO, TOWN, LANDMARK_FOO, MUSIC_FOO, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN",
        ].join("\n"),
      }),
    );
    expect(() => loadGbcMaps(root)).toThrow(/FooTown/);
  });

  it("refuses (throws, naming it) a duplicate name in attributes.asm instead of silently overwriting", () => {
    root = writeCorpus(
      baseFiles({
        "data/maps/attributes.asm": [
          "\tmap_attributes FooTown, FOO_TOWN, $00, 0",
          "\tmap_attributes FooTown, FOO_TOWN, $00, 0",
        ].join("\n"),
      }),
    );
    expect(() => loadGbcMaps(root)).toThrow(/FooTown/);
  });

  it("refuses (throws, naming the map and both values) on a group/number mismatch between maps.asm and map_constants.asm", () => {
    // Placeholder is a fully consistent second map (own attributes entry,
    // own map_const, not referenced by maps.asm) so it isn't an orphan and
    // isn't reached before FooTown -- it exists purely to shift FOO_TOWN's
    // number in map_constants.asm to 2 while its maps.asm header stays 1.
    root = writeCorpus(
      baseFiles({
        "constants/map_constants.asm": [
          "\tnewgroup FOO                                                  ;  1",
          "\tmap_const PLACEHOLDER_TOWN,                              4,  4 ;  1",
          "\tmap_const FOO_TOWN,                                      4,  4 ;  2",
          "\tendgroup",
        ].join("\n"),
        "data/maps/attributes.asm": [
          "\tmap_attributes FooTown, FOO_TOWN, $00, 0",
          "\tmap_attributes Placeholder, PLACEHOLDER_TOWN, $00, 0",
        ].join("\n"),
      }),
    );
    // FOO_TOWN is now number 2 in map_constants.asm, but header says number 1.
    expect(() => loadGbcMaps(root)).toThrow(/FooTown/);
    expect(() => loadGbcMaps(root)).toThrow(/number 1/);
    expect(() => loadGbcMaps(root)).toThrow(/number 2/);
  });

  it("loadLayout: exact-size .blk is writable with no defects", () => {
    root = writeCorpus(baseFiles());
    writeFileSync(join(root, "maps/FooTown.blk"), Buffer.alloc(16, 7));
    const { maps } = loadGbcMaps(root);
    const { layout, defects } = loadLayout(root, maps[0]!);
    expect(defects).toEqual([]);
    expect(layout.writable).toBe(true);
    expect(layout.blocks).toHaveLength(16);
    expect(layout.blocks.every((b) => b.metatileId === 7)).toBe(true);
  });

  it("loadLayout: oversize .blk loads first w*h bytes, flags a defect, and is not writable", () => {
    const oversized = Buffer.alloc(40);
    for (let i = 0; i < oversized.length; i++) oversized[i] = i;
    root = writeCorpus(baseFiles());
    writeFileSync(join(root, "maps/FooTown.blk"), oversized);
    const { maps } = loadGbcMaps(root);
    const { layout, defects } = loadLayout(root, maps[0]!);
    expect(layout.writable).toBe(false);
    expect(layout.blocks).toHaveLength(16);
    expect(layout.blocks.map((b) => b.metatileId)).toEqual([...Array(16).keys()]);
    expect(defects).toHaveLength(1);
    expect(defects[0]!.file).toBe("maps/FooTown.blk");
    expect(defects[0]!.message).toMatch(/40/);
    expect(defects[0]!.message).toMatch(/16/);
  });

  it("loadLayout: undersize .blk refuses (throws) rather than guessing", () => {
    root = writeCorpus(baseFiles());
    writeFileSync(join(root, "maps/FooTown.blk"), Buffer.alloc(3));
    const { maps } = loadGbcMaps(root);
    expect(() => loadLayout(root, maps[0]!)).toThrow(/FooTown\.blk/);
    expect(() => loadLayout(root, maps[0]!)).toThrow(/3/);
  });
});

describe("corpus", () => {
  let mapConstantsAsm: string;
  let attributesAsm: string;
  let mapsAsm: string;

  beforeAll(() => {
    if (!hasGbcProject(GBC_SUBJECT_ROOT)) return;
    mapConstantsAsm = readFileSync(`${GBC_SUBJECT_ROOT}/constants/map_constants.asm`, "utf8");
    attributesAsm = readFileSync(`${GBC_SUBJECT_ROOT}/data/maps/attributes.asm`, "utf8");
    mapsAsm = readFileSync(`${GBC_SUBJECT_ROOT}/data/maps/maps.asm`, "utf8");
  });

  itWithGbcCorpus("every reference-family root parses to a loadable, self-consistent map set", () => {
    const roots = gbcCorpusRoots();
    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) {
      const { maps } = loadGbcMaps(root);
      expect(maps.length).toBeGreaterThan(0);
    }
  });

  itWithGbcCorpus("391 maps, 26 groups, 142 connections total", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    expect(maps).toHaveLength(391);
    expect(new Set(maps.map((m) => m.group)).size).toBe(26);
    expect(maps.reduce((n, m) => n + m.connections.length, 0)).toBe(142);
  });

  itWithGbcCorpus("257 distinct blkPaths; 23 shared by 157 maps total; House1.blk used by 50 maps", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    expect(maps).toHaveLength(391);
    const byBlk = new Map<string, number>();
    for (const m of maps) byBlk.set(m.blkPath, (byBlk.get(m.blkPath) ?? 0) + 1);
    expect(byBlk.size).toBe(257);
    const shared = [...byBlk.entries()].filter(([, n]) => n > 1);
    expect(shared).toHaveLength(23);
    expect(shared.reduce((n, [, c]) => n + c, 0)).toBe(157);
    expect(byBlk.get("maps/House1.blk")).toBe(50);
  });

  itWithGbcCorpus("border $00 on 272 maps", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    expect(maps).toHaveLength(391);
    expect(maps.filter((m) => m.border === 0)).toHaveLength(272);
  });

  itWithGbcCorpus("NewBarkTown: full record matches the real corpus", () => {
    const { map } = loadGbcMaps(GBC_SUBJECT_ROOT);
    const m = map("NewBarkTown");
    expect(m.group).toBe(24);
    expect(m.number).toBe(4);
    expect(m.width).toBe(10);
    expect(m.height).toBe(9);
    expect(m.blkPath).toBe("maps/NewBarkTown.blk");
    expect(m.tileset).toBe("TILESET_JOHTO");
    expect(m.environment).toBe("TOWN");
    expect(m.landmark).toBe("LANDMARK_NEW_BARK_TOWN");
    expect(m.music).toBe("MUSIC_NEW_BARK_TOWN");
    expect(m.phoneFlag).toBe("FALSE");
    expect(m.palette).toBe("PALETTE_AUTO");
    expect(m.fishGroup).toBe("FISHGROUP_OCEAN");
    expect(m.border).toBe(5);
    expect(m.connections).toEqual([
      { direction: "west", targetName: "Route29", targetConst: "ROUTE_29", offset: 0 },
      { direction: "east", targetName: "Route27", targetConst: "ROUTE_27", offset: 0 },
    ]);
  });

  itWithGbcCorpus("AzaleaTown: west connection to Route34, offset -18", () => {
    const { map } = loadGbcMaps(GBC_SUBJECT_ROOT);
    const west = map("AzaleaTown").connections.find((c) => c.direction === "west");
    expect(west).toEqual({ direction: "west", targetName: "Route34", targetConst: "ROUTE_34", offset: -18 });
  });

  itWithGbcCorpus("RadioTower1F music is exactly the compound expression", () => {
    const { map } = loadGbcMaps(GBC_SUBJECT_ROOT);
    expect(map("RadioTower1F").music).toBe("RADIO_TOWER_MUSIC | MUSIC_GOLDENROD_CITY");
  });

  itWithGbcCorpus("within every shared blkPath group, all maps agree on width/height/tileset", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    expect(maps).toHaveLength(391);
    const byBlk = new Map<string, typeof maps>();
    for (const m of maps) byBlk.set(m.blkPath, [...(byBlk.get(m.blkPath) ?? []), m]);
    let sharedGroups = 0;
    for (const group of byBlk.values()) {
      if (group.length < 2) continue;
      sharedGroups++;
      const [first, ...rest] = group;
      for (const m of rest) {
        expect(m.width).toBe(first!.width);
        expect(m.height).toBe(first!.height);
        expect(m.tileset).toBe(first!.tileset);
      }
    }
    expect(sharedGroups).toBe(23);
  });

  itWithGbcCorpus("loadLayout over every map: exactly 2 defects total, both not writable with 135 blocks", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    expect(maps).toHaveLength(391);
    const allDefects: { name: string; message: string }[] = [];
    const seenBlk = new Set<string>();
    let writableCount = 0;
    let notWritableCount = 0;
    for (const m of maps) {
      if (seenBlk.has(m.blkPath)) continue; // .blk is per-file, not per-map; load once
      seenBlk.add(m.blkPath);
      const { layout, defects } = loadLayout(GBC_SUBJECT_ROOT, m);
      for (const d of defects) allDefects.push({ name: m.name, message: d.message });
      if (layout.writable) {
        writableCount++;
      } else {
        notWritableCount++;
        expect(layout.blocks).toHaveLength(135);
      }
    }
    expect(seenBlk.size).toBe(257);
    expect(allDefects).toHaveLength(2);
    expect(notWritableCount).toBe(2);
    expect(writableCount).toBe(255);
    expect(allDefects.some((d) => d.name === "CeruleanCave2F")).toBe(true);
    expect(allDefects.some((d) => d.name === "CeruleanCaveB1")).toBe(true);
    for (const d of allDefects) {
      expect(d.message).toMatch(/400/);
      expect(d.message).toMatch(/135/);
    }
  });

  itWithGbcCorpus("NewBarkTown layout: first 20 metatile ids match the real .blk", () => {
    const { map } = loadGbcMaps(GBC_SUBJECT_ROOT);
    const { layout } = loadLayout(GBC_SUBJECT_ROOT, map("NewBarkTown"));
    expect(layout.blocks.slice(0, 20).map((b) => b.metatileId)).toEqual([
      0x05, 0x05, 0x18, 0x1f, 0x19, 0x05, 0x05, 0x05, 0x05, 0x05,
      0x05, 0x47, 0x1c, 0x77, 0x1e, 0x05, 0x18, 0x19, 0x05, 0x05,
    ]);
  });

  itWithGbcCorpus("raw file counts back the parser: 391 map_const / map_attributes / map header lines", () => {
    // Guards against a vacuous pass: assert the raw source really has the
    // records the parser is expected to find, independent of the parser.
    expect(mapConstantsAsm.match(/^\s*map_const\s/gm)).toHaveLength(391);
    expect(attributesAsm.match(/^\s*map_attributes\s/gm)).toHaveLength(391);
    expect(mapsAsm.match(/^\s*map\s+[A-Za-z]/gm)).toHaveLength(391);
  });
});
