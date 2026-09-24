import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  rgb5to8,
  parsePalColors,
  parseEnvironmentColorBlocks,
  resolveEnvironmentPalette,
  resolveTimeOfDayPal,
  resolveMapPalettes,
} from "../../../src/gbc/load/palette.js";
import { loadGbcMaps } from "../../../src/gbc/load/map.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus, hasGbcProject } from "../helpers/corpus.js";
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

describe("parseEnvironmentColorBlocks / resolveEnvironmentPalette", () => {
  const bgTilesPal: RGB[][] = Array.from({ length: 0x2a }, (_, i) => [
    { r: i, g: i, b: i },
    { r: i, g: i, b: i },
    { r: i, g: i, b: i },
    { r: i, g: i, b: i },
  ]);

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
    const result = resolveEnvironmentPalette(blocks, bgTilesPal, "TOWN", 0);
    expect(result).toEqual([bgTilesPal[0], bgTilesPal[1], bgTilesPal[2], bgTilesPal[3], bgTilesPal[4], bgTilesPal[5], bgTilesPal[6], bgTilesPal[7]]);
  });

  it("refuses (missing-dark-row) when the requested time index has no row -- synthetic 3-row block, matching a shape the findings doc (wrongly) claimed IndoorColors has in the real file", () => {
    const blocks = new Map([["IndoorColors", [[0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7]]]]);
    expect(() => resolveEnvironmentPalette(blocks, bgTilesPal, "INDOOR", 3)).toThrow(/no row for time-of-day index 3/);
  });

  it("refuses an unknown environment", () => {
    expect(() => resolveEnvironmentPalette(new Map(), bgTilesPal, "NOT_A_REAL_ENV", 0)).toThrow(/unknown environment/);
  });

  it("refuses a row index beyond bg_tiles.pal's own length", () => {
    const blocks = new Map([["OutdoorColors", [[0, 1, 2, 3, 4, 5, 6, 999]]]]);
    expect(() => resolveEnvironmentPalette(blocks, bgTilesPal, "TOWN", 0)).toThrow(/999/);
  });
});

describe("resolveTimeOfDayPal (engine/tilesets/timeofday_pals.asm .BrightnessLevels)", () => {
  const MORN_F = 0,
    DAY_F = 1,
    NITE_F = 2,
    DARKNESS_F = 3;

  it("PALETTE_AUTO follows the clock (dc DARKNESS_F, NITE_F, DAY_F, MORN_F -- identity)", () => {
    expect(resolveTimeOfDayPal("PALETTE_AUTO", MORN_F, true)).toBe(MORN_F);
    expect(resolveTimeOfDayPal("PALETTE_AUTO", DAY_F, true)).toBe(DAY_F);
    expect(resolveTimeOfDayPal("PALETTE_AUTO", NITE_F, true)).toBe(NITE_F);
  });

  it("PALETTE_DAY/NITE/MORN are fixed regardless of the clock (dc <const>,<const>,<const>,<const>)", () => {
    expect(resolveTimeOfDayPal("PALETTE_DAY", NITE_F, true)).toBe(DAY_F);
    expect(resolveTimeOfDayPal("PALETTE_NITE", MORN_F, true)).toBe(NITE_F);
    expect(resolveTimeOfDayPal("PALETTE_MORN", NITE_F, true)).toBe(MORN_F);
  });

  it("PALETTE_DARK + flash -> NITE_F (.UsedFlash); PALETTE_DARK without flash -> DARKNESS_F", () => {
    expect(resolveTimeOfDayPal("PALETTE_DARK", DAY_F, true)).toBe(NITE_F);
    expect(resolveTimeOfDayPal("PALETTE_DARK", DAY_F, false)).toBe(DARKNESS_F);
  });

  it("refuses an unknown map palette", () => {
    expect(() => resolveTimeOfDayPal("PALETTE_BOGUS", 0, true)).toThrow(/PALETTE_BOGUS/);
  });
});

describe("resolveMapPalettes corpus", () => {
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

  itWithGbcCorpus("PlayersNeighborsHouse (TILESET_HOUSE, INDOOR, PALETTE_DAY) uses house.pal verbatim, no roof", () => {
    const map = loadGbcMaps(GBC_SUBJECT_ROOT).map("PlayersNeighborsHouse");
    expect(map.tileset).toBe("TILESET_HOUSE");
    const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map);

    // gfx/tilesets/house.pal, block 0 (gray): "RGB 30, 28, 26" / "RGB 19, 19, 19" / "RGB 13, 13, 13" / "RGB 07, 07, 07"
    expect(pals[0]).toEqual([rgb(30, 28, 26), rgb(19, 19, 19), rgb(13, 13, 13), rgb(7, 7, 7)]);
    // block 6 (roof/glass): "RGB 30, 28, 26" / "RGB 31, 19, 24" / "RGB 16, 13, 03" / "RGB 07, 07, 07"
    expect(pals[6]).toEqual([rgb(30, 28, 26), rgb(31, 19, 24), rgb(16, 13, 3), rgb(7, 7, 7)]);
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

  itWithGbcCorpus("every real map resolves at all 3 times x flash true without throwing (391 maps)", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    expect(maps.length).toBe(391);
    for (const map of maps) {
      for (const time of ["morn", "day", "nite"] as const) {
        const pals = resolveMapPalettes(GBC_SUBJECT_ROOT, map, { time, flash: true });
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
  });
});

// Sanity: readFileSync/GBC_SUBJECT_ROOT are otherwise unused when the corpus
// is absent -- keep the import used so lint/typecheck don't flag it even in
// that environment.
void readFileSync;
void hasGbcProject;
