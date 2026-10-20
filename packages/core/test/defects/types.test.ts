import { describe, expect, it } from "vitest";
import { DEFECT_KIND_LABEL, type DataDefect, type DefectKind } from "../../src/defects/types.js";
import type { DataDefect as GbcDataDefect } from "../../src/gbc/model/types.js";
import { parseGrassFile, parseWaterFile } from "../../src/gbc/load/encounters.js";
import { outOfBoundsEventDefects } from "../../src/gbc/load/events.js";

describe("shared defect model", () => {
  it("labels every defect kind with the specified UI text", () => {
    expect(DEFECT_KIND_LABEL).toEqual({ build: "Build error", gameplay: "Gameplay", size: "Size mismatch" });
  });

  it("re-exports the shared shape for existing GBC consumers", () => {
    const kind: DefectKind = "size";
    const defect: DataDefect = { file: "maps/Test.blk", message: "Wrong size", kind, fix: "Trim maps/Test.blk." };
    const gbc: GbcDataDefect = defect;
    expect(gbc).toBe(defect);
  });

  it.each([parseGrassFile, parseWaterFile])("classifies missing wild-data terminators as gameplay with a file fix", (parse) => {
    const file = "data/wild/test.asm";
    expect(parse("", file).defects).toEqual([{
      file, kind: "gameplay", fix: `Add a final db -1 terminator to ${file}.`,
      message: `${file}: no "db -1" terminator found -- end of file ends the list (Decision 4)`,
    }]);
  });

  it("gives out-of-bounds events a gameplay kind and a specific file fix", () => {
    const defects = outOfBoundsEventDefects({ name: "Test", width: 1, height: 1 }, {
      warps: [{ x: 2, y: 0, destWarp: 1, mapConst: "TEST", lineIndex: 0 }],
      coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [],
    });
    expect(defects[0]).toMatchObject({
      file: "maps/Test.asm", kind: "gameplay",
      fix: "Move the warp at index 0 inside the 2x2 step grid in maps/Test.asm.",
    });
  });
});
