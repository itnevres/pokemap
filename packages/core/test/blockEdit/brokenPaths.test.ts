import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("node:fs", async (importOriginal) => {
  const m = await importOriginal<typeof import("node:fs")>();
  return { ...m, default: m, readFileSync: vi.fn(m.readFileSync), existsSync: vi.fn(m.existsSync), statSync: vi.fn(m.statSync) };
});
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { openProject, type Project } from "../../src/project.js";
import { PathEscapeError } from "../../src/gbc/load/pathGuard.js";
import { BlockEditRefusal, type TilesetFileEdit } from "../../src/blockEdit/types.js";
import { planGbaBlockEdit, type GbaBlockEditRequest } from "../../src/blockEdit/gbaOps.js";
import { gbaBlockUsage, gbaConsumingLayouts } from "../../src/blockEdit/usage.js";
import { gbaTilesetEffects } from "../../src/blockEdit/save.js";
import { makeGbaFixture } from "./gbaFixture.js";
import { breakLayout, breakTileset, outsideCalls } from "../helpers/brokenGba.js";

// Plan H F1d: a broken layout or tileset blocks only the maps that use it. A
// block edit on a healthy map plans exactly as it does in a clean project, and
// an edit on a broken map is refused with PathEscapeError (not a BlockEditRefusal).

