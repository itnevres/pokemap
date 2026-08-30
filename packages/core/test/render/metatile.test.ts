import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderMetatile } from "../../src/render/metatile.js";
import { loadTileset, type TileEntry } from "../../src/load/tilesetData.js";
import { parseTilesetPaths } from "../../src/load/tilesets.js";
import { projectPaths } from "../../src/config/paths.js";
import { defaultProfile } from "../../src/config/engine.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const P = projectPaths(SUBJECT_ROOT);
const PROFILE = defaultProfile("pokeemerald");
const PATHS = parseTilesetPaths(
  readFileSync(P.tilesetHeadersH, "utf8"),
  readFileSync(P.tilesetMetatilesH, "utf8"),
  // BOTH graphics sources. gTileset_General INCBINs its palettes from
  // src/graphics.c, not graphics.h. With graphics.h alone `palettes` comes back
  // empty, every colour lookup misses, drawTile skips every pixel, and this
  // whole file fails for a reason that has nothing to do with rendering.
  [readFileSync(P.tilesetGraphicsH, "utf8"), readFileSync(P.tilesetGraphicsC, "utf8")],
);
const primary = loadTileset(P, PATHS.get("gTileset_General")!, PROFILE);
const secondary = loadTileset(P, PATHS.get("gTileset_Petalburg")!, PROFILE);

const EMERALD = { version: "emerald", tiles: 512, metatiles: 512, pals: 6 } as const;
const HNS = { version: "hns", tiles: 640, metatiles: 640, pals: 7 } as const;

const BLANK: TileEntry = { tile: 0, xFlip: false, yFlip: false, palette: 0 };

/** The distinct RGB triples among the non-transparent pixels. */
const colours = (r: { data: Uint8ClampedArray }): Set<string> => {
  const s = new Set<string>();
  for (let i = 0; i < r.data.length; i += 4) {
    if (r.data[i + 3] !== 0) s.add(`${r.data[i]},${r.data[i + 1]},${r.data[i + 2]}`);
  }
  return s;
};

const opaqueCount = (r: { data: Uint8ClampedArray }): number => {
  let n = 0;
  for (let i = 3; i < r.data.length; i += 4) if (r.data[i] === 255) n++;
  return n;
};

