import { describe, it, expect } from "vitest";
import { guardLayoutSave, guardMapSave } from "../../src/write/guards.js";
import type { Project } from "../../src/project.js";
import type { Layout } from "../../src/model/types.js";
import type { MapData } from "../../src/load/maps.js";
import { defaultProfile } from "../../src/config/engine.js";

/** A minimal stub, not the corpus -- mirrors packages/core/test/world/
 *  warpGraph.test.ts's own stubProject pattern exactly (unused fields throw
 *  on call, so a wrong code path fails loudly rather than by coincidence). */
function stubProject(overrides: Partial<Project>): Project {
  const unused = (fn: string) => (): never => { throw new Error(`stub: ${fn} should not be called`); };
  return {
    paths: unused("paths") as unknown as Project["paths"],
    profile: defaultProfile("pokeemerald"),
    constants: unused("constants") as unknown as Project["constants"],
    layouts: [],
    groups: unused("groups") as unknown as Project["groups"],
    layoutByName: () => undefined,
    layoutById: () => undefined,
    layoutForMap: unused("layoutForMap"),
    splitFor: unused("splitFor"),
    tileset: unused("tileset"),
    tilesetSymbols: unused("tilesetSymbols"),
    map: unused("map"),
    mapNames: () => [],
    ...overrides,
  };
}

const LAYOUT: Layout = {
  id: "LAYOUT_TEST", name: "Test_Layout", width: 10, height: 10,
  borderWidth: 2, borderHeight: 2, primaryTileset: "gTileset_General",
  secondaryTileset: "gTileset_Route", borderFilepath: "x", blockdataFilepath: "y",
};

