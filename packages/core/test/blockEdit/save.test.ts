import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  checkTilesetBaselines, gbaTilesetEffects, gbcTilesetEffects, mergeTilesetEdits, tilesetSaveChanges,
} from "../../src/blockEdit/save.js";
import { canonicalTilesetPath } from "../../src/blockEdit/canonicalTilesetPath.js";
import { BlockEditRefusal, type TilesetFileEdit } from "../../src/blockEdit/types.js";
import { openProject, type Project } from "../../src/project.js";
import { openGbcProject, type GbcProject } from "../../src/gbc/project.js";
import { parseBlocks } from "../../src/load/blocks.js";
import {
  commitSave, planSave, prepareSave, type EditSession, type PendingChange,
} from "../../src/write/save.js";
import {
  commitGbcSave, openGbcEditSession, planGbcSave, prepareGbcSave,
} from "../../src/gbc/write/save.js";
import { planFingerprint, type AtomicEntry, type AtomicIo } from "../../src/write/atomic.js";
import type { Refusal } from "../../src/write/guards.js";
import { itWithCorpus } from "../helpers/corpus.js";
import { copyGbaTilesetProject, removeGbaTemp } from "../helpers/gbaTilesetProject.js";
import { copyGbcSubjectToTemp, itWithGbcCorpus, removeTemp } from "../gbc/helpers/corpus.js";

// All disk writes in this file target either these disposable roots or copies
// returned by the family's established corpus-copy helper.
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function unitRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "pokemap-task8-unit-"));
  cleanups.push(() => removeTemp(root));
  return root;
}

function fileEdit(path: string, before = "baseline", after = "staged"): TilesetFileEdit {
  return { path, before: Buffer.from(before), after: Buffer.from(after) };
}

function changedBytes(before: Buffer): Buffer {
  expect(before.length, "fixture tileset file must have bytes to change").toBeGreaterThan(0);
  const after = Buffer.from(before);
  after[after.length - 1] = after[after.length - 1]! ^ 1;
  return after;
}

function stagedFile(root: string, path: string): TilesetFileEdit {
  const before = readFileSync(resolve(root, path));
  const after = path.endsWith(".asm")
    ? Buffer.concat([before, Buffer.from("\n; Task 8 staged tileset edit\n")])
    : changedBytes(before);
  return { path, before, after };
}

function caught(run: () => void): Error {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return error as Error;
  }
  throw new Error("Expected an error, but the operation succeeded");
}

function expectBlockRefusal(run: () => void, code: string, path: string): void {
  const error = caught(run);
  expect(error).toBeInstanceOf(BlockEditRefusal);
  expect((error as BlockEditRefusal).code).toBe(code);
  expect(error.message.startsWith(path)).toBe(true);
  expect(error.message).toBe(`${path}: changed on disk since the block edit was staged`);
}

