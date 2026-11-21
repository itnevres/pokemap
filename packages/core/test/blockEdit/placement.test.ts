import { describe, expect, it } from "vitest";
import { placeGroup } from "../../src/blockEdit/placement.js";
import { gbcSheetToTileId } from "../../src/blockEdit/gbcOps.js";
import { openGbcProject } from "../../src/gbc/project.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../gbc/helpers/corpus.js";

const identity = (i: number): number => i;
describe("group placement", () => {
  it("2x2 at block edge clipped", () => {
    const input = Array(16).fill(-1) as number[];
    const result = placeGroup(input, 4, { x: 3, y: 1 }, 4, "2x2", 192, identity);
    expect(result).toEqual([-1,-1,-1,-1, -1,-1,-1,4, -1,-1,-1,20, -1,-1,-1,-1]);
    expect(input).toEqual(Array(16).fill(-1));
    expect(result).not.toBe(input);
  });
  it("past sheet end skipped", () => {
    expect(placeGroup([0,0,0,0], 2, {x:0,y:0}, 16, "2x2", 17, identity)).toEqual([16,0,0,0]);
  });
  it("row edge not wrapped", () => {
    expect(placeGroup([0,0,0,0], 2, {x:0,y:0}, 15, "2x2", 64, identity)).toEqual([15,0,31,0]);
  });
  it("unmapped source skipped", () => {
    expect(placeGroup([9,9,9,9], 2, {x:0,y:0}, 0, "2x2", 64, i => i === 1 ? null : i)).toEqual([0,9,16,17]);
  });
  it("1x1 replaces only the selected square", () => {
    expect(placeGroup([1,2,3,4], 2, {x:1,y:1}, 7, "1x1", 64, identity)).toEqual([1,2,3,7]);
  });
  itWithGbcCorpus("4x4 across $5F/$80 continues at $80", () => {
    const ts = openGbcProject(GBC_SUBJECT_ROOT).tileset("TILESET_FOREST");
    expect(ts.tiles.length, "forest sheet has both banks").toBeGreaterThan(0x83);
    expect(placeGroup(Array(16).fill(0) as number[], 4, {x:0,y:0}, 0x50, "4x4", ts.tiles.length, gbcSheetToTileId(ts))).toEqual([
      0x50,0x51,0x52,0x53, 0x80,0x81,0x82,0x83, 0x90,0x91,0x92,0x93, 0xa0,0xa1,0xa2,0xa3,
    ]);
  }, 60_000);
  itWithGbcCorpus("gbcSheetToTileId chooses the lowest id for duplicate mappings", () => {
    const ts = openGbcProject(GBC_SUBJECT_ROOT).tileset("TILESET_FOREST");
    expect(ts.tiles.length, "forest sheet has tile zero").toBeGreaterThan(0);
    const palMap = [...ts.palMap]; palMap[0] = {bank:0,pal:0}; palMap[0x80] = {bank:0,pal:0};
    expect(gbcSheetToTileId({...ts,palMap})(0)).toBe(0);
  }, 60_000);
  itWithGbcCorpus("gbcSheetToTileId maps banks and rejects past sheet", () => {
    const ts = openGbcProject(GBC_SUBJECT_ROOT).tileset("TILESET_FOREST");
    const convert = gbcSheetToTileId(ts);
    expect(ts.tiles.length, "forest sheet includes $60").toBeGreaterThan(0x60);
    expect(convert(0x5f)).toBe(0x5f);
    expect(convert(0x60)).toBe(0x80);
    expect(convert(ts.tiles.length)).toBeNull();
  }, 60_000);
});
