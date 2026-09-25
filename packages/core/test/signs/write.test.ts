import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWildSign, guardSignWrite } from "../../src/signs/write.js";

describe("buildWildSign", () => {
  it("builds a raw object_events value matching the real map.json field shape, and a scripts.inc append matching generateSignScript's own output", () => {
    const result = buildWildSign("Route101", { x: 5, y: 6, elevation: 3, species: "RATTATA", dialogue: "RATTATA: Skreee!" });
    expect(result.objectEvent).toEqual({
      graphics_id: "OBJ_EVENT_GFX_SPECIES(RATTATA)",
      x: 5, y: 6, elevation: 3,
      movement_type: "MOVEMENT_TYPE_FACE_DOWN",
      movement_range_x: 1, movement_range_y: 1,
      trainer_type: "TRAINER_TYPE_NONE",
      trainer_sight_or_berry_tree_id: "0",
      script: "Route101_EventScript_WildSign_Rattata",
      flag: "0",
    });
    expect(result.scriptLabel).toBe("Route101_EventScript_WildSign_Rattata");
    expect(result.scriptAppendText).toContain("playmoncry SPECIES_RATTATA, CRY_MODE_NORMAL");
    expect(result.scriptAppendText).toContain('.string "RATTATA: Skreee!$"');
  });

  it("accepts a species already carrying the SPECIES_ prefix without double-prefixing", () => {
    const result = buildWildSign("Route101", { x: 0, y: 0, elevation: 0, species: "SPECIES_RATTATA", dialogue: "..." });
    expect(result.objectEvent.graphics_id).toBe("OBJ_EVENT_GFX_SPECIES(RATTATA)");
  });

  it("propagates generateSignScript's own empty-dialogue refusal rather than swallowing it", () => {
    expect(() => buildWildSign("Route101", { x: 0, y: 0, elevation: 0, species: "RATTATA", dialogue: "" })).toThrow(/dialogue.*empty/i);
  });
});

describe("guardSignWrite", () => {
  it("refuses, by name, when the target map has no scripts.inc at all", () => {
    const root = mkdtempSync(join(tmpdir(), "pokemap-sign-"));
    try {
      const refusals = guardSignWrite(root, "NoScriptsMap", "NoScriptsMap_EventScript_WildSign_Rattata");
      expect(refusals).toHaveLength(1);
      expect(refusals[0]!.code).toBe("NO_SCRIPTS_INC");
      expect(refusals[0]!.fix).toMatch(/scripts\.inc/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses when the derived script label already exists in scripts.inc -- a genuine collision, not a guess about what the player meant", () => {
    const root = mkdtempSync(join(tmpdir(), "pokemap-sign-"));
    try {
      const dir = join(root, "data", "maps", "Route101");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "scripts.inc"), "Route101_EventScript_WildSign_Rattata::\n\tend\n");
      const refusals = guardSignWrite(root, "Route101", "Route101_EventScript_WildSign_Rattata");
      expect(refusals).toHaveLength(1);
      expect(refusals[0]!.code).toBe("SIGN_LABEL_EXISTS");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("returns an empty array when scripts.inc exists and the label is free", () => {
    const root = mkdtempSync(join(tmpdir(), "pokemap-sign-"));
    try {
      const dir = join(root, "data", "maps", "Route101");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "scripts.inc"), "SomeOtherLabel::\n\tend\n");
      expect(guardSignWrite(root, "Route101", "Route101_EventScript_WildSign_Rattata")).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
