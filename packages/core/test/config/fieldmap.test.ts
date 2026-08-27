import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseFieldmapConstants } from "../../src/config/fieldmap.js";
import { projectPaths } from "../../src/config/paths.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const SRC = `
#define NUM_TILES_IN_PRIMARY 640
#define NUM_TILES_IN_PRIMARY_EMERALD 512

#define NUM_METATILES_IN_PRIMARY 640
#define NUM_METATILES_IN_PRIMARY_EMERALD 512
#define NUM_METATILES_TOTAL 999
#define NUM_PALS_IN_PRIMARY 7
#define NUM_PALS_IN_PRIMARY_EMERALD 6
`;

describe("parseFieldmapConstants", () => {
  it("reads all six split constants plus the total", () => {
    const c = parseFieldmapConstants(SRC);
    expect(c.tilesInPrimary).toBe(640);
    expect(c.tilesInPrimaryEmerald).toBe(512);
    expect(c.metatilesInPrimary).toBe(640);
    expect(c.metatilesInPrimaryEmerald).toBe(512);
    expect(c.palsInPrimary).toBe(7);
    expect(c.palsInPrimaryEmerald).toBe(6);
    expect(c.metatilesTotal).toBe(999);
  });

  it("follows the header when the owner swaps the values", () => {
    // 704 is deliberately neither the fixture's value (640) nor the field's
    // fallback (512). Asserting 512 here would be tautological: a regex that
    // matched nothing would also produce 512, so the test could not tell
    // "read from the header" from "silently fell back".
    const swapped = SRC.replace("NUM_METATILES_IN_PRIMARY 640", "NUM_METATILES_IN_PRIMARY 704");
    expect(parseFieldmapConstants(swapped).metatilesInPrimary).toBe(704);
  });

  it("falls back to Emerald stock values when the _EMERALD names are absent", () => {
    const stock = "#define NUM_TILES_IN_PRIMARY 512\n#define NUM_METATILES_IN_PRIMARY 512\n#define NUM_METATILES_TOTAL 1024\n#define NUM_PALS_IN_PRIMARY 6\n";
    const c = parseFieldmapConstants(stock);
    expect(c.metatilesInPrimary).toBe(512);
    expect(c.metatilesInPrimaryEmerald).toBe(512);
    expect(c.palsInPrimaryEmerald).toBe(6);
  });

  itWithCorpus("parses the subject repo's real fieldmap.h", () => {
    const p = projectPaths(SUBJECT_ROOT);
    const c = parseFieldmapConstants(readFileSync(p.fieldmapH, "utf8"));
    expect(c.metatilesInPrimary).toBe(640);
    expect(c.metatilesInPrimaryEmerald).toBe(512);
    expect(c.palsInPrimary).toBe(7);
    expect(c.palsInPrimaryEmerald).toBe(6);
  });
});
