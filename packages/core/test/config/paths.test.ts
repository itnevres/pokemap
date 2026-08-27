import { describe, it, expect } from "vitest";
import { projectPaths } from "../../src/config/paths.js";

describe("projectPaths", () => {
  it("resolves known decomp paths from a root", () => {
    const p = projectPaths("C:/proj");
    expect(p.root).toBe("C:/proj");
    expect(p.layoutsJson).toBe("C:/proj/data/layouts/layouts.json");
    expect(p.mapGroupsJson).toBe("C:/proj/data/maps/map_groups.json");
    expect(p.fieldmapH).toBe("C:/proj/include/fieldmap.h");
    expect(p.porymapCfg).toBe("C:/proj/porymap.project.cfg");
    expect(p.wildEncountersJson).toBe("C:/proj/src/data/wild_encounters.json");
    expect(p.regionMapDir).toBe("C:/proj/src/data/region_map");
    expect(p.regionMapSections).toBe("C:/proj/src/data/region_map/region_map_sections.json");
    expect(p.tilesetHeadersH).toBe("C:/proj/src/data/tilesets/headers.h");
    expect(p.tilesetMetatilesH).toBe("C:/proj/src/data/tilesets/metatiles.h");
    expect(p.tilesetGraphicsH).toBe("C:/proj/src/data/tilesets/graphics.h");
    expect(p.eventObjectsH).toBe("C:/proj/include/constants/event_objects.h");
    expect(p.sidecar).toBe("C:/proj/.pokemap/world.json");
    expect(p.mapDir("NewBarkTown")).toBe("C:/proj/data/maps/NewBarkTown");
    expect(p.mapJson("NewBarkTown")).toBe("C:/proj/data/maps/NewBarkTown/map.json");
    expect(p.mapScriptsInc("NewBarkTown")).toBe("C:/proj/data/maps/NewBarkTown/scripts.inc");
    expect(p.layoutDir("NewBarkTown")).toBe("C:/proj/data/layouts/NewBarkTown");
    expect(p.monIconPng("espeon")).toBe("C:/proj/graphics/pokemon/espeon/icon.png");
    expect(p.monOverworldPng("espeon")).toBe("C:/proj/graphics/object_events/pics/pokemon/espeon.png");
  });

  it("normalises backslashes so Windows roots produce forward-slash paths", () => {
    const p = projectPaths("C:\\proj");
    expect(p.layoutsJson).toBe("C:/proj/data/layouts/layouts.json");
  });

  it("normalises a trailing slash the same as no trailing slash", () => {
    const p = projectPaths("C:/proj/");
    expect(p.layoutsJson).toBe("C:/proj/data/layouts/layouts.json");
  });
});
