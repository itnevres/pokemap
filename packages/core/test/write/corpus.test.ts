import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { editJson } from "../../src/write/jsonEdit.js";
import { projectPaths } from "../../src/config/paths.js";
import { parseMapGroups } from "../../src/load/maps.js";

const cfg = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as {
  projectPath: string; referenceProjects: string[];
};
const roots = [cfg.projectPath, ...cfg.referenceProjects].filter((r) => existsSync(`${r}/data/layouts/layouts.json`));

// This is the JSON identity gate, not the project loader. It needs map names
// and file paths -- nothing about tilesets, palettes or metatiles -- so it is
// built directly on projectPaths + parseMapGroups rather than openProject.
// openProject eagerly parses tileset paths (src/data/tilesets/headers.h at a
// fixed modern-decomp location), and that coupling used to be the only reason
// pokeclassic -- a structurally older fork with no src/data/tilesets/
// directory at all, and no porymap.project.cfg to redirect -- sat outside
// invariant I5, the invariant Plan 0 section 6 names as the thing no plan may
// merge without. Verified directly: pokeclassic has everything this gate
// actually needs (data/maps/map_groups.json with a group_order key, 779
// map.json, data/layouts/layouts.json), so with the tileset dependency gone
// all six configured engines participate below -- no trip wire needed for a
// gap that no longer exists.
function mapNamesOf(root: string): string[] {
  const paths = projectPaths(root);
  return parseMapGroups(readFileSync(paths.mapGroupsJson, "utf8")).allMapNames();
}

