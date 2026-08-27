import { describe, it, expect } from "vitest";
import { projectPaths } from "../../src/config/paths.js";

describe("projectPaths", () => {
  it("resolves known decomp paths from a root", () => {
    const p = projectPaths("C:/proj");
    expect(p.layoutsJson).toBe("C:/proj/data/layouts/layouts.json");
    expect(p.mapGroupsJson).toBe("C:/proj/data/maps/map_groups.json");
    expect(p.fieldmapH).toBe("C:/proj/include/fieldmap.h");
    expect(p.porymapCfg).toBe("C:/proj/porymap.project.cfg");
    expect(p.wildEncountersJson).toBe("C:/proj/src/data/wild_encounters.json");
    expect(p.regionMapDir).toBe("C:/proj/src/data/region_map");
    expect(p.regionMapSections).toBe("C:/proj/src/data/region_map/region_map_sections.json");
    expect(p.mapDir("NewBarkTown")).toBe("C:/proj/data/maps/NewBarkTown");
    expect(p.layoutDir("NewBarkTown")).toBe("C:/proj/data/layouts/NewBarkTown");
  });

  it("normalises backslashes so Windows roots produce forward-slash paths", () => {
    const p = projectPaths("C:\\proj");
    expect(p.layoutsJson).toBe("C:/proj/data/layouts/layouts.json");
  });
});
