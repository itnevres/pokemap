import { describe, it, expect } from "vitest";
import { renderGbcMetatile, renderGbcMap, renderGbcMapMetatile, type GbcMetatileRaster, type GbcMapRaster } from "../../../src/gbc/render/map.js";
import { openGbcProject, type GbcProject } from "../../../src/gbc/project.js";
import { resolveFromTables } from "../../../src/gbc/load/palette.js";
import type { GbcTileset, GbcMap, PaletteMapEntry, Metatile } from "../../../src/gbc/model/types.js";
import type { PaletteTables } from "../../../src/gbc/load/palette.js";
import type { RGB } from "../../../src/model/types.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";
import { stubGbcProject as stubGbcProjectBase } from "../helpers/stubGbcProject.js";

// ---------------------------------------------------------------------------
// Shared synthetic fixtures. Every value below is invented for the test, not
// derived from the real corpus -- the corpus-derived pins live in the
// `describe("corpus")` block at the bottom, each with its own from-bytes
// derivation comment.
// ---------------------------------------------------------------------------

function uniformTile(shade: number): Uint8Array {
  return new Uint8Array(64).fill(shade);
}

function pixelAt(r: { width: number; data: Uint8ClampedArray }, x: number, y: number): [number, number, number, number] {
  const i = (y * r.width + x) * 4;
  return [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!, r.data[i + 3]!];
}

/** Center pixel of metatile position `i` (0-15, row-major 4x4) within a rendered 32x32 raster. */
function posPixel(r: { width: number; data: Uint8ClampedArray }, i: number): [number, number, number, number] {
  const row = Math.floor(i / 4);
  const col = i % 4;
  return pixelAt(r, col * 8 + 4, row * 8 + 4);
}

function metatile(...tiles: number[]): Metatile {
  return { tiles };
}

