import { afterEach, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { addGbcEvent, deleteGbcEvent, findGbcWarpsRetargetedByDelete, moveGbcEvent } from "../../../src/gbc/edit/events.js";
import { parseMapEvents } from "../../../src/gbc/load/events.js";
import { openGbcEditSession } from "../../../src/gbc/write/save.js";
import { guardGbcSave } from "../../../src/gbc/write/guards.js";
import type { GbcWarpEvent } from "../../../src/gbc/model/types.js";
import { itWithGbcCorpus, GBC_SUBJECT_ROOT } from "../helpers/corpus.js";
import { TESTMAP_ASM, TESTMAP_ASM_NO_CONSTS, cleanupFixtures, makeFixture } from "../helpers/saveFixture.js";

afterEach(cleanupFixtures);

const obj = (n: number | string, script = `Script${n}`): string =>
  `\tobject_event  ${n},  2, SPRITE_${n}, SPRITEMOVEDATA_STILL, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, ${script}, -1`;

/** A `Testmap` file with the given consts and `objectCount` objects (LF, final newline). */
function mapText(consts: string[], objectCount: number): string {
  const head = consts.length > 0 ? ["\tobject_const_def", ...consts.map((c) => `\tconst ${c}`), ""] : [];
  const objs = Array.from({ length: objectCount }, (_, i) => obj(i));
  return [
    ...head,
    "Testmap_MapScripts:",
    "\tdef_scene_scripts",
    "",
    "\tdef_callbacks",
    "",
    "Testmap_MapEvents:",
    "\tdb 0, 0 ; filler",
    "",
    "\tdef_warp_events",
    "\twarp_event  1,  1, OTHER_MAP, 1",
    "",
    "\tdef_coord_events",
    "",
    "\tdef_bg_events",
    "",
    "\tdef_object_events",
    ...objs,
    "",
  ].join("\n");
}

const TESTMAP_OBJ_A = "\tobject_event  1,  2, SPRITE_A, SPRITEMOVEDATA_STILL, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, ScriptA, -1\n";
const TESTMAP_OBJ_B = "\tobject_event  2,  2, SPRITE_B, SPRITEMOVEDATA_STILL, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, ScriptB, -1\n";
const OBJ_ARGS = ["5", "5", "SPRITE_TEACHER", "SPRITEMOVEDATA_STILL", "0", "0", "-1", "-1", "0", "OBJECTTYPE_SCRIPT", "0", "NewScript", "-1"];
const OBJ_LINE = "\tobject_event  5,  5, SPRITE_TEACHER, SPRITEMOVEDATA_STILL, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, NewScript, -1";

/** TESTMAP_ASM plus one object_event line and no const (the desync shape). */
const insertObjectOnly = (t: string): string => t.replace(TESTMAP_OBJ_B, TESTMAP_OBJ_B + OBJ_LINE + "\n");

// The corpus tests below hard-code "\n" anchors: they rely on the subject checkout being LF (PerfPlus has `* text eol=lf`); texts are not normalised.
const NBT = `${GBC_SUBJECT_ROOT}/maps/NewBarkTown.asm`;
const readReal = (name: string): string => readFileSync(`${GBC_SUBJECT_ROOT}/maps/${name}.asm`, "utf8");

describe("moveGbcEvent", () => {
  itWithGbcCorpus("6. NewBarkTown warp 0 -> (12,4): exact line, every other byte unchanged; same-coord move is identical", () => {
    const text = readFileSync(NBT, "utf8");
    const out = moveGbcEvent(text, "NewBarkTown", "warp", 0, 12, 4);
    const before = "\twarp_event  6,  3, ELMS_LAB, 1";
    const after = "\twarp_event  12,  4, ELMS_LAB, 1";
    const at = text.indexOf(before);
    expect(at).toBeGreaterThan(0);
    expect(out.text.slice(at, at + after.length)).toBe(after);
    expect(out.text.slice(0, at)).toBe(text.slice(0, at));
    expect(out.text.slice(at + after.length)).toBe(text.slice(at + before.length));
    expect(out.events.warps[0]).toMatchObject({ x: 12, y: 4, mapConst: "ELMS_LAB", destWarp: 1 });
    expect(out.events).toEqual(parseMapEvents(out.text, "NewBarkTown"));

    expect(moveGbcEvent(text, "NewBarkTown", "warp", 0, 6, 3).text).toBe(text);
  });

  it("6b. moves each kind on a synthetic map, only the x/y bytes change", () => {
    const t = mapText(["TESTMAP_0"], 1);
    const o = moveGbcEvent(t, "Testmap", "object", 0, 7, 9);
    expect(o.text).toBe(t.replace("object_event  0,  2,", "object_event  7,  9,"));
    const w = moveGbcEvent(t, "Testmap", "warp", 0, 3, 200);
    expect(w.text).toBe(t.replace("warp_event  1,  1,", "warp_event  3,  200,"));
    expect(w.events.warps[0]).toMatchObject({ x: 3, y: 200 });
  });

  it("7. refuses x=256, x=-1, x=1.5, NaN and an out-of-range index, naming map/kind/index", () => {
    expect(() => moveGbcEvent(TESTMAP_ASM, "Testmap", "warp", 0, 256, 1)).toThrow(/Testmap.*warp.*x/);
    expect(() => moveGbcEvent(TESTMAP_ASM, "Testmap", "warp", 0, -1, 1)).toThrow(/Testmap.*warp.*x/);
    expect(() => moveGbcEvent(TESTMAP_ASM, "Testmap", "warp", 0, 1.5, 1)).toThrow(/Testmap.*warp.*x/);
    expect(() => moveGbcEvent(TESTMAP_ASM, "Testmap", "warp", 0, 1, NaN)).toThrow(/Testmap.*warp.*y/);
    expect(() => moveGbcEvent(TESTMAP_ASM, "Testmap", "warp", 0, 1, 256)).toThrow(/Testmap.*warp.*y/);
    expect(() => moveGbcEvent(TESTMAP_ASM, "Testmap", "warp", 1, 1, 1)).toThrow(/Testmap.*warp\[1\]/);
    expect(() => moveGbcEvent(TESTMAP_ASM, "Testmap", "warp", -1, 1, 1)).toThrow(/Testmap.*warp\[-1\]/);
    expect(() => moveGbcEvent(TESTMAP_ASM, "Testmap", "coord", 0, 1, 1)).toThrow(/Testmap.*coord\[0\]/);
  });
});

describe("moveGbcEvent, non-canonical numerals", () => {
  it("7b. a move to the event's current (x, y) is a byte-identical no-op even when it is written `$06, 03`", () => {
    const t = mapText(["TESTMAP_0"], 1).replace("\twarp_event  1,  1, OTHER_MAP, 1", "\twarp_event $06, 03, OTHER_MAP, 1");
    expect(parseMapEvents(t, "Testmap").warps[0]).toMatchObject({ x: 6, y: 3 });
    const same = moveGbcEvent(t, "Testmap", "warp", 0, 6, 3);
    expect(same.text).toBe(t);
    // a real move rewrites just the two numerals
    expect(moveGbcEvent(t, "Testmap", "warp", 0, 7, 3).text).toBe(t.replace("$06, 03,", "7, 3,"));
  });
});

describe("addGbcEvent", () => {
  itWithGbcCorpus("8. NewBarkTown bg: new line right after `bg_event  9, 13, ...`, exact bytes", () => {
    const text = readFileSync(NBT, "utf8");
    const anchor = "\tbg_event  9, 13, BGEVENT_READ, NewBarkTownElmsHouseSign\n";
    const newLine = "\tbg_event  1,  2, BGEVENT_READ, NewBarkTownSign\n";
    expect(text.split(anchor)).toHaveLength(2);
    const out = addGbcEvent(text, "NewBarkTown", "bg", ["1", "2", "BGEVENT_READ", "NewBarkTownSign"]);
    expect(out.text).toBe(text.replace(anchor, anchor + newLine));
    expect(out.events.bgs).toHaveLength(5);
    expect(out.events.bgs[4]).toMatchObject({ x: 1, y: 2, bgEventType: "BGEVENT_READ", script: "NewBarkTownSign" });
  });

  it("9. coord on an empty coord section: inserted right after the def_coord_events line", () => {
    const out = addGbcEvent(TESTMAP_ASM, "Testmap", "coord", ["3", "4", "SCENE_X", "ScriptX"]);
    expect(out.text).toBe(TESTMAP_ASM.replace("\tdef_coord_events\n", "\tdef_coord_events\n\tcoord_event  3,  4, SCENE_X, ScriptX\n"));
    expect(out.events.coords).toHaveLength(1);
  });

  it("9b. warp/bg anchors: last call of the kind, else the marker; double-digit coords are not padded", () => {
    const w = addGbcEvent(TESTMAP_ASM, "Testmap", "warp", ["12", "13", "OTHER_MAP", "2"]);
    expect(w.text).toBe(TESTMAP_ASM.replace("\twarp_event  1,  1, OTHER_MAP, 1\n", "\twarp_event  1,  1, OTHER_MAP, 1\n\twarp_event 12, 13, OTHER_MAP, 2\n"));
    const b = addGbcEvent(TESTMAP_ASM, "Testmap", "bg", ["0", "255", "BGEVENT_READ", "S"]);
    expect(b.text).toBe(TESTMAP_ASM.replace("\tdef_bg_events\n", "\tdef_bg_events\n\tbg_event  0, 255, BGEVENT_READ, S\n"));
  });

  it("9c. refuses when the section marker is missing", () => {
    const t = TESTMAP_ASM.replace("\tdef_coord_events\n", "");
    expect(() => addGbcEvent(t, "Testmap", "coord", ["3", "4", "SCENE_X", "ScriptX"])).toThrow(/Testmap/);
  });

  itWithGbcCorpus("10. object added to the no-final-newline CeruleanCave2F: file still ends without \\n, last line is the new object", () => {
    const text = readReal("CeruleanCave2F");
    expect(text.endsWith("\tdef_object_events")).toBe(true);
    const out = addGbcEvent(text, "CeruleanCave2F", "object", OBJ_ARGS);
    // The empty object_const_def block is a paired (0 === 0) const list, so the new object gets its const (Task 7 fix round).
    expect(out.text).toBe(`${text.replace("\tobject_const_def\n", "\tobject_const_def\n\tconst CERULEANCAVE2F_TEACHER\n")}\n${OBJ_LINE}`);
    expect(out.text.endsWith("\n")).toBe(false);
    expect(out.text.split("\n").at(-1)).toBe(OBJ_LINE);
    expect(out.events.objects).toHaveLength(1);
    expect(out.events.objectConsts).toEqual(["CERULEANCAVE2F_TEACHER"]);
  });

  itWithGbcCorpus("11. object added to NewBarkTown: line appended, const after the last const; auto-name suffix, explicit name, bad/duplicate names refuse", () => {
    const text = readFileSync(NBT, "utf8");
    const lastObj = text.slice(text.lastIndexOf("\tobject_event"));
    expect(lastObj.endsWith("\n")).toBe(true);
    const lastConst = "\tconst NEWBARKTOWN_RIVAL\n";
    const out = addGbcEvent(text, "NewBarkTown", "object", OBJ_ARGS);
    expect(out.text).toBe(text.replace(lastConst, `${lastConst}\tconst NEWBARKTOWN_TEACHER2\n`) + OBJ_LINE + "\n");
    expect(out.events.objectConsts).toEqual(["NEWBARKTOWN_TEACHER", "NEWBARKTOWN_FISHER", "NEWBARKTOWN_RIVAL", "NEWBARKTOWN_TEACHER2"]);
    expect(out.events.objects).toHaveLength(4);

    const named = addGbcEvent(text, "NewBarkTown", "object", OBJ_ARGS, { objectConst: "NEWBARKTOWN_GUIDE" });
    expect(named.text).toBe(text.replace(lastConst, `${lastConst}\tconst NEWBARKTOWN_GUIDE\n`) + OBJ_LINE + "\n");

    // the suffix climbs until unique
    const twice = addGbcEvent(out.text, "NewBarkTown", "object", OBJ_ARGS);
    expect(twice.events.objectConsts.at(-1)).toBe("NEWBARKTOWN_TEACHER3");

    for (const bad of ["lower_case", "1ABC", "BAD-NAME", "", "NEWBARKTOWN_FISHER"]) {
      expect(() => addGbcEvent(text, "NewBarkTown", "object", OBJ_ARGS, { objectConst: bad })).toThrow(/objectConst|const/);
    }
  });

  it("11b. object add on a synthetic map keeps consts and objects paired", () => {
    const out = addGbcEvent(TESTMAP_ASM, "Testmap", "object", OBJ_ARGS);
    expect(out.events.objectConsts).toEqual(["TESTMAP_A", "TESTMAP_B", "TESTMAP_TEACHER"]);
    expect(out.text).toContain("\tconst TESTMAP_B\n\tconst TESTMAP_TEACHER\n\n");
    expect(out.events.objects).toHaveLength(3);
  });

  it("11c. a map with no object_const_def gets no const", () => {
    const out = addGbcEvent(TESTMAP_ASM_NO_CONSTS, "Testmap", "object", OBJ_ARGS);
    expect(out.events.objectConsts).toEqual([]);
    expect(out.text).not.toContain("const ");
    expect(out.events.objects).toHaveLength(3);
  });

  it("11d. opts.objectConst on a map with no paired const block refuses (never silently ignored)", () => {
    expect(() => addGbcEvent(TESTMAP_ASM_NO_CONSTS, "Testmap", "object", OBJ_ARGS, { objectConst: "TESTMAP_GUIDE" })).toThrow(/Testmap.*objectConst "TESTMAP_GUIDE".*no object_const_def/);
    const emptyBlock = "\tobject_const_def\n\n" + TESTMAP_ASM_NO_CONSTS;
    // A present-but-empty block with 2 objects is out of step (Task 7 fix round: the marker, not the const count, decides pairing).
    expect(() => addGbcEvent(emptyBlock, "Testmap", "object", OBJ_ARGS, { objectConst: "TESTMAP_GUIDE" })).toThrow(/out of step/);
    expect(() => addGbcEvent(emptyBlock, "Testmap", "object", OBJ_ARGS)).toThrow(/out of step/);
  });

  it("11f. delete the sole object of a paired map, then re-add with its const: byte-identical; an empty marker with 0 objects is paired", () => {
    const one = mapText(["TESTMAP_ONLY"], 1);
    const del = deleteGbcEvent(one, "Testmap", "object", 0);
    expect(del.events.objects).toEqual([]);
    expect(del.events.objectConsts).toEqual([]);
    expect(del.text).toContain("\tobject_const_def\n\nTestmap_MapScripts:"); // marker survives, empty
    const args = ["0", "2", "SPRITE_0", "SPRITEMOVEDATA_STILL", "0", "0", "-1", "-1", "0", "OBJECTTYPE_SCRIPT", "0", "Script0", "-1"];
    const back = addGbcEvent(del.text, "Testmap", "object", args, { objectConst: "TESTMAP_ONLY" });
    expect(back.text).toBe(one);
    // without the option the const is derived, still added
    expect(addGbcEvent(del.text, "Testmap", "object", args).events.objectConsts).toEqual(["TESTMAP_0"]);
  });

  it("11e. an invalid DERIVED const name and an invalid PASSED objectConst give different messages", () => {
    const badSprite = [...OBJ_ARGS];
    badSprite[2] = "SPRITE_lower";
    expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "object", badSprite)).toThrow(/derived const name "TESTMAP_lower".*pass opts\.objectConst/);
    expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "object", OBJ_ARGS, { objectConst: "lower" })).toThrow(/objectConst "lower" must match/);
    expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "object", OBJ_ARGS, { objectConst: "TESTMAP_A" })).toThrow(/objectConst "TESTMAP_A" already exists/);
  });

  it("12. object add refusals: 15 objects, out-of-step consts (MoveDeletersHouse shape), wrong arg count, a ',' in an arg", () => {
    const full = mapText(Array.from({ length: 15 }, (_, i) => `TESTMAP_${i}`), 15);
    expect(parseMapEvents(full, "Testmap").objects).toHaveLength(15);
    expect(() => addGbcEvent(full, "Testmap", "object", OBJ_ARGS)).toThrow(/Testmap.*15 object/);
    const full14 = mapText(Array.from({ length: 14 }, (_, i) => `TESTMAP_${i}`), 14);
    expect(addGbcEvent(full14, "Testmap", "object", OBJ_ARGS).events.objects).toHaveLength(15);

    const outOfStep = mapText(["TESTMAP_0"], 2);
    expect(() => addGbcEvent(outOfStep, "Testmap", "object", OBJ_ARGS)).toThrow(/out of step/);

    expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "object", OBJ_ARGS.slice(0, 12))).toThrow(/Testmap.*object.*13/);
    expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "bg", ["1", "2", "BGEVENT_READ"])).toThrow(/Testmap.*bg.*4/);
    const withComma = [...OBJ_ARGS];
    withComma[11] = "A,B";
    expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "object", withComma)).toThrow(/arg 11/);
    for (const bad of ["", " X", "X ", "A;B", "A\nB"]) {
      const a = [...OBJ_ARGS];
      a[3] = bad;
      expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "object", a)).toThrow(/arg 3/);
    }
    // x/y must be plain in-range decimals; numeric object fields must parse
    expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "bg", ["256", "2", "BGEVENT_READ", "S"])).toThrow(/arg 0/);
    expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "bg", ["1", "-2", "BGEVENT_READ", "S"])).toThrow(/arg 1/);
    expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "bg", ["$10", "2", "BGEVENT_READ", "S"])).toThrow(/arg 0/);
    const badRadius = [...OBJ_ARGS];
    badRadius[4] = "wide";
    expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "object", badRadius)).toThrow(/arg 4/);
  });

  it("13. warp add: unknown map const refuses (G4), destWarp 0 refuses, -1 accepted", () => {
    const consts = new Set(["OTHER_MAP", "ELMS_LAB"]);
    expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "warp", ["2", "2", "NOPE_MAP", "1"], { mapConsts: consts })).toThrow(/NOPE_MAP/);
    expect(addGbcEvent(TESTMAP_ASM, "Testmap", "warp", ["2", "2", "ELMS_LAB", "1"], { mapConsts: consts }).events.warps).toHaveLength(2);
    expect(addGbcEvent(TESTMAP_ASM, "Testmap", "warp", ["2", "2", "NOPE_MAP", "1"]).events.warps).toHaveLength(2); // no set given: unchecked
    for (const bad of ["0", "-2", "1.5", "x"]) {
      expect(() => addGbcEvent(TESTMAP_ASM, "Testmap", "warp", ["2", "2", "OTHER_MAP", bad])).toThrow(/Testmap.*warp.*arg 3/);
    }
    const ok = addGbcEvent(TESTMAP_ASM, "Testmap", "warp", ["2", "2", "OTHER_MAP", "-1"]);
    expect(ok.events.warps[1]).toMatchObject({ destWarp: -1 });
    expect(addGbcEvent(TESTMAP_ASM, "Testmap", "warp", ["2", "2", "OTHER_MAP", "12"]).events.warps[1]!.destWarp).toBe(12);
  });
});

