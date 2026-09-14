import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planSave, commitSave, type EditSession } from "../../src/write/save.js";
import { encodeBlocks } from "../../src/load/blocks.js";
import { defaultProfile } from "../../src/config/engine.js";
import type { Block, Layout } from "../../src/model/types.js";
import { parseMap, type MapData } from "../../src/load/maps.js";
import type { Project } from "../../src/project.js";

const profile = defaultProfile("pokeemerald");
const LAYOUT: Layout = {
  id: "LAYOUT_TEST", name: "Test_Layout", width: 2, height: 2,
  borderWidth: 2, borderHeight: 2, primaryTileset: "x", secondaryTileset: "y",
  borderFilepath: "border.bin", blockdataFilepath: "map.bin",
};
const MAP_JSON = `{
  "id": "MAP_TEST",
  "name": "Test",
  "layout": "LAYOUT_TEST",
  "music": "MUS_ROUTE101",
  "region_map_section": "MAPSEC_TEST",
  "map_type": "MAP_TYPE_ROUTE",
  "weather": "WEATHER_NONE",
  "connections": 0,
  "object_events": [],
  "warp_events": [],
  "coord_events": [],
  "bg_events": []
}`;

// A local fixture, distinct from MAP_JSON above, seeding three
// object_events -- exists only for the removeOps orchestration tests
// below, which need real elements at known indices to remove.
const SEEDED_MAP_JSON = `{
  "id": "MAP_TEST",
  "name": "Test",
  "layout": "LAYOUT_TEST",
  "music": "MUS_ROUTE101",
  "region_map_section": "MAPSEC_TEST",
  "map_type": "MAP_TYPE_ROUTE",
  "weather": "WEATHER_NONE",
  "connections": 0,
  "object_events": [
    { "graphics_id": "OBJ_A" },
    { "graphics_id": "OBJ_B" },
    { "graphics_id": "OBJ_C" }
  ],
  "warp_events": [],
  "coord_events": [],
  "bg_events": []
}`;

function stubProject(root: string): Project {
  const unused = (fn: string) => (): never => { throw new Error(`stub: ${fn} should not be called`); };
  return {
    paths: { root, mapJson: (n: string) => `${root}/${n}.json` } as unknown as Project["paths"],
    profile,
    // A real (non-throwing) constants object -- guardLayoutSave's
    // idOutOfRange reads proj.constants.metatilesTotal to compute the
    // ceiling, and Math.min(x, undefined) is NaN, which makes every
    // `id >= ceiling` comparison false regardless of id. `unused()` here
    // would silently defeat the out-of-range refusal test below.
    constants: {
      tilesInPrimary: 512, tilesInPrimaryEmerald: 512,
      metatilesInPrimary: 512, metatilesInPrimaryEmerald: 512,
      palsInPrimary: 6, palsInPrimaryEmerald: 6,
      metatilesTotal: 1024,
    } as Project["constants"],
    layouts: [LAYOUT],
    groups: unused("groups") as unknown as Project["groups"],
    layoutByName: (n) => (n === LAYOUT.name ? LAYOUT : undefined),
    layoutById: (id) => (id === LAYOUT.id ? LAYOUT : undefined),
    layoutForMap: () => LAYOUT,
    splitFor: () => ({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 }),
    // Secondary tileset deliberately small (real secondary tilesets are
    // nowhere near 512 metatiles) -- gives idOutOfRange's ceiling real room
    // below 1024 so a bogus id like 999 actually falls outside it.
    tileset: (symbol: string) => ({
      symbol, isSecondary: symbol === LAYOUT.secondaryTileset,
      metatileCount: symbol === LAYOUT.secondaryTileset ? 100 : 512,
      tiles: {} as any, palettes: [], attributes: [], metatile: () => [], layerType: () => 0, behavior: () => 0,
    }),
    tilesetSymbols: () => [],
    map: unused("map"),
    mapNames: () => ["Test"],
  };
}