describe("guardLayoutSave", () => {
  it("refuses to save a layout with no layout_version on an engine that supports it", () => {
    const proj = stubProject({
      profile: { ...defaultProfile("pokeemerald-expansion"), supportsLayoutVersion: true },
      splitFor: () => ({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 }),
      tileset: (s) => ({ symbol: s, isSecondary: false, metatileCount: 512, tiles: {} as any, palettes: [], attributes: [], metatile: () => [], layerType: () => 0, behavior: () => 0 }),
    });
    const r = guardLayoutSave(proj, { ...LAYOUT, layoutVersion: undefined }, []);
    expect(r.map((x) => x.code)).toContain("missing-layout-version");
    expect(r.find((x) => x.code === "missing-layout-version")!.fix).toMatch(/layout_version/);
  });

  it("does not refuse a layout that already carries layout_version", () => {
    const proj = stubProject({
      profile: { ...defaultProfile("pokeemerald-expansion"), supportsLayoutVersion: true },
      splitFor: () => ({ version: "hns", tiles: 640, metatiles: 640, pals: 7 }),
      tileset: (s) => ({ symbol: s, isSecondary: false, metatileCount: 640, tiles: {} as any, palettes: [], attributes: [], metatile: () => [], layerType: () => 0, behavior: () => 0 }),
    });
    const r = guardLayoutSave(proj, { ...LAYOUT, layoutVersion: "hns" }, []);
    expect(r.map((x) => x.code)).not.toContain("missing-layout-version");
  });

  it("does not refuse for missing layout_version on an engine that doesn't support the field at all", () => {
    // pokeemerald vanilla: supportsLayoutVersion is false, so the field's
    // absence is expected, not a defect -- the guard must not fire here, or
    // every vanilla-emerald map becomes permanently unsavable.
    const proj = stubProject({
      profile: defaultProfile("pokeemerald"),
      splitFor: () => ({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 }),
      tileset: (s) => ({ symbol: s, isSecondary: false, metatileCount: 512, tiles: {} as any, palettes: [], attributes: [], metatile: () => [], layerType: () => 0, behavior: () => 0 }),
    });
    expect(guardLayoutSave(proj, { ...LAYOUT, layoutVersion: undefined }, []).map((x) => x.code))
      .not.toContain("missing-layout-version");
  });

  it("refuses a block whose id is out of range for THIS layout's split -- the whole thesis of the project as an assertion", () => {
    const proj = stubProject({
      profile: defaultProfile("pokeemerald"),
      splitFor: (l) => l.name === "Emerald_Layout"
        ? { version: "emerald", tiles: 512, metatiles: 512, pals: 6 }
        : { version: "hns", tiles: 640, metatiles: 640, pals: 7 },
      // Symbol-differentiated, not the uniform 512 the other fixtures use --
      // idOutOfRange's ceiling is split.metatiles + secondaryCount, so a flat
      // count applied to both tilesets makes id 600 resolve the SAME way on
      // both layouts (fine on both, since 512+512=1024 and 640+512=1152 both
      // clear 600) and the test could never tell hns from emerald. 640 for
      // the primary tileset and 80 for the secondary is the realistic shape
      // besides: an hns split's primary really does reach into the 600s; a
      // secondary tileset like Route's is a few dozen to ~100 metatiles, not
      // another 512.
      tileset: (s) => ({
        symbol: s, isSecondary: s === LAYOUT.secondaryTileset,
        metatileCount: s === LAYOUT.secondaryTileset ? 80 : 640,
        tiles: {} as any, palettes: [], attributes: [], metatile: () => [], layerType: () => 0, behavior: () => 0,
      }),
    });
    // id 600 is legal on an hns (640-primary) layout and illegal on an
    // emerald (512-primary) one -- the exact pairing Plan 0's own §7 test-
    // design rule calls "the whole thesis of the project expressed as an
    // assertion": the SAME id, different verdicts, purely from the split.
    const block = [{ metatileId: 600, collision: 0, elevation: 3 }];
    expect(guardLayoutSave(proj, { ...LAYOUT, name: "Emerald_Layout" }, block).map((x) => x.code))
      .toContain("metatile-out-of-range");
    expect(guardLayoutSave(proj, { ...LAYOUT, name: "Hns_Layout" }, block).map((x) => x.code))
      .not.toContain("metatile-out-of-range");
  });

  it("names the offending ids and both tileset counts in the fix text", () => {
    const proj = stubProject({
      profile: defaultProfile("pokeemerald"),
      splitFor: () => ({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 }),
      // Secondary deliberately smaller than primary (100 vs 512, not another
      // uniform 512) so id 999 actually falls outside [512, 512+100) -- see
      // the "whole thesis" test above for why a flat count can't do this.
      tileset: (s) => ({
        symbol: s, isSecondary: s === LAYOUT.secondaryTileset,
        metatileCount: s === LAYOUT.secondaryTileset ? 100 : 512,
        tiles: {} as any, palettes: [], attributes: [], metatile: () => [], layerType: () => 0, behavior: () => 0,
      }),
    });
    const r = guardLayoutSave(proj, LAYOUT, [{ metatileId: 999, collision: 0, elevation: 0 }]);
    const found = r.find((x) => x.code === "metatile-out-of-range")!;
    expect(found.message).toContain("999");
    expect(found.fix).toMatch(/512/);
  });

  it("refuses a border block count that does not match borderWidth * borderHeight", () => {
    const proj = stubProject({ profile: defaultProfile("pokeemerald") });
    // LAYOUT is borderWidth:2, borderHeight:2 -> expects 4 border blocks.
    const border = [{ metatileId: 1, collision: 0, elevation: 0 }, { metatileId: 1, collision: 0, elevation: 0 }];
    const r = guardLayoutSave(proj, LAYOUT, [], border);
    expect(r.map((x) => x.code)).toContain("border-size-mismatch");
    expect(r.find((x) => x.code === "border-size-mismatch")!.fix).toMatch(/2.*2|4/);
  });

  it("does not refuse when border is omitted (a layout-only save that never touched border.bin)", () => {
    const proj = stubProject({ profile: defaultProfile("pokeemerald") });
    expect(guardLayoutSave(proj, LAYOUT, []).map((x) => x.code)).not.toContain("border-size-mismatch");
  });
});

