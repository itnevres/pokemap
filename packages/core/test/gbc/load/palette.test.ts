import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  rgb5to8,
  parsePalColors,
  parseEnvironmentColorBlocks,
  parseEnvironmentColorPointers,
  buildEnvironmentBlockMap,
  resolveEnvironmentPalette,
  parseEnvironmentConsts,
  parseMapPaletteConsts,
  parseClockConsts,
  parseBrightnessRows,
  parseBrightnessLevels,
  resolveTimeOfDayPal,
  resolveMapPalettes,
  loadPaletteTables,
  resolveFromTables,
  type BrightnessLevels,
} from "../../../src/gbc/load/palette.js";
import { loadGbcMaps } from "../../../src/gbc/load/map.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";
import type { RGB } from "../../../src/model/types.js";

/** Local mirror of the 5-bit -> 8-bit formula, used only to build expected
 *  values from hand-read source lines -- the formula itself is separately
 *  pinned against fixed inputs below. */
const c8 = (n: number): number => (n << 3) | (n >> 2);
const rgb = (r: number, g: number, b: number): RGB => ({ r: c8(r), g: c8(g), b: c8(b) });

describe("rgb5to8", () => {
  it("maps 0 -> 0, 31 -> 255, 16 -> 132", () => {
    expect(rgb5to8(0)).toBe(0);
    expect(rgb5to8(31)).toBe(255);
    expect(rgb5to8(16)).toBe(132);
  });
});

describe("parsePalColors", () => {
  it("parses a line with 1 RGB triple", () => {
    expect(parsePalColors("\tRGB 25, 24, 23\n")).toEqual([rgb(25, 24, 23)]);
  });

  it("parses a line with 4 RGB triples (bg_tiles.pal shape)", () => {
    const text = "\tRGB 28,31,16, 21,21,21, 13,13,13, 07,07,07 ; gray\n";
    expect(parsePalColors(text)).toEqual([rgb(28, 31, 16), rgb(21, 21, 21), rgb(13, 13, 13), rgb(7, 7, 7)]);
  });

  it("skips section-header comments and blank lines", () => {
    const text = "; morn\n\n\tRGB 01,01,02\n; day\n\tRGB 03,03,04\n";
    expect(parsePalColors(text)).toEqual([rgb(1, 1, 2), rgb(3, 3, 4)]);
  });

  it("refuses an RGB line whose arg count isn't a multiple of 3", () => {
    expect(() => parsePalColors("\tRGB 1,2,3,4\n")).toThrow(/multiple of 3/);
  });
});

describe("parseEnvironmentConsts / parseMapPaletteConsts / parseClockConsts (isolated const_def blocks)", () => {
  // Mirrors constants/map_data_constants.asm's real shape: environment enum
  // immediately followed by the palette enum, each closed by its own
  // "DEF NUM_<X> EQU" marker line.
  const mapDataConstantsSample = [
    "; map environments",
    "\tconst_def 1",
    "\tconst TOWN",
    "\tconst ROUTE",
    "DEF NUM_ENVIRONMENTS EQU const_value - 1",
    "",
    "; map palettes",
    "\tconst_def",
    "\tconst PALETTE_AUTO",
    "\tconst PALETTE_DAY",
    "DEF NUM_MAP_PALETTES EQU const_value",
  ].join("\n");

  it("isolates the environment enum from the neighboring palette enum", () => {
    expect(parseEnvironmentConsts(mapDataConstantsSample)).toEqual(new Map([["TOWN", 1], ["ROUTE", 2]]));
  });

  it("isolates the palette enum from the preceding environment enum", () => {
    expect(parseMapPaletteConsts(mapDataConstantsSample)).toEqual(new Map([["PALETTE_AUTO", 0], ["PALETTE_DAY", 1]]));
  });

  it("parseClockConsts isolates a const_def block the same way (wram_constants.asm shape)", () => {
    const sample = ["; wTimeOfDay::", "\tconst_def", "\tconst MORN_F", "\tconst DAY_F", "\tconst NITE_F", "\tconst DARKNESS_F", "DEF NUM_DAYTIMES EQU const_value"].join(
      "\n",
    );
    expect(parseClockConsts(sample)).toEqual(
      new Map([
        ["MORN_F", 0],
        ["DAY_F", 1],
        ["NITE_F", 2],
        ["DARKNESS_F", 3],
      ]),
    );
  });

  it("refuses when the end marker is absent", () => {
    expect(() => parseEnvironmentConsts("const_def 1\nconst TOWN\n")).toThrow(/end marker/);
  });
});

