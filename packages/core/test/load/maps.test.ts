import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMapGroups, parseMap } from "../../src/load/maps.js";
import { projectPaths } from "../../src/config/paths.js";
import { SUBJECT_ROOT, itWithCorpus, referenceRoot } from "../helpers/corpus.js";

const P = projectPaths(SUBJECT_ROOT);

describe("parseMapGroups", () => {
  itWithCorpus("reads group order and membership", () => {
    const g = parseMapGroups(readFileSync(P.mapGroupsJson, "utf8"));
    expect(g.groupOrder[0]).toBe("gMapGroup_TownsAndRoutes");
    expect(g.groupOrder).toHaveLength(28);
    expect(g.allMapNames()).toContain("NewBarkTown");
    expect(g.allMapNames().length).toBe(1209);
  });

  it("refuses a map_groups.json with no group_order", () => {
    expect(() => parseMapGroups('{"gMapGroup_Foo": []}')).toThrow(/group_order/);
  });
});

describe("parseMap", () => {
  itWithCorpus("reads NewBarkTown's header, connections and events", () => {
    const m = parseMap(readFileSync(P.mapJson("NewBarkTown"), "utf8"));
    expect(m.id).toBe("MAP_NEW_BARK_TOWN");
    expect(m.layout).toBe("LAYOUT_NEW_BARK_TOWN");
    expect(m.mapType).toBe("MAP_TYPE_TOWN");
    expect(m.connections.map((c) => c.direction).sort()).toEqual(["left", "right"]);
    expect(m.connections.find((c) => c.direction === "left")).toMatchObject({ map: "MAP_ROUTE29", offset: -5 });
    expect(m.objectEvents.length).toBeGreaterThan(0);
  });

  itWithCorpus("preserves species object events verbatim", () => {
    const m = parseMap(readFileSync(P.mapJson("CeladonCity"), "utf8"));
    const sign = m.objectEvents.find((o) => o.graphicsId.startsWith("OBJ_EVENT_GFX_SPECIES"));
    expect(sign).toMatchObject({
      graphicsId: "OBJ_EVENT_GFX_SPECIES(POLIWRATH)",
      x: 36, y: 14, elevation: 3,
      script: "CeladonCity_EventScript_Poliwrath",
    });
  });

  const frlg = referenceRoot("pokefirered");
  it.skipIf(!frlg)("reads a firered map, and finds one carrying floor_number", () => {
    const fp = projectPaths(frlg!);
    const groups = parseMapGroups(readFileSync(fp.mapGroupsJson, "utf8"));
    const names = groups.allMapNames();
    expect(names.length).toBeGreaterThan(0);
    expect(parseMap(readFileSync(fp.mapJson(names[0]!), "utf8")).id).toMatch(/^MAP_/);

    // floor_number is FireRed-only. Prove the parser surfaces it rather than
    // dropping it -- at least one FRLG map has it, and asserting that is what
    // makes this a portability test instead of a smoke test.
    const withFloor = names
      .map((n) => parseMap(readFileSync(fp.mapJson(n), "utf8")))
      .filter((m) => m.floorNumber !== undefined);
    expect(withFloor.length).toBeGreaterThan(0);
  });

  itWithCorpus("leaves floorNumber undefined on an engine that has no such key", () => {
    // The positive assertion above passes even against an implementation that
    // hardcodes a floorNumber, since all 425 FireRed maps carry the key. Only
    // the negative case proves the value is read rather than invented -- the
    // same discipline the layouts suite applies to layout_version.
    const m = parseMap(readFileSync(P.mapJson("NewBarkTown"), "utf8"));
    expect(m.floorNumber).toBeUndefined();
    expect(m.region).toBeUndefined();
  });

  // The decomp writes `"connections": 0` for a map with no connections, not
  // `null` or `[]`. Measured across the subject repo: 185 maps a real array,
  // 633 the literal `0`, 391 `null`, 0 anything else -- so `0 ?? []` (which
  // returns `0`, because `0` is not nullish) throws on over half the tree the
  // first time `.map` runs on it. This has been green since Task 6 only
  // because nothing before this walked every map: `renders every layout`
  // walks layouts, which never calls parseMap.
  itWithCorpus("treats connections: 0 the same as no connections", () => {
    const m = parseMap(readFileSync(P.mapJson("NewBarkTown_Lab"), "utf8"));
    expect(m.connections).toEqual([]);
  });

  itWithCorpus("treats connections: null the same as no connections", () => {
    const m = parseMap(readFileSync(P.mapJson("TrainerHill_Courtyard"), "utf8"));
    expect(m.connections).toEqual([]);
  });

  itWithCorpus("still reads a real connections array with its actual entries", () => {
    // Guards against a fix that returns [] unconditionally: NewBarkTown's own
    // two connections (already asserted above) prove the array shape survives
    // whatever guard handles the 0/null shapes.
    const m = parseMap(readFileSync(P.mapJson("NewBarkTown"), "utf8"));
    expect(m.connections).toHaveLength(2);
  });

  itWithCorpus("parses all 1,209 maps in the subject repo without throwing", () => {
    const groups = parseMapGroups(readFileSync(P.mapGroupsJson, "utf8"));
    const names = groups.allMapNames();
    expect(names.length).toBe(1209);
    const failures: string[] = [];
    for (const name of names) {
      try {
        parseMap(readFileSync(P.mapJson(name), "utf8"));
      } catch (e) {
        failures.push(`${name}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