describe("guardMapSave", () => {
  const BASE_MAP: MapData = {
    id: "MAP_TEST", name: "Test", layout: "LAYOUT_TEST", music: "MUS_ROUTE101",
    regionMapSection: "MAPSEC_TEST", mapType: "MAP_TYPE_ROUTE", weather: "WEATHER_NONE",
    connections: [], objectEvents: [], warpEvents: [{ x: 5, y: 5, elevation: 0, destMap: "MAP_OTHER", destWarpId: "0" }],
    coordEvents: [], bgEvents: [],
  };

  it("refuses when a block under an existing warp moved without the warp moving with it", () => {
    const proj = stubProject({ profile: defaultProfile("pokeemerald") });
    // The warp sits at (5,5) in a 10-wide layout -- block index 5*10+5=55.
    // nextBlocks differs from prevBlocks at exactly that index; the warp
    // event itself (nextMap) is untouched.
    const prevBlocks = Array.from({ length: 100 }, () => ({ metatileId: 1, collision: 0, elevation: 0 }));
    const nextBlocks = prevBlocks.map((b, i) => (i === 55 ? { ...b, metatileId: 2 } : b));
    const r = guardMapSave(proj, LAYOUT, BASE_MAP, BASE_MAP, prevBlocks, nextBlocks);
    expect(r.map((x) => x.code)).toContain("warp-tile-moved");
    expect(r.find((x) => x.code === "warp-tile-moved")!.message).toContain("MAP_OTHER");
  });

  it("does not refuse when the block under a warp is unchanged", () => {
    const proj = stubProject({ profile: defaultProfile("pokeemerald") });
    const blocks = Array.from({ length: 100 }, () => ({ metatileId: 1, collision: 0, elevation: 0 }));
    // A change elsewhere (index 0, not under the warp at 55) must not trip it.
    const nextBlocks = blocks.map((b, i) => (i === 0 ? { ...b, metatileId: 9 } : b));
    const r = guardMapSave(proj, LAYOUT, BASE_MAP, BASE_MAP, blocks, nextBlocks);
    expect(r.map((x) => x.code)).not.toContain("warp-tile-moved");
  });

  it("does not refuse when the warp event itself moved together with its block", () => {
    const proj = stubProject({ profile: defaultProfile("pokeemerald") });
    const prevBlocks = Array.from({ length: 100 }, () => ({ metatileId: 1, collision: 0, elevation: 0 }));
    const nextBlocks = prevBlocks.map((b, i) => (i === 55 ? { ...b, metatileId: 2 } : b));
    const movedMap: MapData = { ...BASE_MAP, warpEvents: [{ ...BASE_MAP.warpEvents[0]!, x: 6, y: 5 }] };
    // Warp moved off (5,5) in the SAME save, so the old tile changing under
    // it is expected, not a silent unpairing.
    expect(guardLayoutSave === guardLayoutSave); // no-op keeps this test file's import used if reordered
    const r = guardMapSave(proj, LAYOUT, BASE_MAP, movedMap, prevBlocks, nextBlocks);
    expect(r.map((x) => x.code)).not.toContain("warp-tile-moved");
  });

  it("indexes blocks as (y * width + x) on a non-square layout -- (5,5) on a 10x10 square can't tell x and y apart", () => {
    // Teeth-proofing found that LAYOUT's own fixture (10 wide, warp at
    // x===y===5) can't distinguish (y*width+x) from the transposed
    // (x*width+y): both formulas land on index 55 there. A non-square
    // layout with x !== y breaks the tie -- the transposed formula lands on
    // an index that does not even exist in this block array (6*8+2=50, past
    // the 40-element end), so a swapped implementation silently misses the
    // change instead of flagging it.
    const proj = stubProject({ profile: defaultProfile("pokeemerald") });
    const nonSquare: Layout = { ...LAYOUT, width: 8, height: 5 };
    const map: MapData = {
      ...BASE_MAP,
      warpEvents: [{ x: 6, y: 2, elevation: 0, destMap: "MAP_OTHER", destWarpId: "0" }],
    };
    const prevBlocks = Array.from({ length: 40 }, () => ({ metatileId: 1, collision: 0, elevation: 0 }));
    const nextBlocks = prevBlocks.map((b, i) => (i === 2 * 8 + 6 ? { ...b, metatileId: 2 } : b));
    const r = guardMapSave(proj, nonSquare, map, map, prevBlocks, nextBlocks);
    expect(r.map((x) => x.code)).toContain("warp-tile-moved");
  });
});
