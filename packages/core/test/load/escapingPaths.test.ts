import { afterAll, beforeAll, describe, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openProject } from "../../src/project.js";
import { itWithCorpus } from "../helpers/corpus.js";
import { copyGbaTilesetProject, removeGbaTemp } from "../helpers/gbaTilesetProject.js";

// D25: a decomp-sourced path that leaves the project marks that layout or
// tileset broken. The project still opens; nothing else is blocked.
describe("openProject with paths that leave the project", () => {
  let root = "";
  let brokenLayoutId = "";
  let okLayoutId = "";
  beforeAll(() => {
    // itWithCorpus skips the cases, but beforeAll still runs: guard it.
    try { root = copyGbaTilesetProject(); } catch { return; }
    const lj = join(root, "data/layouts/layouts.json");
    const parsed = JSON.parse(readFileSync(lj, "utf8")) as { layouts: Record<string, string>[] };
    brokenLayoutId = parsed.layouts[0]!.id!;
    okLayoutId = parsed.layouts[1]!.id!;
    parsed.layouts[0]!.blockdata_filepath = "../../outside.bin";
    writeFileSync(lj, JSON.stringify(parsed, null, 2));
    const mh = join(root, "src/data/tilesets/metatiles.h");
    const text = readFileSync(mh, "utf8");
    const re = /(gMetatiles_Petalburg\[\]\s*=\s*INCBIN_U16\(")[^"]+("\))/;
    if (!re.test(text)) throw new Error("fixture shape changed: gMetatiles_Petalburg INCBIN not found");
    writeFileSync(mh, text.replace(re, "$1../../outside/metatiles.bin$2"));
  });
  afterAll(() => { if (root) removeGbaTemp(root); });

  itWithCorpus("opens, and marks the layout broken with a defect naming the layout and path", () => {
    const p = openProject(root);
    const bad = p.layoutById(brokenLayoutId)!;
    expect(bad.brokenPaths).toHaveLength(1);
    expect(bad.brokenPaths![0]!.message).toContain(brokenLayoutId);
    expect(bad.brokenPaths![0]!.message).toContain("../../outside.bin");
    expect(p.layoutById(okLayoutId)!.brokenPaths).toBeUndefined();
  });

  itWithCorpus("marks the tileset broken, refuses to load it, and loads the others", () => {
    const p = openProject(root);
    expect(p.tilesetPaths("gTileset_Petalburg").brokenPaths).toHaveLength(1);
    expect(() => p.tileset("gTileset_Petalburg")).toThrow(p.tilesetPaths("gTileset_Petalburg").brokenPaths![0]!.message);
    expect(p.tilesetPaths("gTileset_General").brokenPaths).toBeUndefined();
    expect(p.tileset("gTileset_General").metatileCount).toBeGreaterThan(0);
  });
});
