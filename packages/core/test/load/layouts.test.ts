import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseLayouts, resolveSplit } from "../../src/load/layouts.js";
import { parseFieldmapConstants } from "../../src/config/fieldmap.js";
import { projectPaths } from "../../src/config/paths.js";
import { SUBJECT_ROOT, itWithCorpus, referenceRoot } from "../helpers/corpus.js";

// Tiles and metatiles are deliberately given DIFFERENT values here, unlike the
// real headers where both are 512/640. With them equal, a tiles<->metatiles
// crossover inside a branch is invisible: both fields would still read back the
// number the test expects. The +1 makes a swap fail loudly.
const CONSTANTS = parseFieldmapConstants(`
#define NUM_TILES_IN_PRIMARY 641
#define NUM_TILES_IN_PRIMARY_EMERALD 513
#define NUM_METATILES_IN_PRIMARY 640
#define NUM_METATILES_IN_PRIMARY_EMERALD 512
#define NUM_METATILES_TOTAL 1024
#define NUM_PALS_IN_PRIMARY 7
#define NUM_PALS_IN_PRIMARY_EMERALD 6
`);

describe("resolveSplit", () => {
  it("gives emerald layouts the 512 boundary", () => {
    const s = resolveSplit({ layoutVersion: "emerald" } as never, CONSTANTS);
    expect(s).toEqual({ version: "emerald", tiles: 513, metatiles: 512, pals: 6 });
  });

  it("gives frlg and hns layouts the 640 boundary", () => {
    for (const v of ["frlg", "hns"] as const) {
      const s = resolveSplit({ layoutVersion: v } as never, CONSTANTS);
      expect(s.tiles).toBe(641);
      expect(s.metatiles).toBe(640);
      expect(s.pals).toBe(7);
    }
  });

  it("treats a missing layout_version as emerald, matching GetNumMetatilesInPrimary's default branch", () => {
    expect(resolveSplit({ layoutVersion: undefined } as never, CONSTANTS).metatiles).toBe(512);
  });

  it("refuses an unrecognised layout_version rather than inventing a boundary", () => {
    expect(() => resolveSplit({ layoutVersion: "radical_red" } as never, CONSTANTS))
      .toThrow(/unknown layout_version/);
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

  itWithCorpus("reads the seven 3x2 borders; every layout here has explicit border keys", () => {
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

  const frlg = referenceRoot("pokefirered");
  it.skipIf(!frlg)("preserves an explicit border of 0 rather than defaulting it to 2", () => {
    // 28 of pokefirered's 383 layouts are indoor rooms with border_width 0.
    // The undefined-check must stay `=== undefined`, not falsy: `!l.border_width`
    // would give every one of those a 2x2 border it does not have.
    const { layouts } = parseLayouts(readFileSync(projectPaths(frlg!).layoutsJson, "utf8"));
    const zero = layouts.filter((l) => l.borderWidth === 0);
    expect(zero.length).toBe(28);
    expect(zero.every((l) => l.borderHeight === 0)).toBe(true);
  });
});

describe("parseLayouts: paths that leave the project (D25)", () => {
  const layoutsJson = (l: Record<string, unknown>) => JSON.stringify({
    layouts_table_label: "gMapLayouts",
    layouts: [{ id: "LAYOUT_A", name: "A_Layout", width: 2, height: 2, primary_tileset: "gTileset_General", secondary_tileset: "gTileset_Petalburg",
      border_filepath: "data/layouts/A/border.bin", blockdata_filepath: "data/layouts/A/map.bin", ...l },
    { id: "LAYOUT_B", name: "B_Layout", width: 2, height: 2, primary_tileset: "gTileset_General", secondary_tileset: "gTileset_Petalburg",
      border_filepath: "data/layouts/B/border.bin", blockdata_filepath: "data/layouts/B/map.bin" }],
  });

  it("leaves a layout with inside paths unmarked", () => {
    const { layouts } = parseLayouts(layoutsJson({}));
    expect(layouts[0]!.brokenPaths).toBeUndefined();
    expect(layouts[0]!.blockdataFilepath).toBe("data/layouts/A/map.bin");
  });

  for (const bad of ["../../outside.bin", "/abs/outside.bin", "C:/outside.bin", "C:\\outside.bin", "..\\..\\outside.bin", "data/../../outside.bin"]) {
    it(`marks blockdata_filepath ${JSON.stringify(bad)} broken without throwing`, () => {
      const { layouts } = parseLayouts(layoutsJson({ blockdata_filepath: bad }));
      const broken = layouts[0]!.brokenPaths!;
      expect(broken).toHaveLength(1);
      expect(broken[0]!.key).toBe("blockdata_filepath");
      expect(broken[0]!.path).toBe(bad);
      expect(broken[0]!.file).toBe("data/layouts/layouts.json");
      expect(broken[0]!.message).toContain("LAYOUT_A");
      expect(broken[0]!.message).toContain(bad);
      expect(broken[0]!.fix).toContain("blockdata_filepath");
      // nothing else is blocked: the next layout parses clean
      expect(layouts[1]!.brokenPaths).toBeUndefined();
      expect(layouts[1]!.id).toBe("LAYOUT_B");
    });
  }

  it("marks border_filepath, and both keys when both leave", () => {
    const one = parseLayouts(layoutsJson({ border_filepath: "../b.bin" })).layouts[0]!;
    expect(one.brokenPaths!.map((b) => b.key)).toEqual(["border_filepath"]);
    const both = parseLayouts(layoutsJson({ border_filepath: "../b.bin", blockdata_filepath: "/m.bin" })).layouts[0]!;
    expect(both.brokenPaths!.map((b) => b.key)).toEqual(["border_filepath", "blockdata_filepath"]);
  });
});
