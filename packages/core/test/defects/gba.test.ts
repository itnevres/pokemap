import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gbaMapDefects } from "../../src/defects/gba.js";
import { projectPaths } from "../../src/config/paths.js";
import { stubProject, stubTileset } from "../helpers/stubProject.js";
import type { Project } from "../../src/project.js";

let root: string;
let proj: Project;
const object = { graphics_id: "OBJ_EVENT_GFX_BOY", x: 1, y: 1, elevation: 0 };
const warp = { x: 1, y: 1, elevation: 0, dest_map: "MAP_DEST", dest_warp_id: "0" };
function editMap(change: Record<string, unknown>, name = "Test") {
  const file = proj.paths.mapJson(name);
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), ...change }));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pokemap-defects-"));
  const paths = projectPaths(root);
  for (const name of ["Test", "Dest"]) mkdirSync(paths.mapDir(name), { recursive: true });
  mkdirSync(join(root, "data/layouts/Test"), { recursive: true });
  writeFileSync(paths.mapGroupsJson, JSON.stringify({ group_order: ["g"], g: ["Test", "Dest"] }));
  for (const name of ["Test", "Dest"]) writeFileSync(paths.mapJson(name), JSON.stringify({
    id: name === "Test" ? "MAP_TEST" : "MAP_DEST", name, layout: "LAYOUT_TEST",
    object_events: [], warp_events: name === "Dest" ? [warp] : [], coord_events: [], bg_events: [], connections: [],
  }));
  writeFileSync(paths.layoutsJson, JSON.stringify({ layouts_table_label: "gLayouts", layouts: [{
    id: "LAYOUT_TEST", name: "Test_Layout", width: 2, height: 2,
    primary_tileset: "Primary", secondary_tileset: "Secondary", blockdata_filepath: "data/layouts/Test/map.bin",
  }] }));
  writeFileSync(join(root, "data/layouts/Test/map.bin"), Buffer.alloc(8));
  proj = stubProject({ paths, constants: { metatilesTotal: 1024 } as Project["constants"],
    splitFor: () => ({ metatiles: 512, tiles: 512, pals: 6, version: "emerald" }),
    tileset: (s) => stubTileset(s, s === "Primary" ? 4 : 2),
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function onlyDefect(kind: string, file: string) {
  const defects = gbaMapDefects(proj, "Test");
  expect(defects).toHaveLength(1);
  expect(defects[0]).toMatchObject({ kind, file });
  expect(defects[0]!.fix).toContain(file);
  return defects[0]!;
}

describe("GBA structural defects", () => {
  it("reports C1: map.bin 561 blocks over, with both repair options and byte counts", () => {
    writeFileSync(join(root, "data/layouts/Test/map.bin"), Buffer.alloc(8 + 561 * 2));
    const d = onlyDefect("size", "data/layouts/Test/map.bin");
    expect(d.message).toContain("1130 bytes");
    expect(d.message).toContain("8 bytes");
    expect(d.fix).toContain("data/layouts/layouts.json");
    expect(d.fix).toContain("width/height");
    expect(d.fix).toContain("trim/extend");
  });
  it.each(["object_events", "warp_events", "coord_events", "bg_events"])("does not report deferred C2 for %s", (key) => {
    editMap({ [key]: [{ ...(key === "warp_events" ? warp : object), x: 2 }] });
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
  });
  it("does not cry wolf on SR1 lights, dummy warps or staged off-map events", () => {
    editMap({ object_events: [{ ...object, graphics_id: "OBJ_EVENT_GFX_LIGHT_SPRITE", x: 8, y: -4 }],
      warp_events: [{ ...warp, x: -1, y: -1 }] });
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
    editMap({ warp_events: [{ ...warp, x: -1, y: 0 }] });
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
  });
  it.each([4, 513, 514])("C3 is split aware for metatile %i", (id) => {
    const bytes = Buffer.alloc(8); bytes.writeUInt16LE(id);
    writeFileSync(join(root, "data/layouts/Test/map.bin"), bytes);
    if (id === 513) expect(gbaMapDefects(proj, "Test")).toEqual([]);
    else onlyDefect("gameplay", "data/layouts/Test/map.bin");
  });
  it("C3 rejects id 600 in the hns primary gap but accepts it in the emerald secondary range", () => {
    const bytes = Buffer.alloc(8); bytes.writeUInt16LE(600);
    writeFileSync(join(root, "data/layouts/Test/map.bin"), bytes);
    proj = { ...proj, tileset: (s) => stubTileset(s, s === "Primary" ? 512 : 128) };
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
    proj = { ...proj, splitFor: () => ({ metatiles: 640, tiles: 640, pals: 7, version: "hns" }) };
    onlyDefect("gameplay", "data/layouts/Test/map.bin");
  });
  it("reports C4: destination MAP_UNKNOWN_X is missing", () => {
    editMap({ warp_events: [{ ...warp, dest_map: "MAP_UNKNOWN_X" }] });
    onlyDefect("build", "data/maps/Test/map.json");
  });
  it("reports C5 at the 0-based count boundary and accepts index zero", () => {
    editMap({ warp_events: [warp] });
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
    editMap({ warp_events: [{ ...warp, dest_warp_id: "1" }] });
    onlyDefect("gameplay", "data/maps/Test/map.json");
  });
  it.each(["MAP_DYNAMIC", "MAP_UNDEFINED", "MAP_NONE"])("accepts special map %s", (dest_map) => {
    editMap({ warp_events: [{ ...warp, dest_map, dest_warp_id: "999" }] });
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
  });
  it.each(["WARP_ID_NONE", "WARP_ID_DYNAMIC", "WARP_ID_SECRET_BASE", "-1", "126", "127", "0x7e", "0x7f"])("accepts special warp id %s", (dest_warp_id) => {
    editMap({ warp_events: [{ ...warp, dest_warp_id }] });
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
  });
  it("reports C6: 65 objects, while 64 is legal", () => {
    editMap({ object_events: Array.from({ length: 64 }, () => object) });
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
    editMap({ object_events: Array.from({ length: 65 }, () => object) });
    onlyDefect("gameplay", "data/maps/Test/map.json");
  });
  it("reports C11: connection to a missing map", () => {
    editMap({ connections: [{ map: "MAP_UNKNOWN_X", offset: 0, direction: "up" }] });
    onlyDefect("build", "data/maps/Test/map.json");
  });
  it("reads map, destination and layout changes from disk on each call", () => {
    editMap({ warp_events: [warp] });
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
    editMap({ warp_events: [] }, "Dest");
    onlyDefect("gameplay", "data/maps/Test/map.json");
    editMap({ warp_events: [] });
    const layouts = JSON.parse(readFileSync(proj.paths.layoutsJson, "utf8"));
    layouts.layouts[0].width = 3;
    writeFileSync(proj.paths.layoutsJson, JSON.stringify(layouts));
    onlyDefect("size", "data/layouts/Test/map.bin");
  });
});