describe("renderGbcMetatile", () => {
  it("places a distinct tile at each corner of the 4x4 grid without transposing rows/cols", () => {
    // Positions 0 (row0,col0), 3 (row0,col3), 12 (row3,col0), 15 (row3,col3),
    // filler (id 0) everywhere else. A row/col swap would move TL<->BL or
    // TR<->BR's rendered color to the wrong corner.
    const FILLER = 0, TL = 1, TR = 2, BL = 3, BR = 4;
    const palMap: (PaletteMapEntry | null)[] = [];
    palMap[FILLER] = { bank: 0, pal: 0 };
    palMap[TL] = { bank: 0, pal: 1 };
    palMap[TR] = { bank: 0, pal: 2 };
    palMap[BL] = { bank: 0, pal: 3 };
    palMap[BR] = { bank: 0, pal: 4 };
    const tiles: Uint8Array[] = [];
    tiles[FILLER] = uniformTile(0);
    tiles[TL] = uniformTile(0);
    tiles[TR] = uniformTile(0);
    tiles[BL] = uniformTile(0);
    tiles[BR] = uniformTile(0);

    const palettes: RGB[][] = [
      [{ r: 9, g: 9, b: 9 }],
      [{ r: 200, g: 0, b: 0 }], // TL red
      [{ r: 0, g: 200, b: 0 }], // TR green
      [{ r: 0, g: 0, b: 200 }], // BL blue
      [{ r: 200, g: 200, b: 0 }], // BR yellow
    ];

    const m = metatile(
      TL, FILLER, FILLER, TR,
      FILLER, FILLER, FILLER, FILLER,
      FILLER, FILLER, FILLER, FILLER,
      BL, FILLER, FILLER, BR,
    );
    const dst = renderGbcMetatile(tiles, { metatiles: [m], palMap }, 0, palettes);

    expect(dst.outOfRange).toBe(false);
    expect(dst.unmappedTiles).toBe(0);
    expect(pixelAt(dst, 0, 0)).toEqual([200, 0, 0, 255]); // TL
    expect(pixelAt(dst, 24, 0)).toEqual([0, 200, 0, 255]); // TR
    expect(pixelAt(dst, 0, 24)).toEqual([0, 0, 200, 255]); // BL
    expect(pixelAt(dst, 24, 24)).toEqual([200, 200, 0, 255]); // BR
    expect(pixelAt(dst, 16, 16)).toEqual([9, 9, 9, 255]); // filler, dead center
  });

  it("selects the tile's own palette via palMap.pal, not a fixed one", () => {
    const palMap: (PaletteMapEntry | null)[] = [{ bank: 0, pal: 0 }, { bank: 0, pal: 1 }];
    const tiles: Uint8Array[] = [uniformTile(2), uniformTile(2)];
    const palettes: RGB[][] = [
      [{ r: 1, g: 1, b: 1 }, { r: 2, g: 2, b: 2 }, { r: 3, g: 3, b: 3 }, { r: 4, g: 4, b: 4 }],
      [{ r: 11, g: 11, b: 11 }, { r: 12, g: 12, b: 12 }, { r: 13, g: 13, b: 13 }, { r: 14, g: 14, b: 14 }],
    ];
    const m = metatile(0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1);
    const dst = renderGbcMetatile(tiles, { metatiles: [m], palMap }, 0, palettes);
    expect(posPixel(dst, 0)).toEqual([3, 3, 3, 255]); // tile0, pal0, shade2
    expect(posPixel(dst, 1)).toEqual([13, 13, 13, 255]); // tile1, pal1, shade2
  });

  it("an unmapped tile id (an EXPLICIT null palMap entry, tile id 2, not merely a sparse/out-of-bounds one) paints the placeholder and counts it, other tiles unaffected", () => {
    // Fix round 1, spec review Issue 2 / minor m1: the spec's "synthetic
    // palMap ... including ... one null entry" means a real `null` sitting at
    // a real index, not an index past the array's populated length (which
    // reads as `undefined`, structurally different even though
    // `pngTileIndex` treats both the same way today).
    const palMap: (PaletteMapEntry | null)[] = [{ bank: 0, pal: 0 }, { bank: 0, pal: 0 }, null];
    const tiles: Uint8Array[] = [uniformTile(0)];
    const palettes: RGB[][] = [[{ r: 5, g: 5, b: 5 }]];
    const m = metatile(0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // position 1 = tile id 2, the null entry
    const dst = renderGbcMetatile(tiles, { metatiles: [m], palMap }, 0, palettes);
    expect(dst.outOfRange).toBe(false);
    expect(dst.unmappedTiles).toBe(1);
    expect(posPixel(dst, 1)).toEqual([255, 0, 255, 255]); // placeholder
    expect(posPixel(dst, 0)).toEqual([5, 5, 5, 255]); // unaffected
  });

  it("a bank-1 tile id resolves through its own PNG index ($0x60 + low7), not the raw tile id and not its bank-0 counterpart", () => {
    // Fix round 1, spec review Issue 2: the spec's synthetic palMap must
    // include a `bank: 1` entry. BANK1_ID's low 7 bits equal BANK0_ID's full
    // value (0x85 & 0x7f === 0x05), so a bug that ignores `bank` (R8:
    // `tiles[tileId & 0x7f]`) or uses the raw tile id directly (R8b:
    // `tiles[tileId]`) is invisible unless the two banks' PNG tiles/palettes
    // genuinely differ, which they do here.
    const BANK0_ID = 0x05;
    const BANK1_ID = 0x85; // 0x85 & 0x7f === 0x05 -- same low7 as BANK0_ID
    const palMap: (PaletteMapEntry | null)[] = [];
    palMap[BANK0_ID] = { bank: 0, pal: 0 };
    palMap[BANK1_ID] = { bank: 1, pal: 1 };
    const tiles: Uint8Array[] = [];
    tiles[0x05] = uniformTile(1); // bank 0 PNG index: 0x05
    tiles[0x65] = uniformTile(2); // bank 1 PNG index: 0x60 + 0x05 = 0x65
    tiles[BANK1_ID] = uniformTile(3); // decoy at the RAW tile id -- R8b would read this instead of tiles[0x65]
    const palettes: RGB[][] = [
      [{ r: 0, g: 0, b: 0 }, { r: 10, g: 10, b: 10 }, { r: 20, g: 20, b: 20 }, { r: 30, g: 30, b: 30 }],
      [{ r: 0, g: 0, b: 0 }, { r: 100, g: 100, b: 100 }, { r: 200, g: 200, b: 200 }, { r: 250, g: 250, b: 250 }],
    ];
    const m = metatile(BANK0_ID, BANK1_ID, ...new Array(14).fill(BANK0_ID)); // filler must be a MAPPED id, never 0 (tile id 0 has no palMap entry here)
    const dst = renderGbcMetatile(tiles, { metatiles: [m], palMap }, 0, palettes);
    expect(dst.unmappedTiles).toBe(0);
    expect(posPixel(dst, 0)).toEqual([10, 10, 10, 255]); // bank0: PNG idx 0x05, shade1, pal0
    expect(posPixel(dst, 1)).toEqual([200, 200, 200, 255]); // bank1: PNG idx 0x65, shade2, pal1
  });

  it("an out-of-range metatile id paints the whole 32x32 raster as the placeholder and flags outOfRange", () => {
    const dst = renderGbcMetatile([], { metatiles: [metatile(...new Array(16).fill(0))], palMap: [] }, 5, []);
    expect(dst.outOfRange).toBe(true);
    expect(dst.unmappedTiles).toBe(0);
    for (const [x, y] of [[0, 0], [31, 31], [16, 16]] as const) {
      expect(pixelAt(dst, x, y)).toEqual([255, 0, 255, 255]);
    }
  });

  it("a negative or non-integer metatile id is also out of range", () => {
    const ts = { metatiles: [metatile(...new Array(16).fill(0))], palMap: [] };
    expect(renderGbcMetatile([], ts, -1, []).outOfRange).toBe(true);
    expect(renderGbcMetatile([], ts, 1.5, []).outOfRange).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// renderGbcMap synthetic fixtures.
// ---------------------------------------------------------------------------

/** Every field a GbcMap needs, with harmless defaults for what a given test doesn't care about. */
function makeMap(overrides: Partial<GbcMap>): GbcMap {
  return {
    name: "TestMap",
    constName: "TEST_MAP",
    group: 0,
    number: 1,
    width: 1,
    height: 1,
    blkPath: "maps/TestMap.blk",
    tileset: "TILESET_TEST",
    environment: "TOWN",
    landmark: "LANDMARK_NONE",
    music: "MUSIC_NONE",
    phoneFlag: "FALSE",
    palette: "PALETTE_DAY",
    fishGroup: "FISHGROUP_NONE",
    border: 0,
    connectionFlags: "0",
    connections: [],
    ...overrides,
  };
}

/**
 * A synthetic `PaletteTables` where `PALETTE_DAY` always forces
 * `timeOfDayPal = 1` regardless of the `time` option (mirrors the real
 * engine's own PALETTE_DAY row), environment "TOWN" resolves to 8 palettes
 * where index `j` is uniformly `{(j+1)*20, (j+1)*20, (j+1)*20}` at every
 * shade EXCEPT index 6 (PAL_BG_ROOF), whose shades 1/2 come from
 * `roofPals[group]` (patched exactly like the real `resolveFromTables`) and
 * whose shades 0/3 are the fixed sentinels 200/250 -- letting a roof-tile
 * test tell "swapped" (roofPals-driven color) from "unswapped" (a plain
 * uniform color) apart by shade alone.
 */
function makePaletteTables(roofPals: Record<number, { mornDay: [RGB, RGB]; nite: [RGB, RGB] }>): PaletteTables {
  const bgTilesPal: RGB[][] = [];
  for (let j = 0; j < 8; j++) {
    const c = { r: (j + 1) * 20, g: (j + 1) * 20, b: (j + 1) * 20 };
    bgTilesPal.push([c, c, c, c]);
  }
  bgTilesPal[6] = [{ r: 200, g: 200, b: 200 }, { r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }, { r: 250, g: 250, b: 250 }];

  const maxGroup = Math.max(0, ...Object.keys(roofPals).map(Number));
  const roofPalsArr: { mornDay: [RGB, RGB]; nite: [RGB, RGB] }[] = [];
  for (let g = 0; g <= maxGroup; g++) {
    roofPalsArr[g] = roofPals[g] ?? { mornDay: [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }], nite: [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }] };
  }

  return {
    palBg: { water: 3, yellow: 4, roof: 6 },
    paletteIndexByName: new Map([["PALETTE_DAY", 1]]),
    darkPaletteIndex: 99,
    clockIndexByOption: { morn: 0, day: 1, nite: 2 },
    brightness: { rows: [[], [1, 1, 1, 1]], flashPalette: 0, noFlashPalette: 0 },
    bgTilesPal,
    envBlockMap: new Map([["TOWN", "TestBlock"]]),
    envBlocks: new Map([["TestBlock", [[], [0, 1, 2, 3, 4, 5, 6, 7]]]]),
    roofPals: roofPalsArr,
    specialPalettesByTileset: new Map(),
    mansionPalette: [],
  };
}

/** This file's own default: `paddingWidth` returns 3 unless a call site overrides it (most tests here never touch border rendering). Everything else is `stubGbcProject`'s own "throw if touched" default -- see that file's own doc comment for why it's shared. */
function stubProject(overrides: Partial<GbcProject>): GbcProject {
  return stubGbcProjectBase({ paddingWidth: () => 3, ...overrides });
}

// Tile ids for the "border/block-0 substitution" fixture.
const ZERO_METATILE_TILE = 30; // metatile 0's own tile, pal 2 -- what byte 0 must NOT render as after correct substitution
const BORDER_TILE = 33; // metatile 1's tile == map.border -- what byte 0 (and every ring cell) must render as
const OTHER_TILE = 34; // metatile 2's tile -- an ordinary placed block, must be unaffected by substitution

function borderFixtureTileset(): GbcTileset {
  const palMap: (PaletteMapEntry | null)[] = [];
  palMap[ZERO_METATILE_TILE] = { bank: 0, pal: 2 };
  palMap[BORDER_TILE] = { bank: 0, pal: 7 };
  palMap[OTHER_TILE] = { bank: 0, pal: 5 };
  const tiles: Uint8Array[] = [];
  tiles[ZERO_METATILE_TILE] = uniformTile(0);
  tiles[BORDER_TILE] = uniformTile(0);
  tiles[OTHER_TILE] = uniformTile(0);
  const metatiles: Metatile[] = [
    metatile(...new Array(16).fill(ZERO_METATILE_TILE)), // id 0
    metatile(...new Array(16).fill(BORDER_TILE)), // id 1
    metatile(...new Array(16).fill(OTHER_TILE)), // id 2
  ];
  return {
    constName: "TILESET_TEST", name: "TilesetTest", gfxPath: "", metatilesPath: "", collisionPath: "", palMapPath: "",
    metatiles, collision: [], palMap, tiles,
  };
}

// Colors implied by makePaletteTables' formula: index j -> (j+1)*20 uniform.
const ZERO_COLOR: [number, number, number, number] = [60, 60, 60, 255]; // pal2
const BORDER_COLOR: [number, number, number, number] = [160, 160, 160, 255]; // pal7
const OTHER_COLOR: [number, number, number, number] = [120, 120, 120, 255]; // pal5

describe("renderGbcMap: block-0 substitution and border ring", () => {
  const ts = borderFixtureTileset();
  const tables = makePaletteTables({});
  const map = makeMap({ width: 3, height: 1, border: 1 }); // border = metatile 1 (BORDER_TILE)

  function proj(overrides: Partial<GbcProject> = {}): GbcProject {
    return stubProject({
      map: () => map,
      tileset: () => ts,
      paletteTables: () => tables,
      ...overrides,
    });
  }

  it("substitutes the border metatile for a real block byte of 0, inside the map -- other blocks unaffected", () => {
    const r = renderGbcMap(proj(), "TestMap", {
      blocksOverride: [{ metatileId: 0 }, { metatileId: 2 }, { metatileId: 1 }],
    });
    expect(r.blockWidth).toBe(3);
    expect(r.blockHeight).toBe(1);
    expect(r.originX).toBe(0);
    expect(r.originY).toBe(0);
    expect(pixelAt(r, 4, 4)).toEqual(BORDER_COLOR); // block 0: byte 0 -> substituted, NOT ZERO_COLOR
    expect(pixelAt(r, 32 + 4, 4)).toEqual(OTHER_COLOR); // block 1: byte 2, unaffected
    expect(pixelAt(r, 64 + 4, 4)).toEqual(BORDER_COLOR); // block 2: byte 1, already border
    expect(r.outOfRangeCount).toBe(0);
    expect(r.unmappedTileCount).toBe(0);
    expect(r.defects).toEqual([]);
  });

  it("border: 3 gives (w+6)x(h+6) blocks, origin at 3 blocks, ring pixels are the border metatile", () => {
    const r = renderGbcMap(proj(), "TestMap", {
      border: 3,
      blocksOverride: [{ metatileId: 2 }, { metatileId: 2 }, { metatileId: 2 }],
    });
    expect(r.width).toBe((3 + 6) * 32);
    expect(r.height).toBe((1 + 6) * 32);
    expect(r.originX).toBe(96);
    expect(r.originY).toBe(96);
    expect(pixelAt(r, 0, 0)).toEqual(BORDER_COLOR); // top-left ring corner
    expect(pixelAt(r, r.width - 1, r.height - 1)).toEqual(BORDER_COLOR); // bottom-right ring corner
    expect(pixelAt(r, 96 + 4, 96 + 4)).toEqual(OTHER_COLOR); // interior block 0, unaffected by the ring
  });

  it("border: 4 is refused when the project's own padding width is 3", () => {
    expect(() =>
      renderGbcMap(proj(), "TestMap", { border: 4, blocksOverride: [{ metatileId: 1 }, { metatileId: 1 }, { metatileId: 1 }] }),
    ).toThrow(/border 4/);
  });

  it("reads the padding-width cap from the project instead of hardcoding 3 -- a lower cap refuses border: 3 but allows border: 2", () => {
    const lowCapProj = proj({ paddingWidth: () => 2 });
    const blocks = [{ metatileId: 1 }, { metatileId: 1 }, { metatileId: 1 }];
    expect(() => renderGbcMap(lowCapProj, "TestMap", { border: 3, blocksOverride: blocks })).toThrow(/border 3/);
    const r = renderGbcMap(lowCapProj, "TestMap", { border: 2, blocksOverride: blocks });
    expect(r.width).toBe((3 + 4) * 32);
    expect(r.originX).toBe(64);
  });

  it("a negative or non-integer border is refused the same way", () => {
    const blocks = [{ metatileId: 1 }, { metatileId: 1 }, { metatileId: 1 }];
    expect(() => renderGbcMap(proj(), "TestMap", { border: -1, blocksOverride: blocks })).toThrow(/border -1/);
    expect(() => renderGbcMap(proj(), "TestMap", { border: 1.5, blocksOverride: blocks })).toThrow(/border 1\.5/);
  });

  it("blocksOverride must have exactly width x height entries", () => {
    expect(() => renderGbcMap(proj(), "TestMap", { blocksOverride: [{ metatileId: 1 }, { metatileId: 1 }] })).toThrow(/blocksOverride has 2/);
    expect(() => renderGbcMap(proj(), "TestMap", { blocksOverride: [{ metatileId: 1 }, { metatileId: 1 }] })).toThrow(/expected 3x1 = 3/);
  });

  it("blocksOverride skips proj.layout entirely, and defects is empty", () => {
    // proj() above never wires `layout`, so stubProject's `unused("layout")`
    // would throw if renderGbcMap called it -- reaching this assertion at all
    // proves it didn't.
    const r = renderGbcMap(proj(), "TestMap", { blocksOverride: [{ metatileId: 1 }, { metatileId: 1 }, { metatileId: 1 }] });
    expect(r.defects).toEqual([]);
  });

  it("without blocksOverride, calls proj.layout(map) and surfaces its defects", () => {
    const layoutBlocks = [{ metatileId: 1 }, { metatileId: 1 }, { metatileId: 1 }];
    const defect = { file: "maps/TestMap.blk", message: "synthetic defect" };
    const r = renderGbcMap(
      proj({ layout: () => ({ layout: { blkPath: "maps/TestMap.blk", width: 3, height: 1, blocks: layoutBlocks, writable: false }, defects: [defect] }) }),
      "TestMap",
    );
    expect(r.defects).toEqual([defect]);
    expect(pixelAt(r, 4, 4)).toEqual(BORDER_COLOR);
  });
});

describe("renderGbcMap: outOfRangeCount / unmappedTileCount", () => {
  it("counts out-of-range map blocks but excludes the border ring, even when the ring itself is out of range", () => {
    const ts = borderFixtureTileset();
    const tables = makePaletteTables({});
    // map.border = 999 -- an id with no matching metatile, so the entire ring
    // is out-of-range placeholder. The single interior block (id 1) is valid.
    const map = makeMap({ width: 1, height: 1, border: 999 });
    const proj = stubProject({ map: () => map, tileset: () => ts, paletteTables: () => tables });
    const r = renderGbcMap(proj, "TestMap", { border: 1, blocksOverride: [{ metatileId: 1 }] });
    expect(r.outOfRangeCount).toBe(0); // the ring's out-of-range cells don't count
    expect(pixelAt(r, 0, 0)).toEqual([255, 0, 255, 255]); // ring cell IS the placeholder on screen
    expect(pixelAt(r, 32 + 4, 32 + 4)).toEqual(BORDER_COLOR); // interior block, valid
  });

  it("counts an out-of-range interior block", () => {
    const ts = borderFixtureTileset();
    const tables = makePaletteTables({});
    const map = makeMap({ width: 2, height: 1, border: 1 });
    const proj = stubProject({ map: () => map, tileset: () => ts, paletteTables: () => tables });
    const r = renderGbcMap(proj, "TestMap", { blocksOverride: [{ metatileId: 1 }, { metatileId: 999 }] });
    expect(r.outOfRangeCount).toBe(1);
    expect(pixelAt(r, 32 + 4, 4)).toEqual([255, 0, 255, 255]);
  });

  it("sums unmapped tiles across every map block, excluding the ring", () => {
    const palMap: (PaletteMapEntry | null)[] = [null, { bank: 0, pal: 1 }]; // id 0: explicit null (unmapped); id 1: mapped
    const tiles: Uint8Array[] = [];
    tiles[1] = uniformTile(0);
    // metatile 0: 11 mapped (tile 1) + 5 unmapped (tile 40, no palMap entry at all -- index 40 left undefined)
    const m0 = metatile(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 40, 40, 40, 40, 40); // tile 40 has no palMap entry
    const ts: GbcTileset = {
      constName: "TILESET_TEST", name: "TilesetTest", gfxPath: "", metatilesPath: "", collisionPath: "", palMapPath: "",
      metatiles: [m0], collision: [], palMap, tiles,
    };
    const tables = makePaletteTables({});
    const map = makeMap({ width: 2, height: 1, border: 0 });
    const proj = stubProject({ map: () => map, tileset: () => ts, paletteTables: () => tables });
    const r = renderGbcMap(proj, "TestMap", { blocksOverride: [{ metatileId: 0 }, { metatileId: 0 }] });
    expect(r.unmappedTileCount).toBe(10); // 5 per block x 2 blocks
  });

  it("excludes the border ring from unmappedTileCount, even when the border metatile itself has unmapped tiles (R2)", () => {
    // Metatile id 0 is reserved: a real block byte of 0 always substitutes to
    // map.border (block-0 substitution), so neither the "fully mapped"
    // metatile nor the "unmapped-heavy" one below can BE id 0, or placing it
    // as an interior block would silently render the border instead.
    const palMap: (PaletteMapEntry | null)[] = [];
    palMap[1] = { bank: 0, pal: 1 }; // mapped
    const tiles: Uint8Array[] = [];
    tiles[1] = uniformTile(0);
    const filler = metatile(...new Array(16).fill(1)); // id 0: unused filler, never referenced
    const mappedMetatile = metatile(...new Array(16).fill(1)); // id 1: fully mapped
    // id 2: 5 unmapped tile slots (tile 40 has no palMap entry at all)
    const unmappedHeavyMetatile = metatile(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 40, 40, 40, 40, 40);
    const ts: GbcTileset = {
      constName: "TILESET_TEST", name: "TilesetTest", gfxPath: "", metatilesPath: "", collisionPath: "", palMapPath: "",
      metatiles: [filler, mappedMetatile, unmappedHeavyMetatile], collision: [], palMap, tiles,
    };
    const tables = makePaletteTables({});
    // map.border = 2 -> every ring cell renders the unmapped-heavy metatile.
    const map = makeMap({ width: 1, height: 1, border: 2 });
    const proj = stubProject({ map: () => map, tileset: () => ts, paletteTables: () => tables });

    const withRing = renderGbcMap(proj, "TestMap", { border: 1, blocksOverride: [{ metatileId: 1 }] });
    expect(withRing.unmappedTileCount).toBe(0); // the interior block (id 1) is fully mapped; the ring's 8 unmapped-heavy cells must not count

    // Sanity: the SAME metatile, placed as an interior block instead of the
    // border, does count -- so the assertion above is a real exclusion, not
    // an accident of the metatile never actually being unmapped.
    const asInterior = renderGbcMap(proj, "TestMap", { border: 0, blocksOverride: [{ metatileId: 2 }] });
    expect(asInterior.unmappedTileCount).toBe(5);
  });
});

describe("renderGbcMap: roof tile swap (Decision 6)", () => {
  const ROOF_LOW_BOUNDARY = 9; // 0x09, just outside the real $0A-$12 range
  const ROOF_HIGH_BOUNDARY = 19; // 0x13, just outside the real $0A-$12 range on the high side
  const UNSWAPPED_SHADE = 2; // base tiles at $0A-$12 render this shade -> roofPals[group].mornDay[1]
  const ROOF_SHADE = 1; // the roof PNG's own tiles render this shade -> roofPals[group].mornDay[0]

  function roofFixtureTileset(): GbcTileset {
    const palMap: (PaletteMapEntry | null)[] = [];
    const tiles: Uint8Array[] = [];
    // ids 9..19 inclusive (11 ids: one below, the real 9-tile range, one above), all PAL_BG_ROOF (6)
    for (let id = ROOF_LOW_BOUNDARY; id <= ROOF_HIGH_BOUNDARY; id++) {
      palMap[id] = { bank: 0, pal: 6 };
      tiles[id] = uniformTile(UNSWAPPED_SHADE);
    }
    const filler = 21;
    palMap[filler] = { bank: 0, pal: 1 };
    tiles[filler] = uniformTile(0);
    // positions 0-10 = ids 9..19 in order, positions 11-15 = filler
    const roofRangeMetatile = metatile(9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, filler, filler, filler, filler, filler);
    return {
      constName: "TILESET_TEST", name: "TilesetTest", gfxPath: "", metatilesPath: "", collisionPath: "", palMapPath: "",
      metatiles: [roofRangeMetatile], collision: [], palMap, tiles,
    };
  }

  const UNSWAPPED_COLOR: [number, number, number, number] = [222, 222, 222, 255]; // group's roofPals.mornDay[1]
  const SWAPPED_COLOR: [number, number, number, number] = [111, 111, 111, 255]; // group's roofPals.mornDay[0]

  function makeRoofProject(tilesetConst: string, group: number, roofsFixture: ReturnType<typeof stubProject>["roofs"]): { proj: GbcProject; ts: GbcTileset } {
    const ts = roofFixtureTileset();
    const tables = makePaletteTables({
      [group]: { mornDay: [{ r: 111, g: 111, b: 111 }, { r: 222, g: 222, b: 222 }], nite: [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }] },
    });
    const map = makeMap({ tileset: tilesetConst, group, width: 1, height: 1, border: 0 });
    const proj = stubProject({
      map: () => map,
      tileset: () => ts,
      paletteTables: () => tables,
      roofs: roofsFixture,
    });
    return { proj, ts };
  }

  function roofTilesFixture(): Uint8Array[] {
    return new Array(9).fill(0).map(() => uniformTile(ROOF_SHADE));
  }

  it("swaps exactly PNG tile indices $0A-$12 (9 tiles) for a JOHTO-family map whose group has a roof", () => {
    const { proj } = makeRoofProject("TILESET_JOHTO", 7, () => ({ mapGroupRoofs: [null, null, null, null, null, null, null, 0], roofTiles: [roofTilesFixture()] }));
    const r = renderGbcMap(proj, "TestMap", { blocksOverride: [{ metatileId: 0 }] });
    expect(posPixel(r, 0)).toEqual(UNSWAPPED_COLOR); // id 9 ($09) -- just below range, untouched
    for (let i = 1; i <= 9; i++) {
      expect(posPixel(r, i)).toEqual(SWAPPED_COLOR); // ids 10..18 ($0A-$12) -- swapped
    }
    expect(posPixel(r, 10)).toEqual(UNSWAPPED_COLOR); // id 19 ($13) -- just above range, untouched
  });

  it("applies to TILESET_JOHTO_MODERN and TILESET_BATTLE_TOWER_OUTSIDE too", () => {
    for (const tilesetConst of ["TILESET_JOHTO_MODERN", "TILESET_BATTLE_TOWER_OUTSIDE"]) {
      const { proj } = makeRoofProject(tilesetConst, 7, () => ({ mapGroupRoofs: [null, null, null, null, null, null, null, 0], roofTiles: [roofTilesFixture()] }));
      const r = renderGbcMap(proj, "TestMap", { blocksOverride: [{ metatileId: 0 }] });
      expect(posPixel(r, 5)).toEqual(SWAPPED_COLOR);
    }
  });

  it("db -1 (no roof for this group) applies no swap, even for a JOHTO-family tileset", () => {
    const { proj } = makeRoofProject("TILESET_JOHTO", 8, () => ({ mapGroupRoofs: [null, null, null, null, null, null, null, null, null], roofTiles: [roofTilesFixture()] }));
    const r = renderGbcMap(proj, "TestMap", { blocksOverride: [{ metatileId: 0 }] });
    for (let i = 0; i <= 10; i++) expect(posPixel(r, i)).toEqual(UNSWAPPED_COLOR);
  });

  it("the roof gate is tileset-specific: a non-JOHTO-family map in a roofed group is never swapped", () => {
    const { proj } = makeRoofProject("TILESET_OTHER", 7, () => ({ mapGroupRoofs: [null, null, null, null, null, null, null, 0], roofTiles: [roofTilesFixture()] }));
    const r = renderGbcMap(proj, "TestMap", { blocksOverride: [{ metatileId: 0 }] });
    for (let i = 0; i <= 10; i++) expect(posPixel(r, i)).toEqual(UNSWAPPED_COLOR);
  });

  it("never mutates the cached tileset's own tiles array -- a second, roofless map sharing the same tileset renders unswapped", () => {
    const ts = roofFixtureTileset();
    const originalTile10 = ts.tiles[10]!.slice(); // id $0A, before any render
    const roofsFixture = () => ({ mapGroupRoofs: [null, null, null, null, null, null, null, 0, null], roofTiles: [roofTilesFixture()] });
    const tables = makePaletteTables({
      7: { mornDay: [{ r: 111, g: 111, b: 111 }, { r: 222, g: 222, b: 222 }], nite: [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }] },
      8: { mornDay: [{ r: 111, g: 111, b: 111 }, { r: 222, g: 222, b: 222 }], nite: [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }] },
    });

    const roofedMap = makeMap({ tileset: "TILESET_JOHTO", group: 7, width: 1, height: 1 });
    const roofedProj = stubProject({ map: () => roofedMap, tileset: () => ts, paletteTables: () => tables, roofs: roofsFixture });
    const r1 = renderGbcMap(roofedProj, "TestMap", { blocksOverride: [{ metatileId: 0 }] });
    expect(posPixel(r1, 5)).toEqual(SWAPPED_COLOR); // sanity: the swap did apply for map 1

    // The cache's own array must be untouched by that render.
    expect([...ts.tiles[10]!]).toEqual([...originalTile10]);

    const rooflessMap = makeMap({ tileset: "TILESET_JOHTO", group: 8, width: 1, height: 1 });
    const rooflessProj = stubProject({ map: () => rooflessMap, tileset: () => ts, paletteTables: () => tables, roofs: roofsFixture });
    const r2 = renderGbcMap(rooflessProj, "TestMap", { blocksOverride: [{ metatileId: 0 }] });
    expect(posPixel(r2, 5)).toEqual(UNSWAPPED_COLOR); // must NOT show map 1's roof leaking through the shared cache
  });
});

