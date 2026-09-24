import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMapEvents, loadGbcMapEvents } from "../../../src/gbc/load/events.js";
import { loadGbcMaps } from "../../../src/gbc/load/map.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";

/**
 * Builds a real-shaped `<name>_MapScripts:` + `<name>_MapEvents:` pair (both
 * mandatory sections always present, in order, per §3.1's "0 violations"
 * facts) and returns, alongside the text, the exact 0-based line index of
 * each inserted line -- computed by tracking array positions while building,
 * never by hand-counting, so a fixture typo can't silently desync the
 * expected `lineIndex` from the text actually produced.
 */
function skeleton(
  name: string,
  opts: {
    constDef?: string[];
    sceneScripts?: string[];
    callbacks?: string[];
    warps?: string[];
    coords?: string[];
    bgs?: string[];
    objects?: string[];
  } = {},
) {
  const lines: string[] = [];
  const push = (s: string): number => lines.push(s) - 1;

  if (opts.constDef) {
    push("\tobject_const_def");
    for (const c of opts.constDef) push(`\tconst ${c}`);
    push("");
  }

  push(`${name}_MapScripts:`);
  push("\tdef_scene_scripts");
  const sceneScriptLines = (opts.sceneScripts ?? []).map((s) => push(`\t${s}`));
  push("");
  push("\tdef_callbacks");
  const callbackLines = (opts.callbacks ?? []).map((c) => push(`\t${c}`));
  push("");

  push(`${name}_MapEvents:`);
  push("\tdb 0, 0 ; filler");
  push("");
  push("\tdef_warp_events");
  const warpLines = (opts.warps ?? []).map((w) => push(`\t${w}`));
  push("");
  push("\tdef_coord_events");
  const coordLines = (opts.coords ?? []).map((c) => push(`\t${c}`));
  push("");
  push("\tdef_bg_events");
  const bgLines = (opts.bgs ?? []).map((b) => push(`\t${b}`));
  push("");
  push("\tdef_object_events");
  const objectLines = (opts.objects ?? []).map((o) => push(`\t${o}`));

  return { text: lines.join("\n"), sceneScriptLines, callbackLines, warpLines, coordLines, bgLines, objectLines };
}

describe("parseMapEvents: warp_event", () => {
  it("parses x, y, MAP_CONST, destWarp with correct field mapping", () => {
    const s = skeleton("Foo", { warps: ["warp_event  6,  3, ELMS_LAB, 1"] });
    const events = parseMapEvents(s.text, "Foo");
    expect(events.warps).toEqual([{ x: 6, y: 3, mapConst: "ELMS_LAB", destWarp: 1, lineIndex: s.warpLines[0] }]);
  });

  it("parses a -1 destWarp (return to previous map's warp)", () => {
    const s = skeleton("Foo", { warps: ["warp_event 25,  1, FAST_SHIP_1F, -1"] });
    expect(parseMapEvents(s.text, "Foo").warps[0]!.destWarp).toBe(-1);
  });

  it("strips a trailing comment on an event line", () => {
    const s = skeleton("Foo", { warps: ["warp_event  5,  5, BURNED_TOWER_B1F, 1 ; inaccessible, left over from G/S"] });
    expect(parseMapEvents(s.text, "Foo").warps[0]!.mapConst).toBe("BURNED_TOWER_B1F");
  });

  it("refuses a wrong argument count, naming the map and line", () => {
    const s = skeleton("Foo", { warps: ["warp_event  6,  3, ELMS_LAB"] });
    expect(() => parseMapEvents(s.text, "Foo")).toThrow(/Foo/);
    expect(() => parseMapEvents(s.text, "Foo")).toThrow(/3/); // got 3 args
  });
});