describe("Task 8 mergeTilesetEdits", () => {
  it("keeps the first baseline through three merges and takes the latest after", () => {
    const first = Object.freeze(fileEdit("data/tilesets/a.bin", "very first", "one"));
    const second = Object.freeze(fileEdit(first.path, "intermediate baseline", "two"));
    const third = Object.freeze(fileEdit(first.path, "latest baseline", "three"));
    const one = mergeTilesetEdits(undefined, [first]);
    const two = mergeTilesetEdits(one, [second]);
    const three = mergeTilesetEdits(two, [third]);
    expect(three).toHaveLength(1);
    expect(three[0]!.path).toBe(first.path);
    expect(three[0]!.before).toBe(first.before);
    expect(three[0]!.after).toBe(third.after);
    expect(two[0]!.before).toBe(first.before);
    expect(two[0]!.after).toBe(second.after);
    expect(one[0]!.after).toBe(first.after);
    expect(first.before.toString()).toBe("very first");
    expect(first.after.toString()).toBe("one");
    expect(second.before.toString()).toBe("intermediate baseline");
    expect(second.after.toString()).toBe("two");
    expect(third.before.toString()).toBe("latest baseline");
    expect(third.after.toString()).toBe("three");
  });

  it("keeps prior-only paths, takes next-only paths, sorts, and never mutates inputs", () => {
    const z = fileEdit("z.bin");
    const a = fileEdit("a.bin");
    const m = fileEdit("m.bin");
    const prior = Object.freeze([z, m]);
    const next = Object.freeze([a]);
    const snapshots = [...prior, ...next].map((edit) => ({
      edit, path: edit.path, before: Buffer.from(edit.before), after: Buffer.from(edit.after),
    }));
    const merged = mergeTilesetEdits(prior, next);
    expect(merged).toEqual([a, m, z]);
    expect(merged).not.toBe(prior);
    expect(merged).not.toBe(next);
    expect(prior).toEqual([z, m]);
    expect(next).toEqual([a]);
    for (const snapshot of snapshots) {
      expect(snapshot.edit).toEqual({
        path: snapshot.path, before: snapshot.before, after: snapshot.after,
      });
      const result = merged.find((edit) => edit.path === snapshot.path)!;
      expect(result.before).toBe(snapshot.edit.before);
      expect(result.after).toBe(snapshot.edit.after);
    }
  });

  it("sorts an undefined prior into a new array and keeps restored entries", () => {
    const z = fileEdit("z.bin");
    const restored = fileEdit("a.bin", "same", "same");
    const next = [z, restored];
    const merged = mergeTilesetEdits(undefined, next);
    expect(merged).toEqual([restored, z]);
    expect(merged).not.toBe(next);
    expect(next).toEqual([z, restored]);
    expect(merged[0]!.before).toBe(restored.before);
    expect(merged[0]!.after).toBe(restored.after);
    const inverse = mergeTilesetEdits([z], [{ ...z, after: Buffer.from(z.before) }]);
    expect(inverse).toHaveLength(1);
    expect(inverse[0]!.before).toBe(z.before);
    expect(inverse[0]!.after).toEqual(z.before);
  });

  it("refuses a non-canonical path with BAD_VALUE", () => {
    const error = caught(() => mergeTilesetEdits(undefined, [fileEdit("./data/tilesets/a.bin")]));
    expect(error).toBeInstanceOf(BlockEditRefusal);
    expect((error as BlockEditRefusal).code).toBe("BAD_VALUE");
    expect(error.message).toBe("./data/tilesets/a.bin: not a canonical repo-relative tileset path");
  });

  it("refuses a canonical path that leaves the project (../, absolute, drive letter) with BAD_VALUE", () => {
    for (const path of ["../x.bin", "../../outside/x.bin", "/abs/x.bin", "C:/x.bin"]) {
      const error = caught(() => mergeTilesetEdits(undefined, [fileEdit(path)]));
      expect(error, path).toBeInstanceOf(BlockEditRefusal);
      expect((error as BlockEditRefusal).code, path).toBe("BAD_VALUE");
      expect(error.message, path).toBe(`${path}: path leaves the project`);
    }
  });

  for (const duplicateIn of ["prior", "next"] as const) {
    it(`refuses a duplicate path inside ${duplicateIn} with BAD_VALUE`, () => {
      const edit = fileEdit("data/tilesets/duplicate.bin");
      const duplicates = [edit, { ...edit, after: Buffer.from("newer") }];
      const error = caught(() => mergeTilesetEdits(
        duplicateIn === "prior" ? duplicates : undefined,
        duplicateIn === "next" ? duplicates : [],
      ));
      expect(error).toBeInstanceOf(BlockEditRefusal);
      expect((error as BlockEditRefusal).code).toBe("BAD_VALUE");
      expect(error.message).toBe(`${edit.path}: more than one staged edit`);
    });
  }
});

describe("Task 8 tilesetSaveChanges", () => {
  it("states the map count with a singular for one map and a plural otherwise", () => {
    const root = resolve("/repo");
    expect(tilesetSaveChanges(root, [
      { path: "a.bin", maps: [] }, { path: "b.bin", maps: ["X"] }, { path: "c.asm", maps: ["X", "Y"] },
    ])).toEqual([
      { path: resolve(root, "a.bin"), kind: "binary", summary: "a.bin -- tileset file edited (0 maps)" },
      { path: resolve(root, "b.bin"), kind: "binary", summary: "b.bin -- tileset file edited (1 map)" },
      { path: resolve(root, "c.asm"), kind: "text", summary: "c.asm -- tileset file edited (2 maps)" },
    ]);
  });
});

