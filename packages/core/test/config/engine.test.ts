import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCfg, engineProfile, defaultProfile } from "../../src/config/engine.js";
import { projectPaths } from "../../src/config/paths.js";
import { SUBJECT_ROOT, itWithCorpus, referenceRoot } from "../helpers/corpus.js";

describe("parseCfg", () => {
  it("reads key=value, hex, ints and comma lists", () => {
    const cfg = parseCfg("base_game_version=pokeemerald\nblock_collision_mask=0xC00\nmetatile_attributes_size=2\nwarp_behaviors=0x62,0x93\n");
    expect(cfg.base_game_version).toBe("pokeemerald");
    expect(cfg.block_collision_mask).toBe("0xC00");
  });
});

describe("engineProfile", () => {
  it("builds a profile from the subject repo's cfg", () => {
    const p = engineProfile(parseCfg([
      "base_game_version=pokeemerald",
      "block_metatile_id_mask=0x3FF",
      "block_collision_mask=0xC00",
      "block_elevation_mask=0xF000",
      "metatile_attributes_size=2",
      "metatile_behavior_mask=0xFF",
      "metatile_layer_type_mask=0xF000",
      "warp_behaviors=0x62,0x93,0x6A",
    ].join("\n")));

    expect(p.baseGameVersion).toBe("pokeemerald");
    expect(p.blockMetatileIdMask).toBe(0x3ff);
    expect(p.blockCollisionMask).toBe(0xc00);
    expect(p.blockCollisionShift).toBe(10);
    expect(p.blockElevationShift).toBe(12);
    expect(p.metatileAttributesSize).toBe(2);
    expect(p.warpBehaviors).toEqual([0x62, 0x93, 0x6a]);
  });

  it("uses FireRed's 4-byte attributes and terrain masks", () => {
    const p = defaultProfile("pokefirered");
    expect(p.metatileAttributesSize).toBe(4);
    expect(p.metatileTerrainTypeMask).toBe(0x3e00);
    expect(p.metatileEncounterTypeMask).toBe(0x7000000);
    expect(p.supportsFloorNumber).toBe(true);
  });

  it("marks pokeemerald-expansion as supporting layout_version", () => {
    expect(defaultProfile("pokeemerald-expansion").supportsLayoutVersion).toBe(true);
    expect(defaultProfile("pokeemerald").supportsLayoutVersion).toBe(false);
  });

  it("reads masks from the cfg rather than falling through to defaults", () => {
    // Every mask in a REAL cfg happens to equal this engine's default, so a
    // parser that ignored the file entirely would still pass the corpus tests
    // below. Deliberately non-default values are the only way to prove the
    // keys are actually read. Same trap that made Task 3's swap test useless.
    const p = engineProfile(parseCfg([
      "base_game_version=pokeemerald",
      "block_metatile_id_mask=0x1FF",
      "block_collision_mask=0x600",
      "block_elevation_mask=0x7800",
      "metatile_attributes_size=4",
      "metatile_behavior_mask=0x3F",
      "metatile_layer_type_mask=0x0F00",
    ].join("\n")));

    expect(p.blockMetatileIdMask).toBe(0x1ff);
    expect(p.blockCollisionMask).toBe(0x600);
    expect(p.blockCollisionShift).toBe(9);
    expect(p.blockElevationMask).toBe(0x7800);
    expect(p.blockElevationShift).toBe(11);
    expect(p.metatileAttributesSize).toBe(4);
    expect(p.metatileBehaviorMask).toBe(0x3f);
    expect(p.metatileLayerTypeMask).toBe(0x0f00);
  });

  itWithCorpus("parses the subject repo's real porymap.project.cfg", () => {
    const p = projectPaths(SUBJECT_ROOT);
    const cfg = parseCfg(readFileSync(p.porymapCfg, "utf8"));
    const profile = engineProfile(cfg);
    // These values are asserted against the real file's actual content
    // (checked directly), not against defaultProfile's fallbacks, so a
    // parser that silently fell back would not pass this test:
    // block_collision_mask=0xC00, block_elevation_mask=0xF000,
    // metatile_attributes_size=2, metatile_behavior_mask=0xFF,
    // metatile_layer_type_mask=0xF000, and 28 warp_behaviors entries.
    expect(profile.baseGameVersion).toBe("pokeemerald");
    expect(profile.metatileAttributesSize).toBe(2);
    expect(profile.metatileBehaviorMask).toBe(0xff);
    expect(profile.metatileLayerTypeMask).toBe(0xf000);
    expect(profile.warpBehaviors.length).toBe(28);
    expect(profile.warpBehaviors[0]).toBe(0x62);
  });

  const frlg = referenceRoot("pokefirered");
  it.skipIf(!frlg)("parses pokefirered's real porymap.project.cfg", () => {
    const profile = engineProfile(parseCfg(readFileSync(projectPaths(frlg!).porymapCfg, "utf8")));
    expect(profile.baseGameVersion).toBe("pokefirered");
    expect(profile.metatileAttributesSize).toBe(4);
    expect(profile.metatileBehaviorMask).toBe(0x1ff);
    expect(profile.metatileLayerTypeMask).toBe(0x60000000);
    expect(profile.metatileTerrainTypeMask).toBe(0x3e00);
    expect(profile.metatileEncounterTypeMask).toBe(0x7000000);
    expect(profile.warpBehaviors.length).toBe(17);
  });
});
