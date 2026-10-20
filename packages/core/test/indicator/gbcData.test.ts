import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gbcIndicatorSprite, loadGbcOwnSprites, rankGbcIndicatorSpecies, suggestGbcIndicatorPlacement,
} from "../../src/indicator/gbcData.js";
import { openGbcProject } from "../../src/gbc/project.js";
import type { Collision, GbcMap, GbcTileset } from "../../src/gbc/model/types.js";
import { loadGbcMapEvents } from "../../src/gbc/load/events.js";
import { parseCollisionConstants } from "../../src/gbc/load/tileset.js";
import { linkedSpecies } from "../../src/signs/linked.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus, removeTemp } from "../gbc/helpers/corpus.js";
import { stubGbcProject } from "../gbc/helpers/stubGbcProject.js";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "pokemap-indicator-data-"));
  roots.push(root);
  return root;
}
function put(root: string, path: string, text: string): void {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, text);
}
afterAll(() => roots.forEach(removeTemp));

// Hand-transcribed after reading PerfPlus constants/sprite_constants.asm:
// regular block lines 73, 86, 103-105; SpriteMons block lines 114-148.
// Checked against pokemon_constants.asm's species block (lines 21-273),
// not the later Unown-form enum. No computed intersection supplies this oracle.
const PERFPLUS_OWN = [
  "SLOWPOKE", "SUDOWOODO", "SUICUNE", "ENTEI", "RAIKOU",
  "UNOWN", "GEODUDE", "GROWLITHE", "WEEDLE", "SHELLDER", "ODDISH", "GENGAR",
  "ZUBAT", "MAGIKARP", "SQUIRTLE", "TOGEPI", "BUTTERFREE", "DIGLETT", "POLIWAG",
  "PIKACHU", "CLEFAIRY", "CHARMANDER", "JYNX", "STARMIE", "BULBASAUR",
  "JIGGLYPUFF", "GRIMER", "EKANS", "PARAS", "TENTACOOL", "TAUROS", "MACHOP",
  "VOLTORB", "LAPRAS", "RHYDON", "MOLTRES", "SNORLAX", "GYARADOS", "LUGIA", "HO_OH",
];

