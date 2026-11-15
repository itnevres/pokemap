/**
 * Plan 14.2 Task 9 — oracle tests for hub tileset ownership, redo reacquire and
 * the paint guards. Temp copies only; every test cleans up after itself.
 *
 * Expected paths, bytes, ids and counts come from this file's own construction
 * and disk reads, never from the code under test. The shared metatiles file is
 * found by scanning each project for two maps whose tilesets resolve to it
 * (GBA: same role — primary or secondary — and, for a secondary file, the same
 * split between the two maps); a pair that does not exist fails loudly.
 *
 * Red by construction: `packages/server/src/blockEditOwnership.ts` ships
 * `throw new Error("not implemented (Task 9)")` stubs, so every staging case
 * fails until Task 9 is implemented. Do not run vitest against this file;
 * the conductor runs the red check.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { openProject, type Project } from "@pokemap/core/src/project.js";
import { openGbcProject, type GbcProject } from "@pokemap/core/src/gbc/project.js";
import { canonicalTilesetPath } from "@pokemap/core/src/blockEdit/canonicalTilesetPath.js";
import { BlockEditRefusal, type TilesetFileEdit } from "@pokemap/core/src/blockEdit/types.js";
import { ownedTilesetPaths, requireTilesetOwnership, refuseUnsavedBlockRefs, stageTilesetPlan, type BlockEditPlan } from "../src/blockEditOwnership.js";
import { createProjectHandler } from "../src/index.js";
import { createGbcProjectHandler } from "../src/gbcRoutes.js";
import * as editSessions from "../src/editSessions.js";
import * as gbcEditSessions from "../src/gbcEditSessions.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { copyGbaTilesetProject, removeGbaTemp } from "@pokemap/core/test/helpers/gbaTilesetProject.js";
import { copyGbcSubjectToTemp, removeTemp, hasGbcProject, GBC_SUBJECT_ROOT } from "@pokemap/core/test/gbc/helpers/corpus.js";

/** One appended metatile: 16 opaque bytes the patchers would write verbatim. */
const NEW_METATILE = Buffer.alloc(16, 0x5a);

const emptyUsage = (): BlockEditPlan["usage"] => ({ files: [], tilesets: [], maps: [], sharedGrids: [] });

const flipByte = (buf: Buffer): Buffer => {
  const copy = Buffer.from(buf);
  copy[0] = copy[0]! ^ 0xff;
  return copy;
};

/** Snapshot files before a risky (disk-writing) flow; hand back an undo function for `finally`. */
const restoreBytes = (paths: string[]) => {
  const snapshot = paths.map((path) => [path, readFileSync(path)] as const);
  return () => {
    for (const [path, bytes] of snapshot) writeFileSync(path, bytes);
  };
};

const buildPlan = (
  edits: TilesetFileEdit[],
  placement?: { x: number; y: number; blockId: number },
): BlockEditPlan => ({
  edits,
  ...(placement === undefined ? {} : { placement }),
  warnings: [],
  usage: emptyUsage(),
  confirm: false,
  revision: "",
});

const mkEdit = (path: string): TilesetFileEdit => ({
  path,
  before: Buffer.alloc(16, 1),
  after: Buffer.alloc(16, 2),
});

/** The core session types gain `tilesetEdits` in the Task 9 implementation
 *  (plan, "Session field on both EditSession and GbcEditSession"); the core
 *  package this worktree compiles against does not carry the field yet, so
 *  the oracle pokes it through a narrow cast. The field always exists at
 *  runtime once Task 9 lands; until then these reads/writes are no-ops on
 *  extra properties, which is exactly what a hand-staged session needs. */
const editsOf = (session: unknown): TilesetFileEdit[] | undefined =>
  (session as { tilesetEdits?: TilesetFileEdit[] }).tilesetEdits;
const setEditsOf = (session: unknown, edits: TilesetFileEdit[] | undefined): void => {
  (session as { tilesetEdits?: TilesetFileEdit[] }).tilesetEdits = edits;
};

const expectRefusal = (fn: () => unknown, code: string): BlockEditRefusal => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BlockEditRefusal);
    expect((error as BlockEditRefusal).code).toBe(code);
    return error as BlockEditRefusal;
  }
  throw new Error(`expected BlockEditRefusal ${code}, but the call succeeded`);
};

/** GBA pair sharing a metatiles file, found by scanning project data. */
interface GbaSharedPair {
  a: string;
  b: string;
  path: string;
  role: "primary" | "secondary";
  /** `splitFor(layout).metatiles` when the file is the secondary half; 0 for the primary half. */
  splitMetatiles: number;
}

/** GBC pair sharing a metatiles file (no split — map-visible ids are file-local). */
interface GbcSharedPair {
  a: string;
  b: string;
  path: string;
}