describe("identity corpus (invariant I5)", () => {
  it("has every reference engine available", () => {
    expect(roots.length).toBeGreaterThanOrEqual(5);
  });

  // NOT `editJson(src, [])`. That returns `src` by an early return before any
  // parsing happens, so asserting it equals `src` is `expect(x).toBe(x)` -- it
  // would pass against an editJson whose entire body was deleted. An earlier
  // draft made that the corpus gate, which is to say the gate Plan 0 section 6
  // names as the thing no plan may merge without was testing nothing at all.
  //
  // The real property is: a round trip through an actual edit is byte-identical,
  // AND the intermediate genuinely differs. Both halves are needed -- a no-op
  // editJson satisfies the first on its own.
  //
  // What this gate does NOT prove: the container-skip fix (defect 2 -- an
  // object value that itself contains an array broke the old `close` logic).
  // Traced directly: that bug only triggers when valueEnd has to scan past an
  // OBJECT that contains an array somewhere inside it, and in every real
  // map.json and layouts.json in this corpus, every array-valued key (the
  // scalars before `music`, connections, object_events, the layouts array
  // itself, ...) is always the outer container at the point something is
  // skipped past it -- never an object wrapping an array. Arrays as the outer
  // container were never buggy (they already recognised both closers), so
  // this corpus, however many files it touches, cannot exercise that shape.
  // The only file in this whole corpus with an object-containing-array shape
  // is wild_encounters.json, which Task 26 reads, not this task. The
  // container-skip fix's only test coverage is the synthetic unit test in
  // jsonEdit.test.ts -- a green corpus gate here does not mean that fix is
  // corpus-proven, and this project has been bitten by exactly that kind of
  // assumption before.
  it.each(roots)("edits and restores every map.json in %s, byte for byte", (root) => {
    const paths = projectPaths(root);
    const names = mapNamesOf(root);
    const unchanged: string[] = [];
    const notRestored: string[] = [];
    let checked = 0;
    let nestedChecked = 0;

    for (const name of names) {
      const path = paths.mapJson(name);
      if (!existsSync(path)) continue;
      checked++;
      const src = readFileSync(path, "utf8");
      const parsed = JSON.parse(src) as { music: string; connections?: { offset: number }[] };
      const original = parsed.music;

      const edited = editJson(src, [{ path: ["music"], value: "MUS_PLACEHOLDER_XYZZY" }]);
      if (edited === src) unchanged.push(name);
      if (editJson(edited, [{ path: ["music"], value: original }]) !== src) notRestored.push(name);

      // `music` alone only ever proves the scanner can skip past a handful of
      // leading scalar keys -- see the file-level comment above for why it
      // (and every other real key in this corpus) never reaches the
      // container-skip shape. It also happens to precede `connections` in
      // every schema, so this second probe -- indexing into the connections
      // array and editing a field pretty-printed across multiple lines, a
      // formatting shape the unit tests never exercise -- adds real,
      // distinguishable coverage (multi-line nested objects at corpus scale).
      if (parsed.connections && parsed.connections.length > 0) {
        nestedChecked++;
        const off = parsed.connections[0]!.offset;
        const nestedEdited = editJson(src, [{ path: ["connections", 0, "offset"], value: off + 1000 }]);
        if (nestedEdited === src) unchanged.push(`${name} (nested)`);
        if (editJson(nestedEdited, [{ path: ["connections", 0, "offset"], value: off }]) !== src) {
          notRestored.push(`${name} (nested)`);
        }
      }
    }

    // Every map.json in all six configured engines carries a `music` key --
    // verified, 0 exceptions across 4,427 files -- so a skipped file means the
    // walk broke, not that the data varies.
    //
    // 4,427 is the filesystem total, not what this loop reaches: 5 map.json
    // files are absent from their tree's map_groups.json entirely -- 4 under
    // pokeemerald-expansion/data/maps ("...UnusedHouse..."-style stubs) and 1
    // under pokeclassic/data/maps (SafariZone_RestHouse) -- so `allMapNames()`
    // never yields them and `checked` tops out at 4,422 across all six
    // engines combined. That is true of parseMapGroups just as it was of
    // openProject's proj.mapNames() -- these files are missing from the group
    // data itself, not from any one loader -- so switching loaders here does
    // not recover them.
    expect(checked).toBeGreaterThan(400);
    // Most maps are fully enclosed interiors with no connections at all --
    // measured 8-15% across these six engines, not a majority -- so this is a
    // floor well under any engine's real count (lowest measured: 41, on
    // pokeclassic), not an expected proportion. If it ever drops to 0, the
    // nested probe above stopped running and "notRestored" staying empty
    // would be vacuous, not reassuring.
    expect(nestedChecked).toBeGreaterThan(30);
    expect(unchanged).toEqual([]);
    expect(notRestored).toEqual([]);
  }, 900_000);

  it.each(roots)("edits and restores layouts.json in %s, byte for byte", (root) => {
    const paths = projectPaths(root);
    const src = readFileSync(paths.layoutsJson, "utf8");
    const original = JSON.parse(src).layouts_table_label as string;

    const edited = editJson(src, [{ path: ["layouts_table_label"], value: "gPlaceholderXyzzy" }]);
    expect(edited).not.toBe(src);
    expect(editJson(edited, [{ path: ["layouts_table_label"], value: original }])).toBe(src);

    // And an edit deep inside the layouts array, at an index chosen to be
    // genuinely deep rather than accidentally trivial: index 0 (an earlier
    // draft's choice) requires enterIndex to skip past zero preceding
    // elements, so it never exercised the "skip past several sibling
    // objects" path this comment describes. Every configured engine has well
    // over 380 layouts (smallest measured: 383), so index 5 is safe
    // everywhere and actually walks past five preceding layout objects to
    // get there.
    const layouts = JSON.parse(src).layouts as { width: number }[];
    const targetIndex = 5;
    const width = layouts[targetIndex]!.width;
    const deep = editJson(src, [{ path: ["layouts", targetIndex, "width"], value: width + 1 }]);
    expect(deep).not.toBe(src);
    expect(editJson(deep, [{ path: ["layouts", targetIndex, "width"], value: width }])).toBe(src);
  }, 900_000);
});
