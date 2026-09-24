import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  evalPercent,
  parseGrassFile,
  parseWaterFile,
  parseWildProbabilities,
  parseFishGroups,
  parseTreemonSets,
  parseTreemonMaps,
  loadGbcWildData,
  wildForMap,
} from "../../../src/gbc/load/encounters.js";
import { loadGbcMaps } from "../../../src/gbc/load/map.js";
import type { GbcWildData } from "../../../src/gbc/model/types.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";

describe("evalPercent", () => {
  it("resolves a bare 'N percent' via floor(N*255/100)", () => {
    expect(evalPercent("2 percent")).toEqual({ raw: "2 percent", resolved: 5 }); // floor(2*255/100)=5.1->5
  });

  it("resolves '50 percent + 1'", () => {
    expect(evalPercent("50 percent + 1")).toEqual({ raw: "50 percent + 1", resolved: 128 }); // floor(50*255/100)=127, +1
  });

  it("resolves '90 percent + 1'", () => {
    expect(evalPercent("90 percent + 1")).toEqual({ raw: "90 percent + 1", resolved: 230 }); // floor(229.5)=229, +1
  });

  it("resolves '100 percent' to 255", () => {
    expect(evalPercent("100 percent")).toEqual({ raw: "100 percent", resolved: 255 });
  });

  it("resolves a minus form", () => {
    expect(evalPercent("50 percent - 1")).toEqual({ raw: "50 percent - 1", resolved: 126 });
  });

  it("refuses an expression shape it doesn't recognize, naming the text", () => {
    expect(() => evalPercent("2 * percent")).toThrow(/2 \* percent/);
  });
});

describe("parseGrassFile", () => {
  const oneEntry = [
    "JohtoGrassWildMons:",
    "",
    "\tdef_grass_wildmons SPROUT_TOWER_2F",
    "\tdb 3 percent, 4 percent, 5 percent ; encounter rates: morn/day/nite -- deliberately UNEQUAL (M10: a morn/nite rate swap must go red)",
    "\t; morn",
    "\tdb 3, RATTATA",
    "\tdb 4, RATTATA",
    "\tdb 5, RATTATA",
    "\tdb 3, RATTATA",
    "\tdb 6, RATTATA",
    "\tdb 5, RATTATA",
    "\tdb 5, RATTATA",
    "\t; day",
    "\tdb 3, RATTATA",
    "\tdb 4, RATTATA",
    "\tdb 5, RATTATA",
    "\tdb 3, RATTATA",
    "\tdb 6, RATTATA",
    "\tdb 5, RATTATA",
    "\tdb 5, RATTATA",
    "\t; nite",
    "\tdb 3, GASTLY",
    "\tdb 4, GASTLY",
    "\tdb 5, GASTLY",
    "\tdb 3, RATTATA",
    "\tdb 6, GASTLY",
    "\tdb 5, RATTATA",
    "\tdb 5, RATTATA",
    "\tend_grass_wildmons",
    "",
    "\tdb -1 ; end",
  ].join("\n");

  it("parses 3 rates and 3x7 slots in morn/day/nite order", () => {
    const { entries, defects } = parseGrassFile(oneEntry, "data/wild/johto_grass.asm");
    expect(defects).toEqual([]);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(e.mapConst).toBe("SPROUT_TOWER_2F");
    expect(e.file).toBe("data/wild/johto_grass.asm");
    expect(e.swarm).toBe(false);
    expect(e.rates.morn).toEqual({ raw: "3 percent", resolved: 7 }); // floor(3*255/100)=7.65->7
    expect(e.rates.day).toEqual({ raw: "4 percent", resolved: 10 }); // floor(4*255/100)=10.2->10
    expect(e.rates.nite).toEqual({ raw: "5 percent", resolved: 12 }); // floor(5*255/100)=12.75->12
    expect(e.slots.morn).toEqual([
      { level: 3, species: "RATTATA" },
      { level: 4, species: "RATTATA" },
      { level: 5, species: "RATTATA" },
      { level: 3, species: "RATTATA" },
      { level: 6, species: "RATTATA" },
      { level: 5, species: "RATTATA" },
      { level: 5, species: "RATTATA" },
    ]);
    expect(e.slots.nite[0]).toEqual({ level: 3, species: "GASTLY" });
    expect(e.slots.nite[3]).toEqual({ level: 3, species: "RATTATA" }); // nite slot 3 stays RATTATA, not GASTLY
  });

  it("supports a bare 'map_id MAP' block header (swarm_grass.asm's real shape, no def_/end_grass_wildmons wrapper)", () => {
    const text = [
      "SwarmGrassWildMons:",
      "",
      "\tmap_id ROUTE_35",
      "\tdb 10 percent, 10 percent, 10 percent ; encounter rates: morn/day/nite",
      ...Array.from({ length: 21 }, () => "\tdb 12, YANMA"),
      "",
      "\tdb -1 ; end",
    ].join("\n");
    const { entries, defects } = parseGrassFile(text, "data/wild/swarm_grass.asm", { swarm: true });
    expect(defects).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.mapConst).toBe("ROUTE_35");
    expect(entries[0]!.swarm).toBe(true);
    expect(entries[0]!.slots.day).toHaveLength(7);
  });

  it("flags a missing-terminator defect and still returns the parsed entries when EOF ends the list (kanto_grass.asm's real defect)", () => {
    const noTerminator = oneEntry.replace(/\n\n\tdb -1 ; end$/, ""); // strip the trailing blank line + terminator, as kanto_grass.asm lacks both
    expect(noTerminator.endsWith("end_grass_wildmons")).toBe(true);
    const { entries, defects } = parseGrassFile(noTerminator, "data/wild/kanto_grass.asm");
    expect(entries).toHaveLength(1);
    expect(defects).toHaveLength(1);
    expect(defects[0]!.file).toBe("data/wild/kanto_grass.asm");
    expect(defects[0]!.message).toMatch(/kanto_grass\.asm/);
  });

  it("refuses a rate line with the wrong argument count", () => {
    const bad = oneEntry.replace(
      "\tdb 3 percent, 4 percent, 5 percent ; encounter rates: morn/day/nite -- deliberately UNEQUAL (M10: a morn/nite rate swap must go red)",
      "\tdb 3 percent, 4 percent ; oops",
    );
    expect(() => parseGrassFile(bad, "x.asm")).toThrow(/x\.asm:4: SPROUT_TOWER_2F: rate line has 2 argument\(s\), expected 3/);
  });

  it("refuses a rate line whose percent expression evalPercent doesn't recognize, naming file+line (Issue 3)", () => {
    const bad = oneEntry.replace(
      "\tdb 3 percent, 4 percent, 5 percent ; encounter rates: morn/day/nite -- deliberately UNEQUAL (M10: a morn/nite rate swap must go red)",
      "\tdb 3 percent, BOGUS, 5 percent ; encounter rates: morn/day/nite",
    );
    expect(() => parseGrassFile(bad, "x.asm")).toThrow(/^x\.asm:4: evalPercent: "BOGUS" is not a recognized/);
  });

  it("refuses a slot line with the wrong argument count (Issue 1: readSlots must require exactly 2 args)", () => {
    const bad = oneEntry.replace("\tdb 3, GASTLY", "\tdb 3, GASTLY, 9");
    expect(() => parseGrassFile(bad, "x.asm")).toThrow(/^x\.asm:22: SPROUT_TOWER_2F: slot line has 3 argument\(s\), expected 2$/);
  });

  it("refuses a slot line with too FEW args (N6b: was silently accepted, species: undefined)", () => {
    const bad = oneEntry.replace("\tdb 3, GASTLY", "\tdb 3");
    expect(() => parseGrassFile(bad, "x.asm")).toThrow(/^x\.asm:22: SPROUT_TOWER_2F: slot line has 1 argument\(s\), expected 2$/);
  });

  it("refuses a grass block header with an extra arg (N13)", () => {
    const bad = oneEntry.replace("\tdef_grass_wildmons SPROUT_TOWER_2F", "\tdef_grass_wildmons SPROUT_TOWER_2F, EXTRA");
    expect(() => parseGrassFile(bad, "x.asm")).toThrow(/^x\.asm:3: grass block header has 2 argument\(s\), expected 1: /);
  });

  it("refuses a blank comma-separated arg in a slot line, naming file+line (Issue A: readDb's splitArgs wrapped via at())", () => {
    const bad = oneEntry.replace("\tdb 3, GASTLY", "\tdb 3, , GASTLY");
    expect(() => parseGrassFile(bad, "x.asm")).toThrow(/^x\.asm:22: splitArgs: blank argument in "3, , GASTLY"/);
  });

  it("refuses a blank comma-separated arg in a grass block header, naming file+line (Issue A: matchCall wrapped via at())", () => {
    const bad = oneEntry.replace("\tdef_grass_wildmons SPROUT_TOWER_2F", "\tdef_grass_wildmons SPROUT_TOWER_2F,");
    expect(() => parseGrassFile(bad, "x.asm")).toThrow(/^x\.asm:3: splitArgs: blank argument in "SPROUT_TOWER_2F,"/);
  });

  it.each([
    [
      "N1a: readSlots level (parseNum, not a count issue)",
      () => oneEntry.replace("\tdb 3, GASTLY", "\tdb BOGUS, GASTLY"),
      /^x\.asm:22: parseNum: "BOGUS" is not a clean \$hex or signed decimal number$/,
    ],
    [
      "N1b: grass morn rate (evalPercent, not a count issue)",
      () =>
        oneEntry.replace(
          "\tdb 3 percent, 4 percent, 5 percent ; encounter rates: morn/day/nite -- deliberately UNEQUAL (M10: a morn/nite rate swap must go red)",
          "\tdb BOGUS, 4 percent, 5 percent ; encounter rates: morn/day/nite",
        ),
      /^x\.asm:4: evalPercent: "BOGUS" is not a recognized/,
    ],
  ])("%s", (_name, makeBad, expected) => {
    expect(() => parseGrassFile(makeBad(), "x.asm")).toThrow(expected);
  });
});

