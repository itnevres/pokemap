import type { GbcProject } from "../project.js";
import {
  boundsOf,
  layOutComponents,
  type Placement,
  type Bounds,
  type Component,
  type Conflict,
} from "../../world/connections.js";

// Re-exported so a GBC caller never has to reach into the GBA module
// directly to name these types, or to reuse the shelf-pack -- they are
// family-agnostic (map-name strings plus numbers, per the task spec), so
// this is the only place GBC code needs to import them from.
export type { Placement, Bounds, Component, Conflict };
export { boundsOf, layOutComponents };

/**
 * The stitched GBC world: every one of the 391 maps placed in one shared,
 * block-unit coordinate space (1 block = 32 px), built by a direct port of
 * GBA `buildWorld`'s BFS (`../../world/connections.ts`).
 *
 * Two GBA concepts do not apply here and are deliberately absent:
 *  - `verticalLinks` (dive/emerge): `Connection.direction` is `"north" |
 *    "south" | "west" | "east"` only (GBC format findings, "Extra findings"
 *    -> Connections) -- there is no vertical connection kind to filter out
 *    or record, unlike GBA's `ConnectionDirection` which also carries
 *    `"dive" | "emerge"`.
 *  - dungeon auto-layout / the sidecar (`world/warpGraph.ts`,
 *    `world/sidecar.ts`): GBA UI features with no GBC UI in Plan 6 (task
 *    spec, "Out of scope"). `buildGbcWorld` places every map unconditionally,
 *    the same as GBA's `buildWorld` -- an isolated interior becomes its own
 *    1-map component -- and that base set is exactly what `renderGbcWorld`
 *    draws; there is no dungeons-on/off toggle or resolve step on top.
 */
export interface GbcWorld {
  placements: Map<string, Placement>;
  components: Component[];
  conflicts: Conflict[];
}

/**
 * Shelf-pack row target, in blocks. GBA's `layOutComponents` default (512
 * tiles) was chosen so its 3 landmasses (up to 51 maps) land together at the
 * top-left rather than scattering (see that function's own doc comment).
 *
 * Measured against this corpus (task-11-implementer.md's LOD section):
 * `buildGbcWorld` produces exactly 3 multi-map components, not one --
 * Kanto and Johto are NOT joined into a single planar component (the
 * Olivine<->Vermilion ferry is a warp, not a `connection` record, so it
 * plays no part in this BFS). Their pre-pack bounding widths are 140 blocks
 * (Kanto, 35 maps) and 235 blocks (Johto, 31 maps) -- Johto is the widest
 * single component in the whole corpus. `rowTarget` only has to be at least
 * that wide for the shelf-pack to give Johto its own row instead of
 * wrapping mid-landmass (the algorithm never clips a component wider than
 * the target -- an over-wide one just gets a row to itself either way, so a
 * SMALLER target would still render correctly, only less tidily: Kanto
 * would double up with Johto in the row before wrapping). 256 is chosen --
 * enough headroom above the measured 235-block width for the pack to still
 * read as "one big landmass per row" -- rather than reusing GBA's 512 tile
 * value unchanged, since a "tile" and a "block" are different units (16 px
 * vs 32 px) and equating the two raw numbers would be a coincidence, not a
 * reason.
 */
const GBC_ROW_TARGET = 256;

/**
 * Shelf-pack row gap, in blocks. GBA's default is 8 tiles (128 px at 16
 * px/tile). Kept as 8 blocks here too (256 px at 32 px/tile) -- there is no
 * measurement that argues for a different gap; it only has to be visibly
 * bigger than zero so adjacent rows don't look stitched together, and 8
 * already does that at either pixel scale.
 */
const GBC_GAP = 8;

