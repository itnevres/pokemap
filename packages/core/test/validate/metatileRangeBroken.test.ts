import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("node:fs", async (importOriginal) => {
  const m = await importOriginal<typeof import("node:fs")>();
  return { ...m, default: m, readFileSync: vi.fn(m.readFileSync), existsSync: vi.fn(m.existsSync), statSync: vi.fn(m.statSync) };
});
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openProject, type Project } from "../../src/project.js";
import { validateMetatileRange, validatePaletteRange } from "../../src/validate/metatileRange.js";
import { makeGbaFixture } from "../blockEdit/gbaFixture.js";
import { breakLayout, breakTileset, outsideCalls } from "../helpers/brokenGba.js";

// Plan H F1d: a broken layout or tileset blocks only the maps that use it. The
// range walkers skip the broken component, return the findings for every healthy
// layout, and never read a file outside the project.

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

/** A fixture where layout E's map.bin names metatile 0x1f in cell 0, which is out of range for E. */
function fixtureRoot(): string {
  const root = makeGbaFixture();
  roots.push(root);
  const file = join(root, "data/layouts/E/map.bin");
  const cells = readFileSync(file);
  cells.writeUInt16LE(0x001f, 0);
  writeFileSync(file, cells);
  return root;
}

/** Open a project; the caller has already broken it (or not). Outside reads during open are asserted empty. */
function openQuietly(root: string): Project {
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

describe("range validators with a broken component (F1d)", () => {
  it("a broken layout X: validateMetatileRange returns the clean findings minus layout X, keeps E, and reads nothing outside", () => {
    const clean = openQuietly(fixtureRoot());
    const want = validateMetatileRange(clean);

    const brokenRoot = fixtureRoot();
    sentinels.push(...breakLayout(brokenRoot, "X"));
    const broken = openQuietly(brokenRoot);

    clearSpies();
    const got = validateMetatileRange(broken);
    expectNoOutsideReads();
    expect(got).toEqual(want.filter((f) => f.layout !== "X"));
    expect(got.some((f) => f.layout === "E")).toBe(true);
  });

  it("a broken tileset T: validateMetatileRange has no finding for X or H, the other layouts match the clean project, and nothing outside is read", () => {
    const clean = openQuietly(fixtureRoot());
    const want = validateMetatileRange(clean);

    const brokenRoot = fixtureRoot();
    sentinels.push(...breakTileset(brokenRoot, "T"));
    const broken = openQuietly(brokenRoot);

    clearSpies();
    const got = validateMetatileRange(broken);
    expectNoOutsideReads();
    expect(got.some((f) => f.layout === "X" || f.layout === "H")).toBe(false);
    expect(got).toEqual(want.filter((f) => f.layout !== "X" && f.layout !== "H"));
    expect(got.some((f) => f.layout === "E")).toBe(true);
  });

  it("a broken tileset T: validatePaletteRange does not throw, drops gTileset_T, and equals the clean result minus that tileset", () => {
    const clean = openQuietly(fixtureRoot());
    const want = validatePaletteRange(clean);

    const brokenRoot = fixtureRoot();
    sentinels.push(...breakTileset(brokenRoot, "T"));
    const broken = openQuietly(brokenRoot);

    clearSpies();
    let got: ReturnType<typeof validatePaletteRange> | undefined;
    expect(() => { got = validatePaletteRange(broken); }).not.toThrow();
    expectNoOutsideReads();
    expect(got!.some((f) => f.tileset === "gTileset_T")).toBe(false);
    expect(got).toEqual(want.filter((f) => f.tileset !== "gTileset_T"));
  });
});
