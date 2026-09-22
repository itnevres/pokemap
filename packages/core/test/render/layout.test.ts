import { describe, it, expect } from "vitest";
import { renderLayout } from "../../src/render/layout.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

const opaqueCount = (r: { data: Uint8ClampedArray }): number => {
  let n = 0;
  for (let i = 3; i < r.data.length; i += 4) if (r.data[i] === 255) n++;
  return n;
};

describe("renderLayout", () => {
  itWithCorpus("renders PetalburgCity at 16px per block, and actually paints it", () => {
    // renderLayout takes a LAYOUT name, which ends in _Layout. Passing the map
    // name "PetalburgCity" throws -- the three namespaces (map, layout, layout
    // directory) look alike and are not interchangeable.
    const r = renderLayout(proj, "PetalburgCity_Layout");
    expect(r.width).toBe(30 * 16);
    expect(r.height).toBe(30 * 16);

    // This is the only thing in the file that defends openProject reading BOTH
    // graphics sources. Drop src/graphics.c and gTileset_General -- which is
    // PetalburgCity's primary -- resolves an empty palette array, drawTile
    // skips every pixel, and the layout comes out entirely transparent. Every
    // other assertion here survives that: the dimensions are still right,
    // nothing throws, and outOfRangeCount is about metatile ids rather than
    // palettes. An outdoor town is opaque in all 230,400 of its pixels, so the
    // exact count is the assertion, not "> 0".
    expect(opaqueCount(r)).toBe(r.width * r.height);
  });

  itWithCorpus("supportsLayoutVersion survives a Porymap save that deletes layout_version keys", () => {
    // The subject cfg says base_game_version=pokeemerald, and Porymap deletes
    // every `layout_version` key it does not recognise when it saves
    // layouts.json -- it did exactly that to this repo two days before this
    // test was written. If supportsLayoutVersion depended only on the cfg term
    // and the layouts.json scan, a post-save read of this project would come
    // back false, Plan 2's missing-layout-version refusal would never fire,
    // and every hns/frlg layout would silently resolve to the emerald 512
    // boundary. hasSplitConstants in project.ts is the term that survives that
    // save, because Porymap never writes include/fieldmap.h (I8).
    expect(proj.constants.metatilesInPrimary).not.toBe(proj.constants.metatilesInPrimaryEmerald);
    // Pin that the flag is NOT coming from the cfg term -- this tree's cfg
    // says plain pokeemerald, which defaults supportsLayoutVersion to false.
    expect(proj.profile.baseGameVersion).toBe("pokeemerald");
    expect(proj.profile.supportsLayoutVersion).toBe(true);
  });

  itWithCorpus("refuses a map name where a layout name is required", () => {
    expect(() => renderLayout(proj, "PetalburgCity")).toThrow(/unknown layout/);
    expect(proj.layoutForMap("PetalburgCity").name).toBe("PetalburgCity_Layout");
  });

  itWithCorpus("renders an emerald and an hns layout in the same session, both fully in range", () => {
    // If this fails with layoutVersion undefined, layouts.json has been saved
    // by Porymap, which drops the key it does not know. That is the tool gap
    // this project exists to close; splice the keys back before reading on.
    const emerald = proj.layoutForMap("PetalburgCity");
    expect(emerald.layoutVersion).toBe("emerald");

    // Assert the resolution directly, not only its downstream effect. This is
    // invariant I1's actual claim, and it fails instantly against a splitFor
    // that ignores its argument.
    expect(proj.splitFor(emerald)).toEqual({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 });

    // Name the hns layout rather than taking the first one. `.find()` picks
    // LittlerootTown_BrendansHouse_1F_Layout, an 11x9 interior whose metatile
    // ids are low enough to stay in range under the WRONG 512 boundary as well
    // as the right 640 one -- so the test written to prove per-layout split
    // resolution could not actually catch a splitFor hardcoded to emerald.
    // CherrygroveCity is one of 211 hns layouts that do discriminate: in range
    // under 640, and 72 blocks out of range under 512.
    const hns = proj.layoutByName("CherrygroveCity_Layout");
    expect(hns).toBeDefined();
    expect(hns!.layoutVersion).toBe("hns");
    expect(proj.splitFor(hns!)).toEqual({ version: "hns", tiles: 640, metatiles: 640, pals: 7 });

    expect(renderLayout(proj, emerald.name).outOfRangeCount).toBe(0);
    expect(renderLayout(proj, hns!.name).outOfRangeCount).toBe(0);

    // Assert the negative too. Zeroes prove nothing about a counter that is
    // never incremented -- Saffron_Temp_Layout is the one layout in the tree
    // that really is out of range (worst metatile id 924 against a 640 primary
    // and a 230 secondary, under the hns split), so it is what makes the zeroes
    // above mean something.
    expect(renderLayout(proj, "Saffron_Temp_Layout").outOfRangeCount).toBeGreaterThan(0);
  });

  itWithCorpus("includes the border when asked, honouring a 3x2 border", () => {
    // All 7 wide-border layouts in the tree are 3x2, but the height assertion
    // below hardcodes the 2, so pin both dimensions in the search rather than
    // letting a 3x3 layout appear later and fail somewhere confusing.
    const wide = proj.layouts.find((l) => l.borderWidth === 3 && l.borderHeight === 2);
    expect(wide).toBeDefined();
    const plain = renderLayout(proj, wide!.name);
    const bordered = renderLayout(proj, wide!.name, { border: 1 });
    expect(bordered.width).toBe(plain.width + 3 * 2 * 16);
    expect(bordered.height).toBe(plain.height + 2 * 2 * 16);
    // The two assertions above come from padX/padY, not from the border loop
    // itself -- delete the loop body entirely and both still pass. Assert the
    // ring, not the frame: full-frame opacity is not a property of a bordered
    // render (171 of 1,020 layouts are not fully opaque even borderless, e.g.
    // a single stray transparent pixel deep in the map body), so asserting
    // `opaqueCount(bordered) === bordered.width * bordered.height` would only
    // pass because `.find()` happens to return a fully-opaque layout first --
    // coupled to array order exactly the way the comment above warns against,
    // and CherrygroveCity is pinned by name elsewhere in this file to avoid.
    // The delta is immune to whatever transparency the layout's own body
    // already has, and still fails if the border loop body is deleted.
    expect(opaqueCount(bordered) - opaqueCount(plain))
      .toBe(bordered.width * bordered.height - plain.width * plain.height);
  });

  itWithCorpus("blocksOverride renders live in-memory state instead of disk, and the changed block's own pixels reflect it", () => {
    // PetalburgCity_Layout is already pinned above as fully in-range
    // (outOfRangeCount 0), so every id its own blocks array already uses is
    // guaranteed valid for this layout's split -- no need to hand-derive or
    // guess a ceiling, just borrow a real, already-in-use id from elsewhere
    // in the same layout.
    const plain = renderLayout(proj, "PetalburgCity_Layout");
    const original = plain.blocks[0]!;
    const replacement = plain.blocks.find((b) => b.metatileId !== original.metatileId);
    expect(replacement).toBeDefined(); // a real town has more than one metatile id
    const override = plain.blocks.map((b, i) => (i === 0 ? { ...b, metatileId: replacement!.metatileId } : b));

    const overridden = renderLayout(proj, "PetalburgCity_Layout", { blocksOverride: override });

    // Same dimensions -- an override doesn't change the layout's own shape.
    expect(overridden.width).toBe(plain.width);
    expect(overridden.height).toBe(plain.height);

    // The changed block's own 16x16 pixel region (block (0,0), no border so
    // originX/Y are 0) must differ between the two renders.
    const region = (r: typeof plain): number[] => {
      const bytes: number[] = [];
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const i = (y * r.width + x) * 4;
          bytes.push(r.data[i]!, r.data[i + 1]!, r.data[i + 2]!, r.data[i + 3]!);
        }
      }
      return bytes;
    };
    expect(region(overridden)).not.toEqual(region(plain));
  });

  itWithCorpus("refuses a blocksOverride shorter than width x height, naming the override as the source", () => {
    const layout = proj.layoutByName("PetalburgCity_Layout")!;
    const shortOverride = [{ metatileId: 1, collision: 0, elevation: 0 }];
    expect(() => renderLayout(proj, layout.name, { blocksOverride: shortOverride }))
      .toThrow(/the supplied blocksOverride holds 1 blocks but PetalburgCity_Layout declares 30x30 = 900/);
  });

  itWithCorpus("renders every layout in the subject repo, and only one is out of range", () => {
    const failures: string[] = [];
    const outOfRange: string[] = [];
    for (const l of proj.layouts) {
      try {
        if (renderLayout(proj, l.name).outOfRangeCount > 0) outOfRange.push(l.name);
      } catch (e) { failures.push(`${l.name}: ${(e as Error).message}`); }
    }
    expect(failures).toEqual([]);
    // The walk is already paid for, so assert what it found rather than only
    // that nothing threw. This is open-bugs.md #41 across the whole tree, and
    // it is the baseline Task 17's port of check_metatile_range.py has to
    // reproduce independently.
    expect(outOfRange).toEqual(["Saffron_Temp_Layout"]);
  }, 120_000);
});