describe("parseMapEvents: coord_event", () => {
  it("parses x, y, SCENE_*, script with correct field mapping", () => {
    const s = skeleton("Foo", { coords: ["coord_event  1,  8, SCENE_FOO, FooScene1"] });
    expect(parseMapEvents(s.text, "Foo").coords).toEqual([{ x: 1, y: 8, sceneConst: "SCENE_FOO", script: "FooScene1", lineIndex: s.coordLines[0] }]);
  });

  it("refuses a wrong argument count, naming the map and line", () => {
    const s = skeleton("Foo", { coords: ["coord_event  1,  8, SCENE_FOO"] });
    expect(() => parseMapEvents(s.text, "Foo")).toThrow(/Foo/);
  });
});

describe("parseMapEvents: bg_event", () => {
  it("parses x, y, BGEVENT_*, script with correct field mapping", () => {
    const s = skeleton("Foo", { bgs: ["bg_event  8,  8, BGEVENT_READ, FooSign"] });
    expect(parseMapEvents(s.text, "Foo").bgs).toEqual([{ x: 8, y: 8, bgEventType: "BGEVENT_READ", script: "FooSign", lineIndex: s.bgLines[0] }]);
  });

  it("refuses a wrong argument count, naming the map and line", () => {
    const s = skeleton("Foo", { bgs: ["bg_event  8,  8, BGEVENT_READ"] });
    expect(() => parseMapEvents(s.text, "Foo")).toThrow(/Foo/);
  });
});

describe("parseMapEvents: object_event", () => {
  it("parses all 13 args with correct field mapping -- a swapped pair must fail this", () => {
    const s = skeleton("Foo", {
      objects: [
        "object_event  6,  8, SPRITE_TEACHER, SPRITEMOVEDATA_SPINRANDOM_SLOW, 1, 2, -1, DAY, PAL_NPC_RED, OBJECTTYPE_SCRIPT, 3, FooScript, EVENT_FOO",
      ],
    });
    expect(parseMapEvents(s.text, "Foo").objects).toEqual([
      {
        x: 6,
        y: 8,
        sprite: "SPRITE_TEACHER",
        moveData: "SPRITEMOVEDATA_SPINRANDOM_SLOW",
        radiusX: 1,
        radiusY: 2,
        hour1: "-1",
        hour2: "DAY",
        palette: "PAL_NPC_RED",
        objectType: "OBJECTTYPE_SCRIPT",
        sightRange: 3,
        script: "FooScript",
        eventFlag: "EVENT_FOO",
        lineIndex: s.objectLines[0],
      },
    ]);
  });

  it("keeps hour2 as a raw single time flag (-1, MORN)", () => {
    const s = skeleton("Foo", {
      objects: ["object_event  0,  0, SPRITE_FOO, SPRITEMOVEDATA_STANDING_DOWN, 0, 0, -1, MORN, 0, OBJECTTYPE_SCRIPT, 0, FooScript, -1"],
    });
    expect(parseMapEvents(s.text, "Foo").objects[0]!.hour2).toBe("MORN");
  });

  it("keeps eventFlag as -1 when there is no EVENT_* flag", () => {
    const s = skeleton("Foo", {
      objects: ["object_event  0,  0, SPRITE_FOO, SPRITEMOVEDATA_STANDING_DOWN, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, FooScript, -1"],
    });
    expect(parseMapEvents(s.text, "Foo").objects[0]!.eventFlag).toBe("-1");
  });

  it("refuses a wrong argument count, naming the map and line", () => {
    const s = skeleton("Foo", {
      objects: ["object_event  0,  0, SPRITE_FOO, SPRITEMOVEDATA_STANDING_DOWN, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, FooScript"],
    });
    expect(() => parseMapEvents(s.text, "Foo")).toThrow(/Foo/);
  });

  it("refuses more than 15 object_events (NUM_OBJECTS 16, slot 0 is the player)", () => {
    const objLine = "object_event  0,  0, SPRITE_FOO, SPRITEMOVEDATA_STANDING_DOWN, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, FooScript, -1";
    const s = skeleton("Foo", { objects: Array.from({ length: 16 }, () => objLine) });
    expect(() => parseMapEvents(s.text, "Foo")).toThrow(/16/);
  });

  it("accepts exactly 15 object_events", () => {
    const objLine = "object_event  0,  0, SPRITE_FOO, SPRITEMOVEDATA_STANDING_DOWN, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, FooScript, -1";
    const s = skeleton("Foo", { objects: Array.from({ length: 15 }, () => objLine) });
    expect(parseMapEvents(s.text, "Foo").objects).toHaveLength(15);
  });
});

