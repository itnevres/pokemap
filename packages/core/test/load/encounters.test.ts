import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseEncounters, speciesChances, FISHING_RODS } from "../../src/load/encounters.js";
import { projectPaths } from "../../src/config/paths.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const P = projectPaths(SUBJECT_ROOT);
const enc = parseEncounters(readFileSync(P.wildEncountersJson, "utf8"));

describe("parseEncounters", () => {
  itWithCorpus("reads all three groups with their slot weights", () => {
    expect(enc.groups.get("gWildMonHeaders")!.entries.length).toBe(497);
    const fields = enc.groups.get("gWildMonHeaders")!.fields;
    expect(fields.get("land_mons")!.length).toBe(12);
    expect(fields.get("water_mons")!.length).toBe(5);
    expect(fields.get("rock_smash_mons")!.length).toBe(5);
    expect(fields.get("fishing_mons")!.length).toBe(10);

    // The title promises "all three groups", but every assertion above only
    // ever touches gWildMonHeaders -- by far the biggest of the three, so a
    // parser that silently dropped gBattlePyramidWildMonHeaders and
    // gBattlePikeWildMonHeaders (7 and 4 entries; neither carries "fields",
    // since facility rentals aren't weighted the way route encounters are)
    // would pass everything above it. Prove the title's claim directly.
    expect(enc.groups.size).toBe(3);
    expect(enc.groups.get("gBattlePyramidWildMonHeaders")!.entries.length).toBe(7);
    expect(enc.groups.get("gBattlePikeWildMonHeaders")!.entries.length).toBe(4);
  });

  itWithCorpus("land, water and rock smash sum to 100 -- fishing sums to 300", () => {
    const fields = enc.groups.get("gWildMonHeaders")!.fields;
    for (const m of ["land_mons", "water_mons", "rock_smash_mons"] as const) {
      expect(fields.get(m)!.reduce((a, b) => a + b, 0)).toBe(100);
    }
    // Fishing is THREE independent distributions -- one per rod -- packed into
    // one array: [70,30 | 60,20,20 | 40,40,15,4,1]. Summing the whole thing and
    // calling it a probability yields 300%.
    expect(fields.get("fishing_mons")!.reduce((a, b) => a + b, 0)).toBe(300);
    for (const { from, count } of FISHING_RODS) {
      expect(fields.get("fishing_mons")!.slice(from, from + count).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  itWithCorpus("returns EVERY entry for a map, not just the first", () => {
    // 125 maps here carry more than one table. `.find()` would silently hide
    // three quarters of Route 101's data and present the day table as if it
    // were the only one that existed.
    const entries = enc.forMap("MAP_ROUTE101");
    expect(entries.map((e) => e.baseLabel)).toEqual([
      "gRoute101", "gRoute101_Night", "gRoute101_DayC", "gRoute101_NightC",
    ]);
    expect(entries[0]!.methods.land_mons!.encounterRate).toBe(20);
    expect(entries[0]!.methods.land_mons!.mons.length).toBe(12);
  });

  itWithCorpus("distinct variants really do hold distinct species", () => {
    const entries = enc.forMap("MAP_ROUTE101");
    expect(entries[0]!.methods.land_mons!.mons[0]!.species).toBe("SPECIES_ESPEON");
    expect(entries[1]!.methods.land_mons!.mons[0]!.species).toBe("SPECIES_UMBREON");
  });

  itWithCorpus("counts the maps carrying multiple tables", () => {
    const byMap = new Map<string, number>();
    for (const e of enc.groups.get("gWildMonHeaders")!.entries) {
      byMap.set(e.map, (byMap.get(e.map) ?? 0) + 1);
    }
    expect(byMap.size).toBe(227);
    expect([...byMap.values()].filter((n) => n > 1).length).toBe(125);
    expect(Math.max(...byMap.values())).toBe(9);
  });

  itWithCorpus("returns an empty array for a map with no table", () => {
    expect(enc.forMap("MAP_NO_SUCH_MAP")).toEqual([]);
  });
});

describe("speciesChances", () => {
  itWithCorpus("weights by slot rate, not slot count", () => {
    const chances = speciesChances(enc, "MAP_ROUTE101", "land_mons")!;
    expect(chances.reduce((a, c) => a + c.percent, 0)).toBeCloseTo(100, 5);
  });

  itWithCorpus("reads the requested variant, not always the first", () => {
    const day = speciesChances(enc, "MAP_ROUTE101", "land_mons")!;
    const night = speciesChances(enc, "MAP_ROUTE101", "land_mons", { entry: 1 })!;
    expect(day[0]!.species).toBe("SPECIES_ESPEON");
    expect(night[0]!.species).toBe("SPECIES_UMBREON");
  });

  itWithCorpus("computes fishing percentages PER ROD, so each rod totals 100", () => {
    // Without the rod split a species in Old Rod slot 0 reads as 70% of all
    // fishing encounters rather than 70% of Old Rod ones, and every map's
    // fishing figures sum to 300%.
    //
    // A total of 100 is not, by itself, discriminating here: FISHING_RODS
    // partitions the 10 slots into three segments that EACH independently sum
    // to 100 (proved in the parseEncounters test above), so an implementation
    // that ignored opts.rod entirely and always read the Old Rod segment would
    // still report a total of 100 for every rod requested in this loop. Pin
    // the actual species set per rod -- derived from this map's own raw slot
    // data, not hardcoded -- so a wrong segment is caught even though its
    // total looks perfectly fine.
    const withFishing = enc.groups.get("gWildMonHeaders")!.entries.find((e) => e.methods.fishing_mons)!;
    const mons = withFishing.methods.fishing_mons!.mons;
    for (const { rod, from, count } of FISHING_RODS) {
      const chances = speciesChances(enc, withFishing.map, "fishing_mons", { rod })!;
      expect(chances.reduce((a, c) => a + c.percent, 0)).toBeCloseTo(100, 5);
      const expectedSpecies = new Set(mons.slice(from, from + count).map((m) => m.species));
      expect(new Set(chances.map((c) => c.species))).toEqual(expectedSpecies);
    }
  });

  itWithCorpus("merges duplicate species across slots and reports a level band", () => {
    const chances = speciesChances(enc, "MAP_ROUTE101", "land_mons")!;
    const espeon = chances.find((c) => c.species === "SPECIES_ESPEON")!;
    expect(espeon.percent).toBeCloseTo(100, 5);
    expect(espeon.minLevel).toBe(2);
    expect(espeon.maxLevel).toBe(3);
    expect(espeon.slots.length).toBe(12);

    // Every one of Route101's Espeon slots has min_level === max_level (all
    // are flatly level 2 or level 3), so a parser that swapped the min_level
    // and max_level fields would reproduce every number checked above
    // exactly -- that swap is invisible on this fixture. Route102's water
    // table breaks the symmetry: Marill spans three slots with three
    // different, non-equal [min,max] pairs (20-30, 10-20, 30-35), so a field
    // swap changes the merged min and max here.
    const marill = speciesChances(enc, "MAP_ROUTE102", "water_mons")!.find((c) => c.species === "SPECIES_MARILL")!;
    expect(marill.percent).toBeCloseTo(95, 5);
    expect(marill.minLevel).toBe(10);
    expect(marill.maxLevel).toBe(35);
    expect(marill.slots).toEqual([0, 1, 2]);
  });

  itWithCorpus("returns undefined for a map with no table", () => {
    expect(speciesChances(enc, "MAP_NO_SUCH_MAP", "land_mons")).toBeUndefined();
  });
});
