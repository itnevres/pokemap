import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDungeons, writeDungeons, type DungeonsFile } from "../../src/world/dungeons.js";
import { projectPaths } from "../../src/config/paths.js";

const roots: string[] = [];
const tempRoot = () => { const r = mkdtempSync(join(tmpdir(), "pokemap-")); roots.push(r); return r; };
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

describe("dungeons sidecar", () => {
  it("returns defaults when no file exists", () => {
    const d = readDungeons(tempRoot());
    expect(d.version).toBe(1);
    expect(d.dungeons).toEqual([]);
  });

  it("round-trips", () => {
    const root = tempRoot();
    const d: DungeonsFile = { version: 1, dungeons: [{ id: "abc", name: "Mt Moon", maps: ["MtMoon_1F", "MtMoon_B1F"] }] };
    writeDungeons(root, d);
    expect(existsSync(`${root}/.pokemap/dungeons.json`)).toBe(true);
    expect(readDungeons(root)).toEqual(d);
  });

  it("writes only inside .pokemap/", () => {
    const root = tempRoot();
    writeDungeons(root, readDungeons(root));
    expect(readdirSync(root)).toEqual([".pokemap"]);
  });

  it("refuses a corrupted (invalid JSON) file, naming the file", () => {
    const root = tempRoot();
    writeDungeons(root, readDungeons(root));
    writeFileSync(projectPaths(root).dungeons, "{ not valid json");
    expect(() => readDungeons(root)).toThrow(projectPaths(root).dungeons);
  });

  it("refuses a dungeons entry missing a required field, naming the file", () => {
    const root = tempRoot();
    writeDungeons(root, readDungeons(root)); // establishes a valid .pokemap/dungeons.json
    writeFileSync(
      projectPaths(root).dungeons,
      JSON.stringify({ version: 1, dungeons: [{ id: "abc", name: "Mt Moon" }] }), // missing "maps"
    );
    expect(() => readDungeons(root)).toThrow(projectPaths(root).dungeons);
  });

  it("refuses a dungeons field that is not an array, naming the file", () => {
    const root = tempRoot();
    writeDungeons(root, readDungeons(root)); // establishes a valid .pokemap/dungeons.json
    writeFileSync(projectPaths(root).dungeons, JSON.stringify({ version: 1, dungeons: "oops" }));
    expect(() => readDungeons(root)).toThrow(projectPaths(root).dungeons);
    expect(() => readDungeons(root)).toThrow(/dungeons/);
  });
});