describe("GBC Indicator sprites and species", () => {
  itWithGbcCorpus("own sprites equal the independent PerfPlus list", () => {
    const own = loadGbcOwnSprites(GBC_SUBJECT_ROOT);
    expect(own).toEqual(new Set(PERFPLUS_OWN));
    for (const species of ["GEODUDE", "SLOWPOKE", "SNORLAX"]) expect(own.has(species)).toBe(true);
    for (const species of ["SENTRET", "MONSTER", "POKEMON"]) expect(own.has(species)).toBe(false);
  });

  it("sprite pick preserves exact species constants, including double underscores", () => {
    const own = new Set(PERFPLUS_OWN);
    expect(gbcIndicatorSprite("GEODUDE", own)).toBe("SPRITE_GEODUDE");
    expect(gbcIndicatorSprite("SENTRET", own)).toBe("SPRITE_MONSTER");
    expect(gbcIndicatorSprite("MR__MIME", own)).toBe("SPRITE_MONSTER");
    expect(gbcIndicatorSprite("MR__MIME", new Set(["MR__MIME"]))).toBe("SPRITE_MR__MIME");
  });

  it("intersects actual definitions with species, excluding comments and macro bodies", () => {
    const root = tempRoot();
    put(root, "constants/pokemon_constants.asm", "const_def 1\nconst GEODUDE\nconst SENTRET\nconst MR__MIME\nconst EGG\nconst_def 1\nconst UNOWN_A\n");
    put(root, "constants/sprite_constants.asm", [
      "const_def", "const SPRITE_MONSTER", "const SPRITE_GEODUDE", "const_next $80",
      "DEF SPRITE_POKEMON EQU const_value", "const SPRITE_MR__MIME", "const SPRITE_EGG",
      "const SPRITE_UNOWN_A", "; const SPRITE_SENTRET", "MACRO fake", "const SPRITE_SENTRET", "ENDM",
    ].join("\n"));
    expect(loadGbcOwnSprites(root)).toEqual(new Set(["GEODUDE", "MR__MIME"]));
  });

  it("guard names the missing sprite constants file", () => {
    const root = tempRoot();
    expect(() => loadGbcOwnSprites(root)).toThrow(/constants[\\/]sprite_constants\.asm.*Restore constants\/sprite_constants\.asm from the decomp, or check the project root\./);
  });

  it("locates malformed sprite const_def errors and explains the fix", () => {
    const root = tempRoot();
    put(root, "constants/sprite_constants.asm", "const_def BOGUS\n");
    expect(() => loadGbcOwnSprites(root)).toThrow(/constants[\\/]sprite_constants\.asm.*parseNum:.*BOGUS.*Restore constants\/sprite_constants\.asm from the decomp, or check the project root\./);
  });

  it("adds fix guidance when sprite constants are unreadable", () => {
    const root = tempRoot();
    mkdirSync(join(root, "constants/sprite_constants.asm"), { recursive: true });
    expect(() => loadGbcOwnSprites(root)).toThrow(/constants[\\/]sprite_constants\.asm.*Restore constants\/sprite_constants\.asm from the decomp, or check the project root\./);
  });

  it("locates missing species constants and explains the fix", () => {
    const root = tempRoot();
    put(root, "constants/sprite_constants.asm", "const_def\nconst SPRITE_GEODUDE\n");
    expect(() => loadGbcOwnSprites(root)).toThrow(/constants[\\/]pokemon_constants\.asm.*Restore constants\/pokemon_constants\.asm from the decomp, or check the project root\./);
  });

  it("names guard names the missing names file before reading encounters", () => {
    const root = tempRoot();
    expect(() => rankGbcIndicatorSpecies(stubGbcProject({ root }), "Route29"))
      .toThrow(/data[\\/]pokemon[\\/]names\.asm.*Restore data\/pokemon\/names\.asm from the decomp, or check the project root\./);
  });

  it("adds fix guidance when the species-name table is unreadable", () => {
    const root = tempRoot();
    mkdirSync(join(root, "data/pokemon/names.asm"), { recursive: true });
    expect(() => rankGbcIndicatorSpecies(stubGbcProject({ root }), "Route29"))
      .toThrow(/data[\\/]pokemon[\\/]names\.asm.*Restore data\/pokemon\/names\.asm from the decomp, or check the project root\./);
  });

  itWithGbcCorpus("species Route29 match linkedSpecies and the independent 10a B3 order", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const ranked = rankGbcIndicatorSpecies(proj, "Route29");
    expect(ranked.map((row) => row.name)).toEqual(linkedSpecies("gbc", proj, "Route29"));
    expect(ranked.map((row) => row.name)).toEqual([
      "HOOTHOOT", "PIDGEY", "RATTATA", "SENTRET", "PINECO", "EXEGGCUTE", "LEDYBA", "SPINARAK", "HOPPIP",
    ]);
    // johto_grass.asm:1256-1262 night slots 0/2/5/6: 25+20+5+5 = 55.
    // treemons.asm:59-75 gives 50 in both headbutt lists, so best stays 55.
    expect(ranked[0]).toEqual({ species: "HOOTHOOT", name: "HOOTHOOT", percent: 55 });
    expect(new Set(ranked.map((row) => row.species)).size).toBe(ranked.length);
  });
});

function placementFixture(grass: { x: number; y: number }[], occupied: { x: number; y: number }[] = []) {
  const root = tempRoot();
  // Deliberately non-retail value: grass must be resolved from this file.
  put(root, "constants/collision_constants.asm", "DEF COLL_TALL_GRASS EQU $42\n");
  put(root, "maps/Test.asm", [
    "Test_MapScripts:", "def_scene_scripts", "def_callbacks", "Test_MapEvents:",
    "def_warp_events", "def_coord_events", "def_bg_events", "def_object_events",
    ...occupied.map(({ x, y }) => `object_event ${x}, ${y}, SPRITE_MONSTER, SPRITEMOVEDATA_POKEMON, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, TestScript, -1`),
  ].join("\n"));
  const collision: Collision[] = Array.from({ length: 4 }, () => ({ tl: 0, tr: 0, bl: 0, br: 0 }));
  for (const { x, y } of grass) {
    const block = collision[Math.floor(y / 2) * 2 + Math.floor(x / 2)]!;
    const quadrant = y % 2 === 0 ? (x % 2 === 0 ? "tl" : "tr") : (x % 2 === 0 ? "bl" : "br");
    block[quadrant] = 0x42;
  }
  const map: GbcMap = {
    name: "Test", constName: "TEST", group: 1, number: 1, width: 2, height: 2,
    blkPath: "maps/Test.blk", tileset: "TILESET_TEST", environment: "ROUTE", landmark: "",
    music: "", phoneFlag: "", palette: "", fishGroup: "FISHGROUP_NONE", border: 0,
    connectionFlags: "0", connections: [],
  };
  return stubGbcProject({
    root, maps: [map], map: () => map,
    layout: () => ({ layout: { blkPath: map.blkPath, width: 2, height: 2,
      blocks: [0, 1, 2, 3].map((metatileId) => ({ metatileId })) }, defects: [] }),
    tileset: () => ({ collision }) as GbcTileset,
  });
}