// ---------------------------------------------------------------------------
// Corpus tests. Every pixel here is derived independently of this module's
// own code -- see the comment on each one for the from-bytes chain
// (xxd/od on the .blk, the _metatiles.bin, the palette-map .asm, the tileset
// PNG, and the .pal source with 5->8 bit via (c<<3)|(c>>2)).
// ---------------------------------------------------------------------------

describe("corpus", () => {
  itWithGbcCorpus(
    "NewBarkTown: pinned pixels (JOHTO, TOWN, PALETTE_AUTO, group 24 = New Bark, roof NEW_BARK, border $05)",
    () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);

      // Chain for the "inside a roof tile" pixel:
      //   maps/NewBarkTown.blk byte[2] (od -An -tx1 -v): 0x18 (block x=2,y=0)
      //   -> metatile 0x18 = 24 decimal. data/tilesets/johto_metatiles.bin
      //      bytes[24*16 .. 24*16+15] (od): position 12 (row3,col0) = 0x0a.
      //   -> tile id 0x0A. gfx/tilesets/johto_palette_map.asm line 2
      //      ("tilepal 0, RED, RED, ROOF, ROOF, ...") gives id 0x0A (index 2
      //      of that 8-name line, ids 8-15) -> PAL_BG_ROOF (index 6 in
      //      constants/tileset_constants.asm's PAL_BG_* enum).
      //   -> pngTileIndex(0x0A) = 0x0A = 10 (bank 0, low7 < 0x60).
      //      gfx/tilesets/johto.png (128x96, 16 cols) tile 10 = cols 80-87,
      //      rows 0-7; row0 = [3,3,0,1,1,1,2,1] (shade = 3 - grayLevel).
      //      Position (row0,col2) within the tile, which is (row3,col0)'s
      //      (row0,col2) sub-pixel -> shade 0.
      //   -> palette: NewBarkTown TOWN/PALETTE_AUTO/day -> OutdoorColors day
      //      row `db $08,$09,$0a,$28,$0c,$0d,$0e,$0f` (data/maps/environment_colors.asm),
      //      slot 6 (ROOF) = $0e = 14. bg_tiles.pal palette 14 ("day roof")
      //      = RGB 27,31,27, 15,31,31, 05,17,31, 07,07,07 -- then colors 1-2
      //      are overwritten by gfx/tilesets/roofs.pal "group 24 (New Bark)"
      //      morn/day pair (20,31,14 / 11,23,05), which does not touch
      //      color 0. Shade 0 -> color0 = (27,31,27) 5-bit.
      //   -> 8-bit via (c<<3)|(c>>2): 27->222, 31->255, 27->222.
      //   Absolute pixel: block(2,0) origin (64,0) [no border]; position12 is
      //   at tile-local offset (row 24-31, col 0-7); the picked sub-pixel is
      //   (row0,col2) within that tile -> (64+2, 0+24) = (66, 24).
      //
      // Independently measured (png_check.py, not this renderer): new_bark's
      // own roof PNG tile 0 is BYTE-IDENTICAL to johto.png's tile $0A at
      // every pixel -- New Bark's own roof swap is a real no-op. This pixel
      // is correct with or without the swap; VioletCity below proves the
      // swap changes pixels for every OTHER town.
      const dayRender = renderGbcMap(proj, "NewBarkTown", { time: "day" });
      expect([dayRender.width, dayRender.height, dayRender.originX, dayRender.originY]).toEqual([320, 288, 0, 0]);
      expect(pixelAt(dayRender, 66, 24)).toEqual([222, 255, 222, 255]);

      // Chain for a plain interior pixel, not roof-tagged:
      //   block(0,0) byte = 0x05 (od, byte[0]). Metatile 5's tiles (position0,
      //   row0,col0) = 0x1e (johto_metatiles.bin bytes[5*16..5*16+15]).
      //   johto_palette_map.asm line 4 (ids 24-31, "RED,RED,BROWN,BROWN,BROWN,
      //   GREEN,GREEN,GREEN") -> id 0x1e (30) is index 6 of that line -> GREEN
      //   (PAL_BG_GREEN, index 2). pngTileIndex(0x1e)=30. johto.png tile 30,
      //   row0 = [1,0,1,0,1,0,0,3] -> pixel (row0,col0) shade 1.
      //   Day OutdoorColors slot2 (GREEN) = $0a = 10. bg_tiles.pal[10]
      //   ("day green") = RGB 22,31,10, 12,25,01, 05,14,00, 07,07,07 -- GREEN
      //   is never patched by the roof-pal step. Shade1 -> color1 = (12,25,1)
      //   5-bit -> 8-bit (99,206,8).
      expect(pixelAt(dayRender, 0, 0)).toEqual([99, 206, 8, 255]);

      // Same pixel, time: "nite" -- must differ, and is independently pinned:
      //   PALETTE_AUTO's .BrightnessLevels row is [DARKNESS_F,NITE_F,DAY_F,MORN_F]
      //   = [3,2,1,0] (constants/wram_constants.asm); nite's clockIndex=2, so
      //   timeOfDayPal = row[3-2] = row[1] = NITE_F's value = 2. OutdoorColors
      //   nite row slot2 (GREEN) = $12 = 18. bg_tiles.pal[18] ("nite green")
      //   = RGB 15,14,24, 08,13,19, 00,11,13, 00,00,00. Same tile/shade1 ->
      //   color1 = (8,13,19) 5-bit -> 8-bit (66,107,156).
      const niteRender = renderGbcMap(proj, "NewBarkTown", { time: "nite" });
      expect(pixelAt(niteRender, 0, 0)).toEqual([66, 107, 156, 255]);
      expect(pixelAt(niteRender, 0, 0)).not.toEqual(pixelAt(dayRender, 0, 0));

      // Border-ring pixel, border: 3. NewBarkTown's border metatile is $05
      // (map_attributes NewBarkTown, NEW_BARK_TOWN, $05, ...), the SAME
      // metatile as block(0,0) above. Ring block (bx=0, by=5) in the padded
      // grid (west strip, since padX=3) is metatile 5's own tile position 5
      // (row1,col1) = tile 0x2f (johto_metatiles.bin bytes[5*16+4..+7] area,
      // position5). johto_palette_map.asm line6 (ids 40-47) -> id 0x2f (47)
      // is index7 -> GREEN again. johto.png tile 0x2f row0 = [2,2,2,2,2,2,3,0]
      // -> pixel (row0,col7) shade0. Day GREEN color0 = (22,31,10) 5-bit ->
      // 8-bit (181,255,82). Absolute pixel: block(bx=0,by=5) -> tile position5
      // occupies rows8-15,cols8-15 -> local (row0,col7) -> (0*32+8+7, 5*32+8+0)
      // = (15, 168).
      const ring = renderGbcMap(proj, "NewBarkTown", { time: "day", border: 3 });
      expect([ring.width, ring.height, ring.originX, ring.originY]).toEqual([512, 480, 96, 96]);
      expect(pixelAt(ring, 15, 168)).toEqual([181, 255, 82, 255]);

      expect(dayRender.outOfRangeCount).toBe(0);
      expect(dayRender.unmappedTileCount).toBe(0);
      expect(dayRender.defects).toEqual([]);
    },
  );

  itWithGbcCorpus("border: 4 is refused for a real map (padding width really is 3 in this corpus)", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    expect(() => renderGbcMap(proj, "NewBarkTown", { border: 4 })).toThrow(/border 4/);
  });

  itWithGbcCorpus(
    "WhirlIslandNW (TILESET_DARK_CAVE, CAVE, PALETTE_DARK): flash forwarding -- flash: false differs from the default at a pinned pixel",
    () => {
      // Chain: constants/map_constants.asm "map_const WHIRL_ISLAND_NW, 5, 9"
      // and maps/WhirlIslandNW.blk byte[0] (od) = 0x10 = 16. data/tilesets/
      // cave_metatiles.bin bytes[16*16..16*16+15] (od) position0 = 0x16
      // (DarkCave shares Cave's metatiles.bin, GBC format findings "Extra
      // findings" -> Map header and tileset assignment). gfx/tilesets/
      // cave_palette_map.asm line3 (ids 16-23, "BROWN, BROWN, GRAY, GRAY,
      // WATER, BROWN, BROWN, BROWN") -> id 0x16 (22) is index6 -> PAL_BG_BROWN
      // (5, DarkCave stacks TilesetCavePalMap -- same GBC format findings
      // note). pngTileIndex(0x16)=22 (bank0). gfx/tilesets/dark_cave.png
      // (DarkCave has its OWN gfx, unlike its shared metatiles/palette map)
      // tile22 row0 = [2,1,2,1,2,1,1,1] -> (row0,col0) shade2.
      //
      // PALETTE_DARK's paletteIndex equals BrightnessLevels' own
      // darkPaletteIndex, so resolveTimeOfDayPal special-cases it BEFORE
      // reading the time-of-day table at all: flash:true -> flashPalette
      // (NITE_F, value 2); flash:false -> noFlashPalette (DARKNESS_F, value
      // 3) -- entirely independent of the `time` option. CAVE uses the
      // Dungeon table (data/maps/environment_colors.asm): nite row slot5
      // (BROWN) = $15 = 21; dark row slot5 = $1d = 29.
      // bg_tiles.pal[21] ("nite brown") = RGB 15,14,24, 12,09,15, 08,04,05,
      // 00,00,00 -- shade2 -> (8,4,5) 5-bit -> 8-bit (66,33,41).
      // bg_tiles.pal[29] ("dark brown") = RGB 01,01,02, 00,00,00, 00,00,00,
      // 00,00,00 -- shade2 -> (0,0,0) 5-bit -> 8-bit (0,0,0).
      // Absolute pixel: block(0,0), border:0 -> (0,0).
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const flashOn = renderGbcMap(proj, "WhirlIslandNW", { flash: true });
      const flashOff = renderGbcMap(proj, "WhirlIslandNW", { flash: false });
      expect(pixelAt(flashOn, 0, 0)).toEqual([66, 33, 41, 255]);
      expect(pixelAt(flashOff, 0, 0)).toEqual([0, 0, 0, 255]);
      expect(pixelAt(flashOn, 0, 0)).not.toEqual(pixelAt(flashOff, 0, 0));

      // The default (no `flash` option) matches flash:true (findings'
      // recommended default, `resolveFromTables`'s own `opts.flash ?? true`).
      const defaultRender = renderGbcMap(proj, "WhirlIslandNW", {});
      expect(pixelAt(defaultRender, 0, 0)).toEqual(pixelAt(flashOn, 0, 0));
    },
  );

  itWithGbcCorpus("NewBarkTown renders byte-identical data across two calls (determinism)", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const r1 = renderGbcMap(proj, "NewBarkTown", { time: "day" });
    const r2 = renderGbcMap(proj, "NewBarkTown", { time: "day" });
    expect(Buffer.from(r1.data)).toEqual(Buffer.from(r2.data));
  });

  itWithGbcCorpus("VioletCity: the roof tile swap really changes pixels, and MapGroupRoofs is indexed by group directly (not group - 1)", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const ts = proj.tileset("TILESET_JOHTO");
    const palettes = resolveFromTables(proj.paletteTables(), proj.map("VioletCity"), { time: "day" });

    // Chain: maps/VioletCity.blk (20x18) has byte at (x=4,y=7) = 0x18 = 24
    // (independently re-derived alongside the metatiles.bin scan below).
    // Metatile 24's position 12 (row3,col0) = tile 0x0A (same metatile as
    // NewBarkTown's pin above -- data/tilesets/johto_metatiles.bin is shared).
    // Absolute pixel base: block(4,7) origin (128,224); position12 occupies
    // local rows24-31,cols0-7.
    const raster = renderGbcMap(proj, "VioletCity", { time: "day" });

    // Sub-pixel (row0,col1): johto.png tile 0x0A row0 = [3,3,0,1,1,1,2,1] ->
    // shade3 (unswapped baseline). gfx/tilesets/roofs/violet.png tile0 row0 =
    // [3,0,1,1,1,1,1,1] -> shade0 (the real swap, VioletCity's group is 10 =
    // "newgroup VIOLET", roofs.asm "db ROOF_VIOLET ; 10 (Violet)").
    // Absolute pixel (128+1, 224+24) = (129, 248).
    // Palette: PAL_BG_ROOF color0 = bg_tiles.pal[14] color0 = (27,31,27)
    // 5-bit (never patched by roofs.pal, which only touches colors 1-2) ->
    // 8-bit (222,255,222). Color3 (shade3, unswapped baseline) = (7,7,7) ->
    // 8-bit (57,57,57).
    expect(pixelAt(raster, 129, 248)).toEqual([222, 255, 222, 255]);

    // Proof the swap matters: rendering metatile 24 directly from the
    // UNSWAPPED tileset (ts.tiles, never copied) gives the OTHER color at the
    // same local pixel.
    const unswapped = renderGbcMetatile(ts.tiles, ts, 24, palettes);
    expect(pixelAt(unswapped, 1, 24)).toEqual([57, 57, 57, 255]);
    expect(pixelAt(raster, 129, 248)).not.toEqual(pixelAt(unswapped, 1, 24));

    // Sub-pixel (row0,col3), chosen because it discriminates VIOLET (group
    // 10's real roof) from AZALEA (group 9's roof, "Lake of Rage" --
    // MapGroupRoofs[group - 1] under the off-by-one mutation): violet.png
    // tile0 row0 col3 = shade1 -> roofPals group10 (Violet) morn/day pair
    // (24,14,31)/(13,7,21) -- shade1 picks the first, 5-bit (24,14,31) ->
    // 8-bit (198,115,255). azalea.png tile0 row0 col3 = shade2 -> the SAME
    // roofPals pair's second color (13,7,21) -> 8-bit (107,57,173) -- a
    // different value, so this pixel goes red under the group-1 mutation.
    // Absolute pixel (128+3, 224+24) = (131, 248).
    expect(pixelAt(raster, 131, 248)).toEqual([198, 115, 255, 255]);
  });

  itWithGbcCorpus("ElmsLab: border $00, INDOOR/PALETTE_DAY/TILESET_LAB -- interior pixel and border-ring pixel, and the roof gate excludes it despite its group having a roof", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);

    // Chain for the interior pixel:
    //   maps/ElmsLab.blk (5x6) byte[7] (block x=2,y=1) = 1. data/tilesets/
    //   lab_metatiles.bin bytes[16..31] (metatile 1) are all 0x10 -- position0
    //   (row0,col0) = tile 0x10. gfx/tilesets/lab_palette_map.asm line3 (ids
    //   16-23) is "tilepal 0, GRAY, WATER, RED, BROWN, BROWN, BROWN, BROWN,
    //   BROWN", so id 0x10 (16) is index0 -> PAL_BG_GRAY (0). pngTileIndex
    //   (0x10) = 16. gfx/tilesets/lab.png tile16 row0 = [1,1,1,1,1,1,1,1] ->
    //   shade1 at (row0,col0).
    //   ElmsLab: INDOOR, PALETTE_DAY (forces DAY_F=1 regardless of clock) ->
    //   IndoorColors day row `db $20,...` slot0 (GRAY) = $20 = 32.
    //   bg_tiles.pal[32] ("indoor gray") = RGB 30,28,26, 19,19,19, 13,13,13,
    //   07,07,07. Shade1 -> color1 = (19,19,19) 5-bit -> 8-bit (156,156,156).
    //   Absolute pixel: block(2,1) origin (64,32); position0 local (0,0) ->
    //   (64, 32).
    const day = renderGbcMap(proj, "ElmsLab", { time: "day" });
    expect(pixelAt(day, 64, 32)).toEqual([156, 156, 156, 255]);

    // Border-ring pixel, border: 3. ElmsLab's border is $00 (the common
    // case, 272/391 maps). Metatile 0's own 16 tiles are all id 0
    // (lab_metatiles.bin bytes[0..15]); lab_palette_map.asm line1 id0 (GRAY).
    // lab.png tile0 is UNIFORM shade3 everywhere. IndoorColors day slot0
    // color3 (never patched -- ElmsLab isn't TOWN/ROUTE) = (7,7,7) 5-bit ->
    // 8-bit (57,57,57), the same at every ring pixel by construction.
    const ring = renderGbcMap(proj, "ElmsLab", { time: "day", border: 3 });
    expect([ring.width, ring.height, ring.originX, ring.originY]).toEqual([352, 384, 96, 96]);
    expect(pixelAt(ring, 0, 0)).toEqual([57, 57, 57, 255]);

    // Gate check (no new render needed -- the pin above already proves it):
    // ElmsLab's group is 24 (newgroup NEW_BARK), whose MapGroupRoofs entry IS
    // a real roof (ROOF_NEW_BARK, index 0), but TILESET_LAB is not
    // JOHTO/JOHTO_MODERN/BATTLE_TOWER_OUTSIDE, so `day`'s (64,32) pixel above
    // must equal the plain, unswapped lab.png value. Tile 0x10 (used at that
    // exact pixel) falls inside $0A-$12, so if the gate were dropped it would
    // be overwritten by new_bark's roof tile 6, whose (row0,col0) shade is 0
    // (not 1) -- a different, and therefore test-failing, color.
  });

  itWithGbcCorpus("all 391 maps render without throwing; outOfRangeCount and unmappedTileCount are both 0; exactly 2 maps carry a defect naming their .blk files", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    let totalOutOfRange = 0;
    let totalUnmapped = 0;
    const defectMaps: { name: string; files: string[] }[] = [];
    for (const map of proj.maps) {
      const r = renderGbcMap(proj, map.name, { time: "day" });
      totalOutOfRange += r.outOfRangeCount;
      totalUnmapped += r.unmappedTileCount;
      if (r.defects.length > 0) defectMaps.push({ name: map.name, files: r.defects.map((d) => d.file) });
    }
    expect(proj.maps).toHaveLength(391);
    // Measured against the real corpus (see the implementer report for the
    // full run): every placed tile id resolves to a real PNG tile, and every
    // placed metatile id is within its tileset's range.
    expect(totalOutOfRange).toBe(0);
    expect(totalUnmapped).toBe(0);
    // The spec asks that `defects` "names their files" -- pin the file
    // fields, not just the map names (fix round 1, spec review minor m2).
    defectMaps.sort((a, b) => a.name.localeCompare(b.name));
    expect(defectMaps).toEqual([
      { name: "CeruleanCave2F", files: ["maps/CeruleanCave2F.blk"] },
      { name: "CeruleanCaveB1", files: ["maps/CeruleanCaveB1.blk"] },
    ]);
  });
});