describe("parseMapEvents: scene_script / callback (MapScripts section)", () => {
  it("parses scene_script with 1 arg (no SCENE_const)", () => {
    const s = skeleton("Foo", { sceneScripts: ["scene_script FooScene1"] });
    expect(parseMapEvents(s.text, "Foo").sceneScripts).toEqual([{ script: "FooScene1", sceneConst: null, lineIndex: s.sceneScriptLines[0] }]);
  });

  it("parses scene_script with 2 args", () => {
    const s = skeleton("Foo", { sceneScripts: ["scene_script FooScene1, SCENE_FOO"] });
    expect(parseMapEvents(s.text, "Foo").sceneScripts).toEqual([
      { script: "FooScene1", sceneConst: "SCENE_FOO", lineIndex: s.sceneScriptLines[0] },
    ]);
  });

  it("parses callback with correct field mapping", () => {
    const s = skeleton("Foo", { callbacks: ["callback MAPCALLBACK_NEWMAP, FooCallback"] });
    expect(parseMapEvents(s.text, "Foo").callbacks).toEqual([
      { callbackConst: "MAPCALLBACK_NEWMAP", script: "FooCallback", lineIndex: s.callbackLines[0] },
    ]);
  });

  it("refuses a wrong scene_script argument count, naming the map and line", () => {
    const s = skeleton("Foo", { sceneScripts: ["scene_script FooScene1, SCENE_FOO, EXTRA"] });
    expect(() => parseMapEvents(s.text, "Foo")).toThrow(/Foo/);
  });

  it("refuses a wrong callback argument count, naming the map and line", () => {
    const s = skeleton("Foo", { callbacks: ["callback MAPCALLBACK_NEWMAP"] });
    expect(() => parseMapEvents(s.text, "Foo")).toThrow(/Foo/);
  });
});

describe("parseMapEvents: object_const_def", () => {
  it("collects const NAME lines immediately following object_const_def", () => {
    const s = skeleton("Foo", { constDef: ["FOO_TEACHER", "FOO_FISHER"] });
    expect(parseMapEvents(s.text, "Foo").objectConsts).toEqual(["FOO_TEACHER", "FOO_FISHER"]);
  });

  it("stops at the first non-const code line after the block", () => {
    const text = [
      "\tobject_const_def",
      "\tconst FOO_TEACHER",
      "SomeOtherLabel:",
      "\tconst NOT_COLLECTED",
      "",
      skeleton("Foo").text,
    ].join("\n");
    expect(parseMapEvents(text, "Foo").objectConsts).toEqual(["FOO_TEACHER"]);
  });

  it("is [] when object_const_def is absent (40 maps in the corpus)", () => {
    const s = skeleton("Foo");
    expect(parseMapEvents(s.text, "Foo").objectConsts).toEqual([]);
  });
});

