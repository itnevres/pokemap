import { describe, it, expect } from "vitest";
import { isProjectInfo, isMapGroupsData, isGbcMapPayload } from "../../src/gbc/guards.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";

describe("isProjectInfo", () => {
  it("accepts a real gba ProjectInfo", () => {
    expect(isProjectInfo({ family: "gba", root: "/tmp/pokeemerald" })).toBe(true);
  });

  it("accepts a real gbc ProjectInfo", () => {
    expect(isProjectInfo({ family: "gbc", root: "/tmp/pokecrystal" })).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(isProjectInfo(null)).toBe(false);
    expect(isProjectInfo(undefined)).toBe(false);
    expect(isProjectInfo("gba")).toBe(false);
    expect(isProjectInfo(42)).toBe(false);
    expect(isProjectInfo([])).toBe(false);
  });

  it("rejects a family that isn't exactly gba or gbc", () => {
    expect(isProjectInfo({ family: "n64", root: "/tmp/x" })).toBe(false);
    expect(isProjectInfo({ family: "GBA", root: "/tmp/x" })).toBe(false);
    expect(isProjectInfo({ family: "", root: "/tmp/x" })).toBe(false);
    expect(isProjectInfo({ root: "/tmp/x" })).toBe(false);
  });

  it("rejects a non-string root", () => {
    expect(isProjectInfo({ family: "gba", root: 42 })).toBe(false);
    expect(isProjectInfo({ family: "gba", root: null })).toBe(false);
    expect(isProjectInfo({ family: "gba" })).toBe(false);
  });
});

describe("isMapGroupsData", () => {
  const VALID = { groupOrder: ["OLIVINE", "MAHOGANY"], groups: { OLIVINE: ["OlivineCity"], MAHOGANY: ["MahoganyTown"] } };

  it("accepts a real-shaped payload", () => {
    expect(isMapGroupsData(VALID)).toBe(true);
  });

  it("accepts an empty groupOrder/groups pair", () => {
    expect(isMapGroupsData({ groupOrder: [], groups: {} })).toBe(true);
  });

  it("accepts a group with an empty map list", () => {
    expect(isMapGroupsData({ groupOrder: ["OLIVINE"], groups: { OLIVINE: [] } })).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(isMapGroupsData(null)).toBe(false);
    expect(isMapGroupsData(undefined)).toBe(false);
    expect(isMapGroupsData("x")).toBe(false);
    expect(isMapGroupsData([])).toBe(false);
  });

  it("rejects a non-array groupOrder", () => {
    expect(isMapGroupsData({ groupOrder: "OLIVINE", groups: { OLIVINE: [] } })).toBe(false);
    expect(isMapGroupsData({ groupOrder: { 0: "OLIVINE" }, groups: { OLIVINE: [] } })).toBe(false);
    expect(isMapGroupsData({ groups: { OLIVINE: [] } })).toBe(false);
  });

  it("rejects a groupOrder whose entries aren't all strings", () => {
    expect(isMapGroupsData({ groupOrder: ["OLIVINE", 5], groups: { OLIVINE: [] } })).toBe(false);
  });

  it("rejects a non-string groupOrder entry even when it numerically coerces to a real key (isolates the string-array check from the key-exists check, since object keys are always strings)", () => {
    expect(isMapGroupsData({ groupOrder: [5], groups: { "5": ["x"] } })).toBe(false);
  });

  it("rejects a non-plain-object groups", () => {
    expect(isMapGroupsData({ groupOrder: [], groups: null })).toBe(false);
    expect(isMapGroupsData({ groupOrder: [], groups: [] })).toBe(false);
    expect(isMapGroupsData({ groupOrder: [] })).toBe(false);
  });

  it("rejects a groups value that isn't string[]", () => {
    expect(isMapGroupsData({ groupOrder: ["OLIVINE"], groups: { OLIVINE: "OlivineCity" } })).toBe(false);
    expect(isMapGroupsData({ groupOrder: ["OLIVINE"], groups: { OLIVINE: [1, 2] } })).toBe(false);
    expect(isMapGroupsData({ groupOrder: ["OLIVINE"], groups: { OLIVINE: ["OlivineCity", 5] } })).toBe(false);
  });

  it("rejects a groupOrder entry that is not a key of groups", () => {
    expect(isMapGroupsData({ groupOrder: ["OLIVINE", "MAHOGANY"], groups: { OLIVINE: ["OlivineCity"] } })).toBe(false);
  });
});

/** A real-shaped `GbcMapPayload`, every clause `isGbcMapPayload` checks
 *  satisfied -- 2x2 blocks (width*height=4), 3 metatiles (collision.length=3),
 *  all 4 event arrays present. Each test below mutates exactly ONE field
 *  away from this valid shape. */
function validGbcMapPayload(): GbcMapPayload {
  return {
    family: "gbc",
    map: {
      name: "Fixture", constName: "FIXTURE", group: 1, number: 1, width: 2, height: 2,
      blkPath: "maps/Fixture.blk", tileset: "TILESET_FIXTURE", environment: "ENVIRONMENT_TOWN",
      landmark: "LANDMARK_NONE", music: "MUSIC_NONE", phoneFlag: "0", palette: "PAL_MAP_TOWN",
      fishGroup: "0", border: 3, connectionFlags: "0", connections: [],
    },
    layout: { blkPath: "maps/Fixture.blk", width: 2, height: 2, writable: true },
    blocks: [{ metatileId: 0 }, { metatileId: 1 }, { metatileId: 2 }, { metatileId: 0 }],
    metatileCount: 3,
    tileset: { constName: "TILESET_FIXTURE", name: "TilesetFixture" },
    collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }, { tl: 7, tr: 7, bl: 7, br: 7 }, { tl: 0, tr: 0, bl: 0, br: 0 }],
    collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false }, "7": { name: "COLL_WALL", category: "wall", talk: false } },
    events: { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] },
    defects: [],
    paddingWidth: 3,
  };
}