describe("deleteGbcEvent", () => {
  it("14. object on an unreferenced-const fixture: line and const both gone, rest still paired; Task 1 guard sees no object-const-desync", () => {
    const out = deleteGbcEvent(TESTMAP_ASM, "Testmap", "object", 0);
    expect(out.text).toBe(TESTMAP_ASM.replace("\tconst TESTMAP_A\n", "").replace(TESTMAP_OBJ_A, ""));
    expect(out.events.objectConsts).toEqual(["TESTMAP_B"]);
    expect(out.events.objects).toHaveLength(1);
    expect(out.events.objects[0]!.script).toBe("ScriptB");
    expect(out.events.objectConsts.length).toBe(out.events.objects.length);

    const { proj } = makeFixture();
    const session = openGbcEditSession(proj, "Testmap");
    session.eventsText = out.text;
    session.events = out.events;
    expect(guardGbcSave(proj, session).map((r) => r.code)).not.toContain("object-const-desync");
  });

  it("14d. the same guard accepts an add (object + const together) and still flags an object added without its const", () => {
    const { proj } = makeFixture();
    const added = addGbcEvent(TESTMAP_ASM, "Testmap", "object", OBJ_ARGS);
    const session = openGbcEditSession(proj, "Testmap");
    session.eventsText = added.text;
    session.events = added.events;
    expect(guardGbcSave(proj, session).map((r) => r.code)).not.toContain("object-const-desync");
    // teeth: with only the object line (no const), the guard must fire
    session.events = parseMapEvents(insertObjectOnly(TESTMAP_ASM), "Testmap");
    expect(guardGbcSave(proj, session).map((r) => r.code)).toContain("object-const-desync");
  });

  it("14b. deleting a middle object keeps later consts paired with later objects", () => {
    const t = mapText(["TESTMAP_0", "TESTMAP_1", "TESTMAP_2"], 3);
    const out = deleteGbcEvent(t, "Testmap", "object", 1);
    expect(out.events.objectConsts).toEqual(["TESTMAP_0", "TESTMAP_2"]);
    expect(out.events.objects.map((o) => o.script)).toEqual(["Script0", "Script2"]);
  });

  it("14c. a whole-word reference elsewhere in the file refuses; a mere prefix/suffix match does not", () => {
    const t = mapText(["TESTMAP_0", "TESTMAP_1"], 2);
    const referenced = t + "\nTestmapScript:\n\tturnobject TESTMAP_1, UP\n";
    expect(() => deleteGbcEvent(referenced, "Testmap", "object", 1)).toThrow(/TESTMAP_1.*referenced/);
    const refLine = referenced.split("\n").findIndex((l) => l.includes("turnobject TESTMAP_1")) + 1;
    expect(() => deleteGbcEvent(referenced, "Testmap", "object", 1)).toThrow(new RegExp(`at line ${refLine}\\b`)); // 1-based line, not a char offset
    const commented = t + "\n; TESTMAP_1 moves\n";
    expect(() => deleteGbcEvent(commented, "Testmap", "object", 1)).toThrow(/TESTMAP_1.*referenced/);
    const lookalike = t + "\nTestmapScript:\n\tturnobject TESTMAP_10, UP\n\tcheckscene SCENE_TESTMAP_1\n";
    expect(deleteGbcEvent(lookalike, "Testmap", "object", 1).events.objects).toHaveLength(1);
  });

  itWithGbcCorpus("15. NewBarkTown object 0 refuses: NEWBARKTOWN_TEACHER is referenced by scripts in the file", () => {
    const text = readFileSync(NBT, "utf8");
    expect(text.match(/\bNEWBARKTOWN_TEACHER\b/g)!.length).toBeGreaterThan(1);
    expect(() => deleteGbcEvent(text, "NewBarkTown", "object", 0)).toThrow(/NEWBARKTOWN_TEACHER.*referenced/);
  });

  it("16. 0-const fixture: delete removes just the line; MoveDeletersHouse shape refuses", () => {
    const out = deleteGbcEvent(TESTMAP_ASM_NO_CONSTS, "Testmap", "object", 1);
    expect(out.text).toBe(TESTMAP_ASM_NO_CONSTS.replace(TESTMAP_OBJ_B, ""));
    expect(out.events.objects).toHaveLength(1);

    expect(() => deleteGbcEvent(mapText(["TESTMAP_0"], 2), "Testmap", "object", 0)).toThrow(/out of step/);
  });

  it("17. warp delete removes exactly that one line", () => {
    const t = mapText(["TESTMAP_0"], 1).replace("\twarp_event  1,  1, OTHER_MAP, 1\n", "\twarp_event  1,  1, OTHER_MAP, 1\n\twarp_event  2,  2, THIRD_MAP, 1\n");
    const out = deleteGbcEvent(t, "Testmap", "warp", 0);
    expect(out.text).toBe(t.replace("\twarp_event  1,  1, OTHER_MAP, 1\n", ""));
    expect(out.events.warps).toHaveLength(1);
    expect(out.events.warps[0]).toMatchObject({ mapConst: "THIRD_MAP" });
    expect(() => deleteGbcEvent(t, "Testmap", "warp", 2)).toThrow(/Testmap.*warp\[2\]/);
    expect(() => deleteGbcEvent(t, "Testmap", "bg", 0)).toThrow(/Testmap.*bg\[0\]/);
  });

  it("17b. deleting the last line of a no-final-newline file keeps it without a final newline", () => {
    const t = mapText([], 2).replace(/\n$/, "");
    const out = deleteGbcEvent(t, "Testmap", "object", 1);
    expect(out.text).toBe(t.slice(0, t.lastIndexOf("\n")));
    expect(out.text.endsWith("\n")).toBe(false);
  });
});

