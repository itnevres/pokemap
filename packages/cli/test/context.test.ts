import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Project } from "@pokemap/core/src/project.js";
import type { MapData } from "@pokemap/core/src/load/maps.js";
import { layoutNameFor, resolveRoot } from "../src/context.js";

/**
 * A minimal stub, not the corpus: the case this test exists for -- a map
 * that exists but whose layout id does not resolve -- is a form of tree
 * corruption the subject repo doesn't (and shouldn't) contain, so there is
 * no real fixture to reach for. `map` and `layoutForMap` are wired to
 * distinguishable throws so the test can tell which one layoutNameFor
 * actually called.
 */
function stubProject(overrides: Partial<Project>): Project {
  const unused = (fn: string) => (): never => { throw new Error(`stub: ${fn} should not be called`); };
  return {
    paths: unused("paths") as unknown as Project["paths"],
    profile: unused("profile") as unknown as Project["profile"],
    constants: unused("constants") as unknown as Project["constants"],
    layouts: [],
    groups: unused("groups") as unknown as Project["groups"],
    layoutByName: () => undefined,
    layoutById: () => undefined,
    layoutForMap: unused("layoutForMap"),
    splitFor: unused("splitFor"),
    tileset: unused("tileset"),
    tilesetSymbols: unused("tilesetSymbols"),
    map: unused("map"),
    mapNames: () => [],
    encounters: unused("encounters"),
    ...overrides,
  };
}

describe("resolveRoot", () => {
  const cwds: string[] = [];
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    for (const d of cwds.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function chdirToFreshDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "pokemap-resolveRoot-"));
    cwds.push(dir);
    process.chdir(dir);
    return dir;
  }

  it("returns the explicit path verbatim, never reading pokemap.config.json even when the cwd has none", () => {
    chdirToFreshDir(); // no pokemap.config.json here at all
    expect(resolveRoot("/some/explicit/root")).toBe("/some/explicit/root");
  });

  it("falls back to pokemap.config.json's projectPath in the cwd when no explicit path is given", () => {
    const dir = chdirToFreshDir();
    writeFileSync(join(dir, "pokemap.config.json"), JSON.stringify({ projectPath: "/from/config" }));
    expect(resolveRoot(undefined)).toBe("/from/config");
  });

  it("refuses, naming the cwd and the --project alternative, when neither an explicit path nor a config file is given", () => {
    const dir = chdirToFreshDir();
    expect(() => resolveRoot(undefined)).toThrow(new RegExp(`no pokemap\\.config\\.json in .*${dir.split("/").pop()}`));
    expect(() => resolveRoot(undefined)).toThrow(/--project/);
  });
});

describe("layoutNameFor", () => {
  it("delegates the map-name case to Project.layoutForMap, not a hand-rolled lookup", () => {
    // Proves the delegation itself, not just a message string: if
    // layoutNameFor regressed to re-deriving the lookup with
    // proj.map(target).layout + proj.layoutById(...), it would call the
    // stubbed `map`, which throws a message that does NOT match /layouts.json/
    // -- so this fails loudly on that regression instead of passing by
    // accident, the way asserting only the final message could.
    const proj = stubProject({
      map: () => ({ layout: "LAYOUT_DANGLING" }) as unknown as MapData,
      layoutForMap: (name: string) => {
        throw new Error(
          `map ${name} (map.json) references layout LAYOUT_DANGLING, which is not defined in layouts.json`,
        );
      },
    });
    expect(() => layoutNameFor(proj, "SomeMap")).toThrow(/layouts\.json/);
  });
});