describe("parseWaterFile", () => {
  const text = [
    "JohtoWaterWildMons:",
    "",
    "\tdef_water_wildmons RUINS_OF_ALPH_OUTSIDE",
    "\tdb 2 percent ; encounter rate",
    "\tdb 15, WOOPER",
    "\tdb 20, QUAGSIRE",
    "\tdb 15, QUAGSIRE",
    "\tend_water_wildmons",
    "",
    "\tdb -1 ; end",
  ].join("\n");

  it("parses 1 rate and 3 slots", () => {
    const { entries, defects } = parseWaterFile(text, "data/wild/johto_water.asm");
    expect(defects).toEqual([]);
    expect(entries).toEqual([
      {
        mapConst: "RUINS_OF_ALPH_OUTSIDE",
        file: "data/wild/johto_water.asm",
        swarm: false,
        rate: { raw: "2 percent", resolved: 5 },
        slots: [
          { level: 15, species: "WOOPER" },
          { level: 20, species: "QUAGSIRE" },
          { level: 15, species: "QUAGSIRE" },
        ],
        lineIndex: 2,
      },
    ]);
  });

  it("parses an empty table (swarm_water.asm's real shape: no entries, just the terminator)", () => {
    const empty = ["SwarmWaterWildMons:", "", "\tdb -1 ; end"].join("\n");
    const { entries, defects } = parseWaterFile(empty, "data/wild/swarm_water.asm", { swarm: true });
    expect(entries).toEqual([]);
    expect(defects).toEqual([]);
  });

  it("tags a NON-empty swarm water table's entries swarm: true (M9: swarm_water.asm has 0 entries on the real corpus, so that alone can't prove the flag propagates)", () => {
    const { entries } = parseWaterFile(text, "data/wild/swarm_water.asm", { swarm: true });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.swarm).toBe(true);
  });

  it("refuses a water rate line with an extra arg (N14)", () => {
    const bad = text.replace("\tdb 2 percent ; encounter rate", "\tdb 2 percent, EXTRA ; encounter rate");
    expect(() => parseWaterFile(bad, "w.asm")).toThrow(/^w\.asm:4: RUINS_OF_ALPH_OUTSIDE: rate line has 2 argument\(s\), expected 1$/);
  });

  it("refuses a water block header with an extra arg (N15)", () => {
    const bad = text.replace("\tdef_water_wildmons RUINS_OF_ALPH_OUTSIDE", "\tdef_water_wildmons RUINS_OF_ALPH_OUTSIDE, EXTRA");
    expect(() => parseWaterFile(bad, "w.asm")).toThrow(/^w\.asm:3: water block header has 2 argument\(s\), expected 1: /);
  });

  it("refuses a bad water rate value (N1d: evalPercent wrapped via at(), not a count issue)", () => {
    const bad = text.replace("\tdb 2 percent ; encounter rate", "\tdb BOGUS ; encounter rate");
    expect(() => parseWaterFile(bad, "w.asm")).toThrow(/^w\.asm:4: evalPercent: "BOGUS" is not a recognized/);
  });

  it("refuses a blank comma-separated arg in a water block header, naming file+line (Issue A: matchCall wrapped via at())", () => {
    const bad = text.replace("\tdef_water_wildmons RUINS_OF_ALPH_OUTSIDE", "\tdef_water_wildmons RUINS_OF_ALPH_OUTSIDE,");
    expect(() => parseWaterFile(bad, "w.asm")).toThrow(/^w\.asm:3: splitArgs: blank argument in "RUINS_OF_ALPH_OUTSIDE,"/);
  });
});

describe("parseWildProbabilities", () => {
  const text = [
    "MACRO mon_prob",
    "; percent, index",
    "\tdb \\1, \\2 * 2",
    "ENDM",
    "",
    "GrassMonProbTable:",
    "\ttable_width 2, GrassMonProbTable",
    "\tmon_prob 25,  0 ; 25% chance",
    "\tmon_prob 50,  1 ; 25% chance",
    "\tmon_prob 70,  2 ; 20% chance",
    "\tmon_prob 80,  3 ; 10% chance",
    "\tmon_prob 90,  4 ; 10% chance",
    "\tmon_prob 95,  5 ;  5% chance",
    "\tmon_prob 100, 6 ;  5% chance",
    "\tassert_table_length NUM_GRASSMON",
    "",
    "WaterMonProbTable:",
    "\ttable_width 2, WaterMonProbTable",
    "\tmon_prob 45,  0 ; 45% chance",
    "\tmon_prob 75,  1 ; 30% chance",
    "\tmon_prob 100, 2 ; 25% chance",
    "\tassert_table_length NUM_WATERMON",
  ].join("\n");

  it("converts cumulative mon_prob percentages into per-slot percentages", () => {
    const probs = parseWildProbabilities(text);
    expect(probs.grass).toEqual([25, 25, 20, 10, 10, 5, 5]);
    expect(probs.water).toEqual([45, 30, 25]);
  });

  it("refuses a mon_prob call with the wrong argument count, naming file+line, instead of a bare TypeError (Minor 2)", () => {
    const bad = text.replace("\tmon_prob 50,  1 ; 25% chance", "\tmon_prob 50 ; oops");
    expect(() => parseWildProbabilities(bad, "probabilities.asm")).toThrow(
      /^probabilities\.asm:9: "mon_prob" has 1 argument\(s\), expected 2$/,
    );
  });

  it("refuses a mon_prob call with an EXTRA argument (N7a)", () => {
    const bad = text.replace("\tmon_prob 50,  1 ; 25% chance", "\tmon_prob 50, 1, 99 ; extra");
    expect(() => parseWildProbabilities(bad, "probabilities.asm")).toThrow(
      /^probabilities\.asm:9: "mon_prob" has 3 argument\(s\), expected 2$/,
    );
  });

  it("refuses a missing GrassMonProbTable/WaterMonProbTable label, naming the file (Issue A: was a bare, file-free Error even though `file` was passed in)", () => {
    expect(() => parseWildProbabilities("WaterMonProbTable:\n\tmon_prob 100, 0\n", "probabilities.asm")).toThrow(
      /^probabilities\.asm: no "GrassMonProbTable:" label found$/,
    );
  });

  it("refuses a blank comma-separated arg in a mon_prob call, naming file+line (Issue A: scanCalls has no per-call line yet, so it's anchored at the table's own start line, not the bad line itself)", () => {
    const bad = text.replace("\tmon_prob 95,  5 ;  5% chance", "\tmon_prob 95, , 5 ;  5% chance");
    expect(() => parseWildProbabilities(bad, "probabilities.asm")).toThrow(/^probabilities\.asm:7: splitArgs: blank argument in/);
  });

  it.each([
    ["N1e: mon_prob cumulative (parseNum, not a count issue)", "\tmon_prob 50,  1 ; 25% chance", "\tmon_prob BOGUS,  1 ; oops"],
    ["N1e: mon_prob index (parseNum, not a count issue)", "\tmon_prob 50,  1 ; 25% chance", "\tmon_prob 50,  BOGUS ; oops"],
  ])("%s", (_name, oldStr, newStr) => {
    const bad = text.replace(oldStr, newStr);
    expect(() => parseWildProbabilities(bad, "probabilities.asm")).toThrow(/^probabilities\.asm:9: parseNum: "BOGUS" is not a clean \$hex or signed decimal number$/);
  });

  it("refuses a GrassMonProbTable with the wrong number of mon_prob lines (Issue C: a missing/extra line would otherwise silently produce a wrong-length array)", () => {
    const bad = text.replace("\tmon_prob 95,  5 ;  5% chance\n", "");
    expect(() => parseWildProbabilities(bad, "probabilities.asm")).toThrow(/^probabilities\.asm:7: expected 7 "mon_prob" line\(s\), found 6$/);
  });

  it("refuses a duplicated mon_prob index (Issue C: indices must be 0..N-1, each exactly once)", () => {
    const bad = text.replace("\tmon_prob 95,  5 ;  5% chance", "\tmon_prob 95,  4 ; duplicate of index 4");
    expect(() => parseWildProbabilities(bad, "probabilities.asm")).toThrow(/^probabilities\.asm:13: "mon_prob" index 4 is not a unique value in 0\.\.6$/);
  });

  it("refuses an out-of-range mon_prob index (Issue C)", () => {
    const bad = text.replace("\tmon_prob 95,  5 ;  5% chance", "\tmon_prob 95,  9 ; out of range");
    expect(() => parseWildProbabilities(bad, "probabilities.asm")).toThrow(/^probabilities\.asm:13: "mon_prob" index 9 is not a unique value in 0\.\.6$/);
  });

  it("refuses a non-decreasing cumulative value (Issue C)", () => {
    const bad = text.replace("\tmon_prob 90,  4 ; 10% chance", "\tmon_prob 60,  4 ; oops, less than the previous 80");
    expect(() => parseWildProbabilities(bad, "probabilities.asm")).toThrow(
      /^probabilities\.asm:12: "mon_prob" cumulative value 60 is less than the previous entry's 80 --/,
    );
  });

  it("refuses a table that doesn't end at cumulative 100 (Issue C: the real probabilities.asm always ends at 100 for both tables)", () => {
    const bad = text.replace("\tmon_prob 100, 6 ;  5% chance", "\tmon_prob 99, 6 ; oops, not 100");
    expect(() => parseWildProbabilities(bad, "probabilities.asm")).toThrow(/^probabilities\.asm:14: "mon_prob" table ends at cumulative 99, expected 100$/);
  });
});

