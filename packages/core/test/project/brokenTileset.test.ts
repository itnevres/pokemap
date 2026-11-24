import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("node:fs", async (importOriginal) => {
  const m = await importOriginal<typeof import("node:fs")>();
  return { ...m, default: m, readFileSync: vi.fn(m.readFileSync), existsSync: vi.fn(m.existsSync), statSync: vi.fn(m.statSync) };
});
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { openProject, type Project } from "../../src/project.js";
import { PathEscapeError } from "../../src/gbc/load/pathGuard.js";
import { makeGbaFixture } from "../blockEdit/gbaFixture.js";
import { breakTileset, outsideCalls } from "../helpers/brokenGba.js";

// Plan H F1d: a broken tileset throws PathEscapeError from the single-tileset
// accessors, and only the non-throwing accessor reports it; healthy tilesets
// keep working, and nothing outside the project is ever read.

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

function caughtOf(fn: () => unknown): unknown {
  try { fn(); } catch (e) { return e; }
  return undefined;
}

function openBrokenT(): Project {
  const root = makeGbaFixture();
  roots.push(root);
  sentinels.push(...breakTileset(root, "T"));
  vi.mocked(readFileSync).mockClear();
  vi.mocked(existsSync).mockClear();
  vi.mocked(statSync).mockClear();
  const proj = openProject(root);
  expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
  expect(outsideCalls(vi.mocked(existsSync))).toEqual([]);
  expect(outsideCalls(vi.mocked(statSync))).toEqual([]);
  return proj;
}

describe("a broken tileset (F1d)", () => {
  it("proj.tileset on the broken symbol throws PathEscapeError keyed to the metatiles path", () => {
    const proj = openBrokenT();
    vi.mocked(readFileSync).mockClear();
    const caught = caughtOf(() => proj.tileset("gTileset_T"));
    expect(caught).toBeInstanceOf(PathEscapeError);
    expect((caught as PathEscapeError).brokenPath.key).toBe(".metatiles");
    expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
    expect(outsideCalls(vi.mocked(existsSync))).toEqual([]);
  });

  it("proj.tilesetPaths on the broken symbol throws PathEscapeError keyed to the metatiles path", () => {
    const proj = openBrokenT();
    const caught = caughtOf(() => proj.tilesetPaths("gTileset_T"));
    expect(caught).toBeInstanceOf(PathEscapeError);
    expect((caught as PathEscapeError).brokenPath.key).toBe(".metatiles");
    expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
    expect(outsideCalls(vi.mocked(existsSync))).toEqual([]);
  });

  it("proj.tilesetPathsUnchecked returns the broken paths without throwing", () => {
    const proj = openBrokenT();
    let paths: ReturnType<Project["tilesetPathsUnchecked"]> | undefined;
    expect(() => { paths = proj.tilesetPathsUnchecked("gTileset_T"); }).not.toThrow();
    expect(paths!.brokenPaths!.length).toBeGreaterThanOrEqual(1);
    expect(paths!.brokenPaths![0]!.key).toBe(".metatiles");
    expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
    expect(outsideCalls(vi.mocked(existsSync))).toEqual([]);
  });

  it("a healthy tileset through the unchecked accessor has no broken paths and equals tilesetPaths", () => {
    const proj = openBrokenT();
    const unchecked = proj.tilesetPathsUnchecked("gTileset_A");
    expect(unchecked.brokenPaths ?? []).toEqual([]);
    expect({ ...unchecked, brokenPaths: undefined }).toEqual(proj.tilesetPaths("gTileset_A"));
    expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
  });

  it("a healthy tileset still loads through proj.tileset while another tileset is broken", () => {
    const proj = openBrokenT();
    vi.mocked(readFileSync).mockClear();
    const a = proj.tileset("gTileset_A");
    expect(a.metatileCount).toBe(4);
    expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
    expect(outsideCalls(vi.mocked(existsSync))).toEqual([]);
  });
});