const roots: string[] = [];
function tempProject(): { root: string; proj: Project } {
  const root = mkdtempSync(join(tmpdir(), "pokemap-save-"));
  roots.push(root);
  const blocks: Block[] = Array.from({ length: 4 }, () => ({ metatileId: 1, collision: 0, elevation: 3 }));
  const border: Block[] = Array.from({ length: 4 }, () => ({ metatileId: 0, collision: 0, elevation: 0 }));
  writeFileSync(join(root, "map.bin"), encodeBlocks(blocks, profile));
  writeFileSync(join(root, "border.bin"), encodeBlocks(border, profile));
  writeFileSync(join(root, "Test.json"), MAP_JSON);
  return { root, proj: stubProject(root) };
}
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function baseSession(root: string): EditSession {
  const blocks: Block[] = Array.from({ length: 4 }, () => ({ metatileId: 1, collision: 0, elevation: 3 }));
  const border: Block[] = Array.from({ length: 4 }, () => ({ metatileId: 0, collision: 0, elevation: 0 }));
  // parseMap (not a raw JSON.parse) -- MapData's fields are camelCase
  // (warpEvents, objectEvents, ...), produced only by the real parser;
  // it also already coerces the decomp's `"connections": 0` idiom to `[]`.
  const map: MapData = parseMap(MAP_JSON);
  return {
    mapName: "Test", layout: LAYOUT, blocks, border, map,
    // originalBlocks/originalMap point at the SAME objects `blocks`/`map`
    // above at construction time -- every test below that edits the
    // session reassigns `session.blocks = session.blocks.map(...)` (a NEW
    // array), never mutates the existing one in place, so this closure
    // variable stays the untouched "session opened with" snapshot exactly
    // as EditSession's own doc comment requires. A test that ever mutates
    // `blocks`/`border`/`map` in place instead of reassigning would need
    // its own explicit deep copy here -- none currently does.
    originalBlocks: blocks, originalMap: map,
    originalMapJson: MAP_JSON, jsonEdits: [], insertOps: [], removeOps: [], isDirty: false,
  };
}

