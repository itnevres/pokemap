import type { Project } from "../project.js";
import type { Placement, World } from "./connections.js";

export interface AutoLayoutOptions {
  /** When false, nothing is placed -- the user drags maps on by hand. */
  enabled?: boolean;
  /** Tiles of empty space between packed maps. */
  gap?: number;
  /** Where the dungeon shelf starts, in tiles. */
  originX?: number;
  originY?: number;
}

/**
 * Map names with no planar connection in either direction: own `connections`
 * is empty, and no other map's `connections` targets them. buildWorld still
 * places every one of these -- each becomes its own 1-map component, per its
 * own comment -- so `world.placements.has(n)` is true for every map, always,
 * and cannot tell these apart from a map with real planar neighbours. A
 * component of size 1 is the actual signal.
 *
 * Exported, not inlined into autoLayoutUnplaced, because a future "dungeons
 * off" view needs the same set for the opposite purpose: dropping these
 * names OUT of the base placement list rather than clustering them in.
 */
export function unplacedMapNames(world: World): Set<string> {
  const out = new Set<string>();
  for (const c of world.components) {
    if (c.maps.length === 1) out.add(c.maps[0]!);
  }
  return out;
}

/**
 * A starting guess, not a truth. Warps are not geometrically consistent --
 * two floors linked by a ladder have no defined relative position -- so this
 * groups warp-connected maps into clusters and shelf-packs each cluster. The
 * user drags to correct, and the correction is what persists (see
 * world/sidecar).
 */
export function autoLayoutUnplaced(proj: Project, world: World, opts: AutoLayoutOptions = {}): Map<string, Placement> {
  const out = new Map<string, Placement>();
  if (opts.enabled === false) return out;

  const gap = opts.gap ?? 4;
  const unplacedSet = unplacedMapNames(world);
  if (unplacedSet.size === 0) return out;
  const unplaced = [...unplacedSet];

  const idToName = new Map(proj.mapNames().map((n) => [proj.map(n).id, n]));

  // Union-find over warp links, restricted to unplaced maps.
  const parent = new Map<string, string>(unplaced.map((n) => [n, n]));
  const find = (n: string): string => {
    let r = n;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(n) !== r) { const next = parent.get(n)!; parent.set(n, r); n = next; }
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  for (const n of unplaced) {
    for (const w of proj.map(n).warpEvents) {
      const dest = idToName.get(w.destMap);
      if (dest && unplacedSet.has(dest)) union(n, dest);
    }
  }

  const clusters = new Map<string, string[]>();
  for (const n of unplaced) {
    const r = find(n);
    (clusters.get(r) ?? clusters.set(r, []).get(r)!).push(n);
  }

  const sizeOf = (name: string) => {
    const l = proj.layoutById(proj.map(name).layout);
    // Refuse rather than return a zero-sized map (I7) -- mirrors
    // connections.ts's sizeOf exactly. A silent {0,0} here would also defeat
    // "produces no overlapping placements": a zero-size box can never
    // overlap anything, so the bug would hide behind a passing test rather
    // than tripping one. Untested on the real corpus by construction, same
    // as the sibling (every map's layout id resolves there today).
    if (!l) {
      throw new Error(
        `${proj.paths.mapJson(name)} names layout ${proj.map(name).layout}, which is not an id in ${proj.paths.layoutsJson}.`,
      );
    }
    return { width: l.width, height: l.height };
  };

  // Shelf-pack: clusters left to right, maps within a cluster in rows.
  const worldBottom = Math.max(0, ...world.components.map((c) => c.bounds.y + c.bounds.height));
  let shelfX = opts.originX ?? 0;
  const shelfY = opts.originY ?? worldBottom + 32;
  let componentIndex = world.components.length;

  for (const maps of clusters.values()) {
    const sorted = [...maps].sort((a, b) => sizeOf(b).height - sizeOf(a).height);
    const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
    let x = shelfX, y = shelfY, rowHeight = 0, col = 0, clusterWidth = 0;

    for (const name of sorted) {
      const size = sizeOf(name);
      out.set(name, { map: name, x, y, ...size, component: componentIndex });
      x += size.width + gap;
      rowHeight = Math.max(rowHeight, size.height);
      clusterWidth = Math.max(clusterWidth, x - shelfX);
      if (++col >= columns) { col = 0; x = shelfX; y += rowHeight + gap; rowHeight = 0; }
    }

    shelfX += clusterWidth + gap * 4;
    componentIndex++;
  }

  return out;
}
