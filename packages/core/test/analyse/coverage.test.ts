import { describe, it, expect } from "vitest";
import { whereSpecies, coverage } from "../../src/analyse/coverage.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

describe("whereSpecies", () => {
  itWithCorpus("finds every map containing a species, with rate and level band", () => {
    const hits = whereSpecies(proj, "SPECIES_ESPEON");
    expect(hits.length).toBeGreaterThan(0);
    const route101 = hits.find((h) => h.mapId === "MAP_ROUTE101")!;
    expect(route101.method).toBe("land_mons");
    expect(route101.variant).toBe("gRoute101");
    expect(route101.percent).toBeCloseTo(100, 5);
    expect(route101.minLevel).toBe(2);
  });

  itWithCorpus("finds a species that exists only in a NIGHT variant", () => {
    const hits = whereSpecies(proj, "SPECIES_UMBREON");
    const route101 = hits.find((h) => h.mapId === "MAP_ROUTE101");
    expect(route101).toBeDefined();
    expect(route101!.variant).toBe("gRoute101_Night");
  });

  itWithCorpus("returns nothing for a species that appears nowhere", () => {
    expect(whereSpecies(proj, "SPECIES_NOT_A_REAL_MON")).toEqual([]);
  });
});

describe("coverage", () => {
  itWithCorpus("counts DISTINCT maps, not tables", () => {
    const c = coverage(proj);
    expect(c.encounterTables).toBe(497);
    expect(c.mapsWithEncounters).toBe(227);
    expect(c.mapsWithoutEncounters.length).toBe(982);
    expect(c.mapsWithEncounters + c.mapsWithoutEncounters.length).toBe(proj.mapNames().length);
  });

  itWithCorpus("reports an average level per map for the level-curve lens", () => {
    const c = coverage(proj);
    // The plan's original text asserted `toBeGreaterThan(400)` here. That is
    // impossible on its own terms: levelByMap has one entry per DISTINCT map
    // carrying a table (see the doc comment on Coverage.levelByMap and the
    // sibling test's own title, "counts DISTINCT maps, not tables"), and the
    // sibling test above already pins mapsWithEncounters at 227 -- so
    // levelByMap, and any filtered subset of it, can never exceed 227
    // entries. Verified directly against the real corpus: levelByMap.length
    // is 227, and every one of those 227 produces averageLevel > 0 (minimum
    // observed 2.53), so withLevels.length is also exactly 227. Pinning it
    // to c.mapsWithEncounters instead of a second hardcoded "227" keeps this
    // a cross-referential, still-exact assertion without duplicating the
    // number the sibling test already owns.
    const withLevels = c.levelByMap.filter((m) => m.averageLevel > 0);
    expect(withLevels.length).toBe(c.mapsWithEncounters);
    for (const m of withLevels) expect(m.averageLevel).toBeGreaterThan(1);
  });

  itWithCorpus("lists species that appear in zero encounter tables", () => {
    const c = coverage(proj);
    expect(Array.isArray(c.unusedSpecies)).toBe(true);

    // Array.isArray alone passes for an implementation that always returns
    // [] (e.g. one that forgets to filter, or filters against the wrong
    // set) -- it never proves the list holds the right species. Strengthen
    // it with real, verified cases drawn from data this same file already
    // established: SPECIES_ESPEON and SPECIES_UMBREON both occupy every
    // land_mons slot of a MAP_ROUTE101 table above (100% each, in their
    // respective day/night variants), so both must be ABSENT from
    // unusedSpecies; SPECIES_ABOMASNOW has a graphics/pokemon directory
    // (so allSpecies() includes it) but appears in zero encounter tables
    // anywhere in the subject tree (confirmed directly against the real
    // decomp), so it must be PRESENT. This also exercises the two
    // directions of the filter instead of only the empty/non-empty shape.
    expect(c.unusedSpecies).not.toContain("SPECIES_ESPEON");
    expect(c.unusedSpecies).not.toContain("SPECIES_UMBREON");
    expect(c.unusedSpecies).toContain("SPECIES_ABOMASNOW");
  });
});
