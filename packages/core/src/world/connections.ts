import type { Project } from "../project.js";
import type { ConnectionDirection } from "../load/maps.js";

export interface Placement { map: string; x: number; y: number; width: number; height: number; component: number; }
export interface Bounds { x: number; y: number; width: number; height: number; }
export interface Component { index: number; maps: string[]; bounds: Bounds; }
export interface VerticalLink { from: string; to: string; direction: "dive" | "emerge"; }
export interface Conflict { map: string; viaA: { from: string; x: number; y: number }; viaB: { from: string; x: number; y: number }; }

export interface World {
  placements: Map<string, Placement>;
  components: Component[];
  verticalLinks: VerticalLink[];
  conflicts: Conflict[];
}

const PLANAR = new Set<ConnectionDirection>(["up", "down", "left", "right"]);

/**
 * Breadth-first over the planar connection graph.
 *
 * offset is in tiles, along the shared edge:
 *   left  -> neighbour sits at (x - nWidth,  y + offset)
 *   right -> neighbour sits at (x + width,   y + offset)
 *   up    -> neighbour sits at (x + offset,  y - nHeight)
 *   down  -> neighbour sits at (x + offset,  y + height)
 *
 * dive/emerge are vertical and have no planar meaning; they are recorded
 * separately so the UI can badge them.
 */
export function buildWorld(proj: Project): World {
  const placements = new Map<string, Placement>();
  const verticalLinks: VerticalLink[] = [];
  const conflicts: Conflict[] = [];
  const components: Component[] = [];

  const sizeOf = (name: string) => {
    const l = proj.layoutById(proj.map(name).layout);
    // Refuse rather than return a zero-sized map (I7). A silent {0,0} would
    // place a neighbour exactly on top of its origin and be reported as a
    // coordinate conflict somewhere else entirely, which is the worst kind of
    // bug to chase. Measured: 0 of 1,209 maps hit this today.
    if (!l) {
      throw new Error(
        `${proj.paths.mapJson(name)} names layout ${proj.map(name).layout}, which is not an id in ${proj.paths.layoutsJson}.`,
      );
    }
    return { width: l.width, height: l.height };
  };

  // Built ONCE. Connections name their target by map id, and resolving that
  // with `mapNames().find(...)` inside the BFS below would rescan all 1,209
  // maps per connection edge -- quadratic for no reason. warpGraph.ts already
  // does it this way; this keeps the two consistent.
  const idToName = new Map(proj.mapNames().map((n) => [proj.map(n).id, n]));

  /** Which map's connection put each placement where it is, for conflict reporting. */
  const placedBy = new Map<string, string>();

  const remaining = new Set(proj.mapNames());

  while (remaining.size > 0) {
    const seed = [...remaining][0]!;
    const index = components.length;
    const maps: string[] = [];
    const queue: string[] = [seed];

    const seedSize = sizeOf(seed);
    placements.set(seed, { map: seed, x: 0, y: 0, ...seedSize, component: index });
    remaining.delete(seed);
    maps.push(seed);

    while (queue.length) {
      const name = queue.shift()!;
      const here = placements.get(name)!;

      for (const c of proj.map(name).connections) {
        const target = idToName.get(c.map);
        if (!target) continue;

        if (!PLANAR.has(c.direction)) {
          verticalLinks.push({ from: name, to: target, direction: c.direction as "dive" | "emerge" });
          continue;
        }

        const size = sizeOf(target);
        const pos =
          c.direction === "left" ? { x: here.x - size.width, y: here.y + c.offset } :
          c.direction === "right" ? { x: here.x + here.width, y: here.y + c.offset } :
          c.direction === "up" ? { x: here.x + c.offset, y: here.y - size.height } :
          { x: here.x + c.offset, y: here.y + here.height };

        const existing = placements.get(target);
        if (existing) {
          if (existing.x !== pos.x || existing.y !== pos.y) {
            conflicts.push({
              map: target,
              viaA: { from: name, x: pos.x, y: pos.y },
              // The map that actually placed it, not the string
              // "(already placed)". A conflict you cannot trace to both of its
              // causes is most of the way to useless, and the test asserts
              // `viaB.from` is a string, which that literal satisfied without
              // meaning anything.
              viaB: { from: placedBy.get(target) ?? seed, x: existing.x, y: existing.y },
            });
          }
          continue;
        }

        placedBy.set(target, name);
        placements.set(target, { map: target, ...pos, ...size, component: index });
        remaining.delete(target);
        maps.push(target);
        queue.push(target);
      }
    }

    components.push({ index, maps, bounds: boundsOf(maps, placements) });
  }

  layOutComponents(components, placements);
  return { placements, components, verticalLinks, conflicts };
}

export function boundsOf(maps: string[], placements: Map<string, Placement>): Bounds {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of maps) {
    const p = placements.get(m)!;
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + p.width); y1 = Math.max(y1, p.y + p.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Shelf-pack components into rows so no two overlap.
 *
 * An earlier draft advanced only `cursorX` and never wrapped, which put all
 * **1,045** components in a single row -- the three landmasses and 1,028
 * single-map interiors strung out in one strip tens of thousands of tiles
 * wide. That satisfies "no two overlap" and is unusable as a world: Task 25
 * has to render it, and Task 23 places the loose rooms within it.
 *
 * Big components first, so the three landmasses land together at the top left
 * rather than being scattered between interiors. Row width is a target, not a
 * cap -- a component wider than the target still gets its own row rather than
 * being clipped.
 *
 * `opts` (Task 11): exported and given an optional `{ gap, rowTarget }` so
 * `packages/core/src/gbc/world/connections.ts` can reuse this exact
 * shelf-pack in block units instead of duplicating it, while its defaults
 * (8, 512) are kept identical to what this function always used, so GBA's own
 * behaviour is byte-identical when called with no `opts` -- the only two
 * permitted edits to this GBA file (Task 11 spec) are this export plus this
 * optional, default-preserving parameter.
 */
export function layOutComponents(
  components: Component[],
  placements: Map<string, Placement>,
  opts: { gap?: number; rowTarget?: number } = {},
): void {
  const GAP = opts.gap ?? 8;
  const ROW_TARGET = opts.rowTarget ?? 512; // tiles; ~8k px at 16px/tile

  const order = [...components].sort((a, b) => b.maps.length - a.maps.length);

  let cursorX = 0, rowY = 0, rowHeight = 0;
  for (const c of order) {
    if (cursorX > 0 && cursorX + c.bounds.width > ROW_TARGET) {
      cursorX = 0;
      rowY += rowHeight + GAP;
      rowHeight = 0;
    }
    const dx = cursorX - c.bounds.x;
    const dy = rowY - c.bounds.y;
    for (const m of c.maps) {
      const p = placements.get(m)!;
      p.x += dx;
      p.y += dy;
    }
    c.bounds.x += dx;
    c.bounds.y += dy;
    cursorX += c.bounds.width + GAP;
    rowHeight = Math.max(rowHeight, c.bounds.height);
  }
}
