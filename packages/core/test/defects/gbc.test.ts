import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gbcMapDefects, checkGbcMapDefects } from "../../src/defects/gbc.js";
import { openGbcProject, type GbcProject } from "../../src/gbc/project.js";
import { parseMapEvents, outOfBoundsEventDefects } from "../../src/gbc/load/events.js";

let root: string;
let proj: GbcProject;
const object = "\tobject_event 1, 1, SPRITE_TEST, STILL, 0, 0, -1, -1, 0, SCRIPT, 0, Script, -1";
function events(name: string, warp = "", objects = "") {
  return `${name}_MapScripts:\n\tdef_scene_scripts\n\tdef_callbacks\n${name}_MapEvents:\n\tdb 0, 0\n\tdef_warp_events\n${warp}\n\tdef_coord_events\n\tdef_bg_events\n\tdef_object_events\n${objects}\n`;
}
function write(file: string, text: string | Buffer) { writeFileSync(join(root, file), text); }
function edit(file: string, from: string, to: string) { write(file, readFileSync(join(root, file), "utf8").replace(from, to)); }
function warp(dest = "DEST", index = 1) { write("maps/Test.asm", events("Test", `\twarp_event 1, 1, ${dest}, ${index}`)); }
function check() { return gbcMapDefects(proj, "Test"); }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pokemap-gbc-defects-"));
  for (const dir of ["constants", "data/maps", "maps", "gfx"]) mkdirSync(join(root, dir), { recursive: true });
  write("constants/map_constants.asm", "\tnewgroup Test\n\tmap_const TEST, 2, 2\n\tmap_const DEST, 2, 2\n");
  write("data/maps/attributes.asm", "\tmap_attributes Test, TEST, 0, 0\n\tmap_attributes Dest, DEST, 0, 0\n");
  write("data/maps/maps.asm", "MapGroupPointers::\n\tdw MapGroup_Test\nMapGroup_Test:\n\tmap Test, TILESET_TEST, TOWN, L, M, 0, P, F\n\tmap Dest, TILESET_TEST, TOWN, L, M, 0, P, F\n");
  write("data/maps/blocks.asm", 'Test_Blocks:\n\tINCBIN "maps/Shared.blk"\nDest_Blocks:\n\tINCBIN "maps/Shared.blk"\n');
  write("constants/tileset_constants.asm", "\tconst_def\n\tconst TILESET_TEST\n");
  write("data/tilesets.asm", "Tilesets::\n\ttileset TilesetTest\n");
  write("gfx/tilesets.asm", 'TilesetTestMeta::\n\tINCBIN "gfx/meta.bin"\n');
  write("gfx/meta.bin", Buffer.alloc(3 * 16));
  write("maps/Shared.blk", Buffer.from([0, 1, 2, 0]));
  write("maps/Test.asm", events("Test"));
  write("maps/Dest.asm", events("Dest", "\twarp_event 1, 1, TEST, 1"));
  proj = openGbcProject(root);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it("C7-C9 report unknown object references only when supplied an index", () => {
  write("maps/Test.asm", events("Test", "", object.replace("Script, -1", "MissingScript, EVENT_MISSING")));
  expect(check()).toEqual([]);
  const hits = gbcMapDefects(proj, "Test", { symbols: { labels: new Set(), constants: new Set() } });
  expect(hits.map((d) => d.message.slice(0, 2))).toEqual(["C7", "C8", "C9"]);
});
it("SR2 accepts backup flags and variable sprite expressions", () => {
  write("maps/Test.asm", events("Test", "", object.replace("SPRITE_TEST", "SPRITE_VARS + 1")));
  expect(gbcMapDefects(proj, "Test", { symbols: { labels: new Set(["Script"]), constants: new Set(["SPRITE_VARS"]) } })).toEqual([]);
});
it("C7 resolves local callback labels in scope and catches missing local labels", () => {
  const source = events("Test").replace("\tdef_callbacks", "\tdef_callbacks\n\tcallback MAPCALLBACK_NEWMAP, .Local\n.Local:\n\tendcallback");
  write("maps/Test.asm", source);
  const symbols = { labels: new Set(["Test_MapScripts.Local"]), constants: new Set<string>() };
  expect(gbcMapDefects(proj, "Test", { symbols })).toEqual([]);
  write("maps/Test.asm", source.replace(", .Local", ", .Missing"));
  expect(gbcMapDefects(proj, "Test", { symbols })[0]!.message).toContain("Test_MapScripts.Missing");
});
it("C9 includes stored hidden-item and trainer flags", () => {
  const source = events("Test", "", object.replace("SCRIPT, 0, Script, -1", "OBJECTTYPE_TRAINER, 0, Trainer, -1"))
    .replace("\tdef_bg_events", "\tdef_bg_events\n\tbg_event 1, 1, BGEVENT_ITEM, Hidden")
    + "Hidden:\n\thiddenitem POTION, EVENT_HIDDEN_MISSING\nTrainer:\n\ttrainer YOUNGSTER, JOEY, EVENT_TRAINER_MISSING, Seen, Beaten, 0, After\n";
  write("maps/Test.asm", source);
  const hits = gbcMapDefects(proj, "Test", { symbols: { labels: new Set(["Hidden", "Trainer"]), constants: new Set(["SPRITE_TEST"]) } });
  expect(hits.map((d) => d.message.slice(0, 2))).toEqual(["C9", "C9"]);
  expect(hits[0]!.message).toContain("EVENT_HIDDEN_MISSING");
  expect(hits[1]!.message).toContain("EVENT_TRAINER_MISSING");
});