describe("renderMetatile", () => {
  // Every test below names a specific metatile and expects specific art. If the
  // subject repo's tilesets change, this says which assumption died instead of
  // letting five other tests fail obscurely.
  itWithCorpus("the fixtures still have the shape the rest of this file assumes", () => {
    expect(primary.metatileCount).toBe(512); // makes 512 the first secondary id
    expect(secondary.metatileCount).toBe(144);
    expect(primary.palettes[2]?.length).toBe(16); // proves graphics.c was read
    expect(primary.layerType(9)).toBe(0); // NORMAL
    expect(primary.layerType(4)).toBe(1); // COVERED
    expect(primary.layerType(16)).toBe(2); // SPLIT
    // Petalburg metatile 135 is drawn entirely in palette index 9, which is past
    // the emerald split of 6 -- the case that tells absolute palette indexing
    // apart from split-offset indexing.
    const drawn = secondary.metatile(135).filter((e) => e.tile !== 0);
    expect(drawn.length).toBe(4);
    expect(drawn.every((e) => e.palette === 9)).toBe(true);
  });

  itWithCorpus("renders a 16x16 RGBA tile", () => {
    const r = renderMetatile(1, primary, secondary, EMERALD, PROFILE);
    expect(r.width).toBe(16);
    expect(r.height).toBe(16);
    expect(r.data).toHaveLength(16 * 16 * 4);
  });

  itWithCorpus("paints every pixel of a ground metatile from its own palette", () => {
    const r = renderMetatile(1, primary, secondary, EMERALD, PROFILE);

    // A ground tile is fully opaque -- 256 of 256 pixels. "> 0" would pass
    // against a renderer that drew a single pixel and left the rest blank.
    expect(opaqueCount(r)).toBe(16 * 16);

    // Metatile 1 is four copies of tiles 2 and 3 in palette 2, and that art uses
    // exactly three colours. Checking only "every colour is allowed" would pass
    // against a renderer that flood-filled one allowed colour.
    expect(colours(r)).toEqual(new Set(["115,197,164", "65,180,131", "164,213,197"]));

    // And every colour it used must come from a palette this metatile's own
    // tile entries reference -- not an arbitrary fill.
    const allowed = new Set<string>();
    for (const e of primary.metatile(1)) {
      for (const c of primary.palettes[e.palette] ?? []) allowed.add(`${c.r},${c.g},${c.b}`);
    }
    for (const c of colours(r)) expect(allowed.has(c)).toBe(true);
  });

  itWithCorpus("routes id 512 to the SECONDARY tileset under the emerald split", () => {
    // gTileset_General holds exactly 512 metatiles, so 512 is the first
    // secondary id for an emerald layout.
    expect(renderMetatile(512, primary, secondary, EMERALD, PROFILE).outOfRange).toBe(false);

    // Petalburg metatile 0 is blank, so id 512 proves routing but not art.
    // 512 + 135 proves the pixels really come off the secondary sheet.
    const r = renderMetatile(512 + 135, primary, secondary, EMERALD, PROFILE);
    expect(r.outOfRange).toBe(false);
    expect(opaqueCount(r)).toBe(16 * 16);

    // The secondary arm of the range check has its own boundary, one past
    // Petalburg's last real metatile. Deriving the id from
    // secondary.metatileCount rather than hardcoding 656 means this keeps
    // testing the right boundary if the corpus's tileset ever grows or
    // shrinks -- the fixture test above already pins metatileCount at 144.
    // A range check that accidentally compared against primary.metatileCount
    // instead of owner.metatileCount would pass every other test in this file
    // (the hns case below routes to primary and never touches this arm) but
    // fail this one, since 144 < primary's 512.
    expect(
      renderMetatile(512 + secondary.metatileCount, primary, secondary, EMERALD, PROFILE).outOfRange,
    ).toBe(true);
  });

  itWithCorpus("indexes a secondary palette absolutely, not offset by the split", () => {
    // src/fieldmap.c copies from `tileset->palettes[palsInPrimary]` into VRAM
    // slot `palsInPrimary`, so slot p is the secondary's own palettes/PP.pal --
    // never palettes[p - split.pals]. Petalburg metatile 135 draws entirely in
    // palette 9; under the offset rule it would come from palettes[3], and all
    // nine of its colours are absent from palettes[3], so this cannot pass by
    // coincidence.
    const r = renderMetatile(512 + 135, primary, secondary, EMERALD, PROFILE);
    const right = new Set((secondary.palettes[9] ?? []).map((c) => `${c.r},${c.g},${c.b}`));
    const wrong = new Set((secondary.palettes[3] ?? []).map((c) => `${c.r},${c.g},${c.b}`));
    const got = colours(r);

    expect(got.size).toBe(9);
    for (const c of got) expect(right.has(c)).toBe(true);
    for (const c of got) expect(wrong.has(c)).toBe(false);
  });

  itWithCorpus("flags id 512 as out of range under the hns split", () => {
    // Under the 640 split, 512 is a PRIMARY id -- but gTileset_General only has
    // 512 metatiles, so this is exactly open-bugs.md #41. It must be
    // detectable, not silently rendered as garbage.
    expect(renderMetatile(512, primary, secondary, HNS, PROFILE).outOfRange).toBe(true);
  });

  itWithCorpus("flags a negative or non-integer id as out of range", () => {
    // renderMetatile is public API that later tasks (the Task 21 tile picker,
    // the CLI) call with computed ids, not just ids Task 14 has already
    // masked to a valid range. A negative id would otherwise read a negative
    // byte offset out of the metatile binary; a fractional id would silently
    // read the wrong row of entries.
    expect(renderMetatile(-1, primary, secondary, EMERALD, PROFILE).outOfRange).toBe(true);
    expect(renderMetatile(1.5, primary, secondary, EMERALD, PROFILE).outOfRange).toBe(true);
  });

  itWithCorpus("leaves a tile blank when its index runs past the end of its sheet", () => {
    // Pins the behavioural contract exercised nowhere else in this file: a
    // wildly out-of-range tile index must not paint garbage. It does not by
    // itself pin tile.ts's early-return line -- for a well-formed IndexedImage
    // (height always an exact multiple of 8, indices sized exactly
    // width*height) an out-of-sheet read is already `undefined` from the
    // typed array itself, so the guard and its absence are behaviourally
    // identical for every index this test can construct; verified by removing
    // the guard and confirming this assertion still passes. It still locks in
    // the observable contract in case that invariant ever changes.
    const entries: TileEntry[] = [
      { tile: 1_000_000, xFlip: false, yFlip: false, palette: 2 },
      BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK,
    ];
    const r = renderMetatile(1, primary, secondary, EMERALD, PROFILE, { overrideEntries: entries });
    expect(opaqueCount(r)).toBe(0);
  });

  // Layer order is the same for all three layer types. All three of these
  // metatiles have both halves fully opaque, and their halves differ in 256,
  // 186 and 128 of 256 pixels respectively, so a reversed order is visible.
  for (const [id, type] of [[9, "NORMAL"], [4, "COVERED"], [16, "SPLIT"]] as const) {
    itWithCorpus(`paints entries 4-7 over entries 0-3 for a ${type} metatile`, () => {
      const e = primary.metatile(id);
      const plain = renderMetatile(id, primary, secondary, EMERALD, PROFILE);

      // If the top half wins, the result is identical to drawing the top half
      // alone into the bottom slots with a blank top.
      const topOnly = renderMetatile(id, primary, secondary, EMERALD, PROFILE, {
        overrideEntries: [e[4]!, e[5]!, e[6]!, e[7]!, BLANK, BLANK, BLANK, BLANK],
      });
      expect(opaqueCount(plain)).toBe(16 * 16);
      expect(opaqueCount(topOnly)).toBe(16 * 16);
      expect(Buffer.from(plain.data).equals(Buffer.from(topOnly.data))).toBe(true);

      // ...and not identical to drawing the bottom half alone, which is what a
      // renderer that reorders on layerType would produce for COVERED.
      const bottomOnly = renderMetatile(id, primary, secondary, EMERALD, PROFILE, {
        overrideEntries: [e[0]!, e[1]!, e[2]!, e[3]!, BLANK, BLANK, BLANK, BLANK],
      });
      expect(Buffer.from(plain.data).equals(Buffer.from(bottomOnly.data))).toBe(false);
    });
  }

  itWithCorpus("honours x flips", () => {
    const entries = primary.metatile(1);
    const flipped = renderMetatile(1, primary, secondary, EMERALD, PROFILE, {
      overrideEntries: entries.map((e) => ({ ...e, xFlip: !e.xFlip })),
    });
    const plain = renderMetatile(1, primary, secondary, EMERALD, PROFILE);
    expect(Buffer.from(flipped.data).equals(Buffer.from(plain.data))).toBe(false);
  });

  itWithCorpus("honours y flips", () => {
    // Tiles 2 and 3 are asymmetric on both axes -- 9 and 7 mismatched row pairs
    // -- so this discriminates rather than relying on luck.
    const entries = primary.metatile(1);
    const flipped = renderMetatile(1, primary, secondary, EMERALD, PROFILE, {
      overrideEntries: entries.map((e) => ({ ...e, yFlip: !e.yFlip })),
    });
    const plain = renderMetatile(1, primary, secondary, EMERALD, PROFILE);
    expect(Buffer.from(flipped.data).equals(Buffer.from(plain.data))).toBe(false);
  });
});
