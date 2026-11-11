import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BlockEditRefusal, type FileOverlay, type StagedGrids } from "../../src/blockEdit/types.js";
import { gbaGridIds, gbcGridIds } from "../../src/blockEdit/grids.js";
import { openProject as loadProject } from "../../src/project.js";
import { openGbcProject } from "../../src/gbc/project.js";
import { renderLayout } from "../../src/render/layout.js";
import { renderGbcMap } from "../../src/gbc/render/map.js";
import { parseTilesetPaths } from "../../src/load/tilesets.js";
import { readIndexedPng } from "../../src/load/png.js";
import { readShadesPng } from "../../src/gbc/load/png.js";
import { parseConstDefs } from "../../src/gbc/load/asm.js";
import { sliceTiles } from "../../src/gbc/load/tileset.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../gbc/helpers/corpus.js";
import { copyGbaTilesetProject, removeGbaTemp } from "../helpers/gbaTilesetProject.js";

// The contracts every later Plan 14.2 task builds on: the refusal shape, the
// overlay (a project-scoped map from resolved repo-relative file path to
// bytes), the grid-id helpers, and a hermetic GBA project copy to write to.
//
// The corpus is read-only here: GBA writes go to a temp copy made by
// `copyGbaTilesetProject`; the GBC tests only set in-memory overlays.

type Rgba = [number, number, number, number];

function pixelAt(r: { width: number; data: Uint8ClampedArray }, x: number, y: number): Rgba {
  const i = (y * r.width + x) * 4;
  return [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!, r.data[i + 3]!];
}

/** Center pixel of GBA block `index` (16x16 blocks, no border). */
function gbaBlockPixel(r: { width: number; data: Uint8ClampedArray }, index: number, blockWidth: number): Rgba {
  return pixelAt(r, (index % blockWidth) * 16 + 8, Math.floor(index / blockWidth) * 16 + 8);
}

/** Center pixel of GBC block `index` (32x32 blocks, no border). */
function gbcBlockPixel(r: { width: number; data: Uint8ClampedArray }, index: number, blockWidth: number): Rgba {
  return pixelAt(r, (index % blockWidth) * 32 + 16, Math.floor(index / blockWidth) * 32 + 16);
}

/**
 * The first pair of cells whose metatile ids differ, are both valid and (for
 * GBA) both inside the primary half, and that render a different center
 * pixel. Without the pixel difference a swap test could pass on two
 * metatiles that happen to look identical.
 */
function findSwappablePair(
  ids: readonly number[],
  pixel: (index: number) => Rgba,
  valid: (id: number) => boolean,
  limit = 400,
): [number, number] {
  const n = Math.min(ids.length, limit);
  for (let i = 0; i < n; i++) {
    const a = ids[i]!;
    if (!valid(a)) continue;
    for (let j = 0; j < n; j++) {
      const b = ids[j]!;
      if (b === a || !valid(b)) continue;
      if (pixel(i).join() !== pixel(j).join()) return [i, j];
    }
  }
  throw new Error("test fixture: no swappable metatile pair found");
}

// ---------------------------------------------------------------------------
// Contracts that need no corpus.
// ---------------------------------------------------------------------------

