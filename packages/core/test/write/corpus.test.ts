import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { editJson } from "../../src/write/jsonEdit.js";
import { openProject } from "../../src/project.js";

const cfg = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as {
  projectPath: string; referenceProjects: string[];
};
const candidateRoots = [cfg.projectPath, ...cfg.referenceProjects].filter((r) => existsSync(`${r}/data/layouts/layouts.json`));

// Having a layouts.json is not sufficient to be opened: openProject also
// requires a tileset headers.h at a fixed modern-decomp path
// (src/data/tilesets/headers.h), and a checkout that predates that layout
// split throws ENOENT before this gate can test it at all. Verified: the
// configured pokeclassic checkout (github.com/danenders/pokeclassic,
// 2023-08-13) is exactly that -- an older fork with no
// porymap.project.cfg to point openProject elsewhere. That is a pre-existing
// gap in project.ts (an earlier task's loader), not something surgical-JSON
// editing should silently patch here. Rather than let the whole file crash
// with a raw ENOENT stack, or silently drop the engine from the corpus with
// no signal, the round-trip tests below run only over `roots` (engines that
// actually open), and the gap itself is pinned by name in a dedicated test
// so it cannot rot away unnoticed.
function canOpen(root: string): boolean {
  try { openProject(root); return true; } catch { return false; }
}
const roots = candidateRoots.filter(canOpen);
const unopenable = candidateRoots.filter((r) => !canOpen(r));

describe("identity corpus (invariant I5)", () => {
  it("has every reference engine available", () => {
    expect(candidateRoots.length).toBeGreaterThanOrEqual(5);
  });

  it("names any present engine that openProject cannot open, so the gap does not rot silently", () => {
    // A trip wire, not a design decision: if this list ever changes, either
    // project.ts gained support for pokeclassic's layout (update this test
    // and fold it back into the round trip below) or a previously-working
    // engine broke (a real regression to investigate).
    expect(unopenable.map((r) => r.split("/").pop())).toEqual(["pokeclassic"]);
  });

  // NOT `editJson(src, [])`. That returns `src` by an early return before any
  // parsing happens, so asserting it equals `src` is `expect(x).toBe(x)` -- it
  // would pass against an editJson whose body was deleted. An earlier draft
  // made that the corpus gate, which is to say the gate Plan 0 §6 names as the
  // thing no plan may merge without was testing nothing at all.
  //
  // The real property is: a round trip through an actual edit is byte-identical,
  // AND the intermediate genuinely differs. Both halves are needed -- a no-op
  // editJson satisfies the first on its own.
  it.each(roots)("edits and restores every map.json in %s, byte for byte", (root) => {
    const proj = openProject(root);
    const unchanged: string[] = [];
    const notRestored: string[] = [];
    let checked = 0;
    let nestedChecked = 0;

    for (const name of proj.mapNames()) {
      const path = proj.paths.mapJson(name);
      if (!existsSync(path)) continue;
      checked++;
      const src = readFileSync(path, "utf8");
      const parsed = JSON.parse(src) as { music: string; connections?: { offset: number }[] };
      const original = parsed.music;

      const edited = editJson(src, [{ path: ["music"], value: "MUS_PLACEHOLDER_XYZZY" }]);
      if (edited === src) unchanged.push(name);
      if (editJson(edited, [{ path: ["music"], value: original }]) !== src) notRestored.push(name);

      // `music` alone only ever proves the scanner can skip past a handful of
      // leading scalar keys -- every real map.json places `music` before its
      // first array, so this loop never calls valueEnd on an object that
      // contains an array (the exact shape defect 2 broke; verified directly,
      // see the task report). It also happens to precede `connections` in
      // every schema, so this second probe -- indexing into the connections
      // array and editing a field pretty-printed across multiple lines, a
      // formatting shape the unit tests never exercise -- adds real,
      // distinguishable coverage (multi-line nested objects at corpus scale),
      // even though it still cannot reach the object+array shape. That shape
      // occurs in this corpus nowhere but wild_encounters.json, which Task 26
      // reads, not this task.
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
    // walk broke, not that the data varies. Only five of those six engines
    // reach this loop; see the "does not rot silently" test above for why.
    expect(checked).toBeGreaterThan(400);
    // Most maps are fully enclosed interiors with no connections at all --
    // measured 12-15% across these five engines, not a majority -- so this is
    // a floor well under any engine's real count (lowest measured: 63), not
    // an expected proportion. If it ever drops to 0, the nested probe above
    // stopped running and "notRestored" staying empty would be vacuous, not
    // reassuring.
    expect(nestedChecked).toBeGreaterThan(50);
    expect(unchanged).toEqual([]);
    expect(notRestored).toEqual([]);
  }, 900_000);

  it.each(roots)("edits and restores layouts.json in %s, byte for byte", (root) => {
    const proj = openProject(root);
    const src = readFileSync(proj.paths.layoutsJson, "utf8");
    const original = JSON.parse(src).layouts_table_label as string;

    const edited = editJson(src, [{ path: ["layouts_table_label"], value: "gPlaceholderXyzzy" }]);
    expect(edited).not.toBe(src);
    expect(editJson(edited, [{ path: ["layouts_table_label"], value: original }])).toBe(src);

    // And an edit deep inside the layouts array, which requires skipping past
    // every preceding layout object to get there.
    const width = JSON.parse(src).layouts[0].width as number;
    const deep = editJson(src, [{ path: ["layouts", 0, "width"], value: width + 1 }]);
    expect(deep).not.toBe(src);
    expect(editJson(deep, [{ path: ["layouts", 0, "width"], value: width }])).toBe(src);
  }, 900_000);
});