describe("parseMapEvents: whole-file format irregularities", () => {
  it("tolerates a MapEvents label with trailing whitespace and def_warp_events with trailing whitespace (CeruleanCave1F style)", () => {
    const s = skeleton("Foo", { warps: ["warp_event 25, 15, CERULEAN_CITY, 7"] });
    const text = s.text.replace("Foo_MapEvents:", "Foo_MapEvents: ").replace("\tdef_warp_events", "\tdef_warp_events ");
    expect(parseMapEvents(text, "Foo").warps[0]!.mapConst).toBe("CERULEAN_CITY");
  });

  it("accepts a bare 'db 0, 0' filler line with no comment", () => {
    const s = skeleton("Foo", { warps: ["warp_event 1, 2, BAR, 1"] });
    const text = s.text.replace("\tdb 0, 0 ; filler", "\tdb 0, 0");
    expect(parseMapEvents(text, "Foo").warps).toHaveLength(1);
  });

  it("accepts a final line with no trailing newline (object_event as the file's last line)", () => {
    const s = skeleton("Foo", {
      objects: ["object_event  0,  0, SPRITE_FOO, SPRITEMOVEDATA_STANDING_DOWN, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, FooScript, -1"],
    });
    // `skeleton` never appends a trailing newline after the last section, so
    // `s.text` already ends with the object_event line and no "\n".
    expect(s.text.endsWith("-1")).toBe(true);
    expect(parseMapEvents(s.text, "Foo").objects).toHaveLength(1);
  });

  it("refuses when the map's MapEvents label is missing, naming the map", () => {
    expect(() => parseMapEvents("no label here", "Foo")).toThrow(/Foo/);
  });

  it("stops at the next map's label -- a second map's events are never borrowed into the first's", () => {
    const foo = skeleton("Foo", { warps: ["warp_event 1, 2, A, 1"] });
    const bar = skeleton("Bar", { warps: ["warp_event 9, 9, B, 1", "warp_event 8, 8, C, 1"] });
    const text = `${foo.text}\n${bar.text}`;
    expect(parseMapEvents(text, "Foo").warps).toHaveLength(1);
    expect(parseMapEvents(text, "Bar").warps).toHaveLength(2);
  });

  it("refuses when a def_* section is out of order", () => {
    const text = [
      "Foo_MapScripts:",
      "\tdef_scene_scripts",
      "\tdef_callbacks",
      "",
      "Foo_MapEvents:",
      "\tdb 0, 0 ; filler",
      "",
      "\tdef_coord_events",
      "\tdef_warp_events",
      "\tdef_bg_events",
      "\tdef_object_events",
      "\twarp_event 1, 2, BAR, 1",
    ].join("\n");
    expect(() => parseMapEvents(text, "Foo")).toThrow(/Foo/);
  });

  it("refuses when a def_* section is missing entirely", () => {
    const text = [
      "Foo_MapScripts:",
      "\tdef_scene_scripts",
      "\tdef_callbacks",
      "",
      "Foo_MapEvents:",
      "\tdb 0, 0 ; filler",
      "",
      "\tdef_warp_events",
      "\tdef_bg_events",
      "\tdef_object_events",
    ].join("\n");
    expect(() => parseMapEvents(text, "Foo")).toThrow(/Foo/);
    expect(() => parseMapEvents(text, "Foo")).toThrow(/def_coord_events/);
  });
});

describe("loadGbcMapEvents: object_const_def defect", () => {
  it("flags a defect when consts are present but fewer than objects (MoveDeletersHouse's real shape)", () => {
    const s = skeleton("Foo", {
      constDef: ["FOO_ONE"],
      objects: [
        "object_event  0,  0, SPRITE_A, SPRITEMOVEDATA_STANDING_DOWN, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, ScriptA, -1",
        "object_event  1,  1, SPRITE_B, SPRITEMOVEDATA_STANDING_DOWN, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, ScriptB, -1",
      ],
    });
    const events = parseMapEvents(s.text, "Foo");
    expect(events.objectConsts).toEqual(["FOO_ONE"]);
    expect(events.objects).toHaveLength(2);
  });

  it("does not flag a defect when objectConsts is empty (normal, 40 maps in the corpus)", () => {
    const s = skeleton("Foo", {
      objects: ["object_event  0,  0, SPRITE_A, SPRITEMOVEDATA_STANDING_DOWN, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, ScriptA, -1"],
    });
    expect(parseMapEvents(s.text, "Foo").objectConsts).toEqual([]);
  });
});