describe("parseFishGroups", () => {
  const text = [
    "DEF time_group EQUS \"0,\" ; use the nth TimeFishGroups entry",
    "",
    "MACRO fishgroup",
    "; chance, old rod, good rod, super rod",
    "\tdb \\1",
    "\tdw \\2, \\3, \\4",
    "ENDM",
    "",
    "FishGroups:",
    "\ttable_width FISHGROUP_DATA_LENGTH, FishGroups",
    "\tfishgroup 50 percent + 1, .Shore_Old,            .Shore_Good,            .Shore_Super",
    "\tassert_table_length NUM_FISHGROUPS",
    "",
    ".Shore_Old:",
    "\tdb  70 percent + 1, MAGIKARP,   10",
    "\tdb  85 percent + 1, MAGIKARP,   10",
    "\tdb 100 percent,     KRABBY,     10",
    ".Shore_Good:",
    "\tdb  35 percent,     MAGIKARP,   20",
    "\tdb  70 percent,     KRABBY,     20",
    "\tdb  90 percent + 1, KRABBY,     20",
    "\tdb 100 percent,     time_group 0",
    ".Shore_Super:",
    "\tdb  40 percent,     KRABBY,     40",
    "\tdb  70 percent,     time_group 1",
    "\tdb  90 percent + 1, KRABBY,     40",
    "\tdb 100 percent,     KINGLER,    40",
    "",
    "TimeFishGroups:",
    "\tdb CORSOLA,    20,  STARYU,     20 ; 0",
    "\tdb SHELLDER,   20,  SHELLDER,   20 ; 1",
  ].join("\n");

  it("parses the bite chance, rod tables (species records), and a time_group reference", () => {
    const { fishGroups, timeFishGroups } = parseFishGroups(text, ["FISHGROUP_SHORE"]);
    expect(fishGroups).toHaveLength(1);
    const g = fishGroups[0]!;
    expect(g.constName).toBe("FISHGROUP_SHORE");
    expect(g.index).toBe(0);
    expect(g.biteChance).toEqual({ raw: "50 percent + 1", resolved: 128 });
    expect(g.oldRod).toEqual([
      { chance: { raw: "70 percent + 1", resolved: 179 }, kind: "species", species: "MAGIKARP", level: 10 },
      { chance: { raw: "85 percent + 1", resolved: 217 }, kind: "species", species: "MAGIKARP", level: 10 },
      { chance: { raw: "100 percent", resolved: 255 }, kind: "species", species: "KRABBY", level: 10 },
    ]);
    expect(g.goodRod[3]).toEqual({ chance: { raw: "100 percent", resolved: 255 }, kind: "timeGroup", timeGroupIndex: 0 });
    expect(g.superRod[1]).toEqual({ chance: { raw: "70 percent", resolved: 178 }, kind: "timeGroup", timeGroupIndex: 1 });
  });

  it("parses TimeFishGroups day/nite rows in order", () => {
    const { timeFishGroups } = parseFishGroups(text, ["FISHGROUP_SHORE"]);
    expect(timeFishGroups).toEqual([
      { index: 0, day: { species: "CORSOLA", level: 20 }, nite: { species: "STARYU", level: 20 } },
      { index: 1, day: { species: "SHELLDER", level: 20 }, nite: { species: "SHELLDER", level: 20 } },
    ]);
  });

  it("refuses a rod record with the wrong argument count, naming file+line (Issue 3)", () => {
    const bad = text.replace("\tdb  70 percent + 1, MAGIKARP,   10", "\tdb  70 percent + 1, MAGIKARP,   10, EXTRA");
    expect(() => parseFishGroups(bad, ["FISHGROUP_SHORE"], "fish.asm")).toThrow(
      /^fish\.asm:15: rod record: "70 percent \+ 1, MAGIKARP, 10, EXTRA" is neither/,
    );
  });

  it("refuses a mon_prob-adjacent bite-chance percent it doesn't recognize, naming file+line (Issue 3, at() wrapper)", () => {
    const bad = text.replace("\tfishgroup 50 percent + 1, .Shore_Old,            .Shore_Good,            .Shore_Super", "\tfishgroup BOGUS, .Shore_Old, .Shore_Good, .Shore_Super");
    expect(() => parseFishGroups(bad, ["FISHGROUP_SHORE"], "fish.asm")).toThrow(/^fish\.asm:11: evalPercent: "BOGUS" is not a recognized/);
  });

  it("refuses a TimeFishGroups row with the wrong argument count, naming file+line", () => {
    const bad = text.replace("\tdb CORSOLA,    20,  STARYU,     20 ; 0", "\tdb CORSOLA, 20, STARYU");
    expect(() => parseFishGroups(bad, ["FISHGROUP_SHORE"], "fish.asm")).toThrow(
      /^fish\.asm:30: TimeFishGroups row 0: 3 argument\(s\), expected 4$/,
    );
  });

  it("refuses a TimeFishGroups row with an EXTRA argument (N10)", () => {
    const bad = text.replace("\tdb CORSOLA,    20,  STARYU,     20 ; 0", "\tdb CORSOLA, 20, STARYU, 20, 99 ; 0");
    expect(() => parseFishGroups(bad, ["FISHGROUP_SHORE"], "fish.asm")).toThrow(
      /^fish\.asm:30: TimeFishGroups row 0: 5 argument\(s\), expected 4$/,
    );
  });

  it("refuses a fishgroup call with an EXTRA argument (N11)", () => {
    const bad = text.replace(
      "\tfishgroup 50 percent + 1, .Shore_Old,            .Shore_Good,            .Shore_Super",
      "\tfishgroup 50 percent + 1, .Shore_Old, .Shore_Good, .Shore_Super, EXTRA",
    );
    expect(() => parseFishGroups(bad, ["FISHGROUP_SHORE"], "fish.asm")).toThrow(/^fish\.asm:11: "fishgroup" has 5 argument\(s\), expected 4$/);
  });

  it("refuses a rod record with time_group plus a stray extra arg, naming file+line, instead of reading it as a species record (Issue B)", () => {
    const bad = text.replace("\tdb 100 percent,     time_group 0", "\tdb 100 percent,     time_group 0, 5");
    expect(() => parseFishGroups(bad, ["FISHGROUP_SHORE"], "fish.asm")).toThrow(
      /^fish\.asm:22: rod record: "100 percent, time_group 0, 5" is neither a 3-arg species record nor a 2-arg time_group reference$/,
    );
  });

  it("refuses a blank comma-separated arg in a rod record, naming its own exact line (Issue A: dbLinesIn's splitArgs is wrapped per-line, unlike scanCalls' whole-body anchor)", () => {
    const bad = text.replace("\tdb  85 percent + 1, MAGIKARP,   10", "\tdb  85 percent + 1, , 10");
    expect(() => parseFishGroups(bad, ["FISHGROUP_SHORE"], "fish.asm")).toThrow(/^fish\.asm:16: splitArgs: blank argument in "85 percent \+ 1, , 10"/);
  });

  it("refuses a blank comma-separated arg in a fishgroup call, naming file+line (Issue A: scanCalls wrapped via at(), anchored at the table body's own start line since scanCalls has no per-call line until it returns)", () => {
    const bad = text.replace(
      "\tfishgroup 50 percent + 1, .Shore_Old,            .Shore_Good,            .Shore_Super",
      "\tfishgroup 50 percent + 1, .Shore_Old, , .Shore_Super",
    );
    expect(() => parseFishGroups(bad, ["FISHGROUP_SHORE"], "fish.asm")).toThrow(/^fish\.asm:10: splitArgs: blank argument in/);
  });

  it.each([
    [
      "N1f: rod chance (evalPercent, not a count issue)",
      "\tdb  70 percent + 1, MAGIKARP,   10",
      "\tdb  BOGUS, MAGIKARP,   10",
      /^fish\.asm:15: evalPercent: "BOGUS" is not a recognized/,
    ],
    [
      "N1g: rod species level (parseNum, not a count issue)",
      "\tdb  70 percent + 1, MAGIKARP,   10",
      "\tdb  70 percent + 1, MAGIKARP,   BOGUS",
      /^fish\.asm:15: parseNum: "BOGUS" is not a clean \$hex or signed decimal number$/,
    ],
    [
      "N1i: TimeFishGroups day level (parseNum, not a count issue)",
      "\tdb CORSOLA,    20,  STARYU,     20 ; 0",
      "\tdb CORSOLA,    BOGUS,  STARYU,     20 ; 0",
      /^fish\.asm:30: parseNum: "BOGUS" is not a clean \$hex or signed decimal number$/,
    ],
  ])("%s", (_name, oldStr, newStr, expected) => {
    const bad = text.replace(oldStr, newStr);
    expect(() => parseFishGroups(bad, ["FISHGROUP_SHORE"], "fish.asm")).toThrow(expected);
  });
});

