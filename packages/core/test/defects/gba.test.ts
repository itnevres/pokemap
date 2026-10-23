import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gbaMapDefects, checkGbaMapDefects } from "../../src/defects/gba.js";
import { projectPaths } from "../../src/config/paths.js";
import { stubProject, stubTileset } from "../helpers/stubProject.js";
import { openProject, type Project } from "../../src/project.js";

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
    primary_tileset: "gTileset_Primary", secondary_tileset: "gTileset_Secondary", blockdata_filepath: "data/layouts/Test/map.bin",
  }] }));
  writeFileSync(join(root, "data/layouts/Test/map.bin"), Buffer.alloc(8));
  mkdirSync(join(root, "src/data/tilesets"), { recursive: true });
  writeFileSync(paths.tilesetHeadersH, ["Primary", "Secondary"].map((s) =>
    `const struct Tileset gTileset_${s} = {
.metatiles = gMetatiles_${s},
.metatileAttributes = gAttributes_${s},
};`).join("\n"));
  writeFileSync(paths.tilesetMetatilesH, ["Primary", "Secondary"].map((s) =>
    `const u16 gMetatiles_${s}[] = INCBIN_U16("./${s}.bin");
const u16 gAttributes_${s}[] = INCBIN_U16("./${s}.attributes.bin");`).join("\n"));
  writeFileSync(paths.tilesetGraphicsH, "");
  writeFileSync(paths.tilesetGraphicsC, "");
  writeFileSync(join(root, "Primary.bin"), Buffer.alloc(4 * 16));
  writeFileSync(join(root, "Secondary.bin"), Buffer.alloc(2 * 16));
  mkdirSync(join(root, "include"), { recursive: true });
  writeFileSync(paths.fieldmapH, "");
  mkdirSync(join(root, "include/constants"), { recursive: true });
  writeFileSync(join(root, "include/constants/map_groups.h"), "#define MAP_TEST (0 | (0 << 8))\n#define MAP_DEST (1 | (0 << 8))\n");
  writeFileSync(join(root, "Primary.attributes.bin"), Buffer.alloc(8));
  writeFileSync(join(root, "Secondary.attributes.bin"), Buffer.alloc(4));
  writeFileSync(join(root, "tiles.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAMAAAAoyzS7AAAAA1BMVEUAAACnej3aAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==", "base64"));
  proj = stubProject({ paths, constants: { metatilesTotal: 1024 } as Project["constants"],
    splitFor: () => ({ metatiles: 512, tiles: 512, pals: 6, version: "emerald" }),
    tileset: (s) => stubTileset(s, s === "gTileset_Primary" ? 4 : 2),
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
  it("C7-C9 report unknown references and skip checks without an index", () => {
    editMap({ object_events: [{ ...object, script: "MissingScript", flag: "FLAG_MISSING", graphics_id: "OBJ_EVENT_GFX_MISSING" }] });
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
    const hits = gbaMapDefects(proj, "Test", { symbols: { labels: new Set(), constants: new Set() } });
    expect(hits.map((d) => d.message.slice(0, 2))).toEqual(["C7", "C8", "C9"]);
    expect(hits.every((d) => d.kind === "build" && d.fix.includes("data/maps/Test/map.json"))).toBe(true);
  });
  it("SR2 accepts null scripts, zero flags, variable graphics and known expressions", () => {
    const symbols = { labels: new Set<string>(), constants: new Set(["OBJ_EVENT_GFX_MON_BASE", "SPECIES_MACHAMP", "FLAG_NONE"]) };
    for (const script of ["0x0", "NULL"]) for (const graphics_id of ["OBJ_EVENT_GFX_VAR_0", "OBJ_EVENT_GFX_MON_BASE+SPECIES_MACHAMP", "OBJ_EVENT_GFX_SPECIES(ZYGARDE)"]) {
      editMap({ object_events: [{ ...object, script, flag: "0", graphics_id }] });
      expect(gbaMapDefects(proj, "Test", { symbols })).toEqual([]);
    }
  });
  it("C7 covers coord/background scripts and C9 hidden-item flags", () => {
    editMap({ coord_events: [{ x: 0, y: 0, script: "MissingCoord" }], bg_events: [
      { type: "sign", script: "MissingSign" }, { type: "hidden_item", flag: "FLAG_MISSING_ITEM" },
    ] });
    const hits = gbaMapDefects(proj, "Test", { symbols: { labels: new Set(), constants: new Set() } });
    expect(hits.map((d) => d.message.slice(0, 2))).toEqual(["C7", "C7", "C9"]);
  });
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
    writeFileSync(join(root, "Primary.bin"), Buffer.alloc(512 * 16));
    writeFileSync(join(root, "Secondary.bin"), Buffer.alloc(128 * 16));
    proj = { ...proj, tileset: (s) => stubTileset(s, s === "gTileset_Primary" ? 512 : 128) };
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
    proj = { ...proj, splitFor: () => ({ metatiles: 640, tiles: 640, pals: 7, version: "hns" }) };
    onlyDefect("gameplay", "data/layouts/Test/map.bin");
  });
  it("reports C4: destination MAP_UNKNOWN_X is missing", () => {
    editMap({ warp_events: [{ ...warp, dest_map: "MAP_UNKNOWN_X" }] });
    onlyDefect("build", "data/maps/Test/map.json");
  });
  it("reports C4 for the undefined MAP_NONE destination", () => {
    editMap({ warp_events: [{ ...warp, dest_map: "MAP_NONE" }] });
    expect(onlyDefect("build", "data/maps/Test/map.json").message).toContain("MAP_NONE");
  });
  it.each(["Primary", "Secondary"])("C3 reads changed %s metatiles on the same Project", (tileset) => {
    proj = openProject(root);
    // Warm the actual Project cache before changing its on-disk source.
    proj.tileset(`gTileset_${tileset}`);
    const bytes = Buffer.alloc(8); bytes.writeUInt16LE(tileset === "Primary" ? 3 : 513);
    writeFileSync(join(root, "data/layouts/Test/map.bin"), bytes);
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
    writeFileSync(join(root, `${tileset}.bin`), Buffer.alloc(16));
    onlyDefect("gameplay", "data/layouts/Test/map.bin");
    writeFileSync(join(root, `${tileset}.bin`), Buffer.alloc(4 * 16));
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
  });
  it.each(["{", '{"id":"MAP_DEST","warp_events":{}}'])("keeps selected defects when an unrelated map is unreadable: %s", (bad) => {
    writeFileSync(proj.paths.mapJson("Dest"), bad);
    writeFileSync(join(root, "data/layouts/Test/map.bin"), Buffer.alloc(10));
    // Its hidden id must not produce false missing-destination/connection warnings.
    editMap({ warp_events: [warp], connections: [{ map: "MAP_DEST", offset: 0, direction: "up" }] });
    onlyDefect("size", "data/layouts/Test/map.bin");
  });
  it.each(["warp", "connection"])("withholds a missing %s target while an unrelated map is unreadable", (kind) => {
    writeFileSync(proj.paths.mapJson("Dest"), "{");
    editMap(kind === "warp" ? { warp_events: [{ ...warp, dest_map: "MAP_UNKNOWN_X" }] }
      : { connections: [{ map: "MAP_UNKNOWN_X", offset: 0, direction: "up" }] });
    const result = checkGbaMapDefects(proj, "Test");
    expect(result.defects).toEqual([]);
    expect(result.incomplete).toEqual([{ file: "data/maps/Dest/map.json", reason: expect.any(String) }]);
    expect(result.incomplete[0]!.reason.length).toBeGreaterThan(0);
  });
  it.each(["warp", "connection"])("reports a missing %s target when every map is readable", (kind) => {
    editMap(kind === "warp" ? { warp_events: [{ ...warp, dest_map: "MAP_UNKNOWN_X" }] }
      : { connections: [{ map: "MAP_UNKNOWN_X", offset: 0, direction: "up" }] });
    const result = checkGbaMapDefects(proj, "Test");
    expect(result.defects).toEqual([expect.objectContaining({ kind: "build", message: expect.stringContaining("MAP_UNKNOWN_X") })]);
    expect(result.incomplete).toEqual([]);
  });
  it("does not report unreadable destinations whose declared ID differs from the directory name", () => {
    writeFileSync(join(root, "include/constants/map_groups.h"), "#define MAP_CUSTOM_TARGET (1 | (0 << 8))\n");
    writeFileSync(proj.paths.mapJson("Dest"), "{");
    editMap({ warp_events: [{ ...warp, dest_map: "MAP_CUSTOM_TARGET" }],
      connections: [{ map: "MAP_CUSTOM_TARGET", offset: 0, direction: "up" }] });
    const result = checkGbaMapDefects(proj, "Test");
    expect(result.defects).toEqual([]);
    expect(result.incomplete).toEqual([{ file: "data/maps/Dest/map.json", reason: expect.any(String) }]);
  });
  it("withholds unresolved targets when destination event parsing fails", () => {
    writeFileSync(proj.paths.mapJson("Dest"), '{"id":"MAP_CUSTOM_TARGET","warp_events":{}}');
    editMap({ warp_events: [{ ...warp, dest_map: "MAP_CUSTOM_TARGET" }] });
    expect(checkGbaMapDefects(proj, "Test").defects).toEqual([]);
  });
  it("does not guess the ID of an unreadable custom-ID destination without a header", () => {
    rmSync(join(root, "include/constants/map_groups.h"));
    editMap({ id: "MAP_CUSTOM_TARGET" }, "Dest");
    writeFileSync(proj.paths.mapJson("Dest"), "{");
    editMap({ warp_events: [{ ...warp, dest_map: "MAP_CUSTOM_TARGET" }],
      connections: [{ map: "MAP_CUSTOM_TARGET", offset: 0, direction: "up" }] });
    const result = checkGbaMapDefects(proj, "Test");
    expect(result.defects).toEqual([]);
    expect(result.incomplete).toEqual([{ file: "data/maps/Dest/map.json", reason: expect.any(String) }]);
  });
  it("returns an exact clean result with no incomplete reads", () => {
    expect(checkGbaMapDefects(proj, "Test")).toEqual({ defects: [], incomplete: [] });
  });
  it("still checks a readable destination's warp count with an unreadable third map", () => {
    mkdirSync(proj.paths.mapDir("Other"), { recursive: true });
    writeFileSync(proj.paths.mapGroupsJson, JSON.stringify({ group_order: ["g"], g: ["Test", "Dest", "Other"] }));
    writeFileSync(proj.paths.mapJson("Other"), "{");
    editMap({ warp_events: [{ ...warp, dest_warp_id: "1" }] });
    expect(onlyDefect("gameplay", "data/maps/Test/map.json").message).toContain("destination index 1");
  });
  it.each(["{", '{"warp_events":{}}'])("names an unreadable selected map: %s", (bad) => {
    writeFileSync(proj.paths.mapJson("Test"), bad);
    expect(() => gbaMapDefects(proj, "Test")).toThrow("data/maps/Test/map.json");
  });
  it("reports C5 at the 0-based count boundary and accepts index zero", () => {
    editMap({ warp_events: [warp] });
    expect(gbaMapDefects(proj, "Test")).toEqual([]);
    editMap({ warp_events: [{ ...warp, dest_warp_id: "1" }] });
    onlyDefect("gameplay", "data/maps/Test/map.json");
  });
  it.each(["MAP_DYNAMIC", "MAP_UNDEFINED"])("accepts special map %s", (dest_map) => {
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