const gbaSharedPair = (proj: Project): GbaSharedPair | undefined => {
  const primary = new Map<string, string[]>();
  const secondary = new Map<string, Map<number, string[]>>();
  for (const name of proj.mapNames()) {
    const layout = proj.layoutForMap(name);
    const split = proj.splitFor(layout).metatiles;
    const primaryFile = canonicalTilesetPath(proj.tilesetPaths(layout.primaryTileset).metatilesBin);
    primary.set(primaryFile, [...(primary.get(primaryFile) ?? []), name]);
    const secondaryFile = canonicalTilesetPath(proj.tilesetPaths(layout.secondaryTileset).metatilesBin);
    const splits = secondary.get(secondaryFile) ?? new Map<number, string[]>();
    splits.set(split, [...(splits.get(split) ?? []), name]);
    secondary.set(secondaryFile, splits);
  }
  const candidates: GbaSharedPair[] = [];
  for (const [file, splits] of secondary) {
    for (const [split, maps] of splits) {
      const sorted = [...maps].sort();
      if (sorted.length >= 2) {
        candidates.push({ a: sorted[0]!, b: sorted[1]!, path: file, role: "secondary", splitMetatiles: split });
      }
    }
  }
  for (const [file, maps] of primary) {
    const sorted = [...maps].sort();
    if (sorted.length >= 2) {
      candidates.push({ a: sorted[0]!, b: sorted[1]!, path: file, role: "primary", splitMetatiles: 0 });
    }
  }
  // Prefer a secondary pair — it exercises the split offset (O8); a primary pair (offset 0) is the fallback.
  return [...candidates].sort((p, q) => {
    if (p.role !== q.role) return p.role === "secondary" ? -1 : 1;
    return p.path < q.path ? -1 : 1;
  })[0];
};

const gbcSharedPair = (proj: GbcProject): GbcSharedPair | undefined => {
  const byFile = new Map<string, string[]>();
  for (const map of proj.maps) {
    const file = canonicalTilesetPath(proj.tileset(map.tileset).metatilesPath);
    byFile.set(file, [...(byFile.get(file) ?? []), map.name]);
  }
  const candidates = [...byFile.entries()]
    .filter(([, maps]) => maps.length >= 2)
    .sort(([fileA, mapsA], [fileB, mapsB]) => (fileA < fileB ? -1 : 1) || (mapsA.join() < mapsB.join() ? -1 : 1));
  const found = candidates[0];
  if (found === undefined) return undefined;
  const [file, maps] = found;
  const sorted = [...maps].sort();
  return { a: sorted[0]!, b: sorted[1]!, path: file };
};