describe("parseTreemonSets", () => {
  const text = [
    "TreeMons:",
    "\ttable_width 2, TreeMons",
    "\tdw TreeMonSet_City",
    "\tdw TreeMonSet_Rock",
    "\tassert_table_length NUM_TREEMON_SETS",
    "\tdw TreeMonSet_City ; unused",
    "",
    "TreeMonSet_City:",
    "; common",
    "\tdb 50, SPEAROW,    10",
    "\tdb 15, SPEAROW,    10",
    "\tdb -1",
    "; rare",
    "\tdb 30, SPEAROW,    10",
    "\tdb -1",
    "",
    "TreeMonSet_Rock:",
    "\tdb 90, KRABBY,     15",
    "\tdb 10, SHUCKLE,    15",
    "\tdb -1",
  ].join("\n");

  it("resolves sets by pointer-table position, not file label order", () => {
    // Rock appears SECOND in the pointer table but this fixture also puts it
    // second in the file -- the real corpus differs (file order is
    // City/Canyon, Town, Route, Kanto, Lake, Forest, Rock, KCity, KRoute,
    // KTown; table order is City, Canyon, Town, Route, Kanto, Lake, Forest,
    // Rock, KCity, KTown, KRoute) -- see the corpus test below for that case.
    const sets = parseTreemonSets(text, ["TREEMON_SET_CITY", "TREEMON_SET_ROCK"]);
    expect(sets).toHaveLength(2);
    expect(sets[0]!.constName).toBe("TREEMON_SET_CITY");
    expect(sets[1]!.constName).toBe("TREEMON_SET_ROCK");
  });

  it("stops the pointer table at the first non-dw line, excluding the trailing unused duplicate", () => {
    const sets = parseTreemonSets(text, ["TREEMON_SET_CITY", "TREEMON_SET_ROCK"]);
    expect(sets).toHaveLength(2); // not 3 -- the "unused" dw TreeMonSet_City after assert_table_length is excluded
  });

  it("TREEMON_SET_CITY (index 0) is flagged yieldsNothing even though it has common/rare data", () => {
    const sets = parseTreemonSets(text, ["TREEMON_SET_CITY", "TREEMON_SET_ROCK"]);
    expect(sets[0]!.yieldsNothing).toBe(true);
    expect(sets[0]!.common).toEqual([
      { percent: 50, species: "SPEAROW", level: 10 },
      { percent: 15, species: "SPEAROW", level: 10 },
    ]);
    expect(sets[0]!.rare).toEqual([{ percent: 30, species: "SPEAROW", level: 10 }]);
  });

  it("refuses a treemon record with the wrong argument count, naming file+line (Issue 1/3)", () => {
    const bad = text.replace("\tdb 50, SPEAROW,    10", "\tdb 50, SPEAROW");
    expect(() => parseTreemonSets(bad, ["TREEMON_SET_CITY", "TREEMON_SET_ROCK"], "treemons.asm")).toThrow(
      /^treemons\.asm:10: treemon record: "50, SPEAROW" has 2 argument\(s\), expected 3$/,
    );
  });

  it("refuses a set body with data left over after the common+rare lists (Issue 1: a set body is exactly 1 or 2 db -1-terminated lists)", () => {
    const extra = text.replace(
      ["\tdb 30, SPEAROW,    10", "\tdb -1", "", "TreeMonSet_Rock:"].join("\n"),
      ["\tdb 30, SPEAROW,    10", "\tdb -1", "\tdb 99, MAGIKARP,   5", "", "TreeMonSet_Rock:"].join("\n"),
    );
    expect(extra).not.toBe(text);
    expect(() => parseTreemonSets(extra, ["TREEMON_SET_CITY", "TREEMON_SET_ROCK"], "treemons.asm")).toThrow(
      /^treemons\.asm:16: TreeMonSet_City: unexpected data after the rare list \("99, MAGIKARP, 5"\)$/,
    );
  });

  it("a set with only one db -1-terminated list (Rock) has rare: null", () => {
    const sets = parseTreemonSets(text, ["TREEMON_SET_CITY", "TREEMON_SET_ROCK"]);
    expect(sets[1]!.yieldsNothing).toBe(false);
    expect(sets[1]!.common).toEqual([
      { percent: 90, species: "KRABBY", level: 15 },
      { percent: 10, species: "SHUCKLE", level: 15 },
    ]);
    expect(sets[1]!.rare).toBeNull();
  });

  it("resolves stacked labels (two names, one body) to the same data -- City/Canyon's real shape", () => {
    const stacked = [
      "TreeMons:",
      "\tdw TreeMonSet_City",
      "\tdw TreeMonSet_Canyon",
      "\tassert_table_length NUM_TREEMON_SETS",
      "",
      "TreeMonSet_City:",
      "TreeMonSet_Canyon:",
      "; common",
      "\tdb 50, SPEAROW,    10",
      "\tdb -1",
      "; rare",
      "\tdb 30, SPEAROW,    10",
      "\tdb -1",
    ].join("\n");
    const sets = parseTreemonSets(stacked, ["TREEMON_SET_CITY", "TREEMON_SET_CANYON"]);
    expect(sets[0]!.common).toEqual(sets[1]!.common);
    expect(sets[0]!.yieldsNothing).toBe(true);
    expect(sets[1]!.yieldsNothing).toBe(false); // Canyon is index 1, not the special-cased index 0
  });

  it("refuses a treemon record with an EXTRA argument (N8)", () => {
    const bad = text.replace("\tdb 50, SPEAROW,    10", "\tdb 50, SPEAROW,    10, 99");
    expect(() => parseTreemonSets(bad, ["TREEMON_SET_CITY", "TREEMON_SET_ROCK"], "treemons.asm")).toThrow(
      /^treemons\.asm:10: treemon record: "50, SPEAROW, 10, 99" has 4 argument\(s\), expected 3$/,
    );
  });

  it.each([
    ["N1j: treemon percent (parseNum, not a count issue)", "\tdb 50, SPEAROW,    10", "\tdb BOGUS, SPEAROW,    10"],
    ["N1j: treemon level (parseNum, not a count issue)", "\tdb 50, SPEAROW,    10", "\tdb 50, SPEAROW,    BOGUS"],
  ])("%s", (_name, oldStr, newStr) => {
    const bad = text.replace(oldStr, newStr);
    expect(() => parseTreemonSets(bad, ["TREEMON_SET_CITY", "TREEMON_SET_ROCK"], "treemons.asm")).toThrow(
      /^treemons\.asm:10: parseNum: "BOGUS" is not a clean \$hex or signed decimal number$/,
    );
  });

  it("reports the exact line of an error INSIDE a stacked label's body, computed from the LAST stacked label (N20: bodyLineIndex must not be taken from the first)", () => {
    // City/Canyon stacked with NO blank line between them (the real corpus
    // shape) -- if bodyLineIndex were computed from the FIRST label
    // (TreeMonSet_City's own line) instead of the LAST (TreeMonSet_Canyon's),
    // every line number inside the body would be off by exactly 1.
    const stackedBad = [
      "TreeMons:",
      "\tdw TreeMonSet_City",
      "\tdw TreeMonSet_Canyon",
      "\tassert_table_length NUM_TREEMON_SETS",
      "",
      "TreeMonSet_City:",
      "TreeMonSet_Canyon:",
      "\tdb 50, SPEAROW",
      "\tdb -1",
    ].join("\n");
    // Lines (0-based): 0 TreeMons:, 1 dw City, 2 dw Canyon, 3 assert, 4 "",
    // 5 TreeMonSet_City:, 6 TreeMonSet_Canyon:, 7 the bad db line (2 args).
    // The body starts right after line 6 (the LAST stacked label), so the
    // bad line's absolute index is 7 -> 1-based 8.
    expect(() => parseTreemonSets(stackedBad, ["TREEMON_SET_CITY", "TREEMON_SET_CANYON"], "t.asm")).toThrow(
      /^t\.asm:8: treemon record: "50, SPEAROW" has 2 argument\(s\), expected 3$/,
    );
  });
});