const roots: string[] = [];
const sentinels: string[] = [];
beforeEach(() => {
  vi.mocked(readFileSync).mockClear();
  vi.mocked(existsSync).mockClear();
  vi.mocked(statSync).mockClear();
});
afterEach(() => {
  for (const p of sentinels.splice(0)) rmSync(p, { force: true });
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

function build(breakIt?: (root: string) => string[]): Project {
  const root = makeGbaFixture();
  roots.push(root);
  if (breakIt) sentinels.push(...breakIt(root));
  vi.mocked(readFileSync).mockClear();
  vi.mocked(existsSync).mockClear();
  vi.mocked(statSync).mockClear();
  const proj = openProject(root);
  expectNoOutsideReads();
  return proj;
}

function expectNoOutsideReads(): void {
  expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
  expect(outsideCalls(vi.mocked(existsSync))).toEqual([]);
  expect(outsideCalls(vi.mocked(statSync))).toEqual([]);
}

function clearSpies(): void {
  vi.mocked(readFileSync).mockClear();
  vi.mocked(existsSync).mockClear();
  vi.mocked(statSync).mockClear();
}

function caughtOf(fn: () => unknown): unknown {
  try { fn(); } catch (e) { return e; }
  return undefined;
}

// Same request shape as danglingLayout.test.ts: metatile 1 of gTileset_A, cell 7 flipped.
function request(p: Project, map: string): GbaBlockEditRequest {
  const t = p.tileset("gTileset_A");
  const entries = [...t.metatile(1)];
  entries[7] = { ...entries[7]!, xFlip: true };
  return { map, metatileId: 1, mode: "ok", from: "map", cell: { x: 1, y: 0 }, draft: { entries, behavior: t.behavior(1), layerType: t.layerType(1) } };
}

const plan = (p: Project, r: GbaBlockEditRequest) => planGbaBlockEdit(p, r, new Map(), new Map());

function expectSamePlan(got: ReturnType<typeof plan>, want: ReturnType<typeof plan>): void {
  expect(got.edits.map((e) => e.path)).toEqual(want.edits.map((e) => e.path));
  expect(got.edits.map((e) => e.after)).toEqual(want.edits.map((e) => e.after));
  expect(got.confirm).toBe(want.confirm);
}

describe("a broken layout X blocks only the maps on it (F1d)", () => {
  it("an edit on Emerald plans exactly as in the clean project, with no outside read", () => {
    const clean = build();
    const dirty = build((root) => breakLayout(root, "X"));
    const want = plan(clean, request(clean, "Emerald"));
    clearSpies();
    const got = plan(dirty, request(dirty, "Emerald"));
    expectSamePlan(got, want);
    expectNoOutsideReads();
  });

  it("an edit on Extra is refused with PathEscapeError, not a BlockEditRefusal, with no outside read", () => {
    const dirty = build((root) => breakLayout(root, "X"));
    clearSpies();
    const caught = caughtOf(() => plan(dirty, request(dirty, "Extra")));
    expect(caught).toBeInstanceOf(PathEscapeError);
    expect(caught).not.toBeInstanceOf(BlockEditRefusal);
    expectNoOutsideReads();
  });

  it("gbaConsumingLayouts for the shared primary omits layout X and keeps E", () => {
    const dirty = build((root) => breakLayout(root, "X"));
    clearSpies();
    const layouts = gbaConsumingLayouts(dirty, "gTileset_A").map((u) => u.layout);
    expect(layouts).not.toContain("X");
    expect(layouts).toContain("E");
    expectNoOutsideReads();
  });

  it("gbaBlockUsage for the shared primary does not throw, excludes Extra, and includes Emerald", () => {
    const dirty = build((root) => breakLayout(root, "X"));
    clearSpies();
    let usage: ReturnType<typeof gbaBlockUsage> | undefined;
    expect(() => { usage = gbaBlockUsage(dirty, "gTileset_A", 1, new Map()); }).not.toThrow();
    const maps = usage!.maps.map((m) => m.map);
    expect(maps).not.toContain("Extra");
    expect(maps).toContain("Emerald");
    expectNoOutsideReads();
  });
});

describe("a broken tileset T blocks only the maps that use it (F1d)", () => {
  it("an edit on Emerald plans exactly as in the clean project, with no outside read", () => {
    const clean = build();
    const dirty = build((root) => breakTileset(root, "T"));
    const want = plan(clean, request(clean, "Emerald"));
    clearSpies();
    const got = plan(dirty, request(dirty, "Emerald"));
    expectSamePlan(got, want);
    expectNoOutsideReads();
  });

  it("edits on Extra and SharedA are refused with PathEscapeError", () => {
    const dirty = build((root) => breakTileset(root, "T"));
    clearSpies();
    expect(caughtOf(() => plan(dirty, request(dirty, "Extra")))).toBeInstanceOf(PathEscapeError);
    expect(caughtOf(() => plan(dirty, request(dirty, "SharedA")))).toBeInstanceOf(PathEscapeError);
    expectNoOutsideReads();
  });

  it("gbaBlockUsage on the broken symbol itself throws PathEscapeError", () => {
    const dirty = build((root) => breakTileset(root, "T"));
    clearSpies();
    expect(caughtOf(() => gbaBlockUsage(dirty, "gTileset_T", 0, new Map()))).toBeInstanceOf(PathEscapeError);
    expectNoOutsideReads();
  });

  it("gbaBlockUsage on the healthy shared primary excludes Extra, SharedA and SharedB, and includes Emerald", () => {
    const dirty = build((root) => breakTileset(root, "T"));
    clearSpies();
    let usage: ReturnType<typeof gbaBlockUsage> | undefined;
    expect(() => { usage = gbaBlockUsage(dirty, "gTileset_A", 1, new Map()); }).not.toThrow();
    const maps = usage!.maps.map((m) => m.map);
    expect(maps).not.toContain("Extra");
    expect(maps).not.toContain("SharedA");
    expect(maps).not.toContain("SharedB");
    expect(maps).toContain("Emerald");
    expectNoOutsideReads();
  });

  it("the Save plan's tileset effects for the healthy primary do not throw and include Emerald", () => {
    const dirty = build((root) => breakTileset(root, "T"));
    const path = dirty.tilesetPaths("gTileset_A").metatilesBin;
    const before = readFileSync(join(dirty.paths.root, path));
    const after = Buffer.from(before);
    after[0] = (after[0]! + 1) & 0xff;
    const edit: TilesetFileEdit = { path, before, after };
    clearSpies();
    let effects: ReturnType<typeof gbaTilesetEffects> | undefined;
    expect(() => { effects = gbaTilesetEffects(dirty, [edit]); }).not.toThrow();
    expect(effects!.some((e) => e.maps.includes("Emerald"))).toBe(true);
    expectNoOutsideReads();
  });
});
