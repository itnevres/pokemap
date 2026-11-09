import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildEntryPointIndex, entryPointsFor, type EntryPointIndex } from "../../src/addEvent/entryPoints.js";
import * as sources from "../../src/addEvent/sources.js";
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
      const label = family === "gba"
        ? entryPointsFor(family, root!, map, original, index).find(name => name !== "0x0") ?? ""
        : "PokemapIndexStagedScript";
      expect(label).not.toBe("");
      const added = original + (family === "gbc"
        ? `\n${label}:\n\tend\n\tbg_event 0, 0, BGEVENT_READ, ${label}\n`
        : `\n${label}::\n\tend\n`);
      const removed = family === "gbc"
        ? added.replace(/^([ \t]*)(?:object_event|bg_event|coord_event)\b[^\r\n]*/gm, "$1; removed reference")
        : original + `\n${label}::\n\t.byte 0\n`;
      for (const text of [original, removed, added, original]) {
        expect(entryPointsFor(family, root!, map, text, index)).toEqual(entryPointsFor(family, root!, map, text));
      }
      // GBA eligibility comes from a disk map.json reference plus the staged body.
      expect(entryPointsFor(family, root!, map, added, index)).toContain(label);
      expect(entryPointsFor(family, root!, map, removed, index)).not.toContain(label);
    }, 30_000);
  });
}