it("C1 names map_const and both repairs with exact byte counts and the shared blk path", () => {
  write("maps/Shared.blk", Buffer.alloc(5));
  const hits = check();
  expect(hits).toHaveLength(1);
  expect(hits[0]!.kind).toBe("size");
  expect(hits[0]!.fix).toContain("TEST map_const dimensions in constants/map_constants.asm");
  expect(hits[0]!.fix).toContain("trim/extend maps/Shared.blk from 5 to 4 bytes");
});
it("C1 also reports short blockdata without inventing blocks", () => {
  write("maps/Shared.blk", Buffer.alloc(3));
  expect(check()[0]!.message).toContain("actual size 3 bytes, expected 4 bytes");
});
it("C2 uses a step grid in the legacy helper, but is deferred from the catalogue", () => {
  const text = events("Test", "\twarp_event 4, 1, DEST, 1", object.replace("1, 1,", "3, 3,"));
  write("maps/Test.asm", text);
  expect(outOfBoundsEventDefects(proj.map("Test"), parseMapEvents(text, "Test"))).toHaveLength(1);
  expect(check()).toEqual([]);
});
it("C3 permits zero and the last metatile but rejects the count boundary", () => {
  expect(check()).toEqual([]);
  write("maps/Shared.blk", Buffer.from([0, 2, 3, 3]));
  expect(check()).toHaveLength(1);
  expect(check()[0]!.message).toContain("Block id(s) 3");
  write("gfx/meta.bin", Buffer.alloc(4 * 16));
  expect(check()).toEqual([]);
});
it("C3 ignores preserved tail bytes", () => {
  write("maps/Shared.blk", Buffer.from([0, 1, 2, 0, 255]));
  expect(check().map((d) => d.kind)).toEqual(["size"]);
});
it("C4 rejects unknown destination constants even for backup warps", () => {
  warp("UNKNOWN", -1);
  expect(check()[0]!.kind).toBe("build");
  expect(check()[0]!.message).toContain("UNKNOWN");
});
it.each([-1, 1])("C5 accepts destination index %i", (index) => {
  warp("DEST", index);
  expect(check()).toEqual([]);
});
it.each([0, 2, -2])("C5 rejects destination index %i", (index) => {
  warp("DEST", index);
  expect(check()).toHaveLength(1);
  expect(check()[0]!.message).toContain("(1-based)");
});
it("C5 rereads destination event counts", () => {
  warp();
  expect(check()).toEqual([]);
  write("maps/Dest.asm", events("Dest"));
  expect(check()[0]!.kind).toBe("gameplay");
});
it.each(["missing section", "sixteen objects"])("C5 isolates a destination with %s and retains other defects", (bad) => {
  warp();
  write("maps/Shared.blk", Buffer.alloc(5));
  write("maps/Dest.asm", bad === "missing section" ? "Dest_MapScripts:\n" : events("Dest", "", Array(16).fill(object).join("\n")));
  const result = checkGbcMapDefects(proj, "Test");
  expect(result.defects.map((d) => d.kind)).toEqual(["size"]);
  expect(result.incomplete).toEqual([{ file: "maps/Dest.asm", reason: expect.stringContaining("C5") }]);
});
it("C5 backup warp skips reading malformed destination events", () => {
  warp("DEST", -1);
  write("maps/Dest.asm", "broken");
  expect(checkGbcMapDefects(proj, "Test")).toEqual({ defects: [], incomplete: [] });
});
it.each(["Missing, DEST", "Dest, UNKNOWN", "Dest, TEST"])("C11 checks both name and constant: %s", (target) => {
  edit("data/maps/attributes.asm", "\tmap_attributes Dest", `\tconnection north, ${target}, 0\n\tmap_attributes Dest`);
  expect(check()).toHaveLength(1);
  expect(check()[0]!.file).toBe("data/maps/attributes.asm");
});
it("C11 accepts a valid connection", () => {
  edit("data/maps/attributes.asm", "\tmap_attributes Dest", "\tconnection north, Dest, DEST, 0\n\tmap_attributes Dest");
  expect(check()).toEqual([]);
});
it("C6 allows 15 objects and refuses 16 with the repair pointer", () => {
  write("maps/Test.asm", events("Test", "", Array(15).fill(object).join("\n")));
  expect(check()).toEqual([]);
  write("maps/Test.asm", events("Test", "", Array(16).fill(object).join("\n")));
  expect(check).toThrow("reduce object_event entries in maps/Test.asm to at most 15");
});
it("does not surface SR4 object_const_def warnings or implement C7-C9", () => {
  write("maps/Test.asm", "\tobject_const_def\n\tconst FIRST\n" + events("Test", "", [object, object].join("\n")));
  expect(check()).toEqual([]);
});
it("rereads map_const dimensions on the same project", () => {
  expect(check()).toEqual([]);
  edit("constants/map_constants.asm", "TEST, 2, 2", "TEST, 3, 2");
  expect(check()[0]!.message).toContain("expected 6 bytes");
});
