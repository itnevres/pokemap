import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectEngineFamily } from "../src/family.js";

const roots: string[] = [];
function makeRoot(): string {
  const r = mkdtempSync(join(tmpdir(), "pokemap-family-"));
  roots.push(r);
  return r;
}
function touch(root: string, relPath: string): void {
  const full = join(root, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, "");
}

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe("detectEngineFamily", () => {
  it("detects gba from include/fieldmap.h", () => {
    const root = makeRoot();
    touch(root, "include/fieldmap.h");
    expect(detectEngineFamily(root)).toBe("gba");
  });

  it("detects gbc from data/maps/attributes.asm + constants/map_constants.asm", () => {
    const root = makeRoot();
    touch(root, "data/maps/attributes.asm");
    touch(root, "constants/map_constants.asm");
    expect(detectEngineFamily(root)).toBe("gbc");
  });

  it("throws naming every probed path when both families match", () => {
    const root = makeRoot();
    touch(root, "include/fieldmap.h");
    touch(root, "data/maps/attributes.asm");
    touch(root, "constants/map_constants.asm");
    expect(() => detectEngineFamily(root)).toThrow(/fieldmap\.h/);
    expect(() => detectEngineFamily(root)).toThrow(/attributes\.asm/);
    expect(() => detectEngineFamily(root)).toThrow(/map_constants\.asm/);
  });

  it("throws naming every probed path when neither family matches", () => {
    const root = makeRoot();
    expect(() => detectEngineFamily(root)).toThrow(/fieldmap\.h/);
    expect(() => detectEngineFamily(root)).toThrow(/attributes\.asm/);
    expect(() => detectEngineFamily(root)).toThrow(/map_constants\.asm/);
  });

  it("throws a distinct pokeyellow-shaped message, not gbc, for Yellow's shape", () => {
    const root = makeRoot();
    mkdirSync(join(root, "data/maps/headers"), { recursive: true });
    touch(root, "constants/map_constants.asm");
    // No data/maps/attributes.asm -- this is what distinguishes Yellow's shape.
    expect(() => detectEngineFamily(root)).toThrow(/pokeyellow/i);
    expect(() => detectEngineFamily(root)).toThrow(/Plan 8/);
  });

  // Real roots, guarded so this suite still passes on a machine without them checked out.
  const cfg = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as {
    projectPath: string;
    gbc?: { projectPath: string };
  };

  it("real gba root from config.projectPath -> gba", () => {
    if (!existsSync(`${cfg.projectPath}/include/fieldmap.h`)) return;
    expect(detectEngineFamily(cfg.projectPath)).toBe("gba");
  });

  it("real gbc root from config.gbc.projectPath -> gbc", () => {
    const gbcRoot = cfg.gbc?.projectPath;
    if (!gbcRoot || !existsSync(`${gbcRoot}/data/maps/attributes.asm`)) return;
    expect(detectEngineFamily(gbcRoot)).toBe("gbc");
  });

  it("real pokeyellow root throws the Yellow message", () => {
    const yellowRoot = "C:/Programming Projects/Pokemon Game/refs/pokeyellow";
    if (!existsSync(`${yellowRoot}/data/maps/headers`)) return;
    expect(() => detectEngineFamily(yellowRoot)).toThrow(/pokeyellow/i);
  });
});
