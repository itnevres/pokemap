import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { openProject } from "@pokemap/core/src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../../core/test/helpers/corpus.js";
import { openCliEditSession, runIndicatorSuggest, runIndicatorAdd, runIndicatorList, runPaint, runDiff } from "../src/writeCommands.js";

describe("writeCommands", () => {
  itWithCorpus("openCliEditSession builds the exact same EditSession shape editSessions.ts's open() does, from real disk state", () => {
    const proj = openProject(SUBJECT_ROOT);
    const session = openCliEditSession(proj, "Route29"); // confirmed-real map with a wild table, per Task 15/17
    expect(session.mapName).toBe("Route29");
    expect(session.blocks.length).toBeGreaterThan(0);
    expect(session.isDirty).toBe(false);
    expect(session.jsonEdits).toEqual([]);
  });

  itWithCorpus("runIndicatorSuggest prints ranked species and a placement for a real route, and never writes", () => {
    const proj = openProject(SUBJECT_ROOT);
    const before = readFileSync(proj.paths.mapScriptsInc("Route29"), "utf8");
    const out = runIndicatorSuggest(proj, "Route29");
    expect(out).toContain("%");
    expect(readFileSync(proj.paths.mapScriptsInc("Route29"), "utf8")).toBe(before);
  });

  itWithCorpus("runIndicatorAdd without --yes prints the plan and writes nothing", () => {
    const proj = openProject(SUBJECT_ROOT);
    const scriptsPath = proj.paths.mapScriptsInc("Route29");
    const before = readFileSync(scriptsPath, "utf8");
    const out = runIndicatorAdd(proj, { map: "Route29", x: 1, y: 1, elevation: 3, species: "RATTATA", text: "RATTATA: Skreee!", yes: false });
    expect(out).toContain("Route29_EventScript_PokemonIndicator1");
    expect(out).toMatch(/dry.?run|not written|--yes/i);
    expect(readFileSync(scriptsPath, "utf8")).toBe(before);
  });

  itWithCorpus("runIndicatorAdd refuses invalid text and unknown species without writing", () => {
    const proj = openProject(SUBJECT_ROOT), path = proj.paths.mapScriptsInc("Route29");
    const before = readFileSync(path, "utf8"), beforeMap = readFileSync(proj.paths.mapJson("Route29"), "utf8");
    for (const input of [{ species: "BOGUS", text: "HELLO" }, { species: "RATTATA", text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" }]) {
      expect(() => runIndicatorAdd(proj, { map: "Route29", x: 1, y: 1, elevation: 0, ...input, yes: true })).toThrow(/species_names.h|charmap.txt/);
      expect(readFileSync(path, "utf8")).toBe(before);
      expect(readFileSync(proj.paths.mapJson("Route29"), "utf8")).toBe(beforeMap);
    }
  });

  itWithCorpus("runIndicatorAdd with --yes actually commits, then restores", () => {
    const proj = openProject(SUBJECT_ROOT);
    // Route35, not Route30 (the plan's own original choice): signRoutes.test.ts's
    // own "refuses ... when the derived label already exists" test (Task 17)
    // already does a real writeFileSync+restore cycle against Route30's real
    // scripts.inc. This test also does a real writeFileSync (via commitSave),
    // so sharing Route30 with that file would race two independent test files
    // against the same real path under vitest's parallel file execution --
    // exactly the hazard this task's own instructions warn about. Route35 is
    // confirmed real (data/maps/Route35/{map.json,scripts.inc} both exist) and
    // is not referenced by any other test file in this repo.
    const scriptsPath = proj.paths.mapScriptsInc("Route35");
    const mapJsonPath = proj.paths.mapJson("Route35");
    const beforeScripts = readFileSync(scriptsPath, "utf8");
    const beforeMapJson = readFileSync(mapJsonPath, "utf8");
    try {
      const out = runIndicatorAdd(proj, { map: "Route35", x: 1, y: 1, elevation: 3, species: "RATTATA", text: "RATTATA: Skreee!", yes: true });
      expect(out).toMatch(/committed|saved|wrote/i);
      expect(readFileSync(scriptsPath, "utf8")).not.toBe(beforeScripts);
      expect(readFileSync(mapJsonPath, "utf8")).not.toBe(beforeMapJson);
    } finally {
      writeFileSync(scriptsPath, beforeScripts);
      writeFileSync(mapJsonPath, beforeMapJson);
    }
  });

  itWithCorpus("runIndicatorAdd allocates a fresh number for an existing species label", () => {
    const proj = openProject(SUBJECT_ROOT);
    const path = proj.paths.mapScriptsInc("Route40"), before = readFileSync(path, "utf8");
    try {
      writeFileSync(path, before + "\nRoute40_EventScript_PokemonIndicator1::\n\tend\n");
      const out = runIndicatorAdd(proj, { map: "Route40", x: 1, y: 1, elevation: 0, species: "RATTATA", text: "HELLO", yes: false });
      expect(out).toContain("Route40_EventScript_PokemonIndicator2");
      expect(readFileSync(path, "utf8")).toBe(before + "\nRoute40_EventScript_PokemonIndicator1::\n\tend\n");
    } finally { writeFileSync(path, before); }
  });

  itWithCorpus("runIndicatorList finds an existing overworld-species object event on a real map with one -- CeladonCity's own Poliwrath", () => {
    const proj = openProject(SUBJECT_ROOT);
    const out = runIndicatorList(proj, "CeladonCity");
    expect(out).toContain("POLIWRATH");
    expect(out).toContain("CeladonCity_EventScript_Poliwrath");
  });

  itWithCorpus("runIndicatorList reports none found on a map with no overworld-species object events", () => {
    const proj = openProject(SUBJECT_ROOT);
    const out = runIndicatorList(proj, "PalletTown");
    expect(out).toMatch(/no.*indicator|none found/i);
  });

  itWithCorpus("runDiff never writes, regardless of the requested edit", () => {
    const proj = openProject(SUBJECT_ROOT);
    const layout = proj.layoutForMap("Route32");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    const out = runDiff(proj, { map: "Route32", tool: "pencil", x: 0, y: 0, metatileId: 1 });
    expect(out).toContain("block");
    expect(readFileSync(binPath)).toEqual(before);
  });

  itWithCorpus("runPaint with --yes actually paints one block and commits, then restores", () => {
    const proj = openProject(SUBJECT_ROOT);
    // Route37, not Route33 (spec-review fix, task 18 follow-up): Route33 is real
    // and, on its own, distinct from every OTHER map in this file -- but
    // packages/server/test/paintRoutes.test.ts:244 also opens a real session on
    // Route33 (a real readFileSync of the same real blockdata via
    // editSessions.ts's open()), and this test does a real writeFileSync
    // (via commitSave) to that same file, restored only in `finally`. Under
    // vitest's default parallel-file execution that's a real reader/writer
    // race against the same file from two independent test files -- exactly
    // the hazard this task's own instructions warn about, and exactly what
    // the Route30->Route35 swap above already fixed for the sign-tool tests.
    // Route37 is confirmed real (data/maps/Route37/{map.json,scripts.inc}
    // exist, distinct LAYOUT_ROUTE37 -> data/layouts/Route37/map.bin) and is
    // not referenced anywhere else in this repo's test suite.
    const layout = proj.layoutForMap("Route37");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    try {
      const out = runPaint(proj, { map: "Route37", tool: "pencil", x: 0, y: 0, metatileId: 1, yes: true });
      expect(out).toMatch(/committed|saved|wrote/i);
      expect(readFileSync(binPath)).not.toEqual(before);
    } finally {
      writeFileSync(binPath, before);
    }
  });

  itWithCorpus("runPaint without --yes renders a real guard refusal inline (like runDiff), instead of throwing", () => {
    const proj = openProject(SUBJECT_ROOT);
    // Route32, already read-only elsewhere in this file (the runDiff test
    // above) -- this test never writes either (dry run with no --yes, and
    // the guard refusal blocks planSave's own change from ever reaching
    // commitSave), so reusing it carries none of the reader/writer races the
    // Route30->35/Route31->40/Route33->37/Route34->38 swaps above were fixing.
    // 1000, not something like 99999: it must fit encodeBlocks's own block
    // mask (0x3ff, i.e. 0-1023 -- an id that doesn't fit throws in
    // planBlockdataWrite before guardLayoutSave's refusal is ever reached, a
    // different failure entirely) while still tripping guardLayoutSave's
    // idOutOfRange (packages/core/src/write/guards.ts:14-20). Confirmed
    // against Route32's real split: primary tileset has 640 metatiles,
    // secondary 340, so the ceiling this layout's split actually resolves to
    // is min(640+340, 1024) = 980 -- 1000 is below the mask's 1023 ceiling
    // but above this layout's own 980, so it always trips
    // metatile-out-of-range without ever hitting the mask check.
    const layout = proj.layoutForMap("Route32");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    const out = runPaint(proj, { map: "Route32", tool: "pencil", x: 0, y: 0, metatileId: 1000, yes: false });
    expect(out).toContain("REFUSED");
    expect(out).toContain("metatile-out-of-range");
    expect(out).toMatch(/dry.?run|not written|--yes/i);
    expect(readFileSync(binPath)).toEqual(before);
  });

  itWithCorpus("runPaint with --yes still refuses and writes nothing when the identical guard refusal fires", () => {
    const proj = openProject(SUBJECT_ROOT);
    const layout = proj.layoutForMap("Route32");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    expect(() => runPaint(proj, { map: "Route32", tool: "pencil", x: 0, y: 0, metatileId: 1000, yes: true })).toThrow(/metatile-out-of-range/);
    expect(readFileSync(binPath)).toEqual(before);
  });

  itWithCorpus("runPaint rect tool paints the whole rectangle", () => {
    const proj = openProject(SUBJECT_ROOT);
    // Route38, not Route34 (spec-review fix, same reasoning as Route37 above):
    // packages/server/test/paintRoutes.test.ts:224 opens a real session on
    // Route34 (real readFileSync of its blockdata) and asserts exact
    // before/after metatile ids on the SAME (0,0)-(1,1) rectangle this test
    // paints -- the most exposed version of this race in the suite. Route38
    // is confirmed real (data/maps/Route38/{map.json,scripts.inc} exist,
    // distinct LAYOUT_ROUTE38 -> data/layouts/Route38/map.bin) and is not
    // referenced anywhere else in this repo's test suite.
    const layout = proj.layoutForMap("Route38");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    try {
      runPaint(proj, { map: "Route38", tool: "rect", x: 0, y: 0, x1: 1, y1: 1, metatileId: 2, yes: true });
      expect(readFileSync(binPath)).not.toEqual(before);
    } finally {
      writeFileSync(binPath, before);
    }
  });
});
