import { describe, it, expect } from "vitest";
import { renderSpeciesIcon, speciesToDirName } from "../../src/render/species.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

describe("speciesToDirName", () => {
  it("lowercases a plain species constant", () => {
    expect(speciesToDirName("SPECIES_ESPEON")).toBe("espeon");
  });

  it("handles the gendered Nidoran names that appear in real tables", () => {
    expect(speciesToDirName("SPECIES_NIDORAN_F")).toBe("nidoran_f");
    expect(speciesToDirName("SPECIES_NIDORAN_M")).toBe("nidoran_m");
  });
});

describe("renderSpeciesIcon", () => {
  itWithCorpus("renders a 32x32 icon frame", () => {
    const r = renderSpeciesIcon(proj, "SPECIES_ESPEON")!;
    expect(r.width).toBe(32);
    expect(r.height).toBe(32);
    let opaque = 0;
    for (let i = 3; i < r.data.length; i += 4) if (r.data[i] === 255) opaque++;
    expect(opaque).toBeGreaterThan(50);
  });

  itWithCorpus("returns undefined for a species with no art rather than throwing", () => {
    expect(renderSpeciesIcon(proj, "SPECIES_NOT_A_REAL_MON")).toBeUndefined();
  });

  itWithCorpus("renders the overworld sprite used by wild signs", () => {
    const r = renderSpeciesIcon(proj, "SPECIES_POLIWRATH", { source: "overworld" })!;
    // The overworld sheet is always cropped to a square size x size frame
    // (createRaster(size, size)) -- pin the exact dimension, matching the
    // icon test's own toBe(32) above, rather than a >0 check that would
    // still pass a wrong width.
    expect(r.width).toBe(32);
    expect(r.height).toBe(32);
  });

  // Teeth proof (Task 28 review) found every test above passes unchanged
  // even with sx/sy's two ternaries swapped -- icon.png stepping
  // horizontally instead of vertically, and vice versa for the overworld
  // sheet -- because `frame * size` is 0 at frame 0 regardless of which
  // variable it is assigned to, so frame 0 alone cannot tell "steps along x"
  // from "steps along y" apart. Confirmed live: with that swap applied,
  // frame 1 below drops from 249 opaque pixels to 0 while every frame-0
  // assertion above still passes. Espeon's icon.png (32x64, two frames) is
  // a real two-frame idle-blink sheet in the subject corpus, not a
  // contrived fixture -- frame 1 is genuinely different bitmap content, not
  // a repeat of frame 0 (confirmed: 261 vs 249 opaque pixels, not byte
  // identical).
  itWithCorpus("reads the icon sheet's SECOND frame from below the first, not beside it", () => {
    const frame0 = renderSpeciesIcon(proj, "SPECIES_ESPEON", { frame: 0 })!;
    const frame1 = renderSpeciesIcon(proj, "SPECIES_ESPEON", { frame: 1 })!;
    expect(frame1.width).toBe(32);
    expect(frame1.height).toBe(32);
    let opaque = 0;
    for (let i = 3; i < frame1.data.length; i += 4) if (frame1.data[i] === 255) opaque++;
    expect(opaque).toBeGreaterThan(50);
    expect(Buffer.from(frame1.data).equals(Buffer.from(frame0.data))).toBe(false);
  });
});