describe("isGbcMapPayload", () => {
  it("accepts a real-shaped payload", () => {
    expect(isGbcMapPayload(validGbcMapPayload())).toBe(true);
  });

  it("rejects a non-object, and family !== gbc", () => {
    expect(isGbcMapPayload(null)).toBe(false);
    expect(isGbcMapPayload([])).toBe(false);
    expect(isGbcMapPayload({ ...validGbcMapPayload(), family: "gba" })).toBe(false);
  });

  it("rejects a non-string map.name", () => {
    const p = validGbcMapPayload();
    expect(isGbcMapPayload({ ...p, map: { ...p.map, name: 5 } })).toBe(false);
    expect(isGbcMapPayload({ ...p, map: null })).toBe(false);
  });

  it("rejects a non-positive-integer layout.width or layout.height", () => {
    const p = validGbcMapPayload();
    expect(isGbcMapPayload({ ...p, layout: { ...p.layout, width: 0 } })).toBe(false);
    expect(isGbcMapPayload({ ...p, layout: { ...p.layout, width: -1 } })).toBe(false);
    expect(isGbcMapPayload({ ...p, layout: { ...p.layout, width: 1.5 } })).toBe(false);
    expect(isGbcMapPayload({ ...p, layout: { ...p.layout, height: 0 } })).toBe(false);
    expect(isGbcMapPayload({ ...p, layout: null })).toBe(false);
  });

  it("isolates the positive/integer checks from the downstream blocks.length check (Plan 0 §7: a naive case can slip through by coincidence)", () => {
    const p = validGbcMapPayload();
    // width*height still equals blocks.length (4) in both cases below, so a
    // widened check that dropped positivity/integer-ness specifically (but
    // kept typeof === "number") would NOT be caught by the blocks.length
    // comparison alone -- these two cases are chosen precisely so the
    // product coincidentally matches, isolating what this test claims to
    // check.
    expect(isGbcMapPayload({ ...p, layout: { ...p.layout, width: -4, height: -1 } })).toBe(false); // negative, product 4
    expect(isGbcMapPayload({ ...p, layout: { ...p.layout, width: 8, height: 0.5 } })).toBe(false); // non-integer, product 4
  });

  it("rejects blocks.length !== width*height (mutation check #8)", () => {
    const p = validGbcMapPayload();
    expect(isGbcMapPayload({ ...p, blocks: p.blocks.slice(0, 3) })).toBe(false);
    expect(isGbcMapPayload({ ...p, blocks: [...p.blocks, { metatileId: 0 }] })).toBe(false);
    expect(isGbcMapPayload({ ...p, blocks: "not an array" })).toBe(false);
  });

  it("rejects collision.length !== metatileCount", () => {
    const p = validGbcMapPayload();
    expect(isGbcMapPayload({ ...p, collision: p.collision.slice(0, 2) })).toBe(false);
    expect(isGbcMapPayload({ ...p, metatileCount: "3" })).toBe(false);
    expect(isGbcMapPayload({ ...p, collision: "not an array" })).toBe(false);
  });

  it("rejects a non-record collisionInfo (spec review finding 12)", () => {
    const p = validGbcMapPayload();
    expect(isGbcMapPayload({ ...p, collisionInfo: [] })).toBe(false);
    expect(isGbcMapPayload({ ...p, collisionInfo: "x" })).toBe(false);
    expect(isGbcMapPayload({ ...p, collisionInfo: null })).toBe(false);
    expect(isGbcMapPayload({ ...p, collisionInfo: undefined })).toBe(false);
  });

  it("rejects a missing tileset or a non-string tileset.constName (spec review finding 12)", () => {
    const p = validGbcMapPayload();
    expect(isGbcMapPayload({ ...p, tileset: null })).toBe(false);
    expect(isGbcMapPayload({ ...p, tileset: { ...p.tileset, constName: 5 } })).toBe(false);
    expect(isGbcMapPayload({ ...p, tileset: {} })).toBe(false);
  });

  it("rejects events missing any of the four positioned arrays", () => {
    const p = validGbcMapPayload();
    expect(isGbcMapPayload({ ...p, events: { ...p.events, warps: undefined } })).toBe(false);
    expect(isGbcMapPayload({ ...p, events: { ...p.events, coords: "x" } })).toBe(false);
    expect(isGbcMapPayload({ ...p, events: { ...p.events, bgs: {} } })).toBe(false);
    expect(isGbcMapPayload({ ...p, events: { ...p.events, objects: null } })).toBe(false);
    expect(isGbcMapPayload({ ...p, events: null })).toBe(false);
  });

  it("rejects a non-array defects", () => {
    const p = validGbcMapPayload();
    expect(isGbcMapPayload({ ...p, defects: "none" })).toBe(false);
    expect(isGbcMapPayload({ ...p, defects: undefined })).toBe(false);
  });
});