describe("planSave / commitSave", () => {
  it("planSave never writes -- safe to call on every keystroke", () => {
    const { root, proj } = tempProject();
    const session = { ...baseSession(root), blocks: baseSession(root).blocks.map((b, i) => (i === 0 ? { ...b, metatileId: 5 } : b)) };
    planSave(proj, session);
    expect(readFileSync(join(root, "map.bin"))).toEqual(encodeBlocks(baseSession(root).blocks, profile));
  });

  it("an unedited session produces a plan with zero changes", () => {
    const { root, proj } = tempProject();
    const plan = planSave(proj, baseSession(root));
    expect(plan.changes).toEqual([]);
    expect(plan.refusals).toEqual([]);
  });

  it("an edited block produces exactly one binary change, summarised", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    session.blocks = session.blocks.map((b, i) => (i === 0 ? { ...b, metatileId: 5 } : b));
    session.isDirty = true;
    const plan = planSave(proj, session);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe("binary");
    expect(plan.changes[0]!.summary).toMatch(/1 block/);
  });

  it("commitSave refuses a plan containing refusals, and writes nothing", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    session.blocks = session.blocks.map((b) => ({ ...b, metatileId: 999 }));
    session.isDirty = true;
    const plan = planSave(proj, session);
    expect(plan.refusals.length).toBeGreaterThan(0);
    const before = readFileSync(join(root, "map.bin"));
    expect(() => commitSave(proj, plan)).toThrow(/refus/i);
    expect(readFileSync(join(root, "map.bin"))).toEqual(before);
  });

  it("commitSave writes exactly the changed files, byte for byte, and nothing else in the directory", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    session.blocks = session.blocks.map((b, i) => (i === 0 ? { ...b, metatileId: 5 } : b));
    session.isDirty = true;
    const plan = planSave(proj, session);
    commitSave(proj, plan);
    expect(readFileSync(join(root, "map.bin"))).toEqual(encodeBlocks(session.blocks, profile));
    expect(readFileSync(join(root, "border.bin"))).toEqual(encodeBlocks(session.border, profile));
    expect(readFileSync(join(root, "Test.json"), "utf8")).toBe(MAP_JSON); // untouched -- no json edit was staged
  });

  it("a jsonEdits-only session (no block change) produces exactly one json change, and map.bin is untouched", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    session.jsonEdits = [{ path: ["music"], value: "MUS_NEW" }];
    session.isDirty = true;
    const plan = planSave(proj, session);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe("json");
    commitSave(proj, plan);
    expect(readFileSync(join(root, "Test.json"), "utf8")).toContain("MUS_NEW");
    expect(readFileSync(join(root, "map.bin"))).toEqual(encodeBlocks(session.blocks, profile));
  });

  it("a session with insertOps stages an array insert as its own json change, applied ON TOP of scalar jsonEdits in the same commit", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    session.jsonEdits = [{ path: ["music"], value: "MUS_NEW" }];
    session.insertOps = [{ path: ["object_events"], index: 0, value: { graphics_id: "X" } }];
    session.isDirty = true;
    const plan = planSave(proj, session);
    commitSave(proj, plan);
    const written = readFileSync(join(root, "Test.json"), "utf8");
    expect(written).toContain("MUS_NEW");
    expect(written).toContain('"graphics_id":"X"');
  });

  it("a session with a scriptAppend produces exactly one text change, and commitSave appends it to the real target file with exactly one blank line separating it from existing content", () => {
    const { root, proj } = tempProject();
    const scriptsPath = join(root, "scripts.inc");
    writeFileSync(scriptsPath, "ExistingLabel::\n\tend\n");
    const session = baseSession(root);
    session.scriptAppends = [{ path: scriptsPath, text: "NewLabel::\n\tend\n" }];
    session.isDirty = true;
    const plan = planSave(proj, session);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe("text");
    commitSave(proj, plan);
    expect(readFileSync(scriptsPath, "utf8")).toBe("ExistingLabel::\n\tend\n\nNewLabel::\n\tend\n");
  });

  it("commitSave re-validates against the session's CURRENT state -- a plan clean at planSave time still gets refused if the session was mutated afterward", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    const plan = planSave(proj, session);
    expect(plan.refusals).toEqual([]); // clean at planSave time

    // Mutate the SAME session object in place AFTER planning -- simulates a
    // caller holding a SavePlan across an intervening edit on the live
    // EditSession (e.g. the player keeps painting while a save dialog is
    // open). `plan.session` is the identical reference, so this mutation is
    // visible to commitSave without ever calling planSave again.
    session.blocks = session.blocks.map((b) => ({ ...b, metatileId: 999 }));
    session.isDirty = true;

    const before = readFileSync(join(root, "map.bin"));
    expect(() => commitSave(proj, plan)).toThrow(/refus/i);
    expect(readFileSync(join(root, "map.bin"))).toEqual(before);
  });

  it("a session with a single removeOps entry actually removes that element from map.json", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    session.originalMapJson = SEEDED_MAP_JSON;
    session.map = parseMap(SEEDED_MAP_JSON);
    session.removeOps = [{ path: ["object_events"], index: 1 }]; // OBJ_B
    session.isDirty = true;
    const plan = planSave(proj, session);
    commitSave(proj, plan);
    const written = JSON.parse(readFileSync(join(root, "Test.json"), "utf8"));
    expect(written.object_events.map((o: { graphics_id: string }) => o.graphics_id)).toEqual(["OBJ_A", "OBJ_C"]);
  });

  it("two removeOps on the same array path apply highest-index-first regardless of the order given -- removing ORIGINAL indices [0,1] leaves the untouched third element, not whatever naive ascending application would leave", () => {
    const { root, proj } = tempProject();
    const session = baseSession(root);
    session.originalMapJson = SEEDED_MAP_JSON;
    session.map = parseMap(SEEDED_MAP_JSON);
    // Given in ascending order deliberately. Applying them naively in THIS
    // order (index 0 first, then index 1) would remove OBJ_A, then -- since
    // OBJ_C has shifted down into index 1 -- OBJ_C, wrongly leaving [OBJ_B].
    // The correct, index-stable result -- removing the two elements that
    // were ORIGINALLY at indices 0 and 1 -- is [OBJ_C], which only a
    // highest-index-first application (applyJsonOps's own sort) produces.
    session.removeOps = [
      { path: ["object_events"], index: 0 },
      { path: ["object_events"], index: 1 },
    ];
    session.isDirty = true;
    const plan = planSave(proj, session);
    commitSave(proj, plan);
    const written = JSON.parse(readFileSync(join(root, "Test.json"), "utf8"));
    expect(written.object_events.map((o: { graphics_id: string }) => o.graphics_id)).toEqual(["OBJ_C"]);
  });
});