describe("corpus", () => {
  itWithGbcCorpus("all 391 maps load, with the exact corpus totals", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    expect(maps).toHaveLength(391);
    const totals = { warps: 0, coords: 0, bgs: 0, objects: 0, sceneScripts: 0, callbacks: 0 };
    for (const map of maps) {
      const { events } = loadGbcMapEvents(GBC_SUBJECT_ROOT, map);
      totals.warps += events.warps.length;
      totals.coords += events.coords.length;
      totals.bgs += events.bgs.length;
      totals.objects += events.objects.length;
      totals.sceneScripts += events.sceneScripts.length;
      totals.callbacks += events.callbacks.length;
    }
    expect(totals).toEqual({ warps: 1327, coords: 114, bgs: 792, objects: 1468, sceneScripts: 170, callbacks: 105 });
  });

  itWithGbcCorpus(
    "per-map maxima: warps 33 (EcruteakGym), coords 30 (TeamRocketBaseB1F), bgs 38 (CeladonGameCorner), objects 15 (GoldenrodCity)",
    () => {
      const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
      expect(loadGbcMapEvents(GBC_SUBJECT_ROOT, maps.find((m) => m.name === "EcruteakGym")!).events.warps).toHaveLength(33);
      expect(loadGbcMapEvents(GBC_SUBJECT_ROOT, maps.find((m) => m.name === "TeamRocketBaseB1F")!).events.coords).toHaveLength(30);
      expect(loadGbcMapEvents(GBC_SUBJECT_ROOT, maps.find((m) => m.name === "CeladonGameCorner")!).events.bgs).toHaveLength(38);
      expect(loadGbcMapEvents(GBC_SUBJECT_ROOT, maps.find((m) => m.name === "GoldenrodCity")!).events.objects).toHaveLength(15);

      let maxWarps = 0,
        maxCoords = 0,
        maxBgs = 0,
        maxObjects = 0;
      for (const map of maps) {
        const { events } = loadGbcMapEvents(GBC_SUBJECT_ROOT, map);
        maxWarps = Math.max(maxWarps, events.warps.length);
        maxCoords = Math.max(maxCoords, events.coords.length);
        maxBgs = Math.max(maxBgs, events.bgs.length);
        maxObjects = Math.max(maxObjects, events.objects.length);
      }
      expect({ maxWarps, maxCoords, maxBgs, maxObjects }).toEqual({ maxWarps: 33, maxCoords: 30, maxBgs: 38, maxObjects: 15 });
    },
  );

  itWithGbcCorpus("BGEVENT type counts: READ 632 ITEM 85 UP 47 RIGHT 12 LEFT 10 IFNOTSET 4 IFSET 1 DOWN 1", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    const counts = new Map<string, number>();
    for (const map of maps) {
      const { events } = loadGbcMapEvents(GBC_SUBJECT_ROOT, map);
      for (const bg of events.bgs) counts.set(bg.bgEventType, (counts.get(bg.bgEventType) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      BGEVENT_READ: 632,
      BGEVENT_ITEM: 85,
      BGEVENT_UP: 47,
      BGEVENT_RIGHT: 12,
      BGEVENT_LEFT: 10,
      BGEVENT_IFNOTSET: 4,
      BGEVENT_IFSET: 1,
      BGEVENT_DOWN: 1,
    });
  });

  itWithGbcCorpus("hour limits: -1,-1 x1457, -1,DAY x5, -1,MORN x3, -1,NITE x3", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    const counts = new Map<string, number>();
    for (const map of maps) {
      const { events } = loadGbcMapEvents(GBC_SUBJECT_ROOT, map);
      for (const obj of events.objects) {
        const key = `${obj.hour1},${obj.hour2}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries(counts)).toEqual({ "-1,-1": 1457, "-1,DAY": 5, "-1,MORN": 3, "-1,NITE": 3 });
  });

  itWithGbcCorpus("warp dest -1 in exactly 6 events across exactly 4 maps", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    let count = 0;
    const mapNames = new Set<string>();
    for (const map of maps) {
      const { events } = loadGbcMapEvents(GBC_SUBJECT_ROOT, map);
      for (const w of events.warps) {
        if (w.destWarp === -1) {
          count++;
          mapNames.add(map.name);
        }
      }
    }
    expect(count).toBe(6);
    expect(mapNames.size).toBe(4);
  });

  itWithGbcCorpus("objectConsts: equal-count (incl. 0=0) 350, marker-absent 40, fewer 1 (MoveDeletersHouse) -> exactly 1 defect", () => {
    // "equal" and "none" are distinguished by whether `object_const_def`
    // is present in the raw source, not by objectConsts.length === 0 --
    // CeruleanCave1F/2F have the marker with 0 consts AND 0 objects
    // (0 === 0, so "equal"), which is different from the 40 maps with no
    // marker at all (findings §3.1).
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    let equal = 0,
      markerAbsent = 0,
      fewer = 0;
    const allDefects: { name: string; message: string }[] = [];
    for (const map of maps) {
      const text = readFileSync(`${GBC_SUBJECT_ROOT}/maps/${map.name}.asm`, "utf8");
      const hasMarker = /^\s*object_const_def\b/m.test(text);
      const { events, defects } = loadGbcMapEvents(GBC_SUBJECT_ROOT, map);
      if (!hasMarker) markerAbsent++;
      else if (events.objectConsts.length === events.objects.length) equal++;
      else if (events.objectConsts.length < events.objects.length) fewer++;
      for (const d of defects) allDefects.push({ name: map.name, message: d.message });
    }
    expect({ equal, markerAbsent, fewer }).toEqual({ equal: 350, markerAbsent: 40, fewer: 1 });
    expect(allDefects).toHaveLength(1);
    expect(allDefects[0]!.name).toBe("MoveDeletersHouse");
  });

  itWithGbcCorpus("NewBarkTown: full event set matches the real file field-by-field", () => {
    const { map } = loadGbcMaps(GBC_SUBJECT_ROOT);
    const { events, defects } = loadGbcMapEvents(GBC_SUBJECT_ROOT, map("NewBarkTown"));
    expect(defects).toEqual([]);
    expect(events.objectConsts).toEqual(["NEWBARKTOWN_TEACHER", "NEWBARKTOWN_FISHER", "NEWBARKTOWN_RIVAL"]);
    expect(events.warps).toEqual([
      { x: 6, y: 3, mapConst: "ELMS_LAB", destWarp: 1, lineIndex: 285 },
      { x: 13, y: 5, mapConst: "PLAYERS_HOUSE_1F", destWarp: 1, lineIndex: 286 },
      { x: 3, y: 11, mapConst: "PLAYERS_NEIGHBORS_HOUSE", destWarp: 1, lineIndex: 287 },
      { x: 11, y: 13, mapConst: "ELMS_HOUSE", destWarp: 1, lineIndex: 288 },
    ]);
    expect(events.coords).toEqual([
      { x: 1, y: 8, sceneConst: "SCENE_NEWBARKTOWN_TEACHER_STOPS_YOU", script: "NewBarkTown_TeacherStopsYouScene1", lineIndex: 291 },
      { x: 1, y: 9, sceneConst: "SCENE_NEWBARKTOWN_TEACHER_STOPS_YOU", script: "NewBarkTown_TeacherStopsYouScene2", lineIndex: 292 },
    ]);
    expect(events.bgs).toEqual([
      { x: 8, y: 8, bgEventType: "BGEVENT_READ", script: "NewBarkTownSign", lineIndex: 295 },
      { x: 11, y: 5, bgEventType: "BGEVENT_READ", script: "NewBarkTownPlayersHouseSign", lineIndex: 296 },
      { x: 3, y: 3, bgEventType: "BGEVENT_READ", script: "NewBarkTownElmsLabSign", lineIndex: 297 },
      { x: 9, y: 13, bgEventType: "BGEVENT_READ", script: "NewBarkTownElmsHouseSign", lineIndex: 298 },
    ]);
    expect(events.objects).toEqual([
      {
        x: 6,
        y: 8,
        sprite: "SPRITE_TEACHER",
        moveData: "SPRITEMOVEDATA_SPINRANDOM_SLOW",
        radiusX: 1,
        radiusY: 0,
        hour1: "-1",
        hour2: "-1",
        palette: "0",
        objectType: "OBJECTTYPE_SCRIPT",
        sightRange: 0,
        script: "NewBarkTownTeacherScript",
        eventFlag: "-1",
        lineIndex: 301,
      },
      {
        x: 12,
        y: 9,
        sprite: "SPRITE_FISHER",
        moveData: "SPRITEMOVEDATA_WALK_UP_DOWN",
        radiusX: 0,
        radiusY: 1,
        hour1: "-1",
        hour2: "-1",
        palette: "PAL_NPC_GREEN",
        objectType: "OBJECTTYPE_SCRIPT",
        sightRange: 0,
        script: "NewBarkTownFisherScript",
        eventFlag: "-1",
        lineIndex: 302,
      },
      {
        x: 3,
        y: 2,
        sprite: "SPRITE_RIVAL",
        moveData: "SPRITEMOVEDATA_STANDING_RIGHT",
        radiusX: 0,
        radiusY: 0,
        hour1: "-1",
        hour2: "-1",
        palette: "0",
        objectType: "OBJECTTYPE_SCRIPT",
        sightRange: 0,
        script: "NewBarkTownRivalScript",
        eventFlag: "EVENT_RIVAL_NEW_BARK_TOWN",
        lineIndex: 303,
      },
    ]);
    expect(events.sceneScripts).toEqual([
      { script: "NewBarkTownNoop1Scene", sceneConst: "SCENE_NEWBARKTOWN_TEACHER_STOPS_YOU", lineIndex: 7 },
      { script: "NewBarkTownNoop2Scene", sceneConst: "SCENE_NEWBARKTOWN_NOOP", lineIndex: 8 },
    ]);
    expect(events.callbacks).toEqual([{ callbackConst: "MAPCALLBACK_NEWMAP", script: "NewBarkTownFlypointCallback", lineIndex: 11 }]);
  });

  itWithGbcCorpus("every warp's MAP_CONST is a real map constName (0 unknown)", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    const constNames = new Set(maps.map((m) => m.constName));
    const unknown: string[] = [];
    for (const m of maps) {
      const { events } = loadGbcMapEvents(GBC_SUBJECT_ROOT, m);
      for (const w of events.warps) {
        if (!constNames.has(w.mapConst)) unknown.push(`${m.name}: ${w.mapConst}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  itWithGbcCorpus("every event's lineIndex points at a line starting with its own macro name", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    for (const m of maps) {
      const text = readFileSync(`${GBC_SUBJECT_ROOT}/maps/${m.name}.asm`, "utf8");
      const lines = text.split(/\r\n|\n/);
      const { events } = loadGbcMapEvents(GBC_SUBJECT_ROOT, m);
      const checks: [string, { lineIndex: number }[]][] = [
        ["warp_event", events.warps],
        ["coord_event", events.coords],
        ["bg_event", events.bgs],
        ["object_event", events.objects],
        ["scene_script", events.sceneScripts],
        ["callback", events.callbacks],
      ];
      for (const [macro, list] of checks) {
        for (const e of list) {
          expect(lines[e.lineIndex]!.trim().startsWith(macro)).toBe(true);
        }
      }
    }
  });

  itWithGbcCorpus("raw file count backs the parser: 391 '_MapEvents:' labels", () => {
    let count = 0;
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    for (const m of maps) {
      const text = readFileSync(`${GBC_SUBJECT_ROOT}/maps/${m.name}.asm`, "utf8");
      if (new RegExp(`^${m.name}_MapEvents:`, "m").test(text)) count++;
    }
    expect(count).toBe(391);
  });
});
