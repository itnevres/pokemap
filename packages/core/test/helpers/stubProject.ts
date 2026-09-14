import type { Project } from "../../src/project.js";
import type { Tileset } from "../../src/load/tilesetData.js";
import { defaultProfile } from "../../src/config/engine.js";

/**
 * A minimal Project stub, not the corpus -- unused fields throw on call, so a
 * wrong code path fails loudly (wrong stub touched) rather than by
 * coincidence. Originally packages/core/test/write/guards.test.ts's own
 * copy (itself mirroring world/warpGraph.test.ts's stubProject); extracted
 * here so the write/*.test.ts and edit/*.test.ts files still to come don't
 * each retype it. warpGraph.test.ts keeps its own separate copy -- out of
 * scope to retarget here.
 */
export function stubProject(overrides: Partial<Project>): Project {
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

/**
 * A minimal Tileset stub. The fields no guard/edit logic reads yet
 * (tiles/palettes/attributes/metatile/layerType/behavior) get harmless empty
 * defaults so call sites only have to name what they actually care about.
 */
export function stubTileset(symbol: string, metatileCount: number, isSecondary = false): Tileset {
  return {
    symbol, isSecondary, metatileCount,
    tiles: {} as Tileset["tiles"],
    palettes: [],
    attributes: [],
    metatile: () => [],
    layerType: () => 0,
    behavior: () => 0,
  };
}