describe("Task 8 checkTilesetBaselines", () => {
  it("accepts disk bytes equal to the baseline without writing", () => {
    const root = unitRoot();
    const edit = fileEdit("nested/a.bin");
    const path = resolve(root, edit.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, edit.before);
    expect(() => checkTilesetBaselines(root, [edit])).not.toThrow();
    expect(readFileSync(path)).toEqual(edit.before);
    expect(readdirSync(dirname(path))).toEqual(["a.bin"]);
  });

  it("refuses changed disk bytes with FILE_CHANGED and the repo-relative path", () => {
    const root = unitRoot();
    const edit = fileEdit("a.bin");
    const outside = Buffer.from("outside edit");
    writeFileSync(resolve(root, edit.path), outside);
    expectBlockRefusal(() => checkTilesetBaselines(root, [edit]), "FILE_CHANGED", edit.path);
    expect(readFileSync(resolve(root, edit.path))).toEqual(outside);
  });

  it("refuses a missing file with FILE_CHANGED", () => {
    const root = unitRoot();
    const edit = fileEdit("missing.bin");
    expectBlockRefusal(() => checkTilesetBaselines(root, [edit]), "FILE_CHANGED", edit.path);
    expect(existsSync(resolve(root, edit.path))).toBe(false);
  });

  it("refuses an unreadable file target with FILE_CHANGED", () => {
    const root = unitRoot();
    const edit = fileEdit("directory.bin");
    // A directory is deterministically unreadable as a Buffer on Windows and
    // Linux; permission bits would be unreliable under elevated test runners.
    mkdirSync(resolve(root, edit.path));
    expectBlockRefusal(() => checkTilesetBaselines(root, [edit]), "FILE_CHANGED", edit.path);
  });

  it("skips a restored edit even when its disk bytes differ or its file is missing", () => {
    const root = unitRoot();
    const restored = fileEdit("restored.bin", "baseline", "baseline");
    writeFileSync(resolve(root, restored.path), "external");
    expect(() => checkTilesetBaselines(root, [restored])).not.toThrow();
    expect(() => checkTilesetBaselines(root, [
      fileEdit("missing.bin", "same", "same"),
    ])).not.toThrow();
    expect(readFileSync(resolve(root, restored.path))).toEqual(Buffer.from("external"));
  });

  it("names the alphabetically first mismatching path regardless of input order", () => {
    const root = unitRoot();
    const z = fileEdit("z.bin");
    const a = fileEdit("a.bin");
    writeFileSync(resolve(root, z.path), "external z");
    writeFileSync(resolve(root, a.path), "external a");
    expectBlockRefusal(() => checkTilesetBaselines(root, [z, a]), "FILE_CHANGED", a.path);
  });
});

// Independent map -> tileset -> canonical file scans. Do not use usage.ts or
// the effects functions to construct expected maps.
function expectedGbaMaps(proj: Project, path: string): string[] {
  const symbols = new Set(proj.tilesetSymbols().filter((symbol) => {
    const files = proj.tilesetPaths(symbol);
    return [files.metatilesBin, files.attributesBin]
      .some((file) => canonicalTilesetPath(file) === path);
  }));
  return [...new Set(proj.mapNames().filter((name) => {
    const layout = proj.layoutForMap(name);
    return symbols.has(layout.primaryTileset) || symbols.has(layout.secondaryTileset);
  }))].sort();
}

function expectedGbcMaps(proj: GbcProject, path: string): string[] {
  return [...new Set(proj.maps.filter((map) => {
    const tileset = proj.tileset(map.tileset);
    return [tileset.metatilesPath, tileset.collisionPath, tileset.palMapPath, tileset.gfxPath]
      .some((file) => canonicalTilesetPath(file) === path);
  }).map((map) => map.name))].sort();
}

interface ContractPlan {
  changes: PendingChange[];
  refusals: Refusal[];
  tilesetEffects: { path: string; maps: string[] }[];
}

interface SaveFixture {
  root: string;
  mapName: string;
  grid: string;
  expectedGrid: Buffer;
  edits: TilesetFileEdit[];
  session: { tilesetEdits?: TilesetFileEdit[] };
  mapsFor(path: string): string[];
  effects(edits: readonly TilesetFileEdit[]): { path: string; maps: string[] }[];
  plan(): ContractPlan;
  prepare(): AtomicEntry[];
  commit(plan: ContractPlan, entries?: AtomicEntry[], io?: AtomicIo): void;
}