/**
 * Direct port of GBA `buildWorld` (`../../world/connections.ts`)'s BFS, for
 * `GbcMap.connections` instead of `Project`'s. Units are blocks (1 block =
 * 32 px), matching `GbcMap.width`/`height` and `Connection.offset`.
 *
 * Placement rules (GBC format findings, "Extra findings" -> Connections,
 * engine-verified against the `connection` macro in
 * `data/maps/attributes.asm`): a north/south connection's offset shifts the
 * target along **x**; a west/east connection's offset shifts it along **y**
 * -- the reverse of the macro's own source comment, per the findings and
 * `Connection`'s own doc comment (`../model/types.ts`).
 *   west:  target at (x - targetWidth,  y + offset)
 *   east:  target at (x + width,        y + offset)
 *   north: target at (x + offset,       y - targetHeight)
 *   south: target at (x + offset,       y + height)
 *
 * Connections name their target by `targetConst` (I4: join on the real key,
 * never `targetName` -- see this task's own mutation-check item for why the
 * two are not always interchangeable). The const -> map-name index is built
 * ONCE, for the same reason GBA's `idToName` is: resolving inside the BFS
 * with a per-edge scan of all 391 maps would be quadratic for no reason.
 *
 * Refuses (throws, naming the source map and the unresolved const) rather
 * than silently dropping the edge the way GBA's `buildWorld` does for an
 * unknown connection target (GBA's `idToName.get` miss is a documented `continue`,
 * because GBA warp/connection ids can legitimately name a map outside the
 * loaded set, e.g. a cross-game or debug room; GBC's `targetConst` always
 * names another map in the same 391-map set in the real corpus -- measured
 * 0 misses -- so an unresolved one here is a real data problem, not an
 * expected edge case, and should stop the build rather than quietly produce
 * an incomplete world).
 *
 * Conflicts are recorded, never thrown, with `viaB.from` the map that
 * actually placed the target -- the same `Conflict` shape and reasoning as
 * GBA's `buildWorld` (see that function's own doc comment).
 */
export function buildGbcWorld(proj: GbcProject): GbcWorld {
  const placements = new Map<string, Placement>();
  const conflicts: Conflict[] = [];
  const components: Component[] = [];

  // Built once -- see this function's own doc comment.
  const nameByConst = new Map(proj.maps.map((m) => [m.constName, m.name]));

  /** Which map's connection put each placement where it is, for conflict reporting. */
  const placedBy = new Map<string, string>();

  const remaining = new Set(proj.maps.map((m) => m.name));

  while (remaining.size > 0) {
    const seed = [...remaining][0]!;
    const index = components.length;
    const maps: string[] = [];
    const queue: string[] = [seed];

    const seedMap = proj.map(seed);
    placements.set(seed, { map: seed, x: 0, y: 0, width: seedMap.width, height: seedMap.height, component: index });
    remaining.delete(seed);
    maps.push(seed);

    while (queue.length) {
      const name = queue.shift()!;
      const here = placements.get(name)!;

      for (const c of proj.map(name).connections) {
        const target = nameByConst.get(c.targetConst);
        if (!target) {
          throw new Error(`${name}: connection ${c.direction} names unknown target const ${c.targetConst}`);
        }

        const targetMap = proj.map(target);
        const pos =
          c.direction === "west" ? { x: here.x - targetMap.width, y: here.y + c.offset } :
          c.direction === "east" ? { x: here.x + here.width, y: here.y + c.offset } :
          c.direction === "north" ? { x: here.x + c.offset, y: here.y - targetMap.height } :
          { x: here.x + c.offset, y: here.y + here.height };

        const existing = placements.get(target);
        if (existing) {
          if (existing.x !== pos.x || existing.y !== pos.y) {
            conflicts.push({
              map: target,
              viaA: { from: name, x: pos.x, y: pos.y },
              viaB: { from: placedBy.get(target) ?? seed, x: existing.x, y: existing.y },
            });
          }
          continue;
        }

        placedBy.set(target, name);
        placements.set(target, { map: target, x: pos.x, y: pos.y, width: targetMap.width, height: targetMap.height, component: index });
        remaining.delete(target);
        maps.push(target);
        queue.push(target);
      }
    }

    components.push({ index, maps, bounds: boundsOf(maps, placements) });
  }

  layOutComponents(components, placements, { gap: GBC_GAP, rowTarget: GBC_ROW_TARGET });
  return { placements, components, conflicts };
}
