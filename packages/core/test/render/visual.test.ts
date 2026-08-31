import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { openProject } from "../../src/project.js";
import { renderLayout } from "../../src/render/layout.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);
const list = JSON.parse(readFileSync("fixtures/visual-list.json", "utf8")) as { maps: string[] };
const HASHES = "fixtures/visual-hashes.json";

describe("visual regression", () => {
  itWithCorpus("renders the fixed list to stable hashes", () => {
    const actual: Record<string, string> = {};
    for (const name of list.maps) {
      const r = renderLayout(proj, proj.layoutForMap(name).name, { border: 1 });
      actual[name] = createHash("sha256").update(Buffer.from(r.data)).digest("hex").slice(0, 16);
    }
    // If this test is RED, do not delete fixtures/visual-hashes.json.
    //
    // The branch below regenerates the baseline from whatever the renderer
    // currently does, and the run after that is green. So deleting the file
    // "fixes" a genuine rendering regression by promoting it to the reference
    // -- silently, and in a commit whose diff is six opaque hex strings that no
    // reviewer can evaluate. This harness exists to catch exactly the change
    // that deleting it would launder.
    //
    // A red result means one of two things. Either the renderer regressed, in
    // which case fix the renderer; or the change was deliberate, in which case
    // re-do Step 4 of Task 13 -- render the six maps, look at them, compare
    // NavelRock_Base and NavelRock_Bottom against the emulator screenshots in
    // the subject repo's tools/verify/scratch/mapshot/ -- and say in the commit
    // message what changed and why the new image is right. Regenerating is the
    // last step of that process, never the first.
    if (!existsSync(HASHES)) {
      writeFileSync(HASHES, JSON.stringify(actual, null, 2));
      throw new Error("baseline written; inspect the PNGs, then re-run to lock it in");
    }
    expect(actual).toEqual(JSON.parse(readFileSync(HASHES, "utf8")));
  });

  itWithCorpus("covers all three layout versions and a 3x2 border", () => {
    // Plan 0 §6 requires at least one emerald, one frlg, one hns and one 3x2
    // border. An earlier draft accepted "hns OR frlg", which would have passed
    // with frlg entirely uncovered. Assert each one separately so a failure
    // names the version that went missing.
    const layouts = list.maps.map((n) => proj.layoutForMap(n));
    const versions = new Set(layouts.map((l) => l.layoutVersion));

    expect(versions.has("emerald")).toBe(true);
    expect(versions.has("frlg")).toBe(true);
    expect(versions.has("hns")).toBe(true);

    // Not `?? "emerald"`. A tree whose layout_version keys Porymap has stripped
    // must fail this loudly rather than defaulting its way to green -- that
    // default is what made the earlier draft's assertion unfalsifiable.
    expect(layouts.every((l) => l.layoutVersion !== undefined)).toBe(true);

    expect(layouts.filter((l) => l.borderWidth === 3).length).toBeGreaterThanOrEqual(2);
  });
});
