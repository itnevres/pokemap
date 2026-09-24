import { describe, expect } from "vitest";
import { openGbcProject } from "../../src/gbc/project.js";
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
});
