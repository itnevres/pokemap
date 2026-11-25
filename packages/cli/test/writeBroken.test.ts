import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("node:fs", async (importOriginal) => {
  const m = await importOriginal<typeof import("node:fs")>();
  return { ...m, default: m, readFileSync: vi.fn(m.readFileSync), existsSync: vi.fn(m.existsSync), statSync: vi.fn(m.statSync) };
});
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { openProject, type Project } from "@pokemap/core/project";
import { PathEscapeError } from "@pokemap/core/gbc/load/pathGuard";
import { openCliEditSession } from "../src/writeCommands.js";
import { makeGbaFixture } from "../../core/test/blockEdit/gbaFixture.js";
import { breakLayout, outsideCalls } from "../../core/test/helpers/brokenGba.js";

// Plan H F1d: the CLI write session refuses a broken layout with PathEscapeError
// before any read, and a healthy map in the same project still opens.

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

function openBrokenX(): Project {
  const root = makeGbaFixture();
  roots.push(root);
  sentinels.push(...breakLayout(root, "X"));
  vi.mocked(readFileSync).mockClear();
  vi.mocked(existsSync).mockClear();
  vi.mocked(statSync).mockClear();
  const proj = openProject(root);
  expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
  expect(outsideCalls(vi.mocked(existsSync))).toEqual([]);
  return proj;
}

describe("openCliEditSession on a broken layout (F1d)", () => {
  it("refuses Extra with PathEscapeError and never opens the outside file", () => {
    const proj = openBrokenX();
    vi.mocked(readFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    let caught: unknown;
    try { openCliEditSession(proj, "Extra"); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(PathEscapeError);
    expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
    expect(outsideCalls(vi.mocked(existsSync))).toEqual([]);
    expect(outsideCalls(vi.mocked(statSync))).toEqual([]);
  });

  it("opens Emerald fine in the same project", () => {
    const proj = openBrokenX();
    vi.mocked(readFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    expect(() => openCliEditSession(proj, "Emerald")).not.toThrow();
    expect(outsideCalls(vi.mocked(readFileSync))).toEqual([]);
    expect(outsideCalls(vi.mocked(existsSync))).toEqual([]);
  });
});
