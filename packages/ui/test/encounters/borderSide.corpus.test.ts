// @vitest-environment node
import { describe, expect } from "vitest";
import { buildGbcWorld } from "@pokemap/core/src/gbc/world/connections.js";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../../../core/test/gbc/helpers/corpus.js";
import { BORDER_BAND, SIDE_ORDER, bandRect, overlapArea, pickBorderSide } from "../../src/encounters/borderSide.js";

/** Per-side total band overlap of `name` against every other placement (band = GBC 2 blocks). */
function overlaps(name: string) {
  const { placements } = buildGbcWorld(openGbcProject(GBC_SUBJECT_ROOT));
  const self = placements.get(name)!;
  expect(self).toBeDefined();
  const others = [...placements.values()].filter((p) => p.map !== name);
  const by = Object.fromEntries(
    SIDE_ORDER.map((s) => [
      s,
      others.reduce((t, n) => t + overlapArea(bandRect(self, s, BORDER_BAND.gbc), n), 0),
    ]),
  );
  return { side: pickBorderSide(self, others, BORDER_BAND.gbc), by };
}

describe("border side on the real GBC corpus (band 2 blocks)", () => {
  itWithGbcCorpus("NewBarkTown -> top (left 18, right 18, corners only)", () => {
    const r = overlaps("NewBarkTown");
    expect(r.by).toEqual({ left: 18, top: 0, right: 18, bottom: 0 });
    expect(r.side).toBe("top");
  });
  itWithGbcCorpus("Route30 -> left (top 20, bottom 20)", () => {
    const r = overlaps("Route30");
    expect(r.by).toEqual({ left: 0, top: 20, right: 0, bottom: 20 });
    expect(r.side).toBe("left");
  });
});