describe("GBC Indicator placement", () => {
  it.each([undefined, "", "DEF COLL_TALL_GRASS EQU BOGUS\n"])(
    "locates missing or malformed collision constants and explains the fix: %s", (text) => {
      const proj = { ...placementFixture([]), root: tempRoot() };
      if (text !== undefined) put(proj.root, "constants/collision_constants.asm", text);
      expect(() => suggestGbcIndicatorPlacement(proj, "Test"))
        .toThrow(/constants[\\/]collision_constants\.asm.*Restore constants\/collision_constants\.asm from the decomp, or check the project root\./);
    },
  );

  it.each([
    { occupied: [], expected: { x: 1, y: 0 } },
    { occupied: [{ x: 1, y: 0 }], expected: { x: 1, y: 2 } },
    { occupied: [{ x: 1, y: 0 }, { x: 1, y: 2 }], expected: { x: 0, y: 1 } },
    { occupied: [{ x: 1, y: 0 }, { x: 1, y: 2 }, { x: 0, y: 1 }], expected: { x: 2, y: 1 } },
  ])("tries up, down, left, right and skips object steps: $expected", ({ occupied, expected }) => {
    expect(suggestGbcIndicatorPlacement(placementFixture([{ x: 1, y: 1 }], occupied), "Test"))
      .toEqual(expected);
  });

  it("uses supplied current STEP occupancy instead of disk objects without mutating it", () => {
    const proj = placementFixture([{ x: 1, y: 1 }], [{ x: 1, y: 0 }]);
    expect(suggestGbcIndicatorPlacement(proj, "Test")).toEqual({ x: 1, y: 2 });
    const occupied = new Set(["1,0", "1,2"]);
    expect(suggestGbcIndicatorPlacement(proj, "Test", occupied)).toEqual({ x: 0, y: 1 });
    expect(occupied).toEqual(new Set(["1,0", "1,2"]));
    expect(suggestGbcIndicatorPlacement(proj, "Test", new Set())).toEqual({ x: 1, y: 0 });
    expect(suggestGbcIndicatorPlacement(proj, "Test", new Set(["1,0", "1,2", "0,1", "2,1"]))).toBeNull();
    expect(suggestGbcIndicatorPlacement(proj, "Test")).toEqual({ x: 1, y: 2 });
  });

  it("scans grass in STEP row-major order across block boundaries", () => {
    expect(suggestGbcIndicatorPlacement(placementFixture([{ x: 0, y: 1 }, { x: 2, y: 0 }]), "Test"))
      .toEqual({ x: 2, y: 1 });
  });

  it("skips out-of-bounds and grass neighbours", () => {
    expect(suggestGbcIndicatorPlacement(placementFixture([{ x: 0, y: 0 }, { x: 0, y: 1 }]), "Test"))
      .toEqual({ x: 1, y: 0 });
  });

  it("returns null without grass or when every neighbour has an object", () => {
    expect(suggestGbcIndicatorPlacement(placementFixture([]), "Test")).toBeNull();
    expect(suggestGbcIndicatorPlacement(placementFixture([{ x: 1, y: 1 }], [
      { x: 1, y: 0 }, { x: 1, y: 2 }, { x: 0, y: 1 }, { x: 2, y: 1 },
    ]), "Test")).toBeNull();
  });

  itWithGbcCorpus("placement Route29 is in bounds, non-grass, adjacent to grass and unoccupied", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const map = proj.map("Route29");
    const result = suggestGbcIndicatorPlacement(proj, map.name);
    expect(result).not.toBeNull();
    const { x, y } = result!;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(map.width * 2);
    expect(y).toBeLessThan(map.height * 2);
    const grass = parseCollisionConstants(readFileSync(`${proj.root}/constants/collision_constants.asm`, "utf8"))
      .get("COLL_TALL_GRASS")!;
    expect(grass).toBeDefined();
    const { layout } = proj.layout(map);
    const { collision } = proj.tileset(map.tileset);
    const at = (sx: number, sy: number): number | undefined => {
      if (sx < 0 || sy < 0 || sx >= map.width * 2 || sy >= map.height * 2) return undefined;
      const id = layout.blocks[Math.floor(sy / 2) * map.width + Math.floor(sx / 2)]!.metatileId;
      const c = collision[id]!;
      return sy % 2 === 0 ? (sx % 2 === 0 ? c.tl : c.tr) : (sx % 2 === 0 ? c.bl : c.br);
    };
    expect(at(x, y)).not.toBe(grass);
    expect([at(x, y - 1), at(x, y + 1), at(x - 1, y), at(x + 1, y)]).toContain(grass);
    expect(loadGbcMapEvents(proj.root, map).events.objects.some((o) => o.x === x && o.y === y)).toBe(false);
  });

  itWithGbcCorpus("grass-free NewBarkTown has no suggestion", () => {
    expect(suggestGbcIndicatorPlacement(openGbcProject(GBC_SUBJECT_ROOT), "NewBarkTown")).toBeNull();
  });
});
