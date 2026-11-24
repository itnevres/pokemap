import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("node:fs", async (importOriginal) => {
  const m = await importOriginal<typeof import("node:fs")>();
  return { ...m, default: m, readFileSync: vi.fn(m.readFileSync), existsSync: vi.fn(m.existsSync), statSync: vi.fn(m.statSync) };
});
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { openProject, type Project } from "../../src/project.js";
import { PathEscapeError } from "../../src/gbc/load/pathGuard.js";
import { parseBlocks } from "../../src/load/blocks.js";
import { planBlockdataWrite, planBorderWrite } from "../../src/write/binary.js";
import { makeGbaFixture } from "../blockEdit/gbaFixture.js";
import { breakLayout, outsideCalls } from "../helpers/brokenGba.js";

// Plan H F1d: the binary writers refuse a layout whose own blockdata or border
// path leaves the project, before any read; a healthy layout in the same
// project still plans.

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

function expectNoOutsideReads(): void {
  expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
  expect(outsideCalls(vi.mocked(existsSync))).toEqual([]);
  expect(outsideCalls(vi.mocked(statSync))).toEqual([]);
}

function caughtOf(fn: () => unknown): unknown {
  try { fn(); } catch (e) { return e; }
  return undefined;
}

function openBrokenX(): { proj: Project; blocks: ReturnType<typeof parseBlocks>; healthy: Project["layouts"][number] } {
  const root = makeGbaFixture();
  roots.push(root);
  sentinels.push(...breakLayout(root, "X"));
  const healthyCells = readFileSync(join(root, "data/layouts/E/map.bin"));
  vi.mocked(readFileSync).mockClear();
  vi.mocked(existsSync).mockClear();
  vi.mocked(statSync).mockClear();
  const proj = openProject(root);
  expectNoOutsideReads();
  const healthy = proj.layoutById("E")!;
  const blocks = parseBlocks(healthyCells, proj.profile);
  return { proj, blocks, healthy };
}

describe("binary writers on a broken layout (F1d)", () => {
  it("planBlockdataWrite on the broken layout throws PathEscapeError with no outside read", () => {
    const { proj, blocks } = openBrokenX();
    const layout = proj.layoutById("X")!;
    vi.mocked(readFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    const caught = caughtOf(() => planBlockdataWrite(proj.paths.root, layout, blocks, proj.profile));
    expect(caught).toBeInstanceOf(PathEscapeError);
    expectNoOutsideReads();
  });

  it("planBorderWrite on the broken layout throws PathEscapeError with no outside read", () => {
    const { proj, blocks } = openBrokenX();
    const layout = proj.layoutById("X")!;
    vi.mocked(readFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    const caught = caughtOf(() => planBorderWrite(proj.paths.root, layout, blocks, proj.profile));
    expect(caught).toBeInstanceOf(PathEscapeError);
    expectNoOutsideReads();
  });

  it("the healthy layout E in the same project does not throw PathEscapeError on either writer", () => {
    const { proj, blocks, healthy } = openBrokenX();
    vi.mocked(readFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    const blockErr = caughtOf(() => planBlockdataWrite(proj.paths.root, healthy, blocks, proj.profile));
    const borderErr = caughtOf(() => planBorderWrite(proj.paths.root, healthy, blocks, proj.profile));
    expect(blockErr).not.toBeInstanceOf(PathEscapeError);
    expect(borderErr).not.toBeInstanceOf(PathEscapeError);
    expectNoOutsideReads();
  });
});