/** All 32*32*4 = 4096 RGBA bytes at `(originX, originY)` in `r` -- for a byte-equality comparison against `renderGbcMapMetatile`'s own 32x32 raster (a plain `toEqual` on `r.data` itself would compare the WHOLE map raster, not just this one block). */
function extractBlock(r: { width: number; data: Uint8ClampedArray }, originX: number, originY: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const i = ((originY + y) * r.width + (originX + x)) * 4;
      out.push(r.data[i]!, r.data[i + 1]!, r.data[i + 2]!, r.data[i + 3]!);
    }
  }
  return out;
}

describe("renderGbcMapMetatile (map-keyed metatile thumbnail, review finding 6)", () => {
  // VioletCity, not NewBarkTown: NewBarkTown's roof swap is a measured
  // byte-identical no-op (task-9-implementer.md; the "VioletCity: the roof
  // tile swap really changes pixels" test just above proves it's real for
  // VioletCity), so only VioletCity can actually catch a dropped roof swap
  // here (mutation 8). Block (4,7), raw metatile id 24, contains tile 0x10
  // (within the $0A-$12 roof-swapped range) -- same block/id the roof test
  // above already uses, re-derived independently for this test.
  itWithGbcCorpus(
    "VioletCity, block (4,7), metatile 24 (tile 0x10, in $0A-$12): renderGbcMapMetatile byte-equals the matching 32x32 region of renderGbcMap",
    () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const map = proj.map("VioletCity");
      expect(map.tileset).toBe("TILESET_JOHTO");
      const ts = proj.tileset(map.tileset);
      expect(ts.metatiles[24]!.tiles).toContain(0x10);
      // Spec review finding 7: pin the block choice itself, not just the
      // tile-containment fact -- block (4,7)'s raw id really is 24 (non-zero,
      // so it's never the block-0 border substitution either).
      expect(proj.layout(map).layout.blocks[7 * map.width + 4]!.metatileId).toBe(24);

      const mapRaster = renderGbcMap(proj, "VioletCity"); // border 0 (default) -- block(4,7) origin is (128,224), no ring offset
      const metaRaster = renderGbcMapMetatile(proj, "VioletCity", 24);
      expect(extractBlock(metaRaster, 0, 0)).toEqual(extractBlock(mapRaster, 4 * 32, 7 * 32));
    },
  );

  // Spec review finding 1: the ORIGINAL task spec's premise for the AzaleaTown
  // test below ("same tileset [as VioletCity], different roof") is false --
  // AzaleaTown is TILESET_JOHTO_MODERN, not TILESET_JOHTO (`data/maps/
  // maps.asm`), and the earlier test asserted metatile-DATA equality, not
  // tileset equality, which happens to hold too but proves something weaker.
  // Because the two maps differ in tileset AND roof, that test's "differs"
  // assertion is over-determined: it can't tell a correctly-keyed roof swap
  // from one keyed to the wrong group (mutation E12, `roofSwappedTiles(...,
  // 10)` for every map, survived against it). MahoganyTown is the TRUE
  // same-tileset/different-roof pair (both TILESET_JOHTO; VioletCity roof 1,
  // MahoganyTown roof 2), so a byte-equality test against it -- the same
  // shape as VioletCity's own test above -- is what actually isolates the
  // per-MAP roof key. Block (5,2), raw metatile id 24 (same table as
  // VioletCity's, since it's the same tileset).
  itWithGbcCorpus(
    "MahoganyTown, block (5,2), metatile 24: renderGbcMapMetatile byte-equals renderGbcMap's region (same tileset as VioletCity, TILESET_JOHTO, but a different real roof)",
    () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const violet = proj.map("VioletCity");
      const mahogany = proj.map("MahoganyTown");
      expect(mahogany.tileset).toBe("TILESET_JOHTO");
      expect(mahogany.tileset).toBe(violet.tileset);
      const { mapGroupRoofs } = proj.roofs();
      expect(mapGroupRoofs[mahogany.group]).not.toBe(mapGroupRoofs[violet.group]); // 2, vs VioletCity's 1
      expect(proj.layout(mahogany).layout.blocks[2 * mahogany.width + 5]!.metatileId).toBe(24);

      const mapRaster = renderGbcMap(proj, "MahoganyTown");
      const metaRaster = renderGbcMapMetatile(proj, "MahoganyTown", 24);
      expect(extractBlock(metaRaster, 0, 0)).toEqual(extractBlock(mapRaster, 5 * 32, 2 * 32));
    },
  );

  itWithGbcCorpus(
    "the same id (24) on AzaleaTown renders different pixels than VioletCity -- a different tileset (TILESET_JOHTO_MODERN, not JOHTO) AND a different roof, asserted explicitly rather than assumed",
    () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const violet = proj.map("VioletCity");
      const azalea = proj.map("AzaleaTown");
      const { mapGroupRoofs } = proj.roofs();

      // The real facts, stated plainly (spec review finding 1): the two maps
      // do NOT share a tileset constant -- that was the original task spec's
      // wrong premise for this pair. What IS true, and still worth pinning,
      // is that metatile 24's raw tile DATA happens to be byte-identical
      // across both tileset tables (both ultimately alias the same Johto
      // metatile source), and the two maps' groups resolve to different roof
      // indices (review finding 6: VioletCity roof 1, AzaleaTown roof 2). The
      // "differs" assertion below can therefore come from either the
      // tileset difference or the roof difference (or both) -- it does NOT,
      // by itself, isolate the roof key the way the MahoganyTown test above
      // does; that isolation is what the MahoganyTown test is for.
      expect(azalea.tileset).toBe("TILESET_JOHTO_MODERN");
      expect(azalea.tileset).not.toBe(violet.tileset);
      expect(proj.tileset(violet.tileset).metatiles[24]).toEqual(proj.tileset(azalea.tileset).metatiles[24]);
      expect(mapGroupRoofs[violet.group]).not.toBe(mapGroupRoofs[azalea.group]);

      const violetMeta = renderGbcMapMetatile(proj, "VioletCity", 24);
      const azaleaMeta = renderGbcMapMetatile(proj, "AzaleaTown", 24);
      expect(extractBlock(azaleaMeta, 0, 0)).not.toEqual(extractBlock(violetMeta, 0, 0));
    },
  );

  itWithGbcCorpus('time: "nite" byte-equals the matching region of renderGbcMap(..., { time: "nite" }), and really differs from "day"', () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const mapRasterNite = renderGbcMap(proj, "VioletCity", { time: "nite" });
    const metaRasterNite = renderGbcMapMetatile(proj, "VioletCity", 24, { time: "nite" });
    expect(extractBlock(metaRasterNite, 0, 0)).toEqual(extractBlock(mapRasterNite, 4 * 32, 7 * 32));

    const metaRasterDay = renderGbcMapMetatile(proj, "VioletCity", 24, { time: "day" });
    expect(extractBlock(metaRasterNite, 0, 0)).not.toEqual(extractBlock(metaRasterDay, 0, 0));
  });

  itWithGbcCorpus("does NOT substitute block id 0 for the map's border metatile -- a raw metatile thumbnail, unlike renderGbcMap's own block rendering", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const map = proj.map("VioletCity");
    expect(map.border).toBe(5); // != 0, and metatile 0/5 are pixel-distinct (checked below), so a silent 0->border swap is visible
    expect(proj.tileset(map.tileset).metatiles[0]).not.toEqual(proj.tileset(map.tileset).metatiles[map.border]);

    const idZero = renderGbcMapMetatile(proj, "VioletCity", 0);
    const borderMetatile = renderGbcMapMetatile(proj, "VioletCity", map.border);
    expect(idZero.outOfRange).toBe(false);
    expect(extractBlock(idZero, 0, 0)).not.toEqual(extractBlock(borderMetatile, 0, 0));
  });

  itWithGbcCorpus("an out-of-range id returns the existing placeholder raster with outOfRange: true", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const ts = proj.tileset("TILESET_JOHTO");
    const raster = renderGbcMapMetatile(proj, "VioletCity", ts.metatiles.length); // one past the end
    expect(raster.outOfRange).toBe(true);
    expect(raster.unmappedTiles).toBe(0);
    // Same placeholder magenta renderGbcMetatile itself uses for an
    // out-of-range id -- pinned directly rather than re-deriving PLACEHOLDER.
    expect(pixelAt(raster, 0, 0)).toEqual([255, 0, 255, 255]);
  });
});
