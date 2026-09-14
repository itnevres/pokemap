import type { Project } from "../project.js";
import type { Block, Layout } from "../model/types.js";
import type { MapData } from "../load/maps.js";

export interface Refusal { code: string; message: string; fix: string; subject: string; }

/** id-in-range check, split-aware -- the identical predicate
 *  validate/metatileRange.ts's own `bad()` closure computes, extracted here
 *  because guardLayoutSave needs it per-block, not corpus-wide. Kept as a
 *  free function rather than importing metatileRange.ts's own internal
 *  closure (that file computes it inline and does not export it) -- the two
 *  independently agreeing on the same formula is itself a form of coverage
 *  for I1, not duplication to collapse. */
function idOutOfRange(id: number, proj: Project, layout: Layout): boolean {
  const split = proj.splitFor(layout);
  const primaryCount = proj.tileset(layout.primaryTileset).metatileCount;
  const secondaryCount = proj.tileset(layout.secondaryTileset).metatileCount;
  const ceiling = Math.min(split.metatiles + secondaryCount, proj.constants?.metatilesTotal ?? 1024);
  return id < split.metatiles ? id >= primaryCount : id >= ceiling;
}

/**
 * Refusals scoped to one layout's own blockdata: missing layout_version and
 * out-of-range metatile ids (I7), plus an optional border-size check when
 * `border` is supplied (a layout-only edit that never touched border.bin
 * passes `border` as undefined and the check is skipped, not failed).
 */
export function guardLayoutSave(
  proj: Project, layout: Layout, blocks: Block[], border?: Block[],
): Refusal[] {
  const out: Refusal[] = [];

  if (proj.profile.supportsLayoutVersion && !layout.layoutVersion) {
    out.push({
      code: "missing-layout-version",
      message: `${layout.name} has no layout_version, but this engine profile requires one.`,
      fix: "Run `python tools/donors/classify_layout_versions.py --write`, then reopen.",
      subject: layout.name,
    });
  }

  const badIds = new Map<number, number>();
  for (const b of blocks) {
    if (idOutOfRange(b.metatileId, proj, layout)) badIds.set(b.metatileId, (badIds.get(b.metatileId) ?? 0) + 1);
  }
  if (badIds.size > 0) {
    const primaryCount = proj.tileset(layout.primaryTileset).metatileCount;
    const secondaryCount = proj.tileset(layout.secondaryTileset).metatileCount;
    const ids = [...badIds.keys()].sort((a, b) => a - b);
    out.push({
      code: "metatile-out-of-range",
      message: `${layout.name}: metatile id(s) ${ids.join(", ")} are out of range for this layout's split.`,
      fix: `Primary tileset ${layout.primaryTileset} has ${primaryCount} metatiles, secondary ${layout.secondaryTileset} has ${secondaryCount}. Pick an id below the boundary this split actually resolves.`,
      subject: layout.name,
    });
  }

  if (border !== undefined) {
    const expected = layout.borderWidth * layout.borderHeight;
    if (border.length !== expected) {
      out.push({
        code: "border-size-mismatch",
        message: `${layout.name}: border has ${border.length} block(s), expected ${expected}.`,
        fix: `layouts.json declares borderWidth ${layout.borderWidth} x borderHeight ${layout.borderHeight} = ${expected} blocks. Do not change border dimensions from a block edit.`,
        subject: layout.name,
      });
    }
  }

  return out;
}

/**
 * Refusals scoped to one map's own save: today, only the warp-tile-moved
 * check (docs/human-porymap.md's standing rule, made enforced instead of
 * remembered). `prevMap`/`nextMap` let the guard tell "the warp moved with
 * its own block, in this same save" from "the block moved out from under a
 * warp that stayed put" -- only the second is a refusal.
 */
export function guardMapSave(
  _proj: Project, layout: Layout, prevMap: MapData, nextMap: MapData,
  prevBlocks: Block[], nextBlocks: Block[],
): Refusal[] {
  const out: Refusal[] = [];

  for (const warp of prevMap.warpEvents) {
    const stillAtSamePosition = nextMap.warpEvents.some((w) => w.x === warp.x && w.y === warp.y);
    if (!stillAtSamePosition) continue; // the warp itself moved this save -- expected
    const index = warp.y * layout.width + warp.x;
    const before = prevBlocks[index];
    const after = nextBlocks[index];
    if (before && after && (before.metatileId !== after.metatileId)) {
      out.push({
        code: "warp-tile-moved",
        message: `${layout.name}: the block under a warp at (${warp.x},${warp.y}) changed, but the warp (-> ${warp.destMap}) did not move with it.`,
        fix: `Move the warp event to follow the art, or paint elsewhere. Editing art out from under a warp silently unpairs it (docs/human-porymap.md).`,
        subject: layout.name,
      });
    }
  }

  return out;
}