describe.skipIf(!hasProject(SUBJECT_ROOT))("GBA block-edit ownership (Plan 14.2 Task 9)", () => {
  let root: string, server: Server, base: string;
  let sharedRoot: string, sharedServer: Server, sharedBase: string;
  let project: Project;
  let shared: GbaSharedPair;
  let store: ReturnType<typeof editSessions.createEditSessionStore>;
  let sharedStore: ReturnType<typeof editSessions.createEditSessionStore> | undefined;
  let mapA: string, mapB: string;

  const readBytes = (path: string) => readFileSync(resolve(root, path));
  const savedCount = (path: string) => readBytes(path).length / 16;
  const newVisibleId = () => (shared.role === "secondary" ? shared.splitMetatiles : 0) + savedCount(shared.path);
  const layoutOf = (name: string) => project.layoutForMap(name);
  const gridOf = (name: string) => resolve(root, layoutOf(name).blockdataFilepath);
  const sharedAbs = () => resolve(root, shared.path);
  const payloadOf = (name: string) => {
    const entry = store.open(name);
    return {
      blocks: structuredClone(entry.session.blocks),
      border: structuredClone(entry.session.border),
      map: structuredClone(entry.session.map),
      isDirty: entry.session.isDirty,
      canUndo: entry.stack.canUndo(),
      canRedo: entry.stack.canRedo(),
    };
  };
  const req = async (path: string, body?: unknown) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any };
  };
  const edit = (route: string, body?: unknown, name = mapA) => req(`/api/edit/${name}/${route}`, body);
  const appendPlan = (placement?: { x: number; y: number; blockId: number }): BlockEditPlan => {
    const before = readBytes(shared.path);
    return buildPlan([{ path: shared.path, before, after: Buffer.concat([before, NEW_METATILE]) }], placement);
  };
  const stage = (name: string, placement?: { x: number; y: number; blockId: number }) =>
    stageTilesetPlan(store, name, appendPlan(placement), "block edit");

  beforeAll(async () => {
    sharedRoot = copyGbaTilesetProject().replace(/\\/g, "/");
    root = sharedRoot;
    project = openProject(root);
    const found = gbaSharedPair(project);
    expect(found, "two maps sharing a metatiles file").toBeDefined();
    shared = found!;
    mapA = shared.a;
    mapB = shared.b;
    const factory = editSessions.createEditSessionStore;
    vi.spyOn(editSessions, "createEditSessionStore").mockImplementation((p) => {
      store = factory(p);
      return store;
    });
    server = createServer(createProjectHandler(root).handle);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    sharedServer = server; sharedBase = base; sharedStore = store;
  }, 60_000);

  beforeEach(() => {
    store = sharedStore!;
    store.closeAll();
  });
  afterEach(() => {
    sharedStore?.closeAll();
  });
  afterAll(async () => {
    if (sharedServer) await new Promise<void>((r) => sharedServer.close(() => r()));
    vi.restoreAllMocks();
    if (sharedRoot) removeGbaTemp(sharedRoot);
  });

  it("refuses another map's stage while one map owns the file (NOT_OWNER, O2)", () => {
    stage(mapA);
    // B is opened explicitly so "unchanged" is a complete, before/after comparison.
    const entryB = store.open(mapB);
    const payloadBefore = payloadOf(mapB);
    const stateBefore = structuredClone(editSessions.snapshotOf(entryB.session));
    const historyBefore = [entryB.stack.canUndo(), entryB.stack.canRedo(), entryB.session.isDirty];
    const refusal = expectRefusal(() => stage(mapB), "NOT_OWNER");
    expect(refusal.message).toBe(
      `${shared.path}: ${mapA} has unsaved block edits to this file; save, undo or discard them there first`);
    expect(payloadOf(mapB)).toEqual(payloadBefore);
    expect(structuredClone(editSessions.snapshotOf(store.open(mapB).session))).toEqual(stateBefore);
    expect([store.open(mapB).stack.canUndo(), store.open(mapB).stack.canRedo(), store.open(mapB).session.isDirty])
      .toEqual(historyBefore);
  });

  it("keeps ownership through an edit that restores the baseline (O1), releases on undo", async () => {
    stage(mapA);
    const before = readBytes(shared.path);
    const inversePlan = buildPlan([{ path: shared.path, before, after: before }]);
    stageTilesetPlan(store, mapA, inversePlan, "inverse block edit");
    expectRefusal(() => stage(mapB), "NOT_OWNER");
    expect((await edit("undo", {})).status).toBe(200);
    expect((await edit("undo", {})).status).toBe(200);
    expect(() => stage(mapB)).not.toThrow();
  });

  it("keeps ownership through a partial undo; full undo releases it", async () => {
    stage(mapA);
    const staged = editsOf(store.open(mapA).session)![0]!;
    const second = buildPlan([{ path: shared.path, before: staged.after, after: flipByte(staged.after) }]);
    stageTilesetPlan(store, mapA, second, "second block edit");
    expectRefusal(() => stage(mapB), "NOT_OWNER");
    expect((await edit("undo", {})).status).toBe(200);
    expectRefusal(() => stage(mapB), "NOT_OWNER");
    expect((await edit("undo", {})).status).toBe(200);
    expect(() => stage(mapB)).not.toThrow();
  });

  it("refuses redo with NOT_OWNER while another map owns the file; a redo after the owner discards succeeds", async () => {
    stage(mapA);
    expect((await edit("undo", {})).status).toBe(200);
    stageTilesetPlan(store, mapB, appendPlan(), "b stages");
    const entryA = store.open(mapA);
    const historyA = [entryA.stack.canUndo(), entryA.stack.canRedo()];
    const blocksA = structuredClone(entryA.session.blocks);
    const editsA = structuredClone(editsOf(entryA.session));
    const redo = await edit("redo", {});
    expect(redo.status).toBe(409);
    expect(redo.body.code).toBe("NOT_OWNER");
    expect(redo.body.error.startsWith(`${mapA}: ${shared.path}: ${mapB} has unsaved`)).toBe(true);
    expect([store.open(mapA).stack.canUndo(), store.open(mapA).stack.canRedo()]).toEqual(historyA);
    expect(structuredClone(store.open(mapA).session.blocks)).toEqual(blocksA);
    expect(editsOf(store.open(mapA).session)).toEqual(editsA);
    expect((await edit("discard", {}, mapB)).status).toBe(200);
    const redoAgain = await edit("redo", {});
    expect(redoAgain.status).toBe(200);
    expect(store.open(mapA).stack.canUndo()).toBe(true);
    expect(editsOf(store.open(mapA).session)?.length).toBe(1);
  });

  it("refuses redo with FILE_CHANGED after the other map committed; history is unchanged", async () => {
    const metatilesAbs = sharedAbs();
    const bGrid = gridOf(mapB);
    const originalMetatiles = readFileSync(metatilesAbs);
    const restore = restoreBytes([metatilesAbs, bGrid]);
    try {
      stage(mapA);
      expect((await edit("undo", {})).status).toBe(200);
      stageTilesetPlan(store, mapB, appendPlan(), "b stages");
      expect(readFileSync(metatilesAbs)).toEqual(originalMetatiles);
      const planResult = await req(`/api/edit/${mapB}/plan`);
      expect(planResult.status).toBe(200);
      expect(planResult.body.refusals).toEqual([]);
      expect(planResult.body.fingerprint).toBeTruthy();
      expect((await edit("commit", { fingerprint: planResult.body.fingerprint }, mapB)).status).toBe(200);
      expect(readFileSync(metatilesAbs)).toEqual(Buffer.concat([originalMetatiles, NEW_METATILE]));
      const entryA = store.open(mapA);
      const historyA = [entryA.stack.canUndo(), entryA.stack.canRedo()];
      const blocksA = structuredClone(entryA.session.blocks);
      const editsA = structuredClone(editsOf(entryA.session));
      const redo = await edit("redo", {});
      expect(redo.status).toBe(409);
      expect(redo.body.code).toBe("FILE_CHANGED");
      expect(redo.body.error).toContain(shared.path);
      expect([store.open(mapA).stack.canUndo(), store.open(mapA).stack.canRedo()]).toEqual(historyA);
      expect(structuredClone(store.open(mapA).session.blocks)).toEqual(blocksA);
      expect(editsOf(store.open(mapA).session)).toEqual(editsA);
    } finally {
      restore();
    }
  });

  it("leaves the owner's tileset files on disk byte-identical when the other map saves", async () => {
    const metatilesAbs = sharedAbs();
    const bGrid = gridOf(mapB);
    const originalMetatiles = readFileSync(metatilesAbs);
    const restore = restoreBytes([metatilesAbs, bGrid]);
    try {
      stage(mapA);
      const bId = store.open(mapB).session.blocks[0]!.metatileId;
      // 0 and 1 are always real blocks at the front of every tileset and are
      // never the appended id — so this paint is guaranteed to differ from the
      // cell's current block and to sit below the saved count in either half.
      const normalId = bId === 0 ? 1 : 0;
      expect((await req(`/api/edit/${mapB}/paint/begin`, {})).status).toBe(200);
      const painted = await edit("paint/apply", {
        tool: "pencil",
        targets: [{ x: 0, y: 0 }],
        stamp: { width: 1, height: 1, cells: [{ metatileId: normalId }] },
        origin: { x: 0, y: 0 },
      }, mapB);
      expect(painted.status, JSON.stringify(painted.body)).toBe(200);
      expect((await edit("paint/end", {}, mapB)).status).toBe(200);
      const planResult = await req(`/api/edit/${mapB}/plan`);
      expect(planResult.status).toBe(200);
      expect(planResult.body.refusals).toEqual([]);
      expect(planResult.body.fingerprint).toBeTruthy();
      expect((await edit("commit", { fingerprint: planResult.body.fingerprint }, mapB)).status).toBe(200);
      expect(readFileSync(metatilesAbs)).toEqual(originalMetatiles);
      expectRefusal(() => stage(mapB), "NOT_OWNER");
    } finally {
      restore();
    }
  });

  it("refuses paint of the appended id with pencil, rect and bucket (UNSAVED_BLOCK); shift and lower ids are fine", async () => {
    stage(mapA);
    const newId = newVisibleId();
    const belowCount = newId - 1;
    const entryB = store.open(mapB);
    const blocksBefore = structuredClone(entryB.session.blocks);
    const toolBodies = [
      { tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: newId }] }, origin: { x: 0, y: 0 } },
      { tool: "rect", x0: 0, y0: 0, x1: 0, y1: 0, stamp: { width: 1, height: 1, cells: [{ metatileId: newId }] }, origin: { x: 0, y: 0 } },
      { tool: "bucket", x: 0, y: 0, replacement: { metatileId: newId } },
    ] as const;
    for (const body of toolBodies) {
      const res = await edit("paint/apply", body, mapB);
      expect(res.status, body.tool).toBe(409);
      expect(res.body.code, body.tool).toBe("UNSAVED_BLOCK");
      expect(res.body.error, body.tool).toContain(mapA);
      expect(structuredClone(store.open(mapB).session.blocks)).toEqual(blocksBefore);
    }
    const belowPaint = await edit("paint/apply", {
      tool: "pencil",
      targets: [{ x: 1, y: 1 }],
      stamp: { width: 1, height: 1, cells: [{ metatileId: belowCount }] },
      origin: { x: 1, y: 1 },
    }, mapB);
    expect(belowPaint.status, JSON.stringify(belowPaint.body)).toBe(200);
    expect((await edit("paint/apply", {
      tool: "pencil",
      targets: [{ x: 0, y: 0 }],
      stamp: { width: 1, height: 1, cells: [{ metatileId: newId }] },
      origin: { x: 0, y: 0 },
    }, mapA)).status).toBe(200);
    expect((await edit("paint/apply", { tool: "shift", dx: 1, dy: 0 }, mapB)).status).toBe(200);
  });

  it("a discarded append leaves no session referencing the id, and releases ownership", async () => {
    stage(mapA);
    const newId = newVisibleId();
    expect((await edit("discard", {}, mapA)).status).toBe(200);
    expect(store.has(mapA)).toBe(false);
    for (const [, entry] of store.entries()) {
      expect(entry.session.blocks.every((block) => block.metatileId !== newId)).toBe(true);
    }
    expect(() => stage(mapB)).not.toThrow();
  });

  it("one stageTilesetPlan with a placement is one undo step covering tileset and grid", async () => {
    // GBA grids carry a 10-bit metatile id; never propose an id the field cannot hold.
    const target = { x: 1, y: 1, blockId: Math.min(newVisibleId(), 0x3ff) };
    const width = layoutOf(mapA).width;
    const index = target.y * width + target.x;
    const originalBlockId = store.open(mapA).session.blocks[index]!.metatileId;
    stage(mapA, target);
    expect(store.open(mapA).session.blocks[index]!.metatileId).toBe(target.blockId);
    expect(editsOf(store.open(mapA).session)?.length).toBe(1);
    expect((await edit("undo", {})).status).toBe(200);
    expect(store.open(mapA).session.blocks[index]!.metatileId).toBe(originalBlockId);
    expect(editsOf(store.open(mapA).session) ?? []).toEqual([]);
    expect((await edit("redo", {})).status).toBe(200);
    expect(store.open(mapA).session.blocks[index]!.metatileId).toBe(target.blockId);
    expect(editsOf(store.open(mapA).session)?.length).toBe(1);
  });

  it("snapshotOf includes tilesetEdits ([] when absent)", () => {
    const entry = store.open(mapA);
    setEditsOf(entry.session, undefined);
    expect(editSessions.snapshotOf(entry.session).tilesetEdits).toEqual([]);
    const editNow = mkEdit("tilesets/blockedit_snapshot.bin");
    setEditsOf(entry.session, [editNow]);
    expect(editSessions.snapshotOf(entry.session).tilesetEdits).toEqual([editNow]);
  });

  it("ownedTilesetPaths returns the session's paths, restored entries included", () => {
    const restored = mkEdit("tilesets/blockedit_restored.bin");
    restored.after = restored.before;
    const changed = mkEdit("tilesets/blockedit_changed.bin");
    setEditsOf(store.open(mapA).session, [changed, restored]);
    expect([...ownedTilesetPaths(store.open(mapA))].sort())
      .toEqual(["tilesets/blockedit_changed.bin", "tilesets/blockedit_restored.bin"]);
    expect(ownedTilesetPaths(store.open(mapB)).size).toBe(0);
  });

  it("never refuses the caller's own paths; paths are checked in sorted order", () => {
    const path1 = "tilesets/blockedit_first.bin";
    const path2 = "tilesets/blockedit_second.bin";
    setEditsOf(store.open(mapA).session, [mkEdit(path2)]);
    setEditsOf(store.open(mapB).session, [mkEdit(path1)]);
    const entriesOf = [...store.entries()];
    const refusal = expectRefusal(() => requireTilesetOwnership(entriesOf, "BlockEditCaller", [path2, path1]), "NOT_OWNER");
    expect(refusal.message).toContain(path1);
    expect(refusal.message).not.toContain(path2);
    expect(refusal.message).toContain(mapB);
    const skipped = expectRefusal(() => requireTilesetOwnership(entriesOf, mapA, [path2, path1]), "NOT_OWNER");
    expect(skipped.message).toContain(path1);
    expect(skipped.message).not.toContain(path2);
    requireTilesetOwnership(entriesOf, mapA, [path2]);
    requireTilesetOwnership(entriesOf, mapB, [path1]);
  });

  it("refuseUnsavedBlockRefs names the owner at the saved count, passes below it, skips the owner's own", () => {
    setEditsOf(store.open(mapA).session, [mkEdit(shared.path)]);
    const savedCountLocal = 7;
    const refusal = expectRefusal(
      () => refuseUnsavedBlockRefs(store.entries(), mapB, shared.path, savedCountLocal, [savedCountLocal]), "UNSAVED_BLOCK");
    expect(refusal.message).toContain(mapA);
    expectRefusal(() => refuseUnsavedBlockRefs(store.entries(), mapB, shared.path, savedCountLocal, [savedCountLocal - 1, savedCountLocal]),
      "UNSAVED_BLOCK");
    refuseUnsavedBlockRefs(store.entries(), mapB, shared.path, savedCountLocal, [savedCountLocal - 1]);
    refuseUnsavedBlockRefs(store.entries(), mapA, shared.path, savedCountLocal, [savedCountLocal]);
    refuseUnsavedBlockRefs(store.entries(), mapB, "tilesets/blockedit_unowned.bin", savedCountLocal, [savedCountLocal]);
  });
});

describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))("GBC block-edit ownership (Plan 14.2 Task 9)", () => {
  let root: string, server: Server, base: string;
  let sharedRoot: string, sharedServer: Server, sharedBase: string;
  let project: GbcProject;
  let shared: GbcSharedPair;
  let store: ReturnType<typeof gbcEditSessions.createGbcEditSessionStore>;
  let sharedStore: ReturnType<typeof gbcEditSessions.createGbcEditSessionStore> | undefined;
  let mapA: string, mapB: string;

  const readBytes = (path: string) => readFileSync(resolve(root, path));
  const savedCount = (path: string) => readBytes(path).length / 16;
  const newVisibleId = () => savedCount(shared.path);
  const gridOf = (name: string) => resolve(root, project.map(name).blkPath);
  const sharedAbs = () => resolve(root, shared.path);
  const payloadOf = (name: string) => {
    const entry = store.open(name);
    return {
      blocks: structuredClone(entry.session.blocks),
      eventsText: entry.session.eventsText,
      isDirty: entry.session.isDirty,
      canUndo: entry.stack.canUndo(),
      canRedo: entry.stack.canRedo(),
    };
  };
  const req = async (path: string, body?: unknown) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any };
  };
  const edit = (route: string, body?: unknown, name = mapA) => req(`/api/edit/${name}/${route}`, body);
  const appendPlan = (placement?: { x: number; y: number; blockId: number }): BlockEditPlan => {
    const before = readBytes(shared.path);
    return buildPlan([{ path: shared.path, before, after: Buffer.concat([before, NEW_METATILE]) }], placement);
  };
  const stage = (name: string, placement?: { x: number; y: number; blockId: number }) =>
    stageTilesetPlan(store, name, appendPlan(placement), "block edit");

  beforeAll(async () => {
    sharedRoot = copyGbcSubjectToTemp().replace(/\\/g, "/");
    root = sharedRoot;
    project = openGbcProject(root);
    const found = gbcSharedPair(project);
    expect(found, "two maps sharing a metatiles file").toBeDefined();
    shared = found!;
    mapA = shared.a;
    mapB = shared.b;
    const factory = gbcEditSessions.createGbcEditSessionStore;
    vi.spyOn(gbcEditSessions, "createGbcEditSessionStore").mockImplementation((p) => {
      store = factory(p);
      return store;
    });
    server = createServer(createGbcProjectHandler(root).handle);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    sharedServer = server; sharedBase = base; sharedStore = store;
  }, 60_000);

  beforeEach(() => {
    store = sharedStore!;
    store.closeAll();
  });
  afterEach(() => {
    sharedStore?.closeAll();
  });
  afterAll(async () => {
    if (sharedServer) await new Promise<void>((r) => sharedServer.close(() => r()));
    vi.restoreAllMocks();
    if (sharedRoot) removeTemp(sharedRoot);
  });

  it("refuses another map's stage while one map owns the file (NOT_OWNER, O2)", () => {
    stage(mapA);
    // B is opened explicitly so "unchanged" is a complete, before/after comparison.
    const entryB = store.open(mapB);
    const payloadBefore = payloadOf(mapB);
    const stateBefore = structuredClone(gbcEditSessions.gbcSnapshotOf(entryB.session));
    const historyBefore = [entryB.stack.canUndo(), entryB.stack.canRedo(), entryB.session.isDirty];
    const refusal = expectRefusal(() => stage(mapB), "NOT_OWNER");
    expect(refusal.message).toBe(
      `${shared.path}: ${mapA} has unsaved block edits to this file; save, undo or discard them there first`);
    expect(payloadOf(mapB)).toEqual(payloadBefore);
    expect(structuredClone(gbcEditSessions.gbcSnapshotOf(store.open(mapB).session))).toEqual(stateBefore);
    expect([store.open(mapB).stack.canUndo(), store.open(mapB).stack.canRedo(), store.open(mapB).session.isDirty])
      .toEqual(historyBefore);
  });

  it("keeps ownership through an edit that restores the baseline (O1), releases on undo", async () => {
    stage(mapA);
    const before = readBytes(shared.path);
    const inversePlan = buildPlan([{ path: shared.path, before, after: before }]);
    stageTilesetPlan(store, mapA, inversePlan, "inverse block edit");
    expectRefusal(() => stage(mapB), "NOT_OWNER");
    expect((await edit("undo", {})).status).toBe(200);
    expect((await edit("undo", {})).status).toBe(200);
    expect(() => stage(mapB)).not.toThrow();
  });

  it("keeps ownership through a partial undo; full undo releases it", async () => {
    stage(mapA);
    const staged = editsOf(store.open(mapA).session)![0]!;
    const second = buildPlan([{ path: shared.path, before: staged.after, after: flipByte(staged.after) }]);
    stageTilesetPlan(store, mapA, second, "second block edit");
    expectRefusal(() => stage(mapB), "NOT_OWNER");
    expect((await edit("undo", {})).status).toBe(200);
    expectRefusal(() => stage(mapB), "NOT_OWNER");
    expect((await edit("undo", {})).status).toBe(200);
    expect(() => stage(mapB)).not.toThrow();
  });

  it("refuses redo with NOT_OWNER while another map owns the file; a redo after the owner discards succeeds", async () => {
    stage(mapA);
    expect((await edit("undo", {})).status).toBe(200);
    stageTilesetPlan(store, mapB, appendPlan(), "b stages");
    const entryA = store.open(mapA);
    const historyA = [entryA.stack.canUndo(), entryA.stack.canRedo()];
    const blocksA = structuredClone(entryA.session.blocks);
    const editsA = structuredClone(editsOf(entryA.session));
    const redo = await edit("redo", {});
    expect(redo.status).toBe(409);
    expect(redo.body.code).toBe("NOT_OWNER");
    expect(redo.body.error.startsWith(`${mapA}: ${shared.path}: ${mapB} has unsaved`)).toBe(true);
    expect([store.open(mapA).stack.canUndo(), store.open(mapA).stack.canRedo()]).toEqual(historyA);
    expect(structuredClone(store.open(mapA).session.blocks)).toEqual(blocksA);
    expect(editsOf(store.open(mapA).session)).toEqual(editsA);
    expect((await edit("discard", {}, mapB)).status).toBe(200);
    const redoAgain = await edit("redo", {});
    expect(redoAgain.status).toBe(200);
    expect(store.open(mapA).stack.canUndo()).toBe(true);
    expect(editsOf(store.open(mapA).session)?.length).toBe(1);
  });

  it("refuses redo with FILE_CHANGED after the other map committed; history is unchanged", async () => {
    const metatilesAbs = sharedAbs();
    const bGrid = gridOf(mapB);
    const originalMetatiles = readFileSync(metatilesAbs);
    const restore = restoreBytes([metatilesAbs, bGrid]);
    try {
      stage(mapA);
      expect((await edit("undo", {})).status).toBe(200);
      stageTilesetPlan(store, mapB, appendPlan(), "b stages");
      expect(readFileSync(metatilesAbs)).toEqual(originalMetatiles);
      const planResult = await req(`/api/edit/${mapB}/plan`);
      expect(planResult.status).toBe(200);
      expect(planResult.body.refusals).toEqual([]);
      expect(planResult.body.fingerprint).toBeTruthy();
      expect((await edit("commit", { fingerprint: planResult.body.fingerprint }, mapB)).status).toBe(200);
      expect(readFileSync(metatilesAbs)).toEqual(Buffer.concat([originalMetatiles, NEW_METATILE]));
      const entryA = store.open(mapA);
      const historyA = [entryA.stack.canUndo(), entryA.stack.canRedo()];
      const blocksA = structuredClone(entryA.session.blocks);
      const editsA = structuredClone(editsOf(entryA.session));
      const redo = await edit("redo", {});
      expect(redo.status).toBe(409);
      expect(redo.body.code).toBe("FILE_CHANGED");
      expect(redo.body.error).toContain(shared.path);
      expect([store.open(mapA).stack.canUndo(), store.open(mapA).stack.canRedo()]).toEqual(historyA);
      expect(structuredClone(store.open(mapA).session.blocks)).toEqual(blocksA);
      expect(editsOf(store.open(mapA).session)).toEqual(editsA);
    } finally {
      restore();
    }
  });

  it("leaves the owner's tileset files on disk byte-identical when the other map saves", async () => {
    const metatilesAbs = sharedAbs();
    const bGrid = gridOf(mapB);
    const originalMetatiles = readFileSync(metatilesAbs);
    const restore = restoreBytes([metatilesAbs, bGrid]);
    try {
      stage(mapA);
      const bId = store.open(mapB).session.blocks[0]!.metatileId;
      const normalId = bId === 0 ? 1 : 0;
      expect((await req(`/api/edit/${mapB}/paint/begin`, {})).status).toBe(200);
      const painted = await edit("paint/apply", {
        tool: "pencil",
        targets: [{ x: 0, y: 0 }],
        stamp: { width: 1, height: 1, cells: [{ metatileId: normalId }] },
        origin: { x: 0, y: 0 },
      }, mapB);
      expect(painted.status, JSON.stringify(painted.body)).toBe(200);
      expect((await edit("paint/end", {}, mapB)).status).toBe(200);
      const planResult = await req(`/api/edit/${mapB}/plan`);
      expect(planResult.status).toBe(200);
      expect(planResult.body.refusals).toEqual([]);
      expect(planResult.body.fingerprint).toBeTruthy();
      expect((await edit("commit", { fingerprint: planResult.body.fingerprint }, mapB)).status).toBe(200);
      expect(readFileSync(metatilesAbs)).toEqual(originalMetatiles);
      expectRefusal(() => stage(mapB), "NOT_OWNER");
    } finally {
      restore();
    }
  });

  it("refuses paint of the appended id with pencil, rect and bucket (UNSAVED_BLOCK); shift and lower ids are fine", async () => {
    stage(mapA);
    const newId = newVisibleId();
    const belowCount = newId - 1;
    const entryB = store.open(mapB);
    const blocksBefore = structuredClone(entryB.session.blocks);
    const toolBodies = [
      { tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: newId }] }, origin: { x: 0, y: 0 } },
      { tool: "rect", x0: 0, y0: 0, x1: 0, y1: 0, stamp: { width: 1, height: 1, cells: [{ metatileId: newId }] }, origin: { x: 0, y: 0 } },
      { tool: "bucket", x: 0, y: 0, replacement: { metatileId: newId } },
    ] as const;
    for (const body of toolBodies) {
      const res = await edit("paint/apply", body, mapB);
      expect(res.status, body.tool).toBe(409);
      expect(res.body.code, body.tool).toBe("UNSAVED_BLOCK");
      expect(res.body.error, body.tool).toContain(mapA);
      expect(structuredClone(store.open(mapB).session.blocks)).toEqual(blocksBefore);
    }
    const belowPaint = await edit("paint/apply", {
      tool: "pencil",
      targets: [{ x: 1, y: 1 }],
      stamp: { width: 1, height: 1, cells: [{ metatileId: belowCount }] },
      origin: { x: 1, y: 1 },
    }, mapB);
    expect(belowPaint.status, JSON.stringify(belowPaint.body)).toBe(200);
    expect((await edit("paint/apply", {
      tool: "pencil",
      targets: [{ x: 0, y: 0 }],
      stamp: { width: 1, height: 1, cells: [{ metatileId: newId }] },
      origin: { x: 0, y: 0 },
    }, mapA)).status).toBe(200);
    expect((await edit("paint/apply", { tool: "shift", dx: 1, dy: 0 }, mapB)).status).toBe(200);
  });

  it("a discarded append leaves no session referencing the id, and releases ownership", async () => {
    stage(mapA);
    const newId = newVisibleId();
    expect((await edit("discard", {}, mapA)).status).toBe(200);
    expect(store.has(mapA)).toBe(false);
    for (const [, entry] of store.entries()) {
      expect(entry.session.blocks.every((block) => block.metatileId !== newId)).toBe(true);
    }
    expect(() => stage(mapB)).not.toThrow();
  });

  it("one stageTilesetPlan with a placement is one undo step covering tileset and grid", async () => {
    const target = { x: 1, y: 1, blockId: Math.min(newVisibleId(), 0xff) };
    const width = project.map(mapA).width;
    const index = target.y * width + target.x;
    const originalBlockId = store.open(mapA).session.blocks[index]!.metatileId;
    stage(mapA, target);
    expect(store.open(mapA).session.blocks[index]!.metatileId).toBe(target.blockId);
    expect(editsOf(store.open(mapA).session)?.length).toBe(1);
    expect((await edit("undo", {})).status).toBe(200);
    expect(store.open(mapA).session.blocks[index]!.metatileId).toBe(originalBlockId);
    expect(editsOf(store.open(mapA).session) ?? []).toEqual([]);
    expect((await edit("redo", {})).status).toBe(200);
    expect(store.open(mapA).session.blocks[index]!.metatileId).toBe(target.blockId);
    expect(editsOf(store.open(mapA).session)?.length).toBe(1);
  });

  it("gbcSnapshotOf includes tilesetEdits ([] when absent)", () => {
    const entry = store.open(mapA);
    setEditsOf(entry.session, undefined);
    expect(gbcEditSessions.gbcSnapshotOf(entry.session).tilesetEdits).toEqual([]);
    const editNow = mkEdit("tilesets/blockedit_snapshot.bin");
    setEditsOf(entry.session, [editNow]);
    expect(gbcEditSessions.gbcSnapshotOf(entry.session).tilesetEdits).toEqual([editNow]);
  });

  it("ownedTilesetPaths returns the session's paths, restored entries included", () => {
    const restored = mkEdit("tilesets/blockedit_restored.bin");
    restored.after = restored.before;
    const changed = mkEdit("tilesets/blockedit_changed.bin");
    setEditsOf(store.open(mapA).session, [changed, restored]);
    expect([...ownedTilesetPaths(store.open(mapA))].sort())
      .toEqual(["tilesets/blockedit_changed.bin", "tilesets/blockedit_restored.bin"]);
    expect(ownedTilesetPaths(store.open(mapB)).size).toBe(0);
  });

  it("never refuses the caller's own paths; paths are checked in sorted order", () => {
    const path1 = "tilesets/blockedit_first.bin";
    const path2 = "tilesets/blockedit_second.bin";
    setEditsOf(store.open(mapA).session, [mkEdit(path2)]);
    setEditsOf(store.open(mapB).session, [mkEdit(path1)]);
    const entriesOf = [...store.entries()];
    const refusal = expectRefusal(() => requireTilesetOwnership(entriesOf, "BlockEditCaller", [path2, path1]), "NOT_OWNER");
    expect(refusal.message).toContain(path1);
    expect(refusal.message).not.toContain(path2);
    expect(refusal.message).toContain(mapB);
    const skipped = expectRefusal(() => requireTilesetOwnership(entriesOf, mapA, [path2, path1]), "NOT_OWNER");
    expect(skipped.message).toContain(path1);
    expect(skipped.message).not.toContain(path2);
    requireTilesetOwnership(entriesOf, mapA, [path2]);
    requireTilesetOwnership(entriesOf, mapB, [path1]);
  });

  it("refuseUnsavedBlockRefs names the owner at the saved count, passes below it, skips the owner's own", () => {
    setEditsOf(store.open(mapA).session, [mkEdit(shared.path)]);
    const savedCountLocal = 7;
    const refusal = expectRefusal(
      () => refuseUnsavedBlockRefs(store.entries(), mapB, shared.path, savedCountLocal, [savedCountLocal]), "UNSAVED_BLOCK");
    expect(refusal.message).toContain(mapA);
    expectRefusal(() => refuseUnsavedBlockRefs(store.entries(), mapB, shared.path, savedCountLocal, [savedCountLocal - 1, savedCountLocal]),
      "UNSAVED_BLOCK");
    refuseUnsavedBlockRefs(store.entries(), mapB, shared.path, savedCountLocal, [savedCountLocal - 1]);
    refuseUnsavedBlockRefs(store.entries(), mapA, shared.path, savedCountLocal, [savedCountLocal]);
    refuseUnsavedBlockRefs(store.entries(), mapB, "tilesets/blockedit_unowned.bin", savedCountLocal, [savedCountLocal]);
  });
});
