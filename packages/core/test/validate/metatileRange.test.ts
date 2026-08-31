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

  itWithCorpus("a finding reports the split actually used, not the layout's stored version", () => {
    // PetalburgCity_Layout is emerald in the tree. Force hns onto everything and
    // it must appear with version "hns" -- a finding that echoed the layout's own
    // layout_version instead of the split it was checked against would say
    // "emerald" here. Test 1 cannot catch that, because in the real run the two
    // always agree.
    const forced = { ...proj, splitFor: () => ({ version: "hns" as const, tiles: 640, metatiles: 640, pals: 7 }) };
    const petalburg = validateMetatileRange(forced as typeof proj).find((f) => f.layout === "PetalburgCity_Layout");
    expect(petalburg).toBeDefined();
    expect(petalburg!.split.version).toBe("hns");
    expect(proj.layoutByName("PetalburgCity_Layout")!.layoutVersion).toBe("emerald");
  }, 900_000);

  itWithCorpus("checking every layout against one global constant is the bug, not the test", () => {
    // Both directions. Forcing 640 alone cannot catch an implementation
    // hardcoded to 640 -- the override becomes a no-op and the assertion passes
    // for the wrong reason. Forcing 512 catches that one; forcing 640 catches a
    // hardcode to 512. Measured: 558 and 546 findings respectively, against 1
    // when each layout is asked for its own split.
    const force = (metatiles: number, version: "emerald" | "hns", pals: number) =>
      validateMetatileRange({ ...proj, splitFor: () => ({ version, tiles: metatiles, metatiles, pals }) } as typeof proj).length;

    expect(force(640, "hns", 7)).toBeGreaterThan(100);
    expect(force(512, "emerald", 6)).toBeGreaterThan(100);
    expect(validateMetatileRange(proj).length).toBe(1);
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
