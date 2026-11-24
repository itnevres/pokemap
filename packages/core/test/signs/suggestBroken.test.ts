import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("node:fs", async (importOriginal) => {
  const m = await importOriginal<typeof import("node:fs")>();
  return { ...m, default: m, readFileSync: vi.fn(m.readFileSync), existsSync: vi.fn(m.existsSync), statSync: vi.fn(m.statSync) };
});
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { openProject, type Project } from "../../src/project.js";
import { PathEscapeError } from "../../src/gbc/load/pathGuard.js";
import { suggestIndicatorPlacement } from "../../src/signs/suggest.js";
import { makeGbaFixture } from "../blockEdit/gbaFixture.js";
import { breakLayout, breakTileset, outsideCalls } from "../helpers/brokenGba.js";

// Plan H F1d: the sign-indicator suggester acts on one named map, so a map on a
// broken layout or a broken tileset is refused with PathEscapeError before any
// read, and a healthy map keeps working.

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

function openWith(breakIt: (root: string) => string[]): Project {
  const root = makeGbaFixture();
  roots.push(root);
  sentinels.push(...breakIt(root));
  vi.mocked(readFileSync).mockClear();
  vi.mocked(existsSync).mockClear();
  vi.mocked(statSync).mockClear();
  const proj = openProject(root);
  expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
  expect(outsideCalls(vi.mocked(existsSync))).toEqual([]);
  expect(outsideCalls(vi.mocked(statSync))).toEqual([]);
  return proj;
}

function expectNoOutsideReads(): void {
  expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
  expect(outsideCalls(vi.mocked(existsSync))).toEqual([]);
  expect(outsideCalls(vi.mocked(statSync))).toEqual([]);
}

describe("suggestIndicatorPlacement on a broken component (F1d)", () => {
  it("a map on a broken layout is refused with PathEscapeError, with no outside read", () => {
    const proj = openWith((root) => breakLayout(root, "X"));
    vi.mocked(readFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    expect(() => suggestIndicatorPlacement(proj, "Extra")).toThrow(PathEscapeError);
    expectNoOutsideReads();
  });

  it("a map on a broken tileset is refused with PathEscapeError (Extra and SharedA), while Emerald still works", () => {
    const proj = openWith((root) => breakTileset(root, "T"));
    vi.mocked(readFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    expect(() => suggestIndicatorPlacement(proj, "Extra")).toThrow(PathEscapeError);
    expect(() => suggestIndicatorPlacement(proj, "SharedA")).toThrow(PathEscapeError);
    expectNoOutsideReads();

    vi.mocked(readFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    let caught: unknown;
    try { suggestIndicatorPlacement(proj, "Emerald"); } catch (e) { caught = e; }
    expect(caught).not.toBeInstanceOf(PathEscapeError);
    expectNoOutsideReads();
  });
});
