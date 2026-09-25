import type { GbcProject } from "../project.js";
import type { GbcWorld, Conflict } from "../world/connections.js";
import type { DataDefect } from "../model/types.js";
import { renderGbcMap } from "./map.js";
import { createRaster, blitScaled, type Raster } from "../../render/raster.js";

/** A GBC block is always 32x32 px (GBC format findings §3.2/§3.4) -- the one
 *  fixed constant `renderGbcWorld`'s scale validation checks against. */
const BLOCK_PX = 32;

export interface RenderGbcWorldOptions {
  /** Region to render, in BLOCKS (not pixels) -- matches `GbcWorld.placements`'
   *  own coordinate space. */
  bbox: { x: number; y: number; w: number; h: number };
  /** Pixels per block: 32 = full size (1:1 with `renderGbcMap`'s own 32
   *  px/block raster), 8 = overview (CLI default -- a quarter, matching the
   *  GBA CLI's own 4-of-16 quarter default). Must be a positive integer
   *  divisor of `BLOCK_PX` (32), the same "name the flag, refuse rather than
   *  guess" shape as `args.ts`'s `parseScale`/`parseBbox` -- not enforced
   *  there because `parseScale` is shared with the GBA `render-world` path,
   *  whose own unit is a 16px tile, not a 32px block; a divisor-of-16
   *  check there would be wrong for GBC and a divisor-of-32 check would be
   *  wrong for GBA. A non-divisor scale would still "work" through
   *  `blitScaled`'s nearest-neighbour sampling (it takes any positive
   *  fraction), but would sample block interiors at uneven, non-repeating
   *  offsets rather than a clean per-block downsample -- refused here
   *  instead of silently producing a slightly-off render. */
  scale: number;
  time?: "morn" | "day" | "nite";
}

export interface RenderGbcWorldResult extends Raster {
  /** Number of placements intersecting `bbox` that were actually drawn. */
  drawn: number;
  /** De-duplicated `DataDefect`s of every map drawn (by `file` + `message`),
   *  so a `.blk` shared by many identically-broken placements -- unlikely in
   *  practice (each map has its own `.blk` path) but not assumed -- is
   *  reported once, not once per placement. */
  defects: DataDefect[];
  /** The subset of `world.conflicts` whose `.map` was actually drawn (i.e.
   *  its placement intersects `bbox`), in `world.conflicts`' own order.
   *  Fix round 1 (spec review Minor m1): a `Conflict` is real data -- two
   *  connection paths that disagree on where a map belongs -- and when the
   *  disagreeing map lands in the rendered bbox, the visible seam (e.g. a
   *  gatehouse split across two placements a block apart) has no other
   *  explanation without this. `world.conflicts` is filtered here, once,
   *  rather than in the CLI, since "was it drawn" depends on the same bbox
   *  intersection this function already computes -- duplicating that check
   *  at the call site would risk drifting from it. */
  conflicts: Conflict[];
}

/**
 * Merges the per-placement `DataDefect` lists collected while rendering,
 * collapsing entries whose `file` AND `message` both match. Extracted as its
 * own pure function (fix round 1, spec review Issue 2) so the de-dupe rule
 * itself -- not just "two different maps' distinct defects both flow
 * through untouched", which is all the previous single test proved -- can be
 * unit-tested directly with two lists sharing one identical entry, without
 * needing a full render pipeline.
 */
export function dedupeDefects(lists: readonly (readonly DataDefect[])[]): DataDefect[] {
  const seen = new Set<string>();
  const out: DataDefect[] = [];
  for (const list of lists) {
    for (const d of list) {
      const key = `${d.file}\u0000${d.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

/**
 * Renders the bbox-intersecting slice of a stitched `GbcWorld` to one raster
 * (Task 11). Each intersecting placement is rendered borderless
 * (`renderGbcMap(proj, name, { time })`, no `border` -- Task 9's border ring
 * is for a single unstitched map; the whole point of a world render is that
 * neighbours already show through) and blitted at
 * `((p.x - bbox.x) * scale, (p.y - bbox.y) * scale)` via `blitScaled`, whose
 * own `scale` parameter is a source-space FRACTION, not a pixel count --
 * `opts.scale / BLOCK_PX` converts "pixels per block" into that fraction
 * (`opts.scale === BLOCK_PX` gives `blitScaled` a scale of `1`, byte-identical
 * to a plain `blit`, exactly as that function's own doc comment requires).
 *
 * Fix round 1 (quality review Minor #5): at ANY scale, including the
 * overview default (8), each intersecting placement is still rendered by
 * `renderGbcMap` at its full native 32 px/block resolution and only THEN
 * downsampled by `blitScaled`. Scale 8 is cheaper than scale 32 end to end
 * (measured: ~0.63s vs ~1.49s for the full 391-map corpus, task-11-implementer.md's
 * LOD section) purely because `blitScaled`'s own inner loop is O(destination
 * pixels), which shrinks with scale -- NOT because the per-map render cost
 * shrinks; that stays constant regardless of `scale`. A hypothetical
 * "render at reduced detail" path does not exist here.
 */
export function renderGbcWorld(proj: GbcProject, world: GbcWorld, opts: RenderGbcWorldOptions): RenderGbcWorldResult {
  const { bbox, scale, time } = opts;

  if (!Number.isInteger(scale) || scale <= 0 || BLOCK_PX % scale !== 0) {
    throw new Error(`renderGbcWorld: --scale must be a positive integer divisor of ${BLOCK_PX}, got ${scale}`);
  }

  const dst = createRaster(bbox.w * scale, bbox.h * scale);
  let drawn = 0;
  const drawnMaps = new Set<string>();
  const defectLists: DataDefect[][] = [];

  for (const p of world.placements.values()) {
    // Same exclusion shape as GBA's own render-world (`packages/cli/src/index.ts`):
    // strictly outside on any side, not "any pixel overlaps" -- a placement
    // exactly abutting the bbox edge (p.x + p.width === bbox.x) contributes
    // nothing and is excluded, matching `<=`/`>=` below.
    if (p.x + p.width <= bbox.x || p.x >= bbox.x + bbox.w || p.y + p.height <= bbox.y || p.y >= bbox.y + bbox.h) continue;

    const raster = renderGbcMap(proj, p.map, { time });
    blitScaled(dst, raster, (p.x - bbox.x) * scale, (p.y - bbox.y) * scale, scale / BLOCK_PX);
    drawn++;
    drawnMaps.add(p.map);
    defectLists.push(raster.defects);
  }

  const conflicts = world.conflicts.filter((c) => drawnMaps.has(c.map));
  return { ...dst, drawn, defects: dedupeDefects(defectLists), conflicts };
}
