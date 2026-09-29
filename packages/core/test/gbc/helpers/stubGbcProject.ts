import type { GbcProject } from "../../../src/gbc/project.js";

/**
 * A minimal `GbcProject` stub, not the corpus -- unused methods throw on
 * call, so a wrong code path fails loudly (wrong stub touched) rather than
 * by coincidence. Mirrors `packages/core/test/helpers/stubProject.ts`'s own
 * GBA-side shape and its own reason for existing: `atlas.test.ts`,
 * `render/map.test.ts` and `world/connections.test.ts` each grew their own
 * copy of this same `unused(fn)`-thrower boilerplate, and each had to add
 * the same two lines (`groupNames`, `collisionInfo`) independently when
 * Plan 6b Task 1a added them to the interface (quality review finding 2).
 * Each call site keeps its own per-test differences (`root`, `maps`,
 * `map()`, a real `layout`/`tileset`/`wild`/`waterCollisionValues`
 * implementation, etc.) via `overrides`, so the next `GbcProject` method
 * only needs one new line here, not three.
 */
export function stubGbcProject(overrides: Partial<GbcProject> = {}): GbcProject {
  const unused = (fn: string) => (): never => {
    throw new Error(`stub: ${fn} should not be called`);
  };
  return {
    root: "<stub>",
    maps: [],
    map: unused("map"),
    tileset: unused("tileset"),
    paletteTables: unused("paletteTables"),
    roofs: unused("roofs"),
    layout: unused("layout"),
    paddingWidth: unused("paddingWidth"),
    wild: unused("wild"),
    waterCollisionValues: unused("waterCollisionValues"),
    groupNames: unused("groupNames"),
    collisionInfo: unused("collisionInfo"),
    ...overrides,
  };
}