describe("parseTreemonMaps", () => {
  const text = [
    "MACRO treemon_map",
    "\tmap_id \\1",
    "\tdb \\2 ; treemon set",
    "ENDM",
    "",
    "TreeMonMaps:",
    "\ttreemon_map ROUTE_29, TREEMON_SET_ROUTE",
    "\ttreemon_map NEW_BARK_TOWN, TREEMON_SET_CITY",
    "",
    "\tdb -1",
    "",
    "RockMonMaps:",
    "\ttreemon_map CIANWOOD_CITY, TREEMON_SET_ROCK",
    "\tdb -1",
  ].join("\n");

  it("splits headbutt (TreeMonMaps) from rock (RockMonMaps) by label position", () => {
    const { treemonMaps, rockMonMaps } = parseTreemonMaps(text);
    expect(treemonMaps).toEqual([
      { mapConst: "ROUTE_29", setConst: "TREEMON_SET_ROUTE", lineIndex: 6 },
      { mapConst: "NEW_BARK_TOWN", setConst: "TREEMON_SET_CITY", lineIndex: 7 },
    ]);
    expect(rockMonMaps).toEqual([{ mapConst: "CIANWOOD_CITY", setConst: "TREEMON_SET_ROCK", lineIndex: 12 }]);
  });

  it.each([
    ["N9: extra argument", "\ttreemon_map ROUTE_29, TREEMON_SET_ROUTE", "\ttreemon_map ROUTE_29, TREEMON_SET_ROUTE, 99", 3],
    ["N9: missing argument", "\ttreemon_map ROUTE_29, TREEMON_SET_ROUTE", "\ttreemon_map ROUTE_29", 1],
  ])("%s", (_name, oldStr, newStr, argCount) => {
    const bad = text.replace(oldStr, newStr);
    expect(() => parseTreemonMaps(bad, "m.asm")).toThrow(new RegExp(`^m\\.asm:7: "treemon_map" has ${argCount} argument\\(s\\), expected 2$`));
  });

  it("refuses a blank comma-separated arg in a treemon_map call, naming the file (Issue A: scanCalls wrapped via at(), no per-call line exists yet so it's file-only, matching fail's null-line convention)", () => {
    const bad = text.replace("\ttreemon_map ROUTE_29, TREEMON_SET_ROUTE", "\ttreemon_map ROUTE_29, , TREEMON_SET_ROUTE");
    expect(() => parseTreemonMaps(bad, "m.asm")).toThrow(/^m\.asm: splitArgs: blank argument in/);
  });
});

describe("wildForMap: unknown treemon/rock set const (Issue 2)", () => {
  const emptyData: GbcWildData = {
    grass: [],
    water: [],
    probabilities: { grass: [], water: [] },
    fishGroups: [],
    timeFishGroups: [],
    treemonSets: [{ constName: "TREEMON_SET_CITY", index: 0, yieldsNothing: true, common: [], rare: null }],
    treemonMaps: [],
    rockMonMaps: [],
    defects: [],
  };

  it("throws naming the map and the unknown const when a treemon row's set const doesn't resolve, instead of silently returning null", () => {
    const data: GbcWildData = { ...emptyData, treemonMaps: [{ mapConst: "SOME_MAP", setConst: "TREEMON_SET_TYPO", lineIndex: 0 }] };
    expect(() => wildForMap(data, { constName: "SOME_MAP", fishGroup: "FISHGROUP_NONE", name: "SomeMap" })).toThrow(
      /^wildForMap: SomeMap: unknown treemon set "TREEMON_SET_TYPO"$/,
    );
  });

  it("throws naming the map and the unknown const when a rock row's set const doesn't resolve", () => {
    const data: GbcWildData = { ...emptyData, rockMonMaps: [{ mapConst: "SOME_MAP", setConst: "TREEMON_SET_TYPO", lineIndex: 0 }] };
    expect(() => wildForMap(data, { constName: "SOME_MAP", fishGroup: "FISHGROUP_NONE", name: "SomeMap" })).toThrow(
      /^wildForMap: SomeMap: unknown treemon set "TREEMON_SET_TYPO"$/,
    );
  });

  it("a map with NO treemon/rock row still returns null / {set:null, yieldsNothing:false}, not a throw", () => {
    const w = wildForMap(emptyData, { constName: "SOME_MAP", fishGroup: "FISHGROUP_NONE", name: "SomeMap" });
    expect(w.headbutt).toEqual({ set: null, yieldsNothing: false });
    expect(w.rock).toBeNull();
  });

  it("resolves a real set const without throwing", () => {
    const data: GbcWildData = { ...emptyData, treemonMaps: [{ mapConst: "SOME_MAP", setConst: "TREEMON_SET_CITY", lineIndex: 0 }] };
    const w = wildForMap(data, { constName: "SOME_MAP", fishGroup: "FISHGROUP_NONE", name: "SomeMap" });
    expect(w.headbutt.set?.constName).toBe("TREEMON_SET_CITY");
    expect(w.headbutt.yieldsNothing).toBe(true);
  });
});

