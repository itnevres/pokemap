import { describe, expect } from "vitest";
import { openGbcProject } from "../../../src/gbc/project.js";
import { buildGbcWorld } from "../../../src/gbc/world/connections.js";
import { renderGbcMap } from "../../../src/gbc/render/map.js";
import { renderGbcWorld } from "../../../src/gbc/render/world.js";
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
    expect(Buffer.from(r.data)).toEqual(Buffer.from(own.data));
    // CeruleanCave2F's own defect (its oversize .blk, pinned in
    // render/map.test.ts) surfaces through the world render too.
    expect(r.defects).toHaveLength(1);
    expect(r.defects[0]!.file).toBe("maps/CeruleanCave2F.blk");
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

  itWithGbcCorpus("de-duplicates defects across multiple drawn maps", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const world = buildGbcWorld(proj);
    const a = world.placements.get("CeruleanCave2F")!;
    const b = world.placements.get("CeruleanCaveB1")!;
    // These are two DIFFERENT isolated maps with two DIFFERENT defects (each
    // names its own .blk) -- this test is about the dedup key being
    // (file, message), not about the same defect appearing twice. Cover both
    // in one bbox spanning their separate placements plus whatever ordinary
    // maps fall between them, and check no defect is reported more than
    // once even though `renderGbcMap` is called once per placement.
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x + a.width, b.x + b.width), y1 = Math.max(a.y + a.height, b.y + b.height);
    const r = renderGbcWorld(proj, world, { bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, scale: 8, time: "day" });
    const files = r.defects.map((d) => d.file).sort();
    expect(files).toEqual(["maps/CeruleanCave2F.blk", "maps/CeruleanCaveB1.blk"]);
  });
});