function gbaFixture(): SaveFixture {
  const root = copyGbaTilesetProject().replace(/\\/g, "/");
  cleanups.push(() => removeGbaTemp(root));
  const proj = openProject(root);
  // Choose by on-disk map/layout data, never by a save planner's answer.
  const findPaintableMap = () => {
    for (const name of proj.mapNames()) {
      const layout = proj.layoutForMap(name);
      if (proj.profile.supportsLayoutVersion && !layout.layoutVersion) continue;
      const map = proj.map(name);
      const grid = resolve(root, layout.blockdataFilepath);
      const disk = readFileSync(grid);
      const blocks = parseBlocks(disk, proj.profile);
      const border = parseBlocks(readFileSync(resolve(root, layout.borderFilepath)), proj.profile);
      if (border.length !== layout.borderWidth * layout.borderHeight) continue;
      const split = proj.splitFor(layout).metatiles;
      const primaryCount = proj.tileset(layout.primaryTileset).metatileCount;
      const ceiling = Math.min(
        split + proj.tileset(layout.secondaryTileset).metatileCount,
        proj.constants.metatilesTotal,
      );
      if (blocks.some((block) => block.metatileId < split
        ? block.metatileId >= primaryCount : block.metatileId >= ceiling)) continue;
      const warpCells = new Set(map.warpEvents.map((warp) => warp.y * layout.width + warp.x));
      const index = blocks.findIndex((block, i) => i < layout.width * layout.height
        && !warpCells.has(i) && blocks.some((other) => other.metatileId !== block.metatileId));
      if (index < 0) continue;
      const id = blocks.find((block) => block.metatileId !== blocks[index]!.metatileId)!.metatileId;
      return { name, layout, map, grid, disk, blocks, border, index, id };
    }
    return undefined;
  };
  const found = findPaintableMap();
  expect(found, "GBA map with a valid layout and a non-warp cell paintable with an existing id").toBeDefined();
  const f = found!;
  const session: EditSession = {
    mapName: f.name, layout: f.layout, blocks: f.blocks.map((block) => ({ ...block })),
    border: f.border.map((block) => ({ ...block })), map: structuredClone(f.map),
    originalBlocks: f.blocks.map((block) => ({ ...block })), originalMap: structuredClone(f.map),
    originalMapJson: readFileSync(proj.paths.mapJson(f.name), "utf8"),
    jsonEdits: [], insertOps: [], removeOps: [], isDirty: true,
  };
  session.blocks[f.index]!.metatileId = f.id;
  // Oracle patches one raw word, preserving collision/elevation and every tail
  // byte. No production encoder or write planner supplies expected bytes.
  const expectedGrid = Buffer.from(f.disk);
  const word = expectedGrid.readUInt16LE(f.index * 2);
  expectedGrid.writeUInt16LE((word & ~proj.profile.blockMetatileIdMask) | f.id, f.index * 2);
  const paths = [
    canonicalTilesetPath(proj.tilesetPaths(f.layout.primaryTileset).metatilesBin),
    canonicalTilesetPath(proj.tilesetPaths(f.layout.secondaryTileset).attributesBin),
  ];
  expect(new Set(paths).size).toBe(2);
  const edits = paths.map((path) => stagedFile(root, path));
  session.tilesetEdits = edits;
  return {
    root, mapName: f.name, grid: f.grid, expectedGrid, edits, session,
    mapsFor: (path) => expectedGbaMaps(proj, path),
    effects: (files) => gbaTilesetEffects(proj, files),
    plan: () => planSave(proj, session),
    prepare: () => prepareSave(proj, session),
    commit: (plan, entries, io) => commitSave(
      proj, plan as ReturnType<typeof planSave>, entries, io,
    ),
  };
}

function gbcFixture(): SaveFixture {
  const root = copyGbcSubjectToTemp().replace(/\\/g, "/");
  cleanups.push(() => removeTemp(root));
  const proj = openGbcProject(root);
  const map = proj.maps.find((candidate) => candidate.name === "Route29");
  expect(map, "GBC Route29 corpus map").toBeDefined();
  const session = openGbcEditSession(proj, map!.name);
  const cap = proj.tileset(map!.tileset).metatiles.length;
  expect(cap).toBeGreaterThan(1);
  expect(session.blocks.length).toBeGreaterThan(0);
  const id = session.blocks[0]!.metatileId === 1 ? 2 : 1;
  expect(id).toBeLessThan(cap);
  session.blocks[0]!.metatileId = id;
  session.isDirty = true;
  const grid = resolve(root, session.layout.blkPath);
  const expectedGrid = Buffer.from(readFileSync(grid));
  expectedGrid[0] = id;
  const tileset = proj.tileset(map!.tileset);
  const edits = [tileset.metatilesPath, tileset.collisionPath]
    .map((path) => stagedFile(root, canonicalTilesetPath(path)));
  session.tilesetEdits = edits;
  return {
    root, mapName: map!.name, grid, expectedGrid, edits, session,
    mapsFor: (path) => expectedGbcMaps(proj, path),
    effects: (files) => gbcTilesetEffects(proj, files),
    plan: () => planGbcSave(proj, session),
    prepare: () => prepareGbcSave(proj, session),
    commit: (plan, entries, io) => commitGbcSave(
      proj, plan as ReturnType<typeof planGbcSave>, entries, io,
    ),
  };
}

