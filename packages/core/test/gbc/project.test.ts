import { describe, it, expect } from "vitest";
import { openGbcProject, parsePaddingWidth } from "../../src/gbc/project.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "./helpers/corpus.js";

/**
 * `openGbcProject`'s caching contract (deliverable 1: "`tileset(tilesetConst)`,
 * cached per const"; "`paletteTables()`, lazy and cached"; "`roofs()`, lazy
 * and cached"). Tasks 10-12 rely on these returning the SAME object across
 * calls -- re-parsing 37 tilesets or every palette/roof table per map would
 * defeat the whole point of `GbcProject` existing. It also underwrites
 * `render/map.ts`'s "never mutate the cached tileset" guarantee: that
 * guarantee is only meaningful because `tileset()` really does hand back one
 * shared object, not a fresh copy per call.
 *
 * Fix round 1, spec review Issue 3 (R10/R11/R12): disabling any one of these
 * three caches left the rest of the suite green, since every other test
 * builds its own `GbcProject` from scratch per call and never checks
 * `openGbcProject`'s own memoization. These identity assertions are the
 * fix -- run against the real corpus, since a synthetic fixture buys nothing
 * extra here (the property under test is "same JS object reference", which
 * doesn't depend on what the object contains).
 */
describe("GbcProject caching", () => {
  itWithGbcCorpus("tileset(const), paletteTables() and roofs() each return the SAME object on repeated calls", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);

    expect(proj.tileset("TILESET_JOHTO")).toBe(proj.tileset("TILESET_JOHTO"));
    expect(proj.tileset("TILESET_LAB")).toBe(proj.tileset("TILESET_LAB"));
    // Different consts still resolve to genuinely different objects -- the
    // cache is keyed, not a single memoized slot that ignores its argument.
    expect(proj.tileset("TILESET_JOHTO")).not.toBe(proj.tileset("TILESET_LAB"));

    expect(proj.paletteTables()).toBe(proj.paletteTables());
    expect(proj.roofs()).toBe(proj.roofs());
  });

  // Task 12: wild()/waterCollisionValues() join the same lazy-cache family.
  itWithGbcCorpus("wild() and waterCollisionValues() are each cached (same object/Set across calls)", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    expect(proj.wild()).toBe(proj.wild());
    expect(proj.waterCollisionValues()).toBe(proj.waterCollisionValues());
    // Sanity: real data, not an empty/placeholder cache.
    expect(proj.wild().grass.length).toBeGreaterThan(0);
    expect(proj.waterCollisionValues().size).toBeGreaterThan(0);
  });

  // Task 1a: groupNames()/collisionInfo() join the same lazy-cache family.
  itWithGbcCorpus("groupNames() and collisionInfo() are each cached (same array/Map across calls)", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    expect(proj.groupNames()).toBe(proj.groupNames());
    expect(proj.collisionInfo()).toBe(proj.collisionInfo());
    // Sanity: real data, not an empty/placeholder cache.
    expect(proj.groupNames().length).toBeGreaterThan(0);
    expect(proj.collisionInfo().size).toBeGreaterThan(0);
  });
});

/**
 * `parsePaddingWidth` direct unit coverage (fix round 2, quality review
 * minor #3) -- its sibling single-constant parsers (`parseCollisionConstants`,
 * `parseRoofsAsm`, `parseBrightnessLevels`'s darkness-palset lookup) all have
 * this; this one previously didn't, and was only ever exercised indirectly
 * through `renderGbcMap`'s corpus tests. It is now a 1-line wrapper over
 * `asm.ts`'s shared `findDefEqu` (minor #1), whose own "not found"/malformed
 * refusals are unit-tested directly in `asm.test.ts` -- these two cases pin
 * that the wrapper itself is wired correctly (real name, real source).
 */
describe("parsePaddingWidth", () => {
  it("parses the real MAP_CONNECTION_PADDING_WIDTH shape", () => {
    expect(parsePaddingWidth("DEF MAP_CONNECTION_PADDING_WIDTH EQU 3 ; metatiles\n", "constants/gfx_constants.asm")).toBe(3);
  });

  it("refuses, naming the source, when the constant isn't defined", () => {
    expect(() => parsePaddingWidth("DEF OTHER EQU 9\n", "constants/gfx_constants.asm")).toThrow(/constants\/gfx_constants\.asm/);
    expect(() => parsePaddingWidth("DEF OTHER EQU 9\n", "constants/gfx_constants.asm")).toThrow(/MAP_CONNECTION_PADDING_WIDTH/);
  });
});
