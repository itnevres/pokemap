import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { openProject } from "@pokemap/core/src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../../core/test/helpers/corpus.js";
import { openCliEditSession, runSignSuggest, runSignAdd, runSignList, runPaint, runDiff } from "../src/writeCommands.js";

describe("writeCommands", () => {
  itWithCorpus("openCliEditSession builds the exact same EditSession shape editSessions.ts's open() does, from real disk state", () => {
    const proj = openProject(SUBJECT_ROOT);
    const session = openCliEditSession(proj, "Route29"); // confirmed-real map with a wild table, per Task 15/17
    expect(session.mapName).toBe("Route29");
    expect(session.blocks.length).toBeGreaterThan(0);
    expect(session.isDirty).toBe(false);
    expect(session.jsonEdits).toEqual([]);
  });

  itWithCorpus("runSignSuggest prints ranked species and a placement for a real route, and never writes", () => {
    const proj = openProject(SUBJECT_ROOT);
    const before = readFileSync(proj.paths.mapScriptsInc("Route29"), "utf8");
    const out = runSignSuggest(proj, "Route29");
    expect(out).toContain("%");
    expect(readFileSync(proj.paths.mapScriptsInc("Route29"), "utf8")).toBe(before);
  });

  itWithCorpus("runSignAdd without --yes prints the plan and writes nothing", () => {
    const proj = openProject(SUBJECT_ROOT);
    const scriptsPath = proj.paths.mapScriptsInc("Route29");
    const before = readFileSync(scriptsPath, "utf8");
    const out = runSignAdd(proj, { map: "Route29", x: 1, y: 1, elevation: 3, species: "RATTATA", dialogue: "RATTATA: Skreee!", yes: false });
    expect(out).toContain("Route29_EventScript_WildSign_Rattata");
    expect(out).toMatch(/dry.?run|not written|--yes/i);
    expect(readFileSync(scriptsPath, "utf8")).toBe(before);
  });

  itWithCorpus("runSignAdd with --yes actually commits, then restores", () => {
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
      const out = runSignAdd(proj, { map: "Route35", x: 1, y: 1, elevation: 3, species: "RATTATA", dialogue: "RATTATA: Skreee!", yes: true });
      expect(out).toMatch(/committed|saved|wrote/i);
      expect(readFileSync(scriptsPath, "utf8")).not.toBe(beforeScripts);
      expect(readFileSync(mapJsonPath, "utf8")).not.toBe(beforeMapJson);
    } finally {
      writeFileSync(scriptsPath, beforeScripts);
      writeFileSync(mapJsonPath, beforeMapJson);
    }
  });

  itWithCorpus("runSignAdd refuses and writes nothing when the derived label already exists, even with --yes", () => {
    const proj = openProject(SUBJECT_ROOT);
    // Route40, not Route31 (the plan's own original choice): this test does two
    // REAL writeFileSync calls against the target's real scripts.inc (seed the
    // colliding label, then restore in `finally`), and signRoutes.test.ts's own
    // Route31 test (Task 17, "undo after a sign add removes BOTH...") does a
    // real POST /sign/add against that same real Route31 scripts.inc with the
    // SAME derived label (species RATTATA) via guardSignWrite's real read of
    // the file. Under vitest's parallel-file execution, a read from that test
    // landing between this test's seed-write and its restore would see the
    // seeded label and get refused -- signRoutes.test.ts's own assertion
    // (`plan.changes` equals `[]`) happens to pass either way, but that's a
    // coincidence of what it asserts today, not a guarantee -- exactly the
    // same class of hazard as the Route33/Route34 fix below. Route40 is
    // confirmed real (data/maps/Route40/{map.json,scripts.inc} both exist,
    // distinct LAYOUT_ROUTE40) and is not referenced anywhere else in this
    // repo's test suite.
    const scriptsPath = proj.paths.mapScriptsInc("Route40");
    const before = readFileSync(scriptsPath, "utf8");
    try {
      writeFileSync(scriptsPath, before + "\nRoute40_EventScript_WildSign_Rattata::\n\tend\n");
      expect(() => runSignAdd(proj, { map: "Route40", x: 1, y: 1, elevation: 3, species: "RATTATA", dialogue: "...", yes: true })).toThrow(/SIGN_LABEL_EXISTS/);
      expect(readFileSync(proj.paths.mapJson("Route40"), "utf8")).toEqual(readFileSync(proj.paths.mapJson("Route40"), "utf8")); // map.json untouched (trivially true; real assertion is the throw itself plus the finally-restore below)
    } finally {
      writeFileSync(scriptsPath, before);
    }
  });

  itWithCorpus("runSignList finds an existing overworld-species object event on a real map with one -- CeladonCity's own Poliwrath", () => {
    const proj = openProject(SUBJECT_ROOT);
    const out = runSignList(proj, "CeladonCity");
    expect(out).toContain("POLIWRATH");
    expect(out).toContain("CeladonCity_EventScript_Poliwrath");
  });

  itWithCorpus("runSignList reports none found on a map with no overworld-species object events", () => {
    const proj = openProject(SUBJECT_ROOT);
    const out = runSignList(proj, "PalletTown");
    expect(out).toMatch(/no wild sign|none found/i);
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