function expectedEffects(f: SaveFixture, edits = f.session.tilesetEdits ?? []) {
  return edits.filter((edit) => !edit.after.equals(edit.before))
    .map((edit) => ({ path: edit.path, maps: f.mapsFor(edit.path) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function targets(f: SaveFixture): string[] {
  return [f.grid, ...(f.session.tilesetEdits ?? []).map((edit) => resolve(f.root, edit.path))];
}

function diskSnapshot(f: SaveFixture): Map<string, Buffer> {
  return new Map(targets(f).map((path) => [path, readFileSync(path)]));
}

function expectDiskUnchanged(snapshot: Map<string, Buffer>): void {
  for (const [path, bytes] of snapshot) expect(readFileSync(path), path).toEqual(bytes);
}

function expectNoTemps(f: SaveFixture): void {
  for (const dir of new Set(targets(f).map(dirname))) {
    expect(readdirSync(dir).filter((name) => name.includes(".pokemap-tmp-")), dir).toEqual([]);
  }
}

function sessionSnapshot(f: SaveFixture) {
  const array = f.session.tilesetEdits!;
  return {
    array,
    values: array.map((edit) => ({
      path: edit.path, before: Buffer.from(edit.before), after: Buffer.from(edit.after),
    })),
    refs: array.map((edit) => ({ before: edit.before, after: edit.after })),
  };
}

function expectSessionIntact(f: SaveFixture, snapshot: ReturnType<typeof sessionSnapshot>): void {
  expect(f.session.tilesetEdits).toBe(snapshot.array);
  expect(f.session.tilesetEdits).toEqual(snapshot.values);
  f.session.tilesetEdits!.forEach((edit, i) => {
    expect(edit.before).toBe(snapshot.refs[i]!.before);
    expect(edit.after).toBe(snapshot.refs[i]!.after);
  });
}

const realIo: AtomicIo = { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync };
const families = [
  { name: "GBA", test: itWithCorpus, fixture: gbaFixture },
  { name: "GBC", test: itWithGbcCorpus, fixture: gbcFixture },
];

for (const family of families) {
  describe(`Task 8 ${family.name} tileset save integration`, () => {
    family.test("effects include primary metatiles / secondary attributes or GBC file consumers, sorted", () => {
      const f = family.fixture();
      const restored = fileEdit("unused-restored.bin", "same", "same");
      const orphan = fileEdit("unused-edited.bin");
      const edits = [restored, orphan, ...f.edits.slice().reverse()];
      const expected = expectedEffects(f, edits);
      for (const edit of f.edits) expect(f.mapsFor(edit.path).length).toBeGreaterThan(0);
      expect(f.effects(edits)).toEqual(expected);
      expect(expected).toContainEqual({ path: orphan.path, maps: [] });
      expect(expected.some((effect) => effect.path === restored.path)).toBe(false);
    }, 120_000);

    family.test("plan lists tileset changes with tilesetEffects naming the maps without writing", () => {
      const f = family.fixture();
      // Reverse session order to make path ordering observable.
      f.session.tilesetEdits = f.edits.slice().sort((a, b) => b.path.localeCompare(a.path));
      const before = diskSnapshot(f);
      const plan = f.plan();
      expect(plan.refusals).toEqual([]);
      const effects = expectedEffects(f);
      expect(plan.tilesetEffects).toEqual(effects);
      expect(plan.changes.map((change) => resolve(change.path))).toEqual([
        f.grid, ...effects.map((effect) => resolve(f.root, effect.path)),
      ]);
      for (const effect of effects) {
        const count = effect.maps.length;
        expect(plan.changes.find((change) => change.path === resolve(f.root, effect.path))).toEqual({
          path: resolve(f.root, effect.path),
          kind: effect.path.endsWith(".asm") ? "text" : "binary",
          summary: `${effect.path} -- tileset file edited (${count} map${count === 1 ? "" : "s"})`,
        });
      }
      if (family.name === "GBC") {
        expect(plan.changes.filter((change) => resolve(change.path) !== f.grid)
          .map((change) => change.kind).sort())
          .toEqual(["binary", "text"]);
      }
      expectDiskUnchanged(before);
      expectNoTemps(f);
    }, 120_000);

    family.test("plan after an external edit returns a file-changed-on-disk refusal without throwing or writing", () => {
      const f = family.fixture();
      const edit = f.edits[0]!;
      writeFileSync(resolve(f.root, edit.path), Buffer.from("external bytes"));
      const before = diskSnapshot(f);
      let plan: ContractPlan | undefined;
      expect(() => { plan = f.plan(); }).not.toThrow();
      expect(plan!.refusals.filter((refusal) => refusal.code === "file-changed-on-disk")).toEqual([{
        code: "file-changed-on-disk", subject: edit.path, path: edit.path,
        message: `${edit.path} changed on disk since the block edit was staged.`,
        fix: "Reopen the map before saving.",
      }]);
      // S8: prepare must retain the owner's baseline even if disk has drifted.
      // A fresh-read `before` would silently fingerprint the outside edit.
      const target = resolve(f.root, edit.path);
      const preparedTargets = f.prepare().filter((entry) => resolve(entry.path) === target);
      expect(preparedTargets).toEqual([{
        path: target, before: edit.before, after: edit.after,
      }]);
      expectDiskUnchanged(before);
      expectNoTemps(f);
    }, 120_000);

    family.test("commit writes grid + tileset files in one atomic set and leaves the session intact", () => {
      const f = family.fixture();
      f.session.tilesetEdits = f.edits.slice().reverse();
      const snapshot = sessionSnapshot(f);
      const before = diskSnapshot(f);
      const entries = f.prepare();
      const edits = f.edits.slice().sort((a, b) => a.path < b.path ? -1 : 1);
      expect(entries.map((entry) => resolve(entry.path))).toEqual([
        f.grid, ...edits.map((edit) => resolve(f.root, edit.path)),
      ]);
      expect(entries[0]!.after).toEqual(f.expectedGrid);
      expect(entries.slice(1)).toEqual(edits.map((edit) => ({
        path: resolve(f.root, edit.path), before: edit.before, after: edit.after,
      })));
      expectDiskUnchanged(before);
      const calls: { kind: "write" | "rename"; path: string }[] = [];
      const io: AtomicIo = {
        ...realIo,
        writeFileSync(path, bytes, options) {
          calls.push({ kind: "write", path });
          writeFileSync(path, bytes, options);
        },
        renameSync(from, to) {
          calls.push({ kind: "rename", path: resolve(to) });
          renameSync(from, to);
        },
      };
      const plan = f.plan();
      expect(plan.refusals).toEqual([]);
      f.commit(plan, entries, io);
      expect(readFileSync(f.grid)).toEqual(f.expectedGrid);
      for (const edit of f.edits) expect(readFileSync(resolve(f.root, edit.path))).toEqual(edit.after);
      const firstRename = calls.findIndex((call) => call.kind === "rename");
      expect(firstRename).toBe(entries.length);
      expect(calls.slice(0, firstRename).every((call) =>
        call.kind === "write" && call.path.includes(".pokemap-tmp-"))).toBe(true);
      expect(calls.slice(firstRename)).toEqual(entries.map((entry) => ({
        kind: "rename", path: resolve(entry.path),
      })));
      expectSessionIntact(f, snapshot);
      expectNoTemps(f);
    }, 120_000);

    for (const supplied of [true, false]) {
      family.test(`plan -> external edit -> commit refuses FILE_CHANGED (prepared=${supplied}) and writes nothing`, () => {
        const f = family.fixture();
        const plan = f.plan();
        expect(plan.refusals).toEqual([]);
        const prepared = f.prepare();
        const edit = f.edits[0]!;
        writeFileSync(resolve(f.root, edit.path), Buffer.from("external after preview"));
        const before = diskSnapshot(f);
        const snapshot = sessionSnapshot(f);
        let ioCalls = 0;
        const noIo = (): never => {
          ioCalls++;
          throw new Error("atomic IO reached before tileset baseline refusal");
        };
        const io: AtomicIo = {
          existsSync: noIo, readFileSync: noIo, writeFileSync: noIo,
          renameSync: noIo, unlinkSync: noIo,
        };
        expectBlockRefusal(
          () => f.commit(plan, supplied ? prepared : undefined, io), "FILE_CHANGED", edit.path,
        );
        expect(ioCalls).toBe(0);
        expectDiskUnchanged(before);
        expectSessionIntact(f, snapshot);
        expectNoTemps(f);
      }, 120_000);
    }

    for (const problem of ["missing", "duplicate", "stale prepared entry", "wrong before", "null before"] as const) {
      family.test(`${problem} refuses with the map and tileset path and writes nothing`, () => {
        const f = family.fixture();
        const plan = f.plan();
        expect(plan.refusals).toEqual([]);
        let entries = f.prepare();
        const edit = f.edits[0]!;
        const target = resolve(f.root, edit.path);
        const entry = entries.find((candidate) => resolve(candidate.path) === target);
        expect(entry, "prepared entry for the staged tileset file").toBeDefined();
        if (problem === "missing") {
          entries = entries.filter((candidate) => resolve(candidate.path) !== target);
        } else if (problem === "duplicate") {
          entries = [...entries, { ...entry! }];
        } else if (problem === "stale prepared entry") {
          f.session.tilesetEdits = mergeTilesetEdits(f.session.tilesetEdits, [{
            path: edit.path, before: edit.before, after: Buffer.concat([edit.after, Buffer.from([42])]),
          }]);
        } else {
          entries = entries.map((candidate) => resolve(candidate.path) !== target ? candidate : {
            ...candidate, before: problem === "null before" ? null : Buffer.from("wrong baseline"),
          });
        }
        const before = diskSnapshot(f);
        const snapshot = sessionSnapshot(f);
        const error = caught(() => f.commit(plan, entries));
        expect(error.message).toMatch(/tileset edit missing or stale in prepared save/);
        expect(error.message).toBe(
          `save refused: ${f.mapName}: ${edit.path}: tileset edit missing or stale in prepared save`,
        );
        expectDiskUnchanged(before);
        expectSessionIntact(f, snapshot);
        expectNoTemps(f);
      }, 120_000);
    }

    family.test("a stale prepared entry is reported before an external edit (S9 order)", () => {
      const f = family.fixture();
      const plan = f.plan();
      expect(plan.refusals).toEqual([]);
      const entries = f.prepare();
      const edit = f.edits[0]!;
      f.session.tilesetEdits = mergeTilesetEdits(f.session.tilesetEdits, [{
        path: edit.path, before: edit.before, after: Buffer.concat([edit.after, Buffer.from([7])]),
      }]);
      writeFileSync(resolve(f.root, edit.path), Buffer.from("external bytes"));
      const before = diskSnapshot(f);
      const error = caught(() => f.commit(plan, entries));
      expect(error).not.toBeInstanceOf(BlockEditRefusal);
      expect(error.message).toBe(
        `save refused: ${f.mapName}: ${edit.path}: tileset edit missing or stale in prepared save`,
      );
      expectDiskUnchanged(before);
      expectNoTemps(f);
    }, 120_000);

    family.test("a failed atomic write rolls back the second rename and keeps disk and session intact", () => {
      const f = family.fixture();
      const plan = f.plan();
      expect(plan.refusals).toEqual([]);
      const entries = f.prepare();
      expect(entries).toHaveLength(3);
      const before = diskSnapshot(f);
      const snapshot = sessionSnapshot(f);
      let renames = 0;
      const io: AtomicIo = {
        ...realIo,
        renameSync(from, to) {
          if (++renames === 2) {
            expect(readFileSync(f.grid)).toEqual(f.expectedGrid);
            throw new Error("Task 8 injected second rename failure");
          }
          renameSync(from, to);
        },
      };
      expect(() => f.commit(plan, entries, io)).toThrow("Task 8 injected second rename failure");
      expect(renames).toBe(2);
      expectDiskUnchanged(before);
      expectSessionIntact(f, snapshot);
      expectNoTemps(f);
    }, 120_000);

    family.test("a restored edit has no change, effect, prepared entry or baseline requirement", () => {
      const f = family.fixture();
      const changed = f.edits[0]!;
      const original = f.edits[1]!;
      const restored = { ...original, after: Buffer.from(original.before) };
      f.session.tilesetEdits = [restored, changed];
      const target = resolve(f.root, restored.path);
      const outside = Buffer.from("external bytes on the restored path");
      writeFileSync(target, outside);
      const plan = f.plan();
      expect(plan.refusals).toEqual([]);
      expect(plan.tilesetEffects).toEqual(expectedEffects(f));
      expect(plan.tilesetEffects.map((effect) => effect.path)).toEqual([changed.path]);
      expect(plan.changes.some((change) => resolve(change.path) === target)).toBe(false);
      const entries = f.prepare();
      expect(entries.map((entry) => resolve(entry.path))).toEqual([
        f.grid, resolve(f.root, changed.path),
      ]);
      const snapshot = sessionSnapshot(f);
      f.commit(plan, entries);
      expect(readFileSync(target)).toEqual(outside);
      expect(readFileSync(f.grid)).toEqual(f.expectedGrid);
      expect(readFileSync(resolve(f.root, changed.path))).toEqual(changed.after);
      expectSessionIntact(f, snapshot);
      expectNoTemps(f);
    }, 120_000);

    family.test("a session without tilesetEdits keeps its painted-cell save paths; [] behaves like absent", () => {
      const f = family.fixture();
      delete f.session.tilesetEdits;
      const before = diskSnapshot(f);
      const absentPlan = f.plan();
      expect(absentPlan.tilesetEffects).toEqual([]);
      expect(absentPlan.refusals).toEqual([]);
      const absent = f.prepare();
      expect(absent.map((entry) => resolve(entry.path))).toEqual([f.grid]);
      expect(absent[0]!.after).toEqual(f.expectedGrid);
      f.session.tilesetEdits = [];
      expect(f.plan()).toEqual(absentPlan);
      expect(f.prepare()).toEqual(absent);
      expectDiskUnchanged(before);
      expectNoTemps(f);
    }, 120_000);

    family.test("the fingerprint binds the tileset bytes when sessions differ only in one after buffer", () => {
      const f = family.fixture();
      const before = diskSnapshot(f);
      const first = f.prepare();
      const edit = f.edits[0]!;
      f.session.tilesetEdits = f.edits.map((candidate) => candidate !== edit ? candidate : {
        ...candidate, after: Buffer.concat([candidate.after, Buffer.from([17])]),
      });
      const second = f.prepare();
      expect(first.map((entry) => entry.path)).toEqual(second.map((entry) => entry.path));
      expect(first.map((entry) => entry.before)).toEqual(second.map((entry) => entry.before));
      expect(first[0]!.after).toEqual(second[0]!.after);
      expect(planFingerprint(first)).not.toBe(planFingerprint(second));
      expectDiskUnchanged(before);
      expectNoTemps(f);
    }, 120_000);
  });
}

describe("Task 8 GBC aliased tileset effects", () => {
  itWithGbcCorpus("a Cave / DarkCave shared metatiles file lists maps from both tileset consts", () => {
    const root = copyGbcSubjectToTemp().replace(/\\/g, "/");
    cleanups.push(() => removeTemp(root));
    const proj = openGbcProject(root);
    const byConst = [...new Set(proj.maps.map((map) => map.tileset))]
      .map((tilesetConst) => ({ tilesetConst, tileset: proj.tileset(tilesetConst) }));
    const cave = byConst.find((item) => item.tileset.name === "TilesetCave");
    const darkCave = byConst.find((item) => item.tileset.name === "TilesetDarkCave");
    expect(cave, "PerfPlus TilesetCave reached by a map's tileset const").toBeDefined();
    expect(darkCave, "PerfPlus TilesetDarkCave reached by a map's tileset const").toBeDefined();
    const path = canonicalTilesetPath(cave!.tileset.metatilesPath);
    expect(canonicalTilesetPath(darkCave!.tileset.metatilesPath)).toBe(path);
    expect(path).toMatch(/_metatiles\.bin$/);
    const caveMaps = proj.maps.filter((map) => map.tileset === cave!.tilesetConst).map((map) => map.name);
    const darkCaveMaps = proj.maps.filter((map) => map.tileset === darkCave!.tilesetConst).map((map) => map.name);
    expect(caveMaps.length).toBeGreaterThan(0);
    expect(darkCaveMaps.length).toBeGreaterThan(0);
    const expected = expectedGbcMaps(proj, path);
    for (const name of [...caveMaps, ...darkCaveMaps]) expect(expected).toContain(name);
    const edit = stagedFile(root, path);
    const before = readFileSync(resolve(root, path));
    expect(gbcTilesetEffects(proj, [edit])).toEqual([{ path, maps: expected }]);
    expect(readFileSync(resolve(root, path))).toEqual(before);
  }, 120_000);
});
