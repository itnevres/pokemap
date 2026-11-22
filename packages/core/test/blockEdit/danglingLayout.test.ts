import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { openProject, type Project } from "../../src/project.js";
import { BlockEditRefusal, type TilesetFileEdit } from "../../src/blockEdit/types.js";
import { planGbaBlockEdit, type GbaBlockEditRequest } from "../../src/blockEdit/gbaOps.js";
import { gbaTilesetEffects } from "../../src/blockEdit/save.js";
import { makeGbaFixture } from "./gbaFixture.js";

// Task Q4: one map whose layout id is not in layouts.json (a dangling id) must
// not disable the block editor or the Save plan for every other map.

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

function open(withGhost: boolean): Project {
  const root = makeGbaFixture();
  roots.push(root);
  if (withGhost) {
    const groups = JSON.parse(readFileSync(join(root, "data/maps/map_groups.json"), "utf8")) as { main: string[] };
    groups.main.push("Ghost");
    writeFileSync(join(root, "data/maps/map_groups.json"), JSON.stringify({ group_order: ["main"], main: groups.main }));
    mkdirSync(join(root, "data/maps/Ghost"), { recursive: true });
    writeFileSync(join(root, "data/maps/Ghost/map.json"), JSON.stringify({ id: "Ghost", name: "Ghost", layout: "NOPE" }));
  }
  return openProject(root);
}

function request(p: Project, map: string): GbaBlockEditRequest {
  const t = p.tileset("gTileset_A");
  const entries = [...t.metatile(1)];
  entries[7] = { ...entries[7]!, xFlip: true };
  return { map, metatileId: 1, mode: "ok", from: "map", cell: { x: 1, y: 0 }, draft: { entries, behavior: t.behavior(1), layerType: t.layerType(1) } };
}

const plan = (p: Project, r: GbaBlockEditRequest) => planGbaBlockEdit(p, r, new Map(), new Map());

describe("a dangling layout id (Q4)", () => {
  it("does not stop the planner for a map on a valid layout; the plan equals the plan without the dangling map", () => {
    const clean = open(false);
    const dirty = open(true);
    const want = plan(clean, request(clean, "Emerald"));
    const got = plan(dirty, request(dirty, "Emerald"));
    expect(got.edits.map((e) => e.path)).toEqual(want.edits.map((e) => e.path));
    expect(got.edits.map((e) => e.after)).toEqual(want.edits.map((e) => e.after));
    expect(got.confirm).toBe(want.confirm);
  });

  it("still refuses an edit ON the dangling map, as BAD_VALUE naming the map and the layout, with the original error as cause", () => {
    const p = open(true);
    let caught: unknown;
    try { plan(p, request(p, "Ghost")); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(BlockEditRefusal);
    expect((caught as BlockEditRefusal).code).toBe("BAD_VALUE");
    expect((caught as Error).message).toContain("Ghost");
    expect((caught as Error).message).toContain("NOPE");
    expect((caught as Error).cause).toBeInstanceOf(Error);
    expect(((caught as Error).cause as Error).message).toContain("NOPE");
  });

  it("the Save plan's tileset effects skip the dangling map instead of throwing, and match the clean project", () => {
    const clean = open(false);
    const dirty = open(true);
    const edit = (p: Project): TilesetFileEdit => {
      const path = p.tilesetPaths("gTileset_A").metatilesBin;
      const before = readFileSync(join(p.paths.root, path));
      const after = Buffer.from(before);
      after[0] = (after[0]! + 1) & 0xff;
      return { path, before, after };
    };
    const want = gbaTilesetEffects(clean, [edit(clean)]);
    const got = gbaTilesetEffects(dirty, [edit(dirty)]);
    expect(got).toEqual(want);
    expect(got[0]!.maps).not.toContain("Ghost");
    expect(got[0]!.maps.length).toBeGreaterThan(0);
  });
});