describe("parseEnvironmentColorPointers / buildEnvironmentBlockMap", () => {
  it("collects dw .Name lines in order, ignoring the table's other directives", () => {
    const text = [
      "EnvironmentColorsPointers:",
      "\ttable_width 2, EnvironmentColorsPointers",
      "\tdw .OutdoorColors ; unused",
      "\tdw .OutdoorColors ; TOWN",
      "\tdw .IndoorColors  ; INDOOR",
      "\tassert_table_length NUM_ENVIRONMENTS + 1",
    ].join("\n");
    expect(parseEnvironmentColorPointers(text)).toEqual(["OutdoorColors", "OutdoorColors", "IndoorColors"]);
  });

  it("indexes the pointer list by each environment's own numeric value", () => {
    const pointerList = ["Unused", "Outdoor", "Outdoor", "Indoor"];
    const envConsts = new Map([
      ["TOWN", 1],
      ["ROUTE", 2],
      ["INDOOR", 3],
    ]);
    expect(buildEnvironmentBlockMap(pointerList, envConsts)).toEqual(
      new Map([
        ["TOWN", "Outdoor"],
        ["ROUTE", "Outdoor"],
        ["INDOOR", "Indoor"],
      ]),
    );
  });

  it("refuses an environment whose value has no pointer-table entry", () => {
    expect(() => buildEnvironmentBlockMap(["Unused"], new Map([["TOWN", 5]]))).toThrow(/no EnvironmentColorsPointers entry/);
  });
});

describe("parseEnvironmentColorBlocks / resolveEnvironmentPalette", () => {
  const bgTilesPal: RGB[][] = Array.from({ length: 0x2a }, (_, i) => [
    { r: i, g: i, b: i },
    { r: i, g: i, b: i },
    { r: i, g: i, b: i },
    { r: i, g: i, b: i },
  ]);
  const envBlockMap = new Map([["TOWN", "OutdoorColors"]]);

  it("parses db rows under a dotted label into a numbers-per-row array", () => {
    const text = [".OutdoorColors:", "\tdb $00, $01, $02, $28, $04, $05, $06, $07 ; morn", "\tdb $08, $09, $0a, $28, $0c, $0d, $0e, $0f ; day"].join(
      "\n",
    );
    const blocks = parseEnvironmentColorBlocks(text);
    expect(blocks.get("OutdoorColors")).toEqual([
      [0x00, 0x01, 0x02, 0x28, 0x04, 0x05, 0x06, 0x07],
      [0x08, 0x09, 0x0a, 0x28, 0x0c, 0x0d, 0x0e, 0x0f],
    ]);
  });

  it("resolves a row to 8 bg_tiles.pal palettes by index", () => {
    const blocks = new Map([["OutdoorColors", [[0, 1, 2, 3, 4, 5, 6, 7]]]]);
    const result = resolveEnvironmentPalette(envBlockMap, blocks, bgTilesPal, "TOWN", 0);
    expect(result).toEqual([bgTilesPal[0], bgTilesPal[1], bgTilesPal[2], bgTilesPal[3], bgTilesPal[4], bgTilesPal[5], bgTilesPal[6], bgTilesPal[7]]);
  });

  it("refuses (missing-dark-row) when the requested time index has no row -- synthetic 3-row block, matching a shape the findings doc (wrongly) claimed IndoorColors has in the real file", () => {
    const blocks = new Map([["IndoorColors", [[0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7]]]]);
    const indoorMap = new Map([["INDOOR", "IndoorColors"]]);
    expect(() => resolveEnvironmentPalette(indoorMap, blocks, bgTilesPal, "INDOOR", 3)).toThrow(/no row for time-of-day index 3/);
  });

  it("refuses an unknown environment", () => {
    expect(() => resolveEnvironmentPalette(new Map(), new Map(), bgTilesPal, "NOT_A_REAL_ENV", 0)).toThrow(/unknown environment/);
  });

  it("refuses a row index beyond bg_tiles.pal's own length", () => {
    const blocks = new Map([["OutdoorColors", [[0, 1, 2, 3, 4, 5, 6, 999]]]]);
    expect(() => resolveEnvironmentPalette(envBlockMap, blocks, bgTilesPal, "TOWN", 0)).toThrow(/999/);
  });
});

