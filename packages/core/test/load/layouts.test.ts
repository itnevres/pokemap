import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseLayouts, resolveSplit } from "../../src/load/layouts.js";
import { parseFieldmapConstants } from "../../src/config/fieldmap.js";
import { projectPaths } from "../../src/config/paths.js";
import { SUBJECT_ROOT, itWithCorpus, referenceRoot } from "../helpers/corpus.js";

const CONSTANTS = parseFieldmapConstants(`
#define NUM_TILES_IN_PRIMARY 640
#define NUM_TILES_IN_PRIMARY_EMERALD 512
#define NUM_METATILES_IN_PRIMARY 640
#define NUM_METATILES_IN_PRIMARY_EMERALD 512
#define NUM_METATILES_TOTAL 1024
#define NUM_PALS_IN_PRIMARY 7
#define NUM_PALS_IN_PRIMARY_EMERALD 6
`);

describe("resolveSplit", () => {
  it("gives emerald layouts the 512 boundary", () => {
    const s = resolveSplit({ layoutVersion: "emerald" } as never, CONSTANTS);
    expect(s).toEqual({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 });
  });

  it("gives frlg and hns layouts the 640 boundary", () => {
    for (const v of ["frlg", "hns"] as const) {
      const s = resolveSplit({ layoutVersion: v } as never, CONSTANTS);
      expect(s.metatiles).toBe(640);
      expect(s.pals).toBe(7);
    }
  });

  it("treats a missing layout_version as emerald, matching GetNumMetatilesInPrimary's default branch", () => {
    expect(resolveSplit({ layoutVersion: undefined } as never, CONSTANTS).metatiles).toBe(512);
  });
});

describe("parseLayouts", () => {
  itWithCorpus("parses the subject repo's layouts.json with the documented version counts", () => {
    const p = projectPaths(SUBJECT_ROOT);
    const { layouts } = parseLayouts(readFileSync(p.layoutsJson, "utf8"));
    const byVersion: Record<string, number> = {};
    for (const l of layouts) byVersion[l.layoutVersion ?? "(none)"] = (byVersion[l.layoutVersion ?? "(none)"] ?? 0) + 1;
    expect(byVersion.emerald).toBe(389);
    expect(byVersion.frlg).toBe(349);
    expect(byVersion.hns).toBe(282);
  });

  itWithCorpus("defaults border size to 2x2 and preserves the seven 3x2 layouts", () => {
    const p = projectPaths(SUBJECT_ROOT);
    const { layouts } = parseLayouts(readFileSync(p.layoutsJson, "utf8"));
    const wide = layouts.filter((l) => l.borderWidth === 3 && l.borderHeight === 2).map((l) => l.name).sort();
    expect(wide).toHaveLength(7);
    expect(layouts.every((l) => l.borderWidth >= 2 && l.borderHeight >= 2)).toBe(true);
  });

  const emerald = referenceRoot("pokeemerald");
  it.skipIf(!emerald)("parses pokeemerald's layouts.json, which has no border or version keys", () => {
    const { layouts } = parseLayouts(readFileSync(projectPaths(emerald!).layoutsJson, "utf8"));
    expect(layouts.length).toBeGreaterThan(0);
    // Stock pokeemerald has neither key. borderWidth must DEFAULT to 2 rather
    // than being read, and layoutVersion must stay undefined -- writing it back
    // would be the Porymap 6 failure (inventing keys into 726 layouts).
    expect(layouts[0]!.borderWidth).toBe(2);
    expect(layouts[0]!.layoutVersion).toBeUndefined();
  });
});
