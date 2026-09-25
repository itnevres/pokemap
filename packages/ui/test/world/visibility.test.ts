import { describe, it, expect } from "vitest";
import { HIDDEN_MAP_TYPES, isDrawnByDefault } from "../../src/world/visibility.js";

describe("visibility", () => {
  it("hides MAP_TYPE_INDOOR and MAP_TYPE_NONE by default", () => {
    expect(HIDDEN_MAP_TYPES.has("MAP_TYPE_INDOOR")).toBe(true);
    expect(HIDDEN_MAP_TYPES.has("MAP_TYPE_NONE")).toBe(true);
    expect(isDrawnByDefault("MAP_TYPE_INDOOR", false)).toBe(false);
    expect(isDrawnByDefault("MAP_TYPE_NONE", false)).toBe(false);
  });

  it("shows every other measured map type by default", () => {
    // Every non-hidden type from the design spec's own §2 table -- pinned
    // individually, not just "not INDOOR/NONE", so a future edit to
    // HIDDEN_MAP_TYPES that accidentally hides one of these fails loudly
    // here instead of only in a much harder-to-diagnose WorldCanvas test.
    for (const t of [
      "MAP_TYPE_TOWN", "MAP_TYPE_CITY", "MAP_TYPE_ROUTE", "MAP_TYPE_OCEAN_ROUTE",
      "MAP_TYPE_UNDERGROUND", "MAP_TYPE_UNDERWATER", "MAP_TYPE_SECRET_BASE",
    ]) {
      expect(isDrawnByDefault(t, false)).toBe(true);
    }
  });

  it("a manually-placed map always shows, regardless of its type", () => {
    expect(isDrawnByDefault("MAP_TYPE_INDOOR", true)).toBe(true);
    expect(isDrawnByDefault("MAP_TYPE_NONE", true)).toBe(true);
  });
});
