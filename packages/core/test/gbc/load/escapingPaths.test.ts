import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openGbcProject, type GbcProject } from "../../../src/gbc/project.js";
import { parseIncbins, parseIncludes } from "../../../src/gbc/load/incbin.js";
import { PathEscapeError, assertInsideRoot } from "../../../src/gbc/load/pathGuard.js";
import { GBC_SUBJECT_ROOT, copyGbcSubjectToTemp, itWithGbcCorpus, removeTemp } from "../helpers/corpus.js";

// D25 / Task F acceptance 2: a GBC INCBIN or INCLUDE path that leaves the
// project is a DataDefect on that component, with file and line context.
// The project still opens; nothing else is blocked.

const ESCAPING = ["../../outside.bin", "/abs/outside.bin", "C:/outside.bin", "..\\outside.bin", "gfx/../../outside.bin"];

describe("incbin line numbers", () => {
  it("parseIncbins and parseIncludes report the 1-based line of the directive", () => {
    const text = ["SECTION \"x\", ROMX", "", "A_Blocks:", '\tINCBIN "maps/A.blk"', "", "B_Blocks:", '\tINCBIN "maps/B.blk"'].join("\n");
    expect(parseIncbins(text).map((e) => [e.labels[0], e.path, e.line])).toEqual([
      ["A_Blocks", "maps/A.blk", 4],
      ["B_Blocks", "maps/B.blk", 7],
    ]);
    const crlf = ["TilesetXColl::", 'INCLUDE "data/x.asm"'].join("\r\n");
    expect(parseIncludes(crlf)[0]!.line).toBe(2);
  });
});

describe("assertInsideRoot", () => {
  it("throws a PathEscapeError carrying a ready defect record for every escaping spelling", () => {
    for (const path of ESCAPING) {
      let caught: unknown;
      try { assertInsideRoot(path, { file: "data/maps/blocks.asm", line: 12, key: "INCBIN" }); } catch (e) { caught = e; }
      expect(caught, path).toBeInstanceOf(PathEscapeError);
      const bp = (caught as PathEscapeError).brokenPath;
      expect(bp.file, path).toBe("data/maps/blocks.asm");
      expect(bp.line, path).toBe(12);
      expect(bp.key, path).toBe("INCBIN");
      expect(bp.path, path).toBe(path);
      expect(bp.message, path).toContain(path);
      expect(bp.message, path).toContain("data/maps/blocks.asm");
      expect(bp.message, path).toContain("12");
      expect(bp.fix.length, path).toBeGreaterThan(0);
      expect((caught as Error).message, path).toBe(bp.message);
    }
  });

  it("accepts ordinary repo-relative paths", () => {
    for (const path of ["maps/Route32.blk", "gfx/tilesets/kanto.2bpp.lz", "data/tilesets/a/b.bin"]) {
      expect(() => assertInsideRoot(path, { file: "x.asm", line: 1, key: "INCBIN" }), path).not.toThrow();
    }
  });
});

describe("openGbcProject with decomp paths that leave the project", () => {
  let root = "";
  let proj: GbcProject;
  const lines: Record<"blocks" | "tileset" | "roofs" | "palette", number> = { blocks: 0, tileset: 0, roofs: 0, palette: 0 };

  /** Replaces `from` with `to` on the first line containing `from` at or after `after`; returns its 1-based line. */
  function mutate(file: string, from: string, to: string, after = ""): number {
    const abs = join(root, file);
    const rows = readFileSync(abs, "utf8").split("\n");
    let start = 0;
    if (after) {
      start = rows.findIndex((l) => l.includes(after));
      if (start < 0) throw new Error(`fixture shape changed: ${after} not found in ${file}`);
    }
    const i = rows.findIndex((l, n) => n >= start && l.includes(from));
    if (i < 0) throw new Error(`fixture shape changed: ${from} not found in ${file}`);
    rows[i] = rows[i]!.replace(from, to);
    writeFileSync(abs, rows.join("\n"));
    return i + 1;
  }

  beforeAll(() => {
    // itWithGbcCorpus skips the cases, but beforeAll still runs: guard it.
    try { root = copyGbcSubjectToTemp(); } catch { return; }
    lines.blocks = mutate("data/maps/blocks.asm", '"maps/Route32.blk"', '"../../outside.blk"', "Route32_Blocks:");
    lines.tileset = mutate("gfx/tilesets.asm", '"data/tilesets/kanto_metatiles.bin"', '"../../outside/kanto_metatiles.bin"', "TilesetKantoMeta::");
    lines.roofs = mutate("data/maps/roofs.asm", '"gfx/tilesets/roofs/new_bark.2bpp"', '"../../outside/new_bark.2bpp"');
    lines.palette = mutate("engine/gfx/color.asm", '"gfx/tilesets/bg_tiles.pal"', '"../../outside/bg_tiles.pal"', "TilesetBGPalette:");
    proj = openGbcProject(root);
  });
  afterAll(() => { if (root) removeTemp(root); });

  const escape = (fn: () => unknown): PathEscapeError => {
    try { fn(); } catch (e) {
      expect(e).toBeInstanceOf(PathEscapeError);
      return e as PathEscapeError;
    }
    throw new Error("expected a PathEscapeError, nothing was thrown");
  };

  itWithGbcCorpus("opens, and marks the map whose blocks.asm INCBIN escapes, with file and line", () => {
    const bad = proj.map("Route32");
    expect(bad.brokenPaths).toHaveLength(1);
    expect(bad.brokenPaths![0]).toMatchObject({ file: "data/maps/blocks.asm", line: lines.blocks, path: "../../outside.blk" });
    expect(bad.brokenPaths![0]!.message).toContain("Route32");
    expect(proj.map("Route33").brokenPaths).toBeUndefined();
  });

  itWithGbcCorpus("refuses to load the broken map's layout (no read outside the project) and loads the others", () => {
    const e = escape(() => proj.layout(proj.map("Route32")));
    expect(e.brokenPath).toMatchObject({ file: "data/maps/blocks.asm", line: lines.blocks, path: "../../outside.blk" });
    expect(proj.layout(proj.map("Route33")).layout.blocks.length).toBeGreaterThan(0);
  });

  itWithGbcCorpus("refuses a tileset whose Meta INCBIN escapes, with file and line, and loads the others", () => {
    const e = escape(() => proj.tileset("TILESET_KANTO"));
    expect(e.brokenPath).toMatchObject({ file: "gfx/tilesets.asm", line: lines.tileset, path: "../../outside/kanto_metatiles.bin" });
    expect(proj.tileset("TILESET_JOHTO").metatiles.length).toBeGreaterThan(0);
  });

  itWithGbcCorpus("refuses the roofs when a roof INCBIN escapes", () => {
    const e = escape(() => proj.roofs());
    expect(e.brokenPath).toMatchObject({ file: "data/maps/roofs.asm", line: lines.roofs, path: "../../outside/new_bark.2bpp" });
  });

  itWithGbcCorpus("refuses the palette tables when a palette INCLUDE escapes", () => {
    const e = escape(() => proj.paletteTables());
    expect(e.brokenPath).toMatchObject({ file: "engine/gfx/color.asm", line: lines.palette, path: "../../outside/bg_tiles.pal" });
  });

  itWithGbcCorpus("an unmodified project has no broken paths", () => {
    const clean = openGbcProject(GBC_SUBJECT_ROOT);
    expect(clean.maps.filter((m) => m.brokenPaths).length).toBe(0);
    expect(() => clean.tileset("TILESET_KANTO")).not.toThrow();
  });
});