describe("parseBrightnessRows / parseBrightnessLevels (engine/tilesets/timeofday_pals.asm)", () => {
  const clockConsts = new Map([
    ["MORN_F", 0],
    ["DAY_F", 1],
    ["NITE_F", 2],
    ["DARKNESS_F", 3],
  ]);

  it("resolves each dc row's constant names to numbers, in source column order", () => {
    const text = "\tdc DARKNESS_F, NITE_F, DAY_F, MORN_F ; PALETTE_AUTO\n\tdc DAY_F, DAY_F, DAY_F, DAY_F ; PALETTE_DAY\n";
    expect(parseBrightnessRows(text, clockConsts)).toEqual([
      [3, 2, 1, 0],
      [1, 1, 1, 1],
    ]);
  });

  it("refuses a dc row with the wrong arg count", () => {
    expect(() => parseBrightnessRows("\tdc DAY_F, DAY_F, DAY_F\n", clockConsts)).toThrow(/expected 4/);
  });

  it("refuses an unresolvable clock constant name", () => {
    expect(() => parseBrightnessRows("\tdc BOGUS_F, DAY_F, DAY_F, DAY_F\n", clockConsts)).toThrow(/BOGUS_F/);
  });

  it("parses .UsedFlash's inline broadcast and DARKNESS_PALSET's EQU expression by name, not by hardcoded value", () => {
    const timeofdayPalsText = [
      ".BrightnessLevels:",
      "\tdc DARKNESS_F, NITE_F, DAY_F, MORN_F ; PALETTE_AUTO",
      "\tdc DAY_F, DAY_F, DAY_F, DAY_F ; PALETTE_DAY",
      "\tdc NITE_F, NITE_F, NITE_F, NITE_F ; PALETTE_NITE",
      "\tdc MORN_F, MORN_F, MORN_F, MORN_F ; PALETTE_MORN",
      "\tdc DARKNESS_F, DARKNESS_F, DARKNESS_F, DARKNESS_F ; PALETTE_DARK",
      "",
      ".UsedFlash:",
      "\tld a, (NITE_F << 6) | (NITE_F << 4) | (NITE_F << 2) | NITE_F",
      "\tld [wTimeOfDayPalset], a",
      "\tret",
      "",
      "GetTimePalette:",
    ].join("\n");
    const wramConstantsText = "DEF DARKNESS_PALSET EQU (DARKNESS_F << 6) | (DARKNESS_F << 4) | (DARKNESS_F << 2) | DARKNESS_F\n";

    const levels = parseBrightnessLevels(timeofdayPalsText, wramConstantsText, clockConsts);
    expect(levels.flashPalette).toBe(2); // NITE_F
    expect(levels.noFlashPalette).toBe(3); // DARKNESS_F
    expect(levels.rows[0]).toEqual([3, 2, 1, 0]); // PALETTE_AUTO row
  });
});

