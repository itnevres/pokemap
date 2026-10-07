import { afterEach, describe, expect, it } from "vitest";
import { openGbcEditSession } from "../../../src/gbc/write/save.js";
import { cleanupFixtures, makeFixture } from "../helpers/saveFixture.js";

afterEach(cleanupFixtures);

describe("openGbcEditSession", () => {
  it("1. blocks/originalBlocks are equal in value but fully independent of each other and of layout.blocks", () => {
    const f = makeFixture();
    const s = openGbcEditSession(f.proj, "Testmap");
    expect(s.blocks).toEqual([{ metatileId: 1 }, { metatileId: 2 }, { metatileId: 3 }, { metatileId: 4 }]);
    expect(s.originalBlocks).toEqual(s.blocks);
    expect(s.originalBlocks).not.toBe(s.blocks);
    expect(s.originalBlocks[0]).not.toBe(s.blocks[0]);
    for (const arr of [s.blocks, s.originalBlocks]) {
      expect(arr).not.toBe(s.layout.blocks);
      expect(arr[0]).not.toBe(s.layout.blocks[0]);
    }
    s.blocks[0]!.metatileId = 99;
    expect(s.originalBlocks[0]!.metatileId).toBe(1);
    expect(s.layout.blocks[0]!.metatileId).toBe(1);
    // The fixture parses as designed (2 objects, 2 consts), and the two parses are independent.
    expect(s.events.objects).toHaveLength(2);
    expect(s.events.objectConsts).toHaveLength(2);
    expect(s.events).not.toBe(s.originalEvents);
    expect(s.events).toEqual(s.originalEvents);
    expect(s.eventsText).toBe(s.originalEventsText);
    expect(s.isDirty).toBe(false);
  });

  it("2. layoutSharedBy lists every same-blkPath map, this one included, in proj.maps order", () => {
    const f = makeFixture();
    expect(openGbcEditSession(f.proj, "Testmap").layoutSharedBy).toEqual(["Zed", "Testmap"]);
  });

  it("3. an unknown map name throws", () => {
    const f = makeFixture();
    expect(() => openGbcEditSession(f.proj, "Nope")).toThrow(/unknown map/);
  });
});

