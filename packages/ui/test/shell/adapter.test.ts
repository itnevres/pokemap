import { describe, it, expect } from "vitest";
import { GBA_CAPABILITIES, GBC_CAPABILITIES, toolsFor, ALL_TOOLS } from "../../src/shell/adapter.js";
import { gbaAdapter } from "../../src/gba/adapter.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";

describe("capabilities (Plan 9)", () => {
  it("pins every GBA flag", () => {
    expect(GBA_CAPABILITIES).toEqual({
      collisionTool: true, elevationOverlay: true, addEvent: true, pokemonIndicator: true, signTool: true, timeOfDay: false,
      blockEditor: true,
    });
  });
  it("pins every GBC flag", () => {
    expect(GBC_CAPABILITIES).toEqual({
      collisionTool: false, elevationOverlay: false, addEvent: false, pokemonIndicator: true, signTool: true, timeOfDay: true,
      blockEditor: true,
    });
  });
  it("toolsFor keeps toolbar order and drops Collision without collisionTool", () => {
    expect(ALL_TOOLS).toEqual(["pencil", "rect", "bucket", "dropper", "shift", "collision", "sign", "editBlock"]);
    expect(toolsFor(GBA_CAPABILITIES)).toEqual(ALL_TOOLS);
    expect(toolsFor(GBC_CAPABILITIES)).toEqual(["pencil", "rect", "bucket", "dropper", "shift", "sign", "editBlock"]);
  });
  // Task 14b: Edit block is appended LAST (N7) and follows the same capability gate as sign/collision.
  it("toolsFor drops Edit block without blockEditor", () => {
    expect(toolsFor({ ...GBA_CAPABILITIES, blockEditor: false }))
      .toEqual(["pencil", "rect", "bucket", "dropper", "shift", "collision", "sign"]);
    expect(toolsFor({ ...GBA_CAPABILITIES, blockEditor: true }))
      .toEqual(["pencil", "rect", "bucket", "dropper", "shift", "collision", "sign", "editBlock"]);
  });
});

describe("gbaAdapter (Plan 9)", () => {
  it("is the GBA family with no label and GBA's capabilities", () => {
    expect(gbaAdapter.family).toBe("gba");
    expect(gbaAdapter.label).toBeNull();
    expect(gbaAdapter.capabilities).toBe(GBA_CAPABILITIES);
  });
});

describe("gbcAdapter (Plan 9)", () => {
  it("is the GBC family labelled Crystal with GBC's capabilities", () => {
    expect(gbcAdapter.family).toBe("gbc");
    expect(gbcAdapter.label).toBe("Crystal");
    expect(gbcAdapter.capabilities).toBe(GBC_CAPABILITIES);
  });
});
