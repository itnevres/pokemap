import { describe, it, expect } from "vitest";
import { computeSupportsLayoutVersion } from "../src/project.js";
import type { FieldmapConstants } from "../src/config/fieldmap.js";
import type { Layout } from "../src/model/types.js";

// A hand-built baseline with no second boundary set at all -- every "primary"
// field equal to its "primary emerald" counterpart, the collapse
// parseFieldmapConstants performs when an engine defines no *_EMERALD keys.
const collapsedConstants: FieldmapConstants = {
  tilesInPrimary: 512,
  tilesInPrimaryEmerald: 512,
  metatilesInPrimary: 512,
  metatilesInPrimaryEmerald: 512,
  palsInPrimary: 6,
  palsInPrimaryEmerald: 6,
  metatilesTotal: 1024,
};

// A hand-built copy of the subject's real boundary -- 640/640/7 primary vs
// 512/512/6 emerald -- but with no layout carrying a layout_version key, the
// exact shape a Porymap save produces.
const splitConstants: FieldmapConstants = {
  ...collapsedConstants,
  tilesInPrimary: 640,
  metatilesInPrimary: 640,
  palsInPrimary: 7,
};

const noLayoutVersions: Pick<Layout, "layoutVersion">[] = [
  { layoutVersion: undefined },
  { layoutVersion: undefined },
];

const oneHnsLayout: Pick<Layout, "layoutVersion">[] = [
  { layoutVersion: undefined },
  { layoutVersion: "hns" },
];

describe("computeSupportsLayoutVersion", () => {
  it("is false when no term fires: no cfg flag, no split constants, no layout_version keys", () => {
    expect(computeSupportsLayoutVersion({ supportsLayoutVersion: false }, collapsedConstants, noLayoutVersions)).toBe(false);
  });

  it("is true from hasSplitConstants alone -- the case a Porymap save produces", () => {
    // This is the case the whole fix exists for: layout_version keys gone,
    // and a cfg that would default supportsLayoutVersion to false on its own
    // (base_game_version=pokeemerald, say). Only the fieldmap.h boundary
    // difference is left to carry the flag, because Porymap never writes
    // include/fieldmap.h.
    expect(computeSupportsLayoutVersion({ supportsLayoutVersion: false }, splitConstants, noLayoutVersions)).toBe(true);
  });

  it("is true from the cfg term alone, with no split constants and no layout_version keys", () => {
    expect(computeSupportsLayoutVersion({ supportsLayoutVersion: true }, collapsedConstants, noLayoutVersions)).toBe(true);
  });

  it("is true from the layouts.json scan alone", () => {
    expect(computeSupportsLayoutVersion({ supportsLayoutVersion: false }, collapsedConstants, oneHnsLayout)).toBe(true);
  });
});
