import { describe, it, expect } from "vitest";
import { GBA_CAPABILITIES, GBC_CAPABILITIES, toolsFor, ALL_TOOLS } from "../../src/shell/adapter.js";
import { gbaAdapter } from "../../src/gba/adapter.js";

describe("capabilities (Plan 9)", () => {
  it("pins every GBA flag", () => {
    expect(GBA_CAPABILITIES).toEqual({
      collisionTool: true, elevationOverlay: true, addEvent: true, addSign: true, timeOfDay: false,
      defectsBanner: false, manualPlacements: false, dungeonFilterCache: false,
      worldBar: { dungeonAutoLayout: true, unplacedRail: true },
    });
  });
  it("pins every GBC flag", () => {
    expect(GBC_CAPABILITIES).toEqual({
      collisionTool: false, elevationOverlay: false, addEvent: false, addSign: false, timeOfDay: true,
      defectsBanner: true, manualPlacements: true, dungeonFilterCache: true,
      worldBar: { dungeonAutoLayout: false, unplacedRail: false },
    });
  });
  it("toolsFor keeps toolbar order and drops Collision without collisionTool", () => {
    expect(ALL_TOOLS).toEqual(["pencil", "rect", "bucket", "dropper", "shift", "collision"]);
    expect(toolsFor(GBA_CAPABILITIES)).toEqual(ALL_TOOLS);
    expect(toolsFor(GBC_CAPABILITIES)).toEqual(["pencil", "rect", "bucket", "dropper", "shift"]);
  });
});

describe("gbaAdapter (Plan 9)", () => {
  it("is the GBA family with no label and GBA's capabilities", () => {
    expect(gbaAdapter.family).toBe("gba");
    expect(gbaAdapter.label).toBeNull();
    expect(gbaAdapter.capabilities).toBe(GBA_CAPABILITIES);
  });
});