describe("CRLF text (e.g. a pret checkout under autocrlf)", () => {
  const crlf = (t: string): string => t.replace(/\n/g, "\r\n");
  const bareLfLines = (t: string): number => t.split("\r\n").filter((l) => l.includes("\n")).length;

  it("19. add / move / delete keep every line CRLF, splice the same bytes, and parse agrees", () => {
    const t = crlf(mapText(["TESTMAP_0", "TESTMAP_1"], 2));
    expect(bareLfLines(t)).toBe(0);

    const added = addGbcEvent(t, "Testmap", "object", OBJ_ARGS);
    expect(bareLfLines(added.text)).toBe(0);
    expect(added.text).toBe(crlf(addGbcEvent(mapText(["TESTMAP_0", "TESTMAP_1"], 2), "Testmap", "object", OBJ_ARGS).text));
    expect(added.events).toEqual(parseMapEvents(added.text, "Testmap"));
    expect(added.events.objectConsts).toEqual(["TESTMAP_0", "TESTMAP_1", "TESTMAP_TEACHER"]);

    const moved = moveGbcEvent(added.text, "Testmap", "object", 2, 9, 9);
    expect(bareLfLines(moved.text)).toBe(0);
    expect(moved.events.objects[2]).toMatchObject({ x: 9, y: 9 });

    const deleted = deleteGbcEvent(moved.text, "Testmap", "object", 0);
    expect(bareLfLines(deleted.text)).toBe(0);
    expect(deleted.events).toEqual(parseMapEvents(deleted.text, "Testmap"));
    expect(deleted.events.objectConsts).toEqual(["TESTMAP_1", "TESTMAP_TEACHER"]);
    expect(deleted.events.objects).toHaveLength(2);
  });
});

