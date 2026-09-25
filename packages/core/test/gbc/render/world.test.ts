import { describe, it, expect } from "vitest";
import { openGbcProject } from "../../../src/gbc/project.js";
import { buildGbcWorld } from "../../../src/gbc/world/connections.js";
import { renderGbcMap } from "../../../src/gbc/render/map.js";
import { renderGbcWorld, dedupeDefects } from "../../../src/gbc/render/world.js";
import type { DataDefect } from "../../../src/gbc/model/types.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";

function pixelAt(r: { width: number; data: Uint8ClampedArray }, x: number, y: number): [number, number, number, number] {
  const i = (y * r.width + x) * 4;
  return [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!, r.data[i + 3]!];
}

describe("renderGbcWorld: corpus", () => {
  itWithGbcCorpus("--scale 32: two pixels (one per map) equal renderGbcMap's own pixel at that map's placement", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const world = buildGbcWorld(proj);
    const nbt = world.placements.get("NewBarkTown")!;
    const route29 = world.placements.get("Route29")!;

    // Tight bbox covering exactly these two (adjacent, same row) placements.
    const bbox = { x: route29.x, y: nbt.y, w: (nbt.x + nbt.width) - route29.x, h: nbt.height };
    const world32 = renderGbcWorld(proj, world, { bbox, scale: 32, time: "day" });

    expect(world32.width).toBe(bbox.w * 32);
    expect(world32.height).toBe(bbox.h * 32);
    expect(world32.drawn).toBe(2);

    const nbtOwn = renderGbcMap(proj, "NewBarkTown", { time: "day" });
    const route29Own = renderGbcMap(proj, "Route29", { time: "day" });

    // One pixel well inside NewBarkTown's own render (block (1,1), local
    // pixel (4,4) within that block -- i.e. raw pixel (36,36) of the 32px
    // block grid), mapped into the world raster at
    // ((nbt.x - bbox.x) * 32 + 36, (nbt.y - bbox.y) * 32 + 36).
    const nbtWorldX = (nbt.x - bbox.x) * 32 + 36;
    const nbtWorldY = (nbt.y - bbox.y) * 32 + 36;
    expect(pixelAt(world32, nbtWorldX, nbtWorldY)).toEqual(pixelAt(nbtOwn, 36, 36));

    // Same for a pixel inside Route29's own render.
    const r29WorldX = (route29.x - bbox.x) * 32 + 36;
    const r29WorldY = (route29.y - bbox.y) * 32 + 36;
    expect(pixelAt(world32, r29WorldX, r29WorldY)).toEqual(pixelAt(route29Own, 36, 36));
  });

  itWithGbcCorpus("--scale 8: exact output dimensions, a quarter of the block-grid bbox", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const world = buildGbcWorld(proj);
    const nbt = world.placements.get("NewBarkTown")!;
    const route29 = world.placements.get("Route29")!;
    const bbox = { x: route29.x, y: nbt.y, w: (nbt.x + nbt.width) - route29.x, h: nbt.height };

    const world8 = renderGbcWorld(proj, world, { bbox, scale: 8, time: "day" });
    expect(world8.width).toBe(bbox.w * 8);
    expect(world8.height).toBe(bbox.h * 8);
    expect(world8.drawn).toBe(2);
  });

  itWithGbcCorpus("draws only placements intersecting the bbox -- a bbox tight around one isolated map draws exactly 1, not all 391", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const world = buildGbcWorld(proj);
    // CeruleanCave2F is its own 1-map component (measured, connections.test.ts),
    // so nothing else in the whole packed world can legitimately overlap its
    // exact placement rect.
    const p = world.placements.get("CeruleanCave2F")!;
    const bbox = { x: p.x, y: p.y, w: p.width, h: p.height };

    const r = renderGbcWorld(proj, world, { bbox, scale: 32, time: "day" });
    // If the bbox intersection check were dropped, every one of the 391
    // placements would be visited and counted (`drawn` is incremented
    // unconditionally once inside the loop body) even though `blitScaled`
    // itself clips anything landing outside `dst`'s tiny (9x15-block)
    // bounds -- so `drawn` is the sharp, correct kill for that mutation,
    // not the pixel content.
    expect(r.drawn).toBe(1);

    const own = renderGbcMap(proj, "CeruleanCave2F", { time: "day" });
    expect(r.width).toBe(own.width);
    expect(r.height).toBe(own.height);
    // Fix round 1 (spec review Minor m7): `.equals()` -> a boolean, not
    // `toEqual` on two `Buffer`s -- a FAILING `toEqual` here makes vitest's
    // pretty-format diff hundreds of thousands of bytes, which the spec
    // review measured hanging at 100% CPU for minutes (seen live under
    // mutations M17/M19). A real regression must look like a fast red test,
    // not an indistinguishable-from-a-hang timeout.
    expect(Buffer.from(r.data).equals(Buffer.from(own.data))).toBe(true);
    // CeruleanCave2F's own defect (its oversize .blk, pinned in
    // render/map.test.ts) surfaces through the world render too.
    expect(r.defects).toHaveLength(1);
    expect(r.defects[0]!.file).toBe("maps/CeruleanCave2F.blk");
  });

  /**
   * Fix round 1 (spec review Minor m3): the left/right/top bbox-edge
   * exclusions are each exercised by an existing test's `drawn` count, but
   * nothing pinned the BOTTOM edge (`p.y >= bbox.y + bbox.h`) -- mutating
   * that one comparison from `>=` to `>` survived the whole suite. Route16
   * (58-67 in y) sits directly above Route17 (67-112 in y) with no gap:
   * Route17's top edge (67) exactly equals a bbox ending at y=67, which
   * `>=` must exclude and a mutated `>` would wrongly include.
   */
  itWithGbcCorpus("excludes a placement whose top edge exactly abuts the bbox's bottom edge", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const world = buildGbcWorld(proj);
    const route16 = world.placements.get("Route16")!;
    const route17 = world.placements.get("Route17")!;
    expect(route17.y).toBe(route16.y + route16.height); // abuts exactly, no gap

    const r = renderGbcWorld(proj, world, { bbox: { x: route16.x, y: route16.y, w: route16.width, h: route16.height }, scale: 32 });
    expect(r.drawn).toBe(1);
  });

  itWithGbcCorpus("refuses a non-divisor scale and a non-positive scale, naming --scale", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const world = buildGbcWorld(proj);
    const bbox = { x: 0, y: 0, w: 1, h: 1 };
    expect(() => renderGbcWorld(proj, world, { bbox, scale: 3 })).toThrow(/--scale/);
    expect(() => renderGbcWorld(proj, world, { bbox, scale: 0 })).toThrow(/--scale/);
    expect(() => renderGbcWorld(proj, world, { bbox, scale: -8 })).toThrow(/--scale/);
    expect(() => renderGbcWorld(proj, world, { bbox, scale: 1.5 })).toThrow(/--scale/);
    // Every divisor of 32 is accepted.
    for (const scale of [1, 2, 4, 8, 16, 32]) {
      expect(() => renderGbcWorld(proj, world, { bbox, scale })).not.toThrow();
    }
  });

  // Fix round 1 (spec review Issue 2): retitled from "de-duplicates defects
  // across multiple drawn maps" -- that name promised dedup coverage this
  // test never had. It draws two DIFFERENT isolated maps with two DIFFERENT
  // defects (each names its own .blk), so it passes identically whether or
  // not dedup exists; what it actually proves is that distinct defects from
  // distinct maps both flow through untouched (no defect dropped, no
  // cross-contamination). The real "two identical defects collapse to one"
  // claim is `dedupeDefects`'s own unit test below.
  itWithGbcCorpus("two different drawn maps' two different defects both surface, neither dropped nor duplicated", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const world = buildGbcWorld(proj);
    const a = world.placements.get("CeruleanCave2F")!;
    const b = world.placements.get("CeruleanCaveB1")!;
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x + a.width, b.x + b.width), y1 = Math.max(a.y + a.height, b.y + b.height);
    const r = renderGbcWorld(proj, world, { bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, scale: 8, time: "day" });
    const files = r.defects.map((d) => d.file).sort();
    expect(files).toEqual(["maps/CeruleanCave2F.blk", "maps/CeruleanCaveB1.blk"]);
  });

  /**
   * Fix round 1 (spec review Issue 2): the actual dedup claim ("`defects` is
   * the de-duplicated `DataDefect`s of the maps drawn"), pinned directly
   * against pure data -- two placements' defect lists sharing one BYTE-
   * IDENTICAL `{file, message}` entry collapse to one, with each list's
   * other, distinct entry preserved. No render pipeline needed: `renderGbcWorld`
   * itself just calls this same exported function over the per-placement
   * `raster.defects` lists it collects (`render/world.ts`), so testing the
   * function directly with hand-built data is a strictly stronger and
   * cheaper test than trying to engineer two real corpus maps that happen to
   * share a `.blk` (the real corpus has none -- Decision 3's 2 defective
   * maps each name their own distinct `.blk`).
   */
  it("dedupeDefects collapses byte-identical {file, message} entries across different lists", () => {
    const shared: DataDefect = { file: "maps/Shared.blk", message: "actual size 10 bytes, declared 2x2=4 -- loaded first 4 bytes, not writable" };
    const onlyInFirst: DataDefect = { file: "maps/OnlyA.blk", message: "onlyA defect" };
    const onlyInSecond: DataDefect = { file: "maps/OnlyB.blk", message: "onlyB defect" };
    // A same-file, DIFFERENT-message entry must NOT collapse with `shared` --
    // the key is (file, message) together, not `file` alone.
    const sameFileDifferentMessage: DataDefect = { file: "maps/Shared.blk", message: "a completely different defect" };

    const result = dedupeDefects([
      [shared, onlyInFirst],
      [shared, onlyInSecond, sameFileDifferentMessage],
    ]);

    expect(result).toEqual([shared, onlyInFirst, onlyInSecond, sameFileDifferentMessage]);
  });

  /**
   * Fix round 1 (spec review Minor m1): `result.conflicts` is `world.conflicts`
   * filtered to the maps actually drawn. A bbox covering exactly Route17 and
   * Route18 (measured placements: Route17 (50,67)-(60,112), Route18
   * (60,106)-(70,115); Route16 (50,58)-(60,67) and FuchsiaCity
   * (70,99)-(90,117) both abut this bbox's edges and are correctly excluded)
   * draws exactly the two maps that are each the `.map` of one of the
   * corpus's 2 real conflicts (`world/connections.test.ts`), so both should
   * surface here, in `world.conflicts`' own order and with their exact,
   * pre-pack identities unchanged.
   */
  itWithGbcCorpus("result.conflicts carries exactly the drawn maps' conflicts, by full identity", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const world = buildGbcWorld(proj);
    const route17 = world.placements.get("Route17")!;
    const route18 = world.placements.get("Route18")!;
    const bbox = {
      x: Math.min(route17.x, route18.x),
      y: Math.min(route17.y, route18.y),
      w: Math.max(route17.x + route17.width, route18.x + route18.width) - Math.min(route17.x, route18.x),
      h: Math.max(route17.y + route17.height, route18.y + route18.height) - Math.min(route17.y, route18.y),
    };
    const r = renderGbcWorld(proj, world, { bbox, scale: 32 });
    expect(r.drawn).toBe(2);
    expect(r.conflicts).toEqual([
      { map: "Route18", viaA: { from: "Route17", x: 40, y: 87 }, viaB: { from: "FuchsiaCity", x: 40, y: 88 } },
      { map: "Route17", viaA: { from: "Route18", x: 30, y: 50 }, viaB: { from: "Route16", x: 30, y: 49 } },
    ]);
  });

  itWithGbcCorpus("result.conflicts is empty when no drawn map is in world.conflicts", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const world = buildGbcWorld(proj);
    const nbt = world.placements.get("NewBarkTown")!;
    const r = renderGbcWorld(proj, world, { bbox: { x: nbt.x, y: nbt.y, w: nbt.width, h: nbt.height }, scale: 32 });
    expect(r.drawn).toBe(1);
    expect(r.conflicts).toEqual([]);
  });
});
