import { describe, it, expect } from "vitest";
import { isGbaEncountersPayload } from "../../src/encounters/guards.js";

const chance = { species: "SPECIES_ESPEON", percent: 37.5, minLevel: 2, maxLevel: 4, slots: [0, 1] };
const ok = { mapName: "Route101", mapId: 1, methods: [{ method: "land_mons", chances: [chance] }, { method: "fishing_mons", rod: "old", chances: [chance] }] };

describe("isGbaEncountersPayload", () => {
  it("accepts the real GBA shape, including an empty methods array and a rod", () => {
    expect(isGbaEncountersPayload(ok)).toBe(true);
    expect(isGbaEncountersPayload({ mapName: "X", mapId: 2, methods: [] })).toBe(true);
  });

  it("rejects the GBC shape served from the same URL ({ family: 'gbc', sources })", () => {
    expect(isGbaEncountersPayload({ family: "gbc", mapName: "Route30", sources: [], defects: [] })).toBe(false);
  });

  it("rejects non-records and a missing/non-array methods", () => {
    for (const bad of [null, undefined, "x", 3, [], {}, { methods: {} }, { methods: "x" }]) expect(isGbaEncountersPayload(bad)).toBe(false);
  });

  it("rejects a method row with an unknown method, a non-string rod, or non-array chances", () => {
    expect(isGbaEncountersPayload({ methods: [{ method: "surf_mons", chances: [] }] })).toBe(false);
    expect(isGbaEncountersPayload({ methods: [{ method: "land_mons", rod: 3, chances: [] }] })).toBe(false);
    expect(isGbaEncountersPayload({ methods: [{ method: "land_mons", chances: "x" }] })).toBe(false);
    expect(isGbaEncountersPayload({ methods: [null] })).toBe(false);
  });

  it("rejects a chance missing a species or with a non-numeric percent/level", () => {
    for (const patch of [{ species: 1 }, { percent: "9" }, { minLevel: undefined }, { maxLevel: null }]) {
      expect(isGbaEncountersPayload({ methods: [{ method: "land_mons", chances: [{ ...chance, ...patch }] }] })).toBe(false);
    }
  });
});
