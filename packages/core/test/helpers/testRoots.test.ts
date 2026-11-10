import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";
import {
  assertScratchRoots, createScratchDir, removeScratchDir, copyTestRoots,
  rootManifest, assertManifestUnchanged, testConfig, type TestConfig,
} from "./testRoots.js";
import { openProject as loadProject } from "../../src/project.js";
import { renderLayout } from "../../src/render/layout.js";
import { openGbcProject } from "../../src/gbc/project.js";
import { renderGbcMap } from "../../src/gbc/render/map.js";
import { setupTestRoots } from "./testRootsSetup.js";

const disposable: string[] = [];
const fresh = () => { const dir = createScratchDir(); disposable.push(dir); return dir; };
const put = (root: string, path: string, bytes = "original") => {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, bytes);
};
const config = (root: string): TestConfig => ({ projectPath: root, referenceProjects: [] });
afterEach(() => { for (const dir of disposable.splice(0).reverse()) if (existsSync(dir)) removeScratchDir(dir); });

describe("test root isolation (disposable sentinel roots)", () => {
  it("refuses an unset environment, with no cwd-config fallback", () => {
    const saved = process.env.POKEMAP_TEST_CONFIG;
    delete process.env.POKEMAP_TEST_CONFIG;
    try { expect(() => testConfig()).toThrow(/POKEMAP_TEST_CONFIG/); }
    finally { if (saved !== undefined) process.env.POKEMAP_TEST_CONFIG = saved; }
  });

  it("copies independent bytes, preserves reference basenames and redirects absent roots", () => {
    const real = fresh(), scratch = fresh();
    const source = join(real, "game"), ref = join(real, "pokecrystal"), gbaRef = join(real, "pokeemerald");
    put(source, "data/maps/sentinel.bin");
    put(source, "porymap.project.cfg");
    put(source, ".pokemap/world.json", "{}");
    put(source, ".git/config");
    put(source, "data/build/forbidden.o");
    put(ref, "maps/Sentinel.blk");
    put(gbaRef, "data/maps/reference.bin");
    const copied = copyTestRoots({ ...config(source), referenceProjects: [gbaRef, join(real, "absent")],
      gbc: { projectPath: join(real, "absent-gbc"), referenceProjects: [ref] } }, scratch);
    assertScratchRoots(copied.config, scratch);
    expect(basename(copied.config.referenceProjects[0]!)).toBe("pokeemerald");
    expect(basename(copied.config.gbc!.referenceProjects![0]!)).toBe("pokecrystal");
    expect(existsSync(copied.config.referenceProjects[1]!)).toBe(false);
    expect(existsSync(copied.config.gbc!.projectPath)).toBe(false);
    expect(copied.config.referenceProjects[1]).not.toContain(real);
    expect(existsSync(join(copied.config.projectPath, ".git"))).toBe(false);
    expect(existsSync(join(copied.config.projectPath, "data/build"))).toBe(false);
    expect(readFileSync(join(copied.config.projectPath, "porymap.project.cfg"), "utf8")).toBe("original");
    put(copied.config.projectPath, "data/maps/sentinel.bin", "scratch edit");
    expect(readFileSync(join(source, "data/maps/sentinel.bin"), "utf8")).toBe("original");
    expect(copied.files).toBe(5);
    expect(copied.bytes).toBe(34);
  });

  it("rejects outside roots, case aliases, sibling-prefix paths and escaping junctions", () => {
    const real = fresh(), scratch = fresh();
    expect(() => assertScratchRoots(config(real), scratch)).toThrow(real);
    expect(() => assertScratchRoots(config(real.toUpperCase()), scratch)).toThrow();
    expect(() => assertScratchRoots(config(`${scratch}-sibling`), scratch)).toThrow();
    const root = join(scratch, "game"); mkdirSync(root);
    symlinkSync(real, join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
    expect(() => assertScratchRoots(config(root), scratch)).toThrow(/escape|game/);
  });

  it("detects changed, added and removed files, including binary, untracked and top-level files", () => {
    const real = fresh();
    put(real, "data/maps/untracked.bin", "abc"); put(real, "top.txt", "top");
    const before = rootManifest(real, "gba");
    expect(() => assertManifestUnchanged(real, before, rootManifest(real, "gba"))).not.toThrow();
    put(real, "data/maps/untracked.bin", "longer"); put(real, "data/maps/added.bin");
    unlinkSync(join(real, "top.txt"));
    expect(() => assertManifestUnchanged(real, before, rootManifest(real, "gba")))
      .toThrow(/changed.*untracked\.bin[\s\S]*added.*added\.bin[\s\S]*removed.*top\.txt/);
  });

  it("revalidates containment when reading the scratch config", () => {
    const real = fresh(), scratch = fresh();
    const path = join(scratch, "pokemap.config.json"); put(scratch, "pokemap.config.json", JSON.stringify(config(real)));
    const saved = process.env.POKEMAP_TEST_CONFIG; process.env.POKEMAP_TEST_CONFIG = path;
    try { expect(() => testConfig()).toThrow(real); }
    finally { if (saved === undefined) delete process.env.POKEMAP_TEST_CONFIG; else process.env.POKEMAP_TEST_CONFIG = saved; }
  });

  it("refuses cleanup of a path not created by this setup", () => {
    expect(() => removeScratchDir(join(fresh(), "child"))).toThrow(/scratch/i);
  });

  it("fails teardown on a sentinel real write, restores the environment and removes scratch", () => {
    const real = fresh(), scratch = fresh(); put(real, "data/sentinel.bin");
    const savedConfig = process.env.POKEMAP_TEST_CONFIG, savedHome = process.env.POKEMAP_HOME;
    const teardown = setupTestRoots(config(real), scratch);
    expect(testConfig().projectPath).toContain(scratch.replace(/\\/g, "/"));
    put(real, "data/sentinel.bin", "changed sentinel bytes");
    expect(teardown).toThrow(/changed data\/sentinel\.bin/);
    expect(existsSync(scratch)).toBe(false);
    expect(process.env.POKEMAP_TEST_CONFIG).toBe(savedConfig);
    expect(process.env.POKEMAP_HOME).toBe(savedHome);
  });

  it("cleans a partial scratch tree on copy failure without touching the sentinel", () => {
    const real = fresh(), scratch = fresh(); put(real, "data/copied-first.bin");
    // A link under an allowed source points to the destination being copied:
    // fs.cpSync must refuse copying a directory into itself, after data copied.
    symlinkSync(scratch, join(real, "include"), process.platform === "win32" ? "junction" : "dir");
    expect(() => setupTestRoots(config(real), scratch)).toThrow();
    expect(existsSync(scratch)).toBe(false);
    expect(readFileSync(join(real, "data/copied-first.bin"), "utf8")).toBe("original");
  });

  it("receives the globalSetup config and scratch history home in a Vitest worker", () => {
    expect(process.env.POKEMAP_TEST_CONFIG).toBeTruthy();
    const cfg = testConfig();
    expect(cfg.projectPath).toBeTruthy();
    expect(process.env.POKEMAP_HOME).toContain("pokemap-test-roots-");
  });

  it("loads and renders one GBA layout from the scratch copy", ({ skip }) => {
    const root = testConfig().projectPath;
    if (!existsSync(join(root, "data/layouts/layouts.json"))) { skip(); return; }
    const project = loadProject(root);
    const raster = renderLayout(project, project.layoutForMap("PetalburgCity").name);
    expect(raster.width).toBe(480); expect(raster.height).toBe(480);
    expect(raster.data.some((byte, i) => i % 4 === 3 && byte === 255)).toBe(true);
  });

  it("loads and renders one PerfPlus map from the scratch copy", ({ skip }) => {
    const root = testConfig().gbc?.projectPath;
    if (!root || !existsSync(join(root, "data/maps/attributes.asm"))) { skip(); return; }
    const raster = renderGbcMap(openGbcProject(root), "NewBarkTown");
    expect(raster.width).toBe(320); expect(raster.height).toBe(288);
    expect(raster.data.some((byte, i) => i % 4 === 3 && byte === 255)).toBe(true);
  });
});