/** Minimal, hand-built `data/wild/*.asm` + `constants/*.asm` fixture set that `loadGbcWildData` will load cleanly (Issue 2's unknown-const refusals need a real root to load from, not a hand-built `GbcWildData`). `overrides` replaces individual files by their repo-relative path. */
function makeWildDataRoot(overrides: Record<string, string> = {}): string {
  const johtoGrass = (mapConst: string) =>
    ["JohtoGrassWildMons:", "", `\tdef_grass_wildmons ${mapConst}`, "\tdb 2 percent, 2 percent, 2 percent", ...Array.from({ length: 21 }, () => "\tdb 3, RATTATA"), "\tend_grass_wildmons", "", "\tdb -1"].join(
      "\n",
    );
  const emptyGrass = (label: string) => [`${label}:`, "", "\tdb -1 ; end"].join("\n");
  const emptyWater = (label: string) => [`${label}:`, "", "\tdb -1 ; end"].join("\n");
  const probabilities = [
    "MACRO mon_prob",
    "\tdb \\1, \\2 * 2",
    "ENDM",
    "",
    "GrassMonProbTable:",
    ...[10, 20, 30, 40, 50, 60, 100].map((cum, i) => `\tmon_prob ${cum}, ${i}`),
    "",
    "WaterMonProbTable:",
    ...[30, 60, 100].map((cum, i) => `\tmon_prob ${cum}, ${i}`),
  ].join("\n");
  const fish = [
    "MACRO fishgroup",
    "\tdb \\1",
    "\tdw \\2, \\3, \\4",
    "ENDM",
    "",
    "FishGroups:",
    "\tfishgroup 50 percent + 1, .Shore_Old, .Shore_Good, .Shore_Super",
    "",
    ".Shore_Old:",
    "\tdb 100 percent, MAGIKARP, 10",
    ".Shore_Good:",
    "\tdb 100 percent, MAGIKARP, 10",
    ".Shore_Super:",
    "\tdb 100 percent, MAGIKARP, 10",
    "",
    "TimeFishGroups:",
    "\tdb CORSOLA, 20, STARYU, 20",
  ].join("\n");
  const treemons = ["TreeMons:", "\tdw TreeMonSet_City", "\tassert_table_length NUM_TREEMON_SETS", "", "TreeMonSet_City:", "\tdb 50, SPEAROW, 10", "\tdb -1"].join("\n");
  const treemonMaps = ["TreeMonMaps:", "\tdb -1", "", "RockMonMaps:", "\tdb -1"].join("\n");
  const mapDataConsts = ["const_def", "\tconst FISHGROUP_NONE", "\tconst FISHGROUP_SHORE"].join("\n");
  const pokemonDataConsts = ["const_def", "\tconst TREEMON_SET_CITY"].join("\n");
  const mapConstants = ["\tnewgroup", "\tmap_const REAL_MAP, 10, 10", "\tendgroup"].join("\n");

  const files: Record<string, string> = {
    "data/wild/johto_grass.asm": johtoGrass("REAL_MAP"),
    "data/wild/kanto_grass.asm": emptyGrass("KantoGrassWildMons"),
    "data/wild/swarm_grass.asm": emptyGrass("SwarmGrassWildMons"),
    "data/wild/johto_water.asm": emptyWater("JohtoWaterWildMons"),
    "data/wild/kanto_water.asm": emptyWater("KantoWaterWildMons"),
    "data/wild/swarm_water.asm": emptyWater("SwarmWaterWildMons"),
    "data/wild/probabilities.asm": probabilities,
    "data/wild/fish.asm": fish,
    "data/wild/treemons.asm": treemons,
    "data/wild/treemon_maps.asm": treemonMaps,
    "constants/map_data_constants.asm": mapDataConsts,
    "constants/pokemon_data_constants.asm": pokemonDataConsts,
    "constants/map_constants.asm": mapConstants,
    ...overrides,
  };
  const dir = mkdtempSync(join(tmpdir(), "gbc-wild-fixture-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

/** A `def_grass_wildmons`-wrapped grass file with one entry, for a given label and map const (N3a/c: swarm/kanto grass map-const validation). */
function grassFixture(label: string, mapConst: string): string {
  return [`${label}:`, "", `\tdef_grass_wildmons ${mapConst}`, "\tdb 2 percent, 2 percent, 2 percent", ...Array.from({ length: 21 }, () => "\tdb 3, RATTATA"), "\tend_grass_wildmons", "", "\tdb -1"].join(
    "\n",
  );
}
/** A bare `map_id`-headed grass file (swarm_grass.asm's real shape) with one entry (N3a). */
function swarmGrassFixture(mapConst: string): string {
  return ["SwarmGrassWildMons:", "", `\tmap_id ${mapConst}`, "\tdb 2 percent, 2 percent, 2 percent", ...Array.from({ length: 21 }, () => "\tdb 3, RATTATA"), "", "\tdb -1"].join("\n");
}
/** A `def_water_wildmons`-wrapped water file with one entry, for a given label and map const (N3b: water map-const validation). */
function waterFixture(label: string, mapConst: string): string {
  return [`${label}:`, "", `\tdef_water_wildmons ${mapConst}`, "\tdb 2 percent", "\tdb 15, WOOPER", "\tdb 15, WOOPER", "\tdb 15, WOOPER", "\tend_water_wildmons", "", "\tdb -1"].join("\n");
}

describe("loadGbcWildData: unknown-const refusals (Issue 2)", () => {
  it("loads cleanly with an all-valid fixture (sanity check for the fixture itself)", () => {
    const dir = makeWildDataRoot();
    try {
      expect(() => loadGbcWildData(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a grass entry naming a map const that isn't a real map_const, naming file+line", () => {
    const johtoGrassBad = [
      "JohtoGrassWildMons:",
      "",
      "\tdef_grass_wildmons BAD_MAP",
      "\tdb 2 percent, 2 percent, 2 percent",
      ...Array.from({ length: 21 }, () => "\tdb 3, RATTATA"),
      "\tend_grass_wildmons",
      "",
      "\tdb -1",
    ].join("\n");
    const dir = makeWildDataRoot({ "data/wild/johto_grass.asm": johtoGrassBad });
    try {
      expect(() => loadGbcWildData(dir)).toThrow(/^data\/wild\/johto_grass\.asm:3: unknown map constant "BAD_MAP"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a treemon_map row naming a map const that isn't a real map_const, naming file+line", () => {
    const dir = makeWildDataRoot({
      "data/wild/treemon_maps.asm": ["TreeMonMaps:", "\ttreemon_map BAD_MAP, TREEMON_SET_CITY", "\tdb -1", "", "RockMonMaps:", "\tdb -1"].join("\n"),
    });
    try {
      expect(() => loadGbcWildData(dir)).toThrow(/^data\/wild\/treemon_maps\.asm:2: unknown map constant "BAD_MAP"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a treemon_map row naming a set const that isn't one of the derived TREEMON_SET_* names, naming file+line", () => {
    const dir = makeWildDataRoot({
      "data/wild/treemon_maps.asm": ["TreeMonMaps:", "\ttreemon_map REAL_MAP, TREEMON_SET_TYPO", "\tdb -1", "", "RockMonMaps:", "\tdb -1"].join("\n"),
    });
    try {
      expect(() => loadGbcWildData(dir)).toThrow(/^data\/wild\/treemon_maps\.asm:2: unknown treemon set constant "TREEMON_SET_TYPO"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a rock row naming a set const that isn't one of the derived TREEMON_SET_* names, naming file+line", () => {
    const dir = makeWildDataRoot({
      "data/wild/treemon_maps.asm": ["TreeMonMaps:", "\tdb -1", "", "RockMonMaps:", "\ttreemon_map REAL_MAP, TREEMON_SET_TYPO", "\tdb -1"].join("\n"),
    });
    try {
      expect(() => loadGbcWildData(dir)).toThrow(/^data\/wild\/treemon_maps\.asm:5: unknown treemon set constant "TREEMON_SET_TYPO"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Issue D (N3a-d): map-const validation pinned for every source it covers,
  // not just johto grass and headbutt rows -- each of these four sources had
  // its own mutation survive in the spec re-review (skip the grass loop for
  // swarm entries only / skip the whole water loop / skip the loop for kanto
  // entries only / bypass validation for rock rows only) because no test
  // exercised that specific source.
  it.each([
    ["N3a: swarm grass (map_id header)", "data/wild/swarm_grass.asm", swarmGrassFixture("BAD_MAP"), /^data\/wild\/swarm_grass\.asm:3: unknown map constant "BAD_MAP"/],
    ["N3c: kanto grass", "data/wild/kanto_grass.asm", grassFixture("KantoGrassWildMons", "BAD_MAP"), /^data\/wild\/kanto_grass\.asm:3: unknown map constant "BAD_MAP"/],
    ["N3b: johto water", "data/wild/johto_water.asm", waterFixture("JohtoWaterWildMons", "BAD_MAP"), /^data\/wild\/johto_water\.asm:3: unknown map constant "BAD_MAP"/],
    ["N3b: kanto water", "data/wild/kanto_water.asm", waterFixture("KantoWaterWildMons", "BAD_MAP"), /^data\/wild\/kanto_water\.asm:3: unknown map constant "BAD_MAP"/],
    ["N3b: swarm water", "data/wild/swarm_water.asm", waterFixture("SwarmWaterWildMons", "BAD_MAP"), /^data\/wild\/swarm_water\.asm:3: unknown map constant "BAD_MAP"/],
    [
      "N3d: rock row (RockMonMaps, not headbutt)",
      "data/wild/treemon_maps.asm",
      ["TreeMonMaps:", "\tdb -1", "", "RockMonMaps:", "\ttreemon_map BAD_MAP, TREEMON_SET_CITY", "\tdb -1"].join("\n"),
      /^data\/wild\/treemon_maps\.asm:5: unknown map constant "BAD_MAP"/,
    ],
  ])("%s", (_name, overridePath, badContent, expected) => {
    const dir = makeWildDataRoot({ [overridePath]: badContent });
    try {
      expect(() => loadGbcWildData(dir)).toThrow(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("corpus", () => {
  itWithGbcCorpus("loadGbcWildData: exactly 1 defect (kanto_grass.asm, missing terminator)", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    expect(data.defects).toHaveLength(1);
    expect(data.defects[0]!.file).toBe("data/wild/kanto_grass.asm");
  });

  itWithGbcCorpus("grass/water table counts per file", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    const byFile = new Map<string, number>();
    for (const g of data.grass) byFile.set(g.file, (byFile.get(g.file) ?? 0) + 1);
    for (const w of data.water) byFile.set(w.file, (byFile.get(w.file) ?? 0) + 1);
    // Measured counts (§Extra findings + this task's own reads):
    // johto_grass.asm 61, kanto_grass.asm 33, johto_water.asm 38 defs,
    // kanto_water.asm 24 defs, swarm_grass.asm 2 (bare map_id), swarm_water.asm 0.
    expect(Object.fromEntries(byFile)).toEqual({
      "data/wild/johto_grass.asm": 61,
      "data/wild/kanto_grass.asm": 33,
      "data/wild/johto_water.asm": 38,
      "data/wild/kanto_water.asm": 24,
      "data/wild/swarm_grass.asm": 2,
    });
  });

  itWithGbcCorpus("probabilities: grass 25,25,20,10,10,5,5; water 45,30,25", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    expect(data.probabilities.grass).toEqual([25, 25, 20, 10, 10, 5, 5]);
    expect(data.probabilities.water).toEqual([45, 30, 25]);
  });

  itWithGbcCorpus("SproutTower2F: morn slot 0 = level 3 RATTATA, nite slot 0 = level 3 GASTLY", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    const e = data.grass.find((g) => g.mapConst === "SPROUT_TOWER_2F" && !g.swarm)!;
    expect(e.slots.morn[0]).toEqual({ level: 3, species: "RATTATA" });
    expect(e.slots.nite[0]).toEqual({ level: 3, species: "GASTLY" });
  });

  itWithGbcCorpus(
    "13 fish groups + NONE handled by wildForMap (called on every FISHGROUP_NONE map -- M8); 22 TimeFishGroups rows, row 0 = CORSOLA 20 / STARYU 20",
    () => {
      const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
      const data = loadGbcWildData(GBC_SUBJECT_ROOT);
      expect(data.fishGroups).toHaveLength(13);
      expect(data.timeFishGroups).toHaveLength(22);
      expect(data.timeFishGroups[0]).toEqual({ index: 0, day: { species: "CORSOLA", level: 20 }, nite: { species: "STARYU", level: 20 } });

      const noneMaps = maps.filter((m) => m.fishGroup === "FISHGROUP_NONE");
      expect(noneMaps.length).toBeGreaterThan(0); // vacuous-pass guard for the loop below
      for (const m of noneMaps) {
        const w = wildForMap(data, m);
        expect(w.fishing.group).toBeNull();
        expect(w.fishing.swarmVariant).toBeNull();
      }
    },
  );

  itWithGbcCorpus(
    "the FISHGROUP_QWILFISH map's swarmVariant is FISHGROUP_QWILFISH_SWARM (measured: Route32); a FISHGROUP_SHORE map's swarmVariant is null (Issue 4 M2)",
    () => {
      const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
      const data = loadGbcWildData(GBC_SUBJECT_ROOT);
      const qwilfishMap = maps.find((m) => m.fishGroup === "FISHGROUP_QWILFISH")!;
      expect(qwilfishMap).toBeDefined();
      expect(qwilfishMap.name).toBe("Route32"); // measured, not guessed
      const w = wildForMap(data, qwilfishMap);
      expect(w.fishing.group?.constName).toBe("FISHGROUP_QWILFISH");
      expect(w.fishing.swarmVariant?.constName).toBe("FISHGROUP_QWILFISH_SWARM");

      const shoreMap = maps.find((m) => m.fishGroup === "FISHGROUP_SHORE")!;
      expect(shoreMap).toBeDefined();
      const w2 = wildForMap(data, shoreMap);
      expect(w2.fishing.group?.constName).toBe("FISHGROUP_SHORE");
      expect(w2.fishing.swarmVariant).toBeNull();
    },
  );

  itWithGbcCorpus(
    "wildForMap(Route35): swarm grass is swarm_grass.asm's Yanma entry (swarm=true), base is the johto_grass entry (swarm=false), and their slots measurably differ (Issue 4 M1/M12)",
    () => {
      const { map } = loadGbcMaps(GBC_SUBJECT_ROOT);
      const data = loadGbcWildData(GBC_SUBJECT_ROOT);
      const w = wildForMap(data, map("Route35"));

      expect(w.grass.swarm).not.toBeNull();
      expect(w.grass.swarm!.swarm).toBe(true);
      expect(w.grass.swarm!.file).toBe("data/wild/swarm_grass.asm");

      expect(w.grass.base).not.toBeNull();
      expect(w.grass.base!.swarm).toBe(false);
      expect(w.grass.base!.file).toBe("data/wild/johto_grass.asm");

      // Measured species difference: NIDORAN_M is in the swarm's morn slots
      // but not the base entry's -- a concrete fact, not a guess.
      const swarmMorn = new Set(w.grass.swarm!.slots.morn.map((s) => s.species));
      const baseMorn = new Set(w.grass.base!.slots.morn.map((s) => s.species));
      expect(swarmMorn.has("NIDORAN_M")).toBe(true);
      expect(baseMorn.has("NIDORAN_M")).toBe(false);
    },
  );

  itWithGbcCorpus("DIGLETTS_CAVE rates: morn 10 / day 5 / nite 20, from raw '4 percent'/'2 percent'/'8 percent' (the only unequal-rate entry)", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    const e = data.grass.find((g) => g.mapConst === "DIGLETTS_CAVE" && !g.swarm)!;
    expect(e).toBeDefined();
    expect(e.rates.morn).toEqual({ raw: "4 percent", resolved: 10 });
    expect(e.rates.day).toEqual({ raw: "2 percent", resolved: 5 });
    expect(e.rates.nite).toEqual({ raw: "8 percent", resolved: 20 });
  });

  itWithGbcCorpus("every grass/water entry's swarm flag equals file.startsWith('data/wild/swarm_') (M9's corpus equivalent, 0 swarm_water entries -- guarded further by the unit test)", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    for (const g of data.grass) expect(g.swarm).toBe(g.file.startsWith("data/wild/swarm_"));
    for (const w of data.water) expect(w.swarm).toBe(w.file.startsWith("data/wild/swarm_"));
  });

  itWithGbcCorpus(
    "no map const appears in more than one non-swarm grass entry, or more than one non-swarm water entry -- guards wildForMap's concatenated Johto+Kanto search (review probe ⚠)",
    () => {
      const data = loadGbcWildData(GBC_SUBJECT_ROOT);
      const countBy = <T extends { mapConst: string; swarm: boolean }>(entries: T[]): Map<string, number> => {
        const counts = new Map<string, number>();
        for (const e of entries) if (!e.swarm) counts.set(e.mapConst, (counts.get(e.mapConst) ?? 0) + 1);
        return counts;
      };
      const grassCounts = countBy(data.grass);
      const waterCounts = countBy(data.water);
      expect(grassCounts.size).toBeGreaterThan(0);
      expect(waterCounts.size).toBeGreaterThan(0);
      expect([...grassCounts.values()].every((n) => n === 1)).toBe(true);
      expect([...waterCounts.values()].every((n) => n === 1)).toBe(true);
    },
  );

  itWithGbcCorpus(".Shore_Good: 35%/MAGIKARP 20, 70%/KRABBY 20, 90%+1/KRABBY 20, 100%/time_group 0", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    const shore = data.fishGroups.find((g) => g.constName === "FISHGROUP_SHORE")!;
    expect(shore.goodRod).toEqual([
      { chance: { raw: "35 percent", resolved: 89 }, kind: "species", species: "MAGIKARP", level: 20 },
      { chance: { raw: "70 percent", resolved: 178 }, kind: "species", species: "KRABBY", level: 20 },
      { chance: { raw: "90 percent + 1", resolved: 230 }, kind: "species", species: "KRABBY", level: 20 },
      { chance: { raw: "100 percent", resolved: 255 }, kind: "timeGroup", timeGroupIndex: 0 },
    ]);
  });

  itWithGbcCorpus("every rod table's last record is a 100 percent chance", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    for (const g of data.fishGroups) {
      for (const rod of [g.oldRod, g.goodRod, g.superRod]) {
        expect(rod[rod.length - 1]!.chance).toEqual({ raw: "100 percent", resolved: 255 });
      }
    }
  });

  itWithGbcCorpus("TreeMonMaps 66, RockMonMaps 4 (Cianwood City, Route 40, Dark Cave Violet Entrance, Slowpoke Well B1F)", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    expect(data.treemonMaps).toHaveLength(66);
    expect(data.rockMonMaps).toHaveLength(4);
    expect(data.rockMonMaps.map((r) => r.mapConst)).toEqual([
      "CIANWOOD_CITY",
      "ROUTE_40",
      "DARK_CAVE_VIOLET_ENTRANCE",
      "SLOWPOKE_WELL_B1F",
    ]);
  });

  itWithGbcCorpus("11 treemon sets; 13 maps map to TREEMON_SET_CITY", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    expect(data.treemonSets).toHaveLength(11);
    const cityMaps = data.treemonMaps.filter((m) => m.setConst === "TREEMON_SET_CITY");
    expect(cityMaps).toHaveLength(13);
  });

  itWithGbcCorpus("rock set = 90 KRABBY 15 / 10 SHUCKLE 15, rare: null", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    const rock = data.treemonSets.find((s) => s.constName === "TREEMON_SET_ROCK")!;
    expect(rock.common).toEqual([
      { percent: 90, species: "KRABBY", level: 15 },
      { percent: 10, species: "SHUCKLE", level: 15 },
    ]);
    expect(rock.rare).toBeNull();
  });

  itWithGbcCorpus("TREEMON_SET_KTOWN/KROUTE resolve correctly despite file order (KCity, KRoute, KTown) differing from table order (KCITY, KTOWN, KROUTE)", () => {
    // The real regression case for "resolve by pointer-table position, never
    // file label order" (GBC format findings §Extra): the file defines
    // TreeMonSet_KCity, then TreeMonSet_KRoute, then TreeMonSet_KTown, but
    // the TreeMons pointer table lists KCITY, KTOWN, KROUTE in that order.
    // A file-order resolution would swap KTOWN's and KROUTE's data.
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    const ktown = data.treemonSets.find((s) => s.constName === "TREEMON_SET_KTOWN")!;
    const kroute = data.treemonSets.find((s) => s.constName === "TREEMON_SET_KROUTE")!;
    expect(ktown.common[0]).toEqual({ percent: 50, species: "SPEAROW", level: 10 }); // KTown file data starts with SPEAROW
    expect(kroute.common[0]).toEqual({ percent: 50, species: "HOOTHOOT", level: 10 }); // KRoute file data starts with HOOTHOOT
    expect(ktown.rare![0]).toEqual({ percent: 40, species: "FEAROW", level: 15 });
    expect(kroute.rare![0]).toEqual({ percent: 50, species: "HOOTHOOT", level: 10 });
  });

  itWithGbcCorpus("City/Canyon resolve to identical table data via the pointer table, despite differing file-vs-table label order", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    const city = data.treemonSets.find((s) => s.constName === "TREEMON_SET_CITY")!;
    const canyon = data.treemonSets.find((s) => s.constName === "TREEMON_SET_CANYON")!;
    expect(city.common).toEqual(canyon.common);
    expect(city.rare).toEqual(canyon.rare);
    expect(city.yieldsNothing).toBe(true);
    expect(canyon.yieldsNothing).toBe(false);
  });

  itWithGbcCorpus("every map const referenced by any wild table is a real map", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    const constNames = new Set(maps.map((m) => m.constName));
    const unknown: string[] = [];
    for (const g of data.grass) if (!constNames.has(g.mapConst)) unknown.push(`grass:${g.mapConst}`);
    for (const w of data.water) if (!constNames.has(w.mapConst)) unknown.push(`water:${w.mapConst}`);
    for (const t of data.treemonMaps) if (!constNames.has(t.mapConst)) unknown.push(`treemon:${t.mapConst}`);
    for (const r of data.rockMonMaps) if (!constNames.has(r.mapConst)) unknown.push(`rock:${r.mapConst}`);
    expect(unknown).toEqual([]);
  });

  itWithGbcCorpus("every map's fishGroup resolves (a real FISHGROUP_* constant, or FISHGROUP_NONE)", () => {
    const { maps } = loadGbcMaps(GBC_SUBJECT_ROOT);
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    const groupNames = new Set(data.fishGroups.map((g) => g.constName));
    const bad: string[] = [];
    for (const m of maps) {
      if (m.fishGroup !== "FISHGROUP_NONE" && !groupNames.has(m.fishGroup)) bad.push(`${m.name}: ${m.fishGroup}`);
    }
    expect(bad).toEqual([]);
  });

  itWithGbcCorpus("wildForMap(NewBarkTown): water (dock), no grass, FISHGROUP_OCEAN, headbutt TREEMON_SET_CITY (yieldsNothing)", () => {
    // Measured, contra an initial assumption: NewBarkTown has a dock, so it
    // DOES have a water wildmons entry (TENTACOOL/TENTACRUEL) despite being
    // a town, not a route -- this is a real fact pinned here, not a guess.
    const { map } = loadGbcMaps(GBC_SUBJECT_ROOT);
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    const w = wildForMap(data, map("NewBarkTown"));
    expect(w.grass.base).toBeNull();
    expect(w.grass.swarm).toBeNull();
    expect(w.water.base?.mapConst).toBe("NEW_BARK_TOWN");
    expect(w.water.swarm).toBeNull();
    expect(w.fishing.group?.constName).toBe("FISHGROUP_OCEAN");
    expect(w.fishing.swarmVariant).toBeNull();
    expect(w.headbutt.set?.constName).toBe("TREEMON_SET_CITY");
    expect(w.headbutt.yieldsNothing).toBe(true);
    expect(w.rock).toBeNull();
  });

  itWithGbcCorpus("wildForMap(Route29): has grass and headbutt (non-City)", () => {
    const { map } = loadGbcMaps(GBC_SUBJECT_ROOT);
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    const w = wildForMap(data, map("Route29"));
    expect(w.grass.base).not.toBeNull();
    expect(w.headbutt.set?.constName).toBe("TREEMON_SET_ROUTE");
    expect(w.headbutt.yieldsNothing).toBe(false);
  });

  itWithGbcCorpus("vacuous-pass guard: every whole-corpus loop above actually iterated something", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    expect(data.grass.length).toBeGreaterThan(0);
    expect(data.water.length).toBeGreaterThan(0);
    expect(data.fishGroups.length).toBeGreaterThan(0);
    expect(data.treemonSets.length).toBeGreaterThan(0);
    expect(data.treemonMaps.length).toBeGreaterThan(0);
    expect(data.rockMonMaps.length).toBeGreaterThan(0);
  });
});
