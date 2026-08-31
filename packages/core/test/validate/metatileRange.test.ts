import { describe, it, expect } from "vitest";
import { validateMetatileRange, validatePaletteRange } from "../../src/validate/metatileRange.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

describe("validateMetatileRange", () => {
  itWithCorpus("agrees with the subject repo's Python checker: only Saffron_Temp is out of range", () => {
    const findings = validateMetatileRange(proj);
    // The Python tool names layouts, and layout names carry the _Layout suffix.
    expect(findings.map((f) => f.layout).sort()).toEqual(["Saffron_Temp_Layout"]);
    expect(findings[0]!.split.version).toBe("hns");
    expect(findings[0]!.source).toBe("map");
  }, 900_000);

  itWithCorpus("reports the layout's own split version on every finding", () => {
    for (const f of validateMetatileRange(proj)) {
      expect(["emerald", "frlg", "hns"]).toContain(f.split.version);
    }
  }, 900_000);

  itWithCorpus("checking every layout against one global constant is the bug, not the test", () => {
    // Forcing the 640 boundary onto emerald layouts must produce many findings.
    // Measured: 558, of which 333 are map-source. The threshold is 100 so the
    // test states a floor rather than a brittle exact count, but the gap
    // between 1 and 558 is the actual signal.
    const forced = { ...proj, splitFor: () => ({ version: "hns" as const, tiles: 640, metatiles: 640, pals: 7 }) };
    expect(validateMetatileRange(forced as typeof proj).length).toBeGreaterThan(100);
  }, 900_000);

  itWithCorpus("reports tile entries naming a palette the tileset has no .pal for", () => {
    const findings = validatePaletteRange(proj);

    // Every finding must name only indices the tileset genuinely lacks --
    // asserting a count alone would pass against a function that flagged
    // everything.
    for (const f of findings) {
      const ts = proj.tileset(f.tileset);
      expect(f.indices.length).toBeGreaterThan(0);
      for (const i of f.indices) expect(ts.palettes[i]).toBeUndefined();
      expect(f.entries).toBeGreaterThanOrEqual(f.indices.length);
    }

    // And the negative: gTileset_Petalburg names palette 14 on 8 tile entries
    // and INCBINs all 16 palettes, so it must NOT appear. A checker that
    // flagged "index >= NUM_PALS_TOTAL" rather than "index the tileset lacks"
    // would wrongly include it.
    expect(findings.map((f) => f.tileset)).not.toContain("gTileset_Petalburg");

    // gTileset_Cave_Green is the worst offender in the tree.
    expect(findings.map((f) => f.tileset)).toContain("gTileset_Cave_Green");
    expect(findings.length).toBeGreaterThan(0);
  }, 900_000);
});