describe("resolveTimeOfDayPal", () => {
  const levels: BrightnessLevels = {
    rows: [
      [3, 2, 1, 0], // index 0: AUTO-shaped (identity)
      [1, 1, 1, 1], // index 1: DAY-shaped (fixed)
      [2, 2, 2, 2], // index 2: NITE-shaped (fixed)
      [0, 0, 0, 0], // index 3: MORN-shaped (fixed)
    ],
    flashPalette: 2,
    noFlashPalette: 3,
  };
  const darkPaletteIndex = 4; // deliberately outside `rows` -- never indexed, since DARK special-cases first

  it("an AUTO-shaped row follows the clock (column = 3 - clockIndex)", () => {
    expect(resolveTimeOfDayPal(levels, 0, darkPaletteIndex, 0, true)).toBe(0); // MORN
    expect(resolveTimeOfDayPal(levels, 0, darkPaletteIndex, 1, true)).toBe(1); // DAY
    expect(resolveTimeOfDayPal(levels, 0, darkPaletteIndex, 2, true)).toBe(2); // NITE
  });

  it("a fixed-shaped row ignores the clock", () => {
    expect(resolveTimeOfDayPal(levels, 1, darkPaletteIndex, 2, true)).toBe(1);
    expect(resolveTimeOfDayPal(levels, 2, darkPaletteIndex, 0, true)).toBe(2);
    expect(resolveTimeOfDayPal(levels, 3, darkPaletteIndex, 2, true)).toBe(0);
  });

  it("the dark palette index special-cases to flash/no-flash, never touching rows", () => {
    expect(resolveTimeOfDayPal(levels, darkPaletteIndex, darkPaletteIndex, 1, true)).toBe(2); // flashPalette
    expect(resolveTimeOfDayPal(levels, darkPaletteIndex, darkPaletteIndex, 1, false)).toBe(3); // noFlashPalette
  });

  it("refuses a palette index with no row", () => {
    expect(() => resolveTimeOfDayPal(levels, 99, darkPaletteIndex, 0, true)).toThrow(/no \.BrightnessLevels row/);
  });
});

