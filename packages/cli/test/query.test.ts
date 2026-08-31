import { describe, expect } from "vitest";
import { openProject } from "@pokemap/core/src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../../core/test/helpers/corpus.js";
import { layoutNameFor } from "../src/context.js";

const proj = openProject(SUBJECT_ROOT);

describe("query", () => {
  itWithCorpus("reports each map's own split, not a global one", () => {
    const split = (map: string) => proj.splitFor(proj.layoutById(proj.map(map).layout)!);

    // The whole tool exists because these two differ. Asserting only one of
    // them would pass against any hardcoded constant.
    expect(split("NewBarkTown")).toEqual({ version: "hns", tiles: 640, metatiles: 640, pals: 7 });
    expect(split("PetalburgCity")).toEqual({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 });
  });

  itWithCorpus("resolves a target that is a map name or a layout name", () => {
    expect(layoutNameFor(proj, "PetalburgCity")).toBe("PetalburgCity_Layout");
    expect(layoutNameFor(proj, "PetalburgCity_Layout")).toBe("PetalburgCity_Layout");
    // Pins the I7 message this whole change is about: it must come from
    // Project.layoutForMap (naming map_groups.json), not a hand-rolled
    // "no layout or map named X" that would pass just as well against
    // the old, less informative implementation.
    expect(() => layoutNameFor(proj, "NoSuchPlace")).toThrow(/map_groups.json/);
  });
});