it("GBC staged references replace only their own file and home definitions keep precedence across disk changes", () => {
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
    expect(entryPointsFor("gbc", root, "Own", staged, index)).toEqual(["NewScript", "ObjectEvent", "Shadowed"]);
    expect(entryPointsFor("gbc", root, "Own", staged, index)).toEqual(entryPointsFor("gbc", root, "Own", staged));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("GBA staged definitions override ordered disk definitions while references follow map.json disk changes", () => {
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
    expect(entryPointsFor("gba", root, "Own", staged, index)).toEqual(["0x0"]);
    expect(entryPointsFor("gba", root, "Own", staged, index)).toEqual(entryPointsFor("gba", root, "Own", staged));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it.each(["gba", "gbc"] as const)("%s refreshes removed renamed and added definitions without re-reading unchanged files", family => {
  const root = mkdtempSync(join(tmpdir(), "pokemap-entry-freshness-"));
  const reads = vi.spyOn(sources, "read");
  try {
    const dir = join(root, family === "gba" ? "data/maps/Other" : "home");
    mkdirSync(dir, { recursive: true });
    const labels = ["Removable", "OldLabel", "NewLabel", "AddedLabel"];
    let staged = "";
    if (family === "gba") {
      mkdirSync(join(root, "data/maps/Own"), { recursive: true });
      writeFileSync(join(root, "data/maps/Own/map.json"), JSON.stringify({ bg_events: labels.map(script => ({ script })) }));
    } else {
      mkdirSync(join(root, "maps"));
      staged = labels.map(label => `\tbg_event 0, 0, BGEVENT_READ, ${label}\n`).join("");
      writeFileSync(join(root, "maps/Own.asm"), staged);
    }
    const extension = family === "gba" ? ".inc" : ".asm";
    const removed = join(dir, `remove${extension}`), renamed = join(dir, `rename${extension}`), added = join(dir, `added${extension}`);
    const writeDefinition = (path: string, label: string) => {
      const timestamp = new Date((existsSync(path) ? statSync(path).mtimeMs : Date.now()) + 2000);
      writeFileSync(path, `${label}::\n\tend\n`);
      utimesSync(path, timestamp, timestamp);
    };
    writeDefinition(removed, "Removable"); writeDefinition(renamed, "OldLabel");
    const index = buildEntryPointIndex(family, root);
    const entries = () => entryPointsFor(family, root, "Own", staged, index);
    const fresh = () => entryPointsFor(family, root, "Own", staged);
    expect(entries()).toEqual(fresh()); expect(entries()).toContain("Removable"); expect(entries()).toContain("OldLabel");
    const previous = index.definitions.get(renamed);
    reads.mockClear(); entries();
    expect(reads).not.toHaveBeenCalled(); expect(index.definitions.get(renamed)).toBe(previous);
    rmSync(removed);
    reads.mockClear();
    expect(entries()).not.toContain("Removable"); expect(reads).not.toHaveBeenCalled();
    expect(index.signatures.has(removed)).toBe(false); expect(entries()).toEqual(fresh());
    writeDefinition(renamed, "NewLabel");
    reads.mockClear();
    const afterRename = entries();
    expect(afterRename).not.toContain("OldLabel"); expect(afterRename).toContain("NewLabel");
    expect(reads).toHaveBeenCalledTimes(1); expect(reads).toHaveBeenCalledWith(renamed);
    expect(entries()).toEqual(fresh());
    writeDefinition(added, "AddedLabel");
    reads.mockClear();
    expect(entries()).toContain("AddedLabel");
    expect(reads).toHaveBeenCalledTimes(1); expect(reads).toHaveBeenCalledWith(added);
    expect(entries()).toEqual(fresh());
    reads.mockClear(); entries(); expect(reads).not.toHaveBeenCalled();
  } finally { reads.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});

it.each(["Own", "Other"] as const)("GBC deferred errors match uncached behavior for a malformed %s map file", brokenMap => {
  const root = mkdtempSync(join(tmpdir(), "pokemap-entry-errors-"));
  try {
    mkdirSync(join(root, "maps"));
    const staged = "Foo:\n\tend\n\tbg_event 0, 0, BGEVENT_READ, Foo\n";
    writeFileSync(join(root, "maps/Own.asm"), staged);
    writeFileSync(join(root, "maps/Other.asm"), "");
    const index = buildEntryPointIndex("gbc", root);
    const path = join(root, `maps/${brokenMap}.asm`);
    const timestamp = new Date(statSync(path).mtimeMs + 2000);
    writeFileSync(path, "\tbg_event 0,, BGEVENT_READ, Foo\n");
    utimesSync(path, timestamp, timestamp);
    const indexed = () => entryPointsFor("gbc", root, "Own", staged, index);
    const uncached = () => entryPointsFor("gbc", root, "Own", staged);
    if (brokenMap === "Own") {
      expect(indexed).not.toThrow();
      expect(indexed()).toEqual(uncached()); expect(indexed()).toContain("Foo");
      expect(index.references.get(path)).toBeInstanceOf(Error);
      // Initial builds defer the same errors, too.
      expect(entryPointsFor("gbc", root, "Own", staged, buildEntryPointIndex("gbc", root))).toEqual(uncached());
    } else {
      const failure = (run: () => unknown): Error => {
        try { run(); } catch (error) { if (error instanceof Error) return error; throw error; }
        throw new Error("expected a malformed other-map error");
      };
      const expected = failure(uncached);
      expect(expected.message).toContain(`${path}: `); expect(expected.message).toMatch(/blank argument/);
      expect(failure(indexed).message).toBe(expected.message);
      const fresh = buildEntryPointIndex("gbc", root);
      expect(fresh.references.get(path)).toBeInstanceOf(Error);
      expect(failure(() => entryPointsFor("gbc", root, "Own", staged, fresh)).message).toBe(expected.message);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("a later refresh parse failure preserves all three published maps and a repaired retry succeeds", () => {
  const root = mkdtempSync(join(tmpdir(), "pokemap-entry-atomic-"));
  const reads = vi.spyOn(sources, "read");
  try {
    for (const name of ["A", "Z"]) mkdirSync(join(root, `data/maps/${name}`), { recursive: true });
    const first = join(root, "data/maps/A/map.json"), later = join(root, "data/maps/Z/map.json");
    const json = (label: string) => JSON.stringify({ bg_events: [{ script: label }] });
    writeFileSync(first, json("OldScript")); writeFileSync(later, "{}");
    writeFileSync(join(root, "data/scripts.inc"), "OldScript::\n\tend\nNewScript::\n\tend\n");
    const index = buildEntryPointIndex("gba", root);
    const previous = { references: index.references, definitions: index.definitions, signatures: index.signatures };
    const before = { references: [...index.references], definitions: [...index.definitions], signatures: [...index.signatures] };
    const writeChanged = (path: string, text: string) => {
      const timestamp = new Date(statSync(path).mtimeMs + 2000);
      writeFileSync(path, text); utimesSync(path, timestamp, timestamp);
    };
    writeChanged(first, json("NewScript")); writeChanged(later, "{");
    reads.mockClear();
    expect(() => entryPointsFor("gba", root, "Own", "", index)).toThrow(`${later}: `);
    expect(reads.mock.calls.map(([path]) => path)).toEqual([first, later]);
    expect(index.references).toBe(previous.references); expect([...index.references]).toEqual(before.references);
    expect(index.definitions).toBe(previous.definitions); expect([...index.definitions]).toEqual(before.definitions);
    expect(index.signatures).toBe(previous.signatures); expect([...index.signatures]).toEqual(before.signatures);
    writeChanged(later, "{}");
    reads.mockClear();
    expect(entryPointsFor("gba", root, "Own", "", index)).toEqual(["0x0", "NewScript"]);
    expect(reads.mock.calls.map(([path]) => path)).toEqual([first, later]);
    expect(index.references).not.toBe(previous.references); expect(index.signatures).not.toBe(previous.signatures);
    expect(entryPointsFor("gba", root, "Own", "", index)).toEqual(entryPointsFor("gba", root, "Own", ""));
  } finally { reads.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});

it("a transient read failure is retried on the next use, not cached", () => {
  const root = mkdtempSync(join(tmpdir(), "pokemap-entry-transient-"));
  const reads = vi.spyOn(sources, "read");
  try {
    mkdirSync(join(root, "data/maps/A"), { recursive: true });
    writeFileSync(join(root, "data/maps/A/map.json"), JSON.stringify({ bg_events: [{ script: "OldScript" }] }));
    const scripts = join(root, "data/scripts.inc");
    writeFileSync(scripts, "OldScript::\n\tend\n");
    reads.mockImplementationOnce(() => { throw new Error("EBUSY: resource busy"); });
    const index = buildEntryPointIndex("gba", root);
    expect(entryPointsFor("gba", root, "Own", "", index)).toEqual(entryPointsFor("gba", root, "Own", ""));
    expect(entryPointsFor("gba", root, "Own", "", index)).toContain("OldScript");
  } finally { reads.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});