describe("resolveMapPalettes corpus", () => {
  itWithGbcCorpus("BrightnessLevels rows pack to e4,55,aa,00,ff,e4,e4,e4 (hand-verified from the real dc lines)", () => {
    const wramConstantsText = readFileSync(`${GBC_SUBJECT_ROOT}/constants/wram_constants.asm`, "utf8");
    const clockConsts = parseClockConsts(wramConstantsText);
    const timeofdayPalsText = readFileSync(`${GBC_SUBJECT_ROOT}/engine/tilesets/timeofday_pals.asm`, "utf8");
    const { rows } = parseBrightnessLevels(timeofdayPalsText, wramConstantsText, clockConsts);
    const packed = rows.map(([a, b, c, d]) => ((a! << 6) | (b! << 4) | (c! << 2) | d!).toString(16).padStart(2, "0"));
    // .BrightnessLevels, in source order:
    //   dc DARKNESS_F, NITE_F,     DAY_F,      MORN_F     ; PALETTE_AUTO      -> e4
    //   dc DAY_F,      DAY_F,      DAY_F,      DAY_F      ; PALETTE_DAY       -> 55
    //   dc NITE_F,     NITE_F,     NITE_F,     NITE_F     ; PALETTE_NITE      -> aa
    //   dc MORN_F,     MORN_F,     MORN_F,     MORN_F     ; PALETTE_MORN      -> 00
    //   dc DARKNESS_F, DARKNESS_F, DARKNESS_F, DARKNESS_F ; PALETTE_DARK      -> ff
    //   dc DARKNESS_F, NITE_F,     DAY_F,      MORN_F                        -> e4 (dead padding, x3)
    expect(packed).toEqual(["e4", "55", "aa", "00", "ff", "e4", "e4", "e4"]);
  });

  itWithGbcCorpus("NewBarkTown (JOHTO, TOWN, PALETTE_AUTO, group 24) at default day", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("NewBarkTown");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map);

    // bg_tiles.pal day row, gray: "RGB 27,31,27, 21,21,21, 13,13,13, 07,07,07 ; gray" (index $08)
    expect(pals[0]).toEqual([rgb(27, 31, 27), rgb(21, 21, 21), rgb(13, 13, 13), rgb(7, 7, 7)]);
    // OutdoorColors day row: "db $08, $09, $0a, $28, $0c, $0d, $0e, $0f ; day" -- slot 3 (WATER) is $28,
    // bg_tiles.pal "overworld water": "RGB 23,23,31, 18,19,31, 13,12,31, 07,07,07 ; morn/day"
    expect(pals[3]).toEqual([rgb(23, 23, 31), rgb(18, 19, 31), rgb(13, 12, 31), rgb(7, 7, 7)]);
    // roofs.pal group 24 (New Bark): "RGB 20,31,14, 11,23,05 ; morn/day" overwrites ROOF colors 1-2
    // (bg_tiles.pal day roof entry $0e supplies colors 0 and 3: "RGB 27,31,27, 15,31,31, 05,17,31, 07,07,07 ; roof")
    expect(pals[6]).toEqual([rgb(27, 31, 27), rgb(20, 31, 14), rgb(11, 23, 5), rgb(7, 7, 7)]);
  });

  itWithGbcCorpus("NewBarkTown at time: nite -> nite water + nite roof", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("NewBarkTown");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map, { time: "nite" });

    // OutdoorColors nite row: "db $10, $11, $12, $29, $14, $15, $16, $17 ; nite" -- slot 3 is $29,
    // bg_tiles.pal "overworld water" nite: "RGB 15,13,27, 10,09,20, 04,03,18, 00,00,00 ; nite"
    expect(pals[3]).toEqual([rgb(15, 13, 27), rgb(10, 9, 20), rgb(4, 3, 18), rgb(0, 0, 0)]);
    // roofs.pal group 24 nite: "RGB 09,13,08, 06,09,04 ; nite"
    expect(pals[6]![1]).toEqual(rgb(9, 13, 8));
    expect(pals[6]![2]).toEqual(rgb(6, 9, 4));
  });

  itWithGbcCorpus("Route29 (JOHTO, ROUTE, PALETTE_AUTO, group 24) roof at default day matches NewBarkTown's (same group, Outdoor table)", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("Route29");
    expect(map.environment).toBe("ROUTE");
    expect(map.group).toBe(24);
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map);
    // Same roofs.pal group 24 morn/day overlay as NewBarkTown's: "RGB 20,31,14, 11,23,05 ; morn/day"
    expect(pals[6]).toEqual([rgb(27, 31, 27), rgb(20, 31, 14), rgb(11, 23, 5), rgb(7, 7, 7)]);
  });

  itWithGbcCorpus("PlayersNeighborsHouse (TILESET_HOUSE, INDOOR, PALETTE_DAY) uses house.pal verbatim, no roof", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("PlayersNeighborsHouse");
    expect(map.tileset).toBe("TILESET_HOUSE");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map);

    // gfx/tilesets/house.pal, block 0 (gray): "RGB 30, 28, 26" / "RGB 19, 19, 19" / "RGB 13, 13, 13" / "RGB 07, 07, 07"
    expect(pals[0]).toEqual([rgb(30, 28, 26), rgb(19, 19, 19), rgb(13, 13, 13), rgb(7, 7, 7)]);
    // block 6 (roof/glass): "RGB 30, 28, 26" / "RGB 31, 19, 24" / "RGB 16, 13, 03" / "RGB 07, 07, 07"
    expect(pals[6]).toEqual([rgb(30, 28, 26), rgb(31, 19, 24), rgb(16, 13, 3), rgb(7, 7, 7)]);
  });

  itWithGbcCorpus("RadioTower1F (TILESET_RADIO_TOWER, INDOOR) uses radio_tower.pal", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("RadioTower1F");
    expect(map.tileset).toBe("TILESET_RADIO_TOWER");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map);
    // gfx/tilesets/radio_tower.pal, gray block (no section-comment header in this file):
    // "RGB 27, 31, 27" / "RGB 21, 21, 21" / "RGB 13, 13, 13" / "RGB 07, 07, 07"
    // -- differs entirely from pokecom_center.pal's gray, so this kills a
    // RADIO_TOWER -> PokeComPalette label mix-up (reviewer's mutant M4).
    expect(pals[0]).toEqual([rgb(27, 31, 27), rgb(21, 21, 21), rgb(13, 13, 13), rgb(7, 7, 7)]);
  });

  itWithGbcCorpus("BattleTower1F (TILESET_BATTLE_TOWER_INSIDE, INDOOR) uses battle_tower_inside.pal", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("BattleTower1F");
    expect(map.tileset).toBe("TILESET_BATTLE_TOWER_INSIDE");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map);
    // gfx/tilesets/battle_tower_inside.pal, gray block: "RGB 30, 28, 26" / "RGB 19, 19, 19" / "RGB 13, 13, 13" / "RGB 07, 07, 07"
    expect(pals[0]).toEqual([rgb(30, 28, 26), rgb(19, 19, 19), rgb(13, 13, 13), rgb(7, 7, 7)]);
  });

  itWithGbcCorpus("PokecomCenterAdminOfficeMobile (TILESET_POKECOM_CENTER, INDOOR) uses pokecom_center.pal", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("PokecomCenterAdminOfficeMobile");
    expect(map.tileset).toBe("TILESET_POKECOM_CENTER");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map);
    // gfx/tilesets/pokecom_center.pal, gray block: "RGB 30, 28, 26" / "RGB 19, 19, 19" / "RGB 13, 13, 13" / "RGB 07, 07, 07"
    // (identical to battle_tower_inside.pal's gray -- not a distinguishing
    // check on its own, kept for corpus coverage).
    expect(pals[0]).toEqual([rgb(30, 28, 26), rgb(19, 19, 19), rgb(13, 13, 13), rgb(7, 7, 7)]);
    // water block DOES differ from battle_tower_inside.pal's ("RGB 30,28,26, 15,16,31, 09,09,31, 07,07,07"):
    // pokecom_center.pal: "RGB 30, 28, 26" / "RGB 17, 19, 31" / "RGB 14, 16, 31" / "RGB 07, 07, 07"
    // -- this kills a POKECOM_CENTER -> BattleTowerInsidePalette label mix-up (reviewer's mutant M5).
    expect(pals[3]).toEqual([rgb(30, 28, 26), rgb(17, 19, 31), rgb(14, 16, 31), rgb(7, 7, 7)]);
  });

  itWithGbcCorpus("synthetic HOUSE tileset placed in TOWN pins the roof-over-special case (no real map combines them)", () => {
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, { tileset: "TILESET_HOUSE", environment: "TOWN", palette: "PALETTE_DAY", group: 24 });
    // Base is house.pal's roof/glass block: "RGB 30, 28, 26" / "RGB 31, 19, 24" / "RGB 16, 13, 03" / "RGB 07, 07, 07"
    // colors 1-2 overwritten by roofs.pal group 24 morn/day: "RGB 20,31,14, 11,23,05 ; morn/day"
    expect(pals[6]).toEqual([rgb(30, 28, 26), rgb(20, 31, 14), rgb(11, 23, 5), rgb(7, 7, 7)]);
  });

  itWithGbcCorpus("CeladonMansion1F (TILESET_MANSION, INDOOR, PALETTE_DAY) patches YELLOW/WATER/ROOF from mansion_1/mansion_2", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("CeladonMansion1F");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map);

    // mansion_1.pal block 0 (gray, unpatched): lines 1-4
    expect(pals[0]).toEqual([rgb(30, 28, 26), rgb(19, 19, 19), rgb(13, 13, 13), rgb(7, 7, 7)]);
    // WATER <- MansionPalette1 palette 6 (0-indexed), lines 31-34
    expect(pals[3]).toEqual([rgb(30, 28, 26), rgb(17, 19, 31), rgb(14, 16, 31), rgb(7, 7, 7)]);
    // YELLOW <- mansion_2.pal (4 lines)
    expect(pals[4]).toEqual([rgb(25, 24, 23), rgb(20, 19, 19), rgb(14, 16, 31), rgb(7, 7, 7)]);
    // ROOF <- MansionPalette1 palette 8 (0-indexed), lines 41-44
    expect(pals[6]).toEqual([rgb(5, 5, 16), rgb(8, 19, 28), rgb(0, 0, 0), rgb(31, 31, 31)]);
  });

  itWithGbcCorpus("IcePath1F (TILESET_ICE_PATH, CAVE) uses the special ice_path.pal", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("IcePath1F");
    expect(map.environment).toBe("CAVE");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map);
    // gfx/tilesets/ice_path.pal, gray block: "RGB 15, 14, 24" / "RGB 11, 11, 19" / "RGB 07, 07, 12" / "RGB 00, 00, 00"
    expect(pals[0]).toEqual([rgb(15, 14, 24), rgb(11, 11, 19), rgb(7, 7, 12), rgb(0, 0, 0)]);
  });

  itWithGbcCorpus("HallOfFame (TILESET_ICE_PATH, INDOOR) skips the special palette (Hall of Fame exception)", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("HallOfFame");
    expect(map.environment).toBe("INDOOR");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map);
    // IndoorColors day row: "db $20, $21, $22, $23, $24, $25, $26, $07 ; day" -- slot 0 = $20,
    // bg_tiles.pal "indoor" gray: "RGB 30,28,26, 19,19,19, 13,13,13, 07,07,07 ; gray"
    expect(pals[0]).toEqual([rgb(30, 28, 26), rgb(19, 19, 19), rgb(13, 13, 13), rgb(7, 7, 7)]);
  });

  itWithGbcCorpus("WhirlIslandNW (TILESET_DARK_CAVE, CAVE, PALETTE_DARK) with flash true -> NITE row", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("WhirlIslandNW");
    expect(map.palette).toBe("PALETTE_DARK");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map, { flash: true });
    // DungeonColors nite row: "db $10, $11, $12, $13, $14, $15, $16, $17 ; nite" -- slot 0 = $10,
    // bg_tiles.pal nite gray: "RGB 15,14,24, 11,11,19, 07,07,12, 00,00,00 ; gray"
    expect(pals[0]).toEqual([rgb(15, 14, 24), rgb(11, 11, 19), rgb(7, 7, 12), rgb(0, 0, 0)]);
  });

  itWithGbcCorpus("WhirlIslandNW with flash false -> DARKNESS row", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("WhirlIslandNW");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map, { flash: false });
    // DungeonColors dark row: "db $18, $19, $1a, $1b, $1c, $1d, $1e, $1f ; dark" -- slot 0 = $18,
    // bg_tiles.pal dark gray: "RGB 01,01,02, 00,00,00, 00,00,00, 00,00,00 ; gray"
    expect(pals[0]).toEqual([rgb(1, 1, 2), rgb(0, 0, 0), rgb(0, 0, 0), rgb(0, 0, 0)]);
  });

  itWithGbcCorpus("Route38EcruteakGate (TILESET_GATE, GATE, PALETTE_DAY) resolves through the Indoor table", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("Route38EcruteakGate");
    expect(map.environment).toBe("GATE");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map);
    // IndoorColors day row slot 0 = $20, bg_tiles.pal indoor gray (same line quoted above)
    expect(pals[0]).toEqual([rgb(30, 28, 26), rgb(19, 19, 19), rgb(13, 13, 13), rgb(7, 7, 7)]);
  });

  itWithGbcCorpus("every real map resolves at all 3 times x flash {true, false} without throwing (391 x 3 x 2 = 2346 cases)", () => {
    // Code-quality review I1: loads the shared tables once (391 maps share
    // one root), then calls the pure per-map resolver 2346 times, instead of
    // calling resolveMapPalettes (which reloads/reparses every shared table
    // file on every call) 2346 times. Isolated outside vitest (tsx, no
    // per-assertion overhead) to measure the actual fix rather than this
    // test's own expect()-call cost (~225k assertions below, unchanged by
    // I1, and the dominant cost either way): the reload-per-call path
    // (resolveMapPalettes x 2346) took 3747ms; loadPaletteTables once (11ms)
    // + resolveFromTables x 2346 (4ms) took 15ms -- about 250x on the actual
    // resolve work. This test's own vitest wall-clock barely moves (~5.5s
    // either way) because the ~225k expect() calls below dominate it, not
    // the resolve cost -- that overhead is orthogonal to I1 and predates it.
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    expect(maps.length).toBe(391);
    const tables = loadPaletteTables(GBC_SUBJECT_ROOT);
    for (const map of maps) {
      for (const time of ["morn", "day", "nite"] as const) {
        for (const flash of [true, false]) {
          const pals = resolveFromTables(tables, map, { time, flash });
          expect(pals).toHaveLength(8);
          for (const pal of pals) {
            expect(pal).toHaveLength(4);
            for (const color of pal) {
              for (const c of [color.r, color.g, color.b]) {
                expect(Number.isInteger(c)).toBe(true);
                expect(c).toBeGreaterThanOrEqual(0);
                expect(c).toBeLessThanOrEqual(255);
              }
            }
          }
        }
      }
    }
  });
});
