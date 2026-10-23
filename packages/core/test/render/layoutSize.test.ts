import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectPaths } from "../../src/config/paths.js";
import type { Layout } from "../../src/model/types.js";
import { renderLayout } from "../../src/render/layout.js";
import { stubProject, stubTileset } from "../helpers/stubProject.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pokemap-layout-size-"));
  roots.push(root);
  const layout: Layout = {
    id: "LAYOUT_TEST", name: "Test_Layout", width: 2, height: 2,
    borderWidth: 2, borderHeight: 2, primaryTileset: "Primary", secondaryTileset: "Secondary",
    blockdataFilepath: "map.bin", borderFilepath: "border.bin",
  };
  const proj = stubProject({
    paths: projectPaths(root), layouts: [layout], layoutByName: () => layout,
    splitFor: () => ({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 }),
    tileset: (symbol) => stubTileset(symbol, 1),
  });
  return { proj, layout, path: `${proj.paths.root}/map.bin` };
}

describe("GBA short blockdata refusal", () => {
  it.each([0, 1, 3, 7])("refuses a %i-byte file with exact raw byte counts and both fix pointers", (actualBytes) => {
    const { proj, layout, path } = fixture();
    const original = Buffer.alloc(actualBytes, 173);
    writeFileSync(path, original);
    expect(() => renderLayout(proj, layout.name)).toThrow(new Error(
      `${path} holds ${Math.floor(actualBytes / 2)} blocks but Test_Layout declares 2x2 = 4. ` +
      `map.bin: actual size ${actualBytes} bytes, expected 8 bytes. ` +
      "Change the width/height in data/layouts/layouts.json or trim/extend map.bin from " +
      `${actualBytes} to 8 bytes.`,
    ));
    expect(readFileSync(path)).toEqual(original);
  });

  it("keeps refusing short overrides without reading or inventing disk blocks", () => {
    const { proj, layout } = fixture();
    expect(() => renderLayout(proj, layout.name, { blocksOverride: [{ metatileId: 0, collision: 0, elevation: 0 }] }))
      .toThrow(new Error("the supplied blocksOverride holds 1 blocks but Test_Layout declares 2x2 = 4. " +
        "map.bin: actual size 2 bytes, expected 8 bytes. " +
        "Change the width/height in data/layouts/layouts.json or trim/extend map.bin from 2 to 8 bytes."));
  });
});
