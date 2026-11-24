import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { openProject } from "../../src/project.js";
import { brokenComponentsOf } from "../../src/brokenComponents.js";
import { makeGbaFixture } from "../blockEdit/gbaFixture.js";
import { breakLayout, breakTileset } from "../helpers/brokenGba.js";

// F1d (adversarial review I2): the validators skip a broken layout or tileset, so the
// CLI needs the list of what was skipped to say "not checked" instead of "clean".

const roots: string[] = [];
const sentinels: string[] = [];
afterEach(() => {
  for (const p of sentinels.splice(0)) rmSync(p, { force: true });
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
function open(breakIt?: (root: string) => string[]) {
  const root = makeGbaFixture();
  roots.push(root);
  if (breakIt) sentinels.push(...breakIt(root));
  return openProject(root);
}

describe("brokenComponentsOf", () => {
  it("is empty for a healthy project", () => {
    expect(brokenComponentsOf(open())).toEqual([]);
  });

  it("lists a broken layout's paths once each, naming the file key and path", () => {
    const found = brokenComponentsOf(open((root) => breakLayout(root, "X")));
    expect(found.map((b) => b.key).sort()).toEqual(["blockdata_filepath", "border_filepath"]);
    expect(found.every((b) => b.path.includes("pokemap-f1d-outside-X"))).toBe(true);
  });

  it("lists a broken tileset once, even though two layouts use it", () => {
    const found = brokenComponentsOf(open((root) => breakTileset(root, "T")));
    expect(found).toHaveLength(1);
    expect(found[0]!.key).toBe(".metatiles");
  });
});