describe("block-edit contracts", () => {
  it("BlockEditRefusal carries a BlockEditCode, the message, and a distinct name", () => {
    const e = new BlockEditRefusal("BLOCK_CAP", "forest_metatiles.bin: block cap 256 reached");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(BlockEditRefusal);
    expect(e.code).toBe("BLOCK_CAP");
    expect(e.message).toBe("forest_metatiles.bin: block cap 256 reached");
    expect(e.name).toBe("BlockEditRefusal");
  });

  it("gbcGridIds keeps row-major order and masks each id to a byte", () => {
    expect(gbcGridIds([{ metatileId: 0 }, { metatileId: 0x100 + 3 }, { metatileId: 0xff }])).toEqual([0, 3, 0xff]);
  });

  it("gbaGridIds keeps row-major order and masks with the metatile id mask", () => {
    expect(gbaGridIds([{ metatileId: 0x405 }, { metatileId: 0x3ff }])).toEqual([5, 0x3ff]);
    expect(gbaGridIds([{ metatileId: 0x105 }], 0x1ff)).toEqual([0x105]);
  });

  it("FileOverlay and StagedGrids are keyed by resolved file path / map name", () => {
    const overlay: FileOverlay = new Map([["data/tilesets/primary/general/metatiles.bin", Buffer.alloc(0)]]);
    expect(overlay.get("data/tilesets/primary/general/metatiles.bin")).toBeInstanceOf(Buffer);
    const grids: StagedGrids = new Map([["PetalburgCity", [1, 2, 3]]]);
    expect(grids.get("PetalburgCity")).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// GBA corpus.
// ---------------------------------------------------------------------------

let gbaRoot: string | undefined;
/** One temp copy per file; each test opens its own Project over it. */
const gbaProjectRoot = (): string => (gbaRoot ??= copyGbaTilesetProject());

afterAll(() => {
  if (gbaRoot) removeGbaTemp(gbaRoot);
});

describe("GBA tileset overlay", () => {
  itWithCorpus("copyGbaTilesetProject loads with loadProject and renders a layout", () => {
    const root = gbaProjectRoot();
    expect(root).not.toBe(SUBJECT_ROOT);
    const project = loadProject(root);
    const layout = project.layoutForMap("PetalburgCity");
    const raster = renderLayout(project, layout.name);
    expect(raster.width).toBe(layout.width * 16);
    expect(raster.height).toBe(layout.height * 16);
    expect(raster.outOfRangeCount).toBe(0);
  });

  itWithCorpus("tilesetPaths returns the paths parseTilesetPaths resolved", () => {
    const project = loadProject(gbaProjectRoot());
    const readText = (p: string) => readFileSync(p, "utf8");
    const expected = parseTilesetPaths(
      readText(project.paths.tilesetHeadersH),
      readText(project.paths.tilesetMetatilesH),
      [readText(project.paths.tilesetGraphicsH), readText(project.paths.tilesetGraphicsC)],
    );
    const symbols = project.tilesetSymbols();
    expect(symbols.length).toBeGreaterThan(0);
    for (const symbol of symbols) expect(project.tilesetPaths(symbol)).toEqual(expected.get(symbol));
    expect(() => project.tilesetPaths("gTileset_Nope")).toThrow(/gTileset_Nope/);
  });

  itWithCorpus("overlay changes a GBA metatile and clearing it restores the layout", () => {
    const project = loadProject(gbaProjectRoot());
    const layout = project.layoutByName("PetalburgCity_Layout")!;
    const before = renderLayout(project, layout.name);
    const split = project.splitFor(layout);
    const ids = before.blocks.slice(0, layout.width * layout.height).map((b) => b.metatileId);
    const pixel = (i: number) => gbaBlockPixel(before, i, layout.width);
    // Both ids must live in the primary half: the overlay below patches only
    // the primary tileset's metatiles file.
    const [i, j] = findSwappablePair(ids, pixel, (id) => id < split.metatiles);
    const tp = project.tilesetPaths(layout.primaryTileset);
    const patched = Buffer.from(readFileSync(`${gbaProjectRoot()}/${tp.metatilesBin}`));
    // 8 u16 tile entries = 16 bytes per metatile.
    const source = Buffer.from(patched.subarray(ids[j]! * 16, ids[j]! * 16 + 16));
    source.copy(patched, ids[i]! * 16);

    expect(project.tilesetGeneration).toBe(0);
    project.setTilesetOverlay(new Map([[tp.metatilesBin, patched]]));
    expect(project.tilesetGeneration).toBe(1);

    const after = renderLayout(project, layout.name);
    expect(gbaBlockPixel(after, i, layout.width)).toEqual(gbaBlockPixel(before, j, layout.width));
    expect(gbaBlockPixel(after, i, layout.width)).not.toEqual(gbaBlockPixel(before, i, layout.width));

    project.setTilesetOverlay(new Map());
    expect(project.tilesetGeneration).toBe(2);
    const restored = renderLayout(project, layout.name);
    expect(gbaBlockPixel(restored, i, layout.width)).toEqual(gbaBlockPixel(before, i, layout.width));
  });

  itWithCorpus("overlay is consulted for the GBA sheet PNG and .pal palette", () => {
    const project = loadProject(gbaProjectRoot());
    const symbol = "gTileset_General";
    const tp = project.tilesetPaths(symbol);
    const otherPngBytes = readFileSync(`${gbaProjectRoot()}/${project.tilesetPaths("gTileset_Petalburg").tilesPng}`);
    const palPath = tp.palettes[0]!.replace(/\.gbapal$/, ".pal");
    const jasc = ["JASC-PAL", "0100", "16", ...Array.from({ length: 16 }, () => "255 0 0")].join("\n") + "\n";

    project.setTilesetOverlay(new Map<string, Buffer>([
      [tp.tilesPng, otherPngBytes],
      [palPath, Buffer.from(jasc, "utf8")],
    ]));

    const loaded = project.tileset(symbol);
    const expected = readIndexedPng(otherPngBytes);
    expect(loaded.tiles.width).toBe(expected.width);
    expect(loaded.tiles.height).toBe(expected.height);
    expect(loaded.tiles.indices).toEqual(expected.indices);
    expect(loaded.palettes[0]![0]).toEqual({ r: 255, g: 0, b: 0 });
  });
});

// ---------------------------------------------------------------------------
// GBC corpus. In-memory overlays only; the scratch root itself is not written.
// ---------------------------------------------------------------------------

describe("GBC tileset overlay", () => {
  itWithGbcCorpus("overlay changes a GBC render and clearing it restores the map", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const mapName = "NewBarkTown";
    const map = proj.map(mapName);
    const before = renderGbcMap(proj, mapName);
    const ts = proj.tileset(map.tileset);
    const blocks = proj.layout(map).layout.blocks;
    const ids = blocks.map((b) => b.metatileId);
    const pixel = (i: number) => gbcBlockPixel(before, i, map.width);
    // Block 0 is drawn as the map's border metatile; never choose it.
    const [i, j] = findSwappablePair(ids, pixel, (id) => id !== 0 && id < ts.metatiles.length);

    const path = ts.metatilesPath;
    const patched = Buffer.from(readFileSync(`${GBC_SUBJECT_ROOT}/${path}`));
    const source = Buffer.from(patched.subarray(ids[j]! * 16, ids[j]! * 16 + 16));
    source.copy(patched, ids[i]! * 16);

    expect(proj.tilesetGeneration).toBe(0);
    proj.setTilesetOverlay(new Map([[path, patched]]));
    expect(proj.tilesetGeneration).toBe(1);

    const after = renderGbcMap(proj, mapName);
    expect(gbcBlockPixel(after, i, map.width)).toEqual(gbcBlockPixel(before, j, map.width));
    expect(gbcBlockPixel(after, i, map.width)).not.toEqual(gbcBlockPixel(before, i, map.width));

    proj.setTilesetOverlay(new Map());
    expect(proj.tilesetGeneration).toBe(2);
    const restored = renderGbcMap(proj, mapName);
    expect(gbcBlockPixel(restored, i, map.width)).toEqual(gbcBlockPixel(before, i, map.width));
  });

  itWithGbcCorpus("overlay is consulted for the GBC sheet PNG and palette map", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const ts = proj.tileset("TILESET_LAB");
    const otherPngBytes = readFileSync(`${GBC_SUBJECT_ROOT}/gfx/tilesets/johto.png`);
    const palBg = parseConstDefs(readFileSync(`${GBC_SUBJECT_ROOT}/constants/tileset_constants.asm`, "utf8"));
    const palText = readFileSync(`${GBC_SUBJECT_ROOT}/${ts.palMapPath}`, "utf8");
    const line = /(^[ \t]*tilepal[ \t]+0[ \t]*,[ \t]*)([A-Za-z0-9_]+)/m.exec(palText);
    expect(line).not.toBeNull();
    const current = line![2]!;
    const replacement = current === "RED" ? "GREEN" : "RED";
    const patchedPal = palText.replace(
      /(^[ \t]*tilepal[ \t]+0[ \t]*,[ \t]*)([A-Za-z0-9_]+)/m,
      (_all, prefix: string) => `${prefix}${replacement}`,
    );

    proj.setTilesetOverlay(new Map<string, Buffer>([
      [ts.gfxPath, otherPngBytes],
      [ts.palMapPath, Buffer.from(patchedPal, "utf8")],
    ]));

    const loaded = proj.tileset("TILESET_LAB");
    expect(loaded.tiles).toEqual(sliceTiles(readShadesPng(otherPngBytes), ts.gfxPath));
    expect(loaded.palMap[0]).toEqual({ bank: 0, pal: palBg.get(`PAL_BG_${replacement}`) });
  });
});
