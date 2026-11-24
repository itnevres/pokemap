import { describe, expect, it } from "vitest";
import { renderLayout } from "../../src/render/layout.js";
import { PathEscapeError } from "../../src/gbc/load/pathGuard.js";
import { stubProject } from "../helpers/stubProject.js";
import type { Layout } from "../../src/model/types.js";

// Plan H F1c (D25): a layout whose path leaves the project cannot be rendered.
// The stub throws "should not be called" from splitFor/tileset, so a guard that
// runs late (or not at all) fails with that message instead of the refusal.
const broken: Layout = {
  id: "LAYOUT_BROKEN", name: "Broken_Layout", width: 2, height: 2, borderWidth: 2, borderHeight: 2,
  primaryTileset: "gTileset_A", secondaryTileset: "gTileset_B",
  borderFilepath: "data/layouts/Broken/border.bin", blockdataFilepath: "../../outside.bin",
  brokenPaths: [{
    file: "data/layouts/layouts.json", key: "blockdata_filepath", path: "../../outside.bin",
    message: 'layout LAYOUT_BROKEN: blockdata_filepath "../../outside.bin" leaves the project.',
    fix: "Change blockdata_filepath of layout LAYOUT_BROKEN in data/layouts/layouts.json to a path inside the project.",
  }],
};

describe("renderLayout with a layout path that leaves the project", () => {
  const proj = stubProject({ layoutByName: (n) => (n === broken.name ? broken : undefined) });

  it("refuses with a PathEscapeError carrying the broken path, before reading or loading anything", () => {
    let caught: unknown;
    try { renderLayout(proj, "Broken_Layout"); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(PathEscapeError);
    expect((caught as PathEscapeError).brokenPath).toBe(broken.brokenPaths![0]);
    expect((caught as Error).message).toContain("LAYOUT_BROKEN");
  });

  it("refuses even when the caller supplies blocksOverride", () => {
    expect(() => renderLayout(proj, "Broken_Layout", { blocksOverride: [] })).toThrow(PathEscapeError);
  });

  it("refuses when a border is requested too", () => {
    expect(() => renderLayout(proj, "Broken_Layout", { border: 1 })).toThrow(PathEscapeError);
  });
});