describe("findGbcWarpsRetargetedByDelete", () => {
  const w = (mapConst: string, destWarp: number): GbcWarpEvent => ({ x: 0, y: 0, mapConst, destWarp, lineIndex: 0 });

  it("18. deleting ordinal 1 on C reports dest >= 2: not dest 1, not -1, not other consts; same-map included; the deleted warp excluded", () => {
    const maps = [
      // the deleted map itself: pre-delete warps. [1] is the deleted one (self-targeting dest 2).
      { name: "A", warps: [w("C", 3), w("C", 2), w("Z", 5), w("C", 1), w("C", -1)] },
      { name: "B", warps: [w("C", 1), w("C", 2), w("C", 3), w("C", -1), w("Y", 2)] },
      { name: "C", warps: [w("A", 9)] },
    ];
    const got = findGbcWarpsRetargetedByDelete(maps, { mapName: "A", mapConst: "C", index: 1 });
    expect(got).toEqual([
      { fromMap: "A", warpIndex: 0, destWarp: 3 },
      { fromMap: "B", warpIndex: 1, destWarp: 2 },
      { fromMap: "B", warpIndex: 2, destWarp: 3 },
    ]);
  });

  it("18b. the deleted warp is excluded only by (map name, index); a same-index warp on another map still counts", () => {
    const maps = [
      { name: "C", warps: [w("C", 1), w("C", 2)] },
      { name: "D", warps: [w("C", 1), w("C", 2)] },
    ];
    expect(findGbcWarpsRetargetedByDelete(maps, { mapName: "C", mapConst: "C", index: 1 })).toEqual([{ fromMap: "D", warpIndex: 1, destWarp: 2 }]);
    // deleting ordinal 0 orphans id 1 and shifts every later id
    expect(findGbcWarpsRetargetedByDelete(maps, { mapName: "C", mapConst: "C", index: 0 })).toEqual([
      { fromMap: "C", warpIndex: 1, destWarp: 2 },
      { fromMap: "D", warpIndex: 0, destWarp: 1 },
      { fromMap: "D", warpIndex: 1, destWarp: 2 },
    ]);
  });
});

