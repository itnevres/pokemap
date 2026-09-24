import { describe, it, expect } from "vitest";
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
    "\tdb 2 percent, 2 percent, 2 percent ; encounter rates: morn/day/nite",
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
    expect(e.rates.morn).toEqual({ raw: "2 percent", resolved: 5 });
    expect(e.rates.day).toEqual({ raw: "2 percent", resolved: 5 });
    expect(e.rates.nite).toEqual({ raw: "2 percent", resolved: 5 });
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
    const { entries, defects } = parseGrassFile(text, "data/wild/swarm_grass.asm", true);
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
    const bad = oneEntry.replace("\tdb 2 percent, 2 percent, 2 percent ; encounter rates: morn/day/nite", "\tdb 2 percent, 2 percent ; oops");
    expect(() => parseGrassFile(bad, "x.asm")).toThrow(/3/);
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
    const { entries, defects } = parseWaterFile(empty, "data/wild/swarm_water.asm", true);
    expect(entries).toEqual([]);
    expect(defects).toEqual([]);
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

  itWithGbcCorpus("13 fish groups + NONE handled by wildForMap; 22 TimeFishGroups rows, row 0 = CORSOLA 20 / STARYU 20", () => {
    const data = loadGbcWildData(GBC_SUBJECT_ROOT);
    expect(data.fishGroups).toHaveLength(13);
    expect(data.timeFishGroups).toHaveLength(22);
    expect(data.timeFishGroups[0]).toEqual({ index: 0, day: { species: "CORSOLA", level: 20 }, nite: { species: "STARYU", level: 20 } });
  });

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
