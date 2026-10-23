import { describe, it, expect } from "vitest";
import { GBA_CAPABILITIES, GBC_CAPABILITIES, toolsFor, ALL_TOOLS } from "../../src/shell/adapter.js";
import { gbaAdapter } from "../../src/gba/adapter.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";

describe("capabilities (Plan 9)", () => {
  it("pins every GBA flag", () => {
    expect(GBA_CAPABILITIES).toEqual({
      collisionTool: true, elevationOverlay: true, addEvent: true, pokemonIndicator: true, signTool: true, timeOfDay: false,
    });
  });
  it("pins every GBC flag", () => {
    expect(GBC_CAPABILITIES).toEqual({
      collisionTool: false, elevationOverlay: false, addEvent: false, pokemonIndicator: true, signTool: true, timeOfDay: true,
    });
  });
  it("toolsFor keeps toolbar order and drops Collision without collisionTool", () => {
    expect(ALL_TOOLS).toEqual(["pencil", "rect", "bucket", "dropper", "shift", "collision", "sign"]);
    expect(toolsFor(GBA_CAPABILITIES)).toEqual(ALL_TOOLS);
    expect(toolsFor(GBC_CAPABILITIES)).toEqual(["pencil", "rect", "bucket", "dropper", "shift", "sign"]);
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
