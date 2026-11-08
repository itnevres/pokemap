import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildEntryPointIndex, entryPointsFor, type EntryPointIndex } from "../../src/addEvent/entryPoints.js";
import { subjectSnapshot } from "../helpers/subjectSnapshot.js";

const snapshot = subjectSnapshot();
for (const family of ["gba", "gbc"] as const) {
  const root = snapshot[family];
  const maps = family === "gba"
    ? ["Route101", "LittlerootTown", "OldaleTown", "Route102", "PetalburgCity"]
    : ["Route29", "Route30", "Route31", "NewBarkTown", "CherrygroveCity"];
  describe.skipIf(!root)(`${family} entry-point index on immutable subject maps`, () => {
    let index: EntryPointIndex;
    beforeAll(() => { index = buildEntryPointIndex(family, root!); });
    it.each(maps)("indexed entries equal uncached entries for %s and staged reference additions/removals", map => {
      const path = family === "gba" ? `data/maps/${map}/scripts.inc` : `maps/${map}.asm`;
      const original = readFileSync(join(root!, path), "utf8");
      const added = original + (family === "gbc"
        ? "\nPokemapIndexStagedScript:\n\tend\n\tbg_event 0, 0, BGEVENT_READ, PokemapIndexStagedScript\n"
        : "\nPokemapIndexStagedScript::\n\tend\n\tcall PokemapIndexStagedScript\n");
      const removed = added.replace(/^([ \t]*)(?:object_event|bg_event|coord_event|call)\b[^\r\n]*/gm, "$1; removed reference");
      for (const text of [original, added, removed, original]) {
        expect(entryPointsFor(family, root!, map, text, index)).toEqual(entryPointsFor(family, root!, map, text));
      }
      if (family === "gbc") {
        expect(entryPointsFor(family, root!, map, added, index)).toContain("PokemapIndexStagedScript");
        expect(entryPointsFor(family, root!, map, removed, index)).not.toContain("PokemapIndexStagedScript");
      } else {
        // GBA references come from disk map.json, never from script call instructions.
        expect(entryPointsFor(family, root!, map, added, index)).not.toContain("PokemapIndexStagedScript");
      }
    }, 30_000);
  });
}

it("GBC staged references replace only their own file and home definitions keep precedence without disk reads", () => {
  const root = mkdtempSync(join(tmpdir(), "pokemap-entry-index-"));
  try {
    mkdirSync(join(root, "maps")); mkdirSync(join(root, "home"));
    const ref = (name: string) => `\tbg_event 0, 0, BGEVENT_READ, ${name}\n`;
    const own = "OwnOnly:\n\tend\nShared:\n\tend\n" + ref("OwnOnly") + ref("Shared");
    writeFileSync(join(root, "maps/Own.asm"), own);
    writeFileSync(join(root, "maps/Other.asm"), ref("Shared") + ref("HomeScript") + ref("Foreign"));
    writeFileSync(join(root, "home/events.asm"), "HomeScript::\n\tend\nShadowed::\n\tdb 0\n");
    const index = buildEntryPointIndex("gbc", root);
    const staged = "OwnOnly:\n\tend\nShared:\n\tend\nNewScript:\n\tend\nShadowed:\n\tend\n" + ref("NewScript") + ref("Shadowed");
    const expected = ["HomeScript", "NewScript", "ObjectEvent", "Shared"];
    expect(entryPointsFor("gbc", root, "Own", staged)).toEqual(expected);
    expect(entryPointsFor("gbc", root, "Own", staged, index)).toEqual(expected);
    // No current-map file on disk is required for a staged-only map.
    expect(entryPointsFor("gbc", root, "Unsaved", staged, index)).toEqual(entryPointsFor("gbc", root, "Unsaved", staged));
    rmSync(join(root, "maps"), { recursive: true }); rmSync(join(root, "home"), { recursive: true });
    expect(entryPointsFor("gbc", root, "Own", staged, index)).toEqual(expected);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("GBA staged definitions override ordered disk definitions while references stay in map.json without disk reads", () => {
  const root = mkdtempSync(join(tmpdir(), "pokemap-entry-index-"));
  try {
    mkdirSync(join(root, "data/maps/Own"), { recursive: true });
    writeFileSync(join(root, "data/maps/Own/map.json"), JSON.stringify({
      object_events: [{ script: "NewScript" }], coord_events: [{ script: "Shared" }], bg_events: [{ script: "RemovedScript" }],
    }));
    writeFileSync(join(root, "data/a.inc"), "Shared::\n\t.byte 0\nRemovedScript::\n\tend\n");
    writeFileSync(join(root, "data/z.s"), "Shared::\n\tend\n");
    const index = buildEntryPointIndex("gba", root);
    const staged = "NewScript::\n\tend\nRemovedScript::\n\t.byte 0\nUnreferenced::\n\tend\n";
    const expected = ["0x0", "NewScript", "Shared"];
    expect(entryPointsFor("gba", root, "Own", staged)).toEqual(expected);
    expect(entryPointsFor("gba", root, "Own", staged, index)).toEqual(expected);
    expect(entryPointsFor("gba", root, "Own", "", index)).toEqual(["0x0", "RemovedScript", "Shared"]);
    rmSync(join(root, "data"), { recursive: true });
    expect(entryPointsFor("gba", root, "Own", staged, index)).toEqual(expected);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
