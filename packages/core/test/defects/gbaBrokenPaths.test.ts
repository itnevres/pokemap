import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { gbaMapDefects, checkGbaMapDefects } from "../../src/defects/gba.js";
import { projectPaths } from "../../src/config/paths.js";
import { stubProject, stubTileset } from "../helpers/stubProject.js";
import { openProject, type Project } from "../../src/project.js";

// Plan H F1c (D25): a layout or tileset whose path leaves the project is
// reported as a defect on the map that uses it; nothing outside the project is
// read, and every other check still runs. The fixture below is the one in
// gba.test.ts, plus the two edits that make a path escape.

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


function breakLayout(path = "../../outside.bin") {
  const lj = projectPaths(root).layoutsJson;
  const parsed = JSON.parse(readFileSync(lj, "utf8")) as { layouts: Record<string, unknown>[] };
  parsed.layouts[0]!.blockdata_filepath = path;
  writeFileSync(lj, JSON.stringify(parsed));
}
function breakTileset() {
  const mh = projectPaths(root).tilesetMetatilesH;
  writeFileSync(mh, readFileSync(mh, "utf8").replace('INCBIN_U16("./Primary.bin")', 'INCBIN_U16("../../outside/Primary.bin")'));
}

describe("GBA defects for paths that leave the project", () => {
  it("a broken layout is one build defect naming the layout and path, with no read outside the project", () => {
    breakLayout();
    const defects = gbaMapDefects(proj, "Test");
    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ kind: "build", file: "data/layouts/layouts.json" });
    expect(defects[0]!.message).toContain("LAYOUT_TEST");
    expect(defects[0]!.message).toContain("../../outside.bin");
    expect(defects[0]!.fix).toContain("data/layouts/layouts.json");
  });

  it.each(["/etc/outside.bin", "C:/outside.bin", "..\\..\\outside.bin"])("a layout path of %s is broken too", (path) => {
    breakLayout(path);
    const defects = gbaMapDefects(proj, "Test");
    expect(defects).toHaveLength(1);
    expect(defects[0]!.message).toContain("LAYOUT_TEST");
  });

  it("a broken tileset is a build defect naming the tileset and path; the layout's size and range checks are skipped, not crashed", () => {
    breakTileset();
    const defects = gbaMapDefects(proj, "Test");
    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ kind: "build", file: "src/data/tilesets/headers.h" });
    expect(defects[0]!.message).toContain("gTileset_Primary");
    expect(defects[0]!.message).toContain("../../outside/Primary.bin");
  });

  it("a broken layout and a broken tileset are both reported", () => {
    breakLayout();
    breakTileset();
    const messages = gbaMapDefects(proj, "Test").map((d) => d.message);
    expect(messages).toHaveLength(2);
    expect(messages.some((m) => m.includes("LAYOUT_TEST"))).toBe(true);
    expect(messages.some((m) => m.includes("gTileset_Primary"))).toBe(true);
  });

  it("nothing else is blocked: warp checks still run next to a broken layout", () => {
    breakLayout();
    const file = proj.paths.mapJson("Test");
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), warp_events: [{ ...warp, dest_map: "MAP_NOWHERE" }] }));
    const defects = gbaMapDefects(proj, "Test");
    expect(defects).toHaveLength(2);
    expect(defects.some((d) => d.message.includes("MAP_NOWHERE"))).toBe(true);
    expect(checkGbaMapDefects(proj, "Test").incomplete).toEqual([]);
  });
});

describe("GBA defects for paths that leave the project: scope, order and containment", () => {
  const breakIncbin = (from: string, to: string) => {
    const mh = projectPaths(root).tilesetMetatilesH;
    const text = readFileSync(mh, "utf8");
    expect(text).toContain(from);
    writeFileSync(mh, text.replace(from, to));
  };

  it("a broken secondary tileset is reported on its own", () => {
    breakIncbin('INCBIN_U16("./Secondary.bin")', 'INCBIN_U16("../../outside/Secondary.bin")');
    const defects = gbaMapDefects(proj, "Test");
    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ kind: "build", file: "src/data/tilesets/headers.h" });
    expect(defects[0]!.message).toContain("gTileset_Secondary");
  });

  it("a broken tileset this map does not use is not reported, and the layout checks still run", () => {
    const paths = projectPaths(root);
    writeFileSync(paths.tilesetHeadersH, readFileSync(paths.tilesetHeadersH, "utf8") +
      "\nconst struct Tileset gTileset_Other = {\n.metatiles = gMetatiles_Other,\n.metatileAttributes = gAttributes_Other,\n};\n");
    writeFileSync(paths.tilesetMetatilesH, readFileSync(paths.tilesetMetatilesH, "utf8") +
      '\nconst u16 gMetatiles_Other[] = INCBIN_U16("../../outside/Other.bin");\nconst u16 gAttributes_Other[] = INCBIN_U16("./Other.attributes.bin");\n');
    writeFileSync(join(root, "data/layouts/Test/map.bin"), Buffer.alloc(8 + 4)); // wrong size: the size check must still run
    const defects = gbaMapDefects(proj, "Test");
    expect(defects).toHaveLength(1);
    expect(defects[0]!.kind).toBe("size");
    expect(defects.some((d) => d.message.includes("gTileset_Other"))).toBe(false);
  });

  it("the same broken tileset as primary and secondary is reported once", () => {
    breakIncbin('INCBIN_U16("./Primary.bin")', 'INCBIN_U16("../../outside/Primary.bin")');
    const lj = projectPaths(root).layoutsJson;
    const parsed = JSON.parse(readFileSync(lj, "utf8")) as { layouts: Record<string, unknown>[] };
    parsed.layouts[0]!.secondary_tileset = "gTileset_Primary";
    writeFileSync(lj, JSON.stringify(parsed));
    const defects = gbaMapDefects(proj, "Test");
    expect(defects).toHaveLength(1);
    expect(defects[0]!.message).toContain("gTileset_Primary");
  });

  it("path defects come first, before the other checks' defects", () => {
    breakLayout();
    const file = proj.paths.mapJson("Test");
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), warp_events: [{ ...warp, dest_map: "MAP_NOWHERE" }] }));
    const defects = gbaMapDefects(proj, "Test");
    expect(defects).toHaveLength(2);
    expect(defects[0]!.message).toContain("LAYOUT_TEST");
    expect(defects[1]!.message).toContain("MAP_NOWHERE");
  });

  it("never reads the escaping file: a wrong-sized file that exists there adds no size defect", () => {
    const sentinel = join(root, "..", `${basename(root)}-sentinel.bin`);
    writeFileSync(sentinel, Buffer.alloc(3));
    try {
      breakLayout(`../${basename(sentinel)}`);
      const defects = gbaMapDefects(proj, "Test");
      expect(defects).toHaveLength(1);
      expect(defects[0]!.message).toContain("LAYOUT_TEST");
    } finally {
      rmSync(sentinel, { force: true });
    }
  });
});
